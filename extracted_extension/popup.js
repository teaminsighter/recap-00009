// ============================================================
//  VFS Slot Checker - Popup Script
// ============================================================

const $ = (id) => document.getElementById(id);

const statusDot = $('statusDot');
const statusText = $('statusText');
const statusEmail = $('statusEmail');
const btnSlots = $('btnSlots');
const autoToggle = $('autoToggle');
const intervalInput = $('intervalInput');
const resultBox = $('resultBox');
const lastCheck = $('lastCheck');
const slotsAlert = $('slotsAlert');
const tokenCS = $('tokenCS');
const tokenAuth = $('tokenAuth');
const tokenRoute = $('tokenRoute');
const tokenClientSource = $('tokenClientSource');
const copiedToast = $('copiedToast');
const btnRefreshToken = $('btnRefreshToken');
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
            if (statusDot) statusDot.className = 'status-dot green';
            if (statusText) statusText.textContent = 'Ready';
            if (btnSlots) btnSlots.disabled = false;
            // Auto-populate tokens when ready
            if (state.route && tokenRoute) tokenRoute.value = state.route;
            // Show auth token preview
            if (state.authPreview && tokenAuth) tokenAuth.value = state.authPreview;
        } else if (state.hasRsaKey || state.hasAuth) {
            if (statusDot) statusDot.className = 'status-dot yellow';
            if (statusText) statusText.textContent = 'Partially captured - keep browsing VFS';
            if (btnSlots) btnSlots.disabled = true;
            // Still show what we have
            if (state.route && tokenRoute) tokenRoute.value = state.route;
            if (state.authPreview && tokenAuth) tokenAuth.value = state.authPreview;
        } else {
            if (statusDot) statusDot.className = 'status-dot red';
            if (statusText) statusText.textContent = 'Not connected - login to VFS first';
            if (btnSlots) btnSlots.disabled = true;
        }

        // Details
        let details = [];
        if (state.email) details.push(state.email);
        if (state.route) details.push('Route: ' + state.route);
        if (statusEmail) statusEmail.textContent = details.join(' | ');

        // Auto-check
        if (autoToggle) autoToggle.checked = state.autoCheck;
        if (intervalInput) intervalInput.value = state.interval;

        // Last result
        if (state.lastCheck && lastCheck) {
            const time = new Date(state.lastCheck).toLocaleTimeString();
            lastCheck.textContent = 'Last check: ' + time;
        }

        if (state.lastResult) {
            showResult(state.lastResult, state.slotsFound);
        }

        // Slots alert
        if (slotsAlert) {
            if (state.slotsFound) {
                slotsAlert.classList.add('visible');
            } else {
                slotsAlert.classList.remove('visible');
            }
        }
    });
}

function showResult(data, hasSlots) {
    if (!resultBox) return;
    resultBox.classList.add('visible');
    resultBox.classList.remove('slots-found', 'error');

    if (hasSlots) {
        resultBox.classList.add('slots-found');
    }

    resultBox.textContent = JSON.stringify(data, null, 2);
}

function showError(msg) {
    if (!resultBox) return;
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

if (btnSlots) btnSlots.addEventListener('click', () => {
    setLoading(btnSlots, true);

    // Show calendar section
    const calendarSection = $('calendarSection');
    if (calendarSection) calendarSection.classList.add('visible');

    // Render calendar immediately
    renderCalendar();

    chrome.runtime.sendMessage({ type: 'CHECK_SLOTS' }, (result) => {
        setLoading(btnSlots, false);

        if (result?.error) {
            showError(result.error);
            // Still load calendar for manual date selection
            loadCalendar();
            return;
        }

        // Show full response as JSON
        const fullResponse = {
            action: 'checkSlots',
            hasSlots: result.hasSlots,
            status: result.status,
            timestamp: new Date().toISOString(),
            data: result.data
        };
        showResult(fullResponse, result.hasSlots);
        if (lastCheck) lastCheck.textContent = 'Last check: ' + new Date().toLocaleTimeString();

        if (result.hasSlots && slotsAlert) {
            slotsAlert.classList.add('visible');
        } else if (slotsAlert) {
            slotsAlert.classList.remove('visible');
        }

        // Always load calendar to show available dates
        loadCalendar();
    });
});

// ── Auto-Check Toggle ──

if (autoToggle) autoToggle.addEventListener('change', () => {
    chrome.runtime.sendMessage({
        type: 'SET_AUTO_CHECK',
        enabled: autoToggle.checked,
        interval: parseInt(intervalInput.value) || 30
    });
});

if (intervalInput) intervalInput.addEventListener('change', () => {
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

        if (tokenCS) tokenCS.value = result.clientsource || '';
        if (tokenAuth) tokenAuth.value = result.authorize || '';
        if (tokenRoute) tokenRoute.value = result.route || '';
        if (tokenClientSource) tokenClientSource.value = result.clientsource || '';

        // Log for debugging
        console.log('[VFS Popup] Generated tokens:', {
            clientsource: result.clientsource?.substring(0, 50) + '...',
            authorize: result.authorize?.substring(0, 30) + '...',
            route: result.route
        });
    });
}

if (btnRefreshToken) btnRefreshToken.addEventListener('click', () => {
    fetchAndShowTokens();
});

// Show Full State button
safeAddListener('btnShowState', 'click', () => {
    chrome.runtime.sendMessage({ type: 'GET_STATE' }, (state) => {
        if (!state) {
            showError('Could not get state');
            return;
        }

        // Build full state JSON with all details
        const fullState = {
            connectionStatus: state.ready ? 'READY' : (state.hasRsaKey || state.hasAuth ? 'PARTIAL' : 'NOT_CONNECTED'),
            credentials: {
                ready: state.ready,
                hasRsaKey: state.hasRsaKey,
                hasCryptoKey: state.hasCryptoKey,
                hasAuth: state.hasAuth,
                rsaKeyLength: state.rsaKeyLength,
                authPreview: state.authPreview
            },
            user: {
                email: state.email,
                route: state.route
            },
            settings: {
                autoCheck: state.autoCheck,
                interval: state.interval + 's'
            },
            lastActivity: {
                lastCheck: state.lastCheck,
                slotsFound: state.slotsFound
            },
            capturedPayload: state.capturedPayload,
            lastResult: state.lastResult
        };

        showResult(fullState, state.ready);
    });
});


// Copy button functionality
function showCopiedToast() {
    if (copiedToast) {
        copiedToast.classList.add('visible');
        setTimeout(() => copiedToast.classList.remove('visible'), 1500);
    }
}

// Show success/error toast
function showStatusToast(success, message) {
    const toast = $('statusToast');
    if (!toast) return;

    const icon = toast.querySelector('.toast-icon');
    const msg = toast.querySelector('.toast-message');

    if (icon) icon.textContent = success ? '✅' : '❌';
    if (msg) msg.textContent = message;

    toast.classList.remove('success', 'error');
    toast.classList.add(success ? 'success' : 'error');
    toast.classList.add('visible');

    setTimeout(() => toast.classList.remove('visible'), success ? 2500 : 3500);
}

document.querySelectorAll('.copy-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const targetId = btn.dataset.copy;
        const targetEl = $(targetId);
        if (targetEl && targetEl.value) {
            navigator.clipboard.writeText(targetEl.value).then(() => {
                btn.classList.add('copied');
                showCopiedToast();
                setTimeout(() => btn.classList.remove('copied'), 1500);
            });
        }
    });
});

// ── Payload Configuration ──

function getPayloadParams() {
    // Parse applicants JSON if present, or build from form fields
    let applicants = [];
    try {
        const appStr = $('plApplicants')?.value?.trim();
        if (appStr && appStr !== '[{"name": "...", "passport": "..."}]') {
            applicants = JSON.parse(appStr);
        }
    } catch (e) {}

    // If no applicants JSON, build from individual fields
    if (applicants.length === 0) {
        const firstName = $('plFirstName')?.value?.trim() || '';
        const lastName = $('plLastName')?.value?.trim() || '';
        if (firstName || lastName) {
            applicants = [{
                firstName: firstName,
                lastName: lastName,
                gender: $('plGender')?.value || '',
                dateOfBirth: $('plDob')?.value?.trim() || '',
                nationality: $('plNationality')?.value?.trim() || '',
                passportNumber: $('plPassportNumber')?.value?.trim() || '',
                passportExpiry: $('plPassportExpiry')?.value?.trim() || '',
                contactNumber: $('plContactNumber')?.value?.trim() || '',
                email: $('plLoginUser')?.value?.trim() || ''
            }];
        }
    }

    return {
        countryCode: $('plCountry')?.value?.trim() || 'bgd',
        missionCode: $('plMission')?.value?.trim() || '',
        centerCode: $('plCenter')?.value?.trim() || 'DAC',
        visaCategory: $('plVisaCategory')?.value?.trim() || '',
        loginUser: $('plLoginUser')?.value?.trim() || '',
        urn: $('plUrn')?.value?.trim() || '',
        languageCode: $('plLanguage')?.value?.trim() || 'en-US',
        date: $('plDate')?.value?.trim() || '',
        slotTime: $('plSlotTime')?.value?.trim() || '',
        payCode: $('plPayCode')?.value?.trim() || '',
        // Applicant details
        firstName: $('plFirstName')?.value?.trim() || '',
        lastName: $('plLastName')?.value?.trim() || '',
        gender: $('plGender')?.value || '',
        dateOfBirth: $('plDob')?.value?.trim() || '',
        nationality: $('plNationality')?.value?.trim() || '',
        passportNumber: $('plPassportNumber')?.value?.trim() || '',
        passportExpiry: $('plPassportExpiry')?.value?.trim() || '',
        contactNumber: $('plContactNumber')?.value?.trim() || '',
        otp: $('plOtp')?.value?.trim() || '',
        captchaVersion: $('plCaptchaVersion')?.value?.trim() || '',
        captchaKey: $('plCaptchaKey')?.value?.trim() || '',
        applicants: applicants
    };
}

// Alias for backward compatibility with sendQuickAction
function getQaParams() {
    const p = getPayloadParams();
    return {
        urn: p.urn,
        centerCode: p.centerCode,
        visaCategory: p.visaCategory,
        date: p.date,
        slotTime: p.slotTime,
        otp: p.otp,
        countryCode: p.countryCode,
        missionCode: p.missionCode,
        loginUser: p.loginUser,
        languageCode: p.languageCode,
        payCode: p.payCode,
        contactNumber: p.contactNumber,
        passportNumber: p.passportNumber,
        captchaVersion: p.captchaVersion,
        captchaKey: p.captchaKey,
        applicants: p.applicants
    };
}

function savePayloadParams() {
    const params = getPayloadParams();
    chrome.storage.local.set({ payloadParams: params });

    // Show saved feedback
    const indicator = $('captureIndicator');
    if (indicator) {
        indicator.classList.add('captured');
        setTimeout(() => indicator.classList.remove('captured'), 1500);
    }
}

function loadPayloadParams() {
    chrome.storage.local.get(['payloadParams'], (res) => {
        if (res.payloadParams) {
            const p = res.payloadParams;
            if (p.countryCode && $('plCountry')) $('plCountry').value = p.countryCode;
            if (p.missionCode && $('plMission')) $('plMission').value = p.missionCode;
            if (p.centerCode && $('plCenter')) $('plCenter').value = p.centerCode;
            if (p.visaCategory && $('plVisaCategory')) $('plVisaCategory').value = p.visaCategory;
            if (p.loginUser && $('plLoginUser')) $('plLoginUser').value = p.loginUser;
            if (p.urn && $('plUrn')) $('plUrn').value = p.urn;
            if (p.languageCode && $('plLanguage')) $('plLanguage').value = p.languageCode;
            if (p.date && $('plDate')) $('plDate').value = p.date;
            if (p.slotTime && $('plSlotTime')) $('plSlotTime').value = p.slotTime;
            if (p.payCode && $('plPayCode')) $('plPayCode').value = p.payCode;
            // Applicant details
            if (p.firstName && $('plFirstName')) $('plFirstName').value = p.firstName;
            if (p.lastName && $('plLastName')) $('plLastName').value = p.lastName;
            if (p.gender && $('plGender')) $('plGender').value = p.gender;
            if (p.dateOfBirth && $('plDob')) $('plDob').value = p.dateOfBirth;
            if (p.nationality && $('plNationality')) $('plNationality').value = p.nationality;
            if (p.passportNumber && $('plPassportNumber')) $('plPassportNumber').value = p.passportNumber;
            if (p.passportExpiry && $('plPassportExpiry')) $('plPassportExpiry').value = p.passportExpiry;
            if (p.contactNumber && $('plContactNumber')) $('plContactNumber').value = p.contactNumber;
            if (p.captchaVersion && $('plCaptchaVersion')) $('plCaptchaVersion').value = p.captchaVersion;
            if (p.captchaKey && $('plCaptchaKey')) $('plCaptchaKey').value = p.captchaKey;
            if (p.applicants && p.applicants.length > 0 && $('plApplicants')) {
                $('plApplicants').value = JSON.stringify(p.applicants, null, 2);
            }
        }
    });
}

// Legacy aliases
function saveQaParams() { savePayloadParams(); }
function loadQaParams() { loadPayloadParams(); }

// ── Payload Fields Toggle (collapsible) ──

const payloadFieldsToggle = $('payloadFieldsToggle');
const payloadBody = $('payloadBody');

if (payloadFieldsToggle) {
    payloadFieldsToggle.addEventListener('click', () => {
        payloadFieldsToggle.classList.toggle('expanded');
        if (payloadBody) payloadBody.classList.toggle('visible');
    });
}

// ── JSON Editor Toggle ──

const btnJsonToggle = $('btnJsonToggle');
const jsonEditor = $('jsonEditor');
const payloadJson = $('payloadJson');

if (btnJsonToggle) {
    btnJsonToggle.addEventListener('click', () => {
        if (jsonEditor) jsonEditor.classList.toggle('visible');

        // Auto-populate JSON when opening
        if (jsonEditor?.classList.contains('visible')) {
            fieldsToJson();
            btnJsonToggle.textContent = 'Close';
        } else {
            btnJsonToggle.textContent = 'JSON';
        }
    });
}

// Fields → JSON
function fieldsToJson() {
    const params = getPayloadParams();
    const payload = {
        countryCode: params.countryCode,
        missionCode: params.missionCode,
        centerCode: params.centerCode,
        visaCategoryCode: params.visaCategory,
        loginUser: params.loginUser,
        urn: params.urn,
        languageCode: params.languageCode,
        slotDate: params.date,
        slotTime: params.slotTime,
        payCode: params.payCode,
        contactNumber: params.contactNumber,
        OTP: params.otp,
        captcha_version: params.captchaVersion,
        captcha_api_key: params.captchaKey,
        applicants: params.applicants.length > 0 ? params.applicants : [{
            firstName: params.firstName,
            lastName: params.lastName,
            gender: params.gender,
            dateOfBirth: params.dateOfBirth,
            nationality: params.nationality,
            passportNumber: params.passportNumber,
            passportExpiry: params.passportExpiry,
            contactNumber: params.contactNumber,
            email: params.loginUser
        }]
    };
    if (payloadJson) {
        payloadJson.value = JSON.stringify(payload, null, 2);
    }
}

// JSON → Fields
function jsonToFields() {
    if (!payloadJson) return;

    try {
        const payload = JSON.parse(payloadJson.value);

        if (payload.countryCode && $('plCountry')) $('plCountry').value = payload.countryCode;
        if (payload.missionCode && $('plMission')) $('plMission').value = payload.missionCode;
        if (payload.centerCode && $('plCenter')) $('plCenter').value = payload.centerCode;
        if ((payload.visaCategoryCode || payload.visaCategory) && $('plVisaCategory')) {
            $('plVisaCategory').value = payload.visaCategoryCode || payload.visaCategory;
        }
        if (payload.loginUser && $('plLoginUser')) $('plLoginUser').value = payload.loginUser;
        if (payload.urn && $('plUrn')) $('plUrn').value = payload.urn;
        if (payload.languageCode && $('plLanguage')) $('plLanguage').value = payload.languageCode;
        if ((payload.slotDate || payload.appointmentDate || payload.date || payload.fromDate) && $('plDate')) {
            $('plDate').value = payload.slotDate || payload.appointmentDate || payload.date || payload.fromDate;
        }
        if (payload.slotTime && $('plSlotTime')) $('plSlotTime').value = payload.slotTime;
        if (payload.payCode && $('plPayCode')) $('plPayCode').value = payload.payCode;
        if ((payload.contactNumber || payload.countactNumber) && $('plContactNumber')) {
            $('plContactNumber').value = payload.contactNumber || payload.countactNumber;
        }
        if ((payload.OTP || payload.otp) && $('plOtp')) $('plOtp').value = payload.OTP || payload.otp;
        if ((payload.captcha_version || payload.captchaVersion) && $('plCaptchaVersion')) {
            $('plCaptchaVersion').value = payload.captcha_version || payload.captchaVersion;
        }
        if ((payload.captcha_api_key || payload.captchaKey) && $('plCaptchaKey')) {
            $('plCaptchaKey').value = payload.captcha_api_key || payload.captchaKey;
        }

        // Extract applicant details from applicants array or top-level
        if (payload.applicants && payload.applicants.length > 0) {
            $('plApplicants').value = JSON.stringify(payload.applicants, null, 2);
            const app = payload.applicants[0];
            if (app.firstName && $('plFirstName')) $('plFirstName').value = app.firstName;
            if (app.lastName && $('plLastName')) $('plLastName').value = app.lastName;
            if (app.gender && $('plGender')) $('plGender').value = app.gender;
            if (app.dateOfBirth && $('plDob')) $('plDob').value = app.dateOfBirth;
            if (app.nationality && $('plNationality')) $('plNationality').value = app.nationality;
            if (app.passportNumber && $('plPassportNumber')) $('plPassportNumber').value = app.passportNumber;
            if (app.passportExpiry && $('plPassportExpiry')) $('plPassportExpiry').value = app.passportExpiry;
        }

        // Also check top-level for applicant fields
        if (payload.firstName && $('plFirstName')) $('plFirstName').value = payload.firstName;
        if (payload.lastName && $('plLastName')) $('plLastName').value = payload.lastName;
        if (payload.gender && $('plGender')) $('plGender').value = payload.gender;
        if (payload.dateOfBirth && $('plDob')) $('plDob').value = payload.dateOfBirth;
        if (payload.nationality && $('plNationality')) $('plNationality').value = payload.nationality;
        if (payload.passportNumber && $('plPassportNumber')) $('plPassportNumber').value = payload.passportNumber;
        if (payload.passportExpiry && $('plPassportExpiry')) $('plPassportExpiry').value = payload.passportExpiry;

        showCopiedToast(); // Reuse toast for feedback
    } catch (e) {
        showError('Invalid JSON: ' + e.message);
    }
}

safeAddListener('btnFieldsToJson', 'click', fieldsToJson);
safeAddListener('btnJsonToFields', 'click', jsonToFields);
safeAddListener('btnSavePayload', 'click', savePayloadParams);

// ── Auto-Capture from VFS page ──

safeAddListener('btnAutoCapture', 'click', () => {
    chrome.runtime.sendMessage({ type: 'GET_CAPTURED_PAYLOAD' }, (result) => {
        if (result?.error) {
            showError(result.error);
            return;
        }

        if (result?.payload) {
            const p = result.payload;
            if (p.countryCode && $('plCountry')) $('plCountry').value = p.countryCode;
            if (p.missionCode && $('plMission')) $('plMission').value = p.missionCode;
            if (p.centerCode && $('plCenter')) $('plCenter').value = p.centerCode;
            if (p.visaCategory && $('plVisaCategory')) $('plVisaCategory').value = p.visaCategory;
            if (p.loginUser && $('plLoginUser')) $('plLoginUser').value = p.loginUser;
            if (p.urn && $('plUrn')) $('plUrn').value = p.urn;
            if (p.languageCode && $('plLanguage')) $('plLanguage').value = p.languageCode;
            if (p.date && $('plDate')) $('plDate').value = p.date;
            if (p.slotTime && $('plSlotTime')) $('plSlotTime').value = p.slotTime;
            if (p.payCode && $('plPayCode')) $('plPayCode').value = p.payCode;
            // Applicant details
            if (p.firstName && $('plFirstName')) $('plFirstName').value = p.firstName;
            if (p.lastName && $('plLastName')) $('plLastName').value = p.lastName;
            if (p.gender && $('plGender')) $('plGender').value = p.gender;
            if (p.dateOfBirth && $('plDob')) $('plDob').value = p.dateOfBirth;
            if (p.nationality && $('plNationality')) $('plNationality').value = p.nationality;
            if (p.passportNumber && $('plPassportNumber')) $('plPassportNumber').value = p.passportNumber;
            if (p.passportExpiry && $('plPassportExpiry')) $('plPassportExpiry').value = p.passportExpiry;
            if (p.contactNumber && $('plContactNumber')) $('plContactNumber').value = p.contactNumber;
            if (p.captchaVersion && $('plCaptchaVersion')) $('plCaptchaVersion').value = p.captchaVersion;
            if (p.captchaKey && $('plCaptchaKey')) $('plCaptchaKey').value = p.captchaKey;
            if (p.applicants && p.applicants.length > 0 && $('plApplicants')) {
                $('plApplicants').value = JSON.stringify(p.applicants, null, 2);
                // Also fill individual fields from first applicant
                const app = p.applicants[0];
                if (app.firstName && $('plFirstName')) $('plFirstName').value = app.firstName;
                if (app.lastName && $('plLastName')) $('plLastName').value = app.lastName;
                if (app.gender && $('plGender')) $('plGender').value = app.gender;
                if (app.dateOfBirth && $('plDob')) $('plDob').value = app.dateOfBirth;
                if (app.nationality && $('plNationality')) $('plNationality').value = app.nationality;
                if (app.passportNumber && $('plPassportNumber')) $('plPassportNumber').value = app.passportNumber;
                if (app.passportExpiry && $('plPassportExpiry')) $('plPassportExpiry').value = app.passportExpiry;
            }

            // Mark as captured
            const indicator = $('captureIndicator');
            if (indicator) indicator.classList.add('captured');

            // Update JSON if visible
            if (jsonEditor?.classList.contains('visible')) {
                fieldsToJson();
            }

            savePayloadParams();
            showStatusToast(true, 'Payload captured!');
        } else {
            showError('No payload captured yet. Browse VFS booking page first.');
        }
    });
});

function sendQuickAction(action, btn) {
    const params = getQaParams();
    saveQaParams();

    if (!params.urn && action !== 'application') {
        showError('Enter a URN first');
        return;
    }
    if (action === 'verifyOtp' && !params.otp) {
        showError('Enter the OTP first');
        return;
    }
    if (action === 'timeslot' && !params.date) {
        showError('Enter a date first');
        return;
    }

    setLoading(btn, true);
    chrome.runtime.sendMessage({
        type: 'QUICK_ACTION',
        action,
        params
    }, (result) => {
        setLoading(btn, false);
        if (result?.error) {
            showError(result.error);
            showStatusToast(false, result.error);
            return;
        }

        // Show full JSON response with all details
        const fullResponse = {
            action: result.action,
            success: result.success,
            status: result.status,
            timestamp: result.timestamp,
            bookingId: result.bookingId || null,
            referenceNumber: result.referenceNumber || null,
            message: result.message || null,
            data: result.data,
            request: result.request
        };
        showResult(fullResponse, result.success);

        // Show success/error toast for OTP actions
        if (result.action === 'sendOtp' || result.action === 'verifyOtp') {
            showStatusToast(result.success, result.message);
        }

        // Update visual report for calendar and timeslot
        if (action === 'calendar') {
            showCalendarReport(result.data, params);
        } else if (action === 'timeslot') {
            showTimeSlotsReport(result.data, params);
        }
    });
}

// Helper to safely add event listeners
function safeAddListener(id, event, handler) {
    const el = $(id);
    if (el) el.addEventListener(event, handler);
}

safeAddListener('qaCalendar', 'click', function() { sendQuickAction('calendar', this); });
safeAddListener('qaTimeslot', 'click', function() { sendQuickAction('timeslot', this); });
safeAddListener('qaSendOtp', 'click', function() { sendQuickAction('sendOtp', this); });
safeAddListener('qaVerifyOtp', 'click', function() { sendQuickAction('verifyOtp', this); });
safeAddListener('qaFees', 'click', function() { sendQuickAction('fees', this); });
safeAddListener('qaAppInfo', 'click', function() { sendQuickAction('application', this); });

// Book button handler
safeAddListener('qaBook', 'click', function() {
    const params = getQaParams();

    // Validate required fields
    if (!params.urn) {
        showError('URN is required for booking');
        return;
    }
    if (!params.date) {
        showError('Please select a date first');
        return;
    }
    if (!params.slotTime) {
        showError('Please select a time slot first');
        return;
    }

    // Confirm booking
    const confirmMsg = `Confirm booking:\n\nDate: ${params.date}\nTime: ${params.slotTime}\nCenter: ${params.centerCode || 'DAC'}\n\nProceed with booking?`;
    if (!confirm(confirmMsg)) return;

    setLoading(this, true);
    chrome.runtime.sendMessage({
        type: 'QUICK_ACTION',
        action: 'book',
        params
    }, (result) => {
        setLoading($('qaBook'), false);

        if (result?.error) {
            showError(result.error);
            showBookingConfirmation(false, { data: { error: result.error } }, params);
            return;
        }

        // Show full JSON response with booking ID
        const fullResponse = {
            action: 'book',
            success: result.success,
            status: result.status,
            timestamp: result.timestamp,
            bookingId: result.bookingId,
            referenceNumber: result.referenceNumber,
            message: result.message,
            data: result.data,
            request: result.request
        };
        showResult(fullResponse, result.success);
        showBookingConfirmation(result.success, result, params);
    });
});

// Save payload params on input change
['plCountry', 'plMission', 'plCenter', 'plVisaCategory', 'plLoginUser', 'plUrn', 'plLanguage', 'plDate', 'plSlotTime', 'plPayCode', 'plFirstName', 'plLastName', 'plGender', 'plDob', 'plNationality', 'plPassportNumber', 'plPassportExpiry', 'plContactNumber', 'plOtp', 'plCaptchaVersion', 'plCaptchaKey', 'plApplicants'].forEach(id => {
    safeAddListener(id, 'change', savePayloadParams);
});

// ── Custom API Call ──

if (btnCustom) btnCustom.addEventListener('click', () => {
    customCallBox.classList.toggle('visible');
});

if (btnCallSend) btnCallSend.addEventListener('click', () => {
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

if (btnReset) btnReset.addEventListener('click', () => {
    if (confirm('Reset all captured data? You will need to login to VFS again.')) {
        chrome.runtime.sendMessage({ type: 'RESET' }, () => {
            resultBox.classList.remove('visible');
            slotsAlert.classList.remove('visible');
            lastCheck.textContent = '';
            refreshState();
        });
    }
});

// ============================================================
//  Visual Calendar & Time Slots
// ============================================================

const calendarDays = $('calendarDays');
const calMonthYear = $('calMonthYear');
const calendarLoading = $('calendarLoading');
const calendarStatus = $('calendarStatus');
const timeslotsSection = $('timeslotsSection');
const timeslotsGrid = $('timeslotsGrid');
const timeslotsDate = $('timeslotsDate');
const timeslotsLoading = $('timeslotsLoading');
const timeslotsEmpty = $('timeslotsEmpty');
const selectedSlotInfo = $('selectedSlotInfo');
const selectedSlotText = $('selectedSlotText');

// Calendar state
let calendarState = {
    currentMonth: new Date().getMonth(),
    currentYear: new Date().getFullYear(),
    availableDates: [],       // Array of available date strings "DD/MM/YYYY"
    selectedDate: null,       // Selected date string
    selectedTime: null,       // Selected time string
    availableSlots: []        // Available time slots for selected date
};

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
                     'July', 'August', 'September', 'October', 'November', 'December'];

// ── Render Calendar Grid ──

function renderCalendar() {
    if (!calendarDays || !calMonthYear) return;

    const year = calendarState.currentYear;
    const month = calendarState.currentMonth;

    calMonthYear.textContent = `${MONTH_NAMES[month]} ${year}`;

    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const today = new Date();

    let html = '';

    // Empty cells before first day
    for (let i = 0; i < firstDay; i++) {
        html += '<div class="calendar-day empty"></div>';
    }

    // Days of the month
    for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = formatDateDMY(day, month + 1, year);
        const isAvailable = calendarState.availableDates.includes(dateStr);
        const isSelected = calendarState.selectedDate === dateStr;
        const isToday = (day === today.getDate() && month === today.getMonth() && year === today.getFullYear());

        let classes = ['calendar-day', 'current-month'];
        if (isAvailable) classes.push('available');
        if (isSelected) classes.push('selected');
        if (isToday) classes.push('today');

        html += `<div class="${classes.join(' ')}" data-date="${dateStr}" data-day="${day}">${day}</div>`;
    }

    calendarDays.innerHTML = html;

    // Add click handlers to ALL days (not just available ones)
    calendarDays.querySelectorAll('.calendar-day.current-month').forEach(el => {
        el.style.cursor = 'pointer';
        el.addEventListener('click', () => {
            const date = el.dataset.date;
            selectDate(date);
        });
    });
}

function formatDateDMY(day, month, year) {
    return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`;
}

function parseDateDMY(dateStr) {
    const parts = dateStr.split('/');
    return {
        day: parseInt(parts[0]),
        month: parseInt(parts[1]),
        year: parseInt(parts[2])
    };
}

// ── Load Available Dates from API ──

function loadCalendar() {
    if (!calendarLoading || !calendarStatus) return;

    const centerCode = $('plCenter')?.value?.trim() || 'DAC';
    const visaCat = $('plVisaCategory')?.value?.trim() || '';
    const urn = $('plUrn')?.value?.trim() || '';

    calendarLoading.style.display = 'block';
    calendarStatus.textContent = '';
    calendarStatus.className = 'calendar-status';

    // Format the fromDate as DD/MM/YYYY
    const fromDate = formatDateDMY(1, calendarState.currentMonth + 1, calendarState.currentYear);

    chrome.runtime.sendMessage({
        type: 'QUICK_ACTION',
        action: 'calendar',
        params: {
            centerCode: centerCode,
            visaCategory: visaCat,
            urn: urn,
            date: fromDate
        }
    }, (result) => {
        calendarLoading.style.display = 'none';

        if (result?.error) {
            calendarStatus.textContent = 'Error: ' + result.error;
            calendarStatus.className = 'calendar-status error';
            return;
        }

        // Parse available dates from response
        parseAvailableDates(result.data);
        renderCalendar();

        if (calendarState.availableDates.length > 0) {
            calendarStatus.textContent = `${calendarState.availableDates.length} dates available`;
            calendarStatus.className = 'calendar-status success';
        } else {
            calendarStatus.textContent = 'No slots available this month';
            calendarStatus.className = 'calendar-status';
        }
    });
}

function parseAvailableDates(data) {
    calendarState.availableDates = [];

    if (!data) return;

    // Handle different response formats
    let dates = [];

    if (Array.isArray(data)) {
        dates = data;
    } else if (data.data && Array.isArray(data.data)) {
        dates = data.data;
    } else if (data.dates && Array.isArray(data.dates)) {
        dates = data.dates;
    } else if (data.availableDates && Array.isArray(data.availableDates)) {
        dates = data.availableDates;
    } else if (typeof data === 'object') {
        // Try to extract dates from nested structure
        for (const key of Object.keys(data)) {
            if (Array.isArray(data[key])) {
                dates = data[key];
                break;
            }
        }
    }

    // Parse dates to DD/MM/YYYY format
    dates.forEach(date => {
        if (typeof date === 'string') {
            // Already in DD/MM/YYYY
            if (/^\d{2}\/\d{2}\/\d{4}$/.test(date)) {
                calendarState.availableDates.push(date);
            }
            // YYYY-MM-DD format
            else if (/^\d{4}-\d{2}-\d{2}/.test(date)) {
                const parts = date.split('-');
                const formatted = `${parts[2].substring(0, 2)}/${parts[1]}/${parts[0]}`;
                calendarState.availableDates.push(formatted);
            }
        } else if (date && date.date) {
            calendarState.availableDates.push(date.date);
        }
    });
}

// ── Select Date & Load Time Slots ──

function selectDate(dateStr) {
    calendarState.selectedDate = dateStr;
    calendarState.selectedTime = null;
    renderCalendar();
    loadTimeSlots(dateStr);
}

function loadTimeSlots(dateStr) {
    if (!timeslotsSection || !timeslotsGrid) return;

    const centerCode = $('plCenter')?.value?.trim() || 'DAC';
    const visaCat = $('plVisaCategory')?.value?.trim() || '';
    const urn = $('plUrn')?.value?.trim() || '';

    timeslotsSection.classList.add('visible');
    if (timeslotsDate) timeslotsDate.textContent = dateStr;
    if (timeslotsLoading) timeslotsLoading.style.display = 'block';
    timeslotsGrid.innerHTML = '';
    if (timeslotsEmpty) timeslotsEmpty.style.display = 'none';
    if (selectedSlotInfo) selectedSlotInfo.classList.remove('visible');

    // Also update the date input field
    if ($('plDate')) $('plDate').value = dateStr;

    chrome.runtime.sendMessage({
        type: 'QUICK_ACTION',
        action: 'timeslot',
        params: {
            centerCode: centerCode,
            visaCategory: visaCat,
            urn: urn,
            date: dateStr
        }
    }, (result) => {
        timeslotsLoading.style.display = 'none';

        if (result?.error) {
            timeslotsEmpty.textContent = 'Error: ' + result.error;
            timeslotsEmpty.style.display = 'block';
            return;
        }

        // Parse time slots from response
        parseTimeSlots(result.data);
        renderTimeSlots();
    });
}

function parseTimeSlots(data) {
    calendarState.availableSlots = [];

    if (!data) return;

    let slots = [];

    if (Array.isArray(data)) {
        slots = data;
    } else if (data.data && Array.isArray(data.data)) {
        slots = data.data;
    } else if (data.slots && Array.isArray(data.slots)) {
        slots = data.slots;
    } else if (data.timeSlots && Array.isArray(data.timeSlots)) {
        slots = data.timeSlots;
    } else if (typeof data === 'object') {
        for (const key of Object.keys(data)) {
            if (Array.isArray(data[key])) {
                slots = data[key];
                break;
            }
        }
    }

    slots.forEach(slot => {
        if (typeof slot === 'string') {
            calendarState.availableSlots.push(slot);
        } else if (slot && (slot.time || slot.slotTime || slot.slot)) {
            calendarState.availableSlots.push(slot.time || slot.slotTime || slot.slot);
        }
    });
}

function renderTimeSlots() {
    if (!timeslotsGrid) return;

    if (calendarState.availableSlots.length === 0) {
        if (timeslotsEmpty) {
            timeslotsEmpty.textContent = 'No time slots available for this date';
            timeslotsEmpty.style.display = 'block';
        }
        timeslotsGrid.innerHTML = '';
        return;
    }

    if (timeslotsEmpty) timeslotsEmpty.style.display = 'none';

    let html = '';
    calendarState.availableSlots.forEach(time => {
        const isSelected = calendarState.selectedTime === time;
        html += `<button class="timeslot-btn ${isSelected ? 'selected' : ''}" data-time="${time}">${time}</button>`;
    });

    timeslotsGrid.innerHTML = html;

    // Add click handlers
    timeslotsGrid.querySelectorAll('.timeslot-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            selectTimeSlot(btn.dataset.time);
        });
    });
}

function selectTimeSlot(time) {
    calendarState.selectedTime = time;
    renderTimeSlots();

    if (selectedSlotText) selectedSlotText.textContent = `Selected: ${calendarState.selectedDate} at ${time}`;
    if (selectedSlotInfo) selectedSlotInfo.classList.add('visible');
}

// ── Calendar Navigation ──

const calPrevBtn = $('calPrev');
const calNextBtn = $('calNext');

if (calPrevBtn) {
    calPrevBtn.addEventListener('click', () => {
        calendarState.currentMonth--;
        if (calendarState.currentMonth < 0) {
            calendarState.currentMonth = 11;
            calendarState.currentYear--;
        }
        renderCalendar();
        loadCalendar();
    });
}

if (calNextBtn) {
    calNextBtn.addEventListener('click', () => {
        calendarState.currentMonth++;
        if (calendarState.currentMonth > 11) {
            calendarState.currentMonth = 0;
            calendarState.currentYear++;
        }
        renderCalendar();
        loadCalendar();
    });
}


// ── Proceed to Booking ──

const btnProceedBooking = $('btnProceedBooking');
if (btnProceedBooking) {
    btnProceedBooking.addEventListener('click', () => {
        if (!calendarState.selectedDate || !calendarState.selectedTime) {
            alert('Please select a date and time slot first');
            return;
        }

        // Update the Payload Configuration fields
        if ($('plDate')) $('plDate').value = calendarState.selectedDate;

        // Show a confirmation with the selected slot
        const msg = `Ready to book:\n\nDate: ${calendarState.selectedDate}\nTime: ${calendarState.selectedTime}\n\nNext steps:\n1. Click "Send OTP" to get verification code\n2. Enter OTP and click "Verify OTP"\n3. Complete booking on VFS website`;
        alert(msg);

        // Scroll to payload section
        const payloadSection = $('payloadSection');
        if (payloadSection) payloadSection.scrollIntoView({ behavior: 'smooth' });
    });
}

// ============================================================
//  Visual Report Functions
// ============================================================

const reportSection = $('reportSection');
const reportInfo = $('reportInfo');
const reportDates = $('reportDates');
const reportTimes = $('reportTimes');
const datesGrid = $('datesGrid');
const timesGrid = $('timesGrid');
const selectedDateLabel = $('selectedDateLabel');

// Close report button
safeAddListener('btnCloseReport', 'click', () => {
    if (reportSection) reportSection.classList.remove('visible');
});

// Day names for display
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function getDayName(dateStr) {
    // Parse date in format MM/DD/YYYY or DD/MM/YYYY
    let parts;
    if (dateStr.includes('/')) {
        parts = dateStr.split('/');
        // Assume DD/MM/YYYY
        const d = new Date(parts[2], parts[1] - 1, parts[0]);
        return DAY_NAMES[d.getDay()];
    }
    return '';
}

function showCalendarReport(data, params) {
    if (!reportSection || !datesGrid) return;

    // Show report section
    reportSection.classList.add('visible');
    if (reportDates) reportDates.classList.add('visible');
    if (reportTimes) reportTimes.classList.remove('visible');

    // Update info section
    if (reportInfo) {
        reportInfo.innerHTML = `
            <div class="info-row"><span class="info-label">URN:</span><span class="info-value">${params.urn || '-'}</span></div>
            <div class="info-row"><span class="info-label">Center:</span><span class="info-value">${params.centerCode || '-'}</span></div>
            <div class="info-row"><span class="info-label">Category:</span><span class="info-value">${params.visaCategory || '-'}</span></div>
        `;
    }

    // Parse dates from response
    let dates = [];
    if (data?.calendars && Array.isArray(data.calendars)) {
        dates = data.calendars;
    } else if (Array.isArray(data)) {
        dates = data;
    } else if (data?.data && Array.isArray(data.data)) {
        dates = data.data;
    }

    if (dates.length === 0) {
        datesGrid.innerHTML = '<div class="report-empty">No available dates found</div>';
        return;
    }

    // Render dates
    let html = '';
    dates.forEach(item => {
        const dateStr = typeof item === 'string' ? item : (item.date || '');
        if (!dateStr) return;

        // Convert MM/DD/YYYY to display format
        let displayDate = dateStr;
        let dayName = '';

        if (dateStr.includes('/')) {
            const parts = dateStr.split('/');
            // If format is MM/DD/YYYY, convert for display
            if (parts[0].length === 2 && parseInt(parts[0]) <= 12) {
                displayDate = `${parts[1]}/${parts[0]}`;
                const d = new Date(parts[2], parseInt(parts[0]) - 1, parseInt(parts[1]));
                dayName = DAY_NAMES[d.getDay()];
            } else {
                // DD/MM/YYYY format
                displayDate = `${parts[0]}/${parts[1]}`;
                const d = new Date(parts[2], parseInt(parts[1]) - 1, parseInt(parts[0]));
                dayName = DAY_NAMES[d.getDay()];
            }
        }

        html += `<div class="date-item" data-date="${dateStr}">${displayDate}<span class="day-name">${dayName}</span></div>`;
    });

    datesGrid.innerHTML = html;

    // Add click handlers to dates
    datesGrid.querySelectorAll('.date-item').forEach(el => {
        el.addEventListener('click', () => {
            // Update selection
            datesGrid.querySelectorAll('.date-item').forEach(d => d.classList.remove('selected'));
            el.classList.add('selected');

            // Update date field and load time slots
            const selectedDate = el.dataset.date;
            if ($('plDate')) $('plDate').value = selectedDate;

            // Trigger time slots load
            loadTimeSlotsForDate(selectedDate);
        });
    });
}

function showTimeSlotsReport(data, params) {
    if (!reportSection || !timesGrid) return;

    // Show report section
    reportSection.classList.add('visible');
    if (reportTimes) reportTimes.classList.add('visible');

    // Update selected date label
    if (selectedDateLabel) {
        selectedDateLabel.textContent = params.date ? `for ${params.date}` : '';
    }

    // Parse time slots from response
    let slots = [];
    if (data?.slots && Array.isArray(data.slots)) {
        slots = data.slots;
    } else if (Array.isArray(data)) {
        slots = data;
    } else if (data?.data && Array.isArray(data.data)) {
        slots = data.data;
    }

    if (slots.length === 0) {
        timesGrid.innerHTML = '<div class="report-empty">No time slots available</div>';
        return;
    }

    // Render time slots
    let html = '';
    slots.forEach(item => {
        const timeStr = typeof item === 'string' ? item : (item.slot || item.time || item.slotTime || '');
        const slotType = item.type || 'Normal';
        if (!timeStr) return;

        html += `<div class="time-item" data-time="${timeStr}">${timeStr}<span class="slot-type">${slotType}</span></div>`;
    });

    timesGrid.innerHTML = html;

    // Add click handlers to times
    timesGrid.querySelectorAll('.time-item').forEach(el => {
        el.addEventListener('click', () => {
            // Update selection
            timesGrid.querySelectorAll('.time-item').forEach(t => t.classList.remove('selected'));
            el.classList.add('selected');

            // Update time field
            const selectedTime = el.dataset.time;
            if ($('plSlotTime')) $('plSlotTime').value = selectedTime;
        });
    });
}

function loadTimeSlotsForDate(dateStr) {
    const params = getPayloadParams();
    params.date = dateStr;

    if (timesGrid) timesGrid.innerHTML = '<div class="report-loading">Loading time slots...</div>';
    if (reportTimes) reportTimes.classList.add('visible');

    chrome.runtime.sendMessage({
        type: 'QUICK_ACTION',
        action: 'timeslot',
        params
    }, (result) => {
        if (result?.error) {
            if (timesGrid) timesGrid.innerHTML = `<div class="report-empty">Error: ${result.error}</div>`;
            return;
        }
        showTimeSlotsReport(result.data, params);
    });
}

// ============================================================
//  Booking Confirmation UI
// ============================================================

const bookingConfirmation = $('bookingConfirmation');
const confirmIcon = $('confirmIcon');
const confirmTitle = $('confirmTitle');
const confirmStatus = $('confirmStatus');
const confirmBookingId = $('confirmBookingId');
const confirmRefNumber = $('confirmRefNumber');
const confirmDate = $('confirmDate');
const confirmTime = $('confirmTime');
const confirmCenter = $('confirmCenter');
const confirmApplicant = $('confirmApplicant');

function showBookingConfirmation(success, result, params) {
    if (!bookingConfirmation) return;

    const data = result?.data || {};

    // Extract booking details from response
    const bookingId = data.bookingId || data.confirmationNumber || data.appointmentId || data.id || '-';
    const refNumber = data.referenceNumber || data.refNumber || data.urn || params?.urn || '-';
    const status = success ? 'SUCCESS' : 'FAILED';
    const statusMsg = result?.message || (success ? 'Booking Confirmed!' : 'Booking Failed');

    // Update UI elements
    if (confirmIcon) confirmIcon.textContent = success ? '✅' : '❌';
    if (confirmTitle) confirmTitle.textContent = success ? 'Booking Successful!' : 'Booking Failed';
    if (confirmStatus) {
        confirmStatus.textContent = status;
        confirmStatus.className = 'confirm-value status-badge ' + (success ? 'success' : 'error');
    }
    if (confirmBookingId) confirmBookingId.textContent = bookingId;
    if (confirmRefNumber) confirmRefNumber.textContent = refNumber;
    if (confirmDate) confirmDate.textContent = params?.date || data.slotDate || data.appointmentDate || '-';
    if (confirmTime) confirmTime.textContent = params?.slotTime || data.slotTime || data.appointmentTime || '-';
    if (confirmCenter) confirmCenter.textContent = params?.centerCode || data.centerCode || '-';
    if (confirmApplicant) confirmApplicant.textContent = params?.loginUser || data.loginUser || '-';

    // Show/hide confirmation and set style
    bookingConfirmation.classList.remove('error');
    if (!success) bookingConfirmation.classList.add('error');
    bookingConfirmation.classList.add('visible');

    // Show toast as well
    showStatusToast(success, statusMsg);

    // Scroll to confirmation
    bookingConfirmation.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function hideBookingConfirmation() {
    if (bookingConfirmation) {
        bookingConfirmation.classList.remove('visible');
    }
}

function copyBookingDetails() {
    const details = [
        `Status: ${confirmStatus?.textContent || '-'}`,
        `Booking ID: ${confirmBookingId?.textContent || '-'}`,
        `Reference No.: ${confirmRefNumber?.textContent || '-'}`,
        `Date: ${confirmDate?.textContent || '-'}`,
        `Time: ${confirmTime?.textContent || '-'}`,
        `Center: ${confirmCenter?.textContent || '-'}`,
        `Applicant: ${confirmApplicant?.textContent || '-'}`,
        ``,
        `---`,
        `To verify: DevTools (F12) → Network → Fetch/XHR → "schedule" request → Response`
    ].join('\n');

    navigator.clipboard.writeText(details).then(() => {
        showCopiedToast();
    });
}

// Close and Copy button handlers
safeAddListener('btnCloseConfirm', 'click', hideBookingConfirmation);
safeAddListener('btnCopyConfirm', 'click', copyBookingDetails);

// ============================================================
//  Auto-Book Flow Handlers
// ============================================================

const autoBookToggle = $('autoBookToggle');
const autoBookPanel = $('autoBookPanel');
const autoBookProgress = $('autoBookProgress');
const autoBookSelected = $('autoBookSelected');
const autoBookOtp = $('autoBookOtp');
const autoBookStatus = $('autoBookStatus');
const autoOtpInput = $('autoOtpInput');
const btnCompleteBooking = $('btnCompleteBooking');

function updateAutoBookUI(abState) {
    if (!abState) return;

    // Update toggle
    if (autoBookToggle) autoBookToggle.checked = abState.autoBook;

    // Update progress steps
    if (autoBookProgress) {
        const steps = ['check', 'calendar', 'timeslot', 'otp', 'otp-wait', 'book'];
        const currentStep = abState.step;
        const currentIndex = steps.indexOf(currentStep);

        autoBookProgress.classList.toggle('visible', abState.autoBook && currentStep);

        autoBookProgress.querySelectorAll('.progress-step').forEach(el => {
            const step = el.dataset.step;
            const stepIndex = steps.indexOf(step);

            el.classList.remove('active', 'done', 'waiting', 'error');

            if (currentStep === 'error') {
                if (stepIndex <= currentIndex || step === currentStep) {
                    el.classList.add('error');
                }
            } else if (step === currentStep) {
                el.classList.add(step === 'otp-wait' ? 'waiting' : 'active');
            } else if (stepIndex < currentIndex) {
                el.classList.add('done');
            }
        });
    }

    // Update selected date/time display
    if (autoBookSelected && abState.data) {
        const hasSelection = abState.data.selectedDate || abState.data.selectedTime;
        autoBookSelected.classList.toggle('visible', hasSelection);
        if ($('autoSelectedDate')) $('autoSelectedDate').textContent = abState.data.selectedDate || '-';
        if ($('autoSelectedTime')) $('autoSelectedTime').textContent = abState.data.selectedTime || '-';
    }

    // Show OTP input when waiting
    if (autoBookOtp) {
        autoBookOtp.classList.toggle('visible', abState.step === 'otp-wait');
    }

    // Show status messages
    if (autoBookStatus && abState.data) {
        if (abState.step === 'done') {
            autoBookStatus.textContent = '✅ Booking successful! Check details below.';
            autoBookStatus.className = 'auto-book-status visible success';
        } else if (abState.step === 'error' || abState.data.error) {
            autoBookStatus.textContent = '❌ ' + (abState.data.error || 'An error occurred');
            autoBookStatus.className = 'auto-book-status visible error';
        } else if (abState.step === 'otp-wait') {
            autoBookStatus.textContent = '📱 OTP sent! Enter code above to complete booking.';
            autoBookStatus.className = 'auto-book-status visible info';
        } else {
            autoBookStatus.classList.remove('visible');
        }
    }
}

function refreshAutoBookState() {
    chrome.runtime.sendMessage({ type: 'GET_AUTO_BOOK_STATE' }, updateAutoBookUI);
}

// Auto-book toggle handler
if (autoBookToggle) {
    autoBookToggle.addEventListener('change', () => {
        chrome.runtime.sendMessage({
            type: 'SET_AUTO_BOOK',
            enabled: autoBookToggle.checked
        }, (res) => {
            if (res?.ok) {
                refreshAutoBookState();
                if (autoBookToggle.checked) {
                    showStatusToast(true, 'Auto-Book enabled! Will book automatically when slots found.');
                }
            }
        });
    });
}

// Start auto-book manually (for testing)
safeAddListener('btnSlots', 'click', () => {
    // Also check if auto-book should start
    setTimeout(() => {
        chrome.runtime.sendMessage({ type: 'GET_AUTO_BOOK_STATE' }, (abState) => {
            if (abState?.autoBook && !abState.step) {
                chrome.runtime.sendMessage({ type: 'GET_STATE' }, (state) => {
                    if (state?.slotsFound) {
                        chrome.runtime.sendMessage({ type: 'START_AUTO_BOOK' }, refreshAutoBookState);
                    }
                });
            }
        });
    }, 1000);
});

// Complete booking with OTP
if (btnCompleteBooking) {
    btnCompleteBooking.addEventListener('click', () => {
        const otp = autoOtpInput?.value?.trim();
        if (!otp || otp.length !== 6) {
            showError('Please enter 6-digit OTP');
            return;
        }

        setLoading(btnCompleteBooking, true);
        chrome.runtime.sendMessage({
            type: 'COMPLETE_AUTO_BOOK',
            otp: otp
        }, (result) => {
            setLoading(btnCompleteBooking, false);

            if (result?.error) {
                showError(result.error);
                showStatusToast(false, result.error);
            } else if (result?.success) {
                showStatusToast(true, 'Booking successful!');
                showResult(result.result, true);

                // Show booking confirmation
                if (result.result) {
                    const params = getPayloadParams();
                    params.date = result.result.request?.payload?.slotDate;
                    params.slotTime = result.result.request?.payload?.slotTime;
                    showBookingConfirmation(true, result.result, params);
                }
            }

            refreshAutoBookState();
        });
    });
}

// Auto-submit OTP on 6 digits
if (autoOtpInput) {
    autoOtpInput.addEventListener('input', () => {
        const val = autoOtpInput.value.replace(/\D/g, '').slice(0, 6);
        autoOtpInput.value = val;

        // Auto-submit when 6 digits entered
        if (val.length === 6 && btnCompleteBooking) {
            btnCompleteBooking.click();
        }
    });
}

// Reset auto-book
safeAddListener('btnReset', 'click', () => {
    chrome.runtime.sendMessage({ type: 'RESET_AUTO_BOOK' });
});

// ── Init ──

refreshState();
loadQaParams();
refreshAutoBookState();

// Refresh every 2 seconds while popup is open
setInterval(refreshState, 2000);
setInterval(refreshAutoBookState, 1000);
