'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const {
    assessFinanceSnapshotCutover,
    buildFinanceCashOnHandView,
    buildFinanceMarketNetWorthView,
    resolveFinanceStatementBookPosition,
    validate
} = require('../assets/js/core/snapshot-adapter.js');

function readyReport(options = {}) {
    const marketValue = options.marketValue === undefined ? 500 : options.marketValue;
    const missingPriceCount = Number(options.missingPriceCount || 0);
    return {
        history: { ready: options.historyReady !== false },
        valuation: { missingPriceCount },
        current: {
            canonical: {
                asOf: '2026-07-31T12:00:00.000Z',
                trackedCash: 1000,
                receivables: 200,
                fixedAssets: { netBookValue: 300 },
                crypto: { marketValue, marketPriceMissingCount: missingPriceCount },
                liabilities: { total: 400 },
                estimatedNetWorthMarketValue: marketValue == null ? null : 1600,
                diagnostics: {
                    safeForShadowComparison: true,
                    safeForMarketCutover: marketValue != null,
                    missingLiabilityStartDateCount: 0,
                    fixedAssetMissingDateCount: 0
                }
            },
            comparison: {
                invariantFailures: options.cashInvariantFailure ? [{ canonicalPath: 'trackedCash' }] : [],
                reviewDifferences: options.currentReviewDifference ? [{}] : []
            }
        },
        priorStatement: {
            canonical: {
                estimatedNetWorthBookValue: 1500,
                diagnostics: {
                    safeForShadowComparison: true,
                    safeForBookCutover: true,
                    missingLiabilityStartDateCount: 0,
                    fixedAssetMissingDateCount: 0
                }
            },
            comparison: {
                invariantFailures: [],
                reviewDifferences: options.statementReviewDifference ? [{}] : []
            }
        }
    };
}

function canonicalBookPosition() {
    return {
        positionSource: 'canonical_book',
        cash: 1000,
        receivables: 200,
        fixedAssets: 300,
        crypto: 450,
        cryptoBookValue: 500,
        debt: 200,
        creditCardDebt: 100,
        installmentDebt: 100,
        totalAssets: 1650,
        totalAssetsBookValue: 2000,
        totalLiabilities: 400,
        netWorth: 1250,
        netWorthBookValue: 1600
    };
}

test('snapshot adapter validates its independent surface gate', () => {
    assert.deepEqual(validate(), { valid: true, errors: [], version: '1.1.0' });
});

test('missing market prices block only the market KPI', () => {
    const report = readyReport({ marketValue: null, missingPriceCount: 3 });
    const cutover = assessFinanceSnapshotCutover(report);
    const cashView = buildFinanceCashOnHandView(report, { cash: 9999 });
    const view = buildFinanceMarketNetWorthView(report, { netWorth: 9999 });

    assert.equal(cutover.cashOnHand.mode, 'canonical');
    assert.equal(cutover.marketKpi.mode, 'unavailable');
    assert.equal(cutover.marketKpi.reason, 'missing_market_prices');
    assert.equal(cutover.marketKpi.missingPriceCount, 3);
    assert.equal(cutover.bookStatement.mode, 'canonical');
    assert.equal(cashView.mode, 'canonical');
    assert.equal(cashView.value, 1000);
    assert.equal(cashView.verifiedBankBalance, false);
    assert.equal(view.value, null);
    assert.notEqual(view.value, 9999, 'book or legacy values must not masquerade as market value');
});

test('available market value produces the canonical market view', () => {
    const report = readyReport();
    const view = buildFinanceMarketNetWorthView(report, { netWorth: 9999 });

    assert.equal(view.mode, 'canonical');
    assert.equal(view.basis, 'market');
    assert.equal(view.value, 1600);
    assert.equal(view.fixedAssets, 300);
    assert.equal(view.crypto, 500);
});

test('a current KPI mismatch does not block a reconciled book statement', () => {
    const cutover = assessFinanceSnapshotCutover(readyReport({ currentReviewDifference: true }));

    assert.equal(cutover.marketKpi.mode, 'legacy');
    assert.equal(cutover.bookStatement.mode, 'canonical');
});

test('liability-history failures do not block independently reconciled cash', () => {
    const cutover = assessFinanceSnapshotCutover(readyReport({ historyReady: false }));

    assert.equal(cutover.cashOnHand.mode, 'canonical');
    assert.equal(cutover.marketKpi.mode, 'legacy');
    assert.equal(cutover.marketKpi.reason, 'history_not_ready');
    assert.equal(cutover.bookStatement.mode, 'legacy');
});

test('cash fallback stays explicit and never fabricates a zero balance', () => {
    const report = readyReport({ cashInvariantFailure: true });
    const available = buildFinanceCashOnHandView(report, {
        cash: 725,
        asOf: '2026-07-31T12:00:00.000Z'
    });
    const unavailable = buildFinanceCashOnHandView(report);

    assert.equal(available.mode, 'legacy');
    assert.equal(available.value, 725);
    assert.equal(available.reason, 'cash_reconciliation_failed');
    assert.equal(unavailable.value, null);
    assert.equal(Object.isFrozen(available), true);
});

test('canonical statement fields cut over while old snapshots remain explicit legacy', () => {
    const report = readyReport();
    const canonical = resolveFinanceStatementBookPosition(canonicalBookPosition(), report);
    const legacy = resolveFinanceStatementBookPosition({
        positionSource: 'legacy_compatible',
        cash: 1000,
        receivables: 200,
        crypto: 450,
        debt: 200,
        creditCardDebt: 100,
        installmentDebt: 100,
        totalAssets: 1650,
        totalLiabilities: 400,
        netWorth: 1250,
        netWorthBookValue: 9999
    }, report);

    assert.equal(canonical.mode, 'canonical');
    assert.equal(canonical.fixedAssets, 300);
    assert.equal(canonical.netWorthBookValue, 1600);
    assert.equal(legacy.mode, 'legacy');
    assert.equal(legacy.reason, 'legacy_snapshot');
    assert.equal(legacy.fixedAssets, 0);
    assert.equal(legacy.netWorthBookValue, 1250);
});

test('browser load order places the adapter before storage and visible consumers', () => {
    const financeRoot = path.join(__dirname, '..');
    const html = fs.readFileSync(path.join(financeRoot, 'index.html'), 'utf8');
    const schemaIndex = html.indexOf('assets/js/core/snapshot-schema.js');
    const adapterIndex = html.indexOf('assets/js/core/snapshot-adapter.js');
    const storageIndex = html.indexOf('assets/js/core/storage.js');
    const statementsIndex = html.indexOf('assets/js/features/statements.js');

    assert.ok(adapterIndex > schemaIndex);
    assert.ok(storageIndex > adapterIndex);
    assert.ok(statementsIndex > storageIndex);
});

test('every visible net-worth consumer uses explicit market or book semantics', () => {
    const financeRoot = path.join(__dirname, '..');
    const html = fs.readFileSync(path.join(financeRoot, 'index.html'), 'utf8');
    const kpi = fs.readFileSync(path.join(financeRoot, 'assets/js/features/kpi.js'), 'utf8');
    const statements = fs.readFileSync(path.join(financeRoot, 'assets/js/features/statements.js'), 'utf8');

    assert.match(html, /Estimated Net Worth \(Market\)/);
    assert.match(kpi, /getFinanceMarketNetWorthView/);
    assert.match(kpi, /Market value unavailable/);
    assert.match(statements, /statementsResolveBookPosition/);
    assert.match(statements, /Fixed Assets \(NBV\)/);
    assert.match(statements, /Net Worth \(Book\)/);
    assert.match(statements, /Legacy snapshot/);
});
