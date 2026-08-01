(function initializeFinanceToolsFeature(root) {
    'use strict';

    let renderSequence = 0;
    let initialized = false;

    function setText(id, value) {
        const element = root.document?.getElementById(id);
        if (element) element.textContent = value == null || value === '' ? '—' : String(value);
    }

    function isPreviewSession() {
        return typeof previewMode !== 'undefined' && previewMode === true;
    }

    function isVaultUnlocked() {
        return !isPreviewSession()
            && typeof masterKey !== 'undefined'
            && typeof cryptoKey !== 'undefined'
            && !!masterKey
            && !!cryptoKey;
    }

    function getCloudInput(diagnostics) {
        let runtime = { sessionEnabled: false, savedAvailable: false };
        if (typeof getFirebaseRuntimeStatusSummary === 'function') {
            try {
                runtime = getFirebaseRuntimeStatusSummary() || runtime;
            } catch (error) {
                console.warn('[finance-tools] Cloud status was unavailable.', error);
            }
        }
        return {
            sessionEnabled: runtime.sessionEnabled === true,
            savedAvailable: runtime.savedAvailable === true,
            pendingChanges: diagnostics?.sync?.pendingChanges === true,
            pendingAttachmentCount: Number(diagnostics?.sync?.pendingAttachmentCount || 0),
            retryScheduled: diagnostics?.sync?.recovery?.retryScheduled === true,
            failureCount: Number(diagnostics?.sync?.recovery?.failureCount || 0),
            nextRetryAt: diagnostics?.sync?.recovery?.nextRetryAt || null
        };
    }

    async function collectFinanceToolsInput(options = {}) {
        const preview = isPreviewSession();
        let diagnostics = options.diagnostics || null;
        if (!diagnostics && typeof getStorageDiagnostics === 'function') {
            diagnostics = await getStorageDiagnostics();
        }
        let backupSettings = {};
        if (!preview && typeof getBackupSettings === 'function') {
            try {
                backupSettings = getBackupSettings() || {};
            } catch (error) {
                console.warn('[finance-tools] Backup settings were unavailable.', error);
            }
        }
        return {
            previewMode: preview,
            unlocked: isVaultUnlocked(),
            backupSettings,
            storageDiagnostics: diagnostics || {},
            cloud: getCloudInput(diagnostics)
        };
    }

    async function getFinanceToolsPresentation(options = {}) {
        if (typeof root.buildFinanceToolsPresentation !== 'function') return null;
        const input = await collectFinanceToolsInput(options);
        return root.buildFinanceToolsPresentation(input, options);
    }

    function renderStatusCard(item) {
        const card = root.document?.querySelector(`[data-tools-status="${item.id}"]`);
        if (!card) return;
        card.dataset.tone = item.tone;
        const value = card.querySelector('[data-tools-status-value]');
        const detail = card.querySelector('[data-tools-status-detail]');
        if (value) value.textContent = item.value;
        if (detail) detail.textContent = item.detail;
    }

    function renderActionAvailability(presentation) {
        root.document?.querySelectorAll('[data-tools-real-vault]').forEach(button => {
            const unavailable = !presentation.safeguardActionsEnabled;
            button.disabled = unavailable;
            button.setAttribute('aria-disabled', unavailable ? 'true' : 'false');
            button.title = unavailable ? 'Unavailable in Preview Mode or while the vault is locked' : '';
        });
        root.document?.querySelectorAll('[data-tools-real-config]').forEach(button => {
            const unavailable = !presentation.configurationActionsEnabled;
            button.disabled = unavailable;
            button.setAttribute('aria-disabled', unavailable ? 'true' : 'false');
            button.title = unavailable ? 'Cloud configuration is paused in Preview Mode' : '';
        });
        root.document?.querySelectorAll('[data-tools-preview-only]').forEach(button => {
            const unavailable = presentation.previewMode !== true;
            button.disabled = unavailable;
            button.setAttribute('aria-disabled', unavailable ? 'true' : 'false');
            button.title = unavailable ? 'Run release checks from an isolated Preview Mode session' : '';
        });
        if (presentation.previewMode !== true) {
            setText('finance-release-audit-status', 'Open Preview Mode to run the release audit safely.');
        }
    }

    function renderTechnicalSummary(presentation) {
        const counts = presentation.technical.counts || {};
        const tracked = [
            ['transactions', 'transactions'],
            ['bills', 'bills'],
            ['debts', 'debts'],
            ['creditCards', 'cards'],
            ['installmentPlans', 'installments'],
            ['fixedAssets', 'assets']
        ].map(([key, label]) => `${Number(counts[key] || 0)} ${label}`).join(' • ');
        setText('tools-technical-summary', presentation.previewMode
            ? 'Preview diagnostics contain demo counts only; real vault storage is not inspected.'
            : `Using ${presentation.technical.preferredSource}. ${tracked}`);
    }

    async function renderFinanceToolsCoordinator(options = {}) {
        const currentSequence = ++renderSequence;
        let presentation = null;
        try {
            presentation = await getFinanceToolsPresentation(options);
        } catch (error) {
            console.error('[finance-tools] Could not refresh safeguard status.', error);
            setText('finance-tools-summary-label', 'Safeguard status is temporarily unavailable');
            return null;
        }
        if (!presentation || currentSequence !== renderSequence) return presentation;

        const hub = root.document?.getElementById('finance-tools-hub');
        if (hub) {
            hub.dataset.summaryTone = presentation.summary.tone;
            hub.dataset.previewMode = presentation.previewMode ? 'true' : 'false';
        }
        setText('finance-tools-summary-label', presentation.summary.label);
        presentation.statuses.forEach(renderStatusCard);
        renderActionAvailability(presentation);
        renderTechnicalSummary(presentation);
        if (root.lucide) root.lucide.createIcons();
        return presentation;
    }

    function initFinanceToolsCoordination() {
        if (initialized || !root.document) return;
        initialized = true;
        root.addEventListener('finance:toolschange', event => {
            const active = typeof root.shouldRenderFinanceRoute === 'function'
                ? root.shouldRenderFinanceRoute('tools')
                : root.document?.body?.dataset?.financeActiveView === 'tools';
            if (active) renderFinanceToolsCoordinator({ diagnostics: event.detail?.diagnostics || null });
        });
    }

    root.getFinanceToolsPresentation = getFinanceToolsPresentation;
    root.renderFinanceToolsCoordinator = renderFinanceToolsCoordinator;
    root.initFinanceToolsCoordination = initFinanceToolsCoordination;
})(typeof window !== 'undefined' ? window : globalThis);
