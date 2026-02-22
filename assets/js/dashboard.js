(function () {
    const DASHBOARD_PREF_KEY = 'urgencyFlow_dashboard_open_on_startup';
    const TREND_SNAPSHOT_KEY = 'urgencyFlow_canopy_daily_trends_v1';
    const TREND_RETENTION_DAYS = 45;
    const PRIORITY_LIMIT = 5;
    const UNBLOCK_LIMIT = 5;
    const BLOCKER_LIMIT = 6;
    const OUTER_BRANCH_LIMIT = 12;
    const DAY_MS = 24 * 60 * 60 * 1000;

    let lastSignalRefreshDayKey = '';

    function safeArray(value) {
        return Array.isArray(value) ? value : [];
    }

    function clamp(value, min, max) {
        const numeric = Number(value);
        if (!Number.isFinite(numeric)) return min;
        if (numeric < min) return min;
        if (numeric > max) return max;
        return numeric;
    }

    function getNodesStore() {
        if (typeof nodes !== 'undefined' && Array.isArray(nodes)) return nodes;
        return safeArray(window.nodes);
    }

    function getArchivedNodesStore() {
        if (typeof archivedNodes !== 'undefined' && Array.isArray(archivedNodes)) return archivedNodes;
        return safeArray(window.archivedNodes);
    }

    function getHabitsStore() {
        if (typeof habits !== 'undefined' && Array.isArray(habits)) return habits;
        return safeArray(window.habits);
    }

    function getQuickLinksStore() {
        if (typeof quickLinks !== 'undefined' && Array.isArray(quickLinks)) return quickLinks;
        return safeArray(window.quickLinks);
    }

    function getLifeGoalsStore() {
        if (typeof lifeGoals !== 'undefined' && lifeGoals && typeof lifeGoals === 'object') return lifeGoals;
        if (window.lifeGoals && typeof window.lifeGoals === 'object') return window.lifeGoals;
        return {};
    }

    // escapeHtml() is now in utils.js (global scope)

    function parseDateKey(dateKey) {
        const m = String(dateKey || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (!m) return null;
        const y = Number(m[1]);
        const mm = Number(m[2]) - 1;
        const d = Number(m[3]);
        return new Date(y, mm, d, 12, 0, 0, 0);
    }

    function getLocalDayKey(date = new Date()) {
        const y = date.getFullYear();
        const mm = String(date.getMonth() + 1).padStart(2, '0');
        const dd = String(date.getDate()).padStart(2, '0');
        return `${y}-${mm}-${dd}`;
    }

    function formatDayKey(dayKey) {
        const parsed = parseDateKey(dayKey);
        if (!parsed) return 'previous day';
        return parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    }

    function readTrendSnapshots() {
        try {
            const raw = localStorage.getItem(TREND_SNAPSHOT_KEY);
            if (!raw) return [];
            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed)) return [];

            const cleaned = parsed
                .map(entry => {
                    if (!entry || typeof entry !== 'object') return null;
                    const dayKey = typeof entry.dayKey === 'string' ? entry.dayKey : '';
                    if (!/^\d{4}-\d{2}-\d{2}$/.test(dayKey)) return null;
                    return {
                        dayKey: dayKey,
                        critical: Number(entry.critical) || 0,
                        urgent: Number(entry.urgent) || 0,
                        blocked: Number(entry.blocked) || 0,
                        ready: Number(entry.ready) || 0,
                        completionRate: Number(entry.completionRate) || 0
                    };
                })
                .filter(Boolean)
                .sort((a, b) => a.dayKey.localeCompare(b.dayKey));

            return cleaned.slice(-TREND_RETENTION_DAYS);
        } catch (error) {
            return [];
        }
    }

    function writeTrendSnapshots(list) {
        try {
            localStorage.setItem(TREND_SNAPSHOT_KEY, JSON.stringify(safeArray(list).slice(-TREND_RETENTION_DAYS)));
        } catch (error) { }
    }

    function buildTrendDeltas(currentSnapshot) {
        const todayKey = getLocalDayKey();
        const baseline = {
            dayKey: todayKey,
            critical: Number(currentSnapshot.critical) || 0,
            urgent: Number(currentSnapshot.urgent) || 0,
            blocked: Number(currentSnapshot.blocked) || 0,
            ready: Number(currentSnapshot.ready) || 0,
            completionRate: Number(currentSnapshot.completionRate) || 0
        };

        const snapshots = readTrendSnapshots().filter(item => item.dayKey !== todayKey);
        snapshots.push(baseline);
        snapshots.sort((a, b) => a.dayKey.localeCompare(b.dayKey));
        const trimmed = snapshots.slice(-TREND_RETENTION_DAYS);
        writeTrendSnapshots(trimmed);

        const previous = trimmed
            .slice()
            .reverse()
            .find(item => item.dayKey < todayKey);

        if (!previous) {
            return {
                label: 'No baseline',
                criticalDelta: null,
                urgentDelta: null,
                blockedDelta: null,
                readyDelta: null,
                completionRateDelta: null
            };
        }

        return {
            label: `vs ${formatDayKey(previous.dayKey)}`,
            criticalDelta: baseline.critical - previous.critical,
            urgentDelta: baseline.urgent - previous.urgent,
            blockedDelta: baseline.blocked - previous.blocked,
            readyDelta: baseline.ready - previous.ready,
            completionRateDelta: baseline.completionRate - previous.completionRate
        };
    }

    function toHabitNumericValue(rawValue, type) {
        if (type === 'checkbox') {
            if (rawValue === true) return 1;
            if (rawValue === false) return 0;
            return Number(rawValue) > 0 ? 1 : 0;
        }
        const parsed = Number(rawValue);
        return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
    }

    function formatDuration(ms) {
        const safeMs = Math.max(0, Number(ms) || 0);
        const totalMinutes = Math.floor(safeMs / 60000);
        const hours = Math.floor(totalMinutes / 60);
        const mins = totalMinutes % 60;
        if (hours > 0) return `${hours}h ${mins}m`;
        return `${mins}m`;
    }

    function formatHabitAggregate(value, type) {
        if (type === 'timer') return formatDuration(value);
        return String(Math.round(Number(value) || 0));
    }

    function formatHabitMetricValue(value, type) {
        if (type === 'timer') return formatDuration(value);
        const rounded = Math.round(Number(value) || 0);
        if (type === 'counter') return `${rounded} ${rounded === 1 ? 'session' : 'sessions'}`;
        return `${rounded} ${rounded === 1 ? 'time' : 'times'}`;
    }

    function formatDueDate(value) {
        if (!value) return 'No due date';
        const parsed = new Date(value);
        if (Number.isNaN(parsed.getTime())) return 'No due date';
        return parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    }

    function getDueTime(value) {
        if (!value) return Infinity;
        const parsed = new Date(value).getTime();
        return Number.isFinite(parsed) ? parsed : Infinity;
    }

    function getDueDayDelta(value, nowTs) {
        const dueTime = getDueTime(value);
        if (!Number.isFinite(dueTime)) return Infinity;
        return Math.ceil((dueTime - nowTs) / DAY_MS);
    }

    function getHabitTypeLabel(type) {
        if (type === 'timer') return 'Timer';
        if (type === 'counter') return 'Counter';
        return 'Check';
    }

    function getHabitTypeDisplay(type) {
        if (type === 'timer') return 'MINUTES';
        if (type === 'counter') return 'COUNT';
        return 'CHECK';
    }

    function getHabitTypeIcon(type) {
        if (type === 'timer') return '⏱';
        if (type === 'counter') return '#';
        return '✓';
    }

    function getHardDependencies(task) {
        return safeArray(task && task.dependencies).filter(dep => dep && dep.type === 'hard');
    }

    function ensureTaskSignals(allNodes) {
        const todayKey = new Date().toISOString().slice(0, 10);
        const needsSignals = safeArray(allNodes).some(node =>
            typeof node._isCritical !== 'boolean'
            || typeof node._isUrgent !== 'boolean'
            || typeof node._isBlocked !== 'boolean'
            || typeof node._isReady !== 'boolean'
        );
        if (!needsSignals && lastSignalRefreshDayKey === todayKey) return;
        if (typeof updateCalculations === 'function') {
            try {
                updateCalculations();
            } catch (error) { }
        } else if (typeof window.updateCalculations === 'function') {
            try {
                window.updateCalculations();
            } catch (error) { }
        }
        lastSignalRefreshDayKey = todayKey;
    }

    function deriveTaskDecision(task, taskLookup, nowTs) {
        const hardDeps = getHardDependencies(task);
        let unresolvedHardDeps = 0;
        const blockingParents = [];

        hardDeps.forEach(dep => {
            const parent = taskLookup.get(dep.id);
            if (!parent) return;
            if (!parent.completed) {
                unresolvedHardDeps += 1;
                blockingParents.push({
                    id: parent.id,
                    title: parent.title || 'Untitled Task'
                });
            }
        });

        const isBlocked = unresolvedHardDeps > 0;
        const isReady = !isBlocked;
        const dueDayDelta = getDueDayDelta(task.dueDate, nowTs);

        let isUrgent = false;
        let isCritical = false;
        if (!task.isManualNotUrgent) {
            const hasEngineUrgent = typeof task._isUrgent === 'boolean';
            const hasEngineCritical = typeof task._isCritical === 'boolean';
            if (hasEngineUrgent || hasEngineCritical) {
                isUrgent = !!task._isUrgent;
                isCritical = !!task._isCritical || isUrgent;
            } else {
                isUrgent = dueDayDelta < 0;
                isCritical = dueDayDelta <= 0;
            }

            if (task.isManualUrgent) {
                isUrgent = true;
                isCritical = true;
            }
        }

        return {
            isBlocked: isBlocked,
            isReady: isReady,
            isUrgent: isUrgent,
            isCritical: isCritical,
            dueDayDelta: dueDayDelta,
            downstreamWeight: Math.max(0, Number(task._downstreamWeight) || 0),
            blockingParents: blockingParents
        };
    }

    function scoreTaskForFocus(task, state) {
        let score = 0;

        if (task.isManualUrgent) score += 240;
        if (state.isUrgent) score += 160;
        if (state.isCritical) score += 120;
        if (state.isReady) score += 60;
        if (state.isBlocked) score += 45;

        if (Number.isFinite(state.dueDayDelta)) {
            if (state.dueDayDelta < 0) {
                score += 180 + Math.min(120, Math.abs(state.dueDayDelta) * 12);
            } else if (state.dueDayDelta === 0) {
                score += 145;
            } else if (state.dueDayDelta === 1) {
                score += 110;
            } else if (state.dueDayDelta <= 3) {
                score += 85 - (state.dueDayDelta * 8);
            } else if (state.dueDayDelta <= 7) {
                score += 32;
            }
        }

        score += Math.min(130, state.downstreamWeight * 12);

        const subtasks = safeArray(task.subtasks);
        if (subtasks.length > 0) {
            const doneCount = subtasks.filter(st => st && st.done).length;
            const remainingRatio = 1 - (doneCount / subtasks.length);
            score += Math.round(remainingRatio * 24);
        }

        return score;
    }

    function sortFocusCandidates(a, b) {
        if (a.focusScore !== b.focusScore) return b.focusScore - a.focusScore;

        const urgentDiff = (b.state.isUrgent ? 1 : 0) - (a.state.isUrgent ? 1 : 0);
        if (urgentDiff !== 0) return urgentDiff;

        const criticalDiff = (b.state.isCritical ? 1 : 0) - (a.state.isCritical ? 1 : 0);
        if (criticalDiff !== 0) return criticalDiff;

        const dueDiff = getDueTime(a.task.dueDate) - getDueTime(b.task.dueDate);
        if (dueDiff !== 0) return dueDiff;

        const titleA = String(a.task.title || '').toLowerCase();
        const titleB = String(b.task.title || '').toLowerCase();
        return titleA.localeCompare(titleB);
    }

    function toDashboardTask(item) {
        return Object.assign({}, item.task, {
            _isBlocked: item.state.isBlocked,
            _isReady: item.state.isReady,
            _isUrgent: item.state.isUrgent,
            _isCritical: item.state.isCritical,
            _focusScore: item.focusScore,
            _dueDayDelta: item.state.dueDayDelta,
            _blockingParents: safeArray(item.state.blockingParents)
        });
    }

    function resolveGoalText(goalId) {
        // Delegates to the shared getGoalTextById in utils.js
        if (!goalId) return '';
        return getGoalTextById(goalId) || '';
    }

    function buildHabitSummary() {
        const now = new Date();
        const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
        const weekStart = new Date(dayStart);
        weekStart.setDate(dayStart.getDate() - 6);

        const list = getHabitsStore().map(habit => {
            const type = habit && habit.type ? habit.type : 'checkbox';
            let week = 0;
            let month = 0;
            let ytd = 0;

            const history = (habit && habit.history && typeof habit.history === 'object') ? habit.history : {};
            Object.entries(history).forEach(([dateKey, rawValue]) => {
                const entryDate = parseDateKey(dateKey);
                if (!entryDate) return;

                const value = toHabitNumericValue(rawValue, type);
                if (entryDate >= weekStart && entryDate <= now) week += value;
                if (entryDate.getFullYear() === now.getFullYear() && entryDate.getMonth() === now.getMonth()) month += value;
                if (entryDate.getFullYear() === now.getFullYear()) ytd += value;
            });

            if (type === 'timer') {
                const activeStart = Number(habit.activeTimerStart);
                const nowTs = Date.now();
                if (Number.isFinite(activeStart) && activeStart > 0 && nowTs > activeStart) {
                    const running = nowTs - activeStart;
                    if (now >= weekStart) week += running;
                    month += running;
                    ytd += running;
                }
            }

            let progressPercent = 0;
            if (typeof getHabitMetrics === 'function') {
                try {
                    const metrics = getHabitMetrics(habit);
                    if (metrics && Number.isFinite(Number(metrics.percent))) {
                        progressPercent = clamp(Math.round(Number(metrics.percent)), 0, 100);
                    }
                } catch (error) { }
            } else if (typeof window.getHabitMetrics === 'function') {
                try {
                    const metrics = window.getHabitMetrics(habit);
                    if (metrics && Number.isFinite(Number(metrics.percent))) {
                        progressPercent = clamp(Math.round(Number(metrics.percent)), 0, 100);
                    }
                } catch (error) { }
            }

            const goalName = resolveGoalText(habit.goalId);

            return {
                id: habit.id,
                title: habit.title || 'Untitled Habit',
                type: type,
                week: week,
                month: month,
                ytd: ytd,
                progressPercent: progressPercent,
                goalName: goalName,
                hasGoalLink: !!goalName
            };
        });

        list.sort((a, b) => {
            const goalDiff = (b.hasGoalLink ? 1 : 0) - (a.hasGoalLink ? 1 : 0);
            if (goalDiff !== 0) return goalDiff;
            return String(a.title || '').localeCompare(String(b.title || ''), undefined, { sensitivity: 'base' });
        });

        return list;
    }

    function buildOuterBranches(allNodes, archivedNodes) {
        const seen = new Set();
        const links = [];

        const addLink = (id, label, url, source) => {
            const safeUrl = String(url || '').trim();
            if (!safeUrl) return;
            const key = safeUrl.toLowerCase();
            if (seen.has(key)) return;
            seen.add(key);
            links.push({
                id: id,
                label: label || safeUrl,
                url: safeUrl,
                source: source
            });
        };

        getQuickLinksStore().forEach(link => {
            const id = link && link.id ? link.id : `ql_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
            const label = (link && typeof link.label === 'string' && link.label.trim()) ? link.label.trim() : '';
            addLink(id, label || (link && link.url), link && link.url, 'quick');
        });

        const taskPool = safeArray(allNodes).concat(safeArray(archivedNodes));
        taskPool.forEach(task => {
            if (!task) return;
            const url = typeof task.externalLink === 'string' ? task.externalLink.trim() : '';
            if (!url) return;
            addLink(`task_link_${task.id}`, task.title || 'Task Link', url, 'task');
        });

        links.sort((a, b) => {
            const sourceDiff = (a.source === 'quick' ? 0 : 1) - (b.source === 'quick' ? 0 : 1);
            if (sourceDiff !== 0) return sourceDiff;
            return String(a.label || '').localeCompare(String(b.label || ''), undefined, { sensitivity: 'base' });
        });

        return links.slice(0, OUTER_BRANCH_LIMIT);
    }

    function calculateCanopyHealth(metrics) {
        const activeCount = Math.max(0, Number(metrics.activeCount) || 0);
        const blockedRatio = activeCount > 0 ? (metrics.blocked / activeCount) : 0;
        const readyRatio = activeCount > 0 ? (metrics.ready / activeCount) : 1;
        const pressureRatio = activeCount > 0
            ? clamp((metrics.critical + metrics.urgent) / Math.max(1, activeCount * 2), 0, 1)
            : 0;
        const completionRatio = clamp((Number(metrics.completionRate) || 0) / 100, 0, 1);

        const habits = safeArray(metrics.habits);
        const habitRatio = habits.length > 0
            ? clamp(habits.reduce((sum, habit) => sum + (Number(habit.progressPercent) || 0), 0) / (habits.length * 100), 0, 1)
            : 0.65;

        let score = 0;
        score += completionRatio * 28;
        score += readyRatio * 26;
        score += (1 - blockedRatio) * 24;
        score += (1 - pressureRatio) * 12;
        score += habitRatio * 10;

        const rounded = clamp(Math.round(score), 0, 100);
        let text = 'Balanced canopy. Keep executing on your current focus path.';

        if (activeCount === 0) {
            text = 'Canopy is clear. Seed a few tasks to keep momentum alive.';
        } else if (metrics.blocked > 0 && rounded < 55) {
            text = 'The ecosystem is congested. Resolve blockers to restore momentum.';
        } else if (rounded >= 80) {
            text = 'Canopy is thriving. Sustain this pace and protect your focus.';
        } else if (rounded < 60) {
            text = 'Canopy health is fragile. Reduce urgency pressure and unblock work.';
        }

        return { score: rounded, text: text };
    }

    function formatRelativeDueLabel(dueDayDelta) {
        if (!Number.isFinite(dueDayDelta)) return 'No due date';
        if (dueDayDelta < 0) return `${Math.abs(dueDayDelta)}d overdue`;
        if (dueDayDelta === 0) return 'Due today';
        if (dueDayDelta === 1) return 'Due tomorrow';
        return `Due in ${dueDayDelta}d`;
    }

    function buildBlockerCauses(analyzedTasks, taskLookup, nowTs) {
        const causesByTask = new Map();

        analyzedTasks.forEach(item => {
            if (!item.state.isBlocked) return;
            const blockedTaskTitle = item.task.title || 'Untitled Task';
            safeArray(item.state.blockingParents).forEach(parentRef => {
                const parentTask = taskLookup.get(parentRef.id);
                if (!parentTask || parentTask.completed) return;

                let existing = causesByTask.get(parentTask.id);
                if (!existing) {
                    const parentState = deriveTaskDecision(parentTask, taskLookup, nowTs);
                    existing = {
                        id: parentTask.id,
                        title: parentTask.title || 'Untitled Task',
                        blockedCount: 0,
                        blockedTaskTitles: [],
                        downstreamWeight: Math.max(0, Number(parentTask._downstreamWeight) || 0),
                        isUrgent: parentState.isUrgent,
                        isCritical: parentState.isCritical,
                        dueDayDelta: parentState.dueDayDelta,
                        dueDate: parentTask.dueDate || ''
                    };
                    causesByTask.set(parentTask.id, existing);
                }

                existing.blockedCount += 1;
                if (existing.blockedTaskTitles.length < 3) {
                    existing.blockedTaskTitles.push(blockedTaskTitle);
                }
            });
        });

        return Array.from(causesByTask.values())
            .sort((a, b) => {
                if (b.blockedCount !== a.blockedCount) return b.blockedCount - a.blockedCount;
                const urgencyDiff = (b.isUrgent ? 1 : 0) - (a.isUrgent ? 1 : 0);
                if (urgencyDiff !== 0) return urgencyDiff;
                if (b.downstreamWeight !== a.downstreamWeight) return b.downstreamWeight - a.downstreamWeight;
                const dueDiff = getDueTime(a.dueDate) - getDueTime(b.dueDate);
                if (dueDiff !== 0) return dueDiff;
                return String(a.title || '').localeCompare(String(b.title || ''), undefined, { sensitivity: 'base' });
            })
            .slice(0, BLOCKER_LIMIT);
    }

    function buildDashboardModel() {
        const allNodes = getNodesStore();
        ensureTaskSignals(allNodes);

        const activeNodes = allNodes.filter(node => !node.completed);
        const archived = getArchivedNodesStore();
        const taskLookup = new Map(allNodes.map(node => [node.id, node]));
        const nowTs = Date.now();

        const analyzedTasks = activeNodes.map(task => {
            const state = deriveTaskDecision(task, taskLookup, nowTs);
            return {
                task: task,
                state: state,
                focusScore: scoreTaskForFocus(task, state)
            };
        });

        const critical = analyzedTasks.filter(item => item.state.isCritical).length;
        const urgent = analyzedTasks.filter(item => item.state.isUrgent).length;
        const blocked = analyzedTasks.filter(item => item.state.isBlocked).length;
        const ready = analyzedTasks.filter(item => item.state.isReady).length;

        const completedInMainGraph = allNodes.filter(node => node.completed).length;
        const completionNumerator = archived.length + completedInMainGraph;
        const completionDenominator = Math.max(1, allNodes.length + archived.length);
        const completionRate = Math.round((completionNumerator / completionDenominator) * 100);

        const rankedByFocus = analyzedTasks.slice().sort(sortFocusCandidates);
        const doNowTasks = rankedByFocus
            .filter(item => item.state.isReady)
            .slice(0, PRIORITY_LIMIT)
            .map(toDashboardTask);

        const unblockTasks = rankedByFocus
            .filter(item => item.state.isBlocked)
            .slice(0, UNBLOCK_LIMIT)
            .map(toDashboardTask);

        const blockerCauses = buildBlockerCauses(analyzedTasks, taskLookup, nowTs);
        const trends = buildTrendDeltas({
            critical: critical,
            urgent: urgent,
            blocked: blocked,
            ready: ready,
            completionRate: completionRate
        });

        const habits = buildHabitSummary();
        const health = calculateCanopyHealth({
            activeCount: activeNodes.length,
            blocked: blocked,
            ready: ready,
            critical: critical,
            urgent: urgent,
            completionRate: completionRate,
            habits: habits
        });

        return {
            dateText: `Seasonal Growth • ${new Date().toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}`,
            critical: critical,
            urgent: urgent,
            blocked: blocked,
            ready: ready,
            completionRate: clamp(completionRate, 0, 100),
            trends: trends,
            healthScore: health.score,
            healthText: health.text,
            doNowTasks: doNowTasks,
            unblockTasks: unblockTasks,
            blockerCauses: blockerCauses,
            habits: habits,
            outerBranches: buildOuterBranches(allNodes, archived),
            startupEnabled: shouldOpenDashboardOnStartup()
        };
    }

    function summarizeBlockingParents(blockingParents) {
        const list = safeArray(blockingParents);
        if (list.length === 0) return 'Blocked by unresolved dependencies';
        const names = list.slice(0, 2).map(parent => parent.title || 'Untitled Task');
        const moreCount = Math.max(0, list.length - names.length);
        if (moreCount > 0) return `Blocked by ${names.join(', ')} +${moreCount} more`;
        return `Blocked by ${names.join(', ')}`;
    }

    function buildTaskReason(task, showBlockingContext) {
        const parts = [];
        if (showBlockingContext && task._isBlocked) {
            parts.push(summarizeBlockingParents(task._blockingParents));
        }
        if (Number.isFinite(task._dueDayDelta)) {
            parts.push(formatRelativeDueLabel(task._dueDayDelta));
        }
        const downstreamWeight = Math.max(0, Number(task._downstreamWeight) || 0);
        if (downstreamWeight > 0) {
            parts.push(`${downstreamWeight} downstream`);
        }
        return parts.join(' • ');
    }

    function renderTaskFocusList(listId, tasks, emptyMessage, showBlockingContext = false) {
        const list = document.getElementById(listId);
        if (!list) return;
        list.innerHTML = '';

        if (!tasks.length) {
            list.innerHTML = `<div class="insights-empty">${escapeHtml(emptyMessage)}</div>`;
            return;
        }

        tasks.forEach(task => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'insights-priority-item';

            const tags = [];
            if (task._isBlocked) tags.push('<span class="insights-tag blocked">Blocked</span>');
            if (task._isCritical) tags.push('<span class="insights-tag critical">Critical</span>');
            if (task._isUrgent) tags.push('<span class="insights-tag urgent">Urgent</span>');
            if (task._isReady && !task._isBlocked) tags.push('<span class="insights-tag ready">Ready</span>');

            const reason = buildTaskReason(task, showBlockingContext);
            const reasonHtml = reason ? `<div class="insights-priority-meta">${escapeHtml(reason)}</div>` : '';
            btn.innerHTML = `
                <div class="insights-priority-top">
                    <h3 class="insights-priority-title">${escapeHtml(task.title || 'Untitled Task')}</h3>
                    <span class="insights-priority-due">${escapeHtml(formatDueDate(task.dueDate))}</span>
                </div>
                ${reasonHtml}
                <div class="insights-priority-tags">${tags.join('')}</div>
            `;

            btn.addEventListener('click', () => {
                if (typeof window.jumpToTask === 'function') {
                    window.jumpToTask(task.id);
                }
                closeInsightsDashboard();
            });
            list.appendChild(btn);
        });
    }

    function renderFocusSplit(model) {
        renderTaskFocusList('insights-do-now-list', model.doNowTasks, 'No ready tasks. Clear blockers first.');
        renderTaskFocusList('insights-unblock-list', model.unblockTasks, 'No blocked tasks. Momentum is clear.', true);
    }

    function renderHabitSummary(habits) {
        const list = document.getElementById('insights-habits-list');
        if (!list) return;
        list.innerHTML = '';

        if (habits.length === 0) {
            list.innerHTML = '<div class="insights-empty">No habits tracked yet.</div>';
            return;
        }

        habits.forEach(habit => {
            const row = document.createElement('div');
            row.className = 'insights-habit-item';
            const goalLabel = habit.goalName
                ? `<span class="insights-habit-goal" title="${escapeHtml(habit.goalName)}">• ${escapeHtml(habit.goalName)}</span>`
                : '';
            row.innerHTML = `
                <div class="insights-habit-main">
                    <div class="insights-habit-icon insights-habit-icon-${escapeHtml(habit.type)}">${escapeHtml(getHabitTypeIcon(habit.type))}</div>
                    <div class="insights-habit-copy">
                        <div class="insights-habit-title">${escapeHtml(habit.title)}</div>
                        <div class="insights-habit-type-line">TYPE: ${escapeHtml(getHabitTypeDisplay(habit.type))} ${goalLabel}</div>
                    </div>
                </div>
                <div class="insights-habit-divider"></div>
                <div class="insights-habit-metric">
                    <strong>${escapeHtml(formatHabitMetricValue(habit.week, habit.type))}</strong>
                    <span>This Week</span>
                </div>
                <div class="insights-habit-metric">
                    <strong>${escapeHtml(formatHabitMetricValue(habit.month, habit.type))}</strong>
                    <span>This Month</span>
                </div>
                <div class="insights-habit-metric ytd">
                    <strong>${escapeHtml(formatHabitMetricValue(habit.ytd, habit.type))}</strong>
                    <span>YTD Total</span>
                </div>
            `;
            list.appendChild(row);
        });
    }

    function renderQuickLinks(links) {
        const list = document.getElementById('insights-quick-links');
        if (!list) return;
        list.innerHTML = '';

        if (!Array.isArray(links) || links.length === 0) {
            list.innerHTML = '<div class="insights-empty">No outer branches linked yet.</div>';
            return;
        }

        links.forEach(link => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'insights-link-item';
            const label = link && link.label ? link.label : (link && link.url ? link.url : 'Link');
            btn.textContent = link && link.source === 'task' ? `↗ ${label}` : label;
            btn.addEventListener('click', () => {
                const url = (link && typeof link.url === 'string') ? link.url.trim() : '';
                if (!url) return;
                const isExternal = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(url);
                if (isExternal) window.open(url, '_blank', 'noopener,noreferrer');
                else window.location.href = url;
            });
            list.appendChild(btn);
        });
    }

    function renderBlockers(blockerCauses) {
        const card = document.getElementById('insights-blockers-card');
        const list = document.getElementById('insights-blockers-list');
        if (!card || !list) return;

        if (!Array.isArray(blockerCauses) || blockerCauses.length === 0) {
            card.classList.add('hidden');
            list.innerHTML = '';
            return;
        }

        card.classList.remove('hidden');
        list.innerHTML = '';

        blockerCauses.forEach(cause => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'insights-blocker-item';

            const preview = safeArray(cause.blockedTaskTitles);
            const previewText = preview.join(', ');
            const extraCount = Math.max(0, cause.blockedCount - preview.length);
            const heldUpText = extraCount > 0 ? `${previewText} +${extraCount} more` : previewText;

            const tags = [];
            if (cause.isUrgent) tags.push('<span class="insights-tag urgent">Urgent</span>');
            else if (cause.isCritical) tags.push('<span class="insights-tag critical">Critical</span>');
            if (cause.downstreamWeight > 0) tags.push(`<span class="insights-tag blocked">${escapeHtml(`${cause.downstreamWeight} downstream`)}</span>`);

            const dueLabel = formatRelativeDueLabel(cause.dueDayDelta);
            btn.innerHTML = `
                <div class="insights-blocker-top">
                    <h3 class="insights-blocker-title">${escapeHtml(cause.title || 'Untitled Task')}</h3>
                    <span class="insights-blocker-count">${escapeHtml(`${cause.blockedCount} blocked`)}</span>
                </div>
                <div class="insights-priority-tags">${tags.join('')}</div>
                <div class="insights-blocker-meta">${escapeHtml(`Why now: ${dueLabel}`)}</div>
                <div class="insights-blocker-meta">${escapeHtml(`Holding: ${heldUpText || 'Dependency chain'}`)}</div>
            `;

            btn.addEventListener('click', () => {
                if (typeof window.jumpToTask === 'function') {
                    window.jumpToTask(cause.id);
                }
                closeInsightsDashboard();
            });

            list.appendChild(btn);
        });
    }

    function renderDeltaValue(el, delta, label, positiveIsGood, isPercent = false) {
        if (!el) return;
        el.classList.remove('is-good', 'is-bad', 'is-neutral');

        if (!Number.isFinite(delta)) {
            el.textContent = 'No baseline';
            el.classList.add('is-neutral');
            return;
        }

        if (delta === 0) {
            el.textContent = `No change ${label}`;
            el.classList.add('is-neutral');
            return;
        }

        const magnitude = Math.abs(delta);
        const amount = isPercent ? `${magnitude}pt` : String(magnitude);
        const direction = delta > 0 ? '↑' : '↓';
        const positiveDirectionIsGood = delta > 0 ? positiveIsGood : !positiveIsGood;
        el.classList.add(positiveDirectionIsGood ? 'is-good' : 'is-bad');
        el.textContent = `${direction}${amount} ${label}`;
    }

    function renderHeader(model) {
        const dateEl = document.getElementById('insights-dashboard-date');
        const completionEl = document.getElementById('insights-completion-rate');
        const completionDeltaEl = document.getElementById('insights-completion-delta');
        const scoreEl = document.getElementById('insights-health-score');
        const healthTextEl = document.getElementById('insights-health-text');
        const startupToggle = document.getElementById('insights-dashboard-startup-toggle');

        const criticalEl = document.getElementById('insights-stat-critical');
        const urgentEl = document.getElementById('insights-stat-urgent');
        const blockedEl = document.getElementById('insights-stat-blocked');
        const readyEl = document.getElementById('insights-stat-ready');
        const criticalDeltaEl = document.getElementById('insights-stat-critical-delta');
        const urgentDeltaEl = document.getElementById('insights-stat-urgent-delta');
        const blockedDeltaEl = document.getElementById('insights-stat-blocked-delta');
        const readyDeltaEl = document.getElementById('insights-stat-ready-delta');
        const ringEl = document.querySelector('.insights-health-ring');

        if (dateEl) dateEl.textContent = model.dateText;
        if (completionEl) completionEl.textContent = `${model.completionRate}%`;
        if (scoreEl) scoreEl.textContent = `${model.healthScore}%`;
        if (startupToggle) startupToggle.checked = !!model.startupEnabled;

        if (criticalEl) criticalEl.textContent = String(model.critical);
        if (urgentEl) urgentEl.textContent = String(model.urgent);
        if (blockedEl) blockedEl.textContent = String(model.blocked);
        if (readyEl) readyEl.textContent = String(model.ready);

        if (ringEl) ringEl.style.setProperty('--progress', `${model.healthScore}%`);
        if (healthTextEl) healthTextEl.textContent = model.healthText;

        const trend = model.trends || {};
        const trendLabel = trend.label || 'No baseline';
        renderDeltaValue(criticalDeltaEl, trend.criticalDelta, trendLabel, false);
        renderDeltaValue(urgentDeltaEl, trend.urgentDelta, trendLabel, false);
        renderDeltaValue(blockedDeltaEl, trend.blockedDelta, trendLabel, false);
        renderDeltaValue(readyDeltaEl, trend.readyDelta, trendLabel, true);
        renderDeltaValue(completionDeltaEl, trend.completionRateDelta, trendLabel, true, true);
    }

    function isInsightsDashboardOpen() {
        const overlay = document.getElementById('insights-dashboard-overlay');
        return !!overlay && !overlay.classList.contains('hidden');
    }

    function syncDashboardButtonState() {
        const btn = document.getElementById('btn-dashboard');
        if (!btn) return;
        const open = isInsightsDashboardOpen();
        btn.classList.toggle('active', open);
        btn.setAttribute('aria-pressed', open ? 'true' : 'false');
    }

    function renderInsightsDashboard() {
        const model = buildDashboardModel();
        renderHeader(model);
        renderFocusSplit(model);
        renderHabitSummary(model.habits);
        renderQuickLinks(model.outerBranches);
        renderBlockers(model.blockerCauses);
    }

    function openInsightsDashboard() {
        const overlay = document.getElementById('insights-dashboard-overlay');
        if (!overlay) return;
        if (typeof updateDataMetrics === 'function') updateDataMetrics();
        if (typeof updateBackupStatusUI === 'function') updateBackupStatusUI();
        if (typeof updateHealthMonitor === 'function') updateHealthMonitor();
        const hdSync = document.getElementById('hd-sync');
        const reviewSync = document.getElementById('review-health-sync');
        if (hdSync && reviewSync) reviewSync.textContent = hdSync.textContent;
        renderInsightsDashboard();
        overlay.classList.remove('hidden');
        syncDashboardButtonState();
    }

    function closeInsightsDashboard() {
        const overlay = document.getElementById('insights-dashboard-overlay');
        if (!overlay) return;
        overlay.classList.add('hidden');
        syncDashboardButtonState();
    }

    function toggleInsightsDashboard(forceOpen) {
        if (forceOpen === true) {
            openInsightsDashboard();
            return;
        }
        if (forceOpen === false) {
            closeInsightsDashboard();
            return;
        }
        if (isInsightsDashboardOpen()) closeInsightsDashboard();
        else openInsightsDashboard();
    }

    function shouldOpenDashboardOnStartup() {
        try {
            return localStorage.getItem(DASHBOARD_PREF_KEY) !== 'false';
        } catch (error) {
            return true;
        }
    }

    function setDashboardStartupPreference(enabled) {
        try {
            localStorage.setItem(DASHBOARD_PREF_KEY, enabled ? 'true' : 'false');
        } catch (error) { }
        const toggle = document.getElementById('insights-dashboard-startup-toggle');
        if (toggle) toggle.checked = !!enabled;
        if (typeof window.showNotification === 'function') {
            window.showNotification(enabled ? 'Dashboard will open on launch' : 'Dashboard auto-open disabled');
        }
    }

    window.toggleInsightsDashboard = toggleInsightsDashboard;
    window.openInsightsDashboard = openInsightsDashboard;
    window.closeInsightsDashboard = closeInsightsDashboard;
    window.renderInsightsDashboard = renderInsightsDashboard;
    window.setDashboardStartupPreference = setDashboardStartupPreference;
    window.shouldOpenDashboardOnStartup = shouldOpenDashboardOnStartup;

    document.addEventListener('DOMContentLoaded', syncDashboardButtonState);
})();
