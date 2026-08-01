// =============================================
// PHASE 2D-C: CANONICAL LIQUIDITY METRICS
// =============================================
// Pure three-complete-month burn and cash-only coverage calculations.

(function exposeCanonicalFinanceLiquidity(root, factory) {
    const canonicalMetrics = typeof module === 'object' && module.exports
        ? require('./canonical-metrics.js')
        : root;
    const dateQuality = typeof module === 'object' && module.exports
        ? require('./date-quality.js')
        : root;
    const api = factory(canonicalMetrics, dateQuality);

    if (root) {
        root.FINANCE_CANONICAL_LIQUIDITY_VERSION = api.VERSION;
        root.getFinanceCompleteMonthWindow = api.getFinanceCompleteMonthWindow;
        root.computeCanonicalFinanceLiquidity = api.computeCanonicalFinanceLiquidity;
        root.validateCanonicalFinanceLiquidity = api.validate;
    }

    if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis, function buildCanonicalFinanceLiquidity(canonicalMetrics, dateQuality) {
    const VERSION = '1.0.0';
    const COMPLETE_MONTH_COUNT = 3;
    const computeCanonicalMetrics = canonicalMetrics?.computeCanonicalFinanceMetrics;
    const getDateQuality = dateQuality?.getFinanceTransactionDateQuality;

    if (typeof computeCanonicalMetrics !== 'function') {
        throw new Error('Canonical metric engine is unavailable.');
    }
    if (typeof getDateQuality !== 'function') {
        throw new Error('Transaction date-quality inspection is unavailable.');
    }

    function deepFreeze(value) {
        if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
        Object.getOwnPropertyNames(value).forEach(key => deepFreeze(value[key]));
        return Object.freeze(value);
    }

    function pad(value) {
        return String(value).padStart(2, '0');
    }

    function dateKeyFromParts(year, monthIndex, day) {
        return `${year}-${pad(monthIndex + 1)}-${pad(day)}`;
    }

    function normalizeReferenceDate(value) {
        if (typeof value === 'string') {
            const dateKeyMatch = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
            if (dateKeyMatch) {
                const year = Number(dateKeyMatch[1]);
                const monthIndex = Number(dateKeyMatch[2]) - 1;
                const day = Number(dateKeyMatch[3]);
                const calendarDate = new Date(year, monthIndex, day, 12, 0, 0, 0);
                if (calendarDate.getFullYear() === year
                    && calendarDate.getMonth() === monthIndex
                    && calendarDate.getDate() === day) return calendarDate;
            }
        }
        const date = value instanceof Date ? new Date(value.getTime()) : new Date(value ?? Date.now());
        if (!Number.isFinite(date.getTime())) throw new TypeError('A valid liquidity as-of date is required.');
        return date;
    }

    function getFinanceCompleteMonthWindow(asOf = new Date()) {
        const reference = normalizeReferenceDate(asOf);
        const endMonthExclusive = new Date(reference.getFullYear(), reference.getMonth(), 1, 12, 0, 0, 0);
        const start = new Date(
            endMonthExclusive.getFullYear(),
            endMonthExclusive.getMonth() - COMPLETE_MONTH_COUNT,
            1,
            12,
            0,
            0,
            0
        );
        const end = new Date(
            endMonthExclusive.getFullYear(),
            endMonthExclusive.getMonth(),
            0,
            12,
            0,
            0,
            0
        );
        const monthKeys = [];
        for (let offset = 0; offset < COMPLETE_MONTH_COUNT; offset += 1) {
            const month = new Date(start.getFullYear(), start.getMonth() + offset, 1, 12, 0, 0, 0);
            monthKeys.push(`${month.getFullYear()}-${pad(month.getMonth() + 1)}`);
        }
        const startKey = dateKeyFromParts(start.getFullYear(), start.getMonth(), 1);
        const endKey = dateKeyFromParts(end.getFullYear(), end.getMonth(), end.getDate());
        const startLabel = start.toLocaleDateString('en', { month: 'short', year: 'numeric' });
        const endLabel = end.toLocaleDateString('en', { month: 'short', year: 'numeric' });

        return deepFreeze({
            asOfDateKey: dateKeyFromParts(reference.getFullYear(), reference.getMonth(), reference.getDate()),
            startDateKey: startKey,
            endDateKey: endKey,
            monthCount: COMPLETE_MONTH_COUNT,
            monthKeys,
            label: `${startLabel}–${endLabel}`
        });
    }

    function computeCanonicalFinanceLiquidity(input = {}, options = {}) {
        const sourceTransactions = Array.isArray(input.transactions) ? input.transactions : [];
        const window = getFinanceCompleteMonthWindow(options.asOf ?? input.asOf ?? new Date());
        const windowTransactions = [];
        const additionalQuarantinedCount = Number(
            input.additionalQuarantinedCount ?? options.additionalQuarantinedCount ?? 0
        );
        let quarantinedDateCount = Number.isFinite(additionalQuarantinedCount)
            ? Math.max(0, additionalQuarantinedCount)
            : 0;
        let warningDateCount = 0;

        sourceTransactions.forEach(transaction => {
            const quality = getDateQuality(transaction);
            if (!quality.usable || !quality.dateKey) {
                quarantinedDateCount += 1;
                return;
            }
            if (quality.status === 'warning') warningDateCount += 1;
            if (quality.dateKey >= window.startDateKey && quality.dateKey <= window.endDateKey) {
                windowTransactions.push(transaction);
            }
        });

        const metrics = computeCanonicalMetrics(windowTransactions, {
            context: options.context || input.context || {},
            additionalQuarantinedCount: quarantinedDateCount
        });
        const trackedCashRaw = Number(input.trackedCash);
        const trackedCashAvailable = Number.isFinite(trackedCashRaw);
        const trackedCash = trackedCashAvailable ? trackedCashRaw : null;
        const eligibleCash = trackedCashAvailable ? Math.max(0, trackedCashRaw) : null;
        const totalConsumptionSpending = Number(metrics.consumptionSpending || 0);
        const averageMonthlyConsumption = totalConsumptionSpending / window.monthCount;
        const hasBurnRate = averageMonthlyConsumption > 0;
        const liquidityRunwayMonths = trackedCashAvailable && hasBurnRate
            ? eligibleCash / averageMonthlyConsumption
            : null;
        const liquidityRunwayDays = liquidityRunwayMonths == null
            ? null
            : Math.floor(liquidityRunwayMonths * 30);
        const diagnostics = {
            sourceTransactionCount: sourceTransactions.length,
            windowTransactionCount: windowTransactions.length,
            quarantinedDateCount,
            warningDateCount,
            invalidClassificationCount: Number(metrics.diagnostics?.invalidCount || 0),
            unclassifiedCount: Number(metrics.diagnostics?.unclassifiedCount || 0),
            trackedCashAvailable,
            negativeTrackedCash: trackedCashAvailable && trackedCashRaw < 0,
            essentialSpendingClassificationAvailable: false,
            safeForVisibleCutover: trackedCashAvailable
                && quarantinedDateCount === 0
                && metrics.diagnostics?.safeForVisibleCutover === true
        };

        return deepFreeze({
            engineVersion: VERSION,
            asOfDateKey: window.asOfDateKey,
            window,
            trackedCash,
            eligibleCash,
            totalConsumptionSpending,
            averageMonthlyConsumption,
            liquidityRunwayMonths,
            liquidityRunwayDays,
            emergencyFundCoverageMonths: liquidityRunwayMonths,
            emergencyFundIsSpendingProxy: true,
            status: !trackedCashAvailable
                ? 'cash_unavailable'
                : (!diagnostics.safeForVisibleCutover
                    ? 'data_review'
                    : (hasBurnRate ? 'available' : 'no_consumption_history')),
            metrics,
            diagnostics
        });
    }

    function validate() {
        const sample = computeCanonicalFinanceLiquidity({
            trackedCash: 600,
            transactions: [
                { id: 'apr', type: 'expense', category: 'Food', amt: 100, date: '2026-04-15' },
                { id: 'may', type: 'expense', category: 'Food', amt: 200, date: '2026-05-15' }
            ]
        }, { asOf: '2026-07-15' });
        const errors = [];
        if (sample.window.startDateKey !== '2026-04-01') errors.push('Complete-month start failed.');
        if (sample.window.endDateKey !== '2026-06-30') errors.push('Complete-month end failed.');
        if (sample.averageMonthlyConsumption !== 100) errors.push('Average monthly consumption failed.');
        if (sample.liquidityRunwayMonths !== 6) errors.push('Cash-only runway failed.');
        if (!sample.diagnostics.safeForVisibleCutover) errors.push('Valid sample should be cutover-ready.');
        return deepFreeze({ valid: errors.length === 0, errors, version: VERSION });
    }

    return deepFreeze({
        VERSION,
        COMPLETE_MONTH_COUNT,
        getFinanceCompleteMonthWindow,
        computeCanonicalFinanceLiquidity,
        validate
    });
});
