// ==UserScript==
// @name         VFS Slot Booker Pro
// @namespace    http://tampermonkey.net/
// @version      4.0
// @description  VFS Global Appointment Booking - Compact UI with Auto Token Capture
// @match        *://*.vfsglobal.com/*
// @match        *://visa.vfsglobal.com/*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    // ════════════════════════════════════════════════════════════
    //  GLOBAL STATE
    // ════════════════════════════════════════════════════════════
    let state = {
        // Tokens (auto-captured)
        rsaKey: '',
        cryptoKey: null,
        accessToken: '',
        clientSource: '',
        userEmail: '',
        routeHeader: '',
        isReady: false,

        // Booking data (flows between API calls)
        urn: '',
        allocationId: '',
        selectedDate: '',
        selectedTime: '',
        availableDates: [],
        availableSlots: [],

        // Config
        countryCode: 'bgd',
        missionCode: 'ita',
        centerCode: 'DAC',
        visaCategoryCode: '05',
        languageCode: 'en-US'
    };

    const API_BASE = 'https://lift-api.vfsglobal.com';

    // Load saved state
    try {
        const saved = JSON.parse(localStorage.getItem('vfsState') || '{}');
        Object.assign(state, saved);
    } catch (e) {}

    // ════════════════════════════════════════════════════════════
    //  UI PANEL
    // ════════════════════════════════════════════════════════════
    const panel = document.createElement('div');
    panel.id = 'vfsPanel';
    panel.innerHTML = `
        <style>
            #vfsPanel {
                position: fixed;
                top: 80px;
                right: 20px;
                width: 340px;
                background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
                border-radius: 12px;
                color: #fff;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                font-size: 12px;
                z-index: 999999;
                box-shadow: 0 10px 40px rgba(0,0,0,0.5);
                overflow: hidden;
                user-select: none;
            }
            #vfsPanel * { box-sizing: border-box; }
            .vfs-header {
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                padding: 12px 15px;
                display: flex;
                justify-content: space-between;
                align-items: center;
                cursor: move;
            }
            .vfs-header h3 { margin: 0; font-size: 14px; font-weight: 600; }
            .vfs-close { cursor: pointer; font-size: 18px; opacity: 0.8; }
            .vfs-close:hover { opacity: 1; }
            .vfs-status {
                padding: 8px 15px;
                background: rgba(0,0,0,0.2);
                font-size: 11px;
                display: flex;
                align-items: center;
                gap: 8px;
            }
            .vfs-status-dot {
                width: 8px;
                height: 8px;
                border-radius: 50%;
                background: #ef5350;
            }
            .vfs-status-dot.ready { background: #4caf50; }
            .vfs-tabs {
                display: flex;
                background: rgba(0,0,0,0.3);
            }
            .vfs-tab {
                flex: 1;
                padding: 10px;
                text-align: center;
                cursor: pointer;
                border: none;
                background: transparent;
                color: #888;
                font-size: 12px;
                font-weight: 500;
                transition: all 0.2s;
            }
            .vfs-tab.active {
                color: #fff;
                background: rgba(102, 126, 234, 0.3);
                border-bottom: 2px solid #667eea;
            }
            .vfs-content {
                padding: 12px;
                max-height: 70vh;
                overflow-y: auto;
            }
            .vfs-content::-webkit-scrollbar { width: 4px; }
            .vfs-content::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.2); border-radius: 2px; }
            .vfs-tab-content { display: none; }
            .vfs-tab-content.active { display: block; }
            .vfs-row {
                display: flex;
                gap: 6px;
                margin-bottom: 8px;
            }
            .vfs-btn {
                flex: 1;
                padding: 10px 8px;
                border: none;
                border-radius: 6px;
                cursor: pointer;
                font-size: 11px;
                font-weight: 500;
                transition: all 0.2s;
                color: #fff;
            }
            .vfs-btn:hover { transform: scale(0.98); filter: brightness(1.1); }
            .vfs-btn:active { transform: scale(0.95); }
            .vfs-btn.blue { background: linear-gradient(135deg, #2196f3, #1976d2); }
            .vfs-btn.green { background: linear-gradient(135deg, #4caf50, #388e3c); }
            .vfs-btn.orange { background: linear-gradient(135deg, #ff9800, #f57c00); }
            .vfs-btn.purple { background: linear-gradient(135deg, #9c27b0, #7b1fa2); }
            .vfs-btn.red { background: linear-gradient(135deg, #f44336, #d32f2f); }
            .vfs-btn.teal { background: linear-gradient(135deg, #009688, #00796b); }
            .vfs-btn.pink { background: linear-gradient(135deg, #e91e63, #c2185b); }
            .vfs-btn.gray { background: linear-gradient(135deg, #607d8b, #455a64); }
            .vfs-input {
                flex: 1;
                padding: 10px;
                border: 1px solid rgba(255,255,255,0.1);
                border-radius: 6px;
                background: rgba(0,0,0,0.3);
                color: #fff;
                font-size: 12px;
                outline: none;
            }
            .vfs-input:focus { border-color: #667eea; }
            .vfs-input::placeholder { color: rgba(255,255,255,0.4); }
            .vfs-label {
                font-size: 10px;
                color: #888;
                margin-bottom: 4px;
                display: block;
            }
            .vfs-calendar {
                background: rgba(0,0,0,0.2);
                border-radius: 8px;
                padding: 10px;
                margin-bottom: 8px;
            }
            .vfs-calendar-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 10px;
            }
            .vfs-calendar-nav {
                background: rgba(255,255,255,0.1);
                border: none;
                color: #fff;
                width: 28px;
                height: 28px;
                border-radius: 50%;
                cursor: pointer;
                font-size: 14px;
            }
            .vfs-calendar-nav:hover { background: rgba(255,255,255,0.2); }
            .vfs-calendar-title { font-weight: 600; font-size: 13px; }
            .vfs-calendar-grid {
                display: grid;
                grid-template-columns: repeat(7, 1fr);
                gap: 4px;
                text-align: center;
            }
            .vfs-calendar-day-header {
                font-size: 10px;
                color: #888;
                padding: 4px;
            }
            .vfs-calendar-day {
                padding: 8px 4px;
                border-radius: 6px;
                font-size: 11px;
                cursor: default;
                color: #555;
            }
            .vfs-calendar-day.available {
                background: rgba(76, 175, 80, 0.3);
                color: #4caf50;
                cursor: pointer;
                font-weight: 600;
            }
            .vfs-calendar-day.available:hover {
                background: rgba(76, 175, 80, 0.5);
            }
            .vfs-calendar-day.selected {
                background: #4caf50 !important;
                color: #fff !important;
            }
            .vfs-calendar-day.today {
                border: 1px solid #667eea;
            }
            .vfs-slots {
                display: flex;
                flex-wrap: wrap;
                gap: 4px;
                margin-bottom: 8px;
            }
            .vfs-slot {
                padding: 6px 10px;
                background: rgba(33, 150, 243, 0.2);
                border-radius: 4px;
                font-size: 10px;
                cursor: pointer;
                color: #90caf9;
            }
            .vfs-slot:hover { background: rgba(33, 150, 243, 0.4); }
            .vfs-slot.selected { background: #2196f3; color: #fff; }
            .vfs-log {
                background: rgba(0,0,0,0.3);
                border-radius: 6px;
                padding: 10px;
                font-size: 11px;
                min-height: 40px;
                margin-top: 8px;
                color: #aaa;
                word-break: break-all;
            }
            .vfs-section {
                margin-bottom: 12px;
            }
            .vfs-section-title {
                font-size: 10px;
                color: #667eea;
                text-transform: uppercase;
                letter-spacing: 1px;
                margin-bottom: 8px;
                padding-bottom: 4px;
                border-bottom: 1px solid rgba(255,255,255,0.1);
            }
            .vfs-grid {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 6px;
            }
        </style>

        <div class="vfs-header">
            <h3>VFS Slot Booker</h3>
            <span class="vfs-close" id="vfsClose">✕</span>
        </div>

        <div class="vfs-status">
            <span class="vfs-status-dot" id="statusDot"></span>
            <span id="statusText">Initializing...</span>
        </div>

        <div class="vfs-tabs">
            <button class="vfs-tab active" data-tab="action">Action</button>
            <button class="vfs-tab" data-tab="payload">Payload</button>
        </div>

        <div class="vfs-content">
            <!-- ACTION TAB -->
            <div class="vfs-tab-content active" id="tabAction">
                <div class="vfs-section">
                    <div class="vfs-section-title">Booking Flow</div>
                    <div class="vfs-row">
                        <button class="vfs-btn purple" id="btnApplication">Application</button>
                        <button class="vfs-btn orange" id="btnFees1">Fees</button>
                        <button class="vfs-btn pink" id="btnSendOtp">Send OTP</button>
                    </div>
                    <div class="vfs-row">
                        <input type="text" class="vfs-input" id="otpInput" placeholder="Enter OTP..." maxlength="6">
                        <button class="vfs-btn green" id="btnVerifyOtp">Verify</button>
                    </div>
                </div>

                <div class="vfs-section">
                    <div class="vfs-section-title">Select Date</div>
                    <div class="vfs-calendar" id="calendarContainer">
                        <div class="vfs-calendar-header">
                            <button class="vfs-calendar-nav" id="calPrev">‹</button>
                            <span class="vfs-calendar-title" id="calTitle">-</span>
                            <button class="vfs-calendar-nav" id="calNext">›</button>
                        </div>
                        <div class="vfs-calendar-grid" id="calGrid"></div>
                    </div>
                    <div class="vfs-row">
                        <button class="vfs-btn blue" id="btnCalendar">Load Calendar</button>
                    </div>
                </div>

                <div class="vfs-section">
                    <div class="vfs-section-title">Time Slots</div>
                    <div class="vfs-slots" id="slotsContainer">-</div>
                    <div class="vfs-row">
                        <button class="vfs-btn teal" id="btnTimeslot">Load Timeslots</button>
                    </div>
                </div>

                <div class="vfs-section">
                    <div class="vfs-section-title">Complete Booking</div>
                    <div class="vfs-row">
                        <button class="vfs-btn orange" id="btnFees2">Fees 2</button>
                        <button class="vfs-btn purple" id="btnMapvas">MapVAS</button>
                        <button class="vfs-btn orange" id="btnFees3">Fees 3</button>
                    </div>
                    <div class="vfs-row">
                        <button class="vfs-btn pink" id="btnConsent">Consent</button>
                        <button class="vfs-btn green" id="btnSchedule">Schedule</button>
                        <button class="vfs-btn gray" id="btnApplication2">App Status</button>
                    </div>
                    <div class="vfs-row">
                        <button class="vfs-btn red" id="btnCloudflare">Cloudflare</button>
                    </div>
                    <div id="cfContainer" style="margin-top:8px;"></div>
                </div>

                <div class="vfs-log" id="logBox">Ready</div>
            </div>

            <!-- PAYLOAD TAB -->
            <div class="vfs-tab-content" id="tabPayload">
                <div class="vfs-section">
                    <div class="vfs-section-title">Configuration</div>
                    <div class="vfs-grid">
                        <div>
                            <label class="vfs-label">Country</label>
                            <input type="text" class="vfs-input" id="cfgCountry" placeholder="bgd">
                        </div>
                        <div>
                            <label class="vfs-label">Mission</label>
                            <input type="text" class="vfs-input" id="cfgMission" placeholder="ita">
                        </div>
                        <div>
                            <label class="vfs-label">Center</label>
                            <input type="text" class="vfs-input" id="cfgCenter" placeholder="DAC">
                        </div>
                        <div>
                            <label class="vfs-label">Visa Category</label>
                            <input type="text" class="vfs-input" id="cfgCategory" placeholder="05">
                        </div>
                    </div>
                </div>

                <div class="vfs-section">
                    <div class="vfs-section-title">Booking Data</div>
                    <label class="vfs-label">URN (Auto-captured)</label>
                    <input type="text" class="vfs-input" id="cfgUrn" placeholder="URN will appear here..." style="margin-bottom:6px;">
                    <label class="vfs-label">Email</label>
                    <input type="text" class="vfs-input" id="cfgEmail" placeholder="Email" style="margin-bottom:6px;">
                    <label class="vfs-label">Allocation ID (Auto from timeslot)</label>
                    <input type="text" class="vfs-input" id="cfgAllocation" placeholder="Allocation ID..." readonly>
                </div>

                <div class="vfs-section">
                    <div class="vfs-section-title">Actions</div>
                    <div class="vfs-row">
                        <button class="vfs-btn blue" id="btnCapture">Capture</button>
                        <button class="vfs-btn green" id="btnSaveConfig">Save</button>
                        <button class="vfs-btn gray" id="btnShowJson">JSON</button>
                    </div>
                    <div class="vfs-row">
                        <button class="vfs-btn red" id="btnReset">Reset All</button>
                    </div>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(panel);

    // ════════════════════════════════════════════════════════════
    //  UI ELEMENTS
    // ════════════════════════════════════════════════════════════
    const $ = id => document.getElementById(id);
    const logBox = $('logBox');
    const statusDot = $('statusDot');
    const statusText = $('statusText');

    // Calendar state
    let calendarMonth = new Date().getMonth();
    let calendarYear = new Date().getFullYear();

    // ════════════════════════════════════════════════════════════
    //  LOGGING
    // ════════════════════════════════════════════════════════════
    function log(msg, color = '#aaa') {
        logBox.style.color = color;
        logBox.textContent = msg;
        console.log('[VFS]', msg);
    }

    // ════════════════════════════════════════════════════════════
    //  DRAG PANEL
    // ════════════════════════════════════════════════════════════
    let isDragging = false, dragX = 0, dragY = 0;
    panel.querySelector('.vfs-header').addEventListener('mousedown', e => {
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

    // Close button
    $('vfsClose').onclick = () => panel.remove();

    // Tabs
    document.querySelectorAll('.vfs-tab').forEach(tab => {
        tab.onclick = () => {
            document.querySelectorAll('.vfs-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.vfs-tab-content').forEach(c => c.classList.remove('active'));
            tab.classList.add('active');
            $('tab' + tab.dataset.tab.charAt(0).toUpperCase() + tab.dataset.tab.slice(1)).classList.add('active');
        };
    });

    // ════════════════════════════════════════════════════════════
    //  RSA ENCRYPTION
    // ════════════════════════════════════════════════════════════
    async function importRsaKey(base64Key) {
        let cleaned = base64Key
            .replace(/\|+/g, '')
            .replace(/-----BEGIN.*?-----/g, '')
            .replace(/-----END.*?-----/g, '')
            .replace(/\s+/g, '')
            .replace(/[^A-Za-z0-9+/=]/g, '');

        const binaryStr = atob(cleaned);
        const bytes = new Uint8Array(binaryStr.length);
        for (let i = 0; i < binaryStr.length; i++) {
            bytes[i] = binaryStr.charCodeAt(i);
        }

        // Try different formats
        const formats = [
            { name: 'RSA-OAEP', hash: 'SHA-256' },
            { name: 'RSA-OAEP', hash: 'SHA-1' }
        ];

        for (const fmt of formats) {
            try {
                return await crypto.subtle.importKey('spki', bytes.buffer, fmt, false, ['encrypt']);
            } catch (e) {}
        }
        throw new Error('RSA key import failed');
    }

    async function rsaEncrypt(plaintext) {
        if (!state.cryptoKey) throw new Error('No RSA key');
        const encoded = new TextEncoder().encode(plaintext);
        const encrypted = await crypto.subtle.encrypt({ name: 'RSA-OAEP' }, state.cryptoKey, encoded);
        return btoa(String.fromCharCode(...new Uint8Array(encrypted)));
    }

    function utcTimestamp() {
        const now = new Date();
        const p = n => String(n).padStart(2, '0');
        return `${now.getUTCFullYear()}-${p(now.getUTCMonth() + 1)}-${p(now.getUTCDate())}T${p(now.getUTCHours())}:${p(now.getUTCMinutes())}:${p(now.getUTCSeconds())}`;
    }

    async function generateClientSource() {
        const ts = utcTimestamp();
        const plaintext = `${state.userEmail};${ts}`;
        return rsaEncrypt(plaintext);
    }

    // ════════════════════════════════════════════════════════════
    //  BUILD HEADERS
    // ════════════════════════════════════════════════════════════
    async function buildHeaders(includeDatacenter = false) {
        const cs = await generateClientSource();
        const headers = {
            'accept': 'application/json, text/plain, */*',
            'authorize': state.accessToken,
            'clientsource': cs,
            'content-type': 'application/json;charset=UTF-8',
            'route': state.routeHeader || `${state.countryCode}/en/${state.missionCode}`
        };
        if (includeDatacenter) {
            headers['datacenter'] = 'GERMANY';
        }
        return headers;
    }

    // ════════════════════════════════════════════════════════════
    //  API CALL HELPER
    // ════════════════════════════════════════════════════════════
    async function apiCall(endpoint, body, options = {}) {
        if (!state.isReady && !options.skipReadyCheck) {
            throw new Error('Not ready. Browse VFS pages first.');
        }

        const headers = await buildHeaders(options.datacenter);
        const res = await fetch(`${API_BASE}/${endpoint}`, {
            method: 'POST',
            headers,
            body: JSON.stringify(body),
            credentials: 'include'
        });

        const data = await res.json().catch(() => ({}));
        console.log(`[VFS] ${endpoint}:`, { status: res.status, data });
        return { status: res.status, data, ok: res.ok };
    }

    // ════════════════════════════════════════════════════════════
    //  DATE HELPERS (DD/MM/YYYY format)
    // ════════════════════════════════════════════════════════════
    function formatDateDDMMYYYY(date) {
        const d = new Date(date);
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const year = d.getFullYear();
        return `${day}/${month}/${year}`;
    }

    function parseDateMMDDYYYY(dateStr) {
        // Parse MM/DD/YYYY from API response
        const [month, day, year] = dateStr.split('/');
        return new Date(year, parseInt(month) - 1, parseInt(day));
    }

    function parseDateDDMMYYYY(dateStr) {
        // Parse DD/MM/YYYY
        const [day, month, year] = dateStr.split('/');
        return new Date(year, parseInt(month) - 1, parseInt(day));
    }

    // ════════════════════════════════════════════════════════════
    //  TOKEN CAPTURE (Background)
    // ════════════════════════════════════════════════════════════
    function scanStorage() {
        const storages = [sessionStorage, localStorage];

        for (const storage of storages) {
            try {
                for (const key of Object.keys(storage)) {
                    const val = storage.getItem(key);
                    if (!val) continue;

                    // RSA Key
                    if (val.includes('MII') && !state.rsaKey && val.length > 200) {
                        let foundKey = val;
                        try {
                            const parsed = JSON.parse(val);
                            if (typeof parsed === 'string' && parsed.includes('MII')) foundKey = parsed;
                            else if (parsed?.rsaPublicKey) foundKey = parsed.rsaPublicKey;
                        } catch (e) {}

                        if (foundKey.includes('MII')) {
                            state.rsaKey = foundKey;
                            importRsaKey(foundKey).then(k => {
                                state.cryptoKey = k;
                                updateStatus();
                            }).catch(() => {});
                        }
                    }

                    // VFS Auth Token (starts with EAAAA) or JWT (eyJ)
                    if ((val.startsWith('EAAAA') || val.startsWith('eyJ')) && val.length > 100 && !state.accessToken) {
                        state.accessToken = val;
                        updateStatus();
                    }

                    // Email
                    if (!state.userEmail) {
                        const emailMatch = val.match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
                        if (emailMatch) {
                            state.userEmail = emailMatch[0];
                            $('cfgEmail').value = state.userEmail;
                            updateStatus();
                        }
                    }

                    // Try to find booking data
                    try {
                        const parsed = JSON.parse(val);
                        if (parsed?.urn && !state.urn) {
                            state.urn = parsed.urn;
                            $('cfgUrn').value = state.urn;
                        }
                        if (parsed?.countryCode) state.countryCode = parsed.countryCode;
                        if (parsed?.missionCode) state.missionCode = parsed.missionCode;
                        if (parsed?.centerCode) state.centerCode = parsed.centerCode;
                    } catch (e) {}
                }
            } catch (e) {}
        }
    }

    // Intercept fetch requests
    const origFetch = window.fetch;
    window.fetch = async function (...args) {
        const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';

        if (url.includes('lift-api') || url.includes('vfsglobal.com/api')) {
            const headers = args[1]?.headers || {};
            if (headers['authorize'] || headers['Authorize']) {
                state.accessToken = headers['authorize'] || headers['Authorize'];
            }
            if (headers['route'] || headers['Route']) {
                state.routeHeader = headers['route'] || headers['Route'];
            }

            // Capture payload data
            if (args[1]?.body) {
                try {
                    const body = JSON.parse(args[1].body);
                    if (body.urn && !state.urn) {
                        state.urn = body.urn;
                        $('cfgUrn').value = state.urn;
                    }
                    if (body.countryCode) state.countryCode = body.countryCode;
                    if (body.missionCode) state.missionCode = body.missionCode;
                    if (body.centerCode) state.centerCode = body.centerCode;
                    if (body.visaCategoryCode) state.visaCategoryCode = body.visaCategoryCode;
                    if (body.loginUser) {
                        state.userEmail = body.loginUser;
                        $('cfgEmail').value = state.userEmail;
                    }
                } catch (e) {}
            }

            updateStatus();
            saveState();
        }

        const res = await origFetch.apply(this, args);

        // Capture response data
        if (url.includes('lift-api')) {
            try {
                const clone = res.clone();
                const data = await clone.json();
                if (data.urn && !state.urn) {
                    state.urn = data.urn;
                    $('cfgUrn').value = state.urn;
                    log('URN captured: ' + state.urn, '#4caf50');
                }
            } catch (e) {}
        }

        return res;
    };

    // Extract from URL
    function extractFromUrl() {
        const match = window.location.pathname.match(/^\/([a-z]{2,3})\/([a-z]{2})\/([a-z]{2,3})/i);
        if (match) {
            state.routeHeader = `${match[1]}/${match[2]}/${match[3]}`;
            state.countryCode = match[1];
            state.missionCode = match[3];
        }
    }

    function updateStatus() {
        state.isReady = !!(state.rsaKey && state.accessToken && state.userEmail && state.cryptoKey);

        if (state.isReady) {
            statusDot.classList.add('ready');
            statusText.textContent = `Ready | ${state.userEmail} | ${state.routeHeader || 'No route'}`;
        } else {
            statusDot.classList.remove('ready');
            const missing = [];
            if (!state.rsaKey) missing.push('RSA');
            if (!state.accessToken) missing.push('Token');
            if (!state.userEmail) missing.push('Email');
            statusText.textContent = `Missing: ${missing.join(', ')}`;
        }
    }

    function saveState() {
        localStorage.setItem('vfsState', JSON.stringify({
            rsaKey: state.rsaKey,
            accessToken: state.accessToken,
            userEmail: state.userEmail,
            routeHeader: state.routeHeader,
            urn: state.urn,
            countryCode: state.countryCode,
            missionCode: state.missionCode,
            centerCode: state.centerCode,
            visaCategoryCode: state.visaCategoryCode
        }));
    }

    function loadConfigToUI() {
        $('cfgCountry').value = state.countryCode || '';
        $('cfgMission').value = state.missionCode || '';
        $('cfgCenter').value = state.centerCode || '';
        $('cfgCategory').value = state.visaCategoryCode || '';
        $('cfgUrn').value = state.urn || '';
        $('cfgEmail').value = state.userEmail || '';
        $('cfgAllocation').value = state.allocationId || '';
    }

    // ════════════════════════════════════════════════════════════
    //  CALENDAR UI
    // ════════════════════════════════════════════════════════════
    function renderCalendar() {
        const grid = $('calGrid');
        const title = $('calTitle');

        const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
            'July', 'August', 'September', 'October', 'November', 'December'];
        title.textContent = `${monthNames[calendarMonth]} ${calendarYear}`;

        // Day headers
        let html = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']
            .map(d => `<div class="vfs-calendar-day-header">${d}</div>`).join('');

        const firstDay = new Date(calendarYear, calendarMonth, 1);
        const lastDay = new Date(calendarYear, calendarMonth + 1, 0);
        const startPad = (firstDay.getDay() + 6) % 7; // Monday = 0

        // Empty cells before first day
        for (let i = 0; i < startPad; i++) {
            html += '<div class="vfs-calendar-day"></div>';
        }

        const today = new Date();
        const availSet = new Set(state.availableDates.map(d => {
            // Convert MM/DD/YYYY to comparable format
            const date = parseDateMMDDYYYY(d);
            return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
        }));

        // Days of month
        for (let day = 1; day <= lastDay.getDate(); day++) {
            const dateKey = `${calendarYear}-${calendarMonth}-${day}`;
            const isAvailable = availSet.has(dateKey);
            const isToday = today.getDate() === day && today.getMonth() === calendarMonth && today.getFullYear() === calendarYear;
            const isSelected = state.selectedDate && (() => {
                const sel = parseDateDDMMYYYY(state.selectedDate);
                return sel.getDate() === day && sel.getMonth() === calendarMonth && sel.getFullYear() === calendarYear;
            })();

            let classes = 'vfs-calendar-day';
            if (isAvailable) classes += ' available';
            if (isToday) classes += ' today';
            if (isSelected) classes += ' selected';

            const dateStr = formatDateDDMMYYYY(new Date(calendarYear, calendarMonth, day));
            html += `<div class="${classes}" data-date="${dateStr}">${day}</div>`;
        }

        grid.innerHTML = html;

        // Click handlers for available dates
        grid.querySelectorAll('.vfs-calendar-day.available').forEach(el => {
            el.onclick = () => {
                state.selectedDate = el.dataset.date;
                renderCalendar();
                log(`Selected: ${state.selectedDate}`, '#4caf50');
                // Auto-load timeslots
                loadTimeslots();
            };
        });
    }

    $('calPrev').onclick = () => {
        calendarMonth--;
        if (calendarMonth < 0) { calendarMonth = 11; calendarYear--; }
        renderCalendar();
    };

    $('calNext').onclick = () => {
        calendarMonth++;
        if (calendarMonth > 11) { calendarMonth = 0; calendarYear++; }
        renderCalendar();
    };

    // ════════════════════════════════════════════════════════════
    //  API FUNCTIONS
    // ════════════════════════════════════════════════════════════

    // 1. Application
    async function callApplication() {
        log('Creating application...', '#ffcc80');
        // This is usually done on VFS page, we just capture the URN
        // For now, just show the current URN
        if (state.urn) {
            log(`URN: ${state.urn}`, '#4caf50');
        } else {
            log('No URN captured. Complete application on VFS page.', '#ef5350');
        }
    }

    // 2. Fees
    async function callFees() {
        if (!state.urn) {
            log('No URN! Complete application first.', '#ef5350');
            return;
        }

        log('Loading fees...', '#ffcc80');

        try {
            const result = await apiCall('appointment/fees', {
                missionCode: state.missionCode,
                countryCode: state.countryCode,
                centerCode: state.centerCode,
                loginUser: state.userEmail,
                urn: state.urn,
                languageCode: state.languageCode
            });

            if (result.data?.error) {
                log('Fees error: ' + JSON.stringify(result.data.error), '#ef5350');
            } else {
                log(`Fees: ${result.data.totalamount || 0} ${result.data.currency || 'BDT'}`, '#4caf50');
            }
        } catch (e) {
            log('Error: ' + e.message, '#ef5350');
        }
    }

    // 3. Send OTP
    async function callSendOtp() {
        if (!state.urn) {
            log('No URN!', '#ef5350');
            return;
        }

        log('Sending OTP...', '#ffcc80');

        try {
            const result = await apiCall('appointment/applicantotp', {
                urn: state.urn,
                loginUser: state.userEmail,
                missionCode: state.missionCode,
                countryCode: state.countryCode,
                centerCode: state.centerCode,
                captcha_version: '',
                captcha_api_key: '',
                OTP: '',
                otpAction: 'GENERATE',
                languageCode: state.languageCode,
                userAction: null
            }, { datacenter: true });

            if (result.data?.isOTPGenerated) {
                log(`OTP sent! Expires in ${result.data.otpExpiryInMinutes}min`, '#4caf50');
            } else {
                log('OTP failed: ' + (result.data?.error || 'Unknown'), '#ef5350');
            }
        } catch (e) {
            log('Error: ' + e.message, '#ef5350');
        }
    }

    // 4. Verify OTP
    async function callVerifyOtp() {
        const otp = $('otpInput').value.trim();
        if (!otp) {
            log('Enter OTP first!', '#ef5350');
            return;
        }
        if (!state.urn) {
            log('No URN!', '#ef5350');
            return;
        }

        log('Verifying OTP...', '#ffcc80');

        try {
            const result = await apiCall('appointment/applicantotp', {
                urn: state.urn,
                loginUser: state.userEmail,
                missionCode: state.missionCode,
                countryCode: state.countryCode,
                centerCode: state.centerCode,
                captcha_version: '',
                captcha_api_key: '',
                OTP: otp,
                otpAction: 'VALIDATE',
                languageCode: state.languageCode,
                userAction: null
            }, { datacenter: true });

            if (result.data?.isOTPValidated) {
                log('OTP Verified!', '#4caf50');
            } else {
                log('OTP Invalid!', '#ef5350');
            }
        } catch (e) {
            log('Error: ' + e.message, '#ef5350');
        }
    }

    // 5. Calendar
    async function callCalendar() {
        if (!state.urn) {
            log('No URN!', '#ef5350');
            return;
        }

        log('Loading calendar...', '#ffcc80');

        const fromDate = formatDateDDMMYYYY(new Date());

        try {
            const result = await apiCall('appointment/calendar', {
                countryCode: state.countryCode,
                missionCode: state.missionCode,
                centerCode: state.centerCode,
                loginUser: state.userEmail,
                visaCategoryCode: state.visaCategoryCode,
                fromDate: fromDate,
                urn: state.urn,
                payCode: ''
            });

            if (result.data?.calendars?.length > 0) {
                // Get unique dates
                state.availableDates = [...new Set(result.data.calendars.map(c => c.date))];
                log(`Found ${state.availableDates.length} available dates!`, '#4caf50');

                // Set calendar to first available date's month
                if (state.availableDates.length > 0) {
                    const firstDate = parseDateMMDDYYYY(state.availableDates[0]);
                    calendarMonth = firstDate.getMonth();
                    calendarYear = firstDate.getFullYear();
                }
                renderCalendar();
            } else {
                log('No dates available', '#ef5350');
                state.availableDates = [];
                renderCalendar();
            }
        } catch (e) {
            log('Error: ' + e.message, '#ef5350');
        }
    }

    // 6. Timeslot
    async function loadTimeslots() {
        if (!state.selectedDate) {
            log('Select a date first!', '#ef5350');
            return;
        }
        if (!state.urn) {
            log('No URN!', '#ef5350');
            return;
        }

        log('Loading timeslots...', '#ffcc80');

        try {
            const result = await apiCall('appointment/timeslot', {
                countryCode: state.countryCode,
                missionCode: state.missionCode,
                centerCode: state.centerCode,
                loginUser: state.userEmail,
                visaCategoryCode: state.visaCategoryCode,
                slotDate: state.selectedDate,
                urn: state.urn
            });

            if (result.data?.slots?.length > 0) {
                state.availableSlots = result.data.slots;

                // Render slots
                const container = $('slotsContainer');
                container.innerHTML = state.availableSlots.map((s, i) =>
                    `<div class="vfs-slot" data-idx="${i}">${s.slot}</div>`
                ).join('');

                // Click handlers
                container.querySelectorAll('.vfs-slot').forEach(el => {
                    el.onclick = () => selectSlot(parseInt(el.dataset.idx));
                });

                // Auto-select LAST slot
                selectSlot(state.availableSlots.length - 1);

                log(`${state.availableSlots.length} slots found. Last selected.`, '#4caf50');
            } else {
                log('No slots available', '#ef5350');
                $('slotsContainer').innerHTML = '<span style="color:#ef5350">No slots</span>';
            }
        } catch (e) {
            log('Error: ' + e.message, '#ef5350');
        }
    }

    function selectSlot(idx) {
        const slot = state.availableSlots[idx];
        if (!slot) return;

        state.allocationId = slot.allocationId;
        state.selectedTime = slot.slot;
        $('cfgAllocation').value = state.allocationId;

        // Update UI
        document.querySelectorAll('.vfs-slot').forEach((el, i) => {
            el.classList.toggle('selected', i === idx);
        });

        log(`Selected: ${slot.slot} (${slot.allocationCategory})`, '#4caf50');
    }

    // 7. MapVAS (lowercase fields!)
    async function callMapvas() {
        if (!state.urn) {
            log('No URN!', '#ef5350');
            return;
        }

        log('Calling MapVAS...', '#ffcc80');

        try {
            const result = await apiCall('vas/mapvas', {
                loginuser: state.userEmail,  // lowercase!
                missioncode: state.missionCode,  // lowercase!
                countrycode: state.countryCode,  // lowercase!
                urn: state.urn,
                applicants: []
            });

            if (result.data?.error === null) {
                log(`MapVAS OK: ${result.data.amount} ${result.data.currency}`, '#4caf50');
            } else {
                log('MapVAS error: ' + JSON.stringify(result.data?.error), '#ef5350');
            }
        } catch (e) {
            log('Error: ' + e.message, '#ef5350');
        }
    }

    // 8. Consent
    async function callConsent() {
        log('Sending consent...', '#ffcc80');

        // This goes to different domain, no VFS headers
        try {
            const res = await fetch('https://vfsglobal-privacy.my.onetrust.com/request/v1/consentreceipts', {
                method: 'POST',
                headers: {
                    'accept': '*/*',
                    'content-type': 'application/json'
                },
                body: JSON.stringify({
                    requestInformation: '', // Would need JWT from page
                    identifier: state.userEmail,
                    language: null,
                    purposes: [
                        { Id: '5dac333a-b947-4f47-a1eb-4140bc27ff7c' },
                        { Id: '42bad10d-916e-401f-9197-68d757a4ee8a' }
                    ],
                    dsDataElements: {
                        URL: `https://visa.vfsglobal.com/${state.countryCode}/en/${state.missionCode}/review-pay`,
                        FullName: '',
                        PatronymicName: ''
                    }
                })
            });

            if (res.ok) {
                log('Consent sent!', '#4caf50');
            } else {
                log('Consent failed: ' + res.status, '#ef5350');
            }
        } catch (e) {
            log('Consent error: ' + e.message, '#ef5350');
        }
    }

    // 9. Schedule
    async function callSchedule() {
        if (!state.urn) {
            log('No URN!', '#ef5350');
            return;
        }
        if (!state.allocationId) {
            log('No allocation ID! Select a timeslot first.', '#ef5350');
            return;
        }

        log('Scheduling appointment...', '#ffcc80');

        try {
            const result = await apiCall('appointment/schedule', {
                missionCode: state.missionCode,
                countryCode: state.countryCode,
                centerCode: state.centerCode,
                loginUser: state.userEmail,
                urn: state.urn,
                aurn: null,
                notificationType: 'none',
                paymentdetails: {
                    paymentmode: 'Vac',
                    RequestRefNo: '',
                    clientId: '',
                    merchantId: '',
                    amount: 0,
                    currency: 'BDT'
                },
                allocationId: state.allocationId,
                CanVFSReachoutToApplicant: true,
                TnCConsentAndAcceptance: true
            });

            if (result.data?.IsAppointmentBooked) {
                log(`BOOKED! ${result.data.appointmentDate} at ${result.data.appointmentTime}`, '#4caf50');
                playSound();
            } else {
                log('Booking failed: ' + JSON.stringify(result.data?.error), '#ef5350');
            }
        } catch (e) {
            log('Error: ' + e.message, '#ef5350');
        }
    }

    // 10. Application Status
    async function callApplicationStatus() {
        log('Getting application status...', '#ffcc80');

        try {
            const result = await apiCall('appointment/application', {
                countryCode: state.countryCode,
                missionCode: state.missionCode,
                loginUser: state.userEmail,
                aurn: '',
                emailId: '',
                countactNumber: '',
                passportNumber: ''
            });

            if (result.data?.data?.length > 0) {
                const app = result.data.data[0];
                const appt = app.applicants?.[0]?.appointment;
                if (appt) {
                    log(`Booked: ${appt.appoinmentDate} ${appt.appointmentTime}`, '#4caf50');
                } else {
                    log('Application found, no appointment yet', '#ffcc80');
                }
            } else {
                log('No applications found', '#ef5350');
            }
        } catch (e) {
            log('Error: ' + e.message, '#ef5350');
        }
    }

    // Sound alert
    function playSound() {
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            [523, 659, 784, 1047].forEach((freq, i) => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.frequency.value = freq;
                gain.gain.setValueAtTime(0.3, ctx.currentTime + i * 0.15);
                gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + i * 0.15 + 0.2);
                osc.start(ctx.currentTime + i * 0.15);
                osc.stop(ctx.currentTime + i * 0.15 + 0.2);
            });
        } catch (e) {}
    }

    // ════════════════════════════════════════════════════════════
    //  CLOUDFLARE TURNSTILE
    // ════════════════════════════════════════════════════════════
    let turnstileWidgetId = null;
    let captchaToken = null;

    function loadTurnstileScript() {
        return new Promise((resolve, reject) => {
            if (window.turnstile) {
                resolve();
                return;
            }

            const script = document.createElement('script');
            script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
            script.async = true;
            script.onload = () => {
                log('Turnstile script loaded', '#4caf50');
                resolve();
            };
            script.onerror = () => {
                log('Failed to load Turnstile', '#ef5350');
                reject(new Error('Turnstile load failed'));
            };
            document.head.appendChild(script);
        });
    }

    async function renderCloudflare() {
        const container = $('cfContainer');

        log('Loading Cloudflare Turnstile...', '#ffcc80');

        try {
            await loadTurnstileScript();

            // Clear previous widget
            if (turnstileWidgetId !== null && window.turnstile) {
                try { window.turnstile.remove(turnstileWidgetId); } catch (e) {}
            }
            container.innerHTML = '<div id="cfWidget"></div>';

            // VFS uses this sitekey
            const siteKey = '0x4AAAAAAAVrOwQWPlm3Xaeb';

            turnstileWidgetId = window.turnstile.render('#cfWidget', {
                sitekey: siteKey,
                theme: 'dark',
                callback: (token) => {
                    captchaToken = token;
                    log('Cloudflare solved! Token captured.', '#4caf50');
                    // Store for API calls
                    state.captchaToken = token;
                    saveState();
                },
                'error-callback': () => {
                    log('Cloudflare challenge failed', '#ef5350');
                },
                'expired-callback': () => {
                    log('Cloudflare token expired, click again', '#ffcc80');
                    captchaToken = null;
                }
            });

            log('Solve the captcha above', '#90caf9');

        } catch (e) {
            log('Cloudflare error: ' + e.message, '#ef5350');
        }
    }

    // ════════════════════════════════════════════════════════════
    //  EVENT LISTENERS
    // ════════════════════════════════════════════════════════════

    // Action buttons
    $('btnApplication').onclick = callApplication;
    $('btnFees1').onclick = callFees;
    $('btnSendOtp').onclick = callSendOtp;
    $('btnVerifyOtp').onclick = callVerifyOtp;
    $('btnCalendar').onclick = callCalendar;
    $('btnTimeslot').onclick = loadTimeslots;
    $('btnFees2').onclick = callFees;
    $('btnMapvas').onclick = callMapvas;
    $('btnFees3').onclick = callFees;
    $('btnConsent').onclick = callConsent;
    $('btnSchedule').onclick = callSchedule;
    $('btnApplication2').onclick = callApplicationStatus;
    $('btnCloudflare').onclick = renderCloudflare;

    // Auto verify OTP on 6 digits
    $('otpInput').oninput = () => {
        if ($('otpInput').value.length === 6) {
            setTimeout(callVerifyOtp, 300);
        }
    };

    // Payload buttons
    $('btnCapture').onclick = () => {
        scanStorage();
        loadConfigToUI();
        log('Captured from storage', '#4caf50');
    };

    $('btnSaveConfig').onclick = () => {
        state.countryCode = $('cfgCountry').value || 'bgd';
        state.missionCode = $('cfgMission').value || 'ita';
        state.centerCode = $('cfgCenter').value || 'DAC';
        state.visaCategoryCode = $('cfgCategory').value || '05';
        state.urn = $('cfgUrn').value;
        state.userEmail = $('cfgEmail').value;
        saveState();
        updateStatus();
        log('Config saved!', '#4caf50');
    };

    $('btnShowJson').onclick = () => {
        console.log('[VFS] Current State:', JSON.stringify(state, null, 2));
        log('State logged to console (F12)', '#90caf9');
    };

    $('btnReset').onclick = () => {
        if (!confirm('Reset all tokens and data?')) return;
        localStorage.removeItem('vfsState');
        state = {
            rsaKey: '', cryptoKey: null, accessToken: '', clientSource: '',
            userEmail: '', routeHeader: '', isReady: false, urn: '',
            allocationId: '', selectedDate: '', selectedTime: '',
            availableDates: [], availableSlots: [],
            countryCode: 'bgd', missionCode: 'ita', centerCode: 'DAC',
            visaCategoryCode: '05', languageCode: 'en-US'
        };
        loadConfigToUI();
        updateStatus();
        log('Reset complete', '#ffcc80');
    };

    // ════════════════════════════════════════════════════════════
    //  INITIALIZATION
    // ════════════════════════════════════════════════════════════
    extractFromUrl();
    scanStorage();
    loadConfigToUI();
    updateStatus();
    renderCalendar();

    // Periodic scan
    setInterval(() => {
        scanStorage();
        updateStatus();
    }, 3000);

    log('VFS Slot Booker v4.0 Ready', '#4caf50');

})();
