(function exposeFinanceActivityPresentation(root, factory) {
    const api = factory(root);

    if (typeof module === 'object' && module.exports) {
        module.exports = api;
    }

    if (root) {
        root.FINANCE_ACTIVITY_PRESENTATION_VERSION = api.VERSION;
        root.FINANCE_ACTIVITY_CLASS_PRESENTATION = api.CLASS_PRESENTATION;
        root.buildFinanceActivityPresentation = api.buildFinanceActivityPresentation;
        root.matchesFinanceActivityFilter = api.matchesFinanceActivityFilter;
        root.validateFinanceActivityPresentation = api.validate;
    }
})(typeof window !== 'undefined' ? window : globalThis, function buildFinanceActivityPresentationModule(root) {
    'use strict';

    const VERSION = '1.0.0';

    function deepFreeze(value) {
        if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
        Object.values(value).forEach(deepFreeze);
        return Object.freeze(value);
    }

    const CLASS_PRESENTATION = deepFreeze({
        earned_income: { label: 'Earned income', tone: 'income' },
        other_cash_in: { label: 'Other cash in', tone: 'cash-in' },
        cash_consumption_purchase: { label: 'Cash purchase', tone: 'spending' },
        credit_card_consumption_charge: { label: 'Card purchase', tone: 'card' },
        credit_card_settlement: { label: 'Card payment', tone: 'settlement' },
        installment_settlement: { label: 'BNPL payment', tone: 'settlement' },
        debt_settlement: { label: 'Debt payment', tone: 'settlement' },
        generic_settlement: { label: 'Settlement', tone: 'settlement' },
        debt_cash_received: { label: 'Borrowed cash', tone: 'cash-in' },
        debt_tracking_only: { label: 'Liability only', tone: 'position' },
        lending_advance: { label: 'Money lent', tone: 'transfer' },
        lending_repayment: { label: 'Lent repayment', tone: 'cash-in' },
        savings_transfer: { label: 'Savings transfer', tone: 'transfer' },
        own_account_transfer: { label: 'Own-account transfer', tone: 'transfer' },
        asset_acquisition: { label: 'Asset purchase', tone: 'asset' },
        asset_disposal: { label: 'Asset sale', tone: 'asset' },
        unclassified: { label: 'Needs classification', tone: 'review' }
    });

    function toNumber(value) {
        const number = Number(value);
        return Number.isFinite(number) ? number : 0;
    }

    function getClassifier(options = {}) {
        if (typeof options.classifier === 'function') return options.classifier;
        if (typeof root?.classifyFinanceTransaction === 'function') return root.classifyFinanceTransaction;
        return null;
    }

    function classify(transaction, options = {}) {
        if (options.classification && typeof options.classification === 'object') {
            return options.classification;
        }
        const classifier = getClassifier(options);
        return classifier ? classifier(transaction, options.context || {}) : null;
    }

    function createEffect(key, label, value, tone, options = {}) {
        return {
            key,
            label,
            value: toNumber(value),
            tone,
            status: options.status || null,
            showSign: options.showSign === true
        };
    }

    function buildEffects(classification) {
        const cashDelta = toNumber(classification?.cashDelta);
        const consumption = toNumber(classification?.consumptionDelta);
        const settlement = toNumber(classification?.settlementDelta);
        const transfer = toNumber(classification?.transferDelta);
        const assetAcquisition = toNumber(classification?.assetAcquisitionDelta);
        const assetDisposal = toNumber(classification?.assetDisposalProceedsDelta);
        const liability = toNumber(classification?.liabilityDelta);
        const receivable = toNumber(classification?.receivableDelta);
        const effects = [];

        if (cashDelta > 0) {
            effects.push(createEffect('cash', 'Cash in', cashDelta, 'cash-in', { showSign: true }));
        } else if (cashDelta < 0) {
            effects.push(createEffect('cash', 'Cash out', cashDelta, 'cash-out', { showSign: true }));
        } else {
            effects.push(createEffect('cash', 'No cash movement', 0, 'cash-neutral', { status: 'No cash' }));
        }
        if (consumption > 0) effects.push(createEffect('spending', 'Spending', consumption, 'spending'));
        if (settlement > 0) effects.push(createEffect('settlement', 'Settlement', settlement, 'settlement'));
        if (transfer !== 0) effects.push(createEffect('transfer', 'Transfer', transfer, 'transfer', { showSign: true }));
        if (assetAcquisition > 0) effects.push(createEffect('asset', 'Asset acquired', assetAcquisition, 'asset'));
        if (assetDisposal > 0) effects.push(createEffect('asset-sale', 'Asset proceeds', assetDisposal, 'asset'));
        if (liability !== 0) effects.push(createEffect('liability', 'Liability', liability, 'liability', { showSign: true }));
        if (receivable !== 0) effects.push(createEffect('receivable', 'Receivable', receivable, 'receivable', { showSign: true }));
        return effects;
    }

    function getAmountRole(classification) {
        const cashDelta = toNumber(classification?.cashDelta);
        const consumption = toNumber(classification?.consumptionDelta);
        const settlement = toNumber(classification?.settlementDelta);
        const transfer = toNumber(classification?.transferDelta);
        const liability = toNumber(classification?.liabilityDelta);

        if (cashDelta > 0) return classification?.earnedIncomeDelta > 0 ? 'Cash in • earned' : 'Cash in';
        if (cashDelta < 0 && settlement > 0 && consumption > 0) return 'Cash out • settlement + fees';
        if (cashDelta < 0 && settlement > 0) return 'Cash out • settlement';
        if (cashDelta < 0 && transfer !== 0) return 'Cash out • transfer';
        if (cashDelta < 0 && classification?.assetAcquisitionDelta > 0) return 'Cash out • asset purchase';
        if (cashDelta < 0 && consumption > 0) return 'Cash out • spending';
        if (cashDelta === 0 && consumption > 0 && liability > 0) return 'Spending now • cash later';
        if (cashDelta === 0 && liability !== 0) return 'Position only • no cash';
        return 'No cash movement';
    }

    function buildFinanceActivityPresentation(transaction, options = {}) {
        const classification = classify(transaction, options) || {
            classId: 'unclassified',
            valid: false,
            classifiable: false,
            confidence: 'incomplete',
            issues: [{ code: 'classifier_unavailable', severity: 'error', message: 'Classification is unavailable.' }]
        };
        const definition = CLASS_PRESENTATION[classification.classId] || CLASS_PRESENTATION.unclassified;
        const issues = Array.isArray(classification.issues) ? classification.issues : [];
        const reviewRequired = classification.valid !== true
            || classification.classifiable !== true
            || classification.confidence === 'incomplete'
            || issues.length > 0;
        const hasError = issues.some(issue => issue?.severity === 'error');
        const cashDelta = toNumber(classification.cashDelta);
        const amount = toNumber(transaction?.amt || classification.amount);
        const effects = buildEffects(classification);
        const amountTone = cashDelta > 0 ? 'cash-in' : (cashDelta < 0 ? 'cash-out' : definition.tone);

        return deepFreeze({
            version: VERSION,
            classId: classification.classId || 'unclassified',
            classLabel: definition.label,
            tone: definition.tone,
            amount,
            amountTone,
            amountRole: getAmountRole(classification),
            cashDelta,
            spendingDelta: toNumber(classification.consumptionDelta),
            settlementDelta: toNumber(classification.settlementDelta),
            transferDelta: toNumber(classification.transferDelta),
            assetDelta: toNumber(classification.assetAcquisitionDelta) + toNumber(classification.assetDisposalProceedsDelta),
            liabilityDelta: toNumber(classification.liabilityDelta),
            receivableDelta: toNumber(classification.receivableDelta),
            effects,
            confidence: classification.confidence || 'incomplete',
            reviewRequired,
            reviewSeverity: hasError ? 'error' : (reviewRequired ? 'warning' : 'none'),
            issueCodes: issues.map(issue => String(issue?.code || '')).filter(Boolean),
            issueSummary: issues.map(issue => String(issue?.message || '')).filter(Boolean).join(' '),
            classification
        });
    }

    function matchesFinanceActivityFilter(transaction, requestedFilter, options = {}) {
        const filter = String(requestedFilter || 'all');
        if (filter === 'all') return true;
        const presentation = buildFinanceActivityPresentation(transaction, options);
        if (filter === 'cash_in') return presentation.cashDelta > 0;
        if (filter === 'cash_out') return presentation.cashDelta < 0;
        if (filter === 'earned_income') return toNumber(presentation.classification?.earnedIncomeDelta) > 0;
        if (filter === 'other_cash_in') return toNumber(presentation.classification?.otherCashInDelta) > 0;
        if (filter === 'spending') return presentation.spendingDelta > 0;
        if (filter === 'settlements') return presentation.settlementDelta > 0;
        if (filter === 'transfers') return presentation.transferDelta !== 0;
        if (filter === 'position_changes') {
            return presentation.assetDelta > 0
                || presentation.liabilityDelta !== 0
                || presentation.receivableDelta !== 0;
        }
        if (filter === 'no_cash') return presentation.cashDelta === 0;
        if (filter === 'needs_review') return presentation.reviewRequired;
        return true;
    }

    function validate() {
        const classIds = root?.FINANCE_TRANSACTION_CLASSES
            ? Object.values(root.FINANCE_TRANSACTION_CLASSES)
            : [
                'earned_income', 'other_cash_in', 'cash_consumption_purchase',
                'credit_card_consumption_charge', 'credit_card_settlement',
                'installment_settlement', 'debt_settlement', 'generic_settlement',
                'debt_cash_received', 'debt_tracking_only', 'lending_advance',
                'lending_repayment', 'savings_transfer', 'own_account_transfer',
                'asset_acquisition', 'asset_disposal', 'unclassified'
            ];
        const errors = classIds
            .filter(classId => !CLASS_PRESENTATION[classId])
            .map(classId => `Missing Activity presentation for ${classId}.`);
        return Object.freeze({ valid: errors.length === 0, errors: Object.freeze(errors) });
    }

    return {
        VERSION,
        CLASS_PRESENTATION,
        buildFinanceActivityPresentation,
        matchesFinanceActivityFilter,
        validate
    };
});
