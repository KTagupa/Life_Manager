'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { VIEW_CONTENT } = require('../assets/js/ui/navigation.js');

const financeRoot = path.join(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(financeRoot, relativePath), 'utf8');

test('Phase 3B exposes exactly the four final Overview cards', () => {
    const html = read('index.html');
    const cardIds = [...html.matchAll(/data-overview-card="([^"]+)"/g)].map(match => match[1]);

    assert.deepEqual(cardIds, [
        'cash_on_hand',
        'net_cash_flow',
        'spending_to_income',
        'estimated_net_worth'
    ]);
    assert.match(html, /id="overview-cash-caption">As of/);
    assert.match(html, /id="balance-trend">For selected period/);
    assert.match(html, /id="overview-net-worth-label">Estimated Net Worth/);
    assert.match(html, /id="finance-overview-attention"/);
    assert.doesNotMatch(html, /id="income-display"/);
    assert.doesNotMatch(html, /id="non-income-cash-in-display"/);
    assert.doesNotMatch(html, /id="expense-display"/);
    assert.doesNotMatch(html, /id="savings-rate-display"/);
});

test('Overview, Activity, and Reports own the final Phase 3B surfaces', () => {
    const selectors = viewId => VIEW_CONTENT[viewId].map(item => item.selector);

    assert.deepEqual(selectors('overview'), [
        '.finance-summary-grid',
        '#finance-overview-attention',
        '#finance-card-insights'
    ]);
    assert.ok(selectors('activity').includes('#crypto-duplicate-review-panel'));
    assert.ok(selectors('reports').includes('#business-kpi-panel'));
    assert.ok(!selectors('overview').includes('#business-kpi-panel'));
});

test('Other Cash In remains in the cash-flow breakdown and gains an Activity filter', () => {
    const html = read('index.html');
    const charts = read('assets/js/ui/charts.js');

    assert.match(html, /id="balance-calc-other-cash-in-label">Other Cash In</);
    assert.match(html, /id="activity-filter-type"/);
    assert.match(html, /value="other_cash_in">Other Cash In</);
    assert.match(charts, /matchesActivityTypeFilter/);
    assert.match(charts, /getDisplayTxOtherCashInDelta\(transaction\) > 0/);

    const periodAssignment = charts.indexOf('window.filteredTransactions = sortedForDisplay');
    const activityRender = charts.indexOf('renderTransactions(activityTransactions)');
    assert.ok(periodAssignment > 0 && activityRender > periodAssignment,
        'Activity type filtering must not narrow period metrics');
    assert.doesNotMatch(charts, /window\.filteredTransactions\s*=\s*activityTransactions/);
});

test('the final Overview renderer consumes the Phase 3A model and gated snapshot views', () => {
    const overview = read('assets/js/features/overview.js');
    const html = read('index.html');
    const appInit = read('assets/js/core/app-init.js');

    assert.match(overview, /buildFinanceOverviewModel/);
    assert.match(overview, /getFinanceCashOnHandView/);
    assert.match(overview, /getFinanceMarketNetWorthView/);
    assert.match(overview, /finance:metric-shadow-updated/);
    assert.match(overview, /finance:snapshot-shadow-updated/);
    assert.match(overview, /data-finance-overview-action/);
    assert.match(appInit, /validateFinanceOverviewModel/);
    assert.match(appInit, /initFinanceOverview/);

    const modelIndex = html.indexOf('assets/js/core/overview-model.js');
    const rendererIndex = html.indexOf('assets/js/features/overview.js');
    const appInitIndex = html.indexOf('assets/js/core/app-init.js');
    assert.ok(rendererIndex > modelIndex);
    assert.ok(appInitIndex > rendererIndex);
});

test('Insights render concise actionable summaries instead of the old mini-scorecard', () => {
    const insights = read('assets/js/features/insights.js');

    assert.match(insights, /finance-insight-summary/);
    assert.match(insights, /data-finance-overview-action/);
    assert.match(insights, /financeOverviewModel/);
    assert.match(insights, /visibleSummaries = summaries\.slice\(0, 3\)/);
    assert.doesNotMatch(insights, /Top Projected/);
    assert.doesNotMatch(insights, /momIncome/);
});
