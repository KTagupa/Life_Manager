        // =============================================
        // SECTION 8: BACKUP & RESTORE
        // =============================================
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
                const backupData = {
                    appVersion: "3.0",
                    backupDate: new Date().toISOString(),
                    encryptionVersion: "AES-GCM-v3",
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

                // Validate backup structure
                if (!backup.data || !backup.appVersion) {
                    throw new Error('Invalid backup file format');
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
                    <div class="flex justify-between"><span class="text-slate-500">Budget Categories:</span><span class="font-bold text-slate-700">${Object.keys(data.budgets?.data || {}).length || 0}</span></div>
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

                // Save to localStorage
                localStorage.setItem(DB_KEY, JSON.stringify(backup.data));

                // Sync to Firebase
                await saveDB(backup.data);

                // Reload all data
                rawTransactions = backup.data.transactions || [];
                rawBills = backup.data.bills || [];
                rawDebts = backup.data.debts || [];
                rawCrypto = backup.data.crypto || [];
                cryptoPrices = backup.data.crypto_prices || {};

                await loadAndRender();
                renderBills(rawBills);
                renderDebts(rawDebts);
                renderCryptoWidget();

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
