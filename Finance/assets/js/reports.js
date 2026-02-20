        function escapeCsvCell(value) {
            const raw = String(value ?? '');
            const formulaPrefixed = /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
            return `"${formulaPrefixed.replace(/"/g, '""')}"`;
        }

        function exportToCSV() {
            const transactions = getReportTransactions();
            if (!transactions || transactions.length === 0) return;
            let csv = "Date,Description,Category,Type,Quantity,Amount,Unit Price\n";
            transactions.forEach(i => {
                const qty = i.quantity || 1;
                const unitPrice = i.amt / qty;
                csv += [
                    escapeCsvCell(new Date(i.date).toLocaleDateString()),
                    escapeCsvCell(i.desc),
                    escapeCsvCell(i.category),
                    escapeCsvCell(i.type),
                    escapeCsvCell(qty),
                    escapeCsvCell(i.amt),
                    escapeCsvCell(unitPrice.toFixed(2))
                ].join(',') + '\n';
            });
            const blob = new Blob([csv], { type: 'text/csv' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.setAttribute('href', url);
            a.setAttribute('download', `finance_backup_${new Date().toISOString().split('T')[0]}.csv`);
            a.click();
        }

        async function exportToPDF() {
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF();

            // Title
            doc.setFontSize(20);
            doc.text('FinanceFlow Report', 14, 20);

            // Date range
            doc.setFontSize(10);
            const dateRange = `Period: ${getReportScopeLabel()}`;
            doc.text(dateRange, 14, 28);

            // Summary
            const reportScope = getReportScopeSelection();
            const scopeForMetrics = reportScope === 'all_records' ? 'all_time' : 'selected_period';
            const metrics = computeSummaryMetrics(window.allDecryptedTransactions || [], scopeForMetrics, {
                filteredTransactions: window.filteredTransactions || []
            });

            doc.setFontSize(12);
            doc.text(`Balance: ${fmt(metrics.balance)}`, 14, 40);
            doc.text(`Income: ${fmt(metrics.income)}`, 14, 47);
            doc.text(`Expenses: ${fmt(metrics.expense)}`, 14, 54);
            doc.text(`Savings Rate: ${metrics.savingsRate}%`, 14, 61);

            // Transactions table
            const transactions = getReportTransactions();
            const tableData = transactions.map(t => [
                new Date(t.date).toLocaleDateString(),
                t.desc,
                t.category,
                t.type,
                fmt(t.amt)
            ]);

            doc.autoTable({
                startY: 70,
                head: [['Date', 'Description', 'Category', 'Type', 'Amount']],
                body: tableData,
                theme: 'grid',
                headStyles: { fillColor: [79, 70, 229] },
                styles: { fontSize: 8 }
            });

            doc.save(`FinanceFlow_Report_${new Date().toISOString().split('T')[0]}.pdf`);
            showToast('✅ PDF exported successfully!');
        }
