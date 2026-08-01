// =============================================
// PHASE 5B: BACKUP, RESTORE, AND SYNC CONTRACT
// =============================================
// Pure validation and restore orchestration. This module never reads or writes
// the active vault; browser adapters in storage.js and backup.js own persistence.

(function exposeFinanceBackupContract(root, factory) {
    const api = factory();

    if (typeof module === 'object' && module.exports) module.exports = api;

    if (root) {
        root.FINANCE_BACKUP_CONTRACT_VERSION = api.VERSION;
        root.FINANCE_BACKUP_FORMAT_VERSION = api.BACKUP_FORMAT_VERSION;
        root.FINANCE_BACKUP_ENCRYPTED_COLLECTIONS = api.ENCRYPTED_COLLECTIONS;
        root.stableFinanceBackupStringify = api.stableStringify;
        root.computeFinanceBackupHash = api.computeFinanceBackupHash;
        root.createFinanceBackupPackage = api.createFinanceBackupPackage;
        root.validateFinanceBackupPackage = api.validateFinanceBackupPackage;
        root.verifyFinanceBackupDecryptability = api.verifyFinanceBackupDecryptability;
        root.createFinanceRestorePlan = api.createFinanceRestorePlan;
        root.executeFinanceRestoreTransaction = api.executeFinanceRestoreTransaction;
        root.getFinanceSyncRetryDelay = api.getFinanceSyncRetryDelay;
    }
})(typeof window !== 'undefined' ? window : globalThis, function buildFinanceBackupContract() {
    'use strict';

    const VERSION = '1.0.0';
    const BACKUP_FORMAT_VERSION = 2;
    const DEFAULT_MAX_SCHEMA_VERSION = 6;
    const ENCRYPTION_VERSION = 'AES-GCM-v3';
    const INTEGRITY_ALGORITHM = 'SHA-256';
    const CANONICAL_SERIALIZATION = 'canonical-json-v1';
    const LEGACY_SERIALIZATION = 'legacy-json-v1';
    const ENCRYPTED_COLLECTIONS = Object.freeze([
        'transactions',
        'bills',
        'debts',
        'credit_cards',
        'installment_plans',
        'lent',
        'crypto',
        'wishlist'
    ]);

    function deepFreeze(value) {
        if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
        Object.getOwnPropertyNames(value).forEach(key => deepFreeze(value[key]));
        return Object.freeze(value);
    }

    function clone(value) {
        if (typeof structuredClone === 'function') {
            try {
                return structuredClone(value);
            } catch (_) { }
        }
        return JSON.parse(JSON.stringify(value));
    }

    function canonicalize(value, stack = new Set()) {
        if (value && typeof value.toJSON === 'function') return canonicalize(value.toJSON(), stack);
        if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
        if (typeof value === 'number') return Number.isFinite(value) ? value : null;
        if (typeof value === 'bigint') throw new TypeError('BigInt values cannot be serialized in a Finance backup.');
        if (typeof value === 'undefined' || typeof value === 'function' || typeof value === 'symbol') return undefined;
        if (stack.has(value)) throw new TypeError('Circular values cannot be serialized in a Finance backup.');

        stack.add(value);
        let output;
        if (Array.isArray(value)) {
            output = value.map(item => {
                const normalized = canonicalize(item, stack);
                return normalized === undefined ? null : normalized;
            });
        } else {
            output = {};
            Object.keys(value).sort().forEach(key => {
                const normalized = canonicalize(value[key], stack);
                if (normalized !== undefined) output[key] = normalized;
            });
        }
        stack.delete(value);
        return output;
    }

    function stableStringify(value) {
        return JSON.stringify(canonicalize(value));
    }

    function getCryptoProvider(options = {}) {
        const provider = options.cryptoProvider || globalThis.crypto;
        if (!provider?.subtle || typeof provider.subtle.digest !== 'function') {
            throw new Error('Web Crypto SHA-256 support is required for Finance backups.');
        }
        return provider;
    }

    async function computeFinanceBackupHash(value, options = {}) {
        const serialization = options.serialization || CANONICAL_SERIALIZATION;
        if (![CANONICAL_SERIALIZATION, LEGACY_SERIALIZATION].includes(serialization)) {
            throw new Error(`Unsupported backup serialization: ${serialization}`);
        }
        const json = serialization === LEGACY_SERIALIZATION ? JSON.stringify(value) : stableStringify(value);
        const bytes = new TextEncoder().encode(json);
        const digest = await getCryptoProvider(options).subtle.digest('SHA-256', bytes);
        return Array.from(new Uint8Array(digest))
            .map(byte => byte.toString(16).padStart(2, '0'))
            .join('');
    }

    function isByteArray(value, expectedLength = null) {
        return Array.isArray(value)
            && (expectedLength == null || value.length === expectedLength)
            && value.every(byte => Number.isInteger(byte) && byte >= 0 && byte <= 255);
    }

    function isEncryptedPayload(value) {
        return !!(value
            && typeof value === 'object'
            && isByteArray(value.iv, 12)
            && isByteArray(value.content)
            && value.content.length >= 16);
    }

    function isHexSha256(value) {
        return typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value);
    }

    function base64ByteLength(value) {
        if (typeof value !== 'string' || value.length === 0 || value.length % 4 !== 0) return -1;
        if (!/^[A-Za-z0-9+/]*={0,2}$/.test(value)) return -1;
        const padding = value.endsWith('==') ? 2 : (value.endsWith('=') ? 1 : 0);
        return ((value.length / 4) * 3) - padding;
    }

    function containsPreviewPayload(value, visited = new Set()) {
        if (!value || typeof value !== 'object') return false;
        if (visited.has(value)) return false;
        visited.add(value);
        if (value.__previewPlain === true || Object.prototype.hasOwnProperty.call(value, 'previewDataUrl')) return true;
        return Object.values(value).some(item => containsPreviewPayload(item, visited));
    }

    function normalizeSchemaVersion(backup) {
        const topLevel = Number(backup?.schemaVersion);
        const dataLevel = Number(backup?.data?.schema_version);
        if (Number.isInteger(dataLevel) && dataLevel > 0) return dataLevel;
        if (Number.isInteger(topLevel) && topLevel > 0) return topLevel;
        return null;
    }

    function getBackupStats(backup, schemaVersion) {
        const data = backup?.data || {};
        const images = backup?.attachments?.installmentImages;
        return {
            schemaVersion,
            transactions: Array.isArray(data.transactions) ? data.transactions.length : 0,
            bills: Array.isArray(data.bills) ? data.bills.length : 0,
            debts: Array.isArray(data.debts) ? data.debts.length : 0,
            creditCards: Array.isArray(data.credit_cards) ? data.credit_cards.length : 0,
            installmentPlans: Array.isArray(data.installment_plans) ? data.installment_plans.length : 0,
            installmentImages: Array.isArray(images) ? images.length : 0,
            crypto: Array.isArray(data.crypto) ? data.crypto.length : 0,
            budgets: Number(backup?.metadata?.budgetCategoryCount || 0)
        };
    }

    function validateEncryptedCollections(data, issues) {
        ENCRYPTED_COLLECTIONS.forEach(key => {
            if (data[key] != null && !Array.isArray(data[key])) {
                issues.push(`${key} must be an array.`);
                return;
            }
            (data[key] || []).forEach((item, index) => {
                if (!item || typeof item !== 'object') {
                    issues.push(`Invalid record in ${key}[${index}].`);
                    return;
                }
                if (!isEncryptedPayload(item.data)) {
                    issues.push(`Invalid AES-GCM payload in ${key}[${index}].`);
                }
            });
        });

        if (data.budgets?.data != null && !isEncryptedPayload(data.budgets.data)) {
            issues.push('Invalid AES-GCM payload in budgets.data.');
        }
        if (data.vault_probe != null && !isEncryptedPayload(data.vault_probe)) {
            issues.push('Invalid AES-GCM vault probe.');
        }
    }

    function validateAttachments(backup, issues) {
        const attachments = backup.attachments;
        if (!attachments || typeof attachments !== 'object' || Array.isArray(attachments)) {
            issues.push('Missing attachments block.');
            return;
        }
        const records = attachments.installmentImages;
        if (!Array.isArray(records)) {
            issues.push('attachments.installmentImages must be an array.');
            return;
        }

        const keys = new Set();
        records.forEach((record, index) => {
            const prefix = `attachments.installmentImages[${index}]`;
            if (!record || typeof record !== 'object') {
                issues.push(`${prefix} must be an object.`);
                return;
            }
            const key = String(record.key || '');
            if (!/^[A-Za-z0-9_-]{1,180}$/.test(key)) issues.push(`${prefix} has an invalid key.`);
            if (keys.has(key)) issues.push(`${prefix} duplicates attachment key ${key}.`);
            keys.add(key);
            if (record.deletedAt) issues.push(`${prefix} is a tombstone, not an active backup attachment.`);
            if (Object.prototype.hasOwnProperty.call(record, 'previewDataUrl')) {
                issues.push(`${prefix} contains Preview Mode plaintext.`);
            }
            if (base64ByteLength(record.ivB64) !== 12) issues.push(`${prefix} has an invalid AES-GCM IV.`);
            if (base64ByteLength(record.contentB64) < 16) issues.push(`${prefix} has invalid encrypted content.`);
            if (record.mimeType != null && !/^image\/[A-Za-z0-9.+-]+$/.test(String(record.mimeType))) {
                issues.push(`${prefix} has an invalid image MIME type.`);
            }
        });
    }

    async function validateFinanceBackupPackage(backup, options = {}) {
        const issues = [];
        const warnings = [];
        if (!backup || typeof backup !== 'object' || Array.isArray(backup)) {
            return deepFreeze({ ok: false, issues: ['Backup payload is not an object.'], warnings, stats: null });
        }
        if (!backup.data || typeof backup.data !== 'object' || Array.isArray(backup.data)) {
            return deepFreeze({ ok: false, issues: ['Missing data block.'], warnings, stats: null });
        }

        const formatVersion = backup.backupFormatVersion == null ? 1 : Number(backup.backupFormatVersion);
        if (!Number.isInteger(formatVersion) || formatVersion < 1) issues.push('Invalid backup format version.');
        if (formatVersion > BACKUP_FORMAT_VERSION) issues.push('This backup was created by a newer Finance backup format.');
        if (typeof backup.appVersion !== 'string' || !backup.appVersion.trim()) issues.push('Missing app version.');
        const backupDate = new Date(backup.backupDate);
        if (typeof backup.backupDate !== 'string' || !Number.isFinite(backupDate.getTime())) issues.push('Invalid backup date.');
        if (backup.encryptionVersion !== ENCRYPTION_VERSION) issues.push(`Unsupported encryption version: ${backup.encryptionVersion || 'missing'}.`);

        const schemaVersion = normalizeSchemaVersion(backup);
        const maxSchemaVersion = Number(options.maxSchemaVersion || DEFAULT_MAX_SCHEMA_VERSION);
        if (!schemaVersion) issues.push('Invalid schema version.');
        if (schemaVersion && schemaVersion > maxSchemaVersion) {
            issues.push(`Schema version ${schemaVersion} is newer than supported version ${maxSchemaVersion}.`);
        }
        if (schemaVersion && Number(backup.schemaVersion) > 0 && Number(backup.schemaVersion) !== schemaVersion) {
            issues.push('Top-level and vault schema versions do not match.');
        }

        if (containsPreviewPayload(backup.data) || containsPreviewPayload(backup.attachments)) {
            issues.push('Preview Mode plaintext cannot be restored into an encrypted vault.');
        }
        validateEncryptedCollections(backup.data, issues);
        validateAttachments(backup, issues);

        const integrity = backup.integrity;
        if (!integrity || typeof integrity !== 'object') {
            issues.push('Missing integrity block.');
        } else {
            if (integrity.algorithm !== INTEGRITY_ALGORITHM) issues.push('Unsupported or missing integrity algorithm.');
            if (!isHexSha256(integrity.hash)) issues.push('Missing or invalid data integrity hash.');
            if (!isHexSha256(integrity.attachmentsHash)) issues.push('Missing or invalid attachment integrity hash.');
            const serialization = integrity.serialization || LEGACY_SERIALIZATION;
            if (![CANONICAL_SERIALIZATION, LEGACY_SERIALIZATION].includes(serialization)) {
                issues.push('Unsupported integrity serialization.');
            } else {
                if (isHexSha256(integrity.hash)) {
                    const actual = await computeFinanceBackupHash(backup.data, { ...options, serialization });
                    if (actual !== integrity.hash.toLowerCase()) issues.push('Data integrity hash mismatch.');
                }
                if (isHexSha256(integrity.attachmentsHash)) {
                    const actual = await computeFinanceBackupHash(backup.attachments, { ...options, serialization });
                    if (actual !== integrity.attachmentsHash.toLowerCase()) issues.push('Attachment integrity hash mismatch.');
                }
            }
        }

        if (formatVersion === 1) warnings.push('Legacy JSON hash format verified; a new backup will upgrade the format.');

        return deepFreeze({
            ok: issues.length === 0,
            issues,
            warnings,
            stats: getBackupStats(backup, schemaVersion),
            compatibility: {
                formatVersion,
                schemaVersion,
                encryptionVersion: backup.encryptionVersion || null
            }
        });
    }

    async function createFinanceBackupPackage(input = {}, options = {}) {
        if (!input.db || typeof input.db !== 'object') throw new TypeError('A vault database is required.');
        const data = clone(input.db);
        const installmentImages = clone(Array.isArray(input.installmentImages) ? input.installmentImages : []);
        if (containsPreviewPayload(data) || containsPreviewPayload(installmentImages)) {
            throw new Error('Preview Mode data cannot be packaged as an encrypted recovery backup.');
        }
        const schemaVersion = Number(data.schema_version || options.schemaVersion || DEFAULT_MAX_SCHEMA_VERSION);
        const attachments = { installmentImages };
        const metadata = {
            ...(input.metadata || {}),
            budgetCategoryCount: Number(input.metadata?.budgetCategoryCount || 0),
            transactionCount: Array.isArray(data.transactions) ? data.transactions.length : 0,
            installmentImageCount: installmentImages.length,
            conflictStrategy: data.sync?.conflictStrategy || 'local_wins'
        };
        const integrity = {
            algorithm: INTEGRITY_ALGORITHM,
            serialization: CANONICAL_SERIALIZATION,
            hash: await computeFinanceBackupHash(data, options),
            attachmentsHash: await computeFinanceBackupHash(attachments, options)
        };
        return {
            appVersion: String(options.appVersion || '4.1'),
            backupFormatVersion: BACKUP_FORMAT_VERSION,
            backupContractVersion: VERSION,
            backupDate: options.backupDate || new Date().toISOString(),
            schemaVersion,
            encryptionVersion: ENCRYPTION_VERSION,
            metadata,
            integrity,
            data,
            attachments
        };
    }

    async function verifyFinanceBackupDecryptability(backup, adapters = {}) {
        if (typeof adapters.decryptPayload !== 'function' || typeof adapters.decryptAttachment !== 'function') {
            throw new TypeError('Backup decryption adapters are required.');
        }
        const issues = [];
        const encryptedRecords = [];
        ENCRYPTED_COLLECTIONS.forEach(collection => {
            (backup?.data?.[collection] || []).forEach((record, index) => {
                encryptedRecords.push({ label: `${collection}[${index}]`, payload: record?.data });
            });
        });
        if (backup?.data?.budgets?.data) {
            encryptedRecords.push({ label: 'budgets.data', payload: backup.data.budgets.data });
        }
        if (backup?.data?.vault_probe) {
            encryptedRecords.push({ label: 'vault_probe', payload: backup.data.vault_probe });
        }

        for (const record of encryptedRecords) {
            try {
                const decrypted = await adapters.decryptPayload(record.payload);
                if (decrypted == null) issues.push(`Could not authenticate ${record.label} with this vault key.`);
            } catch (_) {
                issues.push(`Could not authenticate ${record.label} with this vault key.`);
            }
        }

        const attachments = backup?.attachments?.installmentImages || [];
        for (let index = 0; index < attachments.length; index += 1) {
            try {
                const dataUrl = await adapters.decryptAttachment(attachments[index]);
                if (!String(dataUrl || '').startsWith('data:image/')) {
                    issues.push(`Could not authenticate attachments.installmentImages[${index}] with this vault key.`);
                }
            } catch (_) {
                issues.push(`Could not authenticate attachments.installmentImages[${index}] with this vault key.`);
            }
        }

        return deepFreeze({
            ok: issues.length === 0,
            issues,
            encryptedRecordCount: encryptedRecords.length,
            attachmentCount: attachments.length
        });
    }

    function createFinanceRestorePlan(backup, validation) {
        if (!validation?.ok) throw new Error('A validated Finance backup is required to create a restore plan.');
        return deepFreeze({
            backupDate: backup.backupDate,
            schemaVersion: validation.stats.schemaVersion,
            dataHash: backup.integrity.hash,
            data: clone(backup.data),
            installmentImages: clone(backup.attachments.installmentImages),
            counts: clone(validation.stats)
        });
    }

    async function executeFinanceRestoreTransaction(plan, adapters = {}) {
        const required = ['readDB', 'readAttachments', 'writeDB', 'replaceAttachments', 'reload'];
        required.forEach(name => {
            if (typeof adapters[name] !== 'function') throw new TypeError(`Restore adapter ${name} is required.`);
        });

        const originalDB = clone(await adapters.readDB());
        const originalAttachments = clone(await adapters.readAttachments());
        const events = [];

        try {
            await adapters.writeDB(clone(plan.data));
            events.push('database-written');
            await adapters.replaceAttachments(clone(plan.installmentImages));
            events.push('attachments-written');
            await adapters.reload();
            events.push('local-reload-complete');
        } catch (cause) {
            const rollbackIssues = [];
            if (typeof adapters.rollbackAttachments === 'function') {
                try {
                    await adapters.rollbackAttachments(clone(originalAttachments));
                    events.push('attachments-rolled-back');
                } catch (error) {
                    rollbackIssues.push(`Attachment rollback failed: ${error?.message || error}`);
                }
            }
            if (typeof adapters.rollbackDB === 'function') {
                try {
                    await adapters.rollbackDB(clone(originalDB));
                    events.push('database-rolled-back');
                } catch (error) {
                    rollbackIssues.push(`Database rollback failed: ${error?.message || error}`);
                }
            }
            try {
                await adapters.reload({ rollback: true });
                events.push('rollback-reload-complete');
            } catch (error) {
                rollbackIssues.push(`Rollback reload failed: ${error?.message || error}`);
            }

            const restoreError = new Error(`Restore failed and was rolled back: ${cause?.message || cause}`);
            restoreError.name = 'FinanceRestoreError';
            restoreError.cause = cause;
            restoreError.rollbackIssues = rollbackIssues;
            restoreError.events = events;
            throw restoreError;
        }

        let remoteQueued = false;
        let remoteQueueError = null;
        if (typeof adapters.queueRemote === 'function') {
            try {
                await adapters.queueRemote();
                remoteQueued = true;
                events.push('remote-sync-queued');
            } catch (error) {
                remoteQueueError = error?.message || String(error);
                events.push('remote-sync-pending');
            }
        }

        return deepFreeze({
            restored: true,
            rolledBack: false,
            remoteQueued,
            remoteQueueError,
            counts: clone(plan.counts),
            events
        });
    }

    function getFinanceSyncRetryDelay(attempt, options = {}) {
        const safeAttempt = Math.max(1, Math.floor(Number(attempt) || 1));
        const baseMs = Math.max(100, Number(options.baseMs) || 1000);
        const maxMs = Math.max(baseMs, Number(options.maxMs) || 60000);
        const exponential = Math.min(maxMs, baseMs * (2 ** Math.min(safeAttempt - 1, 20)));
        const jitterRatio = Math.max(0, Math.min(0.5, Number(options.jitterRatio) || 0));
        if (jitterRatio === 0) return Math.round(exponential);
        const random = typeof options.random === 'function' ? options.random() : Math.random();
        const multiplier = 1 - jitterRatio + (Math.max(0, Math.min(1, random)) * jitterRatio * 2);
        return Math.round(Math.min(maxMs, exponential * multiplier));
    }

    return deepFreeze({
        VERSION,
        BACKUP_FORMAT_VERSION,
        DEFAULT_MAX_SCHEMA_VERSION,
        ENCRYPTION_VERSION,
        INTEGRITY_ALGORITHM,
        CANONICAL_SERIALIZATION,
        LEGACY_SERIALIZATION,
        ENCRYPTED_COLLECTIONS,
        stableStringify,
        computeFinanceBackupHash,
        isEncryptedPayload,
        createFinanceBackupPackage,
        validateFinanceBackupPackage,
        verifyFinanceBackupDecryptability,
        createFinanceRestorePlan,
        executeFinanceRestoreTransaction,
        getFinanceSyncRetryDelay
    });
});
