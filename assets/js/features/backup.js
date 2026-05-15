        // =============================================
        // SECTION 8: BACKUP & RESTORE
        // =============================================
        async function computeBackupHash(dataObj) {
            const json = JSON.stringify(dataObj);
            const bytes = new TextEncoder().encode(json);
            const hash = await crypto.subtle.digest('SHA-256', bytes);
            return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
        }

        const READABLE_EXPORT_ENCRYPTED_COLLECTIONS = [
            'transactions',
            'bills',
            'debts',
            'credit_cards',
            'installment_plans',
            'lent',
            'crypto',
            'wishlist'
        ];

        const READABLE_EXPORT_PLAIN_COLLECTIONS = [
            'fixed_assets',
            'agm_records',
            'custom_categories',
            'recurring_transactions',
            'investment_goals',
            'goals',
            'categorization_rules',
            'imports',
            'insight_snapshots',
            'monthly_closes',
            'kpi_snapshots',
            'forecast_runs',
            'statement_snapshots',
            'quick_links',
            'undo_log'
        ];

        const READABLE_EXPORT_OBJECT_SECTIONS = [
            'budgets',
            'crypto_prices',
            'crypto_interest',
            'xrpl_reconcile',
            'ronin_reconcile',
            'kpi_targets',
            'forecast_assumptions',
            'operations_guardrails',
            'sync'
        ];

        function isEncryptedPayload(value) {
            return !!(value && typeof value === 'object' && Array.isArray(value.iv) && Array.isArray(value.content));
        }

        function getReadableExportStamp(date = new Date()) {
            const pad = (value) => String(value).padStart(2, '0');
            return [
                date.getFullYear(),
                pad(date.getMonth() + 1),
                pad(date.getDate())
            ].join('-') + '_' + [
                pad(date.getHours()),
                pad(date.getMinutes()),
                pad(date.getSeconds())
            ].join('-');
        }

        function cloneReadableValue(value) {
            if (value == null) return value;
            try {
                return JSON.parse(JSON.stringify(value));
            } catch (_) {
                return value;
            }
        }

        function escapeReadableCsvCell(value) {
            let raw;
            if (value == null) {
                raw = '';
            } else if (value instanceof Date) {
                raw = value.toISOString();
            } else if (typeof value === 'object') {
                raw = JSON.stringify(value);
            } else {
                raw = String(value);
            }

            const safe = /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
            return `"${safe.replace(/"/g, '""')}"`;
        }

        function normalizeReadableCsvRows(rows) {
            return (Array.isArray(rows) ? rows : []).map(row => {
                if (row && typeof row === 'object' && !Array.isArray(row)) return row;
                return { value: row };
            });
        }

        function rowsToReadableCsv(rows) {
            const normalized = normalizeReadableCsvRows(rows);
            const columns = [];
            const seen = new Set();

            normalized.forEach(row => {
                Object.keys(row || {}).forEach(key => {
                    if (!seen.has(key)) {
                        seen.add(key);
                        columns.push(key);
                    }
                });
            });

            if (!columns.length) return '';

            const lines = [
                columns.map(escapeReadableCsvCell).join(',')
            ];

            normalized.forEach(row => {
                lines.push(columns.map(column => escapeReadableCsvCell(row ? row[column] : '')).join(','));
            });

            return `${lines.join('\n')}\n`;
        }

        function objectToReadableRows(obj, keyName = 'key') {
            if (!obj || typeof obj !== 'object') return [];
            return Object.entries(obj).map(([key, value]) => {
                if (value && typeof value === 'object' && !Array.isArray(value)) {
                    return { [keyName]: key, ...value };
                }
                return { [keyName]: key, value };
            });
        }

        async function decryptReadableCollection(db, collectionName) {
            const rows = Array.isArray(db?.[collectionName]) ? db[collectionName] : [];
            return Promise.all(rows.map(async (item) => {
                const metadata = {};
                if (item && typeof item === 'object') {
                    ['id', 'createdAt', 'lastModified', 'deletedAt'].forEach(key => {
                        if (typeof item[key] !== 'undefined') metadata[key] = item[key];
                    });
                }

                if (!item || typeof item !== 'object') return { value: item };
                if (!isEncryptedPayload(item.data)) {
                    const plain = { ...item };
                    delete plain.data;
                    return { ...metadata, ...plain };
                }

                const decrypted = await decryptData(item.data);
                if (!decrypted || typeof decrypted !== 'object') {
                    return { ...metadata, decryptError: true };
                }

                return { ...decrypted, ...metadata };
            }));
        }

        async function buildReadableFinanceExport(db, exportedAt) {
            const readable = {
                metadata: {
                    appName: 'FinanceFlow',
                    exportType: 'readable-plaintext-archive',
                    exportedAt: exportedAt.toISOString(),
                    schemaVersion: db.schema_version || CURRENT_SCHEMA_VERSION,
                    activeCurrency,
                    warning: 'This export contains decrypted plaintext financial data.'
                },
                encryptedCollections: {},
                plainCollections: {},
                objects: {}
            };

            for (const collectionName of READABLE_EXPORT_ENCRYPTED_COLLECTIONS) {
                readable.encryptedCollections[collectionName] = await decryptReadableCollection(db, collectionName);
            }

            for (const collectionName of READABLE_EXPORT_PLAIN_COLLECTIONS) {
                readable.plainCollections[collectionName] = cloneReadableValue(db[collectionName] || []);
            }

            let decryptedBudgets = {};
            if (db.budgets && isEncryptedPayload(db.budgets.data)) {
                decryptedBudgets = await decryptData(db.budgets.data) || {};
            } else {
                decryptedBudgets = cloneReadableValue(budgets || {});
            }

            readable.objects.budgets = decryptedBudgets;
            READABLE_EXPORT_OBJECT_SECTIONS
                .filter(sectionName => sectionName !== 'budgets')
                .forEach(sectionName => {
                    readable.objects[sectionName] = cloneReadableValue(db[sectionName] || {});
                });

            return readable;
        }

        function getReadableExportRows(readable, sectionName) {
            if (sectionName === 'budgets') {
                return objectToReadableRows(readable.objects.budgets || {}, 'category')
                    .map(row => ({ category: row.category, limit: row.value }));
            }

            if (readable.encryptedCollections[sectionName]) return readable.encryptedCollections[sectionName];
            if (readable.plainCollections[sectionName]) return readable.plainCollections[sectionName];
            if (readable.objects[sectionName]) return objectToReadableRows(readable.objects[sectionName], 'key');
            return [];
        }

        function getReadableExportCounts(readable) {
            const counts = {};
            READABLE_EXPORT_ENCRYPTED_COLLECTIONS.forEach(key => {
                counts[key] = (readable.encryptedCollections[key] || []).filter(item => !item?.deletedAt).length;
            });
            READABLE_EXPORT_PLAIN_COLLECTIONS.forEach(key => {
                counts[key] = (readable.plainCollections[key] || []).filter(item => !item?.deletedAt).length;
            });
            counts.budgets = Object.keys(readable.objects.budgets || {}).length;
            return counts;
        }

        function formatReadableExportMoney(value) {
            const amount = Number(value) || 0;
            if (typeof fmt === 'function') return fmt(amount);
            return `${activeCurrency || 'PHP'} ${amount.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
            })}`;
        }

        function computeReadableExportSummary(readable) {
            const transactions = (readable.encryptedCollections.transactions || [])
                .filter(tx => tx && !tx.deletedAt);
            let metrics = null;

            try {
                if (typeof computeSummaryMetrics === 'function') {
                    metrics = computeSummaryMetrics(transactions, 'all_time', { filteredTransactions: transactions });
                }
            } catch (error) {
                console.warn('[readable-export] Summary metric helper failed, using fallback.', error);
            }

            if (!metrics) {
                const income = transactions
                    .filter(tx => tx.type === 'income')
                    .reduce((sum, tx) => sum + (Number(tx.amt) || 0), 0);
                const expense = transactions
                    .filter(tx => tx.type !== 'income')
                    .reduce((sum, tx) => sum + (Number(tx.amt) || 0), 0);
                metrics = {
                    balance: income - expense,
                    income,
                    expense,
                    savingsRate: income > 0 ? Math.round(((income - expense) / income) * 100) : 0
                };
            }

            const expenseByCategory = {};
            transactions
                .filter(tx => tx.type !== 'income')
                .forEach(tx => {
                    const category = String(tx.category || 'Uncategorized');
                    expenseByCategory[category] = (expenseByCategory[category] || 0) + (Number(tx.amt) || 0);
                });

            const topExpenseCategories = Object.entries(expenseByCategory)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 8)
                .map(([category, amount]) => ({ category, amount }));

            const recentTransactions = [...transactions]
                .sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime())
                .slice(0, 12);

            return {
                metrics,
                counts: getReadableExportCounts(readable),
                topExpenseCategories,
                recentTransactions
            };
        }

        function addReadableSummaryPdfTable(doc, title, startY, head, body, options = {}) {
            doc.setFontSize(12);
            doc.text(title, 14, startY);
            if (typeof doc.autoTable === 'function') {
                doc.autoTable({
                    startY: startY + 4,
                    head: [head],
                    body,
                    theme: 'grid',
                    headStyles: { fillColor: options.fillColor || [37, 99, 235] },
                    styles: { fontSize: 8, cellPadding: 2 },
                    margin: { left: 14, right: 14 }
                });
                return doc.lastAutoTable?.finalY || startY + 14;
            }

            let y = startY + 8;
            body.slice(0, 12).forEach(row => {
                doc.text(row.join(' | '), 14, y);
                y += 5;
            });
            return y;
        }

        function buildReadableSummaryPdfBlob(readable, exportedAt) {
            if (!window.jspdf || !window.jspdf.jsPDF) {
                throw new Error('PDF library is not available.');
            }

            const { jsPDF } = window.jspdf;
            const doc = new jsPDF();
            const summary = computeReadableExportSummary(readable);
            const metrics = summary.metrics || {};

            doc.setFontSize(18);
            doc.text('FinanceFlow Readable Export Snapshot', 14, 16);
            doc.setFontSize(10);
            doc.text(`Exported: ${exportedAt.toLocaleString()}`, 14, 24);
            doc.text(`Schema: ${readable.metadata.schemaVersion} | Currency view: ${readable.metadata.activeCurrency || 'PHP'}`, 14, 30);
            doc.text('Plaintext archive: store the ZIP carefully.', 14, 36);

            const overviewRows = [
                ['Balance', formatReadableExportMoney(metrics.balance)],
                ['Income', formatReadableExportMoney(metrics.income)],
                ['Expenses', formatReadableExportMoney(metrics.expense)],
                ['Savings Rate', `${Number(metrics.savingsRate || 0).toFixed(1)}%`]
            ];

            let y = addReadableSummaryPdfTable(doc, 'Snapshot Summary', 46, ['Metric', 'Value'], overviewRows, {
                fillColor: [79, 70, 229]
            });

            const countRows = Object.entries(summary.counts)
                .sort((a, b) => a[0].localeCompare(b[0]))
                .map(([key, count]) => [key.replace(/_/g, ' '), String(count)]);
            y = addReadableSummaryPdfTable(doc, 'Active Record Counts', y + 10, ['Section', 'Count'], countRows, {
                fillColor: [8, 145, 178]
            });

            const topCategoryRows = summary.topExpenseCategories.length
                ? summary.topExpenseCategories.map(row => [row.category, formatReadableExportMoney(row.amount)])
                : [['No expense categories', '0']];
            y = addReadableSummaryPdfTable(doc, 'Top Expense Categories', y + 10, ['Category', 'Amount'], topCategoryRows, {
                fillColor: [220, 38, 38]
            });

            if (y > 210) {
                doc.addPage();
                y = 18;
            }

            const recentRows = summary.recentTransactions.length
                ? summary.recentTransactions.map(tx => [
                    tx.date ? new Date(tx.date).toLocaleDateString() : '',
                    String(tx.desc || tx.name || 'Untitled').slice(0, 44),
                    String(tx.category || 'Uncategorized').slice(0, 28),
                    String(tx.type || ''),
                    formatReadableExportMoney(tx.amt)
                ])
                : [['', 'No transactions', '', '', '']];
            addReadableSummaryPdfTable(doc, 'Recent Transactions', y + 10, ['Date', 'Description', 'Category', 'Type', 'Amount'], recentRows, {
                fillColor: [15, 118, 110]
            });

            return doc.output('blob');
        }

        function downloadReadableBlob(blob, filename) {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        }

        function buildReadableExportReadme(exportedAt) {
            return [
                'FinanceFlow Readable Export',
                '',
                `Exported: ${exportedAt.toISOString()}`,
                '',
                'This ZIP contains decrypted plaintext financial data.',
                'Anyone with access to this archive can read the included records.',
                '',
                'Use the encrypted FinanceFlow backup for app restore.',
                'Use this readable archive for review, audit, spreadsheet work, or migration.'
            ].join('\n');
        }

        async function validateBackupFilePayload(backup) {
            const issues = [];
            if (!backup || typeof backup !== 'object') {
                issues.push('Backup payload is not an object.');
                return { ok: false, issues, stats: null };
            }

            if (!backup.data || typeof backup.data !== 'object') {
                issues.push('Missing data block.');
                return { ok: false, issues, stats: null };
            }

            const data = backup.data;
            const schemaVersion = parseInt(data.schema_version || 1, 10);
            if (Number.isNaN(schemaVersion) || schemaVersion < 1) {
                issues.push('Invalid schema_version.');
            }

            const stats = {
                schemaVersion,
                transactions: (data.transactions || []).length,
                bills: (data.bills || []).length,
                debts: (data.debts || []).length,
                installmentPlans: (data.installment_plans || []).length,
                crypto: (data.crypto || []).length,
                budgets: backup.metadata?.budgetCategoryCount || 0
            };

            const encryptedCollections = ['transactions', 'bills', 'debts', 'installment_plans', 'lent', 'crypto', 'wishlist'];
            encryptedCollections.forEach(key => {
                (data[key] || []).forEach((item, idx) => {
                    if (!item || !item.data || !isEncryptedPayload(item.data)) {
                        issues.push(`Invalid encrypted payload in ${key}[${idx}]`);
                    }
                });
            });

            if (backup.integrity?.hash) {
                const expected = backup.integrity.hash;
                const actual = await computeBackupHash(data);
                if (expected !== actual) {
                    issues.push('Integrity hash mismatch.');
                }
            }

            return {
                ok: issues.length === 0,
                issues,
                stats
            };
        }

        // Toggle backup dropdown menu
        function toggleBackupMenu() {
            const dropdown = document.getElementById('backup-dropdown');
            dropdown.classList.toggle('hidden');
        }

        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            const menu = document.getElementById('backup-menu-btn');
            const dropdown = document.getElementById('backup-dropdown');
            if (menu && dropdown && !menu.contains(e.target) && !dropdown.contains(e.target)) {
                dropdown.classList.add('hidden');
            }
        });

        // Open backup settings modal
        function openBackupSettingsModal() {
            const settings = getBackupSettings();
            document.getElementById('auto-backup-toggle').checked = settings.autoBackupEnabled;
            document.getElementById('backup-hour-select').value = settings.backupHour;

            if (settings.lastBackupTime) {
                const date = new Date(settings.lastBackupTime);
                document.getElementById('last-backup-display').innerText = date.toLocaleString();
            } else {
                document.getElementById('last-backup-display').innerText = 'Never';
            }

            document.getElementById('backup-dropdown').classList.add('hidden');
            toggleModal('backup-settings-modal');
        }

        // Save backup settings
        function saveBackupSettingsModal() {
            const settings = {
                autoBackupEnabled: document.getElementById('auto-backup-toggle').checked,
                backupHour: parseInt(document.getElementById('backup-hour-select').value),
                lastBackupDate: getBackupSettings().lastBackupDate,
                lastBackupTime: getBackupSettings().lastBackupTime
            };
            saveBackupSettings(settings);
            toggleModal('backup-settings-modal');
            showToast('✅ Backup settings saved');
        }

        // Download backup now
        async function downloadBackupNow() {
            document.getElementById('backup-dropdown').classList.add('hidden');
            showToast('📦 Preparing backup...');

            try {
                const db = await getDB();
                const dataHash = await computeBackupHash(db);
                const backupData = {
                    appVersion: "4.0",
                    backupDate: new Date().toISOString(),
                    schemaVersion: db.schema_version || CURRENT_SCHEMA_VERSION,
                    encryptionVersion: "AES-GCM-v3",
                    metadata: {
                        budgetCategoryCount: Object.keys(budgets || {}).length,
                        transactionCount: (db.transactions || []).length,
                        conflictStrategy: db.sync?.conflictStrategy || 'local_wins'
                    },
                    integrity: {
                        algorithm: "SHA-256",
                        hash: dataHash
                    },
                    data: db
                };

                const jsonStr = JSON.stringify(backupData, null, 2);
                const blob = new Blob([jsonStr], { type: 'application/json' });
                const url = URL.createObjectURL(blob);

                const a = document.createElement('a');
                a.href = url;
                a.download = `financeflow_backup_${new Date().toISOString().split('T')[0]}.json`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);

                // Update last backup time
                const settings = getBackupSettings();
                settings.lastBackupDate = new Date().toISOString().split('T')[0];
                settings.lastBackupTime = Date.now();
                saveBackupSettings(settings);

                showToast('✅ Backup downloaded!');
            } catch (error) {
                console.error('Backup failed:', error);
                showToast('❌ Backup failed');
            }
        }

        async function exportReadableArchive() {
            const dropdown = document.getElementById('backup-dropdown');
            if (dropdown) dropdown.classList.add('hidden');

            if (!masterKey || !cryptoKey) {
                alert('Unlock FinanceFlow before exporting a readable archive.');
                return;
            }

            if (!window.JSZip) {
                alert('ZIP library is not available. Check your connection and reload FinanceFlow.');
                return;
            }

            if (!window.jspdf || !window.jspdf.jsPDF) {
                alert('PDF library is not available. Check your connection and reload FinanceFlow.');
                return;
            }

            const confirmed = window.confirm(
                'Export a plaintext readable archive?\n\nThis ZIP will contain decrypted financial data in CSV, JSON, and PDF form. Anyone with the file can read it.'
            );
            if (!confirmed) return;

            showToast('Preparing readable export...');

            try {
                const exportedAt = new Date();
                const stamp = getReadableExportStamp(exportedAt);
                const db = await getDB({ allowRemote: false });
                const readable = await buildReadableFinanceExport(db, exportedAt);
                const zip = new JSZip();

                zip.file('README.txt', buildReadableExportReadme(exportedAt));
                zip.file('manifest.json', JSON.stringify({
                    ...readable.metadata,
                    counts: getReadableExportCounts(readable),
                    files: {
                        csv: [
                            ...READABLE_EXPORT_ENCRYPTED_COLLECTIONS,
                            ...READABLE_EXPORT_PLAIN_COLLECTIONS,
                            ...READABLE_EXPORT_OBJECT_SECTIONS
                        ].map(name => `csv/${name}.csv`),
                        json: ['json/full-readable-export.json'],
                        pdf: ['snapshot-summary.pdf']
                    }
                }, null, 2));
                zip.file('json/full-readable-export.json', JSON.stringify(readable, null, 2));

                [
                    ...READABLE_EXPORT_ENCRYPTED_COLLECTIONS,
                    ...READABLE_EXPORT_PLAIN_COLLECTIONS,
                    ...READABLE_EXPORT_OBJECT_SECTIONS
                ].forEach(sectionName => {
                    zip.file(`csv/${sectionName}.csv`, rowsToReadableCsv(getReadableExportRows(readable, sectionName)));
                });

                const pdfBlob = buildReadableSummaryPdfBlob(readable, exportedAt);
                zip.file('snapshot-summary.pdf', pdfBlob);

                const archiveBlob = await zip.generateAsync({
                    type: 'blob',
                    compression: 'DEFLATE',
                    compressionOptions: { level: 6 }
                });

                downloadReadableBlob(archiveBlob, `financeflow_readable_export_${stamp}.zip`);
                showToast('Readable export downloaded');
            } catch (error) {
                console.error('Readable export failed:', error);
                showToast('Readable export failed');
                alert(`Readable export failed: ${error?.message || 'Unknown error'}`);
            }
        }

        // Auto backup check (called on unlock and every hour)
        async function checkAndPerformAutoBackup() {
            const settings = getBackupSettings();
            if (!settings.autoBackupEnabled) return;

            const now = new Date();
            const currentHour = now.getHours();
            const today = now.toISOString().split('T')[0];

            // Check if we should backup (after backup hour and not done today)
            if (currentHour >= settings.backupHour && settings.lastBackupDate !== today) {
                console.log('🔄 Auto-backup triggered');
                await downloadBackupNow();
            }
        }

        // Open restore modal
        function openRestoreModal() {
            document.getElementById('backup-dropdown').classList.add('hidden');
            document.getElementById('restore-preview').classList.add('hidden');
            document.getElementById('restore-select').classList.remove('hidden');
            document.getElementById('restore-confirm-btn').classList.add('hidden');
            toggleModal('restore-modal');
        }

        // Close restore modal
        function closeRestoreModal() {
            document.getElementById('restore-file-input').value = '';
            toggleModal('restore-modal');
        }

        // Preview backup file
        async function previewBackupFile(event) {
            const file = event.target.files[0];
            if (!file) return;

            try {
                const text = await file.text();
                const backup = JSON.parse(text);

                if (!backup.data || !backup.appVersion) {
                    throw new Error('Invalid backup file');
                }

                const validation = await validateBackupFilePayload(backup);
                if (!validation.ok) {
                    throw new Error(validation.issues.join('\n'));
                }

                // Store backup data temporarily
                window.pendingRestore = backup;

                // Show preview
                document.getElementById('restore-filename').innerText = file.name;
                document.getElementById('restore-date').innerText = new Date(backup.backupDate).toLocaleString();

                const stats = document.getElementById('restore-stats');
                const data = backup.data;
                stats.innerHTML = `
                    <div class="flex justify-between"><span class="text-slate-500">Transactions:</span><span class="font-bold text-slate-700">${data.transactions?.length || 0}</span></div>
                    <div class="flex justify-between"><span class="text-slate-500">Bills:</span><span class="font-bold text-slate-700">${data.bills?.length || 0}</span></div>
                    <div class="flex justify-between"><span class="text-slate-500">Debts:</span><span class="font-bold text-slate-700">${data.debts?.length || 0}</span></div>
                    <div class="flex justify-between"><span class="text-slate-500">Installment/BNPL:</span><span class="font-bold text-slate-700">${data.installment_plans?.length || 0}</span></div>
                    <div class="flex justify-between"><span class="text-slate-500">Crypto Transactions:</span><span class="font-bold text-slate-700">${data.crypto?.length || 0}</span></div>
                    <div class="flex justify-between"><span class="text-slate-500">Budget Categories:</span><span class="font-bold text-slate-700">${backup.metadata?.budgetCategoryCount || 0}</span></div>
                    <div class="flex justify-between"><span class="text-slate-500">Schema Version:</span><span class="font-bold text-slate-700">${validation.stats.schemaVersion}</span></div>
                `;

                document.getElementById('restore-select').classList.add('hidden');
                document.getElementById('restore-preview').classList.remove('hidden');
                document.getElementById('restore-confirm-btn').classList.remove('hidden');

                lucide.createIcons();
            } catch (error) {
                console.error('Invalid backup file:', error);
                showToast('❌ Invalid backup file');
            }
        }

        // Confirm restore
        async function confirmRestore() {
            if (!window.pendingRestore) return;

            if (!confirm('Are you sure? This will replace ALL current data.')) return;

            showToast('🔄 Restoring backup...');

            try {
                const backup = window.pendingRestore;
                const validation = await validateBackupFilePayload(backup);
                if (!validation.ok) {
                    throw new Error(`Backup validation failed: ${validation.issues.join('; ')}`);
                }

                // Persist locally + sync to Firebase
                await saveDB(backup.data);

                // Reload all data safely through the normal pipeline
                await loadFromStorage();

                closeRestoreModal();
                showToast('✅ Backup restored successfully!');

                delete window.pendingRestore;
            } catch (error) {
                console.error('Restore failed:', error);
                showToast('❌ Restore failed');
            }
        }

        // Toast notification
        function showToast(message) {
            const toast = document.createElement('div');
            toast.className = 'fixed top-20 right-4 bg-slate-800 text-white px-6 py-3 rounded-2xl shadow-2xl z-[200] animate-slide-in font-bold text-sm';
            toast.innerText = message;
            document.body.appendChild(toast);

            setTimeout(() => {
                toast.style.opacity = '0';
                toast.style.transform = 'translateX(100%)';
                toast.style.transition = 'all 0.3s ease';
                setTimeout(() => toast.remove(), 300);
            }, 3000);
        }
