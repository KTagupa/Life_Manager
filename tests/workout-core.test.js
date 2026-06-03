const assert = require('node:assert/strict');
const Core = require('../assets/js/workoutCore.js');

function atNoon(year, month, day) {
    return new Date(year, month - 1, day, 12, 0, 0, 0).getTime();
}

function makeWorkout(overrides = {}) {
    return Core.normalizeWorkout({
        id: overrides.id || 'push',
        name: overrides.name || 'Push-ups',
        createdAt: atNoon(2026, 1, 1),
        schedule: overrides.schedule || { weekdays: [1, 3], time: '08:00', durationMinutes: 30 },
        levels: overrides.levels || [
            { id: 'level_1', name: 'Level 1', order: 1 },
            { id: 'level_2', name: 'Level 2', order: 2 }
        ],
        currentLevelId: overrides.currentLevelId || 'level_1',
        progressionPolicy: overrides.progressionPolicy,
        targetReps: overrides.targetReps,
        logs: overrides.logs || [],
        history: overrides.history || []
    });
}

function testNormalizeLegacyWorkoutsAndRoutines() {
    const workout = Core.normalizeWorkout({
        id: 'legacy',
        name: 'Legacy Movement',
        createdAt: atNoon(2026, 1, 1),
        schedule: { weekdays: [5, 1, 1], time: '7am' },
        levels: [],
        logs: [{
            id: 'log_1',
            reps: 20,
            scheduledDateKey: '2026-06-01'
        }]
    });
    assert.equal(workout.progressionPolicy.requiredSets, 3);
    assert.equal(workout.progressionPolicy.normalSetReps, 20);
    assert.equal(workout.progressionPolicy.advancedSetReps, 50);
    assert.deepEqual(workout.schedule.weekdays, [1, 5]);
    assert.equal(workout.schedule.time, '');
    assert.equal(workout.levels.length, 1);
    assert.equal(workout.logs[0].targetRepsAtLog, 20);

    const routine = Core.normalizeRoutine({
        id: 'routine_1',
        name: 'Morning',
        steps: [
            { type: 'workout', workoutId: 'legacy', targetSets: 2, targetReps: 12 },
            { type: 'rest', durationSeconds: 20 }
        ]
    });
    assert.equal(routine.steps.length, 2);
    assert.equal(routine.steps[0].order, 1);
    assert.equal(routine.steps[1].type, 'rest');
}

function testScheduledDayDetection() {
    const workout = makeWorkout();
    assert.equal(Core.isScheduledOnDate(workout, new Date(2026, 5, 1)), true);
    assert.equal(Core.isScheduledOnDate(workout, new Date(2026, 5, 2)), false);
    assert.equal(Core.getNextDateKey(workout, new Date(2026, 5, 1), false), '2026-06-03');
}

function testSetQualificationPolicies() {
    const defaultWorkout = makeWorkout({
        logs: [
            { id: 'a', levelId: 'level_1', reps: 20, targetRepsAtLog: 20, scheduledDateKey: '2026-06-01' },
            { id: 'b', levelId: 'level_1', reps: 20, targetRepsAtLog: 20, scheduledDateKey: '2026-06-01' },
            { id: 'c', levelId: 'level_1', reps: 20, targetRepsAtLog: 20, scheduledDateKey: '2026-06-01' }
        ]
    });
    const defaultMetrics = Core.getDayMetrics(defaultWorkout, '2026-06-01');
    assert.equal(defaultMetrics.requiredSets, 3);
    assert.equal(defaultMetrics.qualifyingSets, 3);
    assert.equal(defaultMetrics.completed, true);

    const customWorkout = makeWorkout({
        progressionPolicy: { requiredSets: 2, normalSetReps: 12, advancedSetReps: 30 },
        logs: [
            { id: 'd', levelId: 'level_1', reps: 12, targetRepsAtLog: 12, scheduledDateKey: '2026-06-01' },
            { id: 'e', levelId: 'level_1', reps: 11, targetRepsAtLog: 12, scheduledDateKey: '2026-06-01' },
            { id: 'f', levelId: 'level_1', reps: 13, targetRepsAtLog: 12, scheduledDateKey: '2026-06-01' }
        ]
    });
    const customMetrics = Core.getDayMetrics(customWorkout, '2026-06-01');
    assert.equal(customMetrics.requiredSets, 2);
    assert.equal(customMetrics.qualifyingSets, 2);
    assert.equal(customMetrics.partialLogs.length, 1);
    assert.equal(customMetrics.completed, true);
}

function testLevelProgressionAndPendingApplication() {
    const workout = makeWorkout({
        logs: [
            { id: 'g', levelId: 'level_1', reps: 20, targetRepsAtLog: 20, scheduledDateKey: '2026-06-01' },
            { id: 'h', levelId: 'level_1', reps: 20, targetRepsAtLog: 20, scheduledDateKey: '2026-06-01' },
            { id: 'i', levelId: 'level_1', reps: 22, targetRepsAtLog: 20, scheduledDateKey: '2026-06-01' }
        ]
    });
    assert.equal(Core.evaluateProgression(workout, '2026-06-01'), true);
    assert.equal(workout.pendingLevelId, 'level_2');
    assert.equal(workout.pendingEffectiveDateKey, '2026-06-03');

    assert.equal(Core.applyPendingProgression(workout, '2026-06-02'), false);
    assert.equal(workout.currentLevelId, 'level_1');

    assert.equal(Core.applyPendingProgression(workout, '2026-06-03'), true);
    assert.equal(workout.currentLevelId, 'level_2');
    assert.equal(workout.pendingLevelId, null);
    assert.equal(workout.targetReps, 20);
}

function testSessionSavePayloadToMovementLogs() {
    const workout = makeWorkout();
    const sessionInput = {
        id: 'session_1',
        name: 'Test Session',
        dateKey: '2026-06-01',
        startedAt: atNoon(2026, 6, 1),
        completedAt: atNoon(2026, 6, 1) + 600000,
        entries: [
            {
                id: 'entry_1',
                workoutId: 'push',
                workoutName: 'Push-ups',
                levelId: 'level_1',
                levelName: 'Level 1',
                reps: 20,
                targetRepsAtLog: 20
            },
            {
                id: 'entry_2',
                workoutId: 'push',
                workoutName: 'Push-ups',
                levelId: 'level_1',
                levelName: 'Level 1',
                reps: 15,
                targetRepsAtLog: 20
            }
        ]
    };

    const result = Core.applySessionToWorkouts(sessionInput, [workout]);
    assert.equal(result.session.id, 'session_1');
    assert.equal(result.session.entries.length, 2);
    assert.equal(result.loggedCount, 2);
    assert.equal(result.workouts[0].logs.length, 2);
    assert.equal(result.workouts[0].logs[0].source, 'session');
    assert.equal(result.workouts[0].logs[0].sessionId, 'session_1');
    assert.equal(result.workouts[0].logs[1].reps, 15);
}

function testRotationResolutionAndAdvanceOnAttempt() {
    const pullUps = makeWorkout({ id: 'pull', name: 'Pull-ups' });
    const chinUps = makeWorkout({ id: 'chin', name: 'Chin-ups' });
    const rows = Core.normalizeWorkoutCollection([pullUps, chinUps]);
    const rotation = Core.normalizeRotation({
        id: 'upper_pull',
        name: 'Upper Pull',
        workoutIds: ['pull', 'chin'],
        schedule: { weekdays: [1, 3] },
        createdAt: atNoon(2026, 1, 1)
    }, rows.map(workout => workout.id));

    let resolved = Core.resolveRotationWorkout(rotation, rows);
    assert.equal(resolved.workout.id, 'pull');
    assert.equal(resolved.reason, 'round_robin');

    const session = Core.normalizeSession({
        id: 'rotation_session_1',
        rotationId: 'upper_pull',
        rotationName: 'Upper Pull',
        dateKey: '2026-06-01',
        startedAt: atNoon(2026, 6, 1),
        completedAt: atNoon(2026, 6, 1) + 300000,
        entries: [{
            workoutId: 'pull',
            workoutName: 'Pull-ups',
            levelId: 'level_1',
            reps: 3,
            rotationId: 'upper_pull',
            scheduledForProgression: true,
            targetRepsAtLog: 20
        }]
    });
    const rotationUpdate = Core.advanceRotationsForSession(session, [rotation], rows);
    assert.equal(rotationUpdate.advancedCount, 1);
    assert.equal(rotationUpdate.rotations[0].lastWorkoutId, 'pull');

    resolved = Core.resolveRotationWorkout(rotationUpdate.rotations[0], rows);
    assert.equal(resolved.workout.id, 'chin');
}

function testRotationFavorsLowerLevelMembers() {
    const pullUps = makeWorkout({ id: 'pull', name: 'Pull-ups', currentLevelId: 'level_2' });
    const chinUps = makeWorkout({ id: 'chin', name: 'Chin-ups', currentLevelId: 'level_1' });
    const rows = Core.normalizeWorkoutCollection([pullUps, chinUps]);
    const rotation = Core.normalizeRotation({
        id: 'upper_pull',
        name: 'Upper Pull',
        workoutIds: ['pull', 'chin'],
        lastWorkoutId: 'chin',
        schedule: { weekdays: [1, 3] },
        createdAt: atNoon(2026, 1, 1)
    }, rows.map(workout => workout.id));

    const resolved = Core.resolveRotationWorkout(rotation, rows);
    assert.equal(resolved.reason, 'level_balance');
    assert.equal(resolved.balanced, false);
    assert.equal(resolved.workout.id, 'chin');
}

function testRotationProjectsFutureScheduledNames() {
    const pullUps = makeWorkout({ id: 'pull', name: 'Pull-ups' });
    const chinUps = makeWorkout({ id: 'chin', name: 'Chin-ups' });
    const rows = Core.normalizeWorkoutCollection([pullUps, chinUps]);
    const rotation = Core.normalizeRotation({
        id: 'upper_pull',
        name: 'Upper Pull',
        workoutIds: ['pull', 'chin'],
        schedule: { weekdays: [1, 3, 5] },
        createdAt: atNoon(2026, 1, 1)
    }, rows.map(workout => workout.id));

    const monday = Core.projectRotationWorkout(rotation, rows, new Date(2026, 5, 1), new Date(2026, 5, 1));
    const wednesday = Core.projectRotationWorkout(rotation, rows, new Date(2026, 5, 3), new Date(2026, 5, 1));
    const friday = Core.projectRotationWorkout(rotation, rows, new Date(2026, 5, 5), new Date(2026, 5, 1));

    assert.equal(monday.workout.id, 'pull');
    assert.equal(wednesday.workout.id, 'chin');
    assert.equal(friday.workout.id, 'pull');
}

testNormalizeLegacyWorkoutsAndRoutines();
testScheduledDayDetection();
testSetQualificationPolicies();
testLevelProgressionAndPendingApplication();
testSessionSavePayloadToMovementLogs();
testRotationResolutionAndAdvanceOnAttempt();
testRotationFavorsLowerLevelMembers();
testRotationProjectsFutureScheduledNames();

console.log('WorkoutCore tests passed');
