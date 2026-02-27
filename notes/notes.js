(function () {
    'use strict';

    const noteCategoryColors = [
        '#f1f5f9', '#ffedd5', '#fef9c3', '#dcfce7', '#d1fae5',
        '#e0f2fe', '#e0e7ff', '#fae8ff', '#ffe4e6', '#fee2e2'
    ];
    const defaultCategoryNames = Array.from({ length: 10 }, (_, i) => `Category ${i + 1}`);
    const LEGACY_KEYS = ['urgencyFlowData_backup', 'urgencyFlowData'];

    const state = {
        allNotes: [],
        notes: [],
        selectedId: null,
        selectedTaskIds: [],
        taskOptions: [],
        activeListFilter: 'all',
        activeTagFilter: 'all',
        activeRecentWindow: '7d',
        activeSortMode: 'pinned-timestamp-desc',
        noteReminderIds: new Set(),
        urgentTaskIds: new Set(),
        blocks: [],
        draggedBlockId: null,
        lastSavedAt: null,
        isSaving: false,
        hasRemoteConflict: false,
        viewMode: 'edit',
        activeMetaPanel: null,
        paletteOpen: false,
        shortcutsHelpOpen: false,
        paletteResults: [],
        paletteActiveIndex: 0,
        isReady: false,
        dirty: false,
        saveTimer: null
    };

    const els = {
        search: null,
        list: null,
        count: null,
        status: null,
        dirtyIndicator: null,
        lastSaved: null,
        conflictBanner: null,
        conflictMessage: null,
        conflictKeepBtn: null,
        conflictReloadBtn: null,
        title: null,
        filterSelect: null,
        tagFilterSelect: null,
        recentWindowSelect: null,
        sortSelect: null,
        metaGrid: null,
        metaLinkedToggleBtn: null,
        metaBookmarkToggleBtn: null,
        metaLinkedField: null,
        metaBookmarkField: null,
        taskPicker: null,
        taskChipList: null,
        taskSearch: null,
        taskSuggestions: null,
        taskClearBtn: null,
        bookmarkJump: null,
        blocksContainer: null,
        newBtn: null,
        addBlockBtn: null,
        toggleViewBtn: null,
        pinBtn: null,
        saveBtn: null,
        deleteBtn: null,
        commandPaletteOverlay: null,
        commandPaletteWindow: null,
        commandPaletteInput: null,
        commandPaletteList: null,
        commandPaletteCloseBtn: null,
        shortcutsBtn: null,
        shortcutsOverlay: null,
        shortcutsWindow: null,
        shortcutsBody: null,
        shortcutsCloseBtn: null
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

    function formatClockTime(ts) {
        const num = Number(ts);
        if (!Number.isFinite(num) || num <= 0) return '--';
        try {
            return new Date(num).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
            });
        } catch (error) {
            return '--';
        }
    }

    function updateSaveIndicators() {
        if (els.dirtyIndicator) {
            els.dirtyIndicator.classList.remove('clean', 'dirty', 'saving');
            if (state.isSaving) {
                els.dirtyIndicator.classList.add('saving');
                els.dirtyIndicator.textContent = 'Saving...';
            } else if (state.dirty) {
                els.dirtyIndicator.classList.add('dirty');
                els.dirtyIndicator.textContent = 'Unsaved changes';
            } else {
                els.dirtyIndicator.classList.add('clean');
                els.dirtyIndicator.textContent = 'All changes saved';
            }
        }

        if (els.lastSaved) {
            els.lastSaved.textContent = `Last saved: ${formatClockTime(state.lastSavedAt)}`;
        }
    }

    function showConflictBanner(message = '') {
        state.hasRemoteConflict = true;
        if (els.conflictMessage) {
            els.conflictMessage.textContent = message || 'Remote changes were detected while you were editing.';
        }
        if (els.conflictBanner) els.conflictBanner.hidden = false;
    }

    function hideConflictBanner() {
        state.hasRemoteConflict = false;
        if (els.conflictBanner) els.conflictBanner.hidden = true;
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

    function normalizeSortMode(sortMode) {
        const allowed = new Set(['pinned-timestamp-desc', 'timestamp-desc', 'timestamp-asc', 'title-asc', 'title-desc']);
        return allowed.has(sortMode) ? sortMode : 'pinned-timestamp-desc';
    }

    function normalizeFilterMode(filterMode) {
        const allowed = new Set([
            'all',
            'pinned',
            'linked',
            'bookmarked',
            'unlinked',
            'has-reminder',
            'urgent-linked',
            'recently-edited'
        ]);
        return allowed.has(filterMode) ? filterMode : 'all';
    }

    function normalizeTagFilterValue(tagFilter) {
        if (typeof tagFilter !== 'string') return 'all';
        const trimmed = tagFilter.trim().toLowerCase();
        if (!trimmed || trimmed === 'all') return 'all';
        return trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
    }

    function normalizeRecentWindow(windowValue) {
        const allowed = new Set(['24h', '7d', '30d']);
        return allowed.has(windowValue) ? windowValue : '7d';
    }

    function getRecentWindowDurationMs(windowValue) {
        const mode = normalizeRecentWindow(windowValue);
        if (mode === '24h') return 24 * 60 * 60 * 1000;
        if (mode === '30d') return 30 * 24 * 60 * 60 * 1000;
        return 7 * 24 * 60 * 60 * 1000;
    }

    function isWithinRecentWindow(timestamp, windowValue) {
        const ts = Number(timestamp);
        if (!Number.isFinite(ts) || ts <= 0) return false;
        const elapsed = Date.now() - ts;
        return elapsed >= 0 && elapsed <= getRecentWindowDurationMs(windowValue);
    }

    function normalizeViewMode(viewMode) {
        const allowed = new Set(['edit', 'split', 'preview']);
        return allowed.has(viewMode) ? viewMode : 'edit';
    }

    function getNextViewMode(currentMode) {
        const order = ['edit', 'split', 'preview'];
        const current = normalizeViewMode(currentMode);
        const currentIndex = order.indexOf(current);
        return order[(currentIndex + 1) % order.length];
    }

    function getViewModeLabel(viewMode) {
        const mode = normalizeViewMode(viewMode);
        if (mode === 'split') return 'Mode: Split';
        if (mode === 'preview') return 'Mode: Preview';
        return 'Mode: Edit';
    }

    function noteHasBookmarks(note) {
        const blocks = parseNoteBody(note && note.body);
        return blocks.some(block => typeof block.bookmarkName === 'string' && block.bookmarkName.trim().length > 0);
    }

    function extractNoteTags(note) {
        const blocks = parseNoteBody(note && note.body);
        const text = blocks.map(block => block.text || '').join('\n');
        const matches = text.match(/#[a-zA-Z0-9_-]+/g) || [];
        return Array.from(new Set(matches.map(tag => tag.toLowerCase())));
    }

    function noteHasTag(note, tagFilter) {
        const normalizedTag = normalizeTagFilterValue(tagFilter);
        if (normalizedTag === 'all') return true;
        return extractNoteTags(note).includes(normalizedTag);
    }

    function noteLinksToUrgentTask(note) {
        const taskIds = normalizeTaskIds(note && note.taskIds);
        if (!taskIds.length || !(state.urgentTaskIds instanceof Set)) return false;
        return taskIds.some(taskId => state.urgentTaskIds.has(String(taskId)));
    }

    function applyListFilter(notes) {
        const mode = normalizeFilterMode(state.activeListFilter);
        const tagFilter = normalizeTagFilterValue(state.activeTagFilter);
        const recentWindow = normalizeRecentWindow(state.activeRecentWindow);

        return notes.filter((note) => {
            if (mode === 'pinned' && !note.isPinned) return false;
            if (mode === 'linked' && normalizeTaskIds(note.taskIds).length === 0) return false;
            if (mode === 'bookmarked' && !noteHasBookmarks(note)) return false;
            if (mode === 'unlinked' && normalizeTaskIds(note.taskIds).length > 0) return false;
            if (mode === 'has-reminder' && !state.noteReminderIds.has(String(note.id))) return false;
            if (mode === 'urgent-linked' && !noteLinksToUrgentTask(note)) return false;
            if (mode === 'recently-edited' && !isWithinRecentWindow(note.timestamp, recentWindow)) return false;
            if (tagFilter !== 'all' && !noteHasTag(note, tagFilter)) return false;
            return true;
        });
    }

    function applyListSort(notes) {
        const mode = normalizeSortMode(state.activeSortMode);
        const output = [...notes];

        if (mode === 'timestamp-desc') {
            output.sort((a, b) => (Number(b.timestamp) || 0) - (Number(a.timestamp) || 0));
            return output;
        }

        if (mode === 'timestamp-asc') {
            output.sort((a, b) => (Number(a.timestamp) || 0) - (Number(b.timestamp) || 0));
            return output;
        }

        if (mode === 'title-asc') {
            output.sort((a, b) => String(a.title || '').localeCompare(String(b.title || ''), undefined, { sensitivity: 'base' }));
            return output;
        }

        if (mode === 'title-desc') {
            output.sort((a, b) => String(b.title || '').localeCompare(String(a.title || ''), undefined, { sensitivity: 'base' }));
            return output;
        }

        output.sort((a, b) => {
            if (a.isPinned && !b.isPinned) return -1;
            if (!a.isPinned && b.isPinned) return 1;
            return (Number(b.timestamp) || 0) - (Number(a.timestamp) || 0);
        });
        return output;
    }

    function recalculateVisibleNotes(options = {}) {
        const previousSelection = state.selectedId;
        const keepSelection = options.keepSelection !== false;
        const forceSelectId = options.forceSelectId || null;

        const filtered = applyListFilter(state.allNotes);
        state.notes = applyListSort(filtered);

        let nextSelection = forceSelectId || (keepSelection ? previousSelection : null);
        if (!nextSelection || !state.notes.some(note => note.id === nextSelection)) {
            nextSelection = state.notes[0] ? state.notes[0].id : null;
        }
        state.selectedId = nextSelection;

        return {
            previousSelection,
            selectionChanged: previousSelection !== state.selectedId
        };
    }

    function applyListProjectionAndRender() {
        const projection = recalculateVisibleNotes({ keepSelection: true });
        renderList();
        updateCount();
        if (projection.selectionChanged) loadSelectedNoteIntoEditor();
    }

    function withDbHandle(runWithDb) {
        const dbApi = window.AppDB;
        if (!dbApi || typeof dbApi.openAppDB !== 'function') {
            return Promise.resolve(null);
        }

        return dbApi.openAppDB()
            .then((db) => {
                return Promise.resolve(runWithDb(db))
                    .finally(() => {
                        try { db.close(); } catch (error) { }
                    });
            })
            .catch(() => null);
    }

    function readLegacyStateData() {
        if (typeof localStorage === 'undefined') return null;
        for (const key of LEGACY_KEYS) {
            try {
                const raw = localStorage.getItem(key);
                if (!raw) continue;
                const parsed = JSON.parse(raw);
                if (parsed && typeof parsed === 'object') return parsed;
            } catch (error) { }
        }
        return null;
    }

    function readAppStateData() {
        return withDbHandle((db) => {
            return new Promise((resolve) => {
                let tx;
                try {
                    tx = db.transaction(['appState'], 'readonly');
                } catch (error) {
                    resolve(null);
                    return;
                }
                const req = tx.objectStore('appState').get('main');
                req.onsuccess = () => {
                    const record = req.result;
                    const data = record && record.data && typeof record.data === 'object'
                        ? record.data
                        : null;
                    resolve(data);
                };
                req.onerror = () => resolve(null);
                tx.onabort = () => resolve(null);
            });
        }).then((fromDb) => fromDb || readLegacyStateData() || {});
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
        return state.allNotes.find(note => note.id === state.selectedId) || null;
    }

    function updateCount() {
        if (!els.count) return;
        const visible = state.notes.length;
        const total = state.allNotes.length;
        if (visible === total) {
            els.count.textContent = `${visible} note(s)`;
            return;
        }
        els.count.textContent = `${visible} of ${total} note(s)`;
    }

    function updateRecentFilterControlState() {
        if (!els.recentWindowSelect) return;
        const recentModeActive = normalizeFilterMode(state.activeListFilter) === 'recently-edited';
        els.recentWindowSelect.disabled = !recentModeActive;
    }

    function updateTagFilterOptions() {
        if (!els.tagFilterSelect) return;

        const currentTag = normalizeTagFilterValue(state.activeTagFilter);
        const tags = Array.from(new Set(
            state.allNotes.flatMap(note => extractNoteTags(note))
        )).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));

        const options = ['<option value="all">Tag: All Tags</option>']
            .concat(tags.map(tag => `<option value="${esc(tag)}">Tag: ${esc(tag)}</option>`));
        els.tagFilterSelect.innerHTML = options.join('');

        if (currentTag !== 'all' && !tags.includes(currentTag)) {
            state.activeTagFilter = 'all';
        } else {
            state.activeTagFilter = currentTag;
        }
        els.tagFilterSelect.value = state.activeTagFilter;
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
        if (state.paletteOpen) renderCommandPalette();
        if (state.shortcutsHelpOpen) renderShortcutsHelp();
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
    function syncSplitPaneHeights(textarea, preview) {
        if (!textarea || !preview) return;
        autoResizeTextarea(textarea);
        preview.style.height = 'auto';

        const editorHeight = Math.max(textarea.scrollHeight || 0, textarea.offsetHeight || 0, 120);
        const previewHeight = Math.max(preview.scrollHeight || 0, 120);
        const targetHeight = Math.max(editorHeight, previewHeight);

        textarea.style.height = `${targetHeight}px`;
        preview.style.minHeight = `${targetHeight}px`;
        preview.style.height = `${targetHeight}px`;
    }

    function syncVisibleSplitPaneHeights() {
        if (!els.blocksContainer) return;
        const splitRows = els.blocksContainer.querySelectorAll('.note-block-split');
        splitRows.forEach((row) => {
            const textarea = row.querySelector('textarea');
            const preview = row.querySelector('.note-block-preview');
            syncSplitPaneHeights(textarea, preview);
        });
    }

    function updatePinButton() {
        if (!els.pinBtn) return;
        const note = getSelectedNote();
        els.pinBtn.textContent = note && note.isPinned ? 'Unpin' : 'Pin';
        if (state.paletteOpen) renderCommandPalette();
        if (state.shortcutsHelpOpen) renderShortcutsHelp();
    }

    function updateViewModeButton() {
        if (!els.toggleViewBtn) return;
        state.viewMode = normalizeViewMode(state.viewMode);
        els.toggleViewBtn.textContent = getViewModeLabel(state.viewMode);
        els.toggleViewBtn.title = 'Cycle mode: Edit -> Split -> Preview';
        if (state.paletteOpen) renderCommandPalette();
        if (state.shortcutsHelpOpen) renderShortcutsHelp();
    }

    function getBookmarkCount() {
        return state.blocks.reduce((count, block) => {
            if (typeof block.bookmarkName !== 'string') return count;
            if (!block.bookmarkName.trim()) return count;
            return count + 1;
        }, 0);
    }

    function updateMetaToggleButtons() {
        const linkedCount = state.selectedTaskIds.length;
        const bookmarkCount = getBookmarkCount();
        const activePanel = state.activeMetaPanel;
        const hasNote = !!getSelectedNote();

        if (els.metaLinkedToggleBtn) {
            els.metaLinkedToggleBtn.textContent = `Linked Tasks (${linkedCount})`;
            const expanded = activePanel === 'tasks';
            els.metaLinkedToggleBtn.classList.toggle('is-active', expanded);
            els.metaLinkedToggleBtn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
            els.metaLinkedToggleBtn.disabled = !hasNote;
        }

        if (els.metaBookmarkToggleBtn) {
            els.metaBookmarkToggleBtn.textContent = `Bookmarks (${bookmarkCount})`;
            const expanded = activePanel === 'bookmarks';
            els.metaBookmarkToggleBtn.classList.toggle('is-active', expanded);
            els.metaBookmarkToggleBtn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
            els.metaBookmarkToggleBtn.disabled = !hasNote;
        }

        if (state.shortcutsHelpOpen) renderShortcutsHelp();
    }

    function setActiveMetaPanel(panel) {
        const normalized = panel === 'tasks' || panel === 'bookmarks' ? panel : null;
        state.activeMetaPanel = normalized;

        if (els.metaGrid) {
            els.metaGrid.hidden = !normalized;
        }

        if (els.metaLinkedField) {
            els.metaLinkedField.hidden = normalized !== 'tasks';
        }

        if (els.metaBookmarkField) {
            els.metaBookmarkField.hidden = normalized !== 'bookmarks';
        }

        if (normalized !== 'tasks') {
            closeTaskSuggestions();
            if (els.taskSearch) els.taskSearch.value = '';
        }

        updateMetaToggleButtons();
    }

    function toggleMetaPanel(panel) {
        if (!getSelectedNote()) {
            setStatus('Select a note first.');
            return;
        }
        const nextPanel = state.activeMetaPanel === panel ? null : panel;
        setActiveMetaPanel(nextPanel);
        if (nextPanel === 'tasks' && els.taskSearch) {
            window.requestAnimationFrame(() => els.taskSearch.focus());
        }
        if (nextPanel === 'bookmarks' && els.bookmarkJump) {
            window.requestAnimationFrame(() => els.bookmarkJump.focus());
        }
    }

    function isTypingTarget(target) {
        if (!(target instanceof HTMLElement)) return false;
        if (target.isContentEditable) return true;
        const tag = target.tagName;
        return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
    }

    async function selectAdjacentNote(direction) {
        if (!Array.isArray(state.notes) || state.notes.length === 0) return;
        const currentIndex = state.notes.findIndex(note => note.id === state.selectedId);
        const baseIndex = currentIndex < 0 ? 0 : currentIndex;
        const nextIndex = Math.min(state.notes.length - 1, Math.max(0, baseIndex + direction));
        if (currentIndex >= 0 && nextIndex === currentIndex) return;
        const nextNote = state.notes[nextIndex];
        if (!nextNote) return;
        await selectNote(nextNote.id);
    }

    function getActionCommandDescriptors() {
        const selectedNote = getSelectedNote();
        const hasSelectedNote = !!selectedNote;
        const hasMultipleNotes = state.notes.length > 1;
        const linkedPanelOpen = state.activeMetaPanel === 'tasks';
        const bookmarksPanelOpen = state.activeMetaPanel === 'bookmarks';

        return [
            {
                id: 'new-note',
                title: 'Create New Note',
                meta: 'Start a blank note',
                shortcut: 'Ctrl/Cmd+N',
                keywords: 'create new note',
                run: () => createNote()
            },
            {
                id: 'show-command-help',
                title: 'Show Commands Help',
                meta: 'Open command and shortcut reference',
                shortcut: 'Ctrl/Cmd+/',
                keywords: 'help commands shortcuts',
                run: () => openShortcutsHelp()
            },
            {
                id: 'save-note',
                title: 'Save Current Note',
                meta: 'Persist current edits now',
                shortcut: 'Ctrl/Cmd+S',
                keywords: 'save write persist',
                disabled: !hasSelectedNote,
                disabledMessage: 'Select a note first.',
                run: () => saveCurrentNote({ silent: false })
            },
            {
                id: 'add-block',
                title: 'Add Block',
                meta: 'Append a new block to this note',
                keywords: 'block add',
                disabled: !hasSelectedNote,
                disabledMessage: 'Select a note first.',
                run: () => addBlock()
            },
            {
                id: 'toggle-view-mode',
                title: 'Cycle View Mode',
                meta: `Current: ${getViewModeLabel(state.viewMode).replace('Mode: ', '')}`,
                shortcut: 'Ctrl/Cmd+Shift+V',
                keywords: 'view mode edit split preview',
                disabled: !hasSelectedNote,
                disabledMessage: 'Select a note first.',
                run: () => toggleViewMode()
            },
            {
                id: 'toggle-pin',
                title: hasSelectedNote && selectedNote.isPinned ? 'Unpin Note' : 'Pin Note',
                meta: 'Toggle pin status in notes list',
                keywords: 'pin unpin',
                disabled: !hasSelectedNote,
                disabledMessage: 'Select a note first.',
                run: () => togglePinForCurrentNote()
            },
            {
                id: 'toggle-linked-panel',
                title: linkedPanelOpen ? 'Hide Linked Tasks Panel' : 'Show Linked Tasks Panel',
                meta: 'Open task linking controls',
                shortcut: 'Ctrl/Cmd+Shift+L',
                keywords: 'linked tasks panel',
                disabled: !hasSelectedNote,
                disabledMessage: 'Select a note first.',
                run: () => toggleMetaPanel('tasks')
            },
            {
                id: 'toggle-bookmarks-panel',
                title: bookmarksPanelOpen ? 'Hide Bookmarks Panel' : 'Show Bookmarks Panel',
                meta: 'Open bookmark jump controls',
                shortcut: 'Ctrl/Cmd+Shift+B',
                keywords: 'bookmark jump panel',
                disabled: !hasSelectedNote,
                disabledMessage: 'Select a note first.',
                run: () => toggleMetaPanel('bookmarks')
            },
            {
                id: 'focus-note-title',
                title: 'Focus Note Title',
                meta: 'Move cursor to note title',
                keywords: 'focus title',
                disabled: !hasSelectedNote,
                disabledMessage: 'Select a note first.',
                run: () => {
                    if (!els.title) return;
                    els.title.focus();
                    if (typeof els.title.select === 'function') els.title.select();
                }
            },
            {
                id: 'focus-list-search',
                title: 'Focus Notes Search',
                meta: 'Move cursor to note list search',
                keywords: 'focus search list',
                run: () => {
                    if (!els.search) return;
                    els.search.focus();
                    if (typeof els.search.select === 'function') els.search.select();
                }
            },
            {
                id: 'next-note',
                title: 'Select Next Note',
                meta: 'Move selection down the list',
                shortcut: 'Alt+Shift+Down',
                keywords: 'next note down',
                disabled: !hasMultipleNotes,
                disabledMessage: 'Need at least two notes.',
                run: () => selectAdjacentNote(1)
            },
            {
                id: 'previous-note',
                title: 'Select Previous Note',
                meta: 'Move selection up the list',
                shortcut: 'Alt+Shift+Up',
                keywords: 'previous note up',
                disabled: !hasMultipleNotes,
                disabledMessage: 'Need at least two notes.',
                run: () => selectAdjacentNote(-1)
            },
            {
                id: 'refresh-notes',
                title: 'Refresh Notes',
                meta: 'Reload notes from shared storage',
                keywords: 'refresh reload sync',
                run: () => refreshNotes({
                    keepSelection: true,
                    reloadEditor: true,
                    silent: true,
                    flushPending: true
                }).then(() => {
                    setStatus('Notes refreshed.');
                })
            },
            {
                id: 'delete-note',
                title: 'Delete Current Note',
                meta: 'Delete note (with confirmation)',
                keywords: 'delete remove',
                disabled: !hasSelectedNote,
                disabledMessage: 'Select a note first.',
                run: () => deleteCurrentNote()
            }
        ];
    }

    function getNoteCommandDescriptors() {
        return state.notes.map((note) => {
            const isCurrent = note.id === state.selectedId;
            const title = String(note.title || '(Untitled)');
            const dateText = formatClockTime(note.timestamp);
            const pinLabel = note.isPinned ? 'Pinned' : 'Note';
            return {
                id: `open-note:${note.id}`,
                title: `Open: ${title}`,
                meta: `${isCurrent ? 'Currently selected' : pinLabel} • ${dateText}`,
                keywords: `${title} ${extractBodyPreview(note)}`.toLowerCase(),
                run: () => selectNote(note.id)
            };
        });
    }

    function getCommandHelpItems() {
        const base = [
            {
                command: 'Open Command Palette',
                shortcut: 'Ctrl/Cmd+K or Ctrl/Cmd+Shift+P',
                detail: 'Search commands and note titles'
            },
            {
                command: 'Close Open Overlay/Panel',
                shortcut: 'Esc',
                detail: 'Closes help, palette, or open meta panel'
            },
            {
                command: 'Open Specific Note',
                shortcut: 'Command Palette',
                detail: 'Open palette and type note title'
            }
        ];

        const actionItems = getActionCommandDescriptors().map((command) => ({
            command: command.title,
            shortcut: command.shortcut || 'Command Palette',
            detail: command.meta || ''
        }));

        return [...base, ...actionItems];
    }

    function renderShortcutsHelp() {
        if (!els.shortcutsBody) return;
        const rows = getCommandHelpItems();
        els.shortcutsBody.innerHTML = `
            <table class="notes-shortcuts-table">
                <thead>
                    <tr>
                        <th>Command</th>
                        <th>Shortcut</th>
                        <th>Description</th>
                    </tr>
                </thead>
                <tbody>
                    ${rows.map((row) => `
                        <tr>
                            <td>${esc(row.command)}</td>
                            <td class="notes-shortcuts-key">${esc(row.shortcut)}</td>
                            <td>${esc(row.detail)}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    }

    function openShortcutsHelp() {
        if (!els.shortcutsOverlay) return;
        closeCommandPalette();
        closeTaskSuggestions();
        state.shortcutsHelpOpen = true;
        renderShortcutsHelp();
        els.shortcutsOverlay.hidden = false;
        els.shortcutsOverlay.classList.add('is-open');
    }

    function closeShortcutsHelp() {
        if (!els.shortcutsOverlay) return;
        state.shortcutsHelpOpen = false;
        els.shortcutsOverlay.classList.remove('is-open');
        els.shortcutsOverlay.hidden = true;
    }

    function getCommandPaletteResults(queryRaw) {
        const query = String(queryRaw || '').trim().toLowerCase();
        const tokens = query.split(/\s+/).filter(Boolean);

        const actions = getActionCommandDescriptors();
        const notes = getNoteCommandDescriptors();
        const allItems = [...actions, ...notes];

        const filtered = tokens.length === 0
            ? allItems
            : allItems.filter((item) => {
                const haystack = `${item.title} ${item.meta || ''} ${item.keywords || ''}`.toLowerCase();
                return tokens.every(token => haystack.includes(token));
            });

        if (tokens.length === 0) {
            const defaultNotes = notes.slice(0, 8);
            return [...actions, ...defaultNotes];
        }
        return filtered.slice(0, 40);
    }

    function renderCommandPalette() {
        if (!els.commandPaletteList || !els.commandPaletteInput) return;
        const results = getCommandPaletteResults(els.commandPaletteInput.value);
        state.paletteResults = results;

        if (!results.length) {
            state.paletteActiveIndex = 0;
            els.commandPaletteList.innerHTML = '<div class="command-palette-empty">No commands found.</div>';
            return;
        }

        if (state.paletteActiveIndex >= results.length) {
            state.paletteActiveIndex = results.length - 1;
        }
        if (state.paletteActiveIndex < 0) {
            state.paletteActiveIndex = 0;
        }

        els.commandPaletteList.innerHTML = results.map((item, index) => {
            const isActive = index === state.paletteActiveIndex;
            const disabledAttr = item.disabled ? 'disabled' : '';
            const activeClass = isActive ? 'active' : '';
            const shortcut = item.shortcut
                ? `<span class="command-palette-shortcut">${esc(item.shortcut)}</span>`
                : '';
            return `
                <button type="button" class="command-palette-item ${activeClass}" data-command-index="${index}" ${disabledAttr}>
                    <span class="command-palette-item-title">${esc(item.title)}</span>
                    <span class="command-palette-item-meta">${esc(item.meta || '')}</span>
                    ${shortcut}
                </button>
            `;
        }).join('');

        const activeNode = els.commandPaletteList.querySelector(`.command-palette-item[data-command-index="${state.paletteActiveIndex}"]`);
        if (activeNode && typeof activeNode.scrollIntoView === 'function') {
            activeNode.scrollIntoView({ block: 'nearest' });
        }
    }

    function openCommandPalette(initialQuery = '') {
        if (!els.commandPaletteOverlay || !els.commandPaletteInput) return;
        state.paletteOpen = true;
        state.paletteActiveIndex = 0;
        closeTaskSuggestions();
        els.commandPaletteOverlay.hidden = false;
        els.commandPaletteOverlay.classList.add('is-open');
        if (typeof initialQuery === 'string') {
            els.commandPaletteInput.value = initialQuery;
        }
        renderCommandPalette();
        window.requestAnimationFrame(() => {
            els.commandPaletteInput.focus();
            const len = els.commandPaletteInput.value.length;
            els.commandPaletteInput.setSelectionRange(len, len);
        });
    }

    function closeCommandPalette() {
        if (!els.commandPaletteOverlay) return;
        state.paletteOpen = false;
        state.paletteResults = [];
        state.paletteActiveIndex = 0;
        els.commandPaletteOverlay.classList.remove('is-open');
        els.commandPaletteOverlay.hidden = true;
    }

    async function executeCommandDescriptor(command, options = {}) {
        if (!command || typeof command.run !== 'function') return false;
        if (command.disabled) {
            if (command.disabledMessage) setStatus(command.disabledMessage);
            return false;
        }
        try {
            await Promise.resolve(command.run());
            return true;
        } catch (error) {
            console.error('[notes-page] Command failed:', error);
            setStatus('Command failed.', true);
            return false;
        } finally {
            if (options.closePalette !== false) closeCommandPalette();
        }
    }

    async function executeActionCommandById(commandId, options = {}) {
        const command = getActionCommandDescriptors().find(item => item.id === commandId);
        if (!command) return false;
        return executeCommandDescriptor(command, options);
    }

    function handleCommandPaletteInputKeydown(event) {
        const key = event.key;
        if (key === 'ArrowDown') {
            if (!state.paletteResults.length) return;
            event.preventDefault();
            state.paletteActiveIndex = (state.paletteActiveIndex + 1) % state.paletteResults.length;
            renderCommandPalette();
            return;
        }

        if (key === 'ArrowUp') {
            if (!state.paletteResults.length) return;
            event.preventDefault();
            state.paletteActiveIndex = (state.paletteActiveIndex - 1 + state.paletteResults.length) % state.paletteResults.length;
            renderCommandPalette();
            return;
        }

        if (key === 'Enter') {
            if (!state.paletteResults.length) return;
            event.preventDefault();
            const current = state.paletteResults[state.paletteActiveIndex];
            executeCommandDescriptor(current).catch(() => { });
            return;
        }

        if (key === 'Escape') {
            event.preventDefault();
            closeCommandPalette();
        }
    }

    function handleGlobalShortcuts(event) {
        const key = String(event.key || '');
        const lower = key.toLowerCase();
        const isMod = event.metaKey || event.ctrlKey;
        const isTyping = isTypingTarget(event.target);

        if (state.shortcutsHelpOpen) {
            if (lower === 'escape') {
                event.preventDefault();
                closeShortcutsHelp();
            }
            return;
        }

        if (state.paletteOpen) {
            if (lower === 'escape') {
                event.preventDefault();
                closeCommandPalette();
            }
            return;
        }

        if (isMod && lower === 'k') {
            event.preventDefault();
            openCommandPalette('');
            return;
        }

        if (isMod && event.shiftKey && lower === 'p') {
            event.preventDefault();
            openCommandPalette('');
            return;
        }

        if (isMod && lower === 's') {
            event.preventDefault();
            executeActionCommandById('save-note', { closePalette: false }).catch(() => { });
            return;
        }

        if (isMod && lower === 'n') {
            event.preventDefault();
            executeActionCommandById('new-note', { closePalette: false }).catch(() => { });
            return;
        }

        if (isMod && event.code === 'Slash') {
            event.preventDefault();
            executeActionCommandById('show-command-help', { closePalette: false }).catch(() => { });
            return;
        }

        if (isTyping) {
            if (lower === 'escape' && state.activeMetaPanel) {
                setActiveMetaPanel(null);
            }
            return;
        }

        if (isMod && event.shiftKey && lower === 'v') {
            event.preventDefault();
            executeActionCommandById('toggle-view-mode', { closePalette: false }).catch(() => { });
            return;
        }

        if (isMod && event.shiftKey && lower === 'l') {
            event.preventDefault();
            executeActionCommandById('toggle-linked-panel', { closePalette: false }).catch(() => { });
            return;
        }

        if (isMod && event.shiftKey && lower === 'b') {
            event.preventDefault();
            executeActionCommandById('toggle-bookmarks-panel', { closePalette: false }).catch(() => { });
            return;
        }

        if (event.altKey && event.shiftKey && key === 'ArrowDown') {
            event.preventDefault();
            executeActionCommandById('next-note', { closePalette: false }).catch(() => { });
            return;
        }

        if (event.altKey && event.shiftKey && key === 'ArrowUp') {
            event.preventDefault();
            executeActionCommandById('previous-note', { closePalette: false }).catch(() => { });
            return;
        }

        if (lower === 'escape' && state.activeMetaPanel) {
            setActiveMetaPanel(null);
        }
    }

    function updateBookmarkJump() {
        if (!els.bookmarkJump) return;
        const savedValue = els.bookmarkJump.value;
        const bookmarks = state.blocks
            .filter(block => typeof block.bookmarkName === 'string' && block.bookmarkName.trim())
            .map(block => ({ id: String(block.id), name: block.bookmarkName.trim() }));

        if (!bookmarks.length) {
            els.bookmarkJump.innerHTML = '<option value="">No bookmarks</option>';
            updateMetaToggleButtons();
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
        updateMetaToggleButtons();
    }

    function normalizeTaskOption(rawTask, isArchived) {
        const task = rawTask && typeof rawTask === 'object' ? rawTask : {};
        const id = String(task.id || '').trim();
        if (!id) return null;
        const title = String(task.title || id).trim() || id;
        const archived = !!isArchived;
        const completed = !!task.completed || archived;
        const status = archived ? 'archived' : (completed ? 'completed' : 'active');
        return { id, title, status, completed, archived };
    }

    async function refreshTaskOptions() {
        const data = await readAppStateData();
        const activeTasks = Array.isArray(data.nodes) ? data.nodes : [];
        const archivedTasks = Array.isArray(data.archivedNodes) ? data.archivedNodes : [];
        const reminders = Array.isArray(data.reminders) ? data.reminders : [];

        const nextOptions = [];
        const seenIds = new Set();

        const append = (task, archived) => {
            const normalized = normalizeTaskOption(task, archived);
            if (!normalized) return;
            if (seenIds.has(normalized.id)) return;
            seenIds.add(normalized.id);
            nextOptions.push(normalized);
        };

        activeTasks.forEach(task => append(task, false));
        archivedTasks.forEach(task => append(task, true));

        nextOptions.sort((a, b) => {
            if (a.completed && !b.completed) return 1;
            if (!a.completed && b.completed) return -1;
            return a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });
        });

        const noteReminderIds = new Set();
        reminders.forEach((reminder) => {
            if (!reminder || reminder.itemType !== 'note' || !reminder.itemId) return;
            noteReminderIds.add(String(reminder.itemId));
        });

        const urgentTaskIds = new Set();
        activeTasks.forEach((task) => {
            if (!task || !task.id || task.completed) return;
            if (task._isUrgent || task.isManualUrgent) urgentTaskIds.add(String(task.id));
        });

        state.taskOptions = nextOptions;
        state.noteReminderIds = noteReminderIds;
        state.urgentTaskIds = urgentTaskIds;
        renderTaskChips();
        renderTaskSuggestions();

        if (state.isReady && (state.activeListFilter === 'has-reminder' || state.activeListFilter === 'urgent-linked')) {
            applyListProjectionAndRender();
        }
    }

    function getTaskOption(taskId) {
        const id = String(taskId || '').trim();
        if (!id) return null;
        return state.taskOptions.find(option => option.id === id) || null;
    }

    function getTaskLabel(taskId) {
        const option = getTaskOption(taskId);
        if (option) return option.title;
        return String(taskId || '');
    }

    function addLinkedTask(taskId) {
        if (!getSelectedNote()) return false;
        const normalizedId = String(taskId || '').trim();
        if (!normalizedId) return false;
        if (state.selectedTaskIds.includes(normalizedId)) return false;
        state.selectedTaskIds.push(normalizedId);
        state.selectedTaskIds = normalizeTaskIds(state.selectedTaskIds);
        renderTaskChips();
        if (els.taskSearch) els.taskSearch.value = '';
        renderTaskSuggestions();
        queueAutoSave();
        return true;
    }

    function removeLinkedTask(taskId) {
        if (!getSelectedNote()) return;
        const normalizedId = String(taskId || '').trim();
        if (!normalizedId) return;
        const before = state.selectedTaskIds.length;
        state.selectedTaskIds = state.selectedTaskIds.filter(id => id !== normalizedId);
        if (state.selectedTaskIds.length === before) return;
        renderTaskChips();
        renderTaskSuggestions();
        queueAutoSave();
    }

    function clearLinkedTasks() {
        if (!getSelectedNote()) return;
        if (state.selectedTaskIds.length === 0) return;
        state.selectedTaskIds = [];
        renderTaskChips();
        renderTaskSuggestions();
        queueAutoSave();
    }

    function getTaskSuggestionResults(queryRaw) {
        const query = String(queryRaw || '').trim().toLowerCase();
        const selected = new Set(state.selectedTaskIds);

        let matches = state.taskOptions.filter(option => !selected.has(option.id));
        if (query) {
            matches = matches.filter(option =>
                option.title.toLowerCase().includes(query) ||
                option.id.toLowerCase().includes(query)
            );
        }
        return matches.slice(0, 20);
    }

    function closeTaskSuggestions() {
        if (!els.taskSuggestions) return;
        els.taskSuggestions.hidden = true;
    }

    function openTaskSuggestions() {
        if (!els.taskSuggestions) return;
        els.taskSuggestions.hidden = false;
    }

    function renderTaskSuggestions() {
        if (!els.taskSuggestions || !els.taskSearch) return;
        if (!getSelectedNote()) {
            els.taskSuggestions.innerHTML = '';
            closeTaskSuggestions();
            return;
        }

        const query = els.taskSearch.value || '';
        const results = getTaskSuggestionResults(query);
        if (!results.length) {
            const normalized = query.trim();
            if (normalized.length > 0 && !state.selectedTaskIds.includes(normalized)) {
                els.taskSuggestions.innerHTML = `
                    <button type="button" class="task-suggestion-item" data-custom-task-id="${esc(normalized)}">
                        <span class="task-suggestion-title">Link custom ID: ${esc(normalized)}</span>
                        <span class="task-suggestion-meta">No task matched. Press Enter or click to keep this ID.</span>
                    </button>
                `;
                openTaskSuggestions();
                const customBtn = els.taskSuggestions.querySelector('[data-custom-task-id]');
                if (customBtn) {
                    customBtn.addEventListener('click', () => {
                        addLinkedTask(normalized);
                        closeTaskSuggestions();
                    });
                }
                return;
            }
            els.taskSuggestions.innerHTML = '';
            closeTaskSuggestions();
            return;
        }

        els.taskSuggestions.innerHTML = results.map(option => {
            const status = option.archived ? 'Archived task' : (option.completed ? 'Completed task' : 'Active task');
            return `
                <button type="button" class="task-suggestion-item" data-task-id="${esc(option.id)}">
                    <span class="task-suggestion-title">${esc(option.title)}</span>
                    <span class="task-suggestion-meta">${esc(status)} | ${esc(option.id)}</span>
                </button>
            `;
        }).join('');

        els.taskSuggestions.querySelectorAll('[data-task-id]').forEach(btn => {
            btn.addEventListener('click', () => {
                const taskId = btn.getAttribute('data-task-id');
                if (!taskId) return;
                addLinkedTask(taskId);
                closeTaskSuggestions();
            });
        });

        openTaskSuggestions();
    }

    function renderTaskChips() {
        if (!els.taskChipList) return;
        if (!state.selectedTaskIds.length) {
            els.taskChipList.innerHTML = '<span class="task-chip-empty">No linked tasks.</span>';
            updateMetaToggleButtons();
            return;
        }

        els.taskChipList.innerHTML = state.selectedTaskIds.map(taskId => {
            const label = getTaskLabel(taskId);
            return `
                <span class="task-chip" title="${esc(taskId)}">
                    <span class="task-chip-label">${esc(label)}</span>
                    <button type="button" class="task-chip-remove" data-remove-task-id="${esc(taskId)}" aria-label="Remove linked task">x</button>
                </span>
            `;
        }).join('');

        els.taskChipList.querySelectorAll('[data-remove-task-id]').forEach(btn => {
            btn.addEventListener('click', () => {
                const taskId = btn.getAttribute('data-remove-task-id');
                removeLinkedTask(taskId);
            });
        });
        updateMetaToggleButtons();
    }

    function reorderBlockById(sourceId, targetId, placeAfter = false) {
        const from = state.blocks.findIndex(block => String(block.id) === String(sourceId));
        const to = state.blocks.findIndex(block => String(block.id) === String(targetId));
        if (from < 0 || to < 0 || from === to) return;

        const [moving] = state.blocks.splice(from, 1);
        let insertIndex = to;
        if (from < to) insertIndex -= 1;
        if (placeAfter) insertIndex += 1;
        if (insertIndex < 0) insertIndex = 0;
        if (insertIndex > state.blocks.length) insertIndex = state.blocks.length;
        state.blocks.splice(insertIndex, 0, moving);
    }

    function clearBlockDropMarkers() {
        if (!els.blocksContainer) return;
        els.blocksContainer.querySelectorAll('.note-block').forEach(card => {
            card.classList.remove('drag-target-before');
            card.classList.remove('drag-target-after');
            card.removeAttribute('data-drop-position');
        });
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

            card.addEventListener('dragover', (event) => {
                if (!state.draggedBlockId || state.draggedBlockId === blockId) return;
                event.preventDefault();
                const rect = card.getBoundingClientRect();
                const placeAfter = event.clientY > rect.top + (rect.height / 2);
                card.classList.toggle('drag-target-before', !placeAfter);
                card.classList.toggle('drag-target-after', placeAfter);
                card.setAttribute('data-drop-position', placeAfter ? 'after' : 'before');
            });

            card.addEventListener('dragleave', () => {
                card.classList.remove('drag-target-before');
                card.classList.remove('drag-target-after');
                card.removeAttribute('data-drop-position');
            });

            card.addEventListener('drop', (event) => {
                if (!state.draggedBlockId || state.draggedBlockId === blockId) return;
                event.preventDefault();
                const placeAfter = card.getAttribute('data-drop-position') === 'after';
                reorderBlockById(state.draggedBlockId, blockId, placeAfter);
                state.draggedBlockId = null;
                clearBlockDropMarkers();
                renderBlocks();
                queueAutoSave();
            });

            const controls = document.createElement('div');
            controls.className = 'note-block-controls';

            const dragHandle = document.createElement('button');
            dragHandle.type = 'button';
            dragHandle.className = 'btn note-block-drag-handle';
            dragHandle.textContent = 'Drag';
            dragHandle.title = 'Drag to reorder block';
            dragHandle.draggable = true;
            dragHandle.addEventListener('dragstart', (event) => {
                state.draggedBlockId = blockId;
                if (event.dataTransfer) {
                    event.dataTransfer.effectAllowed = 'move';
                    event.dataTransfer.setData('text/plain', blockId);
                }
            });
            dragHandle.addEventListener('dragend', () => {
                state.draggedBlockId = null;
                clearBlockDropMarkers();
            });

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

            controls.appendChild(dragHandle);
            controls.appendChild(categorySelect);
            controls.appendChild(bookmarkInput);
            controls.appendChild(upBtn);
            controls.appendChild(downBtn);
            controls.appendChild(deleteBtn);
            card.appendChild(controls);

            const mode = normalizeViewMode(state.viewMode);
            const makePreviewElement = () => {
                const preview = document.createElement('div');
                preview.className = 'note-block-preview';
                preview.innerHTML = renderMarkdown(block.text);
                return preview;
            };

            if (mode === 'preview') {
                card.appendChild(makePreviewElement());
            } else if (mode === 'split') {
                const splitWrap = document.createElement('div');
                splitWrap.className = 'note-block-split';

                const editorPane = document.createElement('div');
                editorPane.className = 'note-block-split-pane';
                const previewPane = document.createElement('div');
                previewPane.className = 'note-block-split-pane';

                const textarea = document.createElement('textarea');
                textarea.value = block.text || '';
                const preview = makePreviewElement();
                textarea.addEventListener('input', () => {
                    block.text = textarea.value;
                    preview.innerHTML = renderMarkdown(block.text);
                    syncSplitPaneHeights(textarea, preview);
                    queueAutoSave();
                });
                editorPane.appendChild(textarea);
                previewPane.appendChild(preview);
                splitWrap.appendChild(editorPane);
                splitWrap.appendChild(previewPane);
                card.appendChild(splitWrap);
                setTimeout(() => syncSplitPaneHeights(textarea, preview), 0);
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
        if (normalizeViewMode(state.viewMode) === 'split') {
            window.requestAnimationFrame(syncVisibleSplitPaneHeights);
        }
    }

    function clearEditor() {
        if (els.title) els.title.value = '';
        if (els.taskSearch) els.taskSearch.value = '';
        state.selectedTaskIds = [];
        state.blocks = [];
        setActiveMetaPanel(null);
        state.dirty = false;
        state.isSaving = false;
        state.lastSavedAt = null;
        hideConflictBanner();
        renderTaskChips();
        closeTaskSuggestions();
        updateSaveIndicators();
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
        if (els.taskSearch) els.taskSearch.value = '';
        setActiveMetaPanel(null);
        state.selectedTaskIds = normalizeTaskIds(note.taskIds);
        renderTaskChips();
        closeTaskSuggestions();
        state.blocks = parseNoteBody(note.body);
        state.dirty = false;
        state.isSaving = false;
        state.lastSavedAt = Number(note.timestamp) || null;
        hideConflictBanner();
        updateSaveIndicators();
        renderBlocks();
        setStatus(`Editing: ${note.title || '(Untitled)'}`);
    }

    function upsertLocalNote(note) {
        const normalized = note && typeof note === 'object' ? note : null;
        if (!normalized || !normalized.id) return;
        const idx = state.allNotes.findIndex(item => item.id === normalized.id);
        if (idx === -1) state.allNotes.push(normalized);
        else state.allNotes[idx] = normalized;
    }

    function queueAutoSave() {
        if (!state.selectedId) return;
        state.dirty = true;
        state.isSaving = false;
        updateSaveIndicators();
        setStatus('Unsaved changes');
        if (state.saveTimer) clearTimeout(state.saveTimer);
        state.saveTimer = setTimeout(() => {
            state.isSaving = true;
            updateSaveIndicators();
            saveCurrentNote({ silent: true }).catch((error) => {
                console.error('[notes-page] Auto-save failed:', error);
                state.isSaving = false;
                updateSaveIndicators();
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
        const search = (els.search && typeof els.search.value === 'string') ? els.search.value.trim() : '';

        state.allNotes = await repo.listNotes({ search });
        updateTagFilterOptions();
        updateRecentFilterControlState();
        const projection = recalculateVisibleNotes({ keepSelection, forceSelectId });

        renderList();
        if (reloadEditor || projection.selectionChanged) loadSelectedNoteIntoEditor();
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

        if (state.activeListFilter !== 'all') {
            state.activeListFilter = 'all';
            if (els.filterSelect) els.filterSelect.value = 'all';
        }
        if (els.search) els.search.value = '';
        state.selectedId = created.id;
        await refreshNotes({ keepSelection: true, forceSelectId: created.id, silent: true });
        broadcast('create', created.id);
        setStatus('Note created.');
    }

    async function saveCurrentNote(options = {}) {
        const repo = getRepo();
        const note = getSelectedNote();
        if (!repo || !note || !state.selectedId) return;

        state.isSaving = true;
        updateSaveIndicators();
        setStatus('Saving...');
        try {
            const title = (els.title && typeof els.title.value === 'string')
                ? els.title.value.trim()
                : '';
            const taskIds = normalizeTaskIds(state.selectedTaskIds);
            const patch = {
                title: title || 'New Note',
                body: serializeBlocks(),
                taskIds,
                timestamp: Date.now()
            };

            const updated = await repo.updateNote(state.selectedId, patch);
            if (!updated) {
                state.isSaving = false;
                updateSaveIndicators();
                await refreshNotes({ keepSelection: true, silent: true });
                setStatus('Unable to save note.', true);
                return;
            }

            upsertLocalNote(updated);
            const projection = recalculateVisibleNotes({ keepSelection: true, forceSelectId: updated.id });
            state.dirty = false;
            state.isSaving = false;
            state.saveTimer = null;
            state.lastSavedAt = Number(updated.timestamp) || Date.now();
            hideConflictBanner();
            updateSaveIndicators();
            renderList();
            if (projection.selectionChanged) loadSelectedNoteIntoEditor();
            if (!options.silent) setStatus(`Saved at ${formatClockTime(state.lastSavedAt)}.`);
            else setStatus(`Saved at ${formatClockTime(state.lastSavedAt)}.`);

            if (options.broadcast !== false) {
                broadcast('update', updated.id);
            }
        } catch (error) {
            state.isSaving = false;
            updateSaveIndicators();
            throw error;
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
        state.viewMode = getNextViewMode(state.viewMode);
        updateViewModeButton();
        setStatus(`View set to ${getViewModeLabel(state.viewMode).replace('Mode: ', '')}.`);
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
            if (state.dirty) {
                showConflictBanner('Remote changes were detected while you have unsaved edits. Choose which version to keep.');
                setStatus('Remote conflict detected. Choose an action below.', true);
                return;
            }

            refreshNotes({
                keepSelection: true,
                reloadEditor: true,
                silent: true
            }).then(() => {
                hideConflictBanner();
                if (sameNote) setStatus('Synced from another tab.');
            }).catch((error) => {
                console.error('[notes-page] Sync refresh failed:', error);
            });
        });
    }

    function bindEvents() {
        const applyListChange = (applyFn, logPrefix) => {
            if (!state.dirty) {
                applyFn();
                return;
            }
            flushPendingSave()
                .catch((error) => {
                    console.error(`[notes-page] Failed to flush save before ${logPrefix}:`, error);
                })
                .finally(applyFn);
        };

        if (els.search) {
            els.search.addEventListener('input', () => {
                refreshNotes({ keepSelection: true, silent: true, flushPending: true }).catch((error) => {
                    console.error('[notes-page] Search refresh failed:', error);
                });
            });
        }

        if (els.filterSelect) {
            els.filterSelect.addEventListener('change', () => {
                const applyFilter = () => {
                    state.activeListFilter = normalizeFilterMode(els.filterSelect.value);
                    updateRecentFilterControlState();
                    applyListProjectionAndRender();
                };
                applyListChange(applyFilter, 'filter change');
            });
        }

        if (els.sortSelect) {
            els.sortSelect.addEventListener('change', () => {
                const applySort = () => {
                    state.activeSortMode = normalizeSortMode(els.sortSelect.value);
                    applyListProjectionAndRender();
                };
                applyListChange(applySort, 'sort change');
            });
        }

        if (els.tagFilterSelect) {
            els.tagFilterSelect.addEventListener('change', () => {
                const applyTagFilter = () => {
                    state.activeTagFilter = normalizeTagFilterValue(els.tagFilterSelect.value);
                    applyListProjectionAndRender();
                };
                applyListChange(applyTagFilter, 'tag filter change');
            });
        }

        if (els.recentWindowSelect) {
            els.recentWindowSelect.addEventListener('change', () => {
                const applyRecentWindow = () => {
                    state.activeRecentWindow = normalizeRecentWindow(els.recentWindowSelect.value);
                    applyListProjectionAndRender();
                };
                applyListChange(applyRecentWindow, 'recent window change');
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

        if (els.metaLinkedToggleBtn) {
            els.metaLinkedToggleBtn.addEventListener('click', () => {
                toggleMetaPanel('tasks');
            });
        }

        if (els.metaBookmarkToggleBtn) {
            els.metaBookmarkToggleBtn.addEventListener('click', () => {
                toggleMetaPanel('bookmarks');
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

        if (els.shortcutsBtn) {
            els.shortcutsBtn.addEventListener('click', () => {
                openShortcutsHelp();
            });
        }

        if (els.shortcutsOverlay) {
            els.shortcutsOverlay.addEventListener('click', (event) => {
                if (event.target !== els.shortcutsOverlay) return;
                closeShortcutsHelp();
            });
        }

        if (els.shortcutsWindow) {
            els.shortcutsWindow.addEventListener('click', (event) => {
                event.stopPropagation();
            });
        }

        if (els.shortcutsCloseBtn) {
            els.shortcutsCloseBtn.addEventListener('click', () => {
                closeShortcutsHelp();
            });
        }

        if (els.commandPaletteInput) {
            els.commandPaletteInput.addEventListener('input', () => {
                state.paletteActiveIndex = 0;
                renderCommandPalette();
            });
            els.commandPaletteInput.addEventListener('keydown', handleCommandPaletteInputKeydown);
        }

        if (els.commandPaletteList) {
            els.commandPaletteList.addEventListener('click', (event) => {
                const button = event.target instanceof Element
                    ? event.target.closest('[data-command-index]')
                    : null;
                if (!button) return;
                const index = Number(button.getAttribute('data-command-index'));
                if (!Number.isInteger(index)) return;
                const command = state.paletteResults[index];
                executeCommandDescriptor(command).catch(() => { });
            });
        }

        if (els.commandPaletteOverlay) {
            els.commandPaletteOverlay.addEventListener('click', (event) => {
                if (event.target !== els.commandPaletteOverlay) return;
                closeCommandPalette();
            });
        }

        if (els.commandPaletteWindow) {
            els.commandPaletteWindow.addEventListener('click', (event) => {
                event.stopPropagation();
            });
        }

        if (els.commandPaletteCloseBtn) {
            els.commandPaletteCloseBtn.addEventListener('click', () => {
                closeCommandPalette();
            });
        }

        if (els.title) {
            els.title.addEventListener('input', queueAutoSave);
        }

        if (els.taskSearch) {
            els.taskSearch.addEventListener('focus', () => {
                refreshTaskOptions().catch(() => { });
                renderTaskSuggestions();
            });

            els.taskSearch.addEventListener('input', () => {
                renderTaskSuggestions();
            });

            els.taskSearch.addEventListener('keydown', (event) => {
                if (event.key === 'Escape') {
                    closeTaskSuggestions();
                    return;
                }
                if (event.key !== 'Enter') return;

                event.preventDefault();
                const query = (els.taskSearch.value || '').trim();
                if (!query) return;

                const results = getTaskSuggestionResults(query);
                if (results.length > 0) addLinkedTask(results[0].id);
                else addLinkedTask(query);
                closeTaskSuggestions();
            });
        }

        if (els.taskClearBtn) {
            els.taskClearBtn.addEventListener('click', clearLinkedTasks);
        }

        if (els.bookmarkJump) {
            els.bookmarkJump.addEventListener('change', () => {
                const blockId = els.bookmarkJump.value;
                if (!blockId) return;
                jumpToBookmark(blockId);
            });
        }

        if (els.conflictKeepBtn) {
            els.conflictKeepBtn.addEventListener('click', () => {
                if (!state.dirty) {
                    hideConflictBanner();
                    return;
                }
                saveCurrentNote({ silent: false })
                    .then(() => {
                        hideConflictBanner();
                        setStatus('Kept local edits and synced.');
                    })
                    .catch((error) => {
                        console.error('[notes-page] Failed to keep local edits:', error);
                        setStatus('Failed to keep local edits.', true);
                    });
            });
        }

        if (els.conflictReloadBtn) {
            els.conflictReloadBtn.addEventListener('click', () => {
                if (state.saveTimer) {
                    clearTimeout(state.saveTimer);
                    state.saveTimer = null;
                }
                state.dirty = false;
                state.isSaving = false;
                hideConflictBanner();
                updateSaveIndicators();
                refreshNotes({ keepSelection: true, reloadEditor: true, silent: true })
                    .then(() => {
                        setStatus('Reloaded remote version.');
                    })
                    .catch((error) => {
                        console.error('[notes-page] Failed to reload remote version:', error);
                        setStatus('Failed to reload remote version.', true);
                    });
            });
        }

        document.addEventListener('click', (event) => {
            if (!els.taskPicker) return;
            if (els.taskPicker.contains(event.target)) return;
            closeTaskSuggestions();
        });

        document.addEventListener('keydown', handleGlobalShortcuts);

        window.addEventListener('beforeunload', () => {
            if (state.saveTimer) {
                clearTimeout(state.saveTimer);
                state.saveTimer = null;
            }
        });

        window.addEventListener('resize', () => {
            if (normalizeViewMode(state.viewMode) !== 'split') return;
            window.requestAnimationFrame(syncVisibleSplitPaneHeights);
        });
    }

    function captureElements() {
        els.search = document.getElementById('notes-search');
        els.list = document.getElementById('notes-list');
        els.count = document.getElementById('notes-count');
        els.status = document.getElementById('notes-status');
        els.dirtyIndicator = document.getElementById('notes-dirty-indicator');
        els.lastSaved = document.getElementById('notes-last-saved');
        els.conflictBanner = document.getElementById('notes-conflict-banner');
        els.conflictMessage = document.getElementById('notes-conflict-message');
        els.conflictKeepBtn = document.getElementById('notes-conflict-keep-btn');
        els.conflictReloadBtn = document.getElementById('notes-conflict-reload-btn');
        els.title = document.getElementById('note-title');
        els.filterSelect = document.getElementById('notes-filter-select');
        els.tagFilterSelect = document.getElementById('notes-tag-filter-select');
        els.recentWindowSelect = document.getElementById('notes-recent-window-select');
        els.sortSelect = document.getElementById('notes-sort-select');
        els.metaGrid = document.getElementById('editor-meta-grid');
        els.metaLinkedToggleBtn = document.getElementById('meta-linked-toggle-btn');
        els.metaBookmarkToggleBtn = document.getElementById('meta-bookmark-toggle-btn');
        els.metaLinkedField = document.getElementById('meta-linked-field');
        els.metaBookmarkField = document.getElementById('meta-bookmark-field');
        els.taskPicker = document.getElementById('note-task-picker');
        els.taskChipList = document.getElementById('note-task-chip-list');
        els.taskSearch = document.getElementById('note-task-search');
        els.taskSuggestions = document.getElementById('note-task-suggestions');
        els.taskClearBtn = document.getElementById('note-task-clear-btn');
        els.bookmarkJump = document.getElementById('bookmark-jump');
        els.blocksContainer = document.getElementById('blocks-container');
        els.newBtn = document.getElementById('new-note-btn');
        els.addBlockBtn = document.getElementById('add-block-btn');
        els.toggleViewBtn = document.getElementById('toggle-view-btn');
        els.pinBtn = document.getElementById('pin-note-btn');
        els.saveBtn = document.getElementById('save-note-btn');
        els.deleteBtn = document.getElementById('delete-note-btn');
        els.commandPaletteOverlay = document.getElementById('command-palette-overlay');
        els.commandPaletteWindow = document.getElementById('command-palette-window');
        els.commandPaletteInput = document.getElementById('command-palette-input');
        els.commandPaletteList = document.getElementById('command-palette-list');
        els.commandPaletteCloseBtn = document.getElementById('command-palette-close-btn');
        els.shortcutsBtn = document.getElementById('notes-shortcuts-btn');
        els.shortcutsOverlay = document.getElementById('notes-shortcuts-overlay');
        els.shortcutsWindow = document.getElementById('notes-shortcuts-window');
        els.shortcutsBody = document.getElementById('notes-shortcuts-body');
        els.shortcutsCloseBtn = document.getElementById('notes-shortcuts-close-btn');

        state.activeListFilter = normalizeFilterMode(els.filterSelect ? els.filterSelect.value : state.activeListFilter);
        state.activeTagFilter = normalizeTagFilterValue(els.tagFilterSelect ? els.tagFilterSelect.value : state.activeTagFilter);
        state.activeRecentWindow = normalizeRecentWindow(els.recentWindowSelect ? els.recentWindowSelect.value : state.activeRecentWindow);
        state.activeSortMode = normalizeSortMode(els.sortSelect ? els.sortSelect.value : state.activeSortMode);
        state.viewMode = normalizeViewMode(state.viewMode);
        closeCommandPalette();
        closeShortcutsHelp();
        updateViewModeButton();
        updateRecentFilterControlState();
        setActiveMetaPanel(null);
        hideConflictBanner();
        updateSaveIndicators();
        updateMetaToggleButtons();
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
            await refreshTaskOptions();
            renderTaskChips();
            state.isReady = true;
            setStatus('Ready.');
        } catch (error) {
            console.error('[notes-page] Initialization failed:', error);
            setStatus('Failed to load notes.', true);
        }
    });
})();
