'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const accessibility = require('../assets/js/ui/accessibility.js');
const modalAccessibility = require('../assets/js/ui/modal-accessibility.js');
const navigation = require('../assets/js/ui/navigation.js');

const financeRoot = path.join(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(financeRoot, relativePath), 'utf8');

test('Phase 5A contrast contract meets WCAG AA text and focus thresholds', () => {
    const validation = accessibility.validateFinanceContrastContract();

    assert.equal(validation.valid, true);
    assert.equal(validation.pairCount, 10);
    assert.equal(accessibility.getContrastRatio('#ffffff', '#4f46e5') > 4.5, true);
    assert.equal(accessibility.getContrastRatio('#64748b', '#ffffff') > 4.5, true);
    assert.equal(Object.isFrozen(accessibility.FINANCE_CONTRAST_CONTRACT), true);
    assert.equal(Object.isFrozen(validation), true);
});

test('route URLs preserve path and query while duplicate destinations replace history', () => {
    assert.equal(
        navigation.buildFinanceViewUrl('/Finance/index.html', '?preview=1', 'reports'),
        '/Finance/index.html?preview=1#reports'
    );
    assert.equal(navigation.buildFinanceViewUrl('/Finance/index.html', '', 'unknown'), '/Finance/index.html#overview');
    assert.equal(navigation.resolveInitialFinanceView('#unknown', 'reports'), 'overview');
    assert.equal(navigation.resolveFinanceHistoryMode('push', 'reports', 'reports'), 'replace');
    assert.equal(navigation.resolveFinanceHistoryMode('push', 'reports', 'tools'), 'push');
    assert.equal(navigation.resolveFinanceHistoryMode('none', 'reports', 'reports'), 'none');
});

test('navigation implements canonical deep links and real Back/Forward regression checks', () => {
    const source = read('assets/js/ui/navigation.js');

    assert.match(source, /requestedViewId \? 'none' : 'replace'/);
    assert.match(source, /window\.history\.back\(\)/);
    assert.match(source, /window\.history\.forward\(\)/);
    assert.match(source, /waitForHistoryView/);
    assert.match(source, /history\.replaceState\(\{ financeView: initialViewId \}/);
    assert.match(source, /focusHeading: fromMorePanel/);
    assert.match(source, /restoreFocus: wasOpen/);
});

test('every route receives stable region semantics and primary tabs label their panels', () => {
    const source = read('assets/js/ui/navigation.js');

    assert.match(source, /finance-view-tab-\$\{viewId\}/);
    assert.match(source, /section\.setAttribute\('role', 'tabpanel'\)/);
    assert.match(source, /section\.setAttribute\('aria-labelledby', tab\.id\)/);
    assert.match(source, /section\.setAttribute\('role', 'region'\)/);
    assert.match(source, /section\.setAttribute\('aria-label'/);
});

test('Finance markup exposes skip navigation and treats the vault lock as a non-dismissible dialog', () => {
    const html = read('index.html');

    assert.match(html, /class="finance-skip-link" href="#main-content"/);
    assert.match(html, /<main[^>]*id="main-content"[^>]*tabindex="-1"/s);
    assert.match(html, /id="auth-overlay"[\s\S]*role="dialog"[\s\S]*data-finance-modal-dismiss="locked"/);
    assert.match(html, /id="finance-vault-lock-title"/);
    assert.match(html, /aria-label="Finance application controls"/);
    assert.match(html, /aria-haspopup="true"/);
    assert.match(html, /aria-label="More Finance destinations and tools"/);
});

test('locked vault participates in focus trapping but cannot be dismissed with Escape', () => {
    const source = read('assets/js/ui/modal-accessibility.js');

    assert.equal(modalAccessibility.FINANCE_MODAL_SELECTOR, 'div[id$="-modal"], #auth-overlay');
    assert.match(source, /ensureModalCloseControlNames/);
    assert.match(source, /modal\.dataset\.financeModalDismiss === 'locked'/);
    assert.match(source, /focusInitialModalControl\(modal\)/);
    assert.match(source, /backgroundInertState/);
    assert.match(source, /syncBackgroundInert/);
});

test('legacy and dynamic controls inherit explicit types, names, and decorative icon handling', () => {
    const source = read('assets/js/ui/accessibility.js');

    assert.match(source, /if \(!button\.hasAttribute\('type'\)\) button\.type = 'button'/);
    assert.match(source, /ensureControlName/);
    assert.match(source, /getAssociatedLabelText/);
    assert.match(source, /setAttribute\('aria-hidden', 'true'\)/);
    assert.match(source, /MutationObserver/);
    assert.match(source, /mutation\.addedNodes\.forEach\(enhanceFinanceAccessibility\)/);
});

test('startup validates contrast and initializes accessibility after route semantics exist', () => {
    const html = read('index.html');
    const appInit = read('assets/js/core/app-init.js');
    const modalIndex = html.indexOf('assets/js/ui/modal-accessibility.js');
    const navigationIndex = html.indexOf('assets/js/ui/navigation.js');
    const accessibilityIndex = html.indexOf('assets/js/ui/accessibility.js');
    const startupIndex = html.indexOf('assets/js/core/app-init.js');
    const navInit = appInit.indexOf("safeInit('finance navigation'");
    const accessibilityInit = appInit.indexOf("safeInit('finance accessibility'");

    assert.ok(modalIndex > 0 && navigationIndex > modalIndex);
    assert.ok(accessibilityIndex > navigationIndex && startupIndex > accessibilityIndex);
    assert.ok(navInit > 0 && accessibilityInit > navInit);
    assert.match(appInit, /validateFinanceContrastContract/);
    assert.match(appInit, /result\.catch\(error => console\.error/);
});

test('Phase 5A browser harness combines semantics, computed contrast, modals, and history', () => {
    const source = read('assets/js/ui/accessibility.js');

    assert.match(source, /runFinancePhase5ABrowserChecks/);
    assert.match(source, /auditFinanceComputedContrast/);
    assert.match(source, /runFinancePhase40BrowserChecks/);
    assert.match(source, /runFinanceNavigationHistoryChecks/);
    assert.match(source, /visible text contrast check\(s\) failed/);
});

test('Phase 5A CSS provides global focus, skip-link, stronger muted text, and system contrast modes', () => {
    const css = read('assets/css/app.css');

    assert.match(css, /Phase 5A: global keyboard, screen-reader, and contrast hardening/);
    assert.match(css, /\.finance-skip-link:focus/);
    assert.match(css, /\.finance-page :where\([\s\S]*\):focus-visible/);
    assert.match(css, /body\.finance-page:not\(\.dark\) \.text-slate-400/);
    assert.match(css, /@media \(prefers-contrast: more\)/);
    assert.match(css, /@media \(forced-colors: active\)/);
    assert.match(css, /outline: 3px solid #7c3aed/);
});

test('static Finance IDs remain unique after accessibility landmarks are added', () => {
    const html = read('index.html');
    const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]);
    assert.equal(new Set(ids).size, ids.length);
});
