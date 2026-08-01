'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const classifier = require('../assets/js/core/transaction-classifier.js');
const dateQuality = require('../assets/js/core/date-quality.js');

const {
    getFinanceTransactionDateQuality,
    isFinanceTransactionDateUsable,
    partitionFinanceTransactionsByDate,
    normalizeFinanceRepairDateInput,
    validate
} = dateQuality;

test('date-quality contract is structurally valid', () => {
    assert.deepEqual(validate(), {
        valid: true,
        errors: [],
        version: '1.0.0'
    });
    assert.equal(typeof classifier.inspectFinanceTransactionDate, 'function');
});

test('canonical ISO dates remain usable with deterministic keys', () => {
    const quality = getFinanceTransactionDateQuality({ date: '2026-07-31T08:45:00.000Z' });
    assert.equal(quality.status, 'valid');
    assert.equal(quality.usable, true);
    assert.equal(quality.canonical, true);
    assert.equal(quality.dateKey, '2026-07-31');
    assert.equal(quality.timestamp, Date.parse('2026-07-31T08:45:00.000Z'));
});

test('missing, impossible, and unparseable dates are quarantined', () => {
    [undefined, '', '2026-02-30', 'not-a-date'].forEach(date => {
        const quality = getFinanceTransactionDateQuality({ date });
        assert.equal(quality.status, 'quarantined');
        assert.equal(quality.usable, false);
        assert.equal(quality.timestamp, null);
        assert.equal(isFinanceTransactionDateUsable({ date }), false);
    });
});

test('parseable legacy formats remain usable but require normalization', () => {
    const quality = getFinanceTransactionDateQuality({ date: 'July 2, 2026' });
    assert.equal(quality.status, 'warning');
    assert.equal(quality.usable, true);
    assert.equal(quality.canonical, false);
    assert.equal(quality.dateKey, '2026-07-02');
    assert.equal(quality.issue.code, 'noncanonical_date');
});

test('partition excludes only quarantined records and does not mutate inputs', () => {
    const transactions = [
        { id: 'canonical', date: '2026-07-31', marker: 1 },
        { id: 'legacy', date: 'July 2, 2026', marker: 2 },
        { id: 'invalid', date: '2026-02-30', marker: 3 }
    ];
    const before = JSON.stringify(transactions);
    const partition = partitionFinanceTransactionsByDate(transactions);

    assert.equal(partition.transactionCount, 3);
    assert.equal(partition.usableCount, 2);
    assert.equal(partition.canonicalCount, 1);
    assert.equal(partition.warningCount, 1);
    assert.equal(partition.quarantinedCount, 1);
    assert.equal(partition.repairableCount, 2);
    assert.deepEqual(partition.usableTransactions.map(tx => tx.id), ['canonical', 'legacy']);
    assert.deepEqual(partition.quarantinedEntries.map(entry => entry.transaction.id), ['invalid']);
    assert.equal(JSON.stringify(transactions), before);
});

test('repair input requires a strict, real calendar date and emits canonical ISO', () => {
    assert.deepEqual(normalizeFinanceRepairDateInput('2024-02-29'), {
        valid: true,
        dateKey: '2024-02-29',
        isoDate: '2024-02-29T00:00:00.000Z',
        error: null
    });
    assert.equal(normalizeFinanceRepairDateInput('2023-02-29').valid, false);
    assert.equal(normalizeFinanceRepairDateInput('02/29/2024').valid, false);
    assert.equal(normalizeFinanceRepairDateInput('').valid, false);
});

test('browser load order and Activity repair surfaces are present', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    const classifierIndex = html.indexOf('assets/js/core/transaction-classifier.js');
    const qualityIndex = html.indexOf('assets/js/core/date-quality.js');
    const metricsIndex = html.indexOf('assets/js/core/metrics.js');

    assert.ok(qualityIndex > classifierIndex, 'date quality should load after the classifier');
    assert.ok(metricsIndex > qualityIndex, 'legacy metrics should load after date quality');
    assert.match(html, /id="finance-date-quality-banner"/);
    assert.match(html, /id="finance-date-repair-modal"/);
    assert.match(html, /assets\/js\/features\/date-repair\.js/);
});

test('metric hydration no longer fabricates today for invalid dates', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'assets/js/core/metrics.js'), 'utf8');
    const hydrateStart = source.indexOf('function hydrateTransactionCache');
    const timestampStart = source.indexOf('function getTxTimestamp', hydrateStart);
    const hydrateSource = source.slice(hydrateStart, timestampStart);

    assert.ok(hydrateStart >= 0 && timestampStart > hydrateStart);
    assert.doesNotMatch(hydrateSource, /Date\.now\s*\(/);
    assert.match(hydrateSource, /'quarantined'/);
    assert.match(source, /Number\.isFinite\(cached\._ts\) \? cached\._ts : NaN/);
});
