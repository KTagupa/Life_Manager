(function (global) {
    'use strict';

    const Core = global.WorkoutCore;
    const Store = global.WorkoutStore;
    const WEEKDAYS = Core ? Core.WEEKDAYS : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    const state = {
        workouts: [],
        rotations: [],
        routines: [],
        sessions: [],
        activeTab: 'today',
        activeSession: null,
        editingWorkoutId: null,
        editingRotationId: null,
        routineDraft: {
            id: null,
            name: '',
            steps: []
        }
    };

    let clockInterval = null;
    let toastTimer = null;

    function byId(id) {
        return document.getElementById(id);
    }

    function escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function notify(message) {
        const toast = byId('workout-app-toast');
        if (!toast) return;
        toast.textContent = message;
        toast.classList.add('visible');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => toast.classList.remove('visible'), 2600);
    }

    function todayKey() {
        return Core.dateKey(new Date());
    }

    function formatDateLabel(key) {
        const date = Core.parseDateKey(key) || new Date();
        return date.toLocaleDateString(undefined, {
            weekday: 'short',
            month: 'short',
            day: 'numeric'
        });
    }

    function formatTime(ms) {
        const safeSeconds = Math.max(0, Math.floor(Number(ms) / 1000));
        const minutes = Math.floor(safeSeconds / 60);
        const seconds = safeSeconds % 60;
        return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }

    function getElapsedMs(session = state.activeSession) {
        if (!session) return 0;
        const end = session.paused ? Number(session.pauseStartedAt) || Date.now() : Date.now();
        const elapsed = end - Number(session.startedAt || end) - Number(session.pausedMs || 0);
        return Math.max(0, elapsed);
    }

    function updateSessionClock() {
        const clock = byId('active-session-clock');
        if (clock) clock.textContent = formatTime(getElapsedMs());
    }

    function getWorkout(workoutId) {
        return state.workouts.find(workout => workout && workout.id === workoutId) || null;
    }

    function getRoutine(routineId) {
        return state.routines.find(routine => routine && routine.id === routineId) || null;
    }

    function getRotation(rotationId) {
        return state.rotations.find(rotation => rotation && rotation.id === rotationId) || null;
    }

    function getLevel(workout, levelId) {
        if (!workout) return null;
        return workout.levels.find(level => level.id === levelId) || workout.levels[0] || null;
    }

    function getPolicy(workout) {
        return Core.normalizeProgressionPolicy(workout && workout.progressionPolicy);
    }

    function getScheduleLabel(workout) {
        return Core.getScheduleLabel(workout);
    }

    function getRotationScheduleLabel(rotation) {
        const normalized = Core.normalizeRotation(rotation, state.workouts.map(workout => workout.id));
        const days = normalized.schedule.weekdays.map(day => WEEKDAYS[day]).join(', ');
        const time = normalized.schedule.time ? ` at ${normalized.schedule.time}` : '';
        const duration = Number(normalized.schedule.durationMinutes) > 0 ? ` / ${normalized.schedule.durationMinutes}m` : '';
        return `${days}${time}${duration}`;
    }

    function getRotationResolution(rotation) {
        return Core.resolveRotationWorkout(rotation, state.workouts);
    }

    function getScheduledRotationItems(date = new Date()) {
        return state.rotations
            .filter(rotation => Core.isRotationScheduledOnDate(rotation, date))
            .map(rotation => {
                const resolution = getRotationResolution(rotation);
                return resolution && resolution.workout ? {
                    type: 'rotation',
                    rotation: resolution.rotation,
                    workout: resolution.workout,
                    resolution
                } : null;
            })
            .filter(Boolean);
    }

    function getRotationIdsForWorkout(workoutId) {
        return state.rotations.filter(rotation => rotation.workoutIds.includes(workoutId));
    }

    function getRotationAttemptedToday(rotation, key = todayKey()) {
        if (!rotation) return false;
        return state.workouts.some(workout => (workout.logs || []).some(log => {
            if (log.scheduledDateKey !== key) return false;
            if (log.rotationId && log.rotationId === rotation.id) return true;
            return !log.rotationId && rotation.history.some(event => event.dateKey === key && event.workoutId === workout.id);
        }));
    }

    function getStepWorkout(step) {
        return step && step.type === 'workout' ? getWorkout(step.workoutId) : null;
    }

    function normalizeLocalState() {
        state.workouts = Core.normalizeWorkoutCollection(state.workouts);
        state.workouts.forEach(workout => Core.applyPendingProgression(workout, todayKey()));
        state.rotations = Core.normalizeRotationCollection(state.rotations, state.workouts);
        state.routines = Core.normalizeRoutineCollection(state.routines);
        state.sessions = Core.normalizeSessionCollection(state.sessions);
    }

    async function persistWorkoutState(message) {
        normalizeLocalState();
        await Store.saveWorkoutState({
            workouts: state.workouts,
            workoutRotations: state.rotations,
            workoutRoutines: state.routines,
            workoutSessions: state.sessions
        });
        if (message) notify(message);
        render();
    }

    async function loadState() {
        const loaded = await Store.loadWorkoutState();
        state.workouts = Core.normalizeWorkoutCollection(loaded.workouts);
        state.workouts.forEach(workout => Core.applyPendingProgression(workout, todayKey()));
        state.rotations = Core.normalizeRotationCollection(loaded.workoutRotations, state.workouts);
        state.routines = Core.normalizeRoutineCollection(loaded.workoutRoutines);
        state.sessions = Core.normalizeSessionCollection(loaded.workoutSessions);
    }

    function setTab(tab) {
        const allowed = ['today', 'session', 'routines', 'library', 'progress'];
        state.activeTab = allowed.includes(tab) ? tab : 'today';
        render();
        const view = byId('workout-app-view');
        if (view) view.focus({ preventScroll: true });
    }

    function render() {
        const view = byId('workout-app-view');
        if (!view) return;
        document.querySelectorAll('.workout-app-tab').forEach(button => {
            button.classList.toggle('active', button.dataset.tab === state.activeTab);
        });
        const todayLabel = byId('workout-app-today-label');
        if (todayLabel) todayLabel.textContent = formatDateLabel(todayKey());

        if (!Core || !Store) {
            view.innerHTML = '<div class="workout-empty">Workout modules did not load.</div>';
            return;
        }

        if (state.activeTab === 'session') view.innerHTML = renderSession();
        else if (state.activeTab === 'routines') view.innerHTML = renderRoutines();
        else if (state.activeTab === 'library') view.innerHTML = renderLibrary();
        else if (state.activeTab === 'progress') view.innerHTML = renderProgress();
        else view.innerHTML = renderToday();
        updateSessionClock();
    }

    function renderPageHead(title, subtitle, actions = '') {
        return `
            <div class="workout-page-head">
                <div>
                    <h1>${escapeHtml(title)}</h1>
                    <p>${escapeHtml(subtitle)}</p>
                </div>
                ${actions ? `<div class="workout-page-actions">${actions}</div>` : ''}
            </div>
        `;
    }

    function getTodayMetrics() {
        const key = todayKey();
        const rotationItems = getScheduledRotationItems(new Date());
        const rotationMemberIds = new Set(rotationItems.flatMap(item => item.rotation.workoutIds));
        const directItems = state.workouts
            .filter(workout => Core.isScheduledOnDate(workout, new Date()) && !rotationMemberIds.has(workout.id))
            .map(workout => ({ type: 'movement', workout }));
        const scheduled = [...rotationItems, ...directItems];
        const completed = scheduled.filter(item => {
            if (item.type === 'rotation') return getRotationAttemptedToday(item.rotation, key);
            return Core.getDayMetrics(item.workout, key).completed;
        });
        const logged = state.workouts.filter(workout => Core.getDayMetrics(workout, key).levelLogs.length > 0);
        return { key, scheduled, completed, logged };
    }

    function renderToday() {
        const metrics = getTodayMetrics();
        const recentRoutines = state.routines
            .slice()
            .sort((a, b) => Number(b.updatedAt) - Number(a.updatedAt))
            .slice(0, 5);
        const todayActions = `
            <button type="button" class="workout-btn primary workout-large-btn" onclick="WorkoutApp.startScheduledSession()">Start Scheduled</button>
            <button type="button" class="workout-btn workout-large-btn" onclick="WorkoutApp.startAllSession()">Start Ad Hoc</button>
        `;
        const movementRows = metrics.scheduled.length
            ? metrics.scheduled.map(renderTodayMovementCard).join('')
            : '<div class="workout-empty">No movements are scheduled for today.</div>';
        const routineRows = recentRoutines.length
            ? recentRoutines.map(renderRoutineMiniCard).join('')
            : '<div class="workout-empty">No routines yet.</div>';

        return `
            ${renderPageHead('Today', 'Scheduled movements, fast logs, and one-tap starts for the current training day.', todayActions)}
            <div class="workout-stat-grid">
                <div class="workout-stat"><span>Scheduled</span><strong>${metrics.scheduled.length}</strong></div>
                <div class="workout-stat"><span>Completed</span><strong>${metrics.completed.length}</strong></div>
                <div class="workout-stat"><span>Logged</span><strong>${metrics.logged.length}</strong></div>
                <div class="workout-stat"><span>Sessions</span><strong>${state.sessions.length}</strong></div>
            </div>
            <div class="workout-two-col">
                <section class="workout-panel">
                    <h2 class="workout-section-title">Scheduled Movements</h2>
                    <div class="workout-grid">${movementRows}</div>
                </section>
                <section class="workout-panel">
                    <h2 class="workout-section-title">Recent Routines</h2>
                    <div class="workout-grid">${routineRows}</div>
                </section>
            </div>
        `;
    }

    function renderTodayMovementCard(item) {
        const workout = item.workout || item;
        const rotation = item.type === 'rotation' ? item.rotation : null;
        const resolution = item.resolution || null;
        const metrics = Core.getDayMetrics(workout, todayKey());
        const policy = getPolicy(workout);
        const level = getLevel(workout, workout.currentLevelId);
        const percent = Math.min(100, Math.round((metrics.qualifyingSets / Math.max(1, metrics.requiredSets)) * 100));
        const scheduleText = rotation
            ? `${rotation.name} / ${getRotationScheduleLabel(rotation)}`
            : getScheduleLabel(workout);
        const balanceText = rotation && resolution && !resolution.balanced
            ? 'Level catch-up rotation'
            : rotation
                ? 'Alternating rotation'
                : '';
        return `
            <article class="workout-card">
                <div class="workout-card-head">
                    <div>
                        <h3 class="workout-card-title">${escapeHtml(workout.name)}</h3>
                        <div class="workout-meta">${escapeHtml(scheduleText)}${balanceText ? ` / ${escapeHtml(balanceText)}` : ''}</div>
                    </div>
                    <div class="workout-card-actions">
                        <button type="button" class="workout-btn primary" onclick="${rotation ? `WorkoutApp.startRotationSession('${escapeHtml(rotation.id)}')` : `WorkoutApp.startWorkoutSession('${escapeHtml(workout.id)}')`}">Start</button>
                        <button type="button" class="workout-btn" onclick="WorkoutApp.editMovement('${escapeHtml(workout.id)}')">Edit</button>
                    </div>
                </div>
                <div class="workout-pill-row">
                    <div class="workout-pill"><span>Level</span><strong>${escapeHtml(level ? level.name : 'Level')}</strong></div>
                    <div class="workout-pill"><span>Target</span><strong>${metrics.targetReps} reps</strong></div>
                    <div class="workout-pill"><span>Today</span><strong>${metrics.qualifyingSets}/${metrics.requiredSets}</strong></div>
                </div>
                <div class="workout-progress-track"><div class="workout-progress-fill" style="width:${percent}%"></div></div>
                <div class="workout-action-row" style="margin-top:14px">
                    <button type="button" class="workout-btn blue" onclick="WorkoutApp.quickLogMovement('${escapeHtml(workout.id)}', ${policy.normalSetReps}, '${escapeHtml(rotation ? rotation.id : '')}')">+${policy.normalSetReps}</button>
                    <button type="button" class="workout-btn" onclick="WorkoutApp.quickLogMovement('${escapeHtml(workout.id)}', ${metrics.targetReps}, '${escapeHtml(rotation ? rotation.id : '')}')">Target Set</button>
                    <button type="button" class="workout-btn warning" onclick="WorkoutApp.quickLogMovement('${escapeHtml(workout.id)}', ${policy.advancedSetReps}, '${escapeHtml(rotation ? rotation.id : '')}')">+${policy.advancedSetReps}</button>
                </div>
            </article>
        `;
    }

    function renderRoutineMiniCard(routine) {
        const workoutSteps = routine.steps.filter(step => step.type === 'workout').length;
        const restSteps = routine.steps.filter(step => step.type === 'rest').length;
        return `
            <article class="workout-card">
                <div class="workout-card-head">
                    <div>
                        <h3 class="workout-card-title">${escapeHtml(routine.name)}</h3>
                        <div class="workout-meta">${workoutSteps} movement${workoutSteps === 1 ? '' : 's'} / ${restSteps} rest step${restSteps === 1 ? '' : 's'}</div>
                    </div>
                    <div class="workout-card-actions">
                        <button type="button" class="workout-btn primary" onclick="WorkoutApp.startRoutineSession('${escapeHtml(routine.id)}')">Start</button>
                        <button type="button" class="workout-btn" onclick="WorkoutApp.editRoutine('${escapeHtml(routine.id)}')">Edit</button>
                    </div>
                </div>
            </article>
        `;
    }

    function renderSession() {
        if (!state.activeSession) return renderSessionStarter();
        const session = state.activeSession;
        const step = session.steps[session.currentStepIndex] || session.steps[0] || null;
        const entryCount = session.entries.length;
        const setCount = step && step.type === 'workout'
            ? session.entries.filter(entry => entry.workoutId === step.workoutId).length
            : 0;
        const pauseLabel = session.paused ? 'Resume' : 'Pause';

        return `
            <div class="workout-session-shell">
                <div class="workout-session-banner">
                    <div>
                        <h1>${escapeHtml(session.name)}</h1>
                        <span>${entryCount} logged set${entryCount === 1 ? '' : 's'} / step ${session.currentStepIndex + 1} of ${session.steps.length}</span>
                    </div>
                    <div id="active-session-clock" class="workout-session-clock">00:00</div>
                    <div class="workout-inline-actions">
                        <button type="button" class="workout-btn" onclick="WorkoutApp.togglePauseSession()">${pauseLabel}</button>
                        <button type="button" class="workout-btn primary" onclick="WorkoutApp.saveActiveSession()">Save</button>
                        <button type="button" class="workout-btn danger" onclick="WorkoutApp.discardSession()">Discard</button>
                    </div>
                </div>
                ${step ? renderActiveStep(step, setCount) : '<div class="workout-empty">This session has no steps.</div>'}
                <section class="workout-panel">
                    <h2 class="workout-section-title">Session Log</h2>
                    <div class="workout-recent-list">${renderSessionEntries(session.entries)}</div>
                </section>
            </div>
        `;
    }

    function renderSessionStarter() {
        const metrics = getTodayMetrics();
        const startActions = `
            <button type="button" class="workout-btn primary workout-large-btn" onclick="WorkoutApp.startScheduledSession()">Start Scheduled</button>
            <button type="button" class="workout-btn workout-large-btn" onclick="WorkoutApp.startAllSession()">Start All</button>
        `;
        const scheduledRows = metrics.scheduled.length
            ? metrics.scheduled.map(item => {
                const workout = item.workout;
                const rotation = item.type === 'rotation' ? item.rotation : null;
                return `
                <div class="workout-recent-row">
                    <div>
                        <strong>${escapeHtml(workout.name)}</strong>
                        <div class="workout-meta">${escapeHtml(rotation ? `${rotation.name} / ${getRotationScheduleLabel(rotation)}` : getScheduleLabel(workout))}</div>
                    </div>
                    <button type="button" class="workout-btn primary" onclick="${rotation ? `WorkoutApp.startRotationSession('${escapeHtml(rotation.id)}')` : `WorkoutApp.startWorkoutSession('${escapeHtml(workout.id)}')`}">Start</button>
                </div>
            `;
            }).join('')
            : '<div class="workout-empty">Create a movement in Library to start logging.</div>';
        const movementRows = state.workouts.length
            ? state.workouts.map(workout => `
                <div class="workout-recent-row">
                    <div>
                        <strong>${escapeHtml(workout.name)}</strong>
                        <div class="workout-meta">${escapeHtml(getScheduleLabel(workout))}</div>
                    </div>
                    <button type="button" class="workout-btn primary" onclick="WorkoutApp.startWorkoutSession('${escapeHtml(workout.id)}')">Start</button>
                </div>
            `).join('')
            : '<div class="workout-empty">Create a movement in Library to start logging.</div>';
        const routineRows = state.routines.length
            ? state.routines.map(routine => `
                <div class="workout-recent-row">
                    <div>
                        <strong>${escapeHtml(routine.name)}</strong>
                        <div class="workout-meta">${routine.steps.length} step${routine.steps.length === 1 ? '' : 's'}</div>
                    </div>
                    <button type="button" class="workout-btn primary" onclick="WorkoutApp.startRoutineSession('${escapeHtml(routine.id)}')">Start</button>
                </div>
            `).join('')
            : '<div class="workout-empty">No routines yet.</div>';

        return `
            ${renderPageHead('Session', `${metrics.scheduled.length} scheduled movement${metrics.scheduled.length === 1 ? '' : 's'} today.`, startActions)}
            <div class="workout-two-col">
                <section class="workout-panel">
                    <h2 class="workout-section-title">Scheduled</h2>
                    <div class="workout-recent-list">${scheduledRows}</div>
                </section>
                <section class="workout-panel">
                    <h2 class="workout-section-title">Ad Hoc Movements</h2>
                    <div class="workout-recent-list">${movementRows}</div>
                </section>
                <section class="workout-panel">
                    <h2 class="workout-section-title">Routines</h2>
                    <div class="workout-recent-list">${routineRows}</div>
                </section>
            </div>
        `;
    }

    function renderActiveStep(step, setCount) {
        if (step.type === 'rest') {
            return `
                <section class="workout-step-card">
                    <div>
                        <span class="workout-kicker">Rest</span>
                        <h2>${Math.round(Number(step.durationSeconds) || Core.ROUTINE_DEFAULT_REST_SECONDS)} seconds</h2>
                        <div class="workout-meta">${escapeHtml(step.notes || 'Breathe, reset, and move when ready.')}</div>
                    </div>
                    <div class="workout-inline-actions">
                        <button type="button" class="workout-btn" onclick="WorkoutApp.previousStep()">Back</button>
                        <button type="button" class="workout-btn primary workout-large-btn" onclick="WorkoutApp.nextStep()">Next</button>
                    </div>
                </section>
            `;
        }

        const workout = getStepWorkout(step);
        const targetReps = Math.max(1, Math.round(Number(step.targetReps) || (workout ? workout.targetReps : Core.NORMAL_SET_REPS)));
        const targetSets = Math.max(1, Math.round(Number(step.targetSets) || (workout ? getPolicy(workout).requiredSets : Core.REQUIRED_SETS)));
        const level = workout ? getLevel(workout, workout.currentLevelId) : null;
        const rotationText = step.rotationName ? ` / ${step.rotationName}` : '';
        return `
            <section class="workout-step-card">
                <div>
                    <span class="workout-kicker">Movement</span>
                    <h2>${escapeHtml(workout ? workout.name : 'Missing movement')}</h2>
                    <div class="workout-meta">${escapeHtml(level ? level.name : 'Level')}${escapeHtml(rotationText)} / ${setCount}/${targetSets} sets / target ${targetReps} reps</div>
                </div>
                <div class="workout-session-reps">
                    <input type="number" id="session-reps-input" min="1" value="${targetReps}" aria-label="Reps">
                    <button type="button" class="workout-btn blue" onclick="WorkoutApp.addSessionSet(${Math.max(1, targetReps - 10)})">${Math.max(1, targetReps - 10)}</button>
                    <button type="button" class="workout-btn blue" onclick="WorkoutApp.addSessionSet(${targetReps})">${targetReps}</button>
                    <button type="button" class="workout-btn warning" onclick="WorkoutApp.addSessionSet(${workout ? getPolicy(workout).advancedSetReps : Core.ADVANCED_SET_REPS})">${workout ? getPolicy(workout).advancedSetReps : Core.ADVANCED_SET_REPS}</button>
                    <button type="button" class="workout-btn primary" onclick="WorkoutApp.addSessionSet()">Add Set</button>
                </div>
                <div class="workout-inline-actions">
                    <button type="button" class="workout-btn" onclick="WorkoutApp.previousStep()">Back</button>
                    <button type="button" class="workout-btn primary workout-large-btn" onclick="WorkoutApp.nextStep()">Next</button>
                </div>
            </section>
        `;
    }

    function renderSessionEntries(entries) {
        if (!entries.length) return '<div class="workout-empty">Sets will appear here as you log them.</div>';
        return entries
            .slice()
            .reverse()
            .map(entry => `
                <div class="workout-session-entry-row">
                    <div>
                        <strong>${escapeHtml(entry.workoutName || 'Movement')}</strong>
                        <div class="workout-meta">${escapeHtml(entry.levelName || 'Level')}${entry.rotationName ? ` / ${escapeHtml(entry.rotationName)}` : ''} / target ${entry.targetRepsAtLog}</div>
                    </div>
                    <strong>${entry.reps} reps</strong>
                </div>
            `).join('');
    }

    function buildWorkoutStep(workout, overrides = {}) {
        const policy = getPolicy(workout);
        const level = getLevel(workout, workout.currentLevelId);
        return {
            id: Core.createId('session_step'),
            type: 'workout',
            workoutId: workout.id,
            workoutName: workout.name,
            levelId: workout.currentLevelId,
            levelName: level ? level.name : '',
            rotationId: String(overrides.rotationId || '').trim(),
            rotationName: String(overrides.rotationName || '').trim(),
            scheduledForProgression: overrides.scheduledForProgression === true,
            targetReps: Math.max(1, Math.round(Number(overrides.targetReps) || Number(workout.targetReps) || policy.normalSetReps)),
            targetSets: Math.max(1, Math.round(Number(overrides.targetSets) || policy.requiredSets)),
            durationSeconds: Math.max(5, Math.round(Number(overrides.durationSeconds) || Core.ROUTINE_DEFAULT_WORK_SECONDS)),
            notes: overrides.notes || ''
        };
    }

    function beginSession(name, steps, routine = null, meta = {}) {
        if (!steps.length) {
            notify('Add at least one movement before starting.');
            return;
        }
        state.activeSession = {
            id: Core.createId('workout_session'),
            name,
            routineId: routine ? routine.id : '',
            routineName: routine ? routine.name : '',
            rotationId: String(meta.rotationId || '').trim(),
            rotationName: String(meta.rotationName || '').trim(),
            startedAt: Date.now(),
            paused: false,
            pausedMs: 0,
            pauseStartedAt: null,
            currentStepIndex: 0,
            steps,
            entries: []
        };
        state.activeTab = 'session';
        render();
    }

    function startScheduledSession() {
        const metrics = getTodayMetrics();
        beginSession('Scheduled Workout', metrics.scheduled.map(item => {
            const workout = item.workout;
            const rotation = item.type === 'rotation' ? item.rotation : null;
            return buildWorkoutStep(workout, {
                rotationId: rotation ? rotation.id : '',
                rotationName: rotation ? rotation.name : '',
                scheduledForProgression: true
            });
        }));
    }

    function startAllSession() {
        beginSession('Ad Hoc Workout', state.workouts.map(workout => buildWorkoutStep(workout)));
    }

    function startWorkoutSession(workoutId) {
        const workout = getWorkout(workoutId);
        if (!workout) {
            notify('Movement not found.');
            return;
        }
        beginSession(workout.name, [buildWorkoutStep(workout)]);
    }

    function startRotationSession(rotationId) {
        const rotation = getRotation(rotationId);
        const resolution = rotation ? getRotationResolution(rotation) : null;
        if (!rotation || !resolution || !resolution.workout) {
            notify('Rotation is missing movements.');
            return;
        }
        const step = buildWorkoutStep(resolution.workout, {
            rotationId: rotation.id,
            rotationName: rotation.name,
            scheduledForProgression: true
        });
        beginSession(`${resolution.workout.name} / ${rotation.name}`, [step], null, {
            rotationId: rotation.id,
            rotationName: rotation.name
        });
    }

    function startRoutineSession(routineId) {
        const routine = getRoutine(routineId);
        if (!routine) {
            notify('Routine not found.');
            return;
        }
        const steps = routine.steps.map(step => {
            if (step.type === 'rest') {
                return {
                    id: Core.createId('session_step'),
                    type: 'rest',
                    durationSeconds: Number(step.durationSeconds) || Core.ROUTINE_DEFAULT_REST_SECONDS,
                    notes: step.notes || ''
                };
            }
            const workout = getWorkout(step.workoutId);
            return workout ? buildWorkoutStep(workout, step) : null;
        }).filter(Boolean);
        beginSession(routine.name, steps, routine);
    }

    function addSessionSet(repsOverride = null) {
        const session = state.activeSession;
        if (!session) return;
        const step = session.steps[session.currentStepIndex];
        if (!step || step.type !== 'workout') return;
        const workout = getWorkout(step.workoutId);
        if (!workout) {
            notify('Movement not found.');
            return;
        }
        const input = byId('session-reps-input');
        const reps = Math.max(1, Math.round(Number(repsOverride || (input && input.value) || step.targetReps || workout.targetReps)));
        const level = getLevel(workout, workout.currentLevelId);
        session.entries.push({
            id: Core.createId('session_entry'),
            workoutId: workout.id,
            workoutName: workout.name,
            levelId: workout.currentLevelId,
            levelName: level ? level.name : '',
            rotationId: step.rotationId || '',
            rotationName: step.rotationName || '',
            scheduledForProgression: step.scheduledForProgression === true,
            reps,
            targetRepsAtLog: Number(workout.targetReps) || getPolicy(workout).normalSetReps,
            createdAt: Date.now()
        });
        render();
    }

    function nextStep() {
        const session = state.activeSession;
        if (!session) return;
        session.currentStepIndex = Math.min(session.steps.length - 1, session.currentStepIndex + 1);
        render();
    }

    function previousStep() {
        const session = state.activeSession;
        if (!session) return;
        session.currentStepIndex = Math.max(0, session.currentStepIndex - 1);
        render();
    }

    function togglePauseSession() {
        const session = state.activeSession;
        if (!session) return;
        if (session.paused) {
            session.pausedMs += Date.now() - Number(session.pauseStartedAt || Date.now());
            session.pauseStartedAt = null;
            session.paused = false;
        } else {
            session.pauseStartedAt = Date.now();
            session.paused = true;
        }
        render();
    }

    function discardSession() {
        if (!state.activeSession) return;
        if (state.activeSession.entries.length && !global.confirm('Discard this workout session?')) return;
        state.activeSession = null;
        render();
    }

    async function saveActiveSession() {
        const session = state.activeSession;
        if (!session) return;
        if (!session.entries.length) {
            notify('Log at least one set before saving.');
            return;
        }
        const now = Date.now();
        const saved = {
            id: session.id,
            routineId: session.routineId,
            routineName: session.routineName,
            rotationId: session.rotationId,
            rotationName: session.rotationName,
            name: session.name,
            dateKey: todayKey(),
            startedAt: session.startedAt,
            completedAt: now,
            durationSeconds: Math.round(getElapsedMs(session) / 1000),
            entries: session.entries
        };
        const result = await Store.saveSession(saved);
        state.workouts = result.workouts;
        state.rotations = result.workoutRotations;
        state.sessions = result.workoutSessions;

        if (session.routineId) {
            const routine = getRoutine(session.routineId);
            if (routine) {
                routine.runs = Array.isArray(routine.runs) ? routine.runs : [];
                routine.runs.push({
                    id: Core.createId('routine_run'),
                    sessionId: saved.id,
                    startedAt: saved.startedAt,
                    completedAt: saved.completedAt,
                    durationSeconds: saved.durationSeconds,
                    entryCount: saved.entries.length
                });
                routine.runs = routine.runs.slice(-100);
                routine.updatedAt = now;
                await Store.saveWorkoutState({
                    workouts: state.workouts,
                    workoutRotations: state.rotations,
                    workoutRoutines: state.routines,
                    workoutSessions: state.sessions
                });
            }
        }

        state.activeSession = null;
        state.activeTab = 'today';
        notify('Session saved.');
        render();
    }

    async function quickLogMovement(workoutId, reps, rotationId = '') {
        const workout = getWorkout(workoutId);
        if (!workout) return;
        const now = Date.now();
        const level = getLevel(workout, workout.currentLevelId);
        const rotation = rotationId ? getRotation(rotationId) : null;
        const result = await Store.saveSession({
            id: Core.createId('workout_session'),
            rotationId: rotation ? rotation.id : '',
            rotationName: rotation ? rotation.name : '',
            name: `Quick Log - ${workout.name}`,
            dateKey: todayKey(),
            startedAt: now,
            completedAt: now,
            durationSeconds: 0,
            entries: [{
                id: Core.createId('session_entry'),
                workoutId: workout.id,
                workoutName: workout.name,
                levelId: workout.currentLevelId,
                levelName: level ? level.name : '',
                rotationId: rotation ? rotation.id : '',
                rotationName: rotation ? rotation.name : '',
                scheduledForProgression: !!rotation,
                reps,
                targetRepsAtLog: Number(workout.targetReps) || getPolicy(workout).normalSetReps,
                createdAt: now
            }]
        });
        state.workouts = result.workouts;
        state.rotations = result.workoutRotations;
        state.sessions = result.workoutSessions;
        notify('Set logged.');
        render();
    }

    function renderRoutines() {
        const options = state.workouts.map(workout => `<option value="${escapeHtml(workout.id)}">${escapeHtml(workout.name)}</option>`).join('');
        const draftSteps = state.routineDraft.steps.length
            ? state.routineDraft.steps.map(renderRoutineDraftStep).join('')
            : '<div class="workout-empty">Add movements and rest steps to build a routine.</div>';
        const routineRows = state.routines.length
            ? state.routines.map(renderRoutineCard).join('')
            : '<div class="workout-empty">No routines yet.</div>';

        return `
            ${renderPageHead('Routines', 'Build reusable flows with movement and rest steps.')}
            <div class="workout-two-col">
                <section class="workout-panel">
                    <h2 class="workout-section-title">${state.routineDraft.id ? 'Edit Routine' : 'Create Routine'}</h2>
                    <div class="workout-form">
                        <label class="workout-field">
                            <span>Name</span>
                            <input id="routine-name-input" type="text" value="${escapeHtml(state.routineDraft.name)}" placeholder="Push / Pull / Core">
                        </label>
                        <div class="workout-form-row three">
                            <label class="workout-field">
                                <span>Movement</span>
                                <select id="routine-workout-select">${options}</select>
                            </label>
                            <label class="workout-field">
                                <span>Sets</span>
                                <input id="routine-target-sets" type="number" min="1" value="3">
                            </label>
                            <label class="workout-field">
                                <span>Reps</span>
                                <input id="routine-target-reps" type="number" min="1" value="${Core.NORMAL_SET_REPS}">
                            </label>
                        </div>
                        <div class="workout-action-row">
                            <button type="button" class="workout-btn blue" onclick="WorkoutApp.addRoutineWorkoutStep()">Add Movement</button>
                            <label class="workout-field" style="max-width:160px">
                                <span>Rest seconds</span>
                                <input id="routine-rest-seconds" type="number" min="5" value="${Core.ROUTINE_DEFAULT_REST_SECONDS}">
                            </label>
                            <button type="button" class="workout-btn warning" onclick="WorkoutApp.addRoutineRestStep()">Add Rest</button>
                        </div>
                        <div class="workout-step-list">${draftSteps}</div>
                        <div class="workout-action-row">
                            <button type="button" class="workout-btn primary" onclick="WorkoutApp.saveRoutine()">Save Routine</button>
                            <button type="button" class="workout-btn" onclick="WorkoutApp.resetRoutineDraft()">Clear</button>
                        </div>
                    </div>
                </section>
                <section class="workout-panel">
                    <h2 class="workout-section-title">Saved Routines</h2>
                    <div class="workout-grid">${routineRows}</div>
                </section>
            </div>
        `;
    }

    function renderRoutineDraftStep(step, index) {
        if (step.type === 'rest') {
            return `
                <div class="workout-step-row rest">
                    <div>
                        <strong>Rest</strong>
                        <div class="workout-meta">${step.durationSeconds} seconds</div>
                    </div>
                    <div class="workout-inline-actions">
                        <button type="button" class="workout-icon-btn" onclick="WorkoutApp.moveRoutineStep(${index}, -1)">^</button>
                        <button type="button" class="workout-icon-btn" onclick="WorkoutApp.moveRoutineStep(${index}, 1)">v</button>
                        <button type="button" class="workout-btn danger" onclick="WorkoutApp.removeRoutineStep(${index})">Remove</button>
                    </div>
                </div>
            `;
        }
        const workout = getWorkout(step.workoutId);
        return `
            <div class="workout-step-row workout">
                <div>
                    <strong>${escapeHtml(workout ? workout.name : 'Missing movement')}</strong>
                    <div class="workout-meta">${step.targetSets || 0} set${Number(step.targetSets) === 1 ? '' : 's'} / ${step.targetReps || 0} reps</div>
                </div>
                <div class="workout-inline-actions">
                    <button type="button" class="workout-icon-btn" onclick="WorkoutApp.moveRoutineStep(${index}, -1)">^</button>
                    <button type="button" class="workout-icon-btn" onclick="WorkoutApp.moveRoutineStep(${index}, 1)">v</button>
                    <button type="button" class="workout-btn danger" onclick="WorkoutApp.removeRoutineStep(${index})">Remove</button>
                </div>
            </div>
        `;
    }

    function renderRoutineCard(routine) {
        return `
            <article class="workout-card">
                <div class="workout-card-head">
                    <div>
                        <h3 class="workout-card-title">${escapeHtml(routine.name)}</h3>
                        <div class="workout-meta">${routine.steps.length} step${routine.steps.length === 1 ? '' : 's'} / ${Array.isArray(routine.runs) ? routine.runs.length : 0} saved run${Array.isArray(routine.runs) && routine.runs.length === 1 ? '' : 's'}</div>
                    </div>
                    <div class="workout-card-actions">
                        <button type="button" class="workout-btn primary" onclick="WorkoutApp.startRoutineSession('${escapeHtml(routine.id)}')">Start</button>
                        <button type="button" class="workout-btn" onclick="WorkoutApp.editRoutine('${escapeHtml(routine.id)}')">Edit</button>
                        <button type="button" class="workout-btn danger" onclick="WorkoutApp.deleteRoutine('${escapeHtml(routine.id)}')">Delete</button>
                    </div>
                </div>
            </article>
        `;
    }

    function syncDraftName() {
        const input = byId('routine-name-input');
        if (input) state.routineDraft.name = input.value.trim();
    }

    function addRoutineWorkoutStep() {
        syncDraftName();
        const workoutId = byId('routine-workout-select') && byId('routine-workout-select').value;
        const workout = getWorkout(workoutId);
        if (!workout) {
            notify('Create a movement first.');
            return;
        }
        state.routineDraft.steps.push(Core.normalizeRoutineStep({
            type: 'workout',
            workoutId: workout.id,
            targetSets: byId('routine-target-sets') && byId('routine-target-sets').value,
            targetReps: byId('routine-target-reps') && byId('routine-target-reps').value,
            durationSeconds: Core.ROUTINE_DEFAULT_WORK_SECONDS
        }, state.routineDraft.steps.length));
        render();
    }

    function addRoutineRestStep() {
        syncDraftName();
        state.routineDraft.steps.push(Core.normalizeRoutineStep({
            type: 'rest',
            durationSeconds: byId('routine-rest-seconds') && byId('routine-rest-seconds').value
        }, state.routineDraft.steps.length));
        render();
    }

    function removeRoutineStep(index) {
        syncDraftName();
        state.routineDraft.steps.splice(index, 1);
        state.routineDraft.steps.forEach((step, stepIndex) => { step.order = stepIndex + 1; });
        render();
    }

    function moveRoutineStep(index, direction) {
        syncDraftName();
        const nextIndex = index + direction;
        if (nextIndex < 0 || nextIndex >= state.routineDraft.steps.length) return;
        const [step] = state.routineDraft.steps.splice(index, 1);
        state.routineDraft.steps.splice(nextIndex, 0, step);
        state.routineDraft.steps.forEach((item, stepIndex) => { item.order = stepIndex + 1; });
        render();
    }

    async function saveRoutine() {
        syncDraftName();
        if (!state.routineDraft.name) {
            notify('Name the routine before saving.');
            return;
        }
        if (!state.routineDraft.steps.length) {
            notify('Add at least one step before saving.');
            return;
        }
        const now = Date.now();
        const existing = state.routineDraft.id ? getRoutine(state.routineDraft.id) : null;
        const routine = Core.normalizeRoutine({
            ...(existing || {}),
            id: existing ? existing.id : Core.createId('routine'),
            name: state.routineDraft.name,
            steps: state.routineDraft.steps,
            createdAt: existing ? existing.createdAt : now,
            updatedAt: now
        });
        state.routines = existing
            ? state.routines.map(item => item.id === routine.id ? routine : item)
            : [...state.routines, routine];
        resetRoutineDraft(false);
        await persistWorkoutState('Routine saved.');
    }

    function editRoutine(routineId) {
        const routine = getRoutine(routineId);
        if (!routine) return;
        state.routineDraft = {
            id: routine.id,
            name: routine.name,
            steps: routine.steps.map(step => ({ ...step }))
        };
        state.activeTab = 'routines';
        render();
    }

    async function deleteRoutine(routineId) {
        const routine = getRoutine(routineId);
        if (!routine || !global.confirm(`Delete ${routine.name}?`)) return;
        state.routines = state.routines.filter(item => item.id !== routineId);
        if (state.routineDraft.id === routineId) resetRoutineDraft(false);
        await persistWorkoutState('Routine deleted.');
    }

    function resetRoutineDraft(shouldRender = true) {
        state.routineDraft = { id: null, name: '', steps: [] };
        if (shouldRender) render();
    }

    function renderLibrary() {
        const editing = state.editingWorkoutId ? getWorkout(state.editingWorkoutId) : null;
        const editingRotation = state.editingRotationId ? getRotation(state.editingRotationId) : null;
        const movementRows = state.workouts.length
            ? state.workouts.map(renderMovementCard).join('')
            : '<div class="workout-empty">No movements yet.</div>';
        const rotationRows = state.rotations.length
            ? state.rotations.map(renderRotationCard).join('')
            : '<div class="workout-empty">No rotations yet.</div>';
        return `
            ${renderPageHead('Library', 'Create movements, schedules, levels, and progression defaults.')}
            <div class="workout-library-grid">
                <section class="workout-panel">
                    <h2 class="workout-section-title">${editing ? 'Edit Movement' : 'Create Movement'}</h2>
                    ${renderMovementForm(editing)}
                </section>
                <section class="workout-panel">
                    <h2 class="workout-section-title">Movements</h2>
                    <div class="workout-grid">${movementRows}</div>
                </section>
            </div>
            <div class="workout-two-col" style="margin-top:14px">
                <section class="workout-panel">
                    <h2 class="workout-section-title">${editingRotation ? 'Edit Rotation' : 'Create Rotation'}</h2>
                    ${renderRotationForm(editingRotation)}
                </section>
                <section class="workout-panel">
                    <h2 class="workout-section-title">Rotations</h2>
                    <div class="workout-grid">${rotationRows}</div>
                </section>
            </div>
        `;
    }

    function renderRotationForm(rotation) {
        const schedule = Core.normalizeSchedule(rotation && rotation.schedule);
        const memberTiles = state.workouts.length
            ? state.workouts.map(workout => `
                <label class="workout-check-tile text">
                    <input type="checkbox" name="rotation-workout" value="${escapeHtml(workout.id)}" ${rotation && rotation.workoutIds.includes(workout.id) ? 'checked' : ''}>
                    ${escapeHtml(workout.name)}
                </label>
            `).join('')
            : '<div class="workout-empty">Create at least two movements first.</div>';
        const weekdayTiles = WEEKDAYS.map((label, day) => `
            <label class="workout-check-tile">
                <input type="checkbox" name="rotation-weekday" value="${day}" ${schedule.weekdays.includes(day) ? 'checked' : ''}>
                ${escapeHtml(label)}
            </label>
        `).join('');
        return `
            <div class="workout-form">
                <label class="workout-field">
                    <span>Name</span>
                    <input id="rotation-name-input" type="text" value="${escapeHtml(rotation ? rotation.name : '')}" placeholder="Upper pull">
                </label>
                <div class="workout-member-grid">${memberTiles}</div>
                <div class="workout-weekday-grid">${weekdayTiles}</div>
                <div class="workout-form-row">
                    <label class="workout-field">
                        <span>Time</span>
                        <input id="rotation-time-input" type="time" value="${escapeHtml(schedule.time)}">
                    </label>
                    <label class="workout-field">
                        <span>Duration minutes</span>
                        <input id="rotation-duration-input" type="number" min="5" max="240" value="${schedule.durationMinutes || ''}" placeholder="30">
                    </label>
                </div>
                <div class="workout-action-row">
                    <button type="button" class="workout-btn primary" onclick="WorkoutApp.saveRotation()">Save Rotation</button>
                    <button type="button" class="workout-btn" onclick="WorkoutApp.resetRotationForm()">Clear</button>
                </div>
            </div>
        `;
    }

    function renderRotationCard(rotation) {
        const resolution = getRotationResolution(rotation);
        const workout = resolution && resolution.workout;
        const members = rotation.workoutIds
            .map(id => getWorkout(id))
            .filter(Boolean)
            .map(member => member.name)
            .join(' / ');
        const dueText = workout
            ? `${workout.name}${resolution && !resolution.balanced ? ' / catch-up' : ''}`
            : 'No due movement';
        return `
            <article class="workout-card">
                <div class="workout-card-head">
                    <div>
                        <h3 class="workout-card-title">${escapeHtml(rotation.name)}</h3>
                        <div class="workout-meta">${escapeHtml(getRotationScheduleLabel(rotation))}</div>
                    </div>
                    <div class="workout-card-actions">
                        <button type="button" class="workout-btn primary" onclick="WorkoutApp.startRotationSession('${escapeHtml(rotation.id)}')">Start</button>
                        <button type="button" class="workout-btn" onclick="WorkoutApp.editRotation('${escapeHtml(rotation.id)}')">Edit</button>
                        <button type="button" class="workout-btn danger" onclick="WorkoutApp.deleteRotation('${escapeHtml(rotation.id)}')">Delete</button>
                    </div>
                </div>
                <div class="workout-pill-row">
                    <div class="workout-pill"><span>Due</span><strong>${escapeHtml(dueText)}</strong></div>
                    <div class="workout-pill"><span>Members</span><strong>${rotation.workoutIds.length}</strong></div>
                    <div class="workout-pill"><span>Attempts</span><strong>${rotation.history.length}</strong></div>
                </div>
                <div class="workout-meta">${escapeHtml(members)}</div>
            </article>
        `;
    }

    function renderMovementForm(workout) {
        const policy = getPolicy(workout);
        const schedule = Core.normalizeSchedule(workout && workout.schedule);
        const levelsText = workout
            ? workout.levels.map(level => level.name).join('\n')
            : 'Level 1';
        const weekdayTiles = WEEKDAYS.map((label, day) => `
            <label class="workout-check-tile">
                <input type="checkbox" name="movement-weekday" value="${day}" ${schedule.weekdays.includes(day) ? 'checked' : ''}>
                ${escapeHtml(label)}
            </label>
        `).join('');
        return `
            <div class="workout-form">
                <label class="workout-field">
                    <span>Name</span>
                    <input id="movement-name-input" type="text" value="${escapeHtml(workout ? workout.name : '')}" placeholder="Push-ups, squats, pull-ups">
                </label>
                <div class="workout-weekday-grid">${weekdayTiles}</div>
                <div class="workout-form-row">
                    <label class="workout-field">
                        <span>Time</span>
                        <input id="movement-time-input" type="time" value="${escapeHtml(schedule.time)}">
                    </label>
                    <label class="workout-field">
                        <span>Duration minutes</span>
                        <input id="movement-duration-input" type="number" min="5" max="240" value="${schedule.durationMinutes || ''}" placeholder="30">
                    </label>
                </div>
                <div class="workout-form-row three">
                    <label class="workout-field">
                        <span>Required sets</span>
                        <input id="movement-required-sets" type="number" min="1" max="20" value="${policy.requiredSets}">
                    </label>
                    <label class="workout-field">
                        <span>Normal reps</span>
                        <input id="movement-normal-reps" type="number" min="1" value="${policy.normalSetReps}">
                    </label>
                    <label class="workout-field">
                        <span>Advanced reps</span>
                        <input id="movement-advanced-reps" type="number" min="1" value="${policy.advancedSetReps}">
                    </label>
                </div>
                <label class="workout-field">
                    <span>Levels</span>
                    <textarea id="movement-levels-input" placeholder="One level per line">${escapeHtml(levelsText)}</textarea>
                </label>
                <div class="workout-form-row">
                    <label class="workout-field">
                        <span>Deload after days</span>
                        <input id="movement-deload-days" type="number" min="7" max="180" value="${workout && workout.deloadPolicy ? workout.deloadPolicy.staleAfterDays : Core.DELOAD_DAYS}">
                    </label>
                    <div class="workout-action-row" style="align-self:end">
                        <button type="button" class="workout-btn primary" onclick="WorkoutApp.saveMovement()">Save Movement</button>
                        <button type="button" class="workout-btn" onclick="WorkoutApp.resetMovementForm()">Clear</button>
                    </div>
                </div>
            </div>
        `;
    }

    function renderMovementCard(workout) {
        const metrics = Core.getDayMetrics(workout, todayKey());
        const level = getLevel(workout, workout.currentLevelId);
        return `
            <article class="workout-card">
                <div class="workout-card-head">
                    <div>
                        <h3 class="workout-card-title">${escapeHtml(workout.name)}</h3>
                        <div class="workout-meta">${escapeHtml(getScheduleLabel(workout))}</div>
                    </div>
                    <div class="workout-card-actions">
                        <button type="button" class="workout-btn primary" onclick="WorkoutApp.startWorkoutSession('${escapeHtml(workout.id)}')">Start</button>
                        <button type="button" class="workout-btn" onclick="WorkoutApp.editMovement('${escapeHtml(workout.id)}')">Edit</button>
                        <button type="button" class="workout-btn danger" onclick="WorkoutApp.deleteMovement('${escapeHtml(workout.id)}')">Delete</button>
                    </div>
                </div>
                <div class="workout-pill-row">
                    <div class="workout-pill"><span>Level</span><strong>${escapeHtml(level ? level.name : 'Level')}</strong></div>
                    <div class="workout-pill"><span>Target</span><strong>${metrics.targetReps}</strong></div>
                    <div class="workout-pill"><span>Logs</span><strong>${workout.logs.length}</strong></div>
                </div>
            </article>
        `;
    }

    function readMovementForm(existing) {
        const name = (byId('movement-name-input') && byId('movement-name-input').value.trim()) || '';
        if (!name) {
            notify('Name the movement before saving.');
            return null;
        }
        const weekdays = Array.from(document.querySelectorAll('input[name="movement-weekday"]:checked'))
            .map(input => Number(input.value));
        const policy = Core.normalizeProgressionPolicy({
            requiredSets: byId('movement-required-sets') && byId('movement-required-sets').value,
            normalSetReps: byId('movement-normal-reps') && byId('movement-normal-reps').value,
            advancedSetReps: byId('movement-advanced-reps') && byId('movement-advanced-reps').value
        });
        const existingLevels = existing && Array.isArray(existing.levels) ? existing.levels : [];
        const levelLines = ((byId('movement-levels-input') && byId('movement-levels-input').value) || 'Level 1')
            .split('\n')
            .map(line => line.trim())
            .filter(Boolean);
        const levels = (levelLines.length ? levelLines : ['Level 1']).map((nameLine, index) => ({
            id: existingLevels[index] ? existingLevels[index].id : Core.createId('workout_level'),
            name: nameLine,
            order: index + 1,
            notes: existingLevels[index] ? existingLevels[index].notes || '' : ''
        }));
        const previousPolicy = getPolicy(existing);
        const wasAdvanced = existing && Number(existing.targetReps) >= previousPolicy.advancedSetReps;
        const currentLevelId = existing && levels.some(level => level.id === existing.currentLevelId)
            ? existing.currentLevelId
            : levels[0].id;
        const now = Date.now();
        return Core.normalizeWorkout({
            ...(existing || {}),
            id: existing ? existing.id : Core.createId('workout'),
            name,
            levels,
            currentLevelId,
            targetReps: wasAdvanced ? policy.advancedSetReps : policy.normalSetReps,
            progressionPolicy: policy,
            schedule: {
                weekdays,
                time: byId('movement-time-input') && byId('movement-time-input').value,
                durationMinutes: byId('movement-duration-input') && byId('movement-duration-input').value
            },
            deloadPolicy: {
                enabled: true,
                staleAfterDays: byId('movement-deload-days') && byId('movement-deload-days').value
            },
            logs: existing ? existing.logs : [],
            history: existing ? existing.history : [],
            createdAt: existing ? existing.createdAt : now,
            updatedAt: now
        });
    }

    async function saveMovement() {
        const existing = state.editingWorkoutId ? getWorkout(state.editingWorkoutId) : null;
        const movement = readMovementForm(existing);
        if (!movement) return;
        state.workouts = existing
            ? state.workouts.map(item => item.id === movement.id ? movement : item)
            : [...state.workouts, movement];
        state.editingWorkoutId = null;
        await persistWorkoutState('Movement saved.');
    }

    function readRotationForm(existing) {
        const name = (byId('rotation-name-input') && byId('rotation-name-input').value.trim()) || '';
        if (!name) {
            notify('Name the rotation before saving.');
            return null;
        }
        const workoutIds = Array.from(document.querySelectorAll('input[name="rotation-workout"]:checked'))
            .map(input => String(input.value || '').trim())
            .filter(Boolean);
        if (workoutIds.length < 2) {
            notify('Pick at least two movements for a rotation.');
            return null;
        }
        const weekdays = Array.from(document.querySelectorAll('input[name="rotation-weekday"]:checked'))
            .map(input => Number(input.value));
        const now = Date.now();
        return Core.normalizeRotation({
            ...(existing || {}),
            id: existing ? existing.id : Core.createId('workout_rotation'),
            name,
            workoutIds,
            schedule: {
                weekdays,
                time: byId('rotation-time-input') && byId('rotation-time-input').value,
                durationMinutes: byId('rotation-duration-input') && byId('rotation-duration-input').value
            },
            createdAt: existing ? existing.createdAt : now,
            updatedAt: now
        }, state.workouts.map(workout => workout.id));
    }

    async function saveRotation() {
        const existing = state.editingRotationId ? getRotation(state.editingRotationId) : null;
        const rotation = readRotationForm(existing);
        if (!rotation) return;
        state.rotations = existing
            ? state.rotations.map(item => item.id === rotation.id ? rotation : item)
            : [...state.rotations, rotation];
        state.editingRotationId = null;
        await persistWorkoutState('Rotation saved.');
    }

    function editRotation(rotationId) {
        state.editingRotationId = rotationId;
        state.activeTab = 'library';
        render();
    }

    async function deleteRotation(rotationId) {
        const rotation = getRotation(rotationId);
        if (!rotation || !global.confirm(`Delete ${rotation.name}?`)) return;
        state.rotations = state.rotations.filter(item => item.id !== rotationId);
        if (state.editingRotationId === rotationId) state.editingRotationId = null;
        await persistWorkoutState('Rotation deleted.');
    }

    function resetRotationForm() {
        state.editingRotationId = null;
        render();
    }

    function editMovement(workoutId) {
        state.editingWorkoutId = workoutId;
        state.activeTab = 'library';
        render();
    }

    async function deleteMovement(workoutId) {
        const workout = getWorkout(workoutId);
        if (!workout || !global.confirm(`Delete ${workout.name}?`)) return;
        state.workouts = state.workouts.filter(item => item.id !== workoutId);
        state.routines = state.routines.map(routine => ({
            ...routine,
            steps: routine.steps.filter(step => step.type !== 'workout' || step.workoutId !== workoutId)
        }));
        state.rotations = state.rotations.map(rotation => ({
            ...rotation,
            workoutIds: rotation.workoutIds.filter(id => id !== workoutId),
            lastWorkoutId: rotation.lastWorkoutId === workoutId ? '' : rotation.lastWorkoutId,
            history: rotation.history.filter(event => event.workoutId !== workoutId)
        }));
        if (state.editingWorkoutId === workoutId) state.editingWorkoutId = null;
        await persistWorkoutState('Movement deleted.');
    }

    function resetMovementForm() {
        state.editingWorkoutId = null;
        render();
    }

    function renderProgress() {
        const logs = state.workouts.flatMap(workout => (workout.logs || []).map(log => ({ ...log, workoutName: workout.name })));
        const totalReps = logs.reduce((sum, log) => sum + Number(log.reps || 0), 0);
        const qualifyingSets = logs.filter(log => Number(log.reps) >= Number(log.targetRepsAtLog || Core.NORMAL_SET_REPS)).length;
        const completedDays = countCompletedDays();
        const recentSessions = state.sessions.slice().reverse().slice(0, 8);
        return `
            ${renderPageHead('Progress', 'Simple totals and recent activity from saved sessions and compatible movement logs.')}
            <div class="workout-stat-grid">
                <div class="workout-stat"><span>Total reps</span><strong>${totalReps}</strong></div>
                <div class="workout-stat"><span>Qualifying sets</span><strong>${qualifyingSets}</strong></div>
                <div class="workout-stat"><span>Completed days</span><strong>${completedDays}</strong></div>
                <div class="workout-stat"><span>Sessions</span><strong>${state.sessions.length}</strong></div>
            </div>
            <div class="workout-two-col">
                <section class="workout-panel">
                    <h2 class="workout-section-title">Last 14 Days</h2>
                    ${renderDailyRepChart(logs)}
                </section>
                <section class="workout-panel">
                    <h2 class="workout-section-title">By Movement</h2>
                    ${renderMovementRepChart(logs)}
                </section>
                <section class="workout-panel" style="grid-column:1 / -1">
                    <h2 class="workout-section-title">Recent Sessions</h2>
                    <div class="workout-recent-list">${renderRecentSessions(recentSessions)}</div>
                </section>
            </div>
        `;
    }

    function countCompletedDays() {
        const keys = new Set();
        const today = new Date();
        for (let offset = 0; offset < 120; offset += 1) {
            const date = Core.addDays(today, -offset);
            const key = Core.dateKey(date);
            const scheduled = state.workouts.filter(workout => Core.isScheduledOnDate(workout, date));
            if (scheduled.length && scheduled.every(workout => Core.getDayMetrics(workout, key).completed)) keys.add(key);
        }
        return keys.size;
    }

    function renderDailyRepChart(logs) {
        const today = new Date();
        const rows = [];
        for (let offset = 13; offset >= 0; offset -= 1) {
            const date = Core.addDays(today, -offset);
            const key = Core.dateKey(date);
            rows.push({
                label: date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
                value: logs.filter(log => log.scheduledDateKey === key).reduce((sum, log) => sum + Number(log.reps || 0), 0)
            });
        }
        return renderBars(rows, 'reps');
    }

    function renderMovementRepChart(logs) {
        const totals = new Map();
        logs.forEach(log => {
            totals.set(log.workoutName, (totals.get(log.workoutName) || 0) + Number(log.reps || 0));
        });
        const rows = Array.from(totals.entries())
            .map(([label, value]) => ({ label, value }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 10);
        return renderBars(rows, 'reps');
    }

    function renderBars(rows, unit) {
        if (!rows.length || rows.every(row => row.value === 0)) return '<div class="workout-empty">No progress data yet.</div>';
        const max = Math.max(...rows.map(row => row.value), 1);
        return `
            <div class="workout-chart">
                ${rows.map(row => `
                    <div class="workout-bar-row">
                        <span>${escapeHtml(row.label)}</span>
                        <div class="workout-bar-track"><div class="workout-bar-fill" style="width:${Math.round((row.value / max) * 100)}%"></div></div>
                        <strong>${row.value} ${unit}</strong>
                    </div>
                `).join('')}
            </div>
        `;
    }

    function renderRecentSessions(sessions) {
        if (!sessions.length) return '<div class="workout-empty">Saved sessions will appear here.</div>';
        return sessions.map(session => {
            const reps = session.entries.reduce((sum, entry) => sum + Number(entry.reps || 0), 0);
            return `
                <div class="workout-recent-row">
                    <div>
                        <strong>${escapeHtml(session.name)}</strong>
                        <div class="workout-meta">${escapeHtml(formatDateLabel(session.dateKey))} / ${session.entries.length} set${session.entries.length === 1 ? '' : 's'} / ${Math.round(Number(session.durationSeconds || 0) / 60)}m</div>
                    </div>
                    <strong>${reps} reps</strong>
                </div>
            `;
        }).join('');
    }

    async function init() {
        if (!Core || !Store) {
            render();
            return;
        }
        document.querySelectorAll('.workout-app-tab').forEach(button => {
            button.addEventListener('click', () => setTab(button.dataset.tab));
        });
        try {
            await loadState();
            render();
        } catch (error) {
            console.error('[workoutApp] Failed to load workouts:', error);
            const view = byId('workout-app-view');
            if (view) view.innerHTML = '<div class="workout-empty">Could not load workout data.</div>';
        }
        clockInterval = setInterval(updateSessionClock, 1000);
    }

    global.WorkoutApp = {
        setTab,
        startScheduledSession,
        startAllSession,
        startWorkoutSession,
        startRotationSession,
        startRoutineSession,
        addSessionSet,
        nextStep,
        previousStep,
        togglePauseSession,
        discardSession,
        saveActiveSession,
        quickLogMovement,
        addRoutineWorkoutStep,
        addRoutineRestStep,
        removeRoutineStep,
        moveRoutineStep,
        saveRoutine,
        editRoutine,
        deleteRoutine,
        resetRoutineDraft,
        saveMovement,
        saveRotation,
        editRotation,
        deleteRotation,
        resetRotationForm,
        editMovement,
        deleteMovement,
        resetMovementForm
    };

    document.addEventListener('DOMContentLoaded', init);
    global.addEventListener('beforeunload', () => {
        if (clockInterval) clearInterval(clockInterval);
    });
})(typeof globalThis !== 'undefined' ? globalThis : window);
