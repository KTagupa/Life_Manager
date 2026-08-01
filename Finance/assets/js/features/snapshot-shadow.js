// =============================================
// PHASE 2D-B2: SNAPSHOT RECONCILIATION + PER-SURFACE CUTOVER
// =============================================

(function exposeFinanceSnapshotShadow(root) {
    const VERSION = '1.2.0';
    let refreshSequence = 0;
    let refreshTimer = null;
    let historyRefreshTimer = null;

    function monthKey(date) {
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    }

    function previousMonthEnd(reference = new Date()) {
        return new Date(reference.getFullYear(), reference.getMonth(), 0, 23, 59, 59, 999);
    }

    function getFixedAssets() {
        return Array.isArray(root.allFinanceFixedAssets) ? root.allFinanceFixedAssets : [];
    }

    function freezeRecords(records) {
        return Object.freeze((records || []).map(record => Object.freeze({ ...record })));
    }

    async function decryptHistoricalCollection(items, kind) {
        let failureCount = 0;
        const records = (await Promise.all((Array.isArray(items) ? items : []).map(async item => {
            try {
                const data = item?.data != null && typeof root.decryptData === 'function'
                    ? await root.decryptData(item.data)
                    : item;
                if (!data || typeof data !== 'object') {
                    failureCount += 1;
                    return null;
                }
                const createdAt = item?.createdAt || data.createdAt || null;
                return {
                    ...data,
                    id: item?.id || data.id || null,
                    createdAt,
                    dateAdded: kind === 'debts'
                        ? (data.borrowDate || data.dateAdded || data.addedAt || createdAt || null)
                        : (data.dateAdded || null),
                    lastModified: item?.lastModified || data.lastModified || 0,
                    deletedAt: item?.deletedAt || data.deletedAt || null
                };
            } catch (_) {
                failureCount += 1;
                return null;
            }
        }))).filter(Boolean);
        return { records: freezeRecords(records), failureCount };
    }

    async function hydrateFinanceSnapshotHistory(db) {
        if (!db || typeof db !== 'object') return null;
        const [debts, creditCards, installmentPlans, lent] = await Promise.all([
            decryptHistoricalCollection(db.debts, 'debts'),
            decryptHistoricalCollection(db.credit_cards, 'creditCards'),
            decryptHistoricalCollection(db.installment_plans, 'installmentPlans'),
            decryptHistoricalCollection(db.lent, 'lent')
        ]);
        const fixedAssets = freezeRecords(Array.isArray(db.fixed_assets) ? db.fixed_assets : []);
        root.allFinanceFixedAssets = fixedAssets;
        const decryptFailureCount = debts.failureCount
            + creditCards.failureCount
            + installmentPlans.failureCount
            + lent.failureCount;
        const history = Object.freeze({
            generatedAt: new Date().toISOString(),
            debts: debts.records,
            creditCards: creditCards.records,
            installmentPlans: installmentPlans.records,
            lent: lent.records,
            fixedAssets,
            decryptFailureCount
        });
        root.financeSnapshotHistoricalRecords = history;
        scheduleFinanceSnapshotShadowRefresh();
        return history;
    }

    async function refreshFinanceSnapshotHistoryFromStorage() {
        if (typeof root.getDB !== 'function') return null;
        return hydrateFinanceSnapshotHistory(await root.getDB());
    }

    function scheduleFinanceSnapshotHistoryRefresh(delay = 75) {
        if (historyRefreshTimer) root.clearTimeout(historyRefreshTimer);
        historyRefreshTimer = root.setTimeout(() => {
            historyRefreshTimer = null;
            refreshFinanceSnapshotHistoryFromStorage().catch(error => {
                console.warn('[finance-snapshot-shadow] Historical record refresh failed.', error);
            });
        }, Math.max(0, Number(delay) || 0));
    }

    function getHistoricalRecords(key, fallback) {
        const records = root.financeSnapshotHistoricalRecords?.[key];
        return Array.isArray(records) ? records : (Array.isArray(fallback) ? fallback : []);
    }

    async function getCurrentCryptoValuation() {
        if (typeof root.calculateHoldings !== 'function') {
            return {
                bookValue: null,
                marketValue: null,
                marketStatus: 'unavailable_engine',
                missingPriceCount: 0,
                holdingCount: 0
            };
        }
        const holdings = await root.calculateHoldings('fifo');
        let bookValue = 0;
        let marketValue = 0;
        let missingPriceCount = 0;
        let holdingCount = 0;
        Object.entries(holdings || {}).forEach(([tokenId, holding]) => {
            const amount = Number(holding?.amount || 0);
            if (!Number.isFinite(amount) || amount <= 0.000001) return;
            holdingCount += 1;
            bookValue += Math.max(0, Number(holding?.totalCost || 0));
            const price = Number(root.cryptoPrices?.[tokenId]?.price || 0);
            if (Number.isFinite(price) && price > 0) marketValue += amount * price;
            else missingPriceCount += 1;
        });
        return {
            bookValue,
            marketValue: missingPriceCount === 0 ? marketValue : null,
            marketStatus: missingPriceCount > 0
                ? 'unavailable_missing_prices'
                : (holdingCount > 0 ? 'available' : 'available_empty'),
            missingPriceCount,
            holdingCount
        };
    }

    function buildSnapshotInput(cryptoValuation) {
        return {
            transactions: Array.isArray(root.allDecryptedTransactions) ? root.allDecryptedTransactions : [],
            lent: getHistoricalRecords('lent', root.allDecryptedLent),
            debts: getHistoricalRecords('debts', root.allDecryptedDebts),
            creditCards: getHistoricalRecords('creditCards', root.allDecryptedCreditCards),
            installmentPlans: getHistoricalRecords('installmentPlans', root.allDecryptedInstallmentPlans),
            fixedAssets: getFixedAssets(),
            cryptoBookValue: cryptoValuation?.bookValue,
            cryptoMarketValue: cryptoValuation?.marketValue,
            cryptoMarketPriceMissingCount: cryptoValuation?.missingPriceCount || 0,
            openingCash: root.financeOpeningCashBalance != null
                && Number.isFinite(Number(root.financeOpeningCashBalance))
                ? Number(root.financeOpeningCashBalance)
                : undefined
        };
    }

    async function buildLegacyKpiSnapshot(asOfTs) {
        const transactions = Array.isArray(root.allDecryptedTransactions) ? root.allDecryptedTransactions : [];
        const cash = typeof root.computeCurrentBalance === 'function'
            ? root.computeCurrentBalance(transactions)
            : null;
        const receivables = typeof root.computeLentOutstandingAsOf === 'function'
            ? root.computeLentOutstandingAsOf(asOfTs, transactions)
            : null;
        const debt = typeof root.computeDebtOutstandingAsOf === 'function'
            ? root.computeDebtOutstandingAsOf(asOfTs, transactions)
            : null;
        const creditCardDebt = typeof root.computeCreditCardOutstandingAsOf === 'function'
            ? root.computeCreditCardOutstandingAsOf(asOfTs, transactions)
            : null;
        const installmentDebt = typeof root.computeInstallmentOutstandingAsOf === 'function'
            ? root.computeInstallmentOutstandingAsOf(asOfTs, transactions)
            : null;
        const crypto = typeof root.computeCryptoPortfolioValue === 'function'
            ? await root.computeCryptoPortfolioValue()
            : null;
        const totalLiabilities = [debt, creditCardDebt, installmentDebt]
            .reduce((sum, value) => sum + (Number(value) || 0), 0);
        const netWorth = [cash, receivables, crypto]
            .reduce((sum, value) => sum + (Number(value) || 0), 0) - totalLiabilities;
        return Object.freeze({
            source: 'legacy_kpi',
            cash,
            receivables,
            fixedAssets: 0,
            crypto,
            debt,
            creditCardDebt,
            installmentDebt,
            totalLiabilities,
            netWorth
        });
    }

    async function buildStatementShadow(baseInput, now) {
        if (typeof root.computeStatementForMonth !== 'function'
            || typeof root.statementsComputeCryptoPositionAsOf !== 'function') {
            return null;
        }
        const asOfDate = previousMonthEnd(now);
        const key = monthKey(asOfDate);
        const [statement, cryptoPosition] = await Promise.all([
            root.computeStatementForMonth(key),
            root.statementsComputeCryptoPositionAsOf(asOfDate.getTime(), key)
        ]);
        if (!statement?.balanceSheet) return null;
        const canonical = root.computeCanonicalFinanceSnapshot({
            ...baseInput,
            cryptoBookValue: Number(cryptoPosition?.bookValue || 0),
            cryptoMarketValue: null,
            cryptoMarketPriceMissingCount: 0
        }, { asOf: asOfDate.getTime() });
        const legacy = Object.freeze({
            source: 'legacy_statement',
            positionSource: String(statement.balanceSheet.positionSource || 'legacy_compatible'),
            snapshotSchemaVersion: Number(statement.snapshotSchemaVersion || 1),
            cash: Number(statement.balanceSheet.cash || 0),
            receivables: Number(statement.balanceSheet.receivables || 0),
            fixedAssets: 0,
            crypto: Number(statement.balanceSheet.crypto || 0),
            debt: Number(statement.balanceSheet.debt || 0),
            creditCardDebt: Number(statement.balanceSheet.creditCardDebt || 0),
            installmentDebt: Number(statement.balanceSheet.installmentDebt || 0),
            totalLiabilities: Number(statement.balanceSheet.totalLiabilities || 0),
            netWorth: Number(statement.balanceSheet.netWorth || 0)
        });
        const comparison = root.compareCanonicalFinanceSnapshot(canonical, legacy, { variant: 'book' });
        return Object.freeze({ month: key, asOf: asOfDate.toISOString(), canonical, legacy, comparison });
    }

    async function refreshFinanceSnapshotShadow() {
        if (typeof root.computeCanonicalFinanceSnapshot !== 'function'
            || typeof root.compareCanonicalFinanceSnapshot !== 'function') return null;

        const sequence = ++refreshSequence;
        try {
            const now = new Date();
            const cryptoValuation = await getCurrentCryptoValuation();
            const input = buildSnapshotInput(cryptoValuation);
            const currentCanonical = root.computeCanonicalFinanceSnapshot(input, { asOf: now.getTime() });
            const currentLegacy = await buildLegacyKpiSnapshot(now.getTime());
            const currentComparison = root.compareCanonicalFinanceSnapshot(
                currentCanonical,
                currentLegacy,
                { variant: 'market' }
            );
            const statement = await buildStatementShadow(input, now);
            if (sequence !== refreshSequence) return root.financeSnapshotShadowReport || null;

            const currentReady = currentComparison.readyForVisibleCutover === true;
            const statementReady = statement == null || (
                statement.canonical.diagnostics.safeForShadowComparison === true
                && statement.comparison.invariantFailures.length === 0
                && statement.comparison.reviewDifferences.length === 0
            );
            const historicalRecords = root.financeSnapshotHistoricalRecords;
            const historyCollections = ['debts', 'creditCards', 'installmentPlans', 'lent'];
            const historyRecordCount = historyCollections.reduce(
                (sum, key) => sum + (historicalRecords?.[key]?.length || 0),
                0
            );
            const historyDeletedRecordCount = historyCollections.reduce(
                (sum, key) => sum + (historicalRecords?.[key] || []).filter(record => !!record.deletedAt).length,
                0
            );
            const historyReady = !!historicalRecords
                && Number(historicalRecords.decryptFailureCount || 0) === 0;
            const reportBase = {
                shadowVersion: VERSION,
                engineVersion: root.FINANCE_CANONICAL_SNAPSHOT_VERSION || null,
                generatedAt: new Date().toISOString(),
                valuation: Object.freeze({ ...cryptoValuation }),
                history: Object.freeze({
                    available: !!root.financeSnapshotHistoricalRecords,
                    ready: historyReady,
                    recordCount: historyRecordCount,
                    deletedRecordCount: historyDeletedRecordCount,
                    decryptFailureCount: Number(root.financeSnapshotHistoricalRecords?.decryptFailureCount || 0)
                }),
                current: Object.freeze({
                    canonical: currentCanonical,
                    legacy: currentLegacy,
                    comparison: currentComparison
                }),
                priorStatement: statement
            };
            const surfaces = typeof root.assessFinanceSnapshotCutover === 'function'
                ? root.assessFinanceSnapshotCutover(reportBase)
                : Object.freeze({
                    marketKpi: Object.freeze({ mode: currentReady && historyReady ? 'canonical' : 'legacy' }),
                    bookStatement: Object.freeze({ mode: statementReady && historyReady ? 'canonical' : 'legacy' }),
                    readyForVisibleCutover: currentReady && statementReady && historyReady
                });
            const report = Object.freeze({
                ...reportBase,
                surfaces,
                readyForVisibleCutover: surfaces.readyForVisibleCutover === true
            });
            root.financeSnapshotShadowReport = report;

            const documentRoot = root.document?.documentElement;
            if (documentRoot) {
                documentRoot.dataset.financeSnapshotShadow = report.readyForVisibleCutover ? 'ready' : 'review';
                documentRoot.dataset.financeSnapshotMarketCutover = surfaces.marketKpi?.mode || 'legacy';
                documentRoot.dataset.financeSnapshotBookCutover = surfaces.bookStatement?.mode || 'legacy';
                documentRoot.dataset.financeSnapshotCashFailures = String(currentComparison.invariantFailures.length);
                documentRoot.dataset.financeSnapshotReviewDifferences = String(currentComparison.reviewDifferences.length);
                documentRoot.dataset.financeSnapshotReviewFields = currentComparison.reviewDifferences
                    .map(item => item.canonicalPath)
                    .join(',');
                documentRoot.dataset.financeSnapshotCurrentStatus = currentComparison.status;
                documentRoot.dataset.financeSnapshotPriorStatus = statement?.comparison?.status || 'unavailable';
                documentRoot.dataset.financeSnapshotPriorReviewFields = (statement?.comparison?.reviewDifferences || [])
                    .map(item => item.canonicalPath)
                    .join(',');
                documentRoot.dataset.financeSnapshotFixedAssets = String(currentCanonical.fixedAssets.assetCount);
                documentRoot.dataset.financeSnapshotMissingMarketPrices = String(cryptoValuation.missingPriceCount);
                documentRoot.dataset.financeSnapshotMarketState = cryptoValuation.marketStatus;
                documentRoot.dataset.financeSnapshotHistoryFailures = String(
                    root.financeSnapshotHistoricalRecords?.decryptFailureCount || 0
                );
                documentRoot.dataset.financeSnapshotHistoryRecords = String(historyRecordCount);
                documentRoot.dataset.financeSnapshotHistoryDeleted = String(historyDeletedRecordCount);
                documentRoot.dataset.financeStatementSnapshotSchema = String(
                    root.FINANCE_STATEMENT_SNAPSHOT_SCHEMA_VERSION || 1
                );
                documentRoot.dataset.financeStatementPositionSource = String(
                    statement?.legacy?.positionSource
                    || (statement?.canonical?.engineVersion ? 'canonical_shadow' : '')
                    || 'unavailable'
                );
            }

            try {
                root.dispatchEvent(new CustomEvent('finance:snapshot-shadow-updated', {
                    detail: {
                        report,
                        readyForVisibleCutover: report.readyForVisibleCutover,
                        marketKpiMode: surfaces.marketKpi?.mode || 'legacy',
                        bookStatementMode: surfaces.bookStatement?.mode || 'legacy',
                        cashInvariantFailureCount: currentComparison.invariantFailures.length,
                        reviewDifferenceCount: currentComparison.reviewDifferences.length
                    }
                }));
            } catch (_) { }

            if (root.DEBUG_FINANCE_SNAPSHOT_SHADOW === true) {
                console.info('[finance-snapshot-shadow] Snapshot report updated.', report);
            }
            return report;
        } catch (error) {
            if (sequence === refreshSequence) {
                console.warn('[finance-snapshot-shadow] Snapshot refresh failed.', error);
                const documentRoot = root.document?.documentElement;
                if (documentRoot) documentRoot.dataset.financeSnapshotShadow = 'error';
            }
            return null;
        }
    }

    function scheduleFinanceSnapshotShadowRefresh(delay = 75) {
        if (refreshTimer) root.clearTimeout(refreshTimer);
        refreshTimer = root.setTimeout(() => {
            refreshTimer = null;
            refreshFinanceSnapshotShadow();
        }, Math.max(0, Number(delay) || 0));
    }

    function getFinanceSnapshotShadowReport() {
        return root.financeSnapshotShadowReport || null;
    }

    function initFinanceSnapshotShadow() {
        scheduleFinanceSnapshotShadowRefresh(0);
    }

    root.FINANCE_SNAPSHOT_SHADOW_VERSION = VERSION;
    root.refreshFinanceSnapshotShadow = refreshFinanceSnapshotShadow;
    root.scheduleFinanceSnapshotShadowRefresh = scheduleFinanceSnapshotShadowRefresh;
    root.buildFinanceCanonicalSnapshotInput = buildSnapshotInput;
    root.hydrateFinanceSnapshotHistory = hydrateFinanceSnapshotHistory;
    root.refreshFinanceSnapshotHistoryFromStorage = refreshFinanceSnapshotHistoryFromStorage;
    root.scheduleFinanceSnapshotHistoryRefresh = scheduleFinanceSnapshotHistoryRefresh;
    root.getFinanceSnapshotShadowReport = getFinanceSnapshotShadowReport;
    root.initFinanceSnapshotShadow = initFinanceSnapshotShadow;
})(typeof window !== 'undefined' ? window : globalThis);
