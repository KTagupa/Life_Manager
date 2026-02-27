// Shared dependency-aware task layout utility.
// Reused by main canvas declutter and project workflow visualizations.

const TASK_LAYOUT_DEFAULTS = Object.freeze({
    activeStartX: 400,
    startY: 100,
    colGap: 280,
    rowGap: 180,
    componentGap: 120,
    timeScale: 15,
    nodeWidth: 200,
    nodeHeight: 124,
    completedPredecessorRank: -1,
    completedTerminalRank: -2
});

function getDependencyTaskId(dep) {
    if (typeof dep === 'string' || typeof dep === 'number') {
        return String(dep).trim();
    }
    if (!dep || typeof dep !== 'object') return '';
    return String(dep.id || dep.taskId || dep.nodeId || dep.parentId || dep.depId || '').trim();
}

function getDependencyType(dep) {
    const raw = String(dep && dep.type || '').trim().toLowerCase();
    return raw === 'soft' ? 'soft' : 'hard';
}

function getTaskDueTimestamp(task) {
    if (!task || !task.dueDate) return Number.POSITIVE_INFINITY;
    const value = new Date(task.dueDate).getTime();
    return Number.isFinite(value) ? value : Number.POSITIVE_INFINITY;
}

function sanitizeLayoutNumber(value, fallback) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function sanitizePositiveLayoutNumber(value, fallback) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function clampLayoutUrgencyScore(value) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return 0;
    if (parsed < 0) return 0;
    if (parsed > 100) return 100;
    return Math.round(parsed);
}

function normalizeLayoutUrgencyMode(mode) {
    const normalized = String(mode || '').trim().toLowerCase();
    return ['system', 'ai', 'blended'].includes(normalized) ? normalized : '';
}

function computeDependencyAwareTaskLayout(taskList, options = {}) {
    const safeOptions = (options && typeof options === 'object') ? options : {};
    const settings = {
        activeStartX: sanitizeLayoutNumber(safeOptions.activeStartX, TASK_LAYOUT_DEFAULTS.activeStartX),
        startY: sanitizeLayoutNumber(safeOptions.startY, TASK_LAYOUT_DEFAULTS.startY),
        colGap: sanitizePositiveLayoutNumber(safeOptions.colGap, TASK_LAYOUT_DEFAULTS.colGap),
        rowGap: sanitizePositiveLayoutNumber(safeOptions.rowGap, TASK_LAYOUT_DEFAULTS.rowGap),
        componentGap: sanitizePositiveLayoutNumber(safeOptions.componentGap, TASK_LAYOUT_DEFAULTS.componentGap),
        timeScale: sanitizePositiveLayoutNumber(safeOptions.timeScale, TASK_LAYOUT_DEFAULTS.timeScale),
        nodeWidth: sanitizePositiveLayoutNumber(safeOptions.nodeWidth, TASK_LAYOUT_DEFAULTS.nodeWidth),
        nodeHeight: sanitizePositiveLayoutNumber(safeOptions.nodeHeight, TASK_LAYOUT_DEFAULTS.nodeHeight),
        completedPredecessorRank: sanitizeLayoutNumber(
            safeOptions.completedPredecessorRank,
            TASK_LAYOUT_DEFAULTS.completedPredecessorRank
        ),
        completedTerminalRank: sanitizeLayoutNumber(
            safeOptions.completedTerminalRank,
            TASK_LAYOUT_DEFAULTS.completedTerminalRank
        )
    };
    const requestedUrgencyMode = normalizeLayoutUrgencyMode(safeOptions.urgencyMode);
    const urgencyScoreCache = new Map();

    const uniqueById = new Map();
    (Array.isArray(taskList) ? taskList : []).forEach((task) => {
        if (!task || typeof task !== 'object') return;
        const id = String(task.id || '').trim();
        if (!id) return;
        uniqueById.set(id, task);
    });

    if (uniqueById.size === 0) {
        return {
            positions: {},
            orderedIds: [],
            bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 },
            components: []
        };
    }

    const outgoing = new Map();
    const incoming = new Map();
    uniqueById.forEach((_task, id) => {
        outgoing.set(id, new Set());
        incoming.set(id, new Set());
    });

    uniqueById.forEach((task, taskId) => {
        (Array.isArray(task.dependencies) ? task.dependencies : []).forEach((dep) => {
            const depId = getDependencyTaskId(dep);
            if (!depId || depId === taskId || !uniqueById.has(depId)) return;
            outgoing.get(depId).add(taskId);
            incoming.get(taskId).add(depId);
        });
    });

    function getTaskLayoutUrgencyScore(task) {
        if (!task || typeof task !== 'object') return 0;
        const taskId = String(task.id || '').trim();
        if (taskId && urgencyScoreCache.has(taskId)) {
            return urgencyScoreCache.get(taskId);
        }

        let score = Number.NaN;
        if (typeof getTaskUrgencyMeta === 'function' && taskId) {
            try {
                const meta = requestedUrgencyMode
                    ? getTaskUrgencyMeta(taskId, { mode: requestedUrgencyMode })
                    : getTaskUrgencyMeta(taskId);
                score = Number(meta && meta.score);
            } catch (_error) {
                score = Number.NaN;
            }
        }

        if (!Number.isFinite(score)) {
            if (task.isManualUrgent) score = 100;
            else if (task.isManualNotUrgent) score = 20;
            else if (Number.isFinite(Number(task._urgencyScore))) score = Number(task._urgencyScore);
            else if (task.isAutoUrgent || task._isUrgent) score = 70;
            else score = 0;
        }

        const normalizedScore = clampLayoutUrgencyScore(score);
        if (taskId) urgencyScoreCache.set(taskId, normalizedScore);
        return normalizedScore;
    }

    const visited = new Set();
    const components = [];
    uniqueById.forEach((_task, startId) => {
        if (visited.has(startId)) return;

        const componentIds = [];
        const queue = [startId];
        const localSeen = new Set([startId]);

        while (queue.length > 0) {
            const id = queue.shift();
            if (visited.has(id)) continue;
            visited.add(id);
            componentIds.push(id);

            const neighbors = new Set([
                ...Array.from(incoming.get(id) || []),
                ...Array.from(outgoing.get(id) || [])
            ]);

            neighbors.forEach((neighborId) => {
                if (localSeen.has(neighborId)) return;
                localSeen.add(neighborId);
                queue.push(neighborId);
            });
        }

        const componentTasks = componentIds
            .map(id => uniqueById.get(id))
            .filter(Boolean);
        if (componentTasks.length > 0) components.push(componentTasks);
    });

    components.sort((a, b) => {
        const getUrgency = (group) => Math.max(...group.map(getTaskLayoutUrgencyScore));
        const getMinDate = (group) => Math.min(...group.map(getTaskDueTimestamp));

        const urgencyA = getUrgency(a);
        const urgencyB = getUrgency(b);
        if (urgencyA !== urgencyB) return urgencyB - urgencyA;

        const dateA = getMinDate(a);
        const dateB = getMinDate(b);
        if (dateA !== dateB) return dateA - dateB;

        return b.length - a.length;
    });

    const positions = {};
    const orderedIds = [];
    const componentSummaries = [];
    const assignedY = new Map();

    let currentY = settings.startY;
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;

    components.forEach((componentTasks, componentIndex) => {
        const componentById = new Map(componentTasks.map(task => [String(task.id).trim(), task]));
        const memoRank = new Map();
        const nodeRanks = new Map();
        const componentIdSet = new Set(componentById.keys());

        function getParentEntriesInComponent(task) {
            const taskId = String(task.id || '').trim();
            if (!taskId) return [];
            const entries = [];
            const seen = new Set();
            (Array.isArray(task.dependencies) ? task.dependencies : []).forEach((dep) => {
                const depId = getDependencyTaskId(dep);
                if (!depId || depId === taskId || !componentIdSet.has(depId) || seen.has(depId)) return;
                seen.add(depId);
                entries.push({
                    depId,
                    type: getDependencyType(dep)
                });
            });
            return entries;
        }

        function getLogicalRank(taskId) {
            if (memoRank.has(taskId)) return memoRank.get(taskId);
            const task = componentById.get(taskId);
            if (!task) return 0;

            const activeHardParents = getParentEntriesInComponent(task)
                .filter(entry => entry.type === 'hard')
                .map(entry => componentById.get(entry.depId))
                .filter(parentTask => parentTask && !parentTask.completed);

            if (task.completed || activeHardParents.length === 0) {
                memoRank.set(taskId, 0);
                return 0;
            }

            let maxParentRank = -1;
            activeHardParents.forEach((parentTask) => {
                const parentId = String(parentTask.id || '').trim();
                if (!parentId) return;
                maxParentRank = Math.max(maxParentRank, getLogicalRank(parentId));
            });

            const rank = maxParentRank + 1;
            memoRank.set(taskId, rank);
            return rank;
        }

        componentById.forEach((_task, taskId) => {
            getLogicalRank(taskId);
        });

        componentById.forEach((task, taskId) => {
            let rank = memoRank.get(taskId);
            if (task.completed) {
                const hasActiveSuccessor = Array.from(outgoing.get(taskId) || []).some((childId) => {
                    if (!componentIdSet.has(childId)) return false;
                    const child = componentById.get(childId);
                    return !!child && !child.completed;
                });
                rank = hasActiveSuccessor
                    ? settings.completedPredecessorRank
                    : settings.completedTerminalRank;
            }
            nodeRanks.set(taskId, rank);
        });

        const rankGroups = new Map();
        componentById.forEach((task, taskId) => {
            const rank = nodeRanks.get(taskId);
            if (!rankGroups.has(rank)) rankGroups.set(rank, []);
            rankGroups.get(rank).push(task);
        });

        rankGroups.forEach((taskListForRank) => {
            taskListForRank.sort((a, b) => {
                const urgencyA = getTaskLayoutUrgencyScore(a);
                const urgencyB = getTaskLayoutUrgencyScore(b);
                if (urgencyA !== urgencyB) return urgencyB - urgencyA;
                const dueA = getTaskDueTimestamp(a);
                const dueB = getTaskDueTimestamp(b);
                if (dueA !== dueB) return dueA - dueB;
                const titleA = String(a.title || '');
                const titleB = String(b.title || '');
                const titleCompare = titleA.localeCompare(titleB, undefined, { sensitivity: 'base' });
                if (titleCompare !== 0) return titleCompare;
                return String(a.id).localeCompare(String(b.id));
            });
        });

        const activeNodesWithDates = componentTasks.filter(task => !task.completed && Number.isFinite(getTaskDueTimestamp(task)));
        const minDue = activeNodesWithDates.length > 0
            ? Math.min(...activeNodesWithDates.map(getTaskDueTimestamp))
            : Number.NaN;

        let maxNodesInRank = 0;
        const sortedRanks = Array.from(rankGroups.keys()).sort((a, b) => a - b);

        sortedRanks.forEach((rank) => {
            const tasksForRank = rankGroups.get(rank) || [];
            maxNodesInRank = Math.max(maxNodesInRank, tasksForRank.length);
            const usedYsInRank = [];

            tasksForRank.forEach((task, index) => {
                const taskId = String(task.id || '').trim();
                if (!taskId) return;

                let x = settings.activeStartX + (rank * settings.colGap);
                if (rank >= 0 && task.dueDate && !Number.isNaN(minDue)) {
                    const diff = getTaskDueTimestamp(task) - minDue;
                    const days = diff / 86400000;
                    if (days > 0) {
                        x += Math.min(settings.colGap * 0.4, days * settings.timeScale);
                    }
                }

                let y = currentY + (index * settings.rowGap);
                if (rank >= 0) {
                    const parentEntries = getParentEntriesInComponent(task)
                        .filter(entry => assignedY.has(entry.depId));
                    if (parentEntries.length > 0) {
                        const hardParentYs = parentEntries
                            .filter(entry => entry.type === 'hard')
                            .map(entry => assignedY.get(entry.depId));
                        const anchorYs = hardParentYs.length > 0
                            ? hardParentYs
                            : parentEntries.map(entry => assignedY.get(entry.depId));

                        if (anchorYs.length === 1) y = anchorYs[0];
                        else if (anchorYs.length > 1) y = Math.min(...anchorYs);
                    }
                }

                while (usedYsInRank.some(usedY => Math.abs(usedY - y) < settings.rowGap)) {
                    y += settings.rowGap;
                }
                usedYsInRank.push(y);
                assignedY.set(taskId, y);

                positions[taskId] = { x, y, rank, componentIndex };
                orderedIds.push(taskId);

                minX = Math.min(minX, x);
                minY = Math.min(minY, y);
                maxX = Math.max(maxX, x + settings.nodeWidth);
                maxY = Math.max(maxY, y + settings.nodeHeight);
            });
        });

        componentSummaries.push({
            index: componentIndex,
            taskIds: componentTasks.map(task => String(task.id || '').trim()).filter(Boolean),
            taskCount: componentTasks.length
        });

        currentY += (maxNodesInRank * settings.rowGap) + settings.componentGap;
    });

    if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
        minX = 0;
        minY = 0;
        maxX = 0;
        maxY = 0;
    }

    return {
        positions,
        orderedIds,
        bounds: {
            minX,
            minY,
            maxX,
            maxY,
            width: Math.max(0, maxX - minX),
            height: Math.max(0, maxY - minY)
        },
        components: componentSummaries
    };
}
