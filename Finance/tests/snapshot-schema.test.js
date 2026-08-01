'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const schema = require('../assets/js/core/snapshot-schema.js');

const {
    normalizeFinanceStatementPosition,
    buildFinanceStatementSnapshotPosition,
    validate
} = schema;

test('statement snapshot schema validates its compatibility invariants', () => {
    assert.deepEqual(validate(), { valid: true, errors: [], version: 2 });
});

test('legacy statement positions gain version 2 fields without changing legacy aliases', () => {
    const legacy = {
        cash: 100,
        receivables: 25,
        crypto: 50,
        debt: 20,
        creditCardDebt: 10,
        totalAssets: 175,
        totalLiabilities: 30,
        netWorth: 145
    };
    const normalized = normalizeFinanceStatementPosition(legacy);

    assert.equal(normalized.crypto, 50);
    assert.equal(normalized.cryptoBookValue, 50);
    assert.equal(normalized.installmentDebt, 0);
    assert.equal(normalized.fixedAssets, 0);
    assert.equal(normalized.totalAssets, 175);
    assert.equal(normalized.totalAssetsBookValue, 175);
    assert.equal(normalized.netWorth, 145);
    assert.equal(normalized.netWorthBookValue, 145);
    assert.equal(normalized.netWorthMarketValue, null);
    assert.equal(normalized.marketValuationStatus, 'unavailable');
    assert.equal(Object.isFrozen(normalized), true);
});

test('canonical fields are stored beside legacy aliases for compatibility', () => {
    const enriched = buildFinanceStatementSnapshotPosition({
        cash: 100,
        receivables: 25,
        crypto: 50,
        debt: 20,
        creditCardDebt: 10,
        installmentDebt: 15,
        totalAssets: 175,
        totalLiabilities: 45,
        netWorth: 130
    }, {
        fixedAssets: { netBookValue: 75 },
        crypto: { bookValue: 50, marketValue: null },
        totalAssetsBookValue: 250,
        totalAssetsMarketValue: null,
        estimatedNetWorthBookValue: 205,
        estimatedNetWorthMarketValue: null,
        diagnostics: { cryptoMarketValueStatus: 'unavailable_missing_prices' }
    });

    assert.equal(enriched.netWorth, 130);
    assert.equal(enriched.netWorthBookValue, 205);
    assert.equal(enriched.totalAssets, 175);
    assert.equal(enriched.totalAssetsBookValue, 250);
    assert.equal(enriched.fixedAssets, 75);
    assert.equal(enriched.installmentDebt, 15);
    assert.equal(enriched.marketValuationStatus, 'unavailable_missing_prices');
    assert.equal(enriched.positionSource, 'canonical_book');
});

test('browser load order and persistence paths include the version 2 schema', () => {
    const financeRoot = path.join(__dirname, '..');
    const html = fs.readFileSync(path.join(financeRoot, 'index.html'), 'utf8');
    const canonicalIndex = html.indexOf('assets/js/core/canonical-snapshots.js');
    const schemaIndex = html.indexOf('assets/js/core/snapshot-schema.js');
    const storageIndex = html.indexOf('assets/js/core/storage.js');
    assert.ok(schemaIndex > canonicalIndex);
    assert.ok(storageIndex > schemaIndex);

    const storage = fs.readFileSync(path.join(financeRoot, 'assets/js/core/storage.js'), 'utf8');
    const statements = fs.readFileSync(path.join(financeRoot, 'assets/js/features/statements.js'), 'utf8');
    assert.match(storage, /snapshotSchemaVersion/);
    assert.match(storage, /installmentDebt/);
    assert.match(storage, /normalizeFinanceStatementPosition/);
    assert.match(statements, /buildFinanceStatementSnapshotPosition/);
    assert.match(statements, /netWorthBookValue|normalizeFinanceStatementPosition/);
});
