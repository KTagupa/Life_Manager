// =============================================
// SECTION 17: FINANCIAL STATEMENTS MODULE
// =============================================

let statementsRefreshSeq = 0;
let statementsTrendChart = null;
let statementsTrendCache = { key: null, points: null };

function statementsNormalizeMonthKey(value) {
    const raw = String(value || '').trim();
    const match = raw.match(/^(\d{4})-(\d{2})$/);
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) return null;
    return `${year}-${String(month).padStart(2, '0')}`;
}

function statementsDateToMonthKey(dateValue) {
    const date = dateValue instanceof Date ? dateValue : new Date(dateValue || Date.now());
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function statementsMonthKeyToDate(monthKey) {
    const normalized = statementsNormalizeMonthKey(monthKey);
    if (!normalized) return null;
    const [year, month] = normalized.split('-').map(Number);
    return new Date(year, month - 1, 1);
}

function statementsGetMonthLabel(monthKey) {
    const date = statementsMonthKeyToDate(monthKey);
    if (!date) return monthKey || 'Unknown';
    return date.toLocaleDateString('en', { month: 'long', year: 'numeric' });
}

function statementsShiftMonthKey(monthKey, offset) {
    const date = statementsMonthKeyToDate(monthKey);
    if (!date) return null;
    return statementsDateToMonthKey(new Date(date.getFullYear(), date.getMonth() + Number(offset || 0), 1));
}

function statementsBuildRollingMonthKeys(endMonthKey, totalMonths = 12) {
    const normalizedEnd = statementsNormalizeMonthKey(endMonthKey) || statementsDateToMonthKey(new Date());
    const count = Math.max(3, Math.min(24, Math.round(Number(totalMonths) || 12)));
    const keys = [];
    for (let i = count - 1; i >= 0; i -= 1) {
        const monthKey = statementsShiftMonthKey(normalizedEnd, -i);
        if (monthKey) keys.push(monthKey);
    }
    return keys;
}

function statementsResolveDefaultMonthKey() {
    const month = document.getElementById('filter-month')?.value;
    const year = document.getElementById('filter-year')?.value;
    if (month && year && month !== 'all' && year !== 'all') {
        return statementsNormalizeMonthKey(`${year}-${String(month).padStart(2, '0')}`) || statementsDateToMonthKey(new Date());
    }
    return statementsDateToMonthKey(new Date());
}

function statementsGetSelectedMonthKeyFromInput() {
    const el = document.getElementById('st-month');
    const normalized = statementsNormalizeMonthKey(el?.value);
    if (normalized) return normalized;
    const fallback = statementsResolveDefaultMonthKey();
    if (el) el.value = fallback;
    return fallback;
}

function statementsGetMonthRange(monthKey) {
    const date = statementsMonthKeyToDate(monthKey);
    if (!date) return null;
    const start = new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);
    const end = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
    return {
        start,
        end,
        startTs: start.getTime(),
        endTs: end.getTime()
    };
}

function statementsGetTransactionsForMonth(monthKey, allTransactions = null) {
    const date = statementsMonthKeyToDate(monthKey);
    if (!date) return [];
    const txs = allTransactions || window.allDecryptedTransactions || [];
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    return txs.filter(tx => getTxYear(tx) === year && getTxMonth(tx) === month);
}

function statementsBuildDebtAndLentAggregates(transactions) {
    if (typeof buildDebtAndLentAggregates === 'function') {
        return buildDebtAndLentAggregates(transactions || []);
    }

    const debtPaidByCategory = Object.create(null);
    const debtBorrowedByCategory = Object.create(null);
    const lentExpensesByCategory = Object.create(null);
    const lentIncomeByCategory = Object.create(null);

    (transactions || []).forEach(tx => {
        const category = String(tx?.category || '').trim();
        const amount = Number(tx?.amt || 0);
        if (!category || !Number.isFinite(amount) || amount <= 0) return;

        if (tx.type === 'expense') {
            debtPaidByCategory[category] = (debtPaidByCategory[category] || 0) + amount;
            if (category.startsWith('Lent: ')) {
                lentExpensesByCategory[category] = (lentExpensesByCategory[category] || 0) + amount;
            }
            return;
        }

        if (tx.type === 'income' || tx.type === 'debt_increase') {
            debtBorrowedByCategory[category] = (debtBorrowedByCategory[category] || 0) + amount;
            if (tx.type === 'income' && category.startsWith('Lent: ')) {
                lentIncomeByCategory[category] = (lentIncomeByCategory[category] || 0) + amount;
            }
        }
    });

    return {
        debtPaidByCategory,
        debtBorrowedByCategory,
        lentExpensesByCategory,
        lentIncomeByCategory
    };
}

function statementsComputeCashBalanceAsOf(endTs, transactions) {
    return (transactions || []).reduce((sum, tx) => {
        const ts = getTxTimestamp(tx);
        if (!Number.isFinite(ts) || ts > endTs) return sum;
        const amount = Number(tx.amt || 0);
        if (!Number.isFinite(amount) || amount <= 0) return sum;
        if (tx.type === 'income' || tx.type === 'debt_increase') return sum + amount;
        if (tx.type === 'expense') return sum - amount;
        return sum;
    }, 0);
}

function statementsComputeDebtOutstandingAsOf(endTs, transactions) {
    const debtList = window.allDecryptedDebts || [];
    if (!debtList.length) return 0;

    const debtNameSet = new Set(debtList.map(d => String(d?.name || '').trim()).filter(Boolean));
    const relevant = (transactions || []).filter(tx => {
        const ts = getTxTimestamp(tx);
        if (!Number.isFinite(ts) || ts > endTs) return false;
        return debtNameSet.has(String(tx?.category || '').trim());
    });

    const aggregates = statementsBuildDebtAndLentAggregates(relevant);
    return debtList.reduce((sum, debt) => {
        const debtName = String(debt?.name || '').trim();
        if (!debtName) return sum;

        const base = Number(debt?.amount || 0);
        const borrowed = Number(aggregates.debtBorrowedByCategory?.[debtName] || 0);
        const paid = Number(aggregates.debtPaidByCategory?.[debtName] || 0);
        const outstanding = Math.max(0, base + borrowed - paid);
        return sum + outstanding;
    }, 0);
}

function statementsComputeReceivablesAsOf(endTs, transactions) {
    const lentEntries = window.allDecryptedLent || [];
    if (!lentEntries.length) return 0;

    const relevant = (transactions || []).filter(tx => {
        const ts = getTxTimestamp(tx);
        return Number.isFinite(ts) && ts <= endTs;
    });
    const aggregates = statementsBuildDebtAndLentAggregates(relevant);

    return lentEntries.reduce((sum, entry) => {
        const category = `Lent: ${entry?.name || ''}`;
        const lentOut = Number(aggregates.lentExpensesByCategory?.[category] || 0);
        const repaid = Number(aggregates.lentIncomeByCategory?.[category] || 0);
        return sum + Math.max(0, lentOut - repaid);
    }, 0);
}

function statementsToNumber(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

async function statementsComputeCryptoPositionAsOf(endTs, targetMonthKey) {
    const defaults = {
        bookValue: 0,
        buyOutflowToDate: 0,
        sellInflowToDate: 0,
        buyOutflowInMonth: 0,
        sellInflowInMonth: 0
    };

    if (typeof getDecryptedCrypto !== 'function') return defaults;

    try {
        const txs = await getDecryptedCrypto();
        const relevant = (txs || [])
            .filter(tx => {
                const ts = Date.parse(tx?.date);
                return Number.isFinite(ts) && ts <= endTs;
            })
            .sort((a, b) => Date.parse(a.date) - Date.parse(b.date));

        const holdings = Object.create(null);
        const pendingSwaps = Object.create(null);
        let buyOutflowToDate = 0;
        let sellInflowToDate = 0;
        let buyOutflowInMonth = 0;
        let sellInflowInMonth = 0;

        relevant.forEach(tx => {
            const tokenId = String(tx?.tokenId || '').trim();
            if (!tokenId) return;

            if (!holdings[tokenId]) {
                holdings[tokenId] = {
                    amount: 0,
                    totalCost: 0,
                    lots: []
                };
            }

            const h = holdings[tokenId];
            const amount = Math.max(0, statementsToNumber(tx?.amount, 0));
            const total = Math.max(0, statementsToNumber(tx?.total ?? tx?.phpTotal, 0));
            const txTs = Date.parse(tx.date);
            const txMonthKey = statementsDateToMonthKey(new Date(txTs));

            if (tx.type === 'buy') {
                h.amount += amount;
                h.totalCost += total;
                h.lots.push({
                    amount,
                    price: amount > 0 ? (total / amount) : 0
                });

                buyOutflowToDate += total;
                if (txMonthKey === targetMonthKey) {
                    buyOutflowInMonth += total;
                }
                return;
            }

            if (tx.type === 'sell' || tx.type === 'swap_out') {
                let remainingToSell = amount;
                let soldAmount = 0;
                let costOfSold = 0;

                while (remainingToSell > 0.000001 && h.lots.length > 0) {
                    const lot = h.lots[0];
                    const soldFromLot = Math.min(remainingToSell, lot.amount);
                    costOfSold += soldFromLot * (lot.price || 0);
                    lot.amount -= soldFromLot;
                    soldAmount += soldFromLot;
                    remainingToSell -= soldFromLot;
                    if (lot.amount <= 0.000001) {
                        h.lots.shift();
                    }
                }

                h.amount = Math.max(0, h.amount - soldAmount);
                h.totalCost = h.lots.reduce((sum, lot) => sum + ((lot.amount || 0) * (lot.price || 0)), 0);

                if (tx.type === 'sell') {
                    sellInflowToDate += total;
                    if (txMonthKey === targetMonthKey) {
                        sellInflowInMonth += total;
                    }
                } else if (tx.swapId) {
                    pendingSwaps[tx.swapId] = costOfSold;
                }
                return;
            }

            if (tx.type === 'swap_in') {
                const transferredCost = Math.max(0, statementsToNumber(pendingSwaps[tx.swapId], 0));
                h.amount += amount;
                h.totalCost += transferredCost;
                h.lots.push({
                    amount,
                    price: amount > 0 ? (transferredCost / amount) : 0
                });
                if (tx.swapId) delete pendingSwaps[tx.swapId];
            }
        });

        const bookValue = Object.values(holdings).reduce((sum, h) => {
            const amount = Number(h?.amount || 0);
            if (!Number.isFinite(amount) || amount <= 0.000001) return sum;
            return sum + Number(h?.totalCost || 0);
        }, 0);

        return {
            bookValue,
            buyOutflowToDate,
            sellInflowToDate,
            buyOutflowInMonth,
            sellInflowInMonth
        };
    } catch (error) {
        console.error('Statement crypto position computation failed:', error);
        return defaults;
    }
}

function statementsGetCloseStatus(monthKey) {
    const record = (monthlyCloseRecords || []).find(item => item?.month === monthKey);
    return record?.status === 'closed' ? 'closed' : 'open';
}

async function resolveStatementForMonth(monthKey, options = {}) {
    const normalizedMonth = statementsNormalizeMonthKey(monthKey);
    if (!normalizedMonth) return { statement: null, source: 'none' };

    const preferSnapshotForClosed = options.preferSnapshotForClosed !== false;
    const snapshot = getStatementSnapshotByMonth(normalizedMonth);
    const closeStatus = statementsGetCloseStatus(normalizedMonth);

    if (preferSnapshotForClosed && closeStatus === 'closed' && snapshot) {
        return { statement: snapshot, source: 'snapshot' };
    }

    const liveStatement = await computeStatementForMonth(normalizedMonth);
    if (liveStatement) {
        return { statement: liveStatement, source: 'live' };
    }

    if (snapshot) {
        return { statement: snapshot, source: 'snapshot' };
    }

    return { statement: null, source: 'none' };
}

function getStatementsTrendCacheKey(endMonthKey) {
    const txs = window.allDecryptedTransactions || [];
    let txHash = 0;
    txs.forEach(tx => {
        const token = `${tx?.id || ''}|${tx?.type || ''}|${tx?.category || ''}|${Number(tx?.amt || 0).toFixed(2)}|${getTxTimestamp(tx)}`;
        for (let i = 0; i < token.length; i += 1) {
            txHash = ((txHash * 31) + token.charCodeAt(i)) >>> 0;
        }
    });

    const snapshotLastModified = (statementSnapshots || []).reduce((max, item) => {
        const ts = Number(item?.lastModified || 0);
        return ts > max ? ts : max;
    }, 0);

    const closeLastModified = (monthlyCloseRecords || []).reduce((max, item) => {
        const ts = Number(item?.lastModified || 0);
        return ts > max ? ts : max;
    }, 0);

    return [
        endMonthKey,
        txs.length,
        txHash,
        snapshotLastModified,
        closeLastModified,
        (rawCrypto || []).length,
        (rawDebts || []).length,
        (rawLent || []).length
    ].join('|');
}

function renderEmptyStatementsTrend(message) {
    const statusEl = document.getElementById('st-trend-status');
    const summaryEl = document.getElementById('st-trend-summary');
    if (statusEl) statusEl.textContent = message || 'No trend data.';
    if (summaryEl) summaryEl.textContent = 'Generate snapshots or add transactions to build trend lines.';
    if (statementsTrendChart) {
        statementsTrendChart.destroy();
        statementsTrendChart = null;
    }
}

function renderStatementsTrendChart(points, endMonthKey) {
    const canvas = document.getElementById('st-trend-chart');
    const statusEl = document.getElementById('st-trend-status');
    const summaryEl = document.getElementById('st-trend-summary');
    if (!canvas || !statusEl || !summaryEl || typeof Chart === 'undefined') return;

    if (statementsTrendChart) {
        statementsTrendChart.destroy();
        statementsTrendChart = null;
    }

    if (!Array.isArray(points) || !points.length) {
        renderEmptyStatementsTrend('No trend data.');
        return;
    }

    const labels = points.map(point => {
        const date = statementsMonthKeyToDate(point.month);
        return date
            ? date.toLocaleDateString('en', { month: 'short', year: '2-digit' })
            : point.month;
    });

    statementsTrendChart = new Chart(canvas, {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label: 'Net Income',
                    data: points.map(point => Number(point.netIncome || 0)),
                    borderColor: '#4f46e5',
                    backgroundColor: 'rgba(79, 70, 229, 0.08)',
                    fill: true,
                    tension: 0.28,
                    pointRadius: 0
                },
                {
                    label: 'Net Worth',
                    data: points.map(point => Number(point.netWorth || 0)),
                    borderColor: '#10b981',
                    backgroundColor: 'rgba(16, 185, 129, 0.08)',
                    fill: false,
                    tension: 0.28,
                    pointRadius: 0
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { boxWidth: 10, font: { size: 10 } }
                },
                tooltip: {
                    callbacks: {
                        label: (ctx) => `${ctx.dataset.label}: ${formatCurrency(ctx.parsed.y, activeCurrency)}`
                    }
                }
            },
            scales: {
                y: {
                    ticks: {
                        callback: value => formatCurrency(Number(value || 0), activeCurrency)
                    }
                }
            }
        }
    });

    const first = points[0];
    const last = points[points.length - 1];
    const incomeDelta = Number(last.netIncome || 0) - Number(first.netIncome || 0);
    const netWorthDelta = Number(last.netWorth || 0) - Number(first.netWorth || 0);
    const incomeDeltaLabel = `${incomeDelta >= 0 ? '+' : ''}${fmt(incomeDelta)}`;
    const netWorthDeltaLabel = `${netWorthDelta >= 0 ? '+' : ''}${fmt(netWorthDelta)}`;

    statusEl.textContent = `12 months ending ${statementsGetMonthLabel(endMonthKey)}`;
    summaryEl.textContent = `Net income ${fmt(Number(first.netIncome || 0))} → ${fmt(Number(last.netIncome || 0))} (${incomeDeltaLabel}) • Net worth ${fmt(Number(first.netWorth || 0))} → ${fmt(Number(last.netWorth || 0))} (${netWorthDeltaLabel})`;
}

async function refreshStatementsTrendChart(endMonthKey) {
    const monthKey = statementsNormalizeMonthKey(endMonthKey) || statementsGetSelectedMonthKeyFromInput();
    const statusEl = document.getElementById('st-trend-status');
    if (!statusEl) return;

    const currentSeq = statementsRefreshSeq;
    const cacheKey = getStatementsTrendCacheKey(monthKey);
    if (statementsTrendCache.key === cacheKey && Array.isArray(statementsTrendCache.points)) {
        renderStatementsTrendChart(statementsTrendCache.points, monthKey);
        return;
    }

    statusEl.textContent = 'Loading trend...';
    const monthKeys = statementsBuildRollingMonthKeys(monthKey, 12);
    const points = [];

    for (const key of monthKeys) {
        const { statement } = await resolveStatementForMonth(key, { preferSnapshotForClosed: true });
        if (!statement) continue;
        points.push({
            month: key,
            netIncome: Number(statement?.pnl?.netIncome || 0),
            netWorth: Number(statement?.balanceSheet?.netWorth || 0)
        });
    }

    // Prevent stale render when a new refresh cycle supersedes this one.
    if (currentSeq !== statementsRefreshSeq) return;

    statementsTrendCache = {
        key: cacheKey,
        points
    };
    renderStatementsTrendChart(points, monthKey);
}

function statementsNormalizeSnapshotPayload(payload) {
    if (typeof normalizeStatementSnapshotEntry === 'function') {
        return normalizeStatementSnapshotEntry(payload);
    }
    return payload;
}

async function computeStatementForMonth(monthKey) {
    const normalizedMonth = statementsNormalizeMonthKey(monthKey) || statementsDateToMonthKey(new Date());
    const range = statementsGetMonthRange(normalizedMonth);
    if (!range) return null;

    const allTransactions = window.allDecryptedTransactions || [];
    const monthTransactions = statementsGetTransactionsForMonth(normalizedMonth, allTransactions);
    const debtNames = new Set((window.allDecryptedDebts || []).map(d => String(d?.name || '').trim()).filter(Boolean));

    // COGS categories: expenses directly tied to earning income
    const cogsKeywords = ['transport', 'commute', 'tools', 'work', 'equipment', 'office', 'uniform', 'professional', 'license', 'certification', 'internet'];

    let income = 0;
    let debtIncreases = 0;
    let costOfEarning = 0; // COGS equivalent
    let operatingExpenses = 0;
    let debtService = 0;
    let savingsContribution = 0;

    monthTransactions.forEach(tx => {
        const amount = Number(tx?.amt || 0);
        if (!Number.isFinite(amount) || amount <= 0) return;
        const category = String(tx?.category || '').trim();
        const categoryLower = category.toLowerCase();

        if (tx.type === 'income') {
            income += amount;
            return;
        }

        if (tx.type === 'debt_increase') {
            debtIncreases += amount;
            return;
        }

        if (tx.type !== 'expense') return;

        if (debtNames.has(category)) {
            debtService += amount;
            return;
        }

        if (categoryLower === 'savings') {
            savingsContribution += amount;
            return;
        }

        // Classify as COGS if category matches work-related keywords
        const isCOGS = cogsKeywords.some(kw => categoryLower.includes(kw));
        if (isCOGS) {
            costOfEarning += amount;
        } else {
            operatingExpenses += amount;
        }
    });

    const cryptoPosition = await statementsComputeCryptoPositionAsOf(range.endTs, normalizedMonth);
    const growthSpend = savingsContribution + cryptoPosition.buyOutflowInMonth;

    // Business-framed P&L
    const grossProfit = income - costOfEarning;
    const ebitda = grossProfit - operatingExpenses;
    const netIncome = ebitda - debtService - growthSpend;

    // Margin percentages
    const grossMargin = income > 0 ? (grossProfit / income) * 100 : 0;
    const ebitdaMargin = income > 0 ? (ebitda / income) * 100 : 0;
    const netMargin = income > 0 ? (netIncome / income) * 100 : 0;

    const operatingCashFlow = income - costOfEarning - operatingExpenses;
    const investingCashFlow = -(savingsContribution + cryptoPosition.buyOutflowInMonth) + cryptoPosition.sellInflowInMonth;
    const financingCashFlow = debtIncreases - debtService;
    const freeCashFlow = operatingCashFlow + investingCashFlow;
    const netCashFlow = operatingCashFlow + investingCashFlow + financingCashFlow;

    const cashFromTransactions = statementsComputeCashBalanceAsOf(range.endTs, allTransactions);
    const cash = cashFromTransactions - cryptoPosition.buyOutflowToDate + cryptoPosition.sellInflowToDate;
    const receivables = statementsComputeReceivablesAsOf(range.endTs, allTransactions);
    const debt = statementsComputeDebtOutstandingAsOf(range.endTs, allTransactions);
    const crypto = cryptoPosition.bookValue;
    const totalAssets = cash + receivables + crypto;
    const totalLiabilities = debt;
    const netWorth = totalAssets - totalLiabilities;

    return {
        month: normalizedMonth,
        pnl: {
            income,
            costOfEarning,
            grossProfit,
            grossMargin,
            operatingExpenses,
            ebitda,
            ebitdaMargin,
            debtService,
            growthSpend,
            netIncome,
            netMargin
        },
        cashflow: {
            operatingCashFlow,
            investingCashFlow,
            financingCashFlow,
            freeCashFlow,
            netCashFlow
        },
        balanceSheet: {
            cash,
            receivables,
            crypto,
            debt,
            totalAssets,
            totalLiabilities,
            netWorth
        },
        createdAt: new Date().toISOString(),
        lastModified: Date.now()
    };
}

function statementsDescriptorKeyForLabel(label) {
    const normalized = String(label || '')
        .toLowerCase()
        .replace(/\([^)]*\)/g, '')
        .replace(/\s+/g, ' ')
        .trim();

    const map = {
        'revenue': 'revenue',
        'cost of earning': 'cost of earning',
        'gross profit': 'gross profit',
        'operating expenses': 'operating expenses',
        'ebitda': 'ebitda',
        'debt service': 'debt service',
        'growth/investment': 'growth investment',
        'net income': 'net income',
        'operating cf': 'operating cash flow',
        'investing cf': 'investing cash flow',
        'financing cf': 'financing cash flow',
        'free cash flow': 'free cash flow',
        'net cash flow': 'net cash flow',
        'cash': 'balance sheet',
        'receivables': 'receivables',
        'crypto': 'balance sheet',
        'debt': 'debt service',
        'total assets': 'total assets',
        'total liabilities': 'total liabilities',
        'net worth': 'estimated net worth'
    };

    for (const [needle, descriptorKey] of Object.entries(map)) {
        if (normalized === needle || normalized.startsWith(`${needle} `)) {
            return descriptorKey;
        }
    }

    return '';
}

function statementsMetricRow(label, value, valueClass = 'text-slate-700') {
    const descriptorKey = statementsDescriptorKeyForLabel(label);
    const descriptorAttr = descriptorKey ? ` data-descriptor-key="${escapeHTML(descriptorKey)}"` : '';
    return `
                <div class="flex items-center justify-between gap-2"${descriptorAttr}>
                    <span class="text-slate-500" data-descriptor-icon-host="true">${escapeHTML(label)}</span>
                    <span class="font-bold ${valueClass}">${escapeHTML(value)}</span>
                </div>
            `;
}

function renderStatementPanels(statement, source = 'live') {
    const pnlEl = document.getElementById('st-pnl');
    const cfEl = document.getElementById('st-cf');
    const bsEl = document.getElementById('st-bs');
    const statusEl = document.getElementById('st-status');
    if (!pnlEl || !cfEl || !bsEl || !statusEl || !statement) return;

    const pnl = statement.pnl || {};
    const cashflow = statement.cashflow || {};
    const balanceSheet = statement.balanceSheet || {};
    const closeStatus = statementsGetCloseStatus(statement.month);

    const netIncomeClass = Number(pnl.netIncome || 0) >= 0 ? 'text-emerald-600' : 'text-rose-600';
    const netCashFlowClass = Number(cashflow.netCashFlow || 0) >= 0 ? 'text-emerald-600' : 'text-rose-600';
    const netWorthClass = Number(balanceSheet.netWorth || 0) >= 0 ? 'text-emerald-600' : 'text-rose-600';

    // Enhanced P&L with business framing
    const grossProfitClass = Number(pnl.grossProfit || 0) >= 0 ? 'text-emerald-600' : 'text-rose-600';
    const ebitdaClass = Number(pnl.ebitda || 0) >= 0 ? 'text-emerald-600' : 'text-rose-600';
    const fmtMargin = (val) => Number.isFinite(val) ? `${val.toFixed(0)}%` : '';
    const hasCOGS = Number(pnl.costOfEarning || 0) > 0;

    const pnlRows = [
        statementsMetricRow('Revenue', fmt(Number(pnl.income || 0)), 'text-emerald-700 font-black'),
    ];

    if (hasCOGS) {
        pnlRows.push(
            statementsMetricRow('Cost of Earning', fmt(Number(pnl.costOfEarning || 0)), 'text-slate-600'),
            '<div class="border-t border-slate-100 my-1"></div>',
            statementsMetricRow(`Gross Profit (${fmtMargin(pnl.grossMargin)})`, fmt(Number(pnl.grossProfit || 0)), grossProfitClass),
        );
    }

    pnlRows.push(
        statementsMetricRow('Operating Expenses', fmt(Number(pnl.operatingExpenses || 0))),
        '<div class="border-t border-slate-100 my-1"></div>',
        statementsMetricRow(`EBITDA (${fmtMargin(pnl.ebitdaMargin)})`, fmt(Number(pnl.ebitda || 0)), ebitdaClass),
        statementsMetricRow('Debt Service', fmt(Number(pnl.debtService || 0))),
        statementsMetricRow('Growth/Investment', fmt(Number(pnl.growthSpend || 0))),
        '<div class="border-t border-slate-200 my-1.5"></div>',
        statementsMetricRow(`Net Income (${fmtMargin(pnl.netMargin)})`, fmt(Number(pnl.netIncome || 0)), netIncomeClass + ' font-black'),
    );

    pnlEl.innerHTML = pnlRows.join('');

    cfEl.innerHTML = [
        statementsMetricRow('Operating CF', fmt(Number(cashflow.operatingCashFlow || 0))),
        statementsMetricRow('Investing CF', fmt(Number(cashflow.investingCashFlow || 0))),
        statementsMetricRow('Financing CF', fmt(Number(cashflow.financingCashFlow || 0))),
        statementsMetricRow('Free Cash Flow', fmt(Number(cashflow.freeCashFlow || 0))),
        '<div class="border-t border-slate-100 my-1"></div>',
        statementsMetricRow('Net Cash Flow', fmt(Number(cashflow.netCashFlow || 0)), netCashFlowClass)
    ].join('');

    bsEl.innerHTML = [
        statementsMetricRow('Cash', fmt(Number(balanceSheet.cash || 0))),
        statementsMetricRow('Receivables', fmt(Number(balanceSheet.receivables || 0))),
        statementsMetricRow('Crypto (Book)', fmt(Number(balanceSheet.crypto || 0))),
        statementsMetricRow('Debt', fmt(Number(balanceSheet.debt || 0))),
        '<div class="border-t border-slate-100 my-1"></div>',
        statementsMetricRow('Total Assets', fmt(Number(balanceSheet.totalAssets || 0))),
        statementsMetricRow('Total Liabilities', fmt(Number(balanceSheet.totalLiabilities || 0))),
        statementsMetricRow('Net Worth', fmt(Number(balanceSheet.netWorth || 0)), netWorthClass)
    ].join('');

    const sourceLabel = source === 'snapshot' ? 'Snapshot' : 'Live';
    const closeLabel = closeStatus === 'closed' ? 'Closed period' : 'Open period';
    statusEl.textContent = `${statementsGetMonthLabel(statement.month)} • ${closeLabel} • ${sourceLabel}`;
}

function getStatementSnapshotById(snapshotId) {
    const list = Array.isArray(statementSnapshots) ? statementSnapshots : [];
    return list.find(item => String(item?.id || '') === String(snapshotId || '')) || null;
}

function getStatementSnapshotByMonth(monthKey) {
    const list = (Array.isArray(statementSnapshots) ? statementSnapshots : [])
        .filter(item => item?.month === monthKey)
        .sort((a, b) => Number(b?.lastModified || 0) - Number(a?.lastModified || 0));
    return list[0] || null;
}

function renderStatementsHistory() {
    const historyEl = document.getElementById('st-history-list');
    if (!historyEl) return;

    const snapshots = (Array.isArray(statementSnapshots) ? statementSnapshots : [])
        .slice()
        .sort((a, b) => (b?.month || '').localeCompare(a?.month || ''));

    if (!snapshots.length) {
        historyEl.innerHTML = '<p>No statement snapshots yet.</p>';
        return;
    }

    historyEl.innerHTML = snapshots.slice(0, 18).map(snapshot => {
        const encodedId = encodeInlineArg(snapshot.id);
        const closeStatus = statementsGetCloseStatus(snapshot.month);
        const closeStatusClass = closeStatus === 'closed'
            ? 'bg-emerald-100 text-emerald-700'
            : 'bg-amber-100 text-amber-700';

        return `
                    <div class="p-2.5 bg-white border border-slate-200 rounded-lg">
                        <div class="flex items-center justify-between gap-2">
                            <p class="font-bold text-slate-700">${escapeHTML(statementsGetMonthLabel(snapshot.month))}</p>
                            <div class="flex items-center gap-2">
                                <button onclick="viewStatementSnapshotById(decodeURIComponent('${encodedId}'))"
                                    class="text-[10px] font-bold text-indigo-600 bg-indigo-50 border border-indigo-200 rounded-full px-2.5 py-1 hover:bg-indigo-100">
                                    View
                                </button>
                                <button onclick="exportStatementSnapshotPDFById(decodeURIComponent('${encodedId}'))"
                                    class="text-[10px] font-bold text-slate-700 bg-slate-100 border border-slate-200 rounded-full px-2.5 py-1 hover:bg-slate-200">
                                    Export PDF
                                </button>
                                <span class="text-[10px] font-black uppercase tracking-wide px-2 py-1 rounded-full ${closeStatusClass}">
                                    ${closeStatus === 'closed' ? 'Closed' : 'Open'}
                                </span>
                            </div>
                        </div>
                        <p class="text-[11px] text-slate-500 mt-1">
                            Net income ${fmt(Number(snapshot?.pnl?.netIncome || 0))} • Net worth ${fmt(Number(snapshot?.balanceSheet?.netWorth || 0))}
                        </p>
                    </div>
                `;
    }).join('');
}

function viewStatementSnapshotById(snapshotId) {
    const snapshot = getStatementSnapshotById(snapshotId);
    if (!snapshot) {
        showToast('❌ Snapshot not found');
        return;
    }

    const monthInput = document.getElementById('st-month');
    if (monthInput) monthInput.value = snapshot.month;
    statementsRefreshSeq += 1;
    renderStatementPanels(snapshot, 'snapshot');
    refreshStatementsTrendChart(snapshot.month);
}

async function exportStatementSnapshotPDFById(snapshotId) {
    const snapshot = getStatementSnapshotById(snapshotId);
    if (!snapshot) {
        showToast('❌ Snapshot not found');
        return;
    }
    await exportStatementToPDF(snapshot, 'Snapshot');
}

async function exportCurrentStatementPDF() {
    const monthKey = statementsGetSelectedMonthKeyFromInput();
    const { statement, source } = await resolveStatementForMonth(monthKey, { preferSnapshotForClosed: true });
    if (!statement) {
        showToast('❌ Statement data unavailable');
        return;
    }
    await exportStatementToPDF(statement, source === 'snapshot' ? 'Snapshot' : 'Live');
}

async function exportStatementToPDF(statement, sourceLabel = 'Live') {
    if (!statement || !statement.month) {
        showToast('❌ Statement data unavailable');
        return;
    }

    if (!window.jspdf || !window.jspdf.jsPDF) {
        alert('PDF library is not available.');
        return;
    }

    try {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();

        doc.setFontSize(18);
        doc.text('FinanceFlow Financial Statement', 14, 16);
        doc.setFontSize(10);
        doc.text(`Month: ${statementsGetMonthLabel(statement.month)} (${statement.month})`, 14, 23);
        doc.text(`Close Status: ${statementsGetCloseStatus(statement.month) === 'closed' ? 'Closed' : 'Open'}`, 14, 28);
        doc.text(`Source: ${sourceLabel}`, 14, 33);

        const pnlRows = [
            ['Revenue', fmt(Number(statement?.pnl?.income || 0))],
            ['Cost of Earning', fmt(Number(statement?.pnl?.costOfEarning || 0))],
            ['Gross Profit', fmt(Number(statement?.pnl?.grossProfit || 0))],
            ['Operating Expenses', fmt(Number(statement?.pnl?.operatingExpenses || 0))],
            ['EBITDA', fmt(Number(statement?.pnl?.ebitda || 0))],
            ['Debt Service', fmt(Number(statement?.pnl?.debtService || 0))],
            ['Growth/Investment', fmt(Number(statement?.pnl?.growthSpend || 0))],
            ['Net Income', fmt(Number(statement?.pnl?.netIncome || 0))]
        ];

        const cashFlowRows = [
            ['Operating CF', fmt(Number(statement?.cashflow?.operatingCashFlow || 0))],
            ['Investing CF', fmt(Number(statement?.cashflow?.investingCashFlow || 0))],
            ['Financing CF', fmt(Number(statement?.cashflow?.financingCashFlow || 0))],
            ['Free Cash Flow', fmt(Number(statement?.cashflow?.freeCashFlow || 0))],
            ['Net Cash Flow', fmt(Number(statement?.cashflow?.netCashFlow || 0))]
        ];

        const balanceSheetRows = [
            ['Cash', fmt(Number(statement?.balanceSheet?.cash || 0))],
            ['Receivables', fmt(Number(statement?.balanceSheet?.receivables || 0))],
            ['Crypto (Book)', fmt(Number(statement?.balanceSheet?.crypto || 0))],
            ['Debt', fmt(Number(statement?.balanceSheet?.debt || 0))],
            ['Total Assets', fmt(Number(statement?.balanceSheet?.totalAssets || 0))],
            ['Total Liabilities', fmt(Number(statement?.balanceSheet?.totalLiabilities || 0))],
            ['Net Worth', fmt(Number(statement?.balanceSheet?.netWorth || 0))]
        ];

        doc.autoTable({
            startY: 38,
            head: [['P&L', 'Value']],
            body: pnlRows,
            theme: 'grid',
            headStyles: { fillColor: [79, 70, 229] },
            styles: { fontSize: 9 }
        });

        doc.autoTable({
            startY: doc.lastAutoTable.finalY + 6,
            head: [['Cash Flow', 'Value']],
            body: cashFlowRows,
            theme: 'grid',
            headStyles: { fillColor: [8, 145, 178] },
            styles: { fontSize: 9 }
        });

        doc.autoTable({
            startY: doc.lastAutoTable.finalY + 6,
            head: [['Balance Sheet', 'Value']],
            body: balanceSheetRows,
            theme: 'grid',
            headStyles: { fillColor: [16, 185, 129] },
            styles: { fontSize: 9 }
        });

        doc.save(`FinanceFlow_Statement_${statement.month}.pdf`);
        showToast('✅ Statement PDF exported');
    } catch (error) {
        console.error('Statement PDF export failed:', error);
        showToast('❌ Could not export statement PDF');
    }
}

async function renderStatementForSelectedMonth(persistSnapshot = false) {
    if (persistSnapshot) {
        return generateMonthlyStatementSnapshot();
    }

    const statusEl = document.getElementById('st-status');
    if (statusEl) statusEl.textContent = 'Loading statement...';

    try {
        const monthKey = statementsGetSelectedMonthKeyFromInput();
        const { statement, source } = await resolveStatementForMonth(monthKey, { preferSnapshotForClosed: true });
        if (!statement) {
            if (statusEl) statusEl.textContent = 'No statement data.';
            return null;
        }

        renderStatementPanels(statement, source === 'snapshot' ? 'snapshot' : 'live');
        renderStatementsHistory();
        await refreshStatementsTrendChart(monthKey);
        if (typeof refreshOperationsReviewModuleUI === 'function') {
            refreshOperationsReviewModuleUI();
        }
        return statement;
    } catch (error) {
        console.error('Statement render failed:', error);
        if (statusEl) statusEl.textContent = 'Could not render statement.';
        showToast('❌ Failed to render statement');
        return null;
    }
}

async function persistStatementSnapshot(snapshot) {
    const db = await getDB();
    db.statement_snapshots = Array.isArray(db.statement_snapshots) ? db.statement_snapshots : [];

    const existingIdx = db.statement_snapshots.findIndex(item => item?.month === snapshot.month);
    if (existingIdx >= 0) {
        const existing = db.statement_snapshots[existingIdx];
        db.statement_snapshots[existingIdx] = {
            ...snapshot,
            id: existing?.id || snapshot.id,
            createdAt: existing?.createdAt || snapshot.createdAt,
            lastModified: Date.now()
        };
    } else {
        db.statement_snapshots.unshift(snapshot);
    }

    db.statement_snapshots = db.statement_snapshots.slice(0, 60);

    const persisted = await saveDB(db);
    statementSnapshots = persisted.statement_snapshots || db.statement_snapshots;
    return getStatementSnapshotByMonth(snapshot.month) || snapshot;
}

async function generateMonthlyStatementSnapshot() {
    const statusEl = document.getElementById('st-status');
    if (statusEl) statusEl.textContent = 'Generating snapshot...';

    try {
        const monthKey = statementsGetSelectedMonthKeyFromInput();
        const statement = await computeStatementForMonth(monthKey);
        if (!statement) {
            if (statusEl) statusEl.textContent = 'Snapshot failed.';
            return null;
        }

        const existing = getStatementSnapshotByMonth(monthKey);
        const rawSnapshot = {
            id: existing?.id || `statement_${monthKey.replace('-', '')}`,
            month: monthKey,
            pnl: {
                income: Number(statement?.pnl?.income || 0),
                costOfEarning: Number(statement?.pnl?.costOfEarning || 0),
                grossProfit: Number(statement?.pnl?.grossProfit || 0),
                grossMargin: Number(statement?.pnl?.grossMargin || 0),
                operatingExpenses: Number(statement?.pnl?.operatingExpenses || 0),
                ebitda: Number(statement?.pnl?.ebitda || 0),
                ebitdaMargin: Number(statement?.pnl?.ebitdaMargin || 0),
                debtService: Number(statement?.pnl?.debtService || 0),
                growthSpend: Number(statement?.pnl?.growthSpend || 0),
                netIncome: Number(statement?.pnl?.netIncome || 0),
                netMargin: Number(statement?.pnl?.netMargin || 0)
            },
            cashflow: {
                operatingCashFlow: Number(statement?.cashflow?.operatingCashFlow || 0),
                investingCashFlow: Number(statement?.cashflow?.investingCashFlow || 0),
                financingCashFlow: Number(statement?.cashflow?.financingCashFlow || 0),
                freeCashFlow: Number(statement?.cashflow?.freeCashFlow || 0),
                netCashFlow: Number(statement?.cashflow?.netCashFlow || 0)
            },
            balanceSheet: {
                cash: Number(statement?.balanceSheet?.cash || 0),
                receivables: Number(statement?.balanceSheet?.receivables || 0),
                crypto: Number(statement?.balanceSheet?.crypto || 0),
                debt: Number(statement?.balanceSheet?.debt || 0),
                totalAssets: Number(statement?.balanceSheet?.totalAssets || 0),
                totalLiabilities: Number(statement?.balanceSheet?.totalLiabilities || 0),
                netWorth: Number(statement?.balanceSheet?.netWorth || 0)
            },
            createdAt: existing?.createdAt || new Date().toISOString(),
            lastModified: Date.now()
        };

        const normalizedSnapshot = statementsNormalizeSnapshotPayload(rawSnapshot);
        const snapshotToPersist = normalizedSnapshot || rawSnapshot;
        const persistedSnapshot = await persistStatementSnapshot(snapshotToPersist);

        renderStatementPanels(persistedSnapshot, 'snapshot');
        renderStatementsHistory();
        statementsTrendCache = { key: null, points: null };
        await refreshStatementsTrendChart(monthKey);
        if (typeof refreshOperationsReviewModuleUI === 'function') {
            refreshOperationsReviewModuleUI();
        }
        if (statusEl) {
            statusEl.textContent = `Snapshot saved ${new Date().toLocaleTimeString()}`;
        }
        showToast('✅ Statement snapshot saved');
        return persistedSnapshot;
    } catch (error) {
        console.error('Statement snapshot generation failed:', error);
        if (statusEl) statusEl.textContent = 'Snapshot failed.';
        showToast('❌ Could not save statement snapshot');
        return null;
    }
}

async function refreshStatementsModuleUI() {
    const statusEl = document.getElementById('st-status');
    const monthInput = document.getElementById('st-month');
    if (!statusEl || !monthInput) return;

    const seq = ++statementsRefreshSeq;
    const monthKey = statementsGetSelectedMonthKeyFromInput();
    monthInput.value = monthKey;

    try {
        const { statement, source } = await resolveStatementForMonth(monthKey, { preferSnapshotForClosed: true });
        if (seq !== statementsRefreshSeq) return;

        if (statement) {
            renderStatementPanels(statement, source === 'snapshot' ? 'snapshot' : 'live');
        } else {
            statusEl.textContent = 'No statement data.';
        }
        renderStatementsHistory();
        await refreshStatementsTrendChart(monthKey);
        if (typeof refreshOperationsReviewModuleUI === 'function') {
            refreshOperationsReviewModuleUI();
        }
    } catch (error) {
        console.error('Statements module refresh failed:', error);
        if (seq !== statementsRefreshSeq) return;
        statusEl.textContent = 'Statements unavailable.';
    }
}
