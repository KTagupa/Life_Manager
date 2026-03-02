// --- PINNED WINDOW LOGIC ---
let currentNavigatorTab = getSavedNavigatorTab();

function setNavigatorTab(tab = 'pinned') {
    tab = normalizeNavigatorTab(tab);
    currentNavigatorTab = tab;
    try {
        localStorage.setItem(NAVIGATOR_TAB_STORAGE_KEY, tab);
    } catch (error) {
        console.warn('[ui] Failed to persist navigator tab:', error);
    }

    const panel = document.getElementById('navigator-panel');
    if (!panel) return;

    panel.querySelectorAll('.navigator-tab').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.navTab === tab);
    });

    const sections = {
        pinned: document.getElementById('navigator-tab-pinned'),
        tasks: document.getElementById('navigator-tab-tasks'),
        groups: document.getElementById('navigator-tab-groups')
    };

    Object.entries(sections).forEach(([key, el]) => {
        if (!el) return;
        el.classList.toggle('hidden', key !== tab);
    });

    if (tab === 'pinned') renderPinnedWindow();
    else if (tab === 'tasks') renderTaskList();
    else if (tab === 'groups') detectAndRenderNodeGroups();
}

function toggleNavigatorPanel(forceOpen = null, tab = currentNavigatorTab || 'pinned') {
    const panel = document.getElementById('navigator-panel');
    if (!panel) return;

    const shouldOpen = forceOpen === true || (forceOpen === null && panel.classList.contains('hidden'));
    if (shouldOpen) {
        if (typeof closeInsightsDashboard === 'function') closeInsightsDashboard();
        openRightDockPanel('navigator-panel', () => setNavigatorTab(tab));
    } else {
        closeRightDockPanel('navigator-panel');
    }
}

function togglePinnedWindow() {
    const panel = document.getElementById('navigator-panel');
    if (panel && !panel.classList.contains('hidden') && currentNavigatorTab === 'pinned') {
        closeRightDockPanel('navigator-panel');
        return;
    }
    toggleNavigatorPanel(true, 'pinned');
}

let currentTaskFilter = 'all';

function toggleTaskListWindow() {
    const panel = document.getElementById('navigator-panel');
    if (panel && !panel.classList.contains('hidden') && currentNavigatorTab === 'tasks') {
        closeRightDockPanel('navigator-panel');
        return;
    }
    toggleNavigatorPanel(true, 'tasks');
}

function isProjectsPanelVisible() {
    const panel = document.getElementById('projects-panel');
    return !!panel && !panel.classList.contains('hidden');
}

function toggleProjectsPanel(forceOpen = null) {
    const panel = document.getElementById('projects-panel');
    if (!panel) return;

    const shouldOpen = forceOpen === true || (forceOpen === null && panel.classList.contains('hidden'));
    if (shouldOpen) {
        if (typeof closeInsightsDashboard === 'function') closeInsightsDashboard();
        openRightDockPanel('projects-panel', () => {
            if (typeof renderProjectsList === 'function') renderProjectsList();
        });
    } else {
        closeRightDockPanel('projects-panel');
    }
}

function setTaskFilter(filter) {
    currentTaskFilter = filter;

    // Update button states
    document.querySelectorAll('.filter-btn').forEach(btn => {
        if (btn.dataset.filter === filter) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    renderTaskList();
}

function renderTaskList() {
    try {
        const container = document.getElementById('task-list-content');
        if (!container) return;
    
        container.innerHTML = '';
    
        // Filter tasks based on current filter
        let filteredTasks = [...nodes];
    
        switch (currentTaskFilter) {
            case 'urgent':
                filteredTasks = filteredTasks.filter(n => n._isUrgent && !n.completed);
                break;
            case 'critical':
                filteredTasks = filteredTasks.filter(n => n._isCritical && !n.completed);
                break;
            case 'ready':
                filteredTasks = filteredTasks.filter(n => n._isReady && !n.completed);
                break;
            case 'blocked':
                filteredTasks = filteredTasks.filter(n => n._isBlocked && !n.completed);
                break;
            case 'completed':
                filteredTasks = [...archivedNodes];
                break;
            case 'all':
            default:
                // Show all active tasks
                filteredTasks = filteredTasks.filter(n => !n.completed);
                break;
        }
    
        // Sort alphabetically
        filteredTasks.sort((a, b) => a.title.localeCompare(b.title));
    
        if (filteredTasks.length === 0) {
            container.innerHTML = '<div style="text-align:center; color:#666; padding:20px; font-size:11px;">No tasks found</div>';
            return;
        }
    
        filteredTasks.forEach(task => {
            const el = document.createElement('div');
            el.className = 'task-list-item';
    
            if (task.completed) el.classList.add('completed');
            else if (task._isUrgent) el.classList.add('urgent');
            else if (task._isCritical) el.classList.add('critical');
    
            let badges = '';
            if (!task.completed) {
                if (task._isUrgent) badges += '<span class="badge urgent-badge">URGENT</span>';
                else if (task._isCritical) badges += '<span class="badge critical-badge">CP</span>';
                if (task._isBlocked) badges += '<span class="badge">🔒</span>';
                if (task._downstreamWeight > 0) badges += `<span class="badge weight">⚡${task._downstreamWeight}</span>`;
            }
    
            if (task.dueDate && !task.completed) {
                const due = new Date(task.dueDate);
                const dateStr = due.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
                badges += `<span class="badge date-badge">📅 ${dateStr}</span>`;
            }
    
            el.innerHTML = `
                        <div style="font-weight:600; margin-bottom:4px;">${task.completed ? '✅' : ''} ${task.title}</div>
                        <div style="display:flex; gap:4px; flex-wrap:wrap;">${badges}</div>
                    `;
    
            el.onclick = () => {
                toggleTaskListWindow();
                jumpToTask(task.id);
            };
    
            container.appendChild(el);
        });
    } catch (error) {
        console.error("Error in renderTaskList:", error);
        if(typeof showNotification === "function") showNotification("Render Error: Check console", "error");
    }
}

const PROJECT_STATUS_LABELS = {
    active: 'Active',
    paused: 'Paused',
    completed: 'Completed',
    archived: 'Archived'
};
const PROJECT_URGENCY_LEVEL_LABELS = {
    1: 'Lowest',
    2: 'Normal',
    3: 'Medium',
    4: 'High',
    5: 'Critical'
};
const PROJECT_URGENCY_LEVEL_TAGS = {
    1: 'LOWEST',
    2: 'NORMAL',
    3: 'MEDIUM',
    4: 'HIGH',
    5: 'CRITICAL'
};
const PROJECTS_PANEL_SORT_STORAGE_KEY = 'urgencyFlow_projects_panel_sort_v1';
const PROJECTS_PANEL_URGENCY_FILTER_STORAGE_KEY = 'urgencyFlow_projects_panel_urgency_filter_v1';
const PROJECT_BOOTSTRAP_RULE_VERSION = 'v1.1';
let projectBootstrapPreviewPlan = null;
let projectDetailsProjectId = null;
let projectDetailsTaskResizeBound = false;
let projectsPanelSelectedProjectId = null;
let projectCardOpenMenuId = null;
let projectCardMenuDismissBound = false;
let projectsPanelListScrollBound = false;
let projectsPanelSortMode = loadProjectsPanelSortMode();
let projectsPanelUrgencyFilter = loadProjectsPanelUrgencyFilter();

function getProjectStatusRank(status) {
    const order = { active: 0, paused: 1, completed: 2, archived: 3 };
    const normalized = String(status || '').trim().toLowerCase();
    return Object.prototype.hasOwnProperty.call(order, normalized) ? order[normalized] : 9;
}

function getTaskById(taskId) {
    if (!taskId) return null;
    return nodes.find(n => n.id === taskId) || archivedNodes.find(n => n.id === taskId) || null;
}

function getProjectById(projectId) {
    if (!projectId || !Array.isArray(projects)) return null;
    return projects.find(project => project && project.id === projectId) || null;
}

function getProjectTaskStats(projectId) {
    const active = nodes.filter(task => task && task.projectId === projectId && !task.completed).length;
    const done = nodes.filter(task => task && task.projectId === projectId && task.completed).length
        + archivedNodes.filter(task => task && task.projectId === projectId).length;
    return {
        active,
        done,
        total: active + done
    };
}

function normalizeProjectsPanelSortMode(value) {
    const normalized = String(value || '').trim().toLowerCase();
    const valid = new Set(['default', 'alpha-asc', 'alpha-desc', 'urgency-desc', 'urgency-asc']);
    return valid.has(normalized) ? normalized : 'default';
}

function normalizeProjectsPanelUrgencyFilter(value) {
    const normalized = String(value || '').trim().toLowerCase();
    const valid = new Set(['all', '1', '2', '3', '4', '5']);
    return valid.has(normalized) ? normalized : 'all';
}

function loadProjectsPanelSortMode() {
    try {
        return normalizeProjectsPanelSortMode(localStorage.getItem(PROJECTS_PANEL_SORT_STORAGE_KEY) || 'default');
    } catch (error) {
        return 'default';
    }
}

function loadProjectsPanelUrgencyFilter() {
    try {
        return normalizeProjectsPanelUrgencyFilter(localStorage.getItem(PROJECTS_PANEL_URGENCY_FILTER_STORAGE_KEY) || 'all');
    } catch (error) {
        return 'all';
    }
}

function setProjectsPanelSort(sortMode) {
    projectsPanelSortMode = normalizeProjectsPanelSortMode(sortMode);
    try {
        localStorage.setItem(PROJECTS_PANEL_SORT_STORAGE_KEY, projectsPanelSortMode);
    } catch (error) {
        console.warn('[projects] Failed to persist sort mode:', error);
    }
    renderProjectsList();
}

function setProjectsPanelUrgencyFilter(filterValue) {
    projectsPanelUrgencyFilter = normalizeProjectsPanelUrgencyFilter(filterValue);
    try {
        localStorage.setItem(PROJECTS_PANEL_URGENCY_FILTER_STORAGE_KEY, projectsPanelUrgencyFilter);
    } catch (error) {
        console.warn('[projects] Failed to persist urgency filter:', error);
    }
    renderProjectsList();
}

function escapeProjectSelectorValue(value) {
    const raw = String(value || '');
    if (typeof CSS !== 'undefined' && CSS && typeof CSS.escape === 'function') {
        return CSS.escape(raw);
    }
    return raw.replace(/["\\]/g, '\\$&');
}

function scrollProjectCardIntoView(projectId, behavior = 'smooth') {
    const normalizedId = String(projectId || '').trim();
    if (!normalizedId) return;

    const container = document.getElementById('project-list-content');
    if (!container) return;

    const selectorId = escapeProjectSelectorValue(normalizedId);
    const card = container.querySelector(`.project-list-item[data-project-id="${selectorId}"]`);
    if (!card || typeof card.scrollIntoView !== 'function') return;
    card.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: behavior });
}

function focusProjectInProjectsPanel(projectId, options = {}) {
    const normalizedId = String(projectId || '').trim();
    if (!normalizedId) return false;

    const project = getProjectById(normalizedId);
    if (!project) {
        if (typeof showNotification === 'function') showNotification('Project not found.');
        return false;
    }

    const safeOptions = (options && typeof options === 'object') ? options : {};
    const hasSortMode = Object.prototype.hasOwnProperty.call(safeOptions, 'sortMode');
    const hasUrgencyFilter = Object.prototype.hasOwnProperty.call(safeOptions, 'urgencyFilter');
    const nextSortMode = hasSortMode
        ? normalizeProjectsPanelSortMode(safeOptions.sortMode)
        : projectsPanelSortMode;
    const nextUrgencyFilter = hasUrgencyFilter
        ? normalizeProjectsPanelUrgencyFilter(safeOptions.urgencyFilter)
        : projectsPanelUrgencyFilter;

    if (hasSortMode && nextSortMode !== projectsPanelSortMode) {
        projectsPanelSortMode = nextSortMode;
        try {
            localStorage.setItem(PROJECTS_PANEL_SORT_STORAGE_KEY, projectsPanelSortMode);
        } catch (error) {
            console.warn('[projects] Failed to persist sort mode:', error);
        }
    }

    if (hasUrgencyFilter && nextUrgencyFilter !== projectsPanelUrgencyFilter) {
        projectsPanelUrgencyFilter = nextUrgencyFilter;
        try {
            localStorage.setItem(PROJECTS_PANEL_URGENCY_FILTER_STORAGE_KEY, projectsPanelUrgencyFilter);
        } catch (error) {
            console.warn('[projects] Failed to persist urgency filter:', error);
        }
    }

    projectsPanelSelectedProjectId = normalizedId;
    closeProjectCardMenus();

    const shouldOpenPanel = safeOptions.openPanel !== false;
    const shouldOpenDetails = !!safeOptions.openDetails;
    const shouldScroll = safeOptions.scrollIntoView !== false;
    const scrollBehavior = (safeOptions.scrollBehavior === 'auto') ? 'auto' : 'smooth';

    const renderAndFocus = () => {
        renderProjectsList();
        if (shouldScroll) scrollProjectCardIntoView(normalizedId, scrollBehavior);
        if (shouldOpenDetails) openProjectDetailsModal(normalizedId);
    };

    if (shouldOpenPanel && typeof openRightDockPanel === 'function') {
        openRightDockPanel('projects-panel', renderAndFocus);
    } else {
        renderAndFocus();
    }

    return true;
}

function setProjectsPanelTopCollapsed(collapsed) {
    const panel = document.getElementById('projects-panel');
    if (!panel) return;
    panel.classList.toggle('is-top-collapsed', !!collapsed);
}

function syncProjectsPanelTopCollapseFromScroll() {
    const list = document.getElementById('project-list-content');
    if (!list) return;
    setProjectsPanelTopCollapsed((Number(list.scrollTop) || 0) > 8);
}

function bindProjectsPanelListScroll() {
    const list = document.getElementById('project-list-content');
    if (!list) return;
    if (projectsPanelListScrollBound) return;
    list.addEventListener('scroll', () => {
        syncProjectsPanelTopCollapseFromScroll();
    }, { passive: true });
    projectsPanelListScrollBound = true;
}

function syncProjectsPanelFilterControls() {
    const sortSelect = document.getElementById('projects-panel-sort');
    if (sortSelect && sortSelect.value !== projectsPanelSortMode) {
        sortSelect.value = projectsPanelSortMode;
    }
    const urgencySelect = document.getElementById('projects-panel-urgency-filter');
    if (urgencySelect && urgencySelect.value !== projectsPanelUrgencyFilter) {
        urgencySelect.value = projectsPanelUrgencyFilter;
    }
}

function parseTaskDueDateTimestamp(dueDate) {
    const raw = String(dueDate || '').trim();
    if (!raw) return Number.NaN;
    const dateMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (dateMatch) {
        const year = Number(dateMatch[1]);
        const month = Number(dateMatch[2]);
        const day = Number(dateMatch[3]);
        const localEndOfDay = new Date(year, month - 1, day, 23, 59, 59, 999);
        return localEndOfDay.getTime();
    }
    const parsed = new Date(raw).getTime();
    return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function getTaskDueDayDelta(dueDate, nowTs = Date.now()) {
    const dueTs = parseTaskDueDateTimestamp(dueDate);
    if (!Number.isFinite(dueTs)) return Number.POSITIVE_INFINITY;
    const dayMs = 24 * 60 * 60 * 1000;
    return Math.ceil((dueTs - nowTs) / dayMs);
}

function scoreTaskForProjectUrgency(task, nowTs = Date.now()) {
    if (!task || task.completed) return 0;

    let score = 0;
    if (task.isManualUrgent) score = Math.max(score, 100);
    if (task._isUrgent) score = Math.max(score, 92);
    else if (task._isCritical) score = Math.max(score, 78);
    else if (task._isBlocked) score = Math.max(score, 44);

    const dueDayDelta = getTaskDueDayDelta(task.dueDate, nowTs);
    if (Number.isFinite(dueDayDelta)) {
        if (dueDayDelta <= 0) score += 40;
        else if (dueDayDelta <= 1) score += 34;
        else if (dueDayDelta <= 3) score += 26;
        else if (dueDayDelta <= 7) score += 18;
        else if (dueDayDelta <= 14) score += 10;
    }

    const downstreamWeight = Math.max(0, Number(task._downstreamWeight) || 0);
    score += Math.min(22, downstreamWeight * 3);

    if (task._isBlocked) score += 14;

    return Math.max(0, Math.min(100, Math.round(score)));
}

function getUrgencyLevelFromScore(score) {
    const numericScore = Math.max(0, Math.min(100, Number(score) || 0));
    if (numericScore >= 86) return 5;
    if (numericScore >= 68) return 4;
    if (numericScore >= 48) return 3;
    if (numericScore >= 26) return 2;
    return 1;
}

function getProjectSystemUrgencyMeta(projectId) {
    const activeTasks = nodes.filter(task => task && task.projectId === projectId && !task.completed);
    if (activeTasks.length === 0) {
        return {
            score: 0,
            level: 1,
            label: PROJECT_URGENCY_LEVEL_LABELS[1],
            tag: PROJECT_URGENCY_LEVEL_TAGS[1]
        };
    }

    const nowTs = Date.now();
    let peakScore = 0;
    let totalScore = 0;
    let overdueCount = 0;
    let blockedCount = 0;
    let urgentCount = 0;
    let criticalCount = 0;

    activeTasks.forEach((task) => {
        const taskScore = scoreTaskForProjectUrgency(task, nowTs);
        peakScore = Math.max(peakScore, taskScore);
        totalScore += taskScore;

        if (task._isBlocked) blockedCount++;
        if (task.isManualUrgent || task._isUrgent) urgentCount++;
        else if (task._isCritical) criticalCount++;

        const dueDayDelta = getTaskDueDayDelta(task.dueDate, nowTs);
        if (Number.isFinite(dueDayDelta) && dueDayDelta < 0) overdueCount++;
    });

    const averageScore = totalScore / activeTasks.length;
    let score = Math.round(
        (peakScore * 0.62)
        + (averageScore * 0.38)
        + Math.min(14, overdueCount * 6)
        + Math.min(10, blockedCount * 3)
        + Math.min(8, urgentCount * 2)
        + Math.min(4, criticalCount)
    );
    score = Math.max(0, Math.min(100, score));

    const level = getUrgencyLevelFromScore(score);
    return {
        score,
        level,
        label: PROJECT_URGENCY_LEVEL_LABELS[level] || 'Lowest',
        tag: PROJECT_URGENCY_LEVEL_TAGS[level] || 'LOWEST'
    };
}

function getProjectUrgencyMeta(projectId, options = {}) {
    const systemMeta = getProjectSystemUrgencyMeta(projectId);
    if (typeof resolveProjectUrgencyMeta === 'function') {
        return resolveProjectUrgencyMeta(projectId, systemMeta, options);
    }
    return systemMeta;
}

function compareProjectsDefault(a, b) {
    const rankDiff = getProjectStatusRank(a && a.status) - getProjectStatusRank(b && b.status);
    if (rankDiff !== 0) return rankDiff;
    const updatedA = Number(a && a.updatedAt) || 0;
    const updatedB = Number(b && b.updatedAt) || 0;
    if (updatedA !== updatedB) return updatedB - updatedA;
    return String(a && a.name || '').localeCompare(String(b && b.name || ''), undefined, { sensitivity: 'base' });
}

function getProjectsPanelVisibleEntries() {
    const allEntries = (Array.isArray(projects) ? projects : [])
        .filter(project => project && project.id)
        .map(project => ({
            project,
            urgency: getProjectUrgencyMeta(project.id)
        }));

    let visibleEntries = [...allEntries];
    if (projectsPanelUrgencyFilter !== 'all') {
        const level = Number(projectsPanelUrgencyFilter) || 0;
        visibleEntries = visibleEntries.filter(entry => Number(entry && entry.urgency && entry.urgency.level) === level);
    }

    const sortMode = normalizeProjectsPanelSortMode(projectsPanelSortMode);
    if (sortMode === 'alpha-asc') {
        visibleEntries.sort((a, b) => {
            const titleDiff = String(a && a.project && a.project.name || '').localeCompare(
                String(b && b.project && b.project.name || ''),
                undefined,
                { sensitivity: 'base' }
            );
            if (titleDiff !== 0) return titleDiff;
            return compareProjectsDefault(a && a.project, b && b.project);
        });
    } else if (sortMode === 'alpha-desc') {
        visibleEntries.sort((a, b) => {
            const titleDiff = String(b && b.project && b.project.name || '').localeCompare(
                String(a && a.project && a.project.name || ''),
                undefined,
                { sensitivity: 'base' }
            );
            if (titleDiff !== 0) return titleDiff;
            return compareProjectsDefault(a && a.project, b && b.project);
        });
    } else if (sortMode === 'urgency-desc') {
        visibleEntries.sort((a, b) => {
            const scoreDiff = (Number(b && b.urgency && b.urgency.score) || 0) - (Number(a && a.urgency && a.urgency.score) || 0);
            if (scoreDiff !== 0) return scoreDiff;
            return compareProjectsDefault(a && a.project, b && b.project);
        });
    } else if (sortMode === 'urgency-asc') {
        visibleEntries.sort((a, b) => {
            const scoreDiff = (Number(a && a.urgency && a.urgency.score) || 0) - (Number(b && b.urgency && b.urgency.score) || 0);
            if (scoreDiff !== 0) return scoreDiff;
            return compareProjectsDefault(a && a.project, b && b.project);
        });
    } else {
        visibleEntries.sort((a, b) => compareProjectsDefault(a && a.project, b && b.project));
    }

    return {
        allEntries,
        visibleEntries
    };
}

function getProjectDetailsNavigationState(projectId = projectDetailsProjectId) {
    const normalizedId = String(projectId || '').trim();
    const { visibleEntries } = getProjectsPanelVisibleEntries();
    const total = visibleEntries.length;
    const index = normalizedId
        ? visibleEntries.findIndex(entry => String(entry && entry.project && entry.project.id || '') === normalizedId)
        : -1;

    const prevId = index > 0
        ? String(visibleEntries[index - 1] && visibleEntries[index - 1].project && visibleEntries[index - 1].project.id || '')
        : null;
    const nextId = (index >= 0 && index < total - 1)
        ? String(visibleEntries[index + 1] && visibleEntries[index + 1].project && visibleEntries[index + 1].project.id || '')
        : null;

    return {
        total,
        index,
        prevId: prevId || null,
        nextId: nextId || null
    };
}

function getUniqueProjectName(baseName, existingLowercaseNames) {
    const names = existingLowercaseNames instanceof Set ? existingLowercaseNames : new Set();
    const fallback = String(baseName || 'Task Group').trim() || 'Task Group';
    const safeBase = fallback.slice(0, 160);
    const normalized = safeBase.toLowerCase();
    if (!names.has(normalized)) {
        names.add(normalized);
        return safeBase;
    }

    let index = 2;
    while (index < 10_000) {
        const suffix = ` (${index})`;
        const maxBaseLength = Math.max(1, 160 - suffix.length);
        const candidate = `${safeBase.slice(0, maxBaseLength)}${suffix}`;
        const key = candidate.toLowerCase();
        if (!names.has(key)) {
            names.add(key);
            return candidate;
        }
        index++;
    }

    const emergency = `${safeBase.slice(0, 145)} ${Date.now()}`;
    names.add(emergency.toLowerCase());
    return emergency;
}

function buildProjectBootstrapPreviewPlan() {
    if (typeof buildTaskGroups !== 'function') return null;
    const groups = buildTaskGroups({ includeSingles: true, sort: 'priority' });
    if (!Array.isArray(groups)) return null;

    const existingNameSet = new Set(
        (Array.isArray(projects) ? projects : [])
            .map(project => String(project && project.name || '').trim().toLowerCase())
            .filter(Boolean)
    );
    const rows = [];
    const summary = {
        createGroups: 0,
        extendGroups: 0,
        skipGroups: 0,
        skippedCompletedOnly: 0,
        skippedAlreadyAssigned: 0,
        skippedMixedProjects: 0,
        groupsWithNoNodes: 0,
        assignableTasks: 0
    };

    groups.forEach((group) => {
        const groupId = String(group && group.id || '').trim();
        const groupTitle = String(group && group.title || '').trim() || 'Task Group';
        const groupNodes = (Array.isArray(group && group.nodes) ? group.nodes : [])
            .filter(node => node && node.id);
        const totalCount = groupNodes.length;

        if (groupNodes.length === 0) {
            rows.push({
                groupId,
                groupTitle,
                totalCount: 0,
                activeCount: 0,
                unassignedCount: 0,
                action: 'skip',
                reasonCode: 'no_nodes',
                reasonText: 'No nodes found in this group.',
                existingProjectId: null,
                existingProjectName: null,
                proposedProjectName: null,
                taskIds: [],
                goalIds: []
            });
            summary.skipGroups++;
            summary.groupsWithNoNodes++;
            return;
        }

        const activeNodes = groupNodes.filter(node => !node.completed);
        const activeCount = activeNodes.length;
        const unassignedNodes = activeNodes.filter(node => !String(node.projectId || '').trim());
        const unassignedCount = unassignedNodes.length;
        const taskIds = unassignedNodes.map(node => node.id);
        const projectIdsInGroup = new Set(
            groupNodes
                .map(node => String(node.projectId || '').trim())
                .filter(Boolean)
        );

        if (activeCount === 0) {
            rows.push({
                groupId,
                groupTitle,
                totalCount,
                activeCount,
                unassignedCount,
                action: 'skip',
                reasonCode: 'completed_only',
                reasonText: 'All tasks in this group are completed.',
                existingProjectId: null,
                existingProjectName: null,
                proposedProjectName: null,
                taskIds: [],
                goalIds: []
            });
            summary.skipGroups++;
            summary.skippedCompletedOnly++;
            return;
        }

        if (unassignedCount === 0) {
            rows.push({
                groupId,
                groupTitle,
                totalCount,
                activeCount,
                unassignedCount,
                action: 'skip',
                reasonCode: 'already_assigned',
                reasonText: 'All active tasks in this group already have project assignments.',
                existingProjectId: null,
                existingProjectName: null,
                proposedProjectName: null,
                taskIds: [],
                goalIds: []
            });
            summary.skipGroups++;
            summary.skippedAlreadyAssigned++;
            return;
        }

        if (projectIdsInGroup.size > 1) {
            rows.push({
                groupId,
                groupTitle,
                totalCount,
                activeCount,
                unassignedCount,
                action: 'skip',
                reasonCode: 'mixed_projects',
                reasonText: 'Group already spans multiple projects. Skipping to avoid remapping.',
                existingProjectId: null,
                existingProjectName: null,
                proposedProjectName: null,
                taskIds: [],
                goalIds: []
            });
            summary.skipGroups++;
            summary.skippedMixedProjects++;
            return;
        }

        const existingProjectId = projectIdsInGroup.size === 1
            ? Array.from(projectIdsInGroup)[0]
            : null;
        const existingProject = existingProjectId ? getProjectById(existingProjectId) : null;

        if (existingProject) {
            rows.push({
                groupId,
                groupTitle,
                totalCount,
                activeCount,
                unassignedCount,
                action: 'extend',
                reasonCode: 'extend_existing',
                reasonText: `Assign unassigned tasks to existing project "${existingProject.name || 'Untitled Project'}".`,
                existingProjectId: existingProject.id,
                existingProjectName: existingProject.name || 'Untitled Project',
                proposedProjectName: null,
                taskIds,
                goalIds: []
            });
            summary.extendGroups++;
            summary.assignableTasks += taskIds.length;
            return;
        }

        const mergedGoalIds = [];
        groupNodes.forEach(node => {
            if (!node || !Array.isArray(node.goalIds)) return;
            node.goalIds.forEach(goalId => mergedGoalIds.push(goalId));
        });
        const goalIds = Array.from(new Set(
            mergedGoalIds
                .map(goalId => String(goalId || '').trim())
                .filter(Boolean)
        ));
        const proposedProjectName = getUniqueProjectName(groupTitle, existingNameSet);
        rows.push({
            groupId,
            groupTitle,
            totalCount,
            activeCount,
            unassignedCount,
            action: 'create',
            reasonCode: 'create_new',
            reasonText: `Create new project "${proposedProjectName}".`,
            existingProjectId: null,
            existingProjectName: null,
            proposedProjectName,
            taskIds,
            goalIds
        });
        summary.createGroups++;
        summary.assignableTasks += taskIds.length;
    });

    return {
        generatedAt: Date.now(),
        groupsTotal: groups.length,
        rows,
        summary
    };
}

function initializeProjectBootstrapPlanSelections(plan) {
    const safePlan = (plan && typeof plan === 'object') ? plan : null;
    if (!safePlan || !Array.isArray(safePlan.rows)) return;
    safePlan.rows.forEach((row) => {
        const action = String(row && row.action || '').trim().toLowerCase();
        const canApply = action === 'create' || action === 'extend';
        row.enabled = canApply;
    });
}

function getProjectBootstrapSelectedSummary(plan) {
    const safePlan = (plan && typeof plan === 'object') ? plan : null;
    const rows = safePlan && Array.isArray(safePlan.rows) ? safePlan.rows : [];
    const summary = {
        createGroups: 0,
        extendGroups: 0,
        skipGroups: 0,
        assignableTasks: 0
    };

    rows.forEach((row) => {
        const action = String(row && row.action || '').trim().toLowerCase();
        const canApply = action === 'create' || action === 'extend';
        const isEnabled = canApply && row.enabled !== false;
        if (!isEnabled) {
            summary.skipGroups++;
            return;
        }

        if (action === 'create') summary.createGroups++;
        else if (action === 'extend') summary.extendGroups++;
        summary.assignableTasks += Array.isArray(row && row.taskIds) ? row.taskIds.length : 0;
    });

    return summary;
}

function setProjectBootstrapRowEnabled(rowIndex, enabled) {
    const plan = projectBootstrapPreviewPlan;
    if (!plan || !Array.isArray(plan.rows)) return;
    const index = Number(rowIndex);
    if (!Number.isFinite(index) || index < 0 || index >= plan.rows.length) return;
    const row = plan.rows[index];
    const action = String(row && row.action || '').trim().toLowerCase();
    if (action !== 'create' && action !== 'extend') return;
    row.enabled = !!enabled;
    renderProjectBootstrapPreviewModal(plan);
}

function closeProjectBootstrapPreviewModal() {
    const modal = document.getElementById('project-bootstrap-preview-modal');
    const backdrop = document.getElementById('project-bootstrap-preview-backdrop');
    if (modal) modal.classList.remove('visible');
    if (backdrop) backdrop.classList.remove('visible');
}

function renderProjectBootstrapPreviewModal(plan) {
    const summaryEl = document.getElementById('project-bootstrap-preview-summary');
    const listEl = document.getElementById('project-bootstrap-preview-list');
    const applyBtn = document.getElementById('project-bootstrap-preview-apply-btn');
    if (!summaryEl || !listEl || !applyBtn) return;

    const safePlan = (plan && typeof plan === 'object') ? plan : null;
    const rows = safePlan && Array.isArray(safePlan.rows) ? safePlan.rows : [];
    const selectedSummary = getProjectBootstrapSelectedSummary(safePlan);

    summaryEl.textContent = `Selected -> Create: ${selectedSummary.createGroups} | Extend: ${selectedSummary.extendGroups} | Skip: ${selectedSummary.skipGroups} | Tasks to assign: ${selectedSummary.assignableTasks} | Total groups: ${rows.length}`;
    applyBtn.disabled = selectedSummary.assignableTasks <= 0;
    listEl.innerHTML = '';

    const encode = (value) => {
        if (typeof escapeHtml === 'function') return escapeHtml(value);
        return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    };

    if (rows.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'project-bootstrap-preview-empty';
        empty.textContent = 'No groups detected.';
        listEl.appendChild(empty);
        return;
    }

    rows.forEach((row, rowIndex) => {
        const action = String(row && row.action || 'skip').trim().toLowerCase();
        const canToggle = action === 'create' || action === 'extend';
        const isEnabled = canToggle && row.enabled !== false;
        const rowActionClass = !canToggle
            ? 'action-skip'
            : (isEnabled ? `action-${action}` : 'action-skip');
        const wrap = document.createElement('div');
        wrap.className = `project-bootstrap-preview-row ${rowActionClass}`;

        const actionLabel = action === 'create'
            ? 'Create'
            : (action === 'extend' ? 'Extend' : 'Skip');
        const effectiveLabel = canToggle ? (isEnabled ? actionLabel : 'Keep Group') : actionLabel;
        const destination = action === 'create'
            ? ` -> ${encode(row.proposedProjectName || 'Untitled Project')}`
            : (action === 'extend'
                ? ` -> ${encode(row.existingProjectName || 'Untitled Project')}`
                : '');
        const toggleHtml = canToggle
            ? `<label class="project-bootstrap-preview-toggle">
                    <input type="checkbox" ${isEnabled ? 'checked' : ''} onchange="setProjectBootstrapRowEnabled(${rowIndex}, this.checked)">
                    <span>${isEnabled ? 'Apply' : 'Skip'}</span>
               </label>`
            : `<span class="project-bootstrap-preview-toggle-disabled">Not eligible</span>`;

        wrap.innerHTML = `
            <div class="project-bootstrap-preview-row-head">
                <div class="project-bootstrap-preview-row-head-main">
                    <span class="project-bootstrap-preview-action ${canToggle && !isEnabled ? 'action-skip' : `action-${action}`}">${effectiveLabel}</span>
                    <span class="project-bootstrap-preview-title">${encode(row.groupTitle || 'Task Group')}${destination}</span>
                </div>
                <div class="project-bootstrap-preview-row-controls">${toggleHtml}</div>
            </div>
            <div class="project-bootstrap-preview-row-meta">
                Active: ${Number(row.activeCount) || 0} | Unassigned: ${Number(row.unassignedCount) || 0} | Total: ${Number(row.totalCount) || 0}
            </div>
            <div class="project-bootstrap-preview-row-reason">${encode(row.reasonText || '')}</div>
        `;
        listEl.appendChild(wrap);
    });
}

function openProjectBootstrapPreviewModal() {
    const plan = buildProjectBootstrapPreviewPlan();
    if (!plan || !Number.isFinite(Number(plan.groupsTotal)) || plan.groupsTotal <= 0) {
        if (typeof showNotification === 'function') showNotification('No task groups detected yet.');
        return;
    }

    initializeProjectBootstrapPlanSelections(plan);
    projectBootstrapPreviewPlan = plan;
    renderProjectBootstrapPreviewModal(plan);

    const modal = document.getElementById('project-bootstrap-preview-modal');
    const backdrop = document.getElementById('project-bootstrap-preview-backdrop');
    if (modal) modal.classList.add('visible');
    if (backdrop) backdrop.classList.add('visible');
}

function applyProjectBootstrapPreview() {
    const plan = projectBootstrapPreviewPlan;
    if (!plan || !Array.isArray(plan.rows)) {
        closeProjectBootstrapPreviewModal();
        if (typeof showNotification === 'function') showNotification('Preview expired. Open preview again.');
        return;
    }

    if (!Array.isArray(projects)) projects = [];
    const existingNameSet = new Set(
        projects
            .map(project => String(project && project.name || '').trim().toLowerCase())
            .filter(Boolean)
    );

    let createdProjects = 0;
    let assignedTasks = 0;
    let extendedProjects = 0;
    let skippedStale = 0;

    plan.rows.forEach((row) => {
        const action = String(row && row.action || '').trim().toLowerCase();
        if (action !== 'create' && action !== 'extend') return;
        if (row.enabled === false) return;

        const taskIds = Array.isArray(row.taskIds) ? row.taskIds : [];
        const eligibleTasks = taskIds
            .map(taskId => nodes.find(node => node && node.id === taskId))
            .filter(task => task && !task.completed && !String(task.projectId || '').trim());
        if (eligibleTasks.length === 0) {
            skippedStale++;
            return;
        }

        if (action === 'extend') {
            const targetProject = getProjectById(row.existingProjectId);
            if (!targetProject) {
                skippedStale++;
                return;
            }
            eligibleTasks.forEach(task => {
                task.projectId = targetProject.id;
                if (typeof touchTask === 'function') touchTask(task);
                assignedTasks++;
            });
            if (typeof touchProject === 'function') touchProject(targetProject);
            else targetProject.updatedAt = Date.now();
            extendedProjects++;
            return;
        }

        const preferredName = String(row.proposedProjectName || row.groupTitle || 'Task Group').trim() || 'Task Group';
        const projectName = getUniqueProjectName(preferredName, existingNameSet);
        const goalIds = Array.isArray(row.goalIds)
            ? Array.from(new Set(row.goalIds.map(goalId => String(goalId || '').trim()).filter(Boolean)))
            : [];
        const description = `Bootstrapped from task group (${PROJECT_BOOTSTRAP_RULE_VERSION})`;
        const project = (typeof createProject === 'function')
            ? createProject(projectName, { goalIds, origin: 'migrated', description })
            : {
                id: 'proj_' + Date.now() + Math.random().toString(36).substr(2, 5),
                name: projectName,
                description,
                status: 'active',
                goalIds,
                color: null,
            sortOrder: 0,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            archivedAt: null,
            origin: 'migrated',
            aiUrgency: (typeof createDefaultAiUrgency === 'function')
                ? createDefaultAiUrgency('project')
                : null
        };
        projects.push(project);
        if (typeof touchProject === 'function') touchProject(project);
        createdProjects++;
        eligibleTasks.forEach(task => {
            task.projectId = project.id;
            if (typeof touchTask === 'function') touchTask(task);
            assignedTasks++;
        });
    });

    closeProjectBootstrapPreviewModal();

    if (createdProjects === 0 && assignedTasks === 0) {
        if (typeof showNotification === 'function') showNotification('No bootstrap changes were applied.');
        renderProjectsList();
        return;
    }

    if (typeof saveToStorage === 'function') saveToStorage();
    if (typeof render === 'function') render();
    if (typeof updateInspector === 'function' && selectedNodeId) updateInspector();
    renderProjectsList();

    const parts = [
        `Created ${createdProjects} project${createdProjects === 1 ? '' : 's'}`,
        `assigned ${assignedTasks} task${assignedTasks === 1 ? '' : 's'}`
    ];
    if (extendedProjects > 0) {
        parts.push(`extended ${extendedProjects} existing project${extendedProjects === 1 ? '' : 's'}`);
    }
    if (skippedStale > 0) {
        parts.push(`skipped ${skippedStale} stale group action${skippedStale === 1 ? '' : 's'}`);
    }
    if (typeof showNotification === 'function') showNotification(parts.join(', ') + '.');
}

function createProjectsFromCurrentGroups() {
    openProjectBootstrapPreviewModal();
}

function openProjectManagerDashboardSubpage() {
    const selectedTask = (typeof getSelectedNode === 'function') ? getSelectedNode() : null;
    const selectedProjectId = String(
        projectsPanelSelectedProjectId
        || projectDetailsProjectId
        || (selectedTask && selectedTask.projectId)
        || ''
    ).trim();

    const query = new URLSearchParams();
    if (selectedProjectId) query.set('projectId', selectedProjectId);
    const targetUrl = 'project-dashboard/project-manager-dashboard.html' + (query.toString() ? ('?' + query.toString()) : '');
    window.location.href = targetUrl;
}

function openFinanceSubpage() {
    window.location.href = 'Finance/index.html';
}

function isProjectDetailsModalOpen() {
    const modal = document.getElementById('project-details-modal');
    return !!(modal && modal.classList.contains('visible'));
}

function closeProjectDetailsModal() {
    const modal = document.getElementById('project-details-modal');
    const backdrop = document.getElementById('project-details-backdrop');
    if (modal) modal.classList.remove('visible');
    if (backdrop) backdrop.classList.remove('visible');
    projectDetailsProjectId = null;
}

function openProjectDetailsModal(projectId) {
    const project = getProjectById(projectId);
    if (!project) {
        if (typeof showNotification === 'function') showNotification('Project not found.');
        return;
    }

    projectDetailsProjectId = project.id;
    renderProjectDetailsModal();

    const modal = document.getElementById('project-details-modal');
    const backdrop = document.getElementById('project-details-backdrop');
    if (modal) modal.classList.add('visible');
    if (backdrop) backdrop.classList.add('visible');
}

function navigateProjectDetailsByOffset(direction = 1) {
    const nav = getProjectDetailsNavigationState(projectDetailsProjectId);
    const targetProjectId = Number(direction) < 0 ? nav.prevId : nav.nextId;
    if (!targetProjectId) return;

    projectsPanelSelectedProjectId = targetProjectId;
    openProjectDetailsModal(targetProjectId);

    if (isProjectsPanelVisible()) {
        renderProjectsList();
    }
}

function getSelectedTaskIdsForProjectDetails() {
    const ids = [];
    if (selectedIds && typeof selectedIds.forEach === 'function') {
        selectedIds.forEach((id) => ids.push(id));
    }
    if (ids.length === 0 && selectedNodeId) ids.push(selectedNodeId);

    const seen = new Set();
    return ids
        .map(id => String(id || '').trim())
        .filter(Boolean)
        .filter(id => {
            if (seen.has(id)) return false;
            seen.add(id);
            return true;
        })
        .filter(id => !!getTaskById(id));
}

function formatProjectDetailsTimestamp(value) {
    const timestamp = Number(value);
    if (!Number.isFinite(timestamp) || timestamp <= 0) return '—';
    return new Date(timestamp).toLocaleString();
}

const PROJECT_WORKFLOW_NODE_WIDTH = 220;
const PROJECT_WORKFLOW_NODE_HEIGHT = 148;
const PROJECT_WORKFLOW_COL_GAP = 256;
const PROJECT_WORKFLOW_ROW_GAP = 164;
const PROJECT_WORKFLOW_PAD_X = 18;
const PROJECT_WORKFLOW_PAD_Y = 14;

function compareProjectTaskEntriesForWorkflow(a, b) {
    const aDone = a && (a.isArchived || (a.task && a.task.completed)) ? 1 : 0;
    const bDone = b && (b.isArchived || (b.task && b.task.completed)) ? 1 : 0;
    if (aDone !== bDone) return aDone - bDone;

    const titleA = String(a && a.task && a.task.title || '');
    const titleB = String(b && b.task && b.task.title || '');
    const titleDiff = titleA.localeCompare(titleB, undefined, { sensitivity: 'base' });
    if (titleDiff !== 0) return titleDiff;

    return String(a && a.task && a.task.id || '').localeCompare(String(b && b.task && b.task.id || ''));
}

function getProjectTaskWorkflowEntriesOrdered(linkedTasks) {
    const entries = Array.isArray(linkedTasks) ? linkedTasks.filter(item => item && item.task && item.task.id) : [];
    if (entries.length <= 1) return entries.slice();

    const byId = new Map();
    entries.forEach((entry) => {
        const taskId = String(entry && entry.task && entry.task.id || '').trim();
        if (!taskId) return;
        byId.set(taskId, entry);
    });
    const outgoing = new Map();
    const inDegree = new Map();

    byId.forEach((_entry, taskId) => {
        outgoing.set(taskId, new Set());
        inDegree.set(taskId, 0);
    });

    byId.forEach((entry, taskId) => {
        const deps = Array.isArray(entry.task.dependencies) ? entry.task.dependencies : [];
        deps.forEach(dep => {
            const depId = typeof getDependencyTaskId === 'function'
                ? getDependencyTaskId(dep)
                : String(dep && dep.id || '').trim();
            if (!depId || !byId.has(depId) || depId === taskId) return;
            const edges = outgoing.get(depId);
            if (!edges || edges.has(taskId)) return;
            edges.add(taskId);
            inDegree.set(taskId, (inDegree.get(taskId) || 0) + 1);
        });
    });

    const queue = Array.from(byId.values())
        .filter(entry => {
            const taskId = String(entry && entry.task && entry.task.id || '').trim();
            return (inDegree.get(taskId) || 0) === 0;
        })
        .sort(compareProjectTaskEntriesForWorkflow);

    const ordered = [];
    while (queue.length > 0) {
        const current = queue.shift();
        const currentTaskId = String(current && current.task && current.task.id || '').trim();
        if (!currentTaskId) continue;
        ordered.push(current);

        const children = Array.from(outgoing.get(currentTaskId) || []);
        children.forEach((childId) => {
            const nextDegree = (inDegree.get(childId) || 0) - 1;
            inDegree.set(childId, nextDegree);
            if (nextDegree === 0) {
                const childEntry = byId.get(childId);
                if (childEntry) {
                    queue.push(childEntry);
                    queue.sort(compareProjectTaskEntriesForWorkflow);
                }
            }
        });
    }

    if (ordered.length < entries.length) {
        const seen = new Set(ordered.map(entry => String(entry && entry.task && entry.task.id || '').trim()));
        entries
            .filter(entry => !seen.has(String(entry && entry.task && entry.task.id || '').trim()))
            .sort(compareProjectTaskEntriesForWorkflow)
            .forEach(entry => ordered.push(entry));
    }

    return ordered;
}

function getProjectTaskWorkflowLayout(linkedTasks) {
    const orderedEntries = getProjectTaskWorkflowEntriesOrdered(linkedTasks);
    if (orderedEntries.length === 0) {
        return {
            entries: [],
            bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 }
        };
    }

    const fallbackPositions = {};
    orderedEntries.forEach((entry, index) => {
        const taskId = String(entry && entry.task && entry.task.id || '').trim();
        if (!taskId) return;
        fallbackPositions[taskId] = {
            x: index * PROJECT_WORKFLOW_COL_GAP,
            y: 0,
            rank: index,
            componentIndex: 0
        };
    });

    let sharedLayout = null;
    if (typeof computeDependencyAwareTaskLayout === 'function') {
        sharedLayout = computeDependencyAwareTaskLayout(
            orderedEntries.map(entry => entry.task),
            {
                activeStartX: 0,
                startY: 0,
                colGap: PROJECT_WORKFLOW_COL_GAP,
                rowGap: PROJECT_WORKFLOW_ROW_GAP,
                componentGap: 118,
                timeScale: 10,
                nodeWidth: PROJECT_WORKFLOW_NODE_WIDTH,
                nodeHeight: PROJECT_WORKFLOW_NODE_HEIGHT
            }
        );
    }

    const positions = (sharedLayout && sharedLayout.positions) ? sharedLayout.positions : fallbackPositions;
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;

    orderedEntries.forEach((entry, index) => {
        const taskId = String(entry && entry.task && entry.task.id || '').trim();
        if (!taskId) return;
        const pos = positions[taskId] || {
            x: index * PROJECT_WORKFLOW_COL_GAP,
            y: 0,
            rank: index,
            componentIndex: 0
        };
        minX = Math.min(minX, Number(pos.x) || 0);
        minY = Math.min(minY, Number(pos.y) || 0);
        maxX = Math.max(maxX, (Number(pos.x) || 0) + PROJECT_WORKFLOW_NODE_WIDTH);
        maxY = Math.max(maxY, (Number(pos.y) || 0) + PROJECT_WORKFLOW_NODE_HEIGHT);
    });

    if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
        minX = 0;
        minY = 0;
        maxX = PROJECT_WORKFLOW_NODE_WIDTH;
        maxY = PROJECT_WORKFLOW_NODE_HEIGHT;
    }

    const visualOrder = orderedEntries
        .slice()
        .sort((a, b) => {
            const idA = String(a && a.task && a.task.id || '').trim();
            const idB = String(b && b.task && b.task.id || '').trim();
            const posA = positions[idA] || { x: 0, y: 0 };
            const posB = positions[idB] || { x: 0, y: 0 };

            const xDiff = (Number(posA.x) || 0) - (Number(posB.x) || 0);
            if (xDiff !== 0) return xDiff;
            const yDiff = (Number(posA.y) || 0) - (Number(posB.y) || 0);
            if (yDiff !== 0) return yDiff;
            return compareProjectTaskEntriesForWorkflow(a, b);
        });

    const stepById = new Map();
    visualOrder.forEach((entry, index) => {
        const taskId = String(entry && entry.task && entry.task.id || '').trim();
        if (!taskId) return;
        stepById.set(taskId, index + 1);
    });

    const laidOutEntries = orderedEntries.map((entry, index) => {
        const taskId = String(entry && entry.task && entry.task.id || '').trim();
        const fallbackPos = {
            x: index * PROJECT_WORKFLOW_COL_GAP,
            y: 0,
            rank: index,
            componentIndex: 0
        };
        return {
            task: entry.task,
            isArchived: !!entry.isArchived,
            layout: positions[taskId] || fallbackPos,
            step: stepById.get(taskId) || (index + 1)
        };
    });

    return {
        entries: laidOutEntries,
        bounds: {
            minX,
            minY,
            maxX,
            maxY,
            width: Math.max(0, maxX - minX),
            height: Math.max(0, maxY - minY)
        }
    };
}

function renderProjectDetailsTaskConnectors(scrollerEl, orderedEntries) {
    if (!scrollerEl) return;
    const canvas = scrollerEl.querySelector('.project-details-task-canvas');
    const svg = canvas ? canvas.querySelector('.project-details-task-svg') : null;
    const rail = canvas ? canvas.querySelector('.project-details-task-rail') : null;
    if (!canvas || !svg || !rail) return;

    const entries = Array.isArray(orderedEntries) ? orderedEntries : [];
    svg.innerHTML = '';
    if (entries.length <= 1) return;

    const width = Math.max(rail.scrollWidth + 30, scrollerEl.clientWidth);
    const height = Math.max(rail.offsetHeight + 30, 180);
    svg.setAttribute('width', String(width));
    svg.setAttribute('height', String(height));
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);

    const namespace = 'http://www.w3.org/2000/svg';
    const defs = document.createElementNS(namespace, 'defs');
    const marker = document.createElementNS(namespace, 'marker');
    marker.setAttribute('id', 'project-details-arrow-head');
    marker.setAttribute('viewBox', '0 0 10 10');
    marker.setAttribute('refX', '8');
    marker.setAttribute('refY', '5');
    marker.setAttribute('markerWidth', '6');
    marker.setAttribute('markerHeight', '6');
    marker.setAttribute('orient', 'auto-start-reverse');
    const markerPath = document.createElementNS(namespace, 'path');
    markerPath.setAttribute('d', 'M 0 0 L 10 5 L 0 10 z');
    markerPath.setAttribute('fill', 'rgba(148, 163, 184, 0.85)');
    marker.appendChild(markerPath);
    defs.appendChild(marker);
    svg.appendChild(defs);

    const cardById = new Map();
    rail.querySelectorAll('.project-details-task-card').forEach((card) => {
        const taskId = String(card.dataset.taskId || '').trim();
        if (taskId) cardById.set(taskId, card);
    });
    const railOffsetX = rail.offsetLeft;
    const railOffsetY = rail.offsetTop;

    entries.forEach((entry) => {
        const task = entry && entry.task;
        if (!task || !task.id) return;
        const targetCard = cardById.get(task.id);
        if (!targetCard) return;

        const deps = Array.isArray(task.dependencies) ? task.dependencies : [];
        deps.forEach((dep) => {
            const depId = typeof getDependencyTaskId === 'function'
                ? getDependencyTaskId(dep)
                : String(dep && dep.id || '').trim();
            if (!depId) return;
            const sourceCard = cardById.get(depId);
            if (!sourceCard) return;

            const x1 = railOffsetX + sourceCard.offsetLeft + sourceCard.offsetWidth - 2;
            const y1 = railOffsetY + sourceCard.offsetTop + (sourceCard.offsetHeight / 2);
            const x2 = railOffsetX + targetCard.offsetLeft + 2;
            const y2 = railOffsetY + targetCard.offsetTop + (targetCard.offsetHeight / 2);
            const gap = Math.max(26, Math.abs(x2 - x1) * 0.35);

            const path = document.createElementNS(namespace, 'path');
            path.classList.add('project-details-connector');
            path.classList.add(String(dep && dep.type || '').trim().toLowerCase() === 'soft' ? 'soft' : 'hard');
            path.setAttribute('d', `M ${x1} ${y1} C ${x1 + gap} ${y1}, ${x2 - gap} ${y2}, ${x2} ${y2}`);
            path.setAttribute('marker-end', 'url(#project-details-arrow-head)');
            svg.appendChild(path);
        });
    });
}

function updateProjectDetailsTaskScrollButtons() {
    const scroller = document.getElementById('project-details-task-list');
    if (!scroller) return;
}

function bindProjectDetailsTaskInteractions() {
    const scroller = document.getElementById('project-details-task-list');
    if (scroller && scroller.dataset.projectDetailsScrollBound !== 'true') {
        scroller.dataset.projectDetailsScrollBound = 'true';
        scroller.addEventListener('scroll', () => updateProjectDetailsTaskScrollButtons(), { passive: true });
    }
    if (!projectDetailsTaskResizeBound) {
        projectDetailsTaskResizeBound = true;
        window.addEventListener('resize', () => {
            if (!isProjectDetailsModalOpen()) return;
            renderProjectDetailsModal();
        });
    }
}

function scrollProjectDetailsTasks(direction = 1) {
    const scroller = document.getElementById('project-details-task-list');
    if (!scroller) return;
    const step = Math.max(260, Math.round(scroller.clientWidth * 0.72));
    const delta = Number(direction) < 0 ? -step : step;
    scroller.scrollBy({ left: delta, behavior: 'smooth' });
    requestAnimationFrame(() => updateProjectDetailsTaskScrollButtons());
}

function assignSelectedIdsToProjectDetails() {
    const project = getProjectById(projectDetailsProjectId);
    if (!project) {
        if (typeof showNotification === 'function') showNotification('Project not found.');
        closeProjectDetailsModal();
        return;
    }

    const selectedTaskIds = getSelectedTaskIdsForProjectDetails();
    if (selectedTaskIds.length === 0) {
        if (typeof showNotification === 'function') showNotification('No selected tasks to assign.');
        renderProjectDetailsModal();
        return;
    }

    let assignedCount = 0;
    let skippedCount = 0;
    selectedTaskIds.forEach((taskId) => {
        const task = getTaskById(taskId);
        if (!task) {
            skippedCount++;
            return;
        }
        const before = String(task.projectId || '').trim() || null;
        const ok = assignTaskToProject(taskId, project.id, {
            persist: false,
            refreshInspector: false,
            reRender: false
        });
        if (!ok) {
            skippedCount++;
            return;
        }
        if (before !== project.id) assignedCount++;
        else skippedCount++;
    });

    if (assignedCount <= 0) {
        if (typeof showNotification === 'function') showNotification('Selected tasks were already linked to this project.');
        renderProjectDetailsModal();
        return;
    }

    if (typeof saveToStorage === 'function') saveToStorage();
    if (typeof render === 'function') render();
    if (typeof updateInspector === 'function' && selectedNodeId) updateInspector();
    renderProjectsList();
    renderProjectDetailsModal();

    const suffix = skippedCount > 0 ? ` Skipped ${skippedCount}.` : '';
    if (typeof showNotification === 'function') {
        showNotification(`Assigned ${assignedCount} selected task${assignedCount === 1 ? '' : 's'} to "${project.name || 'Project'}".${suffix}`);
    }
}

function unassignTaskFromProjectDetails(taskId) {
    const project = getProjectById(projectDetailsProjectId);
    if (!project) {
        closeProjectDetailsModal();
        return;
    }

    const task = getTaskById(taskId);
    if (!task) return;
    const currentProjectId = String(task.projectId || '').trim() || null;
    if (currentProjectId !== project.id) {
        renderProjectDetailsModal();
        return;
    }

    const ok = assignTaskToProject(taskId, null, { reRender: true });
    if (!ok) {
        if (typeof showNotification === 'function') showNotification('Could not unassign task.');
        return;
    }
    renderProjectDetailsModal();
}

function openProjectTaskFromDetails(taskId) {
    if (!taskId) return;
    closeProjectDetailsModal();
    if (typeof jumpToTask === 'function') jumpToTask(taskId);
    else if (typeof selectNode === 'function') selectNode(taskId);

    if (typeof openInspectorExpandedModal === 'function') {
        requestAnimationFrame(() => {
            if (!selectedNodeId || selectedNodeId !== taskId) {
                if (typeof selectNode === 'function') selectNode(taskId);
            }
            openInspectorExpandedModal();
        });
    }
}

function openProjectGoalFromDetails(goalId) {
    if (!goalId) return;
    closeProjectDetailsModal();
    if (typeof openGoalFromInspector === 'function') {
        openGoalFromInspector(goalId);
        return;
    }

    let targetYear = null;
    if (typeof getAllGoalsFlat === 'function') {
        const found = getAllGoalsFlat().find(item => item && item.goal && item.goal.id === goalId);
        if (found) {
            const parsedYear = Number(found.year);
            if (Number.isFinite(parsedYear)) targetYear = parsedYear;
        }
    }
    if (targetYear !== null) currentGoalYear = targetYear;
    if (typeof toggleGoals === 'function') toggleGoals(true);
    requestAnimationFrame(() => {
        if (typeof renderGoals === 'function') renderGoals();
        requestAnimationFrame(() => {
            if (typeof focusGoalEditor === 'function') focusGoalEditor(goalId, false);
        });
    });
}

const PROJECT_DETAILS_MODAL_THEME_KEYS = [
    '--project-details-border',
    '--project-details-bg',
    '--project-details-shadow',
    '--project-details-header-border',
    '--project-details-header-bg',
    '--project-details-icon-bg',
    '--project-details-icon-border',
    '--project-details-section-border',
    '--project-details-section-bg',
    '--project-details-overview-bg',
    '--project-details-backdrop-bg'
];

function parseHexColorToRgbString(hexColor) {
    if (typeof goalHexToRgbString === 'function') return goalHexToRgbString(hexColor);
    const normalized = (typeof normalizeGoalHexColor === 'function')
        ? normalizeGoalHexColor(hexColor)
        : (typeof hexColor === 'string' && /^#?[0-9a-fA-F]{6}$/.test(hexColor.trim())
            ? (hexColor.trim().startsWith('#') ? hexColor.trim().toLowerCase() : `#${hexColor.trim().toLowerCase()}`)
            : null);
    if (!normalized) return null;
    const clean = normalized.slice(1);
    const r = parseInt(clean.slice(0, 2), 16);
    const g = parseInt(clean.slice(2, 4), 16);
    const b = parseInt(clean.slice(4, 6), 16);
    if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) return null;
    return `${r}, ${g}, ${b}`;
}

function averageRgbStrings(rgbValues) {
    const tuples = (Array.isArray(rgbValues) ? rgbValues : [])
        .map(value => String(value || '').split(',').map(part => Number(part.trim())))
        .filter(parts => parts.length === 3 && parts.every(Number.isFinite));
    if (tuples.length === 0) return '148, 163, 184';
    const sums = tuples.reduce((acc, parts) => {
        acc[0] += parts[0];
        acc[1] += parts[1];
        acc[2] += parts[2];
        return acc;
    }, [0, 0, 0]);
    return `${Math.round(sums[0] / tuples.length)}, ${Math.round(sums[1] / tuples.length)}, ${Math.round(sums[2] / tuples.length)}`;
}

function buildLinearColorStops(rgbValues, alpha = 0.25) {
    const values = Array.isArray(rgbValues) ? rgbValues : [];
    if (values.length === 0) return `rgba(148, 163, 184, ${alpha}) 0%`;
    if (values.length === 1) return `rgba(${values[0]}, ${alpha}) 0%`;
    return values
        .map((rgb, index) => {
            const position = Math.round((index / Math.max(1, values.length - 1)) * 100);
            return `rgba(${rgb}, ${alpha}) ${position}%`;
        })
        .join(', ');
}

function createProjectDetailsTheme(goalIds) {
    const linkedGoalIds = Array.isArray(goalIds) ? goalIds : [];
    const uniqueHexColors = Array.from(new Set(
        linkedGoalIds
            .map(goalId => (typeof getGoalColorHexById === 'function') ? getGoalColorHexById(goalId) : null)
            .map(color => (typeof normalizeGoalHexColor === 'function') ? normalizeGoalHexColor(color) : color)
            .filter(Boolean)
    ));
    const rgbColors = uniqueHexColors
        .map(parseHexColorToRgbString)
        .filter(Boolean);

    if (rgbColors.length === 0) {
        return {
            '--project-details-border': 'rgba(148, 163, 184, 0.24)',
            '--project-details-bg': [
                'radial-gradient(1200px 420px at 0% 0%, rgba(148, 163, 184, 0.12), transparent 60%)',
                'linear-gradient(150deg, rgba(45, 55, 72, 0.34), rgba(17, 24, 39, 0.62) 42%, rgba(2, 6, 23, 0.96) 100%)'
            ].join(', '),
            '--project-details-shadow': '0 28px 72px rgba(2, 8, 18, 0.68)',
            '--project-details-header-border': 'rgba(148, 163, 184, 0.22)',
            '--project-details-header-bg': 'linear-gradient(90deg, rgba(148, 163, 184, 0.14), rgba(71, 85, 105, 0.12) 48%, transparent 88%)',
            '--project-details-icon-bg': 'rgba(148, 163, 184, 0.18)',
            '--project-details-icon-border': 'rgba(148, 163, 184, 0.36)',
            '--project-details-section-border': 'rgba(148, 163, 184, 0.2)',
            '--project-details-section-bg': 'rgba(12, 20, 32, 0.64)',
            '--project-details-overview-bg': 'linear-gradient(135deg, rgba(55, 65, 81, 0.44), rgba(12, 20, 32, 0.76))',
            '--project-details-backdrop-bg': 'rgba(5, 10, 18, 0.72)'
        };
    }

    const primary = rgbColors[0];
    const secondary = rgbColors[Math.min(1, rgbColors.length - 1)];
    const tertiary = rgbColors[Math.min(2, rgbColors.length - 1)];
    const accent = averageRgbStrings(rgbColors);
    const headerStops = buildLinearColorStops(rgbColors.slice(0, Math.min(3, rgbColors.length)), 0.16);
    const iconStops = buildLinearColorStops(rgbColors.slice(0, Math.min(4, rgbColors.length)), 0.28);
    const overviewStops = buildLinearColorStops(rgbColors.slice(0, Math.min(3, rgbColors.length)), 0.26);
    const radialAnchorPositions = [8, 50, 92];
    const gradientRgbValues = rgbColors.length <= 3
        ? rgbColors
        : [rgbColors[0], rgbColors[Math.floor((rgbColors.length - 1) / 2)], rgbColors[rgbColors.length - 1]];
    const radialLayers = gradientRgbValues.map((rgb, index) => {
        const y = radialAnchorPositions[Math.min(index, radialAnchorPositions.length - 1)];
        return `radial-gradient(circle at -10% ${y}%, rgba(${rgb}, 0.22) 0%, transparent 62%)`;
    });

    return {
        '--project-details-border': `rgba(${accent}, 0.28)`,
        '--project-details-bg': [
            ...radialLayers,
            `linear-gradient(150deg, rgba(${primary}, 0.25), rgba(${secondary}, 0.2) 38%, rgba(${tertiary}, 0.12) 58%, rgba(2, 12, 19, 0.97) 100%)`
        ].join(', '),
        '--project-details-shadow': `0 28px 72px rgba(2, 8, 18, 0.68), 0 0 0 1px rgba(${accent}, 0.08)`,
        '--project-details-header-border': `rgba(${accent}, 0.28)`,
        '--project-details-header-bg': `linear-gradient(90deg, ${headerStops}, transparent 88%)`,
        '--project-details-icon-bg': rgbColors.length > 1
            ? `linear-gradient(135deg, ${iconStops})`
            : `rgba(${primary}, 0.22)`,
        '--project-details-icon-border': `rgba(${accent}, 0.42)`,
        '--project-details-section-border': `rgba(${accent}, 0.24)`,
        '--project-details-section-bg': `linear-gradient(145deg, rgba(${primary}, 0.08), rgba(12, 25, 35, 0.66) 54%)`,
        '--project-details-overview-bg': `linear-gradient(135deg, ${overviewStops}, rgba(12, 25, 35, 0.78) 100%)`,
        '--project-details-backdrop-bg': [
            `radial-gradient(circle at 12% 18%, rgba(${primary}, 0.16), transparent 42%)`,
            `radial-gradient(circle at 88% 82%, rgba(${secondary}, 0.12), transparent 46%)`,
            'rgba(2, 12, 19, 0.66)'
        ].join(', ')
    };
}

function applyProjectDetailsTheme(goalIds) {
    const modalEl = document.getElementById('project-details-modal');
    const backdropEl = document.getElementById('project-details-backdrop');
    if (!modalEl || !backdropEl) return;

    const themeVars = createProjectDetailsTheme(goalIds);
    PROJECT_DETAILS_MODAL_THEME_KEYS.forEach((key) => {
        const value = themeVars[key];
        if (value) {
            if (key === '--project-details-backdrop-bg') {
                backdropEl.style.setProperty(key, value);
            } else {
                modalEl.style.setProperty(key, value);
            }
            return;
        }
        modalEl.style.removeProperty(key);
        backdropEl.style.removeProperty(key);
    });
}

function normalizeProjectGoalIds(goalIds) {
    return Array.from(new Set(
        (Array.isArray(goalIds) ? goalIds : [])
            .map(goalId => String(goalId || '').trim())
            .filter(Boolean)
    ));
}

function isSelectedTaskInProject(projectId) {
    const normalizedProjectId = String(projectId || '').trim();
    if (!normalizedProjectId || !selectedNodeId) return false;
    const selectedTask = (typeof getTaskById === 'function')
        ? getTaskById(selectedNodeId)
        : (nodes.find(task => task && task.id === selectedNodeId) || archivedNodes.find(task => task && task.id === selectedNodeId));
    if (!selectedTask) return false;
    return String(selectedTask.projectId || '').trim() === normalizedProjectId;
}

function syncProjectGoalMutationUI(projectId, options = {}) {
    const safeOptions = (options && typeof options === 'object') ? options : {};
    const normalizedProjectId = String(projectId || '').trim();
    const forceProjectDetailsRender = !!safeOptions.forceProjectDetailsRender;

    if (safeOptions.persist !== false && typeof saveToStorage === 'function') saveToStorage();
    if (safeOptions.reRender !== false && typeof render === 'function') render();
    if (safeOptions.refreshInspector !== false && typeof updateInspector === 'function' && isSelectedTaskInProject(normalizedProjectId)) {
        updateInspector();
    }
    if (safeOptions.refreshProjectsList !== false && typeof renderProjectsList === 'function') renderProjectsList();

    if (safeOptions.refreshProjectDetails !== false && typeof renderProjectDetailsModal === 'function') {
        const projectDetailsOpen = (typeof isProjectDetailsModalOpen === 'function') ? isProjectDetailsModalOpen() : false;
        const activeProjectDetailsId = String(projectDetailsProjectId || '').trim();
        if (forceProjectDetailsRender || (projectDetailsOpen && activeProjectDetailsId === normalizedProjectId)) {
            renderProjectDetailsModal();
        }
    }
}

function applyProjectGoalMutation(projectId, goalId, options = {}) {
    const safeOptions = (options && typeof options === 'object') ? options : {};
    const normalizedProjectId = String(projectId || '').trim();
    const normalizedGoalId = String(goalId || '').trim();
    if (!normalizedProjectId || !normalizedGoalId) {
        return { ok: false, changed: false, taskCount: 0, project: null };
    }

    const project = getProjectById(normalizedProjectId);
    if (!project) return { ok: false, changed: false, taskCount: 0, project: null };

    const remove = !!safeOptions.remove;
    const projectGoalIds = normalizeProjectGoalIds(project.goalIds);
    const projectHadGoal = projectGoalIds.includes(normalizedGoalId);
    let nextProjectGoalIds = projectGoalIds.slice();
    if (remove) {
        nextProjectGoalIds = nextProjectGoalIds.filter(existingGoalId => existingGoalId !== normalizedGoalId);
    } else if (!projectHadGoal) {
        nextProjectGoalIds.push(normalizedGoalId);
    }

    const linkedTasks = [
        ...nodes.filter(task => task && String(task.projectId || '').trim() === normalizedProjectId),
        ...archivedNodes.filter(task => task && String(task.projectId || '').trim() === normalizedProjectId)
    ];
    let taskCount = 0;
    linkedTasks.forEach((task) => {
        const taskGoalIds = normalizeProjectGoalIds(task.goalIds);
        const taskHasGoal = taskGoalIds.includes(normalizedGoalId);
        if (remove) {
            if (taskHasGoal) {
                task.goalIds = taskGoalIds.filter(existingGoalId => existingGoalId !== normalizedGoalId);
                if (typeof touchTask === 'function') touchTask(task);
                taskCount++;
            } else if (!Array.isArray(task.goalIds)) {
                task.goalIds = taskGoalIds;
            }
            return;
        }

        if (taskHasGoal) {
            if (!Array.isArray(task.goalIds)) task.goalIds = taskGoalIds;
            return;
        }
        task.goalIds = [...taskGoalIds, normalizedGoalId];
        if (typeof touchTask === 'function') touchTask(task);
        taskCount++;
    });

    const projectChanged = nextProjectGoalIds.length !== projectGoalIds.length
        || nextProjectGoalIds.some((goalItemId, index) => goalItemId !== projectGoalIds[index]);
    if (projectChanged) project.goalIds = nextProjectGoalIds;

    const changed = projectChanged || taskCount > 0;
    if (changed) {
        if (typeof touchProject === 'function') touchProject(project);
        else project.updatedAt = Date.now();
    }

    return {
        ok: true,
        changed,
        taskCount,
        project,
        projectChanged,
        goalAdded: !remove,
        goalRemoved: remove
    };
}

function getProjectDetailsGoalEntries(options = {}) {
    const safeOptions = (options && typeof options === 'object') ? options : {};
    const onlyLinkable = !!safeOptions.linkableOnly;
    const allGoals = onlyLinkable && typeof getLinkableGoalsFlat === 'function'
        ? getLinkableGoalsFlat({ includeSubgoals: true })
        : ((typeof getAllGoalsFlat === 'function') ? getAllGoalsFlat() : []);
    const byId = new Map();

    allGoals.forEach((item) => {
        const goal = item && item.goal ? item.goal : null;
        const goalId = String(goal && goal.id || '').trim();
        if (!goalId || byId.has(goalId)) return;

        const goalTitle = String(goal && goal.text || '').trim()
            || (typeof getGoalTextById === 'function' ? String(getGoalTextById(goalId) || '').trim() : '')
            || `Goal ${goalId}`;
        const goalPath = (typeof getGoalPath === 'function')
            ? String(getGoalPath(goalId) || '').trim()
            : '';
        const numericYear = Number(item && item.year);
        const goalYear = Number.isFinite(numericYear) ? String(numericYear) : '';

        byId.set(goalId, {
            id: goalId,
            title: goalTitle,
            path: goalPath,
            year: goalYear,
            depth: Number(item && item.depth) || 0
        });
    });

    return Array.from(byId.values());
}

function linkGoalToProjectDetails(goalId) {
    const project = getProjectById(projectDetailsProjectId);
    if (!project) {
        if (typeof showNotification === 'function') showNotification('Project not found.');
        closeProjectDetailsModal();
        return false;
    }

    const normalizedGoalId = String(goalId || '').trim();
    if (!normalizedGoalId) {
        if (typeof showNotification === 'function') showNotification('Select a goal to link.');
        return false;
    }

    const linkableGoalEntries = getProjectDetailsGoalEntries({ linkableOnly: true });
    if (!linkableGoalEntries.some(entry => entry.id === normalizedGoalId)) {
        if (typeof showNotification === 'function') showNotification('Goal not found.');
        return false;
    }

    const mutation = applyProjectGoalMutation(project.id, normalizedGoalId, { remove: false });
    if (!mutation.ok) {
        if (typeof showNotification === 'function') showNotification('Could not link goal to this project.');
        return false;
    }
    if (!mutation.changed) {
        if (typeof showNotification === 'function') showNotification('Goal already linked to this project.');
        renderProjectDetailsModal();
        return false;
    }

    syncProjectGoalMutationUI(project.id, { forceProjectDetailsRender: true });

    const goalTitle = (typeof getGoalTextById === 'function')
        ? String(getGoalTextById(normalizedGoalId) || '').trim()
        : '';
    if (typeof showNotification === 'function') {
        showNotification(`Linked goal "${goalTitle || normalizedGoalId}" across ${mutation.taskCount} task(s) in "${project.name || 'Project'}".`);
    }
    return true;
}

function linkSelectedGoalToProjectDetails() {
    const selectEl = document.getElementById('project-details-goal-select');
    if (!selectEl) return false;
    return linkGoalToProjectDetails(selectEl.value);
}

function unlinkGoalFromProjectDetails(goalId, event) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }

    const project = getProjectById(projectDetailsProjectId);
    if (!project) {
        closeProjectDetailsModal();
        return false;
    }

    const normalizedGoalId = String(goalId || '').trim();
    if (!normalizedGoalId) return false;

    const mutation = applyProjectGoalMutation(project.id, normalizedGoalId, { remove: true });
    if (!mutation.ok) {
        if (typeof showNotification === 'function') showNotification('Could not unlink goal from this project.');
        return false;
    }
    if (!mutation.changed) return false;

    syncProjectGoalMutationUI(project.id, { forceProjectDetailsRender: true });

    const goalTitle = (typeof getGoalTextById === 'function')
        ? String(getGoalTextById(normalizedGoalId) || '').trim()
        : '';
    if (typeof showNotification === 'function') {
        showNotification(`Removed goal "${goalTitle || normalizedGoalId}" across ${mutation.taskCount} task(s) in "${project.name || 'Project'}".`);
    }
    return true;
}

function renderProjectDetailsModal() {
    const titleEl = document.getElementById('project-details-title');
    const statusBadgeEl = document.getElementById('project-details-status-badge');
    const prevBtnEl = document.getElementById('project-details-prev-btn');
    const nextBtnEl = document.getElementById('project-details-next-btn');
    const navMetaEl = document.getElementById('project-details-nav-meta');
    const nameEl = document.getElementById('project-details-name');
    const descriptionEl = document.getElementById('project-details-description');
    const metaGridEl = document.getElementById('project-details-meta-grid');
    const taskListEl = document.getElementById('project-details-task-list');
    const goalSelectEl = document.getElementById('project-details-goal-select');
    const linkGoalBtnEl = document.getElementById('project-details-link-goal-btn');
    const goalListEl = document.getElementById('project-details-goal-list');

    if (!titleEl || !statusBadgeEl || !nameEl || !descriptionEl || !metaGridEl || !taskListEl || !goalListEl) return;
    applyProjectDetailsTheme([]);

    const project = getProjectById(projectDetailsProjectId);
    if (!project) {
        titleEl.textContent = 'Project Details';
        statusBadgeEl.className = 'project-details-status-badge';
        statusBadgeEl.textContent = '—';
        nameEl.textContent = 'Project not found';
        descriptionEl.textContent = 'This project may have been deleted.';
        metaGridEl.innerHTML = '';
        taskListEl.innerHTML = '<div class="project-details-empty">No linked tasks.</div>';
        if (goalSelectEl) {
            goalSelectEl.innerHTML = '';
            const optionEl = document.createElement('option');
            optionEl.value = '';
            optionEl.textContent = 'No goals available';
            goalSelectEl.appendChild(optionEl);
            goalSelectEl.disabled = true;
        }
        if (linkGoalBtnEl) linkGoalBtnEl.disabled = true;
        goalListEl.innerHTML = '<div class="project-details-empty">No linked goals.</div>';
        if (prevBtnEl) prevBtnEl.disabled = true;
        if (nextBtnEl) nextBtnEl.disabled = true;
        if (navMetaEl) navMetaEl.textContent = '— / —';
        return;
    }

    const status = String(project.status || 'active').trim().toLowerCase();
    const stats = getProjectTaskStats(project.id);
    const linkedGoalIds = Array.from(new Set(
        (Array.isArray(project.goalIds) ? project.goalIds : [])
            .map(goalId => String(goalId || '').trim())
            .filter(Boolean)
    ));
    const linkableGoalEntries = getProjectDetailsGoalEntries({ linkableOnly: true });
    const availableGoalEntries = linkableGoalEntries.filter(entry => !linkedGoalIds.includes(entry.id));
    applyProjectDetailsTheme(linkedGoalIds);

    titleEl.textContent = `${project.name || 'Untitled Project'} Details`;
    statusBadgeEl.className = `project-details-status-badge status-${status}`;
    statusBadgeEl.textContent = PROJECT_STATUS_LABELS[status] || 'Active';
    nameEl.textContent = project.name || 'Untitled Project';
    descriptionEl.textContent = String(project.description || '').trim() || 'No description provided.';

    const navState = getProjectDetailsNavigationState(project.id);
    if (prevBtnEl) {
        prevBtnEl.disabled = !navState.prevId;
        prevBtnEl.title = navState.prevId ? 'Open previous project' : 'No previous project';
    }
    if (nextBtnEl) {
        nextBtnEl.disabled = !navState.nextId;
        nextBtnEl.title = navState.nextId ? 'Open next project' : 'No next project';
    }
    if (navMetaEl) {
        if (navState.index >= 0) {
            navMetaEl.textContent = `${navState.index + 1} / ${navState.total}`;
        } else if (navState.total > 0) {
            navMetaEl.textContent = `— / ${navState.total}`;
        } else {
            navMetaEl.textContent = '— / —';
        }
    }

    metaGridEl.innerHTML = '';
    const metaRows = [
        { label: 'Active Tasks', value: String(stats.active) },
        { label: 'Done Tasks', value: String(stats.done) },
        { label: 'Total Tasks', value: String(stats.total) },
        { label: 'Linked Goals', value: String(linkedGoalIds.length) },
        { label: 'Created', value: formatProjectDetailsTimestamp(project.createdAt) },
        { label: 'Updated', value: formatProjectDetailsTimestamp(project.updatedAt) },
        { label: 'Origin', value: String(project.origin || 'manual') }
    ];
    metaRows.forEach((row) => {
        const item = document.createElement('div');
        item.className = 'project-details-meta-item';

        const label = document.createElement('span');
        label.className = 'project-details-meta-label';
        label.textContent = row.label;

        const value = document.createElement('strong');
        value.className = 'project-details-meta-value';
        value.textContent = row.value;

        item.appendChild(label);
        item.appendChild(value);
        metaGridEl.appendChild(item);
    });

    const linkedTasks = [
        ...nodes
            .filter(task => task && String(task.projectId || '').trim() === project.id)
            .map(task => ({ task, isArchived: false })),
        ...archivedNodes
            .filter(task => task && String(task.projectId || '').trim() === project.id)
            .map(task => ({ task, isArchived: true }))
    ];
    const workflowLayout = getProjectTaskWorkflowLayout(linkedTasks);
    const workflowEntries = workflowLayout.entries;
    const workflowBounds = workflowLayout.bounds || { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 };

    taskListEl.innerHTML = '';
    if (workflowEntries.length === 0) {
        taskListEl.innerHTML = '<div class="project-details-empty">No linked tasks yet.</div>';
    } else {
        const canvas = document.createElement('div');
        canvas.className = 'project-details-task-canvas';

        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.classList.add('project-details-task-svg');
        canvas.appendChild(svg);

        const rail = document.createElement('div');
        rail.className = 'project-details-task-rail';

        const contentWidth = Math.max(
            taskListEl.clientWidth - 2,
            Math.ceil((Number(workflowBounds.width) || 0) + (PROJECT_WORKFLOW_PAD_X * 2))
        );
        const contentHeight = Math.max(
            232,
            Math.ceil((Number(workflowBounds.height) || 0) + (PROJECT_WORKFLOW_PAD_Y * 2))
        );
        canvas.style.width = `${contentWidth}px`;
        canvas.style.height = `${contentHeight}px`;
        rail.style.width = `${contentWidth}px`;
        rail.style.height = `${contentHeight}px`;

        workflowEntries.forEach((entry, index) => {
            const task = entry.task;
            const isArchived = !!entry.isArchived;
            const isDone = isArchived || !!task.completed;
            const dueLabel = task.dueDate ? new Date(task.dueDate).toLocaleDateString() : '';
            const taskId = String(task && task.id || '').trim();
            const pos = entry.layout || { x: 0, y: 0 };
            const left = Math.round((Number(pos.x) || 0) - (Number(workflowBounds.minX) || 0) + PROJECT_WORKFLOW_PAD_X);
            const top = Math.round((Number(pos.y) || 0) - (Number(workflowBounds.minY) || 0) + PROJECT_WORKFLOW_PAD_Y);

            const card = document.createElement('div');
            card.className = `project-details-task-card ${isArchived ? 'state-archived' : (isDone ? 'state-done' : 'state-active')}`;
            card.dataset.taskId = taskId;

            const taskCardStyle = (typeof getTaskColorBoxInlineStyle === 'function')
                ? String(getTaskColorBoxInlineStyle(task) || '').trim()
                : '';
            if (taskCardStyle) {
                card.style.cssText = `${taskCardStyle}left:${left}px;top:${top}px;`;
            } else {
                card.style.left = `${left}px`;
                card.style.top = `${top}px`;
            }

            card.onclick = () => openProjectTaskFromDetails(task.id);

            const head = document.createElement('div');
            head.className = 'project-details-task-card-head';

            const phase = document.createElement('span');
            phase.className = 'project-details-task-phase';
            phase.textContent = `Step ${entry.step || (index + 1)}`;

            const state = document.createElement('span');
            state.className = 'project-details-task-state';
            state.textContent = isArchived ? 'Archived' : (isDone ? 'Done' : 'Active');

            head.appendChild(phase);
            head.appendChild(state);

            const title = document.createElement('div');
            title.className = 'project-details-task-card-title';
            title.textContent = String(task.title || 'Untitled Task');

            const badges = document.createElement('div');
            badges.className = 'project-details-task-badges';
            if (!task.completed && !isArchived) {
                if (task._isUrgent) {
                    const urgentBadge = document.createElement('span');
                    urgentBadge.className = 'badge urgent-badge';
                    urgentBadge.textContent = 'URGENT';
                    badges.appendChild(urgentBadge);
                } else if (task._isCritical) {
                    const criticalBadge = document.createElement('span');
                    criticalBadge.className = 'badge critical-badge';
                    criticalBadge.textContent = 'CP';
                    badges.appendChild(criticalBadge);
                }
            }
            if (typeof getTotalTime === 'function') {
                const totalTime = getTotalTime(task);
                if (Number.isFinite(totalTime) && totalTime > 0) {
                    const timeBadge = document.createElement('span');
                    timeBadge.className = 'badge time-badge';
                    timeBadge.textContent = typeof formatTime === 'function'
                        ? formatTime(totalTime)
                        : `${totalTime}m`;
                    badges.appendChild(timeBadge);
                }
            }
            if (dueLabel && !isDone) {
                const dateBadge = document.createElement('span');
                dateBadge.className = 'badge date-badge';
                dateBadge.textContent = `Due ${dueLabel}`;
                badges.appendChild(dateBadge);
            }

            card.appendChild(head);
            card.appendChild(title);
            if (badges.childElementCount > 0) card.appendChild(badges);
            rail.appendChild(card);
        });

        canvas.appendChild(rail);
        taskListEl.appendChild(canvas);

        requestAnimationFrame(() => {
            renderProjectDetailsTaskConnectors(taskListEl, workflowEntries);
            updateProjectDetailsTaskScrollButtons();
        });
    }

    bindProjectDetailsTaskInteractions();
    updateProjectDetailsTaskScrollButtons();

    if (goalSelectEl) {
        goalSelectEl.innerHTML = '';
        const placeholder = document.createElement('option');
        placeholder.value = '';
        if (linkableGoalEntries.length === 0) placeholder.textContent = 'No goals available';
        else if (availableGoalEntries.length === 0) placeholder.textContent = 'All goals already linked';
        else placeholder.textContent = 'Select goal to link...';
        goalSelectEl.appendChild(placeholder);

        availableGoalEntries.forEach((entry) => {
            const option = document.createElement('option');
            option.value = entry.id;
            const indent = entry.depth > 0 ? ('- '.repeat(entry.depth)) : '';
            option.textContent = `${entry.year} • ${indent}${entry.title}`;
            goalSelectEl.appendChild(option);
        });
        goalSelectEl.value = '';
        goalSelectEl.disabled = availableGoalEntries.length === 0;
    }
    if (linkGoalBtnEl) linkGoalBtnEl.disabled = availableGoalEntries.length === 0;

    goalListEl.innerHTML = '';
    if (linkedGoalIds.length === 0) {
        goalListEl.innerHTML = '<div class="project-details-empty">No linked goals.</div>';
    } else {
        linkedGoalIds.forEach((goalId) => {
            const goalTitle = (typeof getGoalTextById === 'function')
                ? String(getGoalTextById(goalId) || '').trim()
                : '';
            const goalPath = (typeof getGoalPath === 'function')
                ? String(getGoalPath(goalId) || '').trim()
                : '';
            const displayTitle = goalTitle || `Unknown Goal (${goalId})`;
            const displayMeta = goalPath || goalId;

            const row = document.createElement('div');
            row.className = 'project-details-goal-row';
            row.setAttribute('role', 'button');
            row.tabIndex = 0;
            row.title = `Open goal: ${displayTitle}`;
            row.onclick = () => openProjectGoalFromDetails(goalId);
            row.onkeydown = (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    row.click();
                }
            };
            const goalTheme = (typeof getGoalThemeById === 'function')
                ? getGoalThemeById(goalId)
                : null;
            if (goalTheme && goalTheme.rgb) {
                row.style.borderColor = `rgba(${goalTheme.rgb}, 0.42)`;
                row.style.borderLeft = `4px solid rgb(${goalTheme.rgb})`;
                row.style.backgroundImage = goalTheme.gradient;
            }

            const textWrap = document.createElement('div');
            textWrap.className = 'project-details-goal-text';

            const title = document.createElement('div');
            title.className = 'project-details-goal-title';
            title.textContent = displayTitle;
            if (goalTheme && goalTheme.text) title.style.color = goalTheme.text;

            const meta = document.createElement('div');
            meta.className = 'project-details-goal-meta';
            meta.textContent = displayMeta;
            if (goalTheme && goalTheme.subtleText) meta.style.color = goalTheme.subtleText;

            textWrap.appendChild(title);
            textWrap.appendChild(meta);

            const actions = document.createElement('div');
            actions.className = 'project-details-goal-actions';

            const openBtn = document.createElement('button');
            openBtn.type = 'button';
            openBtn.className = 'project-details-inline-btn';
            openBtn.textContent = 'Open';
            openBtn.onclick = (event) => {
                event.preventDefault();
                event.stopPropagation();
                openProjectGoalFromDetails(goalId);
            };
            actions.appendChild(openBtn);

            const unlinkBtn = document.createElement('button');
            unlinkBtn.type = 'button';
            unlinkBtn.className = 'project-details-inline-btn danger';
            unlinkBtn.textContent = 'Unlink';
            unlinkBtn.onclick = (event) => {
                unlinkGoalFromProjectDetails(goalId, event);
            };
            actions.appendChild(unlinkBtn);

            row.appendChild(textWrap);
            row.appendChild(actions);
            goalListEl.appendChild(row);
        });
    }
}

function assignTaskToProject(taskId, projectId = null, options = {}) {
    const safeOptions = options && typeof options === 'object' ? options : {};
    const task = getTaskById(taskId);
    if (!task) return false;

    const normalizedProjectId = String(projectId || '').trim();
    const resolvedProjectId = normalizedProjectId || null;
    if (resolvedProjectId && !getProjectById(resolvedProjectId)) return false;
    const previousProjectId = String(task.projectId || '').trim() || null;
    if (previousProjectId === resolvedProjectId) return true;

    task.projectId = resolvedProjectId;
    const now = Date.now();
    if (typeof touchTask === 'function') touchTask(task, now);
    if (resolvedProjectId) {
        const linkedProject = getProjectById(resolvedProjectId);
        if (linkedProject) {
            if (typeof touchProject === 'function') touchProject(linkedProject, now);
            else linkedProject.updatedAt = now;
        }
    }
    if (previousProjectId && previousProjectId !== resolvedProjectId) {
        const previousProject = getProjectById(previousProjectId);
        if (previousProject) {
            if (typeof touchProject === 'function') touchProject(previousProject, now);
            else previousProject.updatedAt = now;
        }
    }

    if (safeOptions.persist !== false && typeof saveToStorage === 'function') saveToStorage();
    if (safeOptions.refreshInspector !== false && typeof updateInspector === 'function' && selectedNodeId === task.id) {
        updateInspector();
    }
    if (safeOptions.reRender !== false) {
        if (typeof render === 'function') render();
        if (typeof renderProjectsList === 'function') renderProjectsList();
    }
    return true;
}

function assignSelectedTaskToProject(projectId) {
    const selectedTask = (typeof getSelectedNode === 'function') ? getSelectedNode() : null;
    if (!selectedTask) {
        if (typeof showNotification === 'function') showNotification('Select a task first to assign it.');
        return;
    }
    const ok = assignTaskToProject(selectedTask.id, projectId, { reRender: true });
    if (!ok) {
        if (typeof showNotification === 'function') showNotification('Could not assign task to project.');
        return;
    }
    const project = getProjectById(projectId);
    const label = project ? project.name : 'No Project';
    if (typeof showNotification === 'function') showNotification(`Task linked to: ${label}`);
}

function clearSelectedTaskProject() {
    assignSelectedTaskToProject(null);
}

function createProjectFromInput() {
    const input = document.getElementById('new-project-input');
    if (!input) return;

    const name = String(input.value || '').trim();
    if (!name) {
        if (typeof showNotification === 'function') showNotification('Project name is required.');
        input.focus();
        return;
    }

    const selectedTask = (typeof getSelectedNode === 'function') ? getSelectedNode() : null;
    const goalIds = (selectedTask && Array.isArray(selectedTask.goalIds))
        ? Array.from(new Set(selectedTask.goalIds.filter(Boolean)))
        : [];

    const project = (typeof createProject === 'function')
        ? createProject(name, { goalIds, origin: 'manual' })
        : {
            id: 'proj_' + Date.now() + Math.random().toString(36).substr(2, 5),
            name: name,
            description: '',
            status: 'active',
            goalIds: goalIds,
            color: null,
            sortOrder: 0,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            archivedAt: null,
            origin: 'manual',
            aiUrgency: (typeof createDefaultAiUrgency === 'function')
                ? createDefaultAiUrgency('project')
                : null
        };

    if (!Array.isArray(projects)) projects = [];
    projects.push(project);
    if (typeof touchProject === 'function') touchProject(project);
    projectsPanelSelectedProjectId = project.id;
    closeProjectCardMenus();

    if (selectedTask) {
        selectedTask.projectId = project.id;
        if (typeof touchTask === 'function') touchTask(selectedTask);
    }

    if (typeof saveToStorage === 'function') saveToStorage();
    if (typeof render === 'function') render();
    if (typeof updateInspector === 'function' && selectedTask && selectedNodeId === selectedTask.id) updateInspector();
    renderProjectsList();

    input.value = '';
    if (typeof showNotification === 'function') showNotification(`Project created: ${project.name}`);
}

function renameProject(projectId) {
    const project = getProjectById(projectId);
    if (!project) return;
    const nextName = prompt('Rename project:', project.name || '');
    if (nextName === null) return;
    const trimmed = String(nextName || '').trim();
    if (!trimmed) return;
    project.name = trimmed.slice(0, 160);
    if (typeof touchProject === 'function') touchProject(project);
    else project.updatedAt = Date.now();
    if (typeof saveToStorage === 'function') saveToStorage();
    renderProjectsList();
}

function cycleProjectStatus(projectId) {
    const project = getProjectById(projectId);
    if (!project) return;
    const statuses = ['active', 'paused', 'completed', 'archived'];
    const current = String(project.status || 'active').trim().toLowerCase();
    const currentIndex = statuses.indexOf(current);
    const nextStatus = statuses[(currentIndex + 1 + statuses.length) % statuses.length];
    project.status = nextStatus;
    project.archivedAt = nextStatus === 'archived' ? Date.now() : null;
    if (typeof touchProject === 'function') touchProject(project);
    else project.updatedAt = Date.now();
    if (typeof saveToStorage === 'function') saveToStorage();
    renderProjectsList();
}

function openProjectFirstTask(projectId) {
    const activeTasks = nodes
        .filter(task => task && task.projectId === projectId)
        .sort((a, b) => (a.title || '').localeCompare(b.title || '', undefined, { sensitivity: 'base' }));

    if (activeTasks.length === 0) {
        if (typeof showNotification === 'function') showNotification('No active tasks in this project.');
        return;
    }

    const targetTask = activeTasks[0];
    if (typeof jumpToTask === 'function') jumpToTask(targetTask.id);
    else if (typeof selectNode === 'function') selectNode(targetTask.id);
}

function deleteProject(projectId) {
    const project = getProjectById(projectId);
    if (!project) return;

    const linkedTaskCount = nodes.filter(task => task && task.projectId === projectId).length
        + archivedNodes.filter(task => task && task.projectId === projectId).length;
    const confirmMsg = linkedTaskCount > 0
        ? `Delete "${project.name}" and unassign ${linkedTaskCount} linked task(s)?`
        : `Delete "${project.name}"?`;
    if (!confirm(confirmMsg)) return;
    if (projectDetailsProjectId === projectId) closeProjectDetailsModal();
    if (String(projectsPanelSelectedProjectId || '') === String(projectId || '')) projectsPanelSelectedProjectId = null;
    if (String(projectCardOpenMenuId || '') === String(projectId || '')) projectCardOpenMenuId = null;

    projects = (Array.isArray(projects) ? projects : []).filter(item => item && item.id !== projectId);
    nodes.forEach(task => {
        if (task && task.projectId === projectId) {
            task.projectId = null;
            if (typeof touchTask === 'function') touchTask(task);
        }
    });
    archivedNodes.forEach(task => {
        if (task && task.projectId === projectId) {
            task.projectId = null;
            if (typeof touchTask === 'function') touchTask(task);
        }
    });

    if (typeof saveToStorage === 'function') saveToStorage();
    if (typeof render === 'function') render();
    if (typeof updateInspector === 'function') updateInspector();
    renderProjectsList();
}

function closeProjectCardMenus() {
    projectCardOpenMenuId = null;
    document.querySelectorAll('.project-card-menu.show').forEach(menu => menu.classList.remove('show'));
}

function bindProjectCardMenuDismiss() {
    if (projectCardMenuDismissBound) return;
    projectCardMenuDismissBound = true;
    window.addEventListener('click', (event) => {
        if (!event.target.closest('.project-card-menu-wrap')) closeProjectCardMenus();
    });
    window.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') closeProjectCardMenus();
    });
}

function toggleProjectCardMenu(projectId) {
    const normalizedId = String(projectId || '').trim();
    if (!normalizedId) return;

    const allMenus = Array.from(document.querySelectorAll('.project-card-menu'));
    const targetMenu = allMenus.find(menu => String(menu.dataset.projectMenu || '') === normalizedId);
    if (!targetMenu) return;

    const shouldOpen = !targetMenu.classList.contains('show');
    allMenus.forEach(menu => menu.classList.remove('show'));

    if (shouldOpen) {
        targetMenu.classList.add('show');
        projectCardOpenMenuId = normalizedId;
    } else {
        projectCardOpenMenuId = null;
    }
}

function createProjectMenuItem(label, handler, isDanger = false) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'project-card-menu-item';
    if (isDanger) button.classList.add('danger');
    button.textContent = label;
    button.onclick = (event) => {
        event.stopPropagation();
        closeProjectCardMenus();
        if (typeof handler === 'function') handler();
    };
    return button;
}

function createProjectStatItem(count, label, tone = 'neutral') {
    const item = document.createElement('div');
    item.className = `project-stat tone-${tone}`;

    const dot = document.createElement('span');
    dot.className = 'project-stat-dot';
    item.appendChild(dot);

    const countEl = document.createElement('span');
    countEl.className = 'project-stat-count';
    countEl.textContent = String(count);
    item.appendChild(countEl);

    const labelEl = document.createElement('span');
    labelEl.className = 'project-stat-label';
    labelEl.textContent = label;
    item.appendChild(labelEl);

    return item;
}

function renderProjectsList() {
    bindProjectCardMenuDismiss();
    const container = document.getElementById('project-list-content');
    const selectionEl = document.getElementById('project-selection-status');
    if (!container) return;
    bindProjectsPanelListScroll();
    syncProjectsPanelTopCollapseFromScroll();
    syncProjectsPanelFilterControls();

    const selectedTask = (typeof getSelectedNode === 'function') ? getSelectedNode() : null;
    const selectedTaskCount = (selectedIds && typeof selectedIds.size === 'number')
        ? selectedIds.size
        : (selectedTask ? 1 : 0);

    if (selectionEl) {
        selectionEl.innerHTML = '';
        selectionEl.classList.toggle('has-selection', selectedTaskCount > 0);
        if (!selectedTask) {
            if (selectedTaskCount > 1) {
                selectionEl.textContent = `${selectedTaskCount} tasks selected. Use a project's Assign Selected button for bulk assignment.`;
            } else {
                selectionEl.textContent = 'No task selected. Select a task on the canvas to assign it to a project.';
            }
        } else if (selectedTaskCount > 1) {
            selectionEl.textContent = `${selectedTaskCount} tasks selected. Use a project's Assign Selected button for bulk assignment.`;
        } else {
            const project = selectedTask.projectId ? getProjectById(selectedTask.projectId) : null;
            const meta = document.createElement('span');
            meta.className = 'project-selection-meta';
            meta.textContent = `Selected: ${selectedTask.title || 'Untitled Task'} • Project: ${project ? project.name : 'None'}`;
            selectionEl.appendChild(meta);

            const clearBtn = document.createElement('button');
            clearBtn.type = 'button';
            clearBtn.className = 'project-selection-clear-btn';
            clearBtn.textContent = 'Clear Assignment';
            clearBtn.onclick = () => clearSelectedTaskProject();
            selectionEl.appendChild(clearBtn);
        }
    }

    const projectEntries = getProjectsPanelVisibleEntries();
    const visibleProjects = projectEntries.visibleEntries;
    const hasAnyProjects = projectEntries.allEntries.length > 0;

    container.innerHTML = '';
    if (!hasAnyProjects) {
        closeProjectCardMenus();
        const empty = document.createElement('div');
        empty.className = 'project-list-empty';
        empty.innerHTML = '<strong>No projects yet.</strong><span>Create one to start organizing tasks.</span>';
        container.appendChild(empty);
        if (isProjectDetailsModalOpen()) renderProjectDetailsModal();
        return;
    }
    if (visibleProjects.length === 0) {
        closeProjectCardMenus();
        const empty = document.createElement('div');
        empty.className = 'project-list-empty';
        empty.innerHTML = '<strong>No projects match this urgency filter.</strong><span>Change the filter to view more projects.</span>';
        container.appendChild(empty);
        if (isProjectDetailsModalOpen()) renderProjectDetailsModal();
        return;
    }

    const preferredSelectionId = String(projectDetailsProjectId || (selectedTask && selectedTask.projectId) || projectsPanelSelectedProjectId || '').trim();
    const hasPreferredSelection = visibleProjects.some(entry => String(entry && entry.project && entry.project.id || '') === preferredSelectionId);
    if (hasPreferredSelection) {
        projectsPanelSelectedProjectId = preferredSelectionId;
    } else if (!visibleProjects.some(entry => String(entry && entry.project && entry.project.id || '') === String(projectsPanelSelectedProjectId || ''))) {
        projectsPanelSelectedProjectId = String(visibleProjects[0] && visibleProjects[0].project && visibleProjects[0].project.id || '');
    }

    visibleProjects.forEach(({ project, urgency }) => {
        if (!project || !project.id) return;
        const projectId = String(project.id);
        const rawStatus = String(project.status || 'active').trim().toLowerCase();
        const status = Object.prototype.hasOwnProperty.call(PROJECT_STATUS_LABELS, rawStatus) ? rawStatus : 'active';
        const stats = getProjectTaskStats(project.id);
        const isSelected = projectId === String(projectsPanelSelectedProjectId || '');
        const urgencyMeta = urgency || getProjectUrgencyMeta(project.id);

        const card = document.createElement('article');
        card.className = `project-list-item status-${status} urgency-level-${urgencyMeta.level || 1}${isSelected ? ' is-selected' : ''}`;
        card.dataset.projectId = projectId;
        card.tabIndex = 0;
        card.setAttribute('role', 'button');
        card.setAttribute('aria-label', `Open details for ${project.name || 'Untitled Project'} (${urgencyMeta.label || 'Lowest'} urgency)`);

        const head = document.createElement('div');
        head.className = 'project-list-head';

        const titleWrap = document.createElement('div');
        titleWrap.className = 'project-list-title-wrap';

        const title = document.createElement('div');
        title.className = 'project-list-title';
        title.textContent = project.name || 'Untitled Project';
        titleWrap.appendChild(title);

        const badgesRow = document.createElement('div');
        badgesRow.className = 'project-list-badges';

        const badge = document.createElement('button');
        badge.type = 'button';
        badge.className = `project-status-badge project-status-cycle-btn status-${status}`;
        badge.textContent = PROJECT_STATUS_LABELS[status] || 'Active';
        badge.setAttribute('aria-label', `Cycle status for ${project.name || 'Untitled Project'}`);
        badge.title = 'Click to cycle status';
        badge.onclick = (event) => {
            event.stopPropagation();
            projectsPanelSelectedProjectId = project.id;
            closeProjectCardMenus();
            cycleProjectStatus(project.id);
        };
        badgesRow.appendChild(badge);

        const urgencyBadge = document.createElement('span');
        urgencyBadge.className = `project-urgency-chip level-${urgencyMeta.level || 1}`;
        const urgencyDot = document.createElement('span');
        urgencyDot.className = 'project-urgency-chip-dot';
        urgencyBadge.appendChild(urgencyDot);
        const urgencyText = document.createElement('span');
        urgencyText.className = 'project-urgency-chip-text';
        urgencyText.textContent = `${urgencyMeta.tag || 'LOWEST'} ${urgencyMeta.score || 0}`;
        urgencyBadge.appendChild(urgencyText);
        badgesRow.appendChild(urgencyBadge);

        titleWrap.appendChild(badgesRow);

        const menuWrap = document.createElement('div');
        menuWrap.className = 'project-card-menu-wrap';

        const menuBtn = document.createElement('button');
        menuBtn.type = 'button';
        menuBtn.className = 'project-card-menu-btn';
        menuBtn.setAttribute('aria-label', `Project options for ${project.name || 'Untitled Project'}`);
        menuBtn.textContent = '⋯';
        menuBtn.onclick = (event) => {
            event.stopPropagation();
            toggleProjectCardMenu(projectId);
        };
        menuWrap.appendChild(menuBtn);

        const menu = document.createElement('div');
        menu.className = 'project-card-menu';
        menu.dataset.projectMenu = projectId;
        if (String(projectCardOpenMenuId || '') === projectId) menu.classList.add('show');
        menu.appendChild(createProjectMenuItem('Rename', () => {
            projectsPanelSelectedProjectId = project.id;
            renameProject(project.id);
        }));
        const divider = document.createElement('div');
        divider.className = 'project-card-menu-separator';
        menu.appendChild(divider);
        menu.appendChild(createProjectMenuItem('Delete', () => deleteProject(project.id), true));
        menuWrap.appendChild(menu);

        head.appendChild(titleWrap);
        head.appendChild(menuWrap);

        const statsRow = document.createElement('div');
        statsRow.className = 'project-list-stats';
        statsRow.appendChild(createProjectStatItem(stats.active, 'active', 'active'));
        statsRow.appendChild(createProjectStatItem(stats.done, 'done', 'done'));
        statsRow.appendChild(createProjectStatItem(stats.total, 'total', 'total'));
        statsRow.appendChild(createProjectStatItem(urgencyMeta.score || 0, 'urgency', 'urgency'));

        const actions = document.createElement('div');
        actions.className = 'project-list-actions';

        const openBtn = document.createElement('button');
        openBtn.type = 'button';
        openBtn.className = 'project-action-btn project-open-btn';
        openBtn.innerHTML = '<span class="project-action-icon" aria-hidden="true">↗</span><span>Open</span>';
        openBtn.onclick = (event) => {
            event.stopPropagation();
            projectsPanelSelectedProjectId = project.id;
            closeProjectCardMenus();
            renderProjectsList();
            openProjectFirstTask(project.id);
        };
        actions.appendChild(openBtn);

        const assignBtn = document.createElement('button');
        assignBtn.type = 'button';
        assignBtn.className = 'project-action-btn project-assign-btn';
        assignBtn.innerHTML = '<span class="project-action-icon" aria-hidden="true">✓</span><span>Assign Selected</span>';
        assignBtn.onclick = (event) => {
            event.stopPropagation();
            projectsPanelSelectedProjectId = project.id;
            closeProjectCardMenus();
            renderProjectsList();
            assignSelectedTaskToProject(project.id);
        };
        actions.appendChild(assignBtn);

        card.appendChild(head);
        card.appendChild(statsRow);
        card.appendChild(actions);

        card.onclick = () => {
            projectsPanelSelectedProjectId = project.id;
            closeProjectCardMenus();
            renderProjectsList();
            openProjectDetailsModal(project.id);
        };
        card.onkeydown = (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                card.click();
            }
        };

        container.appendChild(card);
    });

    if (isProjectDetailsModalOpen()) renderProjectDetailsModal();
}

function togglePinItem(type, id) {
    let item;
    if (type === 'task') item = nodes.find(n => n.id === id) || archivedNodes.find(n => n.id === id);
    else if (type === 'note') item = notes.find(n => n.id === id);
    else if (type === 'habit') item = habits.find(h => h.id === id);

    if (type === 'habit' && item) {
        const archived = typeof isHabitArchived === 'function'
            ? isHabitArchived(item)
            : (Number(item && item.archivedAt) > 0);
        if (archived && !item.isPinned) {
            showNotification('Archived habits cannot be pinned');
            return;
        }
    }

    if (item) {
        item.isPinned = !item.isPinned;
        showNotification(item.isPinned ? `${type.charAt(0).toUpperCase() + type.slice(1)} Pinned` : "Unpinned");
    }

    saveToStorage();
    renderPinnedWindow();

    // Update source panels if open
    if (type === 'habit' && !document.getElementById('habits-panel').classList.contains('hidden')) {
        renderHabits();
    }
}

function isPinned(type, id) {
    let item;
    if (type === 'task') item = nodes.find(n => n.id === id) || archivedNodes.find(n => n.id === id);
    else if (type === 'note') item = notes.find(n => n.id === id);
    else if (type === 'habit') item = habits.find(h => h.id === id);
    return item ? !!item.isPinned : false;
}

function sanitizePinnedText(value) {
    if (typeof escapeHtml === 'function') return escapeHtml(value);
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function openPinnedSourceItem(openFn) {
    if (typeof closeRightDockPanel === 'function') {
        closeRightDockPanel('navigator-panel');
    } else {
        const panel = document.getElementById('navigator-panel');
        if (panel) panel.classList.add('hidden');
    }

    if (typeof openFn === 'function') {
        setTimeout(() => openFn(), 0);
    }
}

function renderPinnedWindow() {
    const container = document.getElementById('pinned-content');
    if (!container) return;

    container.innerHTML = '';

    const pinnedItemsList = [];
    let removedArchivedPins = false;
    // Collect all items with isPinned = true
    nodes.concat(archivedNodes).forEach(n => { if (n.isPinned) pinnedItemsList.push({ type: 'task', id: n.id }); });
    notes.forEach(n => { if (n.isPinned) pinnedItemsList.push({ type: 'note', id: n.id }); });
    habits.forEach(h => {
        const archived = typeof isHabitArchived === 'function'
            ? isHabitArchived(h)
            : (Number(h && h.archivedAt) > 0);
        if (h.isPinned && !archived) pinnedItemsList.push({ type: 'habit', id: h.id });
        if (h.isPinned && archived) {
            h.isPinned = false;
            removedArchivedPins = true;
        }
    });
    if (removedArchivedPins) saveToStorage();

    if (pinnedItemsList.length === 0) {
        container.innerHTML = '<div style="text-align:center; color:#666; padding:20px; font-size:11px;">No pinned items.<br><br>Pin tasks, notes, or habits from their panels.</div>';
        return;
    }

    pinnedItemsList.forEach(item => {
        if (item.type === 'task') {
            renderPinnedTask(container, item.id);
        } else if (item.type === 'note') {
            renderPinnedNote(container, item.id);
        } else if (item.type === 'habit') {
            renderPinnedHabit(container, item.id);
        }
    });
}

function renderPinnedTask(container, taskId) {
    const node = nodes.find(n => n.id === taskId) || archivedNodes.find(n => n.id === taskId);
    if (!node) {
        // Task was deleted, remove from pinned
        pinnedItems = pinnedItems.filter(p => !(p.type === 'task' && p.id === taskId));
        saveToStorage();
        return;
    }

    const el = document.createElement('div');
    el.className = 'pinned-node pinned-native-task';

    const taskCardStyle = (typeof getTaskColorBoxInlineStyle === 'function')
        ? getTaskColorBoxInlineStyle(node)
        : '';
    if (taskCardStyle) el.setAttribute('style', taskCardStyle);

    let badgesHtml = '';
    if (!node.completed) {
        if (node._isUrgent) badgesHtml += `<span class="badge urgent-badge">URGENT</span>`;
        else if (node._isCritical) badgesHtml += `<span class="badge critical-badge">CP</span>`;
    }

    const totalTime = getTotalTime(node);
    if (totalTime > 0) {
        badgesHtml += `<span class="badge time-badge">${formatTime(totalTime)}</span>`;
    }

    if (node.dueDate && !node.completed) {
        const due = new Date(node.dueDate);
        const dateStr = due.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
        badgesHtml += `<span class="badge date-badge">📅 ${dateStr}</span>`;
    }

    const title = sanitizePinnedText(node.title || '(Untitled)');
    const subtleStyle = (typeof getTaskSubtleTextInlineStyle === 'function')
        ? getTaskSubtleTextInlineStyle(node)
        : 'color:#94a3b8;';

    el.innerHTML = `
                <button class="pinned-unpin" onclick="event.stopPropagation(); togglePinItem('task', '${taskId}')">✕</button>
                <div class="pinned-native-task-title">${node.completed ? '✅ ' : ''}${title}</div>
                <div class="pinned-native-task-badges">${badgesHtml || `<span class="pinned-native-task-meta" style="${subtleStyle}">No markers</span>`}</div>
            `;

    el.onclick = () => {
        openPinnedSourceItem(() => {
            if (typeof jumpToTask === 'function') jumpToTask(taskId);
            else if (typeof selectNode === 'function') selectNode(taskId);
        });
    };

    container.appendChild(el);
}

function renderPinnedNote(container, noteId) {
    const note = notes.find(n => n.id === noteId);
    if (!note) {
        pinnedItems = pinnedItems.filter(p => !(p.type === 'note' && p.id === noteId));
        saveToStorage();
        return;
    }

    const el = document.createElement('div');
    el.className = 'pinned-note pinned-note-simple';
    const noteTitle = sanitizePinnedText(note.title || '(Untitled)');
    const linkMetrics = (typeof getNoteLinkMetrics === 'function')
        ? getNoteLinkMetrics(note)
        : {
            taskCount: Array.isArray(note.taskIds) ? note.taskIds.length : 0,
            habitCount: 0,
            urgentTaskCount: 0,
            hasTaskLinks: Array.isArray(note.taskIds) && note.taskIds.length > 0,
            hasHabitLinks: false,
            isMixedLinks: false
        };

    if (linkMetrics.hasTaskLinks) el.classList.add('has-task-links');
    if (linkMetrics.hasHabitLinks) el.classList.add('has-habit-links');
    if (linkMetrics.isMixedLinks) el.classList.add('has-mixed-links');
    if (linkMetrics.urgentTaskCount > 0) el.classList.add('has-urgent-links');

    const linkChips = [];
    if (linkMetrics.taskCount > 0) {
        linkChips.push(`<span class="note-link-chip task" title="${linkMetrics.taskCount} linked task(s)">T:${linkMetrics.taskCount}</span>`);
    }
    if (linkMetrics.habitCount > 0) {
        linkChips.push(`<span class="note-link-chip habit" title="${linkMetrics.habitCount} linked habit(s)">H:${linkMetrics.habitCount}</span>`);
    }
    if (linkMetrics.urgentTaskCount > 0) {
        linkChips.push(`<span class="note-link-chip urgent" title="${linkMetrics.urgentTaskCount} linked urgent task(s)">⚠ ${linkMetrics.urgentTaskCount}</span>`);
    }
    const linkChipsHtml = linkChips.length > 0
        ? `<div class="pinned-note-link-chips">${linkChips.join('')}</div>`
        : '';

    el.innerHTML = `
                <button class="pinned-unpin" onclick="event.stopPropagation(); togglePinItem('note', '${noteId}')">✕</button>
                <div class="pinned-note-title">${noteTitle}</div>
                ${linkChipsHtml}
            `;

    el.onclick = () => {
        openPinnedSourceItem(() => {
            if (typeof toggleNotesPanel === 'function') toggleNotesPanel(true);
            openNoteEditor(noteId);
        });
    };

    container.appendChild(el);
}

function renderPinnedHabit(container, habitId) {
    const h = habits.find(habit => habit.id === habitId);
    const archived = typeof isHabitArchived === 'function'
        ? isHabitArchived(h)
        : (Number(h && h.archivedAt) > 0);
    if (!h || archived) {
        if (h) h.isPinned = false;
        pinnedItems = pinnedItems.filter(p => !(p.type === 'habit' && p.id === habitId));
        saveToStorage();
        return;
    }

    const metrics = getHabitMetrics(h);
    const isDone = metrics.isDone;
    const percent = metrics.percent;
    const progressLabel = typeof getHabitProgressLabel === 'function'
        ? getHabitProgressLabel(h, metrics)
        : `${percent}%`;
    const goalName = h.goalId ? getGoalTextById(h.goalId) : '';
    const goalStyle = h.goalId ? getGoalColorBoxInlineStyle(h.goalId) : '';
    const habitAccentHex = (typeof getEffectiveHabitColorHex === 'function')
        ? getEffectiveHabitColorHex(h)
        : ((typeof getHabitColorHex === 'function') ? getHabitColorHex(h) : '#4a8deb');
    const habitAccentRgb = (typeof goalHexToRgbString === 'function')
        ? goalHexToRgbString(habitAccentHex)
        : '74, 141, 235';

    const el = document.createElement('div');
    el.className = `pinned-node pinned-habit-compact ${isDone ? 'done-today' : ''}`;
    el.style.setProperty('--habit-rgb', habitAccentRgb);
    el.style.setProperty('--habit-accent', habitAccentHex);

    el.innerHTML = `
                <button class="pinned-unpin" onclick="event.stopPropagation(); togglePinItem('habit', '${habitId}')">✕</button>
                <div class="pinned-habit-cad-header">
                    <div class="pinned-habit-compact-head">
                        <div class="pinned-habit-compact-title">${sanitizePinnedText(h.title || '(Untitled)')}</div>
                        <div class="pinned-habit-compact-pill ${isDone ? 'done' : ''}">${percent}%</div>
                    </div>
                </div>
                <div class="pinned-habit-cad-body">
                    <div class="pinned-habit-compact-meta">${progressLabel}</div>
                    <div class="pinned-habit-compact-progress-track">
                        <div class="pinned-habit-compact-progress-fill ${isDone ? 'done' : ''}" style="width:${percent}%"></div>
                    </div>
                    <div class="pinned-habit-compact-footer">
                        <div class="pinned-habit-compact-goal">
                            <div class="pinned-habit-link-box">
                                <span class="pinned-habit-link-label">LINK:</span>
                                ${goalName ? `<span class="habit-goal-link" style="${goalStyle}" title="${sanitizePinnedText(goalName)}">${sanitizePinnedText(goalName)}</span>` : '<span class="habit-goal-link muted">NULL</span>'}
                            </div>
                        </div>
                        ${h.noteIds && h.noteIds.length > 0 ? `<span class="pinned-habit-compact-notes" onclick="event.stopPropagation(); showHabitNotes('${habitId}')" title="View linked notes">📝 ${h.noteIds.length}</span>` : ''}
                    </div>
                </div>
            `;

    el.onclick = () => {
        openPinnedSourceItem(() => {
            if (typeof focusHabitInPanel === 'function') {
                focusHabitInPanel(habitId);
            } else if (typeof toggleHabits === 'function') {
                toggleHabits(true);
            }
        });
    };

    container.appendChild(el);
}
