(function exposeFinanceReports(root) {
    'use strict';

    function escapeCsvCell(value) {
        const raw = String(value ?? '');
        const formulaPrefixed = /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
        return `"${formulaPrefixed.replace(/"/g, '""')}"`;
    }

    function getFinanceReportsPresentation() {
        if (typeof root.buildFinanceReportsPresentation !== 'function') return null;
        const snapshotReport = typeof root.getFinanceSnapshotShadowReport === 'function'
            ? root.getFinanceSnapshotShadowReport()
            : (root.financeSnapshotShadowReport || null);
        return root.buildFinanceReportsPresentation({
            scope: typeof metricScope === 'string' ? metricScope : 'selected_period',
            month: root.document?.getElementById('filter-month')?.value || 'all',
            year: root.document?.getElementById('filter-year')?.value || 'all',
            transactions: root.allDecryptedTransactions || [],
            snapshotReport
        });
    }

    function getFinanceReportsScopedTransactions() {
        const presentation = getFinanceReportsPresentation();
        if (!presentation || typeof root.filterFinanceReportsTransactions !== 'function') return [];
        return root.filterFinanceReportsTransactions(root.allDecryptedTransactions || [], {
            scope: presentation.scope.id,
            month: presentation.scope.selectedMonth,
            year: presentation.scope.selectedYear
        });
    }

    function setReportsText(id, value) {
        const element = root.document?.getElementById(id);
        if (element) element.textContent = value;
    }

    function positionText(position) {
        return position?.available && Number.isFinite(Number(position.value))
            ? root.fmt(Number(position.value))
            : 'n/a';
    }

    function positionDetail(position, basisLabel) {
        if (!position?.available) {
            if (position?.reason === 'missing_market_prices') return `${basisLabel} unavailable until all crypto prices are current`;
            return `${basisLabel} is waiting for its reconciliation gate`;
        }
        return `${root.fmt(position.assets)} assets − ${root.fmt(position.liabilities)} liabilities`;
    }

    function formatReportsAsOf(value) {
        const date = new Date(value);
        return Number.isFinite(date.getTime())
            ? `As of ${date.toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}`
            : 'As-of snapshot pending';
    }

    function renderFinanceReportsCoordinator() {
        const presentation = getFinanceReportsPresentation();
        if (!presentation) return;
        root.financeReportsPresentation = presentation;

        const coordinator = root.document?.getElementById('finance-reports-coordinator');
        if (coordinator) {
            coordinator.dataset.reportScope = presentation.scope.id;
            coordinator.dataset.singleMonth = presentation.scope.isSingleMonth ? 'true' : 'false';
        }
        setReportsText('finance-reports-period', `${presentation.scope.caption} • ${presentation.scope.transactionCount} ${presentation.scope.transactionCount === 1 ? 'movement' : 'movements'}`);
        setReportsText('finance-reports-market-value', positionText(presentation.positions.market));
        setReportsText('finance-reports-market-detail', positionDetail(presentation.positions.market, 'Market-value snapshot'));
        setReportsText('finance-reports-book-value', positionText(presentation.positions.book));
        setReportsText('finance-reports-book-detail', positionDetail(presentation.positions.book, 'Book-value estimate'));
        setReportsText('finance-reports-position-as-of', formatReportsAsOf(presentation.positions.asOf));
        setReportsText('reports-revenue-scope', presentation.cards.revenue.caption);
        setReportsText('reports-trends-scope', `${presentation.cards.trends.caption} • ${presentation.cards.trends.granularity === 'day' ? 'Daily points' : 'Monthly points'}`);
        setReportsText('reports-spend-scope', presentation.cards.spending.caption);
        setReportsText('reports-variance-scope', presentation.cards.variance.caption);
        setReportsText('reports-budget-scope-note', presentation.cards.spending.budgetComparison.caption);

        const varianceCard = root.document?.getElementById('finance-card-variance');
        if (varianceCard) varianceCard.dataset.reportScopeAvailable = presentation.cards.variance.available ? 'true' : 'false';
        const budgetPanel = root.document?.getElementById('budget-breakdown');
        if (budgetPanel) budgetPanel.dataset.reportScopeAvailable = presentation.cards.spending.budgetComparison.available ? 'true' : 'false';
        if (root.lucide) root.lucide.createIcons();
    }

    function resolveExportContext(options = {}) {
        if (options?.useReportsScope === true) {
            const presentation = getFinanceReportsPresentation();
            return {
                presentation,
                transactions: getFinanceReportsScopedTransactions(),
                label: presentation?.scope?.caption || 'For selected report period',
                scope: presentation?.scope?.id || 'selected_period'
            };
        }
        const transactions = typeof root.getReportTransactions === 'function'
            ? root.getReportTransactions()
            : (root.filteredTransactions || []);
        return {
            presentation: null,
            transactions,
            label: typeof root.getReportScopeLabel === 'function' ? root.getReportScopeLabel() : 'Selected period',
            scope: typeof root.getReportScopeSelection === 'function' && root.getReportScopeSelection() === 'all_records'
                ? 'all_time'
                : 'selected_period'
        };
    }

    function exportToCSV(options = {}) {
        const context = resolveExportContext(options);
        const transactions = context.transactions;
        if (!transactions.length) {
            if (typeof root.showToast === 'function') root.showToast('No movements in this export scope.');
            return;
        }
        let csv = 'Date,Description,Category,Type,Quantity,Amount,Unit Price\n';
        transactions.forEach(item => {
            const quantity = item.quantity || 1;
            const unitPrice = Number(item.amt || 0) / quantity;
            csv += [
                escapeCsvCell(new Date(item.date).toLocaleDateString()),
                escapeCsvCell(item.desc),
                escapeCsvCell(item.category),
                escapeCsvCell(item.type),
                escapeCsvCell(quantity),
                escapeCsvCell(item.amt),
                escapeCsvCell(unitPrice.toFixed(2))
            ].join(',') + '\n';
        });
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = root.URL.createObjectURL(blob);
        const anchor = root.document.createElement('a');
        anchor.setAttribute('href', url);
        anchor.setAttribute('download', `FinanceFlow_${context.scope}_${new Date().toISOString().split('T')[0]}.csv`);
        anchor.click();
        root.setTimeout(() => root.URL.revokeObjectURL(url), 0);
    }

    async function exportToPDF(options = {}) {
        const context = resolveExportContext(options);
        const { jsPDF } = root.jspdf;
        const doc = new jsPDF();
        const transactions = context.transactions;
        const metrics = root.computeSummaryMetrics(root.allDecryptedTransactions || [], context.scope, {
            scopeTransactions: transactions,
            filteredTransactions: transactions
        });
        const metricSource = typeof root.formatFinanceMetricProvenance === 'function'
            ? root.formatFinanceMetricProvenance(metrics)
            : (metrics.metricEngine === 'canonical' ? 'Canonical metrics' : 'Legacy metrics');

        doc.setFontSize(20);
        doc.text('FinanceFlow Report', 14, 20);
        doc.setFontSize(10);
        doc.text(`Period: ${context.label.replace(/^For\s+/i, '')}`, 14, 28);
        doc.setFontSize(9);
        doc.text(`Metric source: ${metricSource}`, 14, 34);
        doc.setFontSize(12);
        doc.text(`${metrics.metricLabels?.balance || 'Net Cash Flow'}: ${root.fmt(metrics.balance)}`, 14, 41);
        doc.text(`${metrics.metricLabels?.income || 'Earned Income'}: ${root.fmt(metrics.income)}`, 14, 48);
        doc.text(`${metrics.metricLabels?.expense || 'Spending'}: ${root.fmt(metrics.expense)}`, 14, 55);
        doc.text(`Savings Rate: ${typeof root.formatFinanceSavingsRate === 'function' ? root.formatFinanceSavingsRate(metrics.savingsRate) : 'n/a'}`, 14, 62);

        let tableStartY = 71;
        if (context.presentation) {
            const positions = context.presentation.positions;
            doc.setFontSize(10);
            doc.text(`Position: ${formatReportsAsOf(positions.asOf)}`, 14, 71);
            doc.text(`Estimated Net Worth — Market-value snapshot: ${positionText(positions.market)}`, 14, 78);
            doc.text(`Estimated Net Worth — Current book-value estimate: ${positionText(positions.book)}`, 14, 85);
            doc.setFontSize(8);
            doc.text('Book-value estimate is a current position view, not a saved month-end statement.', 14, 91);
            tableStartY = 98;
        }

        const tableData = transactions.map(transaction => [
            new Date(transaction.date).toLocaleDateString(),
            transaction.desc,
            transaction.category,
            transaction.type,
            root.fmt(transaction.amt)
        ]);
        doc.autoTable({
            startY: tableStartY,
            head: [['Date', 'Description', 'Category', 'Type', 'Amount']],
            body: tableData,
            theme: 'grid',
            headStyles: { fillColor: [79, 70, 229] },
            styles: { fontSize: 8 }
        });
        doc.save(`FinanceFlow_Report_${context.scope}_${new Date().toISOString().split('T')[0]}.pdf`);
        if (typeof root.showToast === 'function') root.showToast('✅ PDF exported successfully!');
    }

    function handleReportsAction(actionId) {
        if (actionId === 'export_csv') return exportToCSV({ useReportsScope: true });
        if (actionId === 'export_pdf') return exportToPDF({ useReportsScope: true });
    }

    function initFinanceReportsCoordination() {
        if (root.__financeReportsCoordinationInitialized) return;
        root.__financeReportsCoordinationInitialized = true;
        root.document?.addEventListener('click', event => {
            const action = event.target.closest('[data-finance-reports-action]');
            if (!action) return;
            event.preventDefault();
            handleReportsAction(action.dataset.financeReportsAction);
        });
        root.addEventListener('finance:snapshot-shadow-updated', () => {
            const active = typeof root.shouldRenderFinanceRoute === 'function'
                ? root.shouldRenderFinanceRoute('reports')
                : root.document?.body?.dataset?.financeActiveView === 'reports';
            if (active) renderFinanceReportsCoordinator();
        });
    }

    root.getFinanceReportsPresentation = getFinanceReportsPresentation;
    root.getFinanceReportsScopedTransactions = getFinanceReportsScopedTransactions;
    root.renderFinanceReportsCoordinator = renderFinanceReportsCoordinator;
    root.initFinanceReportsCoordination = initFinanceReportsCoordination;
    root.exportToCSV = exportToCSV;
    root.exportToPDF = exportToPDF;
})(typeof window !== 'undefined' ? window : globalThis);
