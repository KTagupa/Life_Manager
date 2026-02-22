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

    el.innerHTML = `
                <button class="pinned-unpin" onclick="event.stopPropagation(); togglePinItem('task', '${taskId}')">✕</button>
                <div style="font-weight:600; font-size:12px; margin-bottom:4px; color:#eee;">${node.completed ? '✅' : ''} ${node.title}</div>
                <div style="display:flex; gap:4px; flex-wrap:wrap; font-size:10px; margin-bottom:4px;">${badgesHtml}</div>
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

    const metrics = getHabitMetrics(h);
    const isDone = metrics.isDone;
    const percent = metrics.percent;
    const goalName = h.goalId ? getGoalTextById(h.goalId) : '';

    let controlsHtml = '';
    if (h.type === 'checkbox') {
        controlsHtml = `
            <button class="habit-btn-small" onclick="event.stopPropagation(); toggleHabitDay('${h.id}'); renderPinnedWindow();" style="${isDone ? 'border-color:var(--ready-color); color:var(--ready-color);' : ''}">
                ${isDone ? '✓' : '○'}
            </button>
        `;
    } else if (h.type === 'counter') {
        controlsHtml = `
            <div style="display:flex; gap:3px; align-items:center; flex-shrink:0;">
                <button class="habit-btn-small" onclick="event.stopPropagation(); updateHabitCounter('${h.id}', -1); renderPinnedWindow();" style="width:20px; height:20px; font-size:10px;">-</button>
                <span style="font-family:monospace; font-size:10px; min-width:54px; text-align:center; color:${isDone ? 'var(--ready-color)' : '#aaa'};">${Math.floor(metrics.current)}/${Math.floor(metrics.target)}</span>
                <button class="habit-btn-small" onclick="event.stopPropagation(); updateHabitCounter('${h.id}', 1); renderPinnedWindow();" style="width:20px; height:20px; font-size:10px;">+</button>
            </div>
        `;
    } else if (h.type === 'timer') {
        const isRunning = !!h.activeTimerStart;
        const minsVal = Math.floor(metrics.current / 60000);
        const minsTarget = Math.floor(metrics.target / 60000);
        controlsHtml = `
            <div style="display:flex; gap:3px; align-items:center; flex-shrink:0;">
                <button class="habit-btn-small" onclick="event.stopPropagation(); updateHabitMinutes('${h.id}', -5); renderPinnedWindow();" style="width:26px; height:20px; font-size:9px;">-5</button>
                <button class="habit-btn-small" onclick="event.stopPropagation(); toggleHabitTimer('${h.id}'); renderPinnedWindow();" style="width:20px; height:20px; font-size:10px; ${isRunning ? 'border-color:var(--ready-color); color:var(--ready-color);' : ''}">
                    ${isRunning ? '⏸' : '▶'}
                </button>
                <button class="habit-btn-small" onclick="event.stopPropagation(); updateHabitMinutes('${h.id}', 5); renderPinnedWindow();" style="width:26px; height:20px; font-size:9px;">+5</button>
                <span style="font-family:monospace; font-size:10px; color:${isDone ? 'var(--ready-color)' : '#aaa'};">${minsVal}m/${minsTarget}m</span>
            </div>
        `;
    }

    const el = document.createElement('div');
    el.className = `pinned-habit ${isDone ? 'done-today' : ''}`;

    el.innerHTML = `
                <button class="pinned-unpin" onclick="event.stopPropagation(); togglePinItem('habit', '${habitId}')">✕</button>
                <div style="flex-grow:1; min-width:0;">
                    <div style="font-weight:600; font-size:11px; color:#eee; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                        ${h.title}
                        ${h.noteIds && h.noteIds.length > 0 ? `<span style="color:#3b82f6; font-size:9px; margin-left:4px; cursor:pointer;" onclick="event.stopPropagation(); showHabitNotes('${habitId}')" title="View linked notes">📝${h.noteIds.length}</span>` : ''}
                    </div>
                    <div style="font-size:9px; color:#889; margin-top:2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                        ${goalName ? '🎯 ' + goalName : 'No linked goal'} • ${percent}%
                    </div>
                    <div style="height:3px; background:#333; border-radius:2px; margin-top:3px; overflow:hidden;">
                        <div style="height:100%; background:${isDone ? 'var(--ready-color)' : 'var(--accent)'}; width:${percent}%; transition:width 0.3s;"></div>
                    </div>
                </div>
                ${controlsHtml}
            `;

    container.appendChild(el);
}
