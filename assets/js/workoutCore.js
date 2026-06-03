(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.WorkoutCore = factory();
    }
})(typeof globalThis !== 'undefined' ? globalThis : window, function () {
    'use strict';

    const NORMAL_SET_REPS = 20;
    const ADVANCED_SET_REPS = 50;
    const REQUIRED_SETS = 3;
    const DELOAD_DAYS = 21;
    const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const ROUTINE_DEFAULT_WORK_SECONDS = 60;
    const ROUTINE_DEFAULT_REST_SECONDS = 30;

    function createId(prefix = 'workout') {
        return `${prefix}_${Date.now()}${Math.random().toString(36).slice(2, 7)}`;
    }

    function dateKey(date = new Date()) {
        const d = new Date(date);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }

    function parseDateKey(value) {
        const parts = String(value || '').split('-').map(Number);
        if (parts.length !== 3 || parts.some(Number.isNaN)) return null;
        return new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0, 0);
    }

    function addDays(date, days) {
        const next = new Date(date);
        next.setDate(next.getDate() + days);
        return next;
    }

    function normalizeWeekdays(days) {
        const source = Array.isArray(days) ? days : [new Date().getDay()];
        const unique = Array.from(new Set(source.map(Number).filter(day => Number.isInteger(day) && day >= 0 && day <= 6)));
        return (unique.length ? unique : [new Date().getDay()]).sort((a, b) => a - b);
    }

    function normalizeSchedule(schedule) {
        const source = schedule && typeof schedule === 'object' ? schedule : {};
        const rawDuration = source.durationMinutes;
        const hasDuration = rawDuration !== undefined && rawDuration !== null && String(rawDuration).trim() !== '';
        const parsedDuration = Number(rawDuration);
        return {
            weekdays: normalizeWeekdays(source.weekdays),
            time: /^\d{2}:\d{2}$/.test(source.time || '') ? source.time : '',
            durationMinutes: hasDuration
                ? Math.max(5, Math.min(240, Math.round(Number.isFinite(parsedDuration) ? parsedDuration : 30)))
                : null
        };
    }

    function normalizeProgressionPolicy(policy) {
        const source = policy && typeof policy === 'object' ? policy : {};
        return {
            requiredSets: Math.max(1, Math.min(20, Math.round(Number(source.requiredSets) || REQUIRED_SETS))),
            normalSetReps: Math.max(1, Math.min(9999, Math.round(Number(source.normalSetReps) || NORMAL_SET_REPS))),
            advancedSetReps: Math.max(1, Math.min(9999, Math.round(Number(source.advancedSetReps) || ADVANCED_SET_REPS)))
        };
    }

    function normalizeDeloadPolicy(policy) {
        const source = policy && typeof policy === 'object' ? policy : {};
        return {
            enabled: source.enabled !== false,
            mode: 'suggest',
            staleAfterDays: Math.max(7, Math.min(180, Math.round(Number(source.staleAfterDays) || DELOAD_DAYS))),
            dropLevels: 1
        };
    }

    function createLevel(name = 'Level 1', order = 1) {
        const safeOrder = Math.max(1, Math.round(Number(order) || 1));
        const safeName = String(name || `Level ${safeOrder}`).trim().slice(0, 80) || `Level ${safeOrder}`;
        return {
            id: createId('workout_level'),
            name: safeName,
            order: safeOrder,
            notes: ''
        };
    }

    function normalizeLevels(levels) {
        const seen = new Set();
        const normalized = (Array.isArray(levels) ? levels : [])
            .map((level, index) => {
                if (!level || typeof level !== 'object') return null;
                const id = String(level.id || '').trim() || createId('workout_level');
                if (seen.has(id)) return null;
                seen.add(id);
                const order = Math.max(1, Math.round(Number(level.order) || (index + 1)));
                return {
                    id,
                    name: String(level.name || level.title || `Level ${order}`).trim().slice(0, 80) || `Level ${order}`,
                    order,
                    notes: String(level.notes || '').trim().slice(0, 500)
                };
            })
            .filter(Boolean)
            .sort((a, b) => a.order - b.order);
        if (!normalized.length) normalized.push(createLevel('Level 1', 1));
        normalized.forEach((level, index) => { level.order = index + 1; });
        return normalized;
    }

    function normalizeHistory(events, workoutId, validLevelIds) {
        const seen = new Set();
        return (Array.isArray(events) ? events : [])
            .map(event => {
                if (!event || typeof event !== 'object') return null;
                const id = String(event.id || '').trim() || createId('workout_event');
                if (seen.has(id)) return null;
                seen.add(id);
                const type = String(event.type || '').trim().slice(0, 60);
                if (!type) return null;
                const createdAt = Number(event.createdAt) || Date.now();
                return {
                    id,
                    workoutId: String(event.workoutId || workoutId || ''),
                    type,
                    dateKey: /^\d{4}-\d{2}-\d{2}$/.test(event.dateKey || '') ? event.dateKey : dateKey(new Date(createdAt)),
                    levelId: validLevelIds.has(event.levelId) ? event.levelId : null,
                    fromLevelId: validLevelIds.has(event.fromLevelId) ? event.fromLevelId : null,
                    toLevelId: validLevelIds.has(event.toLevelId) ? event.toLevelId : null,
                    payload: event.payload && typeof event.payload === 'object' ? event.payload : {},
                    createdAt
                };
            })
            .filter(Boolean)
            .sort((a, b) => Number(a.createdAt) - Number(b.createdAt))
            .slice(-1000);
    }

    function normalizeLogs(logs, workoutId, validLevelIds, policy) {
        const safePolicy = normalizeProgressionPolicy(policy);
        const seen = new Set();
        return (Array.isArray(logs) ? logs : [])
            .map(log => {
                if (!log || typeof log !== 'object') return null;
                const id = String(log.id || '').trim() || createId('workout_log');
                if (seen.has(id)) return null;
                seen.add(id);
                const reps = Math.max(0, Math.round(Number(log.reps) || 0));
                if (reps <= 0) return null;
                const createdAt = Number(log.createdAt) || Date.now();
                const fallbackDateKey = dateKey(new Date(createdAt));
                const targetReps = Math.max(1, Math.round(Number(log.targetRepsAtLog) || safePolicy.normalSetReps));
                return {
                    id,
                    workoutId: String(log.workoutId || workoutId || ''),
                    levelId: validLevelIds.has(log.levelId) ? log.levelId : null,
                    scheduledDateKey: /^\d{4}-\d{2}-\d{2}$/.test(log.scheduledDateKey || '') ? log.scheduledDateKey : fallbackDateKey,
                    reps,
                    targetRepsAtLog: targetReps,
                    source: log.source === 'routine' || log.source === 'session' ? log.source : 'manual',
                    routineId: String(log.routineId || '').trim(),
                    routineRunId: String(log.routineRunId || '').trim(),
                    sessionId: String(log.sessionId || '').trim(),
                    createdAt
                };
            })
            .filter(Boolean)
            .sort((a, b) => Number(a.createdAt) - Number(b.createdAt))
            .slice(-2000);
    }

    function normalizeWorkout(workout) {
        const source = workout && typeof workout === 'object' ? workout : {};
        const target = workout && typeof workout === 'object' ? workout : {};
        const now = Date.now();
        const levels = normalizeLevels(source.levels);
        const validLevelIds = new Set(levels.map(level => level.id));
        const policy = normalizeProgressionPolicy(source.progressionPolicy);
        const currentLevelId = validLevelIds.has(source.currentLevelId) ? source.currentLevelId : levels[0].id;
        const sourceTarget = Math.max(1, Math.round(Number(source.targetReps) || policy.normalSetReps));
        const isAdvanced = sourceTarget >= policy.advancedSetReps || Number(source.targetReps) === ADVANCED_SET_REPS;

        target.id = String(source.id || '').trim() || createId('workout');
        target.name = String(source.name || source.title || 'Workout').trim().slice(0, 120) || 'Workout';
        target.unit = 'reps';
        target.levels = levels;
        target.currentLevelId = currentLevelId;
        target.progressionPolicy = policy;
        target.targetReps = isAdvanced ? policy.advancedSetReps : policy.normalSetReps;
        target.currentLevelStartedAt = Number(source.currentLevelStartedAt) || Number(source.createdAt) || now;
        target.schedule = normalizeSchedule(source.schedule);
        target.deloadPolicy = normalizeDeloadPolicy(source.deloadPolicy);
        target.logs = normalizeLogs(source.logs, target.id, validLevelIds, policy).map(log => ({ ...log, workoutId: target.id }));
        target.history = normalizeHistory(source.history, target.id, validLevelIds).map(event => ({ ...event, workoutId: target.id }));
        target.pendingLevelId = validLevelIds.has(source.pendingLevelId) ? source.pendingLevelId : null;
        target.pendingEffectiveDateKey = target.pendingLevelId && /^\d{4}-\d{2}-\d{2}$/.test(source.pendingEffectiveDateKey || '')
            ? source.pendingEffectiveDateKey
            : null;
        target.highestMasteredLevelId = validLevelIds.has(source.highestMasteredLevelId) ? source.highestMasteredLevelId : null;
        target.highestMasteredAt = Number(source.highestMasteredAt) || null;
        target.createdAt = Number(source.createdAt) || now;
        target.updatedAt = Number(source.updatedAt) || target.createdAt;
        return target;
    }

    function normalizeWorkoutCollection(rawWorkouts) {
        const seen = new Set();
        return (Array.isArray(rawWorkouts) ? rawWorkouts : [])
            .map(normalizeWorkout)
            .filter(workout => {
                if (!workout || !workout.id || seen.has(workout.id)) return false;
                seen.add(workout.id);
                return true;
            });
    }

    function normalizeRoutineStep(step, index = 0) {
        const source = step && typeof step === 'object' ? step : {};
        const type = source.type === 'rest' ? 'rest' : 'workout';
        return {
            id: String(source.id || '').trim() || createId('routine_step'),
            type,
            workoutId: type === 'workout' ? String(source.workoutId || '').trim() : '',
            durationSeconds: Math.max(5, Math.min(3600, Math.round(Number(source.durationSeconds) || (type === 'rest' ? ROUTINE_DEFAULT_REST_SECONDS : ROUTINE_DEFAULT_WORK_SECONDS)))),
            targetReps: type === 'workout' ? Math.max(0, Math.round(Number(source.targetReps) || 0)) : 0,
            targetSets: type === 'workout' ? Math.max(0, Math.round(Number(source.targetSets) || 0)) : 0,
            notes: String(source.notes || '').trim().slice(0, 240),
            order: Math.max(1, Math.round(Number(source.order) || (index + 1)))
        };
    }

    function normalizeRoutine(routine) {
        const source = routine && typeof routine === 'object' ? routine : {};
        const now = Date.now();
        const steps = (Array.isArray(source.steps) ? source.steps : [])
            .map((step, index) => normalizeRoutineStep(step, index))
            .filter(step => step.type === 'rest' || step.workoutId)
            .sort((a, b) => a.order - b.order);
        steps.forEach((step, index) => { step.order = index + 1; });
        return {
            id: String(source.id || '').trim() || createId('routine'),
            name: String(source.name || source.title || 'Routine').trim().slice(0, 120) || 'Routine',
            steps,
            runs: (Array.isArray(source.runs) ? source.runs : []).filter(run => run && typeof run === 'object').slice(-100),
            createdAt: Number(source.createdAt) || now,
            updatedAt: Number(source.updatedAt) || Number(source.createdAt) || now
        };
    }

    function normalizeRoutineCollection(rawRoutines) {
        const seen = new Set();
        return (Array.isArray(rawRoutines) ? rawRoutines : [])
            .map(normalizeRoutine)
            .filter(routine => {
                if (!routine || !routine.id || seen.has(routine.id)) return false;
                seen.add(routine.id);
                return true;
            });
    }

    function normalizeSessionEntry(entry, index = 0) {
        const source = entry && typeof entry === 'object' ? entry : {};
        const reps = Math.max(0, Math.round(Number(source.reps) || 0));
        return {
            id: String(source.id || source.entryId || '').trim() || createId('session_entry'),
            workoutId: String(source.workoutId || '').trim(),
            workoutName: String(source.workoutName || '').trim(),
            levelId: String(source.levelId || '').trim(),
            levelName: String(source.levelName || '').trim(),
            reps,
            targetRepsAtLog: Math.max(1, Math.round(Number(source.targetRepsAtLog) || NORMAL_SET_REPS)),
            createdAt: Number(source.createdAt) || Date.now() + index
        };
    }

    function normalizeSession(session) {
        const source = session && typeof session === 'object' ? session : {};
        const startedAt = Number(source.startedAt) || Date.now();
        const completedAt = Number(source.completedAt) || startedAt;
        const entries = (Array.isArray(source.entries) ? source.entries : [])
            .map(normalizeSessionEntry)
            .filter(entry => entry.workoutId && entry.reps > 0);
        return {
            id: String(source.id || '').trim() || createId('workout_session'),
            routineId: String(source.routineId || '').trim(),
            routineName: String(source.routineName || '').trim(),
            name: String(source.name || source.routineName || 'Workout Session').trim().slice(0, 120) || 'Workout Session',
            dateKey: /^\d{4}-\d{2}-\d{2}$/.test(source.dateKey || '') ? source.dateKey : dateKey(new Date(completedAt || startedAt)),
            startedAt,
            completedAt,
            durationSeconds: Math.max(0, Math.round(Number(source.durationSeconds) || ((completedAt - startedAt) / 1000) || 0)),
            entries,
            createdAt: Number(source.createdAt) || completedAt,
            updatedAt: Number(source.updatedAt) || Number(source.createdAt) || completedAt
        };
    }

    function normalizeSessionCollection(rawSessions) {
        const seen = new Set();
        return (Array.isArray(rawSessions) ? rawSessions : [])
            .map(normalizeSession)
            .filter(session => {
                if (!session || !session.id || seen.has(session.id)) return false;
                seen.add(session.id);
                return true;
            })
            .sort((a, b) => Number(a.startedAt) - Number(b.startedAt))
            .slice(-1000);
    }

    function getLevel(workout, levelId) {
        const normalized = normalizeWorkout(workout);
        return normalized.levels.find(level => level.id === levelId) || null;
    }

    function isScheduledOnDate(workout, date = new Date()) {
        const normalized = normalizeWorkout(workout);
        const key = dateKey(date);
        const startKey = dateKey(new Date(Number(normalized.createdAt) || Date.now()));
        if (key < startKey) return false;
        return normalized.schedule.weekdays.includes(new Date(date).getDay());
    }

    function getNextDateKey(workout, fromDate = new Date(), includeToday = true) {
        const startOffset = includeToday ? 0 : 1;
        for (let offset = startOffset; offset <= 370; offset += 1) {
            const candidate = addDays(fromDate, offset);
            if (isScheduledOnDate(workout, candidate)) return dateKey(candidate);
        }
        return null;
    }

    function getDayLogs(workout, key = dateKey(), levelId = null) {
        const normalized = normalizeWorkout(workout);
        return normalized.logs.filter(log => {
            if (log.scheduledDateKey !== key) return false;
            if (levelId && log.levelId !== levelId) return false;
            return true;
        });
    }

    function getDayMetrics(workout, key = dateKey()) {
        const normalized = normalizeWorkout(workout);
        const date = parseDateKey(key) || new Date();
        const policy = normalizeProgressionPolicy(normalized.progressionPolicy);
        const targetReps = Number(normalized.targetReps) >= policy.advancedSetReps ? policy.advancedSetReps : policy.normalSetReps;
        const levelLogs = getDayLogs(normalized, key, normalized.currentLevelId);
        const qualifyingSets = levelLogs.filter(log => Number(log.reps) >= targetReps).length;
        const partialLogs = levelLogs.filter(log => Number(log.reps) < targetReps);
        return {
            dateKey: key,
            scheduled: isScheduledOnDate(normalized, date),
            targetReps,
            requiredSets: policy.requiredSets,
            qualifyingSets,
            partialLogs,
            levelLogs,
            completed: qualifyingSets >= policy.requiredSets
        };
    }

    function addHistoryEvent(workout, type, details = {}) {
        if (!workout || !type) return null;
        const normalized = normalizeWorkout(workout);
        const createdAt = Number(details.createdAt) || Date.now();
        const validLevelIds = new Set(normalized.levels.map(level => level.id));
        const event = {
            id: createId('workout_event'),
            workoutId: normalized.id,
            type: String(type).slice(0, 60),
            dateKey: details.dateKey || dateKey(new Date(createdAt)),
            levelId: details.levelId || null,
            fromLevelId: details.fromLevelId || null,
            toLevelId: details.toLevelId || null,
            payload: details.payload && typeof details.payload === 'object' ? details.payload : {},
            createdAt
        };
        normalized.history.push(event);
        normalized.history = normalizeHistory(normalized.history, normalized.id, validLevelIds);
        return event;
    }

    function schedulePendingLevel(workout, levelId, fromDateKey = dateKey()) {
        const fromDate = parseDateKey(fromDateKey) || new Date();
        const nextDateKey = getNextDateKey(workout, fromDate, false);
        const existingLevelId = workout.pendingLevelId;
        const existingDateKey = workout.pendingEffectiveDateKey;
        workout.pendingLevelId = levelId;
        workout.pendingEffectiveDateKey = nextDateKey || dateKey(addDays(fromDate, 1));
        return existingLevelId !== workout.pendingLevelId || existingDateKey !== workout.pendingEffectiveDateKey;
    }

    function applyPendingProgression(workout, todayKey = dateKey()) {
        const normalized = normalizeWorkout(workout);
        if (!normalized.pendingLevelId || !normalized.pendingEffectiveDateKey) return false;
        if (todayKey < normalized.pendingEffectiveDateKey) return false;
        if (!normalized.levels.some(level => level.id === normalized.pendingLevelId)) {
            normalized.pendingLevelId = null;
            normalized.pendingEffectiveDateKey = null;
            return true;
        }
        const previousLevelId = normalized.currentLevelId;
        normalized.currentLevelId = normalized.pendingLevelId;
        normalized.targetReps = normalized.progressionPolicy.normalSetReps;
        normalized.currentLevelStartedAt = Date.now();
        normalized.pendingLevelId = null;
        normalized.pendingEffectiveDateKey = null;
        normalized.highestMasteredLevelId = null;
        normalized.updatedAt = Date.now();
        addHistoryEvent(normalized, 'level_changed', {
            dateKey: todayKey,
            fromLevelId: previousLevelId,
            toLevelId: normalized.currentLevelId
        });
        return true;
    }

    function evaluateProgression(workout, key = dateKey()) {
        const normalized = normalizeWorkout(workout);
        const metrics = getDayMetrics(normalized, key);
        if (!metrics.scheduled || !metrics.completed) return false;
        const levels = normalized.levels.slice().sort((a, b) => a.order - b.order);
        const currentIndex = levels.findIndex(level => level.id === normalized.currentLevelId);
        if (currentIndex < 0) return false;
        const policy = normalizeProgressionPolicy(normalized.progressionPolicy);
        if (metrics.targetReps >= policy.advancedSetReps) return false;
        if (currentIndex < levels.length - 1) {
            const nextLevelId = levels[currentIndex + 1].id;
            const scheduled = schedulePendingLevel(normalized, nextLevelId, key);
            normalized.updatedAt = Date.now();
            if (scheduled) {
                addHistoryEvent(normalized, 'level_scheduled', {
                    dateKey: key,
                    fromLevelId: normalized.currentLevelId,
                    toLevelId: nextLevelId,
                    payload: { effectiveDateKey: normalized.pendingEffectiveDateKey }
                });
            }
            return true;
        }
        normalized.targetReps = policy.advancedSetReps;
        normalized.highestMasteredLevelId = normalized.currentLevelId;
        normalized.highestMasteredAt = Date.now();
        normalized.pendingLevelId = null;
        normalized.pendingEffectiveDateKey = null;
        normalized.updatedAt = Date.now();
        addHistoryEvent(normalized, 'highest_mastered', {
            dateKey: key,
            levelId: normalized.currentLevelId,
            payload: { targetReps: policy.advancedSetReps }
        });
        return true;
    }

    function applySessionToWorkouts(sessionInput, workoutsInput) {
        const session = normalizeSession(sessionInput);
        const workouts = normalizeWorkoutCollection(workoutsInput);
        const byId = new Map(workouts.map(workout => [workout.id, workout]));
        let loggedCount = 0;
        session.entries.forEach((entry, index) => {
            const workout = byId.get(entry.workoutId);
            if (!workout || entry.reps <= 0) return;
            const levelId = workout.levels.some(level => level.id === entry.levelId) ? entry.levelId : workout.currentLevelId;
            const createdAt = (Number(entry.createdAt) || Date.now()) + index;
            workout.logs.push({
                id: createId('workout_log'),
                workoutId: workout.id,
                levelId,
                scheduledDateKey: session.dateKey,
                reps: entry.reps,
                targetRepsAtLog: entry.targetRepsAtLog || workout.targetReps || workout.progressionPolicy.normalSetReps,
                source: 'session',
                sessionId: session.id,
                routineId: session.routineId || '',
                routineRunId: '',
                createdAt
            });
            evaluateProgression(workout, session.dateKey);
            workout.updatedAt = Date.now();
            loggedCount += 1;
        });
        return {
            workouts,
            session,
            loggedCount
        };
    }

    function getScheduleLabel(workout) {
        const normalized = normalizeWorkout(workout);
        const days = normalized.schedule.weekdays.map(day => WEEKDAYS[day]).join(', ');
        const time = normalized.schedule.time ? ` at ${normalized.schedule.time}` : '';
        const duration = Number(normalized.schedule.durationMinutes) > 0 ? ` · ${normalized.schedule.durationMinutes}m` : '';
        return `${days}${time}${duration}`;
    }

    return {
        NORMAL_SET_REPS,
        ADVANCED_SET_REPS,
        REQUIRED_SETS,
        DELOAD_DAYS,
        WEEKDAYS,
        ROUTINE_DEFAULT_WORK_SECONDS,
        ROUTINE_DEFAULT_REST_SECONDS,
        createId,
        dateKey,
        parseDateKey,
        addDays,
        normalizeWeekdays,
        normalizeSchedule,
        normalizeProgressionPolicy,
        normalizeDeloadPolicy,
        createLevel,
        normalizeLevels,
        normalizeHistory,
        normalizeLogs,
        normalizeWorkout,
        normalizeWorkoutCollection,
        normalizeRoutineStep,
        normalizeRoutine,
        normalizeRoutineCollection,
        normalizeSessionEntry,
        normalizeSession,
        normalizeSessionCollection,
        getLevel,
        isScheduledOnDate,
        getNextDateKey,
        getDayLogs,
        getDayMetrics,
        addHistoryEvent,
        schedulePendingLevel,
        applyPendingProgression,
        evaluateProgression,
        applySessionToWorkouts,
        getScheduleLabel
    };
});
