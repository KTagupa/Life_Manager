// --- AUDIO ENGINE (Web Audio API) ---
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

let pipCanvas = null;
let pipCtx = null;

function isFloatingWindowActive(video) {
    if (!video) return false;
    const standardPipActive = document.pictureInPictureElement === video;
    const safariPipActive = video.webkitPresentationMode === 'picture-in-picture';
    return standardPipActive || safariPipActive;
}

async function exitFloatingWindow(video) {
    if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
        return;
    }
    if (video && typeof video.webkitSetPresentationMode === 'function' &&
        video.webkitPresentationMode === 'picture-in-picture') {
        video.webkitSetPresentationMode('inline');
    }
}

async function enterFloatingWindow(video) {
    if (!video) throw new Error('PiP video source is missing.');

    if (typeof video.requestPictureInPicture === 'function') {
        await video.requestPictureInPicture();
        return;
    }

    if (video.webkitSupportsPresentationMode &&
        video.webkitSupportsPresentationMode('picture-in-picture') &&
        typeof video.webkitSetPresentationMode === 'function') {
        video.webkitSetPresentationMode('picture-in-picture');
        return;
    }

    throw new Error('Picture-in-Picture is not supported in this browser.');
}

async function toggleFloatingWindow() {
    const video = document.getElementById('pip-stream-source');
    if (!video) {
        console.error('PiP video element not found.');
        return;
    }

    // 1. Exit if already open
    if (isFloatingWindowActive(video)) {
        await exitFloatingWindow(video);
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
        if (typeof pipCanvas.captureStream !== 'function') {
            alert("Float on Screen isn't supported in this Safari version.");
            return;
        }
        video.srcObject = pipCanvas.captureStream(30); // 30fps for smooth timer
    }

    // 6. Request PiP (Safari can use webkit presentation mode instead of the standard API)
    try {
        await video.play();
        await enterFloatingWindow(video);
        updatePipLoop();
    } catch (err) {
        console.error("PiP Denied:", err);
        alert("Float on Screen isn't available right now. Click anywhere in the app, then press 🚀 again.");
    }
}

function updatePipLoop() {
    const video = document.getElementById('pip-stream-source');
    if (!isFloatingWindowActive(video)) return;

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
        const currentTaskId = getAgendaTaskId(currentSlot);
        let scheduledTask = nodes.find(n => n.id === currentTaskId) || archivedNodes.find(n => n.id === currentTaskId);
        // NEW: Check inbox if not found
        if (!scheduledTask && currentTaskId.startsWith('inbox_temp_')) {
            const inboxItem = inbox.find(item => currentTaskId.includes(item.id.split('_')[1]));
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

function getAgendaTaskId(slot) {
    return (slot && typeof slot.taskId === 'string') ? slot.taskId : '';
}

function normalizeAgendaSlot(slot, index = 0) {
    if (!slot || typeof slot !== 'object') return null;
    const startMs = new Date(slot.start).getTime();
    const endMs = new Date(slot.end).getTime();
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return null;

    const title = (typeof slot.title === 'string') ? slot.title.trim() : '';
    let taskId = getAgendaTaskId(slot).trim();
    if (!taskId) {
        const isBreak = /\bbreak\b/i.test(title);
        taskId = `${isBreak ? 'break_ai_' : 'ai_slot_'}${startMs}_${index}`;
    }

    return {
        ...slot,
        taskId,
        start: new Date(startMs).toISOString(),
        end: new Date(endMs).toISOString(),
        ...(title ? { title } : {})
    };
}

function sanitizeAgendaSlots() {
    if (!Array.isArray(agenda)) {
        agenda = [];
        return;
    }

    let changed = false;
    const normalized = [];

    agenda.forEach((slot, index) => {
        const next = normalizeAgendaSlot(slot, index);
        if (!next) {
            changed = true;
            return;
        }
        if (
            slot !== next &&
            (
                slot.taskId !== next.taskId ||
                slot.start !== next.start ||
                slot.end !== next.end ||
                (slot.title || '') !== (next.title || '')
            )
        ) {
            changed = true;
        }
        normalized.push(next);
    });

    if (normalized.length !== agenda.length) changed = true;
    agenda = normalized;
    if (changed && typeof saveToStorage === 'function') saveToStorage();
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

        case 'reminder':
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(880, now);
            osc.frequency.exponentialRampToValueAtTime(1320, now + 0.08);
            osc.frequency.exponentialRampToValueAtTime(990, now + 0.2);
            gain.gain.setValueAtTime(0.18, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.25);
            osc.start(now);
            osc.stop(now + 0.25);
            break;
    }
}

const PLANNER_TAB_STORAGE_KEY = 'urgencyFlow_planner_tab';
const AGENDA_COMPOSER_COLLAPSED_KEY = 'urgencyFlow_agenda_composer_collapsed';

function normalizePlannerTab(tab) {
    const valid = ['agenda', 'calendar', 'heatmap'];
    return valid.includes(tab) ? tab : 'agenda';
}

function getSavedPlannerTab() {
    try {
        return normalizePlannerTab(localStorage.getItem(PLANNER_TAB_STORAGE_KEY) || 'agenda');
    } catch (error) {
        return 'agenda';
    }
}

let currentPlannerTab = getSavedPlannerTab();
let selectedHeatmapDate = null;
let agendaComposerCollapsed = false;

function loadAgendaComposerCollapsedState() {
    try {
        return localStorage.getItem(AGENDA_COMPOSER_COLLAPSED_KEY) === '1';
    } catch (error) {
        return false;
    }
}

function setAgendaComposerCollapsed(collapsed) {
    agendaComposerCollapsed = !!collapsed;
    const agendaTab = document.getElementById('planner-tab-agenda');
    const toggleBtn = document.getElementById('agenda-composer-toggle-btn');

    if (agendaTab) agendaTab.classList.toggle('agenda-composer-collapsed', agendaComposerCollapsed);
    if (toggleBtn) {
        toggleBtn.innerText = agendaComposerCollapsed ? 'Show Composer' : 'Hide Composer';
        toggleBtn.setAttribute('aria-expanded', agendaComposerCollapsed ? 'false' : 'true');
    }

    try {
        localStorage.setItem(AGENDA_COMPOSER_COLLAPSED_KEY, agendaComposerCollapsed ? '1' : '0');
    } catch (error) {
        // no-op
    }
}

function toggleAgendaComposer() {
    setAgendaComposerCollapsed(!agendaComposerCollapsed);
}

agendaComposerCollapsed = loadAgendaComposerCollapsedState();

function setPlannerTab(tab = 'agenda') {
    tab = normalizePlannerTab(tab);
    const panel = document.getElementById('agenda-panel');
    if (!panel) return;

    currentPlannerTab = tab;
    try {
        localStorage.setItem(PLANNER_TAB_STORAGE_KEY, tab);
    } catch (error) {
        console.warn('[schedule] Failed to persist planner tab:', error);
    }

    panel.querySelectorAll('.planner-tab').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.plannerTab === tab);
    });

    const sections = {
        agenda: document.getElementById('planner-tab-agenda'),
        calendar: document.getElementById('calendar-panel'),
        heatmap: document.getElementById('heatmap-overlay')
    };

    Object.entries(sections).forEach(([key, el]) => {
        if (!el) return;
        el.classList.toggle('hidden', key !== tab);
    });

    if (tab === 'agenda') {
        renderAgenda();
        if (typeof renderAgendaPanelUI === 'function') renderAgendaPanelUI();
        setAgendaComposerCollapsed(agendaComposerCollapsed);
    } else if (tab === 'calendar') {
        renderCalendar();
    } else if (tab === 'heatmap') {
        renderHeatmap();
    }
}

function openPlannerTab(tab = 'agenda') {
    const panel = document.getElementById('agenda-panel');
    if (!panel) return;

    if (typeof closeInsightsDashboard === 'function') closeInsightsDashboard();

    if (typeof openRightDockPanel === 'function') {
        openRightDockPanel('agenda-panel', () => {
            setPlannerTab(tab);
        });
    } else {
        panel.classList.remove('hidden');
        setPlannerTab(tab);
    }
}

function toggleHeatmap() {
    const panel = document.getElementById('agenda-panel');
    if (!panel) return;
    if (panel.classList.contains('hidden')) {
        openPlannerTab('heatmap');
        return;
    }
    if (currentPlannerTab === 'heatmap') {
        if (typeof closeRightDockPanel === 'function') closeRightDockPanel('agenda-panel');
        else panel.classList.add('hidden');
    } else {
        setPlannerTab('heatmap');
    }
}

function formatHeatmapDate(dateStr) {
    const [year, month, day] = dateStr.split('-').map(Number);
    if (!year || !month || !day) return dateStr;
    return new Date(year, month - 1, day).toLocaleDateString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric'
    });
}

function updateHeatmapSelectedDay(dateStr, taskTitles = []) {
    const summaryEl = document.getElementById('heatmap-selected-day');
    if (!summaryEl) return;

    document.querySelectorAll('#heatmap-container .day-cell.selected').forEach(cell => {
        cell.classList.remove('selected');
    });

    if (!dateStr) {
        summaryEl.textContent = 'Select a day to view details.';
        return;
    }

    const selectedCell = document.querySelector(`#heatmap-container .day-cell[data-date="${dateStr}"]`);
    if (selectedCell) selectedCell.classList.add('selected');

    const prettyDate = formatHeatmapDate(dateStr);
    if (!taskTitles.length) {
        summaryEl.textContent = `${prettyDate}: no tasks scheduled.`;
        return;
    }

    const preview = taskTitles.slice(0, 3).join(', ');
    const remaining = taskTitles.length - 3;
    summaryEl.textContent = `${prettyDate}: ${taskTitles.length} task${taskTitles.length === 1 ? '' : 's'} - ${preview}${remaining > 0 ? ` +${remaining} more` : ''}`;
}

function changeHeatmapYear(delta) {
    currentHeatmapYear += delta;
    selectedHeatmapDate = null;
    renderHeatmap();
}

function renderHeatmap() {
    const container = document.getElementById('heatmap-container');
    const titleEl = document.getElementById('heatmap-title');
    const yearEl = document.getElementById('heatmap-year-label');
    if (!container || !titleEl) return;

    const year = currentHeatmapYear;
    const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const weekdayLabels = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
    const tasksByDate = {};

    titleEl.textContent = `${year} Heatmap`;
    if (yearEl) yearEl.textContent = String(year);
    container.innerHTML = '';

    [...nodes, ...archivedNodes].forEach(node => {
        if (!node.dueDate) return;
        if (!tasksByDate[node.dueDate]) tasksByDate[node.dueDate] = [];
        tasksByDate[node.dueDate].push(node.title || 'Untitled task');
    });

    months.forEach((monthName, monthIndex) => {
        const monthDiv = document.createElement('div');
        monthDiv.className = 'heatmap-month-container';

        const monthTitle = document.createElement('div');
        monthTitle.className = 'heatmap-month-title';
        monthTitle.textContent = monthName;
        monthDiv.appendChild(monthTitle);

        const weekdayRow = document.createElement('div');
        weekdayRow.className = 'heatmap-weekday-row';
        weekdayLabels.forEach(label => {
            const dayLabel = document.createElement('div');
            dayLabel.className = 'heatmap-weekday';
            dayLabel.textContent = label;
            weekdayRow.appendChild(dayLabel);
        });
        monthDiv.appendChild(weekdayRow);

        const grid = document.createElement('div');
        grid.className = 'heatmap-month-grid';

        const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
        const firstDayDow = new Date(year, monthIndex, 1).getDay();

        for (let i = 0; i < firstDayDow; i++) {
            const emptyCell = document.createElement('div');
            emptyCell.className = 'day-cell day-cell-empty';
            emptyCell.setAttribute('aria-hidden', 'true');
            grid.appendChild(emptyCell);
        }

        for (let day = 1; day <= daysInMonth; day++) {
            const dateStr = `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const taskTitles = tasksByDate[dateStr] || [];
            const count = taskTitles.length;

            const cell = document.createElement('div');
            cell.className = 'day-cell level-0';
            cell.dataset.date = dateStr;
            cell.textContent = String(day);
            cell.tabIndex = 0;

            const level = Math.min(count, 5);
            if (count > 0) {
                cell.classList.add('active', `level-${level}`);
                const tip = document.createElement('div');
                tip.className = 'day-tooltip';
                tip.textContent = `${count} task${count === 1 ? '' : 's'}: ${taskTitles.join(', ')}`;
                cell.appendChild(tip);
            }

            cell.onclick = () => {
                selectedHeatmapDate = dateStr;
                updateHeatmapSelectedDay(dateStr, taskTitles);
            };

            cell.onkeydown = (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    selectedHeatmapDate = dateStr;
                    updateHeatmapSelectedDay(dateStr, taskTitles);
                }
            };

            grid.appendChild(cell);
        }

        monthDiv.appendChild(grid);
        container.appendChild(monthDiv);
    });

    const activeDatesInYear = Object.keys(tasksByDate)
        .filter(dateStr => dateStr.startsWith(`${year}-`))
        .sort();

    if (selectedHeatmapDate && selectedHeatmapDate.startsWith(`${year}-`)) {
        updateHeatmapSelectedDay(selectedHeatmapDate, tasksByDate[selectedHeatmapDate] || []);
    } else if (activeDatesInYear.length) {
        selectedHeatmapDate = activeDatesInYear[0];
        updateHeatmapSelectedDay(selectedHeatmapDate, tasksByDate[selectedHeatmapDate] || []);
    } else {
        selectedHeatmapDate = null;
        updateHeatmapSelectedDay(null);
    }
}

// findGoalName() and getGoalPath() are now in utils.js

// --- CALENDAR LOGIC ---
let calendarView = 'day'; // day, week, month
let calendarDate = new Date();
const CALENDAR_WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function toggleCalendar() {
    const plannerPanel = document.getElementById('agenda-panel');
    if (!plannerPanel) return;
    if (plannerPanel.classList.contains('hidden')) {
        openPlannerTab('calendar');
        return;
    }
    if (currentPlannerTab === 'calendar') {
        if (typeof closeRightDockPanel === 'function') closeRightDockPanel('agenda-panel');
        else plannerPanel.classList.add('hidden');
    } else {
        setPlannerTab('calendar');
    }
}

function setCalView(view) {
    const validViews = ['day', 'week', 'month'];
    calendarView = validViews.includes(view) ? view : 'day';
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
    const weekdayHeader = document.getElementById('cal-weekday-header');
    if (!container || !title) return;

    container.innerHTML = '';
    if (weekdayHeader) {
        weekdayHeader.innerHTML = '';
        weekdayHeader.classList.add('hidden');
    }

    document.querySelectorAll('#calendar-panel .planner-subtab').forEach(button => {
        button.classList.toggle('active', button.dataset.calView === calendarView);
    });

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
                const titleNode = document.createElement('div');
                titleNode.className = 'cal-event-title';
                titleNode.innerText = log.title;
                el.appendChild(titleNode);

                const timeNode = document.createElement('div');
                timeNode.className = 'cal-event-time';
                timeNode.innerText = `${ls.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - ${le.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
                el.appendChild(timeNode);
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
                    blk.className = `cal-week-event${log.active ? ' active' : ''}`;
                    blk.style.top = topPct + '%';
                    blk.style.height = Math.max(hPct, 1) + '%'; // Min 1% height
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
        if (weekdayHeader) {
            CALENDAR_WEEKDAYS.forEach(dayName => {
                const chip = document.createElement('div');
                chip.className = 'cal-weekday-chip';
                chip.innerText = dayName;
                weekdayHeader.appendChild(chip);
            });
            weekdayHeader.classList.remove('hidden');
        }

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
                txt.className = 'cal-month-hours';
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
    const hasRunningHabit = habits.some(h => {
        const archived = typeof isHabitArchived === 'function'
            ? isHabitArchived(h)
            : (Number(h && h.archivedAt) > 0);
        return !archived && h.activeTimerStart;
    });
    if (hasRunningHabit && !document.getElementById('habits-panel').classList.contains('hidden')) {
        renderHabits();

        // Update navigator pinned tab if it has running timers
        const navigatorPanel = document.getElementById('navigator-panel');
        const pinnedTabOpen = navigatorPanel &&
            !navigatorPanel.classList.contains('hidden') &&
            typeof currentNavigatorTab !== 'undefined' &&
            currentNavigatorTab === 'pinned';
        if (pinnedTabOpen) {
            const hasRunningInPinned = pinnedItems.some(p => {
                if (p.type === 'habit') {
                    const h = habits.find(habit => {
                        const archived = typeof isHabitArchived === 'function'
                            ? isHabitArchived(habit)
                            : (Number(habit && habit.archivedAt) > 0);
                        return habit.id === p.id && !archived;
                    });
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
    const countdownEl = document.getElementById('hud-upcoming-countdown');
    if (!hud || !doingRow || !shouldRow || !upcomingRow || !habitRow || !countdownEl) return;

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

    const currentSlotId = currentSlot ? getAgendaTaskId(currentSlot) : null;

    if (currentSlotId !== lastKnownAgendaTaskId) {
        if (currentSlotId) {
            playAudioFeedback('agenda-start');
        } else if (lastKnownAgendaTaskId) {
            playAudioFeedback('agenda-stop');
        }
        lastKnownAgendaTaskId = currentSlotId;
    }

    let hudActive = false;
    doingRow.classList.remove('overtime');
    upcomingRow.classList.remove('soon', 'imminent');

    // --- Render "Doing" Row ---
    if (activeTask) {
        hudActive = true;
        doingRow.style.display = 'flex';
        document.getElementById('hud-doing-title').innerText = activeTask.title;
        document.getElementById('hud-doing-time').innerText = formatTime(getTotalTime(activeTask));
        hud.dataset.doingTaskId = activeTask.id;

        if (currentSlot && activeTask.id !== getAgendaTaskId(currentSlot)) doingRow.classList.add('overtime');
    } else {
        doingRow.style.display = 'none';
    }

    // --- Render "Should Be" Row ---
    if (currentSlot && (!activeTask || activeTask.id !== getAgendaTaskId(currentSlot))) {
        hudActive = true;
        shouldRow.style.display = 'flex';
        const currentTaskId = getAgendaTaskId(currentSlot);
        let scheduledTask = nodes.find(n => n.id === currentTaskId) || archivedNodes.find(n => n.id === currentTaskId);
        // NEW: Check inbox if not found
        if (!scheduledTask && currentTaskId.startsWith('inbox_temp_')) {
            const inboxItem = inbox.find(item => currentTaskId.includes(item.id.split('_')[1]));
            if (inboxItem) scheduledTask = { title: inboxItem.title + ' (Inbox)' };
        }
        document.getElementById('hud-should-title').innerText = scheduledTask ? scheduledTask.title : "Unscheduled Block";

        const startStr = new Date(currentSlot.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const endStr = new Date(currentSlot.end).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        document.getElementById('hud-should-interval').innerText = `${startStr} - ${endStr}`;

        hud.dataset.shouldTaskId = currentTaskId || '';
    } else {
        shouldRow.style.display = 'none';
    }

    // --- NEW: Render "Upcoming" Row ---
    if (upcomingSlot) {
        hudActive = true;
        upcomingRow.style.display = 'flex';

        const upcomingTaskId = getAgendaTaskId(upcomingSlot);
        let upcomingTask = nodes.find(n => n.id === upcomingTaskId) || archivedNodes.find(n => n.id === upcomingTaskId);
        // NEW: Check inbox if not found
        if (!upcomingTask && upcomingTaskId.startsWith('inbox_temp_')) {
            const inboxItem = inbox.find(item => upcomingTaskId.includes(item.id.split('_')[1]));
            if (inboxItem) upcomingTask = { title: inboxItem.title + ' (Inbox)' };
        }
        document.getElementById('hud-upcoming-title').innerText = upcomingTask ? upcomingTask.title : "Unscheduled Block";

        // Calculate minutes until start
        const startTime = new Date(upcomingSlot.start).getTime();
        const minutesUntil = Math.max(0, Math.round((startTime - now) / 60000));

        if (minutesUntil < 1) {
            countdownEl.innerText = 'in <1m';
        } else if (minutesUntil < 60) {
            countdownEl.innerText = `in ${minutesUntil}m`;
        } else {
            const hours = Math.floor(minutesUntil / 60);
            const mins = minutesUntil % 60;
            countdownEl.innerText = `in ${hours}h ${mins}m`;
        }

        if (minutesUntil <= 10) upcomingRow.classList.add('imminent');
        else if (minutesUntil <= 30) upcomingRow.classList.add('soon');

        const startStr = new Date(upcomingSlot.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const endStr = new Date(upcomingSlot.end).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        document.getElementById('hud-upcoming-interval').innerText = `${startStr} - ${endStr}`;

        hud.dataset.upcomingTaskId = upcomingTaskId || '';
    } else {
        upcomingRow.style.display = 'none';
        countdownEl.innerText = 'in 30m';
    }

    // --- Render Habit Row ---
    const activeHabit = habits.find(h => {
        const archived = typeof isHabitArchived === 'function'
            ? isHabitArchived(h)
            : (Number(h && h.archivedAt) > 0);
        return !archived && h.activeTimerStart;
    });
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
    if (!panel) return;
    if (panel.classList.contains('hidden')) {
        openPlannerTab('agenda');
    } else {
        if (currentPlannerTab === 'agenda') {
            if (typeof closeRightDockPanel === 'function') closeRightDockPanel('agenda-panel');
            else panel.classList.add('hidden');
        } else {
            setPlannerTab('agenda');
        }
    }
}

function renderAgenda() {
    const container = document.getElementById('agenda-list-container');
    if (!container) return;
    sanitizeAgendaSlots();
    document.getElementById('agenda-date-display').innerText = new Date().toLocaleDateString();
    container.innerHTML = '';
    if (agenda.length === 0) {
        container.innerHTML = '<div class="agenda-empty-state">No agenda set.</div>';
        return;
    }

    // Sort by start time
    agenda.sort((a, b) => new Date(a.start) - new Date(b.start));

    const now = Date.now();
    agenda.forEach((slot, index) => {
        const taskId = getAgendaTaskId(slot);
        let task = nodes.find(n => n.id === taskId) || archivedNodes.find(n => n.id === taskId);
        let isDeleted = false;
        let isInbox = false;
        let isBreak = taskId.startsWith('break_');

        if (!task && taskId.startsWith('inbox_temp_')) {
            const originalInboxId = taskId.replace('inbox_temp_', 'inbox_');
            const inboxItem = inbox.find(item => item.id === originalInboxId);
            if (inboxItem) {
                task = { id: taskId, title: inboxItem.title + ' (Inbox)', isInboxItem: true };
                isInbox = true;
            }
        }

        // AI sometimes provides a title or uses the taskId as a title for breaks
        if (!task) {
            if (isBreak) {
                task = { title: slot.title || "Break", phantom: true };
            } else {
                const displayTitle = slot.title || (taskId && taskId.length > 15 ? "Untitled Task" : taskId) || "Deleted Task";
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
                        ${(!isDeleted && !task.phantom && !isBreak) ? `<button class="btn" style="padding:2px 5px; font-size:10px" onclick="jumpToTask('${taskId}')">🎯 View</button>` : ''}
                        <button class="btn btn-danger" style="padding:2px 5px; font-size:10px" onclick="deleteAgendaSlot(${index})">✕</button>
                    </div>
                </div>
            `;
        container.appendChild(el);
    });
}

function clearCompletedAgendaSlots() {
    sanitizeAgendaSlots();
    const initialCount = agenda.length;
    const now = Date.now();
    agenda = agenda.filter(slot => {
        const taskId = getAgendaTaskId(slot);
        const task = nodes.find(n => n.id === taskId) || archivedNodes.find(n => n.id === taskId);
        const end = new Date(slot.end).getTime();

        // Keep if:
        // 1. Task exists and is NOT completed
        // 2. OR it's a break/phantom and it hasn't ended yet
        // 3. OR it's a break/phantom and user explicitly wants to keep history (but here we clear "done")

        if (taskId.startsWith('break_')) {
            return end > now; // Remove past breaks
        }

        return (!task || !task.completed) && end > now; // Also clear past time slots even if task not checked? Maybe just check status.
        // User said "Clear Done". Usually implies checked tasks. 
        // Let's stick to: Remove if task completed OR if it's a break that is over.
    });

    // Re-run filter for strict "Task Completed" check
    agenda = agenda.filter(slot => {
        const taskId = getAgendaTaskId(slot);
        const task = nodes.find(n => n.id === taskId) || archivedNodes.find(n => n.id === taskId);
        if (taskId.startsWith('break_')) return new Date(slot.end).getTime() > now;
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

    if (titleEl && container && panel) {
        if (selectedNodeId) {
            const node = nodes.find(n => n.id === selectedNodeId) || archivedNodes.find(n => n.id === selectedNodeId);
            if (node) {
                titleEl.innerText = node.title;
                titleEl.style.fontStyle = 'normal';
                titleEl.style.color = 'var(--text-main)';
                container.style.borderLeftColor = 'var(--accent)';
                // Store ID in DOM for persistence
                panel.dataset.selectedId = selectedNodeId;
            }
        } else {
            titleEl.innerText = "(Select a task on the graph)";
            titleEl.style.fontStyle = 'italic';
            titleEl.style.color = '#94a3b8';
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
