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
 * @returns {Array<{year: string, goal: object, depth: number}>}
 */
function getAllGoalsFlat() {
    const all = [];
    const goalsSource = (typeof lifeGoals !== 'undefined') ? lifeGoals : {};
    const years = Object.keys(goalsSource).sort((a, b) => Number(a) - Number(b));
    years.forEach(year => {
        const flatten = (list, depth = 0) => {
            (list || []).forEach(goal => {
                all.push({ year: year, goal: goal, depth: depth });
                if (goal.children && goal.children.length > 0) flatten(goal.children, depth + 1);
            });
        };
        flatten(goalsSource[year] || []);
    });
    return all;
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
