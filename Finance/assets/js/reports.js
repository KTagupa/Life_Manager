        function exportToCSV() {
            if (!window.allDecryptedTransactions || window.allDecryptedTransactions.length === 0) return;
            let csv = "Date,Description,Category,Type,Quantity,Amount,Unit Price\n";
            window.allDecryptedTransactions.forEach(i => {
                const qty = i.quantity || 1;
                const unitPrice = i.amt / qty;
                csv += `${new Date(i.date).toLocaleDateString()},"${i.desc}",${i.category},${i.type},${qty},${i.amt},${unitPrice.toFixed(2)}\n`;
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
            const m = document.getElementById('filter-month').value;
            const y = document.getElementById('filter-year').value;
            const dateRange = `Period: ${m === 'all' ? 'All Months' : new Date(2000, m - 1).toLocaleString('en', { month: 'long' })} ${y === 'all' ? 'All Years' : y}`;
            doc.text(dateRange, 14, 28);

            // Summary
            const balance = document.getElementById('balance-display').innerText;
            const income = document.getElementById('income-display').innerText;
            const expense = document.getElementById('expense-display').innerText;
            const savings = document.getElementById('savings-rate-display').innerText;

            doc.setFontSize(12);
            doc.text(`Balance: ${balance}`, 14, 40);
            doc.text(`Income: ${income}`, 14, 47);
            doc.text(`Expenses: ${expense}`, 14, 54);
            doc.text(`Savings Rate: ${savings}`, 14, 61);

            // Transactions table
            const transactions = window.allDecryptedTransactions || [];
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
