        // =============================================
        // SECTION 10: METRICS & SCOPING
        // =============================================
        let latestSummaryMetrics = null;

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

            const dateSource = tx.date instanceof Date
                ? (Number.isFinite(tx.date.getTime()) ? tx.date.toISOString() : 'invalid-date')
                : String(tx.date ?? '').trim();
            if (tx._dateQualitySource !== dateSource) {
                const quality = typeof getFinanceTransactionDateQuality === 'function'
                    ? getFinanceTransactionDateQuality(tx)
                    : null;
                const parsedTs = quality?.usable ? quality.timestamp : Date.parse(dateSource);
                const usable = quality ? quality.usable : Number.isFinite(parsedTs);
                const fallbackDateKey = usable
                    ? new Date(parsedTs).toISOString().slice(0, 10)
                    : '';
                const dateKey = quality?.dateKey || fallbackDateKey;

                tx._dateQualitySource = dateSource;
                tx._dateQualityStatus = quality?.status || (usable ? 'valid' : 'quarantined');
                tx._dateKey = dateKey;
                tx._ts = usable && Number.isFinite(parsedTs) ? parsedTs : null;
                tx._year = dateKey ? Number(dateKey.slice(0, 4)) : 0;
                tx._month = dateKey ? Number(dateKey.slice(5, 7)) : 0;
                tx._activityTs = null;
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
            return cached && Number.isFinite(cached._ts) ? cached._ts : NaN;
        }

        function getTxYear(tx) {
            const cached = hydrateTransactionCache(tx);
            return cached && Number.isInteger(cached._year) ? cached._year : 0;
        }

        function getTxMonth(tx) {
            const cached = hydrateTransactionCache(tx);
            return cached && Number.isInteger(cached._month) ? cached._month : 0;
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

        function isInstallmentPayment(tx) {
            return tx?.type === 'installment_payment' && !!String(tx?.installmentPlanId || '').trim();
        }

        function isDebtBorrowCashInTx(tx) {
            return tx?.debtBorrowTracked === true && (tx?.type === 'debt_increase' || tx?.type === 'income');
        }

        function isNonIncomeCashInTx(tx) {
            return tx?.type === 'non_income_cash_in' || tx?.type === 'crypto_sell_proceeds';
        }

        function getTxNonIncomeCashInDelta(tx) {
            const amount = Math.max(0, Number(tx?.amt || 0));
            if (!Number.isFinite(amount) || amount <= 0) return 0;
            if (isNonIncomeCashInTx(tx)) return amount;
            if (tx?.type === 'income' && String(tx?.category || '').trim().startsWith('Lent: ')) return amount;
            if (tx?.type === 'debt_increase' && tx?.debtBorrowTracked === true) return amount;
            return 0;
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

            if (isNonIncomeCashInTx(tx)) {
                return amount;
            }

            if (tx?.type === 'expense') {
                return isCreditCardCharge(tx) ? 0 : -amount;
            }

            if (isCreditCardPayment(tx) || isInstallmentPayment(tx)) {
                return -amount;
            }

            return 0;
        }

        function getTxReportedIncomeDelta(tx) {
            const amount = Math.max(0, Number(tx?.amt || 0));
            if (!Number.isFinite(amount) || amount <= 0) return 0;
            if (tx?.type !== 'income') return 0;
            if (String(tx?.category || '').trim().startsWith('Lent: ')) return 0;
            return isDebtBorrowCashInTx(tx) ? 0 : amount;
        }

        function isExpenseLikeTx(tx) {
            return tx?.type === 'expense' || isCreditCardPayment(tx) || isInstallmentPayment(tx);
        }

        function getTxExpenseDelta(tx) {
            const amount = Math.max(0, Number(tx?.amt || 0));
            if (!Number.isFinite(amount) || amount <= 0) return 0;
            return isExpenseLikeTx(tx) ? amount : 0;
        }

        function getTxExpenseCategory(tx) {
            if (isCreditCardPayment(tx)) return 'Card Payments';
            if (isInstallmentPayment(tx)) return 'BNPL Payments';
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

        function computeInstallmentOutstandingMapAsOf(endTs, transactions) {
            const plans = window.allDecryptedInstallmentPlans || [];
            const outstanding = new Map();

            plans.forEach(plan => {
                if (!plan?.id) return;
                const startTs = Date.parse(plan.startDate || plan.createdAt || new Date().toISOString());
                if (Number.isFinite(startTs) && startTs > endTs) return;
                const priorPayments = (Array.isArray(plan.historicalPayments) ? plan.historicalPayments : [])
                    .reduce((sum, payment) => {
                        const paymentTs = Date.parse(payment?.date || payment?.createdAt || '');
                        if (!Number.isFinite(paymentTs) || paymentTs > endTs) return sum;
                        return sum + Math.max(0, Number(payment?.amount || 0));
                    }, 0);
                outstanding.set(plan.id, Math.max(0, Number(plan.totalAmount || 0) - priorPayments));
            });

            (transactions || []).forEach(tx => {
                if (!isInstallmentPayment(tx)) return;
                const ts = getTxTimestamp(tx);
                const planId = String(tx.installmentPlanId || '').trim();
                if (!planId || !Number.isFinite(ts) || ts > endTs || !outstanding.has(planId)) return;

                const amount = Math.max(0, Number(tx?.amt || 0));
                if (!Number.isFinite(amount) || amount <= 0) return;
                outstanding.set(planId, Math.max(0, outstanding.get(planId) - amount));
            });

            return outstanding;
        }

        function computeInstallmentOutstandingAsOf(endTs, transactions) {
            return Array.from(computeInstallmentOutstandingMapAsOf(endTs, transactions).values())
                .reduce((sum, amount) => sum + (Number(amount) || 0), 0);
        }

        function computeInstallmentFeesPaidAsOf(endTs, transactions) {
            const planById = new Map((window.allDecryptedInstallmentPlans || [])
                .filter(plan => plan && plan.id)
                .map(plan => [plan.id, plan]));

            let feePaid = 0;
            planById.forEach(plan => {
                (Array.isArray(plan.historicalPayments) ? plan.historicalPayments : []).forEach(payment => {
                    const paymentTs = Date.parse(payment?.date || payment?.createdAt || '');
                    if (!Number.isFinite(paymentTs) || paymentTs > endTs) return;
                    feePaid += Math.max(0, Number(payment?.feeAmount || 0));
                });
            });

            (transactions || []).forEach(tx => {
                if (!isInstallmentPayment(tx)) return;
                const ts = getTxTimestamp(tx);
                if (!Number.isFinite(ts) || ts > endTs) return;
                feePaid += Math.max(0, Number(tx?.installmentFeeAmount || 0));
            });

            return feePaid;
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
            return cached && typeof cached._dateKey === 'string' ? cached._dateKey : '';
        }

        function getTxActivityTimestamp(tx) {
            const cached = hydrateTransactionCache(tx);
            if (cached && Number.isFinite(cached._activityTs)) {
                return cached._activityTs;
            }

            const assignedTs = getTxTimestamp(tx);
            const activityTs = Math.max(
                toTxMetaTimestamp(tx?.createdAt),
                toTxMetaTimestamp(tx?.lastModified),
                Number.isFinite(assignedTs) ? assignedTs : 0
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

            const aTimestamp = getTxTimestamp(a);
            const bTimestamp = getTxTimestamp(b);
            const txDiff = (Number.isFinite(bTimestamp) ? bTimestamp : 0)
                - (Number.isFinite(aTimestamp) ? aTimestamp : 0);
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
            const onlyUsable = transactions => (Array.isArray(transactions) ? transactions : []).filter(tx => (
                typeof isFinanceTransactionDateUsable === 'function'
                    ? isFinanceTransactionDateUsable(tx)
                    : Number.isFinite(getTxTimestamp(tx))
            ));
            const allTx = onlyUsable(allTransactions || window.allDecryptedTransactions || []);
            if (scope === 'all_time') return allTx;
            if (scope === 'current_month') return getCurrentMonthTransactions(allTx);
            const selectedMonth = document.getElementById('filter-month')?.value || 'all';
            const selectedYear = document.getElementById('filter-year')?.value || 'all';
            return allTx.filter(transaction => {
                if (selectedYear !== 'all' && getTxYear(transaction) !== Number(selectedYear)) return false;
                if (selectedMonth !== 'all' && getTxMonth(transaction) !== Number(selectedMonth)) return false;
                return true;
            });
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
            const requestedTransactions = options.scopeTransactions || getTransactionsForScope(
                scope,
                allTransactions,
                options.filteredTransactions || window.filteredTransactions || []
            );
            const scopedTransactions = (Array.isArray(requestedTransactions) ? requestedTransactions : []).filter(tx => (
                typeof isFinanceTransactionDateUsable === 'function'
                    ? isFinanceTransactionDateUsable(tx)
                    : Number.isFinite(getTxTimestamp(tx))
            ));

            let income = 0;
            let expense = 0;
            let nonIncomeCashIn = 0;
            let balance = 0;
            const categoryExpenses = {};

            scopedTransactions.forEach(t => {
                if (t.type === 'income') {
                    income += getTxReportedIncomeDelta(t);
                    nonIncomeCashIn += getTxNonIncomeCashInDelta(t);
                    balance += getTxCashBalanceDelta(t);
                    return;
                }

                if (t.type === 'debt_increase') {
                    nonIncomeCashIn += getTxNonIncomeCashInDelta(t);
                    balance += getTxCashBalanceDelta(t);
                    return;
                }

                if (isNonIncomeCashInTx(t)) {
                    nonIncomeCashIn += getTxNonIncomeCashInDelta(t);
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

                if (isCreditCardPayment(t) || isInstallmentPayment(t)) {
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
                nonIncomeCashIn,
                balance,
                savingsRate,
                metricDayCount: days,
                avgDailySpend,
                categoryExpenses,
                transactionCount: scopedTransactions.length,
                scopedTransactions
            };
        }

        function renderSummaryCards(metrics) {
            latestSummaryMetrics = metrics;
            const setText = (id, value) => {
                const element = document.getElementById(id);
                if (element) element.innerText = value;
            };
            setText('balance-display', fmt(metrics.balance));
            setText('income-display', fmt(metrics.income));
            const nonIncomeCashInDisplay = document.getElementById('non-income-cash-in-display');
            if (nonIncomeCashInDisplay) {
                nonIncomeCashInDisplay.innerText = fmt(metrics.nonIncomeCashIn || 0);
            }
            setText('expense-display', fmt(metrics.expense));
            setText('savings-rate-display', typeof formatFinanceSavingsRate === 'function'
                ? formatFinanceSavingsRate(metrics.savingsRate)
                : (metrics.savingsRate != null && Number.isFinite(Number(metrics.savingsRate))
                    ? `${metrics.savingsRate}%`
                    : 'n/a'));
            setText('avg-daily-spend', `Avg ${fmt(metrics.avgDailySpend)}/day`);
            const nonIncomeCashInEl = document.getElementById('non-income-cash-in-detail');
            if (nonIncomeCashInEl) {
                nonIncomeCashInEl.innerText = Number(metrics.nonIncomeCashIn || 0) > 0
                    ? 'Cash added, not counted as earned income'
                    : 'No other cash in this scope';
            }

            const selectedLabel = getSelectedPeriodLabel();
            const scopeCaption = metrics.scope === 'selected_period'
                ? `Selected: ${selectedLabel}`
                : `${metrics.scopeLabel}`;
            setText('balance-trend', scopeCaption);
            if (typeof refreshFinanceOverview === 'function') {
                refreshFinanceOverview({ flowMetrics: metrics });
            }
        }

        function formatSignedBalanceAmount(amount) {
            const value = Number(amount) || 0;
            if (Math.abs(value) < 0.005) return fmt(0);
            return value > 0 ? `+${fmt(value)}` : `-${fmt(Math.abs(value))}`;
        }

        function getLatestBalanceCalculationMetrics() {
            if (latestSummaryMetrics) return latestSummaryMetrics;
            const allTx = window.allDecryptedTransactions || [];
            return computeSummaryMetrics(allTx, metricScope, {
                filteredTransactions: window.filteredTransactions || []
            });
        }

        function openBalanceCalculationModal(event) {
            if (event?.target?.closest?.('[data-scope-slider]')) return;

            const modal = document.getElementById('balance-calculation-modal');
            if (!modal) return;

            const metrics = getLatestBalanceCalculationMetrics();
            latestSummaryMetrics = metrics;

            const income = Number(metrics.income || 0);
            const nonIncomeCashIn = Number(metrics.nonIncomeCashIn || 0);
            const expense = Number(metrics.expense || 0);
            const balance = Number(metrics.balance || 0);
            const formulaBalance = income + nonIncomeCashIn - expense;
            const adjustment = balance - formulaBalance;
            const showAdjustment = Math.abs(adjustment) >= 0.005;

            const setText = (id, text) => {
                const el = document.getElementById(id);
                if (el) el.innerText = text;
            };

            setText('balance-calc-scope', metrics.scopeLabel || getMetricScopeLabel(metricScope));
            setText('balance-calc-income', fmt(income));
            setText('balance-calc-non-income', fmt(nonIncomeCashIn));
            setText('balance-calc-expenses', `-${fmt(expense)}`);
            setText('balance-calc-adjustment', formatSignedBalanceAmount(adjustment));
            setText('balance-calc-total', fmt(balance));
            const canonical = metrics.metricEngine === 'canonical';
            setText('balance-calc-note', showAdjustment
                ? (canonical
                    ? 'Earned Income plus Other Cash In minus Spending is reconciled to Net Cash Flow by settlements, transfers, lending, and asset activity.'
                    : 'Legacy Income plus Non-Income Cash In minus Legacy Expenses is reconciled to cash flow with timing adjustments.')
                : (canonical
                    ? 'Earned Income plus Other Cash In minus Spending equals Net Cash Flow for this scope.'
                    : 'Legacy Income plus Non-Income Cash In minus Legacy Expenses equals the scoped cash flow.'));

            const adjustmentRow = document.getElementById('balance-calc-adjustment-row');
            if (adjustmentRow) adjustmentRow.classList.toggle('hidden', !showAdjustment);

            modal.classList.remove('hidden');
            if (typeof lucide !== 'undefined') lucide.createIcons();
        }

        function closeBalanceCalculationModal() {
            document.getElementById('balance-calculation-modal')?.classList.add('hidden');
        }

        function handleBalanceCalculationTriggerKey(event) {
            if (!event || (event.key !== 'Enter' && event.key !== ' ')) return;
            event.preventDefault();
            openBalanceCalculationModal(event);
        }

        function initBalanceCalculationModalControls() {
            const trigger = document.querySelector('.finance-balance-breakdown-trigger');
            if (trigger && trigger.dataset.balanceCalcBound !== 'true') {
                trigger.dataset.balanceCalcBound = 'true';
                trigger.addEventListener('click', openBalanceCalculationModal);
                trigger.addEventListener('keydown', handleBalanceCalculationTriggerKey);
            }

            document.querySelectorAll('[data-balance-calc-close]').forEach(button => {
                if (button.dataset.balanceCalcCloseBound === 'true') return;
                button.dataset.balanceCalcCloseBound = 'true';
                button.addEventListener('click', closeBalanceCalculationModal);
            });

            const modal = document.getElementById('balance-calculation-modal');
            if (modal && modal.dataset.balanceCalcBackdropBound !== 'true') {
                modal.dataset.balanceCalcBackdropBound = 'true';
                modal.addEventListener('click', event => {
                    if (event.target === modal) closeBalanceCalculationModal();
                });
            }
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

        window.openBalanceCalculationModal = openBalanceCalculationModal;
        window.closeBalanceCalculationModal = closeBalanceCalculationModal;
        window.handleBalanceCalculationTriggerKey = handleBalanceCalculationTriggerKey;

        initBalanceCalculationModalControls();
