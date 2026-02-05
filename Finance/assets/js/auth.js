        // =============================================
        // SECTION 3: AUTHENTICATION & ENCRYPTION
        // =============================================
        async function deriveKey(password, salt) {
            const enc = new TextEncoder();
            const keyMaterial = await window.crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveKey"]);
            return window.crypto.subtle.deriveKey(
                { name: "PBKDF2", salt: salt, iterations: 100000, hash: "SHA-256" },
                keyMaterial, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]
            );
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
            cryptoKey = await deriveKey(masterKey, new TextEncoder().encode("finance-flow-salt-v3"));

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

            rawTransactions = db.transactions || [];
            await loadAndRender();

            rawBills = db.bills || [];
            await renderBills(rawBills);
            // AUTO-SYNC: Sync all bills to reminders on load
            await syncAllBillsToReminders();

            rawDebts = db.debts || [];
            await renderDebts(rawDebts);

            rawLent = db.lent || [];
            await renderLent(rawLent);

            rawWishlist = db.wishlist || [];
            await loadAndRenderWishlist();

            // Crypto Loading
            rawCrypto = db.crypto || [];
            // We store crypto prices unencrypted usually for cache, but let's assume they are just a plain object in DB for simplicity
            // If they were encrypted, we'd decrypt here. Let's assume plain for cache speed.
            cryptoPrices = db.crypto_prices || {};
            await renderCryptoWidget();

            if (db.budgets && db.budgets.data) {
                budgets = await decryptData(db.budgets.data) || {};
            } else {
                budgets = {};
            }
            customCategories = db.custom_categories || [];
            investmentGoals = db.investment_goals || [];
            recurringTransactions = db.recurring_transactions || [];
            checkRecurringReminders();
            renderBudgets(window.allDecryptedTransactions || []);
        }
