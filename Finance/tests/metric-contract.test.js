const test = require('node:test');
const assert = require('node:assert/strict');

const contract = require('../assets/js/core/metric-contract.js');

test('metric contract is structurally valid', () => {
    const result = contract.validate();
    assert.equal(result.valid, true, result.errors.join('\n'));
    assert.equal(result.version, contract.meta.version);
    assert.ok(result.metricCount >= 10);
    assert.ok(result.findingCount >= 5);
});

test('Overview metrics distinguish flows from snapshots', () => {
    assert.equal(contract.metrics.cash_on_hand.grain, 'snapshot');
    assert.equal(contract.metrics.cash_on_hand.scopeBehavior, 'as_of_date');
    assert.equal(contract.metrics.net_cash_flow.grain, 'flow');
    assert.equal(contract.metrics.net_cash_flow.scopeBehavior, 'selected_period');
    assert.equal(contract.metrics.estimated_net_worth.grain, 'snapshot');
});

test('settlements are not classified as new consumption', () => {
    assert.match(contract.transactionClasses.credit_card_payment.spendingDelta, /^none/);
    assert.match(contract.transactionClasses.installment_payment.spendingDelta, /fees and interest only/);
    assert.match(contract.metrics.consumption_spending.exclusions.join(' '), /credit-card principal payments/);
});

test('resolved metric and snapshot cutovers stay visible', () => {
    const findingIds = new Set(contract.auditFindings.map(finding => finding.id));
    assert.ok(findingIds.has('FIN-DQ-001'));
    assert.ok(findingIds.has('FIN-DQ-002'));
    assert.ok(findingIds.has('FIN-DQ-003'));
    assert.ok(findingIds.has('FIN-DQ-008'));
    assert.ok(findingIds.has('FIN-DQ-009'));
    assert.equal(contract.auditFindings.find(finding => finding.id === 'FIN-DQ-001').status, 'resolved_in_phase_2c_b');
    assert.equal(contract.auditFindings.find(finding => finding.id === 'FIN-DQ-002').status, 'resolved_in_phase_2c_b');
    assert.equal(contract.metrics.consumption_spending.implementationState, 'aligned');
    assert.equal(contract.metrics.savings_rate.implementationState, 'aligned');
    assert.equal(contract.metrics.spending_to_income.implementationState, 'aligned');
    assert.equal(contract.metrics.estimated_net_worth.implementationState, 'aligned');
    assert.equal(contract.auditFindings.find(finding => finding.id === 'FIN-DQ-003').status, 'resolved_in_phase_2d_b2');
    assert.equal(
        contract.auditFindings.find(finding => finding.id === 'FIN-DQ-008').status,
        'resolved_in_phase_2d_b2'
    );
    assert.equal(
        contract.auditFindings.find(finding => finding.id === 'FIN-DQ-009').status,
        'resolved_in_phase_2e_b'
    );
});

test('Phase 2B date remediation and Phase 2C-A shadow implementations are recorded', () => {
    const dateFinding = contract.auditFindings.find(finding => finding.id === 'FIN-DQ-004');
    assert.equal(dateFinding.status, 'resolved_in_phase_2b');
    assert.doesNotMatch(dateFinding.evidence.join(' '), /Date\.now/);
    assert.deepEqual(contract.metrics.net_cash_flow.shadowImplementation, [
        'computeCanonicalFinanceMetrics.netCashFlow'
    ]);
    assert.deepEqual(contract.metrics.consumption_spending.shadowImplementation, [
        'computeCanonicalFinanceMetrics.consumptionSpending'
    ]);
});

test('contract is deeply immutable', () => {
    assert.equal(Object.isFrozen(contract), true);
    assert.equal(Object.isFrozen(contract.metrics), true);
    assert.equal(Object.isFrozen(contract.metrics.net_cash_flow), true);
});

test('Phase 2D-A records canonical cash and net-worth shadow implementations', () => {
    assert.deepEqual(contract.metrics.cash_on_hand.shadowImplementation, [
        'computeCanonicalFinanceSnapshot.trackedCash'
    ]);
    assert.deepEqual(contract.metrics.estimated_net_worth.shadowImplementation, [
        'computeCanonicalFinanceSnapshot.estimatedNetWorthMarketValue',
        'computeCanonicalFinanceSnapshot.estimatedNetWorthBookValue'
    ]);
});

test('Phase 2D-C aligns liquidity and keeps obligation coverage deferred', () => {
    assert.equal(contract.metrics.liquidity_runway.implementationState, 'aligned');
    assert.deepEqual(contract.metrics.liquidity_runway.currentImplementation, [
        'computeCanonicalFinanceLiquidity.liquidityRunwayMonths',
        'computeCanonicalFinanceLiquidity.liquidityRunwayDays'
    ]);
    assert.equal(contract.metrics.emergency_fund_months.implementationState, 'usable_with_guardrails');
    assert.match(contract.metrics.emergency_fund_months.guardrails.join(' '), /conservative spending proxy/);
    assert.equal(contract.metrics.liquidity_coverage.implementationState, 'not_implemented');
    assert.deepEqual(contract.metrics.liquidity_coverage.currentImplementation, []);
    assert.equal(
        contract.auditFindings.find(finding => finding.id === 'FIN-DQ-006').status,
        'resolved_in_phase_2d_c'
    );
    assert.equal(
        contract.auditFindings.find(finding => finding.id === 'FIN-DQ-007').status,
        'deferred_until_due_date_data'
    );
});

test('Phase 3A records the final four-card Overview presentation boundary', () => {
    assert.deepEqual(contract.metrics.cash_on_hand.presentationImplementation, [
        'buildFinanceCashOnHandView',
        'buildFinanceOverviewModel.cards.cash_on_hand'
    ]);
    assert.deepEqual(contract.metrics.net_cash_flow.presentationImplementation, [
        'buildFinanceOverviewModel.cards.net_cash_flow'
    ]);
    assert.deepEqual(contract.metrics.spending_to_income.presentationImplementation, [
        'buildFinanceOverviewModel.cards.spending_to_income'
    ]);
    assert.deepEqual(contract.metrics.estimated_net_worth.presentationImplementation, [
        'buildFinanceOverviewModel.cards.estimated_net_worth'
    ]);
});

test('Phase 3B records the visible Overview and secondary Other Cash In placement', () => {
    ['cash_on_hand', 'net_cash_flow', 'spending_to_income', 'estimated_net_worth'].forEach(metricId => {
        assert.equal(contract.metrics[metricId].presentationState, 'visible_phase_3b');
    });
    assert.equal(contract.metrics.other_cash_in.presentationState, 'secondary_phase_3b');
    assert.deepEqual(contract.metrics.other_cash_in.presentationImplementation, [
        'Activity type filter',
        'Net Cash Flow breakdown'
    ]);
});
