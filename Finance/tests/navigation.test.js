const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const {
    FINANCE_VIEW_DEFINITIONS,
    FINANCE_CARD_VIEW_MAP,
    VIEW_CONTENT,
    getFinanceViewForCard,
    normalizeFinanceViewId,
    resolveInitialFinanceView
} = require('../assets/js/ui/navigation.js');

const primaryViews = ['overview', 'activity', 'plan', 'wealth', 'reports'];
const expectedCards = [
    'ledger',
    'wishlist',
    'plan-budget',
    'assets',
    'installments',
    'insights',
    'revenue',
    'trends',
    'goals',
    'debts',
    'credit-cards',
    'lent',
    'bills',
    'spend',
    'variance'
];

test('normalizes only registered Finance routes', () => {
    assert.equal(normalizeFinanceViewId('#Overview'), 'overview');
    assert.equal(normalizeFinanceViewId(' reports '), 'reports');
    assert.equal(normalizeFinanceViewId('#tools'), 'tools');
    assert.equal(normalizeFinanceViewId('#unknown'), null);
    assert.equal(normalizeFinanceViewId(''), null);
});

test('initial route precedence is hash, saved view, then overview', () => {
    assert.equal(resolveInitialFinanceView('#activity', 'wealth'), 'activity');
    assert.equal(resolveInitialFinanceView('#not-a-view', 'plan'), 'overview');
    assert.equal(resolveInitialFinanceView('', 'tools'), 'tools');
    assert.equal(resolveInitialFinanceView('', 'invalid'), 'overview');
});

test('primary routes are complete, unique, and ordered for the shell', () => {
    const registeredPrimaryViews = Object.entries(FINANCE_VIEW_DEFINITIONS)
        .filter(([, definition]) => definition.primary)
        .map(([viewId]) => viewId);

    assert.deepEqual(registeredPrimaryViews, primaryViews);
    assert.equal(new Set(registeredPrimaryViews).size, registeredPrimaryViews.length);
});

test('every shortcut card has exactly one valid owning view', () => {
    assert.deepEqual(Object.keys(FINANCE_CARD_VIEW_MAP), expectedCards);

    expectedCards.forEach(cardKey => {
        const viewId = getFinanceViewForCard(cardKey);
        assert.ok(FINANCE_VIEW_DEFINITIONS[viewId], `${cardKey} should map to a registered view`);
    });

    assert.equal(getFinanceViewForCard('not-a-card'), null);
});

test('routed content selectors are not duplicated between views', () => {
    const selectors = Object.values(VIEW_CONTENT)
        .flat()
        .map(item => item.selector);

    assert.equal(new Set(selectors).size, selectors.length);
});

test('index exposes every routed view and every card anchor once', () => {
    const indexPath = path.join(__dirname, '..', 'index.html');
    const html = fs.readFileSync(indexPath, 'utf8');

    Object.keys(FINANCE_VIEW_DEFINITIONS).forEach(viewId => {
        const viewPattern = new RegExp(`data-finance-view="${viewId}"`, 'g');
        assert.equal((html.match(viewPattern) || []).length, 1, `${viewId} should have one view section`);
    });

    expectedCards.forEach(cardKey => {
        const cardPattern = new RegExp(`data-finance-card="${cardKey}"`, 'g');
        assert.equal((html.match(cardPattern) || []).length, 1, `${cardKey} should have one card anchor`);
    });
});
