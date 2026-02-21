        // =============================================
        // SECTION 1: CONFIGURATION & STATE
        // =============================================
        const appId = 'personal-finance-sync-v1';
        // Firebase Configuration
        const firebaseConfig = {
            apiKey: "AIzaSyA0w6s-PQ4wurNbi4gvvgGbh7b8HfR1P7U",
            authDomain: "financeflow-vault-fe6d2.firebaseapp.com",
            projectId: "financeflow-vault-fe6d2",
            storageBucket: "financeflow-vault-fe6d2.firebasestorage.app",
            messagingSenderId: "163555840928",
            appId: "1:163555840928:web:ead72c1ba691a6d002cac5"
        };

        // Initialize Firebase
        firebase.initializeApp(firebaseConfig);
        const firestoreDB = firebase.firestore();

        let masterKey = null;
        let cryptoKey = null;
        let kdfMeta = null;
        let activeCurrency = 'PHP';
        let exchangeRates = {
            PHP: 1,
            USD: 0.018,
            JPY: 2.6
        };

        // Data Containers
        let rawTransactions = [];
        let rawBills = [];
        let rawDebts = [];
        let rawLent = [];
        let rawCrypto = [];
        let rawWishlist = [];
        let cryptoPrices = {}; // { 'bitcoin': { price: 5000000, updated: 123456789 } }
        let budgets = {};
        let recurringTransactions = [];
        let customCategories = [];
        let categorizationRules = [];
        let financialGoals = [];
        let importsLog = [];
        let undoLog = [];
        let metricScope = 'selected_period';
        let spendChart = null;
        let cryptoAllocationChart = null;
        let scenarioChart = null;
        let investmentGoals = [];  // Array of { id, name, targetAmount, targetDate, createdAt }
        let cryptoInterestByToken = {}; // { tokenId: { enabled, rewards: [{ tokenId, symbol, amount }], lastModified } }
        let filteredTransactions = [];

        const standardCategories = ["Food", "Transport", "Bills", "Savings", "Entertainment", "Salary", "Others"];

        function escapeHTML(value) {
            return String(value ?? '')
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        }

        function escapeAttr(value) {
            return escapeHTML(value).replace(/`/g, '&#96;');
        }

        function encodeInlineArg(value) {
            return encodeURIComponent(String(value ?? ''));
        }
