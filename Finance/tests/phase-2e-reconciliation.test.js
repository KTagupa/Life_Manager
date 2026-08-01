'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
    computeCanonicalFinanceMetrics
} = require('../assets/js/core/canonical-metrics.js');
const {
    computeCanonicalFinanceStatementProjection
} = require('../assets/js/core/canonical-statements.js');
const {
    computeCanonicalFinanceSnapshot,
    compareCanonicalFinanceSnapshot
} = require('../assets/js/core/canonical-snapshots.js');
const {
    buildPhase2ECountedOnceFixture
} = require('./fixtures/counted-once-ledger.fixture.js');
const {
    buildPhase2EReconciliationReport
} = require('./helpers/phase-2e-reconciliation.js');

function computeFixtureOutputs() {
    const fixture = buildPhase2ECountedOnceFixture();
    const metrics = computeCanonicalFinanceMetrics(fixture.transactions, {
        context: fixture.context
    });
    const statement = computeCanonicalFinanceStatementProjection(fixture.transactions, {
        context: fixture.context
    });
    const snapshot = computeCanonicalFinanceSnapshot(fixture.snapshotInput, {
        asOf: fixture.asOf,
        context: fixture.context
    });
    const legacy = {
        cash: snapshot.trackedCash,
        receivables: snapshot.receivables,
        debt: snapshot.liabilities.debt.legacyFullPaymentTotal,
        creditCardDebt: snapshot.liabilities.creditCards.total,
        installmentDebt: snapshot.liabilities.installments.total,
        fixedAssets: snapshot.fixedAssets.netBookValue,
        crypto: snapshot.crypto.bookValue,
        netWorth: snapshot.estimatedNetWorthBookValue
    };
    const legacyComparison = compareCanonicalFinanceSnapshot(snapshot, legacy, { variant: 'book' });
    return { fixture, metrics, statement, snapshot, legacy, legacyComparison };
}

test('Phase 2E-C produces one immutable end-to-end reconciliation report', () => {
    const outputs = computeFixtureOutputs();
    const report = buildPhase2EReconciliationReport(outputs);

    assert.equal(report.version, '1.0.0');
    assert.equal(report.status, 'reconciled');
    assert.equal(report.failedCount, 0);
    assert.deepEqual(report.failedCheckIds, []);
    assert.equal(report.passedCount, report.checkCount);
    assert.ok(report.checkCount >= 20);
    assert.equal(Object.isFrozen(report), true);
    assert.equal(Object.isFrozen(report.checks), true);
    assert.equal(Object.isFrozen(report.checks[0]), true);
});

test('Phase 2E-C rejects an unexplained debt mismatch instead of widening the legacy exception', () => {
    const outputs = computeFixtureOutputs();
    const unexplainedLegacy = {
        ...outputs.legacy,
        debt: outputs.legacy.debt - 1
    };
    const strictComparison = compareCanonicalFinanceSnapshot(
        outputs.snapshot,
        unexplainedLegacy,
        { variant: 'book' }
    );
    const report = buildPhase2EReconciliationReport({
        ...outputs,
        legacyComparison: strictComparison
    });

    assert.equal(strictComparison.status, 'review');
    assert.equal(strictComparison.readyForVisibleCutover, false);
    assert.equal(strictComparison.reviewDifferences.length, 1);
    assert.equal(strictComparison.reviewDifferences[0].canonicalPath, 'liabilities.debt.total');
    assert.equal(
        strictComparison.expectedDifferences.some(
            item => item.canonicalPath === 'liabilities.debt.total'
        ),
        false
    );
    assert.equal(report.status, 'failed');
    assert.ok(report.failedCheckIds.includes('legacy_debt_difference_equals_recorded_finance_charges'));
    assert.ok(report.failedCheckIds.includes('legacy_debt_difference_reason_is_audited'));
    assert.ok(report.failedCheckIds.includes('legacy_comparison_has_no_review_differences'));
    assert.ok(report.failedCheckIds.includes('legacy_comparison_gate_remains_ready'));
});

test('Phase 2E-C report detects a broken counted-once consumption identity', () => {
    const outputs = computeFixtureOutputs();
    const report = buildPhase2EReconciliationReport({
        ...outputs,
        metrics: {
            ...outputs.metrics,
            consumptionSpending: outputs.metrics.consumptionSpending + 1
        }
    });

    assert.equal(report.status, 'failed');
    assert.ok(report.failedCheckIds.includes('consumption_is_purchase_plus_finance_costs'));
    assert.ok(report.failedCheckIds.includes('snapshot_and_metric_consumption_agree'));
});
