        // =============================================
        // RECURRING REMINDERS SYSTEM
        // =============================================

        async function syncBillToReminder(billId, billName, dayOfMonth, estimatedAmount, options = {}) {
            const shouldPersist = options.persist !== false;
            const paused = options.paused === true;
            // Check if reminder already exists for this bill
            const existingReminderIndex = recurringTransactions.findIndex(r => r.linkedBillId === billId);
            const existingReminder = existingReminderIndex >= 0 ? recurringTransactions[existingReminderIndex] : null;

            const reminderData = {
                id: existingReminder ? existingReminder.id : `bill_${billId}`,
                desc: billName,
                type: 'expense',
                frequency: 'monthly',
                category: 'Bills',
                dayOfMonth: dayOfMonth,
                estimatedAmount: estimatedAmount, // Store estimate for reference
                linkedBillId: billId, // Link back to original bill
                lastDismissed: existingReminder ? existingReminder.lastDismissed : null,
                createdAt: existingReminder ? existingReminder.createdAt : new Date().toISOString(),
                paused: paused,
                autoSynced: true // Flag to indicate this was auto-created from a bill
            };
            const changed = !existingReminder
                || existingReminder.desc !== reminderData.desc
                || existingReminder.dayOfMonth !== reminderData.dayOfMonth
                || existingReminder.estimatedAmount !== reminderData.estimatedAmount
                || existingReminder.type !== reminderData.type
                || existingReminder.frequency !== reminderData.frequency
                || existingReminder.category !== reminderData.category
                || existingReminder.linkedBillId !== reminderData.linkedBillId
                || !!existingReminder.paused !== reminderData.paused
                || existingReminder.autoSynced !== reminderData.autoSynced;

            if (!changed) return false;

            if (existingReminderIndex >= 0) {
                // Update existing reminder
                recurringTransactions[existingReminderIndex] = reminderData;
            } else {
                // Add new reminder
                recurringTransactions.push(reminderData);
            }

            if (shouldPersist) {
                const db = await getDB();
                db.recurring_transactions = recurringTransactions;
                await saveDB(db);
            }
            return true;
        }

        async function syncCreditCardToReminder(cardId, cardName, dayOfMonth, options = {}) {
            const shouldPersist = options.persist !== false;
            const paused = options.paused === true;
            const normalizedDay = Number.isInteger(Number(dayOfMonth))
                ? Math.max(1, Math.min(31, Number(dayOfMonth)))
                : null;
            const existingReminderIndex = recurringTransactions.findIndex(r => r.linkedCreditCardId === cardId);
            const existingReminder = existingReminderIndex >= 0 ? recurringTransactions[existingReminderIndex] : null;

            if (!normalizedDay) {
                if (existingReminderIndex === -1) return false;
                recurringTransactions.splice(existingReminderIndex, 1);
                if (shouldPersist) {
                    const db = await getDB();
                    db.recurring_transactions = recurringTransactions;
                    await saveDB(db);
                }
                return true;
            }

            const reminderData = {
                id: existingReminder ? existingReminder.id : `credit_card_${cardId}`,
                desc: `Pay ${cardName}`,
                type: 'expense',
                frequency: 'monthly',
                category: cardName,
                dayOfMonth: normalizedDay,
                estimatedAmount: null,
                linkedCreditCardId: cardId,
                lastDismissed: existingReminder ? existingReminder.lastDismissed : null,
                createdAt: existingReminder ? existingReminder.createdAt : new Date().toISOString(),
                paused,
                autoSynced: true,
                autoSyncedSource: 'credit_card'
            };
            const changed = !existingReminder
                || existingReminder.desc !== reminderData.desc
                || existingReminder.dayOfMonth !== reminderData.dayOfMonth
                || existingReminder.type !== reminderData.type
                || existingReminder.frequency !== reminderData.frequency
                || existingReminder.category !== reminderData.category
                || existingReminder.linkedCreditCardId !== reminderData.linkedCreditCardId
                || !!existingReminder.paused !== reminderData.paused
                || existingReminder.autoSynced !== reminderData.autoSynced
                || existingReminder.autoSyncedSource !== reminderData.autoSyncedSource;

            if (!changed) return false;

            if (existingReminderIndex >= 0) {
                recurringTransactions[existingReminderIndex] = reminderData;
            } else {
                recurringTransactions.push(reminderData);
            }

            if (shouldPersist) {
                const db = await getDB();
                db.recurring_transactions = recurringTransactions;
                await saveDB(db);
            }
            return true;
        }

        async function syncAllBillsToReminders() {
            if (rawBills.length === 0) return;

            const decryptedBills = await Promise.all(rawBills.map(async b => {
                const data = await decryptData(b.data);
                return data ? { ...data, id: b.id } : null;
            }));

            let hasChanges = false;
            for (const bill of decryptedBills.filter(b => b)) {
                const changed = await syncBillToReminder(bill.id, bill.name, bill.day, bill.amt, { persist: false, paused: bill.paused === true });
                hasChanges = hasChanges || changed;
            }

            if (!hasChanges) return;

            const db = await getDB();
            db.recurring_transactions = recurringTransactions;
            await saveDB(db);
        }

        async function syncAllCreditCardsToReminders() {
            if (rawCreditCards.length === 0) return;

            const decryptedCards = await Promise.all(rawCreditCards.map(async card => {
                const data = await decryptData(card.data);
                return data ? { ...data, id: card.id } : null;
            }));

            let hasChanges = false;
            for (const card of decryptedCards.filter(Boolean)) {
                const changed = await syncCreditCardToReminder(card.id, card.name, card.paymentDueDay, {
                    persist: false,
                    paused: card.paymentReminderPaused === true
                });
                hasChanges = hasChanges || changed;
            }

            if (!hasChanges) return;

            const db = await getDB();
            db.recurring_transactions = recurringTransactions;
            await saveDB(db);
        }

        function getRecurringReminderSource(reminder) {
            if (reminder && reminder.linkedCreditCardId) return 'credit_card';
            if (reminder && reminder.linkedBillId) return 'bill';
            return '';
        }

        function getRecurringReminderEstimate(reminder, creditCardOutstandingMap = null) {
            if (reminder && reminder.linkedCreditCardId) {
                const outstandingMap = creditCardOutstandingMap || (
                    typeof computeCreditCardOutstandingMapAsOf === 'function'
                        ? computeCreditCardOutstandingMapAsOf(Date.now(), window.allDecryptedTransactions || [])
                        : new Map()
                );
                return Math.max(0, Number(outstandingMap.get(reminder.linkedCreditCardId) || 0));
            }
            return Math.max(0, Number(reminder?.estimatedAmount || 0));
        }


        function openRecurringModal() {
            populateCategorySelect(document.getElementById('rec-category'));
            renderRecurringList();
            onRecurringFrequencyChange();
            toggleModal('recurring-modal');
        }

        function onRecurringFrequencyChange() {
            const freq = document.getElementById('rec-frequency').value;
            const weeklyWrap = document.getElementById('rec-weekly-wrap');
            const monthlyWrap = document.getElementById('rec-monthly-wrap');
            const note = document.getElementById('rec-schedule-note');

            weeklyWrap.classList.toggle('hidden', freq !== 'weekly');
            monthlyWrap.classList.toggle('hidden', freq !== 'monthly');

            if (freq === 'weekly') {
                note.innerText = 'Pick a weekday for weekly reminders.';
            } else if (freq === 'monthly') {
                note.innerText = 'Pick a day (1-31) for monthly reminders.';
            } else {
                note.innerText = 'Daily reminders do not require an extra schedule field.';
            }
        }

        async function addRecurringReminder() {
            const desc = document.getElementById('rec-desc').value.trim();
            const type = document.getElementById('rec-type').value;
            const frequency = document.getElementById('rec-frequency').value;
            const category = document.getElementById('rec-category').value;
            const dayOfWeek = frequency === 'weekly'
                ? parseInt(document.getElementById('rec-day-of-week').value, 10)
                : null;
            const dayOfMonth = frequency === 'monthly'
                ? parseInt(document.getElementById('rec-day-of-month').value || '1', 10)
                : null;

            if (!desc) {
                alert('Please enter a description');
                return;
            }

            const newReminder = {
                id: Date.now().toString(36),
                desc,
                type,
                frequency,
                category,
                dayOfWeek: frequency === 'weekly' ? Math.max(0, Math.min(6, dayOfWeek || 1)) : undefined,
                dayOfMonth: frequency === 'monthly' ? Math.max(1, Math.min(31, dayOfMonth || 1)) : undefined,
                lastDismissed: null,
                createdAt: new Date().toISOString()
            };

            recurringTransactions.push(newReminder);

            const db = await getDB();
            db.recurring_transactions = recurringTransactions;
            await saveDB(db);

            // Clear form
            document.getElementById('rec-desc').value = '';
            document.getElementById('rec-day-of-month').value = '';
            document.getElementById('rec-day-of-week').value = '1';

            renderRecurringList();
            checkRecurringReminders();
            showToast('✅ Reminder added!');
        }

        async function deleteRecurringReminder(id) {
            const reminder = recurringTransactions.find(r => r.id === id);

            // Prevent deletion of auto-synced reminders
            if (reminder && reminder.autoSynced) {
                const source = getRecurringReminderSource(reminder);
                const sourceLabel = source === 'credit_card' ? 'Credit Cards' : 'Recurring Bills';
                alert(`This reminder is auto-synced from your ${sourceLabel}.\n\nTo remove it, edit the source item instead.`);
                return;
            }

            if (!confirm('Delete this reminder?')) return;

            recurringTransactions = recurringTransactions.filter(r => r.id !== id);

            const db = await getDB();
            db.recurring_transactions = recurringTransactions;
            await saveDB(db);

            renderRecurringList();
            checkRecurringReminders();
            showToast('🗑️ Reminder deleted');
        }

        function renderRecurringList() {
            const list = document.getElementById('recurring-list');

            if (recurringTransactions.length === 0) {
                list.innerHTML = '<div class="text-center text-xs text-slate-400 py-4">No recurring reminders set</div>';
                return;
            }

            const creditCardOutstandingMap = typeof computeCreditCardOutstandingMapAsOf === 'function'
                ? computeCreditCardOutstandingMapAsOf(Date.now(), window.allDecryptedTransactions || [])
                : new Map();

            list.innerHTML = recurringTransactions.map(r => {
                const source = getRecurringReminderSource(r);
                const icon = source === 'credit_card'
                    ? 'credit-card'
                    : (r.type === 'income' ? 'arrow-down-left' : 'arrow-up-right');
                const color = source === 'credit_card'
                    ? 'amber'
                    : (r.type === 'income' ? 'emerald' : 'rose');
                const freqLabel = r.frequency.charAt(0).toUpperCase() + r.frequency.slice(1);
                const weekdayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
                const encodedReminderId = encodeInlineArg(r.id);
                const safeDesc = escapeHTML(r.desc || 'Reminder');
                const safeCategory = escapeHTML(r.category || 'Others');
                const safeFreqLabel = escapeHTML(freqLabel);
                let dayLabel = '';
                if (r.frequency === 'weekly') {
                    const day = typeof r.dayOfWeek === 'number' ? r.dayOfWeek : 1;
                    dayLabel = ` (${weekdayNames[day]})`;
                } else if (r.frequency === 'monthly') {
                    dayLabel = r.dayOfMonth ? ` (${r.dayOfMonth}${getDaySuffix(r.dayOfMonth)})` : '';
                }
                const safeDayLabel = escapeHTML(dayLabel);

                const autoSyncBadge = r.autoSynced
                    ? `<span class="text-[9px] ${source === 'credit_card' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-600'} px-1.5 py-0.5 rounded font-bold">${source === 'credit_card' ? 'CARD' : 'AUTO-SYNCED'}</span>`
                    : '';
                const pausedBadge = r.paused ? '<span class="text-[9px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-bold">PAUSED</span>' : '';
                const estimateAmount = getRecurringReminderEstimate(r, creditCardOutstandingMap);
                const estimateText = estimateAmount > 0 ? ` • Est. ${fmt(estimateAmount)}` : '';
                const deleteButton = r.autoSynced
                    ? `<span class="text-[10px] text-slate-400 italic">${source === 'credit_card' ? 'Edit via Credit Cards' : 'Edit via Bills'}</span>`
                    : `<button onclick="deleteRecurringReminder(decodeURIComponent('${encodedReminderId}'))" 
                        class="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-rose-600 transition-all">
                        <i data-lucide="trash-2" class="w-4 h-4"></i>
                    </button>`;

                return `
                    <div class="flex items-center justify-between p-3 bg-slate-50 rounded-xl group hover:bg-slate-100">
                        <div class="flex items-center gap-3 flex-1">
                            <div class="w-8 h-8 rounded-lg bg-${color}-100 text-${color}-600 flex items-center justify-center">
                                <i data-lucide="${icon}" class="w-4 h-4"></i>
                            </div>
                            <div class="flex-1">
                                <div class="flex items-center gap-2">
                                    <p class="font-bold text-slate-800 text-sm">${safeDesc}</p>
                                    ${autoSyncBadge}
                                    ${pausedBadge}
                                </div>
                                <p class="text-xs text-slate-500">${safeFreqLabel}${safeDayLabel} • ${safeCategory}${estimateText}</p>
                            </div>
                        </div>
                        ${deleteButton}
                    </div>
                `;
            }).join('');

            lucide.createIcons();
        }

        function getDaySuffix(day) {
            if (day > 3 && day < 21) return 'th';
            switch (day % 10) {
                case 1: return 'st';
                case 2: return 'nd';
                case 3: return 'rd';
                default: return 'th';
            }
        }

        function checkRecurringReminders() {
            const today = new Date();
            const currentDay = today.getDate();
            const currentDayOfWeek = today.getDay();

            const dueReminders = recurringTransactions.filter(r => {
                if (r.paused) return false;

                const lastDismissed = r.lastDismissed ? new Date(r.lastDismissed) : null;

                // Check if already dismissed today
                if (lastDismissed && lastDismissed.toDateString() === today.toDateString()) {
                    return false;
                }

                // Check if due based on frequency
                if (r.frequency === 'daily') {
                    return true;
                }

                if (r.frequency === 'weekly') {
                    // If no specific day set, remind every Monday (1)
                    const targetDay = typeof r.dayOfWeek === 'number' ? r.dayOfWeek : 1;
                    return currentDayOfWeek === targetDay;
                }

                if (r.frequency === 'monthly') {
                    // If no specific day set, remind on 1st
                    const targetDay = r.dayOfMonth || 1;
                    return currentDay === targetDay;
                }

                return false;
            });

            if (dueReminders.length > 0) {
                showReminderBanner(dueReminders);
            } else {
                hideReminderBanner();
            }
        }

        function showReminderBanner(reminders) {
            const banner = document.getElementById('recurring-reminders-banner');
            const list = document.getElementById('reminder-items-list');
            const creditCardOutstandingMap = typeof computeCreditCardOutstandingMapAsOf === 'function'
                ? computeCreditCardOutstandingMapAsOf(Date.now(), window.allDecryptedTransactions || [])
                : new Map();

            list.innerHTML = reminders.map(r => {
                const source = getRecurringReminderSource(r);
                const icon = source === 'credit_card'
                    ? 'credit-card'
                    : (r.type === 'income' ? 'arrow-down-left' : 'arrow-up-right');
                const color = source === 'credit_card'
                    ? 'amber'
                    : (r.type === 'income' ? 'emerald' : 'amber');
                const encodedReminderId = encodeInlineArg(r.id);
                const safeDesc = escapeHTML(r.desc || 'Reminder');
                const safeCategory = escapeHTML(r.category || 'Others');

                const estimateAmount = getRecurringReminderEstimate(r, creditCardOutstandingMap);
                const estimateText = estimateAmount > 0 ? `~${fmt(estimateAmount)}` : '';
                const autoSyncBadge = r.autoSynced
                    ? `<span class="text-[9px] ${source === 'credit_card' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-600'} px-1.5 py-0.5 rounded font-bold ml-1">${source === 'credit_card' ? 'CARD' : 'BILL'}</span>`
                    : '';

                return `
                    <div class="flex items-center justify-between bg-white/50 p-2 rounded-lg">
                        <div class="flex items-center gap-2 flex-1">
                            <i data-lucide="${icon}" class="w-4 h-4 text-${color}-600"></i>
                            <span class="text-sm font-bold text-slate-700">${safeDesc}</span>
                            <span class="text-xs text-slate-500">• ${safeCategory}</span>
                            ${autoSyncBadge}
                            ${estimateText ? `<span class="text-xs text-slate-400 ml-auto">${estimateText}</span>` : ''}
                        </div>
                        <div class="flex gap-2">
                            <button onclick="quickAddFromReminder(decodeURIComponent('${encodedReminderId}'))" 
                                class="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-colors">
                                Quick Add
                            </button>
                            <button onclick="dismissReminder(decodeURIComponent('${encodedReminderId}'))" 
                                class="px-2 py-1 text-slate-400 hover:text-slate-600 text-xs">
                                <i data-lucide="x" class="w-4 h-4"></i>
                            </button>
                        </div>
                    </div>
                `;
            }).join('');

            banner.classList.remove('hidden');
            lucide.createIcons();
        }

        function hideReminderBanner() {
            document.getElementById('recurring-reminders-banner').classList.add('hidden');
        }

        async function quickAddFromReminder(reminderId) {
            const reminder = recurringTransactions.find(r => r.id === reminderId);
            if (!reminder) return;

            if (reminder.linkedCreditCardId) {
                const outstanding = getRecurringReminderEstimate(reminder);
                openCreditCardPaymentModal(reminder.linkedCreditCardId, {
                    amount: outstanding > 0 ? outstanding : undefined
                });
                if (outstanding > 0) {
                    showToast(`💡 Current outstanding: ${fmt(outstanding)}`);
                }
                await dismissReminder(reminderId);
                return;
            }

            // Open transaction modal with pre-filled data
            openTransactionModal();

            // Pre-fill fields
            document.getElementById('t-desc').value = reminder.desc;
            document.getElementById('t-category').value = reminder.category;
            setTType(reminder.type);
            document.getElementById('t-date').value = new Date().toISOString().split('T')[0];

            // If this is from a bill, pre-fill the estimated amount as a helpful starting point
            if (reminder.estimatedAmount && reminder.autoSynced) {
                document.getElementById('t-amount').value = reminder.estimatedAmount;
                // Add a visual hint
                showToast(`💡 Estimated: ${fmt(reminder.estimatedAmount)} (you can adjust)`);
            }

            // Focus on amount field
            setTimeout(() => {
                const amountField = document.getElementById('t-amount');
                amountField.focus();
                amountField.select(); // Select the pre-filled amount for easy editing
            }, 100);

            // Mark as used today (dismiss)
            await dismissReminder(reminderId);
        }

        async function dismissReminder(reminderId) {
            const reminder = recurringTransactions.find(r => r.id === reminderId);
            if (!reminder) return;

            reminder.lastDismissed = new Date().toISOString();

            const db = await getDB();
            db.recurring_transactions = recurringTransactions;
            await saveDB(db);

            checkRecurringReminders();
        }

        async function dismissAllReminders() {
            const today = new Date().toISOString();

            recurringTransactions.forEach(r => {
                r.lastDismissed = today;
            });

            const db = await getDB();
            db.recurring_transactions = recurringTransactions;
            await saveDB(db);

            hideReminderBanner();
            showToast('✅ All reminders dismissed');
        }
