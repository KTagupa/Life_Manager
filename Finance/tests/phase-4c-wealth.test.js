'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const wealth = require('../assets/js/ui/wealth-presentation.js');
const { VIEW_CONTENT, FINANCE_CARD_VIEW_MAP } = require('../assets/js/ui/navigation.js');

const financeRoot = path.join(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(financeRoot, relativePath), 'utf8');

function snapshot(overrides = {}) {
    return {
        asOf: '2026-08-01T03:00:00.000Z',
        trackedCash: 1000,
        receivables: 200,
        receivablePositions: { total: 200, count: 1, untrackedPositionCount: 0, overpayment: 0 },
        fixedAssets: { acquisitionCost: 800, accumulatedDepreciation: 300, netBookValue: 500, assetCount: 1, missingDateCount: 0 },
        crypto: { bookValue: 300, marketValue: 400, marketPriceMissingCount: 0 },
        liabilities: {
            debt: { total: 100, count: 1 },
            creditCards: { total: 50, count: 1 },
            installments: {
                total: 120, contractualTotal: 120, principalTotal: 100,
                remainingFinanceChargeTotal: 20, count: 1
            },
            total: 270
        },
        totalAssetsBookValue: 2000,
        totalAssetsMarketValue: 2100,
        estimatedNetWorthBookValue: 1730,
        estimatedNetWorthMarketValue: 1830,
        diagnostics: {
            safeForBookCutover: true,
            fixedAssetMissingDateCount: 0,
            missingLiabilityStartDateCount: 0,
            installmentMissingFeeSplitPaymentCount: 0
        },
        ...overrides
    };
}

function report(snapshotOverrides = {}, reportOverrides = {}) {
    return {
        generatedAt: '2026-08-01T03:00:00.000Z',
        valuation: { holdingCount: 2, missingPriceCount: 0 },
        history: { ready: true, decryptFailureCount: 0 },
        current: {
            canonical: snapshot(snapshotOverrides),
            comparison: { invariantFailures: [], reviewDifferences: [] }
        },
        ...reportOverrides
    };
}

test('Phase 4C Wealth presentation validates, freezes, and keeps market and book bases separate', () => {
    assert.deepEqual(wealth.validate(), { valid: true, errors: [] });
    const result = wealth.buildFinanceWealthPresentation(report(), {
        cutover: {
            cashOnHand: { mode: 'canonical', reason: 'ready' },
            marketKpi: { mode: 'canonical', reason: 'ready' }
        }
    });

    assert.equal(result.version, '1.0.0');
    assert.equal(result.status, 'ready');
    assert.deepEqual(result.market, {
        available: true, basis: 'market', value: 1830, assets: 2100, liabilities: 270, reason: 'ready'
    });
    assert.deepEqual(result.book, {
        available: true, basis: 'book', value: 1730, assets: 2000, liabilities: 270, reason: 'ready'
    });
    assert.equal(Object.isFrozen(result), true);
    assert.equal(Object.isFrozen(result.domains), true);
    assert.throws(() => result.domains.push({}), TypeError);
});

test('missing crypto prices fail the market surface closed while the book estimate remains available', () => {
    const result = wealth.buildFinanceWealthPresentation(report({
        crypto: { bookValue: 300, marketValue: null, marketPriceMissingCount: 2 },
        totalAssetsMarketValue: null,
        estimatedNetWorthMarketValue: null
    }, { valuation: { holdingCount: 3, missingPriceCount: 2 } }), {
        cutover: {
            cashOnHand: { mode: 'canonical', reason: 'ready' },
            marketKpi: { mode: 'unavailable', reason: 'missing_market_prices', missingPriceCount: 2 }
        }
    });

    assert.equal(result.status, 'review');
    assert.equal(result.market.available, false);
    assert.equal(result.market.value, null);
    assert.equal(result.market.basis, 'market');
    assert.equal(result.book.available, true);
    assert.equal(result.book.value, 1730);
    const crypto = result.domains.find(domain => domain.id === 'crypto');
    assert.equal(crypto.available, false);
    assert.equal(crypto.value, null);
    assert.equal(crypto.bookValue, 300);
    assert.equal(crypto.count, 3);
    assert.ok(result.attention.some(item => item.id === 'missing_market_prices'));
});

test('Wealth domains preserve liability meanings and surface reconciliation inputs', () => {
    const result = wealth.buildFinanceWealthPresentation(report({
        receivablePositions: { total: 200, count: 1, untrackedPositionCount: 1, overpayment: 25 },
        diagnostics: {
            safeForBookCutover: true,
            fixedAssetMissingDateCount: 1,
            missingLiabilityStartDateCount: 2,
            installmentMissingFeeSplitPaymentCount: 1
        }
    }), { cutover: {
        cashOnHand: { mode: 'canonical', reason: 'ready' },
        marketKpi: { mode: 'canonical', reason: 'ready' }
    } });

    const debt = result.domains.find(domain => domain.id === 'debts');
    const installment = result.domains.find(domain => domain.id === 'installments');
    assert.equal(debt.basis, 'principal');
    assert.equal(debt.value, 100);
    assert.equal(installment.basis, 'contractual');
    assert.equal(installment.value, 120);
    assert.equal(installment.principalValue, 100);
    assert.equal(installment.financeChargeValue, 20);
    assert.ok(result.attention.some(item => item.id === 'missing_liability_dates'));
    assert.ok(result.attention.some(item => item.id === 'missing_asset_dates'));
    assert.ok(result.attention.some(item => item.id === 'receivable_review'));
    assert.ok(result.attention.some(item => item.id === 'installment_fee_split'));
    assert.ok(result.attention.length <= 5);
});

test('Wealth route starts with the coordinator and owns all position domains', () => {
    assert.deepEqual(VIEW_CONTENT.wealth.map(item => item.selector), [
        '#finance-wealth-coordinator',
        '#crypto-toolkit-panel',
        '#finance-card-assets',
        '#finance-card-lent',
        '#finance-card-credit-cards',
        '#finance-card-debts',
        '#finance-card-installments'
    ]);
    assert.equal(VIEW_CONTENT.wealth[0].span, 'full');
    ['assets', 'lent', 'credit-cards', 'debts', 'installments'].forEach(card => {
        assert.equal(FINANCE_CARD_VIEW_MAP[card], 'wealth');
    });
});

test('Wealth markup and startup provide gated summaries, drill-down actions, and live attention', () => {
    const html = read('index.html');
    const appInit = read('assets/js/core/app-init.js');
    const modelIndex = html.indexOf('assets/js/ui/wealth-presentation.js');
    const rendererIndex = html.indexOf('assets/js/features/wealth.js');
    const appInitIndex = html.indexOf('assets/js/core/app-init.js');

    assert.match(html, /id="finance-wealth-coordinator"/);
    assert.match(html, /id="finance-wealth-market-value"/);
    assert.match(html, /Market-value snapshot/);
    assert.match(html, /id="finance-wealth-book-value"/);
    assert.match(html, /Current book-value estimate/);
    assert.match(html, /id="finance-wealth-attention-list"[^>]*aria-live="polite"/);
    assert.match(html, /data-finance-wealth-action="add_asset"/);
    assert.match(html, /data-finance-wealth-action="open_crypto"/);
    assert.ok(modelIndex > 0 && rendererIndex > modelIndex);
    assert.ok(appInitIndex > rendererIndex);
    assert.match(appInit, /validateFinanceWealthPresentation/);
    assert.match(appInit, /initFinanceWealthCoordination/);
});

test('Wealth detail rows use explicit touch and keyboard actions', () => {
    const renderers = read('assets/js/ui/renderers.js');
    const assets = read('assets/js/features/assets.js');
    const debts = renderers.slice(renderers.indexOf('async function renderDebts'), renderers.indexOf('async function renderCreditCards'));
    const cards = renderers.slice(renderers.indexOf('async function renderCreditCards'), renderers.indexOf('function getInstallmentPaymentTransactions'));
    const installments = renderers.slice(renderers.indexOf('async function renderInstallmentPlans'), renderers.indexOf('async function renderLent'));
    const lent = renderers.slice(renderers.indexOf('async function renderLent'), renderers.indexOf('async function renderBills'));

    assert.doesNotMatch(debts, /div\.onclick\s*=/);
    assert.match(debts, /aria-label="Manage \$\{safeDebtNameAttr\}"/);
    assert.match(debts, /aria-label="Delete \$\{safeDebtNameAttr\}"/);
    assert.match(cards, /aria-label="Record payment for \$\{safeNameAttr\}"/);
    assert.match(cards, /aria-label="Edit \$\{safeNameAttr\}"/);
    assert.match(installments, /aria-label="Record previous payment for \$\{safePlanNameAttr\}"/);
    assert.match(installments, /aria-label="Delete \$\{safePlanNameAttr\}"/);
    assert.match(lent, /aria-label="Stop tracking \$\{safeLentNameAttr\}"/);
    assert.match(assets, /computeFinanceFixedAssetBookValue\(activeAssets, Date\.now\(\)\)/);
    assert.match(assets, /aria-label="Edit \$\{safeAssetNameAttr\}"/);
    assert.doesNotMatch(assets, /cursor-pointer" onclick="openAssetModal/);
});

test('crypto summary never substitutes book cost for an unavailable market value', () => {
    const crypto = read('assets/js/features/crypto.js');
    const widget = crypto.slice(crypto.indexOf('async function renderCryptoWidget'), crypto.indexOf('let cryptoTargetLossesOnly'));

    assert.match(widget, /missingPriceCount > 0 \? 'n\/a' : fmt\(marketValue\)/);
    assert.match(widget, /Book value \$\{fmt\(bookValue\)\}/);
    assert.doesNotMatch(widget, /totalVal \+= h\.totalCost/);
});

test('Phase 4C styles preserve focus and collapse position grids for phones', () => {
    const css = read('assets/css/app.css');

    assert.match(css, /\.finance-wealth-coordinator button:focus-visible/);
    assert.match(css, /outline: 3px solid #0284c7/);
    assert.match(css, /@media \(max-width: 900px\)[\s\S]*\.finance-wealth-position-grid[\s\S]*repeat\(2/);
    assert.match(css, /@media \(max-width: 420px\)[\s\S]*\.finance-wealth-position-grid,[\s\S]*\.finance-wealth-domain-grid[\s\S]*grid-template-columns: 1fr/);
});
