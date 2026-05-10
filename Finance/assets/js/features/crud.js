        // =============================================
        // SECTION 7: CRUD OPERATIONS
        // =============================================
        let wishlistConvertId = null;
        const pendingBillPauseToggles = new Set();
        const financeConfirmState = {
            resolve: null
        };
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

        function getFinanceDeleteLabel(collection) {
            const labels = {
                transactions: 'transaction',
                bills: 'bill',
                debts: 'debt',
                credit_cards: 'credit card',
                creditCards: 'credit card',
                installment_plans: 'installment / BNPL plan',
                lent: 'lent record',
                wishlist: 'wishlist item',
                reminders: 'reminder'
            };
            return labels[collection] || 'item';
        }

        function setFinanceConfirmTone(button, tone = 'danger') {
            if (!button) return;
            const toneClassName = tone === 'neutral'
                ? 'flex-1 py-3.5 bg-slate-700 text-white rounded-2xl font-bold hover:bg-slate-800 shadow-lg shadow-slate-200'
                : 'flex-1 py-3.5 bg-rose-600 text-white rounded-2xl font-bold hover:bg-rose-700 shadow-lg shadow-rose-200';
            button.className = toneClassName;
        }

        async function showFinanceConfirmModal(options = {}) {
            const modal = document.getElementById('finance-confirm-modal');
            const titleEl = document.getElementById('finance-confirm-title');
            const messageEl = document.getElementById('finance-confirm-message');
            const cancelBtn = document.getElementById('finance-confirm-cancel-btn');
            const confirmBtn = document.getElementById('finance-confirm-accept-btn');
            const fallbackMessage = String(options.message || options.title || 'Are you sure?').trim() || 'Are you sure?';

            if (!modal || !titleEl || !messageEl || !cancelBtn || !confirmBtn) {
                return window.confirm(fallbackMessage);
            }

            if (financeConfirmState.resolve) {
                financeConfirmState.resolve(false);
                financeConfirmState.resolve = null;
            }

            titleEl.textContent = String(options.title || 'Confirm Action').trim() || 'Confirm Action';
            messageEl.textContent = fallbackMessage;
            cancelBtn.textContent = String(options.cancelLabel || 'Cancel').trim() || 'Cancel';
            confirmBtn.textContent = String(options.confirmLabel || 'Continue').trim() || 'Continue';
            setFinanceConfirmTone(confirmBtn, options.tone || 'danger');

            modal.classList.remove('hidden');
            if (window.lucide) window.lucide.createIcons();

            window.setTimeout(() => {
                confirmBtn.focus();
            }, 0);

            return await new Promise(resolve => {
                financeConfirmState.resolve = resolve;
            });
        }

        function closeFinanceConfirmModal(confirmed = false) {
            const modal = document.getElementById('finance-confirm-modal');
            if (modal) {
                modal.classList.add('hidden');
            }

            const resolve = financeConfirmState.resolve;
            financeConfirmState.resolve = null;
            if (typeof resolve === 'function') {
                resolve(confirmed === true);
            }
        }

        function getDeleteItemConfirmOptions(collection, confirmMessage = '') {
            const itemLabel = getFinanceDeleteLabel(collection);
            const customMessage = String(confirmMessage || '').trim();

            if (collection === 'bills') {
                return {
                    title: 'Delete bill?',
                    message: customMessage || 'This bill will be removed from the Bills card.\nIts linked auto-synced reminder will be removed too.',
                    confirmLabel: 'Delete Bill',
                    cancelLabel: 'Keep Bill',
                    tone: 'danger'
                };
            }

            return {
                title: `Delete ${itemLabel}?`,
                message: customMessage || `This ${itemLabel} will be moved to undo history.`,
                confirmLabel: `Delete ${itemLabel.charAt(0).toUpperCase()}${itemLabel.slice(1)}`,
                cancelLabel: `Keep ${itemLabel.charAt(0).toUpperCase()}${itemLabel.slice(1)}`,
                tone: 'danger'
            };
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

                if (item.type === 'debt_increase' || item.type === 'credit_card_payment' || item.type === 'installment_payment' || !categoryExists) {
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

        function toISODateFromInputValue(dateValue) {
            if (typeof dateValue === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateValue.trim())) {
                return `${dateValue.trim()}T12:00:00.000Z`;
            }
            return new Date().toISOString();
        }

        function refreshDebtBorrowDateUI() {
            const toggle = document.getElementById('d-track-borrow-date');
            const wrap = document.getElementById('d-borrow-date-wrap');
            const dateInput = document.getElementById('d-borrow-date');
            const enabled = !!toggle?.checked;

            if (wrap) {
                wrap.classList.toggle('hidden', !enabled);
            }
            if (dateInput) {
                dateInput.disabled = !enabled;
            }
        }

        function getDateInputValue(value) {
            const raw = String(value || '').trim();
            const matched = raw.match(/^\d{4}-\d{2}-\d{2}/);
            if (matched) return matched[0];
            return new Date().toISOString().split('T')[0];
        }

        function refreshUpdateDebtBorrowDateUI() {
            const toggle = document.getElementById('ud-edit-track-borrow-date');
            const wrap = document.getElementById('ud-edit-borrow-date-wrap');
            const dateInput = document.getElementById('ud-edit-borrow-date');
            const enabled = !!toggle?.checked;

            if (wrap) {
                wrap.classList.toggle('hidden', !enabled);
            }
            if (dateInput) {
                dateInput.disabled = !enabled;
            }
        }

        function refreshDebtTransactionBorrowUI() {
            const type = document.getElementById('ud-type')?.value;
            const wrap = document.getElementById('ud-track-income-wrap');
            const toggle = document.getElementById('ud-track-income');

            if (!wrap || !toggle) return;

            const isLoan = type === 'loan';
            wrap.classList.toggle('hidden', !isLoan);
            wrap.classList.toggle('flex', isLoan);

            if (!isLoan) {
                toggle.checked = false;
            }
        }

        async function createDebtBorrowTransaction({
            db,
            debtId = '',
            category,
            amount,
            dateISO,
            desc,
            notes = '',
            countAsCashReceived = false,
            isInitialPrincipal = false
        }) {
            if (!db || !category || !Number.isFinite(Number(amount)) || Number(amount) <= 0) return;

            const encrypted = await encryptData({
                desc,
                merchant: null,
                tags: [],
                amt: Number(amount),
                quantity: 1,
                type: 'debt_increase',
                category,
                paymentSource: 'cash',
                creditCardId: null,
                creditCardName: null,
                date: dateISO,
                notes,
                debtId: debtId || null,
                debtBorrowTracked: countAsCashReceived,
                debtPrincipalSeed: isInitialPrincipal,
                importId: null,
                dedupeHash: null,
                deletedAt: null
            });

            db.transactions = Array.isArray(db.transactions) ? db.transactions : [];
            db.transactions.push({
                id: generateFinanceRecordId('tx_'),
                data: encrypted,
                createdAt: Date.now(),
                deletedAt: null
            });
        }

        function isDebtLedgerTransaction(tx) {
            return tx?.type === 'expense' || tx?.type === 'income' || tx?.type === 'debt_increase';
        }

        function getDebtActivityTransactions(debtId, debtName) {
            const normalizedName = String(debtName || '').trim();
            const normalizedDebtId = String(debtId || '').trim();
            return (window.allDecryptedTransactions || []).filter(tx => {
                if (!tx || !isDebtLedgerTransaction(tx)) return false;
                const txDebtId = String(tx.debtId || '').trim();
                const txCategory = String(tx.category || '').trim();
                return (normalizedDebtId && txDebtId === normalizedDebtId) || (normalizedName && txCategory === normalizedName);
            });
        }

        function renderDebtPaymentHistory(debt) {
            const summaryEl = document.getElementById('ud-summary');
            const metaEl = document.getElementById('ud-payment-history-meta');
            const listEl = document.getElementById('ud-payment-history');
            if (!summaryEl || !metaEl || !listEl || !debt) return;

            const activityTransactions = getDebtActivityTransactions(debt.id, debt.name);
            const aggregates = typeof buildDebtAndLentAggregates === 'function'
                ? buildDebtAndLentAggregates(activityTransactions)
                : { debtPaidByCategory: {}, debtBorrowedByCategory: {} };
            const debtName = String(debt.name || '').trim();
            const paid = Number(aggregates.debtPaidByCategory?.[debtName] || 0);
            const borrowedMore = Number(aggregates.debtBorrowedByCategory?.[debtName] || 0);
            const totalDebt = Math.max(0, Number(debt.amount) || 0) + borrowedMore;
            const remaining = Math.max(0, totalDebt - paid);
            const paymentRows = activityTransactions
                .filter(tx => tx.type === 'expense')
                .sort(compareRecentMovementTransactions);

            summaryEl.textContent = `Paid ${fmt(paid)} of ${fmt(totalDebt)} • ${fmt(remaining)} left`;
            metaEl.textContent = paymentRows.length
                ? `${paymentRows.length} payment${paymentRows.length === 1 ? '' : 's'} recorded`
                : 'No payments yet.';

            if (!paymentRows.length) {
                listEl.innerHTML = '<div class="text-sm text-slate-400 text-center py-6">No debt payments recorded yet.</div>';
                return;
            }

            listEl.innerHTML = paymentRows.map(tx => {
                const safeDesc = escapeHTML(tx.desc || `Repayment for ${debtName}`);
                const safeDate = escapeHTML(new Date(tx.date).toLocaleDateString());
                return `
                    <div class="flex items-center justify-between gap-3 p-3 bg-white border border-slate-200 rounded-2xl">
                        <div>
                            <p class="text-sm font-bold text-slate-700">${safeDesc}</p>
                            <p class="text-[11px] uppercase tracking-wider text-slate-400 font-bold">Paid ${safeDate}</p>
                        </div>
                        <p class="text-sm font-black text-rose-600">-${fmt(tx.amt)}</p>
                    </div>
                `;
            }).join('');
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

        async function openElectricityCycleModal(billId, cycleId = null, options = {}) {
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
            const defaultStatus = options.status === 'paid' ? 'paid' : (cycle?.status || 'unpaid');
            document.getElementById('electricity-cycle-status').value = defaultStatus;
            document.getElementById('electricity-cycle-paid-by').value = options.paidBy === 'family_other' ? 'family_other' : (cycle?.paidBy || 'me');
            document.getElementById('electricity-cycle-paid-at').value = cycle?.paidAt
                ? String(cycle.paidAt).slice(0, 10)
                : (options.paidAt || new Date().toISOString().slice(0, 10));
            document.getElementById('electricity-cycle-notes').value = cycle?.notes || '';
            onElectricityCycleStatusChange();
            modal.classList.remove('hidden');
        }

        async function openBillPaymentTrigger(billId) {
            const resolved = await getNormalizedBillPayloadById(billId);
            if (!resolved) {
                alert('Could not load this bill.');
                return;
            }

            const bill = resolved.bill;
            if (bill.billType === 'electricity') {
                const currentMonth = new Date().toISOString().slice(0, 7);
                const currentCycle = (bill.electricityHistory || []).find(cycle => cycle.billingMonth === currentMonth);
                await openElectricityCycleModal(billId, currentCycle?.id || null, {
                    status: 'paid',
                    paidBy: 'me',
                    paidAt: new Date().toISOString().slice(0, 10)
                });
                return;
            }

            openTransactionModal();
            document.getElementById('t-desc').value = bill.name || 'Bill payment';
            document.getElementById('t-category').value = 'Bills';
            setTType('expense');
            setTPaymentSource('cash');
            document.getElementById('t-date').value = new Date().toISOString().split('T')[0];

            if (Number.isFinite(Number(bill.amt)) && Number(bill.amt) > 0) {
                document.getElementById('t-amount').value = Number(bill.amt).toFixed(2);
                updateConversionPreview();
                showToast(`💡 Estimated: ${fmt(bill.amt)} (you can adjust)`);
            }

            window.setTimeout(() => {
                const amountField = document.getElementById('t-amount');
                if (!amountField) return;
                amountField.focus();
                amountField.select();
            }, 100);
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
            const saveButton = document.getElementById('b-save-btn');
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
                        if (saveButton) saveButton.innerText = 'Save Bill Changes';
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
            if (saveButton) saveButton.innerText = 'Add Bill';
            bId.value = "";
            name.value = "";
            day.value = "";
            amt.value = "";
            paused.checked = false;
            billType.value = 'standard';
            setBillTypeUIState(null);
            modal.classList.remove('hidden');
        }

        function getTrackedInstallmentPlans() {
            return Array.isArray(window.allDecryptedInstallmentPlans) ? window.allDecryptedInstallmentPlans : [];
        }

        function findTrackedInstallmentPlan(planId) {
            return getTrackedInstallmentPlans().find(plan => plan && plan.id === planId) || null;
        }

        function normalizeInstallmentHistoricalPayments(payments = []) {
            return (Array.isArray(payments) ? payments : [])
                .map(payment => {
                    const amount = Math.max(0, Number(payment?.amount || 0));
                    if (!Number.isFinite(amount) || amount <= 0) return null;
                    return {
                        id: String(payment.id || generateFinanceRecordId('iph_')),
                        amount,
                        feeAmount: Math.max(0, Number(payment?.feeAmount || 0)),
                        date: String(payment.date || new Date().toISOString()).trim(),
                        dueDate: String(payment.dueDate || payment.date || '').slice(0, 10),
                        installmentNumber: Math.max(0, Math.round(Number(payment.installmentNumber || 0))),
                        notes: String(payment.notes || '').trim(),
                        createdAt: payment.createdAt || new Date().toISOString()
                    };
                })
                .filter(Boolean)
                .sort((a, b) => Date.parse(b.date || b.createdAt || '') - Date.parse(a.date || a.createdAt || ''));
        }

        function getInstallmentDateKey(value) {
            const raw = String(value || '').trim();
            const matched = raw.match(/^\d{4}-\d{2}-\d{2}/);
            if (matched) return matched[0];
            return new Date().toISOString().slice(0, 10);
        }

        function getInstallmentLocalDate(value) {
            const key = getInstallmentDateKey(value);
            return new Date(`${key}T12:00:00`);
        }

        function getInstallmentDaysInMonth(year, monthIndex) {
            return new Date(year, monthIndex + 1, 0).getDate();
        }

        function makeInstallmentDueDate(year, monthIndex, dueDay) {
            const day = Math.min(Math.max(1, Math.round(Number(dueDay || 1))), getInstallmentDaysInMonth(year, monthIndex));
            return new Date(year, monthIndex, day, 12, 0, 0, 0);
        }

        function buildInstallmentPaymentSchedule(plan) {
            const normalized = normalizeInstallmentPlanInput(plan);
            const count = Math.max(0, Math.round(Number(normalized.installmentCount || 0)));
            const dueDay = Number(normalized.dueDay || 0);
            if (!count || !dueDay) return [];

            const startDate = getInstallmentLocalDate(normalized.startDate);
            let firstDue = makeInstallmentDueDate(startDate.getFullYear(), startDate.getMonth(), dueDay);
            if (firstDue < startDate) {
                firstDue = makeInstallmentDueDate(startDate.getFullYear(), startDate.getMonth() + 1, dueDay);
            }

            const monthlyAmount = normalized.monthlyAmount > 0
                ? normalized.monthlyAmount
                : (normalized.totalAmount > 0 ? normalized.totalAmount / count : 0);
            const feePerPayment = count > 0
                ? Math.min(monthlyAmount, Math.max(0, Number(normalized.feeTotal || 0)) / count)
                : 0;
            const todayKey = new Date().toISOString().slice(0, 10);
            const historicalPayments = normalizeInstallmentHistoricalPayments(normalized.historicalPayments);
            const historicalKeys = new Set(historicalPayments.map(payment => payment.dueDate || getInstallmentDateKey(payment.date)));
            const normalPaymentKeys = new Set((window.allDecryptedTransactions || [])
                .filter(tx => tx && tx.type === 'installment_payment' && String(tx.installmentPlanId || '').trim() === String(plan?.id || '').trim())
                .map(tx => getInstallmentDateKey(tx.date)));

            return Array.from({ length: count }, (_, index) => {
                const dueDate = makeInstallmentDueDate(firstDue.getFullYear(), firstDue.getMonth() + index, dueDay);
                const dueDateKey = dueDate.toISOString().slice(0, 10);
                const isFuture = dueDateKey > todayKey;
                const isRecorded = historicalKeys.has(dueDateKey) || normalPaymentKeys.has(dueDateKey);
                return {
                    installmentNumber: index + 1,
                    dueDateKey,
                    amount: monthlyAmount,
                    feeAmount: feePerPayment,
                    isFuture,
                    isRecorded
                };
            });
        }

        function renderInstallmentPreviousPaymentSchedule(plan) {
            const wrap = document.getElementById('ip-payment-schedule-wrap');
            const list = document.getElementById('ip-payment-schedule-list');
            const meta = document.getElementById('ip-payment-schedule-meta');
            if (!wrap || !list || !meta) return;

            const schedule = buildInstallmentPaymentSchedule(plan);
            const availableRows = schedule.filter(row => !row.isFuture && !row.isRecorded);
            meta.textContent = `${availableRows.length} available`;

            if (!schedule.length) {
                list.innerHTML = '<div class="text-xs text-violet-500 text-center py-4">Set start date, due day, and number of payments first.</div>';
                return;
            }

            list.innerHTML = schedule.map(row => {
                const disabled = row.isFuture || row.isRecorded;
                const checked = !disabled;
                const label = row.isRecorded ? 'Recorded' : (row.isFuture ? 'Future' : 'Ready');
                const labelClass = row.isRecorded
                    ? 'bg-emerald-100 text-emerald-700'
                    : (row.isFuture ? 'bg-slate-100 text-slate-500' : 'bg-violet-100 text-violet-700');
                const dateLabel = new Date(`${row.dueDateKey}T12:00:00`).toLocaleDateString();

                return `
                    <label class="flex items-center justify-between gap-3 rounded-xl border ${disabled ? 'border-slate-100 bg-white/60 opacity-70' : 'border-violet-100 bg-white'} px-3 py-2">
                        <span class="flex items-center gap-3 min-w-0">
                            <input type="checkbox"
                                class="ip-previous-payment-checkbox w-4 h-4 rounded border-slate-300 text-violet-600 focus:ring-violet-500"
                                data-installment-number="${row.installmentNumber}"
                                data-due-date="${escapeAttr(row.dueDateKey)}"
                                data-amount="${Number(row.amount || 0)}"
                                data-fee-amount="${Number(row.feeAmount || 0)}"
                                ${checked ? 'checked' : ''}
                                ${disabled ? 'disabled' : ''}>
                            <span class="min-w-0">
                                <span class="block text-xs font-bold text-slate-700">#${row.installmentNumber} • ${escapeHTML(dateLabel)}</span>
                                <span class="block text-[10px] text-slate-400">${fmt(row.amount)}${row.feeAmount > 0 ? ` • fee ${fmt(row.feeAmount)}` : ''}</span>
                            </span>
                        </span>
                        <span class="text-[10px] px-2 py-0.5 rounded-full font-bold ${labelClass}">${label}</span>
                    </label>
                `;
            }).join('');
        }

        function normalizeInstallmentPlanInput(source = {}) {
            const totalAmount = Math.max(0, Number(source.totalAmount || 0));
            const feeTotal = Math.max(0, Number(source.feeTotal || source.totalFees || 0));
            const installmentCount = Math.max(0, Math.round(Number(source.installmentCount || 0)));
            const rawMonthlyAmount = Number(source.monthlyAmount || 0);
            const monthlyAmount = rawMonthlyAmount > 0
                ? rawMonthlyAmount
                : (totalAmount > 0 && installmentCount > 0 ? totalAmount / installmentCount : 0);
            const rawDueDay = Number(source.dueDay || 0);
            const dueDay = Number.isFinite(rawDueDay) && rawDueDay > 0
                ? Math.max(1, Math.min(31, Math.round(rawDueDay)))
                : null;

            return {
                name: String(source.name || '').trim(),
                provider: String(source.provider || '').trim(),
                totalAmount,
                feeTotal,
                installmentCount,
                monthlyAmount,
                dueDay,
                startDate: String(source.startDate || '').trim() || new Date().toISOString().slice(0, 10),
                notes: String(source.notes || '').trim(),
                historicalPayments: normalizeInstallmentHistoricalPayments(source.historicalPayments),
                createdAt: source.createdAt || new Date().toISOString()
            };
        }

        async function ensureInstallmentCategory(db) {
            const categoryName = 'Installments/BNPL';
            const existing = getUniqueCategoryList([...(db.custom_categories || []), ...customCategories])
                .some(name => String(name || '').toLowerCase() === categoryName.toLowerCase());
            if (!existing) {
                customCategories.push(categoryName);
                db.custom_categories = getUniqueCategoryList([...(db.custom_categories || []), categoryName]);
            }
        }

        function openDebtModal() {
            document.getElementById('d-name').value = '';
            document.getElementById('d-amount').value = '';
            document.getElementById('d-track-borrow-date').checked = false;
            document.getElementById('d-borrow-date').value = new Date().toISOString().split('T')[0];
            refreshDebtBorrowDateUI();
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
            let previousCardName = '';

            if (id) {
                const idx = db.credit_cards.findIndex(card => card.id === id);
                if (idx !== -1) {
                    const existing = db.credit_cards[idx] || {};
                    const existingData = existing?.data ? await decryptData(existing.data) : null;
                    previousCardName = String(existingData?.name || '').trim();
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

            if (id && previousCardName && previousCardName !== name) {
                db.transactions = Array.isArray(db.transactions) ? db.transactions : [];

                for (let i = 0; i < db.transactions.length; i++) {
                    const rawTx = db.transactions[i];
                    if (!rawTx || rawTx.deletedAt) continue;

                    const decrypted = await decryptData(rawTx.data);
                    if (!decrypted) continue;

                    const txCardId = String(decrypted.creditCardId || '').trim();
                    const txCardName = String(decrypted.creditCardName || '').trim();
                    const isLinkedById = txCardId && txCardId === id;
                    const isLegacyNameMatch = !txCardId && txCardName === previousCardName;
                    if (!isLinkedById && !isLegacyNameMatch) continue;

                    const updatedTx = {
                        ...decrypted,
                        creditCardId: txCardId || id,
                        creditCardName: name
                    };

                    if (decrypted.type === 'credit_card_payment') {
                        if (String(decrypted.category || '').trim() === previousCardName) {
                            updatedTx.category = name;
                        }
                        if (String(decrypted.desc || '').trim() === `Payment for ${previousCardName}`) {
                            updatedTx.desc = `Payment for ${name}`;
                        }
                    }

                    db.transactions[i] = {
                        ...rawTx,
                        data: await encryptData(updatedTx),
                        lastModified: Date.now(),
                        deletedAt: rawTx.deletedAt || null
                    };
                }
            }

            if (typeof syncCreditCardToReminder === 'function') {
                await syncCreditCardToReminder(cardId, name, paymentDueDay, {
                    persist: false,
                    paused: paymentReminderPaused
                });
                db.recurring_transactions = recurringTransactions;
            }

            const persistedDB = await saveDB(db);
            rawCreditCards = (db.credit_cards || []).filter(card => !card.deletedAt);
            rawTransactions = (persistedDB.transactions || db.transactions || []).filter(t => !t.deletedAt);
            toggleModal('credit-card-modal');
            await loadAndRender();
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

        async function openInstallmentPlanModal(id = null) {
            const modal = document.getElementById('installment-plan-modal');
            const title = document.getElementById('ip-modal-title');
            const planId = document.getElementById('ip-id');
            const name = document.getElementById('ip-name');
            const provider = document.getElementById('ip-provider');
            const totalAmount = document.getElementById('ip-total-amount');
            const feeTotal = document.getElementById('ip-fee-total');
            const installmentCount = document.getElementById('ip-installment-count');
            const monthlyAmount = document.getElementById('ip-monthly-amount');
            const dueDay = document.getElementById('ip-due-day');
            const startDate = document.getElementById('ip-start-date');
            const notes = document.getElementById('ip-notes');

            if (id) {
                const raw = rawInstallmentPlans.find(plan => plan.id === id);
                if (raw) {
                    const data = await decryptData(raw.data);
                    if (data) {
                        const plan = normalizeInstallmentPlanInput(data);
                        title.innerText = 'Edit Installment / BNPL';
                        planId.value = id;
                        name.value = plan.name;
                        provider.value = plan.provider;
                        totalAmount.value = plan.totalAmount > 0 ? plan.totalAmount.toFixed(2) : '';
                        feeTotal.value = plan.feeTotal > 0 ? plan.feeTotal.toFixed(2) : '';
                        installmentCount.value = plan.installmentCount || '';
                        monthlyAmount.value = plan.monthlyAmount > 0 ? plan.monthlyAmount.toFixed(2) : '';
                        dueDay.value = plan.dueDay || '';
                        startDate.value = getDateInputValue(plan.startDate);
                        notes.value = plan.notes;
                        modal.classList.remove('hidden');
                        return;
                    }
                }
            }

            title.innerText = 'Add Installment / BNPL';
            planId.value = '';
            name.value = '';
            provider.value = '';
            totalAmount.value = '';
            feeTotal.value = '';
            installmentCount.value = '';
            monthlyAmount.value = '';
            dueDay.value = '';
            startDate.value = new Date().toISOString().slice(0, 10);
            notes.value = '';
            modal.classList.remove('hidden');
        }

        async function saveInstallmentPlan() {
            const id = document.getElementById('ip-id').value;
            const nextPlan = normalizeInstallmentPlanInput({
                name: document.getElementById('ip-name').value,
                provider: document.getElementById('ip-provider').value,
                totalAmount: document.getElementById('ip-total-amount').value,
                feeTotal: document.getElementById('ip-fee-total').value,
                installmentCount: document.getElementById('ip-installment-count').value,
                monthlyAmount: document.getElementById('ip-monthly-amount').value,
                dueDay: document.getElementById('ip-due-day').value,
                startDate: document.getElementById('ip-start-date').value,
                notes: document.getElementById('ip-notes').value
            });

            if (!nextPlan.name || nextPlan.totalAmount <= 0) {
                alert('Enter a plan name and valid total financed amount.');
                return;
            }

            const db = await getDB();
            db.installment_plans = Array.isArray(db.installment_plans) ? db.installment_plans : [];
            db.transactions = Array.isArray(db.transactions) ? db.transactions : [];
            await ensureInstallmentCategory(db);

            let previousPlanName = '';
            let planId = id;

            if (id) {
                const idx = db.installment_plans.findIndex(plan => plan.id === id);
                if (idx !== -1) {
                    const existing = db.installment_plans[idx] || {};
                    const existingData = existing?.data ? await decryptData(existing.data) : null;
                    previousPlanName = String(existingData?.name || '').trim();
                    nextPlan.createdAt = existingData?.createdAt || nextPlan.createdAt;
                    nextPlan.historicalPayments = normalizeInstallmentHistoricalPayments(existingData?.historicalPayments);
                    db.installment_plans[idx] = {
                        ...existing,
                        id,
                        data: await encryptData(nextPlan),
                        lastModified: Date.now(),
                        deletedAt: existing.deletedAt || null
                    };
                }
            } else {
                planId = generateFinanceRecordId('ip_');
                db.installment_plans.push({
                    id: planId,
                    data: await encryptData(nextPlan),
                    createdAt: Date.now(),
                    deletedAt: null
                });
            }

            if (id && previousPlanName && previousPlanName !== nextPlan.name) {
                for (let i = 0; i < db.transactions.length; i++) {
                    const rawTx = db.transactions[i];
                    if (!rawTx || rawTx.deletedAt) continue;
                    const decrypted = await decryptData(rawTx.data);
                    if (!decrypted || decrypted.type !== 'installment_payment') continue;
                    if (String(decrypted.installmentPlanId || '').trim() !== id) continue;

                    const updatedTx = {
                        ...decrypted,
                        installmentPlanName: nextPlan.name
                    };
                    if (String(decrypted.desc || '').trim() === `Payment for ${previousPlanName}`) {
                        updatedTx.desc = `Payment for ${nextPlan.name}`;
                    }

                    db.transactions[i] = {
                        ...rawTx,
                        data: await encryptData(updatedTx),
                        lastModified: Date.now(),
                        deletedAt: rawTx.deletedAt || null
                    };
                }
            }

            const persistedDB = await saveDB(db);
            rawInstallmentPlans = (persistedDB.installment_plans || db.installment_plans || []).filter(plan => !plan.deletedAt);
            rawTransactions = (persistedDB.transactions || db.transactions || []).filter(tx => !tx.deletedAt);
            toggleModal('installment-plan-modal');
            await loadAndRender();
            await renderInstallmentPlans(rawInstallmentPlans);
            refreshTransactionCategorySelect();
            await refreshLinkedPanels({
                refreshKPI: true,
                refreshForecast: true,
                refreshStatements: true
            });
            showToast(id ? '✅ Installment plan updated' : '✅ Installment plan added');
        }

        function openInstallmentPaymentModal(id, options = {}) {
            const plan = findTrackedInstallmentPlan(id);
            if (!plan) return;

            const recordOnly = options.recordOnly === true;
            document.getElementById('ip-payment-plan-id').value = id;
            document.getElementById('ip-payment-mode').value = recordOnly ? 'record_only' : 'normal';
            document.getElementById('ip-payment-title').innerText = recordOnly ? 'Record Previous BNPL Payment' : 'Record BNPL Payment';
            document.getElementById('ip-payment-plan-label').innerText = plan.name || 'Installment plan';
            document.getElementById('ip-payment-amount').value = Number.isFinite(Number(options.amount))
                ? Number(options.amount).toFixed(2)
                : (Number(plan.monthlyAmount || 0) > 0 ? Number(plan.monthlyAmount).toFixed(2) : '');
            document.getElementById('ip-payment-date').value = options.date || new Date().toISOString().split('T')[0];
            document.getElementById('ip-payment-notes').value = options.notes || '';
            document.getElementById('ip-payment-record-note')?.classList.toggle('hidden', !recordOnly);
            document.getElementById('ip-payment-manual-fields')?.classList.toggle('hidden', recordOnly);
            document.getElementById('ip-payment-schedule-wrap')?.classList.toggle('hidden', !recordOnly);
            document.getElementById('ip-payment-save-btn').innerText = recordOnly ? 'Save Previous' : 'Save Payment';
            if (recordOnly) {
                renderInstallmentPreviousPaymentSchedule(plan);
            }
            document.getElementById('installment-payment-modal').classList.remove('hidden');
        }

        function getInstallmentBulkPaymentDateKey() {
            const selected = document.getElementById('ip-bulk-payment-date')?.value;
            return getInstallmentDateKey(selected || new Date().toISOString());
        }

        function getInstallmentBulkPaymentRows(filterMode = 'due_today') {
            const plans = getTrackedInstallmentPlans();
            const outstandingMap = typeof computeInstallmentOutstandingMapAsOf === 'function'
                ? computeInstallmentOutstandingMapAsOf(Date.now(), window.allDecryptedTransactions || [])
                : new Map();
            const paymentDateKey = getInstallmentBulkPaymentDateKey();

            return plans
                .map(plan => {
                    const installmentCount = Math.max(1, Math.round(Number(plan.installmentCount || 1)));
                    const totalAmount = Math.max(0, Number(plan.totalAmount || 0));
                    const monthlyAmount = Math.max(0, Number(plan.monthlyAmount || 0)) || (totalAmount > 0 ? totalAmount / installmentCount : 0);
                    const outstanding = Math.max(0, Number(outstandingMap.get(plan.id) || 0));
                    const amount = Math.min(monthlyAmount, outstanding);
                    const feeAmount = Math.min(amount, Math.max(0, Number(plan.feeTotal || 0)) / installmentCount);
                    const schedule = buildInstallmentPaymentSchedule(plan);
                    const dueToday = schedule.some(row => row.dueDateKey === paymentDateKey && !row.isRecorded);

                    return {
                        plan,
                        amount,
                        feeAmount,
                        outstanding,
                        dueToday
                    };
                })
                .filter(row => row.outstanding > 0.01 && row.amount > 0.01)
                .filter(row => filterMode === 'all' || row.dueToday);
        }

        function getInstallmentBulkFilterMode() {
            return document.getElementById('ip-bulk-filter-all')?.checked ? 'all' : 'due_today';
        }

        function setInstallmentBulkFilter(mode = 'due_today') {
            const dueToday = document.getElementById('ip-bulk-filter-due-today');
            const all = document.getElementById('ip-bulk-filter-all');
            if (dueToday) dueToday.checked = mode !== 'all';
            if (all) all.checked = mode === 'all';
            renderInstallmentBulkPaymentList();
        }

        function updateInstallmentBulkPaymentTotal() {
            const total = Array.from(document.querySelectorAll('.ip-bulk-payment-checkbox:checked'))
                .reduce((sum, input) => sum + Math.max(0, Number(input.dataset.amount || 0)), 0);
            const target = document.getElementById('ip-bulk-payment-total');
            if (target) target.textContent = fmt(total);
        }

        function setInstallmentBulkSelection(checked) {
            document.querySelectorAll('.ip-bulk-payment-checkbox:not(:disabled)').forEach(input => {
                input.checked = !!checked;
            });
            updateInstallmentBulkPaymentTotal();
        }

        function renderInstallmentBulkPaymentList() {
            const list = document.getElementById('ip-bulk-payment-list');
            if (!list) return;

            const filterMode = getInstallmentBulkFilterMode();
            const rows = getInstallmentBulkPaymentRows(filterMode);
            const emptyLabel = filterMode === 'all'
                ? 'No active BNPL items with a remaining balance.'
                : 'No active BNPL items due on this payment date.';

            if (!rows.length) {
                list.innerHTML = `<div class="text-center text-xs text-slate-400 py-6">${emptyLabel}</div>`;
                updateInstallmentBulkPaymentTotal();
                return;
            }

            list.innerHTML = rows.map(row => {
                const plan = row.plan || {};
                const provider = String(plan.provider || '').trim();
                const remainingAfter = Math.max(0, row.outstanding - row.amount);
                return `
                    <label class="flex items-start justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 hover:border-emerald-200 transition-colors">
                        <span class="flex items-start gap-3 min-w-0">
                            <input type="checkbox"
                                class="ip-bulk-payment-checkbox mt-1 w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                                data-plan-id="${escapeAttr(plan.id)}"
                                data-amount="${Number(row.amount || 0)}"
                                data-fee-amount="${Number(row.feeAmount || 0)}"
                                onchange="updateInstallmentBulkPaymentTotal()"
                                checked>
                            <span class="min-w-0">
                                <span class="block text-sm font-bold text-slate-800 break-words">${escapeHTML(plan.name || 'Installment Plan')}</span>
                                ${provider ? `<span class="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mt-0.5">${escapeHTML(provider)}</span>` : ''}
                                <span class="block text-[10px] text-slate-500 mt-1">Remaining after this ${fmt(remainingAfter)}</span>
                            </span>
                        </span>
                        <span class="shrink-0 text-right">
                            <span class="block text-sm font-black text-emerald-700">${fmt(row.amount)}</span>
                            ${row.feeAmount > 0 ? `<span class="block text-[10px] text-violet-500 mt-0.5">fee ${fmt(row.feeAmount)}</span>` : ''}
                            ${row.dueToday ? '<span class="inline-block text-[10px] font-bold text-emerald-700 bg-emerald-50 rounded-full px-2 py-0.5 mt-1">Due</span>' : ''}
                        </span>
                    </label>
                `;
            }).join('');

            updateInstallmentBulkPaymentTotal();
        }

        function openInstallmentBulkPaymentModal() {
            const paymentDate = document.getElementById('ip-bulk-payment-date');
            const notes = document.getElementById('ip-bulk-payment-notes');
            if (paymentDate) paymentDate.value = new Date().toISOString().slice(0, 10);
            if (notes) notes.value = '';
            setInstallmentBulkFilter('due_today');
            document.getElementById('installment-bulk-payment-modal')?.classList.remove('hidden');
        }

        function getInstallmentAnalyticsData() {
            const plans = getTrackedInstallmentPlans();
            const transactions = window.allDecryptedTransactions || [];
            const outstandingMap = typeof computeInstallmentOutstandingMapAsOf === 'function'
                ? computeInstallmentOutstandingMapAsOf(Date.now(), transactions)
                : new Map();
            const todayKey = new Date().toISOString().slice(0, 10);
            const weekEndKey = new Date(Date.now() + (7 * 24 * 60 * 60 * 1000)).toISOString().slice(0, 10);
            const monthKey = todayKey.slice(0, 7);

            const summary = {
                totalOriginal: 0,
                outstanding: 0,
                paid: 0,
                monthlyObligation: 0,
                feeTotal: 0,
                feesPaid: 0,
                activeCount: 0,
                completedCount: 0,
                dueToday: 0,
                dueWeek: 0,
                dueMonth: 0
            };
            const upcoming = [];
            const planRows = [];

            plans.forEach(plan => {
                const total = Math.max(0, Number(plan.totalAmount || 0));
                const feeTotal = Math.max(0, Number(plan.feeTotal || 0));
                const installmentCount = Math.max(1, Math.round(Number(plan.installmentCount || 1)));
                const monthlyAmount = Math.max(0, Number(plan.monthlyAmount || 0)) || (total > 0 ? total / installmentCount : 0);
                const outstanding = Math.max(0, Number(outstandingMap.get(plan.id) || 0));
                const paid = Math.max(0, total - outstanding);
                const paymentRows = typeof getInstallmentPaymentTransactions === 'function'
                    ? getInstallmentPaymentTransactions(plan.id)
                    : transactions.filter(tx => tx && tx.type === 'installment_payment' && tx.installmentPlanId === plan.id);
                const historicalPayments = typeof getInstallmentHistoricalPayments === 'function'
                    ? getInstallmentHistoricalPayments(plan)
                    : normalizeInstallmentHistoricalPayments(plan.historicalPayments);
                const feesPaid = historicalPayments.reduce((sum, payment) => sum + Math.max(0, Number(payment.feeAmount || 0)), 0)
                    + paymentRows.reduce((sum, tx) => sum + Math.max(0, Number(tx.installmentFeeAmount || 0)), 0);
                const isActive = outstanding > 0.01;

                summary.totalOriginal += total;
                summary.outstanding += outstanding;
                summary.paid += paid;
                summary.feeTotal += feeTotal;
                summary.feesPaid += feesPaid;
                if (isActive) {
                    summary.activeCount += 1;
                    summary.monthlyObligation += Math.min(monthlyAmount, outstanding);
                } else {
                    summary.completedCount += 1;
                }

                const schedule = buildInstallmentPaymentSchedule(plan);
                schedule
                    .filter(row => !row.isRecorded && isActive)
                    .forEach(row => {
                        if (row.dueDateKey === todayKey) summary.dueToday += 1;
                        if (row.dueDateKey >= todayKey && row.dueDateKey <= weekEndKey) summary.dueWeek += 1;
                        if (row.dueDateKey.slice(0, 7) === monthKey) summary.dueMonth += 1;
                        if (row.dueDateKey >= todayKey) {
                            upcoming.push({
                                planName: plan.name || 'Installment Plan',
                                provider: plan.provider || '',
                                dueDateKey: row.dueDateKey,
                                amount: Math.min(Math.max(0, Number(row.amount || monthlyAmount)), outstanding),
                                feeAmount: Math.max(0, Number(row.feeAmount || 0))
                            });
                        }
                    });

                planRows.push({
                    name: plan.name || 'Installment Plan',
                    provider: plan.provider || '',
                    total,
                    outstanding,
                    paid,
                    monthlyAmount: isActive ? Math.min(monthlyAmount, outstanding) : 0,
                    feeTotal,
                    feesPaid,
                    progressPct: total > 0 ? Math.min(100, Math.max(0, (paid / total) * 100)) : 0,
                    active: isActive
                });
            });

            upcoming.sort((a, b) => String(a.dueDateKey).localeCompare(String(b.dueDateKey)));
            planRows.sort((a, b) => Number(b.outstanding || 0) - Number(a.outstanding || 0));

            return {
                summary,
                upcoming: upcoming.slice(0, 6),
                planRows
            };
        }

        function renderInstallmentAnalyticsDashboard() {
            const target = document.getElementById('installment-analytics-dashboard');
            if (!target) return;

            const data = getInstallmentAnalyticsData();
            const { summary, upcoming, planRows } = data;
            const feeRemaining = Math.max(0, summary.feeTotal - summary.feesPaid);
            const feeBurdenPct = summary.totalOriginal > 0
                ? Math.min(999, (summary.feeTotal / summary.totalOriginal) * 100)
                : 0;

            if (!planRows.length) {
                target.innerHTML = '<div class="text-center text-sm text-slate-400 py-10">No installment or BNPL plans tracked yet.</div>';
                lucide.createIcons();
                return;
            }

            const statCards = [
                { label: 'Outstanding', value: fmt(summary.outstanding), tone: 'text-violet-700 bg-violet-50 border-violet-100' },
                { label: 'Monthly BNPL', value: fmt(summary.monthlyObligation), tone: 'text-emerald-700 bg-emerald-50 border-emerald-100' },
                { label: 'Fees Paid', value: fmt(summary.feesPaid), tone: 'text-amber-700 bg-amber-50 border-amber-100' },
                { label: 'Fees Remaining', value: fmt(feeRemaining), tone: 'text-rose-700 bg-rose-50 border-rose-100' }
            ];

            target.innerHTML = `
                <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    ${statCards.map(card => `
                        <div class="rounded-2xl border ${card.tone} p-4">
                            <p class="text-[10px] font-black uppercase tracking-wider opacity-75">${escapeHTML(card.label)}</p>
                            <p class="text-xl font-black mt-1">${escapeHTML(card.value)}</p>
                        </div>
                    `).join('')}
                </div>

                <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
                    <div class="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <p class="text-[10px] font-black uppercase tracking-wider text-slate-500">Plan Status</p>
                        <div class="mt-3 grid grid-cols-2 gap-2">
                            <div class="rounded-xl bg-white border border-slate-100 p-3">
                                <p class="text-2xl font-black text-slate-800">${summary.activeCount}</p>
                                <p class="text-[10px] font-bold text-slate-400 uppercase">Active</p>
                            </div>
                            <div class="rounded-xl bg-white border border-slate-100 p-3">
                                <p class="text-2xl font-black text-slate-800">${summary.completedCount}</p>
                                <p class="text-[10px] font-bold text-slate-400 uppercase">Complete</p>
                            </div>
                        </div>
                        <p class="text-xs text-slate-500 mt-3">Paid ${fmt(summary.paid)} of ${fmt(summary.totalOriginal)}.</p>
                    </div>

                    <div class="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <p class="text-[10px] font-black uppercase tracking-wider text-slate-500">Due Pressure</p>
                        <div class="mt-3 grid grid-cols-3 gap-2 text-center">
                            <div class="rounded-xl bg-white border border-slate-100 p-3">
                                <p class="text-xl font-black text-emerald-700">${summary.dueToday}</p>
                                <p class="text-[10px] font-bold text-slate-400 uppercase">Today</p>
                            </div>
                            <div class="rounded-xl bg-white border border-slate-100 p-3">
                                <p class="text-xl font-black text-indigo-700">${summary.dueWeek}</p>
                                <p class="text-[10px] font-bold text-slate-400 uppercase">7 Days</p>
                            </div>
                            <div class="rounded-xl bg-white border border-slate-100 p-3">
                                <p class="text-xl font-black text-violet-700">${summary.dueMonth}</p>
                                <p class="text-[10px] font-bold text-slate-400 uppercase">Month</p>
                            </div>
                        </div>
                        <p class="text-xs text-slate-500 mt-3">Counts unpaid scheduled installments.</p>
                    </div>

                    <div class="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <p class="text-[10px] font-black uppercase tracking-wider text-slate-500">Fee Burden</p>
                        <p class="text-3xl font-black text-slate-800 mt-3">${feeBurdenPct.toFixed(1)}%</p>
                        <p class="text-xs text-slate-500 mt-1">${fmt(summary.feeTotal)} tracked fees inside ${fmt(summary.totalOriginal)} total financed.</p>
                    </div>
                </div>

                <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <div class="rounded-2xl border border-slate-200 p-4">
                        <div class="flex items-center justify-between gap-3 mb-3">
                            <p class="text-[10px] font-black uppercase tracking-wider text-slate-500">Upcoming Payments</p>
                            <i data-lucide="calendar-days" class="w-4 h-4 text-slate-400"></i>
                        </div>
                        <div class="space-y-2">
                            ${upcoming.length ? upcoming.map(item => `
                                <div class="flex items-center justify-between gap-3 rounded-xl bg-slate-50 border border-slate-100 px-3 py-2">
                                    <div class="min-w-0">
                                        <p class="text-sm font-bold text-slate-800 break-words">${escapeHTML(item.planName)}</p>
                                        <p class="text-[10px] text-slate-400">${escapeHTML(new Date(`${item.dueDateKey}T12:00:00`).toLocaleDateString())}${item.provider ? ` • ${escapeHTML(item.provider)}` : ''}</p>
                                    </div>
                                    <div class="shrink-0 text-right">
                                        <p class="text-sm font-black text-slate-800">${fmt(item.amount)}</p>
                                        ${item.feeAmount > 0 ? `<p class="text-[10px] text-violet-500">fee ${fmt(item.feeAmount)}</p>` : ''}
                                    </div>
                                </div>
                            `).join('') : '<div class="text-xs text-slate-400 py-4 text-center">No upcoming unpaid installments found.</div>'}
                        </div>
                    </div>

                    <div class="rounded-2xl border border-slate-200 p-4">
                        <div class="flex items-center justify-between gap-3 mb-3">
                            <p class="text-[10px] font-black uppercase tracking-wider text-slate-500">Payoff By Item</p>
                            <i data-lucide="list-checks" class="w-4 h-4 text-slate-400"></i>
                        </div>
                        <div class="space-y-3 max-h-80 overflow-y-auto custom-scrollbar pr-1">
                            ${planRows.map(row => `
                                <div class="rounded-xl bg-slate-50 border border-slate-100 p-3">
                                    <div class="flex items-start justify-between gap-3">
                                        <div class="min-w-0">
                                            <p class="text-sm font-bold text-slate-800 break-words">${escapeHTML(row.name)}</p>
                                            <p class="text-[10px] text-slate-400">${row.provider ? escapeHTML(row.provider) : (row.active ? 'Active' : 'Complete')}</p>
                                        </div>
                                        <p class="text-sm font-black text-slate-800 shrink-0">${fmt(row.outstanding)}</p>
                                    </div>
                                    <div class="mt-3 h-2 bg-slate-200 rounded-full overflow-hidden">
                                        <div class="h-full ${row.active ? 'bg-violet-500' : 'bg-emerald-500'} rounded-full" style="width:${row.progressPct}%"></div>
                                    </div>
                                    <div class="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-slate-500">
                                        <span>${row.progressPct.toFixed(0)}% paid</span>
                                        ${row.monthlyAmount > 0 ? `<span>${fmt(row.monthlyAmount)} next</span>` : ''}
                                        ${row.feeTotal > 0 ? `<span>${fmt(row.feesPaid)} / ${fmt(row.feeTotal)} fees</span>` : ''}
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                </div>
            `;

            lucide.createIcons();
        }

        function openInstallmentAnalyticsModal() {
            renderInstallmentAnalyticsDashboard();
            document.getElementById('installment-analytics-modal')?.classList.remove('hidden');
        }

        async function saveInstallmentBulkPayments() {
            const selectedRows = Array.from(document.querySelectorAll('.ip-bulk-payment-checkbox:checked'))
                .map(input => {
                    const plan = findTrackedInstallmentPlan(input.dataset.planId || '');
                    return {
                        plan,
                        amount: Math.max(0, Number(input.dataset.amount || 0)),
                        feeAmount: Math.max(0, Number(input.dataset.feeAmount || 0))
                    };
                })
                .filter(row => row.plan && row.amount > 0);

            if (!selectedRows.length) {
                alert('Choose at least one BNPL item to pay.');
                return;
            }

            const noteInput = document.getElementById('ip-bulk-payment-notes')?.value.trim() || '';
            const selectedDate = document.getElementById('ip-bulk-payment-date')?.value;
            const date = selectedDate ? new Date(selectedDate).toISOString() : new Date().toISOString();
            const db = await getDB();
            db.transactions = Array.isArray(db.transactions) ? db.transactions : [];
            await ensureInstallmentCategory(db);

            for (const row of selectedRows) {
                const desc = noteInput || `Payment for ${row.plan.name}`;
                const encrypted = await encryptData({
                    desc,
                    merchant: row.plan.provider || null,
                    tags: [],
                    amt: row.amount,
                    originalAmt: row.amount,
                    originalCurrency: 'PHP',
                    quantity: 1,
                    notes: noteInput,
                    type: 'installment_payment',
                    category: 'Installments/BNPL',
                    installmentPlanId: row.plan.id,
                    installmentPlanName: row.plan.name,
                    installmentFeeAmount: row.feeAmount,
                    paymentSource: 'cash',
                    date,
                    importId: null,
                    dedupeHash: null,
                    deletedAt: null
                });

                db.transactions.push({
                    id: generateFinanceRecordId('tx_'),
                    data: encrypted,
                    createdAt: Date.now(),
                    deletedAt: null
                });
            }

            const persistedDB = await saveDB(db);
            rawTransactions = (persistedDB.transactions || db.transactions || []).filter(t => !t.deletedAt);
            toggleModal('installment-bulk-payment-modal');
            await loadAndRender();
            await renderInstallmentPlans(rawInstallmentPlans);
            refreshTransactionCategorySelect();
            await refreshLinkedPanels({
                refreshKPI: true,
                refreshForecast: true,
                refreshStatements: true
            });
            showToast(`✅ ${selectedRows.length} BNPL payment${selectedRows.length === 1 ? '' : 's'} recorded`);
        }

        async function saveInstallmentPayment() {
            const planId = document.getElementById('ip-payment-plan-id').value;
            const plan = findTrackedInstallmentPlan(planId);
            const amount = parseFloat(document.getElementById('ip-payment-amount').value);
            const noteInput = document.getElementById('ip-payment-notes').value.trim();
            const selectedDate = document.getElementById('ip-payment-date').value;
            const recordOnly = document.getElementById('ip-payment-mode')?.value === 'record_only';

            if (!plan) {
                alert('Could not find this installment plan.');
                return;
            }
            if (!recordOnly && (!Number.isFinite(amount) || amount <= 0)) {
                alert('Enter a valid payment amount.');
                return;
            }

            const date = selectedDate ? new Date(selectedDate).toISOString() : new Date().toISOString();
            const db = await getDB();
            db.installment_plans = Array.isArray(db.installment_plans) ? db.installment_plans : [];

            if (recordOnly) {
                const planIndex = db.installment_plans.findIndex(entry => entry && entry.id === planId && !entry.deletedAt);
                if (planIndex === -1) {
                    alert('Could not find this installment plan.');
                    return;
                }

                const rawPlan = db.installment_plans[planIndex];
                const decryptedPlan = await decryptData(rawPlan.data);
                const nextPlan = normalizeInstallmentPlanInput(decryptedPlan);
                const selectedRows = Array.from(document.querySelectorAll('.ip-previous-payment-checkbox:checked:not(:disabled)'))
                    .map(input => ({
                        id: generateFinanceRecordId('iph_'),
                        amount: Math.max(0, Number(input.dataset.amount || 0)),
                        feeAmount: Math.max(0, Number(input.dataset.feeAmount || 0)),
                        dueDate: String(input.dataset.dueDate || '').slice(0, 10),
                        installmentNumber: Math.max(0, Math.round(Number(input.dataset.installmentNumber || 0))),
                        notes: noteInput,
                        createdAt: new Date().toISOString()
                    }))
                    .filter(item => item.amount > 0 && item.dueDate);

                if (!selectedRows.length) {
                    alert('Choose at least one past installment to record.');
                    return;
                }

                nextPlan.historicalPayments = normalizeInstallmentHistoricalPayments([
                    ...(nextPlan.historicalPayments || []),
                    ...selectedRows.map(row => ({
                        ...row,
                        date: new Date(`${row.dueDate}T12:00:00`).toISOString()
                    }))
                ]);

                db.installment_plans[planIndex] = {
                    ...rawPlan,
                    data: await encryptData(nextPlan),
                    lastModified: Date.now(),
                    deletedAt: rawPlan.deletedAt || null
                };

                const persistedDB = await saveDB(db);
                rawInstallmentPlans = (persistedDB.installment_plans || db.installment_plans || []).filter(item => !item.deletedAt);
                toggleModal('installment-payment-modal');
                await renderInstallmentPlans(rawInstallmentPlans);
                await refreshLinkedPanels({
                    refreshKPI: true,
                    refreshForecast: true,
                    refreshStatements: true
                });
                showToast('✅ Previous BNPL payment recorded');
                return;
            }

            const desc = noteInput || `Payment for ${plan.name}`;
            const encrypted = await encryptData({
                desc,
                merchant: plan.provider || null,
                tags: [],
                amt: amount,
                originalAmt: amount,
                originalCurrency: 'PHP',
                quantity: 1,
                notes: noteInput,
                type: 'installment_payment',
                category: 'Installments/BNPL',
                installmentPlanId: plan.id,
                installmentPlanName: plan.name,
                installmentFeeAmount: Math.min(amount, Math.max(0, Number(plan.feeTotal || 0)) / Math.max(1, Math.round(Number(plan.installmentCount || 1)))),
                paymentSource: 'cash',
                date,
                importId: null,
                dedupeHash: null,
                deletedAt: null
            });

            db.transactions = Array.isArray(db.transactions) ? db.transactions : [];
            await ensureInstallmentCategory(db);
            db.transactions.push({
                id: generateFinanceRecordId('tx_'),
                data: encrypted,
                createdAt: Date.now(),
                deletedAt: null
            });

            const persistedDB = await saveDB(db);
            rawTransactions = (persistedDB.transactions || db.transactions || []).filter(t => !t.deletedAt);
            toggleModal('installment-payment-modal');
            await loadAndRender();
            await renderInstallmentPlans(rawInstallmentPlans);
            refreshTransactionCategorySelect();
            await refreshLinkedPanels({
                refreshKPI: true,
                refreshForecast: true,
                refreshStatements: true
            });
            showToast('✅ BNPL payment recorded');
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
            const name = document.getElementById('d-name').value.trim();
            const amount = parseFloat(document.getElementById('d-amount').value);
            const shouldTrackBorrowDate = document.getElementById('d-track-borrow-date')?.checked === true;
            const borrowDateValue = document.getElementById('d-borrow-date')?.value || '';
            if (!name || isNaN(amount)) return;
            if (shouldTrackBorrowDate && !borrowDateValue) {
                alert('Pick the borrowed date if this debt added cash to your wallet.');
                return;
            }

            const db = await getDB();
            db.debts = db.debts || [];
            const debtId = generateFinanceRecordId('debt_');
            const borrowDateISO = shouldTrackBorrowDate ? toISODateFromInputValue(borrowDateValue) : null;
            const encrypted = await encryptData({
                name,
                amount,
                borrowDate: borrowDateISO,
                borrowAddedCash: shouldTrackBorrowDate,
                borrowTrackedAsIncome: shouldTrackBorrowDate
            });
            db.debts.push({
                id: debtId,
                data: encrypted,
                deletedAt: null
            });

            if (shouldTrackBorrowDate) {
                await createDebtBorrowTransaction({
                    db,
                    debtId,
                    category: name,
                    amount,
                    dateISO: borrowDateISO,
                    desc: `Borrowed for ${name}`,
                    notes: '',
                    countAsCashReceived: true,
                    isInitialPrincipal: true
                });
            }
            await saveDB(db);

            rawDebts = db.debts.filter(d => !d.deletedAt);
            rawTransactions = (db.transactions || []).filter(t => !t.deletedAt);
            toggleModal('debt-modal');
            await loadAndRender();
            await renderDebts(rawDebts);
            refreshTransactionCategorySelect(name);
        }

        // New Logic for Update Debt Modal
        async function openUpdateDebtModal(id) {
            const debt = window.allDecryptedDebts.find(d => d.id === id);
            if (!debt) return;

            document.getElementById('ud-title').innerText = debt.name;
            document.getElementById('ud-debt-id').value = id;
            document.getElementById('ud-category').value = debt.name; // Category matches debt name
            document.getElementById('ud-original-category').value = debt.name;
            document.getElementById('ud-name').value = debt.name || '';
            document.getElementById('ud-base-amount').value = Number(debt.amount) || '';
            document.getElementById('ud-edit-track-borrow-date').checked = debt.borrowAddedCash === true || debt.borrowTrackedAsIncome === true;
            document.getElementById('ud-edit-borrow-date').value = getDateInputValue(debt.borrowDate);
            document.getElementById('ud-amount').value = '';
            document.getElementById('ud-desc').value = '';
            document.getElementById('ud-date').value = new Date().toISOString().split('T')[0];
            document.getElementById('ud-track-income').checked = false;

            setUDType('repayment'); // Default
            refreshUpdateDebtBorrowDateUI();
            refreshDebtTransactionBorrowUI();
            renderDebtPaymentHistory(debt);
            document.getElementById('update-debt-modal').classList.remove('hidden');
        }

        async function saveDebtDetails() {
            const debtId = document.getElementById('ud-debt-id').value;
            const oldName = document.getElementById('ud-original-category').value.trim();
            const newName = document.getElementById('ud-name').value.trim();
            const amount = parseFloat(document.getElementById('ud-base-amount').value);
            const trackBorrowDate = document.getElementById('ud-edit-track-borrow-date')?.checked === true;
            const borrowDateValue = document.getElementById('ud-edit-borrow-date')?.value || '';

            if (!debtId || !newName || isNaN(amount) || amount <= 0) {
                alert('Please enter a valid debt name and amount.');
                return;
            }
            if (trackBorrowDate && !borrowDateValue) {
                alert('Pick the borrowed date if this debt added cash to your wallet.');
                return;
            }

            const normalizedNewName = newName.toLowerCase();
            const nameTaken = (window.allDecryptedDebts || []).some(debt => {
                if (!debt || debt.id === debtId) return false;
                return String(debt.name || '').trim().toLowerCase() === normalizedNewName;
            });
            if (nameTaken) {
                alert('Another debt already uses that name.');
                return;
            }

            const db = await getDB();
            db.debts = Array.isArray(db.debts) ? db.debts : [];
            const debtIndex = db.debts.findIndex(entry => entry && entry.id === debtId && !entry.deletedAt);
            if (debtIndex === -1) {
                alert('Debt not found.');
                return;
            }

            const existingDebt = await decryptData(db.debts[debtIndex].data);
            if (!existingDebt) {
                alert('Debt details could not be loaded.');
                return;
            }

            const borrowDateISO = trackBorrowDate ? toISODateFromInputValue(borrowDateValue) : null;
            const nextDebt = {
                ...existingDebt,
                name: newName,
                amount,
                borrowAddedCash: trackBorrowDate,
                borrowTrackedAsIncome: trackBorrowDate,
                borrowDate: borrowDateISO
            };
            db.debts[debtIndex] = {
                ...db.debts[debtIndex],
                data: await encryptData(nextDebt),
                lastModified: Date.now(),
                deletedAt: db.debts[debtIndex].deletedAt || null
            };

            db.transactions = Array.isArray(db.transactions) ? db.transactions : [];
            let seedTransactionFound = false;

            for (let i = 0; i < db.transactions.length; i++) {
                const rawTx = db.transactions[i];
                if (!rawTx || rawTx.deletedAt) continue;

                const decrypted = await decryptData(rawTx.data);
                if (!decrypted || !isDebtLedgerTransaction(decrypted)) continue;

                const matchesDebtId = String(decrypted.debtId || '').trim() === debtId;
                const matchesName = String(decrypted.category || '').trim() === oldName;
                if (!matchesDebtId && !matchesName) continue;

                if (decrypted.debtPrincipalSeed === true) {
                    seedTransactionFound = true;
                    if (!trackBorrowDate) {
                        db.transactions[i] = {
                            ...rawTx,
                            deletedAt: new Date().toISOString(),
                            lastModified: Date.now()
                        };
                        continue;
                    }

                    const updatedSeed = {
                        ...decrypted,
                        desc: `Borrowed for ${newName}`,
                        amt: amount,
                        type: 'debt_increase',
                        category: newName,
                        date: borrowDateISO,
                        debtId,
                        debtBorrowTracked: true
                    };
                    db.transactions[i] = {
                        ...rawTx,
                        data: await encryptData(updatedSeed),
                        lastModified: Date.now(),
                        deletedAt: null
                    };
                    continue;
                }

                if (matchesName || matchesDebtId) {
                    const updatedTx = {
                        ...decrypted,
                        category: newName,
                        debtId: debtId || null
                    };
                    db.transactions[i] = {
                        ...rawTx,
                        data: await encryptData(updatedTx),
                        lastModified: Date.now(),
                        deletedAt: rawTx.deletedAt || null
                    };
                }
            }

            if (trackBorrowDate && !seedTransactionFound) {
                await createDebtBorrowTransaction({
                    db,
                    debtId,
                    category: newName,
                    amount,
                    dateISO: borrowDateISO,
                    desc: `Borrowed for ${newName}`,
                    notes: '',
                    countAsCashReceived: true,
                    isInitialPrincipal: true
                });
            }

            db.wishlist = Array.isArray(db.wishlist) ? db.wishlist : [];
            for (let i = 0; i < db.wishlist.length; i++) {
                const rawWish = db.wishlist[i];
                if (!rawWish || rawWish.deletedAt) continue;
                const decrypted = await decryptData(rawWish.data);
                if (!decrypted || decrypted.category !== oldName) continue;
                db.wishlist[i] = {
                    ...rawWish,
                    data: await encryptData({
                        ...decrypted,
                        category: newName
                    }),
                    lastModified: Date.now(),
                    deletedAt: rawWish.deletedAt || null
                };
            }

            if (budgets[oldName] != null && oldName !== newName) {
                budgets[newName] = budgets[oldName];
                delete budgets[oldName];
                db.budgets = { data: await encryptData(budgets) };
            }

            recurringTransactions = (recurringTransactions || []).map(reminder => {
                if (!reminder || reminder.category !== oldName) return reminder;
                return { ...reminder, category: newName };
            });
            categorizationRules = (categorizationRules || []).map(rule => {
                if (!rule || rule.category !== oldName) return rule;
                return { ...rule, category: newName, lastModified: Date.now() };
            });
            financialGoals = (financialGoals || []).map(goal => {
                if (!goal || goal.linkedCategory !== oldName) return goal;
                return { ...goal, linkedCategory: newName, lastModified: Date.now() };
            });
            db.recurring_transactions = recurringTransactions;
            db.categorization_rules = categorizationRules;
            db.goals = financialGoals;

            const persistedDB = await saveDB(db);
            rawDebts = (persistedDB.debts || []).filter(entry => !entry.deletedAt);
            rawTransactions = (persistedDB.transactions || []).filter(entry => !entry.deletedAt);

            await loadAndRender();
            await renderDebts(rawDebts);
            refreshTransactionCategorySelect(newName);
            await openUpdateDebtModal(debtId);
            showToast('✅ Debt updated');
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

            refreshDebtTransactionBorrowUI();
        }

        async function saveDebtTransaction() {
            const category = document.getElementById('ud-category').value;
            const debtId = String(document.getElementById('ud-debt-id')?.value || '').trim();
            const amount = parseFloat(document.getElementById('ud-amount').value);
            const typeKey = document.getElementById('ud-type').value; // 'repayment' or 'loan'
            const dateVal = document.getElementById('ud-date').value;
            const countLoanAsCashReceived = typeKey === 'loan' && document.getElementById('ud-track-income')?.checked === true;
            let desc = document.getElementById('ud-desc').value;

            if (isNaN(amount) || amount <= 0) { alert("Invalid amount"); return; }

            // Map to Transaction Type
            // Repayment -> Expense (Reduces debt remaining)
            // Loan -> Debt increase, optionally adding cash to balance now
            const type = typeKey === 'repayment'
                ? 'expense'
                : 'debt_increase';

            if (!desc) {
                if (typeKey === 'repayment') {
                    desc = `Repayment for ${category}`;
                } else {
                    desc = countLoanAsCashReceived ? `Borrowed for ${category}` : `Recorded debt increase for ${category}`;
                }
            }

            const date = toISODateFromInputValue(dateVal);

            // Reuse generic save logic via manual construction
            const encrypted = await encryptData({
                desc,
                merchant: null,
                tags: [],
                amt: amount, // Assuming base currency for simplicity
                quantity: 1,
                type,
                category,
                paymentSource: 'cash',
                creditCardId: null,
                creditCardName: null,
                date,
                notes: '',
                debtId: debtId || null,
                debtBorrowTracked: countLoanAsCashReceived,
                debtPrincipalSeed: false,
                importId: null,
                dedupeHash: null,
                deletedAt: null
            });

            const db = await getDB();
            db.transactions = Array.isArray(db.transactions) ? db.transactions : [];
            db.transactions.push({
                id: generateFinanceRecordId('tx_'),
                data: encrypted,
                createdAt: Date.now(),
                deletedAt: null
            });

            await saveDB(db);

            rawTransactions = db.transactions.filter(t => !t.deletedAt);
            toggleModal('update-debt-modal');
            await loadAndRender(); // Updates transaction list
            await renderDebts(rawDebts); // Update debt progress
            showToast(typeKey === 'repayment' ? '✅ Debt payment recorded' : '✅ Debt activity recorded');
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
            const confirmed = await showFinanceConfirmModal({
                title: 'Delete wishlist item?',
                message: 'This wishlist entry will be removed from your planning list.',
                confirmLabel: 'Delete Item',
                cancelLabel: 'Keep Item',
                tone: 'danger'
            });
            if (!confirmed) return;
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
            if (col === 'installment_plans') return 'installment_plans';
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
            const confirmed = await showFinanceConfirmModal(getDeleteItemConfirmOptions(col, confirmMessage));
            if (!confirmed) return;
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
                await renderInstallmentPlans(rawInstallmentPlans);
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
            } else if (col === 'installment_plans') {
                rawInstallmentPlans = (persistedDB.installment_plans || []).filter(plan => !plan.deletedAt);
                await renderInstallmentPlans(rawInstallmentPlans);
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
        function getAdaPhpRateForCurrencyConversion() {
            const cache = typeof cryptoPrices !== 'undefined' ? cryptoPrices?.cardano : null;
            const price = Number(cache?.php ?? cache?.price ?? 0);
            return Number.isFinite(price) && price > 0 ? price : 0;
        }

        function convertToDisplayCurrency(amount, fromCurrency, toCurrency) {
            const sourceCurrency = String(fromCurrency || 'PHP').trim().toUpperCase();
            const targetCurrency = String(toCurrency || 'PHP').trim().toUpperCase();
            const numericAmount = Number(amount) || 0;
            if (sourceCurrency === targetCurrency) return numericAmount;

            // Convert to PHP first (base currency)
            let inPHP = numericAmount;
            if (sourceCurrency === 'ADA') {
                const adaPhp = getAdaPhpRateForCurrencyConversion();
                if (!(adaPhp > 0)) return NaN;
                inPHP = numericAmount * adaPhp;
            } else if (sourceCurrency !== 'PHP') {
                const sourceRate = Number(exchangeRates[sourceCurrency] || 0);
                if (!(sourceRate > 0)) return NaN;
                inPHP = numericAmount / sourceRate;
            }

            // Then convert to target currency
            if (targetCurrency === 'PHP') {
                return inPHP;
            } else if (targetCurrency === 'ADA') {
                const adaPhp = getAdaPhpRateForCurrencyConversion();
                return adaPhp > 0 ? inPHP / adaPhp : NaN;
            } else {
                const targetRate = Number(exchangeRates[targetCurrency] || 0);
                return targetRate > 0 ? inPHP * targetRate : NaN;
            }
        }

        // Format currency with symbol
        function formatCurrency(amount, currency) {
            const safeCurrency = String(currency || 'PHP').trim().toUpperCase();
            const symbols = { PHP: '₱', USD: '$', JPY: '¥', ADA: '₳' };
            const decimals = safeCurrency === 'JPY' ? 0 : (safeCurrency === 'ADA' ? 6 : 2);
            return (symbols[safeCurrency] || `${safeCurrency} `) + Number(amount || 0).toLocaleString(undefined, {
                minimumFractionDigits: decimals,
                maximumFractionDigits: decimals
            });
        }

        function toggleModal(id) { document.getElementById(id).classList.toggle('hidden'); }
        window.showFinanceConfirmModal = showFinanceConfirmModal;
        window.closeFinanceConfirmModal = closeFinanceConfirmModal;
