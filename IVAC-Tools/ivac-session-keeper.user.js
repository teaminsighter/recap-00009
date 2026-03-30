// ==UserScript==
// @name         IVAC Session Keeper
// @namespace    http://tampermonkey.net/
// @version      1.1
// @description  Keep your IVAC session alive with REAL server pings - Never lose your login!
// @match        *://appointment.ivacbd.com/*
// @match        *://*.ivacbd.com/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    // ════════════════════════════════════════════════════════════
    //  CONFIGURATION
    // ════════════════════════════════════════════════════════════
    const CONFIG = {
        // REAL server ping interval (makes actual API calls)
        serverPingInterval: 60,      // Every 60 seconds - ping the server

        // Page refresh interval (most reliable - makes full request)
        pageRefreshInterval: 300,    // Every 5 minutes refresh page

        // Local activity simulation (backup)
        localActivityInterval: 30,   // Every 30 seconds

        storageKey: 'ivacSessionKeeper'
    };

    // ════════════════════════════════════════════════════════════
    //  STATE
    // ════════════════════════════════════════════════════════════
    let state = {
        email: '',
        phone: '',
        password: '',
        otp: '',
        keepAliveEnabled: false,
        autoRefreshEnabled: false,
        serverPingEnabled: true,     // NEW: Real server pings
        soundEnabled: true,
        sessionStartTime: null,
        lastPingTime: null,
        lastServerPing: null
    };

    // Load saved state
    try {
        const saved = JSON.parse(localStorage.getItem(CONFIG.storageKey) || '{}');
        state.email = saved.email || '';
        state.phone = saved.phone || '';
        state.password = saved.password ? atob(saved.password) : '';
        state.otp = saved.otp || '';
        state.soundEnabled = saved.soundEnabled !== false;
    } catch (e) {}

    // ════════════════════════════════════════════════════════════
    //  STYLES
    // ════════════════════════════════════════════════════════════
    const styles = `
        #ivacKeeper {
            position: fixed;
            top: 20px;
            right: 20px;
            width: 360px;
            background: linear-gradient(145deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
            border-radius: 16px;
            color: #fff;
            font-family: 'Segoe UI', -apple-system, sans-serif;
            font-size: 13px;
            z-index: 999999;
            box-shadow: 0 25px 50px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.1), inset 0 1px 0 rgba(255,255,255,0.1);
            overflow: hidden;
            user-select: none;
        }

        .ik-header {
            background: linear-gradient(135deg, #e94560 0%, #ff6b6b 100%);
            padding: 16px 20px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            cursor: move;
        }

        .ik-header h3 {
            margin: 0;
            font-size: 16px;
            font-weight: 700;
            text-shadow: 0 2px 4px rgba(0,0,0,0.2);
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .ik-header h3::before {
            content: '';
            width: 10px;
            height: 10px;
            background: #4ade80;
            border-radius: 50%;
            box-shadow: 0 0 10px #4ade80;
            animation: glow 2s ease-in-out infinite;
        }

        @keyframes glow {
            0%, 100% { box-shadow: 0 0 5px #4ade80; }
            50% { box-shadow: 0 0 20px #4ade80, 0 0 30px #4ade80; }
        }

        .ik-minimize {
            width: 32px;
            height: 32px;
            border-radius: 50%;
            background: rgba(0,0,0,0.2);
            border: none;
            color: #fff;
            font-size: 20px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.2s;
        }

        .ik-minimize:hover {
            background: rgba(0,0,0,0.4);
            transform: scale(1.1);
        }

        .ik-status {
            padding: 12px 20px;
            background: rgba(0,0,0,0.3);
            display: flex;
            align-items: center;
            gap: 12px;
            border-bottom: 1px solid rgba(255,255,255,0.05);
        }

        .ik-status-dot {
            width: 12px;
            height: 12px;
            border-radius: 50%;
            background: #64748b;
            transition: all 0.3s;
        }

        .ik-status-dot.active {
            background: #4ade80;
            box-shadow: 0 0 12px #4ade80;
            animation: pulse 1.5s ease-in-out infinite;
        }

        .ik-status-dot.warning {
            background: #fbbf24;
            box-shadow: 0 0 12px #fbbf24;
        }

        .ik-status-dot.error {
            background: #ef4444;
            box-shadow: 0 0 12px #ef4444;
        }

        @keyframes pulse {
            0%, 100% { transform: scale(1); opacity: 1; }
            50% { transform: scale(1.2); opacity: 0.8; }
        }

        .ik-status-text {
            flex: 1;
            font-size: 12px;
            color: #94a3b8;
        }

        .ik-status-text strong {
            color: #fff;
            display: block;
            margin-bottom: 2px;
        }

        .ik-content {
            padding: 16px;
        }

        .ik-section {
            background: rgba(255,255,255,0.03);
            border-radius: 12px;
            padding: 16px;
            margin-bottom: 12px;
            border: 1px solid rgba(255,255,255,0.05);
        }

        .ik-section:last-child {
            margin-bottom: 0;
        }

        .ik-section-title {
            font-size: 10px;
            color: #e94560;
            text-transform: uppercase;
            letter-spacing: 2px;
            margin-bottom: 12px;
            font-weight: 700;
        }

        .ik-input-group {
            margin-bottom: 10px;
        }

        .ik-input-group:last-child {
            margin-bottom: 0;
        }

        .ik-input {
            width: 100%;
            padding: 12px 14px;
            border: 2px solid rgba(255,255,255,0.1);
            border-radius: 10px;
            background: rgba(0,0,0,0.3);
            color: #fff;
            font-size: 14px;
            outline: none;
            transition: all 0.2s;
        }

        .ik-input:focus {
            border-color: #e94560;
            background: rgba(0,0,0,0.5);
        }

        .ik-input::placeholder {
            color: rgba(255,255,255,0.3);
        }

        .ik-btn-row {
            display: flex;
            gap: 8px;
            margin-top: 12px;
        }

        .ik-btn {
            flex: 1;
            padding: 12px 16px;
            border: none;
            border-radius: 10px;
            font-size: 12px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }

        .ik-btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 5px 20px rgba(0,0,0,0.3);
        }

        .ik-btn:active {
            transform: translateY(0);
        }

        .ik-btn.primary {
            background: linear-gradient(135deg, #e94560, #ff6b6b);
            color: #fff;
        }

        .ik-btn.success {
            background: linear-gradient(135deg, #10b981, #34d399);
            color: #fff;
        }

        .ik-btn.info {
            background: linear-gradient(135deg, #3b82f6, #60a5fa);
            color: #fff;
        }

        .ik-btn.warning {
            background: linear-gradient(135deg, #f59e0b, #fbbf24);
            color: #000;
        }

        .ik-btn.danger {
            background: linear-gradient(135deg, #ef4444, #f87171);
            color: #fff;
        }

        .ik-btn.secondary {
            background: rgba(255,255,255,0.1);
            color: #fff;
        }

        .ik-btn:disabled {
            opacity: 0.5;
            cursor: not-allowed;
            transform: none !important;
        }

        .ik-toggle-row {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 12px 0;
            border-bottom: 1px solid rgba(255,255,255,0.05);
        }

        .ik-toggle-row:last-child {
            border-bottom: none;
            padding-bottom: 0;
        }

        .ik-toggle-label {
            font-size: 13px;
            color: #e2e8f0;
        }

        .ik-toggle-label small {
            display: block;
            font-size: 10px;
            color: #64748b;
            margin-top: 2px;
        }

        .ik-switch {
            position: relative;
            width: 50px;
            height: 26px;
            background: rgba(255,255,255,0.1);
            border-radius: 13px;
            cursor: pointer;
            transition: all 0.3s;
        }

        .ik-switch.on {
            background: linear-gradient(135deg, #10b981, #34d399);
        }

        .ik-switch::after {
            content: '';
            position: absolute;
            width: 22px;
            height: 22px;
            background: #fff;
            border-radius: 50%;
            top: 2px;
            left: 2px;
            transition: all 0.3s;
            box-shadow: 0 2px 5px rgba(0,0,0,0.2);
        }

        .ik-switch.on::after {
            left: 26px;
        }

        .ik-stats {
            display: grid;
            grid-template-columns: 1fr 1fr 1fr;
            gap: 10px;
        }

        .ik-stat {
            background: rgba(0,0,0,0.2);
            padding: 12px;
            border-radius: 10px;
            text-align: center;
        }

        .ik-stat-value {
            font-size: 18px;
            font-weight: 700;
            color: #4ade80;
            font-family: 'Courier New', monospace;
        }

        .ik-stat-label {
            font-size: 9px;
            color: #64748b;
            text-transform: uppercase;
            letter-spacing: 1px;
            margin-top: 4px;
        }

        .ik-log {
            background: rgba(0,0,0,0.4);
            border-radius: 10px;
            padding: 12px;
            max-height: 120px;
            overflow-y: auto;
            font-family: 'Courier New', monospace;
            font-size: 11px;
        }

        .ik-log::-webkit-scrollbar {
            width: 4px;
        }

        .ik-log::-webkit-scrollbar-thumb {
            background: rgba(255,255,255,0.2);
            border-radius: 2px;
        }

        .ik-log-entry {
            padding: 3px 0;
            border-bottom: 1px solid rgba(255,255,255,0.03);
            color: #94a3b8;
        }

        .ik-log-entry:last-child {
            border-bottom: none;
        }

        .ik-log-time {
            color: #64748b;
        }

        .ik-hidden {
            display: none !important;
        }

        .ik-info-box {
            background: rgba(59, 130, 246, 0.1);
            border: 1px solid rgba(59, 130, 246, 0.3);
            border-radius: 8px;
            padding: 10px;
            font-size: 11px;
            color: #60a5fa;
            margin-bottom: 12px;
        }
    `;

    // ════════════════════════════════════════════════════════════
    //  UI
    // ════════════════════════════════════════════════════════════
    const styleEl = document.createElement('style');
    styleEl.textContent = styles;
    document.head.appendChild(styleEl);

    const panel = document.createElement('div');
    panel.id = 'ivacKeeper';
    panel.innerHTML = `
        <div class="ik-header">
            <h3>IVAC Session Keeper</h3>
            <button class="ik-minimize" id="ikMinimize">−</button>
        </div>

        <div class="ik-status">
            <div class="ik-status-dot" id="statusDot"></div>
            <div class="ik-status-text">
                <strong id="statusTitle">Ready</strong>
                <span id="statusDesc">Save credentials & enable Keep Alive</span>
            </div>
        </div>

        <div class="ik-content" id="ikContent">
            <!-- CREDENTIALS -->
            <div class="ik-section">
                <div class="ik-section-title">Your Credentials</div>
                <div class="ik-input-group">
                    <input type="email" class="ik-input" id="inputEmail" placeholder="Email Address">
                </div>
                <div class="ik-input-group">
                    <input type="tel" class="ik-input" id="inputPhone" placeholder="Phone Number (optional)">
                </div>
                <div class="ik-input-group">
                    <input type="password" class="ik-input" id="inputPassword" placeholder="Password">
                </div>
                <div class="ik-input-group">
                    <input type="text" class="ik-input" id="inputOtp" placeholder="OTP Code (when received)" maxlength="6" style="text-align:center; font-size:18px; letter-spacing:8px;">
                </div>
                <div class="ik-btn-row">
                    <button class="ik-btn info" id="btnSave">Save</button>
                    <button class="ik-btn primary" id="btnFill">Fill Form</button>
                    <button class="ik-btn warning" id="btnFillOtp">Fill OTP</button>
                </div>
                <div class="ik-btn-row">
                    <button class="ik-btn success" id="btnLogin">Quick Login</button>
                </div>
            </div>

            <!-- SESSION CONTROL -->
            <div class="ik-section">
                <div class="ik-section-title">Session Control</div>

                <div class="ik-info-box">
                    <strong>How it works:</strong> Makes REAL requests to server every 60s to keep your session alive. Also refreshes page every 5 min for maximum reliability.
                </div>

                <div class="ik-toggle-row">
                    <div class="ik-toggle-label">
                        Server Ping (Real API calls)
                        <small>Calls server every ${CONFIG.serverPingInterval}s - KEEPS SESSION ALIVE</small>
                    </div>
                    <div class="ik-switch" id="toggleServerPing"></div>
                </div>

                <div class="ik-toggle-row">
                    <div class="ik-toggle-label">
                        Auto Page Refresh
                        <small>Refresh page every ${CONFIG.pageRefreshInterval / 60} min - MOST RELIABLE</small>
                    </div>
                    <div class="ik-switch" id="toggleAutoRefresh"></div>
                </div>

                <div class="ik-toggle-row">
                    <div class="ik-toggle-label">
                        Local Activity Simulation
                        <small>Mouse/keyboard simulation (backup only)</small>
                    </div>
                    <div class="ik-switch" id="toggleLocalActivity"></div>
                </div>

                <div class="ik-toggle-row">
                    <div class="ik-toggle-label">
                        Sound Alerts
                        <small>Play sound on important events</small>
                    </div>
                    <div class="ik-switch on" id="toggleSound"></div>
                </div>
            </div>

            <!-- STATS -->
            <div class="ik-section">
                <div class="ik-section-title">Session Stats</div>
                <div class="ik-stats">
                    <div class="ik-stat">
                        <div class="ik-stat-value" id="statSession">00:00</div>
                        <div class="ik-stat-label">Session</div>
                    </div>
                    <div class="ik-stat">
                        <div class="ik-stat-value" id="statServerPings">0</div>
                        <div class="ik-stat-label">Server Pings</div>
                    </div>
                    <div class="ik-stat">
                        <div class="ik-stat-value" id="statLocalPings">0</div>
                        <div class="ik-stat-label">Local Pings</div>
                    </div>
                </div>
            </div>

            <!-- LOG -->
            <div class="ik-section">
                <div class="ik-section-title">Activity Log</div>
                <div class="ik-log" id="logBox">
                    <div class="ik-log-entry">Waiting for activity...</div>
                </div>
            </div>

            <!-- ACTIONS -->
            <div class="ik-section">
                <div class="ik-btn-row">
                    <button class="ik-btn secondary" id="btnRefresh">Refresh Now</button>
                    <button class="ik-btn warning" id="btnTestPing">Test Server Ping</button>
                    <button class="ik-btn danger" id="btnClear">Clear</button>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(panel);

    // ════════════════════════════════════════════════════════════
    //  ELEMENTS
    // ════════════════════════════════════════════════════════════
    const $ = id => document.getElementById(id);
    let isMinimized = false;
    let serverPingTimer = null;
    let localActivityTimer = null;
    let autoRefreshTimer = null;
    let sessionTimer = null;
    let serverPingCount = 0;
    let localPingCount = 0;

    // ════════════════════════════════════════════════════════════
    //  LOGGING
    // ════════════════════════════════════════════════════════════
    function log(msg, color = '#94a3b8') {
        const time = new Date().toLocaleTimeString();
        const logBox = $('logBox');
        const entry = document.createElement('div');
        entry.className = 'ik-log-entry';
        entry.innerHTML = `<span class="ik-log-time">[${time}]</span> <span style="color:${color}">${msg}</span>`;
        logBox.insertBefore(entry, logBox.firstChild);

        // Keep only last 50 entries
        while (logBox.children.length > 50) {
            logBox.removeChild(logBox.lastChild);
        }

        console.log('[IVAC Keeper]', msg);
    }

    function updateStatus(title, desc, dotClass = '') {
        $('statusTitle').textContent = title;
        $('statusDesc').textContent = desc;
        $('statusDot').className = 'ik-status-dot ' + dotClass;
    }

    // ════════════════════════════════════════════════════════════
    //  SOUND
    // ════════════════════════════════════════════════════════════
    function playSound(type = 'success') {
        if (!state.soundEnabled) return;

        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const frequencies = type === 'success'
                ? [523, 659, 784, 1047]
                : [880, 660, 880, 660];

            frequencies.forEach((freq, i) => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.frequency.value = freq;
                osc.type = type === 'success' ? 'sine' : 'square';
                gain.gain.setValueAtTime(0.2, ctx.currentTime + i * 0.12);
                gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + i * 0.12 + 0.15);
                osc.start(ctx.currentTime + i * 0.12);
                osc.stop(ctx.currentTime + i * 0.12 + 0.15);
            });
        } catch (e) {}
    }

    // ════════════════════════════════════════════════════════════
    //  DRAG
    // ════════════════════════════════════════════════════════════
    let isDragging = false, dragX = 0, dragY = 0;

    panel.querySelector('.ik-header').addEventListener('mousedown', e => {
        if (e.target.closest('.ik-minimize')) return;
        isDragging = true;
        dragX = e.clientX - panel.offsetLeft;
        dragY = e.clientY - panel.offsetTop;
        panel.style.transition = 'none';
    });

    document.addEventListener('mousemove', e => {
        if (isDragging) {
            panel.style.left = (e.clientX - dragX) + 'px';
            panel.style.top = (e.clientY - dragY) + 'px';
            panel.style.right = 'auto';
        }
    });

    document.addEventListener('mouseup', () => {
        isDragging = false;
        panel.style.transition = '';
    });

    // ════════════════════════════════════════════════════════════
    //  REAL SERVER PING - THIS ACTUALLY KEEPS SESSION ALIVE!
    // ════════════════════════════════════════════════════════════
    async function serverPing() {
        serverPingCount++;
        $('statServerPings').textContent = serverPingCount;
        state.lastServerPing = Date.now();

        try {
            // Method 1: Fetch current page (makes real HTTP request)
            const response = await fetch(window.location.href, {
                method: 'GET',
                credentials: 'include', // Include cookies!
                cache: 'no-store'
            });

            if (response.ok) {
                log(`Server ping #${serverPingCount} - OK (${response.status})`, '#4ade80');
            } else if (response.status === 401 || response.status === 403) {
                log(`Server ping #${serverPingCount} - SESSION EXPIRED!`, '#ef4444');
                playSound('alert');
                updateStatus('Session Expired!', 'Please login again', 'error');
            } else {
                log(`Server ping #${serverPingCount} - Status: ${response.status}`, '#fbbf24');
            }

            // Method 2: Try to fetch a small resource
            const imgPing = new Image();
            imgPing.src = '/favicon.ico?' + Date.now();

            // Method 3: Touch any API endpoint if available
            tryApiPing();

        } catch (e) {
            log(`Server ping #${serverPingCount} - Network error`, '#fbbf24');
        }
    }

    // Try to ping any available API endpoint
    async function tryApiPing() {
        // Look for any API calls the page makes and try similar endpoints
        const possibleEndpoints = [
            '/api/health',
            '/api/user/profile',
            '/api/session',
            '/iams/api/v1/user'
        ];

        for (const endpoint of possibleEndpoints) {
            try {
                await fetch(endpoint, {
                    method: 'GET',
                    credentials: 'include',
                    cache: 'no-store'
                });
                break; // If one succeeds, that's enough
            } catch (e) {
                // Continue to next endpoint
            }
        }
    }

    function startServerPing() {
        if (serverPingTimer) return;

        state.serverPingEnabled = true;
        $('toggleServerPing').classList.add('on');

        // Immediate ping
        serverPing();

        // Set interval
        serverPingTimer = setInterval(serverPing, CONFIG.serverPingInterval * 1000);

        if (!state.sessionStartTime) {
            state.sessionStartTime = Date.now();
            startSessionTimer();
        }

        updateStatus('Session Protected', 'Server pings active', 'active');
        log('Server ping STARTED - Session will stay alive!', '#4ade80');
        playSound('success');
    }

    function stopServerPing() {
        if (serverPingTimer) {
            clearInterval(serverPingTimer);
            serverPingTimer = null;
        }

        state.serverPingEnabled = false;
        $('toggleServerPing').classList.remove('on');

        checkAllStopped();
        log('Server ping STOPPED', '#fbbf24');
    }

    // ════════════════════════════════════════════════════════════
    //  LOCAL ACTIVITY (BACKUP - Browser-side only)
    // ════════════════════════════════════════════════════════════
    function localActivityPing() {
        localPingCount++;
        $('statLocalPings').textContent = localPingCount;

        // Mouse movement simulation
        document.dispatchEvent(new MouseEvent('mousemove', {
            bubbles: true,
            clientX: Math.random() * window.innerWidth,
            clientY: Math.random() * window.innerHeight
        }));

        // Keyboard event
        document.dispatchEvent(new KeyboardEvent('keydown', {
            bubbles: true,
            key: 'Shift',
            code: 'ShiftLeft'
        }));

        // Touch storage
        localStorage.setItem('ivac_local_ping', Date.now().toString());

        // Focus event
        window.dispatchEvent(new Event('focus'));

        log(`Local ping #${localPingCount}`, '#64748b');
    }

    function startLocalActivity() {
        if (localActivityTimer) return;

        state.keepAliveEnabled = true;
        $('toggleLocalActivity').classList.add('on');

        localActivityPing();
        localActivityTimer = setInterval(localActivityPing, CONFIG.localActivityInterval * 1000);

        if (!state.sessionStartTime) {
            state.sessionStartTime = Date.now();
            startSessionTimer();
        }

        log('Local activity STARTED (backup)', '#60a5fa');
    }

    function stopLocalActivity() {
        if (localActivityTimer) {
            clearInterval(localActivityTimer);
            localActivityTimer = null;
        }

        state.keepAliveEnabled = false;
        $('toggleLocalActivity').classList.remove('on');

        checkAllStopped();
        log('Local activity STOPPED', '#fbbf24');
    }

    // ════════════════════════════════════════════════════════════
    //  AUTO REFRESH (MOST RELIABLE)
    // ════════════════════════════════════════════════════════════
    function startAutoRefresh() {
        if (autoRefreshTimer) return;

        state.autoRefreshEnabled = true;
        $('toggleAutoRefresh').classList.add('on');

        autoRefreshTimer = setInterval(() => {
            log('Auto-refreshing page...', '#60a5fa');
            // Save state before refresh
            saveState();
            location.reload();
        }, CONFIG.pageRefreshInterval * 1000);

        if (!state.sessionStartTime) {
            state.sessionStartTime = Date.now();
            startSessionTimer();
        }

        log(`Auto-refresh STARTED (every ${CONFIG.pageRefreshInterval / 60} min)`, '#60a5fa');
    }

    function stopAutoRefresh() {
        if (autoRefreshTimer) {
            clearInterval(autoRefreshTimer);
            autoRefreshTimer = null;
        }

        state.autoRefreshEnabled = false;
        $('toggleAutoRefresh').classList.remove('on');

        checkAllStopped();
        log('Auto-refresh STOPPED', '#fbbf24');
    }

    // ════════════════════════════════════════════════════════════
    //  SESSION TIMER
    // ════════════════════════════════════════════════════════════
    function startSessionTimer() {
        if (sessionTimer) return;

        sessionTimer = setInterval(() => {
            if (!state.sessionStartTime) return;

            const elapsed = Math.floor((Date.now() - state.sessionStartTime) / 1000);
            const hours = Math.floor(elapsed / 3600);
            const mins = Math.floor((elapsed % 3600) / 60);
            const secs = elapsed % 60;

            if (hours > 0) {
                $('statSession').textContent = `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
            } else {
                $('statSession').textContent = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
            }
        }, 1000);
    }

    function stopSessionTimer() {
        if (sessionTimer) {
            clearInterval(sessionTimer);
            sessionTimer = null;
        }
    }

    function checkAllStopped() {
        if (!state.serverPingEnabled && !state.keepAliveEnabled && !state.autoRefreshEnabled) {
            stopSessionTimer();
            updateStatus('Ready', 'Enable server ping to protect session', '');
        }
    }

    // ════════════════════════════════════════════════════════════
    //  FORM FUNCTIONS
    // ════════════════════════════════════════════════════════════
    function fillForm() {
        const selectors = {
            email: [
                'input[type="email"]',
                'input[name="email"]',
                'input[id*="email"]',
                'input[placeholder*="email" i]'
            ],
            phone: [
                'input[type="tel"]',
                'input[name="phone"]',
                'input[name="mobile"]',
                'input[id*="phone"]'
            ],
            password: [
                'input[type="password"]',
                'input[name="password"]'
            ],
            otp: [
                'input[name="otp"]',
                'input[id*="otp"]',
                'input[placeholder*="otp" i]',
                'input[placeholder*="code" i]',
                'input[placeholder*="verify" i]',
                'input[type="number"][maxlength="6"]',
                'input[type="text"][maxlength="6"]'
            ]
        };

        let filledCount = 0;

        if (state.email) {
            for (const sel of selectors.email) {
                document.querySelectorAll(sel).forEach(input => {
                    input.value = state.email;
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                    input.dispatchEvent(new Event('change', { bubbles: true }));
                    filledCount++;
                });
            }
        }

        if (state.phone) {
            for (const sel of selectors.phone) {
                document.querySelectorAll(sel).forEach(input => {
                    input.value = state.phone;
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                    input.dispatchEvent(new Event('change', { bubbles: true }));
                    filledCount++;
                });
            }
        }

        if (state.password) {
            for (const sel of selectors.password) {
                document.querySelectorAll(sel).forEach(input => {
                    input.value = state.password;
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                    input.dispatchEvent(new Event('change', { bubbles: true }));
                    filledCount++;
                });
            }
        }

        if (filledCount > 0) {
            log(`Filled ${filledCount} form field(s)`, '#4ade80');
            playSound('success');
        } else {
            log('No form fields found', '#f87171');
        }

        return filledCount;
    }

    // Dedicated OTP fill function
    function fillOtp() {
        const otp = $('inputOtp').value.trim();
        if (!otp) {
            log('Enter OTP first!', '#f87171');
            return 0;
        }

        const otpSelectors = [
            'input[name="otp"]',
            'input[id*="otp"]',
            'input[placeholder*="otp" i]',
            'input[placeholder*="code" i]',
            'input[placeholder*="verify" i]',
            'input[type="number"][maxlength="6"]',
            'input[type="text"][maxlength="6"]',
            'input[type="number"][maxlength="4"]',
            'input[type="text"][maxlength="4"]'
        ];

        let filled = 0;
        for (const sel of otpSelectors) {
            document.querySelectorAll(sel).forEach(input => {
                // Skip our own input
                if (input.id === 'inputOtp') return;

                input.value = otp;
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.dispatchEvent(new Event('change', { bubbles: true }));
                input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
                filled++;
            });
        }

        if (filled > 0) {
            log(`OTP filled in ${filled} field(s)`, '#4ade80');
            playSound('success');

            // Try to auto-click verify/submit button
            setTimeout(() => {
                const buttons = document.querySelectorAll('button, input[type="submit"]');
                for (const btn of buttons) {
                    const text = (btn.textContent || btn.value || '').toLowerCase();
                    if (text.includes('verify') || text.includes('submit') || text.includes('confirm')) {
                        log('Found verify button, clicking...', '#60a5fa');
                        btn.click();
                        return;
                    }
                }
            }, 300);
        } else {
            log('No OTP field found on page', '#f87171');
        }

        return filled;
    }

    function quickLogin() {
        const filled = fillForm();
        if (filled === 0) return;

        setTimeout(() => {
            const buttons = document.querySelectorAll('button, input[type="submit"]');
            for (const btn of buttons) {
                const text = (btn.textContent || btn.value || '').toLowerCase();
                if (text.includes('login') || text.includes('sign in') || text.includes('submit')) {
                    log('Clicking login button...', '#60a5fa');
                    btn.click();
                    return;
                }
            }
            log('Login button not found', '#f87171');
        }, 300);
    }

    // ════════════════════════════════════════════════════════════
    //  STATE MANAGEMENT
    // ════════════════════════════════════════════════════════════
    function saveState() {
        const toSave = {
            email: state.email,
            phone: state.phone,
            password: btoa(state.password || ''),
            otp: state.otp,
            soundEnabled: state.soundEnabled,
            serverPingEnabled: state.serverPingEnabled,
            autoRefreshEnabled: state.autoRefreshEnabled
        };
        localStorage.setItem(CONFIG.storageKey, JSON.stringify(toSave));
    }

    function loadUI() {
        $('inputEmail').value = state.email || '';
        $('inputPhone').value = state.phone || '';
        $('inputPassword').value = state.password || '';
        $('inputOtp').value = state.otp || '';
        $('toggleSound').classList.toggle('on', state.soundEnabled);
    }

    // ════════════════════════════════════════════════════════════
    //  EVENT LISTENERS
    // ════════════════════════════════════════════════════════════

    $('ikMinimize').onclick = () => {
        isMinimized = !isMinimized;
        $('ikContent').classList.toggle('ik-hidden', isMinimized);
        $('ikMinimize').textContent = isMinimized ? '+' : '−';
    };

    $('btnSave').onclick = () => {
        state.email = $('inputEmail').value.trim();
        state.phone = $('inputPhone').value.trim();
        state.password = $('inputPassword').value;
        state.otp = $('inputOtp').value.trim();
        saveState();
        log('Credentials saved!', '#4ade80');
        playSound('success');
    };

    $('btnFill').onclick = fillForm;
    $('btnFillOtp').onclick = fillOtp;
    $('btnLogin').onclick = quickLogin;

    $('toggleServerPing').onclick = () => {
        if (state.serverPingEnabled) {
            stopServerPing();
        } else {
            startServerPing();
        }
        saveState();
    };

    $('toggleAutoRefresh').onclick = () => {
        if (state.autoRefreshEnabled) {
            stopAutoRefresh();
        } else {
            startAutoRefresh();
        }
        saveState();
    };

    $('toggleLocalActivity').onclick = () => {
        if (state.keepAliveEnabled) {
            stopLocalActivity();
        } else {
            startLocalActivity();
        }
        saveState();
    };

    $('toggleSound').onclick = () => {
        state.soundEnabled = !state.soundEnabled;
        $('toggleSound').classList.toggle('on', state.soundEnabled);
        saveState();
        log(`Sound ${state.soundEnabled ? 'enabled' : 'disabled'}`, '#94a3b8');
    };

    $('btnRefresh').onclick = () => {
        log('Refreshing page...', '#60a5fa');
        setTimeout(() => location.reload(), 300);
    };

    $('btnTestPing').onclick = () => {
        log('Testing server ping...', '#60a5fa');
        serverPing();
    };

    $('btnClear').onclick = () => {
        if (!confirm('Clear all saved data?')) return;
        localStorage.removeItem(CONFIG.storageKey);
        state.email = '';
        state.phone = '';
        state.password = '';
        loadUI();
        stopServerPing();
        stopAutoRefresh();
        stopLocalActivity();
        serverPingCount = 0;
        localPingCount = 0;
        $('statServerPings').textContent = '0';
        $('statLocalPings').textContent = '0';
        $('statSession').textContent = '00:00';
        log('All data cleared', '#f87171');
    };

    // ════════════════════════════════════════════════════════════
    //  AUTO-DETECT PAGE & AUTO-START
    // ════════════════════════════════════════════════════════════
    function detectPage() {
        const url = window.location.href.toLowerCase();
        const hasLoginForm = document.querySelector('input[type="password"]');

        if (url.includes('signin') || url.includes('login') || hasLoginForm) {
            log('Login page detected', '#60a5fa');
            if (state.email) {
                setTimeout(fillForm, 1500);
            }
        } else {
            // User is on dashboard/booking page - likely logged in
            log('You appear to be logged in!', '#4ade80');
            updateStatus('Logged In', 'Enable server ping to stay alive', 'active');

            // Auto-start server ping
            setTimeout(() => {
                if (!state.serverPingEnabled) {
                    log('Auto-starting server ping...', '#60a5fa');
                    startServerPing();
                }
            }, 2000);
        }
    }

    // Restore previous session settings
    function restoreSession() {
        try {
            const saved = JSON.parse(localStorage.getItem(CONFIG.storageKey) || '{}');
            if (saved.serverPingEnabled) {
                log('Restoring server ping from previous session...', '#60a5fa');
                startServerPing();
            }
            if (saved.autoRefreshEnabled) {
                log('Restoring auto-refresh from previous session...', '#60a5fa');
                startAutoRefresh();
            }
        } catch (e) {}
    }

    // ════════════════════════════════════════════════════════════
    //  INITIALIZATION
    // ════════════════════════════════════════════════════════════
    loadUI();
    detectPage();
    restoreSession();

    log('IVAC Session Keeper v1.1 loaded!', '#4ade80');
    log('NEW: Real server pings to keep session alive!', '#60a5fa');

})();
