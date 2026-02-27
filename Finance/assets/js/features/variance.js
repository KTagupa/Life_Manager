// =============================================
// SECTION 20: BUDGET VARIANCE ANALYSIS
// =============================================

function computeBudgetVariance(monthTransactions, currentBudgets) {
    const effectiveBudgets = currentBudgets || budgets || {};
    const txList = monthTransactions || window.filteredTransactions || [];

    const categorySpent = {};
    txList.forEach(t => {
        if (t.type === 'expense') {
            const cat = t.category || 'Others';
            categorySpent[cat] = (categorySpent[cat] || 0) + (t.amt || 0);
        }
    });

    const rows = [];
    let totalPlanned = 0;
    let totalActual = 0;
    let favorableCount = 0;
    let unfavorableCount = 0;

    Object.entries(effectiveBudgets).forEach(([category, planned]) => {
        if (!planned || planned <= 0) return;
        const actual = categorySpent[category] || 0;
        const variance = planned - actual;
        const variancePct = planned > 0 ? (variance / planned) * 100 : 0;
        const isFavorable = variance >= 0;

        totalPlanned += planned;
        totalActual += actual;
        if (isFavorable) favorableCount++;
        else unfavorableCount++;

        rows.push({
            category,
            planned,
            actual,
            variance,
            variancePct,
            isFavorable,
            utilizationPct: planned > 0 ? Math.min((actual / planned) * 100, 150) : 0
        });
    });

    // Also include unbudgeted categories with spending
    Object.entries(categorySpent).forEach(([cat, actual]) => {
        if (effectiveBudgets[cat] && effectiveBudgets[cat] > 0) return; // already covered
        if (actual <= 0) return;
        rows.push({
            category: cat,
            planned: 0,
            actual,
            variance: -actual,
            variancePct: -100,
            isFavorable: false,
            utilizationPct: 150,
            unbudgeted: true
        });
        totalActual += actual;
        unfavorableCount++;
    });

    rows.sort((a, b) => a.variance - b.variance); // worst first

    const totalVariance = totalPlanned - totalActual;
    const totalVariancePct = totalPlanned > 0 ? (totalVariance / totalPlanned) * 100 : 0;

    return {
        rows,
        totalPlanned,
        totalActual,
        totalVariance,
        totalVariancePct,
        favorableCount,
        unfavorableCount,
        isTotalFavorable: totalVariance >= 0
    };
}

function renderBudgetVariancePanel() {
    const panel = document.getElementById('variance-panel');
    if (!panel) return;

    const hasBudgets = Object.values(budgets || {}).some(v => v > 0);
    if (!hasBudgets) {
        panel.innerHTML = `
                    <div class="text-center py-4 text-slate-400">
                        <p class="text-xs font-medium">Set budgets to see variance analysis.</p>
                    </div>`;
        return;
    }

    const txScope = getTransactionsForScope(metricScope);
    const data = computeBudgetVariance(txScope, budgets);

    if (data.rows.length === 0) {
        panel.innerHTML = '<div class="text-center text-xs text-slate-400 py-4">No variance data available.</div>';
        return;
    }

    const totalColor = data.isTotalFavorable ? 'text-emerald-600' : 'text-rose-600';
    const totalBg = data.isTotalFavorable ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-200';
    const totalSign = data.totalVariance >= 0 ? '+' : '';

    // Summary cards
    let html = `
                <div class="grid grid-cols-3 gap-2 mb-4">
                    <div class="bg-slate-50 rounded-xl p-2.5 border border-slate-200 text-center">
                        <p class="text-[10px] font-black uppercase text-slate-500">Planned</p>
                        <p class="text-sm font-bold text-slate-800 mt-0.5">${fmt(data.totalPlanned)}</p>
                    </div>
                    <div class="bg-slate-50 rounded-xl p-2.5 border border-slate-200 text-center">
                        <p class="text-[10px] font-black uppercase text-slate-500">Actual</p>
                        <p class="text-sm font-bold text-slate-800 mt-0.5">${fmt(data.totalActual)}</p>
                    </div>
                    <div class="${totalBg} rounded-xl p-2.5 border text-center">
                        <p class="text-[10px] font-black uppercase text-slate-500">Variance</p>
                        <p class="text-sm font-bold ${totalColor} mt-0.5">${totalSign}${fmt(data.totalVariance)}</p>
                    </div>
                </div>

                <div class="flex items-center gap-3 mb-3">
                    <span class="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">✓ ${data.favorableCount} favorable</span>
                    <span class="text-[10px] font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200">✗ ${data.unfavorableCount} unfavorable</span>
                </div>
            `;

    // Variance table
    html += `<div class="space-y-2">`;
    data.rows.forEach(r => {
        const safeCat = escapeHTML(r.category);
        const barColor = r.isFavorable ? 'bg-emerald-500' : 'bg-rose-500';
        const varColor = r.isFavorable ? 'text-emerald-600' : 'text-rose-600';
        const flagLabel = r.unbudgeted ? 'UNBUDGETED' : (r.isFavorable ? 'FAVORABLE' : 'UNFAVORABLE');
        const flagColor = r.unbudgeted ? 'text-amber-600 bg-amber-50' : (r.isFavorable ? 'text-emerald-600 bg-emerald-50' : 'text-rose-600 bg-rose-50');
        const varSign = r.variance >= 0 ? '+' : '';
        const barWidth = Math.min(r.utilizationPct, 100);

        html += `
                    <div class="bg-slate-50 rounded-xl p-2.5 border border-slate-100">
                        <div class="flex items-center justify-between mb-1">
                            <span class="text-xs font-bold text-slate-700">${safeCat}</span>
                            <span class="text-[9px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded-full ${flagColor}">${flagLabel}</span>
                        </div>
                        <div class="flex items-center justify-between text-[11px] text-slate-500 mb-1.5">
                            <span>Actual: ${fmt(r.actual)} / Plan: ${r.planned > 0 ? fmt(r.planned) : '—'}</span>
                            <span class="font-bold ${varColor}">${varSign}${fmt(r.variance)} (${varSign}${r.variancePct.toFixed(0)}%)</span>
                        </div>
                        <div class="h-1.5 bg-slate-200 rounded-full overflow-hidden">
                            <div class="h-full ${barColor} rounded-full transition-all duration-500" style="width:${barWidth}%"></div>
                        </div>
                    </div>
                `;
    });
    html += `</div>`;

    panel.innerHTML = html;
}

function renderBudgetVarianceForClose(monthKey) {
    const container = document.getElementById('mc-budget-summary');
    if (!container) return;

    const hasBudgets = Object.values(budgets || {}).some(v => v > 0);
    if (!hasBudgets) {
        container.innerHTML = '<p class="text-xs text-slate-400">No budgets configured. Set budgets to see variance.</p>';
        return;
    }

    const normalizedMonth = statementsNormalizeMonthKey ? statementsNormalizeMonthKey(monthKey) : monthKey;
    const monthTx = (window.allDecryptedTransactions || []).filter(t => {
        const d = new Date(t.date);
        const mk = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        return mk === normalizedMonth;
    });

    const data = computeBudgetVariance(monthTx, budgets);

    if (data.rows.length === 0) {
        container.innerHTML = '<p class="text-xs text-slate-400">No variance data for this month.</p>';
        return;
    }

    const totalColor = data.isTotalFavorable ? 'text-emerald-600' : 'text-rose-600';
    const totalSign = data.totalVariance >= 0 ? '+' : '';

    let html = `
                <div class="text-xs font-bold text-slate-600 mb-2">
                    Overall: <span class="${totalColor}">${totalSign}${fmt(data.totalVariance)} (${totalSign}${data.totalVariancePct.toFixed(0)}%)</span>
                    · ${data.favorableCount} favorable · ${data.unfavorableCount} unfavorable
                </div>
                <div class="space-y-1.5">
            `;

    data.rows.forEach(r => {
        const safeCat = escapeHTML(r.category);
        const varColor = r.isFavorable ? 'text-emerald-600' : 'text-rose-600';
        const varSign = r.variance >= 0 ? '+' : '';
        const barColor = r.isFavorable ? 'bg-emerald-400' : 'bg-rose-400';
        const barWidth = Math.min(r.utilizationPct, 100);

        html += `
                    <div>
                        <div class="flex items-center justify-between">
                            <span class="text-xs font-bold text-slate-700">${safeCat}</span>
                            <span class="text-[11px] ${varColor} font-bold">${varSign}${r.variancePct.toFixed(0)}%</span>
                        </div>
                        <div class="flex items-center gap-2 mt-0.5">
                            <div class="flex-1 h-1 bg-slate-200 rounded-full overflow-hidden">
                                <div class="h-full ${barColor} rounded-full" style="width:${barWidth}%"></div>
                            </div>
                            <span class="text-[10px] text-slate-500">${fmt(r.actual)}/${r.planned > 0 ? fmt(r.planned) : '—'}</span>
                        </div>
                    </div>
                `;
    });

    html += `</div>`;
    container.innerHTML = html;
}
