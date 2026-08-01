// =============================================
// PHASE 2D-B2 / 3A: GATED SNAPSHOT DISPLAY SURFACES
// =============================================
// Pure display-boundary helpers. Cash, market, and book surfaces are gated separately.

(function exposeFinanceSnapshotAdapter(root, factory) {
    const api = factory();

    if (root) {
        root.FINANCE_SNAPSHOT_ADAPTER_VERSION = api.VERSION;
        root.assessFinanceSnapshotCutover = api.assessFinanceSnapshotCutover;
        root.buildFinanceCashOnHandView = api.buildFinanceCashOnHandView;
        root.buildFinanceMarketNetWorthView = api.buildFinanceMarketNetWorthView;
        root.resolveFinanceStatementBookPosition = api.resolveFinanceStatementBookPosition;
        root.validateFinanceSnapshotAdapter = api.validate;
        root.getFinanceSnapshotCutoverState = function getFinanceSnapshotCutoverState() {
            const report = typeof root.getFinanceSnapshotShadowReport === 'function'
                ? root.getFinanceSnapshotShadowReport()
                : (root.financeSnapshotShadowReport || null);
            return api.assessFinanceSnapshotCutover(report);
        };
        root.getFinanceCashOnHandView = function getFinanceCashOnHandView(legacy = {}) {
            const report = typeof root.getFinanceSnapshotShadowReport === 'function'
                ? root.getFinanceSnapshotShadowReport()
                : (root.financeSnapshotShadowReport || null);
            return api.buildFinanceCashOnHandView(report, legacy);
        };
        root.getFinanceMarketNetWorthView = function getFinanceMarketNetWorthView(legacy = {}) {
            const report = typeof root.getFinanceSnapshotShadowReport === 'function'
                ? root.getFinanceSnapshotShadowReport()
                : (root.financeSnapshotShadowReport || null);
            return api.buildFinanceMarketNetWorthView(report, legacy);
        };
        root.getFinanceStatementBookPosition = function getFinanceStatementBookPosition(balanceSheet = {}) {
            const report = typeof root.getFinanceSnapshotShadowReport === 'function'
                ? root.getFinanceSnapshotShadowReport()
                : (root.financeSnapshotShadowReport || null);
            return api.resolveFinanceStatementBookPosition(balanceSheet, report);
        };
    }

    if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis, function buildFinanceSnapshotAdapter() {
    const VERSION = '1.1.0';

    function deepFreeze(value) {
        if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
        Object.getOwnPropertyNames(value).forEach(key => deepFreeze(value[key]));
        return Object.freeze(value);
    }

    function finite(value) {
        return value != null && value !== '' && Number.isFinite(Number(value));
    }

    function emptyDifferences(comparison, key) {
        return Array.isArray(comparison?.[key]) && comparison[key].length === 0;
    }

    function baseDiagnosticsReady(diagnostics) {
        return diagnostics?.safeForShadowComparison === true
            && Number(diagnostics?.missingLiabilityStartDateCount || 0) === 0
            && Number(diagnostics?.fixedAssetMissingDateCount || 0) === 0;
    }

    function comparisonReady(comparison) {
        return emptyDifferences(comparison, 'invariantFailures')
            && emptyDifferences(comparison, 'reviewDifferences');
    }

    function cashComparisonReady(comparison) {
        if (!comparison || typeof comparison !== 'object') return false;
        const cashComparison = Array.isArray(comparison.comparisons)
            ? comparison.comparisons.find(item => item?.canonicalPath === 'trackedCash')
            : null;
        if (cashComparison) return cashComparison.comparable === true && cashComparison.matches === true;
        return emptyDifferences(comparison, 'invariantFailures');
    }

    function fallbackSurface(reason, extra = {}) {
        return deepFreeze({ mode: 'legacy', ready: false, reason, ...extra });
    }

    function assessFinanceSnapshotCutover(report) {
        if (!report || typeof report !== 'object') {
            return deepFreeze({
                cashOnHand: fallbackSurface('report_unavailable'),
                marketKpi: fallbackSurface('report_unavailable', { missingPriceCount: 0 }),
                bookStatement: fallbackSurface('report_unavailable'),
                readyForOverviewCutover: false,
                readyForVisibleCutover: false
            });
        }

        const historyReady = report?.history?.ready === true;
        const currentCanonical = report?.current?.canonical;
        const currentComparison = report?.current?.comparison;
        const currentBaseReady = historyReady
            && baseDiagnosticsReady(currentCanonical?.diagnostics)
            && comparisonReady(currentComparison);
        const missingPriceCount = Math.max(
            0,
            Number(report?.valuation?.missingPriceCount
                ?? currentCanonical?.crypto?.marketPriceMissingCount
                ?? 0)
        );

        let cashOnHand;
        if (!currentCanonical) {
            cashOnHand = fallbackSurface('current_snapshot_unavailable');
        } else if (currentCanonical?.diagnostics?.safeForShadowComparison !== true) {
            cashOnHand = fallbackSurface('current_data_unsafe');
        } else if (!finite(currentCanonical?.trackedCash)) {
            cashOnHand = fallbackSurface('tracked_cash_unavailable');
        } else if (!cashComparisonReady(currentComparison)) {
            cashOnHand = fallbackSurface('cash_reconciliation_failed');
        } else {
            cashOnHand = deepFreeze({ mode: 'canonical', ready: true, reason: 'ready' });
        }

        let marketKpi;
        if (!historyReady) {
            marketKpi = fallbackSurface('history_not_ready', { missingPriceCount });
        } else if (!currentBaseReady) {
            marketKpi = fallbackSurface('current_reconciliation_failed', { missingPriceCount });
        } else if (currentCanonical?.diagnostics?.safeForMarketCutover !== true
            || !finite(currentCanonical?.estimatedNetWorthMarketValue)) {
            marketKpi = deepFreeze({
                mode: 'unavailable',
                ready: false,
                reason: missingPriceCount > 0 ? 'missing_market_prices' : 'market_value_unavailable',
                missingPriceCount
            });
        } else {
            marketKpi = deepFreeze({
                mode: 'canonical',
                ready: true,
                reason: 'ready',
                missingPriceCount: 0
            });
        }

        const priorStatement = report?.priorStatement;
        const statementCanonical = priorStatement?.canonical;
        const statementComparison = priorStatement?.comparison;
        const statementReady = historyReady
            && !!priorStatement
            && baseDiagnosticsReady(statementCanonical?.diagnostics)
            && statementCanonical?.diagnostics?.safeForBookCutover === true
            && finite(statementCanonical?.estimatedNetWorthBookValue)
            && comparisonReady(statementComparison);
        let bookStatement;
        if (!historyReady) {
            bookStatement = fallbackSurface('history_not_ready');
        } else if (!priorStatement) {
            bookStatement = fallbackSurface('statement_reconciliation_unavailable');
        } else if (!statementReady) {
            bookStatement = fallbackSurface('statement_reconciliation_failed');
        } else {
            bookStatement = deepFreeze({ mode: 'canonical', ready: true, reason: 'ready' });
        }

        return deepFreeze({
            cashOnHand,
            marketKpi,
            bookStatement,
            readyForOverviewCutover: cashOnHand.ready && marketKpi.ready,
            readyForVisibleCutover: marketKpi.ready && bookStatement.ready
        });
    }

    function buildFinanceCashOnHandView(report, legacy = {}) {
        const cutover = assessFinanceSnapshotCutover(report);
        const surface = cutover.cashOnHand;
        const canonical = report?.current?.canonical;

        if (surface.mode === 'canonical') {
            return deepFreeze({
                mode: 'canonical',
                basis: 'tracked_cash',
                value: Number(canonical.trackedCash),
                asOf: canonical.asOf || null,
                reason: 'ready',
                verifiedBankBalance: false
            });
        }

        return deepFreeze({
            mode: 'legacy',
            basis: 'tracked_cash',
            value: finite(legacy.cash) ? Number(legacy.cash) : null,
            asOf: legacy.asOf || canonical?.asOf || null,
            reason: surface.reason,
            verifiedBankBalance: false
        });
    }

    function buildFinanceMarketNetWorthView(report, legacy = {}) {
        const cutover = assessFinanceSnapshotCutover(report);
        const surface = cutover.marketKpi;
        const canonical = report?.current?.canonical;

        if (surface.mode === 'canonical') {
            return deepFreeze({
                mode: 'canonical',
                basis: 'market',
                value: Number(canonical.estimatedNetWorthMarketValue),
                cash: Number(canonical.trackedCash),
                receivables: Number(canonical.receivables),
                fixedAssets: Number(canonical.fixedAssets?.netBookValue || 0),
                crypto: Number(canonical.crypto?.marketValue),
                liabilities: Number(canonical.liabilities?.total || 0),
                asOf: canonical.asOf || null,
                reason: 'ready',
                missingPriceCount: 0
            });
        }

        if (surface.mode === 'unavailable') {
            return deepFreeze({
                mode: 'unavailable',
                basis: 'market',
                value: null,
                asOf: canonical?.asOf || null,
                reason: surface.reason,
                missingPriceCount: surface.missingPriceCount
            });
        }

        return deepFreeze({
            mode: 'legacy',
            basis: 'legacy',
            value: finite(legacy.netWorth) ? Number(legacy.netWorth) : null,
            cash: Number(legacy.cash || 0),
            receivables: Number(legacy.receivables || 0),
            fixedAssets: 0,
            crypto: Number(legacy.crypto || 0),
            liabilities: Number(legacy.liabilities || 0),
            asOf: legacy.asOf || null,
            reason: surface.reason,
            missingPriceCount: surface.missingPriceCount || 0
        });
    }

    function resolveFinanceStatementBookPosition(balanceSheet = {}, report = null) {
        const source = balanceSheet && typeof balanceSheet === 'object' ? balanceSheet : {};
        const cutover = assessFinanceSnapshotCutover(report);
        const canonicalSource = ['canonical_book', 'canonical_shadow'].includes(String(source.positionSource || ''));
        const canonicalFieldsAvailable = canonicalSource
            && [
                source.cash,
                source.receivables,
                source.fixedAssets,
                source.cryptoBookValue,
                source.debt,
                source.creditCardDebt,
                source.installmentDebt,
                source.totalAssetsBookValue,
                source.totalLiabilities,
                source.netWorthBookValue
            ].every(finite);

        if (cutover.bookStatement.mode === 'canonical' && canonicalFieldsAvailable) {
            return deepFreeze({
                mode: 'canonical',
                basis: 'book',
                source: String(source.positionSource),
                cash: Number(source.cash),
                receivables: Number(source.receivables),
                fixedAssets: Number(source.fixedAssets),
                cryptoBookValue: Number(source.cryptoBookValue),
                debt: Number(source.debt),
                creditCardDebt: Number(source.creditCardDebt),
                installmentDebt: Number(source.installmentDebt),
                totalAssetsBookValue: Number(source.totalAssetsBookValue),
                totalLiabilities: Number(source.totalLiabilities),
                netWorthBookValue: Number(source.netWorthBookValue),
                reason: 'ready'
            });
        }

        return deepFreeze({
            mode: 'legacy',
            basis: 'book',
            source: String(source.positionSource || 'legacy_compatible'),
            cash: Number(source.cash || 0),
            receivables: Number(source.receivables || 0),
            fixedAssets: 0,
            cryptoBookValue: Number(source.crypto || 0),
            debt: Number(source.debt || 0),
            creditCardDebt: Number(source.creditCardDebt || 0),
            installmentDebt: Number(source.installmentDebt || 0),
            totalAssetsBookValue: Number(source.totalAssets || 0),
            totalLiabilities: Number(source.totalLiabilities || 0),
            netWorthBookValue: Number(source.netWorth || 0),
            reason: cutover.bookStatement.mode === 'canonical'
                ? 'legacy_snapshot'
                : cutover.bookStatement.reason
        });
    }

    function validate() {
        const errors = [];
        const unavailable = assessFinanceSnapshotCutover({
            history: { ready: true },
            valuation: { missingPriceCount: 2 },
            current: {
                canonical: {
                    trackedCash: 100,
                    diagnostics: {
                        safeForShadowComparison: true,
                        safeForMarketCutover: false,
                        missingLiabilityStartDateCount: 0,
                        fixedAssetMissingDateCount: 0
                    },
                    estimatedNetWorthMarketValue: null
                },
                comparison: { invariantFailures: [], reviewDifferences: [] }
            },
            priorStatement: {
                canonical: {
                    estimatedNetWorthBookValue: 100,
                    diagnostics: {
                        safeForShadowComparison: true,
                        safeForBookCutover: true,
                        missingLiabilityStartDateCount: 0,
                        fixedAssetMissingDateCount: 0
                    }
                },
                comparison: { invariantFailures: [], reviewDifferences: [] }
            }
        });
        if (unavailable.marketKpi.mode !== 'unavailable') errors.push('Market-unavailable gate failed.');
        if (unavailable.cashOnHand.mode !== 'canonical') errors.push('Independent cash gate failed.');
        if (unavailable.bookStatement.mode !== 'canonical') errors.push('Independent book gate failed.');
        return deepFreeze({ valid: errors.length === 0, errors, version: VERSION });
    }

    return deepFreeze({
        VERSION,
        assessFinanceSnapshotCutover,
        buildFinanceCashOnHandView,
        buildFinanceMarketNetWorthView,
        resolveFinanceStatementBookPosition,
        validate
    });
});
