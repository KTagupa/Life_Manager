'use strict';

const VERSION = '1.0.0';
const DEFAULT_TOLERANCE = 0.005;

function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.getOwnPropertyNames(value).forEach(key => deepFreeze(value[key]));
    return Object.freeze(value);
}

function finite(value) {
    if (value == null || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
}

function numericCheck(id, actualValue, expectedValue, tolerance = DEFAULT_TOLERANCE) {
    const actual = finite(actualValue);
    const expected = finite(expectedValue);
    const comparable = actual != null && expected != null;
    const difference = comparable ? actual - expected : null;
    return {
        id,
        kind: 'numeric',
        actual,
        expected,
        difference,
        tolerance,
        passed: comparable && Math.abs(difference) <= tolerance
    };
}

function booleanCheck(id, actualValue, expectedValue = true) {
    const actual = actualValue === true;
    const expected = expectedValue === true;
    return {
        id,
        kind: 'boolean',
        actual,
        expected,
        difference: null,
        tolerance: null,
        passed: actual === expected
    };
}

function buildPhase2EReconciliationReport(input = {}) {
    const fixture = input.fixture || {};
    const metrics = input.metrics || {};
    const statement = input.statement || {};
    const snapshot = input.snapshot || {};
    const comparison = input.legacyComparison || {};
    const expected = fixture.expected || {};
    const expectedStatement = expected.statement || {};
    const expectedPosition = expected.position || {};
    const debt = snapshot.liabilities?.debt || {};
    const card = snapshot.liabilities?.creditCards || {};
    const installment = snapshot.liabilities?.installments || {};
    const transactionIds = (fixture.transactions || []).map(transaction => String(transaction?.id || ''));
    const debtDifference = (comparison.expectedDifferences || []).find(
        item => item?.canonicalPath === 'liabilities.debt.total'
    );

    const openingPrincipalPositions = finite(expectedPosition.debt?.openingPrincipal) == null
        ? null
        : Number(expectedPosition.debt.openingPrincipal || 0)
            + Number(expectedPosition.card?.openingBalance || 0)
            + Number(expectedPosition.installment?.openingPrincipal || 0);
    const endingPrincipalPositions = finite(debt.total) == null
        || finite(card.total) == null
        || finite(installment.principalTotal) == null
        ? null
        : Number(debt.total) + Number(card.total) + Number(installment.principalTotal);
    const statementBucketedCash = [
        statement.cashflow?.operatingCashFlow,
        statement.cashflow?.investingCashFlow,
        statement.cashflow?.financingCashFlow,
        statement.cashflow?.transferCashFlow,
        statement.cashflow?.unassignedCashFlow
    ].reduce((sum, value) => sum + Number(value || 0), 0);

    const checks = [
        booleanCheck(
            'transaction_ids_are_unique',
            transactionIds.length > 0
                && transactionIds.every(Boolean)
                && new Set(transactionIds).size === transactionIds.length
        ),
        numericCheck(
            'consumption_is_purchase_plus_finance_costs',
            metrics.consumptionSpending,
            Number(expectedStatement.cardPurchasesNonCash || 0) + Number(statement.pnl?.financeCosts || 0)
        ),
        numericCheck(
            'finance_costs_match_metric_finance_charges',
            statement.pnl?.financeCosts,
            metrics.financeChargeSpending
        ),
        numericCheck(
            'debt_service_is_settlement_plus_finance_charges',
            statement.pnl?.debtService,
            Number(metrics.settlements || 0) + Number(metrics.financeChargeSpending || 0)
        ),
        numericCheck(
            'pnl_bridge_reconciles',
            statement.pnl?.netIncome,
            Number(statement.pnl?.income || 0)
                - Number(statement.pnl?.costOfEarning || 0)
                - Number(statement.pnl?.operatingExpenses || 0)
                - Number(statement.pnl?.financeCosts || 0)
        ),
        numericCheck('metric_and_statement_cash_agree', statement.cashflow?.netCashFlow, metrics.netCashFlow),
        numericCheck('statement_cash_buckets_reconcile', statementBucketedCash, statement.cashflow?.netCashFlow),
        numericCheck('opening_cash_bridge_reconciles', snapshot.trackedCash, Number(fixture.snapshotInput?.openingCash || 0) + Number(metrics.netCashFlow || 0)),
        numericCheck('snapshot_and_metric_cash_agree', snapshot.flows?.netCashFlow, metrics.netCashFlow),
        numericCheck('snapshot_and_metric_consumption_agree', snapshot.flows?.consumptionSpending, metrics.consumptionSpending),
        numericCheck('snapshot_and_metric_settlements_agree', snapshot.flows?.settlements, metrics.settlements),
        numericCheck('snapshot_and_metric_liability_delta_agree', snapshot.flows?.liabilityDelta, metrics.liabilityDelta),
        numericCheck(
            'debt_principal_bridge_reconciles',
            debt.total,
            Number(expectedPosition.debt?.openingPrincipal || 0)
                - Number(expectedPosition.debt?.principalSettled || 0)
        ),
        numericCheck(
            'card_balance_bridge_reconciles',
            card.total,
            Number(expectedPosition.card?.openingBalance || 0)
                + Number(expectedPosition.card?.charges || 0)
                - Number(expectedPosition.card?.payments || 0)
        ),
        numericCheck(
            'installment_contractual_balance_is_principal_plus_remaining_finance_charges',
            installment.contractualTotal,
            Number(installment.principalTotal || 0) + Number(installment.remainingFinanceChargeTotal || 0)
        ),
        numericCheck(
            'principal_position_bridge_reconciles',
            endingPrincipalPositions == null || openingPrincipalPositions == null
                ? null
                : endingPrincipalPositions - openingPrincipalPositions,
            snapshot.flows?.liabilityDelta
        ),
        numericCheck(
            'legacy_debt_difference_equals_recorded_finance_charges',
            debtDifference?.difference,
            debt.financeChargesPaid
        ),
        booleanCheck(
            'legacy_debt_difference_reason_is_audited',
            debtDifference?.expectedDifferenceReason === 'legacy_full_payment_reduced_debt_principal'
        ),
        numericCheck('legacy_comparison_has_no_review_differences', comparison.reviewDifferences?.length, 0),
        booleanCheck('legacy_comparison_gate_remains_ready', comparison.readyForVisibleCutover === true)
    ];
    const failedCheckIds = checks.filter(check => !check.passed).map(check => check.id);

    return deepFreeze({
        version: VERSION,
        fixtureId: 'phase_2e_counted_once',
        status: failedCheckIds.length ? 'failed' : 'reconciled',
        checkCount: checks.length,
        passedCount: checks.length - failedCheckIds.length,
        failedCount: failedCheckIds.length,
        failedCheckIds,
        checks
    });
}

module.exports = {
    VERSION,
    DEFAULT_TOLERANCE,
    buildPhase2EReconciliationReport
};
