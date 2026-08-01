// =============================================
// PHASE 5D: FINAL RELEASE-READINESS GATE
// =============================================

(function exposeFinanceReleaseReadiness(root, factory) {
    const api = factory(root);

    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) {
        root.FINANCE_PHASE_5D_VERSION = api.VERSION;
        root.FINANCE_RELEASE_GATE_DEFINITIONS = api.GATE_DEFINITIONS;
        root.buildFinanceReleaseReadinessReport = api.buildFinanceReleaseReadinessReport;
        root.validateFinanceReleaseReadinessContract = api.validateFinanceReleaseReadinessContract;
        root.runFinancePhase5DBrowserChecks = api.runFinancePhase5DBrowserChecks;
        root.runFinanceReleaseAuditFromTools = api.runFinanceReleaseAuditFromTools;
    }
})(typeof window !== 'undefined' ? window : globalThis, function createFinanceReleaseReadiness(root) {
    'use strict';

    const VERSION = '1.0.0';
    const GATE_DEFINITIONS = deepFreeze([
        { id: 'canonical_contracts', label: 'Canonical contracts' },
        { id: 'fixture_reconciliation', label: 'Counted-once reconciliation' },
        { id: 'accessibility_navigation', label: 'Accessibility and navigation' },
        { id: 'data_safety', label: 'Backup and Preview safety' },
        { id: 'device_performance', label: 'Device and performance' },
        { id: 'preview_isolation', label: 'Preview isolation' },
        { id: 'regression_suite', label: 'Complete regression suite' },
        { id: 'live_browser_acceptance', label: 'Live browser acceptance' }
    ]);

    const CANONICAL_VALIDATORS = Object.freeze([
        'validateFinanceMetricContract',
        'validateFinanceTransactionClassifier',
        'validateFinanceDateQuality',
        'validateCanonicalFinanceMetrics',
        'validateCanonicalFinanceLiquidity',
        'validateCanonicalFinanceSnapshots',
        'validateCanonicalFinanceStatements',
        'validateFinanceStatementSnapshotSchema',
        'validateFinanceSnapshotAdapter',
        'validateFinanceOverviewModel',
        'validateFinanceActivityPresentation',
        'validateFinancePlanningPresentation',
        'validateFinanceWealthPresentation',
        'validateFinanceReportsPresentation',
        'validateFinanceToolsPresentation',
        'validateFinanceContrastContract'
    ]);

    function deepFreeze(value) {
        if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
        Object.getOwnPropertyNames(value).forEach(key => deepFreeze(value[key]));
        return Object.freeze(value);
    }

    function resultIssueCount(value) {
        if (!value || typeof value !== 'object') return 0;
        if (Array.isArray(value.errors)) return value.errors.length;
        if (Array.isArray(value.failures)) return value.failures.length;
        if (Array.isArray(value.issues)) return value.issues.length;
        const numeric = Number(value.issueCount);
        return Number.isFinite(numeric) ? Math.max(0, Math.floor(numeric)) : 0;
    }

    function normalizeGateResult(definition, rawValue) {
        const objectValue = rawValue && typeof rawValue === 'object' ? rawValue : null;
        const available = typeof rawValue === 'boolean'
            ? true
            : objectValue?.available !== false && objectValue != null;
        const valid = available && (typeof rawValue === 'boolean'
            ? rawValue
            : (objectValue?.valid === true || objectValue?.ok === true));
        return {
            id: definition.id,
            label: definition.label,
            available,
            valid,
            issueCount: available ? resultIssueCount(objectValue) : 0,
            status: valid ? 'passed' : (available ? 'failed' : 'missing')
        };
    }

    function buildFinanceReleaseReadinessReport(evidence = {}, options = {}) {
        const safeEvidence = evidence && typeof evidence === 'object' ? evidence : {};
        const gates = GATE_DEFINITIONS.map(definition => (
            normalizeGateResult(definition, safeEvidence[definition.id])
        ));
        const blockers = gates.filter(gate => !gate.valid).map(gate => ({
            id: gate.id,
            label: gate.label,
            status: gate.status,
            issueCount: gate.issueCount
        }));
        const valid = blockers.length === 0;
        return deepFreeze({
            version: VERSION,
            generatedAt: options.generatedAt || null,
            status: valid ? 'ready' : 'blocked',
            valid,
            gateCount: gates.length,
            passedCount: gates.length - blockers.length,
            gates,
            blockers
        });
    }

    function validateFinanceReleaseReadinessContract() {
        const passingEvidence = Object.fromEntries(GATE_DEFINITIONS.map(gate => [gate.id, true]));
        const passing = buildFinanceReleaseReadinessReport(passingEvidence);
        const missing = buildFinanceReleaseReadinessReport({ canonical_contracts: true });
        const ids = GATE_DEFINITIONS.map(gate => gate.id);
        const errors = [];
        if (new Set(ids).size !== ids.length) errors.push('Release gate IDs must be unique.');
        if (!passing.valid || passing.passedCount !== GATE_DEFINITIONS.length) {
            errors.push('Complete passing evidence must produce a ready report.');
        }
        if (missing.valid || !missing.blockers.some(gate => gate.status === 'missing')) {
            errors.push('Missing evidence must block release readiness.');
        }
        if (!Object.isFrozen(passing) || !Object.isFrozen(passing.gates)) {
            errors.push('Release reports must be immutable.');
        }
        return deepFreeze({ valid: errors.length === 0, errors });
    }

    function getPreviewIsolationCheck() {
        const previewActive = typeof previewMode !== 'undefined' && previewMode === true;
        const memoryDatabaseReady = typeof previewDBSnapshot !== 'undefined' && !!previewDBSnapshot;
        const keyMaterialCleared = (typeof masterKey === 'undefined' || !masterKey)
            && (typeof cryptoKey === 'undefined' || !cryptoKey);
        const banner = root?.document?.getElementById?.('preview-mode-banner');
        const bannerVisible = !!banner && !banner.classList.contains('hidden');
        const checks = { previewActive, memoryDatabaseReady, keyMaterialCleared, bannerVisible };
        return deepFreeze({
            valid: Object.values(checks).every(Boolean),
            available: true,
            issueCount: Object.values(checks).filter(value => !value).length,
            checks
        });
    }

    function runCanonicalContractChecks() {
        const results = CANONICAL_VALIDATORS.map(name => {
            const validator = root?.[name];
            if (typeof validator !== 'function') return { name, available: false, valid: false };
            try {
                const result = validator();
                return {
                    name,
                    available: true,
                    valid: result?.valid === true || result?.ok === true,
                    issueCount: resultIssueCount(result)
                };
            } catch (_) {
                return { name, available: true, valid: false, issueCount: 1 };
            }
        });
        const failures = results.filter(result => !result.valid);
        return deepFreeze({
            valid: failures.length === 0,
            available: true,
            issueCount: failures.length,
            checkedCount: results.length,
            missingCount: results.filter(result => !result.available).length
        });
    }

    async function runDataSafetyRuntimeCheck() {
        if (typeof root?.getStorageDiagnostics !== 'function'
            || typeof root?.getFinanceToolsPresentation !== 'function') {
            return deepFreeze({ valid: false, available: false, issueCount: 2 });
        }
        try {
            const diagnostics = await root.getStorageDiagnostics();
            const tools = await root.getFinanceToolsPresentation({ diagnostics });
            const checks = {
                previewDiagnostics: diagnostics?.previewMode === true,
                memoryOnly: diagnostics?.preferredSource === 'preview-memory',
                localStorageExcluded: diagnostics?.localStorage?.excludedFromPreview === true,
                indexedDBExcluded: diagnostics?.indexedDB?.excludedFromPreview === true,
                toolsInPreview: tools?.previewMode === true,
                safeguardsDisabled: tools?.safeguardActionsEnabled === false,
                configurationDisabled: tools?.configurationActionsEnabled === false,
                backupContractPresent: root.FINANCE_BACKUP_FORMAT_VERSION === 2
                    && typeof root.executeFinanceRestoreTransaction === 'function'
                    && typeof root.getFinanceSyncRetryDelay === 'function'
            };
            return deepFreeze({
                valid: Object.values(checks).every(Boolean),
                available: true,
                issueCount: Object.values(checks).filter(value => !value).length,
                checks
            });
        } catch (_) {
            return deepFreeze({ valid: false, available: true, issueCount: 1 });
        }
    }

    async function invokeBrowserGate(name, options) {
        const fn = root?.[name];
        if (typeof fn !== 'function') return deepFreeze({ valid: false, available: false, issueCount: 1 });
        try {
            const result = await fn(options);
            return deepFreeze({
                valid: result?.valid === true,
                available: true,
                issueCount: resultIssueCount(result)
            });
        } catch (_) {
            return deepFreeze({ valid: false, available: true, issueCount: 1 });
        }
    }

    function automatedEvidenceValue(evidence, camelKey, snakeKey) {
        if (!evidence || typeof evidence !== 'object') return null;
        return evidence[camelKey] ?? evidence[snakeKey] ?? null;
    }

    async function runFinancePhase5DBrowserChecks(options = {}) {
        const previewIsolation = getPreviewIsolationCheck();
        const suppliedAutomatedEvidence = options.automatedEvidence || {};
        const automatedEvidence = suppliedAutomatedEvidence.evidence || suppliedAutomatedEvidence;
        if (!previewIsolation.valid) {
            const report = buildFinanceReleaseReadinessReport({ preview_isolation: previewIsolation }, {
                generatedAt: new Date().toISOString()
            });
            return deepFreeze({
                valid: false,
                runtimeValid: false,
                errors: ['Phase 5D browser checks require an isolated Preview Mode session.'],
                report
            });
        }

        const canonical = runCanonicalContractChecks();
        const accessibility = await invokeBrowserGate('runFinancePhase5ABrowserChecks', {
            exerciseModals: options.exerciseModals !== false,
            exerciseHistory: options.exerciseHistory !== false
        });
        const dataSafety = await runDataSafetyRuntimeCheck();
        const devicePerformance = await invokeBrowserGate('runFinancePhase5CBrowserChecks', {
            routes: options.routes
        });
        const runtimeChecks = [canonical, accessibility, dataSafety, devicePerformance, previewIsolation];
        const runtimeValid = runtimeChecks.every(check => check.valid);
        const evidence = {
            canonical_contracts: canonical,
            fixture_reconciliation: automatedEvidenceValue(
                automatedEvidence,
                'fixtureReconciliation',
                'fixture_reconciliation'
            ),
            accessibility_navigation: accessibility,
            data_safety: dataSafety,
            device_performance: devicePerformance,
            preview_isolation: previewIsolation,
            regression_suite: automatedEvidenceValue(automatedEvidence, 'regressionSuite', 'regression_suite'),
            live_browser_acceptance: { valid: runtimeValid, available: true }
        };
        const report = buildFinanceReleaseReadinessReport(evidence, {
            generatedAt: new Date().toISOString()
        });
        const errors = report.blockers.map(blocker => `${blocker.label}: ${blocker.status}`);

        if (root?.document?.documentElement) {
            root.document.documentElement.dataset.financeReleaseStatus = report.status;
            root.document.documentElement.dataset.financeReleaseBlockerCount = String(report.blockers.length);
        }
        root.financeReleaseReadinessReport = report;
        try {
            root.dispatchEvent(new root.CustomEvent('finance:release-audit', {
                detail: { status: report.status, blockerCount: report.blockers.length }
            }));
        } catch (_) { }
        return deepFreeze({ valid: report.valid, runtimeValid, errors, report });
    }

    function setToolsAuditStatus(message, tone) {
        const status = root?.document?.getElementById?.('finance-release-audit-status');
        if (!status) return;
        status.textContent = message;
        status.dataset.tone = tone;
    }

    async function runFinanceReleaseAuditFromTools() {
        const button = root?.document?.getElementById?.('finance-tools-release-audit');
        if (button) {
            button.disabled = true;
            button.setAttribute('aria-busy', 'true');
        }
        setToolsAuditStatus('Running Preview release checks…', 'running');
        try {
            const result = await runFinancePhase5DBrowserChecks();
            if (result.valid) {
                setToolsAuditStatus('Release gate passed.', 'ready');
            } else if (result.runtimeValid) {
                setToolsAuditStatus('Runtime checks passed. Attach the automated gate evidence for final sign-off.', 'attention');
            } else {
                setToolsAuditStatus(`Release blocked by ${result.report.blockers.length} gate(s).`, 'blocked');
            }
            return result;
        } finally {
            if (button) {
                const previewActive = typeof previewMode !== 'undefined' && previewMode === true;
                button.disabled = !previewActive;
                button.setAttribute('aria-disabled', previewActive ? 'false' : 'true');
                button.removeAttribute('aria-busy');
            }
        }
    }

    return deepFreeze({
        VERSION,
        GATE_DEFINITIONS,
        CANONICAL_VALIDATORS,
        buildFinanceReleaseReadinessReport,
        validateFinanceReleaseReadinessContract,
        runFinancePhase5DBrowserChecks,
        runFinanceReleaseAuditFromTools
    });
});
