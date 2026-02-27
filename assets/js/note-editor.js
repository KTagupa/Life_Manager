// --- BLOCK-BASED NOTE SYSTEM FUNCTIONS ---

// Parse note body with legacy migration
function parseNoteBody(note) {
    if (!note || !note.body) return [];
    try {
        const parsed = JSON.parse(note.body);
        if (Array.isArray(parsed)) {
            // Initialize bookmarkName if missing
            parsed.forEach((b, index) => {
                if (typeof b.id === 'undefined') b.id = Date.now() + Math.random() + index;
                if (typeof b.bookmarkName === 'undefined') b.bookmarkName = "";
            });
            return parsed;
        }
    } catch (e) { /* not JSON */ }

    // Convert legacy string to single block
    return [{ id: Date.now() + Math.random(), text: note.body || "", colorIndex: 0, isEditing: true, bookmarkName: "" }];
}

// Serialize blocks to JSON for storage
function serializeNoteBlocks() {
    return JSON.stringify(currentNoteBlocks.map(b => ({
        id: b.id,
        text: b.text,
        colorIndex: b.colorIndex,
        isEditing: b.isEditing,
        bookmarkName: b.bookmarkName || ""
    })));
}

// Get combined text from all blocks (for backlinks search)
function getCombinedBlockText() {
    return currentNoteBlocks.map(b => b.text).join('\n\n');
}

// Global View/Edit Mode Toggle
function setGlobalViewMode(isView) {
    isNoteGlobalViewMode = isView;
    document.getElementById('toggle-edit-btn').classList.toggle('active-mode', !isView);
    document.getElementById('toggle-view-btn').classList.toggle('active-mode', isView);
    document.querySelectorAll('.note-edit-only-ui').forEach(el => el.classList.toggle('note-view-mode-hide', isView));
    renderNoteBlocks();
}

// Render all blocks
function renderNoteBlocks() {
    try {
        const list = document.getElementById('blocks-list');
        if (!list) return;
        list.innerHTML = '';
        const noteId = currentEditingNoteId;
    
        currentNoteBlocks.forEach((block, idx) => {
            const blockDiv = document.createElement('div');
            const isCurrentBlockEditing = !isNoteGlobalViewMode && block.isEditing;
            const wholeNoteSelected = typeof aiNoteSelection !== 'undefined' && aiNoteSelection.notes.has(noteId);
            const blockSelected = wholeNoteSelected || (typeof aiNoteSelection !== 'undefined' && aiNoteSelection.blocks.has(makeBlockSelectionKey(noteId, block.id)));
    
            blockDiv.className = `note-block ${activeBlockId === block.id && !isNoteGlobalViewMode ? 'active-block' : ''}`;
            if (blockSelected) blockDiv.classList.add('ai-selected-block');
            blockDiv.id = `block-${block.id}`;
            blockDiv.style.backgroundColor = noteCategoryColors[block.colorIndex] || noteCategoryColors[0];
            blockDiv.onclick = () => { if (!isNoteGlobalViewMode) setActiveBlock(block.id); };
    
            // Build category picker items
            let catListHtml = '';
            noteSettings.categoryNames.forEach((name, cIdx) => {
                catListHtml += `
                            <div class="category-item" onclick="event.stopPropagation(); setBlockColor(${block.id}, ${cIdx})">
                                <div class="cat-info">
                                    <div class="cat-dot" style="background:${noteCategoryColors[cIdx]}"></div>
                                    <span>${name}</span>
                                </div>
                                <button class="rename-cat-btn" onclick="event.stopPropagation(); openRenameCatModal(${cIdx})">✏️</button>
                            </div>
                        `;
            });
    
            blockDiv.innerHTML = `
                        <div class="add-above-btn note-edit-only-ui ${isNoteGlobalViewMode ? 'note-view-mode-hide' : ''}" 
                             onclick="event.stopPropagation(); addNoteBlock('', 0, ${idx})">
                            +
                        </div>
    
                        ${block.bookmarkName ? `<div class="bookmark-badge"><i class="fas fa-bookmark"></i> ${block.bookmarkName}</div>` : ''}
    
                        <div class="block-toolbar ${isNoteGlobalViewMode ? 'note-view-mode-hide' : ''}">
                            <div class="category-trigger" onclick="event.stopPropagation(); toggleBlockCategoryPicker(${block.id})">
                                🏷️ ${noteSettings.categoryNames[block.colorIndex] || 'Category'}
                            </div>
                            <div class="category-picker" id="picker-${block.id}">
                                ${catListHtml}
                            </div>
                            <div class="block-controls">
                                <label class="ai-block-select" title="Include this block in AI context">
                                    <input type="checkbox" ${blockSelected ? 'checked' : ''} onchange="event.stopPropagation(); toggleAIBlockSelection('${noteId}', ${block.id}, this.checked)" ${wholeNoteSelected ? 'disabled' : ''}>
                                    AI
                                </label>
                                <button class="note-toolbar-btn" onclick="event.stopPropagation(); maximizeBlock(${block.id})" title="Maximize Block">
                                    <i class="fas fa-expand"></i>
                                </button>
    
                                <button class="note-toolbar-btn" onclick="event.stopPropagation(); copyBlockContent(${block.id})" title="Copy Block Content">
                                    <i class="fas fa-copy"></i>
                                </button>
    
                                <button class="note-toolbar-btn" onclick="event.stopPropagation(); openBookmarkModal(${block.id})" title="Set Bookmark">
                                    <i class="fas fa-bookmark" style="${block.bookmarkName ? 'color:var(--accent)' : ''}"></i>
                                </button>
                                <button class="note-toolbar-btn" onclick="event.stopPropagation(); toggleBlockMode(${block.id})" title="${block.isEditing ? 'View' : 'Edit'}">
                                    ${block.isEditing ? '👁️' : '✏️'}
                                </button>
                                <button class="note-toolbar-btn" onclick="event.stopPropagation(); moveNoteBlock(${idx}, -1)" title="Move Up">⬆</button>
                                <button class="note-toolbar-btn" onclick="event.stopPropagation(); moveNoteBlock(${idx}, 1)" title="Move Down">⬇</button>
                                <button class="note-toolbar-btn" style="color:var(--blocked-color)" onclick="event.stopPropagation(); deleteNoteBlock(${block.id})" title="Delete Block">🗑️</button>
                            </div>
                        </div>
                        <textarea id="editor-${block.id}" class="block-editor-area" style="display:${isCurrentBlockEditing ? 'block' : 'none'}" 
                            oninput="updateBlockText(${block.id}, this.value); autoResizeTextarea(this)" 
                            onfocus="setActiveBlock(${block.id}); const el = document.getElementById('block-${block.id}'); if (el) el.style.backgroundColor = noteCategoryColors[${block.colorIndex}] || noteCategoryColors[0];" 
                            placeholder="Type something here...">${block.text}</textarea>
                        <div id="preview-${block.id}" class="block-preview-area" style="display:${isCurrentBlockEditing ? 'none' : 'block'}">${renderMarkdown(block.text || '_Empty_')}</div>
                    `;
            list.appendChild(blockDiv);
    
            // Auto-resize if in editing mode
            if (isCurrentBlockEditing) {
                setTimeout(() => {
                    const textarea = document.getElementById(`editor-${block.id}`);
                    if (textarea) autoResizeTextarea(textarea);
                }, 10);
            }
        });
    
        updateBookmarkDropdown();
        renderNoteLinkedTasksFooter();
    } catch (error) {
        console.error("Error in renderNoteBlocks:", error);
        if(typeof showNotification === "function") showNotification("Render Error: Check console", "error");
    }
}

// Add new block
function addNoteBlock(text = "", colorIndex = 0, index = null) {
    const blockId = Date.now() + Math.random();
    const newBlock = { id: blockId, text: text, colorIndex: colorIndex, isEditing: true, bookmarkName: "" };

    if (index !== null && index >= 0) {
        currentNoteBlocks.splice(index, 0, newBlock);
    } else {
        currentNoteBlocks.push(newBlock);
    }

    activeBlockId = blockId;
    renderNoteBlocks();
    triggerNoteSave();

    // Focus the new block
    if (!isNoteGlobalViewMode) {
        setTimeout(() => {
            const el = document.getElementById(`editor-${blockId}`);
            if (el) { el.focus(); autoResizeTextarea(el); }
        }, 50);
    }
}

// Delete block
function deleteNoteBlock(id) {
    if (typeof toggleAIBlockSelection === 'function' && currentEditingNoteId) {
        toggleAIBlockSelection(currentEditingNoteId, id, false);
    }
    currentNoteBlocks = currentNoteBlocks.filter(b => b.id !== id);
    if (activeBlockId === id) activeBlockId = null;
    renderNoteBlocks();
    triggerNoteSave();
}

// Move block up/down
function moveNoteBlock(index, direction) {
    const newIndex = index + direction;
    if (newIndex >= 0 && newIndex < currentNoteBlocks.length) {
        [currentNoteBlocks[index], currentNoteBlocks[newIndex]] = [currentNoteBlocks[newIndex], currentNoteBlocks[index]];
        renderNoteBlocks();
        triggerNoteSave();
    }
}

// Set active block
function setActiveBlock(id) {
    if (isNoteGlobalViewMode) return;
    activeBlockId = id;
    document.querySelectorAll('.note-block').forEach(el => el.classList.remove('active-block'));
    const activeEl = document.querySelector(`.note-block[onclick*="setActiveBlock(${id})"]`);
    if (activeEl) activeEl.classList.add('active-block');
}

// Update block text
function updateBlockText(id, text) {
    const block = currentNoteBlocks.find(b => b.id === id);
    if (block) block.text = text;
    triggerNoteSave();
}

// Toggle individual block mode
function toggleBlockMode(id) {
    const block = currentNoteBlocks.find(b => b.id === id);
    if (block) block.isEditing = !block.isEditing;
    renderNoteBlocks();

    // Ensure background color is preserved when editing
    setTimeout(() => {
        const el = document.getElementById(`block-${id}`);
        if (el && block) {
            el.style.backgroundColor = noteCategoryColors[block.colorIndex] || noteCategoryColors[0];
            el.scrollIntoView({ behavior: 'instant', block: 'nearest' });
        }
    }, 0);
}

// Set block color
function setBlockColor(id, colorIndex) {
    const block = currentNoteBlocks.find(b => b.id === id);
    if (block) block.colorIndex = colorIndex;
    // Close all pickers
    document.querySelectorAll('.category-picker').forEach(p => p.style.display = 'none');
    renderNoteBlocks();
    triggerNoteSave();
}

// Toggle category picker visibility
function toggleBlockCategoryPicker(id) {
    const picker = document.getElementById(`picker-${id}`);
    const isOpen = picker && picker.style.display === 'block';
    document.querySelectorAll('.category-picker').forEach(p => p.style.display = 'none');
    if (picker) picker.style.display = isOpen ? 'none' : 'block';
}

// autoResizeTextarea() is now in utils.js

// Category rename modal functions
function openRenameCatModal(index) {
    renamingCategoryIndex = index;
    document.getElementById('rename-cat-modal').style.display = 'flex';
    const input = document.getElementById('rename-cat-input');
    input.value = noteSettings.categoryNames[index];
    input.focus();
}

function closeRenameCatModal() {
    document.getElementById('rename-cat-modal').style.display = 'none';
    renamingCategoryIndex = -1;
}

function saveBlockCategoryRename() {
    const newName = document.getElementById('rename-cat-input').value.trim();
    if (newName && renamingCategoryIndex !== -1) {
        noteSettings.categoryNames[renamingCategoryIndex] = newName;
        closeRenameCatModal();
        renderNoteBlocks();
        triggerNoteSave();
    }
}

// --- BOOKMARK SYSTEM FUNCTIONS ---
let currentBookmarkBlockId = null;

function toggleBookmarkDropdown() {
    const dropdown = document.getElementById('bookmark-dropdown');
    if (dropdown) dropdown.classList.toggle('show');
}

function updateBookmarkDropdown() {
    const dropdown = document.getElementById('bookmark-dropdown');
    const badge = document.getElementById('bookmark-count-badge');
    if (!dropdown) return;

    const bookmarkedBlocks = currentNoteBlocks.filter(b => b.bookmarkName && b.bookmarkName.trim() !== "");

    if (badge) badge.innerText = bookmarkedBlocks.length;

    dropdown.innerHTML = '';
    if (bookmarkedBlocks.length === 0) {
        dropdown.innerHTML = '<div class="bookmark-item" style="color: #666; font-style: italic; justify-content: center;">No bookmarks set</div>';
    } else {
        bookmarkedBlocks.forEach(block => {
            const item = document.createElement('div');
            item.className = 'bookmark-item';
            item.innerHTML = `
                        <span>${block.bookmarkName}</span>
                        <i class="fas fa-chevron-right"></i>
                    `;
            item.onclick = (e) => {
                e.stopPropagation();
                jumpToBookmark(block.id);
                dropdown.classList.remove('show');
            };
            dropdown.appendChild(item);
        });
    }
}

function openBookmarkModal(blockId) {
    currentBookmarkBlockId = blockId;
    const block = currentNoteBlocks.find(b => b.id === blockId);
    const modal = document.getElementById('bookmark-modal');
    const input = document.getElementById('bookmark-input');

    if (block && modal && input) {
        input.value = block.bookmarkName || "";
        modal.style.display = 'flex';
        input.focus();
        input.select();

        // Add Enter key listener for saving
        const handleEnter = (e) => {
            if (e.key === 'Enter') {
                saveBookmark();
                input.removeEventListener('keydown', handleEnter);
            } else if (e.key === 'Escape') {
                closeBookmarkModal();
                input.removeEventListener('keydown', handleEnter);
            }
        };
        input.addEventListener('keydown', handleEnter);
    }
}

function closeBookmarkModal() {
    const modal = document.getElementById('bookmark-modal');
    if (modal) modal.style.display = 'none';
    currentBookmarkBlockId = null;
}


function saveBookmark() {
    const input = document.getElementById('bookmark-input');
    const name = input ? input.value.trim() : "";

    if (currentBookmarkBlockId) {
        const block = currentNoteBlocks.find(b => b.id === currentBookmarkBlockId);
        if (block) {
            block.bookmarkName = name;
            renderNoteBlocks();
            triggerNoteSave();
        }
    }
    // Update maximized window if open
    if (maximizedBlockId === currentBookmarkBlockId) {
        const bookmarkName = document.getElementById('max-bookmark-name');
        if (bookmarkName) {
            bookmarkName.innerText = name;
            bookmarkName.style.color = name ? 'var(--accent)' : '';
        }
    }

    closeBookmarkModal();

}

function jumpToBookmark(blockId) {
    const element = document.getElementById(`block-${blockId}`);
    const container = document.getElementById('blocks-container');

    if (element && container) {
        element.scrollIntoView({ behavior: 'smooth', block: 'start' });

        // Flash animation
        element.classList.remove('flash-highlight');
        void element.offsetWidth; // trigger reflow
        element.classList.add('flash-highlight');

        // Remove class after animation
        setTimeout(() => {
            element.classList.remove('flash-highlight');
        }, 1500);
    }
}

function jumpToBookmarkByName(name) {
    const block = currentNoteBlocks.find(b => b.bookmarkName && b.bookmarkName.toLowerCase() === name.toLowerCase());
    if (block) {
        jumpToBookmark(block.id);
    } else {
        showNotification("Bookmark not found: " + name);
    }
}
// --- END BOOKMARK SYSTEM FUNCTIONS ---


// Apply formatting to active block
function applyBlockFormat(type) {
    if (!activeBlockId || isNoteGlobalViewMode) return;
    const textarea = document.getElementById(`editor-${activeBlockId}`);
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;
    const selected = text.substring(start, end);

    let replacement = "";
    switch (type) {
        case 'bold': replacement = `**${selected}**`; break;
        case 'italic': replacement = `*${selected}*`; break;
        case 'checkbox': replacement = `\n- [ ] ${selected}`; break;
    }

    textarea.value = text.substring(0, start) + replacement + text.substring(end);
    updateBlockText(activeBlockId, textarea.value);
    textarea.focus();

    // Set cursor position
    const newPos = start + replacement.length;
    textarea.setSelectionRange(newPos, newPos);
}

// Task Search Overlay
function toggleNoteTaskSearch() {
    const overlay = document.getElementById('note-task-search-overlay');
    const isVisible = overlay.style.display === 'flex';
    overlay.style.display = isVisible ? 'none' : 'flex';
    if (!isVisible) {
        document.getElementById('note-task-search-input').value = '';
        filterNoteTaskSearch('');
        document.getElementById('note-task-search-input').focus();
    }
}

function toggleNoteHabitSearch() {
    const overlay = document.getElementById('note-habit-search-overlay');
    const isVisible = overlay.style.display === 'flex';
    overlay.style.display = isVisible ? 'none' : 'flex';
    if (!isVisible) {
        document.getElementById('note-habit-search-input').value = '';
        filterNoteHabitSearch('');
        document.getElementById('note-habit-search-input').focus();
    }
}

function filterNoteHabitSearch(query) {
    const list = document.getElementById('note-habit-search-results-list');
    if (!list || !currentEditingNoteId) return;

    list.innerHTML = '';
    const q = query.toLowerCase();

    const filtered = habits.filter(h =>
        (h.title || "").toLowerCase().includes(q) &&
        !(h.noteIds && h.noteIds.includes(currentEditingNoteId))
    ).sort((a, b) => (a.title || "").localeCompare(b.title || "")).slice(0, 20);

    if (filtered.length === 0) {
        list.innerHTML = '<div style="color:#666; font-size:12px; padding:20px; text-align:center;">No matching habits found</div>';
        return;
    }

    filtered.forEach(h => {
        const item = document.createElement('div');
        item.className = 'note-search-result-item';
        const freq = h.frequency || 'daily';
        const type = h.type || 'checkbox';
        const typeLabel = type === 'timer' ? 'minutes' : (type === 'counter' ? 'count' : 'checkbox');
        item.innerHTML = `<strong>✅ ${h.title || "Untitled Habit"}</strong><small>${freq} • ${typeLabel}</small>`;
        item.onclick = () => {
            linkNoteToHabit(currentEditingNoteId, h.id);
            toggleNoteHabitSearch();
        };
        list.appendChild(item);
    });
}

function showHabitNotes(habitId) {
    const habit = habits.find(h => h.id === habitId);
    if (!habit || !habit.noteIds || habit.noteIds.length === 0) return;

    // If only one note, open it directly
    if (habit.noteIds.length === 1) {
        const noteId = habit.noteIds[0];
        const note = notes.find(n => n.id === noteId);
        if (note) {
            openNoteEditor(noteId);
        }
        return;
    }

    // Multiple notes: show selection dialog
    const notesList = habit.noteIds
        .map((nid, index) => {
            const n = notes.find(note => note.id === nid);
            return n ? `${index + 1}. ${n.title || 'Untitled Note'}` : null;
        })
        .filter(n => n)
        .join('\n');

    const selection = prompt(`This habit is linked to ${habit.noteIds.length} notes:\n\n${notesList}\n\nEnter the number of the note to open (1-${habit.noteIds.length}):`);

    if (selection) {
        const index = parseInt(selection) - 1;
        if (index >= 0 && index < habit.noteIds.length) {
            const noteId = habit.noteIds[index];
            openNoteEditor(noteId);
        }
    }
}

function filterNoteTaskSearch(query) {
    const list = document.getElementById('note-search-results-list');
    if (!list || !currentEditingNoteId) return;

    const note = notes.find(n => n.id === currentEditingNoteId);
    if (!note) return;

    list.innerHTML = '';
    const allTasks = [...(nodes || []), ...(archivedNodes || [])];
    const q = query.toLowerCase();

    const filtered = allTasks.filter(t =>
        (t.title || "").toLowerCase().includes(q) &&
        !(note.taskIds && note.taskIds.includes(t.id))
    ).sort((a, b) => (a.title || "").localeCompare(b.title || "")).slice(0, 20);

    if (filtered.length === 0) {
        list.innerHTML = '<div style="color:#666; font-size:12px; padding:20px; text-align:center;">No matching tasks found</div>';
        return;
    }

    filtered.forEach(t => {
        const item = document.createElement('div');
        item.className = 'note-search-result-item';
        item.innerHTML = `<strong>${t.title || "Untitled Task"}</strong><small>${t.completed ? 'Completed' : (t._isUrgent ? 'Urgent' : 'Active')}</small>`;
        item.onclick = () => {
            linkTaskToNoteFromSearch(t.id);
            toggleNoteTaskSearch();
        };
        list.appendChild(item);
    });
}

function linkTaskToNoteFromSearch(taskId) {
    if (!taskId || !currentEditingNoteId) return;
    const note = notes.find(n => n.id === currentEditingNoteId);
    if (!note) return;
    if (!note.taskIds) note.taskIds = [];
    if (!note.taskIds.includes(taskId)) {
        note.taskIds.push(taskId);
        triggerNoteSave();
        renderNoteLinkedTasksFooter();
    }
}

function unlinkTaskFromNoteFooter(taskId) {
    if (!currentEditingNoteId) return;
    const note = notes.find(n => n.id === currentEditingNoteId);
    if (!note) return;
    note.taskIds = (note.taskIds || []).filter(id => id !== taskId);
    triggerNoteSave();
    renderNoteLinkedTasksFooter();
    if (selectedNodeId === taskId) updateInspector();
}

// Render linked tasks in footer
function renderNoteLinkedItemsFooter() {
    // Render Linked Tasks
    const tasksContainer = document.getElementById('note-linked-tasks-list');
    if (tasksContainer && currentEditingNoteId) {
        const note = notes.find(n => n.id === currentEditingNoteId);
        if (note) {
            tasksContainer.innerHTML = '<span class="note-linked-label">Linked Tasks:</span>';

            if (!note.taskIds || note.taskIds.length === 0) {
                tasksContainer.innerHTML += '<span style="font-size: 0.75rem; color: var(--text-muted); font-style: italic;">None</span>';
            } else {
                note.taskIds.forEach(tid => {
                    const task = nodes.find(n => n.id === tid) || archivedNodes.find(n => n.id === tid);
                    if (!task) return;
                    const taskBoxStyle = getTaskColorBoxInlineStyle(task);
                    const subtleColor = getTaskSubtleTextInlineStyle(task).match(/color:([^;]+);?/)?.[1] || '#94a3b8';

                    const tag = document.createElement('div');
                    tag.className = 'note-task-tag';
                    tag.innerHTML = `
                                <span onclick="closeNoteEditor(); jumpToTask('${tid}')">${task.title}</span>
                                <span class="unlink-btn" onclick="event.stopPropagation(); unlinkTaskFromNoteFooter('${tid}')">✕</span>
                            `;
                    tag.style.cssText = `${taskBoxStyle} border-radius:100px;`;
                    const unlink = tag.querySelector('.unlink-btn');
                    if (unlink) unlink.style.color = subtleColor;
                    tasksContainer.appendChild(tag);
                });
            }
        }
    }

    // Render Linked Habits
    const habitsContainer = document.getElementById('note-linked-habits-list');
    if (habitsContainer && currentEditingNoteId) {
        habitsContainer.innerHTML = '<span class="note-linked-label">Linked Habits:</span>';

        const linkedHabits = habits.filter(h => h.noteIds && h.noteIds.includes(currentEditingNoteId));

        if (linkedHabits.length === 0) {
            habitsContainer.innerHTML += '<span style="font-size: 0.75rem; color: var(--text-muted); font-style: italic;">None</span>';
        } else {
            linkedHabits.forEach(habit => {
                const tag = document.createElement('div');
                tag.className = 'note-task-tag';
                tag.style.backgroundColor = 'rgba(16, 185, 129, 0.1)';
                tag.style.borderColor = 'rgba(16, 185, 129, 0.2)';
                tag.style.color = '#10b981';
                tag.innerHTML = `
                            <span onclick="closeNoteEditor(); toggleHabits();">✅ ${habit.title}</span>
                            <span class="unlink-btn" onclick="event.stopPropagation(); unlinkNoteFromHabit('${currentEditingNoteId}', '${habit.id}')">✕</span>
                        `;
                habitsContainer.appendChild(tag);
            });
        }
    }
}

// Keep old function name as alias for backward compatibility
function renderNoteLinkedTasksFooter() {
    renderNoteLinkedItemsFooter();
}

// Trigger save with debounce and status update
let noteSaveTimeout;
function triggerNoteSave() {
    const status = document.getElementById('note-save-status');
    const syncTime = document.getElementById('note-sync-time');
    if (status) status.innerHTML = '⏳ Saving...';

    clearTimeout(noteSaveTimeout);
    noteSaveTimeout = setTimeout(() => {
        saveCurrentNote();
        if (status) status.innerHTML = 'All changes synced';
        if (syncTime) syncTime.innerText = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }, 500);
}

// Close pickers and dropdowns when clicking outside
document.addEventListener('click', (e) => {
    // Category pickers
    if (!e.target.closest('.category-trigger') && !e.target.closest('.category-picker')) {
        document.querySelectorAll('.category-picker').forEach(p => p.style.display = 'none');
    }
    // Bookmark dropdown
    const dropdown = document.getElementById('bookmark-dropdown');
    const btn = document.getElementById('bookmark-dropdown-btn');
    if (dropdown && dropdown.classList.contains('show') && !dropdown.contains(e.target) && !btn.contains(e.target)) {
        dropdown.classList.remove('show');
    }
});

// Create task from selected text in active block
function createTaskFromBlockSelection() {
    if (!activeBlockId || isNoteGlobalViewMode) {
        showNotification("No active block");
        return;
    }

    const textarea = document.getElementById(`editor-${activeBlockId}`);
    if (!textarea) {
        showNotification("No text selected");
        return;
    }

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = textarea.value.substring(start, end).trim();

    if (!selectedText) {
        showNotification("No text selected");
        return;
    }

    // Create the task
    const worldX = (window.innerWidth / 2 - panX) / scale - 90 + (Math.random() * 40 - 20);
    const worldY = (window.innerHeight / 2 - panY) / scale - 50 + (Math.random() * 40 - 20);
    const newNode = createNode(worldX, worldY, selectedText);
    nodes.push(newNode);

    // Replace selected text with wiki-link
    const text = textarea.value;
    const replacement = `[[${selectedText}]]`;
    textarea.value = text.substring(0, start) + replacement + text.substring(end);
    updateBlockText(activeBlockId, textarea.value);

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
    updateCalculations();
    render();
    saveToStorage();

    showNotification("Task Created: " + selectedText.substring(0, 20) + (selectedText.length > 20 ? "..." : ""));
}

// --- END BLOCK-BASED NOTE SYSTEM FUNCTIONS ---
