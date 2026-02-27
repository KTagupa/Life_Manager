        // =============================================
        // SECTION 4: CRYPTO / INVESTING MODULE
        // =============================================

        let cryptoComputationCache = {
            sourceRef: null,
            length: -1,
            decryptedTxs: null,
            pendingDecryptPromise: null,
            holdingsByMethod: new Map()
        };

        function invalidateCryptoComputationCache() {
            cryptoComputationCache.sourceRef = null;
            cryptoComputationCache.length = -1;
            cryptoComputationCache.decryptedTxs = null;
            cryptoComputationCache.pendingDecryptPromise = null;
            cryptoComputationCache.holdingsByMethod = new Map();
        }

        function ensureCryptoComputationCacheFresh() {
            const source = rawCrypto || [];
            if (cryptoComputationCache.sourceRef !== source || cryptoComputationCache.length !== source.length) {
                cryptoComputationCache.sourceRef = source;
                cryptoComputationCache.length = source.length;
                cryptoComputationCache.decryptedTxs = null;
                cryptoComputationCache.pendingDecryptPromise = null;
                cryptoComputationCache.holdingsByMethod = new Map();
            }
        }

        function normalizeCostBasisMethod(method) {
            if (method === 'average') return 'avg';
            return method || 'fifo';
        }


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
            invalidateCryptoComputationCache();
            toggleModal('crypto-transaction-modal');
            renderCryptoWidget(); // Refresh dashboard
            if (!document.getElementById('crypto-portfolio-modal').classList.contains('hidden')) {
                renderCryptoPortfolio(); // Refresh modal if open
            }
            if (typeof refreshStatementsModuleUI === 'function') {
                refreshStatementsModuleUI();
            }
            if (typeof refreshForecastModuleUI === 'function') {
                refreshForecastModuleUI();
            }
        }

        async function getDecryptedCrypto() {
            ensureCryptoComputationCacheFresh();
            if (cryptoComputationCache.decryptedTxs) {
                return cryptoComputationCache.decryptedTxs;
            }
            if (cryptoComputationCache.pendingDecryptPromise) {
                return cryptoComputationCache.pendingDecryptPromise;
            }

            cryptoComputationCache.pendingDecryptPromise = Promise.all((rawCrypto || []).map(async item => {
                const d = await decryptData(item.data);
                return d ? { ...d, id: item.id } : null;
            })).then(txs => txs
                .filter(x => x)
                .sort((a, b) => new Date(b.date) - new Date(a.date)));

            try {
                const decrypted = await cryptoComputationCache.pendingDecryptPromise;
                cryptoComputationCache.decryptedTxs = decrypted;
                // Sort: oldest first for math, but we return sorted by date (newest first) for display usually
                // Here we return newest first
                return decrypted;
            } finally {
                cryptoComputationCache.pendingDecryptPromise = null;
            }
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

        function normalizeCryptoInterestEntry(entry) {
            const rewards = Array.isArray(entry?.rewards) ? entry.rewards : [];
            return {
                enabled: !!entry?.enabled,
                rewards: rewards
                    .map(reward => {
                        const rewardTokenId = String(reward?.tokenId || '').trim();
                        if (!rewardTokenId) return null;
                        const parsedAmount = Number(reward?.amount);
                        return {
                            tokenId: rewardTokenId,
                            symbol: String(reward?.symbol || rewardTokenId).trim() || rewardTokenId,
                            amount: Number.isFinite(parsedAmount) ? Math.max(parsedAmount, 0) : 0
                        };
                    })
                    .filter(Boolean),
                lastModified: Number.isFinite(Number(entry?.lastModified)) ? Number(entry.lastModified) : 0
            };
        }

        function getCryptoInterestEntry(tokenId) {
            const source = cryptoInterestByToken && typeof cryptoInterestByToken === 'object' ? cryptoInterestByToken : {};
            return normalizeCryptoInterestEntry(source[tokenId]);
        }

        function setCryptoInterestEntry(tokenId, nextEntry) {
            cryptoInterestByToken = cryptoInterestByToken && typeof cryptoInterestByToken === 'object' ? cryptoInterestByToken : {};
            cryptoInterestByToken[tokenId] = normalizeCryptoInterestEntry(nextEntry);
        }

        let cryptoInterestPersistTimer = null;
        let cryptoInterestPersistInFlight = false;
        let cryptoInterestPersistQueued = false;
        let cryptoInterestRenderQueued = false;
        let cryptoPortfolioRenderContext = null;
        const cryptoInterestRenderTokenIds = new Set();

        async function persistCryptoInterestStateNow() {
            const db = await getDB();
            db.crypto_interest = cryptoInterestByToken && typeof cryptoInterestByToken === 'object' ? cryptoInterestByToken : {};
            const saved = await saveDB(db);
            cryptoInterestByToken = saved.crypto_interest || {};
        }

        async function flushCryptoInterestPersistence() {
            if (cryptoInterestPersistInFlight) {
                cryptoInterestPersistQueued = true;
                return;
            }

            cryptoInterestPersistInFlight = true;
            try {
                do {
                    cryptoInterestPersistQueued = false;
                    await persistCryptoInterestStateNow();
                } while (cryptoInterestPersistQueued);
            } catch (error) {
                console.error('Failed to persist crypto interest settings.', error);
            } finally {
                cryptoInterestPersistInFlight = false;
            }
        }

        function scheduleCryptoInterestPersistence(delayMs = 250) {
            cryptoInterestPersistQueued = true;
            if (cryptoInterestPersistTimer) clearTimeout(cryptoInterestPersistTimer);
            cryptoInterestPersistTimer = setTimeout(() => {
                cryptoInterestPersistTimer = null;
                flushCryptoInterestPersistence();
            }, Math.max(0, delayMs));
        }

        function queueCryptoInterestRender(tokenId) {
            if (tokenId) {
                cryptoInterestRenderTokenIds.add(tokenId);
            }
            if (cryptoInterestRenderQueued) return;

            cryptoInterestRenderQueued = true;
            requestAnimationFrame(() => {
                cryptoInterestRenderQueued = false;
                const tokenIds = Array.from(cryptoInterestRenderTokenIds);
                cryptoInterestRenderTokenIds.clear();

                (async () => {
                    if (tokenIds.length === 0) {
                        await renderCryptoPortfolio();
                        return;
                    }

                    let needsFullRender = false;
                    for (const id of tokenIds) {
                        const updated = await renderCryptoHoldingCardByTokenId(id);
                        if (!updated) {
                            needsFullRender = true;
                            break;
                        }
                    }

                    if (needsFullRender) {
                        await renderCryptoPortfolio();
                    }
                })().catch(error => {
                    console.error('Failed to render crypto portfolio after interest update.', error);
                });
            });
        }

        async function setCryptoInterestEnabled(tokenIdEncoded, checked) {
            const tokenId = decodeURIComponent(tokenIdEncoded || '');
            if (!tokenId) return;
            const current = getCryptoInterestEntry(tokenId);
            setCryptoInterestEntry(tokenId, {
                ...current,
                enabled: !!checked,
                lastModified: Date.now()
            });
            queueCryptoInterestRender(tokenId);
            scheduleCryptoInterestPersistence(0);
        }

        async function addCryptoInterestReward(tokenIdEncoded) {
            const tokenId = decodeURIComponent(tokenIdEncoded || '');
            if (!tokenId) return;
            const current = getCryptoInterestEntry(tokenId);
            const nextRewards = [...(current.rewards || []), { tokenId, symbol: tokenId, amount: 0 }];
            setCryptoInterestEntry(tokenId, {
                ...current,
                enabled: true,
                rewards: nextRewards,
                lastModified: Date.now()
            });
            queueCryptoInterestRender(tokenId);
            scheduleCryptoInterestPersistence();
        }

        async function updateCryptoInterestRewardToken(tokenIdEncoded, rewardIndexRaw, rewardTokenId) {
            const tokenId = decodeURIComponent(tokenIdEncoded || '');
            const rewardIndex = Number(rewardIndexRaw);
            const cleanedRewardTokenId = String(rewardTokenId || '').trim();
            if (!tokenId || !Number.isInteger(rewardIndex) || rewardIndex < 0 || !cleanedRewardTokenId) return;

            const current = getCryptoInterestEntry(tokenId);
            const nextRewards = [...(current.rewards || [])];
            if (!nextRewards[rewardIndex]) return;
            nextRewards[rewardIndex] = {
                ...nextRewards[rewardIndex],
                tokenId: cleanedRewardTokenId,
                symbol: cleanedRewardTokenId
            };
            setCryptoInterestEntry(tokenId, {
                ...current,
                rewards: nextRewards,
                lastModified: Date.now()
            });
            queueCryptoInterestRender(tokenId);
            scheduleCryptoInterestPersistence();
        }

        async function updateCryptoInterestRewardAmount(tokenIdEncoded, rewardIndexRaw, amountRaw) {
            const tokenId = decodeURIComponent(tokenIdEncoded || '');
            const rewardIndex = Number(rewardIndexRaw);
            if (!tokenId || !Number.isInteger(rewardIndex) || rewardIndex < 0) return;

            const current = getCryptoInterestEntry(tokenId);
            const nextRewards = [...(current.rewards || [])];
            if (!nextRewards[rewardIndex]) return;
            const parsedAmount = Number(amountRaw);
            nextRewards[rewardIndex] = {
                ...nextRewards[rewardIndex],
                amount: Number.isFinite(parsedAmount) ? Math.max(parsedAmount, 0) : 0
            };
            setCryptoInterestEntry(tokenId, {
                ...current,
                rewards: nextRewards,
                lastModified: Date.now()
            });
            queueCryptoInterestRender(tokenId);
            scheduleCryptoInterestPersistence(350);
        }

        async function removeCryptoInterestReward(tokenIdEncoded, rewardIndexRaw) {
            const tokenId = decodeURIComponent(tokenIdEncoded || '');
            const rewardIndex = Number(rewardIndexRaw);
            if (!tokenId || !Number.isInteger(rewardIndex) || rewardIndex < 0) return;

            const current = getCryptoInterestEntry(tokenId);
            const nextRewards = (current.rewards || []).filter((_, idx) => idx !== rewardIndex);
            setCryptoInterestEntry(tokenId, {
                ...current,
                rewards: nextRewards,
                lastModified: Date.now()
            });
            queueCryptoInterestRender(tokenId);
            scheduleCryptoInterestPersistence();
        }

        function buildCryptoTokenUniverse(holdings, txs) {
            const map = new Map();
            Object.entries(holdings || {}).forEach(([id, h]) => {
                if (!id) return;
                const symbol = String(h?.symbol || id).toUpperCase();
                map.set(id, symbol);
            });
            (txs || []).forEach(tx => {
                if (!tx?.tokenId) return;
                const symbol = String(tx.symbol || tx.tokenId).toUpperCase();
                if (!map.has(tx.tokenId)) map.set(tx.tokenId, symbol);
            });
            Object.values(cryptoInterestByToken || {}).forEach(cfg => {
                (cfg?.rewards || []).forEach(reward => {
                    if (!reward?.tokenId) return;
                    const symbol = String(reward.symbol || reward.tokenId).toUpperCase();
                    if (!map.has(reward.tokenId)) map.set(reward.tokenId, symbol);
                });
            });

            return Array.from(map.entries())
                .map(([id, symbol]) => ({ id, symbol }))
                .sort((a, b) => a.symbol.localeCompare(b.symbol) || a.id.localeCompare(b.id));
        }

        function buildCryptoInterestRewardTokenOptions(tokenUniverse, selectedTokenId) {
            const selected = String(selectedTokenId || '').trim();
            const hasSelected = !!selected && tokenUniverse.some(opt => opt.id === selected);
            const options = hasSelected || !selected
                ? tokenUniverse
                : [{ id: selected, symbol: selected.toUpperCase() }, ...tokenUniverse];

            return options.map(opt => {
                const safeId = escapeAttr(opt.id);
                const safeLabel = `${escapeHTML(opt.symbol)} (${escapeHTML(opt.id)})`;
                const isSelected = opt.id === selected ? 'selected' : '';
                return `<option value="${safeId}" ${isSelected}>${safeLabel}</option>`;
            }).join('');
        }

        function calculateCryptoInterestApy(holding, interestEntry) {
            const weightedHoldingDays = calculateWeightedHoldingDays(holding?.lots || []);
            const principal = Number(holding?.totalCost || 0);
            const rewards = Array.isArray(interestEntry?.rewards) ? interestEntry.rewards : [];
            let earnedValue = 0;
            let hasAmount = false;
            let missingPriceCount = 0;

            rewards.forEach(reward => {
                const amount = Number(reward?.amount || 0);
                if (!Number.isFinite(amount) || amount <= 0) return;
                hasAmount = true;
                const price = Number(cryptoPrices?.[reward.tokenId]?.price || 0);
                if (price > 0) {
                    earnedValue += amount * price;
                } else {
                    missingPriceCount += 1;
                }
            });

            if (principal <= 0) {
                return { status: 'invalid', message: 'No invested value yet for APY computation.' };
            }
            if (weightedHoldingDays <= 0) {
                return { status: 'invalid', message: 'Holding time is too short to annualize APY.' };
            }
            if (!hasAmount) {
                return { status: 'pending', message: 'Enter earned amounts to compute APY.' };
            }
            if (earnedValue <= 0) {
                return { status: 'pending', message: 'Missing reward token prices. Refresh crypto prices first.' };
            }

            const years = weightedHoldingDays / 365;
            const periodReturnPct = (earnedValue / principal) * 100;
            const apyPct = years > 0 ? (periodReturnPct / years) : 0;

            return {
                status: 'ok',
                earnedValue,
                apyPct,
                periodReturnPct,
                weightedHoldingDays,
                missingPriceCount
            };
        }

        async function calculateHoldings(method = 'fifo') {
            const normalizedMethod = normalizeCostBasisMethod(method);
            ensureCryptoComputationCacheFresh();
            const cached = cryptoComputationCache.holdingsByMethod.get(normalizedMethod);
            if (cached) return cached;

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

                    if (normalizedMethod === 'avg') {
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
                            const lotIndex = normalizedMethod === 'fifo' ? 0 : h.lots.length - 1;
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

            cryptoComputationCache.holdingsByMethod.set(normalizedMethod, holdings);
            return holdings;
        }

	        async function fetchCryptoPrices() {
            const holdings = await calculateHoldings();
            const trackedIds = new Set(Object.keys(holdings).filter(k => holdings[k].amount > 0.000001));
            Object.values(cryptoInterestByToken || {}).forEach(entry => {
                if (!entry?.enabled) return;
                (entry.rewards || []).forEach(reward => {
                    const rewardTokenId = String(reward?.tokenId || '').trim();
                    if (rewardTokenId) trackedIds.add(rewardTokenId);
                });
            });
            const ids = Array.from(trackedIds);
            const statusEl = document.getElementById('crypto-last-updated');

            if (ids.length === 0) {
                if (statusEl) statusEl.innerText = "No assets or rewards to track";
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

	                // Update cache locally only (avoid Firestore upload on price refresh)
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
	                await persistLocalDBSnapshot(db);
	                cryptoPrices = db.crypto_prices || {};
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

        let cryptoTargetLossesOnly = true;
        let cryptoTargetByToken = {};

        function setCryptoTargetLossesOnly(checked) {
            cryptoTargetLossesOnly = !!checked;
            renderCryptoPortfolio();
        }

        function setCryptoTokenTarget(tokenIdEncoded, value) {
            const tokenId = decodeURIComponent(tokenIdEncoded || '');
            if (!tokenId) return;
            const parsed = parseFloat(value);
            if (!Number.isFinite(parsed)) {
                delete cryptoTargetByToken[tokenId];
            } else {
                cryptoTargetByToken[tokenId] = parsed;
            }
            renderCryptoPortfolio();
        }

        function clearCryptoTokenTarget(tokenIdEncoded) {
            const tokenId = decodeURIComponent(tokenIdEncoded || '');
            if (!tokenId) return;
            delete cryptoTargetByToken[tokenId];
            renderCryptoPortfolio();
        }

        function getCryptoTokenTargetPct(tokenId, defaultPct) {
            const override = cryptoTargetByToken[tokenId];
            return Number.isFinite(override) ? override : defaultPct;
        }

        function simulateRemainingLotsAfterSell(lots, sellAmount, method) {
            const arr = (lots || [])
                .filter(lot => lot && lot.amount > 0.000001)
                .map(lot => ({ amount: lot.amount, price: lot.price }));
            let remainingToSell = Math.max(0, sellAmount);

            while (remainingToSell > 0.000001 && arr.length > 0) {
                const lotIndex = method === 'lifo' ? arr.length - 1 : 0;
                const lot = arr[lotIndex];
                const sold = Math.min(lot.amount, remainingToSell);
                lot.amount -= sold;
                remainingToSell -= sold;
                if (lot.amount <= 0.000001) {
                    arr.splice(lotIndex, 1);
                }
            }

            const remainingAmount = arr.reduce((sum, lot) => sum + lot.amount, 0);
            const remainingCost = arr.reduce((sum, lot) => sum + (lot.amount * lot.price), 0);
            return { remainingAmount, remainingCost };
        }

        function calculateSellNeededForTargetUnrealizedPct(holding, currentPrice, targetPct, taxMethod) {
            const amount = holding?.amount || 0;
            const totalCost = holding?.totalCost || 0;
            const currentValue = amount * currentPrice;
            const unrealized = currentValue - totalCost;
            const currentPct = totalCost > 0 ? (unrealized / totalCost) * 100 : 0;
            const target = targetPct;

            if (!Number.isFinite(currentPrice) || currentPrice <= 0 || amount <= 0.000001 || totalCost <= 0) {
                return { status: 'invalid', message: 'Needs current price and holding data.' };
            }
            if (unrealized <= 0) {
                return { status: 'impossible', message: 'Sell target is only for positions currently in gain.' };
            }
            if (!Number.isFinite(target) || target <= 0) {
                return { status: 'impossible', message: 'For gains, target must be above 0%.' };
            }
            if (target > currentPct + 1e-9) {
                return { status: 'impossible', message: 'Selling cannot increase unrealized gain %.' };
            }
            if (Math.abs(target - currentPct) < 1e-6) {
                return { status: 'at_target', requiredSell: 0 };
            }

            // Under average cost, partial sells keep unrealized % unchanged.
            if (taxMethod === 'avg') {
                return { status: 'impossible', message: 'With average cost, selling does not change unrealized gain %.' };
            }

            const lots = holding.lots || [];
            const evaluatePct = (sellAmount) => {
                const sim = simulateRemainingLotsAfterSell(lots, sellAmount, taxMethod);
                if (sim.remainingAmount <= 0.000001 || sim.remainingCost <= 0.000001) {
                    return null;
                }
                const remainingValue = sim.remainingAmount * currentPrice;
                return ((remainingValue - sim.remainingCost) / sim.remainingCost) * 100;
            };

            const maxSell = Math.max(0, amount - 0.000001);
            if (maxSell <= 0) {
                return { status: 'impossible', message: 'Not enough amount to simulate a sell target.' };
            }

            let prevSell = 0;
            let prevPct = currentPct;
            let bestSell = 0;
            let bestPct = currentPct;
            let bestDiff = Math.abs(currentPct - target);
            const steps = 240;
            let crossing = null;

            for (let i = 1; i <= steps; i++) {
                const sell = (maxSell * i) / steps;
                const pct = evaluatePct(sell);
                if (!Number.isFinite(pct)) continue;

                const diff = Math.abs(pct - target);
                if (diff < bestDiff) {
                    bestDiff = diff;
                    bestSell = sell;
                    bestPct = pct;
                }

                const crossed = (prevPct - target) * (pct - target) <= 0;
                if (!crossing && crossed) {
                    crossing = { lowSell: prevSell, highSell: sell, lowPct: prevPct, highPct: pct };
                    break;
                }

                prevSell = sell;
                prevPct = pct;
            }

            if (crossing) {
                let lo = crossing.lowSell;
                let hi = crossing.highSell;
                let bestMid = (lo + hi) / 2;
                for (let i = 0; i < 28; i++) {
                    const mid = (lo + hi) / 2;
                    const midPct = evaluatePct(mid);
                    if (!Number.isFinite(midPct)) break;
                    bestMid = mid;
                    if (Math.abs(midPct - target) < 0.0001) break;
                    const loPct = evaluatePct(lo);
                    if (!Number.isFinite(loPct)) break;
                    if ((loPct - target) * (midPct - target) <= 0) hi = mid;
                    else lo = mid;
                }
                const matchedPct = evaluatePct(bestMid);
                return { status: 'sell', requiredSell: bestMid * currentPrice, requiredSellAmount: bestMid, matchedPct };
            }

            if (bestDiff <= 0.1) {
                return { status: 'sell', requiredSell: bestSell * currentPrice, requiredSellAmount: bestSell, matchedPct: bestPct, approximate: true };
            }

            return { status: 'impossible', message: 'Target not reachable by selling under current lot order.' };
        }

        function calculateAdjustmentForTargetUnrealized(totalCost, currentValue, targetPct) {
            if (!Number.isFinite(totalCost) || totalCost <= 0 || !Number.isFinite(currentValue) || currentValue < 0) {
                return { status: 'invalid', message: 'Not enough data yet.' };
            }

            const unrealized = currentValue - totalCost;
            const currentRatio = unrealized / totalCost;
            const targetRatio = targetPct / 100;

            if (!Number.isFinite(targetRatio)) {
                return { status: 'invalid', message: 'Invalid target percentage.' };
            }

            if (Math.abs(unrealized) < 1e-9) {
                if (Math.abs(targetRatio) < 1e-9) {
                    return { status: 'at_target', requiredAmount: 0, action: 'none', currentRatio, targetRatio };
                }
                return {
                    status: 'impossible',
                    message: 'At break-even. Price movement is needed to move away from 0%.',
                    currentRatio,
                    targetRatio
                };
            }

            if (Math.abs(targetRatio) < 1e-9) {
                return {
                    status: 'impossible',
                    message: '0% cannot be reached with a finite buy at the same price.',
                    currentRatio,
                    targetRatio
                };
            }

            // Adjustments at current price move unrealized % toward 0 while keeping its sign.
            if (unrealized < 0) {
                if (targetRatio >= 0) {
                    return {
                        status: 'impossible',
                        message: 'For a losing position, target must stay below 0%.',
                        currentRatio,
                        targetRatio
                    };
                }
                if (targetRatio < currentRatio - 1e-9) {
                    return {
                        status: 'impossible',
                        message: 'Target is deeper loss than current. Buying only improves % toward 0.',
                        currentRatio,
                        targetRatio
                    };
                }
            } else {
                if (targetRatio <= 0) {
                    return {
                        status: 'impossible',
                        message: 'For a winning position, target must stay above 0%.',
                        currentRatio,
                        targetRatio
                    };
                }
                if (targetRatio > currentRatio + 1e-9) {
                    return {
                        status: 'impossible',
                        message: 'Selling at current price cannot increase gain %.',
                        currentRatio,
                        targetRatio
                    };
                }
            }

            if (Math.abs(targetRatio - currentRatio) < 1e-9) {
                return { status: 'at_target', requiredAmount: 0, action: 'none', currentRatio, targetRatio };
            }

            // For loss case, compute buy needed using adjusted denominator.
            if (unrealized < 0) {
                const requiredBuy = (unrealized / targetRatio) - totalCost;
                if (!Number.isFinite(requiredBuy) || requiredBuy < 0) {
                    return { status: 'impossible', message: 'Target cannot be reached by buying at current price.', currentRatio, targetRatio };
                }
                return { status: 'buy', requiredAmount: requiredBuy, action: 'buy', currentRatio, targetRatio };
            }

            // Portfolio-level gains are lot-dependent; we handle sell targets at per-token level.
            return {
                status: 'impossible',
                message: 'For gain-side sell targets, use per-token calculations below.',
                currentRatio,
                targetRatio
            };
        }

        function getCryptoHoldingCardDomId(tokenId) {
            return `crypto-holding-card-${encodeInlineArg(tokenId)}`;
        }

        function getCurrentCryptoPortfolioControls() {
            let taxMethod = document.getElementById('cost-basis-method')?.value || 'fifo';
            if (taxMethod === 'average') taxMethod = 'avg';
            const targetPctRaw = parseFloat(document.getElementById('cp-target-unrealized-pct')?.value);
            const targetUnrealizedPct = Number.isFinite(targetPctRaw) ? targetPctRaw : -5;
            return { taxMethod, targetUnrealizedPct };
        }

        function createCryptoHoldingCardElement({
            id,
            h,
            currentPrice,
            value,
            avgPrice,
            unrealized,
            pnlPct,
            weightedHoldingDays,
            taxMethod,
            targetUnrealizedPct,
            tokenUniverse
        }) {
            const safeSymbol = escapeHTML((h.symbol || '').toUpperCase());
            const safeTokenId = escapeHTML(id);
            const encodedTokenId = encodeInlineArg(id);
            const tokenTargetPct = getCryptoTokenTargetPct(id, targetUnrealizedPct);
            const showTokenTarget = !cryptoTargetLossesOnly || unrealized < 0;
            let tokenTargetUI = '';
            let tokenTargetNote = '';

            if (showTokenTarget) {
                tokenTargetUI = `
                    <div class="flex items-center gap-2 mt-1">
                        <span class="text-[10px] text-slate-500">Target %</span>
                        <input type="number" step="0.1" value="${tokenTargetPct.toFixed(1)}"
                            onchange="setCryptoTokenTarget('${encodedTokenId}', this.value)"
                            class="w-16 bg-slate-900 border border-slate-700 rounded px-1.5 py-0.5 text-[10px] text-right text-slate-300 outline-none focus:border-cyan-500">
                        <button onclick="clearCryptoTokenTarget('${encodedTokenId}')"
                            class="text-[10px] text-slate-500 hover:text-slate-300">reset</button>
                    </div>
                `;
            }

            if (currentPrice <= 0) {
                tokenTargetNote = '<p class="text-[10px] text-slate-500 mt-0.5">Needs latest price to estimate target action.</p>';
            } else if (!showTokenTarget && unrealized > 0) {
                tokenTargetNote = '<p class="text-[10px] text-slate-500 mt-0.5">Enable gains in toggle above to compute sell target for this token.</p>';
            } else {
                const targetCalc = unrealized < 0
                    ? calculateAdjustmentForTargetUnrealized(h.totalCost, value, tokenTargetPct)
                    : calculateSellNeededForTargetUnrealizedPct(h, currentPrice, tokenTargetPct, taxMethod);

                if (targetCalc.status === 'buy') {
                    const tokensToBuy = targetCalc.requiredAmount / currentPrice;
                    tokenTargetNote = `<p class="text-[10px] text-cyan-400 mt-0.5">Target ${tokenTargetPct.toFixed(1)}%: Buy ${fmt(targetCalc.requiredAmount)} (${tokensToBuy.toFixed(4)} tokens)</p>`;
                } else if (targetCalc.status === 'sell') {
                    const amountText = targetCalc.requiredSellAmount?.toFixed(4) || '0.0000';
                    const approxPrefix = targetCalc.approximate ? '~' : '';
                    tokenTargetNote = `<p class="text-[10px] text-amber-400 mt-0.5">Target ${tokenTargetPct.toFixed(1)}%: Sell ${approxPrefix}${fmt(targetCalc.requiredSell)} (${approxPrefix}${amountText} tokens)</p>`;
                } else if (targetCalc.status === 'at_target') {
                    tokenTargetNote = `<p class="text-[10px] text-emerald-400 mt-0.5">Already at target ${tokenTargetPct.toFixed(1)}%.</p>`;
                } else {
                    const safeMsg = escapeHTML(targetCalc.message || 'Target is not reachable at current price.');
                    tokenTargetNote = `<p class="text-[10px] text-slate-500 mt-0.5">${safeMsg}</p>`;
                }
            }

            const interestEntry = getCryptoInterestEntry(id);
            let interestMarkup = `
                <div class="mt-2 pt-2 border-t border-slate-700/70">
                    <label class="inline-flex items-center gap-2 text-[11px] text-slate-300">
                        <input type="checkbox" ${interestEntry.enabled ? 'checked' : ''}
                            onchange="setCryptoInterestEnabled('${encodedTokenId}', this.checked)"
                            class="accent-cyan-500">
                        Earns interest
                    </label>
            `;

            if (interestEntry.enabled) {
                const rewardRows = interestEntry.rewards.map((reward, rewardIdx) => {
                    const rewardTokenOptions = buildCryptoInterestRewardTokenOptions(tokenUniverse, reward.tokenId);
                    return `
                        <div class="grid grid-cols-[minmax(0,1fr)_110px_auto] gap-2 mt-2 items-center">
                            <select onchange="updateCryptoInterestRewardToken('${encodedTokenId}', ${rewardIdx}, this.value)"
                                class="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-[10px] text-slate-200 outline-none focus:border-cyan-500">
                                ${rewardTokenOptions}
                            </select>
                            <input type="number" step="any" min="0" value="${escapeAttr(reward.amount)}"
                                onchange="updateCryptoInterestRewardAmount('${encodedTokenId}', ${rewardIdx}, this.value)"
                                placeholder="Earned"
                                class="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-[10px] text-right text-slate-200 outline-none focus:border-cyan-500">
                            <button onclick="removeCryptoInterestReward('${encodedTokenId}', ${rewardIdx})"
                                class="text-[10px] text-rose-400 hover:text-rose-300">remove</button>
                        </div>
                    `;
                }).join('');

                const interestApy = calculateCryptoInterestApy(h, interestEntry);
                let interestSummary = '';
                if (interestApy.status === 'ok') {
                    const missingNote = interestApy.missingPriceCount > 0
                        ? `<p class="text-[10px] text-amber-300 mt-0.5">${interestApy.missingPriceCount} reward token(s) missing price and excluded.</p>`
                        : '';
                    interestSummary = `
                        <p class="text-[10px] text-cyan-300 mt-2">APY so far: ${interestApy.apyPct.toFixed(2)}%</p>
                        <p class="text-[10px] text-slate-400 mt-0.5">Earned value: ${fmt(interestApy.earnedValue)} • Period return: ${interestApy.periodReturnPct.toFixed(2)}% • Weighted hold: ${interestApy.weightedHoldingDays.toFixed(1)}d</p>
                        ${missingNote}
                    `;
                } else {
                    const safeApyMsg = escapeHTML(interestApy.message || 'Add reward amounts to estimate APY.');
                    interestSummary = `<p class="text-[10px] text-slate-500 mt-2">${safeApyMsg}</p>`;
                }

                interestMarkup += `
                    <div class="mt-2 bg-slate-900/60 border border-slate-700/70 rounded-lg p-2">
                        <p class="text-[10px] text-slate-400">Reward Tokens and Amount Earned So Far</p>
                        ${rewardRows || '<p class="text-[10px] text-slate-500 mt-2">No reward tokens yet.</p>'}
                        <button onclick="addCryptoInterestReward('${encodedTokenId}')"
                            class="mt-2 text-[10px] text-cyan-400 hover:text-cyan-300">+ add reward token</button>
                        ${interestSummary}
                    </div>
                `;
            }

            interestMarkup += '</div>';

            const div = document.createElement('div');
            div.id = getCryptoHoldingCardDomId(id);
            div.dataset.tokenId = id;
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
                    ${tokenTargetUI}
                    ${tokenTargetNote}
                    ${interestMarkup}
                </div>
                <div class="text-right">
                    <p class="font-bold text-white">${currentPrice > 0 ? fmt(value) : 'Needs Update'}</p>
                    <p class="text-xs font-bold ${unrealized >= 0 ? 'text-emerald-500' : 'text-rose-500'}">
                        ${currentPrice > 0 ? pnlPct.toFixed(1) + '%' : '--'}
                    </p>
                        <p class="text-[10px] text-slate-500">${unrealized >= 0 ? '+' : ''}${fmt(unrealized)}</p>
                </div>
            `;
            return div;
        }

        async function renderCryptoHoldingCardByTokenId(tokenId) {
            const list = document.getElementById('crypto-holdings-list');
            const existing = document.getElementById(getCryptoHoldingCardDomId(tokenId));
            if (!list || !existing) return false;
            if (!cryptoPortfolioRenderContext?.holdings || !cryptoPortfolioRenderContext.holdings[tokenId]) return false;

            const h = cryptoPortfolioRenderContext.holdings[tokenId];
            if (!h || h.amount <= 0.000001) return false;

            const { taxMethod, targetUnrealizedPct } = getCurrentCryptoPortfolioControls();
            const tokenUniverse = buildCryptoTokenUniverse(
                cryptoPortfolioRenderContext.holdings,
                cryptoPortfolioRenderContext.allTxs || []
            );
            const cache = cryptoPrices[tokenId];
            const currentPrice = cache?.price || 0;
            const value = h.amount * currentPrice;
            const avgPrice = h.amount > 0 ? h.totalCost / h.amount : 0;
            const unrealized = currentPrice > 0 ? (value - h.totalCost) : 0;
            const pnlPct = h.totalCost > 0 ? (unrealized / h.totalCost) * 100 : 0;
            const weightedHoldingDays = calculateWeightedHoldingDays(h.lots);

            const updatedEl = createCryptoHoldingCardElement({
                id: tokenId,
                h,
                currentPrice,
                value,
                avgPrice,
                unrealized,
                pnlPct,
                weightedHoldingDays,
                taxMethod,
                targetUnrealizedPct,
                tokenUniverse
            });
            existing.replaceWith(updatedEl);
            return true;
        }

        async function renderCryptoPortfolio() {
            const { taxMethod, targetUnrealizedPct } = getCurrentCryptoPortfolioControls();
            const lossesOnlyEl = document.getElementById('cp-target-losses-only');
            if (lossesOnlyEl) lossesOnlyEl.checked = cryptoTargetLossesOnly;
            const holdings = await calculateHoldings(taxMethod);
            const allTxs = await getDecryptedCrypto();
            const tokenUniverse = buildCryptoTokenUniverse(holdings, allTxs);
            cryptoPortfolioRenderContext = { holdings, allTxs };
            const list = document.getElementById('crypto-holdings-list');
            list.innerHTML = '';

            let totalVal = 0, totalInvested = 0, totalRealized = 0, totalUnrealized = 0;
            let lastUpdate = 0;
            let pricedTargetValue = 0, pricedTargetCost = 0, unpricedTargetCount = 0;

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
                    if (currentPrice > 0) {
                        pricedTargetValue += value;
                        pricedTargetCost += h.totalCost;
                    } else {
                        unpricedTargetCount += 1;
                    }

                    // Track Best/Worst
                    if (pnlPct > bestPerf.pct) bestPerf = { symbol: h.symbol, pct: pnlPct };
                    if (pnlPct < worstPerf.pct) worstPerf = { symbol: h.symbol, pct: pnlPct };
                }
                totalRealized += h.realizedPL;

                if (h.amount > 0.000001) {
                    const div = createCryptoHoldingCardElement({
                        id,
                        h,
                        currentPrice,
                        value,
                        avgPrice,
                        unrealized,
                        pnlPct,
                        weightedHoldingDays,
                        taxMethod,
                        targetUnrealizedPct,
                        tokenUniverse
                    });
                    list.appendChild(div);
                }
            });

            // RENDER HISTORY
            const historyList = document.getElementById('crypto-history-list');
            historyList.innerHTML = '';

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

            const currentPctEl = document.getElementById('cp-target-current-pct');
            const actionLabelEl = document.getElementById('cp-target-action-label');
            const neededBuyEl = document.getElementById('cp-target-needed-buy');
            const helperEl = document.getElementById('cp-target-helper');
            if (currentPctEl && neededBuyEl && helperEl && actionLabelEl) {
                if (pricedTargetCost > 0) {
                    const targetCalc = calculateAdjustmentForTargetUnrealized(pricedTargetCost, pricedTargetValue, targetUnrealizedPct);
                    const currentPct = ((pricedTargetValue - pricedTargetCost) / pricedTargetCost) * 100;
                    currentPctEl.innerText = `${currentPct >= 0 ? '+' : ''}${currentPct.toFixed(2)}%`;
                    currentPctEl.className = `text-sm font-bold mt-1 ${currentPct >= 0 ? 'text-emerald-300' : 'text-rose-300'}`;
                    const missingPriceSuffix = unpricedTargetCount > 0 ? ` ${unpricedTargetCount} holding(s) skipped (no price).` : '';

                    actionLabelEl.innerText = currentPct < 0 ? 'Needed Buy' : (currentPct > 0 ? 'Needed Sell' : 'Needed Action');

                    if (targetCalc.status === 'buy') {
                        neededBuyEl.innerText = fmt(targetCalc.requiredAmount);
                        neededBuyEl.className = 'text-sm font-bold text-cyan-300 mt-1';
                        helperEl.innerText = `Buy at current prices to move unrealized P/L toward ${targetUnrealizedPct.toFixed(1)}%.${missingPriceSuffix}`;
                    } else if (targetCalc.status === 'at_target') {
                        neededBuyEl.innerText = fmt(0);
                        neededBuyEl.className = 'text-sm font-bold text-emerald-300 mt-1';
                        helperEl.innerText = `Portfolio is already at ${targetUnrealizedPct.toFixed(1)}%.${missingPriceSuffix}`;
                    } else {
                        neededBuyEl.innerText = '--';
                        neededBuyEl.className = 'text-sm font-bold text-slate-400 mt-1';
                        helperEl.innerText = (targetCalc.message || 'Target is not reachable with the current assumptions.') + missingPriceSuffix;
                    }
                } else {
                    actionLabelEl.innerText = 'Needed Action';
                    currentPctEl.innerText = '--';
                    currentPctEl.className = 'text-sm font-bold mt-1 text-slate-400';
                    neededBuyEl.innerText = '--';
                    neededBuyEl.className = 'text-sm font-bold text-slate-400 mt-1';
                    helperEl.innerText = 'Add holdings first to use this calculator.';
                }
            }

            // ROI & Best/Worst
            const roi = totalInvested > 0 ? ((totalVal - totalInvested) / totalInvested) * 100 : 0;
            const roiEl = document.getElementById('cp-roi');
            if (roiEl) {
                roiEl.innerText = (roi >= 0 ? '+' : '') + roi.toFixed(1) + '%';
                roiEl.className = `text-lg font-bold ${roi >= 0 ? 'text-emerald-400' : 'text-rose-400'}`;
            }

            const bestEl = document.getElementById('cp-best-perf') || document.getElementById('cp-best');
            if (bestEl) bestEl.innerText = bestPerf.symbol !== '-' ? `${bestPerf.symbol} (${bestPerf.pct > 0 ? '+' : ''}${bestPerf.pct.toFixed(0)}%)` : '-';

            const worstEl = document.getElementById('cp-worst-perf') || document.getElementById('cp-worst');
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
