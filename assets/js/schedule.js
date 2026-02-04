// --- AUDIO ENGINE (Web Audio API) ---
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

let pipCanvas = null;
let pipCtx = null;

async function toggleFloatingWindow() {
    const video = document.getElementById('pip-stream-source');

    // 1. Exit if already open
    if (document.pictureInPictureElement) {
        document.exitPictureInPicture();
        return;
    }

    // 2. SAFARI PERMISSION KICK: Play a tiny silent beep to unlock media permissions
    try {
        const silentCtx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = silentCtx.createOscillator();
        const gain = silentCtx.createGain();
        gain.gain.value = 0.001; // Nearly silent
        osc.connect(gain);
        gain.connect(silentCtx.destination);
        osc.start();
        osc.stop(silentCtx.currentTime + 0.1);
    } catch (e) { console.log("Audio kick skipped"); }

    // 3. Initialize Canvas
    if (!pipCanvas) {
        pipCanvas = document.createElement('canvas');
        pipCanvas.width = 600;
        pipCanvas.height = 400;
        pipCtx = pipCanvas.getContext('2d');
    }

    // 4. Draw initial frame (Crucial for Safari)
    pipCtx.fillStyle = '#0c1812';
    pipCtx.fillRect(0, 0, pipCanvas.width, pipCanvas.height);

    // 5. Setup Stream
    if (!video.srcObject) {
        video.srcObject = pipCanvas.captureStream(30); // 30fps for smooth timer
    }

    // 6. Request PiP (The "Power Move" sequence)
    video.play().then(() => {
        return video.requestPictureInPicture();
    }).then(() => {
        updatePipLoop();
    }).catch(err => {
        console.error("PiP Denied:", err);
        alert("Action Required: Please interact with the app (click anywhere) then try the 🚀 button again. Safari requires a fresh user gesture.");
    });
}

function updatePipLoop() {
    if (!document.pictureInPictureElement) return;

    const now = Date.now();
    const activeTask = nodes.find(n => n.activeTimerStart) || archivedNodes.find(n => n.activeTimerStart);
    const currentSlot = agenda.find(slot => {
        const start = new Date(slot.start).getTime();
        const end = new Date(slot.end).getTime();
        return now >= start && now <= end;
    });

    // Clear Canvas
    pipCtx.fillStyle = '#0c1812';
    pipCtx.fillRect(0, 0, pipCanvas.width, pipCanvas.height);

    // --- TOP SECTION: DOING ---
    pipCtx.fillStyle = '#3b82f6';
    pipCtx.font = 'bold 24px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    pipCtx.fillText("DOING", 40, 60);

    if (activeTask) {
        pipCtx.fillStyle = '#ffffff';
        pipCtx.font = 'bold 42px -apple-system';
        const title = activeTask.title.length > 20 ? activeTask.title.substring(0, 18) + "..." : activeTask.title;
        pipCtx.fillText(title, 40, 115);

        pipCtx.fillStyle = '#10b981';
        pipCtx.font = 'bold 70px monospace';
        pipCtx.fillText(formatTime(getTotalTime(activeTask)), 40, 190);
    } else {
        pipCtx.fillStyle = '#444';
        pipCtx.font = 'italic 32px sans-serif';
        pipCtx.fillText("No active timer", 40, 120);
    }

    // Visual Divider
    pipCtx.strokeStyle = '#222';
    pipCtx.lineWidth = 4;
    pipCtx.beginPath();
    pipCtx.moveTo(0, 220);
    pipCtx.lineTo(600, 220);
    pipCtx.stroke();

    // --- BOTTOM SECTION: SCHEDULED ---
    pipCtx.fillStyle = '#ffd700';
    pipCtx.font = 'bold 24px -apple-system';
    pipCtx.fillText("SCHEDULED", 40, 270);

    if (currentSlot) {
        const scheduledTask = nodes.find(n => n.id === currentSlot.taskId) || archivedNodes.find(n => n.id === currentSlot.taskId);
        // NEW: Check inbox if not found
        if (!scheduledTask && currentSlot.taskId.startsWith('inbox_temp_')) {
            const inboxItem = inbox.find(item => currentSlot.taskId.includes(item.id.split('_')[1]));
            if (inboxItem) scheduledTask = { title: inboxItem.title + ' (Inbox)' };
        }
        pipCtx.fillStyle = '#ffffff';
        pipCtx.font = '500 38px -apple-system';
        const sTitle = (scheduledTask ? scheduledTask.title : "Unscheduled");
        pipCtx.fillText(sTitle.length > 22 ? sTitle.substring(0, 20) + "..." : sTitle, 40, 320);

        pipCtx.fillStyle = '#888';
        pipCtx.font = 'bold 32px monospace';
        const startStr = new Date(currentSlot.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const endStr = new Date(currentSlot.end).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        pipCtx.fillText(`${startStr} - ${endStr}`, 40, 370);
    } else {
        pipCtx.fillStyle = '#444';
        pipCtx.font = 'italic 32px sans-serif';
        pipCtx.fillText("Free Time", 40, 330);
    }

    requestAnimationFrame(updatePipLoop);
}

async function playAudioFeedback(type) {
    // Wakes up the audio context on first interaction
    if (audioCtx.state === 'suspended') {
        await audioCtx.resume();
    }

    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);

    const now = audioCtx.currentTime;

    switch (type) {
        case 'timer-start':
            osc.type = 'sine';
            osc.frequency.setValueAtTime(440, now);
            osc.frequency.exponentialRampToValueAtTime(880, now + 0.1);
            gain.gain.setValueAtTime(0.1, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
            osc.start(now);
            osc.stop(now + 0.1);
            break;

        case 'timer-stop':
            osc.type = 'sine';
            osc.frequency.setValueAtTime(880, now);
            osc.frequency.exponentialRampToValueAtTime(440, now + 0.1);
            gain.gain.setValueAtTime(0.1, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
            osc.start(now);
            osc.stop(now + 0.1);
            break;

        case 'agenda-start':
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(523.25, now);
            osc.frequency.exponentialRampToValueAtTime(1046.50, now + 0.5);
            gain.gain.setValueAtTime(0.2, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.5);
            osc.start(now);
            osc.stop(now + 0.5);
            break;

        case 'agenda-stop':
            osc.type = 'sine';
            osc.frequency.setValueAtTime(659.25, now);
            osc.frequency.setValueAtTime(523.25, now + 0.2);
            gain.gain.setValueAtTime(0.15, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);
            osc.start(now);
            osc.stop(now + 0.4);
            break;
    }
}

function toggleHeatmap() { const overlay = document.getElementById('heatmap-overlay'); const isHidden = overlay.classList.contains('hidden'); if (isHidden) { overlay.classList.remove('hidden'); renderHeatmap(); } else { overlay.classList.add('hidden'); } }
function changeHeatmapYear(delta) { currentHeatmapYear += delta; renderHeatmap(); }
function renderHeatmap() {
    const container = document.getElementById('heatmap-container'); document.getElementById('heatmap-title').textContent = `${currentHeatmapYear} Heatmap`; container.innerHTML = '';
    const year = currentHeatmapYear; const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const counts = {};
    [...nodes, ...archivedNodes].forEach(n => { if (n.dueDate) { counts[n.dueDate] = (counts[n.dueDate] || 0) + 1; } });
    months.forEach((mName, mIdx) => {
        const monthDiv = document.createElement('div'); monthDiv.className = 'heatmap-month-container';
        const title = document.createElement('div'); title.className = 'heatmap-month-title'; title.textContent = mName; monthDiv.appendChild(title);
        const grid = document.createElement('div'); grid.className = 'heatmap-month-grid';
        const daysInMonth = new Date(year, mIdx + 1, 0).getDate(); const firstDayDow = new Date(year, mIdx, 1).getDay();
        for (let i = 0; i < firstDayDow; i++) { const empty = document.createElement('div'); empty.className = 'day-cell'; empty.style.background = 'transparent'; grid.appendChild(empty); }
        for (let d = 1; d <= daysInMonth; d++) {
            const cell = document.createElement('div'); cell.className = 'day-cell'; cell.textContent = d;
            const dateStr = `${year}-${String(mIdx + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            if (counts[dateStr]) {
                const count = counts[dateStr]; cell.classList.add('active'); if (count === 1) cell.classList.add('level-1'); else if (count === 2) cell.classList.add('level-2'); else if (count === 3) cell.classList.add('level-3'); else if (count === 4) cell.classList.add('level-4'); else cell.classList.add('level-5');
                const tip = document.createElement('div'); tip.className = 'day-tooltip';
                const taskNames = [...nodes, ...archivedNodes].filter(n => n.dueDate === dateStr).map(n => n.title).join(', ');
                tip.textContent = `${count} tasks: ${taskNames}`; cell.appendChild(tip);
            }
            grid.appendChild(cell);
        }
        monthDiv.appendChild(grid); container.appendChild(monthDiv);
    });
}

// --- PROGRESS DASHBOARD LOGIC ---
let progressView = 'week'; // day, week, month
let progressDate = new Date();

function toggleProgressDashboard() {
    const panel = document.getElementById('progress-dashboard');
    if (panel.classList.contains('hidden')) {
        panel.classList.remove('hidden');
        renderProgressDashboard();
    } else {
        panel.classList.add('hidden');
    }
}

function setProgressView(view) {
    progressView = view;
    document.querySelectorAll('.view-btn').forEach(btn => btn.classList.remove('active'));
    event.target.classList.add('active');
    renderProgressDashboard();
}

function changeProgressDate(delta) {
    if (progressView === 'day') progressDate.setDate(progressDate.getDate() + delta);
    else if (progressView === 'week') progressDate.setDate(progressDate.getDate() + (delta * 7));
    else if (progressView === 'month') progressDate.setMonth(progressDate.getMonth() + delta);
    renderProgressDashboard();
}

function getWeekBounds(date) {
    const start = new Date(date);
    start.setDate(start.getDate() - start.getDay()); // Sunday
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    end.setHours(23, 59, 59, 999);
    return { start, end };
}

function getDayBounds(date) {
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    const end = new Date(date);
    end.setHours(23, 59, 59, 999);
    return { start, end };
}

function getMonthBounds(date) {
    const start = new Date(date.getFullYear(), date.getMonth(), 1);
    start.setHours(0, 0, 0, 0);
    const end = new Date(date.getFullYear(), date.getMonth() + 1, 0);
    end.setHours(23, 59, 59, 999);
    return { start, end };
}

function calculateGoalImpact(taskId) {
    const task = nodes.find(n => n.id === taskId) || archivedNodes.find(n => n.id === taskId);
    if (!task || !task.goalIds || task.goalIds.length === 0) return 0;

    let impact = 0;
    // Base impact: 20 points per linked goal
    impact += task.goalIds.length * 20;

    // Bonus: +30 if critical path
    if (task._isCritical) impact += 30;

    // Bonus: +20 if urgent
    if (task._isUrgent) impact += 20;

    // Bonus: +10 per dependency (blocking other tasks)
    impact += (task._downstreamWeight || 0) * 10;

    return Math.min(100, impact); // Cap at 100
}

function renderProgressDashboard() {
    const content = document.getElementById('progress-content');
    const titleEl = document.getElementById('progress-title-text');

    let bounds;
    if (progressView === 'day') {
        bounds = getDayBounds(progressDate);
        titleEl.innerText = progressDate.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    } else if (progressView === 'week') {
        bounds = getWeekBounds(progressDate);
        const endDate = new Date(bounds.end);
        titleEl.innerText = `Week of ${bounds.start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} - ${endDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
    } else {
        bounds = getMonthBounds(progressDate);
        titleEl.innerText = progressDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    }

    if (progressView === 'week') {
        content.innerHTML = renderWeekProgress(bounds);
    } else if (progressView === 'day') {
        content.innerHTML = renderDayProgress(bounds);
    } else {
        content.innerHTML = renderMonthProgress(bounds);
    }
}

function renderWeekProgress(bounds) {
    // Collect all activities
    const activities = [];

    // Task timers
    [...nodes, ...archivedNodes].forEach(task => {
        if (task.timeLogs) {
            task.timeLogs.forEach(log => {
                const start = new Date(log.start);
                const end = new Date(log.end);
                if (start < bounds.end && end > bounds.start) {
                    activities.push({
                        type: 'task',
                        title: task.title,
                        start: Math.max(start.getTime(), bounds.start.getTime()),
                        end: Math.min(end.getTime(), bounds.end.getTime()),
                        duration: log.duration,
                        goalImpact: calculateGoalImpact(task.id),
                        taskId: task.id
                    });
                }
            });
        }
    });

    // Habit timers
    habits.forEach(habit => {
        if (habit.type === 'timer') {
            // Use granular logs if available
            if (habit.timeLogs) {
                habit.timeLogs.forEach(log => {
                    const start = new Date(log.start);
                    const end = new Date(log.end);
                    if (start < bounds.end && end > bounds.start) {
                        activities.push({
                            type: 'habit',
                            title: habit.title,
                            start: Math.max(start.getTime(), bounds.start.getTime()),
                            end: Math.min(end.getTime(), bounds.end.getTime()),
                            duration: log.duration,
                            goalImpact: habit.goalId ? 30 : 0,
                            habitId: habit.id
                        });
                    }
                });
            } else if (habit.history) {
                // Fallback to day-wise sum (legacy)
                for (const [dateKey, value] of Object.entries(habit.history)) {
                    const [y, m, d_] = dateKey.split('-').map(Number);
                    const date = new Date(y, m - 1, d_);
                    if (date >= bounds.start && date <= bounds.end && typeof value === 'number') {
                        activities.push({
                            type: 'habit',
                            title: habit.title,
                            start: date.getTime(),
                            end: date.getTime() + value,
                            duration: value,
                            goalImpact: habit.goalId ? 30 : 0,
                            habitId: habit.id
                        });
                    }
                }
            }
        }
    });

    // Check-ins
    [...nodes, ...archivedNodes].forEach(task => {
        if (task.checkIns) {
            task.checkIns.forEach(ts => {
                const date = new Date(ts);
                if (date >= bounds.start && date <= bounds.end) {
                    activities.push({
                        type: 'checkin',
                        title: task.title + ' (Check-in)',
                        start: ts,
                        end: ts + (5 * 60 * 1000), // 5 min visual block
                        duration: 0,
                        goalImpact: calculateGoalImpact(task.id) * 0.5,
                        taskId: task.id
                    });
                }
            });
        }
    });

    // Calculate stats
    const totalTime = activities.reduce((sum, a) => sum + (a.duration || 0), 0);
    const taskCount = new Set(activities.filter(a => a.type === 'task').map(a => a.taskId)).size;
    const habitCount = activities.filter(a => a.type === 'habit').length;
    const checkinCount = activities.filter(a => a.type === 'checkin').length;
    const avgImpact = activities.length > 0 ? (activities.reduce((sum, a) => sum + a.goalImpact, 0) / activities.length) : 0;

    // Group by project/goal
    const byProject = {};
    activities.forEach(a => {
        const key = a.title.split(' ')[0] || 'Misc';
        if (!byProject[key]) byProject[key] = [];
        byProject[key].push(a);
    });

    let html = `
                <div class="week-stats-grid">
                    <div class="stat-card">
                        <div class="stat-label">Total Focus Time</div>
                        <div class="stat-value">${formatTime(totalTime)}</div>
                        <div class="stat-subtext">${(totalTime / (1000 * 60 * 60)).toFixed(1)} hours this week</div>
                    </div>
                    <div class="stat-card" style="--accent: #10b981;">
                        <div class="stat-label">Tasks Worked On</div>
                        <div class="stat-value">${taskCount}</div>
                        <div class="stat-subtext">${checkinCount} check-ins recorded</div>
                    </div>
                    <div class="stat-card" style="--accent: #fbbf24;">
                        <div class="stat-label">Habits Completed</div>
                        <div class="stat-value">${habitCount}</div>
                        <div class="stat-subtext">Building consistency</div>
                    </div>
                    <div class="stat-card" style="--accent: #a78bfa;">
                        <div class="stat-label">Goal Impact Score</div>
                        <div class="stat-value">${avgImpact.toFixed(0)}</div>
                        <div class="stat-subtext">Average alignment rating</div>
                    </div>
                </div>
            `;

    // Swim lanes by project
    html += `<div class="timeline-container">
                <div class="timeline-header">📊 Activity by Project</div>
                <div class="timeline-grid">
                    <div class="timeline-hour-markers">
                        ${generateHourMarkers()}
                    </div>
            `;

    for (const [project, acts] of Object.entries(byProject)) {
        const projectTime = acts.reduce((sum, a) => sum + (a.duration || 0), 0);
        const avgGoalImpact = acts.reduce((sum, a) => sum + a.goalImpact, 0) / acts.length;

        html += `
                    <div class="swim-lane">
                        <div class="lane-label">
                            <div class="lane-title">${project}</div>
                            <div class="lane-subtitle">${formatTime(projectTime)} • Impact: ${avgGoalImpact.toFixed(0)}</div>
                        </div>
                        <div class="lane-blocks-container">
                            ${acts.map(a => renderTimeBlock(a, bounds)).join('')}
                        </div>
                    </div>
                `;
    }

    html += `</div></div>`;

    // Goal-based view
    const byGoal = {};
    activities.forEach(a => {
        if (a.taskId) {
            const task = nodes.find(n => n.id === a.taskId) || archivedNodes.find(n => n.id === a.taskId);
            if (task && task.goalIds && task.goalIds.length > 0) {
                task.goalIds.forEach(gid => {
                    if (!byGoal[gid]) byGoal[gid] = [];
                    byGoal[gid].push(a);
                });
            }
        }
    });

    if (Object.keys(byGoal).length > 0) {
        html += `<div class="timeline-container">
                    <div class="timeline-header">🎯 Activity by Goal</div>
                    <div class="timeline-grid">
                        <div class="timeline-hour-markers">
                            ${generateHourMarkers()}
                        </div>
                `;

        for (const [goalId, acts] of Object.entries(byGoal)) {
            const goalName = findGoalName(goalId);
            const goalTime = acts.reduce((sum, a) => sum + (a.duration || 0), 0);

            html += `
                        <div class="swim-lane">
                            <div class="lane-label">
                                <div class="lane-title">${goalName}</div>
                                <div class="lane-subtitle">${formatTime(goalTime)}</div>
                            </div>
                            <div class="lane-blocks-container">
                                ${acts.map(a => renderTimeBlock(a, bounds, true)).join('')}
                            </div>
                        </div>
                    `;
        }

        html += `</div></div>`;
    }

    return html;
}

function renderDayProgress(bounds) {
    const activities = [];

    // Collect all activities for the day
    [...nodes, ...archivedNodes].forEach(task => {
        if (task.timeLogs) {
            task.timeLogs.forEach(log => {
                const start = new Date(log.start);
                const end = new Date(log.end);
                if (start < bounds.end && end > bounds.start) {
                    activities.push({
                        type: 'task',
                        title: task.title,
                        start: Math.max(start.getTime(), bounds.start.getTime()),
                        end: Math.min(end.getTime(), bounds.end.getTime()),
                        duration: log.duration,
                        goalImpact: calculateGoalImpact(task.id),
                        taskId: task.id
                    });
                }
            });
        }
    });

    habits.forEach(habit => {
        if (habit.type === 'timer') {
            if (habit.timeLogs) {
                habit.timeLogs.forEach(log => {
                    const start = new Date(log.start);
                    const end = new Date(log.end);
                    if (start < bounds.end && end > bounds.start) {
                        activities.push({
                            type: 'habit',
                            title: habit.title,
                            start: Math.max(start.getTime(), bounds.start.getTime()),
                            end: Math.min(end.getTime(), bounds.end.getTime()),
                            duration: log.duration,
                            goalImpact: habit.goalId ? 30 : 0
                        });
                    }
                });
            } else if (habit.history) {
                const dateKey = getHabitDateKey(0); // Today local
                const value = habit.history[dateKey];
                if (value && typeof value === 'number') {
                    const [y, m, d_] = dateKey.split('-').map(Number);
                    const date = new Date(y, m - 1, d_);
                    activities.push({
                        type: 'habit',
                        title: habit.title,
                        start: date.getTime(),
                        end: date.getTime() + value,
                        duration: value,
                        goalImpact: habit.goalId ? 30 : 0
                    });
                }
            }
        }
    });

    // Stats
    const totalTime = activities.reduce((sum, a) => sum + (a.duration || 0), 0);
    const avgImpact = activities.length > 0 ? (activities.reduce((sum, a) => sum + a.goalImpact, 0) / activities.length) : 0;

    let html = `
                <div class="week-stats-grid">
                    <div class="stat-card">
                        <div class="stat-label">Focus Time Today</div>
                        <div class="stat-value">${formatTime(totalTime)}</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-label">Activities</div>
                        <div class="stat-value">${activities.length}</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-label">Goal Impact</div>
                        <div class="stat-value">${avgImpact.toFixed(0)}</div>
                    </div>
                </div>

                <div class="timeline-container">
                    <div class="timeline-header">📅 Today's Timeline</div>
                    <div class="day-timeline">
            `;

    for (let hour = 0; hour < 24; hour++) {
        html += `
                    <div class="day-hour-row">
                        <div class="day-hour-label">${hour}:00</div>
                        <div class="day-events-column">
                            ${activities.filter(a => {
            const startHour = new Date(a.start).getHours();
            return startHour === hour;
        }).map(a => {
            const start = new Date(a.start);
            const minutes = start.getMinutes();
            const left = (minutes / 60) * 100;
            const width = Math.min((a.duration / (1000 * 60 * 60)) * 100, 100 - left);

            return `
                                    <div class="time-block ${a.type}-block" style="left: ${left}%; width: ${width}%;">
                                        <div class="block-title">${a.title}</div>
                                        <div class="block-duration">${formatTime(a.duration)}</div>
                                        ${a.goalImpact > 0 ? `<div class="goal-impact-badge">⭐ ${a.goalImpact}</div>` : ''}
                                    </div>
                                `;
        }).join('')}
                        </div>
                    </div>
                `;
    }

    html += `</div></div>`;
    return html;
}

function renderMonthProgress(bounds) {
    const daysInMonth = new Date(bounds.end).getDate();
    const firstDay = new Date(bounds.start);
    const startDayOfWeek = firstDay.getDay();

    // Collect daily stats
    const dailyStats = {};

    [...nodes, ...archivedNodes].forEach(task => {
        if (task.timeLogs) {
            task.timeLogs.forEach(log => {
                const date = new Date(log.start);
                if (date >= bounds.start && date <= bounds.end) {
                    const key = date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
                    if (!dailyStats[key]) dailyStats[key] = { time: 0, habits: 0, tasks: new Set(), impact: 0 };
                    dailyStats[key].time += log.duration;
                    dailyStats[key].tasks.add(task.id);
                    dailyStats[key].impact += calculateGoalImpact(task.id);
                }
            });
        }
    });

    habits.forEach(habit => {
        if (habit.history) {
            for (const [dateKey, value] of Object.entries(habit.history)) {
                const [y, m, d_] = dateKey.split('-').map(Number);
                const date = new Date(y, m - 1, d_);
                if (date >= bounds.start && date <= bounds.end) {
                    if (!dailyStats[dateKey]) dailyStats[dateKey] = { time: 0, habits: 0, tasks: new Set(), impact: 0 };
                    dailyStats[dateKey].habits += 1;
                    if (typeof value === 'number') dailyStats[dateKey].time += value;
                }
            }
        }
    });

    let html = '<div class="month-grid">';

    // Empty cells before month starts
    for (let i = 0; i < startDayOfWeek; i++) {
        html += '<div class="month-day-cell dim"></div>';
    }

    // Days of month
    for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(bounds.start);
        date.setDate(day);
        const key = date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
        const stats = dailyStats[key] || { time: 0, habits: 0, tasks: new Set(), impact: 0 };
        const hours = stats.time / (1000 * 60 * 60);
        const avgImpact = stats.tasks.size > 0 ? (stats.impact / stats.tasks.size) : 0;

        html += `
                    <div class="month-day-cell" onclick="progressDate = new Date('${key}'); setProgressView('day');">
                        <div class="month-day-number">${day}</div>
                        <div class="month-day-summary">
                            ${stats.time > 0 ? `<div class="month-activity-bar task" style="width: ${Math.min(100, hours * 10)}%"></div>` : ''}
                            ${stats.habits > 0 ? `<div class="month-activity-bar habit"></div>` : ''}
                        </div>
                        ${stats.time > 0 || stats.habits > 0 ? `
                            <div class="month-stats-text">
                                ${hours > 0 ? hours.toFixed(1) + 'h' : ''} 
                                ${stats.habits > 0 ? stats.habits + ' habits' : ''}
                                ${avgImpact > 0 ? ' • ⭐' + avgImpact.toFixed(0) : ''}
                            </div>
                        ` : ''}
                    </div>
                `;
    }

    html += '</div>';
    return html;
}

function generateHourMarkers() {
    let html = '';
    for (let i = 0; i < 24; i++) {
        html += `<div class="hour-marker">${i}:00</div>`;
    }
    return html;
}

function renderTimeBlock(activity, bounds, isGoalView = false) {
    const weekStart = bounds.start.getTime();
    const weekDuration = bounds.end.getTime() - weekStart;
    const blockStart = activity.start;
    const blockEnd = activity.end;

    const left = ((blockStart - weekStart) / weekDuration) * 100;
    const width = ((blockEnd - blockStart) / weekDuration) * 100;

    const className = isGoalView ? 'goal-block' : activity.type + '-block';

    return `
                <div class="time-block ${className}" style="left: ${left}%; width: ${width}%;">
                    <div class="block-title">${activity.title}</div>
                    <div class="block-duration">${formatTime(activity.duration || 0)}</div>
                    ${activity.goalImpact > 0 ? `<div class="goal-impact-badge">⭐ ${activity.goalImpact}</div>` : ''}
                </div>
            `;
}

function findGoalName(goalId) {
    const search = (list) => {
        for (const g of list) {
            if (g.id === goalId) return g.text;
            if (g.children) {
                const found = search(g.children);
                if (found) return found;
            }
        }
        return null;
    };
    for (const year in lifeGoals) {
        const result = search(lifeGoals[year]);
        if (result) return result;
    }
    return 'Unknown Goal';
}

function getGoalPath(goalId) {
    const buildPath = (list, targetId, path = []) => {
        for (const g of list) {
            if (g.id === targetId) {
                return [...path, g.text].join(' → ');
            }
            if (g.children) {
                const result = buildPath(g.children, targetId, [...path, g.text]);
                if (result) return result;
            }
        }
        return null;
    };

    for (const year in lifeGoals) {
        const result = buildPath(lifeGoals[year], goalId);
        if (result) return result;
    }
    return null;
}

// --- CALENDAR LOGIC ---
let calendarView = 'day'; // day, week, month
let calendarDate = new Date();

function toggleCalendar() {
    const panel = document.getElementById('calendar-panel');
    if (panel.classList.contains('hidden')) {
        panel.classList.remove('hidden');
        renderCalendar();
    } else {
        panel.classList.add('hidden');
    }
}

function setCalView(view) {
    calendarView = view;
    renderCalendar();
}

function changeCalDate(delta) {
    if (calendarView === 'day') calendarDate.setDate(calendarDate.getDate() + delta);
    else if (calendarView === 'week') calendarDate.setDate(calendarDate.getDate() + (delta * 7));
    else if (calendarView === 'month') calendarDate.setMonth(calendarDate.getMonth() + delta);
    renderCalendar();
}

function renderCalendar() {
    const container = document.getElementById('cal-container');
    const title = document.getElementById('cal-title');
    container.innerHTML = '';

    // Collect all time logs
    const allLogs = [];
    [...nodes, ...archivedNodes].forEach(n => {
        // Logs stored in array
        if (n.timeLogs) {
            n.timeLogs.forEach(l => allLogs.push({ ...l, title: n.title, taskId: n.id }));
        }
        // Active timer?
        if (n.activeTimerStart) {
            allLogs.push({ start: n.activeTimerStart, end: Date.now(), title: n.title, taskId: n.id, active: true });
        }
    });

    if (calendarView === 'day') {
        title.innerText = calendarDate.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

        const view = document.createElement('div'); view.className = 'cal-day-view';

        // Labels Column
        const labels = document.createElement('div'); labels.className = 'cal-time-labels';
        for (let i = 0; i < 24; i++) {
            const l = document.createElement('div'); l.className = 'cal-hour-label'; l.innerText = `${i}:00`;
            labels.appendChild(l);
        }
        view.appendChild(labels);

        // Content Column
        const col = document.createElement('div'); col.className = 'cal-day-col';

        // Filter logs for this day
        const dayStart = new Date(calendarDate); dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(calendarDate); dayEnd.setHours(23, 59, 59, 999);

        allLogs.forEach(log => {
            const ls = new Date(log.start);
            const le = new Date(log.end);

            // Check overlap
            if (ls < dayEnd && le > dayStart) {
                const top = (ls.getHours() * 60) + ls.getMinutes();
                // Duration in minutes
                let dur = (Math.min(le, dayEnd) - Math.max(ls, dayStart)) / 60000;
                if (dur < 15) dur = 15; // Minimum height visibility

                const el = document.createElement('div'); el.className = 'cal-event';
                el.style.top = top + 'px';
                el.style.height = dur + 'px';
                el.style.background = log.active ? 'rgba(16, 185, 129, 0.2)' : '';
                el.style.borderColor = log.active ? 'var(--ready-color)' : '';
                el.innerHTML = `<b>${log.title}</b><br>${ls.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - ${le.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
                el.onclick = () => { toggleCalendar(); jumpToTask(log.taskId); };
                col.appendChild(el);
            }
        });
        view.appendChild(col);

        // Scroll to 8am default
        setTimeout(() => view.scrollTop = 480, 0);
        container.appendChild(view);

    } else if (calendarView === 'week') {
        const startOfWeek = new Date(calendarDate);
        startOfWeek.setDate(calendarDate.getDate() - calendarDate.getDay()); // Sunday
        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(startOfWeek.getDate() + 6);

        title.innerText = `${startOfWeek.toLocaleDateString()} - ${endOfWeek.toLocaleDateString()}`;

        const view = document.createElement('div'); view.className = 'cal-week-view';

        for (let i = 0; i < 7; i++) {
            const d = new Date(startOfWeek); d.setDate(startOfWeek.getDate() + i);
            const dStart = new Date(d); dStart.setHours(0, 0, 0, 0);
            const dEnd = new Date(d); dEnd.setHours(23, 59, 59, 999);

            const col = document.createElement('div'); col.className = 'cal-week-col';
            col.innerHTML = `<div class="cal-week-header">${d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' })}</div>`;

            const body = document.createElement('div'); body.className = 'cal-week-body';

            // Simple viz for week: just blocks, simplified
            allLogs.forEach(log => {
                const ls = new Date(log.start);
                const le = new Date(log.end);
                if (ls < dEnd && le > dStart) {
                    // Scale 24h to 100% height
                    const startMins = (ls.getHours() * 60) + ls.getMinutes();
                    const durMins = (Math.min(le, dEnd) - Math.max(ls, dStart)) / 60000;

                    const topPct = (startMins / 1440) * 100;
                    const hPct = (durMins / 1440) * 100;

                    const blk = document.createElement('div');
                    blk.style.position = 'absolute';
                    blk.style.left = '2px'; blk.style.right = '2px';
                    blk.style.top = topPct + '%';
                    blk.style.height = Math.max(hPct, 1) + '%'; // Min 1% height
                    blk.style.background = 'var(--accent)';
                    blk.style.opacity = '0.5';
                    blk.title = `${log.title} (${Math.round(durMins)}m)`;
                    body.appendChild(blk);
                }
            });

            col.appendChild(body);
            view.appendChild(col);
        }
        container.appendChild(view);

    } else if (calendarView === 'month') {
        title.innerText = calendarDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

        const view = document.createElement('div'); view.className = 'cal-month-view';
        const y = calendarDate.getFullYear(); const m = calendarDate.getMonth();
        const firstDay = new Date(y, m, 1);
        const startDay = new Date(firstDay); startDay.setDate(1 - firstDay.getDay()); // Fill start

        // 42 cells (6 rows)
        for (let i = 0; i < 42; i++) {
            const d = new Date(startDay); d.setDate(startDay.getDate() + i);
            const isCurrentMonth = d.getMonth() === m;

            const cell = document.createElement('div');
            cell.className = `cal-month-cell ${!isCurrentMonth ? 'dim' : ''}`;
            cell.innerHTML = `<div class="cal-month-date">${d.getDate()}</div>`;

            // Aggregate Total Time
            const dStart = new Date(d); dStart.setHours(0, 0, 0, 0);
            const dEnd = new Date(d); dEnd.setHours(23, 59, 59, 999);
            let totalDur = 0;

            allLogs.forEach(log => {
                const ls = new Date(log.start);
                const le = new Date(log.end);
                if (ls < dEnd && le > dStart) {
                    totalDur += (Math.min(le, dEnd) - Math.max(ls, dStart));
                }
            });

            // Render "Density Bar"
            if (totalDur > 0) {
                const hrs = totalDur / (1000 * 60 * 60);
                const bar = document.createElement('div');
                bar.className = 'cal-dot';
                // Opacity based on hours (max 8h for full opacity)
                bar.style.opacity = Math.min(1, 0.2 + (hrs / 8));
                bar.title = `${hrs.toFixed(1)} hrs`;
                cell.appendChild(bar);

                const txt = document.createElement('div');
                txt.style.fontSize = '9px'; txt.style.color = '#666';
                txt.innerText = `${hrs.toFixed(1)}h`;
                cell.appendChild(txt);
            }

            view.appendChild(cell);
        }
        container.appendChild(view);
    }
}


function tickTimers() {
    // Skip all timer updates in Ultra Eco Mode
    if (isUltraEcoMode) return;

    const now = Date.now();

    // 1. Existing Task Timers Logic
    nodes.forEach(node => {
        if (node.activeTimerStart) {
            const badge = document.querySelector(`.time-badge[data-node-id="${node.id}"]`);
            if (badge) { badge.innerHTML = `🔴 ${formatTime(getTotalTime(node))}`; }
            if (selectedNodeId === node.id) {
                const btnText = document.getElementById('timer-btn-text');
                if (btnText) btnText.innerText = `Stop Timer (${formatTime(now - node.activeTimerStart)})`;
            }
        }
    });

    // 2. UPDATED DUAL HUD LOGIC
    updateFocusHUD(now);

    // 3. Habit Timers
    const hasRunningHabit = habits.some(h => h.activeTimerStart);
    if (hasRunningHabit && !document.getElementById('habits-panel').classList.contains('hidden')) {
        renderHabits();

        // Update pinned window if it has running timers
        const pinnedWindow = document.getElementById('pinned-window');
        if (pinnedWindow && !pinnedWindow.classList.contains('hidden')) {
            const hasRunningInPinned = pinnedItems.some(p => {
                if (p.type === 'habit') {
                    const h = habits.find(habit => habit.id === p.id);
                    return h && h.activeTimerStart;
                }
                return false;
            });
            if (hasRunningInPinned) renderPinnedWindow();
        }
    }
}

function updateFocusHUD(now) {
    const hud = document.getElementById('focus-hud');
    const doingRow = document.getElementById('hud-doing-row');
    const shouldRow = document.getElementById('hud-should-row');
    const upcomingRow = document.getElementById('hud-upcoming-row'); // NEW
    const habitRow = document.getElementById('hud-habit-row');

    // Identify "Doing" (Which task has an active timer?)
    const activeTask = nodes.find(n => n.activeTimerStart) || archivedNodes.find(n => n.activeTimerStart);

    // Identify "Should Be" (What does the agenda say for right now?)
    const currentSlot = agenda.find(slot => {
        const start = new Date(slot.start).getTime();
        const end = new Date(slot.end).getTime();
        return now >= start && now <= end;
    });

    // NEW: Find the next upcoming slot
    const upcomingSlot = agenda
        .filter(slot => new Date(slot.start).getTime() > now)
        .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())[0];

    const currentSlotId = currentSlot ? currentSlot.taskId : null;

    if (currentSlotId !== lastKnownAgendaTaskId) {
        if (currentSlotId) {
            playAudioFeedback('agenda-start');
        } else if (lastKnownAgendaTaskId) {
            playAudioFeedback('agenda-stop');
        }
        lastKnownAgendaTaskId = currentSlotId;
    }

    let hudActive = false;

    // --- Render "Doing" Row ---
    if (activeTask) {
        hudActive = true;
        doingRow.style.display = 'flex';
        document.getElementById('hud-doing-title').innerText = activeTask.title;
        document.getElementById('hud-doing-time').innerText = formatTime(getTotalTime(activeTask));
        hud.dataset.doingTaskId = activeTask.id;

        if (currentSlot && activeTask.id === currentSlot.taskId) {
            doingRow.classList.remove('overtime');
        }
    } else {
        doingRow.style.display = 'none';
    }

    // --- Render "Should Be" Row ---
    if (currentSlot && (!activeTask || activeTask.id !== currentSlot.taskId)) {
        hudActive = true;
        shouldRow.style.display = 'flex';
        const scheduledTask = nodes.find(n => n.id === currentSlot.taskId) || archivedNodes.find(n => n.id === currentSlot.taskId);
        // NEW: Check inbox if not found
        if (!scheduledTask && currentSlot.taskId.startsWith('inbox_temp_')) {
            const inboxItem = inbox.find(item => currentSlot.taskId.includes(item.id.split('_')[1]));
            if (inboxItem) scheduledTask = { title: inboxItem.title + ' (Inbox)' };
        }
        document.getElementById('hud-should-title').innerText = scheduledTask ? scheduledTask.title : "Unscheduled Block";

        const startStr = new Date(currentSlot.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const endStr = new Date(currentSlot.end).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        document.getElementById('hud-should-interval').innerText = `${startStr} - ${endStr}`;

        hud.dataset.shouldTaskId = currentSlot.taskId;
    } else {
        shouldRow.style.display = 'none';
    }

    // --- NEW: Render "Upcoming" Row ---
    if (upcomingSlot) {
        hudActive = true;
        upcomingRow.style.display = 'flex';

        const upcomingTask = nodes.find(n => n.id === upcomingSlot.taskId) || archivedNodes.find(n => n.id === upcomingSlot.taskId);
        // NEW: Check inbox if not found
        if (!upcomingTask && upcomingSlot.taskId.startsWith('inbox_temp_')) {
            const inboxItem = inbox.find(item => upcomingSlot.taskId.includes(item.id.split('_')[1]));
            if (inboxItem) upcomingTask = { title: inboxItem.title + ' (Inbox)' };
        }
        document.getElementById('hud-upcoming-title').innerText = upcomingTask ? upcomingTask.title : "Unscheduled Block";

        // Calculate minutes until start
        const startTime = new Date(upcomingSlot.start).getTime();
        const minutesUntil = Math.round((startTime - now) / 60000);
        const countdownEl = document.getElementById('hud-upcoming-countdown');

        if (minutesUntil < 60) {
            countdownEl.innerText = `in ${minutesUntil}m`;
        } else {
            const hours = Math.floor(minutesUntil / 60);
            const mins = minutesUntil % 60;
            countdownEl.innerText = `in ${hours}h ${mins}m`;
        }

        const startStr = new Date(upcomingSlot.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const endStr = new Date(upcomingSlot.end).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        document.getElementById('hud-upcoming-interval').innerText = `${startStr} - ${endStr}`;

        hud.dataset.upcomingTaskId = upcomingSlot.taskId;
    } else {
        upcomingRow.style.display = 'none';
    }

    // --- Render Habit Row ---
    const activeHabit = habits.find(h => h.activeTimerStart);
    if (activeHabit) {
        hudActive = true;
        habitRow.style.display = 'flex';
        document.getElementById('hud-habit-title').innerText = activeHabit.title;

        const freq = activeHabit.frequency || 'daily';
        const bounds = getPeriodBounds(freq);
        const val = getSumInPeriod(activeHabit, bounds);

        document.getElementById('hud-habit-time').innerText = formatTime(val);
        hud.dataset.activeHabitId = activeHabit.id;
    } else {
        habitRow.style.display = 'none';
    }

    if (hudActive) hud.classList.add('active');
    else hud.classList.remove('active');
}

function toggleFocusTimer(type) {
    const hud = document.getElementById('focus-hud');
    const taskId = (type === 'doing') ? hud.dataset.doingTaskId : hud.dataset.shouldTaskId;
    if (taskId) toggleTimer(taskId);
}

function toggleHabitFocusTimer() {
    const hud = document.getElementById('focus-hud');
    const habitId = hud.dataset.activeHabitId;
    if (habitId) toggleHabitTimer(habitId);
}

function focusHUDTask(type) {
    const hud = document.getElementById('focus-hud');
    let taskId;
    if (type === 'doing') taskId = hud.dataset.doingTaskId;
    else if (type === 'should') taskId = hud.dataset.shouldTaskId;
    else if (type === 'upcoming') taskId = hud.dataset.upcomingTaskId; // NEW

    if (taskId) jumpToTask(taskId);
}


// --- AGENDA PANEL FUNCTIONS ---
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
    } else {
        panel.classList.add('hidden');
    }
}

function renderAgenda() {
    const container = document.getElementById('agenda-list-container');
    document.getElementById('agenda-date-display').innerText = new Date().toLocaleDateString();
    container.innerHTML = '';
    if (agenda.length === 0) {
        container.innerHTML = '<div style="text-align:center; color:#666; padding:20px;">No agenda set.</div>';
        return;
    }

    // Sort by start time
    agenda.sort((a, b) => new Date(a.start) - new Date(b.start));

    const now = Date.now();
    agenda.forEach((slot, index) => {
        let task = nodes.find(n => n.id === slot.taskId) || archivedNodes.find(n => n.id === slot.taskId);
        let isDeleted = false;
        let isInbox = false;
        let isBreak = slot.taskId.startsWith('break_');

        if (!task && slot.taskId && slot.taskId.startsWith('inbox_temp_')) {
            const originalInboxId = slot.taskId.replace('inbox_temp_', 'inbox_');
            const inboxItem = inbox.find(item => item.id === originalInboxId);
            if (inboxItem) {
                task = { id: slot.taskId, title: inboxItem.title + ' (Inbox)', isInboxItem: true };
                isInbox = true;
            }
        }

        // AI sometimes provides a title or uses the taskId as a title for breaks
        if (!task) {
            if (isBreak) {
                task = { title: slot.title || "Break", phantom: true };
            } else {
                const displayTitle = slot.title || (slot.taskId && slot.taskId.length > 15 ? "Untitled Task" : slot.taskId) || "Deleted Task";
                task = { title: displayTitle, phantom: true };
                isDeleted = false; // It's not "deleted", it's just a placeholder or non-node item
            }
        }

        const entryStart = new Date(slot.start).getTime();
        const entryEnd = new Date(slot.end).getTime();
        const isCurrent = now >= entryStart && now <= entryEnd;
        const isDone = (task && task.completed) || (!isCurrent && now > entryEnd); // Auto-mark past items as "done" visually

        const el = document.createElement('div');
        el.className = `agenda-slot ${isCurrent ? 'current' : ''} ${isDone ? 'done' : ''} ${isBreak ? 'break-slot' : ''}`;
        if (isDeleted) el.style.opacity = '0.5';
        if (isBreak) {
            el.style.borderLeft = "3px solid #f59e0b"; // Amber for breaks
            el.style.background = "rgba(245, 158, 11, 0.1)";
        }

        el.innerHTML = `
                <div class="agenda-time" style="${isDone ? 'text-decoration: line-through;' : ''}">
                    ${new Date(slot.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}<br>
                    ${new Date(slot.end).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
                <div class="agenda-info">
                    <div class="agenda-task-title" style="${isDone ? 'text-decoration: line-through; color: var(--ready-color);' : ''}">
                        ${isDone ? '✅ ' : ''}${task.title}
                    </div>
                    <div class="agenda-actions">
                        ${(!isDeleted && !task.phantom && !isBreak) ? `<button class="btn" style="padding:2px 5px; font-size:10px" onclick="jumpToTask('${slot.taskId}')">🎯 View</button>` : ''}
                        <button class="btn btn-danger" style="padding:2px 5px; font-size:10px" onclick="deleteAgendaSlot(${index})">✕</button>
                    </div>
                </div>
            `;
        container.appendChild(el);
    });
}

function clearCompletedAgendaSlots() {
    const initialCount = agenda.length;
    const now = Date.now();
    agenda = agenda.filter(slot => {
        const task = nodes.find(n => n.id === slot.taskId) || archivedNodes.find(n => n.id === slot.taskId);
        const end = new Date(slot.end).getTime();

        // Keep if:
        // 1. Task exists and is NOT completed
        // 2. OR it's a break/phantom and it hasn't ended yet
        // 3. OR it's a break/phantom and user explicitly wants to keep history (but here we clear "done")

        if (slot.taskId.startsWith('break_')) {
            return end > now; // Remove past breaks
        }

        return (!task || !task.completed) && end > now; // Also clear past time slots even if task not checked? Maybe just check status.
        // User said "Clear Done". Usually implies checked tasks. 
        // Let's stick to: Remove if task completed OR if it's a break that is over.
    });

    // Re-run filter for strict "Task Completed" check
    agenda = agenda.filter(slot => {
        const task = nodes.find(n => n.id === slot.taskId) || archivedNodes.find(n => n.id === slot.taskId);
        if (slot.taskId.startsWith('break_')) return new Date(slot.end).getTime() > now;
        return task ? !task.completed : true;
    });

    if (agenda.length < initialCount) {
        showNotification(`Cleared ${initialCount - agenda.length} items`);
        renderAgenda();
        saveToStorage();
    }
}

// --- NEW AGENDA LOGIC ---

function renderAgendaPanelUI() {
    // Update Selected Task Labels
    const titleEl = document.getElementById('agenda-selected-task-title');
    const container = document.getElementById('agenda-selection-info');
    const panel = document.getElementById('agenda-panel');

    if (titleEl) {
        if (selectedNodeId) {
            const node = nodes.find(n => n.id === selectedNodeId) || archivedNodes.find(n => n.id === selectedNodeId);
            if (node) {
                titleEl.innerText = node.title;
                titleEl.style.fontStyle = 'normal';
                titleEl.style.color = 'white';
                container.style.borderLeftColor = 'var(--accent)';
                // Store ID in DOM for persistence
                panel.dataset.selectedId = selectedNodeId;
            }
        } else {
            titleEl.innerText = "(Select a task on the graph)";
            titleEl.style.fontStyle = 'italic';
            titleEl.style.color = '#64748b';
            container.style.borderLeftColor = 'transparent';
            delete panel.dataset.selectedId;
        }
    }

    // Pre-fill time inputs if empty
    const startInput = document.getElementById('agenda-start-time');
    const endInput = document.getElementById('agenda-end-time');

    if (startInput && !startInput.value) {
        // Find next available slot or nearest 30m block
        const now = new Date();
        let nextStart = new Date(now);

        // Find latest end time in agenda
        if (agenda.length > 0) {
            const maxEnd = agenda.reduce((max, slot) => {
                const e = new Date(slot.end);
                return e > max ? e : max;
            }, new Date(0));

            if (maxEnd > now) nextStart = maxEnd;
        }

        // Round to nearest 5 mins
        const coeff = 1000 * 60 * 5;
        nextStart = new Date(Math.ceil(nextStart.getTime() / coeff) * coeff);

        const nextEnd = new Date(nextStart.getTime() + 30 * 60000); // Default 30 min

        startInput.value = nextStart.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
        endInput.value = nextEnd.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
    }
}

function addToAgenda() {
    // Get ID from global or fallback to DOM (if selection lost)
    const targetId = selectedNodeId || document.getElementById('agenda-panel').dataset.selectedId;

    if (!targetId) {
        alert("Please select a task from the graph first.");
        return;
    }

    const startInput = document.getElementById('agenda-start-time');
    const endInput = document.getElementById('agenda-end-time');

    if (!startInput.value || !endInput.value) {
        alert("Please set both Start and End times.");
        return;
    }

    // Parse Time Inputs (HH:mm) to Date objects for TODAY
    const now = new Date();
    const [sh, sm] = startInput.value.split(':').map(Number);
    const [eh, em] = endInput.value.split(':').map(Number);

    const startTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), sh, sm);
    let endTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), eh, em);

    // Handle overnight (if end < start, assume tomorrow)
    if (endTime < startTime) {
        endTime.setDate(endTime.getDate() + 1);
    }

    // Validate Duration (min 30 mins)
    const durationMs = endTime - startTime;
    if (durationMs < 30 * 60000) {
        alert("Task duration must be at least 30 minutes.");
        return;
    }

    // Add to Agenda
    agenda.push({
        taskId: targetId,
        start: startTime.toISOString(),
        end: endTime.toISOString()
    });

    // Reset inputs for next task (auto-increment)
    startInput.value = endInput.value;
    const nextEnd = new Date(endTime.getTime() + 30 * 60000);
    endInput.value = nextEnd.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });

    renderAgenda();
    saveToStorage();
    showNotification("Task added to Agenda");
}

function addBreak(durationMinutes) {
    const startInput = document.getElementById('agenda-start-time');
    const now = new Date();
    let startTime = new Date();

    // Always prioritize the visible input for start time
    if (startInput && startInput.value) {
        const [sh, sm] = startInput.value.split(':').map(Number);
        startTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), sh, sm);

        // Smart check: If input time is significantly earlier than now (e.g. > 12 hours), maybe it's tomorrow?
        // For simplified daily agenda, we usually assume today. 
        // However, if the user picks 01:00 and it's 23:00, they might mean tomorrow. 
        // For now, simple "today" logic is safest unless end < start.
    } else {
        // Determine best start time (end of last task or now) if input empty
        if (agenda.length > 0) {
            const maxEnd = agenda.reduce((max, slot) => {
                const e = new Date(slot.end);
                return e > max ? e : max;
            }, new Date(0));
            if (maxEnd > now) startTime = maxEnd;
        }
    }

    const endTime = new Date(startTime.getTime() + durationMinutes * 60000);

    const breakId = 'break_' + Date.now();
    let title = "Break";
    if (durationMinutes === 15) title = "☕ Short Break";
    if (durationMinutes === 30) title = "☕ Medium Break";
    if (durationMinutes === 60) title = "🍽️ Long Break";

    agenda.push({
        taskId: breakId,
        start: startTime.toISOString(),
        end: endTime.toISOString(),
        title: title
    });

    // Update inputs for next item
    if (startInput) startInput.value = endTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
    const endInput = document.getElementById('agenda-end-time');
    if (endInput) {
        const nextEnd = new Date(endTime.getTime() + 30 * 60000);
        endInput.value = nextEnd.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
    }

    renderAgenda();
    saveToStorage();
    showNotification(`Added ${durationMinutes}m Break`);
}

// Expose renderAgendaPanelUI globally if needed via window, but it's called from graph.js so simple function definition works if scopes match. 
// Since all JS is likely concatenated or in global scope, this should be fine.
