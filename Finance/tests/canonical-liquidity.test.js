'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const liquidity = require('../assets/js/core/canonical-liquidity.js');

const {
    getFinanceCompleteMonthWindow,
    computeCanonicalFinanceLiquidity,
    validate
} = liquidity;

function expense(id, date, amt = 300, overrides = {}) {
    return {
        id,
        type: 'expense',
        category: 'Food',
        paymentSource: 'cash',
        date,
        amt,
        ...overrides
    };
}

test('canonical liquidity engine validates its contract', () => {
    assert.deepEqual(validate(), { valid: true, errors: [], version: '1.0.0' });
});

test('window contains exactly the three complete calendar months before the as-of month', () => {
    const july = getFinanceCompleteMonthWindow('2026-07-31');
    const january = getFinanceCompleteMonthWindow('2026-01-15');

    assert.equal(july.startDateKey, '2026-04-01');
    assert.equal(july.endDateKey, '2026-06-30');
    assert.deepEqual(july.monthKeys, ['2026-04', '2026-05', '2026-06']);
    assert.equal(january.startDateKey, '2025-10-01');
    assert.equal(january.endDateKey, '2025-12-31');
});

test('runway uses canonical consumption and excludes current and fourth-prior months', () => {
    const result = computeCanonicalFinanceLiquidity({
        trackedCash: 600,
        transactions: [
            expense('march', '2026-03-31', 900),
            expense('april', '2026-04-10', 300),
            expense('may-card-charge', '2026-05-10', 300, {
                paymentSource: 'credit_card',
                creditCardId: 'card-1'
            }),
            {
                id: 'may-card-payment',
                type: 'credit_card_payment',
                category: 'Card Payments',
                creditCardId: 'card-1',
                date: '2026-05-20',
                amt: 300
            },
            expense('june-savings', '2026-06-10', 300, { category: 'Savings' }),
            expense('july', '2026-07-01', 900)
        ]
    }, { asOf: '2026-07-15' });

    assert.equal(result.totalConsumptionSpending, 600);
    assert.equal(result.averageMonthlyConsumption, 200);
    assert.equal(result.liquidityRunwayMonths, 3);
    assert.equal(result.liquidityRunwayDays, 90);
    assert.equal(result.status, 'available');
});

test('receivables and crypto cannot enter the liquidity numerator', () => {
    const result = computeCanonicalFinanceLiquidity({
        trackedCash: 300,
        receivables: 10000,
        cryptoMarketValue: 20000,
        transactions: [expense('april', '2026-04-10', 300)]
    }, { asOf: '2026-07-15' });

    assert.equal(result.eligibleCash, 300);
    assert.equal(result.averageMonthlyConsumption, 100);
    assert.equal(result.liquidityRunwayMonths, 3);
});

test('missing spending returns an explicit unavailable runway instead of infinity', () => {
    const result = computeCanonicalFinanceLiquidity({
        trackedCash: 300,
        transactions: []
    }, { asOf: '2026-07-15' });

    assert.equal(result.averageMonthlyConsumption, 0);
    assert.equal(result.liquidityRunwayMonths, null);
    assert.equal(result.liquidityRunwayDays, null);
    assert.equal(result.status, 'no_consumption_history');
});

test('quarantined dates block visible liquidity readiness', () => {
    const result = computeCanonicalFinanceLiquidity({
        trackedCash: 300,
        transactions: [
            expense('april', '2026-04-10', 300),
            expense('unknown-date', '', 500)
        ]
    }, { asOf: '2026-07-15' });

    assert.equal(result.diagnostics.quarantinedDateCount, 1);
    assert.equal(result.diagnostics.safeForVisibleCutover, false);
    assert.equal(result.status, 'data_review');
});

test('liquidity results are immutable', () => {
    const result = computeCanonicalFinanceLiquidity({
        trackedCash: 300,
        transactions: [expense('april', '2026-04-10', 300)]
    }, { asOf: '2026-07-15' });

    assert.equal(Object.isFrozen(result), true);
    assert.equal(Object.isFrozen(result.window), true);
    assert.equal(Object.isFrozen(result.diagnostics), true);
});

test('browser loads liquidity before its visible consumers', () => {
    const financeRoot = path.join(__dirname, '..');
    const html = fs.readFileSync(path.join(financeRoot, 'index.html'), 'utf8');
    const liquidityIndex = html.indexOf('assets/js/core/canonical-liquidity.js');
    const kpiIndex = html.indexOf('assets/js/features/kpi.js');
    const overviewIndex = html.indexOf('assets/js/features/overview.js');
    const kpi = fs.readFileSync(path.join(financeRoot, 'assets/js/features/kpi.js'), 'utf8');
    const overview = fs.readFileSync(path.join(financeRoot, 'assets/js/features/overview.js'), 'utf8');
    const insights = fs.readFileSync(path.join(financeRoot, 'assets/js/features/insights.js'), 'utf8');

    assert.ok(liquidityIndex > 0);
    assert.ok(kpiIndex > liquidityIndex);
    assert.ok(overviewIndex > liquidityIndex);
    assert.match(kpi, /computeCanonicalFinanceLiquidity/);
    assert.doesNotMatch(kpi, /runwayLiquidAssets/);
    assert.match(overview, /computeCanonicalFinanceLiquidity/);
    assert.doesNotMatch(insights, /computeCanonicalFinanceLiquidity/);
    assert.match(html, /Liquidity Runway/);
    assert.match(html, /Emergency Fund \(Proxy\)/);
    assert.match(html, /Current Ratio \(Proxy\)/);
    assert.doesNotMatch(html, />30-Day Obligation Coverage</);
});
