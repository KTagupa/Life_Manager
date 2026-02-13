        // --- ARCHIVE LOGIC ---
        function checkAutoArchive() {
            const now = Date.now();
            let changed = false;
            const activeNodes = [];
            nodes.forEach(n => {
                if (n.completed && n.completedDate && (now - n.completedDate > ARCHIVE_THRESHOLD_MS)) {
                    archivedNodes.push(n);
                    changed = true;
                } else {
                    activeNodes.push(n);
                }
            });

            if (changed) {
                nodes = activeNodes;
                saveToStorage();
                render();
                if (!document.getElementById('archive-panel').classList.contains('hidden')) {
                    renderArchiveList();
                }
                if (selectedNodeId && !nodes.find(n => n.id === selectedNodeId) && !archivedNodes.find(n => n.id === selectedNodeId)) {
                    deselectNode();
                }
            }
        }

        function checkExpiredTasks() {
            const now = Date.now();
            const today = new Date();
            today.setHours(23, 59, 59, 999); // End of today

            let expiredCount = 0;
            const activeNodes = [];

            nodes.forEach(n => {
                // Check if task should expire
                if (!n.completed && n.expiresOnDue && n.dueDate) {
                    const dueDate = new Date(n.dueDate);
                    dueDate.setHours(23, 59, 59, 999); // End of due date

                    if (now > dueDate.getTime()) {
                        // Task has expired - mark as completed and archive
                        n.completed = true;
                        n.completedDate = now;
                        archivedNodes.push(n);
                        expiredCount++;

                        // Remove from agenda if scheduled
                        agenda = agenda.filter(slot => slot.taskId !== n.id);
                    } else {
                        activeNodes.push(n);
                    }
                } else {
                    activeNodes.push(n);
                }
            });

            if (expiredCount > 0) {
                nodes = activeNodes;

                // Clean up dependencies referencing expired tasks
                nodes.forEach(n => {
                    n.dependencies = n.dependencies.filter(d => {
                        return nodes.some(x => x.id === d.id) || archivedNodes.some(x => x.id === d.id && !x.completed);
                    });
                });

                saveToStorage();
                updateCalculations();
                render();

                if (!document.getElementById('archive-panel').classList.contains('hidden')) {
                    renderArchiveList();
                }

                if (selectedNodeId && !nodes.find(n => n.id === selectedNodeId)) {
                    deselectNode();
                }

                showNotification(`⏰ ${expiredCount} expired task${expiredCount > 1 ? 's' : ''} auto-archived`);
            }
        }

        function toggleArchivePanel(forceOpen = null) {
            const archivePanel = document.getElementById('archive-panel');
            const aiModal = document.getElementById('ai-modal'); // Use aiModal for consistency

            const shouldOpen = forceOpen === true || (forceOpen === null && archivePanel.classList.contains('hidden'));
            if (shouldOpen) {
                if (typeof openRightDockPanel === 'function') {
                    openRightDockPanel('archive-panel', () => {
                        renderArchiveList();
                    });
                } else {
                    archivePanel.classList.remove('hidden');
                    renderArchiveList();
                }
                if (aiModal.classList.contains('visible')) { // Check if AI modal is open
                    closeAIModal(); // Close AI modal if open
                }
            } else {
                if (typeof closeRightDockPanel === 'function') closeRightDockPanel('archive-panel');
                else archivePanel.classList.add('hidden');
            }
        }

        function renderArchiveList() {
            const container = document.getElementById('archive-list-container');
            container.innerHTML = '';
            const sorted = [...archivedNodes].sort((a, b) => (b.completedDate || 0) - (a.completedDate || 0));

            if (sorted.length === 0) {
                container.innerHTML = '<div style="text-align:center; color:#666; padding:20px;">No archived tasks.</div>';
                return;
            }

            sorted.forEach(node => {
                const el = document.createElement('div');
                el.className = 'archive-item';
                if (selectedNodeId === node.id) el.classList.add('selected');
                const dateStr = node.completedDate ? new Date(node.completedDate).toLocaleDateString() : 'Unknown';
                el.innerHTML = `<div><div>${node.title}</div><span class="archive-date">Completed: ${dateStr}</span></div><div class="archive-info">✅</div>`;
                el.onclick = () => selectNode(node.id);
                container.appendChild(el);
            });
        }


        // --- CHECK-IN LOGIC ---
        function handleCheckIn(e, nodeId) {
            if (e) e.stopPropagation();
            const node = (nodes.find(n => n.id === nodeId) || archivedNodes.find(n => n.id === nodeId));
            if (!node) return;

            if (!node.checkIns) node.checkIns = [];
            node.checkIns.push(Date.now());

            // Glow effect
            if (e && e.target) {
                const btn = e.target.closest('.node-checkin-btn');
                if (btn) {
                    btn.classList.add('checkin-glow');
                    setTimeout(() => btn.classList.remove('checkin-glow'), 500);
                }
            }

            showNotification(`Checked in for ${node.title} for today`);
            playAudioFeedback('timer-start'); // Subtle feedback

            saveToStorage();
            render();
            if (selectedNodeId === nodeId) updateInspector();
        }

        function renderCheckInGrid(node) {
            if (!node.checkIns) node.checkIns = [];

            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const todayTimestamp = today.getTime();

            let gridHtml = `<div class="checkin-grid-container" onwheel="this.scrollLeft += event.deltaY">`;

            // Generate 30 days of boxes
            for (let i = 29; i >= 0; i--) {
                const date = new Date(today);
                date.setDate(today.getDate() - i);
                const dateTimestamp = date.getTime();
                const dayNum = date.getDate();

                const isChecked = node.checkIns.some(ts => {
                    const checkDate = new Date(ts);
                    checkDate.setHours(0, 0, 0, 0);
                    return checkDate.getTime() === dateTimestamp;
                });

                const titleTip = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

                gridHtml += `
                    <div class="checkin-box ${isChecked ? 'checked' : ''}" 
                         title="${titleTip}"
                         onclick="handleCheckIn(null, '${node.id}')">
                        <span class="day-num">${dayNum}</span>
                        <div class="day-indicator"></div>
                    </div>
                `;
            }
            gridHtml += `</div>`;

            // Filter today's check-ins
            const todayCheckIns = node.checkIns.filter(ts => {
                const checkDate = new Date(ts);
                checkDate.setHours(0, 0, 0, 0);
                return checkDate.getTime() === todayTimestamp;
            }).sort((a, b) => a - b);

            if (todayCheckIns.length > 0) {
                gridHtml += `<div class="today-checkins-list">`;
                todayCheckIns.forEach(ts => {
                    const timeStr = new Date(ts).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
                    gridHtml += `<div class="today-checkin-tag">${timeStr}</div>`;
                });
                gridHtml += `</div>`;
            }

            return gridHtml;
        }

        // --- INSPECTOR Logic ---
        function updateInspector() {
            const panel = document.getElementById('insp-content');
            if (!selectedNodeId) return;

            let node = getSelectedNode();
            if (!node) return;
            const isArchived = archivedNodes.some(n => n.id === node.id);

            const isRunning = !!node.activeTimerStart;
            const linkedNotes = notes.filter(n => n.taskIds && n.taskIds.includes(node.id));
            const isUrgent = node.isManualUrgent;

            // --- HEADER ---
            const headerHtml = `
                <div style="padding: 20px 20px 16px 20px; border-bottom: 1px solid #1e293b;">
                    <div style="display:flex; justify-content:space-between; align-items:start; margin-bottom:16px;">
                        <div style="display:flex; align-items:center; gap:8px;">
                            <div class="inspector-badge">
                                # TASK INSPECTOR
                            </div>
                            <button onclick="closeInspector()" style="background:transparent; border:none; color:#64748b; cursor:pointer; font-size:18px; line-height:1;">✕</button>
                            <button onclick="decomposeTask()" style="background:transparent; border:none; color:#8b5cf6; cursor:pointer; font-size:16px; line-height:1; padding:0; margin-left:8px;" title="Decompose with AI">✨</button>
                        </div>
                        
                        <div class="urgency-switch">
                            <div class="urgency-option ${!isUrgent ? 'active standard-active' : ''}" onclick="setUrgency(false)">Standard</div>
                            <div class="urgency-option ${isUrgent ? 'active urgent-active' : ''}" onclick="setUrgency(true)">Urgent</div>
                        </div>
                    </div>

                    <div class="inspector-title-wrapper">
                        <input type="text" class="inspector-title-input" value="${node.title}" placeholder="Task Title..." oninput="updateNodeField('title', this.value)">
                    </div>
                    ${renderCheckInGrid(node)}
                </div>`;

            // --- CONTENT FIELDS ---
            // 1. Duration & Status Row
            const durationStatusHtml = `
                <div style="display:flex; gap:12px; margin-bottom:16px;">
                    <div style="flex:1;">
                        <label class="field-label">⏱ DURATION</label>
                        <div class="field-box">
                            <input type="number" value="${node.duration}" min="1" 
                                style="background:transparent; border:none; color:white; width:60px; font-weight:600; font-family:inherit; outline:none;" 
                                onchange="updateNodeField('duration', parseInt(this.value))">
                            <span style="font-size:11px; color:#64748b;">Days</span>
                        </div>
                    </div>
                    <div style="flex:1;">
                        <label class="field-label">✓ STATUS</label>
                        <div class="field-box ${node.completed ? 'active' : ''}" style="cursor:pointer;" onclick="toggleCompletion()">
                            <span style="font-weight:600; font-size:13px; color:${node.completed ? '#10b981' : '#e2e8f0'}">${node.completed ? 'Completed' : 'Active'}</span>
                            <span style="font-size:18px;">${node.completed ? '✓' : '○'}</span>
                        </div>
                    </div>
                </div>`;

            // 2. Due Date
            const dueDateHtml = `
                <div style="margin-bottom:16px;">
                    <label class="field-label">📅 DUE DATE</label>
                    <div class="field-box" style="padding: 8px 12px;">
                        <input type="date" value="${node.dueDate || ''}" 
                            style="background:transparent; border:none; color:white; width:100%; font-family:inherit; font-size:13px; outline:none;" 
                            onchange="updateNodeField('dueDate', this.value)">
                    </div>
                    <div style="display:flex; align-items:center; gap:8px; margin-top:8px; padding:8px; background:rgba(239,68,68,0.1); border-radius:6px;">
                        <input type="checkbox" id="expires-checkbox" ${node.expiresOnDue ? 'checked' : ''} 
                            onchange="updateNodeField('expiresOnDue', this.checked)" 
                            style="width:16px; height:16px; cursor:pointer;">
                        <label for="expires-checkbox" style="font-size:11px; color:#ef4444; cursor:pointer; user-select:none;">
                            ⚠️ Auto-archive if not completed by due date
                        </label>
                    </div>
                </div>`;

            const taskReminder = getReminderForItem('task', node.id);
            const reminderHtml = taskReminder ? `
                <div style="margin-bottom:16px;">
                    <label class="field-label">⏰ REMINDER</label>
                    <div style="display:flex; gap:8px; margin-bottom:8px;">
                        <div class="field-box" style="padding: 8px 12px; flex:1;">
                            <input type="date" value="${taskReminder.date || ''}" 
                                style="background:transparent; border:none; color:white; width:100%; font-family:inherit; font-size:13px; outline:none;" 
                                onchange="updateReminderFieldByItem('task', '${node.id}', 'date', this.value)">
                        </div>
                        <div class="field-box" style="padding: 8px 12px; width:120px;">
                            <input type="time" value="${getReminderEffectiveTime(taskReminder)}" ${taskReminder.allDay ? 'disabled' : ''}
                                style="background:transparent; border:none; color:white; width:100%; font-family:inherit; font-size:13px; outline:none;" 
                                onchange="updateReminderFieldByItem('task', '${node.id}', 'time', this.value)">
                        </div>
                    </div>
                    <div style="display:flex; justify-content:space-between; align-items:center; gap:8px;">
                        <label style="font-size:11px; color:#cbd5e1; display:flex; align-items:center; gap:6px; cursor:pointer;">
                            <input type="checkbox" ${taskReminder.allDay ? 'checked' : ''} onchange="toggleReminderAllDayByItem('task', '${node.id}', this.checked)">
                            All day (6:25 AM)
                        </label>
                        <div style="display:flex; gap:8px;">
                            <button class="add-subtask-btn" style="color:#f59e0b;" onclick="openRemindersModal('task', '${node.id}')">Manage</button>
                            <button class="add-subtask-btn" style="color:#ef4444;" onclick="discardReminder('${taskReminder.id}'); updateInspector();">Discard</button>
                        </div>
                    </div>
                </div>` : `
                <div style="margin-bottom:16px;">
                    <label class="field-label">⏰ REMINDER</label>
                    <div class="linked-note-item" style="border-style:dashed; justify-content:space-between; color:#94a3b8;">
                        <span style="font-size:12px;">No reminder set</span>
                        <button class="add-subtask-btn" style="color:#f59e0b;" onclick="openRemindersModal('task', '${node.id}')">+ ADD</button>
                    </div>
                </div>`;

            // 3. External Link
            const externalLinkHtml = `
                <div style="margin-bottom:16px;">
                    <label class="field-label">🔗 EXTERNAL LINK</label>
                    <div style="display:flex; gap:8px;">
                        <div class="field-box" style="padding: 8px 12px; flex:1;">
                            <input type="text" value="${node.externalLink || ''}" 
                                placeholder="https://..."
                                style="background:transparent; border:none; color:white; width:100%; font-family:inherit; font-size:13px; outline:none;" 
                                onchange="updateNodeField('externalLink', this.value)">
                        </div>
                        ${node.externalLink ? `
                        <a href="${node.externalLink}" target="_blank" class="field-box" style="padding: 0; width:36px; height:36px; display:flex; align-items:center; justify-content:center; text-decoration:none; color:#3b82f6;">
                            ↗
                        </a>` : ''}
                    </div>
                </div>`;

            // 4. Subtasks
            const subtasksHtml = `
                <div style="margin-bottom:16px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                        <label class="field-label">SUBTASKS</label>
                        <button class="add-subtask-btn" onclick="addSubtask()">+ ADD SUBTASK</button>
                    </div>
                    
                    <div class="subtask-list">
                        ${node.subtasks.map((st, idx) => `
                        <div class="subtask-row">
                            <div class="subtask-check ${st.done ? 'checked' : ''}" onclick="toggleSubtask(${idx})">
                                ${st.done ? '✓' : ''}
                            </div>
                            <input type="text" class="st-input ${st.done ? 'done' : ''}" value="${st.text}" 
                                onchange="updateSubtaskText(${idx}, this.value)">
                            <button onclick="promoteSubtaskToNode(${idx})" style="background:transparent; border:none; color:#10b981; cursor:pointer; font-size:14px;" title="Promote to Dependency Task">⬆</button>
                            <button onclick="removeSubtask(${idx})" style="background:transparent; border:none; color:#475569; cursor:pointer; font-size:14px;" title="Remove Subtask">✕</button>
                        </div>
                        `).join('')}
                        ${node.subtasks.length === 0 ? '<div style="font-size:11px; color:#475569; padding:12px; text-align:center;">No subtasks</div>' : ''}
                    </div>
                </div>`;

            // 5. Linked Notes
            const linkedNotesHtml = `
                <div style="margin-bottom:16px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                        <label class="field-label">LINKED NOTES</label>
                        <div style="display:flex; gap:4px;">
                            <button class="add-subtask-btn" style="color:#3b82f6;" onclick="createNewNote('${node.id}')">+ NEW</button>
                            <button class="add-subtask-btn" style="color:#8b5cf6;" onclick="document.getElementById('note-link-select-wrap').style.display='block';">+ LINK</button>
                        </div>
                    </div>
                    
                    <div id="note-link-select-wrap" style="display:none; margin-bottom:8px;">
                        <select style="width:100%; padding:8px; background:#0f172a; border:1px solid #334155; color:white; border-radius:6px; outline:none; font-size:12px;" 
                            onchange="linkNoteToTask(this.value, '${node.id}'); this.parentElement.style.display='none'; this.value='';">
                            <option value="">Select Note...</option>
                            ${notes.filter(n => !n.taskIds || !n.taskIds.includes(node.id)).sort((a, b) => (a.title || '').localeCompare(b.title || '')).map(n => `<option value='${n.id}'>${n.title || 'Untitled Note'}</option>`).join('')}
                        </select>
                    </div>
                    
                    <div style="display:flex; flex-direction:column; gap:8px;">
                        ${linkedNotes.map(n => `
                            <div class="linked-note-item" onclick="openNoteEditor('${n.id}')">
                                <div style="width:28px; height:28px; background:rgba(59,130,246,0.1); border-radius:6px; display:flex; align-items:center; justify-content:center; flex-shrink:0;">
                                    📄
                                </div>
                                <div style="flex-grow:1; overflow:hidden;">
                                    <div style="font-size:13px; font-weight:600; color:#e2e8f0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                                        ${n.title || 'Untitled Note'}
                                    </div>
                                    <div style="font-size:10px; color:#64748b;">${new Date(n.timestamp || Date.now()).toLocaleDateString()}</div>
                                </div>
                                <span style="color:#475569;">›</span>
                            </div>
                        `).join('')}
                        ${linkedNotes.length === 0 ? `
                        <div class="linked-note-item" style="border-style:dashed; justify-content:center; color:#475569; cursor:pointer;" onclick="createNewNote('${node.id}')">
                             <span style="font-size:12px;">+ Create Project Document</span>
                        </div>` : ''}
                    </div>
                </div>`;

            // 6. Dependencies
            const dependenciesHtml = `
                <div style="margin-bottom:16px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                        <label class="field-label">DEPENDENCIES</label>
                        <button class="add-subtask-btn" style="color:#10b981;" onclick="document.getElementById('dep-select').style.display='block';">+ ADD DEPENDENCY</button>
                    </div>
                    
                     <div style="display:none; margin-bottom:8px;" id="dep-select">
                        <select style="width:100%; padding:8px; background:#0f172a; border:1px solid #334155; color:white; border-radius:6px; outline:none; font-size:12px;" 
                            onchange="addDependency(this.value); this.style.display='none'; this.value='';">
                            <option value="">Select Task...</option>
                            ${nodes.filter(n => n.id !== node.id && !node.dependencies.some(d => d.id === n.id)).sort((a, b) => a.title.localeCompare(b.title)).map(n => `<option value='${n.id}'>${n.title}</option>`).join('')}
                        </select>
                    </div>

                    <div style="display:flex; flex-direction:column; gap:8px;">
                        ${node.dependencies.map(d => {
                const p = nodes.find(x => x.id === d.id) || archivedNodes.find(x => x.id === d.id);
                if (!p) return '';
                return `
                            <div class="linked-note-item" style="padding:10px 12px;">
                                <div style="width:6px; height:6px; border-radius:50%; background:${d.type === 'hard' ? '#ef4444' : '#f59e0b'}; margin-right:8px; flex-shrink:0;"></div>
                                <span style="font-size:12px; color:#cbd5e1; flex-grow:1;">${p.title}</span>
                                <span style="font-size:10px; color:#64748b; cursor:pointer; margin-right:8px; padding:2px 6px; background:#1e293b; border-radius:4px;" onclick="toggleDepType('${d.id}')">${d.type}</span>
                                <span style="cursor:pointer; color:#ef4444; font-size:14px;" onclick="removeDependency('${d.id}')">✕</span>
                            </div>`;
            }).join('')}
                        
                         ${node.dependencies.length === 0 ?
                    `<div style="text-align:center; padding:12px; border:1px dashed #334155; border-radius:8px; color:#475569; font-size:11px;">
                            No blockers linked yet.
                          </div>` : ''}
                    </div>
                </div>`;

            // 7. Linked Goals
            const flattenGoals = (goalList, level = 0) => {
                let result = [];
                goalList.forEach(goal => {
                    result.push({ goal: goal, level: level });
                    if (goal.children && goal.children.length > 0) {
                        result = result.concat(flattenGoals(goal.children, level + 1));
                    }
                });
                return result;
            };
            const allGoals = lifeGoals[currentGoalYear] ? flattenGoals(lifeGoals[currentGoalYear]) : [];
            const linkedGoalIds = node.goalIds || [];
            const linkedGoalsHtml = `
                <div style="margin-bottom:16px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                        <label class="field-label">🎯 LINKED GOALS</label>
                        <button class="add-subtask-btn" style="color:#f59e0b;" onclick="document.getElementById('goal-link-select-wrap').style.display='block';">+ LINK GOAL</button>
                    </div>
                    
                    <div id="goal-link-select-wrap" style="display:none; margin-bottom:8px;">
                        <select style="width:100%; padding:8px; background:#0f172a; border:1px solid #334155; color:white; border-radius:6px; outline:none; font-size:12px;" 
                            onchange="linkTaskToGoal('${node.id}', this.value, null); this.parentElement.style.display='none'; this.value='';">
                            <option value="">Select Goal...</option>
                            ${allGoals.filter(g => !linkedGoalIds.includes(g.goal.id)).map(g => {
                const indent = '&nbsp;'.repeat(g.level * 4);
                return `<option value='${g.goal.id}'>${indent}${g.goal.text}</option>`;
            }).join('')}
                        </select>
                    </div>

                    <div style="display:flex; flex-direction:column; gap:8px;">
                        ${linkedGoalIds.map(goalId => {
                const goalItem = allGoals.find(g => g.goal.id === goalId);
                if (!goalItem) return '';
                const indent = '&nbsp;'.repeat(goalItem.level * 4);
                const goalPath = getGoalPath(goalItem.goal.id);
                return `
                    <div class="linked-note-item" style="padding:10px 12px;">
                        <div style="flex-grow:1;">
                            <span style="font-size:12px; color:#cbd5e1;">${indent}🎯 ${goalItem.goal.text}</span>
                            ${goalPath ? `<div style="font-size:9px; color:#64748b; margin-top:2px;">${goalPath}</div>` : ''}
                        </div>
                        <span style="cursor:pointer; color:#ef4444; font-size:14px;" onclick="unlinkTaskFromGoal('${node.id}', '${goalId}')">✕</span>
                    </div>`;
            }).join('')}
                        
                        ${linkedGoalIds.length === 0 ?
                    `<div style="text-align:center; padding:12px; border:1px dashed #334155; border-radius:8px; color:#475569; font-size:11px;">
                            No goals linked yet.
                          </div>` : ''}
                    </div>
                </div>`;

            // --- FOOTER ---
            const footerHtml = `
                <div style="padding: 16px 20px; background: #020617; border-top: 1px solid #1e293b; display: flex; align-items: center; justify-content: space-between; gap:12px;">
                    <div style="display:flex; gap:8px;">
                        <button class="footer-icon-btn ${isPinned('task', node.id) ? 'active' : ''}" onclick="togglePinItem('task', '${node.id}')" title="${isPinned('task', node.id) ? 'Unpin Task' : 'Pin Task'}">
                            📌
                        </button>
                        <button class="footer-icon-btn" onclick="deleteSelectedNode()" title="Delete Task">
                            🗑
                        </button>
                        <button class="footer-icon-btn" onclick="demoteToInbox()" title="Move to Inbox">
                            📥
                        </button>
                        <button class="footer-icon-btn" onclick="document.getElementById('parent-picker').style.display='block';" title="Convert to Subtask of...">
                            📎
                        </button>
                    </div>

                    <button class="session-btn ${isUrgent ? '' : 'standard'}" onclick="toggleTimer()" style="flex:1;">
                        ${isRunning ? '⏸' : '▶'} ${isRunning ? 'Stop Session' : 'Start Session'}
                    </button>
                </div>
                <div id="parent-picker" style="display:none; position:absolute; bottom:60px; left:20px; right:20px; background:#1e293b; border:1px solid #334155; border-radius:8px; padding:12px; z-index:100; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.5);">
                    <div style="font-size:11px; color:#94a3b8; margin-bottom:8px; display:flex; justify-content:space-between; align-items:center;">
                        MOVE TO PARENT AS SUBTASK
                        <span style="cursor:pointer;" onclick="this.parentElement.parentElement.style.display='none'">✕</span>
                    </div>
                    <select style="width:100%; padding:8px; background:#0f172a; border:1px solid #334155; color:white; border-radius:6px; outline:none; font-size:12px;" 
                        onchange="demoteNodeToSubtask(this.value); this.parentElement.style.display='none'; this.value='';">
                        <option value="">Select Parent Task...</option>
                        ${nodes.filter(n => n.id !== node.id).sort((a, b) => a.title.localeCompare(b.title)).map(n => `<option value='${n.id}'>${n.title}</option>`).join('')}
                    </select>
                </div>`;

            // --- ASSEMBLE ---
            panel.innerHTML = `
                ${headerHtml}
                <div style="padding: 16px 20px; overflow-y: auto; flex-grow:1;">
                    ${durationStatusHtml}
                    ${dueDateHtml}
                    ${reminderHtml}
                    ${externalLinkHtml}
                    ${subtasksHtml}
                    ${linkedNotesHtml}
                    ${dependenciesHtml}
                    ${linkedGoalsHtml}
                </div>
                ${footerHtml}
            `;
        }

        function setUrgency(urgent) {
            const node = nodes.find(n => n.id === selectedNodeId);
            if (node) {
                if (urgent) {
                    node.isManualUrgent = true;
                    node.isManualNotUrgent = false;
                } else {
                    node.isManualUrgent = false;
                    node.isManualNotUrgent = false;
                }
                updateCalculations();
                render();
                updateInspector();
                saveToStorage();
            }
        }

        function updateNodeField(field, value) {
            let node = getSelectedNode();
            if (node) {
                node[field] = value;
                const today = new Date(); today.setHours(0, 0, 0, 0);
                if (node.syncDurationDate) {
                    if (field === 'duration') { const days = parseInt(value); if (!isNaN(days) && days > 0) { const newDate = new Date(today); newDate.setDate(today.getDate() + days); const yyyy = newDate.getFullYear(); const mm = String(newDate.getMonth() + 1).padStart(2, '0'); const dd = String(newDate.getDate()).padStart(2, '0'); node.dueDate = `${yyyy}-${mm}-${dd}`; const dateInput = document.querySelector('input[type="date"]'); if (dateInput) dateInput.value = node.dueDate; } }
                    else if (field === 'dueDate') { if (value) { const due = new Date(value); const diffTime = due - today; let diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); if (diffDays < 1) diffDays = 1; node.duration = diffDays; const durInput = document.querySelector('input[type="number"]'); if (durInput) durInput.value = diffDays; } }
                }
                if (field === 'duration' || field === 'dueDate' || field === 'syncDurationDate') updateCalculations();
                render(); saveToStorage();
            }
        }

        function toggleCompletion() {
            let node = nodes.find(n => n.id === selectedNodeId);
            let inArchive = false;
            if (!node) { node = archivedNodes.find(n => n.id === selectedNodeId); inArchive = true; }
            if (node) {
                node.completed = !node.completed;
                if (node.completed) { node.completedDate = Date.now(); } else {
                    node.completedDate = null;
                    if (inArchive) {
                        archivedNodes = archivedNodes.filter(n => n.id !== node.id);
                        nodes.push(node);
                        renderArchiveList();
                    }
                }
                updateCalculations();
                render();
                updateInspector();
                saveToStorage();
            }
        }

        function toggleUrgency() { const node = nodes.find(n => n.id === selectedNodeId); if (node) { node.isManualUrgent = !node.isManualUrgent; if (node.isManualUrgent) node.isManualNotUrgent = false; updateCalculations(); render(); updateInspector(); saveToStorage(); } }
        function toggleNotUrgent() { const node = nodes.find(n => n.id === selectedNodeId); if (node) { node.isManualNotUrgent = !node.isManualNotUrgent; if (node.isManualNotUrgent) node.isManualUrgent = false; updateCalculations(); render(); updateInspector(); saveToStorage(); } }
        function addDependency(parentId) { if (!parentId) return; const node = nodes.find(n => n.id === selectedNodeId); if (node) { node.dependencies.push({ id: parentId, type: 'hard' }); updateCalculations(); render(); updateInspector(); saveToStorage(); } }
        function removeDependency(parentId) { const node = nodes.find(n => n.id === selectedNodeId); if (node) { node.dependencies = node.dependencies.filter(d => d.id !== parentId); updateCalculations(); render(); updateInspector(); saveToStorage(); } }
        function toggleDepType(parentId) { const node = nodes.find(n => n.id === selectedNodeId); if (node) { const dep = node.dependencies.find(d => d.id === parentId); dep.type = dep.type === 'hard' ? 'soft' : 'hard'; updateCalculations(); render(); updateInspector(); saveToStorage(); } }
        function addSubtask() { const node = getSelectedNode(); if (node) { node.subtasks.push({ text: 'New Step', done: false }); render(); updateInspector(); saveToStorage(); } }
        function toggleSubtask(index) {
            const node = getSelectedNode();
            if (node) {
                node.subtasks[index].done = !node.subtasks[index].done;
                render();
                updateInspector();
                saveToStorage();

                // Refresh any open expanded subtask box
                const nodeEl = document.querySelector(`.node[data-id="${selectedNodeId}"]`);
                if (nodeEl) {
                    const box = nodeEl.querySelector('.subtasks-expanded-box.visible');
                    if (box) {
                        box.remove();
                        // Recreate it
                        setTimeout(() => {
                            const event = new Event('click');
                            toggleSubtaskExpansion(selectedNodeId, event);
                        }, 10);
                    }
                }
            }
        }

        function toggleSubtaskExpansion(nodeId, event) {
            if (event) {
                event.stopPropagation();
                event.preventDefault();
            }

            // Find the node element
            const nodeEl = document.querySelector(`.node[data-id="${nodeId}"]`);
            if (!nodeEl) return;

            // Check if box already exists
            let box = nodeEl.querySelector('.subtasks-expanded-box');

            if (box) {
                // Toggle visibility
                box.classList.toggle('visible');
                if (!box.classList.contains('visible')) {
                    box.remove();
                }
            } else {
                // Create new box
                const node = nodes.find(n => n.id === nodeId) || archivedNodes.find(n => n.id === nodeId);
                if (!node || node.subtasks.length === 0) return;

                box = document.createElement('div');
                box.className = 'subtasks-expanded-box visible';

                node.subtasks.forEach((st, idx) => {
                    const item = document.createElement('div');
                    item.className = 'expanded-subtask-item';

                    const checkbox = document.createElement('div');
                    checkbox.className = `expanded-subtask-check ${st.done ? 'checked' : ''}`;
                    checkbox.innerHTML = st.done ? '✓' : '';
                    checkbox.onclick = (e) => {
                        e.stopPropagation();
                        // Important: selectedNodeId must be set for toggleSubtask to work as written
                        // Since toggleSubtaskExpansion is called via onclick, we can assume this node is being interacted with.
                        // However, toggleSubtask uses selectedNodeId. Let's make sure it's set or passed.
                        // Actually, the user's provided code for toggleSubtask uses selectedNodeId.
                        // Let's set it just in case, though usually clicking a node selects it.
                        const oldSelected = selectedNodeId;
                        selectedNodeId = nodeId;
                        toggleSubtask(idx);
                        selectedNodeId = oldSelected;

                        // Update this specific checkbox
                        checkbox.classList.toggle('checked');
                        checkbox.innerHTML = checkbox.classList.contains('checked') ? '✓' : '';
                        textSpan.classList.toggle('done');
                    };

                    const textSpan = document.createElement('div');
                    textSpan.className = `expanded-subtask-text ${st.done ? 'done' : ''}`;
                    textSpan.textContent = st.text;

                    item.appendChild(checkbox);
                    item.appendChild(textSpan);
                    box.appendChild(item);
                });

                nodeEl.appendChild(box);
            }
        }

        function closeAllSubtaskBoxes() {
            document.querySelectorAll('.subtasks-expanded-box').forEach(box => box.remove());
        }

        function closeInspector() { selectedNodeId = null; selectedIds.clear(); document.getElementById('inspector').classList.add('hidden'); render(); }
        function updateSubtaskText(index, val) { const node = getSelectedNode(); node.subtasks[index].text = val; saveToStorage(); }
        function removeSubtask(index) { const node = getSelectedNode(); node.subtasks.splice(index, 1); render(); updateInspector(); saveToStorage(); }

        function promoteSubtaskToNode(index) {
            const parentNode = getSelectedNode();
            if (!parentNode) return;
            const subtask = parentNode.subtasks[index];
            parentNode.subtasks.splice(index, 1);
            const newNode = createNode(parentNode.x + 220, parentNode.y, subtask.text);
            newNode.completed = subtask.done;
            if (newNode.completed) newNode.completedDate = Date.now();
            nodes.push(newNode);
            parentNode.dependencies.push({ id: newNode.id, type: 'hard' });
            updateCalculations();
            render();
            updateInspector();
            saveToStorage();
        }

        function demoteNodeToSubtask(parentId) {
            if (!parentId) return;
            const targetId = selectedNodeId;
            const targetNode = nodes.find(n => n.id === targetId);
            if (!targetNode) return;
            const parentNode = nodes.find(n => n.id === parentId);
            if (!parentNode) return;
            parentNode.subtasks.push({ text: targetNode.title, done: targetNode.completed });
            discardReminderByItem('task', targetId);
            nodes = nodes.filter(n => n.id !== targetId);
            archivedNodes = archivedNodes.filter(n => n.id !== targetId);
            nodes.forEach(n => { n.dependencies = n.dependencies.filter(d => d.id !== targetId); });
            selectNode(parentNode.id);
            updateCalculations();
            render();
            updateInspector();
            saveToStorage();
        }

        function deleteSelectedNode() {
            if (!selectedNodeId) return;
            if (!confirm('Delete this task completely?')) return;
            discardReminderByItem('task', selectedNodeId);
            nodes = nodes.filter(n => n.id !== selectedNodeId);
            archivedNodes = archivedNodes.filter(n => n.id !== selectedNodeId);
            nodes.forEach(n => { n.dependencies = n.dependencies.filter(d => d.id !== selectedNodeId); });
            deselectNode();
            updateCalculations();
            render();
            renderArchiveList();
            saveToStorage();
        }
