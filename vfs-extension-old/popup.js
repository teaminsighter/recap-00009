// ============================================================
//  VFS Slot Checker - Popup Script
// ============================================================

const $ = (id) => document.getElementById(id);

const statusDot = $('statusDot');
const statusText = $('statusText');
const statusEmail = $('statusEmail');
const btnSlots = $('btnSlots');
const btnStatus = $('btnStatus');
const autoToggle = $('autoToggle');
const intervalInput = $('intervalInput');
const resultBox = $('resultBox');
const lastCheck = $('lastCheck');
const slotsAlert = $('slotsAlert');
const btnTokens = $('btnTokens');
const tokenBox = $('tokenBox');
const tokenCS = $('tokenCS');
const tokenAuth = $('tokenAuth');
const tokenRoute = $('tokenRoute');
const tokenEmail = $('tokenEmail');
const tokenTS = $('tokenTS');
const copiedMsg = $('copiedMsg');
const btnRefreshToken = $('btnRefreshToken');
const btnFetchWithToken = $('btnFetchWithToken');
const fetchResultLabel = $('fetchResultLabel');
const fetchResultBox = $('fetchResultBox');
const btnCustom = $('btnCustom');
const customCallBox = $('customCallBox');
const btnCallSend = $('btnCallSend');
const btnReset = $('btnReset');

// ── Load current state ──

function refreshState() {
    chrome.runtime.sendMessage({ type: 'GET_STATE' }, (state) => {
        if (!state) return;

        // Status indicator
        if (state.ready) {
            statusDot.className = 'status-dot green';
            statusText.textContent = 'Ready';
            btnSlots.disabled = false;
            btnStatus.disabled = false;
            btnTokens.disabled = false;
        } else if (state.hasRsaKey || state.hasAuth) {
            statusDot.className = 'status-dot yellow';
            statusText.textContent = 'Partially captured - keep browsing VFS';
            btnSlots.disabled = true;
            btnStatus.disabled = true;
            btnTokens.disabled = true;
        } else {
            statusDot.className = 'status-dot red';
            statusText.textContent = 'Not connected - login to VFS first';
            btnSlots.disabled = true;
            btnStatus.disabled = true;
            btnTokens.disabled = true;
        }

        // Details
        let details = [];
        if (state.email) details.push(state.email);
        if (state.route) details.push('Route: ' + state.route);
        statusEmail.textContent = details.join(' | ');

        // Auto-check
        autoToggle.checked = state.autoCheck;
        intervalInput.value = state.interval;

        // Last result
        if (state.lastCheck) {
            const time = new Date(state.lastCheck).toLocaleTimeString();
            lastCheck.textContent = 'Last check: ' + time;
        }

        if (state.lastResult) {
            showResult(state.lastResult, state.slotsFound);
        }

        // Slots alert
        if (state.slotsFound) {
            slotsAlert.classList.add('visible');
        } else {
            slotsAlert.classList.remove('visible');
        }
    });
}

function showResult(data, hasSlots) {
    resultBox.classList.add('visible');
    resultBox.classList.remove('slots-found', 'error');

    if (hasSlots) {
        resultBox.classList.add('slots-found');
    }

    resultBox.textContent = JSON.stringify(data, null, 2);
}

function showError(msg) {
    resultBox.classList.add('visible', 'error');
    resultBox.classList.remove('slots-found');
    resultBox.textContent = 'Error: ' + msg;
}

function setLoading(btn, loading) {
    if (loading) {
        btn._origText = btn.textContent;
        btn.textContent = 'Loading...';
        btn.disabled = true;
    } else {
        btn.textContent = btn._origText || btn.textContent;
        btn.disabled = false;
    }
}

// ── Check Slots ──

btnSlots.addEventListener('click', () => {
    setLoading(btnSlots, true);
    chrome.runtime.sendMessage({ type: 'CHECK_SLOTS' }, (result) => {
        setLoading(btnSlots, false);

        if (result?.error) {
            showError(result.error);
            return;
        }

        showResult(result.data, result.hasSlots);
        lastCheck.textContent = 'Last check: ' + new Date().toLocaleTimeString();

        if (result.hasSlots) {
            slotsAlert.classList.add('visible');
        } else {
            slotsAlert.classList.remove('visible');
        }
    });
});

// ── Check Status ──

btnStatus.addEventListener('click', () => {
    setLoading(btnStatus, true);
    chrome.runtime.sendMessage({ type: 'CHECK_STATUS' }, (result) => {
        setLoading(btnStatus, false);

        if (result?.error) {
            showError(result.error);
            return;
        }

        showResult(result.data, false);
    });
});

// ── Auto-Check Toggle ──

autoToggle.addEventListener('change', () => {
    chrome.runtime.sendMessage({
        type: 'SET_AUTO_CHECK',
        enabled: autoToggle.checked,
        interval: parseInt(intervalInput.value) || 30
    });
});

intervalInput.addEventListener('change', () => {
    if (autoToggle.checked) {
        chrome.runtime.sendMessage({
            type: 'SET_AUTO_CHECK',
            enabled: true,
            interval: parseInt(intervalInput.value) || 30
        });
    }
});

// ── Show Tokens ──

function fetchAndShowTokens() {
    chrome.runtime.sendMessage({ type: 'GET_TOKENS' }, (result) => {
        if (result?.error) {
            showError(result.error);
            return;
        }

        tokenCS.textContent = result.clientsource;
        tokenAuth.textContent = result.authorize || 'not captured';
        tokenRoute.textContent = result.route || 'not captured';
        tokenEmail.textContent = result.email || 'not captured';
        tokenTS.textContent = result.timestamp;
        tokenBox.classList.add('visible');
    });
}

btnTokens.addEventListener('click', () => {
    if (tokenBox.classList.contains('visible')) {
        tokenBox.classList.remove('visible');
    } else {
        fetchAndShowTokens();
    }
});

btnRefreshToken.addEventListener('click', () => {
    fetchAndShowTokens();
});

// ── Fetch Slots with Fresh Token ──

btnFetchWithToken.addEventListener('click', () => {
    setLoading(btnFetchWithToken, true);
    fetchResultLabel.style.display = 'block';
    fetchResultBox.classList.add('visible');
    fetchResultBox.classList.remove('slots-found', 'error');
    fetchResultBox.textContent = 'Fetching...';

    chrome.runtime.sendMessage({ type: 'FETCH_WITH_TOKEN' }, (result) => {
        setLoading(btnFetchWithToken, false);

        if (result?.error) {
            fetchResultBox.classList.add('error');
            fetchResultBox.textContent = 'Error: ' + result.error;
            return;
        }

        // Update token display with the tokens that were actually used
        tokenCS.textContent = result.tokens.clientsource;
        tokenAuth.textContent = result.tokens.authorize || 'not captured';
        tokenRoute.textContent = result.tokens.route || 'not captured';
        tokenEmail.textContent = result.tokens.email || 'not captured';
        tokenTS.textContent = result.tokens.timestamp;

        // Show API response
        const hasSlots =
            (result.fetch.data?.data && Array.isArray(result.fetch.data.data) && result.fetch.data.data.length > 0) ||
            (result.fetch.data?.slots && Array.isArray(result.fetch.data.slots) && result.fetch.data.slots.length > 0) ||
            (result.fetch.data?.earliestDate);

        fetchResultBox.textContent =
            'HTTP ' + result.fetch.status + '\n\n' +
            JSON.stringify(result.fetch.data, null, 2);

        if (hasSlots) {
            fetchResultBox.classList.add('slots-found');
        }
        if (result.fetch.status >= 400) {
            fetchResultBox.classList.add('error');
        }
    });
});

// Click to copy any token value
function copyTokenValue(el) {
    const text = el.textContent || el.innerText;
    if (!text || text === 'not captured') return;
    navigator.clipboard.writeText(text).then(() => {
        copiedMsg.classList.add('visible');
        setTimeout(() => copiedMsg.classList.remove('visible'), 1500);
    });
}

tokenCS.addEventListener('click', () => copyTokenValue(tokenCS));
tokenAuth.addEventListener('click', () => copyTokenValue(tokenAuth));
tokenRoute.addEventListener('click', () => copyTokenValue(tokenRoute));
tokenEmail.addEventListener('click', () => copyTokenValue(tokenEmail));

// ── Custom API Call ──

btnCustom.addEventListener('click', () => {
    customCallBox.classList.toggle('visible');
});

btnCallSend.addEventListener('click', () => {
    const method = $('callMethod').value;
    const endpoint = $('callEndpoint').value.trim();
    const bodyStr = $('callBody').value.trim();

    if (!endpoint) {
        showError('Enter an endpoint');
        return;
    }

    let body = null;
    if (bodyStr) {
        try {
            body = JSON.parse(bodyStr);
        } catch (e) {
            showError('Invalid JSON body');
            return;
        }
    }

    setLoading(btnCallSend, true);
    chrome.runtime.sendMessage({
        type: 'CUSTOM_CALL',
        method,
        endpoint,
        body
    }, (result) => {
        setLoading(btnCallSend, false);

        if (result?.error) {
            showError(result.error);
            return;
        }

        showResult(result.data, false);
    });
});

// ── Reset ──

btnReset.addEventListener('click', () => {
    if (confirm('Reset all captured data? You will need to login to VFS again.')) {
        chrome.runtime.sendMessage({ type: 'RESET' }, () => {
            resultBox.classList.remove('visible');
            slotsAlert.classList.remove('visible');
            lastCheck.textContent = '';
            refreshState();
        });
    }
});

// ── Init ──

refreshState();

// Refresh every 2 seconds while popup is open
setInterval(refreshState, 2000);
