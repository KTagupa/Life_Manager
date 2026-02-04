let geminiApiKey = localStorage.getItem('urgency_flow_gemini_key') || "";

// --- GITHUB SYNC LOGIC ---
function toggleSyncPanel() {
    const panel = document.getElementById('sync-panel');
    if (panel.classList.contains('hidden')) panel.classList.remove('hidden');
    else panel.classList.add('hidden');
}

// --- CONNECTION MONITORING ---
function updateConnectionStatus() {
    const statusEl = document.getElementById('connection-status');
    if (!statusEl) return;

    if (navigator.onLine) {
        // Test actual GitHub connectivity
        fetch('https://api.github.com', { method: 'HEAD', mode: 'no-cors' })
            .then(() => {
                statusEl.innerText = '🟢 Online';
                statusEl.style.background = 'var(--ready-color)';
                statusEl.style.color = '#000';
            })
            .catch(() => {
                statusEl.innerText = '🟡 No API';
                statusEl.style.background = '#f59e0b';
                statusEl.style.color = '#000';
            });
    } else {
        statusEl.innerText = '🔴 Offline';
        statusEl.style.background = '#ef4444';
        statusEl.style.color = '#fff';
    }
}

// Update on changes
window.addEventListener('online', () => {
    updateConnectionStatus();
    showNotification('Back online - ready to sync');
    // Auto-attempt sync if we have pending changes
    if (githubToken && gistId) pushToGist();
});

window.addEventListener('offline', () => {
    updateConnectionStatus();
    showNotification('Offline mode - changes saved locally');
});

// Check every 30 seconds
setInterval(updateConnectionStatus, 30000);
updateConnectionStatus(); // Initial check

function saveGithubToken(val) {
    githubToken = val.trim();
    saveToStorage();
    setSyncStatus('Token saved locally.');
}

function setSyncStatus(msg, isError = false) {
    const el = document.getElementById('sync-status');
    if (el) {
        el.style.color = isError ? '#ef4444' : 'var(--accent)';
        el.innerText = msg;
    } else {
        console.warn("Sync status element missing:", msg);
    }
}

async function testGithubConnection() {
    const tokenInput = document.getElementById('github-token');
    let rawToken = (tokenInput ? tokenInput.value : "") || githubToken || "";
    let cleanToken = String(rawToken).replace(/\s+/g, '');

    if (!cleanToken) {
        alert("Please enter a token to test.");
        return;
    }

    setSyncStatus('Testing connection...');

    try {
        // We fetch the user profile - the simplest way to check a token
        const response = await fetch('https://api.github.com/user', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${cleanToken}`,
                'Accept': 'application/vnd.github.v3+json'
            }
        });

        if (response.ok) {
            const data = await response.json();
            setSyncStatus(`Connected as: ${data.login} ✅`);
            showNotification(`Connected to GitHub!`);
        } else {
            const err = await response.json();
            setSyncStatus(`Invalid Token: ${response.status}`, true);
            alert(`GitHub rejected the token.\nStatus: ${response.status}\nMessage: ${err.message}`);
        }
    } catch (e) {
        setSyncStatus('Connection Blocked ❌', true);
        alert("Network Error: Could not reach GitHub. This is usually caused by an AdBlocker or lack of internet.");
    }
}

async function pushToGist() {
    // NEW: Stop any active task timers before pushing to ensure a static "snapshot"
    nodes.forEach(n => {
        if (n.activeTimerStart) {
            const now = Date.now();
            const dur = now - Number(n.activeTimerStart);
            n.timeLogs.push({ start: n.activeTimerStart, end: now, duration: dur });
            n.activeTimerStart = null;
        }
    });

    // --- STEP 1: PREPARE DATA ---
    let content;
    try {
        // We define appState here so it can be used for both Sync and AI context
        const appState = {
            nodes: nodes || [],
            archivedNodes: archivedNodes || [],
            inbox: inbox || [],
            lifeGoals: lifeGoals || {},
            notes: notes || [],
            habits: typeof habits !== 'undefined' ? habits : [],
            agenda: agenda || [],
            noteSettings: noteSettings || { categoryNames: Array.from({ length: 10 }, (_, i) => `Category ${i + 1}`) },
            timestamp: Date.now()
        };
        content = JSON.stringify(appState, null, 2);
        localStorage.setItem('urgencyFlow_lastSave', appState.timestamp);
    } catch (e) {
        alert("❌ DATA ERROR: Could not format your data. " + e.message);
        return;
    }

    // --- STEP 2: PREPARE TOKEN ---
    const tokenInput = document.getElementById('github-token');
    let rawToken = (tokenInput ? tokenInput.value : "") || githubToken || "";
    let cleanToken = String(rawToken).replace(/\s+/g, '');

    if (!cleanToken) {
        alert("❌ TOKEN ERROR: Please enter your GitHub Token.");
        return;
    }

    githubToken = cleanToken;
    saveToStorage();
    setSyncStatus('Connecting to GitHub...');

    // --- STEP 3: NETWORK REQUEST ---
    const files = {};
    files[GIST_FILENAME] = { content: content };

    let safeGistId = (gistId && typeof gistId === 'string') ? gistId.trim() : "";
    let method = safeGistId ? 'PATCH' : 'POST';
    let url = safeGistId ? `https://api.github.com/gists/${safeGistId}` : 'https://api.github.com/gists';

    try {
        let response = await fetch(url, {
            method: method,
            headers: {
                'Authorization': `Bearer ${cleanToken}`,
                'Accept': 'application/vnd.github.v3+json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                description: 'Urgency Flow Data Backup',
                public: false,
                files: files
            })
        });

        if (response.status === 404 && method === 'PATCH') {
            gistId = "";
            return pushToGist();
        }

        if (!response.ok) {
            const errData = await response.json().catch(() => ({ message: "Unknown Error" }));
            throw new Error(`GitHub Rejected (${response.status}): ${errData.message}`);
        }

        const result = await response.json();
        gistId = result.id;

        const gistIdInput = document.getElementById('gist-id');
        if (gistIdInput) gistIdInput.value = gistId;

        saveToStorage();
        setSyncStatus('Success!');
        showNotification('GitHub Sync Complete!');

    } catch (e) {
        console.error("Network Error:", e);
        setSyncStatus('Failed', true);
        alert("❌ SYNC FAILED: " + e.message);
    }
}

function mergeStates(local, remote) {
    const merged = {
        nodes: [],
        archivedNodes: [...(local.archivedNodes || [])],
        inbox: [...(local.inbox || [])],
        lifeGoals: local.lifeGoals || {},
        habits: local.habits || [],
        notes: [],
        agenda: local.agenda || []
    };

    // Merge tasks: prefer completed status if either is done, use latest modification
    const allTaskIds = new Set([
        ...(local.nodes || []).map(n => n.id),
        ...(remote.nodes || []).map(n => n.id)
    ]);

    allTaskIds.forEach(id => {
        const localTask = (local.nodes || []).find(n => n.id === id);
        const remoteTask = (remote.nodes || []).find(n => n.id === id);

        if (!localTask) {
            merged.nodes.push(remoteTask);
        } else if (!remoteTask) {
            merged.nodes.push(localTask);
        } else {
            // Both exist - pick the one with more recent activity or completed status
            const pickLocal =
                localTask.completed && !remoteTask.completed ||
                (localTask.timeLogs || []).length > (remoteTask.timeLogs || []).length ||
                (localTask.checkIns || []).length > (remoteTask.checkIns || []).length;

            const chosen = pickLocal ? localTask : remoteTask;

            // But merge time logs from both!
            if (localTask !== chosen && localTask.timeLogs) {
                chosen.timeLogs = [...(chosen.timeLogs || []), ...localTask.timeLogs];
            }
            if (remoteTask !== chosen && remoteTask.timeLogs) {
                chosen.timeLogs = [...(chosen.timeLogs || []), ...remoteTask.timeLogs];
            }

            merged.nodes.push(chosen);
        }
    });

    // Merge notes by timestamp
    const allNoteIds = new Set([
        ...(local.notes || []).map(n => n.id),
        ...(remote.notes || []).map(n => n.id)
    ]);

    allNoteIds.forEach(id => {
        const localNote = (local.notes || []).find(n => n.id === id);
        const remoteNote = (remote.notes || []).find(n => n.id === id);

        if (!localNote) merged.notes.push(remoteNote);
        else if (!remoteNote) merged.notes.push(localNote);
        else {
            // Pick newer note
            merged.notes.push(
                (localNote.timestamp || 0) > (remoteNote.timestamp || 0) ? localNote : remoteNote
            );
        }
    });

    return merged;
}

async function pullFromGist() {
    if (!githubToken) githubToken = document.getElementById('github-token').value.trim();

    if (!githubToken) {
        alert("Please enter a GitHub Personal Access Token first.");
        return;
    }

    setSyncStatus('Connecting to GitHub...');

    try {
        // 1. Find the Gist if ID is missing
        if (!gistId) {
            const listResp = await fetch('https://api.github.com/gists', {
                headers: {
                    'Authorization': `token ${githubToken}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            });
            const gists = await listResp.json();
            if (!Array.isArray(gists)) throw new Error(gists.message || "Failed to list Gists");

            const found = gists.find(g => g.files && g.files[GIST_FILENAME]);
            if (found) {
                gistId = found.id;
                document.getElementById('gist-id').value = gistId;
            } else {
                throw new Error("No Gist found with your data file. Try pushing first.");
            }
        }

        // 2. Fetch the specific Gist
        const resp = await fetch(`https://api.github.com/gists/${gistId}`, {
            headers: { 'Authorization': `token ${githubToken}` }
        });

        const data = await resp.json();
        if (!resp.ok) throw new Error(data.message || "Fetch failed");

        if (!data.files[GIST_FILENAME]) throw new Error("Target data file missing in Gist.");

        // 3. Parse the appState from the Gist
        const remoteState = JSON.parse(data.files[GIST_FILENAME].content);
        const localState = {
            nodes, archivedNodes, inbox, lifeGoals, habits, notes, agenda
        };

        // Check timestamps
        const remoteTime = remoteState.timestamp || 0;
        const localTime = localStorage.getItem('urgencyFlow_lastSave') || Date.now();

        const timeDiff = Math.abs(remoteTime - localTime);
        const isSignificantDiff = timeDiff > 60000; // 1 minute difference threshold

        if (isSignificantDiff && remoteTime > localTime && nodes.length > 0) {
            // Conflict detected!
            const choice = confirm(
                `⚠️ Sync Conflict Detected\n\n` +
                `Local: ${nodes.length} tasks, last edited ${new Date(parseInt(localTime)).toLocaleTimeString()}\n` +
                `Remote: ${(remoteState.nodes || []).length} tasks, last edited ${new Date(remoteTime).toLocaleTimeString()}\n\n` +
                `Click OK to use REMOTE (GitHub) version\n` +
                `Click Cancel to keep LOCAL version and overwrite remote`
            );

            if (!choice) {
                // User wants local - push local to GitHub instead
                pushToGist();
                setSyncStatus('Kept local version');
                return;
            }
            // Otherwise proceed with remote below
        }

        // Proceed with remote merge (with smart combining)
        const mergedState = mergeStates(localState, remoteState);

        // Restore merged
        nodes = mergedState.nodes || [];
        archivedNodes = mergedState.archivedNodes || [];
        inbox = mergedState.inbox || [];
        lifeGoals = mergedState.lifeGoals || {};
        notes = mergedState.notes || [];
        habits = mergedState.habits || [];
        agenda = mergedState.agenda || [];

        // Save merge timestamp
        localStorage.setItem('urgencyFlow_lastSave', Date.now());

        // 5. Cleanup & UI Refresh
        sanitizeLoadedData(); // Fixes missing properties in old data

        saveToStorage();      // Sync localstorage with pulled data
        updateCalculations(); // Recalculate critical path/urgency
        render();             // Redraw the graph
        renderInbox();        // Update fab inbox list
        renderGoals();        // Update goals panel

        setSyncStatus('Pull Complete!');
        showNotification('GitHub Sync Successful!');

    } catch (e) {
        console.error("Pull Error:", e);
        setSyncStatus('Pull Failed: ' + e.message, true);
        alert("Sync Error: " + e.message);
    }
}

function quickPrompt(text) {
    const input = document.getElementById('ai-input');
    input.value = text;
    askAI(); // This triggers the function we updated earlier
}

// --- GEMINI AI INTEGRATION ---
function toggleAIModal() {
    const modal = document.getElementById('ai-modal');
    const backdrop = document.getElementById('ai-modal-backdrop');

    if (modal.classList.contains('visible')) {
        closeAIModal();
    } else {
        // Restore saved position
        if (aiModalPosition.x !== null && aiModalPosition.y !== null) {
            modal.style.left = aiModalPosition.x + 'px';
            modal.style.top = aiModalPosition.y + 'px';
            modal.style.transform = 'none';
        }
        if (aiModalPosition.width && aiModalPosition.height) {
            modal.style.width = aiModalPosition.width + 'px';
            modal.style.height = aiModalPosition.height + 'px';
        }

        modal.classList.add('visible');
        backdrop.classList.add('visible');
        setTimeout(() => document.getElementById('ai-input').focus(), 100);
    }
}

function closeAIModal() {
    const modal = document.getElementById('ai-modal');
    const backdrop = document.getElementById('ai-modal-backdrop');

    // Save position before closing
    const rect = modal.getBoundingClientRect();
    aiModalPosition = {
        x: rect.left,
        y: rect.top,
        width: rect.width,
        height: rect.height
    };
    localStorage.setItem('aiModalPosition', JSON.stringify(aiModalPosition));

    modal.classList.remove('visible');
    backdrop.classList.remove('visible');
}

function toggleAISettings() {
    const pane = document.getElementById('ai-settings-pane');
    pane.classList.toggle('visible');
}

function toggleAIPresets() {
    const pane = document.getElementById('ai-presets-pane');
    if (pane.style.display === 'none' || pane.style.display === '') {
        pane.style.display = 'block';
    } else {
        pane.style.display = 'none';
    }
}

// Track selected data types
let selectedAIData = new Set(['tasks']); // Default to tasks

function toggleAIData(type) {
    const btn = document.querySelector(`.ai-data-toggle[data-type="${type}"]`);
    if (!btn) return;

    if (selectedAIData.has(type)) {
        selectedAIData.delete(type);
        btn.classList.remove('active');
    } else {
        selectedAIData.add(type);
        btn.classList.add('active');
    }

    // Save preference
    localStorage.setItem('ai_selected_data', JSON.stringify(Array.from(selectedAIData)));
}

// AI Task Presets
const aiPresets = {
    'analyze-risks': {
        prompt: 'Analyze my Critical Path tasks that are currently blocked. What is the single most important thing I must finish today to prevent a cascade of delays?',
        requiredData: ['tasks']
    },
    'goal-alignment': {
        prompt: 'Look at my Inbox ideas and current Life Goals. Which inbox items should I promote to tasks immediately to maintain momentum toward my goals?',
        requiredData: ['inbox', 'goals']
    },
    'weekly-summary': {
        prompt: 'Review my archived tasks, current progress, and habits. Write a brief executive summary of what I achieved this week and suggest my top 3 priorities for next week.',
        requiredData: ['tasks', 'archive', 'habits']
    },
    'schedule-optimization': {
        prompt: 'Analyze my current agenda and task list. Suggest an optimized schedule for today following the 90-minute Deep Work rule and energy management principles.',
        requiredData: ['tasks', 'schedule']
    },
    'unblock-tasks': {
        prompt: 'Show me all blocked tasks and their dependencies. What specific actions can I take right now to unblock the most critical tasks?',
        requiredData: ['tasks']
    },
    'habit-insights': {
        prompt: 'Analyze my habit streaks and completion rates. What patterns do you see? Which habits need attention and which are going strong?',
        requiredData: ['habits']
    },
    'next-action': {
        prompt: 'Based on my current schedule, what should I be working on right now? Consider urgency, energy levels, and my agenda.',
        requiredData: ['tasks', 'schedule']
    },
    'search-notes': {
        prompt: 'Search through my notes and find information related to: ',
        requiredData: ['notes'],
        needsInput: true
    }
};

function selectAIPreset(presetKey) {
    const preset = aiPresets[presetKey];
    if (!preset) return;

    // Auto-select required data
    selectedAIData.clear();
    preset.requiredData.forEach(type => {
        selectedAIData.add(type);
        const btn = document.querySelector(`.ai-data-toggle[data-type="${type}"]`);
        if (btn) btn.classList.add('active');
    });

    // Deselect unrequired data
    document.querySelectorAll('.ai-data-toggle').forEach(btn => {
        const type = btn.dataset.type;
        if (!preset.requiredData.includes(type)) {
            btn.classList.remove('active');
        }
    });

    const input = document.getElementById('ai-input');

    // Always populate input and focus, never auto-send
    input.value = preset.prompt;
    input.focus();

    // Close presets panel
    document.getElementById('ai-presets-pane').style.display = 'none';
}

function saveGeminiKey(val) {
    geminiApiKey = val.trim();
    localStorage.setItem('urgency_flow_gemini_key', geminiApiKey);
    showNotification("API Key Saved");
}

async function fetchGemini(payload, retries = 3, delay = 1000) {
    if (!geminiApiKey) throw new Error("Missing API Key");

    // Use gemini-2.5-flash as requested
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`;
    let lastError = null;

    for (let i = 0; i < retries; i++) {
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            const data = await response.json();

            if (response.ok) return data;

            // If not OK, capture details
            lastError = data.error ? data.error.message : response.statusText;

            if (response.status === 429 || response.status >= 500) {
                console.warn(`Retry ${i + 1}: ${response.status} - ${lastError}`);
            } else {
                throw new Error(`API Error ${response.status}: ${lastError}`);
            }

        } catch (e) {
            lastError = e.message;
            if (i === retries - 1) throw e;
            console.error("Fetch attempt failed:", e.message);
        }

        await new Promise(r => setTimeout(r, delay));
        delay *= 2;
    }
    throw new Error(`Failed to reach Gemini: ${lastError}`);
}

function addAIChatMessage(text, role) {
    const history = document.getElementById('ai-chat-history');
    const msg = document.createElement('div');
    msg.className = `ai-msg ${role}`;

    // 1. Check for Data Tags
    let cleanText = text;
    let scheduleJson = null;
    let decompJson = null;

    if (cleanText.includes('[SCHEDULE_DATA]')) {
        const parts = cleanText.split('[SCHEDULE_DATA]');
        const dataParts = parts[1].split('[/SCHEDULE_DATA]');
        scheduleJson = dataParts[0].trim();
        cleanText = parts[0] + (dataParts[1] || "");
    }

    if (cleanText.includes('[DECOMPOSITION_DATA]')) {
        const parts = cleanText.split('[DECOMPOSITION_DATA]');
        const dataParts = parts[1].split('[/DECOMPOSITION_DATA]');
        decompJson = dataParts[0].trim();
        cleanText = parts[0] + (dataParts[1] || "");
    }

    msg.innerHTML = typeof marked !== 'undefined' ? marked.parse(cleanText) : cleanText;

    if (scheduleJson && role === 'bot') {
        const pushBtn = document.createElement('button');
        pushBtn.className = 'btn btn-primary';
        pushBtn.style.marginTop = '10px';
        pushBtn.style.width = '100%';
        pushBtn.style.background = 'var(--ready-color)';
        pushBtn.innerText = '📅 Apply to My Agenda';
        pushBtn.onclick = () => {
            try {
                const newSlots = JSON.parse(scheduleJson);
                agenda = [...agenda, ...newSlots];
                saveToStorage();
                renderAgenda();
                showNotification("Agenda Updated!");
                pushBtn.innerText = '✅ Applied';
                pushBtn.disabled = true;
            } catch (e) { alert("Schedule Format Error"); }
        };
        msg.appendChild(pushBtn);
    }

    if (decompJson && role === 'bot') {
        const genBtn = document.createElement('button');
        genBtn.className = 'btn btn-primary';
        genBtn.style.marginTop = '10px';
        genBtn.style.width = '100%';
        genBtn.style.background = 'var(--ai-accent)';
        genBtn.innerText = '✨ Generate Project Graph';
        genBtn.onclick = () => {
            try {
                const data = JSON.parse(decompJson);
                applyDecomposition(data);
                genBtn.innerText = '✅ Graph Generated';
                genBtn.disabled = true;
            } catch (e) { alert("Decomposition Format Error"); }
        };
        msg.appendChild(genBtn);
    }

    history.appendChild(msg);
    history.scrollTop = history.scrollHeight;
}

function buildContextFromSelection(dataTypes) {
    const context = {
        currentTime: new Date().toLocaleString(),
        includedData: Array.from(dataTypes)
    };

    if (dataTypes.has('tasks')) {
        context.activeTasks = nodes.filter(n => !n.completed).slice(0, 50).map(n => ({
            id: n.id,
            title: n.title,
            due: n.dueDate,
            isUrgent: n.isManualUrgent,
            isCritical: n._isCritical,
            isBlocked: n._isBlocked,
            isReady: n._isReady,
            subtaskProgress: n.subtasks.length > 0 ? `${n.subtasks.filter(s => s.done).length}/${n.subtasks.length}` : 'none',
            dependencies: n.dependencies.map(d => {
                const dep = nodes.find(x => x.id === d.id);
                return dep ? dep.title : 'unknown';
            }).slice(0, 3),
            downstreamWeight: n._downstreamWeight
        }));
    }

    if (dataTypes.has('goals')) {
        context.lifeGoals = lifeGoals[currentGoalYear] || [];
        context.currentYear = currentGoalYear;
    }

    if (dataTypes.has('habits')) {
        context.habits = habits.map(h => ({
            title: h.title,
            type: h.type,
            frequency: h.frequency,
            streak: calculateStreak(h),
            target: h.target
        }));
    }

    if (dataTypes.has('schedule')) {
        context.agenda = agenda.slice(0, 30).map(slot => {
            const t = nodes.find(n => n.id === slot.taskId) || archivedNodes.find(n => n.id === slot.taskId);
            return {
                taskId: slot.taskId,
                task: t ? t.title : (slot.title || 'Unknown'),
                start: slot.start,
                end: slot.end
            };
        });
    }

    if (dataTypes.has('notes')) {
        context.notes = notes.slice(0, 50).map(n => ({
            id: n.id,
            title: n.title,
            preview: (n.body || '').substring(0, 300),
            linkedTaskCount: (n.taskIds || []).length,
            isPinned: n.isPinned
        }));
    }

    if (dataTypes.has('archive')) {
        context.completedTasks = archivedNodes.slice(-30).map(n => ({
            title: n.title,
            completedDate: n.completedDate ? new Date(n.completedDate).toLocaleDateString() : 'unknown'
        }));
    }

    if (dataTypes.has('inbox')) {
        context.inboxIdeas = inbox.map(i => ({
            id: i.id,
            title: i.title
        }));
    }

    return context;
}

function buildSmartContext(contextLevel, query) {
    const q = query.toLowerCase();

    // MINIMAL - Just counts and IDs
    if (contextLevel === 'minimal') {
        return {
            currentTime: new Date().toLocaleString(),
            activeTaskCount: nodes.filter(n => !n.completed).length,
            completedTaskCount: archivedNodes.length
        };
    }
    // Add other logic if needed, but the instructions focus on selection-based context
    return buildContextFromSelection(new Set(['tasks']));
}

async function askAI() {
    const input = document.getElementById('ai-input');
    const query = input.value.trim();
    if (!query) return;

    if (!geminiApiKey) {
        addAIChatMessage("⚠️ Please set your Gemini API Key in the settings (⚙️ icon above) to use AI features.", 'bot');
        toggleAISettings();
        return;
    }

    // Add user message to chat
    addAIChatMessage(query, 'user');
    input.value = '';

    // Show loading indicator
    const loadingEl = document.getElementById('ai-loading');
    if (loadingEl) loadingEl.classList.remove('hidden');

    // Build context from selected data types
    const appState = buildContextFromSelection(selectedAIData);

    // Build system prompt based on selected data
    const dataLabels = {
        tasks: 'Tasks (active nodes)',
        goals: 'Life Goals',
        habits: 'Daily Habits',
        schedule: 'Agenda/Calendar',
        notes: 'Knowledge Base Notes',
        archive: 'Completed Tasks',
        inbox: 'Inbox Ideas'
    };

    const includedDataList = Array.from(selectedAIData).map(d => dataLabels[d]).join(', ');

    const systemPrompt = `You are an AI assistant for "Urgency Flow," a productivity app.

DATA PROVIDED: ${includedDataList}

CONTEXT: ${JSON.stringify(appState)}

INSTRUCTIONS:
- Answer concisely and actionably
- Focus only on the data types provided above
- If asked about data not included, politely mention it wasn't included in this query
- If asked about data not included, politely mention it wasn't included in this query
- Prioritize practical next steps over general advice
- If the user asks for a schedule, agenda, or plan, generate a JSON array of schedule slots wrapped in [SCHEDULE_DATA] ... [/SCHEDULE_DATA] tags.
  Format: [SCHEDULE_DATA] [{"taskId":"<id> (optional)","title":"<title>","start":<timestamp_ms>,"end":<timestamp_ms>}] [/SCHEDULE_DATA]
  IMPORTANT: Use millisecond timestamps (numbers) for start and end times.

User Query: `;

    // Prepare API payload
    const payload = {
        contents: [
            {
                parts: [
                    { text: systemPrompt + "\n\nUser Query: " + query }
                ]
            }
        ]
    };

    try {
        const result = await fetchGemini(payload);

        if (!result.candidates || !result.candidates[0] || !result.candidates[0].content) {
            throw new Error("Invalid response from Gemini API");
        }

        const text = result.candidates[0].content.parts[0].text || "I couldn't generate a response.";
        addAIChatMessage(text, 'bot');

    } catch (e) {
        console.error("AI Error:", e);
        addAIChatMessage(`❌ AI Error: ${e.message}. Please check your API key, internet connection, or model status.`, 'bot');
    } finally {
        if (loadingEl) loadingEl.classList.add('hidden');
    }
}

function decomposeGoal(goal) {
    toggleAIModal();
    const prompt = `Break down the goal "${goal.text}" into a detailed project plan with dependencies. Specify durations for each task in days.`;
    quickPrompt(prompt);
}

function decomposeTask() {
    const node = nodes.find(n => n.id === selectedNodeId);
    if (!node) return;
    toggleAIModal();
    const prompt = `Decompose the task "${node.title}" into smaller sub-tasks. Maintain the context of any existing dependencies if possible.`;
    quickPrompt(prompt);
}

function applyDecomposition(data) {
    if (!data || !Array.isArray(data)) return;

    const idMap = {};
    const startX = (window.innerWidth / 2 - panX) / scale - 90;
    const startY = (window.innerHeight / 2 - panY) / scale - 50;

    // 1. Create Nodes
    data.forEach((item, index) => {
        const newNode = createNode(startX + (index % 3) * 220, startY + Math.floor(index / 3) * 150, item.title);
        newNode.duration = item.duration || 1;
        nodes.push(newNode);
        idMap[item.tempId] = newNode.id;
    });

    // 2. Link Dependencies
    data.forEach(item => {
        if (item.dependencies && Array.isArray(item.dependencies)) {
            const targetNode = nodes.find(n => n.id === idMap[item.tempId]);
            if (targetNode) { // Ensure targetNode exists
                item.dependencies.forEach(depId => {
                    if (idMap[depId]) {
                        targetNode.dependencies.push({ id: idMap[depId], type: 'hard' });
                    }
                });
            }
        }
    });

    updateCalculations();
    render();
    saveToStorage();
    showNotification(`Generated ${data.length} tasks!`);
}


// --- AI TEXT INTEGRATION ---
const noteInput = document.getElementById('note-body-input');
const aiToolbar = document.getElementById('ai-text-toolbar');

if (noteInput && aiToolbar) {
    noteInput.addEventListener('mouseup', handleNoteSelection);
    // Hide on keyup (typing) to avoid annoying popups while editing
    noteInput.addEventListener('keyup', () => {
        const start = noteInput.selectionStart;
        const end = noteInput.selectionEnd;
        // Only hide if selection collapsed
        if (start === end) aiToolbar.classList.remove('visible');
    });
}

function handleNoteSelection(e) {
    const start = noteInput.selectionStart;
    const end = noteInput.selectionEnd;

    if (start !== end) {
        // We have a selection
        // Position toolbar near mouse
        const x = e.clientX;
        const y = e.clientY;

        aiToolbar.style.left = `${x - 50}px`; // Center align approx
        aiToolbar.style.top = `${y - 50}px`; // Above cursor
        aiToolbar.classList.add('visible');
    } else {
        aiToolbar.classList.remove('visible');
    }
}

document.addEventListener('mousedown', (e) => {
    // Hide AI toolbar if clicking outside
    if (aiToolbar && aiToolbar.classList.contains('visible')) {
        if (!aiToolbar.contains(e.target) && e.target !== noteInput) {
            aiToolbar.classList.remove('visible');
        }
    }
});

async function applyAI(mode) {
    const start = noteInput.selectionStart;
    const end = noteInput.selectionEnd;
    const selectedText = noteInput.value.substring(start, end);

    if (!selectedText) return;

    // 1. Check for Gemini Key
    if (!geminiApiKey) {
        geminiApiKey = localStorage.getItem('urgency_flow_gemini_key');
    }

    if (!geminiApiKey) {
        alert("⚠️ Please set your Gemini API Key in the settings (⚙️ icon top-left) to use AI features.");
        return;
    }

    // Show loading state
    const btn = event.currentTarget || document.activeElement;
    let originalBtnText = "";
    if (btn) {
        originalBtnText = btn.innerHTML;
        btn.innerHTML = '<span>⏳</span> Processing...';
        btn.style.cursor = 'wait';
    }

    const systemPrompt = mode === 'grammar'
        ? "Fix grammar and spelling in the following text. Return ONLY the corrected text. Do not add quotes. Preserve formatting. Text: "
        : "Rewrite the following text to improve clarity, flow, and professionalism. Return ONLY the rewritten text. Do not add quotes. Preserve formatting. Text: ";

    try {
        // Use the existing fetchGemini helper function
        const responseData = await fetchGemini({
            contents: [{
                parts: [{ text: systemPrompt + selectedText }]
            }]
        });

        if (!responseData.candidates || !responseData.candidates[0] || !responseData.candidates[0].content) {
            throw new Error("Invalid response from Gemini AI");
        }

        let result = responseData.candidates[0].content.parts[0].text;

        // Clean up quotes
        result = result.trim();
        // Simple quote cleanup
        if (result.startsWith('"') && result.endsWith('"') && result.length > 2) {
            result = result.slice(1, -1);
        }

        // Replace text
        const before = noteInput.value.substring(0, start);
        const after = noteInput.value.substring(end);

        noteInput.value = before + result + after;

        // Save
        if (typeof saveCurrentNote === 'function') {
            saveCurrentNote();
        }

    } catch (err) {
        console.error(err);
        alert("AI Error: " + err.message);
    } finally {
        if (aiToolbar) aiToolbar.classList.remove('visible');
        if (btn && originalBtnText) btn.innerHTML = originalBtnText;
    }
}

async function applyAI_OLD_UNUSED(mode) {
    const start = noteInput.selectionStart;
    const end = noteInput.selectionEnd;
    const selectedText = noteInput.value.substring(start, end);

    if (!selectedText) return;

    // 1. Check for Gemini Key
    if (!geminiApiKey) {
        geminiApiKey = localStorage.getItem('urgency_flow_gemini_key');
    }

    if (!geminiApiKey) {
        alert("⚠️ Please set your Gemini API Key in the settings (⚙️ icon top-left) to use AI features.");
        return;
    }

    // Show loading state
    const originalBtnText = event.currentTarget.innerHTML;
    event.currentTarget.innerHTML = '<span>⏳</span> Processing...';
    event.currentTarget.style.cursor = 'wait';

    const systemPrompt = mode === 'grammar'
        ? "Fix grammar and spelling in the following text. Return ONLY the corrected text. Preserve formatting."
        : "Rewrite the following text to include improve clarity and flow. Return ONLY the rewritten text. Preserve formatting.";

    try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: "gpt-3.5-turbo",
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: selectedText }
                ],
                temperature: 0.3
            })
        });

        const data = await response.json();

        if (data.error) {
            throw new Error(data.error.message);
        }

        const result = data.choices[0].message.content;

        // Replace text
        const before = noteInput.value.substring(0, start);
        const after = noteInput.value.substring(end);

        noteInput.value = before + result + after;

        // Save
        saveCurrentNote(); // Ensure function exists

        // Update selection to new text length
        // noteInput.setSelectionRange(start, start + result.length); // Optional: keep selection

    } catch (err) {
        alert("AI Error: " + err.message);
        // If auth error, maybe clear key
        if (err.message.includes('401') || err.message.includes('key')) {
            localStorage.removeItem('openai_api_key');
        }
    } finally {
        // Reset button
        // Need to re-query button or use closures, but simplest is just hiding toolbar
        aiToolbar.classList.remove('visible');
        // Could reset button text if we kept the toolbar open
        // event.target.innerHTML = originalBtnText; // naive
    }
}
