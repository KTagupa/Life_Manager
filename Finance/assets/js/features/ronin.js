// =============================================
// RONIN READ-ONLY RECONCILIATION MODULE
// =============================================

const RONIN_DEFAULT_ENDPOINT = 'https://api.roninchain.com/rpc';
const RONIN_NATIVE_ASSET_KEY = 'native:ron';
const RONIN_CHAIN_ID_HEX = '0x7e4';
const RONIN_TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const RONIN_BALANCE_OF_SELECTOR = '0x70a08231';
const RONIN_DEFAULT_LOOKBACK_BLOCKS = 200000;
const RONIN_LOG_CHUNK_SIZE = 50000;
const RONIN_MAX_TRACKED_TOKENS = 12;

let roninReconcileState = {
    account: '',
    endpoint: RONIN_DEFAULT_ENDPOINT,
    balances: [],
    balanceMap: new Map(),
    rows: [],
    loading: false,
    error: '',
    fetchedAt: 0,
    latestBlock: 0,
    fromBlock: 0
};
let roninPendingImport = null;

function getRoninFallbackSettings() {
    return {
        walletAddress: '',
        endpoint: RONIN_DEFAULT_ENDPOINT,
        fromBlock: '',
        assetMappings: {
            [RONIN_NATIVE_ASSET_KEY]: {
                tokenId: 'ronin',
                symbol: 'RON',
                label: 'RON',
                decimals: 18
            }
        },
        lastRefreshAt: 0,
        lastBlockNumber: 0,
        lastModified: 0
    };
}

function getRoninReconcileSettingsSafe() {
    const normalize = typeof normalizeRoninReconcileSettingsShape === 'function'
        ? normalizeRoninReconcileSettingsShape
        : (value => ({ ...getRoninFallbackSettings(), ...(value || {}) }));
    const settings = normalize(typeof roninReconcileSettings !== 'undefined' ? roninReconcileSettings : {});
    return {
        ...settings,
        endpoint: String(settings.endpoint || RONIN_DEFAULT_ENDPOINT).trim() || RONIN_DEFAULT_ENDPOINT,
        assetMappings: {
            ...getRoninFallbackSettings().assetMappings,
            ...(settings.assetMappings || {})
        }
    };
}

function normalizeRoninAddress(address) {
    const raw = String(address || '').trim().toLowerCase();
    if (raw.startsWith('ronin:')) return `0x${raw.slice(6)}`;
    return raw;
}

function formatRoninAddress(address) {
    const normalized = normalizeRoninAddress(address);
    return normalized.startsWith('0x') ? `ronin:${normalized.slice(2)}` : normalized;
}

function isValidRoninAddress(address) {
    return /^0x[a-f0-9]{40}$/.test(normalizeRoninAddress(address));
}

function shortRoninText(value, start = 6, end = 4) {
    const text = String(value || '').trim();
    if (text.length <= start + end + 3) return text;
    return `${text.slice(0, start)}...${text.slice(-end)}`;
}

function toRoninFiniteNumber(value, fallback = 0) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
}

function parseRoninHexInt(hexValue) {
    const raw = String(hexValue || '0x0').trim();
    if (!/^0x[0-9a-f]*$/i.test(raw)) return 0n;
    return BigInt(raw || '0x0');
}

function roninBigIntToNumber(value, decimals = 18) {
    const raw = typeof value === 'bigint' ? value : BigInt(value || 0);
    const safeDecimals = Math.max(0, Math.round(Number(decimals) || 0));
    const base = 10n ** BigInt(safeDecimals);
    const integerPart = raw / base;
    const fractionPart = raw % base;
    const fractionText = fractionPart.toString().padStart(safeDecimals, '0').slice(0, 12).replace(/0+$/, '');
    return Number(`${integerPart.toString()}${fractionText ? `.${fractionText}` : ''}`);
}

function roninNumberToText(value, digits = 8) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return '--';
    const maxDigits = Math.abs(numeric) >= 1000 ? 4 : digits;
    return numeric.toLocaleString('en-US', {
        minimumFractionDigits: 0,
        maximumFractionDigits: maxDigits
    });
}

function formatRoninSignedAmount(value, symbol) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return `-- ${symbol || ''}`.trim();
    const prefix = numeric > 0 ? '+' : '';
    return `${prefix}${roninNumberToText(numeric)} ${String(symbol || '').toUpperCase()}`.trim();
}

function toRoninRpcQuantity(value) {
    const numeric = Math.max(0, Math.round(Number(value) || 0));
    return `0x${numeric.toString(16)}`;
}

function padRoninTopicAddress(address) {
    return `0x${normalizeRoninAddress(address).replace(/^0x/, '').padStart(64, '0')}`;
}

function topicToRoninAddress(topic) {
    const raw = String(topic || '').replace(/^0x/, '');
    return `0x${raw.slice(-40)}`.toLowerCase();
}

function buildRoninAssetKey(contract) {
    const normalized = normalizeRoninAddress(contract);
    return `erc20:${normalized}`;
}

function getRoninTrackedTokenMappings(settings = getRoninReconcileSettingsSafe()) {
    return Object.entries(settings.assetMappings || {})
        .filter(([key, mapping]) => key.startsWith('erc20:') && isValidRoninAddress(mapping?.contract))
        .slice(0, RONIN_MAX_TRACKED_TOKENS)
        .map(([key, mapping]) => ({
            key,
            contract: normalizeRoninAddress(mapping.contract),
            tokenId: String(mapping.tokenId || '').trim().toLowerCase(),
            symbol: String(mapping.symbol || 'TOKEN').trim().toUpperCase() || 'TOKEN',
            label: String(mapping.label || mapping.symbol || key).trim(),
            decimals: Math.max(0, Math.round(toRoninFiniteNumber(mapping.decimals, 18)))
        }));
}

function getRoninTokenEditorMappings(settings = getRoninReconcileSettingsSafe()) {
    return Object.entries(settings.assetMappings || {})
        .filter(([key]) => key.startsWith('erc20:') || key.startsWith('draft:'))
        .map(([key, mapping]) => ({
            key,
            contract: String(mapping?.contract || '').trim(),
            tokenId: String(mapping?.tokenId || '').trim().toLowerCase(),
            symbol: String(mapping?.symbol || '').trim().toUpperCase(),
            label: String(mapping?.label || mapping?.symbol || key).trim(),
            decimals: Math.max(0, Math.round(toRoninFiniteNumber(mapping?.decimals, 18)))
        }));
}

function buildRoninBalanceMap(balances) {
    const map = new Map();
    (balances || []).forEach(balance => {
        if (balance?.key) map.set(balance.key, balance);
    });
    return map;
}

function sortRoninAssets(a, b) {
    if (a.key === RONIN_NATIVE_ASSET_KEY) return -1;
    if (b.key === RONIN_NATIVE_ASSET_KEY) return 1;
    return String(a.symbol || '').localeCompare(String(b.symbol || '')) ||
        String(a.contract || '').localeCompare(String(b.contract || ''));
}

async function roninRpc(method, params = [], endpoint = getRoninReconcileSettingsSafe().endpoint) {
    const rpcEndpoint = endpoint || RONIN_DEFAULT_ENDPOINT;
    let response;
    try {
        response = await fetch(rpcEndpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: Date.now(),
                method,
                params
            })
        });
    } catch (error) {
        throw new Error(getRoninFetchFailureMessage(rpcEndpoint, error));
    }
    if (!response.ok) throw new Error(`Ronin RPC returned HTTP ${response.status}`);
    const payload = await response.json();
    if (payload?.error) throw new Error(payload.error.message || payload.error.code || 'Ronin RPC request failed');
    return payload?.result;
}

function getRoninFetchFailureMessage(endpoint, error) {
    const pageProtocol = typeof window !== 'undefined' ? window.location?.protocol : '';
    if (pageProtocol === 'file:') {
        return `Browser blocked Ronin RPC from a file:// page. Open Finance through a local http server, then try again. Endpoint: ${endpoint}`;
    }
    const base = error?.message ? `Ronin RPC network request failed: ${error.message}.` : 'Ronin RPC network request failed.';
    return `${base} Check your internet connection, privacy extensions, CSP, or try another Ronin RPC endpoint.`;
}

async function getRoninChainId(endpoint) {
    return roninRpc('eth_chainId', [], endpoint);
}

async function fetchRoninNativeBalance(account, endpoint) {
    const balanceHex = await roninRpc('eth_getBalance', [account, 'latest'], endpoint);
    return roninBigIntToNumber(parseRoninHexInt(balanceHex), 18);
}

async function fetchRoninErc20Balance(account, token, endpoint) {
    const accountParam = normalizeRoninAddress(account).replace(/^0x/, '').padStart(64, '0');
    const result = await roninRpc('eth_call', [{
        to: token.contract,
        data: `${RONIN_BALANCE_OF_SELECTOR}${accountParam}`
    }, 'latest'], endpoint);
    return roninBigIntToNumber(parseRoninHexInt(result), token.decimals);
}

async function fetchRoninBalances(account, endpoint, settings) {
    const balances = [{
        key: RONIN_NATIVE_ASSET_KEY,
        contract: '',
        tokenId: settings.assetMappings?.[RONIN_NATIVE_ASSET_KEY]?.tokenId || 'ronin',
        symbol: 'RON',
        label: 'RON',
        balance: await fetchRoninNativeBalance(account, endpoint),
        native: true,
        decimals: 18
    }];

    const trackedTokens = getRoninTrackedTokenMappings(settings);
    for (const token of trackedTokens) {
        try {
            balances.push({
                ...token,
                balance: await fetchRoninErc20Balance(account, token, endpoint),
                native: false
            });
        } catch (error) {
            console.warn('Ronin token balance failed:', token.contract, error);
            balances.push({
                ...token,
                balance: 0,
                native: false,
                error: error?.message || 'Balance unavailable'
            });
        }
    }

    return balances.sort(sortRoninAssets);
}

async function fetchRoninLogsForToken(account, token, fromBlock, toBlock, endpoint) {
    const rows = [];
    const accountTopic = padRoninTopicAddress(account);
    const topics = [
        [RONIN_TRANSFER_TOPIC, accountTopic, null],
        [RONIN_TRANSFER_TOPIC, null, accountTopic]
    ];

    for (const topicSet of topics) {
        let start = fromBlock;
        while (start <= toBlock) {
            const end = Math.min(toBlock, start + RONIN_LOG_CHUNK_SIZE - 1);
            const logs = await roninRpc('eth_getLogs', [{
                address: token.contract,
                fromBlock: toRoninRpcQuantity(start),
                toBlock: toRoninRpcQuantity(end),
                topics: topicSet
            }], endpoint);
            if (Array.isArray(logs)) rows.push(...logs);
            start = end + 1;
        }
    }

    const seen = new Set();
    return rows.filter(log => {
        const key = `${log.transactionHash}:${log.logIndex}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

async function fetchRoninReceipt(hash, endpoint) {
    return roninRpc('eth_getTransactionReceipt', [hash], endpoint);
}

async function fetchRoninBlockTimestamp(blockNumberHex, endpoint, cache) {
    const key = String(blockNumberHex || '').toLowerCase();
    if (cache.has(key)) return cache.get(key);
    const block = await roninRpc('eth_getBlockByNumber', [blockNumberHex, false], endpoint);
    const timestamp = Number(parseRoninHexInt(block?.timestamp || '0x0')) * 1000;
    const iso = timestamp > 0 ? new Date(timestamp).toISOString() : '';
    cache.set(key, iso);
    return iso;
}

function parseRoninTransferLog(log, token, account) {
    const from = topicToRoninAddress(log.topics?.[1]);
    const to = topicToRoninAddress(log.topics?.[2]);
    const amount = roninBigIntToNumber(parseRoninHexInt(log.data), token.decimals);
    let value = 0;
    if (to === account) value += amount;
    if (from === account) value -= amount;
    return {
        key: token.key,
        contract: token.contract,
        tokenId: token.tokenId,
        symbol: token.symbol,
        label: token.label || token.symbol,
        decimals: token.decimals,
        from,
        to,
        value
    };
}

async function buildRoninActivityRows(account, endpoint, settings, fromBlock, toBlock) {
    const trackedTokens = getRoninTrackedTokenMappings(settings);
    const grouped = new Map();
    const blockTimeCache = new Map();

    for (const token of trackedTokens) {
        const logs = await fetchRoninLogsForToken(account, token, fromBlock, toBlock, endpoint);
        logs.forEach(log => {
            const hash = String(log.transactionHash || '').toLowerCase();
            if (!hash) return;
            const existing = grouped.get(hash) || {
                hash,
                blockNumber: Number(parseRoninHexInt(log.blockNumber || '0x0')),
                blockNumberHex: log.blockNumber,
                deltas: [],
                feeRon: 0,
                from: '',
                date: '',
                category: 'unknown',
                result: 'unknown'
            };
            existing.deltas.push(parseRoninTransferLog(log, token, account));
            grouped.set(hash, existing);
        });
    }

    const rows = [];
    for (const row of grouped.values()) {
        try {
            const receipt = await fetchRoninReceipt(row.hash, endpoint);
            row.from = normalizeRoninAddress(receipt?.from || '');
            row.result = receipt?.status === '0x1' ? 'success' : 'failed';
            if (row.from === account) {
                const gasUsed = parseRoninHexInt(receipt?.gasUsed || '0x0');
                const gasPrice = parseRoninHexInt(receipt?.effectiveGasPrice || '0x0');
                row.feeRon = roninBigIntToNumber(gasUsed * gasPrice, 18);
            }
        } catch (error) {
            console.warn('Ronin receipt fetch failed:', row.hash, error);
        }
        try {
            row.date = await fetchRoninBlockTimestamp(row.blockNumberHex, endpoint, blockTimeCache);
        } catch (error) {
            console.warn('Ronin block timestamp fetch failed:', row.blockNumberHex, error);
        }

        const meaningful = row.deltas.filter(delta => Math.abs(delta.value) > 0.00000001);
        const hasPositive = meaningful.some(delta => delta.value > 0);
        const hasNegative = meaningful.some(delta => delta.value < 0);
        row.category = hasPositive && hasNegative ? 'swap' : (hasPositive ? 'receive' : (hasNegative ? 'send' : 'unknown'));
        row.explanation = buildRoninActivityExplanation(row);
        rows.push(row);
    }

    return rows.sort((a, b) => b.blockNumber - a.blockNumber || String(b.hash).localeCompare(String(a.hash)));
}

function buildRoninActivityExplanation(row) {
    const positive = (row.deltas || []).filter(delta => delta.value > 0.00000001);
    const negative = (row.deltas || []).filter(delta => delta.value < -0.00000001);
    const posText = positive.map(delta => `${roninNumberToText(delta.value)} ${delta.symbol}`).join(', ');
    const negText = negative.map(delta => `${roninNumberToText(Math.abs(delta.value))} ${delta.symbol}`).join(', ');
    const feeText = row.feeRon > 0 ? `; paid ${roninNumberToText(row.feeRon, 8)} RON fee` : '';
    if (positive.length && negative.length) return `${negText} moved out and ${posText} moved in${feeText}.`;
    if (positive.length) return `Received ${posText}${feeText}.`;
    if (negative.length) return `Sent ${negText}${feeText}.`;
    return row.feeRon > 0 ? `Fee-only Ronin activity: ${roninNumberToText(row.feeRon, 8)} RON.` : 'Ronin activity found.';
}

function setRoninStatus(message, tone = 'neutral') {
    const statusEl = document.getElementById('ronin-status');
    if (!statusEl) return;
    const toneClass = tone === 'error'
        ? 'border-rose-900/70 bg-rose-950/40 text-rose-200'
        : (tone === 'success'
            ? 'border-emerald-900/70 bg-emerald-950/30 text-emerald-200'
            : 'border-slate-800 bg-slate-950/70 text-slate-400');
    statusEl.className = `rounded-2xl border px-4 py-3 text-xs ${toneClass}`;
    statusEl.innerText = message;
}

function setRoninRefreshButtonLoading(isLoading) {
    const button = document.getElementById('ronin-refresh-btn');
    if (!button) return;
    button.disabled = !!isLoading;
    button.classList.toggle('opacity-60', !!isLoading);
    button.classList.toggle('cursor-wait', !!isLoading);
    button.innerText = isLoading ? 'Fetching...' : 'Fetch Ronin';
}

async function persistRoninReconcileSettings(partial = {}) {
    const current = getRoninReconcileSettingsSafe();
    const replacesAssetMappings = Object.prototype.hasOwnProperty.call(partial, 'assetMappings');
    const nextAssetMappings = replacesAssetMappings
        ? { ...(partial.assetMappings || {}) }
        : { ...(current.assetMappings || {}) };
    const nextSettings = {
        ...current,
        ...partial,
        assetMappings: nextAssetMappings,
        lastModified: Date.now()
    };
    roninReconcileSettings = typeof normalizeRoninReconcileSettingsShape === 'function'
        ? normalizeRoninReconcileSettingsShape(nextSettings)
        : nextSettings;

    try {
        const db = await getDB();
        db.ronin_reconcile = roninReconcileSettings;
        const saved = await saveDB(db);
        roninReconcileSettings = saved.ronin_reconcile || roninReconcileSettings;
    } catch (error) {
        console.error('Failed to persist Ronin reconcile settings.', error);
    }
    return roninReconcileSettings;
}

function renderRoninControls(settings) {
    const walletInput = document.getElementById('ronin-wallet-address');
    const endpointInput = document.getElementById('ronin-endpoint-url');
    const fromBlockInput = document.getElementById('ronin-from-block');
    if (walletInput && document.activeElement !== walletInput) walletInput.value = settings.walletAddress || '';
    if (endpointInput && document.activeElement !== endpointInput) endpointInput.value = settings.endpoint || RONIN_DEFAULT_ENDPOINT;
    if (fromBlockInput && document.activeElement !== fromBlockInput) fromBlockInput.value = settings.fromBlock || '';
    setRoninRefreshButtonLoading(roninReconcileState.loading);
}

function getRoninMappedHoldingAmount(holdings, mapping) {
    const tokenId = String(mapping?.tokenId || '').trim().toLowerCase();
    if (!tokenId) return null;
    if (!holdings || !holdings[tokenId]) return 0;
    return Number(holdings[tokenId]?.amount || 0);
}

async function renderRoninBalanceComparison(settings) {
    const mount = document.getElementById('ronin-balance-comparison');
    if (!mount) return;
    if (!roninReconcileState.account) {
        mount.innerHTML = '<div class="text-sm text-slate-500 py-6 text-center">Fetch a Ronin wallet address to compare balances.</div>';
        return;
    }

    let holdings = {};
    try {
        holdings = typeof calculateHoldings === 'function'
            ? await calculateHoldings(document.getElementById('cost-basis-method')?.value || 'fifo')
            : {};
    } catch (error) {
        console.warn('Could not calculate holdings for Ronin comparison.', error);
    }

    const balances = roninReconcileState.balances || [];
    mount.innerHTML = balances.map(asset => {
        const mapping = settings.assetMappings?.[asset.key] || {};
        const appAmount = getRoninMappedHoldingAmount(holdings, mapping);
        const canCompare = Number.isFinite(appAmount);
        const diff = canCompare ? Number(asset.balance || 0) - appAmount : null;
        const diffAbs = Math.abs(Number(diff || 0));
        const diffTone = !canCompare ? 'text-slate-500' : (diffAbs <= 0.00000001 ? 'text-emerald-300' : 'text-amber-300');
        const contractText = asset.contract ? `<p class="text-[10px] text-slate-600 mt-0.5">${escapeHTML(shortRoninText(asset.contract, 8, 6))}</p>` : '';
        return `
            <div class="rounded-2xl border border-slate-800 bg-slate-900/55 p-3">
                <div class="flex items-start justify-between gap-3">
                    <div>
                        <div class="flex flex-wrap items-center gap-2">
                            <p class="text-sm font-bold text-slate-200">${escapeHTML(asset.label || asset.symbol)}</p>
                            <span class="rounded-full border border-slate-700 bg-slate-950 px-2 py-0.5 text-[10px] font-bold text-slate-500">${asset.native ? 'native' : 'erc-20'}</span>
                        </div>
                        ${contractText}
                    </div>
                    <div class="grid grid-cols-3 gap-3 text-right">
                        <div>
                            <p class="text-[10px] font-bold uppercase text-slate-500">Ronin</p>
                            <p class="text-xs font-bold text-sky-200 mt-1">${roninNumberToText(asset.balance)} ${escapeHTML(asset.symbol)}</p>
                        </div>
                        <div>
                            <p class="text-[10px] font-bold uppercase text-slate-500">App</p>
                            <p class="text-xs font-bold text-slate-200 mt-1">${canCompare ? `${roninNumberToText(appAmount)} ${escapeHTML(asset.symbol)}` : 'Unmapped'}</p>
                        </div>
                        <div>
                            <p class="text-[10px] font-bold uppercase text-slate-500">Diff</p>
                            <p class="text-xs font-bold ${diffTone} mt-1">${canCompare ? formatRoninSignedAmount(diff, asset.symbol) : '--'}</p>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }).join('') || '<div class="text-sm text-slate-500 py-6 text-center">No Ronin balances found.</div>';
}

function renderRoninTokenEditor(settings) {
    const mount = document.getElementById('ronin-token-editor');
    if (!mount) return;
    const tokens = getRoninTokenEditorMappings(settings);
    if (!tokens.length) {
        mount.innerHTML = '<div class="text-xs text-slate-500">Track an ERC-20 contract to fetch token balances and transfer activity.</div>';
        return;
    }
    mount.innerHTML = tokens.map(token => {
        const encodedKey = encodeInlineArg(token.key);
        return `
            <div class="rounded-xl border border-slate-800 bg-slate-900/60 p-2">
                <div class="grid grid-cols-2 gap-2">
                    <input value="${escapeAttr(token.contract)}" onchange="updateRoninTokenMapping('${encodedKey}', 'contract', this.value)"
                        class="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-[11px] font-semibold text-slate-200 outline-none focus:border-sky-500" placeholder="0x contract">
                    <input value="${escapeAttr(token.tokenId)}" onchange="updateRoninTokenMapping('${encodedKey}', 'tokenId', this.value)"
                        class="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-[11px] font-semibold text-slate-200 outline-none focus:border-sky-500" placeholder="CoinGecko/app token id">
                    <input value="${escapeAttr(token.symbol)}" onchange="updateRoninTokenMapping('${encodedKey}', 'symbol', this.value)"
                        class="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-[11px] font-semibold text-slate-200 outline-none focus:border-sky-500" placeholder="Symbol">
                    <input value="${escapeAttr(token.decimals)}" onchange="updateRoninTokenMapping('${encodedKey}', 'decimals', this.value)"
                        class="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-[11px] font-semibold text-slate-200 outline-none focus:border-sky-500" placeholder="Decimals">
                </div>
                <button type="button" onclick="removeRoninTokenMapping('${encodedKey}')"
                    class="mt-2 text-[10px] font-bold text-rose-300 hover:text-rose-200">remove token</button>
            </div>
        `;
    }).join('');
}

async function addRoninTokenMappingRow() {
    const settings = getRoninReconcileSettingsSafe();
    const id = `draft:${Date.now().toString(16)}`;
    await persistRoninReconcileSettings({
        assetMappings: {
            ...(settings.assetMappings || {}),
            [id]: {
                contract: '',
                tokenId: '',
                symbol: '',
                label: '',
                decimals: 18
            }
        }
    });
    await renderRoninReconcilePanel();
}

async function updateRoninTokenMapping(keyEncoded, field, value) {
    const oldKey = decodeURIComponent(keyEncoded || '').toLowerCase();
    const settings = getRoninReconcileSettingsSafe();
    const current = { ...(settings.assetMappings?.[oldKey] || {}) };
    current[field] = String(value || '').trim();
    if (field === 'contract') current.contract = normalizeRoninAddress(current.contract);
    if (field === 'tokenId') current.tokenId = current.tokenId.toLowerCase();
    if (field === 'symbol') current.symbol = current.symbol.toUpperCase();
    if (field === 'decimals') current.decimals = Math.max(0, Math.round(toRoninFiniteNumber(current.decimals, 18)));
    const newKey = current.contract && isValidRoninAddress(current.contract) ? buildRoninAssetKey(current.contract) : oldKey;
    const nextMappings = { ...(settings.assetMappings || {}) };
    delete nextMappings[oldKey];
    nextMappings[newKey] = current;
    await persistRoninReconcileSettings({ assetMappings: nextMappings });
    await renderRoninReconcilePanel();
}

async function removeRoninTokenMapping(keyEncoded) {
    const key = decodeURIComponent(keyEncoded || '').toLowerCase();
    const settings = getRoninReconcileSettingsSafe();
    const nextMappings = { ...(settings.assetMappings || {}) };
    delete nextMappings[key];
    await persistRoninReconcileSettings({ assetMappings: nextMappings });
    await renderRoninReconcilePanel();
}

async function getRoninImportedHashSet() {
    const imported = new Set();
    if (typeof getDecryptedCrypto !== 'function') return imported;
    try {
        const txs = await getDecryptedCrypto();
        (txs || []).forEach(tx => {
            const hash = String(tx?.ronin?.hash || '').trim().toLowerCase();
            if (hash) imported.add(hash);
        });
    } catch (error) {
        console.warn('Could not scan crypto history for Ronin imports.', error);
    }
    return imported;
}

function getRoninImportOptions(row) {
    const positive = (row?.deltas || []).filter(delta => delta.value > 0.00000001);
    const negative = (row?.deltas || []).filter(delta => delta.value < -0.00000001);
    const options = [];
    if (positive.length && negative.length) options.push({ value: 'swap', label: 'Swap + fee' });
    if (positive.length && !negative.length) {
        options.push({ value: 'transfer_in', label: 'Transfer in' });
        options.push({ value: 'airdrop', label: 'Airdrop / reward' });
    }
    if (negative.length && !positive.length) options.push({ value: 'transfer_out', label: 'Transfer out' });
    return options;
}

function getRoninImportOptionLabel(value) {
    const labels = {
        swap: 'Swap + fee',
        transfer_in: 'Transfer in',
        transfer_out: 'Transfer out',
        airdrop: 'Airdrop / reward',
        network_fee: 'RON network fee',
        swap_in: 'Swap in',
        swap_out: 'Swap out'
    };
    return labels[value] || 'Ronin import';
}

function getRoninImportImpactText(value) {
    if (value === 'swap') return 'Creates linked swap_out and swap_in entries from tracked ERC-20 deltas, plus a RON network_fee entry when this wallet paid gas.';
    if (value === 'transfer_in') return 'Creates balance-only transfer_in entries. Use this for movement from another wallet you own.';
    if (value === 'transfer_out') return 'Creates transfer_out entries that reduce token balance without recording a sale or realized P/L.';
    if (value === 'airdrop') return 'Creates zero-cost airdrop/reward entries.';
    return 'Review before saving; imports are deduped by Ronin transaction hash.';
}

function getRoninRowByHash(hash) {
    const normalized = String(hash || '').trim().toLowerCase();
    return (roninReconcileState.rows || []).find(row => row.hash === normalized) || null;
}

function buildRoninBasePayload(row, delta, type, amount, notes, extra = {}) {
    return {
        tokenId: delta.tokenId,
        symbol: delta.symbol,
        amount: Math.max(0, Number(amount || 0)),
        price: 0,
        currency: 'PHP',
        phpPrice: 0,
        phpTotal: 0,
        total: 0,
        type,
        notes,
        exchange: 'ronin',
        strategy: 'ledger-import',
        date: row.date || new Date().toISOString(),
        source: 'ronin_ledger_import',
        nonTaxAdjustment: type !== 'swap_in' && type !== 'swap_out',
        ronin: {
            hash: row.hash,
            blockNumber: row.blockNumber,
            account: roninReconcileState.account,
            category: row.category,
            contract: delta.contract || '',
            importClassification: extra.importClassification || type,
            feeRon: row.feeRon || 0
        },
        ...extra.fields
    };
}

function buildRoninFeePayload(row, notes, importClassification) {
    const mapping = getRoninReconcileSettingsSafe().assetMappings?.[RONIN_NATIVE_ASSET_KEY] || {};
    return buildRoninBasePayload(row, {
        tokenId: String(mapping.tokenId || 'ronin').trim().toLowerCase(),
        symbol: 'RON',
        contract: '',
        value: -row.feeRon
    }, 'network_fee', row.feeRon, notes, {
        importClassification,
        fields: { nonTaxAdjustment: true }
    });
}

function buildRoninImportPayloads(row, classification, notes) {
    const positive = (row?.deltas || []).filter(delta => delta.value > 0.00000001);
    const negative = (row?.deltas || []).filter(delta => delta.value < -0.00000001);
    const payloads = [];

    if (classification === 'swap') {
        if (positive.length !== 1 || negative.length !== 1) throw new Error('Swap import needs one incoming and one outgoing tracked token.');
        const swapId = `ronin_swap_${String(row.hash || Date.now()).slice(0, 16)}`;
        payloads.push(buildRoninBasePayload(row, negative[0], 'swap_out', Math.abs(negative[0].value), notes, {
            importClassification: 'swap',
            fields: { swapId, linkedToken: positive[0].symbol, nonTaxAdjustment: false }
        }));
        payloads.push(buildRoninBasePayload(row, positive[0], 'swap_in', Math.abs(positive[0].value), notes, {
            importClassification: 'swap',
            fields: { swapId, linkedToken: negative[0].symbol, nonTaxAdjustment: false }
        }));
    } else if (classification === 'transfer_in' || classification === 'airdrop') {
        positive.forEach(delta => payloads.push(buildRoninBasePayload(row, delta, classification, Math.abs(delta.value), notes, {
            importClassification: classification
        })));
    } else if (classification === 'transfer_out') {
        negative.forEach(delta => payloads.push(buildRoninBasePayload(row, delta, 'transfer_out', Math.abs(delta.value), notes, {
            importClassification: 'transfer_out'
        })));
    } else {
        throw new Error('Choose a supported Ronin import type.');
    }

    if (row.feeRon > 0) payloads.push(buildRoninFeePayload(row, notes, classification));
    return payloads;
}

function closeRoninImportReview() {
    roninPendingImport = null;
    document.getElementById('ronin-import-modal')?.classList.add('hidden');
}

function renderRoninImportModalDetails() {
    if (!roninPendingImport) return;
    const row = roninPendingImport.row;
    const selectEl = document.getElementById('ronin-import-classification');
    const classification = String(selectEl?.value || roninPendingImport.defaultClassification || '').trim();
    roninPendingImport.selectedClassification = classification;
    const label = getRoninImportOptionLabel(classification);
    const notesEl = document.getElementById('ronin-import-notes');
    const notes = String(notesEl?.value || '').trim() || `${label} imported from Ronin transaction ${shortRoninText(row.hash, 10, 8)}.`;
    let payloads = [];
    let error = '';
    try {
        payloads = buildRoninImportPayloads(row, classification, notes);
    } catch (err) {
        error = err?.message || 'Could not build Ronin import preview.';
    }

    const titleEl = document.getElementById('ronin-import-title');
    const subtitleEl = document.getElementById('ronin-import-subtitle');
    const summaryEl = document.getElementById('ronin-import-summary');
    const previewEl = document.getElementById('ronin-import-preview');
    const impactEl = document.getElementById('ronin-import-impact');
    if (titleEl) titleEl.innerText = `Import as ${label}`;
    if (subtitleEl) subtitleEl.innerText = `Block ${row.blockNumber || '--'} - ${shortRoninText(row.hash, 10, 8)}`;
    if (summaryEl) {
        summaryEl.innerHTML = `
            <p class="text-sm font-bold text-slate-200">${escapeHTML(row.explanation || 'Ronin activity')}</p>
            <p class="text-[11px] text-slate-500 mt-1">${escapeHTML(row.date ? new Date(row.date).toLocaleString() : 'Unknown date')} - ${escapeHTML(row.result || 'unknown')}</p>
        `;
    }
    if (previewEl) {
        previewEl.innerHTML = error
            ? `<div class="rounded-2xl border border-amber-900/60 bg-amber-950/30 p-4 text-sm text-amber-100">${escapeHTML(error)}</div>`
            : payloads.map(payload => {
                const positive = ['swap_in', 'transfer_in', 'airdrop'].includes(payload.type);
                return `
                    <div class="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 flex items-start justify-between gap-3">
                        <div>
                            <p class="text-sm font-bold text-slate-200">${escapeHTML(getRoninImportOptionLabel(payload.type))}</p>
                            <p class="text-[11px] text-slate-500 mt-1">${escapeHTML(payload.tokenId)} - ${escapeHTML(payload.symbol)}</p>
                        </div>
                        <p class="text-sm font-black ${positive ? 'text-emerald-300' : 'text-rose-300'}">${positive ? '+' : '-'}${roninNumberToText(payload.amount)} ${escapeHTML(payload.symbol)}</p>
                    </div>
                `;
            }).join('');
    }
    if (impactEl) impactEl.innerText = getRoninImportImpactText(classification);
    if (notesEl && !notesEl.value.trim()) notesEl.value = notes;
    if (window.lucide) window.lucide.createIcons();
}

async function openRoninImportReview(hashEncoded) {
    const hash = decodeURIComponent(hashEncoded || '').toLowerCase();
    const row = getRoninRowByHash(hash);
    if (!row) {
        if (typeof showToast === 'function') showToast('Could not find that Ronin activity row');
        return;
    }
    const imported = await getRoninImportedHashSet();
    if (imported.has(row.hash)) {
        if (typeof showToast === 'function') showToast('This Ronin activity is already imported');
        return;
    }
    const options = getRoninImportOptions(row);
    if (!options.length) {
        if (typeof showToast === 'function') showToast('This Ronin activity is not importable yet');
        return;
    }
    const missing = (row.deltas || []).filter(delta => Math.abs(delta.value) > 0.00000001 && !delta.tokenId);
    if (missing.length) {
        if (typeof showToast === 'function') showToast('Map token IDs for this Ronin contract first');
        return;
    }

    roninPendingImport = {
        row,
        options,
        defaultClassification: options[0].value,
        selectedClassification: options[0].value
    };
    const selectEl = document.getElementById('ronin-import-classification');
    if (selectEl) {
        selectEl.innerHTML = options.map(option => `<option value="${escapeAttr(option.value)}">${escapeHTML(option.label)}</option>`).join('');
    }
    const notesEl = document.getElementById('ronin-import-notes');
    if (notesEl) notesEl.value = '';
    document.getElementById('ronin-import-modal')?.classList.remove('hidden');
    renderRoninImportModalDetails();
}

async function saveRoninImport() {
    try {
        if (!roninPendingImport?.row) throw new Error('No Ronin import is open.');
        const row = roninPendingImport.row;
        const imported = await getRoninImportedHashSet();
        if (imported.has(row.hash)) throw new Error('This Ronin activity is already imported.');
        const classification = String(document.getElementById('ronin-import-classification')?.value || roninPendingImport.selectedClassification || '').trim();
        const allowed = new Set((roninPendingImport.options || []).map(option => option.value));
        if (!allowed.has(classification)) throw new Error('Choose a valid Ronin import type.');
        const label = getRoninImportOptionLabel(classification);
        const notes = String(document.getElementById('ronin-import-notes')?.value || '').trim() ||
            `${label} imported from Ronin transaction ${shortRoninText(row.hash, 10, 8)}.`;
        const payloads = buildRoninImportPayloads(row, classification, notes);
        if (!payloads.length) throw new Error('No app entries would be created.');

        const db = await getDB();
        db.crypto = Array.isArray(db.crypto) ? db.crypto : [];
        const now = Date.now();
        for (let index = 0; index < payloads.length; index += 1) {
            const payload = payloads[index];
            db.crypto.push({
                id: `ronin_import_${String(row.hash || now).slice(0, 12)}_${index}_${Math.random().toString(36).slice(2, 7)}`,
                data: await encryptData(payload),
                createdAt: now + index,
                lastModified: now + index,
                deletedAt: null
            });
        }
        const saved = await saveDB(db);
        rawCrypto = (saved.crypto || []).filter(c => !c.deletedAt);
        if (typeof invalidateCryptoComputationCache === 'function') invalidateCryptoComputationCache();
        closeRoninImportReview();
        if (typeof showToast === 'function') showToast(`Imported ${payloads.length} Ronin app entr${payloads.length === 1 ? 'y' : 'ies'}`);
        if (typeof loadFromStorage === 'function') {
            await loadFromStorage();
            if (typeof renderCryptoPortfolio === 'function' && !document.getElementById('crypto-portfolio-modal')?.classList.contains('hidden')) {
                await renderCryptoPortfolio();
            }
        } else if (typeof renderCryptoPortfolio === 'function') {
            await renderCryptoPortfolio();
        }
    } catch (error) {
        console.error('Failed to import Ronin activity.', error);
        const message = error?.message || 'Could not import Ronin activity.';
        if (typeof showToast === 'function') showToast(message);
        else alert(message);
    }
}

async function renderRoninActivityList() {
    const list = document.getElementById('ronin-activity-list');
    const countEl = document.getElementById('ronin-activity-count');
    if (!list) return;
    if (countEl) countEl.innerText = `${roninReconcileState.rows.length} row${roninReconcileState.rows.length === 1 ? '' : 's'}`;
    if (!roninReconcileState.rows.length) {
        list.innerHTML = roninReconcileState.account
            ? '<div class="text-sm text-slate-500 py-6 text-center">No tracked ERC-20 transfer activity found in this block window.</div>'
            : '<div class="text-sm text-slate-500 py-6 text-center">No Ronin activity loaded yet.</div>';
        return;
    }
    const imported = await getRoninImportedHashSet();
    list.innerHTML = roninReconcileState.rows.map(row => {
        const alreadyImported = imported.has(row.hash);
        const importable = getRoninImportOptions(row).length > 0 && row.result === 'success';
        const actionMarkup = alreadyImported
            ? '<span class="inline-flex items-center justify-center rounded-xl border border-emerald-800/70 bg-emerald-950/30 px-3 py-1.5 text-[11px] font-black text-emerald-300">Imported</span>'
            : (importable ? `
                <button type="button" onclick="openRoninImportReview('${encodeInlineArg(row.hash)}')"
                    class="rounded-xl border border-sky-700/70 bg-sky-500/10 px-3 py-1.5 text-[11px] font-black text-sky-200 hover:bg-sky-500/20">
                    Review Import
                </button>
            ` : '<span class="text-[10px] text-slate-600">Not importable</span>');
        const deltaMarkup = (row.deltas || []).map(delta => {
            const tone = delta.value > 0 ? 'text-emerald-300' : 'text-rose-300';
            return `
                <div class="rounded-xl border border-slate-800 bg-slate-950/80 px-3 py-2">
                    <p class="text-xs font-bold ${tone}">${formatRoninSignedAmount(delta.value, delta.symbol)}</p>
                    <p class="text-[10px] text-slate-600 mt-0.5">${escapeHTML(shortRoninText(delta.contract, 8, 6))}</p>
                </div>
            `;
        }).join('');
        return `
            <div class="rounded-2xl border border-slate-800 bg-slate-900/60 p-3">
                <div class="flex items-start justify-between gap-3">
                    <div class="min-w-0">
                        <div class="flex flex-wrap items-center gap-2">
                            <span class="rounded-full border border-sky-700/70 bg-sky-500/10 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-sky-200">${escapeHTML(row.category)}</span>
                            <span class="text-[10px] text-slate-600">Block ${row.blockNumber || '--'}</span>
                        </div>
                        <p class="text-sm font-semibold text-slate-200 mt-2">${escapeHTML(row.explanation)}</p>
                        <p class="text-[10px] text-slate-500 mt-1">${escapeHTML(row.date ? new Date(row.date).toLocaleString() : 'Unknown date')} - ${escapeHTML(shortRoninText(row.hash, 8, 8))}</p>
                    </div>
                    <div class="text-right shrink-0">
                        <p class="text-[10px] font-bold uppercase text-slate-500">Fee</p>
                        <p class="text-xs font-bold text-amber-300 mt-1">${row.feeRon > 0 ? `${roninNumberToText(row.feeRon, 8)} RON` : '--'}</p>
                        <div class="mt-2">${actionMarkup}</div>
                    </div>
                </div>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3">${deltaMarkup}</div>
            </div>
        `;
    }).join('');
}

async function renderRoninReconcilePanel() {
    const panel = document.getElementById('ronin-reconcile-panel');
    if (!panel) return;
    const settings = getRoninReconcileSettingsSafe();
    renderRoninControls(settings);
    renderRoninTokenEditor(settings);
    if (roninReconcileState.loading) {
        setRoninStatus('Fetching Ronin balances and ERC-20 Transfer logs. This will not change saved crypto entries.');
    } else if (roninReconcileState.error) {
        setRoninStatus(roninReconcileState.error, 'error');
    } else if (roninReconcileState.account) {
        setRoninStatus(`Loaded ${roninReconcileState.rows.length} Ronin ERC-20 activity row${roninReconcileState.rows.length === 1 ? '' : 's'} for ${formatRoninAddress(roninReconcileState.account)} from block ${roninReconcileState.fromBlock || '--'} to ${roninReconcileState.latestBlock || '--'}.`, 'success');
    } else {
        setRoninStatus(settings.walletAddress
            ? 'Saved Ronin wallet is ready. Fetch Ronin to compare balances.'
            : 'Enter a Ronin wallet address to compare balances and load tracked ERC-20 activity.');
    }
    await renderRoninBalanceComparison(settings);
    await renderRoninActivityList();
    if (window.lucide) window.lucide.createIcons();
}

async function refreshRoninReconciliation() {
    if (roninReconcileState.loading) return;
    const settings = getRoninReconcileSettingsSafe();
    const walletInput = document.getElementById('ronin-wallet-address');
    const endpointInput = document.getElementById('ronin-endpoint-url');
    const fromBlockInput = document.getElementById('ronin-from-block');
    const account = normalizeRoninAddress(walletInput?.value || settings.walletAddress || '');
    const endpoint = String(endpointInput?.value || settings.endpoint || RONIN_DEFAULT_ENDPOINT).trim() || RONIN_DEFAULT_ENDPOINT;
    if (!isValidRoninAddress(account)) {
        roninReconcileState = { ...roninReconcileState, account, error: 'Enter a valid Ronin or 0x wallet address.', loading: false };
        await renderRoninReconcilePanel();
        return;
    }

    roninReconcileState = { ...roninReconcileState, account, endpoint, loading: true, error: '' };
    await persistRoninReconcileSettings({
        walletAddress: formatRoninAddress(account),
        endpoint,
        fromBlock: String(fromBlockInput?.value || settings.fromBlock || '').trim()
    });
    await renderRoninReconcilePanel();

    try {
        const chainId = await getRoninChainId(endpoint);
        if (String(chainId).toLowerCase() !== RONIN_CHAIN_ID_HEX) {
            throw new Error(`Endpoint returned chain ${chainId}, expected Ronin mainnet ${RONIN_CHAIN_ID_HEX}.`);
        }
        const latestBlock = Number(parseRoninHexInt(await roninRpc('eth_blockNumber', [], endpoint)));
        const requestedFromBlock = Number(String(fromBlockInput?.value || settings.fromBlock || '').trim());
        const fromBlock = Number.isFinite(requestedFromBlock) && requestedFromBlock > 0
            ? Math.max(0, Math.round(requestedFromBlock))
            : Math.max(0, latestBlock - RONIN_DEFAULT_LOOKBACK_BLOCKS);
        const balances = await fetchRoninBalances(account, endpoint, getRoninReconcileSettingsSafe());
        const rows = await buildRoninActivityRows(account, endpoint, getRoninReconcileSettingsSafe(), fromBlock, latestBlock);
        const fetchedAt = Date.now();
        roninReconcileState = {
            account,
            endpoint,
            balances,
            balanceMap: buildRoninBalanceMap(balances),
            rows,
            loading: false,
            error: '',
            fetchedAt,
            latestBlock,
            fromBlock
        };
        await persistRoninReconcileSettings({
            walletAddress: formatRoninAddress(account),
            endpoint,
            fromBlock: String(fromBlock),
            lastRefreshAt: fetchedAt,
            lastBlockNumber: latestBlock
        });
    } catch (error) {
        console.error('Ronin reconciliation failed.', error);
        roninReconcileState = {
            ...roninReconcileState,
            loading: false,
            error: error?.message || 'Could not fetch Ronin data.'
        };
    }
    await renderRoninReconcilePanel();
}
