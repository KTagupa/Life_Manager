        // =============================================
        // SECTION 2: DATABASE & STORAGE
        // =============================================
        const DB_KEY = 'finance_flow_encrypted_v3';
        const BACKUP_SETTINGS_KEY = 'finance_flow_backup_settings_v1';
        const KDF_META_PREFIX = 'finance_flow_kdf_meta_v1_';
        const CURRENT_SCHEMA_VERSION = 2;
        const UNDO_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
        const LOCAL_DB_NAME = 'finance_flow_local_v1';
        const LOCAL_DB_VERSION = 1;
        const LOCAL_DB_STORE = 'app_kv';

        let localIndexedDBPromise = null;

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
                db.goals,
                db.investment_goals,
                db.categorization_rules,
                db.imports,
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
            let localStorageDB = rawLocalStorageDB ? normalizeDBSchema(rawLocalStorageDB) : null;
            let indexedDBData = null;
            try {
                const rawIDB = await readDBFromIndexedDB();
                indexedDBData = rawIDB ? normalizeDBSchema(rawIDB) : null;
            } catch (error) {
                console.error('IndexedDB local snapshot read failed.', error);
                indexedDBData = null;
            }

            const preferred = choosePreferredLocalDB(localStorageDB, indexedDBData);
            const resolved = normalizeDBSchema(preferred.db);

            const resolvedStr = JSON.stringify(resolved);
            const localStr = localStorageDB ? JSON.stringify(localStorageDB) : null;
            const idbStr = indexedDBData ? JSON.stringify(indexedDBData) : null;

            // Keep both local stores aligned after reads, but avoid redundant writes.
            if (idbStr !== resolvedStr) {
                await writeDBToIndexedDB(resolved);
            }
            if (localStr !== resolvedStr) {
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
                wishlist: (safe.wishlist || []).filter(i => i && !i.deletedAt).length
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
            ta.setAttribute('readonly', '');
            ta.style.position = 'fixed';
            ta.style.left = '-9999px';
            ta.style.top = '0';
            document.body.appendChild(ta);
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

        async function copyStorageDiagnosticsJSON() {
            setDiagText('diag-status', 'Preparing diagnostics JSON...');
            try {
                const diagnostics = await getStorageDiagnostics();
                const payload = {
                    exportedAt: new Date().toISOString(),
                    appId: typeof appId !== 'undefined' ? appId : null,
                    diagnostics
                };
                const json = JSON.stringify(payload, null, 2);

                let copied = false;
                if (navigator.clipboard && window.isSecureContext) {
                    try {
                        await navigator.clipboard.writeText(json);
                        copied = true;
                    } catch (_) {
                        copied = false;
                    }
                }
                if (!copied) copied = copyTextFallback(json);
                if (!copied) throw new Error('Clipboard copy failed');

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
                    `Tx ${diag.counts.transactions} • Bills ${diag.counts.bills} • Debts ${diag.counts.debts} • Lent ${diag.counts.lent} • Crypto ${diag.counts.crypto} • Wishlist ${diag.counts.wishlist}`
                );
                setDiagText('diag-status', `Last refresh: ${new Date().toLocaleTimeString()}`);
            } catch (error) {
                console.error('Storage diagnostics refresh failed.', error);
                setDiagText('diag-status', 'Could not refresh diagnostics');
            }
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
                wishlist: [],
                budgets: { data: null },
                custom_categories: [],
                recurring_transactions: [],
                investment_goals: [],
                goals: [],
                categorization_rules: [],
                imports: [],
                insight_snapshots: [],
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
            db.crypto_prices = db.crypto_prices || {};
            db.budgets = db.budgets && typeof db.budgets === 'object' ? db.budgets : { data: null };
            db.custom_categories = Array.isArray(db.custom_categories) ? db.custom_categories : [];
            db.investment_goals = Array.isArray(db.investment_goals) ? db.investment_goals : [];
            db.goals = Array.isArray(db.goals) ? db.goals : [];
            db.categorization_rules = Array.isArray(db.categorization_rules) ? db.categorization_rules : [];
            db.imports = Array.isArray(db.imports) ? db.imports : [];
            db.insight_snapshots = Array.isArray(db.insight_snapshots) ? db.insight_snapshots : [];
            db.undo_log = pruneUndoLog(Array.isArray(db.undo_log) ? db.undo_log : []);

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

            merged.custom_categories = Array.from(new Set([...(merged.custom_categories || []), ...(local.custom_categories || [])]));
            merged.goals = mergeSafeList(local.goals, merged.goals);
            merged.investment_goals = mergeSafeList(local.investment_goals, merged.investment_goals);
            merged.imports = mergeSafeList(local.imports, merged.imports);
            merged.undo_log = pruneUndoLog([...(merged.undo_log || []), ...(local.undo_log || [])]);

            merged.categorization_rules = mergeSafeList(local.categorization_rules, merged.categorization_rules)
                .sort((a, b) => (a.priority || 999) - (b.priority || 999));

            merged.crypto_prices = { ...(merged.crypto_prices || {}) };
            Object.entries(local.crypto_prices || {}).forEach(([key, localPrice]) => {
                const remotePrice = merged.crypto_prices[key];
                if (!remotePrice || (localPrice.updated || 0) >= (remotePrice.updated || 0)) {
                    merged.crypto_prices[key] = localPrice;
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
