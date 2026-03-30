════════════════════════════════════════════════════════════════════
                    IVAC APPOINTMENT HELPER TOOLKIT
                              Version 2.0
════════════════════════════════════════════════════════════════════

This toolkit helps you book IVAC Bangladesh visa appointments.
Contains multiple tools for different scenarios.


════════════════════════════════════════════════════════════════════
                         FILES INCLUDED
════════════════════════════════════════════════════════════════════

1. ivac-session-keeper.user.js    - MAIN SCRIPT (v1)
   Purpose: Keep your session alive after login
   Install: Tampermonkey browser extension

2. ivac-helper.user.js            - BACKUP SCRIPT (v2 Pro)
   Purpose: Direct API login, Token capture, Scheduled login
   Install: Tampermonkey browser extension

3. ivac-api-client.html           - BROWSER STANDALONE
   Purpose: Access API without opening IVAC website
   Usage: Just double-click to open in browser

4. ivac-api-node.js               - NODE.JS STANDALONE
   Purpose: 100% reliable API access (no CORS issues)
   Usage: Run with Node.js (see instructions below)


════════════════════════════════════════════════════════════════════
                    INSTALLATION INSTRUCTIONS
════════════════════════════════════════════════════════════════════

STEP 1: Install Tampermonkey Extension
─────────────────────────────────────────
Chrome: https://chrome.google.com/webstore/detail/tampermonkey
Firefox: https://addons.mozilla.org/firefox/addon/tampermonkey/
Edge: https://microsoftedge.microsoft.com/addons/detail/tampermonkey


STEP 2: Install v1 Script (Main)
─────────────────────────────────────────
1. Click Tampermonkey icon in browser
2. Click "Create a new script"
3. Delete all existing code
4. Open "ivac-session-keeper.user.js" with notepad
5. Copy ALL the code
6. Paste into Tampermonkey
7. Press Ctrl+S to save


STEP 3: Install v2 Script (Backup)
─────────────────────────────────────────
1. Click Tampermonkey icon in browser
2. Click "Create a new script"
3. Delete all existing code
4. Open "ivac-helper.user.js" with notepad
5. Copy ALL the code
6. Paste into Tampermonkey
7. Press Ctrl+S to save


STEP 4: Test Installation
─────────────────────────────────────────
1. Go to https://appointment.ivacbd.com/
2. You should see 2 floating panels on the right side
3. If you see them, installation is successful!


════════════════════════════════════════════════════════════════════
                       HOW TO USE
════════════════════════════════════════════════════════════════════

SCENARIO 1: Normal Login (Site is Open)
─────────────────────────────────────────
1. Go to appointment.ivacbd.com
2. In "IVAC Session Keeper" panel:
   - Enter your Email, Phone, Password
   - Click "Save"
   - Click "Quick Login" (fills form & clicks login)
3. Complete any CAPTCHA manually
4. Once logged in, turn ON "Keep Session Alive"
5. DON'T close the browser tab!
6. Your session will stay active even when site "closes"


SCENARIO 2: Site is Closed - Can't Login
─────────────────────────────────────────
1. In "IVAC Helper Pro" panel, go to "API Login" tab
2. Enter Email and Password
3. Click "Direct API Login"
4. If it works, you get a token and you're logged in!
5. If it returns 503, the API is also closed


SCENARIO 3: Scheduled Auto-Login
─────────────────────────────────────────
1. First, save your credentials in the Main tab
2. Go to "Schedule" tab in v2 Pro panel
3. Set the time when site opens (e.g., 09:00:00)
4. Set "Start before" to 5 seconds
5. Set "Retry interval" to 300 ms
6. Click "Start Scheduled Login"
7. Leave browser open - script will auto-login at that time!


SCENARIO 4: Use Saved Token
─────────────────────────────────────────
1. After successful login, go to "Tokens" tab
2. Click "Capture Current Token" to save your token
3. Next time you can't login:
   - Go to "Tokens" tab
   - Click "Inject Token"
   - Refresh page
   - You might be logged in without entering password!


════════════════════════════════════════════════════════════════════
                    NODE.JS VERSION (Advanced)
════════════════════════════════════════════════════════════════════

For 100% reliable API access without browser:

1. Install Node.js from https://nodejs.org/

2. Open Command Prompt or Terminal

3. Navigate to this folder:
   cd "path\to\this\folder"

4. Run the script:
   node ivac-api-node.js

5. Follow the menu options:
   - Press 1 to set your credentials
   - Press 2 to check if API is open
   - Press 4 for rapid fire login
   - Press 5 for scheduled login


════════════════════════════════════════════════════════════════════
                      BEST STRATEGY
════════════════════════════════════════════════════════════════════

THE SECRET: Stay logged in!

1. Login in the morning when site opens
2. Turn ON "Keep Session Alive"
3. DON'T close browser tab
4. Your session stays active even after site "closes"
5. Other users can't login, but YOU'RE ALREADY IN
6. Book your appointment anytime!


════════════════════════════════════════════════════════════════════
                      TROUBLESHOOTING
════════════════════════════════════════════════════════════════════

Problem: Scripts not showing on website
Solution: Make sure Tampermonkey is enabled and scripts are ON

Problem: CORS error in browser
Solution: Use the Node.js version (ivac-api-node.js)

Problem: API returns 503
Solution: API is closed. Wait for it to open or use scheduled login

Problem: Token expired
Solution: Login again and capture new token

Problem: Keep-alive not working
Solution: Make sure you don't close/refresh the browser tab


════════════════════════════════════════════════════════════════════
                         GOOD LUCK!
════════════════════════════════════════════════════════════════════
