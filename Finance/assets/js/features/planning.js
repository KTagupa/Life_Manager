        // =============================================
        // SECTION 13: GOALS & SCENARIO PLANNING
        // =============================================

        function getFinancePlanningPresentation() {
            if (typeof buildFinancePlanningPresentation !== 'function') return null;
            const context = typeof getRuntimeFinanceClassificationContext === 'function'
                ? getRuntimeFinanceClassificationContext()
                : {};
            return buildFinancePlanningPresentation({
                transactions: window.allDecryptedTransactions || [],
                budgets: typeof budgets === 'object' && budgets ? budgets : {},
                bills: window.allDecryptedBills || [],
                goals: typeof financialGoals !== 'undefined' ? financialGoals : [],
                wishlist: window.allDecryptedWishlist || []
            }, { context });
        }

        function setFinancePlanText(id, value) {
            const element = document.getElementById(id);
            if (element) element.textContent = value;
        }

        function formatFinancePlanDate(dateKey) {
            if (!dateKey) return 'No target date';
            const date = new Date(`${dateKey}T00:00:00`);
            return Number.isFinite(date.getTime())
                ? date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
                : 'Date unavailable';
        }

        function renderFinancePlanBudgetPanel(presentation) {
            const container = document.getElementById('finance-plan-budget-panel');
            if (!container || !presentation) return;
            const budget = presentation.budget;
            setFinancePlanText('finance-plan-budget-caption', `For ${presentation.periodLabel}`);

            if (!budget.configuredCount) {
                container.innerHTML = `
                    <div class="finance-plan-empty-state">
                        <i data-lucide="wallet-minimal" class="w-5 h-5" aria-hidden="true"></i>
                        <p>No monthly category limits are configured.</p>
                        <button type="button" data-finance-plan-action="manage_budgets">Set budgets</button>
                    </div>`;
                return;
            }

            const rows = budget.rows.slice(0, 6).map(row => {
                const safeCategory = escapeHTML(row.category);
                const percentage = Math.max(0, Math.min(100, Number(row.utilization || 0)));
                const statusLabel = row.status === 'over'
                    ? `${fmt(Math.abs(row.remaining))} over`
                    : `${fmt(Math.max(0, row.remaining))} left`;
                return `
                    <div class="finance-plan-budget-row" data-budget-status="${row.status}">
                        <div>
                            <span>${safeCategory}</span>
                            <strong>${fmt(row.spent)} of ${fmt(row.limit)}</strong>
                        </div>
                        <div class="finance-plan-budget-track" aria-hidden="true">
                            <span style="width:${percentage}%"></span>
                        </div>
                        <small>${escapeHTML(statusLabel)}</small>
                    </div>`;
            }).join('');

            container.innerHTML = `
                <div class="finance-plan-budget-totals">
                    <div><span>Limits</span><strong>${fmt(budget.totalLimit)}</strong></div>
                    <div><span>Used</span><strong>${fmt(budget.budgetedSpending)}</strong></div>
                    <div data-budget-status="${budget.remaining < 0 ? 'over' : 'on_track'}"><span>Remaining</span><strong>${fmt(budget.remaining)}</strong></div>
                </div>
                <div class="finance-plan-budget-list">${rows}</div>
                ${budget.unbudgetedSpending > 0
                    ? `<p class="finance-plan-budget-note">${fmt(budget.unbudgetedSpending)} of current-month Spending is in categories without a limit.</p>`
                    : ''}`;
        }

        function renderFinancePlanAttention(attention) {
            const container = document.getElementById('finance-plan-attention-list');
            if (!container) return;
            container.innerHTML = (attention || []).map(item => `
                <article class="finance-plan-attention-item" data-plan-tone="${escapeAttr(item.tone)}">
                    <div>
                        <strong>${escapeHTML(item.title)}</strong>
                        <p>${escapeHTML(item.detail)}</p>
                    </div>
                    <button type="button" data-finance-plan-action="${escapeAttr(item.actionId)}">${escapeHTML(item.actionLabel)}</button>
                </article>`).join('');
        }

        function renderFinancePlanCoordinator() {
            const presentation = getFinancePlanningPresentation();
            if (!presentation) return;
            window.financePlanningPresentation = presentation;

            setFinancePlanText('finance-plan-period', `For ${presentation.periodLabel} • Updated as of ${formatFinancePlanDate(presentation.asOf)}`);
            setFinancePlanText('finance-plan-budget-value', presentation.budget.configuredCount ? fmt(presentation.budget.remaining) : 'Not set');
            setFinancePlanText('finance-plan-budget-detail', presentation.budget.configuredCount
                ? `${fmt(presentation.budget.budgetedSpending)} of ${fmt(presentation.budget.totalLimit)} used`
                : 'Add at least one category limit');
            setFinancePlanText('finance-plan-bills-value', String(presentation.bills.activeCount));
            setFinancePlanText('finance-plan-bills-detail', `${fmt(presentation.bills.monthlyExpected)} expected monthly`);
            setFinancePlanText('finance-plan-goals-value', String(presentation.goals.activeCount));
            setFinancePlanText('finance-plan-goals-detail', `${fmt(presentation.goals.targetTotal)} combined targets`);
            setFinancePlanText('finance-plan-wishlist-value', fmt(presentation.wishlist.plannedTotal));
            setFinancePlanText('finance-plan-wishlist-detail', `${presentation.wishlist.count} ${presentation.wishlist.count === 1 ? 'planned purchase' : 'planned purchases'}`);

            const coordinator = document.getElementById('finance-plan-coordinator');
            if (coordinator) {
                coordinator.dataset.budgetStatus = presentation.budget.status;
                coordinator.dataset.attentionCount = String(presentation.attention.length);
            }
            renderFinancePlanBudgetPanel(presentation);
            renderFinancePlanAttention(presentation.attention);
            if (window.lucide) window.lucide.createIcons();
        }

        function focusFinancePlanCard(cardId) {
            const card = document.getElementById(cardId);
            if (!card) return;
            card.scrollIntoView({ behavior: 'smooth', block: 'start' });
            card.focus({ preventScroll: true });
        }

        function handleFinancePlanAction(actionId) {
            if (actionId === 'manage_budgets' && typeof openBudgetModal === 'function') return openBudgetModal();
            if (actionId === 'manage_goals' && typeof openPlanningModal === 'function') return openPlanningModal();
            if (actionId === 'add_bill' && typeof openBillModal === 'function') return openBillModal();
            if (actionId === 'add_wishlist' && typeof openWishlistModal === 'function') return openWishlistModal();
            const targets = {
                focus_budgets: 'finance-card-plan-budget',
                focus_bills: 'finance-card-bills',
                focus_goals: 'finance-card-goals',
                focus_wishlist: 'finance-card-wishlist'
            };
            if (targets[actionId]) focusFinancePlanCard(targets[actionId]);
        }

        function initFinancePlanCoordination() {
            if (window.__financePlanCoordinationInitialized) return;
            window.__financePlanCoordinationInitialized = true;
            document.addEventListener('click', event => {
                const action = event.target.closest('[data-finance-plan-action]');
                if (!action) return;
                event.preventDefault();
                handleFinancePlanAction(action.dataset.financePlanAction);
            });
        }

        window.getFinancePlanningPresentation = getFinancePlanningPresentation;
        window.renderFinancePlanCoordinator = renderFinancePlanCoordinator;
        window.initFinancePlanCoordination = initFinancePlanCoordination;

        function openPlanningModal() {
            document.getElementById('planning-modal').classList.remove('hidden');
            const allTx = window.allDecryptedTransactions || [];
            const current = computeSummaryMetrics(allTx, 'current_month', { filteredTransactions: window.filteredTransactions || [] });
            const plan = getFinancePlanningPresentation();
            if (!document.getElementById('sc-salary-amount').value) {
                document.getElementById('sc-salary-amount').value = current.income ? current.income.toFixed(2) : '';
            }
            if (!document.getElementById('sc-fixed-obligations').value) {
                const fixedObligations = plan?.bills?.monthlyExpected || current.expense || 0;
                document.getElementById('sc-fixed-obligations').value = fixedObligations ? fixedObligations.toFixed(2) : '';
            }
            renderGoalsAndSimulator();
            if (!scenarioChart) runScenarioSimulation();
            if (typeof refreshForecastModuleUI === 'function') {
                refreshForecastModuleUI();
            }
            if (typeof refreshStatementsModuleUI === 'function') {
                refreshStatementsModuleUI();
            }
        }

        function getGoalProgress(goal, currentBalance) {
            if (!goal || !goal.targetAmount) return 0;
            const progress = (currentBalance / goal.targetAmount) * 100;
            return Math.max(0, Math.min(100, progress));
        }

        function renderGoalsSummaryCards(targetElId, compact = false) {
            const el = document.getElementById(targetElId);
            if (!el) return;

            const activeGoals = (financialGoals || []).filter(g => (g.status || 'active') === 'active');
            const currentBalance = computeCurrentBalance(window.allDecryptedTransactions || []);

            if (!activeGoals.length) {
                el.innerHTML = '<div class="text-xs text-slate-400">No active goals configured.</div>';
                return;
            }

            el.innerHTML = activeGoals.map(g => {
                const progress = getGoalProgress(g, currentBalance);
                const dateLabel = g.targetDate ? new Date(g.targetDate).toLocaleDateString() : 'No date';
                const safeName = escapeHTML(g.name || 'Goal');
                const safeDateLabel = escapeHTML(dateLabel);
                return `
                    <div class="p-2 ${compact ? 'bg-slate-50 border border-slate-200 rounded-lg' : 'bg-white border border-slate-200 rounded-xl'}">
                        <div class="flex justify-between items-center">
                            <p class="text-xs font-bold text-slate-700">${safeName}</p>
                            <span class="text-[10px] font-bold text-slate-500">Cash proxy ${progress.toFixed(0)}%</span>
                        </div>
                        <p class="text-[10px] text-slate-500">${fmt(g.targetAmount)} • ${safeDateLabel}</p>
                        <div class="h-1.5 bg-slate-100 rounded-full mt-1 overflow-hidden">
                            <div class="h-full bg-indigo-500" style="width:${progress}%"></div>
                        </div>
                    </div>
                `;
            }).join('');
        }

        function renderGoalsAndSimulator() {
            renderGoalsSummaryCards('goals-summary-list', true);
            renderFinancePlanCoordinator();
            const modalVisible = !document.getElementById('planning-modal')?.classList.contains('hidden');
            if (modalVisible) {
                renderDetailedGoalsListWithActions();
            } else {
                renderGoalsSummaryCards('planning-goals-list', false);
            }
        }

        async function saveFinancialGoal() {
            const id = document.getElementById('pg-id').value || `goal_${Date.now().toString(36)}`;
            const type = document.getElementById('pg-type').value;
            const status = document.getElementById('pg-status').value;
            const name = document.getElementById('pg-name').value.trim();
            const targetAmount = parseFloat(document.getElementById('pg-target').value);
            const targetDate = document.getElementById('pg-date').value;
            const linkedCategory = document.getElementById('pg-linked-category').value.trim() || null;

            if (!name || !targetAmount) {
                showToast('⚠️ Enter goal name and target amount');
                return;
            }

            const goal = {
                id,
                type,
                name,
                targetAmount,
                targetDate: targetDate || null,
                linkedCategory,
                status,
                createdAt: new Date().toISOString(),
                lastModified: Date.now()
            };

            const idx = (financialGoals || []).findIndex(g => g.id === id);
            if (idx >= 0) {
                const prev = financialGoals[idx];
                financialGoals[idx] = { ...prev, ...goal, createdAt: prev.createdAt || goal.createdAt };
            } else {
                financialGoals.push(goal);
            }

            const db = await getDB();
            db.goals = financialGoals;
            await saveDB(db);

            document.getElementById('pg-id').value = '';
            document.getElementById('pg-name').value = '';
            document.getElementById('pg-target').value = '';
            document.getElementById('pg-date').value = '';
            document.getElementById('pg-linked-category').value = '';
            document.getElementById('pg-status').value = 'active';
            document.getElementById('pg-type').value = 'emergency_fund';

            renderGoalsAndSimulator();
            runScenarioSimulation();
            showToast('✅ Goal saved');
        }

        async function deleteFinancialGoal(id) {
            if (!confirm('Delete this goal?')) return;
            financialGoals = (financialGoals || []).filter(g => g.id !== id);
            const db = await getDB();
            db.goals = financialGoals;
            await saveDB(db);
            renderGoalsAndSimulator();
            runScenarioSimulation();
            showToast('🗑️ Goal deleted');
        }

        function hydrateGoalEditor(id) {
            const goal = (financialGoals || []).find(g => g.id === id);
            if (!goal) return;
            document.getElementById('pg-id').value = goal.id;
            document.getElementById('pg-type').value = goal.type || 'savings';
            document.getElementById('pg-status').value = goal.status || 'active';
            document.getElementById('pg-name').value = goal.name || '';
            document.getElementById('pg-target').value = goal.targetAmount || '';
            document.getElementById('pg-date').value = goal.targetDate ? new Date(goal.targetDate).toISOString().split('T')[0] : '';
            document.getElementById('pg-linked-category').value = goal.linkedCategory || '';
        }

        function renderDetailedGoalsListWithActions() {
            const el = document.getElementById('planning-goals-list');
            if (!el) return;
            const currentBalance = computeCurrentBalance(window.allDecryptedTransactions || []);
            if (!(financialGoals || []).length) {
                el.innerHTML = '<div class="text-xs text-slate-400">No goals yet.</div>';
                return;
            }

            el.innerHTML = financialGoals.map(g => {
                const progress = getGoalProgress(g, currentBalance);
                const statusColor = g.status === 'completed' ? 'emerald' : g.status === 'paused' ? 'amber' : 'indigo';
                const safeName = escapeHTML(g.name || 'Goal');
                const safeNameAttr = escapeAttr(g.name || 'Goal');
                const safeType = escapeHTML((g.type || 'savings').replace('_', ' '));
                const safeStatus = escapeHTML(g.status || 'active');
                const safeDate = g.targetDate ? `• ${escapeHTML(new Date(g.targetDate).toLocaleDateString())}` : '';
                const encodedGoalId = encodeInlineArg(g.id);
                return `
                    <div class="p-3 bg-white border border-slate-200 rounded-xl">
                        <div class="flex justify-between items-start gap-3">
                            <div>
                                <p class="text-sm font-bold text-slate-700">${safeName}</p>
                                <p class="text-[10px] text-slate-500 uppercase">${safeType} • ${safeStatus}</p>
                                <p class="text-[10px] text-slate-500">${fmt(g.targetAmount)} ${safeDate} • Cash proxy ${progress.toFixed(0)}%</p>
                            </div>
                            <div class="flex gap-2">
                                <button type="button" aria-label="Edit ${safeNameAttr}" onclick="hydrateGoalEditor(decodeURIComponent('${encodedGoalId}'))" class="text-[10px] font-bold text-indigo-600">Edit</button>
                                <button type="button" aria-label="Delete ${safeNameAttr}" onclick="deleteFinancialGoal(decodeURIComponent('${encodedGoalId}'))" class="text-[10px] font-bold text-rose-600">Delete</button>
                            </div>
                        </div>
                        <div class="h-1.5 bg-slate-100 rounded-full mt-2 overflow-hidden">
                            <div class="h-full bg-${statusColor}-500" style="width:${progress}%"></div>
                        </div>
                    </div>
                `;
            }).join('');
        }

        function drawScenarioChart(points) {
            const ctx = document.getElementById('scenario-chart');
            if (!ctx) return;
            if (scenarioChart) scenarioChart.destroy();

            scenarioChart = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: points.map(p => p.label),
                    datasets: [{
                        label: 'Projected Balance',
                        data: points.map(p => p.balance),
                        borderColor: '#10b981',
                        backgroundColor: 'rgba(16,185,129,0.08)',
                        fill: true,
                        tension: 0.25,
                        pointRadius: 0
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            callbacks: {
                                label: (ctxPoint) => formatCurrency(ctxPoint.parsed.y, activeCurrency)
                            }
                        }
                    },
                    scales: {
                        y: {
                            ticks: {
                                callback: value => formatCurrency(value, activeCurrency)
                            }
                        }
                    }
                }
            });
        }

        function renderWishlistAffordability(points, fixedMonthlyObligations) {
            const el = document.getElementById('wishlist-affordability');
            if (!el) return;
            const items = (window.allDecryptedWishlist || []).filter(i => i.amt && !i.deletedAt).slice(0, 8);
            if (!items.length) {
                el.innerText = 'No wishlist items with amounts available.';
                return;
            }

            const projectedMin = Math.min(...points.map(p => p.balance));
            const buffer = (fixedMonthlyObligations || 0) * 0.3;
            el.innerHTML = items.map(item => {
                const remaining = projectedMin - item.amt;
                let score = 'safe';
                let color = 'text-emerald-600';
                if (remaining < 0) {
                    score = 'risky';
                    color = 'text-rose-600';
                } else if (remaining < buffer) {
                    score = 'medium';
                    color = 'text-amber-600';
                }
                const safeDesc = escapeHTML(item.desc || 'Item');
                return `<div class="flex justify-between p-2 bg-white border border-slate-200 rounded-lg">
                    <span>${safeDesc}</span>
                    <span class="font-bold ${color}">${score.toUpperCase()}</span>
                </div>`;
            }).join('');
        }

        function runScenarioSimulation() {
            const salaryDay = Math.max(1, Math.min(31, parseInt(document.getElementById('sc-salary-day').value || '1', 10)));
            const salaryAmount = parseFloat(document.getElementById('sc-salary-amount').value || '0') || 0;
            const fixedMonthly = parseFloat(document.getElementById('sc-fixed-obligations').value || '0') || 0;
            const extraSaving = parseFloat(document.getElementById('sc-extra-saving').value || '0') || 0;
            const extraDebt = parseFloat(document.getElementById('sc-extra-debt').value || '0') || 0;

            const startBalance = computeCurrentBalance(window.allDecryptedTransactions || []);
            const dailyOut = (fixedMonthly + extraSaving + extraDebt) / 30;

            const today = new Date();
            const points = [];
            let balance = startBalance;

            for (let i = 0; i <= 45; i++) {
                const d = new Date(today);
                d.setDate(today.getDate() + i);

                if (d.getDate() === salaryDay) balance += salaryAmount;
                balance -= dailyOut;

                points.push({
                    date: new Date(d),
                    label: `${d.getMonth() + 1}/${d.getDate()}`,
                    balance
                });
            }

            drawScenarioChart(points);
            renderDetailedGoalsListWithActions();
            renderGoalsSummaryCards('goals-summary-list', true);

            const activeGoals = (financialGoals || []).filter(g => (g.status || 'active') === 'active');
            const etaLines = activeGoals.map(g => {
                const hit = points.find(p => p.balance >= g.targetAmount);
                if (!hit) return `${g.name}: not reached in 45 days`;
                return `${g.name}: ${hit.date.toLocaleDateString()}`;
            });

            const minBalance = Math.min(...points.map(p => p.balance));
            const warnings = [];
            if (minBalance < 0) warnings.push('Projected balance dips below zero.');
            if (minBalance < fixedMonthly * 0.2) warnings.push('Cash buffer is tight relative to fixed obligations.');
            if (!warnings.length) warnings.push('Projection remains within positive safety range.');

            const safeEtaLines = escapeHTML(etaLines.length ? etaLines.join(' | ') : 'No active goals');
            const safeWarnings = escapeHTML(warnings.join(' '));
            document.getElementById('scenario-summary').innerHTML = `
                <p><strong>Start:</strong> ${fmt(startBalance)} | <strong>Projected Min:</strong> ${fmt(minBalance)} | <strong>End (45d):</strong> ${fmt(points[points.length - 1].balance)}</p>
                <p class="mt-1"><strong>Goal ETA:</strong> ${safeEtaLines}</p>
                <p class="mt-1"><strong>Risk:</strong> ${safeWarnings}</p>
            `;

            renderWishlistAffordability(points, fixedMonthly);
        }
