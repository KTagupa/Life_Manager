        // =============================================
        // SECTION 5: CHARTS & FILTERS
        // =============================================
        function getPrimaryMonthFilterControl() {
            return document.getElementById('filter-month');
        }

        function getPrimaryYearFilterControl() {
            return document.getElementById('filter-year');
        }

        function getPrimarySearchFilterControl() {
            return document.getElementById('search-transactions');
        }

        function getActivityTypeFilterControl() {
            return document.getElementById('activity-filter-type');
        }

        function getActivityClassificationContext() {
            return typeof getRuntimeFinanceClassificationContext === 'function'
                ? getRuntimeFinanceClassificationContext()
                : {};
        }

        function matchesActivityTypeFilter(transaction, requestedType, context = null) {
            const type = String(requestedType || 'all');
            if (type === 'all') return true;
            if (typeof matchesFinanceActivityFilter === 'function') {
                return matchesFinanceActivityFilter(transaction, type, {
                    context: context || getActivityClassificationContext()
                });
            }
            if (type === 'earned_income') {
                return typeof getDisplayTxEarnedIncomeDelta === 'function'
                    ? getDisplayTxEarnedIncomeDelta(transaction) > 0
                    : transaction?.type === 'income';
            }
            if (type === 'other_cash_in') {
                return typeof getDisplayTxOtherCashInDelta === 'function'
                    ? getDisplayTxOtherCashInDelta(transaction) > 0
                    : ['non_income_cash_in', 'crypto_sell_proceeds'].includes(transaction?.type);
            }
            if (type === 'spending') {
                return typeof getDisplayTxSpendingDelta === 'function'
                    ? getDisplayTxSpendingDelta(transaction) > 0
                    : transaction?.type === 'expense';
            }
            if (type === 'settlements') {
                if (typeof classifyFinanceTransaction === 'function') {
                    const context = typeof getRuntimeFinanceClassificationContext === 'function'
                        ? getRuntimeFinanceClassificationContext()
                        : {};
                    return Number(classifyFinanceTransaction(transaction, context)?.settlementDelta || 0) > 0;
                }
                return ['credit_card_payment', 'installment_payment'].includes(transaction?.type);
            }
            return true;
        }

        function getSelectedFilterText(control, fallback) {
            return control?.selectedOptions?.[0]?.textContent?.trim() || fallback;
        }

        function updateActivityFilterSummary(visibleTransactions, periodTransactions, activityType, context) {
            const summary = document.getElementById('activity-filter-summary');
            const list = document.getElementById('transaction-list');
            if (!summary) return;

            const visible = Array.isArray(visibleTransactions) ? visibleTransactions : [];
            const period = Array.isArray(periodTransactions) ? periodTransactions : [];
            const classificationLabel = getSelectedFilterText(getActivityTypeFilterControl(), 'All movements');
            const monthLabel = getSelectedFilterText(getPrimaryMonthFilterControl(), 'All months');
            const yearLabel = getSelectedFilterText(getPrimaryYearFilterControl(), 'All years');
            const scopeParts = [monthLabel, yearLabel].filter(label => !/^All\b/i.test(label));
            const reviewCount = typeof buildFinanceActivityPresentation === 'function'
                ? visible.filter(transaction => buildFinanceActivityPresentation(transaction, { context }).reviewRequired).length
                : 0;
            const countText = activityType === 'all'
                ? `${visible.length} ${visible.length === 1 ? 'movement' : 'movements'}`
                : `${visible.length} of ${period.length} movements`;
            const filters = [activityType === 'all' ? null : classificationLabel, ...scopeParts].filter(Boolean);
            summary.textContent = [
                countText,
                filters.length ? filters.join(' • ') : null,
                reviewCount ? `${reviewCount} ${reviewCount === 1 ? 'item needs' : 'items need'} review` : null
            ].filter(Boolean).join(' • ');
            summary.dataset.visibleCount = String(visible.length);
            summary.dataset.periodCount = String(period.length);
            summary.dataset.classification = activityType;
            if (list) list.setAttribute('aria-label', `Activity movements. ${summary.textContent}`);
        }

        function getFilterToolbarState() {
            return {
                month: getPrimaryMonthFilterControl()?.value || 'all',
                year: getPrimaryYearFilterControl()?.value || 'all',
                search: getPrimarySearchFilterControl()?.value || '',
                activityType: getActivityTypeFilterControl()?.value || 'all',
                scope: metricScope || 'selected_period'
            };
        }

        function applyFinanceTheme(scope = metricScope) {
            if (!document.body) return;
            document.body.setAttribute('data-finance-theme', scope || 'selected_period');
        }

        function updateScopeSliderState(scope = metricScope) {
            document.querySelectorAll('[data-scope-slider]').forEach(slider => {
                slider.dataset.activeScope = scope || 'selected_period';

                slider.querySelectorAll('[data-scope-option]').forEach(button => {
                    const isActive = button.dataset.scopeOption === scope;
                    button.classList.toggle('is-active', isActive);
                    button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
                });
            });
        }

        function syncToolbarControls() {
            const state = getFilterToolbarState();

            document.querySelectorAll('[data-filter-month]').forEach(control => {
                if (control.value !== state.month) control.value = state.month;
            });

            document.querySelectorAll('[data-filter-year]').forEach(control => {
                if (control.value !== state.year) control.value = state.year;
            });

            document.querySelectorAll('[data-filter-search]').forEach(control => {
                if (control.value !== state.search) control.value = state.search;
            });

            const metricScopeSel = document.getElementById('metric-scope');
            if (metricScopeSel && metricScopeSel.value !== state.scope) {
                metricScopeSel.value = state.scope;
            }

            updateScopeSliderState(state.scope);
            applyFinanceTheme(state.scope);
            const reportPeriodDisabled = state.scope !== 'selected_period';
            document.querySelectorAll('[data-report-period-control]').forEach(field => {
                field.dataset.disabled = reportPeriodDisabled ? 'true' : 'false';
                const control = field.querySelector('select');
                if (control) control.disabled = reportPeriodDisabled;
            });
        }

        function bindFilterToolbarControls() {
            if (window.__financeFilterControlsBound) return;
            window.__financeFilterControlsBound = true;

            document.querySelectorAll('[data-filter-month]').forEach(control => {
                control.addEventListener('change', () => {
                    const primary = getPrimaryMonthFilterControl();
                    if (primary && control !== primary) primary.value = control.value;
                    syncToolbarControls();
                    applyFilters();
                });
            });

            document.querySelectorAll('[data-filter-year]').forEach(control => {
                control.addEventListener('change', () => {
                    const primary = getPrimaryYearFilterControl();
                    if (primary && control !== primary) primary.value = control.value;
                    syncToolbarControls();
                    applyFilters();
                });
            });

            document.querySelectorAll('[data-filter-search]').forEach(control => {
                control.addEventListener('input', () => {
                    const primary = getPrimarySearchFilterControl();
                    if (primary && control !== primary) primary.value = control.value;
                    syncToolbarControls();
                    applyFilters();
                });
            });

            document.querySelectorAll('[data-filter-reset]').forEach(button => {
                button.addEventListener('click', () => {
                    resetFilters();
                });
            });

            const activityTypeFilter = getActivityTypeFilterControl();
            if (activityTypeFilter) {
                activityTypeFilter.addEventListener('change', () => applyFilters());
            }

            document.querySelectorAll('[data-scope-option]').forEach(button => {
                button.addEventListener('click', () => {
                    setMetricScope(button.dataset.scopeOption || 'selected_period');
                });
            });
        }

        function initFilters() {
            const monthControls = document.querySelectorAll('[data-filter-month]');
            const yearControls = document.querySelectorAll('[data-filter-year]');
            const months = ["All", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

            const monthMarkup = months.map((m, i) => `<option value="${i === 0 ? 'all' : i}">${m}</option>`).join('');
            monthControls.forEach(control => {
                control.innerHTML = monthMarkup;
            });

            // Year: Current +/- 5
            const curY = new Date().getFullYear();
            let ops = `<option value="all">All Years</option>`;
            for (let i = curY - 2; i <= curY + 2; i++) ops += `<option value="${i}" ${i === curY ? 'selected' : ''}>${i}</option>`;
            yearControls.forEach(control => {
                control.innerHTML = ops;
            });

            // Set current month default
            const primaryMonth = getPrimaryMonthFilterControl();
            const primaryYear = getPrimaryYearFilterControl();
            if (primaryMonth) primaryMonth.value = String(new Date().getMonth() + 1);
            if (primaryYear) primaryYear.value = String(curY);

            const metricScopeSel = document.getElementById('metric-scope');
            if (metricScopeSel) metricScopeSel.value = metricScope;

            bindFilterToolbarControls();
            syncToolbarControls();
        }

        let trendsChart = null;

        function resizeFinanceChartsForActiveView(event) {
            if (event?.detail?.viewId !== 'reports') return;

            window.requestAnimationFrame(() => {
                [spendChart, trendsChart, window.revenueDiversificationChart]
                    .filter(chart => chart && typeof chart.resize === 'function')
                    .forEach(chart => chart.resize());
            });
        }

        window.addEventListener('finance:viewchange', resizeFinanceChartsForActiveView);

        function initChart() {
            if (spendChart) return spendChart;
            const canvas = document.getElementById('spendChart');
            if (!canvas || typeof Chart !== 'function') return null;
            const ctx = canvas.getContext('2d');
            spendChart = new Chart(ctx, {
                type: 'doughnut',
                data: {
                    labels: [],
                    datasets: [{
                        data: [],
                        backgroundColor: [
                            '#4f46e5', '#059669', '#e11d48', '#d97706', '#8b5cf6', '#db2777', '#2563eb', '#64748b'
                        ],
                        borderWidth: 0
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { position: 'right', labels: { boxWidth: 10, usePointStyle: true, font: { size: 10 } } }
                    },
                    cutout: '70%'
                }
            });
            return spendChart;
        }

        async function renderTrendsChart() {
            const ctx = document.getElementById('trendsChart');
            if (!ctx) return;

            if (trendsChart) trendsChart.destroy();

            const presentation = typeof getFinanceReportsPresentation === 'function'
                ? getFinanceReportsPresentation()
                : null;
            const transactions = typeof getFinanceReportsScopedTransactions === 'function'
                ? getFinanceReportsScopedTransactions()
                : getTransactionsForScope(metricScope, window.allDecryptedTransactions || [], window.filteredTransactions || []);
            const granularity = presentation?.scope?.trendGranularity || 'month';
            const trendData = {};
            const start = new Date(presentation?.scope?.start || Date.now());
            const end = new Date(presentation?.scope?.end || Date.now());

            if (granularity === 'day' && Number.isFinite(start.getTime()) && Number.isFinite(end.getTime())) {
                for (let date = new Date(start.getFullYear(), start.getMonth(), start.getDate()); date <= end; date.setDate(date.getDate() + 1)) {
                    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
                    trendData[key] = { income: 0, expense: 0 };
                }
            } else if (Number.isFinite(start.getTime()) && Number.isFinite(end.getTime())) {
                for (let date = new Date(start.getFullYear(), start.getMonth(), 1); date <= end; date.setMonth(date.getMonth() + 1)) {
                    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
                    trendData[key] = { income: 0, expense: 0 };
                }
            }

            transactions.forEach(t => {
                const date = new Date(getTxTimestamp(t));
                if (!Number.isFinite(date.getTime())) return;
                const key = granularity === 'day'
                    ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
                    : `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
                if (!trendData[key]) trendData[key] = { income: 0, expense: 0 };
                trendData[key].income += typeof getDisplayTxEarnedIncomeDelta === 'function'
                        ? getDisplayTxEarnedIncomeDelta(t)
                        : (typeof getTxReportedIncomeDelta === 'function' ? getTxReportedIncomeDelta(t) : 0);
                trendData[key].expense += typeof getDisplayTxSpendingDelta === 'function'
                        ? getDisplayTxSpendingDelta(t)
                        : (typeof getTxExpenseDelta === 'function' ? getTxExpenseDelta(t) : 0);
            });

            const keys = Object.keys(trendData).sort();
            const labels = keys.map(key => {
                const [year, month, day] = key.split('-').map(Number);
                return new Date(year, month - 1, day || 1).toLocaleDateString('en', granularity === 'day'
                    ? { month: 'short', day: 'numeric' }
                    : { month: 'short', year: '2-digit' });
            });
            const title = document.getElementById('reports-trends-title');
            if (title) {
                title.lastChild.textContent = granularity === 'day'
                    ? ' Daily Income and Spending'
                    : ' Monthly Income and Spending';
            }

            trendsChart = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'Earned Income',
                        data: keys.map(key => trendData[key].income),
                        borderColor: '#10b981',
                        backgroundColor: 'rgba(16, 185, 129, 0.1)',
                        tension: 0.4,
                        fill: true
                    }, {
                        label: 'Spending',
                        data: keys.map(key => trendData[key].expense),
                        borderColor: '#f43f5e',
                        backgroundColor: 'rgba(244, 63, 94, 0.1)',
                        tension: 0.4,
                        fill: true
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 10 } } }
                    },
                    scales: {
                        y: { beginAtZero: true }
                    }
                }
            });
        }

        async function loadAndRender() {
            // Decrypt all first
            const decrypted = (await Promise.all(rawTransactions.map(async i => {
                const d = await decryptData(i.data);
                if (!d) return null;
                const hydrated = {
                    ...d,
                    id: i.id,
                    createdAt: i.createdAt || null,
                    lastModified: i.lastModified || 0
                };
                hydrateTransactionCache(hydrated);
                return hydrated;
            }))).filter(x => x);

            const dateQuality = typeof partitionFinanceTransactionsByDate === 'function'
                ? partitionFinanceTransactionsByDate(decrypted)
                : {
                    transactionCount: decrypted.length,
                    usableCount: decrypted.length,
                    canonicalCount: decrypted.length,
                    warningCount: 0,
                    quarantinedCount: 0,
                    repairableCount: 0,
                    usableTransactions: decrypted,
                    canonicalTransactions: decrypted,
                    warningEntries: [],
                    quarantinedEntries: [],
                    repairableEntries: []
                };
            const usableTransactions = [...dateQuality.usableTransactions]
                .sort((a, b) => getTxTimestamp(b) - getTxTimestamp(a));

            // Only usable dates enter metrics, charts, filters, or Activity.
            // Quarantined records remain encrypted in storage until repaired.
            window.financeTransactionDateQuality = dateQuality;
            window.quarantinedFinanceTransactions = dateQuality.quarantinedEntries;
            window.allDecryptedTransactions = usableTransactions;
            if (typeof refreshFinanceDateQualityUI === 'function') {
                refreshFinanceDateQualityUI(dateQuality);
            }
            applyFilters();
        }

        function applyFilters() {
            const m = getPrimaryMonthFilterControl()?.value || 'all';
            const y = getPrimaryYearFilterControl()?.value || 'all';
            const searchQuery = getPrimarySearchFilterControl()?.value.toLowerCase() || '';
            const activityType = getActivityTypeFilterControl()?.value || 'all';

            syncToolbarControls();

            let filtered = [...(window.allDecryptedTransactions || [])];

            if (y !== 'all') {
                filtered = filtered.filter(t => getTxYear(t) == y);
            }
            if (m !== 'all') {
                filtered = filtered.filter(t => getTxMonth(t) == m);
            }
            if (searchQuery) {
                filtered = filtered.filter(t =>
                    getTxSearchText(t).includes(searchQuery)
                );
            }

            const sortedForDisplay = sortRecentMovementTransactions(filtered);
            const classificationContext = getActivityClassificationContext();
            const activityTransactions = sortedForDisplay.filter(transaction =>
                matchesActivityTypeFilter(transaction, activityType, classificationContext)
            );

            window.filteredTransactions = sortedForDisplay;
            filteredTransactions = sortedForDisplay;

            // Render only after the shadow gate reflects this exact vault and
            // filter state; this avoids a one-frame stale canonical cutover.
            if (typeof refreshFinanceMetricShadow === 'function') {
                refreshFinanceMetricShadow();
            }
            if (typeof scheduleFinanceSnapshotShadowRefresh === 'function') {
                scheduleFinanceSnapshotShadowRefresh();
            }
            if (typeof refreshFinanceMetricCutoverUI === 'function') {
                refreshFinanceMetricCutoverUI();
            }

            const scopedTransactions = getTransactionsForScope(metricScope, window.allDecryptedTransactions, sortedForDisplay);
            window.financeActivityRouteData = {
                activityTransactions,
                sortedTransactions: sortedForDisplay,
                activityType,
                classificationContext,
                scopedTransactions
            };
            const activeViewId = typeof getFinanceActiveViewId === 'function'
                ? getFinanceActiveViewId()
                : (document.body?.dataset?.financeActiveView || 'overview');
            Promise.resolve(renderFinanceRouteData(activeViewId, { reason: 'filters' })).catch(error => {
                console.error('[finance-routes] Active route render failed.', error);
            });
        }

        async function renderFinanceRouteData(viewId, options = {}) {
            const routeId = String(viewId || 'overview').replace(/^#/, '').toLowerCase();
            const routeData = window.financeActivityRouteData || {
                activityTransactions: window.filteredTransactions || [],
                sortedTransactions: window.filteredTransactions || [],
                activityType: getActivityTypeFilterControl()?.value || 'all',
                classificationContext: getActivityClassificationContext(),
                scopedTransactions: window.filteredTransactions || []
            };
            const {
                activityTransactions,
                sortedTransactions,
                activityType,
                classificationContext,
                scopedTransactions
            } = routeData;

            if (routeId === 'overview') {
                if (typeof renderInsightsPanel === 'function') renderInsightsPanel();
                if (typeof refreshFinanceOverview === 'function') await refreshFinanceOverview();
                return;
            }

            if (routeId === 'activity') {
                renderTransactions(activityTransactions);
                updateActivityFilterSummary(
                    activityTransactions,
                    sortedTransactions,
                    activityType,
                    classificationContext
                );
                return;
            }

            if (routeId === 'plan') {
                renderBudgets(scopedTransactions);
                if (typeof renderBills === 'function') await renderBills(rawBills || [], { render: true });
                if (typeof loadAndRenderWishlist === 'function') await loadAndRenderWishlist({ render: true });
                if (typeof renderGoalsAndSimulator === 'function') renderGoalsAndSimulator();
                if (typeof renderFinancePlanCoordinator === 'function') renderFinancePlanCoordinator();
                return;
            }

            if (routeId === 'wealth') {
                if (typeof renderDebts === 'function') await renderDebts(rawDebts || [], { render: true });
                if (typeof renderCreditCards === 'function') await renderCreditCards(rawCreditCards || [], { render: true });
                if (typeof renderInstallmentPlans === 'function') await renderInstallmentPlans(rawInstallmentPlans || [], { render: true });
                if (typeof renderLent === 'function') await renderLent(rawLent || [], { render: true });
                if (typeof renderAssets === 'function') await renderAssets();
                if (typeof renderCryptoWidget === 'function') await renderCryptoWidget();
                if (typeof renderFinanceWealthCoordinator === 'function') renderFinanceWealthCoordinator();
                return;
            }

            if (routeId === 'reports') {
                initChart();
                updateChart(scopedTransactions);
                await renderTrendsChart();
                if (options.firstActivation !== true) {
                    if (typeof refreshMonthlyCloseUI === 'function') await refreshMonthlyCloseUI();
                    if (typeof refreshBusinessKPIPanel === 'function') await refreshBusinessKPIPanel();
                    if (typeof refreshForecastModuleUI === 'function') await refreshForecastModuleUI();
                    if (typeof refreshStatementsModuleUI === 'function') await refreshStatementsModuleUI();
                    if (typeof renderBudgetVariancePanel === 'function') renderBudgetVariancePanel();
                    if (typeof renderRevenueDiversificationPanel === 'function') renderRevenueDiversificationPanel();
                }
                if (typeof renderFinanceReportsCoordinator === 'function') renderFinanceReportsCoordinator();
                return;
            }

            if (routeId === 'tools') {
                if (typeof renderFinanceToolsCoordinator === 'function') await renderFinanceToolsCoordinator();
                if (options.refreshDiagnostics === true && typeof refreshStorageDiagnosticsPanel === 'function') {
                    await refreshStorageDiagnosticsPanel();
                }
            }
        }

        window.renderFinanceRouteData = renderFinanceRouteData;

        function resetFilters() {
            const primaryMonth = getPrimaryMonthFilterControl();
            const primaryYear = getPrimaryYearFilterControl();
            const primarySearch = getPrimarySearchFilterControl();

            if (primaryMonth) primaryMonth.value = String(new Date().getMonth() + 1);
            if (primaryYear) primaryYear.value = String(new Date().getFullYear());
            if (primarySearch) primarySearch.value = '';
            const activityTypeFilter = getActivityTypeFilterControl();
            if (activityTypeFilter) activityTypeFilter.value = 'all';

            metricScope = 'selected_period';
            syncToolbarControls();
            applyFilters();
        }

        function updateChart(items) {
            if (!spendChart) return;

            const metrics = computeSummaryMetrics(window.allDecryptedTransactions || [], metricScope, {
                scopeTransactions: items,
                filteredTransactions: window.filteredTransactions || []
            });
            const cats = metrics.categoryExpenses;

            spendChart.data.labels = Object.keys(cats);
            spendChart.data.datasets[0].data = Object.values(cats);
            spendChart.update();
        }
