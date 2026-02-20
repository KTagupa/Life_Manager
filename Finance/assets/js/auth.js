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
                }
            } catch (e) {
                console.error('Failed to persist remote KDF metadata', e);
            }
        }

        async function loadRemoteKdfMeta(vaultId) {
            try {
                if (!firestoreDB) return null;
                const doc = await firestoreDB.collection('vault_meta').doc(vaultId).get();
                if (!doc.exists) return null;
                return doc.data()?.kdfMeta || null;
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

            remoteMeta = await loadRemoteKdfMeta(vaultId);

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
                const localRaw = localStorage.getItem(DB_KEY);
                if (localRaw) {
                    existingData = hasVaultData(JSON.parse(localRaw));
                }
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

            await updateExchangeRates();

            document.getElementById('auth-overlay').classList.add('hidden');
            document.getElementById('main-content').classList.remove('opacity-0');

            initFilters();
            initChart();
            await loadFromStorage();  // ← Added 'await' here

            // Check for auto-backup
            await checkAndPerformAutoBackup();
            checkRecurringReminders();

            // Setup hourly check for auto-backup (in case app stays open past 8 PM)
            setInterval(checkAndPerformAutoBackup, 60 * 60 * 1000); // Every hour
        }  // ← Make sure this closing brace is here!

        async function loadFromStorage() {
            const db = await getDB();

            recurringTransactions = db.recurring_transactions || [];
            rawTransactions = (db.transactions || []).filter(t => !t.deletedAt);
            await loadAndRender();

            rawBills = (db.bills || []).filter(b => !b.deletedAt);
            rawDebts = (db.debts || []).filter(d => !d.deletedAt);
            rawLent = (db.lent || []).filter(l => !l.deletedAt);
            rawWishlist = (db.wishlist || []).filter(w => !w.deletedAt);
            rawCrypto = (db.crypto || []).filter(c => !c.deletedAt);
            cryptoPrices = db.crypto_prices || {};
            invalidateCryptoComputationCache();

            await Promise.all([
                renderBills(rawBills),
                renderDebts(rawDebts),
                renderLent(rawLent),
                loadAndRenderWishlist(),
                renderCryptoWidget()
            ]);
            // AUTO-SYNC: Sync all bills to reminders on load
            await syncAllBillsToReminders();

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
            undoLog = db.undo_log || [];
            checkRecurringReminders();
            renderBudgets(window.allDecryptedTransactions || []);
            if (typeof renderInsightsPanel === 'function') renderInsightsPanel();
            if (typeof renderGoalsAndSimulator === 'function') renderGoalsAndSimulator();
        }
