(function () {
    const appInitStartedAt = window.performance?.now ? window.performance.now() : Date.now();

    function safeInit(label, fn) {
        if (typeof fn !== 'function') return;
        try {
            const result = fn();
            if (result && typeof result.then === 'function') {
                result.catch(error => console.error(`[app-init] ${label} failed`, error));
            }
            return result;
        } catch (error) {
            console.error(`[app-init] ${label} failed`, error);
            return null;
        }
    }

    function applySavedPreferences() {
        if (localStorage.getItem('darkMode') === 'true') {
            document.body.classList.add('dark');
        }
    }

    function refreshIcons() {
        if (window.lucide) {
            window.lucide.createIcons();
        }
    }

    function validateTransactionClassifier() {
        if (typeof window.validateFinanceTransactionClassifier !== 'function') {
            throw new Error('Canonical transaction classifier is unavailable.');
        }

        const result = window.validateFinanceTransactionClassifier();
        if (!result?.valid) {
            throw new Error(`Canonical transaction classifier is invalid: ${(result?.errors || []).join('; ')}`);
        }
    }

    function validateDateQuality() {
        if (typeof window.validateFinanceDateQuality !== 'function') {
            throw new Error('Transaction date-quality module is unavailable.');
        }

        const result = window.validateFinanceDateQuality();
        if (!result?.valid) {
            throw new Error(`Transaction date-quality module is invalid: ${(result?.errors || []).join('; ')}`);
        }
    }

    function validateCanonicalMetrics() {
        if (typeof window.validateCanonicalFinanceMetrics !== 'function') {
            throw new Error('Canonical metric engine is unavailable.');
        }

        const result = window.validateCanonicalFinanceMetrics();
        if (!result?.valid) {
            throw new Error(`Canonical metric engine is invalid: ${(result?.errors || []).join('; ')}`);
        }
    }

    function validateMetricAdapter() {
        const missing = [
            ['computeLegacySummaryMetrics', window.computeLegacySummaryMetrics],
            ['computeDisplaySummaryMetrics', window.computeDisplaySummaryMetrics],
            ['formatFinanceSavingsRate', window.formatFinanceSavingsRate],
            ['refreshFinanceMetricCutoverUI', window.refreshFinanceMetricCutoverUI]
        ].filter(([, value]) => typeof value !== 'function').map(([name]) => name);
        if (missing.length) {
            throw new Error(`Canonical metric adapter is incomplete: ${missing.join(', ')}`);
        }
    }

    function validateCanonicalSnapshots() {
        if (typeof window.validateCanonicalFinanceSnapshots !== 'function') {
            throw new Error('Canonical snapshot engine is unavailable.');
        }

        const result = window.validateCanonicalFinanceSnapshots();
        if (!result?.valid) {
            throw new Error(`Canonical snapshot engine is invalid: ${(result?.errors || []).join('; ')}`);
        }
    }

    function validateCanonicalLiquidity() {
        if (typeof window.validateCanonicalFinanceLiquidity !== 'function') {
            throw new Error('Canonical liquidity engine is unavailable.');
        }

        const result = window.validateCanonicalFinanceLiquidity();
        if (!result?.valid) {
            throw new Error(`Canonical liquidity engine is invalid: ${(result?.errors || []).join('; ')}`);
        }
    }

    function validateStatementSnapshotSchema() {
        if (typeof window.validateFinanceStatementSnapshotSchema !== 'function') {
            throw new Error('Statement snapshot schema is unavailable.');
        }

        const result = window.validateFinanceStatementSnapshotSchema();
        if (!result?.valid) {
            throw new Error(`Statement snapshot schema is invalid: ${(result?.errors || []).join('; ')}`);
        }
    }

    function validateSnapshotAdapter() {
        if (typeof window.validateFinanceSnapshotAdapter !== 'function') {
            throw new Error('Canonical snapshot adapter is unavailable.');
        }

        const result = window.validateFinanceSnapshotAdapter();
        if (!result?.valid) {
            throw new Error(`Canonical snapshot adapter is invalid: ${(result?.errors || []).join('; ')}`);
        }
    }

    function validateOverviewModel() {
        if (typeof window.validateFinanceOverviewModel !== 'function') {
            throw new Error('Finance Overview presentation model is unavailable.');
        }

        const result = window.validateFinanceOverviewModel();
        if (!result?.valid) {
            throw new Error(`Finance Overview presentation model is invalid: ${(result?.errors || []).join('; ')}`);
        }
    }

    function validateActivityPresentation() {
        if (typeof window.validateFinanceActivityPresentation !== 'function') {
            throw new Error('Finance Activity presentation model is unavailable.');
        }

        const result = window.validateFinanceActivityPresentation();
        if (!result?.valid) {
            throw new Error(`Finance Activity presentation model is invalid: ${(result?.errors || []).join('; ')}`);
        }
    }

    function validatePlanningPresentation() {
        if (typeof window.validateFinancePlanningPresentation !== 'function') {
            throw new Error('Finance Planning presentation model is unavailable.');
        }

        const result = window.validateFinancePlanningPresentation();
        if (!result?.valid) {
            throw new Error(`Finance Planning presentation model is invalid: ${(result?.errors || []).join('; ')}`);
        }
    }

    function validateWealthPresentation() {
        if (typeof window.validateFinanceWealthPresentation !== 'function') {
            throw new Error('Finance Wealth presentation model is unavailable.');
        }

        const result = window.validateFinanceWealthPresentation();
        if (!result?.valid) {
            throw new Error(`Finance Wealth presentation model is invalid: ${(result?.errors || []).join('; ')}`);
        }
    }

    function validateReportsPresentation() {
        if (typeof window.validateFinanceReportsPresentation !== 'function') {
            throw new Error('Finance Reports presentation model is unavailable.');
        }

        const result = window.validateFinanceReportsPresentation();
        if (!result?.valid) {
            throw new Error(`Finance Reports presentation model is invalid: ${(result?.errors || []).join('; ')}`);
        }
    }

    function validateToolsPresentation() {
        if (typeof window.validateFinanceToolsPresentation !== 'function') {
            throw new Error('Finance Tools presentation model is unavailable.');
        }

        const result = window.validateFinanceToolsPresentation();
        if (!result?.valid) {
            throw new Error(`Finance Tools presentation model is invalid: ${(result?.errors || []).join('; ')}`);
        }
    }

    function validateAccessibilityContrast() {
        if (typeof window.validateFinanceContrastContract !== 'function') {
            throw new Error('Finance accessibility contrast contract is unavailable.');
        }
        const result = window.validateFinanceContrastContract();
        if (!result?.valid) {
            throw new Error(`Finance contrast contract is invalid: ${(result?.failures || []).map(item => item.id).join(', ')}`);
        }
    }

    function validateReleaseReadiness() {
        if (typeof window.validateFinanceReleaseReadinessContract !== 'function') {
            throw new Error('Finance release-readiness contract is unavailable.');
        }
        const result = window.validateFinanceReleaseReadinessContract();
        if (!result?.valid) {
            throw new Error(`Finance release-readiness contract is invalid: ${(result?.errors || []).join(', ')}`);
        }
    }

    function bindStatementsMonthPicker() {
        const monthInput = document.getElementById('st-month');
        if (!monthInput || monthInput.dataset.boundByAppInit === 'true') return;

        monthInput.dataset.boundByAppInit = 'true';
        monthInput.addEventListener('change', () => {
            safeInit('statement month change', () => renderStatementForSelectedMonth(false));
        });
    }

    function runReportsFeatureStartup() {
        const tasks = [
            ['monthly close', window.refreshMonthlyCloseUI],
            ['forecast module', window.refreshForecastModuleUI],
            ['operations review', window.refreshOperationsReviewModuleUI],
            ['business KPI', window.refreshBusinessKPIPanel],
            ['statements module', window.refreshStatementsModuleUI],
            ['budget variance', window.renderBudgetVariancePanel],
            ['revenue diversification', window.renderRevenueDiversificationPanel]
        ];
        return Promise.allSettled(tasks.map(([label, task]) => Promise.resolve(safeInit(label, task))));
    }

    function configureRouteRuntime() {
        if (typeof window.configureFinanceRouteRuntime !== 'function') {
            throw new Error('Finance route runtime is unavailable.');
        }
        const refresh = viewId => context => {
            if (typeof window.renderFinanceRouteData === 'function') {
                return window.renderFinanceRouteData(viewId, {
                    reason: context?.reason || 'route-activation',
                    firstActivation: context?.firstActivation === true
                });
            }
            return null;
        };
        return window.configureFinanceRouteRuntime({
            overview: {
                initialize: [window.initFinanceOverview],
                refresh: refresh('overview')
            },
            activity: {
                refresh: refresh('activity')
            },
            plan: {
                initialize: [window.initFinancePlanCoordination],
                refresh: refresh('plan')
            },
            wealth: {
                initialize: [window.initFinanceWealthCoordination],
                refresh: refresh('wealth')
            },
            reports: {
                initialize: [window.initFinanceReportsCoordination, runReportsFeatureStartup],
                refresh: refresh('reports')
            },
            tools: {
                initialize: [window.initFinanceToolsCoordination],
                refresh: refresh('tools')
            }
        });
    }

    function initApp() {
        applySavedPreferences();
        safeInit('transaction classifier', validateTransactionClassifier);
        safeInit('transaction date quality', validateDateQuality);
        safeInit('canonical metric engine', validateCanonicalMetrics);
        safeInit('canonical metric adapter', validateMetricAdapter);
        safeInit('canonical liquidity engine', validateCanonicalLiquidity);
        safeInit('canonical snapshot engine', validateCanonicalSnapshots);
        safeInit('statement snapshot schema', validateStatementSnapshotSchema);
        safeInit('canonical snapshot adapter', validateSnapshotAdapter);
        safeInit('finance Overview model', validateOverviewModel);
        safeInit('finance Activity presentation', validateActivityPresentation);
        safeInit('finance Planning presentation', validatePlanningPresentation);
        safeInit('finance Wealth presentation', validateWealthPresentation);
        safeInit('finance Reports presentation', validateReportsPresentation);
        safeInit('finance Tools presentation', validateToolsPresentation);
        safeInit('finance contrast contract', validateAccessibilityContrast);
        safeInit('finance release-readiness contract', validateReleaseReadiness);
        safeInit('modal accessibility', window.initFinanceModalAccessibility);
        safeInit('transaction date repair', window.initFinanceDateRepair);
        safeInit('metric shadow', window.initFinanceMetricShadow);
        safeInit('snapshot shadow', window.initFinanceSnapshotShadow);
        safeInit('finance route configuration', configureRouteRuntime);
        safeInit('finance navigation', window.initFinanceNavigation);
        safeInit('finance accessibility', window.initFinanceAccessibility);
        safeInit('finance route runtime', window.initFinanceRouteRuntime);
        bindStatementsMonthPicker();
        safeInit('descriptors', window.initDescriptorTooltips);
        refreshIcons();
        const completedAt = window.performance?.now ? window.performance.now() : Date.now();
        safeInit('finance initialization timing', () => {
            if (typeof window.recordFinanceAppInitialization === 'function') {
                window.recordFinanceAppInitialization(Math.max(0, completedAt - appInitStartedAt));
            }
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initApp, { once: true });
    } else {
        initApp();
    }

    window.addEventListener('load', refreshIcons);
})();
