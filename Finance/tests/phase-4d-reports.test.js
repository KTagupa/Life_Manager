'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const reports = require('../assets/js/ui/reports-presentation.js');
const { VIEW_CONTENT } = require('../assets/js/ui/navigation.js');

const financeRoot = path.join(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(financeRoot, relativePath), 'utf8');
const NOW = new Date(2026, 7, 10, 12, 0, 0);

function tx(id, date) {
    return { id, date, type: 'expense', category: 'Food', amt: 100 };
}

function wealthPresentation() {
    return {
        asOf: '2026-08-10T04:00:00.000Z',
        market: { available: true, basis: 'market', value: 1800, assets: 2100, liabilities: 300, reason: 'ready' },
        book: { available: true, basis: 'book', value: 1600, assets: 1900, liabilities: 300, reason: 'ready' }
    };
}

test('Phase 4D Reports presentation validates, freezes, and preserves input records', () => {
    assert.deepEqual(reports.validate(), { valid: true, errors: [] });
    const input = tx('aug', '2026-08-02T00:00:00.000Z');
    const result = reports.buildFinanceReportsPresentation({
        scope: 'selected_period', month: '8', year: '2026', transactions: [input]
    }, { now: NOW, wealthPresentation: wealthPresentation() });

    assert.equal(result.version, '1.0.0');
    assert.equal(result.scope.singleMonthKey, '2026-08');
    assert.equal(result.scope.caption, 'For August 2026');
    assert.equal(result.scope.transactionCount, 1);
    assert.equal(Object.isFrozen(result), true);
    assert.equal(Object.isFrozen(result.scope), true);
    assert.equal(Object.isFrozen(input), false);
});

test('selected report scope filters only by date selection and cannot inherit Activity search', () => {
    const transactions = [
        tx('aug-food', '2026-08-02T00:00:00.000Z'),
        tx('aug-rent', '2026-08-20T00:00:00.000Z'),
        tx('jul', '2026-07-31T00:00:00.000Z')
    ];
    const scoped = reports.filterFinanceReportsTransactions(transactions, {
        scope: 'selected_period', month: '8', year: '2026', search: 'food'
    }, { now: NOW });

    assert.deepEqual(scoped.map(item => item.id), ['aug-food', 'aug-rent']);
});

test('current and all-time report scopes resolve independently from selected month controls', () => {
    const transactions = [
        tx('aug', '2026-08-02T00:00:00.000Z'),
        tx('jul', '2026-07-31T00:00:00.000Z')
    ];
    const current = reports.buildFinanceReportsPresentation({
        scope: 'current_month', month: '7', year: '2025', transactions
    }, { now: NOW, wealthPresentation: wealthPresentation() });
    const allTime = reports.buildFinanceReportsPresentation({
        scope: 'all_time', month: '8', year: '2026', transactions
    }, { now: NOW, wealthPresentation: wealthPresentation() });

    assert.equal(current.scope.transactionCount, 1);
    assert.equal(current.scope.singleMonthKey, '2026-08');
    assert.equal(current.scope.trendGranularity, 'day');
    assert.equal(allTime.scope.transactionCount, 2);
    assert.equal(allTime.scope.isSingleMonth, false);
    assert.equal(allTime.scope.trendGranularity, 'month');
});

test('monthly budget comparisons fail closed outside a single-month scope', () => {
    const year = reports.buildFinanceReportsPresentation({
        scope: 'selected_period', month: 'all', year: '2026',
        transactions: [tx('aug', '2026-08-02T00:00:00.000Z')]
    }, { now: NOW, wealthPresentation: wealthPresentation() });
    const month = reports.buildFinanceReportsPresentation({
        scope: 'selected_period', month: '8', year: '2026',
        transactions: [tx('aug', '2026-08-02T00:00:00.000Z')]
    }, { now: NOW, wealthPresentation: wealthPresentation() });

    assert.equal(year.cards.variance.available, false);
    assert.equal(year.cards.variance.reason, 'single_month_required');
    assert.equal(year.cards.spending.budgetComparison.available, false);
    assert.equal(month.cards.variance.available, true);
    assert.equal(month.cards.spending.budgetComparison.available, true);
});

test('Reports position comparison keeps market and book values explicit', () => {
    const result = reports.buildFinanceReportsPresentation({
        scope: 'current_month', transactions: []
    }, { now: NOW, wealthPresentation: wealthPresentation() });

    assert.equal(result.positions.market.basis, 'market');
    assert.equal(result.positions.market.value, 1800);
    assert.equal(result.positions.book.basis, 'book');
    assert.equal(result.positions.book.value, 1600);
    assert.notEqual(result.positions.market.value, result.positions.book.value);
});

test('Reports route starts with one shared coordinator', () => {
    assert.deepEqual(VIEW_CONTENT.reports.map(item => item.selector), [
        '#finance-reports-coordinator',
        '#business-kpi-panel',
        '#finance-card-revenue',
        '#finance-card-trends',
        '#finance-card-spend',
        '#finance-card-variance'
    ]);
    assert.equal(VIEW_CONTENT.reports[0].span, 'full');
});

test('Reports markup exposes shared scope, card captions, and valuation bases', () => {
    const html = read('index.html');
    const appInit = read('assets/js/core/app-init.js');
    const modelIndex = html.indexOf('assets/js/ui/reports-presentation.js');
    const rendererIndex = html.indexOf('assets/js/features/reports.js');
    const appInitIndex = html.indexOf('assets/js/core/app-init.js');

    assert.match(html, /id="finance-reports-coordinator"/);
    assert.match(html, /aria-label="Reports flow metric scope"/);
    assert.match(html, /id="reports-filter-month"[^>]*data-filter-month/);
    assert.match(html, /id="reports-filter-year"[^>]*data-filter-year/);
    assert.match(html, /id="finance-reports-market-value"/);
    assert.match(html, /Market-value snapshot/);
    assert.match(html, /id="finance-reports-book-value"/);
    assert.match(html, /Current book-value estimate/);
    assert.match(html, /id="reports-revenue-scope"/);
    assert.match(html, /id="reports-trends-scope"/);
    assert.match(html, /id="reports-spend-scope"/);
    assert.match(html, /id="reports-variance-scope"/);
    assert.ok(modelIndex > 0 && rendererIndex > modelIndex && appInitIndex > rendererIndex);
    assert.match(appInit, /validateFinanceReportsPresentation/);
    assert.match(appInit, /initFinanceReportsCoordination/);
});

test('Reports consumers use the shared scope and guard monthly-only comparisons', () => {
    const metrics = read('assets/js/core/metrics.js');
    const charts = read('assets/js/ui/charts.js');
    const renderers = read('assets/js/ui/renderers.js');
    const variance = read('assets/js/features/variance.js');
    const revenue = read('assets/js/features/revenue.js');
    const kpi = read('assets/js/features/kpi.js');

    assert.match(metrics, /selectedMonth[\s\S]*selectedYear[\s\S]*return allTx\.filter/);
    assert.match(charts, /getFinanceReportsScopedTransactions/);
    assert.match(charts, /trendGranularity/);
    assert.match(renderers, /budgetComparison\.available !== true/);
    assert.match(variance, /varianceScope\.available !== true/);
    assert.match(variance, /getFinanceReportsScopedTransactions/);
    assert.match(revenue, /getFinanceReportsScopedTransactions/);
    assert.match(kpi, /getFinanceReportsScopedTransactions/);
    assert.match(kpi, /!reportsPresentation\.scope\.isSingleMonth/);
});

test('Reports PDF export prints explicit period, market, and book labels', () => {
    const source = read('assets/js/features/reports.js');

    assert.match(source, /Estimated Net Worth — Market-value snapshot/);
    assert.match(source, /Estimated Net Worth — Current book-value estimate/);
    assert.match(source, /Book-value estimate is a current position view, not a saved month-end statement/);
    assert.match(source, /useReportsScope: true/);
});

test('Phase 4D styles preserve focus and collapse cleanly for phones', () => {
    const css = read('assets/css/app.css');

    assert.match(css, /\.finance-reports-coordinator :is\(button, select\):focus-visible/);
    assert.match(css, /outline: 3px solid #7c3aed/);
    assert.match(css, /@media \(max-width: 760px\)[\s\S]*\.finance-reports-scope-controls[\s\S]*repeat\(2/);
    assert.match(css, /@media \(max-width: 440px\)[\s\S]*\.finance-reports-position-grid[\s\S]*grid-template-columns: 1fr/);
});
