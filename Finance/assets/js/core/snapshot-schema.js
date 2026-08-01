// =============================================
// PHASE 2D-B1: STATEMENT SNAPSHOT SCHEMA
// =============================================
// Pure, backward-compatible normalization for saved balance-sheet positions.

(function exposeFinanceStatementSnapshotSchema(root, factory) {
    const api = factory();

    if (root) {
        root.FINANCE_STATEMENT_SNAPSHOT_SCHEMA_VERSION = api.VERSION;
        root.normalizeFinanceStatementPosition = api.normalizeFinanceStatementPosition;
        root.buildFinanceStatementSnapshotPosition = api.buildFinanceStatementSnapshotPosition;
        root.validateFinanceStatementSnapshotSchema = api.validate;
    }

    if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis, function buildFinanceStatementSnapshotSchema() {
    const VERSION = 2;

    function deepFreeze(value) {
        if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
        Object.getOwnPropertyNames(value).forEach(key => deepFreeze(value[key]));
        return Object.freeze(value);
    }

    function finite(value, fallback = 0) {
        const number = Number(value);
        return Number.isFinite(number) ? number : fallback;
    }

    function nullableFinite(value) {
        if (value == null || value === '') return null;
        const number = Number(value);
        return Number.isFinite(number) ? number : null;
    }

    function firstFinite(values, fallback = 0) {
        for (const value of values) {
            const number = Number(value);
            if (value != null && value !== '' && Number.isFinite(number)) return number;
        }
        return fallback;
    }

    function normalizeFinanceStatementPosition(balanceSheet = {}) {
        const source = balanceSheet && typeof balanceSheet === 'object' ? balanceSheet : {};
        const cash = finite(source.cash, 0);
        const receivables = finite(source.receivables, 0);
        const crypto = finite(source.crypto, 0);
        const debt = Math.max(0, finite(source.debt, 0));
        const creditCardDebt = Math.max(0, finite(source.creditCardDebt, 0));
        const installmentDebt = Math.max(0, finite(source.installmentDebt, 0));
        const totalAssets = finite(source.totalAssets, cash + receivables + crypto);
        const totalLiabilities = finite(
            source.totalLiabilities,
            debt + creditCardDebt + installmentDebt
        );
        const netWorth = finite(source.netWorth, totalAssets - totalLiabilities);
        const fixedAssets = Math.max(0, finite(source.fixedAssets, 0));
        const cryptoBookValue = Math.max(0, firstFinite([source.cryptoBookValue, source.crypto], 0));
        const cryptoMarketValue = nullableFinite(source.cryptoMarketValue);
        const totalAssetsBookValue = firstFinite(
            [source.totalAssetsBookValue, source.totalAssets],
            cash + receivables + fixedAssets + cryptoBookValue
        );
        const totalAssetsMarketValue = nullableFinite(source.totalAssetsMarketValue);
        const netWorthBookValue = firstFinite(
            [source.netWorthBookValue, source.netWorth],
            totalAssetsBookValue - totalLiabilities
        );
        const netWorthMarketValue = nullableFinite(source.netWorthMarketValue);
        const marketValuationStatus = String(source.marketValuationStatus || '').trim()
            || (netWorthMarketValue == null ? 'unavailable' : 'available');

        return deepFreeze({
            // Legacy aliases remain stable for old snapshots and external consumers.
            cash,
            receivables,
            crypto,
            debt,
            creditCardDebt,
            installmentDebt,
            totalAssets,
            totalLiabilities,
            netWorth,

            // Version 2 position fields are explicit about valuation basis.
            fixedAssets,
            cryptoBookValue,
            cryptoMarketValue,
            totalAssetsBookValue,
            totalAssetsMarketValue,
            netWorthBookValue,
            netWorthMarketValue,
            valuationBasis: 'book',
            marketValuationStatus,
            positionSource: String(source.positionSource || 'legacy_compatible').trim() || 'legacy_compatible'
        });
    }

    function buildFinanceStatementSnapshotPosition(legacyBalanceSheet = {}, canonicalSnapshot = null) {
        const legacy = normalizeFinanceStatementPosition(legacyBalanceSheet);
        if (!canonicalSnapshot || typeof canonicalSnapshot !== 'object') return legacy;

        const marketStatus = String(canonicalSnapshot?.diagnostics?.cryptoMarketValueStatus || '').trim()
            || (canonicalSnapshot.estimatedNetWorthMarketValue == null ? 'unavailable' : 'available');
        return normalizeFinanceStatementPosition({
            ...legacy,
            fixedAssets: canonicalSnapshot?.fixedAssets?.netBookValue,
            cryptoBookValue: canonicalSnapshot?.crypto?.bookValue,
            cryptoMarketValue: canonicalSnapshot?.crypto?.marketValue,
            totalAssetsBookValue: canonicalSnapshot?.totalAssetsBookValue,
            totalAssetsMarketValue: canonicalSnapshot?.totalAssetsMarketValue,
            netWorthBookValue: canonicalSnapshot?.estimatedNetWorthBookValue,
            netWorthMarketValue: canonicalSnapshot?.estimatedNetWorthMarketValue,
            marketValuationStatus: marketStatus,
            positionSource: 'canonical_book'
        });
    }

    function validate() {
        const legacy = normalizeFinanceStatementPosition({
            cash: 100,
            receivables: 20,
            crypto: 30,
            debt: 40,
            creditCardDebt: 10,
            totalAssets: 150,
            totalLiabilities: 50,
            netWorth: 100
        });
        const enriched = buildFinanceStatementSnapshotPosition(legacy, {
            fixedAssets: { netBookValue: 60 },
            crypto: { bookValue: 30, marketValue: null },
            totalAssetsBookValue: 210,
            totalAssetsMarketValue: null,
            estimatedNetWorthBookValue: 160,
            estimatedNetWorthMarketValue: null,
            diagnostics: { cryptoMarketValueStatus: 'unavailable_missing_prices' }
        });
        const errors = [];
        if (legacy.installmentDebt !== 0) errors.push('Legacy installment default failed.');
        if (legacy.netWorthBookValue !== 100) errors.push('Legacy book-value fallback failed.');
        if (enriched.netWorth !== 100) errors.push('Legacy net-worth alias changed.');
        if (enriched.netWorthBookValue !== 160) errors.push('Canonical book net worth failed.');
        if (enriched.fixedAssets !== 60) errors.push('Fixed-asset position failed.');
        if (enriched.positionSource !== 'canonical_book') errors.push('Canonical position source failed.');
        if (enriched.marketValuationStatus !== 'unavailable_missing_prices') {
            errors.push('Market availability state failed.');
        }
        return deepFreeze({ valid: errors.length === 0, errors, version: VERSION });
    }

    return deepFreeze({
        VERSION,
        normalizeFinanceStatementPosition,
        buildFinanceStatementSnapshotPosition,
        validate
    });
});
