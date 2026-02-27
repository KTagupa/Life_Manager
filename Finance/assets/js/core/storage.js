// =============================================
// SECTION 2: DATABASE & STORAGE
// =============================================
const DB_KEY = 'finance_flow_encrypted_v3';
const BACKUP_SETTINGS_KEY = 'finance_flow_backup_settings_v1';
const KDF_META_PREFIX = 'finance_flow_kdf_meta_v1_';
const CURRENT_SCHEMA_VERSION = 5;
const UNDO_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const LOCAL_DB_NAME = 'finance_flow_local_v1';
const LOCAL_DB_VERSION = 1;
const LOCAL_DB_STORE = 'app_kv';

let localIndexedDBPromise = null;
let latestStorageDiagnostics = null;

function canUseIndexedDB() {
    return typeof window !== 'undefined' && 'indexedDB' in window;
}

function openLocalIndexedDB() {
    if (!canUseIndexedDB()) return Promise.resolve(null);
    if (localIndexedDBPromise) return localIndexedDBPromise;

    localIndexedDBPromise = new Promise((resolve) => {
        try {
            const req = window.indexedDB.open(LOCAL_DB_NAME, LOCAL_DB_VERSION);
            req.onupgradeneeded = () => {
                const db = req.result;
                if (!db.objectStoreNames.contains(LOCAL_DB_STORE)) {
                    db.createObjectStore(LOCAL_DB_STORE, { keyPath: 'key' });
                }
            };
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => {
                console.error('IndexedDB open failed; falling back to localStorage.', req.error);
                resolve(null);
            };
        } catch (error) {
            console.error('IndexedDB init failed; falling back to localStorage.', error);
            resolve(null);
        }
    });

    return localIndexedDBPromise;
}

async function readDBFromIndexedDB() {
    const record = await readDBRecordFromIndexedDB();
    return record?.value || null;
}

async function readDBRecordFromIndexedDB() {
    try {
        const db = await openLocalIndexedDB();
        if (!db) return null;

        return await new Promise((resolve) => {
            try {
                const tx = db.transaction(LOCAL_DB_STORE, 'readonly');
                const store = tx.objectStore(LOCAL_DB_STORE);
                const req = store.get(DB_KEY);
                req.onsuccess = () => resolve(req.result || null);
                req.onerror = () => {
                    console.error('IndexedDB read failed; using localStorage fallback.', req.error);
                    resolve(null);
                };
            } catch (error) {
                console.error('IndexedDB read transaction failed; using localStorage fallback.', error);
                resolve(null);
            }
        });
    } catch (error) {
        console.error('IndexedDB read failed; using localStorage fallback.', error);
        return null;
    }
}

async function writeDBToIndexedDB(dbData) {
    try {
        const db = await openLocalIndexedDB();
        if (!db) return false;

        return await new Promise((resolve) => {
            try {
                const tx = db.transaction(LOCAL_DB_STORE, 'readwrite');
                const store = tx.objectStore(LOCAL_DB_STORE);
                store.put({
                    key: DB_KEY,
                    value: dbData,
                    updatedAt: Date.now()
                });
                tx.oncomplete = () => resolve(true);
                tx.onerror = () => {
                    console.error('IndexedDB write failed; localStorage cache still updated.', tx.error);
                    resolve(false);
                };
            } catch (error) {
                console.error('IndexedDB write transaction failed; localStorage cache still updated.', error);
                resolve(false);
            }
        });
    } catch (error) {
        console.error('IndexedDB write failed; localStorage cache still updated.', error);
        return false;
    }
}

function readDBFromLocalStorage() {
    try {
        const raw = localStorage.getItem(DB_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch (error) {
        console.error('localStorage DB parse failed; ignoring local cache.', error);
        return null;
    }
}

function getDBLastUpdatedTs(db) {
    const raw = db?.sync?.updatedAt;
    if (!raw) return 0;
    const ts = typeof raw === 'number' ? raw : new Date(raw).getTime();
    return Number.isFinite(ts) ? ts : 0;
}

function estimateDBPayloadWeight(db) {
    if (!db || typeof db !== 'object') return 0;
    return [
        db.transactions,
        db.bills,
        db.debts,
        db.lent,
        db.crypto,
        db.wishlist,
        db.fixed_assets,
        db.agm_records,
        db.goals,
        db.investment_goals,
        db.categorization_rules,
        db.imports,
        db.monthly_closes,
        db.kpi_snapshots,
        db.forecast_runs,
        db.statement_snapshots,
        db.undo_log
    ].reduce((sum, list) => sum + (Array.isArray(list) ? list.length : 0), 0);
}

function choosePreferredLocalDB(localStorageDB, indexedDBData) {
    if (!localStorageDB && !indexedDBData) return { db: getDefaultDB(), source: 'default' };
    if (!localStorageDB) return { db: indexedDBData, source: 'idb' };
    if (!indexedDBData) return { db: localStorageDB, source: 'localstorage' };

    const localTs = getDBLastUpdatedTs(localStorageDB);
    const idbTs = getDBLastUpdatedTs(indexedDBData);
    if (idbTs > localTs) return { db: indexedDBData, source: 'idb' };
    if (localTs > idbTs) return { db: localStorageDB, source: 'localstorage' };

    const localWeight = estimateDBPayloadWeight(localStorageDB);
    const idbWeight = estimateDBPayloadWeight(indexedDBData);
    if (idbWeight > localWeight) return { db: indexedDBData, source: 'idb' };
    return { db: localStorageDB, source: 'localstorage' };
}

async function persistLocalDBSnapshot(dbData) {
    const normalized = normalizeDBSchema(dbData);
    await writeDBToIndexedDB(normalized);
    try {
        localStorage.setItem(DB_KEY, JSON.stringify(normalized));
    } catch (error) {
        console.error('Failed to update localStorage cache.', error);
    }
    return normalized;
}

async function getLocalDBSnapshot() {
    const rawLocalStorageDB = readDBFromLocalStorage();
    const rawLocalStorageStr = rawLocalStorageDB ? JSON.stringify(rawLocalStorageDB) : null;
    let localStorageDB = rawLocalStorageDB ? normalizeDBSchema(rawLocalStorageDB) : null;
    let rawIndexedDBData = null;
    let indexedDBData = null;
    try {
        rawIndexedDBData = await readDBFromIndexedDB();
        indexedDBData = rawIndexedDBData ? normalizeDBSchema(rawIndexedDBData) : null;
    } catch (error) {
        console.error('IndexedDB local snapshot read failed.', error);
        rawIndexedDBData = null;
        indexedDBData = null;
    }

    const preferred = choosePreferredLocalDB(localStorageDB, indexedDBData);
    const resolved = normalizeDBSchema(preferred.db);

    const resolvedStr = JSON.stringify(resolved);
    const localStr = localStorageDB ? JSON.stringify(localStorageDB) : null;
    const rawIdbStr = rawIndexedDBData ? JSON.stringify(rawIndexedDBData) : null;
    const idbStr = indexedDBData ? JSON.stringify(indexedDBData) : null;
    const localWasNormalized = rawLocalStorageStr !== localStr;
    const idbWasNormalized = rawIdbStr !== idbStr;

    // Keep both local stores aligned after reads, but avoid redundant writes.
    if (idbWasNormalized || idbStr !== resolvedStr) {
        await writeDBToIndexedDB(resolved);
    }
    if (localWasNormalized || localStr !== resolvedStr) {
        try {
            localStorage.setItem(DB_KEY, resolvedStr);
        } catch (error) {
            console.error('Failed to update localStorage cache.', error);
        }
    }
    return resolved;
}

function estimateSerializedBytes(value) {
    try {
        if (value == null) return 0;
        const str = typeof value === 'string' ? value : JSON.stringify(value);
        return new TextEncoder().encode(str).length;
    } catch (_) {
        return 0;
    }
}

function formatBytes(bytes) {
    const n = Number(bytes || 0);
    if (!Number.isFinite(n) || n <= 0) return '0 B';
    if (n < 1024) return `${n} B`;
    const kb = n / 1024;
    if (kb < 1024) return `${kb.toFixed(1)} KB`;
    const mb = kb / 1024;
    return `${mb.toFixed(2)} MB`;
}

function formatDiagnosticTime(value) {
    if (!value) return '—';
    const ts = typeof value === 'number' ? value : new Date(value).getTime();
    if (!Number.isFinite(ts) || ts <= 0) return '—';
    return new Date(ts).toLocaleString();
}

function countDBRecords(db) {
    const safe = normalizeDBSchema(db || getDefaultDB());
    return {
        transactions: (safe.transactions || []).filter(i => i && !i.deletedAt).length,
        bills: (safe.bills || []).filter(i => i && !i.deletedAt).length,
        debts: (safe.debts || []).filter(i => i && !i.deletedAt).length,
        lent: (safe.lent || []).filter(i => i && !i.deletedAt).length,
        crypto: (safe.crypto || []).filter(i => i && !i.deletedAt).length,
        wishlist: (safe.wishlist || []).filter(i => i && !i.deletedAt).length,
        fixedAssets: (safe.fixed_assets || []).filter(i => i && !i.deletedAt).length,
        agmRecords: (safe.agm_records || []).filter(i => i && !i.deletedAt).length,
        monthlyCloses: (safe.monthly_closes || []).length,
        kpiSnapshots: (safe.kpi_snapshots || []).length,
        forecastRuns: (safe.forecast_runs || []).length,
        statementSnapshots: (safe.statement_snapshots || []).length,
        undoLog: (safe.undo_log || []).length
    };
}

async function getStorageDiagnostics() {
    const rawLocal = (() => {
        try {
            return localStorage.getItem(DB_KEY);
        } catch (error) {
            console.error('localStorage read failed for diagnostics.', error);
            return null;
        }
    })();

    let localParsed = null;
    try {
        localParsed = rawLocal ? normalizeDBSchema(JSON.parse(rawLocal)) : null;
    } catch (error) {
        console.error('localStorage parse failed for diagnostics.', error);
        localParsed = null;
    }

    const idbRecord = await readDBRecordFromIndexedDB();
    let idbParsed = null;
    try {
        idbParsed = idbRecord?.value ? normalizeDBSchema(idbRecord.value) : null;
    } catch (error) {
        console.error('IndexedDB parse failed for diagnostics.', error);
        idbParsed = null;
    }

    const preferred = choosePreferredLocalDB(localParsed, idbParsed);
    const preferredDB = normalizeDBSchema(preferred.db || getDefaultDB());

    return {
        preferredSource: preferred.source,
        syncUpdatedAt: preferredDB.sync?.updatedAt || null,
        conflictStrategy: preferredDB.sync?.conflictStrategy || 'local_wins',
        counts: countDBRecords(preferredDB),
        localStorage: {
            available: true,
            hasData: !!localParsed,
            sizeBytes: estimateSerializedBytes(rawLocal),
            updatedAt: localParsed?.sync?.updatedAt || null
        },
        indexedDB: {
            supported: canUseIndexedDB(),
            hasData: !!idbParsed,
            sizeBytes: estimateSerializedBytes(idbRecord?.value || null),
            updatedAt: idbParsed?.sync?.updatedAt || null,
            writeTimestamp: idbRecord?.updatedAt || null
        }
    };
}

function setDiagText(id, value) {
    const el = document.getElementById(id);
    if (!el) return;
    el.innerText = value;
}

function copyTextFallback(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    ta.style.top = '0';
    ta.style.opacity = '0';
    ta.style.pointerEvents = 'none';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    ta.setSelectionRange(0, ta.value.length);
    let ok = false;
    try {
        ok = document.execCommand('copy');
    } catch (_) {
        ok = false;
    }
    document.body.removeChild(ta);
    return ok;
}

function downloadDiagnosticsJSON(json) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `financeflow_diagnostics_${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

async function copyStorageDiagnosticsJSON() {
    setDiagText('diag-status', 'Preparing diagnostics JSON...');
    try {
        const diagnostics = latestStorageDiagnostics || await getStorageDiagnostics();
        latestStorageDiagnostics = diagnostics;
        const payload = {
            exportedAt: new Date().toISOString(),
            appId: typeof appId !== 'undefined' ? appId : null,
            diagnostics
        };
        const json = JSON.stringify(payload, null, 2);

        let copied = false;
        if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
            try {
                await navigator.clipboard.writeText(json);
                copied = true;
            } catch (_) {
                copied = false;
            }
        }
        if (!copied) copied = copyTextFallback(json);
        if (!copied) {
            downloadDiagnosticsJSON(json);
            const timeLabel = new Date().toLocaleTimeString();
            setDiagText('diag-status', `Clipboard blocked. Downloaded diagnostics JSON at ${timeLabel}`);
            if (typeof showToast === 'function') showToast('ℹ️ Clipboard blocked, diagnostics JSON downloaded');
            return;
        }

        const timeLabel = new Date().toLocaleTimeString();
        setDiagText('diag-status', `Diagnostics JSON copied at ${timeLabel}`);
        if (typeof showToast === 'function') showToast('✅ Diagnostics JSON copied');
    } catch (error) {
        console.error('Diagnostics JSON copy failed.', error);
        setDiagText('diag-status', 'Could not copy diagnostics JSON');
        if (typeof showToast === 'function') showToast('❌ Could not copy diagnostics JSON');
    }
}

async function refreshStorageDiagnosticsPanel() {
    const panel = document.getElementById('storage-diagnostics-panel');
    if (!panel) return;

    setDiagText('diag-status', 'Refreshing...');
    try {
        const diag = await getStorageDiagnostics();
        latestStorageDiagnostics = diag;
        const localStatus = diag.localStorage.hasData ? 'Data present' : 'No data';
        const idbStatus = !diag.indexedDB.supported
            ? 'Not supported'
            : (diag.indexedDB.hasData ? 'Data present' : 'No data');

        setDiagText('diag-source', diag.preferredSource);
        setDiagText('diag-sync-updated', formatDiagnosticTime(diag.syncUpdatedAt));
        setDiagText('diag-conflict-strategy', diag.conflictStrategy);

        setDiagText('diag-local-status', localStatus);
        setDiagText('diag-local-size', formatBytes(diag.localStorage.sizeBytes));
        setDiagText('diag-local-updated', formatDiagnosticTime(diag.localStorage.updatedAt));

        setDiagText('diag-idb-status', idbStatus);
        setDiagText('diag-idb-size', formatBytes(diag.indexedDB.sizeBytes));
        setDiagText('diag-idb-updated', formatDiagnosticTime(diag.indexedDB.updatedAt));

        const writeTs = diag.indexedDB.writeTimestamp ? formatDiagnosticTime(diag.indexedDB.writeTimestamp) : '—';
        setDiagText('diag-idb-write', writeTs);
        setDiagText(
            'diag-counts',
            `Tx ${diag.counts.transactions} • Bills ${diag.counts.bills} • Debts ${diag.counts.debts} • Lent ${diag.counts.lent} • Crypto ${diag.counts.crypto} • Wishlist ${diag.counts.wishlist} • Assets ${diag.counts.fixedAssets} • AGM ${diag.counts.agmRecords} • Closes ${diag.counts.monthlyCloses} • KPI ${diag.counts.kpiSnapshots} • Forecast ${diag.counts.forecastRuns} • Statements ${diag.counts.statementSnapshots} • Undo ${diag.counts.undoLog}`
        );
        setDiagText('diag-status', `Last refresh: ${new Date().toLocaleTimeString()}`);
    } catch (error) {
        console.error('Storage diagnostics refresh failed.', error);
        setDiagText('diag-status', 'Could not refresh diagnostics');
    }
}

function getDefaultKpiTargets() {
    return {
        savingsRatePct: 20,
        runwayDays: 180,
        maxOverBudgetCategories: 1,
        lastModified: 0
    };
}

function getDefaultForecastAssumptions() {
    return {
        months: 12,
        startMonth: null,
        incomeBase: 0,
        fixedCostsBase: 0,
        variableCostsBase: 0,
        debtPaymentBase: 0,
        investmentBase: 0,
        bestIncomeMultiplier: 1.12,
        bestExpenseMultiplier: 0.9,
        worstIncomeMultiplier: 0.9,
        worstExpenseMultiplier: 1.12,
        includeCryptoInNetWorth: true,
        lastModified: 0
    };
}

function getDefaultOperationsGuardrails() {
    return {
        incomeVarianceWarnPct: 12,
        outflowVarianceWarnPct: 12,
        cashFloor: 0,
        lastModified: 0
    };
}

function getDefaultDB() {
    return {
        schema_version: CURRENT_SCHEMA_VERSION,
        transactions: [],
        bills: [],
        debts: [],
        lent: [],
        crypto: [],
        crypto_prices: {},
        crypto_interest: {},
        wishlist: [],
        fixed_assets: [],
        agm_records: [],
        budgets: { data: null },
        custom_categories: [],
        recurring_transactions: [],
        investment_goals: [],
        goals: [],
        categorization_rules: [],
        imports: [],
        insight_snapshots: [],
        monthly_closes: [],
        kpi_targets: getDefaultKpiTargets(),
        kpi_snapshots: [],
        forecast_assumptions: getDefaultForecastAssumptions(),
        forecast_runs: [],
        statement_snapshots: [],
        operations_guardrails: getDefaultOperationsGuardrails(),
        undo_log: [],
        sync: {
            revision: null,
            lastKnownRemoteRevision: null,
            updatedAt: null,
            conflictStrategy: 'local_wins'
        }
    };
}

function getBackupSettings() {
    const str = localStorage.getItem(BACKUP_SETTINGS_KEY);
    return str ? JSON.parse(str) : {
        autoBackupEnabled: true,
        backupHour: 20, // 8 PM
        lastBackupDate: null,
        lastBackupTime: null
    };
}

function saveBackupSettings(settings) {
    localStorage.setItem(BACKUP_SETTINGS_KEY, JSON.stringify(settings));
}

function getKdfMetaStorageKey(vaultId) {
    return `${KDF_META_PREFIX}${vaultId}`;
}

function pruneUndoLog(undoEntries) {
    const cutoff = Date.now() - UNDO_RETENTION_MS;
    return (undoEntries || []).filter(e => {
        const ts = e && e.deletedAt ? new Date(e.deletedAt).getTime() : 0;
        return ts > cutoff;
    });
}

function getUndoEntryKey(entry) {
    if (!entry || typeof entry !== 'object') return null;
    if (entry.id) return `id:${entry.id}`;
    return `legacy:${entry.entityType || ''}:${entry.entityId || ''}:${entry.deletedAt || ''}`;
}

function dedupeUndoLogEntries(undoEntries) {
    const source = Array.isArray(undoEntries) ? undoEntries : [];
    const seen = new Set();
    const out = [];

    for (let i = source.length - 1; i >= 0; i -= 1) {
        const entry = source[i];
        if (!entry || typeof entry !== 'object') continue;
        const key = getUndoEntryKey(entry);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        out.push(entry);
    }

    out.reverse();
    return out;
}

function normalizeReminderShape(reminder) {
    if (!reminder || typeof reminder !== 'object') return null;
    const out = { ...reminder };

    if (out.frequency === 'weekly') {
        if (typeof out.dayOfWeek !== 'number') {
            const legacy = (typeof out.dayOfMonth === 'number' && out.dayOfMonth >= 0 && out.dayOfMonth <= 6)
                ? out.dayOfMonth
                : 1;
            out.dayOfWeek = legacy;
        }
        delete out.dayOfMonth;
    } else if (out.frequency === 'monthly') {
        if (typeof out.dayOfMonth !== 'number' || out.dayOfMonth < 1 || out.dayOfMonth > 31) {
            out.dayOfMonth = 1;
        }
        delete out.dayOfWeek;
    } else {
        out.frequency = 'daily';
        delete out.dayOfWeek;
        delete out.dayOfMonth;
    }

    return out;
}

function normalizeCollectionEntries(entries) {
    return (entries || []).map(e => {
        if (!e || typeof e !== 'object') return null;
        if (typeof e.deletedAt === 'undefined') {
            return { ...e, deletedAt: null };
        }
        return e;
    }).filter(Boolean);
}

function normalizeCryptoInterestShape(rawMap) {
    if (!rawMap || typeof rawMap !== 'object' || Array.isArray(rawMap)) return {};
    const out = {};
    Object.entries(rawMap).forEach(([tokenId, cfg]) => {
        if (!tokenId || !cfg || typeof cfg !== 'object') return;
        const rewards = Array.isArray(cfg.rewards) ? cfg.rewards : [];
        const normalizedRewards = rewards
            .map(reward => {
                if (!reward || typeof reward !== 'object') return null;
                const rewardTokenId = String(reward.tokenId || '').trim();
                if (!rewardTokenId) return null;
                const parsedAmount = Number(reward.amount);
                const amount = Number.isFinite(parsedAmount) ? Math.max(parsedAmount, 0) : 0;
                const rewardSymbol = String(reward.symbol || rewardTokenId).trim();
                return {
                    tokenId: rewardTokenId,
                    symbol: rewardSymbol || rewardTokenId,
                    amount
                };
            })
            .filter(Boolean);

        const parsedLastModified = Number(cfg.lastModified);
        out[String(tokenId)] = {
            enabled: !!cfg.enabled,
            rewards: normalizedRewards,
            lastModified: Number.isFinite(parsedLastModified) ? parsedLastModified : 0
        };
    });
    return out;
}

function normalizeMonthKey(value) {
    const raw = String(value || '').trim();
    const match = raw.match(/^(\d{4})-(\d{2})$/);
    if (!match) return null;
    const month = Number(match[2]);
    if (month < 1 || month > 12) return null;
    return `${match[1]}-${String(month).padStart(2, '0')}`;
}

function toFiniteNumber(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeISOString(value) {
    if (!value) return null;
    const ts = typeof value === 'number' ? value : new Date(value).getTime();
    if (!Number.isFinite(ts) || ts <= 0) return null;
    return new Date(ts).toISOString();
}

function normalizeKpiTargetsShape(rawTargets) {
    const defaults = getDefaultKpiTargets();
    const source = rawTargets && typeof rawTargets === 'object' && !Array.isArray(rawTargets)
        ? rawTargets
        : {};

    const savingsTarget = Math.max(0, Math.min(100, toFiniteNumber(source.savingsRatePct, defaults.savingsRatePct)));
    const runwayTarget = Math.max(0, Math.round(toFiniteNumber(source.runwayDays, defaults.runwayDays)));
    const overBudgetTarget = Math.max(0, Math.round(toFiniteNumber(source.maxOverBudgetCategories, defaults.maxOverBudgetCategories)));

    return {
        savingsRatePct: savingsTarget,
        runwayDays: runwayTarget,
        maxOverBudgetCategories: overBudgetTarget,
        lastModified: Math.max(0, toFiniteNumber(source.lastModified, defaults.lastModified))
    };
}

function normalizeKpiSnapshotEntry(entry) {
    if (!entry || typeof entry !== 'object') return null;
    const month = normalizeMonthKey(entry.month);
    if (!month) return null;

    const id = entry.id || `kpi_${month.replace('-', '')}`;
    const createdAt = normalizeISOString(entry.createdAt);
    const summary = entry.summary && typeof entry.summary === 'object' ? entry.summary : {};

    return {
        id: String(id),
        month,
        summary: {
            income: Math.max(0, toFiniteNumber(summary.income, 0)),
            expense: Math.max(0, toFiniteNumber(summary.expense, 0)),
            savingsRate: toFiniteNumber(summary.savingsRate, 0),
            avgDailySpend: Math.max(0, toFiniteNumber(summary.avgDailySpend, 0)),
            monthEndBalance: toFiniteNumber(summary.monthEndBalance, 0),
            runwayDays: Math.max(0, toFiniteNumber(summary.runwayDays, 0)),
            burnRateMonthly: Math.max(0, toFiniteNumber(summary.burnRateMonthly, 0)),
            overBudgetCategories: Math.max(0, Math.round(toFiniteNumber(summary.overBudgetCategories, 0))),
            transactionCount: Math.max(0, Math.round(toFiniteNumber(summary.transactionCount, 0)))
        },
        createdAt,
        lastModified: Math.max(
            0,
            toFiniteNumber(entry.lastModified, createdAt ? new Date(createdAt).getTime() : 0)
        )
    };
}

function normalizeMonthlyCloseEntry(entry) {
    if (!entry || typeof entry !== 'object') return null;
    const month = normalizeMonthKey(entry.month);
    if (!month) return null;

    const id = entry.id || `close_${month.replace('-', '')}`;
    const closedAt = normalizeISOString(entry.closedAt);
    const createdAt = normalizeISOString(entry.createdAt) || closedAt;
    const summary = entry.summary && typeof entry.summary === 'object' ? entry.summary : {};
    const checklist = entry.checklist && typeof entry.checklist === 'object' ? entry.checklist : {};

    return {
        id: String(id),
        month,
        status: entry.status === 'closed' ? 'closed' : 'open',
        notes: String(entry.notes || ''),
        summary: {
            income: Math.max(0, toFiniteNumber(summary.income, 0)),
            expense: Math.max(0, toFiniteNumber(summary.expense, 0)),
            savingsRate: toFiniteNumber(summary.savingsRate, 0),
            avgDailySpend: Math.max(0, toFiniteNumber(summary.avgDailySpend, 0)),
            monthEndBalance: toFiniteNumber(summary.monthEndBalance, 0),
            totalBudget: Math.max(0, toFiniteNumber(summary.totalBudget, 0)),
            budgetSpent: Math.max(0, toFiniteNumber(summary.budgetSpent, 0)),
            budgetVariance: toFiniteNumber(summary.budgetVariance, 0),
            overBudgetCategories: Math.max(0, Math.round(toFiniteNumber(summary.overBudgetCategories, 0))),
            transactionCount: Math.max(0, Math.round(toFiniteNumber(summary.transactionCount, 0))),
            runwayDays: Math.max(0, toFiniteNumber(summary.runwayDays, 0)),
            burnRateMonthly: Math.max(0, toFiniteNumber(summary.burnRateMonthly, 0))
        },
        checklist: {
            uncategorizedCount: Math.max(0, Math.round(toFiniteNumber(checklist.uncategorizedCount, 0))),
            needsReviewCount: Math.max(0, Math.round(toFiniteNumber(checklist.needsReviewCount, 0))),
            remindersDueCount: Math.max(0, Math.round(toFiniteNumber(checklist.remindersDueCount, 0)))
        },
        closedAt,
        createdAt,
        lastModified: Math.max(
            0,
            toFiniteNumber(entry.lastModified, closedAt ? new Date(closedAt).getTime() : 0)
        )
    };
}

function normalizeForecastAssumptionsShape(rawAssumptions) {
    const defaults = getDefaultForecastAssumptions();
    const source = rawAssumptions && typeof rawAssumptions === 'object' && !Array.isArray(rawAssumptions)
        ? rawAssumptions
        : {};

    const months = Math.max(3, Math.min(24, Math.round(toFiniteNumber(source.months, defaults.months))));
    const startMonth = normalizeMonthKey(source.startMonth || defaults.startMonth);

    return {
        months,
        startMonth,
        incomeBase: Math.max(0, toFiniteNumber(source.incomeBase, defaults.incomeBase)),
        fixedCostsBase: Math.max(0, toFiniteNumber(source.fixedCostsBase, defaults.fixedCostsBase)),
        variableCostsBase: Math.max(0, toFiniteNumber(source.variableCostsBase, defaults.variableCostsBase)),
        debtPaymentBase: Math.max(0, toFiniteNumber(source.debtPaymentBase, defaults.debtPaymentBase)),
        investmentBase: Math.max(0, toFiniteNumber(source.investmentBase, defaults.investmentBase)),
        bestIncomeMultiplier: Math.max(0.5, Math.min(2, toFiniteNumber(source.bestIncomeMultiplier, defaults.bestIncomeMultiplier))),
        bestExpenseMultiplier: Math.max(0.5, Math.min(2, toFiniteNumber(source.bestExpenseMultiplier, defaults.bestExpenseMultiplier))),
        worstIncomeMultiplier: Math.max(0.5, Math.min(2, toFiniteNumber(source.worstIncomeMultiplier, defaults.worstIncomeMultiplier))),
        worstExpenseMultiplier: Math.max(0.5, Math.min(2, toFiniteNumber(source.worstExpenseMultiplier, defaults.worstExpenseMultiplier))),
        includeCryptoInNetWorth: source.includeCryptoInNetWorth !== false,
        lastModified: Math.max(0, toFiniteNumber(source.lastModified, defaults.lastModified))
    };
}

function normalizeOperationsGuardrailsShape(rawGuardrails) {
    const defaults = getDefaultOperationsGuardrails();
    const source = rawGuardrails && typeof rawGuardrails === 'object' && !Array.isArray(rawGuardrails)
        ? rawGuardrails
        : {};

    return {
        incomeVarianceWarnPct: Math.max(0, Math.min(100, toFiniteNumber(source.incomeVarianceWarnPct, defaults.incomeVarianceWarnPct))),
        outflowVarianceWarnPct: Math.max(0, Math.min(100, toFiniteNumber(source.outflowVarianceWarnPct, defaults.outflowVarianceWarnPct))),
        cashFloor: Math.max(0, toFiniteNumber(source.cashFloor, defaults.cashFloor)),
        lastModified: Math.max(0, toFiniteNumber(source.lastModified, defaults.lastModified))
    };
}

function normalizeForecastRowEntry(entry) {
    if (!entry || typeof entry !== 'object') return null;
    const month = normalizeMonthKey(entry.month);
    if (!month) return null;

    return {
        month,
        openingCash: toFiniteNumber(entry.openingCash, 0),
        income: Math.max(0, toFiniteNumber(entry.income, 0)),
        fixedCosts: Math.max(0, toFiniteNumber(entry.fixedCosts, 0)),
        variableCosts: Math.max(0, toFiniteNumber(entry.variableCosts, 0)),
        debtPayment: Math.max(0, toFiniteNumber(entry.debtPayment, 0)),
        investmentContribution: Math.max(0, toFiniteNumber(entry.investmentContribution, 0)),
        netCashFlow: toFiniteNumber(entry.netCashFlow, 0),
        closingCash: toFiniteNumber(entry.closingCash, 0),
        runwayDays: Math.max(0, Math.round(toFiniteNumber(entry.runwayDays, 0)))
    };
}

function normalizeForecastRunEntry(entry) {
    if (!entry || typeof entry !== 'object') return null;
    const startMonth = normalizeMonthKey(entry.startMonth || entry.month);
    if (!startMonth) return null;

    const scenariosSource = entry.scenarios && typeof entry.scenarios === 'object' ? entry.scenarios : {};
    const normalizeScenarioRows = (rows) => (Array.isArray(rows) ? rows : [])
        .map(normalizeForecastRowEntry)
        .filter(Boolean)
        .sort((a, b) => (a.month || '').localeCompare(b.month || ''));

    const createdAt = normalizeISOString(entry.createdAt);
    const summary = entry.summary && typeof entry.summary === 'object' ? entry.summary : {};

    return {
        id: String(entry.id || `forecast_${startMonth.replace('-', '')}`),
        startMonth,
        assumptionsSnapshot: normalizeForecastAssumptionsShape(entry.assumptionsSnapshot),
        scenarios: {
            base: normalizeScenarioRows(scenariosSource.base),
            best: normalizeScenarioRows(scenariosSource.best),
            worst: normalizeScenarioRows(scenariosSource.worst)
        },
        summary: {
            baseEndCash: toFiniteNumber(summary.baseEndCash, 0),
            bestEndCash: toFiniteNumber(summary.bestEndCash, 0),
            worstEndCash: toFiniteNumber(summary.worstEndCash, 0),
            baseMinCash: toFiniteNumber(summary.baseMinCash, 0)
        },
        createdAt,
        lastModified: Math.max(
            0,
            toFiniteNumber(entry.lastModified, createdAt ? new Date(createdAt).getTime() : 0)
        )
    };
}

function normalizeStatementSnapshotEntry(entry) {
    if (!entry || typeof entry !== 'object') return null;
    const month = normalizeMonthKey(entry.month);
    if (!month) return null;
    const createdAt = normalizeISOString(entry.createdAt);
    const pnl = entry.pnl && typeof entry.pnl === 'object' ? entry.pnl : {};
    const cashflow = entry.cashflow && typeof entry.cashflow === 'object' ? entry.cashflow : {};
    const balanceSheet = entry.balanceSheet && typeof entry.balanceSheet === 'object' ? entry.balanceSheet : {};

    return {
        id: String(entry.id || `statement_${month.replace('-', '')}`),
        month,
        pnl: {
            income: Math.max(0, toFiniteNumber(pnl.income, 0)),
            operatingExpenses: Math.max(0, toFiniteNumber(pnl.operatingExpenses, 0)),
            debtService: Math.max(0, toFiniteNumber(pnl.debtService, 0)),
            growthSpend: Math.max(0, toFiniteNumber(pnl.growthSpend, 0)),
            netIncome: toFiniteNumber(pnl.netIncome, 0)
        },
        cashflow: {
            operatingCashFlow: toFiniteNumber(cashflow.operatingCashFlow, 0),
            investingCashFlow: toFiniteNumber(cashflow.investingCashFlow, 0),
            financingCashFlow: toFiniteNumber(cashflow.financingCashFlow, 0),
            freeCashFlow: toFiniteNumber(cashflow.freeCashFlow, 0),
            netCashFlow: toFiniteNumber(cashflow.netCashFlow, 0)
        },
        balanceSheet: {
            cash: toFiniteNumber(balanceSheet.cash, 0),
            receivables: toFiniteNumber(balanceSheet.receivables, 0),
            crypto: toFiniteNumber(balanceSheet.crypto, 0),
            debt: toFiniteNumber(balanceSheet.debt, 0),
            totalAssets: toFiniteNumber(balanceSheet.totalAssets, 0),
            totalLiabilities: toFiniteNumber(balanceSheet.totalLiabilities, 0),
            netWorth: toFiniteNumber(balanceSheet.netWorth, 0)
        },
        createdAt,
        lastModified: Math.max(
            0,
            toFiniteNumber(entry.lastModified, createdAt ? new Date(createdAt).getTime() : 0)
        )
    };
}

function normalizeDBSchema(rawDB) {
    const base = getDefaultDB();
    const db = { ...base, ...(rawDB || {}) };

    db.schema_version = Math.max(1, parseInt(db.schema_version || 1, 10));
    db.transactions = normalizeCollectionEntries(db.transactions);
    db.bills = normalizeCollectionEntries(db.bills);
    db.debts = normalizeCollectionEntries(db.debts);
    db.lent = normalizeCollectionEntries(db.lent);
    db.crypto = normalizeCollectionEntries(db.crypto);
    db.wishlist = normalizeCollectionEntries(db.wishlist);
    db.fixed_assets = normalizeCollectionEntries(db.fixed_assets);
    db.agm_records = normalizeCollectionEntries(db.agm_records);
    db.crypto_prices = db.crypto_prices || {};
    db.crypto_interest = normalizeCryptoInterestShape(db.crypto_interest);
    db.budgets = db.budgets && typeof db.budgets === 'object' ? db.budgets : { data: null };
    db.custom_categories = Array.isArray(db.custom_categories) ? db.custom_categories : [];
    db.investment_goals = Array.isArray(db.investment_goals) ? db.investment_goals : [];
    db.goals = Array.isArray(db.goals) ? db.goals : [];
    db.categorization_rules = Array.isArray(db.categorization_rules) ? db.categorization_rules : [];
    db.imports = Array.isArray(db.imports) ? db.imports : [];
    db.insight_snapshots = Array.isArray(db.insight_snapshots) ? db.insight_snapshots : [];
    db.monthly_closes = (Array.isArray(db.monthly_closes) ? db.monthly_closes : [])
        .map(normalizeMonthlyCloseEntry)
        .filter(Boolean)
        .sort((a, b) => (b.month || '').localeCompare(a.month || ''));
    db.kpi_targets = normalizeKpiTargetsShape(db.kpi_targets);
    db.kpi_snapshots = (Array.isArray(db.kpi_snapshots) ? db.kpi_snapshots : [])
        .map(normalizeKpiSnapshotEntry)
        .filter(Boolean)
        .sort((a, b) => (b.month || '').localeCompare(a.month || ''));
    db.forecast_assumptions = normalizeForecastAssumptionsShape(db.forecast_assumptions);
    db.forecast_runs = (Array.isArray(db.forecast_runs) ? db.forecast_runs : [])
        .map(normalizeForecastRunEntry)
        .filter(Boolean)
        .sort((a, b) => getEntryTimestamp(b) - getEntryTimestamp(a));
    db.statement_snapshots = (Array.isArray(db.statement_snapshots) ? db.statement_snapshots : [])
        .map(normalizeStatementSnapshotEntry)
        .filter(Boolean)
        .sort((a, b) => (b.month || '').localeCompare(a.month || ''));
    db.operations_guardrails = normalizeOperationsGuardrailsShape(db.operations_guardrails);
    db.undo_log = pruneUndoLog(dedupeUndoLogEntries(Array.isArray(db.undo_log) ? db.undo_log : []));

    db.recurring_transactions = (Array.isArray(db.recurring_transactions) ? db.recurring_transactions : [])
        .map(normalizeReminderShape)
        .filter(Boolean);

    db.sync = db.sync && typeof db.sync === 'object' ? db.sync : {};
    db.sync.revision = db.sync.revision || null;
    db.sync.lastKnownRemoteRevision = db.sync.lastKnownRemoteRevision || db.sync.revision || null;
    db.sync.updatedAt = db.sync.updatedAt || null;
    db.sync.conflictStrategy = db.sync.conflictStrategy || 'local_wins';

    db.schema_version = CURRENT_SCHEMA_VERSION;
    return db;
}

function toEntryMap(arr) {
    const map = new Map();
    (arr || []).forEach(item => {
        if (item && item.id) map.set(item.id, item);
    });
    return map;
}

function getEntryTimestamp(entry) {
    const raw = entry?.lastModified || entry?.createdAt || entry?.deletedAt || 0;
    const ts = typeof raw === 'number' ? raw : new Date(raw).getTime();
    return Number.isFinite(ts) ? ts : 0;
}

function mergeSafeList(localList, remoteList) {
    const merged = toEntryMap(remoteList);
    toEntryMap(localList).forEach((localItem, id) => {
        const remoteItem = merged.get(id);
        if (!remoteItem || getEntryTimestamp(localItem) >= getEntryTimestamp(remoteItem)) {
            merged.set(id, localItem);
        }
    });
    return Array.from(merged.values());
}

function mergeSafeDB(localDB, remoteDB) {
    const merged = normalizeDBSchema(remoteDB);
    const local = normalizeDBSchema(localDB);

    merged.transactions = mergeSafeList(local.transactions, merged.transactions);
    merged.bills = mergeSafeList(local.bills, merged.bills);
    merged.debts = mergeSafeList(local.debts, merged.debts);
    merged.lent = mergeSafeList(local.lent, merged.lent);
    merged.crypto = mergeSafeList(local.crypto, merged.crypto);
    merged.wishlist = mergeSafeList(local.wishlist, merged.wishlist);
    merged.fixed_assets = mergeSafeList(local.fixed_assets, merged.fixed_assets);
    merged.agm_records = mergeSafeList(local.agm_records, merged.agm_records);

    merged.custom_categories = Array.from(new Set([...(merged.custom_categories || []), ...(local.custom_categories || [])]));
    merged.goals = mergeSafeList(local.goals, merged.goals);
    merged.investment_goals = mergeSafeList(local.investment_goals, merged.investment_goals);
    merged.imports = mergeSafeList(local.imports, merged.imports);
    merged.monthly_closes = mergeSafeList(local.monthly_closes, merged.monthly_closes);
    merged.kpi_snapshots = mergeSafeList(local.kpi_snapshots, merged.kpi_snapshots);
    merged.forecast_runs = mergeSafeList(local.forecast_runs, merged.forecast_runs);
    merged.statement_snapshots = mergeSafeList(local.statement_snapshots, merged.statement_snapshots);
    merged.undo_log = pruneUndoLog(dedupeUndoLogEntries([...(merged.undo_log || []), ...(local.undo_log || [])]));

    const localKpiTargetTs = getEntryTimestamp(local.kpi_targets);
    const remoteKpiTargetTs = getEntryTimestamp(merged.kpi_targets);
    if (!merged.kpi_targets || localKpiTargetTs >= remoteKpiTargetTs) {
        merged.kpi_targets = local.kpi_targets;
    }

    const localForecastAssumptionsTs = getEntryTimestamp(local.forecast_assumptions);
    const remoteForecastAssumptionsTs = getEntryTimestamp(merged.forecast_assumptions);
    if (!merged.forecast_assumptions || localForecastAssumptionsTs >= remoteForecastAssumptionsTs) {
        merged.forecast_assumptions = local.forecast_assumptions;
    }

    const localOperationsGuardrailsTs = getEntryTimestamp(local.operations_guardrails);
    const remoteOperationsGuardrailsTs = getEntryTimestamp(merged.operations_guardrails);
    if (!merged.operations_guardrails || localOperationsGuardrailsTs >= remoteOperationsGuardrailsTs) {
        merged.operations_guardrails = local.operations_guardrails;
    }

    merged.categorization_rules = mergeSafeList(local.categorization_rules, merged.categorization_rules)
        .sort((a, b) => (a.priority || 999) - (b.priority || 999));

    merged.crypto_prices = { ...(merged.crypto_prices || {}) };
    Object.entries(local.crypto_prices || {}).forEach(([key, localPrice]) => {
        const remotePrice = merged.crypto_prices[key];
        if (!remotePrice || (localPrice.updated || 0) >= (remotePrice.updated || 0)) {
            merged.crypto_prices[key] = localPrice;
        }
    });

    merged.crypto_interest = { ...(merged.crypto_interest || {}) };
    Object.entries(local.crypto_interest || {}).forEach(([tokenId, localCfg]) => {
        const remoteCfg = merged.crypto_interest[tokenId];
        const localTs = Number(localCfg?.lastModified || 0);
        const remoteTs = Number(remoteCfg?.lastModified || 0);
        if (!remoteCfg || localTs >= remoteTs) {
            merged.crypto_interest[tokenId] = localCfg;
        }
    });

    merged.budgets = local.budgets?.data ? local.budgets : merged.budgets;
    merged.sync.conflictStrategy = local.sync?.conflictStrategy || merged.sync.conflictStrategy || 'merge_safe_lists';
    return normalizeDBSchema(merged);
}

function applyLocalOnlyFields(targetDB, localDB) {
    const target = normalizeDBSchema(targetDB);
    const local = normalizeDBSchema(localDB);
    target.crypto_prices = { ...(local.crypto_prices || {}) };
    return target;
}

function buildRemoteVaultPayload(db) {
    const remotePayload = normalizeDBSchema(db);
    delete remotePayload.crypto_prices;
    return remotePayload;
}

async function getDB() {
    let localDB = normalizeDBSchema(getDefaultDB());
    try {
        localDB = await getLocalDBSnapshot();
    } catch (e) {
        console.error('Local DB snapshot load failed, resetting to default schema.', e);
        localDB = normalizeDBSchema(getDefaultDB());
    }
    let resolvedDB = localDB;
    let loadedFromRemote = false;

    try {
        if (masterKey && firestoreDB) {
            const vaultId = await getVaultId(masterKey);
            const doc = await firestoreDB.collection('vaults').doc(vaultId).get();
            if (doc.exists) {
                const remoteDB = normalizeDBSchema(doc.data().vaultData || getDefaultDB());
                const strategy = localDB.sync?.conflictStrategy || remoteDB.sync?.conflictStrategy || 'merge_safe_lists';

                if (strategy === 'remote_wins') {
                    resolvedDB = remoteDB;
                } else {
                    // Merge at read time to avoid overwriting unsynced local edits with stale remote snapshots.
                    resolvedDB = mergeSafeDB(localDB, remoteDB);
                    resolvedDB.sync.conflictStrategy = strategy;
                    resolvedDB.sync.lastKnownRemoteRevision = remoteDB.sync?.revision || null;
                }
                resolvedDB = applyLocalOnlyFields(resolvedDB, localDB);
                loadedFromRemote = true;
                console.log(`✅ Loaded from Firebase (${strategy})`);
            }
        }
    } catch (error) {
        console.error('Firebase load failed, using localStorage:', error);
    }

    if (loadedFromRemote) {
        await persistLocalDBSnapshot(resolvedDB);
    }

    return normalizeDBSchema(resolvedDB);
}

async function saveDB(inputDB) {
    let db = normalizeDBSchema(inputDB);
    const localCryptoPrices = { ...(db.crypto_prices || {}) };
    // Lightweight sync diagnostics. Enable via `window.DEBUG_SYNC_DIAGNOSTICS = true`.
    try {
        if (typeof window !== 'undefined') {
            window.__syncDiagnostics = window.__syncDiagnostics || {
                count: 0,
                totalBytes: 0,
                lastBytes: 0,
                lastAt: 0
            };
        }
    } catch (_) { }

    const estimatedBytes = estimateSerializedBytes(db);
    try {
        if (typeof window !== 'undefined' && window.__syncDiagnostics) {
            window.__syncDiagnostics.count += 1;
            window.__syncDiagnostics.lastBytes = estimatedBytes;
            window.__syncDiagnostics.totalBytes += estimatedBytes;
            window.__syncDiagnostics.lastAt = Date.now();
        }
        if (typeof window !== 'undefined' && window.DEBUG_SYNC_DIAGNOSTICS) {
            console.log(`[sync] saveDB call #${window.__syncDiagnostics?.count || 0} ~${formatBytes(estimatedBytes)}`);
            // Useful to pinpoint callers that are saving too frequently.
            console.trace('[sync] saveDB stack');
        }
    } catch (_) { }

    const nowISO = new Date().toISOString();
    db.sync.updatedAt = nowISO;

    try {
        if (masterKey && firestoreDB) {
            const vaultId = await getVaultId(masterKey);
            const ref = firestoreDB.collection('vaults').doc(vaultId);
            const remoteDoc = await ref.get();
            const remoteDB = remoteDoc.exists ? normalizeDBSchema(remoteDoc.data().vaultData || getDefaultDB()) : null;

            if (remoteDB) {
                const remoteRev = remoteDB.sync?.revision || null;
                const knownRemoteRev = db.sync?.lastKnownRemoteRevision || null;
                const localRev = db.sync?.revision || null;
                const strategy = db.sync?.conflictStrategy || 'local_wins';
                const conflictDetected = !!(
                    remoteRev &&
                    ((knownRemoteRev && remoteRev !== knownRemoteRev) ||
                        (!knownRemoteRev && localRev && remoteRev !== localRev))
                );

                if (conflictDetected) {
                    if (strategy === 'remote_wins') {
                        db = remoteDB;
                    } else if (strategy === 'merge_safe_lists') {
                        db = mergeSafeDB(db, remoteDB);
                    }
                }
            }

            // Keep market prices local-only, regardless of conflict strategy.
            db.crypto_prices = localCryptoPrices;

            const newRevision = `rev_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
            db.sync.revision = newRevision;
            db.sync.lastKnownRemoteRevision = newRevision;
            db.sync.updatedAt = nowISO;

            await persistLocalDBSnapshot(db);

            await ref.set({
                vaultData: buildRemoteVaultPayload(db),
                kdfMeta: kdfMeta || null,
                kdfUpdatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                lastModified: firebase.firestore.FieldValue.serverTimestamp()
            });
            console.log('✅ Synced to Firebase');
            return db;
        }
    } catch (error) {
        console.error('❌ Firebase sync failed:', error);
    }

    // Local-only fallback
    const localRevision = `rev_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    db.sync.revision = localRevision;
    db.sync.lastKnownRemoteRevision = localRevision;
    db.sync.updatedAt = nowISO;
    await persistLocalDBSnapshot(db);
    return db;
}

function normalizeBridgeAmountToPHP(amount, currency) {
    const parsedAmount = Number(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) return 0;

    const fromCurrency = String(currency || 'PHP').toUpperCase();
    if (fromCurrency === 'PHP') return parsedAmount;

    const rate = Number(exchangeRates?.[fromCurrency]);
    if (!Number.isFinite(rate) || rate <= 0) {
        return parsedAmount;
    }

    return parsedAmount / rate;
}

function normalizeBridgeDateToISO(value) {
    if (!value) return new Date().toISOString();
    const ts = typeof value === 'number' ? value : new Date(value).getTime();
    if (!Number.isFinite(ts) || ts <= 0) return new Date().toISOString();
    return new Date(ts).toISOString();
}

async function importPendingMainTransactionsIntoFinance(previewRows = null) {
    const bridge = (typeof window !== 'undefined') ? window.FinanceBridgeQueue : null;
    if (!bridge || typeof bridge.listFinancePendingTransactions !== 'function') {
        return {
            checked: 0,
            imported: 0,
            skipped: 0,
            failed: 0,
            cleared: 0,
            saveFailed: false
        };
    }

    let pending = Array.isArray(previewRows) ? previewRows : [];
    if (!Array.isArray(previewRows)) {
        try {
            const rows = await bridge.listFinancePendingTransactions();
            pending = Array.isArray(rows) ? rows : [];
        } catch (error) {
            console.error('[bridge-import] Failed to load pending queue:', error);
            return {
                checked: 0,
                imported: 0,
                skipped: 0,
                failed: 0,
                cleared: 0,
                saveFailed: false
            };
        }
    }

    if (pending.length === 0) {
        return {
            checked: 0,
            imported: 0,
            skipped: 0,
            failed: 0,
            cleared: 0,
            saveFailed: false
        };
    }

    const db = await getDB();
    db.transactions = Array.isArray(db.transactions) ? db.transactions : [];

    const existingIds = new Set(
        db.transactions
            .map(item => (item && item.id) ? String(item.id) : '')
            .filter(Boolean)
    );

    const duplicateIds = [];
    const importedIds = [];
    let imported = 0;
    let skipped = 0;
    let failed = 0;

    for (const item of pending) {
        const queueId = String(item?.id || '').trim();
        if (!queueId) {
            failed += 1;
            continue;
        }

        const txId = `bridge_${queueId}`;
        if (existingIds.has(txId)) {
            skipped += 1;
            duplicateIds.push(queueId);
            continue;
        }

        const desc = String(item?.desc || '').trim();
        const amount = Number(item?.amt);
        if (!desc || !Number.isFinite(amount) || amount <= 0) {
            failed += 1;
            continue;
        }

        const type = item?.type === 'income' ? 'income' : 'expense';
        const currencyRaw = String(item?.currency || 'PHP').toUpperCase();
        const currency = (currencyRaw === 'USD' || currencyRaw === 'JPY' || currencyRaw === 'PHP') ? currencyRaw : 'PHP';
        const category = String(item?.category || '').trim() || (type === 'income' ? 'Salary' : 'Others');
        const quantityRaw = Number(item?.quantity);
        const quantity = Number.isFinite(quantityRaw) && quantityRaw > 0 ? quantityRaw : 1;
        const notes = String(item?.notes || '');
        const dateISO = normalizeBridgeDateToISO(item?.date);
        const amountInPHP = normalizeBridgeAmountToPHP(amount, currency);

        let encrypted;
        try {
            encrypted = await encryptData({
                desc,
                merchant: null,
                tags: [],
                amt: amountInPHP,
                originalAmt: amount,
                originalCurrency: currency,
                quantity,
                notes,
                type,
                category,
                date: dateISO,
                importId: `bridge_queue:${queueId}`,
                dedupeHash: `bridge_queue:${queueId}`,
                deletedAt: null
            });
        } catch (error) {
            console.error('[bridge-import] Failed to encrypt staged transaction:', error);
            failed += 1;
            continue;
        }

        db.transactions.push({
            id: txId,
            data: encrypted,
            createdAt: Number.isFinite(Number(item?.createdAt)) ? Number(item.createdAt) : Date.now(),
            lastModified: Date.now(),
            deletedAt: null
        });

        existingIds.add(txId);
        imported += 1;
        importedIds.push(queueId);
    }

    let saveFailed = false;
    if (importedIds.length > 0) {
        try {
            await saveDB(db);
        } catch (error) {
            saveFailed = true;
            console.error('[bridge-import] Failed to persist imported bridge transactions:', error);
        }
    }

    const idsToClear = [
        ...duplicateIds,
        ...(saveFailed ? [] : importedIds)
    ];

    let cleared = 0;
    if (idsToClear.length > 0 && typeof bridge.clearFinancePendingTransactions === 'function') {
        try {
            cleared = await bridge.clearFinancePendingTransactions(idsToClear);
        } catch (error) {
            console.error('[bridge-import] Failed to clear bridge queue entries:', error);
            cleared = 0;
        }
    }

    return {
        checked: pending.length,
        imported,
        skipped,
        failed,
        cleared,
        saveFailed
    };
}
