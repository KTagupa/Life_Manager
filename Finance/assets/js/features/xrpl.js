// =============================================
// XRPL READ-ONLY RECONCILIATION MODULE
// =============================================

const XRPL_RECONCILE_ENDPOINTS = [
    { value: 'https://xrplcluster.com/', label: 'xrplcluster.com' },
    { value: 'https://xrpl.ws/', label: 'xrpl.ws' },
    { value: 'https://s2.ripple.com:51234/', label: 's2.ripple.com' },
    { value: 'https://s1.ripple.com:51234/', label: 's1.ripple.com' }
];
const XRPL_RECONCILE_DEFAULT_ENDPOINT = 'https://xrplcluster.com/';
const XRPL_RECONCILE_PAGE_LIMIT = 25;
const XRPL_RECONCILE_MAX_TRUST_LINES = 1000;
const XRPL_NATIVE_ASSET_KEY = 'native:XRP';
const XRPL_RIPPLE_EPOCH_OFFSET_SECONDS = 946684800;

let xrplReconcileState = {
    account: '',
    endpoint: XRPL_RECONCILE_DEFAULT_ENDPOINT,
    balances: [],
    balanceMap: new Map(),
    rows: [],
    marker: null,
    loading: false,
    error: '',
    fetchedAt: 0,
    ledgerIndexMax: 0
};
let xrplPendingAdjustment = null;
let xrplPendingImport = null;

function getXrplEndpointValues() {
    return XRPL_RECONCILE_ENDPOINTS.map(endpoint => endpoint.value);
}

function normalizeXrplEndpoint(endpoint) {
    const raw = String(endpoint || '').trim();
    const withSlash = raw && !raw.endsWith('/') ? `${raw}/` : raw;
    return getXrplEndpointValues().includes(withSlash) ? withSlash : XRPL_RECONCILE_DEFAULT_ENDPOINT;
}

function getXrplFallbackSettings() {
    return {
        walletAddress: '',
        endpoint: XRPL_RECONCILE_DEFAULT_ENDPOINT,
        assetMappings: {
            [XRPL_NATIVE_ASSET_KEY]: {
                tokenId: 'ripple',
                symbol: 'XRP',
                label: 'XRP'
            }
        },
        lastRefreshAt: 0,
        lastLedgerIndex: 0,
        lastModified: 0
    };
}

function getXrplReconcileSettingsSafe() {
    const normalize = typeof normalizeXrplReconcileSettingsShape === 'function'
        ? normalizeXrplReconcileSettingsShape
        : (value => ({ ...getXrplFallbackSettings(), ...(value || {}) }));
    const settings = normalize(typeof xrplReconcileSettings !== 'undefined' ? xrplReconcileSettings : {});
    return {
        ...settings,
        endpoint: normalizeXrplEndpoint(settings.endpoint),
        assetMappings: {
            ...getXrplFallbackSettings().assetMappings,
            ...(settings.assetMappings || {})
        }
    };
}

function shortXrplText(value, start = 6, end = 4) {
    const text = String(value || '').trim();
    if (text.length <= start + end + 3) return text;
    return `${text.slice(0, start)}...${text.slice(-end)}`;
}

function toXrplFiniteNumber(value, fallback = 0) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
}

function dropsToXrp(drops) {
    return toXrplFiniteNumber(drops, 0) / 1000000;
}

function formatXrplAmount(value, digits = 8) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return '--';
    const abs = Math.abs(numeric);
    const maxDigits = abs >= 1000 ? 4 : digits;
    return numeric.toLocaleString('en-US', {
        minimumFractionDigits: 0,
        maximumFractionDigits: maxDigits
    });
}

function formatXrplSignedAmount(value, symbol) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return `-- ${symbol || ''}`.trim();
    const prefix = numeric > 0 ? '+' : '';
    return `${prefix}${formatXrplAmount(numeric)} ${String(symbol || '').toUpperCase()}`.trim();
}

function decodeXrplCurrencyCode(currency) {
    const raw = String(currency || '').trim();
    if (/^[A-F0-9]{40}$/i.test(raw) && !/^0{40}$/.test(raw)) {
        let decoded = '';
        for (let index = 0; index < raw.length; index += 2) {
            const code = parseInt(raw.slice(index, index + 2), 16);
            if (code === 0) continue;
            decoded += String.fromCharCode(code);
        }
        if (/^[\x20-\x7E]+$/.test(decoded) && decoded.trim()) {
            return decoded.trim();
        }
    }
    return raw || 'TOKEN';
}

function buildXrplAssetKey(currency, issuer) {
    const normalizedCurrency = decodeXrplCurrencyCode(currency).toUpperCase();
    if (normalizedCurrency === 'XRP') return XRPL_NATIVE_ASSET_KEY;
    return `trustline:${normalizedCurrency}:${String(issuer || '').trim()}`;
}

function buildXrplAssetLabel(currency, issuer) {
    const symbol = decodeXrplCurrencyCode(currency).toUpperCase();
    if (symbol === 'XRP') return 'XRP';
    const issuerText = issuer ? ` (${shortXrplText(issuer)})` : '';
    return `${symbol}${issuerText}`;
}

function buildXrplNativeAsset(balance = 0) {
    return {
        key: XRPL_NATIVE_ASSET_KEY,
        currency: 'XRP',
        symbol: 'XRP',
        issuer: '',
        label: 'XRP',
        balance: toXrplFiniteNumber(balance, 0),
        native: true
    };
}

function buildXrplTrustLineAsset(line) {
    const currency = decodeXrplCurrencyCode(line?.currency || '').toUpperCase();
    const issuer = String(line?.account || line?.issuer || '').trim();
    return {
        key: buildXrplAssetKey(currency, issuer),
        currency,
        symbol: currency,
        issuer,
        label: buildXrplAssetLabel(currency, issuer),
        balance: toXrplFiniteNumber(line?.balance, 0),
        native: false
    };
}

function buildXrplDeltaAsset(change) {
    const currency = decodeXrplCurrencyCode(change?.currency || '').toUpperCase();
    const issuer = String(change?.issuer || '').trim();
    const native = currency === 'XRP';
    return {
        key: buildXrplAssetKey(currency, issuer),
        currency,
        symbol: currency,
        issuer: native ? '' : issuer,
        label: buildXrplAssetLabel(currency, native ? '' : issuer),
        value: toXrplFiniteNumber(change?.value, 0),
        native
    };
}

function sortXrplAssets(a, b) {
    if (a.key === XRPL_NATIVE_ASSET_KEY) return -1;
    if (b.key === XRPL_NATIVE_ASSET_KEY) return 1;
    return String(a.symbol || a.currency || '').localeCompare(String(b.symbol || b.currency || '')) ||
        String(a.issuer || '').localeCompare(String(b.issuer || ''));
}

function setXrplStatus(message, tone = 'neutral') {
    const statusEl = document.getElementById('xrpl-status');
    if (!statusEl) return;
    const toneClass = tone === 'error'
        ? 'border-rose-900/70 bg-rose-950/40 text-rose-200'
        : (tone === 'success'
            ? 'border-emerald-900/70 bg-emerald-950/30 text-emerald-200'
            : 'border-slate-800 bg-slate-950/70 text-slate-400');
    statusEl.className = `rounded-2xl border px-4 py-3 text-xs ${toneClass}`;
    statusEl.innerText = message;
}

function setXrplRefreshButtonLoading(isLoading) {
    const button = document.getElementById('xrpl-refresh-btn');
    if (!button) return;
    button.disabled = !!isLoading;
    button.classList.toggle('opacity-60', !!isLoading);
    button.classList.toggle('cursor-wait', !!isLoading);
    button.innerText = isLoading ? 'Fetching...' : 'Fetch Ledger';
}

async function persistXrplReconcileSettings(partial = {}) {
    const current = getXrplReconcileSettingsSafe();
    const nextAssetMappings = {
        ...(current.assetMappings || {}),
        ...(partial.assetMappings || {})
    };
    const nextSettings = {
        ...current,
        ...partial,
        endpoint: normalizeXrplEndpoint(partial.endpoint || current.endpoint),
        assetMappings: nextAssetMappings,
        lastModified: Date.now()
    };

    xrplReconcileSettings = typeof normalizeXrplReconcileSettingsShape === 'function'
        ? normalizeXrplReconcileSettingsShape(nextSettings)
        : nextSettings;

    try {
        const db = await getDB();
        db.xrpl_reconcile = xrplReconcileSettings;
        const saved = await saveDB(db);
        xrplReconcileSettings = saved.xrpl_reconcile || xrplReconcileSettings;
    } catch (error) {
        console.error('Failed to persist XRPL reconcile settings.', error);
    }

    return xrplReconcileSettings;
}

function isValidXrplClassicAddress(address) {
    const value = String(address || '').trim();
    if (window.xrpl && typeof window.xrpl.isValidClassicAddress === 'function') {
        return window.xrpl.isValidClassicAddress(value);
    }
    if (window.xrpl && typeof window.xrpl.isValidAddress === 'function') {
        return window.xrpl.isValidAddress(value) && value.startsWith('r');
    }
    return /^r[1-9A-HJ-NP-Za-km-z]{25,34}$/.test(value);
}

async function xrplRpc(endpoint, command, params = {}) {
    const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            method: command,
            params: [{
                ...params,
                api_version: 2
            }]
        })
    });

    if (!response.ok) {
        throw new Error(`XRPL endpoint returned HTTP ${response.status}`);
    }

    const payload = await response.json();
    const result = payload?.result;
    if (payload?.error || result?.status === 'error' || result?.error) {
        throw new Error(result?.error_message || result?.error || payload?.error_message || payload?.error || 'XRPL request failed');
    }
    return result;
}

async function fetchXrplAccountLines(account, endpoint) {
    const lines = [];
    let marker = null;

    do {
        const result = await xrplRpc(endpoint, 'account_lines', {
            account,
            ledger_index: 'validated',
            limit: 400,
            marker: marker || undefined
        });
        if (Array.isArray(result?.lines)) lines.push(...result.lines);
        marker = result?.marker || null;
    } while (marker && lines.length < XRPL_RECONCILE_MAX_TRUST_LINES);

    return lines;
}

async function fetchXrplCurrentBalances(account, endpoint) {
    const [info, lines] = await Promise.all([
        xrplRpc(endpoint, 'account_info', {
            account,
            ledger_index: 'validated',
            queue: false
        }),
        fetchXrplAccountLines(account, endpoint)
    ]);

    const xrpBalance = dropsToXrp(info?.account_data?.Balance || 0);
    const balances = [buildXrplNativeAsset(xrpBalance)];

    lines.forEach(line => {
        const asset = buildXrplTrustLineAsset(line);
        if (!asset.key || Math.abs(asset.balance) <= 0.000000000001) return;
        balances.push(asset);
    });

    return {
        balances: balances.sort(sortXrplAssets),
        ledgerIndex: Math.max(0, Number(info?.ledger_current_index || info?.ledger_index || 0) || 0)
    };
}

async function fetchXrplTransactions(account, endpoint, marker = null) {
    return xrplRpc(endpoint, 'account_tx', {
        account,
        ledger_index_min: -1,
        ledger_index_max: -1,
        binary: false,
        forward: false,
        limit: XRPL_RECONCILE_PAGE_LIMIT,
        marker: marker || undefined
    });
}

function getXrplRowTx(row) {
    return row?.tx_json || row?.tx || row?.transaction || {};
}

function getXrplRowMeta(row) {
    return row?.meta || row?.metaData || row?.meta_data || {};
}

function getXrplRowDate(row, tx) {
    if (row?.close_time_iso) return row.close_time_iso;
    const rippleDate = Number(tx?.date || row?.date || 0);
    if (Number.isFinite(rippleDate) && rippleDate > 0) {
        return new Date((rippleDate + XRPL_RIPPLE_EPOCH_OFFSET_SECONDS) * 1000).toISOString();
    }
    return '';
}

function getXrplBalanceChangesForAccount(meta, account) {
    if (!window.xrpl || typeof window.xrpl.getBalanceChanges !== 'function') {
        throw new Error('XRPL parser library is unavailable. Check the xrpl.js CDN script and network access.');
    }

    const changes = window.xrpl.getBalanceChanges(meta);
    const accountRow = (changes || []).find(change => String(change?.account || '').trim() === account);
    return Array.isArray(accountRow?.balances) ? accountRow.balances : [];
}

function classifyXrplTransaction(txType, result, tradeDeltas, feeXrp) {
    if (result && result !== 'tesSUCCESS') return 'failed';

    const meaningful = (tradeDeltas || []).filter(delta => Math.abs(delta.tradeValue) > 0.000000000001);
    if (txType === 'TrustSet' && meaningful.length === 0) return 'trustline';
    if (meaningful.length === 0 && feeXrp > 0) return 'fee';

    const hasPositive = meaningful.some(delta => delta.tradeValue > 0);
    const hasNegative = meaningful.some(delta => delta.tradeValue < 0);
    if (hasPositive && hasNegative) return 'swap';
    if (hasPositive) return 'receive';
    if (hasNegative) return 'send';
    return 'unknown';
}

function getXrplCategoryLabel(category) {
    const labels = {
        swap: 'Swap / Trade',
        receive: 'Receive',
        send: 'Send',
        trustline: 'Trust Line',
        fee: 'Fee Only',
        failed: 'Not Successful',
        unknown: 'Unknown'
    };
    return labels[category] || labels.unknown;
}

function getXrplCategoryClass(category) {
    const classes = {
        swap: 'bg-blue-500/10 text-blue-200 border-blue-500/30',
        receive: 'bg-emerald-500/10 text-emerald-200 border-emerald-500/30',
        send: 'bg-rose-500/10 text-rose-200 border-rose-500/30',
        trustline: 'bg-amber-500/10 text-amber-200 border-amber-500/30',
        fee: 'bg-slate-700/50 text-slate-300 border-slate-600',
        failed: 'bg-orange-500/10 text-orange-200 border-orange-500/30',
        unknown: 'bg-slate-700/50 text-slate-300 border-slate-600'
    };
    return classes[category] || classes.unknown;
}

function buildXrplTransactionExplanation(parsed) {
    const feeText = parsed.feeXrp > 0 ? `${formatXrplAmount(parsed.feeXrp, 8)} XRP network fee destroyed` : '';
    const negative = parsed.tradeDeltas.filter(delta => delta.tradeValue < -0.000000000001);
    const positive = parsed.tradeDeltas.filter(delta => delta.tradeValue > 0.000000000001);
    const negText = negative.map(delta => `${formatXrplAmount(Math.abs(delta.tradeValue))} ${delta.symbol}`).join(', ');
    const posText = positive.map(delta => `${formatXrplAmount(delta.tradeValue)} ${delta.symbol}`).join(', ');

    if (parsed.category === 'failed') {
        return feeText
            ? `Transaction result ${parsed.result}; ${feeText}.`
            : `Transaction result ${parsed.result}; no wallet token movement found.`;
    }
    if (parsed.category === 'swap') {
        return `${negText || 'Assets'} swapped to ${posText || 'assets'}${feeText ? `; ${feeText}.` : '.'}`;
    }
    if (parsed.category === 'receive') {
        return `Received ${posText || 'assets'}${feeText ? `; ${feeText}.` : '.'}`;
    }
    if (parsed.category === 'send') {
        return `Sent ${negText || 'assets'}${feeText ? `; ${feeText}.` : '.'}`;
    }
    if (parsed.category === 'trustline') {
        return feeText ? `Trust-line or account setup activity; ${feeText}.` : 'Trust-line or account setup activity.';
    }
    if (parsed.category === 'fee') {
        return feeText || 'Fee-only ledger activity.';
    }
    return feeText ? `Ledger activity found; ${feeText}.` : 'Ledger activity found.';
}

function parseXrplTransactionRow(row, account) {
    const tx = getXrplRowTx(row);
    const meta = getXrplRowMeta(row);
    const result = String(meta?.TransactionResult || tx?.TransactionResult || '').trim();
    const txType = String(tx?.TransactionType || row?.TransactionType || 'Transaction').trim();
    const feeXrp = String(tx?.Account || '').trim() === account ? dropsToXrp(tx?.Fee || 0) : 0;
    const deltas = getXrplBalanceChangesForAccount(meta, account).map(change => buildXrplDeltaAsset(change));
    const tradeDeltas = deltas.map(delta => ({
        ...delta,
        netValue: delta.value,
        tradeValue: delta.native && feeXrp > 0 ? delta.value + feeXrp : delta.value
    }));
    const category = classifyXrplTransaction(txType, result, tradeDeltas, feeXrp);

    const parsed = {
        hash: String(row?.hash || tx?.hash || '').trim(),
        ledgerIndex: Number(row?.ledger_index || tx?.ledger_index || 0) || 0,
        date: getXrplRowDate(row, tx),
        txType,
        result: result || 'unknown',
        feeXrp,
        deltas,
        tradeDeltas,
        category,
        raw: row
    };
    parsed.explanation = buildXrplTransactionExplanation(parsed);
    return parsed;
}

function buildXrplBalanceMap(balances) {
    const map = new Map();
    (balances || []).forEach(balance => {
        if (!balance?.key) return;
        map.set(balance.key, balance);
    });
    return map;
}

function mergeXrplRows(existingRows, nextRows) {
    const map = new Map();
    [...(existingRows || []), ...(nextRows || [])].forEach(row => {
        const key = row.hash || `${row.ledgerIndex}:${row.txType}:${row.date}:${row.explanation}`;
        if (!key || map.has(key)) return;
        map.set(key, row);
    });
    return Array.from(map.values()).sort((a, b) => {
        const ledgerDiff = Number(b.ledgerIndex || 0) - Number(a.ledgerIndex || 0);
        if (ledgerDiff !== 0) return ledgerDiff;
        return String(b.hash || '').localeCompare(String(a.hash || ''));
    });
}

function summarizeXrplRows(rows) {
    const source = rows || [];
    return {
        txCount: source.length,
        successCount: source.filter(row => row.result === 'tesSUCCESS').length,
        failedCount: source.filter(row => row.result !== 'tesSUCCESS').length,
        totalFees: source.reduce((sum, row) => sum + Math.max(0, Number(row.feeXrp || 0)), 0),
        swaps: source.filter(row => row.category === 'swap').length,
        sends: source.filter(row => row.category === 'send').length,
        receives: source.filter(row => row.category === 'receive').length
    };
}

function renderXrplControls(settings) {
    const walletInput = document.getElementById('xrpl-wallet-address');
    const endpointSelect = document.getElementById('xrpl-endpoint');
    const loadOlderBtn = document.getElementById('xrpl-load-older-btn');

    if (walletInput && document.activeElement !== walletInput) {
        walletInput.value = settings.walletAddress || '';
    }
    if (endpointSelect && document.activeElement !== endpointSelect) {
        endpointSelect.value = normalizeXrplEndpoint(settings.endpoint);
    }
    if (loadOlderBtn) {
        loadOlderBtn.classList.toggle('hidden', !xrplReconcileState.marker || xrplReconcileState.loading);
    }
    setXrplRefreshButtonLoading(xrplReconcileState.loading);
}

function renderXrplSummary(settings = getXrplReconcileSettingsSafe()) {
    const summaryEl = document.getElementById('xrpl-summary');
    if (!summaryEl) return;
    const summary = summarizeXrplRows(xrplReconcileState.rows);
    const lastRefreshAt = xrplReconcileState.fetchedAt || Number(settings.lastRefreshAt || 0);
    const ledgerIndex = xrplReconcileState.ledgerIndexMax || Number(settings.lastLedgerIndex || 0);
    const fetchedText = lastRefreshAt
        ? new Date(lastRefreshAt).toLocaleString()
        : '--';
    summaryEl.innerHTML = `
        <div class="rounded-2xl border border-slate-800 bg-slate-950/60 p-3">
            <p class="text-[10px] font-bold uppercase text-slate-500">Loaded Transactions</p>
            <p class="text-sm font-bold text-slate-200 mt-1">${summary.txCount}</p>
            <p class="text-[10px] text-slate-500 mt-1">${summary.successCount} success${summary.failedCount ? `, ${summary.failedCount} other` : ''}</p>
        </div>
        <div class="rounded-2xl border border-slate-800 bg-slate-950/60 p-3">
            <p class="text-[10px] font-bold uppercase text-slate-500">Network Fees</p>
            <p class="text-sm font-bold text-amber-300 mt-1">${formatXrplAmount(summary.totalFees, 8)} XRP</p>
            <p class="text-[10px] text-slate-500 mt-1">Fees paid by this wallet in loaded rows</p>
        </div>
        <div class="rounded-2xl border border-slate-800 bg-slate-950/60 p-3">
            <p class="text-[10px] font-bold uppercase text-slate-500">Movement Types</p>
            <p class="text-sm font-bold text-blue-200 mt-1">${summary.swaps} swaps</p>
            <p class="text-[10px] text-slate-500 mt-1">${summary.receives} receives, ${summary.sends} sends</p>
        </div>
        <div class="rounded-2xl border border-slate-800 bg-slate-950/60 p-3">
            <p class="text-[10px] font-bold uppercase text-slate-500">Last Refresh</p>
            <p class="text-sm font-bold text-slate-200 mt-1">${escapeHTML(fetchedText)}</p>
            <p class="text-[10px] text-slate-500 mt-1">${ledgerIndex ? `Ledger ${ledgerIndex}` : 'Not refreshed yet'}</p>
        </div>
    `;
}

function getXrplMappedHoldingAmount(holdings, mapping) {
    const tokenId = String(mapping?.tokenId || '').trim();
    if (!tokenId) return null;
    if (!holdings || !holdings[tokenId]) return 0;
    return Number(holdings[tokenId]?.amount || 0);
}

function getXrplMappedHoldingSymbol(holdings, mapping, fallback = '') {
    const tokenId = String(mapping?.tokenId || '').trim();
    const holdingSymbol = tokenId && holdings?.[tokenId]?.symbol ? holdings[tokenId].symbol : '';
    return String(holdingSymbol || mapping?.symbol || fallback || tokenId || '').toUpperCase();
}

function getXrplComparisonThreshold(asset) {
    return asset?.native ? 0.000001 : 0.00000001;
}

function getXrplAdjustmentTypeOptions(asset, diff) {
    if (diff > 0) {
        return [{
            value: 'reconcile_in',
            label: 'Balance correction in',
            description: 'Adds the missing app balance as a zero-cost, non-tax reconciliation entry.'
        }];
    }

    const options = [];
    if (asset?.native) {
        options.push({
            value: 'network_fee',
            label: 'XRP network fee',
            description: 'Reduces XRP balance as ledger fee burn, with no sale/P&L event.'
        });
    }
    options.push({
        value: 'reconcile_out',
        label: 'Balance correction out',
        description: 'Reduces app balance and carried lot cost without recording a sale/P&L event.'
    });
    return options;
}

function getDefaultXrplAdjustmentType(asset, diff) {
    if (diff > 0) return 'reconcile_in';
    return asset?.native ? 'network_fee' : 'reconcile_out';
}

function getXrplAdjustmentTypeLabel(type) {
    const labels = {
        reconcile_in: 'Balance correction in',
        reconcile_out: 'Balance correction out',
        network_fee: 'XRP network fee'
    };
    return labels[type] || 'Balance correction';
}

function getXrplAdjustmentImpactText(type, symbol) {
    const safeSymbol = String(symbol || 'token').toUpperCase();
    if (type === 'reconcile_in') {
        return `This will add ${safeSymbol} to your app holdings at zero cost basis. It does not create a cash expense, buy, taxable sale, or realized P/L.`;
    }
    if (type === 'network_fee') {
        return `This will reduce ${safeSymbol} from your app holdings as an XRP Ledger network fee. It reduces carried lot cost but does not create a sell transaction or realized P/L.`;
    }
    return `This will reduce ${safeSymbol} from your app holdings as a non-tax reconciliation correction. It reduces carried lot cost but does not create a sell transaction or realized P/L.`;
}

async function getXrplCurrentHoldingsForComparison() {
    try {
        if (typeof cryptoPortfolioRenderContext !== 'undefined' && cryptoPortfolioRenderContext?.holdings) {
            return cryptoPortfolioRenderContext.holdings;
        }
        if (typeof calculateHoldings === 'function') {
            return await calculateHoldings(document.getElementById('cost-basis-method')?.value || 'fifo');
        }
    } catch (error) {
        console.warn('Could not calculate holdings for XRPL adjustment.', error);
    }
    return {};
}

async function buildXrplAdjustmentCandidate(assetKey) {
    const settings = getXrplReconcileSettingsSafe();
    const asset = buildXrplComparisonAssetList(settings).find(item => item.key === assetKey);
    const mapping = settings.assetMappings?.[assetKey] || {};
    const tokenId = String(mapping.tokenId || '').trim().toLowerCase();
    if (!asset || !tokenId) return null;

    const holdings = await getXrplCurrentHoldingsForComparison();
    const appAmount = getXrplMappedHoldingAmount(holdings, mapping);
    if (!Number.isFinite(appAmount)) return null;

    const diff = Number(asset.balance || 0) - Number(appAmount || 0);
    const amount = Math.abs(diff);
    if (amount <= getXrplComparisonThreshold(asset)) return null;

    const symbol = getXrplMappedHoldingSymbol(holdings, mapping, asset.symbol);
    return {
        asset,
        mapping,
        tokenId,
        symbol,
        appAmount,
        ledgerBalance: Number(asset.balance || 0),
        diff,
        amount,
        defaultType: getDefaultXrplAdjustmentType(asset, diff),
        typeOptions: getXrplAdjustmentTypeOptions(asset, diff)
    };
}

function closeXrplAdjustmentReview() {
    xrplPendingAdjustment = null;
    document.getElementById('xrpl-adjustment-modal')?.classList.add('hidden');
}

function renderXrplAdjustmentModalDetails() {
    if (!xrplPendingAdjustment) return;

    const typeSelect = document.getElementById('xrpl-adjustment-type');
    const selectedType = String(typeSelect?.value || xrplPendingAdjustment.defaultType || '').trim();
    if (selectedType) xrplPendingAdjustment.selectedType = selectedType;

    const type = xrplPendingAdjustment.selectedType || xrplPendingAdjustment.defaultType;
    const titleEl = document.getElementById('xrpl-adjustment-title');
    const subtitleEl = document.getElementById('xrpl-adjustment-subtitle');
    const summaryEl = document.getElementById('xrpl-adjustment-summary');
    const amountEl = document.getElementById('xrpl-adjustment-amount');
    const tokenEl = document.getElementById('xrpl-adjustment-token-id');
    const impactEl = document.getElementById('xrpl-adjustment-impact');
    const notesEl = document.getElementById('xrpl-adjustment-notes');

    const signedDiff = formatXrplSignedAmount(xrplPendingAdjustment.diff, xrplPendingAdjustment.symbol);
    const typeLabel = getXrplAdjustmentTypeLabel(type);

    if (titleEl) titleEl.innerText = type === 'network_fee' ? 'Record XRP Network Fee' : 'Resolve XRPL Difference';
    if (subtitleEl) subtitleEl.innerText = `${typeLabel} for ${xrplPendingAdjustment.symbol}. This is review-first and only saves after confirmation.`;
    if (summaryEl) {
        summaryEl.innerHTML = `
            <div class="rounded-2xl border border-slate-800 bg-slate-900/70 p-3">
                <p class="text-[10px] font-bold uppercase text-slate-500">Ledger</p>
                <p class="text-sm font-bold text-cyan-200 mt-1">${formatXrplAmount(xrplPendingAdjustment.ledgerBalance)} ${escapeHTML(xrplPendingAdjustment.symbol)}</p>
            </div>
            <div class="rounded-2xl border border-slate-800 bg-slate-900/70 p-3">
                <p class="text-[10px] font-bold uppercase text-slate-500">App</p>
                <p class="text-sm font-bold text-slate-200 mt-1">${formatXrplAmount(xrplPendingAdjustment.appAmount)} ${escapeHTML(xrplPendingAdjustment.symbol)}</p>
            </div>
            <div class="rounded-2xl border border-slate-800 bg-slate-900/70 p-3">
                <p class="text-[10px] font-bold uppercase text-slate-500">Difference</p>
                <p class="text-sm font-bold text-amber-300 mt-1">${escapeHTML(signedDiff)}</p>
            </div>
        `;
    }
    if (amountEl) amountEl.value = `${formatXrplAmount(xrplPendingAdjustment.amount)} ${xrplPendingAdjustment.symbol}`;
    if (tokenEl) tokenEl.value = xrplPendingAdjustment.tokenId;
    if (impactEl) impactEl.innerText = getXrplAdjustmentImpactText(type, xrplPendingAdjustment.symbol);
    if (notesEl && !notesEl.value.trim()) {
        notesEl.value = `${typeLabel} from XRPL reconciliation. Ledger ${formatXrplAmount(xrplPendingAdjustment.ledgerBalance)} ${xrplPendingAdjustment.symbol}; app ${formatXrplAmount(xrplPendingAdjustment.appAmount)} ${xrplPendingAdjustment.symbol}; difference ${signedDiff}.`;
    }

    if (window.lucide) window.lucide.createIcons();
}

async function openXrplAdjustmentReview(assetKeyEncoded) {
    const assetKey = decodeURIComponent(assetKeyEncoded || '');
    const candidate = await buildXrplAdjustmentCandidate(assetKey);
    if (!candidate) {
        if (typeof showToast === 'function') showToast('Map the asset and fetch a non-zero difference first');
        return;
    }

    xrplPendingAdjustment = {
        ...candidate,
        selectedType: candidate.defaultType
    };

    const typeSelect = document.getElementById('xrpl-adjustment-type');
    if (typeSelect) {
        typeSelect.innerHTML = candidate.typeOptions.map(option => `
            <option value="${escapeAttr(option.value)}" ${option.value === candidate.defaultType ? 'selected' : ''}>
                ${escapeHTML(option.label)}
            </option>
        `).join('');
    }

    const notesEl = document.getElementById('xrpl-adjustment-notes');
    if (notesEl) notesEl.value = '';

    document.getElementById('xrpl-adjustment-modal')?.classList.remove('hidden');
    renderXrplAdjustmentModalDetails();
}

function createXrplAdjustmentCryptoPayload(adjustment, type, notes) {
    const nowIso = new Date().toISOString();
    const symbol = String(adjustment.symbol || adjustment.asset?.symbol || adjustment.tokenId).toUpperCase();
    return {
        tokenId: adjustment.tokenId,
        symbol,
        amount: adjustment.amount,
        price: 0,
        currency: 'PHP',
        phpPrice: 0,
        phpTotal: 0,
        total: 0,
        type,
        notes,
        exchange: 'xrpl',
        strategy: 'reconciliation',
        date: nowIso,
        source: 'xrpl_reconcile',
        nonTaxAdjustment: true,
        xrpl: {
            account: xrplReconcileState.account,
            endpoint: xrplReconcileState.endpoint,
            assetKey: adjustment.asset?.key || '',
            assetLabel: adjustment.asset?.label || '',
            issuer: adjustment.asset?.issuer || '',
            ledgerBalance: adjustment.ledgerBalance,
            appBalanceBefore: adjustment.appAmount,
            difference: adjustment.diff,
            adjustmentType: type,
            createdFromLedgerIndex: xrplReconcileState.ledgerIndexMax || 0
        }
    };
}

async function saveXrplAdjustment() {
    try {
        if (!xrplPendingAdjustment) throw new Error('No XRPL adjustment is open.');

        const type = String(document.getElementById('xrpl-adjustment-type')?.value || xrplPendingAdjustment.selectedType || '').trim();
        const allowedTypes = new Set((xrplPendingAdjustment.typeOptions || []).map(option => option.value));
        if (!allowedTypes.has(type)) throw new Error('Choose a valid adjustment type.');
        if (!xrplPendingAdjustment.tokenId) throw new Error('Map this XRPL asset to an app token ID first.');
        if (!Number.isFinite(xrplPendingAdjustment.amount) || xrplPendingAdjustment.amount <= 0) {
            throw new Error('Adjustment amount must be greater than zero.');
        }

        const notes = String(document.getElementById('xrpl-adjustment-notes')?.value || '').trim() ||
            `${getXrplAdjustmentTypeLabel(type)} from XRPL reconciliation.`;
        const payload = createXrplAdjustmentCryptoPayload(xrplPendingAdjustment, type, notes);
        const db = await getDB();
        db.crypto = Array.isArray(db.crypto) ? db.crypto : [];

        const now = Date.now();
        const id = `xrpl_adj_${now.toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
        db.crypto.push({
            id,
            data: await encryptData(payload),
            createdAt: now,
            lastModified: now,
            deletedAt: null
        });

        const saved = await saveDB(db);
        rawCrypto = (saved.crypto || []).filter(c => !c.deletedAt);
        if (typeof invalidateCryptoComputationCache === 'function') invalidateCryptoComputationCache();
        closeXrplAdjustmentReview();
        if (typeof showToast === 'function') showToast('XRPL reconciliation adjustment recorded');

        if (typeof loadFromStorage === 'function') {
            await loadFromStorage();
            if (
                typeof renderCryptoPortfolio === 'function' &&
                !document.getElementById('crypto-portfolio-modal')?.classList.contains('hidden')
            ) {
                await renderCryptoPortfolio();
            }
        } else if (typeof renderCryptoPortfolio === 'function') {
            await renderCryptoPortfolio();
        }
    } catch (error) {
        console.error('Failed to save XRPL reconciliation adjustment.', error);
        const message = error?.message || 'Could not save XRPL reconciliation adjustment.';
        if (typeof showToast === 'function') showToast(message);
        else alert(message);
    }
}

function getXrplImportThreshold(delta) {
    return delta?.native ? 0.000001 : 0.00000001;
}

function getXrplMeaningfulTradeDeltas(row) {
    return (row?.tradeDeltas || []).filter(delta => Math.abs(Number(delta.tradeValue || 0)) > getXrplImportThreshold(delta));
}

function getXrplImportMappingForDelta(delta) {
    const settings = getXrplReconcileSettingsSafe();
    const mapping = settings.assetMappings?.[delta.key] || {};
    const tokenId = String(mapping.tokenId || '').trim().toLowerCase();
    return {
        tokenId,
        symbol: String(mapping.symbol || delta.symbol || delta.currency || tokenId || '').trim().toUpperCase(),
        label: String(mapping.label || delta.label || delta.symbol || tokenId || '').trim()
    };
}

function getXrplImportMissingMappings(row) {
    const missing = [];
    getXrplMeaningfulTradeDeltas(row).forEach(delta => {
        const mapping = getXrplImportMappingForDelta(delta);
        if (!mapping.tokenId) missing.push(delta);
    });
    if (row?.feeXrp > 0 && !getXrplReconcileSettingsSafe().assetMappings?.[XRPL_NATIVE_ASSET_KEY]?.tokenId) {
        missing.push(buildXrplDeltaAsset({ currency: 'XRP', value: -row.feeXrp }));
    }
    return missing;
}

function getXrplRowByHash(hash) {
    const normalizedHash = String(hash || '').trim();
    if (!normalizedHash) return null;
    return (xrplReconcileState.rows || []).find(row => row.hash === normalizedHash) || null;
}

function getXrplImportOptionLabel(value) {
    const labels = {
        swap: 'Swap + network fee',
        transfer_in: 'Transfer in',
        transfer_out: 'Transfer out',
        airdrop: 'Airdrop / reward',
        network_fee: 'Network fee only',
        swap_out: 'Swap out',
        swap_in: 'Swap in'
    };
    return labels[value] || 'Ledger import';
}

function getXrplImportImpactText(value) {
    if (value === 'swap') {
        return 'Creates linked swap_out and swap_in crypto entries from this ledger hash. If the wallet paid an XRP fee, it also creates a network_fee entry. Cost basis transfers through the existing swap logic.';
    }
    if (value === 'transfer_in') {
        return 'Creates zero-cost transfer_in entries. Use this for movement from another wallet you own; add manual cost basis separately if needed.';
    }
    if (value === 'transfer_out') {
        return 'Creates transfer_out entries that reduce token balance without recording a sale or realized P/L.';
    }
    if (value === 'airdrop') {
        return 'Creates zero-cost airdrop/reward entries. This increases token balance but does not create a cash expense.';
    }
    if (value === 'network_fee') {
        return 'Creates an XRP network_fee entry only. This is useful for TrustSet, failed transactions, or fee-only ledger activity.';
    }
    return 'Review the proposed entries before saving.';
}

function buildXrplImportOptions(row) {
    if (!row || row.result !== 'tesSUCCESS') return [];
    const meaningful = getXrplMeaningfulTradeDeltas(row);
    const positive = meaningful.filter(delta => Number(delta.tradeValue || 0) > 0);
    const negative = meaningful.filter(delta => Number(delta.tradeValue || 0) < 0);
    const options = [];

    if (positive.length === 1 && negative.length === 1) {
        options.push({
            value: 'swap',
            label: 'Swap + network fee',
            description: 'Import one swap_out, one swap_in, and the XRP fee if present.'
        });
    }
    if (positive.length > 0 && negative.length === 0) {
        options.push({
            value: 'transfer_in',
            label: 'Transfer in',
            description: 'Import as balance-only incoming transfer entries.'
        });
        options.push({
            value: 'airdrop',
            label: 'Airdrop / reward',
            description: 'Import as zero-cost reward/airdrop entries.'
        });
    }
    if (negative.length > 0 && positive.length === 0) {
        options.push({
            value: 'transfer_out',
            label: 'Transfer out',
            description: 'Import as balance-only outgoing transfer entries.'
        });
    }
    if (row.feeXrp > 0 && meaningful.length === 0) {
        options.push({
            value: 'network_fee',
            label: 'Network fee only',
            description: 'Import only the XRP network fee paid by this wallet.'
        });
    }

    return options;
}

async function getXrplImportedHashSet() {
    const imported = new Set();
    if (typeof getDecryptedCrypto !== 'function') return imported;

    try {
        const txs = await getDecryptedCrypto();
        (txs || []).forEach(tx => {
            const hash = String(tx?.xrpl?.hash || tx?.xrplHash || '').trim();
            if (hash) imported.add(hash);
        });
    } catch (error) {
        console.warn('Could not scan crypto history for imported XRPL hashes.', error);
    }

    return imported;
}

async function isXrplHashAlreadyImported(hash) {
    const imported = await getXrplImportedHashSet();
    return imported.has(String(hash || '').trim());
}

function getXrplImportDefaultClassification(row) {
    const options = buildXrplImportOptions(row);
    return options[0]?.value || '';
}

function buildXrplImportBasePayload(row, delta, type, amount, notes, extra = {}) {
    const mapping = getXrplImportMappingForDelta(delta);
    const symbol = String(mapping.symbol || delta?.symbol || delta?.currency || mapping.tokenId || '').toUpperCase();
    return {
        tokenId: mapping.tokenId,
        symbol,
        amount: Math.max(0, Number(amount || 0)),
        price: 0,
        currency: 'PHP',
        phpPrice: 0,
        phpTotal: 0,
        total: 0,
        type,
        notes,
        exchange: 'xrpl',
        strategy: 'ledger-import',
        date: row.date || new Date().toISOString(),
        source: 'xrpl_ledger_import',
        nonTaxAdjustment: type !== 'swap_in' && type !== 'swap_out',
        xrpl: {
            hash: row.hash,
            ledgerIndex: row.ledgerIndex,
            account: xrplReconcileState.account,
            txType: row.txType,
            category: row.category,
            result: row.result,
            assetKey: delta?.key || '',
            assetLabel: delta?.label || '',
            issuer: delta?.issuer || '',
            importClassification: extra.importClassification || type,
            feeXrp: row.feeXrp || 0
        },
        ...extra.fields
    };
}

function buildXrplNetworkFeePayload(row, notes, importClassification = 'network_fee') {
    const delta = buildXrplDeltaAsset({ currency: 'XRP', value: -row.feeXrp });
    return buildXrplImportBasePayload(row, delta, 'network_fee', row.feeXrp, notes, {
        importClassification,
        fields: {
            nonTaxAdjustment: true
        }
    });
}

function buildXrplImportPayloads(row, classification, notes) {
    const meaningful = getXrplMeaningfulTradeDeltas(row);
    const positive = meaningful.filter(delta => Number(delta.tradeValue || 0) > 0);
    const negative = meaningful.filter(delta => Number(delta.tradeValue || 0) < 0);
    const payloads = [];

    if (classification === 'swap') {
        if (positive.length !== 1 || negative.length !== 1) {
            throw new Error('Swap import needs exactly one outgoing token and one incoming token.');
        }
        const outDelta = negative[0];
        const inDelta = positive[0];
        const outMapping = getXrplImportMappingForDelta(outDelta);
        const inMapping = getXrplImportMappingForDelta(inDelta);
        if (!outMapping.tokenId || !inMapping.tokenId) {
            throw new Error('Map both swap assets before importing this ledger activity.');
        }
        const swapId = `xrpl_swap_${String(row.hash || Date.now()).slice(0, 16)}`;
        payloads.push(buildXrplImportBasePayload(row, outDelta, 'swap_out', Math.abs(outDelta.tradeValue), notes, {
            importClassification: 'swap',
            fields: {
                swapId,
                linkedToken: inMapping.symbol || inMapping.tokenId,
                nonTaxAdjustment: false
            }
        }));
        payloads.push(buildXrplImportBasePayload(row, inDelta, 'swap_in', Math.abs(inDelta.tradeValue), notes, {
            importClassification: 'swap',
            fields: {
                swapId,
                linkedToken: outMapping.symbol || outMapping.tokenId,
                nonTaxAdjustment: false
            }
        }));
        if (row.feeXrp > 0) payloads.push(buildXrplNetworkFeePayload(row, notes, 'swap'));
        return payloads;
    }

    if (classification === 'transfer_in' || classification === 'airdrop') {
        positive.forEach(delta => {
            const mapping = getXrplImportMappingForDelta(delta);
            if (!mapping.tokenId) throw new Error(`Map ${delta.label || delta.symbol} before importing this ledger activity.`);
            payloads.push(buildXrplImportBasePayload(row, delta, classification, Math.abs(delta.tradeValue), notes, {
                importClassification: classification
            }));
        });
        if (row.feeXrp > 0) payloads.push(buildXrplNetworkFeePayload(row, notes, classification));
        return payloads;
    }

    if (classification === 'transfer_out') {
        negative.forEach(delta => {
            const mapping = getXrplImportMappingForDelta(delta);
            if (!mapping.tokenId) throw new Error(`Map ${delta.label || delta.symbol} before importing this ledger activity.`);
            payloads.push(buildXrplImportBasePayload(row, delta, 'transfer_out', Math.abs(delta.tradeValue), notes, {
                importClassification: 'transfer_out'
            }));
        });
        if (row.feeXrp > 0) payloads.push(buildXrplNetworkFeePayload(row, notes, 'transfer_out'));
        return payloads;
    }

    if (classification === 'network_fee') {
        if (!(row.feeXrp > 0)) throw new Error('This ledger activity has no XRP fee paid by the wallet.');
        return [buildXrplNetworkFeePayload(row, notes, 'network_fee')];
    }

    throw new Error('Choose a supported import type.');
}

function closeXrplImportReview() {
    xrplPendingImport = null;
    document.getElementById('xrpl-import-modal')?.classList.add('hidden');
}

function renderXrplImportModalDetails() {
    if (!xrplPendingImport) return;

    const row = xrplPendingImport.row;
    const selectEl = document.getElementById('xrpl-import-classification');
    const classification = String(selectEl?.value || xrplPendingImport.defaultClassification || '').trim();
    xrplPendingImport.selectedClassification = classification;

    const titleEl = document.getElementById('xrpl-import-title');
    const subtitleEl = document.getElementById('xrpl-import-subtitle');
    const summaryEl = document.getElementById('xrpl-import-ledger-summary');
    const previewEl = document.getElementById('xrpl-import-preview');
    const impactEl = document.getElementById('xrpl-import-impact');
    const notesEl = document.getElementById('xrpl-import-notes');
    const label = getXrplImportOptionLabel(classification);
    const hashText = row.hash ? shortXrplText(row.hash, 10, 8) : 'No hash';
    const dateText = row.date ? new Date(row.date).toLocaleString() : 'Unknown date';

    if (titleEl) titleEl.innerText = `Import as ${label}`;
    if (subtitleEl) subtitleEl.innerText = `Ledger ${row.ledgerIndex || '--'} - ${row.txType} - ${hashText}`;
    if (summaryEl) {
        summaryEl.innerHTML = `
            <div class="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                <div>
                    <p class="text-sm font-bold text-slate-200">${escapeHTML(row.explanation || 'XRPL ledger activity')}</p>
                    <p class="text-[11px] text-slate-500 mt-1">${escapeHTML(dateText)} - ${escapeHTML(row.result)} - ${escapeHTML(hashText)}</p>
                </div>
                <div class="text-right shrink-0">
                    <p class="text-[10px] font-bold uppercase text-slate-500">Fee</p>
                    <p class="text-xs font-bold text-amber-300 mt-1">${row.feeXrp > 0 ? `${formatXrplAmount(row.feeXrp, 8)} XRP` : '--'}</p>
                </div>
            </div>
        `;
    }

    let payloads = [];
    let previewError = '';
    try {
        const notes = String(notesEl?.value || '').trim() || `${label} imported from XRPL ledger activity ${hashText}.`;
        payloads = buildXrplImportPayloads(row, classification, notes);
    } catch (error) {
        previewError = error?.message || 'Could not build import preview.';
    }

    if (previewEl) {
        if (previewError) {
            previewEl.innerHTML = `<div class="rounded-2xl border border-amber-900/60 bg-amber-950/30 p-4 text-sm text-amber-100">${escapeHTML(previewError)}</div>`;
        } else if (!payloads.length) {
            previewEl.innerHTML = '<div class="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 text-sm text-slate-500">No app entries would be created for this classification.</div>';
        } else {
            previewEl.innerHTML = payloads.map(payload => {
                const deltaSign = ['swap_in', 'transfer_in', 'airdrop'].includes(payload.type) ? '+' : '-';
                return `
                    <div class="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
                        <div class="flex items-start justify-between gap-3">
                            <div>
                                <p class="text-sm font-bold text-slate-200">${escapeHTML(getXrplImportOptionLabel(payload.type) || payload.type)}</p>
                                <p class="text-[11px] text-slate-500 mt-1">${escapeHTML(payload.tokenId)} - ${escapeHTML(payload.symbol)}</p>
                            </div>
                            <p class="text-sm font-black ${deltaSign === '+' ? 'text-emerald-300' : 'text-rose-300'}">${deltaSign}${formatXrplAmount(payload.amount)} ${escapeHTML(payload.symbol)}</p>
                        </div>
                    </div>
                `;
            }).join('');
        }
    }
    if (impactEl) impactEl.innerText = getXrplImportImpactText(classification);
    if (notesEl && !notesEl.value.trim()) {
        notesEl.value = `${label} imported from XRPL ledger activity ${hashText}. ${row.explanation || ''}`.trim();
    }
    if (window.lucide) window.lucide.createIcons();
}

async function openXrplImportReview(hashEncoded) {
    const hash = decodeURIComponent(hashEncoded || '');
    const row = getXrplRowByHash(hash);
    if (!row) {
        if (typeof showToast === 'function') showToast('Could not find that XRPL activity row');
        return;
    }
    if (await isXrplHashAlreadyImported(row.hash)) {
        if (typeof showToast === 'function') showToast('This XRPL activity is already imported');
        return;
    }

    const options = buildXrplImportOptions(row);
    if (!options.length) {
        if (typeof showToast === 'function') showToast('This XRPL activity is not importable yet');
        return;
    }

    const missingMappings = getXrplImportMissingMappings(row);
    if (missingMappings.length) {
        const labels = missingMappings.map(delta => delta.label || delta.symbol || delta.key).join(', ');
        if (typeof showToast === 'function') showToast(`Map token IDs first: ${labels}`);
        else alert(`Map token IDs first: ${labels}`);
        return;
    }

    xrplPendingImport = {
        row,
        options,
        defaultClassification: getXrplImportDefaultClassification(row),
        selectedClassification: getXrplImportDefaultClassification(row)
    };

    const selectEl = document.getElementById('xrpl-import-classification');
    if (selectEl) {
        selectEl.innerHTML = options.map(option => `
            <option value="${escapeAttr(option.value)}" ${option.value === xrplPendingImport.defaultClassification ? 'selected' : ''}>
                ${escapeHTML(option.label)}
            </option>
        `).join('');
    }
    const notesEl = document.getElementById('xrpl-import-notes');
    if (notesEl) notesEl.value = '';
    document.getElementById('xrpl-import-modal')?.classList.remove('hidden');
    renderXrplImportModalDetails();
}

async function saveXrplImport() {
    try {
        if (!xrplPendingImport?.row) throw new Error('No XRPL import is open.');
        const row = xrplPendingImport.row;
        const classification = String(document.getElementById('xrpl-import-classification')?.value || xrplPendingImport.selectedClassification || '').trim();
        const allowed = new Set((xrplPendingImport.options || []).map(option => option.value));
        if (!allowed.has(classification)) throw new Error('Choose a valid import type.');
        if (await isXrplHashAlreadyImported(row.hash)) throw new Error('This XRPL activity is already imported.');

        const label = getXrplImportOptionLabel(classification);
        const notes = String(document.getElementById('xrpl-import-notes')?.value || '').trim() ||
            `${label} imported from XRPL ledger activity ${shortXrplText(row.hash, 10, 8)}.`;
        const payloads = buildXrplImportPayloads(row, classification, notes);
        if (!payloads.length) throw new Error('No app entries would be created.');

        const db = await getDB();
        db.crypto = Array.isArray(db.crypto) ? db.crypto : [];
        const now = Date.now();
        payloads.forEach((payload, index) => {
            db.crypto.push({
                id: `xrpl_import_${String(row.hash || now).slice(0, 12)}_${index}_${Math.random().toString(36).slice(2, 7)}`,
                data: null,
                createdAt: now + index,
                lastModified: now + index,
                deletedAt: null,
                pendingPayload: payload
            });
        });

        for (const entry of db.crypto) {
            if (!entry?.pendingPayload) continue;
            entry.data = await encryptData(entry.pendingPayload);
            delete entry.pendingPayload;
        }

        const saved = await saveDB(db);
        rawCrypto = (saved.crypto || []).filter(c => !c.deletedAt);
        if (typeof invalidateCryptoComputationCache === 'function') invalidateCryptoComputationCache();
        closeXrplImportReview();
        if (typeof showToast === 'function') showToast(`Imported ${payloads.length} XRPL app entr${payloads.length === 1 ? 'y' : 'ies'}`);

        if (typeof loadFromStorage === 'function') {
            await loadFromStorage();
            if (
                typeof renderCryptoPortfolio === 'function' &&
                !document.getElementById('crypto-portfolio-modal')?.classList.contains('hidden')
            ) {
                await renderCryptoPortfolio();
            }
        } else if (typeof renderCryptoPortfolio === 'function') {
            await renderCryptoPortfolio();
        }
    } catch (error) {
        console.error('Failed to import XRPL ledger activity.', error);
        const message = error?.message || 'Could not import XRPL ledger activity.';
        if (typeof showToast === 'function') showToast(message);
        else alert(message);
    }
}

function buildXrplComparisonAssetList(settings) {
    const map = new Map();
    if (xrplReconcileState.balanceMap?.size) {
        xrplReconcileState.balanceMap.forEach((asset, key) => map.set(key, asset));
    }

    Object.keys(settings.assetMappings || {}).forEach(key => {
        if (map.has(key)) return;
        if (key === XRPL_NATIVE_ASSET_KEY) {
            map.set(key, buildXrplNativeAsset(0));
            return;
        }
        const parts = key.split(':');
        if (parts.length >= 3) {
            const currency = parts[1];
            const issuer = parts.slice(2).join(':');
            map.set(key, {
                key,
                currency,
                symbol: currency,
                issuer,
                label: buildXrplAssetLabel(currency, issuer),
                balance: 0,
                native: false
            });
        }
    });

    return Array.from(map.values()).sort(sortXrplAssets);
}

async function renderXrplBalanceComparison(settings) {
    const mount = document.getElementById('xrpl-balance-comparison');
    if (!mount) return;

    const assets = buildXrplComparisonAssetList(settings);
    if (!xrplReconcileState.account) {
        mount.innerHTML = '<div class="text-sm text-slate-500 py-6 text-center">Fetch a wallet address to compare ledger and app balances.</div>';
        return;
    }
    if (!assets.length) {
        mount.innerHTML = '<div class="text-sm text-slate-500 py-6 text-center">No ledger balances found for this wallet.</div>';
        return;
    }

    let holdings = {};
    try {
        if (typeof cryptoPortfolioRenderContext !== 'undefined' && cryptoPortfolioRenderContext?.holdings) {
            holdings = cryptoPortfolioRenderContext.holdings;
        } else if (typeof calculateHoldings === 'function') {
            holdings = await calculateHoldings(document.getElementById('cost-basis-method')?.value || 'fifo');
        }
    } catch (error) {
        console.warn('Could not calculate holdings for XRPL comparison.', error);
        holdings = {};
    }

    mount.innerHTML = assets.map(asset => {
        const mapping = settings.assetMappings?.[asset.key] || {};
        const mappedTokenId = String(mapping.tokenId || '').trim();
        const appAmount = getXrplMappedHoldingAmount(holdings, mapping);
        const appSymbol = getXrplMappedHoldingSymbol(holdings, mapping, asset.symbol);
        const canCompare = Number.isFinite(appAmount);
        const diff = canCompare ? asset.balance - appAmount : null;
        const diffAbs = Math.abs(Number(diff || 0));
        const canResolve = canCompare && mappedTokenId && diffAbs > getXrplComparisonThreshold(asset);
        const diffTone = !canCompare
            ? 'text-slate-500'
            : (diffAbs <= 0.00000001 ? 'text-emerald-300' : 'text-amber-300');
        const encodedKey = encodeInlineArg(asset.key);
        const issuerText = asset.issuer ? `<p class="text-[10px] text-slate-600 mt-0.5">Issuer ${escapeHTML(shortXrplText(asset.issuer, 8, 6))}</p>` : '';
        const resolveButtonLabel = canResolve && asset.native && diff < 0
            ? 'Review Fee Fix'
            : 'Review Fix';

        return `
            <div class="rounded-2xl border border-slate-800 bg-slate-900/55 p-3">
                <div class="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
                    <div class="min-w-0">
                        <div class="flex flex-wrap items-center gap-2">
                            <p class="text-sm font-bold text-slate-200">${escapeHTML(asset.label)}</p>
                            <span class="rounded-full border border-slate-700 bg-slate-950 px-2 py-0.5 text-[10px] font-bold text-slate-500">${asset.native ? 'native' : 'trust line'}</span>
                        </div>
                        ${issuerText}
                        <div class="grid grid-cols-3 gap-2 mt-3">
                            <div>
                                <p class="text-[10px] font-bold uppercase text-slate-500">Ledger</p>
                                <p class="text-xs font-bold text-cyan-200 mt-1">${formatXrplAmount(asset.balance)} ${escapeHTML(asset.symbol)}</p>
                            </div>
                            <div>
                                <p class="text-[10px] font-bold uppercase text-slate-500">App</p>
                                <p class="text-xs font-bold text-slate-200 mt-1">${canCompare ? `${formatXrplAmount(appAmount)} ${escapeHTML(appSymbol)}` : 'Unmapped'}</p>
                            </div>
                            <div>
                                <p class="text-[10px] font-bold uppercase text-slate-500">Difference</p>
                                <p class="text-xs font-bold ${diffTone} mt-1">${canCompare ? `${formatXrplSignedAmount(diff, asset.symbol)}` : '--'}</p>
                            </div>
                        </div>
                    </div>
                    <div class="lg:w-44 shrink-0">
                        <label class="block text-[10px] font-bold uppercase text-slate-500 mb-1">App token id</label>
                        <input type="text" value="${escapeAttr(mappedTokenId)}" placeholder="${asset.native ? 'ripple' : 'CoinGecko id'}"
                            onchange="updateXrplAssetMapping('${encodedKey}', this.value)"
                            class="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-semibold text-slate-200 outline-none focus:border-cyan-500">
                        <p class="text-[10px] text-slate-600 mt-1">${canCompare ? 'Mapped for comparison' : 'Map to compare with app holdings'}</p>
                        ${canResolve ? `
                            <button type="button" onclick="openXrplAdjustmentReview('${encodedKey}')"
                                class="mt-2 w-full rounded-xl border border-cyan-700/60 bg-cyan-500/10 px-3 py-2 text-[11px] font-black text-cyan-200 hover:bg-cyan-500/20">
                                ${resolveButtonLabel}
                            </button>
                        ` : ''}
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

async function renderXrplActivityList() {
    const list = document.getElementById('xrpl-activity-list');
    if (!list) return;

    if (!xrplReconcileState.rows.length) {
        list.innerHTML = xrplReconcileState.account
            ? '<div class="text-sm text-slate-500 py-6 text-center">No ledger activity found in the loaded page.</div>'
            : '<div class="text-sm text-slate-500 py-6 text-center">No XRPL activity loaded yet.</div>';
        return;
    }

    const importedHashes = await getXrplImportedHashSet();

    list.innerHTML = xrplReconcileState.rows.map(row => {
        const categoryClass = getXrplCategoryClass(row.category);
        const dateText = row.date ? new Date(row.date).toLocaleString() : 'Unknown date';
        const txUrl = row.hash ? `https://livenet.xrpl.org/transactions/${encodeURIComponent(row.hash)}` : '';
        const importable = !!row.hash && row.result === 'tesSUCCESS' && buildXrplImportOptions(row).length > 0;
        const alreadyImported = importedHashes.has(row.hash);
        const importActionMarkup = alreadyImported
            ? '<span class="inline-flex items-center justify-center rounded-xl border border-emerald-800/70 bg-emerald-950/30 px-3 py-1.5 text-[11px] font-black text-emerald-300">Imported</span>'
            : (importable ? `
                <button type="button" onclick="openXrplImportReview('${encodeInlineArg(row.hash)}')"
                    class="rounded-xl border border-cyan-700/70 bg-cyan-500/10 px-3 py-1.5 text-[11px] font-black text-cyan-200 hover:bg-cyan-500/20">
                    Review Import
                </button>
            ` : '<span class="text-[10px] text-slate-600">Not importable</span>');
        const deltaMarkup = row.tradeDeltas.length ? row.tradeDeltas.map(delta => {
            const tradeValue = Number(delta.tradeValue || 0);
            const netValue = Number(delta.netValue || delta.value || 0);
            const isPositive = tradeValue > 0;
            const tone = isPositive ? 'text-emerald-300' : (tradeValue < 0 ? 'text-rose-300' : 'text-slate-400');
            const netText = delta.native && row.feeXrp > 0 && Math.abs(tradeValue - netValue) > 0.000000000001
                ? `<span class="text-[10px] text-slate-600 block">Net ${formatXrplSignedAmount(netValue, delta.symbol)} incl. fee</span>`
                : '';
            return `
                <div class="rounded-xl border border-slate-800 bg-slate-950/80 px-3 py-2">
                    <p class="text-xs font-bold ${tone}">${formatXrplSignedAmount(tradeValue, delta.symbol)}</p>
                    ${netText}
                </div>
            `;
        }).join('') : '<div class="rounded-xl border border-slate-800 bg-slate-950/80 px-3 py-2 text-xs text-slate-500">No token delta found</div>';

        const hashMarkup = row.hash
            ? `<a href="${txUrl}" target="_blank" rel="noopener noreferrer" class="text-cyan-300 hover:text-cyan-200">${escapeHTML(shortXrplText(row.hash, 8, 8))}</a>`
            : '<span class="text-slate-600">No hash</span>';

        return `
            <div class="rounded-2xl border border-slate-800 bg-slate-900/60 p-3">
                <div class="flex items-start justify-between gap-3">
                    <div class="min-w-0">
                        <div class="flex flex-wrap items-center gap-2">
                            <span class="rounded-full border px-2 py-0.5 text-[10px] font-black uppercase tracking-wide ${categoryClass}">${escapeHTML(getXrplCategoryLabel(row.category))}</span>
                            <span class="text-[10px] font-bold text-slate-500">${escapeHTML(row.txType)}</span>
                            <span class="text-[10px] text-slate-600">Ledger ${row.ledgerIndex || '--'}</span>
                        </div>
                        <p class="text-sm font-semibold text-slate-200 mt-2">${escapeHTML(row.explanation)}</p>
                        <p class="text-[10px] text-slate-500 mt-1">${escapeHTML(dateText)} - ${hashMarkup}</p>
                    </div>
                    <div class="text-right shrink-0">
                        <p class="text-[10px] font-bold uppercase text-slate-500">Fee</p>
                        <p class="text-xs font-bold text-amber-300 mt-1">${row.feeXrp > 0 ? `${formatXrplAmount(row.feeXrp, 8)} XRP` : '--'}</p>
                        <p class="text-[10px] text-slate-600 mt-1">${escapeHTML(row.result)}</p>
                        <div class="mt-2">${importActionMarkup}</div>
                    </div>
                </div>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3">
                    ${deltaMarkup}
                </div>
            </div>
        `;
    }).join('');
}

async function renderXrplReconcilePanel() {
    const panel = document.getElementById('xrpl-reconcile-panel');
    if (!panel) return;

    const settings = getXrplReconcileSettingsSafe();
    renderXrplControls(settings);
    renderXrplSummary(settings);

    if (xrplReconcileState.loading) {
        setXrplStatus('Fetching validated XRP Ledger data. This is read-only and will not change saved crypto transactions.');
    } else if (xrplReconcileState.error) {
        setXrplStatus(xrplReconcileState.error, 'error');
    } else if (xrplReconcileState.account) {
        const loaded = xrplReconcileState.rows.length;
        const ledgerText = xrplReconcileState.ledgerIndexMax ? ` through ledger ${xrplReconcileState.ledgerIndexMax}` : '';
        setXrplStatus(`Loaded ${loaded} XRPL transaction${loaded === 1 ? '' : 's'} for ${xrplReconcileState.account}${ledgerText}. Review only: no app entries were changed.`, 'success');
    } else {
        setXrplStatus(settings.walletAddress
            ? 'Saved wallet address is ready. Fetch the ledger to compare balances.'
            : 'Enter a public XRP wallet address to compare ledger balances with this app.');
    }

    await renderXrplBalanceComparison(settings);
    await renderXrplActivityList();
    if (window.lucide) window.lucide.createIcons();
}

async function updateXrplEndpoint(endpoint) {
    await persistXrplReconcileSettings({ endpoint: normalizeXrplEndpoint(endpoint) });
    await renderXrplReconcilePanel();
}

async function updateXrplAssetMapping(assetKeyEncoded, tokenIdRaw) {
    const assetKey = decodeURIComponent(assetKeyEncoded || '');
    if (!assetKey) return;

    const tokenId = String(tokenIdRaw || '').trim().toLowerCase();
    const existing = getXrplReconcileSettingsSafe().assetMappings || {};
    const asset = xrplReconcileState.balanceMap?.get(assetKey) || null;
    const assetMappings = {
        ...existing,
        [assetKey]: {
            tokenId,
            symbol: asset?.symbol || existing[assetKey]?.symbol || '',
            label: asset?.label || existing[assetKey]?.label || ''
        }
    };

    await persistXrplReconcileSettings({ assetMappings });
    await renderXrplReconcilePanel();
    if (typeof showToast === 'function') {
        showToast(tokenId ? 'XRPL asset mapping saved' : 'XRPL asset mapping cleared');
    }
}

async function refreshXrplReconciliation(options = {}) {
    if (xrplReconcileState.loading) return;
    const append = !!options.append;
    const settings = getXrplReconcileSettingsSafe();
    const walletInput = document.getElementById('xrpl-wallet-address');
    const endpointSelect = document.getElementById('xrpl-endpoint');
    const account = append
        ? xrplReconcileState.account
        : String(walletInput?.value || settings.walletAddress || '').trim();
    const endpoint = append
        ? xrplReconcileState.endpoint
        : normalizeXrplEndpoint(endpointSelect?.value || settings.endpoint);

    if (!account || !isValidXrplClassicAddress(account)) {
        xrplReconcileState = {
            ...xrplReconcileState,
            account,
            endpoint,
            error: 'Enter a valid classic XRP Ledger address that starts with "r".',
            loading: false
        };
        await renderXrplReconcilePanel();
        return;
    }

    if (!window.xrpl || typeof window.xrpl.getBalanceChanges !== 'function') {
        xrplReconcileState = {
            ...xrplReconcileState,
            account,
            endpoint,
            error: 'XRPL parser library did not load. Check your internet connection and refresh the finance page.',
            loading: false
        };
        await renderXrplReconcilePanel();
        return;
    }

    xrplReconcileState = {
        ...xrplReconcileState,
        account,
        endpoint,
        loading: true,
        error: ''
    };
    await persistXrplReconcileSettings({ walletAddress: account, endpoint });
    await renderXrplReconcilePanel();

    try {
        let balances = xrplReconcileState.balances;
        let balanceMap = xrplReconcileState.balanceMap;
        let ledgerIndexMax = xrplReconcileState.ledgerIndexMax;

        if (!append) {
            const current = await fetchXrplCurrentBalances(account, endpoint);
            balances = current.balances;
            balanceMap = buildXrplBalanceMap(balances);
            ledgerIndexMax = current.ledgerIndex;
        }

        const txPage = await fetchXrplTransactions(account, endpoint, append ? xrplReconcileState.marker : null);
        const parsedRows = (Array.isArray(txPage?.transactions) ? txPage.transactions : [])
            .map(row => parseXrplTransactionRow(row, account));
        const rows = append ? mergeXrplRows(xrplReconcileState.rows, parsedRows) : parsedRows;
        const fetchedAt = Date.now();
        ledgerIndexMax = Math.max(
            ledgerIndexMax,
            Number(txPage?.ledger_index_max || 0) || 0,
            ...rows.map(row => Number(row.ledgerIndex || 0) || 0)
        );

        xrplReconcileState = {
            account,
            endpoint,
            balances,
            balanceMap,
            rows,
            marker: txPage?.marker || null,
            loading: false,
            error: '',
            fetchedAt,
            ledgerIndexMax
        };

        await persistXrplReconcileSettings({
            walletAddress: account,
            endpoint,
            lastRefreshAt: fetchedAt,
            lastLedgerIndex: ledgerIndexMax
        });
    } catch (error) {
        console.error('XRPL reconciliation refresh failed.', error);
        xrplReconcileState = {
            ...xrplReconcileState,
            loading: false,
            error: error?.message || 'Could not fetch XRP Ledger data. Try another endpoint or check the wallet address.'
        };
    }

    await renderXrplReconcilePanel();
}

async function loadOlderXrplTransactions() {
    if (!xrplReconcileState.marker || xrplReconcileState.loading) return;
    await refreshXrplReconciliation({ append: true });
}
