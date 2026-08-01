'use strict';

// Phase 2E shared reconciliation fixture.
//
// The fixture deliberately keeps cash movement, consumption recognition,
// finance charges, principal settlement, and liability movement separate. It
// is consumed by multiple engines so later phases cannot make one surface pass
// by changing a private, test-specific input.

function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.getOwnPropertyNames(value).forEach(key => deepFreeze(value[key]));
    return Object.freeze(value);
}

const PHASE_2E_COUNTED_ONCE_EXPECTED = deepFreeze({
    events: {
        'card-charge': {
            classId: 'credit_card_consumption_charge',
            cashDelta: 0,
            consumptionDelta: 1200,
            financeChargeConsumptionDelta: 0,
            settlementDelta: 0,
            liabilityDelta: 1200
        },
        'card-payment': {
            classId: 'credit_card_settlement',
            cashDelta: -500,
            consumptionDelta: 0,
            financeChargeConsumptionDelta: 0,
            settlementDelta: 500,
            liabilityDelta: -500
        },
        'debt-payment': {
            classId: 'debt_settlement',
            cashDelta: -2200,
            consumptionDelta: 200,
            financeChargeConsumptionDelta: 200,
            settlementDelta: 2000,
            liabilityDelta: -2000
        },
        'installment-payment': {
            classId: 'installment_settlement',
            cashDelta: -3150,
            consumptionDelta: 150,
            financeChargeConsumptionDelta: 150,
            settlementDelta: 3000,
            liabilityDelta: -3000
        }
    },
    metrics: {
        transactionCount: 5,
        netCashFlow: -850,
        earnedIncome: 5000,
        otherCashIn: 0,
        consumptionSpending: 1550,
        financeChargeSpending: 350,
        settlements: 5500,
        liabilityDelta: -4300,
        savingsRate: 69,
        spendingByCategory: {
            Travel: 1200,
            'Family Loan': 200,
            'Installments/BNPL': 150
        }
    },
    statement: {
        income: 5000,
        costOfEarning: 0,
        operatingExpenses: 1200,
        ebitda: 3800,
        financeCosts: 350,
        netIncome: 3450,
        debtService: 5850,
        operatingCashFlow: 5000,
        investingCashFlow: 0,
        financingCashFlow: -5850,
        transferCashFlow: 0,
        netCashFlow: -850,
        cardPurchasesNonCash: 1200,
        cardPayments: 500,
        debtPayments: 2200,
        installmentPayments: 3150
    },
    position: {
        trackedCash: 1150,
        card: {
            openingBalance: 0,
            charges: 1200,
            payments: 500,
            endingBalance: 700
        },
        debt: {
            openingPrincipal: 10000,
            principalSettled: 2000,
            financeChargesPaid: 200,
            endingPrincipal: 8000
        },
        installment: {
            openingContractualBalance: 6000,
            openingPrincipal: 5700,
            openingFinanceCharges: 300,
            principalSettled: 3000,
            financeChargesPaid: 150,
            endingPrincipal: 2700,
            endingContractualBalance: 2850
        }
    }
});

function buildPhase2ECountedOnceFixture() {
    const transactions = [
        {
            id: 'earned-income',
            type: 'income',
            category: 'Salary',
            amt: 5000,
            date: '2026-07-01',
            paymentSource: 'cash'
        },
        {
            id: 'card-charge',
            type: 'expense',
            category: 'Travel',
            amt: 1200,
            date: '2026-07-05',
            paymentSource: 'credit_card',
            creditCardId: 'card-1'
        },
        {
            id: 'debt-payment',
            type: 'expense',
            category: 'Family Loan',
            amt: 2200,
            date: '2026-07-10',
            paymentSource: 'cash',
            debtId: 'debt-1',
            debtPrincipalAmount: 2000,
            debtInterestAmount: 150,
            debtFeeAmount: 50
        },
        {
            id: 'installment-payment',
            type: 'installment_payment',
            category: 'Installments/BNPL',
            amt: 3150,
            date: '2026-07-15',
            paymentSource: 'cash',
            installmentPlanId: 'plan-1',
            installmentFeeAmount: 150
        },
        {
            id: 'card-payment',
            type: 'credit_card_payment',
            category: 'Rewards Card',
            amt: 500,
            date: '2026-07-20',
            paymentSource: 'cash',
            creditCardId: 'card-1'
        }
    ];

    const context = {
        debtIds: ['debt-1'],
        debtCategoryNames: ['Family Loan', 'Debt to pay: Family Loan']
    };

    return {
        transactions,
        context,
        snapshotInput: {
            openingCash: 2000,
            transactions,
            debts: [{
                id: 'debt-1',
                name: 'Family Loan',
                amount: 10000,
                borrowDate: '2026-01-01'
            }],
            creditCards: [{
                id: 'card-1',
                name: 'Rewards Card',
                openingBalance: 0,
                createdAt: '2026-01-01'
            }],
            installmentPlans: [{
                id: 'plan-1',
                name: 'Phone Plan',
                totalAmount: 6000,
                feeTotal: 300,
                startDate: '2026-01-01'
            }],
            cryptoBookValue: 0,
            cryptoMarketValue: 0
        },
        asOf: '2026-07-31',
        expected: PHASE_2E_COUNTED_ONCE_EXPECTED
    };
}

module.exports = {
    PHASE_2E_COUNTED_ONCE_EXPECTED,
    buildPhase2ECountedOnceFixture
};
