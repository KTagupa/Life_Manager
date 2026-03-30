        // =============================================
        // SECTION 7: CRUD OPERATIONS
        // =============================================
        let wishlistConvertId = null;
        const pendingBillPauseToggles = new Set();
        let electricityHistoryChart = null;
        const electricityHistoryModalState = {
            billId: '',
            bill: null,
            view: 'list'
        };

        function getUniqueCategoryList(items = []) {
            const seen = new Set();
            const result = [];
            items.forEach(item => {
                const name = String(item || '').trim();
                if (!name) return;
                const key = name.toLowerCase();
                if (seen.has(key)) return;
                seen.add(key);
                result.push(name);
            });
            return result;
        }

        function getDebtCategoryNames() {
            return getUniqueCategoryList((window.allDecryptedDebts || []).map(d => d?.name));
        }

        function getBudgetManagerCategories() {
            const budgetCategories = Object.keys(budgets || {});
            return getUniqueCategoryList([
                ...standardCategories,
                ...customCategories,
                ...budgetCategories,
                ...getDebtCategoryNames()
            ]);
        }

        function findCategoryByName(categoryName, includeLent = false) {
            const lentCategories = includeLent
                ? (window.allDecryptedLent || []).map(l => `Lent: ${l.name}`)
                : [];
            const target = String(categoryName || '').trim().toLowerCase();
            if (!target) return null;
            return getUniqueCategoryList([...getBudgetManagerCategories(), ...lentCategories])
                .find(name => name.toLowerCase() === target) || null;
        }

        async function persistCustomCategories() {
            const db = await getDB();
            db.custom_categories = customCategories;
            await saveDB(db);
        }

        function refreshTransactionCategorySelect(preferredValue = null) {
            const select = document.getElementById('t-category');
            if (!select) return;
            const fallback = select.value;
            populateCategorySelect(select);
            const target = preferredValue || fallback;
            if (target && Array.from(select.options).some(o => o.value === target)) {
                select.value = target;
            }
        }

        function getTrackedCreditCards() {
            return Array.isArray(window.allDecryptedCreditCards) ? window.allDecryptedCreditCards : [];
        }

        function findTrackedCreditCard(cardId) {
            return getTrackedCreditCards().find(card => card && card.id === cardId) || null;
        }

        function populateCreditCardSelect(selectEl, preferredValue = null) {
            if (!selectEl) return;

            const cards = getTrackedCreditCards();
            selectEl.innerHTML = cards.length
                ? cards.map(card => {
                    const name = escapeHTML(card.name || 'Credit Card');
                    const suffix = card.last4 ? ` •••• ${escapeHTML(card.last4)}` : '';
                    return `<option value="${escapeAttr(card.id)}">${name}${suffix}</option>`;
                }).join('')
                : '<option value="">No tracked cards yet</option>';

            if (!cards.length) {
                selectEl.disabled = true;
                return;
            }

            selectEl.disabled = false;
            const nextValue = preferredValue && cards.some(card => card.id === preferredValue)
                ? preferredValue
                : cards[0].id;
            selectEl.value = nextValue;
        }

        function refreshTransactionPaymentSourceUI() {
            const type = document.getElementById('t-type')?.value;
            const paymentWrap = document.getElementById('t-payment-source-wrap');
            const creditCardWrap = document.getElementById('t-credit-card-wrap');
            const paymentSourceInput = document.getElementById('t-payment-source');
            const payCashBtn = document.getElementById('btn-t-pay-cash');
            const payCreditBtn = document.getElementById('btn-t-pay-credit');

            if (!paymentWrap || !paymentSourceInput || !payCashBtn || !payCreditBtn) return;

            if (type !== 'expense') {
                paymentWrap.classList.add('hidden');
                paymentSourceInput.value = 'cash';
                if (creditCardWrap) creditCardWrap.classList.add('hidden');
                return;
            }

            paymentWrap.classList.remove('hidden');
            const source = paymentSourceInput.value === 'credit_card' ? 'credit_card' : 'cash';

            payCashBtn.className = source === 'cash'
                ? 'py-2 rounded-xl font-bold bg-white text-slate-700 shadow-sm'
                : 'py-2 rounded-xl font-bold text-slate-400';
            payCreditBtn.className = source === 'credit_card'
                ? 'py-2 rounded-xl font-bold bg-white text-amber-600 shadow-sm'
                : 'py-2 rounded-xl font-bold text-slate-400';

            if (creditCardWrap) {
                creditCardWrap.classList.toggle('hidden', source !== 'credit_card');
            }
        }

        function setTPaymentSource(source) {
            const paymentSourceInput = document.getElementById('t-payment-source');
            const creditCardSelect = document.getElementById('t-credit-card');
            if (!paymentSourceInput) return;

            let nextSource = source === 'credit_card' ? 'credit_card' : 'cash';
            if (nextSource === 'credit_card') {
                const cards = getTrackedCreditCards();
                if (!cards.length) {
                    nextSource = 'cash';
                    if (typeof showToast === 'function') {
                        showToast('ℹ️ Add a credit card first');
                    }
                } else if (creditCardSelect) {
                    populateCreditCardSelect(creditCardSelect, creditCardSelect.value || cards[0].id);
                }
            }

            paymentSourceInput.value = nextSource;
            refreshTransactionPaymentSourceUI();
        }

        async function addCategoryFromTransactionModal() {
            const input = document.getElementById('t-new-category');
            if (!input) return;

            const name = String(input.value || '').trim();
            if (!name) return;

            const existing = findCategoryByName(name, true);
            if (existing) {
                refreshTransactionCategorySelect(existing);
                input.value = '';
                showToast(`ℹ️ "${existing}" already exists`);
                return;
            }

            customCategories.push(name);
            await persistCustomCategories();
            refreshTransactionCategorySelect(name);
            input.value = '';

            const budgetModal = document.getElementById('budget-modal');
            if (budgetModal && !budgetModal.classList.contains('hidden')) {
                populateBudgetInputs();
            }

            showToast('✅ Category added');
        }

        function onTransactionCategoryInputKeyDown(event) {
            if (!event || event.key !== 'Enter') return;
            event.preventDefault();
            addCategoryFromTransactionModal();
        }

        function populateCategorySelect(selectEl) {
            if (!selectEl) return;
            selectEl.innerHTML = '';
            const existingValues = new Set();

            getBudgetManagerCategories().forEach(c => {
                const op = document.createElement('option');
                op.value = c;
                op.innerText = (c === 'Salary' || c === 'Savings') ? `💰 ${c}` : c;
                selectEl.appendChild(op);
                existingValues.add(c.toLowerCase());
            });

            if (window.allDecryptedLent && window.allDecryptedLent.length > 0) {
                const group = document.createElement('optgroup');
                group.label = "Money Lent (to others)";
                window.allDecryptedLent.forEach(l => {
                    const categoryName = `Lent: ${l.name}`;
                    if (existingValues.has(categoryName.toLowerCase())) return;
                    const op = document.createElement('option');
                    op.value = categoryName;
                    op.innerText = `🤝 ${categoryName}`;
                    group.appendChild(op);
                });
                if (group.children.length) {
                    selectEl.appendChild(group);
                }
            }
        }

        async function refreshLinkedPanels(options = {}) {
            const {
                refreshKPI = false,
                refreshMonthlyClose = false,
                refreshForecast = false,
                refreshStatements = false,
                refreshPlanning = false
            } = options;

            if (refreshKPI && typeof refreshBusinessKPIPanel === 'function') {
                await refreshBusinessKPIPanel();
            }
            if (refreshMonthlyClose && typeof refreshMonthlyCloseUI === 'function') {
                await refreshMonthlyCloseUI();
            }
            if (refreshForecast && typeof refreshForecastModuleUI === 'function') {
                await refreshForecastModuleUI();
            }
            if (refreshStatements && typeof refreshStatementsModuleUI === 'function') {
                await refreshStatementsModuleUI();
            }
            if (refreshPlanning && typeof renderGoalsAndSimulator === 'function') {
                renderGoalsAndSimulator();
            }
        }

        function openBudgetModal() {
            populateBudgetInputs();
            toggleModal('budget-modal');
        }

        function populateBudgetInputs() {
            const bDiv = document.getElementById('budget-inputs');
            const allCats = getBudgetManagerCategories();

            // Get spent amounts for the currently filtered month/year
            const m = document.getElementById('filter-month').value;
            const y = document.getElementById('filter-year').value;
            const now = new Date();
            const targetM = m === 'all' ? now.getMonth() + 1 : parseInt(m);
            const targetY = y === 'all' ? now.getFullYear() : parseInt(y);

            const spentMap = {};
            (window.allDecryptedTransactions || []).filter(t => {
                return t.type === 'expense' && getTxMonth(t) === targetM && getTxYear(t) === targetY;
            }).forEach(t => {
                spentMap[t.category] = (spentMap[t.category] || 0) + t.amt;
            });

            let totalBudget = 0;
            let totalSpent = 0;

            bDiv.innerHTML = allCats.map(c => {
                const limit = budgets[c] || 0;
                const spent = spentMap[c] || 0;
                const remaining = limit > 0 ? limit - spent : 0;
                const isOver = limit > 0 && spent > limit;
                const isCustom = customCategories.includes(c);
                const safeCategory = escapeHTML(c);
                const safeCategoryAttr = escapeAttr(c);
                const encodedCategory = encodeInlineArg(c);

                totalBudget += limit;
                totalSpent += spent;

                return `
                <div class="bg-slate-50 p-4 rounded-2xl border border-slate-200 transition-all hover:border-emerald-200">
                    <div class="flex items-center justify-between mb-3">
                        <div class="flex items-center gap-2">
                            <span class="w-2 h-2 rounded-full ${limit > 0 ? 'bg-emerald-500' : 'bg-slate-300'}"></span>
                            <label class="text-sm font-bold text-slate-700">${safeCategory}</label>
                            ${isCustom ? `
                                <div class="flex gap-1">
                                    <button onclick="editCustomCategory(decodeURIComponent('${encodedCategory}'))" 
                                        class="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors">
                                        <i data-lucide="edit-2" class="w-3 h-3"></i>
                                    </button>
                                    <button onclick="deleteCustomCategory(decodeURIComponent('${encodedCategory}'))" 
                                        class="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors">
                                        <i data-lucide="trash-2" class="w-3 h-3"></i>
                                    </button>
                                </div>
                            ` : ''}
                        </div>
                        <div class="text-right">
                           <span class="text-[10px] font-black uppercase text-slate-400 block mb-0.5">Budget Limit</span>
                           <input type="number" data-cat="${safeCategoryAttr}" value="${limit || ''}" oninput="updateBudgetSummaries()" 
                               placeholder="0" class="budget-input w-24 bg-white border border-slate-200 rounded-lg px-2 py-1 text-sm font-bold outline-none focus:border-emerald-500 text-right">
                        </div>
                    </div>
                    <div class="flex justify-between items-end">
                        <div class="space-y-1">
                            <p class="text-[10px] font-bold text-slate-400 uppercase">Spent this Month</p>
                            <p class="text-sm font-bold ${isOver ? 'text-rose-500' : 'text-slate-600'}">${fmt(spent)}</p>
                        </div>
                        <div class="text-right space-y-1">
                            <p class="text-[10px] font-bold text-slate-400 uppercase">Remaining</p>
                            <p class="text-sm font-bold ${remaining < 0 ? 'text-rose-500' : 'text-emerald-600'}">${fmt(remaining)}</p>
                        </div>
                    </div>
                </div>
            `;
            }).join('');

            updateBudgetSummaries();
            lucide.createIcons();
        }

        function updateBudgetSummaries() {
            const inputs = document.querySelectorAll('.budget-input');
            let totalBudget = 0;
            let totalSpent = 0;

            // Simple map of categories to their spent totals for current month
            const m = document.getElementById('filter-month').value;
            const y = document.getElementById('filter-year').value;
            const targetM = m === 'all' ? new Date().getMonth() + 1 : parseInt(m);
            const targetY = y === 'all' ? new Date().getFullYear() : parseInt(y);

            const spentMap = {};
            (window.allDecryptedTransactions || []).filter(t => {
                return t.type === 'expense' && getTxMonth(t) === targetM && getTxYear(t) === targetY;
            }).forEach(t => {
                spentMap[t.category] = (spentMap[t.category] || 0) + t.amt;
            });

            inputs.forEach(inp => {
                const cat = inp.dataset.cat;
                const limit = parseFloat(inp.value) || 0;
                const spent = spentMap[cat] || 0;
                totalBudget += limit;
                totalSpent += spent;
            });

            document.getElementById('total-budget-display').innerText = fmt(totalBudget);
            document.getElementById('total-spent-display').innerText = fmt(totalSpent);
            document.getElementById('total-remaining-display').innerText = fmt(Math.max(0, totalBudget - totalSpent));
        }

        async function addCustomCategory() {
            const el = document.getElementById('new-category-name');
            const name = el.value.trim();
            if (!name) return;
            if (findCategoryByName(name, true)) {
                alert("Category already exists.");
                return;
            }
            customCategories.push(name);
            el.value = '';
            await persistCustomCategories();
            populateBudgetInputs();
            refreshTransactionCategorySelect(name);
            showToast('✅ Category added');
        }

        async function editCustomCategory(oldName) {
            const newName = prompt(`Edit category name:`, oldName);
            if (!newName || newName.trim() === '' || newName === oldName) return;

            const trimmedName = newName.trim();

            // Check if new name already exists
            const existing = findCategoryByName(trimmedName, true);
            if (existing && existing.toLowerCase() !== oldName.toLowerCase()) {
                alert("A category with this name already exists.");
                return;
            }

            // Count affected items
            const transactions = window.allDecryptedTransactions || [];
            const affectedTxs = transactions.filter(t => t.category === oldName);
            const wishlistItems = window.allDecryptedWishlist || [];
            const affectedWishlist = wishlistItems.filter(w => w.category === oldName);
            const affectedReminders = (recurringTransactions || []).filter(r => r.category === oldName);
            const affectedRules = (categorizationRules || []).filter(r => r && r.category === oldName);
            const affectedGoals = (financialGoals || []).filter(g => g && g.linkedCategory === oldName);
            const hasBudget = budgets[oldName] > 0;

            let message = `This will rename "${oldName}" to "${trimmedName}".\n\n`;
            message += `Affected items:\n`;
            message += `- ${affectedTxs.length} transaction(s)\n`;
            message += `- ${affectedWishlist.length} wishlist item(s)\n`;
            message += `- ${affectedReminders.length} reminder(s)\n`;
            message += `- ${affectedRules.length} categorization rule(s)\n`;
            message += `- ${affectedGoals.length} linked goal(s)\n`;
            if (hasBudget) message += `- 1 budget limit\n`;
            message += `\nContinue?`;

            if (!confirm(message)) return;

            // Update custom categories array
            const index = customCategories.indexOf(oldName);
            if (index > -1) {
                customCategories[index] = trimmedName;
            }

            // Update all transactions
            const db = await getDB();
            for (let i = 0; i < db.transactions.length; i++) {
                const decrypted = await decryptData(db.transactions[i].data);
                if (decrypted && decrypted.category === oldName) {
                    decrypted.category = trimmedName;
                    db.transactions[i] = {
                        ...db.transactions[i],
                        data: await encryptData(decrypted),
                        lastModified: Date.now()
                    };
                }
            }

            // Update wishlist items
            db.wishlist = db.wishlist || [];
            for (let i = 0; i < db.wishlist.length; i++) {
                const decrypted = await decryptData(db.wishlist[i].data);
                if (decrypted && decrypted.category === oldName) {
                    decrypted.category = trimmedName;
                    db.wishlist[i] = {
                        ...db.wishlist[i],
                        data: await encryptData(decrypted),
                        lastModified: Date.now()
                    };
                }
            }

            // Update budgets
            if (budgets[oldName]) {
                budgets[trimmedName] = budgets[oldName];
                delete budgets[oldName];
            }

            // Update reminders, rules, and linked goals
            recurringTransactions = (recurringTransactions || []).map(reminder => {
                if (!reminder || reminder.category !== oldName) return reminder;
                return { ...reminder, category: trimmedName };
            });
            categorizationRules = (categorizationRules || []).map(rule => {
                if (!rule || rule.category !== oldName) return rule;
                return { ...rule, category: trimmedName, lastModified: Date.now() };
            });
            financialGoals = (financialGoals || []).map(goal => {
                if (!goal || goal.linkedCategory !== oldName) return goal;
                return { ...goal, linkedCategory: trimmedName, lastModified: Date.now() };
            });

            // Save everything
            db.custom_categories = customCategories;
            const budgetEncrypted = await encryptData(budgets);
            db.budgets = { data: budgetEncrypted };
            db.recurring_transactions = recurringTransactions;
            db.categorization_rules = categorizationRules;
            db.goals = financialGoals;
            await saveDB(db);

            // Reload
            await loadFromStorage();
            populateBudgetInputs();
            refreshTransactionCategorySelect(trimmedName);
            showToast(`✅ Category renamed successfully`);
        }

        async function deleteCustomCategory(name) {
            // Check if used in transactions
            const transactions = window.allDecryptedTransactions || [];
            const usedCount = transactions.filter(t => t.category === name).length;
            const wishlistCount = (window.allDecryptedWishlist || []).filter(w => w.category === name).length;
            const reminderCount = (recurringTransactions || []).filter(r => r.category === name).length;
            const rulesCount = (categorizationRules || []).filter(r => r && r.category === name).length;
            const goalCount = (financialGoals || []).filter(g => g && g.linkedCategory === name).length;

            if (usedCount > 0 || wishlistCount > 0 || reminderCount > 0 || rulesCount > 0 || goalCount > 0) {
                const blockers = [];
                if (usedCount > 0) blockers.push(`${usedCount} transaction(s)`);
                if (wishlistCount > 0) blockers.push(`${wishlistCount} wishlist item(s)`);
                if (reminderCount > 0) blockers.push(`${reminderCount} reminder(s)`);
                if (rulesCount > 0) blockers.push(`${rulesCount} categorization rule(s)`);
                if (goalCount > 0) blockers.push(`${goalCount} linked goal(s)`);
                const blockersText = blockers.join('\n- ');
                alert(`Cannot delete "${name}" because it is still in use:\n- ${blockersText}\n\nReassign these first, then delete.`);
                return;
            }

            // Check if has budget
            const hasBudget = budgets[name] > 0;

            let message = `Delete category "${name}"?`;
            if (hasBudget) message += `\n\nThis category has a budget limit that will also be removed.`;

            if (!confirm(message)) return;

            // Remove from custom categories
            const index = customCategories.indexOf(name);
            if (index > -1) {
                customCategories.splice(index, 1);
            }

            // Remove budget
            if (budgets[name]) {
                delete budgets[name];
            }

            // Save
            const db = await getDB();
            db.custom_categories = customCategories;
            const budgetEncrypted = await encryptData(budgets);
            db.budgets = { data: budgetEncrypted };
            await saveDB(db);

            populateBudgetInputs();
            refreshTransactionCategorySelect();
            showToast(`✅ Category deleted`);
        }

        function clearAllBudgets() {
            if (!confirm("Clear all budget limits?")) return;
            const inputs = document.querySelectorAll('.budget-input');
            inputs.forEach(inp => inp.value = '');
            updateBudgetSummaries();
        }

        function setTType(t) {
            document.getElementById('t-type').value = t;
            const btnExp = document.getElementById('btn-expense');
            const btnInc = document.getElementById('btn-income');
            const modalPanel = document.getElementById('transaction-modal-panel');
            const baseButtonClass = 'transaction-type-button py-2 rounded-xl font-bold';

            if (modalPanel) {
                modalPanel.dataset.transactionTone = t === 'income' ? 'income' : 'expense';
            }

            if (t === 'expense') {
                btnExp.className = `${baseButtonClass} is-active`;
                btnInc.className = baseButtonClass;
            } else {
                btnInc.className = `${baseButtonClass} is-active`;
                btnExp.className = baseButtonClass;
            }

            refreshTransactionPaymentSourceUI();
        }

        function openTransactionModal(id = null, options = {}) {
            const modal = document.getElementById('transaction-modal');
            const title = document.getElementById('t-modal-title');
            const tId = document.getElementById('t-id');
            const desc = document.getElementById('t-desc');
            const amt = document.getElementById('t-amount');
            const cat = document.getElementById('t-category');
            const newCategoryInput = document.getElementById('t-new-category');
            const creditCardSelect = document.getElementById('t-credit-card');

            if (!options.fromWishlist) {
                wishlistConvertId = null;
            }

            // Populate categories fresh every time to catch new debts
            populateCategorySelect(cat);
            populateCreditCardSelect(creditCardSelect);
            if (newCategoryInput) {
                newCategoryInput.value = '';
            }

            if (id) {
                const item = window.allDecryptedTransactions.find(t => t.id === id);
                if (!item) return;

                // Guard: Prevent editing specialized transaction types unsupported by this modal.
                // Also guard if a transaction references a category no longer available.

                // Check if category exists in dropdown
                const categoryExists = Array.from(cat.options).some(o => o.value === item.category);

                if (item.type === 'debt_increase' || item.type === 'credit_card_payment' || !categoryExists) {
                    alert("This transaction belongs to a specialized workflow. Please manage it from its dedicated section instead.");
                    return;
                }

                title.innerText = "Edit Transaction";
                tId.value = id;
                desc.value = item.desc;

                // Show original currency and amount if available
                if (item.originalCurrency && item.originalAmt) {
                    amt.value = item.originalAmt;
                    document.getElementById('t-currency').value = item.originalCurrency;
                } else {
                    amt.value = item.amt;
                    document.getElementById('t-currency').value = 'PHP';
                }

                cat.value = item.category;
                setTType(item.type);

                // NEW: Set quantity
                document.getElementById('t-quantity').value = item.quantity || 1;

                // Set date from existing transaction
                const existingDate = new Date(item.date);
                document.getElementById('t-date').value = existingDate.toISOString().split('T')[0];

                updateConversionPreview();
                document.getElementById('t-notes').value = item.notes || '';
                setTPaymentSource(item.paymentSource === 'credit_card' ? 'credit_card' : 'cash');
                if (item.paymentSource === 'credit_card' && creditCardSelect && item.creditCardId) {
                    populateCreditCardSelect(creditCardSelect, item.creditCardId);
                }
            } else {
                title.innerText = "New Transaction";
                tId.value = "";
                desc.value = "";
                amt.value = "";
                document.getElementById('t-quantity').value = "1"; // NEW: Reset quantity
                document.getElementById('t-currency').value = 'PHP';
                cat.value = "Food";
                setTType('expense');

                // Default to today
                document.getElementById('t-date').value = new Date().toISOString().split('T')[0];
                document.getElementById('t-notes').value = '';
                setTPaymentSource('cash');
            }
            refreshTransactionPaymentSourceUI();
            modal.classList.remove('hidden');
        }

        function closeTransactionModal() {
            wishlistConvertId = null;
            toggleModal('transaction-modal');
        }

        function generateFinanceRecordId(prefix = '') {
            return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
        }

        async function getNormalizedBillPayloadById(billId) {
            const raw = rawBills.find(b => b.id === billId);
            if (!raw) return null;
            const decrypted = await decryptData(raw.data);
            if (!decrypted) return null;
            return {
                raw,
                bill: normalizeBillDataShape(decrypted)
            };
        }

        function setBillTypeUIState(billData = null) {
            const billTypeInput = document.getElementById('b-bill-type');
            const helpPanel = document.getElementById('b-electricity-help');
            const summary = document.getElementById('b-electricity-summary');
            const amountLabel = document.getElementById('b-amount-label');

            if (!billTypeInput || !helpPanel || !summary || !amountLabel) return;

            const billType = billTypeInput.value === 'electricity' ? 'electricity' : 'standard';
            helpPanel.classList.toggle('hidden', billType !== 'electricity');
            amountLabel.innerText = billType === 'electricity' ? 'Fallback estimate (optional)' : 'Estimate (PHP)';

            if (billType !== 'electricity') {
                summary.innerHTML = '<p class="text-[11px] text-slate-500">Standard recurring bills only use the monthly reminder and estimate.</p>';
                return;
            }

            const normalizedBill = normalizeBillDataShape(billData);
            const latestCycle = getLatestElectricityBillCycle(normalizedBill);
            if (!latestCycle) {
                summary.innerHTML = '<p class="text-[11px] text-amber-700">Save the electricity bill first, then use the card-level action to record each month\'s amount, kWh, rate, and payment status.</p>';
                return;
            }

            const statusLabel = latestCycle.status === 'paid'
                ? (latestCycle.paidBy === 'family_other' ? 'Paid by family' : 'Paid by me')
                : 'Unpaid';
            summary.innerHTML = `
                <div class="space-y-1">
                    <p class="text-[11px] font-black uppercase tracking-wider text-amber-700">Latest cycle: ${escapeHTML(formatBillingMonthLabel(latestCycle.billingMonth))}</p>
                    <p class="text-[11px] text-slate-600">${latestCycle.kwhUsed.toLocaleString(undefined, { maximumFractionDigits: 2 })} kWh • ${fmt(latestCycle.amount)}</p>
                    <p class="text-[11px] text-slate-500">${statusLabel}</p>
                </div>
            `;
        }

        function onBillTypeChange() {
            const billId = document.getElementById('b-id')?.value;
            const existingBill = billId
                ? (window.allDecryptedBills || []).find(entry => entry && entry.id === billId) || null
                : null;
            setBillTypeUIState(existingBill);
        }

        function onElectricityCycleStatusChange() {
            const status = document.getElementById('electricity-cycle-status')?.value || 'unpaid';
            const paidFields = document.getElementById('electricity-cycle-paid-fields');
            if (!paidFields) return;
            paidFields.classList.toggle('hidden', status !== 'paid');
        }

        function destroyElectricityHistoryChart() {
            if (electricityHistoryChart) {
                electricityHistoryChart.destroy();
                electricityHistoryChart = null;
            }
        }

        function renderElectricityCycleHistoryList(billId, billData, activeCycleId = '') {
            const container = document.getElementById('electricity-history-list');
            if (!container) return;

            const normalizedBill = normalizeBillDataShape(billData);
            const history = normalizedBill.electricityHistory || [];
            if (!history.length) {
                container.innerHTML = '<p class="text-xs text-slate-400">No monthly cycles yet. Your first saved cycle will appear here.</p>';
                return;
            }

            const encodedBillId = encodeInlineArg(billId);
            container.innerHTML = history.map(cycle => {
                const encodedCycleId = encodeInlineArg(cycle.id);
                const isActive = cycle.id === activeCycleId;
                const statusLabel = cycle.status === 'paid'
                    ? (cycle.paidBy === 'family_other' ? 'Paid by family' : 'Paid by me')
                    : 'Unpaid';
                const statusClasses = cycle.status === 'paid'
                    ? (cycle.paidBy === 'family_other'
                        ? 'bg-blue-100 text-blue-700'
                        : 'bg-emerald-100 text-emerald-700')
                    : 'bg-amber-100 text-amber-700';

                return `
                    <div class="p-3 rounded-2xl border ${isActive ? 'border-amber-300 bg-amber-50/60' : 'border-slate-200 bg-white'}">
                        <div class="flex items-start justify-between gap-3">
                            <div>
                                <p class="text-xs font-black uppercase tracking-wider text-slate-500">${escapeHTML(formatBillingMonthLabel(cycle.billingMonth))}</p>
                                <p class="text-sm font-bold text-slate-800 mt-1">${fmt(cycle.amount)} • ${cycle.kwhUsed.toLocaleString(undefined, { maximumFractionDigits: 2 })} kWh</p>
                                <p class="text-[11px] text-slate-500 mt-1">${statusLabel} • ${formatElectricityRate(cycle.ratePerKwh, 'kWh', 2)} • ${formatElectricityRate(cycle.ratePerWh, 'Wh', 4)}</p>
                            </div>
                            <div class="flex flex-col items-end gap-2">
                                <span class="text-[10px] px-2 py-0.5 rounded-full font-bold ${statusClasses}">${escapeHTML(statusLabel)}</span>
                                <button onclick="openElectricityCycleModalFromHistory(decodeURIComponent('${encodedBillId}'), decodeURIComponent('${encodedCycleId}'))" class="px-2.5 py-1 text-[10px] font-bold rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200">Edit</button>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');
        }

        function openElectricityCycleModalFromHistory(billId, cycleId = null) {
            closeElectricityHistoryModal();
            return openElectricityCycleModal(billId, cycleId);
        }

        function syncElectricityHistoryViewButtons() {
            const listBtn = document.getElementById('electricity-history-view-list');
            const graphBtn = document.getElementById('electricity-history-view-graph');
            if (!listBtn || !graphBtn) return;

            const isList = electricityHistoryModalState.view !== 'graph';
            listBtn.className = isList
                ? 'px-3 py-1.5 rounded-xl bg-indigo-600 text-white text-xs font-bold shadow-lg shadow-indigo-200'
                : 'px-3 py-1.5 rounded-xl bg-slate-100 text-slate-600 text-xs font-bold hover:bg-slate-200';
            graphBtn.className = !isList
                ? 'px-3 py-1.5 rounded-xl bg-indigo-600 text-white text-xs font-bold shadow-lg shadow-indigo-200'
                : 'px-3 py-1.5 rounded-xl bg-slate-100 text-slate-600 text-xs font-bold hover:bg-slate-200';
        }

        function renderElectricityHistoryGraph(billData) {
            const emptyState = document.getElementById('electricity-history-empty');
            const graphWrap = document.getElementById('electricity-history-graph-wrap');
            const canvas = document.getElementById('electricity-history-chart');
            if (!graphWrap || !canvas) return;

            const normalizedBill = normalizeBillDataShape(billData);
            const history = [...(normalizedBill.electricityHistory || [])].sort((a, b) => String(a.billingMonth || '').localeCompare(String(b.billingMonth || '')));
            if (!history.length) {
                destroyElectricityHistoryChart();
                if (emptyState) emptyState.classList.remove('hidden');
                graphWrap.classList.add('hidden');
                return;
            }

            if (emptyState) emptyState.classList.add('hidden');
            graphWrap.classList.remove('hidden');
            destroyElectricityHistoryChart();

            const labels = history.map(cycle => formatBillingMonthLabel(cycle.billingMonth));
            const amountData = history.map(cycle => Number(cycle.amount || 0));
            const ratePerKwhData = history.map(cycle => Number(cycle.ratePerKwh || 0));
            const ratePerWhData = history.map(cycle => Number(cycle.ratePerWh || 0));

            electricityHistoryChart = new Chart(canvas.getContext('2d'), {
                type: 'line',
                data: {
                    labels,
                    datasets: [
                        {
                            label: 'Bill Amount',
                            data: amountData,
                            borderColor: '#4f46e5',
                            backgroundColor: 'rgba(79, 70, 229, 0.16)',
                            pointBackgroundColor: '#4f46e5',
                            yAxisID: 'amount',
                            tension: 0.3,
                            fill: false
                        },
                        {
                            label: 'Rate per kWh',
                            data: ratePerKwhData,
                            borderColor: '#d97706',
                            backgroundColor: 'rgba(217, 119, 6, 0.16)',
                            pointBackgroundColor: '#d97706',
                            yAxisID: 'rateKwh',
                            tension: 0.3,
                            fill: false
                        },
                        {
                            label: 'Rate per Wh',
                            data: ratePerWhData,
                            borderColor: '#059669',
                            backgroundColor: 'rgba(5, 150, 105, 0.16)',
                            pointBackgroundColor: '#059669',
                            yAxisID: 'rateWh',
                            tension: 0.3,
                            fill: false
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    interaction: {
                        mode: 'index',
                        intersect: false
                    },
                    plugins: {
                        legend: {
                            position: 'bottom',
                            labels: {
                                boxWidth: 10,
                                font: { size: 11 }
                            }
                        }
                    },
                    scales: {
                        amount: {
                            type: 'linear',
                            position: 'left',
                            ticks: {
                                callback: (value) => fmt(Number(value || 0))
                            },
                            grid: {
                                color: 'rgba(148, 163, 184, 0.16)'
                            }
                        },
                        rateKwh: {
                            type: 'linear',
                            position: 'right',
                            ticks: {
                                callback: (value) => formatElectricityRate(Number(value || 0), 'kWh', 2)
                            },
                            grid: {
                                drawOnChartArea: false
                            }
                        },
                        rateWh: {
                            type: 'linear',
                            position: 'right',
                            offset: true,
                            ticks: {
                                callback: (value) => formatElectricityRate(Number(value || 0), 'Wh', 4)
                            },
                            grid: {
                                drawOnChartArea: false
                            }
                        }
                    }
                }
            });
        }

        function renderElectricityHistoryModalContent() {
            const listWrap = document.getElementById('electricity-history-list-wrap');
            const graphWrap = document.getElementById('electricity-history-graph-wrap');
            const emptyState = document.getElementById('electricity-history-empty');
            const bill = electricityHistoryModalState.bill;
            if (!listWrap || !graphWrap || !bill) return;

            syncElectricityHistoryViewButtons();
            const showGraph = electricityHistoryModalState.view === 'graph';
            listWrap.classList.toggle('hidden', showGraph);
            graphWrap.classList.toggle('hidden', !showGraph);

            const history = bill.electricityHistory || [];
            if (!history.length) {
                listWrap.classList.add('hidden');
                graphWrap.classList.add('hidden');
                if (emptyState) emptyState.classList.remove('hidden');
                destroyElectricityHistoryChart();
                return;
            }

            if (emptyState) emptyState.classList.add('hidden');
            if (showGraph) {
                renderElectricityHistoryGraph(bill);
            } else {
                destroyElectricityHistoryChart();
                renderElectricityCycleHistoryList(electricityHistoryModalState.billId, bill);
            }
        }

        function setElectricityHistoryView(view) {
            electricityHistoryModalState.view = view === 'graph' ? 'graph' : 'list';
            renderElectricityHistoryModalContent();
        }

        async function openElectricityHistoryModal(billId, preferredView = 'list') {
            const resolved = await getNormalizedBillPayloadById(billId);
            if (!resolved) {
                alert('Could not load this electricity bill history.');
                return;
            }

            const { bill } = resolved;
            if (bill.billType !== 'electricity') {
                alert('This bill is not configured as an electricity bill.');
                return;
            }

            electricityHistoryModalState.billId = billId;
            electricityHistoryModalState.bill = bill;
            electricityHistoryModalState.view = preferredView === 'graph' ? 'graph' : 'list';
            document.getElementById('electricity-history-bill-name').innerText = bill.name || 'Electricity bill';
            document.getElementById('electricity-history-modal').classList.remove('hidden');
            renderElectricityHistoryModalContent();
        }

        function closeElectricityHistoryModal() {
            destroyElectricityHistoryChart();
            electricityHistoryModalState.billId = '';
            electricityHistoryModalState.bill = null;
            electricityHistoryModalState.view = 'list';
            document.getElementById('electricity-history-modal')?.classList.add('hidden');
        }

        async function openElectricityCycleModal(billId, cycleId = null) {
            const resolved = await getNormalizedBillPayloadById(billId);
            if (!resolved) {
                alert('Could not load this electricity bill.');
                return;
            }

            const { bill } = resolved;
            if (bill.billType !== 'electricity') {
                alert('This bill is not configured as an electricity bill.');
                return;
            }

            const cycle = (bill.electricityHistory || []).find(entry => entry.id === cycleId) || null;
            const modal = document.getElementById('electricity-cycle-modal');
            document.getElementById('electricity-cycle-bill-id').value = billId;
            document.getElementById('electricity-cycle-id').value = cycle ? cycle.id : '';
            document.getElementById('electricity-cycle-title').innerText = cycle ? 'Edit Electricity Bill' : 'Record Electricity Bill';
            document.getElementById('electricity-cycle-bill-name').innerText = bill.name || 'Electricity bill';
            document.getElementById('electricity-cycle-month').value = cycle?.billingMonth || new Date().toISOString().slice(0, 7);
            document.getElementById('electricity-cycle-amount').value = Number.isFinite(Number(cycle?.amount))
                ? Number(cycle.amount).toFixed(2)
                : (Number.isFinite(Number(bill.amt)) && Number(bill.amt) > 0 ? Number(bill.amt).toFixed(2) : '');
            document.getElementById('electricity-cycle-kwh').value = Number.isFinite(Number(cycle?.kwhUsed))
                ? Number(cycle.kwhUsed)
                : '';
            document.getElementById('electricity-cycle-status').value = cycle?.status || 'unpaid';
            document.getElementById('electricity-cycle-paid-by').value = cycle?.paidBy || 'me';
            document.getElementById('electricity-cycle-paid-at').value = cycle?.paidAt
                ? String(cycle.paidAt).slice(0, 10)
                : new Date().toISOString().slice(0, 10);
            document.getElementById('electricity-cycle-notes').value = cycle?.notes || '';
            onElectricityCycleStatusChange();
            modal.classList.remove('hidden');
        }

        async function upsertElectricityBillPaymentTransaction(db, billId, billName, cycle) {
            const safeBillName = String(billName || 'Electricity Bill').trim() || 'Electricity Bill';
            const billingLabel = formatBillingMonthLabel(cycle.billingMonth);
            const desc = `${safeBillName} Electricity • ${billingLabel}`;
            const encrypted = await encryptData({
                desc,
                merchant: null,
                tags: [],
                amt: cycle.amount,
                originalAmt: cycle.amount,
                originalCurrency: 'PHP',
                quantity: 1,
                notes: cycle.notes || '',
                type: 'expense',
                category: 'Bills',
                paymentSource: 'cash',
                creditCardId: null,
                creditCardName: null,
                date: cycle.paidAt || new Date().toISOString(),
                importId: null,
                dedupeHash: null,
                deletedAt: null,
                linkedBillId: billId,
                linkedBillCycleId: cycle.id,
                billName: safeBillName,
                paidBy: 'me'
            });

            const targetId = String(cycle.linkedTransactionId || '').trim();
            const existingIdx = targetId
                ? db.transactions.findIndex(tx => tx && tx.id === targetId)
                : -1;

            if (existingIdx >= 0) {
                const existing = db.transactions[existingIdx] || {};
                db.transactions[existingIdx] = {
                    ...existing,
                    id: existing.id || targetId,
                    data: encrypted,
                    lastModified: Date.now(),
                    deletedAt: null
                };
                return db.transactions[existingIdx].id;
            }

            const newTransactionId = generateFinanceRecordId('tx_');
            db.transactions.push({
                id: newTransactionId,
                data: encrypted,
                createdAt: Date.now(),
                deletedAt: null
            });
            return newTransactionId;
        }

        function removeLinkedElectricityBillPaymentTransaction(db, transactionId) {
            const targetId = String(transactionId || '').trim();
            if (!targetId) return false;
            const idx = db.transactions.findIndex(tx => tx && tx.id === targetId && !tx.deletedAt);
            if (idx === -1) return false;
            db.transactions[idx] = {
                ...db.transactions[idx],
                deletedAt: new Date().toISOString(),
                lastModified: Date.now()
            };
            return true;
        }

        async function openBillModal(id = null) {
            const modal = document.getElementById('bill-modal');
            const title = document.getElementById('b-modal-title');
            const bId = document.getElementById('b-id');
            const name = document.getElementById('b-name');
            const day = document.getElementById('b-day');
            const amt = document.getElementById('b-amount');
            const paused = document.getElementById('b-paused');
            const billType = document.getElementById('b-bill-type');

            if (id) {
                const resolved = await getNormalizedBillPayloadById(id);
                if (resolved) {
                    const d = resolved.bill;
                    if (d) {
                        title.innerText = "Edit Bill";
                        bId.value = id;
                        name.value = d.name;
                        day.value = d.day;
                        amt.value = Number.isFinite(Number(d.amt)) && Number(d.amt) > 0 ? Number(d.amt).toFixed(2) : '';
                        paused.checked = !!d.paused;
                        billType.value = d.billType;
                        setBillTypeUIState(d);
                        modal.classList.remove('hidden');
                        return;
                    }
                }
            }

            title.innerText = "Add Bill";
            bId.value = "";
            name.value = "";
            day.value = "";
            amt.value = "";
            paused.checked = false;
            billType.value = 'standard';
            setBillTypeUIState(null);
            modal.classList.remove('hidden');
        }

        function openDebtModal() {
            document.getElementById('d-name').value = '';
            document.getElementById('d-amount').value = '';
            document.getElementById('debt-modal').classList.remove('hidden');
        }

        async function openCreditCardModal(id = null) {
            const modal = document.getElementById('credit-card-modal');
            const title = document.getElementById('cc-modal-title');
            const ccId = document.getElementById('cc-id');
            const name = document.getElementById('cc-name');
            const last4 = document.getElementById('cc-last4');
            const limit = document.getElementById('cc-limit');
            const openingBalance = document.getElementById('cc-opening-balance');
            const paymentDueDay = document.getElementById('cc-payment-due-day');
            const paymentReminderPaused = document.getElementById('cc-payment-reminder-paused');

            if (id) {
                const raw = rawCreditCards.find(card => card.id === id);
                if (raw) {
                    const data = await decryptData(raw.data);
                    if (data) {
                        title.innerText = 'Edit Credit Card';
                        ccId.value = id;
                        name.value = data.name || '';
                        last4.value = data.last4 || '';
                        limit.value = Number(data.limit || 0) || '';
                        openingBalance.value = Number(data.openingBalance || 0) || '';
                        paymentDueDay.value = Number(data.paymentDueDay || 0) || '';
                        paymentReminderPaused.checked = data.paymentReminderPaused === true;
                        modal.classList.remove('hidden');
                        return;
                    }
                }
            }

            title.innerText = 'Add Credit Card';
            ccId.value = '';
            name.value = '';
            last4.value = '';
            limit.value = '';
            openingBalance.value = '';
            paymentDueDay.value = '';
            paymentReminderPaused.checked = false;
            modal.classList.remove('hidden');
        }

        async function saveCreditCard() {
            const id = document.getElementById('cc-id').value;
            const name = document.getElementById('cc-name').value.trim();
            const last4 = document.getElementById('cc-last4').value.trim();
            const rawLimit = document.getElementById('cc-limit').value.trim();
            const rawOpeningBalance = document.getElementById('cc-opening-balance').value.trim();
            const parsedLimit = rawLimit === '' ? null : parseFloat(rawLimit);
            const parsedOpeningBalance = rawOpeningBalance === '' ? null : parseFloat(rawOpeningBalance);
            const limit = Number.isFinite(parsedLimit) ? Math.max(0, parsedLimit) : null;
            const openingBalance = Number.isFinite(parsedOpeningBalance) ? Math.max(0, parsedOpeningBalance) : null;
            const rawDueDay = parseInt(document.getElementById('cc-payment-due-day').value || '', 10);
            const paymentDueDay = Number.isInteger(rawDueDay) ? Math.max(1, Math.min(31, rawDueDay)) : null;
            const paymentReminderPaused = document.getElementById('cc-payment-reminder-paused').checked;

            if (!name) {
                alert('Please enter a card name.');
                return;
            }

            const encrypted = await encryptData({ name, last4, limit, openingBalance, paymentDueDay, paymentReminderPaused });
            const db = await getDB();
            db.credit_cards = Array.isArray(db.credit_cards) ? db.credit_cards : [];
            let cardId = id;

            if (id) {
                const idx = db.credit_cards.findIndex(card => card.id === id);
                if (idx !== -1) {
                    const existing = db.credit_cards[idx] || {};
                    db.credit_cards[idx] = {
                        ...existing,
                        id,
                        data: encrypted,
                        lastModified: Date.now(),
                        deletedAt: existing.deletedAt || null
                    };
                }
            } else {
                cardId = Date.now().toString(36) + Math.random().toString(36).substr(2);
                db.credit_cards.push({
                    id: cardId,
                    data: encrypted,
                    createdAt: Date.now(),
                    deletedAt: null
                });
            }

            if (typeof syncCreditCardToReminder === 'function') {
                await syncCreditCardToReminder(cardId, name, paymentDueDay, {
                    persist: false,
                    paused: paymentReminderPaused
                });
                db.recurring_transactions = recurringTransactions;
            }

            await saveDB(db);
            rawCreditCards = (db.credit_cards || []).filter(card => !card.deletedAt);
            toggleModal('credit-card-modal');
            await renderCreditCards(rawCreditCards);
            populateCreditCardSelect(document.getElementById('t-credit-card'));
            refreshTransactionPaymentSourceUI();
            if (typeof renderRecurringList === 'function') {
                renderRecurringList();
            }
            if (typeof checkRecurringReminders === 'function') {
                checkRecurringReminders();
            }
            await refreshLinkedPanels({
                refreshKPI: true,
                refreshForecast: true,
                refreshStatements: true
            });
            showToast(id ? '✅ Credit card updated' : '✅ Credit card added');
        }

        function openCreditCardPaymentModal(id, options = {}) {
            const card = findTrackedCreditCard(id);
            if (!card) return;

            document.getElementById('cc-payment-card-id').value = id;
            document.getElementById('cc-payment-card-label').innerText = card.name || 'Credit Card';
            document.getElementById('cc-payment-amount').value = Number.isFinite(Number(options.amount))
                ? Number(options.amount).toFixed(2)
                : '';
            document.getElementById('cc-payment-date').value = options.date || new Date().toISOString().split('T')[0];
            document.getElementById('cc-payment-notes').value = options.notes || '';
            document.getElementById('credit-card-payment-modal').classList.remove('hidden');
        }

        async function saveCreditCardPayment() {
            const cardId = document.getElementById('cc-payment-card-id').value;
            const card = findTrackedCreditCard(cardId);
            const amount = parseFloat(document.getElementById('cc-payment-amount').value);
            const noteInput = document.getElementById('cc-payment-notes').value.trim();
            const selectedDate = document.getElementById('cc-payment-date').value;

            if (!card || !Number.isFinite(amount) || amount <= 0) {
                alert('Enter a valid payment amount.');
                return;
            }

            const date = selectedDate ? new Date(selectedDate).toISOString() : new Date().toISOString();
            const desc = noteInput || `Payment for ${card.name}`;

            const encrypted = await encryptData({
                desc,
                merchant: null,
                tags: [],
                amt: amount,
                originalAmt: amount,
                originalCurrency: 'PHP',
                quantity: 1,
                notes: noteInput,
                type: 'credit_card_payment',
                category: card.name,
                creditCardId: card.id,
                creditCardName: card.name,
                paymentSource: 'cash',
                date,
                importId: null,
                dedupeHash: null,
                deletedAt: null
            });

            const db = await getDB();
            db.transactions.push({
                id: Date.now().toString(36) + Math.random().toString(36).substr(2),
                data: encrypted,
                createdAt: Date.now(),
                deletedAt: null
            });
            await saveDB(db);

            rawTransactions = db.transactions.filter(t => !t.deletedAt);
            toggleModal('credit-card-payment-modal');
            await loadAndRender();
            await renderCreditCards(rawCreditCards);
            if (typeof renderRecurringList === 'function') {
                renderRecurringList();
            }
            if (typeof checkRecurringReminders === 'function') {
                checkRecurringReminders();
            }
            showToast('✅ Card payment recorded');
        }

        async function saveTransaction() {
            const id = document.getElementById('t-id').value;
            const desc = document.getElementById('t-desc').value;
            const amt = parseFloat(document.getElementById('t-amount').value);
            const currency = document.getElementById('t-currency').value;
            const type = document.getElementById('t-type').value;
            const category = document.getElementById('t-category').value;
            const paymentSource = type === 'expense'
                ? (document.getElementById('t-payment-source')?.value === 'credit_card' ? 'credit_card' : 'cash')
                : 'cash';
            const creditCardId = paymentSource === 'credit_card' ? document.getElementById('t-credit-card')?.value || '' : '';
            const linkedCreditCard = creditCardId ? findTrackedCreditCard(creditCardId) : null;

            if (!desc || isNaN(amt)) return;
            if (!category) {
                alert('Please select a category.');
                return;
            }
            if (paymentSource === 'credit_card' && !linkedCreditCard) {
                alert('Please choose a tracked credit card.');
                return;
            }

            // Use date from date picker
            const selectedDate = document.getElementById('t-date').value;
            let date = selectedDate ? new Date(selectedDate).toISOString() : new Date().toISOString();

            // Convert amount to PHP for storage
            const amtInPHP = convertToDisplayCurrency(amt, currency, 'PHP');

            const quantity = parseFloat(document.getElementById('t-quantity').value) || 1;

            const notes = document.getElementById('t-notes').value;

            const encrypted = await encryptData({
                desc,
                merchant: null,
                tags: [],
                amt: amtInPHP,
                originalAmt: amt,
                originalCurrency: currency,
                quantity: quantity,
                notes: notes,
                type,
                category,
                paymentSource,
                creditCardId: linkedCreditCard ? linkedCreditCard.id : null,
                creditCardName: linkedCreditCard ? linkedCreditCard.name : null,
                date,
                importId: null,
                dedupeHash: null,
                deletedAt: null
            });

            const db = await getDB();
            if (id) {
                const idx = db.transactions.findIndex(t => t.id === id);
                if (idx !== -1) {
                    const existing = db.transactions[idx] || {};
                    db.transactions[idx] = {
                        ...existing,
                        id,
                        data: encrypted,
                        lastModified: Date.now(),
                        deletedAt: existing.deletedAt || null
                    };
                }
            } else {
                db.transactions.push({
                    id: Date.now().toString(36) + Math.random().toString(36).substr(2),
                    data: encrypted,
                    createdAt: Date.now(),
                    deletedAt: null
                });
            }
            await saveDB(db);

            rawTransactions = db.transactions.filter(t => !t.deletedAt);
            toggleModal('transaction-modal');
            await loadAndRender(); // Updates transaction list

            // Re-render debts because a transaction might have been a payment towards a debt
            await renderDebts(rawDebts);
            await renderCreditCards(rawCreditCards);
            if (typeof renderRecurringList === 'function') {
                renderRecurringList();
            }
            if (typeof checkRecurringReminders === 'function') {
                checkRecurringReminders();
            }

            if (wishlistConvertId) {
                const convertId = wishlistConvertId;
                wishlistConvertId = null;
                await removeWishlistById(convertId);
                showToast('✅ Converted from wishlist');
            }
        }

        async function saveBill() {
            const id = document.getElementById('b-id').value;
            const name = document.getElementById('b-name').value.trim();
            const day = parseInt(document.getElementById('b-day').value, 10);
            const parsedAmount = parseFloat(document.getElementById('b-amount').value);
            const paused = document.getElementById('b-paused').checked;
            const billType = document.getElementById('b-bill-type').value === 'electricity' ? 'electricity' : 'standard';
            if (!name || isNaN(day)) {
                alert('Please enter a bill name and due day.');
                return;
            }

            const db = await getDB();
            let billId = id;
            let existingBill = normalizeBillDataShape(null);

            if (id) {
                const resolved = await getNormalizedBillPayloadById(id);
                existingBill = resolved?.bill || existingBill;
            }

            if (existingBill.electricityHistory.length > 0 && billType !== 'electricity') {
                alert('This bill already has electricity usage history. Keep it as an electricity bill to preserve that history.');
                return;
            }

            const nextBill = normalizeBillDataShape({
                ...existingBill,
                name,
                day,
                amt: Number.isFinite(parsedAmount) ? Math.max(0, parsedAmount) : 0,
                paused,
                billType,
                electricityHistory: billType === 'electricity' ? existingBill.electricityHistory : []
            });
            const encrypted = await encryptData(nextBill);

            if (id) {
                const idx = db.bills.findIndex(b => b.id === id);
                if (idx !== -1) {
                    const existing = db.bills[idx] || {};
                    db.bills[idx] = { ...existing, id, data: encrypted, lastModified: Date.now(), deletedAt: existing.deletedAt || null };
                }
            } else {
                billId = Date.now().toString(36) + Math.random().toString(36).substr(2);
                db.bills.push({
                    id: billId,
                    data: encrypted,
                    deletedAt: null
                });
            }

            // AUTO-SYNC: Create or update corresponding reminder
            await syncBillToReminder(billId, nextBill.name, nextBill.day, nextBill.amt, { paused: nextBill.paused });
            db.recurring_transactions = recurringTransactions;

            const persistedDB = await saveDB(db);

            rawBills = (persistedDB.bills || []).filter(b => !b.deletedAt);
            recurringTransactions = persistedDB.recurring_transactions || recurringTransactions;
            toggleModal('bill-modal');
            await renderBills(rawBills);
            if (typeof renderRecurringList === 'function') {
                renderRecurringList();
            }
            checkRecurringReminders();
            await refreshLinkedPanels({ refreshMonthlyClose: true });
            showToast(id ? '✅ Bill updated' : '✅ Bill added');
        }

        async function saveElectricityBillCycle() {
            const billId = document.getElementById('electricity-cycle-bill-id').value;
            const cycleId = document.getElementById('electricity-cycle-id').value;
            const billingMonth = normalizeMonthKey(document.getElementById('electricity-cycle-month').value);
            const amount = parseFloat(document.getElementById('electricity-cycle-amount').value);
            const kwhUsed = parseFloat(document.getElementById('electricity-cycle-kwh').value);
            const status = document.getElementById('electricity-cycle-status').value === 'paid' ? 'paid' : 'unpaid';
            const paidBy = document.getElementById('electricity-cycle-paid-by').value === 'family_other' ? 'family_other' : 'me';
            const paidAtInput = document.getElementById('electricity-cycle-paid-at').value;
            const notes = document.getElementById('electricity-cycle-notes').value.trim();

            if (!billId || !billingMonth) {
                alert('Choose a billing month.');
                return;
            }
            if (!Number.isFinite(amount) || amount <= 0 || !Number.isFinite(kwhUsed) || kwhUsed <= 0) {
                alert('Enter a valid bill amount and kWh used.');
                return;
            }

            const db = await getDB();
            const billIndex = (db.bills || []).findIndex(entry => entry && entry.id === billId && !entry.deletedAt);
            if (billIndex === -1) {
                alert('Could not find this electricity bill.');
                return;
            }

            const decryptedBill = await decryptData(db.bills[billIndex].data);
            const bill = normalizeBillDataShape(decryptedBill);
            if (bill.billType !== 'electricity') {
                alert('This bill is not configured as electricity.');
                return;
            }

            const existingCycle = (bill.electricityHistory || []).find(entry => entry.id === cycleId) || null;
            const duplicateMonthCycle = (bill.electricityHistory || []).find(entry => entry.billingMonth === billingMonth && entry.id !== cycleId);
            if (duplicateMonthCycle) {
                alert('A cycle for that billing month already exists. Edit it from the history list instead.');
                return;
            }

            const rates = computeElectricityRateMetrics(amount, kwhUsed);
            const nowIso = new Date().toISOString();
            const nextCycle = normalizeElectricityBillCycleEntry({
                id: existingCycle?.id || generateFinanceRecordId('ecycle_'),
                billingMonth,
                amount,
                kwhUsed,
                ratePerKwh: rates.ratePerKwh,
                ratePerWh: rates.ratePerWh,
                status,
                paidBy: status === 'paid' ? paidBy : 'me',
                paidAt: status === 'paid'
                    ? (paidAtInput ? new Date(paidAtInput).toISOString() : nowIso)
                    : null,
                linkedTransactionId: existingCycle?.linkedTransactionId || null,
                notes,
                createdAt: existingCycle?.createdAt || nowIso,
                lastModified: Date.now()
            });

            if (nextCycle.status === 'paid' && nextCycle.paidBy === 'me') {
                nextCycle.linkedTransactionId = await upsertElectricityBillPaymentTransaction(db, billId, bill.name, nextCycle);
            } else if (nextCycle.linkedTransactionId) {
                removeLinkedElectricityBillPaymentTransaction(db, nextCycle.linkedTransactionId);
                nextCycle.linkedTransactionId = null;
            }

            const nextHistory = (bill.electricityHistory || [])
                .filter(entry => entry.id !== nextCycle.id)
                .concat(nextCycle)
                .sort(compareElectricityCyclesDesc);
            const latestCycle = nextHistory[0] || nextCycle;
            const nextBill = normalizeBillDataShape({
                ...bill,
                billType: 'electricity',
                amt: latestCycle.amount,
                electricityHistory: nextHistory
            });
            const encrypted = await encryptData(nextBill);

            db.bills[billIndex] = {
                ...db.bills[billIndex],
                id: billId,
                data: encrypted,
                lastModified: Date.now(),
                deletedAt: null
            };

            await syncBillToReminder(billId, nextBill.name, nextBill.day, nextBill.amt, { paused: nextBill.paused });
            db.recurring_transactions = recurringTransactions;

            const persistedDB = await saveDB(db);
            rawBills = (persistedDB.bills || []).filter(entry => !entry.deletedAt);
            rawTransactions = (persistedDB.transactions || []).filter(entry => !entry.deletedAt);
            recurringTransactions = persistedDB.recurring_transactions || recurringTransactions;

            document.getElementById('electricity-cycle-modal').classList.add('hidden');
            await loadAndRender();
            await renderBills(rawBills);
            if (typeof renderRecurringList === 'function') {
                renderRecurringList();
            }
            checkRecurringReminders();
            await refreshLinkedPanels({ refreshMonthlyClose: true });
            showToast(existingCycle ? '✅ Electricity bill updated' : '✅ Electricity bill recorded');
        }

        async function toggleBillPaused(id) {
            if (!id || pendingBillPauseToggles.has(id)) return;

            pendingBillPauseToggles.add(id);

            try {
                const db = await getDB();
                const bills = db.bills || [];
                const idx = bills.findIndex(b => b && b.id === id && !b.deletedAt);
                if (idx === -1) return;

                const raw = bills[idx];
                const data = await decryptData(raw.data);
                if (!data) return;

                const normalizedBill = normalizeBillDataShape(data);
                const nextPaused = !normalizedBill.paused;
                const encrypted = await encryptData({
                    ...normalizedBill,
                    paused: nextPaused
                });
                const previousRawBills = rawBills;
                const previousRecurringTransactions = Array.isArray(recurringTransactions)
                    ? recurringTransactions.map(reminder => ({ ...reminder }))
                    : [];

                db.bills[idx] = {
                    ...raw,
                    data: encrypted,
                    lastModified: Date.now(),
                    deletedAt: raw.deletedAt || null
                };

                await syncBillToReminder(id, normalizedBill.name, normalizedBill.day, normalizedBill.amt, { paused: nextPaused });
                db.recurring_transactions = recurringTransactions;

                // Render the new state immediately so pause/resume feels instant.
                rawBills = db.bills.filter(b => !b.deletedAt);
                await renderBills(rawBills);
                checkRecurringReminders();

                try {
                    await saveDB(db);
                } catch (error) {
                    rawBills = previousRawBills;
                    recurringTransactions = previousRecurringTransactions;
                    await renderBills(rawBills);
                    checkRecurringReminders();
                    console.error('Failed to persist bill pause state.', error);
                    showToast('❌ Could not update bill status');
                    return;
                }

                await refreshLinkedPanels({ refreshMonthlyClose: true });
                showToast(nextPaused ? '⏸️ Bill paused' : '▶️ Bill resumed');
            } finally {
                pendingBillPauseToggles.delete(id);
            }
        }


        async function saveDebt() {
            const name = document.getElementById('d-name').value;
            const amount = parseFloat(document.getElementById('d-amount').value);
            if (!name || isNaN(amount)) return;

            const encrypted = await encryptData({ name, amount });
            const db = await getDB();
            db.debts = db.debts || [];
            db.debts.push({
                id: Date.now().toString(36) + Math.random().toString(36).substr(2),
                data: encrypted,
                deletedAt: null
            });
            await saveDB(db);

            rawDebts = db.debts.filter(d => !d.deletedAt);
            toggleModal('debt-modal');
            await renderDebts(rawDebts);
            // Refresh budget inputs to include new debt category
            populateBudgetInputs();
            refreshTransactionCategorySelect();
            await refreshLinkedPanels({
                refreshKPI: true,
                refreshForecast: true,
                refreshStatements: true
            });
        }

        // New Logic for Update Debt Modal
        function openUpdateDebtModal(id) {
            const debt = window.allDecryptedDebts.find(d => d.id === id);
            if (!debt) return;

            document.getElementById('ud-title').innerText = debt.name;
            document.getElementById('ud-debt-id').value = id;
            document.getElementById('ud-category').value = debt.name; // Category matches debt name
            document.getElementById('ud-amount').value = '';
            document.getElementById('ud-desc').value = '';
            document.getElementById('ud-date').value = new Date().toISOString().split('T')[0];

            setUDType('repayment'); // Default
            document.getElementById('update-debt-modal').classList.remove('hidden');
        }

        function setUDType(type) {
            document.getElementById('ud-type').value = type;
            const btnRepay = document.getElementById('btn-ud-repay');
            const btnLoan = document.getElementById('btn-ud-loan');

            if (type === 'repayment') {
                btnRepay.className = "py-2 rounded-xl font-bold bg-white text-emerald-600 shadow-sm";
                btnLoan.className = "py-2 rounded-xl font-bold text-slate-400";
            } else {
                btnRepay.className = "py-2 rounded-xl font-bold text-slate-400";
                btnLoan.className = "py-2 rounded-xl font-bold bg-white text-rose-600 shadow-sm";
            }
        }

        async function saveDebtTransaction() {
            const category = document.getElementById('ud-category').value;
            const amount = parseFloat(document.getElementById('ud-amount').value);
            const typeKey = document.getElementById('ud-type').value; // 'repayment' or 'loan'
            const dateVal = document.getElementById('ud-date').value;
            let desc = document.getElementById('ud-desc').value;

            if (isNaN(amount) || amount <= 0) { alert("Invalid amount"); return; }

            // Map to Transaction Type
            // Repayment -> Expense (Reduces debt remaining)
            // Loan -> Debt Increase (Increases debt remaining, adds to balance, but NOT income)
            const type = typeKey === 'repayment' ? 'expense' : 'debt_increase';

            if (!desc) {
                desc = typeKey === 'repayment' ? `Repayment for ${category}` : `Added loan for ${category}`;
            }

            const date = dateVal ? new Date(dateVal).toISOString() : new Date().toISOString();

            // Reuse generic save logic via manual construction
            const encrypted = await encryptData({
                desc,
                merchant: null,
                tags: [],
                amt: amount, // Assuming base currency for simplicity
                quantity: 1,
                type,
                category,
                date,
                importId: null,
                dedupeHash: null,
                deletedAt: null
            });

            const db = await getDB();
            db.transactions.push({
                id: Date.now().toString(36) + Math.random().toString(36).substr(2),
                data: encrypted,
                createdAt: Date.now(),
                deletedAt: null
            });

            await saveDB(db);

            rawTransactions = db.transactions.filter(t => !t.deletedAt);
            toggleModal('update-debt-modal');
            await loadAndRender(); // Updates transaction list
            await renderDebts(rawDebts); // Update debt progress
        }

        async function saveLent() {
            const name = document.getElementById('l-name').value;
            if (!name) return;

            const encrypted = await encryptData({ name });
            const db = await getDB();
            db.lent = db.lent || [];
            db.lent.push({
                id: Date.now().toString(36) + Math.random().toString(36).substr(2),
                data: encrypted,
                deletedAt: null
            });
            await saveDB(db);

            rawLent = db.lent.filter(l => !l.deletedAt);
            toggleModal('lent-modal');
            await renderLent(rawLent);
            refreshTransactionCategorySelect();
            await refreshLinkedPanels({
                refreshKPI: true,
                refreshStatements: true
            });
        }

        async function saveBudgets() {
            const inputs = document.querySelectorAll('.budget-input');
            const newBudgets = {};
            inputs.forEach(inp => {
                const cat = inp.dataset.cat;
                const val = parseFloat(inp.value);
                if (val > 0) newBudgets[cat] = val;
            });

            const encrypted = await encryptData(newBudgets);

            const db = await getDB();
            db.budgets = { data: encrypted };
            db.custom_categories = customCategories;
            await saveDB(db);

            budgets = newBudgets;
            toggleModal('budget-modal');
            refreshTransactionCategorySelect();
            loadAndRender();
        }

        function populateWishlistCategorySelect(selectEl) {
            populateCategorySelect(selectEl);
            const placeholder = document.createElement('option');
            placeholder.value = '';
            placeholder.innerText = 'No category (optional)';
            selectEl.insertBefore(placeholder, selectEl.firstChild);
        }

        function updateWishlistConversionPreview() {
            const amount = parseFloat(document.getElementById('w-amount').value);
            const currency = document.getElementById('w-currency').value;
            const preview = document.getElementById('wishlist-amount-preview');

            if (!amount || isNaN(amount)) {
                preview.innerText = '';
                return;
            }

            if (currency === activeCurrency) {
                preview.innerText = '';
            } else {
                const converted = convertToDisplayCurrency(amount, currency, activeCurrency);
                preview.innerText = `≈ ${formatCurrency(converted, activeCurrency)} in ${activeCurrency}`;
            }
        }

        function openWishlistModal(id = null) {
            const modal = document.getElementById('wishlist-modal');
            const title = document.getElementById('w-modal-title');
            const wId = document.getElementById('w-id');
            const desc = document.getElementById('w-desc');
            const amt = document.getElementById('w-amount');
            const cat = document.getElementById('w-category');

            populateWishlistCategorySelect(cat);

            if (id) {
                const item = (window.allDecryptedWishlist || []).find(w => w.id === id);
                if (!item) return;

                title.innerText = 'Edit Wishlist Item';
                wId.value = id;
                desc.value = item.desc || '';

                if (item.originalCurrency && item.originalAmt) {
                    amt.value = item.originalAmt;
                    document.getElementById('w-currency').value = item.originalCurrency;
                } else if (item.amt) {
                    amt.value = item.amt;
                    document.getElementById('w-currency').value = 'PHP';
                } else {
                    amt.value = '';
                    document.getElementById('w-currency').value = 'PHP';
                }

                document.getElementById('w-quantity').value = item.quantity || 1;
                document.getElementById('w-date').value = item.targetDate
                    ? new Date(item.targetDate).toISOString().split('T')[0]
                    : new Date().toISOString().split('T')[0];
                cat.value = item.category || '';
                document.getElementById('w-notes').value = item.notes || '';
            } else {
                title.innerText = 'Add Wishlist Item';
                wId.value = '';
                desc.value = '';
                amt.value = '';
                document.getElementById('w-currency').value = 'PHP';
                document.getElementById('w-quantity').value = '1';
                document.getElementById('w-date').value = new Date().toISOString().split('T')[0];
                cat.value = '';
                document.getElementById('w-notes').value = '';
            }

            updateWishlistConversionPreview();
            modal.classList.remove('hidden');
        }

        async function saveWishlistItem() {
            const id = document.getElementById('w-id').value;
            const desc = document.getElementById('w-desc').value.trim();
            const amountRaw = document.getElementById('w-amount').value;
            const currency = document.getElementById('w-currency').value;
            const category = document.getElementById('w-category').value || null;
            const notes = document.getElementById('w-notes').value;
            const quantity = parseFloat(document.getElementById('w-quantity').value) || 1;

            if (!desc) {
                alert('Please enter a description.');
                return;
            }

            let amtInPHP = null;
            let originalAmt = null;
            let originalCurrency = null;
            const parsedAmt = parseFloat(amountRaw);
            if (!isNaN(parsedAmt)) {
                amtInPHP = convertToDisplayCurrency(parsedAmt, currency, 'PHP');
                originalAmt = parsedAmt;
                originalCurrency = currency;
            }

            const selectedDate = document.getElementById('w-date').value;
            const targetDate = selectedDate ? new Date(selectedDate).toISOString() : new Date().toISOString();

            let createdAt = new Date().toISOString();
            if (id) {
                const existing = (window.allDecryptedWishlist || []).find(w => w.id === id);
                if (existing && existing.createdAt) createdAt = existing.createdAt;
            }

            const encrypted = await encryptData({
                desc,
                amt: amtInPHP,
                originalAmt,
                originalCurrency,
                quantity,
                category,
                notes,
                targetDate,
                createdAt
            });

            const db = await getDB();
            db.wishlist = db.wishlist || [];
            if (id) {
                const idx = db.wishlist.findIndex(w => w.id === id);
                if (idx !== -1) {
                    const existing = db.wishlist[idx] || {};
                    db.wishlist[idx] = {
                        ...existing,
                        id,
                        data: encrypted,
                        lastModified: Date.now(),
                        deletedAt: existing.deletedAt || null
                    };
                }
            } else {
                db.wishlist.push({
                    id: Date.now().toString(36) + Math.random().toString(36).substr(2),
                    data: encrypted,
                    createdAt: Date.now(),
                    deletedAt: null
                });
            }

            await saveDB(db);
            rawWishlist = db.wishlist.filter(w => !w.deletedAt);
            toggleModal('wishlist-modal');
            await loadAndRenderWishlist();
            await refreshLinkedPanels({ refreshPlanning: true });
            showToast('✅ Wishlist updated');
        }

        async function deleteWishlistItem(id) {
            if (!confirm('Delete this wishlist item?')) return;
            await removeWishlistById(id);
            showToast('🗑️ Wishlist item deleted');
        }

        async function removeWishlistById(id) {
            const db = await getDB();
            const idx = (db.wishlist || []).findIndex(w => w.id === id);
            if (idx === -1) return;

            const deletedAt = new Date().toISOString();
            const deleted = { ...db.wishlist[idx], deletedAt, lastModified: Date.now() };
            db.wishlist[idx] = deleted;
            db.undo_log = db.undo_log || [];
            db.undo_log.push({
                id: `undo_${Date.now().toString(36)}`,
                entityType: 'wishlist',
                entityId: id,
                deletedAt,
                payload: deleted
            });

            rawWishlist = db.wishlist.filter(w => !w.deletedAt);
            await saveDB(db);
            undoLog = db.undo_log;
            await loadAndRenderWishlist();
            await refreshLinkedPanels({ refreshPlanning: true });
        }

        function ensureOptionalCategory(selectEl) {
            const exists = Array.from(selectEl.options).some(o => o.value === '');
            if (!exists) {
                const placeholder = document.createElement('option');
                placeholder.value = '';
                placeholder.innerText = 'Select category';
                selectEl.insertBefore(placeholder, selectEl.firstChild);
            }
        }

        function convertWishlistToExpense(id) {
            const item = (window.allDecryptedWishlist || []).find(w => w.id === id);
            if (!item) return;

            wishlistConvertId = id;
            openTransactionModal(null, { fromWishlist: true });

            document.getElementById('t-id').value = '';
            document.getElementById('t-desc').value = item.desc || '';
            document.getElementById('t-quantity').value = item.quantity || 1;

            if (item.originalCurrency && item.originalAmt) {
                document.getElementById('t-amount').value = item.originalAmt;
                document.getElementById('t-currency').value = item.originalCurrency;
            } else if (item.amt) {
                document.getElementById('t-amount').value = item.amt;
                document.getElementById('t-currency').value = 'PHP';
            } else {
                document.getElementById('t-amount').value = '';
                document.getElementById('t-currency').value = 'PHP';
            }

            const cat = document.getElementById('t-category');
            if (item.category) {
                cat.value = item.category;
            } else {
                ensureOptionalCategory(cat);
                cat.value = '';
            }

            setTType('expense');
            document.getElementById('t-date').value = new Date().toISOString().split('T')[0];
            document.getElementById('t-notes').value = item.notes || '';
            updateConversionPreview();

            const missing = [];
            if (!item.amt) missing.push('amount');
            if (!item.category) missing.push('category');
            if (missing.length) {
                showToast(`Complete: ${missing.join(', ')}`);
            }
        }

        function collectionKeyFromDeleteType(col) {
            if (col === 'transactions') return 'transactions';
            if (col === 'bills') return 'bills';
            if (col === 'debts') return 'debts';
            if (col === 'lent') return 'lent';
            if (col === 'crypto') return 'crypto';
            if (col === 'wishlist') return 'wishlist';
            return null;
        }

        async function undoLastDelete() {
            const db = await getDB();
            db.undo_log = db.undo_log || [];
            if (db.undo_log.length === 0) {
                showToast('ℹ️ Nothing to undo');
                return;
            }

            const latest = db.undo_log[db.undo_log.length - 1];
            const key = collectionKeyFromDeleteType(latest.entityType);
            if (!key) {
                db.undo_log.pop();
                await saveDB(db);
                showToast('⚠️ Could not restore item');
                return;
            }

            const targetCollection = db[key] || [];
            const existingIdx = targetCollection.findIndex(x => x.id === latest.entityId);
            if (existingIdx >= 0) {
                targetCollection[existingIdx] = {
                    ...targetCollection[existingIdx],
                    ...latest.payload,
                    deletedAt: null,
                    lastModified: Date.now()
                };
            } else {
                targetCollection.push({
                    ...latest.payload,
                    deletedAt: null,
                    lastModified: Date.now()
                });
            }

            if (latest.entityType === 'bills' && latest.meta?.removedReminders?.length) {
                db.recurring_transactions = db.recurring_transactions || [];
                latest.meta.removedReminders.forEach(r => {
                    const exists = db.recurring_transactions.some(x => x.id === r.id);
                    if (!exists) db.recurring_transactions.push(r);
                });
            }

            db[key] = targetCollection;
            db.undo_log.pop();
            await saveDB(db);
            undoLog = db.undo_log;

            showToast('↩️ Restored last deleted item');
            await loadFromStorage();
        }

        async function deleteItem(col, id, confirmMessage) {
            if (!confirm(confirmMessage || "Are you sure?")) return;
            const db = await getDB();
            const key = collectionKeyFromDeleteType(col);
            if (!key) return;
            const targetCollection = db[key] || [];
            const idx = targetCollection.findIndex(item => item.id === id);
            if (idx === -1) return;

            const deletedAt = new Date().toISOString();
            const deletedEntry = {
                ...targetCollection[idx],
                deletedAt,
                lastModified: Date.now()
            };
            targetCollection[idx] = deletedEntry;

            const undoEntry = {
                id: `undo_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
                entityType: col,
                entityId: id,
                deletedAt,
                payload: deletedEntry
            };

            if (col === 'bills') {
                // AUTO-SYNC: Remove corresponding reminder
                const removedReminders = recurringTransactions.filter(r => r.linkedBillId === id);
                recurringTransactions = recurringTransactions.filter(r => r.linkedBillId !== id);
                db.recurring_transactions = recurringTransactions;
                undoEntry.meta = { removedReminders };
            }

            db[key] = targetCollection;
            if (col === 'crypto' && typeof syncCryptoBuyExpensesInDB === 'function') {
                await syncCryptoBuyExpensesInDB(db);
            }
            db.undo_log = db.undo_log || [];
            db.undo_log.push(undoEntry);
            const persistedDB = await saveDB(db);
            undoLog = persistedDB.undo_log || [];

            if (col === 'transactions') {
                rawTransactions = (persistedDB.transactions || []).filter(t => !t.deletedAt);
                await loadAndRender();
                await renderDebts(rawDebts); // Update debt progress if a payment was deleted
                await renderCreditCards(rawCreditCards);
            } else if (col === 'bills') {
                rawBills = (persistedDB.bills || []).filter(b => !b.deletedAt);
                recurringTransactions = persistedDB.recurring_transactions || recurringTransactions;
                await renderBills(rawBills);
                checkRecurringReminders(); // Update reminder banner
                await refreshLinkedPanels({ refreshMonthlyClose: true });
            } else if (col === 'debts') {
                rawDebts = (persistedDB.debts || []).filter(d => !d.deletedAt);
                await renderDebts(rawDebts);
                populateBudgetInputs();
                refreshTransactionCategorySelect();
                await refreshLinkedPanels({
                    refreshKPI: true,
                    refreshForecast: true,
                    refreshStatements: true
                });
            } else if (col === 'lent') {
                rawLent = (persistedDB.lent || []).filter(l => !l.deletedAt);
                await renderLent(rawLent);
                refreshTransactionCategorySelect();
                await refreshLinkedPanels({
                    refreshKPI: true,
                    refreshStatements: true
                });
            } else if (col === 'crypto') {
                await loadFromStorage();
            } else if (col === 'wishlist') {
                rawWishlist = (persistedDB.wishlist || []).filter(w => !w.deletedAt);
                await loadAndRenderWishlist();
                await refreshLinkedPanels({ refreshPlanning: true });
            }
        }

        function toggleCurrency() {
            // Cycle through PHP → USD → JPY → PHP
            if (activeCurrency === 'PHP') {
                activeCurrency = 'USD';
            } else if (activeCurrency === 'USD') {
                activeCurrency = 'JPY';
            } else {
                activeCurrency = 'PHP';
            }

            const symbols = { PHP: '₱', USD: '$', JPY: '¥' };
            document.getElementById('active-currency').innerText = `${activeCurrency} (${symbols[activeCurrency]})`;

            loadAndRender();
            renderBills(rawBills);
            renderDebts(rawDebts);
            renderCreditCards(rawCreditCards);
            renderLent(rawLent);
            renderCryptoWidget(); // Update crypto summary
            if (!document.getElementById('crypto-portfolio-modal').classList.contains('hidden')) {
                renderCryptoPortfolio();
            }
        }

        function fmt(val) {
            // Val is always in PHP, convert to active currency
            const converted = convertToDisplayCurrency(val, 'PHP', activeCurrency);
            return formatCurrency(converted, activeCurrency);
        }

        // Preview currency conversion
        function updateConversionPreview() {
            const amount = parseFloat(document.getElementById('t-amount').value);
            const currency = document.getElementById('t-currency').value;
            const preview = document.getElementById('amount-converted-preview');

            if (!amount || isNaN(amount)) {
                preview.innerText = '';
                return;
            }

            if (currency === activeCurrency) {
                preview.innerText = '';
            } else {
                const converted = convertToDisplayCurrency(amount, currency, activeCurrency);
                preview.innerText = `≈ ${formatCurrency(converted, activeCurrency)} in ${activeCurrency}`;
            }
        }

        // Convert from one currency to another
        function convertToDisplayCurrency(amount, fromCurrency, toCurrency) {
            if (fromCurrency === toCurrency) return amount;

            // Convert to PHP first (base currency)
            let inPHP = amount;
            if (fromCurrency !== 'PHP') {
                inPHP = amount / exchangeRates[fromCurrency];
            }

            // Then convert to target currency
            if (toCurrency === 'PHP') {
                return inPHP;
            } else {
                return inPHP * exchangeRates[toCurrency];
            }
        }

        // Format currency with symbol
        function formatCurrency(amount, currency) {
            const symbols = { PHP: '₱', USD: '$', JPY: '¥' };
            const decimals = currency === 'JPY' ? 0 : 2;
            return symbols[currency] + amount.toLocaleString(undefined, {
                minimumFractionDigits: decimals,
                maximumFractionDigits: decimals
            });
        }

        function toggleModal(id) { document.getElementById(id).classList.toggle('hidden'); }
