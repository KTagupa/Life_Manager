        // =============================================
        // SECTION 4: CRYPTO / INVESTING MODULE
        // =============================================


        function openCryptoPortfolio() {
            document.getElementById('crypto-portfolio-modal').classList.remove('hidden');
            renderCryptoPortfolio();
        }

        function openCryptoTransaction() {
            // Reset form
            document.getElementById('c-token-search').value = '';
            document.getElementById('c-token-id').value = '';
            document.getElementById('c-target-token-search').value = '';
            document.getElementById('c-target-token-id').value = '';
            document.getElementById('c-amount').value = '';
            document.getElementById('c-price').value = '';
            document.getElementById('c-notes').value = '';
            document.getElementById('c-date').value = new Date().toISOString().split('T')[0];
            document.getElementById('c-exchange').value = '';
            document.getElementById('c-strategy').value = '';
            document.getElementById('c-total-calc').innerText = fmt(0);
            setCType('buy');

            document.getElementById('crypto-transaction-modal').classList.remove('hidden');
        }

        function setCType(t) {
            document.getElementById('c-type').value = t;
            const bB = document.getElementById('btn-c-buy');
            const bS = document.getElementById('btn-c-sell');
            const bW = document.getElementById('btn-c-swap');

            // Reset classes
            bB.className = "py-2 rounded-xl font-bold text-slate-400";
            bS.className = "py-2 rounded-xl font-bold text-slate-400";
            bW.className = "py-2 rounded-xl font-bold text-slate-400";

            if (t === 'buy') bB.className = "py-2 rounded-xl font-bold bg-white text-emerald-600 shadow-sm";
            else if (t === 'sell') bS.className = "py-2 rounded-xl font-bold bg-white text-rose-600 shadow-sm";
            else if (t === 'swap') bW.className = "py-2 rounded-xl font-bold bg-white text-blue-600 shadow-sm";

            // Visibility Toggles
            const isSwap = t === 'swap';
            const priceContainer = document.getElementById('c-price-container');
            const targetContainer = document.getElementById('c-swap-target-container');
            const targetAmtContainer = document.getElementById('c-target-amount-container');
            const totalContainer = document.getElementById('c-total-display-container');

            if (isSwap) {
                priceContainer.classList.add('hidden');
                totalContainer.classList.add('hidden');
                targetContainer.classList.remove('hidden');
                targetAmtContainer.classList.remove('hidden');

                document.getElementById('lbl-c-token').innerText = 'From Token (Sell)';
                document.getElementById('lbl-c-amount').innerText = 'Sell Quantity';

                // Adjust Grid to fit target amount
                targetAmtContainer.parentElement.classList.remove('grid-cols-2');
                targetAmtContainer.parentElement.classList.add('grid-cols-2');

            } else {
                priceContainer.classList.remove('hidden');
                totalContainer.classList.remove('hidden');
                targetContainer.classList.add('hidden');
                targetAmtContainer.classList.add('hidden');

                document.getElementById('lbl-c-token').innerText = 'Token Name / ID';
                document.getElementById('lbl-c-amount').innerText = 'Quantity';
            }
        }

        async function searchToken(type = 'source') {
            const isTarget = type === 'target';
            const inputId = isTarget ? 'c-target-token-search' : 'c-token-search';
            const resultsId = isTarget ? 'target-token-search-results' : 'token-search-results';
            const idInputId = isTarget ? 'c-target-token-id' : 'c-token-id';
            const symbolInputId = isTarget ? 'c-target-token-symbol' : 'c-token-symbol';

            const query = document.getElementById(inputId).value;
            if (!query) return;
            const resDiv = document.getElementById(resultsId);
            resDiv.innerHTML = '<div class="p-3 text-xs text-slate-400">Searching CoinGecko...</div>';
            resDiv.classList.remove('hidden');

            try {
                const res = await fetch(`https://api.coingecko.com/api/v3/search?query=${query}`);
                const data = await res.json();
                const coins = data.coins.slice(0, 10);

                resDiv.innerHTML = '';
                if (coins.length === 0) {
                    resDiv.innerHTML = '<div class="p-3 text-xs text-slate-400">No coins found.</div>';
                    return;
                }

                coins.forEach(c => {
                    const safeName = escapeHTML(c.name || '');
                    const safeSymbol = escapeHTML(c.symbol || '');
                    const safeLogo = encodeURI(c.large || '');
                    const div = document.createElement('div');
                    div.className = "p-3 hover:bg-slate-50 cursor-pointer flex items-center gap-3 border-b border-slate-50 last:border-0";
                    div.onclick = () => {
                        document.getElementById(inputId).value = c.name;
                        document.getElementById(idInputId).value = c.id;
                        document.getElementById(symbolInputId).value = c.symbol;
                        resDiv.classList.add('hidden');
                    };
                    div.innerHTML = `
                        <img src="${safeLogo}" class="w-6 h-6 rounded-full">
                        <div>
                            <p class="text-sm font-bold text-slate-700">${safeName}</p>
                            <p class="text-[10px] text-slate-400 font-bold uppercase">${safeSymbol}</p>
                        </div>
                    `;
                    resDiv.appendChild(div);
                });
            } catch (e) {
                resDiv.innerHTML = '<div class="p-3 text-xs text-rose-400">API Error. Try again.</div>';
            }
        }

        function calcCryptoTotal() {
            const amt = parseFloat(document.getElementById('c-amount').value) || 0;
            const prc = parseFloat(document.getElementById('c-price').value) || 0;
            const cur = document.getElementById('c-currency').value;

            const total = amt * prc;
            document.getElementById('c-total-calc').innerText = formatCurrency(total, cur);

            if (cur !== 'PHP') {
                const phpVal = convertToDisplayCurrency(total, cur, 'PHP');
                document.getElementById('c-total-base-preview').innerText = `≈ ${formatCurrency(phpVal, 'PHP')}`;
            } else {
                document.getElementById('c-total-base-preview').innerText = '';
            }
        }

        async function saveCryptoTransaction() {
            const tokenId = document.getElementById('c-token-id').value;
            const tokenSymbol = document.getElementById('c-token-symbol').value;
            const amount = parseFloat(document.getElementById('c-amount').value);
            const notes = document.getElementById('c-notes').value;
            const dateVal = document.getElementById('c-date').value;
            const type = document.getElementById('c-type').value;
            const exchange = document.getElementById('c-exchange').value;
            const strategy = document.getElementById('c-strategy').value;
            const date = dateVal ? new Date(dateVal).toISOString() : new Date().toISOString();

            const db = await getDB();

            if (type === 'swap') {
                const targetTokenId = document.getElementById('c-target-token-id').value;
                const targetTokenSymbol = document.getElementById('c-target-token-symbol').value;
                const targetAmount = parseFloat(document.getElementById('c-target-amount').value);

                if (!tokenId || !amount || !targetTokenId || !targetAmount) { alert("Please fill details"); return; }

                const swapId = Date.now().toString(36) + Math.random().toString(36).substr(2, 5);

                // Transaction 1: Swap Out (Sell Source)
                // We use 'swap_out' type. It behaves like sell but doesn't trigger realized P/L
                const txOut = {
                    tokenId,
                    symbol: tokenSymbol || tokenId,
                    amount,
                    price: 0, // Calculated dynamically during swap logic or can be estimated
                    currency: 'PHP',
                    phpPrice: 0,
                    phpTotal: 0,
                    total: 0,
                    type: 'swap_out',
                    swapId,
                    linkedToken: targetTokenSymbol,
                    notes, exchange, strategy, date
                };

                // Transaction 2: Swap In (Buy Target)
                // We use 'swap_in' type. It inherits cost basis from swap_out.
                const txIn = {
                    tokenId: targetTokenId,
                    symbol: targetTokenSymbol || targetTokenId,
                    amount: targetAmount,
                    price: 0,
                    currency: 'PHP',
                    phpPrice: 0,
                    phpTotal: 0, // Will be set equal to cost basis of txOut
                    total: 0,
                    type: 'swap_in',
                    swapId,
                    linkedToken: tokenSymbol,
                    notes, exchange, strategy, date
                };

                db.crypto.push({ id: swapId + '_out', data: await encryptData(txOut), deletedAt: null });
                db.crypto.push({ id: swapId + '_in', data: await encryptData(txIn), deletedAt: null });

            } else {
                // Regular Buy/Sell
                const price = parseFloat(document.getElementById('c-price').value);
                const currency = document.getElementById('c-currency').value;

                if (!tokenId || !amount || !price) { alert("Please fill details"); return; }

                // Convert to PHP for base storage consistency
                const phpPrice = convertToDisplayCurrency(price, currency, 'PHP');
                const phpTotal = amount * phpPrice;

                // Store transaction
                const txData = {
                    tokenId,
                    symbol: tokenSymbol || tokenId,
                    amount,
                    price,
                    currency,
                    phpPrice,
                    phpTotal,
                    total: phpTotal, // Maintain compatibility with existing logic which uses .total as PHP
                    type,
                    notes,
                    exchange,
                    strategy,
                    date: date
                };
                const encrypted = await encryptData(txData);
                db.crypto.push({
                    id: Date.now().toString(36),
                    data: encrypted,
                    deletedAt: null
                });
            }

            await saveDB(db);

            rawCrypto = (db.crypto || []).filter(c => !c.deletedAt);
            toggleModal('crypto-transaction-modal');
            renderCryptoWidget(); // Refresh dashboard
            if (!document.getElementById('crypto-portfolio-modal').classList.contains('hidden')) {
                renderCryptoPortfolio(); // Refresh modal if open
            }
        }

        async function getDecryptedCrypto() {
            const txs = await Promise.all(rawCrypto.map(async item => {
                const d = await decryptData(item.data);
                return d ? { ...d, id: item.id } : null;
            }));
            // Sort: oldest first for math, but we return sorted by date (newest first) for display usually
            // Here we return newest first
            return txs.filter(x => x).sort((a, b) => new Date(b.date) - new Date(a.date));
        }

        function calculateWeightedHoldingDays(lots) {
            const now = Date.now();
            let weightedDays = 0;
            let totalAmount = 0;

            (lots || []).forEach(lot => {
                if (!lot || lot.amount <= 0.000001) return;
                const lotTime = new Date(lot.date).getTime();
                if (!Number.isFinite(lotTime)) return;

                const ageDays = Math.max(0, (now - lotTime) / (1000 * 60 * 60 * 24));
                weightedDays += lot.amount * ageDays;
                totalAmount += lot.amount;
            });

            return totalAmount > 0 ? (weightedDays / totalAmount) : 0;
        }

        async function calculateHoldings(method = 'fifo') {
            const txs = await getDecryptedCrypto();
            const holdings = {};
            // holdings structure: 
            // { 'bitcoin': { amount: 0, totalCost: 0, realizedPL: 0, symbol: 'BTC', lots: [] } }

            // Process oldest first
            const sorted = [...txs].reverse();
            const pendingSwaps = {}; // Stores cost basis for swaps: { swapId: totalCostTransferred }

            sorted.forEach(tx => {
                if (!holdings[tx.tokenId]) {
                    holdings[tx.tokenId] = {
                        amount: 0,
                        totalCost: 0,
                        realizedPL: 0,
                        symbol: tx.symbol,
                        lots: [] // For FIFO/LIFO tracking: { amount, price, date }
                    };
                }
                const h = holdings[tx.tokenId];

                if (tx.type === 'buy') {
                    h.amount += tx.amount;
                    h.totalCost += tx.total;
                    h.lots.push({
                        amount: tx.amount,
                        price: tx.phpPrice,
                        total: tx.total,
                        date: tx.date
                    });

                } else if (tx.type === 'sell' || tx.type === 'swap_out') {
                    // Sell or Swap Out Logic
                    let costOfSold = 0;
                    let remainingToSell = tx.amount;
                    let soldAmount = 0;

                    if (method === 'avg') {
                        const totalAmountBeforeSell = h.amount;
                        soldAmount = Math.min(tx.amount, totalAmountBeforeSell);
                        const avgPrice = totalAmountBeforeSell > 0 ? (h.totalCost / totalAmountBeforeSell) : 0;
                        costOfSold = avgPrice * soldAmount;
                        h.totalCost -= costOfSold;

                        // Keep lot ages meaningful for holding-time metrics by reducing each lot proportionally.
                        if (totalAmountBeforeSell > 0 && h.lots.length > 0) {
                            const remainingRatio = Math.max((totalAmountBeforeSell - soldAmount) / totalAmountBeforeSell, 0);
                            h.lots = h.lots
                                .map(lot => {
                                    const newAmount = lot.amount * remainingRatio;
                                    return {
                                        ...lot,
                                        amount: newAmount,
                                        total: newAmount * lot.price
                                    };
                                })
                                .filter(lot => lot.amount > 0.000001);
                        }

                        // Recalculate from remaining lots to minimize floating-point drift.
                        h.totalCost = h.lots.reduce((sum, l) => sum + (l.amount * l.price), 0);
                    } else {
                        // FIFO/LIFO
                        while (remainingToSell > 0.000001 && h.lots.length > 0) {
                            const lotIndex = method === 'fifo' ? 0 : h.lots.length - 1;
                            const lot = h.lots[lotIndex];

                            if (lot.amount <= remainingToSell) {
                                costOfSold += (lot.amount * lot.price);
                                remainingToSell -= lot.amount;
                                soldAmount += lot.amount;
                                h.lots.splice(lotIndex, 1);
                            } else {
                                const lotCost = remainingToSell * lot.price;
                                costOfSold += lotCost;
                                lot.amount -= remainingToSell;
                                soldAmount += remainingToSell;
                                remainingToSell = 0;
                            }
                        }
                        // Recalculate total cost from remaining lots to prevent drift
                        h.totalCost = h.lots.reduce((sum, l) => sum + (l.amount * l.price), 0);
                    }

                    h.amount -= soldAmount;

                    if (tx.type === 'sell') {
                        h.realizedPL += (tx.total - costOfSold);
                    } else if (tx.type === 'swap_out') {
                        // For swap, we defer the P/L.
                        // We store the 'costOfSold' (which is the cost basis of the tokens leaving)
                        // to be applied to the incoming token.
                        if (tx.swapId) {
                            pendingSwaps[tx.swapId] = costOfSold;
                        }
                    }

                } else if (tx.type === 'swap_in') {
                    // Swap In Logic
                    const transferredCost = pendingSwaps[tx.swapId] || 0;

                    h.amount += tx.amount;
                    h.totalCost += transferredCost; // Add the transferred cost basis

                    // The "price" effectively becomes (Transferred Cost / New Amount)
                    const effectivePrice = tx.amount > 0 ? (transferredCost / tx.amount) : 0;

                    h.lots.push({
                        amount: tx.amount,
                        price: effectivePrice,
                        total: transferredCost,
                        date: tx.date
                    });
                }
            });

            return holdings;
        }

        async function fetchCryptoPrices() {
            const holdings = await calculateHoldings();
            const ids = Object.keys(holdings).filter(k => holdings[k].amount > 0.000001);
            const statusEl = document.getElementById('crypto-last-updated');

            if (ids.length === 0) {
                if (statusEl) statusEl.innerText = "No assets to track";
                return;
            }

            // FIX: Target the button by ID, then finding the SVG (since Lucide replaces <i> with <svg>)
            const btn = document.getElementById('btn-refresh-crypto');
            const icon = btn ? btn.querySelector('svg') : null;

            if (icon) icon.classList.add('animate-spin');
            if (statusEl) statusEl.innerText = "Updating prices...";

            try {
                // Using PHP as base currency since app is PHP-centric
                const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${ids.join(',')}&vs_currencies=php,usd,jpy`);
                if (!res.ok) throw new Error("API Limit or Error");
                const data = await res.json();

                // Update cache
                const db = await getDB();
                const now = Date.now();
                Object.keys(data).forEach(id => {
                    db.crypto_prices[id] = {
                        php: data[id].php,
                        usd: data[id].usd,
                        jpy: data[id].jpy,
                        price: data[id].php, // Backward compatibility
                        updated: now
                    };
                });
                await saveDB(db);
                cryptoPrices = db.crypto_prices;
                renderCryptoPortfolio();
            } catch (e) {
                console.error(e);
                if (statusEl) statusEl.innerText = "Update Failed (Rate Limit?)";
                alert("Could not fetch prices. The free API might be rate-limited. Please try again in a minute.");
            } finally {
                if (icon) icon.classList.remove('animate-spin');
            }
        }

        async function renderCryptoWidget() {
            const holdings = await calculateHoldings();
            let totalVal = 0;
            let unrealizedPL = 0;

            Object.entries(holdings).forEach(([id, h]) => {
                if (h.amount <= 0.000001) return;
                const currentPrice = cryptoPrices[id]?.price || 0; // Use cached price
                const val = h.amount * currentPrice;
                const avgPrice = h.totalCost / h.amount;

                if (currentPrice > 0) {
                    totalVal += val;
                    unrealizedPL += (currentPrice - avgPrice) * h.amount;
                } else {
                    // Fallback: value at cost if no price
                    totalVal += h.totalCost;
                }
            });

            document.getElementById('crypto-total-display').innerText = fmt(totalVal);
            const plSpan = document.getElementById('crypto-pnl-display');
            plSpan.innerText = (unrealizedPL >= 0 ? '+' : '') + fmt(unrealizedPL);
            plSpan.className = `text-xs font-bold ${unrealizedPL >= 0 ? 'text-emerald-400' : 'text-rose-400'}`;
        }

        async function renderCryptoPortfolio() {
            let taxMethod = document.getElementById('cost-basis-method')?.value || 'fifo';
            if (taxMethod === 'average') taxMethod = 'avg';
            const holdings = await calculateHoldings(taxMethod);
            const list = document.getElementById('crypto-holdings-list');
            list.innerHTML = '';

            let totalVal = 0, totalInvested = 0, totalRealized = 0, totalUnrealized = 0;
            let lastUpdate = 0;

            let bestPerf = { symbol: '-', pct: -Infinity };
            let worstPerf = { symbol: '-', pct: Infinity };

            // RENDER HOLDINGS
            Object.entries(holdings).forEach(([id, h]) => {
                if (h.amount <= 0.000001 && Math.abs(h.realizedPL) < 1) return;

                const cache = cryptoPrices[id];
                const currentPrice = cache?.price || 0;
                if (cache?.updated > lastUpdate) lastUpdate = cache.updated;

                const value = h.amount * currentPrice;
                const avgPrice = h.amount > 0 ? h.totalCost / h.amount : 0;
                const unrealized = currentPrice > 0 ? (value - h.totalCost) : 0;
                const pnlPct = h.totalCost > 0 ? (unrealized / h.totalCost) * 100 : 0;
                const weightedHoldingDays = calculateWeightedHoldingDays(h.lots);

                if (h.amount > 0.000001) {
                    totalVal += value;
                    totalInvested += h.totalCost;
                    totalUnrealized += unrealized;

                    // Track Best/Worst
                    if (pnlPct > bestPerf.pct) bestPerf = { symbol: h.symbol, pct: pnlPct };
                    if (pnlPct < worstPerf.pct) worstPerf = { symbol: h.symbol, pct: pnlPct };
                }
                totalRealized += h.realizedPL;

                if (h.amount > 0.000001) {
                    const safeSymbol = escapeHTML((h.symbol || '').toUpperCase());
                    const safeTokenId = escapeHTML(id);
                    const div = document.createElement('div');
                    div.className = "bg-slate-800 p-4 rounded-2xl flex items-center justify-between border border-slate-700";
                    div.innerHTML = `
                        <div>
                            <div class="flex items-center gap-2">
                                <h4 class="font-bold text-white">${safeSymbol}</h4>
                                <span class="text-[10px] bg-slate-700 text-slate-400 px-1.5 rounded">${safeTokenId}</span>
                            </div>
                            <p class="text-xs text-slate-400 mt-1">${h.amount.toFixed(4)} tokens @ ${fmt(avgPrice)} avg</p>
                            <p class="text-[10px] text-slate-500 mt-0.5">Invested: ${fmt(h.totalCost)} • Avg hold: ${weightedHoldingDays.toFixed(1)} days</p>
                            <p class="text-[10px] text-slate-500 mt-0.5">${taxMethod.toUpperCase()} Basis</p>
                        </div>
                        <div class="text-right">
                            <p class="font-bold text-white">${currentPrice > 0 ? fmt(value) : 'Needs Update'}</p>
                            <p class="text-xs font-bold ${unrealized >= 0 ? 'text-emerald-500' : 'text-rose-500'}">
                                ${currentPrice > 0 ? pnlPct.toFixed(1) + '%' : '--'}
                            </p>
                             <p class="text-[10px] text-slate-500">${unrealized >= 0 ? '+' : ''}${fmt(unrealized)}</p>
                        </div>
                    `;
                    list.appendChild(div);
                }
            });

            // RENDER HISTORY
            const historyList = document.getElementById('crypto-history-list');
            historyList.innerHTML = '';
            const allTxs = await getDecryptedCrypto();

            if (allTxs.length === 0) {
                historyList.innerHTML = '<div class="text-slate-600 text-xs italic">No history available.</div>';
            } else {
                allTxs.forEach(tx => {
                    const div = document.createElement('div');
                    div.className = "flex justify-between items-center py-2 px-2 hover:bg-slate-800 rounded-lg group";
                    const isBuy = tx.type === 'buy';
                    const isSwap = tx.type === 'swap_in' || tx.type === 'swap_out';
                    let icon = isBuy ? 'arrow-down-left' : 'arrow-up-right';
                    let colorClass = isBuy ? 'bg-emerald-900/30 text-emerald-400' : 'bg-rose-900/30 text-rose-400';
                    let actionText = isBuy ? 'Bought' : 'Sold';

                    if (isSwap) {
                        icon = 'refresh-cw';
                        colorClass = 'bg-blue-900/30 text-blue-400';
                        if (tx.type === 'swap_out') actionText = `Swapped ${tx.symbol.toUpperCase()} for ${tx.linkedToken || '?'}`;
                        else actionText = `Received ${tx.symbol.toUpperCase()} (Swap)`;
                    }

                    const safeActionText = escapeHTML(actionText);
                    const safeSellSymbol = escapeHTML(tx.symbol ? tx.symbol.toUpperCase() : '');
                    const encodedTxId = encodeInlineArg(tx.id);

                    div.innerHTML = `
                        <div class="flex items-center gap-3">
                             <div class="w-8 h-8 rounded-full flex items-center justify-center ${colorClass}">
                                 <i data-lucide="${icon}" class="w-4 h-4"></i>
                             </div>
                             <div>
                                 <p class="text-sm font-bold text-slate-300 mobile-text-clip">${safeActionText} ${!isSwap && !isBuy ? safeSellSymbol : ''}</p>
                                 <p class="text-[10px] text-slate-500">${new Date(tx.date).toLocaleDateString()} ${!isSwap ? '• ' + formatCurrency(tx.price, tx.currency || 'PHP') + '/token' : ''}</p>
                             </div>
                        </div>
                         <div class="flex items-center gap-3">
                              <div class="text-right">
                                  <p class="text-sm font-bold text-slate-300">${!isSwap ? formatCurrency(tx.price * tx.amount, tx.currency || 'PHP') : ''}</p>
                                  <p class="text-[10px] text-slate-500">${tx.amount} tokens</p>
                              </div>
                             <button onclick="deleteItem('crypto', decodeURIComponent('${encodedTxId}'))" class="text-slate-600 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-opacity">
                                <i data-lucide="trash-2" class="w-4 h-4"></i>
                             </button>
                        </div>
                     `;
                    historyList.appendChild(div);
                });
            }

            // Update Header Stats
            document.getElementById('cp-current-val').innerText = fmt(totalVal);
            document.getElementById('cp-invested').innerText = fmt(totalInvested);

            const rEl = document.getElementById('cp-realized');
            rEl.innerText = (totalRealized >= 0 ? '+' : '') + fmt(totalRealized);
            rEl.className = `text-xl font-bold mt-1 ${totalRealized >= 0 ? 'text-emerald-400' : 'text-rose-400'}`;

            const uEl = document.getElementById('cp-unrealized');
            uEl.innerText = (totalUnrealized >= 0 ? '+' : '') + fmt(totalUnrealized);
            uEl.className = `text-xl font-bold mt-1 ${totalUnrealized >= 0 ? 'text-emerald-400' : 'text-rose-400'}`;

            // ROI & Best/Worst
            const roi = totalInvested > 0 ? ((totalVal - totalInvested) / totalInvested) * 100 : 0;
            const roiEl = document.getElementById('cp-roi');
            if (roiEl) {
                roiEl.innerText = (roi >= 0 ? '+' : '') + roi.toFixed(1) + '%';
                roiEl.className = `text-lg font-bold ${roi >= 0 ? 'text-emerald-400' : 'text-rose-400'}`;
            }

            const bestEl = document.getElementById('cp-best-perf');
            if (bestEl) bestEl.innerText = bestPerf.symbol !== '-' ? `${bestPerf.symbol} (${bestPerf.pct > 0 ? '+' : ''}${bestPerf.pct.toFixed(0)}%)` : '-';

            const worstEl = document.getElementById('cp-worst-perf');
            if (worstEl) worstEl.innerText = worstPerf.symbol !== '-' ? `${worstPerf.symbol} (${worstPerf.pct > 0 ? '+' : ''}${worstPerf.pct.toFixed(0)}%)` : '-';

            const timeStr = lastUpdate > 0 ? new Date(lastUpdate).toLocaleTimeString() : 'Never';
            document.getElementById('crypto-last-updated').innerText = `Prices updated: ${timeStr}`;

            // Sync widget too
            renderCryptoWidget();

            // New Renderers
            renderCryptoAllocationChart(holdings);
            renderInvestmentGoals();
            calculateTaxSummary(holdings);

            lucide.createIcons();
        }

        function renderCryptoAllocationChart(holdings) {
            const ctx = document.getElementById('cryptoAllocationChart');
            if (!ctx) return;

            if (cryptoAllocationChart) {
                cryptoAllocationChart.destroy();
            }

            const labels = [];
            const data = [];
            const colors = ['#6366f1', '#10b981', '#f43f5e', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#64748b'];

            Object.entries(holdings).forEach(([id, h]) => {
                if (h.amount <= 0.000001) return;
                const currentPrice = cryptoPrices[id]?.price || 0;
                const value = h.amount * currentPrice;
                if (value > 0) {
                    labels.push(h.symbol.toUpperCase());
                    data.push(value);
                }
            });

            cryptoAllocationChart = new Chart(ctx, {
                type: 'doughnut',
                data: {
                    labels: labels,
                    datasets: [{
                        data: data,
                        backgroundColor: colors.slice(0, data.length),
                        borderWidth: 0
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { position: 'right', labels: { boxWidth: 10, usePointStyle: true, font: { size: 10 }, color: '#94a3b8' } }
                    },
                    cutout: '70%'
                }
            });
        }

        // --- INVESTMENT GOALS ---
        function openGoalModal() {
            document.getElementById('goal-name').value = '';
            document.getElementById('goal-target').value = '';
            document.getElementById('goal-date').value = '';
            toggleModal('goal-modal');
        }

        async function saveInvestmentGoal() {
            const name = document.getElementById('goal-name').value;
            const target = parseFloat(document.getElementById('goal-target').value);
            const date = document.getElementById('goal-date').value;

            if (!name || !target) return;

            const newGoal = {
                id: 'goal_' + Date.now(),
                name,
                targetAmount: target,
                targetDate: date,
                createdAt: new Date().toISOString()
            };

            investmentGoals.push(newGoal);

            // Save to DB
            const db = await getDB();
            db.investment_goals = investmentGoals;
            await saveDB(db);

            toggleModal('goal-modal');
            renderInvestmentGoals();
        }

        async function deleteGoal(id) {
            if (!confirm('Delete this goal?')) return;
            investmentGoals = investmentGoals.filter(g => g.id !== id);

            const db = await getDB();
            db.investment_goals = investmentGoals;
            await saveDB(db);

            renderInvestmentGoals();
        }

        async function renderInvestmentGoals() {
            const list = document.getElementById('investment-goals-list');
            if (!list) return;

            list.innerHTML = '';

            if (investmentGoals.length === 0) {
                list.innerHTML = '<div class="text-center py-4 text-slate-600 text-sm">No goals set. Add one to track your progress!</div>';
                return;
            }

            // Calculate current total crypto value for progress checking
            // In a real app, you might want goals to link to specific assets, but for now we track against total portfolio value
            const holdings = await calculateHoldings();
            let currentTotalValue = 0;
            Object.entries(holdings).forEach(([id, h]) => {
                const price = cryptoPrices[id]?.price || 0;
                currentTotalValue += h.amount * price;
            });

            investmentGoals.forEach(g => {
                const progress = Math.min((currentTotalValue / g.targetAmount) * 100, 100);
                const isMet = currentTotalValue >= g.targetAmount;
                const dateStr = g.targetDate ? new Date(g.targetDate).toLocaleDateString() : 'No deadline';
                const safeGoalName = escapeHTML(g.name || 'Goal');
                const safeGoalDate = escapeHTML(dateStr);
                const encodedGoalId = encodeInlineArg(g.id);

                const div = document.createElement('div');
                div.className = "bg-slate-900/40 p-3 rounded-xl border border-slate-700/50 relative group";
                div.innerHTML = `
                    <div class="flex justify-between items-center mb-2">
                        <div>
                            <p class="font-bold text-slate-300 text-sm">${safeGoalName}</p>
                            <p class="text-[10px] text-slate-500">Target: ${fmt(g.targetAmount)} • ${safeGoalDate}</p>
                        </div>
                        <button onclick="deleteGoal(decodeURIComponent('${encodedGoalId}'))" class="text-slate-500 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-opacity">
                            <i data-lucide="trash-2" class="w-3 h-3"></i>
                        </button>
                    </div>
                    <div class="relative h-2 bg-slate-700 rounded-full overflow-hidden">
                        <div class="absolute top-0 left-0 h-full ${isMet ? 'bg-emerald-500' : 'bg-amber-500'} transition-all duration-1000" style="width: ${progress}%"></div>
                    </div>
                    <div class="flex justify-between mt-1">
                        <span class="text-[10px] text-slate-500">${progress.toFixed(1)}%</span>
                        <span class="text-[10px] ${isMet ? 'text-emerald-400 font-bold' : 'text-slate-500'}">${isMet ? 'GOAL MET! 🎉' : fmt(g.targetAmount - currentTotalValue) + ' to go'}</span>
                    </div>
                `;
                list.appendChild(div);
            });
            lucide.createIcons();
        }

        // --- TAX & METRICS ---
        function calculateTaxSummary(holdings) {
            let totalGains = 0;
            let totalLosses = 0;

            Object.values(holdings).forEach(h => {
                if (h.realizedPL > 0) totalGains += h.realizedPL;
                else totalLosses += Math.abs(h.realizedPL);
            });

            const net = totalGains - totalLosses;

            document.getElementById('tax-gains').innerText = fmt(totalGains);
            document.getElementById('tax-losses').innerText = fmt(totalLosses);

            const netEl = document.getElementById('tax-net');
            netEl.innerText = (net >= 0 ? '+' : '-') + fmt(Math.abs(net));
            netEl.className = `text-sm font-bold mt-1 ${net >= 0 ? 'text-emerald-400' : 'text-rose-400'}`;
        }
