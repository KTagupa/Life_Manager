// --- NOTES LOGIC ---

function toggleNotesPanel(forceOpen = null) {
    const notesPanel = document.getElementById('notes-panel');
    const aiModal = document.getElementById('ai-modal'); // Use aiModal for consistency

    const shouldOpen = forceOpen === true || (forceOpen === null && notesPanel.classList.contains('hidden'));
    if (shouldOpen) {
        if (typeof openRightDockPanel === 'function') {
            openRightDockPanel('notes-panel', () => {
                renderNotesList();
            });
        } else {
            notesPanel.classList.remove('hidden');
            renderNotesList();
        }
        if (aiModal.classList.contains('visible')) { // Check if AI modal is open
            closeAIModal(); // Close AI modal if open
        }
    } else {
        if (typeof closeRightDockPanel === 'function') closeRightDockPanel('notes-panel');
        else notesPanel.classList.add('hidden');
    }
}

function hasSharedNotesRepository() {
    return !!(
        window.NotesRepository &&
        typeof window.NotesRepository.listNotes === 'function' &&
        typeof window.NotesRepository.createNote === 'function' &&
        typeof window.NotesRepository.updateNote === 'function' &&
        typeof window.NotesRepository.deleteNote === 'function'
    );
}

function upsertLocalNote(note) {
    if (!note || !note.id) return;
    const idx = notes.findIndex(n => n.id === note.id);
    if (idx === -1) notes.push(note);
    else notes[idx] = note;
}

function persistCreatedNote(note) {
    if (!hasSharedNotesRepository() || !note) return Promise.resolve(note);
    return window.NotesRepository.createNote(note)
        .then((created) => {
            if (created) upsertLocalNote(created);
            return created;
        })
        .catch((error) => {
            console.error('[notes] Failed to persist created note via repository:', error);
            return note;
        });
}

function persistUpdatedNote(noteId, patch) {
    if (!hasSharedNotesRepository() || !noteId) return Promise.resolve(null);
    return window.NotesRepository.updateNote(noteId, patch || {})
        .then((updated) => {
            if (updated) upsertLocalNote(updated);
            return updated;
        })
        .catch((error) => {
            console.error('[notes] Failed to persist updated note via repository:', error);
            return null;
        });
}

function persistDeletedNote(noteId) {
    if (!hasSharedNotesRepository() || !noteId) return Promise.resolve(false);
    return window.NotesRepository.deleteNote(noteId)
        .then((deleted) => {
            if (deleted) notes = notes.filter(n => n.id !== noteId);
            return deleted;
        })
        .catch((error) => {
            console.error('[notes] Failed to delete note via repository:', error);
            return false;
        });
}

function broadcastNotesChange(type, id) {
    if (!window.NotesSync || typeof window.NotesSync.broadcastNotesEvent !== 'function') return;
    window.NotesSync.broadcastNotesEvent({ type, id });
}

function syncNotesFromRepository(options = {}) {
    if (!hasSharedNotesRepository()) return Promise.resolve(notes);

    const shouldRender = options.render !== false;
    const preserveSelection = options.preserveSelection !== false;
    const previousEditingId = preserveSelection ? currentEditingNoteId : null;

    return window.NotesRepository.listNotes({ sort: 'pinned-timestamp-desc' })
        .then((repoNotes) => {
            notes = Array.isArray(repoNotes) ? repoNotes : [];

            if (previousEditingId && !notes.some(n => n.id === previousEditingId)) {
                const editor = document.getElementById('note-editor');
                if (editor) editor.classList.add('hidden');
                currentEditingNoteId = null;
                currentNoteBlocks = [];
                activeBlockId = null;
            }

            if (shouldRender && typeof renderNotesList === 'function') {
                renderNotesList();
            }

            return notes;
        })
        .catch((error) => {
            console.error('[notes] Failed to sync notes from repository:', error);
            return notes;
        });
}

function initIndexNotesLiveSync() {
    if (!window.NotesSync || typeof window.NotesSync.initNotesChannel !== 'function') return null;

    return window.NotesSync.initNotesChannel(() => {
        syncNotesFromRepository({ render: true, preserveSelection: true }).then(() => {
            if (typeof updateAINoteSelectionSummary === 'function') updateAINoteSelectionSummary();
            if (selectedNodeId && typeof updateInspector === 'function') updateInspector();
        });
    });
}

window.syncNotesFromRepository = syncNotesFromRepository;
window.initIndexNotesLiveSync = initIndexNotesLiveSync;

const SIDE_NOTES_FILTER_MODES = new Set(['all', 'has-reminder', 'urgent-linked', 'recently-edited']);
const SIDE_NOTES_RECENT_WINDOWS = new Set(['24h', '7d', '30d']);

let sideNotesFilterMode = 'all';
let sideNotesTagFilter = 'all';
let sideNotesRecentWindow = '7d';

function normalizeSideNotesFilterMode(mode) {
    return SIDE_NOTES_FILTER_MODES.has(mode) ? mode : 'all';
}

function normalizeSideNotesRecentWindow(windowValue) {
    return SIDE_NOTES_RECENT_WINDOWS.has(windowValue) ? windowValue : '7d';
}

function normalizeSideNotesTagFilter(tagValue) {
    if (typeof tagValue !== 'string') return 'all';
    const trimmed = tagValue.trim().toLowerCase();
    if (!trimmed || trimmed === 'all') return 'all';
    return trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
}

function extractSideNoteBodyText(note) {
    if (!note || typeof note.body !== 'string') return '';
    try {
        const blocks = JSON.parse(note.body);
        if (Array.isArray(blocks)) {
            return blocks.map(block => block && typeof block.text === 'string' ? block.text : '').join(' ');
        }
    } catch (error) { /* legacy plain text */ }
    return note.body || '';
}

function extractSideNoteTags(note) {
    const text = extractSideNoteBodyText(note);
    const matches = text.match(/#[a-zA-Z0-9_-]+/g) || [];
    return Array.from(new Set(matches.map(tag => tag.toLowerCase())));
}

function collectAllSideNoteTags(noteList) {
    return Array.from(new Set(
        (Array.isArray(noteList) ? noteList : []).flatMap(note => extractSideNoteTags(note))
    )).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
}

function getSideRecentWindowDurationMs(windowValue) {
    const mode = normalizeSideNotesRecentWindow(windowValue);
    if (mode === '24h') return 24 * 60 * 60 * 1000;
    if (mode === '30d') return 30 * 24 * 60 * 60 * 1000;
    return 7 * 24 * 60 * 60 * 1000;
}

function isSideNoteRecentlyEdited(note, windowValue) {
    const timestamp = Number(note && note.timestamp);
    if (!Number.isFinite(timestamp) || timestamp <= 0) return false;
    const elapsed = Date.now() - timestamp;
    return elapsed >= 0 && elapsed <= getSideRecentWindowDurationMs(windowValue);
}

function noteHasUrgentLinksForSidePanel(note) {
    if (typeof getNoteLinkMetrics === 'function') {
        const metrics = getNoteLinkMetrics(note);
        return Number(metrics && metrics.urgentTaskCount) > 0;
    }
    const taskIds = Array.isArray(note && note.taskIds) ? note.taskIds : [];
    const activeTasks = Array.isArray(window.nodes) ? window.nodes : [];
    if (!taskIds.length || !activeTasks.length) return false;
    return taskIds.some((taskId) => {
        const task = activeTasks.find(item => item && item.id === taskId);
        return !!(task && !task.completed && (task._isUrgent || task.isManualUrgent));
    });
}

function updateSideNotesTagFilterOptions(tags) {
    const tagSelect = document.getElementById('note-tag-filter-select');
    if (!tagSelect) return;

    const normalizedCurrentTag = normalizeSideNotesTagFilter(sideNotesTagFilter);
    const normalizedTags = Array.from(new Set((Array.isArray(tags) ? tags : [])
        .map(tag => normalizeSideNotesTagFilter(tag))
        .filter(tag => tag !== 'all')));

    const options = ['<option value="all">Tag: All Tags</option>']
        .concat(normalizedTags.map(tag => `<option value="${escapeHtml(tag)}">Tag: ${escapeHtml(tag)}</option>`));
    tagSelect.innerHTML = options.join('');

    if (normalizedCurrentTag !== 'all' && !normalizedTags.includes(normalizedCurrentTag)) {
        sideNotesTagFilter = 'all';
    } else {
        sideNotesTagFilter = normalizedCurrentTag;
    }
    tagSelect.value = sideNotesTagFilter;
}

function updateSideNotesRecentFilterControlState() {
    const recentSelect = document.getElementById('note-recent-window-select');
    if (!recentSelect) return;
    recentSelect.disabled = normalizeSideNotesFilterMode(sideNotesFilterMode) !== 'recently-edited';
}

function ensureSideNotesFilterControls(noteList) {
    const controlsHost = document.getElementById('note-tags-filter');
    if (!controlsHost) return;

    if (!controlsHost.dataset.filtersInitialized) {
        const filterSelect = document.createElement('select');
        filterSelect.id = 'note-quick-filter-select';
        filterSelect.className = 'note-filter-select';
        filterSelect.innerHTML = [
            '<option value="all">Filter: All Notes</option>',
            '<option value="has-reminder">Filter: Has Reminder</option>',
            '<option value="urgent-linked">Filter: Urgent-linked</option>',
            '<option value="recently-edited">Filter: Recently Edited</option>'
        ].join('');
        filterSelect.addEventListener('change', () => {
            sideNotesFilterMode = normalizeSideNotesFilterMode(filterSelect.value);
            updateSideNotesRecentFilterControlState();
            renderNotesList();
        });

        const tagSelect = document.createElement('select');
        tagSelect.id = 'note-tag-filter-select';
        tagSelect.className = 'note-filter-select';
        tagSelect.addEventListener('change', () => {
            sideNotesTagFilter = normalizeSideNotesTagFilter(tagSelect.value);
            renderNotesList();
        });

        const recentSelect = document.createElement('select');
        recentSelect.id = 'note-recent-window-select';
        recentSelect.className = 'note-filter-select';
        recentSelect.innerHTML = [
            '<option value="24h">Recent: Last 24 Hours</option>',
            '<option value="7d">Recent: Last 7 Days</option>',
            '<option value="30d">Recent: Last 30 Days</option>'
        ].join('');
        recentSelect.addEventListener('change', () => {
            sideNotesRecentWindow = normalizeSideNotesRecentWindow(recentSelect.value);
            renderNotesList();
        });

        controlsHost.appendChild(filterSelect);
        controlsHost.appendChild(tagSelect);
        controlsHost.appendChild(recentSelect);
        controlsHost.dataset.filtersInitialized = 'true';
    }

    const filterSelect = document.getElementById('note-quick-filter-select');
    if (filterSelect) {
        sideNotesFilterMode = normalizeSideNotesFilterMode(sideNotesFilterMode);
        filterSelect.value = sideNotesFilterMode;
    }

    const recentSelect = document.getElementById('note-recent-window-select');
    if (recentSelect) {
        sideNotesRecentWindow = normalizeSideNotesRecentWindow(sideNotesRecentWindow);
        recentSelect.value = sideNotesRecentWindow;
    }

    updateSideNotesTagFilterOptions(collectAllSideNoteTags(noteList));
    updateSideNotesRecentFilterControlState();
}

function togglePinNotePanel() {
    const panel = document.getElementById('notes-panel');
    const btn = document.getElementById('pin-note-btn');
    panel.classList.toggle('pinned');
    panel.classList.toggle('floating');

    if (panel.classList.contains('pinned')) {
        btn.style.opacity = '1';
        btn.style.color = 'var(--accent)';
        if (!panel.style.left) {
            panel.style.right = 'auto';
            panel.style.bottom = 'auto';
            panel.style.left = (window.innerWidth - 400) + 'px';
            panel.style.top = '100px';
            panel.style.height = '600px';
        }
    } else {
        btn.style.opacity = '';
        btn.style.color = '';
        panel.style.right = '0';
        panel.style.top = '0';
        panel.style.bottom = '0';
        panel.style.left = '';
        panel.style.height = '';
    }
}

function setupPanelDrag() {
    const handle = document.getElementById('notes-header-drag-handle');
    const panel = document.getElementById('notes-panel');

    handle.addEventListener('mousedown', (e) => {
        if (!panel.classList.contains('floating')) return;
        if (e.target.tagName === 'BUTTON' || e.target.closest('button')) return;

        isPanelDragging = true;
        panelDragOffset.x = e.clientX - panel.getBoundingClientRect().left;
        panelDragOffset.y = e.clientY - panel.getBoundingClientRect().top;
        e.preventDefault();
    });

    window.addEventListener('mousemove', (e) => {
        if (!isPanelDragging) return;
        let newX = e.clientX - panelDragOffset.x;
        let newY = e.clientY - panelDragOffset.y;
        panel.style.left = newX + 'px';
        panel.style.top = newY + 'px';
        panel.style.right = 'auto';
        panel.style.bottom = 'auto';
    });

    window.addEventListener('mouseup', () => {
        isPanelDragging = false;
    });
}

function setupModalDragging() {
    // AI Modal
    const aiModal = document.getElementById('ai-modal');
    const aiHeader = document.getElementById('ai-modal-header');
    makeModalDraggable(aiModal, aiHeader, 'aiModalPosition');

    // Inbox Modal
    const inboxModal = document.getElementById('inbox-modal');
    const inboxHeader = document.getElementById('inbox-modal-header');
    makeModalDraggable(inboxModal, inboxHeader, 'inboxModalPosition');

    // Reminders Modal
    const remindersModal = document.getElementById('reminders-modal');
    const remindersHeader = document.getElementById('reminders-modal-header');
    makeModalDraggable(remindersModal, remindersHeader, 'remindersModalPosition');

    // Health Dashboard
    const healthDash = document.getElementById('health-dashboard');
    makeHealthDashboardDraggable(healthDash);

}

function makeModalDraggable(modal, handle, positionKey) {
    if (!modal || !handle) return;
    let isDragging = false;
    let currentX, currentY, initialX, initialY;

    handle.addEventListener('mousedown', (e) => {
        if (e.target.tagName === 'BUTTON' || e.target.tagName === 'INPUT' || e.target.closest('button')) return;

        isDragging = true;
        const rect = modal.getBoundingClientRect();
        initialX = e.clientX - rect.left;
        initialY = e.clientY - rect.top;

        modal.style.transform = 'none';
        modal.style.transition = 'none'; // Disable transition while dragging
        e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;

        e.preventDefault();
        currentX = e.clientX - initialX;
        currentY = e.clientY - initialY;

        modal.style.left = currentX + 'px';
        modal.style.top = currentY + 'px';
        modal.style.right = 'auto';
        modal.style.bottom = 'auto';
    });

    document.addEventListener('mouseup', () => {
        if (isDragging) {
            isDragging = false;
            modal.style.transition = ''; // Restore transition

            // Save position
            const rect = modal.getBoundingClientRect();
            const position = {
                x: rect.left,
                y: rect.top,
                width: rect.width,
                height: rect.height
            };

            if (positionKey === 'aiModalPosition') {
                aiModalPosition = position;
            } else if (positionKey === 'inboxModalPosition') {
                inboxModalPosition = position;
            } else if (positionKey === 'remindersModalPosition') {
                remindersModalPosition = position;
            }

            localStorage.setItem(positionKey, JSON.stringify(position));
        }
    });
}

function makeHealthDashboardDraggable(element) {
    let isDragging = false;
    let currentX, currentY, initialX, initialY;

    element.addEventListener('mousedown', (e) => {
        // Don't drag if clicking on buttons
        if (e.target.classList.contains('health-btn') || e.target.closest('.health-btn')) {
            return;
        }

        isDragging = true;
        const rect = element.getBoundingClientRect();
        initialX = e.clientX - rect.left;
        initialY = e.clientY - rect.top;

        element.style.transition = 'none';
        e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;

        e.preventDefault();
        currentX = e.clientX - initialX;
        currentY = e.clientY - initialY;

        element.style.left = currentX + 'px';
        element.style.top = currentY + 'px';
        element.style.bottom = 'auto';
        element.style.right = 'auto';
    });

    document.addEventListener('mouseup', () => {
        if (isDragging) {
            isDragging = false;
            element.style.transition = '';

            // Save position
            const rect = element.getBoundingClientRect();
            healthDashboardPosition = {
                x: rect.left,
                y: rect.top
            };
            localStorage.setItem('healthDashboardPosition', JSON.stringify(healthDashboardPosition));
        }
    });
}

window.jumpToTask = function (id) {
    // NEW: Check if it's an inbox temp task
    if (id && id.startsWith('inbox_temp_')) {
        const inboxModal = document.getElementById('inbox-modal');
        if (inboxModal && !inboxModal.classList.contains('visible')) {
            toggleInboxModal();
        }
        showNotification("This task is still in your Inbox");
        return;
    }

    let node = nodes.find(n => n.id === id) || archivedNodes.find(n => n.id === id);
    if (!node) return;
    selectNode(id);
    const isArchived = archivedNodes.some(n => n.id === id);

    if (!isArchived) {
        scale = 1;
        const nodeCenterX = node.x + 90;
        const nodeCenterY = node.y + 50;
        const screenCenterX = window.innerWidth / 2;
        const screenCenterY = window.innerHeight / 2;
        panX = screenCenterX - nodeCenterX;
        panY = screenCenterY - nodeCenterY;
        updateTransform();
    } else {
        const archPanel = document.getElementById('archive-panel');
        if (archPanel.classList.contains('hidden')) toggleArchivePanel();
    }
}

// IMPROVED MARKDOWN ENGINE (Obsidian Style)
function renderMarkdown(text) {
    if (!text) return '';

    // Configure marked to handle single line breaks
    marked.setOptions({
        breaks: true,
        gfm: true // GitHub Flavored Markdown
    });

    // 1. Handle [[#BookmarkName]] (Jump Links)
    let processedText = text.replace(/\[\[#(.*?)\]\]/g, (match, name) => {
        const cleanName = name.trim();
        return `<span class="bookmark-link" onclick="jumpToBookmarkByName('${cleanName.replace(/'/g, "\\'")}')">#${cleanName}</span>`;
    });

    // 2. Handle [[WikiLinks]] (Existing logic)
    processedText = processedText.replace(/\[\[(.*?)\]\]/g, (match, title) => {
        const cleanTitle = title.replace(/^Note: /, '').trim();
        const target = notes.find(n => n.title.toLowerCase() === cleanTitle.toLowerCase()) ||
            nodes.find(n => n.title.toLowerCase() === cleanTitle.toLowerCase()) ||
            archivedNodes.find(n => n.id === cleanTitle) || // Added ID fallback
            archivedNodes.find(n => n.title.toLowerCase() === cleanTitle.toLowerCase());

        if (target) {
            const isNote = target.body !== undefined;
            const color = isNote ? 'var(--accent)' : 'var(--ready-color)';
            const action = isNote ? `openNoteEditor('${target.id}')` : `jumpToTask('${target.id}')`;
            return `<span class="wiki-link" style="color:${color}; cursor:pointer; text-decoration:underline;" onclick="${action}">${title}</span>`;
        } else {
            return `<span style="color:#666; font-style:italic;">[[${title}]]</span>`;
        }
    });

    // 2. Parse Markdown
    let html = marked.parse(processedText);

    // 3. Add Backlinks Section
    const backlinks = getBacklinks(currentEditingNoteId);
    if (backlinks.length > 0) {
        html += `<div style="margin-top:40px; padding-top:20px; border-top:1px solid #333;">
                        <h4 style="color:#666; font-size:12px; letter-spacing:1px;">BACKLINKS (MENTIONS)</h4>
                        ${backlinks.map(b => `
                            <div class="note-card" style="padding:8px; margin-bottom:5px; font-size:12px;" onclick="${b.action}">
                                <div style="color:var(--text-muted); font-size:10px;">${b.type}</div>
                                <b>${b.title}</b>
                            </div>
                        `).join('')}
                     </div>`;
    }

    return html;
}

// Logic to find bi-directional links
function getBacklinks(noteId) {
    if (!noteId) return [];
    const currentNote = notes.find(n => n.id === noteId);
    if (!currentNote) return [];

    const results = [];
    const title = currentNote.title.toLowerCase();

    // Helper to get searchable text from note body
    function getNoteBodyText(noteBody) {
        try {
            const blocks = JSON.parse(noteBody);
            if (Array.isArray(blocks)) {
                return blocks.map(b => b.text || '').join('\n').toLowerCase();
            }
        } catch (e) { /* not JSON */ }
        return (noteBody || '').toLowerCase();
    }

    // Search in other notes
    notes.forEach(n => {
        if (n.id !== noteId) {
            const bodyText = getNoteBodyText(n.body);
            if (bodyText.includes(`[[${title}]]`)) {
                results.push({ title: n.title, type: 'NOTE', action: `openNoteEditor('${n.id}')` });
            }
        }
    });

    // Search in task descriptions
    nodes.forEach(n => {
        if (n.description && n.description.toLowerCase().includes(`[[${title}]]`)) {
            results.push({ title: n.title, type: 'TASK', action: `jumpToTask('${n.id}')` });
        }
    });

    return results;
}


function createTaskFromSelection() {
    const menu = document.getElementById('selection-menu');
    menu.style.display = 'none'; // Hide menu

    if (!currentSelectionText) {
        showNotification("No text selected");
        return;
    }

    // Create the task
    const worldX = (window.innerWidth / 2 - panX) / scale - 90 + (Math.random() * 40 - 20);
    const worldY = (window.innerHeight / 2 - panY) / scale - 50 + (Math.random() * 40 - 20);
    const newNode = createNode(worldX, worldY, currentSelectionText);
    nodes.push(newNode);

    // Only if selection source is 'note', we replace the text in the active block
    if (currentSelectionSource === 'note' && noteSelectionRange && activeBlockId) {
        const textarea = document.getElementById(`editor-${activeBlockId}`);
        if (textarea) {
            const text = textarea.value;
            const replacement = `[[${currentSelectionText}]]`;

            const before = text.substring(0, noteSelectionRange.start);
            const after = text.substring(noteSelectionRange.end);
            textarea.value = before + replacement + after;
            updateBlockText(activeBlockId, textarea.value);
        }

        // Link new task to current note
        if (currentEditingNoteId) {
            const note = notes.find(n => n.id === currentEditingNoteId);
            if (note) {
                if (!note.taskIds) note.taskIds = [];
                if (!note.taskIds.includes(newNode.id)) {
                    note.taskIds.push(newNode.id);
                    renderNoteLinkedTasksFooter();
                }
            }
        }
        triggerNoteSave();
    }

    updateCalculations();
    render();
    saveToStorage();

    showNotification("Task Created: " + currentSelectionText.substring(0, 20) + (currentSelectionText.length > 20 ? "..." : ""));
}

function createNoteFromSelection() {
    const menu = document.getElementById('selection-menu');
    menu.style.display = 'none'; // Hide menu

    if (!currentSelectionText) {
        showNotification("No text selected");
        return;
    }

    // Create new note
    // Truncate title if too long
    let title = currentSelectionText;
    if (title.length > 30) title = title.substring(0, 30) + "...";

    // Link parent task(s) if we are editing a note linked to tasks
    let parentTaskIDs = [];
    if (currentEditingNoteId && currentSelectionSource === 'note') {
        const currentNote = notes.find(n => n.id === currentEditingNoteId);
        if (currentNote && currentNote.taskIds) parentTaskIDs = [...currentNote.taskIds];
    }

    let originText = "";
    if (currentSelectionSource === 'note') {
        originText = `**From:** [[${document.getElementById('note-title-input').value}]]\n\n`;
    } else if (currentSelectionSource === 'ai') {
        originText = `**From:** AI Chat\n\n`;
    }

    if (currentSelectionSource === 'node' && selectedNodeId) {
        const p = getSelectedNode();
        if (p) {
            originText = `**From Task:** [[${p.title}]]\n\n`;
            if (!parentTaskIDs.includes(selectedNodeId)) parentTaskIDs.push(selectedNodeId);
        }
    }

    const newNote = createNoteObject(title, `${originText}${currentSelectionText}`);
    newNote.taskIds = parentTaskIDs;
    notes.push(newNote);
    persistCreatedNote(newNote).then(() => {
        syncNotesFromRepository({ render: true, preserveSelection: true });
    });
    broadcastNotesChange('create', newNote.id);

    // Only replace text if source is note
    if (currentSelectionSource === 'note' && noteSelectionRange) {
        const textarea = document.getElementById('note-body-input');
        const text = textarea.value;
        const replacement = `[[Note: ${title}]]`;

        const before = text.substring(0, noteSelectionRange.start);
        const after = text.substring(noteSelectionRange.end);
        textarea.value = before + replacement + after;
        saveCurrentNote();
    }

    saveToStorage();
    renderNotesList();

    showNotification("Note Created: " + title);
}

function renderNotesList() {
    try {
        const container = document.getElementById('notes-list-container');
        const searchInput = document.getElementById('note-search-input');
        // Safety check if element exists (in case of partial load)
        if (!searchInput) return;
    
        const searchVal = searchInput.value.toLowerCase();
        container.innerHTML = '';
        ensureSideNotesFilterControls(notes);
    
        const sortedNotes = [...notes].sort((a, b) => {
            if (a.isPinned && !b.isPinned) return -1;
            if (!a.isPinned && b.isPinned) return 1;
            return b.timestamp - a.timestamp;
        });
    
        const normalizedFilterMode = normalizeSideNotesFilterMode(sideNotesFilterMode);
        const normalizedTagFilter = normalizeSideNotesTagFilter(sideNotesTagFilter);
        const normalizedRecentWindow = normalizeSideNotesRecentWindow(sideNotesRecentWindow);

        const filteredNotes = sortedNotes.filter((note) => {
            const title = (note && note.title) ? String(note.title).toLowerCase() : '';
            const bodyText = extractSideNoteBodyText(note);
            const bodyTextLower = bodyText.toLowerCase();
            const searchMatch = title.includes(searchVal) || bodyTextLower.includes(searchVal);
            if (!searchMatch) return false;

            if (normalizedFilterMode === 'has-reminder' && !hasReminderForItem('note', note.id)) return false;
            if (normalizedFilterMode === 'urgent-linked' && !noteHasUrgentLinksForSidePanel(note)) return false;
            if (normalizedFilterMode === 'recently-edited' && !isSideNoteRecentlyEdited(note, normalizedRecentWindow)) return false;

            if (normalizedTagFilter !== 'all') {
                const noteTags = extractSideNoteTags(note);
                if (!noteTags.includes(normalizedTagFilter)) return false;
            }

            return true;
        });
    
        if (filteredNotes.length === 0) {
            container.innerHTML = '<div style="text-align:center; color:#666; padding:20px;">No matching notes found.</div>';
            updateAINoteSelectionSummary();
            return;
        }
    
        filteredNotes.forEach(note => {
            const el = document.createElement('div');
            el.className = `note-card ${note.isPinned ? 'pinned-note' : ''}`;
            if (note.id === currentEditingNoteId) el.classList.add('active');
            const wholeNoteSelected = typeof aiNoteSelection !== 'undefined' && aiNoteSelection.notes.has(note.id);
            if (wholeNoteSelected) el.classList.add('ai-selected-note');

            const linkMetrics = (typeof getNoteLinkMetrics === 'function')
                ? getNoteLinkMetrics(note)
                : {
                    taskCount: Array.isArray(note.taskIds) ? note.taskIds.length : 0,
                    habitCount: 0,
                    goalCount: 0,
                    goalIds: [],
                    urgentTaskCount: 0,
                    hasTaskLinks: Array.isArray(note.taskIds) && note.taskIds.length > 0,
                    hasHabitLinks: false,
                    isMixedLinks: false
                };
            if (linkMetrics.hasTaskLinks) el.classList.add('has-task-links');
            if (linkMetrics.hasHabitLinks) el.classList.add('has-habit-links');
            if (linkMetrics.isMixedLinks) el.classList.add('has-mixed-links');
            if (linkMetrics.urgentTaskCount > 0) el.classList.add('has-urgent-links');
    
            // Extract preview from blocks or legacy string
            const rawPreviewText = extractSideNoteBodyText(note);
            const tagsHtml = extractSideNoteTags(note)
                .map(t => `<span class="note-tag">${escapeHtml(t)}</span>`).join('');
            const previewText = rawPreviewText.replace(/[#*\[\]]/g, '').substring(0, 80).trim();
            const safePreviewText = escapeHtml(previewText || 'No content yet');
    
            const linkChips = [];
            if (linkMetrics.taskCount > 0) {
                linkChips.push(`<span class="note-link-chip task" title="${linkMetrics.taskCount} linked task(s)">T:${linkMetrics.taskCount}</span>`);
            }
            if (linkMetrics.habitCount > 0) {
                linkChips.push(`<span class="note-link-chip habit" title="${linkMetrics.habitCount} linked habit(s)">H:${linkMetrics.habitCount}</span>`);
            }
            if (linkMetrics.urgentTaskCount > 0) {
                linkChips.push(`<span class="note-link-chip urgent" title="${linkMetrics.urgentTaskCount} linked urgent task(s)">⚠ ${linkMetrics.urgentTaskCount}</span>`);
            }

            const goalChips = [];
            const maxGoalChips = 2;
            if (Array.isArray(linkMetrics.goalIds) && linkMetrics.goalIds.length > 0) {
                linkMetrics.goalIds.slice(0, maxGoalChips).forEach(goalId => {
                    const goalName = findGoalName(goalId) || 'Goal';
                    const shortName = goalName.length > 18 ? `${goalName.slice(0, 18)}...` : goalName;
                    const goalStyle = typeof getGoalColorBoxInlineStyle === 'function'
                        ? getGoalColorBoxInlineStyle(goalId)
                        : '';
                    goalChips.push(
                        `<span class="note-link-chip goal" style="${goalStyle}" title="${escapeHtml(goalName)}">🎯 ${escapeHtml(shortName)}</span>`
                    );
                });
                if (linkMetrics.goalCount > maxGoalChips) {
                    goalChips.push(`<span class="note-link-chip goal-more" title="${linkMetrics.goalCount} linked goal(s)">+${linkMetrics.goalCount - maxGoalChips}</span>`);
                }
            }
            const linkBadgesHtml = (linkChips.length > 0 || goalChips.length > 0)
                ? `<div class="note-link-badges">${linkChips.join('')}${goalChips.join('')}</div>`
                : '';
    
            const reminderIcon = hasReminderForItem('note', note.id) ?
                `<button class="btn reminder-note-btn active" style="padding:1px 4px; font-size:9px; margin-left:4px;" onclick="event.stopPropagation(); openRemindersModal('note', '${note.id}');">⏰</button>` :
                `<button class="btn reminder-note-btn" style="padding:1px 4px; font-size:9px; margin-left:4px; opacity:0.5;" onclick="event.stopPropagation(); openRemindersModal('note', '${note.id}');">⏰</button>`;
    
            const pinIcon = isPinned('note', note.id) ?
                `<button class="btn" style="padding:1px 4px; font-size:9px; margin-left:4px; border-color:var(--accent); color:var(--accent);" onclick="event.stopPropagation(); togglePinItem('note', '${note.id}'); renderNotesList();">📌</button>` :
                `<button class="btn" style="padding:1px 4px; font-size:9px; margin-left:4px; opacity:0.3;" onclick="event.stopPropagation(); togglePinItem('note', '${note.id}'); renderNotesList();">📌</button>`;
    
            el.innerHTML = `
                    <div class="note-card-title-row">
                        <label class="ai-note-select" title="Include whole note in AI context">
                            <input type="checkbox" ${wholeNoteSelected ? 'checked' : ''} onchange="event.stopPropagation(); toggleAINoteSelection('${note.id}', this.checked)">
                        </label>
                        <div class="note-card-title">${note.isPinned ? '📌 ' : ''}${escapeHtml(note.title || '(Untitled)')}</div>
                    </div>
                    <div class="note-card-preview">${safePreviewText}${previewText ? '...' : ''}</div>
                    <div style="margin-top:5px;">${tagsHtml}</div>
                    ${linkBadgesHtml}
                    <div class="note-card-meta"><span>${new Date(note.timestamp || Date.now()).toLocaleDateString()}</span><span style="display:flex; align-items:center;">${reminderIcon}${pinIcon}</span></div>
                `;
            el.onclick = () => openNoteEditor(note.id);
            container.appendChild(el);
        });
    
        updateAINoteSelectionSummary();
    } catch (error) {
        console.error("Error in renderNotesList:", error);
        if(typeof showNotification === "function") showNotification("Render Error: Check console", "error");
    }
}

function updateAINoteSelectionSummary() {
    const el = document.getElementById('ai-note-selection-summary');
    if (!el || typeof getAINoteSelectionCounts !== 'function') return;
    const counts = getAINoteSelectionCounts();
    el.textContent = `AI context selection: ${counts.selectedWholeNotes} full note(s), ${counts.selectedBlocks} block(s)`;
}

function toggleCurrentNotePin() {
    if (!currentEditingNoteId) return;
    const note = notes.find(n => n.id === currentEditingNoteId);
    if (note) {
        note.isPinned = !note.isPinned;
        persistUpdatedNote(note.id, { isPinned: note.isPinned });
        broadcastNotesChange('update', note.id);
        saveToStorage();
        renderNotesList();
        showNotification(note.isPinned ? "Note Pinned" : "Note Unpinned");
    }
}

// 1. UPDATED createNewNote
// Prevents duplicates by immediately opening the modal
function createNewNote(taskId = null) {
    // Safe check for task ID
    const safeTaskId = (typeof taskId === 'string') ? taskId : null;
    let noteTitle = "New Note";

    if (safeTaskId) {
        const task = nodes.find(n => n.id === safeTaskId) || archivedNodes.find(n => n.id === safeTaskId);
        if (task && task.title) {
            noteTitle = `Note for ${task.title}`;
        }
    }

    const newNote = createNoteObject(noteTitle, "", safeTaskId);
    notes.push(newNote);
    persistCreatedNote(newNote).then(() => {
        syncNotesFromRepository({ render: true, preserveSelection: true });
    });
    broadcastNotesChange('create', newNote.id);

    // Save immediately
    saveToStorage();

    // Render the list (so it appears in the side panel background)
    const panel = document.getElementById('notes-panel');
    if (panel.classList.contains('hidden')) toggleNotesPanel();
    renderNotesList();

    // IMMEDIATELY open the editor modal
    openNoteEditor(newNote.id);

    // Show confirmation
    showNotification("Note Created");
}

// 2. UPDATED openNoteEditor
// Opens as a modal with block-based editing
function openNoteEditor(noteId) {
    const note = notes.find(n => n.id === noteId);
    if (!note) return;

    currentEditingNoteId = noteId;

    // Populate title
    document.getElementById('note-title-input').value = note.title;

    // Parse blocks with legacy migration
    currentNoteBlocks = parseNoteBody(note);

    // Assign IDs to blocks if missing (legacy blocks)
    currentNoteBlocks.forEach((block, idx) => {
        if (!block.id) block.id = Date.now() + Math.random() + idx;
    });

    // Reset state
    activeBlockId = currentNoteBlocks.length > 0 ? currentNoteBlocks[0].id : null;
    isNoteGlobalViewMode = false;

    // Show the editor
    const editor = document.getElementById('note-editor');
    editor.classList.remove('hidden');

    // Reset maximize state
    editor.classList.remove('maximized');
    noteEditorState = 'normal';
    const maxBtn = document.getElementById('note-maximize-btn');
    if (maxBtn) {
        maxBtn.innerHTML = '⛶';
        maxBtn.title = 'Maximize (Alt+W)';
    }

    // Reset toolbar to Edit mode
    document.getElementById('toggle-edit-btn').classList.add('active-mode');
    document.getElementById('toggle-view-btn').classList.remove('active-mode');
    document.querySelectorAll('.note-edit-only-ui').forEach(el => el.classList.remove('note-view-mode-hide'));

    // Render blocks
    renderNoteBlocks();

    // Render linked items footer
    renderNoteLinkedItemsFooter();

    // Focus the first block for immediate typing
    if (currentNoteBlocks.length > 0 && !isNoteGlobalViewMode) {
        setTimeout(() => {
            const el = document.getElementById(`editor-${currentNoteBlocks[0].id}`);
            if (el) { el.focus(); autoResizeTextarea(el); }
        }, 100);
    }
}

// 3. UPDATED closeNoteEditor
// Simply hides the modal and refreshes the list
function closeNoteEditor() {
    const editor = document.getElementById('note-editor');
    editor.classList.add('hidden');

    // Save before closing
    if (currentEditingNoteId) {
        saveCurrentNote();
    }

    // Reset editor size state
    editor.classList.remove('maximized');
    noteEditorState = 'normal';

    currentEditingNoteId = null;
    currentNoteBlocks = [];
    activeBlockId = null;

    // Re-render list to show any title changes/previews
    renderNotesList();

    // If we were editing a note linked to a specific task, update the inspector too
    if (selectedNodeId) updateInspector();
}

function toggleNoteEditorSize() {
    const editor = document.getElementById('note-editor');
    const btn = document.getElementById('note-maximize-btn');

    if (!editor || !btn) return;

    if (noteEditorState === 'normal') {
        // Switch to maximized
        editor.classList.add('maximized');
        btn.innerHTML = '🗗';
        btn.title = 'Restore Size (Alt+W)';
        noteEditorState = 'maximized';
    } else {
        // Switch to normal
        editor.classList.remove('maximized');
        btn.innerHTML = '⛶';
        btn.title = 'Maximize (Alt+W)';
        noteEditorState = 'normal';
    }
}

function toggleNotePopOut() {
    const editor = document.getElementById('note-editor');
    const btn = document.getElementById('btn-pop-out-note');
    editor.classList.toggle('popped-out');
    if (editor.classList.contains('popped-out')) {
        btn.innerHTML = '🗗';
        btn.title = "Return to side panel";
    } else {
        btn.innerHTML = '↗️';
        btn.title = "Pop out editor";
    }
}

function saveCurrentNote() {
    if (!currentEditingNoteId) return;
    const note = notes.find(n => n.id === currentEditingNoteId);
    if (!note) return;
    const now = Date.now();
    note.title = document.getElementById('note-title-input').value;
    note.body = serializeNoteBlocks();
    note.timestamp = now;
    persistUpdatedNote(note.id, {
        title: note.title,
        body: note.body,
        timestamp: note.timestamp
    });
    broadcastNotesChange('update', note.id);
    saveToStorage();
}

function deleteCurrentNote() {
    if (!currentEditingNoteId) return;

    if (confirm("Delete this note?")) {
        discardReminderByItem('note', currentEditingNoteId);
        // Remove from array
        notes = notes.filter(n => n.id !== currentEditingNoteId);

        // Clear editor ID first to prevent saveCurrentNote from firing on ghost data
        const deletedId = currentEditingNoteId;
        currentEditingNoteId = null;

        if (typeof toggleAINoteSelection === 'function') toggleAINoteSelection(deletedId, false);

        closeNoteEditor();
        persistDeletedNote(deletedId);
        broadcastNotesChange('delete', deletedId);
        saveToStorage();
        renderNotesList();

        // Force update inspector if the deleted note was linked to the active task
        if (selectedNodeId) updateInspector();
    }
}

function renderNoteLinkedTasks() {
    const list = document.getElementById('note-tasks-list');
    if (!list || !currentEditingNoteId) return;
    const note = notes.find(n => n.id === currentEditingNoteId);
    if (!note) return;

    list.innerHTML = '';
    (note.taskIds || []).forEach(tid => {
        const task = nodes.find(n => n.id === tid) || archivedNodes.find(n => n.id === tid);
        if (!task) return;
        const taskBoxStyle = getTaskColorBoxInlineStyle(task);
        const subtleColor = getTaskSubtleTextInlineStyle(task).match(/color:([^;]+);?/)?.[1] || '#94a3b8';

        const tag = document.createElement('div');
        tag.style.cssText = `${taskBoxStyle} border-radius:12px; padding:2px 10px; font-size:10px; display:flex; align-items:center; gap:6px; transition:all 0.2s ease;`;
        tag.onmouseover = () => { tag.style.transform = 'translateY(-1px)'; tag.style.filter = 'brightness(1.06)'; };
        tag.onmouseout = () => { tag.style.transform = 'translateY(0)'; tag.style.filter = 'none'; };

        const title = document.createElement('span');
        title.innerText = task.title;
        title.style.color = 'inherit';
        title.style.cursor = 'pointer';
        title.title = "Jump to Task";
        title.onclick = () => { closeNoteEditor(); jumpToTask(tid); };

        const remove = document.createElement('span');
        remove.innerText = '✕';
        remove.style.cursor = 'pointer';
        remove.style.color = subtleColor;
        remove.style.fontSize = '12px';
        remove.title = "Unlink Task";
        remove.onmouseover = () => remove.style.color = '#ef4444';
        remove.onmouseout = () => remove.style.color = subtleColor;
        remove.onclick = (e) => { e.stopPropagation(); unlinkTaskFromNote(tid); };

        tag.appendChild(title);
        tag.appendChild(remove);
        list.appendChild(tag);
    });
}

function showNoteTaskPicker() {
    const picker = document.getElementById('note-task-picker');
    const searchInput = document.getElementById('note-task-search');
    if (!picker || !currentEditingNoteId) return;

    picker.classList.remove('hidden');
    if (searchInput) {
        searchInput.value = '';
        searchInput.focus();
    }
    filterNoteTaskPicker('');
}

function filterNoteTaskPicker(query) {
    const list = document.getElementById('note-task-picker-list');
    if (!list || !currentEditingNoteId) return;

    const note = notes.find(n => n.id === currentEditingNoteId);
    if (!note) return;

    list.innerHTML = '';
    const allTasks = [...(nodes || []), ...(archivedNodes || [])];
    const q = query.toLowerCase();

    const filtered = allTasks.filter(t =>
        (t.title || "").toLowerCase().includes(q) &&
        !(note.taskIds && note.taskIds.includes(t.id))
    ).sort((a, b) => (a.title || "").localeCompare(b.title || ""));

    if (filtered.length === 0) {
        list.innerHTML = '<div style="color:#666; font-size:11px; padding:10px; text-align:center;">No tasks found</div>';
        return;
    }

    filtered.forEach(t => {
        const item = document.createElement('div');
        item.style.padding = '8px';
        item.style.cursor = 'pointer';
        item.style.fontSize = '12px';
        item.style.color = '#ccc';
        item.style.borderRadius = '4px';
        item.style.transition = 'background 0.2s';
        item.innerText = t.title || "Untitled Task";
        item.onmouseover = () => item.style.background = 'rgba(255,255,255,0.1)';
        item.onmouseout = () => item.style.background = 'transparent';
        item.onclick = () => {
            linkTaskToNote(t.id);
            document.getElementById('note-task-picker').classList.add('hidden');
        };
        list.appendChild(item);
    });
}

function linkTaskToNote(taskId) {
    if (!taskId || !currentEditingNoteId) return;
    const note = notes.find(n => n.id === currentEditingNoteId);
    if (!note) return;
    if (!note.taskIds) note.taskIds = [];
    if (!note.taskIds.includes(taskId)) {
        note.taskIds.push(taskId);
        persistUpdatedNote(note.id, { taskIds: [...note.taskIds] });
        broadcastNotesChange('update', note.id);
        saveToStorage();
        renderNoteLinkedTasks();
        if (selectedNodeId === taskId) updateInspector();
    }
}

function unlinkTaskFromNote(taskId) {
    if (!currentEditingNoteId) return;
    const note = notes.find(n => n.id === currentEditingNoteId);
    if (!note) return;
    note.taskIds = (note.taskIds || []).filter(id => id !== taskId);
    persistUpdatedNote(note.id, { taskIds: [...note.taskIds] });
    broadcastNotesChange('update', note.id);
    saveToStorage();
    renderNoteLinkedTasks();
    if (selectedNodeId === taskId) updateInspector();
}

function linkNoteToTask(noteId, taskId) {
    if (!noteId || !taskId) return;
    const note = notes.find(n => n.id === noteId);
    if (!note) return;

    if (!note.taskIds) note.taskIds = [];
    if (!note.taskIds.includes(taskId)) {
        note.taskIds.push(taskId);
        persistUpdatedNote(note.id, { taskIds: [...note.taskIds] });
        broadcastNotesChange('update', note.id);
        saveToStorage();
        updateInspector();
        showNotification("Note Linked to Task");
    }
}

function linkNoteToHabit(noteId, habitId) {
    if (!noteId || !habitId) return;
    const habit = habits.find(h => h.id === habitId);
    if (!habit) return;
    if (!habit.noteIds) habit.noteIds = [];
    if (!habit.noteIds.includes(noteId)) {
        habit.noteIds.push(noteId);
        saveToStorage();
        if (currentEditingNoteId === noteId) {
            renderNoteLinkedItemsFooter();
        }
        if (!document.getElementById('habits-panel').classList.contains('hidden')) {
            renderHabits();
        }
        showNotification("Note Linked to Habit");
    }
}

function unlinkNoteFromHabit(noteId, habitId) {
    if (!noteId || !habitId) return;
    const habit = habits.find(h => h.id === habitId);
    if (!habit) return;
    if (!habit.noteIds) habit.noteIds = [];
    habit.noteIds = habit.noteIds.filter(id => id !== noteId);
    saveToStorage();
    if (currentEditingNoteId === noteId) {
        renderNoteLinkedItemsFooter();
    }
    if (!document.getElementById('habits-panel').classList.contains('hidden')) {
        renderHabits();
    }
    showNotification("Note Unlinked from Habit");
}

function linkTaskToGoal(taskId, goalId, applyToDownstream = null) {
    if (!taskId || !goalId) return;
    const normalizedGoalId = String(goalId || '').trim();
    if (!normalizedGoalId) return;

    const node = (typeof getTaskById === 'function')
        ? getTaskById(taskId)
        : (nodes.find(n => n.id === taskId) || archivedNodes.find(n => n.id === taskId));
    if (!node) return;
    const normalizedProjectId = String(node.projectId || '').trim();

    if (normalizedProjectId && typeof applyProjectGoalMutation === 'function') {
        const mutation = applyProjectGoalMutation(normalizedProjectId, normalizedGoalId, { remove: false });
        if (!mutation.ok) return;
        if (!mutation.changed) {
            showNotification("Goal already linked to this project");
            return;
        }

        if (typeof syncProjectGoalMutationUI === 'function') syncProjectGoalMutationUI(normalizedProjectId);
        else {
            saveToStorage();
            updateInspector();
            render();
            if (typeof renderProjectsList === 'function') renderProjectsList();
            if (typeof isProjectDetailsModalOpen === 'function' && isProjectDetailsModalOpen() && typeof renderProjectDetailsModal === 'function') {
                renderProjectDetailsModal();
            }
        }
        showNotification(`Goal linked across ${mutation.taskCount} task(s) in "${mutation.project && mutation.project.name ? mutation.project.name : 'Project'}"`);
        return;
    }

    // Find all downstream tasks (tasks that depend on this one)
    const downstreamTasks = nodes.filter(n =>
        n.dependencies.some(d => d.id === taskId && d.type === 'hard')
    );

    // If applyToDownstream is null and there are downstream tasks, ask user
    if (applyToDownstream === null && downstreamTasks.length > 0) {
        const choice = confirm(
            `Apply this goal to ${downstreamTasks.length} subsequent task(s)?\n\n` +
            "• OK = Link goal to this task AND all tasks that come after it\n" +
            "• Cancel = Link goal only to this task"
        );
        applyToDownstream = choice;
    } else if (downstreamTasks.length === 0) {
        applyToDownstream = false;
    }

    // Link to current task
    if (!node.goalIds) node.goalIds = [];
    if (!node.goalIds.includes(normalizedGoalId)) {
        node.goalIds.push(normalizedGoalId);
        showNotification("Goal Linked to Task");
    }

    // Apply to downstream tasks if requested (recursive)
    if (applyToDownstream && downstreamTasks.length > 0) {
        const linkDownstream = (currentTaskId) => {
            const downstream = nodes.filter(n =>
                n.dependencies.some(d => d.id === currentTaskId && d.type === 'hard')
            );

            downstream.forEach(downNode => {
                if (!downNode.goalIds) downNode.goalIds = [];
                if (!downNode.goalIds.includes(normalizedGoalId)) {
                    downNode.goalIds.push(normalizedGoalId);
                }
                // Recursively apply to their downstream tasks too
                linkDownstream(downNode.id);
            });
        };

        linkDownstream(taskId);
        showNotification(`Goal linked to task + ${countAllDownstream(taskId)} subsequent task(s)`);
    }

    saveToStorage();
    updateInspector();
    render();
}

// Helper function to count all downstream tasks recursively
function countAllDownstream(taskId) {
    let count = 0;
    const visited = new Set();

    const countRecursive = (currentId) => {
        const downstream = nodes.filter(n =>
            n.dependencies.some(d => d.id === currentId && d.type === 'hard')
        );

        downstream.forEach(n => {
            if (!visited.has(n.id)) {
                visited.add(n.id);
                count++;
                countRecursive(n.id);
            }
        });
    };

    countRecursive(taskId);
    return count;
}

function unlinkTaskFromGoal(taskId, goalId) {
    if (!taskId || !goalId) return;
    const normalizedGoalId = String(goalId || '').trim();
    if (!normalizedGoalId) return;

    const node = (typeof getTaskById === 'function')
        ? getTaskById(taskId)
        : (nodes.find(n => n.id === taskId) || archivedNodes.find(n => n.id === taskId));
    if (!node) return;
    const normalizedProjectId = String(node.projectId || '').trim();

    if (normalizedProjectId && typeof applyProjectGoalMutation === 'function') {
        const mutation = applyProjectGoalMutation(normalizedProjectId, normalizedGoalId, { remove: true });
        if (!mutation.ok) return;
        if (!mutation.changed) return;

        if (typeof syncProjectGoalMutationUI === 'function') syncProjectGoalMutationUI(normalizedProjectId);
        else {
            saveToStorage();
            updateInspector();
            render();
            if (typeof renderProjectsList === 'function') renderProjectsList();
            if (typeof isProjectDetailsModalOpen === 'function' && isProjectDetailsModalOpen() && typeof renderProjectDetailsModal === 'function') {
                renderProjectDetailsModal();
            }
        }
        showNotification(`Goal unlinked across ${mutation.taskCount} task(s) in "${mutation.project && mutation.project.name ? mutation.project.name : 'Project'}"`);
        return;
    }

    if (!node.goalIds) node.goalIds = [];
    node.goalIds = node.goalIds.filter(id => id !== normalizedGoalId);
    saveToStorage();
    updateInspector();
    showNotification("Task Unlinked from Goal");
}
