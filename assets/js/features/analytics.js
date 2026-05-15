        function calculateTrends() {
            const allTxs = window.allDecryptedTransactions || [];
            const now = new Date();

            const currentMonthTxs = getCurrentMonthTransactions(allTxs, now);
            const lastMonthRef = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            const lastMonthTxs = getCurrentMonthTransactions(allTxs, lastMonthRef);

            const currentMetrics = computeSummaryMetrics(allTxs, 'current_month', {
                scopeTransactions: currentMonthTxs,
                filteredTransactions: window.filteredTransactions || []
            });
            const lastMetrics = computeSummaryMetrics(allTxs, 'current_month', {
                scopeTransactions: lastMonthTxs,
                filteredTransactions: window.filteredTransactions || []
            });

            const incTrend = document.getElementById('income-trend');
            const expTrend = document.getElementById('expense-trend');

            const incChange = lastMetrics.income > 0
                ? ((currentMetrics.income - lastMetrics.income) / lastMetrics.income) * 100
                : 0;
            const expChange = lastMetrics.expense > 0
                ? ((currentMetrics.expense - lastMetrics.expense) / lastMetrics.expense) * 100
                : 0;

            incTrend.innerHTML = incChange === 0
                ? '—'
                : `<span class="${incChange > 0 ? 'text-emerald-600' : 'text-rose-600'}">${incChange > 0 ? '↑' : '↓'} ${Math.abs(incChange).toFixed(1)}%</span> vs last month`;
            expTrend.innerHTML = expChange === 0
                ? '—'
                : `<span class="${expChange > 0 ? 'text-rose-600' : 'text-emerald-600'}">${expChange > 0 ? '↑' : '↓'} ${Math.abs(expChange).toFixed(1)}%</span> vs last month`;
        }
