// --- AI URGENCY ENGINE ---
(function (global) {
    'use strict';

    const DAY_MS = 24 * 60 * 60 * 1000;
    const DEFAULT_LEVEL_LABELS = {
        1: 'Lowest',
        2: 'Low',
        3: 'Medium',
        4: 'High',
        5: 'Hot'
    };
    const DEFAULT_LEVEL_TAGS = {
        1: 'LOWEST',
        2: 'LOW',
        3: 'MEDIUM',
        4: 'HIGH',
        5: 'HOT'
    };

    function readAiUrgencyConfig() {
        if (typeof aiUrgencyConfig !== 'undefined' && aiUrgencyConfig && typeof aiUrgencyConfig === 'object') {
            return aiUrgencyConfig;
        }
        if (global.aiUrgencyConfig && typeof global.aiUrgencyConfig === 'object') return global.aiUrgencyConfig;
        return {};
    }

    function readNodes() {
        if (typeof nodes !== 'undefined' && Array.isArray(nodes)) return nodes;
        if (Array.isArray(global.nodes)) return global.nodes;
        return [];
    }

    function readArchivedNodes() {
        if (typeof archivedNodes !== 'undefined' && Array.isArray(archivedNodes)) return archivedNodes;
        if (Array.isArray(global.archivedNodes)) return global.archivedNodes;
        return [];
    }

    function readProjects() {
        if (typeof projects !== 'undefined' && Array.isArray(projects)) return projects;
        if (Array.isArray(global.projects)) return global.projects;
        return [];
    }

    function clamp(value, min, max) {
        const n = Number(value);
        if (!Number.isFinite(n)) return min;
        if (n < min) return min;
        if (n > max) return max;
        return n;
    }

    function toLevel(score) {
        const s = clamp(score, 0, 100);
        if (s >= 86) return 5;
        if (s >= 68) return 4;
        if (s >= 48) return 3;
        if (s >= 26) return 2;
        return 1;
    }

    function getLevelLabel(level) {
        const labels = (typeof AI_URGENCY_LEVEL_LABELS !== 'undefined')
            ? AI_URGENCY_LEVEL_LABELS
            : (global.AI_URGENCY_LEVEL_LABELS || DEFAULT_LEVEL_LABELS);
        return labels[level] || DEFAULT_LEVEL_LABELS[level] || 'Lowest';
    }

    function getLevelTag(level) {
        const tags = (typeof AI_URGENCY_LEVEL_TAGS !== 'undefined')
            ? AI_URGENCY_LEVEL_TAGS
            : (global.AI_URGENCY_LEVEL_TAGS || DEFAULT_LEVEL_TAGS);
        return tags[level] || DEFAULT_LEVEL_TAGS[level] || 'LOWEST';
    }

    function normalizeMode(options) {
        const safeOptions = options && typeof options === 'object' ? options : {};
        const fromOptions = String(safeOptions.mode || '').trim().toLowerCase();
        if (['system', 'ai', 'blended'].includes(fromOptions)) return fromOptions;

        const config = readAiUrgencyConfig();
        const configMode = String(config.mode || 'shadow').trim().toLowerCase();
        if (configMode === 'ai') return 'ai';
        if (configMode === 'blended') return 'blended';
        return 'system';
    }

    function updateAiUrgencyConfig(patch, options) {
        const safePatch = patch && typeof patch === 'object' ? patch : {};
        const safeOptions = options && typeof options === 'object' ? options : {};
        const base = readAiUrgencyConfig();
        const next = (typeof normalizeAiUrgencyConfig === 'function')
            ? normalizeAiUrgencyConfig({ ...base, ...safePatch })
            : { ...base, ...safePatch };

        if (typeof aiUrgencyConfig !== 'undefined' && aiUrgencyConfig && typeof aiUrgencyConfig === 'object') {
            Object.assign(aiUrgencyConfig, next);
        } else {
            global.aiUrgencyConfig = next;
        }

        if (safeOptions.persist !== false) {
            const persistFn = (typeof saveToStorage === 'function') ? saveToStorage : global.saveToStorage;
            if (typeof persistFn === 'function') persistFn();
        }
        if (safeOptions.recompute !== false) {
            recomputeAiUrgency({ scope: 'all', force: true });
        }
        if (safeOptions.reRender !== false) {
            if (typeof render === 'function') render();
            else if (typeof global.render === 'function') global.render();
            if (typeof renderProjectsList === 'function') renderProjectsList();
            else if (typeof global.renderProjectsList === 'function') global.renderProjectsList();
            if (typeof updateInspector === 'function') updateInspector();
            else if (typeof global.updateInspector === 'function') global.updateInspector();
        }
        return next;
    }

    function setAiUrgencyMode(mode, options) {
        const normalized = String(mode || '').trim().toLowerCase();
        const nextMode = ['shadow', 'system', 'ai', 'blended'].includes(normalized) ? normalized : 'shadow';
        return updateAiUrgencyConfig({ mode: nextMode }, options);
    }

    function getBlendWeightAi(options) {
        const safeOptions = options && typeof options === 'object' ? options : {};
        if (Number.isFinite(Number(safeOptions.blendWeightAi))) {
            return clamp(safeOptions.blendWeightAi, 0, 1);
        }
        const cfg = readAiUrgencyConfig();
        return clamp(cfg.blendWeightAi, 0, 1);
    }

    function parseDueTimestamp(dueDate) {
        const raw = String(dueDate || '').trim();
        if (!raw) return Number.NaN;
        const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (match) {
            const year = Number(match[1]);
            const month = Number(match[2]);
            const day = Number(match[3]);
            return new Date(year, month - 1, day, 23, 59, 59, 999).getTime();
        }
        const parsed = new Date(raw).getTime();
        return Number.isFinite(parsed) ? parsed : Number.NaN;
    }

    function getDueDayDelta(dueDate, nowTs) {
        const dueTs = parseDueTimestamp(dueDate);
        if (!Number.isFinite(dueTs)) return Number.POSITIVE_INFINITY;
        return Math.ceil((dueTs - nowTs) / DAY_MS);
    }

    function isTaskActive(task) {
        return !!(task && !task.completed);
    }

    function safeTaskList() {
        return readNodes();
    }

    function safeArchivedTaskList() {
        return readArchivedNodes();
    }

    function safeProjectList() {
        return readProjects();
    }

    function getTaskById(taskId) {
        const id = String(taskId || '').trim();
        if (!id) return null;
        return safeTaskList().find(task => String(task && task.id || '') === id)
            || safeArchivedTaskList().find(task => String(task && task.id || '') === id)
            || null;
    }

    function getProjectById(projectId) {
        const id = String(projectId || '').trim();
        if (!id) return null;
        return safeProjectList().find(project => String(project && project.id || '') === id) || null;
    }

    function normalizeAiMeta(raw, kind) {
        if (typeof normalizeAiUrgencyRecord === 'function') {
            return normalizeAiUrgencyRecord(raw, kind);
        }
        if (typeof global.normalizeAiUrgencyRecord === 'function') {
            return global.normalizeAiUrgencyRecord(raw, kind);
        }
        const source = raw && typeof raw === 'object' ? raw : {};
        const score = Number.isFinite(Number(source.score)) ? clamp(Math.round(Number(source.score)), 0, 100) : null;
        const level = Number.isFinite(Number(source.level))
            ? clamp(Math.round(Number(source.level)), 1, 5)
            : (score === null ? null : toLevel(score));
        return {
            score,
            level,
            tag: source.tag ? String(source.tag) : (level ? getLevelTag(level) : null),
            label: source.label ? String(source.label) : (level ? getLevelLabel(level) : null),
            confidence: Number.isFinite(Number(source.confidence)) ? clamp(Number(source.confidence), 0, 1) : null,
            reason: typeof source.reason === 'string' ? source.reason : '',
            factors: Array.isArray(source.factors) ? source.factors : [],
            source: source.source ? String(source.source) : 'local-heuristic',
            model: source.model ? String(source.model) : (kind === 'project' ? 'ai-urgency-v1-project' : 'ai-urgency-v1-task'),
            computedAt: Number.isFinite(Number(source.computedAt)) ? Number(source.computedAt) : null,
            expiresAt: Number.isFinite(Number(source.expiresAt)) ? Number(source.expiresAt) : null,
            stale: source.stale !== undefined ? !!source.stale : true
        };
    }

    function normalizeSystemMeta(score, source, reason, confidence) {
        const rounded = clamp(Math.round(Number(score) || 0), 0, 100);
        const level = toLevel(rounded);
        return {
            score: rounded,
            level,
            label: getLevelLabel(level),
            tag: getLevelTag(level),
            source: source || 'system',
            confidence: clamp(Number(confidence) || 1, 0, 1),
            reason: String(reason || ''),
            computedAt: Date.now()
        };
    }

    function applyManualTaskOverrides(task, meta) {
        if (!task || !meta || typeof meta !== 'object') return meta;
        const nextMeta = { ...meta };
        if (task.isManualUrgent) {
            nextMeta.score = 100;
            nextMeta.level = 5;
            nextMeta.tag = 'MANUAL';
            nextMeta.label = 'Manual Urgent';
            nextMeta.reason = nextMeta.reason
                ? `Manual urgent override. ${nextMeta.reason}`
                : 'Manual urgent override.';
        } else if (task.isManualNotUrgent) {
            const adjusted = Math.min(Number(nextMeta.score) || 0, 35);
            const level = toLevel(adjusted);
            nextMeta.score = adjusted;
            nextMeta.level = level;
            nextMeta.tag = 'MANUAL LOW';
            nextMeta.label = 'Manual Not Urgent';
            nextMeta.reason = nextMeta.reason
                ? `Manual not-urgent override. ${nextMeta.reason}`
                : 'Manual not-urgent override.';
        }
        return nextMeta;
    }

    function blendMeta(systemMeta, aiMeta, blendWeightAi) {
        const aiWeight = clamp(blendWeightAi, 0, 1);
        const systemWeight = 1 - aiWeight;
        const score = clamp(
            Math.round(((Number(systemMeta && systemMeta.score) || 0) * systemWeight)
                + ((Number(aiMeta && aiMeta.score) || 0) * aiWeight)),
            0,
            100
        );
        const level = toLevel(score);
        return {
            score,
            level,
            label: getLevelLabel(level),
            tag: getLevelTag(level),
            source: 'blended',
            confidence: clamp(
                ((Number(systemMeta && systemMeta.confidence) || 1) * systemWeight)
                + ((Number(aiMeta && aiMeta.confidence) || 0.5) * aiWeight),
                0,
                1
            ),
            reason: `Blend system(${Math.round(systemWeight * 100)}%) + ai(${Math.round(aiWeight * 100)}%).`,
            computedAt: Date.now()
        };
    }

    function getTaskSystemUrgencyMeta(taskOrId) {
        const task = (taskOrId && typeof taskOrId === 'object')
            ? taskOrId
            : getTaskById(taskOrId);
        if (!task) return normalizeSystemMeta(0, 'system', 'Task not found.', 1);
        return normalizeSystemMeta(
            task._urgencyScore,
            'system',
            task._isBlocked ? 'Dependency blocked.' : '',
            1
        );
    }

    function getTaskAiUrgencyMeta(taskOrId) {
        const task = (taskOrId && typeof taskOrId === 'object')
            ? taskOrId
            : getTaskById(taskOrId);
        if (!task) {
            return normalizeAiMeta({
                score: 0,
                level: 1,
                label: getLevelLabel(1),
                tag: getLevelTag(1),
                confidence: 0,
                reason: 'Task not found.',
                source: 'local-heuristic',
                stale: true
            }, 'task');
        }
        return normalizeAiMeta(task.aiUrgency, 'task');
    }

    function getTaskUrgencyMeta(taskId, options) {
        const task = getTaskById(taskId);
        if (!task) return normalizeSystemMeta(0, 'system', 'Task not found.', 1);
        const mode = normalizeMode(options);
        const systemMeta = getTaskSystemUrgencyMeta(task);
        const aiMeta = getTaskAiUrgencyMeta(task);

        if (mode === 'ai') return applyManualTaskOverrides(task, {
            ...aiMeta,
            source: aiMeta.source || 'ai'
        });
        if (mode === 'blended') {
            const blended = blendMeta(systemMeta, aiMeta, getBlendWeightAi(options));
            return applyManualTaskOverrides(task, blended);
        }
        return applyManualTaskOverrides(task, systemMeta);
    }

    function getProjectAiUrgencyMeta(projectId) {
        const project = getProjectById(projectId);
        if (!project) {
            return normalizeAiMeta({
                score: 0,
                level: 1,
                label: getLevelLabel(1),
                tag: getLevelTag(1),
                confidence: 0,
                reason: 'Project not found.',
                source: 'local-heuristic',
                stale: true
            }, 'project');
        }
        return normalizeAiMeta(project.aiUrgency, 'project');
    }

    function resolveProjectUrgencyMeta(projectId, systemMeta, options) {
        const mode = normalizeMode(options);
        const system = systemMeta && typeof systemMeta === 'object'
            ? {
                score: clamp(Math.round(Number(systemMeta.score) || 0), 0, 100),
                level: clamp(Math.round(Number(systemMeta.level) || toLevel(systemMeta.score)), 1, 5),
                label: String(systemMeta.label || ''),
                tag: String(systemMeta.tag || ''),
                source: 'system',
                confidence: 1,
                reason: String(systemMeta.reason || ''),
                computedAt: Date.now()
            }
            : normalizeSystemMeta(0, 'system', '', 1);
        const aiMeta = getProjectAiUrgencyMeta(projectId);

        if (mode === 'ai') {
            return {
                score: clamp(Math.round(Number(aiMeta.score) || 0), 0, 100),
                level: clamp(Math.round(Number(aiMeta.level) || toLevel(aiMeta.score)), 1, 5),
                label: aiMeta.label || getLevelLabel(clamp(Math.round(Number(aiMeta.level) || 1), 1, 5)),
                tag: aiMeta.tag || getLevelTag(clamp(Math.round(Number(aiMeta.level) || 1), 1, 5)),
                source: aiMeta.source || 'ai',
                confidence: clamp(Number(aiMeta.confidence) || 0.5, 0, 1),
                reason: String(aiMeta.reason || ''),
                computedAt: Number(aiMeta.computedAt) || Date.now()
            };
        }
        if (mode === 'blended') return blendMeta(system, aiMeta, getBlendWeightAi(options));
        return system;
    }

    function getTaskLastActivityTs(task) {
        if (!task || typeof task !== 'object') return 0;
        let maxTs = 0;
        const checkAndSet = (value) => {
            const ts = Number(value);
            if (Number.isFinite(ts) && ts > maxTs) maxTs = ts;
        };
        checkAndSet(task.updatedAt);
        checkAndSet(task.createdAt);
        checkAndSet(task.completedDate);
        if (Array.isArray(task.checkIns)) {
            task.checkIns.forEach(checkAndSet);
        }
        if (Array.isArray(task.timeLogs)) {
            task.timeLogs.forEach(log => {
                checkAndSet(log && log.start);
                checkAndSet(log && log.end);
            });
        }
        return maxTs || 0;
    }

    function buildTaskAiMeta(task, projectContext, nowTs, staleAfterMs, opts) {
        const safeTask = task || {};
        const dueDayDelta = getDueDayDelta(safeTask.dueDate, nowTs);
        let duePoints = 5;
        if (Number.isFinite(dueDayDelta)) {
            if (dueDayDelta <= 0) duePoints = 35;
            else if (dueDayDelta === 1) duePoints = 30;
            else if (dueDayDelta <= 3) duePoints = 26;
            else if (dueDayDelta <= 7) duePoints = 20;
            else if (dueDayDelta <= 14) duePoints = 14;
            else duePoints = 8;
        }

        const slack = Number(safeTask._slack);
        let pathPoints = 2;
        if (Number.isFinite(slack)) {
            if (slack <= 0) pathPoints = 20;
            else if (slack === 1) pathPoints = 16;
            else if (slack <= 3) pathPoints = 12;
            else if (slack <= 7) pathPoints = 7;
            else pathPoints = 2;
        }

        const downstreamWeight = Math.max(0, Number(safeTask._downstreamWeight) || 0);
        const dependencyPoints = Math.min(15, downstreamWeight * 3) + (safeTask._isBlocked ? 5 : 0);

        const lastActivityTs = getTaskLastActivityTs(safeTask);
        const staleDays = lastActivityTs > 0 ? Math.floor((nowTs - lastActivityTs) / DAY_MS) : Number.POSITIVE_INFINITY;
        let stalenessPoints = 1;
        if (staleDays >= 14) stalenessPoints = 10;
        else if (staleDays >= 7) stalenessPoints = 7;
        else if (staleDays >= 3) stalenessPoints = 4;

        const duration = Math.max(0, Number(safeTask.duration) || 0);
        const dayWindow = Number.isFinite(dueDayDelta)
            ? Math.max(1, dueDayDelta + 1)
            : 14;
        const effortRatio = duration / dayWindow;
        let effortPoints = 1;
        if (effortRatio >= 2) effortPoints = 10;
        else if (effortRatio >= 1) effortPoints = 7;
        else if (effortRatio >= 0.5) effortPoints = 4;

        const linkedProjectId = String(safeTask.projectId || '').trim();
        const projectInfo = projectContext && linkedProjectId
            ? projectContext[linkedProjectId]
            : null;
        const linkedProjectScore = Number(projectInfo && projectInfo.score) || 0;
        let projectLiftPoints = 0;
        if (linkedProjectScore >= 80) projectLiftPoints = 5;
        else if (linkedProjectScore >= 65) projectLiftPoints = 3;
        else if (linkedProjectScore >= 50) projectLiftPoints = 2;

        const score = clamp(
            Math.round(duePoints + pathPoints + dependencyPoints + stalenessPoints + effortPoints + projectLiftPoints),
            0,
            100
        );
        const level = toLevel(score);

        const hasDueDate = !!String(safeTask.dueDate || '').trim();
        const hasDependencies = (Array.isArray(safeTask.dependencies) && safeTask.dependencies.length > 0) || downstreamWeight > 0;
        const hasActivity = lastActivityTs > 0;
        const hasDuration = Number.isFinite(Number(safeTask.duration)) && Number(safeTask.duration) > 0;
        const hasProjectCluster = Number(projectInfo && projectInfo.activeCount) >= 2;
        const confidence = clamp(
            0.35
            + (hasDueDate ? 0.20 : 0)
            + (hasDependencies ? 0.15 : 0)
            + (hasActivity ? 0.10 : 0)
            + (hasDuration ? 0.10 : 0)
            + (hasProjectCluster ? 0.10 : 0),
            0.30,
            0.95
        );

        const fragments = [];
        if (Number.isFinite(dueDayDelta)) {
            if (dueDayDelta < 0) fragments.push(`${Math.abs(dueDayDelta)}d overdue`);
            else if (dueDayDelta === 0) fragments.push('due today');
            else fragments.push(`due in ${dueDayDelta}d`);
        }
        if (safeTask._isBlocked) fragments.push('blocked');
        if (downstreamWeight > 0) fragments.push(`impacts ${downstreamWeight} downstream`);
        if (projectLiftPoints > 0) fragments.push('project risk lift');
        if (fragments.length === 0) fragments.push('limited urgency evidence');

        return {
            score,
            level,
            tag: getLevelTag(level),
            label: getLevelLabel(level),
            confidence,
            reason: fragments.join(', '),
            factors: [
                { key: 'due_pressure', points: duePoints },
                { key: 'critical_path_pressure', points: pathPoints },
                { key: 'dependency_impact', points: dependencyPoints },
                { key: 'staleness', points: stalenessPoints },
                { key: 'effort_risk', points: effortPoints },
                { key: 'project_risk_lift', points: projectLiftPoints }
            ],
            source: opts && opts.source ? opts.source : 'local-heuristic',
            model: opts && opts.model ? opts.model : 'ai-urgency-v1-task',
            computedAt: nowTs,
            expiresAt: nowTs + staleAfterMs,
            stale: false
        };
    }

    function percentile75(values) {
        if (!Array.isArray(values) || values.length === 0) return 0;
        const sorted = [...values].sort((a, b) => a - b);
        const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.75) - 1);
        return Number(sorted[index]) || 0;
    }

    function buildProjectAiMeta(projectId, taskList, taskMetaMap, nowTs, staleAfterMs, opts) {
        const activeTasks = taskList.filter(task => String(task && task.projectId || '') === projectId && isTaskActive(task));
        if (activeTasks.length === 0) {
            return {
                score: 0,
                level: 1,
                tag: getLevelTag(1),
                label: getLevelLabel(1),
                confidence: 0.30,
                reason: 'No active tasks.',
                factors: [],
                source: opts && opts.source ? opts.source : 'local-heuristic',
                model: opts && opts.model ? opts.model : 'ai-urgency-v1-project',
                computedAt: nowTs,
                expiresAt: nowTs + staleAfterMs,
                stale: false
            };
        }

        const projectDoneCount = taskList.filter(task => String(task && task.projectId || '') === projectId && !!task.completed).length
            + safeArchivedTaskList().filter(task => String(task && task.projectId || '') === projectId).length;
        const scores = activeTasks.map(task => Number(taskMetaMap[task.id] && taskMetaMap[task.id].score) || 0);
        const maxTask = Math.max(0, ...scores);
        const p75Task = percentile75(scores);

        let overdueCount = 0;
        let blockedCount = 0;
        let dueSoonCount = 0;
        activeTasks.forEach((task) => {
            const dueDelta = getDueDayDelta(task.dueDate, nowTs);
            if (Number.isFinite(dueDelta) && dueDelta < 0) overdueCount += 1;
            if (Number.isFinite(dueDelta) && dueDelta <= 3) dueSoonCount += 1;
            if (task._isBlocked) blockedCount += 1;
        });

        const activeCount = activeTasks.length;
        const overduePct = (overdueCount / activeCount) * 100;
        const blockedPct = (blockedCount / activeCount) * 100;
        const dueSoonPct = (dueSoonCount / activeCount) * 100;
        const openLoadPct = (activeCount / Math.max(1, activeCount + projectDoneCount)) * 100;

        const score = clamp(
            Math.round(
                (maxTask * 0.35)
                + (p75Task * 0.20)
                + (overduePct * 0.20)
                + (blockedPct * 0.15)
                + (dueSoonPct * 0.05)
                + (openLoadPct * 0.05)
            ),
            0,
            100
        );
        const level = toLevel(score);

        const dueSignal = activeTasks.some(task => !!String(task && task.dueDate || '').trim()) ? 0.15 : 0;
        const dependencyCoverage = activeTasks.filter(task =>
            (Array.isArray(task.dependencies) && task.dependencies.length > 0) || Number(task._downstreamWeight) > 0
        ).length / Math.max(1, activeCount);
        const depSignal = dependencyCoverage >= 0.40 ? 0.15 : 0;
        const activityCoverage = activeTasks.filter(task => getTaskLastActivityTs(task) > 0).length / Math.max(1, activeCount);
        const activitySignal = activityCoverage >= 0.40 ? 0.10 : 0;
        const activeVolume = activeCount >= 5 ? 0.20 : 0;
        const confidence = clamp(0.40 + activeVolume + dueSignal + depSignal + activitySignal, 0.30, 0.95);

        const reasonBits = [
            `max task ${Math.round(maxTask)}`,
            `${overdueCount} overdue`,
            `${blockedCount} blocked`,
            `${dueSoonCount} due soon`
        ];

        return {
            score,
            level,
            tag: getLevelTag(level),
            label: getLevelLabel(level),
            confidence,
            reason: reasonBits.join(' • '),
            factors: [
                { key: 'max_task', value: Math.round(maxTask) },
                { key: 'p75_task', value: Math.round(p75Task) },
                { key: 'overdue_pct', value: Math.round(overduePct) },
                { key: 'blocked_pct', value: Math.round(blockedPct) },
                { key: 'due_soon_pct', value: Math.round(dueSoonPct) },
                { key: 'open_load_pct', value: Math.round(openLoadPct) }
            ],
            source: opts && opts.source ? opts.source : 'local-heuristic',
            model: opts && opts.model ? opts.model : 'ai-urgency-v1-project',
            computedAt: nowTs,
            expiresAt: nowTs + staleAfterMs,
            stale: false
        };
    }

    function markCompletedTaskAiUrgency(task, nowTs, staleAfterMs) {
        if (!task || typeof task !== 'object') return;
        task.aiUrgency = normalizeAiMeta({
            score: 0,
            level: 1,
            tag: getLevelTag(1),
            label: getLevelLabel(1),
            confidence: 1,
            reason: 'Task completed.',
            factors: [],
            source: 'local-heuristic',
            model: 'ai-urgency-v1-task',
            computedAt: nowTs,
            expiresAt: nowTs + staleAfterMs,
            stale: false
        }, 'task');
    }

    function buildProjectContext(taskList, taskMetaMap) {
        const context = {};
        taskList.forEach(task => {
            if (!task || task.completed) return;
            const projectId = String(task.projectId || '').trim();
            if (!projectId) return;
            if (!context[projectId]) context[projectId] = { score: 0, activeCount: 0 };
            context[projectId].activeCount += 1;
            const taskMeta = taskMetaMap[task.id];
            if (taskMeta) context[projectId].score = Math.max(context[projectId].score, Number(taskMeta.score) || 0);
        });
        return context;
    }

    function recomputeAiUrgency(options) {
        const safeOptions = options && typeof options === 'object' ? options : {};
        const config = readAiUrgencyConfig();
        if (config.enabled === false && safeOptions.force !== true) {
            return { skipped: true, reason: 'disabled', tasksUpdated: 0, projectsUpdated: 0 };
        }

        const nowTs = Date.now();
        const staleHours = Math.max(1, Number(config.staleAfterHours) || 24);
        const staleAfterMs = staleHours * 60 * 60 * 1000;
        const taskList = safeTaskList();
        const projectList = safeProjectList();

        const baseTaskMetaMap = {};
        const finalTaskMetaMap = {};
        taskList.forEach(task => {
            if (!task || !task.id) return;
            if (!isTaskActive(task)) return;
            baseTaskMetaMap[task.id] = buildTaskAiMeta(task, null, nowTs, staleAfterMs, {
                source: 'local-heuristic',
                model: 'ai-urgency-v1-task'
            });
        });

        const baseProjectContext = buildProjectContext(taskList, baseTaskMetaMap);
        taskList.forEach(task => {
            if (!task || !task.id || !isTaskActive(task)) return;
            finalTaskMetaMap[task.id] = buildTaskAiMeta(task, baseProjectContext, nowTs, staleAfterMs, {
                source: 'local-heuristic',
                model: 'ai-urgency-v1-task'
            });
        });

        let tasksUpdated = 0;
        taskList.forEach(task => {
            if (!task || !task.id) return;
            if (isTaskActive(task)) {
                task.aiUrgency = normalizeAiMeta(finalTaskMetaMap[task.id], 'task');
                tasksUpdated += 1;
            } else {
                markCompletedTaskAiUrgency(task, nowTs, staleAfterMs);
            }
        });

        let projectsUpdated = 0;
        projectList.forEach(project => {
            if (!project || !project.id) return;
            const meta = buildProjectAiMeta(project.id, taskList, finalTaskMetaMap, nowTs, staleAfterMs, {
                source: 'local-heuristic',
                model: 'ai-urgency-v1-project'
            });
            project.aiUrgency = normalizeAiMeta(meta, 'project');
            projectsUpdated += 1;
        });

        return {
            skipped: false,
            tasksUpdated,
            projectsUpdated,
            computedAt: nowTs
        };
    }

    const SEMANTIC_RUBRIC_VERSION = 'ai-urgency-semantic-v1';
    const SEMANTIC_SYSTEM_PROMPT = [
        'You are a strict urgency scoring engine. Score task urgency from semantics only using the provided rubric.',
        '',
        'Rules:',
        '1) Use only provided text/context. No outside knowledge.',
        '2) Do not use emotional tone as evidence.',
        '3) Assign points only when direct evidence exists.',
        '4) Apply penalties, caps, floors, and confidence math exactly.',
        '5) Return valid JSON only. No markdown, no prose outside JSON.',
        '6) If evidence is weak or ambiguous, lower confidence and set needs_human_review true.'
    ].join('\n');

    function createSemanticTaskPayload(task, project) {
        return {
            task_id: String(task && task.id || ''),
            title: String(task && task.title || ''),
            description: String(task && task.description || ''),
            notes_excerpt: '',
            project_name: String(project && project.name || ''),
            project_description: String(project && project.description || ''),
            context_tags: [],
            created_at: Number(task && task.createdAt) || null,
            updated_at: Number(task && task.updatedAt) || null
        };
    }

    function buildSemanticUserPrompt(task, project) {
        const taskJson = JSON.stringify(createSemanticTaskPayload(task, project), null, 2);
        return [
            `Score this task using rubric version ${SEMANTIC_RUBRIC_VERSION}.`,
            '',
            'Task JSON:',
            taskJson,
            '',
            'Scoring instructions:',
            '- Compute factor scores with exact ranges:',
            '  consequence_severity (0-30),',
            '  time_sensitivity_text (0-25),',
            '  external_commitment (0-20),',
            '  irreversibility_compounding (0-15),',
            '  scope_window_mismatch (0-10).',
            '- Subtract penalties:',
            '  vagueness (0-15),',
            '  speculative (0-10).',
            '- Apply post-rules:',
            '  cap <=60 when no timeline evidence and no commitment evidence;',
            '  cap <=45 for idea-only with no deadline;',
            '  floor >=70 only with explicit legal/compliance/security/safety/payroll/tax/payment risk evidence.',
            '- Compute confidence exactly:',
            '  confidence = clamp(0.30 + deadlineEvidence + impactEvidence + commitmentEvidence + specificityEvidence - ambiguityPenalty, 0.20, 0.95)',
            '  where terms are selected from:',
            '  deadlineEvidence {0.20,0.10,0.00}',
            '  impactEvidence {0.20,0.10,0.00}',
            '  commitmentEvidence {0.15,0.08,0.00}',
            '  specificityEvidence {0.10,0.05,0.00}',
            '  ambiguityPenalty {0.20,0.10,0.00}',
            '',
            'Output JSON with keys:',
            'task_id, score, level, confidence, summary, reason, factor_scores, penalties, assumptions, needs_human_review, model_rubric_version'
        ].join('\n');
    }

    function extractTextFromGeminiResponse(data) {
        try {
            const candidate = data && Array.isArray(data.candidates) ? data.candidates[0] : null;
            const content = candidate && candidate.content ? candidate.content : null;
            const parts = content && Array.isArray(content.parts) ? content.parts : [];
            const textPart = parts.find(part => typeof part.text === 'string');
            return textPart ? textPart.text : '';
        } catch (error) {
            return '';
        }
    }

    function parseJsonObjectFromText(rawText) {
        const text = String(rawText || '').trim()
            .replace(/^```(?:json)?\s*/i, '')
            .replace(/\s*```$/i, '')
            .trim();
        if (!text) return null;
        try {
            return JSON.parse(text);
        } catch (error) {
            const firstBrace = text.indexOf('{');
            const lastBrace = text.lastIndexOf('}');
            if (firstBrace >= 0 && lastBrace > firstBrace) {
                const maybeJson = text.slice(firstBrace, lastBrace + 1);
                try {
                    return JSON.parse(maybeJson);
                } catch (nestedError) {
                    return null;
                }
            }
            return null;
        }
    }

    function normalizeSemanticGeminiResult(taskId, parsed, nowTs, staleAfterMs) {
        const source = parsed && typeof parsed === 'object' ? parsed : {};
        const score = clamp(Math.round(Number(source.score) || 0), 0, 100);
        const level = clamp(Math.round(Number(source.level) || toLevel(score)), 1, 5);
        const confidence = clamp(Number(source.confidence) || 0.3, 0, 0.95);
        const reason = String(source.reason || source.summary || 'Semantic urgency analysis.');
        return normalizeAiMeta({
            score,
            level,
            tag: getLevelTag(level),
            label: getLevelLabel(level),
            confidence,
            reason,
            factors: source.factor_scores && typeof source.factor_scores === 'object'
                ? Object.entries(source.factor_scores).map(([key, value]) => ({
                    key,
                    points: Number(value && value.points) || 0
                }))
                : [],
            source: 'gemini-semantic',
            model: String(source.model_rubric_version || SEMANTIC_RUBRIC_VERSION),
            computedAt: nowTs,
            expiresAt: nowTs + staleAfterMs,
            stale: false,
            task_id: String(taskId || '')
        }, 'task');
    }

    async function scoreTaskSemanticUrgencyWithGemini(task, project, options) {
        const geminiFetch = (typeof fetchGemini === 'function')
            ? fetchGemini
            : global.fetchGemini;
        if (typeof geminiFetch !== 'function') {
            throw new Error('fetchGemini is not available.');
        }
        const key = (typeof geminiApiKey !== 'undefined') ? geminiApiKey : global.geminiApiKey;
        if (!key) {
            throw new Error('Gemini API key is not set.');
        }

        const payload = {
            contents: [
                {
                    role: 'user',
                    parts: [
                        { text: SEMANTIC_SYSTEM_PROMPT },
                        { text: buildSemanticUserPrompt(task, project) }
                    ]
                }
            ],
            generationConfig: {
                temperature: 0,
                topP: 1,
                maxOutputTokens: 700,
                responseMimeType: 'application/json'
            }
        };
        const response = await geminiFetch(payload, 2, 800);
        const text = extractTextFromGeminiResponse(response);
        const parsed = parseJsonObjectFromText(text);
        if (!parsed) throw new Error('Gemini returned non-JSON semantic urgency output.');

        const nowTs = Date.now();
        const cfg = readAiUrgencyConfig();
        const staleAfterMs = Math.max(1, Number(cfg.staleAfterHours) || 24) * 60 * 60 * 1000;
        return normalizeSemanticGeminiResult(task && task.id, parsed, nowTs, staleAfterMs);
    }

    async function recomputeAiUrgencyWithGemini(options) {
        const safeOptions = options && typeof options === 'object' ? options : {};
        const nowTs = Date.now();
        const cfg = readAiUrgencyConfig();
        const staleAfterMs = Math.max(1, Number(cfg.staleAfterHours) || 24) * 60 * 60 * 1000;
        const activeTasks = safeTaskList().filter(task => isTaskActive(task));
        const idsFilter = Array.isArray(safeOptions.taskIds) && safeOptions.taskIds.length > 0
            ? new Set(safeOptions.taskIds.map(id => String(id || '').trim()).filter(Boolean))
            : null;

        const candidateTasks = idsFilter
            ? activeTasks.filter(task => idsFilter.has(String(task.id || '')))
            : activeTasks;

        const maxTasks = Math.max(1, Math.min(50, Number(safeOptions.maxTasks) || 10));
        const selected = candidateTasks.slice(0, maxTasks);
        let tasksUpdated = 0;

        for (const task of selected) {
            const project = getProjectById(task.projectId);
            try {
                const aiMeta = await scoreTaskSemanticUrgencyWithGemini(task, project, safeOptions);
                task.aiUrgency = normalizeAiMeta(aiMeta, 'task');
                tasksUpdated += 1;
            } catch (error) {
                const fallback = normalizeAiMeta({
                    score: 0,
                    level: 1,
                    tag: getLevelTag(1),
                    label: getLevelLabel(1),
                    confidence: 0.2,
                    reason: `Gemini semantic scoring failed: ${error.message}`,
                    factors: [],
                    source: 'gemini-semantic',
                    model: SEMANTIC_RUBRIC_VERSION,
                    computedAt: nowTs,
                    expiresAt: nowTs + staleAfterMs,
                    stale: true
                }, 'task');
                task.aiUrgency = fallback;
            }
        }

        const taskMetaMap = {};
        activeTasks.forEach(task => {
            taskMetaMap[task.id] = normalizeAiMeta(task.aiUrgency, 'task');
        });
        safeProjectList().forEach(project => {
            const meta = buildProjectAiMeta(project.id, safeTaskList(), taskMetaMap, nowTs, staleAfterMs, {
                source: 'gemini-semantic',
                model: 'ai-urgency-v1-project'
            });
            project.aiUrgency = normalizeAiMeta(meta, 'project');
        });

        const persistFn = (typeof saveToStorage === 'function') ? saveToStorage : global.saveToStorage;
        if (safeOptions.persist !== false && typeof persistFn === 'function') {
            persistFn();
        }
        return {
            tasksUpdated,
            projectsUpdated: safeProjectList().length,
            computedAt: nowTs,
            source: 'gemini-semantic'
        };
    }

    global.getTaskSystemUrgencyMeta = getTaskSystemUrgencyMeta;
    global.getTaskAiUrgencyMeta = getTaskAiUrgencyMeta;
    global.getTaskUrgencyMeta = getTaskUrgencyMeta;
    global.getProjectAiUrgencyMeta = getProjectAiUrgencyMeta;
    global.resolveProjectUrgencyMeta = resolveProjectUrgencyMeta;
    global.recomputeAiUrgency = recomputeAiUrgency;
    global.recomputeAiUrgencyWithGemini = recomputeAiUrgencyWithGemini;
    global.updateAiUrgencyConfig = updateAiUrgencyConfig;
    global.setAiUrgencyMode = setAiUrgencyMode;
})(window);
