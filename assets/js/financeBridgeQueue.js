(function (global) {
    'use strict';

    const BRIDGE_DB_NAME = 'lifeManagerBridgeDB';
    const BRIDGE_DB_VERSION = 1;
    const BRIDGE_STORE_NAME = 'pendingFinanceTransactions';
    const BRIDGE_FALLBACK_KEY = 'finance_pending_tx_queue_v1';
    const MAX_PENDING_TRANSACTIONS = 500;

    function isObject(value) {
        return !!value && typeof value === 'object' && !Array.isArray(value);
    }

    function canUseIndexedDB() {
        return typeof indexedDB !== 'undefined';
    }

    function closeSafely(db) {
        if (!db) return;
        try {
            db.close();
        } catch (_) {
            // Ignore close errors.
        }
    }

    function openBridgeDB() {
        return new Promise((resolve, reject) => {
            if (!canUseIndexedDB()) {
                resolve(null);
                return;
            }

            let request;
            try {
                request = indexedDB.open(BRIDGE_DB_NAME, BRIDGE_DB_VERSION);
            } catch (error) {
                reject(error);
                return;
            }

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(BRIDGE_STORE_NAME)) {
                    db.createObjectStore(BRIDGE_STORE_NAME, { keyPath: 'id' });
                }
            };

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error || new Error('Failed to open bridge IndexedDB.'));
        });
    }

    function makeBridgeId() {
        return `ptx_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    }

    function normalizeType(value) {
        return value === 'income' ? 'income' : 'expense';
    }

    function normalizeCurrency(value) {
        const raw = String(value || '').trim().toUpperCase();
        if (raw === 'USD' || raw === 'JPY' || raw === 'PHP') return raw;
        return 'PHP';
    }

    function normalizeDate(value) {
        if (!value) return new Date().toISOString();
        const ts = typeof value === 'number' ? value : new Date(value).getTime();
        if (!Number.isFinite(ts) || ts <= 0) return new Date().toISOString();
        return new Date(ts).toISOString();
    }

    function normalizeCreatedAt(value) {
        const ts = Number(value);
        if (!Number.isFinite(ts) || ts <= 0) return Date.now();
        return Math.floor(ts);
    }

    function normalizePendingFinanceTransaction(rawInput) {
        if (!isObject(rawInput)) return null;

        const desc = String(rawInput.desc || '').trim();
        if (!desc) return null;

        const amt = Number(rawInput.amt);
        if (!Number.isFinite(amt) || amt <= 0) return null;

        const type = normalizeType(rawInput.type);
        const category = String(rawInput.category || '').trim() || (type === 'income' ? 'Salary' : 'Others');
        const notes = String(rawInput.notes || '').trim();

        const quantityRaw = Number(rawInput.quantity);
        const quantity = Number.isFinite(quantityRaw) && quantityRaw > 0 ? quantityRaw : 1;

        const idRaw = String(rawInput.id || '').trim();

        return {
            id: idRaw || makeBridgeId(),
            createdAt: normalizeCreatedAt(rawInput.createdAt),
            source: String(rawInput.source || 'main-page').trim() || 'main-page',
            desc,
            amt,
            currency: normalizeCurrency(rawInput.currency),
            type,
            category,
            date: normalizeDate(rawInput.date),
            quantity,
            notes
        };
    }

    function sortPendingRows(rows) {
        return rows
            .filter(Boolean)
            .sort((a, b) => {
                const aTs = Number(a.createdAt || 0);
                const bTs = Number(b.createdAt || 0);
                if (aTs !== bTs) return aTs - bTs;
                return String(a.id || '').localeCompare(String(b.id || ''));
            });
    }

    function readFallbackRows() {
        if (typeof localStorage === 'undefined') return [];
        try {
            const raw = localStorage.getItem(BRIDGE_FALLBACK_KEY);
            if (!raw) return [];
            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed)) return [];
            return sortPendingRows(parsed.map(normalizePendingFinanceTransaction).filter(Boolean));
        } catch (error) {
            console.warn('[financeBridgeQueue] Failed to parse fallback queue:', error);
            return [];
        }
    }

    function writeFallbackRows(rows) {
        if (typeof localStorage === 'undefined') return;
        try {
            localStorage.setItem(BRIDGE_FALLBACK_KEY, JSON.stringify(rows));
        } catch (error) {
            console.warn('[financeBridgeQueue] Failed to write fallback queue:', error);
        }
    }

    function upsertFallbackRow(row) {
        if (!row || !row.id) return;
        const rows = readFallbackRows();
        const id = String(row.id);
        const idx = rows.findIndex(item => String(item.id || '') === id);
        if (idx >= 0) {
            rows[idx] = row;
        } else {
            rows.push(row);
        }
        writeFallbackRows(sortPendingRows(rows));
    }

    async function listRowsFromIndexedDB() {
        const db = await openBridgeDB();
        if (!db) return null;

        return new Promise((resolve, reject) => {
            let settled = false;
            const finish = (fn, payload) => {
                if (settled) return;
                settled = true;
                closeSafely(db);
                fn(payload);
            };

            let tx;
            try {
                tx = db.transaction([BRIDGE_STORE_NAME], 'readonly');
            } catch (error) {
                finish(reject, error);
                return;
            }

            const store = tx.objectStore(BRIDGE_STORE_NAME);
            const req = store.getAll();

            req.onsuccess = () => {
                const rows = Array.isArray(req.result) ? req.result : [];
                const normalized = sortPendingRows(rows.map(normalizePendingFinanceTransaction).filter(Boolean));
                finish(resolve, normalized);
            };

            req.onerror = () => {
                finish(reject, req.error || tx.error || new Error('Failed to read bridge queue.'));
            };

            tx.onabort = () => {
                finish(reject, tx.error || new Error('Bridge queue read transaction aborted.'));
            };
        });
    }

    async function queueRowInIndexedDB(row) {
        const db = await openBridgeDB();
        if (!db) return false;

        return new Promise((resolve, reject) => {
            let settled = false;
            const finish = (fn, payload) => {
                if (settled) return;
                settled = true;
                closeSafely(db);
                fn(payload);
            };

            let tx;
            try {
                tx = db.transaction([BRIDGE_STORE_NAME], 'readwrite');
            } catch (error) {
                finish(reject, error);
                return;
            }

            const store = tx.objectStore(BRIDGE_STORE_NAME);
            const putReq = store.put(row);

            putReq.onerror = () => {
                finish(reject, putReq.error || tx.error || new Error('Failed to queue bridge transaction.'));
            };

            tx.oncomplete = () => finish(resolve, true);
            tx.onerror = () => finish(reject, tx.error || new Error('Bridge queue write transaction failed.'));
            tx.onabort = () => finish(reject, tx.error || new Error('Bridge queue write transaction aborted.'));
        });
    }

    async function clearRowsFromIndexedDB(ids) {
        const db = await openBridgeDB();
        if (!db) return 0;

        return new Promise((resolve, reject) => {
            let settled = false;
            const finish = (fn, payload) => {
                if (settled) return;
                settled = true;
                closeSafely(db);
                fn(payload);
            };

            let tx;
            try {
                tx = db.transaction([BRIDGE_STORE_NAME], 'readwrite');
            } catch (error) {
                finish(reject, error);
                return;
            }

            const store = tx.objectStore(BRIDGE_STORE_NAME);
            if (!Array.isArray(ids) || ids.length === 0) {
                const clearReq = store.clear();
                clearReq.onerror = () => {
                    finish(reject, clearReq.error || tx.error || new Error('Failed to clear bridge queue.'));
                };
            } else {
                ids.forEach((id) => {
                    try {
                        store.delete(id);
                    } catch (_) {
                        // Continue deleting remaining IDs.
                    }
                });
            }

            tx.oncomplete = () => finish(resolve, Array.isArray(ids) ? ids.length : 0);
            tx.onerror = () => finish(reject, tx.error || new Error('Bridge queue delete transaction failed.'));
            tx.onabort = () => finish(reject, tx.error || new Error('Bridge queue delete transaction aborted.'));
        });
    }

    function clearFallbackRowsByIds(ids) {
        const fallbackRows = readFallbackRows();
        if (ids.length === 0) {
            const cleared = fallbackRows.length;
            writeFallbackRows([]);
            return cleared;
        }
        const idSet = new Set(ids);
        const nextRows = fallbackRows.filter(row => !idSet.has(String(row.id || '')));
        const cleared = fallbackRows.length - nextRows.length;
        writeFallbackRows(nextRows);
        return cleared;
    }

    async function listFinancePendingTransactions() {
        let idbRows = null;
        try {
            const rows = await listRowsFromIndexedDB();
            if (Array.isArray(rows)) idbRows = rows;
        } catch (error) {
            console.warn('[financeBridgeQueue] IndexedDB list failed, using fallback queue:', error);
        }

        const fallbackRows = readFallbackRows();
        if (!Array.isArray(idbRows)) return fallbackRows;
        if (fallbackRows.length === 0) return idbRows;

        const merged = [...idbRows];
        const seen = new Set(idbRows.map(item => String(item.id || '')));
        fallbackRows.forEach((row) => {
            const id = String(row.id || '');
            if (!id || seen.has(id)) return;
            seen.add(id);
            merged.push(row);
        });
        return sortPendingRows(merged);
    }

    async function queueFinancePendingTransaction(rawInput) {
        const normalized = normalizePendingFinanceTransaction(rawInput);
        if (!normalized) {
            throw new Error('Invalid transaction. Description and amount are required.');
        }

        const existing = await listFinancePendingTransactions();
        const isExistingId = existing.some(item => String(item.id || '') === String(normalized.id || ''));
        if (!isExistingId && existing.length >= MAX_PENDING_TRANSACTIONS) {
            throw new Error(`Pending queue is full (${MAX_PENDING_TRANSACTIONS} items). Import or clear pending entries first.`);
        }

        try {
            await queueRowInIndexedDB(normalized);
            clearFallbackRowsByIds([String(normalized.id)]);
            return normalized;
        } catch (error) {
            console.warn('[financeBridgeQueue] IndexedDB queue failed, using fallback queue:', error);
        }

        upsertFallbackRow(normalized);
        return normalized;
    }

    async function clearFinancePendingTransactions(ids) {
        const uniqueIds = Array.isArray(ids)
            ? Array.from(new Set(ids.map(id => String(id || '').trim()).filter(Boolean)))
            : [];

        let clearedIndexedDB = 0;
        try {
            if (uniqueIds.length === 0) {
                const existingRows = await listRowsFromIndexedDB();
                const existingCount = Array.isArray(existingRows) ? existingRows.length : 0;
                await clearRowsFromIndexedDB([]);
                clearedIndexedDB = existingCount;
            } else {
                await clearRowsFromIndexedDB(uniqueIds);
                clearedIndexedDB = uniqueIds.length;
            }
        } catch (error) {
            console.warn('[financeBridgeQueue] IndexedDB clear failed, using fallback queue:', error);
        }

        const clearedFallback = clearFallbackRowsByIds(uniqueIds);
        return Math.max(clearedIndexedDB, clearedFallback);
    }

    async function clearAllFinancePendingTransactions() {
        return clearFinancePendingTransactions([]);
    }

    const api = {
        BRIDGE_DB_NAME,
        BRIDGE_STORE_NAME,
        BRIDGE_FALLBACK_KEY,
        MAX_PENDING_TRANSACTIONS,
        normalizePendingFinanceTransaction,
        listFinancePendingTransactions,
        queueFinancePendingTransaction,
        clearFinancePendingTransactions,
        clearAllFinancePendingTransactions
    };

    global.FinanceBridgeQueue = api;
})(window);
