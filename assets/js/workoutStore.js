(function (global) {
    'use strict';

    const DB_NAME = 'urgencyFlowDB';
    const DB_VERSION = 1;
    const STORE_NAME = 'appState';
    const STATE_ID = 'main';
    const LEGACY_KEYS = ['urgencyFlowData', 'urgencyFlowData_backup'];

    function getCore() {
        return global.WorkoutCore || null;
    }

    function openDb() {
        return new Promise((resolve, reject) => {
            if (typeof indexedDB === 'undefined') {
                resolve(null);
                return;
            }
            let request;
            try {
                request = indexedDB.open(DB_NAME, DB_VERSION);
            } catch (error) {
                reject(error);
                return;
            }
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    db.createObjectStore(STORE_NAME, { keyPath: 'id' });
                }
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error || new Error('Failed to open workout store.'));
        });
    }

    function closeDb(db) {
        try {
            if (db) db.close();
        } catch (_) {
            // Ignore close failures.
        }
    }

    function getEmptyState() {
        return {
            dataModelVersion: typeof global.DATA_MODEL_VERSION === 'number' ? global.DATA_MODEL_VERSION : 6,
            workouts: [],
            workoutRotations: [],
            workoutRoutines: [],
            workoutSessions: [],
            timestamp: Date.now()
        };
    }

    function readLegacyState() {
        if (typeof localStorage === 'undefined') return null;
        for (const key of LEGACY_KEYS) {
            try {
                const raw = localStorage.getItem(key);
                if (!raw) continue;
                const parsed = JSON.parse(raw);
                if (parsed && typeof parsed === 'object') return parsed;
            } catch (error) {
                console.warn(`[workoutStore] Failed to parse ${key}:`, error);
            }
        }
        return null;
    }

    async function readAppState() {
        let db = null;
        try {
            db = await openDb();
            if (!db) return readLegacyState() || getEmptyState();
            return await new Promise((resolve, reject) => {
                let settled = false;
                const finish = (fn, payload) => {
                    if (settled) return;
                    settled = true;
                    closeDb(db);
                    fn(payload);
                };
                let tx;
                try {
                    tx = db.transaction([STORE_NAME], 'readonly');
                } catch (error) {
                    finish(reject, error);
                    return;
                }
                const req = tx.objectStore(STORE_NAME).get(STATE_ID);
                req.onsuccess = () => {
                    const data = req.result && req.result.data;
                    finish(resolve, data && typeof data === 'object' ? data : (readLegacyState() || getEmptyState()));
                };
                req.onerror = () => finish(reject, req.error || tx.error || new Error('Failed to read workout state.'));
                tx.onerror = () => finish(reject, tx.error || new Error('Workout state read transaction failed.'));
                tx.onabort = () => finish(reject, tx.error || new Error('Workout state read transaction aborted.'));
            });
        } catch (error) {
            closeDb(db);
            console.warn('[workoutStore] Falling back after IndexedDB read failed:', error);
            return readLegacyState() || getEmptyState();
        }
    }

    async function writeAppState(state) {
        const nextState = {
            ...(state && typeof state === 'object' ? state : getEmptyState()),
            timestamp: Date.now()
        };
        let db = null;
        try {
            db = await openDb();
            if (!db) throw new Error('IndexedDB unavailable');
            await new Promise((resolve, reject) => {
                let settled = false;
                const finish = (fn, payload) => {
                    if (settled) return;
                    settled = true;
                    closeDb(db);
                    fn(payload);
                };
                let tx;
                try {
                    tx = db.transaction([STORE_NAME], 'readwrite');
                } catch (error) {
                    finish(reject, error);
                    return;
                }
                tx.objectStore(STORE_NAME).put({ id: STATE_ID, data: nextState });
                tx.oncomplete = () => finish(resolve);
                tx.onerror = () => finish(reject, tx.error || new Error('Workout state write transaction failed.'));
                tx.onabort = () => finish(reject, tx.error || new Error('Workout state write transaction aborted.'));
            });
        } catch (error) {
            closeDb(db);
            console.warn('[workoutStore] IndexedDB write failed, using localStorage fallback:', error);
            if (typeof localStorage !== 'undefined') {
                localStorage.setItem('urgencyFlowData', JSON.stringify(nextState));
            }
        }
        if (typeof localStorage !== 'undefined') {
            try {
                localStorage.setItem('urgencyFlowData_backup', JSON.stringify(nextState));
                localStorage.setItem('urgencyFlow_lastSave', String(nextState.timestamp));
            } catch (error) {
                console.warn('[workoutStore] Failed to update localStorage backup:', error);
            }
        }
        return nextState;
    }

    function normalizeWorkoutSlices(state) {
        const core = getCore();
        const source = state && typeof state === 'object' ? state : getEmptyState();
        return {
            workouts: core ? core.normalizeWorkoutCollection(source.workouts) : (Array.isArray(source.workouts) ? source.workouts : []),
            workoutRotations: core ? core.normalizeRotationCollection(source.workoutRotations, source.workouts) : (Array.isArray(source.workoutRotations) ? source.workoutRotations : []),
            workoutRoutines: core ? core.normalizeRoutineCollection(source.workoutRoutines) : (Array.isArray(source.workoutRoutines) ? source.workoutRoutines : []),
            workoutSessions: core ? core.normalizeSessionCollection(source.workoutSessions) : (Array.isArray(source.workoutSessions) ? source.workoutSessions : [])
        };
    }

    async function loadWorkoutState() {
        const appState = await readAppState();
        const slices = normalizeWorkoutSlices(appState);
        return {
            appState,
            ...slices
        };
    }

    async function saveWorkoutState(nextSlices) {
        const current = await readAppState();
        const core = getCore();
        const merged = {
            ...current,
            workouts: core ? core.normalizeWorkoutCollection(nextSlices && nextSlices.workouts) : (nextSlices.workouts || []),
            workoutRotations: core ? core.normalizeRotationCollection(nextSlices && nextSlices.workoutRotations, nextSlices && nextSlices.workouts) : (nextSlices.workoutRotations || []),
            workoutRoutines: core ? core.normalizeRoutineCollection(nextSlices && nextSlices.workoutRoutines) : (nextSlices.workoutRoutines || []),
            workoutSessions: core ? core.normalizeSessionCollection(nextSlices && nextSlices.workoutSessions) : (nextSlices.workoutSessions || []),
            dataModelVersion: Math.max(Number(current.dataModelVersion) || 6, typeof global.DATA_MODEL_VERSION === 'number' ? global.DATA_MODEL_VERSION : 6)
        };
        return writeAppState(merged);
    }

    async function saveSession(sessionInput) {
        const state = await loadWorkoutState();
        const core = getCore();
        if (!core) throw new Error('WorkoutCore is unavailable.');
        const applied = core.applySessionToWorkouts(sessionInput, state.workouts);
        const rotationUpdate = core.advanceRotationsForSession(applied.session, state.workoutRotations, applied.workouts);
        const sessions = core.normalizeSessionCollection([...(state.workoutSessions || []), applied.session]);
        await saveWorkoutState({
            workouts: applied.workouts,
            workoutRotations: rotationUpdate.rotations,
            workoutRoutines: state.workoutRoutines,
            workoutSessions: sessions
        });
        return {
            ...applied,
            workoutRotations: rotationUpdate.rotations,
            workoutSessions: sessions
        };
    }

    const api = {
        readAppState,
        writeAppState,
        loadWorkoutState,
        saveWorkoutState,
        saveSession,
        normalizeWorkoutSlices
    };

    global.WorkoutStore = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
