(function (root, factory) {
    const api = factory();

    if (typeof module === 'object' && module.exports) {
        module.exports = api;
    }

    if (root) {
        root.FINANCE_VIEW_DEFINITIONS = api.FINANCE_VIEW_DEFINITIONS;
        root.FINANCE_CARD_VIEW_MAP = api.FINANCE_CARD_VIEW_MAP;
        root.normalizeFinanceViewId = api.normalizeFinanceViewId;
        root.resolveInitialFinanceView = api.resolveInitialFinanceView;
        root.buildFinanceViewUrl = api.buildFinanceViewUrl;
        root.resolveFinanceHistoryMode = api.resolveFinanceHistoryMode;
        root.getFinanceViewForCard = api.getFinanceViewForCard;
        root.initFinanceNavigation = api.initFinanceNavigation;
        root.openFinanceView = api.openFinanceView;
        root.runFinanceNavigationHistoryChecks = api.runFinanceNavigationHistoryChecks;
    }
})(typeof window !== 'undefined' ? window : globalThis, function () {
    const STORAGE_KEY = 'finance_active_view_v1';

    function deepFreeze(value) {
        if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
        Object.values(value).forEach(deepFreeze);
        return Object.freeze(value);
    }

    const FINANCE_VIEW_DEFINITIONS = deepFreeze({
        overview: {
            label: 'Overview',
            subtitle: 'Your current position, priorities, and recent signals.',
            primary: true
        },
        activity: {
            label: 'Activity',
            subtitle: 'Search, review, and add money movements in one place.',
            primary: true
        },
        plan: {
            label: 'Plan',
            subtitle: 'Turn upcoming bills, goals, and purchases into a workable plan.',
            primary: true
        },
        wealth: {
            label: 'Wealth',
            subtitle: 'Manage assets, obligations, receivables, and crypto holdings.',
            primary: true
        },
        reports: {
            label: 'Reports',
            subtitle: 'Explore income mix, trends, spending, and budget variance.',
            primary: true
        },
        tools: {
            label: 'Tools & settings',
            subtitle: 'Review safeguard status, manage recovery, and open focused utilities.',
            primary: false
        }
    });

    const FINANCE_CARD_VIEW_MAP = deepFreeze({
        ledger: 'activity',
        wishlist: 'plan',
        'plan-budget': 'plan',
        assets: 'wealth',
        installments: 'wealth',
        insights: 'overview',
        revenue: 'reports',
        trends: 'reports',
        goals: 'plan',
        debts: 'wealth',
        'credit-cards': 'wealth',
        lent: 'wealth',
        bills: 'plan',
        spend: 'reports',
        variance: 'reports'
    });

    const VIEW_CONTENT = deepFreeze({
        overview: [
            { selector: '.finance-summary-grid', span: 'full' },
            { selector: '#finance-overview-attention', span: 'full' },
            { selector: '#finance-card-insights', span: 'full' }
        ],
        activity: [
            { selector: '#finance-card-ledger-search', span: 'full' },
            { selector: '#recurring-reminders-banner', span: 'full' },
            { selector: '#crypto-duplicate-review-panel', span: 'full' },
            { selector: '#finance-card-ledger', span: 'full' }
        ],
        plan: [
            { selector: '#finance-plan-coordinator', span: 'full' },
            { selector: '#finance-card-plan-budget', span: 'half' },
            { selector: '#finance-card-bills', span: 'half' },
            { selector: '#finance-card-goals', span: 'half' },
            { selector: '#finance-card-wishlist', span: 'half' }
        ],
        wealth: [
            { selector: '#finance-wealth-coordinator', span: 'full' },
            { selector: '#crypto-toolkit-panel', span: 'full' },
            { selector: '#finance-card-assets', span: 'half' },
            { selector: '#finance-card-lent', span: 'half' },
            { selector: '#finance-card-credit-cards', span: 'half' },
            { selector: '#finance-card-debts', span: 'half' },
            { selector: '#finance-card-installments', span: 'half' }
        ],
        reports: [
            { selector: '#finance-reports-coordinator', span: 'full' },
            { selector: '#business-kpi-panel', span: 'full' },
            { selector: '#finance-card-revenue', span: 'half' },
            { selector: '#finance-card-trends', span: 'half' },
            { selector: '#finance-card-spend', span: 'half' },
            { selector: '#finance-card-variance', span: 'half' }
        ],
        tools: [
            { selector: '#storage-diagnostics-panel', span: 'full' }
        ]
    });

    const state = {
        initialized: false,
        activeViewId: null
    };

    function normalizeFinanceViewId(value) {
        const normalized = String(value || '')
            .trim()
            .replace(/^#/, '')
            .toLowerCase();
        return Object.prototype.hasOwnProperty.call(FINANCE_VIEW_DEFINITIONS, normalized)
            ? normalized
            : null;
    }

    function resolveInitialFinanceView(hash, savedViewId) {
        const hashViewId = normalizeFinanceViewId(hash);
        if (hashViewId) return hashViewId;
        const explicitInvalidHash = String(hash || '').replace(/^#/, '').trim();
        if (explicitInvalidHash) return 'overview';
        return normalizeFinanceViewId(savedViewId) || 'overview';
    }

    function buildFinanceViewUrl(pathname, search, viewId) {
        const normalized = normalizeFinanceViewId(viewId) || 'overview';
        return `${pathname || ''}${search || ''}#${normalized}`;
    }

    function resolveFinanceHistoryMode(requestedMode, previousViewId, nextViewId) {
        const mode = ['push', 'replace', 'none'].includes(requestedMode) ? requestedMode : 'push';
        if (mode === 'push' && previousViewId === nextViewId) return 'replace';
        return mode;
    }

    function getFinanceViewForCard(cardKey) {
        return FINANCE_CARD_VIEW_MAP[String(cardKey || '').trim().toLowerCase()] || null;
    }

    function getDocument() {
        return typeof document !== 'undefined' ? document : null;
    }

    function moveContentIntoViews() {
        const doc = getDocument();
        if (!doc) return;

        Object.entries(VIEW_CONTENT).forEach(([viewId, items]) => {
            const slot = doc.querySelector(`[data-finance-view-slot="${viewId}"]`);
            if (!slot) return;

            items.forEach(({ selector, span }) => {
                const element = doc.querySelector(selector);
                if (!element || element.parentElement === slot) return;
                element.classList.add('finance-view-item', 'finance-routed-card');
                element.dataset.financeViewSpan = span;
                slot.appendChild(element);
            });
        });

        const legacyGrid = doc.getElementById('finance-legacy-dashboard-grid');
        if (legacyGrid) legacyGrid.hidden = true;

        const modalPortal = doc.getElementById('finance-modal-portal');
        const balanceModal = doc.getElementById('balance-calculation-modal');
        if (modalPortal && balanceModal && balanceModal.parentElement !== modalPortal) {
            modalPortal.appendChild(balanceModal);
        }
    }

    function setMoreMenuOpen(shouldOpen, options = {}) {
        const doc = getDocument();
        if (!doc) return;
        const button = doc.getElementById('finance-more-button');
        const menu = doc.getElementById('finance-more-menu');
        if (!button || !menu) return;
        menu.hidden = !shouldOpen;
        button.setAttribute('aria-expanded', shouldOpen ? 'true' : 'false');
        if (!shouldOpen && options.restoreFocus) {
            try {
                button.focus({ preventScroll: true });
            } catch (_) {
                button.focus();
            }
        }
    }

    function updateHistory(viewId, historyMode) {
        if (typeof window === 'undefined' || !window.history || historyMode === 'none') return;
        const url = buildFinanceViewUrl(window.location.pathname, window.location.search, viewId);
        if (historyMode === 'push') {
            window.history.pushState({ financeView: viewId }, '', url);
        } else {
            window.history.replaceState({ financeView: viewId }, '', url);
        }
    }

    function openFinanceView(requestedViewId, options = {}) {
        const doc = getDocument();
        const viewId = normalizeFinanceViewId(requestedViewId) || 'overview';
        const definition = FINANCE_VIEW_DEFINITIONS[viewId];
        const previousViewId = state.activeViewId;

        if (!doc) {
            state.activeViewId = viewId;
            return viewId;
        }

        doc.querySelectorAll('#finance-view-root > [data-finance-view]').forEach(section => {
            const isActive = section.dataset.financeView === viewId;
            section.hidden = !isActive;
            section.setAttribute('aria-hidden', isActive ? 'false' : 'true');
        });

        doc.querySelectorAll('[data-finance-view-target]').forEach(button => {
            const isActive = button.dataset.financeViewTarget === viewId;
            button.classList.toggle('is-active', isActive);
            button.setAttribute('aria-current', isActive ? 'page' : 'false');
            if (button.getAttribute('role') === 'tab') {
                button.setAttribute('aria-selected', isActive ? 'true' : 'false');
                button.tabIndex = isActive ? 0 : -1;
            }
        });

        const title = doc.getElementById('finance-view-title');
        const subtitle = doc.getElementById('finance-view-subtitle');
        const announcer = doc.getElementById('finance-view-announcer');
        if (title) title.textContent = definition.label;
        if (subtitle) subtitle.textContent = definition.subtitle;
        if (announcer && previousViewId !== viewId) announcer.textContent = `${definition.label} view opened`;
        if (doc.body) doc.body.dataset.financeActiveView = viewId;

        state.activeViewId = viewId;
        setMoreMenuOpen(false);

        try {
            window.localStorage.setItem(STORAGE_KEY, viewId);
        } catch (error) {
            console.warn('[finance-navigation] Could not save the active view.', error);
        }

        const requestedHistoryMode = options.historyMode || (previousViewId ? 'push' : 'replace');
        const historyMode = resolveFinanceHistoryMode(requestedHistoryMode, previousViewId, viewId);
        updateHistory(viewId, historyMode);

        if (options.focusHeading && title) {
            if (!title.hasAttribute('tabindex')) title.tabIndex = -1;
            try {
                title.focus({ preventScroll: true });
            } catch (_) {
                title.focus();
            }
        }

        if (options.scroll) {
            const shell = doc.querySelector('.finance-workspace-shell');
            if (shell) shell.scrollIntoView({ behavior: options.behavior || 'smooth', block: 'start' });
        }

        if (previousViewId !== viewId && typeof window.CustomEvent === 'function') {
            window.dispatchEvent(new CustomEvent('finance:viewchange', {
                detail: { viewId, previousViewId }
            }));
        }

        return viewId;
    }

    function invokeFinanceAction(actionName) {
        const action = typeof window !== 'undefined' ? window[actionName] : null;
        if (typeof action !== 'function') {
            console.warn(`[finance-navigation] Action "${actionName}" is unavailable.`);
            return;
        }
        action.call(window);
    }

    function handleDocumentClick(event) {
        const target = event.target instanceof Element ? event.target : null;
        if (!target) return;

        const viewButton = target.closest('[data-finance-view-target]');
        if (viewButton) {
            event.preventDefault();
            const fromMorePanel = !!viewButton.closest('#finance-more-menu');
            openFinanceView(viewButton.dataset.financeViewTarget, {
                historyMode: 'push',
                scroll: true,
                focusHeading: fromMorePanel
            });
            return;
        }

        const actionButton = target.closest('[data-finance-action]');
        if (actionButton) {
            event.preventDefault();
            setMoreMenuOpen(false);
            invokeFinanceAction(actionButton.dataset.financeAction);
            return;
        }

        const moreButton = target.closest('#finance-more-button');
        if (moreButton) {
            const isOpen = moreButton.getAttribute('aria-expanded') === 'true';
            setMoreMenuOpen(!isOpen);
            return;
        }

        if (!target.closest('#finance-more-menu')) setMoreMenuOpen(false);
    }

    function handleDocumentKeydown(event) {
        if (event.key === 'Escape') {
            const moreButton = document.getElementById('finance-more-button');
            const wasOpen = moreButton?.getAttribute('aria-expanded') === 'true';
            setMoreMenuOpen(false, { restoreFocus: wasOpen });
            return;
        }

        const tab = event.target instanceof Element
            ? event.target.closest('.finance-view-tabs [role="tab"]')
            : null;
        if (!tab || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;

        const tabs = Array.from(document.querySelectorAll('.finance-view-tabs [role="tab"]'));
        const currentIndex = tabs.indexOf(tab);
        if (currentIndex < 0) return;

        event.preventDefault();
        let nextIndex = currentIndex;
        if (event.key === 'Home') nextIndex = 0;
        if (event.key === 'End') nextIndex = tabs.length - 1;
        if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
        if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % tabs.length;

        const nextTab = tabs[nextIndex];
        nextTab.focus();
        openFinanceView(nextTab.dataset.financeViewTarget, { historyMode: 'push', scroll: false });
    }

    function handleBrowserNavigation() {
        const requestedViewId = normalizeFinanceViewId(window.location.hash);
        const viewId = requestedViewId || 'overview';
        openFinanceView(viewId, {
            historyMode: requestedViewId ? 'none' : 'replace',
            scroll: false
        });
    }

    function waitForHistoryView(viewId, timeoutMs = 1200) {
        return new Promise(resolve => {
            const startedAt = Date.now();
            const check = () => {
                if (state.activeViewId === viewId) {
                    resolve(true);
                    return;
                }
                if (Date.now() - startedAt >= timeoutMs) {
                    resolve(false);
                    return;
                }
                window.setTimeout(check, 10);
            };
            check();
        });
    }

    async function runFinanceNavigationHistoryChecks() {
        const errors = [];
        const details = { sequence: [] };
        const doc = getDocument();
        if (!doc || typeof window === 'undefined' || !window.history) {
            return deepFreeze({ valid: false, errors: ['Browser history is unavailable.'], details });
        }

        const initialUrl = window.location.href;
        const initialViewId = state.activeViewId || normalizeFinanceViewId(window.location.hash) || 'overview';
        const sequence = ['overview', 'activity', 'plan'].filter((viewId, index, values) => (
            Object.prototype.hasOwnProperty.call(FINANCE_VIEW_DEFINITIONS, viewId)
            && values.indexOf(viewId) === index
        ));
        if (sequence.length < 3) {
            return deepFreeze({ valid: false, errors: ['Not enough routes are available for history checks.'], details });
        }

        openFinanceView(sequence[0], { historyMode: 'replace', scroll: false });
        openFinanceView(sequence[1], { historyMode: 'push', scroll: false });
        openFinanceView(sequence[2], { historyMode: 'push', scroll: false });
        details.sequence.push(...sequence);

        window.history.back();
        if (!await waitForHistoryView(sequence[1])) errors.push('Browser Back did not restore the second route.');
        window.history.back();
        if (!await waitForHistoryView(sequence[0])) errors.push('Browser Back did not restore the first route.');
        window.history.forward();
        if (!await waitForHistoryView(sequence[1])) errors.push('Browser Forward did not restore the second route.');
        window.history.forward();
        if (!await waitForHistoryView(sequence[2])) errors.push('Browser Forward did not restore the third route.');

        window.history.replaceState({ financeView: initialViewId }, '', initialUrl);
        openFinanceView(initialViewId, { historyMode: 'none', scroll: false });
        details.restoredViewId = initialViewId;
        details.restoredUrl = window.location.href;
        if (window.location.href !== initialUrl) errors.push('History check did not restore the original URL.');

        return deepFreeze({ valid: errors.length === 0, errors, details });
    }

    function initFinanceNavigation() {
        const doc = getDocument();
        if (!doc || state.initialized) return state.activeViewId;

        moveContentIntoViews();

        doc.querySelectorAll('[data-finance-view-target]').forEach(button => {
            const viewId = normalizeFinanceViewId(button.dataset.financeViewTarget);
            if (viewId) {
                button.setAttribute('aria-controls', `finance-view-${viewId}`);
                button.classList.add('descriptor-icon-disabled');
                if (button.getAttribute('role') === 'tab') button.id = `finance-view-tab-${viewId}`;
            }
        });
        doc.querySelectorAll('#finance-view-root > [data-finance-view]').forEach(section => {
            const viewId = section.dataset.financeView;
            const tab = doc.getElementById(`finance-view-tab-${viewId}`);
            section.id = `finance-view-${viewId}`;
            section.tabIndex = -1;
            if (tab) {
                section.setAttribute('role', 'tabpanel');
                section.setAttribute('aria-labelledby', tab.id);
            } else {
                section.setAttribute('role', 'region');
                section.setAttribute('aria-label', FINANCE_VIEW_DEFINITIONS[viewId]?.label || viewId);
            }
        });

        doc.addEventListener('click', handleDocumentClick);
        doc.addEventListener('keydown', handleDocumentKeydown);
        window.addEventListener('popstate', handleBrowserNavigation);
        window.addEventListener('hashchange', handleBrowserNavigation);

        let savedViewId = null;
        try {
            savedViewId = window.localStorage.getItem(STORAGE_KEY);
        } catch (error) {
            console.warn('[finance-navigation] Could not read the saved view.', error);
        }

        state.initialized = true;
        const initialViewId = resolveInitialFinanceView(window.location.hash, savedViewId);
        return openFinanceView(initialViewId, { historyMode: 'replace', scroll: false });
    }

    return {
        FINANCE_VIEW_DEFINITIONS,
        FINANCE_CARD_VIEW_MAP,
        VIEW_CONTENT,
        normalizeFinanceViewId,
        resolveInitialFinanceView,
        buildFinanceViewUrl,
        resolveFinanceHistoryMode,
        getFinanceViewForCard,
        initFinanceNavigation,
        openFinanceView,
        runFinanceNavigationHistoryChecks
    };
});
