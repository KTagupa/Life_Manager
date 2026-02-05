        // =============================================
        // SECTION 2: DATABASE & STORAGE
        // =============================================
        const DB_KEY = 'finance_flow_encrypted_v3';

        const BACKUP_SETTINGS_KEY = 'finance_flow_backup_settings_v1';

        // Default backup settings
        function getBackupSettings() {
            const str = localStorage.getItem(BACKUP_SETTINGS_KEY);
            return str ? JSON.parse(str) : {
                autoBackupEnabled: true,
                backupHour: 20, // 8 PM
                lastBackupDate: null,
                lastBackupTime: null
            };
        }

        function saveBackupSettings(settings) {
            localStorage.setItem(BACKUP_SETTINGS_KEY, JSON.stringify(settings));
        }

        async function getDB() {
            // Try Firebase first
            try {
                if (masterKey && firestoreDB) {
                    const vaultId = await getVaultId(masterKey);
                    const doc = await firestoreDB.collection('vaults').doc(vaultId).get();

                    if (doc.exists) {
                        console.log('✅ Loaded from Firebase');
                        return doc.data().vaultData || { transactions: [], bills: [], debts: [], lent: [], crypto: [], crypto_prices: {}, wishlist: [], budgets: { data: null }, custom_categories: [] };
                    }
                }
            } catch (error) {
                console.error('Firebase load failed, using localStorage:', error);
            }

            // Fallback to localStorage
            const str = localStorage.getItem(DB_KEY);
            return str ? JSON.parse(str) : { transactions: [], bills: [], debts: [], lent: [], crypto: [], crypto_prices: {}, wishlist: [], budgets: { data: null }, custom_categories: [] };
        }

        async function saveDB(db) {
            // Save to localStorage first (instant backup)
            localStorage.setItem(DB_KEY, JSON.stringify(db));

            // Then sync to Firebase
            try {
                if (masterKey && firestoreDB) {
                    const vaultId = await getVaultId(masterKey);
                    await firestoreDB.collection('vaults').doc(vaultId).set({
                        vaultData: db,
                        lastModified: firebase.firestore.FieldValue.serverTimestamp()
                    });
                    console.log('✅ Synced to Firebase');
                }
            } catch (error) {
                console.error('❌ Firebase sync failed:', error);
                // Don't throw error - data is still saved locally
            }
        }
