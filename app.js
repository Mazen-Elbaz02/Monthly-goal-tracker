(() => {
  "use strict";

  const DB_NAME = "HabitTrackerDB";
  const DB_VERSION = 1;
  const STORES = {
    habits: "habits",
    entries: "entries",
    notes: "notes",
    settings: "settings"
  };

  const state = {
    habits: [],
    selectedDate: todayKey(),
    dashboardMonth: monthKey(new Date()),
    activeView: "daily"
  };

  let db;
  let toastTimer;

  const $ = id => document.getElementById(id);

  function pad(n) { return String(n).padStart(2, "0"); }
  function todayKey() {
    const d = new Date();
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  }
  function monthKey(d) { return `${d.getFullYear()}-${pad(d.getMonth()+1)}`; }
  function dateFromKey(key) {
    const [y,m,d] = key.split("-").map(Number);
    return new Date(y, m-1, d);
  }
  function monthFromKey(key) {
    const [y,m] = key.split("-").map(Number);
    return new Date(y, m-1, 1);
  }
  function dateKey(d) {
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  }
  function shiftDate(key, delta) {
    const d = dateFromKey(key);
    d.setDate(d.getDate()+delta);
    return dateKey(d);
  }
  function shiftMonth(key, delta) {
    const d = monthFromKey(key);
    d.setMonth(d.getMonth()+delta);
    return monthKey(d);
  }
  function daysInMonth(key) {
    const d = monthFromKey(key);
    return new Date(d.getFullYear(), d.getMonth()+1, 0).getDate();
  }
  function formatPrettyDate(key) {
    return dateFromKey(key).toLocaleDateString(undefined, {
      weekday:"long", month:"short", day:"numeric"
    });
  }
  function formatMonth(key) {
    return monthFromKey(key).toLocaleDateString(undefined, {
      month:"long", year:"numeric"
    });
  }
  function uid() {
    return (crypto.randomUUID ? crypto.randomUUID() :
      `h-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  }

  function openDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = event => {
        const database = event.target.result;
        if (!database.objectStoreNames.contains(STORES.habits)) {
          database.createObjectStore(STORES.habits, { keyPath: "id" });
        }
        if (!database.objectStoreNames.contains(STORES.entries)) {
          database.createObjectStore(STORES.entries, { keyPath: "date" });
        }
        if (!database.objectStoreNames.contains(STORES.notes)) {
          database.createObjectStore(STORES.notes, { keyPath: "month" });
        }
        if (!database.objectStoreNames.contains(STORES.settings)) {
          database.createObjectStore(STORES.settings, { keyPath: "key" });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  function tx(store, mode="readonly") {
    return db.transaction(store, mode).objectStore(store);
  }

  function getAll(store) {
    return new Promise((resolve, reject) => {
      const req = tx(store).getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  function getOne(store, key) {
    return new Promise((resolve, reject) => {
      const req = tx(store).get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  function putOne(store, value) {
    return new Promise((resolve, reject) => {
      const req = tx(store, "readwrite").put(value);
      req.onsuccess = () => resolve(value);
      req.onerror = () => reject(req.error);
    });
  }

  function deleteOne(store, key) {
    return new Promise((resolve, reject) => {
      const req = tx(store, "readwrite").delete(key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async function seedIfEmpty() {
    const habits = await getAll(STORES.habits);
    if (habits.length) return;

    const created = todayKey();
    const defaults = [
      {name:"5 Prayers",type:"number",goalType:"daily_min",goalValue:5,unit:"/5",includeInScore:true},
      {name:"Morning routine",type:"checkbox",goalType:"percent_days",goalValue:90,unit:"",includeInScore:true},
      {name:"٥ صفح قرءان",type:"checkbox",goalType:"percent_days",goalValue:90,unit:"",includeInScore:true},
      {name:">5L water",type:"checkbox",goalType:"percent_days",goalValue:80,unit:"",includeInScore:true},
      {name:"Exercise",type:"checkbox",goalType:"days_per_month",goalValue:20,unit:"",includeInScore:true},
      {name:"Diet",type:"checkbox",goalType:"percent_days",goalValue:85,unit:"",includeInScore:true},
      {name:"8 hrs sleep",type:"number",goalType:"daily_min",goalValue:8,unit:"hrs",includeInScore:true},
      {name:"Weight",type:"number",goalType:"tracking_only",goalValue:null,unit:"kg",includeInScore:false},
      {name:"Medura",type:"checkbox",goalType:"percent_days",goalValue:80,unit:"",includeInScore:true},
      {name:"Courses",type:"checkbox",goalType:"percent_days",goalValue:80,unit:"",includeInScore:true},
      {name:">15 min medical",type:"checkbox",goalType:"percent_days",goalValue:80,unit:"",includeInScore:true},
      {name:"Procrastination",type:"checkbox",goalType:"percent_days",goalValue:80,unit:"",includeInScore:true}
    ];

    for (const h of defaults) {
      await putOne(STORES.habits, {
        id: uid(),
        ...h,
        active: true,
        createdDate: created,
        archivedDate: null,
        sortOrder: defaults.indexOf(h)
      });
    }
  }

  function goalOptions(type) {
    if (type === "checkbox") {
      return [
        ["days_per_month","Days per month"],
        ["percent_days","% of days"]
      ];
    }
    return [
      ["daily_min","Daily minimum"],
      ["daily_max","Daily maximum"],
      ["daily_exact","Exact daily target"],
      ["target_value","Target value"],
      ["tracking_only","Tracking only"]
    ];
  }

  function goalDescription(habit) {
    const v = habit.goalValue;
    if (habit.goalType === "days_per_month") return `${v || 0} days/month`;
    if (habit.goalType === "percent_days") return `${v || 0}% of days`;
    if (habit.goalType === "daily_min") return `≥ ${v ?? "—"} ${habit.unit || ""}`.trim();
    if (habit.goalType === "daily_max") return `≤ ${v ?? "—"} ${habit.unit || ""}`.trim();
    if (habit.goalType === "daily_exact") return `= ${v ?? "—"} ${habit.unit || ""}`.trim();
    if (habit.goalType === "target_value") return `Target ${v ?? "—"} ${habit.unit || ""}`.trim();
    return "Tracking only";
  }

  function isHabitApplicableOn(habit, key) {
    if (key < habit.createdDate) return false;
    if (habit.archivedDate && key >= habit.archivedDate) return false;
    return true;
  }

  function isSuccess(habit, value) {
    if (habit.type === "checkbox") return value === true;
    if (value === "" || value === null || value === undefined) return false;
    const n = Number(value);
    if (!Number.isFinite(n)) return false;
    if (habit.goalType === "daily_min") return n >= Number(habit.goalValue);
    if (habit.goalType === "daily_max") return n <= Number(habit.goalValue);
    if (habit.goalType === "daily_exact") return n === Number(habit.goalValue);
    if (habit.goalType === "target_value") return false;
    return false;
  }

  function scoreFraction(habit, value) {
    if (!habit.includeInScore) return null;
    if (habit.type === "checkbox") return value === true ? 1 : 0;
    if (value === "" || value === null || value === undefined) return 0;
    const n = Number(value);
    if (!Number.isFinite(n)) return 0;
    const g = Number(habit.goalValue);

    if (habit.goalType === "daily_min") {
      if (!Number.isFinite(g) || g <= 0) return 0;
      return Math.max(0, Math.min(1, n / g));
    }
    if (habit.goalType === "daily_max") return n <= g ? 1 : 0;
    if (habit.goalType === "daily_exact") return n === g ? 1 : 0;
    return null;
  }

  async function getEntry(key) {
    const entry = await getOne(STORES.entries, key);
    return entry || { date:key, values:{} };
  }

  async function saveEntry(key, values) {
    return putOne(STORES.entries, {
      date:key,
      values,
      updatedAt:new Date().toISOString()
    });
  }

  async function refreshState() {
    state.habits = (await getAll(STORES.habits)).sort((a,b)=>(a.sortOrder||0)-(b.sortOrder||0));
  }

  function activeHabitsForDate(key) {
    return state.habits.filter(h => isHabitApplicableOn(h, key));
  }

  function toast(message) {
    const el = $("toast");
    el.textContent = message;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 2200);
  }

  function setView(view) {
    state.activeView = view;
    document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
    document.querySelectorAll(".nav-btn").forEach(v => v.classList.remove("active"));
    $(`view-${view}`).classList.add("active");
    document.querySelector(`.nav-btn[data-view="${view}"]`).classList.add("active");
    $("pageTitle").textContent = {
      daily:"Daily",
      dashboard:"Dashboard",
      habits:"Habits",
      settings:"Settings"
    }[view];

    if (view === "daily") renderDaily();
    if (view === "dashboard") renderDashboard();
    if (view === "habits") renderHabitManager();
  }

  async function renderDaily() {
    $("todayLabel").textContent = formatPrettyDate(state.selectedDate);
    $("dailyDate").value = state.selectedDate;

    const habits = activeHabitsForDate(state.selectedDate).filter(h => h.active || !h.archivedDate);
    const entry = await getEntry(state.selectedDate);
    const root = $("dailyHabits");
    root.innerHTML = "";

    habits.forEach(h => {
      const value = entry.values[h.id];
      const card = document.createElement("div");

      if (h.type === "checkbox") {
        card.className = "habit-entry" + (value === true ? " checked" : "");
        card.innerHTML = `
          <div class="habit-copy">
            <strong dir="auto"></strong>
            <small>${escapeHtml(goalDescription(h))}</small>
          </div>
          <input class="toggle" type="checkbox" data-habit-id="${h.id}" ${value === true ? "checked" : ""}>
        `;
        card.querySelector("strong").textContent = h.name;
        card.querySelector("input").addEventListener("change", e => {
          card.classList.toggle("checked", e.target.checked);
          updateDailySummary();
        });
      } else {
        card.className = "habit-entry number-entry";
        card.innerHTML = `
          <div class="habit-copy">
            <strong dir="auto"></strong>
            <small>${escapeHtml(goalDescription(h))}</small>
          </div>
          <input type="number" step="0.1" inputmode="decimal" data-habit-id="${h.id}" value="${value ?? ""}" placeholder="${escapeHtml(h.unit || "value")}">
        `;
        card.querySelector("strong").textContent = h.name;
        card.querySelector("input").addEventListener("input", updateDailySummary);
      }
      root.appendChild(card);
    });

    updateDailySummary();
  }

  function collectDailyValues() {
    const values = {};
    document.querySelectorAll("#dailyHabits [data-habit-id]").forEach(input => {
      const id = input.dataset.habitId;
      values[id] = input.type === "checkbox" ? input.checked : input.value.trim();
    });
    return values;
  }

  function updateDailySummary() {
    const habits = activeHabitsForDate(state.selectedDate).filter(h => h.includeInScore);
    const values = collectDailyValues();
    let total = 0;
    let scored = 0;
    let complete = 0;

    habits.forEach(h => {
      const fraction = scoreFraction(h, values[h.id]);
      if (fraction === null) return;
      total += fraction;
      scored++;
      if (fraction >= 1) complete++;
    });

    const pct = scored ? Math.round(total/scored*100) : 0;
    $("dailySummary").innerHTML = `
      <div class="summary-chip"><strong>${pct}%</strong><span>Completion</span></div>
      <div class="summary-chip"><strong>${complete}</strong><span>Goals hit</span></div>
      <div class="summary-chip"><strong>${scored}</strong><span>Scored habits</span></div>
    `;
  }

  async function onSaveDay() {
    const values = collectDailyValues();
    await saveEntry(state.selectedDate, values);
    toast("Day saved");
    if (state.activeView === "dashboard") renderDashboard();
  }

  async function renderDashboard() {
    $("todayLabel").textContent = formatMonth(state.dashboardMonth);
    $("dashboardMonth").value = state.dashboardMonth;

    const note = await getOne(STORES.notes, state.dashboardMonth);
    $("monthNote").value = note?.text || "";

    const allEntries = await getAll(STORES.entries);
    const entryMap = new Map(allEntries.map(e => [e.date, e]));
    const today = todayKey();
    const totalDays = daysInMonth(state.dashboardMonth);
    const currentMonth = monthKey(new Date());
    const monthDate = monthFromKey(state.dashboardMonth);

    let elapsed = totalDays;
    if (state.dashboardMonth > currentMonth) elapsed = 0;
    if (state.dashboardMonth === currentMonth) elapsed = new Date().getDate();

    let perfectDays = 0;
    let scoreSum = 0;
    let scoreDays = 0;
    const heat = [];

    for (let day = 1; day <= totalDays; day++) {
      const key = `${state.dashboardMonth}-${pad(day)}`;
      const applicable = state.habits.filter(h => isHabitApplicableOn(h, key) && h.includeInScore);
      if (day > elapsed || applicable.length === 0) {
        heat.push({day,key,score:null});
        continue;
      }

      const values = entryMap.get(key)?.values || {};
      let sum = 0;
      let count = 0;

      applicable.forEach(h => {
        const f = scoreFraction(h, values[h.id]);
        if (f === null) return;
        sum += f;
        count++;
      });

      const pct = count ? Math.round(sum/count*100) : 0;
      if (pct === 100) perfectDays++;
      scoreSum += pct;
      scoreDays++;
      heat.push({day,key,score:pct});
    }

    const overall = scoreDays ? Math.round(scoreSum/scoreDays) : 0;
    $("kpis").innerHTML = `
      <div class="kpi"><strong>${overall}%</strong><span>Month completion</span></div>
      <div class="kpi"><strong>${perfectDays}</strong><span>Perfect days</span></div>
      <div class="kpi"><strong>${elapsed}/${totalDays}</strong><span>Days elapsed</span></div>
    `;

    renderHeatmap(heat);
    await renderHabitPerformance(entryMap, elapsed);
  }

  function renderHeatmap(days) {
    const root = $("heatmap");
    root.innerHTML = "";
    days.forEach(d => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "heatday";
      btn.textContent = d.day;

      if (d.score === null) {
        btn.classList.add("future");
        btn.disabled = true;
      } else {
        btn.classList.add(d.score >= 85 ? "s4" : d.score >= 60 ? "s3" : d.score >= 30 ? "s2" : "s1");
        btn.title = `${d.score}%`;
        btn.addEventListener("click", () => {
          state.selectedDate = d.key;
          setView("daily");
        });
      }
      root.appendChild(btn);
    });
  }

  async function renderHabitPerformance(entryMap, elapsed) {
    const root = $("habitPerformance");
    root.innerHTML = "";
    const monthStart = `${state.dashboardMonth}-01`;
    const monthEnd = `${state.dashboardMonth}-${pad(daysInMonth(state.dashboardMonth))}`;

    for (const h of state.habits) {
      const applicableInMonth = [];
      const numericValues = [];
      let successDays = 0;

      for (let day = 1; day <= elapsed; day++) {
        const key = `${state.dashboardMonth}-${pad(day)}`;
        if (!isHabitApplicableOn(h, key)) continue;
        applicableInMonth.push(key);
        const v = entryMap.get(key)?.values?.[h.id];

        if (h.type === "number" && v !== "" && v !== undefined && v !== null && Number.isFinite(Number(v))) {
          numericValues.push(Number(v));
        }
        if (isSuccess(h, v)) successDays++;
      }

      const monthlyPct = applicableInMonth.length ? Math.round(successDays/applicableInMonth.length*100) : 0;
      const streak = await calculateLifetimeStreak(h, entryMap);

      const card = document.createElement("div");
      card.className = "perf-card";

      let metricLine = "";
      if (h.type === "number" && numericValues.length) {
        const avg = (numericValues.reduce((a,b)=>a+b,0)/numericValues.length).toFixed(1);
        metricLine = statRow("Average", `${avg} ${h.unit || ""}`.trim());
      } else if (h.type === "checkbox") {
        metricLine = statRow("This month", `${successDays}/${applicableInMonth.length || 0} days`);
      }

      const progressValue = h.goalType === "target_value" || h.goalType === "tracking_only" ? 0 : monthlyPct;
      const badge = h.goalType === "target_value" || h.goalType === "tracking_only"
        ? escapeHtml(goalDescription(h))
        : `${monthlyPct}%`;

      card.innerHTML = `
        <div class="perf-top">
          <div>
            <strong dir="auto">${escapeHtml(h.name)}</strong>
            <div class="muted small">${escapeHtml(goalDescription(h))}</div>
          </div>
          <span class="badge">${badge}</span>
        </div>
        ${h.goalType === "target_value" || h.goalType === "tracking_only" ? "" :
          `<div class="progress"><span style="width:${Math.max(0,Math.min(100,progressValue))}%"></span></div>`}
        ${metricLine}
        ${statRow("Current streak", `🔥 ${streak.current} days`)}
        ${statRow("Best streak", `🏆 ${streak.best} days`)}
      `;

      if (h.goalType === "target_value" && numericValues.length) {
        const latest = numericValues[numericValues.length-1];
        card.innerHTML += statRow("Latest", `${latest} ${h.unit || ""}`.trim());
      }

      root.appendChild(card);
    }
  }

  function statRow(label, value) {
    return `<div class="stat-row"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
  }

  async function calculateLifetimeStreak(habit, entryMap) {
    const today = dateFromKey(todayKey());
    const created = dateFromKey(habit.createdDate);
    const archived = habit.archivedDate ? dateFromKey(habit.archivedDate) : null;
    const end = archived && archived <= today ? new Date(archived.getTime()-86400000) : today;

    if (created > end || ["target_value","tracking_only"].includes(habit.goalType)) {
      return {current:0,best:0};
    }

    let best = 0, running = 0;
    const flags = [];

    for (let d = new Date(created); d <= end; d.setDate(d.getDate()+1)) {
      const key = dateKey(d);
      const v = entryMap.get(key)?.values?.[habit.id];
      const success = isSuccess(habit, v);
      flags.push({key,success,hasValue:v !== undefined && v !== null && v !== ""});
      if (success) {
        running++;
        best = Math.max(best, running);
      } else {
        running = 0;
      }
    }

    let current = 0;
    let i = flags.length - 1;

    // If today has no entry yet, don't punish the streak until the day is over.
    if (i >= 0 && flags[i].key === todayKey() && !flags[i].hasValue) i--;

    for (; i >= 0; i--) {
      if (flags[i].success) current++;
      else break;
    }

    return {current,best};
  }

  function populateGoalTypes() {
    const type = $("habitType").value;
    const select = $("habitGoalType");
    const current = select.value;
    select.innerHTML = "";

    goalOptions(type).forEach(([value,label]) => {
      const opt = document.createElement("option");
      opt.value = value;
      opt.textContent = label;
      select.appendChild(opt);
    });

    if ([...select.options].some(o => o.value === current)) select.value = current;
    toggleHabitFormFields();
  }

  function toggleHabitFormFields() {
    const goalType = $("habitGoalType").value;
    const tracking = goalType === "tracking_only";
    $("goalValueWrap").classList.toggle("hidden", tracking);
    $("unitWrap").classList.toggle("hidden", $("habitType").value !== "number");
  }

  async function saveHabitFromForm(event) {
    event.preventDefault();

    const id = $("editHabitId").value || uid();
    const existing = state.habits.find(h => h.id === id);
    const type = $("habitType").value;
    const goalType = $("habitGoalType").value;
    const rawGoal = $("habitGoalValue").value.trim();
    const goalValue = goalType === "tracking_only" ? null : (rawGoal === "" ? null : Number(rawGoal));

    if (!goalType) return toast("Choose a goal type");
    if (goalType !== "tracking_only" && (goalValue === null || !Number.isFinite(goalValue))) {
      return toast("Enter a valid goal");
    }

    const habit = {
      id,
      name: $("habitName").value.trim(),
      type,
      goalType,
      goalValue,
      unit: type === "number" ? $("habitUnit").value.trim() : "",
      includeInScore: $("habitIncludeScore").checked,
      active: existing ? existing.active : true,
      createdDate: existing ? existing.createdDate : todayKey(),
      archivedDate: existing ? existing.archivedDate : null,
      sortOrder: existing ? existing.sortOrder : state.habits.length
    };

    if (!habit.name) return toast("Enter a habit name");

    await putOne(STORES.habits, habit);
    await refreshState();
    resetHabitForm();
    renderHabitManager();
    toast(existing ? "Habit updated" : "Habit added");
  }

  function resetHabitForm() {
    $("habitForm").reset();
    $("editHabitId").value = "";
    $("habitType").value = "checkbox";
    $("habitIncludeScore").checked = true;
    $("habitFormTitle").textContent = "Add habit";
    $("cancelEditBtn").classList.add("hidden");
    populateGoalTypes();
  }

  function startEditHabit(habit) {
    $("editHabitId").value = habit.id;
    $("habitName").value = habit.name;
    $("habitType").value = habit.type;
    populateGoalTypes();
    $("habitGoalType").value = habit.goalType;
    $("habitGoalValue").value = habit.goalValue ?? "";
    $("habitUnit").value = habit.unit || "";
    $("habitIncludeScore").checked = !!habit.includeInScore;
    $("habitFormTitle").textContent = "Edit habit";
    $("cancelEditBtn").classList.remove("hidden");
    toggleHabitFormFields();
    window.scrollTo({top:0,behavior:"smooth"});
  }

  async function toggleArchiveHabit(habit) {
    const updated = {...habit};
    if (habit.active) {
      updated.active = false;
      updated.archivedDate = todayKey();
    } else {
      updated.active = true;
      updated.archivedDate = null;
    }
    await putOne(STORES.habits, updated);
    await refreshState();
    renderHabitManager();
    toast(updated.active ? "Habit restored" : "Habit archived");
  }

  function renderHabitManager() {
    const root = $("habitList");
    root.innerHTML = "";

    state.habits.forEach(h => {
      const card = document.createElement("div");
      card.className = "habit-manage" + (h.active ? "" : " archived");
      card.innerHTML = `
        <div class="habit-copy">
          <strong dir="auto">${escapeHtml(h.name)}</strong>
          <small>${escapeHtml(h.type === "checkbox" ? "Checkbox" : `Number${h.unit ? ` · ${h.unit}` : ""}`)} · ${escapeHtml(goalDescription(h))}</small>
        </div>
        <div class="manage-actions">
          <button class="mini-action edit" type="button" aria-label="Edit">✎</button>
          <button class="mini-action archive" type="button" aria-label="${h.active ? "Archive" : "Restore"}">${h.active ? "−" : "↺"}</button>
        </div>
      `;
      card.querySelector(".edit").addEventListener("click", () => startEditHabit(h));
      card.querySelector(".archive").addEventListener("click", () => toggleArchiveHabit(h));
      root.appendChild(card);
    });
  }

  async function saveMonthNote() {
    await putOne(STORES.notes, {
      month: state.dashboardMonth,
      text: $("monthNote").value.trim(),
      updatedAt: new Date().toISOString()
    });
    toast("Monthly goals saved");
  }

  async function exportBackup() {
    const data = {
      version: 1,
      exportedAt: new Date().toISOString(),
      habits: await getAll(STORES.habits),
      entries: await getAll(STORES.entries),
      notes: await getAll(STORES.notes),
      settings: await getAll(STORES.settings)
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], {type:"application/json"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `habit-tracker-backup-${todayKey()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

    await putOne(STORES.settings, {key:"lastBackup", value:new Date().toISOString()});
    renderBackupStatus();
    toast("Backup exported");
  }

  async function importBackup(file) {
    const text = await file.text();
    const data = JSON.parse(text);
    if (!data || !Array.isArray(data.habits) || !Array.isArray(data.entries)) {
      throw new Error("This does not look like a valid Habit Tracker backup.");
    }

    const stores = [STORES.habits, STORES.entries, STORES.notes, STORES.settings];
    for (const store of stores) {
      await new Promise((resolve,reject) => {
        const objectStore = tx(store,"readwrite");
        const req = objectStore.clear();
        req.onsuccess = resolve;
        req.onerror = () => reject(req.error);
      });
    }

    for (const h of data.habits || []) await putOne(STORES.habits, h);
    for (const e of data.entries || []) await putOne(STORES.entries, e);
    for (const n of data.notes || []) await putOne(STORES.notes, n);
    for (const s of data.settings || []) await putOne(STORES.settings, s);

    await refreshState();
    await renderDaily();
    await renderDashboard();
    renderHabitManager();
    renderBackupStatus();
    toast("Backup restored");
  }

  async function renderBackupStatus() {
    const last = await getOne(STORES.settings, "lastBackup");
    $("backupStatus").textContent = last?.value
      ? `Last backup: ${new Date(last.value).toLocaleString()}`
      : "No backup recorded yet.";
  }

  function openInstallModal() {
    $("modalBackdrop").classList.remove("hidden");
  }

  function closeInstallModal() {
    $("modalBackdrop").classList.add("hidden");
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g,"&amp;")
      .replace(/</g,"&lt;")
      .replace(/>/g,"&gt;")
      .replace(/"/g,"&quot;")
      .replace(/'/g,"&#039;");
  }

  function bindEvents() {
    document.querySelectorAll(".nav-btn").forEach(btn => {
      btn.addEventListener("click", () => setView(btn.dataset.view));
    });

    $("prevDayBtn").addEventListener("click", () => {
      state.selectedDate = shiftDate(state.selectedDate,-1);
      renderDaily();
    });
    $("nextDayBtn").addEventListener("click", () => {
      state.selectedDate = shiftDate(state.selectedDate,1);
      renderDaily();
    });
    $("dailyDate").addEventListener("change", e => {
      if (!e.target.value) return;
      state.selectedDate = e.target.value;
      renderDaily();
    });
    $("saveDayBtn").addEventListener("click", onSaveDay);

    $("prevMonthBtn").addEventListener("click", () => {
      state.dashboardMonth = shiftMonth(state.dashboardMonth,-1);
      renderDashboard();
    });
    $("nextMonthBtn").addEventListener("click", () => {
      state.dashboardMonth = shiftMonth(state.dashboardMonth,1);
      renderDashboard();
    });
    $("dashboardMonth").addEventListener("change", e => {
      if (!e.target.value) return;
      state.dashboardMonth = e.target.value;
      renderDashboard();
    });
    $("saveMonthNoteBtn").addEventListener("click", saveMonthNote);

    $("habitType").addEventListener("change", populateGoalTypes);
    $("habitGoalType").addEventListener("change", toggleHabitFormFields);
    $("habitForm").addEventListener("submit", saveHabitFromForm);
    $("cancelEditBtn").addEventListener("click", resetHabitForm);

    $("exportBtn").addEventListener("click", exportBackup);
    $("importFile").addEventListener("change", async e => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        await importBackup(file);
      } catch (err) {
        toast(err.message || "Import failed");
      } finally {
        e.target.value = "";
      }
    });

    $("installGuideBtn").addEventListener("click", openInstallModal);
    $("installHintBtn").addEventListener("click", openInstallModal);
    $("closeModalBtn").addEventListener("click", closeInstallModal);
    $("modalBackdrop").addEventListener("click", e => {
      if (e.target === $("modalBackdrop")) closeInstallModal();
    });
  }

  async function init() {
    db = await openDB();
    await seedIfEmpty();
    await refreshState();
    bindEvents();
    populateGoalTypes();
    await renderDaily();
    await renderBackupStatus();
    $("todayLabel").textContent = formatPrettyDate(state.selectedDate);

    if ("serviceWorker" in navigator) {
      window.addEventListener("load", () => {
        navigator.serviceWorker.register("./sw.js").catch(() => {});
      });
    }
  }

  init().catch(err => {
    console.error(err);
    alert("Could not start Habit Tracker: " + (err.message || err));
  });
})();
