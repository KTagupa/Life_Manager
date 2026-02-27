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
            const income = txs.filter(t => t.type === 'income').reduce((s, t) => s + t.amt, 0);
            const expense = txs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amt, 0);
            return { income, expense, txs };
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
                    : 0,
                topCategories
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
	                        topCategories: existing.topCategories
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
                lucide.createIcons();
                return;
            }

            const now = new Date();
            const currentMonth = getMonthlyMetrics(allTx, now);
            const prevMonth = getMonthlyMetrics(allTx, new Date(now.getFullYear(), now.getMonth() - 1, 1));
            const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
            const elapsed = Math.max(1, now.getDate());

            // 1. Spend Velocity
            const categorySpent = {};
            currentMonth.txs.filter(t => t.type === 'expense').forEach(t => {
                categorySpent[t.category] = (categorySpent[t.category] || 0) + t.amt;
            });
            const projectedByCategory = Object.entries(categorySpent).map(([category, amount]) => ({
                category,
                projected: (amount / elapsed) * daysInMonth,
                spent: amount
            })).sort((a, b) => b.projected - a.projected);

            // 2. Budget Risk (with visual indicator)
            const budgetRisks = projectedByCategory
                .filter(x => (budgets[x.category] || 0) > 0 && x.projected > budgets[x.category])
                .slice(0, 3);
            
            // 3. Momentum
            const m0 = getMonthlyMetrics(allTx, now);
            const m1 = getMonthlyMetrics(allTx, new Date(now.getFullYear(), now.getMonth() - 1, 1));
            const momIncome = m1.income > 0 ? ((m0.income - m1.income) / m1.income) * 100 : 0;
            const momExpense = m1.expense > 0 ? ((m0.expense - m1.expense) / m1.expense) * 100 : 0;

            // 4. Anomalies
            const ninetyDaysAgo = new Date(now);
            ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
            const tx90 = allTx.filter(t => new Date(t.date) >= ninetyDaysAgo);
            const amounts90 = tx90.map(t => t.amt).filter(a => Number.isFinite(a));
            const mu = mean(amounts90);
            const sigma = stdDev(amounts90);
            const anomalies = tx90.filter(t => {
                if (!sigma) return false;
                const z = (t.amt - mu) / sigma;
                return Math.abs(z) >= 2.5 && t.amt >= (mu * 1.5); // Fixed threshold logic
            }).slice(0, 2);

            // 5. Runway
            const balance = computeCurrentBalance(allTx);
            const monthlyRecurring = computeRecurringMonthlyExpenseEstimate();
            const last30 = allTx.filter(t => {
                const d = new Date(t.date);
                const cutoff = new Date(now);
                cutoff.setDate(cutoff.getDate() - 30);
                return d >= cutoff && t.type === 'expense' && t.category !== 'Bills';
            });
            const discretionaryDaily = last30.reduce((s, t) => s + t.amt, 0) / 30;
            const dailyBurn = (monthlyRecurring / 30) + discretionaryDaily;
            const runwayDays = dailyBurn > 0 ? Math.floor(balance / dailyBurn) : Infinity;

            // Use a denser two-column layout in the sidebar so cards remain readable at mid widths.
            let html = '<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">';

            // Card: Velocity
            const topProj = projectedByCategory[0];
            html += `
                <div class="p-4 bg-slate-50/50 rounded-2xl border border-slate-200 relative group overflow-hidden min-h-[128px]" data-descriptor-key="spend velocity">
                    <div class="bg-indigo-500/5 absolute top-0 right-0 w-16 h-16 rounded-bl-full -mr-4 -mt-4 transition-transform group-hover:scale-110"></div>
                    <div class="flex items-start justify-between mb-2 relative z-10">
                        <div class="bg-indigo-100 text-indigo-600 p-2 rounded-xl">
                            <i data-lucide="zap" class="w-4 h-4"></i>
                        </div>
                        <span class="text-[11px] font-bold uppercase tracking-wide text-slate-600" data-descriptor-icon-host="true">Velocity</span>
                    </div>
                    <div class="relative z-10">
                        <p class="text-xs text-slate-600 font-semibold">Top Projected</p>
                        <p class="text-sm font-bold text-slate-900 mt-1 leading-snug break-words">
                            ${topProj ? `${topProj.category}: ${fmt(topProj.projected)}` : 'No data'}
                        </p>
                    </div>
                </div>`;

            // Card: Budget Health
            const isRisk = budgetRisks.length > 0;
            html += `
                <div class="p-4 ${isRisk ? 'bg-rose-50/50 border-rose-200' : 'bg-emerald-50/50 border-emerald-200'} rounded-2xl border relative group overflow-hidden min-h-[128px]" data-descriptor-key="budget health">
                    <div class="${isRisk ? 'bg-rose-500/5' : 'bg-emerald-500/5'} absolute top-0 right-0 w-16 h-16 rounded-bl-full -mr-4 -mt-4 transition-transform group-hover:scale-110"></div>
                    <div class="flex items-start justify-between mb-2 relative z-10">
                        <div class="${isRisk ? 'bg-rose-100 text-rose-600' : 'bg-emerald-100 text-emerald-600'} p-2 rounded-xl">
                            <i data-lucide="${isRisk ? 'alert-triangle' : 'shield-check'}" class="w-4 h-4"></i>
                        </div>
                        <span class="text-[11px] font-bold uppercase tracking-wide ${isRisk ? 'text-rose-600' : 'text-emerald-700'}" data-descriptor-icon-host="true">Health</span>
                    </div>
                    <div class="relative z-10">
                        <p class="text-sm ${isRisk ? 'text-rose-700' : 'text-emerald-700'} font-bold">
                            ${isRisk ? `${budgetRisks.length} Over Budget` : 'On Track'}
                        </p>
                         <p class="text-xs text-slate-600 mt-1 leading-snug break-words">
                            ${isRisk ? budgetRisks[0].category + ' ' + fmt(budgetRisks[0].projected) : 'All budgets healthy'}
                        </p>
                    </div>
                </div>`;

            // Card: Momentum
            const incomeUp = momIncome > 0;
            const expenseDown = momExpense < 0; // Good
            html += `
                <div class="p-4 bg-slate-50/50 rounded-2xl border border-slate-200 relative group overflow-hidden min-h-[128px]" data-descriptor-key="mom trend">
                    <div class="bg-blue-500/5 absolute top-0 right-0 w-16 h-16 rounded-bl-full -mr-4 -mt-4 transition-transform group-hover:scale-110"></div>
                    <div class="flex items-start justify-between mb-2 relative z-10">
                        <div class="bg-blue-100 text-blue-600 p-2 rounded-xl">
                            <i data-lucide="trending-up" class="w-4 h-4"></i>
                        </div>
                        <span class="text-[11px] font-bold uppercase tracking-wide text-slate-600" data-descriptor-icon-host="true">MoM</span>
                    </div>
                    <div class="relative z-10 grid grid-cols-2 gap-2">
                        <div>
                            <p class="text-[11px] text-slate-600">Income</p>
                            <p class="text-xs font-bold ${incomeUp ? 'text-emerald-600' : 'text-slate-600'}">
                                ${momIncome > 0 ? '+' : ''}${momIncome.toFixed(1)}%
                            </p>
                        </div>
                        <div>
                            <p class="text-[11px] text-slate-600">Expense</p>
                            <p class="text-xs font-bold ${expenseDown ? 'text-emerald-600' : 'text-rose-600'}">
                                ${momExpense > 0 ? '+' : ''}${momExpense.toFixed(1)}%
                            </p>
                        </div>
                    </div>
                </div>`;

             // Card: Runway
            const runwayFinite = Number.isFinite(runwayDays);
            const runwayColor = runwayFinite && runwayDays < 90 ? 'rose' : 'slate';
            html += `
                 <div class="p-4 bg-${runwayColor}-50/30 rounded-2xl border border-${runwayColor}-200 relative group overflow-hidden min-h-[128px]" data-descriptor-key="runway">
                    <div class="flex items-start justify-between mb-2 relative z-10">
                        <div class="bg-${runwayColor}-100 text-${runwayColor}-600 p-2 rounded-xl">
                            <i data-lucide="hourglass" class="w-4 h-4"></i>
                        </div>
                         <span class="text-[11px] font-bold uppercase tracking-wide text-${runwayColor}-700" data-descriptor-icon-host="true">Runway</span>
                    </div>
                    <div class="relative z-10">
                         <h4 class="text-xl font-black text-slate-800">${runwayFinite ? runwayDays : '∞'} <span class="text-xs font-normal text-slate-500">days</span></h4>
                         <p class="text-[11px] text-slate-600 mt-0.5">at current <span data-descriptor-key="burn rate">burn rate</span></p>
                    </div>
                </div>`;

            // Card: Anomalies
            if (anomalies.length > 0) {
                 html += `
                <div class="col-span-1 sm:col-span-2 p-4 bg-purple-50/50 rounded-2xl border border-purple-200 relative group overflow-hidden" data-descriptor-key="unusual spend">
                    <div class="flex items-center gap-2 mb-2">
                        <i data-lucide="alert-circle" class="w-4 h-4 text-purple-500"></i>
                        <span class="text-[11px] font-bold uppercase tracking-wide text-purple-700" data-descriptor-icon-host="true">Unusual Spend</span>
                    </div>
                    <div class="space-y-1">
                        ${anomalies.map(a => `
                            <div class="flex justify-between items-center text-xs">
                                <span class="text-slate-700 truncate max-w-[170px]">${a.desc}</span>
                                <span class="font-bold text-purple-600">${fmt(a.amt)}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>`;
            }

            html += '</div>'; // End Grid
            panel.innerHTML = html;
            
            // Re-initialize icons for the new content
            if (window.lucide) {
                window.lucide.createIcons();
            }

            updateInsightSnapshots(currentMonth, categorySpent);
        }
