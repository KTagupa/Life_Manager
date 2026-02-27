// linkify() and extractLink() are now in utils.js


// --- TOOLBAR LOGIC ---
function toggleMenu() {
    const tb = document.getElementById('toolbar');
    const btn = document.getElementById('menu-btn');
    const isCollapsed = tb.classList.toggle('collapsed');
    const isExpanded = !isCollapsed;

    btn.innerHTML = isCollapsed ? '☰' : '✕';
    btn.setAttribute('aria-expanded', String(isExpanded));
    btn.setAttribute('aria-label', isExpanded ? 'Close Menu (Optn+Q)' : 'Open Menu (Optn+Q)');
    btn.title = isExpanded ? 'Close Menu (Optn+Q)' : 'Open Menu (Optn+Q)';
    if (isCollapsed) hideToolbarActionTooltip();
}

function hideToolbarActionTooltip() {
    const tooltip = document.getElementById('toolbar-action-tooltip');
    if (!tooltip) return;
    tooltip.classList.remove('visible');
    tooltip.style.transform = 'translate(-9999px, -9999px)';
}

function setupToolbarActionTooltips() {
    const grid = document.getElementById('toolbar-quick-actions-grid');
    if (!grid || grid.dataset.tooltipReady === '1') return;
    grid.dataset.tooltipReady = '1';

    let tooltip = document.getElementById('toolbar-action-tooltip');
    if (!tooltip) {
        tooltip = document.createElement('div');
        tooltip.id = 'toolbar-action-tooltip';
        document.body.appendChild(tooltip);
    }

    let activeBtn = null;

    const positionTooltip = (btn) => {
        if (!btn || !tooltip) return;
        const text = btn.getAttribute('data-tooltip') || btn.getAttribute('aria-label') || '';
        if (!text) {
            hideToolbarActionTooltip();
            return;
        }

        tooltip.textContent = text;
        tooltip.style.left = '0px';
        tooltip.style.top = '0px';
        tooltip.style.transform = 'translate(-9999px, -9999px)';
        tooltip.classList.add('visible');

        const rect = btn.getBoundingClientRect();
        const tipRect = tooltip.getBoundingClientRect();
        const gap = 12;
        const margin = 8;

        let left = rect.right + gap;
        if (left + tipRect.width + margin > window.innerWidth) {
            left = rect.left - tipRect.width - gap;
        }
        left = Math.max(margin, left);

        let top = rect.top + (rect.height / 2) - (tipRect.height / 2);
        top = Math.max(margin, Math.min(top, window.innerHeight - tipRect.height - margin));

        tooltip.style.left = `${Math.round(left)}px`;
        tooltip.style.top = `${Math.round(top)}px`;
        tooltip.style.transform = 'translate(0, 0)';
    };

    const show = (btn) => {
        activeBtn = btn;
        positionTooltip(btn);
    };

    const hide = (btn) => {
        if (btn && activeBtn && btn !== activeBtn) return;
        activeBtn = null;
        hideToolbarActionTooltip();
    };

    grid.querySelectorAll('.toolbar-menu-action').forEach(btn => {
        btn.addEventListener('mouseenter', () => show(btn));
        btn.addEventListener('focus', () => show(btn));
        btn.addEventListener('mouseleave', () => hide(btn));
        btn.addEventListener('blur', () => hide(btn));
    });

    grid.addEventListener('scroll', () => {
        if (activeBtn) positionTooltip(activeBtn);
    }, { passive: true });

    window.addEventListener('resize', () => {
        if (activeBtn) positionTooltip(activeBtn);
    });
}

const WORKSPACE_SECTION_STORAGE_KEY = 'urgencyFlow_workspace_section';
const NAVIGATOR_TAB_STORAGE_KEY = 'urgencyFlow_navigator_tab';

function normalizeWorkspaceSection(section) {
    const valid = ['today', 'capture', 'knowledge', 'review', 'settings'];
    return valid.includes(section) ? section : 'today';
}

function getSavedWorkspaceSection() {
    try {
        return normalizeWorkspaceSection(localStorage.getItem(WORKSPACE_SECTION_STORAGE_KEY) || 'today');
    } catch (error) {
        return 'today';
    }
}

function normalizeNavigatorTab(tab) {
    const valid = ['pinned', 'tasks', 'groups'];
    return valid.includes(tab) ? tab : 'pinned';
}

function getSavedNavigatorTab() {
    try {
        return normalizeNavigatorTab(localStorage.getItem(NAVIGATOR_TAB_STORAGE_KEY) || 'pinned');
    } catch (error) {
        return 'pinned';
    }
}

let currentWorkspaceSection = getSavedWorkspaceSection();
let viewportOriginGuardActive = false;

const RIGHT_DOCK_PANEL_IDS = [
    'notes-panel',
    'archive-panel',
    'agenda-panel',
    'projects-panel',
    'navigator-panel',
    'sync-panel',
    'goals-panel',
    'habits-panel'
];

function resetViewportOrigin() {
    if (viewportOriginGuardActive) return;
    const sx = window.scrollX || window.pageXOffset || 0;
    const sy = window.scrollY || window.pageYOffset || 0;
    if (sx === 0 && sy === 0) return;
    viewportOriginGuardActive = true;
    window.scrollTo(0, 0);
    requestAnimationFrame(() => { viewportOriginGuardActive = false; });
}

function normalizeRightDockPanelPosition(panel) {
    if (!panel) return;
    if (panel.id === 'notes-panel' && panel.classList.contains('floating')) return;
    panel.style.left = '';
    panel.style.right = '0';
    panel.style.bottom = '0';
}

if (!window.__viewportOriginLockBound) {
    window.__viewportOriginLockBound = true;
    window.addEventListener('scroll', resetViewportOrigin, { passive: true });
}

function isRightDockPanelVisible(id) {
    const panel = document.getElementById(id);
    if (!panel || panel.classList.contains('hidden')) return false;
    if (id === 'notes-panel' && panel.classList.contains('floating')) return false;
    return true;
}

function setRightDockPanelFocusState(panel, isHidden) {
    if (!panel) return;
    panel.setAttribute('aria-hidden', isHidden ? 'true' : 'false');
    if ('inert' in panel) {
        panel.inert = !!isHidden;
    } else if (isHidden) {
        panel.setAttribute('inert', '');
    } else {
        panel.removeAttribute('inert');
    }
}

function normalizeRightDockPanels(preferredId = null) {
    const visibleIds = RIGHT_DOCK_PANEL_IDS.filter(isRightDockPanelVisible);
    if (visibleIds.length <= 1) return visibleIds[0] || null;

    const keepId = (preferredId && visibleIds.includes(preferredId))
        ? preferredId
        : visibleIds[visibleIds.length - 1];

    RIGHT_DOCK_PANEL_IDS.forEach(id => {
        if (id === keepId) return;
        const panel = document.getElementById(id);
        if (!panel) return;
        if (id === 'notes-panel' && panel.classList.contains('floating')) return;
        normalizeRightDockPanelPosition(panel);
        panel.classList.add('hidden');
    });
    return keepId;
}

function closeRightDockPanels(exceptId = null) {
    RIGHT_DOCK_PANEL_IDS.forEach(id => {
        if (id === exceptId) return;
        const panel = document.getElementById(id);
        if (!panel) return;
        // Floating notes are detached from the right rail and should not be force-closed.
        if (id === 'notes-panel' && panel.classList.contains('floating')) return;
        normalizeRightDockPanelPosition(panel);
        panel.classList.add('hidden');
    });
}

function getVisibleRightDockPanelId() {
    return RIGHT_DOCK_PANEL_IDS.find(isRightDockPanelVisible) || null;
}

function syncRightRailTabs() {
    const normalizedId = normalizeRightDockPanels();
    const activePanelId = normalizedId || getVisibleRightDockPanelId();
    RIGHT_DOCK_PANEL_IDS.forEach(id => {
        const panel = document.getElementById(id);
        if (!panel) return;
        normalizeRightDockPanelPosition(panel);
        setRightDockPanelFocusState(panel, panel.classList.contains('hidden'));
    });
    document.querySelectorAll('#right-rail-tabs .right-rail-tab').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.panelId === activePanelId);
    });
    document.body.classList.toggle('right-rail-open', !!activePanelId);
    resetViewportOrigin();
}

function openRightDockPanel(panelId, onOpen = null) {
    const panel = document.getElementById(panelId);
    if (!panel) return false;
    closeRightDockPanels(panelId);
    normalizeRightDockPanelPosition(panel);
    panel.classList.remove('hidden');
    setRightDockPanelFocusState(panel, false);
    if (typeof onOpen === 'function') onOpen();
    normalizeRightDockPanels(panelId);
    syncRightRailTabs();
    return true;
}

function closeRightDockPanel(panelId) {
    const panel = document.getElementById(panelId);
    if (!panel) return;
    normalizeRightDockPanelPosition(panel);
    panel.classList.add('hidden');
    syncRightRailTabs();
}

function openRightRailTab(tabId) {
    switch (tabId) {
        case 'notes':
            if (typeof toggleNotesPanel === 'function') toggleNotesPanel(true);
            break;
        case 'goals':
            if (typeof toggleGoals === 'function') toggleGoals(true);
            break;
        case 'habits':
            if (typeof toggleHabits === 'function') toggleHabits(true);
            break;
        case 'planner':
            if (typeof openPlannerTab === 'function') {
                const desired = (typeof currentPlannerTab === 'string' && currentPlannerTab) ? currentPlannerTab : 'agenda';
                openPlannerTab(desired);
            }
            break;
        case 'projects':
            if (typeof toggleProjectsPanel === 'function') toggleProjectsPanel(true);
            break;
        case 'archive':
            if (typeof toggleArchivePanel === 'function') toggleArchivePanel(true);
            break;
        case 'navigator':
            if (typeof toggleNavigatorPanel === 'function') {
                const desired = (typeof currentNavigatorTab === 'string' && currentNavigatorTab) ? currentNavigatorTab : 'tasks';
                toggleNavigatorPanel(true, desired);
            }
            break;
        case 'settings':
            if (typeof toggleSyncPanel === 'function') toggleSyncPanel(true);
            break;
    }
}

function closeWorkspaceSurfaces() {
    const sidePanels = ['goals-panel', 'habits-panel', 'notes-panel', 'agenda-panel', 'projects-panel', 'archive-panel', 'calendar-panel'];
    sidePanels.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.add('hidden');
    });

    const heatmap = document.getElementById('heatmap-overlay');
    if (heatmap) heatmap.classList.add('hidden');

    const syncPanel = document.getElementById('sync-panel');
    if (syncPanel) syncPanel.classList.add('hidden');

    const navigatorPanel = document.getElementById('navigator-panel');
    if (navigatorPanel) navigatorPanel.classList.add('hidden');

    const inboxModal = document.getElementById('inbox-modal');
    if (inboxModal && inboxModal.classList.contains('visible') && typeof closeInboxModal === 'function') {
        closeInboxModal();
    }

    const remindersModal = document.getElementById('reminders-modal');
    if (remindersModal && remindersModal.classList.contains('visible') && typeof closeRemindersModal === 'function') {
        closeRemindersModal();
    }

    const aiModal = document.getElementById('ai-modal');
    if (aiModal && aiModal.classList.contains('visible') && typeof closeAIModal === 'function') {
        closeAIModal();
    }

    if (typeof closeInsightsDashboard === 'function') {
        closeInsightsDashboard();
    }

    syncRightRailTabs();
}

function setWorkspaceSection(section = 'today') {
    section = normalizeWorkspaceSection(section);
    currentWorkspaceSection = section;
    try {
        localStorage.setItem(WORKSPACE_SECTION_STORAGE_KEY, section);
    } catch (error) {
        console.warn('[ui] Failed to persist workspace section:', error);
    }

    document.querySelectorAll('#workspace-nav .workspace-tab').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.section === section);
    });

    closeWorkspaceSurfaces();

    if (section === 'capture') {
        if (typeof toggleInboxModal === 'function') toggleInboxModal();
        return;
    }

    if (section === 'knowledge') {
        if (typeof openRightDockPanel === 'function') {
            openRightDockPanel('notes-panel', () => {
                if (typeof renderNotesList === 'function') renderNotesList();
            });
        } else {
            const notesPanel = document.getElementById('notes-panel');
            if (notesPanel) notesPanel.classList.remove('hidden');
            if (typeof renderNotesList === 'function') renderNotesList();
        }
        return;
    }

    if (section === 'review') {
        if (typeof openInsightsDashboard === 'function') openInsightsDashboard();
        return;
    }

    if (section === 'settings') {
        if (typeof openRightDockPanel === 'function') {
            openRightDockPanel('sync-panel', () => {
                if (typeof updateSettingsHubUI === 'function') updateSettingsHubUI();
                if (typeof updateConnectionStatus === 'function') updateConnectionStatus();
            });
        } else {
            const syncPanel = document.getElementById('sync-panel');
            if (syncPanel) syncPanel.classList.remove('hidden');
            if (typeof updateSettingsHubUI === 'function') updateSettingsHubUI();
            if (typeof updateConnectionStatus === 'function') updateConnectionStatus();
        }
        return;
    }
}

// --- QUICK LINKS ---
const MAX_QUICK_LINKS = 5;

function openQuickLinkModal() {
    if (Array.isArray(quickLinks) && quickLinks.length >= MAX_QUICK_LINKS) {
        showNotification('Quick link limit reached (5 max).');
        return;
    }
    const modal = document.getElementById('quick-link-modal');
    const labelInput = document.getElementById('quick-link-label');
    const urlInput = document.getElementById('quick-link-url');
    if (!modal || !labelInput || !urlInput) return;
    labelInput.value = '';
    urlInput.value = '';
    modal.style.display = 'flex';
    setTimeout(() => urlInput.focus(), 0);
}

function closeQuickLinkModal() {
    const modal = document.getElementById('quick-link-modal');
    if (modal) modal.style.display = 'none';
}

function normalizeQuickLinkUrl(input) {
    const trimmed = (input || '').trim();
    if (!trimmed) return '';
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) return trimmed;
    if (trimmed.startsWith('/') || trimmed.startsWith('./') || trimmed.startsWith('../')) return trimmed;
    if (/\.(html?|pdf|md)$/i.test(trimmed)) return trimmed;
    const firstSegment = trimmed.split('/')[0];
    if (firstSegment.includes('.') && !/\.(html?|pdf|md)$/i.test(firstSegment)) {
        return 'https://' + trimmed;
    }
    return trimmed;
}

function deriveQuickLinkLabel(url) {
    if (!url) return 'LINK';
    let cleaned = url.replace(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//, '');
    cleaned = cleaned.replace(/^www\./, '');
    cleaned = cleaned.split(/[?#]/)[0];
    const parts = cleaned.split('/');
    let base = parts[0] || cleaned;
    if (cleaned.startsWith('/') || cleaned.startsWith('./') || cleaned.startsWith('../')) {
        base = parts[parts.length - 1] || cleaned;
    }
    base = base.replace(/\\.[a-z0-9]+$/i, '');
    base = base.replace(/[^a-zA-Z0-9]/g, '');
    if (!base) return 'LINK';
    return base.toUpperCase();
}

function getQuickLinkDisplayLabel(link) {
    const label = (link && link.label && link.label.trim()) ? link.label.trim() : deriveQuickLinkLabel(link.url);
    const cleaned = label.replace(/[^a-zA-Z0-9]/g, '');
    const display = cleaned || label;
    return display.length > 4 ? display.slice(0, 4).toUpperCase() : display.toUpperCase();
}

function renderQuickLinks() {
    const container = document.getElementById('quick-links-container');
    const addBtn = document.getElementById('btn-add-quick-link');
    if (!container) return;
    container.innerHTML = '';

    const links = Array.isArray(quickLinks) ? quickLinks.slice(0, MAX_QUICK_LINKS) : [];
    links.forEach(link => {
        const wrapper = document.createElement('div');
        wrapper.className = 'quick-link-wrapper';

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'quick-link-btn';
        btn.title = `${link.label || deriveQuickLinkLabel(link.url)} • ${link.url}`;
        btn.innerText = getQuickLinkDisplayLabel(link);
        btn.addEventListener('click', () => {
            if (!link.url) return;
            const isExternal = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(link.url);
            if (isExternal) {
                window.open(link.url, '_blank', 'noopener,noreferrer');
            } else {
                window.location.href = link.url;
            }
        });

        const removeBtn = document.createElement('div');
        removeBtn.className = 'quick-link-remove';
        removeBtn.title = 'Remove link';
        removeBtn.innerText = '✕';
        removeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            deleteQuickLink(link.id);
        });

        wrapper.appendChild(btn);
        wrapper.appendChild(removeBtn);
        container.appendChild(wrapper);
    });

    if (addBtn) {
        addBtn.style.display = links.length >= MAX_QUICK_LINKS ? 'none' : 'flex';
    }
}

function saveQuickLink() {
    const labelInput = document.getElementById('quick-link-label');
    const urlInput = document.getElementById('quick-link-url');
    if (!labelInput || !urlInput) return;

    if (Array.isArray(quickLinks) && quickLinks.length >= MAX_QUICK_LINKS) {
        showNotification('Quick link limit reached (5 max).');
        closeQuickLinkModal();
        return;
    }

    const label = labelInput.value.trim();
    const normalizedUrl = normalizeQuickLinkUrl(urlInput.value);
    if (!normalizedUrl) {
        showNotification('Please enter a valid link.');
        return;
    }

    const link = {
        id: 'ql_' + Date.now() + Math.random().toString(36).substr(2, 5),
        label: label,
        url: normalizedUrl
    };

    if (!Array.isArray(quickLinks)) quickLinks = [];
    quickLinks.push(link);
    if (quickLinks.length > MAX_QUICK_LINKS) quickLinks = quickLinks.slice(0, MAX_QUICK_LINKS);

    saveToStorage();
    renderQuickLinks();
    closeQuickLinkModal();
    showNotification('Quick link added.');
}

function deleteQuickLink(id) {
    if (!Array.isArray(quickLinks)) return;
    quickLinks = quickLinks.filter(link => link.id !== id);
    saveToStorage();
    renderQuickLinks();
    showNotification('Quick link removed.');
}

// --- CONTEXTUAL MENU LOGIC ---
function setupContextualMenu() {
    const menu = document.getElementById('selection-menu');

    document.addEventListener('mouseup', (e) => {
        // 1. Check if clicking inside the menu itself - do nothing
        if (menu.contains(e.target)) return;

        // 2. Check Note Editor Selection
        const noteInput = document.getElementById('note-body-input');
        if (!noteInput.classList.contains('hidden') && noteInput.contains(e.target)) {
            const text = noteInput.value.substring(noteInput.selectionStart, noteInput.selectionEnd).trim();
            if (text) {
                currentSelectionText = text;
                currentSelectionSource = 'note';
                noteSelectionRange = { start: noteInput.selectionStart, end: noteInput.selectionEnd };
                showContextMenu(e.clientX, e.clientY);
                return;
            }
        }

        // 3. Check AI Modal Selection
        const aiModal = document.getElementById('ai-modal');
        if (aiModal && aiModal.classList.contains('visible')) {
            const selection = window.getSelection();
            const text = selection.toString().trim();
            if (text && aiModal.contains(selection.anchorNode.nodeType === 3 ? selection.anchorNode.parentNode : selection.anchorNode)) {
                currentSelectionText = text;
                currentSelectionSource = 'ai';
                noteSelectionRange = null;
                showContextMenu(e.clientX, e.clientY);
                return;
            }
        }

        // 4. Default: Hide menu if no valid selection or click outside
        menu.style.display = 'none';
    });

    // Hide on scroll or resize to prevent floating menu in wrong place
    window.addEventListener('scroll', () => { menu.style.display = 'none'; }, true);
    window.addEventListener('resize', () => { menu.style.display = 'none'; });
}

function showContextMenu(x, y) {
    const menu = document.getElementById('selection-menu');
    menu.style.display = 'flex';

    // Bounds checking
    let left = x;
    let top = y - 40;

    if (left + 150 > window.innerWidth) left = window.innerWidth - 160;
    if (top < 10) top = y + 20; // Show below if too close to top

    menu.style.left = left + 'px';
    menu.style.top = top + 'px';
}

function toggleGlobalSearch() {
    let modal = document.getElementById('global-search-modal');
    if (modal) {
        modal.remove();
        return;
    }

    modal = document.createElement('div');
    modal.id = 'global-search-modal';
    modal.style.cssText = `
                position: fixed; top: 20%; left: 50%; transform: translateX(-50%);
                width: 600px; max-width: 90vw; max-height: 60vh;
                background: var(--panel-bg-elevated); border: 1px solid var(--accent);
                border-radius: 12px; z-index: 3000; box-shadow: 0 20px 60px rgba(0,0,0,0.8);
                display: flex; flex-direction: column; overflow: hidden;
            `;

    modal.innerHTML = `
                <div style=\"padding: 16px; border-bottom: 1px solid var(--border);\">
                    <input type=\"text\" id=\"global-search-input\" placeholder=\"Search goals, projects, tasks, notes, habits, inbox...\" 
                        style=\"width: 100%; background: var(--node-bg); border: 1px solid var(--border); 
                        color: white; padding: 12px; border-radius: 8px; font-size: 16px; outline: none;\">
                </div>
                <div id=\"global-search-results\" style=\"flex: 1; overflow-y: auto; padding: 8px;\"></div>
                <div style=\"padding: 8px 16px; border-top: 1px solid var(--border); font-size: 11px; color: var(--text-muted);\">
                    ↑↓ navigate • Enter open • Esc close
                </div>
            `;

    document.body.appendChild(modal);

    const input = document.getElementById('global-search-input');
    input.focus();

    let selectedIndex = 0;
    let results = [];

    const performSearch = (query) => {
        const q = query.toLowerCase();
        if (!q) {
            document.getElementById('global-search-results').innerHTML = '';
            return;
        }

        results = [];

        // Search tasks
        [...nodes, ...archivedNodes].forEach(n => {
            if (n.title.toLowerCase().includes(q) || (n.description || '').toLowerCase().includes(q)) {
                results.push({ type: 'task', title: n.title, obj: n, icon: n.completed ? '✅' : (n._isUrgent ? '⚡' : '📋') });
            }
        });

        // Search inbox
        inbox.forEach(item => {
            if ((item.title || '').toLowerCase().includes(q)) {
                results.push({ type: 'inbox', title: item.title, obj: item, icon: '📥' });
            }
        });

        // Search notes
        notes.forEach(n => {
            let bodyText = '';
            try {
                const blocks = JSON.parse(n.body);
                bodyText = blocks.map(b => b.text).join(' ');
            } catch (e) { bodyText = n.body || ''; }

            if ((n.title || '').toLowerCase().includes(q) || bodyText.toLowerCase().includes(q)) {
                results.push({ type: 'note', title: n.title, obj: n, icon: '📝' });
            }
        });

        // Search goals
        const searchGoals = (goals) => {
            goals.forEach(g => {
                if (g.text.toLowerCase().includes(q)) {
                    results.push({ type: 'goal', title: g.text, obj: g, icon: '🎯' });
                }
                if (g.children) searchGoals(g.children);
            });
        };
        if (lifeGoals[currentGoalYear]) searchGoals(lifeGoals[currentGoalYear]);

        // Search projects
        (Array.isArray(projects) ? projects : []).forEach(project => {
            if (!project || !project.id) return;
            const projectName = String(project.name || 'Untitled Project');
            const projectDescription = String(project.description || '');
            const status = String(project.status || 'active');
            const goalText = Array.isArray(project.goalIds)
                ? project.goalIds
                    .map(goalId => (typeof getGoalTextById === 'function') ? String(getGoalTextById(goalId) || '') : '')
                    .join(' ')
                : '';
            const searchable = `${projectName} ${projectDescription} ${status} ${goalText}`.toLowerCase();
            if (searchable.includes(q)) {
                results.push({ type: 'project', title: projectName, obj: project, icon: '📁' });
            }
        });

        // Search habits
        (Array.isArray(habits) ? habits : []).forEach(habit => {
            if (!habit || !habit.id) return;
            if (typeof isHabitArchived === 'function' && isHabitArchived(habit)) return;

            const habitTitle = String(habit.title || 'Untitled Habit');
            const habitGoal = (habit.goalId && typeof getGoalTextById === 'function')
                ? String(getGoalTextById(habit.goalId) || '')
                : '';
            const searchable = `${habitTitle} ${String(habit.type || '')} ${String(habit.frequency || '')} ${habitGoal}`.toLowerCase();
            if (searchable.includes(q)) {
                const habitIcon = habit.type === 'timer' ? '⏱' : (habit.type === 'counter' ? '🔢' : '✅');
                results.push({ type: 'habit', title: habitTitle, obj: habit, icon: habitIcon });
            }
        });

        const typePriority = {
            goal: 0,
            project: 1,
            task: 2,
            note: 3,
            habit: 4,
            inbox: 5
        };
        results.sort((a, b) => {
            const aRank = Object.prototype.hasOwnProperty.call(typePriority, a.type) ? typePriority[a.type] : 999;
            const bRank = Object.prototype.hasOwnProperty.call(typePriority, b.type) ? typePriority[b.type] : 999;
            if (aRank !== bRank) return aRank - bRank;
            return String(a.title || '').localeCompare(String(b.title || ''), undefined, { sensitivity: 'base' });
        });

        renderResults();
    };

    const renderResults = () => {
        const container = document.getElementById('global-search-results');
        container.innerHTML = results.map((r, idx) => `
                    <div class=\"search-result-item ${idx === selectedIndex ? 'selected' : ''}\" 
                         style=\"padding: 10px; cursor: pointer; border-radius: 6px; ${idx === selectedIndex ? 'background: var(--accent-light); border-left: 3px solid var(--accent);' : 'hover:background: rgba(255,255,255,0.05);'}\"
                         onclick=\"openSearchResult('${r.type}', '${r.obj.id}'); toggleGlobalSearch();\">
                        <span style=\"margin-right: 8px;\">${r.icon}</span>
                        <span style=\"${r.type === 'task' && r.obj.completed ? 'text-decoration: line-through; opacity: 0.6;' : ''}\">${r.title}</span>
                        <span style=\"float: right; font-size: 11px; color: var(--text-muted); text-transform: uppercase;\">${r.type}</span>
                    </div>
                `).join('');

        // Scroll selected into view
        const selected = container.children[selectedIndex];
        if (selected) selected.scrollIntoView({ block: 'nearest' });
    };

    input.addEventListener('input', (e) => {
        selectedIndex = 0;
        performSearch(e.target.value);
    });

    input.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            selectedIndex = Math.min(selectedIndex + 1, results.length - 1);
            renderResults();
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            selectedIndex = Math.max(selectedIndex - 1, 0);
            renderResults();
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (results[selectedIndex]) {
                openSearchResult(results[selectedIndex].type, results[selectedIndex].obj.id);
                toggleGlobalSearch();
            }
        } else if (e.key === 'Escape') {
            toggleGlobalSearch();
        }
    });

    // Close on backdrop
    modal.addEventListener('click', (e) => {
        if (e.target === modal) toggleGlobalSearch();
    });
}

function openSearchResult(type, id) {
    if (type === 'task') {
        jumpToTask(id);
    } else if (type === 'note') {
        openNoteEditor(id);
    } else if (type === 'inbox') {
        const modal = document.getElementById('inbox-modal');
        if (modal && !modal.classList.contains('visible')) toggleInboxModal();
    } else if (type === 'goal') {
        const goalsPanel = document.getElementById('goals-panel');
        if (goalsPanel && goalsPanel.classList.contains('hidden')) toggleGoals();
        // Flash the goal in the list (you'd need to add IDs to goal elements)
        setTimeout(() => {
            const goalEl = document.querySelector(`[data-goal-id=\"${id}\"]`);
            if (goalEl) {
                goalEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                goalEl.style.background = 'var(--accent-light)';
                setTimeout(() => goalEl.style.background = '', 1000);
            }
        }, 100);
    } else if (type === 'project') {
        const projectId = String(id || '').trim();
        if (!projectId) return;
        if (typeof projectsPanelSelectedProjectId !== 'undefined') {
            projectsPanelSelectedProjectId = projectId;
        }
        if (typeof openProjectDetailsModal === 'function') {
            openProjectDetailsModal(projectId);
            return;
        }
        if (typeof showNotification === 'function') {
            showNotification('Project details are not available.');
        }
    } else if (type === 'habit') {
        const habitId = String(id || '').trim();
        if (!habitId) return;
        if (typeof focusHabitInPanel === 'function' && focusHabitInPanel(habitId)) return;
        if (typeof toggleHabits === 'function') toggleHabits(true);
    }
}


function toggleInboxModal() {
    const modal = document.getElementById('inbox-modal');

    if (modal.classList.contains('visible')) {
        closeInboxModal();
    } else {
        // Restore saved position
        if (inboxModalPosition.x !== null && inboxModalPosition.y !== null) {
            modal.style.left = inboxModalPosition.x + 'px';
            modal.style.top = inboxModalPosition.y + 'px';
            modal.style.transform = 'none';
        }
        if (inboxModalPosition.width && inboxModalPosition.height) {
            modal.style.width = inboxModalPosition.width + 'px';
            modal.style.height = inboxModalPosition.height + 'px';
        }

        modal.classList.add('visible');
        renderInboxModal();
        setTimeout(() => document.getElementById('inbox-modal-input').focus(), 100);
    }
}

function closeInboxModal() {
    const modal = document.getElementById('inbox-modal');

    // Save position before closing
    const rect = modal.getBoundingClientRect();
    inboxModalPosition = {
        x: rect.left,
        y: rect.top,
        width: rect.width,
        height: rect.height
    };
    localStorage.setItem('inboxModalPosition', JSON.stringify(inboxModalPosition));

    modal.classList.remove('visible');
}

function centerHealthDashboard() {
    const healthDash = document.getElementById('health-dashboard');
    if (!healthDash) return;

    // Calculate center position
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;
    const dashWidth = healthDash.offsetWidth;
    const dashHeight = healthDash.offsetHeight;

    const centerX = (windowWidth - dashWidth) / 2;
    const centerY = (windowHeight - dashHeight) / 2;

    // Apply centered position
    healthDash.style.setProperty('left', centerX + 'px', 'important');
    healthDash.style.setProperty('top', centerY + 'px', 'important');
    healthDash.style.setProperty('bottom', 'auto', 'important');
    healthDash.style.setProperty('right', 'auto', 'important');

    // Save the new position
    healthDashboardPosition = {
        x: centerX,
        y: centerY
    };
    localStorage.setItem('healthDashboardPosition', JSON.stringify(healthDashboardPosition));

    showNotification("Health Dashboard Centered (Opt+J)");
}

document.addEventListener('mousedown', (e) => {
    const inspector = document.getElementById('inspector');
    if (inspector && !inspector.classList.contains('hidden')) {
        if (inspector.contains(e.target) ||
            e.target.closest('.node') ||
            e.target.closest('.node-timer-control') ||
            e.target.closest('#selection-menu')) {
            return;
        }
        deselectNode();
    }
});
