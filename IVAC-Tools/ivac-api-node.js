#!/usr/bin/env node
/**
 * IVAC Direct API Client - Node.js Version
 *
 * This script calls IVAC API directly without browser/website
 * No CORS issues - works 100% reliably
 *
 * Usage:
 *   node ivac-api-node.js
 *
 * Or make executable:
 *   chmod +x ivac-api-node.js
 *   ./ivac-api-node.js
 */

const https = require('https');
const readline = require('readline');

// ════════════════════════════════════════════════════════════
//  CONFIGURATION
// ════════════════════════════════════════════════════════════
const CONFIG = {
    apiHost: 'api.ivacbd.com',
    apiBase: '/iams/api/v1',

    // Your credentials (edit these or enter when prompted)
    email: '',
    password: '',

    // Rapid fire settings
    rapidCount: 20,
    rapidDelay: 300, // ms

    // Schedule settings
    scheduledTime: '', // e.g., '09:00:00'
    scheduleOffset: 5, // seconds before
    scheduleInterval: 300, // ms between attempts
    scheduleDuration: 120 // seconds to keep trying
};

// ════════════════════════════════════════════════════════════
//  STATE
// ════════════════════════════════════════════════════════════
let state = {
    authToken: '',
    refreshToken: '',
    isRunning: false
};

// ════════════════════════════════════════════════════════════
//  COLORS FOR TERMINAL
// ════════════════════════════════════════════════════════════
const colors = {
    reset: '\x1b[0m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    white: '\x1b[37m',
    bold: '\x1b[1m'
};

function log(msg, color = 'white') {
    const time = new Date().toLocaleTimeString();
    console.log(`${colors[color]}[${time}] ${msg}${colors.reset}`);
}

function logSuccess(msg) { log(msg, 'green'); }
function logError(msg) { log(msg, 'red'); }
function logWarning(msg) { log(msg, 'yellow'); }
function logInfo(msg) { log(msg, 'cyan'); }

// ════════════════════════════════════════════════════════════
//  API REQUEST FUNCTION
// ════════════════════════════════════════════════════════════
function apiRequest(endpoint, body, method = 'POST') {
    return new Promise((resolve, reject) => {
        const postData = body ? JSON.stringify(body) : '';

        const options = {
            hostname: CONFIG.apiHost,
            port: 443,
            path: CONFIG.apiBase + endpoint,
            method: method,
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Origin': 'https://appointment.ivacbd.com',
                'Referer': 'https://appointment.ivacbd.com/',
                ...(body ? { 'Content-Length': Buffer.byteLength(postData) } : {}),
                ...(state.authToken ? { 'Authorization': `Bearer ${state.authToken}` } : {})
            }
        };

        const req = https.request(options, (res) => {
            let data = '';

            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    resolve({
                        ok: res.statusCode >= 200 && res.statusCode < 300,
                        status: res.statusCode,
                        data: json
                    });
                } catch (e) {
                    resolve({
                        ok: false,
                        status: res.statusCode,
                        data: { raw: data, error: 'Invalid JSON' }
                    });
                }
            });
        });

        req.on('error', (e) => {
            resolve({
                ok: false,
                status: 0,
                data: { error: e.message }
            });
        });

        req.setTimeout(10000, () => {
            req.destroy();
            resolve({
                ok: false,
                status: 0,
                data: { error: 'Request timeout' }
            });
        });

        if (postData) req.write(postData);
        req.end();
    });
}

// ════════════════════════════════════════════════════════════
//  LOGIN FUNCTION
// ════════════════════════════════════════════════════════════
async function doLogin(email, password) {
    logInfo(`Attempting login: ${email}`);

    const result = await apiRequest('/auth/signin', {
        email: email,
        password: password
    });

    if (result.ok && (result.data.token || result.data.accessToken)) {
        state.authToken = result.data.token || result.data.accessToken;
        state.refreshToken = result.data.refreshToken || '';

        logSuccess('═══════════════════════════════════════');
        logSuccess('       LOGIN SUCCESS!');
        logSuccess('═══════════════════════════════════════');
        logSuccess(`Token: ${state.authToken.substring(0, 50)}...`);

        // Play system bell
        process.stdout.write('\x07');

        return { success: true, data: result.data };
    } else if (result.status === 503) {
        logError(`API returned 503 - Service CLOSED`);
        return { success: false, error: '503', data: result.data };
    } else {
        logError(`Login failed: ${result.status} - ${result.data?.message || JSON.stringify(result.data)}`);
        return { success: false, error: result.status, data: result.data };
    }
}

// ════════════════════════════════════════════════════════════
//  CHECK API STATUS
// ════════════════════════════════════════════════════════════
async function checkAPIStatus() {
    logInfo('Checking API status...');

    const result = await apiRequest('/auth/signin', {
        email: '',
        password: ''
    });

    if (result.status === 503) {
        logError('API Status: CLOSED (503)');
        logError('Sign-in service is not available');
        return false;
    } else if (result.status === 400 || result.status === 401) {
        logSuccess('API Status: OPEN');
        logSuccess('Service is accepting requests!');
        return true;
    } else {
        logWarning(`API Status: ${result.status}`);
        console.log(result.data);
        return result.status !== 503;
    }
}

// ════════════════════════════════════════════════════════════
//  RAPID FIRE
// ════════════════════════════════════════════════════════════
async function rapidFire(email, password, count, delay) {
    logWarning(`Starting Rapid Fire: ${count} attempts, ${delay}ms delay`);
    logWarning('Press Ctrl+C to stop\n');

    state.isRunning = true;
    let stats = { attempts: 0, success: 0, failed: 0, errors503: 0 };

    for (let i = 0; i < count && state.isRunning; i++) {
        stats.attempts++;
        process.stdout.write(`\r${colors.cyan}Attempt ${stats.attempts}/${count}...${colors.reset}`);

        const result = await doLogin(email, password);

        if (result.success) {
            stats.success++;
            console.log('\n');
            logSuccess(`SUCCESS on attempt ${stats.attempts}!`);
            break;
        } else if (result.error === '503') {
            stats.errors503++;
        } else {
            stats.failed++;
        }

        if (i < count - 1 && state.isRunning) {
            await sleep(delay);
        }
    }

    state.isRunning = false;
    console.log('\n');
    logInfo('═══════════════════════════════════════');
    logInfo(`Rapid Fire Results:`);
    logInfo(`  Attempts: ${stats.attempts}`);
    logSuccess(`  Success:  ${stats.success}`);
    logError(`  Failed:   ${stats.failed}`);
    logWarning(`  503 Errors: ${stats.errors503}`);
    logInfo('═══════════════════════════════════════');

    return stats;
}

// ════════════════════════════════════════════════════════════
//  SCHEDULED LOGIN
// ════════════════════════════════════════════════════════════
async function scheduledLogin(email, password, timeStr, offset, interval, duration) {
    const [hours, minutes, seconds = 0] = timeStr.split(':').map(Number);
    const target = new Date();
    target.setHours(hours, minutes, seconds, 0);

    const now = new Date();
    if (target <= now) target.setDate(target.getDate() + 1);

    const startTime = new Date(target.getTime() - (offset * 1000));
    const waitTime = startTime - now;

    if (waitTime < 0) {
        logError('Target time already passed!');
        return;
    }

    logSuccess(`Scheduled for ${timeStr}`);
    logInfo(`Will start ${offset}s before target`);
    logInfo(`Will attempt every ${interval}ms for ${duration}s`);
    logWarning('Press Ctrl+C to cancel\n');

    state.isRunning = true;

    // Countdown
    const countdownInterval = setInterval(() => {
        if (!state.isRunning) {
            clearInterval(countdownInterval);
            return;
        }

        const remaining = Math.max(0, Math.floor((startTime - Date.now()) / 1000));
        const h = Math.floor(remaining / 3600);
        const m = Math.floor((remaining % 3600) / 60);
        const s = remaining % 60;

        process.stdout.write(`\r${colors.yellow}Time until start: ${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}${colors.reset}`);

        if (remaining <= 0) {
            clearInterval(countdownInterval);
        }
    }, 1000);

    // Wait until start time
    await sleep(waitTime);

    if (!state.isRunning) return;

    console.log('\n');
    logWarning('═══════════════════════════════════════');
    logWarning('       STARTING SCHEDULED LOGIN!');
    logWarning('═══════════════════════════════════════');

    // Play alert
    for (let i = 0; i < 3; i++) {
        process.stdout.write('\x07');
        await sleep(200);
    }

    const endTime = Date.now() + (duration * 1000);
    let attempts = 0;

    while (state.isRunning && Date.now() < endTime) {
        attempts++;
        process.stdout.write(`\r${colors.cyan}Attempt ${attempts}...${colors.reset}`);

        const result = await doLogin(email, password);

        if (result.success) {
            console.log('\n');
            logSuccess('═══════════════════════════════════════');
            logSuccess('    SCHEDULED LOGIN SUCCESS!');
            logSuccess('═══════════════════════════════════════');

            // Victory beeps
            for (let i = 0; i < 5; i++) {
                process.stdout.write('\x07');
                await sleep(100);
            }

            state.isRunning = false;
            return;
        }

        if (state.isRunning && Date.now() < endTime) {
            await sleep(interval);
        }
    }

    console.log('\n');
    logWarning(`Schedule completed after ${attempts} attempts`);
    state.isRunning = false;
}

// ════════════════════════════════════════════════════════════
//  UTILITY
// ════════════════════════════════════════════════════════════
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ════════════════════════════════════════════════════════════
//  INTERACTIVE MENU
// ════════════════════════════════════════════════════════════
async function prompt(question) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    return new Promise(resolve => {
        rl.question(question, answer => {
            rl.close();
            resolve(answer.trim());
        });
    });
}

async function promptPassword(question) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    // Note: This won't hide password in all terminals
    return new Promise(resolve => {
        rl.question(question, answer => {
            rl.close();
            resolve(answer.trim());
        });
    });
}

async function showMenu() {
    console.log('\n');
    console.log(colors.bold + colors.magenta + '═══════════════════════════════════════════════════' + colors.reset);
    console.log(colors.bold + colors.magenta + '          IVAC Direct API Client v1.0' + colors.reset);
    console.log(colors.bold + colors.magenta + '═══════════════════════════════════════════════════' + colors.reset);
    console.log(colors.cyan + '  No website needed - Direct API access!' + colors.reset);
    console.log('');
    console.log(colors.yellow + '  Current credentials:' + colors.reset);
    console.log(`    Email: ${CONFIG.email || '(not set)'}`);
    console.log(`    Password: ${CONFIG.password ? '******' : '(not set)'}`);
    console.log(`    Token: ${state.authToken ? state.authToken.substring(0, 30) + '...' : '(none)'}`);
    console.log('');
    console.log(colors.green + '  Options:' + colors.reset);
    console.log('    1. Set credentials');
    console.log('    2. Check API status');
    console.log('    3. Single login attempt');
    console.log('    4. Rapid fire login');
    console.log('    5. Scheduled login');
    console.log('    6. Continuous monitoring');
    console.log('    0. Exit');
    console.log('');
}

async function setCredentials() {
    CONFIG.email = await prompt(colors.cyan + 'Enter email: ' + colors.reset);
    CONFIG.password = await promptPassword(colors.cyan + 'Enter password: ' + colors.reset);
    logSuccess('Credentials saved!');
}

async function continuousMonitoring() {
    if (!CONFIG.email || !CONFIG.password) {
        logError('Set credentials first!');
        return;
    }

    logInfo('Starting continuous monitoring...');
    logInfo('Will check API status and attempt login when available');
    logWarning('Press Ctrl+C to stop\n');

    state.isRunning = true;
    let checkCount = 0;

    while (state.isRunning) {
        checkCount++;
        process.stdout.write(`\r${colors.cyan}Check #${checkCount}...${colors.reset}`);

        const isOpen = await checkAPIStatus();

        if (isOpen) {
            console.log('\n');
            logSuccess('API is OPEN! Attempting login...');

            const result = await doLogin(CONFIG.email, CONFIG.password);

            if (result.success) {
                logSuccess('LOGIN SUCCESS!');
                state.isRunning = false;
                return;
            }
        }

        if (state.isRunning) {
            await sleep(5000); // Check every 5 seconds
        }
    }
}

async function main() {
    // Handle Ctrl+C
    process.on('SIGINT', () => {
        console.log('\n');
        logWarning('Stopping...');
        state.isRunning = false;
        setTimeout(() => process.exit(0), 500);
    });

    while (true) {
        await showMenu();
        const choice = await prompt(colors.yellow + 'Enter option: ' + colors.reset);

        switch (choice) {
            case '1':
                await setCredentials();
                break;

            case '2':
                await checkAPIStatus();
                break;

            case '3':
                if (!CONFIG.email || !CONFIG.password) {
                    logError('Set credentials first! (Option 1)');
                } else {
                    await doLogin(CONFIG.email, CONFIG.password);
                }
                break;

            case '4':
                if (!CONFIG.email || !CONFIG.password) {
                    logError('Set credentials first! (Option 1)');
                } else {
                    const count = parseInt(await prompt('Number of attempts (default 20): ')) || 20;
                    const delay = parseInt(await prompt('Delay in ms (default 300): ')) || 300;
                    await rapidFire(CONFIG.email, CONFIG.password, count, delay);
                }
                break;

            case '5':
                if (!CONFIG.email || !CONFIG.password) {
                    logError('Set credentials first! (Option 1)');
                } else {
                    const time = await prompt('Target time (HH:MM:SS, e.g., 09:00:00): ');
                    if (time) {
                        const offset = parseInt(await prompt('Start before (seconds, default 5): ')) || 5;
                        const interval = parseInt(await prompt('Retry interval (ms, default 300): ')) || 300;
                        const duration = parseInt(await prompt('Duration (seconds, default 120): ')) || 120;
                        await scheduledLogin(CONFIG.email, CONFIG.password, time, offset, interval, duration);
                    }
                }
                break;

            case '6':
                if (!CONFIG.email || !CONFIG.password) {
                    logError('Set credentials first! (Option 1)');
                } else {
                    await continuousMonitoring();
                }
                break;

            case '0':
            case 'exit':
            case 'quit':
                logInfo('Goodbye!');
                process.exit(0);
                break;

            default:
                logWarning('Invalid option');
        }
    }
}

// ════════════════════════════════════════════════════════════
//  START
// ════════════════════════════════════════════════════════════
main().catch(err => {
    logError('Fatal error: ' + err.message);
    process.exit(1);
});
