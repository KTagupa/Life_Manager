// --- NODE GROUPS LOGIC ---
const TASK_GROUP_NODE_WIDTH = 200;
const TASK_GROUP_NODE_HEIGHT = 124;
const TASK_GROUP_VIEW_PADDING = 48;
let lastTaskGroupsRenderSignature = '';

function getTaskGroupId(nodeIds) {
    const ids = (Array.isArray(nodeIds) ? nodeIds : [])
        .map(id => String(id || '').trim())
        .filter(Boolean)
        .sort();
    return `group_${ids.map(id => encodeURIComponent(id)).join('|')}`;
}

function getTaskGroupTitle(groupNodes) {
    const sorted = [...groupNodes].sort((a, b) => {
        const titleCompare = (a.title || '').localeCompare((b.title || ''), undefined, { sensitivity: 'base' });
        if (titleCompare !== 0) return titleCompare;
        return a.id.localeCompare(b.id);
    });
    const activeNode = sorted.find(n => !n.completed);
    const titleNode = activeNode || sorted[0];
    return (titleNode && titleNode.title) ? titleNode.title : 'Unnamed Task';
}

function getEarliestActiveDueTime(groupNodes) {
    let earliest = Number.POSITIVE_INFINITY;
    groupNodes.forEach(node => {
        if (node.completed || !node.dueDate) return;
        const dueTime = new Date(node.dueDate).getTime();
        if (Number.isFinite(dueTime) && dueTime < earliest) earliest = dueTime;
    });
    return earliest;
}

function scoreTaskGroupPriority(group) {
    if (!group) return 0;
    const manual = Number(group.activeManualUrgentCount) || 0;
    const urgent = Number(group.activeUrgentCount) || 0;
    const critical = Number(group.activeCriticalCount) || 0;
    const incomplete = Number(group.activeIncompleteCount) || 0;
    const maxReferenceDue = 4102444800000; // Jan 1, 2100 UTC
    const dueRank = Number.isFinite(group.earliestActiveDueTime)
        ? Math.max(0, Math.floor((maxReferenceDue - group.earliestActiveDueTime) / 86400000))
        : 0;

    return (manual * 1_000_000_000) +
        (urgent * 1_000_000) +
        (critical * 1_000) +
        incomplete +
        (Math.min(dueRank, 999) / 1000);
}

function compareTaskGroupsByPriority(a, b) {
    if (b.activeManualUrgentCount !== a.activeManualUrgentCount) return b.activeManualUrgentCount - a.activeManualUrgentCount;
    if (b.activeUrgentCount !== a.activeUrgentCount) return b.activeUrgentCount - a.activeUrgentCount;
    if (b.activeCriticalCount !== a.activeCriticalCount) return b.activeCriticalCount - a.activeCriticalCount;
    if (b.activeIncompleteCount !== a.activeIncompleteCount) return b.activeIncompleteCount - a.activeIncompleteCount;

    const aDue = Number.isFinite(a.earliestActiveDueTime) ? a.earliestActiveDueTime : Number.POSITIVE_INFINITY;
    const bDue = Number.isFinite(b.earliestActiveDueTime) ? b.earliestActiveDueTime : Number.POSITIVE_INFINITY;
    if (aDue !== bDue) return aDue - bDue;

    const titleCompare = (a.title || '').localeCompare((b.title || ''), undefined, { sensitivity: 'base' });
    if (titleCompare !== 0) return titleCompare;

    return a.id.localeCompare(b.id);
}

function getDependencyNodeIdForGrouping(dep) {
    if (typeof dep === 'string' || typeof dep === 'number') {
        return String(dep).trim();
    }
    if (!dep || typeof dep !== 'object') return '';
    return String(dep.id || dep.taskId || dep.nodeId || dep.parentId || dep.depId || '').trim();
}

function collectConnectedNodes(startId, visited, nodeById, adjacency) {
    const groupNodes = [];
    const queue = [startId];

    while (queue.length > 0) {
        const id = queue.shift();
        if (visited.has(id)) continue;
        visited.add(id);

        const node = nodeById.get(id);
        if (!node) continue;
        groupNodes.push(node);

        const neighbors = adjacency.get(id);
        if (!neighbors) continue;
        neighbors.forEach(neighborId => {
            if (!visited.has(neighborId)) queue.push(neighborId);
        });
    }

    return groupNodes;
}

function getTaskGroupsRenderSignature() {
    const nodeSignature = (Array.isArray(nodes) ? nodes : [])
        .map((node) => {
            const depIds = (Array.isArray(node && node.dependencies) ? node.dependencies : [])
                .map(getDependencyNodeIdForGrouping)
                .filter(Boolean)
                .sort()
                .join(',');
            return [
                String(node && node.id || '').trim(),
                String(node && node.title || '').trim(),
                node && node.completed ? '1' : '0',
                node && node.isManualUrgent ? '1' : '0',
                node && node._isUrgent ? '1' : '0',
                node && node._isCritical ? '1' : '0',
                String(node && node.dueDate || '').trim(),
                depIds
            ].join('~');
        })
        .sort()
        .join('||');

    const focusSignature = (typeof taskGroupFocusState !== 'undefined' && taskGroupFocusState && taskGroupFocusState.active)
        ? `focus:${String(taskGroupFocusState.activeGroupId || '').trim()}:${Number.isInteger(taskGroupFocusState.currentIndex) ? taskGroupFocusState.currentIndex : -1}`
        : 'focus:off';
    const hiddenSignature = `hidden:${Array.from(hiddenNodeGroups || []).map(id => String(id || '').trim()).filter(Boolean).sort().join(',')}`;

    return `${nodeSignature}###${focusSignature}###${hiddenSignature}`;
}

function buildTaskGroups({ includeSingles = true, sort = 'priority' } = {}) {
    const nodeById = new Map(nodes.map(node => [node.id, node]));
    const adjacency = new Map();
    nodes.forEach(node => adjacency.set(node.id, new Set()));

    nodes.forEach(node => {
        (node.dependencies || []).forEach(dep => {
            const depId = getDependencyNodeIdForGrouping(dep);
            if (!depId || depId === node.id || !nodeById.has(depId)) return;
            adjacency.get(node.id).add(depId);
            adjacency.get(depId).add(node.id);
        });
    });

    const visited = new Set();
    const groups = [];

    nodes.forEach(node => {
        if (visited.has(node.id)) return;
        const groupNodes = collectConnectedNodes(node.id, visited, nodeById, adjacency);
        if (!includeSingles && groupNodes.length <= 1) return;

        const sortedNodeIds = groupNodes.map(n => n.id).sort();
        const activeNodes = groupNodes.filter(n => !n.completed);
        const earliestActiveDueTime = getEarliestActiveDueTime(groupNodes);

        const group = {
            id: getTaskGroupId(sortedNodeIds),
            nodeIds: sortedNodeIds,
            nodes: groupNodes,
            title: getTaskGroupTitle(groupNodes),
            totalCount: groupNodes.length,
            completedCount: groupNodes.filter(n => n.completed).length,
            activeManualUrgentCount: activeNodes.filter(n => n.isManualUrgent).length,
            activeUrgentCount: activeNodes.filter(n => n._isUrgent).length,
            activeCriticalCount: activeNodes.filter(n => n._isCritical).length,
            activeIncompleteCount: activeNodes.length,
            earliestActiveDueTime
        };

        group.priorityScore = scoreTaskGroupPriority(group);
        groups.push(group);
    });

    if (sort === 'priority') groups.sort(compareTaskGroupsByPriority);
    else if (sort === 'title') {
        groups.sort((a, b) => {
            const titleCompare = (a.title || '').localeCompare((b.title || ''), undefined, { sensitivity: 'base' });
            if (titleCompare !== 0) return titleCompare;
            return a.id.localeCompare(b.id);
        });
    }

    return groups;
}

function detectConnectedGroups() {
    return buildTaskGroups({ includeSingles: false, sort: 'priority' });
}

function getTaskGroupFocusSnapshot({ refitOnMissing = false } = {}) {
    const groups = buildTaskGroups({ includeSingles: true, sort: 'priority' });
    const groupIds = groups.map(group => group.id);

    if (!taskGroupFocusState.active) {
        taskGroupFocusState.groupIds = groupIds;
        taskGroupFocusState.currentIndex = -1;
        taskGroupFocusState.activeGroupId = null;
        return { groups, activeGroup: null, activeIndex: -1 };
    }

    if (groups.length === 0) {
        taskGroupFocusState.active = false;
        taskGroupFocusState.groupIds = [];
        taskGroupFocusState.currentIndex = -1;
        taskGroupFocusState.activeGroupId = null;
        return { groups, activeGroup: null, activeIndex: -1 };
    }

    let activeIndex = groupIds.indexOf(taskGroupFocusState.activeGroupId);
    let activeGroupChanged = false;

    if (activeIndex === -1) {
        const fallback = Number.isInteger(taskGroupFocusState.currentIndex) ? taskGroupFocusState.currentIndex : 0;
        activeIndex = ((fallback % groups.length) + groups.length) % groups.length;
        activeGroupChanged = true;
    }

    taskGroupFocusState.groupIds = groupIds;
    taskGroupFocusState.currentIndex = activeIndex;
    taskGroupFocusState.activeGroupId = groupIds[activeIndex];

    const activeGroup = groups[activeIndex] || null;
    if (activeGroupChanged && refitOnMissing && activeGroup) {
        fitCameraToGroup(activeGroup);
    }

    return { groups, activeGroup, activeIndex };
}

function updateTaskGroupFocusControls(snapshot = null) {
    const controls = document.getElementById('task-group-focus-controls');
    if (!controls) return;

    const labelEl = document.getElementById('task-group-focus-label');
    const countEl = document.getElementById('task-group-focus-count');
    const nextSnapshot = snapshot || getTaskGroupFocusSnapshot({ refitOnMissing: false });

    if (!taskGroupFocusState.active || !nextSnapshot.activeGroup) {
        controls.classList.add('hidden');
        controls.setAttribute('aria-hidden', 'true');
        if (labelEl) labelEl.textContent = 'Task Group Focus';
        if (countEl) countEl.textContent = '0 / 0';
        return;
    }

    controls.classList.remove('hidden');
    controls.setAttribute('aria-hidden', 'false');
    if (labelEl) labelEl.textContent = nextSnapshot.activeGroup.title || 'Task Group';
    if (countEl) countEl.textContent = `${nextSnapshot.activeIndex + 1} / ${nextSnapshot.groups.length}`;
}

function fitCameraToGroup(group) {
    if (!group || !Array.isArray(group.nodes) || group.nodes.length === 0) return;

    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;

    group.nodes.forEach(node => {
        minX = Math.min(minX, node.x);
        minY = Math.min(minY, node.y);
        maxX = Math.max(maxX, node.x + TASK_GROUP_NODE_WIDTH);
        maxY = Math.max(maxY, node.y + TASK_GROUP_NODE_HEIGHT);
    });

    const boundsWidth = Math.max(1, maxX - minX);
    const boundsHeight = Math.max(1, maxY - minY);
    const viewportWidth = Math.max(1, window.innerWidth);
    const viewportHeight = Math.max(1, window.innerHeight);
    const paddedWidth = Math.max(1, viewportWidth - (TASK_GROUP_VIEW_PADDING * 2));
    const paddedHeight = Math.max(1, viewportHeight - (TASK_GROUP_VIEW_PADDING * 2));
    const scaleX = paddedWidth / boundsWidth;
    const scaleY = paddedHeight / boundsHeight;
    const targetScale = Math.min(3, Math.max(0.2, Math.min(scaleX, scaleY)));

    const centerX = minX + (boundsWidth / 2);
    const centerY = minY + (boundsHeight / 2);

    scale = targetScale;
    panX = (viewportWidth / 2) - (centerX * scale);
    panY = (viewportHeight / 2) - (centerY * scale);

    if (typeof updateTransform === 'function') updateTransform();
}

function refreshGroupsTabIfVisible({ force = false } = {}) {
    const panel = document.getElementById('navigator-panel');
    if (!panel || panel.classList.contains('hidden')) return;
    if (currentNavigatorTab !== 'groups') return;
    const nextSignature = getTaskGroupsRenderSignature();
    if (!force && nextSignature === lastTaskGroupsRenderSignature) return;
    detectAndRenderNodeGroups();
}

function enterTaskGroupFocusMode(groupId) {
    const groups = buildTaskGroups({ includeSingles: true, sort: 'priority' });
    if (groups.length === 0) {
        taskGroupFocusState.active = false;
        taskGroupFocusState.groupIds = [];
        taskGroupFocusState.currentIndex = -1;
        taskGroupFocusState.activeGroupId = null;
        updateTaskGroupFocusControls({ groups, activeGroup: null, activeIndex: -1 });
        render();
        return;
    }

    let targetIndex = groups.findIndex(group => group.id === groupId);
    if (targetIndex === -1) targetIndex = 0;

    taskGroupFocusState.active = true;
    taskGroupFocusState.groupIds = groups.map(group => group.id);
    taskGroupFocusState.currentIndex = targetIndex;
    taskGroupFocusState.activeGroupId = taskGroupFocusState.groupIds[targetIndex];

    const activeGroup = groups[targetIndex];
    fitCameraToGroup(activeGroup);
    updateTaskGroupFocusControls({ groups, activeGroup, activeIndex: targetIndex });
    render();
    refreshGroupsTabIfVisible({ force: true });
}

function focusNextTaskGroup() {
    const groups = buildTaskGroups({ includeSingles: true, sort: 'priority' });
    if (groups.length === 0) {
        exitTaskGroupFocusMode();
        return;
    }

    const groupIds = groups.map(group => group.id);
    let currentIndex = groupIds.indexOf(taskGroupFocusState.activeGroupId);
    if (currentIndex === -1) currentIndex = 0;
    const nextIndex = (currentIndex + 1) % groups.length;

    taskGroupFocusState.active = true;
    taskGroupFocusState.groupIds = groupIds;
    taskGroupFocusState.currentIndex = nextIndex;
    taskGroupFocusState.activeGroupId = groupIds[nextIndex];

    const activeGroup = groups[nextIndex];
    fitCameraToGroup(activeGroup);
    updateTaskGroupFocusControls({ groups, activeGroup, activeIndex: nextIndex });
    render();
    refreshGroupsTabIfVisible({ force: true });
}

function focusPrevTaskGroup() {
    const groups = buildTaskGroups({ includeSingles: true, sort: 'priority' });
    if (groups.length === 0) {
        exitTaskGroupFocusMode();
        return;
    }

    const groupIds = groups.map(group => group.id);
    let currentIndex = groupIds.indexOf(taskGroupFocusState.activeGroupId);
    if (currentIndex === -1) currentIndex = 0;
    const prevIndex = (currentIndex - 1 + groups.length) % groups.length;

    taskGroupFocusState.active = true;
    taskGroupFocusState.groupIds = groupIds;
    taskGroupFocusState.currentIndex = prevIndex;
    taskGroupFocusState.activeGroupId = groupIds[prevIndex];

    const activeGroup = groups[prevIndex];
    fitCameraToGroup(activeGroup);
    updateTaskGroupFocusControls({ groups, activeGroup, activeIndex: prevIndex });
    render();
    refreshGroupsTabIfVisible({ force: true });
}

function exitTaskGroupFocusMode() {
    const wasActive = taskGroupFocusState.active;

    taskGroupFocusState.active = false;
    taskGroupFocusState.groupIds = [];
    taskGroupFocusState.currentIndex = -1;
    taskGroupFocusState.activeGroupId = null;

    updateTaskGroupFocusControls({
        groups: buildTaskGroups({ includeSingles: true, sort: 'priority' }),
        activeGroup: null,
        activeIndex: -1
    });
    if (wasActive) {
        render();
        refreshGroupsTabIfVisible({ force: true });
    }
}

function toggleNodeGroupsModal() {
    const panel = document.getElementById('navigator-panel');
    if (panel && !panel.classList.contains('hidden') && currentNavigatorTab === 'groups') {
        closeRightDockPanel('navigator-panel');
        return;
    }
    toggleNavigatorPanel(true, 'groups');
}

function closeNodeGroupsModal() {
    closeRightDockPanel('navigator-panel');
}

function detectAndRenderNodeGroups() {
    const container = document.getElementById('node-groups-list');
    if (!container) return;
    lastTaskGroupsRenderSignature = getTaskGroupsRenderSignature();

    const snapshot = getTaskGroupFocusSnapshot({ refitOnMissing: false });
    const groups = snapshot.groups;
    updateTaskGroupFocusControls(snapshot);

    container.innerHTML = '';

    if (groups.length === 0) {
        container.innerHTML = '<div style="text-align:center; color:#666; padding:40px 20px; font-size:13px;">No task groups yet.<br><br>Create tasks to populate groups.</div>';
        return;
    }

    groups.forEach(group => {
        const isHidden = hiddenNodeGroups.has(group.id);
        const isFocused = taskGroupFocusState.active && taskGroupFocusState.activeGroupId === group.id;
        const totalCount = group.totalCount;
        const taskWord = totalCount === 1 ? 'task' : 'tasks';

        const el = document.createElement('div');
        el.className = `node-group-item ${isHidden ? 'hidden-group' : ''} ${isFocused ? 'focused-group' : ''}`;

        el.innerHTML = `
                    <div class="node-group-header">
                        <div class="node-group-title">${group.title}</div>
                        <div class="node-group-count">${totalCount} ${taskWord}</div>
                        <div class="node-group-toggle ${!isHidden ? 'active' : ''}" 
                             onclick="event.stopPropagation(); toggleNodeGroupVisibility('${group.id}')"></div>
                    </div>
                    <div class="node-group-stats">
                        <span>✓ ${group.completedCount}/${totalCount}</span>
                        ${group.activeUrgentCount > 0 ? `<span style="color:var(--blocked-color)">⚡ ${group.activeUrgentCount} urgent</span>` : ''}
                        ${group.activeCriticalCount > 0 ? `<span style="color:var(--critical-path)">⭐ ${group.activeCriticalCount} critical</span>` : ''}
                    </div>
                `;

        el.onclick = () => enterTaskGroupFocusMode(group.id);
        container.appendChild(el);
    });
}

function toggleNodeGroupVisibility(groupId) {
    if (hiddenNodeGroups.has(groupId)) hiddenNodeGroups.delete(groupId);
    else hiddenNodeGroups.add(groupId);

    saveToStorage();
    render();
    detectAndRenderNodeGroups();
}

function focusInboxItem(itemId) {
    if (!itemId || !inbox.some(item => item.id === itemId)) return false;

    const modal = document.getElementById('inbox-modal');
    if (!modal) return false;

    if (modal.classList.contains('visible')) {
        renderInboxModal();
    } else {
        toggleInboxModal();
    }

    const selector = `.inbox-item[data-inbox-id="${itemId}"]`;
    const target = document.querySelector(selector);
    if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        target.classList.add('reminder-focus-target');
        setTimeout(() => target.classList.remove('reminder-focus-target'), 1800);
    }
    return true;
}

let inboxRecommendationState = {
    mode: '',
    itemIds: [],
    status: ''
};
let inboxRecommendationBusy = false;

function normalizeInboxItem(item, index = 0) {
    const rawObj = (item && typeof item === 'object') ? item : {};
    const title = String(typeof item === 'string' ? item : (rawObj.title || '')).trim();
    const fallbackSlug = title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 40) || `item_${index}`;
    const id = String(rawObj.id || '').trim() || `inbox_legacy_${fallbackSlug}`;
    const rawRecommendedCount = Number(rawObj.recommendedCount);
    const recommendedCount = Number.isFinite(rawRecommendedCount)
        ? Math.max(0, Math.floor(rawRecommendedCount))
        : 0;
    const rawLastRecommendedAt = Number(rawObj.lastRecommendedAt);
    const lastRecommendedAt = Number.isFinite(rawLastRecommendedAt) && rawLastRecommendedAt > 0
        ? rawLastRecommendedAt
        : null;
    const rawAiScore = Number(rawObj.lastAiRelevanceScore);
    const normalized = {
        ...rawObj,
        id,
        title,
        recommendedCount,
        lastRecommendedAt,
        lastAiRelevanceScore: Number.isFinite(rawAiScore)
            ? Math.max(0, Math.min(100, rawAiScore))
            : null,
        lastAiRelevanceReason: typeof rawObj.lastAiRelevanceReason === 'string'
            ? rawObj.lastAiRelevanceReason.trim().slice(0, 220)
            : ''
    };
    return normalized;
}

function normalizeInboxCollection() {
    if (!Array.isArray(inbox)) inbox = [];
    inbox = inbox
        .map((item, index) => normalizeInboxItem(item, index))
        .filter(item => item && item.title);
}

function getInboxIndexById(itemId) {
    const normalizedId = String(itemId || '');
    return inbox.findIndex(item => item && item.id === normalizedId);
}

function getInboxRecommendationWeight(item, baseScore = 1) {
    const count = Math.max(0, Number(item && item.recommendedCount) || 0);
    const exposurePenalty = 1 / (1 + count * 0.15);
    const lastShown = Number(item && item.lastRecommendedAt) || 0;
    const ageMs = lastShown > 0 ? Date.now() - lastShown : Number.POSITIVE_INFINITY;
    let recencyPenalty = 1;
    if (ageMs < 24 * 60 * 60 * 1000) recencyPenalty = 0.55;
    else if (ageMs < 7 * 24 * 60 * 60 * 1000) recencyPenalty = 0.8;
    return Math.max(0.0001, Number(baseScore) || 1) * exposurePenalty * recencyPenalty;
}

function pickWeightedInboxItems(candidates, count) {
    const pool = (Array.isArray(candidates) ? candidates : [])
        .filter(entry => entry && entry.item)
        .map(entry => ({
            item: entry.item,
            weight: getInboxRecommendationWeight(entry.item, entry.baseScore || 1)
        }));
    const picks = [];
    const limit = Math.min(Math.max(0, count), pool.length);

    while (picks.length < limit && pool.length > 0) {
        const totalWeight = pool.reduce((sum, entry) => sum + entry.weight, 0);
        let cursor = Math.random() * totalWeight;
        let selectedIndex = pool.length - 1;
        for (let i = 0; i < pool.length; i++) {
            cursor -= pool[i].weight;
            if (cursor <= 0) {
                selectedIndex = i;
                break;
            }
        }
        const [selected] = pool.splice(selectedIndex, 1);
        picks.push(selected.item);
    }

    return picks;
}

function setInboxRecommendationBusy(isBusy) {
    inboxRecommendationBusy = Boolean(isBusy);
    syncInboxRecommendationControls();
}

function syncInboxRecommendationControls() {
    const shuffleBtn = document.getElementById('inbox-shuffle-btn');
    const smartBtn = document.getElementById('inbox-smart-btn');
    const disabled = inboxRecommendationBusy || !Array.isArray(inbox) || inbox.length === 0;
    if (shuffleBtn) shuffleBtn.disabled = disabled;
    if (smartBtn) {
        smartBtn.disabled = disabled;
        smartBtn.textContent = inboxRecommendationBusy ? 'Smart...' : 'Smart 3';
    }
}

function getInboxItemsFromRecommendationState() {
    const ids = Array.isArray(inboxRecommendationState.itemIds) ? inboxRecommendationState.itemIds : [];
    return ids
        .map(id => inbox.find(item => item && item.id === id))
        .filter(Boolean);
}

function markInboxItemsRecommended(items) {
    const now = Date.now();
    const ids = new Set((Array.isArray(items) ? items : []).map(item => item && item.id).filter(Boolean));
    inbox.forEach(item => {
        if (!item || !ids.has(item.id)) return;
        item.recommendedCount = Math.max(0, Number(item.recommendedCount) || 0) + 1;
        item.lastRecommendedAt = now;
    });
    saveToStorage();
}

function getInboxActionArg(itemId) {
    return escapeHtml(JSON.stringify(String(itemId || '')));
}

function renderInboxRecommendations(items, mode, options = {}) {
    const resultEl = document.getElementById('inbox-recommend-results');
    const statusEl = document.getElementById('inbox-recommend-status');
    if (!resultEl || !statusEl) return;

    const safeItems = Array.isArray(items) ? items.filter(Boolean) : [];
    const shouldMark = options.markShown !== false && safeItems.length > 0;
    inboxRecommendationState = {
        mode: mode || '',
        itemIds: safeItems.map(item => item.id),
        status: options.status || ''
    };

    if (shouldMark) markInboxItemsRecommended(safeItems);

    if (safeItems.length === 0) {
        resultEl.innerHTML = '';
        statusEl.textContent = options.status || (inbox.length ? '' : 'No inbox items.');
        syncInboxRecommendationControls();
        return;
    }

    const modeLabel = mode === 'smart' ? 'Smart picks' : 'Shuffle picks';
    statusEl.textContent = `${modeLabel}: ${safeItems.length} item${safeItems.length === 1 ? '' : 's'}`;
    resultEl.innerHTML = safeItems.map(item => {
        const actionId = getInboxActionArg(item.id);
        const hasReminder = hasReminderForItem('inbox', item.id);
        const reason = mode === 'smart' && item.lastAiRelevanceReason
            ? `<div class="inbox-recommend-reason">${escapeHtml(item.lastAiRelevanceReason)}</div>`
            : '';
        return `
            <div class="inbox-recommend-card" data-inbox-id="${escapeHtml(item.id)}">
                <div class="inbox-recommend-title">${linkify(item.title)}</div>
                ${reason}
                <div class="inbox-actions">
                    <span class="inbox-btn promote-btn" onclick="promoteInboxTaskById(${actionId})" title="Move to Board">⬆</span>
                    <span class="inbox-btn promote-goal-btn" onclick="promoteInboxToGoalById(${actionId})" title="Move to Goals">🎯</span>
                    <span class="inbox-btn reminder-btn ${hasReminder ? 'active' : ''}" onclick="openRemindersModal('inbox', ${actionId}); renderInboxModal();" title="Set Reminder">⏰</span>
                    <span class="inbox-btn" style="color: var(--accent);" onclick="scheduleInboxItemById(${actionId})" title="Add to Agenda">📅</span>
                    <span class="inbox-btn delete-btn" onclick="deleteInboxTaskById(${actionId})" title="Delete">✕</span>
                </div>
            </div>
        `;
    }).join('');
    syncInboxRecommendationControls();
}

function renderStoredInboxRecommendations() {
    const items = getInboxItemsFromRecommendationState();
    if (items.length === 0 && inboxRecommendationState.itemIds.length > 0) {
        inboxRecommendationState = { mode: '', itemIds: [], status: '' };
    }
    renderInboxRecommendations(items, inboxRecommendationState.mode, {
        markShown: false,
        status: inboxRecommendationState.status
    });
}

function recommendInboxShuffle() {
    normalizeInboxCollection();
    if (inbox.length === 0) {
        renderInboxRecommendations([], 'shuffle', { markShown: false, status: 'No inbox items.' });
        return;
    }
    const picks = pickWeightedInboxItems(inbox.map(item => ({ item, baseScore: 1 })), 3);
    renderInboxRecommendations(picks, 'shuffle');
}

function extractInboxSmartTextFromGemini(data) {
    return data
        && data.candidates
        && data.candidates[0]
        && data.candidates[0].content
        && data.candidates[0].content.parts
        && data.candidates[0].content.parts[0]
        ? String(data.candidates[0].content.parts[0].text || '')
        : '';
}

function parseInboxSmartJson(text) {
    const raw = String(text || '').trim();
    if (!raw) return null;
    try {
        return JSON.parse(raw);
    } catch (error) {
        const fencedMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
        if (fencedMatch) {
            try {
                return JSON.parse(fencedMatch[1].trim());
            } catch (innerError) {
                // Continue to object extraction below.
            }
        }
        const start = raw.indexOf('{');
        const end = raw.lastIndexOf('}');
        if (start >= 0 && end > start) {
            try {
                return JSON.parse(raw.slice(start, end + 1));
            } catch (innerError) {
                return null;
            }
        }
    }
    return null;
}

function buildInboxSmartGoalContext() {
    const allGoals = typeof getAllGoalsFlat === 'function'
        ? getAllGoalsFlat({ minYear: new Date().getFullYear(), includeSubgoals: true })
        : [];
    return allGoals.slice(0, 80).map(entry => ({
        id: entry.goal && entry.goal.id,
        text: entry.goal && entry.goal.text,
        year: entry.year,
        depth: entry.depth
    })).filter(goal => goal.id && goal.text);
}

async function recommendInboxSmart() {
    normalizeInboxCollection();
    if (inbox.length === 0) {
        renderInboxRecommendations([], 'smart', { markShown: false, status: 'No inbox items.' });
        return;
    }
    if (typeof fetchGemini !== 'function' || typeof geminiApiKey === 'undefined' || !geminiApiKey) {
        showNotification('Set your Gemini API key to use Smart 3.');
        renderInboxRecommendations([], 'smart', { markShown: false, status: 'Smart 3 needs Gemini.' });
        return;
    }

    setInboxRecommendationBusy(true);
    const packet = {
        inbox: inbox.map(item => ({ id: item.id, title: item.title })),
        goals: buildInboxSmartGoalContext()
    };
    const prompt = `Score each inbox item for relevance to the provided current/future goals. Return only valid JSON in this exact shape: {"items":[{"id":"inbox_id","score":0,"reason":"short reason"}]}. Scores must be 0-100. Keep reasons under 14 words.\n\nCONTEXT:\n${JSON.stringify(packet)}`;
    const payload = {
        contents: [{ parts: [{ text: prompt }] }]
    };

    try {
        const response = await fetchGemini(payload, 2, 800);
        const parsed = parseInboxSmartJson(extractInboxSmartTextFromGemini(response));
        const scoredItems = Array.isArray(parsed && parsed.items) ? parsed.items : [];
        const byId = new Map(scoredItems.map(raw => [String(raw.id || ''), raw]));
        const ranked = inbox.map(item => {
            const raw = byId.get(item.id) || {};
            const score = Math.max(0, Math.min(100, Number(raw.score) || 0));
            item.lastAiRelevanceScore = score;
            item.lastAiRelevanceReason = typeof raw.reason === 'string' ? raw.reason.trim().slice(0, 220) : '';
            return { item, score };
        }).sort((a, b) => b.score - a.score);

        if (ranked.length === 0 || ranked.every(entry => entry.score <= 0)) {
            throw new Error('Gemini did not return usable inbox scores.');
        }

        const poolSize = Math.min(ranked.length, Math.max(3, Math.ceil(ranked.length * 0.45)));
        const pool = ranked.slice(0, poolSize).map(entry => ({
            item: entry.item,
            baseScore: Math.max(1, entry.score)
        }));
        const picks = pickWeightedInboxItems(pool, 3);
        renderInboxRecommendations(picks, 'smart');
    } catch (error) {
        console.error('[inbox] Smart recommendations failed:', error);
        showNotification(`Smart 3 failed: ${error.message}`);
        renderInboxRecommendations([], 'smart', { markShown: false, status: 'Smart 3 failed.' });
    } finally {
        setInboxRecommendationBusy(false);
    }
}

function renderInboxModal() {
    const list = document.getElementById('inbox-modal-list');
    if (!list) return;
    normalizeInboxCollection();
    list.innerHTML = '';
    syncInboxRecommendationControls();

    if (inbox.length === 0) {
        list.innerHTML = '<div style="color:var(--text-muted); text-align:center; padding:40px 20px; font-size: 13px;">📭<br><br>Your inbox is empty.<br>Capture ideas as they come!</div>';
        renderStoredInboxRecommendations();
        return;
    }

    inbox.forEach((item, index) => {
        const hasReminder = hasReminderForItem('inbox', item.id);
        const actionId = getInboxActionArg(item.id);
        const el = document.createElement('div');
        el.className = 'inbox-item';
        el.dataset.inboxId = item.id;
        el.innerHTML = `<span>${linkify(item.title)}</span><div class="inbox-actions"><span class="inbox-btn promote-btn" onclick="promoteInboxTaskById(${actionId})" title="Move to Board">⬆</span><span class="inbox-btn promote-goal-btn" onclick="promoteInboxToGoalById(${actionId})" title="Move to Goals">🎯</span><span class="inbox-btn reminder-btn ${hasReminder ? 'active' : ''}" onclick="openRemindersModal('inbox', ${actionId}); renderInboxModal();" title="Set Reminder">⏰</span><span class="inbox-btn" style="color: var(--accent);" onclick="scheduleInboxItemById(${actionId})" title="Add to Agenda">📅</span><span class="inbox-btn delete-btn" onclick="deleteInboxTaskById(${actionId})" title="Delete">✕</span></div>`;
        list.appendChild(el);
    });
    renderStoredInboxRecommendations();
}

function addToInboxModal() {
    const input = document.getElementById('inbox-modal-input');
    if (!input) return;
    const val = input.value.trim();
    if (val) {
        inbox.push(normalizeInboxItem({ id: 'inbox_' + Date.now(), title: val }, inbox.length));
        input.value = '';
        renderInboxModal();
        saveToStorage();
    }
}

function renderInbox() {
    renderInboxModal();
}

function addToInbox() {
    addToInboxModal();
}

function deleteInboxTask(index) {
    const item = inbox[index];
    if (!item) return;
    if (item) discardReminderByItem('inbox', item.id);

    // NEW: Remove any agenda slots for this inbox item
    agenda = agenda.filter(slot => !slot.taskId.includes(item.id.split('_')[1]));

    // Remove temp node if exists
    nodes = nodes.filter(n => !n.id.includes(item.id.split('_')[1]) || !n.isInboxItem);

    inbox.splice(index, 1);
    renderInbox();
    saveToStorage();
}

function removeInboxRecommendationId(itemId) {
    const normalizedId = String(itemId || '');
    inboxRecommendationState.itemIds = (inboxRecommendationState.itemIds || [])
        .filter(id => id !== normalizedId);
}

function deleteInboxTaskById(itemId) {
    const index = getInboxIndexById(itemId);
    if (index < 0) return;
    removeInboxRecommendationId(itemId);
    deleteInboxTask(index);
}

function promoteInboxTask(index) {
    const item = inbox[index];
    const worldX = (window.innerWidth / 2 - panX) / scale - 90;
    const worldY = (window.innerHeight / 2 - panY) / scale - 50;
    const newNode = createNode(worldX, worldY, item.title);
    inbox.splice(index, 1); nodes.push(newNode);
    transferReminderAssignment('inbox', item.id, 'task', newNode.id, newNode.title);
    renderInbox(); updateCalculations(); render(); selectNode(newNode.id); saveToStorage();
}

function promoteInboxTaskById(itemId) {
    const index = getInboxIndexById(itemId);
    if (index < 0) return;
    removeInboxRecommendationId(itemId);
    promoteInboxTask(index);
}

function promoteInboxToGoal(index) {
    const item = inbox[index];
    if (!item) return;
    if (!lifeGoals[currentGoalYear]) lifeGoals[currentGoalYear] = [];
    lifeGoals[currentGoalYear].push(createGoal(item.title));
    discardReminderByItem('inbox', item.id);
    inbox.splice(index, 1);
    renderInbox();
    renderGoals();
    if (typeof toggleGoals === 'function') toggleGoals(true);
    saveToStorage();
}

function promoteInboxToGoalById(itemId) {
    const index = getInboxIndexById(itemId);
    if (index < 0) return;
    removeInboxRecommendationId(itemId);
    promoteInboxToGoal(index);
}

function scheduleInboxItem(index) {
    const item = inbox[index];
    if (!item) return;

    // Create a temporary task node for the agenda (it stays in inbox)
    const tempTaskId = 'inbox_temp_' + Date.now();

    // Create a minimal task object that agenda can reference
    const tempTask = {
        id: tempTaskId,
        title: item.title,
        completed: false,
        isInboxItem: true, // Flag to identify it's from inbox
        inboxIndex: index  // Store original index
    };

    // Add to nodes temporarily (it won't be saved to storage)
    nodes.push(tempTask);

    // Calculate default time slot (now + 30 minutes)
    const now = new Date();
    const start = new Date(now.getTime() + 5 * 60000); // 5 mins from now for testing
    const end = new Date(start.getTime() + 30 * 60000); // 30 min duration

    // Add to agenda
    agenda.push({
        taskId: tempTaskId,
        start: start.toISOString(),
        end: end.toISOString()
    });

    saveToStorage();

    // Open agenda panel to show the new item
    const agendaPanel = document.getElementById('agenda-panel');
    if (agendaPanel.classList.contains('hidden')) {
        if (typeof openPlannerTab === 'function') openPlannerTab('agenda');
        else toggleAgenda();
    } else {
        renderAgenda();
    }

    showNotification(`"${item.title}" scheduled for ${start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`);
}

function scheduleInboxItemById(itemId) {
    const index = getInboxIndexById(itemId);
    if (index < 0) return;
    scheduleInboxItem(index);
    renderInboxModal();
}

function demoteToInbox() {
    if (!selectedNodeId) return;
    const node = nodes.find(n => n.id === selectedNodeId);
    if (!node) return;

    const newInboxId = 'inbox_' + Date.now();
    inbox.push(normalizeInboxItem({ id: newInboxId, title: node.title }, inbox.length));
    if (typeof logTaskChange === 'function') {
        logTaskChange(node, 'Moved out of tasks and back to Inbox', { type: 'inbox' });
    }
    transferReminderAssignment('task', node.id, 'inbox', newInboxId, node.title);
    nodes = nodes.filter(n => n.id !== selectedNodeId);
    nodes.forEach(n => { n.dependencies = n.dependencies.filter(d => d.id !== selectedNodeId); });
    if (typeof cleanupOrphanReminders === 'function') cleanupOrphanReminders({ persist: false, render: true, refreshInspector: false });

    deselectNode();
    updateCalculations();
    render();
    renderInbox();
    saveToStorage();

    const inboxModal = document.getElementById('inbox-modal');
    if (inboxModal && !inboxModal.classList.contains('visible')) {
        toggleInboxModal();
    }
}

// showNotification() is now in utils.js
