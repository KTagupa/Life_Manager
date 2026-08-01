// =============================================
// PHASE 2D-D2: CANONICAL STATEMENT PROJECTION
// =============================================
// Pure P&L and cash-flow projection from canonical transaction classes.
// This module does not render, persist, or mutate FinanceFlow records.

(function exposeCanonicalFinanceStatements(root, factory) {
    const canonicalMetrics = typeof module === 'object' && module.exports
        ? require('./canonical-metrics.js')
        : root;
    const dateQuality = typeof module === 'object' && module.exports
        ? require('./date-quality.js')
        : root;
    const classifier = typeof module === 'object' && module.exports
        ? require('./transaction-classifier.js')
        : root;
    const api = factory(canonicalMetrics, dateQuality, classifier);

    if (root) {
        root.FINANCE_CANONICAL_STATEMENTS_VERSION = api.VERSION;
        root.FINANCE_STATEMENT_PROJECTION_SCHEMA_VERSION = api.PROVENANCE_SCHEMA_VERSION;
        root.computeCanonicalFinanceStatementProjection = api.computeCanonicalFinanceStatementProjection;
        root.createFinanceStatementProvenance = api.createFinanceStatementProvenance;
        root.validateCanonicalFinanceStatements = api.validate;
    }

    if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis, function buildCanonicalFinanceStatements(canonicalMetrics, dateQuality, classifier) {
    const VERSION = '1.0.0';
    const PROVENANCE_SCHEMA_VERSION = 1;
    const computeCanonicalMetrics = canonicalMetrics?.computeCanonicalFinanceMetrics;
    const isDateUsable = dateQuality?.isFinanceTransactionDateUsable;
    const CLASSES = classifier?.FINANCE_TRANSACTION_CLASSES || {};
    const DEFAULT_COGS_KEYWORDS = Object.freeze([
        'transport',
        'commute',
        'tools',
        'work',
        'equipment',
        'office',
        'uniform',
        'professional',
        'license',
        'certification',
        'internet'
    ]);

    if (typeof computeCanonicalMetrics !== 'function') {
        throw new Error('Canonical metric engine is unavailable.');
    }
    if (typeof isDateUsable !== 'function') {
        throw new Error('Transaction date-quality inspection is unavailable.');
    }

    function deepFreeze(value) {
        if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
        Object.getOwnPropertyNames(value).forEach(key => deepFreeze(value[key]));
        return Object.freeze(value);
    }

    function text(value) {
        return String(value ?? '').trim();
    }

    function token(value) {
        return text(value).toLowerCase().replace(/\s+/g, ' ');
    }

    function finite(value) {
        const number = Number(value);
        return Number.isFinite(number) ? number : 0;
    }

    function positive(value) {
        return Math.max(0, finite(value));
    }

    function normalizeKeywords(values) {
        const source = Array.isArray(values) && values.length ? values : DEFAULT_COGS_KEYWORDS;
        return Object.freeze([...new Set(source.map(token).filter(Boolean))]);
    }

    function createFinanceStatementProvenance(engine, options = {}) {
        const normalizedEngine = engine === 'canonical' ? 'canonical' : 'legacy';
        const nullableText = value => text(value) || null;
        return deepFreeze({
            schemaVersion: PROVENANCE_SCHEMA_VERSION,
            source: normalizedEngine === 'canonical'
                ? 'canonical_statement_projection'
                : 'legacy_statement_projection',
            engine: normalizedEngine,
            semanticMode: normalizedEngine === 'canonical' ? 'canonical' : 'legacy_fallback',
            projectionVersion: normalizedEngine === 'canonical'
                ? (nullableText(options.projectionVersion) || VERSION)
                : nullableText(options.projectionVersion),
            metricEngineVersion: nullableText(options.metricEngineVersion),
            classifierVersion: nullableText(options.classifierVersion),
            cutoverReason: normalizedEngine === 'canonical'
                ? null
                : (nullableText(options.cutoverReason) || 'canonical_statement_projection_unavailable')
        });
    }

    function isOperatingRecovery(transaction) {
        const category = token(transaction?.category);
        return category.includes('refund')
            || category.includes('reimburse')
            || category.includes('cashback');
    }

    function isCogsCategory(transaction, keywords) {
        const category = token(transaction?.category);
        return !!category && keywords.some(keyword => category.includes(keyword));
    }

    function computeCanonicalFinanceStatementProjection(transactions, options = {}) {
        const sourceTransactions = Array.isArray(transactions) ? transactions : [];
        const usableTransactions = sourceTransactions.filter(isDateUsable);
        const context = options.context || {};
        const metrics = computeCanonicalMetrics(sourceTransactions, {
            context,
            additionalQuarantinedCount: options.additionalQuarantinedCount
        });
        const classifications = metrics.classifications || [];
        const cogsKeywords = normalizeKeywords(options.cogsKeywords);
        const classificationAligned = classifications.length === usableTransactions.length;

        let income = 0;
        let costOfEarning = 0;
        let operatingExpenses = 0;
        let financeCosts = 0;
        let debtService = 0;
        let growthSpend = 0;

        let operatingCashFlow = 0;
        let investingCashFlow = 0;
        let financingCashFlow = 0;
        let transferCashFlow = 0;
        let cashRecoveryIn = 0;
        let assetSaleIn = 0;
        let ownTransferIn = 0;
        let ownTransferOut = 0;
        let otherNonIncomeCashIn = 0;
        let debtCashIn = 0;
        let creditCardBorrowing = 0;
        let creditCardPayments = 0;
        let debtPayments = 0;
        let installmentPayments = 0;
        let savingsContribution = 0;
        let assetAcquisitions = 0;
        let unassignedCashFlow = 0;

        classifications.forEach((classification, index) => {
            const transaction = usableTransactions[index] || {};
            const classId = classification?.classId;
            const cashDelta = finite(classification?.cashDelta);
            const consumption = positive(classification?.consumptionDelta);
            const financeCharge = Math.min(
                consumption,
                positive(classification?.financeChargeConsumptionDelta)
            );
            const purchaseConsumption = Math.max(0, consumption - financeCharge);
            const settlement = positive(classification?.settlementDelta);

            income += positive(classification?.earnedIncomeDelta);
            financeCosts += financeCharge;
            if (purchaseConsumption > 0) {
                if (isCogsCategory(transaction, cogsKeywords)) costOfEarning += purchaseConsumption;
                else operatingExpenses += purchaseConsumption;
            }

            if (classId === CLASSES.DEBT_SETTLEMENT
                || classId === CLASSES.CREDIT_CARD_SETTLEMENT
                || classId === CLASSES.INSTALLMENT_SETTLEMENT) {
                debtService += settlement + financeCharge;
            }
            if (classId === CLASSES.SAVINGS_TRANSFER) {
                const contribution = Math.max(0, -finite(classification?.transferDelta));
                savingsContribution += contribution;
                growthSpend += contribution;
            }
            if (classId === CLASSES.ASSET_ACQUISITION) {
                const acquisition = positive(classification?.assetAcquisitionDelta);
                assetAcquisitions += acquisition;
                growthSpend += acquisition;
            }

            switch (classId) {
                case CLASSES.EARNED_INCOME:
                case CLASSES.CASH_CONSUMPTION_PURCHASE:
                case CLASSES.CREDIT_CARD_CONSUMPTION_CHARGE:
                    operatingCashFlow += cashDelta;
                    if (classId === CLASSES.CREDIT_CARD_CONSUMPTION_CHARGE) {
                        creditCardBorrowing += Math.max(0, finite(classification?.liabilityDelta));
                    }
                    break;
                case CLASSES.OTHER_CASH_IN:
                    if (isOperatingRecovery(transaction)) {
                        operatingCashFlow += cashDelta;
                        cashRecoveryIn += Math.max(0, cashDelta);
                    } else {
                        financingCashFlow += cashDelta;
                        otherNonIncomeCashIn += Math.max(0, cashDelta);
                    }
                    break;
                case CLASSES.LENDING_ADVANCE:
                    investingCashFlow += cashDelta;
                    break;
                case CLASSES.LENDING_REPAYMENT:
                    investingCashFlow += cashDelta;
                    cashRecoveryIn += Math.max(0, cashDelta);
                    break;
                case CLASSES.SAVINGS_TRANSFER:
                case CLASSES.ASSET_ACQUISITION:
                    investingCashFlow += cashDelta;
                    break;
                case CLASSES.ASSET_DISPOSAL:
                    investingCashFlow += cashDelta;
                    assetSaleIn += Math.max(0, cashDelta);
                    break;
                case CLASSES.DEBT_CASH_RECEIVED:
                    financingCashFlow += cashDelta;
                    debtCashIn += Math.max(0, cashDelta);
                    break;
                case CLASSES.CREDIT_CARD_SETTLEMENT:
                    financingCashFlow += cashDelta;
                    creditCardPayments += Math.max(0, -cashDelta);
                    break;
                case CLASSES.DEBT_SETTLEMENT:
                    financingCashFlow += cashDelta;
                    debtPayments += Math.max(0, -cashDelta);
                    break;
                case CLASSES.INSTALLMENT_SETTLEMENT:
                    financingCashFlow += cashDelta;
                    installmentPayments += Math.max(0, -cashDelta);
                    break;
                case CLASSES.GENERIC_SETTLEMENT:
                    financingCashFlow += cashDelta;
                    break;
                case CLASSES.OWN_ACCOUNT_TRANSFER:
                    transferCashFlow += cashDelta;
                    if (cashDelta >= 0) ownTransferIn += cashDelta;
                    else ownTransferOut += Math.abs(cashDelta);
                    break;
                case CLASSES.DEBT_TRACKING_ONLY:
                    break;
                default:
                    unassignedCashFlow += cashDelta;
                    break;
            }
        });

        const grossProfit = income - costOfEarning;
        const ebitda = grossProfit - operatingExpenses;
        const netIncome = ebitda - financeCosts;
        const grossMargin = income > 0 ? (grossProfit / income) * 100 : 0;
        const ebitdaMargin = income > 0 ? (ebitda / income) * 100 : 0;
        const netMargin = income > 0 ? (netIncome / income) * 100 : 0;
        const freeCashFlow = operatingCashFlow + investingCashFlow;
        const bucketedNetCashFlow = operatingCashFlow
            + investingCashFlow
            + financingCashFlow
            + transferCashFlow
            + unassignedCashFlow;
        const canonicalNetCashFlow = finite(metrics.netCashFlow);
        const cashFlowDifference = bucketedNetCashFlow - canonicalNetCashFlow;
        const cashFlowReconciles = Math.abs(cashFlowDifference) <= 0.005;
        const safeForVisibleCutover = metrics.diagnostics?.safeForVisibleCutover === true
            && Number(metrics.diagnostics?.excludedDateCount || 0) === 0
            && classificationAligned
            && cashFlowReconciles
            && Math.abs(unassignedCashFlow) <= 0.005;
        const provenance = createFinanceStatementProvenance('canonical', {
            projectionVersion: VERSION,
            metricEngineVersion: metrics.engineVersion,
            classifierVersion: metrics.classifierVersion
        });

        return deepFreeze({
            projectionVersion: VERSION,
            provenance,
            pnl: {
                income,
                costOfEarning,
                grossProfit,
                grossMargin,
                operatingExpenses,
                ebitda,
                ebitdaMargin,
                financeCosts,
                debtService,
                growthSpend,
                netIncome,
                netMargin,
                basis: 'operating_before_depreciation_and_tax'
            },
            cashflow: {
                operatingCashFlow,
                investingCashFlow,
                financingCashFlow,
                transferCashFlow,
                cashRecoveryIn,
                assetSaleIn,
                ownTransferIn,
                ownTransferOut,
                otherNonIncomeCashIn,
                nonIncomeCashIn: positive(metrics.otherCashIn),
                debtCashIn,
                creditCardBorrowing,
                creditCardPayments,
                debtPayments,
                installmentPayments,
                savingsContribution,
                assetAcquisitions,
                freeCashFlow,
                netCashFlow: canonicalNetCashFlow,
                bucketedNetCashFlow,
                unassignedCashFlow
            },
            diagnostics: {
                sourceTransactionCount: sourceTransactions.length,
                usableTransactionCount: usableTransactions.length,
                excludedTransactionCount: sourceTransactions.length - usableTransactions.length,
                classificationAligned,
                canonicalDiagnostics: metrics.diagnostics,
                cashFlowReconciles,
                cashFlowDifference,
                unassignedCashFlow,
                safeForVisibleCutover
            },
            canonicalMetrics: metrics,
            cogsKeywords
        });
    }

    function validate() {
        const errors = [];
        const fixture = computeCanonicalFinanceStatementProjection([
            { id: 'income', type: 'income', category: 'Salary', amt: 1000, date: '2026-07-01' },
            { id: 'office', type: 'expense', category: 'Office', amt: 100, date: '2026-07-02' },
            { id: 'card', type: 'expense', category: 'Food', amt: 200, paymentSource: 'credit_card', creditCardId: 'card-1', date: '2026-07-03' },
            { id: 'card-pay', type: 'credit_card_payment', category: 'Card Payments', amt: 150, creditCardId: 'card-1', date: '2026-07-04' }
        ]);
        if (fixture.pnl.income !== 1000) errors.push('Earned income projection failed.');
        if (fixture.pnl.costOfEarning !== 100) errors.push('COGS projection failed.');
        if (fixture.pnl.operatingExpenses !== 200) errors.push('Operating expense projection failed.');
        if (fixture.cashflow.netCashFlow !== 750) errors.push('Cash-flow projection failed.');
        if (!fixture.diagnostics.safeForVisibleCutover) errors.push('Valid fixture was not cutover-ready.');
        return deepFreeze({ valid: errors.length === 0, errors, version: VERSION });
    }

    return deepFreeze({
        VERSION,
        PROVENANCE_SCHEMA_VERSION,
        DEFAULT_COGS_KEYWORDS,
        createFinanceStatementProvenance,
        computeCanonicalFinanceStatementProjection,
        validate
    });
});
