(function (global) {
    'use strict';

    const appDB = global.AppDB || {};
    const openAppDB = appDB.openAppDB;
    const STORE_NAME = appDB.STORE_NAME || 'appState';
    const MAIN_RECORD_ID = 'main';
    const LEGACY_KEYS = ['urgencyFlowData_backup', 'urgencyFlowData'];

    if (typeof openAppDB !== 'function') {
        console.error('[notesRepository] Missing AppDB.openAppDB. Ensure assets/js/db.js loads first.');
        return;
    }

    let writeQueue = Promise.resolve();

    function clone(value) {
        return JSON.parse(JSON.stringify(value));
    }

    function isObject(value) {
        return !!value && typeof value === 'object' && !Array.isArray(value);
    }

    function readLegacyStateData() {
        if (typeof localStorage === 'undefined') return null;

        for (const key of LEGACY_KEYS) {
            try {
                const raw = localStorage.getItem(key);
                if (!raw) continue;
                const parsed = JSON.parse(raw);
                if (!isObject(parsed)) continue;
                if (!Array.isArray(parsed.notes)) parsed.notes = [];
                return parsed;
            } catch (error) {
                console.warn(`[notesRepository] Failed to parse ${key}:`, error);
            }
        }

        return null;
    }

    function writeLegacyStateData(data) {
        if (typeof localStorage === 'undefined') return;
        if (!isObject(data)) return;
        try {
            const serialized = JSON.stringify(data);
            localStorage.setItem('urgencyFlowData_backup', serialized);
            localStorage.setItem('urgencyFlowData', serialized);
        } catch (error) {
            console.warn('[notesRepository] Failed to write localStorage fallback:', error);
        }
    }

    function shouldUseLegacyData(idbData, legacyData) {
        if (!isObject(legacyData)) return false;
        if (!Array.isArray(legacyData.notes) || legacyData.notes.length === 0) return false;
        if (!isObject(idbData)) return true;
        if (!Array.isArray(idbData.notes)) return true;
        return idbData.notes.length === 0;
    }

    function migrateStateToIndexedDB(data) {
        if (!isObject(data)) return Promise.resolve();

        return openAppDB().then((db) => {
            return new Promise((resolve) => {
                let done = false;
                const finish = () => {
                    if (done) return;
                    done = true;
                    closeSafely(db);
                    resolve();
                };

                let tx;
                try {
                    tx = db.transaction([STORE_NAME], 'readwrite');
                } catch (error) {
                    console.warn('[notesRepository] Could not open migration transaction:', error);
                    finish();
                    return;
                }

                const store = tx.objectStore(STORE_NAME);
                const putReq = store.put({ id: MAIN_RECORD_ID, data: clone(data) });

                putReq.onerror = () => {
                    console.warn('[notesRepository] Failed to migrate legacy data to IndexedDB:', putReq.error);
                };

                tx.oncomplete = finish;
                tx.onerror = finish;
                tx.onabort = finish;
            });
        }).catch((error) => {
            console.warn('[notesRepository] Migration open failed:', error);
        });
    }

    function closeSafely(db) {
        try {
            db.close();
        } catch (error) {
            console.warn('[notesRepository] Failed to close IndexedDB handle:', error);
        }
    }

    function normalizeTaskIds(note) {
        const rawTaskIds = Array.isArray(note.taskIds) ? note.taskIds : (note.taskId ? [note.taskId] : []);
        return Array.from(new Set(rawTaskIds.filter(Boolean)));
    }

    function normalizeNote(noteData) {
        const now = Date.now();
        const noteId = (noteData && typeof noteData.id === 'string' && noteData.id.trim())
            ? noteData.id.trim()
            : ('note_' + now + Math.random().toString(36).substr(2, 5));

        const title = (noteData && typeof noteData.title === 'string' && noteData.title.trim())
            ? noteData.title.trim()
            : 'New Note';

        const body = (noteData && typeof noteData.body === 'string') ? noteData.body : '';
        const isPinned = !!(noteData && noteData.isPinned);
        const timestamp = Number(noteData && noteData.timestamp) || now;
        const taskIds = normalizeTaskIds(noteData || {});

        return {
            ...(noteData || {}),
            id: noteId,
            title,
            body,
            taskIds,
            isPinned,
            timestamp
        };
    }

    function sortNotes(notes, sort) {
        const output = [...notes];
        const mode = sort || 'pinned-timestamp-desc';

        if (mode === 'timestamp-asc') {
            output.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
            return output;
        }

        if (mode === 'title-asc') {
            output.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
            return output;
        }

        if (mode === 'title-desc') {
            output.sort((a, b) => (b.title || '').localeCompare(a.title || ''));
            return output;
        }

        output.sort((a, b) => {
            if (a.isPinned && !b.isPinned) return -1;
            if (!a.isPinned && b.isPinned) return 1;
            return (b.timestamp || 0) - (a.timestamp || 0);
        });
        return output;
    }

    function extractBodySearchText(note) {
        if (!note || typeof note.body !== 'string') return '';
        const rawBody = note.body;

        try {
            const parsed = JSON.parse(rawBody);
            if (Array.isArray(parsed)) {
                return parsed.map(block => (block && typeof block.text === 'string') ? block.text : '').join('\n');
            }
        } catch (error) {
            // Keep legacy/plain-text body as-is.
        }

        return rawBody;
    }

    function enqueueWrite(operation) {
        const next = writeQueue.then(operation, operation);
        writeQueue = next.catch(() => { });
        return next;
    }

    function readMainState() {
        return openAppDB().then((db) => {
            return new Promise((resolve, reject) => {
                let done = false;
                const finish = (fn, payload) => {
                    if (done) return;
                    done = true;
                    closeSafely(db);
                    fn(payload);
                };

                let tx;
                try {
                    tx = db.transaction([STORE_NAME], 'readonly');
                } catch (error) {
                    finish(reject, error);
                    return;
                }

                const store = tx.objectStore(STORE_NAME);
                const req = store.get(MAIN_RECORD_ID);

                req.onsuccess = () => {
                    const record = req.result && typeof req.result === 'object'
                        ? req.result
                        : { id: MAIN_RECORD_ID, data: {} };
                    const idbData = (record.data && typeof record.data === 'object') ? record.data : {};
                    if (!Array.isArray(idbData.notes)) idbData.notes = [];

                    const legacyData = readLegacyStateData();
                    const useLegacy = shouldUseLegacyData(idbData, legacyData);
                    const data = useLegacy ? clone(legacyData) : idbData;
                    if (!Array.isArray(data.notes)) data.notes = [];

                    if (useLegacy) {
                        // Fire-and-forget migration so both pages see the same source.
                        migrateStateToIndexedDB(data);
                    }

                    finish(resolve, { record, data });
                };

                req.onerror = () => {
                    finish(reject, req.error || tx.error || new Error('Failed to read app state.'));
                };

                tx.onabort = () => {
                    finish(reject, tx.error || new Error('IndexedDB transaction aborted.'));
                };
            });
        });
    }

    function writeMainState(mutator) {
        return openAppDB().then((db) => {
            return new Promise((resolve, reject) => {
                let done = false;
                const finish = (fn, payload) => {
                    if (done) return;
                    done = true;
                    closeSafely(db);
                    fn(payload);
                };

                let tx;
                try {
                    tx = db.transaction([STORE_NAME], 'readwrite');
                } catch (error) {
                    finish(reject, error);
                    return;
                }

                const store = tx.objectStore(STORE_NAME);
                const getReq = store.get(MAIN_RECORD_ID);
                let operationResult;
                let writtenDataSnapshot = null;

                getReq.onsuccess = () => {
                    const record = getReq.result && typeof getReq.result === 'object'
                        ? getReq.result
                        : { id: MAIN_RECORD_ID, data: {} };
                    let data = (record.data && typeof record.data === 'object') ? record.data : {};
                    if (!isObject(data) || Object.keys(data).length === 0) {
                        const legacyData = readLegacyStateData();
                        if (isObject(legacyData)) {
                            data = clone(legacyData);
                        }
                    }
                    if (!Array.isArray(data.notes)) data.notes = [];

                    operationResult = mutator(data.notes, data);
                    record.id = MAIN_RECORD_ID;
                    record.data = data;
                    writtenDataSnapshot = clone(data);

                    const putReq = store.put(record);
                    putReq.onerror = () => {
                        finish(reject, putReq.error || tx.error || new Error('Failed to write app state.'));
                    };
                };

                getReq.onerror = () => {
                    finish(reject, getReq.error || tx.error || new Error('Failed to read app state for write.'));
                };

                tx.oncomplete = () => {
                    if (writtenDataSnapshot) writeLegacyStateData(writtenDataSnapshot);
                    finish(resolve, operationResult);
                };

                tx.onerror = () => {
                    finish(reject, tx.error || new Error('IndexedDB transaction error.'));
                };

                tx.onabort = () => {
                    finish(reject, tx.error || new Error('IndexedDB transaction aborted.'));
                };
            });
        });
    }

    async function listNotes(options = {}) {
        const state = await readMainState();
        const search = typeof options.search === 'string' ? options.search.trim().toLowerCase() : '';
        const sort = options.sort || 'pinned-timestamp-desc';

        let output = state.data.notes.map(note => normalizeNote(note));
        if (search) {
            output = output.filter((note) => {
                const title = (note.title || '').toLowerCase();
                const bodyText = extractBodySearchText(note).toLowerCase();
                return title.includes(search) || bodyText.includes(search);
            });
        }

        output = sortNotes(output, sort);
        return clone(output);
    }

    function getNote(id) {
        if (!id) return Promise.resolve(null);
        return listNotes({ sort: 'timestamp-desc' }).then((notes) => {
            const match = notes.find(note => note.id === id);
            return match ? clone(match) : null;
        });
    }

    function createNote(noteData) {
        return enqueueWrite(() => {
            return writeMainState((notes) => {
                const nextNote = normalizeNote(noteData || {});
                notes.push(nextNote);
                return clone(nextNote);
            });
        });
    }

    function updateNote(id, patchOrFull) {
        if (!id) return Promise.resolve(null);

        return enqueueWrite(() => {
            return writeMainState((notes) => {
                const idx = notes.findIndex(note => note && note.id === id);
                if (idx === -1) return null;

                const current = normalizeNote(notes[idx]);
                const patch = (typeof patchOrFull === 'function')
                    ? (patchOrFull(clone(current)) || {})
                    : (patchOrFull || {});

                const merged = normalizeNote({
                    ...current,
                    ...patch,
                    id: current.id
                });

                notes[idx] = merged;
                return clone(merged);
            });
        });
    }

    function deleteNote(id) {
        if (!id) return Promise.resolve(false);

        return enqueueWrite(() => {
            return writeMainState((notes) => {
                const before = notes.length;
                const nextNotes = notes.filter(note => note && note.id !== id);
                notes.length = 0;
                nextNotes.forEach(note => notes.push(note));
                return notes.length !== before;
            });
        });
    }

    const api = {
        listNotes,
        getNote,
        createNote,
        updateNote,
        deleteNote
    };

    global.NotesRepository = api;
})(window);
