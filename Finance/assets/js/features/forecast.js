        // =============================================
        // SECTION 16: 12-MONTH ROLLING FORECAST
        // =============================================

        let rollingForecastChart = null;
        let forecastUIHydrated = false;
        let forecastRefreshSeq = 0;
        let forecastLastPreviewRun = null;
        let forecastBaselineCache = { key: null, value: null };

        function forecastNormalizeMonthKey(value) {
            const raw = String(value || '').trim();
            const match = raw.match(/^(\d{4})-(\d{2})$/);
            if (!match) return null;
            const year = Number(match[1]);
            const month = Number(match[2]);
            if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) return null;
            return `${year}-${String(month).padStart(2, '0')}`;
        }

        function forecastMonthKeyToDate(monthKey) {
            const normalized = forecastNormalizeMonthKey(monthKey);
            if (!normalized) return null;
            const [year, month] = normalized.split('-').map(Number);
            return new Date(year, month - 1, 1);
        }

        function forecastDateToMonthKey(dateValue) {
            const date = dateValue instanceof Date ? dateValue : new Date(dateValue || Date.now());
            return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        }

        function formatMonthKeyLabel(monthKey) {
            const date = forecastMonthKeyToDate(monthKey);
            if (!date) return monthKey || 'Unknown';
            return date.toLocaleDateString('en', { month: 'short', year: '2-digit' });
        }

        function forecastBuildMonthKeys(startMonth, months) {
            const startDate = forecastMonthKeyToDate(startMonth) || new Date(new Date().getFullYear(), new Date().getMonth(), 1);
            const totalMonths = Math.max(3, Math.min(24, Math.round(Number(months) || 12)));
            const out = [];
            for (let i = 0; i < totalMonths; i += 1) {
                out.push(forecastDateToMonthKey(new Date(startDate.getFullYear(), startDate.getMonth() + i, 1)));
            }
            return out;
        }

        function forecastGetTransactionsForMonth(monthKey, allTransactions = null) {
            const date = forecastMonthKeyToDate(monthKey);
            if (!date) return [];
            const year = date.getFullYear();
            const month = date.getMonth() + 1;
            const txs = allTransactions || window.allDecryptedTransactions || [];
            return txs.filter(tx => getTxYear(tx) === year && getTxMonth(tx) === month);
        }

        function forecastAverage(numbers) {
            if (!Array.isArray(numbers) || !numbers.length) return 0;
            return numbers.reduce((sum, n) => sum + (Number(n) || 0), 0) / numbers.length;
        }

        function forecastGetDebtCategorySet() {
            return new Set((window.allDecryptedDebts || []).map(item => String(item?.name || '').trim()).filter(Boolean));
        }

        async function forecastGetCryptoMonthlyBuyMap() {
            const out = Object.create(null);
            if (typeof getDecryptedCrypto !== 'function') return out;

            try {
                const txs = await getDecryptedCrypto();
                (txs || []).forEach(tx => {
                    if (tx.type !== 'buy') return;
                    const ts = Date.parse(tx.date);
                    if (!Number.isFinite(ts)) return;
                    const monthKey = forecastDateToMonthKey(new Date(ts));
                    const total = Number(tx.total ?? tx.phpTotal ?? 0);
                    if (!Number.isFinite(total) || total <= 0) return;
                    out[monthKey] = (out[monthKey] || 0) + total;
                });
            } catch (error) {
                console.error('Forecast crypto monthly map failed:', error);
            }

            return out;
        }

        async function deriveForecastBaselineDefaults(referenceMonthKey) {
            const normalizedReference = forecastNormalizeMonthKey(referenceMonthKey) || forecastDateToMonthKey(new Date());
            const cacheKey = [
                normalizedReference,
                (window.allDecryptedTransactions || []).length,
                (window.allDecryptedDebts || []).length,
                (rawCrypto || []).length
            ].join('|');
            if (forecastBaselineCache.key === cacheKey && forecastBaselineCache.value) {
                return { ...forecastBaselineCache.value };
            }

            const txs = window.allDecryptedTransactions || [];
            const debtCategories = forecastGetDebtCategorySet();
            const recurringFixed = typeof computeRecurringMonthlyExpenseEstimate === 'function'
                ? Number(computeRecurringMonthlyExpenseEstimate() || 0)
                : 0;
            const cryptoMonthlyBuy = await forecastGetCryptoMonthlyBuyMap();

            const refDate = forecastMonthKeyToDate(normalizedReference) || new Date();
            const historyMonthKeys = [];
            for (let i = 0; i < 3; i += 1) {
                historyMonthKeys.push(forecastDateToMonthKey(new Date(refDate.getFullYear(), refDate.getMonth() - i, 1)));
            }

            const monthlyIncome = [];
            const monthlyExpense = [];
            const monthlyDebtService = [];
            const monthlySavings = [];

            historyMonthKeys.forEach(monthKey => {
                const monthTx = forecastGetTransactionsForMonth(monthKey, txs);
                const income = monthTx
                    .filter(tx => tx.type === 'income')
                    .reduce((sum, tx) => sum + (Number(tx.amt) || 0), 0);
                const expense = monthTx
                    .filter(tx => tx.type === 'expense')
                    .reduce((sum, tx) => sum + (Number(tx.amt) || 0), 0);
                const debtService = monthTx
                    .filter(tx => tx.type === 'expense' && debtCategories.has(String(tx.category || '').trim()))
                    .reduce((sum, tx) => sum + (Number(tx.amt) || 0), 0);
                const savings = monthTx
                    .filter(tx => tx.type === 'expense' && String(tx.category || '').trim().toLowerCase() === 'savings')
                    .reduce((sum, tx) => sum + (Number(tx.amt) || 0), 0);

                monthlyIncome.push(income);
                monthlyExpense.push(expense);
                monthlyDebtService.push(debtService);
                monthlySavings.push(savings);
            });

            const incomeBase = Math.max(0, forecastAverage(monthlyIncome));
            const expenseBase = Math.max(0, forecastAverage(monthlyExpense));
            const debtPaymentBase = Math.max(0, forecastAverage(monthlyDebtService));
            const savingsBase = Math.max(0, forecastAverage(monthlySavings));
            const cryptoBuyBase = Math.max(0, forecastAverage(historyMonthKeys.map(k => Number(cryptoMonthlyBuy[k] || 0))));
            const fixedCostsBase = Math.max(0, recurringFixed);
            const variableCostsBase = Math.max(0, expenseBase - fixedCostsBase - debtPaymentBase - savingsBase);
            const investmentBase = Math.max(0, savingsBase + cryptoBuyBase);

            const defaults = {
                incomeBase,
                fixedCostsBase,
                variableCostsBase,
                debtPaymentBase,
                investmentBase
            };

            forecastBaselineCache = {
                key: cacheKey,
                value: defaults
            };

            return { ...defaults };
        }

        function forecastGetDefaultStartMonthFromFilters() {
            const month = document.getElementById('filter-month')?.value;
            const year = document.getElementById('filter-year')?.value;
            if (month && year && month !== 'all' && year !== 'all') {
                return forecastNormalizeMonthKey(`${year}-${String(month).padStart(2, '0')}`) || forecastDateToMonthKey(new Date());
            }
            return forecastDateToMonthKey(new Date());
        }

        function readForecastAssumptionsFromInputs() {
            const defaults = typeof getDefaultForecastAssumptions === 'function'
                ? getDefaultForecastAssumptions()
                : {
                    months: 12,
                    startMonth: forecastDateToMonthKey(new Date()),
                    incomeBase: 0,
                    fixedCostsBase: 0,
                    variableCostsBase: 0,
                    debtPaymentBase: 0,
                    investmentBase: 0,
                    bestIncomeMultiplier: 1.12,
                    bestExpenseMultiplier: 0.9,
                    worstIncomeMultiplier: 0.9,
                    worstExpenseMultiplier: 1.12,
                    includeCryptoInNetWorth: true,
                    lastModified: 0
                };

            return {
                months: defaults.months,
                startMonth: forecastNormalizeMonthKey(document.getElementById('f-start-month')?.value || defaults.startMonth) || forecastDateToMonthKey(new Date()),
                incomeBase: Number(document.getElementById('f-income-base')?.value || defaults.incomeBase || 0),
                fixedCostsBase: Number(document.getElementById('f-fixed-base')?.value || defaults.fixedCostsBase || 0),
                variableCostsBase: Number(document.getElementById('f-variable-base')?.value || defaults.variableCostsBase || 0),
                debtPaymentBase: Number(document.getElementById('f-debt-base')?.value || defaults.debtPaymentBase || 0),
                investmentBase: Number(document.getElementById('f-invest-base')?.value || defaults.investmentBase || 0),
                bestIncomeMultiplier: Number(document.getElementById('f-best-income-mult')?.value || defaults.bestIncomeMultiplier || 1.12),
                bestExpenseMultiplier: Number(document.getElementById('f-best-expense-mult')?.value || defaults.bestExpenseMultiplier || 0.9),
                worstIncomeMultiplier: Number(document.getElementById('f-worst-income-mult')?.value || defaults.worstIncomeMultiplier || 0.9),
                worstExpenseMultiplier: Number(document.getElementById('f-worst-expense-mult')?.value || defaults.worstExpenseMultiplier || 1.12),
                includeCryptoInNetWorth: true,
                lastModified: Date.now()
            };
        }

        function applyForecastAssumptionsToInputs(assumptions) {
            const source = assumptions || {};
            const setValue = (id, value) => {
                const el = document.getElementById(id);
                if (!el) return;
                el.value = value;
            };

            setValue('f-start-month', source.startMonth || forecastDateToMonthKey(new Date()));
            setValue('f-income-base', Number(source.incomeBase || 0).toFixed(2));
            setValue('f-fixed-base', Number(source.fixedCostsBase || 0).toFixed(2));
            setValue('f-variable-base', Number(source.variableCostsBase || 0).toFixed(2));
            setValue('f-debt-base', Number(source.debtPaymentBase || 0).toFixed(2));
            setValue('f-invest-base', Number(source.investmentBase || 0).toFixed(2));
            setValue('f-best-income-mult', Number(source.bestIncomeMultiplier || 1.12).toFixed(2));
            setValue('f-best-expense-mult', Number(source.bestExpenseMultiplier || 0.9).toFixed(2));
            setValue('f-worst-income-mult', Number(source.worstIncomeMultiplier || 0.9).toFixed(2));
            setValue('f-worst-expense-mult', Number(source.worstExpenseMultiplier || 1.12).toFixed(2));
        }

        function forecastBuildScenarioRows(monthKeys, startCash, assumptions, incomeMultiplier, expenseMultiplier) {
            let cash = Number(startCash || 0);

            return monthKeys.map(month => {
                const openingCash = cash;
                const income = Math.max(0, Number(assumptions.incomeBase || 0) * incomeMultiplier);
                const fixedCosts = Math.max(0, Number(assumptions.fixedCostsBase || 0));
                const variableCosts = Math.max(0, Number(assumptions.variableCostsBase || 0) * expenseMultiplier);
                const debtPayment = Math.max(0, Number(assumptions.debtPaymentBase || 0));
                const investmentContribution = Math.max(0, Number(assumptions.investmentBase || 0));
                const totalOutflow = fixedCosts + variableCosts + debtPayment + investmentContribution;
                const netCashFlow = income - totalOutflow;
                cash = openingCash + netCashFlow;

                const burnBase = fixedCosts + variableCosts + debtPayment;
                const runwayDays = burnBase > 0
                    ? Math.max(0, Math.floor((cash / burnBase) * 30))
                    : 0;

                return {
                    month,
                    openingCash,
                    income,
                    fixedCosts,
                    variableCosts,
                    debtPayment,
                    investmentContribution,
                    netCashFlow,
                    closingCash: cash,
                    runwayDays
                };
            });
        }

        function buildForecastRun(assumptions, monthKeys, startCash) {
            const base = forecastBuildScenarioRows(monthKeys, startCash, assumptions, 1, 1);
            const best = forecastBuildScenarioRows(
                monthKeys,
                startCash,
                assumptions,
                Number(assumptions.bestIncomeMultiplier || 1.12),
                Number(assumptions.bestExpenseMultiplier || 0.9)
            );
            const worst = forecastBuildScenarioRows(
                monthKeys,
                startCash,
                assumptions,
                Number(assumptions.worstIncomeMultiplier || 0.9),
                Number(assumptions.worstExpenseMultiplier || 1.12)
            );

            return {
                id: `forecast_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
                startMonth: assumptions.startMonth,
                assumptionsSnapshot: { ...assumptions },
                scenarios: { base, best, worst },
                summary: {
                    baseEndCash: base.length ? base[base.length - 1].closingCash : startCash,
                    bestEndCash: best.length ? best[best.length - 1].closingCash : startCash,
                    worstEndCash: worst.length ? worst[worst.length - 1].closingCash : startCash,
                    baseMinCash: base.length ? Math.min(...base.map(row => Number(row.closingCash || 0))) : startCash
                },
                createdAt: new Date().toISOString(),
                lastModified: Date.now()
            };
        }

        function renderForecastChartFromRun(run) {
            const canvas = document.getElementById('forecast-chart');
            if (!canvas || !run || typeof Chart === 'undefined') return;

            if (rollingForecastChart) {
                rollingForecastChart.destroy();
                rollingForecastChart = null;
            }

            const baseRows = run.scenarios?.base || [];
            const bestRows = run.scenarios?.best || [];
            const worstRows = run.scenarios?.worst || [];

            rollingForecastChart = new Chart(canvas, {
                type: 'line',
                data: {
                    labels: baseRows.map(row => formatMonthKeyLabel(row.month)),
                    datasets: [
                        {
                            label: 'Base',
                            data: baseRows.map(row => Number(row.closingCash || 0)),
                            borderColor: '#4f46e5',
                            backgroundColor: 'rgba(79, 70, 229, 0.08)',
                            fill: true,
                            tension: 0.3,
                            pointRadius: 0
                        },
                        {
                            label: 'Best',
                            data: bestRows.map(row => Number(row.closingCash || 0)),
                            borderColor: '#10b981',
                            backgroundColor: 'rgba(16, 185, 129, 0.06)',
                            fill: false,
                            tension: 0.3,
                            pointRadius: 0
                        },
                        {
                            label: 'Worst',
                            data: worstRows.map(row => Number(row.closingCash || 0)),
                            borderColor: '#ef4444',
                            backgroundColor: 'rgba(239, 68, 68, 0.06)',
                            fill: false,
                            tension: 0.3,
                            pointRadius: 0
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: 'bottom',
                            labels: { boxWidth: 10, font: { size: 10 } }
                        },
                        tooltip: {
                            callbacks: {
                                label: (ctx) => `${ctx.dataset.label}: ${formatCurrency(ctx.parsed.y, activeCurrency)}`
                            }
                        }
                    },
                    scales: {
                        y: {
                            ticks: {
                                callback: (value) => formatCurrency(Number(value || 0), activeCurrency)
                            }
                        }
                    }
                }
            });
        }

        function getLatestForecastRun() {
            const runs = Array.isArray(forecastRuns) ? [...forecastRuns] : [];
            runs.sort((a, b) => Number(b?.lastModified || 0) - Number(a?.lastModified || 0));
            return runs[0] || null;
        }

        function getForecastRunForDisplay() {
            return forecastLastPreviewRun || getLatestForecastRun();
        }

        function renderForecastTableFromLatestRun() {
            const tableBody = document.getElementById('forecast-table-body');
            const summaryEl = document.getElementById('forecast-summary');
            if (!tableBody || !summaryEl) return;

            const run = getForecastRunForDisplay();
            if (!run) {
                tableBody.innerHTML = '<tr><td colspan="5" class="px-2 py-3 text-center text-slate-400">No forecast rows yet.</td></tr>';
                summaryEl.textContent = 'Run forecast to see summary.';
                return;
            }

            const scenarioKey = document.getElementById('forecast-scenario-view')?.value || 'base';
            const rows = run.scenarios?.[scenarioKey] || [];
            if (!rows.length) {
                tableBody.innerHTML = '<tr><td colspan="5" class="px-2 py-3 text-center text-slate-400">No rows for this scenario.</td></tr>';
                summaryEl.textContent = 'No rows in selected scenario.';
                return;
            }

            tableBody.innerHTML = rows.map(row => {
                const totalOutflow = Number(row.fixedCosts || 0) + Number(row.variableCosts || 0) + Number(row.debtPayment || 0) + Number(row.investmentContribution || 0);
                const netCashFlow = Number(row.netCashFlow || 0);
                const netClass = netCashFlow >= 0 ? 'text-emerald-600' : 'text-rose-600';

                return `
                    <tr>
                        <td class="px-2 py-1.5 font-bold text-slate-700">${escapeHTML(formatMonthKeyLabel(row.month))}</td>
                        <td class="px-2 py-1.5 text-right text-slate-600">${fmt(Number(row.income || 0))}</td>
                        <td class="px-2 py-1.5 text-right text-slate-600">${fmt(totalOutflow)}</td>
                        <td class="px-2 py-1.5 text-right font-bold ${netClass}">${fmt(netCashFlow)}</td>
                        <td class="px-2 py-1.5 text-right font-bold text-slate-800">${fmt(Number(row.closingCash || 0))}</td>
                    </tr>
                `;
            }).join('');

            const summary = run.summary || {};
            summaryEl.textContent = `Base end: ${fmt(Number(summary.baseEndCash || 0))} • Base minimum: ${fmt(Number(summary.baseMinCash || 0))} • Best end: ${fmt(Number(summary.bestEndCash || 0))} • Worst end: ${fmt(Number(summary.worstEndCash || 0))}`;
        }

        async function persistForecastArtifacts(assumptions, run) {
            const db = await getDB();
            db.forecast_assumptions = {
                ...assumptions,
                lastModified: Date.now()
            };

            db.forecast_runs = Array.isArray(db.forecast_runs) ? db.forecast_runs : [];
            if (run) {
                db.forecast_runs.unshift(run);
            }
            db.forecast_runs = db.forecast_runs.slice(0, 24);

            const persisted = await saveDB(db);
            forecastAssumptions = persisted.forecast_assumptions || db.forecast_assumptions;
            forecastRuns = persisted.forecast_runs || db.forecast_runs;
            return persisted;
        }

        async function runTwelveMonthForecast(persist = true) {
            const statusEl = document.getElementById('forecast-status');
            if (statusEl) statusEl.textContent = 'Running forecast...';

            try {
                const rawAssumptions = readForecastAssumptionsFromInputs();
                const assumptions = typeof normalizeForecastAssumptionsShape === 'function'
                    ? normalizeForecastAssumptionsShape(rawAssumptions)
                    : rawAssumptions;

                const monthKeys = forecastBuildMonthKeys(assumptions.startMonth, assumptions.months);
                const startCash = computeCurrentBalance(window.allDecryptedTransactions || []);
                const run = buildForecastRun(assumptions, monthKeys, startCash);

                forecastLastPreviewRun = run;
                renderForecastChartFromRun(run);
                renderForecastTableFromLatestRun();

                if (persist) {
                    await persistForecastArtifacts(assumptions, run);
                    forecastLastPreviewRun = null;
                    renderForecastChartFromRun(getLatestForecastRun());
                    renderForecastTableFromLatestRun();
                    if (statusEl) statusEl.textContent = `Saved ${new Date().toLocaleTimeString()}`;
                    showToast('✅ 12-month forecast saved');
                } else if (statusEl) {
                    statusEl.textContent = 'Preview generated (not saved)';
                }

                if (typeof refreshStatementsModuleUI === 'function') {
                    refreshStatementsModuleUI();
                }
            } catch (error) {
                console.error('Forecast run failed:', error);
                if (statusEl) statusEl.textContent = 'Forecast failed. Try again.';
                showToast('❌ Could not run forecast');
            }
        }

        async function refreshForecastModuleUI() {
            const statusEl = document.getElementById('forecast-status');
            if (!statusEl) return;

            const seq = ++forecastRefreshSeq;
            const storedAssumptions = (forecastAssumptions && typeof forecastAssumptions === 'object')
                ? forecastAssumptions
                : {};
            const monthFallback = forecastGetDefaultStartMonthFromFilters();

            try {
                const baseline = await deriveForecastBaselineDefaults(storedAssumptions.startMonth || monthFallback);
                if (seq !== forecastRefreshSeq) return;

                const merged = typeof normalizeForecastAssumptionsShape === 'function'
                    ? normalizeForecastAssumptionsShape({
                        ...baseline,
                        ...storedAssumptions,
                        startMonth: storedAssumptions.startMonth || monthFallback
                    })
                    : {
                        ...baseline,
                        ...storedAssumptions,
                        startMonth: storedAssumptions.startMonth || monthFallback
                    };

                const activeElementId = document.activeElement?.id || '';
                const userEditingForecastField = activeElementId.startsWith('f-');
                if (!forecastUIHydrated || !userEditingForecastField) {
                    applyForecastAssumptionsToInputs(merged);
                    forecastUIHydrated = true;
                }

                forecastRuns = (Array.isArray(forecastRuns) ? forecastRuns : [])
                    .slice()
                    .sort((a, b) => Number(b?.lastModified || 0) - Number(a?.lastModified || 0));

                const latestRun = getLatestForecastRun();
                if (latestRun) {
                    renderForecastChartFromRun(latestRun);
                    renderForecastTableFromLatestRun();
                    statusEl.textContent = latestRun.createdAt
                        ? `Last saved: ${new Date(latestRun.createdAt).toLocaleString()}`
                        : 'Forecast loaded.';
                } else {
                    if (rollingForecastChart) {
                        rollingForecastChart.destroy();
                        rollingForecastChart = null;
                    }
                    renderForecastTableFromLatestRun();
                    statusEl.textContent = 'No forecast run yet.';
                }
            } catch (error) {
                console.error('Forecast module refresh failed:', error);
                statusEl.textContent = 'Forecast unavailable.';
            }
        }
