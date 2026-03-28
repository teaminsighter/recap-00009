// ============================================================
//  VFS Slot Checker - Content Script
//  Runs on vfsglobal.com pages
// ============================================================

let lastRsaKey = null;
let lastEmail = null;

// ── Scan sessionStorage for RSA key + email ──

function scanSessionStorage() {
    try {
        for (const key of Object.keys(sessionStorage)) {
            const val = sessionStorage.getItem(key);
            if (!val) continue;

            // Find RSA key (contains MII which is RSA public key marker)
            if (val.includes('MII') && !lastRsaKey) {
                let rsaKey = val;
                try {
                    const parsed = JSON.parse(val);
                    if (typeof parsed === 'string' && parsed.includes('MII')) {
                        rsaKey = parsed;
                    }
                } catch (e) {}

                if (rsaKey.includes('MII') && rsaKey.length > 200) {
                    lastRsaKey = rsaKey;
                    console.log('[VFS Ext] RSA key found in sessionStorage');
                }
            }

            // Find email
            if (val.includes('@') && val.includes('.') && !lastEmail) {
                try {
                    const parsed = JSON.parse(val);
                    if (typeof parsed === 'string' && parsed.includes('@')) {
                        lastEmail = parsed;
                    }
                } catch (e) {
                    if (val.includes('@') && val.length < 100) {
                        lastEmail = val;
                    }
                }
            }
        }

        if (lastRsaKey) {
            chrome.runtime.sendMessage({
                type: 'RSA_KEY_FOUND',
                key: lastRsaKey,
                email: lastEmail
            });
        }
    } catch (e) {}
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

// ── Run ──

injectInterceptor();

// Scan periodically (session storage gets populated after login)
scanSessionStorage();
setInterval(scanSessionStorage, 3000);

// Also try to get email from page after a delay
setTimeout(extractEmailFromPage, 5000);
setTimeout(extractEmailFromPage, 15000);
