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
    const statusEl = document.getElementById('ai-urgency-status');

    if (modeSelect && modeSelect.value !== cfg.mode) modeSelect.value = cfg.mode;

    const blendPercent = Math.round((Number(cfg.blendWeightAi) || 0) * 100);
    if (blendRange && String(blendRange.value) !== String(blendPercent)) blendRange.value = String(blendPercent);
    if (blendValue) blendValue.innerText = `${blendPercent}%`;

    if (statusEl) {
        const modeLabel = String(cfg.mode || 'shadow').toUpperCase();
        const semanticLabel = cfg.semanticProvider === 'gemini' ? 'Gemini semantic ready' : 'Heuristic semantic mode';
        statusEl.innerText = `Mode: ${modeLabel} • Blend: ${blendPercent}% • ${semanticLabel}`;
    }
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
        return {
            score: parseAiUrgencyScoreValue(meta && meta.score),
            level: Number(meta && meta.level) || null
        };
    }
    const fallback = task && task.aiUrgency;
    return {
        score: parseAiUrgencyScoreValue(fallback && fallback.score),
        level: Number(fallback && fallback.level) || null
    };
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
        return {
            score: parseAiUrgencyScoreValue(meta && meta.score),
            level: Number(meta && meta.level) || null
        };
    }
    const fallback = project && project.aiUrgency;
    return {
        score: parseAiUrgencyScoreValue(fallback && fallback.score),
        level: Number(fallback && fallback.level) || null
    };
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
        const systemMeta = readTaskSystemMetaForScores(task);
        const aiMeta = readTaskAiMetaForScores(task);
        const systemScore = Number(systemMeta.score);
        const aiScore = Number(aiMeta.score);
        const delta = (Number.isFinite(aiScore) ? aiScore : 0) - (Number.isFinite(systemScore) ? systemScore : 0);
        const dueRaw = String(task.dueDate || '').trim();
        const dueLabel = dueRaw || '—';
        const projectName = projectNameById[String(task.projectId || '').trim()] || '—';
        return {
            title: String(task.title || 'Untitled Task'),
            projectName,
            dueLabel,
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
        '<th>#</th>',
        '<th>Task</th>',
        '<th>Project</th>',
        '<th>Due</th>'
    ];
    if (view === 'system') headCells.push('<th>System</th>');
    else if (view === 'ai') headCells.push('<th>AI</th>');
    else headCells.push('<th>System</th>', '<th>AI</th>', '<th>Δ</th>');

    const bodyRows = rows.map((entry, index) => {
        const deltaClass = entry.delta >= 0 ? 'ai-urgency-delta-pos' : 'ai-urgency-delta-neg';
        const scoreCells = (view === 'system')
            ? `<td class="ai-urgency-score-cell">${escapeAiUrgencyScoresHtml(scoreLabelForTable(entry.systemMeta))}</td>`
            : (view === 'ai')
                ? `<td class="ai-urgency-score-cell">${escapeAiUrgencyScoresHtml(scoreLabelForTable(entry.aiMeta))}</td>`
                : `
                    <td class="ai-urgency-score-cell">${escapeAiUrgencyScoresHtml(scoreLabelForTable(entry.systemMeta))}</td>
                    <td class="ai-urgency-score-cell">${escapeAiUrgencyScoresHtml(scoreLabelForTable(entry.aiMeta))}</td>
                    <td class="ai-urgency-score-cell ${deltaClass}">${escapeAiUrgencyScoresHtml(formatAiUrgencyDelta(entry.delta))}</td>
                `;

        return `
            <tr>
                <td>${index + 1}</td>
                <td class="ai-urgency-title-cell">${escapeAiUrgencyScoresHtml(entry.title)}</td>
                <td>${escapeAiUrgencyScoresHtml(entry.projectName)}</td>
                <td>${escapeAiUrgencyScoresHtml(entry.dueLabel)}</td>
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
        '<th>Open Tasks</th>'
    ];
    if (view === 'system') headCells.push('<th>System</th>');
    else if (view === 'ai') headCells.push('<th>AI</th>');
    else headCells.push('<th>System</th>', '<th>AI</th>', '<th>Δ</th>');

    const bodyRows = rows.map((entry, index) => {
        const deltaClass = entry.delta >= 0 ? 'ai-urgency-delta-pos' : 'ai-urgency-delta-neg';
        const scoreCells = (view === 'system')
            ? `<td class="ai-urgency-score-cell">${escapeAiUrgencyScoresHtml(scoreLabelForTable(entry.systemMeta))}</td>`
            : (view === 'ai')
                ? `<td class="ai-urgency-score-cell">${escapeAiUrgencyScoresHtml(scoreLabelForTable(entry.aiMeta))}</td>`
                : `
                    <td class="ai-urgency-score-cell">${escapeAiUrgencyScoresHtml(scoreLabelForTable(entry.systemMeta))}</td>
                    <td class="ai-urgency-score-cell">${escapeAiUrgencyScoresHtml(scoreLabelForTable(entry.aiMeta))}</td>
                    <td class="ai-urgency-score-cell ${deltaClass}">${escapeAiUrgencyScoresHtml(formatAiUrgencyDelta(entry.delta))}</td>
                `;

        return `
            <tr>
                <td>${index + 1}</td>
                <td class="ai-urgency-title-cell">${escapeAiUrgencyScoresHtml(entry.name)}</td>
                <td>${escapeAiUrgencyScoresHtml(entry.status)}</td>
                <td class="ai-urgency-score-cell">${entry.openTaskCount}</td>
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

    const cfg = getSafeAiUrgencyConfigForUI();
    if (meta) {
        meta.innerText = `Mode: ${String(cfg.mode || 'shadow').toUpperCase()} • View: ${view.toUpperCase()} • Active tasks: ${taskCount} • Projects: ${projectCount}`;
    }
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
    if (aiUrgencySemanticRunInProgress) {
        showNotification('Semantic AI urgency is already running.');
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
    const statusEl = document.getElementById('ai-urgency-status');
    const prevStatus = statusEl ? statusEl.innerText : '';
    if (statusEl) statusEl.innerText = 'Running semantic AI re-score...';

    try {
        const result = await recomputeAiUrgencyWithGemini({ maxTasks: 20, persist: true });
        if (typeof render === 'function') render();
        if (typeof renderProjectsList === 'function') renderProjectsList();
        if (typeof renderInsightsDashboard === 'function') renderInsightsDashboard();
        syncAiUrgencySettingsUI();
        if (isAiUrgencyScoresModalOpen()) renderAiUrgencyScoresModal();
        const taskCount = Math.max(0, Number(result && result.tasksUpdated) || 0);
        showNotification(`Semantic AI updated ${taskCount} task scores`);
    } catch (error) {
        console.error('[ai-urgency] Semantic re-score failed:', error);
        showNotification(`Semantic re-score failed: ${error.message}`);
        if (statusEl && prevStatus) statusEl.innerText = prevStatus;
    } finally {
        aiUrgencySemanticRunInProgress = false;
        syncAiUrgencySettingsUI();
    }
}

function updateSettingsHubUI() {
    const settingsGeminiInput = document.getElementById('settings-gemini-key-input');
    if (settingsGeminiInput) settingsGeminiInput.value = geminiApiKey || '';

    const aiGeminiInput = document.getElementById('gemini-api-key-input');
    if (aiGeminiInput && geminiApiKey) aiGeminiInput.value = geminiApiKey;

    const ecoStatus = document.getElementById('eco-status');
    const settingsEcoStatus = document.getElementById('settings-eco-status');
    if (ecoStatus && settingsEcoStatus) settingsEcoStatus.innerText = ecoStatus.innerText;

    if (typeof updateBackupStatusUI === 'function') updateBackupStatusUI();
    if (typeof updateDataMetrics === 'function') updateDataMetrics();
    updateGeminiUsageUI();
    syncAiUrgencySettingsUI();
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

    const merged = {
        dataModelVersion: Math.max(
            Number(local && local.dataModelVersion) || 1,
            Number(remote && remote.dataModelVersion) || 1,
            1
        ),
        aiUrgencyConfig: mergeAiUrgencyConfig(local && local.aiUrgencyConfig, remote && remote.aiUrgencyConfig),
        projects: mergeProjectCollections(local && local.projects, remote && remote.projects),
        nodes: [],
        archivedNodes: [...(local.archivedNodes || [])],
        inbox: [...(local.inbox || [])],
        lifeGoals: local.lifeGoals || {},
        habits: local.habits || [],
        notes: [],
        agenda: local.agenda || [],
        reminders: []
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
            const nextTask = {
                ...remoteTask,
                aiUrgency: pickNewerAiUrgency(null, remoteTask && remoteTask.aiUrgency, 'task')
            };
            merged.nodes.push(nextTask);
        } else if (!remoteTask) {
            const nextTask = {
                ...localTask,
                aiUrgency: pickNewerAiUrgency(localTask && localTask.aiUrgency, null, 'task')
            };
            merged.nodes.push(nextTask);
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

            chosen.aiUrgency = pickNewerAiUrgency(localTask.aiUrgency, remoteTask.aiUrgency, 'task');

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
            nodes, archivedNodes, inbox, lifeGoals, habits, notes, agenda, reminders
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
    if (visible) updateGeminiUsageUI();
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

function populateAIProjectPlannerGoalSelect() {
    const goalSelect = document.getElementById('ai-project-goal-select');
    if (!goalSelect) return;

    const previousValue = goalSelect.value;
    goalSelect.innerHTML = '<option value="">No linked goal</option>';

    const allGoals = (typeof getLinkableGoalsFlat === 'function')
        ? getLinkableGoalsFlat({ includeSubgoals: true })
        : ((typeof getAllGoalsFlat === 'function') ? getAllGoalsFlat() : []);
    allGoals.forEach((item) => {
        if (!item || !item.goal || !item.goal.id) return;
        const goalPath = (typeof getGoalPath === 'function') ? getGoalPath(item.goal.id) : '';
        const option = document.createElement('option');
        option.value = item.goal.id;
        option.textContent = goalPath ? `${item.year} • ${goalPath}` : `${item.year} • ${item.goal.text || 'Untitled Goal'}`;
        goalSelect.appendChild(option);
    });

    if (previousValue && Array.from(goalSelect.options).some(option => option.value === previousValue)) {
        goalSelect.value = previousValue;
    }
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
    const aiInput = document.getElementById('gemini-api-key-input');
    if (aiInput && aiInput.value !== geminiApiKey) aiInput.value = geminiApiKey;
    const settingsInput = document.getElementById('settings-gemini-key-input');
    if (settingsInput && settingsInput.value !== geminiApiKey) settingsInput.value = geminiApiKey;
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
        task.subtasks.push({ text, done: false });
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

function buildContextFromSelection(dataTypes) {
    const context = {
        currentTime: new Date().toLocaleString(),
        includedData: Array.from(dataTypes)
    };

    if (dataTypes.has('tasks')) {
        const projectNameById = new Map((Array.isArray(projects) ? projects : [])
            .map(project => [project.id, project.name || 'Untitled Project']));
        context.activeTasks = nodes.filter(n => !n.completed).slice(0, 50).map(n => ({
            id: n.id,
            title: n.title,
            due: n.dueDate,
            isUrgent: n.isManualUrgent,
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
            newNode.subtasks = item.subtasks.map(st => ({
                text: String(st && st.text || '').trim(),
                done: false
            })).filter(st => st.text);
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
