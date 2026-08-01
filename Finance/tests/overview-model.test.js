'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const {
    CARD_ORDER,
    buildFinanceOverviewModel,
    validate
} = require('../assets/js/core/overview-model.js');

function canonicalInput(overrides = {}) {
    return {
        cashView: {
            mode: 'canonical',
            basis: 'tracked_cash',
            value: 1250,
            asOf: '2026-07-31T12:00:00.000Z',
            reason: 'ready',
            ...overrides.cashView
        },
        flowMetrics: {
            balance: 250,
            income: 1000,
            expense: 600,
            metricProvenance: { engine: 'canonical' },
            ...overrides.flowMetrics
        },
        netWorthView: {
            mode: 'canonical',
            basis: 'market',
            value: 5000,
            asOf: '2026-07-31T12:00:00.000Z',
            reason: 'ready',
            missingPriceCount: 0,
            ...overrides.netWorthView
        },
        attentionSignals: overrides.attentionSignals || {}
    };
}

test('Phase 3A validates its four-card presentation contract', () => {
    assert.deepEqual(validate(), { valid: true, errors: [], version: '1.0.0' });
    assert.deepEqual(CARD_ORDER, [
        'cash_on_hand',
        'net_cash_flow',
        'spending_to_income',
        'estimated_net_worth'
    ]);
});

test('canonical inputs produce four ordered cards with explicit grain captions', () => {
    const model = buildFinanceOverviewModel(canonicalInput(), { periodLabel: 'Jul 2026' });

    assert.equal(model.status, 'canonical');
    assert.deepEqual(model.orderedCards.map(card => card.id), CARD_ORDER);
    assert.equal(model.cards.cash_on_hand.value, 1250);
    assert.equal(model.cards.cash_on_hand.caption, 'As of Jul 31, 2026');
    assert.match(model.cards.cash_on_hand.detail, /not a bank-reconciled balance/);
    assert.equal(model.cards.net_cash_flow.value, 250);
    assert.equal(model.cards.net_cash_flow.caption, 'For Jul 2026');
    assert.equal(model.cards.spending_to_income.value, 60);
    assert.equal(model.cards.spending_to_income.caption, 'For Jul 2026');
    assert.equal(model.cards.estimated_net_worth.basis, 'market');
    assert.equal(model.cards.estimated_net_worth.caption, 'As of Jul 31, 2026');
    assert.equal(model.attention.status, 'clear');
    assert.equal(Object.isFrozen(model), true);
    assert.equal(Object.isFrozen(model.cards.cash_on_hand), true);
});

test('missing market prices do not block canonical Cash on Hand', () => {
    const model = buildFinanceOverviewModel(canonicalInput({
        netWorthView: {
            mode: 'unavailable',
            value: null,
            reason: 'missing_market_prices',
            missingPriceCount: 2
        }
    }), { periodLabel: 'Jul 2026' });

    assert.equal(model.cards.cash_on_hand.mode, 'canonical');
    assert.equal(model.cards.cash_on_hand.value, 1250);
    assert.equal(model.cards.estimated_net_worth.availability, 'unavailable');
    assert.equal(model.attention.items[0].id, 'market_value_unavailable');
    assert.match(model.attention.items[0].summary, /2 crypto holdings/);
});

test('zero earned income makes Spending to Income unavailable instead of zero', () => {
    const model = buildFinanceOverviewModel(canonicalInput({
        flowMetrics: { income: 0, expense: 300 }
    }), { periodLabel: 'Jul 2026' });

    assert.equal(model.cards.spending_to_income.value, null);
    assert.equal(model.cards.spending_to_income.availability, 'not_applicable');
    assert.equal(model.cards.spending_to_income.reason, 'zero_earned_income');
    assert.match(model.cards.spending_to_income.detail, /earned income is zero/);
    assert.equal(model.status, 'canonical');
    assert.equal(model.diagnostics.notApplicableCardCount, 1);
});

test('attention items are prioritized and capped for a concise Overview', () => {
    const model = buildFinanceOverviewModel(canonicalInput({
        flowMetrics: {
            metricProvenance: { engine: 'legacy', cutoverReason: 'reconciliation_pending' }
        },
        attentionSignals: {
            dateQuality: { quarantinedCount: 2 },
            metricFallback: { active: true, detail: 'Two records need classification review.' },
            liquidity: { ready: true, runwayDays: 42, thresholdDays: 90 },
            budgetRisks: [{ category: 'Food' }, { category: 'Travel' }],
            anomalies: [{ id: 'tx-1' }]
        }
    }), { periodLabel: 'Jul 2026', maxAttentionItems: 3 });

    assert.equal(model.attention.status, 'needs_attention');
    assert.deepEqual(model.attention.items.map(item => item.id), [
        'date_quality',
        'low_liquidity',
        'metric_fallback'
    ]);
    assert.equal(model.attention.count, 5);
    assert.equal(model.attention.hiddenCount, 2);
    assert.equal(model.attention.items[0].action.targetView, 'activity');
});

test('legacy cash and flow states stay visible and auditable', () => {
    const model = buildFinanceOverviewModel(canonicalInput({
        cashView: { mode: 'legacy', value: 900, reason: 'history_not_ready' },
        flowMetrics: {
            metricProvenance: { engine: 'legacy', cutoverReason: 'classification_review' }
        }
    }), { periodLabel: 'Current month' });

    assert.equal(model.status, 'legacy_fallback');
    assert.equal(model.cards.cash_on_hand.mode, 'legacy');
    assert.equal(model.cards.net_cash_flow.mode, 'legacy');
    assert.deepEqual(model.attention.items.map(item => item.id), [
        'metric_fallback',
        'cash_reconciliation'
    ]);
});

test('browser loads the Overview model after its adapters and before storage', () => {
    const financeRoot = path.join(__dirname, '..');
    const html = fs.readFileSync(path.join(financeRoot, 'index.html'), 'utf8');
    const snapshotAdapterIndex = html.indexOf('assets/js/core/snapshot-adapter.js');
    const metricAdapterIndex = html.indexOf('assets/js/core/metric-adapter.js');
    const overviewModelIndex = html.indexOf('assets/js/core/overview-model.js');
    const storageIndex = html.indexOf('assets/js/core/storage.js');

    assert.ok(overviewModelIndex > snapshotAdapterIndex);
    assert.ok(overviewModelIndex > metricAdapterIndex);
    assert.ok(storageIndex > overviewModelIndex);
});
