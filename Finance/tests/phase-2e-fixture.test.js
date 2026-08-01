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
    PHASE_2E_COUNTED_ONCE_EXPECTED,
    buildPhase2ECountedOnceFixture
} = require('./fixtures/counted-once-ledger.fixture.js');

function projectEvent(classification) {
    return {
        classId: classification.classId,
        cashDelta: classification.cashDelta,
        consumptionDelta: classification.consumptionDelta,
        financeChargeConsumptionDelta: classification.financeChargeConsumptionDelta,
        settlementDelta: classification.settlementDelta,
        liabilityDelta: classification.liabilityDelta
    };
}

test('Phase 2E counted-once fixture returns fresh inputs and an immutable expected ledger', () => {
    const first = buildPhase2ECountedOnceFixture();
    const second = buildPhase2ECountedOnceFixture();

    assert.notEqual(first, second);
    assert.notEqual(first.transactions, second.transactions);
    assert.notEqual(first.snapshotInput, second.snapshotInput);
    assert.equal(first.snapshotInput.transactions, first.transactions);
    assert.equal(Object.isFrozen(PHASE_2E_COUNTED_ONCE_EXPECTED), true);
    assert.equal(Object.isFrozen(PHASE_2E_COUNTED_ONCE_EXPECTED.events['debt-payment']), true);
    assert.deepEqual(first.expected, second.expected);
});

test('shared fixture classifies card activity and principal settlements exactly once', () => {
    const fixture = buildPhase2ECountedOnceFixture();
    const before = structuredClone(fixture.transactions);
    const metrics = computeCanonicalFinanceMetrics(fixture.transactions, {
        context: fixture.context
    });
    const classificationsById = Object.fromEntries(metrics.classifications.map((classification, index) => (
        [fixture.transactions[index].id, projectEvent(classification)]
    )));

    Object.entries(fixture.expected.events).forEach(([transactionId, expected]) => {
        assert.deepEqual(classificationsById[transactionId], expected, transactionId);
    });
    assert.deepEqual(fixture.transactions, before);
});

test('shared fixture reconciles canonical metrics and Statements without double counting', () => {
    const fixture = buildPhase2ECountedOnceFixture();
    const metrics = computeCanonicalFinanceMetrics(fixture.transactions, {
        context: fixture.context
    });
    const statement = computeCanonicalFinanceStatementProjection(fixture.transactions, {
        context: fixture.context
    });
    const expectedMetrics = fixture.expected.metrics;
    const expectedStatement = fixture.expected.statement;

    assert.equal(metrics.transactionCount, expectedMetrics.transactionCount);
    assert.equal(metrics.netCashFlow, expectedMetrics.netCashFlow);
    assert.equal(metrics.earnedIncome, expectedMetrics.earnedIncome);
    assert.equal(metrics.otherCashIn, expectedMetrics.otherCashIn);
    assert.equal(metrics.consumptionSpending, expectedMetrics.consumptionSpending);
    assert.equal(metrics.financeChargeSpending, expectedMetrics.financeChargeSpending);
    assert.equal(metrics.settlements, expectedMetrics.settlements);
    assert.equal(metrics.liabilityDelta, expectedMetrics.liabilityDelta);
    assert.equal(metrics.savingsRate, expectedMetrics.savingsRate);
    assert.deepEqual(metrics.spendingByCategory, expectedMetrics.spendingByCategory);
    assert.equal(metrics.diagnostics.safeForVisibleCutover, true);

    assert.equal(statement.pnl.income, expectedStatement.income);
    assert.equal(statement.pnl.costOfEarning, expectedStatement.costOfEarning);
    assert.equal(statement.pnl.operatingExpenses, expectedStatement.operatingExpenses);
    assert.equal(statement.pnl.ebitda, expectedStatement.ebitda);
    assert.equal(statement.pnl.financeCosts, expectedStatement.financeCosts);
    assert.equal(statement.pnl.netIncome, expectedStatement.netIncome);
    assert.equal(statement.pnl.debtService, expectedStatement.debtService);
    assert.equal(statement.cashflow.operatingCashFlow, expectedStatement.operatingCashFlow);
    assert.equal(statement.cashflow.investingCashFlow, expectedStatement.investingCashFlow);
    assert.equal(statement.cashflow.financingCashFlow, expectedStatement.financingCashFlow);
    assert.equal(statement.cashflow.transferCashFlow, expectedStatement.transferCashFlow);
    assert.equal(statement.cashflow.netCashFlow, expectedStatement.netCashFlow);
    assert.equal(statement.cashflow.creditCardBorrowing, expectedStatement.cardPurchasesNonCash);
    assert.equal(statement.cashflow.creditCardPayments, expectedStatement.cardPayments);
    assert.equal(statement.cashflow.debtPayments, expectedStatement.debtPayments);
    assert.equal(statement.cashflow.installmentPayments, expectedStatement.installmentPayments);
    assert.equal(statement.cashflow.bucketedNetCashFlow, metrics.netCashFlow);
    assert.equal(statement.diagnostics.cashFlowDifference, 0);
    assert.equal(statement.diagnostics.safeForVisibleCutover, true);

    // The accounting bridge is the core counted-once invariant: consumption is
    // purchases plus finance charges, while cash settlements remain separate.
    assert.equal(
        metrics.consumptionSpending,
        expectedStatement.cardPurchasesNonCash + expectedStatement.financeCosts
    );
    assert.equal(
        metrics.settlements + metrics.financeChargeSpending,
        expectedStatement.debtService
    );
});

test('shared fixture reconciles principal settlements with ending positions', () => {
    const fixture = buildPhase2ECountedOnceFixture();
    const snapshot = computeCanonicalFinanceSnapshot(fixture.snapshotInput, {
        asOf: fixture.asOf,
        context: fixture.context
    });
    const expected = fixture.expected.position;
    const debt = snapshot.liabilities.debt;
    const card = snapshot.liabilities.creditCards;
    const installment = snapshot.liabilities.installments;

    assert.equal(snapshot.trackedCash, expected.trackedCash);

    assert.equal(card.cards[0].openingBalance, expected.card.openingBalance);
    assert.equal(card.cards[0].charges, expected.card.charges);
    assert.equal(card.cards[0].payments, expected.card.payments);
    assert.equal(card.total, expected.card.endingBalance);

    assert.equal(debt.debts[0].openingPrincipal, expected.debt.openingPrincipal);
    assert.equal(debt.principalRepayments, expected.debt.principalSettled);
    assert.equal(debt.financeChargesPaid, expected.debt.financeChargesPaid);
    assert.equal(debt.cashRepayments, expected.debt.principalSettled + expected.debt.financeChargesPaid);
    assert.equal(debt.fullPaymentRepayments, expected.debt.principalSettled + expected.debt.financeChargesPaid);
    assert.equal(debt.total, expected.debt.endingPrincipal);
    assert.equal(debt.legacyFullPaymentTotal, 7800);

    assert.equal(installment.plans[0].scheduledObligation, expected.installment.openingContractualBalance);
    assert.equal(installment.plans[0].openingPrincipal, expected.installment.openingPrincipal);
    assert.equal(installment.plans[0].transactionPrincipalPayments, expected.installment.principalSettled);
    assert.equal(installment.plans[0].transactionFinanceCharges, expected.installment.financeChargesPaid);
    assert.equal(installment.principalTotal, expected.installment.endingPrincipal);
    assert.equal(installment.remainingFinanceChargeTotal, 150);
    assert.equal(installment.contractualTotal, expected.installment.endingContractualBalance);
    assert.equal(installment.total, expected.installment.endingContractualBalance);
    assert.equal(installment.missingFeeSplitPaymentCount, 0);

    const openingPrincipalPositions = expected.debt.openingPrincipal
        + expected.card.openingBalance
        + expected.installment.openingPrincipal;
    const endingPrincipalPositions = debt.total + card.total + installment.principalTotal;
    assert.equal(
        endingPrincipalPositions - openingPrincipalPositions,
        snapshot.flows.liabilityDelta
    );

    const legacy = {
        cash: snapshot.trackedCash,
        receivables: snapshot.receivables,
        debt: debt.legacyFullPaymentTotal,
        creditCardDebt: card.total,
        installmentDebt: installment.total,
        fixedAssets: snapshot.fixedAssets.netBookValue,
        crypto: snapshot.crypto.bookValue,
        netWorth: snapshot.estimatedNetWorthBookValue
    };
    const comparison = compareCanonicalFinanceSnapshot(snapshot, legacy, { variant: 'book' });
    const debtDifference = comparison.expectedDifferences.find(
        item => item.canonicalPath === 'liabilities.debt.total'
    );
    assert.equal(comparison.reviewDifferences.length, 0);
    assert.equal(comparison.readyForVisibleCutover, true);
    assert.equal(debtDifference?.difference, expected.debt.financeChargesPaid);
    assert.equal(
        debtDifference?.expectedDifferenceReason,
        'legacy_full_payment_reduced_debt_principal'
    );
});
