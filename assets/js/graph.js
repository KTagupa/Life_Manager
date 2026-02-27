// --- TIMELINE / GANTT HYBRID LAYOUT ---
function getEffectiveUrgencyModeForLayout() {
    const cfg = (typeof aiUrgencyConfig !== 'undefined' && aiUrgencyConfig && typeof aiUrgencyConfig === 'object')
        ? aiUrgencyConfig
        : ((window.aiUrgencyConfig && typeof window.aiUrgencyConfig === 'object') ? window.aiUrgencyConfig : {});
    const mode = String(cfg.mode || '').trim().toLowerCase();
    if (mode === 'ai') return 'ai';
    if (mode === 'blended') return 'blended';
    return 'system';
}

function autoArrangeGraph() {
    if (isUltraEcoMode) {
        alert("⚡ Ultra Eco Mode is active. Switch to Turbo or Eco mode to rearrange the graph.");
        return;
    }
    if (!confirm("Run Smart Declutter? (Groups dependencies, handles branching/merging nodes, and organizes terminal tasks)")) return;

    // 1. Setup & Safety
    updateCalculations();
    if (typeof computeDependencyAwareTaskLayout !== 'function') {
        if (typeof showNotification === 'function') {
            showNotification("Layout utility unavailable. Reload the app and try again.");
        }
        return;
    }

    const urgencyMode = getEffectiveUrgencyModeForLayout();
    const layout = computeDependencyAwareTaskLayout(nodes, {
        activeStartX: 400,
        startY: 100,
        colGap: 280,
        rowGap: 180,
        componentGap: 120,
        timeScale: 15,
        nodeWidth: 200,
        nodeHeight: 124,
        completedPredecessorRank: -1,
        completedTerminalRank: -2,
        urgencyMode
    });

    const positions = layout && layout.positions ? layout.positions : {};
    nodes.forEach((node) => {
        if (!node || !node.id) return;
        const nodeId = String(node.id).trim();
        const pos = positions[nodeId];
        if (!pos) return;
        node.x = pos.x;
        node.y = pos.y;
    });

    render();
    saveToStorage();
    fitView();
    showNotification(`Logic-driven Smart Layout Applied (${urgencyMode.toUpperCase()} urgency)`);
}


function cleanAppMemory() {
    // 1. Clear the Chat History UI (The "heavy" part of the AI panel)
    const history = document.getElementById('ai-chat-history');
    if (history) {
        history.innerHTML = '<div class="ai-msg bot">Memory Cleaned. Chat history cleared to save CPU.</div>';
    }

    // 2. Clear Selection State
    selectedIds.clear();
    selectedNodeId = null;

    // 3. Force a complete re-draw of the SVG layer
    // This clears "ghost" coordinates from the browser's GPU cache
    const svg = document.getElementById('connections');
    const nodesLayer = document.getElementById('nodes-layer');
    if (svg) svg.innerHTML = '';
    if (nodesLayer) nodesLayer.innerHTML = '';

    // 4. Trigger the browser's internal cleanup
    render();

    showNotification("🧹 System Memory Flushed");
}

function cycleEcoMode() {
    // Cycle through: Turbo -> Eco -> Ultra Eco -> Turbo
    ecoModeLevel = (ecoModeLevel + 1) % 3;
    applyEcoMode();
}

function applyEcoMode() {
    const statusEl = document.getElementById('eco-status');
    const btnEl = document.getElementById('eco-toggle-btn');

    // Remove all eco classes first
    document.body.classList.remove('eco-mode', 'ultra-eco-mode');

    if (ecoModeLevel === 0) {
        // TURBO MODE
        isEcoMode = false;
        isUltraEcoMode = false;

        if (statusEl) statusEl.innerText = "Turbo";
        if (btnEl) {
            btnEl.style.borderColor = "";
            btnEl.style.color = "";
        }

        // Resume timers
        if (window.timerInterval) clearInterval(window.timerInterval);
        window.timerInterval = setInterval(tickTimers, 1000);

        showNotification("Turbo Mode Active");
        redZoneStartTime = null;

    } else if (ecoModeLevel === 1) {
        // ECO MODE
        isEcoMode = true;
        isUltraEcoMode = false;
        document.body.classList.add('eco-mode');

        if (statusEl) statusEl.innerText = "Eco";
        if (btnEl) {
            btnEl.style.borderColor = "#10b981";
            btnEl.style.color = "#10b981";
        }

        // Keep timers running in Eco
        if (window.timerInterval) clearInterval(window.timerInterval);
        window.timerInterval = setInterval(tickTimers, 1000);

        showNotification("Eco Mode Active");

    } else if (ecoModeLevel === 2) {
        // ULTRA ECO MODE
        isEcoMode = true;
        isUltraEcoMode = true;
        document.body.classList.add('ultra-eco-mode');

        if (statusEl) statusEl.innerText = "Ultra Eco";
        if (btnEl) {
            btnEl.style.borderColor = "#eab308";
            btnEl.style.color = "#eab308";
        }

        // STOP TIMERS (freeze all live updates)
        if (window.timerInterval) {
            clearInterval(window.timerInterval);
            window.timerInterval = null;
        }

        // Close all panels
        closeAllSidePanels();

        // Hide inspector
        document.getElementById('inspector').classList.add('hidden');

        showNotification("⚡ Ultra Eco Mode - View Only");
    }

    const settingsEcoStatus = document.getElementById('settings-eco-status');
    if (settingsEcoStatus && statusEl) settingsEcoStatus.innerText = statusEl.innerText;
    if (btnEl && statusEl) {
        const modeLabel = statusEl.innerText || "Turbo";
        const tooltip = `Cycle Engine Mode (Optn+E) · ${modeLabel}`;
        btnEl.setAttribute('data-tooltip', tooltip);
        btnEl.setAttribute('aria-label', tooltip);
    }

    render();
}

// Legacy function for backward compatibility
function toggleEcoMode(force = null) {
    if (force === true) {
        ecoModeLevel = 1;
    } else if (force === false) {
        ecoModeLevel = 0;
    } else {
        ecoModeLevel = (ecoModeLevel + 1) % 3;
    }
    applyEcoMode();
}


// --- LOGIC ENGINE ---
function parseLocalDateInput(dateStr) {
    if (!dateStr) return null;
    const normalized = String(dateStr).trim();
    if (!normalized) return null;

    const localMatch = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (localMatch) {
        const year = Number(localMatch[1]);
        const month = Number(localMatch[2]) - 1;
        const day = Number(localMatch[3]);
        return new Date(year, month, day, 0, 0, 0, 0);
    }

    const parsed = new Date(normalized);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed;
}

function getDaysFromToday(dateStr) {
    const due = parseLocalDateInput(dateStr);
    if (!due) return Infinity;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    due.setHours(0, 0, 0, 0);
    return Math.ceil((due - today) / (1000 * 60 * 60 * 24));
}

function calculateDuePressure(daysUntilDue) {
    if (!Number.isFinite(daysUntilDue)) return 0;
    if (daysUntilDue <= 0) return 100;
    if (daysUntilDue <= 1) return 90;
    if (daysUntilDue <= 3) return 80 - ((daysUntilDue - 1) * 10);
    if (daysUntilDue <= 7) return 60 - ((daysUntilDue - 3) * 8);
    if (daysUntilDue <= 14) return 28 - ((daysUntilDue - 7) * 4);
    return 0;
}

function calculateSlackPressure(slackDays) {
    if (!Number.isFinite(slackDays)) return 0;
    if (slackDays <= 0) return 100;
    if (slackDays <= 1) return 85;
    if (slackDays <= 3) return 70 - ((slackDays - 1) * 15);
    if (slackDays <= 7) return 40 - ((slackDays - 3) * 7);
    return 0;
}

function clampUrgencyScore(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return 0;
    if (n < 0) return 0;
    if (n > 100) return 100;
    return Math.round(n);
}
function updateCalculations() {
    // --- CIRCULAR DEPENDENCY CHECK ---
    const detectCycles = () => {
        const visited = new Set();
        const recursionStack = new Set();

        const hasCycle = (nodeId, path = []) => {
            if (recursionStack.has(nodeId)) {
                // Found cycle - return the path to show user
                const cycleStart = path.indexOf(nodeId);
                return path.slice(cycleStart).concat([nodeId]);
            }
            if (visited.has(nodeId)) return false;

            visited.add(nodeId);
            recursionStack.add(nodeId);
            path.push(nodeId);

            const node = nodes.find(n => n.id === nodeId);
            if (node) {
                for (const dep of node.dependencies) {
                    if (dep.type === 'hard') {
                        const cycle = hasCycle(dep.id, [...path]);
                        if (cycle) return cycle;
                    }
                }
            }

            recursionStack.delete(nodeId);
            return false;
        };

        // Check all nodes
        for (const node of nodes) {
            if (!visited.has(node.id)) {
                const cycle = hasCycle(node.id);
                if (cycle) return cycle;
            }
        }
        return false;
    };

    const cycle = detectCycles();
    if (cycle) {
        const cycleNames = cycle.map(id => {
            const n = nodes.find(x => x.id === id);
            return n ? n.title : id;
        }).join(' → ');

        showNotification(`⚠️ Circular dependency detected: ${cycleNames}. Please fix this.`);

        // Highlight problematic nodes in red
        cycle.forEach((id, idx) => {
            if (idx < cycle.length - 1) { // Don't duplicate the join node
                const node = nodes.find(n => n.id === id);
                if (node) node._hasCycleError = true;
            }
        });
    } else {
        nodes.forEach(n => delete n._hasCycleError);
    }

    // Reset calculations (original code continues but cleaner)
    nodes.forEach(n => {
        n._isBlocked = false;
        n._isReady = false;
        n._isCritical = false;
        n._isUrgent = false;
        n._isManualUrgentPath = false;
        n._urgencyScore = 0;
        n._downstreamWeight = 0;
        n._earliestStart = 0;
        n._earliestFinish = 0;
        n._latestFinish = Infinity;
        n._slack = 0;
    });
    nodes.forEach(n => { if (n.completed) return; const hardParents = n.dependencies.filter(d => d.type === 'hard').map(d => nodes.find(p => p.id === d.id)).filter(p => p); if (hardParents.length === 0) n._isReady = true; else { const allDone = hardParents.every(p => p.completed); n._isBlocked = !allDone; n._isReady = allDone; } });
    const getDescendants = (id, visited = new Set()) => { let count = 0; nodes.forEach(n => { if (n.dependencies.some(d => d.id === id) && !visited.has(n.id)) { visited.add(n.id); count += 1 + getDescendants(n.id, visited); } }); return count; };
    nodes.forEach(n => { n._downstreamWeight = getDescendants(n.id); });
    let changed = true; let iterations = 0;
    while (changed && iterations < nodes.length + 2) { changed = false; nodes.forEach(n => { let maxPrevEF = 0; n.dependencies.filter(d => d.type === 'hard').forEach(dep => { const parent = nodes.find(p => p.id === dep.id); if (parent && parent._earliestFinish > maxPrevEF) maxPrevEF = parent._earliestFinish; }); const effDuration = n.completed ? 0 : (n.duration || 1); const newES = maxPrevEF; const newEF = newES + effDuration; if (n._earliestStart !== newES || n._earliestFinish !== newEF) { n._earliestStart = newES; n._earliestFinish = newEF; changed = true; } }); iterations++; }
    const projectDuration = Math.max(...nodes.map(n => n._earliestFinish), 0);
    changed = true; iterations = 0; nodes.forEach(n => n._latestFinish = Infinity);
    while (changed && iterations < nodes.length + 2) { changed = false; nodes.forEach(n => { const children = nodes.filter(c => c.dependencies.some(d => d.id === n.id && d.type === 'hard')); let derivedLF = Infinity; if (children.length === 0) derivedLF = projectDuration; else { const minChildLS = Math.min(...children.map(c => { const cDur = c.completed ? 0 : (c.duration || 1); return c._latestFinish - cDur; })); derivedLF = minChildLS; } if (n.dueDate) { const daysUntilDue = getDaysFromToday(n.dueDate); if (daysUntilDue < derivedLF) derivedLF = daysUntilDue; } if (n._latestFinish !== derivedLF) { n._latestFinish = derivedLF; changed = true; } }); iterations++; }
    const propagateUrgency = (id) => { const children = nodes.filter(c => c.dependencies.some(d => d.id === id && d.type === 'hard')); children.forEach(child => { if (!child._isManualUrgentPath) { child._isManualUrgentPath = true; propagateUrgency(child.id); } }); };
    nodes.forEach(n => { if (n.isManualUrgent) { n._isManualUrgentPath = true; propagateUrgency(n.id); } });
    nodes.forEach(n => {
        const slack = n._latestFinish - n._earliestFinish;
        n._slack = Number.isFinite(slack) ? slack : Infinity;

        if (n.completed) {
            n._urgencyScore = 0;
            n._isCritical = false;
            n._isUrgent = false;
            return;
        }

        const daysUntilDue = getDaysFromToday(n.dueDate);
        const duePressure = calculateDuePressure(daysUntilDue);
        const slackPressure = calculateSlackPressure(n._slack);
        const impactPressure = Math.min(100, (Math.max(0, Number(n._downstreamWeight) || 0) * 12));
        const blockagePressure = n._isBlocked ? 100 : 0;
        const manualPathBonus = n._isManualUrgentPath ? 20 : 0;

        const baseScore =
            (0.45 * duePressure) +
            (0.35 * slackPressure) +
            (0.15 * impactPressure) +
            (0.05 * blockagePressure) +
            manualPathBonus;

        let urgencyScore = clampUrgencyScore(baseScore);

        if (n.isManualUrgent) {
            urgencyScore = 100;
        } else if (n.isManualNotUrgent) {
            urgencyScore = Math.min(urgencyScore, 35);
        }

        n._urgencyScore = urgencyScore;

        if (n.isManualNotUrgent) {
            n._isUrgent = false;
            n._isCritical = false;
            return;
        }

        n._isUrgent = urgencyScore >= 70;
        n._isCritical = urgencyScore >= 85 || n._slack <= 0;
    });

    if (typeof recomputeAiUrgency === 'function') {
        try {
            recomputeAiUrgency({ scope: 'all' });
        } catch (error) {
            console.warn('[ai-urgency] Recompute failed:', error);
        }
    }
}

function getTotalTime(node) {
    if (!node) return 0;

    // 1. Sum up all completed sessions
    let total = (node.timeLogs || []).reduce((acc, log) => {
        return acc + (Number(log.duration) || 0);
    }, 0);

    // 2. Add current active session if it exists
    if (node.activeTimerStart) {
        const start = Number(node.activeTimerStart);
        const now = Date.now();
        if (now > start) {
            total += (now - start);
        }
    }

    return total;
}
function formatTime(ms) {
    const seconds = Math.floor((ms / 1000) % 60); const minutes = Math.floor((ms / (1000 * 60)) % 60); const hours = Math.floor(ms / (1000 * 60 * 60));
    if (hours > 0) return `${hours}h ${minutes}m`; if (minutes > 0) return `${minutes}m ${seconds}s`; return `${seconds}s`;
}

function makeElementDraggable(el, handle) {
    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
    handle.onmousedown = dragMouseDown;

    function dragMouseDown(e) {
        if (e.target.tagName === 'BUTTON') return; // Don't drag if clicking buttons
        e.preventDefault();
        pos3 = e.clientX;
        pos4 = e.clientY;
        document.onmouseup = closeDragElement;
        document.onmousemove = elementDrag;
    }

    function elementDrag(e) {
        e.preventDefault();
        pos1 = pos3 - e.clientX;
        pos2 = pos4 - e.clientY;
        pos3 = e.clientX;
        pos4 = e.clientY;
        el.style.top = (el.offsetTop - pos2) + "px";
        el.style.left = (el.offsetLeft - pos1) + "px";
        el.style.bottom = 'auto'; // Break the fixed bottom/left positioning
        el.style.right = 'auto';
    }

    function closeDragElement() {
        document.onmouseup = null;
        document.onmousemove = null;
    }
}

function toggleTimer(id = null) {
    const targetId = id || selectedNodeId;
    if (!targetId) return;
    const node = nodes.find(n => n.id === targetId);
    if (!node) return;

    if (node.activeTimerStart) {
        // STOPPING
        const now = Date.now();
        const dur = now - node.activeTimerStart;
        node.timeLogs.push({ start: node.activeTimerStart, end: now, duration: dur });
        node.activeTimerStart = null;
        playAudioFeedback('timer-stop'); // <--- SOUND
    } else {
        // STARTING
        node.activeTimerStart = Date.now();
        playAudioFeedback('timer-start'); // <--- SOUND
        handleCheckIn(null, targetId); // <--- Auto Check-in
    }
    saveToStorage();
    render();
    if (selectedNodeId === targetId) updateInspector();
}
window.handleNodeTimerClick = function (e, id) { e.stopPropagation(); toggleTimer(id); }

// --- RENDERING ---
function render() {
    try {
        const startRender = performance.now();
    
        const container = document.getElementById('nodes-layer');
        const svg = document.getElementById('connections');
    
        // --- CONDITIONAL VIRTUALIZATION ---
        window.visibleCount = 0;
        window.culledCount = 0;
    
        // Always clear for fresh render
        container.innerHTML = '';
        svg.innerHTML = '';
        window.fullRenderNeeded = true;
    
        window.lastRenderScale = scale;
        window.lastPanX = panX;
        window.lastPanY = panY;
    
        // --- VIEWPORT CULLING (Performance Optimization) ---
        // Virtualization removed per user request
        let viewportLeft, viewportTop, viewportRight, viewportBottom;
    
        // If full render, set up defs
        if (window.fullRenderNeeded) {
            const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
            defs.innerHTML = `<marker id=\"arrow\" markerWidth=\"10\" markerHeight=\"7\" refX=\"10\" refY=\"3.5\" orient=\"auto\"><polygon points=\"0 0, 10 3.5, 0 7\" fill=\"#666\"/></marker>`;
            svg.appendChild(defs);
        }
    
        let nodesToRender = nodes;
        const focusSnapshot = (typeof getTaskGroupFocusSnapshot === 'function')
            ? getTaskGroupFocusSnapshot({ refitOnMissing: true })
            : { groups: [], activeGroup: null, activeIndex: -1 };
    
        if (typeof updateTaskGroupFocusControls === 'function') {
            updateTaskGroupFocusControls(focusSnapshot);
        }
    
        if (typeof taskGroupFocusState !== 'undefined' && taskGroupFocusState.active && focusSnapshot.activeGroup) {
            const activeNodeIds = new Set(focusSnapshot.activeGroup.nodeIds || []);
            nodesToRender = nodes.filter(node => activeNodeIds.has(node.id));
        } else {
            const groups = (focusSnapshot && Array.isArray(focusSnapshot.groups))
                ? focusSnapshot.groups
                : (typeof buildTaskGroups === 'function')
                    ? buildTaskGroups({ includeSingles: true, sort: 'priority' })
                    : detectConnectedGroups();
            const hiddenNodeIds = new Set();
    
            groups.forEach(group => {
                if (hiddenNodeGroups.has(group.id)) {
                    group.nodes.forEach(node => hiddenNodeIds.add(node.id));
                }
            });
    
            nodesToRender = nodesToRender.filter(node => !hiddenNodeIds.has(node.id));
    
            // Filter nodes by goal if filter is active
            if (currentGoalFilter) {
                // getAllGoalIds is now in utils.js
                const goalIds = getAllGoalIds(lifeGoals[currentGoalYear] || [], currentGoalFilter);
                nodesToRender = nodesToRender.filter(n => n.goalIds && n.goalIds.some(gid => goalIds.includes(gid)));
            }
        }
    
        const nodesToRenderIds = new Set(nodesToRender.map(node => node.id));
    
        // Ensure arrow marker exists at the start
        const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
        defs.innerHTML = `<marker id="arrow" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto"><polygon points="0 0, 10 3.5, 0 7" fill="#666"/></marker>`;
        svg.appendChild(defs);
    
        // --- Render Connections (Lines) ---
        nodesToRender.forEach(node => {
            node.dependencies.forEach((dep, depIndex) => {
                const parent = nodes.find(n => n.id === dep.id);
                if (!parent) return;
    
    
    
                // Only show connection if both nodes are in the filtered set
                if (!nodesToRenderIds.has(parent.id)) return;
    
                const isCritical = node._isCritical && parent._isCritical && dep.type === 'hard' && !parent.completed;
                const isUrgentPath = node._isUrgent && parent._isUrgent;
    
                let color = '#666';
                if (dep.type === 'soft') color = 'var(--soft-dep-color)';
                if (isUrgentPath) color = '#c77088';
                else if (isCritical) color = 'var(--critical-path)';
    
                const width = (isCritical || isUrgentPath) ? 3 : 2;
    
                const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
                path.classList.add('connection-line');
                const startX = parent.x + 180 + 2;
                const startY = parent.y + 40;
                const endX = node.x - 2;
                const endY = node.y + 40;
    
                // --- Updated Eco Rendering ---
                let d;
                let midX;
                let midY;
                if (isEcoMode) {
                    // ECO: Straight Line + No Arrowheads = Minimum CPU usage
                    d = `M ${startX} ${startY} L ${endX} ${endY}`;
                    path.setAttribute('marker-end', '');
                    midX = (startX + endX) / 2;
                    midY = (startY + endY) / 2;
                } else {
                    // TURBO: Smooth Curves + Arrowheads
                    const c1x = startX + 50;
                    const c1y = startY;
                    const c2x = endX - 50;
                    const c2y = endY;
                    d = `M ${startX} ${startY} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${endX} ${endY}`;
                    path.setAttribute('marker-end', 'url(#arrow)');
                    // Cubic Bezier midpoint at t=0.5
                    midX = (startX + (3 * c1x) + (3 * c2x) + endX) / 8;
                    midY = (startY + (3 * c1y) + (3 * c2y) + endY) / 8;
                }
    
                path.setAttribute('d', d);
                path.setAttribute('stroke', color);
                path.setAttribute('stroke-width', width);
    
                if (dep.type === 'soft') path.classList.add('soft');
                if (isCritical || isUrgentPath) path.classList.add('critical');
                svg.appendChild(path);
    
                const hitPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
                hitPath.classList.add('connection-hit-area');
                hitPath.setAttribute('d', d);
                svg.appendChild(hitPath);
    
                const insertBtn = document.createElementNS("http://www.w3.org/2000/svg", "g");
                insertBtn.classList.add('connection-insert-btn');
                insertBtn.setAttribute('transform', `translate(${midX} ${midY})`);
    
                const insertBtnCircle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
                insertBtnCircle.setAttribute('cx', '0');
                insertBtnCircle.setAttribute('cy', '0');
                insertBtnCircle.setAttribute('r', '11');
    
                const plusLineH = document.createElementNS("http://www.w3.org/2000/svg", "line");
                plusLineH.setAttribute('x1', '-4');
                plusLineH.setAttribute('y1', '0');
                plusLineH.setAttribute('x2', '4');
                plusLineH.setAttribute('y2', '0');
    
                const plusLineV = document.createElementNS("http://www.w3.org/2000/svg", "line");
                plusLineV.setAttribute('x1', '0');
                plusLineV.setAttribute('y1', '-4');
                plusLineV.setAttribute('x2', '0');
                plusLineV.setAttribute('y2', '4');
    
                insertBtn.appendChild(insertBtnCircle);
                insertBtn.appendChild(plusLineH);
                insertBtn.appendChild(plusLineV);
                svg.appendChild(insertBtn);
    
                let hideInsertBtnTimeout = null;
                const showInsertBtn = () => {
                    if (hideInsertBtnTimeout) {
                        clearTimeout(hideInsertBtnTimeout);
                        hideInsertBtnTimeout = null;
                    }
                    insertBtn.classList.add('visible');
                };
                const hideInsertBtn = () => {
                    if (hideInsertBtnTimeout) clearTimeout(hideInsertBtnTimeout);
                    hideInsertBtnTimeout = setTimeout(() => {
                        insertBtn.classList.remove('visible');
                    }, 120);
                };
    
                hitPath.addEventListener('mouseenter', showInsertBtn);
                hitPath.addEventListener('mouseleave', hideInsertBtn);
                insertBtn.addEventListener('mouseenter', showInsertBtn);
                insertBtn.addEventListener('mouseleave', hideInsertBtn);
                insertBtn.addEventListener('mousedown', (e) => e.stopPropagation());
                insertBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    insertTaskBetweenDependency(node.id, depIndex);
                });
            });
        });
    
        // --- Nodes render follows ---
    
        // --- Render Nodes ---
        nodesToRender.forEach(node => {
    
            window.visibleCount++;
    
            const el = document.createElement('div');
            el.className = 'node';
            el.style.left = node.x + 'px';
            el.style.top = node.y + 'px';
            el.dataset.id = node.id;
    
            if (node.id === selectedNodeId || selectedIds.has(node.id)) el.classList.add('selected');
    
            if (!node.completed) {
                if (node._isUrgent) el.classList.add('critical-urgent');
                else if (node._isCritical) el.classList.add('critical');
                if (node._isBlocked) el.classList.add('blocked');
            }
    
            if (node._hasCycleError) {
                el.style.border = '3px solid #ff0000';
                el.style.boxShadow = '0 0 20px rgba(255,0,0,0.5)';
                const warning = document.createElement('div');
                warning.innerText = '⚠️ CIRCULAR';
                warning.style.cssText = 'position: absolute; top: -20px; left: 0; background: #ff0000; color: white; font-size: 10px; padding: 2px 6px; border-radius: 4px; font-weight: bold;';
                el.appendChild(warning);
            }
            if (node.completed) el.classList.add('completed');
    
            // Badges Generation
            let badgesHtml = '';
            if (!isUltraEcoMode && !node.completed) {
                if (node._isUrgent) badgesHtml += `<span class="badge urgent-badge">URGENT</span>`;
                else if (node._isCritical) badgesHtml += `<span class="badge critical-badge">CP</span>`;
                if (node._downstreamWeight > 0) badgesHtml += `<span class="badge weight">⚡${node._downstreamWeight}</span>`;
    
                // Expiration Warning - ENHANCED
                if (node.expiresOnDue && node.dueDate && !node.completed) {
                    const dueTime = new Date(node.dueDate).getTime();
                    const now = Date.now();
                    const hoursLeft = (dueTime - now) / (1000 * 60 * 60);
    
                    if (hoursLeft <= 24 && hoursLeft > 0) {
                        // Less than 24 hours - show hours remaining
                        badgesHtml += `<span class="badge" style="background:#dc2626; color:white; border-color:#dc2626; font-weight:800; animation: pulse 2s infinite;">⏰ ${Math.floor(hoursLeft)}h LEFT</span>`;
                    } else if (hoursLeft <= 0) {
                        // Already expired
                        badgesHtml += `<span class="badge" style="background:#7f1d1d; color:white; border-color:#991b1b; font-weight:800; animation: pulse 2s infinite;">⏰ EXPIRED</span>`;
                    }
                }
            }
    
            const totalTime = getTotalTime(node);
            const isActive = !!node.activeTimerStart;
            if (totalTime > 0 || isActive) {
                badgesHtml += `<span class="badge time-badge ${isActive ? 'active' : ''}" data-node-id="${node.id}">${isActive ? '🔴' : '⏱'} ${formatTime(getTotalTime(node))}</span>`;
            }
    
            if (node.dueDate && !node.completed) {
                const due = new Date(node.dueDate);
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                const isOverdue = due < today;
                const dateStr = due.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
                const style = isOverdue ? 'background:#ef4444; color:white; border-color:#ef4444' : '';
                badgesHtml += `<span class="badge date-badge" style="${style}">📅 ${dateStr}</span>`;
            }
    
            // Display linked goals
            if (node.goalIds && node.goalIds.length > 0) {
                const uniqueGoalIds = Array.from(new Set(node.goalIds.filter(Boolean)));
                uniqueGoalIds.forEach((gid) => {
                    const name = findGoalName(gid);
                    if (!name) return;
                    const shortName = name.substring(0, 15) + (name.length > 15 ? '...' : '');
                    const goalBadgeStyle = getGoalColorBoxInlineStyle(gid);
                    badgesHtml += `<span class="badge" style="${goalBadgeStyle}">🎯 ${escapeHtml(shortName)}</span>`;
                });
            }
    
            let icon = '';
            if (node.completed) icon = '✅';
            else if (node._isBlocked) icon = '<span class="icon-lock">🔒</span>';
    
            const totalSubs = node.subtasks.length;
    
            const timerBtnIcon = isActive ? '<svg width="10" height="10" viewBox="0 0 24 24" fill="white"><path d="M6 6h12v12H6z"/></svg>' : '<svg width="10" height="10" viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7z"/></svg>';
            const timerBtnClass = isActive ? 'node-timer-control stop running' : 'node-timer-control play';
    
            // Generate HTML
            el.innerHTML = `
                        ${!isUltraEcoMode ? `
                        <div class="${timerBtnClass}" 
                             onmousedown="event.stopPropagation();"
                             onclick="event.stopPropagation(); handleNodeTimerClick(event, '${node.id}')" 
                             title="${isActive ? 'Stop Timer' : 'Start Timer'}">
                            ${timerBtnIcon}
                        </div>
                        ${totalSubs > 0 ? `
                        <div class="node-subtask-expand" 
                             onmousedown="event.stopPropagation();" 
                             onclick="event.stopPropagation(); toggleSubtaskExpansion('${node.id}', event)" 
                             title="Show Subtasks">
                            ☰
                        </div>
                        ` : ''}
                        ` : ''}
                        <div class="node-header">
                            <div style="display:flex; align-items:center;">
                                ${!isUltraEcoMode ? `
                                <div class="node-checkin-btn" 
                                     onmousedown="event.stopPropagation();"
                                     onclick="event.stopPropagation(); handleCheckIn(event, '${node.id}')" 
                                     title="Fast Check-in">
                                    ✓
                                </div>` : ''}
                                <span>${icon} ${node.title}</span>
                            </div>
                        </div>
                        ${!isUltraEcoMode ? `<div class="node-meta">${badgesHtml}</div>` : ''}
                    `;
    
            el.onmousedown = (e) => startNodeDrag(e, node.id);
            container.appendChild(el);
        });
    
        const endRender = performance.now(); // Stop timer
        lastRenderTime = endRender - startRender;
        updateHealthMonitor(); // <--- Trigger Dashboard Update
    } catch (error) {
        console.error("Error in render:", error);
        if(typeof showNotification === "function") showNotification("Render Error: Check console", "error");
    }
}

// --- INTERACTIONS ---
function setupInteractions() {
    const container = document.getElementById('graph-container');
    const selectionRect = document.getElementById('selection-rect');

    document.addEventListener('keydown', (e) => {
        // 1. Always check for Save (regardless of typing)
        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
            e.preventDefault();
            pushToGist();
            return; // Exit early
        }

        // 2. Define typing check once
        const isTyping = e.target.tagName === 'INPUT' ||
            e.target.tagName === 'TEXTAREA' ||
            e.target.isContentEditable;

        if (e.key === 'Escape') {
            if (typeof taskGroupFocusState !== 'undefined' &&
                taskGroupFocusState.active &&
                typeof exitTaskGroupFocusMode === 'function') {
                e.preventDefault();
                exitTaskGroupFocusMode();
                return;
            }

            const picker = document.getElementById('note-task-picker');
            if (picker && !picker.classList.contains('hidden')) {
                picker.classList.add('hidden');
                return;
            }

            const expandedInspectorModal = document.getElementById('inspector-expanded-modal');
            if (expandedInspectorModal && expandedInspectorModal.classList.contains('visible') && typeof closeInspectorExpandedModal === 'function') {
                closeInspectorExpandedModal();
                return;
            }

            const projectDetailsModal = document.getElementById('project-details-modal');
            if (projectDetailsModal && projectDetailsModal.classList.contains('visible') && typeof closeProjectDetailsModal === 'function') {
                closeProjectDetailsModal();
                return;
            }

            const aiProjectPlannerModal = document.getElementById('ai-project-planner-modal');
            if (aiProjectPlannerModal && aiProjectPlannerModal.classList.contains('visible') && typeof closeAIProjectPlannerModal === 'function') {
                closeAIProjectPlannerModal();
                return;
            }

            const aiModal = document.getElementById('ai-modal');
            if (aiModal && aiModal.classList.contains('visible') && typeof closeAIModal === 'function') {
                closeAIModal();
                return;
            }

            const aiUrgencyScoresModal = document.getElementById('ai-urgency-scores-modal');
            if (aiUrgencyScoresModal && aiUrgencyScoresModal.classList.contains('visible') && typeof closeAiUrgencyScoresModal === 'function') {
                closeAiUrgencyScoresModal();
                return;
            }

            if (typeof isFinanceCaptureModalOpen === 'function' && isFinanceCaptureModalOpen() && typeof closeFinanceCaptureModal === 'function') {
                closeFinanceCaptureModal();
                return;
            }

            const shortcutsModal = document.getElementById('shortcuts-modal');
            if (shortcutsModal) {
                shortcutsModal.remove();
                return;
            }

            const insightsOverlay = document.getElementById('insights-dashboard-overlay');
            if (insightsOverlay && !insightsOverlay.classList.contains('hidden')) {
                closeInsightsDashboard();
                return;
            }
        }

        if (isTyping) return; // If typing, don't run any of the shortcuts below

        // Add new shortcuts
        if (e.key === '?') {
            e.preventDefault();
            toggleShortcutsHelp();
            return;
        }

        if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
            e.preventDefault();
            undo();
            return;
        }

        if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.shiftKey && e.key === 'Z'))) {
            e.preventDefault();
            redo();
            return;
        }

        // 3. Shortcuts (Option + Key)
        if (e.altKey) {
            e.preventDefault();
            switch (e.code) {
                case 'KeyT':
                    if (e.shiftKey && typeof openAIProjectPlannerModal === 'function') openAIProjectPlannerModal();
                    else addNode();
                    break;
                case 'KeyQ': toggleMenu(); break;
                case 'KeyG': toggleGoals(); break;
                case 'KeyH': toggleHabits(); break;
                case 'KeyA':
                    toggleAgenda();
                    showNotification(document.getElementById('agenda-panel').classList.contains('hidden') ? "Planner Closed" : "Planner Opened");
                    break;
                case 'KeyN': toggleNotesPanel(); break;
                case 'KeyX': toggleArchivePanel(); break;
                case 'KeyR': fitView(); break;
                case 'KeyD': autoArrangeGraph(); break;
                case 'KeyM': toggleHeatmap(); break;
                case 'KeyS': toggleSyncPanel(); break;
                case 'KeyV': saveData(true); break;
                case 'KeyL': document.getElementById('file-input').click(); break;
                case 'KeyK': clearData(); break;
                case 'KeyE': cycleEcoMode(); break;
                case 'KeyP':
                    if (e.shiftKey) togglePinnedWindow();
                    else if (typeof toggleProjectsPanel === 'function') toggleProjectsPanel();
                    break;
                case 'KeyF': toggleTaskListWindow(); break;
                case 'KeyU': toggleInsightsDashboard(); break;
                case 'KeyC':
                    if (typeof openFinanceCaptureModal === 'function') {
                        openFinanceCaptureModal();
                    }
                    break;
                case 'KeyW':
                    const noteEditor = document.getElementById('note-editor');
                    if (noteEditor && !noteEditor.classList.contains('hidden')) {
                        toggleNoteEditorSize();
                    }
                    break;
                case 'KeyI':
                    toggleAIModal();
                    break;
                case 'KeyB':
                    toggleInboxModal();
                    break;
                case 'KeyJ':
                    centerHealthDashboard();
                    break;
                case 'KeyO':
                    toggleNodeGroupsModal();
                    break;
            }
        }

        if (e.code === 'Space' && e.altKey) {
            e.preventDefault();
            toggleGlobalSearch();
        }
    });

    document.addEventListener('mousedown', (e) => {
        // Close AI modal when clicking backdrop
        const aiBackdrop = document.getElementById('ai-modal-backdrop');
        if (aiBackdrop && aiBackdrop.classList.contains('visible') && e.target === aiBackdrop) {
            closeAIModal();
            return;
        }

        const expandedInspectorBackdrop = document.getElementById('inspector-expanded-backdrop');
        if (expandedInspectorBackdrop && expandedInspectorBackdrop.classList.contains('visible') && e.target === expandedInspectorBackdrop && typeof closeInspectorExpandedModal === 'function') {
            closeInspectorExpandedModal();
            return;
        }

        const projectDetailsBackdrop = document.getElementById('project-details-backdrop');
        if (projectDetailsBackdrop && projectDetailsBackdrop.classList.contains('visible') && e.target === projectDetailsBackdrop && typeof closeProjectDetailsModal === 'function') {
            closeProjectDetailsModal();
            return;
        }

        // Close subtask expansion boxes when clicking outside
        const clickedBox = e.target.closest('.subtasks-expanded-box');
        const clickedExpandBtn = e.target.closest('.node-subtask-expand');
        const clickedCheckbox = e.target.closest('.expanded-subtask-check');

        if (!clickedBox && !clickedExpandBtn && !clickedCheckbox) {
            closeAllSubtaskBoxes();
        }

        // (Cleaned up ai-panel references)

        const navigatorPanel = document.getElementById('navigator-panel');
        const navButtonClicked = e.target.closest('#btn-navigator');
        const rightRailClicked = e.target.closest('#right-rail-tabs');
        if (navigatorPanel && !navigatorPanel.classList.contains('hidden')) {
            if (!navigatorPanel.contains(e.target) && !navButtonClicked && !rightRailClicked) {
                if (typeof closeRightDockPanel === 'function') closeRightDockPanel('navigator-panel');
                else navigatorPanel.classList.add('hidden');
            }
        }

        const sync = document.getElementById('sync-panel');
        const syncToggleClicked = !!e.target.closest('button[onclick="toggleSyncPanel()"]');
        if (sync && !sync.classList.contains('hidden') && !sync.contains(e.target) && !syncToggleClicked && !rightRailClicked) {
            if (typeof closeRightDockPanel === 'function') closeRightDockPanel('sync-panel');
            else sync.classList.add('hidden');
        }

        const projectsPanel = document.getElementById('projects-panel');
        const projectsButtonClicked = e.target.closest('#btn-projects');
        const projectDetailsModal = document.getElementById('project-details-modal');
        const projectDetailsOpen = !!(projectDetailsModal && projectDetailsModal.classList.contains('visible'));
        if (projectsPanel && !projectsPanel.classList.contains('hidden') && !projectDetailsOpen) {
            if (!projectsPanel.contains(e.target) && !projectsButtonClicked && !rightRailClicked) {
                if (typeof closeRightDockPanel === 'function') closeRightDockPanel('projects-panel');
                else projectsPanel.classList.add('hidden');
            }
        }

        // Hide selection menu on outside click
        const selMenu = document.getElementById('selection-menu');
        if (!selMenu.contains(e.target) && e.target.id !== 'note-body-input') {
            selMenu.style.display = 'none';
        }

        // Hide note task picker on outside click
        const noteTaskPicker = document.getElementById('note-task-picker');
        if (noteTaskPicker && !noteTaskPicker.classList.contains('hidden')) {
            const linkBtn = document.querySelector('button[onclick="showNoteTaskPicker()"]');
            if (!noteTaskPicker.contains(e.target) && (!linkBtn || !linkBtn.contains(e.target))) {
                noteTaskPicker.classList.add('hidden');
            }
        }
    });

    container.addEventListener('mousedown', (e) => {
        const clickedInsertBtn = e.target.closest && e.target.closest('.connection-insert-btn');
        const clickedConnection = e.target.closest && (e.target.closest('.connection-hit-area') || e.target.closest('.connection-line'));
        if (!clickedInsertBtn && (e.target === container || e.target.tagName === 'svg' || e.target.id === 'nodes-layer' || clickedConnection)) {
            if (e.shiftKey) {
                isBoxSelecting = true;
                boxSelectStart = { x: e.clientX, y: e.clientY };
                selectionRect.style.display = 'block';
                selectionRect.style.left = e.clientX + 'px';
                selectionRect.style.top = e.clientY + 'px';
                selectionRect.style.width = '0px';
                selectionRect.style.height = '0px';
            } else {
                isPanning = true;
                dragStartX = e.clientX - panX;
                dragStartY = e.clientY - panY;
                closeAllSidePanels();
            }
        }
    });

    window.addEventListener('mousemove', (e) => {
        if (isPanning) {
            panX = e.clientX - dragStartX;
            panY = e.clientY - dragStartY;
            updateTransform();
        }
        if (isBoxSelecting) {
            const currentX = e.clientX;
            const currentY = e.clientY;
            const left = Math.min(boxSelectStart.x, currentX);
            const top = Math.min(boxSelectStart.y, currentY);
            const width = Math.abs(currentX - boxSelectStart.x);
            const height = Math.abs(currentY - boxSelectStart.y);
            selectionRect.style.left = left + 'px';
            selectionRect.style.top = top + 'px';
            selectionRect.style.width = width + 'px';
            selectionRect.style.height = height + 'px';
        }
        if (isDragging) {
            const currentX = (e.clientX - panX) / scale;
            const currentY = (e.clientY - panY) / scale;
            const dx = currentX - dragStartX;
            const dy = currentY - dragStartY;
            if (selectedIds.size > 0) {
                selectedIds.forEach(id => {
                    const node = nodes.find(n => n.id === id);
                    if (node) { node.x += dx; node.y += dy; }
                });
            } else if (draggedNodeId) {
                const node = nodes.find(n => n.id === draggedNodeId);
                if (node) { node.x += dx; node.y += dy; }
            }
            dragStartX = currentX;
            dragStartY = currentY;
            renderThrottled();
        }
    });

    window.addEventListener('mouseup', (e) => {
        if (isDragging) { isDragging = false; draggedNodeId = null; saveToStorage(); }
        isPanning = false;
        if (isBoxSelecting) {
            isBoxSelecting = false;
            selectionRect.style.display = 'none';
            finishBoxSelection(e.clientX, e.clientY);
        }
    });

    container.addEventListener('wheel', (e) => { e.preventDefault(); if (e.ctrlKey) { const zoomFactor = 0.002; const delta = -e.deltaY; scale = Math.min(Math.max(0.2, scale + (delta * zoomFactor * scale)), 3); } else { panX -= e.deltaX; panY -= e.deltaY; } updateTransform(); }, { passive: false });
    container.addEventListener('contextmenu', e => e.preventDefault());

    container.addEventListener('touchstart', (e) => {
        if (e.touches.length === 1) {
            const touch = e.touches[0];
            const nodeEl = document.elementFromPoint(touch.clientX, touch.clientY)?.closest('.node');
            if (nodeEl) {
                const id = nodeEl.dataset.id;
                if (selectedNodeId !== id) selectNode(id);
                isDragging = true;
                draggedNodeId = id;
                const node = nodes.find(n => n.id === id);
                dragStartX = (touch.clientX - panX) / scale - node.x;
                dragStartY = (touch.clientY - panY) / scale - node.y;
            } else {
                isPanning = true;
                dragStartX = touch.clientX - panX;
                dragStartY = touch.clientY - panY;
                closeAllSidePanels();
            }
        } else if (e.touches.length === 2) {
            isPanning = false;
            isDragging = false;
            initialPinchDist = getPinchDistance(e);
            initialScale = scale;
            pinchStartPan = { x: panX, y: panY };
            pinchStartCenter = getPinchCenter(e);
        }
    }, { passive: false });

    container.addEventListener('touchmove', (e) => {
        if (e.cancelable) e.preventDefault();
        if (e.touches.length === 1) {
            const touch = e.touches[0];
            if (isDragging && draggedNodeId) {
                const node = nodes.find(n => n.id === draggedNodeId);
                if (node) {
                    node.x = (touch.clientX - panX) / scale - dragStartX;
                    node.y = (touch.clientY - panY) / scale - dragStartY;
                    renderThrottled();
                }
            } else if (isPanning) {
                panX = touch.clientX - dragStartX;
                panY = touch.clientY - dragStartY;
                updateTransform();
            }
        } else if (e.touches.length === 2 && initialPinchDist) {
            const currentDist = getPinchDistance(e);
            const ratio = currentDist / initialPinchDist;
            const newScale = Math.max(0.2, Math.min(3, initialScale * ratio));
            const currentCenter = getPinchCenter(e);
            const worldX = (pinchStartCenter.x - pinchStartPan.x) / initialScale;
            const worldY = (pinchStartCenter.y - pinchStartPan.y) / initialScale;
            panX = currentCenter.x - (worldX * newScale);
            panY = currentCenter.y - (worldY * newScale);
            scale = newScale;
            updateTransform();
        }
    }, { passive: false });

    container.addEventListener('touchend', (e) => {
        if (isDragging) { isDragging = false; saveToStorage(); }
        if (e.touches.length < 2) initialPinchDist = null;
        if (e.touches.length === 0) isPanning = false;
    });
}

function toggleShortcutsHelp() {
    const existing = document.getElementById('shortcuts-modal');
    if (existing) {
        existing.remove();
        return;
    }

    const overlay = document.createElement('div');
    overlay.id = 'shortcuts-modal';
    overlay.style.cssText = `
        position: fixed;
        inset: 0;
        background: rgba(2, 6, 23, 0.7);
        backdrop-filter: blur(4px);
        z-index: 3000;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 24px;
    `;

    overlay.innerHTML = `
        <div style="
            width: min(720px, 100%);
            max-height: 85vh;
            overflow-y: auto;
            background: var(--panel-bg-elevated);
            border: 1px solid var(--border);
            border-radius: 14px;
            box-shadow: var(--shadow-xl);
            padding: 22px;
        ">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:18px;">
                <h2 style="margin:0; font-size:18px; color:var(--text-main)">Keyboard Shortcuts</h2>
                <button onclick="toggleShortcutsHelp()" style="background:none; border:none; color:var(--text-muted); cursor:pointer; font-size:20px;">✕</button>
            </div>
            <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap:10px; font-size:13px;">
                <div><b>?</b> - Show this help</div>
                <div><b>Esc</b> - Close modal/panel</div>
                <div><b>Ctrl+S</b> - Push sync snapshot</div>
                <div><b>Ctrl+Z</b> - Undo</div>
                <div><b>Ctrl+Shift+Z</b> - Redo</div>
                <div><b>Alt+T</b> - New task</div>
                <div><b>Alt+Shift+T</b> - AI project plan</div>
                <div><b>Alt+Q</b> - Toggle toolbar menu</div>
                <div><b>Alt+B</b> - Inbox</div>
                <div><b>Alt+C</b> - Record finance transaction</div>
                <div><b>Alt+N</b> - Notes</div>
                <div><b>Alt+G</b> - Goals</div>
                <div><b>Alt+H</b> - Habits</div>
                <div><b>Alt+A</b> - Planner</div>
                <div><b>Alt+M</b> - Planner heatmap tab</div>
                <div><b>Alt+F</b> - Navigator (Tasks)</div>
                <div><b>Alt+P</b> - Projects panel</div>
                <div><b>Alt+Shift+P</b> - Navigator (Pinned)</div>
                <div><b>Alt+O</b> - Navigator (Groups)</div>
                <div><b>Alt+S</b> - Settings hub</div>
                <div><b>Alt+U</b> - Canopy dashboard</div>
                <div><b>Alt+I</b> - AI assistant</div>
                <div><b>Alt+R</b> - Recenter</div>
                <div><b>Alt+D</b> - Declutter</div>
                <div><b>Alt+E</b> - Cycle engine mode</div>
                <div><b>Alt+Space</b> - Global search</div>
            </div>
            <div style="margin-top:18px; padding-top:14px; border-top:1px solid var(--border); font-size:11px; color:var(--text-muted);">
                Tip: Press <b>?</b> any time to reopen this guide.
            </div>
        </div>
    `;

    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            toggleShortcutsHelp();
        }
    });

    document.body.appendChild(overlay);
}

function closeAllSidePanels() {
    const tb = document.getElementById('toolbar');
    if (!tb.classList.contains('collapsed')) toggleMenu();
    const notePanel = document.getElementById('notes-panel');
    if (notePanel && !notePanel.classList.contains('pinned')) {
        notePanel.classList.add('hidden');
    }
    const goalsPanel = document.getElementById('goals-panel');
    if (goalsPanel) goalsPanel.classList.add('hidden');
    const habitsPanel = document.getElementById('habits-panel');
    if (habitsPanel) habitsPanel.classList.add('hidden');
    const archivePanel = document.getElementById('archive-panel');
    if (archivePanel) archivePanel.classList.add('hidden');
    const plannerPanel = document.getElementById('agenda-panel');
    if (plannerPanel) plannerPanel.classList.add('hidden');
    const projectsPanel = document.getElementById('projects-panel');
    if (projectsPanel) projectsPanel.classList.add('hidden');
    const navPanel = document.getElementById('navigator-panel');
    if (navPanel) navPanel.classList.add('hidden');
    // (Cleaned up ai-panel reference)
    if (typeof syncRightRailTabs === 'function') syncRightRailTabs();
    deselectNode();
}

function finishBoxSelection(endX, endY) {
    const rectLeft = Math.min(boxSelectStart.x, endX);
    const rectTop = Math.min(boxSelectStart.y, endY);
    const rectRight = Math.max(boxSelectStart.x, endX);
    const rectBottom = Math.max(boxSelectStart.y, endY);
    selectedIds.clear();
    nodes.forEach(node => {
        const screenX = (node.x * scale) + panX;
        const screenY = (node.y * scale) + panY;
        const width = 180 * scale;
        const height = 100 * scale;
        if (screenX + width > rectLeft && screenX < rectRight &&
            screenY + height > rectTop && screenY < rectBottom) {
            selectedIds.add(node.id);
        }
    });
    if (selectedIds.size === 1) {
        selectNode(selectedIds.values().next().value);
    } else if (selectedIds.size > 1) {
        selectedNodeId = null;
        document.getElementById('inspector').classList.add('hidden');
        showBulkOperationsBar();
        render();
    } else {
        deselectNode();
    }
}

function startNodeDrag(e, id) {
    if (isUltraEcoMode) {
        // View-only in Ultra Eco Mode
        selectNode(id);
        return;
    }
    if (e.target.closest('.node-timer-control')) return;
    e.stopPropagation();
    if (e.shiftKey) {
        if (selectedIds.has(id)) {
            selectedIds.delete(id);
            if (selectedNodeId === id) selectedNodeId = null;
        } else {
            selectedIds.add(id);
            if (selectedIds.size === 1) selectNode(id);
        }
    } else {
        if (!selectedIds.has(id)) {
            selectedIds.clear();
            selectedIds.add(id);
            selectNode(id);
        }
    }
    isDragging = true;
    draggedNodeId = id;
    dragStartX = (e.clientX - panX) / scale;
    dragStartY = (e.clientY - panY) / scale;
    if (selectedIds.size > 1) {
        document.getElementById('inspector').classList.add('hidden');
        render();
    }
}

function getPinchDistance(e) { return Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY); }
function getPinchCenter(e) { return { x: (e.touches[0].clientX + e.touches[1].clientX) / 2, y: (e.touches[0].clientY + e.touches[1].clientY) / 2 }; }

// --- OPTIMIZED RENDERING ---
let renderTimeout = null;
let queuedRender = false;

function renderThrottled() {
    if (isUltraEcoMode) {
        // In eco mode, only render every 2 seconds maximum
        if (!queuedRender) {
            queuedRender = true;
            setTimeout(() => {
                queuedRender = false;
                render();
            }, 2000);
        }
        return;
    }

    // Standard debounce for normal mode
    if (renderTimeout) clearTimeout(renderTimeout);
    renderTimeout = setTimeout(() => {
        render();
        renderTimeout = null;
    }, 16); // 60fps cap
}
function updateTransform() { document.getElementById('transform-layer').style.transform = `translate(${panX}px, ${panY}px) scale(${scale})`; }
function fitView() {
    let target = nodes.find(n => n.isManualUrgent && !n.completed); if (!target) target = nodes.find(n => n._isUrgent && !n.completed); if (!target) target = nodes.find(n => n._isCritical && !n.completed); if (!target) target = nodes.find(n => !n.completed); if (!target && nodes.length > 0) target = nodes[0];
    if (target) { scale = 1; const nodeCenterX = target.x + 90; const nodeCenterY = target.y + 50; const screenCenterX = window.innerWidth / 2; const screenCenterY = window.innerHeight / 2; panX = screenCenterX - nodeCenterX; panY = screenCenterY - nodeCenterY; updateTransform(); const n = document.getElementById('notification'); n.innerText = "Focused on: " + target.title; n.style.opacity = '1'; setTimeout(() => n.style.opacity = '0', 1500); } else { panX = 0; panY = 0; scale = 1; updateTransform(); }
}

// --- NODE MANAGEMENT ---
function insertTaskBetweenDependency(childId, depIndex) {
    const childNode = nodes.find(n => n.id === childId);
    if (!childNode) return;

    const existingDep = childNode.dependencies[depIndex];
    if (!existingDep) return;

    const parentNode = nodes.find(n => n.id === existingDep.id);
    if (!parentNode) return;

    const newX = Math.round((parentNode.x + childNode.x) / 2);
    let newY = Math.round((parentNode.y + childNode.y) / 2);

    const isSpotBusy = (x, y) => nodes.some(n => Math.abs(n.x - x) < 170 && Math.abs(n.y - y) < 100);
    let placementAttempts = 0;
    while (isSpotBusy(newX, newY) && placementAttempts < 6) {
        newY += 120;
        placementAttempts++;
    }

    const newNode = createNode(newX, newY, 'New Task');
    const depType = existingDep.type || 'hard';
    newNode.dependencies.push({ id: parentNode.id, type: depType });

    const inheritedGoalIds = Array.from(new Set([
        ...(Array.isArray(parentNode.goalIds) ? parentNode.goalIds : []),
        ...(Array.isArray(childNode.goalIds) ? childNode.goalIds : [])
    ]));
    newNode.goalIds = inheritedGoalIds;

    childNode.dependencies[depIndex] = { id: newNode.id, type: depType };

    if (typeof inheritTaskGoalsFromParent === 'function') {
        inheritTaskGoalsFromParent(newNode, childNode);
    }

    nodes.push(newNode);

    updateCalculations();
    selectNode(newNode.id);
    saveToStorage();
    showNotification(`Inserted task between "${parentNode.title}" and "${childNode.title}"`);
}

function addNode() { const worldX = (window.innerWidth / 2 - panX) / scale - 90 + (Math.random() * 40 - 20); const worldY = (window.innerHeight / 2 - panY) / scale - 50 + (Math.random() * 40 - 20); const n = createNode(worldX, worldY); nodes.push(n); selectNode(n.id); updateCalculations(); render(); saveToStorage(); }

function selectNode(id) {
    selectedNodeId = id;
    selectedIds.clear();
    selectedIds.add(id);
    document.getElementById('goals-panel').classList.add('hidden');
    document.getElementById('archive-panel').classList.add('hidden');
    // AI panel can stay open
    const notePanel = document.getElementById('notes-panel');
    if (!notePanel.classList.contains('pinned')) notePanel.classList.add('hidden');
    if (typeof syncRightRailTabs === 'function') syncRightRailTabs();
    const inspector = document.getElementById('inspector');
    const expandedInspectorModal = document.getElementById('inspector-expanded-modal');
    const isExpandedInspectorVisible = expandedInspectorModal && expandedInspectorModal.classList.contains('visible');
    if (inspector) {
        if (isExpandedInspectorVisible) inspector.classList.add('hidden');
        else inspector.classList.remove('hidden');
    }
    render();
    if (document.getElementById('archive-panel').classList.contains('hidden') === false) renderArchiveList();

    // NEW: Update Agenda Panel if visible
    if (!document.getElementById('agenda-panel').classList.contains('hidden')) {
        renderAgendaPanelUI();
    }

    updateInspector();
    if ((typeof isProjectsPanelVisible === 'function' && isProjectsPanelVisible()) && typeof renderProjectsList === 'function') {
        renderProjectsList();
    }
}

function deselectNode() {
    if (typeof closeInspectorExpandedModal === 'function') {
        closeInspectorExpandedModal({ restoreInspector: false, refreshInspector: false });
    }
    selectedNodeId = null;
    selectedIds.clear();
    document.getElementById('inspector').classList.add('hidden');
    const bar = document.getElementById('bulk-ops-bar');
    if (bar) bar.remove();
    render();
    if (document.getElementById('archive-panel').classList.contains('hidden') === false) renderArchiveList();
    if ((typeof isProjectsPanelVisible === 'function' && isProjectsPanelVisible()) && typeof renderProjectsList === 'function') {
        renderProjectsList();
    }
}

function showBulkOperationsBar() {
    let bar = document.getElementById('bulk-ops-bar');
    if (bar) bar.remove();

    bar = document.createElement('div');
    bar.id = 'bulk-ops-bar';
    bar.style.cssText = `
                position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%);
                background: var(--panel-bg-elevated); border: 1px solid var(--accent);
                border-radius: 30px; padding: 8px 16px; z-index: 2000;
                display: flex; gap: 10px; box-shadow: var(--shadow-xl);
                animation: slideUp 0.3s ease;
            `;

    const count = selectedIds.size;

    bar.innerHTML = `
                <span style=\"align-self: center; color: var(--text-muted); font-size: 12px; margin-right: 8px;\">${count} selected</span>
                <button class=\"btn\" onclick=\"bulkComplete()\" style=\"background: var(--ready-color); color: white; border-radius: 20px; padding: 6px 12px; font-size: 12px;\">✓ Complete</button>
                <button class=\"btn\" onclick=\"bulkArchive()\" style=\"background: var(--soft-dep-color); color: white; border-radius: 20px; padding: 6px 12px; font-size: 12px;\">🗄 Archive</button>
                <button class=\"btn\" onclick=\"bulkDelete()\" style=\"background: var(--blocked-color); color: white; border-radius: 20px; padding: 6px 12px; font-size: 12px;\">🗑 Delete</button>
                <button class=\"btn\" onclick=\"bulkAddToAgenda()\" style=\"background: var(--accent); color: white; border-radius: 20px; padding: 6px 12px; font-size: 12px;\">📅 Agenda</button>
                <button class=\"btn\" onclick=\"clearSelection()\" style=\"border-radius: 20px; padding: 6px 12px; font-size: 12px;\">✕ Clear</button>
            `;

    document.body.appendChild(bar);
}

function clearSelection() {
    selectedIds.clear();
    selectedNodeId = null;
    const bar = document.getElementById('bulk-ops-bar');
    if (bar) bar.remove();
    render();
}

function bulkComplete() {
    let count = 0;
    selectedIds.forEach(id => {
        const node = nodes.find(n => n.id === id);
        if (node && !node.completed) {
            node.completed = true;
            node.completedDate = Date.now();
            count++;
        }
    });
    clearSelection();
    updateCalculations();
    render();
    saveToStorage();
    showNotification(`Completed ${count} tasks`);
}

function bulkArchive() {
    const now = Date.now();
    let count = 0;
    selectedIds.forEach(id => {
        const node = nodes.find(n => n.id === id);
        if (node) {
            node.completed = true;
            node.completedDate = now;
            archivedNodes.push(node);
            count++;
        }
    });
    nodes = nodes.filter(n => !selectedIds.has(n.id));
    clearSelection();
    updateCalculations();
    render();
    saveToStorage();
    showNotification(`Archived ${count} tasks`);
}

function bulkDelete() {
    if (!confirm(`Delete ${selectedIds.size} tasks permanently? This cannot be undone.`)) return;

    nodes = nodes.filter(n => !selectedIds.has(n.id));
    archivedNodes = archivedNodes.filter(n => !selectedIds.has(n.id));

    // Clean up dependencies
    nodes.forEach(n => {
        n.dependencies = n.dependencies.filter(d => !selectedIds.has(d.id));
    });

    clearSelection();
    updateCalculations();
    render();
    saveToStorage();
    showNotification('Tasks deleted');
}

function bulkAddToAgenda() {
    // Show quick agenda add modal
    const duration = prompt(`Add ${selectedIds.size} tasks to agenda for how many minutes each?`, "30");
    if (!duration || isNaN(duration)) return;

    const startTime = new Date();

    selectedIds.forEach((id, index) => {
        const node = nodes.find(n => n.id === id);
        if (!node) return;

        const slotStart = new Date(startTime.getTime() + (index * duration * 60000));
        const slotEnd = new Date(slotStart.getTime() + (duration * 60000));

        agenda.push({
            taskId: node.id,
            start: slotStart.toISOString(),
            end: slotEnd.toISOString(),
            title: node.title
        });
    });

    clearSelection();
    saveToStorage();
    renderAgenda();
    showNotification(`Added ${selectedIds.size} slots to agenda`);
}


function deleteAgendaSlot(index) {
    agenda.splice(index, 1);
    renderAgenda(); saveToStorage();
}

// Replace your existing updateHealthMonitor with this one
let lastHealthUpdateTime = 0;

function updateHealthMonitor() {
    // Throttle: Only update the UI every 500ms to save CPU
    const now = Date.now();
    if (now - lastHealthUpdateTime < 500) return;
    lastHealthUpdateTime = now;

    const activeCount = nodes.length;
    const archCount = archivedNodes.length;
    const loadText = `${activeCount} Act / ${archCount} Arch`;
    const loadEl = document.getElementById('hd-load');
    if (loadEl) loadEl.innerText = loadText;
    const reviewLoadEl = document.getElementById('review-health-load');
    if (reviewLoadEl) reviewLoadEl.innerText = loadText;

    const fpsText = document.getElementById('hd-fps');
    const fpsDot = document.getElementById('hd-fps-dot');

    if (fpsText && fpsDot) {
        fpsText.innerText = lastRenderTime.toFixed(1) + 'ms';

        if (isUltraEcoMode) {
            fpsDot.className = 'health-dot ok';
            fpsText.innerText = 'FROZEN';
            redZoneStartTime = null;
        } else if (lastRenderTime < 16) {
            fpsDot.className = 'health-dot ok';
            redZoneStartTime = null;
        } else if (lastRenderTime < 50) {
            fpsDot.className = 'health-dot warn';
            redZoneStartTime = null;
        } else {
            fpsDot.className = 'health-dot err';

            // Auto-switch logic based on severity
            if (ecoModeLevel === 0) {
                // In Turbo: Switch to Eco after 5s of lag
                if (!redZoneStartTime) redZoneStartTime = Date.now();
                if (Date.now() - redZoneStartTime > 5000) {
                    ecoModeLevel = 1;
                    applyEcoMode();
                    showNotification("⚠️ Auto-switched to Eco Mode (high CPU load)");
                }
            } else if (ecoModeLevel === 1 && lastRenderTime > 100) {
                // In Eco: Switch to Ultra Eco if REALLY struggling (>100ms frames)
                if (!redZoneStartTime) redZoneStartTime = Date.now();
                if (Date.now() - redZoneStartTime > 3000) {
                    ecoModeLevel = 2;
                    applyEcoMode();
                    showNotification("🔋 Auto-switched to Battery Mode (critical CPU load)");
                }
            }
        }

        const reviewRenderEl = document.getElementById('review-health-render');
        if (reviewRenderEl) reviewRenderEl.innerText = fpsText.innerText;
    }

    // Update Storage Metrics (Approximate IndexedDB Size)
    try {
        const dataPayload = {
            dataModelVersion: (typeof dataModelVersion !== 'undefined') ? dataModelVersion : 1,
            aiUrgencyConfig: (typeof aiUrgencyConfig !== 'undefined') ? aiUrgencyConfig : {},
            projects: (typeof projects !== 'undefined') ? projects : [],
            nodes, archivedNodes, inbox, lifeGoals, notes,
            habits, agenda, pinnedItems, quickLinks, reminders,
            hiddenNodeGroups: (typeof hiddenNodeGroups !== 'undefined') ? Array.from(hiddenNodeGroups) : [],
            timestamp: Date.now()
        };
        const jsonString = JSON.stringify(dataPayload);
        const totalBytes = new Blob([jsonString]).size;

        // Soft limit for visualization 10MB (Performance warning threshold)
        const softLimit = 10 * 1024 * 1024;
        const storagePct = (totalBytes / softLimit) * 100;

        const storageText = document.getElementById('hd-storage-text');
        const storageBar = document.getElementById('hd-storage-bar');

        let sizeStr = '';
        if (totalBytes < 1024 * 1024) {
            sizeStr = (totalBytes / 1024).toFixed(1) + ' KB';
        } else {
            sizeStr = (totalBytes / (1024 * 1024)).toFixed(2) + ' MB';
        }

        if (storageText) {
            storageText.innerText = sizeStr;
        }
        const reviewStorageEl = document.getElementById('review-health-storage');
        if (reviewStorageEl) reviewStorageEl.innerText = sizeStr;
        if (storageBar) {
            storageBar.style.width = Math.min(100, Math.max(1, storagePct)) + '%';
            // Colorize based on usage
            if (storagePct > 80) storageBar.style.background = 'var(--blocked-color)';
            else if (storagePct > 50) storageBar.style.background = '#fbbf24';
            else storageBar.style.background = 'var(--ready-color)';
        }
    } catch (e) {
        console.warn("Storage health check failed:", e);
    }

    // Update Virtualization Status (Previously removed per request)
    const virtualEl = document.getElementById('hd-virt-status');
    if (virtualEl) {
        virtualEl.innerText = "Off";
        virtualEl.style.color = "#888";
    }
    const reviewVirtEl = document.getElementById('review-health-virt');
    if (reviewVirtEl) reviewVirtEl.innerText = "Off";
}
