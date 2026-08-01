(function exposeFinanceToolsPresentation(root, factory) {
    const api = factory();

    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) {
        root.FINANCE_TOOLS_PRESENTATION_VERSION = api.VERSION;
        root.buildFinanceToolsPresentation = api.buildFinanceToolsPresentation;
        root.validateFinanceToolsPresentation = api.validate;
    }
})(typeof window !== 'undefined' ? window : globalThis, function buildFinanceToolsPresentationModule() {
    'use strict';

    const VERSION = '1.0.0';
    const BACKUP_STALE_MS = 7 * 24 * 60 * 60 * 1000;

    function deepFreeze(value) {
        if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
        Object.values(value).forEach(deepFreeze);
        return Object.freeze(value);
    }

    function timestamp(value) {
        if (value == null || value === '') return null;
        const parsed = typeof value === 'number' ? value : new Date(value).getTime();
        return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    }

    function formatDateTime(value) {
        const parsed = timestamp(value);
        return parsed ? new Date(parsed).toLocaleString() : 'Never';
    }

    function status(id, label, value, detail, tone, action = null) {
        return { id, label, value, detail, tone, action };
    }

    function buildModeStatus(input) {
        if (input.previewMode) {
            return status(
                'mode', 'Session', 'Preview Mode',
                'Demo data stays in memory. Vault safeguards and cloud configuration are paused.',
                'preview'
            );
        }
        if (!input.unlocked) {
            return status('mode', 'Session', 'Vault locked', 'Unlock the vault to use its data safeguards.', 'attention');
        }
        return status('mode', 'Session', 'Encrypted vault', 'Safeguard actions apply to the active encrypted vault.', 'healthy');
    }

    function buildBackupStatus(input, now) {
        const settings = input.backupSettings || {};
        const lastBackup = timestamp(settings.lastBackupTime);
        if (input.previewMode) {
            return status('backup', 'Recovery file', 'Paused in Preview', 'Open the encrypted vault to create or restore backups.', 'preview');
        }
        if (!input.unlocked) {
            return status('backup', 'Recovery file', 'Vault locked', 'Backup readiness appears after unlock.', 'attention');
        }
        if (!lastBackup) {
            return status('backup', 'Recovery file', 'No backup recorded', 'Download an encrypted backup before major changes.', 'attention');
        }
        const stale = now.getTime() - lastBackup > BACKUP_STALE_MS;
        const schedule = settings.autoBackupEnabled
            ? `Automatic backup is scheduled for ${String(Number(settings.backupHour) || 0).padStart(2, '0')}:00.`
            : 'Automatic backup is off.';
        return status(
            'backup', 'Recovery file', stale ? 'Backup is over 7 days old' : 'Backup recorded',
            `Last download: ${formatDateTime(lastBackup)} ${schedule}`,
            stale || !settings.autoBackupEnabled ? 'attention' : 'healthy'
        );
    }

    function buildStorageStatus(input) {
        const diagnostics = input.storageDiagnostics || {};
        if (input.previewMode || diagnostics.previewMode) {
            return status('storage', 'Local protection', 'In-memory demo only', 'Real local vault metadata is not read in Preview Mode.', 'preview');
        }

        const local = diagnostics.localStorage || {};
        const indexed = diagnostics.indexedDB || {};
        const localReady = local.available !== false && local.hasData === true;
        const indexedReady = indexed.supported === true && indexed.hasData === true;
        if (localReady && indexedReady) {
            return status('storage', 'Local protection', 'Two local copies', `Active source: ${diagnostics.preferredSource || 'local storage'}.`, 'healthy');
        }
        if (localReady || indexedReady) {
            return status('storage', 'Local protection', 'One local copy', 'The vault is available locally, but storage redundancy needs attention.', 'attention');
        }
        return status('storage', 'Local protection', 'No local copy detected', 'Refresh technical details before making changes.', 'danger');
    }

    function buildCloudStatus(input) {
        const cloud = input.cloud || {};
        if (input.previewMode) {
            return status('cloud', 'Cloud sync', 'Paused in Preview', 'Preview changes never reach the real vault or Firebase.', 'preview');
        }
        if (cloud.sessionEnabled) {
            if (cloud.pendingChanges) {
                if (cloud.retryScheduled) {
                    const retryTime = timestamp(cloud.nextRetryAt);
                    const retryDetail = retryTime
                        ? `Automatic retry: ${formatDateTime(retryTime)}.`
                        : 'An automatic retry is scheduled.';
                    return status(
                        'cloud', 'Cloud sync', 'Retry scheduled',
                        `The encrypted local copy is safe. ${retryDetail}`,
                        'attention'
                    );
                }
                return status('cloud', 'Cloud sync', 'Local changes pending', 'The encrypted local copy is safe; cloud upload is still pending.', 'attention');
            }
            return status('cloud', 'Cloud sync', 'Enabled', 'Encrypted changes can sync across configured devices.', 'healthy');
        }
        if (cloud.savedAvailable) {
            return status('cloud', 'Cloud sync', 'Reload required', 'A cloud configuration is saved but is not active in this session.', 'attention');
        }
        return status('cloud', 'Cloud sync', 'Local only', 'Cloud sync is optional; encrypted local storage remains available.', 'neutral');
    }

    function buildFinanceToolsPresentation(input = {}, options = {}) {
        const now = new Date(options.now || input.now || Date.now());
        const validNow = Number.isFinite(now.getTime()) ? now : new Date();
        const previewMode = input.previewMode === true;
        const unlocked = input.unlocked === true && !previewMode;
        const normalized = { ...input, previewMode, unlocked };
        const statuses = [
            buildModeStatus(normalized),
            buildBackupStatus(normalized, validNow),
            buildStorageStatus(normalized),
            buildCloudStatus(normalized)
        ];
        const danger = statuses.some(item => item.tone === 'danger');
        const attention = statuses.some(item => item.tone === 'attention');

        return deepFreeze({
            version: VERSION,
            generatedAt: validNow.toISOString(),
            previewMode,
            unlocked,
            safeguardActionsEnabled: unlocked,
            configurationActionsEnabled: unlocked,
            summary: {
                tone: previewMode ? 'preview' : (danger ? 'danger' : (attention ? 'attention' : 'healthy')),
                label: previewMode
                    ? 'Demo session — real safeguards are paused'
                    : (danger ? 'Storage needs attention' : (attention ? 'Review your safeguards' : 'Vault safeguards are ready'))
            },
            statuses,
            technical: {
                preferredSource: input.storageDiagnostics?.preferredSource || (previewMode ? 'preview-memory' : '—'),
                syncUpdatedAt: input.storageDiagnostics?.syncUpdatedAt || null,
                conflictStrategy: input.storageDiagnostics?.conflictStrategy || 'local_wins',
                counts: { ...(input.storageDiagnostics?.counts || {}) }
            }
        });
    }

    function validate() {
        const errors = [];
        const ready = buildFinanceToolsPresentation({
            previewMode: false,
            unlocked: true,
            backupSettings: { autoBackupEnabled: true, backupHour: 20, lastBackupTime: Date.UTC(2026, 7, 1) },
            storageDiagnostics: {
                preferredSource: 'indexedDB',
                localStorage: { available: true, hasData: true },
                indexedDB: { supported: true, hasData: true }
            },
            cloud: { sessionEnabled: true, pendingChanges: false }
        }, { now: Date.UTC(2026, 7, 1, 12) });
        const preview = buildFinanceToolsPresentation({
            previewMode: true,
            unlocked: false,
            storageDiagnostics: { previewMode: true }
        }, { now: Date.UTC(2026, 7, 1, 12) });

        if (ready.version !== VERSION) errors.push('Tools presentation version mismatch.');
        if (ready.summary.tone !== 'healthy') errors.push('Healthy safeguards were not recognized.');
        if (!ready.safeguardActionsEnabled) errors.push('Unlocked safeguard actions should be enabled.');
        if (!preview.previewMode || preview.safeguardActionsEnabled) errors.push('Preview safeguards must fail closed.');
        if (preview.statuses.find(item => item.id === 'storage')?.value !== 'In-memory demo only') {
            errors.push('Preview storage boundary is not explicit.');
        }
        return Object.freeze({ valid: errors.length === 0, errors: Object.freeze(errors) });
    }

    return { VERSION, BACKUP_STALE_MS, buildFinanceToolsPresentation, validate };
});
