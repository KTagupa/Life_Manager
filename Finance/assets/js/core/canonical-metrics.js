// =============================================
// PHASE 2C-A: CANONICAL METRICS (SHADOW ONLY)
// =============================================
// This module is side-effect free. It computes canonical metrics and
// diagnostics without changing any visible FinanceFlow value.

(function exposeCanonicalFinanceMetrics(root, factory) {
    const classifier = typeof module === 'object' && module.exports
        ? require('./transaction-classifier.js')
        : root;
    const dateQuality = typeof module === 'object' && module.exports
        ? require('./date-quality.js')
        : root;
    const api = factory(classifier, dateQuality);

    if (root) {
        root.FINANCE_CANONICAL_METRICS_VERSION = api.VERSION;
        root.buildFinanceClassificationContext = api.buildFinanceClassificationContext;
        root.computeCanonicalFinanceMetrics = api.computeCanonicalFinanceMetrics;
        root.compareFinanceMetricSnapshots = api.compareFinanceMetricSnapshots;
        root.validateCanonicalFinanceMetrics = api.validate;
    }

    if (typeof module === 'object' && module.exports) {
        module.exports = api;
    }
})(typeof window !== 'undefined' ? window : globalThis, function buildCanonicalFinanceMetrics(classifier, dateQuality) {
    const VERSION = '1.0.0';
    const classifyTransactions = classifier?.classifyFinanceTransactions;
    const isDateUsable = dateQuality?.isFinanceTransactionDateUsable;

    if (typeof classifyTransactions !== 'function') {
        throw new Error('Canonical transaction classifier is unavailable.');
    }
    if (typeof isDateUsable !== 'function') {
        throw new Error('Transaction date-quality inspection is unavailable.');
    }

    function deepFreeze(value) {
        if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
        Object.getOwnPropertyNames(value).forEach(key => deepFreeze(value[key]));
        return Object.freeze(value);
    }

    function normalizeString(value) {
        return String(value ?? '').trim();
    }

    function uniqueSorted(values) {
        return [...new Set((Array.isArray(values) ? values : [])
            .map(normalizeString)
            .filter(Boolean))].sort((a, b) => a.localeCompare(b));
    }

    function buildFinanceClassificationContext(input = {}) {
        const debts = Array.isArray(input.debts) ? input.debts : [];
        const debtIds = uniqueSorted([
            ...(Array.isArray(input.debtIds) ? input.debtIds : []),
            ...debts.map(debt => debt?.id)
        ]);
        const debtCategoryNames = uniqueSorted([
            ...(Array.isArray(input.debtCategoryNames) ? input.debtCategoryNames : []),
            ...debts.flatMap(debt => {
                const name = normalizeString(debt?.name);
                return name ? [name, `Debt to pay: ${name}`] : [];
            })
        ]);
        const assetCategoryNames = uniqueSorted(input.assetCategoryNames);
        const transferCategoryNames = uniqueSorted(input.transferCategoryNames);
        const fingerprint = JSON.stringify({
            debtIds,
            debtCategoryNames,
            assetCategoryNames,
            transferCategoryNames
        });

        return deepFreeze({
            debtIds,
            debtCategoryNames,
            assetCategoryNames,
            transferCategoryNames,
            fingerprint
        });
    }

    function createEmptyTotals() {
        return {
            cashDelta: 0,
            earnedIncomeDelta: 0,
            otherCashInDelta: 0,
            consumptionDelta: 0,
            financeChargeConsumptionDelta: 0,
            settlementDelta: 0,
            transferDelta: 0,
            assetAcquisitionDelta: 0,
            assetDisposalProceedsDelta: 0,
            liabilityDelta: 0,
            receivableDelta: 0
        };
    }

    function computeCanonicalFinanceMetrics(transactions, options = {}) {
        const sourceTransactions = Array.isArray(transactions) ? transactions : [];
        const usableTransactions = sourceTransactions.filter(isDateUsable);
        const excludedDateCount = sourceTransactions.length - usableTransactions.length
            + Math.max(0, Number(options.additionalQuarantinedCount || 0));
        const context = buildFinanceClassificationContext(options.context || {});
        const classifications = classifyTransactions(usableTransactions, context);
        const totals = createEmptyTotals();
        const spendingByCategory = {};
        const classCounts = {};
        const issueCounts = {};
        const issueSeverityCounts = { error: 0, warning: 0 };
        const reviewRecords = [];
        let validCount = 0;
        let invalidCount = 0;
        let classifiableCount = 0;
        let unclassifiedCount = 0;

        classifications.forEach((classification, index) => {
            Object.keys(totals).forEach(field => {
                totals[field] += Number(classification[field] || 0);
            });
            classCounts[classification.classId] = (classCounts[classification.classId] || 0) + 1;

            if (classification.valid) validCount += 1;
            else invalidCount += 1;
            if (classification.classifiable) classifiableCount += 1;
            else unclassifiedCount += 1;

            if (classification.consumptionDelta > 0) {
                // Preserve the user's category spelling and casing so canonical
                // spending continues to join against existing budget keys.
                const category = normalizeString(usableTransactions[index]?.category)
                    || normalizeString(classification.category)
                    || 'Uncategorized';
                spendingByCategory[category] = (spendingByCategory[category] || 0)
                    + classification.consumptionDelta;
            }

            classification.issues.forEach(issue => {
                issueCounts[issue.code] = (issueCounts[issue.code] || 0) + 1;
                if (issue.severity === 'error' || issue.severity === 'warning') {
                    issueSeverityCounts[issue.severity] += 1;
                }
            });

            if (!classification.valid || !classification.classifiable || classification.issues.length > 0) {
                reviewRecords.push({
                    transactionId: normalizeString(usableTransactions[index]?.id) || `index:${index}`,
                    classId: classification.classId,
                    valid: classification.valid,
                    classifiable: classification.classifiable,
                    confidence: classification.confidence,
                    issues: classification.issues.map(issue => ({ ...issue }))
                });
            }
        });

        const earnedIncome = totals.earnedIncomeDelta;
        const consumptionSpending = totals.consumptionDelta;
        const savingsRate = earnedIncome > 0
            ? ((earnedIncome - consumptionSpending) / earnedIncome) * 100
            : null;
        const coveragePct = usableTransactions.length > 0
            ? (classifiableCount / usableTransactions.length) * 100
            : 100;
        const diagnostics = {
            sourceTransactionCount: sourceTransactions.length,
            usableTransactionCount: usableTransactions.length,
            excludedDateCount,
            validCount,
            invalidCount,
            classifiableCount,
            unclassifiedCount,
            classificationCoveragePct: coveragePct,
            issueCounts,
            issueSeverityCounts,
            reviewRecordCount: reviewRecords.length,
            reviewRecommended: reviewRecords.length > 0,
            safeForVisibleCutover: invalidCount === 0 && unclassifiedCount === 0,
            reviewRecords
        };

        return deepFreeze({
            engineVersion: VERSION,
            classifierVersion: classifier.VERSION || null,
            contextFingerprint: context.fingerprint,
            transactionCount: usableTransactions.length,
            netCashFlow: totals.cashDelta,
            earnedIncome,
            otherCashIn: totals.otherCashInDelta,
            consumptionSpending,
            financeChargeSpending: totals.financeChargeConsumptionDelta,
            settlements: totals.settlementDelta,
            transferDelta: totals.transferDelta,
            assetAcquisitions: totals.assetAcquisitionDelta,
            assetDisposalProceeds: totals.assetDisposalProceedsDelta,
            liabilityDelta: totals.liabilityDelta,
            receivableDelta: totals.receivableDelta,
            savingsRate,
            spendingByCategory,
            classCounts,
            totals,
            diagnostics,
            classifications
        });
    }

    function numbersMatch(left, right, tolerance) {
        return Number.isFinite(left)
            && Number.isFinite(right)
            && Math.abs(left - right) <= tolerance;
    }

    function compareFinanceMetricSnapshots(canonical, legacy, options = {}) {
        const tolerance = Math.max(0, Number(options.tolerance ?? 0.005));
        const definitions = [
            { canonicalKey: 'netCashFlow', legacyKey: 'balance', invariant: true },
            { canonicalKey: 'earnedIncome', legacyKey: 'income', expectedSemanticDifference: true },
            { canonicalKey: 'otherCashIn', legacyKey: 'nonIncomeCashIn', expectedSemanticDifference: true },
            { canonicalKey: 'consumptionSpending', legacyKey: 'expense', expectedSemanticDifference: true },
            { canonicalKey: 'savingsRate', legacyKey: 'savingsRate', expectedSemanticDifference: true }
        ];
        const comparisons = definitions.map(definition => {
            const canonicalValue = canonical?.[definition.canonicalKey] ?? null;
            const legacyValue = legacy?.[definition.legacyKey] ?? null;
            const comparable = Number.isFinite(canonicalValue) && Number.isFinite(legacyValue);
            const difference = comparable ? canonicalValue - legacyValue : null;
            const matches = comparable ? numbersMatch(canonicalValue, legacyValue, tolerance) : canonicalValue === legacyValue;
            return {
                ...definition,
                invariant: definition.invariant === true,
                expectedSemanticDifference: definition.expectedSemanticDifference === true,
                canonicalValue,
                legacyValue,
                difference,
                matches
            };
        });
        const invariantFailures = comparisons.filter(item => item.invariant && !item.matches);
        const expectedDifferences = comparisons.filter(item => item.expectedSemanticDifference && !item.matches);
        const diagnosticsSafe = canonical?.diagnostics?.safeForVisibleCutover === true;

        return deepFreeze({
            tolerance,
            status: invariantFailures.length > 0
                ? 'invariant_failure'
                : (expectedDifferences.length > 0 ? 'expected_differences' : 'aligned'),
            readyForVisibleCutover: diagnosticsSafe && invariantFailures.length === 0,
            comparisons,
            invariantFailures,
            expectedDifferences
        });
    }

    function validate() {
        const sample = computeCanonicalFinanceMetrics([
            { id: 'income', type: 'income', category: 'Salary', amt: 1000, date: '2026-07-31' },
            { id: 'card-charge', type: 'expense', category: 'Food', amt: 200, date: '2026-07-31', paymentSource: 'credit_card', creditCardId: 'card-1' },
            { id: 'card-payment', type: 'credit_card_payment', category: 'Card', amt: 200, date: '2026-07-31', creditCardId: 'card-1' }
        ]);
        const errors = [];
        if (sample.netCashFlow !== 800) errors.push('Net cash-flow invariant failed.');
        if (sample.consumptionSpending !== 200) errors.push('Consumption recognition invariant failed.');
        if (sample.settlements !== 200) errors.push('Settlement recognition invariant failed.');
        if (!sample.diagnostics.safeForVisibleCutover) errors.push('Valid sample should be safe for cutover.');

        return deepFreeze({ valid: errors.length === 0, errors, version: VERSION });
    }

    return deepFreeze({
        VERSION,
        buildFinanceClassificationContext,
        computeCanonicalFinanceMetrics,
        compareFinanceMetricSnapshots,
        validate
    });
});
