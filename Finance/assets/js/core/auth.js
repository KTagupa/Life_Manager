// =============================================
// SECTION 3: AUTHENTICATION & ENCRYPTION
// =============================================
async function deriveKey(password, salt, iterations = 310000) {
    const enc = new TextEncoder();
    const keyMaterial = await window.crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveKey"]);
    return window.crypto.subtle.deriveKey(
        { name: "PBKDF2", salt: salt, iterations: iterations, hash: "SHA-256" },
        keyMaterial, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]
    );
}

function bytesToBase64(bytes) {
    let str = '';
    bytes.forEach(b => str += String.fromCharCode(b));
    return btoa(str);
}

function base64ToBytes(b64) {
    const binary = atob(b64);
    const arr = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i);
    return arr;
}

function getLegacyKdfMeta() {
    return {
        version: 1,
        saltB64: bytesToBase64(new TextEncoder().encode("finance-flow-salt-v3")),
        iterations: 100000,
        legacy: true,
        createdAt: new Date().toISOString()
    };
}

function createNewKdfMeta() {
    return {
        version: 1,
        saltB64: bytesToBase64(window.crypto.getRandomValues(new Uint8Array(16))),
        iterations: 310000,
        legacy: false,
        createdAt: new Date().toISOString()
    };
}

function hasVaultData(db) {
    if (!db || typeof db !== 'object') return false;
    const keys = ['transactions', 'bills', 'debts', 'lent', 'crypto', 'wishlist', 'recurring_transactions', 'goals', 'investment_goals'];
    return keys.some(k => Array.isArray(db[k]) && db[k].length > 0);
}

function isValidKdfMeta(meta) {
    if (!meta || typeof meta !== 'object') return false;
    const iterations = parseInt(meta.iterations || 0, 10);
    return typeof meta.saltB64 === 'string' && meta.saltB64.length > 0 && Number.isFinite(iterations) && iterations > 0;
}

function isEncryptedVaultPayload(value) {
    return !!(value && Array.isArray(value.iv) && Array.isArray(value.content));
}

function countEncryptedVaultEntries(db) {
    if (!db || typeof db !== 'object') return 0;
    const collectionKeys = ['transactions', 'bills', 'debts', 'lent', 'crypto', 'wishlist'];
    let count = 0;
    collectionKeys.forEach(key => {
        count += (db[key] || []).filter(item => item && !item.deletedAt && isEncryptedVaultPayload(item.data)).length;
    });
    if (db.budgets && isEncryptedVaultPayload(db.budgets.data)) count += 1;
    if (isEncryptedVaultPayload(db.vault_probe)) count += 1;
    return count;
}

function collectVaultDecryptProbes(db) {
    const probes = [];

    if (isEncryptedVaultPayload(db?.vault_probe)) probes.push(db.vault_probe);

    const collectionKeys = ['transactions', 'bills', 'debts', 'lent', 'crypto', 'wishlist'];
    collectionKeys.forEach(key => {
        const sample = (db?.[key] || []).find(item => item && !item.deletedAt && isEncryptedVaultPayload(item.data));
        if (sample && sample.data) probes.push(sample.data);
    });

    if (db?.budgets && isEncryptedVaultPayload(db.budgets.data)) probes.push(db.budgets.data);
    return probes;
}

async function verifyVaultDecryption(db) {
    const encryptedEntryCount = countEncryptedVaultEntries(db);
    if (encryptedEntryCount === 0) {
        return { ok: true, encryptedEntryCount };
    }

    const probes = collectVaultDecryptProbes(db);
    for (const payload of probes) {
        const decrypted = await decryptData(payload);
        if (decrypted) {
            return { ok: true, encryptedEntryCount };
        }
    }

    return { ok: false, encryptedEntryCount };
}

async function ensureVaultProbe(db) {
    if (!db || isEncryptedVaultPayload(db.vault_probe)) return;
    db.vault_probe = await encryptData({
        marker: 'finance-flow-vault-probe-v1',
        createdAt: new Date().toISOString()
    });
    await saveDB(db);
}

async function persistKdfMeta(vaultId, meta) {
    try {
        localStorage.setItem(getKdfMetaStorageKey(vaultId), JSON.stringify(meta));
    } catch (e) {
        console.error('Failed to persist local KDF metadata', e);
    }

    try {
        if (firestoreDB) {
            await firestoreDB.collection('vault_meta').doc(vaultId).set({
                kdfMeta: meta,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true });

            await firestoreDB.collection('vaults').doc(vaultId).set({
                kdfMeta: meta,
                kdfUpdatedAt: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
        }
    } catch (e) {
        console.error('Failed to persist remote KDF metadata', e);
    }
}

async function loadRemoteKdfMeta(vaultId) {
    try {
        if (!firestoreDB) return null;
        const metaDoc = await firestoreDB.collection('vault_meta').doc(vaultId).get();
        const metaFromMetaDoc = metaDoc.exists ? metaDoc.data()?.kdfMeta : null;
        if (isValidKdfMeta(metaFromMetaDoc)) return metaFromMetaDoc;

        const vaultDoc = await firestoreDB.collection('vaults').doc(vaultId).get();
        const metaFromVaultDoc = vaultDoc.exists ? vaultDoc.data()?.kdfMeta : null;
        return isValidKdfMeta(metaFromVaultDoc) ? metaFromVaultDoc : null;
    } catch (e) {
        console.error('Remote KDF metadata lookup failed', e);
        return null;
    }
}

async function resolveKdfMeta(password) {
    const vaultId = await getVaultId(password);
    let localMeta = null;
    let remoteMeta = null;

    try {
        const raw = localStorage.getItem(getKdfMetaStorageKey(vaultId));
        localMeta = raw ? JSON.parse(raw) : null;
    } catch (e) {
        console.error('Local KDF metadata parse failed', e);
    }
    if (!isValidKdfMeta(localMeta)) localMeta = null;

    remoteMeta = await loadRemoteKdfMeta(vaultId);
    if (!isValidKdfMeta(remoteMeta)) remoteMeta = null;

    if (remoteMeta || localMeta) {
        const meta = remoteMeta || localMeta;
        if (!localMeta && remoteMeta) {
            localStorage.setItem(getKdfMetaStorageKey(vaultId), JSON.stringify(remoteMeta));
        }
        return { vaultId, meta };
    }

    // No metadata exists yet: decide between legacy params (existing vault) or new random params.
    let existingData = false;
    try {
        const localDB = (typeof getLocalDBSnapshot === 'function')
            ? await getLocalDBSnapshot()
            : (() => {
                const raw = localStorage.getItem(DB_KEY);
                return raw ? JSON.parse(raw) : null;
            })();
        existingData = hasVaultData(localDB);
    } catch (e) {
        console.error('Local vault probe failed', e);
    }

    if (!existingData) {
        try {
            if (firestoreDB) {
                const doc = await firestoreDB.collection('vaults').doc(vaultId).get();
                if (doc.exists) {
                    existingData = hasVaultData(doc.data()?.vaultData || {});
                }
            }
        } catch (e) {
            console.error('Remote vault probe failed', e);
        }
    }

    const meta = existingData ? getLegacyKdfMeta() : createNewKdfMeta();
    await persistKdfMeta(vaultId, meta);
    return { vaultId, meta };
}

async function encryptData(data) {
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const enc = new TextEncoder();
    const encrypted = await window.crypto.subtle.encrypt({ name: "AES-GCM", iv: iv }, cryptoKey, enc.encode(JSON.stringify(data)));
    return { iv: Array.from(iv), content: Array.from(new Uint8Array(encrypted)) };
}

// Generate vault ID from master key
async function getVaultId(password) {
    const enc = new TextEncoder();
    const hashBuffer = await window.crypto.subtle.digest(
        'SHA-256',
        enc.encode(password + 'finance-vault-id-salt-v1')
    );
    return Array.from(new Uint8Array(hashBuffer))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
}

// Fetch real-time exchange rates
async function updateExchangeRates() {
    try {
        const r = await fetch('https://api.exchangerate-api.com/v4/latest/PHP');
        const d = await r.json();
        exchangeRates.USD = d.rates.USD;
        exchangeRates.JPY = d.rates.JPY;
        exchangeRates.PHP = 1;

        exchangeRates.lastUpdated = Date.now();

        console.log('✅ Exchange rates updated:', exchangeRates);
        console.log('📅 Last updated:', new Date(exchangeRates.lastUpdated).toLocaleTimeString());
    } catch (e) {
        console.log("⚠️ Exchange rate update failed. Using cached rates.");
    }
}

async function decryptData(encryptedObj) {
    try {
        if (!encryptedObj || !encryptedObj.iv || !encryptedObj.content) return null;
        const dec = new TextDecoder();
        const decrypted = await window.crypto.subtle.decrypt({ name: "AES-GCM", iv: new Uint8Array(encryptedObj.iv) }, cryptoKey, new Uint8Array(encryptedObj.content));
        return JSON.parse(dec.decode(decrypted));
    } catch (e) { console.error("Decrypt fail", e); return null; }
}

function formatBridgePreviewAmount(amount, currency) {
    const parsedAmount = Number(amount);
    const safeCurrency = String(currency || 'PHP').toUpperCase();
    if (!Number.isFinite(parsedAmount)) return `${safeCurrency} 0`;
    const decimals = safeCurrency === 'JPY' ? 0 : 2;
    return `${safeCurrency} ${parsedAmount.toLocaleString(undefined, {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
    })}`;
}

function summarizeBridgePreviewItem(item) {
    const type = item?.type === 'income' ? 'Income' : 'Expense';
    const desc = String(item?.desc || 'Untitled');
    const amount = formatBridgePreviewAmount(item?.amt, item?.currency);
    const category = String(item?.category || (item?.type === 'income' ? 'Salary' : 'Others'));
    const date = new Date(item?.date || Date.now()).toLocaleDateString();
    return `${type} • ${amount} • ${desc} • ${category} • ${date}`;
}

function promptBridgeImportConfirmation(pendingRows) {
    const rows = Array.isArray(pendingRows) ? pendingRows : [];
    if (rows.length === 0) return Promise.resolve(false);

    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.style.cssText = [
            'position:fixed',
            'inset:0',
            'z-index:5000',
            'background:rgba(2, 6, 23, 0.76)',
            'backdrop-filter:blur(4px)',
            'display:flex',
            'align-items:center',
            'justify-content:center',
            'padding:16px'
        ].join(';');

        const card = document.createElement('div');
        card.style.cssText = [
            'width:min(560px, 96vw)',
            'max-height:80vh',
            'overflow:hidden',
            'background:#ffffff',
            'border-radius:18px',
            'border:1px solid #e2e8f0',
            'box-shadow:0 20px 45px rgba(15, 23, 42, 0.35)',
            'display:flex',
            'flex-direction:column'
        ].join(';');

        const header = document.createElement('div');
        header.style.cssText = 'padding:16px 18px 12px;border-bottom:1px solid #e2e8f0;';
        const title = document.createElement('h3');
        title.style.cssText = 'margin:0;font-size:18px;font-weight:700;color:#0f172a;';
        title.innerText = 'Import staged transactions?';
        const subtitle = document.createElement('p');
        subtitle.style.cssText = 'margin:8px 0 0;font-size:13px;color:#475569;';
        subtitle.innerText = `${rows.length} pending transaction(s) were captured on the main page.`;
        header.appendChild(title);
        header.appendChild(subtitle);

        const listWrap = document.createElement('div');
        listWrap.style.cssText = 'padding:12px 18px;overflow:auto;display:flex;flex-direction:column;gap:8px;';
        rows.slice(0, 8).forEach((item) => {
            const rowEl = document.createElement('div');
            rowEl.style.cssText = 'padding:10px 12px;border:1px solid #e2e8f0;border-radius:10px;background:#f8fafc;font-size:12px;color:#1e293b;';
            rowEl.innerText = summarizeBridgePreviewItem(item);
            listWrap.appendChild(rowEl);
        });
        if (rows.length > 8) {
            const more = document.createElement('div');
            more.style.cssText = 'font-size:12px;color:#64748b;';
            more.innerText = `+ ${rows.length - 8} more staged transaction(s)`;
            listWrap.appendChild(more);
        }

        const footer = document.createElement('div');
        footer.style.cssText = 'padding:12px 18px;border-top:1px solid #e2e8f0;display:flex;justify-content:flex-end;gap:10px;';
        const skipBtn = document.createElement('button');
        skipBtn.type = 'button';
        skipBtn.style.cssText = 'padding:10px 14px;border-radius:10px;border:1px solid #cbd5e1;background:#f8fafc;color:#334155;font-weight:600;cursor:pointer;';
        skipBtn.innerText = 'Skip for now';
        const importBtn = document.createElement('button');
        importBtn.type = 'button';
        importBtn.style.cssText = 'padding:10px 14px;border-radius:10px;border:1px solid #4f46e5;background:#4f46e5;color:#fff;font-weight:700;cursor:pointer;';
        importBtn.innerText = 'Import now';

        const cleanup = (result) => {
            document.removeEventListener('keydown', onKeyDown, true);
            if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
            resolve(result);
        };

        const onKeyDown = (event) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                cleanup(false);
            }
        };

        overlay.addEventListener('click', (event) => {
            if (event.target === overlay) cleanup(false);
        });
        skipBtn.addEventListener('click', () => cleanup(false));
        importBtn.addEventListener('click', () => cleanup(true));
        document.addEventListener('keydown', onKeyDown, true);

        footer.appendChild(skipBtn);
        footer.appendChild(importBtn);
        card.appendChild(header);
        card.appendChild(listWrap);
        card.appendChild(footer);
        overlay.appendChild(card);
        document.body.appendChild(overlay);
        importBtn.focus();
    });
}

// --- AUTH & INIT ---
async function unlockApp() {
    const input = document.getElementById('master-key-input').value;
    if (input.length < 1) { alert("Please enter a key."); return; }

    document.getElementById('auth-status').innerText = "Decrypting...";
    await new Promise(r => setTimeout(r, 500));

    masterKey = input;
    const { meta } = await resolveKdfMeta(masterKey);
    kdfMeta = meta;
    cryptoKey = await deriveKey(
        masterKey,
        base64ToBytes(meta.saltB64),
        parseInt(meta.iterations || 310000, 10)
    );

    document.getElementById('auth-status').innerText = "Verifying vault...";
    const db = await getDB();
    const verifyResult = await verifyVaultDecryption(db);
    if (!verifyResult.ok) {
        masterKey = null;
        cryptoKey = null;
        kdfMeta = null;
        document.getElementById('auth-status').innerText = "Unlock failed";
        alert("Could not decrypt existing vault data. This usually means the key is incorrect or vault metadata is missing.");
        return;
    }

    await updateExchangeRates();
    let bridgePendingRows = [];
    let shouldImportBridgeRows = true;
    try {
        const bridge = (typeof window !== 'undefined') ? window.FinanceBridgeQueue : null;
        if (bridge && typeof bridge.listFinancePendingTransactions === 'function') {
            bridgePendingRows = await bridge.listFinancePendingTransactions();
            if (Array.isArray(bridgePendingRows) && bridgePendingRows.length > 0) {
                document.getElementById('auth-status').innerText = `Found ${bridgePendingRows.length} staged transaction(s)...`;
                shouldImportBridgeRows = await promptBridgeImportConfirmation(bridgePendingRows);
            }
        }
    } catch (error) {
        console.error('[bridge-import] Failed to build preview:', error);
        bridgePendingRows = [];
        shouldImportBridgeRows = false;
    }

    let bridgeImportSummary = null;
    try {
        if (
            shouldImportBridgeRows &&
            Array.isArray(bridgePendingRows) &&
            bridgePendingRows.length > 0 &&
            typeof importPendingMainTransactionsIntoFinance === 'function'
        ) {
            document.getElementById('auth-status').innerText = "Importing staged transactions...";
            bridgeImportSummary = await importPendingMainTransactionsIntoFinance(bridgePendingRows);
        } else if (Array.isArray(bridgePendingRows) && bridgePendingRows.length > 0 && !shouldImportBridgeRows) {
            bridgeImportSummary = {
                checked: bridgePendingRows.length,
                imported: 0,
                skipped: 0,
                failed: 0,
                cleared: 0,
                saveFailed: false,
                skippedByUser: true
            };
        }
    } catch (error) {
        console.error('[bridge-import] Import attempt failed:', error);
        bridgeImportSummary = null;
    }

    document.getElementById('auth-overlay').classList.add('hidden');
    document.getElementById('main-content').classList.remove('opacity-0');

    initFilters();
    initChart();
    await loadFromStorage();  // ← Added 'await' here

    if (bridgeImportSummary && bridgeImportSummary.checked > 0 && typeof showToast === 'function') {
        if (bridgeImportSummary.skippedByUser) {
            showToast(`Bridge import skipped • ${bridgeImportSummary.checked} staged transaction(s) remain queued`);
        }
        const parts = [];
        if (bridgeImportSummary.imported > 0) {
            parts.push(`Imported ${bridgeImportSummary.imported}`);
        }
        if (bridgeImportSummary.skipped > 0) {
            parts.push(`Skipped ${bridgeImportSummary.skipped} duplicate`);
        }
        if (bridgeImportSummary.failed > 0) {
            parts.push(`Kept ${bridgeImportSummary.failed} invalid`);
        }
        if (bridgeImportSummary.saveFailed) {
            parts.push('Save failed, queue retained');
        }
        if (parts.length > 0) {
            showToast(`Bridge import: ${parts.join(' • ')}`);
        }
    }

    // Check for auto-backup
    await checkAndPerformAutoBackup();
    checkRecurringReminders();

    try {
        const latestDBForProbe = await getDB();
        if (!isEncryptedVaultPayload(latestDBForProbe.vault_probe)) {
            ensureVaultProbe(latestDBForProbe).catch(err => console.error('Failed to persist vault probe', err));
        }
    } catch (error) {
        console.error('Failed to load latest DB for vault probe', error);
    }

    // Setup hourly check for auto-backup (in case app stays open past 8 PM)
    setInterval(checkAndPerformAutoBackup, 60 * 60 * 1000); // Every hour
}  // ← Make sure this closing brace is here!

async function loadFromStorage() {
    const db = await getDB();

    const runLoadStep = async (label, fn) => {
        try {
            await fn();
        } catch (err) {
            console.error(`Load step failed: ${label}`, err);
        }
    };

    recurringTransactions = db.recurring_transactions || [];
    rawTransactions = (db.transactions || []).filter(t => !t.deletedAt);
    await loadAndRender();

    rawBills = (db.bills || []).filter(b => !b.deletedAt);
    rawDebts = (db.debts || []).filter(d => !d.deletedAt);
    rawLent = (db.lent || []).filter(l => !l.deletedAt);
    rawWishlist = (db.wishlist || []).filter(w => !w.deletedAt);
    rawCrypto = (db.crypto || []).filter(c => !c.deletedAt);
    cryptoPrices = db.crypto_prices || {};
    cryptoInterestByToken = db.crypto_interest || {};
    if (typeof invalidateCryptoComputationCache === 'function') {
        invalidateCryptoComputationCache();
    }

    await runLoadStep('bills', async () => renderBills(rawBills));
    await runLoadStep('debts', async () => renderDebts(rawDebts));
    await runLoadStep('lent', async () => renderLent(rawLent));
    await runLoadStep('wishlist', async () => loadAndRenderWishlist());
    await runLoadStep('assets', async () => { if (typeof renderAssets === 'function') await renderAssets() });
    await runLoadStep('crypto-widget', async () => renderCryptoWidget());
    // AUTO-SYNC: Sync all bills to reminders on load
    await runLoadStep('sync-bills-reminders', async () => syncAllBillsToReminders());

    if (db.budgets && db.budgets.data) {
        budgets = await decryptData(db.budgets.data) || {};
    } else {
        budgets = {};
    }
    customCategories = db.custom_categories || [];
    investmentGoals = db.investment_goals || [];
    categorizationRules = db.categorization_rules || [];
    financialGoals = db.goals || [];
    importsLog = db.imports || [];
    monthlyCloseRecords = db.monthly_closes || [];
    kpiTargets = db.kpi_targets || (typeof getDefaultKpiTargets === 'function' ? getDefaultKpiTargets() : {});
    kpiSnapshots = db.kpi_snapshots || [];
    forecastAssumptions = db.forecast_assumptions || {};
    forecastRuns = db.forecast_runs || [];
    statementSnapshots = db.statement_snapshots || [];
    operationsGuardrails = db.operations_guardrails || {};
    undoLog = db.undo_log || [];
    checkRecurringReminders();
    renderBudgets(window.allDecryptedTransactions || []);
    if (typeof renderInsightsPanel === 'function') renderInsightsPanel();
    if (typeof renderGoalsAndSimulator === 'function') renderGoalsAndSimulator();
    if (typeof refreshMonthlyCloseUI === 'function') {
        await runLoadStep('monthly-close', async () => refreshMonthlyCloseUI());
    }
    if (typeof refreshBusinessKPIPanel === 'function') {
        await runLoadStep('business-kpi', async () => refreshBusinessKPIPanel());
    }
    if (typeof refreshForecastModuleUI === 'function') {
        await runLoadStep('forecast-module', async () => refreshForecastModuleUI());
    }
    if (typeof refreshStatementsModuleUI === 'function') {
        await runLoadStep('statements-module', async () => refreshStatementsModuleUI());
    }
    if (typeof refreshStorageDiagnosticsPanel === 'function') {
        await runLoadStep('storage-diagnostics', async () => refreshStorageDiagnosticsPanel());
    }
}
