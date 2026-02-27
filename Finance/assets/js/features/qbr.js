// =============================================
// SECTION 21: QUARTERLY BUSINESS REVIEW (QBR)
// =============================================

let qbrActiveYear = null;
let qbrActiveQuarter = null;

function getQuarterMonths(year, quarter) {
    const startMonth = (quarter - 1) * 3 + 1;
    return [
        `${year}-${String(startMonth).padStart(2, '0')}`,
        `${year}-${String(startMonth + 1).padStart(2, '0')}`,
        `${year}-${String(startMonth + 2).padStart(2, '0')}`
    ];
}

function getQuarterLabel(year, quarter) {
    return `Q${quarter} ${year}`;
}

function getPreviousQuarter(year, quarter) {
    if (quarter === 1) return { year: year - 1, quarter: 4 };
    return { year, quarter: quarter - 1 };
}

function getCurrentQuarter() {
    const now = new Date();
    const month = now.getMonth() + 1;
    return {
        year: now.getFullYear(),
        quarter: Math.ceil(month / 3)
    };
}

function computeQuarterMetrics(year, quarter) {
    const months = getQuarterMonths(year, quarter);
    const allTx = window.allDecryptedTransactions || [];

    let income = 0;
    let expenses = 0;
    const categoryExpenses = {};
    const incomeSources = {};
    let txCount = 0;

    allTx.forEach(t => {
        const d = new Date(t.date);
        const mk = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        if (!months.includes(mk)) return;

        txCount++;
        const amount = t.amt || 0;

        if (t.type === 'income') {
            income += amount;
            const cat = t.category || 'Others';
            incomeSources[cat] = (incomeSources[cat] || 0) + amount;
        } else if (t.type === 'expense') {
            expenses += amount;
            const cat = t.category || 'Others';
            categoryExpenses[cat] = (categoryExpenses[cat] || 0) + amount;
        }
    });

    const netIncome = income - expenses;
    const savingsRate = income > 0 ? ((income - expenses) / income) * 100 : 0;
    const avgMonthlyIncome = income / 3;
    const avgMonthlyExpenses = expenses / 3;

    // Top 5 expense categories
    const topCategories = Object.entries(categoryExpenses)
        .map(([cat, amt]) => ({ category: cat, amount: amt, share: expenses > 0 ? (amt / expenses) * 100 : 0 }))
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 5);

    // Monthly breakdown for chart
    const monthlyBreakdown = months.map(mk => {
        let mIncome = 0, mExpense = 0;
        allTx.forEach(t => {
            const d = new Date(t.date);
            const tmk = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            if (tmk !== mk) return;
            if (t.type === 'income') mIncome += t.amt || 0;
            else if (t.type === 'expense') mExpense += t.amt || 0;
        });
        return { month: mk, income: mIncome, expense: mExpense, net: mIncome - mExpense };
    });

    // Budget adherence across quarter
    let budgetedCategories = 0;
    let underBudget = 0;
    const currentBudgets = budgets || {};
    Object.entries(currentBudgets).forEach(([cat, limit]) => {
        if (!limit || limit <= 0) return;
        budgetedCategories++;
        const monthlyActual = (categoryExpenses[cat] || 0) / 3;
        if (monthlyActual <= limit) underBudget++;
    });
    const budgetAdherence = budgetedCategories > 0 ? (underBudget / budgetedCategories) * 100 : 0;

    return {
        year,
        quarter,
        label: getQuarterLabel(year, quarter),
        income,
        expenses,
        netIncome,
        savingsRate,
        avgMonthlyIncome,
        avgMonthlyExpenses,
        topCategories,
        incomeSources,
        monthlyBreakdown,
        txCount,
        budgetAdherence,
        budgetedCategories,
        underBudget
    };
}

function computeQoQComparison(current, previous) {
    const incomeChange = previous.income > 0 ? ((current.income - previous.income) / previous.income) * 100 : 0;
    const expenseChange = previous.expenses > 0 ? ((current.expenses - previous.expenses) / previous.expenses) * 100 : 0;
    const savingsRateChange = current.savingsRate - previous.savingsRate;
    const netIncomeChange = previous.netIncome !== 0 ? ((current.netIncome - previous.netIncome) / Math.abs(previous.netIncome)) * 100 : 0;

    return {
        incomeChange,
        expenseChange,
        savingsRateChange,
        netIncomeChange,
        incomeTrend: incomeChange >= 0 ? 'up' : 'down',
        expenseTrend: expenseChange <= 0 ? 'up' : 'down', // lower expense = good
        savingsRateTrend: savingsRateChange >= 0 ? 'up' : 'down'
    };
}

function scorePerformanceGrade(metrics) {
    const grades = [];

    // Savings rate: 🟢 >20%, 🟡 10-20%, 🔴 <10%
    if (metrics.savingsRate >= 20) grades.push({ kpi: 'Savings Rate', grade: '🟢', label: `${metrics.savingsRate.toFixed(0)}%`, status: 'On Track' });
    else if (metrics.savingsRate >= 10) grades.push({ kpi: 'Savings Rate', grade: '🟡', label: `${metrics.savingsRate.toFixed(0)}%`, status: 'Needs Attention' });
    else grades.push({ kpi: 'Savings Rate', grade: '🔴', label: `${metrics.savingsRate.toFixed(0)}%`, status: 'Off Track' });

    // Net income: 🟢 positive, 🟡 break even, 🔴 negative
    if (metrics.netIncome > 0) grades.push({ kpi: 'Net Income', grade: '🟢', label: fmt(metrics.netIncome), status: 'Profitable' });
    else if (metrics.netIncome === 0) grades.push({ kpi: 'Net Income', grade: '🟡', label: fmt(0), status: 'Break Even' });
    else grades.push({ kpi: 'Net Income', grade: '🔴', label: fmt(metrics.netIncome), status: 'Loss' });

    // Budget adherence: 🟢 >80%, 🟡 60-80%, 🔴 <60%
    if (metrics.budgetedCategories > 0) {
        if (metrics.budgetAdherence >= 80) grades.push({ kpi: 'Budget Discipline', grade: '🟢', label: `${metrics.budgetAdherence.toFixed(0)}%`, status: 'Disciplined' });
        else if (metrics.budgetAdherence >= 60) grades.push({ kpi: 'Budget Discipline', grade: '🟡', label: `${metrics.budgetAdherence.toFixed(0)}%`, status: 'Slipping' });
        else grades.push({ kpi: 'Budget Discipline', grade: '🔴', label: `${metrics.budgetAdherence.toFixed(0)}%`, status: 'Overspending' });
    }

    // Expense ratio
    const expenseRatio = metrics.income > 0 ? (metrics.expenses / metrics.income) * 100 : 100;
    if (expenseRatio <= 70) grades.push({ kpi: 'Expense Ratio', grade: '🟢', label: `${expenseRatio.toFixed(0)}%`, status: 'Lean' });
    else if (expenseRatio <= 90) grades.push({ kpi: 'Expense Ratio', grade: '🟡', label: `${expenseRatio.toFixed(0)}%`, status: 'Acceptable' });
    else grades.push({ kpi: 'Expense Ratio', grade: '🔴', label: `${expenseRatio.toFixed(0)}%`, status: 'Top Heavy' });

    return grades;
}

function openQBRModal() {
    const current = getCurrentQuarter();
    qbrActiveYear = current.year;
    qbrActiveQuarter = current.quarter;

    // Hydrate selectors
    const yearSel = document.getElementById('qbr-year');
    const qSel = document.getElementById('qbr-quarter');
    if (yearSel) {
        const years = new Set();
        const allTx = window.allDecryptedTransactions || [];
        allTx.forEach(t => { const y = getTxYear(t); if (y > 2000) years.add(y); });
        years.add(current.year);
        yearSel.innerHTML = [...years].sort((a, b) => b - a).map(y => `<option value="${y}" ${y === current.year ? 'selected' : ''}>${y}</option>`).join('');
    }
    if (qSel) qSel.value = String(current.quarter);

    renderQBRContent();
    toggleModal('qbr-modal');
}

function onQBRSelectionChange() {
    const yearSel = document.getElementById('qbr-year');
    const qSel = document.getElementById('qbr-quarter');
    qbrActiveYear = Number(yearSel?.value || new Date().getFullYear());
    qbrActiveQuarter = Number(qSel?.value || 1);
    renderQBRContent();
}

function renderQBRContent() {
    const container = document.getElementById('qbr-content');
    if (!container) return;

    const current = computeQuarterMetrics(qbrActiveYear, qbrActiveQuarter);
    const prev = getPreviousQuarter(qbrActiveYear, qbrActiveQuarter);
    const previous = computeQuarterMetrics(prev.year, prev.quarter);
    const comparison = computeQoQComparison(current, previous);
    const grades = scorePerformanceGrade(current);

    if (current.txCount === 0) {
        container.innerHTML = `
                    <div class="text-center py-12 text-slate-400">
                        <p class="text-sm font-medium">No transaction data for ${current.label}.</p>
                        <p class="text-xs mt-1">Select a quarter with transactions.</p>
                    </div>`;
        return;
    }

    // Q-over-Q comparison cards
    const comparisons = [
        { label: 'Income', value: current.income, change: comparison.incomeChange, positive: comparison.incomeChange >= 0 },
        { label: 'Expenses', value: current.expenses, change: comparison.expenseChange, positive: comparison.expenseChange <= 0 },
        { label: 'Savings Rate', value: null, displayValue: `${current.savingsRate.toFixed(0)}%`, change: comparison.savingsRateChange, positive: comparison.savingsRateChange >= 0, isSuffix: true },
        { label: 'Net Income', value: current.netIncome, change: comparison.netIncomeChange, positive: current.netIncome >= 0 }
    ];

    let comparisonHTML = comparisons.map(c => {
        const color = c.positive ? 'text-emerald-600' : 'text-rose-600';
        const bg = c.positive ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-200';
        const icon = c.positive ? 'trending-up' : 'trending-down';
        const sign = c.change >= 0 ? '+' : '';
        const display = c.displayValue || fmt(c.value);
        return `
                    <div class="${bg} rounded-2xl p-4 border">
                        <div class="flex items-center justify-between mb-1">
                            <p class="text-[10px] font-black uppercase tracking-wide text-slate-500">${c.label}</p>
                            <i data-lucide="${icon}" class="w-3 h-3 ${color}"></i>
                        </div>
                        <p class="text-xl font-black text-slate-800">${display}</p>
                        <p class="text-[11px] font-bold ${color} mt-1">${sign}${c.change.toFixed(1)}% vs ${getQuarterLabel(prev.year, prev.quarter)}</p>
                    </div>
                `;
    }).join('');

    // Performance scorecard
    let scorecardHTML = grades.map(g => `
                <div class="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
                    <div class="flex items-center gap-2">
                        <span class="text-lg">${g.grade}</span>
                        <span class="text-xs font-bold text-slate-700">${g.kpi}</span>
                    </div>
                    <div class="text-right">
                        <span class="text-xs font-black text-slate-800">${g.label}</span>
                        <span class="text-[10px] text-slate-400 ml-1">${g.status}</span>
                    </div>
                </div>
            `).join('');

    // Top expense categories
    let topCatHTML = current.topCategories.map((c, i) => {
        const safeCat = escapeHTML(c.category);
        return `
                    <div class="flex items-center justify-between py-1.5">
                        <div class="flex items-center gap-2">
                            <span class="text-xs font-black text-slate-400 w-4">#${i + 1}</span>
                            <span class="text-xs font-bold text-slate-700">${safeCat}</span>
                        </div>
                        <div class="text-right">
                            <span class="text-xs font-bold text-slate-800">${fmt(c.amount)}</span>
                            <span class="text-[10px] text-slate-400 ml-1">${c.share.toFixed(0)}%</span>
                        </div>
                    </div>
                `;
    }).join('');

    // Monthly breakdown table
    let monthTableHTML = current.monthlyBreakdown.map(m => {
        const netColor = m.net >= 0 ? 'text-emerald-600' : 'text-rose-600';
        const monthLabel = new Date(m.month + '-01').toLocaleString('en', { month: 'short', year: 'numeric' });
        return `
                    <tr class="border-b border-slate-100">
                        <td class="px-3 py-2 text-xs font-bold text-slate-700">${monthLabel}</td>
                        <td class="px-3 py-2 text-xs text-right text-emerald-600 font-bold">${fmt(m.income)}</td>
                        <td class="px-3 py-2 text-xs text-right text-rose-600 font-bold">${fmt(m.expense)}</td>
                        <td class="px-3 py-2 text-xs text-right ${netColor} font-bold">${fmt(m.net)}</td>
                    </tr>
                `;
    }).join('');

    // Executive summary
    const overallGrade = grades.filter(g => g.grade === '🟢').length >= grades.length / 2 ? '🟢 Strong' :
        grades.filter(g => g.grade === '🔴').length >= grades.length / 2 ? '🔴 Needs Work' : '🟡 Mixed';

    container.innerHTML = `
                <!-- Q-over-Q Cards -->
                <div class="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-6">${comparisonHTML}</div>

                <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <!-- Left: Scorecard + Top Expenses -->
                    <div class="space-y-4">
                        <!-- Executive Summary -->
                        <div class="bg-gradient-to-br from-indigo-50 to-slate-50 rounded-2xl p-4 border border-indigo-200">
                            <div class="flex items-center justify-between mb-2">
                                <h4 class="text-sm font-black text-slate-800">Executive Summary</h4>
                                <span class="text-xs font-black">${overallGrade}</span>
                            </div>
                            <p class="text-xs text-slate-600 leading-relaxed">
                                In ${current.label}, total revenue was <strong>${fmt(current.income)}</strong> with expenses at <strong>${fmt(current.expenses)}</strong>,
                                yielding a savings rate of <strong>${current.savingsRate.toFixed(0)}%</strong>.
                                ${comparison.incomeChange >= 0 ? 'Income grew' : 'Income declined'} by <strong>${Math.abs(comparison.incomeChange).toFixed(1)}%</strong>
                                compared to ${getQuarterLabel(prev.year, prev.quarter)}.
                                ${current.topCategories.length > 0 ? `Top spending area: <strong>${escapeHTML(current.topCategories[0].category)}</strong> at ${fmt(current.topCategories[0].amount)}.` : ''}
                            </p>
                        </div>

                        <!-- Performance Scorecard -->
                        <div class="bg-white rounded-2xl p-4 border border-slate-200">
                            <h4 class="text-sm font-black text-slate-800 mb-3">Performance Scorecard</h4>
                            ${scorecardHTML}
                        </div>

                        <!-- Top Expense Categories -->
                        <div class="bg-white rounded-2xl p-4 border border-slate-200">
                            <h4 class="text-sm font-black text-slate-800 mb-3">Top Expense Categories</h4>
                            ${topCatHTML || '<p class="text-xs text-slate-400">No expenses this quarter.</p>'}
                        </div>
                    </div>

                    <!-- Right: Monthly Breakdown -->
                    <div class="space-y-4">
                        <div class="bg-white rounded-2xl p-4 border border-slate-200">
                            <h4 class="text-sm font-black text-slate-800 mb-3">Monthly Breakdown</h4>
                            <table class="w-full">
                                <thead class="bg-slate-50">
                                    <tr>
                                        <th class="text-left text-[10px] font-black uppercase text-slate-500 px-3 py-2">Month</th>
                                        <th class="text-right text-[10px] font-black uppercase text-slate-500 px-3 py-2">Income</th>
                                        <th class="text-right text-[10px] font-black uppercase text-slate-500 px-3 py-2">Expenses</th>
                                        <th class="text-right text-[10px] font-black uppercase text-slate-500 px-3 py-2">Net</th>
                                    </tr>
                                </thead>
                                <tbody>${monthTableHTML}</tbody>
                                <tfoot class="bg-slate-50">
                                    <tr>
                                        <td class="px-3 py-2 text-xs font-black text-slate-700">Total</td>
                                        <td class="px-3 py-2 text-xs text-right font-black text-emerald-600">${fmt(current.income)}</td>
                                        <td class="px-3 py-2 text-xs text-right font-black text-rose-600">${fmt(current.expenses)}</td>
                                        <td class="px-3 py-2 text-xs text-right font-black ${current.netIncome >= 0 ? 'text-emerald-600' : 'text-rose-600'}">${fmt(current.netIncome)}</td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>

                        <!-- Quarterly Stats -->
                        <div class="bg-white rounded-2xl p-4 border border-slate-200">
                            <h4 class="text-sm font-black text-slate-800 mb-3">Quarter at a Glance</h4>
                            <div class="grid grid-cols-2 gap-3">
                                <div class="bg-slate-50 rounded-xl p-3 border border-slate-100">
                                    <p class="text-[10px] font-black uppercase text-slate-500">Avg Monthly Income</p>
                                    <p class="text-sm font-bold text-slate-800 mt-1">${fmt(current.avgMonthlyIncome)}</p>
                                </div>
                                <div class="bg-slate-50 rounded-xl p-3 border border-slate-100">
                                    <p class="text-[10px] font-black uppercase text-slate-500">Avg Monthly Spend</p>
                                    <p class="text-sm font-bold text-slate-800 mt-1">${fmt(current.avgMonthlyExpenses)}</p>
                                </div>
                                <div class="bg-slate-50 rounded-xl p-3 border border-slate-100">
                                    <p class="text-[10px] font-black uppercase text-slate-500">Transactions</p>
                                    <p class="text-sm font-bold text-slate-800 mt-1">${current.txCount}</p>
                                </div>
                                <div class="bg-slate-50 rounded-xl p-3 border border-slate-100">
                                    <p class="text-[10px] font-black uppercase text-slate-500">Income Sources</p>
                                    <p class="text-sm font-bold text-slate-800 mt-1">${Object.keys(current.incomeSources).length}</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            `;

    lucide.createIcons();
}
