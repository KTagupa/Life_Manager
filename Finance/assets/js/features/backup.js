        // =============================================
        // SECTION 8: BACKUP & RESTORE
        // =============================================
        async function computeBackupHash(dataObj) {
            const json = JSON.stringify(dataObj);
            const bytes = new TextEncoder().encode(json);
            const hash = await crypto.subtle.digest('SHA-256', bytes);
            return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
        }

        function isEncryptedPayload(value) {
            return !!(value && typeof value === 'object' && Array.isArray(value.iv) && Array.isArray(value.content));
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
                crypto: (data.crypto || []).length,
                budgets: backup.metadata?.budgetCategoryCount || 0
            };

            const encryptedCollections = ['transactions', 'bills', 'debts', 'lent', 'crypto', 'wishlist'];
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
