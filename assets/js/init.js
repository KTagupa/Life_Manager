        // --- INITIALIZATION ---
        document.addEventListener('DOMContentLoaded', async () => {
            await loadFromStorage(); // Make it wait for IndexedDB
            if (nodes.length === 0 && inbox.length === 0 && Object.keys(lifeGoals).length === 0 && archivedNodes.length === 0) {
                initDemoData();
            }

            if (githubToken) document.getElementById('github-token').value = githubToken;
            if (gistId) document.getElementById('gist-id').value = gistId;

            // Load API Key into input if exists
            if (geminiApiKey) document.getElementById('gemini-api-key-input').value = geminiApiKey;

            // Load saved AI data preferences
            const savedAIData = localStorage.getItem('ai_selected_data');
            if (savedAIData) {
                try {
                    selectedAIData = new Set(JSON.parse(savedAIData));
                    // Update button states
                    setTimeout(() => {
                        selectedAIData.forEach(type => {
                            const btn = document.querySelector(`.ai-data-toggle[data-type="${type}"]`);
                            if (btn) btn.classList.add('active');
                        });
                    }, 100);
                } catch (e) {
                    selectedAIData = new Set(['tasks']); // Default
                }
            }

            checkAutoArchive();
            checkExpiredTasks();
            updateCalculations();
            render();
            renderInbox();
            renderGoals();
            setupInteractions();
            setupPanelDrag();
            setupContextualMenu();
            renderPinnedWindow();
            renderQuickLinks();

            // Setup modal dragging
            setupModalDragging();

            // Load saved positions
            const savedAIPos = localStorage.getItem('aiModalPosition');
            if (savedAIPos) aiModalPosition = JSON.parse(savedAIPos);

            const savedInboxPos = localStorage.getItem('inboxModalPosition');
            if (savedInboxPos) inboxModalPosition = JSON.parse(savedInboxPos);

            const savedHealthPos = localStorage.getItem('healthDashboardPosition');
            if (savedHealthPos) {
                try {
                    healthDashboardPosition = JSON.parse(savedHealthPos);
                    const healthDash = document.getElementById('health-dashboard');
                    if (healthDash && healthDashboardPosition.x !== null) {
                        healthDash.style.setProperty('left', healthDashboardPosition.x + 'px', 'important');
                        healthDash.style.setProperty('top', healthDashboardPosition.y + 'px', 'important');
                        healthDash.style.setProperty('bottom', 'auto', 'important');
                        healthDash.style.setProperty('right', 'auto', 'important');
                    }
                } catch (e) { }
            }

            const savedNodeGroupsPos = localStorage.getItem('nodeGroupsModalPosition');
            if (savedNodeGroupsPos) {
                try {
                    nodeGroupsModalPosition = JSON.parse(savedNodeGroupsPos);
                } catch (e) { }
            }

            // Verify data loaded successfully
            console.log('📊 App initialized with:', {
                nodes: nodes.length,
                archived: archivedNodes.length,
                inbox: inbox.length,
                notes: notes.length,
                habits: habits.length
            });

            window.timerInterval = setInterval(tickTimers, 1000);
            setInterval(checkAutoArchive, 60000);
            setInterval(checkExpiredTasks, 60000);

            // --- AUTOMATED BACKUP STARTUP ---
            updateBackupStatusUI();
            setInterval(checkAutomatedBackup, 60000);
        });
