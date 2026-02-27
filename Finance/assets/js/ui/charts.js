        // =============================================
        // SECTION 5: CHARTS & FILTERS
        // =============================================
        function initFilters() {
            const mSel = document.getElementById('filter-month');
            const ySel = document.getElementById('filter-year');
            const months = ["All", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

            mSel.innerHTML = months.map((m, i) => `<option value="${i === 0 ? 'all' : i}">${m}</option>`).join('');

            // Year: Current +/- 5
            const curY = new Date().getFullYear();
            let ops = `<option value="all">All Years</option>`;
            for (let i = curY - 2; i <= curY + 2; i++) ops += `<option value="${i}" ${i === curY ? 'selected' : ''}>${i}</option>`;
            ySel.innerHTML = ops;

            // Set current month default
            mSel.value = new Date().getMonth() + 1;

            const metricScopeSel = document.getElementById('metric-scope');
            if (metricScopeSel) metricScopeSel.value = metricScope;
        }

        let trendsChart = null;

        function initChart() {
            const ctx = document.getElementById('spendChart').getContext('2d');
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
        }

        async function renderTrendsChart() {
            const period = parseInt(document.getElementById('trend-period')?.value || 6);
            const ctx = document.getElementById('trendsChart');
            if (!ctx) return;

            if (trendsChart) trendsChart.destroy();

            const transactions = window.allDecryptedTransactions || [];
            const monthlyData = {};
            const now = new Date();

            // Initialize last N months
            for (let i = period - 1; i >= 0; i--) {
                const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
                const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
                monthlyData[key] = { income: 0, expense: 0 };
            }

            // Aggregate data
            transactions.forEach(t => {
                const date = new Date(getTxTimestamp(t));
                const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
                if (monthlyData[key]) {
                    if (t.type === 'income') monthlyData[key].income += t.amt;
                    else if (t.type === 'expense') monthlyData[key].expense += t.amt;
                }
            });

            const labels = Object.keys(monthlyData).map(k => {
                const [y, m] = k.split('-');
                return new Date(y, m - 1).toLocaleDateString('en', { month: 'short', year: '2-digit' });
            });

            trendsChart = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'Income',
                        data: Object.values(monthlyData).map(d => d.income),
                        borderColor: '#10b981',
                        backgroundColor: 'rgba(16, 185, 129, 0.1)',
                        tension: 0.4,
                        fill: true
                    }, {
                        label: 'Expenses',
                        data: Object.values(monthlyData).map(d => d.expense),
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
                const hydrated = { ...d, id: i.id };
                hydrateTransactionCache(hydrated);
                return hydrated;
            }))).filter(x => x).sort((a, b) => getTxTimestamp(b) - getTxTimestamp(a));

            // Store cleanly for usage
            window.allDecryptedTransactions = decrypted;
            applyFilters();
            renderTrendsChart();
            if (typeof refreshMonthlyCloseUI === 'function') {
                refreshMonthlyCloseUI();
            }
            if (typeof refreshBusinessKPIPanel === 'function') {
                refreshBusinessKPIPanel();
            }
            if (typeof refreshForecastModuleUI === 'function') {
                refreshForecastModuleUI();
            }
            if (typeof refreshStatementsModuleUI === 'function') {
                refreshStatementsModuleUI();
            }
        }

        function applyFilters() {
            const m = document.getElementById('filter-month').value;
            const y = document.getElementById('filter-year').value;
            const searchQuery = document.getElementById('search-transactions')?.value.toLowerCase() || '';

            let filtered = window.allDecryptedTransactions || [];

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

            window.filteredTransactions = filtered;
            filteredTransactions = filtered;

            const scopedTransactions = getTransactionsForScope(metricScope, window.allDecryptedTransactions, filtered);
            renderTransactions(filtered);
            updateChart(scopedTransactions);
            renderBudgets(scopedTransactions);

            if (typeof renderInsightsPanel === 'function') {
                renderInsightsPanel();
            }
            if (typeof renderGoalsAndSimulator === 'function') {
                renderGoalsAndSimulator();
            }
            if (typeof refreshMonthlyCloseUI === 'function') {
                refreshMonthlyCloseUI();
            }
            if (typeof refreshBusinessKPIPanel === 'function') {
                refreshBusinessKPIPanel();
            }
            if (typeof refreshForecastModuleUI === 'function') {
                refreshForecastModuleUI();
            }
            if (typeof refreshStatementsModuleUI === 'function') {
                refreshStatementsModuleUI();
            }
        }

        function resetFilters() {
            document.getElementById('filter-month').value = new Date().getMonth() + 1;
            document.getElementById('filter-year').value = new Date().getFullYear();
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
