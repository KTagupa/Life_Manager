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

