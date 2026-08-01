'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const release = require('../assets/js/core/release-readiness.js');

const financeRoot = path.join(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(financeRoot, relativePath), 'utf8');

function passingEvidence() {
    return Object.fromEntries(release.GATE_DEFINITIONS.map(gate => [gate.id, { valid: true }]));
}

test('Phase 5D defines eight unique immutable release gates', () => {
    assert.deepEqual(release.GATE_DEFINITIONS.map(gate => gate.id), [
        'canonical_contracts',
        'fixture_reconciliation',
        'accessibility_navigation',
        'data_safety',
        'device_performance',
        'preview_isolation',
        'regression_suite',
        'live_browser_acceptance'
    ]);
    assert.equal(new Set(release.GATE_DEFINITIONS.map(gate => gate.id)).size, 8);
    assert.equal(Object.isFrozen(release.GATE_DEFINITIONS), true);
});

test('complete evidence produces an immutable ready report', () => {
    const report = release.buildFinanceReleaseReadinessReport(passingEvidence(), {
        generatedAt: '2026-08-01T12:00:00.000Z'
    });

    assert.equal(report.valid, true);
    assert.equal(report.status, 'ready');
    assert.equal(report.passedCount, 8);
    assert.equal(report.blockers.length, 0);
    assert.equal(report.generatedAt, '2026-08-01T12:00:00.000Z');
    assert.equal(Object.isFrozen(report), true);
    assert.equal(Object.isFrozen(report.gates), true);
});

test('missing and failed evidence block release without copying arbitrary details', () => {
    const evidence = passingEvidence();
    delete evidence.regression_suite;
    evidence.device_performance = { valid: false, errors: ['private runtime detail'] };
    const report = release.buildFinanceReleaseReadinessReport(evidence);

    assert.equal(report.valid, false);
    assert.equal(report.status, 'blocked');
    assert.deepEqual(report.blockers.map(blocker => [blocker.id, blocker.status]), [
        ['device_performance', 'failed'],
        ['regression_suite', 'missing']
    ]);
    assert.equal(report.blockers[0].issueCount, 1);
    assert.equal(JSON.stringify(report).includes('private runtime detail'), false);
});

test('release-readiness contract validates its own fail-closed invariants', () => {
    assert.deepEqual(release.validateFinanceReleaseReadinessContract(), {
        valid: true,
        errors: []
    });
});

test('browser release audit fails closed before any runtime checks outside Preview Mode', () => {
    const source = read('assets/js/core/release-readiness.js');
    const previewBoundary = source.indexOf('if (!previewIsolation.valid)');
    const accessibility = source.indexOf("invokeBrowserGate('runFinancePhase5ABrowserChecks'");
    const device = source.indexOf("invokeBrowserGate('runFinancePhase5CBrowserChecks'");

    assert.ok(previewBoundary > 0 && accessibility > previewBoundary && device > accessibility);
    assert.match(source, /memoryDatabaseReady/);
    assert.match(source, /keyMaterialCleared/);
    assert.match(source, /localStorageExcluded/);
    assert.match(source, /indexedDBExcluded/);
    assert.match(source, /safeguardsDisabled/);
});

test('release audit loads after browser contracts and before the single startup entrypoint', () => {
    const html = read('index.html');
    const runtime = html.indexOf('assets/js/core/runtime-performance.js');
    const accessibility = html.indexOf('assets/js/ui/accessibility.js');
    const releaseIndex = html.indexOf('assets/js/core/release-readiness.js');
    const appInit = html.indexOf('assets/js/core/app-init.js');
    const startup = read('assets/js/core/app-init.js');

    assert.ok(runtime > 0 && accessibility > runtime && releaseIndex > accessibility && appInit > releaseIndex);
    assert.match(startup, /validateFinanceReleaseReadinessContract/);
    assert.match(startup, /safeInit\('finance release-readiness contract'/);
});

test('Tools exposes a Preview-only release audit with an announced result', () => {
    const html = read('index.html');
    const tools = read('assets/js/features/tools.js');
    const css = read('assets/css/app.css');

    assert.match(html, /id="finance-tools-release-title"/);
    assert.match(html, /id="finance-tools-release-audit"[\s\S]*data-tools-preview-only[\s\S]*aria-disabled="true" disabled/);
    assert.match(html, /id="finance-release-audit-status"[\s\S]*role="status"/);
    assert.match(tools, /\[data-tools-preview-only\]/);
    assert.match(tools, /presentation\.previewMode !== true/);
    assert.match(css, /\.finance-tools-release-gate[\s\S]*grid-column: 1 \/ -1/);
    assert.match(css, /\.finance-tools-release-status\[data-tone="blocked"\]/);
});

test('automated release command covers syntax, the full suite, and counted-once evidence', () => {
    const script = read('scripts/run-phase-5d-automated-gate.js');

    assert.match(script, /listJavaScriptFiles/);
    assert.match(script, /runNode\(\['--check', filename\]\)/);
    assert.match(script, /runNode\(\['--test', \.\.\.testFiles\]\)/);
    assert.match(script, /phase-2e-fixture\.test\.js/);
    assert.match(script, /phase-2e-reconciliation\.test\.js/);
    assert.match(script, /fixtureReconciliation/);
    assert.match(script, /regressionSuite/);
    assert.doesNotMatch(script, /localStorage|indexedDB|masterKey|cryptoKey/);
});
