'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const classifier = require('../assets/js/core/transaction-classifier.js');

const {
    FINANCE_TRANSACTION_CLASSES: CLASSES,
    classifyFinanceTransaction,
    classifyFinanceTransactions,
    summarizeFinanceClassifications,
    validate
} = classifier;

const DATE = '2026-07-31T08:00:00.000Z';

function tx(overrides = {}) {
    return {
        id: 'fixture-1',
        type: 'expense',
        category: 'Food',
        amt: 100,
        date: DATE,
        paymentSource: 'cash',
        ...overrides
    };
}

function issueCodes(classification) {
    return classification.issues.map(issue => issue.code);
}

test('classifier contract is structurally valid', () => {
    assert.deepEqual(validate(), {
        valid: true,
        errors: [],
        version: '1.0.0',
        classCount: 17,
        numericFields: [
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
        ]
    });
});

test('browser load order places classification before legacy metrics', () => {
    const indexPath = path.join(__dirname, '..', 'index.html');
    const html = fs.readFileSync(indexPath, 'utf8');
    const contractIndex = html.indexOf('assets/js/core/metric-contract.js');
    const classifierIndex = html.indexOf('assets/js/core/transaction-classifier.js');
    const metricsIndex = html.indexOf('assets/js/core/metrics.js');

    assert.ok(contractIndex >= 0, 'metric contract script should be present');
    assert.ok(classifierIndex > contractIndex, 'classifier should load after the metric contract');
    assert.ok(metricsIndex > classifierIndex, 'legacy metrics should load after the classifier');
});

test('earned income and other cash in remain distinct', () => {
    const earned = classifyFinanceTransaction(tx({ type: 'income', category: 'Salary', amt: 5000 }));
    assert.equal(earned.classId, CLASSES.EARNED_INCOME);
    assert.equal(earned.cashDelta, 5000);
    assert.equal(earned.earnedIncomeDelta, 5000);
    assert.equal(earned.otherCashInDelta, 0);

    const refund = classifyFinanceTransaction(tx({
        type: 'non_income_cash_in',
        category: 'Refund/Reimbursement',
        amt: 850
    }));
    assert.equal(refund.classId, CLASSES.OTHER_CASH_IN);
    assert.equal(refund.cashDelta, 850);
    assert.equal(refund.earnedIncomeDelta, 0);
    assert.equal(refund.otherCashInDelta, 850);
});

test('credit-card charge recognizes consumption once and payment only as settlement', () => {
    const charge = classifyFinanceTransaction(tx({
        type: 'expense',
        category: 'Travel',
        amt: 1200,
        paymentSource: 'credit_card',
        creditCardId: 'card-1'
    }));
    assert.equal(charge.classId, CLASSES.CREDIT_CARD_CONSUMPTION_CHARGE);
    assert.equal(charge.cashDelta, 0);
    assert.equal(charge.consumptionDelta, 1200);
    assert.equal(charge.settlementDelta, 0);
    assert.equal(charge.liabilityDelta, 1200);

    const payment = classifyFinanceTransaction(tx({
        type: 'credit_card_payment',
        category: 'Aurora Rewards',
        amt: 1200,
        creditCardId: 'card-1'
    }));
    assert.equal(payment.classId, CLASSES.CREDIT_CARD_SETTLEMENT);
    assert.equal(payment.cashDelta, -1200);
    assert.equal(payment.consumptionDelta, 0);
    assert.equal(payment.settlementDelta, 1200);
    assert.equal(payment.liabilityDelta, -1200);

    const summary = summarizeFinanceClassifications([charge, payment].map((classification, index) => (
        index === 0
            ? tx({ type: 'expense', category: 'Travel', amt: 1200, paymentSource: 'credit_card', creditCardId: 'card-1' })
            : tx({ type: 'credit_card_payment', category: 'Aurora Rewards', amt: 1200, creditCardId: 'card-1' })
    )));
    assert.equal(summary.totals.consumptionDelta, 1200);
    assert.equal(summary.totals.cashDelta, -1200);
    assert.equal(summary.totals.liabilityDelta, 0);
});

test('installment payment separates principal settlement from fees', () => {
    const result = classifyFinanceTransaction(tx({
        type: 'installment_payment',
        category: 'Installments/BNPL',
        amt: 3150,
        installmentPlanId: 'plan-1',
        installmentFeeAmount: 150
    }));

    assert.equal(result.classId, CLASSES.INSTALLMENT_SETTLEMENT);
    assert.equal(result.cashDelta, -3150);
    assert.equal(result.consumptionDelta, 150);
    assert.equal(result.financeChargeConsumptionDelta, 150);
    assert.equal(result.settlementDelta, 3000);
    assert.equal(result.liabilityDelta, -3000);
});

test('debt cash, tracking-only increases, and repayments have separate semantics', () => {
    const cashReceived = classifyFinanceTransaction(tx({
        type: 'debt_increase',
        category: 'Debt to pay: Family Loan',
        amt: 18000,
        debtId: 'debt-1',
        debtBorrowTracked: true
    }));
    assert.equal(cashReceived.classId, CLASSES.DEBT_CASH_RECEIVED);
    assert.equal(cashReceived.cashDelta, 18000);
    assert.equal(cashReceived.otherCashInDelta, 18000);
    assert.equal(cashReceived.liabilityDelta, 18000);

    const trackingOnly = classifyFinanceTransaction(tx({
        type: 'debt_increase',
        category: 'Debt to pay: Family Loan',
        amt: 18000,
        debtId: 'debt-1',
        debtBorrowTracked: false
    }));
    assert.equal(trackingOnly.classId, CLASSES.DEBT_TRACKING_ONLY);
    assert.equal(trackingOnly.cashDelta, 0);
    assert.equal(trackingOnly.otherCashInDelta, 0);
    assert.equal(trackingOnly.liabilityDelta, 18000);

    const repayment = classifyFinanceTransaction(tx({
        type: 'expense',
        category: 'Debt to pay: Family Loan',
        amt: 2200,
        debtId: 'debt-1',
        debtInterestAmount: 150,
        debtFeeAmount: 50,
        debtPrincipalAmount: 2000
    }));
    assert.equal(repayment.classId, CLASSES.DEBT_SETTLEMENT);
    assert.equal(repayment.cashDelta, -2200);
    assert.equal(repayment.consumptionDelta, 200);
    assert.equal(repayment.settlementDelta, 2000);
    assert.equal(repayment.liabilityDelta, -2000);
    assert.ok(!issueCodes(repayment).includes('unsplit_debt_payment'));
});

test('debt category context supports legacy unlinked repayments', () => {
    const result = classifyFinanceTransaction(tx({
        type: 'expense',
        category: 'Family Loan',
        amt: 1000
    }), {
        debtCategoryNames: ['Family Loan']
    });

    assert.equal(result.classId, CLASSES.DEBT_SETTLEMENT);
    assert.equal(result.settlementDelta, 1000);
    assert.ok(issueCodes(result).includes('unsplit_debt_payment'));
});

test('lending and own-account movements are transfers, not consumption', () => {
    const advance = classifyFinanceTransaction(tx({
        type: 'expense',
        category: 'Lent: Alex',
        amt: 6000,
        lentId: 'lent-1'
    }));
    assert.equal(advance.classId, CLASSES.LENDING_ADVANCE);
    assert.equal(advance.cashDelta, -6000);
    assert.equal(advance.transferDelta, -6000);
    assert.equal(advance.receivableDelta, 6000);
    assert.equal(advance.consumptionDelta, 0);

    const repayment = classifyFinanceTransaction(tx({
        type: 'non_income_cash_in',
        category: 'Lent: Alex',
        amt: 2500,
        lentId: 'lent-1'
    }));
    assert.equal(repayment.classId, CLASSES.LENDING_REPAYMENT);
    assert.equal(repayment.cashDelta, 2500);
    assert.equal(repayment.otherCashInDelta, 2500);
    assert.equal(repayment.transferDelta, 2500);
    assert.equal(repayment.receivableDelta, -2500);

    const savings = classifyFinanceTransaction(tx({
        type: 'expense',
        category: 'Savings',
        amt: 3000
    }));
    assert.equal(savings.classId, CLASSES.SAVINGS_TRANSFER);
    assert.equal(savings.transferDelta, -3000);
    assert.equal(savings.consumptionDelta, 0);

    const ownTransferIn = classifyFinanceTransaction(tx({
        type: 'non_income_cash_in',
        category: 'Own Transfer',
        amt: 7000
    }));
    assert.equal(ownTransferIn.classId, CLASSES.OWN_ACCOUNT_TRANSFER);
    assert.equal(ownTransferIn.cashDelta, 7000);
    assert.equal(ownTransferIn.transferDelta, 7000);
    assert.equal(ownTransferIn.earnedIncomeDelta, 0);
});

test('crypto and explicit fixed-asset purchases are asset acquisitions', () => {
    const cryptoBuy = classifyFinanceTransaction(tx({
        id: 'crypto_buy_expense_crypto-1',
        type: 'expense',
        category: 'Investment',
        amt: 5000,
        autoGeneratedSource: 'crypto_buy',
        linkedCryptoTransactionId: 'crypto-1',
        linkedCryptoTransactionType: 'buy'
    }));
    assert.equal(cryptoBuy.classId, CLASSES.ASSET_ACQUISITION);
    assert.equal(cryptoBuy.cashDelta, -5000);
    assert.equal(cryptoBuy.assetAcquisitionDelta, 5000);
    assert.equal(cryptoBuy.consumptionDelta, 0);

    const fixedAsset = classifyFinanceTransaction(tx({
        type: 'expense',
        category: 'Gear',
        amt: 45000,
        accountingClass: 'asset_acquisition',
        fixedAssetId: 'asset-1'
    }));
    assert.equal(fixedAsset.classId, CLASSES.ASSET_ACQUISITION);
    assert.equal(fixedAsset.assetAcquisitionDelta, 45000);

    const cryptoSale = classifyFinanceTransaction(tx({
        id: 'crypto_sell_proceeds_crypto-1',
        type: 'non_income_cash_in',
        category: 'Crypto Sales',
        amt: 6200,
        autoGeneratedSource: 'crypto_sell',
        linkedCryptoTransactionId: 'crypto-1',
        linkedCryptoTransactionType: 'sell'
    }));
    assert.equal(cryptoSale.classId, CLASSES.ASSET_DISPOSAL);
    assert.equal(cryptoSale.cashDelta, 6200);
    assert.equal(cryptoSale.otherCashInDelta, 6200);
    assert.equal(cryptoSale.assetDisposalProceedsDelta, 6200);
});

test('malformed inputs are surfaced without silently changing their meaning', () => {
    const impossibleDate = classifyFinanceTransaction(tx({
        type: 'income',
        category: 'Salary',
        date: '2026-02-31'
    }));
    assert.equal(impossibleDate.classId, CLASSES.EARNED_INCOME);
    assert.equal(impossibleDate.valid, false);
    assert.ok(issueCodes(impossibleDate).includes('invalid_date'));

    const noncanonicalDate = classifyFinanceTransaction(tx({
        type: 'income',
        category: 'Salary',
        date: 'July 31, 2026'
    }));
    assert.equal(noncanonicalDate.valid, true);
    assert.ok(issueCodes(noncanonicalDate).includes('noncanonical_date'));

    const unknown = classifyFinanceTransaction(tx({
        type: 'mystery',
        category: 'Others',
        amt: -20,
        date: ''
    }));
    assert.equal(unknown.classId, CLASSES.UNCLASSIFIED);
    assert.equal(unknown.classifiable, false);
    assert.equal(unknown.valid, false);
    assert.deepEqual(new Set(issueCodes(unknown)), new Set([
        'invalid_amount',
        'missing_date',
        'unknown_type'
    ]));
});

test('batch summary exposes orthogonal totals for future metric migration', () => {
    const transactions = [
        tx({ type: 'income', category: 'Salary', amt: 1000 }),
        tx({ type: 'expense', category: 'Food', amt: 200, paymentSource: 'credit_card', creditCardId: 'card-1' }),
        tx({ type: 'credit_card_payment', category: 'Card', amt: 150, creditCardId: 'card-1' }),
        tx({ type: 'installment_payment', category: 'Installments/BNPL', amt: 100, installmentPlanId: 'plan-1', installmentFeeAmount: 10 }),
        tx({ type: 'expense', category: 'Savings', amt: 100 }),
        tx({ id: 'crypto_buy_expense_1', type: 'expense', category: 'Investment', amt: 100, autoGeneratedSource: 'crypto_buy' }),
        tx({ type: 'expense', category: 'Lent: Alex', amt: 50, lentId: 'lent-1' }),
        tx({ type: 'non_income_cash_in', category: 'Lent: Alex', amt: 20, lentId: 'lent-1' })
    ];
    const summary = summarizeFinanceClassifications(transactions);

    assert.equal(summary.transactionCount, 8);
    assert.equal(summary.invalidCount, 0);
    assert.equal(summary.totals.cashDelta, 520);
    assert.equal(summary.totals.earnedIncomeDelta, 1000);
    assert.equal(summary.totals.otherCashInDelta, 20);
    assert.equal(summary.totals.consumptionDelta, 210);
    assert.equal(summary.totals.financeChargeConsumptionDelta, 10);
    assert.equal(summary.totals.settlementDelta, 240);
    assert.equal(summary.totals.transferDelta, -130);
    assert.equal(summary.totals.assetAcquisitionDelta, 100);
    assert.equal(summary.totals.liabilityDelta, -40);
    assert.equal(summary.totals.receivableDelta, 30);
});

test('classification is side-effect free and returns immutable results', () => {
    const input = tx({
        type: 'expense',
        category: 'Food',
        amt: 320
    });
    const before = structuredClone(input);
    const result = classifyFinanceTransaction(input);
    const batch = classifyFinanceTransactions([input]);

    assert.deepEqual(input, before);
    assert.ok(Object.isFrozen(result));
    assert.ok(Object.isFrozen(result.flags));
    assert.ok(Object.isFrozen(result.issues));
    assert.ok(Object.isFrozen(batch));
    assert.throws(() => {
        result.cashDelta = 0;
    }, TypeError);
});
