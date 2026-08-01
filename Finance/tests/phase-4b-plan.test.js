'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const classifier = require('../assets/js/core/transaction-classifier.js');
const planning = require('../assets/js/ui/planning-presentation.js');
const { VIEW_CONTENT, FINANCE_CARD_VIEW_MAP } = require('../assets/js/ui/navigation.js');

const financeRoot = path.join(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(financeRoot, relativePath), 'utf8');
const NOW = new Date(2026, 7, 1, 12, 0, 0);

function tx(overrides = {}) {
    return {
        id: 'plan-fixture-1',
        type: 'expense',
        category: 'Food',
        amt: 100,
        date: '2026-08-01T02:00:00.000Z',
        paymentSource: 'cash',
        ...overrides
    };
}

function build(input = {}, now = NOW) {
    return planning.buildFinancePlanningPresentation(input, {
        now,
        classifier: classifier.classifyFinanceTransaction
    });
}

test('Phase 4B planning presentation validates and is immutable', () => {
    assert.deepEqual(planning.validate(), { valid: true, errors: [] });
    const result = build({ budgets: { Food: 1000 } });
    assert.equal(result.version, '1.0.0');
    assert.equal(result.periodKey, '2026-08');
    assert.equal(Object.isFrozen(result), true);
    assert.equal(Object.isFrozen(result.budget.rows), true);
    assert.throws(() => result.attention.push({}), TypeError);
});

test('monthly budgets count consumption once and exclude later card settlement', () => {
    const result = build({
        budgets: { Food: 1000, Bills: 2000 },
        transactions: [
            tx({ amt: 800 }),
            tx({ amt: 300, paymentSource: 'credit_card', creditCardId: 'card-1' }),
            tx({
                type: 'credit_card_payment',
                category: 'Aurora Card',
                amt: 500,
                creditCardId: 'card-1'
            }),
            tx({ category: 'Transport', amt: 250 })
        ]
    });

    const food = result.budget.rows.find(row => row.category === 'Food');
    assert.equal(food.spent, 1100);
    assert.equal(food.status, 'over');
    assert.equal(result.budget.budgetedSpending, 1100);
    assert.equal(result.budget.unbudgetedSpending, 250);
    assert.equal(result.budget.totalConsumption, 1350);
    assert.equal(result.budget.overCount, 1);
    assert.equal(result.attention[0].id, 'budget_overages');
});

test('bill coordination separates active, paused, expected, and next scheduled obligations', () => {
    const result = build({
        bills: [
            { id: 'rent', name: 'Rent', amt: 15000, day: 3 },
            { id: 'paused', name: 'Gym', amt: 1200, day: 2, paused: true },
            {
                id: 'power', name: 'Power', amt: 1800, day: 15, billType: 'electricity',
                electricityHistory: [{ billingMonth: '2026-07', amount: 2200, status: 'paid' }]
            }
        ]
    });

    assert.equal(result.bills.activeCount, 2);
    assert.equal(result.bills.pausedCount, 1);
    assert.equal(result.bills.monthlyExpected, 17200);
    assert.equal(result.bills.nextDue.id, 'rent');
    assert.equal(result.bills.nextDue.daysUntil, 2);
    assert.equal(result.bills.dueSoonCount, 1);
    assert.ok(result.attention.some(item => item.id === 'bills_due_soon'));
});

test('goals and wishlist expose coordination gaps without inventing contribution progress', () => {
    const result = build({
        budgets: { Food: 1000 },
        goals: [
            { id: 'goal-1', name: 'Emergency fund', targetAmount: 50000, targetDate: '2026-08-20', status: 'active' },
            { id: 'goal-2', name: 'Paused goal', targetAmount: 10000, status: 'paused' },
            { id: 'goal-3', name: 'Done', targetAmount: 5000, status: 'completed' }
        ],
        wishlist: [
            { id: 'wish-1', desc: 'Chair', amt: 8000, category: 'Home', targetDate: '2026-08-15' },
            { id: 'wish-2', desc: 'Trip', amt: null, category: null, targetDate: '2026-10-01' }
        ]
    });

    assert.equal(result.goals.activeCount, 1);
    assert.equal(result.goals.pausedCount, 1);
    assert.equal(result.goals.completedCount, 1);
    assert.equal(result.goals.targetTotal, 50000);
    assert.equal(result.wishlist.plannedTotal, 8000);
    assert.equal(result.wishlist.missingAmountCount, 1);
    assert.equal(result.wishlist.uncategorizedCount, 1);
    assert.equal(result.wishlist.unbudgetedCount, 1);
    assert.ok(result.attention.some(item => item.id === 'goals_due_soon'));
    assert.ok(result.attention.some(item => item.id === 'wishlist_incomplete'));
    assert.ok(result.attention.length <= 4);
    assert.equal('progress' in result.goals.rows[0], false);
});

test('Plan route owns the coordinator and all four planning domains', () => {
    assert.deepEqual(VIEW_CONTENT.plan.map(item => item.selector), [
        '#finance-plan-coordinator',
        '#finance-card-plan-budget',
        '#finance-card-bills',
        '#finance-card-goals',
        '#finance-card-wishlist'
    ]);
    assert.equal(VIEW_CONTENT.plan[0].span, 'full');
    assert.equal(FINANCE_CARD_VIEW_MAP['plan-budget'], 'plan');
    assert.equal(FINANCE_CARD_VIEW_MAP.bills, 'plan');
    assert.equal(FINANCE_CARD_VIEW_MAP.goals, 'plan');
    assert.equal(FINANCE_CARD_VIEW_MAP.wishlist, 'plan');
});

test('Plan markup provides coordinated summaries, actions, and honest goal labeling', () => {
    const html = read('index.html');

    assert.match(html, /id="finance-plan-coordinator"/);
    assert.match(html, /id="finance-plan-budget-value"/);
    assert.match(html, /id="finance-plan-bills-value"/);
    assert.match(html, /id="finance-plan-goals-value"/);
    assert.match(html, /id="finance-plan-wishlist-value"/);
    assert.match(html, /id="finance-plan-attention-list"[^>]*aria-live="polite"/);
    assert.match(html, /id="finance-card-plan-budget"/);
    assert.match(html, /data-finance-plan-action="manage_budgets"/);
    assert.match(html, /Dedicated goal contributions are not tracked yet/);
    assert.match(html, /id="sc-fixed-obligations"[^>]*aria-label="Fixed monthly obligations"/);
});

test('bill, wishlist, and goal rows use explicit accessible actions', () => {
    const renderers = read('assets/js/ui/renderers.js');
    const planningSource = read('assets/js/features/planning.js');
    const billsSource = renderers.slice(
        renderers.indexOf('async function renderBills'),
        renderers.indexOf('function renderBudgets')
    );
    const wishlistSource = renderers.slice(renderers.indexOf('function renderWishlist'));

    assert.doesNotMatch(billsSource, /div\.onclick\s*=/);
    assert.match(billsSource, /aria-label="Edit \$\{safeBillNameAttr\}"/);
    assert.match(billsSource, /aria-label="Record payment for \$\{safeBillNameAttr\}"/);
    assert.match(billsSource, /aria-label="Delete \$\{safeBillNameAttr\}"/);
    assert.doesNotMatch(wishlistSource, /div\.onclick\s*=/);
    assert.match(wishlistSource, /aria-label="Edit \$\{safeDescAttr\}"/);
    assert.match(wishlistSource, /aria-label="Convert \$\{safeDescAttr\} to a purchase"/);
    assert.match(planningSource, /Cash proxy \$\{progress\.toFixed\(0\)\}%/);
    assert.match(planningSource, /aria-label="Edit \$\{safeNameAttr\}"/);
});

test('Planning model loads before its renderer and initializes through app startup', () => {
    const html = read('index.html');
    const appInit = read('assets/js/core/app-init.js');
    const modelIndex = html.indexOf('assets/js/ui/planning-presentation.js');
    const rendererIndex = html.indexOf('assets/js/features/planning.js');
    const appInitIndex = html.indexOf('assets/js/core/app-init.js');

    assert.ok(modelIndex > 0 && rendererIndex > modelIndex);
    assert.ok(appInitIndex > rendererIndex);
    assert.match(appInit, /validateFinancePlanningPresentation/);
    assert.match(appInit, /initFinancePlanCoordination/);
});

test('Phase 4B styles preserve focus and collapse cleanly for phones', () => {
    const css = read('assets/css/app.css');

    assert.match(css, /\.finance-plan-coordinator button:focus-visible/);
    assert.match(css, /outline: 3px solid #6366f1/);
    assert.match(css, /@media \(max-width: 840px\)[\s\S]*\.finance-plan-summary-grid[\s\S]*repeat\(2/);
    assert.match(css, /@media \(max-width: 420px\)[\s\S]*\.finance-plan-summary-grid[\s\S]*grid-template-columns: 1fr/);
});
