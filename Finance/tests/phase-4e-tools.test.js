'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const toolsPresentation = require('../assets/js/ui/tools-presentation.js');
const { FINANCE_VIEW_DEFINITIONS, VIEW_CONTENT } = require('../assets/js/ui/navigation.js');

const financeRoot = path.join(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(financeRoot, relativePath), 'utf8');
const NOW = Date.UTC(2026, 7, 1, 12, 0, 0);

function healthyInput() {
    return {
        previewMode: false,
        unlocked: true,
        backupSettings: {
            autoBackupEnabled: true,
            backupHour: 20,
            lastBackupTime: Date.UTC(2026, 7, 1, 8)
        },
        storageDiagnostics: {
            preferredSource: 'indexedDB',
            syncUpdatedAt: '2026-08-01T08:00:00.000Z',
            conflictStrategy: 'local_wins',
            counts: { transactions: 12 },
            localStorage: { available: true, hasData: true },
            indexedDB: { supported: true, hasData: true }
        },
        cloud: { sessionEnabled: true, savedAvailable: true, pendingChanges: false }
    };
}

test('Phase 4E Tools presentation validates and freezes only its own output', () => {
    assert.deepEqual(toolsPresentation.validate(), { valid: true, errors: [] });
    const input = healthyInput();
    const result = toolsPresentation.buildFinanceToolsPresentation(input, { now: NOW });

    assert.equal(result.version, '1.0.0');
    assert.equal(Object.isFrozen(result), true);
    assert.equal(Object.isFrozen(result.statuses), true);
    assert.equal(Object.isFrozen(input), false);
    assert.equal(Object.isFrozen(input.storageDiagnostics), false);
});

test('ready recovery, redundant local storage, and active cloud produce a healthy summary', () => {
    const result = toolsPresentation.buildFinanceToolsPresentation(healthyInput(), { now: NOW });

    assert.equal(result.summary.tone, 'healthy');
    assert.equal(result.summary.label, 'Vault safeguards are ready');
    assert.equal(result.statuses.find(item => item.id === 'backup').value, 'Backup recorded');
    assert.equal(result.statuses.find(item => item.id === 'storage').value, 'Two local copies');
    assert.equal(result.statuses.find(item => item.id === 'cloud').value, 'Enabled');
});

test('missing or stale backup history remains an explicit attention item', () => {
    const missing = healthyInput();
    missing.backupSettings.lastBackupTime = null;
    const stale = healthyInput();
    stale.backupSettings.lastBackupTime = NOW - toolsPresentation.BACKUP_STALE_MS - 1;

    const missingResult = toolsPresentation.buildFinanceToolsPresentation(missing, { now: NOW });
    const staleResult = toolsPresentation.buildFinanceToolsPresentation(stale, { now: NOW });

    assert.equal(missingResult.statuses.find(item => item.id === 'backup').value, 'No backup recorded');
    assert.equal(missingResult.summary.tone, 'attention');
    assert.equal(staleResult.statuses.find(item => item.id === 'backup').value, 'Backup is over 7 days old');
});

test('Preview Mode fails closed and never presents real-vault safeguards as available', () => {
    const result = toolsPresentation.buildFinanceToolsPresentation({
        ...healthyInput(),
        previewMode: true,
        unlocked: true,
        storageDiagnostics: { previewMode: true, preferredSource: 'preview-memory' }
    }, { now: NOW });

    assert.equal(result.previewMode, true);
    assert.equal(result.safeguardActionsEnabled, false);
    assert.equal(result.configurationActionsEnabled, false);
    assert.equal(result.statuses.find(item => item.id === 'storage').value, 'In-memory demo only');
    assert.equal(result.statuses.find(item => item.id === 'cloud').value, 'Paused in Preview');
});

test('cloud status separates pending, reload-required, and optional local-only states', () => {
    const pending = healthyInput();
    pending.cloud.pendingChanges = true;
    const reload = healthyInput();
    reload.cloud = { sessionEnabled: false, savedAvailable: true, pendingChanges: false };
    const local = healthyInput();
    local.cloud = { sessionEnabled: false, savedAvailable: false, pendingChanges: false };

    assert.equal(toolsPresentation.buildFinanceToolsPresentation(pending, { now: NOW }).statuses.find(item => item.id === 'cloud').value, 'Local changes pending');
    assert.equal(toolsPresentation.buildFinanceToolsPresentation(reload, { now: NOW }).statuses.find(item => item.id === 'cloud').value, 'Reload required');
    assert.equal(toolsPresentation.buildFinanceToolsPresentation(local, { now: NOW }).statuses.find(item => item.id === 'cloud').value, 'Local only');
});

test('Tools route keeps advanced diagnostics after the simplified safety hub', () => {
    assert.equal(FINANCE_VIEW_DEFINITIONS.tools.subtitle, 'Review safeguard status, manage recovery, and open focused utilities.');
    assert.deepEqual(VIEW_CONTENT.tools, [{ selector: '#storage-diagnostics-panel', span: 'full' }]);
});

test('Tools markup groups recovery, plaintext portability, and utilities explicitly', () => {
    const html = read('index.html');

    assert.match(html, /id="finance-tools-hub"/);
    assert.match(html, /aria-label="Vault safeguard status"/);
    assert.match(html, /id="finance-tools-recovery-title"/);
    assert.match(html, /Download encrypted backup/);
    assert.match(html, /The readable archive is plaintext and is not a recovery backup/);
    assert.match(html, /id="finance-tools-utilities-title"/);
    assert.match(html, /data-tools-real-vault/);
    assert.match(html, /<details class="finance-tools-diagnostics__details">/);
});

test('Tools model and coordinator load before startup and are initialized centrally', () => {
    const html = read('index.html');
    const appInit = read('assets/js/core/app-init.js');
    const modelIndex = html.indexOf('assets/js/ui/tools-presentation.js');
    const coordinatorIndex = html.indexOf('assets/js/features/tools.js');
    const appInitIndex = html.indexOf('assets/js/core/app-init.js');

    assert.ok(modelIndex > 0 && coordinatorIndex > modelIndex && appInitIndex > coordinatorIndex);
    assert.match(appInit, /validateFinanceToolsPresentation/);
    assert.match(appInit, /initFinanceToolsCoordination/);
});

test('Preview diagnostics return demo counts before reading real browser storage', () => {
    const storage = read('assets/js/core/storage.js');
    const start = storage.indexOf('async function getStorageDiagnostics()');
    const previewBoundary = storage.indexOf("preferredSource: 'preview-memory'", start);
    const localRead = storage.indexOf('localStorage.getItem(DB_KEY)', start);

    assert.ok(start >= 0 && previewBoundary > start && localRead > previewBoundary);
    assert.match(storage.slice(start, localRead), /excludedFromPreview: true/);
    assert.match(storage, /pendingChanges: hasUnsyncedLocalChanges\(preferredDB\)/);
    assert.match(storage, /previewActive[\s\S]*\? await getStorageDiagnostics\(\)[\s\S]*latestStorageDiagnostics/);
});

test('backup workflows fail closed in Preview and refresh the shared safety status', () => {
    const backup = read('assets/js/features/backup.js');
    const coordinator = read('assets/js/features/tools.js');

    assert.match(backup, /Encrypted backup is unavailable in Preview Mode/);
    assert.match(backup, /Restore is unavailable in Preview Mode/);
    assert.match(backup, /Readable vault exports are unavailable in Preview Mode/);
    assert.match(backup, /notifyFinanceToolsChanged\(\)/);
    assert.match(coordinator, /data-tools-real-vault/);
    assert.match(coordinator, /finance:toolschange/);
});

test('Phase 4E styling includes visible focus, dark mode, and phone layouts', () => {
    const css = read('assets/css/app.css');

    assert.match(css, /Phase 4E: Tools safeguards/);
    assert.match(css, /\.finance-tools-hub :is\(button, summary\):focus-visible/);
    assert.match(css, /outline: 3px solid #7c3aed/);
    assert.match(css, /body\.dark \.finance-tools-hub/);
    assert.match(css, /@media \(max-width: 460px\)[\s\S]*\.finance-tools-status-grid \{ grid-template-columns: 1fr; \}/);
});
