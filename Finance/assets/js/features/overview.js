// =============================================
// PHASE 3B: FINAL OVERVIEW UI CUTOVER
// =============================================

(function exposeFinanceOverviewUI(root) {
    let renderSequence = 0;
    let initialized = false;

    function escapeText(value) {
        if (typeof root.escapeHTML === 'function') return root.escapeHTML(String(value ?? ''));
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function formatOverviewValue(card) {
        if (card?.value == null) return 'n/a';
        if (card.unit === 'percent') return `${Number(card.value).toFixed(1)}%`;
        return typeof root.fmt === 'function'
            ? root.fmt(Number(card.value))
            : Number(card.value).toLocaleString('en-PH', { style: 'currency', currency: 'PHP' });
    }

    function getCurrentMetricScope() {
        return typeof metricScope !== 'undefined' ? metricScope : 'selected_period';
    }

    function getOverviewPeriodLabel() {
        const scope = getCurrentMetricScope();
        if (scope === 'current_month') {
            return new Date().toLocaleString('en', { month: 'long', year: 'numeric' });
        }
        if (scope === 'all_time') return 'All records';
        return typeof root.getSelectedPeriodLabel === 'function'
            ? root.getSelectedPeriodLabel()
            : 'selected period';
    }

    function resolveFlowMetrics(provided) {
        if (provided && typeof provided === 'object') return provided;
        const allTransactions = root.allDecryptedTransactions || [];
        const filtered = root.filteredTransactions || [];
        const scope = getCurrentMetricScope();
        const scoped = typeof root.getTransactionsForScope === 'function'
            ? root.getTransactionsForScope(scope, allTransactions, filtered)
            : filtered;
        return typeof root.computeSummaryMetrics === 'function'
            ? root.computeSummaryMetrics(allTransactions, scope, {
                scopeTransactions: scoped,
                filteredTransactions: filtered
            })
            : {};
    }

    function buildMetricFallbackSignal(flowMetrics) {
        const engine = flowMetrics?.metricProvenance?.engine || flowMetrics?.metricEngine;
        if (engine === 'canonical') return { active: false };
        const report = typeof root.getFinanceMetricShadowReport === 'function'
            ? root.getFinanceMetricShadowReport()
            : root.financeMetricShadowReport;
        const diagnostics = report?.scopes?.all_time?.canonical?.diagnostics || {};
        const reasons = [];
        const invalidCount = Number(diagnostics.invalidCount || 0);
        const unclassifiedCount = Number(diagnostics.unclassifiedCount || 0);
        const invariantFailureCount = Number(report?.invariantFailures?.length || 0);
        if (invalidCount > 0) reasons.push(`${invalidCount} invalid record${invalidCount === 1 ? '' : 's'}`);
        if (unclassifiedCount > 0) reasons.push(`${unclassifiedCount} unclassified record${unclassifiedCount === 1 ? '' : 's'}`);
        if (invariantFailureCount > 0) reasons.push(`${invariantFailureCount} cash reconciliation failure${invariantFailureCount === 1 ? '' : 's'}`);
        return {
            active: true,
            detail: reasons.length
                ? `${reasons.join(' and ')} need review.`
                : 'Canonical reconciliation is not ready for this vault.'
        };
    }

    function buildBudgetRisks(allTransactions) {
        if (typeof root.computeSummaryMetrics !== 'function') return [];
        const now = new Date();
        const currentMonthTransactions = typeof root.getCurrentMonthTransactions === 'function'
            ? root.getCurrentMonthTransactions(allTransactions, now)
            : allTransactions;
        const metrics = root.computeSummaryMetrics(allTransactions, 'current_month', {
            scopeTransactions: currentMonthTransactions,
            filteredTransactions: currentMonthTransactions,
            referenceDate: now
        });
        const elapsedDays = Math.max(1, now.getDate());
        const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
        const configuredBudgets = typeof budgets !== 'undefined' ? budgets : (root.budgets || {});
        return Object.entries(metrics.categoryExpenses || {})
            .map(([category, spent]) => {
                const budget = Number(configuredBudgets[category] || 0);
                const projected = (Number(spent || 0) / elapsedDays) * daysInMonth;
                return { category, budget, projected };
            })
            .filter(item => item.budget > 0 && item.projected > item.budget)
            .sort((left, right) => (right.projected - right.budget) - (left.projected - left.budget))
            .slice(0, 3);
    }

    function buildSpendingAnomalies(allTransactions) {
        const now = Date.now();
        const cutoff = now - (90 * 24 * 60 * 60 * 1000);
        const rows = (allTransactions || []).map(transaction => ({
            transaction,
            timestamp: typeof root.getTxTimestamp === 'function'
                ? root.getTxTimestamp(transaction)
                : Date.parse(transaction?.date),
            amount: typeof root.getDisplayTxSpendingDelta === 'function'
                ? Number(root.getDisplayTxSpendingDelta(transaction) || 0)
                : (transaction?.type === 'expense' ? Number(transaction?.amt || 0) : 0)
        })).filter(row => Number.isFinite(row.timestamp) && row.timestamp >= cutoff && row.amount > 0);
        if (rows.length < 4) return [];
        const average = rows.reduce((sum, row) => sum + row.amount, 0) / rows.length;
        const variance = rows.reduce((sum, row) => sum + Math.pow(row.amount - average, 2), 0) / rows.length;
        const deviation = Math.sqrt(variance);
        if (!deviation) return [];
        return rows
            .filter(row => ((row.amount - average) / deviation) >= 2.5 && row.amount >= average * 1.5)
            .sort((left, right) => right.amount - left.amount)
            .slice(0, 2)
            .map(row => ({ id: row.transaction?.id || null, amount: row.amount }));
    }

    function buildLiquiditySignal(allTransactions, cashView) {
        if (typeof root.computeCanonicalFinanceLiquidity !== 'function' || cashView?.value == null) {
            return { ready: false, detail: 'Tracked cash or the liquidity engine is unavailable.' };
        }
        const result = root.computeCanonicalFinanceLiquidity({
            transactions: allTransactions,
            trackedCash: Number(cashView.value),
            additionalQuarantinedCount: Number(root.financeTransactionDateQuality?.quarantinedCount || 0)
        }, {
            asOf: new Date(),
            context: typeof root.getRuntimeFinanceClassificationContext === 'function'
                ? root.getRuntimeFinanceClassificationContext()
                : {}
        });
        const ready = result?.diagnostics?.safeForVisibleCutover === true;
        return {
            ready,
            runwayDays: ready && result?.liquidityRunwayDays != null
                ? Number(result.liquidityRunwayDays)
                : null,
            thresholdDays: 90,
            detail: ready ? null : 'Liquidity data needs classification or date review.'
        };
    }

    async function buildLegacyNetWorthInput(allTransactions, asOf) {
        const timestamp = Date.now();
        const corePosition = typeof root.computeKpiCorePositionAsOf === 'function'
            ? root.computeKpiCorePositionAsOf(timestamp, allTransactions)
            : null;
        const cash = Number(corePosition?.trackedCash ?? (
            typeof root.computeCurrentBalance === 'function' ? root.computeCurrentBalance(allTransactions) : 0
        ));
        const receivables = typeof root.computeLentOutstandingAsOf === 'function'
            ? Number(root.computeLentOutstandingAsOf(timestamp, allTransactions) || 0)
            : 0;
        const debt = typeof root.computeDebtOutstandingAsOf === 'function'
            ? Number(root.computeDebtOutstandingAsOf(timestamp, allTransactions) || 0)
            : 0;
        const cards = typeof root.computeCreditCardOutstandingAsOf === 'function'
            ? Number(root.computeCreditCardOutstandingAsOf(timestamp, allTransactions) || 0)
            : 0;
        const installments = typeof root.computeInstallmentOutstandingAsOf === 'function'
            ? Number(root.computeInstallmentOutstandingAsOf(timestamp, allTransactions) || 0)
            : 0;
        const crypto = typeof root.computeCryptoPortfolioValue === 'function'
            ? Number(await root.computeCryptoPortfolioValue()) || 0
            : 0;
        const liabilities = debt + cards + installments;
        return {
            netWorth: cash + receivables + crypto - liabilities,
            cash,
            receivables,
            crypto,
            liabilities,
            asOf
        };
    }

    async function resolveSnapshotViews(allTransactions, asOf) {
        const legacyCash = typeof root.computeLegacySummaryMetrics === 'function'
            ? root.computeLegacySummaryMetrics(allTransactions, 'all_time', {
                filteredTransactions: allTransactions
            }).balance
            : (typeof root.computeCurrentBalance === 'function'
                ? root.computeCurrentBalance(allTransactions)
                : null);
        const cashView = typeof root.getFinanceCashOnHandView === 'function'
            ? root.getFinanceCashOnHandView({ cash: legacyCash, asOf })
            : { mode: 'legacy', value: legacyCash, asOf, reason: 'adapter_unavailable' };
        let netWorthView = typeof root.getFinanceMarketNetWorthView === 'function'
            ? root.getFinanceMarketNetWorthView({ asOf })
            : { mode: 'unavailable', value: null, asOf, reason: 'adapter_unavailable' };

        if (netWorthView.mode === 'legacy' && typeof root.getFinanceMarketNetWorthView === 'function') {
            netWorthView = root.getFinanceMarketNetWorthView(
                await buildLegacyNetWorthInput(allTransactions, asOf)
            );
        }
        return { cashView, netWorthView };
    }

    function renderOverviewCards(model) {
        const bindings = {
            cash_on_hand: {
                card: 'overview-cash-card',
                label: 'overview-cash-label',
                value: 'overview-cash-value',
                caption: 'overview-cash-caption',
                detail: 'overview-cash-detail'
            },
            net_cash_flow: {
                card: 'overview-net-cash-flow-card',
                label: 'balance-label',
                value: 'balance-display',
                caption: 'balance-trend',
                detail: 'overview-net-cash-flow-detail'
            },
            spending_to_income: {
                card: 'overview-spending-income-card',
                label: 'overview-spending-income-label',
                value: 'overview-spending-income-value',
                caption: 'overview-spending-income-caption',
                detail: 'overview-spending-income-detail'
            },
            estimated_net_worth: {
                card: 'overview-net-worth-card',
                label: 'overview-net-worth-label',
                value: 'overview-net-worth-value',
                caption: 'overview-net-worth-caption',
                detail: 'overview-net-worth-detail'
            }
        };

        model.cardOrder.forEach(cardId => {
            const card = model.cards[cardId];
            const binding = bindings[cardId];
            const cardElement = root.document?.getElementById(binding.card);
            if (!cardElement) return;
            cardElement.dataset.overviewMode = card.mode;
            cardElement.dataset.overviewAvailability = card.availability;
            cardElement.dataset.overviewBasis = card.basis;

            const label = cardId === 'estimated_net_worth'
                ? (card.mode === 'legacy' ? 'Estimated Net Worth (Legacy)' : 'Estimated Net Worth (Market)')
                : card.label;
            const values = {
                [binding.label]: label,
                [binding.value]: formatOverviewValue(card),
                [binding.caption]: card.caption,
                [binding.detail]: cardId === 'net_cash_flow'
                    ? `${card.detail} • Click to see breakdown`
                    : card.detail
            };
            Object.entries(values).forEach(([id, value]) => {
                const element = root.document.getElementById(id);
                if (element) element.textContent = value;
            });
        });
    }

    function attentionIcon(severity) {
        if (severity === 'critical') return 'alert-triangle';
        if (severity === 'warning') return 'circle-alert';
        return 'info';
    }

    function renderAttention(model) {
        const section = root.document?.getElementById('finance-overview-attention');
        const title = root.document?.getElementById('finance-overview-attention-title');
        const count = root.document?.getElementById('finance-overview-attention-count');
        const list = root.document?.getElementById('finance-overview-attention-list');
        const more = root.document?.getElementById('finance-overview-attention-more');
        if (!section || !title || !count || !list || !more) return;

        const attention = model.attention;
        section.dataset.attentionStatus = attention.status;
        title.textContent = attention.status === 'clear'
            ? 'Nothing needs immediate attention'
            : attention.summary;
        count.textContent = attention.status === 'clear' ? 'All clear' : String(attention.count);

        if (attention.status === 'clear') {
            list.innerHTML = '<p class="finance-overview-attention__empty">Your tracked data and current signals have no urgent review items.</p>';
        } else {
            list.innerHTML = attention.items.map(item => `
                <article class="finance-overview-attention__item" data-severity="${escapeText(item.severity)}">
                    <div class="finance-overview-attention__icon" aria-hidden="true">
                        <i data-lucide="${attentionIcon(item.severity)}" class="w-4 h-4"></i>
                    </div>
                    <div class="finance-overview-attention__copy">
                        <h3>${escapeText(item.title)}</h3>
                        <p>${escapeText(item.summary)}</p>
                    </div>
                    <button type="button" class="finance-overview-attention__action"
                        data-finance-overview-action="${escapeText(item.action.id)}"
                        data-finance-target-view="${escapeText(item.action.targetView || '')}">
                        ${escapeText(item.action.label)}
                    </button>
                </article>
            `).join('');
        }
        more.hidden = attention.hiddenCount === 0;
        more.textContent = attention.hiddenCount > 0
            ? `${attention.hiddenCount} additional item${attention.hiddenCount === 1 ? '' : 's'} available in the related workspace.`
            : '';
        if (root.lucide) root.lucide.createIcons();
    }

    function focusFinanceTarget(targetView) {
        const selectorByView = {
            activity: '#finance-card-ledger',
            plan: '#finance-card-bills',
            wealth: '#crypto-toolkit-panel',
            reports: '#business-kpi-panel'
        };
        const selector = selectorByView[targetView];
        if (!selector) return;
        root.requestAnimationFrame?.(() => {
            const target = root.document?.querySelector(selector);
            target?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
            target?.focus?.({ preventScroll: true });
        });
    }

    function handleOverviewAction(actionId, targetView) {
        if (targetView && typeof root.openFinanceView === 'function') {
            root.openFinanceView(targetView, { scroll: true });
        }
        if (actionId === 'review_dates' && typeof root.openFinanceDateRepairModal === 'function') {
            root.openFinanceDateRepairModal();
            return;
        }
        if (actionId === 'open_budgets' && typeof root.openBudgetModal === 'function') {
            root.openBudgetModal();
            return;
        }
        if (actionId === 'open_balance_breakdown' && typeof root.openBalanceCalculationModal === 'function') {
            root.openBalanceCalculationModal();
            return;
        }
        focusFinanceTarget(targetView);
    }

    function handleOverviewActionClick(event) {
        const button = event.target?.closest?.('[data-finance-overview-action]');
        if (!button) return;
        handleOverviewAction(button.dataset.financeOverviewAction, button.dataset.financeTargetView || null);
    }

    async function refreshFinanceOverview(options = {}) {
        if (typeof root.buildFinanceOverviewModel !== 'function') return null;
        try {
            const sequence = ++renderSequence;
            const allTransactions = root.allDecryptedTransactions || [];
            const flowMetrics = resolveFlowMetrics(options.flowMetrics);
            const asOf = new Date().toISOString();
            const { cashView, netWorthView } = await resolveSnapshotViews(allTransactions, asOf);
            if (sequence !== renderSequence) return root.financeOverviewModel || null;

            const dateQuality = root.financeTransactionDateQuality || {};
            const attentionSignals = {
                dateQuality: {
                    quarantinedCount: Number(dateQuality.quarantinedCount || 0),
                    normalizableCount: Number(dateQuality.warningCount || 0)
                },
                metricFallback: buildMetricFallbackSignal(flowMetrics),
                liquidity: buildLiquiditySignal(allTransactions, cashView),
                budgetRisks: buildBudgetRisks(allTransactions),
                anomalies: buildSpendingAnomalies(allTransactions),
                market: { missingPriceCount: Number(netWorthView.missingPriceCount || 0) }
            };
            const model = root.buildFinanceOverviewModel({
                cashView,
                flowMetrics,
                netWorthView,
                attentionSignals
            }, {
                periodLabel: getOverviewPeriodLabel(),
                asOf,
                maxAttentionItems: 3
            });
            if (sequence !== renderSequence) return root.financeOverviewModel || null;

            root.financeOverviewModel = model;
            renderOverviewCards(model);
            renderAttention(model);
            if (root.document?.body) {
                root.document.body.dataset.financeOverviewState = model.status;
                root.document.body.dataset.financeOverviewAttention = model.attention.status;
            }
            try {
                root.dispatchEvent(new CustomEvent('finance:overview-updated', { detail: { model } }));
            } catch (_) { }
            return model;
        } catch (error) {
            console.warn('[finance-overview] Refresh failed.', error);
            return null;
        }
    }

    function initFinanceOverview() {
        if (initialized) return;
        initialized = true;
        root.document?.addEventListener('click', handleOverviewActionClick);
        const refreshWhenActive = () => {
            const active = typeof root.shouldRenderFinanceRoute === 'function'
                ? root.shouldRenderFinanceRoute('overview')
                : root.document?.body?.dataset?.financeActiveView === 'overview';
            if (active) refreshFinanceOverview();
        };
        root.addEventListener?.('finance:metric-shadow-updated', refreshWhenActive);
        root.addEventListener?.('finance:snapshot-shadow-updated', refreshWhenActive);
    }

    root.refreshFinanceOverview = refreshFinanceOverview;
    root.initFinanceOverview = initFinanceOverview;
    root.handleFinanceOverviewAction = handleOverviewAction;
})(typeof window !== 'undefined' ? window : globalThis);
