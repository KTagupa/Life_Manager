        // =============================================
        // SECTION 11: INSIGHTS HUB
        // =============================================

        function mean(nums) {
            if (!nums.length) return 0;
            return nums.reduce((a, b) => a + b, 0) / nums.length;
        }

        function stdDev(nums) {
            if (nums.length < 2) return 0;
            const m = mean(nums);
            const variance = nums.reduce((acc, v) => acc + Math.pow(v - m, 2), 0) / nums.length;
            return Math.sqrt(variance);
        }

        function median(nums) {
            if (!nums.length) return 0;
            const arr = [...nums].sort((a, b) => a - b);
            const mid = Math.floor(arr.length / 2);
            return arr.length % 2 ? arr[mid] : (arr[mid - 1] + arr[mid]) / 2;
        }

        function monthKey(date) {
            return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        }

        function getMonthlyMetrics(transactions, date) {
            const txs = getCurrentMonthTransactions(transactions, date);
            const summary = computeSummaryMetrics(transactions, 'selected_period', {
                scopeTransactions: txs,
                filteredTransactions: txs,
                referenceDate: date
            });
            return { ...summary, txs };
        }

        function getInsightTrackedCash(transactions) {
            const shadowReport = typeof getFinanceSnapshotShadowReport === 'function'
                ? getFinanceSnapshotShadowReport()
                : window.financeSnapshotShadowReport;
            const canonical = shadowReport?.current?.canonical;
            if (shadowReport?.history?.ready === true
                && canonical?.diagnostics?.safeForShadowComparison === true
                && Number(canonical?.diagnostics?.missingLiabilityStartDateCount || 0) === 0
                && Number.isFinite(Number(canonical?.trackedCash))) {
                return {
                    value: Number(canonical.trackedCash),
                    source: 'canonical_snapshot',
                    engineVersion: canonical.engineVersion || null
                };
            }
            return {
                value: computeCurrentBalance(transactions),
                source: 'legacy_fallback',
                engineVersion: null
            };
        }

        function computeRecurringMonthlyExpenseEstimate() {
            return (recurringTransactions || [])
                .filter(r => r.type === 'expense' && !r.paused)
                .reduce((sum, r) => {
                    const estimated = parseFloat(r.estimatedAmount || 0) || 0;
                    if (!estimated) return sum;
                    if (r.frequency === 'daily') return sum + (estimated * 30);
                    if (r.frequency === 'weekly') return sum + (estimated * 4.345);
                    return sum + estimated;
                }, 0);
        }

	        async function updateInsightSnapshots(currentMonthMetrics, categoryExpenses) {
	            const key = monthKey(new Date());
	            const topCategories = Object.entries(categoryExpenses || {})
	                .sort((a, b) => b[1] - a[1])
	                .slice(0, 3)
	                .map(([category, amount]) => ({ category, amount }));

	            const payload = {
	                month: key,
	                income: currentMonthMetrics.income,
	                expense: currentMonthMetrics.expense,
                savingsRate: currentMonthMetrics.income > 0
                    ? Math.round(((currentMonthMetrics.income - currentMonthMetrics.expense) / currentMonthMetrics.income) * 100)
                    : null,
	                topCategories,
                    metricProvenance: typeof getFinanceMetricProvenance === 'function'
                        ? getFinanceMetricProvenance(currentMonthMetrics)
                        : null
	            };

	            const sig = JSON.stringify(payload);
	            if (window.lastInsightSnapshotSig === sig) return;

	            try {
	                const db = await getDB();
	                db.insight_snapshots = db.insight_snapshots || [];
	
	                // Avoid writing on every app open if the snapshot is already identical.
	                const existing = (db.insight_snapshots || []).find(s => s && s.month === key);
	                if (existing) {
	                    const normalizedExisting = {
	                        month: existing.month,
	                        income: existing.income,
	                        expense: existing.expense,
		                        savingsRate: existing.savingsRate,
		                        topCategories: existing.topCategories,
                                metricProvenance: existing.metricProvenance || null
	                    };
	                    if (JSON.stringify(normalizedExisting) === sig) {
	                        window.lastInsightSnapshotSig = sig;
	                        return;
	                    }
	                }

	                const idx = db.insight_snapshots.findIndex(s => s.month === key);
	                if (idx >= 0) db.insight_snapshots[idx] = payload;
	                else db.insight_snapshots.push(payload);
	                window.lastInsightSnapshotSig = sig;
	                await saveDB(db);
	            } catch (err) {
	                console.error('Insight snapshot update failed:', err);
	            }
	        }

        function renderInsightsPanel() {
            const panel = document.getElementById('insights-panel');
            if (!panel) return;

            const allTx = window.allDecryptedTransactions || [];
            if (!allTx.length) {
                panel.innerHTML = `
                    <div class="flex flex-col items-center justify-center py-8 text-center text-slate-400" data-descriptor-key="insights hub">
                        <div class="bg-slate-50 p-4 rounded-full mb-3">
                            <i data-lucide="bar-chart-2" class="w-8 h-8 opacity-50"></i>
                        </div>
                        <p class="text-sm font-medium">Add transactions to unlock insights.</p>
                    </div>`;
                if (window.lucide) window.lucide.createIcons();
                return;
            }

            const now = new Date();
            const currentMonth = getMonthlyMetrics(allTx, now);
            const categorySpent = { ...(currentMonth.categoryExpenses || {}) };
            updateInsightSnapshots(currentMonth, categorySpent);

            const model = window.financeOverviewModel;
            if (!model) {
                panel.innerHTML = '<p class="text-xs text-slate-400">Preparing actionable summaries…</p>';
                if (typeof refreshFinanceOverview === 'function') refreshFinanceOverview();
                return;
            }

            const summaries = [];
            const topAttention = model.attention?.items?.[0];
            if (topAttention) {
                summaries.push({
                    icon: topAttention.severity === 'critical' ? 'alert-triangle' : 'circle-alert',
                    title: topAttention.title,
                    summary: topAttention.summary,
                    action: topAttention.action
                });
            }

            const cashFlow = model.cards.net_cash_flow;
            const cashFlowValue = Number(cashFlow?.value);
            if (cashFlow?.value != null && Number.isFinite(cashFlowValue)) {
                summaries.push({
                    icon: cashFlowValue >= 0 ? 'trending-up' : 'trending-down',
                    title: cashFlowValue > 0
                        ? 'Cash increased during this period'
                        : (cashFlowValue < 0 ? 'Cash decreased during this period' : 'Cash movement is flat'),
                    summary: `${fmt(Math.abs(cashFlowValue))} ${cashFlowValue < 0 ? 'net decrease' : 'net increase'} • ${cashFlow.caption}.`,
                    action: { id: 'open_balance_breakdown', label: 'See cash flow', targetView: 'overview' }
                });
            }

            const spendingRatio = model.cards.spending_to_income;
            if (spendingRatio?.value != null) {
                const ratio = Number(spendingRatio.value);
                summaries.push({
                    icon: ratio > 70 ? 'gauge' : 'shield-check',
                    title: ratio > 70
                        ? 'Spending is high relative to income'
                        : 'Spending remains within the 70% guide',
                    summary: `${ratio.toFixed(1)}% of earned income is being consumed • ${spendingRatio.caption}.`,
                    action: { id: 'review_spending_ratio', label: 'Open reports', targetView: 'reports' }
                });
            } else {
                summaries.push({
                    icon: 'circle-help',
                    title: 'Spending ratio needs earned income',
                    summary: 'Record earned income for the period to make this comparison available.',
                    action: { id: 'review_activity', label: 'Review activity', targetView: 'activity' }
                });
            }

            const visibleSummaries = summaries.slice(0, 3);
            panel.dataset.financeMetricEngine = currentMonth.metricProvenance?.engine
                || currentMonth.metricEngine
                || 'legacy';
            panel.dataset.financeMetricVersion = currentMonth.metricProvenance?.engineVersion || '';
            panel.dataset.financeOverviewModel = model.modelVersion || '';
            panel.innerHTML = `<div class="space-y-3">${visibleSummaries.map(summary => `
                <article class="finance-insight-summary">
                    <div class="finance-insight-summary__icon" aria-hidden="true">
                        <i data-lucide="${escapeHTML(summary.icon)}" class="w-4 h-4"></i>
                    </div>
                    <div class="finance-insight-summary__copy">
                        <h3>${escapeHTML(summary.title)}</h3>
                        <p>${escapeHTML(summary.summary)}</p>
                    </div>
                    <button type="button" class="finance-insight-summary__action"
                        data-finance-overview-action="${escapeHTML(summary.action.id)}"
                        data-finance-target-view="${escapeHTML(summary.action.targetView || '')}">
                        ${escapeHTML(summary.action.label)}
                    </button>
                </article>
            `).join('')}</div>`;

            if (window.lucide) window.lucide.createIcons();
        }

        window.addEventListener('finance:overview-updated', () => renderInsightsPanel());
