(function () {
    function createPreviewRandom(seed) {
        let state = seed >>> 0;
        return function next() {
            state = (state * 1664525 + 1013904223) >>> 0;
            return state / 4294967296;
        };
    }

    function previewPick(rand, items) {
        return items[Math.floor(rand() * items.length)] || items[0];
    }

    function previewNumber(rand, min, max, decimals = 2) {
        const raw = min + ((max - min) * rand());
        return Number(raw.toFixed(decimals));
    }

    function previewBool(rand, threshold = 0.5) {
        return rand() < threshold;
    }

    function previewDateDaysAgo(daysAgo, rand) {
        const date = new Date();
        date.setHours(9 + Math.floor(rand() * 9), Math.floor(rand() * 60), 0, 0);
        date.setDate(date.getDate() - daysAgo);
        return date.toISOString();
    }

    function previewDateDaysAhead(daysAhead) {
        const date = new Date();
        date.setHours(12, 0, 0, 0);
        date.setDate(date.getDate() + daysAhead);
        return date.toISOString().split('T')[0];
    }

    function previewToday() {
        return new Date().toISOString().split('T')[0];
    }

    function createPreviewIdFactory() {
        let counter = 0;
        return function makeId(prefix) {
            counter += 1;
            return `preview_${prefix}_${counter}`;
        };
    }

    function createPreviewEncryptedEntry(makeId, prefix, data, isoDate) {
        const timestamp = Date.parse(isoDate) || Date.now();
        return {
            id: makeId(prefix),
            data: createPreviewVaultPayload(data),
            deletedAt: null,
            createdAt: isoDate,
            lastModified: timestamp
        };
    }

    function buildFinancePreviewDB(seed = Date.now()) {
        const rand = createPreviewRandom(seed);
        const makeId = createPreviewIdFactory();
        const now = Date.now();
        const db = getDefaultDB();

        db.sync.updatedAt = new Date(now).toISOString();
        db.custom_categories = ['Software', 'Health', 'Travel', 'Coffee', 'Gear', 'Business Ops'];
        db.kpi_targets = {
            ...getDefaultKpiTargets(),
            savingsRatePct: 24,
            runwayDays: 120,
            maxOverBudgetCategories: 2,
            lastModified: now
        };
        db.forecast_assumptions = {
            ...getDefaultForecastAssumptions(),
            months: 12,
            incomeBase: 72000,
            fixedCostsBase: 28500,
            variableCostsBase: 16800,
            investmentBase: 9500,
            lastModified: now
        };
        db.operations_guardrails = {
            ...getDefaultOperationsGuardrails(),
            incomeVarianceWarnPct: 10,
            outflowVarianceWarnPct: 14,
            cashFloor: 25000,
            lastModified: now
        };

        const primaryCardId = makeId('cc');
        const primaryCardName = 'Aurora Rewards';
        const primaryCardCreatedAt = previewDateDaysAgo(120, rand);
        const backupCardId = makeId('cc');
        const backupCardName = 'Transit Visa';
        const backupCardCreatedAt = previewDateDaysAgo(84, rand);

        const transactionTemplates = [
            ['Client Retainer', 'Salary', 'income', 2],
            ['Marketplace Payout', 'Freelance', 'income', 6],
            ['Course Sale', 'Freelance', 'income', 18],
            ['Apartment Rent', 'Bills', 'expense', 3],
            ['Fiber Internet', 'Bills', 'expense', 9],
            ['Groceries Run', 'Food', 'expense', 4],
            ['Grab Commute', 'Transport', 'expense', 5],
            ['Coffee Beans', 'Coffee', 'expense', 8],
            ['Adobe CC', 'Software', 'expense', 12],
            ['Pharmacy Run', 'Health', 'expense', 16],
            ['Weekend Dinner', 'Entertainment', 'expense', 11],
            ['Emergency Fund Transfer', 'Savings', 'expense', 7],
            ['Flight to Cebu', 'Travel', 'expense', 28],
            ['Laptop Installment Payment', 'Laptop Installment', 'expense', 14],
            ['Family Loan Payment', 'Family Loan', 'expense', 20],
            ['Lent to Alex', 'Lent: Alex', 'expense', 24],
            ['Alex Partial Repayment', 'Lent: Alex', 'income', 10],
            ['Project Float Advance', 'Lent: Project Float', 'expense', 34],
            ['Business Ops Toolkit', 'Business Ops', 'expense', 22]
        ];

        const monthlyIncomeBase = previewNumber(rand, 66000, 74000);
        const monthlyExpenseRanges = {
            Salary: [monthlyIncomeBase, monthlyIncomeBase + 4000],
            Freelance: [4500, 16000],
            Bills: [1200, 18500],
            Food: [1200, 3800],
            Transport: [250, 1200],
            Coffee: [180, 720],
            Software: [950, 3200],
            Health: [600, 2400],
            Entertainment: [700, 2600],
            Savings: [5000, 14000],
            Travel: [6000, 18000],
            'Laptop Installment': [2800, 4200],
            'Family Loan': [1200, 2600],
            'Lent: Alex': [2500, 6000],
            'Lent: Project Float': [3000, 7000],
            'Business Ops': [1400, 4800]
        };

        for (let monthOffset = 0; monthOffset < 3; monthOffset += 1) {
            transactionTemplates.forEach(([desc, category, type, baseDaysAgo], index) => {
                const daysAgo = baseDaysAgo + (monthOffset * 30) + Math.floor(rand() * 3);
                const range = monthlyExpenseRanges[category] || [800, 2500];
                const amount = previewNumber(rand, range[0], range[1], 2);
                const date = previewDateDaysAgo(daysAgo, rand);
                db.transactions.push(createPreviewEncryptedEntry(makeId, 'tx', {
                    desc,
                    amt: amount,
                    category,
                    type,
                    date,
                    notes: index % 4 === 0 ? 'Preview sample item' : ''
                }, date));
            });
        }

        const debtOriginDate = previewDateDaysAgo(95, rand);
        db.transactions.push(createPreviewEncryptedEntry(makeId, 'tx', {
            desc: 'Laptop Financing Approved',
            amt: 42000,
            category: 'Laptop Installment',
            type: 'debt_increase',
            date: debtOriginDate,
            notes: 'Preview debt source'
        }, debtOriginDate));

        const familyDebtOriginDate = previewDateDaysAgo(72, rand);
        db.transactions.push(createPreviewEncryptedEntry(makeId, 'tx', {
            desc: 'Family Loan Received',
            amt: 18000,
            category: 'Family Loan',
            type: 'debt_increase',
            date: familyDebtOriginDate,
            notes: 'Preview debt source'
        }, familyDebtOriginDate));

        const hotelChargeDate = previewDateDaysAgo(26, rand);
        db.transactions.push(createPreviewEncryptedEntry(makeId, 'tx', {
            desc: 'Conference Hotel Deposit',
            amt: 12850,
            category: 'Travel',
            type: 'expense',
            paymentSource: 'credit_card',
            creditCardId: primaryCardId,
            creditCardName: primaryCardName,
            date: hotelChargeDate,
            notes: 'Preview credit card charge'
        }, hotelChargeDate));

        const gearChargeDate = previewDateDaysAgo(12, rand);
        db.transactions.push(createPreviewEncryptedEntry(makeId, 'tx', {
            desc: 'Wireless Headphones',
            amt: 6400,
            category: 'Gear',
            type: 'expense',
            paymentSource: 'credit_card',
            creditCardId: primaryCardId,
            creditCardName: primaryCardName,
            date: gearChargeDate,
            notes: 'Preview credit card charge'
        }, gearChargeDate));

        const commuteChargeDate = previewDateDaysAgo(18, rand);
        db.transactions.push(createPreviewEncryptedEntry(makeId, 'tx', {
            desc: 'Ride Share Bundle',
            amt: 1850,
            category: 'Transport',
            type: 'expense',
            paymentSource: 'credit_card',
            creditCardId: backupCardId,
            creditCardName: backupCardName,
            date: commuteChargeDate,
            notes: 'Preview backup card charge'
        }, commuteChargeDate));

        const primaryPaymentDate = previewDateDaysAgo(5, rand);
        db.transactions.push(createPreviewEncryptedEntry(makeId, 'tx', {
            desc: `Payment for ${primaryCardName}`,
            amt: 5000,
            category: primaryCardName,
            type: 'credit_card_payment',
            paymentSource: 'cash',
            creditCardId: primaryCardId,
            creditCardName: primaryCardName,
            date: primaryPaymentDate,
            notes: 'Preview card payment'
        }, primaryPaymentDate));

        const billDefinitions = [
            ['Apartment Rent', 5, 18000, false],
            ['Fiber Internet', 8, 1899, false],
            ['Adobe CC', 14, 1550, false],
            ['Server Hosting', 22, 2490, true]
        ];
        billDefinitions.forEach(([name, day, amt, paused]) => {
            const createdAt = previewDateDaysAgo(40 + day, rand);
            db.bills.push(createPreviewEncryptedEntry(makeId, 'bill', {
                name,
                day,
                amt,
                paused
            }, createdAt));
        });

        [
            ['Laptop Installment', 42000],
            ['Family Loan', 18000]
        ].forEach(([name, amount]) => {
            const createdAt = previewDateDaysAgo(90, rand);
            db.debts.push(createPreviewEncryptedEntry(makeId, 'debt', {
                name,
                amount
            }, createdAt));
        });

        db.credit_cards.push({
            id: primaryCardId,
            data: createPreviewVaultPayload({
                name: primaryCardName,
                last4: '4242',
                limit: 65000,
                openingBalance: 3200,
                paymentDueDay: 14,
                paymentReminderPaused: false
            }),
            deletedAt: null,
            createdAt: primaryCardCreatedAt,
            lastModified: Date.parse(primaryCardCreatedAt) || now
        });

        db.credit_cards.push({
            id: backupCardId,
            data: createPreviewVaultPayload({
                name: backupCardName,
                last4: '1010',
                limit: 24000,
                openingBalance: 900,
                paymentDueDay: 22,
                paymentReminderPaused: false
            }),
            deletedAt: null,
            createdAt: backupCardCreatedAt,
            lastModified: Date.parse(backupCardCreatedAt) || now
        });

        [
            ['Alex', 6000],
            ['Project Float', 4800]
        ].forEach(([name, amount]) => {
            const createdAt = previewDateDaysAgo(36, rand);
            db.lent.push(createPreviewEncryptedEntry(makeId, 'lent', {
                name,
                amount
            }, createdAt));
        });

        const wishlistItems = [
            ['Standing Desk', 9500, 'Gear', 45],
            ['Weekend Getaway', 12000, 'Travel', 32],
            ['Camera Lens', 28500, 'Gear', 60]
        ];
        wishlistItems.forEach(([desc, amt, category, daysAhead]) => {
            const createdAt = previewDateDaysAgo(12 + Math.floor(rand() * 12), rand);
            db.wishlist.push(createPreviewEncryptedEntry(makeId, 'wish', {
                desc,
                amt,
                category,
                targetDate: previewDateDaysAhead(daysAhead),
                notes: 'Preview wishlist'
            }, createdAt));
        });

        db.budgets = {
            data: createPreviewVaultPayload({
                Food: 12000,
                Transport: 6500,
                Bills: 28500,
                Entertainment: 5000,
                Savings: 16000,
                Software: 3500,
                Health: 4500,
                Travel: 7000
            })
        };

        db.recurring_transactions = [
            {
                id: makeId('rec'),
                desc: 'Weekly Market Run',
                type: 'expense',
                frequency: 'weekly',
                category: 'Food',
                dayOfWeek: 6,
                dayOfMonth: null,
                estimatedAmount: 2200,
                linkedBillId: null,
                lastDismissed: null,
                createdAt: previewDateDaysAgo(20, rand),
                paused: false,
                autoSynced: false
            },
            {
                id: makeId('rec'),
                desc: 'Emergency Fund Transfer',
                type: 'expense',
                frequency: 'monthly',
                category: 'Savings',
                dayOfWeek: null,
                dayOfMonth: 25,
                estimatedAmount: 8000,
                linkedBillId: null,
                lastDismissed: null,
                createdAt: previewDateDaysAgo(30, rand),
                paused: false,
                autoSynced: false
            }
        ];

        db.goals = [
            {
                id: makeId('goal'),
                type: 'emergency_fund',
                name: 'Emergency Fund',
                targetAmount: 180000,
                targetDate: previewDateDaysAhead(180),
                linkedCategory: 'Savings',
                status: 'active',
                createdAt: previewDateDaysAgo(70, rand),
                lastModified: now
            },
            {
                id: makeId('goal'),
                type: 'travel',
                name: 'Japan Trip',
                targetAmount: 95000,
                targetDate: previewDateDaysAhead(260),
                linkedCategory: 'Travel',
                status: 'active',
                createdAt: previewDateDaysAgo(45, rand),
                lastModified: now
            }
        ];

        db.investment_goals = [
            {
                id: makeId('invest_goal'),
                name: 'Crypto Buffer',
                targetAmount: 25000,
                targetDate: previewDateDaysAhead(150),
                createdAt: previewDateDaysAgo(20, rand)
            },
            {
                id: makeId('invest_goal'),
                name: 'Long-Term Stack',
                targetAmount: 40000,
                targetDate: previewDateDaysAhead(260),
                createdAt: previewDateDaysAgo(10, rand)
            }
        ];

        db.fixed_assets = [
            {
                id: makeId('asset'),
                name: 'MacBook Pro',
                value: 98000,
                lifespan: 36,
                purchaseDate: previewDateDaysAgo(220, rand).split('T')[0],
                createdAt: previewDateDaysAgo(220, rand),
                lastModified: now,
                deletedAt: null
            },
            {
                id: makeId('asset'),
                name: 'Sony Camera',
                value: 45000,
                lifespan: 48,
                purchaseDate: previewDateDaysAgo(420, rand).split('T')[0],
                createdAt: previewDateDaysAgo(420, rand),
                lastModified: now,
                deletedAt: null
            }
        ];

        const btcLotOne = { amount: 0.0001203, total: 1000, date: previewDateDaysAgo(75, rand) };
        const btcLotTwo = { amount: 0.00018045, total: 1500, date: previewDateDaysAgo(44, rand) };
        const btcPrice = Number((btcLotOne.total / btcLotOne.amount).toFixed(2));
        const btcPrice2 = Number((btcLotTwo.total / btcLotTwo.amount).toFixed(2));
        const btcTotalAmount = Number((btcLotOne.amount + btcLotTwo.amount).toFixed(8));
        const solReceivedAmount = 15.02034056;
        const ethBuyAmount = 0.0145006;
        const ethBuyTotal = 3500;
        const ethBuyPrice = Number((ethBuyTotal / ethBuyAmount).toFixed(2));
        const ethSellAmount = 0.0045002;
        const ethSellPrice = 288777.42;
        const ethSellTotal = Number((ethSellAmount * ethSellPrice).toFixed(2));
        const adaBuyAmount = 120.3400567;
        const adaBuyTotal = 4200;
        const adaBuyPrice = Number((adaBuyTotal / adaBuyAmount).toFixed(8));
        const swapId = makeId('swap');

        const btcBuyDateOne = previewDateDaysAgo(75, rand);
        const btcBuyDateTwo = previewDateDaysAgo(44, rand);
        const swapDate = previewDateDaysAgo(21, rand);
        const ethBuyDate = previewDateDaysAgo(38, rand);
        const ethSellDate = previewDateDaysAgo(8, rand);
        const adaBuyDate = previewDateDaysAgo(27, rand);
        const solAirdropDate = previewDateDaysAgo(14, rand);

        db.crypto.push(createPreviewEncryptedEntry(makeId, 'crypto', {
            tokenId: 'bitcoin',
            symbol: 'BTC',
            amount: btcLotOne.amount,
            price: btcPrice,
            currency: 'PHP',
            phpPrice: btcPrice,
            phpTotal: btcLotOne.total,
            total: btcLotOne.total,
            type: 'buy',
            exchange: 'PreviewX',
            strategy: 'DCA',
            notes: 'Preview BTC lot 1',
            date: btcBuyDateOne
        }, btcBuyDateOne));

        db.crypto.push(createPreviewEncryptedEntry(makeId, 'crypto', {
            tokenId: 'bitcoin',
            symbol: 'BTC',
            amount: btcLotTwo.amount,
            price: btcPrice2,
            currency: 'PHP',
            phpPrice: btcPrice2,
            phpTotal: btcLotTwo.total,
            total: btcLotTwo.total,
            type: 'buy',
            exchange: 'PreviewX',
            strategy: 'DCA',
            notes: 'Preview BTC lot 2',
            date: btcBuyDateTwo
        }, btcBuyDateTwo));

        db.crypto.push(createPreviewEncryptedEntry(makeId, 'crypto', {
            tokenId: 'bitcoin',
            symbol: 'BTC',
            amount: btcTotalAmount,
            price: 0,
            currency: 'PHP',
            phpPrice: 0,
            phpTotal: 0,
            total: 0,
            type: 'swap_out',
            swapId,
            linkedToken: 'SOL',
            exchange: 'PreviewX',
            strategy: 'Rotation',
            notes: 'Preview swap out',
            date: swapDate
        }, swapDate));

        db.crypto.push(createPreviewEncryptedEntry(makeId, 'crypto', {
            tokenId: 'solana',
            symbol: 'SOL',
            amount: solReceivedAmount,
            price: 0,
            currency: 'PHP',
            phpPrice: 0,
            phpTotal: 0,
            total: 0,
            type: 'swap_in',
            swapId,
            linkedToken: 'BTC',
            exchange: 'PreviewX',
            strategy: 'Rotation',
            notes: 'Preview swap in',
            date: swapDate
        }, swapDate));

        db.crypto.push(createPreviewEncryptedEntry(makeId, 'crypto', {
            tokenId: 'solana',
            symbol: 'SOL',
            amount: 1.125,
            price: 0,
            currency: 'PHP',
            phpPrice: 0,
            phpTotal: 0,
            total: 0,
            type: 'airdrop',
            exchange: 'PreviewX',
            strategy: 'Reward',
            notes: 'Preview SOL airdrop',
            date: solAirdropDate
        }, solAirdropDate));

        db.crypto.push(createPreviewEncryptedEntry(makeId, 'crypto', {
            tokenId: 'ethereum',
            symbol: 'ETH',
            amount: ethBuyAmount,
            price: ethBuyPrice,
            currency: 'PHP',
            phpPrice: ethBuyPrice,
            phpTotal: ethBuyTotal,
            total: ethBuyTotal,
            type: 'buy',
            exchange: 'PreviewX',
            strategy: 'Swing',
            notes: 'Preview ETH buy',
            date: ethBuyDate
        }, ethBuyDate));

        db.crypto.push(createPreviewEncryptedEntry(makeId, 'crypto', {
            tokenId: 'ethereum',
            symbol: 'ETH',
            amount: ethSellAmount,
            price: ethSellPrice,
            currency: 'PHP',
            phpPrice: ethSellPrice,
            phpTotal: ethSellTotal,
            total: ethSellTotal,
            type: 'sell',
            exchange: 'PreviewX',
            strategy: 'Profit take',
            notes: 'Preview ETH sell',
            date: ethSellDate
        }, ethSellDate));

        db.crypto.push(createPreviewEncryptedEntry(makeId, 'crypto', {
            tokenId: 'cardano',
            symbol: 'ADA',
            amount: adaBuyAmount,
            price: adaBuyPrice,
            currency: 'PHP',
            phpPrice: adaBuyPrice,
            phpTotal: adaBuyTotal,
            total: adaBuyTotal,
            type: 'buy',
            exchange: 'PreviewX',
            strategy: 'Core',
            notes: 'Preview ADA buy',
            date: adaBuyDate
        }, adaBuyDate));

        db.crypto_prices = {
            bitcoin: { price: 5400000, updated: now },
            solana: { price: 185.25, updated: now },
            ethereum: { price: 302500, updated: now },
            cardano: { price: 41.85, updated: now }
        };

        db.crypto_interest = {
            solana: {
                enabled: true,
                rewards: [
                    { tokenId: 'solana', symbol: 'SOL', amount: 0.32045012 }
                ],
                lastModified: now
            }
        };

        return normalizeDBSchema(db);
    }

    function updatePreviewModeBanner() {
        const banner = document.getElementById('preview-mode-banner');
        const label = document.getElementById('preview-mode-label');
        if (!banner) return;

        if (!previewMode) {
            banner.classList.add('hidden');
            return;
        }

        banner.classList.remove('hidden');
        if (label) {
            label.innerText = previewSessionLabel
                ? `Demo data only • ${previewSessionLabel}`
                : 'Demo data only';
        }
    }

    async function enterPreviewMode() {
        const authStatusEl = document.getElementById('auth-status');
        try {
            if (authStatusEl) authStatusEl.innerText = 'Loading preview...';

            previewSessionLabel = `Sample generated ${new Date().toLocaleString()}`;
            previewDBSnapshot = buildFinancePreviewDB(Date.now());
            previewMode = true;
            masterKey = null;
            cryptoKey = null;
            kdfMeta = null;

            document.getElementById('auth-overlay')?.classList.add('hidden');
            document.getElementById('main-content')?.classList.remove('opacity-0');
            updatePreviewModeBanner();
        } catch (error) {
            console.error('Preview mode failed to load.', error);
            previewMode = false;
            previewDBSnapshot = null;
            previewSessionLabel = '';
            updatePreviewModeBanner();
            if (authStatusEl) authStatusEl.innerText = 'Preview failed';
            alert('Could not load preview mode.');
            return;
        }

        let hadSoftLoadIssue = false;

        try {
            if (typeof initFilters === 'function') initFilters();
            if (!spendChart && typeof initChart === 'function') initChart();
            await loadFromStorage();
        } catch (error) {
            hadSoftLoadIssue = true;
            console.error('Preview mode loaded with follow-up UI issues.', error);
        }

        try {
            if (window.lucide) window.lucide.createIcons();
        } catch (error) {
            hadSoftLoadIssue = true;
            console.error('Preview mode icon refresh failed.', error);
        }

        try {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        } catch (_) { }

        if (authStatusEl) authStatusEl.innerText = 'Preview ready';
        if (typeof showToast === 'function') {
            showToast(
                hadSoftLoadIssue
                    ? 'Preview opened. A few non-critical UI modules were skipped.'
                    : 'Preview mode loaded. Demo data stays only in this tab.'
            );
        }
    }

    function refreshFinancePreview() {
        enterPreviewMode();
    }

    function exitPreviewMode() {
        window.location.reload();
    }

    window.enterPreviewMode = enterPreviewMode;
    window.refreshFinancePreview = refreshFinancePreview;
    window.exitPreviewMode = exitPreviewMode;
})();
