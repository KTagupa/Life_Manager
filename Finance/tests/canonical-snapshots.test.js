'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const snapshots = require('../assets/js/core/canonical-snapshots.js');

const {
    computeCanonicalFinanceSnapshot,
    computeFinanceFixedAssetBookValue,
    compareCanonicalFinanceSnapshot,
    validate
} = snapshots;

function transaction(id, overrides = {}) {
    return {
        id,
        type: 'expense',
        category: 'Food',
        paymentSource: 'cash',
        amt: 100,
        date: '2026-01-10',
        ...overrides
    };
}

function completeFixture() {
    return {
        openingCash: 0,
        transactions: [
            transaction('income', { type: 'income', category: 'Salary', amt: 1000 }),
            transaction('cash-spend', { amt: 100 }),
            transaction('card-charge', {
                amt: 200,
                category: 'Gear',
                paymentSource: 'credit_card',
                creditCardId: 'card-1'
            }),
            transaction('card-payment', {
                type: 'credit_card_payment',
                category: 'Card Payments',
                amt: 80,
                creditCardId: 'card-1'
            }),
            transaction('lent-advance', { category: 'Lent: Alex', amt: 200, lentId: 'lent-1' }),
            transaction('lent-return', {
                type: 'non_income_cash_in',
                category: 'Lent: Alex',
                amt: 50,
                lentId: 'lent-1'
            }),
            transaction('debt-seed', {
                type: 'debt_increase',
                category: 'Debt to pay: Family Loan',
                amt: 1000,
                date: '2026-01-01',
                debtId: 'debt-1',
                debtBorrowTracked: true,
                debtPrincipalSeed: true
            }),
            transaction('debt-increase', {
                type: 'debt_increase',
                category: 'Debt to pay: Family Loan',
                amt: 300,
                date: '2026-02-01',
                debtId: 'debt-1',
                debtBorrowTracked: false
            }),
            transaction('debt-payment', {
                category: 'Debt to pay: Family Loan',
                amt: 400,
                date: '2026-03-01',
                debtId: 'debt-1'
            }),
            transaction('installment-payment', {
                type: 'installment_payment',
                category: 'Installments/BNPL',
                amt: 150,
                date: '2026-04-01',
                installmentPlanId: 'plan-1'
            })
        ],
        debts: [{
            id: 'debt-1',
            name: 'Family Loan',
            amount: 1000,
            borrowDate: '2026-01-01'
        }],
        creditCards: [{
            id: 'card-1',
            name: 'Rewards Card',
            openingBalance: 50,
            createdAt: '2025-12-01'
        }],
        installmentPlans: [{
            id: 'plan-1',
            name: 'Phone Plan',
            totalAmount: 600,
            startDate: '2026-01-01',
            historicalPayments: [{ amount: 100, date: '2026-02-15' }]
        }],
        fixedAssets: [{
            id: 'asset-1',
            name: 'Laptop',
            value: 1200,
            lifespan: 12,
            purchaseDate: '2026-01-01'
        }],
        cryptoBookValue: 300,
        cryptoMarketValue: 400
    };
}

test('canonical snapshot engine validates its invariants', () => {
    assert.deepEqual(validate(), { valid: true, errors: [], version: '1.3.0' });
});

test('fixed-asset book value is date-bound, capped, and immutable', () => {
    const assets = [
        { id: 'active', name: 'Active', value: 1200, lifespan: 12, purchaseDate: '2026-01-15' },
        { id: 'future', name: 'Future', value: 500, lifespan: 10, purchaseDate: '2026-08-01' },
        { id: 'old', name: 'Old', value: 240, lifespan: 12, purchaseDate: '2024-01-01' },
        { id: 'removed-later', name: 'Removed Later', value: 600, lifespan: 12, purchaseDate: '2026-01-01', deletedAt: '2026-08-01' }
    ];
    const before = structuredClone(assets);
    const result = computeFinanceFixedAssetBookValue(assets, '2026-07-15');

    assert.equal(result.assetCount, 3);
    assert.equal(result.acquisitionCost, 2040);
    assert.equal(result.accumulatedDepreciation, 1140);
    assert.equal(result.netBookValue, 900);
    assert.deepEqual(assets, before);
    assert.equal(Object.isFrozen(result), true);
    assert.equal(Object.isFrozen(result.assets), true);
});

test('snapshot composes cash, receivables, liabilities, assets, and both crypto variants', () => {
    const fixture = completeFixture();
    const before = structuredClone(fixture);
    const result = computeCanonicalFinanceSnapshot(fixture, { asOf: '2026-07-01' });

    assert.equal(result.trackedCash, 1120);
    assert.equal(result.receivables, 150);
    assert.equal(result.liabilities.debt.total, 900);
    assert.equal(result.liabilities.creditCards.total, 170);
    assert.equal(result.liabilities.installments.total, 350);
    assert.equal(result.liabilities.total, 1420);
    assert.equal(result.fixedAssets.netBookValue, 600);
    assert.equal(result.totalAssetsBookValue, 2170);
    assert.equal(result.totalAssetsMarketValue, 2270);
    assert.equal(result.estimatedNetWorthBookValue, 750);
    assert.equal(result.estimatedNetWorthMarketValue, 850);
    assert.equal(result.diagnostics.safeForVisibleCutover, true);
    assert.deepEqual(fixture, before);
    assert.equal(Object.isFrozen(result), true);
});

test('credit-card liabilities are independent of transaction array order', () => {
    const base = completeFixture();
    const forward = computeCanonicalFinanceSnapshot(base, { asOf: '2026-07-01' });
    const paymentFirst = computeCanonicalFinanceSnapshot({
        ...base,
        transactions: [...base.transactions].sort((left, right) => {
            if (left.id === 'card-payment') return -1;
            if (right.id === 'card-payment') return 1;
            return 0;
        })
    }, { asOf: '2026-07-01' });

    assert.equal(forward.liabilities.creditCards.total, 170);
    assert.equal(paymentFirst.liabilities.creditCards.total, 170);
    assert.deepEqual(
        paymentFirst.liabilities.creditCards.cards.map(card => ({
            id: card.id,
            openingBalance: card.openingBalance,
            charges: card.charges,
            payments: card.payments,
            outstanding: card.outstanding
        })),
        forward.liabilities.creditCards.cards.map(card => ({
            id: card.id,
            openingBalance: card.openingBalance,
            charges: card.charges,
            payments: card.payments,
            outstanding: card.outstanding
        }))
    );
    assert.equal(paymentFirst.liabilities.creditCards.legacyOrderSensitiveTotal, 200);

    const auditedDifference = compareCanonicalFinanceSnapshot(paymentFirst, {
        cash: paymentFirst.trackedCash,
        receivables: paymentFirst.receivables,
        debt: paymentFirst.liabilities.debt.total,
        creditCardDebt: 200,
        installmentDebt: paymentFirst.liabilities.installments.total,
        fixedAssets: paymentFirst.fixedAssets.netBookValue,
        crypto: paymentFirst.crypto.marketValue,
        netWorth: paymentFirst.estimatedNetWorthMarketValue
    }, { variant: 'market' });
    assert.equal(auditedDifference.reviewDifferences.length, 0);
    assert.ok(auditedDifference.expectedDifferences.some(
        item => item.canonicalPath === 'liabilities.creditCards.total'
    ));
});

test('soft-deleted liability records remain available only before their deletion time', () => {
    const input = {
        openingCash: 0,
        transactions: [],
        debts: [{
            id: 'debt-deleted',
            name: 'Historical Debt',
            amount: 100,
            createdAt: '2026-01-01',
            deletedAt: '2026-06-01'
        }],
        creditCards: [{
            id: 'card-deleted',
            openingBalance: 50,
            createdAt: '2026-01-01',
            deletedAt: '2026-06-01'
        }],
        installmentPlans: [{
            id: 'plan-deleted',
            totalAmount: 75,
            startDate: '2026-01-01',
            deletedAt: '2026-06-01'
        }],
        cryptoBookValue: 0,
        cryptoMarketValue: 0
    };
    const beforeDeletion = computeCanonicalFinanceSnapshot(input, { asOf: '2026-05-31' });
    const afterDeletion = computeCanonicalFinanceSnapshot(input, { asOf: '2026-06-30' });

    assert.equal(beforeDeletion.liabilities.total, 225);
    assert.equal(afterDeletion.liabilities.total, 0);
});

test('future liabilities are excluded and missing effective dates remain diagnostic', () => {
    const result = computeCanonicalFinanceSnapshot({
        openingCash: 0,
        transactions: [],
        creditCards: [
            { id: 'future', openingBalance: 500, createdAt: '2027-01-01' },
            { id: 'undated', openingBalance: 100 }
        ],
        cryptoBookValue: 0,
        cryptoMarketValue: 0
    }, { asOf: '2026-07-01' });

    assert.equal(result.liabilities.creditCards.count, 1);
    assert.equal(result.liabilities.creditCards.total, 100);
    assert.equal(result.diagnostics.missingLiabilityStartDateCount, 1);
    assert.equal(result.diagnostics.safeForVisibleCutover, false);
});

test('receivables clamp overpayments per tracked position instead of netting people together', () => {
    const result = computeCanonicalFinanceSnapshot({
        openingCash: 0,
        transactions: [
            transaction('alex-advance', { category: 'Lent: Alex', amt: 500 }),
            transaction('alex-return', { type: 'non_income_cash_in', category: 'Lent: Alex', amt: 700 }),
            transaction('sam-advance', { category: 'Lent: Sam', amt: 300 })
        ],
        lent: [
            { id: 'alex', name: 'Alex' },
            { id: 'sam', name: 'Sam' }
        ],
        cryptoBookValue: 0,
        cryptoMarketValue: 0
    }, { asOf: '2026-07-01' });

    assert.equal(result.receivables, 300);
    assert.equal(result.receivablePositions.overpayment, 200);
    assert.equal(result.receivablePositions.count, 1);
});

test('book and market values never silently fall back to one another', () => {
    const result = computeCanonicalFinanceSnapshot({
        openingCash: 0,
        transactions: [],
        cryptoBookValue: 250,
        cryptoMarketValue: null
    }, { asOf: '2026-07-01' });

    assert.equal(result.estimatedNetWorthBookValue, 250);
    assert.equal(result.totalAssetsMarketValue, null);
    assert.equal(result.estimatedNetWorthMarketValue, null);
    assert.equal(result.diagnostics.cryptoMarketValueAvailable, false);
    assert.equal(result.diagnostics.cryptoMarketValueStatus, 'unavailable');
    assert.equal(result.diagnostics.safeForBookCutover, true);
    assert.equal(result.diagnostics.safeForMarketCutover, false);

    const comparison = compareCanonicalFinanceSnapshot(result, {
        cash: 0,
        receivables: 0,
        debt: 0,
        creditCardDebt: 0,
        installmentDebt: 0,
        fixedAssets: 0,
        crypto: 250,
        netWorth: 250
    }, { variant: 'market' });
    assert.equal(comparison.reviewDifferences.length, 0);
    assert.equal(comparison.readyForVisibleCutover, false);
    assert.ok(comparison.expectedDifferences.some(item => item.canonicalPath === 'crypto.marketValue'));

    const bookComparison = compareCanonicalFinanceSnapshot(result, {
        cash: 0,
        receivables: 0,
        debt: 0,
        creditCardDebt: 0,
        installmentDebt: 0,
        fixedAssets: 0,
        crypto: 250,
        netWorth: 250
    }, { variant: 'book' });
    assert.equal(bookComparison.readyForVisibleCutover, true);
});

test('snapshot comparison blocks cash and component mismatches but records expected valuation changes', () => {
    const canonical = computeCanonicalFinanceSnapshot(completeFixture(), { asOf: '2026-07-01' });
    const legacy = {
        cash: 1120,
        receivables: 150,
        debt: 900,
        creditCardDebt: 170,
        installmentDebt: 350,
        fixedAssets: 0,
        crypto: 400,
        netWorth: 250
    };
    const expected = compareCanonicalFinanceSnapshot(canonical, legacy, { variant: 'market' });
    assert.equal(expected.status, 'expected_differences');
    assert.equal(expected.invariantFailures.length, 0);
    assert.equal(expected.reviewDifferences.length, 0);
    assert.equal(expected.expectedDifferences.length, 2);
    assert.equal(expected.readyForVisibleCutover, true);

    const brokenCash = compareCanonicalFinanceSnapshot(canonical, { ...legacy, cash: 1119 }, { variant: 'market' });
    assert.equal(brokenCash.status, 'invariant_failure');
    assert.equal(brokenCash.invariantFailures.length, 1);
    assert.equal(brokenCash.readyForVisibleCutover, false);

    const brokenDebt = compareCanonicalFinanceSnapshot(canonical, { ...legacy, debt: 899 }, { variant: 'market' });
    assert.equal(brokenDebt.status, 'review');
    assert.equal(brokenDebt.reviewDifferences.length, 1);
    assert.equal(brokenDebt.readyForVisibleCutover, false);
});

test('the browser loads snapshot calculation before the shadow reconciler', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    const metricsIndex = html.indexOf('assets/js/core/canonical-metrics.js');
    const snapshotIndex = html.indexOf('assets/js/core/canonical-snapshots.js');
    const legacyIndex = html.indexOf('assets/js/core/metrics.js');
    const metricShadowIndex = html.indexOf('assets/js/features/metric-shadow.js');
    const snapshotShadowIndex = html.indexOf('assets/js/features/snapshot-shadow.js');

    assert.ok(snapshotIndex > metricsIndex);
    assert.ok(legacyIndex > snapshotIndex);
    assert.ok(snapshotShadowIndex > metricShadowIndex);

    const snapshotShadow = fs.readFileSync(
        path.join(__dirname, '..', 'assets/js/features/snapshot-shadow.js'),
        'utf8'
    );
    assert.doesNotMatch(snapshotShadow, /innerHTML|textContent|saveDB|setDB/);
    assert.match(snapshotShadow, /financeSnapshotShadowReport/);
    assert.match(snapshotShadow, /hydrateFinanceSnapshotHistory/);
    assert.match(snapshotShadow, /unavailable_missing_prices/);

    const auth = fs.readFileSync(path.join(__dirname, '..', 'assets/js/core/auth.js'), 'utf8');
    assert.match(auth, /snapshot-history/);
    assert.match(auth, /hydrateFinanceSnapshotHistory\(db\)/);
});
