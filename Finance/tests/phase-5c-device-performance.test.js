'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const runtime = require('../assets/js/core/runtime-performance.js');

const financeRoot = path.join(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(financeRoot, relativePath), 'utf8');

test('Phase 5C defines a frozen representative device matrix and performance budgets', () => {
    assert.deepEqual(
        runtime.DEVICE_MATRIX.map(device => [device.id, device.width, device.height]),
        [
            ['phone-compact', 360, 800],
            ['phone-standard', 390, 844],
            ['tablet-portrait', 768, 1024],
            ['tablet-landscape', 1024, 768],
            ['desktop', 1440, 900]
        ]
    );
    assert.equal(runtime.PERFORMANCE_BUDGETS.routeRenderMs, 750);
    assert.equal(runtime.PERFORMANCE_BUDGETS.totalBlockingTimeMs, 200);
    assert.equal(Object.isFrozen(runtime.DEVICE_MATRIX), true);
    assert.equal(Object.isFrozen(runtime.PERFORMANCE_BUDGETS), true);
});

test('device profiles resolve exact and intermediate viewport sizes consistently', () => {
    assert.equal(runtime.getFinanceDeviceProfile(360, 800).id, 'phone-compact');
    assert.equal(runtime.getFinanceDeviceProfile(430, 932).id, 'phone-standard');
    assert.equal(runtime.getFinanceDeviceProfile(768, 1024).id, 'tablet-portrait');
    assert.equal(runtime.getFinanceDeviceProfile(900, 700).id, 'tablet-landscape');
    assert.equal(runtime.getFinanceDeviceProfile(1512, 982).id, 'desktop');
});

test('performance budget evaluation distinguishes unavailable, passing, and failing metrics', () => {
    const passing = runtime.evaluateFinancePerformanceBudgets({
        appInitializationMs: 120,
        routeActivationMs: 80,
        routeRenderMs: 90,
        totalBlockingTimeMs: 0
    });
    const failing = runtime.evaluateFinancePerformanceBudgets({
        appInitializationMs: 120,
        routeActivationMs: 251,
        routeRenderMs: 751,
        totalBlockingTimeMs: 201
    });
    const unavailable = runtime.evaluateFinancePerformanceBudgets({});

    assert.equal(passing.valid, true);
    assert.equal(failing.valid, false);
    assert.deepEqual(failing.failures.map(failure => failure.id), [
        'routeActivationMs',
        'routeRenderMs',
        'totalBlockingTimeMs'
    ]);
    assert.equal(unavailable.valid, true);
    assert.equal(unavailable.checks.every(check => check.available === false), true);
});

test('route lifecycle initializes a route once and refreshes it on every activation', async () => {
    let elapsed = 0;
    let initializeCount = 0;
    let refreshCount = 0;
    const lifecycle = runtime.createFinanceRouteLifecycle({ clock: () => elapsed });
    const runner = async ({ firstActivation }) => {
        if (firstActivation) initializeCount += 1;
        refreshCount += 1;
        elapsed += 12;
    };

    const first = await lifecycle.activate('reports', runner, { reason: 'navigation' });
    const second = await lifecycle.activate('reports', runner, { reason: 'data-ready' });

    assert.equal(first.firstActivation, true);
    assert.equal(second.firstActivation, false);
    assert.equal(initializeCount, 1);
    assert.equal(refreshCount, 2);
    assert.equal(second.activationCount, 2);
    assert.equal(lifecycle.snapshot().reports.lastDurationMs, 12);
    assert.equal(Object.isFrozen(lifecycle.snapshot()), true);
});

test('app startup configures route-owned work and keeps canonical engines eager', () => {
    const html = read('index.html');
    const appInit = read('assets/js/core/app-init.js');
    const runtimeIndex = html.indexOf('assets/js/core/runtime-performance.js');
    const storageIndex = html.indexOf('assets/js/core/storage.js');
    const startupIndex = html.indexOf('assets/js/core/app-init.js');

    assert.ok(runtimeIndex > 0 && storageIndex > runtimeIndex && startupIndex > storageIndex);
    assert.match(appInit, /configureFinanceRouteRuntime\(\{/);
    assert.match(appInit, /reports:\s*\{[\s\S]*runReportsFeatureStartup/);
    assert.match(appInit, /tools:\s*\{[\s\S]*initFinanceToolsCoordination/);
    assert.match(appInit, /safeInit\('metric shadow'/);
    assert.match(appInit, /safeInit\('snapshot shadow'/);
    assert.match(appInit, /recordFinanceAppInitialization/);
    assert.doesNotMatch(appInit, /function runFeatureStartup/);
});

test('chart and route rendering are activated through the current route', () => {
    const charts = read('assets/js/ui/charts.js');
    const auth = read('assets/js/core/auth.js');
    const preview = read('assets/js/core/preview.js');

    assert.match(charts, /async function renderFinanceRouteData\(viewId, options = \{\}\)/);
    assert.match(charts, /if \(routeId === 'reports'\) \{\s*initChart\(\)/);
    assert.match(charts, /window\.financeActivityRouteData = \{/);
    assert.match(charts, /renderFinanceRouteData\(activeViewId, \{ reason: 'filters' \}\)/);
    assert.doesNotMatch(auth, /\binitChart\(\)/);
    assert.doesNotMatch(preview, /\binitChart\(\)/);
});

test('vault load hydrates correctness inputs while deferring route-only lists', () => {
    const auth = read('assets/js/core/auth.js');
    const renderers = read('assets/js/ui/renderers.js');

    assert.match(auth, /const renderPlanRoute = activeViewId === 'plan'/);
    assert.match(auth, /if \(renderPlanRoute\) \{\s*await runLoadStep\('bills'/);
    assert.match(auth, /if \(renderPlanRoute\) \{\s*await runLoadStep\('wishlist'/);
    assert.match(auth, /renderDebts\(rawDebts, \{ render: renderWealthRoute \}\)/);
    assert.match(auth, /if \(renderReportsRoute && typeof refreshBusinessKPIPanel/);
    assert.match(auth, /CustomEvent\('finance:dataready'/);
    assert.match(renderers, /window\.allDecryptedDebts = decryptedDebts;[\s\S]*if \(options\.render === false\) return decryptedDebts/);
    assert.match(renderers, /window\.allDecryptedInstallmentPlans = decrypted;[\s\S]*if \(options\.render === false\) return decrypted/);
});

test('Phase 5C CSS protects narrow layouts, touch targets, safe areas, and modal bounds', () => {
    const css = read('assets/css/app.css');

    assert.match(css, /Phase 5C: device-matrix and route-performance acceptance/);
    assert.match(css, /body\.finance-page[\s\S]*overflow-x: clip/);
    assert.match(css, /\.finance-mobile-nav \[data-finance-view-target\][\s\S]*min-width: 44px[\s\S]*min-height: 44px/);
    assert.match(css, /env\(safe-area-inset-bottom, 0px\)/);
    assert.match(css, /max-height: calc\(100dvh - 24px\)/);
    assert.match(css, /@media \(max-width: 390px\)/);
});

test('browser acceptance harness audits all routes and exposes sanitized performance diagnostics', () => {
    const runtimeSource = read('assets/js/core/runtime-performance.js');
    const storage = read('assets/js/core/storage.js');

    assert.match(runtimeSource, /runFinancePhase5CBrowserChecks/);
    assert.match(runtimeSource, /auditFinanceDeviceLayout/);
    assert.match(runtimeSource, /Document overflows horizontally/);
    assert.match(runtimeSource, /Mobile route control/);
    assert.match(runtimeSource, /routeActivations\.length > 30/);
    assert.doesNotMatch(runtimeSource, /transactions|masterKey|cryptoKey|vaultData/);
    assert.match(storage, /performance: typeof getFinancePerformanceDiagnostics/);
});

test('post-startup refreshes do not repaint hidden route coordinators', () => {
    const overview = read('assets/js/features/overview.js');
    const reports = read('assets/js/features/reports.js');
    const tools = read('assets/js/features/tools.js');
    const crud = read('assets/js/features/crud.js');

    assert.match(overview, /shouldRenderFinanceRoute\('overview'\)/);
    assert.match(reports, /shouldRenderFinanceRoute\('reports'\)/);
    assert.match(tools, /shouldRenderFinanceRoute\('tools'\)/);
    assert.match(crud, /function isFinanceRouteActive\(routeId\)/);
    assert.match(crud, /const reportsActive = isFinanceRouteActive\('reports'\)/);
    assert.match(crud, /renderCreditCards\(rawCreditCards, \{ render: isFinanceRouteActive\('wealth'\) \}\)/);
    assert.match(crud, /loadAndRenderWishlist\(\{ render: isFinanceRouteActive\('plan'\) \}\)/);
    assert.doesNotMatch(crud, /renderCryptoWidget\(\); \/\/ Update crypto summary/);
});
