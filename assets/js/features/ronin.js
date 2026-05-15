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
const RONIN_CSV_NATIVE_LABELS = new Set(['ron', 'ronin']);
const RONIN_CSV_TOKEN_DEFAULTS = {
    'axie infinity shard': { tokenId: 'axie-infinity', symbol: 'AXS', label: 'Axie Infinity Shard' },
    'pixel': { tokenId: 'pixels', symbol: 'PIXEL', label: 'PIXEL' },
    'usd coin': { tokenId: 'usd-coin', symbol: 'USDC', label: 'USD Coin' },
    'ronin wrapped ether': { tokenId: 'weth', symbol: 'WETH', label: 'Ronin Wrapped Ether' },
    'wrapped bitcoin': { tokenId: 'wrapped-bitcoin', symbol: 'WBTC', label: 'Wrapped Bitcoin' }
};

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
    fromBlock: 0,
    sourceMode: 'rpc',
    csvSummary: null,
    stakingSummary: null
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

function normalizeRoninCsvLabel(value) {
    return String(value || '')
        .replace(/^\uFEFF/, '')
        .trim()
        .replace(/\s+/g, ' ');
}

function slugRoninCsvLabel(value) {
    return normalizeRoninCsvLabel(value)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'token';
}

function getRoninCsvAssetKey(label) {
    const normalized = normalizeRoninCsvLabel(label);
    const lower = normalized.toLowerCase();
    if (RONIN_CSV_NATIVE_LABELS.has(lower)) return RONIN_NATIVE_ASSET_KEY;
    return `csv:${slugRoninCsvLabel(normalized)}`;
}

function getRoninCsvDefaultMapping(label) {
    const normalized = normalizeRoninCsvLabel(label);
    const lower = normalized.toLowerCase();
    if (RONIN_CSV_NATIVE_LABELS.has(lower)) {
        return { tokenId: 'ronin', symbol: 'RON', label: 'RON', decimals: 18 };
    }
    const defaults = RONIN_CSV_TOKEN_DEFAULTS[lower] || {};
    return {
        tokenId: String(defaults.tokenId || '').trim().toLowerCase(),
        symbol: String(defaults.symbol || normalized || 'TOKEN').trim().toUpperCase(),
        label: String(defaults.label || normalized || 'Token').trim(),
        decimals: Math.max(0, Math.round(toRoninFiniteNumber(defaults.decimals, 18))),
        csvLabel: normalized
    };
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

function getRoninCsvTokenMappings(settings = getRoninReconcileSettingsSafe()) {
    return Object.entries(settings.assetMappings || {})
        .filter(([key]) => key.startsWith('csv:'))
        .map(([key, mapping]) => ({
            key,
            tokenId: String(mapping?.tokenId || '').trim().toLowerCase(),
            symbol: String(mapping?.symbol || '').trim().toUpperCase(),
            label: String(mapping?.label || mapping?.csvLabel || key).trim(),
            csvLabel: String(mapping?.csvLabel || mapping?.label || key).trim(),
            decimals: Math.max(0, Math.round(toRoninFiniteNumber(mapping?.decimals, 18)))
        }))
        .sort((a, b) => String(a.label || '').localeCompare(String(b.label || '')));
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
    const methodText = String(row.method || '').trim();
    if (row.category === 'stake' && negative.length) return `Delegated/staked ${negText}${feeText}.`;
    if (row.category === 'unstake' && positive.length) return `Undelegated ${posText}${feeText}.`;
    if (row.category === 'reward' && positive.length) return `Claimed staking reward ${posText}${feeText}.`;
    if (row.category === 'stake-fee') return `${methodText || 'Staking maintenance'} fee: ${roninNumberToText(row.feeRon, 8)} RON.`;
    if (row.category === 'restake' && positive.length && negative.length) return `Restaked ${posText}${feeText}.`;
    if (positive.length && negative.length) return `${negText} moved out and ${posText} moved in${feeText}.`;
    if (positive.length) return `Received ${posText}${feeText}.`;
    if (negative.length) return `Sent ${negText}${feeText}.`;
    return row.feeRon > 0 ? `Fee-only Ronin activity: ${roninNumberToText(row.feeRon, 8)} RON.` : 'Ronin activity found.';
}

function getRoninCsvMethodSet(row) {
    return new Set(String(row?.method || '')
        .split(',')
        .map(method => method.trim())
        .filter(Boolean));
}

function hasRoninCsvMethod(row, names) {
    const methods = getRoninCsvMethodSet(row);
    return names.some(name => methods.has(name));
}

function classifyRoninCsvCategory(row, deltas) {
    const hasPositive = deltas.some(delta => delta.value > 0);
    const hasNegative = deltas.some(delta => delta.value < 0);
    if (hasRoninCsvMethod(row, ['delegate'])) return 'stake';
    if (hasRoninCsvMethod(row, ['undelegate'])) return 'unstake';
    if (hasRoninCsvMethod(row, ['claimRewards', 'claimPendingRewards'])) return hasPositive ? 'reward' : 'stake-fee';
    if (hasRoninCsvMethod(row, ['delegateRewards', 'redelegate'])) return 'stake-fee';
    if (hasRoninCsvMethod(row, ['restakeRewards'])) return hasPositive && hasNegative ? 'restake' : 'stake-fee';
    return hasPositive && hasNegative ? 'swap' : (hasPositive ? 'receive' : (hasNegative ? 'send' : (row.feeRon > 0 ? 'fee-only' : 'unknown')));
}

function parseRoninCsvLine(line) {
    const out = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i += 1) {
        const ch = line[i];
        const next = line[i + 1];
        if (ch === '"' && inQuotes && next === '"') {
            current += '"';
            i += 1;
            continue;
        }
        if (ch === '"') {
            inQuotes = !inQuotes;
            continue;
        }
        if (ch === ',' && !inQuotes) {
            out.push(current);
            current = '';
            continue;
        }
        current += ch;
    }
    out.push(current);
    return out.map(value => value.trim());
}

function parseRoninCsvText(text) {
    const lines = String(text || '')
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(Boolean);
    if (lines.length < 2) return { headers: [], rows: [] };

    const headers = parseRoninCsvLine(lines[0]).map(header => header.replace(/^\uFEFF/, '').trim());
    const rows = lines.slice(1).map(line => {
        const values = parseRoninCsvLine(line);
        const row = {};
        headers.forEach((header, index) => {
            row[header] = values[index] || '';
        });
        return row;
    });
    return { headers, rows };
}

function parseRoninCsvNumber(value) {
    const cleaned = String(value || '').replace(/,/g, '').trim();
    const numeric = Number(cleaned);
    return Number.isFinite(numeric) ? numeric : 0;
}

function getRoninCsvField(row, names) {
    for (const name of names) {
        if (Object.prototype.hasOwnProperty.call(row, name)) return row[name];
    }
    const lowerMap = new Map(Object.keys(row || {}).map(key => [key.toLowerCase(), key]));
    for (const name of names) {
        const key = lowerMap.get(String(name).toLowerCase());
        if (key) return row[key];
    }
    return '';
}

function buildRoninCsvFingerprint(row) {
    return [
        getRoninCsvField(row, ['Txhash']),
        getRoninCsvField(row, ['Blockno']),
        getRoninCsvField(row, ['From']),
        getRoninCsvField(row, ['To']),
        getRoninCsvField(row, ['Method']),
        getRoninCsvField(row, ['Token / Collectibles']),
        getRoninCsvField(row, ['Value in']),
        getRoninCsvField(row, ['Value out']),
        getRoninCsvField(row, ['TxnFee(RON)']),
        getRoninCsvField(row, ['Status'])
    ].map(value => String(value || '').trim().toLowerCase()).join('|');
}

function inferRoninCsvAccount(rows, preferredAccount = '') {
    const preferred = normalizeRoninAddress(preferredAccount);
    if (isValidRoninAddress(preferred)) return preferred;

    const counts = new Map();
    (rows || []).forEach(row => {
        [getRoninCsvField(row, ['From']), getRoninCsvField(row, ['To'])].forEach(address => {
            const normalized = normalizeRoninAddress(address);
            if (!isValidRoninAddress(normalized) || /^0x0{40}$/.test(normalized)) return;
            counts.set(normalized, (counts.get(normalized) || 0) + 1);
        });
    });
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || '';
}

function hydrateRoninRowsWithMappings(rows, settings = getRoninReconcileSettingsSafe()) {
    return (rows || []).map(row => {
        const deltas = (row.deltas || []).map(delta => {
            const mapping = settings.assetMappings?.[delta.key] || {};
            return {
                ...delta,
                tokenId: String(mapping.tokenId || delta.tokenId || '').trim().toLowerCase(),
                symbol: String(mapping.symbol || delta.symbol || delta.label || 'TOKEN').trim().toUpperCase(),
                label: String(mapping.label || delta.label || mapping.csvLabel || delta.symbol || 'Token').trim(),
                decimals: Math.max(0, Math.round(toRoninFiniteNumber(mapping.decimals, delta.decimals || 18)))
            };
        });
        return {
            ...row,
            deltas,
            explanation: buildRoninActivityExplanation({ ...row, deltas })
        };
    });
}

function buildRoninCsvActivityRows(csvRows, account, settings = getRoninReconcileSettingsSafe()) {
    const uniqueRows = new Map();
    (csvRows || []).forEach(row => {
        const hash = String(getRoninCsvField(row, ['Txhash']) || '').trim().toLowerCase();
        if (!hash) return;
        const fingerprint = buildRoninCsvFingerprint(row);
        if (!uniqueRows.has(fingerprint)) uniqueRows.set(fingerprint, row);
    });

    const grouped = new Map();
    const discoveredMappings = {};
    uniqueRows.forEach(row => {
        const hash = String(getRoninCsvField(row, ['Txhash']) || '').trim().toLowerCase();
        const blockNumber = Math.round(parseRoninCsvNumber(getRoninCsvField(row, ['Blockno'])));
        const unixTimestamp = parseRoninCsvNumber(getRoninCsvField(row, ['UnixTimestamp']));
        const method = String(getRoninCsvField(row, ['Method']) || '').trim();
        const tokenLabel = normalizeRoninCsvLabel(getRoninCsvField(row, ['Token / Collectibles']));
        const key = getRoninCsvAssetKey(tokenLabel);
        const defaults = getRoninCsvDefaultMapping(tokenLabel);
        const mapping = settings.assetMappings?.[key] || defaults;
        if (!settings.assetMappings?.[key]) discoveredMappings[key] = { ...defaults };

        const valueIn = parseRoninCsvNumber(getRoninCsvField(row, ['Value in']));
        const valueOut = parseRoninCsvNumber(getRoninCsvField(row, ['Value out']));
        const value = valueIn - valueOut;
        const feeRon = parseRoninCsvNumber(getRoninCsvField(row, ['TxnFee(RON)']));
        const status = String(getRoninCsvField(row, ['Status']) || '').trim();
        const existing = grouped.get(hash) || {
            hash,
            blockNumber,
            deltasByKey: new Map(),
            feeRon: 0,
            from: normalizeRoninAddress(getRoninCsvField(row, ['From'])),
            to: normalizeRoninAddress(getRoninCsvField(row, ['To'])),
            date: unixTimestamp > 0 ? new Date(unixTimestamp * 1000).toISOString() : '',
            category: 'unknown',
            result: /^success$/i.test(status) ? 'success' : 'failed',
            methods: new Set(),
            sourceMode: 'csv',
            csvRowCount: 0
        };

        existing.blockNumber = Math.max(existing.blockNumber || 0, blockNumber || 0);
        if (!existing.date && unixTimestamp > 0) existing.date = new Date(unixTimestamp * 1000).toISOString();
        existing.feeRon = Math.max(existing.feeRon || 0, feeRon || 0);
        if (!/^success$/i.test(status)) existing.result = 'failed';
        if (method) existing.methods.add(method);
        existing.csvRowCount += 1;

        if (Math.abs(value) > 0.00000001) {
            const current = existing.deltasByKey.get(key) || {
                key,
                contract: '',
                tokenId: String(mapping.tokenId || '').trim().toLowerCase(),
                symbol: String(mapping.symbol || defaults.symbol || tokenLabel || 'TOKEN').trim().toUpperCase(),
                label: String(mapping.label || defaults.label || tokenLabel || 'Token').trim(),
                csvLabel: tokenLabel,
                decimals: Math.max(0, Math.round(toRoninFiniteNumber(mapping.decimals, defaults.decimals || 18))),
                from: normalizeRoninAddress(getRoninCsvField(row, ['From'])),
                to: normalizeRoninAddress(getRoninCsvField(row, ['To'])),
                value: 0
            };
            current.value += value;
            existing.deltasByKey.set(key, current);
        }
        grouped.set(hash, existing);
    });

    const rows = Array.from(grouped.values()).map(row => {
        const deltas = Array.from(row.deltasByKey.values())
            .filter(delta => Math.abs(delta.value) > 0.00000001);
        const normalizedRow = {
            hash: row.hash,
            blockNumber: row.blockNumber,
            deltas,
            feeRon: row.feeRon,
            from: row.from,
            to: row.to,
            date: row.date,
            category: 'unknown',
            result: row.result,
            method: Array.from(row.methods).join(', '),
            sourceMode: 'csv',
            csvRowCount: row.csvRowCount
        };
        normalizedRow.category = classifyRoninCsvCategory(normalizedRow, deltas);
        normalizedRow.explanation = buildRoninActivityExplanation(normalizedRow);
        return normalizedRow;
    }).sort((a, b) => b.blockNumber - a.blockNumber || String(b.hash).localeCompare(String(a.hash)));

    return {
        rows,
        discoveredMappings,
        summary: {
            rawRows: (csvRows || []).length,
            uniqueRows: uniqueRows.size,
            hashes: grouped.size,
            duplicateRows: Math.max(0, (csvRows || []).length - uniqueRows.size),
            firstBlock: rows.length ? Math.min(...rows.map(row => row.blockNumber || 0).filter(Boolean)) : 0,
            lastBlock: rows.length ? Math.max(...rows.map(row => row.blockNumber || 0).filter(Boolean)) : 0,
            csvAssets: Object.keys(discoveredMappings).length
        }
    };
}

function buildRoninStakingSummary(rows = []) {
    const summary = {
        delegatedRon: 0,
        undelegatedRon: 0,
        estimatedStakedRon: 0,
        stakingFeesRon: 0,
        rewardCount: 0,
        stakeCount: 0,
        unstakeCount: 0,
        feeOnlyCount: 0,
        rewardsBySymbol: new Map()
    };

    (rows || []).forEach(row => {
        const category = String(row?.category || '').trim();
        const isStakingRow = ['stake', 'unstake', 'reward', 'stake-fee', 'restake'].includes(category);
        if (isStakingRow && Number(row?.feeRon || 0) > 0) {
            summary.stakingFeesRon += Number(row.feeRon || 0);
        }
        if (category === 'stake') summary.stakeCount += 1;
        if (category === 'unstake') summary.unstakeCount += 1;
        if (category === 'stake-fee') summary.feeOnlyCount += 1;
        if (category === 'reward') summary.rewardCount += 1;

        (row?.deltas || []).forEach(delta => {
            const value = Number(delta?.value || 0);
            const key = String(delta?.key || '').toLowerCase();
            const symbol = String(delta?.symbol || delta?.label || 'TOKEN').toUpperCase();
            if (category === 'stake' && key === RONIN_NATIVE_ASSET_KEY && value < 0) {
                summary.delegatedRon += Math.abs(value);
            }
            if (category === 'unstake' && key === RONIN_NATIVE_ASSET_KEY && value > 0) {
                summary.undelegatedRon += value;
            }
            if (category === 'reward' && value > 0) {
                summary.rewardsBySymbol.set(symbol, (summary.rewardsBySymbol.get(symbol) || 0) + value);
            }
        });
    });

    summary.estimatedStakedRon = Math.max(0, summary.delegatedRon - summary.undelegatedRon);
    return summary;
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

function renderRoninCsvSummary() {
    const mount = document.getElementById('ronin-csv-summary');
    if (!mount) return;
    const summary = roninReconcileState.csvSummary;
    if (!summary) {
        mount.innerHTML = 'No Ronin CSV loaded yet.';
        return;
    }
    mount.innerHTML = `
        <div class="rounded-xl border border-slate-800 bg-slate-900/70 p-3">
            <p class="font-bold text-slate-300">Loaded ${summary.hashes || 0} transaction hash${summary.hashes === 1 ? '' : 'es'} from CSV.</p>
            <p class="mt-1 text-slate-500">
                ${summary.uniqueRows || 0} unique row${summary.uniqueRows === 1 ? '' : 's'}${summary.duplicateRows ? `, ${summary.duplicateRows} duplicate row${summary.duplicateRows === 1 ? '' : 's'} ignored` : ''}.
                ${summary.firstBlock && summary.lastBlock ? `Blocks ${summary.firstBlock} to ${summary.lastBlock}.` : ''}
            </p>
        </div>
    `;
}

function renderRoninCsvTokenMappings(settings) {
    const mount = document.getElementById('ronin-csv-token-mappings');
    if (!mount) return;
    const tokens = getRoninCsvTokenMappings(settings);
    if (!tokens.length) {
        mount.innerHTML = '';
        return;
    }
    mount.innerHTML = `
        <p class="text-[10px] font-bold uppercase text-slate-500">CSV Token Mappings</p>
        ${tokens.map(token => {
            const encodedKey = encodeInlineArg(token.key);
            const missingClass = token.tokenId ? 'border-slate-800' : 'border-amber-800/70';
            return `
                <div class="rounded-xl border ${missingClass} bg-slate-900/60 p-2">
                    <p class="text-[11px] font-bold text-slate-300 mb-2">${escapeHTML(token.csvLabel || token.label)}</p>
                    <div class="grid grid-cols-3 gap-2">
                        <input value="${escapeAttr(token.tokenId)}" onchange="updateRoninCsvTokenMapping('${encodedKey}', 'tokenId', this.value)"
                            class="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-[11px] font-semibold text-slate-200 outline-none focus:border-emerald-500" placeholder="app token id">
                        <input value="${escapeAttr(token.symbol)}" onchange="updateRoninCsvTokenMapping('${encodedKey}', 'symbol', this.value)"
                            class="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-[11px] font-semibold text-slate-200 outline-none focus:border-emerald-500" placeholder="symbol">
                        <input value="${escapeAttr(token.decimals)}" onchange="updateRoninCsvTokenMapping('${encodedKey}', 'decimals', this.value)"
                            class="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-[11px] font-semibold text-slate-200 outline-none focus:border-emerald-500" placeholder="decimals">
                    </div>
                </div>
            `;
        }).join('')}
    `;
}

function renderRoninStakingSummary() {
    const mount = document.getElementById('ronin-staking-summary');
    if (!mount) return;
    const summary = roninReconcileState.stakingSummary;
    if (!summary || (!summary.stakeCount && !summary.unstakeCount && !summary.rewardCount && !summary.feeOnlyCount)) {
        mount.innerHTML = '';
        return;
    }
    const rewardText = Array.from(summary.rewardsBySymbol || [])
        .map(([symbol, amount]) => `${roninNumberToText(amount)} ${symbol}`)
        .join(', ') || '--';
    mount.innerHTML = `
        <div class="rounded-2xl border border-sky-900/60 bg-sky-950/20 p-3">
            <div class="flex items-start justify-between gap-3">
                <div>
                    <p class="text-[10px] font-bold uppercase tracking-wide text-sky-300">Liquid vs Staked Estimate</p>
                    <p class="text-[11px] text-slate-400 mt-1">Based on loaded Ronin CSV rows. Staked RON is still treated as owned; only network fees reduce holdings.</p>
                </div>
                <span class="rounded-full border border-sky-800 bg-sky-950/70 px-2 py-0.5 text-[10px] font-black text-sky-200">v1.1</span>
            </div>
            <div class="grid grid-cols-2 gap-2 mt-3">
                <div class="rounded-xl border border-slate-800 bg-slate-950/70 p-2">
                    <p class="text-[10px] font-bold uppercase text-slate-500">Estimated Staked</p>
                    <p class="text-sm font-black text-sky-200 mt-1">${roninNumberToText(summary.estimatedStakedRon)} RON</p>
                </div>
                <div class="rounded-xl border border-slate-800 bg-slate-950/70 p-2">
                    <p class="text-[10px] font-bold uppercase text-slate-500">Staking Fees</p>
                    <p class="text-sm font-black text-amber-300 mt-1">${roninNumberToText(summary.stakingFeesRon, 8)} RON</p>
                </div>
                <div class="rounded-xl border border-slate-800 bg-slate-950/70 p-2 col-span-2">
                    <p class="text-[10px] font-bold uppercase text-slate-500">Rewards Found</p>
                    <p class="text-sm font-black text-emerald-300 mt-1">${escapeHTML(rewardText)}</p>
                </div>
            </div>
        </div>
    `;
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

async function updateRoninCsvTokenMapping(keyEncoded, field, value) {
    const key = decodeURIComponent(keyEncoded || '').toLowerCase();
    if (!key.startsWith('csv:')) return;
    const settings = getRoninReconcileSettingsSafe();
    const current = { ...(settings.assetMappings?.[key] || {}) };
    current[field] = String(value || '').trim();
    if (field === 'tokenId') current.tokenId = current.tokenId.toLowerCase();
    if (field === 'symbol') current.symbol = current.symbol.toUpperCase();
    if (field === 'decimals') current.decimals = Math.max(0, Math.round(toRoninFiniteNumber(current.decimals, 18)));
    const nextMappings = {
        ...(settings.assetMappings || {}),
        [key]: current
    };
    await persistRoninReconcileSettings({ assetMappings: nextMappings });
    roninReconcileState = {
        ...roninReconcileState,
        rows: hydrateRoninRowsWithMappings(roninReconcileState.rows || [], getRoninReconcileSettingsSafe())
    };
    roninReconcileState.stakingSummary = buildRoninStakingSummary(roninReconcileState.rows);
    await renderRoninReconcilePanel();
}

async function handleRoninCsvFileInput(fileList) {
    const files = Array.from(fileList || []).filter(file => file);
    if (!files.length) return;

    try {
        const allRows = [];
        for (const file of files) {
            const text = await file.text();
            const parsed = parseRoninCsvText(text);
            const required = ['Txhash', 'Blockno', 'UnixTimestamp', 'Token / Collectibles', 'Value in', 'Value out'];
            const missing = required.filter(header => !parsed.headers.includes(header));
            if (missing.length) {
                throw new Error(`${file.name || 'CSV'} is missing Ronin columns: ${missing.join(', ')}`);
            }
            allRows.push(...parsed.rows);
        }
        if (!allRows.length) throw new Error('No Ronin CSV rows found.');

        const settings = getRoninReconcileSettingsSafe();
        const walletInput = document.getElementById('ronin-wallet-address');
        const account = inferRoninCsvAccount(allRows, walletInput?.value || settings.walletAddress || '');
        if (!isValidRoninAddress(account)) throw new Error('Could not infer a Ronin wallet address from the CSV files.');

        const built = buildRoninCsvActivityRows(allRows, account, settings);
        const nextMappings = {
            ...(settings.assetMappings || {}),
            ...built.discoveredMappings
        };
        await persistRoninReconcileSettings({
            walletAddress: formatRoninAddress(account),
            assetMappings: nextMappings,
            lastRefreshAt: Date.now(),
            lastBlockNumber: built.summary.lastBlock || settings.lastBlockNumber || 0
        });
        const nextSettings = getRoninReconcileSettingsSafe();
        roninReconcileState = {
            ...roninReconcileState,
            account,
            rows: hydrateRoninRowsWithMappings(built.rows, nextSettings),
            loading: false,
            error: '',
            sourceMode: 'csv',
            csvSummary: {
                ...built.summary,
                files: files.map(file => file.name || 'CSV')
            },
            fetchedAt: Date.now(),
            fromBlock: built.summary.firstBlock || 0,
            latestBlock: built.summary.lastBlock || 0
        };
        roninReconcileState.stakingSummary = buildRoninStakingSummary(roninReconcileState.rows);
        await renderRoninReconcilePanel();
        if (typeof showToast === 'function') {
            showToast(`Loaded ${built.summary.hashes} Ronin CSV transaction${built.summary.hashes === 1 ? '' : 's'} for review`);
        }
    } catch (error) {
        console.error('Ronin CSV import failed.', error);
        roninReconcileState = {
            ...roninReconcileState,
            loading: false,
            error: error?.message || 'Could not import Ronin CSV files.'
        };
        await renderRoninReconcilePanel();
        if (typeof showToast === 'function') showToast(roninReconcileState.error);
    }
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
    if (row?.category === 'stake' && negative.length && !positive.length) {
        options.push({ value: 'stake', label: 'Stake / delegate' });
        options.push({ value: 'transfer_out', label: 'Transfer out' });
        return options;
    }
    if (row?.category === 'unstake' && positive.length && !negative.length) {
        options.push({ value: 'unstake', label: 'Unstake / undelegate' });
        options.push({ value: 'transfer_in', label: 'Transfer in' });
        return options;
    }
    if (row?.category === 'reward' && positive.length && !negative.length) {
        options.push({ value: 'staking_reward', label: 'Staking reward' });
        options.push({ value: 'airdrop', label: 'Airdrop / reward' });
        options.push({ value: 'transfer_in', label: 'Transfer in' });
        return options;
    }
    if (row?.category === 'stake-fee') {
        if (row?.feeRon > 0) options.push({ value: 'staking_fee', label: 'Staking fee only' });
        return options;
    }
    if (row?.category === 'restake') {
        options.push({ value: 'restake', label: 'Restake reward' });
        if (row?.feeRon > 0) options.push({ value: 'staking_fee', label: 'Staking fee only' });
        return options;
    }
    if (positive.length === 1 && negative.length === 1) options.push({ value: 'swap', label: 'Swap + fee' });
    if (positive.length && !negative.length) {
        options.push({ value: 'transfer_in', label: 'Transfer in' });
        options.push({ value: 'buy', label: 'Buy' });
        options.push({ value: 'airdrop', label: 'Airdrop / reward' });
    }
    if (negative.length && !positive.length) options.push({ value: 'transfer_out', label: 'Transfer out' });
    if (!positive.length && !negative.length && row?.feeRon > 0) options.push({ value: 'network_fee', label: 'Network fee only' });
    return options;
}

function getRoninImportOptionLabel(value) {
    const labels = {
        swap: 'Swap + fee',
        transfer_in: 'Transfer in',
        transfer_out: 'Transfer out',
        stake: 'Stake / delegate',
        unstake: 'Unstake / undelegate',
        staking_reward: 'Staking reward',
        staking_fee: 'Staking fee',
        restake: 'Restake reward',
        buy: 'Buy',
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
    if (value === 'buy') return 'Creates a normal buy entry with editable cost basis and the Ronin hash attached for audit/deduping.';
    if (value === 'transfer_out') return 'Creates transfer_out entries that reduce token balance without recording a sale or realized P/L.';
    if (value === 'stake') return 'Creates balance-only staking outflow entries, separate from normal transfers or sales. The network fee is recorded separately.';
    if (value === 'unstake') return 'Creates balance-only unstake inflow entries, separate from buys. The network fee is recorded separately.';
    if (value === 'staking_reward') return 'Creates zero-cost staking reward entries. You can later decide whether to track taxable income separately.';
    if (value === 'staking_fee') return 'Creates only the RON network fee for delegation/redelegation/staking maintenance.';
    if (value === 'restake') return 'Records the reward movement as a balance-only staking flow plus the RON fee.';
    if (value === 'airdrop') return 'Creates zero-cost airdrop/reward entries.';
    if (value === 'network_fee') return 'Creates a RON network_fee entry only. Use this for approvals, failed calls, staking maintenance, and other fee-only activity.';
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
        strategy: row.sourceMode === 'csv' ? 'csv-import' : 'ledger-import',
        date: row.date || new Date().toISOString(),
        source: row.sourceMode === 'csv' ? 'ronin_csv_import' : 'ronin_ledger_import',
        nonTaxAdjustment: type !== 'swap_in' && type !== 'swap_out',
        ronin: {
            hash: row.hash,
            blockNumber: row.blockNumber,
            account: roninReconcileState.account,
            category: row.category,
            contract: delta.contract || '',
            importClassification: extra.importClassification || type,
            feeRon: row.feeRon || 0,
            sourceMode: row.sourceMode || 'rpc',
            method: row.method || ''
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

function getRoninBuyReviewValues(row) {
    const positive = (row?.deltas || []).filter(delta => delta.value > 0.00000001);
    const amount = Math.max(0, Number(positive[0]?.value || 0));
    const priceEl = document.getElementById('ronin-buy-price');
    const totalEl = document.getElementById('ronin-buy-total');
    const rawPriceText = String(priceEl?.value || '').trim();
    const rawTotalText = String(totalEl?.value || '').trim();
    const rawPrice = Number(rawPriceText || 0);
    const rawTotal = Number(rawTotalText || 0);
    const currency = ['PHP', 'USD', 'JPY'].includes(String(document.getElementById('ronin-buy-currency')?.value || '').trim().toUpperCase())
        ? String(document.getElementById('ronin-buy-currency').value).trim().toUpperCase()
        : 'PHP';
    const totalEntered = Number.isFinite(rawTotal) && rawTotal > 0;
    const priceEntered = Number.isFinite(rawPrice) && rawPrice > 0;
    const originalTotal = totalEntered ? rawTotal : (priceEntered ? amount * rawPrice : 0);
    const effectivePrice = amount > 0 && originalTotal > 0
        ? originalTotal / amount
        : (priceEntered ? rawPrice : 0);
    const phpTotal = originalTotal > 0 ? convertToDisplayCurrency(originalTotal, currency, 'PHP') : 0;
    const phpPrice = effectivePrice > 0 ? convertToDisplayCurrency(effectivePrice, currency, 'PHP') : 0;
    return {
        amount,
        price: effectivePrice,
        currency,
        originalTotal,
        phpPrice,
        phpTotal,
        priceEntered,
        totalEntered
    };
}

function buildRoninImportPayloads(row, classification, notes, options = {}) {
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
    } else if (classification === 'stake') {
        negative.forEach(delta => payloads.push(buildRoninBasePayload(row, delta, 'stake_out', Math.abs(delta.value), notes, {
            importClassification: 'stake',
            fields: { nonTaxAdjustment: true, stakingAction: 'delegate' }
        })));
    } else if (classification === 'unstake') {
        positive.forEach(delta => payloads.push(buildRoninBasePayload(row, delta, 'stake_in', Math.abs(delta.value), notes, {
            importClassification: 'unstake',
            fields: { nonTaxAdjustment: true, stakingAction: 'undelegate' }
        })));
    } else if (classification === 'staking_reward') {
        positive.forEach(delta => payloads.push(buildRoninBasePayload(row, delta, 'staking_reward', Math.abs(delta.value), notes, {
            importClassification: 'staking_reward',
            fields: { stakingAction: 'reward' }
        })));
    } else if (classification === 'restake') {
        positive.forEach(delta => payloads.push(buildRoninBasePayload(row, delta, 'staking_reward', Math.abs(delta.value), notes, {
            importClassification: 'restake',
            fields: { nonTaxAdjustment: true, stakingAction: 'restake_reward' }
        })));
        negative.forEach(delta => payloads.push(buildRoninBasePayload(row, delta, 'stake_out', Math.abs(delta.value), notes, {
            importClassification: 'restake',
            fields: { nonTaxAdjustment: true, stakingAction: 'restake_out' }
        })));
    } else if (classification === 'buy') {
        if (positive.length !== 1 || negative.length) throw new Error('Buy import needs one incoming token and no outgoing token.');
        const buyValues = options.buy || {};
        if (!(Number(buyValues.price) > 0) && !(Number(buyValues.originalTotal) > 0)) {
            throw new Error('Enter a buy price or total before importing as a buy.');
        }
        const phpPrice = Number(buyValues.phpPrice || 0);
        const phpTotal = Number(buyValues.phpTotal || 0);
        if (!(phpPrice > 0) || !(phpTotal > 0)) {
            throw new Error('Could not calculate PHP cost basis for this buy.');
        }
        payloads.push(buildRoninBasePayload(row, positive[0], 'buy', Math.abs(positive[0].value), notes, {
            importClassification: 'buy',
            fields: {
                price: Number(buyValues.price || 0),
                currency: String(buyValues.currency || 'PHP').trim().toUpperCase(),
                phpPrice,
                phpTotal,
                total: phpTotal,
                nonTaxAdjustment: false
            }
        }));
    } else if (classification === 'transfer_out') {
        negative.forEach(delta => payloads.push(buildRoninBasePayload(row, delta, 'transfer_out', Math.abs(delta.value), notes, {
            importClassification: 'transfer_out'
        })));
    } else if (classification === 'network_fee') {
        if (!(row.feeRon > 0)) throw new Error('This Ronin row has no network fee to import.');
    } else if (classification === 'staking_fee') {
        if (!(row.feeRon > 0)) throw new Error('This Ronin staking row has no network fee to import.');
    } else {
        throw new Error('Choose a supported Ronin import type.');
    }

    if (row.feeRon > 0) payloads.push(buildRoninFeePayload(row, notes, classification));
    return payloads;
}

function getRoninBulkDefaultClassification(row) {
    if (!row || row.result !== 'success') return '';
    if ((row.deltas || []).some(delta => Math.abs(delta.value) > 0.00000001 && !delta.tokenId)) return '';
    if (row.category === 'receive') return '';
    const options = getRoninImportOptions(row);
    if (!options.length) return '';
    const value = options[0].value;
    if (value === 'buy' || value === 'transfer_in' || value === 'airdrop') return '';
    return value;
}

function buildRoninBulkImportPlan(importedHashes = new Set()) {
    const groups = [];
    const skipped = {
        imported: 0,
        ambiguous: 0,
        unmapped: 0,
        failed: 0,
        notImportable: 0
    };

    (roninReconcileState.rows || []).forEach(row => {
        if (!row?.hash) return;
        if (importedHashes.has(row.hash)) {
            skipped.imported += 1;
            return;
        }
        if (row.result !== 'success') {
            skipped.failed += 1;
            return;
        }
        if ((row.deltas || []).some(delta => Math.abs(delta.value) > 0.00000001 && !delta.tokenId)) {
            skipped.unmapped += 1;
            return;
        }
        const classification = getRoninBulkDefaultClassification(row);
        if (!classification) {
            if (row.category === 'receive') skipped.ambiguous += 1;
            else skipped.notImportable += 1;
            return;
        }
        const label = getRoninImportOptionLabel(classification);
        const notes = `${label} bulk imported from Ronin transaction ${shortRoninText(row.hash, 10, 8)}.`;
        try {
            const payloads = buildRoninImportPayloads(row, classification, notes);
            if (payloads.length) groups.push({ row, classification, payloads });
            else skipped.notImportable += 1;
        } catch (error) {
            console.warn('Ronin bulk plan skipped row:', row.hash, error);
            skipped.notImportable += 1;
        }
    });

    const counts = groups.reduce((acc, group) => {
        acc[group.classification] = (acc[group.classification] || 0) + 1;
        return acc;
    }, {});
    const payloadCount = groups.reduce((sum, group) => sum + group.payloads.length, 0);
    return { groups, counts, payloadCount, skipped };
}

async function persistRoninImportPayloadGroups(groups = []) {
    if (!groups.length) throw new Error('No Ronin rows are ready to import.');

    const db = await getDB();
    db.crypto = Array.isArray(db.crypto) ? db.crypto : [];
    const now = Date.now();
    let created = 0;
    for (const group of groups) {
        const row = group.row || {};
        for (let index = 0; index < (group.payloads || []).length; index += 1) {
            const payload = group.payloads[index];
            db.crypto.push({
                id: `ronin_import_${String(row.hash || now).slice(0, 12)}_${index}_${Math.random().toString(36).slice(2, 7)}`,
                data: await encryptData(payload),
                createdAt: now + created,
                lastModified: now + created,
                deletedAt: null
            });
            created += 1;
        }
    }
    if (typeof syncCryptoBuyExpensesInDB === 'function' && groups.some(group => (group.payloads || []).some(payload => payload.type === 'buy'))) {
        await syncCryptoBuyExpensesInDB(db);
    }
    const saved = await saveDB(db);
    rawCrypto = (saved.crypto || []).filter(c => !c.deletedAt);
    if (typeof invalidateCryptoComputationCache === 'function') invalidateCryptoComputationCache();
    return { saved, created };
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
    const buyFieldsEl = document.getElementById('ronin-buy-fields');
    const buyPreviewEl = document.getElementById('ronin-buy-total-preview');
    const buyValues = classification === 'buy' ? getRoninBuyReviewValues(row) : null;
    if (buyFieldsEl) buyFieldsEl.classList.toggle('hidden', classification !== 'buy');
    if (buyPreviewEl) {
        buyPreviewEl.innerText = buyValues
            ? `Cost basis preview: ${formatCurrency(buyValues.originalTotal || 0, buyValues.currency)} total for ${roninNumberToText(buyValues.amount || 0)} token${buyValues.amount === 1 ? '' : 's'} = ${formatCurrency(buyValues.price || 0, buyValues.currency)}/token${buyValues.currency !== 'PHP' ? ` (≈ ${formatCurrency(buyValues.phpTotal || 0, 'PHP')} total)` : ''}.`
            : '';
    }
    try {
        payloads = buildRoninImportPayloads(row, classification, notes, { buy: buyValues });
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
                const positive = ['swap_in', 'transfer_in', 'airdrop', 'buy'].includes(payload.type);
                const displayType = payload.ronin?.importClassification || payload.type;
                return `
                    <div class="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 flex items-start justify-between gap-3">
                        <div>
                            <p class="text-sm font-bold text-slate-200">${escapeHTML(getRoninImportOptionLabel(displayType))}</p>
                            <p class="text-[11px] text-slate-500 mt-1">${escapeHTML(payload.tokenId)} - ${escapeHTML(payload.symbol)}${payload.type === 'buy' ? ` - ${escapeHTML(formatCurrency(payload.price || 0, payload.currency || 'PHP'))}/token` : ''}</p>
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
    const buyPriceEl = document.getElementById('ronin-buy-price');
    const buyTotalEl = document.getElementById('ronin-buy-total');
    const buyCurrencyEl = document.getElementById('ronin-buy-currency');
    if (buyPriceEl) buyPriceEl.value = '';
    if (buyTotalEl) buyTotalEl.value = '';
    if (buyCurrencyEl) buyCurrencyEl.value = 'PHP';
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
        const payloads = buildRoninImportPayloads(row, classification, notes, {
            buy: classification === 'buy' ? getRoninBuyReviewValues(row) : null
        });
        if (!payloads.length) throw new Error('No app entries would be created.');

        await persistRoninImportPayloadGroups([{ row, classification, payloads }]);
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

async function bulkImportRoninSafeDefaults() {
    try {
        const imported = await getRoninImportedHashSet();
        const plan = buildRoninBulkImportPlan(imported);
        if (!plan.groups.length) {
            if (typeof showToast === 'function') showToast('No safe Ronin defaults are ready for bulk import');
            return;
        }
        const countText = Object.entries(plan.counts)
            .map(([type, count]) => `${count} ${getRoninImportOptionLabel(type)}`)
            .join(', ');
        const skippedBits = [];
        if (plan.skipped.ambiguous) skippedBits.push(`${plan.skipped.ambiguous} ambiguous incoming row(s) skipped`);
        if (plan.skipped.unmapped) skippedBits.push(`${plan.skipped.unmapped} unmapped row(s) skipped`);
        if (plan.skipped.imported) skippedBits.push(`${plan.skipped.imported} already imported row(s) skipped`);
        const ok = typeof window === 'undefined' || window.confirm(
            `Import ${plan.groups.length} Ronin activity row(s) as safe defaults?\n\n${countText || 'Safe defaults'}\n${skippedBits.length ? `\n${skippedBits.join('\\n')}` : ''}\n\nThis will not import ambiguous incoming rows that might be buys.`
        );
        if (!ok) return;

        const result = await persistRoninImportPayloadGroups(plan.groups);
        if (typeof showToast === 'function') {
            showToast(`Bulk imported ${result.created} Ronin app entr${result.created === 1 ? 'y' : 'ies'}`);
        }
        if (typeof loadFromStorage === 'function') {
            await loadFromStorage();
            if (typeof renderCryptoPortfolio === 'function' && !document.getElementById('crypto-portfolio-modal')?.classList.contains('hidden')) {
                await renderCryptoPortfolio();
            }
        } else if (typeof renderCryptoPortfolio === 'function') {
            await renderCryptoPortfolio();
        }
    } catch (error) {
        console.error('Ronin bulk import failed.', error);
        const message = error?.message || 'Could not bulk import Ronin activity.';
        if (typeof showToast === 'function') showToast(message);
        else alert(message);
    }
}

async function renderRoninActivityList() {
    const list = document.getElementById('ronin-activity-list');
    const countEl = document.getElementById('ronin-activity-count');
    const bulkBtn = document.getElementById('ronin-bulk-import-btn');
    if (!list) return;
    if (countEl) countEl.innerText = `${roninReconcileState.rows.length} row${roninReconcileState.rows.length === 1 ? '' : 's'}`;
    if (!roninReconcileState.rows.length) {
        if (bulkBtn) bulkBtn.classList.add('hidden');
        list.innerHTML = roninReconcileState.sourceMode === 'csv'
            ? '<div class="text-sm text-slate-500 py-6 text-center">No importable Ronin CSV activity loaded yet.</div>'
            : (roninReconcileState.account
            ? '<div class="text-sm text-slate-500 py-6 text-center">No tracked ERC-20 transfer activity found in this block window.</div>'
            : '<div class="text-sm text-slate-500 py-6 text-center">No Ronin activity loaded yet.</div>');
        return;
    }
    const imported = await getRoninImportedHashSet();
    const bulkPlan = buildRoninBulkImportPlan(imported);
    if (bulkBtn) {
        bulkBtn.classList.toggle('hidden', !bulkPlan.groups.length);
        bulkBtn.innerText = bulkPlan.groups.length
            ? `Import ${bulkPlan.groups.length} Safe Default${bulkPlan.groups.length === 1 ? '' : 's'}`
            : 'Import Safe Defaults';
    }
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
    renderRoninCsvSummary();
    renderRoninCsvTokenMappings(settings);
    renderRoninStakingSummary();
    if (roninReconcileState.loading) {
        setRoninStatus('Fetching Ronin balances and ERC-20 Transfer logs. This will not change saved crypto entries.');
    } else if (roninReconcileState.error) {
        setRoninStatus(roninReconcileState.error, 'error');
    } else if (roninReconcileState.sourceMode === 'csv' && roninReconcileState.account) {
        const summary = roninReconcileState.csvSummary || {};
        setRoninStatus(`Loaded ${roninReconcileState.rows.length} Ronin CSV activity row${roninReconcileState.rows.length === 1 ? '' : 's'} for ${formatRoninAddress(roninReconcileState.account)}. ${summary.duplicateRows ? `${summary.duplicateRows} duplicate CSV row${summary.duplicateRows === 1 ? '' : 's'} ignored.` : 'Ready for review imports.'}`, 'success');
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

    roninReconcileState = { ...roninReconcileState, account, endpoint, loading: true, error: '', sourceMode: 'rpc', csvSummary: null };
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
            fromBlock,
            sourceMode: 'rpc',
            csvSummary: null,
            stakingSummary: null
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
