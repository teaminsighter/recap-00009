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
    slotsFound: false
};

// ── Load saved state on startup ──
chrome.storage.local.get(['vfsState'], (res) => {
    if (res.vfsState) {
        state.rsaKey = res.vfsState.rsaKey || null;
        state.authorize = res.vfsState.authorize || null;
        state.email = res.vfsState.email || null;
        state.route = res.vfsState.route || null;
        state.interval = res.vfsState.interval || 30;
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
            interval: state.interval
        }
    });
}

// ============================================================
//  RSA Key Import & Encryption (Web Crypto API)
// ============================================================

async function importRsaKey(base64Key) {
    // Clean: remove pipes, newlines, PEM headers
    let cleaned = base64Key
        .replace(/\|+/g, '')
        .replace(/-----BEGIN PUBLIC KEY-----/g, '')
        .replace(/-----END PUBLIC KEY-----/g, '')
        .replace(/\s+/g, '');

    // Decode base64 to ArrayBuffer
    const binaryStr = atob(cleaned);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
    }

    // Import as RSA-OAEP with SHA-256
    return crypto.subtle.importKey(
        'spki',
        bytes.buffer,
        { name: 'RSA-OAEP', hash: 'SHA-256' },
        false,
        ['encrypt']
    );
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
            autoCheck: state.autoCheck,
            interval: state.interval,
            lastResult: state.lastResult,
            lastCheck: state.lastCheck,
            slotsFound: state.slotsFound
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
            lastResult: null, lastCheck: null, slotsFound: false
        };
        chrome.storage.local.remove('vfsState');
        stopAutoCheck();
        sendResponse({ ok: true });
    }
});

// ============================================================
//  Handle RSA Key
// ============================================================

async function handleRsaKey(rawKey, email) {
    state.rsaKey = rawKey;
    if (email) state.email = email;

    try {
        state.cryptoKey = await importRsaKey(rawKey);
        state.ready = !!(state.authorize && state.email);
        saveState();
    } catch (e) {
        console.error('[VFS] Failed to import RSA key:', e);
    }
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
//  Auto-Check with Alarms
// ============================================================

chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'vfs-auto-check' && state.autoCheck && state.ready) {
        checkSlots().then(result => {
            console.log('[VFS] Auto-check:', result.hasSlots ? 'SLOTS FOUND!' : 'No slots');
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
