(function () {
    'use strict';

    const noteCategoryColors = [
        '#f1f5f9', '#ffedd5', '#fef9c3', '#dcfce7', '#d1fae5',
        '#e0f2fe', '#e0e7ff', '#fae8ff', '#ffe4e6', '#fee2e2'
    ];
    const defaultCategoryNames = Array.from({ length: 10 }, (_, i) => `Category ${i + 1}`);

    const state = {
        notes: [],
        selectedId: null,
        blocks: [],
        isViewMode: false,
        isReady: false,
        dirty: false,
        saveTimer: null
    };

    const els = {
        search: null,
        list: null,
        count: null,
        status: null,
        title: null,
        taskIds: null,
        bookmarkJump: null,
        blocksContainer: null,
        newBtn: null,
        addBlockBtn: null,
        toggleViewBtn: null,
        pinBtn: null,
        saveBtn: null,
        deleteBtn: null
    };

    function getRepo() {
        return window.NotesRepository || null;
    }

    function getSync() {
        return window.NotesSync || null;
    }

    function esc(value) {
        return String(value || '')
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#39;');
    }

    function setStatus(message, warn = false) {
        if (!els.status) return;
        els.status.textContent = message || '';
        els.status.style.color = warn ? 'var(--upcoming-color)' : 'var(--text-muted)';
    }

    function makeBlockId(offset) {
        return Date.now() + Math.random() + (offset || 0);
    }

    function getCategoryNames() {
        return defaultCategoryNames;
    }

    function normalizeTaskIds(taskIds) {
        if (!Array.isArray(taskIds)) return [];
        return Array.from(new Set(taskIds.filter(Boolean).map(String)));
    }

    function parseTaskIdsInput(value) {
        if (typeof value !== 'string') return [];
        const tokens = value
            .split(/[,\n]/g)
            .map(item => item.trim())
            .filter(Boolean);
        return Array.from(new Set(tokens));
    }

    function normalizeBlock(raw, index) {
        const block = (raw && typeof raw === 'object' && !Array.isArray(raw)) ? { ...raw } : {};

        if (typeof block.id === 'undefined' || block.id === null) block.id = makeBlockId(index);
        if (typeof block.text !== 'string') block.text = '';
        const numericColor = Number(block.colorIndex);
        if (!Number.isInteger(numericColor) || numericColor < 0 || numericColor >= noteCategoryColors.length) {
            block.colorIndex = 0;
        } else {
            block.colorIndex = numericColor;
        }
        if (typeof block.isEditing !== 'boolean') block.isEditing = true;
        if (typeof block.bookmarkName !== 'string') block.bookmarkName = '';
        return block;
    }

    function createEmptyBlock(text = '') {
        return normalizeBlock({ text }, 0);
    }

    function parseNoteBody(noteBody) {
        if (!noteBody || typeof noteBody !== 'string') return [createEmptyBlock('')];

        try {
            const parsed = JSON.parse(noteBody);
            if (Array.isArray(parsed)) {
                const blocks = parsed.map((block, idx) => normalizeBlock(block, idx));
                return blocks.length ? blocks : [createEmptyBlock('')];
            }
        } catch (error) {
            // Legacy plain text body.
        }

        return [createEmptyBlock(noteBody)];
    }

    function serializeBlocks() {
        const normalizedBlocks = state.blocks.map((block, idx) => {
            const normalized = normalizeBlock(block, idx);
            return {
                ...block,
                id: normalized.id,
                text: normalized.text,
                colorIndex: normalized.colorIndex,
                isEditing: normalized.isEditing,
                bookmarkName: normalized.bookmarkName
            };
        });
        return JSON.stringify(normalizedBlocks);
    }

    function getSelectedNote() {
        if (!state.selectedId) return null;
        return state.notes.find(note => note.id === state.selectedId) || null;
    }

    function updateCount() {
        if (!els.count) return;
        els.count.textContent = `${state.notes.length} note(s)`;
    }

    function extractBodyPreview(note) {
        if (!note || typeof note.body !== 'string') return '';
        const blocks = parseNoteBody(note.body);
        return blocks.map(block => block.text || '').join(' ').replace(/\s+/g, ' ').trim().slice(0, 110);
    }

    function renderList() {
        if (!els.list) return;

        if (!state.notes.length) {
            els.list.innerHTML = '<div class="empty-state">No notes found.</div>';
            updateCount();
            return;
        }

        els.list.innerHTML = state.notes.map((note) => {
            const activeClass = note.id === state.selectedId ? 'active' : '';
            const pinPrefix = note.isPinned ? '[PIN] ' : '';
            const preview = esc(extractBodyPreview(note));
            const date = new Date(note.timestamp || Date.now()).toLocaleDateString();
            return `
                <div class="notes-list-item ${activeClass}" data-note-id="${esc(note.id)}">
                    <div class="notes-list-item-title">${pinPrefix}${esc(note.title || '(Untitled)')}</div>
                    <div class="notes-list-item-preview">${preview}</div>
                    <div class="notes-list-item-meta">
                        <span>${esc(date)}</span>
                        <span>${normalizeTaskIds(note.taskIds).length} linked task(s)</span>
                    </div>
                </div>
            `;
        }).join('');

        els.list.querySelectorAll('[data-note-id]').forEach((node) => {
            node.addEventListener('click', () => {
                const noteId = node.getAttribute('data-note-id');
                selectNote(noteId).catch((error) => {
                    console.error('[notes-page] Failed to switch note:', error);
                    setStatus('Unable to switch note.', true);
                });
            });
        });

        updateCount();
    }

    function renderMarkdown(text) {
        const source = String(text || '');
        if (window.marked && typeof window.marked.parse === 'function') {
            try {
                if (typeof window.marked.setOptions === 'function') {
                    window.marked.setOptions({ breaks: true, gfm: true });
                }
                return window.marked.parse(source || '_Empty_');
            } catch (error) {
                console.warn('[notes-page] Markdown parse failed:', error);
            }
        }
        return esc(source || '_Empty_').replace(/\n/g, '<br>');
    }

    // autoResizeTextarea() is now in utils.js

    function updatePinButton() {
        if (!els.pinBtn) return;
        const note = getSelectedNote();
        els.pinBtn.textContent = note && note.isPinned ? 'Unpin' : 'Pin';
    }

    function updateBookmarkJump() {
        if (!els.bookmarkJump) return;
        const savedValue = els.bookmarkJump.value;
        const bookmarks = state.blocks
            .filter(block => typeof block.bookmarkName === 'string' && block.bookmarkName.trim())
            .map(block => ({ id: String(block.id), name: block.bookmarkName.trim() }));

        if (!bookmarks.length) {
            els.bookmarkJump.innerHTML = '<option value="">No bookmarks</option>';
            return;
        }

        const options = ['<option value="">Jump to bookmark...</option>']
            .concat(bookmarks.map((bookmark) => `<option value="${esc(bookmark.id)}">${esc(bookmark.name)}</option>`));
        els.bookmarkJump.innerHTML = options.join('');
        if (bookmarks.some(bookmark => bookmark.id === savedValue)) {
            els.bookmarkJump.value = savedValue;
        } else {
            els.bookmarkJump.value = '';
        }
    }

    function renderBlocks() {
        if (!els.blocksContainer) return;
        const note = getSelectedNote();

        if (!note) {
            els.blocksContainer.innerHTML = '<div class="empty-state">Select or create a note to start editing.</div>';
            updateBookmarkJump();
            updatePinButton();
            return;
        }

        if (!state.blocks.length) {
            state.blocks = [createEmptyBlock('')];
        }

        const categoryNames = getCategoryNames();
        els.blocksContainer.innerHTML = '';

        state.blocks.forEach((block, index) => {
            const blockId = String(block.id);
            const card = document.createElement('article');
            card.className = 'note-block';
            card.setAttribute('data-block-id', blockId);
            card.style.backgroundColor = noteCategoryColors[block.colorIndex] || noteCategoryColors[0];

            const controls = document.createElement('div');
            controls.className = 'note-block-controls';

            const categorySelect = document.createElement('select');
            categoryNames.forEach((name, colorIndex) => {
                const option = document.createElement('option');
                option.value = String(colorIndex);
                option.textContent = name;
                if (colorIndex === block.colorIndex) option.selected = true;
                categorySelect.appendChild(option);
            });
            categorySelect.addEventListener('change', () => {
                const nextColor = Number(categorySelect.value);
                block.colorIndex = Number.isInteger(nextColor) ? nextColor : 0;
                card.style.backgroundColor = noteCategoryColors[block.colorIndex] || noteCategoryColors[0];
                queueAutoSave();
            });

            const bookmarkInput = document.createElement('input');
            bookmarkInput.type = 'text';
            bookmarkInput.placeholder = 'Bookmark name (optional)';
            bookmarkInput.value = block.bookmarkName || '';
            bookmarkInput.addEventListener('input', () => {
                block.bookmarkName = bookmarkInput.value;
                updateBookmarkJump();
                queueAutoSave();
            });

            const upBtn = document.createElement('button');
            upBtn.className = 'btn';
            upBtn.textContent = '↑';
            upBtn.disabled = index === 0;
            upBtn.addEventListener('click', () => moveBlock(index, -1));

            const downBtn = document.createElement('button');
            downBtn.className = 'btn';
            downBtn.textContent = '↓';
            downBtn.disabled = index === state.blocks.length - 1;
            downBtn.addEventListener('click', () => moveBlock(index, 1));

            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'btn';
            deleteBtn.textContent = 'Delete';
            deleteBtn.addEventListener('click', () => removeBlock(index));

            controls.appendChild(categorySelect);
            controls.appendChild(bookmarkInput);
            controls.appendChild(upBtn);
            controls.appendChild(downBtn);
            controls.appendChild(deleteBtn);
            card.appendChild(controls);

            if (state.isViewMode) {
                const preview = document.createElement('div');
                preview.className = 'note-block-preview';
                preview.innerHTML = renderMarkdown(block.text);
                card.appendChild(preview);
            } else {
                const textarea = document.createElement('textarea');
                textarea.value = block.text || '';
                textarea.addEventListener('input', () => {
                    block.text = textarea.value;
                    autoResizeTextarea(textarea);
                    queueAutoSave();
                });
                card.appendChild(textarea);
                setTimeout(() => autoResizeTextarea(textarea), 0);
            }

            els.blocksContainer.appendChild(card);
        });

        updateBookmarkJump();
        updatePinButton();
    }

    function clearEditor() {
        if (els.title) els.title.value = '';
        if (els.taskIds) els.taskIds.value = '';
        state.blocks = [];
        renderBlocks();
    }

    function loadSelectedNoteIntoEditor() {
        const note = getSelectedNote();
        if (!note) {
            clearEditor();
            setStatus('Select a note or create a new one.');
            return;
        }

        if (els.title) els.title.value = note.title || '';
        if (els.taskIds) els.taskIds.value = normalizeTaskIds(note.taskIds).join(', ');
        state.blocks = parseNoteBody(note.body);
        state.dirty = false;
        renderBlocks();
        setStatus(`Editing: ${note.title || '(Untitled)'}`);
    }

    function upsertLocalNote(note) {
        const idx = state.notes.findIndex(item => item.id === note.id);
        if (idx === -1) state.notes.push(note);
        else state.notes[idx] = note;
    }

    function queueAutoSave() {
        if (!state.selectedId) return;
        state.dirty = true;
        setStatus('Saving...');
        if (state.saveTimer) clearTimeout(state.saveTimer);
        state.saveTimer = setTimeout(() => {
            saveCurrentNote({ silent: true }).catch((error) => {
                console.error('[notes-page] Auto-save failed:', error);
                setStatus('Auto-save failed.', true);
            });
        }, 650);
    }

    async function flushPendingSave() {
        if (state.saveTimer) {
            clearTimeout(state.saveTimer);
            state.saveTimer = null;
        }
        if (state.dirty) await saveCurrentNote({ silent: true });
    }

    async function refreshNotes(options = {}) {
        const repo = getRepo();
        if (!repo || typeof repo.listNotes !== 'function') {
            setStatus('Notes repository unavailable.', true);
            return;
        }

        if (options.flushPending === true && state.dirty) {
            try {
                await flushPendingSave();
            } catch (error) {
                console.error('[notes-page] Failed to flush pending save before refresh:', error);
            }
        }

        const keepSelection = options.keepSelection !== false;
        const reloadEditor = options.reloadEditor !== false;
        const silent = options.silent === true;
        const forceSelectId = options.forceSelectId || null;
        const previousSelection = state.selectedId;
        const search = (els.search && typeof els.search.value === 'string') ? els.search.value.trim() : '';

        state.notes = await repo.listNotes({
            search,
            sort: 'pinned-timestamp-desc'
        });

        let nextSelection = forceSelectId || (keepSelection ? previousSelection : null);
        if (!nextSelection || !state.notes.some(note => note.id === nextSelection)) {
            nextSelection = state.notes[0] ? state.notes[0].id : null;
        }
        state.selectedId = nextSelection;

        renderList();
        if (reloadEditor || previousSelection !== state.selectedId) loadSelectedNoteIntoEditor();
        updateCount();

        if (!silent) setStatus('Notes loaded.');
    }

    function broadcast(type, id) {
        const sync = getSync();
        if (!sync || typeof sync.broadcastNotesEvent !== 'function') return;
        sync.broadcastNotesEvent({ type, id });
    }

    async function createNote() {
        const repo = getRepo();
        if (!repo || typeof repo.createNote !== 'function') return;

        await flushPendingSave();
        const created = await repo.createNote({
            title: 'New Note',
            body: JSON.stringify([createEmptyBlock('')]),
            taskIds: [],
            isPinned: false,
            timestamp: Date.now()
        });

        if (!created) return;

        state.selectedId = created.id;
        await refreshNotes({ keepSelection: true, forceSelectId: created.id, silent: true });
        broadcast('create', created.id);
        setStatus('Note created.');
    }

    async function saveCurrentNote(options = {}) {
        const repo = getRepo();
        const note = getSelectedNote();
        if (!repo || !note || !state.selectedId) return;

        const title = (els.title && typeof els.title.value === 'string')
            ? els.title.value.trim()
            : '';
        const taskIds = parseTaskIdsInput(els.taskIds ? els.taskIds.value : '');
        const patch = {
            title: title || 'New Note',
            body: serializeBlocks(),
            taskIds,
            timestamp: Date.now()
        };

        const updated = await repo.updateNote(state.selectedId, patch);
        if (!updated) {
            await refreshNotes({ keepSelection: true, silent: true });
            setStatus('Unable to save note.', true);
            return;
        }

        upsertLocalNote(updated);
        state.dirty = false;
        state.saveTimer = null;
        renderList();
        if (!options.silent) setStatus('Saved.');
        else setStatus('Saved.');

        if (options.broadcast !== false) {
            broadcast('update', updated.id);
        }
    }

    async function deleteCurrentNote() {
        const repo = getRepo();
        const note = getSelectedNote();
        if (!repo || !note || !state.selectedId) {
            setStatus('Select a note to delete.');
            return;
        }

        const title = note.title || 'this note';
        if (!window.confirm(`Delete "${title}"?`)) return;

        const deletedId = note.id;
        await repo.deleteNote(deletedId);
        state.selectedId = null;
        state.blocks = [];
        state.dirty = false;
        if (state.saveTimer) {
            clearTimeout(state.saveTimer);
            state.saveTimer = null;
        }

        await refreshNotes({ keepSelection: false, silent: true });
        broadcast('delete', deletedId);
        setStatus('Note deleted.');
    }

    async function togglePinForCurrentNote() {
        const repo = getRepo();
        const note = getSelectedNote();
        if (!repo || !note) {
            setStatus('Select a note first.');
            return;
        }

        const updated = await repo.updateNote(note.id, {
            isPinned: !note.isPinned,
            timestamp: Date.now()
        });

        if (!updated) {
            setStatus('Unable to update pin state.', true);
            return;
        }

        upsertLocalNote(updated);
        await refreshNotes({ keepSelection: true, forceSelectId: updated.id, silent: true });
        broadcast('update', updated.id);
        setStatus(updated.isPinned ? 'Note pinned.' : 'Note unpinned.');
    }

    function addBlock() {
        if (!getSelectedNote()) {
            setStatus('Select a note first.');
            return;
        }
        state.blocks.push(createEmptyBlock(''));
        renderBlocks();
        queueAutoSave();
    }

    function moveBlock(index, direction) {
        const nextIndex = index + direction;
        if (nextIndex < 0 || nextIndex >= state.blocks.length) return;
        const temp = state.blocks[index];
        state.blocks[index] = state.blocks[nextIndex];
        state.blocks[nextIndex] = temp;
        renderBlocks();
        queueAutoSave();
    }

    function removeBlock(index) {
        if (!state.blocks.length) return;
        if (state.blocks.length === 1) {
            state.blocks[0].text = '';
            state.blocks[0].bookmarkName = '';
            renderBlocks();
            queueAutoSave();
            return;
        }
        state.blocks.splice(index, 1);
        renderBlocks();
        queueAutoSave();
    }

    async function selectNote(noteId) {
        if (!noteId || noteId === state.selectedId) return;
        await flushPendingSave();
        state.selectedId = noteId;
        renderList();
        loadSelectedNoteIntoEditor();
    }

    function toggleViewMode() {
        state.isViewMode = !state.isViewMode;
        if (els.toggleViewBtn) {
            els.toggleViewBtn.textContent = state.isViewMode ? 'Edit Mode' : 'View Mode';
        }
        renderBlocks();
    }

    function jumpToBookmark(blockId) {
        if (!blockId || !els.blocksContainer) return;
        const target = Array.from(els.blocksContainer.querySelectorAll('.note-block'))
            .find((node) => node.getAttribute('data-block-id') === String(blockId));
        if (!target) return;
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    function initLiveSync() {
        const sync = getSync();
        if (!sync || typeof sync.initNotesChannel !== 'function') return;

        sync.initNotesChannel((message) => {
            if (!state.isReady) return;
            const sameNote = !!(message && message.id && message.id === state.selectedId);
            const reloadEditor = !state.dirty;
            refreshNotes({
                keepSelection: true,
                reloadEditor,
                silent: true
            }).then(() => {
                if (!reloadEditor) {
                    setStatus('Incoming update detected. Save to keep local edits.', true);
                    return;
                }
                if (sameNote) setStatus('Synced from another tab.');
            }).catch((error) => {
                console.error('[notes-page] Sync refresh failed:', error);
            });
        });
    }

    function bindEvents() {
        if (els.search) {
            els.search.addEventListener('input', () => {
                refreshNotes({ keepSelection: true, silent: true, flushPending: true }).catch((error) => {
                    console.error('[notes-page] Search refresh failed:', error);
                });
            });
        }

        if (els.newBtn) {
            els.newBtn.addEventListener('click', () => {
                createNote().catch((error) => {
                    console.error('[notes-page] Create note failed:', error);
                    setStatus('Failed to create note.', true);
                });
            });
        }

        if (els.addBlockBtn) {
            els.addBlockBtn.addEventListener('click', addBlock);
        }

        if (els.toggleViewBtn) {
            els.toggleViewBtn.addEventListener('click', toggleViewMode);
        }

        if (els.pinBtn) {
            els.pinBtn.addEventListener('click', () => {
                togglePinForCurrentNote().catch((error) => {
                    console.error('[notes-page] Pin toggle failed:', error);
                    setStatus('Failed to update pin state.', true);
                });
            });
        }

        if (els.saveBtn) {
            els.saveBtn.addEventListener('click', () => {
                saveCurrentNote({ silent: false }).catch((error) => {
                    console.error('[notes-page] Save failed:', error);
                    setStatus('Save failed.', true);
                });
            });
        }

        if (els.deleteBtn) {
            els.deleteBtn.addEventListener('click', () => {
                deleteCurrentNote().catch((error) => {
                    console.error('[notes-page] Delete failed:', error);
                    setStatus('Delete failed.', true);
                });
            });
        }

        if (els.title) {
            els.title.addEventListener('input', queueAutoSave);
        }

        if (els.taskIds) {
            els.taskIds.addEventListener('input', queueAutoSave);
        }

        if (els.bookmarkJump) {
            els.bookmarkJump.addEventListener('change', () => {
                const blockId = els.bookmarkJump.value;
                if (!blockId) return;
                jumpToBookmark(blockId);
            });
        }

        window.addEventListener('beforeunload', () => {
            if (state.saveTimer) {
                clearTimeout(state.saveTimer);
                state.saveTimer = null;
            }
        });
    }

    function captureElements() {
        els.search = document.getElementById('notes-search');
        els.list = document.getElementById('notes-list');
        els.count = document.getElementById('notes-count');
        els.status = document.getElementById('notes-status');
        els.title = document.getElementById('note-title');
        els.taskIds = document.getElementById('note-task-ids');
        els.bookmarkJump = document.getElementById('bookmark-jump');
        els.blocksContainer = document.getElementById('blocks-container');
        els.newBtn = document.getElementById('new-note-btn');
        els.addBlockBtn = document.getElementById('add-block-btn');
        els.toggleViewBtn = document.getElementById('toggle-view-btn');
        els.pinBtn = document.getElementById('pin-note-btn');
        els.saveBtn = document.getElementById('save-note-btn');
        els.deleteBtn = document.getElementById('delete-note-btn');
    }

    document.addEventListener('DOMContentLoaded', async () => {
        captureElements();
        bindEvents();
        initLiveSync();

        const repo = getRepo();
        if (!repo || typeof repo.listNotes !== 'function') {
            setStatus('Notes repository not available.', true);
            return;
        }

        try {
            await refreshNotes({ keepSelection: false, silent: true });
            state.isReady = true;
            setStatus('Ready.');
        } catch (error) {
            console.error('[notes-page] Initialization failed:', error);
            setStatus('Failed to load notes.', true);
        }
    });
})();
