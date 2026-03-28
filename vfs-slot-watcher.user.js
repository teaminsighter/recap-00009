// ==UserScript==
// @name         VFS Slot Watcher + Auto-Fill
// @namespace    http://tampermonkey.net/
// @version      2.0
// @description  Monitor VFS appointment page for available slots with alerts and auto-fill
// @match        *://*.vfsglobal.com/*
// @match        *://visa.vfsglobal.com/*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    // =================== CONFIGURATION ===================
    let config = {
        refreshInterval: 30,
        soundEnabled: true,
        autoRefresh: false,
        alertOnSlots: true,
        autoFillOnDetect: true
    };

    // =================== STATE ===================
    let refreshTimer = null;
    let countdownTimer = null;
    let countdown = 0;
    let lastCheck = null;

    // =================== SAVED FORM DATA ===================
    let savedFormData = {
        firstName: '',
        lastName: '',
        email: '',
        phone: '',
        passport: '',
        dob: '',
        nationality: '',
        urn: '',
        address: '',
        city: '',
        postalCode: '',
        country: ''
    };

    // =================== UI PANEL ===================
    const panel = document.createElement("div");
    panel.id = "vfsWatcherPanel";
    panel.style = `
        position: fixed;
        top: 20px;
        right: 20px;
        width: 360px;
        max-height: 90vh;
        overflow-y: auto;
        padding: 15px;
        border-radius: 12px;
        background: linear-gradient(135deg, #1a237e, #283593);
        color: white;
        box-shadow: 0 8px 32px rgba(0,0,0,0.3);
        z-index: 99999;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
        user-select: none;
        cursor: grab;
    `;

    panel.innerHTML = `
        <span id="vfsClosePanel"
            style="position:absolute;right:12px;top:10px;cursor:pointer;font-size:18px;font-weight:bold;color:#ff5252;opacity:0.8;transition:opacity 0.2s;"
            onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='0.8'">
            ✕
        </span>

        <h3 style="margin:0 0 12px 0;text-align:center;color:#fff;font-size:18px;font-weight:600;">
            🔍 VFS Slot Watcher
        </h3>

        <!-- Status Box -->
        <div id="vfsStatusBox" style="
            background: rgba(255,255,255,0.1);
            border-radius: 8px;
            padding: 12px;
            margin-bottom: 12px;
            text-align: center;
        ">
            <div id="vfsStatus" style="font-size: 14px; font-weight: 500;">Ready to watch</div>
            <div id="vfsLastCheck" style="font-size: 11px; opacity: 0.7; margin-top: 4px;"></div>
        </div>

        <!-- Slots Alert -->
        <div id="vfsSlotsAlert" style="
            display: none;
            background: #4caf50;
            border-radius: 8px;
            padding: 12px;
            margin-bottom: 12px;
            text-align: center;
            animation: vfsPulse 1s infinite;
        ">
            <div style="font-size: 16px; font-weight: 600;">🎉 SLOTS AVAILABLE!</div>
            <div style="font-size: 12px; margin-top: 4px;">Form auto-filled! Click Book to confirm.</div>
        </div>

        <!-- Watch Controls -->
        <div style="display:flex; gap:8px; margin-bottom:12px;">
            <div style="flex:1;">
                <label style="font-size:10px;opacity:0.8;display:block;margin-bottom:4px;">Refresh (sec)</label>
                <input id="vfsInterval" type="number" value="30" min="10" max="300"
                    style="width:100%;padding:8px;border-radius:6px;border:none;font-size:13px;background:#fff;color:#333;">
            </div>
            <div style="flex:1;">
                <label style="font-size:10px;opacity:0.8;display:block;margin-bottom:4px;">Countdown</label>
                <div id="vfsCountdown" style="
                    padding:8px;
                    border-radius:6px;
                    background:rgba(255,255,255,0.15);
                    font-size:13px;
                    text-align:center;
                    font-weight:600;
                ">--</div>
            </div>
        </div>

        <div style="display:flex; gap:8px; margin-bottom:12px;">
            <button id="vfsStartBtn"
                style="flex:1;padding:10px;background:#4caf50;color:white;border:none;border-radius:6px;cursor:pointer;font-size:13px;font-weight:500;">
                ▶ Start
            </button>
            <button id="vfsStopBtn"
                style="flex:1;padding:10px;background:#f44336;color:white;border:none;border-radius:6px;cursor:pointer;font-size:13px;font-weight:500;">
                ⏹ Stop
            </button>
            <button id="vfsCheckNowBtn"
                style="flex:1;padding:10px;background:#2196f3;color:white;border:none;border-radius:6px;cursor:pointer;font-size:13px;font-weight:500;">
                🔄 Check
            </button>
        </div>

        <!-- Options -->
        <div style="display:flex; gap:8px; margin-bottom:12px; flex-wrap:wrap;">
            <label style="flex:1;display:flex;align-items:center;gap:6px;font-size:11px;cursor:pointer;min-width:100px;">
                <input type="checkbox" id="vfsSoundToggle" checked style="cursor:pointer;">
                🔊 Sound
            </label>
            <label style="flex:1;display:flex;align-items:center;gap:6px;font-size:11px;cursor:pointer;min-width:100px;">
                <input type="checkbox" id="vfsAutoRefresh" style="cursor:pointer;">
                🔄 Auto-Refresh
            </label>
            <label style="flex:1;display:flex;align-items:center;gap:6px;font-size:11px;cursor:pointer;min-width:100px;">
                <input type="checkbox" id="vfsAutoFillToggle" checked style="cursor:pointer;">
                ✏️ Auto-Fill
            </label>
        </div>

        <!-- Tabs -->
        <div style="display:flex; gap:4px; margin-bottom:8px;">
            <button id="vfsTabWatch" class="vfs-tab active"
                style="flex:1;padding:8px;background:#3949ab;color:white;border:none;border-radius:6px 6px 0 0;cursor:pointer;font-size:11px;font-weight:500;">
                👁️ Watch
            </button>
            <button id="vfsTabForm" class="vfs-tab"
                style="flex:1;padding:8px;background:rgba(255,255,255,0.1);color:white;border:none;border-radius:6px 6px 0 0;cursor:pointer;font-size:11px;font-weight:500;">
                📝 Form Data
            </button>
        </div>

        <!-- Watch Tab Content -->
        <div id="vfsWatchContent" style="display:block;">
            <div style="
                background: rgba(255,255,255,0.1);
                border-radius: 0 0 8px 8px;
                padding: 10px;
                margin-bottom: 12px;
            ">
                <div style="font-size:10px;opacity:0.7;margin-bottom:6px;">DETECTION KEYWORDS:</div>
                <input id="vfsKeywords" type="text"
                    placeholder="available, book now, select"
                    value="available,book now,select date,appointment available"
                    style="width:100%;padding:8px;border-radius:6px;border:none;font-size:11px;background:#fff;color:#333;">
            </div>

            <div id="vfsLog" style="
                background: rgba(0,0,0,0.2);
                border-radius: 8px;
                padding: 10px;
                max-height: 100px;
                overflow-y: auto;
                font-size: 11px;
                font-family: monospace;
                line-height: 1.6;
            "></div>
        </div>

        <!-- Form Data Tab Content -->
        <div id="vfsFormContent" style="display:none;">
            <div style="
                background: rgba(255,255,255,0.1);
                border-radius: 0 0 8px 8px;
                padding: 12px;
            ">
                <div style="display:grid; grid-template-columns: 1fr 1fr; gap:8px;">
                    <div>
                        <label style="font-size:9px;opacity:0.7;display:block;margin-bottom:2px;">First Name</label>
                        <input id="vfsFirstName" type="text" placeholder="John"
                            style="width:100%;padding:6px;border-radius:4px;border:none;font-size:11px;">
                    </div>
                    <div>
                        <label style="font-size:9px;opacity:0.7;display:block;margin-bottom:2px;">Last Name</label>
                        <input id="vfsLastName" type="text" placeholder="Doe"
                            style="width:100%;padding:6px;border-radius:4px;border:none;font-size:11px;">
                    </div>
                    <div style="grid-column: 1 / -1;">
                        <label style="font-size:9px;opacity:0.7;display:block;margin-bottom:2px;">Email</label>
                        <input id="vfsEmail" type="email" placeholder="john@email.com"
                            style="width:100%;padding:6px;border-radius:4px;border:none;font-size:11px;">
                    </div>
                    <div>
                        <label style="font-size:9px;opacity:0.7;display:block;margin-bottom:2px;">Phone</label>
                        <input id="vfsPhone" type="tel" placeholder="+880..."
                            style="width:100%;padding:6px;border-radius:4px;border:none;font-size:11px;">
                    </div>
                    <div>
                        <label style="font-size:9px;opacity:0.7;display:block;margin-bottom:2px;">Passport No.</label>
                        <input id="vfsPassport" type="text" placeholder="AB1234567"
                            style="width:100%;padding:6px;border-radius:4px;border:none;font-size:11px;">
                    </div>
                    <div>
                        <label style="font-size:9px;opacity:0.7;display:block;margin-bottom:2px;">Date of Birth</label>
                        <input id="vfsDob" type="text" placeholder="DD/MM/YYYY"
                            style="width:100%;padding:6px;border-radius:4px;border:none;font-size:11px;">
                    </div>
                    <div>
                        <label style="font-size:9px;opacity:0.7;display:block;margin-bottom:2px;">Nationality</label>
                        <input id="vfsNationality" type="text" placeholder="Bangladeshi"
                            style="width:100%;padding:6px;border-radius:4px;border:none;font-size:11px;">
                    </div>
                    <div style="grid-column: 1 / -1;">
                        <label style="font-size:9px;opacity:0.7;display:block;margin-bottom:2px;">URN / Reference</label>
                        <input id="vfsUrn" type="text" placeholder="XYZ71516959244"
                            style="width:100%;padding:6px;border-radius:4px;border:none;font-size:11px;">
                    </div>
                    <div style="grid-column: 1 / -1;">
                        <label style="font-size:9px;opacity:0.7;display:block;margin-bottom:2px;">Address</label>
                        <input id="vfsAddress" type="text" placeholder="123 Main Street"
                            style="width:100%;padding:6px;border-radius:4px;border:none;font-size:11px;">
                    </div>
                    <div>
                        <label style="font-size:9px;opacity:0.7;display:block;margin-bottom:2px;">City</label>
                        <input id="vfsCity" type="text" placeholder="Dhaka"
                            style="width:100%;padding:6px;border-radius:4px;border:none;font-size:11px;">
                    </div>
                    <div>
                        <label style="font-size:9px;opacity:0.7;display:block;margin-bottom:2px;">Postal Code</label>
                        <input id="vfsPostalCode" type="text" placeholder="1205"
                            style="width:100%;padding:6px;border-radius:4px;border:none;font-size:11px;">
                    </div>
                    <div style="grid-column: 1 / -1;">
                        <label style="font-size:9px;opacity:0.7;display:block;margin-bottom:2px;">Country</label>
                        <input id="vfsCountry" type="text" placeholder="Bangladesh"
                            style="width:100%;padding:6px;border-radius:4px;border:none;font-size:11px;">
                    </div>
                </div>

                <div style="display:flex; gap:8px; margin-top:12px;">
                    <button id="vfsSaveForm"
                        style="flex:1;padding:10px;background:#4caf50;color:white;border:none;border-radius:6px;cursor:pointer;font-size:12px;font-weight:500;">
                        💾 Save Data
                    </button>
                    <button id="vfsFillNow"
                        style="flex:1;padding:10px;background:#ff9800;color:white;border:none;border-radius:6px;cursor:pointer;font-size:12px;font-weight:500;">
                        ✏️ Fill Now
                    </button>
                </div>

                <button id="vfsCaptureForm"
                    style="width:100%;padding:10px;background:#9c27b0;color:white;border:none;border-radius:6px;cursor:pointer;font-size:12px;font-weight:500;margin-top:8px;">
                    📥 Capture From Page
                </button>

                <button id="vfsClearForm"
                    style="width:100%;padding:8px;background:rgba(255,255,255,0.1);color:white;border:none;border-radius:6px;cursor:pointer;font-size:11px;margin-top:8px;">
                    🗑️ Clear Saved Data
                </button>
            </div>
        </div>

        <div style="margin-top:10px;text-align:center;font-size:9px;opacity:0.5;">
            v2.0 • Auto-fill enabled • Manual booking required
        </div>
    `;

    // Add styles
    const style = document.createElement('style');
    style.textContent = `
        @keyframes vfsPulse {
            0%, 100% { opacity: 1; transform: scale(1); }
            50% { opacity: 0.8; transform: scale(1.02); }
        }
        #vfsWatcherPanel button:hover { opacity: 0.85; }
        #vfsWatcherPanel button:active { transform: scale(0.98); }
        #vfsWatcherPanel input:focus {
            outline: 2px solid #64b5f6;
        }
        #vfsWatcherPanel::-webkit-scrollbar {
            width: 6px;
        }
        #vfsWatcherPanel::-webkit-scrollbar-thumb {
            background: rgba(255,255,255,0.3);
            border-radius: 3px;
        }
        .vfs-autofilled {
            background-color: #e8f5e9 !important;
            border: 2px solid #4caf50 !important;
            transition: all 0.3s ease;
        }
    `;
    document.head.appendChild(style);
    document.body.appendChild(panel);

    // =================== ELEMENTS ===================
    const statusEl = document.getElementById('vfsStatus');
    const lastCheckEl = document.getElementById('vfsLastCheck');
    const slotsAlertEl = document.getElementById('vfsSlotsAlert');
    const countdownEl = document.getElementById('vfsCountdown');
    const intervalInput = document.getElementById('vfsInterval');
    const logEl = document.getElementById('vfsLog');
    const soundToggle = document.getElementById('vfsSoundToggle');
    const autoRefreshToggle = document.getElementById('vfsAutoRefresh');
    const autoFillToggle = document.getElementById('vfsAutoFillToggle');
    const keywordsInput = document.getElementById('vfsKeywords');

    // Form elements
    const formInputs = {
        firstName: document.getElementById('vfsFirstName'),
        lastName: document.getElementById('vfsLastName'),
        email: document.getElementById('vfsEmail'),
        phone: document.getElementById('vfsPhone'),
        passport: document.getElementById('vfsPassport'),
        dob: document.getElementById('vfsDob'),
        nationality: document.getElementById('vfsNationality'),
        urn: document.getElementById('vfsUrn'),
        address: document.getElementById('vfsAddress'),
        city: document.getElementById('vfsCity'),
        postalCode: document.getElementById('vfsPostalCode'),
        country: document.getElementById('vfsCountry')
    };

    // =================== CLOSE PANEL ===================
    document.getElementById('vfsClosePanel').onclick = () => panel.remove();
    document.getElementById('vfsClosePanel').addEventListener('mousedown', e => e.stopPropagation());

    // =================== TAB SWITCHING ===================
    const tabWatch = document.getElementById('vfsTabWatch');
    const tabForm = document.getElementById('vfsTabForm');
    const watchContent = document.getElementById('vfsWatchContent');
    const formContent = document.getElementById('vfsFormContent');

    tabWatch.addEventListener('click', () => {
        tabWatch.style.background = '#3949ab';
        tabForm.style.background = 'rgba(255,255,255,0.1)';
        watchContent.style.display = 'block';
        formContent.style.display = 'none';
    });

    tabForm.addEventListener('click', () => {
        tabForm.style.background = '#3949ab';
        tabWatch.style.background = 'rgba(255,255,255,0.1)';
        formContent.style.display = 'block';
        watchContent.style.display = 'none';
    });

    // =================== DRAG FUNCTIONALITY ===================
    let isDragging = false, offsetX = 0, offsetY = 0;

    panel.addEventListener('mousedown', e => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON') return;
        isDragging = true;
        offsetX = e.clientX - panel.offsetLeft;
        offsetY = e.clientY - panel.offsetTop;
        panel.style.cursor = 'grabbing';
    });

    document.addEventListener('mouseup', () => {
        isDragging = false;
        panel.style.cursor = 'grab';
    });

    document.addEventListener('mousemove', e => {
        if (!isDragging) return;
        panel.style.left = (e.clientX - offsetX) + 'px';
        panel.style.top = (e.clientY - offsetY) + 'px';
        panel.style.right = 'auto';
    });

    // =================== LOGGING ===================
    function log(msg, type = 'info') {
        const time = new Date().toLocaleTimeString();
        const colors = {
            info: '#90caf9',
            success: '#a5d6a7',
            warning: '#ffcc80',
            error: '#ef9a9a'
        };
        const entry = document.createElement('div');
        entry.style.color = colors[type] || colors.info;
        entry.textContent = `[${time}] ${msg}`;
        logEl.appendChild(entry);
        logEl.scrollTop = logEl.scrollHeight;

        while (logEl.children.length > 50) {
            logEl.removeChild(logEl.firstChild);
        }

        console.log(`[VFS Watcher] ${msg}`);
    }

    // =================== SOUND ALERT ===================
    function playAlertSound() {
        if (!soundToggle.checked) return;

        try {
            const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

            const playBeep = (freq, start, duration) => {
                const oscillator = audioCtx.createOscillator();
                const gainNode = audioCtx.createGain();
                oscillator.connect(gainNode);
                gainNode.connect(audioCtx.destination);
                oscillator.frequency.value = freq;
                oscillator.type = 'sine';
                gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime + start);
                gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + start + duration);
                oscillator.start(audioCtx.currentTime + start);
                oscillator.stop(audioCtx.currentTime + start + duration);
            };

            playBeep(523, 0, 0.15);
            playBeep(659, 0.15, 0.15);
            playBeep(784, 0.3, 0.15);
            playBeep(1047, 0.45, 0.3);
        } catch (e) {
            console.log('Audio not supported');
        }
    }

    // =================== FORM FIELD MAPPING ===================
    const fieldMappings = {
        firstName: [
            'firstName', 'first_name', 'firstname', 'fname', 'givenName', 'given_name',
            'applicantFirstName', 'first-name', 'FirstName'
        ],
        lastName: [
            'lastName', 'last_name', 'lastname', 'lname', 'surname', 'familyName',
            'family_name', 'applicantLastName', 'last-name', 'LastName'
        ],
        email: [
            'email', 'emailAddress', 'email_address', 'emailId', 'mail', 'e-mail',
            'applicantEmail', 'Email', 'EMAIL'
        ],
        phone: [
            'phone', 'phoneNumber', 'phone_number', 'mobile', 'mobileNumber', 'tel',
            'telephone', 'contactNumber', 'contact_number', 'Phone', 'Mobile'
        ],
        passport: [
            'passport', 'passportNumber', 'passport_number', 'passportNo', 'passport_no',
            'documentNumber', 'document_number', 'PassportNumber'
        ],
        dob: [
            'dob', 'dateOfBirth', 'date_of_birth', 'birthDate', 'birth_date',
            'birthday', 'DOB', 'DateOfBirth'
        ],
        nationality: [
            'nationality', 'nation', 'citizenShip', 'citizenship', 'Nationality'
        ],
        urn: [
            'urn', 'URN', 'referenceNumber', 'reference_number', 'refNumber', 'ref_number',
            'applicationNumber', 'application_number', 'bookingRef'
        ],
        address: [
            'address', 'streetAddress', 'street_address', 'addressLine1', 'address_line_1',
            'street', 'Address', 'ADDRESS'
        ],
        city: [
            'city', 'cityName', 'city_name', 'town', 'City', 'CITY'
        ],
        postalCode: [
            'postalCode', 'postal_code', 'postcode', 'zipCode', 'zip_code', 'zip',
            'pinCode', 'pin_code', 'PostalCode', 'ZipCode'
        ],
        country: [
            'country', 'countryName', 'country_name', 'nation', 'Country', 'COUNTRY'
        ]
    };

    // =================== AUTO-FILL FUNCTIONS ===================
    function fillFormField(input, value) {
        if (!input || !value) return false;

        // Set value
        input.value = value;

        // Trigger events for React/Angular/Vue
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        input.dispatchEvent(new Event('blur', { bubbles: true }));

        // For React specifically
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
            window.HTMLInputElement.prototype, 'value'
        )?.set;
        if (nativeInputValueSetter) {
            nativeInputValueSetter.call(input, value);
            input.dispatchEvent(new Event('input', { bubbles: true }));
        }

        // Add visual indicator
        input.classList.add('vfs-autofilled');

        return true;
    }

    function findAndFillField(fieldKey, value) {
        if (!value) return 0;

        const mappings = fieldMappings[fieldKey] || [fieldKey];
        let filled = 0;

        // Try by name, id, placeholder, aria-label
        for (const mapping of mappings) {
            // By name
            document.querySelectorAll(`input[name*="${mapping}" i], select[name*="${mapping}" i], textarea[name*="${mapping}" i]`).forEach(el => {
                if (fillFormField(el, value)) filled++;
            });

            // By id
            document.querySelectorAll(`input[id*="${mapping}" i], select[id*="${mapping}" i], textarea[id*="${mapping}" i]`).forEach(el => {
                if (fillFormField(el, value)) filled++;
            });

            // By placeholder
            document.querySelectorAll(`input[placeholder*="${mapping}" i]`).forEach(el => {
                if (fillFormField(el, value)) filled++;
            });

            // By aria-label
            document.querySelectorAll(`input[aria-label*="${mapping}" i]`).forEach(el => {
                if (fillFormField(el, value)) filled++;
            });

            // By data attributes
            document.querySelectorAll(`[data-field*="${mapping}" i], [data-name*="${mapping}" i]`).forEach(el => {
                if (fillFormField(el, value)) filled++;
            });
        }

        return filled;
    }

    function autoFillAllFields() {
        let totalFilled = 0;

        for (const [key, value] of Object.entries(savedFormData)) {
            if (value) {
                const filled = findAndFillField(key, value);
                totalFilled += filled;
            }
        }

        log(`Auto-filled ${totalFilled} field(s)`, totalFilled > 0 ? 'success' : 'warning');
        return totalFilled;
    }

    // =================== CAPTURE FROM PAGE ===================
    function captureFromPage() {
        let captured = 0;

        for (const [fieldKey, mappings] of Object.entries(fieldMappings)) {
            for (const mapping of mappings) {
                // Try to find and capture value
                const selectors = [
                    `input[name*="${mapping}" i]`,
                    `input[id*="${mapping}" i]`,
                    `input[placeholder*="${mapping}" i]`,
                    `select[name*="${mapping}" i]`,
                    `textarea[name*="${mapping}" i]`
                ];

                for (const selector of selectors) {
                    const el = document.querySelector(selector);
                    if (el && el.value && !savedFormData[fieldKey]) {
                        savedFormData[fieldKey] = el.value;
                        if (formInputs[fieldKey]) {
                            formInputs[fieldKey].value = el.value;
                        }
                        captured++;
                        break;
                    }
                }
            }
        }

        if (captured > 0) {
            saveFormData();
            log(`Captured ${captured} field(s) from page`, 'success');
        } else {
            log('No form fields found on page', 'warning');
        }

        return captured;
    }

    // =================== SLOT DETECTION ===================
    function checkForSlots() {
        const keywords = keywordsInput.value.toLowerCase().split(',').map(k => k.trim()).filter(k => k);
        const pageText = document.body.innerText.toLowerCase();
        const pageHTML = document.body.innerHTML.toLowerCase();

        let detected = false;
        let matchedKeyword = '';

        for (const keyword of keywords) {
            if (pageText.includes(keyword) || pageHTML.includes(keyword)) {
                detected = true;
                matchedKeyword = keyword;
                break;
            }
        }

        const slotIndicators = [
            document.querySelectorAll('.calendar-day.available, .date-available, .slot-available, [class*="available"]'),
            document.querySelectorAll('button:not([disabled])[class*="book"], a[class*="book"]:not(.disabled)'),
            document.querySelectorAll('.time-slot:not(.unavailable), .timeslot:not(.disabled)')
        ];

        for (const indicator of slotIndicators) {
            if (indicator.length > 0) {
                detected = true;
                matchedKeyword = `${indicator.length} slot element(s)`;
                break;
            }
        }

        const noSlotsIndicators = [
            'no slots available',
            'no appointments available',
            'no available dates',
            'fully booked',
            'no availability',
            'try again later'
        ];

        for (const noSlot of noSlotsIndicators) {
            if (pageText.includes(noSlot)) {
                detected = false;
                break;
            }
        }

        return { detected, matchedKeyword };
    }

    function performCheck() {
        lastCheck = new Date();
        lastCheckEl.textContent = `Last check: ${lastCheck.toLocaleTimeString()}`;

        log('Checking for slots...', 'info');
        statusEl.textContent = 'Scanning page...';

        const result = checkForSlots();

        if (result.detected) {
            statusEl.textContent = '🎉 SLOTS DETECTED!';
            statusEl.style.color = '#a5d6a7';
            slotsAlertEl.style.display = 'block';
            log(`SLOTS FOUND! (${result.matchedKeyword})`, 'success');
            playAlertSound();

            // Auto-fill if enabled
            if (autoFillToggle.checked) {
                setTimeout(() => {
                    const filled = autoFillAllFields();
                    if (filled > 0) {
                        log('Form auto-filled! Click Book to confirm.', 'success');
                    }
                }, 500);
            }

            // Flash title
            let flashCount = 0;
            const originalTitle = document.title;
            const flashInterval = setInterval(() => {
                document.title = flashCount % 2 === 0 ? '🔴 SLOTS AVAILABLE!' : originalTitle;
                flashCount++;
                if (flashCount > 20) {
                    clearInterval(flashInterval);
                    document.title = originalTitle;
                }
            }, 500);

        } else {
            statusEl.textContent = 'No slots found';
            statusEl.style.color = '#fff';
            slotsAlertEl.style.display = 'none';
            log('No slots detected', 'warning');
        }

        return result.detected;
    }

    // =================== WATCHING ===================
    function startWatching() {
        const interval = parseInt(intervalInput.value) || 30;
        config.refreshInterval = interval;

        stopWatching();

        log(`Started watching (every ${interval}s)`, 'success');
        statusEl.textContent = 'Watching...';

        performCheck();

        countdown = interval;
        countdownEl.textContent = countdown;

        countdownTimer = setInterval(() => {
            countdown--;
            countdownEl.textContent = countdown > 0 ? countdown : '...';

            if (countdown <= 0) {
                countdown = interval;

                if (autoRefreshToggle.checked) {
                    log('Auto-refreshing page...', 'info');
                    location.reload();
                } else {
                    performCheck();
                }
            }
        }, 1000);
    }

    function stopWatching() {
        if (countdownTimer) {
            clearInterval(countdownTimer);
            countdownTimer = null;
        }
        if (refreshTimer) {
            clearInterval(refreshTimer);
            refreshTimer = null;
        }
        countdown = 0;
        countdownEl.textContent = '--';
        statusEl.textContent = 'Stopped';
        log('Stopped watching', 'info');
    }

    // =================== SAVE/LOAD FUNCTIONS ===================
    function saveFormData() {
        for (const [key, input] of Object.entries(formInputs)) {
            if (input) savedFormData[key] = input.value;
        }
        localStorage.setItem('vfsFormData', JSON.stringify(savedFormData));
        log('Form data saved!', 'success');
    }

    function loadFormData() {
        try {
            const saved = JSON.parse(localStorage.getItem('vfsFormData'));
            if (saved) {
                savedFormData = { ...savedFormData, ...saved };
                for (const [key, value] of Object.entries(savedFormData)) {
                    if (formInputs[key] && value) {
                        formInputs[key].value = value;
                    }
                }
            }
        } catch (e) {}
    }

    function clearFormData() {
        savedFormData = {
            firstName: '', lastName: '', email: '', phone: '',
            passport: '', dob: '', nationality: '', urn: '',
            address: '', city: '', postalCode: '', country: ''
        };
        for (const input of Object.values(formInputs)) {
            if (input) input.value = '';
        }
        localStorage.removeItem('vfsFormData');
        log('Form data cleared', 'info');
    }

    function saveSettings() {
        const settings = {
            interval: intervalInput.value,
            sound: soundToggle.checked,
            autoRefresh: autoRefreshToggle.checked,
            autoFill: autoFillToggle.checked,
            keywords: keywordsInput.value
        };
        localStorage.setItem('vfsWatcherSettings', JSON.stringify(settings));
    }

    function loadSettings() {
        try {
            const saved = JSON.parse(localStorage.getItem('vfsWatcherSettings'));
            if (saved) {
                intervalInput.value = saved.interval || 30;
                soundToggle.checked = saved.sound !== false;
                autoRefreshToggle.checked = saved.autoRefresh || false;
                autoFillToggle.checked = saved.autoFill !== false;
                keywordsInput.value = saved.keywords || 'available,book now,select date';
            }
        } catch (e) {}
    }

    // =================== HIGHLIGHT SLOTS ===================
    function highlightSlots() {
        const selectors = [
            '.calendar-day.available',
            '.date-available',
            '.slot-available',
            '[class*="available"]:not([class*="unavailable"])',
            '.timeslot:not(.disabled):not(.unavailable)'
        ];

        let highlighted = 0;

        selectors.forEach(selector => {
            try {
                document.querySelectorAll(selector).forEach(el => {
                    if (!el.dataset.vfsHighlighted) {
                        el.style.boxShadow = '0 0 10px 3px #4caf50';
                        el.style.border = '2px solid #4caf50';
                        el.dataset.vfsHighlighted = 'true';
                        highlighted++;
                    }
                });
            } catch (e) {}
        });

        if (highlighted > 0) {
            log(`Highlighted ${highlighted} slot(s)`, 'success');
        }
    }

    // =================== EVENT LISTENERS ===================
    document.getElementById('vfsStartBtn').addEventListener('click', startWatching);
    document.getElementById('vfsStopBtn').addEventListener('click', stopWatching);
    document.getElementById('vfsCheckNowBtn').addEventListener('click', () => {
        log('Manual check triggered', 'info');
        performCheck();
    });

    document.getElementById('vfsSaveForm').addEventListener('click', saveFormData);
    document.getElementById('vfsFillNow').addEventListener('click', () => {
        saveFormData();
        autoFillAllFields();
    });
    document.getElementById('vfsCaptureForm').addEventListener('click', captureFromPage);
    document.getElementById('vfsClearForm').addEventListener('click', clearFormData);

    intervalInput.addEventListener('change', saveSettings);
    soundToggle.addEventListener('change', saveSettings);
    autoRefreshToggle.addEventListener('change', saveSettings);
    autoFillToggle.addEventListener('change', saveSettings);
    keywordsInput.addEventListener('change', saveSettings);

    // =================== INIT ===================
    loadSettings();
    loadFormData();
    log('VFS Slot Watcher v2.0 loaded', 'success');
    log('Go to "Form Data" tab to save your details', 'info');

    setTimeout(highlightSlots, 2000);

    const observer = new MutationObserver(() => {
        highlightSlots();
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });

})();
