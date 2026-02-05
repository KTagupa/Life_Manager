        // =============================================
        // SECTION 7: CRUD OPERATIONS
        // =============================================
        let wishlistConvertId = null;
        function populateCategorySelect(selectEl) {
            selectEl.innerHTML = '';
            // 1. Standard Categories
            standardCategories.forEach(c => {
                const op = document.createElement('option');
                op.value = c;
                op.innerText = (c === 'Salary' || c === 'Savings') ? `💰 ${c}` : c;
                selectEl.appendChild(op);
            });

            // 2. Custom Categories
            customCategories.forEach(c => {
                const op = document.createElement('option');
                op.value = c;
                op.innerText = c;
                selectEl.appendChild(op);
            });

            // 3. Debt Categories - REMOVED to prevent adding via standard modal
            // (Debts should be managed via the Debt/Loan interface)

            // 4. Lent Categories
            if (window.allDecryptedLent && window.allDecryptedLent.length > 0) {
                const group = document.createElement('optgroup');
                group.label = "Money Lent (to others)";
                window.allDecryptedLent.forEach(l => {
                    const op = document.createElement('option');
                    op.value = `Lent: ${l.name}`;
                    op.innerText = `🤝 Lent: ${l.name}`;
                    group.appendChild(op);
                });
                selectEl.appendChild(group);
            }
        }

        function openBudgetModal() {
            populateBudgetInputs();
            toggleModal('budget-modal');
        }

        function populateBudgetInputs() {
            const bDiv = document.getElementById('budget-inputs');
            const allCats = [...standardCategories, ...customCategories];
            if (window.allDecryptedDebts) {
                window.allDecryptedDebts.forEach(d => {
                    if (!allCats.includes(d.name)) allCats.push(d.name);
                });
            }

            // Get spent amounts for the currently filtered month/year
            const m = document.getElementById('filter-month').value;
            const y = document.getElementById('filter-year').value;
            const now = new Date();
            const targetM = m === 'all' ? now.getMonth() + 1 : parseInt(m);
            const targetY = y === 'all' ? now.getFullYear() : parseInt(y);

            const spentMap = {};
            (window.allDecryptedTransactions || []).filter(t => {
                const d = new Date(t.date);
                return t.type === 'expense' && (d.getMonth() + 1) === targetM && d.getFullYear() === targetY;
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

                totalBudget += limit;
                totalSpent += spent;

                return `
                <div class="bg-slate-50 p-4 rounded-2xl border border-slate-200 transition-all hover:border-emerald-200">
                    <div class="flex items-center justify-between mb-3">
                        <div class="flex items-center gap-2">
                            <span class="w-2 h-2 rounded-full ${limit > 0 ? 'bg-emerald-500' : 'bg-slate-300'}"></span>
                            <label class="text-sm font-bold text-slate-700">${c}</label>
                            ${isCustom ? `
                                <div class="flex gap-1">
                                    <button onclick="editCustomCategory('${c}')" 
                                        class="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors">
                                        <i data-lucide="edit-2" class="w-3 h-3"></i>
                                    </button>
                                    <button onclick="deleteCustomCategory('${c}')" 
                                        class="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors">
                                        <i data-lucide="trash-2" class="w-3 h-3"></i>
                                    </button>
                                </div>
                            ` : ''}
                        </div>
                        <div class="text-right">
                           <span class="text-[10px] font-black uppercase text-slate-400 block mb-0.5">Budget Limit</span>
                           <input type="number" data-cat="${c}" value="${limit || ''}" oninput="updateBudgetSummaries()" 
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
                const d = new Date(t.date);
                return t.type === 'expense' && (d.getMonth() + 1) === targetM && d.getFullYear() === targetY;
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

        function addCustomCategory() {
            const el = document.getElementById('new-category-name');
            const name = el.value.trim();
            if (!name) return;
            if (standardCategories.includes(name) || customCategories.includes(name)) {
                alert("Category already exists.");
                return;
            }
            customCategories.push(name);
            el.value = '';
            populateBudgetInputs();
        }

        async function editCustomCategory(oldName) {
            const newName = prompt(`Edit category name:`, oldName);
            if (!newName || newName.trim() === '' || newName === oldName) return;

            const trimmedName = newName.trim();

            // Check if new name already exists
            if (standardCategories.includes(trimmedName) || customCategories.includes(trimmedName)) {
                alert("A category with this name already exists.");
                return;
            }

            // Count affected items
            const transactions = window.allDecryptedTransactions || [];
            const affectedTxs = transactions.filter(t => t.category === oldName);
            const hasBudget = budgets[oldName] > 0;

            let message = `This will rename "${oldName}" to "${trimmedName}".\n\n`;
            message += `Affected items:\n`;
            message += `- ${affectedTxs.length} transaction(s)\n`;
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
                    db.transactions[i].data = await encryptData(decrypted);
                }
            }

            // Update budgets
            if (budgets[oldName]) {
                budgets[trimmedName] = budgets[oldName];
                delete budgets[oldName];
            }

            // Save everything
            db.custom_categories = customCategories;
            const budgetEncrypted = await encryptData(budgets);
            db.budgets = { data: budgetEncrypted };
            await saveDB(db);

            // Reload
            await loadFromStorage();
            populateBudgetInputs();
            showToast(`✅ Category renamed successfully`);
        }

        async function deleteCustomCategory(name) {
            // Check if used in transactions
            const transactions = window.allDecryptedTransactions || [];
            const usedCount = transactions.filter(t => t.category === name).length;

            if (usedCount > 0) {
                alert(`Cannot delete "${name}" because it is used in ${usedCount} transaction(s).\n\nPlease delete or reassign those transactions first.`);
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

            if (t === 'expense') {
                btnExp.className = "py-2 rounded-xl font-bold bg-white text-rose-600 shadow-sm";
                btnInc.className = "py-2 rounded-xl font-bold text-slate-400";
            } else {
                btnInc.className = "py-2 rounded-xl font-bold bg-white text-emerald-600 shadow-sm";
                btnExp.className = "py-2 rounded-xl font-bold text-slate-400";
            }
        }

        function openTransactionModal(id = null, options = {}) {
            const modal = document.getElementById('transaction-modal');
            const title = document.getElementById('t-modal-title');
            const tId = document.getElementById('t-id');
            const desc = document.getElementById('t-desc');
            const amt = document.getElementById('t-amount');
            const cat = document.getElementById('t-category');

            if (!options.fromWishlist) {
                wishlistConvertId = null;
            }

            // Populate categories fresh every time to catch new debts
            populateCategorySelect(cat);

            if (id) {
                const item = window.allDecryptedTransactions.find(t => t.id === id);
                if (!item) return;

                // Guard: Prevent editing Debt transactions or specialized types not supported by this modal
                // 'debt_increase' is not supported (no UI toggle)
                // If category is not in the dropdown (because we removed Debts), we shouldn't allow editing as it would reset category

                // Check if category exists in dropdown
                const categoryExists = Array.from(cat.options).some(o => o.value === item.category);

                if (item.type === 'debt_increase' || !categoryExists) {
                    alert("This transaction typically belongs to a restricted category (e.g. Debt) or type. Please manage it within its specific section (e.g. Debts to Pay).");
                    toggleModal('transaction-modal'); // Re-toggle to close if it was just opened, or simply don't show
                    // Since toggleModal flips the class, and we are currently visible? No, "openTransactionModal" is called to SHOW it.
                    // The modal is currently HIDDEN when this function is called (before validity check).
                    // Actually checking the logic: openTransactionModal calls modal.classList.remove('hidden') at the END.
                    // So we just return here.
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
            }
            modal.classList.remove('hidden');
        }

        function closeTransactionModal() {
            wishlistConvertId = null;
            toggleModal('transaction-modal');
        }

        async function openBillModal(id = null) {
            const modal = document.getElementById('bill-modal');
            const title = document.getElementById('b-modal-title');
            const bId = document.getElementById('b-id');
            const name = document.getElementById('b-name');
            const day = document.getElementById('b-day');
            const amt = document.getElementById('b-amount');

            if (id) {
                const raw = rawBills.find(b => b.id === id);
                if (raw) {
                    const d = await decryptData(raw.data);
                    if (d) {
                        title.innerText = "Edit Bill";
                        bId.value = id;
                        name.value = d.name;
                        day.value = d.day;
                        amt.value = d.amt;
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
            modal.classList.remove('hidden');
        }

        function openDebtModal() {
            document.getElementById('d-name').value = '';
            document.getElementById('d-amount').value = '';
            document.getElementById('debt-modal').classList.remove('hidden');
        }

        async function saveTransaction() {
            const id = document.getElementById('t-id').value;
            const desc = document.getElementById('t-desc').value;
            const amt = parseFloat(document.getElementById('t-amount').value);
            const currency = document.getElementById('t-currency').value;
            const type = document.getElementById('t-type').value;
            const category = document.getElementById('t-category').value;

            if (!desc || isNaN(amt)) return;
            if (!category) {
                alert('Please select a category.');
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
                amt: amtInPHP,
                originalAmt: amt,
                originalCurrency: currency,
                quantity: quantity,
                notes: notes,
                type,
                category,
                date
            });

            const db = await getDB();
            if (id) {
                const idx = db.transactions.findIndex(t => t.id === id);
                if (idx !== -1) db.transactions[idx] = { id, data: encrypted, lastModified: Date.now() };
            } else {
                db.transactions.push({
                    id: Date.now().toString(36) + Math.random().toString(36).substr(2),
                    data: encrypted,
                    createdAt: Date.now()
                });
            }
            await saveDB(db);

            rawTransactions = db.transactions;
            toggleModal('transaction-modal');
            await loadAndRender(); // Updates transaction list

            // Re-render debts because a transaction might have been a payment towards a debt
            await renderDebts(rawDebts);

            if (wishlistConvertId) {
                const convertId = wishlistConvertId;
                wishlistConvertId = null;
                await removeWishlistById(convertId);
                showToast('✅ Converted from wishlist');
            }
        }

        async function saveBill() {
            const id = document.getElementById('b-id').value;
            const name = document.getElementById('b-name').value;
            const day = parseInt(document.getElementById('b-day').value);
            const amt = parseFloat(document.getElementById('b-amount').value);
            if (!name || isNaN(day)) return;

            const encrypted = await encryptData({ name, day, amt });

            const db = await getDB();
            let billId = id;

            if (id) {
                const idx = db.bills.findIndex(b => b.id === id);
                if (idx !== -1) db.bills[idx] = { id, data: encrypted };
            } else {
                billId = Date.now().toString(36) + Math.random().toString(36).substr(2);
                db.bills.push({
                    id: billId,
                    data: encrypted
                });
            }

            // AUTO-SYNC: Create or update corresponding reminder
            await syncBillToReminder(billId, name, day, amt);

            await saveDB(db);

            rawBills = db.bills;
            toggleModal('bill-modal');
            renderBills(rawBills);
            checkRecurringReminders(); // Check if any reminders are due now
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
                data: encrypted
            });
            await saveDB(db);

            rawDebts = db.debts;
            toggleModal('debt-modal');
            renderDebts(rawDebts);
            // Refresh budget inputs to include new debt category
            populateBudgetInputs();
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
                amt: amount, // Assuming base currency for simplicity
                quantity: 1,
                type,
                category,
                date
            });

            const db = await getDB();
            db.transactions.push({
                id: Date.now().toString(36) + Math.random().toString(36).substr(2),
                data: encrypted,
                createdAt: Date.now()
            });

            await saveDB(db);

            rawTransactions = db.transactions;
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
                data: encrypted
            });
            await saveDB(db);

            rawLent = db.lent;
            toggleModal('lent-modal');
            renderLent(rawLent);
            populateCategorySelect(document.getElementById('t-category'));
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
                if (idx !== -1) db.wishlist[idx] = { id, data: encrypted, lastModified: Date.now() };
            } else {
                db.wishlist.push({
                    id: Date.now().toString(36) + Math.random().toString(36).substr(2),
                    data: encrypted,
                    createdAt: Date.now()
                });
            }

            await saveDB(db);
            rawWishlist = db.wishlist;
            toggleModal('wishlist-modal');
            await loadAndRenderWishlist();
            showToast('✅ Wishlist updated');
        }

        async function deleteWishlistItem(id) {
            if (!confirm('Delete this wishlist item?')) return;
            await removeWishlistById(id);
            showToast('🗑️ Wishlist item deleted');
        }

        async function removeWishlistById(id) {
            const db = await getDB();
            db.wishlist = (db.wishlist || []).filter(w => w.id !== id);
            rawWishlist = db.wishlist;
            await saveDB(db);
            await loadAndRenderWishlist();
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

        async function deleteItem(col, id) {
            if (!confirm("Are you sure?")) return;
            const db = await getDB();

            if (col === 'transactions') {
                db.transactions = db.transactions.filter(t => t.id !== id);
                rawTransactions = db.transactions;
                await saveDB(db);
                await loadAndRender();
                await renderDebts(rawDebts); // Update debt progress if a payment was deleted
            } else if (col === 'bills') {
                db.bills = db.bills.filter(b => b.id !== id);
                rawBills = db.bills;

                // AUTO-SYNC: Remove corresponding reminder
                recurringTransactions = recurringTransactions.filter(r => r.linkedBillId !== id);
                db.recurring_transactions = recurringTransactions;

                await saveDB(db);
                renderBills(rawBills);
                checkRecurringReminders(); // Update reminder banner
            } else if (col === 'debts') {
                db.debts = db.debts.filter(d => d.id !== id);
                rawDebts = db.debts;
                await saveDB(db);
                renderDebts(rawDebts);
                populateBudgetInputs();
            } else if (col === 'lent') {
                db.lent = db.lent.filter(l => l.id !== id);
                rawLent = db.lent;
                await saveDB(db);
                renderLent(rawLent);
            } else if (col === 'crypto') {
                db.crypto = db.crypto.filter(c => c.id !== id);
                rawCrypto = db.crypto;
                await saveDB(db);
                renderCryptoPortfolio();
                // re-calc holdings for widget
                renderCryptoWidget();
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
