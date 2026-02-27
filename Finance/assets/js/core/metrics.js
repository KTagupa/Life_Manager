        // =============================================
        // SECTION 10: METRICS & SCOPING
        // =============================================

        function getMetricScopeLabel(scope) {
            if (scope === 'all_time') return 'All records';
            if (scope === 'current_month') return 'Current month';
            return 'Selected period';
        }

        function getSelectedPeriodLabel() {
            const m = document.getElementById('filter-month')?.value || 'all';
            const y = document.getElementById('filter-year')?.value || 'all';

            if (m === 'all' && y === 'all') return 'All months';
            if (m === 'all' && y !== 'all') return `Year ${y}`;
            if (m !== 'all' && y === 'all') {
                const monthName = new Date(2000, Number(m) - 1).toLocaleString('en', { month: 'long' });
                return `${monthName} (all years)`;
            }

            const monthName = new Date(Number(y), Number(m) - 1).toLocaleString('en', { month: 'long', year: 'numeric' });
            return monthName;
        }

        function hydrateTransactionCache(tx) {
            if (!tx || typeof tx !== 'object') return tx;

            if (!Number.isFinite(tx._ts)) {
                const parsedTs = Date.parse(tx.date);
                tx._ts = Number.isFinite(parsedTs) ? parsedTs : Date.now();
            }

            if (!Number.isInteger(tx._year) || !Number.isInteger(tx._month)) {
                const d = new Date(tx._ts);
                tx._year = d.getFullYear();
                tx._month = d.getMonth() + 1;
            }

            if (typeof tx._searchText !== 'string') {
                tx._searchText = `${String(tx.desc || '')} ${String(tx.category || '')}`.toLowerCase();
            }

            return tx;
        }

        function getTxTimestamp(tx) {
            const cached = hydrateTransactionCache(tx);
            return cached && Number.isFinite(cached._ts) ? cached._ts : 0;
        }

        function getTxYear(tx) {
            const cached = hydrateTransactionCache(tx);
            return cached && Number.isInteger(cached._year) ? cached._year : 1970;
        }

        function getTxMonth(tx) {
            const cached = hydrateTransactionCache(tx);
            return cached && Number.isInteger(cached._month) ? cached._month : 1;
        }

        function getTxSearchText(tx) {
            const cached = hydrateTransactionCache(tx);
            return cached && typeof cached._searchText === 'string' ? cached._searchText : '';
        }

        function getCurrentMonthTransactions(transactions, referenceDate = new Date()) {
            const refMonth = referenceDate.getMonth() + 1;
            const refYear = referenceDate.getFullYear();
            return (transactions || []).filter(t => {
                return getTxMonth(t) === refMonth && getTxYear(t) === refYear;
            });
        }

        function getTransactionsForScope(scope = metricScope, allTransactions = null, filteredTransactions = null) {
            const allTx = allTransactions || window.allDecryptedTransactions || [];
            const filteredTx = filteredTransactions || window.filteredTransactions || allTx;

            if (scope === 'all_time') return allTx;
            if (scope === 'current_month') return getCurrentMonthTransactions(allTx);
            return filteredTx;
        }

        function getMetricDayCount(scope, scopedTransactions, referenceDate = new Date()) {
            if (scope === 'current_month') {
                return new Date(referenceDate.getFullYear(), referenceDate.getMonth() + 1, 0).getDate();
            }

            if (!scopedTransactions || scopedTransactions.length === 0) return 1;

            const times = scopedTransactions.map(t => getTxTimestamp(t)).filter(Number.isFinite);
            if (!times.length) return 1;

            const minTs = Math.min(...times);
            const maxTs = Math.max(...times);
            const days = Math.floor((maxTs - minTs) / (24 * 60 * 60 * 1000)) + 1;
            return Math.max(1, days);
        }

        function computeSummaryMetrics(allTransactions, scope = metricScope, options = {}) {
            const referenceDate = options.referenceDate || new Date();
            const scopedTransactions = options.scopeTransactions || getTransactionsForScope(
                scope,
                allTransactions,
                options.filteredTransactions || window.filteredTransactions || []
            );

            let income = 0;
            let expense = 0;
            let balance = 0;
            const categoryExpenses = {};

            scopedTransactions.forEach(t => {
                if (t.type === 'income') {
                    income += t.amt;
                    balance += t.amt;
                    return;
                }

                if (t.type === 'debt_increase') {
                    balance += t.amt;
                    return;
                }

                if (t.type === 'expense') {
                    expense += t.amt;
                    balance -= t.amt;
                    categoryExpenses[t.category] = (categoryExpenses[t.category] || 0) + t.amt;
                }
            });

            const savingsRate = income > 0 ? Math.round(((income - expense) / income) * 100) : 0;
            const days = getMetricDayCount(scope, scopedTransactions, referenceDate);
            const avgDailySpend = expense / days;

            return {
                scope,
                scopeLabel: getMetricScopeLabel(scope),
                income,
                expense,
                balance,
                savingsRate,
                avgDailySpend,
                categoryExpenses,
                transactionCount: scopedTransactions.length,
                scopedTransactions
            };
        }

        function renderSummaryCards(metrics) {
            document.getElementById('balance-display').innerText = fmt(metrics.balance);
            document.getElementById('income-display').innerText = fmt(metrics.income);
            document.getElementById('expense-display').innerText = fmt(metrics.expense);
            document.getElementById('savings-rate-display').innerText = `${metrics.savingsRate}%`;
            document.getElementById('avg-daily-spend').innerText = `Avg ${fmt(metrics.avgDailySpend)}/day`;

            const selectedLabel = getSelectedPeriodLabel();
            const scopeCaption = metrics.scope === 'selected_period'
                ? `Selected: ${selectedLabel}`
                : `${metrics.scopeLabel}`;
            document.getElementById('balance-trend').innerText = scopeCaption;
        }

        function setMetricScope(scope) {
            metricScope = scope;
            const sel = document.getElementById('metric-scope');
            if (sel && sel.value !== scope) sel.value = scope;
            applyFilters();
        }

        function getReportScopeSelection() {
            return document.getElementById('report-scope')?.value || 'selected_period';
        }

        function getReportTransactions() {
            const reportScope = getReportScopeSelection();
            if (reportScope === 'all_records') {
                return window.allDecryptedTransactions || [];
            }
            return window.filteredTransactions || [];
        }

        function getReportScopeLabel() {
            const reportScope = getReportScopeSelection();
            if (reportScope === 'all_records') return 'All records';
            return `Selected period (${getSelectedPeriodLabel()})`;
        }

        function computeCurrentBalance(allTransactions = null) {
            const allTx = allTransactions || window.allDecryptedTransactions || [];
            return computeSummaryMetrics(allTx, 'all_time', { filteredTransactions: allTx }).balance;
        }
