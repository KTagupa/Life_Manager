        function calculateTrends(currentMonthItems) {
            const allTxs = window.allDecryptedTransactions || [];
            const now = new Date();
            const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

            const lastMonthTxs = allTxs.filter(t => {
                const d = new Date(t.date);
                return d.getMonth() === lastMonth.getMonth() && d.getFullYear() === lastMonth.getFullYear();
            });

            const currentInc = currentMonthItems.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amt, 0);
            const currentExp = currentMonthItems.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amt, 0);

            const lastInc = lastMonthTxs.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amt, 0);
            const lastExp = lastMonthTxs.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amt, 0);

            const incChange = lastInc > 0 ? ((currentInc - lastInc) / lastInc) * 100 : 0;
            const expChange = lastExp > 0 ? ((currentExp - lastExp) / lastExp) * 100 : 0;

            const incTrend = document.getElementById('income-trend');
            const expTrend = document.getElementById('expense-trend');

            if (incChange !== 0) {
                incTrend.innerHTML = `<span class="${incChange > 0 ? 'text-emerald-600' : 'text-rose-600'}">${incChange > 0 ? '↑' : '↓'} ${Math.abs(incChange).toFixed(1)}%</span> vs last month`;
            }

            if (expChange !== 0) {
                expTrend.innerHTML = `<span class="${expChange > 0 ? 'text-rose-600' : 'text-emerald-600'}">${expChange > 0 ? '↑' : '↓'} ${Math.abs(expChange).toFixed(1)}%</span> vs last month`;
            }

            // Average daily spend
            const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
            const avgDaily = currentExp / daysInMonth;
            document.getElementById('avg-daily-spend').innerText = `Avg ${fmt(avgDaily)}/day`;
        }
