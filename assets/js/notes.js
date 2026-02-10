        // --- NOTES LOGIC ---

        function toggleNotesPanel() {
            const notesPanel = document.getElementById('notes-panel');
            const archivePanel = document.getElementById('archive-panel');
            const goalsPanel = document.getElementById('goals-panel');
            const aiModal = document.getElementById('ai-modal'); // Use aiModal for consistency

            if (notesPanel.classList.contains('hidden')) {
                // Opening Notes: Hide everything else
                notesPanel.classList.remove('hidden');
                archivePanel.classList.add('hidden');
                goalsPanel.classList.add('hidden');
                if (aiModal.classList.contains('visible')) { // Check if AI modal is open
                    closeAIModal(); // Close AI modal if open
                }
                renderNotesList();
            } else {
                notesPanel.classList.add('hidden');
            }
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

            // Node Groups Modal
            const nodeGroupsModal = document.getElementById('node-groups-modal');
            const nodeGroupsHeader = document.getElementById('node-groups-header');
            makeModalDraggable(nodeGroupsModal, nodeGroupsHeader, 'nodeGroupsModalPosition');
        }

        function makeModalDraggable(modal, handle, positionKey) {
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
                const inboxPanel = document.getElementById('inbox-panel');
                if (inboxPanel.classList.contains('hidden')) {
                    toggleInboxModal();
                }
                showNotification("This task is still in your Inbox");
                return;
            }

            let node = nodes.find(n => n.id === id) || archivedNodes.find(n => n.id === id);
            if (!node) return;
            selectNode(id);

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

        // --- BLOCK-BASED NOTE SYSTEM FUNCTIONS ---

        // Parse note body with legacy migration
        function parseNoteBody(note) {
            if (!note || !note.body) return [];
            try {
                const parsed = JSON.parse(note.body);
                if (Array.isArray(parsed)) {
                    // Initialize bookmarkName if missing
                    parsed.forEach(b => {
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
            const list = document.getElementById('blocks-list');
            if (!list) return;
            list.innerHTML = '';

            currentNoteBlocks.forEach((block, idx) => {
                const blockDiv = document.createElement('div');
                const isCurrentBlockEditing = !isNoteGlobalViewMode && block.isEditing;

                blockDiv.className = `note-block ${activeBlockId === block.id && !isNoteGlobalViewMode ? 'active-block' : ''}`;
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

        // Auto-resize textarea
        function autoResizeTextarea(textarea) {
            if (!textarea) return;
            textarea.style.height = 'auto';
            textarea.style.height = textarea.scrollHeight + 'px';
        }

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

        // --- MAXIMIZED BLOCK FUNCTIONS ---
        let maximizedBlockId = null;
        let maxBlockIsViewMode = false;

        function maximizeBlock(blockId) {
            const block = currentNoteBlocks.find(b => b.id === blockId);
            if (!block) return;

            maximizedBlockId = blockId;
            maxBlockIsViewMode = false;

            const windowEl = document.getElementById('maximized-block-window');
            const categoryEl = document.getElementById('max-block-category');
            const textarea = document.getElementById('max-block-textarea');
            const preview = document.getElementById('max-block-preview');
            const bookmarkName = document.getElementById('max-bookmark-name');

            // Set category name
            categoryEl.innerText = noteSettings.categoryNames[block.colorIndex] || 'Category';
            categoryEl.style.color = noteCategoryColors[block.colorIndex];

            // Set bookmark display
            if (block.bookmarkName) {
                bookmarkName.innerText = block.bookmarkName;
                bookmarkName.style.color = 'var(--accent)';
            } else {
                bookmarkName.innerText = '';
            }

            // Set content
            textarea.value = block.text || '';
            preview.innerHTML = renderMarkdown(block.text || '_Empty_');

            // Show edit mode by default
            textarea.style.display = 'block';
            preview.style.display = 'none';
            document.getElementById('max-toggle-edit-btn').classList.add('active-mode');
            document.getElementById('max-toggle-view-btn').classList.remove('active-mode');
            document.getElementById('max-edit-tools').style.display = 'flex';

            // Show window
            windowEl.classList.add('visible');

            // Focus and resize
            setTimeout(() => {
                textarea.focus();
                autoResizeMaxTextarea();
            }, 100);
        }

        function closeMaximizedBlock() {
            const windowEl = document.getElementById('maximized-block-window');
            windowEl.classList.remove('visible');

            // Scroll back to the block in main editor
            if (maximizedBlockId) {
                setTimeout(() => {
                    const blockEl = document.getElementById(`block-${maximizedBlockId}`);
                    const container = document.getElementById('blocks-container');
                    if (blockEl && container) {
                        blockEl.scrollIntoView({ behavior: 'smooth', block: 'center' });

                        // Flash animation
                        blockEl.classList.remove('flash-highlight');
                        void blockEl.offsetWidth;
                        blockEl.classList.add('flash-highlight');

                        setTimeout(() => {
                            blockEl.classList.remove('flash-highlight');
                        }, 1500);
                    }
                }, 100);
            }

            maximizedBlockId = null;
        }

        function toggleMaxBlockMode(isView) {
            maxBlockIsViewMode = isView;
            const textarea = document.getElementById('max-block-textarea');
            const preview = document.getElementById('max-block-preview');
            const editBtn = document.getElementById('max-toggle-edit-btn');
            const viewBtn = document.getElementById('max-toggle-view-btn');
            const editTools = document.getElementById('max-edit-tools');

            if (isView) {
                textarea.style.display = 'none';
                preview.style.display = 'block';
                preview.innerHTML = renderMarkdown(textarea.value || '_Empty_');
                editBtn.classList.remove('active-mode');
                viewBtn.classList.add('active-mode');
                editTools.style.display = 'none';
            } else {
                textarea.style.display = 'block';
                preview.style.display = 'none';
                editBtn.classList.add('active-mode');
                viewBtn.classList.remove('active-mode');
                editTools.style.display = 'flex';
                textarea.focus();
            }
        }

        function autoResizeMaxTextarea() {
            const textarea = document.getElementById('max-block-textarea');
            if (!textarea) return;
            textarea.style.height = 'auto';
            textarea.style.height = textarea.scrollHeight + 'px';
        }

        function applyMaxBlockFormat(type) {
            const textarea = document.getElementById('max-block-textarea');
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
            updateMaxBlockText();
            textarea.focus();

            const newPos = start + replacement.length;
            textarea.setSelectionRange(newPos, newPos);
            autoResizeMaxTextarea();
        }

        function convertMaxBlockSelectionToTask() {
            const textarea = document.getElementById('max-block-textarea');
            const start = textarea.selectionStart;
            const end = textarea.selectionEnd;
            const selectedText = textarea.value.substring(start, end).trim();

            if (!selectedText) {
                showNotification("Please select text first");
                return;
            }

            // Create task
            const worldX = (window.innerWidth / 2 - panX) / scale - 90;
            const worldY = (window.innerHeight / 2 - panY) / scale - 50;
            const newNode = createNode(worldX, worldY, selectedText);
            nodes.push(newNode);

            // Replace selected text with wiki-link
            const text = textarea.value;
            const replacement = `[[${selectedText}]]`;
            textarea.value = text.substring(0, start) + replacement + text.substring(end);

            // Update block
            updateMaxBlockText();
            autoResizeMaxTextarea();

            // Link to current note
            if (currentEditingNoteId) {
                const note = notes.find(n => n.id === currentEditingNoteId);
                if (note) {
                    if (!note.taskIds) note.taskIds = [];
                    if (!note.taskIds.includes(newNode.id)) {
                        note.taskIds.push(newNode.id);
                    }
                }
            }

            updateCalculations();
            render();
            saveToStorage();

            showNotification("Task Created: " + selectedText.substring(0, 30) + (selectedText.length > 30 ? "..." : ""));
        }

        function openMaxBlockBookmark() {
            if (!maximizedBlockId) return;
            currentBookmarkBlockId = maximizedBlockId;
            const block = currentNoteBlocks.find(b => b.id === maximizedBlockId);
            const modal = document.getElementById('bookmark-modal');
            const input = document.getElementById('bookmark-input');

            if (block && modal && input) {
                input.value = block.bookmarkName || "";
                modal.style.display = 'flex';
                input.focus();
                input.select();
            }
        }

        async function applyMaxBlockAI(mode) {
            const textarea = document.getElementById('max-block-textarea');
            const start = textarea.selectionStart;
            const end = textarea.selectionEnd;
            const selectedText = textarea.value.substring(start, end);

            if (!selectedText) {
                showNotification("Please select text first");
                return;
            }

            if (!geminiApiKey) {
                alert("⚠️ Please set your Gemini API Key in settings");
                return;
            }

            const systemPrompt = mode === 'grammar'
                ? "Fix grammar and spelling. Return ONLY the corrected text. No quotes. Preserve formatting. Text: "
                : "Improve clarity and flow. Return ONLY the rewritten text. No quotes. Preserve formatting. Text: ";

            try {
                const responseData = await fetchGemini({
                    contents: [{ parts: [{ text: systemPrompt + selectedText }] }]
                });

                let result = responseData.candidates[0].content.parts[0].text.trim();

                if (result.startsWith('"') && result.endsWith('"') && result.length > 2) {
                    result = result.slice(1, -1);
                }

                const before = textarea.value.substring(0, start);
                const after = textarea.value.substring(end);
                textarea.value = before + result + after;

                updateMaxBlockText();
                autoResizeMaxTextarea();

            } catch (err) {
                alert("AI Error: " + err.message);
            }
        }

        function deleteMaxBlock() {
            if (!maximizedBlockId) return;
            if (!confirm("Delete this block?")) return;

            currentNoteBlocks = currentNoteBlocks.filter(b => b.id !== maximizedBlockId);

            closeMaximizedBlock();
            renderNoteBlocks();
            triggerNoteSave();
        }

        function updateMaxBlockText() {
            if (!maximizedBlockId) return;
            const block = currentNoteBlocks.find(b => b.id === maximizedBlockId);
            const textarea = document.getElementById('max-block-textarea');

            if (block && textarea) {
                block.text = textarea.value;
                triggerNoteSave();

                // Update preview if in view mode
                if (maxBlockIsViewMode) {
                    document.getElementById('max-block-preview').innerHTML = renderMarkdown(textarea.value || '_Empty_');
                }
            }
        }

        function copyBlockContent(blockId) {
            const block = currentNoteBlocks.find(b => b.id === blockId);
            if (!block || !block.text) {
                showNotification("Block is empty");
                return;
            }

            // Copy to clipboard
            navigator.clipboard.writeText(block.text).then(() => {
                showNotification("✓ Block copied to clipboard!");
            }).catch(err => {
                console.error('Copy failed:', err);
                showNotification("Copy failed - please try again");
            });
        }

        function copyMaxBlockContent() {
            const textarea = document.getElementById('max-block-textarea');
            if (!textarea || !textarea.value) {
                showNotification("Block is empty");
                return;
            }

            navigator.clipboard.writeText(textarea.value).then(() => {
                showNotification("✓ Block copied to clipboard!");
            }).catch(err => {
                console.error('Copy failed:', err);
                showNotification("Copy failed - please try again");
            });
        }

        function exportNotesAsMarkdown() {
            let md = `# Urgency Flow Notes Export\nGenerated: ${new Date().toLocaleString()}\n\n`;

            notes.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

            notes.forEach(note => {
                md += `## ${note.title || 'Untitled'}\n`;
                md += `*Created: ${new Date(note.timestamp || Date.now()).toLocaleDateString()}*\n\n`;

                // Parse blocks
                try {
                    const blocks = JSON.parse(note.body);
                    if (Array.isArray(blocks)) {
                        blocks.forEach((block, idx) => {
                            const category = noteSettings.categoryNames[block.colorIndex] || 'Note';
                            if (block.bookmarkName) {
                                md += `### ${block.bookmarkName}\n`;
                            }
                            md += `${block.text || ''}\n\n`;

                            // Add separator between blocks except last
                            if (idx < blocks.length - 1) {
                                md += `---\n\n`;
                            }
                        });
                    }
                } catch (e) {
                    // Legacy string format
                    md += `${note.body || ''}\n\n`;
                }

                if (note.taskIds && note.taskIds.length > 0) {
                    md += `**Linked Tasks:** ${note.taskIds.join(', ')}\n`;
                }

                md += `\n---\n\n`;
            });

            // Download file
            const blob = new Blob([md], { type: 'text/markdown' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `urgency-flow-notes-${new Date().toISOString().split('T')[0]}.md`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            showNotification("Exported as Markdown!");
        }

        function copyEntireNote() {
            if (!currentEditingNoteId || currentNoteBlocks.length === 0) {
                showNotification("Note is empty");
                return;
            }

            // Get the note title
            const noteTitle = document.getElementById('note-title-input').value || "Untitled Note";

            // Combine all blocks with separators
            const allBlocksText = currentNoteBlocks.map((block, index) => {
                const categoryName = noteSettings.categoryNames[block.colorIndex] || `Category ${block.colorIndex + 1}`;
                const bookmarkText = block.bookmarkName ? ` [${block.bookmarkName}]` : '';
                const header = `--- ${categoryName}${bookmarkText} ---`;
                return `${header}\n${block.text || '(empty block)'}`;
            }).join('\n\n');

            const fullText = `# ${noteTitle}\n\n${allBlocksText}`;

            navigator.clipboard.writeText(fullText).then(() => {
                showNotification(`✓ Entire note copied! (${currentNoteBlocks.length} blocks)`);
            }).catch(err => {
                console.error('Copy failed:', err);
                showNotification("Copy failed - please try again");
            });
        }

        // Auto-update on typing
        document.addEventListener('DOMContentLoaded', () => {
            const textarea = document.getElementById('max-block-textarea');
            if (textarea) {
                textarea.addEventListener('input', () => {
                    updateMaxBlockText();
                    autoResizeMaxTextarea();
                });
            }
        });

        // Close on Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && maximizedBlockId) {
                closeMaximizedBlock();
            }
        });



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
                item.innerHTML = `<strong>✅ ${h.title || "Untitled Habit"}</strong><small>${freq} • ${type}</small>`;
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

                            const tag = document.createElement('div');
                            tag.className = 'note-task-tag';
                            tag.innerHTML = `
                                <span onclick="closeNoteEditor(); jumpToTask('${tid}')">${task.title}</span>
                                <span class="unlink-btn" onclick="event.stopPropagation(); unlinkTaskFromNoteFooter('${tid}')">✕</span>
                            `;
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
            const container = document.getElementById('notes-list-container');
            const searchInput = document.getElementById('note-search-input');
            // Safety check if element exists (in case of partial load)
            if (!searchInput) return;

            const searchVal = searchInput.value.toLowerCase();
            container.innerHTML = '';

            const sortedNotes = [...notes].sort((a, b) => {
                if (a.isPinned && !b.isPinned) return -1;
                if (!a.isPinned && b.isPinned) return 1;
                return b.timestamp - a.timestamp;
            });

            const filteredNotes = sortedNotes.filter(n =>
                (n.title && n.title.toLowerCase().includes(searchVal)) ||
                (n.body && n.body.toLowerCase().includes(searchVal))
            );

            if (filteredNotes.length === 0) {
                container.innerHTML = '<div style="text-align:center; color:#666; padding:20px;">No matching notes found.</div>';
                return;
            }

            filteredNotes.forEach(note => {
                const el = document.createElement('div');
                el.className = `note-card ${note.isPinned ? 'pinned-note' : ''}`;
                if (note.id === currentEditingNoteId) el.classList.add('active');

                // Extract preview from blocks or legacy string
                let previewText = '';
                try {
                    const blocks = JSON.parse(note.body);
                    if (Array.isArray(blocks)) {
                        previewText = blocks.map(b => b.text || '').join(' ');
                    }
                } catch (e) {
                    previewText = note.body || '';
                }
                previewText = previewText.replace(/[#*\[\]]/g, '').substring(0, 80);

                const tagsHtml = (previewText.match(/#\w+/g) || [])
                    .map(t => `<span class="note-tag">${t}</span>`).join('');

                const linkedCount = (note.taskIds || []).length;
                const linkIndicator = linkedCount > 0 ? `<span style="font-size:10px; color:#3b82f6; margin-left:6px;">🔗 ${linkedCount}</span>` : '';
                const reminderIcon = hasReminderForItem('note', note.id) ?
                    `<button class="btn reminder-note-btn active" style="padding:1px 4px; font-size:9px; margin-left:4px;" onclick="event.stopPropagation(); openRemindersModal('note', '${note.id}');">⏰</button>` :
                    `<button class="btn reminder-note-btn" style="padding:1px 4px; font-size:9px; margin-left:4px; opacity:0.5;" onclick="event.stopPropagation(); openRemindersModal('note', '${note.id}');">⏰</button>`;

                const pinIcon = isPinned('note', note.id) ?
                    `<button class="btn" style="padding:1px 4px; font-size:9px; margin-left:4px; border-color:var(--accent); color:var(--accent);" onclick="event.stopPropagation(); togglePinItem('note', '${note.id}'); renderNotesList();">📌</button>` :
                    `<button class="btn" style="padding:1px 4px; font-size:9px; margin-left:4px; opacity:0.3;" onclick="event.stopPropagation(); togglePinItem('note', '${note.id}'); renderNotesList();">📌</button>`;

                el.innerHTML = `
                <div class="note-card-title">${note.isPinned ? '📌 ' : ''}${note.title || '(Untitled)'}${linkIndicator}</div>
                <div class="note-card-preview">${previewText}...</div>
                <div style="margin-top:5px;">${tagsHtml}</div>
                <div class="note-card-meta"><span>${new Date(note.timestamp || Date.now()).toLocaleDateString()}</span><span style="display:flex; align-items:center;">${reminderIcon}${pinIcon}</span></div>
            `;
                el.onclick = () => openNoteEditor(note.id);
                container.appendChild(el);
            });
        }

        function toggleCurrentNotePin() {
            if (!currentEditingNoteId) return;
            const note = notes.find(n => n.id === currentEditingNoteId);
            if (note) {
                note.isPinned = !note.isPinned;
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
            note.title = document.getElementById('note-title-input').value;
            note.body = serializeNoteBlocks();
            note.timestamp = Date.now();
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

                closeNoteEditor();
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

                const tag = document.createElement('div');
                tag.style.background = 'rgba(59, 130, 246, 0.1)';
                tag.style.border = '1px solid rgba(59, 130, 246, 0.3)';
                tag.style.color = '#60a5fa';
                tag.style.borderRadius = '12px';
                tag.style.padding = '2px 10px';
                tag.style.fontSize = '10px';
                tag.style.display = 'flex';
                tag.style.alignItems = 'center';
                tag.style.gap = '6px';
                tag.style.transition = 'all 0.2s';
                tag.onmouseover = () => { tag.style.background = 'rgba(59, 130, 246, 0.2)'; tag.style.borderColor = 'rgba(59, 130, 246, 0.5)'; };
                tag.onmouseout = () => { tag.style.background = 'rgba(59, 130, 246, 0.1)'; tag.style.borderColor = 'rgba(59, 130, 246, 0.3)'; };

                const title = document.createElement('span');
                title.innerText = task.title;
                title.style.cursor = 'pointer';
                title.title = "Jump to Task";
                title.onclick = () => { closeNoteEditor(); jumpToTask(tid); };

                const remove = document.createElement('span');
                remove.innerText = '✕';
                remove.style.cursor = 'pointer';
                remove.style.color = '#475569';
                remove.style.fontSize = '12px';
                remove.title = "Unlink Task";
                remove.onmouseover = () => remove.style.color = '#ef4444';
                remove.onmouseout = () => remove.style.color = '#475569';
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

            const node = nodes.find(n => n.id === taskId);
            if (!node) return;

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
            if (!node.goalIds.includes(goalId)) {
                node.goalIds.push(goalId);
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
                        if (!downNode.goalIds.includes(goalId)) {
                            downNode.goalIds.push(goalId);
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
            const node = nodes.find(n => n.id === taskId);
            if (!node) return;
            if (!node.goalIds) node.goalIds = [];
            node.goalIds = node.goalIds.filter(id => id !== goalId);
            saveToStorage();
            updateInspector();
            showNotification("Task Unlinked from Goal");
        }
