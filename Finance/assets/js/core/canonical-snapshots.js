// =============================================
// PHASE 2E-B: CANONICAL SNAPSHOT PRINCIPAL RECONCILIATION
// =============================================
// Pure as-of calculations. This module does not render or persist anything.

(function exposeCanonicalFinanceSnapshots(root, factory) {
    const canonicalMetrics = typeof module === 'object' && module.exports
        ? require('./canonical-metrics.js')
        : root;
    const dateQuality = typeof module === 'object' && module.exports
        ? require('./date-quality.js')
        : root;
    const api = factory(canonicalMetrics, dateQuality);

    if (root) {
        root.FINANCE_CANONICAL_SNAPSHOT_VERSION = api.VERSION;
        root.computeCanonicalFinanceSnapshot = api.computeCanonicalFinanceSnapshot;
        root.computeFinanceFixedAssetBookValue = api.computeFinanceFixedAssetBookValue;
        root.compareCanonicalFinanceSnapshot = api.compareCanonicalFinanceSnapshot;
        root.validateCanonicalFinanceSnapshots = api.validate;
    }

    if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis, function buildCanonicalFinanceSnapshots(canonicalMetrics, dateQuality) {
    const VERSION = '1.3.0';
    const computeCanonicalMetrics = canonicalMetrics?.computeCanonicalFinanceMetrics;
    const buildClassificationContext = canonicalMetrics?.buildFinanceClassificationContext;
    const isDateUsable = dateQuality?.isFinanceTransactionDateUsable;

    if (typeof computeCanonicalMetrics !== 'function' || typeof buildClassificationContext !== 'function') {
        throw new Error('Canonical metric dependencies are unavailable.');
    }

    function deepFreeze(value) {
        if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
        Object.getOwnPropertyNames(value).forEach(key => deepFreeze(value[key]));
        return Object.freeze(value);
    }

    function text(value) {
        return String(value ?? '').trim();
    }

    function token(value) {
        return text(value).toLowerCase().replace(/\s+/g, ' ');
    }

    function positive(value) {
        const number = Number(value);
        return Number.isFinite(number) && number > 0 ? number : 0;
    }

    function nullablePositive(value) {
        if (value == null || value === '') return null;
        const number = Number(value);
        return Number.isFinite(number) && number >= 0 ? number : null;
    }

    function timestamp(value) {
        if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.getTime() : NaN;
        if (typeof value === 'number') {
            if (!Number.isFinite(value)) return NaN;
            return value > 0 && value < 100000000000 ? value * 1000 : value;
        }
        const raw = text(value);
        if (!raw) return NaN;
        if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
            const [year, month, day] = raw.split('-').map(Number);
            const parsed = Date.UTC(year, month - 1, day, 23, 59, 59, 999);
            const check = new Date(parsed);
            return check.getUTCFullYear() === year
                && check.getUTCMonth() === month - 1
                && check.getUTCDate() === day
                ? parsed
                : NaN;
        }
        return Date.parse(raw);
    }

    function resolveAsOf(value) {
        const parsed = timestamp(value ?? Date.now());
        if (!Number.isFinite(parsed)) throw new Error('Snapshot as-of date is invalid.');
        return parsed;
    }

    function txTimestamp(transaction) {
        const cached = Number(transaction?._dateTs);
        if (Number.isFinite(cached)) return cached;
        return timestamp(transaction?.date);
    }

    function recordStartTimestamp(record) {
        const values = [
            record?.borrowDate,
            record?.startDate,
            record?.purchaseDate,
            record?.dateAdded,
            record?.addedAt,
            record?.createdAt
        ];
        for (const value of values) {
            const parsed = timestamp(value);
            if (Number.isFinite(parsed)) return parsed;
        }
        return NaN;
    }

    function isActiveAsOf(record, asOfTs) {
        const startTs = recordStartTimestamp(record);
        if (Number.isFinite(startTs) && startTs > asOfTs) return false;
        const deletedTs = timestamp(record?.deletedAt);
        return !Number.isFinite(deletedTs) || deletedTs > asOfTs;
    }

    function wholeCalendarMonths(startTs, endTs) {
        if (!Number.isFinite(startTs) || !Number.isFinite(endTs) || endTs < startTs) return 0;
        const start = new Date(startTs);
        const end = new Date(endTs);
        let months = (end.getUTCFullYear() - start.getUTCFullYear()) * 12
            + (end.getUTCMonth() - start.getUTCMonth());
        if (end.getUTCDate() < start.getUTCDate()) months -= 1;
        return Math.max(0, months);
    }

    function computeFinanceFixedAssetBookValue(fixedAssets, asOf) {
        const asOfTs = resolveAsOf(asOf);
        const rows = [];
        let acquisitionCost = 0;
        let accumulatedDepreciation = 0;
        let netBookValue = 0;
        let missingDateCount = 0;

        (Array.isArray(fixedAssets) ? fixedAssets : []).forEach(asset => {
            if (!asset || !isActiveAsOf(asset, asOfTs)) return;
            const purchaseTs = timestamp(asset.purchaseDate || asset.createdAt);
            if (!Number.isFinite(purchaseTs) || purchaseTs > asOfTs) {
                if (!Number.isFinite(purchaseTs)) missingDateCount += 1;
                return;
            }
            const cost = positive(asset.value ?? asset.acquisitionCost);
            const lifespanMonths = Math.max(0, Math.round(Number(asset.lifespan ?? asset.lifespanMonths) || 0));
            if (cost <= 0 || lifespanMonths <= 0) return;

            const elapsedMonths = Math.min(lifespanMonths, wholeCalendarMonths(purchaseTs, asOfTs));
            const monthlyDepreciation = cost / lifespanMonths;
            const depreciation = Math.min(cost, elapsedMonths * monthlyDepreciation);
            const bookValue = Math.max(0, cost - depreciation);
            acquisitionCost += cost;
            accumulatedDepreciation += depreciation;
            netBookValue += bookValue;
            rows.push({
                id: text(asset.id),
                name: text(asset.name) || 'Unnamed asset',
                purchaseDate: new Date(purchaseTs).toISOString(),
                acquisitionCost: cost,
                lifespanMonths,
                elapsedMonths,
                monthlyDepreciation,
                accumulatedDepreciation: depreciation,
                netBookValue: bookValue
            });
        });

        return deepFreeze({
            acquisitionCost,
            accumulatedDepreciation,
            netBookValue,
            assetCount: rows.length,
            missingDateCount,
            assets: rows
        });
    }

    function buildUniqueCategoryOwners(records, nameBuilder) {
        const candidates = new Map();
        (records || []).forEach(record => {
            const id = text(record?.id);
            nameBuilder(record).map(token).filter(Boolean).forEach(name => {
                if (!candidates.has(name)) candidates.set(name, new Set());
                candidates.get(name).add(id || name);
            });
        });
        const owners = new Map();
        candidates.forEach((ids, name) => {
            if (ids.size === 1) owners.set(name, [...ids][0]);
        });
        return owners;
    }

    function debtNames(debt) {
        const name = text(debt?.name);
        return name ? [name, `Debt to pay: ${name}`] : [];
    }

    function lentNames(entry) {
        const name = text(entry?.name);
        return name ? [`Lent: ${name}`] : [];
    }

    function computeReceivablePositions(entries, transactions, classifications) {
        const lentEntries = (Array.isArray(entries) ? entries : []).filter(Boolean);
        const owners = buildUniqueCategoryOwners(lentEntries, lentNames);
        const positions = new Map();
        const recordKeyById = new Map();

        lentEntries.forEach((entry, index) => {
            const id = text(entry.id);
            const key = id ? `id:${id}` : `record:${index}`;
            positions.set(key, {
                id,
                name: text(entry.name) || 'Unnamed receivable',
                advances: 0,
                repayments: 0,
                rawOutstanding: 0,
                transactionCount: 0,
                trackedRecord: true
            });
            if (id) recordKeyById.set(id, key);
            lentNames(entry).map(token).forEach(category => {
                if (owners.get(category) === (id || category)) owners.set(category, key);
            });
        });

        transactions.forEach((transaction, index) => {
            const delta = Number(classifications?.[index]?.receivableDelta || 0);
            if (!Number.isFinite(delta) || Math.abs(delta) <= 0.000001) return;
            const lentId = text(transaction?.lentId);
            const category = token(transaction?.category);
            let key = (lentId && recordKeyById.get(lentId)) || owners.get(category);
            if (!key) key = lentId ? `untracked-id:${lentId}` : `untracked-category:${category || index}`;
            if (!positions.has(key)) {
                positions.set(key, {
                    id: lentId,
                    name: text(transaction?.category).replace(/^Lent:\s*/i, '') || 'Untracked receivable',
                    advances: 0,
                    repayments: 0,
                    rawOutstanding: 0,
                    transactionCount: 0,
                    trackedRecord: false
                });
            }
            const position = positions.get(key);
            position.rawOutstanding += delta;
            position.transactionCount += 1;
            if (delta > 0) position.advances += delta;
            else position.repayments += Math.abs(delta);
        });

        const rows = [...positions.values()].map(position => ({
            ...position,
            outstanding: Math.max(0, position.rawOutstanding),
            overpayment: Math.max(0, -position.rawOutstanding)
        }));
        return deepFreeze({
            total: rows.reduce((sum, row) => sum + row.outstanding, 0),
            rawTotal: rows.reduce((sum, row) => sum + row.rawOutstanding, 0),
            overpayment: rows.reduce((sum, row) => sum + row.overpayment, 0),
            count: rows.filter(row => row.outstanding > 0.000001).length,
            untrackedPositionCount: rows.filter(row => !row.trackedRecord && row.transactionCount > 0).length,
            positions: rows
        });
    }

    function computeDebtLiabilities(debts, transactions, classifications, asOfTs) {
        const activeDebts = (Array.isArray(debts) ? debts : []).filter(debt => debt && isActiveAsOf(debt, asOfTs));
        const owners = buildUniqueCategoryOwners(activeDebts, debtNames);
        const rows = activeDebts.map(debt => {
            const id = text(debt.id);
            const categories = new Set(debtNames(debt).map(token));
            const effectiveTs = recordStartTimestamp(debt);
            let borrowedAfterOpening = 0;
            let repayments = 0;
            let cashRepayments = 0;
            let fullPaymentRepayments = 0;
            let financeChargesPaid = 0;
            let linkedTransactionCount = 0;

            transactions.forEach((transaction, index) => {
                const transactionTs = txTimestamp(transaction);
                if (!Number.isFinite(transactionTs) || transactionTs > asOfTs) return;
                const transactionDebtId = text(transaction?.debtId);
                const categoryKey = token(transaction?.category);
                const linkedById = id && transactionDebtId === id;
                const linkedByCategory = !transactionDebtId
                    && categories.has(categoryKey)
                    && owners.get(categoryKey) === (id || categoryKey);
                if (!linkedById && !linkedByCategory) return;
                linkedTransactionCount += 1;

                if (transaction.type === 'debt_increase') {
                    if (transaction.debtPrincipalSeed === true) return;
                    // A debt record's base amount is its opening principal. Old
                    // mirror/source entries at or before that opening are seeds.
                    if (Number.isFinite(effectiveTs) && transactionTs <= effectiveTs) return;
                    borrowedAfterOpening += positive(transaction.amt);
                    return;
                }
                if (transaction.type === 'expense') {
                    const classification = classifications?.[index] || {};
                    const paymentAmount = positive(transaction.amt);
                    fullPaymentRepayments += paymentAmount;
                    cashRepayments += Math.max(0, -Number(classification.cashDelta || 0));
                    repayments += positive(classification.settlementDelta);
                    financeChargesPaid += positive(classification.financeChargeConsumptionDelta);
                }
            });

            const openingPrincipal = positive(debt.amount);
            const outstanding = Math.max(0, openingPrincipal + borrowedAfterOpening - repayments);
            const legacyFullPaymentOutstanding = Math.max(
                0,
                openingPrincipal + borrowedAfterOpening - fullPaymentRepayments
            );
            return {
                id,
                name: text(debt.name) || 'Unnamed debt',
                openingPrincipal,
                borrowedAfterOpening,
                repayments,
                principalRepayments: repayments,
                cashRepayments,
                fullPaymentRepayments,
                financeChargesPaid,
                outstanding,
                legacyFullPaymentOutstanding,
                linkedTransactionCount,
                effectiveDateAvailable: Number.isFinite(effectiveTs)
            };
        });
        return deepFreeze({
            total: rows.reduce((sum, row) => sum + row.outstanding, 0),
            principalRepayments: rows.reduce((sum, row) => sum + row.principalRepayments, 0),
            cashRepayments: rows.reduce((sum, row) => sum + row.cashRepayments, 0),
            fullPaymentRepayments: rows.reduce((sum, row) => sum + row.fullPaymentRepayments, 0),
            financeChargesPaid: rows.reduce((sum, row) => sum + row.financeChargesPaid, 0),
            legacyFullPaymentTotal: rows.reduce((sum, row) => sum + row.legacyFullPaymentOutstanding, 0),
            count: rows.length,
            missingStartDateCount: rows.filter(row => !row.effectiveDateAvailable).length,
            debts: rows
        });
    }

    function computeCreditCardLiabilities(cards, transactions, asOfTs) {
        const activeCards = (Array.isArray(cards) ? cards : []).filter(card => card && isActiveAsOf(card, asOfTs));
        const rows = activeCards.map(card => {
            const id = text(card.id);
            let charges = 0;
            let payments = 0;
            let legacyOrderSensitiveOutstanding = positive(card.openingBalance);
            transactions.forEach(transaction => {
                const transactionTs = txTimestamp(transaction);
                if (!Number.isFinite(transactionTs) || transactionTs > asOfTs) return;
                if (text(transaction?.creditCardId) !== id) return;
                if (transaction.type === 'expense' && text(transaction.paymentSource).toLowerCase() === 'credit_card') {
                    const amount = positive(transaction.amt);
                    charges += amount;
                    legacyOrderSensitiveOutstanding += amount;
                } else if (transaction.type === 'credit_card_payment') {
                    const amount = positive(transaction.amt);
                    payments += amount;
                    legacyOrderSensitiveOutstanding = Math.max(0, legacyOrderSensitiveOutstanding - amount);
                }
            });
            const openingBalance = positive(card.openingBalance);
            return {
                id,
                name: text(card.name) || 'Unnamed card',
                openingBalance,
                charges,
                payments,
                outstanding: Math.max(0, openingBalance + charges - payments),
                legacyOrderSensitiveOutstanding,
                effectiveDateAvailable: Number.isFinite(recordStartTimestamp(card))
            };
        });
        return deepFreeze({
            total: rows.reduce((sum, row) => sum + row.outstanding, 0),
            legacyOrderSensitiveTotal: rows.reduce(
                (sum, row) => sum + row.legacyOrderSensitiveOutstanding,
                0
            ),
            count: rows.length,
            missingStartDateCount: rows.filter(row => !row.effectiveDateAvailable).length,
            cards: rows
        });
    }

    function computeInstallmentLiabilities(plans, transactions, classifications, asOfTs) {
        const activePlans = (Array.isArray(plans) ? plans : []).filter(plan => plan && isActiveAsOf(plan, asOfTs));
        const rows = activePlans.map(plan => {
            const id = text(plan.id);
            let transactionPayments = 0;
            let transactionPrincipalPayments = 0;
            let transactionFinanceCharges = 0;
            let historicalPayments = 0;
            let historicalPrincipalPayments = 0;
            let historicalFinanceCharges = 0;
            let missingFeeSplitPaymentCount = 0;
            const feeTotal = positive(plan.feeTotal ?? plan.totalFees);
            (Array.isArray(plan.historicalPayments) ? plan.historicalPayments : []).forEach(payment => {
                const paymentTs = timestamp(payment?.date || payment?.createdAt);
                if (!Number.isFinite(paymentTs) || paymentTs > asOfTs) return;
                const amount = positive(payment.amount);
                const hasFeeSplit = payment?.feeAmount != null || payment?.installmentFeeAmount != null;
                const financeCharge = Math.min(
                    amount,
                    positive(payment?.feeAmount ?? payment?.installmentFeeAmount)
                );
                historicalPayments += amount;
                historicalFinanceCharges += financeCharge;
                historicalPrincipalPayments += Math.max(0, amount - financeCharge);
                if (amount > 0 && feeTotal > 0 && !hasFeeSplit) missingFeeSplitPaymentCount += 1;
            });
            transactions.forEach((transaction, index) => {
                if (transaction.type !== 'installment_payment' || text(transaction.installmentPlanId) !== id) return;
                const transactionTs = txTimestamp(transaction);
                if (!Number.isFinite(transactionTs) || transactionTs > asOfTs) return;
                const amount = positive(transaction.amt);
                const classification = classifications?.[index] || {};
                transactionPayments += amount;
                transactionPrincipalPayments += positive(classification.settlementDelta);
                transactionFinanceCharges += positive(classification.financeChargeConsumptionDelta);
                if (amount > 0 && feeTotal > 0 && transaction?.installmentFeeAmount == null) {
                    missingFeeSplitPaymentCount += 1;
                }
            });
            const scheduledObligation = positive(plan.totalAmount);
            const openingPrincipal = Math.max(0, scheduledObligation - feeTotal);
            const contractualOutstanding = Math.max(
                0,
                scheduledObligation - historicalPayments - transactionPayments
            );
            const principalOutstanding = Math.max(
                0,
                openingPrincipal - historicalPrincipalPayments - transactionPrincipalPayments
            );
            const remainingFinanceCharges = Math.max(0, contractualOutstanding - principalOutstanding);
            return {
                id,
                name: text(plan.name) || 'Unnamed installment',
                scheduledObligation,
                openingPrincipal,
                feeTotal,
                historicalPayments,
                historicalPrincipalPayments,
                historicalFinanceCharges,
                transactionPayments,
                transactionPrincipalPayments,
                transactionFinanceCharges,
                principalOutstanding,
                remainingFinanceCharges,
                contractualOutstanding,
                // Compatibility alias: visible installment liabilities remain
                // the amount contractually payable, including remaining fees.
                outstanding: contractualOutstanding,
                missingFeeSplitPaymentCount,
                effectiveDateAvailable: Number.isFinite(recordStartTimestamp(plan))
            };
        });
        return deepFreeze({
            total: rows.reduce((sum, row) => sum + row.outstanding, 0),
            contractualTotal: rows.reduce((sum, row) => sum + row.contractualOutstanding, 0),
            principalTotal: rows.reduce((sum, row) => sum + row.principalOutstanding, 0),
            remainingFinanceChargeTotal: rows.reduce((sum, row) => sum + row.remainingFinanceCharges, 0),
            missingFeeSplitPaymentCount: rows.reduce((sum, row) => sum + row.missingFeeSplitPaymentCount, 0),
            count: rows.length,
            missingStartDateCount: rows.filter(row => !row.effectiveDateAvailable).length,
            plans: rows
        });
    }

    function computeCanonicalFinanceSnapshot(input = {}, options = {}) {
        const asOfTs = resolveAsOf(options.asOf ?? input.asOf ?? Date.now());
        const sourceTransactions = Array.isArray(input.transactions) ? input.transactions : [];
        const datedTransactions = sourceTransactions.filter(transaction => {
            if (typeof isDateUsable === 'function' && !isDateUsable(transaction)) return false;
            const value = txTimestamp(transaction);
            return Number.isFinite(value) && value <= asOfTs;
        });
        const excludedTransactionCount = sourceTransactions.length - datedTransactions.length;
        const debts = Array.isArray(input.debts) ? input.debts : [];
        const context = buildClassificationContext({
            debts,
            debtCategoryNames: debts.flatMap(debtNames),
            assetCategoryNames: input.assetCategoryNames,
            transferCategoryNames: input.transferCategoryNames,
            ...(options.context || input.context || {})
        });
        const flows = computeCanonicalMetrics(datedTransactions, { context });
        const openingCashSpecified = input.openingCash != null && Number.isFinite(Number(input.openingCash));
        const openingCash = openingCashSpecified ? Number(input.openingCash) : 0;
        const trackedCash = openingCash + Number(flows.netCashFlow || 0);
        const receivablePositions = computeReceivablePositions(
            input.lent,
            datedTransactions,
            flows.classifications
        );
        const receivables = receivablePositions.total;
        const debtLiabilities = computeDebtLiabilities(
            debts,
            datedTransactions,
            flows.classifications,
            asOfTs
        );
        const creditCardLiabilities = computeCreditCardLiabilities(input.creditCards, datedTransactions, asOfTs);
        const installmentLiabilities = computeInstallmentLiabilities(
            input.installmentPlans,
            datedTransactions,
            flows.classifications,
            asOfTs
        );
        const fixedAssets = computeFinanceFixedAssetBookValue(input.fixedAssets, asOfTs);
        const totalLiabilities = debtLiabilities.total + creditCardLiabilities.total + installmentLiabilities.total;
        const nonCryptoAssets = trackedCash + receivables + fixedAssets.netBookValue;
        const cryptoBookValue = nullablePositive(input.cryptoBookValue);
        const cryptoMarketValue = nullablePositive(input.cryptoMarketValue);
        const cryptoMarketPriceMissingCount = Math.max(0, Number(input.cryptoMarketPriceMissingCount || 0));
        const cryptoMarketValueStatus = cryptoMarketValue != null
            ? 'available'
            : (cryptoMarketPriceMissingCount > 0 ? 'unavailable_missing_prices' : 'unavailable');
        const totalAssetsBookValue = cryptoBookValue == null ? null : nonCryptoAssets + cryptoBookValue;
        const totalAssetsMarketValue = cryptoMarketValue == null ? null : nonCryptoAssets + cryptoMarketValue;
        const estimatedNetWorthBookValue = totalAssetsBookValue == null ? null : totalAssetsBookValue - totalLiabilities;
        const estimatedNetWorthMarketValue = totalAssetsMarketValue == null ? null : totalAssetsMarketValue - totalLiabilities;
        const missingStartDateCount = debtLiabilities.missingStartDateCount
            + creditCardLiabilities.missingStartDateCount
            + installmentLiabilities.missingStartDateCount;
        const baseCutoverSafe = flows.diagnostics?.safeForVisibleCutover === true
            && missingStartDateCount === 0
            && fixedAssets.missingDateCount === 0;
        const diagnostics = {
            sourceTransactionCount: sourceTransactions.length,
            includedTransactionCount: datedTransactions.length,
            excludedTransactionCount,
            classificationInvalidCount: Number(flows.diagnostics?.invalidCount || 0),
            classificationUnclassifiedCount: Number(flows.diagnostics?.unclassifiedCount || 0),
            missingLiabilityStartDateCount: missingStartDateCount,
            fixedAssetMissingDateCount: fixedAssets.missingDateCount,
            cryptoBookValueAvailable: cryptoBookValue != null,
            cryptoMarketValueAvailable: cryptoMarketValue != null,
            cryptoMarketValueStatus,
            openingCashSpecified,
            receivableOverpayment: receivablePositions.overpayment,
            debtFinanceChargesPaid: debtLiabilities.financeChargesPaid,
            installmentMissingFeeSplitPaymentCount: installmentLiabilities.missingFeeSplitPaymentCount,
            safeForShadowComparison: flows.diagnostics?.safeForVisibleCutover === true,
            safeForBookCutover: baseCutoverSafe && cryptoBookValue != null,
            safeForMarketCutover: baseCutoverSafe && cryptoMarketValue != null,
            // Compatibility aggregate for callers that require every valuation surface.
            safeForVisibleCutover: baseCutoverSafe
                && cryptoBookValue != null
                && cryptoMarketValue != null
        };

        return deepFreeze({
            engineVersion: VERSION,
            asOf: new Date(asOfTs).toISOString(),
            asOfTimestamp: asOfTs,
            contextFingerprint: context.fingerprint,
            openingCash,
            openingCashSource: openingCashSpecified ? 'provided' : 'assumed_zero',
            trackedCash,
            receivables,
            receivablePositions,
            fixedAssets,
            crypto: {
                bookValue: cryptoBookValue,
                marketValue: cryptoMarketValue,
                marketPriceMissingCount: cryptoMarketPriceMissingCount
            },
            liabilities: {
                debt: debtLiabilities,
                creditCards: creditCardLiabilities,
                installments: installmentLiabilities,
                total: totalLiabilities
            },
            totalAssetsBookValue,
            totalAssetsMarketValue,
            estimatedNetWorthBookValue,
            estimatedNetWorthMarketValue,
            flows,
            diagnostics
        });
    }

    function readPath(object, path) {
        return path.split('.').reduce((value, key) => value?.[key], object);
    }

    function compareCanonicalFinanceSnapshot(canonical, legacy, options = {}) {
        const tolerance = Math.max(0, Number(options.tolerance ?? 0.005));
        const variant = options.variant === 'book' ? 'book' : 'market';
        const legacyDebtValue = Number(readPath(legacy, 'debt'));
        const legacyFullPaymentDebtValue = Number(
            readPath(canonical, 'liabilities.debt.legacyFullPaymentTotal')
        );
        const knownLegacyDebtFinanceChargeDifference = Number.isFinite(legacyDebtValue)
            && Number.isFinite(legacyFullPaymentDebtValue)
            && Math.abs(legacyDebtValue - legacyFullPaymentDebtValue) <= tolerance;
        const legacyCardValue = Number(readPath(legacy, 'creditCardDebt'));
        const orderSensitiveCardValue = Number(
            readPath(canonical, 'liabilities.creditCards.legacyOrderSensitiveTotal')
        );
        const knownLegacyCardOrderDifference = Number.isFinite(legacyCardValue)
            && Number.isFinite(orderSensitiveCardValue)
            && Math.abs(legacyCardValue - orderSensitiveCardValue) <= tolerance;
        const definitions = [
            { canonicalPath: 'trackedCash', legacyPath: 'cash', invariant: true },
            { canonicalPath: 'receivables', legacyPath: 'receivables' },
            {
                canonicalPath: 'liabilities.debt.total',
                legacyPath: 'debt',
                expectedDifference: knownLegacyDebtFinanceChargeDifference,
                expectedDifferenceReason: knownLegacyDebtFinanceChargeDifference
                    ? 'legacy_full_payment_reduced_debt_principal'
                    : null
            },
            {
                canonicalPath: 'liabilities.creditCards.total',
                legacyPath: 'creditCardDebt',
                expectedDifference: knownLegacyCardOrderDifference,
                expectedDifferenceReason: knownLegacyCardOrderDifference
                    ? 'legacy_order_sensitive_card_balance'
                    : null
            },
            { canonicalPath: 'liabilities.installments.total', legacyPath: 'installmentDebt' },
            { canonicalPath: 'fixedAssets.netBookValue', legacyPath: 'fixedAssets', expectedDifference: true },
            {
                canonicalPath: variant === 'book' ? 'crypto.bookValue' : 'crypto.marketValue',
                legacyPath: 'crypto',
                expectedDifference: variant === 'market' && canonical?.crypto?.marketValue == null
            },
            {
                canonicalPath: variant === 'book' ? 'estimatedNetWorthBookValue' : 'estimatedNetWorthMarketValue',
                legacyPath: 'netWorth',
                expectedDifference: true
            }
        ];
        const comparisons = definitions.map(definition => {
            const canonicalValue = readPath(canonical, definition.canonicalPath);
            const legacyValue = readPath(legacy, definition.legacyPath);
            const comparable = Number.isFinite(canonicalValue) && Number.isFinite(legacyValue);
            const difference = comparable ? canonicalValue - legacyValue : null;
            return {
                ...definition,
                canonicalValue: canonicalValue ?? null,
                legacyValue: legacyValue ?? null,
                comparable,
                difference,
                matches: comparable ? Math.abs(difference) <= tolerance : canonicalValue === legacyValue
            };
        });
        const invariantFailures = comparisons.filter(item => item.invariant && !item.matches);
        const reviewDifferences = comparisons.filter(item => !item.matches && !item.invariant && !item.expectedDifference);
        const expectedDifferences = comparisons.filter(item => !item.matches && item.expectedDifference);
        const variantReady = variant === 'book'
            ? canonical?.diagnostics?.safeForBookCutover === true
            : canonical?.diagnostics?.safeForMarketCutover === true;
        return deepFreeze({
            variant,
            tolerance,
            status: invariantFailures.length
                ? 'invariant_failure'
                : (reviewDifferences.length ? 'review' : (expectedDifferences.length ? 'expected_differences' : 'aligned')),
            readyForVisibleCutover: variantReady
                && invariantFailures.length === 0
                && reviewDifferences.length === 0,
            comparisons,
            invariantFailures,
            reviewDifferences,
            expectedDifferences
        });
    }

    function validate() {
        const sample = computeCanonicalFinanceSnapshot({
            transactions: [
                { id: 'income', type: 'income', category: 'Salary', amt: 1000, date: '2026-01-10' },
                { id: 'spend', type: 'expense', category: 'Food', amt: 100, date: '2026-01-11' },
                { id: 'card-charge', type: 'expense', category: 'Gear', amt: 200, date: '2026-01-12', paymentSource: 'credit_card', creditCardId: 'card-1' }
            ],
            creditCards: [{ id: 'card-1', openingBalance: 50, createdAt: '2025-01-01' }],
            fixedAssets: [{ id: 'asset-1', name: 'Laptop', value: 1200, lifespan: 12, purchaseDate: '2025-07-31' }],
            cryptoBookValue: 300,
            cryptoMarketValue: 400,
            openingCash: 0
        }, { asOf: '2026-01-31' });
        const errors = [];
        if (sample.trackedCash !== 900) errors.push('Tracked cash invariant failed.');
        if (sample.liabilities.creditCards.total !== 250) errors.push('Credit-card liability invariant failed.');
        if (sample.fixedAssets.netBookValue !== 600) errors.push('Fixed-asset depreciation invariant failed.');
        if (sample.estimatedNetWorthMarketValue !== 1650) errors.push('Market net-worth invariant failed.');
        return deepFreeze({ valid: errors.length === 0, errors, version: VERSION });
    }

    return deepFreeze({
        VERSION,
        computeCanonicalFinanceSnapshot,
        computeFinanceFixedAssetBookValue,
        compareCanonicalFinanceSnapshot,
        validate
    });
});
