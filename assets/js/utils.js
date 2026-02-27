// =============================================================================
// SHARED UTILITIES
// Canonical, deduplicated helpers used across the entire application.
// This file must be loaded BEFORE all other app JS files (except db.js).
// =============================================================================

// --- HTML / TEXT ---

/**
 * Escape HTML special characters to prevent XSS.
 * @param {string} text
 * @returns {string}
 */
function escapeHtml(text) {
    return String(text || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/**
 * Convert raw URLs in text into clickable anchor tags.
 * Supports http, https, ftp, file, obsidian, notion, and vscode protocols.
 * @param {string} text
 * @returns {string}
 */
function linkify(text) {
    if (!text) return '';
    const urlRegex = /(\b(https?|ftp|file|obsidian|notion|vscode):\/\/[-A-Z0-9+&@#\/%?=~_|!:,.;]*[-A-Z0-9+&@#\/%=~_|])/ig;
    return text.replace(urlRegex, function (url) {
        return `<a href="${url}" target="_blank" rel="noopener noreferrer" style="color: var(--accent); text-decoration: underline;" onclick="event.stopPropagation()">${url}</a>`;
    });
}

/**
 * Extract the first URL from a string, or null if none found.
 * @param {string} text
 * @returns {string|null}
 */
function extractLink(text) {
    if (!text) return null;
    const match = text.match(/(\b(https?|ftp|file|obsidian):\/\/[-A-Z0-9+&@#\/%?=~_|!:,.;]*[-A-Z0-9+&@#\/%=~_|])/i);
    return match ? match[0] : null;
}

// --- DATE ---

/**
 * Return an ISO-style local date string (YYYY-MM-DD) for the given Date.
 * @param {Date} [date]
 * @returns {string}
 */
function getLocalDateString(date = new Date()) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

// --- DOM ---

/**
 * Safe wrapper around getElementById that logs a warning when the element is
 * missing.  Prevents silent null-reference failures downstream.
 * @param {string} id
 * @returns {HTMLElement|null}
 */
function safeGetElement(id) {
    const el = document.getElementById(id);
    if (!el) {
        console.warn(`[safeGetElement] Element "#${id}" not found in DOM.`);
    }
    return el;
}

/**
 * Auto-resize a <textarea> to fit its content.
 * @param {HTMLTextAreaElement} textarea
 */
function autoResizeTextarea(textarea) {
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = textarea.scrollHeight + 'px';
}

// --- NOTE LINK METRICS ---

function resolveNoteReference(noteOrId) {
    if (!noteOrId) return null;
    if (typeof noteOrId === 'object') return noteOrId;
    const noteId = String(noteOrId);
    if (!Array.isArray(notes)) return null;
    return notes.find(n => n && n.id === noteId) || null;
}

function getNoteLinkMetrics(noteOrId) {
    const empty = {
        noteId: null,
        taskIds: [],
        taskCount: 0,
        habitIds: [],
        habitCount: 0,
        goalIds: [],
        goalCount: 0,
        urgentTaskCount: 0,
        hasTaskLinks: false,
        hasHabitLinks: false,
        hasAnyLinks: false,
        isMixedLinks: false
    };

    const note = resolveNoteReference(noteOrId);
    if (!note) return empty;

    const activeTasks = Array.isArray(nodes) ? nodes : [];
    const archivedTasks = Array.isArray(archivedNodes) ? archivedNodes : [];
    const activeTaskMap = new Map(activeTasks.map(task => [task.id, task]));
    const archivedTaskMap = new Map(archivedTasks.map(task => [task.id, task]));

    const rawTaskIds = Array.isArray(note.taskIds) ? note.taskIds : [];
    const taskIds = Array.from(new Set(rawTaskIds.filter(Boolean)))
        .filter(taskId => activeTaskMap.has(taskId) || archivedTaskMap.has(taskId));

    const linkedActiveTasks = taskIds
        .map(taskId => activeTaskMap.get(taskId))
        .filter(Boolean);

    const urgentTaskCount = linkedActiveTasks.filter(task =>
        !task.completed && !!task._isUrgent
    ).length;

    const goalIds = Array.from(new Set(
        taskIds.flatMap(taskId => {
            const task = activeTaskMap.get(taskId) || archivedTaskMap.get(taskId);
            return (task && Array.isArray(task.goalIds)) ? task.goalIds.filter(Boolean) : [];
        })
    ));

    const habitsList = Array.isArray(habits) ? habits : [];
    const habitIds = Array.from(new Set(
        habitsList
            .filter(habit => {
                if (!habit || !habit.id) return false;
                if (typeof isHabitArchived === 'function' && isHabitArchived(habit)) return false;
                return Array.isArray(habit.noteIds) && habit.noteIds.includes(note.id);
            })
            .map(habit => habit.id)
    ));

    const hasTaskLinks = taskIds.length > 0;
    const hasHabitLinks = habitIds.length > 0;

    return {
        noteId: note.id,
        taskIds: taskIds,
        taskCount: taskIds.length,
        habitIds: habitIds,
        habitCount: habitIds.length,
        goalIds: goalIds,
        goalCount: goalIds.length,
        urgentTaskCount: urgentTaskCount,
        hasTaskLinks: hasTaskLinks,
        hasHabitLinks: hasHabitLinks,
        hasAnyLinks: hasTaskLinks || hasHabitLinks,
        isMixedLinks: hasTaskLinks && hasHabitLinks
    };
}

// --- NOTIFICATIONS ---

/**
 * Show a brief toast notification at the bottom of the screen.
 * @param {string} msg  Text to display (defaults to "State Saved").
 */
function showNotification(msg) {
    const n = document.getElementById('notification');
    if (n) {
        n.innerText = msg || "State Saved";
        n.style.opacity = '1';
        setTimeout(() => n.style.opacity = '0', 1500);
    } else {
        console.log("Notification:", msg);
    }

    const statusInd = document.getElementById('status-indicator');
    if (!msg && statusInd) {
        statusInd.innerText = "Saved " + new Date().toLocaleTimeString();
    }
}

// --- GOAL HELPERS ---

/**
 * Flatten all goals across all years into a single array.
 * Each item: { year, goal, depth }.
 * Optional filters: { minYear, maxYear, includeSubgoals }.
 * @returns {Array<{year: string, goal: object, depth: number}>}
 */
function getAllGoalsFlat(options = {}) {
    const safeOptions = (options && typeof options === 'object') ? options : {};
    const parsedMinYear = Number(safeOptions.minYear);
    const parsedMaxYear = Number(safeOptions.maxYear);
    const minYear = Number.isFinite(parsedMinYear) ? parsedMinYear : Number.NEGATIVE_INFINITY;
    const maxYear = Number.isFinite(parsedMaxYear) ? parsedMaxYear : Number.POSITIVE_INFINITY;
    const includeSubgoals = safeOptions.includeSubgoals !== false;

    const all = [];
    const goalsSource = (typeof lifeGoals !== 'undefined') ? lifeGoals : {};
    const years = Object.keys(goalsSource)
        .map((yearKey) => ({
            key: String(yearKey || ''),
            year: Number(yearKey)
        }))
        .filter(item => Number.isFinite(item.year) && item.year >= minYear && item.year <= maxYear)
        .sort((a, b) => a.year - b.year);

    years.forEach((yearItem) => {
        const yearKey = yearItem.key;
        const flatten = (list, depth = 0) => {
            (list || []).forEach(goal => {
                all.push({ year: yearKey, goal: goal, depth: depth });
                if (includeSubgoals && goal.children && goal.children.length > 0) flatten(goal.children, depth + 1);
            });
        };
        flatten(goalsSource[yearKey] || []);
    });
    return all;
}

/**
 * Flatten only goals that can be newly linked from dropdowns:
 * present year and any future years, preserving panel order.
 * Each item: { year, goal, depth }.
 * @returns {Array<{year: string, goal: object, depth: number}>}
 */
function getLinkableGoalsFlat(options = {}) {
    const safeOptions = (options && typeof options === 'object') ? options : {};
    const presentYear = new Date().getFullYear();
    return getAllGoalsFlat({
        minYear: presentYear,
        includeSubgoals: safeOptions.includeSubgoals !== false
    });
}

/**
 * Find a goal's display text by its ID. Searches across all years.
 * @param {string} goalId
 * @returns {string}
 */
function getGoalTextById(goalId) {
    if (!goalId) return '';
    const allGoals = getAllGoalsFlat();
    const found = allGoals.find(item => item.goal.id === goalId);
    return found ? found.goal.text : '';
}

/**
 * Recursively collect a goal ID and all its descendant IDs.
 * Used for goal-based filtering of tasks.
 * @param {Array} goalList - List of goal objects for a given year.
 * @param {string} targetId - The root goal ID to start from.
 * @returns {string[]} Array of goal IDs.
 */
function getAllGoalIds(goalList, targetId) {
    let result = [targetId];
    const findGoal = (list, id) => {
        for (const goal of list) {
            if (goal.id === id) {
                const addChildren = (g) => {
                    result.push(g.id);
                    if (g.children && g.children.length > 0) {
                        g.children.forEach(addChildren);
                    }
                };
                addChildren(goal);
                return true;
            }
            if (goal.children && goal.children.length > 0) {
                if (findGoal(goal.children, id)) return true;
            }
        }
        return false;
    };
    findGoal(goalList, targetId);
    return result;
}

/**
 * Find a goal's display name by ID (searching all years).
 * Returns 'Unknown Goal' if not found.
 * @param {string} goalId
 * @returns {string}
 */
function findGoalName(goalId) {
    const text = getGoalTextById(goalId);
    return text || 'Unknown Goal';
}

/**
 * Build a breadcrumb path string for the given goal ID.
 * E.g. "Top Goal → Sub Goal → Target Goal"
 * @param {string} goalId
 * @returns {string|null}
 */
function getGoalPath(goalId) {
    const goalsSource = (typeof lifeGoals !== 'undefined') ? lifeGoals : {};
    const buildPath = (list, targetId, path = []) => {
        for (const g of list) {
            if (g.id === targetId) {
                return [...path, g.text].join(' → ');
            }
            if (g.children) {
                const result = buildPath(g.children, targetId, [...path, g.text]);
                if (result) return result;
            }
        }
        return null;
    };

    for (const year in goalsSource) {
        const result = buildPath(goalsSource[year], goalId);
        if (result) return result;
    }
    return null;
}

/**
 * Inherit parent task goal IDs into child task.
 * Accepts either task objects or task IDs.
 * @param {object|string} parentTaskOrId
 * @param {object|string} childTaskOrId
 * @returns {boolean} true when child goalIds changed
 */
function inheritTaskGoalsFromParent(parentTaskOrId, childTaskOrId) {
    const resolveTask = (taskOrId) => {
        if (!taskOrId) return null;
        if (typeof taskOrId === 'object') return taskOrId;
        if (typeof taskOrId !== 'string') return null;
        const activeTask = Array.isArray(nodes) ? nodes.find(n => n.id === taskOrId) : null;
        if (activeTask) return activeTask;
        return Array.isArray(archivedNodes) ? archivedNodes.find(n => n.id === taskOrId) || null : null;
    };

    const parentTask = resolveTask(parentTaskOrId);
    const childTask = resolveTask(childTaskOrId);
    if (!parentTask || !childTask || parentTask.id === childTask.id) return false;

    const parentGoalIds = Array.isArray(parentTask.goalIds)
        ? parentTask.goalIds.filter(Boolean)
        : [];
    if (parentGoalIds.length === 0) return false;

    const currentChildGoalIds = Array.isArray(childTask.goalIds)
        ? childTask.goalIds.filter(Boolean)
        : [];
    const mergedGoalIds = Array.from(new Set([...currentChildGoalIds, ...parentGoalIds]));

    const unchanged = mergedGoalIds.length === currentChildGoalIds.length
        && mergedGoalIds.every((id, index) => id === currentChildGoalIds[index]);
    if (unchanged) return false;

    childTask.goalIds = mergedGoalIds;
    return true;
}

const GOAL_COLOR_FALLBACK_PALETTE = [
    '#ef4444',
    '#f97316',
    '#f59e0b',
    '#eac54f',
    '#84cc16',
    '#22c55e',
    '#10b981',
    '#14b8a6',
    '#06b6d4',
    '#0ea5e9',
    '#3b82f6',
    '#6366f1',
    '#8b5cf6',
    '#a855f7',
    '#d946ef',
    '#ec4899',
    '#f43f5e'
];

function normalizeGoalHexColor(value) {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    if (!/^#?[0-9a-fA-F]{6}$/.test(trimmed)) return null;
    return trimmed.startsWith('#')
        ? trimmed.toLowerCase()
        : `#${trimmed.toLowerCase()}`;
}

function goalHexToRgb(hexColor) {
    const normalized = normalizeGoalHexColor(hexColor);
    if (!normalized) return null;
    const cleanHex = normalized.slice(1);
    return {
        r: parseInt(cleanHex.slice(0, 2), 16),
        g: parseInt(cleanHex.slice(2, 4), 16),
        b: parseInt(cleanHex.slice(4, 6), 16)
    };
}

function goalHexToRgbString(hexColor) {
    const rgb = goalHexToRgb(hexColor);
    if (!rgb) return '255, 255, 255';
    return `${rgb.r}, ${rgb.g}, ${rgb.b}`;
}

function getGoalPaletteHexColor(index) {
    const runtimePalette = (typeof GOAL_EDGE_PALETTE !== 'undefined' && Array.isArray(GOAL_EDGE_PALETTE))
        ? GOAL_EDGE_PALETTE
        : GOAL_COLOR_FALLBACK_PALETTE;

    const normalized = runtimePalette
        .map(normalizeGoalHexColor)
        .filter(Boolean);
    const palette = normalized.length > 0 ? normalized : GOAL_COLOR_FALLBACK_PALETTE;
    const safeIndex = Number.isFinite(Number(index)) ? Math.max(0, Number(index)) : 0;
    return palette[safeIndex % palette.length];
}

function resolveGoalBranchColorHex(goal, rootIndex, inheritedColor = null) {
    if (inheritedColor) return inheritedColor;
    const customColor = normalizeGoalHexColor(goal && goal.color);
    if (customColor) return customColor;
    return getGoalPaletteHexColor(rootIndex);
}

function getGoalColorHexById(goalId) {
    if (!goalId) return null;

    const goalsSource = (typeof lifeGoals !== 'undefined') ? lifeGoals : {};
    const years = Object.keys(goalsSource).sort((a, b) => Number(a) - Number(b));

    for (const year of years) {
        const roots = Array.isArray(goalsSource[year]) ? goalsSource[year] : [];
        for (let rootIndex = 0; rootIndex < roots.length; rootIndex++) {
            const search = (goal, inheritedColor = null) => {
                const branchColor = resolveGoalBranchColorHex(goal, rootIndex, inheritedColor);
                if (goal && goal.id === goalId) return branchColor;
                const children = Array.isArray(goal && goal.children) ? goal.children : [];
                for (const child of children) {
                    const found = search(child, branchColor);
                    if (found) return found;
                }
                return null;
            };
            const foundColor = search(roots[rootIndex], null);
            if (foundColor) return foundColor;
        }
    }
    return null;
}

function getGoalThemeById(goalId) {
    const hex = getGoalColorHexById(goalId);
    const rgbObj = goalHexToRgb(hex);
    if (!hex || !rgbObj) return null;

    const rgb = `${rgbObj.r}, ${rgbObj.g}, ${rgbObj.b}`;

    return {
        hex: hex,
        rgb: rgb,
        // Linked goal boxes fade into a dark surface, so light text is more reliable than YIQ-based toggling.
        text: '#f8fafc',
        subtleText: 'rgba(248, 250, 252, 0.78)',
        gradient: `linear-gradient(90deg, rgba(${rgb}, 0.14) 0%, rgba(${rgb}, 0.05) 40%, rgba(26, 27, 26, 0.97) 100%)`,
        border: `rgba(${rgb}, 0.4)`
    };
}

function getGoalColorBoxInlineStyle(goalId) {
    const theme = getGoalThemeById(goalId);
    if (!theme) return '';
    return [
        'background-color:#1a1b1a',
        `background-image:${theme.gradient}`,
        `color:${theme.text}`,
        'text-shadow:0 1px 1px rgba(0, 0, 0, 0.55)',
        'border:1px solid rgba(255, 255, 255, 0.08)',
        `border-left:3px solid rgb(${theme.rgb})`,
        `box-shadow:inset 0 0 0 1px rgba(0, 0, 0, 0.08), inset 2px 0 10px rgba(${theme.rgb}, 0.12)`
    ].join(';') + ';';
}

function getGoalSubtleTextInlineStyle(goalId) {
    const theme = getGoalThemeById(goalId);
    if (!theme) return '';
    return `color:${theme.subtleText};`;
}

function resolveTaskReference(taskOrId) {
    if (!taskOrId) return null;
    if (typeof taskOrId === 'object') return taskOrId;
    const taskId = String(taskOrId);
    const activeTask = Array.isArray(nodes) ? nodes.find(n => n.id === taskId) : null;
    if (activeTask) return activeTask;
    return Array.isArray(archivedNodes) ? archivedNodes.find(n => n.id === taskId) : null;
}

function getTaskTheme(taskOrId) {
    const task = resolveTaskReference(taskOrId);
    if (!task) return null;

    const isCompleted = !!task.completed;
    const isUrgent = !isCompleted && !!task._isUrgent;
    const isCritical = !isCompleted && !isUrgent && !!task._isCritical;
    const isBlocked = !isCompleted && !!task._isBlocked;

    let theme = {
        background: 'linear-gradient(145deg, #1b2432, #161f2b)',
        border: '#334155',
        borderStyle: 'solid',
        text: '#e2e8f0',
        subtleText: 'rgba(148, 163, 184, 0.82)',
        boxShadow: '0 1px 2px rgba(0, 0, 0, 0.28), inset 0 0 0 1px rgba(255, 255, 255, 0.03)'
    };

    if (isCompleted) {
        theme = {
            background: 'linear-gradient(145deg, #1b2f27, #162720)',
            border: '#4d7f6b',
            borderStyle: 'solid',
            text: '#d7efe5',
            subtleText: 'rgba(170, 206, 190, 0.82)',
            boxShadow: '0 0 10px rgba(77, 127, 107, 0.2), inset 0 0 0 1px rgba(77, 127, 107, 0.16)'
        };
    } else if (isUrgent) {
        theme = {
            background: 'linear-gradient(145deg, #2a2027, #211a20)',
            border: '#c77088',
            borderStyle: 'solid',
            text: '#f6e8ed',
            subtleText: 'rgba(225, 197, 206, 0.82)',
            boxShadow: '0 0 12px rgba(199, 112, 136, 0.2), inset 0 0 0 1px rgba(199, 112, 136, 0.14)'
        };
    } else if (isCritical) {
        theme = {
            background: 'linear-gradient(145deg, #2a261f, #221f1a)',
            border: '#b99a67',
            borderStyle: 'solid',
            text: '#f1e5d3',
            subtleText: 'rgba(216, 196, 164, 0.8)',
            boxShadow: '0 0 10px rgba(185, 154, 103, 0.18), inset 0 0 0 1px rgba(185, 154, 103, 0.12)'
        };
    }

    if (isBlocked) {
        theme.border = '#6e7c90';
        theme.borderStyle = 'dashed';
        theme.boxShadow = `${theme.boxShadow}, inset 0 0 0 1px rgba(255, 255, 255, 0.04)`;
    }

    return theme;
}

function getTaskColorBoxInlineStyle(taskOrId) {
    const theme = getTaskTheme(taskOrId);
    if (!theme) return '';
    return [
        `background:${theme.background}`,
        `color:${theme.text}`,
        `border:1px ${theme.borderStyle} ${theme.border}`,
        `box-shadow:${theme.boxShadow}`,
        'text-shadow:0 1px 1px rgba(0, 0, 0, 0.5)'
    ].join(';') + ';';
}

function getTaskSubtleTextInlineStyle(taskOrId) {
    const theme = getTaskTheme(taskOrId);
    if (!theme) return '';
    return `color:${theme.subtleText};`;
}
