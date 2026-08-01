(function exposeFinanceReportsPresentation(root, factory) {
    const api = factory(root);

    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) {
        root.FINANCE_REPORTS_PRESENTATION_VERSION = api.VERSION;
        root.buildFinanceReportsPresentation = api.buildFinanceReportsPresentation;
        root.filterFinanceReportsTransactions = api.filterFinanceReportsTransactions;
        root.validateFinanceReportsPresentation = api.validate;
    }
})(typeof window !== 'undefined' ? window : globalThis, function buildFinanceReportsPresentationModule(root) {
    'use strict';

    const VERSION = '1.0.0';

    function deepFreeze(value) {
        if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
        Object.values(value).forEach(deepFreeze);
        return Object.freeze(value);
    }

    function validDate(value) {
        const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
        return Number.isFinite(date.getTime()) ? date : null;
    }

    function txDate(transaction) {
        if (Number.isFinite(Number(transaction?._ts))) return new Date(Number(transaction._ts));
        return validDate(transaction?.date);
    }

    function normalizeScope(value) {
        return ['selected_period', 'current_month', 'all_time'].includes(String(value))
            ? String(value)
            : 'selected_period';
    }

    function normalizeMonth(value) {
        const month = Number(value);
        return Number.isInteger(month) && month >= 1 && month <= 12 ? month : null;
    }

    function normalizeYear(value) {
        const year = Number(value);
        return Number.isInteger(year) && year >= 1900 && year <= 9999 ? year : null;
    }

    function endOfMonth(year, monthIndex) {
        return new Date(year, monthIndex + 1, 0, 23, 59, 59, 999);
    }

    function monthKey(date) {
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    }

    function monthLabel(year, month) {
        return new Date(year, month - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    }

    function shortDate(date) {
        return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    }

    function getDataRange(transactions, fallback) {
        const dates = (Array.isArray(transactions) ? transactions : []).map(txDate).filter(Boolean);
        if (!dates.length) return { start: fallback, end: fallback };
        return {
            start: new Date(Math.min(...dates.map(date => date.getTime()))),
            end: new Date(Math.max(...dates.map(date => date.getTime())))
        };
    }

    function filterFinanceReportsTransactions(transactions, selection = {}, options = {}) {
        const source = Array.isArray(transactions) ? transactions : [];
        const scope = normalizeScope(selection.scope);
        const now = validDate(options.now || selection.now) || new Date();
        const selectedMonth = normalizeMonth(selection.month);
        const selectedYear = normalizeYear(selection.year);

        return source.filter(transaction => {
            const date = txDate(transaction);
            if (!date) return false;
            if (scope === 'all_time') return true;
            if (scope === 'current_month') {
                return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
            }
            if (selectedYear && date.getFullYear() !== selectedYear) return false;
            if (selectedMonth && date.getMonth() + 1 !== selectedMonth) return false;
            return true;
        });
    }

    function buildScope(transactions, selection, now) {
        const scope = normalizeScope(selection.scope);
        const selectedMonth = normalizeMonth(selection.month);
        const selectedYear = normalizeYear(selection.year);
        const scopedTransactions = filterFinanceReportsTransactions(transactions, selection, { now });
        const allRange = getDataRange(transactions, now);
        let label;
        let start;
        let end;
        let singleMonthKey = null;

        if (scope === 'current_month') {
            start = new Date(now.getFullYear(), now.getMonth(), 1);
            end = endOfMonth(now.getFullYear(), now.getMonth());
            label = monthLabel(now.getFullYear(), now.getMonth() + 1);
            singleMonthKey = monthKey(now);
        } else if (scope === 'all_time') {
            ({ start, end } = allRange);
            label = transactions.length ? `${shortDate(start)} – ${shortDate(end)}` : 'All records';
        } else if (selectedMonth && selectedYear) {
            start = new Date(selectedYear, selectedMonth - 1, 1);
            end = endOfMonth(selectedYear, selectedMonth - 1);
            label = monthLabel(selectedYear, selectedMonth);
            singleMonthKey = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}`;
        } else if (selectedYear) {
            start = new Date(selectedYear, 0, 1);
            end = endOfMonth(selectedYear, 11);
            label = `Year ${selectedYear}`;
        } else if (selectedMonth) {
            const filteredRange = getDataRange(scopedTransactions, allRange.start);
            start = filteredRange.start;
            end = filteredRange.end;
            label = `${new Date(2000, selectedMonth - 1, 1).toLocaleDateString(undefined, { month: 'long' })} across all years`;
        } else {
            ({ start, end } = allRange);
            label = transactions.length ? `${shortDate(start)} – ${shortDate(end)}` : 'All selected records';
        }

        const isSingleMonth = !!singleMonthKey;
        return {
            id: scope,
            label,
            caption: `For ${label}`,
            selectedMonth,
            selectedYear,
            start: start.toISOString(),
            end: end.toISOString(),
            transactionCount: scopedTransactions.length,
            isSingleMonth,
            singleMonthKey,
            trendGranularity: isSingleMonth ? 'day' : 'month'
        };
    }

    function unavailablePosition(basis, reason) {
        return { available: false, basis, value: null, assets: null, liabilities: null, reason };
    }

    function buildPositions(snapshotReport, options = {}) {
        let wealth = options.wealthPresentation || null;
        if (!wealth && typeof root?.buildFinanceWealthPresentation === 'function') {
            wealth = root.buildFinanceWealthPresentation(snapshotReport, { cutover: options.cutover });
        }
        return {
            asOf: wealth?.asOf || snapshotReport?.current?.canonical?.asOf || null,
            market: wealth?.market || unavailablePosition('market', 'market_value_unavailable'),
            book: wealth?.book || unavailablePosition('book', 'book_value_unavailable')
        };
    }

    function buildCards(scope) {
        const periodScope = { grain: 'flow', caption: scope.caption, available: true };
        const monthlyOnly = scope.isSingleMonth
            ? { grain: 'month', caption: scope.caption, available: true, reason: 'ready' }
            : {
                grain: 'month', caption: 'Choose one month for monthly budget comparison',
                available: false, reason: 'single_month_required'
            };
        return {
            scorecard: { grain: 'mixed', caption: `${scope.caption} for flows • Current as-of values are labeled separately`, available: true },
            revenue: { ...periodScope },
            trends: { ...periodScope, granularity: scope.trendGranularity },
            spending: { ...periodScope, budgetComparison: monthlyOnly },
            variance: monthlyOnly
        };
    }

    function buildFinanceReportsPresentation(input = {}, options = {}) {
        const now = validDate(options.now || input.now) || new Date();
        const selection = {
            scope: input.scope,
            month: input.month,
            year: input.year
        };
        const scope = buildScope(input.transactions || [], selection, now);
        const positions = buildPositions(input.snapshotReport || null, options);

        return deepFreeze({
            version: VERSION,
            generatedAt: now.toISOString(),
            scope,
            positions,
            cards: buildCards(scope)
        });
    }

    function validate() {
        const fixture = buildFinanceReportsPresentation({
            scope: 'selected_period', month: '8', year: '2026',
            transactions: [
                { date: '2026-08-02T00:00:00.000Z' },
                { date: '2026-07-31T00:00:00.000Z' }
            ]
        }, {
            now: new Date(2026, 7, 10),
            wealthPresentation: {
                asOf: '2026-08-10T00:00:00.000Z',
                market: { available: true, basis: 'market', value: 120, assets: 150, liabilities: 30, reason: 'ready' },
                book: { available: true, basis: 'book', value: 100, assets: 130, liabilities: 30, reason: 'ready' }
            }
        });
        const errors = [];
        if (fixture.version !== VERSION) errors.push('Reports presentation version mismatch.');
        if (fixture.scope.singleMonthKey !== '2026-08') errors.push('Reports single-month scope failed.');
        if (fixture.scope.transactionCount !== 1) errors.push('Reports transaction scope failed.');
        if (fixture.positions.market.basis !== 'market' || fixture.positions.book.basis !== 'book') {
            errors.push('Reports valuation bases are not explicit.');
        }
        if (!fixture.cards.variance.available) errors.push('Reports monthly variance gate failed.');
        return Object.freeze({ valid: errors.length === 0, errors: Object.freeze(errors) });
    }

    return {
        VERSION,
        buildFinanceReportsPresentation,
        filterFinanceReportsTransactions,
        validate
    };
});
