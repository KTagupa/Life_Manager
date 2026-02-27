// --- NODE GROUPS LOGIC ---
const TASK_GROUP_NODE_WIDTH = 200;
const TASK_GROUP_NODE_HEIGHT = 124;
const TASK_GROUP_VIEW_PADDING = 48;

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

function refreshGroupsTabIfVisible() {
    const panel = document.getElementById('navigator-panel');
    if (!panel || panel.classList.contains('hidden')) return;
    if (currentNavigatorTab !== 'groups') return;
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
    refreshGroupsTabIfVisible();
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
    refreshGroupsTabIfVisible();
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
    refreshGroupsTabIfVisible();
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
        refreshGroupsTabIfVisible();
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

function renderInboxModal() {
    const list = document.getElementById('inbox-modal-list');
    if (!list) return;
    list.innerHTML = '';

    if (inbox.length === 0) {
        list.innerHTML = '<div style="color:var(--text-muted); text-align:center; padding:40px 20px; font-size: 13px;">📭<br><br>Your inbox is empty.<br>Capture ideas as they come!</div>';
        return;
    }

    inbox.forEach((item, index) => {
        const hasReminder = hasReminderForItem('inbox', item.id);
        const el = document.createElement('div');
        el.className = 'inbox-item';
        el.dataset.inboxId = item.id;
        el.innerHTML = `<span>${linkify(item.title)}</span><div class="inbox-actions"><span class="inbox-btn promote-btn" onclick="promoteInboxTask(${index}); renderInboxModal();" title="Move to Board">⬆</span><span class="inbox-btn promote-goal-btn" onclick="promoteInboxToGoal(${index}); renderInboxModal();" title="Move to Goals">🎯</span><span class="inbox-btn reminder-btn ${hasReminder ? 'active' : ''}" onclick="openRemindersModal('inbox', '${item.id}'); renderInboxModal();" title="Set Reminder">⏰</span><span class="inbox-btn" style="color: var(--accent);" onclick="scheduleInboxItem(${index}); renderInboxModal();" title="Add to Agenda">📅</span><span class="inbox-btn delete-btn" onclick="deleteInboxTask(${index}); renderInboxModal();" title="Delete">✕</span></div>`;
        list.appendChild(el);
    });
}

function addToInboxModal() {
    const input = document.getElementById('inbox-modal-input');
    if (!input) return;
    const val = input.value.trim();
    if (val) {
        inbox.push({ id: 'inbox_' + Date.now(), title: val });
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
function promoteInboxTask(index) {
    const item = inbox[index];
    const worldX = (window.innerWidth / 2 - panX) / scale - 90;
    const worldY = (window.innerHeight / 2 - panY) / scale - 50;
    const newNode = createNode(worldX, worldY, item.title);
    inbox.splice(index, 1); nodes.push(newNode);
    transferReminderAssignment('inbox', item.id, 'task', newNode.id, newNode.title);
    renderInbox(); updateCalculations(); render(); selectNode(newNode.id); saveToStorage();
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

function demoteToInbox() {
    if (!selectedNodeId) return;
    const node = nodes.find(n => n.id === selectedNodeId);
    if (!node) return;

    const newInboxId = 'inbox_' + Date.now();
    inbox.push({ id: newInboxId, title: node.title });
    transferReminderAssignment('task', node.id, 'inbox', newInboxId, node.title);
    nodes = nodes.filter(n => n.id !== selectedNodeId);
    nodes.forEach(n => { n.dependencies = n.dependencies.filter(d => d.id !== selectedNodeId); });

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
