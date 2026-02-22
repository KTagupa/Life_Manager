// --- STATE MANAGEMENT ---
let nodes = [];
let agenda = []; // Stores { taskId, start, end }
let archivedNodes = [];
let inbox = [];
let lifeGoals = {};
let habits = [];
let notes = [];
let reminders = [];

// --- HISTORY MANAGEMENT ---
const MAX_HISTORY = 50;
let historyStack = [];
let historyIndex = -1;
let lastHistoryState = null;

function pushHistory() {
    const currentState = JSON.stringify({ nodes, archivedNodes, inbox, lifeGoals, habits, notes, agenda, reminders });
    if (currentState === lastHistoryState) return;

    if (historyIndex < historyStack.length - 1) {
        historyStack = historyStack.slice(0, historyIndex + 1);
    }

    historyStack.push(currentState);
    if (historyStack.length > MAX_HISTORY) historyStack.shift();
    else historyIndex++;

    lastHistoryState = currentState;

    // Update UI indicators if they exist
    const undoBtn = document.getElementById('undo-btn');
    if (undoBtn) {
        undoBtn.style.opacity = historyIndex >= 0 ? '1' : '0.3';
    }
}

function undo() {
    if (historyIndex > 0) {
        historyIndex--;
        restoreHistory();
    }
}

function redo() {
    if (historyIndex < historyStack.length - 1) {
        historyIndex++;
        restoreHistory();
    }
}

function restoreHistory() {
    const state = JSON.parse(historyStack[historyIndex]);
    nodes = state.nodes || [];
    archivedNodes = state.archivedNodes || [];
    inbox = state.inbox || [];
    lifeGoals = state.lifeGoals || {};
    habits = state.habits || [];
    notes = state.notes || [];
    agenda = state.agenda || [];
    reminders = state.reminders || [];

    sanitizeLoadedData();
    updateCalculations();
    render();

    // Refresh all panels
    renderGoals();
    renderHabits();
    renderNotesList();
    if (typeof renderReminderStrip === 'function') renderReminderStrip();
    if (typeof renderRemindersModal === 'function') renderRemindersModal();
    if (selectedNodeId) updateInspector();

    saveToStorage();
}

// --- HELPER: GET SELECTED NODE ---
function getSelectedNode() {
    if (!selectedNodeId) return null;
    return nodes.find(n => n.id === selectedNodeId) || archivedNodes.find(n => n.id === selectedNodeId);
}
let noteSettings = {
    categoryNames: Array.from({ length: 10 }, (_, i) => `Category ${i + 1}`)
};
const noteCategoryColors = [
    "#f1f5f9", "#ffedd5", "#fef9c3", "#dcfce7", "#d1fae5",
    "#e0f2fe", "#e0e7ff", "#fae8ff", "#ffe4e6", "#fee2e2"
];
let currentNoteBlocks = [];
let activeBlockId = null;
let isNoteGlobalViewMode = false;
let renamingCategoryIndex = -1;
let currentGoalYear = new Date().getFullYear();
let selectedNodeId = null;
let selectedIds = new Set();
let currentEditingNoteId = null;
let noteEditorState = 'normal'; // 'normal' or 'maximized'
let pinnedItems = []; // {type: 'task'|'note'|'habit', id: string}
let quickLinks = []; // {id: string, label: string, url: string}
let hiddenNodeGroups = new Set(); // Set of group IDs that are hidden
let taskGroupFocusState = {
    active: false,
    groupIds: [],
    currentIndex: -1,
    activeGroupId: null
};
let nodeGroupsModalPosition = { x: null, y: null, width: 420, height: 600 };
let aiModalPosition = { x: null, y: null, width: 450, height: 600 };
let inboxModalPosition = { x: null, y: null, width: 380, height: 500 };
let remindersModalPosition = { x: null, y: null, width: 560, height: 620 };
let healthDashboardPosition = { x: null, y: null };
let scale = 1;
let panX = 0;
let panY = 0;
let lastRenderTime = 0;

let lastKnownAgendaTaskId = null;

let isEcoMode = false;
let isUltraEcoMode = false;
let ecoModeLevel = 0; // 0 = Turbo, 1 = Eco, 2 = Ultra Eco
let redZoneStartTime = null;

// Sync State
let githubToken = '';
let gistId = '';
const GIST_FILENAME = 'urgency_flow_data.json';

// Auto-Archive Constant
const ARCHIVE_THRESHOLD_MS = 15 * 24 * 60 * 60 * 1000;

// Interaction State
let isDragging = false;
let isPanning = false;
let isBoxSelecting = false;
let dragStartX, dragStartY;
let draggedNodeId = null;

// Box Selection
let boxSelectStart = { x: 0, y: 0 };

let lastTouchX = 0, lastTouchY = 0;
let initialPinchDist = null;
let initialScale = 1;
let pinchStartCenter = { x: 0, y: 0 };
let pinchStartPan = { x: 0, y: 0 };
let currentHeatmapYear = new Date().getFullYear();

// Draggable Panel State
let isPanelDragging = false;
let panelDragOffset = { x: 0, y: 0 };

// Global variables for context menu
let currentSelectionText = '';
let currentSelectionSource = ''; // 'note' or 'ai'
let noteSelectionRange = null; // Store indices for note replacement


// --- DATA STRUCTURE ---
function createNode(x, y, title = 'New Task') {
    title = (title || 'New Task').toString().trim();
    if (title.length > 500) title = title.substring(0, 500) + '...';

    return {
        id: 'task_' + Date.now() + Math.random().toString(36).substr(2, 5),
        title: title,
        description: '',
        x: Number.isFinite(x) ? x : 100,
        y: Number.isFinite(y) ? y : 100,
        duration: 1,
        dueDate: '',
        expiresOnDue: false,
        syncDurationDate: true,
        completed: false,
        completedDate: null,
        isManualUrgent: false,
        isManualNotUrgent: false,
        dependencies: [],
        subtasks: [],
        activeTimerStart: null,
        timeLogs: [],
        checkIns: [],
        externalLink: '',
        goalIds: []
    };
}

function createGoal(text) {
    text = (text || 'New Goal').toString().trim();
    if (text.length > 200) text = text.substring(0, 200) + '...';

    return {
        id: 'goal_' + Date.now() + Math.random().toString(36).substr(2, 5),
        text: text,
        collapsed: false,
        children: []
    };
}

function createNoteObject(title, body = "", taskId = null) {
    title = (title || 'New Note').toString().trim();
    body = (body || '').toString();

    return {
        id: 'note_' + Date.now() + Math.random().toString(36).substr(2, 5),
        title: title || "New Note",
        body: body,
        taskIds: taskId ? [String(taskId)] : [],
        isPinned: false,
        timestamp: Date.now()
    };
}

function initDemoData() {
    nodes = [
        {
            id: '1', title: 'Define Goal', x: 100, y: 300, completed: true, completedDate: Date.now(), duration: 1, dueDate: '', syncDurationDate: true, isManualUrgent: false,
            dependencies: [], subtasks: [{ text: 'Brainstorm', done: true }],
            activeTimerStart: null, timeLogs: []
        }
    ];
    archivedNodes = [];
    inbox = [];
    lifeGoals = {};
    habits = [];
    notes = [];
    agenda = [];
    quickLinks = [];
    reminders = [];
    pinnedItems = [];
    hiddenNodeGroups = new Set();
    taskGroupFocusState = {
        active: false,
        groupIds: [],
        currentIndex: -1,
        activeGroupId: null
    };
    saveToStorage();
}

async function wipeIndexedDB() {
    await new Promise(resolve => {
        let done = false;
        const finish = () => {
            if (done) return;
            done = true;
            resolve();
        };

        const deleteDb = () => {
            const deleteReq = indexedDB.deleteDatabase('urgencyFlowDB');
            deleteReq.onsuccess = finish;
            deleteReq.onerror = finish;
            deleteReq.onblocked = finish;
        };

        const openReq = indexedDB.open('urgencyFlowDB', 1);

        openReq.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains('appState')) {
                db.createObjectStore('appState', { keyPath: 'id' });
            }
        };

        openReq.onsuccess = (event) => {
            const db = event.target.result;
            const closeThenDelete = () => {
                try { db.close(); } catch (error) {
                    console.warn('[storage] Failed to close IndexedDB before delete:', error);
                }
                deleteDb();
            };

            try {
                const tx = db.transaction(['appState'], 'readwrite');
                tx.objectStore('appState').clear();
                tx.oncomplete = closeThenDelete;
                tx.onerror = closeThenDelete;
                tx.onabort = closeThenDelete;
            } catch (e) {
                closeThenDelete();
            }
        };

        openReq.onerror = () => {
            deleteDb();
        };
    });
}


// --- STORAGE & PERSISTENCE ---
function saveToStorage() {
    saveToStorageImmediate();
}

function saveToStorageImmediate() {
    const data = {
        nodes, archivedNodes, inbox, lifeGoals, notes, githubToken,
        gistId, habits, agenda, pinnedItems, quickLinks, reminders, noteSettings, remindersModalPosition,
        hiddenNodeGroups: Array.from(hiddenNodeGroups),
        timestamp: Date.now()
    };

    // Save to IndexedDB (asynchronous, large capacity)
    const request = indexedDB.open('urgencyFlowDB', 1);
    request.onupgradeneeded = (event) => {
        const db = event.target.result;
        // Only create if it doesn't exist
        if (!db.objectStoreNames.contains('appState')) {
            db.createObjectStore('appState', { keyPath: 'id' });
        }
    };

    request.onsuccess = (event) => {
        const db = event.target.result;
        const tx = db.transaction(['appState'], 'readwrite');
        const store = tx.objectStore('appState');
        store.put({ id: 'main', data: data });

        // Add transaction completion handler
        tx.oncomplete = () => {
            console.log('✅ Data saved to IndexedDB successfully');
        };

        tx.onerror = (err) => {
            console.error('❌ IndexedDB transaction error:', err);
        };

        // Also keep localStorage as fallback/cache
        try {
            const compressed = JSON.stringify(data);
            localStorage.setItem('urgencyFlowData_backup', compressed);
        } catch (e) {
            console.warn('localStorage backup failed (size limit exceeded, but IndexedDB has it)');
        }

        pushHistory();
        updateHealthMonitor();
    };

    request.onerror = (event) => {
        console.error('IndexedDB error:', event);
        // Fallback to localStorage only
        try {
            localStorage.setItem('urgencyFlowData', JSON.stringify(data));
        } catch (e) {
            alert('Storage full! Please export and clear old data.');
        }
    };
}

function loadFromStorage() {
    return new Promise((resolve) => {
        let settled = false;
        const finish = (result) => {
            if (settled) return;
            settled = true;
            resolve({
                success: false,
                restored: false,
                empty: false,
                source: 'none',
                error: null,
                ...result
            });
        };

        const restoreFromLegacy = (keys) => {
            let sawLegacyData = false;
            for (const key of keys) {
                const raw = localStorage.getItem(key);
                if (!raw) continue;
                sawLegacyData = true;
                try {
                    restoreStateData(JSON.parse(raw));
                    return { restored: true, key, sawLegacyData: true };
                } catch (error) {
                    console.error(`[storage] localStorage parse error (${key}):`, error);
                }
            }
            return { restored: false, key: null, sawLegacyData };
        };

        let request;
        try {
            request = indexedDB.open('urgencyFlowDB', 1);
        } catch (error) {
            console.error('[storage] IndexedDB open threw synchronously:', error);
            const legacy = restoreFromLegacy(['urgencyFlowData', 'urgencyFlowData_backup']);
            finish({
                success: legacy.restored,
                restored: legacy.restored,
                source: legacy.restored ? 'localStorage' : 'none',
                error: 'indexeddb-open-throw'
            });
            return;
        }

        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains('appState')) {
                db.createObjectStore('appState', { keyPath: 'id' });
            }
        };

        request.onsuccess = (event) => {
            const db = event.target.result;
            const closeDb = () => {
                try {
                    db.close();
                } catch (closeError) {
                    console.warn('[storage] Failed to close IndexedDB handle cleanly:', closeError);
                }
            };

            let tx;
            try {
                tx = db.transaction(['appState'], 'readonly');
            } catch (error) {
                console.error('[storage] Failed to open IndexedDB transaction:', error);
                const legacy = restoreFromLegacy(['urgencyFlowData', 'urgencyFlowData_backup']);
                closeDb();
                finish({
                    success: legacy.restored,
                    restored: legacy.restored,
                    source: legacy.restored ? 'localStorage' : 'none',
                    error: 'indexeddb-transaction-error'
                });
                return;
            }

            const store = tx.objectStore('appState');
            const getReq = store.get('main');

            getReq.onsuccess = () => {
                const hasIndexedDbPayload = !!(getReq.result && getReq.result.data);
                if (hasIndexedDbPayload) {
                    try {
                        restoreStateData(getReq.result.data);
                        closeDb();
                        finish({
                            success: true,
                            restored: true,
                            source: 'indexeddb'
                        });
                        return;
                    } catch (error) {
                        console.error('[storage] Failed to restore IndexedDB payload:', error);
                    }
                }

                const legacy = restoreFromLegacy(['urgencyFlowData', 'urgencyFlowData_backup']);
                closeDb();

                if (legacy.restored) {
                    finish({
                        success: true,
                        restored: true,
                        source: 'localStorage'
                    });
                    return;
                }

                finish({
                    success: !hasIndexedDbPayload,
                    restored: false,
                    empty: !hasIndexedDbPayload && !legacy.sawLegacyData,
                    source: 'none',
                    error: hasIndexedDbPayload ? 'indexeddb-restore-error' : (legacy.sawLegacyData ? 'legacy-parse-error' : null)
                });
            };

            getReq.onerror = () => {
                console.error('[storage] IndexedDB read error');
                const legacy = restoreFromLegacy(['urgencyFlowData', 'urgencyFlowData_backup']);
                closeDb();
                finish({
                    success: legacy.restored,
                    restored: legacy.restored,
                    source: legacy.restored ? 'localStorage' : 'none',
                    error: 'indexeddb-read-error'
                });
            };
        };

        request.onerror = (event) => {
            console.error('[storage] IndexedDB open error:', event);
            const legacy = restoreFromLegacy(['urgencyFlowData', 'urgencyFlowData_backup']);
            finish({
                success: legacy.restored,
                restored: legacy.restored,
                source: legacy.restored ? 'localStorage' : 'none',
                error: 'indexeddb-open-error'
            });
        };
    });
}

function restoreStateData(parsed) {
    console.log('🔄 Restoring data from storage:', {
        nodesCount: (parsed.nodes || []).length,
        archivedCount: (parsed.archivedNodes || []).length,
        inboxCount: (parsed.inbox || []).length,
        notesCount: (parsed.notes || []).length
    });
    // Extract all fields safely
    nodes = parsed.nodes || [];
    archivedNodes = parsed.archivedNodes || [];
    inbox = parsed.inbox || [];
    lifeGoals = parsed.lifeGoals || {};
    habits = parsed.habits || [];
    notes = parsed.notes || [];
    reminders = parsed.reminders || [];
    githubToken = parsed.githubToken || '';
    gistId = parsed.gistId || '';
    agenda = parsed.agenda || [];
    pinnedItems = parsed.pinnedItems || [];
    quickLinks = parsed.quickLinks || [];
    remindersModalPosition = parsed.remindersModalPosition || remindersModalPosition;
    hiddenNodeGroups = parsed.hiddenNodeGroups ? new Set(parsed.hiddenNodeGroups) : new Set();
    taskGroupFocusState = {
        active: false,
        groupIds: [],
        currentIndex: -1,
        activeGroupId: null
    };
    if (parsed.noteSettings) noteSettings = parsed.noteSettings;

    sanitizeLoadedData();
    updateDataMetrics();
    updateCalculations();
    render();
}

function sanitizeLoadedData() {
    const sanitizeTask = (n) => {
        if (!n.dependencies) n.dependencies = [];
        if (!n.subtasks) n.subtasks = [];
        if (!n.dueDate) n.dueDate = '';
        if (n.expiresOnDue === undefined) n.expiresOnDue = false;
        if (n.syncDurationDate === undefined) n.syncDurationDate = true;
        if (n.isManualUrgent === undefined) n.isManualUrgent = false;
        if (!n.goalIds) n.goalIds = [];

        // --- IMPROVED TIME TRACKING SANITIZATION ---
        // Ensure timeLogs exist and convert all values to proper Numbers
        if (n.timeLogs === undefined) n.timeLogs = [];
        n.timeLogs = n.timeLogs.map(log => ({
            start: Number(log.start),
            end: Number(log.end),
            duration: Number(log.duration)
        }));

        // Handle active timer conversion to Number
        if (n.activeTimerStart !== undefined && n.activeTimerStart !== null) {
            n.activeTimerStart = Number(n.activeTimerStart);
        } else {
            n.activeTimerStart = null;
        }

        if (n.externalLink === undefined) n.externalLink = null;
    };

    // Run task cleanup
    nodes.forEach(sanitizeTask);
    archivedNodes.forEach(sanitizeTask);

    // Sanitize Note Settings
    if (!noteSettings) {
        noteSettings = { categoryNames: Array.from({ length: 10 }, (_, i) => `Category ${i + 1}`) };
    }
    if (!noteSettings.categoryNames || !Array.isArray(noteSettings.categoryNames)) {
        noteSettings.categoryNames = Array.from({ length: 10 }, (_, i) => `Category ${i + 1}`);
    } else if (noteSettings.categoryNames.length < 10) {
        // Ensure there are at least 10 categories
        while (noteSettings.categoryNames.length < 10) {
            noteSettings.categoryNames.push(`Category ${noteSettings.categoryNames.length + 1}`);
        }
    }

    // --- QUICK LINKS CLEANUP ---
    if (!Array.isArray(quickLinks)) quickLinks = [];
    quickLinks = quickLinks
        .filter(link => link && typeof link.url === 'string' && link.url.trim().length > 0)
        .slice(0, 5)
        .map(link => ({
            id: link.id || ('ql_' + Date.now() + Math.random().toString(36).substr(2, 5)),
            label: typeof link.label === 'string' ? link.label.trim() : '',
            url: link.url.trim()
        }));

    // --- NOTES CLEANUP (Many-to-Many Linkage) ---
    if (!Array.isArray(notes)) notes = [];
    notes.forEach(note => {
        if (note.taskId !== undefined) {
            if (!note.taskIds) note.taskIds = note.taskId ? [note.taskId] : [];
            else if (note.taskId && !note.taskIds.includes(note.taskId)) {
                note.taskIds.push(note.taskId);
            }
            delete note.taskId;
        }
        if (!note.taskIds) note.taskIds = [];
    });
    // --- PRESERVE HABITS CLEANUP ---
    if (!Array.isArray(habits)) habits = [];
    habits.forEach(h => {
        if (!h.history || typeof h.history !== 'object') h.history = {};
        if (h.activeTimerStart === undefined || h.activeTimerStart === null) h.activeTimerStart = null;
        if (h.activeTimerStart !== null) {
            const timerStart = Number(h.activeTimerStart);
            h.activeTimerStart = Number.isFinite(timerStart) ? timerStart : null;
        }
        if (!Array.isArray(h.noteIds)) h.noteIds = [];

        h.type = ['checkbox', 'counter', 'timer'].includes(h.type) ? h.type : 'checkbox';
        h.frequency = ['daily', 'weekly', 'monthly'].includes(h.frequency) ? h.frequency : 'daily';

        const normalizedHistory = {};
        Object.entries(h.history).forEach(([dateKey, rawVal]) => {
            if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return;
            if (h.type === 'checkbox') {
                normalizedHistory[dateKey] = rawVal === true || Number(rawVal) > 0 ? 1 : 0;
                return;
            }
            if (rawVal === true) normalizedHistory[dateKey] = 1;
            else if (rawVal === false) normalizedHistory[dateKey] = 0;
            else normalizedHistory[dateKey] = Math.max(0, Number(rawVal) || 0);
        });
        h.history = normalizedHistory;

        if (h.type === 'timer') {
            let timerTarget = Number(h.target);
            if (!Number.isFinite(timerTarget) || timerTarget <= 0) timerTarget = 30 * 60 * 1000;
            if (timerTarget > 0 && timerTarget < 1000) timerTarget = timerTarget * 60 * 1000;
            h.target = Math.round(timerTarget);
        } else if (h.type === 'counter') {
            let countTarget = Number(h.target);
            if (!Number.isFinite(countTarget) || countTarget <= 0) countTarget = 1;
            h.target = Math.max(1, Math.round(countTarget));
        } else {
            h.target = 1;
        }
    });
    // --- REMINDERS CLEANUP ---
    if (!Array.isArray(reminders)) reminders = [];
    const isValidType = (type) => ['task', 'note', 'habit', 'inbox'].includes(type);
    const itemExists = (type, id) => {
        if (!id) return false;
        if (type === 'task') return nodes.some(n => n.id === id) || archivedNodes.some(n => n.id === id);
        if (type === 'note') return notes.some(n => n.id === id);
        if (type === 'habit') return habits.some(h => h.id === id);
        if (type === 'inbox') return inbox.some(i => i.id === id);
        return false;
    };
    const normalized = new Map();
    reminders.forEach(rem => {
        if (!rem || !isValidType(rem.itemType) || !rem.itemId) return;
        const key = `${rem.itemType}::${rem.itemId}`;
        const allDay = !!rem.allDay;
        const date = /^\d{4}-\d{2}-\d{2}$/.test(rem.date || '') ? rem.date : new Date(rem.createdAt || Date.now()).toISOString().slice(0, 10);
        const time = /^\d{2}:\d{2}$/.test(rem.time || '') ? rem.time : '06:25';
        const candidate = {
            id: rem.id || ('rem_' + Date.now() + Math.random().toString(36).substr(2, 5)),
            itemType: rem.itemType,
            itemId: rem.itemId,
            date: date,
            time: allDay ? '06:25' : time,
            allDay: allDay,
            createdAt: Number(rem.createdAt || Date.now()),
            updatedAt: Number(rem.updatedAt || Date.now()),
            firedAt: rem.firedAt ? Number(rem.firedAt) : null,
            firstFiredAt: rem.firstFiredAt ? Number(rem.firstFiredAt) : null,
            kept: !!rem.kept,
            keepUntilTs: rem.keepUntilTs ? Number(rem.keepUntilTs) : null,
            discarded: !!rem.discarded,
            lastFiredOccurrenceTs: rem.lastFiredOccurrenceTs ? Number(rem.lastFiredOccurrenceTs) : null
        };
        const prev = normalized.get(key);
        if (!prev || candidate.updatedAt >= prev.updatedAt) normalized.set(key, candidate);
    });
    reminders = Array.from(normalized.values()).filter(rem => itemExists(rem.itemType, rem.itemId));
    if (!Array.isArray(agenda)) agenda = [];
    // Remove agenda slots for deleted tasks (except inbox items)
    agenda = agenda.filter(slot => {
        // Keep inbox temp tasks
        if (slot.taskId && slot.taskId.startsWith('inbox_temp_')) {
            return true;
        }
        // Keep if task exists in nodes or archived
        const taskExists = nodes.some(n => n.id === slot.taskId) ||
            archivedNodes.some(n => n.id === slot.taskId);
        return taskExists;
    });

    // Ensure all agenda items have valid date strings
    agenda.forEach(slot => {
        if (!slot.start || !slot.end) {
            console.warn('Invalid agenda slot detected:', slot);
        }
    });

    // --- PINNED ITEMS MIGRATION ---
    if (typeof pinnedItems !== 'undefined' && pinnedItems && pinnedItems.length > 0) {
        pinnedItems.forEach(p => {
            let item;
            if (p.type === 'task') item = nodes.find(n => n.id === p.id) || archivedNodes.find(n => n.id === p.id);
            else if (p.type === 'note') item = notes.find(n => n.id === p.id);
            else if (p.type === 'habit') item = habits.find(h => h.id === p.id);
            if (item) item.isPinned = true;
        });
        pinnedItems = []; // Clear old flat array once migrated
    }
}

function updateDataMetrics() {
    const financeLocal = localStorage.getItem('finance_flow_encrypted_v1');
    let financeData = null;
    try {
        financeData = financeLocal ? JSON.parse(financeLocal) : null;
    } catch (error) {
        console.warn('[metrics] Failed to parse finance_flow_encrypted_v1:', error);
    }

    const collections = {
        'Notes': notes,
        'Tasks': { nodes, archivedNodes, inbox, agenda },
        'Habits': habits,
        'Reminders': reminders,
        'Finance': financeData,
        'Goals': lifeGoals
    };

    const targets = [
        {
            breakdown: document.getElementById('metrics-breakdown'),
            total: document.getElementById('total-gist-size')
        },
        {
            breakdown: document.getElementById('metrics-breakdown-review'),
            total: document.getElementById('total-gist-size-review')
        }
    ].filter(t => t.breakdown && t.total);
    if (targets.length === 0) return;

    targets.forEach(t => {
        t.breakdown.innerHTML = '';
    });
    let totalBytes = 0;
    const rows = [];

    for (const [name, data] of Object.entries(collections)) {
        if (!data) continue;
        const size = new Blob([JSON.stringify(data)]).size;
        totalBytes += size;

        const item = document.createElement('div');
        item.className = 'metric-item';

        // Visual progress bar (capped at 100KB for "soft limit" visualization)
        const softLimit = 100 * 1024;
        const visualPct = Math.min(100, (size / softLimit) * 100);

        item.innerHTML = `
                    <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
                        <span class="metric-label">${name}</span>
                        <span class="metric-value">${(size / 1024).toFixed(1)} KB</span>
                    </div>
                    <div style="height:3px; background:rgba(255,255,255,0.05); border-radius:2px; overflow:hidden;">
                        <div style="height:100%; width:${visualPct}%; background:${visualPct > 80 ? 'var(--blocked-color)' : 'var(--accent)'};"></div>
                    </div>
                `;
        rows.push(item.outerHTML);
    }

    const totalText = (totalBytes / 1024).toFixed(1) + ' KB';
    targets.forEach(t => {
        t.breakdown.innerHTML = rows.join('');
        t.total.innerText = totalText;
    });
}


function saveData(download = false) { const data = JSON.stringify({ nodes, archivedNodes, inbox, lifeGoals, notes, habits, agenda, quickLinks, reminders }, null, 2); if (download) { const blob = new Blob([data], { type: 'application/json' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'life-tasks-backup.json'; a.click(); } }
function loadFile(input) {
    const file = input.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (e) {
        try {
            // 1. Attempt to parse
            const parsed = JSON.parse(e.target.result);

            // 2. Data Validation logic
            if (Array.isArray(parsed)) {
                // Legacy support: if the file is just an array of nodes
                nodes = parsed;
                inbox = [];
                lifeGoals = {};
                notes = [];
                archivedNodes = [];
                habits = [];
                agenda = [];
                reminders = [];
            } else {
                // Modern support: Wrapper object
                nodes = parsed.nodes || [];
                inbox = parsed.inbox || [];
                lifeGoals = parsed.lifeGoals || {};
                habits = parsed.habits || [];
                notes = parsed.notes || [];
                archivedNodes = parsed.archivedNodes || [];
                agenda = parsed.agenda || [];
                quickLinks = parsed.quickLinks || [];
                reminders = parsed.reminders || [];
                // Do NOT load tokens from file for security, unless specifically desired
            }
            taskGroupFocusState = {
                active: false,
                groupIds: [],
                currentIndex: -1,
                activeGroupId: null
            };

            // 3. Post-load updates
            sanitizeLoadedData();
            updateCalculations();
            render();
            renderInbox();
            renderGoals();
            renderAgenda();
            renderQuickLinks();
            if (typeof renderReminderStrip === 'function') renderReminderStrip();
            if (typeof renderRemindersModal === 'function') renderRemindersModal();

            // 4. Save to local storage immediately so a refresh keeps the data
            saveToStorage();

            showNotification("File loaded successfully!");
        } catch (err) {
            console.error("Load Error details:", err);
            alert("Failed to load file.\nError: " + err.message);
        }
    };
    // Ensure the input is cleared so you can load the same file again if needed
    input.value = '';
    reader.readAsText(file);
}
async function clearData() {
    if (!confirm("Reset app to a brand-new state? This clears all saved data/tokens and restores the starter task 'Define Goal'.")) return;

    nodes = [];
    archivedNodes = [];
    inbox = [];
    lifeGoals = {};
    notes = [];
    habits = [];
    agenda = [];
    quickLinks = [];
    reminders = [];
    pinnedItems = [];
    hiddenNodeGroups = new Set();
    taskGroupFocusState = {
        active: false,
        groupIds: [],
        currentIndex: -1,
        activeGroupId: null
    };
    lastKnownAgendaTaskId = null;
    selectedNodeId = null;
    selectedIds = new Set();
    currentEditingNoteId = null;
    historyStack = [];
    historyIndex = -1;
    lastHistoryState = null;
    githubToken = '';
    gistId = '';
    geminiApiKey = '';
    selectedAIData = new Set(['tasks']);
    noteSettings = {
        categoryNames: Array.from({ length: 10 }, (_, i) => `Category ${i + 1}`)
    };
    aiModalPosition = { x: null, y: null, width: 450, height: 600 };
    inboxModalPosition = { x: null, y: null, width: 380, height: 500 };
    remindersModalPosition = { x: null, y: null, width: 560, height: 620 };
    healthDashboardPosition = { x: null, y: null };
    nodeGroupsModalPosition = { x: null, y: null, width: 420, height: 600 };

    [
        'urgencyFlowData',
        'urgencyFlowData_backup',
        'urgencyFlow_lastSave',
        'urgency_flow_gemini_key',
        'finance_flow_encrypted_v1',
        'aiModalPosition',
        'inboxModalPosition',
        'remindersModalPosition',
        'healthDashboardPosition',
        'nodeGroupsModalPosition',
        'ai_selected_data',
        'ai_note_selection',
        'lastAutoBackupDate',
        'urgencyFlow_dashboard_open_on_startup',
        'urgencyFlow_workspace_section',
        'urgencyFlow_navigator_tab',
        'urgencyFlow_planner_tab'
    ].forEach(key => localStorage.removeItem(key));

    await wipeIndexedDB();

    window.location.reload();
}


function updateBackupStatusUI() {
    const lastDate = localStorage.getItem('lastAutoBackupDate');
    const displayElement = document.getElementById('backup-timestamp');
    const settingsDisplay = document.getElementById('backup-timestamp-settings');
    const reviewDisplay = document.getElementById('review-health-backup');
    const text = lastDate || "No backup recorded yet";
    if (displayElement) displayElement.innerText = text;
    if (settingsDisplay) settingsDisplay.innerText = text;
    if (reviewDisplay) reviewDisplay.innerText = text;
}

function checkAutomatedBackup() {
    const now = new Date();
    const dateStr = now.toDateString();
    const hours = now.getHours();

    // Trigger if it's 8PM (20:00) or later AND we haven't backed up today
    if (hours >= 20 && localStorage.getItem('lastAutoBackupDate') !== dateStr) {
        saveData(true); // Trigger the download
        localStorage.setItem('lastAutoBackupDate', dateStr);
        updateBackupStatusUI();
        showNotification("Daily 8PM Offline Backup Triggered");
    }
}
