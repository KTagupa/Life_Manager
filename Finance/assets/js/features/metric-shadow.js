(function exposeFinanceMetricShadow(root) {
    const VERSION = '1.0.0';
    let lastWarningSignature = '';

    function getRuntimeClassificationContext() {
        const debtMap = new Map();
        [root.financeMetricShadowReferenceDebts, root.allDecryptedDebts]
            .filter(Array.isArray)
            .flat()
            .forEach(debt => {
                const key = String(debt?.id || debt?.name || '').trim();
                if (key) debtMap.set(key, debt);
            });
        const debts = [...debtMap.values()];
        const debtCategoryNames = debts.flatMap(debt => {
            if (typeof root.getDebtCategoryMatchNames === 'function') {
                return root.getDebtCategoryMatchNames(debt);
            }
            const name = String(debt?.name || '').trim();
            return name ? [name, `Debt to pay: ${name}`] : [];
        });

        return root.buildFinanceClassificationContext({
            debts,
            debtCategoryNames,
            assetCategoryNames: Array.isArray(root.financeAssetCategoryNames)
                ? root.financeAssetCategoryNames
                : [],
            transferCategoryNames: Array.isArray(root.financeTransferCategoryNames)
                ? root.financeTransferCategoryNames
                : []
        });
    }

    async function primeFinanceMetricShadowContext(rawDebtRecords) {
        if (!Array.isArray(rawDebtRecords) || typeof root.decryptData !== 'function') {
            root.financeMetricShadowReferenceDebts = [];
            return [];
        }
        const debts = (await Promise.all(rawDebtRecords.map(async record => {
            try {
                const decrypted = await root.decryptData(record?.data);
                return decrypted ? { ...decrypted, id: record.id } : null;
            } catch (_) {
                return null;
            }
        }))).filter(Boolean);
        root.financeMetricShadowReferenceDebts = debts;
        return debts;
    }

    function summarizeLegacyMetrics(metrics) {
        return Object.freeze({
            balance: Number(metrics?.balance || 0),
            income: Number(metrics?.income || 0),
            nonIncomeCashIn: Number(metrics?.nonIncomeCashIn || 0),
            expense: Number(metrics?.expense || 0),
            savingsRate: Number(metrics?.savingsRate || 0),
            transactionCount: Number(metrics?.transactionCount || 0)
        });
    }

    function buildScopeShadow(scope, allTransactions, filteredTransactions, context, quarantinedCount) {
        const scopedTransactions = root.getTransactionsForScope(
            scope,
            allTransactions,
            filteredTransactions
        );
        const legacyCalculator = root.computeLegacySummaryMetrics || root.computeSummaryMetrics;
        const legacyMetrics = legacyCalculator(allTransactions, scope, {
            scopeTransactions: scopedTransactions,
            filteredTransactions
        });
        const legacy = summarizeLegacyMetrics(legacyMetrics);
        const canonical = root.computeCanonicalFinanceMetrics(scopedTransactions, {
            context,
            additionalQuarantinedCount: scope === 'all_time' ? quarantinedCount : 0
        });
        const comparison = root.compareFinanceMetricSnapshots(canonical, legacy);

        return Object.freeze({ scope, legacy, canonical, comparison });
    }

    function refreshFinanceMetricShadow() {
        if (typeof root.computeCanonicalFinanceMetrics !== 'function'
            || typeof root.compareFinanceMetricSnapshots !== 'function'
            || typeof root.computeSummaryMetrics !== 'function'
            || typeof root.getTransactionsForScope !== 'function') {
            return null;
        }

        const allTransactions = Array.isArray(root.allDecryptedTransactions)
            ? root.allDecryptedTransactions
            : [];
        const filteredTransactions = Array.isArray(root.filteredTransactions)
            ? root.filteredTransactions
            : allTransactions;
        const dateQuality = root.financeTransactionDateQuality || {};
        const quarantinedCount = Math.max(0, Number(dateQuality.quarantinedCount || 0));
        const context = getRuntimeClassificationContext();
        const scopes = {
            selected_period: buildScopeShadow('selected_period', allTransactions, filteredTransactions, context, 0),
            current_month: buildScopeShadow('current_month', allTransactions, filteredTransactions, context, 0),
            all_time: buildScopeShadow('all_time', allTransactions, filteredTransactions, context, quarantinedCount)
        };
        const invariantFailures = Object.values(scopes).flatMap(scopeReport => (
            scopeReport.comparison.invariantFailures.map(failure => ({
                scope: scopeReport.scope,
                canonicalKey: failure.canonicalKey,
                canonicalValue: failure.canonicalValue,
                legacyValue: failure.legacyValue,
                difference: failure.difference
            }))
        ));
        const allTimeDiagnostics = scopes.all_time.canonical.diagnostics;
        const report = Object.freeze({
            shadowVersion: VERSION,
            engineVersion: root.FINANCE_CANONICAL_METRICS_VERSION || null,
            generatedAt: new Date().toISOString(),
            activeScope: typeof metricScope === 'string' ? metricScope : 'selected_period',
            context: Object.freeze({
                fingerprint: context.fingerprint,
                debtIdCount: context.debtIds.length,
                debtCategoryCount: context.debtCategoryNames.length,
                assetCategoryCount: context.assetCategoryNames.length,
                transferCategoryCount: context.transferCategoryNames.length
            }),
            dateQuality: Object.freeze({
                transactionCount: Number(dateQuality.transactionCount || allTransactions.length),
                usableCount: Number(dateQuality.usableCount || allTransactions.length),
                warningCount: Number(dateQuality.warningCount || 0),
                quarantinedCount
            }),
            scopes: Object.freeze(scopes),
            invariantFailures: Object.freeze(invariantFailures),
            readyForVisibleCutover: allTimeDiagnostics.safeForVisibleCutover
                && invariantFailures.length === 0
        });

        root.financeMetricShadowReport = report;

        const documentRoot = root.document?.documentElement;
        if (documentRoot) {
            documentRoot.dataset.financeMetricShadow = report.readyForVisibleCutover ? 'ready' : 'review';
            documentRoot.dataset.financeMetricShadowUnclassified = String(allTimeDiagnostics.unclassifiedCount);
            documentRoot.dataset.financeMetricShadowInvalid = String(allTimeDiagnostics.invalidCount);
            documentRoot.dataset.financeMetricShadowInvariantFailures = String(invariantFailures.length);
            documentRoot.dataset.financeMetricShadowQuarantined = String(quarantinedCount);
        }

        const warningSignature = JSON.stringify({
            invalidCount: allTimeDiagnostics.invalidCount,
            unclassifiedCount: allTimeDiagnostics.unclassifiedCount,
            invariantFailures
        });
        const needsWarning = allTimeDiagnostics.invalidCount > 0
            || allTimeDiagnostics.unclassifiedCount > 0
            || invariantFailures.length > 0;
        if (needsWarning && warningSignature !== lastWarningSignature) {
            console.warn('[finance-metric-shadow] Canonical metrics require review.', {
                invalidCount: allTimeDiagnostics.invalidCount,
                unclassifiedCount: allTimeDiagnostics.unclassifiedCount,
                invariantFailures
            });
            lastWarningSignature = warningSignature;
        } else if (!needsWarning) {
            lastWarningSignature = '';
        }

        if (root.DEBUG_FINANCE_METRIC_SHADOW === true) {
            console.info('[finance-metric-shadow] Shadow report updated.', report);
        }

        try {
            root.dispatchEvent(new CustomEvent('finance:metric-shadow-updated', {
                detail: {
                    report,
                    readyForVisibleCutover: report.readyForVisibleCutover,
                    invalidCount: allTimeDiagnostics.invalidCount,
                    unclassifiedCount: allTimeDiagnostics.unclassifiedCount,
                    invariantFailureCount: invariantFailures.length
                }
            }));
        } catch (_) { }

        return report;
    }

    function getFinanceMetricShadowReport() {
        return root.financeMetricShadowReport || null;
    }

    function initFinanceMetricShadow() {
        return refreshFinanceMetricShadow();
    }

    root.FINANCE_METRIC_SHADOW_VERSION = VERSION;
    root.getRuntimeFinanceClassificationContext = getRuntimeClassificationContext;
    root.primeFinanceMetricShadowContext = primeFinanceMetricShadowContext;
    root.refreshFinanceMetricShadow = refreshFinanceMetricShadow;
    root.getFinanceMetricShadowReport = getFinanceMetricShadowReport;
    root.initFinanceMetricShadow = initFinanceMetricShadow;
})(typeof window !== 'undefined' ? window : globalThis);
