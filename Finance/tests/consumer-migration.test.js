'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const financeRoot = path.join(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(financeRoot, relativePath), 'utf8');

test('Phase 2D-D1 consumers use the provenance-aware metric boundary', () => {
    const adapter = read('assets/js/core/metric-adapter.js');
    const kpi = read('assets/js/features/kpi.js');
    const insights = read('assets/js/features/insights.js');
    const reports = read('assets/js/features/reports.js');
    const qbr = read('assets/js/features/qbr.js');
    const close = read('assets/js/features/close.js');
    const backup = read('assets/js/features/backup.js');

    assert.match(adapter, /metricProvenance/);
    assert.match(adapter, /buildFinanceConsumerBreakdown/);

    assert.match(kpi, /buildFinanceConsumerBreakdown\(metrics\)/);
    assert.match(kpi, /computeCanonicalFinanceSnapshot/);
    assert.match(kpi, /financeBreakdownSource/);
    assert.match(kpi, /financePositionSource/);

    assert.match(insights, /computeSummaryMetrics\(transactions, 'selected_period'/);
    assert.match(insights, /categoryExpenses/);
    assert.match(insights, /metricProvenance/);
    assert.match(insights, /canonical_snapshot/);

    assert.match(reports, /Metric source:/);
    assert.match(reports, /formatFinanceMetricProvenance/);

    assert.match(qbr, /buildFinanceConsumerBreakdown\(summary\)/);
    assert.match(qbr, /metricProvenance/);
    assert.match(qbr, /Metric source:/);

    assert.match(close, /metricProvenance/);
    assert.match(close, /Metric source:/);
    assert.match(backup, /backup_summary_helper_failed/);
    assert.match(backup, /Metric source:/);
});

test('saved close and KPI records preserve metric provenance without recalculating old values', () => {
    const storage = read('assets/js/core/storage.js');
    const close = read('assets/js/features/close.js');

    assert.match(storage, /function normalizeStoredMetricProvenance/);
    assert.match(storage, /unversioned_saved_snapshot/);
    assert.match(storage, /metricProvenance: normalizeStoredMetricProvenance\(entry\.metricProvenance\)/);
    assert.match(close, /const metricProvenance = snapshot\.metricProvenance \|\| null/);
    assert.match(close, /const closeRecord = \{[\s\S]*?metricProvenance,/);
    assert.match(close, /const kpiSnapshot = \{[\s\S]*?metricProvenance,/);
});

test('Phase 2D-D2 routes Statements through its dedicated projection boundary', () => {
    const statements = read('assets/js/features/statements.js');

    assert.match(statements, /computeCanonicalFinanceStatementProjection/);
    assert.match(statements, /computeLegacyStatementFlowProjection/);
    assert.match(statements, /statementProvenance/);
    assert.match(statements, /canonical_statement_cash_reconciliation_failed/);
    assert.doesNotMatch(statements, /buildFinanceConsumerBreakdown/);
});
