        // =============================================
        // SECTION 14: MONTHLY CLOSE WIZARD
        // =============================================

        let monthlyCloseActiveMonthKey = null;

        function getMonthKeyFromParts(year, month) {
            const y = Number(year);
            const m = Number(month);
            if (!Number.isInteger(y) || !Number.isInteger(m) || m < 1 || m > 12) return null;
            return `${y}-${String(m).padStart(2, '0')}`;
        }

        function getCurrentMonthKey() {
            const now = new Date();
            return getMonthKeyFromParts(now.getFullYear(), now.getMonth() + 1);
        }

        function parseMonthKey(monthKey) {
            const match = String(monthKey || '').match(/^(\d{4})-(\d{2})$/);
            if (!match) return null;
            const year = Number(match[1]);
            const month = Number(match[2]);
            if (month < 1 || month > 12) return null;
            return { year, month };
        }

        function getMonthLabel(monthKey) {
            const parsed = parseMonthKey(monthKey);
            if (!parsed) return 'Unknown Month';
            return new Date(parsed.year, parsed.month - 1, 1).toLocaleDateString('en', {
                month: 'long',
                year: 'numeric'
            });
        }

        function getCloseMonthKeyInputValue() {
            const el = document.getElementById('mc-month');
            if (!el) return null;
            const value = String(el.value || '').trim();
            return /^\d{4}-\d{2}$/.test(value) ? value : null;
        }

        function resolveDefaultCloseMonthKey() {
            const filterMonth = document.getElementById('filter-month')?.value;
            const filterYear = document.getElementById('filter-year')?.value;
            if (filterMonth && filterYear && filterMonth !== 'all' && filterYear !== 'all') {
                const fromFilters = getMonthKeyFromParts(Number(filterYear), Number(filterMonth));
                if (fromFilters) return fromFilters;
            }
            return getCurrentMonthKey();
        }

        function getTransactionsForMonthKey(monthKey) {
            const parsed = parseMonthKey(monthKey);
            if (!parsed) return [];
            return (window.allDecryptedTransactions || []).filter(tx => {
                return getTxYear(tx) === parsed.year && getTxMonth(tx) === parsed.month;
            });
        }

        function getMonthEndBalance(monthKey) {
            const parsed = parseMonthKey(monthKey);
            if (!parsed) return 0;

            const endTs = new Date(parsed.year, parsed.month, 0, 23, 59, 59, 999).getTime();
            let balance = 0;

            (window.allDecryptedTransactions || []).forEach(tx => {
                if (getTxTimestamp(tx) > endTs) return;
                const amt = Number(tx.amt) || 0;
                if (tx.type === 'income' || tx.type === 'debt_increase') {
                    balance += amt;
                } else if (tx.type === 'expense') {
                    balance -= amt;
                }
            });

            return balance;
        }

        function computeMonthlyBudgetSummary(monthTransactions) {
            const budgetEntries = Object.entries(budgets || {})
                .map(([category, limit]) => ({ category, limit: Number(limit) || 0 }))
                .filter(entry => entry.limit > 0);

            const expenseByCategory = Object.create(null);
            (monthTransactions || []).forEach(tx => {
                if (tx.type !== 'expense') return;
                const category = String(tx.category || '').trim();
                if (!category) return;
                expenseByCategory[category] = (expenseByCategory[category] || 0) + (Number(tx.amt) || 0);
            });

            const overages = budgetEntries
                .map(entry => {
                    const spent = expenseByCategory[entry.category] || 0;
                    return {
                        category: entry.category,
                        limit: entry.limit,
                        spent,
                        delta: spent - entry.limit
                    };
                })
                .filter(entry => entry.delta > 0)
                .sort((a, b) => b.delta - a.delta);

            const totalBudget = budgetEntries.reduce((sum, entry) => sum + entry.limit, 0);
            const budgetSpent = budgetEntries.reduce((sum, entry) => sum + (expenseByCategory[entry.category] || 0), 0);

            return {
                totalBudget,
                budgetSpent,
                budgetVariance: totalBudget - budgetSpent,
                overBudgetCategories: overages.length,
                overages
            };
        }

        function computeRunwayDays(monthEndBalance, burnRateMonthly) {
            if (!Number.isFinite(burnRateMonthly) || burnRateMonthly <= 0) return null;
            return Math.max(0, Math.floor((monthEndBalance / burnRateMonthly) * 30));
        }

        function getEffectiveKpiTargets() {
            const defaults = typeof getDefaultKpiTargets === 'function'
                ? getDefaultKpiTargets()
                : {
                    savingsRatePct: 20,
                    runwayDays: 180,
                    maxOverBudgetCategories: 1,
                    lastModified: 0
                };
            const source = (kpiTargets && typeof kpiTargets === 'object') ? kpiTargets : {};

            const parsedSavingsRate = Number(source.savingsRatePct);
            const parsedRunwayDays = Number(source.runwayDays);
            const parsedMaxOverBudget = Number(source.maxOverBudgetCategories);
            const parsedLastModified = Number(source.lastModified);

            const savingsRatePct = Math.max(
                0,
                Math.min(100, Number.isFinite(parsedSavingsRate) ? parsedSavingsRate : defaults.savingsRatePct)
            );
            const runwayDays = Math.max(
                0,
                Math.round(Number.isFinite(parsedRunwayDays) ? parsedRunwayDays : defaults.runwayDays)
            );
            const maxOverBudgetCategories = Math.max(
                0,
                Math.round(Number.isFinite(parsedMaxOverBudget) ? parsedMaxOverBudget : defaults.maxOverBudgetCategories)
            );
            const lastModified = Math.max(
                0,
                Number.isFinite(parsedLastModified) ? parsedLastModified : defaults.lastModified
            );

            return {
                savingsRatePct,
                runwayDays,
                maxOverBudgetCategories,
                lastModified
            };
        }

        function computeMonthlyCloseSnapshot(monthKey) {
            const monthTransactions = getTransactionsForMonthKey(monthKey);
            const metrics = computeSummaryMetrics(window.allDecryptedTransactions || [], 'selected_period', {
                scopeTransactions: monthTransactions,
                filteredTransactions: monthTransactions,
                referenceDate: (() => {
                    const parsed = parseMonthKey(monthKey);
                    return parsed ? new Date(parsed.year, parsed.month - 1, 15) : new Date();
                })()
            });

            const monthEndBalance = getMonthEndBalance(monthKey);
            const budgetSummary = computeMonthlyBudgetSummary(monthTransactions);
            const recurringEstimate = typeof computeRecurringMonthlyExpenseEstimate === 'function'
                ? computeRecurringMonthlyExpenseEstimate()
                : 0;
            const burnRateMonthly = Math.max(metrics.expense || 0, recurringEstimate || 0);
            const runwayDays = computeRunwayDays(monthEndBalance, burnRateMonthly);

            const uncategorizedCount = monthTransactions.filter(tx => !String(tx.category || '').trim()).length;
            const needsReviewCount = monthTransactions.filter(tx => String(tx.category || '').trim().toLowerCase() === 'others').length;

            const remindersDueCount = (recurringTransactions || [])
                .filter(reminder => reminder && reminder.type === 'expense' && reminder.frequency === 'monthly' && !reminder.paused)
                .filter(reminder => {
                    const category = String(reminder.category || '').trim();
                    if (!category) return false;
                    return !monthTransactions.some(tx => tx.type === 'expense' && String(tx.category || '').trim() === category);
                }).length;

            return {
                monthKey,
                metrics,
                monthEndBalance,
                burnRateMonthly,
                runwayDays,
                budgetSummary,
                uncategorizedCount,
                needsReviewCount,
                remindersDueCount,
                transactionCount: monthTransactions.length
            };
        }

        function getMonthlyCloseRecord(monthKey) {
            return (monthlyCloseRecords || []).find(record => record.month === monthKey) || null;
        }

        function formatRunwayDays(runwayDays) {
            if (!Number.isFinite(runwayDays)) return 'n/a';
            return `${Math.max(0, Math.round(runwayDays))} days`;
        }

        function renderCloseTargetGuardrails(targets) {
            const el = document.getElementById('mc-targets');
            if (!el) return;
            const updatedLabel = Number(targets.lastModified) > 0
                ? new Date(targets.lastModified).toLocaleString()
                : 'Never';
            el.innerHTML = `
                <label class="block">
                    <span class="text-[11px] font-bold text-slate-600">Savings Rate Target (%)</span>
                    <input id="mc-target-savings" type="number" min="0" max="100" step="1" value="${targets.savingsRatePct}"
                        class="mt-1 w-full p-2 bg-white border border-slate-200 rounded-lg text-sm font-bold text-slate-700 outline-none focus:border-cyan-500">
                </label>
                <label class="block">
                    <span class="text-[11px] font-bold text-slate-600">Runway Target (days)</span>
                    <input id="mc-target-runway" type="number" min="0" step="1" value="${targets.runwayDays}"
                        class="mt-1 w-full p-2 bg-white border border-slate-200 rounded-lg text-sm font-bold text-slate-700 outline-none focus:border-cyan-500">
                </label>
                <label class="block">
                    <span class="text-[11px] font-bold text-slate-600">Max Over-budget Categories</span>
                    <input id="mc-target-overbudget" type="number" min="0" step="1" value="${targets.maxOverBudgetCategories}"
                        class="mt-1 w-full p-2 bg-white border border-slate-200 rounded-lg text-sm font-bold text-slate-700 outline-none focus:border-cyan-500">
                </label>
                <button onclick="saveKpiTargets()"
                    class="w-full mt-2 py-2 bg-cyan-600 text-white rounded-lg text-xs font-bold hover:bg-cyan-700">
                    Save Targets
                </button>
                <p class="text-[10px] text-slate-500 mt-1">Last updated: ${escapeHTML(updatedLabel)}</p>
            `;
        }

        async function saveKpiTargets() {
            const savingsInput = document.getElementById('mc-target-savings');
            const runwayInput = document.getElementById('mc-target-runway');
            const overBudgetInput = document.getElementById('mc-target-overbudget');
            if (!savingsInput || !runwayInput || !overBudgetInput) return;

            const savingsRatePct = Math.max(0, Math.min(100, Math.round(Number(savingsInput.value) || 0)));
            const runwayDays = Math.max(0, Math.round(Number(runwayInput.value) || 0));
            const maxOverBudgetCategories = Math.max(0, Math.round(Number(overBudgetInput.value) || 0));

            const nextTargets = {
                savingsRatePct,
                runwayDays,
                maxOverBudgetCategories,
                lastModified: Date.now()
            };

            const db = await getDB();
            db.kpi_targets = nextTargets;
            const persisted = await saveDB(db);
            kpiTargets = persisted.kpi_targets || nextTargets;

            renderMonthlyCloseWizard();
            if (typeof refreshBusinessKPIPanel === 'function') {
                refreshBusinessKPIPanel();
            }
            showToast('✅ KPI targets updated');
        }

        function buildMonthlyCloseChecklist(snapshot, targets) {
            return [
                {
                    label: 'Transactions logged',
                    pass: snapshot.transactionCount > 0,
                    detail: `${snapshot.transactionCount} transaction(s)`
                },
                {
                    label: 'Uncategorized entries',
                    pass: snapshot.uncategorizedCount === 0,
                    detail: snapshot.uncategorizedCount === 0 ? 'None' : `${snapshot.uncategorizedCount} missing category`
                },
                {
                    label: 'Needs review (Others)',
                    pass: snapshot.needsReviewCount === 0,
                    detail: snapshot.needsReviewCount === 0 ? 'None' : `${snapshot.needsReviewCount} transaction(s)`
                },
                {
                    label: 'Budget overages within target',
                    pass: snapshot.budgetSummary.overBudgetCategories <= targets.maxOverBudgetCategories,
                    detail: `${snapshot.budgetSummary.overBudgetCategories} over budget`
                },
                {
                    label: 'Savings target met',
                    pass: snapshot.metrics.savingsRate >= targets.savingsRatePct,
                    detail: `${snapshot.metrics.savingsRate}% vs target ${targets.savingsRatePct}%`
                },
                {
                    label: 'Runway target met',
                    pass: snapshot.runwayDays == null || snapshot.runwayDays >= targets.runwayDays,
                    detail: snapshot.runwayDays == null
                        ? 'No burn rate detected'
                        : `${snapshot.runwayDays} days vs target ${targets.runwayDays}`
                },
                {
                    label: 'Monthly reminders captured',
                    pass: snapshot.remindersDueCount === 0,
                    detail: snapshot.remindersDueCount === 0
                        ? 'No missing monthly reminder category'
                        : `${snapshot.remindersDueCount} reminder category not found`
                }
            ];
        }

        function renderMonthlyCloseKpiCards(snapshot) {
            const kpiGrid = document.getElementById('mc-kpi-grid');
            if (!kpiGrid) return;

            const cards = [
                {
                    label: 'Income',
                    value: fmt(snapshot.metrics.income),
                    tone: 'emerald'
                },
                {
                    label: 'Expenses',
                    value: fmt(snapshot.metrics.expense),
                    tone: 'rose'
                },
                {
                    label: 'Savings Rate',
                    value: `${snapshot.metrics.savingsRate}%`,
                    tone: snapshot.metrics.savingsRate >= 0 ? 'indigo' : 'rose'
                },
                {
                    label: 'Month-end Balance',
                    value: fmt(snapshot.monthEndBalance),
                    tone: snapshot.monthEndBalance >= 0 ? 'slate' : 'rose'
                },
                {
                    label: 'Burn Rate (Monthly)',
                    value: fmt(snapshot.burnRateMonthly),
                    tone: 'amber'
                },
                {
                    label: 'Runway',
                    value: formatRunwayDays(snapshot.runwayDays),
                    tone: (snapshot.runwayDays == null || snapshot.runwayDays >= 90) ? 'emerald' : 'rose'
                }
            ];

            kpiGrid.innerHTML = cards.map(card => `
                <div class="p-3 bg-${card.tone}-50 border border-${card.tone}-200 rounded-xl">
                    <p class="text-[10px] font-black uppercase tracking-wide text-${card.tone}-600">${card.label}</p>
                    <p class="text-base font-bold text-slate-800 mt-1">${card.value}</p>
                </div>
            `).join('');
        }

        function renderMonthlyCloseChecklist(snapshot, targets) {
            const checklist = document.getElementById('mc-checklist');
            if (!checklist) return;

            const checks = buildMonthlyCloseChecklist(snapshot, targets);

            checklist.innerHTML = checks.map(check => `
                <div class="flex items-start justify-between gap-2 p-2.5 rounded-lg border ${check.pass ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-200'}">
                    <div>
                        <p class="font-bold text-slate-700">${check.label}</p>
                        <p class="text-[11px] text-slate-500 mt-0.5">${escapeHTML(check.detail)}</p>
                    </div>
                    <span class="text-[10px] font-black uppercase tracking-wide px-2 py-1 rounded-full ${check.pass ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}">${check.pass ? 'Pass' : 'Check'}</span>
                </div>
            `).join('');
        }

        function renderMonthlyCloseBudgetSummary(snapshot) {
            const el = document.getElementById('mc-budget-summary');
            if (!el) return;

            const summary = snapshot.budgetSummary;
            const base = `
                <div class="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-3">
                    <div class="p-2.5 bg-white border border-slate-200 rounded-lg">
                        <p class="text-[10px] font-black uppercase tracking-wide text-slate-500">Budget Limit</p>
                        <p class="text-sm font-bold text-slate-800 mt-0.5">${fmt(summary.totalBudget)}</p>
                    </div>
                    <div class="p-2.5 bg-white border border-slate-200 rounded-lg">
                        <p class="text-[10px] font-black uppercase tracking-wide text-slate-500">Spent (Budgeted Cats)</p>
                        <p class="text-sm font-bold text-slate-800 mt-0.5">${fmt(summary.budgetSpent)}</p>
                    </div>
                    <div class="p-2.5 bg-white border border-slate-200 rounded-lg">
                        <p class="text-[10px] font-black uppercase tracking-wide text-slate-500">Variance</p>
                        <p class="text-sm font-bold ${summary.budgetVariance >= 0 ? 'text-emerald-600' : 'text-rose-600'} mt-0.5">${fmt(summary.budgetVariance)}</p>
                    </div>
                </div>
            `;

            if (!summary.overages.length) {
                el.innerHTML = `${base}<p class="text-xs text-emerald-700 font-bold">No budget overruns in this month.</p>`;
                return;
            }

            const overageRows = summary.overages.slice(0, 5).map(item => `
                <div class="flex items-center justify-between p-2 bg-white border border-rose-200 rounded-lg">
                    <span class="font-bold text-slate-700">${escapeHTML(item.category)}</span>
                    <span class="text-xs font-bold text-rose-600">+${fmt(item.delta)} over</span>
                </div>
            `).join('');

            el.innerHTML = `${base}
                <p class="text-xs font-bold text-rose-700 mb-2">Over-budget categories:</p>
                <div class="space-y-2">${overageRows}</div>
            `;
        }

        function renderMonthlyCloseHistory() {
            const list = document.getElementById('mc-history-list');
            if (!list) return;

            const closes = [...(monthlyCloseRecords || [])]
                .filter(record => record && record.status === 'closed')
                .sort((a, b) => (b.month || '').localeCompare(a.month || ''));

            if (!closes.length) {
                list.innerHTML = '<p>No month closes yet.</p>';
                return;
            }

            list.innerHTML = closes.slice(0, 8).map(record => {
                const closedAtLabel = record.closedAt ? new Date(record.closedAt).toLocaleDateString() : 'n/a';
                const savingsRate = Number(record.summary?.savingsRate || 0);
                const runwayDays = Number(record.summary?.runwayDays || 0);
                const encodedMonth = encodeInlineArg(record.month);
                return `
                    <div class="p-2.5 bg-white border border-slate-200 rounded-lg">
                        <div class="flex items-center justify-between gap-2">
                            <p class="font-bold text-slate-700">${escapeHTML(getMonthLabel(record.month))}</p>
                            <div class="flex items-center gap-2">
                                <button onclick="exportMonthlyCloseSummaryPDF(decodeURIComponent('${encodedMonth}'))"
                                    class="text-[10px] font-bold text-indigo-600 bg-indigo-50 border border-indigo-200 rounded-full px-2.5 py-1 hover:bg-indigo-100">
                                    Export PDF
                                </button>
                                <span class="text-[10px] font-black uppercase tracking-wide px-2 py-1 rounded-full bg-emerald-100 text-emerald-700">Closed</span>
                            </div>
                        </div>
                        <p class="text-[11px] text-slate-500 mt-1">Closed ${escapeHTML(closedAtLabel)} • Savings ${savingsRate.toFixed(0)}% • Runway ${Math.round(runwayDays)}d</p>
                    </div>
                `;
            }).join('');
        }

        function updateMonthlyCloseStatusPill(monthKey, existingRecord) {
            const pill = document.getElementById('mc-status-pill');
            const lastClosed = document.getElementById('mc-last-closed');
            if (!pill || !lastClosed) return;

            if (existingRecord && existingRecord.status === 'closed') {
                pill.textContent = 'Closed';
                pill.className = 'text-[10px] font-black uppercase tracking-wide px-2 py-1 rounded-full bg-emerald-100 text-emerald-700';
                const closedLabel = existingRecord.closedAt
                    ? new Date(existingRecord.closedAt).toLocaleString()
                    : 'date unavailable';
                lastClosed.textContent = `Closed ${getMonthLabel(monthKey)} on ${closedLabel}.`;
            } else {
                pill.textContent = 'Open';
                pill.className = 'text-[10px] font-black uppercase tracking-wide px-2 py-1 rounded-full bg-amber-100 text-amber-700';
                lastClosed.textContent = `No close record for ${getMonthLabel(monthKey)} yet.`;
            }
        }

        function renderMonthlyCloseWizard() {
            const monthKey = getCloseMonthKeyInputValue();
            if (!monthKey) return;

            const snapshot = computeMonthlyCloseSnapshot(monthKey);
            const targets = getEffectiveKpiTargets();
            const existingRecord = getMonthlyCloseRecord(monthKey);

            renderCloseTargetGuardrails(targets);
            updateMonthlyCloseStatusPill(monthKey, existingRecord);
            renderMonthlyCloseKpiCards(snapshot);
            renderMonthlyCloseChecklist(snapshot, targets);
            renderMonthlyCloseBudgetSummary(snapshot);
            renderMonthlyCloseHistory();

            const saveBtn = document.getElementById('mc-save-btn');
            if (saveBtn) {
                saveBtn.textContent = existingRecord ? 'Update Close' : 'Close Month';
            }
            const exportBtn = document.getElementById('mc-export-btn');
            if (exportBtn) {
                exportBtn.textContent = existingRecord ? 'Export Close Summary PDF' : 'Export Draft Summary PDF';
            }

            updateMonthlyCloseBadge();
        }

        function onMonthlyCloseMonthChange() {
            const monthKey = getCloseMonthKeyInputValue();
            if (!monthKey) return;

            if (monthlyCloseActiveMonthKey !== monthKey) {
                monthlyCloseActiveMonthKey = monthKey;
                const notesEl = document.getElementById('mc-notes');
                const existingRecord = getMonthlyCloseRecord(monthKey);
                if (notesEl) notesEl.value = existingRecord?.notes || '';
            }

            renderMonthlyCloseWizard();
        }

        function openMonthlyCloseModal() {
            const modal = document.getElementById('monthly-close-modal');
            const monthInput = document.getElementById('mc-month');
            if (!modal || !monthInput) return;

            monthInput.value = resolveDefaultCloseMonthKey();
            monthlyCloseActiveMonthKey = null;
            modal.classList.remove('hidden');
            onMonthlyCloseMonthChange();
            if (window.lucide) window.lucide.createIcons();
        }

        function closeMonthlyCloseModal() {
            const modal = document.getElementById('monthly-close-modal');
            if (!modal) return;
            modal.classList.add('hidden');
        }

        async function saveMonthlyClose() {
            const monthKey = getCloseMonthKeyInputValue();
            if (!monthKey) {
                alert('Select a month to close.');
                return;
            }

            const snapshot = computeMonthlyCloseSnapshot(monthKey);
            if (snapshot.transactionCount === 0) {
                const proceed = confirm('No transactions found for this month. Close anyway?');
                if (!proceed) return;
            }

            const notes = String(document.getElementById('mc-notes')?.value || '').trim();
            const nowIso = new Date().toISOString();
            const nowTs = Date.now();

            const db = await getDB();
            db.monthly_closes = Array.isArray(db.monthly_closes) ? db.monthly_closes : [];
            db.kpi_snapshots = Array.isArray(db.kpi_snapshots) ? db.kpi_snapshots : [];
            db.kpi_targets = db.kpi_targets && typeof db.kpi_targets === 'object'
                ? db.kpi_targets
                : getEffectiveKpiTargets();

            const existing = db.monthly_closes.find(record => record && record.month === monthKey);
            const runwayDaysForStorage = Number.isFinite(snapshot.runwayDays) ? Math.max(0, Math.round(snapshot.runwayDays)) : 0;

            const closeRecord = {
                id: existing?.id || `close_${monthKey.replace('-', '')}`,
                month: monthKey,
                status: 'closed',
                notes,
                summary: {
                    income: Number(snapshot.metrics.income || 0),
                    expense: Number(snapshot.metrics.expense || 0),
                    savingsRate: Number(snapshot.metrics.savingsRate || 0),
                    avgDailySpend: Number(snapshot.metrics.avgDailySpend || 0),
                    monthEndBalance: Number(snapshot.monthEndBalance || 0),
                    totalBudget: Number(snapshot.budgetSummary.totalBudget || 0),
                    budgetSpent: Number(snapshot.budgetSummary.budgetSpent || 0),
                    budgetVariance: Number(snapshot.budgetSummary.budgetVariance || 0),
                    overBudgetCategories: Number(snapshot.budgetSummary.overBudgetCategories || 0),
                    transactionCount: Number(snapshot.transactionCount || 0),
                    runwayDays: runwayDaysForStorage,
                    burnRateMonthly: Number(snapshot.burnRateMonthly || 0)
                },
                checklist: {
                    uncategorizedCount: Number(snapshot.uncategorizedCount || 0),
                    needsReviewCount: Number(snapshot.needsReviewCount || 0),
                    remindersDueCount: Number(snapshot.remindersDueCount || 0)
                },
                createdAt: existing?.createdAt || nowIso,
                closedAt: nowIso,
                lastModified: nowTs
            };

            const closeIndex = db.monthly_closes.findIndex(record => record && record.month === monthKey);
            if (closeIndex >= 0) db.monthly_closes[closeIndex] = closeRecord;
            else db.monthly_closes.push(closeRecord);

            const kpiSnapshot = {
                id: `kpi_${monthKey.replace('-', '')}`,
                month: monthKey,
                summary: {
                    income: Number(snapshot.metrics.income || 0),
                    expense: Number(snapshot.metrics.expense || 0),
                    savingsRate: Number(snapshot.metrics.savingsRate || 0),
                    avgDailySpend: Number(snapshot.metrics.avgDailySpend || 0),
                    monthEndBalance: Number(snapshot.monthEndBalance || 0),
                    runwayDays: runwayDaysForStorage,
                    burnRateMonthly: Number(snapshot.burnRateMonthly || 0),
                    overBudgetCategories: Number(snapshot.budgetSummary.overBudgetCategories || 0),
                    transactionCount: Number(snapshot.transactionCount || 0)
                },
                createdAt: nowIso,
                lastModified: nowTs
            };

            const kpiIndex = db.kpi_snapshots.findIndex(item => item && item.month === monthKey);
            if (kpiIndex >= 0) db.kpi_snapshots[kpiIndex] = kpiSnapshot;
            else db.kpi_snapshots.push(kpiSnapshot);

            const persistedDB = await saveDB(db);
            monthlyCloseRecords = persistedDB.monthly_closes || [];
            kpiTargets = persistedDB.kpi_targets || getEffectiveKpiTargets();
            kpiSnapshots = persistedDB.kpi_snapshots || [];

            monthlyCloseActiveMonthKey = monthKey;
            refreshMonthlyCloseUI();
            if (typeof refreshBusinessKPIPanel === 'function') {
                refreshBusinessKPIPanel();
            }
            if (typeof refreshStatementsModuleUI === 'function') {
                refreshStatementsModuleUI();
            }
            showToast(`✅ Closed ${getMonthLabel(monthKey)}`);
        }

        async function exportMonthlyCloseSummaryPDF(monthKeyInput = null) {
            const monthKey = monthKeyInput || getCloseMonthKeyInputValue();
            if (!monthKey) {
                alert('Select a month before exporting.');
                return;
            }

            if (!window.jspdf || !window.jspdf.jsPDF) {
                alert('PDF library is not available.');
                return;
            }

            const snapshot = computeMonthlyCloseSnapshot(monthKey);
            const targets = getEffectiveKpiTargets();
            const checks = buildMonthlyCloseChecklist(snapshot, targets);
            const closeRecord = getMonthlyCloseRecord(monthKey);
            const noteDraft = String(document.getElementById('mc-notes')?.value || '').trim();
            const notes = noteDraft || closeRecord?.notes || '';
            const summaryStatus = closeRecord?.status === 'closed' ? 'Closed' : 'Open';
            const closedAtLabel = closeRecord?.closedAt
                ? new Date(closeRecord.closedAt).toLocaleString()
                : 'Not closed yet';

            try {
                const { jsPDF } = window.jspdf;
                const doc = new jsPDF();
                let cursorY = 16;

                doc.setFontSize(18);
                doc.text('FinanceFlow Monthly Close Summary', 14, cursorY);
                cursorY += 8;

                doc.setFontSize(10);
                doc.text(`Month: ${getMonthLabel(monthKey)} (${monthKey})`, 14, cursorY);
                cursorY += 5;
                doc.text(`Status: ${summaryStatus}`, 14, cursorY);
                cursorY += 5;
                doc.text(`Closed At: ${closedAtLabel}`, 14, cursorY);
                cursorY += 7;

                const kpiRows = [
                    ['Income', fmt(snapshot.metrics.income)],
                    ['Expenses', fmt(snapshot.metrics.expense)],
                    ['Savings Rate', `${snapshot.metrics.savingsRate}%`],
                    ['Month-end Balance', fmt(snapshot.monthEndBalance)],
                    ['Burn Rate (Monthly)', fmt(snapshot.burnRateMonthly)],
                    ['Runway', formatRunwayDays(snapshot.runwayDays)],
                    ['Transaction Count', String(snapshot.transactionCount)],
                    ['Over-budget Categories', String(snapshot.budgetSummary.overBudgetCategories)]
                ];

                doc.autoTable({
                    startY: cursorY,
                    head: [['KPI', 'Value']],
                    body: kpiRows,
                    theme: 'grid',
                    headStyles: { fillColor: [8, 145, 178] },
                    styles: { fontSize: 9 }
                });

                doc.autoTable({
                    startY: doc.lastAutoTable.finalY + 6,
                    head: [['Checklist Item', 'Result', 'Detail']],
                    body: checks.map(check => [check.label, check.pass ? 'Pass' : 'Check', check.detail]),
                    theme: 'grid',
                    headStyles: { fillColor: [79, 70, 229] },
                    styles: { fontSize: 8 }
                });

                const overages = snapshot.budgetSummary.overages || [];
                if (overages.length > 0) {
                    doc.autoTable({
                        startY: doc.lastAutoTable.finalY + 6,
                        head: [['Category', 'Budget', 'Spent', 'Over By']],
                        body: overages.slice(0, 10).map(item => [
                            item.category,
                            fmt(item.limit),
                            fmt(item.spent),
                            fmt(item.delta)
                        ]),
                        theme: 'grid',
                        headStyles: { fillColor: [225, 29, 72] },
                        styles: { fontSize: 8 }
                    });
                }

                if (notes) {
                    const notesStartY = (doc.lastAutoTable?.finalY || cursorY) + 8;
                    const noteLines = doc.splitTextToSize(notes, 180);
                    doc.setFontSize(11);
                    doc.text('Close Notes', 14, notesStartY);
                    doc.setFontSize(9);
                    doc.text(noteLines, 14, notesStartY + 5);
                }

                doc.save(`FinanceFlow_Close_Summary_${monthKey}.pdf`);
                showToast('✅ Close summary PDF exported');
            } catch (error) {
                console.error('Close summary PDF export failed:', error);
                showToast('❌ Could not export close summary PDF');
            }
        }

        function updateMonthlyCloseBadge() {
            const statusEl = document.getElementById('monthly-close-status');
            const btn = document.getElementById('monthly-close-btn');
            if (!statusEl || !btn) return;

            const modal = document.getElementById('monthly-close-modal');
            const isModalOpen = modal && !modal.classList.contains('hidden');
            const monthKey = (isModalOpen ? getCloseMonthKeyInputValue() : null) || resolveDefaultCloseMonthKey();
            const record = getMonthlyCloseRecord(monthKey);
            const closed = !!(record && record.status === 'closed');

            statusEl.textContent = closed ? 'Closed' : 'Open';
            statusEl.classList.remove('bg-cyan-100', 'text-cyan-700', 'bg-amber-100', 'text-amber-700', 'bg-emerald-100', 'text-emerald-700');
            btn.classList.remove('text-cyan-600', 'text-emerald-600');

            if (closed) {
                statusEl.classList.add('bg-emerald-100', 'text-emerald-700');
                btn.classList.add('text-emerald-600');
            } else {
                statusEl.classList.add('bg-cyan-100', 'text-cyan-700');
                btn.classList.add('text-cyan-600');
            }

            btn.title = `${getMonthLabel(monthKey)} is ${closed ? 'closed' : 'open'}`;
        }

        function refreshMonthlyCloseUI() {
            updateMonthlyCloseBadge();
            const modal = document.getElementById('monthly-close-modal');
            if (modal && !modal.classList.contains('hidden')) {
                renderMonthlyCloseWizard();
            } else {
                renderMonthlyCloseHistory();
            }
        }
