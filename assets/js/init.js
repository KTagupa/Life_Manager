        // --- INITIALIZATION ---
        document.addEventListener('DOMContentLoaded', async () => {
            const isPrimaryStateEmpty = () => (
                nodes.length === 0 &&
                inbox.length === 0 &&
                Object.keys(lifeGoals).length === 0 &&
                archivedNodes.length === 0 &&
                (!Array.isArray(projects) || projects.length === 0)
            );

            const parseSavedJSON = (key, fallback) => {
                const raw = localStorage.getItem(key);
                if (!raw) return fallback;
                try {
                    const parsed = JSON.parse(raw);
                    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
                    console.warn(`[init] Ignoring non-object value for ${key}`);
                } catch (error) {
                    console.error(`[init] Failed to parse ${key}:`, error);
                }
                return fallback;
            };

            let loadResult = {
                success: false,
                restored: false,
                empty: false,
                source: 'none',
                error: 'load-not-run'
            };
            try {
                loadResult = await loadFromStorage();
            } catch (error) {
                console.error('[init] Critical storage initialization failure:', error);
            }

            if (loadResult.empty && isPrimaryStateEmpty()) {
                initDemoData();
            } else if (!loadResult.success && isPrimaryStateEmpty()) {
                console.warn('[init] Storage load was not reliable; skipping demo auto-seed.', loadResult);
            }

            const githubTokenInput = document.getElementById('github-token');
            if (githubTokenInput && githubToken) githubTokenInput.value = githubToken;

            const gistIdInput = document.getElementById('gist-id');
            if (gistIdInput && gistId) gistIdInput.value = gistId;

            if (typeof syncNotesFromRepository === 'function') {
                try {
                    await syncNotesFromRepository({ render: false, preserveSelection: true });
                } catch (error) {
                    console.error('[init] Failed to sync notes from shared repository:', error);
                }
            }

            // Load API Key into input if exists
            const geminiKeyInput = document.getElementById('gemini-api-key-input');
            if (geminiKeyInput && geminiApiKey) geminiKeyInput.value = geminiApiKey;
            const settingsGeminiKeyInput = document.getElementById('settings-gemini-key-input');
            if (settingsGeminiKeyInput && geminiApiKey) settingsGeminiKeyInput.value = geminiApiKey;

            // Load saved AI data preferences
            const savedAIData = localStorage.getItem('ai_selected_data');
            if (savedAIData) {
                try {
                    const parsedAIData = JSON.parse(savedAIData);
                    if (Array.isArray(parsedAIData) && parsedAIData.length > 0) {
                        selectedAIData = new Set(parsedAIData);
                    } else {
                        selectedAIData = new Set(['tasks']);
                    }

                    // Update button states
                    if (typeof setAIDataSelection === 'function') {
                        setAIDataSelection(Array.from(selectedAIData));
                    } else {
                        setTimeout(() => {
                            document.querySelectorAll('.ai-data-toggle').forEach(btn => btn.classList.remove('active'));
                            selectedAIData.forEach(type => {
                                const btn = document.querySelector(`.ai-data-toggle[data-type="${type}"]`);
                                if (btn) btn.classList.add('active');
                            });
                        }, 100);
                    }
                } catch (error) {
                    console.error('[init] Failed to parse ai_selected_data. Resetting to default.', error);
                    localStorage.removeItem('ai_selected_data');
                    selectedAIData = new Set(['tasks']);
                }
            }

            if (typeof loadAINoteSelection === 'function') loadAINoteSelection();
            if (typeof pruneAINoteSelection === 'function') pruneAINoteSelection();

            checkAutoArchive();
            checkExpiredTasks();
            updateCalculations();
            render();
            renderInbox();
            renderGoals();
            setupInteractions();
            setupPanelDrag();
            setupContextualMenu();
            if (typeof setupToolbarActionTooltips === 'function') setupToolbarActionTooltips();
            renderPinnedWindow();
            renderQuickLinks();
            if (typeof setNavigatorTab === 'function' && typeof getSavedNavigatorTab === 'function') {
                setNavigatorTab(getSavedNavigatorTab());
            }
            if (typeof setPlannerTab === 'function' && typeof getSavedPlannerTab === 'function') {
                setPlannerTab(getSavedPlannerTab());
            }
            const initialSection = (typeof getSavedWorkspaceSection === 'function')
                ? getSavedWorkspaceSection()
                : 'today';
            if (typeof setWorkspaceSection === 'function') setWorkspaceSection(initialSection);
            if (typeof updateAINoteSelectionSummary === 'function') updateAINoteSelectionSummary();
            if (typeof renderReminderStrip === 'function') renderReminderStrip();
            if (typeof shouldOpenDashboardOnStartup === 'function' && shouldOpenDashboardOnStartup()) {
                openInsightsDashboard();
            }

            // Setup modal dragging
            setupModalDragging();

            if (typeof initIndexNotesLiveSync === 'function') {
                initIndexNotesLiveSync();
            }

            // Load saved positions
            aiModalPosition = parseSavedJSON('aiModalPosition', aiModalPosition);
            inboxModalPosition = parseSavedJSON('inboxModalPosition', inboxModalPosition);
            remindersModalPosition = parseSavedJSON('remindersModalPosition', remindersModalPosition);
            healthDashboardPosition = parseSavedJSON('healthDashboardPosition', healthDashboardPosition);
            nodeGroupsModalPosition = parseSavedJSON('nodeGroupsModalPosition', nodeGroupsModalPosition);

            const healthDash = document.getElementById('health-dashboard');
            if (healthDash && healthDashboardPosition && healthDashboardPosition.x !== null) {
                healthDash.style.setProperty('left', healthDashboardPosition.x + 'px', 'important');
                healthDash.style.setProperty('top', healthDashboardPosition.y + 'px', 'important');
                healthDash.style.setProperty('bottom', 'auto', 'important');
                healthDash.style.setProperty('right', 'auto', 'important');
            }

            // Verify data loaded successfully
            console.log('📊 App initialized with:', {
                load: loadResult,
                nodes: nodes.length,
                archived: archivedNodes.length,
                inbox: inbox.length,
                notes: notes.length,
                habits: habits.length,
                projects: Array.isArray(projects) ? projects.length : 0
            });

            // Ensure recurring intervals are singleton timers.
            if (window.timerInterval) clearInterval(window.timerInterval);
            window.timerInterval = setInterval(tickTimers, 1000);

            if (window.autoArchiveInterval) clearInterval(window.autoArchiveInterval);
            window.autoArchiveInterval = setInterval(checkAutoArchive, 60000);

            if (window.expiredTasksInterval) clearInterval(window.expiredTasksInterval);
            window.expiredTasksInterval = setInterval(checkExpiredTasks, 60000);

            if (typeof checkReminderTriggers === 'function') {
                checkReminderTriggers();
                if (window.reminderTriggerInterval) clearInterval(window.reminderTriggerInterval);
                window.reminderTriggerInterval = setInterval(checkReminderTriggers, 30000);
            } else if (window.reminderTriggerInterval) {
                clearInterval(window.reminderTriggerInterval);
                window.reminderTriggerInterval = null;
            }

            // --- AUTOMATED BACKUP STARTUP ---
            updateBackupStatusUI();
            if (window.automatedBackupInterval) clearInterval(window.automatedBackupInterval);
            window.automatedBackupInterval = setInterval(checkAutomatedBackup, 60000);
        });
