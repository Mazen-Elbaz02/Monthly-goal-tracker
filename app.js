(() => {
  "use strict";

  const DB_NAME = "HabitTrackerDB";
  const DB_VERSION = 3;
  const STORES = {
    habits: "habits",
    entries: "entries",
    notes: "notes",
    reviews: "reviews",
    todos: "todos",
    settings: "settings"
  };

  const LEGACY_DEFAULT_NAMES = new Set([
    "5 Prayers","Morning routine","٥ صفح قرءان",">5L water","Exercise","Diet",
    "8 hrs sleep","Weight","Medura","Courses",">15 min medical","Procrastination"
  ]);

  const state = {
    habits: [],
    selectedDate: todayKey(),
    dashboardMonth: monthKey(new Date()),
    reviewMonth: monthKey(new Date()),
    activeView: "daily",
    themeMode: "system",
    accentColor: "#0f7a4d",
    pendingMomentImages: [],
    reminderTimer: null
  };

  const BUILT_IN_QUOTES = [
    "Small steps count when you keep taking them.",
    "Consistency builds what motivation starts.",
    "Do the next useful thing.",
    "Progress can be quiet and still be real.",
    "Make today easy to be proud of.",
    "Start before you feel completely ready.",
    "Protect the habits that protect you.",
    "The goal is not perfection. Keep returning.",
    "One completed promise can change the direction of a day.",
    "Keep showing up. Results can catch up later."
  ];

  let db;
  let toastTimer;
  const $ = id => document.getElementById(id);

  function pad(n){ return String(n).padStart(2,"0"); }
  function todayKey(){
    const d = new Date();
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  }
  function monthKey(d){ return `${d.getFullYear()}-${pad(d.getMonth()+1)}`; }
  function dateFromKey(key){
    const [y,m,d] = key.split("-").map(Number);
    return new Date(y,m-1,d);
  }
  function monthFromKey(key){
    const [y,m] = key.split("-").map(Number);
    return new Date(y,m-1,1);
  }
  function dateKey(d){
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  }
  function shiftDate(key,delta){
    const d = dateFromKey(key);
    d.setDate(d.getDate()+delta);
    return dateKey(d);
  }
  function shiftMonth(key,delta){
    const d = monthFromKey(key);
    d.setMonth(d.getMonth()+delta);
    return monthKey(d);
  }
  function daysInMonth(key){
    const d = monthFromKey(key);
    return new Date(d.getFullYear(),d.getMonth()+1,0).getDate();
  }
  function formatPrettyDate(key){
    return dateFromKey(key).toLocaleDateString(undefined,{weekday:"long",month:"short",day:"numeric"});
  }
  function formatMonth(key){
    return monthFromKey(key).toLocaleDateString(undefined,{month:"long",year:"numeric"});
  }
  function formatShortDate(key){
    return dateFromKey(key).toLocaleDateString(undefined,{year:"numeric",month:"short",day:"numeric"});
  }
  function uid(){
    return crypto.randomUUID ? crypto.randomUUID() : `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  function openDB(){
    return new Promise((resolve,reject)=>{
      const request = indexedDB.open(DB_NAME,DB_VERSION);
      request.onupgradeneeded = event => {
        const database = event.target.result;
        if(!database.objectStoreNames.contains(STORES.habits)) database.createObjectStore(STORES.habits,{keyPath:"id"});
        if(!database.objectStoreNames.contains(STORES.entries)) database.createObjectStore(STORES.entries,{keyPath:"date"});
        if(!database.objectStoreNames.contains(STORES.notes)) database.createObjectStore(STORES.notes,{keyPath:"month"});
        if(!database.objectStoreNames.contains(STORES.reviews)) database.createObjectStore(STORES.reviews,{keyPath:"month"});
        if(!database.objectStoreNames.contains(STORES.todos)) database.createObjectStore(STORES.todos,{keyPath:"id"});
        if(!database.objectStoreNames.contains(STORES.settings)) database.createObjectStore(STORES.settings,{keyPath:"key"});
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  function tx(store,mode="readonly"){ return db.transaction(store,mode).objectStore(store); }
  function getAll(store){
    return new Promise((resolve,reject)=>{
      const req = tx(store).getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  function getOne(store,key){
    return new Promise((resolve,reject)=>{
      const req = tx(store).get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }
  function putOne(store,value){
    return new Promise((resolve,reject)=>{
      const req = tx(store,"readwrite").put(value);
      req.onsuccess = () => resolve(value);
      req.onerror = () => reject(req.error);
    });
  }
  function deleteOne(store,key){
    return new Promise((resolve,reject)=>{
      const req = tx(store,"readwrite").delete(key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }
  function clearStore(store){
    return new Promise((resolve,reject)=>{
      const req = tx(store,"readwrite").clear();
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async function cleanupUnusedLegacyStarterHabits(){
    const migrated = await getOne(STORES.settings,"v3StarterCleanup");
    if(migrated) return;
    const habits = await getAll(STORES.habits);
    const entries = await getAll(STORES.entries);
    const looksLikeOldStarterSet =
      entries.length===0 &&
      habits.length>0 &&
      habits.every(h=>LEGACY_DEFAULT_NAMES.has(h.name));

    if(looksLikeOldStarterSet) await clearStore(STORES.habits);
    await putOne(STORES.settings,{key:"v3StarterCleanup",value:true});
  }

  async function getSetting(key,fallback){
    const item = await getOne(STORES.settings,key);
    return item ? item.value : fallback;
  }
  async function setSetting(key,value){
    await putOne(STORES.settings,{key,value});
  }

  function goalOptions(type){
    return type==="checkbox"
      ? [["days_per_month","Days per month"],["percent_days","% of days"]]
      : [["daily_min","Daily minimum"],["daily_max","Daily maximum"],["daily_exact","Exact daily target"],["target_value","Target value"],["tracking_only","Tracking only"]];
  }

  function goalDescription(h){
    const v = h.goalValue;
    if(h.goalType==="days_per_month") return `${v||0} days/month`;
    if(h.goalType==="percent_days") return `${v||0}% of days`;
    if(h.goalType==="daily_min") return `≥ ${v??"—"} ${h.unit||""}`.trim();
    if(h.goalType==="daily_max") return `≤ ${v??"—"} ${h.unit||""}`.trim();
    if(h.goalType==="daily_exact") return `= ${v??"—"} ${h.unit||""}`.trim();
    if(h.goalType==="target_value") return `Target ${v??"—"} ${h.unit||""}`.trim();
    return "Tracking only";
  }

  function isHabitApplicableOn(habit,key){ return key >= habit.createdDate; }

  function isSuccess(habit,value){
    if(habit.type==="checkbox") return value===true;
    if(value==="" || value===null || value===undefined) return false;
    const n = Number(value);
    if(!Number.isFinite(n)) return false;
    if(habit.goalType==="daily_min") return n >= Number(habit.goalValue);
    if(habit.goalType==="daily_max") return n <= Number(habit.goalValue);
    if(habit.goalType==="daily_exact") return n === Number(habit.goalValue);
    return false;
  }

  function scoreFraction(habit,value){
    if(!habit.includeInScore) return null;
    if(habit.type==="checkbox") return value===true ? 1 : 0;
    if(value==="" || value===null || value===undefined) return 0;
    const n = Number(value);
    if(!Number.isFinite(n)) return 0;
    const g = Number(habit.goalValue);

    if(habit.goalType==="daily_min"){
      if(!Number.isFinite(g) || g<=0) return 0;
      return Math.max(0,Math.min(1,n/g));
    }
    if(habit.goalType==="daily_max") return n<=g ? 1 : 0;
    if(habit.goalType==="daily_exact") return n===g ? 1 : 0;
    return null;
  }


  async function getEntry(key){
    const entry = await getOne(STORES.entries,key);
    return entry || {date:key,values:{}};
  }
  async function saveEntry(key,values){
    return putOne(STORES.entries,{date:key,values,updatedAt:new Date().toISOString()});
  }

  async function refreshState(){
    state.habits = (await getAll(STORES.habits))
      .map((h,i)=>({
        showOnDashboard:h.showOnDashboard!==false,
        includeInScore:h.includeInScore!==false,
        sortOrder:Number.isFinite(h.sortOrder)?h.sortOrder:i,
        createdDate:h.createdDate||todayKey(),
        ...h
      }))
      .sort((a,b)=>(a.sortOrder||0)-(b.sortOrder||0));
  }

  function habitsForDate(key){ return state.habits.filter(h=>isHabitApplicableOn(h,key)); }

  function toast(message){
    const el = $("toast");
    el.textContent = message;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(()=>el.classList.remove("show"),2200);
  }

  function pageTitleFor(view){
    return {daily:"Daily",dashboard:"Dashboard",review:"Month",settings:"Settings"}[view] || "Habit Tracker";
  }

  function updateTopLabel(){
    if(state.activeView==="daily") $("todayLabel").textContent = formatPrettyDate(state.selectedDate);
    if(state.activeView==="dashboard") $("todayLabel").textContent = formatMonth(state.dashboardMonth);
    if(state.activeView==="review") $("todayLabel").textContent = formatMonth(state.reviewMonth);
    if(state.activeView==="settings") $("todayLabel").textContent = "Personalize your tracker";
  }

  function setView(view){
    state.activeView = view;
    document.querySelectorAll(".view").forEach(v=>v.classList.remove("active"));
    document.querySelectorAll(".dock-btn").forEach(v=>v.classList.remove("active"));

    $(`view-${view}`).classList.add("active");
    const dockBtn = document.querySelector(`.dock-btn[data-view="${view}"]`);
    if(dockBtn) dockBtn.classList.add("active");

    $("pageTitle").textContent = pageTitleFor(view);
    updateTopLabel();

    if(view==="daily") renderDaily();
    if(view==="dashboard") renderDashboard();
    if(view==="review") renderReview();
    if(view==="settings") renderSettings();
  }

  async function renderDaily(){
    $("todayLabel").textContent = formatPrettyDate(state.selectedDate);
    $("dailyDate").value = state.selectedDate;

    const habits = habitsForDate(state.selectedDate);
    const entry = await getEntry(state.selectedDate);
    const todos = (await getAll(STORES.todos))
      .filter(t=>t.date===state.selectedDate)
      .sort((a,b)=>a.createdAt.localeCompare(b.createdAt));

    const habitsRoot = $("dailyHabits");
    const todosRoot = $("dailyTodos");
    habitsRoot.innerHTML = "";
    todosRoot.innerHTML = "";

    const hasHabits = habits.length>0;
    const hasTodos = todos.length>0;
    $("habitsSection").classList.toggle("hidden",!hasHabits);
    $("todoSection").classList.toggle("hidden",!hasTodos);
    $("dailyEmpty").classList.toggle("hidden",hasHabits||hasTodos);
    $("saveDayBtn").classList.toggle("hidden",!hasHabits);
    $("dailySummary").classList.toggle("hidden",!hasHabits);
    $("todoCount").textContent = hasTodos ? String(todos.length) : "";

    todos.forEach(todo=>{
      const row = document.createElement("div");
      row.className = "todo-item";
      row.classList.toggle("completed",!!todo.checked);

      const check = document.createElement("button");
      check.type = "button";
      check.className = "todo-check";
      check.textContent = "✓";
      check.setAttribute("aria-label",`${todo.checked ? "Mark incomplete" : "Complete"} ${todo.text}`);
      check.addEventListener("click",async()=>{
        await putOne(STORES.todos,{
          ...todo,
          checked:!todo.checked,
          updatedAt:new Date().toISOString()
        });
        await renderDaily();
      });

      const text = document.createElement("div");
      text.className = "todo-text";
      text.textContent = todo.text;

      const del = document.createElement("button");
      del.type = "button";
      del.className = "todo-delete-btn";
      del.textContent = "×";
      del.setAttribute("aria-label",`Delete ${todo.text}`);
      del.addEventListener("click",async()=>{
        await deleteOne(STORES.todos,todo.id);
        await renderDaily();
        toast("To-do deleted");
      });

      row.append(check,text,del);
      todosRoot.appendChild(row);
    });

    habits.forEach(h=>{
      const value = entry.values[h.id];
      const card = document.createElement("div");
      card.className = "habit-entry" + (h.type==="checkbox" && value===true ? " checked" : "");

      const main = document.createElement("div");
      main.className = "habit-main habit-copy";
      main.innerHTML = `<strong dir="auto">${escapeHtml(h.name)}</strong><small>${escapeHtml(goalDescription(h))}</small>`;
      main.addEventListener("click",()=>openHabitStats(h.id));
      card.appendChild(main);

      const controls = document.createElement("div");
      controls.className = "habit-controls";

      const edit = document.createElement("button");
      edit.type = "button";
      edit.className = "edit-mini";
      edit.setAttribute("aria-label",`Edit ${h.name}`);
      edit.textContent = "✎";
      edit.addEventListener("click",e=>{
        e.stopPropagation();
        openHabitEditor(h.id);
      });
      controls.appendChild(edit);

      if(h.type==="checkbox"){
        const input = document.createElement("input");
        input.className = "toggle";
        input.type = "checkbox";
        input.dataset.habitId = h.id;
        input.checked = value===true;
        input.addEventListener("click",e=>e.stopPropagation());
        input.addEventListener("change",e=>{
          card.classList.toggle("checked",e.target.checked);
          updateDailySummary();
        });
        controls.appendChild(input);
      }else{
        const input = document.createElement("input");
        input.type = "number";
        input.step = "0.1";
        input.inputMode = "decimal";
        input.dataset.habitId = h.id;
        input.value = value ?? "";
        input.placeholder = h.unit || "value";
        input.addEventListener("click",e=>e.stopPropagation());
        input.addEventListener("input",updateDailySummary);
        const wrap = document.createElement("div");
        wrap.className = "number-control";
        wrap.appendChild(input);
        controls.appendChild(wrap);
      }

      card.appendChild(controls);
      habitsRoot.appendChild(card);
    });

    updateDailySummary();
  }

  function collectDailyValues(){
    const values = {};
    document.querySelectorAll("#dailyHabits [data-habit-id]").forEach(input=>{
      values[input.dataset.habitId] = input.type==="checkbox" ? input.checked : input.value.trim();
    });
    return values;
  }

  function updateDailySummary(){
    const habits = habitsForDate(state.selectedDate).filter(h=>h.includeInScore);
    const values = collectDailyValues();
    let total=0, scored=0, complete=0;

    habits.forEach(h=>{
      const f = scoreFraction(h,values[h.id]);
      if(f===null) return;
      total += f;
      scored++;
      if(f>=1) complete++;
    });

    const pct = scored ? Math.round(total/scored*100) : 0;
    $("dailySummary").innerHTML = `
      <div class="summary-chip"><strong>${pct}%</strong><span>Completion</span></div>
      <div class="summary-chip"><strong>${complete}</strong><span>Goals hit</span></div>
      <div class="summary-chip"><strong>${scored}</strong><span>Scored habits</span></div>`;
  }

  async function onSaveDay(){
    if(!habitsForDate(state.selectedDate).length) return;
    await saveEntry(state.selectedDate,collectDailyValues());
    toast("Day saved");
    await updateReviewAlert();
  }

  async function getMonthDashboardStats(month, entryMap=null){
    const entries = entryMap ? null : await getAll(STORES.entries);
    const map = entryMap || new Map(entries.map(e=>[e.date,e]));
    const totalDays = daysInMonth(month);
    const currentMonth = monthKey(new Date());

    let elapsed = totalDays;
    if(month>currentMonth) elapsed = 0;
    if(month===currentMonth) elapsed = new Date().getDate();

    let perfectDays=0, scoreSum=0, scoreDays=0, loggedDays=0;
    const heat=[];

    for(let day=1;day<=totalDays;day++){
      const key = `${month}-${pad(day)}`;
      const applicable = state.habits.filter(h=>isHabitApplicableOn(h,key) && h.includeInScore);

      if(day>elapsed || applicable.length===0){
        heat.push({day,key,score:null});
        continue;
      }

      const values = map.get(key)?.values || {};
      if(Object.keys(values).some(id=>values[id]!=="" && values[id]!==null && values[id]!==undefined && values[id]!==false)) loggedDays++;

      let sum=0, count=0;
      applicable.forEach(h=>{
        const f = scoreFraction(h,values[h.id]);
        if(f===null) return;
        sum += f;
        count++;
      });

      const pct = count ? Math.round(sum/count*100) : 0;
      if(pct===100) perfectDays++;
      scoreSum += pct;
      scoreDays++;
      heat.push({day,key,score:pct});
    }

    return {
      overall:scoreDays ? Math.round(scoreSum/scoreDays) : 0,
      perfectDays,
      elapsed,
      totalDays,
      loggedDays,
      heat,
      entryMap:map
    };
  }

  async function renderDashboard(){
    $("todayLabel").textContent = formatMonth(state.dashboardMonth);
    $("dashboardMonth").value = state.dashboardMonth;

    const stats = await getMonthDashboardStats(state.dashboardMonth);

    $("kpis").innerHTML = `
      <div class="kpi"><strong>${stats.overall}%</strong><span>Month completion</span></div>
      <div class="kpi"><strong>${stats.perfectDays}</strong><span>Perfect days</span></div>
      <div class="kpi"><strong>${stats.elapsed}/${stats.totalDays}</strong><span>Days elapsed</span></div>`;

    await renderDashboardInspiration(state.dashboardMonth);
    renderHeatmap(stats.heat);
    await renderHabitPerformance(stats.entryMap,stats.elapsed);
  }

  async function renderDashboardInspiration(month){
    const card = $("dashboardInspiration");
    const quoteBox = $("inspirationQuote");
    const momentBox = $("inspirationMoment");
    quoteBox.classList.add("hidden");
    momentBox.classList.add("hidden");

    const review = await getReview(month);
    const quoteChoices = BUILT_IN_QUOTES.map(text=>({text,source:"A reminder for today"}));
    if(review.quote && review.quote.trim()){
      quoteChoices.push({text:review.quote.trim(),source:"Your quote for this month"});
    }

    const photoChoices = [];
    for(const moment of (review.moments || [])){
      const images = Array.isArray(moment.images) && moment.images.length ? moment.images : (moment.image ? [moment.image] : []);
      for(const image of images){
        photoChoices.push({image,caption:moment.caption || "A moment worth remembering"});
      }
    }

    if(!quoteChoices.length && !photoChoices.length){
      card.classList.add("hidden");
      return;
    }

    const availableTypes = [];
    if(quoteChoices.length) availableTypes.push("quote");
    if(photoChoices.length) availableTypes.push("photo");
    const type = availableTypes[Math.floor(Math.random()*availableTypes.length)];
    card.classList.remove("hidden");

    if(type==="photo"){
      const pick = photoChoices[Math.floor(Math.random()*photoChoices.length)];
      $("inspirationMomentImage").src = pick.image;
      $("inspirationMomentCaption").textContent = pick.caption;
      momentBox.classList.remove("hidden");
    }else{
      const pick = quoteChoices[Math.floor(Math.random()*quoteChoices.length)];
      $("inspirationQuoteText").textContent = pick.text;
      $("inspirationQuoteSource").textContent = pick.source;
      quoteBox.classList.remove("hidden");
    }
  }

  function renderHeatmap(days){
    const root = $("heatmap");
    root.innerHTML = "";

    days.forEach(d=>{
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "heatday";
      btn.textContent = d.day;

      if(d.score===null){
        btn.classList.add("future");
        btn.disabled = true;
      }else{
        btn.classList.add(d.score>=85?"s4":d.score>=60?"s3":d.score>=30?"s2":"s1");
        btn.title = `${d.score}%`;
        btn.addEventListener("click",()=>{
          state.selectedDate = d.key;
          setView("daily");
        });
      }
      root.appendChild(btn);
    });
  }

  function monthlyStatsForHabit(h,entryMap,month,elapsedOverride=null){
    const totalDays = daysInMonth(month);
    const currentMonth = monthKey(new Date());
    let elapsed = elapsedOverride===null ? totalDays : elapsedOverride;

    if(elapsedOverride===null){
      if(month>currentMonth) elapsed = 0;
      if(month===currentMonth) elapsed = new Date().getDate();
    }

    const applicable=[];
    const numericValues=[];
    let successDays=0;

    for(let day=1;day<=elapsed;day++){
      const key = `${month}-${pad(day)}`;
      if(!isHabitApplicableOn(h,key)) continue;
      applicable.push(key);
      const v = entryMap.get(key)?.values?.[h.id];

      if(h.type==="number" && v!=="" && v!==undefined && v!==null && Number.isFinite(Number(v))){
        numericValues.push(Number(v));
      }
      if(isSuccess(h,v)) successDays++;
    }

    const rawPct = applicable.length ? Math.round(successDays/applicable.length*100) : 0;
    let goalPct = rawPct;

    if(h.goalType==="days_per_month"){
      const goal = Math.max(1,Number(h.goalValue)||1);
      goalPct = Math.min(100,Math.round(successDays/goal*100));
    }else if(h.goalType==="percent_days"){
      const target = Math.max(1,Number(h.goalValue)||1);
      goalPct = Math.min(100,Math.round(rawPct/target*100));
    }

    return {applicable,numericValues,successDays,rawPct,goalPct};
  }

  async function renderHabitPerformance(entryMap,elapsed){
    const root = $("habitPerformance");
    root.innerHTML = "";

    const visible = state.habits.filter(h=>h.showOnDashboard!==false);
    $("dashboardEmpty").classList.toggle("hidden",visible.length>0);

    for(const h of visible){
      const m = monthlyStatsForHabit(h,entryMap,state.dashboardMonth,elapsed);
      const streak = calculateLifetimeStreak(h,entryMap);
      const card = document.createElement("div");
      card.className = "perf-card";

      let metricLine="";
      if(h.type==="number" && m.numericValues.length){
        const avg = (m.numericValues.reduce((a,b)=>a+b,0)/m.numericValues.length).toFixed(1);
        metricLine = statRow("Average",`${avg} ${h.unit||""}`.trim());
      }else if(h.type==="checkbox"){
        metricLine = statRow("This month",`${m.successDays}/${m.applicable.length||0} days`);
      }

      const nonProgress = ["target_value","tracking_only"].includes(h.goalType);
      const badge = nonProgress ? escapeHtml(goalDescription(h)) : `${m.goalPct}%`;

      card.innerHTML = `
        <div class="perf-top">
          <div>
            <strong dir="auto">${escapeHtml(h.name)}</strong>
            <div class="muted small">${escapeHtml(goalDescription(h))}</div>
          </div>
          <span class="badge">${badge}</span>
        </div>
        ${nonProgress ? "" : `<div class="progress"><span style="width:${Math.max(0,Math.min(100,m.goalPct))}%"></span></div>`}
        ${metricLine}
        ${statRow("Current streak",`🔥 ${streak.current} days`)}
        ${statRow("Best streak",`🏆 ${streak.best} days`)}`;

      if(h.goalType==="target_value" && m.numericValues.length){
        card.innerHTML += statRow("Latest",`${m.numericValues[m.numericValues.length-1]} ${h.unit||""}`.trim());
      }

      root.appendChild(card);
    }
  }

  function statRow(label,value){
    return `<div class="stat-row"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
  }

  function calculateLifetimeStreak(habit,entryMap){
    if(["target_value","tracking_only"].includes(habit.goalType)) return {current:0,best:0};

    const today = dateFromKey(todayKey());
    const created = dateFromKey(habit.createdDate);
    if(created>today) return {current:0,best:0};

    let best=0, running=0;
    const flags=[];

    for(let d=new Date(created);d<=today;d.setDate(d.getDate()+1)){
      const key = dateKey(d);
      const v = entryMap.get(key)?.values?.[habit.id];
      const success = isSuccess(habit,v);
      flags.push({key,success,hasValue:v!==undefined && v!==null && v!==""});
      if(success){
        running++;
        best = Math.max(best,running);
      }else{
        running=0;
      }
    }

    let current=0;
    let i=flags.length-1;
    if(i>=0 && flags[i].key===todayKey() && !flags[i].hasValue) i--;
    for(;i>=0;i--){
      if(flags[i].success) current++;
      else break;
    }
    return {current,best};
  }

  async function openHabitStats(habitId){
    const h = state.habits.find(x=>x.id===habitId);
    if(!h) return;

    const entries = await getAll(STORES.entries);
    const map = new Map(entries.map(e=>[e.date,e]));
    const month = state.selectedDate.slice(0,7);
    const m = monthlyStatsForHabit(h,map,month);
    const streak = calculateLifetimeStreak(h,map);

    $("statsModalTitle").textContent = h.name;
    $("statsModalGoal").textContent = goalDescription(h);

    const boxes = [
      ["Current streak",`🔥 ${streak.current} days`],
      ["Best streak",`🏆 ${streak.best} days`],
      ["This month",h.type==="checkbox" ? `${m.successDays}/${m.applicable.length||0} days` : `${m.rawPct}% goal days`],
      ["Date added",formatShortDate(h.createdDate)]
    ];

    if(h.type==="number" && m.numericValues.length){
      const avg = (m.numericValues.reduce((a,b)=>a+b,0)/m.numericValues.length).toFixed(1);
      boxes.splice(2,0,["Average",`${avg} ${h.unit||""}`.trim()]);
    }

    $("habitStatsBody").innerHTML = boxes.map(([label,value])=>
      `<div class="stat-box"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`
    ).join("");

    $("statsModalBackdrop").classList.remove("hidden");
  }

  function closeStatsModal(){ $("statsModalBackdrop").classList.add("hidden"); }

  function populateGoalTypes(preferred=null){
    const type = $("habitType").value;
    const select = $("habitGoalType");
    const current = preferred || select.value;
    select.innerHTML = "";

    goalOptions(type).forEach(([value,label])=>{
      const opt = document.createElement("option");
      opt.value = value;
      opt.textContent = label;
      select.appendChild(opt);
    });

    if([...select.options].some(o=>o.value===current)) select.value = current;
    toggleHabitFormFields();
  }

  function toggleHabitFormFields(){
    const goalType = $("habitGoalType").value;
    $("goalValueWrap").classList.toggle("hidden",goalType==="tracking_only");
    $("unitWrap").classList.toggle("hidden",$("habitType").value!=="number");
  }

  async function clearTodosForSelectedDate(){
    const todos = (await getAll(STORES.todos)).filter(t=>t.date===state.selectedDate);
    if(!todos.length) return;

    const ok = window.confirm(
      `Clear all ${todos.length} to-do${todos.length===1 ? "" : "s"} for ${formatPrettyDate(state.selectedDate)}?`
    );
    if(!ok) return;

    for(const todo of todos){
      await deleteOne(STORES.todos,todo.id);
    }

    await renderDaily();
    toast("All to-dos cleared");
  }

  function openAddChooser(){
    $("addChooserBackdrop").classList.remove("hidden");
  }

  function closeAddChooser(){
    $("addChooserBackdrop").classList.add("hidden");
  }

  function openTodoEditor(){
    closeAddChooser();
    $("todoText").value = "";
    $("todoEditorDate").textContent = formatPrettyDate(state.selectedDate);
    $("todoEditorBackdrop").classList.remove("hidden");
    setTimeout(()=>$("todoText").focus(),100);
  }

  function closeTodoEditor(){
    $("todoEditorBackdrop").classList.add("hidden");
    $("todoText").value = "";
  }

  async function saveTodo(){
    const text = $("todoText").value.trim();
    if(!text) return toast("Enter a to-do item");

    await putOne(STORES.todos,{
      id:uid(),
      date:state.selectedDate,
      text,
      checked:false,
      createdAt:new Date().toISOString()
    });

    closeTodoEditor();
    await renderDaily();
    toast("To-do added");
  }

  function openHabitEditor(habitId=null){
    resetHabitForm();

    if(habitId){
      const h = state.habits.find(x=>x.id===habitId);
      if(!h) return;

      $("editHabitId").value = h.id;
      $("habitName").value = h.name;
      $("habitType").value = h.type;
      populateGoalTypes(h.goalType);
      $("habitGoalType").value = h.goalType;
      $("habitGoalValue").value = h.goalValue ?? "";
      $("habitUnit").value = h.unit || "";
      $("habitIncludeScore").checked = !!h.includeInScore;
      $("habitShowDashboard").checked = h.showOnDashboard!==false;
      $("habitEditorTitle").textContent = "Edit habit";
      $("deleteHabitBtn").classList.remove("hidden");
      toggleHabitFormFields();
    }

    $("habitEditorBackdrop").classList.remove("hidden");
    setTimeout(()=>$("habitName").focus(),100);
  }

  function closeHabitEditor(){
    $("habitEditorBackdrop").classList.add("hidden");
    resetHabitForm();
  }

  function resetHabitForm(){
    $("habitForm").reset();
    $("editHabitId").value = "";
    $("habitType").value = "checkbox";
    $("habitIncludeScore").checked = true;
    $("habitShowDashboard").checked = true;
    $("habitEditorTitle").textContent = "Add habit";
    $("deleteHabitBtn").classList.add("hidden");
    populateGoalTypes();
  }

  async function saveHabitFromForm(event){
    event.preventDefault();

    const id = $("editHabitId").value || uid();
    const existing = state.habits.find(h=>h.id===id);
    const type = $("habitType").value;
    const goalType = $("habitGoalType").value;
    const rawGoal = $("habitGoalValue").value.trim();
    const goalValue = goalType==="tracking_only" ? null : (rawGoal==="" ? null : Number(rawGoal));

    if(!goalType) return toast("Choose a goal type");
    if(goalType!=="tracking_only" && (goalValue===null || !Number.isFinite(goalValue))){
      return toast("Enter a valid goal");
    }

    const habit = {
      id,
      name:$("habitName").value.trim(),
      type,
      goalType,
      goalValue,
      unit:type==="number" ? $("habitUnit").value.trim() : "",
      includeInScore:$("habitIncludeScore").checked,
      showOnDashboard:$("habitShowDashboard").checked,
      createdDate:existing ? existing.createdDate : todayKey(),
      sortOrder:existing ? existing.sortOrder : state.habits.length
    };

    if(!habit.name) return toast("Enter a habit name");

    await putOne(STORES.habits,habit);
    await refreshState();
    closeHabitEditor();
    await refreshCurrentView();
    toast(existing ? "Habit updated" : "Habit added");
  }

  async function permanentlyDeleteHabit(habitId){
    const h = state.habits.find(x=>x.id===habitId);
    if(!h) return;

    const ok = window.confirm(
      `Delete "${h.name}" forever?\n\nThis also deletes its saved history and cannot be undone.`
    );
    if(!ok) return;

    await deleteOne(STORES.habits,habitId);

    const entries = await getAll(STORES.entries);
    for(const entry of entries){
      if(entry.values && Object.prototype.hasOwnProperty.call(entry.values,habitId)){
        const values = {...entry.values};
        delete values[habitId];
        await putOne(STORES.entries,{...entry,values,updatedAt:new Date().toISOString()});
      }
    }

    await refreshState();
    closeHabitEditor();
    await refreshCurrentView();
    toast("Habit deleted forever");
  }

  async function refreshCurrentView(){
    if(state.activeView==="daily") await renderDaily();
    if(state.activeView==="dashboard") await renderDashboard();
    if(state.activeView==="review") await renderReview();
  }

  function emptyReview(month){
    return {
      month,
      biggestWin:"",
      worked:"",
      improve:"",
      nextFocus:"",
      quote:"",
      moments:[],
      reviewReadAt:null,
      updatedAt:null
    };
  }

  async function getReview(month){
    return (await getOne(STORES.reviews,month)) || emptyReview(month);
  }

  async function saveReview(showToast=true){
    const review = await getReview(state.reviewMonth);
    await putOne(STORES.notes,{month:state.reviewMonth,text:$("reviewMonthGoals").value.trim(),updatedAt:new Date().toISOString()});
    review.biggestWin = $("reviewBiggestWin").value.trim();
    review.worked = $("reviewWorked").value.trim();
    review.improve = $("reviewImprove").value.trim();
    review.nextFocus = $("reviewNextFocus").value.trim();
    review.quote = $("reviewQuote").value.trim();
    review.updatedAt = new Date().toISOString();

    await putOne(STORES.reviews,review);
    if(showToast) toast("Monthly review saved");
    await updateReviewAlert();
    return review;
  }

  async function renderReview(){
    $("todayLabel").textContent = formatMonth(state.reviewMonth);
    $("reviewMonth").value = state.reviewMonth;
    $("reviewMonthTitle").textContent = formatMonth(state.reviewMonth);

    const review = await getReview(state.reviewMonth);
    const note = await getOne(STORES.notes,state.reviewMonth);
    $("reviewMonthGoals").value = note?.text || "";
    $("reviewBiggestWin").value = review.biggestWin || "";
    $("reviewWorked").value = review.worked || "";
    $("reviewImprove").value = review.improve || "";
    $("reviewNextFocus").value = review.nextFocus || "";
    $("reviewQuote").value = review.quote || "";

    const stats = await getMonthDashboardStats(state.reviewMonth);
    $("reviewSnapshot").innerHTML = `
      <div class="kpi"><strong>${stats.overall}%</strong><span>Completion</span></div>
      <div class="kpi"><strong>${stats.perfectDays}</strong><span>Perfect days</span></div>
      <div class="kpi"><strong>${stats.loggedDays}</strong><span>Logged days</span></div>`;

    renderMoments(review);
    $("markReviewReadBtn").textContent = review.reviewReadAt ? "Month read ✓" : "Mark month as read";
  }

  function renderMoments(review){
    const root = $("momentsGallery");
    root.innerHTML = "";
    const moments = review.moments || [];
    $("momentsEmpty").classList.toggle("hidden",moments.length>0);

    moments.forEach(moment=>{
      const card = document.createElement("div");
      card.className = "moment-card";
      const images = Array.isArray(moment.images) && moment.images.length ? moment.images : (moment.image ? [moment.image] : []);

      const grid = document.createElement("div");
      grid.className = `moment-photo-grid count-${Math.max(1,Math.min(images.length,6))}`;
      images.slice(0,6).forEach((src,index)=>{
        const img = document.createElement("img");
        img.src = src;
        img.alt = moment.caption ? `${moment.caption} — photo ${index+1}` : `Big moment photo ${index+1}`;
        grid.appendChild(img);
      });
      card.appendChild(grid);

      const del = document.createElement("button");
      del.type = "button";
      del.className = "moment-delete";
      del.textContent = "×";
      del.setAttribute("aria-label","Delete moment");
      del.addEventListener("click",()=>deleteMoment(moment.id));
      card.appendChild(del);

      const caption = document.createElement("div");
      caption.className = "moment-caption";
      caption.textContent = moment.caption || "Big moment";
      card.appendChild(caption);
      root.appendChild(card);
    });
  }

  async function compressImage(file){
    if(!file.type.startsWith("image/")) throw new Error("Choose an image file.");

    const dataUrl = await new Promise((resolve,reject)=>{
      const reader = new FileReader();
      reader.onload = ()=>resolve(reader.result);
      reader.onerror = ()=>reject(reader.error);
      reader.readAsDataURL(file);
    });

    const img = await new Promise((resolve,reject)=>{
      const image = new Image();
      image.onload = ()=>resolve(image);
      image.onerror = ()=>reject(new Error("Could not read image."));
      image.src = dataUrl;
    });

    const maxSide = 1280;
    const scale = Math.min(1,maxSide/Math.max(img.width,img.height));
    const width = Math.max(1,Math.round(img.width*scale));
    const height = Math.max(1,Math.round(img.height*scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img,0,0,width,height);

    return canvas.toDataURL("image/jpeg",0.78);
  }

  async function handleMomentPhotos(files){
    const review = await getReview(state.reviewMonth);
    const existingPhotoCount = (review.moments || []).reduce((sum,moment)=>{
      if(Array.isArray(moment.images) && moment.images.length) return sum + moment.images.length;
      return sum + (moment.image ? 1 : 0);
    },0);
    const remaining = Math.max(0,6-existingPhotoCount);

    if(remaining===0){
      $("momentPhotoInput").value = "";
      return toast("Maximum 6 photos per month");
    }

    const chosen = files.filter(file=>file && file.type && file.type.startsWith("image/")).slice(0,remaining);
    if(!chosen.length){
      $("momentPhotoInput").value = "";
      return;
    }

    try{
      const compressed = [];
      for(const file of chosen) compressed.push(await compressImage(file));
      state.pendingMomentImages = compressed;

      const preview = $("momentCaptionPreview");
      preview.innerHTML = "";
      compressed.forEach((src,index)=>{
        const img = document.createElement("img");
        img.src = src;
        img.alt = `Selected photo ${index+1}`;
        preview.appendChild(img);
      });

      $("momentCaptionText").value = "";
      $("momentCaptionBackdrop").classList.remove("hidden");
      setTimeout(()=>$("momentCaptionText").focus(),100);
      if(files.length>remaining) toast(`Only ${remaining} more photo${remaining===1?"":"s"} fit this month`);
    }catch(err){
      $("momentPhotoInput").value = "";
      toast(err.message || "Could not add photos");
    }
  }

  function closeMomentCaption(){
    $("momentCaptionBackdrop").classList.add("hidden");
    state.pendingMomentImages = [];
    $("momentCaptionPreview").innerHTML = "";
    $("momentPhotoInput").value = "";
  }

  async function saveMomentCaption(){
    if(!state.pendingMomentImages.length) return;
    const review = await getReview(state.reviewMonth);
    review.moments = review.moments || [];

    const existingPhotoCount = review.moments.reduce((sum,moment)=>{
      if(Array.isArray(moment.images) && moment.images.length) return sum + moment.images.length;
      return sum + (moment.image ? 1 : 0);
    },0);
    const remaining = Math.max(0,6-existingPhotoCount);
    const images = state.pendingMomentImages.slice(0,remaining);
    if(!images.length){
      closeMomentCaption();
      return toast("Maximum 6 photos per month");
    }

    review.moments.push({
      id:uid(),
      images,
      caption:$("momentCaptionText").value.trim(),
      createdAt:new Date().toISOString()
    });
    review.updatedAt = new Date().toISOString();
    await putOne(STORES.reviews,review);
    closeMomentCaption();
    await renderReview();
    toast(images.length>1 ? `${images.length} photos grouped into one moment` : "Big moment added");
  }

  async function deleteMoment(momentId){
    const review = await getReview(state.reviewMonth);
    review.moments = (review.moments || []).filter(m=>m.id!==momentId);
    review.updatedAt = new Date().toISOString();
    await putOne(STORES.reviews,review);
    renderReview();
  }

  async function markReviewRead(){
    const review = await saveReview(false);
    review.reviewReadAt = new Date().toISOString();
    await putOne(STORES.reviews,review);
    toast("Month marked as read");
    await renderReview();
    await updateReviewAlert();
    if("clearAppBadge" in navigator){
      try{ await navigator.clearAppBadge(); }catch(_){}
    }
  }

  function previousMonthKey(){
    return shiftMonth(monthKey(new Date()),-1);
  }

  function isLastDayOfCurrentMonth(){
    const now = new Date();
    return now.getDate() === new Date(now.getFullYear(),now.getMonth()+1,0).getDate();
  }

  async function pendingReviewMonth(){
    const current = monthKey(new Date());

    if(isLastDayOfCurrentMonth()){
      const currentReview = await getReview(current);
      if(!currentReview.reviewReadAt) return current;
    }

    const previous = previousMonthKey();
    const previousReview = await getReview(previous);
    if(!previousReview.reviewReadAt) return previous;

    return null;
  }

  async function updateReviewAlert(){
    const month = await pendingReviewMonth();
    const alert = $("reviewAlert");

    if(!month){
      alert.classList.add("hidden");
      if("clearAppBadge" in navigator){
        try{ await navigator.clearAppBadge(); }catch(_){}
      }
      return;
    }

    $("reviewAlertTitle").textContent = `${formatMonth(month)} month is ready`;
    $("reviewAlertText").textContent = "Look back at your month, big moments and lessons.";
    alert.dataset.month = month;
    alert.classList.remove("hidden");

    if("setAppBadge" in navigator){
      try{ await navigator.setAppBadge(1); }catch(_){}
    }
  }

  function hexToRgb(hex){
    const clean = hex.replace("#","");
    const full = clean.length===3 ? clean.split("").map(c=>c+c).join("") : clean;
    const n = parseInt(full,16);
    return {r:(n>>16)&255,g:(n>>8)&255,b:n&255};
  }

  async function applyAccent(color,save=true){
    const valid = /^#[0-9a-f]{6}$/i.test(color) ? color : "#0f7a4d";
    const rgb = hexToRgb(valid);
    state.accentColor = valid;

    document.documentElement.style.setProperty("--accent",valid);
    document.documentElement.style.setProperty("--accent-rgb",`${rgb.r},${rgb.g},${rgb.b}`);

    const meta = document.querySelector('meta[name="theme-color"]');
    if(meta) meta.setAttribute("content",effectiveTheme(state.themeMode)==="dark" ? "#0b0e0c" : "#ffffff");

    $("customColor").value = valid;
    document.querySelectorAll(".color-swatch").forEach(btn=>{
      btn.classList.toggle("selected",btn.dataset.color.toLowerCase()===valid.toLowerCase());
    });

    if(save) await setSetting("accentColor",valid);
  }

  function effectiveTheme(mode){
    if(mode==="system"){
      return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
    return mode;
  }

  async function applyTheme(mode,save=true){
    if(!["system","light","dark"].includes(mode)) mode = "system";
    state.themeMode = mode;
    document.documentElement.dataset.theme = effectiveTheme(mode);
    $("themeMode").value = mode;

    const meta = document.querySelector('meta[name="theme-color"]');
    if(meta) meta.setAttribute("content",effectiveTheme(mode)==="dark" ? "#0b0e0c" : "#ffffff");

    if(save) await setSetting("themeMode",mode);
  }

  async function renderSettings(){
    await renderBackupStatus();
    $("themeMode").value = state.themeMode;
    $("customColor").value = state.accentColor;

    $("dailyReminderEnabled").checked = await getSetting("dailyReminderEnabled",false);
    $("dailyReminderTime").value = await getSetting("dailyReminderTime","20:00");
    $("quoteReminderEnabled").checked = await getSetting("quoteReminderEnabled",false);
    $("monthEndReminderEnabled").checked = await getSetting("monthEndReminderEnabled",true);
    $("monthEndReminderTime").value = await getSetting("monthEndReminderTime","21:00");

    updateNotificationPermissionText();
    updateInstallUI();
  }

  function isStandalone(){
    return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone===true;
  }

  function updateInstallUI(){
    $("installSettingsCard").classList.toggle("hidden",isStandalone());
  }

  function notificationsSupported(){
    return "Notification" in window && "serviceWorker" in navigator;
  }

  function updateNotificationPermissionText(){
    let text = "Notifications are not supported in this browser.";
    if(notificationsSupported()){
      text = `Permission: ${Notification.permission}`;
      if(!isStandalone()){
        text += " · On iPhone, install the app to Home Screen before enabling Web Push.";
      }
    }
    $("notificationPermissionText").textContent = text;
  }

  async function enableNotifications(){
    if(!notificationsSupported()){
      return toast("Notifications are not supported here");
    }

    try{
      const permission = await Notification.requestPermission();
      updateNotificationPermissionText();
      if(permission==="granted") toast("Notifications enabled");
      else toast("Notification permission was not granted");
    }catch(_){
      toast("Could not request notification permission");
    }
  }

  async function showLocalNotification(title,body,tag){
    if(!notificationsSupported() || Notification.permission!=="granted") return false;

    try{
      const reg = await navigator.serviceWorker.ready;
      await reg.showNotification(title,{
        body,
        tag,
        renotify:false,
        icon:"./icons/icon-192.png",
        badge:"./icons/icon-192.png"
      });
      return true;
    }catch(_){
      return false;
    }
  }

  function currentMinutes(){
    const now = new Date();
    return now.getHours()*60 + now.getMinutes();
  }

  function timeToMinutes(value){
    const [h,m] = String(value||"00:00").split(":").map(Number);
    return (h||0)*60 + (m||0);
  }

  function seededQuoteMinute(dateStr){
    let hash=0;
    for(const ch of dateStr) hash = ((hash<<5)-hash) + ch.charCodeAt(0);
    const start = 10*60;
    const span = 10*60;
    return start + Math.abs(hash)%span;
  }

  async function checkReminders(){
    if(removedTodos && state.activeView==="daily") await renderDaily();
    const today = todayKey();
    const month = monthKey(new Date());
    const nowMin = currentMinutes();

    const dailyEnabled = await getSetting("dailyReminderEnabled",false);
    const dailyTime = await getSetting("dailyReminderTime","20:00");
    const dailySent = await getSetting("dailyReminderLastSent","");

    if(dailyEnabled && dailySent!==today && nowMin>=timeToMinutes(dailyTime)){
      const sent = await showLocalNotification(
        "Habit Tracker",
        "A quick check-in: complete today’s habits.",
        `daily-${today}`
      );
      if(sent) await setSetting("dailyReminderLastSent",today);
    }

    const quoteEnabled = await getSetting("quoteReminderEnabled",false);
    const quoteSent = await getSetting("quoteReminderLastSent","");
    if(quoteEnabled && quoteSent!==today && nowMin>=seededQuoteMinute(today)){
      const review = await getReview(month);
      if(review.quote){
        const sent = await showLocalNotification(
          "Quote of the month",
          review.quote,
          `quote-${today}`
        );
        if(sent) await setSetting("quoteReminderLastSent",today);
      }
    }

    const monthEndEnabled = await getSetting("monthEndReminderEnabled",true);
    const monthEndTime = await getSetting("monthEndReminderTime","21:00");
    const monthEndSent = await getSetting("monthEndReminderLastSent","");

    if(monthEndEnabled && isLastDayOfCurrentMonth() && monthEndSent!==month && nowMin>=timeToMinutes(monthEndTime)){
      const sent = await showLocalNotification(
        "Month review ready",
        `Take a few minutes to read and complete your ${formatMonth(month)} month.`,
        `review-${month}`
      );
      if(sent) await setSetting("monthEndReminderLastSent",month);
    }

    await updateReviewAlert();
  }

  function startReminderChecks(){
    clearInterval(state.reminderTimer);
    checkReminders();
    state.reminderTimer = setInterval(checkReminders,60*1000);
  }

  async function saveReminderSettings(){
    await setSetting("dailyReminderEnabled",$("dailyReminderEnabled").checked);
    await setSetting("dailyReminderTime",$("dailyReminderTime").value || "20:00");
    await setSetting("quoteReminderEnabled",$("quoteReminderEnabled").checked);
    await setSetting("monthEndReminderEnabled",$("monthEndReminderEnabled").checked);
    await setSetting("monthEndReminderTime",$("monthEndReminderTime").value || "21:00");
    startReminderChecks();
  }

  async function exportBackup(){
    const data = {
      version:5,
      exportedAt:new Date().toISOString(),
      habits:await getAll(STORES.habits),
      entries:await getAll(STORES.entries),
      notes:await getAll(STORES.notes),
      reviews:await getAll(STORES.reviews),
      todos:await getAll(STORES.todos),
      settings:await getAll(STORES.settings)
    };

    const blob = new Blob([JSON.stringify(data,null,2)],{type:"application/json"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `habit-tracker-backup-${todayKey()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

    await setSetting("lastBackup",new Date().toISOString());
    renderBackupStatus();
    toast("Backup exported");
  }

  async function importBackup(file){
    const text = await file.text();
    const data = JSON.parse(text);

    if(!data || !Array.isArray(data.habits) || !Array.isArray(data.entries)){
      throw new Error("This is not a valid Habit Tracker backup.");
    }

    for(const store of [STORES.habits,STORES.entries,STORES.notes,STORES.reviews,STORES.todos,STORES.settings]){
      await clearStore(store);
    }

    for(const h of data.habits||[]){
      const normalized = {
        ...h,
        showOnDashboard:h.showOnDashboard!==false,
        createdDate:h.createdDate||todayKey()
      };
      delete normalized.active;
      delete normalized.archivedDate;
      await putOne(STORES.habits,normalized);
    }

    for(const e of data.entries||[]) await putOne(STORES.entries,e);
    for(const n of data.notes||[]) await putOne(STORES.notes,n);
    for(const r of data.reviews||[]) await putOne(STORES.reviews,r);
    for(const t of data.todos||[]) await putOne(STORES.todos,t);
    for(const s of data.settings||[]) await putOne(STORES.settings,s);

    await refreshState();

    state.accentColor = await getSetting("accentColor","#0f7a4d");
    state.themeMode = await getSetting("themeMode","system");
    await applyAccent(state.accentColor,false);
    await applyTheme(state.themeMode,false);

    await refreshCurrentView();
    await renderSettings();
    await updateReviewAlert();
    toast("Backup restored");
  }

  async function renderBackupStatus(){
    const last = await getOne(STORES.settings,"lastBackup");
    $("backupStatus").textContent = last?.value
      ? `Last backup: ${new Date(last.value).toLocaleString()}`
      : "No backup recorded yet.";
  }

  function openInstallModal(){ $("installModalBackdrop").classList.remove("hidden"); }
  function closeInstallModal(){ $("installModalBackdrop").classList.add("hidden"); }

  function escapeHtml(value){
    return String(value??"")
      .replace(/&/g,"&amp;")
      .replace(/</g,"&lt;")
      .replace(/>/g,"&gt;")
      .replace(/"/g,"&quot;")
      .replace(/'/g,"&#039;");
  }

  function bindEvents(){
    document.querySelectorAll(".dock-btn").forEach(btn=>{
      btn.addEventListener("click",()=>setView(btn.dataset.view));
    });

    $("settingsTopBtn").addEventListener("click",()=>setView("settings"));

    $("prevDayBtn").addEventListener("click",()=>{
      state.selectedDate = shiftDate(state.selectedDate,-1);
      renderDaily();
    });
    $("nextDayBtn").addEventListener("click",()=>{
      state.selectedDate = shiftDate(state.selectedDate,1);
      renderDaily();
    });
    $("dailyDate").addEventListener("change",e=>{
      if(e.target.value){
        state.selectedDate = e.target.value;
        renderDaily();
      }
    });
    $("saveDayBtn").addEventListener("click",onSaveDay);
    $("clearTodosBtn").addEventListener("click",clearTodosForSelectedDate);
    $("dailyAddBtn").addEventListener("click",openAddChooser);
    $("emptyAddBtn").addEventListener("click",openAddChooser);

    $("closeAddChooserBtn").addEventListener("click",closeAddChooser);
    $("addChooserBackdrop").addEventListener("click",e=>{ if(e.target===$("addChooserBackdrop")) closeAddChooser(); });
    $("addTodoChoiceBtn").addEventListener("click",openTodoEditor);
    $("addHabitChoiceBtn").addEventListener("click",()=>{ closeAddChooser(); openHabitEditor(); });

    $("closeTodoEditorBtn").addEventListener("click",closeTodoEditor);
    $("todoEditorBackdrop").addEventListener("click",e=>{ if(e.target===$("todoEditorBackdrop")) closeTodoEditor(); });
    $("saveTodoBtn").addEventListener("click",saveTodo);
    $("todoText").addEventListener("keydown",e=>{ if(e.key==="Enter"){ e.preventDefault(); saveTodo(); } });

    $("prevMonthBtn").addEventListener("click",()=>{
      state.dashboardMonth = shiftMonth(state.dashboardMonth,-1);
      renderDashboard();
    });
    $("nextMonthBtn").addEventListener("click",()=>{
      state.dashboardMonth = shiftMonth(state.dashboardMonth,1);
      renderDashboard();
    });
    $("dashboardMonth").addEventListener("change",e=>{
      if(e.target.value){
        state.dashboardMonth = e.target.value;
        renderDashboard();
      }
    });
    $("openReviewFromDashboard").addEventListener("click",()=>{
      state.reviewMonth = state.dashboardMonth;
      setView("review");
    });

    $("prevReviewMonthBtn").addEventListener("click",()=>{
      state.reviewMonth = shiftMonth(state.reviewMonth,-1);
      renderReview();
    });
    $("nextReviewMonthBtn").addEventListener("click",()=>{
      state.reviewMonth = shiftMonth(state.reviewMonth,1);
      renderReview();
    });
    $("reviewMonth").addEventListener("change",e=>{
      if(e.target.value){
        state.reviewMonth = e.target.value;
        renderReview();
      }
    });
    $("saveReviewBtn").addEventListener("click",()=>saveReview(true));
    $("markReviewReadBtn").addEventListener("click",markReviewRead);
    $("momentPhotoInput").addEventListener("change",e=>handleMomentPhotos([...e.target.files]));
    $("saveMomentCaptionBtn").addEventListener("click",saveMomentCaption);
    $("closeMomentCaptionBtn").addEventListener("click",closeMomentCaption);
    $("momentCaptionBackdrop").addEventListener("click",e=>{
      if(e.target===$("momentCaptionBackdrop")) closeMomentCaption();
    });

    $("reviewAlert").addEventListener("click",()=>{
      const month = $("reviewAlert").dataset.month;
      if(month) state.reviewMonth = month;
      setView("review");
    });

    $("habitType").addEventListener("change",()=>populateGoalTypes());
    $("habitGoalType").addEventListener("change",toggleHabitFormFields);
    $("habitForm").addEventListener("submit",saveHabitFromForm);
    $("deleteHabitBtn").addEventListener("click",()=>{
      const id = $("editHabitId").value;
      if(id) permanentlyDeleteHabit(id);
    });
    $("closeHabitEditorBtn").addEventListener("click",closeHabitEditor);
    $("habitEditorBackdrop").addEventListener("click",e=>{
      if(e.target===$("habitEditorBackdrop")) closeHabitEditor();
    });

    $("closeStatsModalBtn").addEventListener("click",closeStatsModal);
    $("statsModalBackdrop").addEventListener("click",e=>{
      if(e.target===$("statsModalBackdrop")) closeStatsModal();
    });

    $("themeMode").addEventListener("change",e=>applyTheme(e.target.value));
    $("customColor").addEventListener("input",e=>applyAccent(e.target.value));
    document.querySelectorAll(".color-swatch").forEach(btn=>{
      btn.addEventListener("click",()=>applyAccent(btn.dataset.color));
    });

    ["dailyReminderEnabled","dailyReminderTime","quoteReminderEnabled","monthEndReminderEnabled","monthEndReminderTime"].forEach(id=>{
      $(id).addEventListener("change",saveReminderSettings);
    });
    $("enableNotificationsBtn").addEventListener("click",enableNotifications);
    $("testNotificationBtn").addEventListener("click",async()=>{
      const sent = await showLocalNotification("Habit Tracker","Notifications are working while the app is active.","test");
      toast(sent ? "Test notification sent" : "Enable notification permission first");
    });

    $("exportBtn").addEventListener("click",exportBackup);
    $("importFile").addEventListener("change",async e=>{
      const file = e.target.files?.[0];
      if(!file) return;
      try{
        await importBackup(file);
      }catch(err){
        toast(err.message || "Import failed");
      }finally{
        e.target.value = "";
      }
    });

    $("installGuideBtn").addEventListener("click",openInstallModal);
    $("closeInstallModalBtn").addEventListener("click",closeInstallModal);
    $("installModalBackdrop").addEventListener("click",e=>{
      if(e.target===$("installModalBackdrop")) closeInstallModal();
    });

    if(window.matchMedia){
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      const handler = ()=>{
        if(state.themeMode==="system"){
          document.documentElement.dataset.theme = effectiveTheme("system");
          const meta = document.querySelector('meta[name="theme-color"]');
          if(meta) meta.setAttribute("content",effectiveTheme("system")==="dark" ? "#0b0e0c" : "#ffffff");
        }
      };
      if(mq.addEventListener) mq.addEventListener("change",handler);
      else if(mq.addListener) mq.addListener(handler);
    }

    document.addEventListener("visibilitychange",()=>{
      if(document.visibilityState==="visible"){
        checkReminders();
        updateReviewAlert();
      }
    });
  }

  async function init(){
    db = await openDB();
    await cleanupUnusedLegacyStarterHabits();
    await refreshState();

    state.accentColor = await getSetting("accentColor","#0f7a4d");
    state.themeMode = await getSetting("themeMode","system");
    await applyAccent(state.accentColor,false);
    await applyTheme(state.themeMode,false);

    bindEvents();
    populateGoalTypes();
    await renderDaily();
    await renderBackupStatus();
    await updateReviewAlert();
    updateInstallUI();
    updateNotificationPermissionText();

    if("serviceWorker" in navigator){
      window.addEventListener("load",()=>{
        navigator.serviceWorker.register("./sw.js?v=8").catch(()=>{});
      });
    }

    startReminderChecks();
  }

  init().catch(err=>{
    console.error(err);
    alert("Could not start Habit Tracker: " + (err.message || err));
  });
})();
