// ============================================================
//  VFS Slot Checker - Background Service Worker
// ============================================================

const API_BASE = 'https://lift-api.vfsglobal.com';

// ── State ──
let state = {
    rsaKey: null,        // raw base64 (no PEM wrapper)
    cryptoKey: null,     // imported CryptoKey object
    authorize: null,     // captured authorize header
    clientsource: null,  // captured clientsource header
    email: null,
    route: null,
    ready: false,
    autoCheck: false,
    interval: 30,
    lastResult: null,
    lastCheck: null,
    slotsFound: false,
    capturedPayload: null, // captured booking payload from VFS page
    // Auto-book state
    autoBook: false,
    autoBookStep: null,   // 'check', 'calendar', 'timeslot', 'otp', 'otp-wait', 'book', 'done', 'error'
    autoBookData: {
        selectedDate: null,
        selectedTime: null,
        availableDates: [],
        availableTimes: [],
        otpSent: false,
        bookingResult: null
    }
};

// ── Load saved state on startup ──
chrome.storage.local.get(['vfsState'], (res) => {
    if (res.vfsState) {
        state.rsaKey = res.vfsState.rsaKey || null;
        state.authorize = res.vfsState.authorize || null;
        state.email = res.vfsState.email || null;
        state.route = res.vfsState.route || null;
        state.interval = res.vfsState.interval || 30;
        state.capturedPayload = res.vfsState.capturedPayload || null;
        if (state.rsaKey && state.authorize) {
            importRsaKey(state.rsaKey).then(k => {
                state.cryptoKey = k;
                state.ready = true;
            });
        }
    }
});

// ── Save state ──
function saveState() {
    chrome.storage.local.set({
        vfsState: {
            rsaKey: state.rsaKey,
            authorize: state.authorize,
            email: state.email,
            route: state.route,
            interval: state.interval,
            capturedPayload: state.capturedPayload
        }
    });
}

// ============================================================
//  RSA Key Import & Encryption (Web Crypto API)
// ============================================================

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
    if (!state.cryptoKey) throw new Error('RSA key not loaded');
    const encoded = new TextEncoder().encode(plaintext);
    const encrypted = await crypto.subtle.encrypt(
        { name: 'RSA-OAEP' },
        state.cryptoKey,
        encoded
    );
    // Convert to base64
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

async function freshClientSource() {
    const ts = utcTimestamp();
    const plaintext = `${state.email};${ts}`;
    return rsaEncrypt(plaintext);
}

async function buildHeaders() {
    const cs = await freshClientSource();
    const headers = {
        'accept': 'application/json, text/plain, */*',
        'authorize': state.authorize,
        'clientsource': cs,
        'content-type': 'application/json;charset=UTF-8'
    };
    if (state.route) headers['route'] = state.route;
    return headers;
}

// ============================================================
//  Intercept VFS Request Headers
// ============================================================

chrome.webRequest.onSendHeaders.addListener(
    (details) => {
        if (!details.requestHeaders) return;

        let changed = false;

        for (const header of details.requestHeaders) {
            const name = header.name.toLowerCase();

            if (name === 'authorize' && header.value) {
                state.authorize = header.value;
                changed = true;
            }
            if (name === 'clientsource' && header.value) {
                state.clientsource = header.value;
                changed = true;
            }
            if (name === 'route' && header.value) {
                state.route = header.value;
                changed = true;
            }
        }

        if (changed) {
            saveState();
            updateReadyState();
        }
    },
    { urls: ['*://lift-api.vfsglobal.com/*'] },
    ['requestHeaders', 'extraHeaders']
);

function updateReadyState() {
    if (state.rsaKey && state.authorize && state.email && state.cryptoKey) {
        state.ready = true;
    }
}

// ============================================================
//  Messages from Content Script & Popup
// ============================================================

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'RSA_KEY_FOUND') {
        handleRsaKey(msg.key, msg.email);
        sendResponse({ ok: true });
    }

    if (msg.type === 'RETRY_RSA_IMPORT') {
        retryRsaImport()
            .then(success => sendResponse({ ok: success, ready: state.ready, hasCryptoKey: !!state.cryptoKey }))
            .catch(e => sendResponse({ ok: false, error: e.message }));
        return true;
    }

    if (msg.type === 'AUTH_CAPTURED') {
        if (msg.authorize) state.authorize = msg.authorize;
        if (msg.email) state.email = msg.email;
        if (msg.route) state.route = msg.route;
        saveState();
        updateReadyState();
        sendResponse({ ok: true });
    }

    if (msg.type === 'GET_STATE') {
        sendResponse({
            ready: state.ready,
            email: state.email,
            route: state.route,
            hasRsaKey: !!state.rsaKey,
            hasAuth: !!state.authorize,
            hasCryptoKey: !!state.cryptoKey,
            autoCheck: state.autoCheck,
            interval: state.interval,
            lastResult: state.lastResult,
            lastCheck: state.lastCheck,
            slotsFound: state.slotsFound,
            capturedPayload: state.capturedPayload,
            // Include partial token info for debugging
            authPreview: state.authorize ? '...' + state.authorize.slice(-20) : null,
            rsaKeyLength: state.rsaKey ? state.rsaKey.length : 0
        });
    }

    if (msg.type === 'GET_TOKENS') {
        generateTokens()
            .then(result => sendResponse(result))
            .catch(e => sendResponse({ error: e.message }));
        return true;
    }

    if (msg.type === 'FETCH_WITH_TOKEN') {
        fetchWithFreshToken()
            .then(result => sendResponse(result))
            .catch(e => sendResponse({ error: e.message }));
        return true;
    }

    if (msg.type === 'CHECK_SLOTS') {
        checkSlots().then(result => sendResponse(result)).catch(e => sendResponse({ error: e.message }));
        return true; // async response
    }

    if (msg.type === 'CHECK_STATUS') {
        checkStatus().then(result => sendResponse(result)).catch(e => sendResponse({ error: e.message }));
        return true;
    }

    if (msg.type === 'CUSTOM_CALL') {
        customCall(msg.method, msg.endpoint, msg.body)
            .then(result => sendResponse(result))
            .catch(e => sendResponse({ error: e.message }));
        return true;
    }

    if (msg.type === 'SET_AUTO_CHECK') {
        state.autoCheck = msg.enabled;
        state.interval = msg.interval || state.interval;
        if (state.autoCheck) {
            startAutoCheck();
        } else {
            stopAutoCheck();
        }
        sendResponse({ ok: true });
    }

    if (msg.type === 'RESET') {
        state = {
            rsaKey: null, cryptoKey: null, authorize: null,
            clientsource: null, email: null, route: null,
            ready: false, autoCheck: false, interval: 30,
            lastResult: null, lastCheck: null, slotsFound: false,
            capturedPayload: null
        };
        chrome.storage.local.remove('vfsState');
        stopAutoCheck();
        sendResponse({ ok: true });
    }

    if (msg.type === 'GET_CAPTURED_PAYLOAD') {
        sendResponse({ payload: state.capturedPayload || null });
    }

    if (msg.type === 'PAYLOAD_CAPTURED') {
        state.capturedPayload = msg.payload;
        saveState();
        sendResponse({ ok: true });
    }

    if (msg.type === 'QUICK_ACTION') {
        handleQuickAction(msg.action, msg.params)
            .then(result => sendResponse(result))
            .catch(e => sendResponse({ error: e.message }));
        return true;
    }

    // Auto-Book handlers
    if (msg.type === 'SET_AUTO_BOOK') {
        state.autoBook = msg.enabled;
        if (!msg.enabled) {
            state.autoBookStep = null;
            state.autoBookData = {
                selectedDate: null,
                selectedTime: null,
                availableDates: [],
                availableTimes: [],
                otpSent: false,
                bookingResult: null
            };
        }
        sendResponse({ ok: true, autoBook: state.autoBook });
    }

    if (msg.type === 'GET_AUTO_BOOK_STATE') {
        sendResponse({
            autoBook: state.autoBook,
            step: state.autoBookStep,
            data: state.autoBookData
        });
    }

    if (msg.type === 'START_AUTO_BOOK') {
        if (!state.autoBook) {
            sendResponse({ error: 'Auto-book not enabled' });
            return;
        }
        runAutoBookFlow()
            .then(() => sendResponse({ ok: true, step: state.autoBookStep, data: state.autoBookData }))
            .catch(e => sendResponse({ error: e.message }));
        return true;
    }

    if (msg.type === 'COMPLETE_AUTO_BOOK') {
        completeAutoBook(msg.otp)
            .then(result => sendResponse(result))
            .catch(e => sendResponse({ error: e.message }));
        return true;
    }

    if (msg.type === 'RESET_AUTO_BOOK') {
        state.autoBookStep = null;
        state.autoBookData = {
            selectedDate: null,
            selectedTime: null,
            availableDates: [],
            availableTimes: [],
            otpSent: false,
            bookingResult: null
        };
        sendResponse({ ok: true });
    }
});

// ============================================================
//  Handle RSA Key
// ============================================================

async function handleRsaKey(rawKey, email) {
    console.log('[VFS] handleRsaKey called, key length:', rawKey?.length, 'email:', email);
    state.rsaKey = rawKey;
    if (email) state.email = email;

    try {
        state.cryptoKey = await importRsaKey(rawKey);
        state.ready = !!(state.authorize && state.email && state.cryptoKey);
        console.log('[VFS] ✅ RSA key handled successfully, ready:', state.ready);
        saveState();
    } catch (e) {
        console.error('[VFS] ❌ Failed to import RSA key:', e.message);
        state.cryptoKey = null;
        state.ready = false;
        // Still save the raw key so we can try again later
        saveState();
    }
}

// Retry RSA key import (can be called manually)
async function retryRsaImport() {
    if (state.rsaKey && !state.cryptoKey) {
        console.log('[VFS] Retrying RSA key import...');
        try {
            state.cryptoKey = await importRsaKey(state.rsaKey);
            state.ready = !!(state.authorize && state.email && state.cryptoKey);
            console.log('[VFS] ✅ RSA key import retry successful, ready:', state.ready);
            return true;
        } catch (e) {
            console.error('[VFS] ❌ RSA key import retry failed:', e.message);
            return false;
        }
    }
    return false;
}

// ============================================================
//  Token Generation
// ============================================================

async function generateTokens() {
    if (!state.cryptoKey) throw new Error('RSA key not loaded. Login to VFS first.');
    if (!state.email) throw new Error('Email not captured. Login to VFS first.');

    const ts = utcTimestamp();
    const plaintext = `${state.email};${ts}`;
    const clientsource = await rsaEncrypt(plaintext);

    return {
        email: state.email,
        route: state.route,
        timestamp: ts,
        clientsource: clientsource,
        authorize: state.authorize,
        headers: {
            'accept': 'application/json, text/plain, */*',
            'authorize': state.authorize,
            'clientsource': clientsource,
            'content-type': 'application/json;charset=UTF-8',
            'route': state.route || ''
        }
    };
}

async function fetchWithFreshToken() {
    if (!state.cryptoKey) throw new Error('RSA key not loaded. Login to VFS first.');
    if (!state.email) throw new Error('Email not captured. Login to VFS first.');
    if (!state.authorize) throw new Error('Authorize token not captured. Login to VFS first.');

    const ts = utcTimestamp();
    const plaintext = `${state.email};${ts}`;
    const clientsource = await rsaEncrypt(plaintext);
    const routeParts = (state.route || 'bgd/en/ita').split('/');

    const headers = {
        'accept': 'application/json, text/plain, */*',
        'authorize': state.authorize,
        'clientsource': clientsource,
        'content-type': 'application/json;charset=UTF-8',
        'route': state.route || ''
    };

    const res = await fetch(`${API_BASE}/appointment/slots`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
            countryCode: routeParts[0] || 'bgd',
            missionCode: routeParts[2] || 'ita',
            loginUser: state.email
        })
    });

    let data;
    try {
        data = await res.json();
    } catch (e) {
        data = { raw: await res.text() };
    }

    return {
        tokens: {
            clientsource,
            authorize: state.authorize,
            route: state.route,
            email: state.email,
            timestamp: ts
        },
        fetch: {
            status: res.status,
            data
        }
    };
}

// ============================================================
//  API Calls
// ============================================================

async function checkSlots() {
    if (!state.ready) throw new Error('Not ready. Login to VFS first.');

    const headers = await buildHeaders();
    const routeParts = (state.route || 'bgd/en/ita').split('/');

    const res = await fetch(`${API_BASE}/appointment/slots`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
            countryCode: routeParts[0] || 'bgd',
            missionCode: routeParts[2] || 'ita',
            loginUser: state.email
        })
    });

    let data;
    try {
        data = await res.json();
    } catch (e) {
        data = { raw: await res.text() };
    }

    state.lastCheck = new Date().toISOString();
    state.lastResult = data;

    // Check if slots exist
    const hasSlots =
        (data.data && Array.isArray(data.data) && data.data.length > 0) ||
        (data.slots && Array.isArray(data.slots) && data.slots.length > 0) ||
        (data.earliestDate);

    state.slotsFound = !!hasSlots;

    if (hasSlots) {
        chrome.notifications.create('vfs-slots', {
            type: 'basic',
            iconUrl: 'icon.png',
            title: 'VFS SLOTS AVAILABLE!',
            message: 'Appointment slots found! Open VFS now!',
            priority: 2,
            requireInteraction: true
        });
    }

    return { status: res.status, data, hasSlots };
}

async function checkStatus() {
    if (!state.ready) throw new Error('Not ready. Login to VFS first.');

    const headers = await buildHeaders();
    const routeParts = (state.route || 'bgd/en/ita').split('/');

    const res = await fetch(`${API_BASE}/appointment/application`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
            countryCode: routeParts[0] || 'bgd',
            missionCode: routeParts[2] || 'ita',
            loginUser: state.email
        })
    });

    const data = await res.json().catch(() => null);
    return { status: res.status, data };
}

async function customCall(method, endpoint, body) {
    if (!state.ready) throw new Error('Not ready. Login to VFS first.');

    const headers = await buildHeaders();
    const opts = { method, headers };
    if (body && method !== 'GET') {
        opts.body = JSON.stringify(body);
    }

    const res = await fetch(`${API_BASE}/${endpoint}`, opts);
    const data = await res.json().catch(() => null);
    return { status: res.status, data };
}

// ============================================================
//  Quick Actions Handler
// ============================================================

async function handleQuickAction(action, params) {
    if (!state.ready) throw new Error('Not ready. Login to VFS first.');

    const headers = await buildHeaders();
    const routeParts = (state.route || 'bgd/en/ita').split('/');

    const basePayload = {
        countryCode: params.countryCode || routeParts[0] || 'bgd',
        missionCode: params.missionCode || routeParts[2] || '',
        centerCode: params.centerCode || 'DAC',
        loginUser: params.loginUser || state.email
    };

    let endpoint = '';
    let method = 'POST';
    let body = {};

    switch (action) {
        case 'calendar':
            endpoint = 'appointment/calendar';
            body = {
                ...basePayload,
                visaCategoryCode: params.visaCategory || '',
                languageCode: params.languageCode || 'en-US',
                fromDate: params.date || '',
                urn: params.urn || ''
            };
            break;

        case 'timeslot':
            endpoint = 'appointment/timeslot';
            body = {
                ...basePayload,
                visaCategoryCode: params.visaCategory || '',
                languageCode: params.languageCode || 'en-US',
                appointmentDate: params.date || '',
                urn: params.urn || ''
            };
            break;

        case 'sendOtp':
            endpoint = 'appointment/applicantotp';
            body = {
                ...basePayload,
                urn: params.urn || '',
                contactNumber: params.contactNumber || '',
                passportNumber: params.passportNumber || '',
                languageCode: params.languageCode || 'en-US'
            };
            break;

        case 'verifyOtp':
            endpoint = 'appointment/verifyapplicantotp';
            body = {
                ...basePayload,
                urn: params.urn || '',
                OTP: params.otp || '',
                languageCode: params.languageCode || 'en-US'
            };
            break;

        case 'fees':
            endpoint = 'appointment/fees';
            body = {
                ...basePayload,
                visaCategoryCode: params.visaCategory || '',
                languageCode: params.languageCode || 'en-US',
                urn: params.urn || ''
            };
            break;

        case 'application':
            endpoint = 'appointment/application';
            body = {
                ...basePayload,
                languageCode: params.languageCode || 'en-US'
            };
            break;

        case 'book':
            endpoint = 'appointment/schedule';
            // Build applicants array if not provided
            let applicantsList = params.applicants || [];
            if (applicantsList.length === 0 && (params.firstName || params.lastName)) {
                applicantsList = [{
                    firstName: params.firstName || '',
                    lastName: params.lastName || '',
                    gender: params.gender || '',
                    dateOfBirth: params.dateOfBirth || '',
                    nationality: params.nationality || '',
                    passportNumber: params.passportNumber || '',
                    passportExpiry: params.passportExpiry || '',
                    contactNumber: params.contactNumber || '',
                    email: params.loginUser || state.email || ''
                }];
            }
            body = {
                ...basePayload,
                visaCategoryCode: params.visaCategory || '',
                languageCode: params.languageCode || 'en-US',
                urn: params.urn || '',
                slotDate: params.date || '',
                slotTime: params.slotTime || '',
                applicants: applicantsList,
                payCode: params.payCode || '',
                contactNumber: params.contactNumber || '',
                passportNumber: params.passportNumber || '',
                captcha_version: params.captchaVersion || '',
                captcha_api_key: params.captchaKey || ''
            };
            break;

        default:
            throw new Error('Unknown action: ' + action);
    }

    console.log(`[VFS] Quick Action: ${action}`, { endpoint, body });

    const res = await fetch(`${API_BASE}/${endpoint}`, {
        method,
        headers,
        body: JSON.stringify(body)
    });

    let data;
    try {
        data = await res.json();
    } catch (e) {
        data = { raw: await res.text() };
    }

    // Build response with full details
    const result = {
        action,
        success: res.ok && !data.error,
        status: res.status,
        data,
        request: {
            endpoint,
            payload: body,
            headers: {
                authorize: state.authorize ? '***' + state.authorize.slice(-10) : null,
                route: state.route
            }
        },
        timestamp: new Date().toISOString()
    };

    // Extract booking ID if this was a book action
    if (action === 'book' && data) {
        result.bookingId = data.bookingId || data.confirmationNumber || data.appointmentId || data.id || null;
        result.referenceNumber = data.referenceNumber || data.refNumber || params.urn || null;
        result.message = data.message || (result.success ? 'Booking submitted' : 'Booking failed');
    }

    // Extract OTP status
    if (action === 'sendOtp' || action === 'verifyOtp') {
        result.message = data.message || data.status || (result.success ? 'OTP processed' : 'OTP failed');
    }

    console.log(`[VFS] Quick Action Result:`, result);
    return result;
}

// ============================================================
//  Auto-Check with Alarms
// ============================================================

chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'vfs-auto-check' && state.autoCheck && state.ready) {
        checkSlots().then(result => {
            console.log('[VFS] Auto-check:', result.hasSlots ? 'SLOTS FOUND!' : 'No slots');

            // If auto-book is enabled and slots found, start auto-book flow
            if (result.hasSlots && state.autoBook && !state.autoBookStep) {
                console.log('[VFS] Starting Auto-Book flow...');
                updateAutoBookStep('check');
                runAutoBookFlow();
            }
        }).catch(e => {
            console.error('[VFS] Auto-check error:', e.message);
        });
    }
});

function startAutoCheck() {
    chrome.alarms.create('vfs-auto-check', {
        delayInMinutes: 0.01, // start almost immediately
        periodInMinutes: state.interval / 60
    });
    console.log(`[VFS] Auto-check started: every ${state.interval}s`);
}

function stopAutoCheck() {
    chrome.alarms.clear('vfs-auto-check');
    console.log('[VFS] Auto-check stopped');
}

// ============================================================
//  Auto-Book Flow
// ============================================================

function updateAutoBookStep(step, data = {}) {
    state.autoBookStep = step;
    Object.assign(state.autoBookData, data);
    console.log(`[VFS] Auto-Book Step: ${step}`, data);
}

async function runAutoBookFlow() {
    if (!state.autoBook || !state.ready) return;
    if (!state.capturedPayload?.urn) {
        updateAutoBookStep('error', { error: 'No URN captured. Fill form first.' });
        return;
    }

    const params = state.capturedPayload;

    try {
        // Step 1: Get Calendar (available dates)
        updateAutoBookStep('calendar');
        const calendarResult = await handleQuickAction('calendar', params);

        let dates = [];
        if (calendarResult.data?.calendars) {
            dates = calendarResult.data.calendars;
        } else if (Array.isArray(calendarResult.data)) {
            dates = calendarResult.data;
        } else if (calendarResult.data?.data) {
            dates = calendarResult.data.data;
        }

        if (dates.length === 0) {
            updateAutoBookStep('error', { error: 'No available dates found' });
            return;
        }

        // Select first available date
        const firstDate = typeof dates[0] === 'string' ? dates[0] : dates[0].date;
        updateAutoBookStep('calendar', {
            availableDates: dates,
            selectedDate: firstDate
        });
        console.log('[VFS] Auto-Book: Selected date:', firstDate);

        // Step 2: Get Time Slots
        updateAutoBookStep('timeslot');
        const timeslotResult = await handleQuickAction('timeslot', {
            ...params,
            date: firstDate
        });

        let times = [];
        if (timeslotResult.data?.slots) {
            times = timeslotResult.data.slots;
        } else if (Array.isArray(timeslotResult.data)) {
            times = timeslotResult.data;
        } else if (timeslotResult.data?.data) {
            times = timeslotResult.data.data;
        }

        if (times.length === 0) {
            updateAutoBookStep('error', { error: 'No time slots found for ' + firstDate });
            return;
        }

        // Select first available time
        const firstTime = typeof times[0] === 'string' ? times[0] : (times[0].slot || times[0].time || times[0].slotTime);
        updateAutoBookStep('timeslot', {
            availableTimes: times,
            selectedTime: firstTime,
            selectedDate: firstDate
        });
        console.log('[VFS] Auto-Book: Selected time:', firstTime);

        // Step 3: Send OTP
        updateAutoBookStep('otp');
        const otpResult = await handleQuickAction('sendOtp', params);

        if (!otpResult.success && otpResult.status >= 400) {
            updateAutoBookStep('error', { error: 'Failed to send OTP: ' + (otpResult.data?.message || 'Unknown error') });
            return;
        }

        // Step 4: Wait for OTP
        updateAutoBookStep('otp-wait', {
            selectedDate: firstDate,
            selectedTime: firstTime,
            otpSent: true
        });

        // Notify user
        chrome.notifications.create('vfs-otp', {
            type: 'basic',
            iconUrl: 'icon.png',
            title: 'VFS: Enter OTP to Complete Booking!',
            message: `Date: ${firstDate}, Time: ${firstTime}\nEnter OTP in extension popup to book!`,
            priority: 2,
            requireInteraction: true
        });

        console.log('[VFS] Auto-Book: Waiting for OTP input...');

    } catch (e) {
        console.error('[VFS] Auto-Book error:', e);
        updateAutoBookStep('error', { error: e.message });
    }
}

async function completeAutoBook(otp) {
    if (!state.autoBook || state.autoBookStep !== 'otp-wait') {
        return { error: 'Not in OTP-wait state' };
    }

    const params = {
        ...state.capturedPayload,
        date: state.autoBookData.selectedDate,
        slotTime: state.autoBookData.selectedTime,
        otp: otp
    };

    try {
        // Verify OTP first
        updateAutoBookStep('book');
        const verifyResult = await handleQuickAction('verifyOtp', { ...params, otp });

        if (!verifyResult.success && verifyResult.status >= 400) {
            updateAutoBookStep('otp-wait', { error: 'OTP verification failed' });
            return { error: 'OTP verification failed: ' + (verifyResult.data?.message || 'Invalid OTP') };
        }

        // Book appointment
        const bookResult = await handleQuickAction('book', params);

        if (bookResult.success || bookResult.status < 400) {
            updateAutoBookStep('done', { bookingResult: bookResult });

            chrome.notifications.create('vfs-booked', {
                type: 'basic',
                iconUrl: 'icon.png',
                title: 'VFS: BOOKING SUCCESSFUL!',
                message: `Booked: ${params.date} at ${params.slotTime}\nID: ${bookResult.bookingId || 'Check popup'}`,
                priority: 2,
                requireInteraction: true
            });

            return { success: true, result: bookResult };
        } else {
            updateAutoBookStep('error', { error: bookResult.data?.message || 'Booking failed' });
            return { error: 'Booking failed: ' + (bookResult.data?.message || 'Unknown error'), result: bookResult };
        }

    } catch (e) {
        console.error('[VFS] Auto-Book complete error:', e);
        updateAutoBookStep('error', { error: e.message });
        return { error: e.message };
    }
}
