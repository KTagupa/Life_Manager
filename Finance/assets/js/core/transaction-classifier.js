// =============================================
// PHASE 2A: CANONICAL TRANSACTION CLASSIFICATION
// =============================================
// This module is deliberately side-effect free. It interprets existing records
// but does not migrate them or replace any legacy dashboard calculation.

(function exposeFinanceTransactionClassifier(root, factory) {
    const api = factory();

    if (root) {
        root.FINANCE_TRANSACTION_CLASSIFIER_VERSION = api.VERSION;
        root.FINANCE_TRANSACTION_CLASSES = api.FINANCE_TRANSACTION_CLASSES;
        root.inspectFinanceTransactionDate = api.inspectFinanceTransactionDate;
        root.classifyFinanceTransaction = api.classifyFinanceTransaction;
        root.classifyFinanceTransactions = api.classifyFinanceTransactions;
        root.summarizeFinanceClassifications = api.summarizeFinanceClassifications;
        root.validateFinanceTransactionClassifier = api.validate;
    }

    if (typeof module === 'object' && module.exports) {
        module.exports = api;
    }
})(typeof window !== 'undefined' ? window : globalThis, function buildFinanceTransactionClassifier() {
    const VERSION = '1.0.0';

    const FINANCE_TRANSACTION_CLASSES = deepFreeze({
        EARNED_INCOME: 'earned_income',
        OTHER_CASH_IN: 'other_cash_in',
        CASH_CONSUMPTION_PURCHASE: 'cash_consumption_purchase',
        CREDIT_CARD_CONSUMPTION_CHARGE: 'credit_card_consumption_charge',
        CREDIT_CARD_SETTLEMENT: 'credit_card_settlement',
        INSTALLMENT_SETTLEMENT: 'installment_settlement',
        DEBT_SETTLEMENT: 'debt_settlement',
        GENERIC_SETTLEMENT: 'generic_settlement',
        DEBT_CASH_RECEIVED: 'debt_cash_received',
        DEBT_TRACKING_ONLY: 'debt_tracking_only',
        LENDING_ADVANCE: 'lending_advance',
        LENDING_REPAYMENT: 'lending_repayment',
        SAVINGS_TRANSFER: 'savings_transfer',
        OWN_ACCOUNT_TRANSFER: 'own_account_transfer',
        ASSET_ACQUISITION: 'asset_acquisition',
        ASSET_DISPOSAL: 'asset_disposal',
        UNCLASSIFIED: 'unclassified'
    });

    const KNOWN_TYPES = new Set([
        'income',
        'expense',
        'non_income_cash_in',
        'crypto_sell_proceeds',
        'credit_card_payment',
        'installment_payment',
        'debt_increase'
    ]);

    const NON_INCOME_CATEGORIES = new Set([
        'non-income cash in',
        'non income cash in',
        'refund/reimbursement',
        'refund',
        'reimbursement'
    ]);

    const ASSET_ACQUISITION_CATEGORIES = new Set([
        'investment',
        'investments',
        'asset purchase',
        'fixed asset purchase',
        'capital expenditure',
        'capex'
    ]);

    const EXPLICIT_CLASS_ALIASES = deepFreeze({
        earned_income: 'earned_income',
        income: 'earned_income',
        other_cash_in: 'other_cash_in',
        non_income_cash_in: 'other_cash_in',
        consumption: 'consumption',
        consumption_spending: 'consumption',
        settlement: 'settlement',
        debt_settlement: 'debt_settlement',
        transfer: 'transfer',
        savings_transfer: 'savings_transfer',
        asset_acquisition: 'asset_acquisition',
        investment: 'asset_acquisition',
        asset_disposal: 'asset_disposal'
    });

    const NUMERIC_FIELDS = Object.freeze([
        'cashDelta',
        'earnedIncomeDelta',
        'otherCashInDelta',
        'consumptionDelta',
        'financeChargeConsumptionDelta',
        'settlementDelta',
        'transferDelta',
        'assetAcquisitionDelta',
        'assetDisposalProceedsDelta',
        'liabilityDelta',
        'receivableDelta'
    ]);

    function deepFreeze(value) {
        if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
        Object.getOwnPropertyNames(value).forEach(key => deepFreeze(value[key]));
        return Object.freeze(value);
    }

    function normalizeString(value) {
        return String(value ?? '').trim();
    }

    function normalizeToken(value) {
        return normalizeString(value)
            .toLowerCase()
            .replace(/[\s-]+/g, '_')
            .replace(/[^a-z0-9_]/g, '')
            .replace(/_+/g, '_')
            .replace(/^_|_$/g, '');
    }

    function normalizeCategory(value) {
        return normalizeString(value).toLowerCase().replace(/\s+/g, ' ');
    }

    function toPositiveAmount(value) {
        const amount = Number(value);
        return Number.isFinite(amount) && amount > 0 ? amount : 0;
    }

    function createIssue(code, severity, message) {
        return deepFreeze({ code, severity, message });
    }

    function inspectFinanceTransactionDate(value) {
        if (value instanceof Date) {
            if (Number.isFinite(value.getTime())) {
                return { valid: true, dateKey: value.toISOString().slice(0, 10), issue: null };
            }
            return {
                valid: false,
                dateKey: null,
                issue: createIssue('invalid_date', 'error', 'Transaction date is not a valid calendar date.')
            };
        }

        const raw = normalizeString(value);
        if (!raw) {
            return {
                valid: false,
                dateKey: null,
                issue: createIssue('missing_date', 'error', 'Transaction date is required.')
            };
        }

        const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:T|$)/);
        if (isoMatch) {
            const year = Number(isoMatch[1]);
            const month = Number(isoMatch[2]);
            const day = Number(isoMatch[3]);
            const calendarDate = new Date(Date.UTC(year, month - 1, day));
            const calendarMatches = calendarDate.getUTCFullYear() === year
                && calendarDate.getUTCMonth() + 1 === month
                && calendarDate.getUTCDate() === day;
            const timestampValid = !raw.includes('T') || Number.isFinite(Date.parse(raw));

            if (calendarMatches && timestampValid) {
                return { valid: true, dateKey: `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`, issue: null };
            }

            return {
                valid: false,
                dateKey: null,
                issue: createIssue('invalid_date', 'error', 'Transaction date is not a valid calendar date.')
            };
        }

        const parsed = Date.parse(raw);
        if (Number.isFinite(parsed)) {
            const parsedDate = new Date(parsed);
            const localYear = parsedDate.getFullYear();
            const localMonth = String(parsedDate.getMonth() + 1).padStart(2, '0');
            const localDay = String(parsedDate.getDate()).padStart(2, '0');
            return {
                valid: true,
                dateKey: `${localYear}-${localMonth}-${localDay}`,
                issue: createIssue('noncanonical_date', 'warning', 'Transaction date should be repaired to ISO format.')
            };
        }

        return {
            valid: false,
            dateKey: null,
            issue: createIssue('invalid_date', 'error', 'Transaction date is not parseable.')
        };
    }

    function normalizeContext(options = {}) {
        const normalizeSet = values => new Set((Array.isArray(values) ? values : [])
            .map(normalizeCategory)
            .filter(Boolean));

        return {
            debtIds: new Set((Array.isArray(options.debtIds) ? options.debtIds : [])
                .map(normalizeString)
                .filter(Boolean)),
            debtCategoryNames: normalizeSet(options.debtCategoryNames),
            assetCategoryNames: normalizeSet(options.assetCategoryNames),
            transferCategoryNames: normalizeSet(options.transferCategoryNames)
        };
    }

    function getExplicitClass(tx) {
        const raw = tx?.accountingClass ?? tx?.transactionClass ?? tx?.financeClass ?? '';
        const normalized = normalizeToken(raw);
        return EXPLICIT_CLASS_ALIASES[normalized] || '';
    }

    function isCryptoBuyMirror(tx) {
        const id = normalizeString(tx?.id);
        const source = normalizeToken(tx?.autoGeneratedSource);
        const linkedType = normalizeToken(tx?.linkedCryptoTransactionType);
        return id.startsWith('crypto_buy_expense_')
            || source === 'crypto_buy'
            || (!!normalizeString(tx?.linkedCryptoTransactionId) && linkedType === 'buy');
    }

    function isCryptoSellMirror(tx) {
        const id = normalizeString(tx?.id);
        const source = normalizeToken(tx?.autoGeneratedSource);
        const linkedType = normalizeToken(tx?.linkedCryptoTransactionType);
        return id.startsWith('crypto_sell_proceeds_')
            || source === 'crypto_sell'
            || (!!normalizeString(tx?.linkedCryptoTransactionId) && linkedType === 'sell');
    }

    function isLendingCategory(category) {
        return category.startsWith('lent:');
    }

    function isDebtCategory(category, tx, context) {
        const debtId = normalizeString(tx?.debtId);
        if (debtId) return true;
        if (category.startsWith('debt to pay:')) return true;
        return context.debtCategoryNames.has(category);
    }

    function isOwnTransfer(tx, category, context, explicitClass) {
        return explicitClass === 'transfer'
            || tx?.isTransfer === true
            || !!normalizeString(tx?.transferAccountId)
            || category === 'own transfer'
            || category === 'transfer'
            || context.transferCategoryNames.has(category);
    }

    function isSavingsTransfer(category, explicitClass) {
        return explicitClass === 'savings_transfer'
            || category === 'savings'
            || category === 'emergency fund';
    }

    function isAssetAcquisition(tx, category, context, explicitClass) {
        return explicitClass === 'asset_acquisition'
            || tx?.assetAcquisition === true
            || tx?.capitalAsset === true
            || !!normalizeString(tx?.fixedAssetId)
            || !!normalizeString(tx?.linkedFixedAssetId)
            || isCryptoBuyMirror(tx)
            || ASSET_ACQUISITION_CATEGORIES.has(category)
            || context.assetCategoryNames.has(category);
    }

    function isAssetDisposal(tx, category, explicitClass) {
        return explicitClass === 'asset_disposal'
            || tx?.assetDisposal === true
            || isCryptoSellMirror(tx)
            || category === 'asset sale'
            || category === 'crypto sales';
    }

    function finishClassification(base, patch, issues, confidence = 'explicit') {
        const result = {
            ...base,
            ...patch
        };

        NUMERIC_FIELDS.forEach(field => {
            const value = Number(result[field]);
            result[field] = Number.isFinite(value) ? value : 0;
        });

        const hasError = issues.some(issue => issue.severity === 'error');
        const hasIssue = issues.length > 0;
        result.issues = issues;
        result.valid = !hasError;
        result.classifiable = result.classId !== FINANCE_TRANSACTION_CLASSES.UNCLASSIFIED && result.amount > 0;
        result.confidence = hasIssue ? 'incomplete' : confidence;
        result.flags = {
            affectsCash: result.cashDelta !== 0,
            isEarnedIncome: result.earnedIncomeDelta > 0,
            isOtherCashIn: result.otherCashInDelta > 0,
            isConsumption: result.consumptionDelta > 0,
            isSettlement: result.settlementDelta > 0,
            isTransfer: result.transferDelta !== 0,
            isAssetAcquisition: result.assetAcquisitionDelta > 0,
            affectsLiability: result.liabilityDelta !== 0,
            affectsReceivable: result.receivableDelta !== 0
        };

        return deepFreeze(result);
    }

    function classifyFinanceTransaction(tx, options = {}) {
        const record = tx && typeof tx === 'object' ? tx : {};
        const context = normalizeContext(options);
        const issues = [];
        const rawAmount = Number(record.amt);
        const amount = toPositiveAmount(record.amt);
        const type = normalizeToken(record.type);
        const category = normalizeCategory(record.category);
        const explicitClass = getExplicitClass(record);
        const rawPaymentSource = normalizeToken(record.paymentSource);
        const creditCardId = normalizeString(record.creditCardId);
        const paymentSource = rawPaymentSource === 'credit_card'
            || (type === 'expense' && !!creditCardId)
            ? 'credit_card'
            : 'cash';
        const dateStatus = inspectFinanceTransactionDate(record.date);

        if (!Number.isFinite(rawAmount) || rawAmount <= 0) {
            issues.push(createIssue('invalid_amount', 'error', 'Transaction amount must be a positive finite number.'));
        }
        if (!type) {
            issues.push(createIssue('missing_type', 'error', 'Transaction type is required.'));
        }
        if (dateStatus.issue) issues.push(dateStatus.issue);
        if (rawPaymentSource && !['cash', 'credit_card'].includes(rawPaymentSource)) {
            issues.push(createIssue('unknown_payment_source', 'warning', 'Payment source was treated as cash because it is not recognized.'));
        }

        const base = {
            classifierVersion: VERSION,
            classId: FINANCE_TRANSACTION_CLASSES.UNCLASSIFIED,
            kind: 'unknown',
            type,
            category,
            amount,
            dateKey: dateStatus.dateKey,
            paymentSource,
            counterpartyType: null,
            signals: [],
            cashDelta: 0,
            earnedIncomeDelta: 0,
            otherCashInDelta: 0,
            consumptionDelta: 0,
            financeChargeConsumptionDelta: 0,
            settlementDelta: 0,
            transferDelta: 0,
            assetAcquisitionDelta: 0,
            assetDisposalProceedsDelta: 0,
            liabilityDelta: 0,
            receivableDelta: 0
        };

        const cardFunded = paymentSource === 'credit_card';
        const outflowCashDelta = cardFunded ? 0 : -amount;
        const cardLiabilityDelta = cardFunded ? amount : 0;
        const lendingSignal = !!normalizeString(record.lentId) || isLendingCategory(category);
        const debtSignal = isDebtCategory(category, record, context);

        if (type === 'credit_card_payment') {
            if (!creditCardId) {
                issues.push(createIssue('missing_credit_card_link', 'warning', 'Credit-card settlement is not linked to a tracked card.'));
            }
            return finishClassification(base, {
                classId: FINANCE_TRANSACTION_CLASSES.CREDIT_CARD_SETTLEMENT,
                kind: 'settlement',
                paymentSource: 'cash',
                counterpartyType: 'credit_card',
                signals: ['type:credit_card_payment'],
                cashDelta: -amount,
                settlementDelta: amount,
                liabilityDelta: -amount
            }, issues);
        }

        if (type === 'installment_payment') {
            const installmentPlanId = normalizeString(record.installmentPlanId);
            if (!installmentPlanId) {
                issues.push(createIssue('missing_installment_link', 'warning', 'Installment settlement is not linked to a tracked plan.'));
            }
            const rawFee = Math.max(0, Number(record.installmentFeeAmount || 0));
            const fee = Math.min(amount, Number.isFinite(rawFee) ? rawFee : 0);
            if (Number.isFinite(rawFee) && rawFee > amount) {
                issues.push(createIssue('installment_fee_exceeds_payment', 'warning', 'Installment fee was capped at the payment amount.'));
            }
            const principal = Math.max(0, amount - fee);
            return finishClassification(base, {
                classId: FINANCE_TRANSACTION_CLASSES.INSTALLMENT_SETTLEMENT,
                kind: 'settlement',
                counterpartyType: 'installment',
                signals: ['type:installment_payment', ...(fee > 0 ? ['field:installmentFeeAmount'] : [])],
                cashDelta: outflowCashDelta,
                consumptionDelta: fee,
                financeChargeConsumptionDelta: fee,
                settlementDelta: principal,
                liabilityDelta: -principal + cardLiabilityDelta
            }, issues);
        }

        if (type === 'debt_increase' || (type === 'income' && record.debtBorrowTracked === true)) {
            const cashReceived = record.debtBorrowTracked === true;
            return finishClassification(base, {
                classId: cashReceived
                    ? FINANCE_TRANSACTION_CLASSES.DEBT_CASH_RECEIVED
                    : FINANCE_TRANSACTION_CLASSES.DEBT_TRACKING_ONLY,
                kind: 'liability',
                counterpartyType: 'debt',
                signals: [
                    `type:${type}`,
                    cashReceived ? 'field:debtBorrowTracked' : 'absence:debtBorrowTracked'
                ],
                cashDelta: cashReceived ? amount : 0,
                otherCashInDelta: cashReceived ? amount : 0,
                liabilityDelta: amount
            }, issues, cashReceived ? 'explicit' : 'derived');
        }

        if (type === 'expense' && debtSignal) {
            if (!normalizeString(record.debtId) && !context.debtCategoryNames.has(category)) {
                issues.push(createIssue('derived_debt_link', 'warning', 'Debt settlement was inferred from its category prefix.'));
            }
            const rawInterest = Math.max(0, Number(record.debtInterestAmount || 0));
            const rawFee = Math.max(0, Number(record.debtFeeAmount || 0));
            const explicitPrincipal = Number(record.debtPrincipalAmount);
            const hasExplicitSplit = Number.isFinite(explicitPrincipal)
                || rawInterest > 0
                || rawFee > 0;
            const consumption = Math.min(amount, rawInterest + rawFee);
            const principal = Math.max(0, amount - consumption);
            if (!hasExplicitSplit) {
                issues.push(createIssue('unsplit_debt_payment', 'warning', 'Debt payment has no principal, interest, or fee split; the full amount is treated as principal.'));
            } else if (Number.isFinite(explicitPrincipal) && Math.abs(Math.max(0, explicitPrincipal) - principal) > 0.005) {
                issues.push(createIssue('debt_payment_split_mismatch', 'warning', 'Debt principal plus interest and fees does not match the total payment.'));
            }
            return finishClassification(base, {
                classId: FINANCE_TRANSACTION_CLASSES.DEBT_SETTLEMENT,
                kind: 'settlement',
                counterpartyType: 'debt',
                signals: [
                    normalizeString(record.debtId) ? 'field:debtId' : 'category:debt',
                    ...(hasExplicitSplit ? ['field:debt_payment_split'] : [])
                ],
                cashDelta: outflowCashDelta,
                consumptionDelta: consumption,
                financeChargeConsumptionDelta: consumption,
                settlementDelta: principal,
                liabilityDelta: -principal + cardLiabilityDelta
            }, issues, normalizeString(record.debtId) ? 'explicit' : 'derived');
        }

        if (lendingSignal && type === 'expense') {
            return finishClassification(base, {
                classId: FINANCE_TRANSACTION_CLASSES.LENDING_ADVANCE,
                kind: 'transfer',
                counterpartyType: 'receivable',
                signals: [normalizeString(record.lentId) ? 'field:lentId' : 'category:lent'],
                cashDelta: outflowCashDelta,
                transferDelta: -amount,
                liabilityDelta: cardLiabilityDelta,
                receivableDelta: amount
            }, issues, normalizeString(record.lentId) ? 'explicit' : 'derived');
        }

        if (lendingSignal && ['income', 'non_income_cash_in'].includes(type)) {
            return finishClassification(base, {
                classId: FINANCE_TRANSACTION_CLASSES.LENDING_REPAYMENT,
                kind: 'transfer',
                counterpartyType: 'receivable',
                signals: [normalizeString(record.lentId) ? 'field:lentId' : 'category:lent'],
                cashDelta: amount,
                otherCashInDelta: amount,
                transferDelta: amount,
                receivableDelta: -amount
            }, issues, normalizeString(record.lentId) ? 'explicit' : 'derived');
        }

        if (isAssetAcquisition(record, category, context, explicitClass) && type === 'expense') {
            const explicitSignal = explicitClass === 'asset_acquisition'
                || record.assetAcquisition === true
                || !!normalizeString(record.fixedAssetId)
                || isCryptoBuyMirror(record);
            return finishClassification(base, {
                classId: FINANCE_TRANSACTION_CLASSES.ASSET_ACQUISITION,
                kind: 'asset',
                counterpartyType: isCryptoBuyMirror(record) ? 'crypto' : 'asset',
                signals: [
                    isCryptoBuyMirror(record) ? 'source:crypto_buy' : (explicitSignal ? 'field:asset_acquisition' : 'category:asset_acquisition')
                ],
                cashDelta: outflowCashDelta,
                assetAcquisitionDelta: amount,
                liabilityDelta: cardLiabilityDelta
            }, issues, explicitSignal ? 'explicit' : 'derived');
        }

        if (isSavingsTransfer(category, explicitClass) && type === 'expense') {
            return finishClassification(base, {
                classId: FINANCE_TRANSACTION_CLASSES.SAVINGS_TRANSFER,
                kind: 'transfer',
                counterpartyType: 'savings',
                signals: [explicitClass === 'savings_transfer' ? 'class:savings_transfer' : 'category:savings'],
                cashDelta: outflowCashDelta,
                transferDelta: -amount,
                liabilityDelta: cardLiabilityDelta
            }, issues, explicitClass === 'savings_transfer' ? 'explicit' : 'derived');
        }

        if (isOwnTransfer(record, category, context, explicitClass)
            && ['income', 'non_income_cash_in', 'expense'].includes(type)) {
            const isInflow = type !== 'expense';
            return finishClassification(base, {
                classId: FINANCE_TRANSACTION_CLASSES.OWN_ACCOUNT_TRANSFER,
                kind: 'transfer',
                counterpartyType: 'own_account',
                signals: [explicitClass === 'transfer' ? 'class:transfer' : 'category:own_transfer'],
                cashDelta: isInflow ? amount : outflowCashDelta,
                otherCashInDelta: isInflow ? amount : 0,
                transferDelta: isInflow ? amount : -amount,
                liabilityDelta: isInflow ? 0 : cardLiabilityDelta
            }, issues, explicitClass === 'transfer' || record.isTransfer === true ? 'explicit' : 'derived');
        }

        if (isAssetDisposal(record, category, explicitClass)
            && ['income', 'non_income_cash_in', 'crypto_sell_proceeds'].includes(type)) {
            return finishClassification(base, {
                classId: FINANCE_TRANSACTION_CLASSES.ASSET_DISPOSAL,
                kind: 'asset',
                counterpartyType: isCryptoSellMirror(record) ? 'crypto' : 'asset',
                signals: [isCryptoSellMirror(record) ? 'source:crypto_sell' : 'category:asset_sale'],
                cashDelta: amount,
                otherCashInDelta: amount,
                assetDisposalProceedsDelta: amount
            }, issues, isCryptoSellMirror(record) || explicitClass === 'asset_disposal' ? 'explicit' : 'derived');
        }

        if (explicitClass === 'settlement' && type === 'expense') {
            return finishClassification(base, {
                classId: FINANCE_TRANSACTION_CLASSES.GENERIC_SETTLEMENT,
                kind: 'settlement',
                signals: ['class:settlement'],
                cashDelta: outflowCashDelta,
                settlementDelta: amount,
                liabilityDelta: cardLiabilityDelta
            }, issues);
        }

        if (type === 'income' && (NON_INCOME_CATEGORIES.has(category) || explicitClass === 'other_cash_in')) {
            return finishClassification(base, {
                classId: FINANCE_TRANSACTION_CLASSES.OTHER_CASH_IN,
                kind: 'income',
                signals: [explicitClass === 'other_cash_in' ? 'class:other_cash_in' : 'category:other_cash_in'],
                cashDelta: amount,
                otherCashInDelta: amount
            }, issues, explicitClass === 'other_cash_in' ? 'explicit' : 'derived');
        }

        if (['non_income_cash_in', 'crypto_sell_proceeds'].includes(type)) {
            return finishClassification(base, {
                classId: FINANCE_TRANSACTION_CLASSES.OTHER_CASH_IN,
                kind: 'income',
                signals: [`type:${type}`],
                cashDelta: amount,
                otherCashInDelta: amount
            }, issues);
        }

        if (type === 'income') {
            return finishClassification(base, {
                classId: FINANCE_TRANSACTION_CLASSES.EARNED_INCOME,
                kind: 'income',
                signals: ['type:income'],
                cashDelta: amount,
                earnedIncomeDelta: amount
            }, issues);
        }

        if (type === 'expense') {
            const isCardCharge = paymentSource === 'credit_card';
            if (isCardCharge && !creditCardId) {
                issues.push(createIssue('missing_credit_card_link', 'warning', 'Credit-card charge is not linked to a tracked card.'));
            }
            return finishClassification(base, {
                classId: isCardCharge
                    ? FINANCE_TRANSACTION_CLASSES.CREDIT_CARD_CONSUMPTION_CHARGE
                    : FINANCE_TRANSACTION_CLASSES.CASH_CONSUMPTION_PURCHASE,
                kind: 'consumption',
                counterpartyType: isCardCharge ? 'credit_card' : null,
                signals: [isCardCharge ? 'paymentSource:credit_card' : 'type:expense'],
                cashDelta: outflowCashDelta,
                consumptionDelta: amount,
                liabilityDelta: cardLiabilityDelta
            }, issues, isCardCharge && !creditCardId ? 'derived' : 'explicit');
        }

        if (type && !KNOWN_TYPES.has(type)) {
            issues.push(createIssue('unknown_type', 'error', `Transaction type "${type}" is not recognized.`));
        }

        return finishClassification(base, {
            classId: FINANCE_TRANSACTION_CLASSES.UNCLASSIFIED,
            kind: 'unknown',
            signals: type ? [`type:${type}`] : []
        }, issues, 'incomplete');
    }

    function classifyFinanceTransactions(transactions, options = {}) {
        return deepFreeze((Array.isArray(transactions) ? transactions : [])
            .map(transaction => classifyFinanceTransaction(transaction, options)));
    }

    function summarizeFinanceClassifications(transactions, options = {}) {
        const classifications = classifyFinanceTransactions(transactions, options);
        const totals = Object.fromEntries(NUMERIC_FIELDS.map(field => [field, 0]));
        const classCounts = {};
        const issueCounts = {};
        let validCount = 0;
        let invalidCount = 0;
        let unclassifiedCount = 0;

        classifications.forEach(classification => {
            NUMERIC_FIELDS.forEach(field => {
                totals[field] += classification[field];
            });
            classCounts[classification.classId] = (classCounts[classification.classId] || 0) + 1;
            classification.issues.forEach(issue => {
                issueCounts[issue.code] = (issueCounts[issue.code] || 0) + 1;
            });
            if (classification.valid) validCount += 1;
            else invalidCount += 1;
            if (!classification.classifiable) unclassifiedCount += 1;
        });

        return deepFreeze({
            classifierVersion: VERSION,
            transactionCount: classifications.length,
            validCount,
            invalidCount,
            unclassifiedCount,
            totals,
            classCounts,
            issueCounts,
            classifications
        });
    }

    function validate() {
        const errors = [];
        const classIds = Object.values(FINANCE_TRANSACTION_CLASSES);
        if (new Set(classIds).size !== classIds.length) errors.push('Transaction class IDs must be unique.');
        if (!classIds.includes(FINANCE_TRANSACTION_CLASSES.UNCLASSIFIED)) errors.push('Unclassified fallback is required.');

        const sample = classifyFinanceTransaction({
            type: 'expense',
            category: 'Food',
            amt: 100,
            date: '2026-07-31',
            paymentSource: 'cash'
        });
        if (sample.cashDelta !== -100 || sample.consumptionDelta !== 100) {
            errors.push('Cash-consumption invariant failed.');
        }

        return deepFreeze({
            valid: errors.length === 0,
            errors,
            version: VERSION,
            classCount: classIds.length,
            numericFields: [...NUMERIC_FIELDS]
        });
    }

    return deepFreeze({
        VERSION,
        FINANCE_TRANSACTION_CLASSES,
        inspectFinanceTransactionDate,
        classifyFinanceTransaction,
        classifyFinanceTransactions,
        summarizeFinanceClassifications,
        validate
    });
});
