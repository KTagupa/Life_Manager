'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const classifier = require('../assets/js/core/transaction-classifier.js');
const activity = require('../assets/js/ui/activity-presentation.js');

const financeRoot = path.join(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(financeRoot, relativePath), 'utf8');
const DATE = '2026-07-31T08:00:00.000Z';

function tx(overrides = {}) {
    return {
        id: 'activity-fixture-1',
        type: 'expense',
        category: 'Food',
        amt: 100,
        date: DATE,
        paymentSource: 'cash',
        ...overrides
    };
}

function present(transaction, context = {}) {
    return activity.buildFinanceActivityPresentation(transaction, {
        classifier: classifier.classifyFinanceTransaction,
        context
    });
}

function matches(transaction, filter, context = {}) {
    return activity.matchesFinanceActivityFilter(transaction, filter, {
        classifier: classifier.classifyFinanceTransaction,
        context
    });
}

test('Phase 4A presentation covers every canonical transaction class', () => {
    assert.deepEqual(activity.validate(), { valid: true, errors: [] });
    assert.equal(
        Object.keys(activity.CLASS_PRESENTATION).length,
        Object.keys(classifier.FINANCE_TRANSACTION_CLASSES).length
    );
});

test('cash purchase, card charge, and card payment explain cash versus spending', () => {
    const cashPurchase = present(tx({ amt: 450 }));
    assert.equal(cashPurchase.classLabel, 'Cash purchase');
    assert.equal(cashPurchase.cashDelta, -450);
    assert.equal(cashPurchase.spendingDelta, 450);
    assert.equal(cashPurchase.amountRole, 'Cash out • spending');
    assert.deepEqual(cashPurchase.effects.map(effect => effect.key), ['cash', 'spending']);

    const cardCharge = present(tx({
        category: 'Travel',
        amt: 1200,
        paymentSource: 'credit_card',
        creditCardId: 'card-1'
    }));
    assert.equal(cardCharge.classLabel, 'Card purchase');
    assert.equal(cardCharge.cashDelta, 0);
    assert.equal(cardCharge.spendingDelta, 1200);
    assert.equal(cardCharge.liabilityDelta, 1200);
    assert.equal(cardCharge.amountRole, 'Spending now • cash later');
    assert.deepEqual(cardCharge.effects.map(effect => effect.key), ['cash', 'spending', 'liability']);

    const cardPayment = present(tx({
        type: 'credit_card_payment',
        category: 'Aurora Rewards',
        amt: 1200,
        creditCardId: 'card-1'
    }));
    assert.equal(cardPayment.classLabel, 'Card payment');
    assert.equal(cardPayment.cashDelta, -1200);
    assert.equal(cardPayment.spendingDelta, 0);
    assert.equal(cardPayment.settlementDelta, 1200);
    assert.equal(cardPayment.amountRole, 'Cash out • settlement');
    assert.deepEqual(cardPayment.effects.map(effect => effect.key), ['cash', 'settlement', 'liability']);
});

test('Activity filters follow classifier effects and expose incomplete records', () => {
    const salary = tx({ type: 'income', category: 'Salary', amt: 5000 });
    const refund = tx({ type: 'non_income_cash_in', category: 'Refund/Reimbursement', amt: 700 });
    const cardCharge = tx({ paymentSource: 'credit_card', creditCardId: 'card-1' });
    const cardPayment = tx({ type: 'credit_card_payment', creditCardId: 'card-1' });
    const trackedDebt = tx({ type: 'debt_increase', category: 'Debt: Personal loan' });
    const incompleteCardPayment = tx({ type: 'credit_card_payment' });

    assert.equal(matches(salary, 'cash_in'), true);
    assert.equal(matches(salary, 'earned_income'), true);
    assert.equal(matches(refund, 'other_cash_in'), true);
    assert.equal(matches(cardCharge, 'spending'), true);
    assert.equal(matches(cardCharge, 'no_cash'), true);
    assert.equal(matches(cardCharge, 'cash_out'), false);
    assert.equal(matches(cardPayment, 'settlements'), true);
    assert.equal(matches(cardPayment, 'cash_out'), true);
    assert.equal(matches(trackedDebt, 'position_changes'), true);
    assert.equal(matches(trackedDebt, 'no_cash'), true);
    assert.equal(matches(incompleteCardPayment, 'needs_review'), true);
    assert.equal(present(incompleteCardPayment).reviewSeverity, 'warning');
});

test('Activity owns explicit classification controls, date review, and a collapsed guide', () => {
    const html = read('index.html');

    assert.match(html, /id="activity-filter-summary"[^>]*aria-live="polite"/);
    assert.match(html, /id="activity-filter-type"[^>]*aria-label="Filter Activity by canonical classification"/);
    [
        'cash_in', 'cash_out', 'earned_income', 'other_cash_in', 'spending',
        'settlements', 'transfers', 'position_changes', 'no_cash', 'needs_review'
    ].forEach(value => assert.match(html, new RegExp(`value="${value}"`)));
    assert.match(html, /id="report-scope" aria-label="Activity export range"/);
    assert.match(html, /id="activity-date-review-button"/);
    assert.match(html, /id="activity-date-review-count"[^>]*hidden/);
    assert.match(html, /id="transaction-list"[^>]*role="list"/);
    assert.match(html, /<details class="group">[\s\S]*Cash versus spending/);
    assert.doesNotMatch(html, /<details class="group" open>/);
});

test('Activity row rendering uses canonical effects and explicit actions', () => {
    const renderers = read('assets/js/ui/renderers.js');

    assert.match(renderers, /buildFinanceActivityPresentation\(i, \{ context: classificationContext \}\)/);
    assert.match(renderers, /finance-activity-classification/);
    assert.match(renderers, /finance-activity-effects/);
    assert.match(renderers, /finance-activity-row__amount/);
    assert.match(renderers, /finance-activity-row__actions/);
    assert.match(renderers, /aria-label="Edit \$\{safeDescAttr\}"/);
    assert.match(renderers, /aria-label="Delete \$\{safeDescAttr\}"/);
    assert.doesNotMatch(renderers, /row\.onclick\s*=/);
    assert.doesNotMatch(renderers, /row\.onkeydown\s*=/);
});

test('classification filters narrow Activity rows without narrowing metric period input', () => {
    const charts = read('assets/js/ui/charts.js');
    const periodAssignment = charts.indexOf('window.filteredTransactions = sortedForDisplay');
    const activityRender = charts.indexOf('renderTransactions(activityTransactions)');

    assert.match(charts, /matchesFinanceActivityFilter\(transaction, type/);
    assert.match(charts, /updateActivityFilterSummary/);
    assert.ok(periodAssignment > 0 && activityRender > periodAssignment);
    assert.doesNotMatch(charts, /window\.filteredTransactions\s*=\s*activityTransactions/);
    assert.match(charts, /getTransactionsForScope\(metricScope, window\.allDecryptedTransactions, sortedForDisplay\)/);
});

test('date quality updates the persistent Activity review control', () => {
    const dateRepair = read('assets/js/features/date-repair.js');

    assert.match(dateRepair, /function refreshActivityDateReviewControl/);
    assert.match(dateRepair, /dataset\.dateQualityStatus = status/);
    assert.match(dateRepair, /label\.textContent = repairableCount > 0 \? 'Review dates' : 'Dates checked'/);
    assert.match(dateRepair, /count\.hidden = repairableCount === 0/);
    assert.match(dateRepair, /refreshActivityDateReviewControl\(partition\)/);
});

test('Activity presentation loads before rendering and keeps touch actions visible', () => {
    const html = read('index.html');
    const css = read('assets/css/app.css');
    const appInit = read('assets/js/core/app-init.js');
    const presentationIndex = html.indexOf('assets/js/ui/activity-presentation.js');
    const renderersIndex = html.indexOf('assets/js/ui/renderers.js');
    const appInitIndex = html.indexOf('assets/js/core/app-init.js');

    assert.ok(presentationIndex > 0 && renderersIndex > presentationIndex);
    assert.ok(appInitIndex > renderersIndex);
    assert.match(appInit, /validateFinanceActivityPresentation/);
    assert.match(css, /@media \(max-width: 720px\)[\s\S]*\.finance-activity-row__actions \{[\s\S]*opacity: 1/);
    assert.match(css, /@media \(max-width: 460px\)[\s\S]*\.finance-activity-filter-grid \{[\s\S]*grid-template-columns: 1fr/);
});
