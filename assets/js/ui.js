// --- UTILITIES FOR LINKS ---
function linkify(text) {
    if (!text) return '';
    // Optimized regex for web and local app protocols
    const urlRegex = /(\b(https?|ftp|file|obsidian|notion|vscode):\/\/[-A-Z0-9+&@#\/%?=~_|!:,.;]*[-A-Z0-9+&@#\/%=~_|])/ig;
    return text.replace(urlRegex, function (url) {
        return `<a href="${url}" target="_blank" rel="noopener noreferrer" style="color: var(--accent); text-decoration: underline;" onclick="event.stopPropagation()">${url}</a>`;
    });
}

function extractLink(text) {
    if (!text) return null;
    // Updated regex to include obsidian protocol explicitly
    const match = text.match(/(\b(https?|ftp|file|obsidian):\/\/[-A-Z0-9+&@#\/%?=~_|!:,.;]*[-A-Z0-9+&@#\/%=~_|])/i);
    return match ? match[0] : null;
}


// --- TOOLBAR LOGIC ---
function toggleMenu() {
    const tb = document.getElementById('toolbar');
    const btn = document.getElementById('menu-btn');
    const content = document.getElementById('toolbar-content');

    tb.classList.toggle('collapsed');

    if (tb.classList.contains('collapsed')) {
        btn.innerHTML = '☰';
        content.style.display = 'none';
    } else {
        btn.innerHTML = '✕';
        content.style.display = 'flex';
    }
}

// --- CONTEXTUAL MENU LOGIC ---
function setupContextualMenu() {
    const menu = document.getElementById('selection-menu');

    document.addEventListener('mouseup', (e) => {
        // 1. Check if clicking inside the menu itself - do nothing
        if (menu.contains(e.target)) return;

        // 2. Check Note Editor Selection
        const noteInput = document.getElementById('note-body-input');
        if (!noteInput.classList.contains('hidden') && noteInput.contains(e.target)) {
            const text = noteInput.value.substring(noteInput.selectionStart, noteInput.selectionEnd).trim();
            if (text) {
                currentSelectionText = text;
                currentSelectionSource = 'note';
                noteSelectionRange = { start: noteInput.selectionStart, end: noteInput.selectionEnd };
                showContextMenu(e.clientX, e.clientY);
                return;
            }
        }

        // 3. Check AI Modal Selection
        const aiModal = document.getElementById('ai-modal');
        if (aiModal && aiModal.classList.contains('visible')) {
            const selection = window.getSelection();
            const text = selection.toString().trim();
            if (text && aiModal.contains(selection.anchorNode.nodeType === 3 ? selection.anchorNode.parentNode : selection.anchorNode)) {
                currentSelectionText = text;
                currentSelectionSource = 'ai';
                noteSelectionRange = null;
                showContextMenu(e.clientX, e.clientY);
                return;
            }
        }

        // 4. Default: Hide menu if no valid selection or click outside
        menu.style.display = 'none';
    });

    // Hide on scroll or resize to prevent floating menu in wrong place
    window.addEventListener('scroll', () => { menu.style.display = 'none'; }, true);
    window.addEventListener('resize', () => { menu.style.display = 'none'; });
}

function showContextMenu(x, y) {
    const menu = document.getElementById('selection-menu');
    menu.style.display = 'flex';

    // Bounds checking
    let left = x;
    let top = y - 40;

    if (left + 150 > window.innerWidth) left = window.innerWidth - 160;
    if (top < 10) top = y + 20; // Show below if too close to top

    menu.style.left = left + 'px';
    menu.style.top = top + 'px';
}

function toggleGlobalSearch() {
    let modal = document.getElementById('global-search-modal');
    if (modal) {
        modal.remove();
        return;
    }

    modal = document.createElement('div');
    modal.id = 'global-search-modal';
    modal.style.cssText = `
                position: fixed; top: 20%; left: 50%; transform: translateX(-50%);
                width: 600px; max-width: 90vw; max-height: 60vh;
                background: var(--panel-bg-elevated); border: 1px solid var(--accent);
                border-radius: 12px; z-index: 3000; box-shadow: 0 20px 60px rgba(0,0,0,0.8);
                display: flex; flex-direction: column; overflow: hidden;
            `;

    modal.innerHTML = `
                <div style=\"padding: 16px; border-bottom: 1px solid var(--border);\">
                    <input type=\"text\" id=\"global-search-input\" placeholder=\"Search tasks, notes, goals...\" 
                        style=\"width: 100%; background: var(--node-bg); border: 1px solid var(--border); 
                        color: white; padding: 12px; border-radius: 8px; font-size: 16px; outline: none;\">
                </div>
                <div id=\"global-search-results\" style=\"flex: 1; overflow-y: auto; padding: 8px;\"></div>
                <div style=\"padding: 8px 16px; border-top: 1px solid var(--border); font-size: 11px; color: var(--text-muted);\">
                    ↑↓ navigate • Enter open • Esc close
                </div>
            `;

    document.body.appendChild(modal);

    const input = document.getElementById('global-search-input');
    input.focus();

    let selectedIndex = 0;
    let results = [];

    const performSearch = (query) => {
        const q = query.toLowerCase();
        if (!q) {
            document.getElementById('global-search-results').innerHTML = '';
            return;
        }

        results = [];

        // Search tasks
        [...nodes, ...archivedNodes].forEach(n => {
            if (n.title.toLowerCase().includes(q) || (n.description || '').toLowerCase().includes(q)) {
                results.push({ type: 'task', title: n.title, obj: n, icon: n.completed ? '✅' : (n._isUrgent ? '⚡' : '📋') });
            }
        });

        // Search notes
        notes.forEach(n => {
            let bodyText = '';
            try {
                const blocks = JSON.parse(n.body);
                bodyText = blocks.map(b => b.text).join(' ');
            } catch (e) { bodyText = n.body || ''; }

            if ((n.title || '').toLowerCase().includes(q) || bodyText.toLowerCase().includes(q)) {
                results.push({ type: 'note', title: n.title, obj: n, icon: '📝' });
            }
        });

        // Search goals
        const searchGoals = (goals) => {
            goals.forEach(g => {
                if (g.text.toLowerCase().includes(q)) {
                    results.push({ type: 'goal', title: g.text, obj: g, icon: '🎯' });
                }
                if (g.children) searchGoals(g.children);
            });
        };
        if (lifeGoals[currentGoalYear]) searchGoals(lifeGoals[currentGoalYear]);

        renderResults();
    };

    const renderResults = () => {
        const container = document.getElementById('global-search-results');
        container.innerHTML = results.map((r, idx) => `
                    <div class=\"search-result-item ${idx === selectedIndex ? 'selected' : ''}\" 
                         style=\"padding: 10px; cursor: pointer; border-radius: 6px; ${idx === selectedIndex ? 'background: var(--accent-light); border-left: 3px solid var(--accent);' : 'hover:background: rgba(255,255,255,0.05);'}\"
                         onclick=\"openSearchResult('${r.type}', '${r.obj.id}'); toggleGlobalSearch();\">
                        <span style=\"margin-right: 8px;\">${r.icon}</span>
                        <span style=\"${r.type === 'task' && r.obj.completed ? 'text-decoration: line-through; opacity: 0.6;' : ''}\">${r.title}</span>
                        <span style=\"float: right; font-size: 11px; color: var(--text-muted); text-transform: uppercase;\">${r.type}</span>
                    </div>
                `).join('');

        // Scroll selected into view
        const selected = container.children[selectedIndex];
        if (selected) selected.scrollIntoView({ block: 'nearest' });
    };

    input.addEventListener('input', (e) => {
        selectedIndex = 0;
        performSearch(e.target.value);
    });

    input.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            selectedIndex = Math.min(selectedIndex + 1, results.length - 1);
            renderResults();
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            selectedIndex = Math.max(selectedIndex - 1, 0);
            renderResults();
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (results[selectedIndex]) {
                openSearchResult(results[selectedIndex].type, results[selectedIndex].obj.id);
                toggleGlobalSearch();
            }
        } else if (e.key === 'Escape') {
            toggleGlobalSearch();
        }
    });

    // Close on backdrop
    modal.addEventListener('click', (e) => {
        if (e.target === modal) toggleGlobalSearch();
    });
}

function openSearchResult(type, id) {
    if (type === 'task') {
        jumpToTask(id);
    } else if (type === 'note') {
        openNoteEditor(id);
    } else if (type === 'goal') {
        if (!isGoalsOpen) toggleGoals();
        // Flash the goal in the list (you'd need to add IDs to goal elements)
        setTimeout(() => {
            const goalEl = document.querySelector(`[data-goal-id=\"${id}\"]`);
            if (goalEl) {
                goalEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                goalEl.style.background = 'var(--accent-light)';
                setTimeout(() => goalEl.style.background = '', 1000);
            }
        }, 100);
    }
}


function toggleInboxModal() {
    const modal = document.getElementById('inbox-modal');

    if (modal.classList.contains('visible')) {
        closeInboxModal();
    } else {
        // Restore saved position
        if (inboxModalPosition.x !== null && inboxModalPosition.y !== null) {
            modal.style.left = inboxModalPosition.x + 'px';
            modal.style.top = inboxModalPosition.y + 'px';
            modal.style.transform = 'none';
        }
        if (inboxModalPosition.width && inboxModalPosition.height) {
            modal.style.width = inboxModalPosition.width + 'px';
            modal.style.height = inboxModalPosition.height + 'px';
        }

        modal.classList.add('visible');
        renderInboxModal();
        setTimeout(() => document.getElementById('inbox-modal-input').focus(), 100);
    }
}

function closeInboxModal() {
    const modal = document.getElementById('inbox-modal');

    // Save position before closing
    const rect = modal.getBoundingClientRect();
    inboxModalPosition = {
        x: rect.left,
        y: rect.top,
        width: rect.width,
        height: rect.height
    };
    localStorage.setItem('inboxModalPosition', JSON.stringify(inboxModalPosition));

    modal.classList.remove('visible');
}

// --- NODE GROUPS LOGIC ---
function toggleNodeGroupsModal() {
    const modal = document.getElementById('node-groups-modal');

    if (modal.classList.contains('visible')) {
        closeNodeGroupsModal();
    } else {
        // Restore saved position
        if (nodeGroupsModalPosition.x !== null && nodeGroupsModalPosition.y !== null) {
            modal.style.left = nodeGroupsModalPosition.x + 'px';
            modal.style.top = nodeGroupsModalPosition.y + 'px';
            modal.style.transform = 'none';
        }
        if (nodeGroupsModalPosition.width && nodeGroupsModalPosition.height) {
            modal.style.width = nodeGroupsModalPosition.width + 'px';
            modal.style.height = nodeGroupsModalPosition.height + 'px';
        }

        modal.classList.add('visible');
        detectAndRenderNodeGroups();
    }
}

function closeNodeGroupsModal() {
    const modal = document.getElementById('node-groups-modal');

    // Save position before closing
    const rect = modal.getBoundingClientRect();
    nodeGroupsModalPosition = {
        x: rect.left,
        y: rect.top,
        width: rect.width,
        height: rect.height
    };
    localStorage.setItem('nodeGroupsModalPosition', JSON.stringify(nodeGroupsModalPosition));

    modal.classList.remove('visible');
}

function detectAndRenderNodeGroups() {
    const groups = detectConnectedGroups();
    const container = document.getElementById('node-groups-list');
    if (!container) return;

    container.innerHTML = '';

    if (groups.length === 0) {
        container.innerHTML = '<div style="text-align:center; color:#666; padding:40px 20px; font-size:13px;">No connected node groups found.<br><br>Create tasks with dependencies to see groups.</div>';
        return;
    }

    groups.forEach((group, index) => {
        const groupId = `group_${index}`;
        const isHidden = hiddenNodeGroups.has(groupId);

        // Find first active (non-completed) node for title
        const firstActive = group.nodes.find(n => !n.completed);
        const titleNode = firstActive || group.nodes[0];
        const groupTitle = titleNode ? titleNode.title : 'Unnamed Group';

        const completedCount = group.nodes.filter(n => n.completed).length;
        const totalCount = group.nodes.length;
        const urgentCount = group.nodes.filter(n => n._isUrgent && !n.completed).length;
        const criticalCount = group.nodes.filter(n => n._isCritical && !n.completed).length;

        const el = document.createElement('div');
        el.className = `node-group-item ${isHidden ? 'hidden-group' : ''}`;

        el.innerHTML = `
                    <div class="node-group-header">
                        <div class="node-group-title">${groupTitle}</div>
                        <div class="node-group-count">${totalCount} tasks</div>
                        <div class="node-group-toggle ${!isHidden ? 'active' : ''}" 
                             onclick="event.stopPropagation(); toggleNodeGroupVisibility('${groupId}', ${index})"></div>
                    </div>
                    <div class="node-group-stats">
                        <span>✓ ${completedCount}/${totalCount}</span>
                        ${urgentCount > 0 ? `<span style="color:var(--blocked-color)">⚡ ${urgentCount} urgent</span>` : ''}
                        ${criticalCount > 0 ? `<span style="color:var(--critical-path)">⭐ ${criticalCount} critical</span>` : ''}
                    </div>
                `;

        el.onclick = () => {
            if (!isHidden && titleNode) {
                closeNodeGroupsModal();
                jumpToTask(titleNode.id);
            }
        };

        container.appendChild(el);
    });
}

function detectConnectedGroups() {
    const visited = new Set();
    const groups = [];

    nodes.forEach(node => {
        if (!visited.has(node.id)) {
            const group = collectConnectedNodes(node.id, visited);
            if (group.length > 1) { // Only groups with 2+ nodes
                groups.push({ nodes: group });
            }
        }
    });

    return groups;
}

function collectConnectedNodes(startId, visited) {
    const group = [];
    const queue = [startId];
    const localVisited = new Set();

    while (queue.length > 0) {
        const id = queue.shift();
        if (localVisited.has(id)) continue;

        const node = nodes.find(n => n.id === id);
        if (!node) continue;

        localVisited.add(id);
        visited.add(id);
        group.push(node);

        // Add parents
        node.dependencies.forEach(dep => {
            if (!localVisited.has(dep.id)) {
                queue.push(dep.id);
            }
        });

        // Add children
        nodes.forEach(other => {
            if (other.dependencies.some(d => d.id === id) && !localVisited.has(other.id)) {
                queue.push(other.id);
            }
        });
    }

    return group;
}

function toggleNodeGroupVisibility(groupId, groupIndex) {
    if (hiddenNodeGroups.has(groupId)) {
        hiddenNodeGroups.delete(groupId);
    } else {
        hiddenNodeGroups.add(groupId);
    }

    saveToStorage();
    render();
    detectAndRenderNodeGroups();
}

function renderInboxModal() {
    const list = document.getElementById('inbox-modal-list');
    list.innerHTML = '';

    if (inbox.length === 0) {
        list.innerHTML = '<div style="color:var(--text-muted); text-align:center; padding:40px 20px; font-size: 13px;">📭<br><br>Your inbox is empty.<br>Capture ideas as they come!</div>';
        return;
    }

    inbox.forEach((item, index) => {
        const el = document.createElement('div');
        el.className = 'inbox-item';
        el.innerHTML = `<span>${linkify(item.title)}</span><div class="inbox-actions"><span class="inbox-btn promote-btn" onclick="promoteInboxTask(${index}); renderInboxModal();" title="Move to Board">⬆</span><span class="inbox-btn promote-goal-btn" onclick="promoteInboxToGoal(${index}); renderInboxModal();" title="Move to Goals">🎯</span><span class="inbox-btn" style="color: var(--accent);" onclick="scheduleInboxItem(${index}); renderInboxModal();" title="Add to Agenda">📅</span><span class="inbox-btn delete-btn" onclick="deleteInboxTask(${index}); renderInboxModal();" title="Delete">✕</span></div>`;
        list.appendChild(el);
    });
}

function addToInboxModal() {
    const input = document.getElementById('inbox-modal-input');
    const val = input.value.trim();
    if (val) {
        inbox.push({ id: 'inbox_' + Date.now(), title: val });
        input.value = '';
        renderInboxModal();
        saveToStorage();
    }
}
function renderInbox() {
    const list = document.getElementById('inbox-list'); list.innerHTML = '';
    if (inbox.length === 0) { list.innerHTML = '<div style="color:var(--text-muted); text-align:center; padding:20px;">No pending tasks</div>'; return; }
    inbox.forEach((item, index) => {
        const el = document.createElement('div'); el.className = 'inbox-item';
        el.innerHTML = `<span>${linkify(item.title)}</span><div class="inbox-actions"><span class="inbox-btn promote-btn" onclick="promoteInboxTask(${index})" title="Move to Board">⬆</span><span class="inbox-btn promote-goal-btn" onclick="promoteInboxToGoal(${index})" title="Move to Goals">🎯</span><span class="inbox-btn" style="color: var(--accent);" onclick="scheduleInboxItem(${index})" title="Add to Agenda">📅</span><span class="inbox-btn delete-btn" onclick="deleteInboxTask(${index})" title="Delete">✕</span></div>`;
        list.appendChild(el);
    });
}
function addToInbox() { const input = document.getElementById('inbox-input'); const val = input.value.trim(); if (val) { inbox.push({ id: 'inbox_' + Date.now(), title: val }); input.value = ''; renderInbox(); saveToStorage(); } }
function deleteInboxTask(index) {
    const item = inbox[index];

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
    renderInbox(); updateCalculations(); render(); selectNode(newNode.id); saveToStorage();
    const inboxPanel = document.getElementById('inbox-panel');
    if (!inboxPanel.classList.contains('hidden')) inboxPanel.classList.add('hidden');
}
function promoteInboxToGoal(index) { const item = inbox[index]; if (!lifeGoals[currentGoalYear]) lifeGoals[currentGoalYear] = []; lifeGoals[currentGoalYear].push(createGoal(item.title)); inbox.splice(index, 1); renderInbox(); renderGoals(); const panel = document.getElementById('goals-panel'); if (panel.classList.contains('hidden')) panel.classList.remove('hidden'); saveToStorage(); }
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
        toggleAgenda();
    } else {
        renderAgenda();
    }

    showNotification(`"${item.title}" scheduled for ${start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`);
}
function demoteToInbox() { if (!selectedNodeId) return; const node = nodes.find(n => n.id === selectedNodeId); if (!node) return; inbox.push({ id: 'inbox_' + Date.now(), title: node.title }); nodes = nodes.filter(n => n.id !== selectedNodeId); nodes.forEach(n => { n.dependencies = n.dependencies.filter(d => d.id !== selectedNodeId); }); deselectNode(); updateCalculations(); render(); renderInbox(); const panel = document.getElementById('inbox-panel'); if (panel.classList.contains('hidden')) toggleInboxModal(); saveToStorage(); }

function showNotification(msg) {
    const n = document.getElementById('notification');
    if (n) {
        n.innerText = msg || "State Saved";
        n.style.opacity = '1';
        setTimeout(() => n.style.opacity = '0', 1500);
    } else {
        console.log("Notification:", msg); // Fallback to console if UI missing
    }

    // Also safeguard the status indicator if it exists
    const statusInd = document.getElementById('status-indicator');
    if (!msg && statusInd) {
        statusInd.innerText = "Saved " + new Date().toLocaleTimeString();
    }
}


// --- PINNED WINDOW LOGIC ---
function togglePinnedWindow() {
    const window = document.getElementById('pinned-window');
    window.classList.toggle('hidden');
    if (!window.classList.contains('hidden')) {
        renderPinnedWindow();
    }
}

let currentTaskFilter = 'all';

function toggleTaskListWindow() {
    const window = document.getElementById('task-list-window');
    window.classList.toggle('hidden');
    if (!window.classList.contains('hidden')) {
        renderTaskList();
    }
}

function toggleAgenda() {
    const panel = document.getElementById('agenda-panel');
    const others = ['notes-panel', 'archive-panel', 'goals-panel', 'habits-panel'];
    if (panel.classList.contains('hidden')) {
        others.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.classList.add('hidden');
        });
        panel.classList.remove('hidden');
        renderAgenda();
        renderAgendaPanelUI(); // <--- Initialize UI
    } else {
        panel.classList.add('hidden');
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
}

function togglePinItem(type, id) {
    let item;
    if (type === 'task') item = nodes.find(n => n.id === id) || archivedNodes.find(n => n.id === id);
    else if (type === 'note') item = notes.find(n => n.id === id);
    else if (type === 'habit') item = habits.find(h => h.id === id);

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

function renderPinnedWindow() {
    const container = document.getElementById('pinned-content');
    if (!container) return;

    container.innerHTML = '';

    const pinnedItemsList = [];
    // Collect all items with isPinned = true
    nodes.concat(archivedNodes).forEach(n => { if (n.isPinned) pinnedItemsList.push({ type: 'task', id: n.id }); });
    notes.forEach(n => { if (n.isPinned) pinnedItemsList.push({ type: 'note', id: n.id }); });
    habits.forEach(h => { if (h.isPinned) pinnedItemsList.push({ type: 'habit', id: h.id }); });

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
    el.className = 'pinned-node';

    if (!node.completed) {
        if (node._isUrgent) el.classList.add('critical-urgent');
        else if (node._isCritical) el.classList.add('critical');
    }
    if (node.completed) el.classList.add('completed');

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

    const totalSubs = node.subtasks.length;
    const doneSubs = node.subtasks.filter(s => s.done).length;
    const progress = totalSubs === 0 ? 0 : (doneSubs / totalSubs) * 100;

    el.innerHTML = `
                <button class="pinned-unpin" onclick="event.stopPropagation(); togglePinItem('task', '${taskId}')">✕</button>
                <div style="font-weight:600; font-size:12px; margin-bottom:4px; color:#eee;">${node.completed ? '✅' : ''} ${node.title}</div>
                <div style="display:flex; gap:4px; flex-wrap:wrap; font-size:10px; margin-bottom:4px;">${badgesHtml}</div>
                ${totalSubs > 0 ? `<div class="progress-container" style="height:3px;"><div class="progress-bar" style="width:${progress}%"></div></div>` : ''}
            `;

    el.onclick = () => {
        selectNode(taskId);
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
    el.className = 'pinned-note';

    const preview = note.body.replace(/[#*\[\]]/g, '').substring(0, 50);

    el.innerHTML = `
                <button class="pinned-unpin" onclick="event.stopPropagation(); togglePinItem('note', '${noteId}')">✕</button>
                <div style="font-weight:600; font-size:11px; margin-bottom:3px; color:#eee;">📝 ${note.title || '(Untitled)'}</div>
                <div style="font-size:10px; color:#888;">${preview}...</div>
            `;

    el.onclick = () => {
        openNoteEditor(noteId);
    };

    container.appendChild(el);
}

function renderPinnedHabit(container, habitId) {
    const h = habits.find(habit => habit.id === habitId);
    if (!h) {
        pinnedItems = pinnedItems.filter(p => !(p.type === 'habit' && p.id === habitId));
        saveToStorage();
        return;
    }

    const freq = h.frequency || 'daily';
    const bounds = getPeriodBounds(freq);
    const val = getSumInPeriod(h, bounds);
    const target = h.target || 1;
    const isDone = val >= target;
    const percent = Math.min(100, (val / target) * 100);

    if (!h.type) h.type = 'checkbox';

    let controlsHtml = '';
    if (h.type === 'checkbox') {
        controlsHtml = `
                    <div class="habit-checkbox ${isDone ? 'checked' : ''}" onclick="event.stopPropagation(); toggleHabitDay('${h.id}'); renderPinnedWindow();" style="flex-shrink:0;">
                        ${isDone ? '✓' : ''}
                    </div>`;
    } else if (h.type === 'counter') {
        controlsHtml = `
                    <div style="display:flex; gap:3px; align-items:center; flex-shrink:0;">
                        <button class="habit-btn-small" onclick="event.stopPropagation(); updateHabitCounter('${h.id}', -1); renderPinnedWindow();" style="width:20px; height:20px; font-size:10px;">-</button>
                        <span style="font-family:monospace; font-size:10px; min-width:30px; text-align:center; color:${isDone ? 'var(--ready-color)' : '#aaa'};">${val}/${Math.floor(target)}</span>
                        <button class="habit-btn-small" onclick="event.stopPropagation(); updateHabitCounter('${h.id}', 1); renderPinnedWindow();" style="width:20px; height:20px; font-size:10px;">+</button>
                    </div>`;
    } else if (h.type === 'timer') {
        const isRunning = !!h.activeTimerStart;
        const minsVal = Math.floor(val / 60000);
        const minsTarget = Math.floor(target / 60000);
        controlsHtml = `
                    <div style="display:flex; gap:3px; align-items:center; flex-shrink:0;">
                        <button class="habit-btn-small" onclick="event.stopPropagation(); toggleHabitTimer('${h.id}'); renderPinnedWindow();" style="width:20px; height:20px; font-size:10px; ${isRunning ? 'border-color:var(--ready-color); color:var(--ready-color);' : ''}">
                            ${isRunning ? '⏸' : '▶'}
                        </button>
                        <span style="font-family:monospace; font-size:10px; color:${isDone ? 'var(--ready-color)' : '#aaa'};">${minsVal}m/${minsTarget}m</span>
                    </div>`;
    }

    const el = document.createElement('div');
    el.className = `pinned-habit ${isDone ? 'done-today' : ''}`;

    el.innerHTML = `
                <button class="pinned-unpin" onclick="event.stopPropagation(); togglePinItem('habit', '${habitId}')">✕</button>
                ${h.type === 'checkbox' ? controlsHtml : ''}
                <div style="flex-grow:1; min-width:0;">
                    <div style="font-weight:600; font-size:11px; color:#eee; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                        ${h.title}
                        ${h.noteIds && h.noteIds.length > 0 ? `<span style="color:#3b82f6; font-size:9px; margin-left:4px; cursor:pointer;" onclick="event.stopPropagation(); showHabitNotes('${habitId}')" title="View linked notes">📝${h.noteIds.length}</span>` : ''}
                    </div>
                    ${h.type !== 'checkbox' ? `
                        <div style="height:3px; background:#333; border-radius:2px; margin-top:3px; overflow:hidden;">
                            <div style="height:100%; background:${isDone ? 'var(--ready-color)' : 'var(--accent)'}; width:${percent}%; transition:width 0.3s;"></div>
                        </div>
                    ` : ''}
                </div>
                ${h.type !== 'checkbox' ? controlsHtml : ''}
            `;

    container.appendChild(el);
}

function centerHealthDashboard() {
    const healthDash = document.getElementById('health-dashboard');
    if (!healthDash) return;

    // Calculate center position
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;
    const dashWidth = healthDash.offsetWidth;
    const dashHeight = healthDash.offsetHeight;

    const centerX = (windowWidth - dashWidth) / 2;
    const centerY = (windowHeight - dashHeight) / 2;

    // Apply centered position
    healthDash.style.setProperty('left', centerX + 'px', 'important');
    healthDash.style.setProperty('top', centerY + 'px', 'important');
    healthDash.style.setProperty('bottom', 'auto', 'important');
    healthDash.style.setProperty('right', 'auto', 'important');

    // Save the new position
    healthDashboardPosition = {
        x: centerX,
        y: centerY
    };
    localStorage.setItem('healthDashboardPosition', JSON.stringify(healthDashboardPosition));

    showNotification("Health Dashboard Centered (Opt+J)");
}

document.addEventListener('mousedown', (e) => {
    const inspector = document.getElementById('inspector');
    if (inspector && !inspector.classList.contains('hidden')) {
        if (inspector.contains(e.target) ||
            e.target.closest('.node') ||
            e.target.closest('.node-timer-control') ||
            e.target.closest('#selection-menu')) {
            return;
        }
        deselectNode();
    }
});
