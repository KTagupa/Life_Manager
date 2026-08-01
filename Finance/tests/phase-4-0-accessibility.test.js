'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const modalAccessibility = require('../assets/js/ui/modal-accessibility.js');

const financeRoot = path.join(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(financeRoot, relativePath), 'utf8');

test('Phase 4-0 exposes one automatic contract for every Finance modal', () => {
    const html = read('index.html');
    const modalIds = [...html.matchAll(/<div\s+id="([^"]+-modal)"/g)].map(match => match[1]);
    const uniqueModalIds = new Set(modalIds);

    assert.equal(modalAccessibility.FINANCE_MODAL_SELECTOR, 'div[id$="-modal"], #auth-overlay');
    assert.equal(uniqueModalIds.size, modalIds.length, 'modal ids must remain unique');
    assert.ok(modalIds.length >= 44, 'the shared contract should cover the existing modal inventory');
    assert.equal(modalAccessibility.formatFinanceModalFallbackLabel('credit-card-payment-modal'), 'Credit Card Payment');
    assert.equal(modalAccessibility.formatFinanceModalFallbackLabel(''), 'Finance dialog');
});

test('modal visibility detection remains independent from aria synchronization', () => {
    const visible = {
        hidden: false,
        classList: { contains: () => false }
    };
    const classHidden = {
        hidden: false,
        classList: { contains: value => value === 'hidden' }
    };
    const attributeHidden = {
        hidden: true,
        classList: { contains: () => false }
    };

    assert.equal(modalAccessibility.isFinanceModalOpen(visible), true);
    assert.equal(modalAccessibility.isFinanceModalOpen(classHidden), false);
    assert.equal(modalAccessibility.isFinanceModalOpen(attributeHidden), false);
});

test('the modal lifecycle provides naming, focus trapping, Escape, stacking, and restoration', () => {
    const source = read('assets/js/ui/modal-accessibility.js');

    assert.match(source, /setAttribute\('role', 'dialog'\)/);
    assert.match(source, /setAttribute\('aria-modal', 'true'\)/);
    assert.match(source, /ensureModalLabel/);
    assert.match(source, /trapModalFocus/);
    assert.match(source, /event\.key === 'Escape'/);
    assert.match(source, /returnFocusByModal/);
    assert.match(source, /openStack/);
    assert.match(source, /syncBackgroundInert/);
    assert.match(source, /setAttribute\('inert', ''\)/);
    assert.match(source, /MutationObserver/);
    assert.match(source, /CLOSE_CONTROL_SELECTOR/);
    assert.match(source, /finance-modal-open/);
});

test('the browser quality harness exercises routes and a disposable modal fixture', () => {
    const source = read('assets/js/ui/modal-accessibility.js');

    assert.match(source, /runFinancePhase40BrowserChecks/);
    assert.match(source, /exerciseRoutes/);
    assert.match(source, /historyMode: 'none'/);
    assert.match(source, /finance-phase-4-0-test-modal/);
    assert.match(source, /Modal fixture did not receive initial focus/);
    assert.match(source, /Escape did not close the modal fixture/);
    assert.match(source, /Focus did not return to the modal opener/);
    assert.match(source, /nestedInteractiveControlCount/);
});

test('modal accessibility loads before app startup and initializes before feature modals', () => {
    const html = read('index.html');
    const appInit = read('assets/js/core/app-init.js');
    const modalScriptIndex = html.indexOf('assets/js/ui/modal-accessibility.js');
    const appInitIndex = html.indexOf('assets/js/core/app-init.js');
    const modalInitIndex = appInit.indexOf("safeInit('modal accessibility'");
    const dateRepairInitIndex = appInit.indexOf("safeInit('transaction date repair'");
    const descriptorInitIndex = appInit.indexOf("safeInit('descriptors'");

    assert.ok(modalScriptIndex > 0 && appInitIndex > modalScriptIndex);
    assert.ok(modalInitIndex > 0 && dateRepairInitIndex > modalInitIndex);
    assert.ok(descriptorInitIndex > modalInitIndex);
});

test('descriptor hints never create an interactive control inside a button or link', () => {
    const descriptors = read('assets/js/ui/descriptors.js');

    assert.match(descriptors, /host\.matches\('button, a\[href\]'\)/);
    assert.match(descriptors, /document\.createElement\('button'\)/);
    assert.match(descriptors, /descriptor-icon-disabled/);
    assert.doesNotMatch(descriptors, /setAttribute\('role', 'button'\)/);
    assert.doesNotMatch(descriptors, /document\.createElement\('span'\);\s*\n\s*configureDescriptorIcon/);
});

test('Phase 4-0 supplies visible modal focus and a reduced-motion baseline', () => {
    const css = read('assets/css/app.css');

    assert.match(css, /\[data-finance-modal-enhanced="true"\][\s\S]*:focus-visible/);
    assert.match(css, /outline: 3px solid #6366f1 !important/);
    assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
    assert.match(css, /animation-duration: 0\.01ms !important/);
    assert.match(css, /body\.finance-modal-open/);
});
