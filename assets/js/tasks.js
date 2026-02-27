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
            if (typeof touchTask === 'function') touchTask(node);

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
        let inspectorExpandedModalOpen = false;

        function isInspectorExpandedModalOpen() {
            return !!inspectorExpandedModalOpen;
        }

        function openInspectorExpandedModal() {
            if (!selectedNodeId) return;
            const modal = document.getElementById('inspector-expanded-modal');
            const backdrop = document.getElementById('inspector-expanded-backdrop');
            const expandedBody = document.getElementById('inspector-expanded-body');
            const panel = document.getElementById('insp-content');
            const inspector = document.getElementById('inspector');
            if (!modal || !backdrop || !expandedBody || !panel || !inspector) return;

            inspectorExpandedModalOpen = true;
            modal.classList.add('visible');
            backdrop.classList.add('visible');
            inspector.classList.add('hidden');
            if (panel.parentElement !== expandedBody) expandedBody.appendChild(panel);
            updateInspector();
        }

        function closeInspectorExpandedModal({ restoreInspector = true, refreshInspector = true } = {}) {
            const modal = document.getElementById('inspector-expanded-modal');
            const backdrop = document.getElementById('inspector-expanded-backdrop');
            const panel = document.getElementById('insp-content');
            const inspector = document.getElementById('inspector');

            inspectorExpandedModalOpen = false;
            if (modal) modal.classList.remove('visible');
            if (backdrop) backdrop.classList.remove('visible');

            if (panel && inspector && panel.parentElement !== inspector) inspector.appendChild(panel);

            if (inspector) {
                if (restoreInspector && selectedNodeId) inspector.classList.remove('hidden');
                else inspector.classList.add('hidden');
            }

            if (refreshInspector && selectedNodeId) updateInspector();
        }

        function toggleInspectorExpandedModal() {
            if (isInspectorExpandedModalOpen()) {
                closeInspectorExpandedModal({ restoreInspector: true, refreshInspector: true });
            } else {
                openInspectorExpandedModal();
            }
        }

        function updateInspector() {
            const panel = document.getElementById('insp-content');
            if (!panel) return;
            if (!selectedNodeId) return;

            let node = getSelectedNode();
            if (!node) return;
            const inspectorShell = document.getElementById('inspector');
            const expandedModal = document.getElementById('inspector-expanded-modal');
            const expandedBody = document.getElementById('inspector-expanded-body');
            const isExpanded = isInspectorExpandedModalOpen() && expandedModal && expandedModal.classList.contains('visible');

            if (isExpanded) {
                if (expandedBody && panel.parentElement !== expandedBody) expandedBody.appendChild(panel);
                if (inspectorShell) inspectorShell.classList.add('hidden');
            } else if (inspectorShell && panel.parentElement !== inspectorShell) {
                inspectorShell.appendChild(panel);
            }

            const isArchived = archivedNodes.some(n => n.id === node.id);

            const isRunning = !!node.activeTimerStart;
            const linkedNotes = notes.filter(n => n.taskIds && n.taskIds.includes(node.id));
            const urgencyMode = node.isManualUrgent ? 'urgent' : (node.isManualNotUrgent ? 'not-urgent' : 'standard');
            const isUrgent = urgencyMode === 'urgent';
            const sortedProjects = (Array.isArray(projects) ? [...projects] : [])
                .sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' }));
            const linkedProject = sortedProjects.find(project => project.id === node.projectId) || null;
            const linkedProjectUrgency = linkedProject && typeof getProjectUrgencyMeta === 'function'
                ? getProjectUrgencyMeta(linkedProject.id)
                : { level: 1, tag: 'LOWEST', score: 0 };
            const linkedProjectUrgencyLevel = Math.min(5, Math.max(1, Number(linkedProjectUrgency && linkedProjectUrgency.level) || 1));
            const linkedProjectPillHtml = linkedProject ? `
                <div class="inspector-linked-project-row">
                    <button type="button"
                        class="inspector-linked-project-pill urgency-level-${linkedProjectUrgencyLevel}"
                        onclick="openProjectFromInspector('${linkedProject.id}', event)"
                        title="Open project details: ${escapeHtml(linkedProject.name || 'Untitled Project')}">
                        <span class="inspector-linked-project-pill-dot" aria-hidden="true"></span>
                        <span class="inspector-linked-project-pill-name">${escapeHtml(linkedProject.name || 'Untitled Project')}</span>
                        <span class="inspector-linked-project-pill-meta">${escapeHtml(linkedProjectUrgency.tag || 'LOWEST')} ${Math.max(0, Number(linkedProjectUrgency.score) || 0)}</span>
                    </button>
                </div>` : '';

            // --- HEADER ---
            const urgencySwitchHtml = `
                <div class="urgency-switch ${isExpanded ? 'urgency-switch-inline' : 'urgency-switch-panel'}">
                    <div class="urgency-option ${urgencyMode === 'standard' ? 'active standard-active' : ''}" onclick="setUrgencyMode('standard')">Standard</div>
                    <div class="urgency-option ${urgencyMode === 'urgent' ? 'active urgent-active' : ''}" onclick="setUrgencyMode('urgent')">Urgent</div>
                    <div class="urgency-option ${urgencyMode === 'not-urgent' ? 'active not-urgent-active' : ''}" onclick="setUrgencyMode('not-urgent')">Not Urgent</div>
                </div>
            `;

            const headerHtml = `
                <div class="inspector-header" style="padding: 20px 20px 16px 20px; border-bottom: 1px solid #1e293b;">
                    <div class="inspector-header-row" style="display:flex; justify-content:space-between; align-items:start; margin-bottom:16px;">
                        <div style="display:flex; align-items:center; gap:8px;">
                            <div class="inspector-badge">
                                # TASK INSPECTOR
                            </div>
                            <button class="inspector-head-btn inspector-head-btn-close" onclick="closeInspector()" title="Close Inspector">✕</button>
                            <button class="inspector-head-btn inspector-head-btn-expand" onclick="toggleInspectorExpandedModal()" title="${isExpanded ? 'Restore Inspector' : 'Expand Inspector'}">${isExpanded ? '🗗' : '⛶'}</button>
                            <button class="inspector-head-btn inspector-head-btn-ai" onclick="decomposeTask()" title="Decompose with AI">✨</button>
                        </div>

                        ${isExpanded ? urgencySwitchHtml : ''}
                    </div>
                    ${isExpanded ? '' : `<div class="inspector-urgency-row">${urgencySwitchHtml}</div>`}

                    ${linkedProjectPillHtml}
                    <div class="inspector-title-wrapper">
                        <input type="text" class="inspector-title-input" value="${node.title}" placeholder="Task Title..." oninput="updateNodeField('title', this.value)">
                    </div>
                    ${renderCheckInGrid(node)}
                </div>`;

            // --- CONTENT FIELDS ---
            // 1. Duration & Status Row
            const durationStatusHtml = `
                <div class="inspector-section inspector-section-core inspector-meta-card" style="display:flex; gap:12px; margin-bottom:16px;">
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
            const isNoDueDate = node.noDueDate === true;
            const dueDateHtml = `
                <div class="inspector-section inspector-section-due inspector-meta-card" style="margin-bottom:16px;">
                    <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom:8px;">
                        <label class="field-label" style="margin:0;">📅 DUE DATE</label>
                        <label style="font-size:11px; color:#94a3b8; display:flex; align-items:center; gap:6px; cursor:pointer; user-select:none;">
                            <input type="checkbox" ${isNoDueDate ? 'checked' : ''} 
                                onchange="updateNodeField('noDueDate', this.checked)"
                                style="width:14px; height:14px; cursor:pointer;">
                            No due date
                        </label>
                    </div>
                    <div class="field-box" style="padding: 8px 12px; ${isNoDueDate ? 'opacity:0.45;' : ''}">
                        <input type="date" value="${node.dueDate || ''}" ${isNoDueDate ? 'disabled' : ''}
                            style="background:transparent; border:none; color:white; width:100%; font-family:inherit; font-size:13px; outline:none;" 
                            onchange="updateNodeField('dueDate', this.value)">
                    </div>
                    <div style="display:flex; align-items:center; gap:8px; margin-top:8px; padding:8px; background:rgba(239,68,68,0.1); border-radius:6px; ${isNoDueDate ? 'opacity:0.45;' : ''}">
                        <input type="checkbox" id="expires-checkbox" ${node.expiresOnDue ? 'checked' : ''} ${isNoDueDate ? 'disabled' : ''}
                            onchange="updateNodeField('expiresOnDue', this.checked)" 
                            style="width:16px; height:16px; cursor:pointer;">
                        <label for="expires-checkbox" style="font-size:11px; color:#ef4444; cursor:pointer; user-select:none;">
                            ⚠️ Auto-archive if not completed by due date
                        </label>
                    </div>
                </div>`;

            const taskReminder = getReminderForItem('task', node.id);
            const reminderHtml = taskReminder ? `
                <div class="inspector-section inspector-section-reminder inspector-meta-card" style="margin-bottom:16px;">
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
                <div class="inspector-section inspector-section-reminder inspector-meta-card" style="margin-bottom:16px;">
                    <label class="field-label">⏰ REMINDER</label>
                    <div class="linked-note-item" style="border-style:dashed; justify-content:space-between; color:#94a3b8;">
                        <span style="font-size:12px;">No reminder set</span>
                        <button class="add-subtask-btn" style="color:#f59e0b;" onclick="openRemindersModal('task', '${node.id}')">+ ADD</button>
                    </div>
                </div>`;

            // 3. External Link
            const externalLinkHtml = `
                <div class="inspector-section inspector-section-link inspector-meta-card" style="margin-bottom:16px;">
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
                <div class="inspector-section inspector-section-subtasks" style="margin-bottom:16px;">
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
                            <textarea class="st-input ${st.done ? 'done' : ''}" rows="1"
                                oninput="resizeSubtaskTextarea(this)"
                                onchange="updateSubtaskText(${idx}, this.value)">${escapeHtml(st.text || '')}</textarea>
                            <button onclick="promoteSubtaskToNode(${idx})" style="background:transparent; border:none; color:#10b981; cursor:pointer; font-size:14px;" title="Promote to Subsequent Task">⬆</button>
                            <button onclick="removeSubtask(${idx})" style="background:transparent; border:none; color:#475569; cursor:pointer; font-size:14px;" title="Remove Subtask">✕</button>
                        </div>
                        `).join('')}
                        ${node.subtasks.length === 0 ? '<div class="subtask-empty-msg" style="font-size:11px; color:#475569; padding:12px; text-align:center;">No subtasks</div>' : ''}
                    </div>
                </div>`;

            // 5. Linked Notes
            const linkedNotesHtml = `
                <div class="inspector-section inspector-section-notes inspector-meta-card" style="margin-bottom:16px;">
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

            // 6. Dependencies + Immediate Subsequent Tasks
            const findTaskById = (taskId) => nodes.find(n => n.id === taskId) || archivedNodes.find(n => n.id === taskId);
            const immediateSuccessors = nodes
                .filter(n => n.id !== node.id && n.dependencies.some(d => d.id === node.id))
                .sort((a, b) => (a.title || '').localeCompare(b.title || ''));

            const dependenciesHtml = `
                <div class="inspector-section inspector-section-dependencies" style="margin-bottom:16px;">
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
                const taskBoxStyle = getTaskColorBoxInlineStyle(p);
                const taskSubtleStyle = getTaskSubtleTextInlineStyle(p);
                return `
                            <div class="linked-note-item" style="padding:10px 12px; ${taskBoxStyle} cursor:pointer;" onclick="openTaskFromInspector('${d.id}')">
                                <div style="width:6px; height:6px; border-radius:50%; background:${d.type === 'hard' ? '#ef4444' : '#f59e0b'}; margin-right:8px; flex-shrink:0;"></div>
                                <span style="font-size:12px; color:inherit; flex-grow:1;">${p.title}</span>
                                <span style="font-size:10px; ${taskSubtleStyle} cursor:pointer; margin-right:8px; padding:2px 6px; background:rgba(15,23,42,0.34); border:1px solid rgba(255,255,255,0.14); border-radius:4px;" onclick="toggleDepType('${d.id}', event)">${d.type}</span>
                                <span style="cursor:pointer; color:#ef4444; font-size:14px;" onclick="removeDependency('${d.id}', event)">✕</span>
                            </div>`;
            }).join('')}
                        
                         ${node.dependencies.length === 0 ?
                    `<div style="text-align:center; padding:12px; border:1px dashed #334155; border-radius:8px; color:#475569; font-size:11px;">
                            No blockers linked yet.
                          </div>` : ''}
                    </div>
                </div>`;

            const unblocksHtml = `
                <div class="inspector-section inspector-section-unblocks" style="margin-bottom:16px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                        <label class="field-label" style="margin-bottom:0;">UNBLOCKS (IMMEDIATE)</label>
                        <span style="font-size:10px; color:#64748b;">${immediateSuccessors.length}</span>
                    </div>

                    <div style="display:flex; flex-direction:column; gap:8px;">
                        ${immediateSuccessors.map(s => {
                const taskBoxStyle = getTaskColorBoxInlineStyle(s);
                const taskSubtleStyle = getTaskSubtleTextInlineStyle(s);
                const relationDep = s.dependencies.find(d => d.id === node.id);
                const relationType = relationDep ? relationDep.type : 'soft';
                const hasHardDepOnCurrent = !!relationDep && relationDep.type === 'hard';
                const unresolvedOtherHardDeps = s.dependencies
                    .filter(d => d.type === 'hard' && d.id !== node.id)
                    .map(d => findTaskById(d.id))
                    .filter(depTask => depTask && !depTask.completed).length;
                const currentStillBlocks = hasHardDepOnCurrent && !node.completed;
                const unresolvedHardCount = unresolvedOtherHardDeps + (currentStillBlocks ? 1 : 0);

                let readinessLabel = '';
                let readinessColor = '#94a3b8';
                if (s.completed) {
                    readinessLabel = 'Completed';
                    readinessColor = '#10b981';
                } else if (currentStillBlocks && unresolvedOtherHardDeps === 0) {
                    readinessLabel = 'Ready after this';
                    readinessColor = '#38bdf8';
                } else if (unresolvedHardCount === 0) {
                    readinessLabel = 'Ready now';
                    readinessColor = '#22c55e';
                } else {
                    readinessLabel = `Blocked by ${unresolvedHardCount}`;
                    readinessColor = '#f59e0b';
                }

                return `
                            <div class="linked-note-item" style="padding:10px 12px; ${taskBoxStyle} cursor:pointer;" onclick="openTaskFromInspector('${s.id}')">
                                <div style="width:6px; height:6px; border-radius:50%; background:${relationType === 'hard' ? '#ef4444' : '#f59e0b'}; margin-right:8px; flex-shrink:0;"></div>
                                <div style="flex-grow:1; min-width:0;">
                                    <div style="font-size:12px; color:inherit; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(s.title || 'Untitled Task')}</div>
                                    <div style="font-size:10px; ${taskSubtleStyle} margin-top:2px; display:flex; align-items:center; gap:8px;">
                                        <span style="text-transform:uppercase;">${relationType}</span>
                                        <span style="color:${readinessColor};">${readinessLabel}</span>
                                    </div>
                                </div>
                                <span style="color:#475569;">›</span>
                            </div>`;
            }).join('')}

                        ${immediateSuccessors.length === 0 ?
                    `<div style="text-align:center; padding:12px; border:1px dashed #334155; border-radius:8px; color:#475569; font-size:11px;">
                            No immediate subsequent tasks.
                          </div>` : ''}
                    </div>
                </div>`;

            // 7. Linked Goals
            const linkedGoalIds = Array.isArray(node.goalIds) ? node.goalIds : [];
            const allGoals = (typeof getAllGoalsFlat === 'function') ? getAllGoalsFlat() : [];
            const linkableGoals = (typeof getLinkableGoalsFlat === 'function')
                ? getLinkableGoalsFlat({ includeSubgoals: true })
                : allGoals;
            const goalById = new Map();
            allGoals.forEach((item) => {
                const goalId = String(item && item.goal && item.goal.id || '').trim();
                if (!goalId || goalById.has(goalId)) return;
                goalById.set(goalId, item);
            });
            const linkedProjectHtml = `
                <div class="inspector-section inspector-section-projects" style="margin-bottom:16px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                        <label class="field-label">📁 PROJECT</label>
                        <span style="font-size:10px; color:#64748b;">${linkedProject ? (linkedProject.status || 'active').toUpperCase() : 'UNASSIGNED'}</span>
                    </div>

                    <select style="width:100%; padding:8px; background:#0f172a; border:1px solid #334155; color:white; border-radius:6px; outline:none; font-size:12px;"
                        onchange="assignTaskToProjectFromInspector('${node.id}', this.value)">
                        <option value="">No Project</option>
                        ${sortedProjects.map(project => `<option value='${project.id}' ${project.id === node.projectId ? 'selected' : ''}>${escapeHtml(project.name || 'Untitled Project')}</option>`).join('')}
                    </select>
                </div>`;
            const linkedGoalsHtml = `
                <div class="inspector-section inspector-section-goals" style="margin-bottom:16px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                        <label class="field-label">🎯 LINKED GOALS</label>
                        <button class="add-subtask-btn" style="color:#f59e0b;" onclick="document.getElementById('goal-link-select-wrap').style.display='block';">+ LINK GOAL</button>
                    </div>
                    
                    <div id="goal-link-select-wrap" style="display:none; margin-bottom:8px;">
                        <select style="width:100%; padding:8px; background:#0f172a; border:1px solid #334155; color:white; border-radius:6px; outline:none; font-size:12px;" 
                            onchange="linkTaskToGoal('${node.id}', this.value, null); this.parentElement.style.display='none'; this.value='';">
                            <option value="">Select Goal...</option>
                            ${linkableGoals.filter(g => !linkedGoalIds.includes(g.goal.id)).map(g => {
                const indent = '&nbsp;'.repeat((Number(g.depth) || 0) * 4);
                return `<option value='${g.goal.id}'>${g.year} • ${indent}${g.goal.text}</option>`;
            }).join('')}
                        </select>
                    </div>

                    <div style="display:flex; flex-direction:column; gap:8px;">
                        ${linkedGoalIds.map(goalId => {
                const goalItem = goalById.get(goalId);
                if (!goalItem) return '';
                const indent = '&nbsp;'.repeat((Number(goalItem.depth) || 0) * 4);
                const goalPath = getGoalPath(goalItem.goal.id);
                const goalBoxStyle = getGoalColorBoxInlineStyle(goalItem.goal.id);
                const goalSubtleStyle = getGoalSubtleTextInlineStyle(goalItem.goal.id);
                return `
                    <div class="linked-note-item" style="padding:10px 12px; ${goalBoxStyle} cursor:pointer;" onclick="openGoalFromInspector('${goalId}')">
                        <div style="flex-grow:1; min-width:0;">
                            <span style="font-size:12px; color:inherit;">${indent}🎯 ${goalItem.goal.text}</span>
                            ${goalPath ? `<div style="font-size:9px; ${goalSubtleStyle} margin-top:2px;">${goalPath}</div>` : ''}
                        </div>
                        <span style="cursor:pointer; color:#ef4444; font-size:14px;" onclick="unlinkGoalFromInspector('${node.id}', '${goalId}', event)">✕</span>
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
                <div class="inspector-footer-bar" style="padding: 16px 20px; background: #020617; border-top: 1px solid #1e293b; display: flex; align-items: center; justify-content: space-between; gap:12px;">
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
                <div id="parent-picker" class="inspector-parent-picker" style="display:none; position:absolute; bottom:60px; left:20px; right:20px; background:#1e293b; border:1px solid #334155; border-radius:8px; padding:12px; z-index:100; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.5);">
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

            const metadataClusterHtml = `
                <div class="inspector-section-metadata-cluster">
                    ${durationStatusHtml}
                    ${dueDateHtml}
                    ${reminderHtml}
                    ${linkedNotesHtml}
                    ${externalLinkHtml}
                </div>
            `;

            // --- ASSEMBLE ---
            panel.innerHTML = `
                ${headerHtml}
                <div class="inspector-body-scroll" style="padding: 16px 20px; overflow-y: auto; flex-grow:1;">
                    <div class="inspector-grid">
                        ${metadataClusterHtml}
                        ${subtasksHtml}
                        ${dependenciesHtml}
                        ${unblocksHtml}
                        ${linkedProjectHtml}
                        ${linkedGoalsHtml}
                    </div>
                </div>
                ${footerHtml}
            `;
            initializeSubtaskTextareas(panel);
        }

        function resizeSubtaskTextarea(textarea) {
            if (!textarea) return;
            textarea.style.height = 'auto';
            textarea.style.height = `${textarea.scrollHeight}px`;
        }

        function initializeSubtaskTextareas(scope = document) {
            scope.querySelectorAll('.st-input').forEach(resizeSubtaskTextarea);
        }

        function setUrgencyMode(mode) {
            const node = nodes.find(n => n.id === selectedNodeId);
            if (node) {
                const nextMode = mode === 'urgent' || mode === 'not-urgent' ? mode : 'standard';
                node.isManualUrgent = nextMode === 'urgent';
                node.isManualNotUrgent = nextMode === 'not-urgent';
                if (typeof touchTask === 'function') touchTask(node);
                updateCalculations();
                render();
                updateInspector();
                saveToStorage();
            }
        }

        function setUrgency(urgent) {
            setUrgencyMode(urgent ? 'urgent' : 'standard');
        }

        function updateNodeField(field, value) {
            let node = getSelectedNode();
            if (node) {
                const getDueDateFromDuration = (daysValue) => {
                    const days = parseInt(daysValue, 10);
                    if (Number.isNaN(days) || days <= 0) return '';
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    const due = new Date(today);
                    due.setDate(today.getDate() + days);
                    const yyyy = due.getFullYear();
                    const mm = String(due.getMonth() + 1).padStart(2, '0');
                    const dd = String(due.getDate()).padStart(2, '0');
                    return `${yyyy}-${mm}-${dd}`;
                };

                if (field === 'noDueDate') {
                    node.noDueDate = Boolean(value);
                    if (node.noDueDate) {
                        node.dueDate = '';
                        node.expiresOnDue = false;
                    } else if (node.syncDurationDate && !node.dueDate) {
                        node.dueDate = getDueDateFromDuration(node.duration);
                    }
                } else {
                    node[field] = value;
                    if (field === 'dueDate' && value) node.noDueDate = false;
                }

                const today = new Date(); today.setHours(0, 0, 0, 0);
                if (node.syncDurationDate && !node.noDueDate) {
                    if (field === 'duration') {
                        const computedDueDate = getDueDateFromDuration(value);
                        if (computedDueDate) {
                            node.dueDate = computedDueDate;
                            const dateInput = document.querySelector('.inspector-section-due input[type="date"]');
                            if (dateInput) dateInput.value = node.dueDate;
                        }
                    } else if (field === 'dueDate') {
                        if (value) {
                            const due = new Date(value);
                            const diffTime = due - today;
                            let diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                            if (diffDays < 1) diffDays = 1;
                            node.duration = diffDays;
                            const durInput = document.querySelector('.inspector-section-core input[type="number"]');
                            if (durInput) durInput.value = diffDays;
                        }
                    }
                }
                if (field === 'duration' || field === 'dueDate' || field === 'syncDurationDate' || field === 'noDueDate') updateCalculations();
                if (typeof touchTask === 'function') touchTask(node);
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
                if (typeof touchTask === 'function') touchTask(node);
                updateCalculations();
                render();
                updateInspector();
                saveToStorage();
            }
        }

        function toggleUrgency() {
            const node = nodes.find(n => n.id === selectedNodeId);
            if (!node) return;
            setUrgencyMode(node.isManualUrgent ? 'standard' : 'urgent');
        }
        function toggleNotUrgent() {
            const node = nodes.find(n => n.id === selectedNodeId);
            if (!node) return;
            setUrgencyMode(node.isManualNotUrgent ? 'standard' : 'not-urgent');
        }
        function openTaskFromInspector(taskId) {
            if (!taskId) return;
            const taskExists = nodes.some(n => n.id === taskId) || archivedNodes.some(n => n.id === taskId);
            if (!taskExists) return;
            if (typeof jumpToTask === 'function') jumpToTask(taskId);
            else if (typeof selectNode === 'function') selectNode(taskId);
        }
        function openGoalFromInspector(goalId) {
            if (!goalId) return;

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
        function openProjectFromInspector(projectId, event) {
            if (event) {
                event.preventDefault();
                event.stopPropagation();
            }
            const normalizedProjectId = String(projectId || '').trim();
            if (!normalizedProjectId) return;
            if (typeof openProjectDetailsModal === 'function') {
                openProjectDetailsModal(normalizedProjectId);
            }
        }
        function unlinkGoalFromInspector(taskId, goalId, event) {
            if (event) event.stopPropagation();
            unlinkTaskFromGoal(taskId, goalId);
        }
        function assignTaskToProjectFromInspector(taskId, projectId) {
            const normalizedProjectId = String(projectId || '').trim() || null;
            if (typeof assignTaskToProject === 'function') {
                assignTaskToProject(taskId, normalizedProjectId, { reRender: true });
            } else {
                const task = nodes.find(n => n.id === taskId) || archivedNodes.find(n => n.id === taskId);
                if (!task) return;
                task.projectId = normalizedProjectId;
                if (typeof touchTask === 'function') touchTask(task);
                saveToStorage();
                render();
                updateInspector();
            }
            if ((typeof isProjectsPanelVisible === 'function' && isProjectsPanelVisible()) && typeof renderProjectsList === 'function') {
                renderProjectsList();
            }
        }
        function addDependency(parentId) {
            if (!parentId) return;
            const node = nodes.find(n => n.id === selectedNodeId);
            if (!node) return;

            const parentNode = nodes.find(n => n.id === parentId) || archivedNodes.find(n => n.id === parentId);
            if (!parentNode) return;

            if (!node.dependencies.some(d => d.id === parentId)) {
                node.dependencies.push({ id: parentId, type: 'hard' });
            }

            if (typeof inheritTaskGoalsFromParent === 'function') {
                inheritTaskGoalsFromParent(parentNode, node);
            }

            if (typeof touchTask === 'function') touchTask(node);
            updateCalculations();
            render();
            updateInspector();
            saveToStorage();
        }
        function removeDependency(parentId, event) { if (event) event.stopPropagation(); const node = nodes.find(n => n.id === selectedNodeId); if (node) { node.dependencies = node.dependencies.filter(d => d.id !== parentId); if (typeof touchTask === 'function') touchTask(node); updateCalculations(); render(); updateInspector(); saveToStorage(); } }
        function toggleDepType(parentId, event) { if (event) event.stopPropagation(); const node = nodes.find(n => n.id === selectedNodeId); if (node) { const dep = node.dependencies.find(d => d.id === parentId); dep.type = dep.type === 'hard' ? 'soft' : 'hard'; if (typeof touchTask === 'function') touchTask(node); updateCalculations(); render(); updateInspector(); saveToStorage(); } }
        function addSubtask() { const node = getSelectedNode(); if (node) { node.subtasks.push({ text: 'New Step', done: false }); if (typeof touchTask === 'function') touchTask(node); render(); updateInspector(); saveToStorage(); } }
        function toggleSubtask(index) {
            const node = getSelectedNode();
            if (node) {
                node.subtasks[index].done = !node.subtasks[index].done;
                if (typeof touchTask === 'function') touchTask(node);
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

        function closeInspector() {
            closeInspectorExpandedModal({ restoreInspector: false, refreshInspector: false });
            selectedNodeId = null;
            selectedIds.clear();
            document.getElementById('inspector').classList.add('hidden');
            render();
        }
        function updateSubtaskText(index, val) { const node = getSelectedNode(); node.subtasks[index].text = val; if (typeof touchTask === 'function') touchTask(node); saveToStorage(); }
        function removeSubtask(index) { const node = getSelectedNode(); node.subtasks.splice(index, 1); if (typeof touchTask === 'function') touchTask(node); render(); updateInspector(); saveToStorage(); }

        function promoteSubtaskToNode(index) {
            const parentNode = getSelectedNode();
            if (!parentNode) return;
            const subtask = parentNode.subtasks[index];
            parentNode.subtasks.splice(index, 1);
            if (typeof touchTask === 'function') touchTask(parentNode);
            const newNode = createNode(parentNode.x + 220, parentNode.y, subtask.text);
            newNode.completed = subtask.done;
            if (newNode.completed) newNode.completedDate = Date.now();
            nodes.push(newNode);
            // Promoted subtasks should become subsequent tasks unblocked by the current task.
            newNode.dependencies.push({ id: parentNode.id, type: 'hard' });
            if (typeof inheritTaskGoalsFromParent === 'function') {
                inheritTaskGoalsFromParent(parentNode, newNode);
            }
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
            if (typeof touchTask === 'function') touchTask(parentNode);
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
