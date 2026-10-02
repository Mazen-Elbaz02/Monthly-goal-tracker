HABIT TRACKER MOBILE V6

CONFIRMED CHANGES
- Renamed the main center page from Habits back to Daily.
- The large center dock button now says Daily.
- Removed the separate habit-management page permanently.
- The green + on Daily now opens:
  1) To-do for this day
  2) New habit
- One-day to-dos:
  - Belong only to the selected date
  - Do NOT affect habit scores
  - Do NOT affect streaks
  - Do NOT appear on Dashboard
  - Do NOT appear in Monthly Review statistics
  - Stay attached to the original date if unfinished
  - Are permanently deleted immediately when checked
  - Have no completed archive/history
- Habit creation still opens the full habit editor.
- Monthly Goals moved from Dashboard into Monthly Review.
- Dashboard is now performance-focused only.
- Monthly Review now holds both planning (monthly goals) and reflection.
- Existing monthly goals continue to use the same stored notes data, so older goals are preserved.
- Backup/restore now includes one-day to-dos too.

UPDATE GITHUB PAGES
1. Replace the root files on your Pages branch with the V6 files.
2. Keep the icons folder and apple-touch-icon.png.
3. Commit the changes.
4. Wait for the Pages deployment to finish.
5. Open your live URL once with:
   ?v=6
6. Refresh Safari.
7. Close and reopen the Home Screen app.
8. If iOS still shows an old cached UI, remove the Home Screen shortcut and add it again.
9. Export a backup first if your current data matters.

DATA SAFETY
Updating the hosted files normally does not erase IndexedDB data.
Completed one-day to-dos ARE intentionally deleted forever.
Permanent habit deletion still removes that habit and its stored history.
