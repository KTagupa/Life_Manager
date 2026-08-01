(function exposeFinanceAccessibility(root, factory) {
    const api = factory(root);

    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) {
        root.FINANCE_ACCESSIBILITY_VERSION = api.VERSION;
        root.FINANCE_CONTRAST_CONTRACT = api.FINANCE_CONTRAST_CONTRACT;
        root.getFinanceContrastRatio = api.getContrastRatio;
        root.validateFinanceContrastContract = api.validateFinanceContrastContract;
        root.validateFinanceAccessibility = api.validateFinanceAccessibility;
        root.auditFinanceComputedContrast = api.auditFinanceComputedContrast;
        root.initFinanceAccessibility = api.initFinanceAccessibility;
        root.runFinancePhase5ABrowserChecks = api.runFinancePhase5ABrowserChecks;
    }
})(typeof window !== 'undefined' ? window : globalThis, function createFinanceAccessibility(root) {
    'use strict';

    const VERSION = '1.0.0';
    const NORMAL_TEXT_MINIMUM = 4.5;
    const LARGE_TEXT_MINIMUM = 3;

    function deepFreeze(value) {
        if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
        Object.values(value).forEach(deepFreeze);
        return Object.freeze(value);
    }

    const FINANCE_CONTRAST_CONTRACT = deepFreeze([
        { id: 'body_text', foreground: '#334155', background: '#ffffff', minimum: NORMAL_TEXT_MINIMUM },
        { id: 'muted_text', foreground: '#64748b', background: '#ffffff', minimum: NORMAL_TEXT_MINIMUM },
        { id: 'primary_action', foreground: '#ffffff', background: '#4f46e5', minimum: NORMAL_TEXT_MINIMUM },
        { id: 'indigo_link', foreground: '#4338ca', background: '#eef2ff', minimum: NORMAL_TEXT_MINIMUM },
        { id: 'warning_text', foreground: '#92400e', background: '#fffbeb', minimum: NORMAL_TEXT_MINIMUM },
        { id: 'danger_text', foreground: '#be123c', background: '#fff1f2', minimum: NORMAL_TEXT_MINIMUM },
        { id: 'dark_body_text', foreground: '#cbd5e1', background: '#0f172a', minimum: NORMAL_TEXT_MINIMUM },
        { id: 'dark_muted_text', foreground: '#94a3b8', background: '#0f172a', minimum: NORMAL_TEXT_MINIMUM },
        { id: 'focus_indicator_light', foreground: '#7c3aed', background: '#ffffff', minimum: LARGE_TEXT_MINIMUM },
        { id: 'focus_indicator_dark', foreground: '#c4b5fd', background: '#0f172a', minimum: LARGE_TEXT_MINIMUM }
    ]);

    const ICON_LABELS = deepFreeze({
        x: 'Close dialog',
        plus: 'Add item',
        refresh: 'Refresh',
        'refresh-cw': 'Refresh',
        download: 'Download',
        upload: 'Upload',
        search: 'Search',
        settings: 'Open settings',
        menu: 'Open menu',
        trash: 'Delete item',
        'trash-2': 'Delete item',
        edit: 'Edit item',
        pencil: 'Edit item',
        copy: 'Copy',
        eye: 'View details',
        'eye-off': 'Hide details',
        'chevron-left': 'Previous',
        'chevron-right': 'Next',
        'arrow-left': 'Back',
        'arrow-right': 'Next'
    });

    const state = {
        initialized: false,
        observer: null
    };

    function parseHexColor(value) {
        const raw = String(value || '').trim().replace(/^#/, '');
        const normalized = raw.length === 3
            ? raw.split('').map(character => character + character).join('')
            : raw;
        if (!/^[0-9a-f]{6}$/i.test(normalized)) return null;
        return [0, 2, 4].map(offset => parseInt(normalized.slice(offset, offset + 2), 16));
    }

    function parseCssColor(value) {
        const hex = parseHexColor(value);
        if (hex) return { rgb: hex, alpha: 1 };
        const match = String(value || '').match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+))?\s*\)$/i);
        if (!match) return null;
        return {
            rgb: [Number(match[1]), Number(match[2]), Number(match[3])].map(channel => Math.max(0, Math.min(255, channel))),
            alpha: match[4] == null ? 1 : Math.max(0, Math.min(1, Number(match[4])))
        };
    }

    function linearChannel(channel) {
        const normalized = channel / 255;
        return normalized <= 0.04045
            ? normalized / 12.92
            : ((normalized + 0.055) / 1.055) ** 2.4;
    }

    function relativeLuminance(color) {
        const rgb = Array.isArray(color) ? color : parseHexColor(color);
        if (!rgb) return null;
        const [red, green, blue] = rgb.map(linearChannel);
        return (0.2126 * red) + (0.7152 * green) + (0.0722 * blue);
    }

    function getContrastRatio(foreground, background) {
        const foregroundLuminance = relativeLuminance(foreground);
        const backgroundLuminance = relativeLuminance(background);
        if (foregroundLuminance == null || backgroundLuminance == null) return null;
        const lighter = Math.max(foregroundLuminance, backgroundLuminance);
        const darker = Math.min(foregroundLuminance, backgroundLuminance);
        return (lighter + 0.05) / (darker + 0.05);
    }

    function validateFinanceContrastContract() {
        const results = FINANCE_CONTRAST_CONTRACT.map(pair => {
            const ratio = getContrastRatio(pair.foreground, pair.background);
            return { ...pair, ratio, valid: ratio != null && ratio >= pair.minimum };
        });
        const failures = results.filter(result => !result.valid);
        return deepFreeze({
            valid: failures.length === 0,
            pairCount: results.length,
            failures,
            results
        });
    }

    function wordsFromIdentifier(value) {
        return String(value || '')
            .replace(/^(btn|finance|modal|input|select|field)-/i, '')
            .replace(/[-_]+/g, ' ')
            .replace(/\b\w/g, character => character.toUpperCase())
            .trim();
    }

    function referencedText(element, attributeName) {
        const documentRef = element?.ownerDocument;
        return String(element?.getAttribute?.(attributeName) || '')
            .split(/\s+/)
            .map(id => documentRef?.getElementById?.(id)?.textContent?.trim() || '')
            .filter(Boolean)
            .join(' ');
    }

    function getAssociatedLabelText(control) {
        if (!control) return '';
        const directLabels = control.labels ? Array.from(control.labels) : [];
        const direct = directLabels.map(label => label.textContent?.trim() || '').find(Boolean);
        if (direct) return direct;
        const wrapping = control.closest?.('label');
        if (wrapping) return wrapping.textContent?.trim() || '';
        const parent = control.parentElement;
        if (!parent) return '';
        const siblings = Array.from(parent.children || []);
        const index = siblings.indexOf(control);
        for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
            const candidate = siblings[cursor];
            if (candidate?.tagName === 'LABEL') return candidate.textContent?.trim() || '';
            if (candidate?.matches?.('input, select, textarea, button')) break;
        }
        return '';
    }

    function getAccessibleName(element) {
        if (!element) return '';
        const ariaLabel = element.getAttribute?.('aria-label')?.trim();
        if (ariaLabel) return ariaLabel;
        const labelled = referencedText(element, 'aria-labelledby');
        if (labelled) return labelled;
        if (element.matches?.('input, select, textarea')) {
            const label = getAssociatedLabelText(element);
            if (label) return label;
            const placeholder = element.getAttribute('placeholder')?.trim();
            if (placeholder) return placeholder;
        }
        const text = element.textContent?.replace(/\s+/g, ' ').trim();
        if (text) return text;
        return element.getAttribute?.('title')?.trim() || element.getAttribute?.('alt')?.trim() || '';
    }

    function inferButtonLabel(button) {
        const onclick = String(button.getAttribute?.('onclick') || '');
        if (/close|toggleModal/i.test(onclick)) return 'Close dialog';
        const actionName = button.dataset?.financeAction;
        if (actionName) return wordsFromIdentifier(actionName.replace(/^open/i, 'Open '));
        const iconName = button.querySelector?.('[data-lucide]')?.getAttribute('data-lucide');
        if (iconName && ICON_LABELS[iconName]) return ICON_LABELS[iconName];
        if (button.id) return wordsFromIdentifier(button.id);
        return '';
    }

    function ensureControlName(control) {
        if (!control || getAccessibleName(control)) return;
        let label = '';
        if (control.matches?.('button, [role="button"]')) label = inferButtonLabel(control);
        if (!label && control.matches?.('input, select, textarea')) {
            label = getAssociatedLabelText(control)
                || control.getAttribute('placeholder')
                || wordsFromIdentifier(control.id);
        }
        if (label) control.setAttribute('aria-label', label);
    }

    function collectFromRoot(rootNode, selector) {
        const matches = [];
        if (rootNode?.matches?.(selector)) matches.push(rootNode);
        if (rootNode?.querySelectorAll) matches.push(...rootNode.querySelectorAll(selector));
        return Array.from(new Set(matches));
    }

    function enhanceFinanceAccessibility(rootNode) {
        if (!rootNode) return;
        collectFromRoot(rootNode, 'button').forEach(button => {
            if (!button.hasAttribute('type')) button.type = 'button';
            ensureControlName(button);
        });
        collectFromRoot(rootNode, 'input:not([type="hidden"]), select, textarea, [role="button"], summary')
            .forEach(ensureControlName);
        collectFromRoot(rootNode, 'i[data-lucide], svg[data-lucide]').forEach(icon => {
            icon.setAttribute('aria-hidden', 'true');
            icon.setAttribute('focusable', 'false');
        });
    }

    function getDuplicateIds(documentRef) {
        const seen = new Set();
        const duplicates = new Set();
        Array.from(documentRef?.querySelectorAll?.('[id]') || []).forEach(element => {
            if (seen.has(element.id)) duplicates.add(element.id);
            seen.add(element.id);
        });
        return Array.from(duplicates).sort();
    }

    function validateFinanceAccessibility(documentRef = root?.document) {
        const errors = [];
        const details = {};
        if (!documentRef?.querySelectorAll) {
            return deepFreeze({ valid: false, errors: ['Finance document is unavailable.'], details });
        }

        enhanceFinanceAccessibility(documentRef);
        const duplicateIds = getDuplicateIds(documentRef);
        details.duplicateIds = duplicateIds;
        if (duplicateIds.length) errors.push(`Duplicate IDs: ${duplicateIds.join(', ')}`);

        const unnamed = Array.from(documentRef.querySelectorAll(
            'button, a[href], input:not([type="hidden"]), select, textarea, summary, [role="button"]'
        )).filter(element => !getAccessibleName(element));
        details.unnamedControlCount = unnamed.length;
        if (unnamed.length) errors.push(`${unnamed.length} interactive control(s) lack an accessible name.`);

        const implicitButtons = Array.from(documentRef.querySelectorAll('button:not([type])'));
        details.implicitButtonCount = implicitButtons.length;
        if (implicitButtons.length) errors.push(`${implicitButtons.length} button(s) lack an explicit type.`);

        const nonKeyboardButtons = Array.from(documentRef.querySelectorAll('[role="button"]'))
            .filter(element => !element.matches('button, a[href]') && element.tabIndex < 0);
        details.nonKeyboardButtonCount = nonKeyboardButtons.length;
        if (nonKeyboardButtons.length) errors.push(`${nonKeyboardButtons.length} custom button(s) are not keyboard reachable.`);

        const nested = Array.from(documentRef.querySelectorAll(
            'button button, button a[href], button [role="button"], a[href] button, a[href] [role="button"]'
        ));
        details.nestedInteractiveControlCount = nested.length;
        if (nested.length) errors.push(`${nested.length} nested interactive control(s) found.`);

        const main = documentRef.querySelector('main#main-content');
        if (!main) errors.push('Finance main landmark is missing.');
        if (!documentRef.querySelector('.finance-skip-link[href="#main-content"]')) errors.push('Skip link is missing.');
        if (!documentRef.querySelector('#finance-view-announcer[aria-live="polite"]')) errors.push('Route announcer is missing.');

        const routeSections = Array.from(documentRef.querySelectorAll('#finance-view-root > [data-finance-view]'));
        const invalidRouteSections = routeSections.filter(section => (
            !['tabpanel', 'region'].includes(section.getAttribute('role'))
            || !section.hasAttribute('aria-hidden')
        ));
        details.routeSectionCount = routeSections.length;
        if (invalidRouteSections.length) errors.push(`${invalidRouteSections.length} route section(s) lack complete region semantics.`);

        const tabs = Array.from(documentRef.querySelectorAll('.finance-view-tabs [role="tab"]'));
        const invalidTabs = tabs.filter(tab => (
            !tab.id
            || !tab.getAttribute('aria-controls')
            || !['true', 'false'].includes(tab.getAttribute('aria-selected'))
        ));
        details.tabCount = tabs.length;
        if (invalidTabs.length) errors.push(`${invalidTabs.length} route tab(s) lack complete tab semantics.`);

        const contrast = validateFinanceContrastContract();
        details.contrastContract = contrast;
        if (!contrast.valid) errors.push(`${contrast.failures.length} contrast contract pair(s) failed.`);

        if (typeof root?.validateFinanceModalAccessibility === 'function') {
            const modal = root.validateFinanceModalAccessibility(documentRef);
            details.modalContract = modal;
            errors.push(...modal.errors);
        }

        return deepFreeze({ valid: errors.length === 0, errors, details });
    }

    function composite(foreground, background) {
        const alpha = foreground.alpha;
        return foreground.rgb.map((channel, index) => (
            (channel * alpha) + (background[index] * (1 - alpha))
        ));
    }

    function effectiveBackground(element, view) {
        const layers = [];
        let cursor = element;
        let hasGradient = false;
        while (cursor && cursor.nodeType === 1) {
            const style = view.getComputedStyle(cursor);
            if (style.backgroundImage && style.backgroundImage !== 'none') hasGradient = true;
            const color = parseCssColor(style.backgroundColor);
            if (color && color.alpha > 0) layers.push(color);
            cursor = cursor.parentElement;
        }
        let result = [255, 255, 255];
        layers.reverse().forEach(layer => { result = composite(layer, result); });
        return { rgb: result, hasGradient };
    }

    function elementDescriptor(element) {
        if (element.id) return `#${element.id}`;
        const className = String(element.className || '').trim().split(/\s+/).slice(0, 2).join('.');
        return `${String(element.tagName || 'element').toLowerCase()}${className ? `.${className}` : ''}`;
    }

    function auditFinanceComputedContrast(documentRef = root?.document, options = {}) {
        const view = documentRef?.defaultView;
        if (!documentRef?.querySelectorAll || !view?.getComputedStyle) {
            return deepFreeze({ valid: false, checkedCount: 0, skippedGradientCount: 0, failures: ['Computed styles are unavailable.'] });
        }
        const limit = Math.max(1, Number(options.limit || 800));
        const candidates = Array.from(documentRef.querySelectorAll(
            'button, a[href], label, input, select, textarea, summary, [role="button"], [role="tab"], h1, h2, h3, p'
        )).filter(element => {
            const style = view.getComputedStyle(element);
            return style.display !== 'none'
                && style.visibility !== 'hidden'
                && element.getClientRects().length > 0
                && (element.value || element.textContent || '').trim();
        }).slice(0, limit);

        const failures = [];
        let skippedGradientCount = 0;
        let checkedCount = 0;
        candidates.forEach(element => {
            const style = view.getComputedStyle(element);
            const foreground = parseCssColor(style.color);
            const background = effectiveBackground(element, view);
            if (!foreground || background.hasGradient) {
                if (background.hasGradient) skippedGradientCount += 1;
                return;
            }
            const foregroundRgb = composite(foreground, background.rgb);
            const ratio = getContrastRatio(foregroundRgb, background.rgb);
            const fontSize = Number.parseFloat(style.fontSize) || 16;
            const fontWeight = Number.parseInt(style.fontWeight, 10) || 400;
            const largeText = fontSize >= 24 || (fontSize >= 18.66 && fontWeight >= 700);
            const minimum = largeText ? LARGE_TEXT_MINIMUM : NORMAL_TEXT_MINIMUM;
            checkedCount += 1;
            if (ratio != null && ratio < minimum) {
                failures.push({ element: elementDescriptor(element), ratio, minimum });
            }
        });
        return deepFreeze({ valid: failures.length === 0, checkedCount, skippedGradientCount, failures });
    }

    function observeDynamicContent(documentRef) {
        if (!documentRef?.body || typeof root?.MutationObserver !== 'function') return;
        state.observer = new root.MutationObserver(mutations => {
            mutations.forEach(mutation => mutation.addedNodes.forEach(enhanceFinanceAccessibility));
        });
        state.observer.observe(documentRef.body, { subtree: true, childList: true });
    }

    function initFinanceAccessibility() {
        const documentRef = root?.document;
        if (!documentRef) return null;
        enhanceFinanceAccessibility(documentRef);
        if (!state.initialized) {
            state.initialized = true;
            observeDynamicContent(documentRef);
        }
        const validation = validateFinanceAccessibility(documentRef);
        documentRef.documentElement.dataset.financeA11yStatus = validation.valid ? 'ready' : 'review';
        documentRef.documentElement.dataset.financeA11yIssueCount = String(validation.errors.length);
        return validation;
    }

    async function runFinancePhase5ABrowserChecks(options = {}) {
        const documentRef = root?.document;
        const errors = [];
        const details = {};
        if (!documentRef?.body) return { valid: false, errors: ['Browser document is unavailable.'], details };

        details.accessibility = initFinanceAccessibility();
        errors.push(...details.accessibility.errors);
        details.computedContrast = auditFinanceComputedContrast(documentRef, options.contrast || {});
        if (!details.computedContrast.valid) {
            errors.push(`${details.computedContrast.failures.length} visible text contrast check(s) failed.`);
        }
        if (options.exerciseModals !== false && typeof root.runFinancePhase40BrowserChecks === 'function') {
            details.modals = await root.runFinancePhase40BrowserChecks({ exerciseRoutes: false });
            errors.push(...details.modals.errors);
        }
        if (options.exerciseHistory !== false && typeof root.runFinanceNavigationHistoryChecks === 'function') {
            details.history = await root.runFinanceNavigationHistoryChecks();
            errors.push(...details.history.errors);
        }

        return deepFreeze({ valid: errors.length === 0, errors, details });
    }

    return {
        VERSION,
        NORMAL_TEXT_MINIMUM,
        LARGE_TEXT_MINIMUM,
        FINANCE_CONTRAST_CONTRACT,
        parseHexColor,
        getContrastRatio,
        getAccessibleName,
        enhanceFinanceAccessibility,
        validateFinanceContrastContract,
        validateFinanceAccessibility,
        auditFinanceComputedContrast,
        initFinanceAccessibility,
        runFinancePhase5ABrowserChecks
    };
});
