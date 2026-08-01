'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
    CANONICAL_LABELS,
    LEGACY_LABELS,
    isFinanceCanonicalCutoverReady,
    getFinanceMetricProvenance,
    formatFinanceMetricProvenance,
    buildFinanceConsumerBreakdown,
    buildCanonicalDisplayMetrics,
    buildLegacyDisplayMetrics,
    formatFinanceSavingsRate
} = require('../assets/js/core/metric-adapter.js');

function legacy(overrides = {}) {
    return {
        scope: 'selected_period',
        balance: 800,
        income: 1000,
        nonIncomeCashIn: 0,
        expense: 400,
        avgDailySpend: 40,
        metricDayCount: 10,
        categoryExpenses: { Legacy: 400 },
        scopedTransactions: [],
        ...overrides
    };
}

test('visible cutover requires an explicitly ready shadow report', () => {
    assert.equal(isFinanceCanonicalCutoverReady(null), false);
    assert.equal(isFinanceCanonicalCutoverReady({ readyForVisibleCutover: false }), false);
    assert.equal(isFinanceCanonicalCutoverReady({ readyForVisibleCutover: true }), true);
});

test('canonical display metrics preserve the compatibility shape and canonical semantics', () => {
    const result = buildCanonicalDisplayMetrics(legacy(), {
        engineVersion: '1.2.3',
        classifierVersion: '2.3.4',
        netCashFlow: 800,
        earnedIncome: 1000,
        otherCashIn: 200,
        consumptionSpending: 250,
        savingsRate: 75,
        spendingByCategory: { Food: 250 }
    });

    assert.equal(result.balance, 800);
    assert.equal(result.netCashFlow, 800);
    assert.equal(result.income, 1000);
    assert.equal(result.nonIncomeCashIn, 200);
    assert.equal(result.expense, 250);
    assert.equal(result.avgDailySpend, 25);
    assert.equal(result.savingsRate, 75);
    assert.deepEqual(result.categoryExpenses, { Food: 250 });
    assert.equal(result.metricEngine, 'canonical');
    assert.equal(result.metricProvenance.engine, 'canonical');
    assert.equal(result.metricProvenance.engineVersion, '1.2.3');
    assert.equal(result.metricProvenance.classifierVersion, '2.3.4');
    assert.equal(result.metricProvenance.cutoverReason, null);
    assert.equal(Object.isFrozen(result.metricProvenance), true);
    assert.equal(getFinanceMetricProvenance(result), result.metricProvenance);
    assert.equal(formatFinanceMetricProvenance(result), 'Canonical metrics v1.2.3');
    assert.equal(result.metricLabels, CANONICAL_LABELS);
});

test('zero earned income produces an unavailable savings rate', () => {
    const canonical = buildCanonicalDisplayMetrics(legacy({ income: 0 }), {
        netCashFlow: -100,
        earnedIncome: 0,
        otherCashIn: 0,
        consumptionSpending: 100,
        savingsRate: null,
        spendingByCategory: { Food: 100 }
    });
    const fallback = buildLegacyDisplayMetrics(legacy({ income: 0, savingsRate: 0 }));

    assert.equal(canonical.savingsRate, null);
    assert.equal(fallback.savingsRate, null);
    assert.equal(formatFinanceSavingsRate(null), 'n/a');
    assert.equal(formatFinanceSavingsRate(12.34), '12.3%');
});

test('legacy fallback is explicitly labeled and keeps legacy totals', () => {
    const result = buildLegacyDisplayMetrics(legacy(), { readyForVisibleCutover: false });
    assert.equal(result.balance, 800);
    assert.equal(result.expense, 400);
    assert.equal(result.metricEngine, 'legacy');
    assert.equal(result.metricProvenance.engine, 'legacy');
    assert.equal(result.metricProvenance.cutoverReason, 'cutover_gate_not_ready');
    assert.equal(formatFinanceMetricProvenance(result), 'Legacy metrics (cutover gate not ready)');
    assert.equal(result.metricLabels, LEGACY_LABELS);
    assert.equal(result.cutoverReason, 'cutover_gate_not_ready');
});

test('consumer breakdown derives debt service, savings, and income sources from aligned canonical classifications', () => {
    const scopedTransactions = [
        { id: 'salary', category: 'Salary' },
        { id: 'debt-payment', category: 'Loan' },
        { id: 'card-payment', category: 'Card Payments' },
        { id: 'savings', category: 'Savings' }
    ];
    const metrics = buildCanonicalDisplayMetrics(legacy({ scopedTransactions }), {
        engineVersion: '1.0.0',
        classifierVersion: '1.0.0',
        netCashFlow: 350,
        earnedIncome: 1000,
        otherCashIn: 0,
        consumptionSpending: 50,
        savingsRate: 95,
        spendingByCategory: { Finance: 50 },
        classifications: [
            { kind: 'income', counterpartyType: null, earnedIncomeDelta: 1000 },
            { kind: 'settlement', counterpartyType: 'debt', settlementDelta: 300, financeChargeConsumptionDelta: 50 },
            { kind: 'settlement', counterpartyType: 'credit_card', settlementDelta: 200, financeChargeConsumptionDelta: 0 },
            { kind: 'transfer', counterpartyType: 'savings', transferDelta: -100 }
        ]
    });

    const breakdown = buildFinanceConsumerBreakdown(metrics);
    assert.equal(breakdown.available, true);
    assert.equal(breakdown.debtService, 550);
    assert.equal(breakdown.savingsContribution, 100);
    assert.deepEqual(breakdown.incomeByCategory, { Salary: 1000 });
    assert.equal(Object.isFrozen(breakdown), true);
    assert.equal(Object.isFrozen(breakdown.incomeByCategory), true);
});

test('consumer breakdown stays explicitly unavailable while legacy fallback is active', () => {
    const breakdown = buildFinanceConsumerBreakdown(buildLegacyDisplayMetrics(legacy()));
    assert.equal(breakdown.available, false);
    assert.equal(breakdown.reason, 'legacy_fallback_active');
    assert.equal(breakdown.debtService, null);
    assert.equal(breakdown.savingsContribution, null);
});
