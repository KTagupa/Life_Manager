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
        return sum + getTxCashBalanceDelta(tx);
    }, 0);
}

function computeDebtOutstandingAsOf(endTs, transactions) {
    const debtList = window.allDecryptedDebts || [];
    const debtNames = typeof getDebtCategoryMatchSet === 'function'
        ? getDebtCategoryMatchSet(debtList)
        : new Set(debtList.map(d => String(d.name || '').trim()).filter(Boolean));
    const debtIds = new Set(debtList.map(d => String(d.id || '').trim()).filter(Boolean));
    if (!debtNames.size && !debtIds.size) return 0;

    const relevant = (transactions || []).filter(tx => {
        const ts = getTxTimestamp(tx);
        if (!Number.isFinite(ts) || ts > endTs) return false;
        const txDebtId = String(tx.debtId || '').trim();
        return (txDebtId && debtIds.has(txDebtId)) || debtNames.has(String(tx.category || '').trim());
    });

    const aggregates = typeof buildDebtAndLentAggregates === 'function'
        ? buildDebtAndLentAggregates(relevant)
        : { debtPaidByCategory: {}, debtBorrowedByCategory: {} };
    const fallbackOwners = typeof buildDebtCategoryFallbackOwners === 'function'
        ? buildDebtCategoryFallbackOwners(debtList)
        : null;

    return debtList.reduce((sum, debt) => {
        const name = String(debt.name || '').trim();
        if (!name) return sum;
        const borrowDateTs = debt?.borrowDate ? Date.parse(debt.borrowDate) : NaN;
        const base = Number.isFinite(borrowDateTs) && borrowDateTs > endTs
            ? 0
            : (Number(debt.amount) || 0);
        const debtAmounts = typeof getDebtAggregateAmounts === 'function'
            ? getDebtAggregateAmounts(debt, aggregates, fallbackOwners)
            : {
                paid: Number(aggregates.debtPaidByCategory?.[name] || 0),
                borrowedMore: Number(aggregates.debtBorrowedByCategory?.[name] || 0)
            };
        const borrowed = debtAmounts.borrowedMore;
        const paid = debtAmounts.paid;
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
    const fallbackOwners = typeof buildLentCategoryFallbackOwners === 'function'
        ? buildLentCategoryFallbackOwners(lentPeople)
        : null;

    return lentPeople.reduce((sum, person) => {
        const category = `Lent: ${person.name}`;
        const lentAmounts = typeof getLentAggregateAmounts === 'function'
            ? getLentAggregateAmounts(person, aggregates, fallbackOwners)
            : {
                expenses: Number(aggregates.lentExpensesByCategory?.[category] || 0),
                income: Number(aggregates.lentIncomeByCategory?.[category] || 0)
            };
        const lentOut = lentAmounts.expenses;
        const repaid = lentAmounts.income;
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

function computeLegacyKpiConsumerBreakdown(scopedTransactions) {
    const debtList = window.allDecryptedDebts || [];
    const debtNameSet = typeof getDebtCategoryMatchSet === 'function'
        ? getDebtCategoryMatchSet(debtList)
        : new Set(debtList.map(d => String(d.name || '').trim()).filter(Boolean));
    const debtIdSet = new Set(debtList.map(d => String(d.id || '').trim()).filter(Boolean));
    const debtService = (scopedTransactions || []).reduce((sum, tx) => {
        const amount = Number(tx.amt) || 0;
        if (!Number.isFinite(amount) || amount <= 0) return sum;
        if (isCreditCardPayment(tx)) return sum + amount;
        if (tx.type !== 'expense') return sum;
        const txDebtId = String(tx.debtId || '').trim();
        if (txDebtId && debtIdSet.has(txDebtId)) return sum + amount;
        const category = String(tx.category || '').trim();
        return debtNameSet.has(category) ? sum + amount : sum;
    }, 0);
    const savingsContribution = (scopedTransactions || []).reduce((sum, tx) => {
        if (tx.type !== 'expense') return sum;
        return String(tx.category || '').trim().toLowerCase() === 'savings'
            ? sum + (Number(tx.amt) || 0)
            : sum;
    }, 0);
    return { debtService, savingsContribution, source: 'legacy_fallback' };
}

function getKpiConsumerBreakdown(metrics, scopedTransactions) {
    const canonical = typeof buildFinanceConsumerBreakdown === 'function'
        ? buildFinanceConsumerBreakdown(metrics)
        : null;
    return canonical?.available
        ? { ...canonical, source: 'canonical_classifications' }
        : computeLegacyKpiConsumerBreakdown(scopedTransactions);
}

function computeLegacyKpiCorePositionAsOf(endTs, transactions) {
    return computeCashBalanceAsOf(endTs, transactions)
        + computeLentOutstandingAsOf(endTs, transactions)
        - (computeDebtOutstandingAsOf(endTs, transactions)
            + computeCreditCardOutstandingAsOf(endTs, transactions)
            + computeInstallmentOutstandingAsOf(endTs, transactions));
}

function computeKpiCorePositionAsOf(endTs, transactions) {
    const fallback = () => ({
        value: computeLegacyKpiCorePositionAsOf(endTs, transactions),
        trackedCash: computeCashBalanceAsOf(endTs, transactions),
        source: 'legacy_fallback'
    });
    const shadowReport = typeof getFinanceSnapshotShadowReport === 'function'
        ? getFinanceSnapshotShadowReport()
        : window.financeSnapshotShadowReport;
    if (shadowReport?.history?.ready !== true
        || typeof buildFinanceCanonicalSnapshotInput !== 'function'
        || typeof computeCanonicalFinanceSnapshot !== 'function') return fallback();

    try {
        const canonical = computeCanonicalFinanceSnapshot(
            buildFinanceCanonicalSnapshotInput({
                bookValue: null,
                marketValue: null,
                missingPriceCount: 0
            }),
            { asOf: endTs }
        );
        const diagnostics = canonical?.diagnostics || {};
        if (diagnostics.safeForShadowComparison !== true
            || Number(diagnostics.missingLiabilityStartDateCount || 0) > 0) return fallback();
        return {
            value: Number(canonical.trackedCash || 0)
                + Number(canonical.receivables || 0)
                - Number(canonical.liabilities?.total || 0),
            trackedCash: Number(canonical.trackedCash || 0),
            source: 'canonical_snapshot',
            engineVersion: canonical.engineVersion || null
        };
    } catch (error) {
        console.warn('[business-kpi] Canonical core position unavailable.', error);
        return fallback();
    }
}

async function refreshBusinessKPIPanel() {
    const panel = document.getElementById('business-kpi-panel');
    if (!panel) return;

    const seq = ++businessKpiRenderSeq;
    const allTx = window.allDecryptedTransactions || [];
    const reportsPresentation = typeof getFinanceReportsPresentation === 'function'
        ? getFinanceReportsPresentation()
        : null;
    const scopedTransactions = typeof getFinanceReportsScopedTransactions === 'function'
        ? getFinanceReportsScopedTransactions()
        : getTransactionsForScope(metricScope, allTx, window.filteredTransactions || []);
    const metrics = computeSummaryMetrics(allTx, metricScope, {
        scopeTransactions: scopedTransactions,
        filteredTransactions: window.filteredTransactions || []
    });
    const reportStart = new Date(reportsPresentation?.scope?.start || '');
    const reportEnd = new Date(reportsPresentation?.scope?.end || '');
    const range = Number.isFinite(reportStart.getTime()) && Number.isFinite(reportEnd.getTime())
        ? { start: reportStart, end: reportEnd }
        : getScopeDateRange(metricScope);
    const startTs = range.start.getTime();
    const endTs = range.end.getTime();
    const consumerBreakdown = getKpiConsumerBreakdown(metrics, scopedTransactions);
    const debtService = Number(consumerBreakdown.debtService || 0);
    const savingsContribution = Number(consumerBreakdown.savingsContribution || 0);

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

    const currentPosition = computeKpiCorePositionAsOf(Date.now(), allTx);
    const cashNow = Number(currentPosition.trackedCash || 0);
    const debtOutstandingNow = computeDebtOutstandingAsOf(Date.now(), allTx) + computeCreditCardOutstandingAsOf(Date.now(), allTx) + computeInstallmentOutstandingAsOf(Date.now(), allTx);
    const lentOutstandingNow = computeLentOutstandingAsOf(Date.now(), allTx);
    const netWorth = cashNow + lentOutstandingNow + cryptoValue - debtOutstandingNow;
    const netWorthView = typeof getFinanceMarketNetWorthView === 'function'
        ? getFinanceMarketNetWorthView({
            netWorth,
            cash: cashNow,
            receivables: lentOutstandingNow,
            crypto: cryptoValue,
            liabilities: debtOutstandingNow,
            asOf: new Date().toISOString()
        })
        : {
            mode: 'legacy',
            value: netWorth,
            cash: cashNow,
            receivables: lentOutstandingNow,
            fixedAssets: 0,
            crypto: cryptoValue,
            liabilities: debtOutstandingNow,
            reason: 'adapter_unavailable'
        };
    const liquidityMetrics = typeof computeCanonicalFinanceLiquidity === 'function'
        ? computeCanonicalFinanceLiquidity({
            transactions: allTx,
            trackedCash: cashNow,
            additionalQuarantinedCount: Number(window.financeTransactionDateQuality?.quarantinedCount || 0)
        }, {
            asOf: new Date(),
            context: typeof getRuntimeFinanceClassificationContext === 'function'
                ? getRuntimeFinanceClassificationContext()
                : {}
        })
        : null;

    const selectedMonthKey = getMonthKeyFromDate(range.end);
    const currentEndTs = range.end.getTime();
    const prevMonthEnd = new Date(range.end.getFullYear(), range.end.getMonth(), 0, 23, 59, 59, 999);
    const currentCorePosition = computeKpiCorePositionAsOf(currentEndTs, allTx);
    const previousCorePosition = computeKpiCorePositionAsOf(prevMonthEnd.getTime(), allTx);
    const currentCore = currentCorePosition.value;
    const prevCore = previousCorePosition.value;
    const coreTrendPct = Math.abs(prevCore) > 0.01
        ? ((currentCore - prevCore) / Math.abs(prevCore)) * 100
        : NaN;

    const periodEl = document.getElementById('business-kpi-period');
    if (periodEl) {
        const metricSource = typeof formatFinanceMetricProvenance === 'function'
            ? formatFinanceMetricProvenance(metrics)
            : (metrics.metricEngine === 'canonical' ? 'Canonical metrics' : 'Legacy metrics');
        periodEl.textContent = `${reportsPresentation?.cards?.scorecard?.caption || `For ${metrics.scopeLabel}`} • ${metricSource}`;
    }
    panel.dataset.financeMetricEngine = metrics.metricProvenance?.engine || metrics.metricEngine || 'legacy';
    panel.dataset.financeMetricVersion = metrics.metricProvenance?.engineVersion || '';
    panel.dataset.financeBreakdownSource = consumerBreakdown.source || 'legacy_fallback';
    panel.dataset.financePositionSource = currentCorePosition.source || 'legacy_fallback';

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
    const netWorthLabelEl = document.getElementById('kpi-networth-label');
    const netWorthCardEl = document.getElementById('kpi-networth-card');
    if (netWorthLabelEl) {
        netWorthLabelEl.textContent = netWorthView.mode === 'legacy'
            ? 'Estimated Net Worth (Legacy)'
            : 'Estimated Net Worth (Market)';
    }
    if (netWorthCardEl) netWorthCardEl.dataset.valuationState = netWorthView.mode;
    if (document.body) document.body.dataset.financeSnapshotMarketEngine = netWorthView.mode;

    const missingMarketPrices = Math.max(0, Number(netWorthView.missingPriceCount || 0));
    const marketUnavailable = netWorthView.mode === 'unavailable';
    const netWorthAsOfDate = netWorthView.asOf ? new Date(netWorthView.asOf) : new Date();
    const netWorthAsOfLabel = Number.isFinite(netWorthAsOfDate.getTime())
        ? `As of ${netWorthAsOfDate.toLocaleDateString('en', { month: 'short', day: 'numeric' })}`
        : 'As of now';
    const netWorthDetail = marketUnavailable
        ? (missingMarketPrices > 0
            ? `${netWorthAsOfLabel} • Market value unavailable — prices missing for ${missingMarketPrices} crypto holding${missingMarketPrices === 1 ? '' : 's'}`
            : `${netWorthAsOfLabel} • Market value is currently unavailable`)
        : `${netWorthAsOfLabel} • ${netWorthView.mode === 'legacy' ? 'Legacy estimate • ' : ''}Cash ${fmt(netWorthView.cash)} + receivables ${fmt(netWorthView.receivables)} + crypto ${fmt(netWorthView.crypto)} + fixed assets ${fmt(netWorthView.fixedAssets)} - liabilities ${fmt(netWorthView.liabilities)}`;
    const netWorthTrend = marketUnavailable
        ? 'See the separate book-value estimate in the Reports position comparison'
        : `${netWorthView.mode === 'legacy' ? 'Canonical reconciliation unavailable • ' : ''}${Number.isFinite(coreTrendPct)
            ? `Core trend vs prior month: ${coreTrendPct >= 0 ? '+' : ''}${coreTrendPct.toFixed(1)}%`
            : 'Core trend vs prior month: n/a'}`;
    setBusinessKpiCard('kpi-networth', {
        valueText: marketUnavailable || netWorthView.value == null ? 'n/a' : fmt(netWorthView.value),
        detailText: netWorthDetail,
        trendText: netWorthTrend,
        valueClass: marketUnavailable
            ? 'text-slate-500'
            : (Number(netWorthView.value) >= 0 ? 'text-slate-800' : 'text-rose-600'),
        trendClass: marketUnavailable
            ? 'text-indigo-600'
            : (Number.isFinite(coreTrendPct)
            ? (trendPositive ? 'text-emerald-600' : 'text-rose-600')
            : 'text-slate-400')
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

    if (reportsPresentation && !reportsPresentation.scope.isSingleMonth) {
        closeValue = 'n/a';
        closeValueClass = 'text-slate-500';
        closeDetail = 'Choose one month to review close readiness';
        closeTrend = latestClose ? `Latest close: ${latestClose.month}` : 'No close history yet';
        closeTrendClass = 'text-slate-400';
    } else if (selectedClose && selectedClose.status === 'closed') {
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

    // 1. Spending-to-Income Ratio
    const expenseRatio = income > 0 ? (totalExpense / income) * 100 : NaN;
    const expenseRatioEl = document.getElementById('kpi-expense-ratio-value');
    const expenseRatioDetail = document.getElementById('kpi-expense-ratio-detail');
    if (expenseRatioEl) {
        if (Number.isFinite(expenseRatio)) {
            expenseRatioEl.textContent = formatPct(expenseRatio, 0);
            expenseRatioEl.className = `text-2xl font-black mt-1 ${expenseRatio <= 70 ? 'text-emerald-600' : expenseRatio <= 90 ? 'text-amber-600' : 'text-rose-600'}`;
            if (expenseRatioDetail) expenseRatioDetail.textContent = `${fmt(totalExpense)} of ${fmt(income)} earned income spent`;
        } else {
            expenseRatioEl.textContent = 'n/a';
            expenseRatioEl.className = 'text-2xl font-black mt-1 text-slate-500';
        }
    }

    // 2. Emergency Fund Coverage proxy (cash / 3 complete months of canonical spending)
    const monthlyExpenseEstimate = Number(liquidityMetrics?.averageMonthlyConsumption || 0);
    const liquidityReady = liquidityMetrics?.diagnostics?.safeForVisibleCutover === true;
    const liquidityPeriodLabel = liquidityMetrics?.window?.label || 'previous 3 complete months';
    const emergencyMonths = liquidityReady
        && liquidityMetrics?.emergencyFundCoverageMonths != null
        && Number.isFinite(Number(liquidityMetrics?.emergencyFundCoverageMonths))
        ? Number(liquidityMetrics.emergencyFundCoverageMonths)
        : NaN;
    const emergencyEl = document.getElementById('kpi-emergency-fund-value');
    const emergencyDetail = document.getElementById('kpi-emergency-fund-detail');
    if (emergencyEl) {
        if (Number.isFinite(emergencyMonths)) {
            emergencyEl.textContent = `${emergencyMonths.toFixed(1)}mo`;
            emergencyEl.className = `text-2xl font-black mt-1 ${emergencyMonths >= 6 ? 'text-emerald-600' : emergencyMonths >= 3 ? 'text-amber-600' : 'text-rose-600'}`;
            if (emergencyDetail) emergencyDetail.textContent = `${fmt(liquidityMetrics.eligibleCash)} cash / ${fmt(monthlyExpenseEstimate)}/mo spending • ${liquidityPeriodLabel}`;
        } else {
            emergencyEl.textContent = 'n/a';
            emergencyEl.className = 'text-2xl font-black mt-1 text-slate-500';
            if (emergencyDetail) {
                emergencyDetail.textContent = !liquidityReady
                    ? 'Liquidity data needs review before coverage can be calculated'
                    : `No consumption recorded in ${liquidityPeriodLabel}`;
            }
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
            if (currentRatioDetail) currentRatioDetail.textContent = 'No tracked liabilities • proxy, not 30-day coverage';
        } else if (Number.isFinite(currentRatio)) {
            currentRatioEl.textContent = `${currentRatio.toFixed(2)}x`;
            currentRatioEl.className = `text-2xl font-black mt-1 ${currentRatio >= 1.5 ? 'text-emerald-600' : currentRatio >= 1.0 ? 'text-amber-600' : 'text-rose-600'}`;
            if (currentRatioDetail) currentRatioDetail.textContent = `${fmt(liquidAssets)} cash + receivables / ${fmt(currentLiabilities)} all liabilities • proxy`;
        } else {
            currentRatioEl.textContent = 'n/a';
            currentRatioEl.className = 'text-2xl font-black mt-1 text-slate-500';
            if (currentRatioDetail) currentRatioDetail.textContent = '30-day obligation coverage is deferred';
        }
    }

    // 4. Liquidity Runway (tracked cash only; receivables and crypto are excluded)
    const activeBurnRate = monthlyExpenseEstimate;
    const runwayMonths = liquidityReady
        && liquidityMetrics?.liquidityRunwayMonths != null
        && Number.isFinite(Number(liquidityMetrics?.liquidityRunwayMonths))
        ? Number(liquidityMetrics.liquidityRunwayMonths)
        : NaN;
    const runwayEl = document.getElementById('kpi-runway-value');
    const runwayDetail = document.getElementById('kpi-runway-detail');
    if (runwayEl) {
        if (Number.isFinite(runwayMonths)) {
            runwayEl.textContent = `${runwayMonths.toFixed(1)}mo`;
            runwayEl.className = `text-2xl font-black mt-1 ${runwayMonths >= 6 ? 'text-emerald-600' : runwayMonths >= 3 ? 'text-amber-600' : 'text-rose-600'}`;
            if (runwayDetail) runwayDetail.textContent = `${fmt(liquidityMetrics.eligibleCash)} cash only / ${fmt(activeBurnRate)}/mo spending • ${liquidityPeriodLabel}`;
        } else {
            runwayEl.textContent = 'n/a';
            runwayEl.className = 'text-2xl font-black mt-1 text-slate-500';
            if (runwayDetail) {
                runwayDetail.textContent = !liquidityReady
                    ? 'Liquidity data needs review before runway can be calculated'
                    : `No consumption recorded in ${liquidityPeriodLabel}`;
            }
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

window.addEventListener?.('finance:snapshot-shadow-updated', () => {
    if (typeof refreshBusinessKPIPanel === 'function') refreshBusinessKPIPanel();
});
