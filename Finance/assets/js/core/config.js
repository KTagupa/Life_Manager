// =============================================
// SECTION 1: CONFIGURATION & STATE
// =============================================
const appId = 'personal-finance-sync-v1';
const FINANCE_FIREBASE_RUNTIME_CONFIG_KEY = 'finance_runtime_firebase_config_v1';
const FINANCE_FIREBASE_API_KEY_STORAGE_KEY = 'finance_runtime_firebase_api_key_v1';
const FINANCE_FIREBASE_REQUIRED_KEYS = Object.freeze([
    'apiKey',
    'authDomain',
    'projectId',
    'storageBucket',
    'messagingSenderId',
    'appId'
]);
const FINANCE_FIREBASE_PUBLIC_REQUIRED_KEYS = Object.freeze([
    'authDomain',
    'projectId',
    'storageBucket',
    'messagingSenderId',
    'appId'
]);
const FINANCE_FIREBASE_PUBLIC_DEFAULTS = Object.freeze({
    authDomain: 'financeflow-vault-fe6d2.firebaseapp.com',
    projectId: 'financeflow-vault-fe6d2',
    storageBucket: 'financeflow-vault-fe6d2.firebasestorage.app',
    messagingSenderId: '163555840928',
    appId: '1:163555840928:web:ead72c1ba691a6d002cac5'
});

function normalizeFirebasePublicConfig(rawConfig) {
    const source = rawConfig && typeof rawConfig === 'object' ? rawConfig : null;
    if (!source) return null;
    const next = {};
    for (const key of FINANCE_FIREBASE_PUBLIC_REQUIRED_KEYS) {
        const value = String(source[key] || '').trim();
        if (!value) return null;
        next[key] = value;
    }
    return next;
}

const FINANCE_FIREBASE_PUBLIC_CONFIG = normalizeFirebasePublicConfig(
    (typeof window !== 'undefined' && window.__FINANCE_FIREBASE_PUBLIC_CONFIG__)
        ? window.__FINANCE_FIREBASE_PUBLIC_CONFIG__
        : FINANCE_FIREBASE_PUBLIC_DEFAULTS
);

function normalizeFirebaseApiKey(rawApiKey) {
    const value = String(rawApiKey || '').trim();
    if (!value) return '';
    return /^AIza[0-9A-Za-z_-]{20,}$/.test(value) ? value : '';
}

function buildFirebaseConfigFromApiKey(apiKey) {
    const normalizedApiKey = normalizeFirebaseApiKey(apiKey);
    if (!normalizedApiKey) return null;
    if (!FINANCE_FIREBASE_PUBLIC_CONFIG) return null;
    return {
        apiKey: normalizedApiKey,
        ...FINANCE_FIREBASE_PUBLIC_CONFIG
    };
}

function normalizeFirebaseRuntimeConfig(rawConfig) {
    const source = rawConfig && typeof rawConfig === 'object' ? rawConfig : null;
    if (!source) return null;
    const next = {};
    for (const key of FINANCE_FIREBASE_REQUIRED_KEYS) {
        const value = String(source[key] || '').trim();
        if (!value) return null;
        next[key] = value;
    }
    return next;
}

function parseFirebaseRuntimeConfig(rawJson) {
    if (!rawJson || typeof rawJson !== 'string') return null;
    try {
        const parsed = JSON.parse(rawJson);
        return normalizeFirebaseRuntimeConfig(parsed);
    } catch (_error) {
        return null;
    }
}

function readFirebaseRuntimeConfig() {
    const globalConfig = normalizeFirebaseRuntimeConfig(
        (typeof window !== 'undefined') ? window.__FINANCE_FIREBASE_CONFIG__ : null
    );
    if (globalConfig) return { config: globalConfig, source: 'window.__FINANCE_FIREBASE_CONFIG__' };

    if (typeof localStorage !== 'undefined') {
        const savedRaw = localStorage.getItem(FINANCE_FIREBASE_RUNTIME_CONFIG_KEY);
        const savedConfig = parseFirebaseRuntimeConfig(savedRaw);
        if (savedConfig) return { config: savedConfig, source: `localStorage.${FINANCE_FIREBASE_RUNTIME_CONFIG_KEY}` };

        const savedApiKey = normalizeFirebaseApiKey(localStorage.getItem(FINANCE_FIREBASE_API_KEY_STORAGE_KEY));
        const builtFromSavedKey = buildFirebaseConfigFromApiKey(savedApiKey);
        if (builtFromSavedKey) {
            return {
                config: builtFromSavedKey,
                source: `localStorage.${FINANCE_FIREBASE_API_KEY_STORAGE_KEY}`
            };
        }
    }

    if (typeof window !== 'undefined') {
        const globalApiKey = normalizeFirebaseApiKey(window.__FINANCE_FIREBASE_API_KEY__);
        const builtFromGlobalKey = buildFirebaseConfigFromApiKey(globalApiKey);
        if (builtFromGlobalKey) {
            return {
                config: builtFromGlobalKey,
                source: 'window.__FINANCE_FIREBASE_API_KEY__'
            };
        }
    }
    return { config: null, source: 'missing' };
}

function setFinanceFirebaseConfig(configOrJson) {
    const config = (typeof configOrJson === 'string')
        ? parseFirebaseRuntimeConfig(configOrJson)
        : normalizeFirebaseRuntimeConfig(configOrJson);
    if (!config) {
        throw new Error('Invalid Firebase config. Required keys: apiKey, authDomain, projectId, storageBucket, messagingSenderId, appId.');
    }
    localStorage.setItem(FINANCE_FIREBASE_RUNTIME_CONFIG_KEY, JSON.stringify(config));
    localStorage.removeItem(FINANCE_FIREBASE_API_KEY_STORAGE_KEY);
    return config;
}

function setFinanceFirebaseApiKey(apiKeyInput) {
    const apiKey = normalizeFirebaseApiKey(apiKeyInput);
    if (!apiKey) {
        throw new Error('Invalid Firebase API key. It should look like "AIza..."');
    }
    const config = buildFirebaseConfigFromApiKey(apiKey);
    if (!config) {
        throw new Error('Public Firebase project settings are missing. Cannot build config from API key only.');
    }
    localStorage.setItem(FINANCE_FIREBASE_API_KEY_STORAGE_KEY, apiKey);
    localStorage.removeItem(FINANCE_FIREBASE_RUNTIME_CONFIG_KEY);
    return config;
}

function clearFinanceFirebaseConfig() {
    localStorage.removeItem(FINANCE_FIREBASE_RUNTIME_CONFIG_KEY);
    localStorage.removeItem(FINANCE_FIREBASE_API_KEY_STORAGE_KEY);
}

function getSavedFinanceFirebaseApiKey() {
    const fromStorage = (typeof localStorage !== 'undefined')
        ? normalizeFirebaseApiKey(localStorage.getItem(FINANCE_FIREBASE_API_KEY_STORAGE_KEY))
        : '';
    if (fromStorage) return fromStorage;
    const fromGlobal = (typeof window !== 'undefined')
        ? normalizeFirebaseApiKey(window.__FINANCE_FIREBASE_API_KEY__)
        : '';
    if (fromGlobal) return fromGlobal;
    const fromConfig = readFirebaseRuntimeConfig();
    return normalizeFirebaseApiKey(fromConfig && fromConfig.config && fromConfig.config.apiKey);
}

if (typeof window !== 'undefined') {
    window.setFinanceFirebaseConfig = setFinanceFirebaseConfig;
    window.setFinanceFirebaseApiKey = setFinanceFirebaseApiKey;
    window.clearFinanceFirebaseConfig = clearFinanceFirebaseConfig;
}

const runtimeFirebase = readFirebaseRuntimeConfig();
const firebaseConfig = runtimeFirebase.config;

function initializeFirestoreClient(config) {
    if (!config) return null;
    if (typeof firebase === 'undefined') {
        console.warn('[finance] Firebase SDK is unavailable. Running local-only mode.');
        return null;
    }
    try {
        const app = (Array.isArray(firebase.apps) && firebase.apps.length > 0)
            ? firebase.apps[0]
            : firebase.initializeApp(config);
        const db = firebase.firestore(app);
        console.info(`[finance] Firebase enabled via ${runtimeFirebase.source}.`);
        return db;
    } catch (error) {
        console.error('[finance] Firebase initialization failed. Running local-only mode.', error);
        return null;
    }
}

const firestoreDB = initializeFirestoreClient(firebaseConfig);
if (!firestoreDB) {
    console.warn(
        '[finance] No runtime Firebase config found. Cloud sync is disabled; local encrypted storage still works.\n' +
        `Set config via window.setFinanceFirebaseConfig({...}) or window.__FINANCE_FIREBASE_CONFIG__, then reload.`
    );
}

function parseFirebaseConfigInput(rawInput) {
    const rawText = String(rawInput || '').trim();
    if (!rawText) {
        return { config: null, error: 'Please paste a Firebase config object.' };
    }

    let candidate = rawText
        .replace(/^```(?:json|js|javascript)?\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();

    if (/firebaseConfig/i.test(candidate)) {
        const start = candidate.indexOf('{');
        const end = candidate.lastIndexOf('}');
        if (start >= 0 && end > start) {
            candidate = candidate.slice(start, end + 1);
        }
    }

    candidate = candidate.replace(/;\s*$/, '').trim();

    const attempts = [];
    attempts.push(candidate);
    attempts.push(
        candidate
            .replace(/([,{]\s*)([A-Za-z_$][A-Za-z0-9_$]*)(\s*:)/g, '$1"$2"$3')
            .replace(/,\s*([}\]])/g, '$1')
    );

    for (const attempt of attempts) {
        try {
            const parsed = JSON.parse(attempt);
            const normalized = normalizeFirebaseRuntimeConfig(parsed);
            if (normalized) return { config: normalized, error: '' };
        } catch (_error) {
            // Try the next parsing strategy.
        }
    }

    return {
        config: null,
        error: 'Could not parse config. Paste JSON or the firebaseConfig object snippet from Firebase console.'
    };
}

function getFirebaseRuntimeStatusSummary() {
    const saved = readFirebaseRuntimeConfig();
    const sessionEnabled = !!firestoreDB;
    const sessionLabel = sessionEnabled
        ? `Enabled (${runtimeFirebase.source})`
        : 'Disabled (local-only)';
    const hasSavedFullConfig = !!parseFirebaseRuntimeConfig(
        (typeof localStorage !== 'undefined') ? localStorage.getItem(FINANCE_FIREBASE_RUNTIME_CONFIG_KEY) : ''
    );
    const hasSavedApiKey = !!normalizeFirebaseApiKey(
        (typeof localStorage !== 'undefined') ? localStorage.getItem(FINANCE_FIREBASE_API_KEY_STORAGE_KEY) : ''
    );
    const savedLabel = hasSavedFullConfig
        ? 'Saved full config'
        : (hasSavedApiKey ? 'Saved API key' : 'Not saved');
    return {
        sessionEnabled,
        savedAvailable: !!(saved && saved.config),
        text: `Session: ${sessionLabel} • Saved: ${savedLabel}`
    };
}

function setFirebaseConfigFeedback(message, isError = false) {
    const el = document.getElementById('firebase-config-feedback');
    if (!el) return;
    el.innerText = String(message || '');
    el.classList.remove('text-slate-500', 'text-emerald-600', 'text-rose-600');
    if (isError) {
        el.classList.add('text-rose-600');
    } else if (String(message || '').toLowerCase().includes('saved')) {
        el.classList.add('text-emerald-600');
    } else {
        el.classList.add('text-slate-500');
    }
}

function formatFirebaseConfigForInput(config) {
    if (!config || typeof config !== 'object') return '';
    return JSON.stringify(config, null, 2);
}

function refreshFirebaseConfigStatusUI() {
    const summary = getFirebaseRuntimeStatusSummary();
    const lockStatus = document.getElementById('firebase-runtime-status-lock');
    const modalStatus = document.getElementById('firebase-runtime-status-modal');
    if (lockStatus) lockStatus.innerText = `Cloud sync: ${summary.sessionEnabled ? 'enabled' : 'local-only'}`;
    if (modalStatus) modalStatus.innerText = summary.text;
}

function openFirebaseConfigModal() {
    const modal = document.getElementById('firebase-config-modal');
    const input = document.getElementById('firebase-config-input');
    const apiKeyInput = document.getElementById('firebase-api-key-input');
    if (!modal || !input) return;

    const current = readFirebaseRuntimeConfig();
    input.value = current && current.config ? formatFirebaseConfigForInput(current.config) : '';
    if (apiKeyInput) apiKeyInput.value = getSavedFinanceFirebaseApiKey();
    refreshFirebaseConfigStatusUI();
    setFirebaseConfigFeedback(
        current && current.config
            ? 'Edit the config, then click Save & Reload.'
            : 'Paste config JSON, then click Save & Reload.'
    );

    modal.classList.remove('hidden');
    setTimeout(() => input.focus(), 0);
}

function closeFirebaseConfigModal() {
    const modal = document.getElementById('firebase-config-modal');
    if (!modal) return;
    modal.classList.add('hidden');
}

function saveFirebaseConfigFromModal() {
    const input = document.getElementById('firebase-config-input');
    if (!input) return;

    const { config, error } = parseFirebaseConfigInput(input.value);
    if (!config) {
        setFirebaseConfigFeedback(error || 'Invalid config.', true);
        if (typeof showToast === 'function') showToast('❌ Invalid Firebase config');
        return;
    }

    try {
        setFinanceFirebaseConfig(config);
        setFirebaseConfigFeedback('Saved. Reloading to apply cloud sync settings...');
        if (typeof showToast === 'function') showToast('✅ Cloud sync config saved. Reloading...');
        setTimeout(() => window.location.reload(), 220);
    } catch (saveError) {
        setFirebaseConfigFeedback(saveError.message || 'Failed to save config.', true);
        if (typeof showToast === 'function') showToast('❌ Failed to save cloud sync config');
    }
}

function saveFirebaseApiKeyFromModal() {
    const apiKeyInput = document.getElementById('firebase-api-key-input');
    if (!apiKeyInput) return;
    const apiKey = String(apiKeyInput.value || '').trim();
    try {
        setFinanceFirebaseApiKey(apiKey);
        setFirebaseConfigFeedback('API key saved. Reloading to apply cloud sync settings...');
        if (typeof showToast === 'function') showToast('✅ API key saved. Reloading...');
        setTimeout(() => window.location.reload(), 220);
    } catch (error) {
        setFirebaseConfigFeedback(error.message || 'Invalid API key.', true);
        if (typeof showToast === 'function') showToast('❌ Invalid Firebase API key');
    }
}

function clearFirebaseConfigFromModal() {
    const hasSavedConfig = !!parseFirebaseRuntimeConfig(
        (typeof localStorage !== 'undefined') ? localStorage.getItem(FINANCE_FIREBASE_RUNTIME_CONFIG_KEY) : ''
    );
    const hasSavedApiKey = !!normalizeFirebaseApiKey(
        (typeof localStorage !== 'undefined') ? localStorage.getItem(FINANCE_FIREBASE_API_KEY_STORAGE_KEY) : ''
    );
    const hasAnySavedConfig = hasSavedConfig || hasSavedApiKey;
    if (!hasAnySavedConfig) {
        setFirebaseConfigFeedback('No saved config to clear.');
        return;
    }
    const shouldClear = window.confirm('Clear saved cloud sync config and reload?');
    if (!shouldClear) return;
    clearFinanceFirebaseConfig();
    setFirebaseConfigFeedback('Config cleared. Reloading...');
    if (typeof showToast === 'function') showToast('ℹ️ Cloud sync config cleared. Reloading...');
    setTimeout(() => window.location.reload(), 220);
}

function bindFirebaseConfigModalEvents() {
    const modal = document.getElementById('firebase-config-modal');
    if (!modal || modal.dataset.bound === 'true') return;
    modal.dataset.bound = 'true';

    modal.addEventListener('click', (event) => {
        if (event.target === modal) closeFirebaseConfigModal();
    });

    document.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape') return;
        if (modal.classList.contains('hidden')) return;
        closeFirebaseConfigModal();
    });
}

function initFirebaseConfigUI() {
    bindFirebaseConfigModalEvents();
    refreshFirebaseConfigStatusUI();
}

if (typeof window !== 'undefined') {
    window.openFirebaseConfigModal = openFirebaseConfigModal;
    window.closeFirebaseConfigModal = closeFirebaseConfigModal;
    window.saveFirebaseConfigFromModal = saveFirebaseConfigFromModal;
    window.saveFirebaseApiKeyFromModal = saveFirebaseApiKeyFromModal;
    window.clearFirebaseConfigFromModal = clearFirebaseConfigFromModal;
    window.refreshFirebaseConfigStatusUI = refreshFirebaseConfigStatusUI;
}

if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initFirebaseConfigUI, { once: true });
    } else {
        initFirebaseConfigUI();
    }
}

let masterKey = null;
let cryptoKey = null;
let kdfMeta = null;
let activeCurrency = 'PHP';
let exchangeRates = {
    PHP: 1,
    USD: 0.018,
    JPY: 2.6
};

// Data Containers
let rawTransactions = [];
let rawBills = [];
let rawDebts = [];
let rawLent = [];
let rawCrypto = [];
let rawWishlist = [];
let cryptoPrices = {}; // { 'bitcoin': { price: 5000000, updated: 123456789 } }
let budgets = {};
let recurringTransactions = [];
let customCategories = [];
let categorizationRules = [];
let financialGoals = [];
let importsLog = [];
let undoLog = [];
let monthlyCloseRecords = [];
let kpiTargets = {};
let kpiSnapshots = [];
let forecastAssumptions = {};
let forecastRuns = [];
let statementSnapshots = [];
let operationsGuardrails = {};
let metricScope = 'selected_period';
let spendChart = null;
let cryptoAllocationChart = null;
let scenarioChart = null;
let investmentGoals = [];  // Array of { id, name, targetAmount, targetDate, createdAt }
let cryptoInterestByToken = {}; // { tokenId: { enabled, rewards: [{ tokenId, symbol, amount }], lastModified } }
let filteredTransactions = [];

const standardCategories = ["Food", "Transport", "Bills", "Savings", "Entertainment", "Salary", "Others"];

function escapeHTML(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function escapeAttr(value) {
    return escapeHTML(value).replace(/`/g, '&#96;');
}

function encodeInlineArg(value) {
    return encodeURIComponent(String(value ?? ''));
}
