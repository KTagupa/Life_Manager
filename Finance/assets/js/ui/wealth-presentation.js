(function exposeFinanceWealthPresentation(root, factory) {
    const api = factory(root);

    if (typeof module === 'object' && module.exports) {
        module.exports = api;
    }

    if (root) {
        root.FINANCE_WEALTH_PRESENTATION_VERSION = api.VERSION;
        root.buildFinanceWealthPresentation = api.buildFinanceWealthPresentation;
        root.validateFinanceWealthPresentation = api.validate;
    }
})(typeof window !== 'undefined' ? window : globalThis, function buildFinanceWealthPresentationModule(root) {
    'use strict';

    const VERSION = '1.0.0';

    function deepFreeze(value) {
        if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
        Object.values(value).forEach(deepFreeze);
        return Object.freeze(value);
    }

    function finite(value) {
        return value != null && value !== '' && Number.isFinite(Number(value));
    }

    function number(value) {
        return finite(value) ? Number(value) : 0;
    }

    function count(value) {
        return Math.max(0, Math.round(number(value)));
    }

    function comparisonReady(comparison) {
        return Array.isArray(comparison?.invariantFailures)
            && comparison.invariantFailures.length === 0
            && Array.isArray(comparison?.reviewDifferences)
            && comparison.reviewDifferences.length === 0;
    }

    function unavailablePosition(basis, reason) {
        return {
            available: false,
            basis,
            value: null,
            assets: null,
            liabilities: null,
            reason
        };
    }

    function resolveCutover(report, options) {
        if (options?.cutover && typeof options.cutover === 'object') return options.cutover;
        if (report?.surfaces && typeof report.surfaces === 'object') return report.surfaces;
        if (typeof root?.assessFinanceSnapshotCutover === 'function') {
            return root.assessFinanceSnapshotCutover(report);
        }
        return null;
    }

    function buildMarketPosition(snapshot, cutover) {
        const surface = cutover?.marketKpi;
        if (surface?.mode !== 'canonical'
            || !finite(snapshot?.estimatedNetWorthMarketValue)
            || !finite(snapshot?.totalAssetsMarketValue)) {
            return unavailablePosition('market', surface?.reason || 'market_value_unavailable');
        }
        return {
            available: true,
            basis: 'market',
            value: Number(snapshot.estimatedNetWorthMarketValue),
            assets: Number(snapshot.totalAssetsMarketValue),
            liabilities: number(snapshot?.liabilities?.total),
            reason: 'ready'
        };
    }

    function buildBookPosition(report, snapshot) {
        const ready = report?.history?.ready === true
            && snapshot?.diagnostics?.safeForBookCutover === true
            && comparisonReady(report?.current?.comparison)
            && finite(snapshot?.estimatedNetWorthBookValue)
            && finite(snapshot?.totalAssetsBookValue);
        if (!ready) {
            const reason = report?.history?.ready !== true
                ? 'history_not_ready'
                : (snapshot?.diagnostics?.safeForBookCutover !== true
                    ? 'book_value_unavailable'
                    : 'current_reconciliation_failed');
            return unavailablePosition('book', reason);
        }
        return {
            available: true,
            basis: 'book',
            value: Number(snapshot.estimatedNetWorthBookValue),
            assets: Number(snapshot.totalAssetsBookValue),
            liabilities: number(snapshot?.liabilities?.total),
            reason: 'ready'
        };
    }

    function buildDomains(snapshot, market, valuation = {}) {
        const fixedAssets = snapshot?.fixedAssets || {};
        const receivables = snapshot?.receivablePositions || {};
        const crypto = snapshot?.crypto || {};
        const debt = snapshot?.liabilities?.debt || {};
        const cards = snapshot?.liabilities?.creditCards || {};
        const installments = snapshot?.liabilities?.installments || {};
        const cryptoAvailable = market.available && finite(crypto.marketValue);
        const debtAvailable = !!snapshot && finite(debt.total);
        const cardsAvailable = !!snapshot && finite(cards.total);
        const installmentsAvailable = !!snapshot && finite(installments.contractualTotal ?? installments.total);

        return [
            {
                id: 'fixed_assets', label: 'Fixed assets', role: 'asset', basis: 'book',
                value: finite(fixedAssets.netBookValue) ? Number(fixedAssets.netBookValue) : null,
                available: finite(fixedAssets.netBookValue), count: count(fixedAssets.assetCount),
                detail: 'Net book value', actionId: 'focus_assets'
            },
            {
                id: 'receivables', label: 'Money lent', role: 'asset', basis: 'receivable',
                value: finite(receivables.total) ? Number(receivables.total) : null,
                available: finite(receivables.total), count: count(receivables.count),
                detail: 'Outstanding receivables', actionId: 'focus_lent'
            },
            {
                id: 'crypto', label: 'Crypto', role: 'asset', basis: 'market',
                value: cryptoAvailable ? Number(crypto.marketValue) : null,
                bookValue: finite(crypto.bookValue) ? Number(crypto.bookValue) : null,
                available: cryptoAvailable, count: count(valuation.holdingCount),
                missingPriceCount: count(crypto.marketPriceMissingCount),
                detail: cryptoAvailable ? 'Current market value' : 'Market value unavailable',
                actionId: 'open_crypto'
            },
            {
                id: 'credit_cards', label: 'Credit cards', role: 'liability', basis: 'outstanding',
                value: cardsAvailable ? Number(cards.total) : null, available: cardsAvailable, count: count(cards.count),
                detail: 'Outstanding balance', actionId: 'focus_cards'
            },
            {
                id: 'debts', label: 'Debts', role: 'liability', basis: 'principal',
                value: debtAvailable ? Number(debt.total) : null, available: debtAvailable, count: count(debt.count),
                detail: 'Principal outstanding', actionId: 'focus_debts'
            },
            {
                id: 'installments', label: 'Installments', role: 'liability', basis: 'contractual',
                value: installmentsAvailable ? Number(installments.contractualTotal ?? installments.total) : null,
                available: installmentsAvailable,
                count: count(installments.count),
                principalValue: number(installments.principalTotal),
                financeChargeValue: number(installments.remainingFinanceChargeTotal),
                detail: 'Contractual amount remaining', actionId: 'focus_installments'
            }
        ];
    }

    function buildAttention(report, snapshot, market, book) {
        const diagnostics = snapshot?.diagnostics || {};
        const receivables = snapshot?.receivablePositions || {};
        const attention = [];
        const missingPriceCount = count(snapshot?.crypto?.marketPriceMissingCount);

        if (!report) {
            attention.push({
                id: 'snapshot_unavailable', tone: 'warning', title: 'Wealth position is still loading',
                detail: 'The canonical position snapshot is not available yet.',
                actionId: 'focus_assets', actionLabel: 'Review assets'
            });
        } else if (report?.history?.ready !== true) {
            attention.push({
                id: 'history_not_ready', tone: 'danger', title: 'Some position history could not be verified',
                detail: `${count(report?.history?.decryptFailureCount)} encrypted ${count(report?.history?.decryptFailureCount) === 1 ? 'record needs' : 'records need'} review before totals can cut over.`,
                actionId: 'focus_debts', actionLabel: 'Review obligations'
            });
        }
        if (!market.available && missingPriceCount > 0) {
            attention.push({
                id: 'missing_market_prices', tone: 'warning',
                title: `${missingPriceCount} crypto ${missingPriceCount === 1 ? 'price is' : 'prices are'} missing`,
                detail: 'Market-value assets and Estimated Net Worth remain unavailable; book values are kept separate.',
                actionId: 'open_crypto', actionLabel: 'Update prices'
            });
        }
        const missingLiabilityDates = count(diagnostics.missingLiabilityStartDateCount);
        if (missingLiabilityDates) {
            attention.push({
                id: 'missing_liability_dates', tone: 'danger',
                title: `${missingLiabilityDates} ${missingLiabilityDates === 1 ? 'obligation needs' : 'obligations need'} a start date`,
                detail: 'As-of balances cannot be verified until liability history has effective dates.',
                actionId: 'focus_debts', actionLabel: 'Review obligations'
            });
        }
        const missingAssetDates = count(diagnostics.fixedAssetMissingDateCount);
        if (missingAssetDates) {
            attention.push({
                id: 'missing_asset_dates', tone: 'warning',
                title: `${missingAssetDates} fixed ${missingAssetDates === 1 ? 'asset needs' : 'assets need'} a purchase date`,
                detail: 'Net book value cannot include assets without a valid depreciation start date.',
                actionId: 'focus_assets', actionLabel: 'Review assets'
            });
        }
        const receivableReviewCount = count(receivables.untrackedPositionCount);
        const overpayment = number(receivables.overpayment);
        if (receivableReviewCount || overpayment > 0) {
            attention.push({
                id: 'receivable_review', tone: 'warning', title: 'Receivable activity needs review',
                detail: `${receivableReviewCount} untracked ${receivableReviewCount === 1 ? 'position' : 'positions'} • ${overpayment.toFixed(2)} overpayment`,
                actionId: 'focus_lent', actionLabel: 'Review money lent'
            });
        }
        const feeSplitCount = count(diagnostics.installmentMissingFeeSplitPaymentCount);
        if (feeSplitCount) {
            attention.push({
                id: 'installment_fee_split', tone: 'neutral',
                title: `${feeSplitCount} installment ${feeSplitCount === 1 ? 'payment needs' : 'payments need'} a fee split`,
                detail: 'The contractual balance is valid, but principal and finance-charge detail is incomplete.',
                actionId: 'focus_installments', actionLabel: 'Review installments'
            });
        }
        if (!book.available && report && report?.history?.ready === true && !attention.length) {
            attention.push({
                id: 'book_reconciliation', tone: 'warning', title: 'Book-value estimate is under review',
                detail: 'Current assets and liabilities have not passed the book-value reconciliation gate.',
                actionId: 'focus_assets', actionLabel: 'Review positions'
            });
        }
        if (!attention.length) {
            attention.push({
                id: 'wealth_clear', tone: 'positive', title: 'Position inputs are coordinated',
                detail: 'No immediate valuation, effective-date, receivable, or installment split issue is visible.',
                actionId: 'focus_assets', actionLabel: 'Review positions'
            });
        }
        return attention.slice(0, 5);
    }

    function buildFinanceWealthPresentation(report = null, options = {}) {
        const snapshot = report?.current?.canonical || null;
        const cutover = resolveCutover(report, options);
        const market = buildMarketPosition(snapshot, cutover);
        const book = buildBookPosition(report, snapshot);
        const domains = buildDomains(snapshot, market, report?.valuation);
        const cashAvailable = cutover?.cashOnHand?.mode === 'canonical' && finite(snapshot?.trackedCash);
        const liabilityAvailable = !!snapshot && finite(snapshot?.liabilities?.total);
        const status = !snapshot ? 'unavailable' : (market.available && book.available ? 'ready' : 'review');

        return deepFreeze({
            version: VERSION,
            asOf: snapshot?.asOf || report?.generatedAt || null,
            status,
            market,
            book,
            cash: {
                available: cashAvailable,
                basis: 'tracked_cash',
                value: cashAvailable ? Number(snapshot.trackedCash) : null,
                reason: cashAvailable ? 'ready' : (cutover?.cashOnHand?.reason || 'tracked_cash_unavailable')
            },
            trackedCash: cashAvailable ? Number(snapshot.trackedCash) : null,
            receivables: number(snapshot?.receivables),
            fixedAssets: number(snapshot?.fixedAssets?.netBookValue),
            liabilities: {
                available: liabilityAvailable,
                total: liabilityAvailable ? Number(snapshot.liabilities.total) : null,
                debt: finite(snapshot?.liabilities?.debt?.total) ? Number(snapshot.liabilities.debt.total) : null,
                creditCards: finite(snapshot?.liabilities?.creditCards?.total) ? Number(snapshot.liabilities.creditCards.total) : null,
                installments: finite(snapshot?.liabilities?.installments?.contractualTotal ?? snapshot?.liabilities?.installments?.total)
                    ? Number(snapshot.liabilities.installments.contractualTotal ?? snapshot.liabilities.installments.total)
                    : null
            },
            domains,
            attention: buildAttention(report, snapshot, market, book)
        });
    }

    function validate() {
        const fixtureSnapshot = {
            asOf: '2026-08-01T00:00:00.000Z', trackedCash: 1000, receivables: 200,
            receivablePositions: { total: 200, count: 1, untrackedPositionCount: 0, overpayment: 0 },
            fixedAssets: { netBookValue: 500, assetCount: 1 },
            crypto: { bookValue: 300, marketValue: 400, marketPriceMissingCount: 0 },
            liabilities: {
                debt: { total: 100, count: 1 }, creditCards: { total: 50, count: 1 },
                installments: { total: 120, contractualTotal: 120, principalTotal: 100, remainingFinanceChargeTotal: 20, count: 1 },
                total: 270
            },
            totalAssetsBookValue: 2000, totalAssetsMarketValue: 2100,
            estimatedNetWorthBookValue: 1730, estimatedNetWorthMarketValue: 1830,
            diagnostics: { safeForBookCutover: true, fixedAssetMissingDateCount: 0, missingLiabilityStartDateCount: 0 }
        };
        const fixture = buildFinanceWealthPresentation({
            history: { ready: true, decryptFailureCount: 0 },
            current: { canonical: fixtureSnapshot, comparison: { invariantFailures: [], reviewDifferences: [] } }
        }, { cutover: {
            cashOnHand: { mode: 'canonical', reason: 'ready' },
            marketKpi: { mode: 'canonical', reason: 'ready' }
        } });
        const errors = [];
        if (fixture.version !== VERSION) errors.push('Wealth presentation version mismatch.');
        if (!fixture.market.available || fixture.market.basis !== 'market') errors.push('Market position contract failed.');
        if (!fixture.book.available || fixture.book.basis !== 'book') errors.push('Book position contract failed.');
        if (fixture.domains.length !== 6) errors.push('Wealth domains are incomplete.');
        if (!Array.isArray(fixture.attention) || !fixture.attention.length) errors.push('Wealth attention contract is empty.');
        return Object.freeze({ valid: errors.length === 0, errors: Object.freeze(errors) });
    }

    return { VERSION, buildFinanceWealthPresentation, validate };
});
