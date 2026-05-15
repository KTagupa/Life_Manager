(function () {
    function safeInit(label, fn) {
        if (typeof fn !== 'function') return;
        try {
            fn();
        } catch (error) {
            console.error(`[app-init] ${label} failed`, error);
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

    function bindStatementsMonthPicker() {
        const monthInput = document.getElementById('st-month');
        if (!monthInput || monthInput.dataset.boundByAppInit === 'true') return;

        monthInput.dataset.boundByAppInit = 'true';
        monthInput.addEventListener('change', () => {
            safeInit('statement month change', () => renderStatementForSelectedMonth(false));
        });
    }

    function runFeatureStartup() {
        safeInit('monthly close', refreshMonthlyCloseUI);
        safeInit('planning goals', () => {
            const planningList = document.getElementById('planning-goals-list');
            if (planningList) renderGoalsAndSimulator();
        });
        safeInit('forecast module', refreshForecastModuleUI);
        safeInit('operations review', refreshOperationsReviewModuleUI);
        safeInit('business KPI', refreshBusinessKPIPanel);
        safeInit('statements module', refreshStatementsModuleUI);
        safeInit('budget variance', renderBudgetVariancePanel);
        safeInit('revenue diversification', renderRevenueDiversificationPanel);
    }

    function initApp() {
        applySavedPreferences();
        bindStatementsMonthPicker();
        safeInit('descriptors', window.initDescriptorTooltips);
        runFeatureStartup();
        refreshIcons();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initApp, { once: true });
    } else {
        initApp();
    }

    window.addEventListener('load', refreshIcons);
})();
