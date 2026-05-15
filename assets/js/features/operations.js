        // =============================================
        // SECTION 18: OPERATING REVIEW MODULE (SPRINT 3)
        // =============================================

        let operationsReviewHydrated = false;
        let operationsReviewRenderSeq = 0;
        let operationsReviewRowsCache = [];
        let operationsReviewLastContext = {
            scenarioKey: 'base',
            endMonthKey: null,
            hasForecast: false
        };

        function opNormalizeMonthKey(value) {
            const raw = String(value || '').trim();
            const match = raw.match(/^(\d{4})-(\d{2})$/);
            if (!match) return null;
            const year = Number(match[1]);
            const month = Number(match[2]);
            if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) return null;
            return `${year}-${String(month).padStart(2, '0')}`;
        }

        function opMonthKeyToDate(monthKey) {
            const normalized = opNormalizeMonthKey(monthKey);
            if (!normalized) return null;
            const [year, month] = normalized.split('-').map(Number);
            return new Date(year, month - 1, 1);
        }

        function opDateToMonthKey(dateValue) {
            const date = dateValue instanceof Date ? dateValue : new Date(dateValue || Date.now());
            return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        }

        function opShiftMonthKey(monthKey, offset) {
            const date = opMonthKeyToDate(monthKey);
            if (!date) return null;
            return opDateToMonthKey(new Date(date.getFullYear(), date.getMonth() + Number(offset || 0), 1));
        }

        function opMonthLabel(monthKey) {
            const date = opMonthKeyToDate(monthKey);
            if (!date) return monthKey || 'Unknown';
            return date.toLocaleDateString('en', { month: 'short', year: '2-digit' });
        }

        function opBuildMonthKeys(endMonthKey, count = 12) {
            const normalizedEnd = opNormalizeMonthKey(endMonthKey) || opDateToMonthKey(new Date());
            const total = Math.max(3, Math.min(24, Math.round(Number(count) || 12)));
            const out = [];
            for (let i = total - 1; i >= 0; i -= 1) {
                const monthKey = opShiftMonthKey(normalizedEnd, -i);
                if (monthKey) out.push(monthKey);
            }
            return out;
        }

        function opGetDefaultGuardrails() {
            if (typeof getDefaultOperationsGuardrails === 'function') {
                return getDefaultOperationsGuardrails();
            }
            return {
                incomeVarianceWarnPct: 12,
                outflowVarianceWarnPct: 12,
                cashFloor: 0,
                lastModified: 0
            };
        }

        function opNormalizeGuardrails(raw) {
            if (typeof normalizeOperationsGuardrailsShape === 'function') {
                return normalizeOperationsGuardrailsShape(raw);
            }

            const defaults = opGetDefaultGuardrails();
            const source = raw && typeof raw === 'object' ? raw : {};
            return {
                incomeVarianceWarnPct: Math.max(0, Math.min(100, Number(source.incomeVarianceWarnPct ?? defaults.incomeVarianceWarnPct) || 0)),
                outflowVarianceWarnPct: Math.max(0, Math.min(100, Number(source.outflowVarianceWarnPct ?? defaults.outflowVarianceWarnPct) || 0)),
                cashFloor: Math.max(0, Number(source.cashFloor ?? defaults.cashFloor) || 0),
                lastModified: Math.max(0, Number(source.lastModified ?? defaults.lastModified) || 0)
            };
        }

        function opGetEffectiveGuardrails() {
            const merged = {
                ...opGetDefaultGuardrails(),
                ...(operationsGuardrails && typeof operationsGuardrails === 'object' ? operationsGuardrails : {})
            };
            return opNormalizeGuardrails(merged);
        }

        function opApplyGuardrailsToInputs(guardrails) {
            const source = guardrails || opGetEffectiveGuardrails();
            const setValue = (id, value) => {
                const el = document.getElementById(id);
                if (!el) return;
                el.value = value;
            };

            setValue('op-income-warn', Math.round(Number(source.incomeVarianceWarnPct || 0)));
            setValue('op-outflow-warn', Math.round(Number(source.outflowVarianceWarnPct || 0)));
            setValue('op-cash-floor', Number(source.cashFloor || 0).toFixed(2));
        }

        function opReadGuardrailsFromInputs() {
            const defaults = opGetEffectiveGuardrails();
            return opNormalizeGuardrails({
                incomeVarianceWarnPct: Number(document.getElementById('op-income-warn')?.value || defaults.incomeVarianceWarnPct),
                outflowVarianceWarnPct: Number(document.getElementById('op-outflow-warn')?.value || defaults.outflowVarianceWarnPct),
                cashFloor: Number(document.getElementById('op-cash-floor')?.value || defaults.cashFloor),
                lastModified: Date.now()
            });
        }

        function opGetSelectedScenarioKey() {
            const value = String(document.getElementById('op-scenario')?.value || 'base').toLowerCase();
            if (value === 'best' || value === 'worst') return value;
            return 'base';
        }

        function opGetTargetEndMonthKey() {
            const statementsMonth = opNormalizeMonthKey(document.getElementById('st-month')?.value);
            if (statementsMonth) return statementsMonth;

            const filterMonth = document.getElementById('filter-month')?.value;
            const filterYear = document.getElementById('filter-year')?.value;
            if (filterMonth && filterYear && filterMonth !== 'all' && filterYear !== 'all') {
                return opNormalizeMonthKey(`${filterYear}-${String(filterMonth).padStart(2, '0')}`) || opDateToMonthKey(new Date());
            }

            return opDateToMonthKey(new Date());
        }

        function opFindLatestForecastRun() {
            if (typeof getLatestForecastRun === 'function') {
                return getLatestForecastRun();
            }

            const runs = Array.isArray(forecastRuns) ? [...forecastRuns] : [];
            runs.sort((a, b) => Number(b?.lastModified || 0) - Number(a?.lastModified || 0));
            return runs[0] || null;
        }

        function opBuildForecastMap(run, scenarioKey) {
            const map = new Map();
            const rows = run?.scenarios?.[scenarioKey] || [];
            (rows || []).forEach(row => {
                const month = opNormalizeMonthKey(row?.month);
                if (!month) return;
                const income = Number(row?.income || 0);
                const outflow = Number(row?.fixedCosts || 0)
                    + Number(row?.variableCosts || 0)
                    + Number(row?.debtPayment || 0)
                    + Number(row?.investmentContribution || 0);
                const closingCash = Number(row?.closingCash || 0);
                map.set(month, {
                    income,
                    outflow,
                    closingCash
                });
            });
            return map;
        }

        function opGetCloseStatus(monthKey) {
            const record = (monthlyCloseRecords || []).find(item => item?.month === monthKey);
            return record?.status === 'closed' ? 'closed' : 'open';
        }

        async function opResolveStatementForMonth(monthKey) {
            const closed = opGetCloseStatus(monthKey) === 'closed';
            const snapshot = typeof getStatementSnapshotByMonth === 'function'
                ? getStatementSnapshotByMonth(monthKey)
                : null;

            if (closed && snapshot) {
                return { statement: snapshot, source: 'snapshot' };
            }

            if (typeof computeStatementForMonth === 'function') {
                const live = await computeStatementForMonth(monthKey);
                if (live) return { statement: live, source: 'live' };
            }

            if (snapshot) {
                return { statement: snapshot, source: 'snapshot' };
            }

            return { statement: null, source: 'none' };
        }

        function opDeltaPct(actual, expected) {
            const base = Number(expected || 0);
            const value = Number(actual || 0);
            if (!Number.isFinite(base) || base <= 0 || !Number.isFinite(value)) return null;
            return ((value - base) / base) * 100;
        }

        function opFmtPct(value) {
            if (!Number.isFinite(value)) return 'n/a';
            return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
        }

        function opFmtCashDelta(value) {
            if (!Number.isFinite(value)) return 'n/a';
            return `${value >= 0 ? '+' : ''}${fmt(value)}`;
        }

        async function computeOperationsReviewRows(monthKeys, scenarioKey, guardrails, forecastRun) {
            const forecastByMonth = opBuildForecastMap(forecastRun, scenarioKey);
            const rows = [];

            for (const monthKey of monthKeys) {
                const { statement, source } = await opResolveStatementForMonth(monthKey);
                const forecast = forecastByMonth.get(monthKey) || null;

                const actualIncome = statement ? Number(statement?.pnl?.income || 0) : null;
                const actualOutflow = statement
                    ? Number(statement?.pnl?.operatingExpenses || 0)
                        + Number(statement?.pnl?.debtService || 0)
                        + Number(statement?.pnl?.growthSpend || 0)
                    : null;
                const actualCash = statement ? Number(statement?.balanceSheet?.cash || 0) : null;

                const forecastIncome = forecast ? Number(forecast.income || 0) : null;
                const forecastOutflow = forecast ? Number(forecast.outflow || 0) : null;
                const forecastCash = forecast ? Number(forecast.closingCash || 0) : null;

                const incomeVariancePct = (actualIncome == null || forecastIncome == null)
                    ? null
                    : opDeltaPct(actualIncome, forecastIncome);
                const outflowVariancePct = (actualOutflow == null || forecastOutflow == null)
                    ? null
                    : opDeltaPct(actualOutflow, forecastOutflow);
                const cashDelta = (actualCash == null || forecastCash == null)
                    ? null
                    : (actualCash - forecastCash);

                const alerts = [];
                if (incomeVariancePct != null && incomeVariancePct < (-1 * Number(guardrails.incomeVarianceWarnPct || 0))) {
                    alerts.push(`Income ${opFmtPct(incomeVariancePct)}`);
                }
                if (outflowVariancePct != null && outflowVariancePct > Number(guardrails.outflowVarianceWarnPct || 0)) {
                    alerts.push(`Outflow ${opFmtPct(outflowVariancePct)}`);
                }
                if (actualCash != null && actualCash < Number(guardrails.cashFloor || 0)) {
                    alerts.push('Cash below floor');
                }
                if (!statement) {
                    alerts.push('No statement data');
                }

                rows.push({
                    month: monthKey,
                    closeStatus: opGetCloseStatus(monthKey),
                    source,
                    actualIncome,
                    actualOutflow,
                    actualCash,
                    forecastIncome,
                    forecastOutflow,
                    forecastCash,
                    incomeVariancePct,
                    outflowVariancePct,
                    cashDelta,
                    alerts
                });
            }

            return rows;
        }

        function renderOperationsReviewTable(rows) {
            const body = document.getElementById('op-review-body');
            if (!body) return;

            if (!Array.isArray(rows) || !rows.length) {
                body.innerHTML = '<tr><td colspan="5" class="px-2 py-3 text-center text-slate-400">No operating review rows yet.</td></tr>';
                return;
            }

            body.innerHTML = rows.map(row => {
                const incomeClass = row.incomeVariancePct == null
                    ? 'text-slate-400'
                    : (row.incomeVariancePct >= 0 ? 'text-emerald-600' : 'text-rose-600');
                const outflowClass = row.outflowVariancePct == null
                    ? 'text-slate-400'
                    : (row.outflowVariancePct <= 0 ? 'text-emerald-600' : 'text-rose-600');
                const cashClass = row.cashDelta == null
                    ? 'text-slate-400'
                    : (row.cashDelta >= 0 ? 'text-emerald-600' : 'text-rose-600');

                const closePillClass = row.closeStatus === 'closed'
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-amber-100 text-amber-700';

                const alertMarkup = row.alerts.length
                    ? row.alerts.map(item => `<span class="inline-flex items-center px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 mr-1 mb-1">${escapeHTML(item)}</span>`).join('')
                    : '<span class="text-emerald-600">None</span>';

                const cashCompareText = (row.actualCash == null || row.forecastCash == null)
                    ? 'n/a'
                    : `${opFmtCashDelta(row.cashDelta)} (${fmt(row.actualCash)} / ${fmt(row.forecastCash)})`;

                return `
                    <tr>
                        <td class="px-2 py-1.5 font-bold text-slate-700">
                            ${escapeHTML(opMonthLabel(row.month))}
                            <span class="ml-1 align-middle inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wide ${closePillClass}">${row.closeStatus}</span>
                        </td>
                        <td class="px-2 py-1.5 text-right font-bold ${incomeClass}">${opFmtPct(row.incomeVariancePct)}</td>
                        <td class="px-2 py-1.5 text-right font-bold ${outflowClass}">${opFmtPct(row.outflowVariancePct)}</td>
                        <td class="px-2 py-1.5 text-right font-bold ${cashClass}">${cashCompareText}</td>
                        <td class="px-2 py-1.5 text-[10px] leading-tight text-slate-700">${alertMarkup}</td>
                    </tr>
                `;
            }).join('');
        }

        function renderOperationsReviewSummary(rows, scenarioKey, endMonthKey, hasForecast) {
            const statusEl = document.getElementById('op-status');
            const summaryEl = document.getElementById('op-summary');
            if (!statusEl || !summaryEl) return;

            if (!Array.isArray(rows) || !rows.length) {
                statusEl.textContent = 'No rows to review.';
                summaryEl.textContent = 'Run forecast + statements to populate review.';
                return;
            }

            const alertMonths = rows.filter(row => row.alerts.length > 0).length;
            const incomeValues = rows.map(row => row.incomeVariancePct).filter(Number.isFinite);
            const outflowValues = rows.map(row => row.outflowVariancePct).filter(Number.isFinite);
            const worstIncome = incomeValues.length ? Math.min(...incomeValues) : null;
            const worstOutflow = outflowValues.length ? Math.max(...outflowValues) : null;

            statusEl.textContent = hasForecast
                ? `${scenarioKey.toUpperCase()} scenario • 12 months ending ${opMonthLabel(endMonthKey)}`
                : 'No saved forecast run (actual-only review)';

            summaryEl.textContent = `Reviewed ${rows.length} month(s) • Alert months ${alertMonths} • Worst income variance ${opFmtPct(worstIncome)} • Worst outflow variance ${opFmtPct(worstOutflow)}`;
        }

        async function refreshOperationsReviewModuleUI() {
            const statusEl = document.getElementById('op-status');
            if (!statusEl) return;

            const seq = ++operationsReviewRenderSeq;

            try {
                const guardrails = opGetEffectiveGuardrails();
                const activeElementId = document.activeElement?.id || '';
                const userEditing = activeElementId.startsWith('op-') && activeElementId !== 'op-scenario';
                if (!operationsReviewHydrated || !userEditing) {
                    opApplyGuardrailsToInputs(guardrails);
                    operationsReviewHydrated = true;
                }

                const scenarioKey = opGetSelectedScenarioKey();
                const endMonthKey = opGetTargetEndMonthKey();
                const monthKeys = opBuildMonthKeys(endMonthKey, 12);

                const latestForecast = opFindLatestForecastRun();
                const rows = await computeOperationsReviewRows(monthKeys, scenarioKey, guardrails, latestForecast);

                if (seq !== operationsReviewRenderSeq) return;

                operationsReviewRowsCache = rows;
                operationsReviewLastContext = {
                    scenarioKey,
                    endMonthKey,
                    hasForecast: !!latestForecast
                };

                renderOperationsReviewTable(rows);
                renderOperationsReviewSummary(rows, scenarioKey, endMonthKey, !!latestForecast);
            } catch (error) {
                console.error('Operations review refresh failed:', error);
                if (seq !== operationsReviewRenderSeq) return;
                statusEl.textContent = 'Operating review unavailable.';
                const summaryEl = document.getElementById('op-summary');
                if (summaryEl) summaryEl.textContent = 'Could not compute operating review right now.';
            }
        }

        async function saveOperationsGuardrails() {
            try {
                const nextGuardrails = {
                    ...opReadGuardrailsFromInputs(),
                    lastModified: Date.now()
                };
                const db = await getDB();
                db.operations_guardrails = nextGuardrails;
                const persisted = await saveDB(db);
                operationsGuardrails = persisted.operations_guardrails || nextGuardrails;
                operationsReviewHydrated = true;
                showToast('✅ Operating guardrails saved');
                await refreshOperationsReviewModuleUI();
            } catch (error) {
                console.error('Failed to save operating guardrails:', error);
                showToast('❌ Could not save operating guardrails');
            }
        }

        async function exportOperationsReviewPDF() {
            if (!window.jspdf || !window.jspdf.jsPDF) {
                alert('PDF library is not available.');
                return;
            }

            if (!operationsReviewRowsCache.length) {
                await refreshOperationsReviewModuleUI();
            }

            const rows = operationsReviewRowsCache || [];
            if (!rows.length) {
                showToast('❌ No operating review data to export');
                return;
            }

            const guardrails = opGetEffectiveGuardrails();
            const scenarioKey = operationsReviewLastContext.scenarioKey || opGetSelectedScenarioKey();
            const endMonthKey = operationsReviewLastContext.endMonthKey || opGetTargetEndMonthKey();

            try {
                const { jsPDF } = window.jspdf;
                const doc = new jsPDF();

                doc.setFontSize(18);
                doc.text('FinanceFlow Operating Review', 14, 16);
                doc.setFontSize(10);
                doc.text(`Window: 12 months ending ${opMonthLabel(endMonthKey)} (${endMonthKey})`, 14, 23);
                doc.text(`Scenario: ${scenarioKey.toUpperCase()}`, 14, 28);
                doc.text(
                    `Guardrails: Income ${guardrails.incomeVarianceWarnPct}% | Outflow ${guardrails.outflowVarianceWarnPct}% | Cash floor ${fmt(guardrails.cashFloor)}`,
                    14,
                    33
                );

                const tableRows = rows.map(row => {
                    const cashCompare = (row.actualCash == null || row.forecastCash == null)
                        ? 'n/a'
                        : `${opFmtCashDelta(row.cashDelta)} (${fmt(row.actualCash)} / ${fmt(row.forecastCash)})`;
                    return [
                        `${opMonthLabel(row.month)} (${row.closeStatus})`,
                        opFmtPct(row.incomeVariancePct),
                        opFmtPct(row.outflowVariancePct),
                        cashCompare,
                        row.alerts.length ? row.alerts.join('; ') : 'None'
                    ];
                });

                doc.autoTable({
                    startY: 38,
                    head: [['Month', 'Income Var', 'Outflow Var', 'Cash vs F/C', 'Alerts']],
                    body: tableRows,
                    theme: 'grid',
                    headStyles: { fillColor: [8, 145, 178] },
                    styles: { fontSize: 8 }
                });

                doc.save(`FinanceFlow_Operating_Review_${endMonthKey}.pdf`);
                showToast('✅ Operating review PDF exported');
            } catch (error) {
                console.error('Operating review PDF export failed:', error);
                showToast('❌ Could not export operating review PDF');
            }
        }
