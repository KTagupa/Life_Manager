let geminiApiKey = localStorage.getItem('urgency_flow_gemini_key') || "";
const GEMINI_USAGE_STORAGE_KEY = 'urgency_flow_gemini_usage_v1';
const GEMINI_MODEL_NAME = 'gemini-2.5-flash';
const GEMINI_USAGE_EVENTS_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const PACIFIC_TIMEZONE = 'America/Los_Angeles';

function createGeminiUsageBucket() {
    return {
        requests: 0,
        promptTokens: 0,
        outputTokens: 0,
        totalTokens: 0
    };
}

function createGeminiUsageStats() {
    return {
        allTime: createGeminiUsageBucket(),
        byPacificDay: {},
        recentEvents: [],
        updatedAt: null
    };
}

function normalizeGeminiUsageBucket(rawBucket) {
    const raw = rawBucket && typeof rawBucket === 'object' ? rawBucket : {};
    return {
        requests: Math.max(0, Number(raw.requests) || 0),
        promptTokens: Math.max(0, Number(raw.promptTokens) || 0),
        outputTokens: Math.max(0, Number(raw.outputTokens) || 0),
        totalTokens: Math.max(0, Number(raw.totalTokens) || 0)
    };
}

function normalizeGeminiUsageStats(rawStats) {
    const parsed = rawStats && typeof rawStats === 'object' ? rawStats : {};
    const byDaySource = (parsed.byPacificDay && typeof parsed.byPacificDay === 'object')
        ? parsed.byPacificDay
        : ((parsed.daily && typeof parsed.daily === 'object') ? parsed.daily : {});
    const normalizedByPacificDay = {};
    Object.keys(byDaySource).forEach((dayKey) => {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dayKey)) return;
        normalizedByPacificDay[dayKey] = normalizeGeminiUsageBucket(byDaySource[dayKey]);
    });

    const eventSource = Array.isArray(parsed.recentEvents)
        ? parsed.recentEvents
        : (Array.isArray(parsed.events) ? parsed.events : []);
    const normalizedEvents = eventSource
        .map((event) => {
            const rawEvent = event && typeof event === 'object' ? event : {};
            const timestamp = Number(rawEvent.timestamp ?? rawEvent.ts ?? rawEvent.time ?? 0);
            if (!Number.isFinite(timestamp) || timestamp <= 0) return null;
            return {
                timestamp,
                requests: Math.max(0, Number(rawEvent.requests) || 0),
                promptTokens: Math.max(0, Number(rawEvent.promptTokens) || 0),
                outputTokens: Math.max(0, Number(rawEvent.outputTokens) || 0),
                totalTokens: Math.max(0, Number(rawEvent.totalTokens) || 0)
            };
        })
        .filter(Boolean);

    return {
        allTime: normalizeGeminiUsageBucket(parsed.allTime),
        byPacificDay: normalizedByPacificDay,
        recentEvents: normalizedEvents,
        updatedAt: Number.isFinite(Number(parsed.updatedAt)) ? Number(parsed.updatedAt) : null
    };
}

function loadGeminiUsageStats() {
    try {
        const raw = localStorage.getItem(GEMINI_USAGE_STORAGE_KEY);
        const stats = raw ? normalizeGeminiUsageStats(JSON.parse(raw)) : createGeminiUsageStats();
        const now = Date.now();
        const cutoff = now - GEMINI_USAGE_EVENTS_RETENTION_MS;
        stats.recentEvents = (Array.isArray(stats.recentEvents) ? stats.recentEvents : [])
            .filter(event => Number(event.timestamp) >= cutoff);
        return stats;
    } catch (error) {
        console.warn('[ai] Failed to load Gemini usage stats:', error);
        return createGeminiUsageStats();
    }
}

let geminiUsageStats = loadGeminiUsageStats();

function saveGeminiUsageStats() {
    localStorage.setItem(GEMINI_USAGE_STORAGE_KEY, JSON.stringify(geminiUsageStats));
}

function pruneGeminiUsageEvents(now = Date.now()) {
    const cutoff = now - GEMINI_USAGE_EVENTS_RETENTION_MS;
    if (!Array.isArray(geminiUsageStats.recentEvents)) {
        geminiUsageStats.recentEvents = [];
        return;
    }
    geminiUsageStats.recentEvents = geminiUsageStats.recentEvents.filter((event) => {
        const timestamp = Number(event && event.timestamp);
        return Number.isFinite(timestamp) && timestamp >= cutoff;
    });
}

function normalizeGeminiUsageSnapshotForSync(rawStats) {
    const stats = normalizeGeminiUsageStats(rawStats);
    const now = Date.now();
    const cutoff = now - GEMINI_USAGE_EVENTS_RETENTION_MS;
    stats.recentEvents = (Array.isArray(stats.recentEvents) ? stats.recentEvents : [])
        .filter(event => Number(event.timestamp) >= cutoff);
    return stats;
}

function mergeGeminiUsageStats(localStats, remoteStats) {
    const localNorm = normalizeGeminiUsageSnapshotForSync(localStats);
    const remoteNorm = normalizeGeminiUsageSnapshotForSync(remoteStats);

    const mergedByPacificDay = {};
    const dayKeys = new Set([
        ...Object.keys(localNorm.byPacificDay || {}),
        ...Object.keys(remoteNorm.byPacificDay || {})
    ]);
    dayKeys.forEach((dayKey) => {
        const localBucket = normalizeGeminiUsageBucket(localNorm.byPacificDay[dayKey]);
        const remoteBucket = normalizeGeminiUsageBucket(remoteNorm.byPacificDay[dayKey]);
        mergedByPacificDay[dayKey] = {
            requests: Math.max(localBucket.requests, remoteBucket.requests),
            promptTokens: Math.max(localBucket.promptTokens, remoteBucket.promptTokens),
            outputTokens: Math.max(localBucket.outputTokens, remoteBucket.outputTokens),
            totalTokens: Math.max(localBucket.totalTokens, remoteBucket.totalTokens)
        };
    });

    const eventMap = new Map();
    [...localNorm.recentEvents, ...remoteNorm.recentEvents].forEach((event) => {
        if (!event || typeof event !== 'object') return;
        const timestamp = Number(event.timestamp);
        if (!Number.isFinite(timestamp) || timestamp <= 0) return;
        const entry = {
            timestamp: Math.round(timestamp),
            requests: Math.max(0, Number(event.requests) || 0),
            promptTokens: Math.max(0, Number(event.promptTokens) || 0),
            outputTokens: Math.max(0, Number(event.outputTokens) || 0),
            totalTokens: Math.max(0, Number(event.totalTokens) || 0)
        };
        const key = `${entry.timestamp}|${entry.totalTokens}|${entry.promptTokens}|${entry.outputTokens}`;
        eventMap.set(key, entry);
    });
    const mergedEvents = Array.from(eventMap.values())
        .sort((a, b) => a.timestamp - b.timestamp)
        .slice(-5000);

    const localAllTime = normalizeGeminiUsageBucket(localNorm.allTime);
    const remoteAllTime = normalizeGeminiUsageBucket(remoteNorm.allTime);
    const mergedAllTimeFromDays = Object.values(mergedByPacificDay).reduce((acc, bucket) => {
        acc.requests += Math.max(0, Number(bucket.requests) || 0);
        acc.promptTokens += Math.max(0, Number(bucket.promptTokens) || 0);
        acc.outputTokens += Math.max(0, Number(bucket.outputTokens) || 0);
        acc.totalTokens += Math.max(0, Number(bucket.totalTokens) || 0);
        return acc;
    }, createGeminiUsageBucket());
    const mergedAllTime = {
        requests: Math.max(localAllTime.requests, remoteAllTime.requests, mergedAllTimeFromDays.requests),
        promptTokens: Math.max(localAllTime.promptTokens, remoteAllTime.promptTokens, mergedAllTimeFromDays.promptTokens),
        outputTokens: Math.max(localAllTime.outputTokens, remoteAllTime.outputTokens, mergedAllTimeFromDays.outputTokens),
        totalTokens: Math.max(localAllTime.totalTokens, remoteAllTime.totalTokens, mergedAllTimeFromDays.totalTokens)
    };

    return {
        allTime: mergedAllTime,
        byPacificDay: mergedByPacificDay,
        recentEvents: mergedEvents,
        updatedAt: Math.max(Number(localNorm.updatedAt) || 0, Number(remoteNorm.updatedAt) || 0) || null
    };
}

function applyGeminiUsageStatsFromMergedState(rawStats) {
    geminiUsageStats = normalizeGeminiUsageSnapshotForSync(rawStats);
    saveGeminiUsageStats();
    updateGeminiUsageUI();
}

window.refreshGeminiUsageStatsFromStorage = function refreshGeminiUsageStatsFromStorage() {
    geminiUsageStats = loadGeminiUsageStats();
    updateGeminiUsageUI();
};

function getPacificDateKey(timestamp = Date.now()) {
    const date = new Date(timestamp);
    try {
        const parts = new Intl.DateTimeFormat('en-US', {
            timeZone: PACIFIC_TIMEZONE,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        }).formatToParts(date);

        const year = parts.find(part => part.type === 'year')?.value;
        const month = parts.find(part => part.type === 'month')?.value;
        const day = parts.find(part => part.type === 'day')?.value;
        if (year && month && day) return `${year}-${month}-${day}`;
    } catch (error) {
        console.warn('[ai] Failed to compute Pacific date key:', error);
    }

    const year = String(date.getFullYear());
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function addGeminiUsageToBucket(bucket, delta) {
    const target = normalizeGeminiUsageBucket(bucket);
    const safeDelta = delta && typeof delta === 'object' ? delta : {};
    target.requests += Math.max(0, Number(safeDelta.requests) || 0);
    target.promptTokens += Math.max(0, Number(safeDelta.promptTokens) || 0);
    target.outputTokens += Math.max(0, Number(safeDelta.outputTokens) || 0);
    target.totalTokens += Math.max(0, Number(safeDelta.totalTokens) || 0);
    return target;
}

function formatGeminiUsageNumber(value) {
    return (Number(value) || 0).toLocaleString();
}

function updateGeminiUsageUI() {
    const now = Date.now();
    const todayKey = getPacificDateKey(now);
    const today = normalizeGeminiUsageBucket(geminiUsageStats.byPacificDay[todayKey]);
    const allTime = normalizeGeminiUsageBucket(geminiUsageStats.allTime);
    const recentEvents = Array.isArray(geminiUsageStats.recentEvents) ? geminiUsageStats.recentEvents : [];
    const lastMinute = recentEvents
        .filter(event => Number(event.timestamp) >= (now - 60000))
        .reduce((acc, event) => {
            acc.requests += Math.max(0, Number(event.requests) || 0);
            acc.totalTokens += Math.max(0, Number(event.totalTokens) || 0);
            return acc;
        }, { requests: 0, totalTokens: 0 });

    const setText = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.innerText = value;
    };

    setText('gemini-usage-model', `Model: ${GEMINI_MODEL_NAME}`);
    setText('gemini-usage-minute-requests', formatGeminiUsageNumber(lastMinute.requests));
    setText('gemini-usage-minute-tokens', formatGeminiUsageNumber(lastMinute.totalTokens));
    setText('gemini-usage-today-requests', formatGeminiUsageNumber(today.requests));
    setText('gemini-usage-today-tokens', formatGeminiUsageNumber(today.totalTokens));
    setText('gemini-usage-all-requests', formatGeminiUsageNumber(allTime.requests));
    setText('gemini-usage-all-tokens', formatGeminiUsageNumber(allTime.totalTokens));

    const updated = document.getElementById('gemini-usage-updated');
    if (updated) {
        updated.innerText = geminiUsageStats.updatedAt
            ? `Updated: ${new Date(geminiUsageStats.updatedAt).toLocaleString()}`
            : 'Updated: —';
    }
}

function updateAiGeminiKeyStatusLabel() {
    const statusEl = document.getElementById('ai-gemini-key-status');
    if (!statusEl) return;
    statusEl.innerText = geminiApiKey
        ? 'Key status: saved in Settings Hub'
        : 'Key status: not set';
}

function trackGeminiUsage(usageMetadata = null, requestTimestamp = Date.now()) {
    const usage = usageMetadata && typeof usageMetadata === 'object' ? usageMetadata : {};
    const promptTokens = Math.max(0, Number(usage.promptTokenCount) || 0);
    const outputTokens = Math.max(0, Number(usage.candidatesTokenCount) || 0);
    const totalFromApi = Number(usage.totalTokenCount);
    const totalTokens = Math.max(0, Number.isFinite(totalFromApi) ? totalFromApi : (promptTokens + outputTokens));

    const delta = {
        requests: 1,
        promptTokens,
        outputTokens,
        totalTokens
    };

    const todayKey = getPacificDateKey(requestTimestamp);
    geminiUsageStats.allTime = addGeminiUsageToBucket(geminiUsageStats.allTime, delta);
    geminiUsageStats.byPacificDay[todayKey] = addGeminiUsageToBucket(geminiUsageStats.byPacificDay[todayKey], delta);
    if (!Array.isArray(geminiUsageStats.recentEvents)) geminiUsageStats.recentEvents = [];
    geminiUsageStats.recentEvents.push({
        timestamp: requestTimestamp,
        requests: 1,
        promptTokens,
        outputTokens,
        totalTokens
    });
    pruneGeminiUsageEvents(requestTimestamp);
    geminiUsageStats.updatedAt = Date.now();
    saveGeminiUsageStats();
    updateGeminiUsageUI();
}

function resetGeminiUsageStats() {
    geminiUsageStats = createGeminiUsageStats();
    saveGeminiUsageStats();
    updateGeminiUsageUI();
    showNotification('Gemini usage counters reset');
}

let aiUrgencySemanticRunInProgress = false;
const AI_URGENCY_SEMANTIC_LAST_REQUEST_STORAGE_KEY = 'urgency_flow_ai_semantic_last_request_ts';
const AI_URGENCY_SEMANTIC_REQUEST_COOLDOWN_MS = 65000;
const AI_URGENCY_SEMANTIC_BATCH_SIZE = 8;
let aiUrgencySemanticLastRequestTs = Math.max(0, Number(localStorage.getItem(AI_URGENCY_SEMANTIC_LAST_REQUEST_STORAGE_KEY)) || 0);
let aiUrgencySemanticCooldownTicker = null;
const aiUrgencySelectedTaskIds = new Set();
const aiUrgencySemanticQueueState = {
    inFlight: false,
    pendingTaskIds: [],
    total: 0,
    processed: 0,
    failed: 0,
    skipped: 0,
    lastError: ''
};
let aiUrgencyManualLastPacket = null;
const AI_URGENCY_MANUAL_IMPORT_MAX_CHARS = 160000;
const AI_URGENCY_MANUAL_FALLBACK_STATUS_LABELS = Object.freeze({
    APPLIED: 'Applied',
    SKIPPED_UNCHANGED: 'Skipped: unchanged',
    SKIPPED_NOT_RETURNED: 'Skipped: not returned',
    SKIPPED_INVALID_SCORE: 'Skipped: invalid score',
    SKIPPED_DUPLICATE_ID: 'Skipped: duplicate ID',
    SKIPPED_UNKNOWN_ID: 'Skipped: unknown ID',
    SKIPPED_ROW_NOT_OBJECT: 'Skipped: invalid row',
    SKIPPED_MISSING_ID: 'Skipped: missing ID',
    SKIPPED_NOT_ARRAY: 'Skipped: invalid format',
    SKIPPED_TASK_NOT_ACTIVE: 'Skipped: task not active'
});

function normalizeAiUrgencyImportStatusCode(value) {
    return String(value || '').trim().toUpperCase();
}

function getAiUrgencyImportStatusLabel(statusCode) {
    const code = normalizeAiUrgencyImportStatusCode(statusCode);
    if (typeof getManualUrgencyImportStatusLabel === 'function') {
        return getManualUrgencyImportStatusLabel(code);
    }
    return AI_URGENCY_MANUAL_FALLBACK_STATUS_LABELS[code] || '—';
}

function getAiUrgencyImportStatusTone(statusCode) {
    const code = normalizeAiUrgencyImportStatusCode(statusCode);
    if (!code || code === '—') return 'neutral';
    if (code === 'APPLIED') return 'applied';
    if (code.startsWith('SKIPPED_')) return 'skipped';
    return 'neutral';
}

function setAiUrgencyManualStatus(text) {
    const statusEl = document.getElementById('ai-urgency-manual-status');
    if (statusEl) statusEl.innerText = String(text || 'Manual import idle.');
}

async function copyTextToClipboard(text) {
    const payload = String(text || '');
    if (!payload) return false;
    try {
        if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
            await navigator.clipboard.writeText(payload);
            return true;
        }
    } catch (error) {
        // Fallback below.
    }

    try {
        const textarea = document.createElement('textarea');
        textarea.value = payload;
        textarea.setAttribute('readonly', 'readonly');
        textarea.style.position = 'fixed';
        textarea.style.left = '-9999px';
        textarea.style.top = '0';
        document.body.appendChild(textarea);
        textarea.select();
        textarea.setSelectionRange(0, payload.length);
        const success = document.execCommand('copy');
        document.body.removeChild(textarea);
        return !!success;
    } catch (error) {
        return false;
    }
}

function buildAiUrgencyManualPacketFromSelection() {
    if (typeof buildManualUrgencyPacket !== 'function') return null;
    const selectedTaskIds = getSelectedAiUrgencyTaskIds();
    const hasSelection = selectedTaskIds.length > 0;
    return buildManualUrgencyPacket({
        taskIds: hasSelection ? selectedTaskIds : null,
        maxTasks: hasSelection ? selectedTaskIds.length : 120,
        includeDescription: true
    });
}

async function copyAiUrgencyManualPacket() {
    if (aiUrgencySemanticQueueState.inFlight || aiUrgencySemanticRunInProgress) {
        showNotification('Wait for the current semantic run to finish.');
        return;
    }
    if (typeof buildManualUrgencyPacket !== 'function' || typeof buildGeminiManualUrgencyPrompt !== 'function') {
        showNotification('Manual AI packet tools are not available.');
        return;
    }

    const packet = buildAiUrgencyManualPacketFromSelection();
    const taskCount = Array.isArray(packet && packet.tasks) ? packet.tasks.length : 0;
    const goalCount = Array.isArray(packet && packet.goals) ? packet.goals.length : 0;
    if (taskCount === 0) {
        showNotification('No active tasks available for manual import packet.');
        setAiUrgencyManualStatus('Manual import blocked: no active tasks found in current selection.');
        return;
    }

    const promptText = buildGeminiManualUrgencyPrompt(packet);
    const copied = await copyTextToClipboard(promptText);
    if (!copied) {
        showNotification('Failed to copy packet to clipboard.');
        setAiUrgencyManualStatus('Manual import blocked: clipboard copy failed.');
        return;
    }

    aiUrgencyManualLastPacket = packet;
    setAiUrgencyManualStatus(`Packet copied: ${taskCount} tasks • ${goalCount} goals. Paste model JSON below, then apply import.`);
    toggleAiUrgencyManualImportBox(true);
    syncAiUrgencyQueueControlsUI();
    showNotification(`Manual AI packet copied (${taskCount} tasks, ${goalCount} goals).`);
}

function toggleAiUrgencyManualImportBox(forceOpen = null) {
    const wrap = document.getElementById('ai-urgency-manual-import-wrap');
    if (!wrap) return;
    const shouldOpen = forceOpen === true || (forceOpen === null && wrap.classList.contains('hidden'));
    wrap.classList.toggle('hidden', !shouldOpen);
    if (shouldOpen) {
        const inputEl = document.getElementById('ai-urgency-manual-import-input');
        if (inputEl && typeof inputEl.focus === 'function') inputEl.focus();
    }
    syncAiUrgencyQueueControlsUI();
}

function applyAiUrgencyManualImportFromInput() {
    if (aiUrgencySemanticQueueState.inFlight || aiUrgencySemanticRunInProgress) {
        showNotification('Wait for the current semantic run to finish.');
        return;
    }
    if (!aiUrgencyManualLastPacket || !Array.isArray(aiUrgencyManualLastPacket.tasks)) {
        showNotification('Copy AI packet first.');
        setAiUrgencyManualStatus('Manual import blocked: copy an AI packet first.');
        return;
    }
    if (typeof applyManualUrgencyImport !== 'function') {
        showNotification('Manual AI import engine is not available.');
        setAiUrgencyManualStatus('Manual import blocked: import engine unavailable.');
        return;
    }

    const inputEl = document.getElementById('ai-urgency-manual-import-input');
    const rawInput = String(inputEl && inputEl.value || '').trim();
    if (!rawInput) {
        showNotification('Paste Gemini JSON result first.');
        setAiUrgencyManualStatus('Manual import blocked: paste model output JSON first.');
        return;
    }
    if (rawInput.length > AI_URGENCY_MANUAL_IMPORT_MAX_CHARS) {
        showNotification('Pasted JSON is too large for manual import.');
        setAiUrgencyManualStatus('Manual import blocked: payload too large. Reduce task count and retry.');
        return;
    }

    const result = applyManualUrgencyImport(rawInput, aiUrgencyManualLastPacket, {
        persist: true,
        reRender: true
    }) || {};
    if (!result.ok) {
        const errorText = String(result.error || 'Manual AI import failed.');
        showNotification(errorText);
        setAiUrgencyManualStatus(`Import failed: ${errorText}`);
        syncAiUrgencyQueueControlsUI();
        return;
    }

    const applied = Math.max(0, Number(result.applied) || 0);
    const skipped = Math.max(0, Number(result.skippedCount) || 0);
    const issueCount = Array.isArray(result.issues) ? result.issues.length : 0;
    const issueSuffix = issueCount > 0 ? ` • ${issueCount} issue(s)` : '';
    setAiUrgencyManualStatus(`Import applied: ${applied} updated • ${skipped} skipped${issueSuffix}.`);
    if (isAiUrgencyScoresModalOpen()) renderAiUrgencyScoresModal();
    syncAiUrgencyQueueControlsUI();
    showNotification(`Manual import complete: ${applied} updated, ${skipped} skipped.`);
}

function getAiUrgencySemanticCooldownRemainingMs(nowTs = Date.now()) {
    const lastTs = Number(aiUrgencySemanticLastRequestTs);
    if (!Number.isFinite(lastTs) || lastTs <= 0) return 0;
    return Math.max(0, AI_URGENCY_SEMANTIC_REQUEST_COOLDOWN_MS - (nowTs - lastTs));
}

function stopAiUrgencySemanticCooldownTicker() {
    if (aiUrgencySemanticCooldownTicker === null) return;
    clearInterval(aiUrgencySemanticCooldownTicker);
    aiUrgencySemanticCooldownTicker = null;
}

function ensureAiUrgencySemanticCooldownTicker() {
    if (getAiUrgencySemanticCooldownRemainingMs() <= 0) {
        stopAiUrgencySemanticCooldownTicker();
        return;
    }
    if (aiUrgencySemanticCooldownTicker !== null) return;
    aiUrgencySemanticCooldownTicker = setInterval(() => {
        syncAiUrgencySettingsUI();
        if (getAiUrgencySemanticCooldownRemainingMs() <= 0) stopAiUrgencySemanticCooldownTicker();
    }, 1000);
}

function setAiUrgencySemanticLastRequestTs(ts = Date.now()) {
    const nextTs = Math.max(0, Number(ts) || 0);
    aiUrgencySemanticLastRequestTs = nextTs;
    localStorage.setItem(AI_URGENCY_SEMANTIC_LAST_REQUEST_STORAGE_KEY, String(nextTs));
    ensureAiUrgencySemanticCooldownTicker();
}

function getActiveAiUrgencyTaskIdSet() {
    const set = new Set();
    (Array.isArray(nodes) ? nodes : []).forEach((task) => {
        if (!task || task.completed) return;
        const taskId = String(task.id || '').trim();
        if (!taskId) return;
        set.add(taskId);
    });
    return set;
}

function pruneAiUrgencyTaskSelection() {
    const activeIds = getActiveAiUrgencyTaskIdSet();
    aiUrgencySelectedTaskIds.forEach((taskId) => {
        if (!activeIds.has(taskId)) aiUrgencySelectedTaskIds.delete(taskId);
    });
}

function getSelectedAiUrgencyTaskIds() {
    pruneAiUrgencyTaskSelection();
    return Array.from(aiUrgencySelectedTaskIds);
}

function summarizeAiUrgencySemanticError(errorText, maxLen = 120) {
    const text = String(errorText || '').replace(/\s+/g, ' ').trim();
    if (!text) return '';
    const limit = Math.max(20, Number(maxLen) || 120);
    if (text.length <= limit) return text;
    return `${text.slice(0, limit - 3)}...`;
}

function getAiUrgencySemanticQueueStatusText() {
    const selectedCount = getSelectedAiUrgencyTaskIds().length;
    const pending = aiUrgencySemanticQueueState.pendingTaskIds.length;
    const done = aiUrgencySemanticQueueState.processed
        + aiUrgencySemanticQueueState.failed
        + aiUrgencySemanticQueueState.skipped;
    if (aiUrgencySemanticQueueState.inFlight) {
        return `Sending semantic batch: ${done}/${Math.max(0, aiUrgencySemanticQueueState.total)} complete • ${pending} pending • batch ${AI_URGENCY_SEMANTIC_BATCH_SIZE} tasks/request`;
    }
    if (pending > 0 || aiUrgencySemanticQueueState.total > 0) {
        const lastIssue = summarizeAiUrgencySemanticError(aiUrgencySemanticQueueState.lastError);
        const issueLabel = lastIssue ? ` • Last issue: ${lastIssue}` : '';
        return `Manual semantic batching: ${done}/${Math.max(0, aiUrgencySemanticQueueState.total)} complete • ${pending} pending • ${aiUrgencySemanticQueueState.failed} failed • ${aiUrgencySemanticQueueState.skipped} unchanged skipped${issueLabel}`;
    }
    return `Selected tasks: ${selectedCount} • Batch size: ${AI_URGENCY_SEMANTIC_BATCH_SIZE} • Cooldown: 65s`;
}

function syncAiUrgencyQueueControlsUI() {
    const selectVisibleBtn = document.getElementById('ai-urgency-select-visible-btn');
    const clearSelectionBtn = document.getElementById('ai-urgency-clear-selection-btn');
    const queueSelectedBtn = document.getElementById('ai-urgency-queue-selected-btn');
    const stopQueueBtn = document.getElementById('ai-urgency-stop-queue-btn');
    const copyPacketBtn = document.getElementById('ai-urgency-copy-packet-btn');
    const toggleImportBtn = document.getElementById('ai-urgency-toggle-import-btn');
    const applyImportBtn = document.getElementById('ai-urgency-apply-import-btn');
    const manualInputEl = document.getElementById('ai-urgency-manual-import-input');
    const statusEl = document.getElementById('ai-urgency-queue-status');

    const selectedCount = getSelectedAiUrgencyTaskIds().length;
    const pendingCount = aiUrgencySemanticQueueState.pendingTaskIds.length;
    const queueBusy = aiUrgencySemanticQueueState.inFlight || aiUrgencySemanticRunInProgress;
    const hasGemini = !!geminiApiKey;
    const cooldownRemainingMs = getAiUrgencySemanticCooldownRemainingMs();
    const cooldownSeconds = Math.max(0, Math.ceil(cooldownRemainingMs / 1000));
    const canStartOrContinue = (pendingCount > 0 || selectedCount > 0);
    const hasManualPacket = !!(
        aiUrgencyManualLastPacket
        && Array.isArray(aiUrgencyManualLastPacket.tasks)
        && aiUrgencyManualLastPacket.tasks.length > 0
    );
    const hasManualInput = !!String(manualInputEl && manualInputEl.value || '').trim();

    if (selectVisibleBtn) selectVisibleBtn.disabled = queueBusy;
    if (clearSelectionBtn) clearSelectionBtn.disabled = queueBusy || selectedCount === 0;
    if (queueSelectedBtn) {
        if (!queueSelectedBtn.dataset.defaultLabel) {
            queueSelectedBtn.dataset.defaultLabel = `Send Batch (${AI_URGENCY_SEMANTIC_BATCH_SIZE} Tasks)`;
        }
        queueSelectedBtn.disabled = queueBusy || !hasGemini || !canStartOrContinue || cooldownRemainingMs > 0;
        if (queueBusy) queueSelectedBtn.innerText = 'Sending Batch...';
        else if (cooldownRemainingMs > 0 && canStartOrContinue) queueSelectedBtn.innerText = `Next Batch in ${cooldownSeconds}s`;
        else if (pendingCount > 0) queueSelectedBtn.innerText = `Send Next Batch (${pendingCount} left)`;
        else queueSelectedBtn.innerText = queueSelectedBtn.dataset.defaultLabel;
    }
    if (stopQueueBtn) stopQueueBtn.disabled = queueBusy || pendingCount === 0;
    if (copyPacketBtn) copyPacketBtn.disabled = queueBusy;
    if (toggleImportBtn) toggleImportBtn.disabled = queueBusy;
    if (applyImportBtn) applyImportBtn.disabled = queueBusy || !hasManualPacket || !hasManualInput;
    if (statusEl) statusEl.innerText = getAiUrgencySemanticQueueStatusText();
}

function setAiUrgencyTaskSelected(taskId, isSelected) {
    const normalizedTaskId = String(taskId || '').trim();
    if (!normalizedTaskId) return;
    if (isSelected) aiUrgencySelectedTaskIds.add(normalizedTaskId);
    else aiUrgencySelectedTaskIds.delete(normalizedTaskId);
    if (aiUrgencySemanticQueueState.pendingTaskIds.length > 0 && !isSelected) {
        aiUrgencySemanticQueueState.pendingTaskIds = aiUrgencySemanticQueueState.pendingTaskIds.filter(id => id !== normalizedTaskId);
    }
    syncAiUrgencyQueueControlsUI();
}

function selectAllVisibleAiUrgencyTasks() {
    if (aiUrgencySemanticQueueState.inFlight) return;
    const wrap = document.getElementById('ai-urgency-scores-task-wrap');
    if (!wrap) return;
    const checkboxes = wrap.querySelectorAll('input.ai-urgency-task-select-input[data-task-id]');
    checkboxes.forEach((checkbox) => {
        const taskId = String(checkbox.getAttribute('data-task-id') || '').trim();
        if (!taskId) return;
        aiUrgencySelectedTaskIds.add(taskId);
        checkbox.checked = true;
    });
    syncAiUrgencyQueueControlsUI();
}

function clearAiUrgencyTaskSelection() {
    if (aiUrgencySemanticQueueState.inFlight) return;
    aiUrgencySelectedTaskIds.clear();
    aiUrgencySemanticQueueState.pendingTaskIds = [];
    aiUrgencySemanticQueueState.total = 0;
    aiUrgencySemanticQueueState.processed = 0;
    aiUrgencySemanticQueueState.failed = 0;
    aiUrgencySemanticQueueState.skipped = 0;
    aiUrgencySemanticQueueState.lastError = '';
    const wrap = document.getElementById('ai-urgency-scores-task-wrap');
    if (wrap) {
        const checkboxes = wrap.querySelectorAll('input.ai-urgency-task-select-input[data-task-id]');
        checkboxes.forEach((checkbox) => {
            checkbox.checked = false;
        });
    }
    syncAiUrgencyQueueControlsUI();
}

function initializeAiUrgencySemanticQueue(selectedTaskIds) {
    aiUrgencySemanticQueueState.pendingTaskIds = selectedTaskIds.slice();
    aiUrgencySemanticQueueState.total = selectedTaskIds.length;
    aiUrgencySemanticQueueState.processed = 0;
    aiUrgencySemanticQueueState.failed = 0;
    aiUrgencySemanticQueueState.skipped = 0;
    aiUrgencySemanticQueueState.lastError = '';
}

async function runSelectedAiUrgencyQueue() {
    if (aiUrgencySemanticQueueState.inFlight || aiUrgencySemanticRunInProgress) {
        showNotification('Wait for the current semantic batch to finish.');
        return;
    }
    const cooldownRemainingMs = getAiUrgencySemanticCooldownRemainingMs();
    if (cooldownRemainingMs > 0) {
        showNotification(`Wait ${Math.max(1, Math.ceil(cooldownRemainingMs / 1000))}s before sending the next semantic batch.`);
        syncAiUrgencySettingsUI();
        return;
    }
    if (!geminiApiKey) {
        showNotification('Set your Gemini API key first.');
        return;
    }
    if (typeof recomputeAiUrgencyWithGemini !== 'function') {
        showNotification('Semantic AI urgency is not available.');
        return;
    }

    const activeTaskIds = getActiveAiUrgencyTaskIdSet();
    aiUrgencySemanticQueueState.pendingTaskIds = aiUrgencySemanticQueueState.pendingTaskIds
        .map(id => String(id || '').trim())
        .filter(id => id && activeTaskIds.has(id));
    if (aiUrgencySemanticQueueState.pendingTaskIds.length === 0) {
        const selectedTaskIds = getSelectedAiUrgencyTaskIds();
        if (selectedTaskIds.length === 0) {
            showNotification('Select at least one task to batch.');
            return;
        }
        initializeAiUrgencySemanticQueue(selectedTaskIds);
    }

    const batchTaskIds = aiUrgencySemanticQueueState.pendingTaskIds.slice(0, AI_URGENCY_SEMANTIC_BATCH_SIZE);
    aiUrgencySemanticQueueState.pendingTaskIds = aiUrgencySemanticQueueState.pendingTaskIds.slice(batchTaskIds.length);
    if (batchTaskIds.length === 0) {
        showNotification('No pending tasks left in batch queue.');
        syncAiUrgencyQueueControlsUI();
        return;
    }

    aiUrgencySemanticQueueState.inFlight = true;
    aiUrgencySemanticRunInProgress = true;
    syncAiUrgencySettingsUI();
    syncAiUrgencyQueueControlsUI();

    try {
        const result = await recomputeAiUrgencyWithGemini({
            taskIds: batchTaskIds,
            maxTasks: batchTaskIds.length,
            batchSize: batchTaskIds.length,
            skipUnchanged: true,
            persist: false
        });
        const requestsSent = Math.max(0, Number(result && result.batchesAttempted) || 0);
        if (requestsSent > 0) setAiUrgencySemanticLastRequestTs(Date.now());
        const tasksUpdated = Math.max(0, Number(result && result.tasksUpdated) || 0);
        const tasksFailed = Math.max(0, Number(result && result.tasksFailed) || 0);
        const tasksSkipped = Math.max(0, Number(result && result.tasksSkippedUnchanged) || 0);
        const firstBatchError = String(result && result.firstBatchError || '').trim();
        aiUrgencySemanticQueueState.processed += tasksUpdated;
        aiUrgencySemanticQueueState.failed += tasksFailed;
        aiUrgencySemanticQueueState.skipped += tasksSkipped;
        if (tasksFailed > 0) {
            if (firstBatchError) {
                aiUrgencySemanticQueueState.lastError = firstBatchError;
            } else if (tasksUpdated === 0) {
                aiUrgencySemanticQueueState.lastError = 'Gemini returned results that could not be mapped to the selected task IDs.';
            } else {
                aiUrgencySemanticQueueState.lastError = 'Some task results were missing or invalid.';
            }
        } else if (tasksUpdated > 0) {
            aiUrgencySemanticQueueState.lastError = '';
        }

        batchTaskIds.forEach(taskId => aiUrgencySelectedTaskIds.delete(taskId));
        if (typeof saveToStorage === 'function') saveToStorage();
        if (aiUrgencySemanticQueueState.pendingTaskIds.length > 0) {
            const errorHint = (tasksFailed > 0 && firstBatchError)
                ? ` Error: ${firstBatchError}`
                : '';
            showNotification(`Batch sent: ${tasksUpdated} scored, ${tasksSkipped} unchanged, ${tasksFailed} failed. ${aiUrgencySemanticQueueState.pendingTaskIds.length} pending. Click again in 65s.${errorHint}`);
        } else {
            const done = aiUrgencySemanticQueueState.processed + aiUrgencySemanticQueueState.failed + aiUrgencySemanticQueueState.skipped;
            const errorHint = (tasksFailed > 0 && firstBatchError)
                ? ` Last error: ${firstBatchError}`
                : '';
            showNotification(`Batch queue complete: ${done}/${Math.max(0, aiUrgencySemanticQueueState.total)} handled.${errorHint}`);
        }
    } catch (error) {
        console.error('[ai-urgency] Semantic batch failed:', error);
        aiUrgencySemanticQueueState.failed += batchTaskIds.length;
        aiUrgencySemanticQueueState.lastError = String(error && error.message || 'Unknown semantic batch error.');
        showNotification(`Semantic batch failed: ${error.message}`);
    } finally {
        aiUrgencySemanticQueueState.inFlight = false;
        aiUrgencySemanticRunInProgress = false;
        if (typeof render === 'function') render();
        if (typeof renderProjectsList === 'function') renderProjectsList();
        if (typeof renderInsightsDashboard === 'function') renderInsightsDashboard();
        syncAiUrgencySettingsUI();
        syncAiUrgencyQueueControlsUI();
        if (isAiUrgencyScoresModalOpen()) renderAiUrgencyScoresModal();
    }
}

function stopAiUrgencySemanticQueue(notify = true) {
    const queueWasBusy = aiUrgencySemanticQueueState.inFlight || aiUrgencySemanticQueueState.pendingTaskIds.length > 0;
    aiUrgencySemanticQueueState.pendingTaskIds = [];
    aiUrgencySemanticQueueState.total = 0;
    aiUrgencySemanticQueueState.processed = 0;
    aiUrgencySemanticQueueState.failed = 0;
    aiUrgencySemanticQueueState.skipped = 0;
    aiUrgencySemanticQueueState.lastError = '';
    syncAiUrgencySettingsUI();
    syncAiUrgencyQueueControlsUI();
    if (isAiUrgencyScoresModalOpen()) renderAiUrgencyScoresModal();
    if (notify && queueWasBusy) {
        showNotification('Semantic batch queue cleared.');
    }
}

function getSafeAiUrgencyConfigForUI() {
    const source = (typeof aiUrgencyConfig !== 'undefined' && aiUrgencyConfig && typeof aiUrgencyConfig === 'object')
        ? aiUrgencyConfig
        : {};
    if (typeof normalizeAiUrgencyConfig === 'function') return normalizeAiUrgencyConfig(source);
    return {
        mode: String(source.mode || 'shadow'),
        enabled: source.enabled !== false,
        staleAfterHours: Math.max(1, Number(source.staleAfterHours) || 24),
        minConfidenceForAlerts: Math.max(0, Math.min(1, Number(source.minConfidenceForAlerts) || 0.55)),
        blendWeightAi: Math.max(0, Math.min(1, Number(source.blendWeightAi) || 0.30)),
        semanticProvider: String(source.semanticProvider || 'heuristic')
    };
}

function syncAiUrgencySettingsUI() {
    const cfg = getSafeAiUrgencyConfigForUI();
    const modeSelect = document.getElementById('ai-urgency-mode-select');
    const blendRange = document.getElementById('ai-urgency-blend-range');
    const blendValue = document.getElementById('ai-urgency-blend-value');
    const semanticButton = document.getElementById('semantic-ai-urgency-btn');
    const statusEl = document.getElementById('ai-urgency-status');
    const cooldownRemainingMs = getAiUrgencySemanticCooldownRemainingMs();
    const cooldownSeconds = Math.max(0, Math.ceil(cooldownRemainingMs / 1000));

    if (modeSelect && modeSelect.value !== cfg.mode) modeSelect.value = cfg.mode;

    const blendPercent = Math.round((Number(cfg.blendWeightAi) || 0) * 100);
    if (blendRange && String(blendRange.value) !== String(blendPercent)) blendRange.value = String(blendPercent);
    if (blendValue) blendValue.innerText = `${blendPercent}%`;

    if (semanticButton) {
        if (!semanticButton.dataset.defaultLabel) {
            semanticButton.dataset.defaultLabel = semanticButton.innerText || 'Semantic Re-score Batch (Gemini)';
        }
        const defaultLabel = semanticButton.dataset.defaultLabel || 'Semantic Re-score Batch (Gemini)';
        const queueBusy = aiUrgencySemanticQueueState.inFlight || aiUrgencySemanticQueueState.pendingTaskIds.length > 0;
        semanticButton.disabled = aiUrgencySemanticRunInProgress || queueBusy || cooldownRemainingMs > 0;
        if (aiUrgencySemanticRunInProgress) semanticButton.innerText = `${defaultLabel} • Running...`;
        else if (queueBusy) semanticButton.innerText = `${defaultLabel} • Queue Pending`;
        else if (cooldownRemainingMs > 0) semanticButton.innerText = `${defaultLabel} • ${cooldownSeconds}s`;
        else semanticButton.innerText = defaultLabel;
    }

    if (statusEl) {
        if (aiUrgencySemanticRunInProgress) {
            statusEl.innerText = 'Running semantic AI re-score...';
        } else if (aiUrgencySemanticQueueState.inFlight || aiUrgencySemanticQueueState.pendingTaskIds.length > 0) {
            statusEl.innerText = getAiUrgencySemanticQueueStatusText();
        } else {
            const modeLabel = String(cfg.mode || 'shadow').toUpperCase();
            const semanticLabel = cfg.semanticProvider === 'gemini' ? 'Gemini semantic ready' : 'Heuristic semantic mode';
            const cooldownLabel = cooldownRemainingMs > 0 ? ` • Cooldown: ${cooldownSeconds}s` : '';
            statusEl.innerText = `Mode: ${modeLabel} • Blend: ${blendPercent}% • ${semanticLabel}${cooldownLabel}`;
        }
    }

    if (cooldownRemainingMs > 0) ensureAiUrgencySemanticCooldownTicker();
    else stopAiUrgencySemanticCooldownTicker();
    syncAiUrgencyQueueControlsUI();
}

function updateAiUrgencyBlendPreview(value) {
    const blendValue = document.getElementById('ai-urgency-blend-value');
    const pct = Math.max(0, Math.min(100, Number(value) || 0));
    if (blendValue) blendValue.innerText = `${Math.round(pct)}%`;
}

function escapeAiUrgencyScoresHtml(value) {
    const text = String(value == null ? '' : value);
    if (typeof escapeHtml === 'function') return escapeHtml(text);
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function normalizeAiUrgencyScoresView(view) {
    const normalized = String(view || '').trim().toLowerCase();
    return ['system', 'ai', 'both'].includes(normalized) ? normalized : 'both';
}

function getAiUrgencyScoresView() {
    const select = document.getElementById('ai-urgency-scores-view');
    return normalizeAiUrgencyScoresView(select && select.value);
}

function isAiUrgencyScoresModalOpen() {
    const modal = document.getElementById('ai-urgency-scores-modal');
    return !!(modal && modal.classList.contains('visible'));
}

function parseAiUrgencyScoreValue(value) {
    const score = Number(value);
    if (!Number.isFinite(score)) return null;
    return Math.max(0, Math.min(100, Math.round(score)));
}

function parseAiUrgencyTimestamp(value) {
    const ts = Number(value);
    if (!Number.isFinite(ts) || ts <= 0) return null;
    return ts;
}

function sanitizeAiMetaHistoryForTable(meta) {
    const source = meta && typeof meta === 'object' ? meta : {};
    const normalized = {
        score: parseAiUrgencyScoreValue(source.score),
        level: Number(source.level) || null,
        previousScore: parseAiUrgencyScoreValue(source.previousScore),
        previousLevel: Number(source.previousLevel) || null,
        computedAt: parseAiUrgencyTimestamp(source.computedAt),
        previousComputedAt: parseAiUrgencyTimestamp(source.previousComputedAt)
    };
    const hasCurrentTs = Number.isFinite(Number(normalized.computedAt));
    const hasPreviousTs = Number.isFinite(Number(normalized.previousComputedAt));
    if (hasCurrentTs && hasPreviousTs && Number(normalized.computedAt) === Number(normalized.previousComputedAt)) {
        normalized.previousScore = null;
        normalized.previousLevel = null;
        normalized.previousComputedAt = null;
    }
    return normalized;
}

function formatAiUrgencyDateForTable(value) {
    const ts = parseAiUrgencyTimestamp(value);
    if (!ts) return '—';
    try {
        return new Date(ts).toLocaleString(undefined, {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
    } catch (_error) {
        return '—';
    }
}

function readTaskSystemMetaForScores(task) {
    if (typeof getTaskSystemUrgencyMeta === 'function') {
        const meta = getTaskSystemUrgencyMeta(task);
        return {
            score: parseAiUrgencyScoreValue(meta && meta.score),
            level: Number(meta && meta.level) || null
        };
    }
    return {
        score: parseAiUrgencyScoreValue(task && task._urgencyScore),
        level: null
    };
}

function readTaskAiMetaForScores(task) {
    if (typeof getTaskAiUrgencyMeta === 'function') {
        const meta = getTaskAiUrgencyMeta(task);
        return sanitizeAiMetaHistoryForTable(meta);
    }
    const fallback = task && task.aiUrgency;
    return sanitizeAiMetaHistoryForTable(fallback);
}

function readProjectSystemMetaForScores(projectId) {
    if (typeof getProjectSystemUrgencyMeta === 'function') {
        const meta = getProjectSystemUrgencyMeta(projectId);
        return {
            score: parseAiUrgencyScoreValue(meta && meta.score),
            level: Number(meta && meta.level) || null
        };
    }
    return { score: 0, level: 1 };
}

function readProjectAiMetaForScores(projectId, project) {
    if (typeof getProjectAiUrgencyMeta === 'function') {
        const meta = getProjectAiUrgencyMeta(projectId);
        return sanitizeAiMetaHistoryForTable(meta);
    }
    const fallback = project && project.aiUrgency;
    return sanitizeAiMetaHistoryForTable(fallback);
}

function scoreLabelForTable(meta) {
    const score = parseAiUrgencyScoreValue(meta && meta.score);
    const level = Number(meta && meta.level);
    if (score === null) return '—';
    if (Number.isFinite(level) && level >= 1) return `${score} (L${Math.round(level)})`;
    return String(score);
}

function formatAiUrgencyDelta(delta) {
    const value = Number(delta);
    if (!Number.isFinite(value)) return '—';
    if (value > 0) return `+${value}`;
    return String(value);
}

function getSortScoreFromView(view, systemScore, aiScore) {
    const safeSystem = Number.isFinite(systemScore) ? systemScore : -1;
    const safeAi = Number.isFinite(aiScore) ? aiScore : -1;
    if (view === 'system') return safeSystem;
    if (view === 'ai') return safeAi;
    return Math.max(safeSystem, safeAi);
}

function renderAiUrgencyScoresTaskTable(view, projectNameById) {
    const wrap = document.getElementById('ai-urgency-scores-task-wrap');
    if (!wrap) return 0;

    const activeTasks = (Array.isArray(nodes) ? nodes : []).filter(task => task && !task.completed);
    if (activeTasks.length === 0) {
        wrap.innerHTML = '<div class="ai-urgency-scores-empty">No active tasks to score.</div>';
        return 0;
    }

    const rows = activeTasks.map((task) => {
        const taskId = String(task.id || '').trim();
        const systemMeta = readTaskSystemMetaForScores(task);
        const aiMeta = readTaskAiMetaForScores(task);
        const systemScore = Number(systemMeta.score);
        const aiScore = Number(aiMeta.score);
        const delta = (Number.isFinite(aiScore) ? aiScore : 0) - (Number.isFinite(systemScore) ? systemScore : 0);
        const dueRaw = String(task.dueDate || '').trim();
        const dueLabel = dueRaw || '—';
        const projectName = projectNameById[String(task.projectId || '').trim()] || '—';
        const importStatusCode = normalizeAiUrgencyImportStatusCode(task.aiUrgencyImportStatus);
        const importStatusLabel = getAiUrgencyImportStatusLabel(importStatusCode);
        const importStatusTone = getAiUrgencyImportStatusTone(importStatusCode);
        return {
            taskId,
            title: String(task.title || 'Untitled Task'),
            projectName,
            dueLabel,
            importStatusLabel,
            importStatusTone,
            systemMeta,
            aiMeta,
            delta,
            sortScore: getSortScoreFromView(view, systemMeta.score, aiMeta.score)
        };
    }).sort((a, b) => {
        if (b.sortScore !== a.sortScore) return b.sortScore - a.sortScore;
        if (a.dueLabel !== b.dueLabel) return String(a.dueLabel).localeCompare(String(b.dueLabel));
        return a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });
    });

    const headCells = [
        '<th>Select</th>',
        '<th>#</th>',
        '<th>Task</th>',
        '<th>Project</th>',
        '<th>Due</th>',
        '<th>Import</th>',
        '<th>Prev AI</th>',
        '<th>Prev Date</th>',
        '<th>New AI</th>',
        '<th>New Date</th>'
    ];
    if (view === 'system') headCells.push('<th>System</th>');
    else if (view === 'both') headCells.push('<th>System</th>', '<th>Δ</th>');

    const bodyRows = rows.map((entry, index) => {
        const isSelected = aiUrgencySelectedTaskIds.has(entry.taskId);
        const selectionCell = `
            <td class="ai-urgency-task-select-cell">
                <input
                    type="checkbox"
                    class="ai-urgency-task-select-input"
                    data-task-id="${escapeAiUrgencyScoresHtml(entry.taskId)}"
                    ${isSelected ? 'checked' : ''}
                    ${entry.taskId ? '' : 'disabled'}
                    onchange="setAiUrgencyTaskSelected(this.getAttribute('data-task-id'), this.checked)"
                >
            </td>
        `;
        const deltaClass = entry.delta >= 0 ? 'ai-urgency-delta-pos' : 'ai-urgency-delta-neg';
        const previousAiMeta = {
            score: entry.aiMeta.previousScore,
            level: entry.aiMeta.previousLevel
        };
        const newAiMeta = {
            score: entry.aiMeta.score,
            level: entry.aiMeta.level
        };
        const aiHistoryCells = `
            <td class="ai-urgency-score-cell">${escapeAiUrgencyScoresHtml(scoreLabelForTable(previousAiMeta))}</td>
            <td class="ai-urgency-date-cell">${escapeAiUrgencyScoresHtml(formatAiUrgencyDateForTable(entry.aiMeta.previousComputedAt))}</td>
            <td class="ai-urgency-score-cell">${escapeAiUrgencyScoresHtml(scoreLabelForTable(newAiMeta))}</td>
            <td class="ai-urgency-date-cell">${escapeAiUrgencyScoresHtml(formatAiUrgencyDateForTable(entry.aiMeta.computedAt))}</td>
        `;
        const scoreCells = (view === 'system')
            ? `<td class="ai-urgency-score-cell">${escapeAiUrgencyScoresHtml(scoreLabelForTable(entry.systemMeta))}</td>`
            : (view === 'both')
                ? `
                    <td class="ai-urgency-score-cell">${escapeAiUrgencyScoresHtml(scoreLabelForTable(entry.systemMeta))}</td>
                    <td class="ai-urgency-score-cell ${deltaClass}">${escapeAiUrgencyScoresHtml(formatAiUrgencyDelta(entry.delta))}</td>
                `
                : '';
        const importStatusClass = entry.importStatusTone === 'applied'
            ? 'ai-urgency-import-status-applied'
            : (entry.importStatusTone === 'skipped' ? 'ai-urgency-import-status-skipped' : '');

        return `
            <tr>
                ${selectionCell}
                <td>${index + 1}</td>
                <td class="ai-urgency-title-cell">${escapeAiUrgencyScoresHtml(entry.title)}</td>
                <td>${escapeAiUrgencyScoresHtml(entry.projectName)}</td>
                <td>${escapeAiUrgencyScoresHtml(entry.dueLabel)}</td>
                <td class="ai-urgency-import-status-cell ${importStatusClass}">${escapeAiUrgencyScoresHtml(entry.importStatusLabel)}</td>
                ${aiHistoryCells}
                ${scoreCells}
            </tr>
        `;
    }).join('');

    wrap.innerHTML = `
        <table class="ai-urgency-scores-table">
            <thead><tr>${headCells.join('')}</tr></thead>
            <tbody>${bodyRows}</tbody>
        </table>
    `;
    return rows.length;
}

function renderAiUrgencyScoresProjectTable(view, activeTaskCountByProjectId) {
    const wrap = document.getElementById('ai-urgency-scores-project-wrap');
    if (!wrap) return 0;

    const sourceProjects = (Array.isArray(projects) ? projects : []).filter(project => project && project.id);
    if (sourceProjects.length === 0) {
        wrap.innerHTML = '<div class="ai-urgency-scores-empty">No projects available.</div>';
        return 0;
    }

    const rows = sourceProjects.map((project) => {
        const projectId = String(project.id || '').trim();
        const systemMeta = readProjectSystemMetaForScores(projectId);
        const aiMeta = readProjectAiMetaForScores(projectId, project);
        const systemScore = Number(systemMeta.score);
        const aiScore = Number(aiMeta.score);
        const delta = (Number.isFinite(aiScore) ? aiScore : 0) - (Number.isFinite(systemScore) ? systemScore : 0);
        return {
            name: String(project.name || 'Untitled Project'),
            status: String(project.status || 'active'),
            openTaskCount: Math.max(0, Number(activeTaskCountByProjectId[projectId]) || 0),
            systemMeta,
            aiMeta,
            delta,
            sortScore: getSortScoreFromView(view, systemMeta.score, aiMeta.score)
        };
    }).sort((a, b) => {
        if (b.sortScore !== a.sortScore) return b.sortScore - a.sortScore;
        if (b.openTaskCount !== a.openTaskCount) return b.openTaskCount - a.openTaskCount;
        return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    });

    const headCells = [
        '<th>#</th>',
        '<th>Project</th>',
        '<th>Status</th>',
        '<th>Open Tasks</th>',
        '<th>Prev AI</th>',
        '<th>Prev Date</th>',
        '<th>New AI</th>',
        '<th>New Date</th>'
    ];
    if (view === 'system') headCells.push('<th>System</th>');
    else if (view === 'both') headCells.push('<th>System</th>', '<th>Δ</th>');

    const bodyRows = rows.map((entry, index) => {
        const deltaClass = entry.delta >= 0 ? 'ai-urgency-delta-pos' : 'ai-urgency-delta-neg';
        const previousAiMeta = {
            score: entry.aiMeta.previousScore,
            level: entry.aiMeta.previousLevel
        };
        const newAiMeta = {
            score: entry.aiMeta.score,
            level: entry.aiMeta.level
        };
        const aiHistoryCells = `
            <td class="ai-urgency-score-cell">${escapeAiUrgencyScoresHtml(scoreLabelForTable(previousAiMeta))}</td>
            <td class="ai-urgency-date-cell">${escapeAiUrgencyScoresHtml(formatAiUrgencyDateForTable(entry.aiMeta.previousComputedAt))}</td>
            <td class="ai-urgency-score-cell">${escapeAiUrgencyScoresHtml(scoreLabelForTable(newAiMeta))}</td>
            <td class="ai-urgency-date-cell">${escapeAiUrgencyScoresHtml(formatAiUrgencyDateForTable(entry.aiMeta.computedAt))}</td>
        `;
        const scoreCells = (view === 'system')
            ? `<td class="ai-urgency-score-cell">${escapeAiUrgencyScoresHtml(scoreLabelForTable(entry.systemMeta))}</td>`
            : (view === 'both')
                ? `
                    <td class="ai-urgency-score-cell">${escapeAiUrgencyScoresHtml(scoreLabelForTable(entry.systemMeta))}</td>
                    <td class="ai-urgency-score-cell ${deltaClass}">${escapeAiUrgencyScoresHtml(formatAiUrgencyDelta(entry.delta))}</td>
                `
                : '';

        return `
            <tr>
                <td>${index + 1}</td>
                <td class="ai-urgency-title-cell">${escapeAiUrgencyScoresHtml(entry.name)}</td>
                <td>${escapeAiUrgencyScoresHtml(entry.status)}</td>
                <td class="ai-urgency-score-cell">${entry.openTaskCount}</td>
                ${aiHistoryCells}
                ${scoreCells}
            </tr>
        `;
    }).join('');

    wrap.innerHTML = `
        <table class="ai-urgency-scores-table">
            <thead><tr>${headCells.join('')}</tr></thead>
            <tbody>${bodyRows}</tbody>
        </table>
    `;
    return rows.length;
}

function renderAiUrgencyScoresModal() {
    const view = getAiUrgencyScoresView();
    const meta = document.getElementById('ai-urgency-scores-meta');
    const projectNameById = {};
    const activeTaskCountByProjectId = {};
    pruneAiUrgencyTaskSelection();

    (Array.isArray(projects) ? projects : []).forEach((project) => {
        const projectId = String(project && project.id || '').trim();
        if (!projectId) return;
        projectNameById[projectId] = String(project.name || 'Untitled Project');
    });

    (Array.isArray(nodes) ? nodes : []).forEach((task) => {
        if (!task || task.completed) return;
        const projectId = String(task.projectId || '').trim();
        if (!projectId) return;
        activeTaskCountByProjectId[projectId] = (activeTaskCountByProjectId[projectId] || 0) + 1;
    });

    const taskCount = renderAiUrgencyScoresTaskTable(view, projectNameById);
    const projectCount = renderAiUrgencyScoresProjectTable(view, activeTaskCountByProjectId);
    const selectedCount = getSelectedAiUrgencyTaskIds().length;
    const pendingCount = aiUrgencySemanticQueueState.pendingTaskIds.length;

    const cfg = getSafeAiUrgencyConfigForUI();
    if (meta) {
        const queueLabel = (aiUrgencySemanticQueueState.inFlight || aiUrgencySemanticQueueState.pendingTaskIds.length > 0)
            ? ` • Queue pending: ${pendingCount}`
            : '';
        meta.innerText = `Mode: ${String(cfg.mode || 'shadow').toUpperCase()} • View: ${view.toUpperCase()} • Active tasks: ${taskCount} • Selected: ${selectedCount} • Projects: ${projectCount}${queueLabel}`;
    }
    syncAiUrgencyQueueControlsUI();
}

function openAiUrgencyScoresModal() {
    const modal = document.getElementById('ai-urgency-scores-modal');
    const backdrop = document.getElementById('ai-urgency-scores-backdrop');
    if (!modal || !backdrop) return;
    renderAiUrgencyScoresModal();
    backdrop.classList.add('visible');
    modal.classList.add('visible');
}

function closeAiUrgencyScoresModal() {
    const modal = document.getElementById('ai-urgency-scores-modal');
    const backdrop = document.getElementById('ai-urgency-scores-backdrop');
    if (!modal || !backdrop) return;
    modal.classList.remove('visible');
    backdrop.classList.remove('visible');
}

function handleAiUrgencyModeChange(mode) {
    const normalized = String(mode || '').trim().toLowerCase();
    const nextMode = ['shadow', 'system', 'ai', 'blended'].includes(normalized) ? normalized : 'shadow';

    if (typeof setAiUrgencyMode === 'function') {
        setAiUrgencyMode(nextMode, { persist: true, recompute: true, reRender: true });
    } else {
        if (typeof aiUrgencyConfig !== 'undefined' && aiUrgencyConfig && typeof aiUrgencyConfig === 'object') {
            aiUrgencyConfig.mode = nextMode;
        }
        if (typeof recomputeAiUrgency === 'function') recomputeAiUrgency({ scope: 'all', force: true });
        if (typeof saveToStorage === 'function') saveToStorage();
        if (typeof render === 'function') render();
        if (typeof renderProjectsList === 'function') renderProjectsList();
        if (typeof renderInsightsDashboard === 'function') renderInsightsDashboard();
    }

    syncAiUrgencySettingsUI();
    if (isAiUrgencyScoresModalOpen()) renderAiUrgencyScoresModal();
    showNotification(`AI urgency mode set to ${nextMode.toUpperCase()}`);
}

function applyAiUrgencyBlendFromSettings() {
    const blendRange = document.getElementById('ai-urgency-blend-range');
    const pct = Math.max(0, Math.min(100, Number(blendRange && blendRange.value) || 30));
    const value = pct / 100;

    if (typeof updateAiUrgencyConfig === 'function') {
        updateAiUrgencyConfig({ blendWeightAi: value }, { persist: true, recompute: false, reRender: true });
    } else {
        if (typeof aiUrgencyConfig !== 'undefined' && aiUrgencyConfig && typeof aiUrgencyConfig === 'object') {
            aiUrgencyConfig.blendWeightAi = value;
        }
        if (typeof saveToStorage === 'function') saveToStorage();
        if (typeof renderProjectsList === 'function') renderProjectsList();
        if (typeof renderInsightsDashboard === 'function') renderInsightsDashboard();
    }

    syncAiUrgencySettingsUI();
    if (isAiUrgencyScoresModalOpen()) renderAiUrgencyScoresModal();
    showNotification(`Blend weight updated to ${Math.round(pct)}% AI`);
}

function recomputeAiUrgencyFromSettings() {
    if (typeof recomputeAiUrgency !== 'function') {
        showNotification('AI urgency engine is not available.');
        return;
    }
    const result = recomputeAiUrgency({ scope: 'all', force: true }) || {};
    if (typeof saveToStorage === 'function') saveToStorage();
    if (typeof render === 'function') render();
    if (typeof renderProjectsList === 'function') renderProjectsList();
    if (typeof renderInsightsDashboard === 'function') renderInsightsDashboard();
    syncAiUrgencySettingsUI();
    if (isAiUrgencyScoresModalOpen()) renderAiUrgencyScoresModal();

    const taskCount = Math.max(0, Number(result.tasksUpdated) || 0);
    const projectCount = Math.max(0, Number(result.projectsUpdated) || 0);
    showNotification(`AI urgency recomputed (${taskCount} tasks, ${projectCount} projects)`);
}

async function runSemanticAiUrgencyFromSettings() {
    if (aiUrgencySemanticQueueState.inFlight || aiUrgencySemanticQueueState.pendingTaskIds.length > 0) {
        showNotification('Finish or clear the selected-task batch queue before running full semantic re-score.');
        return;
    }
    if (aiUrgencySemanticRunInProgress) {
        showNotification('Semantic AI urgency is already running.');
        return;
    }
    const cooldownRemainingMs = getAiUrgencySemanticCooldownRemainingMs();
    if (cooldownRemainingMs > 0) {
        showNotification(`Please wait ${Math.max(1, Math.ceil(cooldownRemainingMs / 1000))}s before running semantic re-score again.`);
        syncAiUrgencySettingsUI();
        return;
    }
    if (!geminiApiKey) {
        showNotification('Set your Gemini API key first.');
        return;
    }
    if (typeof recomputeAiUrgencyWithGemini !== 'function') {
        showNotification('Semantic AI urgency is not available.');
        return;
    }

    aiUrgencySemanticRunInProgress = true;
    syncAiUrgencySettingsUI();
    const statusEl = document.getElementById('ai-urgency-status');
    if (statusEl) statusEl.innerText = 'Running semantic AI re-score...';

    try {
        const result = await recomputeAiUrgencyWithGemini({
            maxTasks: AI_URGENCY_SEMANTIC_BATCH_SIZE,
            batchSize: AI_URGENCY_SEMANTIC_BATCH_SIZE,
            skipUnchanged: true,
            persist: true
        });
        const requestsSent = Math.max(0, Number(result && result.batchesAttempted) || 0);
        if (requestsSent > 0) setAiUrgencySemanticLastRequestTs(Date.now());
        if (typeof render === 'function') render();
        if (typeof renderProjectsList === 'function') renderProjectsList();
        if (typeof renderInsightsDashboard === 'function') renderInsightsDashboard();
        syncAiUrgencySettingsUI();
        if (isAiUrgencyScoresModalOpen()) renderAiUrgencyScoresModal();
        const updatedCount = Math.max(0, Number(result && result.tasksUpdated) || 0);
        const skippedCount = Math.max(0, Number(result && result.tasksSkippedUnchanged) || 0);
        const failedCount = Math.max(0, Number(result && result.tasksFailed) || 0);
        const remainingCount = Math.max(0, Number(result && result.remainingCandidates) || 0);
        const firstBatchError = String(result && result.firstBatchError || '').trim();
        const errorHint = (failedCount > 0 && firstBatchError) ? ` Error: ${firstBatchError}` : '';
        if (remainingCount > 0) {
            showNotification(`Semantic batch done: ${updatedCount} scored, ${skippedCount} unchanged, ${failedCount} failed. ${remainingCount} remaining. Click again after 65s.${errorHint}`);
        } else {
            showNotification(`Semantic batch done: ${updatedCount} scored, ${skippedCount} unchanged, ${failedCount} failed.${errorHint}`);
        }
    } catch (error) {
        console.error('[ai-urgency] Semantic re-score failed:', error);
        showNotification(`Semantic re-score failed: ${error.message}`);
    } finally {
        aiUrgencySemanticRunInProgress = false;
        syncAiUrgencySettingsUI();
    }
}

function updateSettingsHubUI() {
    const settingsGeminiInput = document.getElementById('settings-gemini-key-input');
    if (settingsGeminiInput) settingsGeminiInput.value = geminiApiKey || '';
    updateAiGeminiKeyStatusLabel();

    const ecoStatus = document.getElementById('eco-status');
    const settingsEcoStatus = document.getElementById('settings-eco-status');
    if (ecoStatus && settingsEcoStatus) settingsEcoStatus.innerText = ecoStatus.innerText;

    if (typeof updateBackupStatusUI === 'function') updateBackupStatusUI();
    if (typeof updateDataMetrics === 'function') updateDataMetrics();
    updateGeminiUsageUI();
    syncAiUrgencySettingsUI();
    syncSettingsHubSectionUI();
}

const SETTINGS_HUB_SECTION_STORAGE_KEY = 'urgencyFlow_settings_hub_section_v1';
const SETTINGS_HUB_SECTIONS = new Set(['system', 'data', 'gemini', 'urgency', 'sync']);
let currentSettingsHubSection = loadSettingsHubSection();

function normalizeSettingsHubSection(section) {
    const normalized = String(section || '').trim().toLowerCase();
    return SETTINGS_HUB_SECTIONS.has(normalized) ? normalized : 'system';
}

function loadSettingsHubSection() {
    try {
        return normalizeSettingsHubSection(localStorage.getItem(SETTINGS_HUB_SECTION_STORAGE_KEY) || 'system');
    } catch (error) {
        return 'system';
    }
}

function syncSettingsHubSectionUI() {
    const panel = document.getElementById('sync-panel');
    if (!panel) return;

    const slider = document.getElementById('settings-hub-slider');
    if (slider) {
        slider.querySelectorAll('.panel-slider-option').forEach((button) => {
            button.classList.toggle('active', button.dataset.settingsSection === currentSettingsHubSection);
        });
        if (typeof syncSegmentedSlider === 'function') syncSegmentedSlider(slider);
    }

    panel.querySelectorAll('.settings-slider-section').forEach((section) => {
        const isActive = section.dataset.settingsSection === currentSettingsHubSection;
        section.classList.toggle('active', isActive);
        if (isActive) section.removeAttribute('hidden');
        else section.setAttribute('hidden', '');
    });
}

function setSettingsHubSection(section = 'system', options = {}) {
    currentSettingsHubSection = normalizeSettingsHubSection(section);

    if (options.persist !== false) {
        try {
            localStorage.setItem(SETTINGS_HUB_SECTION_STORAGE_KEY, currentSettingsHubSection);
        } catch (error) {
            console.warn('[settings] Failed to persist settings hub section:', error);
        }
    }

    syncSettingsHubSectionUI();
}

window.setSettingsHubSection = setSettingsHubSection;

function openSettingsHubToGeminiKey() {
    setSettingsHubSection('gemini');
    if (typeof closeAIModal === 'function') closeAIModal();
    if (typeof toggleSyncPanel === 'function') toggleSyncPanel(true);
    window.setTimeout(() => {
        const input = document.getElementById('settings-gemini-key-input');
        if (input) {
            input.focus();
            if (typeof input.select === 'function') input.select();
        }
    }, 120);
}

function openInsightsDataFootprintFromSettings() {
    if (typeof toggleSyncPanel === 'function') toggleSyncPanel(false);
    if (typeof openInsightsDashboard === 'function') openInsightsDashboard();
    window.setTimeout(() => {
        const target = document.getElementById('metrics-breakdown-review');
        if (target && typeof target.scrollIntoView === 'function') {
            target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }, 120);
}

// --- GITHUB SYNC LOGIC ---
function toggleSyncPanel(forceOpen = null) {
    const panel = document.getElementById('sync-panel');
    const shouldOpen = forceOpen === true || (forceOpen === null && panel.classList.contains('hidden'));
    if (shouldOpen) {
        if (typeof closeInsightsDashboard === 'function') closeInsightsDashboard();
        if (typeof openRightDockPanel === 'function') {
            openRightDockPanel('sync-panel', () => {
                updateSettingsHubUI();
                updateConnectionStatus();
            });
        } else {
            panel.classList.remove('hidden');
            updateSettingsHubUI();
            updateConnectionStatus();
        }
    } else {
        if (typeof closeRightDockPanel === 'function') closeRightDockPanel('sync-panel');
        else panel.classList.add('hidden');
    }
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
                statusEl.style.borderColor = 'rgba(34, 197, 94, 0.72)';
            })
            .catch(() => {
                statusEl.innerText = '🟡 No API';
                statusEl.style.background = '#f59e0b';
                statusEl.style.color = '#000';
                statusEl.style.borderColor = 'rgba(245, 158, 11, 0.72)';
            });
    } else {
        statusEl.innerText = '🔴 Offline';
        statusEl.style.background = '#ef4444';
        statusEl.style.color = '#fff';
        statusEl.style.borderColor = 'rgba(239, 68, 68, 0.72)';
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
setInterval(updateGeminiUsageUI, 10000);
updateGeminiUsageUI();

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

    const hdSync = document.getElementById('hd-sync');
    if (hdSync) {
        hdSync.innerText = msg;
        hdSync.style.color = isError ? '#ef4444' : 'var(--ready-color)';
    }

    const reviewSync = document.getElementById('review-health-sync');
    if (reviewSync) {
        reviewSync.innerText = msg;
        reviewSync.style.color = isError ? '#ef4444' : '#e2e8f0';
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
            dataModelVersion: (typeof DATA_MODEL_VERSION !== 'undefined') ? DATA_MODEL_VERSION : 1,
            aiUrgencyConfig: (typeof normalizeAiUrgencyConfig === 'function')
                ? normalizeAiUrgencyConfig(aiUrgencyConfig)
                : (aiUrgencyConfig || {}),
            projects: (typeof projects !== 'undefined' && Array.isArray(projects)) ? projects : [],
            nodes: nodes || [],
            archivedNodes: archivedNodes || [],
            inbox: inbox || [],
            lifeGoals: lifeGoals || {},
            notes: notes || [],
            habits: typeof habits !== 'undefined' ? habits : [],
            agenda: agenda || [],
            reminders: reminders || [],
            noteSettings: noteSettings || { categoryNames: Array.from({ length: 10 }, (_, i) => `Category ${i + 1}`) },
            geminiUsageStats: normalizeGeminiUsageSnapshotForSync(geminiUsageStats),
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
    const pickNewerAiUrgency = (first, second, kind = 'task') => {
        const normalize = (candidate) => {
            if (typeof normalizeAiUrgencyRecord === 'function') return normalizeAiUrgencyRecord(candidate, kind);
            return candidate && typeof candidate === 'object' ? candidate : null;
        };
        const a = normalize(first);
        const b = normalize(second);
        if (!a && !b) return null;
        if (!a) return b;
        if (!b) return a;
        const aComputed = Number(a.computedAt || 0);
        const bComputed = Number(b.computedAt || 0);
        return bComputed >= aComputed ? b : a;
    };

    const mergeAiUrgencyConfig = (localCfg, remoteCfg) => {
        if (typeof normalizeAiUrgencyConfig === 'function') {
            const fallback = typeof getDefaultAiUrgencyConfig === 'function'
                ? getDefaultAiUrgencyConfig()
                : {};
            const baseLocal = normalizeAiUrgencyConfig(localCfg || fallback);
            const baseRemote = normalizeAiUrgencyConfig(remoteCfg || fallback);
            // Prefer remote mode/provider if explicitly set, preserve stronger thresholds from local.
            return normalizeAiUrgencyConfig({
                ...baseLocal,
                ...baseRemote,
                minConfidenceForAlerts: Math.max(
                    Number(baseLocal.minConfidenceForAlerts) || 0,
                    Number(baseRemote.minConfidenceForAlerts) || 0
                )
            });
        }
        return remoteCfg && typeof remoteCfg === 'object' ? remoteCfg : (localCfg || {});
    };

    const mergeTaskSelfAssessment = (first, second) => {
        const normalize = (candidate) => {
            if (typeof normalizeTaskSelfAssessment === 'function') return normalizeTaskSelfAssessment(candidate);
            return candidate && typeof candidate === 'object'
                ? {
                    confidence: Number.isFinite(Number(candidate.confidence)) ? Math.max(0, Math.min(100, Math.round(Number(candidate.confidence)))) : null,
                    estimatedMinutes: Number.isFinite(Number(candidate.estimatedMinutes)) ? Math.max(1, Math.round(Number(candidate.estimatedMinutes))) : null,
                    lastPredictedAt: Number(candidate.lastPredictedAt) || null,
                    lastUpdatedAt: Number(candidate.lastUpdatedAt) || null,
                    lastReflection: candidate.lastReflection || null,
                    reflectionHistory: Array.isArray(candidate.reflectionHistory) ? candidate.reflectionHistory : []
                }
                : null;
        };

        const a = normalize(first);
        const b = normalize(second);
        if (!a && !b) return null;
        if (!a) return b;
        if (!b) return a;

        const byCompletion = new Map();
        [...(a.reflectionHistory || []), ...(b.reflectionHistory || [])].forEach((entry) => {
            const normalizedEntry = (typeof normalizeTaskReflectionRecord === 'function')
                ? normalizeTaskReflectionRecord(entry)
                : (entry && typeof entry === 'object' ? entry : null);
            if (!normalizedEntry) return;
            const key = String(Number(normalizedEntry.completionTs || normalizedEntry.recordedAt || 0));
            if (!key || key === '0') return;
            const existing = byCompletion.get(key);
            if (!existing || (Number(normalizedEntry.recordedAt || 0) >= Number(existing.recordedAt || 0))) {
                byCompletion.set(key, normalizedEntry);
            }
        });

        const mergedHistory = Array.from(byCompletion.values())
            .sort((left, right) => Number(left.completionTs || left.recordedAt || 0) - Number(right.completionTs || right.recordedAt || 0))
            .slice(-120);

        const pickNewer = (x, y) => {
            const xTs = Number(x && (x.lastUpdatedAt || x.lastPredictedAt || 0)) || 0;
            const yTs = Number(y && (y.lastUpdatedAt || y.lastPredictedAt || 0)) || 0;
            return yTs >= xTs ? y : x;
        };
        const preferred = pickNewer(a, b);

        const merged = {
            ...preferred,
            reflectionHistory: mergedHistory,
            lastReflection: mergedHistory.length > 0 ? mergedHistory[mergedHistory.length - 1] : (preferred.lastReflection || null),
            lastUpdatedAt: Math.max(Number(a.lastUpdatedAt || 0), Number(b.lastUpdatedAt || 0)) || null,
            lastPredictedAt: Math.max(Number(a.lastPredictedAt || 0), Number(b.lastPredictedAt || 0)) || null
        };

        if (typeof normalizeTaskSelfAssessment === 'function') return normalizeTaskSelfAssessment(merged);
        return merged;
    };

    const mergeProjectCollections = (localProjects, remoteProjects) => {
        const byId = new Map();
        const all = [
            ...(Array.isArray(localProjects) ? localProjects : []),
            ...(Array.isArray(remoteProjects) ? remoteProjects : [])
        ];

        all.forEach((rawProject) => {
            if (!rawProject || typeof rawProject !== 'object') return;
            const projectId = String(rawProject.id || '').trim();
            if (!projectId) return;

            const existing = byId.get(projectId);
            if (!existing) {
                byId.set(projectId, rawProject);
                return;
            }

            const existingUpdatedAt = Number(existing.updatedAt || existing.createdAt || 0);
            const candidateUpdatedAt = Number(rawProject.updatedAt || rawProject.createdAt || 0);
            if (candidateUpdatedAt >= existingUpdatedAt) {
                const mergedProject = {
                    ...rawProject,
                    aiUrgency: pickNewerAiUrgency(existing.aiUrgency, rawProject.aiUrgency, 'project')
                };
                byId.set(projectId, mergedProject);
            } else {
                const mergedProject = {
                    ...existing,
                    aiUrgency: pickNewerAiUrgency(existing.aiUrgency, rawProject.aiUrgency, 'project')
                };
                byId.set(projectId, mergedProject);
            }
        });

        return Array.from(byId.values());
    };

    const mergeLifeGoalsCollections = (localGoals, remoteGoals) => {
        const safeLocalGoals = (localGoals && typeof localGoals === 'object') ? localGoals : {};
        const safeRemoteGoals = (remoteGoals && typeof remoteGoals === 'object') ? remoteGoals : {};

        const getGoalUpdatedTs = (goal) => Math.max(
            Number(goal && goal.updatedAt) || 0,
            Number(goal && goal.createdAt) || 0
        );

        const mergeGoalLists = (localList, remoteList) => {
            const byId = new Map();
            const withoutId = [];
            const all = [
                ...(Array.isArray(localList) ? localList : []),
                ...(Array.isArray(remoteList) ? remoteList : [])
            ];

            all.forEach((rawGoal) => {
                if (!rawGoal || typeof rawGoal !== 'object') return;
                const goalId = String(rawGoal.id || '').trim();
                if (!goalId) {
                    withoutId.push(rawGoal);
                    return;
                }

                const existing = byId.get(goalId);
                if (!existing) {
                    byId.set(goalId, rawGoal);
                    return;
                }

                const existingUpdatedAt = getGoalUpdatedTs(existing);
                const candidateUpdatedAt = getGoalUpdatedTs(rawGoal);
                const preferred = candidateUpdatedAt >= existingUpdatedAt ? rawGoal : existing;
                const other = preferred === rawGoal ? existing : rawGoal;
                const mergedChildren = mergeGoalLists(existing.children, rawGoal.children);
                const preferredText = String(preferred.text || '').trim();
                const otherText = String(other.text || '').trim();

                byId.set(goalId, {
                    ...other,
                    ...preferred,
                    text: preferredText || otherText || 'New Goal',
                    collapsed: !!(preferred.collapsed ?? other.collapsed),
                    children: mergedChildren
                });
            });

            return [
                ...Array.from(byId.values()).map((goal) => ({
                    ...goal,
                    text: String(goal.text || '').trim() || 'New Goal',
                    collapsed: !!goal.collapsed,
                    children: mergeGoalLists(goal.children, [])
                })),
                ...withoutId.map((goal) => ({
                    ...goal,
                    text: String(goal.text || '').trim() || 'New Goal',
                    collapsed: !!goal.collapsed,
                    children: mergeGoalLists(goal.children, [])
                }))
            ];
        };

        const years = new Set([
            ...Object.keys(safeLocalGoals),
            ...Object.keys(safeRemoteGoals)
        ]);
        const mergedGoals = {};

        years.forEach((yearKey) => {
            mergedGoals[yearKey] = mergeGoalLists(
                safeLocalGoals[yearKey],
                safeRemoteGoals[yearKey]
            );
        });

        return mergedGoals;
    };

    const mergeHabitHistory = (firstHistory, secondHistory, type = 'checkbox') => {
        const a = (firstHistory && typeof firstHistory === 'object') ? firstHistory : {};
        const b = (secondHistory && typeof secondHistory === 'object') ? secondHistory : {};
        const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
        const mergedHistory = {};

        const toCount = (raw) => {
            if (raw === true) return 1;
            if (raw === false || raw === null || raw === undefined) return 0;
            const parsed = Number(raw);
            return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
        };

        keys.forEach((key) => {
            const left = toCount(a[key]);
            const right = toCount(b[key]);
            if (type === 'checkbox') {
                mergedHistory[key] = (left > 0 || right > 0) ? 1 : 0;
                return;
            }
            mergedHistory[key] = Math.max(left, right);
        });

        return mergedHistory;
    };

    const mergeHabitCollections = (localHabits, remoteHabits) => {
        const byId = new Map();
        const withoutId = [];
        const all = [
            ...(Array.isArray(localHabits) ? localHabits : []),
            ...(Array.isArray(remoteHabits) ? remoteHabits : [])
        ];

        const getHabitUpdatedTs = (habit) => Math.max(
            Number(habit && habit.updated) || 0,
            Number(habit && habit.updatedAt) || 0,
            Number(habit && habit.created) || 0,
            Number(habit && habit.createdAt) || 0,
            Number(habit && habit.archivedAt) || 0
        );

        all.forEach((rawHabit) => {
            if (!rawHabit || typeof rawHabit !== 'object') return;
            const habitId = String(rawHabit.id || '').trim();
            if (!habitId) {
                withoutId.push(rawHabit);
                return;
            }

            const existing = byId.get(habitId);
            if (!existing) {
                byId.set(habitId, rawHabit);
                return;
            }

            const existingUpdatedAt = getHabitUpdatedTs(existing);
            const candidateUpdatedAt = getHabitUpdatedTs(rawHabit);
            const preferred = candidateUpdatedAt >= existingUpdatedAt ? rawHabit : existing;
            const other = preferred === rawHabit ? existing : rawHabit;
            const mergedType = preferred.type || other.type || 'checkbox';
            const mergedHistory = mergeHabitHistory(existing.history, rawHabit.history, mergedType);
            const mergedNoteIds = Array.from(new Set([
                ...(Array.isArray(existing.noteIds) ? existing.noteIds : []),
                ...(Array.isArray(rawHabit.noteIds) ? rawHabit.noteIds : [])
            ]));

            byId.set(habitId, {
                ...other,
                ...preferred,
                history: mergedHistory,
                noteIds: mergedNoteIds
            });
        });

        return [...Array.from(byId.values()), ...withoutId];
    };

    const mergeNoteSettings = (localSettings, remoteSettings) => {
        const localObj = (localSettings && typeof localSettings === 'object') ? localSettings : {};
        const remoteObj = (remoteSettings && typeof remoteSettings === 'object') ? remoteSettings : {};
        const localNames = Array.isArray(localObj.categoryNames) ? localObj.categoryNames : [];
        const remoteNames = Array.isArray(remoteObj.categoryNames) ? remoteObj.categoryNames : [];
        const maxLen = Math.max(10, localNames.length, remoteNames.length);
        const mergedNames = Array.from({ length: maxLen }, (_, index) => {
            const remoteName = (typeof remoteNames[index] === 'string') ? remoteNames[index].trim() : '';
            const localName = (typeof localNames[index] === 'string') ? localNames[index].trim() : '';
            return remoteName || localName || `Category ${index + 1}`;
        });
        return {
            ...localObj,
            ...remoteObj,
            categoryNames: mergedNames
        };
    };

    const mergeTaskTimeLogs = (firstLogs, secondLogs) => {
        const seen = new Set();
        const mergedLogs = [];

        [...(Array.isArray(firstLogs) ? firstLogs : []), ...(Array.isArray(secondLogs) ? secondLogs : [])].forEach((log) => {
            if (!log || typeof log !== 'object') return;
            const start = Number(log.start);
            if (!Number.isFinite(start) || start <= 0) return;
            const rawDuration = Number(log.duration);
            const rawEnd = Number(log.end);
            const duration = Number.isFinite(rawDuration) && rawDuration >= 0
                ? Math.round(rawDuration)
                : (Number.isFinite(rawEnd) && rawEnd >= start ? Math.round(rawEnd - start) : 0);
            const end = Number.isFinite(rawEnd) && rawEnd >= start
                ? Math.round(rawEnd)
                : Math.round(start + duration);
            const key = `${Math.round(start)}|${end}|${duration}`;
            if (seen.has(key)) return;
            seen.add(key);
            mergedLogs.push({
                ...log,
                start: Math.round(start),
                end,
                duration
            });
        });

        mergedLogs.sort((a, b) => Number(a.start || 0) - Number(b.start || 0));
        return mergedLogs;
    };

    const mergeTaskCheckIns = (firstCheckIns, secondCheckIns) => {
        const seen = new Set();
        const mergedCheckIns = [];

        [...(Array.isArray(firstCheckIns) ? firstCheckIns : []), ...(Array.isArray(secondCheckIns) ? secondCheckIns : [])].forEach((value) => {
            const ts = Number(value);
            if (!Number.isFinite(ts) || ts <= 0) return;
            const roundedTs = Math.round(ts);
            if (seen.has(roundedTs)) return;
            seen.add(roundedTs);
            mergedCheckIns.push(roundedTs);
        });

        mergedCheckIns.sort((a, b) => a - b);
        return mergedCheckIns;
    };

    const mergeArchivedTaskCollections = (localArchived, remoteArchived) => {
        const byId = new Map();
        const withoutId = [];
        const all = [
            ...(Array.isArray(localArchived) ? localArchived : []),
            ...(Array.isArray(remoteArchived) ? remoteArchived : [])
        ];

        const getTaskUpdatedTs = (task) => Math.max(
            Number(task && task.updatedAt) || 0,
            Number(task && task.completedDate) || 0,
            Number(task && task.createdAt) || 0
        );

        all.forEach((rawTask) => {
            if (!rawTask || typeof rawTask !== 'object') return;
            const taskId = String(rawTask.id || '').trim();
            if (!taskId) {
                withoutId.push(rawTask);
                return;
            }

            const existing = byId.get(taskId);
            if (!existing) {
                byId.set(taskId, rawTask);
                return;
            }

            const existingUpdatedAt = getTaskUpdatedTs(existing);
            const candidateUpdatedAt = getTaskUpdatedTs(rawTask);
            const existingCompleted = !!existing.completed;
            const candidateCompleted = !!rawTask.completed;
            const preferred = candidateCompleted !== existingCompleted
                ? (candidateCompleted ? rawTask : existing)
                : (candidateUpdatedAt >= existingUpdatedAt ? rawTask : existing);
            const other = preferred === rawTask ? existing : rawTask;
            const mergedCompletedDate = Math.max(Number(existing.completedDate) || 0, Number(rawTask.completedDate) || 0) || null;

            byId.set(taskId, {
                ...other,
                ...preferred,
                completed: !!(preferred.completed || other.completed),
                completedDate: mergedCompletedDate || preferred.completedDate || other.completedDate || null,
                activeTimerStart: null,
                timeLogs: mergeTaskTimeLogs(existing.timeLogs, rawTask.timeLogs),
                checkIns: mergeTaskCheckIns(existing.checkIns, rawTask.checkIns),
                aiUrgency: pickNewerAiUrgency(existing.aiUrgency, rawTask.aiUrgency, 'task'),
                selfAssessment: mergeTaskSelfAssessment(existing.selfAssessment, rawTask.selfAssessment)
            });
        });

        return [...Array.from(byId.values()), ...withoutId];
    };

    const mergeInboxCollections = (localInbox, remoteInbox) => {
        const byId = new Map();
        const seenTitleNoId = new Set();
        const all = [
            ...(Array.isArray(localInbox) ? localInbox : []),
            ...(Array.isArray(remoteInbox) ? remoteInbox : [])
        ];

        all.forEach((rawItem, index) => {
            const rawObj = (rawItem && typeof rawItem === 'object') ? rawItem : {};
            const title = String(
                typeof rawItem === 'string'
                    ? rawItem
                    : (rawObj.title || '')
            ).trim();
            if (!title) return;

            const explicitId = String(rawObj.id || '').trim();
            if (!explicitId) {
                const titleKey = title.toLowerCase();
                if (seenTitleNoId.has(titleKey)) return;
                seenTitleNoId.add(titleKey);
            }
            const fallbackSlug = title
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, '_')
                .replace(/^_+|_+$/g, '')
                .slice(0, 40) || `item_${index}`;
            const id = explicitId || `inbox_legacy_${fallbackSlug}`;

            const existing = byId.get(id);
            if (!existing) {
                byId.set(id, {
                    ...rawObj,
                    id,
                    title
                });
                return;
            }

            const preferredTitle = title.length >= String(existing.title || '').trim().length
                ? title
                : String(existing.title || '').trim();
            byId.set(id, {
                ...existing,
                ...rawObj,
                id,
                title: preferredTitle || title || String(existing.title || '').trim()
            });
        });

        return Array.from(byId.values());
    };

    const mergeAgendaCollections = (localAgenda, remoteAgenda) => {
        const seen = new Set();
        const mergedSlots = [];
        const all = [
            ...(Array.isArray(localAgenda) ? localAgenda : []),
            ...(Array.isArray(remoteAgenda) ? remoteAgenda : [])
        ];

        all.forEach((rawSlot, index) => {
            if (!rawSlot || typeof rawSlot !== 'object') return;
            const startMs = new Date(rawSlot.start).getTime();
            const endMs = new Date(rawSlot.end).getTime();
            if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return;

            const title = (typeof rawSlot.title === 'string') ? rawSlot.title.trim() : '';
            const fallbackPrefix = /\bbreak\b/i.test(title) ? 'break_sync_' : 'sync_slot_';
            const taskId = String(rawSlot.taskId || '').trim() || `${fallbackPrefix}${startMs}_${index}`;
            const normalized = {
                ...rawSlot,
                taskId,
                start: new Date(startMs).toISOString(),
                end: new Date(endMs).toISOString()
            };
            if (title) normalized.title = title;
            else if ('title' in normalized) delete normalized.title;

            const key = `${normalized.taskId}|${normalized.start}|${normalized.end}|${normalized.title || ''}`;
            if (seen.has(key)) return;
            seen.add(key);
            mergedSlots.push(normalized);
        });

        mergedSlots.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
        return mergedSlots;
    };

    const merged = {
        dataModelVersion: Math.max(
            Number(local && local.dataModelVersion) || 1,
            Number(remote && remote.dataModelVersion) || 1,
            1
        ),
        aiUrgencyConfig: mergeAiUrgencyConfig(local && local.aiUrgencyConfig, remote && remote.aiUrgencyConfig),
        projects: mergeProjectCollections(local && local.projects, remote && remote.projects),
        nodes: [],
        archivedNodes: mergeArchivedTaskCollections(local && local.archivedNodes, remote && remote.archivedNodes),
        inbox: mergeInboxCollections(local && local.inbox, remote && remote.inbox),
        lifeGoals: mergeLifeGoalsCollections(local && local.lifeGoals, remote && remote.lifeGoals),
        habits: mergeHabitCollections(local && local.habits, remote && remote.habits),
        notes: [],
        agenda: mergeAgendaCollections(local && local.agenda, remote && remote.agenda),
        reminders: [],
        noteSettings: mergeNoteSettings(local && local.noteSettings, remote && remote.noteSettings),
        geminiUsageStats: mergeGeminiUsageStats(local && local.geminiUsageStats, remote && remote.geminiUsageStats)
    };

    const getTaskUpdatedTs = (task) => Math.max(
        Number(task && task.updatedAt) || 0,
        Number(task && task.completedDate) || 0,
        Number(task && task.createdAt) || 0
    );

    // Merge tasks: prefer completion, then latest update timestamp; merge logs/check-ins deterministically.
    const allTaskIds = new Set([
        ...(local.nodes || []).map(n => n.id),
        ...(remote.nodes || []).map(n => n.id)
    ]);

    allTaskIds.forEach(id => {
        const localTask = (local.nodes || []).find(n => n.id === id);
        const remoteTask = (remote.nodes || []).find(n => n.id === id);

        if (!localTask) {
            const nextTask = {
                ...remoteTask,
                timeLogs: mergeTaskTimeLogs(null, remoteTask && remoteTask.timeLogs),
                checkIns: mergeTaskCheckIns(null, remoteTask && remoteTask.checkIns),
                aiUrgency: pickNewerAiUrgency(null, remoteTask && remoteTask.aiUrgency, 'task'),
                selfAssessment: mergeTaskSelfAssessment(null, remoteTask && remoteTask.selfAssessment)
            };
            merged.nodes.push(nextTask);
        } else if (!remoteTask) {
            const nextTask = {
                ...localTask,
                timeLogs: mergeTaskTimeLogs(localTask && localTask.timeLogs, null),
                checkIns: mergeTaskCheckIns(localTask && localTask.checkIns, null),
                aiUrgency: pickNewerAiUrgency(localTask && localTask.aiUrgency, null, 'task'),
                selfAssessment: mergeTaskSelfAssessment(localTask && localTask.selfAssessment, null)
            };
            merged.nodes.push(nextTask);
        } else {
            const localCompleted = !!localTask.completed;
            const remoteCompleted = !!remoteTask.completed;
            const localUpdatedAt = getTaskUpdatedTs(localTask);
            const remoteUpdatedAt = getTaskUpdatedTs(remoteTask);
            const localLogCount = (localTask.timeLogs || []).length;
            const remoteLogCount = (remoteTask.timeLogs || []).length;
            const localCheckInCount = (localTask.checkIns || []).length;
            const remoteCheckInCount = (remoteTask.checkIns || []).length;

            let preferred = remoteTask;
            if (localCompleted !== remoteCompleted) {
                preferred = localCompleted ? localTask : remoteTask;
            } else if (localUpdatedAt !== remoteUpdatedAt) {
                preferred = localUpdatedAt > remoteUpdatedAt ? localTask : remoteTask;
            } else if (localLogCount !== remoteLogCount) {
                preferred = localLogCount > remoteLogCount ? localTask : remoteTask;
            } else if (localCheckInCount !== remoteCheckInCount) {
                preferred = localCheckInCount > remoteCheckInCount ? localTask : remoteTask;
            }
            const other = preferred === localTask ? remoteTask : localTask;
            const hasCompletion = localCompleted || remoteCompleted;
            const mergedCompletedDate = hasCompletion
                ? (Math.max(Number(localTask.completedDate) || 0, Number(remoteTask.completedDate) || 0) || Number(preferred.completedDate || other.completedDate) || null)
                : null;

            const mergedTask = {
                ...other,
                ...preferred,
                completed: hasCompletion,
                completedDate: mergedCompletedDate,
                timeLogs: mergeTaskTimeLogs(localTask.timeLogs, remoteTask.timeLogs),
                checkIns: mergeTaskCheckIns(localTask.checkIns, remoteTask.checkIns),
                aiUrgency: pickNewerAiUrgency(localTask.aiUrgency, remoteTask.aiUrgency, 'task'),
                selfAssessment: mergeTaskSelfAssessment(localTask.selfAssessment, remoteTask.selfAssessment)
            };
            if (mergedTask.completed) mergedTask.activeTimerStart = null;

            merged.nodes.push(mergedTask);
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

    // Merge reminders: one reminder per item key, keep most recently updated
    const reminderByKey = new Map();
    [...(local.reminders || []), ...(remote.reminders || [])].forEach(rem => {
        if (!rem || !rem.itemType || !rem.itemId) return;
        const key = `${rem.itemType}::${rem.itemId}`;
        const prev = reminderByKey.get(key);
        if (!prev || (Number(rem.updatedAt || 0) >= Number(prev.updatedAt || 0))) {
            reminderByKey.set(key, rem);
        }
    });
    merged.reminders = Array.from(reminderByKey.values());

    // Remove orphaned project links after merge.
    const validProjectIds = new Set((merged.projects || []).map(project => project && project.id).filter(Boolean));
    const normalizeTaskProject = (task) => {
        if (!task || typeof task !== 'object') return;
        const projectId = String(task.projectId || '').trim();
        task.projectId = (projectId && validProjectIds.has(projectId)) ? projectId : null;
    };
    merged.nodes.forEach(normalizeTaskProject);
    merged.archivedNodes.forEach(normalizeTaskProject);

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
            dataModelVersion: (typeof dataModelVersion !== 'undefined') ? dataModelVersion : 1,
            aiUrgencyConfig: (typeof normalizeAiUrgencyConfig === 'function')
                ? normalizeAiUrgencyConfig(aiUrgencyConfig)
                : (aiUrgencyConfig || {}),
            projects,
            nodes, archivedNodes, inbox, lifeGoals, habits, notes, agenda, reminders, noteSettings,
            geminiUsageStats: normalizeGeminiUsageSnapshotForSync(geminiUsageStats)
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
        dataModelVersion = Number(mergedState.dataModelVersion) || ((typeof DATA_MODEL_VERSION !== 'undefined') ? DATA_MODEL_VERSION : 1);
        aiUrgencyConfig = (typeof normalizeAiUrgencyConfig === 'function')
            ? normalizeAiUrgencyConfig(mergedState.aiUrgencyConfig)
            : (mergedState.aiUrgencyConfig || aiUrgencyConfig);
        projects = Array.isArray(mergedState.projects) ? mergedState.projects : [];
        nodes = mergedState.nodes || [];
        archivedNodes = mergedState.archivedNodes || [];
        inbox = mergedState.inbox || [];
        lifeGoals = mergedState.lifeGoals || {};
        notes = mergedState.notes || [];
        habits = mergedState.habits || [];
        agenda = mergedState.agenda || [];
        reminders = mergedState.reminders || [];
        if (mergedState.noteSettings && typeof mergedState.noteSettings === 'object') {
            noteSettings = mergedState.noteSettings;
        }
        if (mergedState.geminiUsageStats && typeof mergedState.geminiUsageStats === 'object') {
            applyGeminiUsageStatsFromMergedState(mergedState.geminiUsageStats);
        }

        // Save merge timestamp
        localStorage.setItem('urgencyFlow_lastSave', Date.now());

        // 5. Cleanup & UI Refresh
        sanitizeLoadedData(); // Fixes missing properties in old data

        saveToStorage();      // Sync localstorage with pulled data
        updateCalculations(); // Recalculate critical path/urgency
        render();             // Redraw the graph
        renderInbox();        // Update fab inbox list
        renderGoals();        // Update goals panel
        if (typeof renderReminderStrip === 'function') renderReminderStrip();
        if (typeof renderRemindersModal === 'function') renderRemindersModal();

        setSyncStatus('Pull Complete!');
        showNotification('GitHub Sync Successful!');

    } catch (e) {
        console.error("Pull Error:", e);
        setSyncStatus('Pull Failed: ' + e.message, true);
        alert("Sync Error: " + e.message);
    }
}

function syncAIHeaderButtonState() {
    const presetsPane = document.getElementById('ai-presets-pane');
    const settingsPane = document.getElementById('ai-settings-pane');
    const presetsBtn = document.getElementById('ai-presets-toggle-btn');
    const settingsBtn = document.getElementById('ai-settings-toggle-btn');

    const presetsOpen = !!(presetsPane && presetsPane.classList.contains('visible'));
    const settingsOpen = !!(settingsPane && settingsPane.classList.contains('visible'));

    if (presetsBtn) {
        presetsBtn.classList.toggle('active', presetsOpen);
        presetsBtn.setAttribute('aria-expanded', presetsOpen ? 'true' : 'false');
    }
    if (settingsBtn) {
        settingsBtn.classList.toggle('active', settingsOpen);
        settingsBtn.setAttribute('aria-expanded', settingsOpen ? 'true' : 'false');
    }
}

function setAIPresetsVisibility(visible) {
    const pane = document.getElementById('ai-presets-pane');
    if (!pane) return;
    pane.classList.toggle('visible', !!visible);
    syncAIHeaderButtonState();
}

function setAISettingsVisibility(visible) {
    const pane = document.getElementById('ai-settings-pane');
    if (!pane) return;
    pane.classList.toggle('visible', !!visible);
    if (visible) {
        updateGeminiUsageUI();
        updateAiGeminiKeyStatusLabel();
    }
    syncAIHeaderButtonState();
}

function openAIModal() {
    const modal = document.getElementById('ai-modal');
    const backdrop = document.getElementById('ai-modal-backdrop');
    if (!modal || !backdrop) return;

    const viewportPadding = 12;
    const minWidth = 320;
    const minHeight = 380;
    const maxWidth = Math.max(minWidth, window.innerWidth - viewportPadding * 2);
    const maxHeight = Math.max(minHeight, window.innerHeight - viewportPadding * 2);

    const savedWidth = Number(aiModalPosition.width) || 450;
    const savedHeight = Number(aiModalPosition.height) || 600;
    const width = Math.min(Math.max(savedWidth, minWidth), maxWidth);
    const height = Math.min(Math.max(savedHeight, minHeight), maxHeight);

    let x;
    let y;
    if (aiModalPosition.x === null || aiModalPosition.y === null) {
        x = Math.round((window.innerWidth - width) / 2);
        y = Math.round((window.innerHeight - height) / 2);
    } else {
        const maxX = window.innerWidth - width - viewportPadding;
        const maxY = window.innerHeight - height - viewportPadding;
        x = Math.min(Math.max(Number(aiModalPosition.x), viewportPadding), maxX);
        y = Math.min(Math.max(Number(aiModalPosition.y), viewportPadding), maxY);
    }

    modal.style.width = `${width}px`;
    modal.style.height = `${height}px`;
    modal.style.left = `${x}px`;
    modal.style.top = `${y}px`;
    modal.style.transform = 'none';

    modal.classList.add('visible');
    backdrop.classList.add('visible');
    syncAIHeaderButtonState();
    setTimeout(() => {
        const input = document.getElementById('ai-input');
        if (input && !input.disabled) input.focus();
    }, 80);
}

function quickPrompt(text, requiredData = null, requestConfig = null) {
    openAIModal();
    if (Array.isArray(requiredData) && requiredData.length > 0) {
        setAIDataSelection(requiredData);
    }
    const input = document.getElementById('ai-input');
    if (!input) {
        pendingAIRequestConfig = null;
        return;
    }
    input.value = text;
    pendingAIRequestConfig = (requestConfig && typeof requestConfig === 'object')
        ? requestConfig
        : null;
    askAI();
}

function getAIProjectPlannerDepthConfig(depth) {
    const normalized = String(depth || 'balanced').trim().toLowerCase();
    if (normalized === 'lean') return { depth: 'lean', minTasks: 6, maxTasks: 10, label: 'Lean' };
    if (normalized === 'deep') return { depth: 'deep', minTasks: 14, maxTasks: 24, label: 'Comprehensive' };
    return { depth: 'balanced', minTasks: 10, maxTasks: 16, label: 'Balanced' };
}

function populateAIGoalSelect(selectEl, options = {}) {
    if (!selectEl) return;

    const safeOptions = options && typeof options === 'object' ? options : {};
    const emptyLabel = String(safeOptions.emptyLabel || 'No linked goal').trim() || 'No linked goal';
    const previousValue = safeOptions.preserveSelection === false ? '' : String(selectEl.value || '').trim();
    const preferredValue = String(safeOptions.preferredValue || '').trim();

    selectEl.innerHTML = '';
    const emptyOption = document.createElement('option');
    emptyOption.value = '';
    emptyOption.textContent = emptyLabel;
    selectEl.appendChild(emptyOption);

    const allGoals = (typeof getLinkableGoalsFlat === 'function')
        ? getLinkableGoalsFlat({ includeSubgoals: true })
        : ((typeof getAllGoalsFlat === 'function') ? getAllGoalsFlat() : []);
    allGoals.forEach((item) => {
        if (!item || !item.goal || !item.goal.id) return;
        const goalPath = (typeof getGoalPath === 'function') ? getGoalPath(item.goal.id) : '';
        const option = document.createElement('option');
        option.value = item.goal.id;
        option.textContent = goalPath ? `${item.year} • ${goalPath}` : `${item.year} • ${item.goal.text || 'Untitled Goal'}`;
        selectEl.appendChild(option);
    });

    const fallbackValue = preferredValue || previousValue;
    if (fallbackValue && Array.from(selectEl.options).some(option => option.value === fallbackValue)) {
        selectEl.value = fallbackValue;
    }
}

function populateAIProjectPlannerGoalSelect() {
    const goalSelect = document.getElementById('ai-project-goal-select');
    if (!goalSelect) return;
    populateAIGoalSelect(goalSelect, { emptyLabel: 'No linked goal' });
}

function populateAIMessyImportGoalSelect(options = {}) {
    const goalSelect = document.getElementById('ai-messy-import-goal-select');
    if (!goalSelect) return;
    populateAIGoalSelect(goalSelect, {
        emptyLabel: 'No linked goal',
        ...(options && typeof options === 'object' ? options : {})
    });
}

let aiMessyImportModalState = {
    launchContext: 'general',
    lockedMode: '',
    taskId: '',
    projectId: '',
    preferredGoalId: ''
};

function resetAIMessyImportModalState() {
    aiMessyImportModalState = {
        launchContext: 'general',
        lockedMode: '',
        taskId: '',
        projectId: '',
        preferredGoalId: ''
    };
}

function getProjectByIdForAIMessyImport(projectId) {
    const normalizedProjectId = String(projectId || '').trim();
    if (!normalizedProjectId) return null;
    if (typeof getProjectById === 'function') {
        const project = getProjectById(normalizedProjectId);
        if (project) return project;
    }
    return Array.isArray(projects)
        ? (projects.find(project => project && String(project.id || '').trim() === normalizedProjectId) || null)
        : null;
}

function getActiveTaskByIdForAIMessyImport(taskId) {
    const normalizedTaskId = String(taskId || '').trim();
    if (!normalizedTaskId || !Array.isArray(nodes)) return null;
    return nodes.find(node => node && node.id === normalizedTaskId && !node.completed) || null;
}

function getSelectedActiveTaskForAIMessyImport() {
    return getActiveTaskByIdForAIMessyImport(selectedNodeId);
}

function getLockedTaskForAIMessyImport() {
    return getActiveTaskByIdForAIMessyImport(aiMessyImportModalState.taskId);
}

function getActiveTaskTargetForAIMessyImport() {
    return getLockedTaskForAIMessyImport() || getSelectedActiveTaskForAIMessyImport();
}

function getLockedProjectForAIMessyImport() {
    return getProjectByIdForAIMessyImport(aiMessyImportModalState.projectId);
}

function getAIMessyImportGraphProjectNameFallback() {
    const lockedProject = getLockedProjectForAIMessyImport();
    if (lockedProject && lockedProject.name) return String(lockedProject.name || '').trim();
    const selectedTask = getActiveTaskTargetForAIMessyImport();
    const selectedProjectId = String(selectedTask && selectedTask.projectId || '').trim();
    if (!selectedProjectId) return '';
    const project = getProjectByIdForAIMessyImport(selectedProjectId);
    return project ? String(project.name || '').trim() : '';
}

function syncAIMessyImportModeUI() {
    const state = aiMessyImportModalState && typeof aiMessyImportModalState === 'object'
        ? aiMessyImportModalState
        : {};
    const modeEl = document.getElementById('ai-messy-import-mode');
    const modeFieldEl = document.getElementById('ai-messy-import-mode-field');
    const titleEl = document.getElementById('ai-messy-import-title');
    const summaryEl = document.getElementById('ai-messy-import-target-summary');
    const hintEl = document.getElementById('ai-messy-import-hint');
    const graphFieldsEl = document.getElementById('ai-messy-import-graph-fields');
    const projectFieldEl = document.getElementById('ai-messy-import-project-field');
    const sourceEl = document.getElementById('ai-messy-import-source');
    const submitBtn = document.getElementById('ai-messy-import-submit-btn');
    const projectNameEl = document.getElementById('ai-messy-import-project-name');
    const goalSelect = document.getElementById('ai-messy-import-goal-select');
    if (!modeEl || !summaryEl || !hintEl || !graphFieldsEl || !sourceEl || !submitBtn) return;

    const lockedMode = String(state.lockedMode || '').trim().toLowerCase();
    if (lockedMode && modeEl.value !== lockedMode) {
        modeEl.value = lockedMode;
    }
    const mode = String(modeEl.value || lockedMode || 'subtasks').trim().toLowerCase();
    const lockedProject = getLockedProjectForAIMessyImport();
    const selectedTask = getActiveTaskTargetForAIMessyImport();
    const selectedTaskMatchesLockedProject = !lockedProject
        || String(selectedTask && selectedTask.projectId || '').trim() === String(lockedProject && lockedProject.id || '').trim();
    const selectedTaskForGraph = selectedTaskMatchesLockedProject ? selectedTask : null;
    const selectedProjectName = getAIMessyImportGraphProjectNameFallback();
    const enteredProjectName = String(projectNameEl && projectNameEl.value || '').trim();
    const effectiveProjectName = (lockedProject && String(lockedProject.name || '').trim()) || enteredProjectName || selectedProjectName;
    const selectedGoalValue = String(goalSelect && goalSelect.value || '').trim();
    const selectedGoalLabel = selectedGoalValue
        ? String(goalSelect.options[goalSelect.selectedIndex]?.text || '').trim()
        : '';

    if (modeFieldEl) modeFieldEl.classList.toggle('hidden', !!lockedMode);
    modeEl.disabled = !!lockedMode;
    graphFieldsEl.classList.toggle('hidden', mode !== 'graph');
    if (projectFieldEl) projectFieldEl.classList.toggle('hidden', mode !== 'graph' || !!lockedProject);

    if (titleEl) {
        if (state.launchContext === 'task') titleEl.textContent = 'Import Subtasks from Messy Notes';
        else if (state.launchContext === 'project') titleEl.textContent = 'Import Project Plan';
        else titleEl.textContent = 'Messy Plan Import';
    }

    if (mode === 'graph') {
        const summaryBits = [];
        if (lockedProject) summaryBits.push(`Applying to project: ${lockedProject.name || 'Untitled Project'}`);
        else if (effectiveProjectName) summaryBits.push(`Target project: ${effectiveProjectName}`);
        else summaryBits.push('No project selected. Tasks will be added without a linked project unless you enter one.');
        if (selectedGoalLabel) summaryBits.push(`Goal: ${selectedGoalLabel}`);
        if (selectedTaskForGraph) summaryBits.push(`Current task: ${selectedTaskForGraph.title}`);
        summaryEl.textContent = summaryBits.join(' • ');
        summaryEl.classList.toggle('is-warning', !lockedProject && !effectiveProjectName);
        hintEl.textContent = lockedProject
            ? 'Paste messy planning text and the AI will organize it into clean tasks and subtasks for this project.'
            : 'Paste messy planning text and the AI will extract clean tasks, subtasks, and dependencies for graph import.';
        sourceEl.placeholder = lockedProject
            ? `Paste the rough project plan, notes, or chat for "${lockedProject.name || 'this project'}".`
            : 'Paste the rough plan, brainstorm, call transcript, or chat here. The AI will turn it into clean tasks and subtasks for the app.';
        submitBtn.textContent = lockedProject ? 'Normalize to Project Tasks' : 'Normalize to Task Graph';
    } else {
        if (selectedTask) {
            const summaryBits = [`Applying to task: ${selectedTask.title}`];
            if (selectedProjectName) summaryBits.push(`Project: ${selectedProjectName}`);
            summaryEl.textContent = summaryBits.join(' • ');
            summaryEl.classList.remove('is-warning');
        } else {
            summaryEl.textContent = 'Select an active task first. The AI will convert the pasted text into subtasks for that task.';
            summaryEl.classList.add('is-warning');
        }
        hintEl.textContent = 'Paste messy notes or chat and the AI will pull out only the actionable subtasks that belong under the selected task.';
        sourceEl.placeholder = 'Paste rough notes, bullets, or chat for the selected task. The AI will remove chatter and organize the actionable subtasks.';
        submitBtn.textContent = 'Normalize to Subtasks';
    }
}

function openAITaskMessyImportModal(taskId = '') {
    const targetTask = getActiveTaskByIdForAIMessyImport(taskId || selectedNodeId);
    if (!targetTask) {
        showNotification('Select an active task first.');
        return;
    }
    openAIMessyImportModal({
        launchContext: 'task',
        lockedMode: 'subtasks',
        taskId: targetTask.id
    });
}

function openAIProjectMessyImportModal(projectId = '') {
    const fallbackProjectId = (typeof projectDetailsProjectId !== 'undefined')
        ? String(projectDetailsProjectId || '').trim()
        : '';
    const normalizedProjectId = String(projectId || fallbackProjectId).trim();
    const targetProject = getProjectByIdForAIMessyImport(normalizedProjectId);
    if (!targetProject) {
        showNotification('Open a project first.');
        return;
    }
    const preferredGoalId = Array.isArray(targetProject.goalIds)
        ? String(targetProject.goalIds.find(goalId => String(goalId || '').trim()) || '').trim()
        : '';
    openAIMessyImportModal({
        launchContext: 'project',
        lockedMode: 'graph',
        projectId: targetProject.id,
        preferredGoalId
    });
}

function openAIMessyImportModal(options = null) {
    const safeOptions = options && typeof options === 'object' ? options : {};
    aiMessyImportModalState = {
        launchContext: String(safeOptions.launchContext || 'general').trim().toLowerCase() || 'general',
        lockedMode: String(safeOptions.lockedMode || '').trim().toLowerCase(),
        taskId: String(safeOptions.taskId || '').trim(),
        projectId: String(safeOptions.projectId || '').trim(),
        preferredGoalId: String(safeOptions.preferredGoalId || '').trim()
    };
    populateAIMessyImportGoalSelect({
        emptyLabel: 'No linked goal',
        preserveSelection: aiMessyImportModalState.launchContext === 'general',
        preferredValue: aiMessyImportModalState.preferredGoalId || ''
    });

    const modal = document.getElementById('ai-messy-import-modal');
    const backdrop = document.getElementById('ai-messy-import-backdrop');
    const modeEl = document.getElementById('ai-messy-import-mode');
    const projectNameEl = document.getElementById('ai-messy-import-project-name');
    const sourceEl = document.getElementById('ai-messy-import-source');
    if (!modal || !backdrop || !modeEl || !projectNameEl || !sourceEl) return;

    const lockedProject = getLockedProjectForAIMessyImport();
    const selectedTask = getActiveTaskTargetForAIMessyImport();
    const selectedProjectName = getAIMessyImportGraphProjectNameFallback();
    modeEl.value = aiMessyImportModalState.lockedMode || (selectedTask ? 'subtasks' : 'graph');
    if (lockedProject) projectNameEl.value = String(lockedProject.name || '').trim();
    else if (!String(projectNameEl.value || '').trim() && selectedProjectName) projectNameEl.value = selectedProjectName;

    syncAIMessyImportModeUI();
    backdrop.classList.add('visible');
    modal.classList.add('visible');

    setTimeout(() => {
        if (sourceEl && !sourceEl.disabled) sourceEl.focus();
    }, 90);
}

function closeAIMessyImportModal() {
    const modal = document.getElementById('ai-messy-import-modal');
    const backdrop = document.getElementById('ai-messy-import-backdrop');
    if (!modal || !backdrop) return;
    modal.classList.remove('visible');
    backdrop.classList.remove('visible');
    resetAIMessyImportModalState();
}

function getAIMessyImportFormValues() {
    const state = aiMessyImportModalState && typeof aiMessyImportModalState === 'object'
        ? aiMessyImportModalState
        : {};
    const modeEl = document.getElementById('ai-messy-import-mode');
    const sourceEl = document.getElementById('ai-messy-import-source');
    const projectNameEl = document.getElementById('ai-messy-import-project-name');
    const goalSelect = document.getElementById('ai-messy-import-goal-select');

    return {
        mode: String(modeEl && modeEl.value || 'subtasks').trim().toLowerCase(),
        source: String(sourceEl && sourceEl.value || '').trim(),
        projectName: String(projectNameEl && projectNameEl.value || '').trim(),
        projectId: String(state.projectId || '').trim(),
        taskId: String(state.taskId || '').trim(),
        launchContext: String(state.launchContext || 'general').trim().toLowerCase(),
        goalId: String(goalSelect && goalSelect.value || '').trim(),
        goalLabel: goalSelect && String(goalSelect.value || '').trim()
            ? String(goalSelect.options[goalSelect.selectedIndex]?.text || '').trim()
            : ''
    };
}

function submitAIMessyImport() {
    const form = getAIMessyImportFormValues();
    if (!form.source) {
        showNotification('Paste messy text first.');
        const sourceEl = document.getElementById('ai-messy-import-source');
        if (sourceEl) sourceEl.focus();
        return;
    }

    if (form.mode === 'graph') {
        const request = buildAIMessyGraphImportRequest(form);
        if (!request) return;
        closeAIMessyImportModal();
        quickPrompt(request.query, ['tasks', 'goals'], request.requestConfig);
        return;
    }

    const selectedTask = getActiveTaskTargetForAIMessyImport();
    if (!selectedTask) {
        showNotification('Select an active task first for subtask import.');
        syncAIMessyImportModeUI();
        return;
    }

    const request = buildAIMessySubtaskImportRequest(form, selectedTask);
    if (!request) return;
    closeAIMessyImportModal();
    quickPrompt(request.query, ['tasks'], request.requestConfig);
}

function openAIProjectPlannerModal() {
    const modal = document.getElementById('ai-project-planner-modal');
    const backdrop = document.getElementById('ai-project-planner-backdrop');
    if (!modal || !backdrop) return;

    populateAIProjectPlannerGoalSelect();
    backdrop.classList.add('visible');
    modal.classList.add('visible');

    const nameInput = document.getElementById('ai-project-name-input');
    setTimeout(() => {
        if (nameInput) nameInput.focus();
    }, 60);
}

function closeAIProjectPlannerModal() {
    const modal = document.getElementById('ai-project-planner-modal');
    const backdrop = document.getElementById('ai-project-planner-backdrop');
    if (!modal || !backdrop) return;
    modal.classList.remove('visible');
    backdrop.classList.remove('visible');
}

function getAIProjectPlannerFormValues() {
    const projectNameInput = document.getElementById('ai-project-name-input');
    const outcomeInput = document.getElementById('ai-project-outcome-input');
    const scopeInput = document.getElementById('ai-project-scope-input');
    const constraintsInput = document.getElementById('ai-project-constraints-input');
    const timeframeInput = document.getElementById('ai-project-timeframe-input');
    const depthSelect = document.getElementById('ai-project-depth-select');
    const goalSelect = document.getElementById('ai-project-goal-select');

    return {
        projectName: String(projectNameInput && projectNameInput.value || '').trim(),
        outcome: String(outcomeInput && outcomeInput.value || '').trim(),
        scope: String(scopeInput && scopeInput.value || '').trim(),
        constraints: String(constraintsInput && constraintsInput.value || '').trim(),
        timeframe: String(timeframeInput && timeframeInput.value || '').trim(),
        depth: String(depthSelect && depthSelect.value || 'balanced').trim(),
        goalId: String(goalSelect && goalSelect.value || '').trim(),
        goalLabel: goalSelect ? String(goalSelect.options[goalSelect.selectedIndex]?.text || '').trim() : ''
    };
}

function submitAIProjectPlanner() {
    const form = getAIProjectPlannerFormValues();
    if (!form.projectName) {
        showNotification('Project name is required');
        const projectNameInput = document.getElementById('ai-project-name-input');
        if (projectNameInput) projectNameInput.focus();
        return;
    }

    const depthConfig = getAIProjectPlannerDepthConfig(form.depth);
    const selectedGoalId = form.goalId || '';
    const selectedGoalLabel = form.goalLabel || '';

    const baseContext = buildContextFromSelection(new Set(['tasks', 'goals']));
    const plannerIntake = {
        projectName: form.projectName,
        outcome: form.outcome || null,
        scope: form.scope || null,
        constraints: form.constraints || null,
        timeframe: form.timeframe || null,
        planDepth: depthConfig.depth,
        taskCountRange: `${depthConfig.minTasks}-${depthConfig.maxTasks}`,
        selectedGoalId: selectedGoalId || null,
        selectedGoalLabel: selectedGoalLabel || null
    };

    const prompt = `Create a dependency-aware project execution graph for "${form.projectName}".

Planner Intake:
- Target outcome: ${form.outcome || 'Not provided'}
- Scope / deliverables: ${form.scope || 'Not provided'}
- Constraints / risks: ${form.constraints || 'Not provided'}
- Timeframe: ${form.timeframe || 'Not provided'}
- Plan depth: ${depthConfig.label} (${depthConfig.minTasks}-${depthConfig.maxTasks} tasks)
- Linked goal preference: ${selectedGoalId ? `${selectedGoalLabel} (goalId: ${selectedGoalId})` : 'None'}

Return:
1) A short explanation.
2) Machine-readable data wrapped in [DECOMPOSITION_DATA] ... [/DECOMPOSITION_DATA].

Use this JSON shape inside [DECOMPOSITION_DATA]:
{"tasks":[{"tempId":"t1","title":"Task title","duration":2,"dependencies":["t0"],"subtasks":[{"text":"Subtask 1"}],"goalIds":["goal_id_optional"]}]}
`;

    const requestConfig = {
        contextOverride: {
            ...baseContext,
            projectPlannerIntake: plannerIntake
        },
        contextLabel: 'Project Intake + Existing Tasks + Goals',
        extraInstructions: [
            '- Build a coherent DAG: dependencies must reference tempIds from the same payload and must not contain cycles.',
            `- Generate ${depthConfig.minTasks}-${depthConfig.maxTasks} tasks.`,
            '- Include 2-6 concrete subtasks per task when practical.',
            '- Avoid duplicate work already represented in existing active tasks and subtasks from CONTEXT.',
            selectedGoalId
                ? `- Include goalIds: ["${selectedGoalId}"] on each task unless a different existing goal from context is a better fit.`
                : '- Include goalIds only when they can be mapped confidently to existing goals in context.',
            '- Keep DECOMPOSITION_DATA JSON valid with double quotes only.'
        ].join('\n'),
        decompositionDefaults: {
            defaultGoalId: selectedGoalId || null,
            projectName: form.projectName || null,
            projectGoalId: selectedGoalId || null,
            autoCreateProject: true
        }
    };

    closeAIProjectPlannerModal();
    quickPrompt(prompt, ['tasks', 'goals'], requestConfig);
}

// --- GEMINI AI INTEGRATION ---
function toggleAIModal() {
    const modal = document.getElementById('ai-modal');
    if (!modal) return;
    if (modal.classList.contains('visible')) closeAIModal();
    else openAIModal();
}

function closeAIModal() {
    const modal = document.getElementById('ai-modal');
    const backdrop = document.getElementById('ai-modal-backdrop');
    if (!modal || !backdrop) return;
    if (!modal.classList.contains('visible')) return;

    if (typeof closeAIMessyImportModal === 'function') closeAIMessyImportModal();

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
    setAIPresetsVisibility(false);
    setAISettingsVisibility(false);
}

function toggleAISettings() {
    const pane = document.getElementById('ai-settings-pane');
    if (!pane) return;
    const shouldOpen = !pane.classList.contains('visible');
    if (shouldOpen) setAIPresetsVisibility(false);
    setAISettingsVisibility(shouldOpen);
}

function toggleAIPresets() {
    const pane = document.getElementById('ai-presets-pane');
    if (!pane) return;
    const shouldOpen = !pane.classList.contains('visible');
    if (shouldOpen) setAISettingsVisibility(false);
    setAIPresetsVisibility(shouldOpen);
}

// Track selected data types
let selectedAIData = new Set(['tasks']); // Default to tasks
let aiRequestInFlight = false;
let pendingAIRequestConfig = null;
let aiNoteSelection = {
    notes: new Set(),
    blocks: new Set()
};

function persistAINoteSelection() {
    localStorage.setItem('ai_note_selection', JSON.stringify({
        notes: Array.from(aiNoteSelection.notes),
        blocks: Array.from(aiNoteSelection.blocks)
    }));
}

function loadAINoteSelection() {
    const raw = localStorage.getItem('ai_note_selection');
    if (!raw) return;
    try {
        const parsed = JSON.parse(raw);
        aiNoteSelection.notes = new Set(parsed.notes || []);
        aiNoteSelection.blocks = new Set(parsed.blocks || []);
    } catch (e) {
        aiNoteSelection = { notes: new Set(), blocks: new Set() };
    }
}

function makeBlockSelectionKey(noteId, blockId) {
    return `${noteId}::${blockId}`;
}

function toggleAINoteSelection(noteId, checked) {
    if (!noteId) return;
    if (checked) aiNoteSelection.notes.add(noteId);
    else aiNoteSelection.notes.delete(noteId);
    persistAINoteSelection();
    if (typeof renderNotesList === 'function') renderNotesList();
    if (typeof updateAINoteSelectionSummary === 'function') updateAINoteSelectionSummary();
}

function toggleAIBlockSelection(noteId, blockId, checked) {
    if (!noteId || typeof blockId === 'undefined' || blockId === null) return;
    const key = makeBlockSelectionKey(noteId, blockId);
    if (checked) aiNoteSelection.blocks.add(key);
    else aiNoteSelection.blocks.delete(key);
    persistAINoteSelection();
    if (typeof renderNoteBlocks === 'function' && typeof currentEditingNoteId !== 'undefined' && currentEditingNoteId === noteId) {
        renderNoteBlocks();
    }
    if (typeof renderNotesList === 'function') renderNotesList();
    if (typeof updateAINoteSelectionSummary === 'function') updateAINoteSelectionSummary();
}

function clearAINoteSelection() {
    aiNoteSelection.notes.clear();
    aiNoteSelection.blocks.clear();
    persistAINoteSelection();
    if (typeof renderNotesList === 'function') renderNotesList();
    if (typeof renderNoteBlocks === 'function') renderNoteBlocks();
    if (typeof updateAINoteSelectionSummary === 'function') updateAINoteSelectionSummary();
}

function pruneAINoteSelection() {
    const existingNoteIds = new Set((notes || []).map(n => n.id));
    aiNoteSelection.notes = new Set(Array.from(aiNoteSelection.notes).filter(id => existingNoteIds.has(id)));

    const existingBlockKeys = new Set();
    (notes || []).forEach(note => {
        const blocks = typeof parseNoteBody === 'function' ? parseNoteBody(note) : [];
        blocks.forEach(block => {
            if (block && typeof block.id !== 'undefined') {
                existingBlockKeys.add(makeBlockSelectionKey(note.id, block.id));
            }
        });
    });

    aiNoteSelection.blocks = new Set(Array.from(aiNoteSelection.blocks).filter(k => existingBlockKeys.has(k)));
    persistAINoteSelection();
}

function getAINoteSelectionCounts() {
    let selectedBlocks = 0;
    const selectedWholeNotes = aiNoteSelection.notes.size;
    (notes || []).forEach(note => {
        if (aiNoteSelection.notes.has(note.id)) return;
        const blocks = typeof parseNoteBody === 'function' ? parseNoteBody(note) : [];
        blocks.forEach(block => {
            if (aiNoteSelection.blocks.has(makeBlockSelectionKey(note.id, block.id))) selectedBlocks += 1;
        });
    });
    return { selectedWholeNotes, selectedBlocks };
}

function buildSelectedNotesContext() {
    const selectedNotes = [];

    (notes || []).forEach(note => {
        const blocks = typeof parseNoteBody === 'function' ? parseNoteBody(note) : [];
        const wholeNoteSelected = aiNoteSelection.notes.has(note.id);
        const selectedBlocks = wholeNoteSelected
            ? blocks
            : blocks.filter(block => aiNoteSelection.blocks.has(makeBlockSelectionKey(note.id, block.id)));

        if (!wholeNoteSelected && selectedBlocks.length === 0) return;

        selectedNotes.push({
            id: note.id,
            title: note.title,
            wholeNoteSelected,
            linkedTaskCount: (note.taskIds || []).length,
            blocks: selectedBlocks.map((block, index) => ({
                id: block.id,
                order: index + 1,
                text: block.text || '',
                category: (typeof noteSettings !== 'undefined' && noteSettings.categoryNames)
                    ? (noteSettings.categoryNames[block.colorIndex] || `Category ${block.colorIndex}`)
                    : `Category ${block.colorIndex}`,
                bookmark: block.bookmarkName || ''
            }))
        });
    });

    return selectedNotes;
}

function setAIDataSelection(types) {
    const available = new Set(Array.from(document.querySelectorAll('.ai-data-toggle'))
        .map(btn => btn.dataset.type)
        .filter(Boolean));
    const normalized = Array.isArray(types)
        ? types.filter(type => available.size === 0 || available.has(type))
        : [];
    selectedAIData = new Set(normalized.length > 0 ? normalized : ['tasks']);

    document.querySelectorAll('.ai-data-toggle').forEach(btn => {
        btn.classList.toggle('active', selectedAIData.has(btn.dataset.type));
    });

    localStorage.setItem('ai_selected_data', JSON.stringify(Array.from(selectedAIData)));
}

function toggleAIData(type) {
    const btn = document.querySelector(`.ai-data-toggle[data-type="${type}"]`);
    if (!btn) return;

    if (selectedAIData.has(type)) {
        if (selectedAIData.size === 1) {
            showNotification('Select at least one data source');
            return;
        }
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
        prompt: 'Review my archived tasks and habit consistency this week. Write a brief executive summary of what I achieved and suggest my top 3 priorities for next week.',
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
        prompt: 'Analyze my current habit consistency and partial completion patterns. Which habits need attention and which are going strong?',
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

    setAIDataSelection(preset.requiredData);

    const input = document.getElementById('ai-input');
    if (!input) return;

    // Always populate input and focus, never auto-send
    input.value = preset.prompt;
    input.focus();

    // Close presets panel
    setAIPresetsVisibility(false);
}

function saveGeminiKey(val) {
    geminiApiKey = val.trim();
    localStorage.setItem('urgency_flow_gemini_key', geminiApiKey);
    const settingsInput = document.getElementById('settings-gemini-key-input');
    if (settingsInput && settingsInput.value !== geminiApiKey) settingsInput.value = geminiApiKey;
    updateAiGeminiKeyStatusLabel();
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
            trackGeminiUsage(data && data.usageMetadata);

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

function normalizeAIScheduleSlots(rawSlots) {
    const source = Array.isArray(rawSlots) ? rawSlots : [rawSlots];
    const validSlots = [];
    let skipped = 0;
    const nonce = Date.now();

    source.forEach((slot, index) => {
        if (!slot || typeof slot !== 'object') {
            skipped += 1;
            return;
        }

        const startMs = new Date(slot.start).getTime();
        const endMs = new Date(slot.end).getTime();
        if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
            skipped += 1;
            return;
        }

        const title = (typeof slot.title === 'string') ? slot.title.trim() : '';
        let taskId = (typeof slot.taskId === 'string') ? slot.taskId.trim() : '';
        if (!taskId) {
            const isBreak = /\bbreak\b/i.test(title);
            taskId = `${isBreak ? 'break_ai_' : 'ai_slot_'}${nonce}_${index}`;
        }

        const normalized = {
            taskId,
            start: new Date(startMs).toISOString(),
            end: new Date(endMs).toISOString()
        };
        if (title) normalized.title = title;
        validSlots.push(normalized);
    });

    return { validSlots, skipped };
}

function parseAIScheduleJson(rawJson) {
    const raw = String(rawJson || '').trim();
    const withoutFence = raw
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/, '')
        .trim();

    try {
        return JSON.parse(withoutFence);
    } catch (error) {
        const firstBracket = withoutFence.indexOf('[');
        const lastBracket = withoutFence.lastIndexOf(']');
        if (firstBracket >= 0 && lastBracket > firstBracket) {
            const maybeArray = withoutFence.slice(firstBracket, lastBracket + 1);
            return JSON.parse(maybeArray);
        }
        throw error;
    }
}

function parseAITaggedJson(rawJson) {
    const raw = String(rawJson || '').trim();
    const withoutFence = raw
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/, '')
        .trim();

    try {
        return JSON.parse(withoutFence);
    } catch (error) {
        const firstBracket = withoutFence.indexOf('[');
        const lastBracket = withoutFence.lastIndexOf(']');
        if (firstBracket >= 0 && lastBracket > firstBracket) {
            const maybeArray = withoutFence.slice(firstBracket, lastBracket + 1);
            return JSON.parse(maybeArray);
        }

        const firstBrace = withoutFence.indexOf('{');
        const lastBrace = withoutFence.lastIndexOf('}');
        if (firstBrace >= 0 && lastBrace > firstBrace) {
            const maybeObject = withoutFence.slice(firstBrace, lastBrace + 1);
            return JSON.parse(maybeObject);
        }

        throw error;
    }
}

function normalizeAISubtasks(rawPayload) {
    let targetTaskId = null;
    let source = rawPayload;

    if (!Array.isArray(source) && source && typeof source === 'object') {
        if (typeof source.taskId === 'string' && source.taskId.trim()) {
            targetTaskId = source.taskId.trim();
        }

        if (Array.isArray(source.subtasks)) {
            source = source.subtasks;
        }
    }

    const inputItems = Array.isArray(source) ? source : [source];
    const subtasks = [];

    inputItems.forEach((item) => {
        let text = '';

        if (typeof item === 'string') {
            text = item;
        } else if (item && typeof item === 'object') {
            if (typeof item.text === 'string') text = item.text;
            else if (typeof item.title === 'string') text = item.title;
            else if (typeof item.name === 'string') text = item.name;
        }

        const trimmed = String(text || '').trim().replace(/\s+/g, ' ');
        if (!trimmed) return;
        subtasks.push({ text: trimmed.substring(0, 400), done: false });
    });

    const deduped = [];
    const seen = new Set();
    subtasks.forEach((subtask) => {
        const key = subtask.text.toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        deduped.push(subtask);
    });

    return { subtasks: deduped, taskId: targetTaskId };
}

function resolveAISubtaskTargetTaskId(preferredTaskId = null) {
    const preferred = String(preferredTaskId || '').trim();
    if (preferred && nodes.some(n => n.id === preferred)) return preferred;
    if (selectedNodeId && nodes.some(n => n.id === selectedNodeId)) return selectedNodeId;
    return null;
}

function applyAISubtasksToTask(subtasks, preferredTaskId = null) {
    const safeSubtasks = Array.isArray(subtasks) ? subtasks : [];
    if (safeSubtasks.length === 0) {
        throw new Error('No valid subtasks were found.');
    }

    const taskId = resolveAISubtaskTargetTaskId(preferredTaskId);
    if (!taskId) {
        throw new Error('No active task selected. Open a task in the inspector and try again.');
    }

    const task = nodes.find(n => n.id === taskId);
    if (!task) {
        throw new Error('Target task was not found in active tasks.');
    }

    if (!Array.isArray(task.subtasks)) task.subtasks = [];
    const existing = new Set(task.subtasks.map(st => String(st && st.text || '').trim().toLowerCase()).filter(Boolean));

    let added = 0;
    safeSubtasks.forEach((subtask) => {
        const text = String(subtask && subtask.text || '').trim();
        if (!text) return;
        const key = text.toLowerCase();
        if (existing.has(key)) return;
        task.subtasks.push(typeof createSubtask === 'function'
            ? createSubtask(text, { done: false })
            : { text, done: false });
        existing.add(key);
        added += 1;
    });

    updateCalculations();
    render();
    if (selectedNodeId === taskId) updateInspector();
    saveToStorage();
    return { taskId, taskTitle: task.title || 'Untitled Task', added, skipped: safeSubtasks.length - added };
}

function addAIChatMessage(text, role, options = null) {
    const history = document.getElementById('ai-chat-history');
    if (!history) return;
    const msg = document.createElement('div');
    msg.className = `ai-msg ${role}`;

    // 1. Check for Data Tags
    let cleanText = String(text || '');
    let scheduleJson = null;
    let decompJson = null;
    let subtaskJson = null;

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

    if (cleanText.includes('[SUBTASK_DATA]')) {
        const parts = cleanText.split('[SUBTASK_DATA]');
        const dataParts = parts[1].split('[/SUBTASK_DATA]');
        subtaskJson = dataParts[0].trim();
        cleanText = parts[0] + (dataParts[1] || "");
    }

    if (role === 'user') {
        msg.textContent = cleanText;
    } else {
        msg.innerHTML = (typeof marked !== 'undefined')
            ? marked.parse(cleanText)
            : escapeHtml(cleanText).replace(/\n/g, '<br>');
    }

    if (scheduleJson && role === 'bot') {
        const pushBtn = document.createElement('button');
        pushBtn.className = 'btn btn-primary';
        pushBtn.style.marginTop = '10px';
        pushBtn.style.width = '100%';
        pushBtn.style.background = 'var(--ready-color)';
        pushBtn.innerText = '📅 Apply to My Agenda';
        pushBtn.onclick = () => {
            try {
                const parsedSlots = parseAIScheduleJson(scheduleJson);
                const { validSlots, skipped } = normalizeAIScheduleSlots(parsedSlots);
                if (validSlots.length === 0) {
                    throw new Error('No valid schedule slots were found.');
                }

                agenda = [...(Array.isArray(agenda) ? agenda : []), ...validSlots];
                saveToStorage();
                renderAgenda();
                if (skipped > 0) {
                    showNotification(`Agenda Updated (${validSlots.length} added, ${skipped} skipped)`);
                } else {
                    showNotification(`Agenda Updated (${validSlots.length} added)`);
                }
                pushBtn.innerText = '✅ Applied';
                pushBtn.disabled = true;
            } catch (e) {
                console.error('[ai] Failed to apply schedule:', e);
                alert(`Schedule Format Error: ${e.message || 'Invalid schedule data'}`);
            }
        };
        msg.appendChild(pushBtn);
    }

    if (decompJson && role === 'bot') {
        const genBtn = document.createElement('button');
        genBtn.className = 'btn btn-primary';
        genBtn.style.marginTop = '10px';
        genBtn.style.width = '100%';
        genBtn.style.background = 'var(--ai-accent)';
        genBtn.innerText = '✨ Apply Project Graph';
        genBtn.onclick = () => {
            try {
                const data = parseAITaggedJson(decompJson);
                const defaults = (options && options.decompositionDefaults && typeof options.decompositionDefaults === 'object')
                    ? options.decompositionDefaults
                    : null;
                const result = applyDecomposition(data, defaults || {});
                genBtn.innerText = result && result.count > 0
                    ? `✅ Graph Applied (${result.count})`
                    : '✅ Graph Applied';
                genBtn.disabled = true;
            } catch (e) {
                console.error('[ai] Failed to apply decomposition:', e);
                alert(`Decomposition Format Error: ${e.message || 'Invalid decomposition data'}`);
            }
        };
        msg.appendChild(genBtn);
    }

    if (subtaskJson && role === 'bot') {
        const applySubtasksBtn = document.createElement('button');
        applySubtasksBtn.className = 'btn btn-primary';
        applySubtasksBtn.style.marginTop = '10px';
        applySubtasksBtn.style.width = '100%';
        applySubtasksBtn.style.background = '#10b981';
        applySubtasksBtn.innerText = '✅ Apply Subtasks to Task';
        applySubtasksBtn.onclick = () => {
            try {
                const parsed = parseAITaggedJson(subtaskJson);
                const normalized = normalizeAISubtasks(parsed);
                const result = applyAISubtasksToTask(normalized.subtasks, normalized.taskId);
                showNotification(`Subtasks Applied (${result.added} added${result.skipped > 0 ? `, ${result.skipped} skipped` : ''})`);
                if (result.added > 0) {
                    applySubtasksBtn.innerText = `✅ Added to: ${result.taskTitle}`;
                } else {
                    applySubtasksBtn.innerText = '✅ No New Subtasks';
                }
                applySubtasksBtn.disabled = true;
            } catch (e) {
                console.error('[ai] Failed to apply subtasks:', e);
                alert(`Subtask Format Error: ${e.message || 'Invalid subtask data'}`);
            }
        };
        msg.appendChild(applySubtasksBtn);
    }

    history.appendChild(msg);
    history.scrollTop = history.scrollHeight;
}

function findTaskGroupForTaskId(taskId) {
    if (!taskId || typeof buildTaskGroups !== 'function') return null;
    const groups = buildTaskGroups({ includeSingles: true, sort: 'priority' });
    return groups.find(group => Array.isArray(group.nodeIds) && group.nodeIds.includes(taskId)) || null;
}

function buildTaskGroupContextForDecomposition(taskId) {
    const targetTask = nodes.find(n => n.id === taskId);
    if (!targetTask) return null;

    const taskGroup = findTaskGroupForTaskId(taskId);
    const groupNodes = (taskGroup && Array.isArray(taskGroup.nodes) && taskGroup.nodes.length > 0)
        ? taskGroup.nodes
        : [targetTask];

    const groupNodeIds = new Set(groupNodes.map(n => n.id));
    const projectById = new Map((Array.isArray(projects) ? projects : [])
        .filter(project => project && project.id)
        .map(project => [project.id, project]));
    const selectedProjectId = String(targetTask.projectId || '').trim() || null;
    const groupProjectIds = new Set(groupNodes
        .map(node => String(node && node.projectId || '').trim())
        .filter(Boolean));
    let scopedProjectId = selectedProjectId;
    if (!scopedProjectId && groupProjectIds.size === 1) {
        scopedProjectId = Array.from(groupProjectIds)[0];
    }
    const scopedProject = scopedProjectId ? (projectById.get(scopedProjectId) || null) : null;

    const taskById = new Map();
    nodes.forEach(node => taskById.set(node.id, node));
    archivedNodes.forEach(node => {
        if (!taskById.has(node.id)) taskById.set(node.id, node);
    });

    const dependentsByTaskId = new Map();
    nodes.forEach(node => {
        (Array.isArray(node.dependencies) ? node.dependencies : []).forEach(dep => {
            if (!dep || !dep.id) return;
            if (!dependentsByTaskId.has(dep.id)) dependentsByTaskId.set(dep.id, []);
            dependentsByTaskId.get(dep.id).push({
                id: node.id,
                title: node.title || 'Untitled Task',
                type: dep.type || 'hard',
                inGroup: groupNodeIds.has(node.id)
            });
        });
    });

    const groupGoalIds = new Set();
    const tasksInGroup = groupNodes.map(node => {
        const taskGoals = (Array.isArray(node.goalIds) ? node.goalIds : [])
            .filter(Boolean)
            .map(goalId => {
                groupGoalIds.add(goalId);
                const goalTitle = (typeof getGoalTextById === 'function') ? getGoalTextById(goalId) : '';
                const goalPath = (typeof getGoalPath === 'function') ? getGoalPath(goalId) : '';
                return {
                    id: goalId,
                    title: goalTitle || 'Unknown Goal',
                    path: goalPath || null
                };
            });

        return {
            id: node.id,
            title: node.title || 'Untitled Task',
            completed: !!node.completed,
            due: node.dueDate || null,
            isUrgent: !!node.isManualUrgent || !!node._isUrgent,
            isCritical: !!node._isCritical,
            isBlocked: !!node._isBlocked,
            isReady: !!node._isReady,
            subtasks: (Array.isArray(node.subtasks) ? node.subtasks : [])
                .map(subtask => ({
                    text: String(subtask && subtask.text || '').trim(),
                    done: !!(subtask && subtask.done)
                }))
                .filter(subtask => subtask.text),
            dependencies: (Array.isArray(node.dependencies) ? node.dependencies : [])
                .map(dep => {
                    if (!dep || !dep.id) return null;
                    const depTask = taskById.get(dep.id);
                    return {
                        id: dep.id,
                        type: dep.type || 'hard',
                        title: depTask ? (depTask.title || 'Untitled Task') : 'Unknown Task',
                        inGroup: groupNodeIds.has(dep.id)
                    };
                })
                .filter(Boolean),
            dependents: (dependentsByTaskId.get(node.id) || [])
                .filter(dep => dep.inGroup)
                .slice(0, 20),
            linkedGoals: taskGoals
        };
    });

    const existingSubtaskTextsSet = new Set();
    tasksInGroup.forEach(task => {
        (task.subtasks || []).forEach(subtask => {
            const key = String(subtask && subtask.text || '').trim().toLowerCase();
            if (key) existingSubtaskTextsSet.add(key);
        });
    });

    const relatedProjectTasks = scopedProjectId
        ? nodes
            .filter(node => node && String(node.projectId || '').trim() === scopedProjectId && !groupNodeIds.has(node.id))
            .slice(0, 60)
            .map(node => ({
                id: node.id,
                title: node.title || 'Untitled Task',
                completed: !!node.completed,
                due: node.dueDate || null,
                isUrgent: !!node.isManualUrgent || !!node._isUrgent,
                isCritical: !!node._isCritical,
                isBlocked: !!node._isBlocked,
                isReady: !!node._isReady,
                subtasks: (Array.isArray(node.subtasks) ? node.subtasks : [])
                    .map(subtask => ({
                        text: String(subtask && subtask.text || '').trim(),
                        done: !!(subtask && subtask.done)
                    }))
                    .filter(subtask => subtask.text)
            }))
        : [];

    relatedProjectTasks.forEach(task => {
        (task.subtasks || []).forEach(subtask => {
            const key = String(subtask && subtask.text || '').trim().toLowerCase();
            if (key) existingSubtaskTextsSet.add(key);
        });
    });

    let projectScope = null;
    if (scopedProjectId) {
        const allProjectTasks = [...nodes, ...archivedNodes]
            .filter(node => node && String(node.projectId || '').trim() === scopedProjectId);
        const activeProjectTasks = allProjectTasks.filter(node => !node.completed && !archivedNodes.some(archived => archived.id === node.id));
        projectScope = {
            id: scopedProjectId,
            name: scopedProject ? (scopedProject.name || 'Untitled Project') : 'Unknown Project',
            status: scopedProject ? (scopedProject.status || 'active') : 'active',
            totalCount: allProjectTasks.length,
            activeCount: activeProjectTasks.length,
            completedCount: allProjectTasks.length - activeProjectTasks.length
        };
    }

    const linkedGoals = Array.from(groupGoalIds).map(goalId => {
        const goalTitle = (typeof getGoalTextById === 'function') ? getGoalTextById(goalId) : '';
        const goalPath = (typeof getGoalPath === 'function') ? getGoalPath(goalId) : '';
        return {
            id: goalId,
            title: goalTitle || 'Unknown Goal',
            path: goalPath || null
        };
    });

    const selectedTask = tasksInGroup.find(task => task.id === taskId) || {
        id: targetTask.id,
        title: targetTask.title || 'Untitled Task'
    };

    return {
        currentTime: new Date().toLocaleString(),
        includedData: ['task_group_decomposition'],
        selectedTask,
        taskGroup: {
            id: taskGroup ? taskGroup.id : null,
            title: taskGroup ? taskGroup.title : (targetTask.title || 'Task Group'),
            totalCount: tasksInGroup.length,
            completedCount: tasksInGroup.filter(task => task.completed).length
        },
        projectScope,
        tasksInGroup,
        relatedProjectTasks,
        linkedGoals,
        existingSubtaskTexts: Array.from(existingSubtaskTextsSet)
    };
}

function buildMessyImportLinkedGoals(goalIds) {
    const uniqueGoalIds = Array.from(new Set(
        (Array.isArray(goalIds) ? goalIds : [])
            .map(goalId => String(goalId || '').trim())
            .filter(Boolean)
    ));

    return uniqueGoalIds.map((goalId) => {
        const title = (typeof getGoalTextById === 'function') ? getGoalTextById(goalId) : '';
        const path = (typeof getGoalPath === 'function') ? getGoalPath(goalId) : '';
        return {
            id: goalId,
            title: title || 'Unknown Goal',
            path: path || null
        };
    });
}

function buildMessyImportTaskSummary(task, taskMap) {
    if (!task || !task.id) return null;

    const safeTaskMap = taskMap instanceof Map ? taskMap : new Map();
    return {
        id: String(task.id || '').trim(),
        title: String(task.title || 'Untitled Task').trim() || 'Untitled Task',
        completed: !!task.completed,
        due: task.dueDate || null,
        isUrgent: !!task.isManualUrgent || !!task._isUrgent,
        isCritical: !!task._isCritical,
        isBlocked: !!task._isBlocked,
        projectId: String(task.projectId || '').trim() || null,
        dependencies: (Array.isArray(task.dependencies) ? task.dependencies : [])
            .map((dep) => {
                if (!dep || !dep.id) return null;
                const depTask = safeTaskMap.get(dep.id);
                return {
                    id: dep.id,
                    title: depTask ? String(depTask.title || 'Untitled Task').trim() || 'Untitled Task' : 'Unknown Task',
                    type: dep.type === 'soft' ? 'soft' : 'hard'
                };
            })
            .filter(Boolean)
            .slice(0, 20),
        subtasks: (Array.isArray(task.subtasks) ? task.subtasks : [])
            .map((subtask) => ({
                text: String(subtask && subtask.text || '').trim(),
                done: !!(subtask && subtask.done)
            }))
            .filter(subtask => subtask.text)
            .slice(0, 40),
        linkedGoals: buildMessyImportLinkedGoals(task.goalIds)
    };
}

function buildMessyImportProjectContext(form) {
    const safeForm = form && typeof form === 'object' ? form : {};
    const lockedProjectId = String(safeForm.projectId || '').trim();
    let selectedTask = getActiveTaskTargetForAIMessyImport();
    const selectedTaskProjectId = String(selectedTask && selectedTask.projectId || '').trim();
    const selectedGoalId = resolveGoalIdFromHint(safeForm.goalId || '');
    const requestedProjectName = normalizeDecompositionProjectName(safeForm.projectName);

    let targetProject = null;
    let projectSource = 'none';
    if (lockedProjectId) {
        targetProject = getProjectByIdForAIMessyImport(lockedProjectId);
        if (targetProject) projectSource = 'locked-project';
    }
    if (!targetProject && requestedProjectName) {
        targetProject = findProjectByNameForDecomposition(requestedProjectName);
        if (targetProject) projectSource = 'name-match';
    }
    if (!targetProject && selectedTaskProjectId) {
        targetProject = getProjectByIdForAIMessyImport(selectedTaskProjectId);
        if (targetProject) projectSource = 'selected-task';
    }

    const targetProjectId = String(targetProject && targetProject.id || '').trim();
    if (selectedTask && targetProjectId && selectedTaskProjectId !== targetProjectId) {
        selectedTask = null;
    }
    const targetProjectName = targetProject
        ? String(targetProject.name || '').trim()
        : (requestedProjectName || '');
    const allTasks = [...(Array.isArray(nodes) ? nodes : []), ...(Array.isArray(archivedNodes) ? archivedNodes : [])];
    const taskMap = new Map();
    allTasks.forEach((task) => {
        if (!task || !task.id || taskMap.has(task.id)) return;
        taskMap.set(task.id, task);
    });

    const projectTaskSource = targetProjectId
        ? allTasks
            .filter(task => task && String(task.projectId || '').trim() === targetProjectId)
            .slice()
            .sort((a, b) => {
                if (!!a.completed !== !!b.completed) return Number(a.completed) - Number(b.completed);
                const updatedA = Math.max(Number(a && a.updatedAt) || 0, Number(a && a.createdAt) || 0);
                const updatedB = Math.max(Number(b && b.updatedAt) || 0, Number(b && b.createdAt) || 0);
                return updatedB - updatedA;
            })
            .slice(0, 80)
        : [];

    const existingProjectSubtaskTexts = new Set();
    const existingProjectTasks = projectTaskSource
        .map((task) => {
            const summary = buildMessyImportTaskSummary(task, taskMap);
            if (!summary) return null;
            (summary.subtasks || []).forEach((subtask) => {
                const key = String(subtask && subtask.text || '').trim().toLowerCase();
                if (key) existingProjectSubtaskTexts.add(key);
            });
            return summary;
        })
        .filter(Boolean);

    const linkedGoalIds = Array.from(new Set([
        ...(Array.isArray(targetProject && targetProject.goalIds) ? targetProject.goalIds : []),
        ...(Array.isArray(selectedTask && selectedTask.goalIds) ? selectedTask.goalIds : []),
        ...(selectedGoalId ? [selectedGoalId] : [])
    ].map(goalId => String(goalId || '').trim()).filter(Boolean)));

    return {
        currentTime: new Date().toLocaleString(),
        includedData: ['messy_import_graph'],
        messyImportMode: 'graph',
        messyImportSource: String(safeForm.source || '').trim(),
        selectedTask: buildMessyImportTaskSummary(selectedTask, taskMap),
            targetProjectRequest: {
                projectId: targetProjectId || null,
                projectName: targetProjectName || null,
                matchedExistingProject: !!targetProject,
                projectSource,
                lockedProjectId: lockedProjectId || null,
                selectedGoalId: selectedGoalId || null,
                selectedGoalLabel: String(safeForm.goalLabel || '').trim() || null
            },
        targetProject: targetProject
            ? {
                id: targetProjectId,
                name: targetProjectName || 'Untitled Project',
                status: String(targetProject.status || 'active').trim() || 'active',
                description: String(targetProject.description || '').trim() || null,
                goalIds: Array.isArray(targetProject.goalIds) ? targetProject.goalIds.slice(0, 12) : []
            }
            : null,
        existingProjectTasks,
        existingProjectSubtaskTexts: Array.from(existingProjectSubtaskTexts),
        linkedGoals: buildMessyImportLinkedGoals(linkedGoalIds)
    };
}

function buildAIMessySubtaskImportRequest(form, selectedTask) {
    const safeForm = form && typeof form === 'object' ? form : {};
    const safeTask = selectedTask && typeof selectedTask === 'object' ? selectedTask : null;
    if (!safeTask || !safeTask.id) return null;

    const scopedContext = buildTaskGroupContextForDecomposition(safeTask.id) || {
        currentTime: new Date().toLocaleString(),
        includedData: ['task_group_decomposition'],
        selectedTask: {
            id: safeTask.id,
            title: safeTask.title || 'Untitled Task'
        }
    };

    return {
        query: 'Normalize the pasted planning text into import-ready subtasks for the selected task.',
        requestConfig: {
            contextOverride: {
                ...scopedContext,
                includedData: Array.from(new Set([
                    ...(Array.isArray(scopedContext.includedData) ? scopedContext.includedData : []),
                    'messy_import_source'
                ])),
                messyImportMode: 'subtasks',
                messyImportSource: String(safeForm.source || '').trim(),
                targetTask: {
                    id: safeTask.id,
                    title: safeTask.title || 'Untitled Task',
                    projectId: String(safeTask.projectId || '').trim() || null
                }
            },
            contextLabel: 'Messy Source + Selected Task Group + Project Scope',
            extraInstructions: [
                '- The messy planning source is in CONTEXT.messyImportSource.',
                '- Extract only actionable subtasks for CONTEXT.targetTask.',
                '- Ignore filler, discussion, rationale, greetings, status chatter, and duplicate phrasing.',
                '- Use tasksInGroup, relatedProjectTasks, and existingSubtaskTexts from CONTEXT to avoid duplicate work.',
                '- Keep subtasks concise, action-oriented, and non-overlapping.',
                '- Prefer 4-18 subtasks when the source supports them; return fewer if only a few real actions exist.',
                '- Do not invent major work that is not supported by the pasted source or local task context.',
                `- Return [SUBTASK_DATA] with taskId "${safeTask.id}" and valid double-quoted JSON only.`
            ].join('\n')
        }
    };
}

function buildAIMessyGraphImportRequest(form) {
    const safeForm = form && typeof form === 'object' ? form : {};
    const context = buildMessyImportProjectContext(safeForm);
    const targetProjectRequest = context && context.targetProjectRequest && typeof context.targetProjectRequest === 'object'
        ? context.targetProjectRequest
        : {};
    const targetProjectId = String(targetProjectRequest.projectId || '').trim();
    const targetProjectName = normalizeDecompositionProjectName(targetProjectRequest.projectName || safeForm.projectName || '');
    const selectedGoalId = String(targetProjectRequest.selectedGoalId || '').trim();

    return {
        query: 'Normalize the pasted planning text into import-ready tasks and subtasks for the app.',
        requestConfig: {
            contextOverride: context,
            contextLabel: 'Messy Source + Target Project Context + Goals',
            extraInstructions: [
                '- The messy planning source is in CONTEXT.messyImportSource.',
                '- Convert it into a clean task graph for the app: tasks first, subtasks when they add meaningful execution detail.',
                '- Ignore filler, greetings, deliberation, and duplicate wording.',
                '- Merge duplicate or near-duplicate work items.',
                '- Use existingProjectTasks and existingProjectSubtaskTexts from CONTEXT to avoid duplicating work already in the project.',
                '- Infer dependencies only when the source suggests real sequencing; otherwise leave tasks independent.',
                '- Prefer 4-24 tasks depending on the amount of actionable material in the source.',
                '- Keep task titles short and concrete. Keep subtasks concise and action-oriented.',
                targetProjectName
                    ? `- Treat "${targetProjectName}" as the target project name for this import.`
                    : '- If CONTEXT.targetProjectRequest.projectName is empty, do not invent a project name unless the source clearly provides one.',
                selectedGoalId
                    ? `- Include goalIds: ["${selectedGoalId}"] on tasks when that goal is clearly relevant.`
                    : '- Include goalIds only when they map confidently to existing goals from CONTEXT.',
                '- Return [DECOMPOSITION_DATA] only with valid double-quoted JSON.'
            ].join('\n'),
            decompositionDefaults: {
                defaultGoalId: selectedGoalId || null,
                projectId: targetProjectId || null,
                projectName: targetProjectName || null,
                projectGoalId: selectedGoalId || null,
                autoCreateProject: !!targetProjectName && !targetProjectId
            }
        }
    };
}

function getAiContextTaskDueDayDelta(dueDate, nowTs = Date.now()) {
    const raw = String(dueDate || '').trim();
    if (!raw) return Infinity;

    let parsed = null;
    const localMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (localMatch) {
        parsed = new Date(
            Number(localMatch[1]),
            Number(localMatch[2]) - 1,
            Number(localMatch[3]),
            0, 0, 0, 0
        );
    } else {
        parsed = new Date(raw);
    }

    if (!(parsed instanceof Date) || Number.isNaN(parsed.getTime())) return Infinity;

    const due = new Date(parsed.getTime());
    const today = new Date(nowTs);
    due.setHours(0, 0, 0, 0);
    today.setHours(0, 0, 0, 0);
    return Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function getAiContextTaskPriorityScore(task, nowTs = Date.now()) {
    if (!task || task.completed) return Number.NEGATIVE_INFINITY;

    let score = Number.isFinite(Number(task._urgencyScore)) ? Number(task._urgencyScore) : 0;
    const downstreamWeight = Math.max(0, Number(task._downstreamWeight) || 0);
    const isUrgent = !!task.isManualUrgent || !!task._isUrgent;
    const isCritical = !!task._isCritical;
    const isBlocked = !!task._isBlocked;
    const blockedImportant = isBlocked && (isUrgent || isCritical || downstreamWeight > 0);
    const dueDayDelta = getAiContextTaskDueDayDelta(task.dueDate, nowTs);
    const updatedAt = Math.max(Number(task.updatedAt) || 0, Number(task.createdAt) || 0);

    if (task.isManualUrgent) score = Math.max(score, 100);
    if (task._isUrgent) score = Math.max(score, 92);
    else if (task._isCritical) score = Math.max(score, 78);

    if (Number.isFinite(dueDayDelta)) {
        if (dueDayDelta <= 0) score += 40;
        else if (dueDayDelta <= 1) score += 34;
        else if (dueDayDelta <= 3) score += 26;
        else if (dueDayDelta <= 7) score += 18;
        else if (dueDayDelta <= 14) score += 10;
    }

    score += Math.min(22, downstreamWeight * 3);

    if (blockedImportant) score += 20;
    else if (isBlocked) score += 8;

    if (updatedAt > 0) {
        const ageHours = Math.max(0, (nowTs - updatedAt) / (1000 * 60 * 60));
        if (ageHours <= 24) score += 8;
        else if (ageHours <= 72) score += 5;
        else if (ageHours <= 168) score += 3;
    }

    return score;
}

function selectActiveTasksForAiContext(limit = 50) {
    const safeLimit = Math.max(1, Number(limit) || 50);
    const nowTs = Date.now();
    const activeTasks = Array.isArray(nodes) ? nodes.filter(task => task && !task.completed) : [];

    return activeTasks
        .map((task, index) => {
            const downstreamWeight = Math.max(0, Number(task._downstreamWeight) || 0);
            return {
                task,
                index,
                priorityScore: getAiContextTaskPriorityScore(task, nowTs),
                dueDayDelta: getAiContextTaskDueDayDelta(task.dueDate, nowTs),
                updatedAt: Math.max(Number(task.updatedAt) || 0, Number(task.createdAt) || 0),
                createdAt: Number(task.createdAt) || 0,
                downstreamWeight,
                isUrgent: !!task.isManualUrgent || !!task._isUrgent,
                isCritical: !!task._isCritical,
                blockedImportant: !!task._isBlocked && ((!!task.isManualUrgent || !!task._isUrgent) || !!task._isCritical || downstreamWeight > 0)
            };
        })
        .sort((a, b) => {
            if (b.priorityScore !== a.priorityScore) return b.priorityScore - a.priorityScore;
            if (b.isCritical !== a.isCritical) return Number(b.isCritical) - Number(a.isCritical);
            if (b.isUrgent !== a.isUrgent) return Number(b.isUrgent) - Number(a.isUrgent);
            if (b.blockedImportant !== a.blockedImportant) return Number(b.blockedImportant) - Number(a.blockedImportant);

            const aHasDue = Number.isFinite(a.dueDayDelta);
            const bHasDue = Number.isFinite(b.dueDayDelta);
            if (aHasDue && bHasDue && a.dueDayDelta !== b.dueDayDelta) return a.dueDayDelta - b.dueDayDelta;
            if (aHasDue !== bHasDue) return aHasDue ? -1 : 1;

            if (b.downstreamWeight !== a.downstreamWeight) return b.downstreamWeight - a.downstreamWeight;
            if (b.updatedAt !== a.updatedAt) return b.updatedAt - a.updatedAt;
            if (b.createdAt !== a.createdAt) return b.createdAt - a.createdAt;

            const titleCompare = String(a.task.title || '').localeCompare(String(b.task.title || ''), undefined, { sensitivity: 'base' });
            if (titleCompare !== 0) return titleCompare;
            return a.index - b.index;
        })
        .slice(0, safeLimit)
        .map(entry => entry.task);
}

function buildContextFromSelection(dataTypes) {
    const context = {
        currentTime: new Date().toLocaleString(),
        includedData: Array.from(dataTypes)
    };

    if (dataTypes.has('tasks')) {
        const projectNameById = new Map((Array.isArray(projects) ? projects : [])
            .map(project => [project.id, project.name || 'Untitled Project']));
        context.activeTasks = selectActiveTasksForAiContext(50).map(n => ({
            id: n.id,
            title: n.title,
            due: n.dueDate,
            isUrgent: !!n.isManualUrgent || !!n._isUrgent,
            isCritical: n._isCritical,
            isBlocked: n._isBlocked,
            isReady: n._isReady,
            projectId: n.projectId || null,
            project: n.projectId ? (projectNameById.get(n.projectId) || 'Unknown Project') : null,
            subtaskProgress: n.subtasks.length > 0 ? `${n.subtasks.filter(s => s.done).length}/${n.subtasks.length}` : 'none',
            dependencies: n.dependencies.map(d => {
                const dep = nodes.find(x => x.id === d.id);
                return dep ? dep.title : 'unknown';
            }).slice(0, 3),
            downstreamWeight: n._downstreamWeight
        }));
    }

    if (dataTypes.has('projects')) {
        context.projects = (Array.isArray(projects) ? projects : []).map(project => ({
            id: project.id,
            name: project.name,
            status: project.status,
            goalIds: Array.isArray(project.goalIds) ? project.goalIds.slice(0, 8) : [],
            createdAt: project.createdAt,
            updatedAt: project.updatedAt
        }));
    }

    if (dataTypes.has('goals')) {
        context.lifeGoals = lifeGoals[currentGoalYear] || [];
        context.currentYear = currentGoalYear;
    }

    if (dataTypes.has('habits')) {
        context.habits = habits.map(h => {
            const archived = typeof isHabitArchived === 'function'
                ? isHabitArchived(h)
                : (Number(h && h.archivedAt) > 0);
            const metrics = typeof getHabitMetrics === 'function' ? getHabitMetrics(h) : null;
            return {
                title: h.title,
                type: h.type,
                frequency: h.frequency,
                target: h.target,
                current: archived ? h.target : (metrics ? metrics.current : null),
                ratio: archived ? 1 : (metrics ? metrics.ratio : null),
                status: archived ? 'completed' : (metrics ? metrics.status : null),
                archived: archived
            };
        });
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
        const selectedNotes = buildSelectedNotesContext();
        const selectionCounts = getAINoteSelectionCounts();
        context.notesSelection = {
            selectedWholeNotes: selectionCounts.selectedWholeNotes,
            selectedBlocks: selectionCounts.selectedBlocks,
            hasSelection: selectedNotes.length > 0
        };
        context.notes = selectedNotes;
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

function setAIComposerBusy(isBusy) {
    const input = document.getElementById('ai-input');
    const askBtn = document.getElementById('ai-ask-btn');
    if (input) input.disabled = !!isBusy;
    if (askBtn) {
        if (!askBtn.dataset.defaultLabel) {
            askBtn.dataset.defaultLabel = askBtn.innerText || 'Ask';
        }
        askBtn.disabled = !!isBusy;
        askBtn.innerText = isBusy ? 'Thinking...' : askBtn.dataset.defaultLabel;
    }
}

async function askAI() {
    const input = document.getElementById('ai-input');
    if (!input) return;
    const query = input.value.trim();
    if (!query) return;
    if (aiRequestInFlight) {
        showNotification('AI is already generating a response');
        return;
    }
    const requestConfig = pendingAIRequestConfig;
    pendingAIRequestConfig = null;

    if (!geminiApiKey) {
        addAIChatMessage("⚠️ Please set your Gemini API Key in the settings (⚙️ icon above) to use AI features.", 'bot');
        setAIPresetsVisibility(false);
        setAISettingsVisibility(true);
        return;
    }

    if (selectedAIData.size === 0) {
        setAIDataSelection(['tasks']);
    }

    aiRequestInFlight = true;
    setAIComposerBusy(true);

    // Add user message to chat
    addAIChatMessage(query, 'user');
    input.value = '';

    // Show loading indicator
    const loadingEl = document.getElementById('ai-loading');
    if (loadingEl) loadingEl.classList.remove('hidden');

    // Build context from selected data types
    const appState = (requestConfig && requestConfig.contextOverride && typeof requestConfig.contextOverride === 'object')
        ? requestConfig.contextOverride
        : buildContextFromSelection(selectedAIData);

    // Build system prompt based on selected data
    const dataLabels = {
        tasks: 'Tasks (active nodes)',
        projects: 'Projects',
        goals: 'Life Goals',
        habits: 'Daily Habits',
        schedule: 'Agenda/Calendar',
        notes: 'Knowledge Base Notes',
        archive: 'Completed Tasks',
        inbox: 'Inbox Ideas'
    };

    const includedDataList = (requestConfig && typeof requestConfig.contextLabel === 'string' && requestConfig.contextLabel.trim())
        ? requestConfig.contextLabel.trim()
        : (Array.from(selectedAIData).map(d => dataLabels[d]).join(', ') || 'Tasks (active nodes)');
    const additionalInstructions = (requestConfig && typeof requestConfig.extraInstructions === 'string')
        ? requestConfig.extraInstructions.trim()
        : '';
    const noteSelectionInfo = selectedAIData.has('notes')
        ? getAINoteSelectionCounts()
        : { selectedWholeNotes: 0, selectedBlocks: 0 };

    const systemPrompt = `You are an AI assistant for "Urgency Flow," a productivity app.

DATA PROVIDED: ${includedDataList}

${selectedAIData.has('notes')
            ? `NOTES FILTER: Only use checked notes/blocks. Selected notes: ${noteSelectionInfo.selectedWholeNotes}, selected blocks: ${noteSelectionInfo.selectedBlocks}.`
            : ''}

CONTEXT: ${JSON.stringify(appState)}

INSTRUCTIONS:
- Answer concisely and actionably
- Focus only on the data types provided above
- If asked about data not included, politely mention it wasn't included in this query
- Prioritize practical next steps over general advice
- If the user asks for a schedule, agenda, or plan, generate a JSON array of schedule slots wrapped in [SCHEDULE_DATA] ... [/SCHEDULE_DATA] tags.
  Format: [SCHEDULE_DATA] [{"taskId":"<id> (optional)","title":"<title>","start":<timestamp_ms>,"end":<timestamp_ms>}] [/SCHEDULE_DATA]
  IMPORTANT: Use millisecond timestamps (numbers) for start and end times.
- If the user asks for a project graph/decomposition, include [DECOMPOSITION_DATA] ... [/DECOMPOSITION_DATA] with JSON.
  Format: [DECOMPOSITION_DATA] {"tasks":[{"tempId":"t1","title":"Task title","duration":1,"dependencies":["t0"],"subtasks":[{"text":"Subtask"}],"goalIds":["goal_optional"]}]} [/DECOMPOSITION_DATA]
- If the user asks to decompose one specific task into subtasks, include [SUBTASK_DATA] ... [/SUBTASK_DATA] with JSON.
  Format: [SUBTASK_DATA] {"taskId":"<task_id_if_provided>","subtasks":[{"text":"Subtask 1"},{"text":"Subtask 2"}]} [/SUBTASK_DATA]
- Keep [SCHEDULE_DATA], [DECOMPOSITION_DATA], and [SUBTASK_DATA] payloads valid JSON with double quotes only.
${additionalInstructions ? `- Additional scope rules for this request:\n${additionalInstructions}` : ''}
`;

    // Prepare API payload
    const payload = {
        contents: [
            {
                parts: [
                    { text: `${systemPrompt}\n\nUser Query: ${query}` }
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
        addAIChatMessage(text, 'bot', {
            decompositionDefaults: (requestConfig && requestConfig.decompositionDefaults && typeof requestConfig.decompositionDefaults === 'object')
                ? requestConfig.decompositionDefaults
                : null
        });

    } catch (e) {
        console.error("AI Error:", e);
        addAIChatMessage(`❌ AI Error: ${e.message}. Please check your API key, internet connection, or model status.`, 'bot');
    } finally {
        if (loadingEl) loadingEl.classList.add('hidden');
        setAIComposerBusy(false);
        aiRequestInFlight = false;
        const modal = document.getElementById('ai-modal');
        if (modal && modal.classList.contains('visible')) input.focus();
    }
}

function decomposeGoal(goal) {
    const prompt = `Break down the goal "${goal.text}" into a detailed project plan with dependencies. Specify durations for each task in days.`;
    quickPrompt(prompt, ['tasks', 'goals']);
}

function decomposeTask() {
    const node = nodes.find(n => n.id === selectedNodeId);
    if (!node) return;
    const scopedContext = buildTaskGroupContextForDecomposition(node.id);
    const prompt = `Decompose the task "${node.title}" (taskId: ${node.id}) into clear, executable subtasks.

Requirements:
- Generate 5-12 subtasks
- Keep each subtask concise and action-oriented
- Avoid duplicating existing dependencies unless necessary
- Use the provided task-group context to avoid overlap with existing tasks/subtasks in this project area
- After your explanation, include machine-readable data wrapped in [SUBTASK_DATA] ... [/SUBTASK_DATA]
- Use this exact JSON shape:
  {"taskId":"${node.id}","subtasks":[{"text":"First subtask"},{"text":"Second subtask"}]}
`;
    const requestConfig = scopedContext
        ? {
            contextOverride: scopedContext,
            contextLabel: 'Selected Task Group + Project Scope (tasks, subtasks, dependencies, linked goals)',
            extraInstructions: [
                '- Treat this as a project-scoped decomposition request for the selected task.',
                '- Use tasksInGroup, existingSubtaskTexts, and linkedGoals to avoid duplicate or already-covered work.',
                '- If projectScope or relatedProjectTasks are present, avoid proposing subtasks that are already covered elsewhere in the same project.',
                '- Prefer subtasks that fill genuine gaps in the selected task relative to nearby tasks in the same group.'
            ].join('\n')
        }
        : null;
    quickPrompt(prompt, ['tasks'], requestConfig);
}

function resolveGoalIdFromHint(hint) {
    const raw = String(hint || '').trim();
    if (!raw) return null;

    const allGoals = (typeof getAllGoalsFlat === 'function') ? getAllGoalsFlat() : [];
    const byId = allGoals.find(item => item && item.goal && item.goal.id === raw);
    if (byId && byId.goal) return byId.goal.id;

    const needle = raw.toLowerCase();
    const byText = allGoals.find(item => {
        const text = String(item && item.goal && item.goal.text || '').trim().toLowerCase();
        return text && text === needle;
    });
    if (byText && byText.goal) return byText.goal.id;

    const byPath = allGoals.find(item => {
        if (!item || !item.goal || !item.goal.id || typeof getGoalPath !== 'function') return false;
        const path = String(getGoalPath(item.goal.id) || '').trim().toLowerCase();
        return path && path === needle;
    });
    if (byPath && byPath.goal) return byPath.goal.id;

    return null;
}

function normalizeDecompositionProjectName(name) {
    return String(name || '').trim().slice(0, 160);
}

function getDecompositionProjectStatusRank(status) {
    const normalized = String(status || '').trim().toLowerCase();
    if (normalized === 'active') return 0;
    if (normalized === 'paused') return 1;
    if (normalized === 'completed') return 2;
    if (normalized === 'archived') return 3;
    return 9;
}

function findProjectByNameForDecomposition(projectName) {
    const needle = normalizeDecompositionProjectName(projectName).toLowerCase();
    if (!needle) return null;

    const pool = Array.isArray(projects) ? projects : [];
    const matches = pool
        .filter(project => project && project.id && String(project.name || '').trim().toLowerCase() === needle)
        .slice();

    if (matches.length === 0) return null;

    matches.sort((a, b) => {
        const rankDiff = getDecompositionProjectStatusRank(a && a.status) - getDecompositionProjectStatusRank(b && b.status);
        if (rankDiff !== 0) return rankDiff;
        const updatedA = Number(a && a.updatedAt) || 0;
        const updatedB = Number(b && b.updatedAt) || 0;
        return updatedB - updatedA;
    });

    return matches[0] || null;
}

function createProjectForDecomposition(projectName, goalIds) {
    const safeName = normalizeDecompositionProjectName(projectName) || 'New Project';
    const safeGoalIds = Array.isArray(goalIds)
        ? Array.from(new Set(goalIds.map(goalId => String(goalId || '').trim()).filter(Boolean)))
        : [];

    if (typeof createProject === 'function') {
        return createProject(safeName, {
            goalIds: safeGoalIds,
            origin: 'ai',
            description: 'Created from AI Project Planner output.'
        });
    }

    const now = Date.now();
    return {
        id: 'proj_' + now + Math.random().toString(36).substr(2, 5),
        name: safeName,
        description: 'Created from AI Project Planner output.',
        status: 'active',
        goalIds: safeGoalIds,
        color: null,
        sortOrder: 0,
        createdAt: now,
        updatedAt: now,
        archivedAt: null,
        origin: 'ai',
        aiUrgency: (typeof createDefaultAiUrgency === 'function')
            ? createDefaultAiUrgency('project')
            : null
    };
}

function ensureProjectForDecomposition(options, fallbackGoalId) {
    const safeOptions = (options && typeof options === 'object') ? options : {};
    const shouldAutoCreate = !!safeOptions.autoCreateProject;
    const requestedProjectId = String(safeOptions.projectId || '').trim();
    const requestedProjectName = normalizeDecompositionProjectName(safeOptions.projectName);
    const requestedGoalId = resolveGoalIdFromHint(safeOptions.projectGoalId || fallbackGoalId || '');

    let targetProject = null;
    let created = false;

    if (requestedProjectId) {
        if (typeof getProjectById === 'function') {
            targetProject = getProjectById(requestedProjectId);
        }
        if (!targetProject && Array.isArray(projects)) {
            targetProject = projects.find(project => project && project.id === requestedProjectId) || null;
        }
    }

    if (!targetProject && requestedProjectName) {
        targetProject = findProjectByNameForDecomposition(requestedProjectName);
    }

    if (!targetProject && shouldAutoCreate && requestedProjectName) {
        if (!Array.isArray(projects)) projects = [];
        targetProject = createProjectForDecomposition(requestedProjectName, requestedGoalId ? [requestedGoalId] : []);
        projects.push(targetProject);
        created = true;
    }

    if (!targetProject) return { project: null, created: false };

    if (requestedGoalId) {
        const existingGoalIds = Array.isArray(targetProject.goalIds)
            ? targetProject.goalIds.map(goalId => String(goalId || '').trim()).filter(Boolean)
            : [];
        if (!existingGoalIds.includes(requestedGoalId)) {
            existingGoalIds.push(requestedGoalId);
            targetProject.goalIds = existingGoalIds;
        }
    }

    targetProject.updatedAt = Date.now();
    return { project: targetProject, created };
}

function applyDecomposition(data, options = null) {
    if (!data) return { count: 0 };

    const safeOptions = (options && typeof options === 'object') ? options : {};
    const payload = (Array.isArray(data))
        ? { tasks: data }
        : ((data && typeof data === 'object') ? data : { tasks: [] });
    const sourceTasks = Array.isArray(payload.tasks)
        ? payload.tasks
        : (Array.isArray(payload.nodes) ? payload.nodes : []);

    if (sourceTasks.length === 0) {
        throw new Error('No tasks found in decomposition payload.');
    }

    const rawDefaultGoalId = safeOptions.defaultGoalId || payload.defaultGoalId || '';
    const resolvedDefaultGoalId = resolveGoalIdFromHint(rawDefaultGoalId);
    const allGoals = (typeof getAllGoalsFlat === 'function') ? getAllGoalsFlat() : [];
    const fallbackGoalId = (!resolvedDefaultGoalId && rawDefaultGoalId && allGoals.some(item => item && item.goal && item.goal.id === rawDefaultGoalId))
        ? rawDefaultGoalId
        : null;
    const defaultGoalId = resolvedDefaultGoalId || fallbackGoalId || null;
    const targetProjectMeta = ensureProjectForDecomposition(safeOptions, defaultGoalId);
    const targetProject = targetProjectMeta.project || null;
    const targetProjectId = targetProject ? String(targetProject.id || '').trim() : '';

    const normalizedTasks = sourceTasks
        .map((item, index) => {
            if (!item || typeof item !== 'object') return null;
            const tempIdRaw = String(item.tempId || item.id || item.key || `t${index + 1}`).trim();
            const tempId = tempIdRaw || `t${index + 1}`;
            const title = String(item.title || item.name || item.text || `Task ${index + 1}`).trim() || `Task ${index + 1}`;
            const durationNum = Number(item.duration);
            const duration = Number.isFinite(durationNum) && durationNum > 0
                ? Math.min(365, Math.round(durationNum))
                : 1;

            const parsedSubtasks = Array.isArray(item.subtasks)
                ? normalizeAISubtasks(item.subtasks).subtasks
                : [];
            const subtasks = parsedSubtasks.slice(0, 40);

            const goalHints = [];
            if (Array.isArray(item.goalIds)) goalHints.push(...item.goalIds);
            if (Array.isArray(item.goals)) goalHints.push(...item.goals);
            if (typeof item.goalId === 'string') goalHints.push(item.goalId);
            if (typeof item.goal === 'string') goalHints.push(item.goal);
            if (typeof item.goalPath === 'string') goalHints.push(item.goalPath);

            const resolvedGoalIds = Array.from(new Set(goalHints
                .map(resolveGoalIdFromHint)
                .filter(Boolean)));
            if (defaultGoalId) resolvedGoalIds.push(defaultGoalId);

            const depRefs = Array.isArray(item.dependencies) ? item.dependencies : [];

            return {
                tempId,
                title,
                duration,
                subtasks,
                goalIds: Array.from(new Set(resolvedGoalIds)),
                depRefs
            };
        })
        .filter(Boolean);

    if (normalizedTasks.length === 0) {
        throw new Error('No valid tasks found in decomposition payload.');
    }

    const idMap = {};
    const startX = (window.innerWidth / 2 - panX) / scale - 90;
    const startY = (window.innerHeight / 2 - panY) / scale - 50;

    normalizedTasks.forEach((item, index) => {
        const newNode = createNode(startX + (index % 3) * 220, startY + Math.floor(index / 3) * 150, item.title);
        newNode.duration = item.duration || 1;
        if (Array.isArray(item.subtasks) && item.subtasks.length > 0) {
            newNode.subtasks = item.subtasks
                .map(st => {
                    const text = String(st && st.text || '').trim();
                    if (!text) return null;
                    return typeof createSubtask === 'function'
                        ? createSubtask(text, { done: false })
                        : { text, done: false };
                })
                .filter(Boolean);
        }
        if (Array.isArray(item.goalIds) && item.goalIds.length > 0) {
            newNode.goalIds = Array.from(new Set(item.goalIds.filter(Boolean)));
        }
        if (targetProjectId) {
            newNode.projectId = targetProjectId;
        }
        nodes.push(newNode);
        idMap[item.tempId] = newNode.id;
    });

    normalizedTasks.forEach(item => {
        const depRefs = (Array.isArray(item.depRefs) && item.depRefs.length > 0)
            ? item.depRefs
            : ((payload && payload.dependencies && Array.isArray(payload.dependencies[item.tempId]))
                ? payload.dependencies[item.tempId]
                : []);

        const targetNode = nodes.find(n => n.id === idMap[item.tempId]);
        if (!targetNode || !Array.isArray(depRefs)) return;

        depRefs.forEach((depRef) => {
            let depKey = '';
            let depType = 'hard';
            if (typeof depRef === 'string') depKey = depRef.trim();
            else if (depRef && typeof depRef === 'object') {
                depKey = String(depRef.id || depRef.tempId || depRef.depId || '').trim();
                depType = depRef.type === 'soft' ? 'soft' : 'hard';
            }
            if (!depKey || !idMap[depKey]) return;

            if (!targetNode.dependencies.some(dep => dep.id === idMap[depKey])) {
                targetNode.dependencies.push({ id: idMap[depKey], type: depType });
            }

            const parentNode = nodes.find(n => n.id === idMap[depKey]);
            if (parentNode && typeof inheritTaskGoalsFromParent === 'function') {
                inheritTaskGoalsFromParent(parentNode, targetNode);
            }
        });
    });

    updateCalculations();
    render();
    if (targetProject && typeof renderProjectsList === 'function') {
        try {
            renderProjectsList();
        } catch (error) {
            console.warn('[ai] Failed to refresh projects list after decomposition:', error);
        }
    }
    if (targetProject
        && typeof isProjectDetailsModalOpen === 'function'
        && isProjectDetailsModalOpen()
        && typeof renderProjectDetailsModal === 'function'
        && typeof projectDetailsProjectId !== 'undefined'
        && String(projectDetailsProjectId || '').trim() === String(targetProject.id || '').trim()) {
        try {
            renderProjectDetailsModal();
        } catch (error) {
            console.warn('[ai] Failed to refresh project details after decomposition:', error);
        }
    }
    saveToStorage();
    const projectSuffix = targetProject
        ? ` in project "${targetProject.name || 'Untitled Project'}"`
        : '';
    showNotification(`Generated ${normalizedTasks.length} tasks${projectSuffix}!`);
    return {
        count: normalizedTasks.length,
        projectId: targetProject ? (targetProject.id || null) : null,
        projectName: targetProject ? (targetProject.name || null) : null,
        createdProject: !!targetProjectMeta.created
    };
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
