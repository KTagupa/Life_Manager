        // =============================================
        // SECTION 2: DATABASE & STORAGE
        // =============================================
        const DB_KEY = 'finance_flow_encrypted_v3';
        const BACKUP_SETTINGS_KEY = 'finance_flow_backup_settings_v1';
        const KDF_META_PREFIX = 'finance_flow_kdf_meta_v1_';
        const CURRENT_SCHEMA_VERSION = 2;
        const UNDO_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

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

        async function getDB() {
            let localDB = getDefaultDB();
            try {
                const localRaw = localStorage.getItem(DB_KEY);
                localDB = normalizeDBSchema(localRaw ? JSON.parse(localRaw) : getDefaultDB());
            } catch (e) {
                console.error('Local DB parse failed, resetting to default schema.', e);
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
                        loadedFromRemote = true;
                        console.log(`✅ Loaded from Firebase (${strategy})`);
                    }
                }
            } catch (error) {
                console.error('Firebase load failed, using localStorage:', error);
            }

            if (loadedFromRemote) {
                localStorage.setItem(DB_KEY, JSON.stringify(resolvedDB));
            }

            return normalizeDBSchema(resolvedDB);
        }

        async function saveDB(inputDB) {
            let db = normalizeDBSchema(inputDB);
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

                    const newRevision = `rev_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
                    db.sync.revision = newRevision;
                    db.sync.lastKnownRemoteRevision = newRevision;
                    db.sync.updatedAt = nowISO;

                    localStorage.setItem(DB_KEY, JSON.stringify(db));

                    await ref.set({
                        vaultData: db,
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
            localStorage.setItem(DB_KEY, JSON.stringify(db));
            return db;
        }
