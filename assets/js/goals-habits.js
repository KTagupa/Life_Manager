// --- LIFE GOALS LOGIC ---
function toggleGoals(forceOpen = null) {
    const panel = document.getElementById('goals-panel');
    const aiModal = document.getElementById('ai-modal'); // Use aiModal for consistency

    const shouldOpen = forceOpen === true || (forceOpen === null && panel.classList.contains('hidden'));
    if (shouldOpen) {
        if (typeof openRightDockPanel === 'function') {
            openRightDockPanel('goals-panel', () => {
                renderGoals();
            });
        } else {
            panel.classList.remove('hidden');
            renderGoals();
        }
        if (aiModal.classList.contains('visible')) { // Check if AI modal is open
            closeAIModal(); // Close AI modal if open
        }
    } else {
        if (typeof closeRightDockPanel === 'function') closeRightDockPanel('goals-panel');
        else panel.classList.add('hidden');
    }
}
function changeGoalYear(delta) { currentGoalYear += delta; renderGoals(); }
function renderGoals() {
    const container = document.getElementById('goal-tree-container');
    document.getElementById('goals-year-display').innerText = currentGoalYear;
    container.innerHTML = '';
    if (!lifeGoals[currentGoalYear]) lifeGoals[currentGoalYear] = [];
    const goals = lifeGoals[currentGoalYear];
    if (goals.length === 0) { container.innerHTML = '<div style="text-align:center; color:#666; font-size:12px; margin-top:20px;">No goals for ' + currentGoalYear + '</div>'; return; }
    const buildTree = (goalList, level) => {
        const wrapper = document.createElement('div');
        goalList.forEach(goal => {
            const nodeDiv = document.createElement('div'); nodeDiv.className = 'goal-node';
            nodeDiv.dataset.goalId = goal.id;
            const content = document.createElement('div'); content.className = 'goal-content';
            const caret = document.createElement('span'); caret.className = 'goal-caret';
            if (goal.children.length === 0) caret.classList.add('invisible');
            if (goal.collapsed) caret.classList.add('collapsed');
            caret.innerText = '▼'; caret.onclick = (e) => { e.stopPropagation(); toggleGoalCollapse(goal); };
            const textSpan = document.createElement('input'); textSpan.className = 'goal-text'; textSpan.value = goal.text; textSpan.onchange = (e) => { goal.text = e.target.value; saveToStorage(); };
            const actions = document.createElement('div'); actions.className = 'goal-actions';
            const filterBtn = document.createElement('div'); filterBtn.className = 'goal-btn move'; filterBtn.innerHTML = '🔍'; filterBtn.title = "Show tasks linked to this goal"; filterBtn.onclick = (e) => { e.stopPropagation(); filterTasksByGoal(goal.id); }; actions.appendChild(filterBtn);
            if (level < 5) { const addBtn = document.createElement('div'); addBtn.className = 'goal-btn add'; addBtn.innerHTML = '+'; addBtn.title = "Add Subgoal"; addBtn.onclick = (e) => { e.stopPropagation(); addSubGoal(goal); }; actions.appendChild(addBtn); }
            const moveBtn = document.createElement('div'); moveBtn.className = 'goal-btn move'; moveBtn.innerHTML = '📅'; moveBtn.title = "Move to another year"; moveBtn.onclick = (e) => { e.stopPropagation(); moveGoalYear(goal); }; actions.appendChild(moveBtn);
            const decompBtn = document.createElement('div'); decompBtn.className = 'goal-btn move'; decompBtn.innerHTML = '✨'; decompBtn.title = "Decompose with AI"; decompBtn.onclick = (e) => { e.stopPropagation(); decomposeGoal(goal); }; actions.appendChild(decompBtn);
            const delBtn = document.createElement('div'); delBtn.className = 'goal-btn del'; delBtn.innerHTML = '✕'; delBtn.title = "Delete Goal"; delBtn.onclick = (e) => { e.stopPropagation(); deleteGoal(goal, goalList); }; actions.appendChild(delBtn);
            content.appendChild(caret); content.appendChild(textSpan); content.appendChild(actions); nodeDiv.appendChild(content);
            const childrenContainer = document.createElement('div'); childrenContainer.className = 'goal-children ' + (goal.collapsed ? 'hidden' : '');
            if (goal.children.length > 0) { childrenContainer.appendChild(buildTree(goal.children, level + 1)); }
            nodeDiv.appendChild(childrenContainer); wrapper.appendChild(nodeDiv);
        });
        return wrapper;
    };
    container.appendChild(buildTree(goals, 1));
}
function addRootGoal() { const input = document.getElementById('new-goal-input'); const val = input.value.trim(); if (val) { if (!lifeGoals[currentGoalYear]) lifeGoals[currentGoalYear] = []; lifeGoals[currentGoalYear].push(createGoal(val)); input.value = ''; renderGoals(); saveToStorage(); } }
function addSubGoal(parentGoal) { parentGoal.children.push(createGoal("New Subgoal")); parentGoal.collapsed = false; renderGoals(); saveToStorage(); }
function deleteGoal(goal, parentList) { if (!parentList || !goal) return; if (confirm("Delete goal '" + goal.text + "'?")) { const idx = parentList.indexOf(goal); if (idx > -1) parentList.splice(idx, 1); renderGoals(); saveToStorage(); } }
function toggleGoalCollapse(goal) { goal.collapsed = !goal.collapsed; renderGoals(); saveToStorage(); }
function moveGoalYear(goal) { const yearStr = prompt("Move '" + goal.text + "' to which year?", currentGoalYear + 1); const year = parseInt(yearStr); if (!isNaN(year)) { if (recursiveRemoveGoal(lifeGoals[currentGoalYear], goal.id)) { if (!lifeGoals[year]) lifeGoals[year] = []; lifeGoals[year].push(goal); renderGoals(); saveToStorage(); alert(`Moved to ${year}`); } else { alert("Could not find goal to move."); } } }
function recursiveRemoveGoal(list, id) { if (!list) return false; for (let i = 0; i < list.length; i++) { if (list[i].id === id) { list.splice(i, 1); return true; } if (list[i].children && list[i].children.length > 0) { if (recursiveRemoveGoal(list[i].children, id)) return true; } } return false; }

let currentGoalFilter = null;
function filterTasksByGoal(goalId) {
    // getAllGoalIds is now in utils.js

    if (currentGoalFilter === goalId) {
        // Clear filter
        currentGoalFilter = null;
        showNotification("Goal filter cleared");
    } else {
        // Apply filter
        currentGoalFilter = goalId;
        const goalIds = getAllGoalIds(lifeGoals[currentGoalYear] || [], goalId);
        const filteredCount = nodes.filter(n => n.goalIds && n.goalIds.some(gid => goalIds.includes(gid))).length;
        showNotification(`Showing ${filteredCount} task(s) linked to this goal`);
    }
    render();
}


// --- HABIT TRACKER LOGIC ---
let currentHabitFilter = 'all';
let editingHabitId = null;
let pendingHabitFocusId = null;

function toggleHabits(forceOpen = null) {
    const panel = document.getElementById('habits-panel');

    const shouldOpen = forceOpen === true || (forceOpen === null && panel.classList.contains('hidden'));
    if (shouldOpen) {
        if (typeof openRightDockPanel === 'function') {
            openRightDockPanel('habits-panel', () => {
                updateHabitGoalSelect();
                toggleHabitInputs();
                syncHabitComposerMode();
                renderHabits();
            });
        } else {
            panel.classList.remove('hidden');
            updateHabitGoalSelect();
            toggleHabitInputs();
            syncHabitComposerMode();
            renderHabits();
        }
    } else {
        if (typeof closeRightDockPanel === 'function') closeRightDockPanel('habits-panel');
        else panel.classList.add('hidden');
    }
}

function setHabitFilter(filter) {
    currentHabitFilter = filter || 'all';
    document.querySelectorAll('.habit-filter-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.filter === currentHabitFilter);
    });
    renderHabits();
}

// getAllGoalsFlat() and getGoalTextById() are now in utils.js

function updateHabitGoalSelect() {
    const select = document.getElementById('habit-goal-select');
    if (!select) return;
    select.innerHTML = '<option value="">(Optional) Link to a Life Goal...</option>';

    const allGoals = getAllGoalsFlat();
    allGoals.forEach(item => {
        const opt = document.createElement('option');
        const indent = item.depth > 0 ? ('- '.repeat(item.depth)) : '';
        opt.value = item.goal.id;
        opt.text = `${item.year} • ${indent}${item.goal.text}`;
        select.appendChild(opt);
    });
}

function toggleHabitInputs() {
    const typeSelect = document.getElementById('habit-type-select');
    const targetInput = document.getElementById('habit-target-input');
    const unitLabel = document.getElementById('habit-unit-label');
    if (!typeSelect || !targetInput || !unitLabel) return;

    const type = typeSelect.value;

    targetInput.style.display = 'block';
    unitLabel.style.display = 'inline';
    targetInput.value = targetInput.value || '';

    if (type === 'checkbox') {
        targetInput.style.display = 'none';
        unitLabel.style.display = 'none';
    } else if (type === 'counter') {
        targetInput.placeholder = "Target count (e.g. 10)";
        unitLabel.innerText = 'counts';
    } else if (type === 'timer') {
        targetInput.placeholder = "Target minutes (e.g. 40)";
        unitLabel.innerText = 'mins';
    }
}

function getHabitComposerElements() {
    return {
        titleInput: document.getElementById('new-habit-input'),
        typeSelect: document.getElementById('habit-type-select'),
        frequencySelect: document.getElementById('habit-frequency-select'),
        targetInput: document.getElementById('habit-target-input'),
        goalSelect: document.getElementById('habit-goal-select'),
        submitBtn: document.getElementById('habit-submit-btn'),
        cancelBtn: document.getElementById('habit-cancel-edit-btn')
    };
}

function syncHabitComposerMode() {
    const { titleInput, submitBtn, cancelBtn } = getHabitComposerElements();
    if (submitBtn) submitBtn.innerText = editingHabitId ? 'Save' : 'Add';
    if (cancelBtn) cancelBtn.style.display = editingHabitId ? 'inline-flex' : 'none';
    if (titleInput) titleInput.placeholder = editingHabitId ? 'Edit habit title...' : 'New habit...';
}

function resetHabitComposer(keepTitleFocus = false) {
    editingHabitId = null;
    const { titleInput, typeSelect, frequencySelect, targetInput, goalSelect } = getHabitComposerElements();
    if (titleInput) titleInput.value = '';
    if (typeSelect) typeSelect.value = 'checkbox';
    if (frequencySelect) frequencySelect.value = 'daily';
    if (targetInput) targetInput.value = '';
    if (goalSelect) goalSelect.value = '';
    toggleHabitInputs();
    syncHabitComposerMode();
    if (keepTitleFocus && titleInput) titleInput.focus();
}

function editHabit(id) {
    const habit = habits.find(h => h.id === id);
    if (!habit) return;
    normalizeHabitForRuntime(habit);

    editingHabitId = id;
    const { titleInput, typeSelect, frequencySelect, targetInput, goalSelect } = getHabitComposerElements();
    if (!titleInput || !typeSelect || !frequencySelect || !targetInput || !goalSelect) return;

    titleInput.value = habit.title || '';
    typeSelect.value = habit.type || 'checkbox';
    frequencySelect.value = habit.frequency || 'daily';
    if (habit.type === 'timer') {
        targetInput.value = String(Math.max(1, Math.round((Number(habit.target) || 0) / 60000)));
    } else if (habit.type === 'counter') {
        targetInput.value = String(Math.max(1, Math.round(Number(habit.target) || 1)));
    } else {
        targetInput.value = '';
    }
    goalSelect.value = habit.goalId || '';

    toggleHabitInputs();
    syncHabitComposerMode();
    titleInput.focus();
    showNotification('Editing habit');
}

function cancelHabitEdit() {
    resetHabitComposer(true);
}

function focusHabitInPanel(habitId) {
    if (!habitId || !habits.some(h => h.id === habitId)) return false;
    pendingHabitFocusId = habitId;
    setHabitFilter('all');
    toggleHabits(true);
    return true;
}

function parseHabitDateKey(dateKey) {
    const parts = (dateKey || '').split('-').map(Number);
    if (parts.length !== 3 || parts.some(Number.isNaN)) return null;
    return new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0, 0);
}

function getHabitDateKey(offsetDays = 0) {
    const d = new Date();
    d.setDate(d.getDate() - offsetDays);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function getPeriodBounds(frequency, date = new Date()) {
    const start = new Date(date);
    const end = new Date(date);
    if (frequency === 'weekly') {
        const day = start.getDay();
        start.setDate(start.getDate() - day);
        start.setHours(0, 0, 0, 0);
        end.setDate(start.getDate() + 6);
        end.setHours(23, 59, 59, 999);
    } else if (frequency === 'monthly') {
        start.setDate(1);
        start.setHours(0, 0, 0, 0);
        end.setMonth(start.getMonth() + 1, 0);
        end.setHours(23, 59, 59, 999);
    } else {
        start.setHours(0, 0, 0, 0);
        end.setHours(23, 59, 59, 999);
    }
    return { start, end };
}

function normalizeHabitForRuntime(habit) {
    if (!habit.history || typeof habit.history !== 'object') habit.history = {};
    if (!habit.type) habit.type = 'checkbox';
    if (!habit.frequency) habit.frequency = 'daily';
    if (habit.activeTimerStart === undefined || habit.activeTimerStart === null) habit.activeTimerStart = null;
    if (habit.activeTimerStart !== null) habit.activeTimerStart = Number(habit.activeTimerStart);
    if (!Array.isArray(habit.noteIds)) habit.noteIds = [];

    if (habit.type === 'timer') {
        const targetMs = Number(habit.target);
        habit.target = Number.isFinite(targetMs) && targetMs > 0 ? targetMs : (30 * 60000);
    } else if (habit.type === 'counter') {
        const targetCount = Number(habit.target);
        habit.target = Number.isFinite(targetCount) && targetCount > 0 ? Math.round(targetCount) : 1;
    } else {
        habit.target = 1;
    }
}

function getHabitTarget(habit) {
    if (habit.type === 'timer') return Math.max(1, Number(habit.target) || 0);
    if (habit.type === 'counter') return Math.max(1, Math.round(Number(habit.target) || 0));
    return 1;
}

function getSumInPeriod(habit, bounds) {
    let sum = 0;
    const history = habit.history || {};

    for (const [dateKey, rawValue] of Object.entries(history)) {
        const entryDate = parseHabitDateKey(dateKey);
        if (!entryDate) continue;
        if (entryDate < bounds.start || entryDate > bounds.end) continue;

        if (typeof rawValue === 'boolean') {
            sum += rawValue ? 1 : 0;
        } else {
            const val = Number(rawValue) || 0;
            sum += val;
        }
    }

    if (habit.activeTimerStart && habit.type === 'timer') {
        const now = Date.now();
        if (now >= bounds.start.getTime() && now <= bounds.end.getTime()) {
            sum += (now - habit.activeTimerStart);
        }
    }

    return Math.max(0, sum);
}

function getHabitMetrics(habit) {
    normalizeHabitForRuntime(habit);
    const freq = habit.frequency || 'daily';
    const bounds = getPeriodBounds(freq);
    const current = getSumInPeriod(habit, bounds);
    const target = getHabitTarget(habit);
    const ratio = target > 0 ? (current / target) : 0;
    const isDone = ratio >= 1;
    const clampedPercent = Math.min(100, Math.round(ratio * 100));
    return {
        current: current,
        target: target,
        ratio: ratio,
        isDone: isDone,
        percent: clampedPercent,
        status: isDone ? 'completed' : (current > 0 ? 'in-progress' : 'needs-action')
    };
}

function getFrequencyLabel(freq) {
    if (freq === 'weekly') return 'Weekly';
    if (freq === 'monthly') return 'Monthly';
    return 'Daily';
}

function getHabitProgressLabel(habit, metrics) {
    const freqLabel = getFrequencyLabel(habit.frequency || 'daily');
    if (habit.type === 'timer') {
        const currentMins = Math.floor(metrics.current / 60000);
        const targetMins = Math.floor(metrics.target / 60000);
        return `${currentMins}m / ${targetMins}m · ${freqLabel}`;
    }
    if (habit.type === 'counter') {
        return `${Math.floor(metrics.current)} / ${Math.floor(metrics.target)} · ${freqLabel}`;
    }
    return `${metrics.current >= 1 ? 'Done' : 'Not done'} · ${freqLabel}`;
}

function addHabit() {
    const {
        titleInput: input,
        typeSelect,
        frequencySelect,
        targetInput,
        goalSelect
    } = getHabitComposerElements();
    if (!input || !typeSelect || !targetInput || !goalSelect || !frequencySelect) return;

    const title = input.value.trim();
    const type = typeSelect.value;
    const frequency = frequencySelect.value;

    if (!title) return;

    let target = 1;
    if (type === 'counter') {
        const parsed = Math.round(Number(targetInput.value));
        if (!Number.isFinite(parsed) || parsed <= 0) {
            alert("Enter a valid target count.");
            return;
        }
        target = parsed;
    } else if (type === 'timer') {
        const parsedMinutes = Number(targetInput.value);
        if (!Number.isFinite(parsedMinutes) || parsedMinutes <= 0) {
            alert("Enter a valid target in minutes.");
            return;
        }
        target = Math.round(parsedMinutes * 60000);
    }

    if (editingHabitId) {
        const habit = habits.find(h => h.id === editingHabitId);
        if (!habit) {
            resetHabitComposer(false);
            return;
        }

        const previousType = habit.type || 'checkbox';
        if (previousType !== type) {
            const shouldReset = confirm('Changing habit type will reset tracked progress history. Continue?');
            if (!shouldReset) return;
            habit.history = {};
            habit.activeTimerStart = null;
        }

        habit.title = title;
        habit.type = type;
        habit.frequency = frequency || 'daily';
        habit.target = target;
        habit.goalId = goalSelect.value || null;
        if (habit.type !== 'timer') habit.activeTimerStart = null;
        if (!Array.isArray(habit.noteIds)) habit.noteIds = [];
        habit.updated = Date.now();

        resetHabitComposer(false);
        showNotification('Habit updated');
    } else {
        habits.push({
            id: 'habit_' + Date.now(),
            title: title,
            type: type,
            frequency: frequency || 'daily',
            target: target,
            goalId: goalSelect.value || null,
            history: {},
            activeTimerStart: null,
            created: Date.now(),
            noteIds: []
        });
        resetHabitComposer(false);
    }

    renderHabits();
    saveToStorage();
}

function deleteHabit(id) {
    if (confirm("Delete this habit and its history?")) {
        discardReminderByItem('habit', id);
        habits = habits.filter(h => h.id !== id);
        if (editingHabitId === id) resetHabitComposer(false);
        renderHabits();
        saveToStorage();
    }
}

function toggleHabitDay(id) {
    const habit = habits.find(h => h.id === id);
    if (!habit) return;
    normalizeHabitForRuntime(habit);

    const key = getHabitDateKey(0);
    const current = Number(habit.history[key]) || 0;
    if (current >= 1) delete habit.history[key];
    else habit.history[key] = 1;

    renderHabits();
    saveToStorage();
}

function updateHabitCounter(id, change) {
    const habit = habits.find(h => h.id === id);
    if (!habit) return;
    normalizeHabitForRuntime(habit);

    const key = getHabitDateKey(0);
    const base = Number(habit.history[key]) || 0;
    const next = Math.max(0, Math.round(base + change));
    habit.history[key] = next;

    renderHabits();
    saveToStorage();
}

function updateHabitMinutes(id, deltaMinutes) {
    const habit = habits.find(h => h.id === id);
    if (!habit || habit.type !== 'timer') return;
    normalizeHabitForRuntime(habit);

    const key = getHabitDateKey(0);
    const base = Number(habit.history[key]) || 0;
    const next = Math.max(0, base + (deltaMinutes * 60000));
    habit.history[key] = next;

    renderHabits();
    saveToStorage();
}

function toggleHabitTimer(id) {
    const habit = habits.find(h => h.id === id);
    if (!habit) return;
    normalizeHabitForRuntime(habit);

    const key = getHabitDateKey(0);
    if (habit.activeTimerStart) {
        const now = Date.now();
        const duration = Math.max(0, now - habit.activeTimerStart);
        habit.history[key] = Math.max(0, (Number(habit.history[key]) || 0) + duration);

        if (!Array.isArray(habit.timeLogs)) habit.timeLogs = [];
        habit.timeLogs.push({ start: habit.activeTimerStart, end: now, duration: duration });

        habit.activeTimerStart = null;
        playAudioFeedback('timer-stop');
    } else {
        habit.activeTimerStart = Date.now();
        playAudioFeedback('timer-start');
    }

    renderHabits();
    saveToStorage();
}

function renderHabitSummary(items) {
    const completedEl = document.getElementById('habit-summary-completed');
    const pendingEl = document.getElementById('habit-summary-pending');
    const fillEl = document.getElementById('habit-summary-progress-fill');
    const textEl = document.getElementById('habit-summary-progress-text');
    const periodEl = document.getElementById('habit-summary-period');
    if (!completedEl || !pendingEl || !fillEl || !textEl || !periodEl) return;

    if (items.length === 0) {
        completedEl.innerText = '0';
        pendingEl.innerText = '0';
        fillEl.style.width = '0%';
        textEl.innerText = '0% complete';
        periodEl.innerText = 'No habits yet';
        return;
    }

    const completedCount = items.filter(item => item.metrics.isDone).length;
    const pendingCount = items.length - completedCount;
    const averagePercent = Math.round(items.reduce((sum, item) => sum + item.metrics.percent, 0) / items.length);

    completedEl.innerText = String(completedCount);
    pendingEl.innerText = String(pendingCount);
    fillEl.style.width = `${Math.min(100, averagePercent)}%`;
    textEl.innerText = `${averagePercent}% complete`;
    periodEl.innerText = 'Live period snapshot';
}

function getHabitCardControls(habit, metrics) {
    if (habit.type === 'checkbox') {
        return `
                    <button class="habit-main-toggle ${metrics.isDone ? 'done' : ''}" onclick="toggleHabitDay('${habit.id}')">
                        ${metrics.isDone ? 'Done' : 'Mark Done'}
                    </button>
                `;
    }

    if (habit.type === 'counter') {
        return `
                    <div class="habit-controls">
                        <button class="habit-btn-small" onclick="updateHabitCounter('${habit.id}', -1)">-</button>
                        <div class="habit-val-display">${Math.floor(metrics.current)} / ${Math.floor(metrics.target)}</div>
                        <button class="habit-btn-small" onclick="updateHabitCounter('${habit.id}', 1)">+</button>
                    </div>
                `;
    }

    const isRunning = !!habit.activeTimerStart;
    const currentMins = Math.floor(metrics.current / 60000);
    const targetMins = Math.floor(metrics.target / 60000);
    return `
                <div class="habit-controls">
                    <button class="habit-btn-small" onclick="updateHabitMinutes('${habit.id}', -5)">-5m</button>
                    <button class="habit-btn-small" onclick="toggleHabitTimer('${habit.id}')" style="${isRunning ? 'border-color:var(--ready-color); color:var(--ready-color);' : ''}">${isRunning ? '⏸' : '▶'}</button>
                    <button class="habit-btn-small" onclick="updateHabitMinutes('${habit.id}', 5)">+5m</button>
                    <div class="habit-val-display">${currentMins}m / ${targetMins}m</div>
                </div>
            `;
}

function renderHabits() {
    try {
        const container = document.getElementById('habits-list-container');
        if (!container) return;
        container.innerHTML = '';
    
        const prepared = habits.map(habit => {
            normalizeHabitForRuntime(habit);
            return { habit: habit, metrics: getHabitMetrics(habit) };
        });
    
        renderHabitSummary(prepared);
    
        const filtered = prepared.filter(item => {
            if (currentHabitFilter === 'completed') return item.metrics.isDone;
            if (currentHabitFilter === 'needs-action') return !item.metrics.isDone;
            return true;
        });
    
        if (prepared.length === 0) {
            container.innerHTML = '<div style="text-align:center; color:#666; padding:20px;">No habits tracked yet.</div>';
            return;
        }
    
        if (filtered.length === 0) {
            container.innerHTML = '<div style="text-align:center; color:#666; padding:20px;">No habits in this filter.</div>';
            return;
        }
    
        filtered.forEach(item => {
            const h = item.habit;
            const metrics = item.metrics;
            const goalName = h.goalId ? getGoalTextById(h.goalId) : '';
            const progressLabel = getHabitProgressLabel(h, metrics);
            const controlsHtml = getHabitCardControls(h, metrics);
    
            const el = document.createElement('div');
            el.className = `habit-item ${metrics.isDone ? 'done-today' : ''}`;
            el.dataset.habitId = h.id;
            el.innerHTML = `
                        <div class="habit-card-top">
                            <div class="habit-title-wrap">
                                <div class="habit-title">${h.title}</div>
                                <div class="habit-progress-label">${progressLabel}</div>
                            </div>
                            <div class="habit-ratio-pill ${metrics.isDone ? 'done' : ''}">${metrics.percent}%</div>
                        </div>
    
                        <div class="habit-progress-track">
                            <div class="habit-progress-fill ${metrics.isDone ? 'done' : ''}" style="width:${metrics.percent}%"></div>
                        </div>
    
                        <div class="habit-card-bottom">
                            <div class="habit-meta">
                                ${goalName ? `<span class="habit-goal-link" title="${goalName}">🎯 ${goalName}</span>` : '<span class="habit-goal-link muted">No linked goal</span>'}
                                ${h.noteIds && h.noteIds.length > 0 ? `<span style="color:#3b82f6; font-size:10px; cursor:pointer;" onclick="event.stopPropagation(); showHabitNotes('${h.id}')" title="View linked notes">📝 ${h.noteIds.length}</span>` : ''}
                            </div>
                            <div class="habit-actions">
                                <button class="btn" style="padding:2px 6px; font-size:10px; ${hasReminderForItem('habit', h.id) ? 'border-color:var(--critical-path); color:var(--critical-path);' : ''}" onclick="openRemindersModal('habit', '${h.id}')">⏰</button>
                                <button class="btn" style="padding:2px 6px; font-size:10px;" onclick="editHabit('${h.id}')">✎</button>
                                <button class="btn" style="padding:2px 6px; font-size:10px; ${isPinned('habit', h.id) ? 'border-color:var(--accent); color:var(--accent);' : ''}" onclick="togglePinItem('habit', '${h.id}'); renderHabits();">📌</button>
                                <button class="btn btn-danger" style="padding:2px 6px; font-size:10px;" onclick="deleteHabit('${h.id}')">✕</button>
                            </div>
                        </div>
    
                        <div class="habit-controls-row">
                            ${controlsHtml}
                        </div>
                    `;
            container.appendChild(el);
        });
    
        if (pendingHabitFocusId) {
            const selector = `.habit-item[data-habit-id="${pendingHabitFocusId}"]`;
            const target = container.querySelector(selector);
            if (target) {
                target.scrollIntoView({ behavior: 'smooth', block: 'center' });
                target.classList.add('reminder-focus-target');
                setTimeout(() => target.classList.remove('reminder-focus-target'), 1800);
            }
            pendingHabitFocusId = null;
        }
    } catch (error) {
        console.error("Error in renderHabits:", error);
        if(typeof showNotification === "function") showNotification("Render Error: Check console", "error");
    }
}
