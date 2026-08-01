// =============================================
// PHASE 0: FINANCE METRIC CONTRACT
// =============================================
// This file defines the vocabulary and accounting intent for the Finance UI.
// It is deliberately side-effect free: Phase 0 does not change stored data or
// replace legacy calculations. Later phases can migrate one metric at a time.

(function exposeFinanceMetricContract(root, factory) {
    const contract = factory();

    if (root) {
        root.FINANCE_METRIC_CONTRACT = contract;
        root.getFinanceMetricContract = function getFinanceMetricContract(metricId) {
            return contract.metrics[String(metricId || '').trim()] || null;
        };
        root.validateFinanceMetricContract = contract.validate;
    }

    if (typeof module === 'object' && module.exports) {
        module.exports = contract;
    }
})(typeof window !== 'undefined' ? window : globalThis, function buildFinanceMetricContract() {
    const VALID_GRAINS = ['flow', 'snapshot', 'operational'];
    const VALID_SCOPE_BEHAVIORS = ['selected_period', 'as_of_date', 'selected_month'];
    const VALID_IMPLEMENTATION_STATES = ['aligned', 'usable_with_guardrails', 'partial', 'not_implemented'];

    function deepFreeze(value) {
        if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
        Object.getOwnPropertyNames(value).forEach(key => deepFreeze(value[key]));
        return Object.freeze(value);
    }

    const scopeRules = {
        selected_period: {
            label: 'For period',
            appliesTo: 'Flows accumulated between an inclusive start and end date.',
            control: 'The global period selector may change this metric.',
            emptyState: 'Show 0 for additive amounts and n/a for ratios with a zero denominator.'
        },
        as_of_date: {
            label: 'As of',
            appliesTo: 'A financial position at the end of a specific date.',
            control: 'Do not silently change with a period selector; show the as-of date explicitly.',
            emptyState: 'Show 0 only when the source is known to be complete; otherwise show unavailable.'
        },
        selected_month: {
            label: 'For month',
            appliesTo: 'An operational status or closed snapshot associated with one calendar month.',
            control: 'The selected reporting month changes this metric.',
            emptyState: 'Show the status as unavailable rather than inferring a pass.'
        }
    };

    const transactionClasses = {
        earned_income: {
            cashDelta: 'increase',
            incomeDelta: 'increase',
            spendingDelta: 'none',
            positionDelta: 'cash increases',
            currentSignals: ['type=income', 'category does not start with "Lent: "', 'not debt cash received']
        },
        other_cash_in: {
            cashDelta: 'increase',
            incomeDelta: 'none',
            spendingDelta: 'none',
            positionDelta: 'cash increases; another asset or liability may also change',
            currentSignals: ['type=non_income_cash_in', 'type=crypto_sell_proceeds', 'lent repayment', 'debt cash received']
        },
        cash_purchase: {
            cashDelta: 'decrease',
            incomeDelta: 'none',
            spendingDelta: 'increase when the purchase is consumption',
            positionDelta: 'cash decreases',
            currentSignals: ['type=expense', 'paymentSource=cash']
        },
        credit_card_charge: {
            cashDelta: 'none',
            incomeDelta: 'none',
            spendingDelta: 'increase when the charge is consumption',
            positionDelta: 'credit-card liability increases',
            currentSignals: ['type=expense', 'paymentSource=credit_card', 'creditCardId is present']
        },
        credit_card_payment: {
            cashDelta: 'decrease',
            incomeDelta: 'none',
            spendingDelta: 'none; the purchase was recognized at charge time',
            positionDelta: 'cash and credit-card liability decrease',
            currentSignals: ['type=credit_card_payment']
        },
        installment_payment: {
            cashDelta: 'decrease',
            incomeDelta: 'none',
            spendingDelta: 'fees and interest only; principal is not new consumption',
            positionDelta: 'cash and installment liability decrease',
            currentSignals: ['type=installment_payment']
        },
        debt_cash_received: {
            cashDelta: 'increase',
            incomeDelta: 'none',
            spendingDelta: 'none',
            positionDelta: 'cash and debt liability increase',
            currentSignals: ['type=debt_increase', 'debtBorrowTracked=true']
        },
        debt_tracking_only: {
            cashDelta: 'none',
            incomeDelta: 'none',
            spendingDelta: 'none',
            positionDelta: 'debt liability increases',
            currentSignals: ['type=debt_increase', 'debtBorrowTracked is not true']
        },
        lending_advance: {
            cashDelta: 'decrease',
            incomeDelta: 'none',
            spendingDelta: 'none',
            positionDelta: 'cash decreases and receivables increase',
            currentSignals: ['type=expense', 'category starts with "Lent: "']
        },
        lending_repayment: {
            cashDelta: 'increase',
            incomeDelta: 'none',
            spendingDelta: 'none',
            positionDelta: 'cash increases and receivables decrease',
            currentSignals: ['category starts with "Lent: "', 'cash-in transaction']
        },
        savings_or_investment_transfer: {
            cashDelta: 'depends on whether the destination asset is tracked',
            incomeDelta: 'none',
            spendingDelta: 'none',
            positionDelta: 'one asset decreases while another asset increases',
            currentSignals: ['category=Savings', 'crypto buy mirror', 'linked investment contribution']
        }
    };

    const metrics = {
        cash_on_hand: {
            displayName: 'Cash on Hand',
            grain: 'snapshot',
            scopeBehavior: 'as_of_date',
            unit: 'currency',
            definition: 'Tracked cash available at the end of the as-of date.',
            formula: 'opening cash + sum(cash delta for every transaction dated on or before the as-of date)',
            dataSources: ['transactions', 'opening cash balance when supported'],
            exclusions: ['credit-card charges before payment', 'receivables', 'crypto holdings', 'fixed assets'],
            currentImplementation: ['computeCurrentBalance', 'computeCashBalanceAsOf'],
            shadowImplementation: ['computeCanonicalFinanceSnapshot.trackedCash'],
            presentationImplementation: ['buildFinanceCashOnHandView', 'buildFinanceOverviewModel.cards.cash_on_hand'],
            presentationState: 'visible_phase_3b',
            implementationState: 'usable_with_guardrails',
            guardrails: [
                'The current app assumes an opening cash balance of zero.',
                'This is tracked cash, not a reconciled bank balance.',
                'All stored amounts are normalized to PHP before display-currency conversion.'
            ],
            overviewPriority: 1
        },
        net_cash_flow: {
            displayName: 'Net Cash Flow',
            grain: 'flow',
            scopeBehavior: 'selected_period',
            unit: 'currency',
            definition: 'The net change in tracked cash during the selected period.',
            formula: 'sum(all cash increases) - sum(all cash decreases)',
            dataSources: ['transactions'],
            exclusions: ['credit-card charges until paid', 'liability-only debt tracking entries'],
            currentImplementation: ['computeSummaryMetrics via metric-adapter', 'computeCanonicalFinanceMetrics.netCashFlow'],
            shadowImplementation: ['computeCanonicalFinanceMetrics.netCashFlow'],
            presentationImplementation: ['buildFinanceOverviewModel.cards.net_cash_flow'],
            presentationState: 'visible_phase_3b',
            implementationState: 'aligned',
            guardrails: [
                'The visible UI uses Net Cash Flow; legacy fallback is explicitly labeled when reconciliation is not ready.',
                'All-time Net Cash Flow equals tracked Cash on Hand only while opening cash is zero.'
            ],
            overviewPriority: 2
        },
        earned_income: {
            displayName: 'Earned Income',
            grain: 'flow',
            scopeBehavior: 'selected_period',
            unit: 'currency',
            definition: 'Cash earned from work, business, or other income-producing activity during the period.',
            formula: 'sum(earned-income transaction amounts)',
            dataSources: ['transactions'],
            exclusions: ['borrowed money', 'lent repayments', 'refunds', 'reimbursements', 'asset sales', 'own-account transfers', 'crypto sale proceeds'],
            currentImplementation: ['computeSummaryMetrics via metric-adapter', 'computeCanonicalFinanceMetrics.earnedIncome'],
            shadowImplementation: ['computeCanonicalFinanceMetrics.earnedIncome'],
            implementationState: 'aligned',
            guardrails: ['Classification currently depends partly on transaction type and category text.'],
            overviewPriority: 0
        },
        other_cash_in: {
            displayName: 'Other Cash In',
            grain: 'flow',
            scopeBehavior: 'selected_period',
            unit: 'currency',
            definition: 'Cash received during the period that is not earned income.',
            formula: 'sum(non-income cash-in amounts)',
            dataSources: ['transactions'],
            exclusions: ['earned income'],
            currentImplementation: ['computeSummaryMetrics via metric-adapter', 'computeCanonicalFinanceMetrics.otherCashIn'],
            shadowImplementation: ['computeCanonicalFinanceMetrics.otherCashIn'],
            presentationImplementation: ['Activity type filter', 'Net Cash Flow breakdown'],
            presentationState: 'secondary_phase_3b',
            implementationState: 'aligned',
            guardrails: ['Show in the Net Cash Flow breakdown and Activity filters, not as a primary Overview KPI.'],
            overviewPriority: 0
        },
        consumption_spending: {
            displayName: 'Spending',
            grain: 'flow',
            scopeBehavior: 'selected_period',
            unit: 'currency',
            definition: 'Purchases and costs consumed during the period, recognized once when the purchase occurs.',
            formula: 'cash consumption purchases + credit-card consumption charges + installment fees/interest',
            dataSources: ['transactions', 'installment payment fee detail'],
            exclusions: ['credit-card principal payments', 'installment principal payments', 'debt principal repayments', 'lending advances', 'savings transfers', 'crypto buys', 'fixed-asset acquisitions'],
            currentImplementation: ['computeSummaryMetrics via metric-adapter', 'computeCanonicalFinanceMetrics.consumptionSpending'],
            shadowImplementation: ['computeCanonicalFinanceMetrics.consumptionSpending'],
            implementationState: 'aligned',
            guardrails: [
                'Visible cutover is gated per vault; unresolved or unreconciled data stays on an explicitly labeled legacy fallback.',
                'Classification warnings remain available through the shadow report.'
            ],
            overviewPriority: 0
        },
        savings_rate: {
            displayName: 'Savings Rate',
            grain: 'flow',
            scopeBehavior: 'selected_period',
            unit: 'percent',
            definition: 'The share of earned income not consumed during the selected period.',
            formula: 'earned income > 0 ? ((earned income - consumption spending) / earned income) * 100 : n/a',
            dataSources: ['earned_income', 'consumption_spending'],
            exclusions: ['other cash in from loans, repayments, refunds, transfers, or asset sales'],
            currentImplementation: ['computeSummaryMetrics via metric-adapter', 'computeCanonicalFinanceMetrics.savingsRate'],
            shadowImplementation: ['computeCanonicalFinanceMetrics.savingsRate'],
            implementationState: 'aligned',
            guardrails: [
                'Returns n/a, not 0%, when earned income is zero.',
                'Visible cutover requires canonical classification and cash reconciliation readiness.'
            ],
            overviewPriority: 0
        },
        estimated_net_worth: {
            displayName: 'Estimated Net Worth',
            grain: 'snapshot',
            scopeBehavior: 'as_of_date',
            unit: 'currency',
            definition: 'Estimated assets minus liabilities at the as-of date.',
            formula: 'cash + receivables + crypto market value + fixed-asset net book value - debt - credit cards - installments',
            dataSources: ['transactions', 'money lent', 'crypto holdings and prices', 'fixed assets', 'debts', 'credit cards', 'installment plans'],
            exclusions: ['untracked accounts', 'unrecorded liabilities', 'personal property without a fixed-asset record'],
            currentImplementation: [
                'snapshot-adapter Estimated Net Worth (Market)',
                'snapshot-adapter Net Worth (Book) statement position'
            ],
            shadowImplementation: [
                'computeCanonicalFinanceSnapshot.estimatedNetWorthMarketValue',
                'computeCanonicalFinanceSnapshot.estimatedNetWorthBookValue'
            ],
            presentationImplementation: ['buildFinanceOverviewModel.cards.estimated_net_worth'],
            presentationState: 'visible_phase_3b',
            implementationState: 'aligned',
            guardrails: [
                'Phase 2D-A calculates and reconciles separate market-value and book-value variants in shadow mode.',
                'Phase 2D-B1 preserves historical liability records and stores versioned canonical book-position fields beside legacy statement aliases.',
                'Phase 2D-B2 gates the market KPI and book statement independently and includes fixed-asset net book value.',
                'Missing market prices display n/a and never substitute book or cost value.',
                'The UI labels market-value, book-value, and legacy fallback variants explicitly.'
            ],
            overviewPriority: 4
        },
        spending_to_income: {
            displayName: 'Spending to Income',
            grain: 'flow',
            scopeBehavior: 'selected_period',
            unit: 'percent',
            definition: 'Consumption spending as a share of earned income for the period.',
            formula: 'earned income > 0 ? (consumption spending / earned income) * 100 : n/a',
            dataSources: ['earned_income', 'consumption_spending'],
            exclusions: ['non-income cash in'],
            currentImplementation: ['refreshBusinessKPIPanel expenseRatio via metric-adapter'],
            shadowImplementation: ['computeCanonicalFinanceMetrics.consumptionSpending / earnedIncome'],
            presentationImplementation: ['buildFinanceOverviewModel.cards.spending_to_income'],
            presentationState: 'visible_phase_3b',
            implementationState: 'aligned',
            guardrails: ['Visible cutover is gated per vault and displays n/a when earned income is zero.'],
            overviewPriority: 3
        },
        debt_service_ratio: {
            displayName: 'Debt Repayment Load',
            grain: 'flow',
            scopeBehavior: 'selected_period',
            unit: 'percent',
            definition: 'Required debt repayments made during the period as a share of earned income.',
            formula: 'earned income > 0 ? (loan + card + installment required repayments) / earned income * 100 : n/a',
            dataSources: ['transactions', 'debts', 'credit cards', 'installment plans'],
            exclusions: ['new purchases charged to a card', 'voluntary investment contributions'],
            currentImplementation: [
                'metric-adapter buildFinanceConsumerBreakdown',
                'refreshBusinessKPIPanel debtServiceRatio'
            ],
            implementationState: 'usable_with_guardrails',
            guardrails: [
                'Phase 2D-D1 includes recorded loan, card, and installment settlements plus explicitly recorded interest and fees.',
                'This remains an actual-payment proxy: full card payments may overstate required debt service, while missing minimum or scheduled amounts may understate it.'
            ],
            overviewPriority: 0
        },
        investment_rate: {
            displayName: 'Investment Rate',
            grain: 'flow',
            scopeBehavior: 'selected_period',
            unit: 'percent',
            definition: 'Contributions to tracked savings and investment assets as a share of earned income.',
            formula: 'earned income > 0 ? (savings contributions + investment contributions) / earned income * 100 : n/a',
            dataSources: ['transactions', 'crypto transactions'],
            exclusions: ['asset price appreciation', 'transfers between already-counted investment accounts'],
            currentImplementation: ['refreshBusinessKPIPanel investmentRate'],
            implementationState: 'usable_with_guardrails',
            guardrails: ['Fixed-asset purchases are excluded; this is a financial-investment contribution rate.'],
            overviewPriority: 0
        },
        emergency_fund_months: {
            displayName: 'Emergency Fund Coverage',
            grain: 'snapshot',
            scopeBehavior: 'as_of_date',
            unit: 'months',
            definition: 'Months of essential consumption that eligible emergency reserves can cover.',
            formula: 'eligible emergency reserves / average monthly essential consumption over the last 3 complete months',
            dataSources: ['cash accounts or tracked cash', 'transactions with essential-spend classification'],
            exclusions: ['receivables', 'volatile investments', 'restricted savings', 'debt principal', 'asset purchases'],
            currentImplementation: ['computeCanonicalFinanceLiquidity.emergencyFundCoverageMonths'],
            implementationState: 'usable_with_guardrails',
            guardrails: [
                'The app has no essential-spend flag yet.',
                'Phase 2D-C uses all canonical consumption as a conservative spending proxy.',
                'The denominator covers exactly the previous three complete calendar months.'
            ],
            overviewPriority: 0
        },
        liquidity_runway: {
            displayName: 'Liquidity Runway',
            grain: 'snapshot',
            scopeBehavior: 'as_of_date',
            unit: 'months',
            definition: 'Months that cash and cash equivalents can support the current consumption rate.',
            formula: 'cash and cash equivalents / average monthly consumption spending over the last 3 complete months',
            dataSources: ['cash accounts or tracked cash', 'consumption_spending'],
            exclusions: ['money lent', 'crypto holdings unless explicitly marked as cash equivalent', 'fixed assets'],
            currentImplementation: [
                'computeCanonicalFinanceLiquidity.liquidityRunwayMonths',
                'computeCanonicalFinanceLiquidity.liquidityRunwayDays'
            ],
            implementationState: 'aligned',
            guardrails: [
                'Phase 2D-C uses tracked cash only; receivables, crypto, and fixed assets are excluded.',
                'The burn denominator covers exactly the previous three complete calendar months.'
            ],
            overviewPriority: 0
        },
        liquidity_coverage: {
            displayName: '30-Day Obligation Coverage',
            grain: 'snapshot',
            scopeBehavior: 'as_of_date',
            unit: 'ratio',
            definition: 'Cash and cash equivalents divided by obligations due within the next 30 days.',
            formula: 'cash and cash equivalents / payments due within 30 days',
            dataSources: ['cash accounts or tracked cash', 'bills', 'debts', 'credit cards', 'installment schedules'],
            exclusions: ['long-term liabilities not due in the next 30 days', 'uncollected receivables'],
            currentImplementation: [],
            implementationState: 'not_implemented',
            guardrails: [
                'Deferred in Phase 2D-C until bills and liabilities provide sufficient due-within-30-days data.',
                'The separately labeled Current Ratio proxy must not be presented as 30-Day Obligation Coverage.'
            ],
            overviewPriority: 0
        },
        close_readiness: {
            displayName: 'Close Readiness',
            grain: 'operational',
            scopeBehavior: 'selected_month',
            unit: 'status',
            definition: 'Whether the selected month passes the configured close checklist and has a saved close record.',
            formula: 'closed status plus passed checks / total configured checks',
            dataSources: ['monthly close records', 'monthly close checklist', 'KPI targets'],
            exclusions: [],
            currentImplementation: ['refreshBusinessKPIPanel close readiness', 'computeMonthlyCloseSnapshot'],
            implementationState: 'aligned',
            guardrails: ['This is an operational control, not a financial-performance KPI.'],
            overviewPriority: 0
        }
    };

    const auditFindings = [
        {
            id: 'FIN-DQ-001',
            severity: 'resolved',
            status: 'resolved_in_phase_2c_b',
            title: 'Total Balance is a flow with a snapshot label',
            evidence: ['metric-adapter maps canonical netCashFlow into the compatibility summary', 'Overview and reports label the value Net Cash Flow'],
            impact: 'Users can interpret a selected month\'s cash movement as money currently available.',
            resolution: 'Rename the scoped metric to Net Cash Flow; show Cash on Hand separately as an as-of snapshot.'
        },
        {
            id: 'FIN-DQ-002',
            severity: 'resolved',
            status: 'resolved_in_phase_2c_b',
            title: 'Legacy expense totals can double count card activity',
            evidence: ['canonical consumptionDelta recognizes purchases once', 'settlement principal is excluded from visible Spending'],
            impact: 'Spending, savings rate, expense-to-income, and budget comparisons can be overstated.',
            resolution: 'Separate consumption recognition from cash settlement and debt principal.'
        },
        {
            id: 'FIN-DQ-003',
            severity: 'high',
            status: 'resolved_in_phase_2d_b2',
            title: 'Net worth variants are inconsistent and incomplete',
            evidence: [
                'KPI uses crypto market value',
                'statements use crypto book value',
                'fixed-asset net book value is omitted from both visible variants',
                'Phase 2D-B2 visibly separates market and book variants, includes fixed assets, and gates them independently'
            ],
            impact: 'Two screens can report different net worth values for the same date.',
            resolution: 'Resolved in Phase 2D-B2 with an explicit market KPI, book-value statements, and n/a when market prices are unavailable.'
        },
        {
            id: 'FIN-DQ-004',
            severity: 'resolved',
            status: 'resolved_in_phase_2b',
            title: 'Invalid transaction dates are quarantined instead of becoming today',
            evidence: ['date-quality partition excludes missing and impossible dates', 'Activity exposes encrypted date repair'],
            impact: 'Malformed historical records remain saved but cannot enter metrics or Activity until repaired.',
            resolution: 'Resolved in Phase 2B with strict date inspection, quarantine, and explicit repair.'
        },
        {
            id: 'FIN-DQ-005',
            severity: 'medium',
            title: 'Average-spend denominators are not calendar-consistent',
            evidence: ['current month divides by all days in the month', 'selected period divides by the span between first and last matching transaction'],
            impact: 'Daily averages change based on transaction sparsity and may understate month-to-date spending.',
            resolution: 'Use elapsed calendar days for an open period and full calendar days for a completed period.'
        },
        {
            id: 'FIN-DQ-006',
            severity: 'resolved',
            status: 'resolved_in_phase_2d_c',
            title: 'Emergency-fund burn rate uses a variable-length window',
            evidence: ['canonical liquidity window contains exactly the previous three complete calendar months', 'KPI and Insights consume the same shared calculation'],
            impact: 'Resolved: the denominator no longer includes a partial fourth month.',
            resolution: 'Resolved in Phase 2D-C with a shared, tested three-complete-month window.'
        },
        {
            id: 'FIN-DQ-007',
            severity: 'medium',
            status: 'deferred_until_due_date_data',
            title: 'Current Ratio is a personal-finance proxy, not a true current ratio',
            evidence: ['numerator includes receivables', 'denominator includes all tracked liabilities regardless of due date'],
            impact: 'The label implies accounting precision the available maturity data does not support.',
            resolution: 'Deferred in Phase 2D-C. Keep Current Ratio explicitly labeled as a proxy until due-within-30-days data is sufficient.'
        },
        {
            id: 'FIN-DQ-008',
            severity: 'medium',
            status: 'resolved_in_phase_2d_b2',
            title: 'Legacy card liabilities depend on transaction array order',
            evidence: [
                'computeCreditCardOutstandingMapAsOf clamps after each payment without chronological sorting',
                'canonical card liabilities are aggregation-order independent',
                'the shadow treats the difference as expected only when legacy output exactly matches the audited order-sensitive calculation'
            ],
            impact: 'Estimated Net Worth and statement liabilities can be overstated even when every linked card transaction is present.',
            resolution: 'Resolved in Phase 2D-B2 by using the order-independent canonical calculation on gated visible snapshot surfaces.'
        },
        {
            id: 'FIN-DQ-009',
            severity: 'resolved',
            status: 'resolved_in_phase_2e_b',
            title: 'Legacy debt positions reduce principal by interest and fees',
            evidence: [
                'canonical debt positions consume classifier settlementDelta instead of the full payment amount',
                'recorded interest and fees remain finance-charge consumption',
                'the snapshot comparison audits the exact legacy full-payment result as an expected difference',
                'Phase 2E-C rejects unexplained consumption and debt differences through a shared end-to-end reconciliation report'
            ],
            impact: 'Debt principal and liabilities can be understated by cumulative recorded interest and fees.',
            resolution: 'Resolved in Phase 2E-B with principal-aware debt snapshots and shared cross-engine fixture reconciliation.'
        }
    ];

    function validate() {
        const errors = [];
        const metricIds = Object.keys(metrics);

        metricIds.forEach(metricId => {
            const metric = metrics[metricId];
            if (!metric.displayName) errors.push(`${metricId}: displayName is required`);
            if (!VALID_GRAINS.includes(metric.grain)) errors.push(`${metricId}: invalid grain`);
            if (!VALID_SCOPE_BEHAVIORS.includes(metric.scopeBehavior)) errors.push(`${metricId}: invalid scopeBehavior`);
            if (!VALID_IMPLEMENTATION_STATES.includes(metric.implementationState)) errors.push(`${metricId}: invalid implementationState`);
            if (!metric.definition) errors.push(`${metricId}: definition is required`);
            if (!metric.formula) errors.push(`${metricId}: formula is required`);
            if (!Array.isArray(metric.dataSources) || !metric.dataSources.length) errors.push(`${metricId}: dataSources are required`);
            if (!Array.isArray(metric.guardrails)) errors.push(`${metricId}: guardrails must be an array`);
        });

        auditFindings.forEach(finding => {
            if (!finding.id || !finding.severity || !finding.title || !finding.resolution) {
                errors.push('Every audit finding requires id, severity, title, and resolution');
            }
        });

        return {
            valid: errors.length === 0,
            errors,
            metricCount: metricIds.length,
            findingCount: auditFindings.length,
            version: '1.0.0'
        };
    }

    return deepFreeze({
        meta: {
            id: 'financeflow-metric-contract',
            version: '1.0.0',
            phase: 0,
            baseCurrency: 'PHP',
            timezonePolicy: 'Use the user\'s local calendar date for UI reporting boundaries.',
            effectiveDate: '2026-07-31',
            behaviorChange: false
        },
        scopeRules,
        transactionClasses,
        metrics,
        auditFindings,
        validate
    });
});
