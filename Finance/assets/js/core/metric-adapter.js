// =============================================
// PHASE 2C-B: GATED CANONICAL METRIC CUTOVER
// =============================================

(function exposeFinanceMetricAdapter(root, factory) {
    const api = factory();

    if (root) {
        root.FINANCE_METRIC_ADAPTER_VERSION = api.VERSION;
        root.FINANCE_METRIC_PROVENANCE_SCHEMA_VERSION = api.PROVENANCE_SCHEMA_VERSION;
        root.isFinanceCanonicalCutoverReady = api.isFinanceCanonicalCutoverReady;
        root.buildCanonicalDisplayMetrics = api.buildCanonicalDisplayMetrics;
        root.buildLegacyDisplayMetrics = api.buildLegacyDisplayMetrics;
        root.createFinanceMetricProvenance = api.createFinanceMetricProvenance;
        root.getFinanceMetricProvenance = api.getFinanceMetricProvenance;
        root.formatFinanceMetricProvenance = api.formatFinanceMetricProvenance;
        root.buildFinanceConsumerBreakdown = api.buildFinanceConsumerBreakdown;
        root.formatFinanceSavingsRate = api.formatFinanceSavingsRate;

        if (typeof root.computeSummaryMetrics === 'function' && !root.computeLegacySummaryMetrics) {
            root.computeLegacySummaryMetrics = root.computeSummaryMetrics;
        }

        function getCutoverReport() {
            return typeof root.getFinanceMetricShadowReport === 'function'
                ? root.getFinanceMetricShadowReport()
                : (root.financeMetricShadowReport || null);
        }

        function getCutoverContext() {
            return typeof root.getRuntimeFinanceClassificationContext === 'function'
                ? root.getRuntimeFinanceClassificationContext()
                : {};
        }

        function useCanonicalMetrics() {
            return root.FINANCE_CANONICAL_METRICS_ENABLED !== false
                && api.isFinanceCanonicalCutoverReady(getCutoverReport());
        }

        function computeDisplaySummaryMetrics(allTransactions, scope, options = {}) {
            const legacy = root.computeLegacySummaryMetrics(allTransactions, scope, options);
            if (!useCanonicalMetrics() || typeof root.computeCanonicalFinanceMetrics !== 'function') {
                return api.buildLegacyDisplayMetrics(legacy, getCutoverReport());
            }

            const canonical = root.computeCanonicalFinanceMetrics(legacy.scopedTransactions || [], {
                context: getCutoverContext()
            });
            const cashInvariantMatches = Number.isFinite(Number(canonical.netCashFlow))
                && Number.isFinite(Number(legacy.balance))
                && Math.abs(Number(canonical.netCashFlow) - Number(legacy.balance)) <= 0.005;

            if (!canonical.diagnostics?.safeForVisibleCutover || !cashInvariantMatches) {
                return api.buildLegacyDisplayMetrics(legacy, getCutoverReport(), 'scope_reconciliation_failed');
            }

            return api.buildCanonicalDisplayMetrics(legacy, canonical);
        }

        function getDisplayClassification(transaction) {
            if (!useCanonicalMetrics() || typeof root.classifyFinanceTransaction !== 'function') return null;
            return root.classifyFinanceTransaction(transaction, getCutoverContext());
        }

        function getDisplayTxEarnedIncomeDelta(transaction) {
            const classification = getDisplayClassification(transaction);
            if (classification) return Number(classification.earnedIncomeDelta || 0);
            return typeof root.getTxReportedIncomeDelta === 'function'
                ? root.getTxReportedIncomeDelta(transaction)
                : (transaction?.type === 'income' ? Number(transaction?.amt || 0) : 0);
        }

        function getDisplayTxOtherCashInDelta(transaction) {
            const classification = getDisplayClassification(transaction);
            if (classification) return Number(classification.otherCashInDelta || 0);
            return typeof root.getTxNonIncomeCashInDelta === 'function'
                ? root.getTxNonIncomeCashInDelta(transaction)
                : 0;
        }

        function getDisplayTxSpendingDelta(transaction) {
            const classification = getDisplayClassification(transaction);
            if (classification) return Number(classification.consumptionDelta || 0);
            return typeof root.getTxExpenseDelta === 'function'
                ? root.getTxExpenseDelta(transaction)
                : (transaction?.type === 'expense' ? Number(transaction?.amt || 0) : 0);
        }

        function getDisplayTxCashDelta(transaction) {
            const classification = getDisplayClassification(transaction);
            if (classification) return Number(classification.cashDelta || 0);
            return typeof root.getTxCashBalanceDelta === 'function'
                ? root.getTxCashBalanceDelta(transaction)
                : 0;
        }

        function getDisplayTxSpendingCategory(transaction) {
            if (getDisplayClassification(transaction)) {
                return String(transaction?.category || '').trim() || 'Uncategorized';
            }
            return typeof root.getTxExpenseCategory === 'function'
                ? root.getTxExpenseCategory(transaction)
                : (String(transaction?.category || '').trim() || 'Uncategorized');
        }

        function refreshFinanceMetricCutoverUI(report = getCutoverReport()) {
            if (!root.document) return;
            const canonical = useCanonicalMetrics();
            const labels = canonical ? api.CANONICAL_LABELS : api.LEGACY_LABELS;
            const setText = (id, value) => {
                const element = root.document.getElementById(id);
                if (element) element.textContent = value;
            };

            setText('balance-label', labels.balance);
            setText('income-label', labels.income);
            setText('other-cash-in-label', labels.otherCashIn);
            setText('expense-label', labels.expense);
            setText('balance-calc-eyebrow', labels.balance);
            setText('balance-calc-title', canonical ? 'Cash Flow Calculation' : 'Legacy Cash Calculation');
            setText('balance-calc-income-label', labels.income);
            setText('balance-calc-other-cash-in-label', labels.otherCashIn);
            setText('balance-calc-expense-label', labels.expense);
            setText('balance-calc-total-label', labels.balance);

            if (root.document.body) {
                root.document.body.dataset.financeMetricEngine = canonical ? 'canonical' : 'legacy';
            }

            const banner = root.document.getElementById('finance-metric-fallback-banner');
            if (!banner) return;
            banner.classList.toggle('hidden', canonical);
            if (canonical) return;

            const diagnostics = report?.scopes?.all_time?.canonical?.diagnostics || {};
            const failures = Number(report?.invariantFailures?.length || 0);
            const reasons = [];
            if (Number(diagnostics.invalidCount || 0) > 0) reasons.push(`${diagnostics.invalidCount} invalid record(s)`);
            if (Number(diagnostics.unclassifiedCount || 0) > 0) reasons.push(`${diagnostics.unclassifiedCount} unclassified record(s)`);
            if (failures > 0) reasons.push(`${failures} cash reconciliation failure(s)`);
            setText('finance-metric-fallback-detail', reasons.length
                ? `${reasons.join(' • ')}. Legacy calculations remain active for this vault.`
                : 'Canonical reconciliation is not ready. Legacy calculations remain active for this vault.');
        }

        root.computeSummaryMetrics = computeDisplaySummaryMetrics;
        root.computeDisplaySummaryMetrics = computeDisplaySummaryMetrics;
        root.getDisplayTxEarnedIncomeDelta = getDisplayTxEarnedIncomeDelta;
        root.getDisplayTxOtherCashInDelta = getDisplayTxOtherCashInDelta;
        root.getDisplayTxSpendingDelta = getDisplayTxSpendingDelta;
        root.getDisplayTxCashDelta = getDisplayTxCashDelta;
        root.getDisplayTxSpendingCategory = getDisplayTxSpendingCategory;
        root.refreshFinanceMetricCutoverUI = refreshFinanceMetricCutoverUI;
        root.addEventListener?.('finance:metric-shadow-updated', event => {
            refreshFinanceMetricCutoverUI(event?.detail?.report || getCutoverReport());
        });
    }

    if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis, function buildFinanceMetricAdapter() {
    const VERSION = '1.1.0';
    const PROVENANCE_SCHEMA_VERSION = 1;
    const CANONICAL_LABELS = Object.freeze({
        balance: 'Net Cash Flow',
        income: 'Earned Income',
        otherCashIn: 'Other Cash In',
        expense: 'Spending'
    });
    const LEGACY_LABELS = Object.freeze({
        balance: 'Legacy Cash Flow',
        income: 'Legacy Income',
        otherCashIn: 'Legacy Non-Income Cash In',
        expense: 'Legacy Expenses'
    });

    function isFinanceCanonicalCutoverReady(report) {
        return report?.readyForVisibleCutover === true;
    }

    function normalizeSavingsRate(income, savingsRate) {
        return Number(income) > 0 && Number.isFinite(Number(savingsRate))
            ? Number(savingsRate)
            : null;
    }

    function nullableText(value) {
        const normalized = String(value || '').trim();
        return normalized || null;
    }

    function createFinanceMetricProvenance(engine, options = {}) {
        const normalizedEngine = engine === 'canonical' ? 'canonical' : 'legacy';
        return Object.freeze({
            schemaVersion: PROVENANCE_SCHEMA_VERSION,
            source: 'finance_metric_adapter',
            engine: normalizedEngine,
            semanticMode: normalizedEngine === 'canonical' ? 'canonical' : 'legacy_fallback',
            engineVersion: nullableText(options.engineVersion),
            classifierVersion: nullableText(options.classifierVersion),
            adapterVersion: VERSION,
            cutoverReason: normalizedEngine === 'canonical'
                ? null
                : (nullableText(options.cutoverReason) || 'cutover_gate_not_ready')
        });
    }

    function getFinanceMetricProvenance(metrics) {
        const existing = metrics?.metricProvenance;
        if (existing && typeof existing === 'object') return existing;
        const canonical = metrics?.metricEngine === 'canonical';
        return createFinanceMetricProvenance(canonical ? 'canonical' : 'legacy', {
            engineVersion: metrics?.canonicalMetrics?.engineVersion,
            classifierVersion: metrics?.canonicalMetrics?.classifierVersion,
            cutoverReason: metrics?.cutoverReason || (canonical ? null : 'unversioned_legacy_metrics')
        });
    }

    function formatFinanceMetricProvenance(metricsOrProvenance) {
        const provenance = metricsOrProvenance?.engine
            ? metricsOrProvenance
            : getFinanceMetricProvenance(metricsOrProvenance);
        if (provenance.engine === 'canonical') {
            return provenance.engineVersion
                ? `Canonical metrics v${provenance.engineVersion}`
                : 'Canonical metrics';
        }
        const reason = String(provenance.cutoverReason || 'fallback')
            .replace(/_/g, ' ');
        return `Legacy metrics (${reason})`;
    }

    function buildFinanceConsumerBreakdown(metrics) {
        const provenance = getFinanceMetricProvenance(metrics);
        const classifications = metrics?.canonicalMetrics?.classifications;
        const transactions = metrics?.scopedTransactions;
        if (provenance.engine !== 'canonical'
            || !Array.isArray(classifications)
            || !Array.isArray(transactions)
            || classifications.length !== transactions.length) {
            return Object.freeze({
                available: false,
                reason: provenance.engine === 'canonical'
                    ? 'classification_alignment_unavailable'
                    : 'legacy_fallback_active',
                debtService: null,
                savingsContribution: null,
                incomeByCategory: Object.freeze({}),
                metricProvenance: provenance
            });
        }

        let debtService = 0;
        let savingsContribution = 0;
        const incomeByCategory = {};
        classifications.forEach((classification, index) => {
            const counterparty = String(classification?.counterpartyType || '');
            if (classification?.kind === 'settlement'
                && ['debt', 'credit_card', 'installment'].includes(counterparty)) {
                debtService += Number(classification.settlementDelta || 0)
                    + Number(classification.financeChargeConsumptionDelta || 0);
            }
            if (counterparty === 'savings' && Number(classification?.transferDelta || 0) < 0) {
                savingsContribution += Math.abs(Number(classification.transferDelta || 0));
            }
            const earnedIncome = Number(classification?.earnedIncomeDelta || 0);
            if (earnedIncome > 0) {
                const category = String(transactions[index]?.category || '').trim() || 'Others';
                incomeByCategory[category] = (incomeByCategory[category] || 0) + earnedIncome;
            }
        });

        return Object.freeze({
            available: true,
            reason: 'canonical_classifications',
            debtService,
            savingsContribution,
            incomeByCategory: Object.freeze({ ...incomeByCategory }),
            metricProvenance: provenance
        });
    }

    function buildCanonicalDisplayMetrics(legacy, canonical) {
        const days = Math.max(1, Number(legacy?.metricDayCount || 0)
            || (Number(legacy?.expense || 0) > 0 && Number(legacy?.avgDailySpend || 0) > 0
                ? Number(legacy.expense) / Number(legacy.avgDailySpend)
                : 1));
        const metricProvenance = createFinanceMetricProvenance('canonical', {
            engineVersion: canonical?.engineVersion,
            classifierVersion: canonical?.classifierVersion
        });
        return Object.freeze({
            ...legacy,
            balance: Number(canonical?.netCashFlow || 0),
            netCashFlow: Number(canonical?.netCashFlow || 0),
            income: Number(canonical?.earnedIncome || 0),
            earnedIncome: Number(canonical?.earnedIncome || 0),
            nonIncomeCashIn: Number(canonical?.otherCashIn || 0),
            otherCashIn: Number(canonical?.otherCashIn || 0),
            expense: Number(canonical?.consumptionSpending || 0),
            spending: Number(canonical?.consumptionSpending || 0),
            savingsRate: normalizeSavingsRate(canonical?.earnedIncome, canonical?.savingsRate),
            avgDailySpend: Number(canonical?.consumptionSpending || 0) / days,
            categoryExpenses: { ...(canonical?.spendingByCategory || {}) },
            metricEngine: 'canonical',
            metricProvenance,
            metricLabels: CANONICAL_LABELS,
            canonicalMetrics: canonical
        });
    }

    function buildLegacyDisplayMetrics(legacy, report = null, reason = 'cutover_gate_not_ready') {
        const metricProvenance = createFinanceMetricProvenance('legacy', { cutoverReason: reason });
        return Object.freeze({
            ...legacy,
            netCashFlow: Number(legacy?.balance || 0),
            earnedIncome: Number(legacy?.income || 0),
            otherCashIn: Number(legacy?.nonIncomeCashIn || 0),
            spending: Number(legacy?.expense || 0),
            savingsRate: normalizeSavingsRate(legacy?.income, legacy?.savingsRate),
            metricEngine: 'legacy',
            metricProvenance,
            metricLabels: LEGACY_LABELS,
            cutoverReason: reason,
            cutoverReport: report
        });
    }

    function formatFinanceSavingsRate(value, options = {}) {
        const digits = Number.isInteger(options.digits) ? options.digits : 1;
        return value != null && Number.isFinite(Number(value))
            ? `${Number(value).toFixed(digits)}%`
            : 'n/a';
    }

    return Object.freeze({
        VERSION,
        PROVENANCE_SCHEMA_VERSION,
        CANONICAL_LABELS,
        LEGACY_LABELS,
        isFinanceCanonicalCutoverReady,
        createFinanceMetricProvenance,
        getFinanceMetricProvenance,
        formatFinanceMetricProvenance,
        buildFinanceConsumerBreakdown,
        buildCanonicalDisplayMetrics,
        buildLegacyDisplayMetrics,
        formatFinanceSavingsRate
    });
});
