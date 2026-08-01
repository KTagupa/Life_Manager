(function exposeFinanceWealthCoordination(root) {
    'use strict';

    function getFinanceWealthPresentation() {
        if (typeof root.buildFinanceWealthPresentation !== 'function') return null;
        const report = typeof root.getFinanceSnapshotShadowReport === 'function'
            ? root.getFinanceSnapshotShadowReport()
            : (root.financeSnapshotShadowReport || null);
        return root.buildFinanceWealthPresentation(report);
    }

    function setText(id, value) {
        const element = root.document?.getElementById(id);
        if (element) element.textContent = value;
    }

    function money(position, key = 'value') {
        return position?.available && Number.isFinite(Number(position?.[key]))
            ? root.fmt(Number(position[key]))
            : 'n/a';
    }

    function formatAsOf(value) {
        const date = new Date(value);
        return Number.isFinite(date.getTime())
            ? date.toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
            : 'Snapshot pending';
    }

    function domainCountLabel(domain) {
        const noun = domain.id === 'fixed_assets' ? 'asset'
            : domain.id === 'receivables' ? 'person'
                : domain.id === 'crypto' ? 'holding'
                    : domain.id === 'credit_cards' ? 'card'
                        : domain.id === 'debts' ? 'debt'
                            : 'plan';
        return `${domain.count} ${domain.count === 1 ? noun : `${noun}s`}`;
    }

    function domainDetail(domain) {
        if (domain.id === 'crypto') {
            if (domain.available) return `${domainCountLabel(domain)} • Market value`;
            const priceLabel = domain.missingPriceCount
                ? `${domain.missingPriceCount} missing ${domain.missingPriceCount === 1 ? 'price' : 'prices'}`
                : 'Market price unavailable';
            const bookLabel = Number.isFinite(domain.bookValue) ? ` • Book ${root.fmt(domain.bookValue)}` : '';
            return `${priceLabel}${bookLabel}`;
        }
        if (domain.id === 'installments') {
            return `${domainCountLabel(domain)} • Principal ${root.fmt(domain.principalValue)} • Future charges ${root.fmt(domain.financeChargeValue)}`;
        }
        return `${domainCountLabel(domain)} • ${domain.detail}`;
    }

    function renderDomains(domains) {
        const container = root.document?.getElementById('finance-wealth-domains');
        if (!container) return;
        container.innerHTML = (domains || []).map(domain => `
            <button type="button" class="finance-wealth-domain" data-wealth-role="${root.escapeAttr(domain.role)}"
                data-finance-wealth-action="${root.escapeAttr(domain.actionId)}"
                aria-label="Review ${root.escapeAttr(domain.label)}">
                <span>${root.escapeHTML(domain.label)}</span>
                <strong>${domain.available ? root.fmt(domain.value) : 'n/a'}</strong>
                <small>${root.escapeHTML(domainDetail(domain))}</small>
            </button>`).join('');
    }

    function renderAttention(attention) {
        const container = root.document?.getElementById('finance-wealth-attention-list');
        if (!container) return;
        container.innerHTML = (attention || []).map(item => `
            <article class="finance-wealth-attention-item" data-wealth-tone="${root.escapeAttr(item.tone)}">
                <div>
                    <strong>${root.escapeHTML(item.title)}</strong>
                    <p>${root.escapeHTML(item.detail)}</p>
                </div>
                <button type="button" data-finance-wealth-action="${root.escapeAttr(item.actionId)}">${root.escapeHTML(item.actionLabel)}</button>
            </article>`).join('');
    }

    function renderFinanceWealthCoordinator() {
        const presentation = getFinanceWealthPresentation();
        if (!presentation) return;
        root.financeWealthPresentation = presentation;

        const coordinator = root.document?.getElementById('finance-wealth-coordinator');
        if (coordinator) {
            coordinator.dataset.wealthStatus = presentation.status;
            coordinator.dataset.attentionCount = String(presentation.attention.length);
        }
        setText('finance-wealth-as-of', `As of ${formatAsOf(presentation.asOf)}`);
        setText('finance-wealth-market-value', money(presentation.market));
        setText('finance-wealth-market-assets', presentation.market.available
            ? `${root.fmt(presentation.market.assets)} assets − ${root.fmt(presentation.market.liabilities)} liabilities`
            : (presentation.market.reason === 'missing_market_prices'
                ? 'Waiting for all crypto market prices'
                : 'Waiting for the market-value reconciliation gate'));
        setText('finance-wealth-book-value', money(presentation.book));
        setText('finance-wealth-book-assets', presentation.book.available
            ? `${root.fmt(presentation.book.assets)} assets − ${root.fmt(presentation.book.liabilities)} liabilities`
            : 'Waiting for the current book-value reconciliation gate');
        setText('finance-wealth-cash-value', presentation.cash.available
            ? root.fmt(presentation.cash.value)
            : 'n/a');
        setText('finance-wealth-liability-value', presentation.liabilities.available
            ? root.fmt(presentation.liabilities.total)
            : 'n/a');

        renderDomains(presentation.domains);
        renderAttention(presentation.attention);
        if (root.lucide) root.lucide.createIcons();
    }

    function focusCard(cardId) {
        const card = root.document?.getElementById(cardId);
        if (!card) return;
        card.scrollIntoView({ behavior: 'smooth', block: 'start' });
        card.focus({ preventScroll: true });
    }

    function handleFinanceWealthAction(actionId) {
        if (actionId === 'add_asset' && typeof root.openAssetModal === 'function') return root.openAssetModal();
        if (actionId === 'open_crypto' && typeof root.openCryptoPortfolio === 'function') return root.openCryptoPortfolio();
        if (actionId === 'add_lent' && typeof root.toggleModal === 'function') return root.toggleModal('lent-modal');
        const targets = {
            focus_assets: 'finance-card-assets',
            focus_lent: 'finance-card-lent',
            focus_cards: 'finance-card-credit-cards',
            focus_debts: 'finance-card-debts',
            focus_installments: 'finance-card-installments'
        };
        if (targets[actionId]) focusCard(targets[actionId]);
    }

    function initFinanceWealthCoordination() {
        if (root.__financeWealthCoordinationInitialized) return;
        root.__financeWealthCoordinationInitialized = true;
        root.document?.addEventListener('click', event => {
            const action = event.target.closest('[data-finance-wealth-action]');
            if (!action) return;
            event.preventDefault();
            handleFinanceWealthAction(action.dataset.financeWealthAction);
        });
        root.addEventListener('finance:snapshot-shadow-updated', () => {
            const active = typeof root.shouldRenderFinanceRoute === 'function'
                ? root.shouldRenderFinanceRoute('wealth')
                : root.document?.body?.dataset?.financeActiveView === 'wealth';
            if (active) renderFinanceWealthCoordinator();
        });
    }

    root.getFinanceWealthPresentation = getFinanceWealthPresentation;
    root.renderFinanceWealthCoordinator = renderFinanceWealthCoordinator;
    root.initFinanceWealthCoordination = initFinanceWealthCoordination;
})(typeof window !== 'undefined' ? window : globalThis);
