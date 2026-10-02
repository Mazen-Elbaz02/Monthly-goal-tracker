HABIT TRACKER MOBILE V3

NEW IN THIS VERSION
- Fresh installs start with NO habits.
- Large green + appears when there are no habits.
- Green + button is always available on Daily.
- Tap a Daily habit name to open a stats popup with:
  - current streak
  - best streak
  - this-month performance
  - date added
  - numeric average when relevant
- Pencil icon on every Daily habit opens the habit editor.
- Each habit has a Show on dashboard switch.
- Only selected habits appear under Dashboard > Habit Performance.
- Delete forever permanently removes the habit and that habit's saved values from all days.
- Settings now has accent-color selection and System / Light / Dark theme.
- The old + installation helper is now an Install App button.
- Install App controls automatically disappear when the app detects that it is running from the iPhone Home Screen.
- Existing unused starter habits from V1/V2 are automatically removed only when there are no saved daily entries.

UPDATE YOUR GITHUB PAGES SITE
1. Open your habit-tracker GitHub repository.
2. Replace these files with the V3 files:
   index.html
   styles.css
   app.js
   manifest.webmanifest
   sw.js
   README.txt
3. Keep/upload these too:
   apple-touch-icon.png
   icons/icon-180.png
   icons/icon-192.png
   icons/icon-512.png
4. Commit the changes.
5. Wait for GitHub Pages to finish deploying.
6. Open the website in Safari once and refresh it.
7. Close and reopen the Home Screen app.
8. If the old version is still cached, remove the Home Screen icon and add the site to Home Screen again.

DATA SAFETY
- Updating the website files normally does NOT erase IndexedDB data already saved on the phone.
- Delete forever inside the app DOES permanently delete that habit and its saved history.
- Export backups regularly from Settings.

INSTALL DETECTION
- When launched from Safari, Install App is shown.
- When launched as an iPhone Home Screen web app, Install App is hidden when iOS reports standalone mode.
