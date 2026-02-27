        // =============================================
        // SECTION 9: ITEM TRACKING
        // =============================================

        let itemPriceChart = null;

        function openItemTracker() {
            toggleModal('item-tracker-modal');
            populateItemCategoryFilter();
            renderItemsList();
        }

        function populateItemCategoryFilter() {
            const select = document.getElementById('item-category-filter');
            const txCategories = (window.allDecryptedTransactions || [])
                .map(t => String(t?.category || '').trim())
                .filter(Boolean);
            const allCats = [...new Set([...standardCategories, ...customCategories, ...txCategories])];

            select.innerHTML = '<option value="all">All Categories</option>';
            allCats.forEach(cat => {
                const opt = document.createElement('option');
                opt.value = cat;
                opt.innerText = cat;
                select.appendChild(opt);
            });
        }

        function getUniqueItems() {
            const items = {};
            const transactions = window.allDecryptedTransactions || [];

            transactions.forEach(t => {
                const itemName = t.desc.trim().toLowerCase();
                if (!itemName) return;

                if (!items[itemName]) {
                    items[itemName] = {
                        name: t.desc.trim(), // Keep original casing
                        transactions: [],
                        types: new Set(),
                        categories: new Set()
                    };
                }

                items[itemName].transactions.push(t);
                items[itemName].types.add(t.type);
                items[itemName].categories.add(t.category);
            });

            return items;
        }

        function filterItems() {
            const typeFilter = document.getElementById('item-type-filter').value;
            const categoryFilter = document.getElementById('item-category-filter').value;
            const searchQuery = document.getElementById('item-search').value.toLowerCase();

            const allItems = getUniqueItems();
            const filteredItems = {};

            Object.entries(allItems).forEach(([key, item]) => {
                // Type filter
                if (typeFilter !== 'all') {
                    const hasType = item.transactions.some(t => t.type === typeFilter);
                    if (!hasType) return;
                }

                // Category filter
                if (categoryFilter !== 'all') {
                    if (!item.categories.has(categoryFilter)) return;
                }

                // Search filter
                if (searchQuery && !item.name.toLowerCase().includes(searchQuery)) return;

                filteredItems[key] = item;
            });

            renderItemsList(filteredItems);
        }

        function renderItemsList(itemsToShow = null) {
            const items = itemsToShow || getUniqueItems();
            const container = document.getElementById('items-list');

            if (Object.keys(items).length === 0) {
                container.innerHTML = '<div class="text-center text-slate-400 py-8">No items found</div>';
                return;
            }

            // Convert to array and sort by total spent (descending)
            const itemsArray = Object.entries(items).map(([key, item]) => {
                const totalSpent = item.transactions.reduce((sum, t) => sum + t.amt, 0);
                const purchaseCount = item.transactions.length;
                const avgPrice = totalSpent / purchaseCount;

                return { key, ...item, totalSpent, purchaseCount, avgPrice };
            }).sort((a, b) => b.totalSpent - a.totalSpent);

            container.innerHTML = itemsArray.map(item => {
                const isExpense = item.types.has('expense');
                const isIncome = item.types.has('income');
                const typeLabel = isExpense && isIncome ? 'Both' : isExpense ? 'Expense' : 'Income';
                const typeColor = isExpense && isIncome ? 'purple' : isExpense ? 'rose' : 'emerald';
                const encodedItemKey = encodeInlineArg(item.key);
                const safeItemName = escapeHTML(item.name || 'Item');
                const safeCategories = escapeHTML(Array.from(item.categories).join(', '));

                return `
                    <div onclick="openItemDetails(decodeURIComponent('${encodedItemKey}'))" 
                        class="bg-slate-50 p-4 rounded-2xl border border-slate-200 hover:border-${typeColor}-300 hover:bg-${typeColor}-50/30 cursor-pointer transition-all group">
                        <div class="flex items-center justify-between">
                            <div class="flex-1">
                                <div class="flex items-center gap-3 mb-2">
                                    <h4 class="font-bold text-slate-800 text-lg">${safeItemName}</h4>
                                    <span class="text-xs font-bold bg-${typeColor}-100 text-${typeColor}-600 px-2 py-1 rounded-full">${typeLabel}</span>
                                </div>
                                <div class="flex items-center gap-4 text-xs text-slate-500">
                                    <span><i data-lucide="shopping-cart" class="w-3 h-3 inline mr-1"></i>${item.purchaseCount} purchases</span>
                                    <span><i data-lucide="tag" class="w-3 h-3 inline mr-1"></i>${safeCategories}</span>
                                </div>
                            </div>
                            <div class="text-right">
                                <p class="text-xs font-bold text-slate-400 uppercase">Total</p>
                                <p class="text-xl font-bold text-${typeColor}-600">${fmt(item.totalSpent)}</p>
                                <p class="text-xs text-slate-500 mt-1">Avg: ${fmt(item.avgPrice)}</p>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');

            lucide.createIcons();
        }

        function openItemDetails(itemKey) {
            const items = getUniqueItems();
            const item = items[itemKey];
            if (!item) return;

            // Sort transactions by date (oldest first for chart)
            const sortedTxs = [...item.transactions].sort((a, b) =>
                getTxTimestamp(a) - getTxTimestamp(b)
            );

            // Calculate statistics
            const totalSpent = sortedTxs.reduce((sum, t) => sum + t.amt, 0);
            const count = sortedTxs.length;

            // Calculate prices per unit
            const prices = sortedTxs.map(t => {
                const qty = t.quantity || 1;
                return t.amt / qty;
            });

            const avgPrice = prices.reduce((sum, p) => sum + p, 0) / prices.length;
            const maxPrice = Math.max(...prices);
            const minPrice = Math.min(...prices);

            // Update header
            document.getElementById('item-detail-name').innerText = item.name;
            const isExpense = item.types.has('expense');
            const isIncome = item.types.has('income');
            const typeLabel = isExpense && isIncome ? 'Both Expense & Income' : isExpense ? 'Expense Item' : 'Income Item';
            document.getElementById('item-detail-subtitle').innerText = typeLabel;

            // Update stats
            document.getElementById('item-stat-count').innerText = count;
            document.getElementById('item-stat-total').innerText = fmt(totalSpent);
            document.getElementById('item-stat-avg').innerText = fmt(avgPrice);
            document.getElementById('item-stat-max').innerText = fmt(maxPrice);
            document.getElementById('item-stat-min').innerText = fmt(minPrice);

            // Render chart
            renderItemPriceChart(sortedTxs);

            // Render table (newest first for display)
            const tableBody = document.getElementById('item-history-table');
            tableBody.innerHTML = [...sortedTxs].reverse().map(t => {
                const qty = t.quantity || 1;
                const unitPrice = t.amt / qty;

                return `
                    <tr class="hover:bg-slate-50">
                        <td class="p-3 font-bold text-slate-700">${new Date(t.date).toLocaleDateString()}</td>
                        <td class="p-3 text-slate-600">${escapeHTML(t.category)}</td>
                        <td class="p-3 text-right text-slate-600">${qty.toFixed(2)}</td>
                        <td class="p-3 text-right font-bold text-slate-700">${fmt(unitPrice)}</td>
                        <td class="p-3 text-right font-bold text-indigo-600">${fmt(t.amt)}</td>
                    </tr>
                `;
            }).join('');

            toggleModal('item-details-modal');
            lucide.createIcons();
        }

        function renderItemPriceChart(transactions) {
            const ctx = document.getElementById('item-price-chart');

            if (itemPriceChart) {
                itemPriceChart.destroy();
            }

            // Prepare data
            const labels = transactions.map(t => new Date(getTxTimestamp(t)).toLocaleDateString());
            const prices = transactions.map(t => {
                const qty = t.quantity || 1;
                return (t.amt / qty);
            });

            itemPriceChart = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'Unit Price',
                        data: prices,
                        borderColor: '#6366f1',
                        backgroundColor: 'rgba(99, 102, 241, 0.1)',
                        tension: 0.3,
                        fill: true,
                        pointRadius: 5,
                        pointHoverRadius: 7,
                        pointBackgroundColor: '#6366f1',
                        pointBorderColor: '#fff',
                        pointBorderWidth: 2
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            display: false
                        },
                        tooltip: {
                            callbacks: {
                                label: function (context) {
                                    return formatCurrency(context.parsed.y, activeCurrency);
                                }
                            }
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: false,
                            ticks: {
                                callback: function (value) {
                                    return formatCurrency(value, activeCurrency);
                                }
                            }
                        }
                    }
                }
            });
        }
