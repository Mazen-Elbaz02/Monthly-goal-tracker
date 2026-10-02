HABIT TRACKER MOBILE — FREE LOCAL PWA

WHAT THIS IS
- Mobile-first habit tracker for iPhone.
- No Google Sheets.
- No database service.
- No paid backend.
- Data is stored locally in the browser using IndexedDB.
- Works offline after the first successful load.
- Continuous streaks can cross month boundaries.
- Includes Daily, Dashboard, Habits, Monthly Goals, Backup/Restore.

FILES
- index.html
- styles.css
- app.js
- manifest.webmanifest
- sw.js
- icons/

FREE HOSTING
Recommended: GitHub Pages.

GITHUB PAGES SETUP
1. Create a free GitHub account if you do not have one.
2. Create a NEW PUBLIC repository named, for example:
   habit-tracker
3. Upload ALL files and folders from this package to the repository root.
4. Open repository Settings -> Pages.
5. Under "Build and deployment", choose:
   Source: Deploy from a branch
   Branch: main
   Folder: /(root)
6. Save.
7. GitHub will give you a URL similar to:
   https://YOUR-USERNAME.github.io/habit-tracker/

IPHONE INSTALL
1. Open the GitHub Pages URL in Safari.
2. Tap Share.
3. Tap Add to Home Screen.
4. Turn on Open as Web App if shown.
5. Tap Add.

IMPORTANT ABOUT YOUR DATA
- Your actual habit data is NOT uploaded to GitHub.
- It stays in IndexedDB on your iPhone.
- Clearing Safari website data or deleting browser data can erase it.
- Use Settings -> Export backup regularly.
- To restore, use Settings -> Import backup.

DEFAULT HABITS
The app starts with habits based on your old spreadsheet.
You can edit/archive them or add new ones inside the Habits tab.

STREAK RULE
- Streaks continue across month boundaries.
- Missing completed days break the streak.
- If today has no entry yet, today does not break yesterday's active streak until you record the day.
- Tracking-only and target-value numeric habits do not currently receive streaks.

NO MONTH CREATION NEEDED
Months are calendar views, not separate files/tables.
The Dashboard month selector automatically works for any month.
