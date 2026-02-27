// =============================================
// SECTION 15: BUSINESS KPI SCORECARD
// =============================================

let businessKpiRenderSeq = 0;

function getMonthKeyFromDate(dateValue) {
    const d = dateValue instanceof Date ? dateValue : new Date(dateValue || Date.now());
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    return `${y}-${String(m).padStart(2, '0')}`;
}

function getScopeDateRange(scope = metricScope) {
    const allTx = window.allDecryptedTransactions || [];
    const filtered = window.filteredTransactions || [];
    const now = new Date();

    if (scope === 'current_month') {
        return {
            start: new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0),
            end: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)
        };
    }

    if (scope === 'all_time') {
        const times = allTx.map(getTxTimestamp).filter(ts => Number.isFinite(ts) && ts > 0);
        if (!times.length) {
            return {
                start: new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0),
                end: now
            };
        }
        return {
            start: new Date(Math.min(...times)),
            end: new Date(Math.max(...times))
        };
    }

    const month = document.getElementById('filter-month')?.value || 'all';
    const year = document.getElementById('filter-year')?.value || 'all';
    if (month !== 'all' && year !== 'all') {
        const y = Number(year);
        const m = Number(month) - 1;
        return {
            start: new Date(y, m, 1, 0, 0, 0, 0),
            end: new Date(y, m + 1, 0, 23, 59, 59, 999)
        };
    }

    const source = filtered.length ? filtered : allTx;
    const times = source.map(getTxTimestamp).filter(ts => Number.isFinite(ts) && ts > 0);
    if (!times.length) {
        return {
            start: new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0),
            end: now
        };
    }

    return {
        start: new Date(Math.min(...times)),
        end: new Date(Math.max(...times))
    };
}

function isTxInRange(tx, startTs, endTs) {
    const ts = getTxTimestamp(tx);
    return Number.isFinite(ts) && ts >= startTs && ts <= endTs;
}

function computeCashBalanceAsOf(endTs, transactions) {
    return (transactions || []).reduce((sum, tx) => {
        const ts = getTxTimestamp(tx);
        if (!Number.isFinite(ts) || ts > endTs) return sum;
        const amt = Number(tx.amt) || 0;
        if (tx.type === 'income' || tx.type === 'debt_increase') return sum + amt;
        if (tx.type === 'expense') return sum - amt;
        return sum;
    }, 0);
}

function computeDebtOutstandingAsOf(endTs, transactions) {
    const debtNames = new Set((window.allDecryptedDebts || []).map(d => String(d.name || '').trim()).filter(Boolean));
    if (!debtNames.size) return 0;

    const relevant = (transactions || []).filter(tx => {
        const ts = getTxTimestamp(tx);
        if (!Number.isFinite(ts) || ts > endTs) return false;
        return debtNames.has(String(tx.category || '').trim());
    });

    const aggregates = typeof buildDebtAndLentAggregates === 'function'
        ? buildDebtAndLentAggregates(relevant)
        : { debtPaidByCategory: {}, debtBorrowedByCategory: {} };

    return (window.allDecryptedDebts || []).reduce((sum, debt) => {
        const name = String(debt.name || '').trim();
        if (!name) return sum;
        const base = Number(debt.amount) || 0;
        const borrowed = Number(aggregates.debtBorrowedByCategory?.[name] || 0);
        const paid = Number(aggregates.debtPaidByCategory?.[name] || 0);
        const outstanding = Math.max(0, base + borrowed - paid);
        return sum + outstanding;
    }, 0);
}

function computeLentOutstandingAsOf(endTs, transactions) {
    const lentPeople = window.allDecryptedLent || [];
    if (!lentPeople.length) return 0;

    const relevant = (transactions || []).filter(tx => {
        const ts = getTxTimestamp(tx);
        return Number.isFinite(ts) && ts <= endTs;
    });

    const aggregates = typeof buildDebtAndLentAggregates === 'function'
        ? buildDebtAndLentAggregates(relevant)
        : { lentExpensesByCategory: {}, lentIncomeByCategory: {} };

    return lentPeople.reduce((sum, person) => {
        const category = `Lent: ${person.name}`;
        const lentOut = Number(aggregates.lentExpensesByCategory?.[category] || 0);
        const repaid = Number(aggregates.lentIncomeByCategory?.[category] || 0);
        const outstanding = Math.max(0, lentOut - repaid);
        return sum + outstanding;
    }, 0);
}

async function computeCryptoPortfolioValue() {
    if (typeof calculateHoldings !== 'function') return 0;
    try {
        const holdings = await calculateHoldings('fifo');
        return Object.entries(holdings || {}).reduce((sum, [tokenId, holding]) => {
            const amount = Number(holding?.amount || 0);
            if (!Number.isFinite(amount) || amount <= 0.000001) return sum;
            const marketPrice = Number(cryptoPrices?.[tokenId]?.price || 0);
            if (marketPrice > 0) return sum + (amount * marketPrice);
            return sum + Number(holding?.totalCost || 0);
        }, 0);
    } catch (error) {
        console.error('KPI crypto valuation failed:', error);
        return 0;
    }
}

async function computeCryptoBuyContribution(startTs, endTs) {
    if (typeof getDecryptedCrypto !== 'function') return 0;
    try {
        const txs = await getDecryptedCrypto();
        return (txs || []).reduce((sum, tx) => {
            if (tx.type !== 'buy') return sum;
            const ts = Date.parse(tx.date);
            if (!Number.isFinite(ts) || ts < startTs || ts > endTs) return sum;
            const value = Number(tx.total ?? tx.phpTotal ?? 0);
            return sum + (Number.isFinite(value) ? value : 0);
        }, 0);
    } catch (error) {
        console.error('KPI crypto contribution failed:', error);
        return 0;
    }
}

function formatPct(value, digits = 1) {
    if (!Number.isFinite(value)) return 'n/a';
    return `${value.toFixed(digits)}%`;
}

function setBusinessKpiCard(prefix, config) {
    const valueEl = document.getElementById(`${prefix}-value`);
    const detailEl = document.getElementById(`${prefix}-detail`);
    const trendEl = document.getElementById(`${prefix}-trend`);
    if (!valueEl || !detailEl || !trendEl) return;

    valueEl.textContent = config.valueText || '—';
    detailEl.textContent = config.detailText || '—';
    trendEl.textContent = config.trendText || '—';

    valueEl.className = `text-2xl font-black mt-1 ${config.valueClass || 'text-slate-800'}`;
    trendEl.className = `text-[11px] font-bold mt-1 ${config.trendClass || 'text-slate-400'}`;
}

function getCloseRecordForMonth(monthKey) {
    return (monthlyCloseRecords || []).find(record => record?.month === monthKey) || null;
}

function getLatestClosedRecord() {
    return [...(monthlyCloseRecords || [])]
        .filter(record => record && record.status === 'closed')
        .sort((a, b) => (b.month || '').localeCompare(a.month || ''))[0] || null;
}

async function refreshBusinessKPIPanel() {
    const panel = document.getElementById('business-kpi-panel');
    if (!panel) return;

    const seq = ++businessKpiRenderSeq;
    const allTx = window.allDecryptedTransactions || [];
    const scopedTransactions = getTransactionsForScope(metricScope, allTx, window.filteredTransactions || []);
    const metrics = computeSummaryMetrics(allTx, metricScope, {
        scopeTransactions: scopedTransactions,
        filteredTransactions: window.filteredTransactions || []
    });
    const range = getScopeDateRange(metricScope);
    const startTs = range.start.getTime();
    const endTs = range.end.getTime();

    const debtNameSet = new Set((window.allDecryptedDebts || []).map(d => String(d.name || '').trim()).filter(Boolean));
    const debtService = scopedTransactions.reduce((sum, tx) => {
        if (tx.type !== 'expense') return sum;
        const category = String(tx.category || '').trim();
        if (!debtNameSet.has(category)) return sum;
        return sum + (Number(tx.amt) || 0);
    }, 0);

    const savingsContribution = scopedTransactions.reduce((sum, tx) => {
        if (tx.type !== 'expense') return sum;
        const category = String(tx.category || '').trim().toLowerCase();
        if (category !== 'savings') return sum;
        return sum + (Number(tx.amt) || 0);
    }, 0);

    const [cryptoContribution, cryptoValue] = await Promise.all([
        computeCryptoBuyContribution(startTs, endTs),
        computeCryptoPortfolioValue()
    ]);

    // Ignore stale async runs.
    if (seq !== businessKpiRenderSeq) return;

    const income = Number(metrics.income || 0);
    const debtServiceRatio = income > 0 ? (debtService / income) * 100 : NaN;
    const investmentContribution = savingsContribution + cryptoContribution;
    const investmentRate = income > 0 ? (investmentContribution / income) * 100 : NaN;

    const cashNow = computeCurrentBalance(allTx);
    const debtOutstandingNow = computeDebtOutstandingAsOf(Date.now(), allTx);
    const lentOutstandingNow = computeLentOutstandingAsOf(Date.now(), allTx);
    const netWorth = cashNow + lentOutstandingNow + cryptoValue - debtOutstandingNow;

    const selectedMonthKey = getMonthKeyFromDate(range.end);
    const currentEndTs = range.end.getTime();
    const prevMonthEnd = new Date(range.end.getFullYear(), range.end.getMonth(), 0, 23, 59, 59, 999);
    const currentCore = computeCashBalanceAsOf(currentEndTs, allTx)
        + computeLentOutstandingAsOf(currentEndTs, allTx)
        - computeDebtOutstandingAsOf(currentEndTs, allTx);
    const prevCore = computeCashBalanceAsOf(prevMonthEnd.getTime(), allTx)
        + computeLentOutstandingAsOf(prevMonthEnd.getTime(), allTx)
        - computeDebtOutstandingAsOf(prevMonthEnd.getTime(), allTx);
    const coreTrendPct = Math.abs(prevCore) > 0.01
        ? ((currentCore - prevCore) / Math.abs(prevCore)) * 100
        : NaN;

    const periodEl = document.getElementById('business-kpi-period');
    if (periodEl) {
        periodEl.textContent = `Scope: ${metrics.scopeLabel} (${getSelectedPeriodLabel()})`;
    }

    const dsrGood = Number.isFinite(debtServiceRatio) && debtServiceRatio <= 30;
    const dsrWarn = Number.isFinite(debtServiceRatio) && debtServiceRatio > 30;
    setBusinessKpiCard('kpi-dsr', {
        valueText: Number.isFinite(debtServiceRatio) ? formatPct(debtServiceRatio, 1) : 'n/a',
        detailText: `${fmt(debtService)} debt service from ${fmt(income)} income`,
        trendText: dsrWarn ? 'Above 30% caution threshold' : 'Within healthy threshold',
        valueClass: Number.isFinite(debtServiceRatio)
            ? (dsrGood ? 'text-emerald-600' : 'text-rose-600')
            : 'text-slate-500',
        trendClass: Number.isFinite(debtServiceRatio)
            ? (dsrGood ? 'text-emerald-600' : 'text-rose-600')
            : 'text-slate-400'
    });

    const investGood = Number.isFinite(investmentRate) && investmentRate >= 15;
    setBusinessKpiCard('kpi-invest', {
        valueText: Number.isFinite(investmentRate) ? formatPct(investmentRate, 1) : 'n/a',
        detailText: `${fmt(investmentContribution)} (savings ${fmt(savingsContribution)} + crypto ${fmt(cryptoContribution)})`,
        trendText: investGood ? 'On track for growth allocation' : 'Below 15% growth allocation',
        valueClass: Number.isFinite(investmentRate)
            ? (investGood ? 'text-emerald-600' : 'text-amber-600')
            : 'text-slate-500',
        trendClass: Number.isFinite(investmentRate)
            ? (investGood ? 'text-emerald-600' : 'text-amber-600')
            : 'text-slate-400'
    });

    const trendPositive = Number.isFinite(coreTrendPct) && coreTrendPct >= 0;
    setBusinessKpiCard('kpi-networth', {
        valueText: fmt(netWorth),
        detailText: `Cash ${fmt(cashNow)} + lent ${fmt(lentOutstandingNow)} + crypto ${fmt(cryptoValue)} - debt ${fmt(debtOutstandingNow)}`,
        trendText: Number.isFinite(coreTrendPct)
            ? `Core trend vs prior month: ${coreTrendPct >= 0 ? '+' : ''}${coreTrendPct.toFixed(1)}%`
            : 'Core trend vs prior month: n/a',
        valueClass: netWorth >= 0 ? 'text-slate-800' : 'text-rose-600',
        trendClass: Number.isFinite(coreTrendPct)
            ? (trendPositive ? 'text-emerald-600' : 'text-rose-600')
            : 'text-slate-400'
    });

    const selectedClose = getCloseRecordForMonth(selectedMonthKey);
    const latestClose = getLatestClosedRecord();
    let closeValue = 'Open';
    let closeValueClass = 'text-amber-600';
    let closeDetail = `${selectedMonthKey} not closed`;
    let closeTrend = latestClose
        ? `Latest close: ${latestClose.month}`
        : 'No close history yet';
    let closeTrendClass = latestClose ? 'text-slate-500' : 'text-slate-400';

    if (selectedClose && selectedClose.status === 'closed') {
        closeValue = 'Closed';
        closeValueClass = 'text-emerald-600';
        closeDetail = `${selectedMonthKey} closed on ${selectedClose.closedAt ? new Date(selectedClose.closedAt).toLocaleDateString() : 'date n/a'}`;
        if (
            typeof computeMonthlyCloseSnapshot === 'function' &&
            typeof buildMonthlyCloseChecklist === 'function' &&
            typeof getEffectiveKpiTargets === 'function'
        ) {
            const snapshot = computeMonthlyCloseSnapshot(selectedMonthKey);
            const checks = buildMonthlyCloseChecklist(snapshot, getEffectiveKpiTargets());
            const passed = checks.filter(check => check.pass).length;
            closeTrend = `${passed}/${checks.length} checklist checks passed`;
            closeTrendClass = passed === checks.length ? 'text-emerald-600' : 'text-amber-600';
        }
    } else if (
        typeof computeMonthlyCloseSnapshot === 'function' &&
        typeof buildMonthlyCloseChecklist === 'function' &&
        typeof getEffectiveKpiTargets === 'function'
    ) {
        const snapshot = computeMonthlyCloseSnapshot(selectedMonthKey);
        const checks = buildMonthlyCloseChecklist(snapshot, getEffectiveKpiTargets());
        const passed = checks.filter(check => check.pass).length;
        closeTrend = `${passed}/${checks.length} checks currently passing`;
        closeTrendClass = passed === checks.length ? 'text-emerald-600' : 'text-amber-600';
    }

    setBusinessKpiCard('kpi-close', {
        valueText: closeValue,
        detailText: closeDetail,
        trendText: closeTrend,
        valueClass: closeValueClass,
        trendClass: closeTrendClass
    });

    // ----- Financial Health Ratios (Priority 5) -----
    const totalExpense = Number(metrics.expense || 0);

    // 1. Expense-to-Income Ratio
    const expenseRatio = income > 0 ? (totalExpense / income) * 100 : NaN;
    const expenseRatioEl = document.getElementById('kpi-expense-ratio-value');
    const expenseRatioDetail = document.getElementById('kpi-expense-ratio-detail');
    if (expenseRatioEl) {
        if (Number.isFinite(expenseRatio)) {
            expenseRatioEl.textContent = formatPct(expenseRatio, 0);
            expenseRatioEl.className = `text-2xl font-black mt-1 ${expenseRatio <= 70 ? 'text-emerald-600' : expenseRatio <= 90 ? 'text-amber-600' : 'text-rose-600'}`;
            if (expenseRatioDetail) expenseRatioDetail.textContent = `${fmt(totalExpense)} of ${fmt(income)} income spent`;
        } else {
            expenseRatioEl.textContent = 'n/a';
            expenseRatioEl.className = 'text-2xl font-black mt-1 text-slate-500';
        }
    }

    // 2. Emergency Fund Coverage (months)
    const monthlyExpenseEstimate = (() => {
        const now = new Date();
        const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1);
        const recentExpenses = allTx.filter(t => {
            if (t.type !== 'expense') return false;
            const ts = getTxTimestamp(t);
            return ts >= threeMonthsAgo.getTime() && ts <= now.getTime();
        });
        const totalRecentExpense = recentExpenses.reduce((s, t) => s + (t.amt || 0), 0);
        return totalRecentExpense / 3;
    })();
    const emergencyMonths = monthlyExpenseEstimate > 0 ? cashNow / monthlyExpenseEstimate : NaN;
    const emergencyEl = document.getElementById('kpi-emergency-fund-value');
    const emergencyDetail = document.getElementById('kpi-emergency-fund-detail');
    if (emergencyEl) {
        if (Number.isFinite(emergencyMonths)) {
            emergencyEl.textContent = `${emergencyMonths.toFixed(1)}mo`;
            emergencyEl.className = `text-2xl font-black mt-1 ${emergencyMonths >= 6 ? 'text-emerald-600' : emergencyMonths >= 3 ? 'text-amber-600' : 'text-rose-600'}`;
            if (emergencyDetail) emergencyDetail.textContent = `${fmt(cashNow)} cash / ${fmt(monthlyExpenseEstimate)}/mo avg expenses`;
        } else {
            emergencyEl.textContent = 'n/a';
            emergencyEl.className = 'text-2xl font-black mt-1 text-slate-500';
        }
    }

    // 3. Current Ratio (liquid assets / current liabilities)
    const liquidAssets = Math.max(0, cashNow) + lentOutstandingNow;
    const currentLiabilities = debtOutstandingNow;
    const currentRatio = currentLiabilities > 0 ? liquidAssets / currentLiabilities : (liquidAssets > 0 ? Infinity : NaN);
    const currentRatioEl = document.getElementById('kpi-current-ratio-value');
    const currentRatioDetail = document.getElementById('kpi-current-ratio-detail');
    if (currentRatioEl) {
        if (currentRatio === Infinity) {
            currentRatioEl.textContent = '∞';
            currentRatioEl.className = 'text-2xl font-black mt-1 text-emerald-600';
            if (currentRatioDetail) currentRatioDetail.textContent = 'No liabilities — excellent position';
        } else if (Number.isFinite(currentRatio)) {
            currentRatioEl.textContent = `${currentRatio.toFixed(2)}x`;
            currentRatioEl.className = `text-2xl font-black mt-1 ${currentRatio >= 1.5 ? 'text-emerald-600' : currentRatio >= 1.0 ? 'text-amber-600' : 'text-rose-600'}`;
            if (currentRatioDetail) currentRatioDetail.textContent = `${fmt(liquidAssets)} liquid / ${fmt(currentLiabilities)} liabilities`;
        } else {
            currentRatioEl.textContent = 'n/a';
            currentRatioEl.className = 'text-2xl font-black mt-1 text-slate-500';
        }
    }

    // 4. Runway (Months on current cash)
    const activeBurnRate = monthlyExpenseEstimate; // from Emergency Fund calculation
    // Assume liquid assets for runway includes cash + lent + crypto
    const runwayLiquidAssets = liquidAssets + cryptoValue;
    const runwayMonths = activeBurnRate > 0 ? runwayLiquidAssets / activeBurnRate : NaN;
    const runwayEl = document.getElementById('kpi-runway-value');
    const runwayDetail = document.getElementById('kpi-runway-detail');
    if (runwayEl) {
        if (activeBurnRate <= 0) {
            runwayEl.textContent = '∞';
            runwayEl.className = 'text-2xl font-black mt-1 text-emerald-600';
            if (runwayDetail) runwayDetail.textContent = 'No recent burn rate';
        } else if (Number.isFinite(runwayMonths)) {
            runwayEl.textContent = `${runwayMonths.toFixed(1)}mo`;
            runwayEl.className = `text-2xl font-black mt-1 ${runwayMonths >= 6 ? 'text-emerald-600' : runwayMonths >= 3 ? 'text-amber-600' : 'text-rose-600'}`;
            if (runwayDetail) runwayDetail.textContent = `${fmt(runwayLiquidAssets)} liquid / ${fmt(activeBurnRate)}/mo burn`;
        } else {
            runwayEl.textContent = 'n/a';
            runwayEl.className = 'text-2xl font-black mt-1 text-slate-500';
        }
    }

    // ----- Trigger new panel refreshes -----
    if (typeof renderRevenueDiversificationPanel === 'function') renderRevenueDiversificationPanel();
    if (typeof renderBudgetVariancePanel === 'function') renderBudgetVariancePanel();

    const updatedEl = document.getElementById('business-kpi-updated');
    if (updatedEl) {
        updatedEl.textContent = `KPI refreshed at ${new Date().toLocaleTimeString()}`;
    }
}
