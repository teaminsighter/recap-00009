// ==UserScript==
// @name         IVAC Appointment Helper Pro
// @namespace    http://tampermonkey.net/
// @version      2.0
// @description  IVAC Bangladesh - Direct API, Token Reuse, Scheduled Login, Session Keeper
// @match        *://appointment.ivacbd.com/*
// @match        *://*.ivacbd.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @connect      api.ivacbd.com
// @connect      appointment.ivacbd.com
// ==/UserScript==

(function () {
    'use strict';

    // ════════════════════════════════════════════════════════════
    //  CONFIGURATION
    // ════════════════════════════════════════════════════════════
    const CONFIG = {
        apiBase: 'https://api.ivacbd.com',
        loginCheckInterval: 3,      // seconds
        scheduledRetryInterval: 500, // ms - how fast to retry during scheduled login
        scheduledDuration: 60,       // seconds - how long to keep trying
        keepAliveInterval: 30,       // seconds
        tokenRefreshBuffer: 300,     // seconds before expiry to refresh
    };

    // ════════════════════════════════════════════════════════════
    //  STATE
    // ════════════════════════════════════════════════════════════
    let state = {
        // Credentials
        email: '',
        phone: '',
        password: '',

        // Captured tokens (Method 5)
        authToken: '',
        refreshToken: '',
        tokenExpiry: null,
        cookies: '',

        // Session
        isLoggedIn: false,
        lastActivity: Date.now(),

        // Scheduled login (Method 6)
        scheduledTime: '',
        isScheduledRunning: false,

        // Settings
        soundEnabled: true,
    };

    // Load saved state
    try {
        const saved = JSON.parse(localStorage.getItem('ivacProState') || '{}');
        Object.assign(state, saved);
    } catch (e) {}

    // ════════════════════════════════════════════════════════════
    //  UI PANEL
    // ════════════════════════════════════════════════════════════
    const panel = document.createElement('div');
    panel.id = 'ivacPanel';
    panel.innerHTML = `
        <style>
            #ivacPanel {
                position: fixed;
                top: 20px;
                right: 20px;
                width: 380px;
                background: linear-gradient(135deg, #0f0f23 0%, #1a1a3e 100%);
                border-radius: 16px;
                color: #fff;
                font-family: 'Segoe UI', system-ui, sans-serif;
                font-size: 12px;
                z-index: 999999;
                box-shadow: 0 20px 60px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.1);
                overflow: hidden;
            }
            #ivacPanel * { box-sizing: border-box; }
            .ivac-header {
                background: linear-gradient(135deg, #ff4d4d 0%, #ff6b35 100%);
                padding: 14px 18px;
                display: flex;
                justify-content: space-between;
                align-items: center;
                cursor: move;
            }
            .ivac-header h3 { margin: 0; font-size: 15px; font-weight: 700; text-shadow: 0 1px 2px rgba(0,0,0,0.3); }
            .ivac-version { font-size: 10px; opacity: 0.8; }
            .ivac-minimize { cursor: pointer; font-size: 20px; opacity: 0.8; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; border-radius: 50%; background: rgba(0,0,0,0.2); }
            .ivac-minimize:hover { opacity: 1; background: rgba(0,0,0,0.4); }

            .ivac-tabs {
                display: flex;
                background: rgba(0,0,0,0.3);
                border-bottom: 1px solid rgba(255,255,255,0.1);
            }
            .ivac-tab {
                flex: 1;
                padding: 12px 8px;
                text-align: center;
                cursor: pointer;
                background: transparent;
                border: none;
                color: #888;
                font-size: 11px;
                font-weight: 600;
                transition: all 0.2s;
                border-bottom: 2px solid transparent;
            }
            .ivac-tab:hover { color: #ccc; }
            .ivac-tab.active {
                color: #ff6b35;
                border-bottom-color: #ff6b35;
                background: rgba(255,107,53,0.1);
            }

            .ivac-content {
                padding: 15px;
                max-height: 75vh;
                overflow-y: auto;
            }
            .ivac-content::-webkit-scrollbar { width: 6px; }
            .ivac-content::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.2); border-radius: 3px; }

            .ivac-tab-content { display: none; }
            .ivac-tab-content.active { display: block; }

            .ivac-section {
                background: rgba(255,255,255,0.03);
                border-radius: 10px;
                padding: 12px;
                margin-bottom: 12px;
                border: 1px solid rgba(255,255,255,0.05);
            }
            .ivac-section-title {
                font-size: 10px;
                color: #ff6b35;
                text-transform: uppercase;
                letter-spacing: 1.5px;
                margin-bottom: 10px;
                font-weight: 700;
            }
            .ivac-row {
                display: flex;
                gap: 8px;
                margin-bottom: 8px;
            }
            .ivac-row:last-child { margin-bottom: 0; }

            .ivac-input {
                flex: 1;
                padding: 12px;
                border: 1px solid rgba(255,255,255,0.1);
                border-radius: 8px;
                background: rgba(0,0,0,0.4);
                color: #fff;
                font-size: 13px;
                outline: none;
                transition: border-color 0.2s;
            }
            .ivac-input:focus { border-color: #ff6b35; }
            .ivac-input::placeholder { color: rgba(255,255,255,0.3); }
            .ivac-input.small { padding: 8px 10px; font-size: 12px; }

            .ivac-btn {
                padding: 12px 16px;
                border: none;
                border-radius: 8px;
                cursor: pointer;
                font-size: 12px;
                font-weight: 600;
                transition: all 0.2s;
                color: #fff;
                text-transform: uppercase;
                letter-spacing: 0.5px;
            }
            .ivac-btn:hover { transform: translateY(-1px); filter: brightness(1.1); }
            .ivac-btn:active { transform: translateY(0); }
            .ivac-btn:disabled { opacity: 0.4; cursor: not-allowed; transform: none; }
            .ivac-btn.orange { background: linear-gradient(135deg, #ff6b35, #ff4d4d); }
            .ivac-btn.green { background: linear-gradient(135deg, #00c853, #00a844); }
            .ivac-btn.blue { background: linear-gradient(135deg, #2196f3, #1976d2); }
            .ivac-btn.purple { background: linear-gradient(135deg, #9c27b0, #7b1fa2); }
            .ivac-btn.red { background: linear-gradient(135deg, #f44336, #d32f2f); }
            .ivac-btn.gray { background: linear-gradient(135deg, #607d8b, #455a64); }
            .ivac-btn.cyan { background: linear-gradient(135deg, #00bcd4, #0097a7); }
            .ivac-btn.full { width: 100%; }

            .ivac-status-bar {
                padding: 10px 15px;
                background: rgba(0,0,0,0.4);
                display: flex;
                align-items: center;
                gap: 10px;
                font-size: 11px;
            }
            .ivac-status-dot {
                width: 10px;
                height: 10px;
                border-radius: 50%;
                background: #ef5350;
                flex-shrink: 0;
            }
            .ivac-status-dot.online { background: #4caf50; animation: pulse 1.5s infinite; }
            .ivac-status-dot.checking { background: #ff9800; animation: pulse 0.5s infinite; }
            .ivac-status-dot.scheduled { background: #2196f3; animation: pulse 1s infinite; }
            @keyframes pulse {
                0%, 100% { box-shadow: 0 0 0 0 currentColor; }
                50% { box-shadow: 0 0 0 6px transparent; }
            }

            .ivac-timer {
                font-size: 32px;
                font-weight: 700;
                text-align: center;
                padding: 20px;
                background: linear-gradient(135deg, rgba(255,107,53,0.2), rgba(255,77,77,0.2));
                border-radius: 12px;
                margin-bottom: 12px;
                font-family: 'Courier New', monospace;
                border: 1px solid rgba(255,107,53,0.3);
            }
            .ivac-timer.urgent {
                color: #ff4d4d;
                animation: blink 0.3s infinite;
                background: linear-gradient(135deg, rgba(255,77,77,0.3), rgba(255,0,0,0.2));
            }
            .ivac-timer.success {
                color: #4caf50;
                background: linear-gradient(135deg, rgba(76,175,80,0.3), rgba(0,200,83,0.2));
            }
            @keyframes blink {
                0%, 100% { opacity: 1; }
                50% { opacity: 0.5; }
            }

            .ivac-log {
                background: rgba(0,0,0,0.5);
                border-radius: 8px;
                padding: 12px;
                font-size: 11px;
                height: 120px;
                color: #aaa;
                overflow-y: auto;
                font-family: 'Courier New', monospace;
                border: 1px solid rgba(255,255,255,0.05);
            }
            .ivac-log-entry { margin-bottom: 4px; line-height: 1.4; }
            .ivac-log-time { color: #666; }

            .ivac-token-display {
                background: rgba(0,0,0,0.5);
                border-radius: 8px;
                padding: 10px;
                font-size: 10px;
                font-family: 'Courier New', monospace;
                word-break: break-all;
                max-height: 80px;
                overflow-y: auto;
                color: #4caf50;
                border: 1px solid rgba(76,175,80,0.3);
            }
            .ivac-token-display.empty { color: #666; }

            .ivac-label {
                font-size: 10px;
                color: #888;
                margin-bottom: 6px;
                display: block;
                text-transform: uppercase;
                letter-spacing: 0.5px;
            }

            .ivac-grid {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 8px;
            }

            .ivac-stat {
                background: rgba(0,0,0,0.3);
                padding: 10px;
                border-radius: 8px;
                text-align: center;
            }
            .ivac-stat-value { font-size: 18px; font-weight: 700; color: #ff6b35; }
            .ivac-stat-label { font-size: 9px; color: #666; text-transform: uppercase; margin-top: 4px; }

            .ivac-hidden { display: none !important; }

            .ivac-badge {
                display: inline-block;
                padding: 3px 8px;
                border-radius: 4px;
                font-size: 9px;
                font-weight: 600;
                text-transform: uppercase;
            }
            .ivac-badge.success { background: rgba(76,175,80,0.2); color: #4caf50; }
            .ivac-badge.error { background: rgba(244,67,54,0.2); color: #f44336; }
            .ivac-badge.warning { background: rgba(255,152,0,0.2); color: #ff9800; }
        </style>

        <div class="ivac-header">
            <div>
                <h3>IVAC Helper Pro</h3>
                <span class="ivac-version">v2.0 - Advanced Mode</span>
            </div>
            <span class="ivac-minimize" id="ivacMinimize">−</span>
        </div>

        <div class="ivac-status-bar">
            <span class="ivac-status-dot" id="statusDot"></span>
            <span id="statusText">Initializing...</span>
        </div>

        <div class="ivac-tabs">
            <button class="ivac-tab active" data-tab="main">Main</button>
            <button class="ivac-tab" data-tab="api">API Login</button>
            <button class="ivac-tab" data-tab="token">Tokens</button>
            <button class="ivac-tab" data-tab="schedule">Schedule</button>
        </div>

        <div class="ivac-content" id="ivacContent">

            <!-- MAIN TAB -->
            <div class="ivac-tab-content active" id="tabMain">
                <div class="ivac-section">
                    <div class="ivac-section-title">Credentials</div>
                    <div class="ivac-row">
                        <input type="email" class="ivac-input" id="inputEmail" placeholder="Email Address">
                    </div>
                    <div class="ivac-row">
                        <input type="tel" class="ivac-input" id="inputPhone" placeholder="Phone Number">
                    </div>
                    <div class="ivac-row">
                        <input type="password" class="ivac-input" id="inputPassword" placeholder="Password">
                    </div>
                    <div class="ivac-row">
                        <button class="ivac-btn blue" id="btnSaveCredentials">Save</button>
                        <button class="ivac-btn orange" id="btnFillForm">Fill Form</button>
                    </div>
                </div>

                <div class="ivac-section">
                    <div class="ivac-section-title">Quick Actions</div>
                    <div class="ivac-grid">
                        <button class="ivac-btn green" id="btnQuickLogin">Quick Login</button>
                        <button class="ivac-btn cyan" id="btnCheckStatus">Check API</button>
                        <button class="ivac-btn purple" id="btnKeepAlive">Keep Alive</button>
                        <button class="ivac-btn gray" id="btnRefresh">Refresh</button>
                    </div>
                </div>

                <div class="ivac-section">
                    <div class="ivac-section-title">Activity Log</div>
                    <div class="ivac-log" id="logBox"></div>
                </div>
            </div>

            <!-- API LOGIN TAB (Method 4) -->
            <div class="ivac-tab-content" id="tabApi">
                <div class="ivac-section">
                    <div class="ivac-section-title">Method 4: Direct API Login</div>
                    <p style="color:#888;font-size:11px;margin-bottom:12px;">
                        Bypass website, call API directly. Sometimes works when website shows "closed".
                    </p>
                    <div class="ivac-row">
                        <input type="email" class="ivac-input" id="apiEmail" placeholder="Email">
                    </div>
                    <div class="ivac-row">
                        <input type="password" class="ivac-input" id="apiPassword" placeholder="Password">
                    </div>
                    <div class="ivac-row">
                        <button class="ivac-btn orange full" id="btnApiLogin">Direct API Login</button>
                    </div>
                </div>

                <div class="ivac-section">
                    <div class="ivac-section-title">API Response</div>
                    <div class="ivac-token-display empty" id="apiResponse">Response will appear here...</div>
                </div>

                <div class="ivac-section">
                    <div class="ivac-section-title">Rapid Fire Mode</div>
                    <p style="color:#888;font-size:11px;margin-bottom:12px;">
                        Send multiple login requests rapidly. Use when site is about to open.
                    </p>
                    <div class="ivac-row">
                        <input type="number" class="ivac-input small" id="rapidCount" value="10" min="1" max="50" style="width:80px;">
                        <input type="number" class="ivac-input small" id="rapidDelay" value="200" min="50" max="2000" style="width:100px;" placeholder="Delay ms">
                        <button class="ivac-btn red" id="btnRapidFire">Rapid Fire</button>
                    </div>
                    <div class="ivac-grid" style="margin-top:8px;">
                        <div class="ivac-stat">
                            <div class="ivac-stat-value" id="statAttempts">0</div>
                            <div class="ivac-stat-label">Attempts</div>
                        </div>
                        <div class="ivac-stat">
                            <div class="ivac-stat-value" id="statSuccess">0</div>
                            <div class="ivac-stat-label">Success</div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- TOKEN TAB (Method 5) -->
            <div class="ivac-tab-content" id="tabToken">
                <div class="ivac-section">
                    <div class="ivac-section-title">Method 5: Token Capture & Reuse</div>
                    <p style="color:#888;font-size:11px;margin-bottom:12px;">
                        Capture your auth token after login. Reuse it later to stay logged in.
                    </p>
                    <div class="ivac-row">
                        <button class="ivac-btn cyan full" id="btnCaptureToken">Capture Current Token</button>
                    </div>
                </div>

                <div class="ivac-section">
                    <div class="ivac-section-title">Stored Auth Token</div>
                    <div class="ivac-token-display" id="tokenDisplay">No token captured yet...</div>
                    <div style="margin-top:8px;display:flex;gap:8px;">
                        <span class="ivac-badge" id="tokenStatus">NO TOKEN</span>
                        <span style="color:#666;font-size:10px;" id="tokenExpiry"></span>
                    </div>
                </div>

                <div class="ivac-section">
                    <div class="ivac-section-title">Manual Token Input</div>
                    <div class="ivac-row">
                        <input type="text" class="ivac-input small" id="manualToken" placeholder="Paste token here...">
                    </div>
                    <div class="ivac-row">
                        <button class="ivac-btn green" id="btnSaveToken">Save Token</button>
                        <button class="ivac-btn purple" id="btnInjectToken">Inject Token</button>
                        <button class="ivac-btn red" id="btnClearToken">Clear</button>
                    </div>
                </div>

                <div class="ivac-section">
                    <div class="ivac-section-title">Cookie Capture</div>
                    <div class="ivac-row">
                        <button class="ivac-btn cyan" id="btnCaptureCookies">Capture Cookies</button>
                        <button class="ivac-btn purple" id="btnRestoreCookies">Restore Cookies</button>
                    </div>
                    <div class="ivac-token-display" id="cookieDisplay" style="margin-top:8px;">No cookies captured...</div>
                </div>
            </div>

            <!-- SCHEDULE TAB (Method 6) -->
            <div class="ivac-tab-content" id="tabSchedule">
                <div class="ivac-section">
                    <div class="ivac-section-title">Method 6: Scheduled Auto-Login</div>
                    <p style="color:#888;font-size:11px;margin-bottom:12px;">
                        Set exact time. Script will attempt login at that moment with rapid retries.
                    </p>

                    <div class="ivac-timer" id="scheduleTimer">--:--:--</div>

                    <label class="ivac-label">Target Login Time</label>
                    <div class="ivac-row">
                        <input type="time" class="ivac-input" id="scheduleTime" step="1">
                        <button class="ivac-btn green" id="btnSetSchedule">Set</button>
                    </div>
                </div>

                <div class="ivac-section">
                    <div class="ivac-section-title">Schedule Settings</div>
                    <label class="ivac-label">Start attempting (seconds before)</label>
                    <div class="ivac-row">
                        <input type="number" class="ivac-input small" id="scheduleOffset" value="5" min="0" max="60">
                    </div>
                    <label class="ivac-label">Retry interval (milliseconds)</label>
                    <div class="ivac-row">
                        <input type="number" class="ivac-input small" id="scheduleInterval" value="300" min="100" max="5000">
                    </div>
                    <label class="ivac-label">Keep trying for (seconds)</label>
                    <div class="ivac-row">
                        <input type="number" class="ivac-input small" id="scheduleDuration" value="120" min="10" max="600">
                    </div>
                </div>

                <div class="ivac-section">
                    <div class="ivac-section-title">Schedule Control</div>
                    <div class="ivac-row">
                        <button class="ivac-btn orange full" id="btnStartSchedule">Start Scheduled Login</button>
                    </div>
                    <div class="ivac-row">
                        <button class="ivac-btn red full" id="btnStopSchedule" disabled>Stop Schedule</button>
                    </div>
                    <div class="ivac-grid" style="margin-top:12px;">
                        <div class="ivac-stat">
                            <div class="ivac-stat-value" id="schedAttempts">0</div>
                            <div class="ivac-stat-label">Attempts</div>
                        </div>
                        <div class="ivac-stat">
                            <div class="ivac-stat-value" id="schedStatus">IDLE</div>
                            <div class="ivac-stat-label">Status</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(panel);

    // ════════════════════════════════════════════════════════════
    //  UI HELPERS
    // ════════════════════════════════════════════════════════════
    const $ = id => document.getElementById(id);
    const logBox = $('logBox');
    let isMinimized = false;

    // Tabs
    document.querySelectorAll('.ivac-tab').forEach(tab => {
        tab.onclick = () => {
            document.querySelectorAll('.ivac-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.ivac-tab-content').forEach(c => c.classList.remove('active'));
            tab.classList.add('active');
            $('tab' + tab.dataset.tab.charAt(0).toUpperCase() + tab.dataset.tab.slice(1)).classList.add('active');
        };
    });

    // Minimize
    $('ivacMinimize').onclick = () => {
        isMinimized = !isMinimized;
        $('ivacContent').classList.toggle('ivac-hidden', isMinimized);
        document.querySelector('.ivac-tabs').classList.toggle('ivac-hidden', isMinimized);
        $('ivacMinimize').textContent = isMinimized ? '+' : '−';
    };

    // Drag
    let isDragging = false, dragX = 0, dragY = 0;
    panel.querySelector('.ivac-header').addEventListener('mousedown', e => {
        if (e.target.id === 'ivacMinimize') return;
        isDragging = true;
        dragX = e.clientX - panel.offsetLeft;
        dragY = e.clientY - panel.offsetTop;
    });
    document.addEventListener('mousemove', e => {
        if (isDragging) {
            panel.style.left = (e.clientX - dragX) + 'px';
            panel.style.top = (e.clientY - dragY) + 'px';
            panel.style.right = 'auto';
        }
    });
    document.addEventListener('mouseup', () => isDragging = false);

    // ════════════════════════════════════════════════════════════
    //  LOGGING
    // ════════════════════════════════════════════════════════════
    function log(msg, color = '#aaa') {
        const time = new Date().toLocaleTimeString();
        const entry = document.createElement('div');
        entry.className = 'ivac-log-entry';
        entry.innerHTML = `<span class="ivac-log-time">[${time}]</span> <span style="color:${color}">${msg}</span>`;
        logBox.insertBefore(entry, logBox.firstChild);
        console.log('[IVAC Pro]', msg);
    }

    function updateStatus(text, status = '') {
        $('statusText').textContent = text;
        $('statusDot').className = 'ivac-status-dot ' + status;
    }

    // ════════════════════════════════════════════════════════════
    //  SOUND
    // ════════════════════════════════════════════════════════════
    function playAlert() {
        if (!state.soundEnabled) return;
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            [880, 1100, 880, 1100, 880].forEach((freq, i) => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.frequency.value = freq;
                osc.type = 'square';
                gain.gain.setValueAtTime(0.3, ctx.currentTime + i * 0.12);
                gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + i * 0.12 + 0.1);
                osc.start(ctx.currentTime + i * 0.12);
                osc.stop(ctx.currentTime + i * 0.12 + 0.1);
            });
        } catch (e) {}
    }

    function playSuccess() {
        if (!state.soundEnabled) return;
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            [523, 659, 784, 1047].forEach((freq, i) => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.frequency.value = freq;
                gain.gain.setValueAtTime(0.2, ctx.currentTime + i * 0.15);
                gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + i * 0.15 + 0.2);
                osc.start(ctx.currentTime + i * 0.15);
                osc.stop(ctx.currentTime + i * 0.15 + 0.2);
            });
        } catch (e) {}
    }

    // ════════════════════════════════════════════════════════════
    //  SAVE/LOAD STATE
    // ════════════════════════════════════════════════════════════
    function saveState() {
        const toSave = {
            email: state.email,
            phone: state.phone,
            password: btoa(state.password || ''),
            authToken: state.authToken,
            refreshToken: state.refreshToken,
            tokenExpiry: state.tokenExpiry,
            cookies: state.cookies,
            scheduledTime: state.scheduledTime,
        };
        localStorage.setItem('ivacProState', JSON.stringify(toSave));
    }

    function loadState() {
        try {
            const saved = JSON.parse(localStorage.getItem('ivacProState') || '{}');
            state.email = saved.email || '';
            state.phone = saved.phone || '';
            state.password = saved.password ? atob(saved.password) : '';
            state.authToken = saved.authToken || '';
            state.refreshToken = saved.refreshToken || '';
            state.tokenExpiry = saved.tokenExpiry;
            state.cookies = saved.cookies || '';
            state.scheduledTime = saved.scheduledTime || '';
        } catch (e) {}
    }

    function loadUI() {
        $('inputEmail').value = state.email;
        $('inputPhone').value = state.phone;
        $('inputPassword').value = state.password;
        $('apiEmail').value = state.email;
        $('apiPassword').value = state.password;
        $('scheduleTime').value = state.scheduledTime;

        updateTokenDisplay();
        updateCookieDisplay();
    }

    // ════════════════════════════════════════════════════════════
    //  METHOD 4: DIRECT API LOGIN
    // ════════════════════════════════════════════════════════════

    async function directApiLogin(email, password) {
        log('Attempting direct API login...', '#ff9800');
        updateStatus('API Login...', 'checking');

        try {
            const response = await fetch(`${CONFIG.apiBase}/iams/api/v1/auth/signin`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'Origin': 'https://appointment.ivacbd.com',
                    'Referer': 'https://appointment.ivacbd.com/'
                },
                body: JSON.stringify({
                    email: email,
                    password: password
                }),
                credentials: 'include'
            });

            const data = await response.json().catch(() => ({}));

            $('apiResponse').textContent = JSON.stringify(data, null, 2);
            $('apiResponse').classList.remove('empty');

            if (response.ok && (data.token || data.accessToken || data.access_token)) {
                const token = data.token || data.accessToken || data.access_token;
                state.authToken = token;
                state.refreshToken = data.refreshToken || data.refresh_token || '';
                state.isLoggedIn = true;
                saveState();

                log('LOGIN SUCCESS! Token captured.', '#4caf50');
                updateStatus('Logged In!', 'online');
                updateTokenDisplay();
                playSuccess();

                return { success: true, token, data };
            } else if (response.status === 503) {
                log('API returned 503 - Service closed', '#f44336');
                updateStatus('API Closed (503)', '');
                return { success: false, error: '503 - Service Unavailable' };
            } else {
                log(`API Error: ${response.status} - ${data.message || 'Unknown'}`, '#f44336');
                updateStatus(`Error: ${response.status}`, '');
                return { success: false, error: data.message || response.status };
            }
        } catch (e) {
            log('API Request failed: ' + e.message, '#f44336');
            updateStatus('Request Failed', '');

            // Try with GM_xmlhttpRequest if available (bypasses CORS)
            if (typeof GM_xmlhttpRequest !== 'undefined') {
                return await gmApiLogin(email, password);
            }

            return { success: false, error: e.message };
        }
    }

    // GM_xmlhttpRequest version (bypasses CORS)
    function gmApiLogin(email, password) {
        return new Promise((resolve) => {
            if (typeof GM_xmlhttpRequest === 'undefined') {
                resolve({ success: false, error: 'GM_xmlhttpRequest not available' });
                return;
            }

            log('Trying GM_xmlhttpRequest (CORS bypass)...', '#ff9800');

            GM_xmlhttpRequest({
                method: 'POST',
                url: `${CONFIG.apiBase}/iams/api/v1/auth/signin`,
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                data: JSON.stringify({ email, password }),
                onload: function(response) {
                    try {
                        const data = JSON.parse(response.responseText);
                        $('apiResponse').textContent = JSON.stringify(data, null, 2);

                        if (response.status === 200 && (data.token || data.accessToken)) {
                            const token = data.token || data.accessToken;
                            state.authToken = token;
                            state.isLoggedIn = true;
                            saveState();

                            log('GM Login SUCCESS!', '#4caf50');
                            updateStatus('Logged In!', 'online');
                            updateTokenDisplay();
                            playSuccess();

                            resolve({ success: true, token, data });
                        } else {
                            log(`GM Error: ${response.status}`, '#f44336');
                            resolve({ success: false, error: response.status });
                        }
                    } catch (e) {
                        log('GM Parse error: ' + e.message, '#f44336');
                        resolve({ success: false, error: e.message });
                    }
                },
                onerror: function(e) {
                    log('GM Request error', '#f44336');
                    resolve({ success: false, error: 'Request failed' });
                }
            });
        });
    }

    // Rapid fire login attempts
    let rapidFireRunning = false;
    let rapidAttempts = 0;
    let rapidSuccess = 0;

    async function startRapidFire() {
        const count = parseInt($('rapidCount').value) || 10;
        const delay = parseInt($('rapidDelay').value) || 200;
        const email = $('apiEmail').value || state.email;
        const password = $('apiPassword').value || state.password;

        if (!email || !password) {
            log('Enter email and password first!', '#f44336');
            return;
        }

        rapidFireRunning = true;
        rapidAttempts = 0;
        rapidSuccess = 0;
        $('btnRapidFire').disabled = true;
        $('btnRapidFire').textContent = 'Running...';

        log(`Starting rapid fire: ${count} attempts, ${delay}ms delay`, '#ff9800');

        for (let i = 0; i < count && rapidFireRunning; i++) {
            rapidAttempts++;
            $('statAttempts').textContent = rapidAttempts;

            const result = await directApiLogin(email, password);

            if (result.success) {
                rapidSuccess++;
                $('statSuccess').textContent = rapidSuccess;
                log(`Rapid fire SUCCESS on attempt ${i + 1}!`, '#4caf50');
                break;
            }

            if (i < count - 1) {
                await new Promise(r => setTimeout(r, delay));
            }
        }

        rapidFireRunning = false;
        $('btnRapidFire').disabled = false;
        $('btnRapidFire').textContent = 'Rapid Fire';
        log(`Rapid fire completed: ${rapidAttempts} attempts, ${rapidSuccess} success`, '#888');
    }

    // ════════════════════════════════════════════════════════════
    //  METHOD 5: TOKEN CAPTURE & REUSE
    // ════════════════════════════════════════════════════════════

    function captureToken() {
        log('Scanning for auth tokens...', '#ff9800');

        // Check localStorage
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            const value = localStorage.getItem(key);

            if (value && (
                value.startsWith('eyJ') || // JWT
                key.toLowerCase().includes('token') ||
                key.toLowerCase().includes('auth')
            )) {
                log(`Found in localStorage[${key}]`, '#4caf50');

                if (value.startsWith('eyJ')) {
                    state.authToken = value;
                    saveState();
                    updateTokenDisplay();
                    playSuccess();
                    return;
                }

                try {
                    const parsed = JSON.parse(value);
                    if (parsed.token || parsed.accessToken || parsed.access_token) {
                        state.authToken = parsed.token || parsed.accessToken || parsed.access_token;
                        state.refreshToken = parsed.refreshToken || parsed.refresh_token || '';
                        saveState();
                        updateTokenDisplay();
                        playSuccess();
                        log('Token captured from localStorage!', '#4caf50');
                        return;
                    }
                } catch (e) {}
            }
        }

        // Check sessionStorage
        for (let i = 0; i < sessionStorage.length; i++) {
            const key = sessionStorage.key(i);
            const value = sessionStorage.getItem(key);

            if (value && value.startsWith('eyJ')) {
                state.authToken = value;
                saveState();
                updateTokenDisplay();
                log('Token captured from sessionStorage!', '#4caf50');
                playSuccess();
                return;
            }
        }

        // Check cookies
        const cookies = document.cookie;
        const tokenMatch = cookies.match(/token=([^;]+)/);
        if (tokenMatch) {
            state.authToken = tokenMatch[1];
            saveState();
            updateTokenDisplay();
            log('Token captured from cookies!', '#4caf50');
            playSuccess();
            return;
        }

        log('No token found. Try logging in first.', '#f44336');
    }

    function updateTokenDisplay() {
        const display = $('tokenDisplay');
        const status = $('tokenStatus');
        const expiry = $('tokenExpiry');

        if (state.authToken) {
            display.textContent = state.authToken.substring(0, 100) + '...';
            display.classList.remove('empty');
            status.className = 'ivac-badge success';
            status.textContent = 'TOKEN SAVED';

            // Try to decode JWT expiry
            try {
                const parts = state.authToken.split('.');
                if (parts.length === 3) {
                    const payload = JSON.parse(atob(parts[1]));
                    if (payload.exp) {
                        const expDate = new Date(payload.exp * 1000);
                        expiry.textContent = `Expires: ${expDate.toLocaleString()}`;
                        state.tokenExpiry = payload.exp;
                    }
                }
            } catch (e) {}
        } else {
            display.textContent = 'No token captured yet...';
            display.classList.add('empty');
            status.className = 'ivac-badge error';
            status.textContent = 'NO TOKEN';
            expiry.textContent = '';
        }
    }

    function injectToken() {
        if (!state.authToken) {
            log('No token to inject!', '#f44336');
            return;
        }

        // Store in various places
        localStorage.setItem('authToken', state.authToken);
        localStorage.setItem('token', state.authToken);
        localStorage.setItem('accessToken', state.authToken);
        sessionStorage.setItem('authToken', state.authToken);

        // Try to set cookie
        document.cookie = `token=${state.authToken}; path=/; domain=.ivacbd.com`;

        log('Token injected into storage & cookies!', '#4caf50');
        playSuccess();

        // Refresh page to apply
        if (confirm('Token injected. Refresh page to apply?')) {
            location.reload();
        }
    }

    function captureCookies() {
        state.cookies = document.cookie;
        saveState();
        updateCookieDisplay();
        log('Cookies captured!', '#4caf50');
    }

    function restoreCookies() {
        if (!state.cookies) {
            log('No cookies to restore!', '#f44336');
            return;
        }

        // Parse and set each cookie
        state.cookies.split(';').forEach(cookie => {
            document.cookie = cookie.trim() + '; path=/; domain=.ivacbd.com';
        });

        log('Cookies restored!', '#4caf50');

        if (confirm('Cookies restored. Refresh page?')) {
            location.reload();
        }
    }

    function updateCookieDisplay() {
        const display = $('cookieDisplay');
        if (state.cookies) {
            display.textContent = state.cookies.substring(0, 200) + (state.cookies.length > 200 ? '...' : '');
            display.classList.remove('empty');
        } else {
            display.textContent = 'No cookies captured...';
            display.classList.add('empty');
        }
    }

    // ════════════════════════════════════════════════════════════
    //  METHOD 6: SCHEDULED LOGIN
    // ════════════════════════════════════════════════════════════

    let scheduleInterval = null;
    let scheduleTimeout = null;
    let schedAttempts = 0;

    function updateScheduleTimer() {
        const now = new Date();
        const timeStr = $('scheduleTime').value;

        if (!timeStr) {
            $('scheduleTimer').textContent = '--:--:--';
            return;
        }

        const [hours, minutes, seconds = 0] = timeStr.split(':').map(Number);
        const target = new Date();
        target.setHours(hours, minutes, seconds, 0);

        // If time has passed, assume tomorrow
        if (target <= now) {
            target.setDate(target.getDate() + 1);
        }

        const diff = target - now;
        const h = Math.floor(diff / 3600000);
        const m = Math.floor((diff % 3600000) / 60000);
        const s = Math.floor((diff % 60000) / 1000);

        $('scheduleTimer').textContent =
            `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;

        // Urgency indicator
        if (diff < 10000) {
            $('scheduleTimer').classList.add('urgent');
        } else {
            $('scheduleTimer').classList.remove('urgent');
        }
    }

    async function startScheduledLogin() {
        const timeStr = $('scheduleTime').value;
        const offset = parseInt($('scheduleOffset').value) || 5;
        const interval = parseInt($('scheduleInterval').value) || 300;
        const duration = parseInt($('scheduleDuration').value) || 120;
        const email = state.email || $('apiEmail').value;
        const password = state.password || $('apiPassword').value;

        if (!timeStr) {
            log('Set a target time first!', '#f44336');
            return;
        }

        if (!email || !password) {
            log('Save credentials first!', '#f44336');
            return;
        }

        const [hours, minutes, seconds = 0] = timeStr.split(':').map(Number);
        const target = new Date();
        target.setHours(hours, minutes, seconds, 0);

        // If time has passed, assume tomorrow
        const now = new Date();
        if (target <= now) {
            target.setDate(target.getDate() + 1);
        }

        // Calculate start time (offset seconds before target)
        const startTime = new Date(target.getTime() - (offset * 1000));
        const waitTime = startTime - now;

        if (waitTime < 0) {
            log('Target time already passed!', '#f44336');
            return;
        }

        state.isScheduledRunning = true;
        state.scheduledTime = timeStr;
        saveState();

        $('btnStartSchedule').disabled = true;
        $('btnStopSchedule').disabled = false;
        $('schedStatus').textContent = 'WAITING';
        schedAttempts = 0;

        log(`Scheduled for ${timeStr}. Starting ${offset}s before. Will try for ${duration}s.`, '#4caf50');
        updateStatus('Scheduled', 'scheduled');

        // Wait until start time
        scheduleTimeout = setTimeout(async () => {
            log('STARTING SCHEDULED LOGIN ATTEMPTS!', '#ff9800');
            $('schedStatus').textContent = 'RUNNING';
            $('scheduleTimer').classList.add('urgent');
            playAlert();

            const endTime = Date.now() + (duration * 1000);

            const attemptLogin = async () => {
                if (!state.isScheduledRunning || Date.now() > endTime) {
                    stopScheduledLogin();
                    return;
                }

                schedAttempts++;
                $('schedAttempts').textContent = schedAttempts;

                const result = await directApiLogin(email, password);

                if (result.success) {
                    log('SCHEDULED LOGIN SUCCESS!', '#4caf50');
                    $('schedStatus').textContent = 'SUCCESS!';
                    $('scheduleTimer').classList.remove('urgent');
                    $('scheduleTimer').classList.add('success');
                    playSuccess();
                    stopScheduledLogin();
                    return;
                }

                // Continue trying
                if (state.isScheduledRunning && Date.now() < endTime) {
                    setTimeout(attemptLogin, interval);
                } else {
                    stopScheduledLogin();
                }
            };

            attemptLogin();

        }, waitTime);

        // Update timer display
        scheduleInterval = setInterval(updateScheduleTimer, 1000);
    }

    function stopScheduledLogin() {
        state.isScheduledRunning = false;

        if (scheduleTimeout) {
            clearTimeout(scheduleTimeout);
            scheduleTimeout = null;
        }
        if (scheduleInterval) {
            clearInterval(scheduleInterval);
            scheduleInterval = null;
        }

        $('btnStartSchedule').disabled = false;
        $('btnStopSchedule').disabled = true;
        $('scheduleTimer').classList.remove('urgent');

        if ($('schedStatus').textContent !== 'SUCCESS!') {
            $('schedStatus').textContent = 'STOPPED';
        }

        updateStatus('Ready', '');
        log('Schedule stopped', '#888');
    }

    // ════════════════════════════════════════════════════════════
    //  FORM FILL & QUICK LOGIN
    // ════════════════════════════════════════════════════════════

    function fillForm() {
        const selectors = {
            email: 'input[type="email"], input[name="email"], input[id*="email"], input[placeholder*="email" i]',
            phone: 'input[type="tel"], input[name="phone"], input[name="mobile"], input[id*="phone"], input[placeholder*="phone" i]',
            password: 'input[type="password"], input[name="password"], input[id*="password"]'
        };

        let filled = 0;

        document.querySelectorAll(selectors.email).forEach(input => {
            if (state.email) {
                input.value = state.email;
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.dispatchEvent(new Event('change', { bubbles: true }));
                filled++;
            }
        });

        document.querySelectorAll(selectors.phone).forEach(input => {
            if (state.phone) {
                input.value = state.phone;
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.dispatchEvent(new Event('change', { bubbles: true }));
                filled++;
            }
        });

        document.querySelectorAll(selectors.password).forEach(input => {
            if (state.password) {
                input.value = state.password;
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.dispatchEvent(new Event('change', { bubbles: true }));
                filled++;
            }
        });

        if (filled > 0) {
            log(`Filled ${filled} form fields`, '#4caf50');
            playSuccess();
        } else {
            log('No form fields found on this page', '#f44336');
        }
    }

    function quickLogin() {
        fillForm();

        setTimeout(() => {
            // Find and click login button
            const buttons = document.querySelectorAll('button, input[type="submit"]');
            for (const btn of buttons) {
                const text = (btn.textContent || btn.value || '').toLowerCase();
                if (text.includes('login') || text.includes('sign in') || text.includes('submit') || text.includes('log in')) {
                    log('Clicking login button...', '#ff9800');
                    btn.click();
                    return;
                }
            }
            log('Login button not found', '#f44336');
        }, 300);
    }

    // ════════════════════════════════════════════════════════════
    //  KEEP ALIVE
    // ════════════════════════════════════════════════════════════

    let keepAliveInterval = null;

    function toggleKeepAlive() {
        if (keepAliveInterval) {
            clearInterval(keepAliveInterval);
            keepAliveInterval = null;
            log('Keep-alive stopped', '#888');
            $('btnKeepAlive').textContent = 'Keep Alive';
        } else {
            keepAliveInterval = setInterval(() => {
                // Simulate activity
                document.dispatchEvent(new MouseEvent('mousemove', {
                    clientX: Math.random() * 100,
                    clientY: Math.random() * 100
                }));

                // Touch a storage item
                localStorage.setItem('ivac_keepalive', Date.now().toString());

                log('Keep-alive ping', '#666');
            }, CONFIG.keepAliveInterval * 1000);

            log('Keep-alive started (every ' + CONFIG.keepAliveInterval + 's)', '#4caf50');
            $('btnKeepAlive').textContent = 'Stop Alive';
        }
    }

    // ════════════════════════════════════════════════════════════
    //  NETWORK INTERCEPTOR
    // ════════════════════════════════════════════════════════════

    const origFetch = window.fetch;
    window.fetch = async function(...args) {
        const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';
        const response = await origFetch.apply(this, args);

        // Capture tokens from successful auth responses
        if (url.includes('/auth/') && response.ok) {
            try {
                const clone = response.clone();
                const data = await clone.json();

                if (data.token || data.accessToken || data.access_token) {
                    state.authToken = data.token || data.accessToken || data.access_token;
                    state.refreshToken = data.refreshToken || data.refresh_token || '';
                    state.isLoggedIn = true;
                    saveState();
                    updateTokenDisplay();
                    log('Token auto-captured from API response!', '#4caf50');
                }
            } catch (e) {}
        }

        return response;
    };

    // ════════════════════════════════════════════════════════════
    //  EVENT LISTENERS
    // ════════════════════════════════════════════════════════════

    // Main tab
    $('btnSaveCredentials').onclick = () => {
        state.email = $('inputEmail').value.trim();
        state.phone = $('inputPhone').value.trim();
        state.password = $('inputPassword').value;
        $('apiEmail').value = state.email;
        $('apiPassword').value = state.password;
        saveState();
        log('Credentials saved!', '#4caf50');
        playSuccess();
    };

    $('btnFillForm').onclick = fillForm;
    $('btnQuickLogin').onclick = quickLogin;
    $('btnCheckStatus').onclick = () => directApiLogin('', ''); // Empty check
    $('btnKeepAlive').onclick = toggleKeepAlive;
    $('btnRefresh').onclick = () => location.reload();

    // API tab
    $('btnApiLogin').onclick = () => {
        const email = $('apiEmail').value || state.email;
        const password = $('apiPassword').value || state.password;
        directApiLogin(email, password);
    };
    $('btnRapidFire').onclick = startRapidFire;

    // Token tab
    $('btnCaptureToken').onclick = captureToken;
    $('btnSaveToken').onclick = () => {
        const token = $('manualToken').value.trim();
        if (token) {
            state.authToken = token;
            saveState();
            updateTokenDisplay();
            log('Token saved!', '#4caf50');
        }
    };
    $('btnInjectToken').onclick = injectToken;
    $('btnClearToken').onclick = () => {
        state.authToken = '';
        state.refreshToken = '';
        state.tokenExpiry = null;
        saveState();
        updateTokenDisplay();
        $('manualToken').value = '';
        log('Token cleared', '#888');
    };
    $('btnCaptureCookies').onclick = captureCookies;
    $('btnRestoreCookies').onclick = restoreCookies;

    // Schedule tab
    $('btnSetSchedule').onclick = () => {
        state.scheduledTime = $('scheduleTime').value;
        saveState();
        updateScheduleTimer();
        log('Schedule time set: ' + state.scheduledTime, '#4caf50');
    };
    $('btnStartSchedule').onclick = startScheduledLogin;
    $('btnStopSchedule').onclick = stopScheduledLogin;

    // Update timer every second
    setInterval(updateScheduleTimer, 1000);

    // ════════════════════════════════════════════════════════════
    //  INITIALIZATION
    // ════════════════════════════════════════════════════════════

    loadState();
    loadUI();
    updateScheduleTimer();

    // Auto-fill on login page
    if (location.href.includes('signin') || location.href.includes('login')) {
        setTimeout(fillForm, 1000);
    }

    updateStatus('Ready', '');
    log('IVAC Helper Pro v2.0 loaded!', '#4caf50');
    log('Methods: Direct API | Token Reuse | Scheduled Login', '#888');

})();
