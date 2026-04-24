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
                tx._searchText = [
                    String(tx.desc || ''),
                    String(tx.category || ''),
                    String(tx.creditCardName || ''),
                    String(tx.paymentSource || '')
                ].join(' ').toLowerCase();
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

        function getTxPaymentSource(tx) {
            const raw = String(tx?.paymentSource || '').trim().toLowerCase();
            return raw === 'credit_card' ? 'credit_card' : 'cash';
        }

        function getTxCreditCardId(tx) {
            return String(tx?.creditCardId || '').trim();
        }

        function getTxCreditCardName(tx) {
            const explicit = String(tx?.creditCardName || '').trim();
            if (explicit) return explicit;
            const cardId = getTxCreditCardId(tx);
            const linkedCard = (window.allDecryptedCreditCards || []).find(card => card && card.id === cardId);
            return linkedCard ? String(linkedCard.name || '').trim() : '';
        }

        function isCreditCardCharge(tx) {
            return tx?.type === 'expense' && getTxPaymentSource(tx) === 'credit_card' && !!getTxCreditCardId(tx);
        }

        function isCreditCardPayment(tx) {
            return tx?.type === 'credit_card_payment' && !!getTxCreditCardId(tx);
        }

        function isDebtBorrowCashInTx(tx) {
            return tx?.debtBorrowTracked === true && (tx?.type === 'debt_increase' || tx?.type === 'income');
        }

        function isDebtBorrowLiabilityTx(tx) {
            return tx?.type === 'debt_increase' || isDebtBorrowCashInTx(tx);
        }

        function getDebtBorrowLiabilityDelta(tx, { includePrincipalSeed = false } = {}) {
            const amount = Math.max(0, Number(tx?.amt || 0));
            if (!Number.isFinite(amount) || amount <= 0) return 0;
            if (!isDebtBorrowLiabilityTx(tx)) return 0;
            if (!includePrincipalSeed && tx?.debtPrincipalSeed === true) return 0;
            return amount;
        }

        function getTxCashBalanceDelta(tx) {
            const amount = Math.max(0, Number(tx?.amt || 0));
            if (!Number.isFinite(amount) || amount <= 0) return 0;

            if (tx?.type === 'income') {
                return amount;
            }

            if (tx?.type === 'debt_increase') {
                return tx?.debtBorrowTracked === true ? amount : 0;
            }

            if (tx?.type === 'expense') {
                return isCreditCardCharge(tx) ? 0 : -amount;
            }

            if (isCreditCardPayment(tx)) {
                return -amount;
            }

            return 0;
        }

        function getTxReportedIncomeDelta(tx) {
            const amount = Math.max(0, Number(tx?.amt || 0));
            if (!Number.isFinite(amount) || amount <= 0) return 0;
            if (tx?.type !== 'income') return 0;
            return isDebtBorrowCashInTx(tx) ? 0 : amount;
        }

        function isExpenseLikeTx(tx) {
            return tx?.type === 'expense' || isCreditCardPayment(tx);
        }

        function getTxExpenseDelta(tx) {
            const amount = Math.max(0, Number(tx?.amt || 0));
            if (!Number.isFinite(amount) || amount <= 0) return 0;
            return isExpenseLikeTx(tx) ? amount : 0;
        }

        function getTxExpenseCategory(tx) {
            if (isCreditCardPayment(tx)) return 'Card Payments';
            return String(tx?.category || 'Others').trim() || 'Others';
        }

        function computeCreditCardOutstandingMapAsOf(endTs, transactions) {
            const cards = window.allDecryptedCreditCards || [];
            const outstanding = new Map();

            cards.forEach(card => {
                if (!card?.id) return;
                outstanding.set(card.id, Math.max(0, Number(card.openingBalance || 0)));
            });

            (transactions || []).forEach(tx => {
                const ts = getTxTimestamp(tx);
                const cardId = getTxCreditCardId(tx);
                if (!cardId || !Number.isFinite(ts) || ts > endTs || !outstanding.has(cardId)) return;

                const amount = Math.max(0, Number(tx?.amt || 0));
                if (!Number.isFinite(amount) || amount <= 0) return;

                if (isCreditCardCharge(tx)) {
                    outstanding.set(cardId, outstanding.get(cardId) + amount);
                    return;
                }

                if (isCreditCardPayment(tx)) {
                    outstanding.set(cardId, Math.max(0, outstanding.get(cardId) - amount));
                }
            });

            return outstanding;
        }

        function computeCreditCardOutstandingAsOf(endTs, transactions) {
            return Array.from(computeCreditCardOutstandingMapAsOf(endTs, transactions).values())
                .reduce((sum, amount) => sum + (Number(amount) || 0), 0);
        }

        function toTxMetaTimestamp(value) {
            const numeric = Number(value);
            if (Number.isFinite(numeric) && numeric > 0) return numeric;

            if (typeof value === 'string' && value.trim()) {
                const parsed = Date.parse(value);
                if (Number.isFinite(parsed)) return parsed;
            }

            return 0;
        }

        function getLocalDateKey(date = new Date()) {
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        }

        function getTxAssignedDateKey(tx) {
            const cached = hydrateTransactionCache(tx);
            if (cached && typeof cached._dateKey === 'string' && cached._dateKey) {
                return cached._dateKey;
            }

            const rawDate = String(tx?.date || '').trim();
            const matchedDate = rawDate.match(/^\d{4}-\d{2}-\d{2}/);
            const dateKey = matchedDate
                ? matchedDate[0]
                : getLocalDateKey(new Date(getTxTimestamp(tx)));

            if (cached) {
                cached._dateKey = dateKey;
            }

            return dateKey;
        }

        function getTxActivityTimestamp(tx) {
            const cached = hydrateTransactionCache(tx);
            if (cached && Number.isFinite(cached._activityTs)) {
                return cached._activityTs;
            }

            const activityTs = Math.max(
                toTxMetaTimestamp(tx?.createdAt),
                toTxMetaTimestamp(tx?.lastModified),
                getTxTimestamp(tx)
            );

            if (cached) {
                cached._activityTs = activityTs;
            }

            return activityTs;
        }

        function compareRecentMovementTransactions(a, b) {
            const dateKeyDiff = getTxAssignedDateKey(b).localeCompare(getTxAssignedDateKey(a));
            if (dateKeyDiff !== 0) return dateKeyDiff;

            const activityDiff = getTxActivityTimestamp(b) - getTxActivityTimestamp(a);
            if (activityDiff !== 0) return activityDiff;

            const txDiff = getTxTimestamp(b) - getTxTimestamp(a);
            if (txDiff !== 0) return txDiff;

            return String(b?.id || '').localeCompare(String(a?.id || ''));
        }

        function sortRecentMovementTransactions(transactions) {
            return [...(transactions || [])].sort(compareRecentMovementTransactions);
        }

        function isTxAssignedToToday(tx, referenceDate = new Date()) {
            return getTxAssignedDateKey(tx) === getLocalDateKey(referenceDate);
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
                    income += getTxReportedIncomeDelta(t);
                    balance += getTxCashBalanceDelta(t);
                    return;
                }

                if (t.type === 'debt_increase') {
                    balance += getTxCashBalanceDelta(t);
                    return;
                }

                if (t.type === 'expense') {
                    expense += getTxExpenseDelta(t);
                    balance += getTxCashBalanceDelta(t);
                    const expenseCategory = getTxExpenseCategory(t);
                    categoryExpenses[expenseCategory] = (categoryExpenses[expenseCategory] || 0) + getTxExpenseDelta(t);
                    return;
                }

                if (isCreditCardPayment(t)) {
                    expense += getTxExpenseDelta(t);
                    balance += getTxCashBalanceDelta(t);
                    const expenseCategory = getTxExpenseCategory(t);
                    categoryExpenses[expenseCategory] = (categoryExpenses[expenseCategory] || 0) + getTxExpenseDelta(t);
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
            if (typeof syncToolbarControls === 'function') {
                syncToolbarControls();
            }
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
