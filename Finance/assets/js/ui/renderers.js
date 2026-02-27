        // =============================================
        // SECTION 6: RENDERERS
        // =============================================
        function renderTransactions(items) {
            const list = document.getElementById('transaction-list');

            list.innerHTML = items.length ? '' : '<div class="p-10 text-center text-slate-400">No transactions found.</div>';

            items.forEach(i => {
                const isInc = i.type === 'income';
                const isDebtInc = i.type === 'debt_increase';
                const encodedTxId = encodeInlineArg(i.id);
                const safeDesc = escapeHTML(i.desc || 'Untitled');
                const safeCategory = escapeHTML(i.category || 'Uncategorized');
                const initials = escapeHTML(i.category ? i.category.substring(0, 2).toUpperCase() : '??');
                const displayDate = new Date(i.date).toLocaleDateString();

                const div = document.createElement('div');
                div.className = "p-4 flex items-center justify-between group hover:bg-slate-50 transition-colors cursor-pointer";
                div.onclick = (e) => {
                    if (e.target.closest('button')) return;
                    openTransactionModal(i.id);
                };

                const currencyBadge = i.originalCurrency && i.originalCurrency !== 'PHP'
                    ? `<span class="text-[9px] bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded font-bold">${escapeHTML(i.originalCurrency)}</span>`
                    : '';

                // Icon & Color Logic
                let iconBg, iconText, amountColor, sign;
                if (isInc) {
                    iconBg = 'bg-emerald-50'; iconText = 'text-emerald-600';
                    amountColor = 'text-emerald-600'; sign = '+';
                } else if (isDebtInc) {
                    iconBg = 'bg-blue-50'; iconText = 'text-blue-600';
                    amountColor = 'text-blue-600'; sign = '+';
                } else {
                    iconBg = 'bg-rose-50'; iconText = 'text-rose-600';
                    amountColor = 'text-rose-600'; sign = '-';
                }

                div.innerHTML = `
                    <div class="flex items-center gap-4">
                        <div class="w-10 h-10 rounded-xl flex items-center justify-center text-xs font-bold ${iconBg} ${iconText}">
                            ${initials}
                        </div>
                        <div>
                            <p class="font-bold text-slate-800">${safeDesc} ${currencyBadge}</p>
                            <p class="text-[10px] uppercase font-bold text-slate-400 tracking-widest">${displayDate} • ${safeCategory}</p>
                        </div>
                    </div>
                    <div class="flex items-center gap-4">
                        <p class="font-bold ${amountColor}">${sign}${fmt(i.amt)}</p>
                        <button onclick="deleteItem('transactions', decodeURIComponent('${encodedTxId}'))" class="opacity-0 group-hover:opacity-100 p-2 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
                    </div>`;
                list.appendChild(div);
            });

            const metrics = computeSummaryMetrics(window.allDecryptedTransactions || [], metricScope, {
                filteredTransactions: window.filteredTransactions || items
            });
            renderSummaryCards(metrics);

            // Calculate trends
            calculateTrends();

            // Update Budget Inputs UI to include Debt categories if any
            populateBudgetInputs();
            lucide.createIcons();
        }

        function buildDebtAndLentAggregates(transactions) {
            const debtPaidByCategory = Object.create(null);
            const debtBorrowedByCategory = Object.create(null);
            const lentExpensesByCategory = Object.create(null);
            const lentIncomeByCategory = Object.create(null);

            (transactions || []).forEach(t => {
                const category = (t && typeof t.category === 'string') ? t.category : '';
                if (!category) return;

                const amt = Number(t.amt) || 0;
                if (amt <= 0) return;

                if (t.type === 'expense') {
                    debtPaidByCategory[category] = (debtPaidByCategory[category] || 0) + amt;
                    if (category.startsWith('Lent: ')) {
                        lentExpensesByCategory[category] = (lentExpensesByCategory[category] || 0) + amt;
                    }
                    return;
                }

                if (t.type === 'income' || t.type === 'debt_increase') {
                    debtBorrowedByCategory[category] = (debtBorrowedByCategory[category] || 0) + amt;
                    if (t.type === 'income' && category.startsWith('Lent: ')) {
                        lentIncomeByCategory[category] = (lentIncomeByCategory[category] || 0) + amt;
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

        async function renderDebts(items) {
            const list = document.getElementById('debt-list');
            list.innerHTML = '';

            const decryptedDebts = (await Promise.all(items.map(async i => {
                const d = await decryptData(i.data);
                return d ? { ...d, id: i.id } : null;
            }))).filter(x => x);

            // Store for category usage
            window.allDecryptedDebts = decryptedDebts;

            if (decryptedDebts.length === 0) {
                list.innerHTML = '<div class="text-center text-xs text-slate-400 py-2">No debts tracked. Good job!</div>';
                return;
            }

            // Calculate paid amounts from transaction history (Expenses with category == Debt Name)
            // Note: We use all transactions (historical), not just filtered ones, to show true debt progress
            const allTrans = window.allDecryptedTransactions || [];
            const {
                debtPaidByCategory,
                debtBorrowedByCategory
            } = buildDebtAndLentAggregates(allTrans);

            decryptedDebts.forEach(d => {
                const safeDebtName = escapeHTML(d.name || 'Debt');
                const encodedDebtId = encodeInlineArg(d.id);
                const paid = debtPaidByCategory[d.name] || 0;
                const borrowedMore = debtBorrowedByCategory[d.name] || 0;

                const totalDebt = d.amount + borrowedMore;
                const percentage = totalDebt > 0 ? Math.min(100, Math.round((paid / totalDebt) * 100)) : 100;
                const remaining = Math.max(0, totalDebt - paid);

                if (remaining <= 0.01 && percentage >= 100) return; // Hide completed debts

                const div = document.createElement('div');
                div.className = "group relative cursor-pointer hover:bg-slate-50 p-2 -mx-2 rounded-xl transition-colors";
                div.onclick = (e) => {
                    if (e.target.closest('button')) return;
                    openUpdateDebtModal(d.id);
                };
                div.innerHTML = `
                        <div class="flex justify-between items-end mb-1">
                            <div>
                                <p class="text-sm font-bold text-slate-700">${safeDebtName}</p>
                                <p class="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                                    Paid: ${fmt(paid)} / ${fmt(totalDebt)}
                                </p>
                            </div>
                            <div class="flex items-center gap-2">
                                <span class="text-xs font-black text-rose-600">${percentage}%</span>
                                <button onclick="deleteItem('debts', decodeURIComponent('${encodedDebtId}'))" class="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-rose-500 transition-opacity">
                                    <i data-lucide="trash-2" class="w-3 h-3"></i>
                                </button>
                            </div>
                        </div>
                        <div class="h-2 bg-slate-100 rounded-full overflow-hidden">
                            <div class="h-full bg-rose-500 rounded-full" style="width: ${percentage}%"></div>
                        </div>
                        <p class="text-[10px] text-slate-400 mt-1 italic text-right">${fmt(remaining)} left</p>
                    `;
                list.appendChild(div);
            });
            lucide.createIcons();
        }

        async function renderLent(items) {
            const list = document.getElementById('lent-list');
            list.innerHTML = '';

            const decryptedLent = (await Promise.all(items.map(async i => {
                const d = await decryptData(i.data);
                return d ? { ...d, id: i.id } : null;
            }))).filter(x => x);

            window.allDecryptedLent = decryptedLent;

            if (decryptedLent.length === 0) {
                list.innerHTML = '<div class="text-center text-xs text-slate-400 py-2">No money lent out.</div>';
                return;
            }

            const allTrans = window.allDecryptedTransactions || [];
            const {
                lentExpensesByCategory,
                lentIncomeByCategory
            } = buildDebtAndLentAggregates(allTrans);

            decryptedLent.forEach(l => {
                const safeLentName = escapeHTML(l.name || 'Lent');
                const encodedLentId = encodeInlineArg(l.id);
                const lentCategory = `Lent: ${l.name}`;
                const expenses = lentExpensesByCategory[lentCategory] || 0;
                const income = lentIncomeByCategory[lentCategory] || 0;

                const balance = expenses - income;

                const div = document.createElement('div');
                div.className = "group relative bg-slate-50 p-3 rounded-2xl border border-slate-100";
                div.innerHTML = `
                    <div class="flex justify-between items-center">
                        <div>
                            <p class="text-sm font-bold text-slate-700">${safeLentName}</p>
                            <p class="text-[10px] text-slate-400 font-bold">Total Lent: ${fmt(expenses)} | Repaid: ${fmt(income)}</p>
                        </div>
                        <div class="text-right flex items-center gap-3">
                            <div>
                                <p class="text-xs font-bold text-slate-400 uppercase">Balance</p>
                                <p class="font-black ${balance > 0 ? 'text-emerald-600' : 'text-slate-400'}">${fmt(balance)}</p>
                            </div>
                            <button onclick="deleteItem('lent', decodeURIComponent('${encodedLentId}'))" class="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-rose-500 transition-opacity">
                                <i data-lucide="trash-2" class="w-4 h-4"></i>
                            </button>
                        </div>
                    </div>
                `;
                list.appendChild(div);
            });
            lucide.createIcons();
        }

        async function renderBills(items) {
            const list = document.getElementById('bill-list');
            list.innerHTML = '';
            const decrypted = (await Promise.all(items.map(async i => {
                const d = await decryptData(i.data);
                return d ? { ...d, id: i.id } : null;
            }))).filter(x => x);

            if (decrypted.length === 0) {
                list.innerHTML = '<div class="text-center text-xs text-slate-400 py-2">No bills set.</div>';
                return;
            }

            decrypted.forEach(b => {
                const encodedBillId = encodeInlineArg(b.id);
                const safeBillName = escapeHTML(b.name || 'Bill');
                const safeBillDay = Number.isFinite(Number(b.day)) ? Number(b.day) : 1;
                const isPaused = !!b.paused;
                const div = document.createElement('div');
                div.className = `p-3 bg-slate-50 rounded-2xl flex justify-between border items-center group cursor-pointer transition-colors ${isPaused ? 'border-amber-300 hover:border-amber-400' : 'hover:border-indigo-300'}`;
                div.onclick = (e) => { if (!e.target.closest('button')) openBillModal(b.id); };

                div.innerHTML = `
                    <div>
                        <p class="text-xs font-bold text-slate-400 uppercase">Day ${safeBillDay}</p>
                        <p class="font-bold ${isPaused ? 'text-amber-700' : 'text-slate-800'}">${safeBillName}${isPaused ? ' <span class="text-[10px] align-middle bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">PAUSED</span>' : ''}</p>
                    </div>
                    <div class="flex items-center gap-2">
                        <span class="font-bold text-slate-500">${fmt(b.amt)}</span>
                        <button onclick="toggleBillPaused(decodeURIComponent('${encodedBillId}'))" class="px-2 py-1 text-[10px] font-bold rounded-lg ${isPaused ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' : 'bg-amber-100 text-amber-700 hover:bg-amber-200'}">${isPaused ? 'Resume' : 'Pause'}</button>
                        <button onclick="deleteItem('bills', decodeURIComponent('${encodedBillId}'))" class="text-slate-300 hover:text-rose-500"><i data-lucide="x-circle" class="w-4 h-4"></i></button>
                    </div>
                `;
                list.appendChild(div);
            });
            lucide.createIcons();
        }

        function renderBudgets(items) {
            const container = document.getElementById('budget-breakdown');
            const hasBudgets = Object.values(budgets).some(v => v > 0);
            if (!hasBudgets) {
                container.innerHTML = '<p class="text-xs text-slate-400 italic text-center">Set budgets to see progress.</p>';
                return;
            }

            const metrics = computeSummaryMetrics(window.allDecryptedTransactions || [], metricScope, {
                scopeTransactions: items,
                filteredTransactions: window.filteredTransactions || []
            });
            const actuals = metrics.categoryExpenses;

            container.innerHTML = '';
            Object.entries(budgets).forEach(([cat, limit]) => {
                if (!limit) return;
                const spent = actuals[cat] || 0;
                const pct = Math.min((spent / limit) * 100, 100);
                const isOver = spent > limit;
                const safeCat = escapeHTML(cat);

                const div = document.createElement('div');
                div.innerHTML = `
                    <div class="flex justify-between text-xs font-bold mb-1">
                        <span class="text-slate-600">${safeCat}</span>
                        <span class="${isOver ? 'text-rose-500' : 'text-slate-400'}">${fmt(spent)} / ${fmt(limit)}</span>
                    </div>
                    <div class="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div class="h-full rounded-full transition-all duration-500 ${isOver ? 'bg-rose-500' : 'bg-emerald-500'}" style="width: ${pct}%"></div>
                    </div>
                `;
                container.appendChild(div);
            });
        }

        async function loadAndRenderWishlist() {
            const decrypted = (await Promise.all(rawWishlist.map(async i => {
                const d = await decryptData(i.data);
                return d ? { ...d, id: i.id } : null;
            }))).filter(x => x).sort((a, b) => new Date(a.targetDate || a.createdAt) - new Date(b.targetDate || b.createdAt));

            window.allDecryptedWishlist = decrypted;
            renderWishlist(decrypted);
        }

        function renderWishlist(items) {
            const list = document.getElementById('wishlist-list');
            if (!list) return;

            if (!items || items.length === 0) {
                list.innerHTML = '<div class="text-center text-xs text-slate-400 py-4">No wishlist items yet.</div>';
                return;
            }

            list.innerHTML = '';
            items.forEach(i => {
                const amountLabel = i.amt ? fmt(i.amt) : '—';
                const categoryLabel = i.category ? i.category : 'Uncategorized';
                const targetDate = i.targetDate ? new Date(i.targetDate).toLocaleDateString() : 'No date set';
                const encodedWishlistId = encodeInlineArg(i.id);
                const safeDesc = escapeHTML(i.desc || 'Wishlist item');
                const safeCategory = escapeHTML(categoryLabel);
                const safeTargetDate = escapeHTML(targetDate);

                const div = document.createElement('div');
                div.className = 'p-3 bg-slate-50 rounded-2xl border border-slate-100 hover:border-indigo-200 transition-all group cursor-pointer';
                div.onclick = (e) => {
                    if (e.target.closest('button')) return;
                    openWishlistModal(i.id);
                };
                div.innerHTML = `
                    <div class="flex items-start justify-between gap-3">
                        <div class="flex-1">
                            <p class="font-bold text-slate-800">${safeDesc}</p>
                            <p class="text-[10px] font-bold uppercase tracking-widest text-slate-400 mt-1">${safeCategory} • ${safeTargetDate}</p>
                            <p class="text-xs text-slate-500 mt-1">Planned: ${amountLabel}</p>
                        </div>
                        <div class="flex items-center gap-2">
                            <button onclick="convertWishlistToExpense(decodeURIComponent('${encodedWishlistId}'))" class="px-3 py-1.5 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg">Convert</button>
                            <button onclick="deleteWishlistItem(decodeURIComponent('${encodedWishlistId}'))" class="p-2 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all">
                                <i data-lucide="trash-2" class="w-4 h-4"></i>
                            </button>
                        </div>
                    </div>
                `;
                list.appendChild(div);
            });

            lucide.createIcons();
        }
