(function exposeFinanceModalAccessibility(root, factory) {
    const api = factory(root);

    if (typeof module === 'object' && module.exports) {
        module.exports = api;
    }

    if (root && root.document) {
        root.FINANCE_MODAL_SELECTOR = api.FINANCE_MODAL_SELECTOR;
        root.initFinanceModalAccessibility = api.initFinanceModalAccessibility;
        root.enhanceFinanceModal = api.enhanceFinanceModal;
        root.syncFinanceModalAccessibility = api.syncFinanceModalAccessibility;
        root.closeTopFinanceModal = api.closeTopFinanceModal;
        root.validateFinanceModalAccessibility = api.validateFinanceModalAccessibility;
        root.runFinancePhase40BrowserChecks = api.runFinancePhase40BrowserChecks;
    }
})(typeof window !== 'undefined' ? window : globalThis, function createFinanceModalAccessibility(root) {
    'use strict';

    const FINANCE_MODAL_SELECTOR = 'div[id$="-modal"], #auth-overlay';
    const FOCUSABLE_SELECTOR = [
        '[autofocus]',
        '[data-modal-initial-focus]',
        'input:not([type="hidden"]):not([disabled])',
        'select:not([disabled])',
        'textarea:not([disabled])',
        'button:not([disabled])',
        'a[href]',
        '[contenteditable="true"]',
        '[tabindex]:not([tabindex="-1"])'
    ].join(',');
    const CLOSE_CONTROL_SELECTOR = [
        '[data-finance-modal-close]',
        '[data-modal-close]',
        '[data-balance-calc-close]',
        '[aria-label*="close" i]',
        'button[id*="cancel" i]',
        'button[onclick*="close"]',
        'button[onclick*="toggleModal"]'
    ].join(',');

    const state = {
        initialized: false,
        observer: null,
        openStack: [],
        returnFocusByModal: new WeakMap(),
        backgroundInertState: new Map(),
        lastExternalFocus: null,
        lastInteractionTrigger: null
    };

    function getDocument() {
        return root?.document || null;
    }

    function formatFinanceModalFallbackLabel(modalId) {
        const words = String(modalId || '')
            .replace(/-modal$/i, '')
            .replace(/[-_]+/g, ' ')
            .trim();
        if (!words) return 'Finance dialog';
        return words.replace(/\b\w/g, letter => letter.toUpperCase());
    }

    function isFinanceModalElement(element) {
        return !!element
            && typeof element.matches === 'function'
            && element.matches(FINANCE_MODAL_SELECTOR);
    }

    function isFinanceModalOpen(modal) {
        if (!modal) return false;
        const classHidden = modal.classList?.contains('hidden') === true;
        const attributeHidden = modal.hidden === true;
        const hiddenAncestor = modal.parentElement?.closest?.('[hidden], .hidden, [aria-hidden="true"]');
        return !classHidden && !attributeHidden && !hiddenAncestor;
    }

    function isElementUsable(element) {
        if (!element || typeof element.closest !== 'function') return false;
        if (element.disabled || element.getAttribute('aria-disabled') === 'true') return false;
        if (element.closest('[hidden], .hidden, [aria-hidden="true"]')) return false;

        const view = element.ownerDocument?.defaultView;
        if (view?.getComputedStyle) {
            const style = view.getComputedStyle(element);
            if (style.display === 'none' || style.visibility === 'hidden') return false;
        }
        return true;
    }

    function getFocusableElements(modal) {
        if (!modal?.querySelectorAll) return [];
        return Array.from(modal.querySelectorAll(FOCUSABLE_SELECTOR))
            .filter(isElementUsable);
    }

    function ensureModalLabel(modal) {
        if (modal.hasAttribute('aria-labelledby') || modal.hasAttribute('aria-label')) return;
        const heading = modal.querySelector('[data-modal-title], h1, h2, h3, [role="heading"]');
        if (heading) {
            if (!heading.id) heading.id = `${modal.id || 'finance-modal'}-title`;
            modal.setAttribute('aria-labelledby', heading.id);
            return;
        }
        modal.setAttribute('aria-label', formatFinanceModalFallbackLabel(modal.id));
    }

    function ensureModalCloseControlNames(modal) {
        const modalLabel = modal.getAttribute('aria-label')
            || referencedModalLabel(modal)
            || formatFinanceModalFallbackLabel(modal.id);
        Array.from(modal.querySelectorAll(CLOSE_CONTROL_SELECTOR)).forEach(control => {
            const existingName = control.getAttribute('aria-label')
                || control.getAttribute('title')
                || control.textContent?.trim();
            if (!existingName) control.setAttribute('aria-label', `Close ${modalLabel}`);
            if (control.tagName === 'BUTTON' && !control.hasAttribute('type')) control.type = 'button';
        });
    }

    function referencedModalLabel(modal) {
        const labelledBy = String(modal.getAttribute('aria-labelledby') || '').trim();
        if (!labelledBy) return '';
        return labelledBy.split(/\s+/)
            .map(id => modal.ownerDocument?.getElementById(id)?.textContent?.trim() || '')
            .filter(Boolean)
            .join(' ');
    }

    function enhanceFinanceModal(modal) {
        if (!isFinanceModalElement(modal)) return null;
        modal.dataset.financeModalEnhanced = 'true';
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        if (!modal.hasAttribute('tabindex')) modal.tabIndex = -1;
        ensureModalLabel(modal);
        ensureModalCloseControlNames(modal);
        modal.setAttribute('aria-hidden', isFinanceModalOpen(modal) ? 'false' : 'true');
        return modal;
    }

    function getTopOpenModal() {
        for (let index = state.openStack.length - 1; index >= 0; index -= 1) {
            const modal = state.openStack[index];
            if (modal?.isConnected && isFinanceModalOpen(modal)) return modal;
        }
        return null;
    }

    function updateModalBodyState() {
        const documentRef = getDocument();
        if (!documentRef?.body) return;
        const topModal = getTopOpenModal();
        const hasOpenModal = !!topModal;
        documentRef.body.classList.toggle('finance-modal-open', hasOpenModal);
        documentRef.body.dataset.financeModalDepth = String(
            state.openStack.filter(modal => modal?.isConnected && isFinanceModalOpen(modal)).length
        );
        syncBackgroundInert(documentRef, topModal);
    }

    function syncBackgroundInert(documentRef, topModal) {
        state.backgroundInertState.forEach((wasInert, element) => {
            if (!element?.isConnected) return;
            if (wasInert) element.setAttribute('inert', '');
            else element.removeAttribute('inert');
        });
        state.backgroundInertState.clear();
        if (!topModal) return;

        Array.from(documentRef.body.children).forEach(element => {
            if (element === topModal || element.contains(topModal)) return;
            if (['SCRIPT', 'STYLE', 'LINK'].includes(element.tagName)) return;
            state.backgroundInertState.set(element, element.hasAttribute('inert'));
            element.setAttribute('inert', '');
        });
    }

    function chooseReturnFocus(modal) {
        const documentRef = getDocument();
        const active = documentRef?.activeElement;
        const candidates = [state.lastInteractionTrigger, state.lastExternalFocus, active];
        return candidates.find(candidate => (
            candidate
            && candidate !== documentRef?.body
            && candidate.isConnected
            && !modal.contains(candidate)
            && isElementUsable(candidate)
        )) || null;
    }

    function focusInitialModalControl(modal) {
        if (!isFinanceModalOpen(modal) || getTopOpenModal() !== modal) return;
        const documentRef = getDocument();
        if (modal.contains(documentRef?.activeElement)) return;
        const preferred = modal.querySelector('[data-modal-initial-focus], [autofocus]');
        const target = (preferred && isElementUsable(preferred))
            ? preferred
            : (getFocusableElements(modal)[0] || modal);
        try {
            target.focus({ preventScroll: true });
        } catch (error) {
            target.focus?.();
        }
    }

    function handleModalOpened(modal) {
        enhanceFinanceModal(modal);
        modal.setAttribute('aria-hidden', 'false');
        if (!state.openStack.includes(modal)) {
            state.returnFocusByModal.set(modal, chooseReturnFocus(modal));
            state.openStack.push(modal);
        }
        updateModalBodyState();
        root.setTimeout?.(() => focusInitialModalControl(modal), 0);
    }

    function restoreFocusAfterClose(modal, wasTop) {
        const documentRef = getDocument();
        const remainingModal = getTopOpenModal();
        const returnTarget = state.returnFocusByModal.get(modal);
        state.returnFocusByModal.delete(modal);

        root.setTimeout?.(() => {
            if (remainingModal) {
                if (!remainingModal.contains(documentRef?.activeElement)) {
                    focusInitialModalControl(remainingModal);
                }
                return;
            }
            if (wasTop && returnTarget?.isConnected && isElementUsable(returnTarget)) {
                try {
                    returnTarget.focus({ preventScroll: true });
                } catch (error) {
                    returnTarget.focus?.();
                }
            }
        }, 0);
    }

    function handleModalClosed(modal) {
        enhanceFinanceModal(modal);
        modal.setAttribute('aria-hidden', 'true');
        const index = state.openStack.indexOf(modal);
        const wasTop = index === state.openStack.length - 1;
        if (index >= 0) state.openStack.splice(index, 1);
        updateModalBodyState();
        if (index >= 0) restoreFocusAfterClose(modal, wasTop);
    }

    function syncFinanceModalAccessibility(modal) {
        if (!isFinanceModalElement(modal)) return null;
        if (isFinanceModalOpen(modal)) handleModalOpened(modal);
        else handleModalClosed(modal);
        return modal;
    }

    function closeFinanceModal(modal) {
        if (!modal || !isFinanceModalOpen(modal)) return false;
        if (modal.dataset.financeModalDismiss === 'locked') return false;
        const closeControl = modal.querySelector(CLOSE_CONTROL_SELECTOR);
        if (closeControl && isElementUsable(closeControl)) {
            closeControl.click();
            root.setTimeout?.(() => {
                if (isFinanceModalOpen(modal)) {
                    modal.classList.add('hidden');
                    syncFinanceModalAccessibility(modal);
                }
            }, 0);
            return true;
        }
        modal.classList.add('hidden');
        syncFinanceModalAccessibility(modal);
        return true;
    }

    function closeTopFinanceModal() {
        return closeFinanceModal(getTopOpenModal());
    }

    function trapModalFocus(event, modal) {
        const focusable = getFocusableElements(modal);
        if (!focusable.length) {
            event.preventDefault();
            modal.focus();
            return;
        }

        const documentRef = getDocument();
        const active = documentRef?.activeElement;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (!modal.contains(active)) {
            event.preventDefault();
            (event.shiftKey ? last : first).focus();
            return;
        }
        if (!event.shiftKey && active === last) {
            event.preventDefault();
            first.focus();
        } else if (event.shiftKey && active === first) {
            event.preventDefault();
            last.focus();
        }
    }

    function handleDocumentKeydown(event) {
        const modal = getTopOpenModal();
        if (!modal) return;
        if (event.key === 'Escape') {
            event.preventDefault();
            event.stopImmediatePropagation();
            if (modal.dataset.financeModalDismiss === 'locked') {
                focusInitialModalControl(modal);
                return;
            }
            closeFinanceModal(modal);
            return;
        }
        if (event.key === 'Tab') trapModalFocus(event, modal);
    }

    function rememberInteractionTrigger(event) {
        const target = event.target?.closest?.('button, a[href], input, select, textarea, [tabindex]');
        if (!target) return;
        const topModal = getTopOpenModal();
        if (!topModal || !topModal.contains(target)) state.lastInteractionTrigger = target;
    }

    function rememberExternalFocus(event) {
        const target = event.target;
        const topModal = getTopOpenModal();
        if (target?.isConnected && (!topModal || !topModal.contains(target))) {
            state.lastExternalFocus = target;
        }
    }

    function scanForModals(rootNode) {
        if (!rootNode) return [];
        const modals = [];
        if (isFinanceModalElement(rootNode)) modals.push(rootNode);
        if (typeof rootNode.querySelectorAll === 'function') {
            modals.push(...rootNode.querySelectorAll(FINANCE_MODAL_SELECTOR));
        }
        Array.from(new Set(modals)).forEach(syncFinanceModalAccessibility);
        return modals;
    }

    function observeModalChanges() {
        const documentRef = getDocument();
        if (!documentRef?.body || typeof root.MutationObserver !== 'function') return;
        state.observer = new root.MutationObserver(mutations => {
            mutations.forEach(mutation => {
                if (mutation.type === 'attributes') {
                    syncFinanceModalAccessibility(mutation.target);
                    return;
                }
                mutation.addedNodes.forEach(scanForModals);
            });
        });
        state.observer.observe(documentRef.body, {
            subtree: true,
            childList: true,
            attributes: true,
            attributeFilter: ['class', 'hidden']
        });
    }

    function initFinanceModalAccessibility() {
        const documentRef = getDocument();
        if (!documentRef) return null;
        if (state.initialized) {
            scanForModals(documentRef);
            return validateFinanceModalAccessibility(documentRef);
        }

        state.initialized = true;
        documentRef.addEventListener('pointerdown', rememberInteractionTrigger, true);
        documentRef.addEventListener('click', rememberInteractionTrigger, true);
        documentRef.addEventListener('focusin', rememberExternalFocus, true);
        documentRef.addEventListener('keydown', handleDocumentKeydown, true);
        scanForModals(documentRef);
        observeModalChanges();
        return validateFinanceModalAccessibility(documentRef);
    }

    function validateFinanceModalAccessibility(documentRef = getDocument()) {
        const errors = [];
        const modals = documentRef?.querySelectorAll
            ? Array.from(documentRef.querySelectorAll(FINANCE_MODAL_SELECTOR))
            : [];
        modals.forEach(modal => {
            if (modal.getAttribute('role') !== 'dialog') errors.push(`${modal.id}: missing dialog role`);
            if (modal.getAttribute('aria-modal') !== 'true') errors.push(`${modal.id}: missing aria-modal`);
            if (!modal.hasAttribute('aria-labelledby') && !modal.hasAttribute('aria-label')) {
                errors.push(`${modal.id}: missing accessible name`);
            }
            const expectedHidden = isFinanceModalOpen(modal) ? 'false' : 'true';
            if (modal.getAttribute('aria-hidden') !== expectedHidden) {
                errors.push(`${modal.id}: aria-hidden does not match visibility`);
            }
        });
        return Object.freeze({
            valid: errors.length === 0,
            modalCount: modals.length,
            openModalCount: modals.filter(isFinanceModalOpen).length,
            errors: Object.freeze(errors)
        });
    }

    function waitForModalTurn() {
        return new Promise(resolve => root.setTimeout(resolve, 0));
    }

    async function runFinancePhase40BrowserChecks(options = {}) {
        const documentRef = getDocument();
        const errors = [];
        const details = {};
        if (!documentRef?.body) {
            return { valid: false, errors: ['Browser document is unavailable.'], details };
        }

        initFinanceModalAccessibility();
        const modalValidation = validateFinanceModalAccessibility(documentRef);
        details.modalContract = modalValidation;
        errors.push(...modalValidation.errors);

        const nestedControls = Array.from(documentRef.querySelectorAll(
            'button button, button [role="button"], a button, a [role="button"]'
        ));
        details.nestedInteractiveControlCount = nestedControls.length;
        if (nestedControls.length) errors.push(`${nestedControls.length} nested interactive control(s) found.`);

        const viewIds = Object.keys(root.FINANCE_VIEW_DEFINITIONS || {});
        const missingViews = viewIds.filter(viewId => (
            !documentRef.querySelector(`[data-finance-view="${viewId}"]`)
            || !documentRef.querySelector(`[data-finance-view-target="${viewId}"]`)
        ));
        details.routeCount = viewIds.length;
        details.missingViews = missingViews;
        if (missingViews.length) errors.push(`Missing route surfaces: ${missingViews.join(', ')}`);

        const previousViewId = documentRef.body.dataset.financeActiveView || 'overview';
        if (options.exerciseRoutes !== false && typeof root.openFinanceView === 'function') {
            viewIds.forEach(viewId => {
                root.openFinanceView(viewId, { historyMode: 'none', scroll: false });
                const section = documentRef.querySelector(`[data-finance-view="${viewId}"]`);
                if (!section || section.hidden) errors.push(`${viewId}: route did not become visible`);
            });
            root.openFinanceView(previousViewId, { historyMode: 'none', scroll: false });
        }

        const opener = documentRef.createElement('button');
        opener.type = 'button';
        opener.textContent = 'Phase 4-0 test opener';
        opener.hidden = false;
        const fixture = documentRef.createElement('div');
        fixture.id = 'finance-phase-4-0-test-modal';
        fixture.className = 'fixed inset-0 hidden';
        fixture.innerHTML = `
            <div>
                <h2>Phase 4-0 test dialog</h2>
                <input data-modal-initial-focus aria-label="Test input">
                <button type="button" data-finance-modal-close>Close test dialog</button>
            </div>`;
        documentRef.body.append(opener, fixture);
        const fixtureClose = fixture.querySelector('[data-finance-modal-close]');
        fixtureClose.addEventListener('click', () => {
            fixture.classList.add('hidden');
            syncFinanceModalAccessibility(fixture);
        });

        enhanceFinanceModal(fixture);
        opener.focus();
        state.lastInteractionTrigger = opener;
        fixture.classList.remove('hidden');
        syncFinanceModalAccessibility(fixture);
        await waitForModalTurn();
        if (fixture.getAttribute('role') !== 'dialog' || fixture.getAttribute('aria-modal') !== 'true') {
            errors.push('Modal fixture did not receive dialog semantics.');
        }
        if (!fixture.contains(documentRef.activeElement)) errors.push('Modal fixture did not receive initial focus.');

        documentRef.dispatchEvent(new root.KeyboardEvent('keydown', {
            key: 'Escape',
            bubbles: true,
            cancelable: true
        }));
        await waitForModalTurn();
        await waitForModalTurn();
        if (!fixture.classList.contains('hidden')) errors.push('Escape did not close the modal fixture.');
        if (documentRef.activeElement !== opener) errors.push('Focus did not return to the modal opener.');

        fixture.remove();
        opener.remove();
        state.openStack = state.openStack.filter(modal => modal !== fixture);
        updateModalBodyState();

        return Object.freeze({
            valid: errors.length === 0,
            errors: Object.freeze(errors),
            details: Object.freeze(details)
        });
    }

    return {
        FINANCE_MODAL_SELECTOR,
        FOCUSABLE_SELECTOR,
        CLOSE_CONTROL_SELECTOR,
        formatFinanceModalFallbackLabel,
        isFinanceModalOpen,
        enhanceFinanceModal,
        syncFinanceModalAccessibility,
        closeTopFinanceModal,
        initFinanceModalAccessibility,
        validateFinanceModalAccessibility,
        syncBackgroundInert,
        runFinancePhase40BrowserChecks
    };
});
