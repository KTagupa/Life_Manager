// --- STATE MANAGEMENT ---
let nodes = [];
let agenda = []; // Stores { taskId, start, end }
let archivedNodes = [];
let inbox = [];
let lifeGoals = {};
let habits = [];
let notes = [];
let reminders = [];
let projects = [];
let dataModelVersion = 2;
let aiUrgencyConfig = {
    mode: 'shadow',
    enabled: true,
    staleAfterHours: 24,
    minConfidenceForAlerts: 0.55,
    blendWeightAi: 0.30,
    semanticProvider: 'heuristic'
};

const DATA_MODEL_VERSION = 2;
const PROJECT_STATUS_VALUES = ['active', 'paused', 'completed', 'archived'];
const PROJECT_ORIGIN_VALUES = ['manual', 'ai', 'migrated'];
const AI_URGENCY_CONFIG_DEFAULTS = Object.freeze({
    mode: 'shadow',
    enabled: true,
    staleAfterHours: 24,
    minConfidenceForAlerts: 0.55,
    blendWeightAi: 0.30,
    semanticProvider: 'heuristic'
});
const AI_URGENCY_LEVEL_LABELS = {
    1: 'Lowest',
    2: 'Low',
    3: 'Medium',
    4: 'High',
    5: 'Hot'
};
const AI_URGENCY_LEVEL_TAGS = {
    1: 'LOWEST',
    2: 'LOW',
    3: 'MEDIUM',
    4: 'HIGH',
    5: 'HOT'
};

function clampToRange(value, min, max) {
    const n = Number(value);
    if (!Number.isFinite(n)) return min;
    if (n < min) return min;
    if (n > max) return max;
    return n;
}

function getDefaultAiUrgencyConfig() {
    return {
        mode: AI_URGENCY_CONFIG_DEFAULTS.mode,
        enabled: AI_URGENCY_CONFIG_DEFAULTS.enabled,
        staleAfterHours: AI_URGENCY_CONFIG_DEFAULTS.staleAfterHours,
        minConfidenceForAlerts: AI_URGENCY_CONFIG_DEFAULTS.minConfidenceForAlerts,
        blendWeightAi: AI_URGENCY_CONFIG_DEFAULTS.blendWeightAi,
        semanticProvider: AI_URGENCY_CONFIG_DEFAULTS.semanticProvider
    };
}

function normalizeAiUrgencyConfig(raw) {
    const source = raw && typeof raw === 'object' ? raw : {};
    const defaults = getDefaultAiUrgencyConfig();
    const mode = String(source.mode || defaults.mode).trim().toLowerCase();
    const semanticProvider = String(source.semanticProvider || defaults.semanticProvider).trim().toLowerCase();
    return {
        mode: ['shadow', 'system', 'ai', 'blended'].includes(mode) ? mode : defaults.mode,
        enabled: source.enabled !== undefined ? !!source.enabled : defaults.enabled,
        staleAfterHours: Math.max(1, Math.min(168, Number(source.staleAfterHours) || defaults.staleAfterHours)),
        minConfidenceForAlerts: clampToRange(source.minConfidenceForAlerts, 0, 1),
        blendWeightAi: clampToRange(source.blendWeightAi, 0, 1),
        semanticProvider: ['heuristic', 'gemini'].includes(semanticProvider) ? semanticProvider : defaults.semanticProvider
    };
}

function getUrgencyLevelFromNumericScore(score) {
    const numericScore = clampToRange(score, 0, 100);
    if (numericScore >= 86) return 5;
    if (numericScore >= 68) return 4;
    if (numericScore >= 48) return 3;
    if (numericScore >= 26) return 2;
    return 1;
}

function createDefaultAiUrgency(kind = 'task') {
    const safeKind = kind === 'project' ? 'project' : 'task';
    return {
        score: null,
        level: null,
        tag: null,
        label: null,
        confidence: null,
        reason: '',
        factors: [],
        source: 'local-heuristic',
        model: safeKind === 'project' ? 'ai-urgency-v1-project' : 'ai-urgency-v1-task',
        computedAt: null,
        previousScore: null,
        previousLevel: null,
        previousComputedAt: null,
        expiresAt: null,
        stale: true,
        semanticInputHash: null
    };
}

function normalizeAiUrgencyRecord(raw, kind = 'task') {
    const source = raw && typeof raw === 'object' ? raw : {};
    const normalized = createDefaultAiUrgency(kind);
    const score = Number(source.score);
    if (Number.isFinite(score)) normalized.score = Math.max(0, Math.min(100, Math.round(score)));
    const level = Number(source.level);
    if (Number.isFinite(level)) normalized.level = Math.max(1, Math.min(5, Math.round(level)));
    if (normalized.level === null && Number.isFinite(normalized.score)) {
        normalized.level = getUrgencyLevelFromNumericScore(normalized.score);
    }
    normalized.tag = source.tag ? String(source.tag) : (normalized.level ? AI_URGENCY_LEVEL_TAGS[normalized.level] : null);
    normalized.label = source.label ? String(source.label) : (normalized.level ? AI_URGENCY_LEVEL_LABELS[normalized.level] : null);
    if (Number.isFinite(Number(source.confidence))) {
        normalized.confidence = clampToRange(source.confidence, 0, 1);
    }
    normalized.reason = typeof source.reason === 'string' ? source.reason : '';
    normalized.factors = Array.isArray(source.factors) ? source.factors.slice(0, 20) : [];
    normalized.source = source.source ? String(source.source) : normalized.source;
    normalized.model = source.model ? String(source.model) : normalized.model;
    normalized.computedAt = Number.isFinite(Number(source.computedAt)) ? Number(source.computedAt) : null;
    if (Number.isFinite(Number(source.previousScore))) {
        normalized.previousScore = Math.max(0, Math.min(100, Math.round(Number(source.previousScore))));
    }
    if (Number.isFinite(Number(source.previousLevel))) {
        normalized.previousLevel = Math.max(1, Math.min(5, Math.round(Number(source.previousLevel))));
    } else if (Number.isFinite(Number(normalized.previousScore))) {
        normalized.previousLevel = getUrgencyLevelFromNumericScore(normalized.previousScore);
    }
    normalized.previousComputedAt = Number.isFinite(Number(source.previousComputedAt))
        ? Number(source.previousComputedAt)
        : null;
    normalized.expiresAt = Number.isFinite(Number(source.expiresAt)) ? Number(source.expiresAt) : null;
    normalized.stale = source.stale !== undefined ? !!source.stale : true;
    if (typeof source.semanticInputHash === 'string') {
        const hash = source.semanticInputHash.trim();
        normalized.semanticInputHash = hash ? hash.slice(0, 128) : null;
    }
    return normalized;
}

function touchTask(task, timestamp = Date.now()) {
    if (!task || typeof task !== 'object') return;
    if (!Number.isFinite(Number(task.createdAt))) task.createdAt = Number(timestamp) || Date.now();
    task.updatedAt = Number(timestamp) || Date.now();
    task.aiUrgency = normalizeAiUrgencyRecord(task.aiUrgency, 'task');
    task.aiUrgency.stale = true;
}

function touchProject(project, timestamp = Date.now()) {
    if (!project || typeof project !== 'object') return;
    project.updatedAt = Number(timestamp) || Date.now();
    project.aiUrgency = normalizeAiUrgencyRecord(project.aiUrgency, 'project');
    project.aiUrgency.stale = true;
}

// --- HISTORY MANAGEMENT ---
const MAX_HISTORY = 50;
let historyStack = [];
let historyIndex = -1;
let lastHistoryState = null;

function pushHistory() {
    const currentState = JSON.stringify({
        dataModelVersion,
        aiUrgencyConfig,
        projects,
        nodes,
        archivedNodes,
        inbox,
        lifeGoals,
        habits,
        notes,
        agenda,
        reminders
    });
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
    dataModelVersion = Number(state.dataModelVersion) || DATA_MODEL_VERSION;
    aiUrgencyConfig = normalizeAiUrgencyConfig(state.aiUrgencyConfig);
    projects = Array.isArray(state.projects) ? state.projects : [];
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
    const now = Date.now();

    return {
        id: 'task_' + now + Math.random().toString(36).substr(2, 5),
        title: title,
        description: '',
        x: Number.isFinite(x) ? x : 100,
        y: Number.isFinite(y) ? y : 100,
        duration: 1,
        dueDate: '',
        noDueDate: false,
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
        goalIds: [],
        projectId: null,
        createdAt: now,
        updatedAt: now,
        aiUrgency: createDefaultAiUrgency('task')
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

function normalizeProjectStatus(status) {
    const normalized = String(status || '').trim().toLowerCase();
    return PROJECT_STATUS_VALUES.includes(normalized) ? normalized : 'active';
}

function normalizeProjectOrigin(origin) {
    const normalized = String(origin || '').trim().toLowerCase();
    return PROJECT_ORIGIN_VALUES.includes(normalized) ? normalized : 'manual';
}

function createProject(name = 'New Project', options = {}) {
    const safeOptions = options && typeof options === 'object' ? options : {};
    const now = Date.now();
    const normalizedName = String(name || 'New Project').trim().slice(0, 160) || 'New Project';
    const normalizedGoalIds = Array.isArray(safeOptions.goalIds)
        ? Array.from(new Set(safeOptions.goalIds.map(id => String(id || '').trim()).filter(Boolean)))
        : [];
    const providedId = String(safeOptions.id || '').trim();
    return {
        id: providedId || ('proj_' + now + Math.random().toString(36).substr(2, 5)),
        name: normalizedName,
        description: String(safeOptions.description || '').trim().slice(0, 2000),
        status: normalizeProjectStatus(safeOptions.status),
        goalIds: normalizedGoalIds,
        color: (typeof safeOptions.color === 'string' && safeOptions.color.trim()) ? safeOptions.color.trim() : null,
        sortOrder: Number.isFinite(Number(safeOptions.sortOrder)) ? Number(safeOptions.sortOrder) : 0,
        createdAt: Number.isFinite(Number(safeOptions.createdAt)) ? Number(safeOptions.createdAt) : now,
        updatedAt: Number.isFinite(Number(safeOptions.updatedAt)) ? Number(safeOptions.updatedAt) : now,
        archivedAt: Number.isFinite(Number(safeOptions.archivedAt)) ? Number(safeOptions.archivedAt) : null,
        origin: normalizeProjectOrigin(safeOptions.origin),
        aiUrgency: normalizeAiUrgencyRecord(safeOptions.aiUrgency, 'project')
    };
}

function sanitizeProjectRecord(rawProject, index = 0) {
    const raw = rawProject && typeof rawProject === 'object' ? rawProject : {};
    const fallbackName = `Project ${index + 1}`;
    const normalizedName = String(raw.name || raw.title || fallbackName).trim().slice(0, 160) || fallbackName;
    return createProject(normalizedName, {
        id: raw.id,
        description: raw.description,
        status: raw.status,
        goalIds: raw.goalIds,
        color: raw.color,
        sortOrder: raw.sortOrder,
        createdAt: raw.createdAt,
        updatedAt: raw.updatedAt,
        archivedAt: raw.archivedAt,
        origin: raw.origin,
        aiUrgency: raw.aiUrgency
    });
}

function normalizeProjectCollection(rawProjects) {
    const source = Array.isArray(rawProjects) ? rawProjects : [];
    const seen = new Set();
    return source
        .map((project, index) => sanitizeProjectRecord(project, index))
        .filter((project) => {
            if (!project || !project.id) return false;
            if (seen.has(project.id)) return false;
            seen.add(project.id);
            return true;
        });
}

function migrateStateData(rawState) {
    const state = (rawState && typeof rawState === 'object') ? rawState : {};
    state.projects = normalizeProjectCollection(state.projects);
    state.aiUrgencyConfig = normalizeAiUrgencyConfig(state.aiUrgencyConfig);

    const normalizeTaskRecord = (task) => {
        if (!task || typeof task !== 'object') return;
        const projectId = String(task.projectId || '').trim();
        task.projectId = projectId || null;

        const fallbackCreatedAt = Number(task.completedDate) || Number(task.updatedAt) || Date.now();
        task.createdAt = Number.isFinite(Number(task.createdAt)) ? Number(task.createdAt) : fallbackCreatedAt;
        task.updatedAt = Number.isFinite(Number(task.updatedAt)) ? Number(task.updatedAt) : task.createdAt;
        task.aiUrgency = normalizeAiUrgencyRecord(task.aiUrgency, 'task');
    };

    if (Array.isArray(state.nodes)) state.nodes.forEach(normalizeTaskRecord);
    if (Array.isArray(state.archivedNodes)) state.archivedNodes.forEach(normalizeTaskRecord);

    state.dataModelVersion = DATA_MODEL_VERSION;
    return state;
}

function migrateStateDataToV1(rawState) {
    // Backward-compatible alias for older code paths.
    return migrateStateData(rawState);
}

function initDemoData() {
    dataModelVersion = DATA_MODEL_VERSION;
    projects = [];
    aiUrgencyConfig = getDefaultAiUrgencyConfig();
    const now = Date.now();
    nodes = [
        {
            id: '1', title: 'Define Goal', x: 100, y: 300, completed: true, completedDate: now, duration: 1, dueDate: '', syncDurationDate: true, isManualUrgent: false,
            noDueDate: false,
            dependencies: [], subtasks: [{ text: 'Brainstorm', done: true }],
            activeTimerStart: null, timeLogs: [], projectId: null,
            createdAt: now, updatedAt: now,
            aiUrgency: createDefaultAiUrgency('task')
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
    dataModelVersion = DATA_MODEL_VERSION;
    const data = {
        dataModelVersion: DATA_MODEL_VERSION,
        aiUrgencyConfig: normalizeAiUrgencyConfig(aiUrgencyConfig),
        projects,
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
    const migrated = migrateStateData(parsed);
    console.log('🔄 Restoring data from storage:', {
        nodesCount: (migrated.nodes || []).length,
        archivedCount: (migrated.archivedNodes || []).length,
        inboxCount: (migrated.inbox || []).length,
        notesCount: (migrated.notes || []).length,
        projectsCount: (migrated.projects || []).length
    });
    // Extract all fields safely
    dataModelVersion = Number(migrated.dataModelVersion) || DATA_MODEL_VERSION;
    aiUrgencyConfig = normalizeAiUrgencyConfig(migrated.aiUrgencyConfig);
    projects = Array.isArray(migrated.projects) ? migrated.projects : [];
    nodes = migrated.nodes || [];
    archivedNodes = migrated.archivedNodes || [];
    inbox = migrated.inbox || [];
    lifeGoals = migrated.lifeGoals || {};
    habits = migrated.habits || [];
    notes = migrated.notes || [];
    reminders = migrated.reminders || [];
    githubToken = migrated.githubToken || '';
    gistId = migrated.gistId || '';
    agenda = migrated.agenda || [];
    pinnedItems = migrated.pinnedItems || [];
    quickLinks = migrated.quickLinks || [];
    remindersModalPosition = migrated.remindersModalPosition || remindersModalPosition;
    hiddenNodeGroups = migrated.hiddenNodeGroups ? new Set(migrated.hiddenNodeGroups) : new Set();
    taskGroupFocusState = {
        active: false,
        groupIds: [],
        currentIndex: -1,
        activeGroupId: null
    };
    if (migrated.noteSettings) noteSettings = migrated.noteSettings;

    sanitizeLoadedData();
    updateDataMetrics();
    updateCalculations();
    render();
}

function sanitizeLoadedData() {
    dataModelVersion = DATA_MODEL_VERSION;
    aiUrgencyConfig = normalizeAiUrgencyConfig(aiUrgencyConfig);
    const sanitizeTask = (n) => {
        if (!n.dependencies) n.dependencies = [];
        if (!n.subtasks) n.subtasks = [];
        if (!n.dueDate) n.dueDate = '';
        if (n.noDueDate === undefined) n.noDueDate = false;
        if (n.expiresOnDue === undefined) n.expiresOnDue = false;
        if (n.noDueDate) {
            n.dueDate = '';
            n.expiresOnDue = false;
        }
        if (n.syncDurationDate === undefined) n.syncDurationDate = true;
        if (n.isManualUrgent === undefined) n.isManualUrgent = false;
        if (n.isManualNotUrgent === undefined) n.isManualNotUrgent = false;
        if (!n.goalIds) n.goalIds = [];
        const fallbackCreatedAt = Number(n.completedDate) || Number(n.updatedAt) || Date.now();
        n.createdAt = Number.isFinite(Number(n.createdAt)) ? Number(n.createdAt) : fallbackCreatedAt;
        n.updatedAt = Number.isFinite(Number(n.updatedAt)) ? Number(n.updatedAt) : n.createdAt;
        n.aiUrgency = normalizeAiUrgencyRecord(n.aiUrgency, 'task');
        const normalizedProjectId = String(n.projectId || '').trim();
        n.projectId = normalizedProjectId || null;

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

    // --- PROJECTS CLEANUP ---
    projects = normalizeProjectCollection(projects);
    projects.forEach(project => {
        if (!project || typeof project !== 'object') return;
        project.aiUrgency = normalizeAiUrgencyRecord(project.aiUrgency, 'project');
        if (!Number.isFinite(Number(project.updatedAt))) project.updatedAt = Date.now();
    });
    const validProjectIds = new Set(projects.map(project => project.id));
    const enforceTaskProjectLinks = (task) => {
        if (!task || typeof task !== 'object') return;
        const projectId = String(task.projectId || '').trim();
        task.projectId = (projectId && validProjectIds.has(projectId)) ? projectId : null;
    };
    nodes.forEach(enforceTaskProjectLinks);
    archivedNodes.forEach(enforceTaskProjectLinks);

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
        if (h.archivedAt === undefined || h.archivedAt === null) h.archivedAt = null;
        if (h.archivedAt !== null) {
            const archivedTs = Number(h.archivedAt);
            h.archivedAt = Number.isFinite(archivedTs) && archivedTs > 0 ? archivedTs : null;
        }
        if (h.activeTimerStart === undefined || h.activeTimerStart === null) h.activeTimerStart = null;
        if (h.activeTimerStart !== null) {
            const timerStart = Number(h.activeTimerStart);
            h.activeTimerStart = Number.isFinite(timerStart) ? timerStart : null;
        }
        if (h.archivedAt !== null) h.activeTimerStart = null;
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
        if (type === 'habit') return habits.some(h => h.id === id && !(Number(h.archivedAt) > 0));
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
        'Projects': projects,
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


function saveData(download = false) {
    const payload = {
        dataModelVersion: DATA_MODEL_VERSION,
        aiUrgencyConfig: normalizeAiUrgencyConfig(aiUrgencyConfig),
        projects,
        nodes,
        archivedNodes,
        inbox,
        lifeGoals,
        notes,
        habits,
        agenda,
        quickLinks,
        reminders
    };
    const data = JSON.stringify(payload, null, 2);
    if (download) {
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'life-tasks-backup.json';
        a.click();
    }
}
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
                dataModelVersion = DATA_MODEL_VERSION;
                aiUrgencyConfig = getDefaultAiUrgencyConfig();
                projects = [];
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
                dataModelVersion = Number(parsed.dataModelVersion) || DATA_MODEL_VERSION;
                aiUrgencyConfig = normalizeAiUrgencyConfig(parsed.aiUrgencyConfig);
                projects = Array.isArray(parsed.projects) ? parsed.projects : [];
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
    projects = [];
    dataModelVersion = DATA_MODEL_VERSION;
    aiUrgencyConfig = getDefaultAiUrgencyConfig();
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
        'finance_pending_tx_queue_v1',
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
    if (window.FinanceBridgeQueue && typeof window.FinanceBridgeQueue.clearAllFinancePendingTransactions === 'function') {
        try {
            await window.FinanceBridgeQueue.clearAllFinancePendingTransactions();
        } catch (error) {
            console.warn('[storage] Failed to clear finance bridge queue during reset:', error);
        }
    }

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
