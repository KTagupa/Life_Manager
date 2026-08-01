// =============================================
// PHASE 5C: ROUTE LIFECYCLE + PERFORMANCE QA
// =============================================

(function exposeFinanceRuntimePerformance(root, factory) {
    const api = factory(root);

    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) {
        root.FINANCE_PHASE_5C_VERSION = api.VERSION;
        root.FINANCE_DEVICE_MATRIX = api.DEVICE_MATRIX;
        root.FINANCE_PERFORMANCE_BUDGETS = api.PERFORMANCE_BUDGETS;
        root.getFinanceDeviceProfile = api.getFinanceDeviceProfile;
        root.evaluateFinancePerformanceBudgets = api.evaluateFinancePerformanceBudgets;
        root.createFinanceRouteLifecycle = api.createFinanceRouteLifecycle;
        root.configureFinanceRouteRuntime = api.configureFinanceRouteRuntime;
        root.initFinanceRouteRuntime = api.initFinanceRouteRuntime;
        root.activateFinanceRouteRuntime = api.activateFinanceRouteRuntime;
        root.getFinanceActiveViewId = api.getFinanceActiveViewId;
        root.shouldRenderFinanceRoute = api.shouldRenderFinanceRoute;
        root.recordFinanceAppInitialization = api.recordFinanceAppInitialization;
        root.getFinancePerformanceDiagnostics = api.getFinancePerformanceDiagnostics;
        root.auditFinanceDeviceLayout = api.auditFinanceDeviceLayout;
        root.runFinancePhase5CBrowserChecks = api.runFinancePhase5CBrowserChecks;
    }
})(typeof window !== 'undefined' ? window : globalThis, function buildFinanceRuntimePerformance(root) {
    'use strict';

    const VERSION = '1.0.0';
    const ROUTES = Object.freeze(['overview', 'activity', 'plan', 'wealth', 'reports', 'tools']);
    const DEVICE_MATRIX = deepFreeze([
        { id: 'phone-compact', width: 360, height: 800, pointer: 'coarse' },
        { id: 'phone-standard', width: 390, height: 844, pointer: 'coarse' },
        { id: 'tablet-portrait', width: 768, height: 1024, pointer: 'coarse' },
        { id: 'tablet-landscape', width: 1024, height: 768, pointer: 'coarse' },
        { id: 'desktop', width: 1440, height: 900, pointer: 'fine' }
    ]);
    const PERFORMANCE_BUDGETS = deepFreeze({
        appInitializationMs: 500,
        routeActivationMs: 250,
        routeRenderMs: 750,
        totalBlockingTimeMs: 200,
        longTaskMs: 50
    });

    const runtimeState = {
        initialized: false,
        configured: false,
        activeViewId: null,
        routeTasks: new Map(),
        refreshers: new Map(),
        lifecycle: null,
        observer: null,
        diagnostics: {
            initializedAt: null,
            appInitializationMs: null,
            routeActivations: [],
            longTasks: [],
            totalBlockingTimeMs: 0
        }
    };

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

    function normalizeRoute(value) {
        const normalized = String(value || '').trim().replace(/^#/, '').toLowerCase();
        return ROUTES.includes(normalized) ? normalized : 'overview';
    }

    function now() {
        return root?.performance?.now ? root.performance.now() : Date.now();
    }

    function getFinanceDeviceProfile(width, height) {
        const safeWidth = Math.max(0, Number(width) || 0);
        const safeHeight = Math.max(0, Number(height) || 0);
        const exact = DEVICE_MATRIX.find(device => device.width === safeWidth && device.height === safeHeight);
        if (exact) return exact;
        if (safeWidth <= 375) return DEVICE_MATRIX[0];
        if (safeWidth <= 480) return DEVICE_MATRIX[1];
        if (safeWidth <= 820 && safeHeight >= safeWidth) return DEVICE_MATRIX[2];
        if (safeWidth <= 1100) return DEVICE_MATRIX[3];
        return DEVICE_MATRIX[4];
    }

    function evaluateFinancePerformanceBudgets(measurements = {}, budgets = PERFORMANCE_BUDGETS) {
        const checks = [
            ['appInitializationMs', 'App initialization', measurements.appInitializationMs],
            ['routeActivationMs', 'Route activation', measurements.routeActivationMs],
            ['routeRenderMs', 'Route render', measurements.routeRenderMs],
            ['totalBlockingTimeMs', 'Total blocking time', measurements.totalBlockingTimeMs]
        ].map(([id, label, rawValue]) => {
            const value = Number(rawValue);
            const budget = Number(budgets[id]);
            const available = Number.isFinite(value);
            return {
                id,
                label,
                value: available ? value : null,
                budget,
                available,
                passed: !available || value <= budget
            };
        });
        return deepFreeze({
            valid: checks.every(check => check.passed),
            checks,
            failures: checks.filter(check => !check.passed)
        });
    }

    function createFinanceRouteLifecycle(options = {}) {
        const routeIds = Array.isArray(options.routes) && options.routes.length
            ? [...new Set(options.routes.map(normalizeRoute))]
            : [...ROUTES];
        const clock = typeof options.clock === 'function' ? options.clock : now;
        const states = new Map(routeIds.map(routeId => [routeId, {
            initialized: false,
            activationCount: 0,
            lastDurationMs: null,
            lastReason: null,
            pending: null
        }]));

        async function activate(routeValue, runner, context = {}) {
            const routeId = normalizeRoute(routeValue);
            const routeState = states.get(routeId);
            if (!routeState) throw new Error(`Unknown Finance route: ${routeId}`);
            if (routeState.pending) {
                if (context.rerunAfterPending === true) {
                    return routeState.pending.then(() => activate(routeId, runner, {
                        ...context,
                        rerunAfterPending: false
                    }));
                }
                return routeState.pending;
            }

            routeState.pending = (async () => {
                const startedAt = clock();
                const firstActivation = !routeState.initialized;
                await runner({ routeId, firstActivation, context });
                routeState.initialized = true;
                routeState.activationCount += 1;
                routeState.lastDurationMs = Math.max(0, clock() - startedAt);
                routeState.lastReason = context.reason || 'navigation';
                return {
                    routeId,
                    firstActivation,
                    activationCount: routeState.activationCount,
                    durationMs: routeState.lastDurationMs,
                    reason: routeState.lastReason
                };
            })().finally(() => {
                routeState.pending = null;
            });
            return routeState.pending;
        }

        function snapshot() {
            return deepFreeze(Object.fromEntries([...states.entries()].map(([routeId, state]) => [routeId, {
                initialized: state.initialized,
                activationCount: state.activationCount,
                lastDurationMs: state.lastDurationMs,
                lastReason: state.lastReason,
                pending: state.pending != null
            }])));
        }

        return Object.freeze({ activate, snapshot });
    }

    function normalizeTaskList(value) {
        if (typeof value === 'function') return [value];
        return (Array.isArray(value) ? value : []).filter(task => typeof task === 'function');
    }

    function configureFinanceRouteRuntime(configuration = {}) {
        ROUTES.forEach(routeId => {
            const route = configuration[routeId] || {};
            runtimeState.routeTasks.set(routeId, normalizeTaskList(route.initialize || route.initializers));
            if (typeof route.refresh === 'function') runtimeState.refreshers.set(routeId, route.refresh);
        });
        runtimeState.configured = true;
        return getFinancePerformanceDiagnostics();
    }

    function getFinanceActiveViewId() {
        const bodyView = root?.document?.body?.dataset?.financeActiveView;
        const hashView = root?.location?.hash;
        return normalizeRoute(bodyView || hashView || runtimeState.activeViewId || 'overview');
    }

    function shouldRenderFinanceRoute(viewId) {
        return getFinanceActiveViewId() === normalizeRoute(viewId);
    }

    function markRouteBusy(routeId, busy) {
        const section = root?.document?.querySelector?.(`[data-finance-view="${routeId}"]`);
        if (!section) return;
        section.setAttribute('aria-busy', busy ? 'true' : 'false');
        section.dataset.financeRouteLoading = busy ? 'true' : 'false';
    }

    async function runConfiguredRoute({ routeId, firstActivation, context }) {
        markRouteBusy(routeId, true);
        try {
            if (firstActivation) {
                for (const task of runtimeState.routeTasks.get(routeId) || []) {
                    await task();
                }
            }
            const refresh = runtimeState.refreshers.get(routeId);
            if (refresh) await refresh({ routeId, firstActivation, ...context });
        } finally {
            markRouteBusy(routeId, false);
        }
    }

    async function activateFinanceRouteRuntime(viewId, context = {}) {
        const routeId = normalizeRoute(viewId);
        runtimeState.activeViewId = routeId;
        if (!runtimeState.lifecycle) runtimeState.lifecycle = createFinanceRouteLifecycle();
        const startedAt = now();
        const result = await runtimeState.lifecycle.activate(routeId, runConfiguredRoute, context);
        const activationMs = Math.max(0, now() - startedAt);
        const renderMs = Math.max(0, Number(result?.durationMs || 0));
        const alreadyRecorded = runtimeState.diagnostics.routeActivations.some(entry => (
            entry.routeId === routeId && entry.activationCount === result?.activationCount
        ));
        if (!alreadyRecorded) {
            runtimeState.diagnostics.routeActivations.push({
                routeId,
                activationCount: result?.activationCount || 0,
                durationMs: activationMs,
                activationMs,
                renderMs,
                reason: context.reason || 'navigation',
                recordedAt: new Date().toISOString()
            });
            if (runtimeState.diagnostics.routeActivations.length > 30) {
                runtimeState.diagnostics.routeActivations.splice(0, runtimeState.diagnostics.routeActivations.length - 30);
            }
        }
        return result;
    }

    function observeLongTasks() {
        if (!root?.PerformanceObserver || runtimeState.observer) return;
        try {
            const observer = new root.PerformanceObserver(list => {
                list.getEntries().forEach(entry => {
                    const duration = Math.max(0, Number(entry.duration || 0));
                    runtimeState.diagnostics.longTasks.push({
                        durationMs: duration,
                        recordedAt: new Date().toISOString()
                    });
                    runtimeState.diagnostics.totalBlockingTimeMs += Math.max(0, duration - PERFORMANCE_BUDGETS.longTaskMs);
                });
                if (runtimeState.diagnostics.longTasks.length > 30) {
                    runtimeState.diagnostics.longTasks.splice(0, runtimeState.diagnostics.longTasks.length - 30);
                }
            });
            observer.observe({ type: 'longtask', buffered: true });
            runtimeState.observer = observer;
        } catch (_) { }
    }

    function recordFinanceAppInitialization(durationMs) {
        const duration = Number(durationMs);
        if (!Number.isFinite(duration) || duration < 0) return getFinancePerformanceDiagnostics();
        runtimeState.diagnostics.appInitializationMs = duration;
        return getFinancePerformanceDiagnostics();
    }

    function initFinanceRouteRuntime() {
        if (runtimeState.initialized) return activateFinanceRouteRuntime(getFinanceActiveViewId(), { reason: 'startup-repeat' });
        const startedAt = now();
        runtimeState.initialized = true;
        runtimeState.diagnostics.initializedAt = new Date().toISOString();
        runtimeState.lifecycle = createFinanceRouteLifecycle();
        observeLongTasks();

        root?.addEventListener?.('finance:viewchange', event => {
            activateFinanceRouteRuntime(event?.detail?.viewId, { reason: 'navigation' }).catch(error => {
                console.error('[finance-runtime] Route activation failed.', error);
            });
        });
        root?.addEventListener?.('finance:dataready', event => {
            activateFinanceRouteRuntime(getFinanceActiveViewId(), {
                reason: event?.detail?.reason || 'data-ready',
                rerunAfterPending: true
            }).catch(error => {
                console.error('[finance-runtime] Data refresh failed.', error);
            });
        });

        if (!Number.isFinite(runtimeState.diagnostics.appInitializationMs)) {
            runtimeState.diagnostics.appInitializationMs = Math.max(0, now() - startedAt);
        }
        return activateFinanceRouteRuntime(getFinanceActiveViewId(), { reason: 'startup' });
    }

    function getFinancePerformanceDiagnostics() {
        const latestActivation = runtimeState.diagnostics.routeActivations.slice(-1)[0] || null;
        const measurements = {
            appInitializationMs: runtimeState.diagnostics.appInitializationMs,
            routeActivationMs: latestActivation?.activationMs ?? null,
            routeRenderMs: latestActivation?.renderMs ?? null,
            totalBlockingTimeMs: runtimeState.diagnostics.totalBlockingTimeMs
        };
        return deepFreeze({
            version: VERSION,
            configured: runtimeState.configured,
            activeViewId: getFinanceActiveViewId(),
            initializedAt: runtimeState.diagnostics.initializedAt,
            measurements,
            budget: evaluateFinancePerformanceBudgets(measurements),
            routes: runtimeState.lifecycle?.snapshot?.() || {},
            routeActivations: clone(runtimeState.diagnostics.routeActivations),
            longTasks: clone(runtimeState.diagnostics.longTasks)
        });
    }

    function isVisible(element) {
        if (!element || element.hidden) return false;
        const style = root?.getComputedStyle ? root.getComputedStyle(element) : null;
        return !style || (style.display !== 'none' && style.visibility !== 'hidden');
    }

    function auditFinanceDeviceLayout(documentRef = root?.document, viewport = {}) {
        const width = Math.max(0, Number(viewport.width || root?.innerWidth || 0));
        const height = Math.max(0, Number(viewport.height || root?.innerHeight || 0));
        const profile = getFinanceDeviceProfile(width, height);
        const issues = [];
        if (!documentRef?.documentElement || width <= 0 || height <= 0) {
            return deepFreeze({ valid: false, profile, issues: ['A rendered document and viewport are required.'] });
        }

        const horizontalOverflow = Math.max(
            Number(documentRef.documentElement.scrollWidth || 0),
            Number(documentRef.body?.scrollWidth || 0)
        ) - width;
        if (horizontalOverflow > 1) issues.push(`Document overflows horizontally by ${Math.round(horizontalOverflow)}px.`);

        const activeViewId = getFinanceActiveViewId();
        const activeSection = documentRef.querySelector(`[data-finance-view="${activeViewId}"]`);
        if (!activeSection || activeSection.hidden || !isVisible(activeSection)) {
            issues.push(`Active route ${activeViewId} is not visible.`);
        }
        documentRef.querySelectorAll('[data-finance-view]').forEach(section => {
            if (section.dataset.financeView !== activeViewId && !section.hidden) {
                issues.push(`Inactive route ${section.dataset.financeView} is visible.`);
            }
        });

        documentRef.querySelectorAll('.finance-routed-card').forEach(card => {
            if (!isVisible(card) || typeof card.getBoundingClientRect !== 'function') return;
            const rect = card.getBoundingClientRect();
            if (rect.right > width + 1 || rect.left < -1) {
                issues.push(`Card ${card.id || 'unnamed'} exceeds the viewport.`);
            }
        });

        if (width <= 768) {
            const touchTargets = [...documentRef.querySelectorAll('.finance-mobile-nav button')]
                .filter(isVisible);
            touchTargets.forEach(target => {
                const rect = target.getBoundingClientRect();
                if (rect.width < 44 || rect.height < 44) {
                    const controlId = target.dataset.financeViewTarget
                        || target.dataset.financeAction
                        || target.getAttribute('aria-label')
                        || 'unknown';
                    issues.push(`Mobile route control ${controlId} is smaller than 44px.`);
                }
            });
        }

        return deepFreeze({
            valid: issues.length === 0,
            profile,
            viewport: { width, height },
            activeViewId,
            horizontalOverflow: Math.max(0, horizontalOverflow),
            issues
        });
    }

    function nextFrame() {
        return new Promise(resolve => {
            if (typeof root?.requestAnimationFrame === 'function') root.requestAnimationFrame(() => resolve());
            else setTimeout(resolve, 0);
        });
    }

    async function runFinancePhase5CBrowserChecks(options = {}) {
        const errors = [];
        const routeChecks = [];
        const initialRoute = getFinanceActiveViewId();
        const routes = Array.isArray(options.routes) && options.routes.length
            ? options.routes.map(normalizeRoute)
            : [...ROUTES];
        try {
            for (const routeId of routes) {
                if (typeof root?.openFinanceView === 'function') {
                    root.openFinanceView(routeId, { historyMode: 'none', scroll: false });
                }
                await activateFinanceRouteRuntime(routeId, { reason: 'phase-5c-browser-check' });
                await nextFrame();
                const layout = auditFinanceDeviceLayout(root.document, {
                    width: root.innerWidth,
                    height: root.innerHeight
                });
                const activation = getFinancePerformanceDiagnostics().routeActivations.slice(-1)[0] || null;
                routeChecks.push({ routeId, layout, activation });
                if (!layout.valid) errors.push(...layout.issues.map(issue => `${routeId}: ${issue}`));
                if (activation && activation.renderMs > PERFORMANCE_BUDGETS.routeRenderMs) {
                    errors.push(`${routeId}: render took ${Math.round(activation.renderMs)}ms.`);
                }
            }
        } finally {
            if (typeof root?.openFinanceView === 'function') {
                root.openFinanceView(initialRoute, { historyMode: 'none', scroll: false });
            }
            await activateFinanceRouteRuntime(initialRoute, { reason: 'phase-5c-browser-restore' });
        }

        const performance = getFinancePerformanceDiagnostics();
        if (!performance.budget.valid) {
            errors.push(...performance.budget.failures.map(failure => (
                `${failure.label} exceeded ${failure.budget}ms.`
            )));
        }
        return deepFreeze({
            valid: errors.length === 0,
            errors,
            device: getFinanceDeviceProfile(root.innerWidth, root.innerHeight),
            routeChecks,
            performance
        });
    }

    return deepFreeze({
        VERSION,
        ROUTES,
        DEVICE_MATRIX,
        PERFORMANCE_BUDGETS,
        getFinanceDeviceProfile,
        evaluateFinancePerformanceBudgets,
        createFinanceRouteLifecycle,
        configureFinanceRouteRuntime,
        initFinanceRouteRuntime,
        activateFinanceRouteRuntime,
        getFinanceActiveViewId,
        shouldRenderFinanceRoute,
        recordFinanceAppInitialization,
        getFinancePerformanceDiagnostics,
        auditFinanceDeviceLayout,
        runFinancePhase5CBrowserChecks
    });
});
