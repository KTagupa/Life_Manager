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
                .filter(r => r.type === 'expense')
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
            window.lastInsightSnapshotSig = sig;

            try {
                const db = await getDB();
                db.insight_snapshots = db.insight_snapshots || [];
                const idx = db.insight_snapshots.findIndex(s => s.month === key);
                if (idx >= 0) db.insight_snapshots[idx] = payload;
                else db.insight_snapshots.push(payload);
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
                panel.innerHTML = '<div class="text-xs text-slate-400">Add transactions to unlock insights.</div>';
                return;
            }

            const now = new Date();
            const currentMonth = getMonthlyMetrics(allTx, now);
            const prevMonth = getMonthlyMetrics(allTx, new Date(now.getFullYear(), now.getMonth() - 1, 1));

            const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
            const elapsed = Math.max(1, now.getDate());

            const categorySpent = {};
            currentMonth.txs.filter(t => t.type === 'expense').forEach(t => {
                categorySpent[t.category] = (categorySpent[t.category] || 0) + t.amt;
            });

            const projectedByCategory = Object.entries(categorySpent).map(([category, amount]) => ({
                category,
                projected: (amount / elapsed) * daysInMonth,
                spent: amount
            })).sort((a, b) => b.projected - a.projected);

            const budgetRisks = projectedByCategory
                .filter(x => (budgets[x.category] || 0) > 0 && x.projected > budgets[x.category])
                .slice(0, 3);

            const m0 = getMonthlyMetrics(allTx, now);
            const m1 = getMonthlyMetrics(allTx, new Date(now.getFullYear(), now.getMonth() - 1, 1));
            const m2 = getMonthlyMetrics(allTx, new Date(now.getFullYear(), now.getMonth() - 2, 1));
            const incomeMA3 = mean([m0.income, m1.income, m2.income]);
            const expenseMA3 = mean([m0.expense, m1.expense, m2.expense]);
            const momIncome = m1.income > 0 ? ((m0.income - m1.income) / m1.income) * 100 : 0;
            const momExpense = m1.expense > 0 ? ((m0.expense - m1.expense) / m1.expense) * 100 : 0;

            const ninetyDaysAgo = new Date(now);
            ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
            const tx90 = allTx.filter(t => new Date(t.date) >= ninetyDaysAgo);
            const amounts90 = tx90.map(t => t.amt).filter(a => Number.isFinite(a));
            const mu = mean(amounts90);
            const sigma = stdDev(amounts90);
            const med = median(amounts90);
            const anomalies = tx90.filter(t => {
                if (!sigma) return false;
                const z = (t.amt - mu) / sigma;
                return Math.abs(z) >= 2.5 && t.amt >= (med * 1.5);
            }).slice(0, 3);

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

            const currentCat = {};
            const prevCat = {};
            currentMonth.txs.filter(t => t.type === 'expense').forEach(t => currentCat[t.category] = (currentCat[t.category] || 0) + t.amt);
            prevMonth.txs.filter(t => t.type === 'expense').forEach(t => prevCat[t.category] = (prevCat[t.category] || 0) + t.amt);
            const allCats = Array.from(new Set([...Object.keys(currentCat), ...Object.keys(prevCat)]));
            const deltas = allCats.map(cat => ({ cat, delta: (currentCat[cat] || 0) - (prevCat[cat] || 0) }));
            const topUp = deltas.filter(d => d.delta > 0).sort((a, b) => b.delta - a.delta).slice(0, 3);
            const topDown = deltas.filter(d => d.delta < 0).sort((a, b) => a.delta - b.delta).slice(0, 3);

            panel.innerHTML = `
                <div class="p-3 bg-slate-50 rounded-xl border border-slate-200">
                    <p class="text-[10px] font-black uppercase tracking-wider text-slate-400">Spend Velocity</p>
                    <p class="text-xs text-slate-600 mt-1">${projectedByCategory.length ? `${projectedByCategory[0].category}: ${fmt(projectedByCategory[0].projected)} projected` : 'No expense data this month.'}</p>
                </div>
                <div class="p-3 bg-slate-50 rounded-xl border border-slate-200">
                    <p class="text-[10px] font-black uppercase tracking-wider text-slate-400">Budget Risk</p>
                    <p class="text-xs text-slate-600 mt-1">${budgetRisks.length ? budgetRisks.map(x => `${x.category} (${fmt(x.projected)} > ${fmt(budgets[x.category])})`).join(', ') : 'No categories currently projected over budget.'}</p>
                </div>
                <div class="p-3 bg-slate-50 rounded-xl border border-slate-200">
                    <p class="text-[10px] font-black uppercase tracking-wider text-slate-400">Momentum (3M + MoM)</p>
                    <p class="text-xs text-slate-600 mt-1">Income MA3: ${fmt(incomeMA3)} | Expense MA3: ${fmt(expenseMA3)}</p>
                    <p class="text-xs text-slate-600">MoM Income: ${momIncome.toFixed(1)}% | MoM Expense: ${momExpense.toFixed(1)}%</p>
                </div>
                <div class="p-3 bg-slate-50 rounded-xl border border-slate-200">
                    <p class="text-[10px] font-black uppercase tracking-wider text-slate-400">Anomalies (90d)</p>
                    <p class="text-xs text-slate-600 mt-1">${anomalies.length ? anomalies.map(a => `${new Date(a.date).toLocaleDateString()}: ${a.desc} ${fmt(a.amt)}`).join(' | ') : 'No high-signal anomalies detected.'}</p>
                </div>
                <div class="p-3 bg-slate-50 rounded-xl border border-slate-200">
                    <p class="text-[10px] font-black uppercase tracking-wider text-slate-400">Cash Runway</p>
                    <p class="text-xs text-slate-600 mt-1">${Number.isFinite(runwayDays) ? `${runwayDays} day(s) at current burn` : 'No projected burn detected'}</p>
                </div>
                <div class="p-3 bg-slate-50 rounded-xl border border-slate-200">
                    <p class="text-[10px] font-black uppercase tracking-wider text-slate-400">What Changed</p>
                    <p class="text-xs text-slate-600 mt-1">Up: ${topUp.length ? topUp.map(x => `${x.cat} +${fmt(x.delta)}`).join(', ') : 'none'}</p>
                    <p class="text-xs text-slate-600">Down: ${topDown.length ? topDown.map(x => `${x.cat} ${fmt(x.delta)}`).join(', ') : 'none'}</p>
                </div>
            `;

            updateInsightSnapshots(currentMonth, categorySpent);
        }
