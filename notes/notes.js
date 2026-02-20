(function () {
    'use strict';

    const notesState = {
        notes: [],
        selectedId: null,
        selectedBlockTemplate: null,
        isReady: false
    };

    const els = {
        search: null,
        list: null,
        count: null,
        status: null,
        title: null,
        body: null,
        newBtn: null,
        saveBtn: null,
        deleteBtn: null
    };

    function esc(value) {
        return String(value || '')
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#39;');
    }

    function setStatus(message) {
        if (!els.status) return;
        els.status.textContent = message || '';
    }

    function makeBlockId(offset) {
        return Date.now() + Math.random() + (offset || 0);
    }

    function parseBodyForEditor(noteBody) {
        if (!noteBody || typeof noteBody !== 'string') {
            return { text: '', blockTemplate: null };
        }

        try {
            const parsed = JSON.parse(noteBody);
            if (Array.isArray(parsed)) {
                return {
                    text: parsed.map(block => (block && typeof block.text === 'string') ? block.text : '').join('\n\n'),
                    blockTemplate: parsed
                };
            }
        } catch (error) {
            // Legacy plain text note body.
        }

        return { text: noteBody, blockTemplate: null };
    }

    function serializeEditorBody(text) {
        const blockTemplate = Array.isArray(notesState.selectedBlockTemplate)
            ? notesState.selectedBlockTemplate
            : null;

        if (!blockTemplate) return text;

        const segments = String(text || '').split(/\n{2,}/g);
        const normalized = segments.length ? segments : [''];
        const outputBlocks = normalized.map((segment, index) => {
            const existing = blockTemplate[index] && typeof blockTemplate[index] === 'object'
                ? blockTemplate[index]
                : {};
            return {
                ...existing,
                id: (typeof existing.id !== 'undefined') ? existing.id : makeBlockId(index),
                text: segment,
                colorIndex: Number.isInteger(existing.colorIndex) ? existing.colorIndex : 0,
                isEditing: typeof existing.isEditing === 'boolean' ? existing.isEditing : true,
                bookmarkName: typeof existing.bookmarkName === 'string' ? existing.bookmarkName : ''
            };
        });

        return JSON.stringify(outputBlocks);
    }

    function getSelectedNote() {
        if (!notesState.selectedId) return null;
        return notesState.notes.find(note => note.id === notesState.selectedId) || null;
    }

    function updateCount() {
        if (!els.count) return;
        els.count.textContent = `${notesState.notes.length} note(s)`;
    }

    function previewText(note) {
        if (!note) return '';
        const parsed = parseBodyForEditor(note.body);
        return (parsed.text || '').replace(/\s+/g, ' ').trim().slice(0, 90);
    }

    function renderList() {
        if (!els.list) return;

        if (!notesState.notes.length) {
            els.list.innerHTML = '<div class="empty-state">No notes found.</div>';
            updateCount();
            return;
        }

        els.list.innerHTML = notesState.notes.map((note) => {
            const activeClass = note.id === notesState.selectedId ? 'active' : '';
            const pin = note.isPinned ? '📌 ' : '';
            const preview = esc(previewText(note));
            const date = new Date(note.timestamp || Date.now()).toLocaleDateString();
            return `
                <div class="notes-list-item ${activeClass}" data-note-id="${esc(note.id)}">
                    <div class="notes-list-item-title">${pin}${esc(note.title || '(Untitled)')}</div>
                    <div class="notes-list-item-preview">${preview}</div>
                    <div class="notes-list-item-meta">
                        <span>${esc(date)}</span>
                        <span>${(note.taskIds || []).length} linked task(s)</span>
                    </div>
                </div>
            `;
        }).join('');

        els.list.querySelectorAll('[data-note-id]').forEach((el) => {
            el.addEventListener('click', () => {
                const { noteId } = el.dataset;
                notesState.selectedId = noteId || null;
                loadSelectionToEditor();
                renderList();
            });
        });

        updateCount();
    }

    function clearEditor() {
        if (els.title) els.title.value = '';
        if (els.body) els.body.value = '';
        notesState.selectedBlockTemplate = null;
    }

    function loadSelectionToEditor() {
        const note = getSelectedNote();
        if (!note) {
            clearEditor();
            setStatus('Select a note or create a new one.');
            return;
        }

        const parsed = parseBodyForEditor(note.body);
        notesState.selectedBlockTemplate = parsed.blockTemplate;
        if (els.title) els.title.value = note.title || '';
        if (els.body) els.body.value = parsed.text || '';
        setStatus(`Editing note: ${note.title || '(Untitled)'}`);
    }

    async function refreshNotes(options = {}) {
        if (!window.NotesRepository || typeof window.NotesRepository.listNotes !== 'function') {
            setStatus('Notes repository is unavailable.');
            return;
        }

        const search = (els.search && typeof els.search.value === 'string') ? els.search.value.trim() : '';
        const keepSelection = options.keepSelection !== false;
        const silent = options.silent === true;
        const previousSelection = notesState.selectedId;

        notesState.notes = await window.NotesRepository.listNotes({
            search,
            sort: 'pinned-timestamp-desc'
        });

        if (!keepSelection) {
            notesState.selectedId = notesState.notes[0] ? notesState.notes[0].id : null;
        } else if (previousSelection && notesState.notes.some(note => note.id === previousSelection)) {
            notesState.selectedId = previousSelection;
        } else {
            notesState.selectedId = notesState.notes[0] ? notesState.notes[0].id : null;
        }

        renderList();
        loadSelectionToEditor();
        if (!silent) setStatus('Notes loaded.');
    }

    async function createNote() {
        if (!window.NotesRepository || typeof window.NotesRepository.createNote !== 'function') return;

        const created = await window.NotesRepository.createNote({
            title: 'New Note',
            body: '',
            taskIds: [],
            isPinned: false,
            timestamp: Date.now()
        });

        if (!created) return;

        notesState.selectedId = created.id;
        await refreshNotes({ keepSelection: true, silent: true });
        if (window.NotesSync && typeof window.NotesSync.broadcastNotesEvent === 'function') {
            window.NotesSync.broadcastNotesEvent({ type: 'create', id: created.id });
        }
        setStatus('Note created.');
    }

    async function saveNote() {
        const selected = getSelectedNote();
        if (!selected || !notesState.selectedId) {
            setStatus('Select a note before saving.');
            return;
        }

        const title = (els.title && typeof els.title.value === 'string') ? els.title.value.trim() : '';
        const bodyText = (els.body && typeof els.body.value === 'string') ? els.body.value : '';
        const nextBody = serializeEditorBody(bodyText);

        const updated = await window.NotesRepository.updateNote(notesState.selectedId, {
            title: title || 'New Note',
            body: nextBody,
            timestamp: Date.now()
        });

        if (!updated) {
            setStatus('Unable to save: note was not found.');
            await refreshNotes({ keepSelection: true, silent: true });
            return;
        }

        await refreshNotes({ keepSelection: true, silent: true });
        if (window.NotesSync && typeof window.NotesSync.broadcastNotesEvent === 'function') {
            window.NotesSync.broadcastNotesEvent({ type: 'update', id: notesState.selectedId });
        }
        setStatus('Saved.');
    }

    async function deleteNote() {
        if (!notesState.selectedId) {
            setStatus('Select a note before deleting.');
            return;
        }

        const note = getSelectedNote();
        const title = note && note.title ? note.title : 'this note';
        if (!window.confirm(`Delete "${title}"?`)) return;

        const deletedId = notesState.selectedId;
        await window.NotesRepository.deleteNote(deletedId);
        notesState.selectedId = null;
        await refreshNotes({ keepSelection: false, silent: true });

        if (window.NotesSync && typeof window.NotesSync.broadcastNotesEvent === 'function') {
            window.NotesSync.broadcastNotesEvent({ type: 'delete', id: deletedId });
        }
        setStatus('Note deleted.');
    }

    function bindEvents() {
        if (els.search) {
            els.search.addEventListener('input', () => {
                refreshNotes({ keepSelection: true, silent: true }).catch((error) => {
                    console.error('[notes-page] Search refresh failed:', error);
                });
            });
        }

        if (els.newBtn) {
            els.newBtn.addEventListener('click', () => {
                createNote().catch((error) => {
                    console.error('[notes-page] Failed to create note:', error);
                    setStatus('Failed to create note.');
                });
            });
        }

        if (els.saveBtn) {
            els.saveBtn.addEventListener('click', () => {
                saveNote().catch((error) => {
                    console.error('[notes-page] Failed to save note:', error);
                    setStatus('Failed to save note.');
                });
            });
        }

        if (els.deleteBtn) {
            els.deleteBtn.addEventListener('click', () => {
                deleteNote().catch((error) => {
                    console.error('[notes-page] Failed to delete note:', error);
                    setStatus('Failed to delete note.');
                });
            });
        }
    }

    function initLiveSync() {
        if (!window.NotesSync || typeof window.NotesSync.initNotesChannel !== 'function') return;
        window.NotesSync.initNotesChannel((message) => {
            if (!message || !notesState.isReady) return;
            refreshNotes({ keepSelection: true, silent: true }).then(() => {
                if (message.id && message.id === notesState.selectedId) {
                    setStatus('Synced from another tab.');
                }
            }).catch((error) => {
                console.error('[notes-page] Broadcast sync failed:', error);
            });
        });
    }

    document.addEventListener('DOMContentLoaded', async () => {
        els.search = document.getElementById('notes-search');
        els.list = document.getElementById('notes-list');
        els.count = document.getElementById('notes-count');
        els.status = document.getElementById('notes-status');
        els.title = document.getElementById('note-title');
        els.body = document.getElementById('note-body');
        els.newBtn = document.getElementById('new-note-btn');
        els.saveBtn = document.getElementById('save-note-btn');
        els.deleteBtn = document.getElementById('delete-note-btn');

        bindEvents();
        initLiveSync();

        try {
            await refreshNotes({ keepSelection: false, silent: true });
            notesState.isReady = true;
            setStatus('Ready.');
        } catch (error) {
            console.error('[notes-page] Failed to initialize:', error);
            setStatus('Failed to load notes.');
        }
    });
})();
