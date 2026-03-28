// ============================================================
//  VFS Slot Checker - Content Script
//  Runs on vfsglobal.com pages
// ============================================================

let lastRsaKey = null;
let lastEmail = null;

// ── Scan sessionStorage AND localStorage for RSA key + email + auth token ──

let lastAuthToken = null;

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
                if (val.includes('MII') && !lastRsaKey) {
                    let rsaKey = val;
                    try {
                        const parsed = JSON.parse(val);
                        if (typeof parsed === 'string' && parsed.includes('MII')) {
                            rsaKey = parsed;
                        } else if (parsed && typeof parsed === 'object') {
                            // Check nested properties
                            for (const [k, v] of Object.entries(parsed)) {
                                if (typeof v === 'string' && v.includes('MII')) {
                                    rsaKey = v;
                                    break;
                                }
                            }
                        }
                    } catch (e) {}

                    if (rsaKey.includes('MII') && rsaKey.length > 200) {
                        lastRsaKey = rsaKey;
                        console.log('[VFS Ext] ✅ RSA key found in', name, '- key:', key);
                        chrome.runtime.sendMessage({
                            type: 'RSA_KEY_FOUND',
                            key: lastRsaKey,
                            email: lastEmail
                        });
                    }
                }

                // Find Bearer/Auth token (JWT format)
                if (!lastAuthToken) {
                    // Check for JWT token
                    if (val.startsWith('eyJ') && val.length > 50) {
                        lastAuthToken = val;
                        console.log('[VFS Ext] ✅ JWT token found in', name, '- key:', key);
                        chrome.runtime.sendMessage({
                            type: 'AUTH_CAPTURED',
                            authorize: lastAuthToken
                        });
                    }

                    // Check inside JSON objects for token
                    try {
                        const parsed = JSON.parse(val);
                        const authKeys = ['token', 'accessToken', 'access_token', 'authToken', 'auth_token', 'bearerToken', 'bearer', 'jwt', 'authorize'];
                        for (const ak of authKeys) {
                            if (parsed[ak] && typeof parsed[ak] === 'string' && parsed[ak].length > 50) {
                                lastAuthToken = parsed[ak];
                                console.log('[VFS Ext] ✅ Token found in', name, '.', key, '.', ak);
                                chrome.runtime.sendMessage({
                                    type: 'AUTH_CAPTURED',
                                    authorize: lastAuthToken
                                });
                                break;
                            }
                        }
                    } catch (e) {}
                }

                // Find email
                if (!lastEmail) {
                    const emailMatch = val.match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
                    if (emailMatch && emailMatch[0].length < 100) {
                        lastEmail = emailMatch[0];
                        console.log('[VFS Ext] ✅ Email found in', name, '- key:', key);
                        chrome.runtime.sendMessage({
                            type: 'AUTH_CAPTURED',
                            email: lastEmail
                        });
                    }
                }

                // Find URN and booking data in storage
                const urnKeys = ['urn', 'URN', 'applicationId', 'refNo', 'reference', 'bookingRef'];
                const bookingKeys = ['countryCode', 'missionCode', 'centerCode', 'visaCategory', 'visaCategoryCode'];

                // Check if key name suggests booking data
                const keyLower = key.toLowerCase();
                if (keyLower.includes('urn') || keyLower.includes('application') || keyLower.includes('booking') || keyLower.includes('appointment')) {
                    console.log('[VFS Ext] 📋 Potential booking data in', name, '- key:', key, '- value:', val.substring(0, 200));
                }

                // Try to parse JSON and extract booking data
                try {
                    const parsed = JSON.parse(val);
                    if (typeof parsed === 'object' && parsed !== null) {
                        let foundPayload = {};
                        let hasData = false;

                        // Check for URN
                        for (const uk of urnKeys) {
                            if (parsed[uk]) {
                                foundPayload.urn = parsed[uk];
                                hasData = true;
                                console.log('[VFS Ext] ✅ URN found in', name, '-', key, ':', parsed[uk]);
                            }
                        }

                        // Check for other booking fields
                        for (const bk of bookingKeys) {
                            if (parsed[bk]) {
                                foundPayload[bk] = parsed[bk];
                                hasData = true;
                            }
                        }

                        // Check for applicant data
                        if (parsed.applicants || parsed.applicant || parsed.firstName || parsed.passportNumber) {
                            foundPayload = { ...foundPayload, ...parsed };
                            hasData = true;
                            console.log('[VFS Ext] ✅ Applicant data found in', name, '-', key);
                        }

                        if (hasData) {
                            chrome.runtime.sendMessage({
                                type: 'PAYLOAD_CAPTURED',
                                payload: foundPayload
                            });
                        }
                    }
                } catch (e) {}
            }
        } catch (e) {
            console.log('[VFS Ext] Storage scan error:', e.message);
        }
    }
}

// Alias for backward compatibility
function scanSessionStorage() {
    scanAllStorage();
}

// ── Inject fetch interceptor into page context ──

function injectInterceptor() {
    const script = document.createElement('script');
    script.textContent = `
    (function() {
        const origFetch = window.fetch;
        window.fetch = async function(...args) {
            const res = await origFetch.apply(this, args);

            try {
                const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';

                // Capture outgoing headers
                if (url.includes('lift-api') || url.includes('vfsglobal.com/api')) {
                    const headers = args[1]?.headers || {};
                    const data = {
                        authorize: headers['authorize'] || headers['Authorize'],
                        clientsource: headers['clientsource'] || headers['Clientsource'],
                        route: headers['route'] || headers['Route']
                    };

                    if (data.authorize || data.clientsource) {
                        window.postMessage({ type: 'VFS_HEADERS_CAPTURED', ...data }, '*');
                    }
                }

                // Try to capture RSA key from response
                if (url.includes('lift-api') || url.includes('vfsglobal.com/api')) {
                    const clone = res.clone();
                    clone.text().then(body => {
                        if (body && body.includes('MII')) {
                            window.postMessage({ type: 'VFS_RSA_FROM_RESPONSE', body }, '*');
                        }
                    }).catch(() => {});
                }
            } catch (e) {}

            return res;
        };

        // Also intercept XMLHttpRequest
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

        XMLHttpRequest.prototype.send = function() {
            if (this._vfsUrl && (this._vfsUrl.includes('lift-api') || this._vfsUrl.includes('vfsglobal.com/api'))) {
                const h = this._vfsHeaders;
                if (h['authorize'] || h['clientsource']) {
                    window.postMessage({
                        type: 'VFS_HEADERS_CAPTURED',
                        authorize: h['authorize'],
                        clientsource: h['clientsource'],
                        route: h['route']
                    }, '*');
                }

                this.addEventListener('load', () => {
                    try {
                        if (this.responseText && this.responseText.includes('MII')) {
                            window.postMessage({ type: 'VFS_RSA_FROM_RESPONSE', body: this.responseText }, '*');
                        }
                    } catch (e) {}
                });
            }
            return origSend.apply(this, arguments);
        };
    })();
    `;
    document.documentElement.appendChild(script);
    script.remove();
}

// ── Listen for messages from injected script ──

window.addEventListener('message', (event) => {
    if (event.source !== window) return;

    if (event.data.type === 'VFS_HEADERS_CAPTURED') {
        chrome.runtime.sendMessage({
            type: 'AUTH_CAPTURED',
            authorize: event.data.authorize,
            route: event.data.route,
            email: lastEmail
        });
    }

    if (event.data.type === 'VFS_RSA_FROM_RESPONSE') {
        try {
            const body = event.data.body;
            const json = JSON.parse(body);
            const candidate = json.data || json.rsaKey || json.publicKey || json.key;
            if (candidate && typeof candidate === 'string' && candidate.includes('MII')) {
                lastRsaKey = candidate;
                chrome.runtime.sendMessage({
                    type: 'RSA_KEY_FOUND',
                    key: candidate,
                    email: lastEmail
                });
            }
        } catch (e) {
            // Raw text RSA key
            if (event.data.body.includes('MII') && event.data.body.length > 200 && event.data.body.length < 2000) {
                lastRsaKey = event.data.body;
                chrome.runtime.sendMessage({
                    type: 'RSA_KEY_FOUND',
                    key: event.data.body,
                    email: lastEmail
                });
            }
        }
    }
});

// ── Extract email from page ──

function extractEmailFromPage() {
    // Try to find email in the page (after login, might be displayed)
    const textContent = document.body?.innerText || '';
    const emailMatch = textContent.match(/[\w.+-]+@[\w-]+\.[\w.]+/);
    if (emailMatch && !lastEmail) {
        lastEmail = emailMatch[0];
        chrome.runtime.sendMessage({
            type: 'AUTH_CAPTURED',
            email: lastEmail
        });
    }
}

// ── Extract URN and route from URL ──

function extractFromUrl() {
    const url = window.location.href;
    const pathname = window.location.pathname;

    // Extract route from path like /bgd/en/ita/...
    const routeMatch = pathname.match(/^\/([a-z]{2,3})\/([a-z]{2})\/([a-z]{2,3})/i);
    if (routeMatch) {
        const route = `${routeMatch[1]}/${routeMatch[2]}/${routeMatch[3]}`;
        console.log('[VFS Ext] ✅ Route extracted from URL:', route);
        chrome.runtime.sendMessage({
            type: 'AUTH_CAPTURED',
            route: route
        });
    }

    // Extract URN from URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    const urnFromUrl = urlParams.get('urn') || urlParams.get('URN') || urlParams.get('applicationId') || urlParams.get('refNo');
    if (urnFromUrl) {
        console.log('[VFS Ext] ✅ URN extracted from URL:', urnFromUrl);
        chrome.runtime.sendMessage({
            type: 'PAYLOAD_CAPTURED',
            payload: { urn: urnFromUrl }
        });
    }

    // Also check hash fragment
    if (window.location.hash) {
        const hashParams = new URLSearchParams(window.location.hash.substring(1));
        const urnFromHash = hashParams.get('urn') || hashParams.get('URN');
        if (urnFromHash) {
            console.log('[VFS Ext] ✅ URN extracted from hash:', urnFromHash);
            chrome.runtime.sendMessage({
                type: 'PAYLOAD_CAPTURED',
                payload: { urn: urnFromHash }
            });
        }
    }
}

// ── Run ──

injectInterceptor();

// Extract from URL immediately
extractFromUrl();

// Scan periodically (session storage gets populated after login)
scanSessionStorage();
setInterval(scanSessionStorage, 3000);

// Also try to get email from page after a delay
setTimeout(extractEmailFromPage, 5000);
setTimeout(extractEmailFromPage, 15000);

// Re-extract from URL when navigation changes (SPA)
let lastUrl = window.location.href;
setInterval(() => {
    if (window.location.href !== lastUrl) {
        lastUrl = window.location.href;
        console.log('[VFS Ext] 🔄 URL changed, re-scanning...');
        extractFromUrl();
        scanSessionStorage();
    }
}, 1000);

// ── Capture booking payload from VFS page requests ──

function capturePayloadFromRequest(url, body) {
    if (!body) return;

    try {
        const payload = typeof body === 'string' ? JSON.parse(body) : body;

        // DEBUG: Log ALL VFS API request payloads
        console.log('[VFS Ext] 📦 API Request to:', url);
        console.log('[VFS Ext] 📦 Payload:', JSON.stringify(payload, null, 2));

        // Check if this looks like a booking-related payload (expanded field list)
        const hasBookingFields = payload.urn || payload.URN ||
            payload.visaCategoryCode || payload.visaCategory || payload.categoryCode ||
            payload.centerCode || payload.centreCode || payload.vacCode ||
            payload.missionCode || payload.mission ||
            payload.countryCode || payload.country ||
            payload.applicants || payload.applicant ||
            payload.firstName || payload.givenName || payload.first_name ||
            payload.passportNumber || payload.passport || payload.passportNo ||
            payload.fromDate || payload.toDate || payload.date ||
            payload.slotDate || payload.appointmentDate;

        if (hasBookingFields) {
            console.log('[VFS Ext] ✅ Booking payload captured from request:', url);

            // Extract applicant details
            let applicants = payload.applicants || [];
            let firstName = '', lastName = '', gender = '', dob = '', nationality = '', passportNum = '', passportExp = '';

            // If applicants array exists, extract from first applicant
            if (applicants.length > 0) {
                const app = applicants[0];
                firstName = app.firstName || app.givenName || app.first_name || '';
                lastName = app.lastName || app.surname || app.familyName || app.last_name || '';
                gender = app.gender || app.sex || '';
                dob = app.dateOfBirth || app.dob || app.birthDate || '';
                nationality = app.nationality || app.currentNationality || '';
                passportNum = app.passportNumber || app.passport || '';
                passportExp = app.passportExpiry || app.passportExpiryDate || app.expiryDate || '';
            }

            // Also check top-level payload for applicant details
            firstName = firstName || payload.firstName || payload.givenName || '';
            lastName = lastName || payload.lastName || payload.surname || payload.familyName || '';
            gender = gender || payload.gender || '';
            dob = dob || payload.dateOfBirth || payload.dob || '';
            nationality = nationality || payload.nationality || payload.currentNationality || '';
            passportNum = passportNum || payload.passportNumber || '';
            passportExp = passportExp || payload.passportExpiry || payload.passportExpiryDate || '';

            const capturedPayload = {
                countryCode: payload.countryCode || payload.country || '',
                missionCode: payload.missionCode || payload.mission || '',
                centerCode: payload.centerCode || payload.centreCode || payload.vacCode || '',
                visaCategory: payload.visaCategoryCode || payload.visaCategory || payload.categoryCode || '',
                loginUser: payload.loginUser || payload.email || lastEmail || '',
                urn: payload.urn || payload.URN || payload.applicationId || payload.refNo || '',
                languageCode: payload.languageCode || payload.language || 'en-US',
                date: payload.slotDate || payload.appointmentDate || payload.fromDate || payload.date || '',
                slotTime: payload.slotTime || payload.time || payload.slot || '',
                payCode: payload.payCode || payload.paymentCode || '',
                // Applicant details
                firstName: firstName,
                lastName: lastName,
                gender: gender,
                dateOfBirth: dob,
                nationality: nationality,
                passportNumber: passportNum,
                passportExpiry: passportExp,
                contactNumber: payload.contactNumber || payload.countactNumber || payload.phone || '',
                captchaVersion: payload.captcha_version || '',
                captchaKey: payload.captcha_api_key || '',
                applicants: applicants
            };

            chrome.runtime.sendMessage({
                type: 'PAYLOAD_CAPTURED',
                payload: capturedPayload
            });
        }
    } catch (e) {
        // Not JSON or parsing error
    }
}

// ── Enhanced fetch interceptor to capture payloads ──

function injectPayloadInterceptor() {
    const script = document.createElement('script');
    script.textContent = `
    (function() {
        // Intercept fetch to capture outgoing payloads
        const origFetch = window.fetch;
        window.fetch = async function(...args) {
            try {
                const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';
                const options = args[1] || {};

                // Capture ANY vfsglobal API call
                if ((url.includes('lift-api') || url.includes('vfsglobal') || url.includes('/api/')) && options.body) {
                    console.log('[VFS Ext] 🌐 Fetch intercepted:', url);
                    window.postMessage({
                        type: 'VFS_PAYLOAD_CAPTURED',
                        url: url,
                        body: options.body
                    }, '*');
                }
            } catch (e) {
                console.log('[VFS Ext] Fetch intercept error:', e.message);
            }

            return origFetch.apply(this, args);
        };

        // Intercept XHR to capture outgoing payloads
        const origXhrSend = XMLHttpRequest.prototype.send;
        XMLHttpRequest.prototype.send = function(body) {
            try {
                if (this._vfsUrl && (this._vfsUrl.includes('lift-api') || this._vfsUrl.includes('vfsglobal') || this._vfsUrl.includes('/api/')) && body) {
                    console.log('[VFS Ext] 🌐 XHR intercepted:', this._vfsUrl);
                    window.postMessage({
                        type: 'VFS_PAYLOAD_CAPTURED',
                        url: this._vfsUrl,
                        body: body
                    }, '*');
                }
            } catch (e) {
                console.log('[VFS Ext] XHR intercept error:', e.message);
            }
            return origXhrSend.apply(this, arguments);
        };

        console.log('[VFS Ext] ✅ Payload interceptor installed');
    })();
    `;
    document.documentElement.appendChild(script);
    script.remove();
}

// Listen for payload capture messages
window.addEventListener('message', (event) => {
    if (event.source !== window) return;

    if (event.data.type === 'VFS_PAYLOAD_CAPTURED') {
        capturePayloadFromRequest(event.data.url, event.data.body);
    }
});

// Inject the payload interceptor
injectPayloadInterceptor();
