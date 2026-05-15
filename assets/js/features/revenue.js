        // =============================================
        // SECTION 19: REVENUE DIVERSIFICATION
        // =============================================

        let revenueDiversificationChart = null;

        function computeRevenueDiversification(scope = metricScope) {
            const allTx = window.allDecryptedTransactions || [];
            const scopedTx = getTransactionsForScope(scope, allTx, window.filteredTransactions);
            const incomeTx = scopedTx.filter(t => t.type === 'income');

            const bySource = {};
            let totalIncome = 0;

            incomeTx.forEach(t => {
                const cat = t.category || 'Others';
                bySource[cat] = (bySource[cat] || 0) + (t.amt || 0);
                totalIncome += (t.amt || 0);
            });

            const sources = Object.entries(bySource)
                .map(([name, amount]) => ({
                    name,
                    amount,
                    share: totalIncome > 0 ? (amount / totalIncome) * 100 : 0
                }))
                .sort((a, b) => b.amount - a.amount);

            // Concentration risk
            const topShare = sources.length > 0 ? sources[0].share : 0;
            let concentrationRisk = 'low';
            let concentrationLabel = '🟢 Diversified';
            let concentrationColor = 'text-emerald-600';
            if (topShare > 80) {
                concentrationRisk = 'critical';
                concentrationLabel = '🔴 High Risk';
                concentrationColor = 'text-rose-600';
            } else if (topShare > 60) {
                concentrationRisk = 'moderate';
                concentrationLabel = '🟡 Moderate';
                concentrationColor = 'text-amber-600';
            }

            // Passive vs Active classification
            const passiveCategories = new Set(['savings', 'dividends', 'interest', 'rental', 'passive', 'royalties', 'investment']);
            let passiveIncome = 0;
            let activeIncome = 0;

            sources.forEach(s => {
                const lower = s.name.toLowerCase();
                if (passiveCategories.has(lower) || lower.includes('passive') || lower.includes('dividend') || lower.includes('interest') || lower.includes('rental')) {
                    passiveIncome += s.amount;
                } else {
                    activeIncome += s.amount;
                }
            });

            const passiveRatio = totalIncome > 0 ? (passiveIncome / totalIncome) * 100 : 0;

            // Month-over-month income comparison
            const now = new Date();
            const currentMonthTx = allTx.filter(t => t.type === 'income' && getTxMonth(t) === (now.getMonth() + 1) && getTxYear(t) === now.getFullYear());
            const prevMonth = now.getMonth() === 0 ? 12 : now.getMonth();
            const prevYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
            const prevMonthTx = allTx.filter(t => t.type === 'income' && getTxMonth(t) === prevMonth && getTxYear(t) === prevYear);

            const currentMonthIncome = currentMonthTx.reduce((s, t) => s + (t.amt || 0), 0);
            const prevMonthIncome = prevMonthTx.reduce((s, t) => s + (t.amt || 0), 0);
            const momChange = prevMonthIncome > 0 ? ((currentMonthIncome - prevMonthIncome) / prevMonthIncome) * 100 : 0;

            return {
                sources,
                totalIncome,
                concentrationRisk,
                concentrationLabel,
                concentrationColor,
                topSourceName: sources.length > 0 ? sources[0].name : 'N/A',
                topSourceShare: topShare,
                passiveIncome,
                activeIncome,
                passiveRatio,
                sourceCount: sources.length,
                momChange,
                currentMonthIncome,
                prevMonthIncome
            };
        }

        function renderRevenueDiversificationPanel() {
            const panel = document.getElementById('revenue-diversification-panel');
            if (!panel) return;

            const data = computeRevenueDiversification();

            if (data.totalIncome === 0) {
                panel.innerHTML = `
                    <div class="text-center py-6 text-slate-400">
                        <div class="bg-slate-50 p-3 rounded-full inline-block mb-2">
                            <i data-lucide="banknote" class="w-6 h-6 opacity-50"></i>
                        </div>
                        <p class="text-xs font-medium">No income data yet.</p>
                    </div>`;
                lucide.createIcons();
                return;
            }

            // Chart colors
            const chartColors = [
                '#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
                '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#14b8a6'
            ];

            // Build chart
            const chartCanvas = document.createElement('canvas');
            chartCanvas.id = 'revenueChart';
            chartCanvas.style.maxHeight = '180px';

            // Build source rows
            const sourceRows = data.sources.slice(0, 6).map((s, i) => {
                const color = chartColors[i % chartColors.length];
                const safeSourceName = escapeHTML(s.name);
                return `
                    <div class="flex items-center justify-between py-1">
                        <div class="flex items-center gap-2">
                            <div class="w-2 h-2 rounded-full" style="background:${color}"></div>
                            <span class="text-xs font-bold text-slate-700">${safeSourceName}</span>
                        </div>
                        <div class="text-right">
                            <span class="text-xs font-bold text-slate-800">${fmt(s.amount)}</span>
                            <span class="text-[10px] text-slate-400 ml-1">${s.share.toFixed(1)}%</span>
                        </div>
                    </div>`;
            }).join('');

            // MoM trend
            const momIcon = data.momChange >= 0 ? 'trending-up' : 'trending-down';
            const momColor = data.momChange >= 0 ? 'text-emerald-600' : 'text-rose-600';
            const momBg = data.momChange >= 0 ? 'bg-emerald-50' : 'bg-rose-50';
            const momSign = data.momChange >= 0 ? '+' : '';

            panel.innerHTML = `
                <div class="space-y-4">
                    <!-- Concentration Risk Badge -->
                    <div class="flex items-center justify-between">
                        <div class="flex items-center gap-2">
                            <span class="text-xs font-black ${data.concentrationColor}">${data.concentrationLabel}</span>
                        </div>
                        <span class="text-[10px] font-bold text-slate-400">${data.sourceCount} source${data.sourceCount !== 1 ? 's' : ''}</span>
                    </div>

                    <!-- Chart -->
                    <div class="relative h-[180px] w-full" id="revenue-chart-container"></div>

                    <!-- Source Breakdown -->
                    <div class="space-y-1">
                        ${sourceRows}
                    </div>

                    <!-- Passive vs Active -->
                    <div class="bg-slate-50 rounded-xl p-3 border border-slate-100">
                        <p class="text-[10px] font-black uppercase tracking-wide text-slate-500 mb-2">Passive vs Active</p>
                        <div class="flex gap-2">
                            <div class="flex-1 bg-indigo-50 rounded-lg p-2 text-center border border-indigo-100">
                                <p class="text-[10px] text-indigo-500 font-bold">Active</p>
                                <p class="text-sm font-black text-indigo-700">${(100 - data.passiveRatio).toFixed(0)}%</p>
                            </div>
                            <div class="flex-1 bg-emerald-50 rounded-lg p-2 text-center border border-emerald-100">
                                <p class="text-[10px] text-emerald-500 font-bold">Passive</p>
                                <p class="text-sm font-black text-emerald-700">${data.passiveRatio.toFixed(0)}%</p>
                            </div>
                        </div>
                    </div>

                    <!-- MoM Trend -->
                    <div class="${momBg} rounded-xl p-3 flex items-center justify-between border border-slate-100">
                        <div class="flex items-center gap-2">
                            <i data-lucide="${momIcon}" class="w-4 h-4 ${momColor}"></i>
                            <span class="text-xs font-bold text-slate-700">Monthly Income Trend</span>
                        </div>
                        <span class="text-xs font-black ${momColor}">${momSign}${data.momChange.toFixed(1)}%</span>
                    </div>
                </div>`;

            // Render chart
            const container = document.getElementById('revenue-chart-container');
            if (container) {
                container.appendChild(chartCanvas);
                if (revenueDiversificationChart) {
                    revenueDiversificationChart.destroy();
                }
                revenueDiversificationChart = new Chart(chartCanvas.getContext('2d'), {
                    type: 'doughnut',
                    data: {
                        labels: data.sources.slice(0, 8).map(s => s.name),
                        datasets: [{
                            data: data.sources.slice(0, 8).map(s => s.amount),
                            backgroundColor: chartColors.slice(0, Math.min(8, data.sources.length)),
                            borderWidth: 2,
                            borderColor: '#fff'
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        cutout: '65%',
                        plugins: {
                            legend: { display: false },
                            tooltip: {
                                callbacks: {
                                    label: function(ctx) {
                                        const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
                                        const pct = total > 0 ? ((ctx.parsed / total) * 100).toFixed(1) : 0;
                                        return `${ctx.label}: ${fmt(ctx.parsed)} (${pct}%)`;
                                    }
                                }
                            }
                        }
                    }
                });
            }

            lucide.createIcons();
        }
