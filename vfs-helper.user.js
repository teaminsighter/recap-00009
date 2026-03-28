// ==UserScript==
// @name         VFS Slot Booker Pro
// @namespace    http://tampermonkey.net/
// @version      3.3
// @description  VFS Global Appointment Booking - Token Capture, API Calls, Auto-Booking
// @match        *://*.vfsglobal.com/*
// @match        *://visa.vfsglobal.com/*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    // =================== VARIABLES ===================
    let accessToken = "";
    let rsaKey = "";
    let cryptoKey = null;
    let clientSource = "";
    let userEmail = "";
    let routeHeader = "";
    let isReady = false;

    // Payload config
    let payloadConfig = JSON.parse(localStorage.getItem('vfsPayloadConfig') || '{}');

    const API_BASE = 'https://lift-api.vfsglobal.com';

    // =================== UI PANEL ===================
    const panel = document.createElement("div");
    panel.id = "vfsPanel";
    panel.style = `
        position:fixed;
        top:100px;
        left:calc(100% - 400px);
        width:380px;
        padding:15px;
        border-radius:12px;
        background:linear-gradient(
            rgba(0,0,0,0.85),
            rgba(0,0,0,0.85)
        ),
        url("https://i.imgur.com/YcVKxdP.jpg");
        background-size:cover;
        background-position:center;
        color:white;
        box-shadow:0 5px 30px rgba(0,0,0,0.5);
        z-index:99999;
        font-family:Arial, sans-serif;
        user-select:none;
        cursor:grab;
        max-height:90vh;
        overflow-y:auto;
    `;

    panel.innerHTML = `
        <span id="closePanel"
            style="position:absolute;right:10px;top:8px;cursor:pointer;font-size:18px;font-weight:bold;color:#ff5252">
            ✖
        </span>

        <h3 style="margin-top:0;text-align:center;color:#4fc3f7;font-size:22px;text-shadow: 0 0 10px #4fc3f7;">
            🛫 VFS SLOT BOOKER
        </h3>

        <!-- Status Box -->
        <div id="statusBox" style="
            background:rgba(255,255,255,0.1);
            border-radius:8px;
            padding:10px;
            margin-bottom:10px;
            text-align:center;
        ">
            <div id="tokenStatus" style="font-size:12px;margin-bottom:5px;">
                RSA: <span id="rsaStatus" style="color:#ef5350">✗</span> |
                Auth: <span id="authStatus" style="color:#ef5350">✗</span> |
                Email: <span id="emailStatus" style="color:#ef5350">✗</span>
            </div>
            <div id="mainStatus" style="font-size:14px;font-weight:500;color:#ffcc80;">Browse VFS to capture tokens...</div>
        </div>

        <!-- Config Section -->
        <div style="background:rgba(255,255,255,0.05);border-radius:8px;padding:10px;margin-bottom:10px;">
            <div style="font-size:10px;opacity:0.7;margin-bottom:8px;text-align:center;">📋 BOOKING CONFIG</div>

            <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">
                <input id="vfsCountry" placeholder="Country (bgd)"
                    style="padding:8px;border-radius:6px;border:none;font-size:12px;">
                <input id="vfsMission" placeholder="Mission (deu)"
                    style="padding:8px;border-radius:6px;border:none;font-size:12px;">
                <input id="vfsCenter" placeholder="Center (DAC)"
                    style="padding:8px;border-radius:6px;border:none;font-size:12px;">
                <input id="vfsCategory" placeholder="Visa Category"
                    style="padding:8px;border-radius:6px;border:none;font-size:12px;">
                <input id="vfsUrn" placeholder="URN (Reference Number)"
                    style="grid-column:1/-1;padding:8px;border-radius:6px;border:none;font-size:12px;">
                <input id="vfsEmail" placeholder="Email"
                    style="grid-column:1/-1;padding:8px;border-radius:6px;border:none;font-size:12px;">
            </div>

            <button id="saveConfigBtn"
                style="width:100%;padding:8px;margin-top:8px;background:#4caf50;border:none;color:white;border-radius:6px;cursor:pointer;font-weight:500;">
                💾 Save Config
            </button>
        </div>

        <!-- API Actions -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:5px;margin-bottom:10px;">
            <button id="checkSlotsBtn"
                style="padding:10px;background:#2196f3;color:white;border:none;border-radius:6px;cursor:pointer;font-weight:500;">
                🔍 Check Slots
            </button>
            <button id="getCalendarBtn"
                style="padding:10px;background:#9c27b0;color:white;border:none;border-radius:6px;cursor:pointer;font-weight:500;">
                📅 Calendar
            </button>
            <button id="getTimesBtn"
                style="padding:10px;background:#00bcd4;color:white;border:none;border-radius:6px;cursor:pointer;font-weight:500;">
                🕐 Time Slots
            </button>
            <button id="getFeesBtn"
                style="padding:10px;background:#ff9800;color:white;border:none;border-radius:6px;cursor:pointer;font-weight:500;">
                💰 Fees
            </button>
        </div>

        <!-- Available Dates Display -->
        <div style="background:rgba(0,0,0,0.3);border-radius:8px;padding:8px;margin-bottom:10px;">
            <div style="font-size:10px;opacity:0.7;margin-bottom:4px;">📅 Available Dates:</div>
            <div id="datesDisplay" style="font-size:11px;max-height:50px;overflow-y:auto;color:#a5d6a7;">-</div>
        </div>

        <!-- Available Times Display -->
        <div style="background:rgba(0,0,0,0.3);border-radius:8px;padding:8px;margin-bottom:10px;">
            <div style="font-size:10px;opacity:0.7;margin-bottom:4px;">🕐 Time Slots:</div>
            <div id="timesDisplay" style="font-size:11px;max-height:50px;overflow-y:auto;color:#90caf9;">-</div>
        </div>

        <!-- Booking Section -->
        <div style="background:rgba(76,175,80,0.1);border:1px solid #4caf50;border-radius:8px;padding:10px;margin-bottom:10px;">
            <div style="font-size:11px;opacity:0.8;margin-bottom:8px;text-align:center;color:#a5d6a7;">🎯 BOOKING</div>

            <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:8px;">
                <input id="selectedDate" placeholder="Date (DD/MM/YYYY)"
                    style="padding:8px;border-radius:6px;border:none;font-size:12px;">
                <input id="selectedTime" placeholder="Time (09:00)"
                    style="padding:8px;border-radius:6px;border:none;font-size:12px;">
            </div>

            <div style="display:flex;gap:5px;margin-bottom:8px;">
                <button id="sendOtpBtn"
                    style="flex:1;padding:10px;background:#9c27b0;color:white;border:none;border-radius:6px;cursor:pointer;font-weight:500;">
                    📧 Send OTP
                </button>
                <button id="otpTimerBtn"
                    style="width:70px;padding:10px;background:#2196f3;color:white;border:none;border-radius:6px;cursor:pointer;font-weight:500;">
                    Timer
                </button>
            </div>

            <div style="display:flex;gap:5px;margin-bottom:8px;">
                <input id="otpInput" placeholder="Enter 6-digit OTP"
                    style="flex:1;padding:8px;border-radius:6px;border:none;font-size:12px;">
                <button id="getOtpBtn"
                    style="width:70px;padding:8px;background:#ff9800;color:white;border:none;border-radius:6px;cursor:pointer;font-weight:500;">
                    📥 Get
                </button>
                <button id="verifyOtpBtn"
                    style="width:70px;padding:8px;background:#673ab7;color:white;border:none;border-radius:6px;cursor:pointer;font-weight:500;">
                    ✓ Verify
                </button>
            </div>

            <!-- OTP API Config -->
            <div style="display:flex;gap:5px;margin-bottom:8px;">
                <input id="otpApiUrl" placeholder="OTP API URL"
                    style="flex:1;padding:6px;border-radius:6px;border:none;font-size:10px;background:#1b2437;color:#fff;">
                <button id="stopOtpBtn"
                    style="width:60px;padding:6px;background:#f44336;color:white;border:none;border-radius:6px;cursor:pointer;font-size:10px;">
                    Stop
                </button>
            </div>

            <button id="bookNowBtn"
                style="width:100%;padding:12px;background:linear-gradient(135deg,#4caf50,#2e7d32);color:white;border:none;border-radius:6px;cursor:pointer;font-size:14px;font-weight:600;">
                ✅ BOOK APPOINTMENT
            </button>

            <button id="payNowBtn"
                style="width:100%;padding:12px;margin-top:8px;background:linear-gradient(135deg,#f44336,#c62828);color:white;border:none;border-radius:6px;cursor:pointer;font-size:14px;font-weight:600;">
                💳 PAY NOW
            </button>

            <input id="paymentLinkInput" placeholder="Payment Link will appear here..."
                style="width:100%;margin-top:8px;padding:8px;border-radius:6px;border:none;background:#1b2437;color:#4fc3f7;font-size:11px;" readonly>
        </div>

        <!-- Auto Mode -->
        <div style="display:flex;gap:5px;margin-bottom:10px;">
            <button id="startAutoBtn"
                style="flex:1;padding:10px;background:#4caf50;color:white;border:none;border-radius:6px;cursor:pointer;font-weight:500;">
                ▶ Start Auto
            </button>
            <button id="stopAutoBtn"
                style="flex:1;padding:10px;background:#f44336;color:white;border:none;border-radius:6px;cursor:pointer;font-weight:500;">
                ⏹ Stop Auto
            </button>
        </div>

        <!-- Watch Settings -->
        <div style="display:flex;gap:8px;margin-bottom:10px;align-items:center;">
            <div style="flex:1;">
                <label style="font-size:10px;opacity:0.7;display:block;margin-bottom:3px;">Interval (sec)</label>
                <input id="watchInterval" type="number" value="30" min="10" max="300"
                    style="width:100%;padding:8px;border-radius:6px;border:none;font-size:13px;">
            </div>
            <div style="flex:1;">
                <label style="font-size:10px;opacity:0.7;display:block;margin-bottom:3px;">Countdown</label>
                <div id="countdownDisplay" style="
                    padding:8px;
                    border-radius:6px;
                    background:rgba(255,255,255,0.15);
                    font-size:13px;
                    text-align:center;
                    font-weight:600;
                ">--</div>
            </div>
        </div>

        <!-- Options -->
        <div style="display:flex;gap:10px;margin-bottom:10px;flex-wrap:wrap;">
            <label style="display:flex;align-items:center;gap:5px;font-size:11px;cursor:pointer;">
                <input type="checkbox" id="soundToggle" checked> 🔊 Sound
            </label>
            <label style="display:flex;align-items:center;gap:5px;font-size:11px;cursor:pointer;">
                <input type="checkbox" id="autoBookToggle"> 🤖 Auto-Book
            </label>
        </div>

        <!-- Booking Result -->
        <div id="bookingResult" style="display:none;padding:10px;border-radius:8px;margin-bottom:10px;text-align:center;font-weight:500;"></div>

        <!-- Log Box -->
        <div id="logBox" style="
            background:rgba(0,0,0,0.3);
            border-radius:8px;
            padding:10px;
            font-size:14px;
            text-align:center;
            min-height:40px;
            display:flex;
            align-items:center;
            justify-content:center;
        ">Ready</div>

        <!-- Reset -->
        <button id="resetBtn"
            style="width:100%;padding:8px;margin-top:10px;background:#424242;border:none;color:white;border-radius:6px;cursor:pointer;font-size:11px;">
            🔄 Reset Tokens
        </button>

        <div style="margin-top:10px;text-align:center;font-size:9px;opacity:0.5;">
            v3.3 | Token Capture + API + Auto-Booking + Auto OTP + Payment
        </div>
    `;

    document.body.appendChild(panel);

    // =================== STYLES ===================
    const style = document.createElement('style');
    style.textContent = `
        #vfsPanel button:hover { opacity: 0.9; transform: scale(0.98); }
        #vfsPanel button:active { transform: scale(0.95); }
        #vfsPanel input:focus { outline: 2px solid #4fc3f7; }
        #vfsPanel::-webkit-scrollbar { width: 5px; }
        #vfsPanel::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.3); border-radius: 3px; }
        .vfs-date-chip {
            cursor:pointer;
            padding:3px 6px;
            background:rgba(76,175,80,0.3);
            border-radius:4px;
            margin:2px;
            display:inline-block;
            transition: all 0.2s;
        }
        .vfs-date-chip:hover { background:rgba(76,175,80,0.6); }
        .vfs-time-chip {
            cursor:pointer;
            padding:3px 6px;
            background:rgba(33,150,243,0.3);
            border-radius:4px;
            margin:2px;
            display:inline-block;
            transition: all 0.2s;
        }
        .vfs-time-chip:hover { background:rgba(33,150,243,0.6); }
    `;
    document.head.appendChild(style);

    // =================== ELEMENTS ===================
    const logBox = document.getElementById("logBox");
    const datesDisplay = document.getElementById("datesDisplay");
    const timesDisplay = document.getElementById("timesDisplay");

    // =================== CLOSE PANEL ===================
    document.getElementById("closePanel").onclick = () => panel.remove();
    document.getElementById("closePanel").addEventListener("mousedown", e => e.stopPropagation());

    // =================== DRAG ===================
    let isDragging = false, offsetX = 0, offsetY = 0;

    panel.addEventListener("mousedown", e => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON') return;
        isDragging = true;
        offsetX = e.clientX - panel.offsetLeft;
        offsetY = e.clientY - panel.offsetTop;
        panel.style.cursor = "grabbing";
    });

    document.addEventListener("mouseup", () => {
        isDragging = false;
        panel.style.cursor = "grab";
    });

    document.addEventListener("mousemove", e => {
        if (!isDragging) return;
        panel.style.left = (e.clientX - offsetX) + "px";
        panel.style.top = (e.clientY - offsetY) + "px";
    });

    // =================== LOG ===================
    function log(msg, color = "#fff") {
        if (logBox) {
            logBox.style.color = color;
            logBox.innerText = msg;
        }
        console.log("[VFS]", msg);
    }

    // =================== SOUND ===================
    function playSound() {
        if (!document.getElementById("soundToggle")?.checked) return;
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const play = (freq, start, dur) => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.frequency.value = freq;
                osc.type = 'sine';
                gain.gain.setValueAtTime(0.3, ctx.currentTime + start);
                gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + start + dur);
                osc.start(ctx.currentTime + start);
                osc.stop(ctx.currentTime + start + dur);
            };
            play(523, 0, 0.15);
            play(659, 0.15, 0.15);
            play(784, 0.3, 0.15);
            play(1047, 0.45, 0.3);
        } catch (e) {}
    }

    // =================== RSA ENCRYPTION ===================
    async function importRsaKey(base64Key) {
        console.log('[VFS] Attempting to import RSA key, length:', base64Key.length);

        // Clean: remove pipes, newlines, PEM headers, spaces
        let cleaned = base64Key
            .replace(/\|+/g, '')
            .replace(/-----BEGIN PUBLIC KEY-----/g, '')
            .replace(/-----END PUBLIC KEY-----/g, '')
            .replace(/-----BEGIN RSA PUBLIC KEY-----/g, '')
            .replace(/-----END RSA PUBLIC KEY-----/g, '')
            .replace(/\s+/g, '')
            .replace(/[^A-Za-z0-9+/=]/g, ''); // Remove any non-base64 chars

        console.log('[VFS] Cleaned key length:', cleaned.length);

        // Decode base64 to ArrayBuffer
        let binaryStr;
        try {
            binaryStr = atob(cleaned);
        } catch (e) {
            console.error('[VFS] Base64 decode failed:', e.message);
            throw new Error('Invalid base64 in RSA key');
        }

        const bytes = new Uint8Array(binaryStr.length);
        for (let i = 0; i < binaryStr.length; i++) {
            bytes[i] = binaryStr.charCodeAt(i);
        }
        console.log('[VFS] Key binary length:', bytes.length, 'bytes');

        // Try SPKI format first (standard)
        try {
            const key = await crypto.subtle.importKey(
                'spki',
                bytes.buffer,
                { name: 'RSA-OAEP', hash: 'SHA-256' },
                false,
                ['encrypt']
            );
            console.log('[VFS] ✅ RSA key imported successfully (SPKI format)');
            return key;
        } catch (e) {
            console.log('[VFS] SPKI import failed:', e.message);
        }

        // Try with SHA-1 hash (some VFS implementations use this)
        try {
            const key = await crypto.subtle.importKey(
                'spki',
                bytes.buffer,
                { name: 'RSA-OAEP', hash: 'SHA-1' },
                false,
                ['encrypt']
            );
            console.log('[VFS] ✅ RSA key imported successfully (SPKI + SHA-1)');
            return key;
        } catch (e) {
            console.log('[VFS] SPKI+SHA-1 import failed:', e.message);
        }

        // Try RSAES-PKCS1-v1_5 (older format)
        try {
            const key = await crypto.subtle.importKey(
                'spki',
                bytes.buffer,
                { name: 'RSAES-PKCS1-v1_5' },
                false,
                ['encrypt']
            );
            console.log('[VFS] ✅ RSA key imported successfully (PKCS1)');
            return key;
        } catch (e) {
            console.log('[VFS] PKCS1 import failed:', e.message);
        }

        // If all imports fail, throw error with details
        throw new Error(`Failed to import RSA key. Binary length: ${bytes.length}. First bytes: ${Array.from(bytes.slice(0, 10)).map(b => b.toString(16).padStart(2, '0')).join(' ')}`);
    }

    async function rsaEncrypt(plaintext) {
        if (!cryptoKey) throw new Error('RSA key not loaded');
        const encoded = new TextEncoder().encode(plaintext);
        const encrypted = await crypto.subtle.encrypt(
            { name: 'RSA-OAEP' },
            cryptoKey,
            encoded
        );
        const bytes = new Uint8Array(encrypted);
        let binary = '';
        for (let i = 0; i < bytes.length; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
    }

    function utcTimestamp() {
        const now = new Date();
        const p = (n) => String(n).padStart(2, '0');
        return `${now.getUTCFullYear()}-${p(now.getUTCMonth() + 1)}-${p(now.getUTCDate())}T${p(now.getUTCHours())}:${p(now.getUTCMinutes())}:${p(now.getUTCSeconds())}`;
    }

    async function generateClientSource() {
        const ts = utcTimestamp();
        const plaintext = `${userEmail};${ts}`;
        return rsaEncrypt(plaintext);
    }

    async function buildHeaders() {
        const cs = await generateClientSource();
        const headers = {
            'accept': 'application/json, text/plain, */*',
            'authorize': accessToken,
            'clientsource': cs,
            'content-type': 'application/json;charset=UTF-8'
        };
        if (routeHeader) headers['route'] = routeHeader;
        return headers;
    }

    // =================== TOKEN CAPTURE ===================
    function scanAllStorage() {
        const storages = [
            { name: 'sessionStorage', store: sessionStorage },
            { name: 'localStorage', store: localStorage }
        ];

        for (const { name, store } of storages) {
            try {
                for (const key of Object.keys(store)) {
                    const val = store.getItem(key);
                    if (!val) continue;

                    // Find RSA key (contains MII which is RSA public key marker)
                    if (val.includes('MII') && !rsaKey) {
                        let foundKey = val;
                        try {
                            const parsed = JSON.parse(val);
                            if (typeof parsed === 'string' && parsed.includes('MII')) {
                                foundKey = parsed;
                            } else if (parsed && typeof parsed === 'object') {
                                // Check nested properties
                                for (const [k, v] of Object.entries(parsed)) {
                                    if (typeof v === 'string' && v.includes('MII')) {
                                        foundKey = v;
                                        break;
                                    }
                                }
                            }
                        } catch (e) {}

                        if (foundKey.includes('MII') && foundKey.length > 200) {
                            rsaKey = foundKey;
                            console.log('[VFS] ✅ RSA key found in', name, '- key:', key);
                            importRsaKey(foundKey).then(k => {
                                cryptoKey = k;
                                updateReadyState();
                                log("✅ RSA Key Captured!", "#a5d6a7");
                            }).catch(e => {
                                log("RSA Import Failed: " + e.message, "#ef5350");
                            });
                        }
                    }

                    // Find Bearer/Auth token (JWT format)
                    if (!accessToken) {
                        if (val.startsWith('eyJ') && val.length > 50) {
                            accessToken = val;
                            console.log('[VFS] ✅ JWT token found in', name, '- key:', key);
                            updateReadyState();
                        }

                        // Check inside JSON objects for token
                        try {
                            const parsed = JSON.parse(val);
                            const authKeys = ['token', 'accessToken', 'access_token', 'authToken', 'auth_token', 'bearerToken', 'bearer', 'jwt', 'authorize'];
                            for (const ak of authKeys) {
                                if (parsed[ak] && typeof parsed[ak] === 'string' && parsed[ak].length > 50) {
                                    accessToken = parsed[ak];
                                    console.log('[VFS] ✅ Token found in', name, '.', key, '.', ak);
                                    updateReadyState();
                                    break;
                                }
                            }
                        } catch (e) {}
                    }

                    // Find email
                    if (!userEmail) {
                        const emailMatch = val.match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
                        if (emailMatch && emailMatch[0].length < 100) {
                            userEmail = emailMatch[0];
                            console.log('[VFS] ✅ Email found in', name, '- key:', key);
                            document.getElementById("vfsEmail").value = userEmail;
                            updateReadyState();
                        }
                    }

                    // Find URN and booking data in storage
                    const urnKeys = ['urn', 'URN', 'applicationId', 'refNo', 'reference', 'bookingRef'];
                    const bookingKeys = ['countryCode', 'missionCode', 'centerCode', 'visaCategoryCode'];

                    // Check if key name suggests booking data
                    const keyLower = key.toLowerCase();
                    if (keyLower.includes('urn') || keyLower.includes('application') || keyLower.includes('booking') || keyLower.includes('appointment')) {
                        console.log('[VFS] 📋 Potential booking data in', name, '- key:', key, '- value:', val.substring(0, 200));
                    }

                    // Try to parse JSON and extract booking data
                    try {
                        const parsed = JSON.parse(val);
                        if (typeof parsed === 'object' && parsed !== null) {
                            // Check for URN
                            for (const uk of urnKeys) {
                                if (parsed[uk] && !payloadConfig.urn) {
                                    payloadConfig.urn = parsed[uk];
                                    document.getElementById("vfsUrn").value = parsed[uk];
                                    console.log('[VFS] ✅ URN found in', name, '-', key, ':', parsed[uk]);
                                }
                            }

                            // Check for other booking fields
                            for (const bk of bookingKeys) {
                                if (parsed[bk] && !payloadConfig[bk]) {
                                    payloadConfig[bk] = parsed[bk];
                                }
                            }

                            // Check for applicant data
                            if (parsed.applicants || parsed.applicant || parsed.firstName || parsed.passportNumber) {
                                console.log('[VFS] ✅ Applicant data found in', name, '-', key);
                            }
                        }
                    } catch (e) {}
                }
            } catch (e) {
                console.log('[VFS] Storage scan error:', e.message);
            }
        }
    }

    // Alias for backward compatibility
    function scanSessionStorage() {
        scanAllStorage();
    }

    function injectInterceptor() {
        // Intercept fetch
        const origFetch = window.fetch;
        window.fetch = async function(...args) {
            try {
                const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';

                if (url.includes('lift-api') || url.includes('vfsglobal.com/api')) {
                    const headers = args[1]?.headers || {};
                    captureHeaders(headers);
                    capturePayload(args[1]?.body);
                }
            } catch (e) {}

            const res = await origFetch.apply(this, args);

            try {
                const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';
                if (url.includes('lift-api') || url.includes('vfsglobal.com/api')) {
                    const clone = res.clone();
                    clone.text().then(body => {
                        if (body && body.includes('MII')) {
                            captureRsaFromResponse(body);
                        }
                    }).catch(() => {});
                }
            } catch (e) {}

            return res;
        };

        // Intercept XHR
        const origOpen = XMLHttpRequest.prototype.open;
        const origSetHeader = XMLHttpRequest.prototype.setRequestHeader;
        const origSend = XMLHttpRequest.prototype.send;

        XMLHttpRequest.prototype.open = function(method, url) {
            this._vfsUrl = url;
            this._vfsHeaders = {};
            return origOpen.apply(this, arguments);
        };

        XMLHttpRequest.prototype.setRequestHeader = function(name, value) {
            if (this._vfsHeaders) this._vfsHeaders[name.toLowerCase()] = value;
            return origSetHeader.apply(this, arguments);
        };

        XMLHttpRequest.prototype.send = function(body) {
            if (this._vfsUrl && (this._vfsUrl.includes('lift-api') || this._vfsUrl.includes('vfsglobal.com/api'))) {
                captureHeaders(this._vfsHeaders);
                capturePayload(body);

                this.addEventListener('load', () => {
                    try {
                        if (this.responseText && this.responseText.includes('MII')) {
                            captureRsaFromResponse(this.responseText);
                        }
                    } catch (e) {}
                });
            }
            return origSend.apply(this, arguments);
        };

        log("Request interceptor active", "#90caf9");
    }

    function captureHeaders(headers) {
        const auth = headers['authorize'] || headers['Authorize'];
        const route = headers['route'] || headers['Route'];

        if (auth && auth !== accessToken) {
            accessToken = auth;
            log("✅ Auth Token Captured!", "#a5d6a7");
        }
        if (route && route !== routeHeader) {
            routeHeader = route;
            log("✅ Route: " + route, "#a5d6a7");
        }

        updateReadyState();
        saveState();
    }

    function capturePayload(body) {
        if (!body) return;
        try {
            const json = typeof body === 'string' ? JSON.parse(body) : body;

            // DEBUG: Log ALL VFS API request payloads
            console.log('[VFS] 📦 Payload captured:', JSON.stringify(json, null, 2));

            // Extended field mapping with variations
            const fieldMappings = {
                countryCode: ['countryCode', 'country'],
                missionCode: ['missionCode', 'mission'],
                centerCode: ['centerCode', 'centreCode', 'vacCode'],
                visaCategoryCode: ['visaCategoryCode', 'visaCategory', 'categoryCode'],
                loginUser: ['loginUser', 'email'],
                urn: ['urn', 'URN', 'applicationId', 'refNo'],
                languageCode: ['languageCode', 'language']
            };

            for (const [field, variations] of Object.entries(fieldMappings)) {
                for (const v of variations) {
                    if (json[v] !== undefined && json[v] !== null && json[v] !== '') {
                        payloadConfig[field] = json[v];
                        break;
                    }
                }
            }

            // Update UI fields if found
            if (payloadConfig.urn) {
                document.getElementById("vfsUrn").value = payloadConfig.urn;
            }
            if (payloadConfig.countryCode) {
                document.getElementById("vfsCountry").value = payloadConfig.countryCode;
            }
            if (payloadConfig.missionCode) {
                document.getElementById("vfsMission").value = payloadConfig.missionCode;
            }
            if (payloadConfig.centerCode) {
                document.getElementById("vfsCenter").value = payloadConfig.centerCode;
            }
            if (payloadConfig.visaCategoryCode) {
                document.getElementById("vfsCategory").value = payloadConfig.visaCategoryCode;
            }

            localStorage.setItem('vfsPayloadConfig', JSON.stringify(payloadConfig));
        } catch (e) {}
    }

    function captureRsaFromResponse(body) {
        try {
            const json = JSON.parse(body);
            const candidate = json.data || json.rsaKey || json.publicKey || json.key;
            if (candidate && typeof candidate === 'string' && candidate.includes('MII') && !rsaKey) {
                rsaKey = candidate;
                importRsaKey(candidate).then(k => {
                    cryptoKey = k;
                    updateReadyState();
                    log("✅ RSA Key from Response!", "#a5d6a7");
                });
            }
        } catch (e) {
            if (body.includes('MII') && body.length > 200 && body.length < 2000 && !rsaKey) {
                rsaKey = body;
                importRsaKey(body).then(k => {
                    cryptoKey = k;
                    updateReadyState();
                    log("✅ RSA Key Captured!", "#a5d6a7");
                });
            }
        }
    }

    function updateReadyState() {
        const wasReady = isReady;
        isReady = !!(rsaKey && accessToken && userEmail && cryptoKey);

        // Update UI
        document.getElementById("rsaStatus").textContent = rsaKey ? '✓' : '✗';
        document.getElementById("rsaStatus").style.color = rsaKey ? '#a5d6a7' : '#ef5350';

        document.getElementById("authStatus").textContent = accessToken ? '✓' : '✗';
        document.getElementById("authStatus").style.color = accessToken ? '#a5d6a7' : '#ef5350';

        document.getElementById("emailStatus").textContent = userEmail ? '✓' : '✗';
        document.getElementById("emailStatus").style.color = userEmail ? '#a5d6a7' : '#ef5350';

        const mainStatus = document.getElementById("mainStatus");
        if (isReady) {
            mainStatus.textContent = '✅ READY - All tokens captured!';
            mainStatus.style.color = '#a5d6a7';
        } else {
            mainStatus.textContent = 'Browse VFS to capture tokens...';
            mainStatus.style.color = '#ffcc80';
        }

        if (isReady && !wasReady) {
            log("✅ Ready for API calls!", "#a5d6a7");
            playSound();
        }
    }

    function saveState() {
        localStorage.setItem('vfsTokenState', JSON.stringify({
            rsaKey, accessToken, userEmail, routeHeader
        }));
    }

    function loadState() {
        try {
            const saved = JSON.parse(localStorage.getItem('vfsTokenState'));
            if (saved) {
                rsaKey = saved.rsaKey || '';
                accessToken = saved.accessToken || '';
                userEmail = saved.userEmail || '';
                routeHeader = saved.routeHeader || '';

                if (rsaKey) {
                    importRsaKey(rsaKey).then(k => {
                        cryptoKey = k;
                        updateReadyState();
                    }).catch(() => {});
                }
            }
        } catch (e) {}
    }

    // =================== API CALLS ===================
    async function apiCall(endpoint, body) {
        if (!isReady) throw new Error('Not ready. Browse VFS pages first.');

        const headers = await buildHeaders();
        const res = await fetch(`${API_BASE}/${endpoint}`, {
            method: 'POST',
            headers,
            body: JSON.stringify(body)
        });

        const data = await res.json().catch(() => null);
        return { status: res.status, data };
    }

    function getParams() {
        const routeParts = (routeHeader || 'bgd/en/ita').split('/');
        return {
            countryCode: document.getElementById("vfsCountry").value || payloadConfig.countryCode || routeParts[0] || 'bgd',
            missionCode: document.getElementById("vfsMission").value || payloadConfig.missionCode || routeParts[2] || 'ita',
            centerCode: document.getElementById("vfsCenter").value || payloadConfig.centerCode || 'DAC',
            visaCategoryCode: document.getElementById("vfsCategory").value || payloadConfig.visaCategoryCode || '',
            loginUser: document.getElementById("vfsEmail").value || payloadConfig.loginUser || userEmail,
            urn: document.getElementById("vfsUrn").value || payloadConfig.urn || '',
            languageCode: 'en-US'
        };
    }

    // =================== CHECK SLOTS ===================
    async function checkSlots() {
        const p = getParams();
        log("Checking slots...", "#ffcc80");

        try {
            const result = await apiCall('appointment/slots', {
                countryCode: p.countryCode,
                missionCode: p.missionCode,
                loginUser: p.loginUser
            });

            const hasSlots = result.data?.data?.length > 0 ||
                            result.data?.slots?.length > 0 ||
                            result.data?.earliestDate;

            if (hasSlots) {
                log("🎉 SLOTS FOUND!", "#a5d6a7");
                playSound();
                if (document.getElementById("autoBookToggle")?.checked) {
                    delayNextStep(getCalendar);
                }
            } else {
                log("❌ No slots available", "#ef5350");
                if (autoRunning) retry(checkSlots);
            }

            return { ...result, hasSlots };
        } catch (e) {
            log("Error: " + e.message, "#ef5350");
            if (autoRunning) retry(checkSlots);
            throw e;
        }
    }

    // =================== GET CALENDAR ===================
    let availableDates = [];

    async function getCalendar() {
        const p = getParams();
        const fromDate = new Date().toLocaleDateString('en-GB');

        log("Loading calendar...", "#ffcc80");

        try {
            const result = await apiCall('appointment/calendar', {
                countryCode: p.countryCode,
                missionCode: p.missionCode,
                centerCode: p.centerCode,
                loginUser: p.loginUser,
                visaCategoryCode: p.visaCategoryCode,
                fromDate: fromDate,
                urn: p.urn,
                payCode: ''
            });

            availableDates = [];
            const data = result.data;
            if (data?.calendars) availableDates = data.calendars;
            else if (Array.isArray(data)) availableDates = data;
            else if (data?.data) availableDates = data.data;

            updateDatesDisplay();

            if (availableDates.length > 0) {
                log(`📅 ${availableDates.length} dates available!`, "#a5d6a7");

                // Auto-select first date
                const firstDate = typeof availableDates[0] === 'string' ? availableDates[0] : availableDates[0]?.date;
                if (firstDate) {
                    document.getElementById("selectedDate").value = firstDate;
                    if (document.getElementById("autoBookToggle")?.checked) {
                        delayNextStep(() => getTimeSlots(firstDate));
                    }
                }
            } else {
                log("❌ No dates available", "#ef5350");
                if (autoRunning) retry(getCalendar);
            }

            return result;
        } catch (e) {
            log("Error: " + e.message, "#ef5350");
            if (autoRunning) retry(getCalendar);
            throw e;
        }
    }

    function updateDatesDisplay() {
        if (availableDates.length > 0) {
            datesDisplay.innerHTML = availableDates.map(d => {
                const dateStr = typeof d === 'string' ? d : d.date || d;
                return `<span class="vfs-date-chip" data-date="${dateStr}">${dateStr}</span>`;
            }).join('');
        } else {
            datesDisplay.textContent = '-';
        }
    }

    // =================== GET TIME SLOTS ===================
    let availableSlots = [];

    async function getTimeSlots(date) {
        const p = getParams();
        const slotDate = date || document.getElementById("selectedDate").value;

        if (!slotDate) {
            log("Enter a date first", "#ef5350");
            return;
        }

        log("Loading time slots...", "#ffcc80");

        try {
            const result = await apiCall('appointment/timeslot', {
                countryCode: p.countryCode,
                missionCode: p.missionCode,
                centerCode: p.centerCode,
                loginUser: p.loginUser,
                visaCategoryCode: p.visaCategoryCode,
                slotDate: slotDate,
                urn: p.urn
            });

            availableSlots = [];
            const data = result.data;
            if (data?.slots) availableSlots = data.slots;
            else if (Array.isArray(data)) availableSlots = data;
            else if (data?.data) availableSlots = data.data;

            updateTimesDisplay();

            if (availableSlots.length > 0) {
                log(`🕐 ${availableSlots.length} time slots!`, "#a5d6a7");

                // Auto-select first slot
                const firstSlot = typeof availableSlots[0] === 'string' ? availableSlots[0] : availableSlots[0]?.slot || availableSlots[0]?.time;
                if (firstSlot) {
                    document.getElementById("selectedTime").value = firstSlot;
                    if (document.getElementById("autoBookToggle")?.checked) {
                        delayNextStep(sendOtp);
                    }
                }
            } else {
                log("❌ No time slots", "#ef5350");
                if (autoRunning) retry(getCalendar);
            }

            return result;
        } catch (e) {
            log("Error: " + e.message, "#ef5350");
            throw e;
        }
    }

    function updateTimesDisplay() {
        if (availableSlots.length > 0) {
            timesDisplay.innerHTML = availableSlots.map(s => {
                const timeStr = typeof s === 'string' ? s : s.slot || s.time || s;
                return `<span class="vfs-time-chip" data-time="${timeStr}">${timeStr}</span>`;
            }).join('');
        } else {
            timesDisplay.textContent = '-';
        }
    }

    // =================== SEND OTP ===================
    async function sendOtp() {
        const p = getParams();
        if (!p.urn) {
            log("Enter URN first", "#ef5350");
            return;
        }

        log("Sending OTP...", "#ffcc80");

        try {
            const result = await apiCall('appointment/applicantotp', {
                urn: p.urn,
                loginUser: p.loginUser,
                missionCode: p.missionCode,
                countryCode: p.countryCode,
                centerCode: p.centerCode,
                captcha_version: '',
                captcha_api_key: '',
                OTP: '',
                otpAction: 'GENERATE',
                languageCode: p.languageCode,
                userAction: null
            });

            if (result.data?.error) {
                log("OTP failed: " + result.data.error, "#ef5350");
            } else {
                log("✅ OTP Sent! Check email", "#a5d6a7");
                playSound();
                document.getElementById("otpInput").focus();
                startOtpCountdown(60);

                // Auto-start OTP polling if API URL is configured
                const apiUrl = document.getElementById("otpApiUrl")?.value.trim();
                if (apiUrl) {
                    lastOtp = null; // Reset last OTP
                    setTimeout(checkOTP, 1000);
                }
            }

            return result;
        } catch (e) {
            log("Error: " + e.message, "#ef5350");
            throw e;
        }
    }

    // =================== VERIFY OTP ===================
    async function verifyOtp() {
        const p = getParams();
        const otp = document.getElementById("otpInput").value.trim();

        if (!p.urn) {
            log("Enter URN first", "#ef5350");
            return;
        }
        if (!otp) {
            log("Enter OTP first", "#ef5350");
            return;
        }

        log("Verifying OTP...", "#ffcc80");

        try {
            const result = await apiCall('appointment/applicantotp', {
                urn: p.urn,
                loginUser: p.loginUser,
                missionCode: p.missionCode,
                countryCode: p.countryCode,
                centerCode: p.centerCode,
                captcha_version: '',
                captcha_api_key: '',
                OTP: otp,
                otpAction: 'VALIDATE',
                languageCode: p.languageCode,
                userAction: null
            });

            if (result.data?.error || result.data?.message?.toLowerCase().includes('invalid')) {
                log("❌ OTP Invalid", "#ef5350");
                // Keep polling for new OTP if auto mode
                if (otpPolling) {
                    lastOtp = null;
                    otpPollTimer = setTimeout(checkOTP, 1000);
                }
            } else {
                log("✅ OTP Verified!", "#a5d6a7");
                playSound();
                stopOtpPolling(); // Stop polling on success
                if (document.getElementById("autoBookToggle")?.checked) {
                    delayNextStep(bookAppointment);
                }
            }

            return result;
        } catch (e) {
            log("Error: " + e.message, "#ef5350");
            throw e;
        }
    }

    // =================== BOOK APPOINTMENT ===================
    async function bookAppointment() {
        const p = getParams();
        const date = document.getElementById("selectedDate").value;
        const time = document.getElementById("selectedTime").value;

        if (!p.urn) {
            log("Enter URN first", "#ef5350");
            return;
        }
        if (!date || !time) {
            log("Select date and time first", "#ef5350");
            return;
        }

        log(`Booking: ${date} at ${time}...`, "#ffcc80");

        try {
            const result = await apiCall('appointment/schedule', {
                countryCode: p.countryCode,
                missionCode: p.missionCode,
                centerCode: p.centerCode,
                loginUser: p.loginUser,
                visaCategoryCode: p.visaCategoryCode,
                urn: p.urn,
                slotDate: date,
                slotTime: time,
                languageCode: p.languageCode,
                applicants: []
            });

            const bookingId = result.data?.bookingId || result.data?.confirmationNumber || result.data?.appointmentId;
            const resultDiv = document.getElementById("bookingResult");
            resultDiv.style.display = 'block';

            if (result.data?.error || result.data?.message?.toLowerCase().includes('fail')) {
                log("❌ Booking FAILED: " + (result.data.error || result.data.message), "#ef5350");
                resultDiv.style.background = 'rgba(244,67,54,0.3)';
                resultDiv.innerHTML = `<strong>❌ FAILED</strong><br>${result.data?.error || result.data?.message || 'Unknown error'}`;
                if (autoRunning) retry(checkSlots);
            } else {
                log("🎉 BOOKING SUCCESS! Click PAY NOW", "#a5d6a7");
                resultDiv.style.background = 'rgba(76,175,80,0.3)';
                resultDiv.innerHTML = `<strong>✅ SUCCESS!</strong><br>Booking ID: ${bookingId || 'See response'}<br>Date: ${date}<br>Time: ${time}<br><br>👆 Click PAY NOW to proceed`;
                playSound();
                playSound();
                stopOtpPolling();

                // Auto-initiate payment if auto-book is enabled
                if (document.getElementById("autoBookToggle")?.checked) {
                    log("💳 Auto-initiating payment...", "#ffcc80");
                    setTimeout(() => {
                        initiatePayment().catch(() => {});
                    }, 1000);
                }
            }

            return result;
        } catch (e) {
            log("Error: " + e.message, "#ef5350");
            throw e;
        }
    }

    // =================== AUTO MODE ===================
    let autoRunning = false;
    let retryTimer = null;
    let countdownTimer = null;
    let countdown = 0;

    function retry(fn) {
        if (!autoRunning) return;
        const interval = parseInt(document.getElementById("watchInterval").value) || 30;
        retryTimer = setTimeout(fn, interval * 1000);
    }

    function delayNextStep(fn) {
        if (!autoRunning && !document.getElementById("autoBookToggle")?.checked) return;
        setTimeout(fn, 500);
    }

    function startAuto() {
        if (autoRunning) {
            log("⚠ Already running...", "#ffcc80");
            return;
        }
        if (!isReady) {
            log("Not ready. Capture tokens first.", "#ef5350");
            return;
        }

        autoRunning = true;
        log("▶ Auto started", "#a5d6a7");

        const interval = parseInt(document.getElementById("watchInterval").value) || 30;
        countdown = interval;
        updateCountdown();

        countdownTimer = setInterval(() => {
            countdown--;
            updateCountdown();

            if (countdown <= 0) {
                countdown = interval;
                checkSlots();
            }
        }, 1000);

        checkSlots();
    }

    function stopAuto() {
        autoRunning = false;
        if (retryTimer) clearTimeout(retryTimer);
        if (countdownTimer) clearInterval(countdownTimer);
        countdown = 0;
        document.getElementById("countdownDisplay").textContent = '--';
        stopOtpPolling(); // Also stop OTP polling
        log("⏹ Auto stopped", "#ef5350");
    }

    function updateCountdown() {
        document.getElementById("countdownDisplay").textContent = countdown > 0 ? countdown : '--';
    }

    // =================== PAYMENT ===================
    async function initiatePayment() {
        const p = getParams();

        if (!p.urn) {
            log("Enter URN first", "#ef5350");
            return;
        }

        log("💳 Initiating Payment...", "#ffcc80");

        try {
            // Try multiple payment endpoints
            const paymentEndpoints = [
                'appointment/payment',
                'appointment/payment/initiate',
                'payment/initiate',
                'appointment/fees/payment'
            ];

            let paymentResult = null;
            let paymentUrl = null;

            // First try to get fees/payment info
            for (const endpoint of paymentEndpoints) {
                try {
                    const result = await apiCall(endpoint, {
                        countryCode: p.countryCode,
                        missionCode: p.missionCode,
                        centerCode: p.centerCode,
                        loginUser: p.loginUser,
                        visaCategoryCode: p.visaCategoryCode,
                        urn: p.urn,
                        languageCode: p.languageCode
                    });

                    if (result.data) {
                        paymentResult = result;
                        // Check for payment URL in various formats
                        paymentUrl = result.data?.GatewayPageURL ||
                                    result.data?.gatewayPageURL ||
                                    result.data?.paymentUrl ||
                                    result.data?.paymentURL ||
                                    result.data?.redirectUrl ||
                                    result.data?.redirectURL ||
                                    result.data?.url ||
                                    result.data?.data?.GatewayPageURL ||
                                    result.data?.data?.paymentUrl;

                        if (paymentUrl) break;
                    }
                } catch (e) {
                    console.log(`Endpoint ${endpoint} failed:`, e.message);
                }
            }

            if (paymentUrl) {
                log("✅ Payment Gateway Ready!", "#a5d6a7");
                playSound();

                // Show payment link in input
                const linkInput = document.getElementById("paymentLinkInput");
                if (linkInput) linkInput.value = paymentUrl;

                // Open payment gateway
                const opened = window.open(paymentUrl, "_blank");
                if (!opened) {
                    // Popup blocked, try redirect
                    if (confirm("Popup blocked! Click OK to redirect to payment page.")) {
                        window.location.href = paymentUrl;
                    }
                }

                console.log("Payment URL:", paymentUrl);
                console.log("Payment Response:", paymentResult?.data);

            } else if (paymentResult) {
                // No URL but got response - might need different handling
                log("Payment info received - check console", "#ffcc80");
                console.log("Payment Response:", paymentResult.data);

                // Check if there's a message
                if (paymentResult.data?.message) {
                    log("Payment: " + paymentResult.data.message, "#ffcc80");
                }

                // Check for booking/appointment ID that might be needed
                const bookingId = paymentResult.data?.bookingId ||
                                 paymentResult.data?.appointmentId ||
                                 paymentResult.data?.confirmationNumber;
                if (bookingId) {
                    log("Booking ID: " + bookingId, "#a5d6a7");
                }

            } else {
                log("❌ Payment initiation failed", "#ef5350");
                if (autoRunning) retry(initiatePayment);
            }

            return paymentResult;

        } catch (e) {
            log("Payment Error: " + e.message, "#ef5350");
            console.error("Payment Error:", e);
            if (autoRunning) retry(initiatePayment);
            throw e;
        }
    }

    // Try to get payment link from page if available
    function findPaymentLinkOnPage() {
        // Look for payment links on the page
        const paymentSelectors = [
            'a[href*="payment"]',
            'a[href*="pay"]',
            'button[onclick*="payment"]',
            '[data-payment-url]',
            '.payment-link',
            '.pay-now-btn'
        ];

        for (const selector of paymentSelectors) {
            const el = document.querySelector(selector);
            if (el) {
                const url = el.href || el.dataset.paymentUrl || el.getAttribute('onclick');
                if (url && url.includes('http')) {
                    return url;
                }
            }
        }
        return null;
    }

    // =================== AUTO OTP FETCH ===================
    let lastOtp = null;
    let otpPolling = false;
    let otpPollTimer = null;

    async function checkOTP() {
        const email = document.getElementById("vfsEmail")?.value.trim() || userEmail;
        const apiUrl = document.getElementById("otpApiUrl")?.value.trim();

        if (!email) {
            log("Enter email first", "#ef5350");
            return;
        }

        if (!apiUrl) {
            log("Enter OTP API URL first", "#ef5350");
            return;
        }

        otpPolling = true;
        log("🔄 Polling for OTP...", "#ffcc80");

        try {
            const response = await fetch(apiUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    email: email,
                    phone: email  // Some APIs use phone field
                })
            });

            const data = await response.json();

            // OTP Success - check various response formats
            const otp = data?.otp || data?.code || data?.data?.otp || data?.data?.code;

            if (data?.status && otp) {
                if (otp !== lastOtp) {
                    lastOtp = otp;
                    const otpField = document.getElementById("otpInput");
                    if (otpField) otpField.value = otp;
                    log("✅ OTP Received: " + otp, "#a5d6a7");
                    playSound();

                    // Auto verify
                    setTimeout(() => {
                        if (otpPolling) verifyOtp();
                    }, 500);
                } else {
                    // OTP already used, keep polling
                    if (otpPolling) {
                        otpPollTimer = setTimeout(checkOTP, 1000);
                    }
                }
            } else if (data?.message) {
                log("OTP: " + data.message, "#ffcc80");
                if (otpPolling) {
                    otpPollTimer = setTimeout(checkOTP, 1000);
                }
            } else {
                // OTP not ready, keep polling
                log("Waiting for OTP...", "#ffcc80");
                if (otpPolling) {
                    otpPollTimer = setTimeout(checkOTP, 1000);
                }
            }

        } catch (err) {
            console.error("OTP Fetch Error:", err);
            log("OTP API Error, retrying...", "#ef5350");
            if (otpPolling) {
                otpPollTimer = setTimeout(checkOTP, 2000);
            }
        }
    }

    function stopOtpPolling() {
        otpPolling = false;
        if (otpPollTimer) {
            clearTimeout(otpPollTimer);
            otpPollTimer = null;
        }
        log("OTP polling stopped", "#ffcc80");
    }

    // =================== OTP COUNTDOWN ===================
    let otpCountdownTimer = null;

    function startOtpCountdown(seconds) {
        const timerBtn = document.getElementById("otpTimerBtn");
        let time = seconds;

        if (otpCountdownTimer) clearInterval(otpCountdownTimer);

        otpCountdownTimer = setInterval(() => {
            timerBtn.innerText = time < 10 ? "0" + time : time;

            if (time <= 10) {
                timerBtn.style.background = "#f44336";
            }

            if (time <= 0) {
                clearInterval(otpCountdownTimer);
                timerBtn.innerText = "Timer";
                timerBtn.style.background = "#2196f3";
            }

            time--;
        }, 1000);
    }

    // =================== TIMER DIALOG ===================
    function showTimerDialog() {
        let oldBox = document.getElementById("vfsTimerBox");
        if (oldBox) oldBox.remove();

        const box = document.createElement("div");
        box.id = "vfsTimerBox";
        box.style = `
            position:fixed;
            top:50%;
            left:50%;
            transform:translate(-50%, -50%);
            background:#1e1e2f;
            padding:20px;
            border-radius:12px;
            color:white;
            z-index:100000;
            text-align:center;
            font-family:Arial;
            box-shadow:0 0 30px rgba(0,0,0,0.7);
        `;

        const hours = Array.from({length:24}, (_,i)=>`<option value="${i}">${String(i).padStart(2,"0")}</option>`).join("");
        const minsSecs = Array.from({length:60}, (_,i)=>`<option value="${i}">${String(i).padStart(2,"0")}</option>`).join("");

        box.innerHTML = `
            <h3 style="margin:0 0 15px 0;">⏰ Schedule OTP Send</h3>
            <div style="display:flex;justify-content:center;gap:5px;margin-bottom:15px;">
                <select id="timerHour" style="color:black;background:#fff;padding:4px 8px;border-radius:4px;">${hours}</select> :
                <select id="timerMinute" style="color:black;background:#fff;padding:4px 8px;border-radius:4px;">${minsSecs}</select> :
                <select id="timerSecond" style="color:black;background:#fff;padding:4px 8px;border-radius:4px;">${minsSecs}</select>
            </div>
            <div>
                <button id="setTimerBtn" style="padding:8px 16px;border:none;border-radius:6px;background:#4caf50;color:white;cursor:pointer;margin-right:8px;">Set Timer</button>
                <button id="closeTimerBtn" style="padding:8px 16px;border:none;border-radius:6px;background:#f44336;color:white;cursor:pointer;">Close</button>
            </div>
        `;

        document.body.appendChild(box);

        // Default 09:00:00
        document.getElementById("timerHour").value = 9;
        document.getElementById("timerMinute").value = 0;
        document.getElementById("timerSecond").value = 0;

        document.getElementById("closeTimerBtn").addEventListener("click", () => box.remove());

        document.getElementById("setTimerBtn").addEventListener("click", () => {
            const h = parseInt(document.getElementById("timerHour").value);
            const m = parseInt(document.getElementById("timerMinute").value);
            const s = parseInt(document.getElementById("timerSecond").value);

            const timerBtn = document.getElementById("otpTimerBtn");
            timerBtn.innerText = `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`;

            scheduleOtpAt(h, m, s);
            log(`OTP scheduled at ${timerBtn.innerText}`, "#90caf9");
            box.remove();
        });
    }

    function scheduleOtpAt(hour, minute, second = 0) {
        const now = new Date();
        const target = new Date();
        target.setHours(hour, minute, second, 0);

        let delay = target - now;
        if (delay < 0) delay += 24 * 60 * 60 * 1000;

        console.log(`OTP scheduled at ${String(hour).padStart(2,"0")}:${String(minute).padStart(2,"0")}:${String(second).padStart(2,"0")}, in ${Math.floor(delay/1000)} seconds`);

        setTimeout(async function() {
            try {
                await sendOtp();
            } catch (err) {
                console.error("Scheduled OTP Error:", err);
            }
        }, delay);
    }

    // =================== AUTO OTP DETECT ===================
    const otpInput = document.getElementById("otpInput");
    let otpAutoTimer;

    otpInput.addEventListener("input", () => {
        clearTimeout(otpAutoTimer);
        const otp = otpInput.value.trim();

        if (otp.length === 6) {
            otpAutoTimer = setTimeout(() => {
                verifyOtp();
            }, 300);
        }
    });

    // =================== CLICK HANDLERS FOR CHIPS ===================
    datesDisplay.addEventListener("click", (e) => {
        if (e.target.classList.contains("vfs-date-chip")) {
            const date = e.target.dataset.date;
            document.getElementById("selectedDate").value = date;
            getTimeSlots(date);
        }
    });

    timesDisplay.addEventListener("click", (e) => {
        if (e.target.classList.contains("vfs-time-chip")) {
            const time = e.target.dataset.time;
            document.getElementById("selectedTime").value = time;
        }
    });

    // =================== EVENT LISTENERS ===================
    document.getElementById("saveConfigBtn").addEventListener("click", () => {
        payloadConfig.countryCode = document.getElementById("vfsCountry").value;
        payloadConfig.missionCode = document.getElementById("vfsMission").value;
        payloadConfig.centerCode = document.getElementById("vfsCenter").value;
        payloadConfig.visaCategoryCode = document.getElementById("vfsCategory").value;
        payloadConfig.urn = document.getElementById("vfsUrn").value;
        payloadConfig.loginUser = document.getElementById("vfsEmail").value;
        payloadConfig.otpApiUrl = document.getElementById("otpApiUrl").value;

        if (payloadConfig.loginUser) userEmail = payloadConfig.loginUser;

        localStorage.setItem('vfsPayloadConfig', JSON.stringify(payloadConfig));
        saveState();
        log("💾 Config saved!", "#a5d6a7");
        updateReadyState();
    });

    document.getElementById("checkSlotsBtn").addEventListener("click", () => checkSlots().catch(() => {}));
    document.getElementById("getCalendarBtn").addEventListener("click", () => getCalendar().catch(() => {}));
    document.getElementById("getTimesBtn").addEventListener("click", () => getTimeSlots().catch(() => {}));
    document.getElementById("getFeesBtn").addEventListener("click", async () => {
        const p = getParams();
        try {
            log("Loading fees...", "#ffcc80");
            const result = await apiCall('appointment/fees', {
                missionCode: p.missionCode,
                countryCode: p.countryCode,
                centerCode: p.centerCode,
                loginUser: p.loginUser,
                urn: p.urn,
                languageCode: p.languageCode
            });
            log("Fees loaded - check console", "#a5d6a7");
            console.log("Fees:", result.data);
        } catch (e) {
            log("Error: " + e.message, "#ef5350");
        }
    });

    document.getElementById("sendOtpBtn").addEventListener("click", () => sendOtp().catch(() => {}));
    document.getElementById("verifyOtpBtn").addEventListener("click", () => verifyOtp().catch(() => {}));
    document.getElementById("otpTimerBtn").addEventListener("click", showTimerDialog);
    document.getElementById("getOtpBtn").addEventListener("click", checkOTP);
    document.getElementById("stopOtpBtn").addEventListener("click", stopOtpPolling);

    document.getElementById("bookNowBtn").addEventListener("click", () => {
        const date = document.getElementById("selectedDate").value;
        const time = document.getElementById("selectedTime").value;

        if (!date || !time) {
            log("Select date and time first", "#ef5350");
            return;
        }

        if (confirm(`Book appointment?\n\nDate: ${date}\nTime: ${time}`)) {
            bookAppointment().catch(() => {});
        }
    });

    document.getElementById("payNowBtn").addEventListener("click", () => {
        initiatePayment().catch(() => {});
    });

    // Copy payment link on click
    document.getElementById("paymentLinkInput").addEventListener("click", function() {
        if (this.value) {
            this.select();
            document.execCommand('copy');
            log("📋 Payment link copied!", "#a5d6a7");
        }
    });

    document.getElementById("startAutoBtn").addEventListener("click", startAuto);
    document.getElementById("stopAutoBtn").addEventListener("click", stopAuto);

    document.getElementById("resetBtn").addEventListener("click", () => {
        if (!confirm("Reset all captured tokens?")) return;
        rsaKey = '';
        cryptoKey = null;
        accessToken = '';
        userEmail = '';
        routeHeader = '';
        isReady = false;
        localStorage.removeItem('vfsTokenState');
        updateReadyState();
        log("🔄 Tokens reset", "#ffcc80");
    });

    // =================== LOAD CONFIG TO UI ===================
    function loadConfigToUI() {
        if (payloadConfig.countryCode) document.getElementById("vfsCountry").value = payloadConfig.countryCode;
        if (payloadConfig.missionCode) document.getElementById("vfsMission").value = payloadConfig.missionCode;
        if (payloadConfig.centerCode) document.getElementById("vfsCenter").value = payloadConfig.centerCode;
        if (payloadConfig.visaCategoryCode) document.getElementById("vfsCategory").value = payloadConfig.visaCategoryCode;
        if (payloadConfig.urn) document.getElementById("vfsUrn").value = payloadConfig.urn;
        if (payloadConfig.loginUser || userEmail) {
            document.getElementById("vfsEmail").value = payloadConfig.loginUser || userEmail;
        }
        // Load OTP API URL
        if (payloadConfig.otpApiUrl) {
            document.getElementById("otpApiUrl").value = payloadConfig.otpApiUrl;
        }
    }

    // =================== URL EXTRACTION ===================
    function extractFromUrl() {
        const pathname = window.location.pathname;

        // Extract route from path like /bgd/en/ita/...
        const routeMatch = pathname.match(/^\/([a-z]{2,3})\/([a-z]{2})\/([a-z]{2,3})/i);
        if (routeMatch) {
            routeHeader = `${routeMatch[1]}/${routeMatch[2]}/${routeMatch[3]}`;
            console.log('[VFS] ✅ Route extracted from URL:', routeHeader);

            // Also set country and mission from route
            if (!payloadConfig.countryCode) {
                payloadConfig.countryCode = routeMatch[1];
                document.getElementById("vfsCountry").value = routeMatch[1];
            }
            if (!payloadConfig.missionCode) {
                payloadConfig.missionCode = routeMatch[3];
                document.getElementById("vfsMission").value = routeMatch[3];
            }
        }

        // Extract URN from URL parameters
        const urlParams = new URLSearchParams(window.location.search);
        const urnFromUrl = urlParams.get('urn') || urlParams.get('URN') || urlParams.get('applicationId') || urlParams.get('refNo');
        if (urnFromUrl && !payloadConfig.urn) {
            payloadConfig.urn = urnFromUrl;
            document.getElementById("vfsUrn").value = urnFromUrl;
            console.log('[VFS] ✅ URN extracted from URL:', urnFromUrl);
        }

        // Also check hash fragment
        if (window.location.hash) {
            const hashParams = new URLSearchParams(window.location.hash.substring(1));
            const urnFromHash = hashParams.get('urn') || hashParams.get('URN');
            if (urnFromHash && !payloadConfig.urn) {
                payloadConfig.urn = urnFromHash;
                document.getElementById("vfsUrn").value = urnFromHash;
                console.log('[VFS] ✅ URN extracted from hash:', urnFromHash);
            }
        }
    }

    // =================== INITIALIZATION ===================
    loadState();
    loadConfigToUI();
    injectInterceptor();
    extractFromUrl();
    scanSessionStorage();

    // Periodic scans
    setInterval(scanSessionStorage, 3000);
    setInterval(updateReadyState, 2000);

    // Re-extract from URL when navigation changes (SPA)
    let lastUrl = window.location.href;
    setInterval(() => {
        if (window.location.href !== lastUrl) {
            lastUrl = window.location.href;
            console.log('[VFS] 🔄 URL changed, re-scanning...');
            extractFromUrl();
            scanSessionStorage();
        }
    }, 1000);

    log("VFS Slot Booker v3.3 Ready", "#4fc3f7");

    // Highlight slots on page
    setTimeout(() => {
        document.querySelectorAll('.calendar-day.available, .date-available, [class*="available"]:not([class*="unavailable"])').forEach(el => {
            el.style.boxShadow = '0 0 10px 3px #4caf50';
            el.style.border = '2px solid #4caf50';
        });
    }, 2000);

})();
