// --- WORKOUT TRACKER LOGIC ---
let editingWorkoutId = null;
let workoutComposerWeekdays = new Set([new Date().getDay()]);
let workoutCalendarView = 'week';
let workoutCalendarDate = new Date();
let selectedWorkoutCalendarDateKey = getWorkoutDateKey();
let workoutStudioActiveTab = 'today';
let workoutStudioSelectedWorkoutId = null;
let workoutProgressRange = '90';
let editingWorkoutRoutineId = null;
let workoutRoutineDraftName = '';
let workoutRoutineDraftSteps = [];
let activeWorkoutRoutineRun = null;
let workoutRoutineTimerId = null;
let workoutRoutineAudioContext = null;

const WORKOUT_NORMAL_SET_REPS = 20;
const WORKOUT_ADVANCED_SET_REPS = 50;
const WORKOUT_REQUIRED_SETS = 3;
const WORKOUT_DELOAD_DAYS = 21;
const WORKOUT_WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WORKOUT_STUDIO_TABS = ['today', 'calendar', 'levels', 'routines', 'history', 'progress'];
const WORKOUT_ROUTINE_DEFAULT_WORK_SECONDS = 60;
const WORKOUT_ROUTINE_DEFAULT_REST_SECONDS = 30;

function createWorkoutId(prefix = 'workout') {
    return `${prefix}_${Date.now()}${Math.random().toString(36).substr(2, 5)}`;
}

function getWorkoutDateKey(date = new Date()) {
    const d = new Date(date);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function parseWorkoutDateKey(dateKey) {
    const parts = String(dateKey || '').split('-').map(Number);
    if (parts.length !== 3 || parts.some(Number.isNaN)) return null;
    return new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0, 0);
}

function addWorkoutDays(date, days) {
    const next = new Date(date);
    next.setDate(next.getDate() + days);
    return next;
}

function normalizeWorkoutWeekdays(days) {
    if (window.WorkoutCore && typeof window.WorkoutCore.normalizeWeekdays === 'function') {
        return window.WorkoutCore.normalizeWeekdays(days);
    }
    const source = Array.isArray(days) ? days : [new Date().getDay()];
    const unique = Array.from(new Set(source.map(day => Number(day)).filter(day => Number.isInteger(day) && day >= 0 && day <= 6)));
    return (unique.length > 0 ? unique : [new Date().getDay()]).sort((a, b) => a - b);
}

function createWorkoutLevel(name = 'Level 1', order = 1) {
    const safeName = String(name || `Level ${order}`).trim().slice(0, 80) || `Level ${order}`;
    return {
        id: createWorkoutId('workout_level'),
        name: safeName,
        order: Math.max(1, Math.round(Number(order) || 1)),
        notes: ''
    };
}

function normalizeWorkoutLevels(levels) {
    const seen = new Set();
    const normalized = (Array.isArray(levels) ? levels : [])
        .map((level, index) => {
            if (!level || typeof level !== 'object') return null;
            const id = String(level.id || '').trim() || createWorkoutId('workout_level');
            if (seen.has(id)) return null;
            seen.add(id);
            const order = Math.max(1, Math.round(Number(level.order) || (index + 1)));
            const name = String(level.name || level.title || `Level ${order}`).trim().slice(0, 80) || `Level ${order}`;
            return {
                id,
                name,
                order,
                notes: String(level.notes || '').trim().slice(0, 500)
            };
        })
        .filter(Boolean)
        .sort((a, b) => a.order - b.order);

    if (normalized.length === 0) normalized.push(createWorkoutLevel('Level 1', 1));
    normalized.forEach((level, index) => { level.order = index + 1; });
    return normalized;
}

function normalizeWorkoutSchedule(schedule) {
    if (window.WorkoutCore && typeof window.WorkoutCore.normalizeSchedule === 'function') {
        return window.WorkoutCore.normalizeSchedule(schedule);
    }
    const source = schedule && typeof schedule === 'object' ? schedule : {};
    const time = /^\d{2}:\d{2}$/.test(source.time || '') ? source.time : '';
    const rawDuration = source.durationMinutes;
    const hasDuration = rawDuration !== undefined && rawDuration !== null && String(rawDuration).trim() !== '';
    const parsedDuration = Number(rawDuration);
    const duration = hasDuration
        ? Math.max(5, Math.min(240, Math.round(Number.isFinite(parsedDuration) ? parsedDuration : 30)))
        : null;
    return {
        weekdays: normalizeWorkoutWeekdays(source.weekdays),
        time,
        durationMinutes: duration
    };
}

function normalizeWorkoutProgressionPolicy(policy) {
    if (window.WorkoutCore && typeof window.WorkoutCore.normalizeProgressionPolicy === 'function') {
        return window.WorkoutCore.normalizeProgressionPolicy(policy);
    }
    const source = policy && typeof policy === 'object' ? policy : {};
    return {
        requiredSets: Math.max(1, Math.min(20, Math.round(Number(source.requiredSets) || WORKOUT_REQUIRED_SETS))),
        normalSetReps: Math.max(1, Math.min(9999, Math.round(Number(source.normalSetReps) || WORKOUT_NORMAL_SET_REPS))),
        advancedSetReps: Math.max(1, Math.min(9999, Math.round(Number(source.advancedSetReps) || WORKOUT_ADVANCED_SET_REPS)))
    };
}

function normalizeWorkoutDeloadPolicy(policy) {
    const source = policy && typeof policy === 'object' ? policy : {};
    const staleAfterDays = Math.max(7, Math.min(180, Math.round(Number(source.staleAfterDays) || WORKOUT_DELOAD_DAYS)));
    return {
        enabled: source.enabled !== false,
        mode: 'suggest',
        staleAfterDays,
        dropLevels: 1
    };
}

function normalizeWorkoutHistory(events, workoutId, validLevelIds) {
    const seen = new Set();
    return (Array.isArray(events) ? events : [])
        .map(event => {
            if (!event || typeof event !== 'object') return null;
            const id = String(event.id || '').trim() || createWorkoutId('workout_event');
            if (seen.has(id)) return null;
            seen.add(id);
            const type = String(event.type || '').trim().slice(0, 60);
            if (!type) return null;
            const createdAt = Number(event.createdAt) || Date.now();
            const dateKey = /^\d{4}-\d{2}-\d{2}$/.test(event.dateKey || '')
                ? event.dateKey
                : getWorkoutDateKey(new Date(createdAt));
            const payload = event.payload && typeof event.payload === 'object' ? event.payload : {};
            return {
                id,
                workoutId: String(event.workoutId || workoutId || ''),
                type,
                dateKey,
                levelId: validLevelIds.has(event.levelId) ? event.levelId : null,
                fromLevelId: validLevelIds.has(event.fromLevelId) ? event.fromLevelId : null,
                toLevelId: validLevelIds.has(event.toLevelId) ? event.toLevelId : null,
                payload,
                createdAt
            };
        })
        .filter(Boolean)
        .sort((a, b) => Number(a.createdAt) - Number(b.createdAt))
        .slice(-1000);
}

function normalizeWorkoutLogs(logs, workoutId, validLevelIds, policy = null) {
    const safePolicy = normalizeWorkoutProgressionPolicy(policy);
    const seen = new Set();
    return (Array.isArray(logs) ? logs : [])
        .map((log) => {
            if (!log || typeof log !== 'object') return null;
            const id = String(log.id || '').trim() || createWorkoutId('workout_log');
            if (seen.has(id)) return null;
            seen.add(id);
            const reps = Math.max(0, Math.round(Number(log.reps) || 0));
            if (reps <= 0) return null;
            const createdAt = Number(log.createdAt) || Date.now();
            const fallbackDateKey = getWorkoutDateKey(new Date(createdAt));
            const scheduledDateKey = /^\d{4}-\d{2}-\d{2}$/.test(log.scheduledDateKey || '') ? log.scheduledDateKey : fallbackDateKey;
            const levelId = validLevelIds.has(log.levelId) ? log.levelId : null;
            return {
                id,
                workoutId: String(log.workoutId || workoutId || ''),
                levelId,
                scheduledDateKey,
                reps,
                targetRepsAtLog: Math.max(1, Math.round(Number(log.targetRepsAtLog) || safePolicy.normalSetReps)),
                source: log.source === 'routine' || log.source === 'session' ? log.source : 'manual',
                routineId: String(log.routineId || '').trim(),
                routineRunId: String(log.routineRunId || '').trim(),
                sessionId: String(log.sessionId || '').trim(),
                rotationId: String(log.rotationId || '').trim(),
                createdAt
            };
        })
        .filter(Boolean)
        .sort((a, b) => Number(a.createdAt) - Number(b.createdAt))
        .slice(-2000);
}

function normalizeWorkoutForRuntime(workout) {
    if (window.WorkoutCore && typeof window.WorkoutCore.normalizeWorkout === 'function') {
        return window.WorkoutCore.normalizeWorkout(workout);
    }
    const source = workout && typeof workout === 'object' ? workout : {};
    const now = Date.now();
    const levels = normalizeWorkoutLevels(source.levels);
    const validLevelIds = new Set(levels.map(level => level.id));
    const currentLevelId = validLevelIds.has(source.currentLevelId) ? source.currentLevelId : levels[0].id;
    const pendingLevelId = validLevelIds.has(source.pendingLevelId) ? source.pendingLevelId : null;
    const progressionPolicy = normalizeWorkoutProgressionPolicy(source.progressionPolicy);
    const targetReps = Number(source.targetReps) === progressionPolicy.advancedSetReps ? progressionPolicy.advancedSetReps : progressionPolicy.normalSetReps;
    const currentLevelStartedAt = Number(source.currentLevelStartedAt) || Number(source.createdAt) || now;

    workout.id = String(source.id || '').trim() || createWorkoutId('workout');
    workout.name = String(source.name || source.title || 'Workout').trim().slice(0, 120) || 'Workout';
    workout.unit = 'reps';
    workout.levels = levels;
    workout.currentLevelId = currentLevelId;
    workout.progressionPolicy = progressionPolicy;
    workout.targetReps = targetReps;
    workout.currentLevelStartedAt = currentLevelStartedAt;
    workout.schedule = normalizeWorkoutSchedule(source.schedule);
    workout.deloadPolicy = normalizeWorkoutDeloadPolicy(source.deloadPolicy);
    workout.logs = normalizeWorkoutLogs(source.logs, workout.id, validLevelIds, progressionPolicy).map(log => ({
        ...log,
        workoutId: workout.id
    }));
    workout.history = normalizeWorkoutHistory(source.history, workout.id, validLevelIds).map(event => ({
        ...event,
        workoutId: workout.id
    }));
    workout.pendingLevelId = pendingLevelId;
    workout.pendingEffectiveDateKey = pendingLevelId && /^\d{4}-\d{2}-\d{2}$/.test(source.pendingEffectiveDateKey || '')
        ? source.pendingEffectiveDateKey
        : null;
    workout.highestMasteredLevelId = validLevelIds.has(source.highestMasteredLevelId) ? source.highestMasteredLevelId : null;
    workout.highestMasteredAt = Number(source.highestMasteredAt) || null;
    workout.createdAt = Number(source.createdAt) || now;
    workout.updatedAt = Number(source.updatedAt) || workout.createdAt;
    return workout;
}

function normalizeWorkoutCollection(rawWorkouts) {
    if (window.WorkoutCore && typeof window.WorkoutCore.normalizeWorkoutCollection === 'function') {
        return window.WorkoutCore.normalizeWorkoutCollection(rawWorkouts);
    }
    const seen = new Set();
    return (Array.isArray(rawWorkouts) ? rawWorkouts : [])
        .map(workout => normalizeWorkoutForRuntime(workout))
        .filter(workout => {
            if (!workout || !workout.id || seen.has(workout.id)) return false;
            seen.add(workout.id);
            return true;
        });
}

function normalizeWorkoutRoutineStep(step, index = 0) {
    if (window.WorkoutCore && typeof window.WorkoutCore.normalizeRoutineStep === 'function') {
        return window.WorkoutCore.normalizeRoutineStep(step, index);
    }
    const source = step && typeof step === 'object' ? step : {};
    const type = source.type === 'rest' ? 'rest' : 'workout';
    const durationSeconds = Math.max(5, Math.min(3600, Math.round(Number(source.durationSeconds) || (type === 'rest' ? WORKOUT_ROUTINE_DEFAULT_REST_SECONDS : WORKOUT_ROUTINE_DEFAULT_WORK_SECONDS))));
    const workoutId = type === 'workout' ? String(source.workoutId || '').trim() : '';
    return {
        id: String(source.id || '').trim() || createWorkoutId('routine_step'),
        type,
        workoutId,
        durationSeconds,
        targetReps: type === 'workout' ? Math.max(0, Math.round(Number(source.targetReps) || 0)) : 0,
        targetSets: type === 'workout' ? Math.max(0, Math.round(Number(source.targetSets) || 0)) : 0,
        notes: String(source.notes || '').trim().slice(0, 240),
        order: Math.max(1, Math.round(Number(source.order) || (index + 1)))
    };
}

function normalizeWorkoutRoutine(routine) {
    if (window.WorkoutCore && typeof window.WorkoutCore.normalizeRoutine === 'function') {
        return window.WorkoutCore.normalizeRoutine(routine);
    }
    const source = routine && typeof routine === 'object' ? routine : {};
    const now = Date.now();
    const steps = (Array.isArray(source.steps) ? source.steps : [])
        .map((step, index) => normalizeWorkoutRoutineStep(step, index))
        .filter(step => step.type === 'rest' || step.workoutId)
        .sort((a, b) => a.order - b.order);
    steps.forEach((step, index) => { step.order = index + 1; });
    return {
        id: String(source.id || '').trim() || createWorkoutId('routine'),
        name: String(source.name || source.title || 'Routine').trim().slice(0, 120) || 'Routine',
        steps,
        runs: (Array.isArray(source.runs) ? source.runs : []).filter(run => run && typeof run === 'object').slice(-100),
        createdAt: Number(source.createdAt) || now,
        updatedAt: Number(source.updatedAt) || Number(source.createdAt) || now
    };
}

function normalizeWorkoutRoutineCollection(rawRoutines) {
    if (window.WorkoutCore && typeof window.WorkoutCore.normalizeRoutineCollection === 'function') {
        return window.WorkoutCore.normalizeRoutineCollection(rawRoutines);
    }
    const seen = new Set();
    return (Array.isArray(rawRoutines) ? rawRoutines : [])
        .map(routine => normalizeWorkoutRoutine(routine))
        .filter(routine => {
            if (!routine || !routine.id || seen.has(routine.id)) return false;
            seen.add(routine.id);
            return true;
        });
}

function normalizeWorkoutSessionCollection(rawSessions) {
    if (window.WorkoutCore && typeof window.WorkoutCore.normalizeSessionCollection === 'function') {
        return window.WorkoutCore.normalizeSessionCollection(rawSessions);
    }
    return (Array.isArray(rawSessions) ? rawSessions : []).filter(session => session && typeof session === 'object');
}

function normalizeWorkoutRotationCollection(rawRotations) {
    if (window.WorkoutCore && typeof window.WorkoutCore.normalizeRotationCollection === 'function') {
        return window.WorkoutCore.normalizeRotationCollection(rawRotations, Array.isArray(workouts) ? workouts : []);
    }
    return (Array.isArray(rawRotations) ? rawRotations : []).filter(rotation => rotation && typeof rotation === 'object');
}

function getWorkoutById(workoutId) {
    return (Array.isArray(workouts) ? workouts : []).find(workout => workout && workout.id === workoutId) || null;
}

function getWorkoutRoutineById(routineId) {
    return (Array.isArray(workoutRoutines) ? workoutRoutines : []).find(routine => routine && routine.id === routineId) || null;
}

function getWorkoutRotationMemberIds() {
    const rotations = Array.isArray(workoutRotations) ? normalizeWorkoutRotationCollection(workoutRotations) : [];
    return new Set(rotations.flatMap(rotation => rotation.workoutIds || []));
}

function getWorkoutRotationScheduleLabel(rotation) {
    if (!rotation) return '';
    const normalized = window.WorkoutCore && typeof window.WorkoutCore.normalizeRotation === 'function'
        ? window.WorkoutCore.normalizeRotation(rotation, (Array.isArray(workouts) ? workouts : []).map(workout => workout.id))
        : rotation;
    const schedule = normalizeWorkoutSchedule(normalized.schedule);
    const days = schedule.weekdays.map(day => WORKOUT_WEEKDAYS[day]).join(', ');
    const time = schedule.time ? ` at ${schedule.time}` : '';
    const duration = Number(schedule.durationMinutes) > 0 ? ` · ${schedule.durationMinutes}m` : '';
    return `${days}${time}${duration}`;
}

function resolveWorkoutRotationForDate(rotation, date) {
    if (!window.WorkoutCore) return null;
    const safeWorkouts = Array.isArray(workouts) ? workouts : [];
    const dateKey = getWorkoutDateKey(date);
    const todayKey = getWorkoutDateKey();
    if (dateKey < todayKey && Array.isArray(rotation.history)) {
        const historical = rotation.history
            .filter(event => event && event.dateKey === dateKey)
            .sort((a, b) => Number(b.createdAt) - Number(a.createdAt))[0];
        if (historical) {
            const workout = getWorkoutById(historical.workoutId);
            if (workout) {
                return {
                    rotation,
                    workout,
                    reason: 'history',
                    balanced: true
                };
            }
        }
    }
    if (typeof window.WorkoutCore.projectRotationWorkout === 'function' && dateKey >= todayKey) {
        return window.WorkoutCore.projectRotationWorkout(rotation, safeWorkouts, date, new Date());
    }
    if (typeof window.WorkoutCore.resolveRotationWorkout === 'function') {
        return window.WorkoutCore.resolveRotationWorkout(rotation, safeWorkouts);
    }
    return null;
}

function addWorkoutHistoryEvent(workout, type, details = {}) {
    if (!workout || !type) return null;
    normalizeWorkoutForRuntime(workout);
    const createdAt = Number(details.createdAt) || Date.now();
    const event = {
        id: createWorkoutId('workout_event'),
        workoutId: workout.id,
        type: String(type).slice(0, 60),
        dateKey: details.dateKey || getWorkoutDateKey(new Date(createdAt)),
        levelId: details.levelId || null,
        fromLevelId: details.fromLevelId || null,
        toLevelId: details.toLevelId || null,
        payload: details.payload && typeof details.payload === 'object' ? details.payload : {},
        createdAt
    };
    workout.history.push(event);
    workout.history = normalizeWorkoutHistory(workout.history, workout.id, new Set(workout.levels.map(level => level.id)));
    return event;
}

function getOrderedWorkoutLevels(workout) {
    normalizeWorkoutForRuntime(workout);
    return workout.levels.slice().sort((a, b) => a.order - b.order);
}

function getWorkoutLevel(workout, levelId) {
    return getOrderedWorkoutLevels(workout).find(level => level.id === levelId) || null;
}

function isWorkoutScheduledOnDate(workout, date = new Date()) {
    normalizeWorkoutForRuntime(workout);
    const dateKey = getWorkoutDateKey(date);
    const startKey = getWorkoutDateKey(new Date(Number(workout.createdAt) || Date.now()));
    if (dateKey < startKey) return false;
    return workout.schedule.weekdays.includes(new Date(date).getDay());
}

function getNextWorkoutDateKey(workout, fromDate = new Date(), includeToday = true) {
    normalizeWorkoutForRuntime(workout);
    const startOffset = includeToday ? 0 : 1;
    for (let offset = startOffset; offset <= 370; offset++) {
        const candidate = addWorkoutDays(fromDate, offset);
        if (isWorkoutScheduledOnDate(workout, candidate)) return getWorkoutDateKey(candidate);
    }
    return null;
}

function getWorkoutScheduleLabel(workout) {
    normalizeWorkoutForRuntime(workout);
    const days = workout.schedule.weekdays.map(day => WORKOUT_WEEKDAYS[day]).join(', ');
    const time = workout.schedule.time ? ` at ${workout.schedule.time}` : '';
    const duration = Number(workout.schedule.durationMinutes) > 0 ? ` · ${workout.schedule.durationMinutes}m` : '';
    return `${days}${time}${duration}`;
}

function getWorkoutDayLogs(workout, dateKey = getWorkoutDateKey(), levelId = null) {
    normalizeWorkoutForRuntime(workout);
    return workout.logs.filter(log => {
        if (log.scheduledDateKey !== dateKey) return false;
        if (levelId && log.levelId !== levelId) return false;
        return true;
    });
}

function getWorkoutDayMetrics(workout, dateKey = getWorkoutDateKey()) {
    if (window.WorkoutCore && typeof window.WorkoutCore.getDayMetrics === 'function') {
        return window.WorkoutCore.getDayMetrics(workout, dateKey);
    }
    normalizeWorkoutForRuntime(workout);
    const date = parseWorkoutDateKey(dateKey) || new Date();
    const policy = normalizeWorkoutProgressionPolicy(workout.progressionPolicy);
    const targetReps = Number(workout.targetReps) === policy.advancedSetReps ? policy.advancedSetReps : policy.normalSetReps;
    const levelLogs = getWorkoutDayLogs(workout, dateKey, workout.currentLevelId);
    const qualifyingSets = levelLogs.filter(log => Number(log.reps) >= targetReps).length;
    const partialLogs = levelLogs.filter(log => Number(log.reps) < targetReps);
    return {
        dateKey,
        scheduled: isWorkoutScheduledOnDate(workout, date),
        targetReps,
        requiredSets: policy.requiredSets,
        qualifyingSets,
        partialLogs,
        levelLogs,
        completed: qualifyingSets >= policy.requiredSets
    };
}

function scheduleWorkoutPendingLevel(workout, levelId, fromDateKey = getWorkoutDateKey()) {
    const fromDate = parseWorkoutDateKey(fromDateKey) || new Date();
    const nextDateKey = getNextWorkoutDateKey(workout, fromDate, false);
    const existingLevelId = workout.pendingLevelId;
    const existingDateKey = workout.pendingEffectiveDateKey;
    workout.pendingLevelId = levelId;
    workout.pendingEffectiveDateKey = nextDateKey || getWorkoutDateKey(addWorkoutDays(fromDate, 1));
    return existingLevelId !== workout.pendingLevelId || existingDateKey !== workout.pendingEffectiveDateKey;
}

function applyPendingWorkoutProgression(workout, todayKey = getWorkoutDateKey()) {
    normalizeWorkoutForRuntime(workout);
    if (!workout.pendingLevelId || !workout.pendingEffectiveDateKey) return false;
    if (todayKey < workout.pendingEffectiveDateKey) return false;
    if (!workout.levels.some(level => level.id === workout.pendingLevelId)) {
        workout.pendingLevelId = null;
        workout.pendingEffectiveDateKey = null;
        return true;
    }
    const previousLevelId = workout.currentLevelId;
    workout.currentLevelId = workout.pendingLevelId;
    workout.targetReps = normalizeWorkoutProgressionPolicy(workout.progressionPolicy).normalSetReps;
    workout.currentLevelStartedAt = Date.now();
    workout.pendingLevelId = null;
    workout.pendingEffectiveDateKey = null;
    workout.highestMasteredLevelId = null;
    workout.updatedAt = Date.now();
    addWorkoutHistoryEvent(workout, 'level_changed', {
        dateKey: todayKey,
        fromLevelId: previousLevelId,
        toLevelId: workout.currentLevelId
    });
    return true;
}

function evaluateWorkoutProgression(workout, dateKey = getWorkoutDateKey()) {
    normalizeWorkoutForRuntime(workout);
    const metrics = getWorkoutDayMetrics(workout, dateKey);
    if (!metrics.scheduled || !metrics.completed) return false;

    const levels = getOrderedWorkoutLevels(workout);
    const currentIndex = levels.findIndex(level => level.id === workout.currentLevelId);
    if (currentIndex < 0) return false;

    const policy = normalizeWorkoutProgressionPolicy(workout.progressionPolicy);
    if (metrics.targetReps === policy.advancedSetReps) return false;

    if (currentIndex < levels.length - 1) {
        const nextLevelId = levels[currentIndex + 1].id;
        const scheduled = scheduleWorkoutPendingLevel(workout, nextLevelId, dateKey);
        workout.updatedAt = Date.now();
        if (scheduled) {
            addWorkoutHistoryEvent(workout, 'level_scheduled', {
                dateKey,
                fromLevelId: workout.currentLevelId,
                toLevelId: nextLevelId,
                payload: { effectiveDateKey: workout.pendingEffectiveDateKey }
            });
        }
        return true;
    }

    workout.targetReps = policy.advancedSetReps;
    workout.highestMasteredLevelId = workout.currentLevelId;
    workout.highestMasteredAt = Date.now();
    workout.pendingLevelId = null;
    workout.pendingEffectiveDateKey = null;
    workout.updatedAt = Date.now();
    addWorkoutHistoryEvent(workout, 'highest_mastered', {
        dateKey,
        levelId: workout.currentLevelId,
        payload: { targetReps: policy.advancedSetReps }
    });
    return true;
}

function toggleWorkouts(forceOpen = null) {
    const panel = document.getElementById('workouts-panel');
    if (!panel) return;
    const shouldOpen = forceOpen === true || (forceOpen === null && panel.classList.contains('hidden'));
    if (shouldOpen) {
        if (typeof openRightDockPanel === 'function') {
            openRightDockPanel('workouts-panel', () => {
                syncWorkoutComposerMode();
                renderWorkouts();
            });
        } else {
            panel.classList.remove('hidden');
            syncWorkoutComposerMode();
            renderWorkouts();
        }
    } else {
        if (typeof closeRightDockPanel === 'function') closeRightDockPanel('workouts-panel');
        else panel.classList.add('hidden');
    }
}

function toggleWorkoutComposerWeekday(day) {
    const normalized = Number(day);
    if (!Number.isInteger(normalized) || normalized < 0 || normalized > 6) return;
    if (workoutComposerWeekdays.has(normalized) && workoutComposerWeekdays.size > 1) {
        workoutComposerWeekdays.delete(normalized);
    } else {
        workoutComposerWeekdays.add(normalized);
    }
    renderWorkoutComposerWeekdays();
}

function renderWorkoutComposerWeekdays() {
    document.querySelectorAll('#workout-weekday-row .workout-weekday-btn').forEach(button => {
        const day = Number(button.dataset.day);
        button.classList.toggle('active', workoutComposerWeekdays.has(day));
    });
}

function syncWorkoutComposerMode() {
    const submitBtn = document.getElementById('workout-submit-btn');
    const cancelBtn = document.getElementById('workout-cancel-edit-btn');
    const nameInput = document.getElementById('workout-name-input');
    if (submitBtn) submitBtn.innerText = editingWorkoutId ? 'Save' : 'Add';
    if (cancelBtn) cancelBtn.style.display = editingWorkoutId ? 'inline-flex' : 'none';
    if (nameInput) nameInput.placeholder = editingWorkoutId ? 'Edit workout movement...' : 'Workout movement...';
    renderWorkoutComposerWeekdays();
}

function resetWorkoutComposer() {
    editingWorkoutId = null;
    const nameInput = document.getElementById('workout-name-input');
    const timeInput = document.getElementById('workout-time-input');
    const durationInput = document.getElementById('workout-duration-input');
    if (nameInput) nameInput.value = '';
    if (timeInput) timeInput.value = '';
    if (durationInput) durationInput.value = '';
    workoutComposerWeekdays = new Set([new Date().getDay()]);
    syncWorkoutComposerMode();
}

function saveWorkoutFromComposer() {
    const nameInput = document.getElementById('workout-name-input');
    const timeInput = document.getElementById('workout-time-input');
    const durationInput = document.getElementById('workout-duration-input');
    const name = String(nameInput && nameInput.value || '').trim();
    if (!name) return;

    const schedule = {
        weekdays: Array.from(workoutComposerWeekdays),
        time: timeInput && timeInput.value ? timeInput.value : '',
        durationMinutes: durationInput && durationInput.value ? Number(durationInput.value) : null
    };

    if (editingWorkoutId) {
        const workout = getWorkoutById(editingWorkoutId);
        if (!workout) {
            resetWorkoutComposer();
            return;
        }
        workout.name = name.slice(0, 120);
        workout.schedule = normalizeWorkoutSchedule(schedule);
        workout.updatedAt = Date.now();
        showNotification('Workout updated');
    } else {
    const level = createWorkoutLevel('Level 1', 1);
    const policy = normalizeWorkoutProgressionPolicy();
    workouts.push(normalizeWorkoutForRuntime({
            id: createWorkoutId('workout'),
            name,
            unit: 'reps',
            levels: [level],
            currentLevelId: level.id,
            progressionPolicy: policy,
            targetReps: policy.normalSetReps,
            schedule,
            logs: [],
            history: [],
            deloadPolicy: normalizeWorkoutDeloadPolicy(),
            currentLevelStartedAt: Date.now(),
            createdAt: Date.now(),
            updatedAt: Date.now()
        }));
        showNotification('Workout added');
    }

    resetWorkoutComposer();
    renderWorkouts();
    saveToStorage();
}

function editWorkout(workoutId) {
    const workout = getWorkoutById(workoutId);
    if (!workout) return;
    normalizeWorkoutForRuntime(workout);
    editingWorkoutId = workout.id;
    const nameInput = document.getElementById('workout-name-input');
    const timeInput = document.getElementById('workout-time-input');
    const durationInput = document.getElementById('workout-duration-input');
    if (nameInput) {
        nameInput.value = workout.name;
        nameInput.focus();
    }
    if (timeInput) timeInput.value = workout.schedule.time || '';
    if (durationInput) durationInput.value = workout.schedule.durationMinutes ? String(workout.schedule.durationMinutes) : '';
    workoutComposerWeekdays = new Set(workout.schedule.weekdays);
    syncWorkoutComposerMode();
}

function cancelWorkoutEdit() {
    resetWorkoutComposer();
}

function deleteWorkout(workoutId) {
    const workout = getWorkoutById(workoutId);
    if (!workout) return;
    if (!confirm(`Delete "${workout.name}" and all workout logs?`)) return;
    workouts = workouts.filter(item => item.id !== workoutId);
    if (editingWorkoutId === workoutId) resetWorkoutComposer();
    renderWorkouts();
    saveToStorage();
}

function addWorkoutLevel(workoutId, inputId = null) {
    const workout = getWorkoutById(workoutId);
    if (!workout) return;
    normalizeWorkoutForRuntime(workout);
    const input = document.getElementById(inputId || `workout-level-input-${workoutId}`);
    const rawName = String(input && input.value || '').trim();
    if (!rawName) return;

    const previousHighest = getOrderedWorkoutLevels(workout).slice(-1)[0] || null;
    const newLevel = createWorkoutLevel(rawName, workout.levels.length + 1);
    workout.levels.push(newLevel);
    workout.levels = normalizeWorkoutLevels(workout.levels);

    if (
        workout.targetReps === normalizeWorkoutProgressionPolicy(workout.progressionPolicy).advancedSetReps &&
        previousHighest &&
        workout.currentLevelId === previousHighest.id &&
        (workout.highestMasteredLevelId === previousHighest.id || workout.highestMasteredAt)
    ) {
        if (scheduleWorkoutPendingLevel(workout, newLevel.id, getWorkoutDateKey())) {
            addWorkoutHistoryEvent(workout, 'level_scheduled', {
                dateKey: getWorkoutDateKey(),
                fromLevelId: previousHighest.id,
                toLevelId: newLevel.id,
                payload: { reason: 'new_higher_level', effectiveDateKey: workout.pendingEffectiveDateKey }
            });
        }
    }

    workout.updatedAt = Date.now();
    if (input) input.value = '';
    renderWorkouts();
    saveToStorage();
}

function renameWorkoutLevel(workoutId, levelId, context = 'side') {
    const input = document.querySelector(`.workout-level-name-input[data-workout-id="${workoutId}"][data-level-id="${levelId}"][data-level-context="${context}"]`);
    if (input) {
        input.focus();
        if (typeof input.select === 'function') input.select();
        return;
    }
    updateWorkoutLevelName(workoutId, levelId, '');
}

function updateWorkoutLevelName(workoutId, levelId, value) {
    const workout = getWorkoutById(workoutId);
    if (!workout) return;
    const level = getWorkoutLevel(workout, levelId);
    if (!level) return;

    const nextName = String(value || '').trim();
    if (!nextName) {
        renderWorkouts();
        return;
    }
    if (nextName === level.name) return;

    level.name = nextName.trim().slice(0, 80);
    workout.updatedAt = Date.now();
    renderWorkouts();
    saveToStorage();
}

function moveWorkoutLevel(workoutId, levelId, direction) {
    const workout = getWorkoutById(workoutId);
    if (!workout) return;
    const levels = getOrderedWorkoutLevels(workout);
    const index = levels.findIndex(level => level.id === levelId);
    const targetIndex = index + Number(direction);
    if (index < 0 || targetIndex < 0 || targetIndex >= levels.length) return;
    const temp = levels[index].order;
    levels[index].order = levels[targetIndex].order;
    levels[targetIndex].order = temp;
    workout.levels = normalizeWorkoutLevels(levels);
    workout.updatedAt = Date.now();
    renderWorkouts();
    saveToStorage();
}

function deleteWorkoutLevel(workoutId, levelId) {
    const workout = getWorkoutById(workoutId);
    if (!workout) return;
    normalizeWorkoutForRuntime(workout);
    if (workout.levels.length <= 1) {
        showNotification('Keep at least one level');
        return;
    }
    const level = getWorkoutLevel(workout, levelId);
    if (!level || !confirm(`Delete level "${level.name}"? Logs stay in history but will not count toward active progress.`)) return;
    workout.levels = normalizeWorkoutLevels(workout.levels.filter(item => item.id !== levelId));
    if (workout.currentLevelId === levelId) workout.currentLevelId = workout.levels[0].id;
    if (workout.pendingLevelId === levelId) {
        workout.pendingLevelId = null;
        workout.pendingEffectiveDateKey = null;
    }
    workout.updatedAt = Date.now();
    renderWorkouts();
    saveToStorage();
}

function logWorkoutReps(workoutId, reps) {
    const workout = getWorkoutById(workoutId);
    if (!workout) return;
    const todayKey = getWorkoutDateKey();
    applyPendingWorkoutProgression(workout, todayKey);
    normalizeWorkoutForRuntime(workout);

    const parsedReps = Math.max(0, Math.round(Number(reps) || 0));
    if (parsedReps <= 0) return;

    workout.logs.push({
        id: createWorkoutId('workout_log'),
        workoutId: workout.id,
        levelId: workout.currentLevelId,
        scheduledDateKey: todayKey,
        reps: parsedReps,
        targetRepsAtLog: workout.targetReps,
        createdAt: Date.now()
    });

    const progressed = evaluateWorkoutProgression(workout, todayKey);
    workout.updatedAt = Date.now();
    renderWorkouts();
    saveToStorage();
    if (progressed) showNotification('Workout progression updated');
}

function getWorkoutStalenessInfo(workout, todayKey = getWorkoutDateKey()) {
    normalizeWorkoutForRuntime(workout);
    const policy = normalizeWorkoutDeloadPolicy(workout.deloadPolicy);
    const levels = getOrderedWorkoutLevels(workout);
    const currentIndex = levels.findIndex(level => level.id === workout.currentLevelId);
    if (!policy.enabled || currentIndex <= 0) {
        return { eligible: false, daysSinceAttempt: 0, staleAfterDays: policy.staleAfterDays, previousLevel: null, lastAttemptDateKey: null };
    }

    const currentLogs = workout.logs.filter(log => log.levelId === workout.currentLevelId);
    const latestLog = currentLogs.slice().sort((a, b) => {
        const aKey = a.scheduledDateKey || getWorkoutDateKey(new Date(a.createdAt || Date.now()));
        const bKey = b.scheduledDateKey || getWorkoutDateKey(new Date(b.createdAt || Date.now()));
        return bKey.localeCompare(aKey) || (Number(b.createdAt) - Number(a.createdAt));
    })[0] || null;
    const fallbackDateKey = getWorkoutDateKey(new Date(workout.currentLevelStartedAt || workout.updatedAt || workout.createdAt || Date.now()));
    const lastAttemptDateKey = latestLog ? latestLog.scheduledDateKey : fallbackDateKey;
    const lastDate = parseWorkoutDateKey(lastAttemptDateKey);
    const today = parseWorkoutDateKey(todayKey) || new Date();
    const daysSinceAttempt = lastDate ? Math.max(0, Math.floor((today - lastDate) / 86400000)) : 0;

    return {
        eligible: daysSinceAttempt >= policy.staleAfterDays,
        daysSinceAttempt,
        staleAfterDays: policy.staleAfterDays,
        previousLevel: levels[currentIndex - 1] || null,
        currentLevel: levels[currentIndex] || null,
        lastAttemptDateKey
    };
}

function acceptWorkoutDeload(workoutId) {
    const workout = getWorkoutById(workoutId);
    if (!workout) return;
    const info = getWorkoutStalenessInfo(workout);
    if (!info.eligible || !info.previousLevel) return;
    const fromLevelId = workout.currentLevelId;
    workout.currentLevelId = info.previousLevel.id;
    workout.targetReps = normalizeWorkoutProgressionPolicy(workout.progressionPolicy).normalSetReps;
    workout.currentLevelStartedAt = Date.now();
    workout.pendingLevelId = null;
    workout.pendingEffectiveDateKey = null;
    workout.highestMasteredLevelId = null;
    workout.highestMasteredAt = null;
    workout.updatedAt = Date.now();
    addWorkoutHistoryEvent(workout, 'manual_deload', {
        fromLevelId,
        toLevelId: workout.currentLevelId,
        payload: {
            daysSinceAttempt: info.daysSinceAttempt,
            staleAfterDays: info.staleAfterDays
        }
    });
    renderWorkouts();
    saveToStorage();
    showNotification(`Moved ${workout.name} down one level`);
}

function logWorkoutCustomReps(workoutId) {
    const input = document.getElementById(`workout-reps-input-${workoutId}`);
    const reps = Number(input && input.value);
    logWorkoutReps(workoutId, reps);
    if (input) input.value = '';
}

function deleteWorkoutLog(workoutId, logId) {
    const workout = getWorkoutById(workoutId);
    if (!workout) return;
    workout.logs = workout.logs.filter(log => log.id !== logId);
    workout.updatedAt = Date.now();
    renderWorkouts();
    saveToStorage();
}

function getWorkoutNextStatus(workout) {
    normalizeWorkoutForRuntime(workout);
    const todayKey = getWorkoutDateKey();
    if (workout.pendingLevelId && workout.pendingEffectiveDateKey) {
        const pendingLevel = getWorkoutLevel(workout, workout.pendingLevelId);
        return `Next scheduled: ${pendingLevel ? pendingLevel.name : 'next level'} on ${workout.pendingEffectiveDateKey}`;
    }
    const nextDateKey = getNextWorkoutDateKey(workout, new Date(), true);
    return nextDateKey ? `Next scheduled: ${nextDateKey}` : 'No schedule';
}

function formatWorkoutCalendarDateLabel(dateKey, options = {}) {
    const date = parseWorkoutDateKey(dateKey);
    if (!date) return dateKey || '';
    const compact = options.compact === true;
    return date.toLocaleDateString(undefined, compact
        ? { weekday: 'short', month: 'short', day: 'numeric' }
        : { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

function getWorkoutCalendarRange() {
    const anchor = new Date(workoutCalendarDate);
    if (workoutCalendarView === 'month') {
        const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1, 12, 0, 0, 0);
        const start = new Date(first);
        start.setDate(first.getDate() - first.getDay());
        return Array.from({ length: 42 }, (_, index) => addWorkoutDays(start, index));
    }

    const start = new Date(anchor);
    start.setHours(12, 0, 0, 0);
    start.setDate(anchor.getDate() - anchor.getDay());
    return Array.from({ length: 7 }, (_, index) => addWorkoutDays(start, index));
}

function getWorkoutCalendarTitle(dates) {
    if (workoutCalendarView === 'month') {
        return workoutCalendarDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    }
    if (!Array.isArray(dates) || dates.length === 0) return 'This Week';
    const first = dates[0];
    const last = dates[dates.length - 1];
    return `${first.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} - ${last.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
}

function getWorkoutLogsForDate(workout, dateKey) {
    normalizeWorkoutForRuntime(workout);
    return workout.logs.filter(log => log.scheduledDateKey === dateKey);
}

function getWorkoutCalendarDaySummary(dateKey) {
    const date = parseWorkoutDateKey(dateKey) || new Date();
    const todayKey = getWorkoutDateKey();
    const safeWorkouts = Array.isArray(workouts) ? workouts : [];
    const safeRotations = Array.isArray(workoutRotations) ? normalizeWorkoutRotationCollection(workoutRotations) : [];
    const rotationMemberIds = new Set(safeRotations.flatMap(rotation => rotation.workoutIds || []));
    const scheduledRotationWorkoutIds = new Set();
    const scheduledItems = [];
    const unscheduledItems = [];

    safeRotations.forEach(rotation => {
        const scheduled = window.WorkoutCore && typeof window.WorkoutCore.isRotationScheduledOnDate === 'function'
            ? window.WorkoutCore.isRotationScheduledOnDate(rotation, date)
            : normalizeWorkoutSchedule(rotation.schedule).weekdays.includes(date.getDay());
        if (!scheduled) return;
        const resolution = resolveWorkoutRotationForDate(rotation, date);
        const workout = resolution && resolution.workout;
        if (!workout) return;
        normalizeWorkoutForRuntime(workout);
        const metrics = getWorkoutDayMetrics(workout, dateKey);
        const allDateLogs = getWorkoutLogsForDate(workout, dateKey).filter(log => !log.rotationId || log.rotationId === rotation.id);
        const hasLoggedWork = allDateLogs.length > 0;
        const partial = !metrics.completed && (metrics.qualifyingSets > 0 || metrics.partialLogs.length > 0 || hasLoggedWork);
        const currentLevel = getWorkoutLevel(workout, workout.currentLevelId);
        scheduledRotationWorkoutIds.add(workout.id);
        scheduledItems.push({
            type: 'rotation',
            rotation,
            resolution,
            workout,
            metrics,
            allDateLogs,
            currentLevel,
            scheduled: true,
            partial
        });
    });

    safeWorkouts.forEach(workout => {
        normalizeWorkoutForRuntime(workout);
        const scheduled = isWorkoutScheduledOnDate(workout, date);
        const metrics = getWorkoutDayMetrics(workout, dateKey);
        const allDateLogs = getWorkoutLogsForDate(workout, dateKey);
        const hasLoggedWork = allDateLogs.length > 0;
        const partial = !metrics.completed && (metrics.qualifyingSets > 0 || metrics.partialLogs.length > 0 || hasLoggedWork);
        const currentLevel = getWorkoutLevel(workout, workout.currentLevelId);

        const item = {
            workout,
            metrics,
            allDateLogs,
            currentLevel,
            scheduled,
            partial
        };

        if (rotationMemberIds.has(workout.id)) {
            if (!scheduledRotationWorkoutIds.has(workout.id) && hasLoggedWork) unscheduledItems.push(item);
            return;
        }
        if (scheduled) scheduledItems.push(item);
        else if (hasLoggedWork) unscheduledItems.push(item);
    });

    const scheduledCount = scheduledItems.length;
    const completedCount = scheduledItems.filter(item => item.metrics.completed).length;
    const partialCount = scheduledItems.filter(item => item.partial).length;
    const unscheduledLogCount = unscheduledItems.reduce((sum, item) => sum + item.allDateLogs.length, 0);

    let status = 'rest';
    if (scheduledCount > 0 && completedCount === scheduledCount) status = 'completed';
    else if (partialCount > 0) status = 'partial';
    else if (scheduledCount > 0 && dateKey < todayKey) status = 'missed';
    else if (scheduledCount > 0) status = 'upcoming';
    else if (unscheduledLogCount > 0) status = 'logged-unscheduled';

    return {
        dateKey,
        date,
        status,
        scheduledItems,
        unscheduledItems,
        scheduledCount,
        completedCount,
        partialCount,
        unscheduledLogCount,
        isToday: dateKey === todayKey,
        isPast: dateKey < todayKey,
        isFuture: dateKey > todayKey
    };
}

function getWorkoutCalendarStatusLabel(summary) {
    if (!summary) return 'Rest';
    if (summary.status === 'completed') return 'Completed';
    if (summary.status === 'partial') return 'In progress';
    if (summary.status === 'missed') return 'Missed';
    if (summary.status === 'upcoming') return 'Scheduled';
    if (summary.status === 'logged-unscheduled') return 'Logged';
    return 'Rest';
}

function setWorkoutCalendarView(view) {
    workoutCalendarView = view === 'month' ? 'month' : 'week';
    renderWorkoutCalendar();
}

function changeWorkoutCalendarDate(delta) {
    const step = Number(delta) || 0;
    if (workoutCalendarView === 'month') {
        workoutCalendarDate.setDate(1);
        workoutCalendarDate.setMonth(workoutCalendarDate.getMonth() + step);
    } else {
        workoutCalendarDate.setDate(workoutCalendarDate.getDate() + (step * 7));
    }
    selectedWorkoutCalendarDateKey = getWorkoutDateKey(workoutCalendarDate);
    renderWorkoutCalendar();
}

function goToWorkoutCalendarToday() {
    workoutCalendarDate = new Date();
    selectedWorkoutCalendarDateKey = getWorkoutDateKey();
    renderWorkoutCalendar();
}

function selectWorkoutCalendarDate(dateKey) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey || '')) return;
    selectedWorkoutCalendarDateKey = dateKey;
    const date = parseWorkoutDateKey(dateKey);
    if (date) workoutCalendarDate = date;
    renderWorkoutCalendar();
}

function jumpToWorkoutCard(workoutId, attempt = 0) {
    if (!workoutId) return;
    const studioWasOpen = isWorkoutStudioOpen();
    toggleWorkouts(true);
    if (studioWasOpen) closeWorkoutStudioModal();

    const focusWorkoutCard = () => {
        const card = Array.from(document.querySelectorAll('.workout-card'))
            .find(item => item.dataset.workoutId === workoutId);
        if (!card) {
            if (attempt < 8) {
                setTimeout(() => jumpToWorkoutCard(workoutId, attempt + 1), 100);
            } else if (typeof showNotification === 'function') {
                showNotification('Workout card not found');
            }
            return;
        }
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        card.classList.remove('workout-focus-target');
        void card.offsetWidth;
        card.classList.add('workout-focus-target');
        setTimeout(() => card.classList.remove('workout-focus-target'), 2400);
    };

    setTimeout(focusWorkoutCard, studioWasOpen ? 140 : 40);
}

function renderWorkoutCalendarDayCell(date, visibleMonth) {
    const dateKey = getWorkoutDateKey(date);
    const summary = getWorkoutCalendarDaySummary(dateKey);
    const isCurrentMonth = visibleMonth === null || date.getMonth() === visibleMonth;
    const isSelected = dateKey === selectedWorkoutCalendarDateKey;
    const statusLabel = getWorkoutCalendarStatusLabel(summary);
    const cell = document.createElement('button');
    cell.type = 'button';
    cell.className = `workout-calendar-day status-${summary.status}${summary.isToday ? ' today' : ''}${isSelected ? ' selected' : ''}${!isCurrentMonth ? ' dim' : ''}`;
    cell.dataset.dateKey = dateKey;
    cell.onclick = () => selectWorkoutCalendarDate(dateKey);

    const chips = summary.scheduledItems.slice(0, workoutCalendarView === 'month' ? 2 : 4).map(item => {
        const metrics = item.metrics;
        const itemStatus = metrics.completed ? 'done' : (item.partial ? 'partial' : (summary.isPast ? 'missed' : 'upcoming'));
        const label = item.type === 'rotation' ? `${item.workout.name} · ${item.rotation.name}` : item.workout.name;
        return `
            <span class="workout-calendar-chip ${itemStatus}" title="${escapeHtml(label)}">
                ${escapeHtml(item.workout.name)}
                <b>${metrics.qualifyingSets}/${metrics.requiredSets || WORKOUT_REQUIRED_SETS}</b>
            </span>
        `;
    }).join('');

    const extraCount = Math.max(0, summary.scheduledItems.length - (workoutCalendarView === 'month' ? 2 : 4));
    const unscheduledBadge = summary.unscheduledLogCount > 0
        ? `<span class="workout-calendar-chip logged">+${summary.unscheduledLogCount} log${summary.unscheduledLogCount === 1 ? '' : 's'}</span>`
        : '';

    cell.innerHTML = `
        <span class="workout-calendar-day-head">
            <span>${WORKOUT_WEEKDAYS[date.getDay()]}</span>
            <strong>${date.getDate()}</strong>
        </span>
        <span class="workout-calendar-day-status">${statusLabel}</span>
        <span class="workout-calendar-chip-list">
            ${chips}
            ${extraCount > 0 ? `<span class="workout-calendar-chip more">+${extraCount}</span>` : ''}
            ${unscheduledBadge}
        </span>
    `;
    return cell;
}

function renderWorkoutCalendarDetails() {
    renderWorkoutCalendarDetailsTarget({
        detailId: 'workout-calendar-day-detail'
    });
}

function renderWorkoutCalendarDetailsTarget(options = {}) {
    const detail = document.getElementById(options.detailId || 'workout-calendar-day-detail');
    if (!detail) return;

    const summary = getWorkoutCalendarDaySummary(selectedWorkoutCalendarDateKey);
    const scheduledRows = summary.scheduledItems.map(item => {
        const metrics = item.metrics;
        const levelName = item.currentLevel ? item.currentLevel.name : 'Level';
        const subLabel = item.type === 'rotation'
            ? `${item.rotation.name} · ${getWorkoutRotationScheduleLabel(item.rotation)}`
            : `${levelName} · ${metrics.targetReps} reps`;
        const status = metrics.completed ? 'Completed' : (item.partial ? 'In progress' : (summary.isPast ? 'Missed' : 'Scheduled'));
        const jumpButton = summary.isToday
            ? `<button type="button" class="workout-calendar-jump-btn" onclick="jumpToWorkoutCard('${item.workout.id}')">Show</button>`
            : '';
        return `
            <div class="workout-calendar-detail-row ${metrics.completed ? 'done' : item.partial ? 'partial' : summary.isPast ? 'missed' : 'upcoming'}">
                <div>
                    <strong>${escapeHtml(item.workout.name)}</strong>
                    <span>${escapeHtml(subLabel)} · ${metrics.qualifyingSets}/${metrics.requiredSets || WORKOUT_REQUIRED_SETS} sets · ${metrics.partialLogs.length} partial</span>
                </div>
                <div class="workout-calendar-detail-actions">
                    <span>${status}</span>
                    ${jumpButton}
                </div>
            </div>
        `;
    }).join('');

    const unscheduledRows = summary.unscheduledItems.map(item => {
        const totalReps = item.allDateLogs.reduce((sum, log) => sum + (Number(log.reps) || 0), 0);
        return `
            <div class="workout-calendar-detail-row logged">
                <div>
                    <strong>${escapeHtml(item.workout.name)}</strong>
                    <span>${item.allDateLogs.length} unscheduled entr${item.allDateLogs.length === 1 ? 'y' : 'ies'} · ${Math.round(totalReps)} reps</span>
                </div>
                <div class="workout-calendar-detail-actions">
                    <span>Logged</span>
                </div>
            </div>
        `;
    }).join('');

    detail.innerHTML = `
        <div class="workout-calendar-detail-head">
            <strong>${escapeHtml(formatWorkoutCalendarDateLabel(summary.dateKey))}</strong>
            <span>${escapeHtml(getWorkoutCalendarStatusLabel(summary))}</span>
        </div>
        <div class="workout-calendar-detail-list">
            ${scheduledRows || '<div class="workout-calendar-empty-detail">No scheduled workouts.</div>'}
            ${unscheduledRows ? `<div class="workout-calendar-detail-subtitle">Unscheduled logs</div>${unscheduledRows}` : ''}
        </div>
    `;
}

function renderWorkoutCalendar() {
    renderWorkoutCalendarTarget({
        gridId: 'workout-calendar-grid',
        titleId: 'workout-calendar-title',
        detailId: 'workout-calendar-day-detail',
        buttonSelector: '.workout-calendar-mode-btn',
        switchId: 'workout-calendar-mode-switch'
    });
    renderWorkoutCalendarTarget({
        gridId: 'workout-studio-calendar-grid',
        titleId: 'workout-studio-calendar-title',
        detailId: 'workout-studio-calendar-day-detail',
        buttonSelector: '.workout-studio-calendar-mode-btn',
        switchId: 'workout-studio-calendar-mode-switch'
    });
}

function renderWorkoutCalendarTarget(options = {}) {
    const grid = document.getElementById(options.gridId || 'workout-calendar-grid');
    const title = document.getElementById(options.titleId || 'workout-calendar-title');
    if (!grid || !title) return;

    const dates = getWorkoutCalendarRange();
    if (!dates.some(date => getWorkoutDateKey(date) === selectedWorkoutCalendarDateKey)) {
        selectedWorkoutCalendarDateKey = getWorkoutDateKey(workoutCalendarDate);
    }

    title.innerText = getWorkoutCalendarTitle(dates);
    grid.className = `workout-calendar-grid workout-calendar-${workoutCalendarView}`;
    grid.innerHTML = '';

    document.querySelectorAll(options.buttonSelector || '.workout-calendar-mode-btn').forEach(button => {
        button.classList.toggle('active', button.dataset.workoutCalendarView === workoutCalendarView);
    });
    if (typeof syncSegmentedSlider === 'function') {
        syncSegmentedSlider(document.getElementById(options.switchId || 'workout-calendar-mode-switch'));
    }

    const visibleMonth = workoutCalendarView === 'month' ? workoutCalendarDate.getMonth() : null;
    dates.forEach(date => {
        grid.appendChild(renderWorkoutCalendarDayCell(date, visibleMonth));
    });
    renderWorkoutCalendarDetailsTarget(options);
}

function isWorkoutStudioOpen() {
    return false;
}

function getWorkoutSubappTabForStudio(tab = '') {
    const value = String(tab || '').trim().toLowerCase();
    if (value === 'levels') return 'library';
    if (value === 'history') return 'progress';
    const allowed = ['today', 'calendar', 'routines', 'progress', 'session', 'library'];
    return allowed.includes(value) ? value : 'today';
}

function getWorkoutStudioSelectedWorkout() {
    if (!Array.isArray(workouts) || workouts.length === 0) return null;
    if (!workoutStudioSelectedWorkoutId || !getWorkoutById(workoutStudioSelectedWorkoutId)) {
        workoutStudioSelectedWorkoutId = workouts[0].id;
    }
    return getWorkoutById(workoutStudioSelectedWorkoutId);
}

function openWorkoutStudioModal(tab = null, workoutId = null) {
    const targetTab = getWorkoutSubappTabForStudio(tab);
    const safeWorkoutId = workoutId && getWorkoutById(workoutId) ? workoutId : '';
    if (typeof openWorkoutSubapp === 'function') {
        openWorkoutSubapp(targetTab, safeWorkoutId);
        return;
    }
    const query = new URLSearchParams();
    if (targetTab) query.set('tab', targetTab);
    if (safeWorkoutId) query.set('workoutId', safeWorkoutId);
    window.location.href = 'Workouts/index.html' + (query.toString() ? ('?' + query.toString()) : '');
}

function closeWorkoutStudioModal() {
    // Legacy main-app modal entry point; the focused workspace is Workouts/index.html.
}

function setWorkoutStudioTab(tab) {
    openWorkoutStudioModal(tab, workoutStudioSelectedWorkoutId);
}

function selectWorkoutStudioWorkout(workoutId) {
    if (getWorkoutById(workoutId)) workoutStudioSelectedWorkoutId = workoutId;
    renderWorkoutStudio();
}

function setWorkoutProgressRange(range) {
    workoutProgressRange = ['30', '90', 'all'].includes(String(range)) ? String(range) : '90';
    renderWorkoutStudio();
}

function toggleWorkoutDeloadPolicy(workoutId, enabled) {
    const workout = getWorkoutById(workoutId);
    if (!workout) return;
    normalizeWorkoutForRuntime(workout);
    workout.deloadPolicy.enabled = !!enabled;
    workout.updatedAt = Date.now();
    renderWorkouts();
    saveToStorage();
}

function updateWorkoutDeloadDays(workoutId, value) {
    const workout = getWorkoutById(workoutId);
    if (!workout) return;
    normalizeWorkoutForRuntime(workout);
    workout.deloadPolicy.staleAfterDays = Math.max(7, Math.min(180, Math.round(Number(value) || WORKOUT_DELOAD_DAYS)));
    workout.updatedAt = Date.now();
    renderWorkouts();
    saveToStorage();
}

function renderWorkoutStudioWorkoutSelect(workout, label = 'Workout') {
    const options = (Array.isArray(workouts) ? workouts : []).map(item => `
        <option value="${escapeHtml(item.id)}" ${workout && item.id === workout.id ? 'selected' : ''}>${escapeHtml(item.name)}</option>
    `).join('');
    return `
        <label class="workout-studio-select-label">
            <span>${escapeHtml(label)}</span>
            <select onchange="selectWorkoutStudioWorkout(this.value)">
                ${options}
            </select>
        </label>
    `;
}

function renderWorkoutStudioWeekdayInputs(group, selectedDays) {
    const selected = new Set(normalizeWorkoutWeekdays(selectedDays));
    return WORKOUT_WEEKDAYS.map((label, day) => `
        <label class="workout-studio-weekday">
            <input
                type="checkbox"
                data-workout-studio-weekday-group="${escapeHtml(group)}"
                value="${day}"
                ${selected.has(day) ? 'checked' : ''}>
            <span>${escapeHtml(label)}</span>
        </label>
    `).join('');
}

function getWorkoutStudioScheduleFromGroup(group) {
    const checkedDays = Array.from(document.querySelectorAll(`input[data-workout-studio-weekday-group="${group}"]:checked`))
        .map(input => Number(input.value))
        .filter(day => Number.isInteger(day) && day >= 0 && day <= 6);
    const timeInput = document.getElementById(`workout-studio-time-${group}`);
    const durationInput = document.getElementById(`workout-studio-duration-${group}`);
    return normalizeWorkoutSchedule({
        weekdays: checkedDays.length ? checkedDays : [new Date().getDay()],
        time: timeInput && timeInput.value ? timeInput.value : '',
        durationMinutes: durationInput && durationInput.value ? Number(durationInput.value) : null
    });
}

function renderWorkoutStudioSetupForm(workout = null) {
    const isEdit = !!workout;
    const group = isEdit ? `edit-${workout.id}` : 'new';
    const schedule = isEdit ? normalizeWorkoutSchedule(workout.schedule) : normalizeWorkoutSchedule({ weekdays: [new Date().getDay()] });
    const nameValue = isEdit ? escapeHtml(workout.name) : '';
    const buttonText = isEdit ? 'Save Workout' : 'Add Workout';
    const title = isEdit ? 'Workout Details' : 'Add Workout';
    return `
        <section class="workout-studio-section">
            <div class="workout-studio-section-title">${title}</div>
            <div class="workout-studio-form">
                <label>
                    <span>Movement</span>
                    <input
                        id="workout-studio-name-${escapeHtml(group)}"
                        type="text"
                        maxlength="120"
                        value="${nameValue}"
                        placeholder="Workout movement..."
                        onkeypress="if(event.key==='Enter') saveWorkoutFromStudio('${isEdit ? workout.id : ''}')">
                </label>
                <div class="workout-studio-weekdays" aria-label="${title} weekdays">
                    ${renderWorkoutStudioWeekdayInputs(group, schedule.weekdays)}
                </div>
                <div class="workout-studio-form-grid">
                    <label>
                        <span>Time</span>
                        <input id="workout-studio-time-${escapeHtml(group)}" type="time" value="${escapeHtml(schedule.time || '')}">
                    </label>
                    <label>
                        <span>Minutes</span>
                        <input id="workout-studio-duration-${escapeHtml(group)}" type="number" min="5" max="240" step="5" value="${schedule.durationMinutes || ''}" placeholder="Optional">
                    </label>
                </div>
                <button type="button" class="workout-rep-btn primary workout-studio-submit" onclick="saveWorkoutFromStudio('${isEdit ? workout.id : ''}')">${buttonText}</button>
            </div>
        </section>
    `;
}

function saveWorkoutFromStudio(workoutId = '') {
    const isEdit = !!workoutId;
    const group = isEdit ? `edit-${workoutId}` : 'new';
    const nameInput = document.getElementById(`workout-studio-name-${group}`);
    const name = String(nameInput && nameInput.value || '').trim();
    if (!name) {
        showNotification('Add a workout movement name first');
        if (nameInput) nameInput.focus();
        return;
    }

    const schedule = getWorkoutStudioScheduleFromGroup(group);
    if (isEdit) {
        const workout = getWorkoutById(workoutId);
        if (!workout) return;
        normalizeWorkoutForRuntime(workout);
        workout.name = name.slice(0, 120);
        workout.schedule = schedule;
        workout.updatedAt = Date.now();
        showNotification('Workout updated');
    } else {
        const level = createWorkoutLevel('Level 1', 1);
        const policy = normalizeWorkoutProgressionPolicy();
        const workout = normalizeWorkoutForRuntime({
            id: createWorkoutId('workout'),
            name,
            unit: 'reps',
            levels: [level],
            currentLevelId: level.id,
            progressionPolicy: policy,
            targetReps: policy.normalSetReps,
            schedule,
            logs: [],
            history: [],
            deloadPolicy: normalizeWorkoutDeloadPolicy(),
            currentLevelStartedAt: Date.now(),
            createdAt: Date.now(),
            updatedAt: Date.now()
        });
        workouts.push(workout);
        workoutStudioSelectedWorkoutId = workout.id;
        workoutStudioActiveTab = 'levels';
        showNotification('Workout added');
    }

    renderWorkouts();
    saveToStorage();
}

function getWorkoutLevelLabelForRoutineStep(step) {
    if (!step || step.type !== 'workout') return 'Rest';
    const workout = getWorkoutById(step.workoutId);
    if (!workout) return 'Missing workout';
    const level = getWorkoutLevel(workout, workout.currentLevelId);
    return `${workout.name} · ${level ? level.name : 'Current level'}`;
}

function formatWorkoutRoutineDuration(totalSeconds) {
    const seconds = Math.max(0, Math.round(Number(totalSeconds) || 0));
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins <= 0) return `${secs}s`;
    return `${mins}:${String(secs).padStart(2, '0')}`;
}

function createWorkoutRoutineDraftStep(type = 'workout') {
    const safeType = type === 'rest' ? 'rest' : 'workout';
    const firstWorkout = Array.isArray(workouts) ? workouts[0] : null;
    return normalizeWorkoutRoutineStep({
        id: createWorkoutId('routine_step'),
        type: safeType,
        workoutId: safeType === 'workout' && firstWorkout ? firstWorkout.id : '',
        durationSeconds: safeType === 'rest' ? WORKOUT_ROUTINE_DEFAULT_REST_SECONDS : WORKOUT_ROUTINE_DEFAULT_WORK_SECONDS,
        targetReps: 0,
        targetSets: 0,
        notes: '',
        order: workoutRoutineDraftSteps.length + 1
    }, workoutRoutineDraftSteps.length);
}

function syncWorkoutRoutineDraftFromInputs() {
    const nameInput = document.getElementById('workout-routine-name-input');
    if (nameInput) workoutRoutineDraftName = String(nameInput.value || '').trim();
    workoutRoutineDraftSteps = workoutRoutineDraftSteps.map((step, index) => {
        const id = step.id;
        const workoutInput = document.getElementById(`routine-step-workout-${id}`);
        const durationInput = document.getElementById(`routine-step-duration-${id}`);
        const repsInput = document.getElementById(`routine-step-reps-${id}`);
        const setsInput = document.getElementById(`routine-step-sets-${id}`);
        const notesInput = document.getElementById(`routine-step-notes-${id}`);
        return normalizeWorkoutRoutineStep({
            ...step,
            workoutId: workoutInput ? workoutInput.value : step.workoutId,
            durationSeconds: durationInput ? Number(durationInput.value) : step.durationSeconds,
            targetReps: repsInput ? Number(repsInput.value) : step.targetReps,
            targetSets: setsInput ? Number(setsInput.value) : step.targetSets,
            notes: notesInput ? notesInput.value : step.notes,
            order: index + 1
        }, index);
    });
}

function resetWorkoutRoutineDraft() {
    editingWorkoutRoutineId = null;
    workoutRoutineDraftName = '';
    workoutRoutineDraftSteps = [];
    const nameInput = document.getElementById('workout-routine-name-input');
    if (nameInput) nameInput.value = '';
    renderWorkoutStudio();
}

function editWorkoutRoutine(routineId) {
    const routine = getWorkoutRoutineById(routineId);
    if (!routine) return;
    const normalized = normalizeWorkoutRoutine(routine);
    editingWorkoutRoutineId = normalized.id;
    workoutRoutineDraftName = normalized.name;
    workoutRoutineDraftSteps = normalized.steps.map((step, index) => normalizeWorkoutRoutineStep({ ...step, id: createWorkoutId('routine_step_edit') }, index));
    renderWorkoutStudio();
    const nameInput = document.getElementById('workout-routine-name-input');
    if (nameInput) {
        nameInput.value = normalized.name;
        nameInput.focus();
    }
}

function addWorkoutRoutineDraftStep(type = 'workout') {
    syncWorkoutRoutineDraftFromInputs();
    workoutRoutineDraftSteps.push(createWorkoutRoutineDraftStep(type));
    renderWorkoutStudio();
}

function removeWorkoutRoutineDraftStep(stepId) {
    syncWorkoutRoutineDraftFromInputs();
    workoutRoutineDraftSteps = workoutRoutineDraftSteps.filter(step => step.id !== stepId);
    renderWorkoutStudio();
}

function moveWorkoutRoutineDraftStep(stepId, direction) {
    syncWorkoutRoutineDraftFromInputs();
    const index = workoutRoutineDraftSteps.findIndex(step => step.id === stepId);
    const targetIndex = index + Number(direction);
    if (index < 0 || targetIndex < 0 || targetIndex >= workoutRoutineDraftSteps.length) return;
    const next = workoutRoutineDraftSteps.slice();
    const temp = next[index];
    next[index] = next[targetIndex];
    next[targetIndex] = temp;
    workoutRoutineDraftSteps = next.map((step, stepIndex) => ({ ...step, order: stepIndex + 1 }));
    renderWorkoutStudio();
}

function saveWorkoutRoutineFromStudio() {
    const nameInput = document.getElementById('workout-routine-name-input');
    const name = String(nameInput && nameInput.value || '').trim();
    if (!name) {
        showNotification('Name the routine first');
        if (nameInput) nameInput.focus();
        return;
    }
    syncWorkoutRoutineDraftFromInputs();
    const steps = workoutRoutineDraftSteps
        .map((step, index) => normalizeWorkoutRoutineStep({ ...step, order: index + 1 }, index))
        .filter(step => step.type === 'rest' || getWorkoutById(step.workoutId));
    if (steps.length === 0) {
        showNotification('Add at least one workout or rest step');
        return;
    }

    if (!Array.isArray(workoutRoutines)) workoutRoutines = [];
    if (editingWorkoutRoutineId) {
        const routine = getWorkoutRoutineById(editingWorkoutRoutineId);
        if (!routine) return;
        routine.name = name.slice(0, 120);
        routine.steps = steps;
        routine.updatedAt = Date.now();
        showNotification('Routine updated');
    } else {
        const routine = normalizeWorkoutRoutine({
            id: createWorkoutId('routine'),
            name,
            steps,
            runs: [],
            createdAt: Date.now(),
            updatedAt: Date.now()
        });
        workoutRoutines.push(routine);
        showNotification('Routine saved');
    }

    editingWorkoutRoutineId = null;
    workoutRoutineDraftName = '';
    workoutRoutineDraftSteps = [];
    renderWorkouts();
    saveToStorage();
}

function deleteWorkoutRoutine(routineId) {
    const routine = getWorkoutRoutineById(routineId);
    if (!routine) return;
    if (!confirm(`Delete routine "${routine.name}"?`)) return;
    workoutRoutines = workoutRoutines.filter(item => item.id !== routineId);
    if (editingWorkoutRoutineId === routineId) {
        editingWorkoutRoutineId = null;
        workoutRoutineDraftName = '';
        workoutRoutineDraftSteps = [];
    }
    renderWorkouts();
    saveToStorage();
}

function renderWorkoutDeloadRecommendation(workout) {
    const info = getWorkoutStalenessInfo(workout);
    if (!info.eligible || !info.previousLevel) return '';
    return `
        <div class="workout-deload-card">
            <div>
                <strong>Stale level suggestion</strong>
                <span>No attempt at ${escapeHtml(info.currentLevel ? info.currentLevel.name : 'this level')} for ${info.daysSinceAttempt} days. Drop to ${escapeHtml(info.previousLevel.name)} when you want a cleaner restart.</span>
            </div>
            <button type="button" class="workout-rep-btn primary" onclick="acceptWorkoutDeload('${workout.id}')">Drop One Level</button>
        </div>
    `;
}

function renderWorkoutStudioToday() {
    const todayKey = getWorkoutDateKey();
    const safeWorkouts = Array.isArray(workouts) ? workouts : [];
    const rows = safeWorkouts.map(workout => {
        normalizeWorkoutForRuntime(workout);
        const metrics = getWorkoutDayMetrics(workout, todayKey);
        const currentLevel = getWorkoutLevel(workout, workout.currentLevelId);
        const status = metrics.completed ? 'Completed' : (metrics.qualifyingSets > 0 || metrics.partialLogs.length > 0 ? 'In progress' : (metrics.scheduled ? 'Scheduled' : 'Unscheduled'));
        return `
            <div class="workout-studio-row ${metrics.completed ? 'done' : metrics.scheduled ? 'scheduled' : ''}">
                <div>
                    <strong>${escapeHtml(workout.name)}</strong>
                    <span>${escapeHtml(currentLevel ? currentLevel.name : 'Level')} · ${metrics.targetReps} reps · ${metrics.qualifyingSets}/${metrics.requiredSets || WORKOUT_REQUIRED_SETS} sets · ${metrics.partialLogs.length} partial</span>
                </div>
                <div class="workout-studio-row-actions">
                    <span>${status}</span>
                    <button type="button" class="workout-calendar-jump-btn" onclick="jumpToWorkoutCard('${workout.id}')">Show</button>
                    <button type="button" class="workout-calendar-jump-btn" onclick="openWorkoutStudioModal('progress', '${workout.id}')">Graph</button>
                </div>
            </div>
            ${renderWorkoutDeloadRecommendation(workout)}
        `;
    }).join('');

    return `
        <div class="workout-studio-grid two">
            <section class="workout-studio-section">
                <div class="workout-studio-section-title">Today</div>
                <div class="workout-studio-list">${rows || '<div class="workout-empty-state">No workouts yet.</div>'}</div>
            </section>
            <section class="workout-studio-section">
                <div class="workout-studio-section-title">Selected Day</div>
                <div id="workout-studio-calendar-day-detail" class="workout-calendar-day-detail"></div>
            </section>
        </div>
    `;
}

function renderWorkoutStudioCalendar() {
    return `
        <section class="workout-studio-section">
            <div class="workout-calendar-toolbar">
                <button type="button" class="workout-icon-btn" onclick="changeWorkoutCalendarDate(-1)" aria-label="Previous workout calendar period">&lt;</button>
                <div id="workout-studio-calendar-title" class="workout-calendar-title">This Week</div>
                <button type="button" class="workout-icon-btn" onclick="changeWorkoutCalendarDate(1)" aria-label="Next workout calendar period">&gt;</button>
            </div>
            <div class="workout-calendar-mode-row">
                <div class="workout-calendar-mode-switch panel-slider" id="workout-studio-calendar-mode-switch" aria-label="Workout calendar view">
                    <button type="button" class="workout-calendar-mode-btn workout-studio-calendar-mode-btn panel-slider-option active" data-workout-calendar-view="week" onclick="setWorkoutCalendarView('week')">Week</button>
                    <button type="button" class="workout-calendar-mode-btn workout-studio-calendar-mode-btn panel-slider-option" data-workout-calendar-view="month" onclick="setWorkoutCalendarView('month')">Month</button>
                </div>
                <button type="button" class="workout-calendar-today-btn" onclick="goToWorkoutCalendarToday()">Today</button>
            </div>
            <div id="workout-studio-calendar-grid" class="workout-calendar-grid workout-calendar-${workoutCalendarView} workout-studio-calendar-grid"></div>
            <div id="workout-studio-calendar-day-detail" class="workout-calendar-day-detail"></div>
        </section>
    `;
}

function renderWorkoutStudioLevels() {
    const workout = getWorkoutStudioSelectedWorkout();
    if (!workout) return renderWorkoutStudioSetupForm(null);
    normalizeWorkoutForRuntime(workout);
    const policy = normalizeWorkoutDeloadPolicy(workout.deloadPolicy);
    return `
        <div class="workout-studio-topbar">
            ${renderWorkoutStudioWorkoutSelect(workout, 'Manage Levels')}
        </div>
        <div class="workout-studio-grid two workout-studio-setup-grid">
            ${renderWorkoutStudioSetupForm(workout)}
            ${renderWorkoutStudioSetupForm(null)}
        </div>
        ${renderWorkoutDeloadRecommendation(workout)}
        <div class="workout-studio-grid two">
            <section class="workout-studio-section">
                <div class="workout-studio-section-title">Levels</div>
                <div class="workout-level-list">${renderWorkoutLevels(workout, 'studio')}</div>
                <div class="workout-level-add-row">
                    <input type="text" id="workout-studio-level-input-${workout.id}" placeholder="New level name" onkeypress="if(event.key==='Enter') addWorkoutLevel('${workout.id}', 'workout-studio-level-input-${workout.id}')">
                    <button class="workout-rep-btn" onclick="addWorkoutLevel('${workout.id}', 'workout-studio-level-input-${workout.id}')">Add Level</button>
                </div>
            </section>
            <section class="workout-studio-section">
                <div class="workout-studio-section-title">Stale-Level Rule</div>
                <div class="workout-deload-settings">
                    <label>
                        <input type="checkbox" ${policy.enabled ? 'checked' : ''} onchange="toggleWorkoutDeloadPolicy('${workout.id}', this.checked)">
                        Suggest a one-level drop after a stale level
                    </label>
                    <label>
                        <span>Days without an attempt</span>
                        <input type="number" min="7" max="180" step="1" value="${policy.staleAfterDays}" onchange="updateWorkoutDeloadDays('${workout.id}', this.value)">
                    </label>
                    <p>Any log entry at the active level counts as an attempt. The app will only suggest the drop; it will not move you automatically.</p>
                </div>
            </section>
        </div>
    `;
}

function renderWorkoutRoutineStepEditor(step, index) {
    const workoutOptions = (Array.isArray(workouts) ? workouts : []).map(workout => {
        const level = getWorkoutLevel(workout, workout.currentLevelId);
        return `<option value="${escapeHtml(workout.id)}" ${step.workoutId === workout.id ? 'selected' : ''}>${escapeHtml(workout.name)} · ${escapeHtml(level ? level.name : 'Current level')}</option>`;
    }).join('');
    const isRest = step.type === 'rest';
    return `
        <div class="workout-routine-step-editor ${isRest ? 'rest' : 'workout'}">
            <div class="workout-routine-step-order">${index + 1}</div>
            <div class="workout-routine-step-fields">
                <div class="workout-routine-step-head">
                    <strong>${isRest ? 'Rest' : 'Workout'}</strong>
                    <span>${escapeHtml(getWorkoutLevelLabelForRoutineStep(step))}</span>
                </div>
                ${isRest ? '' : `
                    <label>
                        <span>Workout</span>
                        <select id="routine-step-workout-${step.id}" onchange="syncWorkoutRoutineDraftFromInputs(); renderWorkoutStudio();">
                            ${workoutOptions}
                        </select>
                    </label>
                `}
                <div class="workout-studio-form-grid">
                    <label>
                        <span>Seconds</span>
                        <input id="routine-step-duration-${step.id}" type="number" min="5" max="3600" step="5" value="${step.durationSeconds}">
                    </label>
                    ${isRest ? '<span></span>' : `
                        <label>
                            <span>Rep Target</span>
                            <input id="routine-step-reps-${step.id}" type="number" min="0" max="9999" step="1" value="${step.targetReps || ''}" placeholder="Optional">
                        </label>
                    `}
                    ${isRest ? '' : `
                        <label>
                            <span>Sets Target</span>
                            <input id="routine-step-sets-${step.id}" type="number" min="0" max="99" step="1" value="${step.targetSets || ''}" placeholder="Optional">
                        </label>
                    `}
                </div>
                <label>
                    <span>Notes</span>
                    <input id="routine-step-notes-${step.id}" type="text" maxlength="240" value="${escapeHtml(step.notes || '')}" placeholder="${isRest ? 'Breathe, hydrate, reset...' : 'Form cue or target...'}">
                </label>
            </div>
            <div class="workout-routine-step-actions">
                <button type="button" class="workout-icon-btn" onclick="moveWorkoutRoutineDraftStep('${step.id}', -1)" title="Move up">↑</button>
                <button type="button" class="workout-icon-btn" onclick="moveWorkoutRoutineDraftStep('${step.id}', 1)" title="Move down">↓</button>
                <button type="button" class="workout-icon-btn danger" onclick="removeWorkoutRoutineDraftStep('${step.id}')" title="Remove">✕</button>
            </div>
        </div>
    `;
}

function renderWorkoutRoutineBuilder() {
    const editingRoutine = editingWorkoutRoutineId ? getWorkoutRoutineById(editingWorkoutRoutineId) : null;
    const nameValue = escapeHtml(workoutRoutineDraftName || (editingRoutine ? editingRoutine.name : ''));
    const stepsHtml = workoutRoutineDraftSteps.map((step, index) => renderWorkoutRoutineStepEditor(step, index)).join('');
    return `
        <section class="workout-studio-section">
            <div class="workout-studio-section-title">${editingRoutine ? 'Edit Routine' : 'Build Routine'}</div>
            <div class="workout-studio-form workout-routine-builder">
                <label>
                    <span>Routine Name</span>
                    <input id="workout-routine-name-input" type="text" maxlength="120" value="${nameValue}" placeholder="e.g., Morning density circuit">
                </label>
                <div class="workout-routine-builder-actions">
                    <button type="button" class="workout-rep-btn" onclick="addWorkoutRoutineDraftStep('workout')" ${Array.isArray(workouts) && workouts.length ? '' : 'disabled'}>Add Workout</button>
                    <button type="button" class="workout-rep-btn" onclick="addWorkoutRoutineDraftStep('rest')">Add Rest</button>
                    <button type="button" class="workout-rep-btn primary" onclick="saveWorkoutRoutineFromStudio()">Save Routine</button>
                    ${editingRoutine ? '<button type="button" class="workout-rep-btn" onclick="resetWorkoutRoutineDraft()">Cancel</button>' : ''}
                </div>
                <div class="workout-routine-step-list">
                    ${stepsHtml || '<div class="workout-empty-state">Add workout and rest steps. Workout steps use the selected workout&apos;s current level when you start.</div>'}
                </div>
            </div>
        </section>
    `;
}

function renderWorkoutRoutineCard(routine) {
    const steps = routine.steps.map(step => {
        if (step.type === 'rest') return `<span class="workout-routine-step-chip rest">Rest · ${step.durationSeconds}s</span>`;
        const workout = getWorkoutById(step.workoutId);
        const level = workout ? getWorkoutLevel(workout, workout.currentLevelId) : null;
        return `<span class="workout-routine-step-chip">${escapeHtml(workout ? workout.name : 'Missing workout')} · ${escapeHtml(level ? level.name : 'Current level')} · ${step.durationSeconds}s</span>`;
    }).join('');
    const totalSeconds = routine.steps.reduce((sum, step) => sum + (Number(step.durationSeconds) || 0), 0);
    return `
        <div class="workout-routine-card">
            <div class="workout-routine-card-head">
                <div>
                    <strong>${escapeHtml(routine.name)}</strong>
                    <span>${routine.steps.length} step${routine.steps.length === 1 ? '' : 's'} · ${formatWorkoutRoutineDuration(totalSeconds)}</span>
                </div>
                <div class="workout-card-actions">
                    <button type="button" class="workout-rep-btn primary" onclick="startWorkoutRoutine('${routine.id}')">Start</button>
                    <button type="button" class="workout-icon-btn" onclick="editWorkoutRoutine('${routine.id}')" title="Edit routine">✎</button>
                    <button type="button" class="workout-icon-btn danger" onclick="deleteWorkoutRoutine('${routine.id}')" title="Delete routine">✕</button>
                </div>
            </div>
            <div class="workout-routine-step-chips">${steps || '<span class="workout-routine-step-chip rest">No steps</span>'}</div>
        </div>
    `;
}

function renderWorkoutStudioRoutines() {
    if (!Array.isArray(workoutRoutines)) workoutRoutines = [];
    workoutRoutines = normalizeWorkoutRoutineCollection(workoutRoutines);
    const routineCards = workoutRoutines
        .slice()
        .sort((a, b) => Number(b.updatedAt) - Number(a.updatedAt))
        .map(renderWorkoutRoutineCard)
        .join('');
    return `
        <div class="workout-studio-grid two">
            ${renderWorkoutRoutineBuilder()}
            <section class="workout-studio-section">
                <div class="workout-studio-section-title">Saved Routines</div>
                <div class="workout-routine-card-list">
                    ${routineCards || '<div class="workout-empty-state">No saved routines yet.</div>'}
                </div>
            </section>
        </div>
    `;
}

function getWorkoutRoutineEntryForStep(stepId) {
    if (!activeWorkoutRoutineRun || !Array.isArray(activeWorkoutRoutineRun.entries)) return null;
    return activeWorkoutRoutineRun.entries.find(entry => entry.stepId === stepId) || null;
}

function saveVisibleRoutineReps() {
    if (!activeWorkoutRoutineRun) return;
    document.querySelectorAll('[data-routine-entry-id]').forEach(input => {
        const entryId = input.dataset.routineEntryId;
        const entry = activeWorkoutRoutineRun.entries.find(item => item.entryId === entryId);
        if (!entry) return;
        const raw = String(input.value || '').trim();
        entry.reps = raw === '' ? null : Math.max(0, Math.round(Number(raw) || 0));
    });
}

function updateActiveRoutineEntryReps(entryId, value) {
    if (!activeWorkoutRoutineRun) return;
    const entry = activeWorkoutRoutineRun.entries.find(item => item.entryId === entryId);
    if (!entry) return;
    const raw = String(value || '').trim();
    entry.reps = raw === '' ? null : Math.max(0, Math.round(Number(raw) || 0));
}

function getWorkoutRoutineAudioContext() {
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextCtor) return null;
    if (!workoutRoutineAudioContext) workoutRoutineAudioContext = new AudioContextCtor();
    return workoutRoutineAudioContext;
}

function unlockWorkoutRoutineAudio() {
    try {
        const context = getWorkoutRoutineAudioContext();
        if (context && context.state === 'suspended' && typeof context.resume === 'function') {
            context.resume().catch(() => {});
        }
    } catch (error) {
        workoutRoutineAudioContext = null;
    }
}

function playWorkoutRoutineTone(frequency = 880, duration = 0.12, delay = 0, volume = 0.06) {
    try {
        const context = getWorkoutRoutineAudioContext();
        if (!context) return;
        const start = context.currentTime + delay;
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(frequency, start);
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(volume, start + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start(start);
        oscillator.stop(start + duration + 0.02);
    } catch (error) {
        // Audio is optional; routine timing should never depend on sound support.
    }
}

function playWorkoutRoutineCountdownBeep(remainingSeconds) {
    const frequency = remainingSeconds === 1 ? 1046 : 880;
    playWorkoutRoutineTone(frequency, 0.1, 0, 0.055);
}

function playWorkoutRoutineTransitionSound() {
    playWorkoutRoutineTone(660, 0.11, 0, 0.065);
    playWorkoutRoutineTone(990, 0.14, 0.12, 0.07);
}

function startWorkoutRoutine(routineId) {
    const routine = getWorkoutRoutineById(routineId);
    if (!routine || !Array.isArray(routine.steps) || routine.steps.length === 0) {
        showNotification('Add routine steps first');
        return;
    }
    const startedAt = Date.now();
    const steps = routine.steps.map((step, index) => {
        const workout = step.type === 'workout' ? getWorkoutById(step.workoutId) : null;
        const level = workout ? getWorkoutLevel(workout, workout.currentLevelId) : null;
        return {
            ...step,
            order: index + 1,
            workoutName: workout ? workout.name : 'Missing workout',
            levelId: workout ? workout.currentLevelId : null,
            levelName: level ? level.name : 'Current level',
            targetRepsAtStart: workout ? workout.targetReps : WORKOUT_NORMAL_SET_REPS
        };
    });
    activeWorkoutRoutineRun = {
        id: createWorkoutId('routine_run'),
        routineId: routine.id,
        routineName: routine.name,
        startedAt,
        completedAt: null,
        status: 'running',
        currentIndex: 0,
        stepStartedAt: startedAt,
        stepEndsAt: startedAt + (steps[0].durationSeconds * 1000),
        lastCountdownBeepSecond: null,
        steps,
        entries: steps
            .filter(step => step.type === 'workout')
            .map(step => ({
                entryId: createWorkoutId('routine_entry'),
                stepId: step.id,
                workoutId: step.workoutId,
                workoutName: step.workoutName,
                levelId: step.levelId,
                levelName: step.levelName,
                targetRepsAtLog: step.targetRepsAtStart,
                reps: null
            }))
    };
    unlockWorkoutRoutineAudio();
    openWorkoutRoutinePlayer();
}

function openWorkoutRoutinePlayer() {
    const player = document.getElementById('workout-routine-player');
    const backdrop = document.getElementById('workout-routine-player-backdrop');
    if (!player || !backdrop || !activeWorkoutRoutineRun) return;
    backdrop.classList.add('visible');
    player.classList.add('visible');
    renderWorkoutRoutinePlayer();
    if (workoutRoutineTimerId) clearInterval(workoutRoutineTimerId);
    workoutRoutineTimerId = setInterval(tickWorkoutRoutinePlayer, 250);
}

function closeWorkoutRoutinePlayer(clearRun = true) {
    const player = document.getElementById('workout-routine-player');
    const backdrop = document.getElementById('workout-routine-player-backdrop');
    if (workoutRoutineTimerId) clearInterval(workoutRoutineTimerId);
    workoutRoutineTimerId = null;
    if (player) player.classList.remove('visible');
    if (backdrop) backdrop.classList.remove('visible');
    if (clearRun) activeWorkoutRoutineRun = null;
}

function tickWorkoutRoutinePlayer() {
    if (!activeWorkoutRoutineRun || activeWorkoutRoutineRun.status !== 'running') return;
    const now = Date.now();
    if (now >= activeWorkoutRoutineRun.stepEndsAt) {
        advanceWorkoutRoutineStep();
        return;
    }
    const remainingSeconds = Math.max(0, Math.ceil((activeWorkoutRoutineRun.stepEndsAt - now) / 1000));
    if (
        remainingSeconds >= 1 &&
        remainingSeconds <= 3 &&
        activeWorkoutRoutineRun.lastCountdownBeepSecond !== remainingSeconds
    ) {
        activeWorkoutRoutineRun.lastCountdownBeepSecond = remainingSeconds;
        playWorkoutRoutineCountdownBeep(remainingSeconds);
    }
    updateWorkoutRoutineTimerDisplay();
}

function updateWorkoutRoutineTimerDisplay() {
    if (!activeWorkoutRoutineRun) return;
    const currentStep = activeWorkoutRoutineRun.steps[activeWorkoutRoutineRun.currentIndex];
    if (!currentStep) return;
    const remainingSeconds = Math.max(0, Math.ceil((activeWorkoutRoutineRun.stepEndsAt - Date.now()) / 1000));
    const timerEl = document.getElementById('workout-routine-player-time');
    const fillEl = document.getElementById('workout-routine-player-fill');
    if (timerEl) timerEl.innerText = formatWorkoutRoutineDuration(remainingSeconds);
    if (fillEl) {
        const total = Math.max(1, Number(currentStep.durationSeconds) || 1);
        const percent = Math.max(0, Math.min(100, (remainingSeconds / total) * 100));
        fillEl.style.width = `${percent}%`;
    }
}

function advanceWorkoutRoutineStep() {
    if (!activeWorkoutRoutineRun) return;
    saveVisibleRoutineReps();
    if (activeWorkoutRoutineRun.status === 'running') playWorkoutRoutineTransitionSound();
    activeWorkoutRoutineRun.currentIndex += 1;
    if (activeWorkoutRoutineRun.currentIndex >= activeWorkoutRoutineRun.steps.length) {
        activeWorkoutRoutineRun.status = 'review';
        activeWorkoutRoutineRun.completedAt = Date.now();
        if (workoutRoutineTimerId) clearInterval(workoutRoutineTimerId);
        workoutRoutineTimerId = null;
        renderWorkoutRoutinePlayer();
        return;
    }
    const now = Date.now();
    const step = activeWorkoutRoutineRun.steps[activeWorkoutRoutineRun.currentIndex];
    activeWorkoutRoutineRun.stepStartedAt = now;
    activeWorkoutRoutineRun.stepEndsAt = now + (step.durationSeconds * 1000);
    activeWorkoutRoutineRun.lastCountdownBeepSecond = null;
    renderWorkoutRoutinePlayer();
}

function getPreviousWorkoutRoutineEntry() {
    if (!activeWorkoutRoutineRun) return null;
    for (let index = activeWorkoutRoutineRun.currentIndex - 1; index >= 0; index--) {
        const step = activeWorkoutRoutineRun.steps[index];
        if (step && step.type === 'workout') return getWorkoutRoutineEntryForStep(step.id);
    }
    return null;
}

function renderWorkoutRoutinePlayer() {
    const content = document.getElementById('workout-routine-player-content');
    if (!content || !activeWorkoutRoutineRun) return;

    if (activeWorkoutRoutineRun.status === 'review') {
        content.innerHTML = renderWorkoutRoutineReview();
        return;
    }

    const step = activeWorkoutRoutineRun.steps[activeWorkoutRoutineRun.currentIndex];
    const isRest = step.type === 'rest';
    const nextStep = activeWorkoutRoutineRun.steps[activeWorkoutRoutineRun.currentIndex + 1] || null;
    const previousEntry = isRest ? getPreviousWorkoutRoutineEntry() : null;
    const totalSteps = activeWorkoutRoutineRun.steps.length;
    const stepLabel = isRest ? 'Rest' : 'Workout';
    const title = isRest ? 'Rest' : step.workoutName;
    const subtitle = isRest ? (nextStep ? `Next: ${nextStep.type === 'rest' ? 'Rest' : nextStep.workoutName}` : 'Final rest') : step.levelName;
    content.innerHTML = `
        <div class="workout-routine-player-shell ${isRest ? 'rest' : 'workout'}">
            <div class="workout-routine-player-top">
                <div>
                    <span>${escapeHtml(activeWorkoutRoutineRun.routineName)}</span>
                    <strong id="workout-routine-player-title">${escapeHtml(stepLabel)} ${activeWorkoutRoutineRun.currentIndex + 1} / ${totalSteps}</strong>
                </div>
                <button type="button" class="workout-routine-player-close" onclick="closeWorkoutRoutinePlayer(true)">✕</button>
            </div>
            <div class="workout-routine-player-main">
                <div class="workout-routine-player-kicker">${escapeHtml(stepLabel)}</div>
                <div class="workout-routine-player-title-main">${escapeHtml(title)}</div>
                <div class="workout-routine-player-subtitle">${escapeHtml(subtitle)}</div>
                ${step.notes ? `<div class="workout-routine-player-note">${escapeHtml(step.notes)}</div>` : ''}
                <div id="workout-routine-player-time" class="workout-routine-player-time">${formatWorkoutRoutineDuration(Math.ceil((activeWorkoutRoutineRun.stepEndsAt - Date.now()) / 1000))}</div>
                <div class="workout-routine-player-track"><div id="workout-routine-player-fill" class="workout-routine-player-fill"></div></div>
                ${!isRest && (step.targetReps || step.targetSets) ? `<div class="workout-routine-player-target">${step.targetSets ? `${step.targetSets} set${step.targetSets === 1 ? '' : 's'}` : ''}${step.targetSets && step.targetReps ? ' · ' : ''}${step.targetReps ? `${step.targetReps} rep target` : ''}</div>` : ''}
                ${previousEntry ? `
                    <div class="workout-routine-player-reps">
                        <label>
                            <span>${escapeHtml(previousEntry.workoutName)} reps</span>
                            <input data-routine-entry-id="${previousEntry.entryId}" type="number" min="0" step="1" value="${previousEntry.reps ?? ''}" placeholder="Reps completed" oninput="updateActiveRoutineEntryReps('${previousEntry.entryId}', this.value)">
                        </label>
                    </div>
                ` : ''}
            </div>
            <div class="workout-routine-player-actions">
                <button type="button" class="workout-rep-btn" onclick="advanceWorkoutRoutineStep()">Skip / Next</button>
            </div>
        </div>
    `;
    updateWorkoutRoutineTimerDisplay();
}

function renderWorkoutRoutineReview() {
    const rows = activeWorkoutRoutineRun.entries.map(entry => `
        <label class="workout-routine-review-row">
            <span>
                <strong>${escapeHtml(entry.workoutName)}</strong>
                <em>${escapeHtml(entry.levelName)}</em>
            </span>
            <input data-routine-entry-id="${entry.entryId}" type="number" min="0" step="1" value="${entry.reps ?? ''}" placeholder="Reps">
        </label>
    `).join('');
    return `
        <div class="workout-routine-review-shell">
            <div class="workout-routine-player-top">
                <div>
                    <span>Routine complete</span>
                    <strong id="workout-routine-player-title">${escapeHtml(activeWorkoutRoutineRun.routineName)}</strong>
                </div>
                <button type="button" class="workout-routine-player-close" onclick="closeWorkoutRoutinePlayer(true)">✕</button>
            </div>
            <div class="workout-routine-review-body">
                <div class="workout-routine-review-title">Review reps</div>
                <div class="workout-routine-review-list">${rows || '<div class="workout-empty-state">No workout steps to log.</div>'}</div>
                <div class="workout-routine-player-actions">
                    <button type="button" class="workout-rep-btn" onclick="closeWorkoutRoutinePlayer(true)">Discard</button>
                    <button type="button" class="workout-rep-btn primary" onclick="saveWorkoutRoutineRun()">Save Run</button>
                </div>
            </div>
        </div>
    `;
}

function saveWorkoutRoutineRun() {
    if (!activeWorkoutRoutineRun) return;
    saveVisibleRoutineReps();
    const todayKey = getWorkoutDateKey();
    const createdAt = Date.now();
    let loggedCount = 0;
    activeWorkoutRoutineRun.entries.forEach(entry => {
        const reps = Math.max(0, Math.round(Number(entry.reps) || 0));
        if (reps <= 0) return;
        const workout = getWorkoutById(entry.workoutId);
        if (!workout) return;
        normalizeWorkoutForRuntime(workout);
        workout.logs.push({
            id: createWorkoutId('workout_log'),
            workoutId: workout.id,
            levelId: entry.levelId || workout.currentLevelId,
            scheduledDateKey: todayKey,
            reps,
            targetRepsAtLog: entry.targetRepsAtLog || workout.targetReps || WORKOUT_NORMAL_SET_REPS,
            routineId: activeWorkoutRoutineRun.routineId,
            routineRunId: activeWorkoutRoutineRun.id,
            source: 'routine',
            createdAt: createdAt + loggedCount
        });
        workout.updatedAt = Date.now();
        loggedCount += 1;
    });
    const routine = getWorkoutRoutineById(activeWorkoutRoutineRun.routineId);
    if (routine) {
        routine.runs = Array.isArray(routine.runs) ? routine.runs : [];
        routine.runs.push({
            id: activeWorkoutRoutineRun.id,
            startedAt: activeWorkoutRoutineRun.startedAt,
            completedAt: activeWorkoutRoutineRun.completedAt || Date.now(),
            entries: activeWorkoutRoutineRun.entries.map(entry => ({
                workoutId: entry.workoutId,
                levelId: entry.levelId,
                reps: Math.max(0, Math.round(Number(entry.reps) || 0))
            }))
        });
        routine.runs = routine.runs.slice(-100);
        routine.updatedAt = Date.now();
    }
    closeWorkoutRoutinePlayer(true);
    renderWorkouts();
    saveToStorage();
    showNotification(`Routine saved · ${loggedCount} workout entr${loggedCount === 1 ? 'y' : 'ies'}`);
}

function getWorkoutEventLabel(workout, entry) {
    const levelName = id => {
        const level = id ? getWorkoutLevel(workout, id) : null;
        return level ? level.name : 'Level';
    };
    if (entry.kind === 'log') {
        return `${entry.reps} reps at ${levelName(entry.levelId)}${entry.qualifies ? ' · set' : ' · partial'}`;
    }
    if (entry.type === 'manual_deload') return `Dropped from ${levelName(entry.fromLevelId)} to ${levelName(entry.toLevelId)}`;
    if (entry.type === 'level_changed') return `Advanced from ${levelName(entry.fromLevelId)} to ${levelName(entry.toLevelId)}`;
    if (entry.type === 'level_scheduled') return `Next level scheduled: ${levelName(entry.toLevelId)}`;
    if (entry.type === 'highest_mastered') return `Highest level mastered · requirement changed to ${normalizeWorkoutProgressionPolicy(workout.progressionPolicy).advancedSetReps} reps`;
    return String(entry.type || 'Workout event').replace(/_/g, ' ');
}

function renderWorkoutStudioHistory() {
    const workout = getWorkoutStudioSelectedWorkout();
    if (!workout) return '<div class="workout-empty-state">Add a workout movement first.</div>';
    normalizeWorkoutForRuntime(workout);
    const events = workout.history.map(event => ({ ...event, kind: 'event' }));
    const logs = workout.logs.map(log => ({
        ...log,
        kind: 'log',
        dateKey: log.scheduledDateKey,
        qualifies: Number(log.reps) >= (Number(log.targetRepsAtLog) || WORKOUT_NORMAL_SET_REPS)
    }));
    const rows = events.concat(logs)
        .sort((a, b) => Number(b.createdAt) - Number(a.createdAt))
        .slice(0, 100)
        .map(entry => `
            <div class="workout-studio-row ${entry.kind === 'log' && entry.qualifies ? 'done' : ''}">
                <div>
                    <strong>${escapeHtml(getWorkoutEventLabel(workout, entry))}</strong>
                    <span>${escapeHtml(formatWorkoutCalendarDateLabel(entry.dateKey, { compact: true }))}</span>
                </div>
                <span>${entry.kind === 'log' ? 'Log' : 'Event'}</span>
            </div>
        `).join('');

    return `
        <div class="workout-studio-topbar">
            ${renderWorkoutStudioWorkoutSelect(workout, 'History')}
        </div>
        <section class="workout-studio-section">
            <div class="workout-studio-section-title">Recent History</div>
            <div class="workout-studio-list">${rows || '<div class="workout-empty-state">No workout history yet.</div>'}</div>
        </section>
    `;
}

function getWorkoutProgressPoints(workout, range = workoutProgressRange) {
    normalizeWorkoutForRuntime(workout);
    const policy = normalizeWorkoutProgressionPolicy(workout.progressionPolicy);
    const today = parseWorkoutDateKey(getWorkoutDateKey()) || new Date();
    const allDates = workout.logs.map(log => log.scheduledDateKey).filter(Boolean)
        .concat(workout.history.map(event => event.dateKey).filter(Boolean));
    let start;
    if (range === 'all' && allDates.length > 0) {
        start = parseWorkoutDateKey(allDates.slice().sort()[0]) || addWorkoutDays(today, -29);
    } else {
        const days = range === '30' ? 30 : 90;
        start = addWorkoutDays(today, -(days - 1));
    }

    const points = [];
    for (let cursor = new Date(start); getWorkoutDateKey(cursor) <= getWorkoutDateKey(today); cursor = addWorkoutDays(cursor, 1)) {
        const dateKey = getWorkoutDateKey(cursor);
        const logs = getWorkoutLogsForDate(workout, dateKey);
        const totalReps = logs.reduce((sum, log) => sum + Math.round(Number(log.reps) || 0), 0);
        const sets = logs.filter(log => Number(log.reps) >= (Number(log.targetRepsAtLog) || policy.normalSetReps)).length;
        const partials = logs.filter(log => Number(log.reps) < (Number(log.targetRepsAtLog) || policy.normalSetReps)).length;
        points.push({
            dateKey,
            totalReps,
            sets,
            partials,
            scheduled: isWorkoutScheduledOnDate(workout, cursor),
            completed: sets >= policy.requiredSets
        });
    }
    return points;
}

function renderWorkoutBarChart(points, valueKey, title, color = '#14b8a6') {
    const safePoints = Array.isArray(points) && points.length ? points : [{ dateKey: getWorkoutDateKey(), [valueKey]: 0 }];
    const maxValue = Math.max(1, ...safePoints.map(point => Number(point[valueKey]) || 0));
    const hasData = safePoints.some(point => Number(point[valueKey]) > 0);
    const bars = safePoints.map(point => {
        const value = Number(point[valueKey]) || 0;
        const height = hasData ? Math.max(3, Math.round((value / maxValue) * 100)) : 0;
        return `
            <span
                class="workout-chart-bar ${point.completed ? 'completed' : ''} ${value > 0 ? 'has-value' : ''}"
                style="height:${height}%; --workout-chart-color:${color};"
                title="${escapeHtml(point.dateKey)} · ${value}">
            </span>
        `;
    }).join('');
    return `
        <div class="workout-chart">
            <div class="workout-chart-title">${escapeHtml(title)}</div>
            <div class="workout-chart-plot" role="img" aria-label="${escapeHtml(title)}">
                ${hasData ? bars : '<div class="workout-chart-empty">No reps logged yet.</div>'}
            </div>
        </div>
    `;
}

function renderWorkoutProgressTimeline(workout) {
    const events = workout.history
        .filter(event => ['manual_deload', 'level_changed', 'level_scheduled', 'highest_mastered'].includes(event.type))
        .slice()
        .sort((a, b) => Number(b.createdAt) - Number(a.createdAt))
        .slice(0, 8);
    if (events.length === 0) return '<div class="workout-empty-state">Level changes will appear here.</div>';
    return events.map(event => `
        <div class="workout-timeline-row">
            <span>${escapeHtml(formatWorkoutCalendarDateLabel(event.dateKey, { compact: true }))}</span>
            <strong>${escapeHtml(getWorkoutEventLabel(workout, event))}</strong>
        </div>
    `).join('');
}

function renderWorkoutStudioProgress() {
    const workout = getWorkoutStudioSelectedWorkout();
    if (!workout) return '<div class="workout-empty-state">Add a workout movement first.</div>';
    normalizeWorkoutForRuntime(workout);
    const points = getWorkoutProgressPoints(workout);
    const totalReps = points.reduce((sum, point) => sum + point.totalReps, 0);
    const totalSets = points.reduce((sum, point) => sum + point.sets, 0);
    const completedDays = points.filter(point => point.completed).length;
    const partialDays = points.filter(point => point.partials > 0 && !point.completed).length;
    const rangeButton = range => `<button type="button" class="workout-calendar-mode-btn ${workoutProgressRange === range ? 'active' : ''}" onclick="setWorkoutProgressRange('${range}')">${range === 'all' ? 'All' : range}</button>`;

    return `
        <div class="workout-studio-topbar workout-progress-topbar">
            ${renderWorkoutStudioWorkoutSelect(workout, 'Workout')}
            <div class="workout-progress-range">${rangeButton('30')}${rangeButton('90')}${rangeButton('all')}</div>
        </div>
        ${renderWorkoutDeloadRecommendation(workout)}
        <div class="workout-status-grid workout-studio-stats">
            <div><span class="workout-status-label">Total reps</span><strong>${Math.round(totalReps)}</strong></div>
            <div><span class="workout-status-label">Sets</span><strong>${totalSets}</strong></div>
            <div><span class="workout-status-label">Completed days</span><strong>${completedDays}</strong></div>
            <div><span class="workout-status-label">Partial days</span><strong>${partialDays}</strong></div>
        </div>
        <div class="workout-studio-grid two">
            <section class="workout-studio-section">
                ${renderWorkoutBarChart(points, 'sets', 'Qualifying sets', '#14b8a6')}
            </section>
            <section class="workout-studio-section">
                ${renderWorkoutBarChart(points, 'totalReps', 'Total reps', '#60a5fa')}
            </section>
        </div>
        <section class="workout-studio-section">
            <div class="workout-studio-section-title">Level Timeline</div>
            <div class="workout-timeline-list">${renderWorkoutProgressTimeline(workout)}</div>
        </section>
    `;
}

function renderWorkoutStudio() {
    const content = document.getElementById('workout-studio-content');
    if (!content) return;
    if (!Array.isArray(workouts)) workouts = [];
    workouts = normalizeWorkoutCollection(workouts);

    document.querySelectorAll('.workout-studio-tab').forEach(button => {
        button.classList.toggle('active', button.dataset.workoutStudioTab === workoutStudioActiveTab);
    });

    if (workouts.length === 0) {
        content.innerHTML = renderWorkoutStudioSetupForm(null);
        return;
    }

    if (workoutStudioActiveTab === 'calendar') content.innerHTML = renderWorkoutStudioCalendar();
    else if (workoutStudioActiveTab === 'levels') content.innerHTML = renderWorkoutStudioLevels();
    else if (workoutStudioActiveTab === 'routines') content.innerHTML = renderWorkoutStudioRoutines();
    else if (workoutStudioActiveTab === 'history') content.innerHTML = renderWorkoutStudioHistory();
    else if (workoutStudioActiveTab === 'progress') content.innerHTML = renderWorkoutStudioProgress();
    else content.innerHTML = renderWorkoutStudioToday();

    if (workoutStudioActiveTab === 'calendar') {
        renderWorkoutCalendar();
    } else if (workoutStudioActiveTab === 'today') {
        renderWorkoutCalendarDetailsTarget({ detailId: 'workout-studio-calendar-day-detail' });
    }
}

function renderWorkoutSummary(prepared) {
    const titleEl = document.getElementById('workout-summary-title');
    const metaEl = document.getElementById('workout-summary-meta');
    const nextEl = document.getElementById('workout-summary-next');
    if (!titleEl || !metaEl || !nextEl) return;

    const todayKey = getWorkoutDateKey();
    const scheduledToday = prepared.filter(item => item.metrics.scheduled);
    titleEl.innerText = prepared.length ? `${prepared.length} workout${prepared.length === 1 ? '' : 's'}` : 'No workouts yet';
    metaEl.innerText = `${scheduledToday.length} scheduled today`;

    if (prepared.length === 0) {
        nextEl.innerText = 'Add a workout movement to begin.';
        return;
    }

    const nextItem = prepared
        .map(item => ({
            workout: item.workout,
            dateKey: getNextWorkoutDateKey(item.workout, new Date(), true)
        }))
        .filter(item => item.dateKey)
        .sort((a, b) => a.dateKey.localeCompare(b.dateKey))[0];

    if (!nextItem) {
        nextEl.innerText = 'No workout schedule available.';
        return;
    }

    const isToday = nextItem.dateKey === todayKey;
    nextEl.innerText = `${isToday ? 'Today' : nextItem.dateKey}: ${nextItem.workout.name}`;
}

function renderWorkoutLevels(workout, context = 'side') {
    const levels = getOrderedWorkoutLevels(workout);
    return levels.map((level, index) => {
        const isCurrent = level.id === workout.currentLevelId;
        const isPending = level.id === workout.pendingLevelId;
        return `
            <div class="workout-level-row ${isCurrent ? 'current' : ''} ${isPending ? 'pending' : ''}">
                <div class="workout-level-main">
                    <span class="workout-level-order">${index + 1}</span>
                    <input
                        class="workout-level-name-input"
                        data-workout-id="${escapeHtml(workout.id)}"
                        data-level-id="${escapeHtml(level.id)}"
                        data-level-context="${escapeHtml(context)}"
                        value="${escapeHtml(level.name)}"
                        aria-label="Level name"
                        onchange="updateWorkoutLevelName('${workout.id}', '${level.id}', this.value)"
                        onkeydown="if(event.key==='Enter'){event.preventDefault(); this.blur();}">
                    ${isCurrent ? '<span class="workout-level-chip">Active</span>' : ''}
                    ${isPending ? '<span class="workout-level-chip pending">Next</span>' : ''}
                </div>
                <div class="workout-level-actions">
                    <button class="workout-icon-btn" onclick="moveWorkoutLevel('${workout.id}', '${level.id}', -1)" title="Move up">↑</button>
                    <button class="workout-icon-btn" onclick="moveWorkoutLevel('${workout.id}', '${level.id}', 1)" title="Move down">↓</button>
                    <button class="workout-icon-btn" onclick="renameWorkoutLevel('${workout.id}', '${level.id}', '${context}')" title="Rename">✎</button>
                    <button class="workout-icon-btn danger" onclick="deleteWorkoutLevel('${workout.id}', '${level.id}')" title="Delete">✕</button>
                </div>
            </div>
        `;
    }).join('');
}

function renderWorkoutLogList(workout, metrics) {
    const logs = metrics.levelLogs.slice().reverse();
    if (logs.length === 0) return '<div class="workout-empty-log">No reps logged today.</div>';
    return logs.map(log => {
        const qualifies = Number(log.reps) >= metrics.targetReps;
        return `
            <div class="workout-log-row ${qualifies ? 'set' : 'partial'}">
                <span>${Math.round(log.reps)} reps</span>
                <span>${qualifies ? 'set' : 'partial'}</span>
                <button class="workout-icon-btn danger" onclick="deleteWorkoutLog('${workout.id}', '${log.id}')" title="Delete log">✕</button>
            </div>
        `;
    }).join('');
}

function renderWorkouts() {
    if (!Array.isArray(workouts)) workouts = [];
    workouts = normalizeWorkoutCollection(workouts);
    if (typeof workoutRotations !== 'undefined') {
        if (!Array.isArray(workoutRotations)) workoutRotations = [];
        workoutRotations = normalizeWorkoutRotationCollection(workoutRotations);
    }
    if (!Array.isArray(workoutRoutines)) workoutRoutines = [];
    workoutRoutines = normalizeWorkoutRoutineCollection(workoutRoutines);
    const todayKey = getWorkoutDateKey();
    let changed = false;
    workouts.forEach(workout => {
        if (applyPendingWorkoutProgression(workout, todayKey)) changed = true;
    });

    const container = document.getElementById('workouts-list-container');
    if (!container) return;

    const prepared = workouts.map(workout => ({
        workout,
        metrics: getWorkoutDayMetrics(workout, todayKey)
    }));
    renderWorkoutSummary(prepared);
    renderWorkoutCalendar();
    syncWorkoutComposerMode();
    if (isWorkoutStudioOpen()) renderWorkoutStudio();

    if (prepared.length === 0) {
        container.innerHTML = '<div class="workout-empty-state">No workout movements tracked yet.</div>';
        if (changed) saveToStorage();
        return;
    }

    container.innerHTML = '';
    prepared.forEach(({ workout, metrics }) => {
        const currentLevel = getWorkoutLevel(workout, workout.currentLevelId);
        const requiredSets = metrics.requiredSets || WORKOUT_REQUIRED_SETS;
        const percent = Math.min(100, Math.round((metrics.qualifyingSets / requiredSets) * 100));
        const partialText = metrics.partialLogs.length > 0 ? `${metrics.partialLogs.length} partial entr${metrics.partialLogs.length === 1 ? 'y' : 'ies'}` : 'No partial entries';
        const scheduleWarning = metrics.scheduled ? '' : '<div class="workout-warning">Today is not scheduled. Logs stay in history but will not auto-level.</div>';
        const nextStatus = getWorkoutNextStatus(workout);
        const policy = normalizeWorkoutProgressionPolicy(workout.progressionPolicy);

        const card = document.createElement('div');
        card.className = `workout-card ${metrics.completed ? 'complete' : ''}`;
        card.dataset.workoutId = workout.id;
        card.innerHTML = `
            <div class="workout-card-head">
                <div>
                    <div class="workout-title">${escapeHtml(workout.name)}</div>
                    <div class="workout-meta">${escapeHtml(getWorkoutScheduleLabel(workout))}</div>
                </div>
                <div class="workout-card-actions">
                    <button class="workout-icon-btn" onclick="editWorkout('${workout.id}')" title="Edit workout">✎</button>
                    <button class="workout-icon-btn danger" onclick="deleteWorkout('${workout.id}')" title="Delete workout">✕</button>
                </div>
            </div>

            <div class="workout-status-grid">
                <div>
                    <span class="workout-status-label">Level</span>
                    <strong>${escapeHtml(currentLevel ? currentLevel.name : 'Level')}</strong>
                </div>
                <div>
                    <span class="workout-status-label">Requirement</span>
                    <strong>${metrics.targetReps} reps</strong>
                </div>
                <div>
                    <span class="workout-status-label">Today</span>
                    <strong>${metrics.qualifyingSets} / ${requiredSets} sets</strong>
                </div>
            </div>

            <div class="workout-progress-track">
                <div class="workout-progress-fill" style="width:${percent}%"></div>
            </div>
            <div class="workout-card-note">${escapeHtml(partialText)} · ${escapeHtml(nextStatus)}</div>
            ${scheduleWarning}

            <div class="workout-log-controls">
                <button class="workout-rep-btn" onclick="logWorkoutReps('${workout.id}', 10)">+10</button>
                <button class="workout-rep-btn primary" onclick="logWorkoutReps('${workout.id}', ${policy.normalSetReps})">+${policy.normalSetReps}</button>
                <button class="workout-rep-btn" onclick="logWorkoutReps('${workout.id}', ${policy.advancedSetReps})">+${policy.advancedSetReps}</button>
                <input type="number" id="workout-reps-input-${workout.id}" min="1" placeholder="Reps" onkeypress="if(event.key==='Enter') logWorkoutCustomReps('${workout.id}')">
                <button class="workout-rep-btn" onclick="logWorkoutCustomReps('${workout.id}')">Log</button>
            </div>

            <div class="workout-section-title">Today&apos;s Entries</div>
            <div class="workout-log-list">${renderWorkoutLogList(workout, metrics)}</div>

            <div class="workout-main-subapp-row">
                <button type="button" class="workout-rep-btn primary" onclick="openWorkoutSubapp()">Open Workouts</button>
                <button type="button" class="workout-rep-btn" onclick="openWorkoutSubapp('library', '${workout.id}')">Manage Levels</button>
            </div>
        `;
        container.appendChild(card);
    });

    if (changed) saveToStorage();
}

window.normalizeWorkoutCollection = normalizeWorkoutCollection;
window.normalizeWorkoutForRuntime = normalizeWorkoutForRuntime;
window.normalizeWorkoutRotationCollection = normalizeWorkoutRotationCollection;
window.normalizeWorkoutRoutineCollection = normalizeWorkoutRoutineCollection;
window.normalizeWorkoutSessionCollection = normalizeWorkoutSessionCollection;
