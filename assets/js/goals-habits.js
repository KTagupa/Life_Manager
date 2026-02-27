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
function resizeGoalTextarea(textarea) {
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${textarea.scrollHeight}px`;
}

function initializeGoalTextareas(scope = document) {
    scope.querySelectorAll('.goal-text').forEach(resizeGoalTextarea);
}

let pendingGoalFocus = null;

function focusGoalEditor(goalId, selectAll = false) {
    if (!goalId) return;
    const container = document.getElementById('goal-tree-container');
    if (!container) return;

    const node = Array.from(container.querySelectorAll('.goal-node')).find(
        (item) => item.dataset.goalId === goalId
    );
    if (!node) return;

    const editor = node.querySelector('.goal-text');
    if (!editor) return;

    node.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
    editor.focus();
    if (typeof editor.setSelectionRange === 'function') {
        if (selectAll) {
            editor.setSelectionRange(0, editor.value.length);
        } else {
            const end = editor.value.length;
            editor.setSelectionRange(end, end);
        }
    }
}

const GOAL_EDGE_PALETTE = [
    '#ef4444', // red
    '#f97316', // orange
    '#f59e0b', // amber
    '#eac54f', // yellow
    '#84cc16', // lime
    '#22c55e', // green
    '#10b981', // emerald
    '#14b8a6', // teal
    '#06b6d4', // cyan
    '#0ea5e9', // light blue
    '#3b82f6', // blue
    '#6366f1', // indigo
    '#8b5cf6', // violet
    '#a855f7', // purple
    '#d946ef', // fuchsia
    '#ec4899', // pink
    '#f43f5e'  // rose
];

function normalizeHexColor(value) {
    if (typeof normalizeGoalHexColor === 'function') return normalizeGoalHexColor(value);
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    if (!/^#?[0-9a-fA-F]{6}$/.test(trimmed)) return null;
    return trimmed.startsWith('#') ? trimmed.toLowerCase() : `#${trimmed.toLowerCase()}`;
}

function hexToRgbString(hexColor) {
    if (typeof goalHexToRgbString === 'function') return goalHexToRgbString(hexColor);
    const normalized = normalizeHexColor(hexColor);
    if (!normalized) return '255, 255, 255';
    const cleanHex = normalized.slice(1);
    const r = parseInt(cleanHex.slice(0, 2), 16);
    const g = parseInt(cleanHex.slice(2, 4), 16);
    const b = parseInt(cleanHex.slice(4, 6), 16);
    return `${r}, ${g}, ${b}`;
}

function getGoalBranchHexColor(goal, index, inheritedColor = null) {
    if (typeof resolveGoalBranchColorHex === 'function') {
        return resolveGoalBranchColorHex(goal, index, inheritedColor);
    }
    if (inheritedColor) return inheritedColor;
    const customColor = normalizeHexColor(goal && goal.color);
    if (customColor) return customColor;
    if (GOAL_EDGE_PALETTE.length === 0) return '#ffffff';
    return GOAL_EDGE_PALETTE[index % GOAL_EDGE_PALETTE.length];
}

function renderGoals() {
    const container = document.getElementById('goal-tree-container');
    document.getElementById('goals-year-display').innerText = currentGoalYear;
    container.innerHTML = '';
    if (!lifeGoals[currentGoalYear]) lifeGoals[currentGoalYear] = [];
    const goals = lifeGoals[currentGoalYear];
    if (goals.length === 0) { container.innerHTML = '<div style="text-align:center; color:#666; font-size:12px; margin-top:20px;">No goals for ' + currentGoalYear + '</div>'; return; }
    const buildTree = (goalList, level, inheritedColor = null) => {
        const wrapper = document.createElement('div');
        goalList.forEach((goal, index) => {
            const branchHexColor = getGoalBranchHexColor(goal, index, level === 1 ? null : inheritedColor);
            const branchColor = hexToRgbString(branchHexColor);
            const nodeDiv = document.createElement('div'); nodeDiv.className = `goal-node goal-level-${level}`;
            nodeDiv.dataset.goalId = goal.id;
            nodeDiv.style.setProperty('--goal-rgb', branchColor);
            const content = document.createElement('div'); content.className = 'goal-content';
            const caret = document.createElement('span'); caret.className = 'goal-caret';
            if (goal.children.length === 0) caret.classList.add('invisible');
            if (goal.collapsed) caret.classList.add('collapsed');
            caret.innerText = '▼'; caret.onclick = (e) => { e.stopPropagation(); toggleGoalCollapse(goal); };
            const textSpan = document.createElement('textarea');
            textSpan.className = 'goal-text';
            textSpan.rows = 1;
            textSpan.value = goal.text || '';
            textSpan.oninput = (e) => {
                goal.text = e.target.value;
                resizeGoalTextarea(e.target);
            };
            textSpan.onchange = () => { saveToStorage(); };
            const actions = document.createElement('div'); actions.className = 'goal-actions';
            const filterBtn = document.createElement('div'); filterBtn.className = 'goal-btn move'; filterBtn.innerHTML = '🔍'; filterBtn.title = "Show tasks linked to this goal"; filterBtn.onclick = (e) => { e.stopPropagation(); filterTasksByGoal(goal.id); }; actions.appendChild(filterBtn);
            if (level === 1) {
                const colorInput = document.createElement('input');
                colorInput.type = 'color';
                colorInput.className = 'goal-color-picker';
                colorInput.value = branchHexColor;
                colorInput.title = "Pick branch color";
                colorInput.onclick = (e) => { e.stopPropagation(); };
                colorInput.onchange = (e) => {
                    e.stopPropagation();
                    const nextColor = normalizeHexColor(e.target.value);
                    if (!nextColor) return;
                    goal.color = nextColor;
                    renderGoals();
                    saveToStorage();
                };
                actions.appendChild(colorInput);
            }
            if (level < 5) { const addBtn = document.createElement('div'); addBtn.className = 'goal-btn add'; addBtn.innerHTML = '+'; addBtn.title = "Add Subgoal"; addBtn.onclick = (e) => { e.stopPropagation(); addSubGoal(goal); }; actions.appendChild(addBtn); }
            const moveBtn = document.createElement('div'); moveBtn.className = 'goal-btn move'; moveBtn.innerHTML = '📅'; moveBtn.title = "Move to another year"; moveBtn.onclick = (e) => { e.stopPropagation(); moveGoalYear(goal); }; actions.appendChild(moveBtn);
            const decompBtn = document.createElement('div'); decompBtn.className = 'goal-btn move'; decompBtn.innerHTML = '✨'; decompBtn.title = "Decompose with AI"; decompBtn.onclick = (e) => { e.stopPropagation(); decomposeGoal(goal); }; actions.appendChild(decompBtn);
            const delBtn = document.createElement('div'); delBtn.className = 'goal-btn del'; delBtn.innerHTML = '✕'; delBtn.title = "Delete Goal"; delBtn.onclick = (e) => { e.stopPropagation(); deleteGoal(goal, goalList); }; actions.appendChild(delBtn);
            content.appendChild(caret); content.appendChild(textSpan); content.appendChild(actions); nodeDiv.appendChild(content);
            const childrenContainer = document.createElement('div'); childrenContainer.className = 'goal-children ' + (goal.collapsed ? 'hidden' : '');
            if (goal.children.length > 0) { childrenContainer.appendChild(buildTree(goal.children, level + 1, branchHexColor)); }
            nodeDiv.appendChild(childrenContainer); wrapper.appendChild(nodeDiv);
        });
        return wrapper;
    };
    container.appendChild(buildTree(goals, 1));
    initializeGoalTextareas(container);
    if (pendingGoalFocus && pendingGoalFocus.id) {
        const { id, selectAll } = pendingGoalFocus;
        pendingGoalFocus = null;
        requestAnimationFrame(() => focusGoalEditor(id, !!selectAll));
    }
}
function addRootGoal() {
    const input = document.getElementById('new-goal-input');
    const val = input.value.trim();
    if (!val) return;
    if (!lifeGoals[currentGoalYear]) lifeGoals[currentGoalYear] = [];
    const newGoal = createGoal(val);
    lifeGoals[currentGoalYear].push(newGoal);
    pendingGoalFocus = { id: newGoal.id, selectAll: false };
    input.value = '';
    renderGoals();
    saveToStorage();
}
function addSubGoal(parentGoal) {
    const newGoal = createGoal("New Subgoal");
    parentGoal.children.push(newGoal);
    parentGoal.collapsed = false;
    pendingGoalFocus = { id: newGoal.id, selectAll: true };
    renderGoals();
    saveToStorage();
}
function deleteGoal(goal, parentList) { if (!parentList || !goal) return; if (confirm("Delete goal '" + goal.text + "'?")) { const idx = parentList.indexOf(goal); if (idx > -1) parentList.splice(idx, 1); renderGoals(); saveToStorage(); } }
function toggleGoalCollapse(goal) { goal.collapsed = !goal.collapsed; renderGoals(); saveToStorage(); }
function moveGoalYear(goal) { const yearStr = prompt("Move '" + goal.text + "' to which year?", currentGoalYear + 1); const year = parseInt(yearStr); if (!isNaN(year)) { if (recursiveRemoveGoal(lifeGoals[currentGoalYear], goal.id)) { if (!lifeGoals[year]) lifeGoals[year] = []; lifeGoals[year].push(goal); renderGoals(); saveToStorage(); alert(`Moved to ${year}`); } else { alert("Could not find goal to move."); } } }
function recursiveRemoveGoal(list, id) { if (!list) return false; for (let i = 0; i < list.length; i++) { if (list[i].id === id) { list.splice(i, 1); return true; } if (list[i].children && list[i].children.length > 0) { if (recursiveRemoveGoal(list[i].children, id)) return true; } } return false; }

let currentGoalFilter = null;
function showAllTasksFromGoals() {
    if (!currentGoalFilter) {
        showNotification("Already showing all tasks");
        return;
    }
    currentGoalFilter = null;
    showNotification("Showing all tasks");
    render();
}

function filterTasksByGoal(goalId) {
    // getAllGoalIds is now in utils.js

    if (currentGoalFilter === goalId) {
        // Clear filter
        showAllTasksFromGoals();
        return;
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
const HABIT_DEFAULT_COLOR = '#4a8deb';

function setHabitComposerCollapsed(collapsed) {
    const panel = document.getElementById('habits-panel');
    if (!panel) return;
    panel.classList.toggle('habit-composer-collapsed', !!collapsed);
}

function refreshHabitComposerVisibility() {
    const list = document.getElementById('habits-list-container');
    if (!list) return;
    const nearTop = list.scrollTop <= 6;
    const hasScrollableContent = (list.scrollHeight - list.clientHeight) > 2;
    const shouldCollapse = hasScrollableContent && !nearTop && !editingHabitId;
    setHabitComposerCollapsed(shouldCollapse);
}

function ensureHabitScrollBehavior() {
    const list = document.getElementById('habits-list-container');
    if (!list || list.dataset.composerScrollBound === '1') return;
    list.dataset.composerScrollBound = '1';
    list.addEventListener('scroll', () => {
        refreshHabitComposerVisibility();
    }, { passive: true });
}

function normalizeHabitColor(value) {
    if (typeof normalizeGoalHexColor === 'function') {
        return normalizeGoalHexColor(value);
    }
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    if (!/^#?[0-9a-fA-F]{6}$/.test(trimmed)) return null;
    return trimmed.startsWith('#') ? trimmed.toLowerCase() : `#${trimmed.toLowerCase()}`;
}

function getHabitColorHex(habit) {
    return normalizeHabitColor(habit && habit.color) || HABIT_DEFAULT_COLOR;
}

function getLinkedGoalColorHex(habit) {
    if (!habit || !habit.goalId) return null;

    if (typeof getGoalThemeById === 'function') {
        const theme = getGoalThemeById(habit.goalId);
        const themedHex = normalizeHabitColor(theme && theme.hex);
        if (themedHex) return themedHex;
    }

    if (typeof getGoalColorHexById === 'function') {
        const goalHex = normalizeHabitColor(getGoalColorHexById(habit.goalId));
        if (goalHex) return goalHex;
    }

    return null;
}

function getEffectiveHabitColorHex(habit) {
    return getLinkedGoalColorHex(habit) || getHabitColorHex(habit);
}

function getHabitColorRgb(habit) {
    const hex = getEffectiveHabitColorHex(habit);
    if (typeof goalHexToRgbString === 'function') return goalHexToRgbString(hex);
    const cleanHex = hex.replace('#', '');
    const r = parseInt(cleanHex.slice(0, 2), 16);
    const g = parseInt(cleanHex.slice(2, 4), 16);
    const b = parseInt(cleanHex.slice(4, 6), 16);
    return `${r}, ${g}, ${b}`;
}

function isHabitArchived(habit) {
    if (!habit || typeof habit !== 'object') return false;
    const archivedAt = Number(habit.archivedAt);
    return Number.isFinite(archivedAt) && archivedAt > 0;
}

function getHabitById(id, includeArchived = false) {
    if (!id) return null;
    return habits.find(h => h.id === id && (includeArchived || !isHabitArchived(h))) || null;
}

function getActiveHabits() {
    return habits.filter(h => !isHabitArchived(h));
}

function removeHabitReminder(habitId) {
    if (!Array.isArray(reminders)) return;
    reminders = reminders.filter(rem => !(rem.itemType === 'habit' && rem.itemId === habitId));
}

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
                ensureHabitScrollBehavior();
                refreshHabitComposerVisibility();
            });
        } else {
            panel.classList.remove('hidden');
            updateHabitGoalSelect();
            toggleHabitInputs();
            syncHabitComposerMode();
            renderHabits();
            ensureHabitScrollBehavior();
            refreshHabitComposerVisibility();
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

    const allGoals = (typeof getLinkableGoalsFlat === 'function')
        ? getLinkableGoalsFlat({ includeSubgoals: true })
        : getAllGoalsFlat();
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
    refreshHabitComposerVisibility();
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
    refreshHabitComposerVisibility();
}

function editHabit(id) {
    const habit = getHabitById(id, true);
    if (!habit) return;
    if (isHabitArchived(habit)) {
        showNotification('Archived habits are read-only');
        return;
    }
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
    if (!habitId || !getHabitById(habitId, false)) return false;
    pendingHabitFocusId = habitId;
    setHabitFilter('all');
    toggleHabits(true);
    return true;
}

function setHabitColor(habitId, colorValue) {
    const habit = getHabitById(habitId, true);
    if (!habit || isHabitArchived(habit)) return;
    const normalized = normalizeHabitColor(colorValue);
    if (!normalized) return;
    habit.color = normalized;
    renderHabits();
    saveToStorage();
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
    if (habit.archivedAt === undefined || habit.archivedAt === null) habit.archivedAt = null;
    if (habit.archivedAt !== null) {
        const archivedTs = Number(habit.archivedAt);
        habit.archivedAt = Number.isFinite(archivedTs) && archivedTs > 0 ? archivedTs : null;
    }
    if (habit.activeTimerStart === undefined || habit.activeTimerStart === null) habit.activeTimerStart = null;
    if (habit.activeTimerStart !== null) habit.activeTimerStart = Number(habit.activeTimerStart);
    if (isHabitArchived(habit)) habit.activeTimerStart = null;
    if (!Array.isArray(habit.noteIds)) habit.noteIds = [];
    habit.color = getHabitColorHex(habit);

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
        const habit = getHabitById(editingHabitId, true);
        if (!habit) {
            resetHabitComposer(false);
            return;
        }
        if (isHabitArchived(habit)) {
            resetHabitComposer(false);
            showNotification('Archived habits cannot be edited');
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
            color: HABIT_DEFAULT_COLOR,
            history: {},
            activeTimerStart: null,
            archivedAt: null,
            created: Date.now(),
            noteIds: []
        });
        resetHabitComposer(false);
    }

    renderHabits();
    saveToStorage();
}

function deleteHabit(id) {
    const habit = getHabitById(id, true);
    if (!habit) return;
    if (confirm(`Permanently delete "${habit.title || 'this habit'}" and all of its history?`)) {
        removeHabitReminder(id);
        habits = habits.filter(h => h.id !== id);
        if (editingHabitId === id) resetHabitComposer(false);
        if (typeof renderPinnedWindow === 'function') renderPinnedWindow();
        if (typeof renderReminderStrip === 'function') renderReminderStrip();
        if (typeof renderRemindersModal === 'function') renderRemindersModal();
        renderHabits();
        saveToStorage();
    }
}

function archiveHabit(id) {
    const habit = getHabitById(id, false);
    if (!habit) return;
    if (!confirm(`Archive "${habit.title || 'this habit'}"? It will be hidden from the habits panel but kept in history as completed.`)) return;

    habit.archivedAt = Date.now();
    habit.activeTimerStart = null;
    habit.isPinned = false;
    removeHabitReminder(id);
    if (editingHabitId === id) resetHabitComposer(false);

    if (typeof renderPinnedWindow === 'function') renderPinnedWindow();
    if (typeof renderReminderStrip === 'function') renderReminderStrip();
    if (typeof renderRemindersModal === 'function') renderRemindersModal();
    renderHabits();
    saveToStorage();
    showNotification('Habit archived');
}

function toggleHabitDay(id) {
    const habit = getHabitById(id, false);
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
    const habit = getHabitById(id, false);
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
    const habit = getHabitById(id, false);
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
    const habit = getHabitById(id, false);
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
                    <div class="habit-controls">
                        <button class="habit-main-toggle ${metrics.isDone ? 'done' : ''}" onclick="toggleHabitDay('${habit.id}')">
                            ${metrics.isDone ? 'DONE' : 'MARK DONE'}
                        </button>
                        <div class="habit-tech-readout">VAL: <span>${metrics.current >= 1 ? '1 / 1' : '0 / 1'}</span></div>
                    </div>
                `;
    }

    if (habit.type === 'counter') {
        return `
                    <div class="habit-controls">
                        <button class="habit-btn-small" onclick="updateHabitCounter('${habit.id}', -1)">-</button>
                        <div class="habit-val-display">${Math.floor(metrics.current)} / ${Math.floor(metrics.target)}</div>
                        <button class="habit-btn-small" onclick="updateHabitCounter('${habit.id}', 1)">+</button>
                        <div class="habit-tech-readout">VAL: <span>${Math.floor(metrics.current)} / ${Math.floor(metrics.target)}</span></div>
                    </div>
                `;
    }

    const isRunning = !!habit.activeTimerStart;
    const currentMins = Math.floor(metrics.current / 60000);
    const targetMins = Math.floor(metrics.target / 60000);
    return `
                <div class="habit-controls">
                    <button class="habit-btn-small" onclick="updateHabitMinutes('${habit.id}', -5)">-5m</button>
                    <button class="habit-btn-small habit-play-btn ${isRunning ? 'active' : ''}" onclick="toggleHabitTimer('${habit.id}')">${isRunning ? 'STOP' : 'PLAY'}</button>
                    <button class="habit-btn-small" onclick="updateHabitMinutes('${habit.id}', 5)">+5m</button>
                    <div class="habit-tech-readout">VAL: <span>${currentMins}m / ${targetMins}m</span></div>
                </div>
            `;
}

function renderHabits() {
    try {
        const container = document.getElementById('habits-list-container');
        if (!container) return;
        container.innerHTML = '';

        const activeHabits = getActiveHabits();
        const prepared = activeHabits.map(habit => {
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
            container.innerHTML = habits.length > 0
                ? '<div style="text-align:center; color:#666; padding:20px;">No active habits. Archived habits are kept in history.</div>'
                : '<div style="text-align:center; color:#666; padding:20px;">No habits tracked yet.</div>';
            return;
        }
    
        if (filtered.length === 0) {
            container.innerHTML = '<div style="text-align:center; color:#666; padding:20px;">No habits in this filter.</div>';
            return;
        }
    
        filtered.forEach(item => {
            const h = item.habit;
            const metrics = item.metrics;
            const baseHabitColorHex = getHabitColorHex(h);
            const linkedGoalColorHex = getLinkedGoalColorHex(h);
            const usesLinkedGoalColor = !!linkedGoalColorHex;
            const habitColorHex = usesLinkedGoalColor ? linkedGoalColorHex : baseHabitColorHex;
            const habitColorRgb = getHabitColorRgb(h);
            const goalName = h.goalId ? getGoalTextById(h.goalId) : '';
            const goalStyle = h.goalId ? getGoalColorBoxInlineStyle(h.goalId) : '';
            const progressLabel = getHabitProgressLabel(h, metrics);
            const controlsHtml = getHabitCardControls(h, metrics);
    
            const el = document.createElement('div');
            el.className = `habit-item ${metrics.isDone ? 'done-today' : ''}`;
            el.dataset.habitId = h.id;
            el.style.setProperty('--habit-rgb', habitColorRgb);
            el.style.setProperty('--habit-accent', habitColorHex);
            el.innerHTML = `
                        <div class="habit-cad-header">
                            <div class="habit-card-top">
                                <div class="habit-title-wrap">
                                    <div class="habit-title">${h.title}</div>
                                    <div class="habit-progress-label">${progressLabel}</div>
                                </div>
                                <div class="habit-ratio-pill ${metrics.isDone ? 'done' : ''}">${metrics.percent}%</div>
                            </div>
                        </div>

                        <div class="habit-cad-body">
                            <div class="habit-progress-track">
                                <div class="habit-progress-fill ${metrics.isDone ? 'done' : ''}" style="width:${metrics.percent}%"></div>
                            </div>

                            <div class="habit-card-bottom">
                                <div class="habit-meta">
                                    <div class="habit-link-box">
                                        <span class="habit-link-label">LINK:</span>
                                        ${goalName ? `<span class="habit-goal-link" style="${goalStyle}" title="${goalName}">${goalName}</span>` : '<span class="habit-goal-link muted">NULL</span>'}
                                    </div>
                                    ${h.noteIds && h.noteIds.length > 0 ? `<span class="habit-note-chip" onclick="event.stopPropagation(); showHabitNotes('${h.id}')" title="View linked notes">📝 ${h.noteIds.length}</span>` : ''}
                                </div>
                                <div class="habit-actions">
                                    <input
                                        type="color"
                                        class="habit-color-picker"
                                        value="${habitColorHex}"
                                        title="${usesLinkedGoalColor ? 'Auto color from linked goal' : 'Card Color'}"
                                        ${usesLinkedGoalColor ? 'disabled' : ''}
                                        onclick="event.stopPropagation();"
                                        onchange="setHabitColor('${h.id}', this.value)">
                                    <button class="habit-icon-btn ${hasReminderForItem('habit', h.id) ? 'active-alert' : ''}" onclick="openRemindersModal('habit', '${h.id}')" title="Reminder">⏰</button>
                                    <button class="habit-icon-btn" onclick="editHabit('${h.id}')" title="Edit">✎</button>
                                    <button class="habit-icon-btn ${isPinned('habit', h.id) ? 'active' : ''}" onclick="togglePinItem('habit', '${h.id}'); renderHabits();" title="Pin">📌</button>
                                    <button class="habit-icon-btn" onclick="archiveHabit('${h.id}')" title="Archive">🗄</button>
                                    <button class="habit-icon-btn danger" onclick="deleteHabit('${h.id}')" title="Delete">✕</button>
                                </div>
                            </div>

                            <div class="habit-controls-row">
                                ${controlsHtml}
                            </div>
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
        refreshHabitComposerVisibility();
    } catch (error) {
        console.error("Error in renderHabits:", error);
        if(typeof showNotification === "function") showNotification("Render Error: Check console", "error");
    }
}
