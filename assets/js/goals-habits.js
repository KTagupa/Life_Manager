        // --- LIFE GOALS LOGIC ---
        function toggleGoals() {
            const panel = document.getElementById('goals-panel');
            const archivePanel = document.getElementById('archive-panel');
            const notesPanel = document.getElementById('notes-panel');
            const aiModal = document.getElementById('ai-modal'); // Use aiModal for consistency

            if (panel.classList.contains('hidden')) {
                panel.classList.remove('hidden');
                archivePanel.classList.add('hidden');
                notesPanel.classList.add('hidden');
                if (aiModal.classList.contains('visible')) { // Check if AI modal is open
                    closeAIModal(); // Close AI modal if open
                }
                renderGoals();
            } else {
                panel.classList.add('hidden');
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
            // Helper to recursively find all goal IDs (including sub-goals)
            const getAllGoalIds = (goalList, targetId) => {
                let result = [targetId];
                const findGoal = (list, id) => {
                    for (const goal of list) {
                        if (goal.id === id) {
                            // Add all children recursively
                            const addChildren = (g) => {
                                result.push(g.id);
                                if (g.children && g.children.length > 0) {
                                    g.children.forEach(addChildren);
                                }
                            };
                            addChildren(goal);
                            return true;
                        }
                        if (goal.children && goal.children.length > 0) {
                            if (findGoal(goal.children, id)) return true;
                        }
                    }
                    return false;
                };
                findGoal(goalList, targetId);
                return result;
            };

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

        function toggleHabits() {
            const panel = document.getElementById('habits-panel');
            const goalsPanel = document.getElementById('goals-panel');

            // Toggle visibility
            if (panel.classList.contains('hidden')) {
                panel.classList.remove('hidden');
                goalsPanel.classList.add('hidden'); // Close goals to avoid clutter
                document.getElementById('archive-panel').classList.add('hidden');
                document.getElementById('notes-panel').classList.add('hidden');
                renderHabits();
                updateHabitGoalSelect();
            } else {
                panel.classList.add('hidden');
            }
        }

        function updateHabitGoalSelect() {
            const select = document.getElementById('habit-goal-select');
            select.innerHTML = '<option value="">(Optional) Link to a Life Goal...</option>';

            // Flatten goals for the dropdown
            if (lifeGoals[currentGoalYear]) {
                const flatten = (list, depth = 0) => {
                    list.forEach(g => {
                        const opt = document.createElement('option');
                        opt.value = g.id;
                        opt.text = "- ".repeat(depth) + g.text;
                        select.appendChild(opt);
                        if (g.children) flatten(g.children, depth + 1);
                    });
                };
                flatten(lifeGoals[currentGoalYear]);
            }
        }

        function toggleHabitInputs() {
            const type = document.getElementById('habit-type-select').value;
            const targetInput = document.getElementById('habit-target-input');
            const unitLabel = document.getElementById('habit-unit-label');

            if (type === 'checkbox') {
                targetInput.style.display = 'none';
                unitLabel.style.display = 'none';
            } else if (type === 'counter') {
                targetInput.style.display = 'block';
                targetInput.placeholder = "Target (e.g. 5)";
                unitLabel.style.display = 'none';
            } else if (type === 'timer') {
                targetInput.style.display = 'block';
                targetInput.placeholder = "Mins (e.g. 30)";
                unitLabel.style.display = 'block';
            }
        }

        // Helper to get today's key YYYY-MM-DD
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
                start.setDate(start.getDate() - day); // Start of week (Sunday)
                start.setHours(0, 0, 0, 0);
                end.setDate(start.getDate() + 6);
                end.setHours(23, 59, 59, 999);
            } else if (frequency === 'monthly') {
                start.setDate(1);
                start.setHours(0, 0, 0, 0);
                end.setMonth(start.getMonth() + 1, 0);
                end.setHours(23, 59, 59, 999);
            } else { // Daily
                start.setHours(0, 0, 0, 0);
                end.setHours(23, 59, 59, 999);
            }
            return { start, end };
        }

        function getSumInPeriod(habit, bounds) {
            let sum = 0;
            // Iterate through history and sum values within the date range
            for (const [dateKey, value] of Object.entries(habit.history)) {
                const d = new Date(dateKey);
                if (d >= bounds.start && d <= bounds.end) {
                    sum += (typeof value === 'boolean') ? (value ? 1 : 0) : value;
                }
            }
            // Add current running timer if it's within this period
            if (habit.activeTimerStart && habit.type === 'timer') {
                const now = Date.now();
                if (now >= bounds.start.getTime() && now <= bounds.end.getTime()) {
                    sum += (now - habit.activeTimerStart);
                }
            }
            return sum;
        }

        function getHabitValue(habit, dateKey) {
            let val = habit.history[dateKey];
            // If undefined, return 0
            if (val === undefined) return 0;
            // If it's a boolean (legacy data), return 1 if true
            if (val === true) return 1;
            if (val === false) return 0;

            // If it's a timer and we are checking TODAY, add the active running time
            if (habit.type === 'timer' && dateKey === getHabitDateKey(0) && habit.activeTimerStart) {
                val += (Date.now() - habit.activeTimerStart);
            }
            return val;
        }

        function addHabit() {
            const input = document.getElementById('new-habit-input');
            const typeSelect = document.getElementById('habit-type-select');
            const targetInput = document.getElementById('habit-target-input');
            const goalSelect = document.getElementById('habit-goal-select');

            const title = input.value.trim();
            const type = typeSelect.value;
            let target = parseFloat(targetInput.value);

            // Validate target
            if (type !== 'checkbox' && (!target || target <= 0)) {
                alert("Please enter a valid target number.");
                return;
            }

            // For timers, convert minutes to milliseconds for storage
            if (type === 'timer') target = target * 60 * 1000;

            if (title) {
                habits.push({
                    id: 'habit_' + Date.now(),
                    title: title,
                    type: type, // 'checkbox', 'counter', 'timer'
                    frequency: document.getElementById('habit-frequency-select').value,
                    target: target || 1, // Default 1 for checkbox
                    goalId: goalSelect.value || null,
                    history: {},
                    activeTimerStart: null,
                    created: Date.now(),
                    noteIds: []
                });

                // Reset UI
                input.value = '';
                toggleHabitInputs(); // Reset visibility
                renderHabits();
                saveToStorage();
            }
        }

        function deleteHabit(id) {
            if (confirm("Delete this habit and its history?")) {
                discardReminderByItem('habit', id);
                habits = habits.filter(h => h.id !== id);
                renderHabits();
                saveToStorage();
            }
        }

        function toggleHabitDay(id) {
            const habit = habits.find(h => h.id === id);
            if (!habit) return;

            const key = getHabitDateKey(0);

            // Simple toggle logic for checkboxes
            if (habit.history[key]) {
                delete habit.history[key];
            } else {
                habit.history[key] = 1; // 1 means done for checkbox
            }

            renderHabits();
            saveToStorage();
        }

        // FOR COUNTERS
        function updateHabitCounter(id, change) {
            const habit = habits.find(h => h.id === id);
            if (!habit) return;

            const key = getHabitDateKey(0);
            let current = habit.history[key] || 0;

            // Handle legacy boolean if switching types
            if (current === true) current = 1;
            if (current === false) current = 0;

            let newVal = current + change;
            if (newVal < 0) newVal = 0;

            habit.history[key] = newVal;
            renderHabits();
            saveToStorage();
        }

        // FOR TIMERS
        function toggleHabitTimer(id) {
            const habit = habits.find(h => h.id === id);
            if (!habit) return;
            const key = getHabitDateKey(0);
            if (habit.activeTimerStart) {
                const now = Date.now();
                const duration = now - habit.activeTimerStart;
                habit.history[key] = (habit.history[key] || 0) + duration;

                // Track granular logs for accurate timeline rendering
                if (!habit.timeLogs) habit.timeLogs = [];
                habit.timeLogs.push({ start: habit.activeTimerStart, end: now, duration: duration });

                habit.activeTimerStart = null;
                playAudioFeedback('timer-stop'); // <--- SOUND
            } else {
                habit.activeTimerStart = Date.now();
                playAudioFeedback('timer-start'); // <--- SOUND
            }
            renderHabits();
            saveToStorage();
        }

        function calculateStreak(habit) {
            let streak = 0;
            const freq = habit.frequency || 'daily';
            let checkDate = new Date();

            for (let i = 0; i < 52; i++) { // Check up to 52 periods back
                const bounds = getPeriodBounds(freq, checkDate);
                const sum = getSumInPeriod(habit, bounds);
                const isMet = sum >= (habit.target || 1);

                if (isMet) {
                    streak++;
                } else {
                    // If checking the current period, it's okay if not finished yet
                    const now = new Date();
                    if (now >= bounds.start && now <= bounds.end) {
                        // Don't break yet, just check previous
                    } else {
                        break;
                    }
                }

                // Move checkDate to previous period
                if (freq === 'daily') checkDate.setDate(checkDate.getDate() - 1);
                else if (freq === 'weekly') checkDate.setDate(checkDate.getDate() - 7);
                else if (freq === 'monthly') checkDate.setMonth(checkDate.getMonth() - 1);
            }
            return streak;
        }

        function renderHabits() {
            const container = document.getElementById('habits-list-container');
            container.innerHTML = '';

            if (habits.length === 0) {
                container.innerHTML = '<div style="text-align:center; color:#666; padding:20px;">No habits tracked yet.</div>';
                return;
            }

            habits.forEach(h => {
                // --- 1. PERIOD CALCULATIONS (New Logic) ---
                const freq = h.frequency || 'daily';
                const bounds = getPeriodBounds(freq);
                const val = getSumInPeriod(h, bounds);
                const target = h.target || 1;

                // Ensure type exists for old habits
                if (!h.type) h.type = 'checkbox';

                const isDone = val >= target;
                const streak = calculateStreak(h);
                const percent = Math.min(100, (val / target) * 100);

                // --- 2. GENERATE DISPLAY LABELS ---
                let freqLabel = freq.charAt(0).toUpperCase() + freq.slice(1);
                let displayVal = "";

                if (h.type === 'timer') {
                    const minsVal = Math.floor(val / 60000);
                    const minsTarget = Math.floor(target / 60000);
                    displayVal = `${minsVal}m / ${minsTarget}m (${freqLabel})`;
                } else if (h.type === 'counter') {
                    displayVal = `${val} / ${target} (${freqLabel})`;
                } else {
                    // Checkboxes show purely status in the label area
                    displayVal = freqLabel;
                }

                // --- 3. GENERATE CONTROLS BASED ON TYPE ---
                let controlsHtml = '';
                if (h.type === 'checkbox') {
                    controlsHtml = `
                        <div class="habit-checkbox ${isDone ? 'checked' : ''}" onclick="toggleHabitDay('${h.id}')">
                            ${isDone ? '✓' : ''}
                        </div>`;
                }
                else if (h.type === 'counter') {
                    controlsHtml = `
                        <div class="habit-controls">
                            <button class="habit-btn-small" onclick="updateHabitCounter('${h.id}', -1)">-</button>
                            <div class="habit-val-display" style="${isDone ? 'color:var(--ready-color); font-weight:bold;' : ''}">${displayVal}</div>
                            <button class="habit-btn-small" onclick="updateHabitCounter('${h.id}', 1)">+</button>
                        </div>`;
                }
                else if (h.type === 'timer') {
                    const isRunning = !!h.activeTimerStart;
                    controlsHtml = `
                        <div class="habit-controls">
                            <button class="habit-btn-small" style="${isRunning ? 'border-color:var(--ready-color); color:var(--ready-color);' : ''}" onclick="toggleHabitTimer('${h.id}')">
                                ${isRunning ? '⏸' : '▶'}
                            </button>
                            <div class="habit-val-display" style="${isDone ? 'color:var(--ready-color); font-weight:bold;' : ''}">${displayVal}</div>
                        </div>`;
                }

                // --- 4. RESOLVE GOAL NAME ---
                let goalName = '';
                if (h.goalId && lifeGoals[currentGoalYear]) {
                    const findGoal = (list) => {
                        for (let g of list) {
                            if (g.id === h.goalId) return g.text;
                            if (g.children) {
                                const f = findGoal(g.children);
                                if (f) return f;
                            }
                        }
                        return null;
                    };
                    const name = findGoal(lifeGoals[currentGoalYear]);
                    if (name) goalName = '🎯 ' + name;
                }

                // --- 5. RENDER THE HTML ELEMENT ---
                const el = document.createElement('div');
                el.className = `habit-item ${isDone ? 'done-today' : ''}`;
                el.innerHTML = `
                    ${h.type === 'checkbox' ? controlsHtml : ''}
                    <div class="habit-details">
                        <div style="display:flex; justify-content:space-between; align-items:center">
                            <div class="habit-title">${h.title}</div>
                            ${h.type !== 'checkbox' ? controlsHtml : ''}
                        </div>
                        
                        ${h.type !== 'checkbox' ? `
                            <div class="habit-progress-bar-bg">
                                <div class="habit-progress-fill ${isDone ? 'done' : ''}" style="width: ${percent}%"></div>
                            </div>
                        ` : ''}
        
                        <div class="habit-meta">
                            <span class="habit-streak">🔥 ${streak}</span>
                            <span class="habit-goal-link">${goalName}</span>
                            ${h.noteIds && h.noteIds.length > 0 ? `<span style="color:#3b82f6; font-size:10px; cursor:pointer;" onclick="event.stopPropagation(); showHabitNotes('${h.id}')" title="View linked notes">📝 ${h.noteIds.length}</span>` : ''}
                        </div>
                    </div>
                    <div class="habit-actions">
                        <button class="btn ${hasReminderForItem('habit', h.id) ? '' : ''}" style="padding: 2px 6px; font-size:10px; ${hasReminderForItem('habit', h.id) ? 'border-color:var(--critical-path); color:var(--critical-path);' : ''}" onclick="openRemindersModal('habit', '${h.id}')">⏰</button>
                        <button class="btn" style="padding: 2px 6px; font-size:10px; ${isPinned('habit', h.id) ? 'border-color:var(--accent); color:var(--accent);' : ''}" onclick="togglePinItem('habit', '${h.id}'); renderHabits();">📌</button>
                        <button class="btn btn-danger" style="padding: 2px 6px; font-size:10px;" onclick="deleteHabit('${h.id}')">✕</button>
                    </div>
                `;
                container.appendChild(el);
            });
        }
