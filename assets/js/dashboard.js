(function () {
    const DASHBOARD_PREF_KEY = 'urgencyFlow_dashboard_open_on_startup';
    const TREND_SNAPSHOT_KEY = 'urgencyFlow_canopy_daily_trends_v1';
    const TREND_RETENTION_DAYS = 45;
    const PRIORITY_LIMIT = 5;
    const UNBLOCK_LIMIT = 5;
    const BLOCKER_LIMIT = 6;
    const OUTER_BRANCH_LIMIT = 12;
    const PROJECT_RISK_LIMIT = 6;
    const DAY_MS = 24 * 60 * 60 * 1000;
    const DASHBOARD_PROJECT_STATUS_LABELS = {
        active: 'Active',
        paused: 'Paused',
        completed: 'Completed',
        archived: 'Archived'
    };
    const DASHBOARD_PROJECT_URGENCY_LABELS = {
        1: 'Lowest',
        2: 'Normal',
        3: 'Medium',
        4: 'High',
        5: 'Critical'
    };
    const DASHBOARD_PROJECT_URGENCY_TAGS = {
        1: 'LOWEST',
        2: 'NORMAL',
        3: 'MEDIUM',
        4: 'HIGH',
        5: 'CRITICAL'
    };

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

    function getProjectsStore() {
        if (typeof projects !== 'undefined' && Array.isArray(projects)) return projects;
        return safeArray(window.projects);
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
            const isArchived = typeof isHabitArchived === 'function'
                ? isHabitArchived(habit)
                : (Number(habit && habit.archivedAt) > 0);
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

            let progressPercent = isArchived ? 100 : 0;
            if (!isArchived) {
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
                goalId: habit.goalId || null,
                goalName: goalName,
                hasGoalLink: !!goalName,
                isArchived: isArchived
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

    function normalizeDashboardProjectStatus(status) {
        const normalized = String(status || '').trim().toLowerCase();
        if (normalized === 'paused') return 'paused';
        if (normalized === 'completed') return 'completed';
        if (normalized === 'archived') return 'archived';
        return 'active';
    }

    function getDashboardProjectStatusLabel(status) {
        const normalized = normalizeDashboardProjectStatus(status);
        return DASHBOARD_PROJECT_STATUS_LABELS[normalized] || 'Active';
    }

    function getDashboardUrgencyLevelFromScore(score) {
        const numericScore = clamp(Number(score) || 0, 0, 100);
        if (numericScore >= 86) return 5;
        if (numericScore >= 68) return 4;
        if (numericScore >= 48) return 3;
        if (numericScore >= 26) return 2;
        return 1;
    }

    function getProjectTaskStatsForDashboard(projectId, allNodes, archivedNodes) {
        const statsFn = (typeof getProjectTaskStats === 'function')
            ? getProjectTaskStats
            : (typeof window.getProjectTaskStats === 'function' ? window.getProjectTaskStats : null);

        if (statsFn) {
            try {
                const helperStats = statsFn(projectId) || {};
                const active = Math.max(0, Number(helperStats.active) || 0);
                const done = Math.max(0, Number(helperStats.done) || 0);
                const total = Math.max(active + done, Number(helperStats.total) || 0);
                return { active: active, done: done, total: total };
            } catch (error) { }
        }

        const normalizedId = String(projectId || '').trim();
        if (!normalizedId) return { active: 0, done: 0, total: 0 };
        const active = safeArray(allNodes).filter(task => task && !task.completed && String(task.projectId || '').trim() === normalizedId).length;
        const done = safeArray(allNodes).filter(task => task && task.completed && String(task.projectId || '').trim() === normalizedId).length
            + safeArray(archivedNodes).filter(task => task && String(task.projectId || '').trim() === normalizedId).length;
        return {
            active: active,
            done: done,
            total: active + done
        };
    }

    function scoreProjectUrgencyTaskFallback(entry) {
        const task = entry && entry.task ? entry.task : {};
        const state = entry && entry.state ? entry.state : {};
        let score = 0;

        if (task.isManualUrgent) score = Math.max(score, 100);
        if (state.isUrgent) score = Math.max(score, 92);
        else if (state.isCritical) score = Math.max(score, 78);
        else if (state.isBlocked) score = Math.max(score, 44);

        const dueDayDelta = Number(state.dueDayDelta);
        if (Number.isFinite(dueDayDelta)) {
            if (dueDayDelta <= 0) score += 40;
            else if (dueDayDelta <= 1) score += 34;
            else if (dueDayDelta <= 3) score += 26;
            else if (dueDayDelta <= 7) score += 18;
            else if (dueDayDelta <= 14) score += 10;
        }

        score += Math.min(22, Math.max(0, Number(state.downstreamWeight) || 0) * 3);
        if (state.isBlocked) score += 14;

        return clamp(Math.round(score), 0, 100);
    }

    function getProjectUrgencyMetaForDashboard(projectId, activeEntries) {
        const urgencyFn = (typeof getProjectUrgencyMeta === 'function')
            ? getProjectUrgencyMeta
            : (typeof window.getProjectUrgencyMeta === 'function' ? window.getProjectUrgencyMeta : null);

        if (urgencyFn) {
            try {
                const meta = urgencyFn(projectId);
                if (meta && Number.isFinite(Number(meta.score))) {
                    const score = clamp(Math.round(Number(meta.score) || 0), 0, 100);
                    const level = clamp(Math.round(Number(meta.level) || getDashboardUrgencyLevelFromScore(score)), 1, 5);
                    return {
                        score: score,
                        level: level,
                        label: String(meta.label || DASHBOARD_PROJECT_URGENCY_LABELS[level] || 'Lowest'),
                        tag: String(meta.tag || DASHBOARD_PROJECT_URGENCY_TAGS[level] || 'LOWEST')
                    };
                }
            } catch (error) { }
        }

        const entries = safeArray(activeEntries);
        if (entries.length === 0) {
            return {
                score: 0,
                level: 1,
                label: DASHBOARD_PROJECT_URGENCY_LABELS[1],
                tag: DASHBOARD_PROJECT_URGENCY_TAGS[1]
            };
        }

        let peakScore = 0;
        let totalScore = 0;
        let overdueCount = 0;
        let blockedCount = 0;
        let urgentCount = 0;
        let criticalCount = 0;

        entries.forEach(entry => {
            const state = entry && entry.state ? entry.state : {};
            const taskScore = scoreProjectUrgencyTaskFallback(entry);
            peakScore = Math.max(peakScore, taskScore);
            totalScore += taskScore;
            if (state.isBlocked) blockedCount += 1;
            if (state.isUrgent) urgentCount += 1;
            else if (state.isCritical) criticalCount += 1;
            if (Number.isFinite(Number(state.dueDayDelta)) && Number(state.dueDayDelta) < 0) overdueCount += 1;
        });

        const averageScore = totalScore / entries.length;
        const score = clamp(Math.round(
            (peakScore * 0.62)
            + (averageScore * 0.38)
            + Math.min(14, overdueCount * 6)
            + Math.min(10, blockedCount * 3)
            + Math.min(8, urgentCount * 2)
            + Math.min(4, criticalCount)
        ), 0, 100);
        const level = getDashboardUrgencyLevelFromScore(score);
        return {
            score: score,
            level: level,
            label: DASHBOARD_PROJECT_URGENCY_LABELS[level] || 'Lowest',
            tag: DASHBOARD_PROJECT_URGENCY_TAGS[level] || 'LOWEST'
        };
    }

    function buildProjectPortfolio(allNodes, archivedNodes) {
        const projectList = getProjectsStore().filter(project => project && String(project.id || '').trim());
        const statusCounts = {
            active: 0,
            paused: 0,
            completed: 0,
            archived: 0
        };

        projectList.forEach(project => {
            const status = normalizeDashboardProjectStatus(project.status);
            statusCounts[status] += 1;
        });

        const validProjectIds = new Set(projectList.map(project => String(project.id || '').trim()).filter(Boolean));
        const getTaskProjectId = (task) => String(task && task.projectId || '').trim();
        const isLinkedTask = (task) => validProjectIds.has(getTaskProjectId(task));
        const hasProjectRef = (task) => !!getTaskProjectId(task);

        const linkedActiveTasks = safeArray(allNodes).filter(task => task && !task.completed && isLinkedTask(task)).length;
        const linkedDoneTasks = safeArray(allNodes).filter(task => task && task.completed && isLinkedTask(task)).length
            + safeArray(archivedNodes).filter(task => isLinkedTask(task)).length;
        const firstUnassignedActiveTask = safeArray(allNodes).find(task => task && !task.completed && !hasProjectRef(task));
        const unassignedActiveTasks = safeArray(allNodes).filter(task => task && !task.completed && !hasProjectRef(task)).length;
        const unassignedDoneTasks = safeArray(allNodes).filter(task => task && task.completed && !hasProjectRef(task)).length
            + safeArray(archivedNodes).filter(task => !hasProjectRef(task)).length;
        const orphanedActiveTasks = safeArray(allNodes).filter(task => task && !task.completed && hasProjectRef(task) && !isLinkedTask(task)).length;
        const orphanedDoneTasks = safeArray(allNodes).filter(task => task && task.completed && hasProjectRef(task) && !isLinkedTask(task)).length
            + safeArray(archivedNodes).filter(task => hasProjectRef(task) && !isLinkedTask(task)).length;

        return {
            totalProjects: projectList.length,
            statusCounts: statusCounts,
            linkedActiveTasks: linkedActiveTasks,
            linkedDoneTasks: linkedDoneTasks,
            linkedTotalTasks: linkedActiveTasks + linkedDoneTasks,
            unassignedActiveTasks: unassignedActiveTasks,
            unassignedDoneTasks: unassignedDoneTasks,
            unassignedTotalTasks: unassignedActiveTasks + unassignedDoneTasks,
            firstUnassignedTaskId: firstUnassignedActiveTask ? String(firstUnassignedActiveTask.id || '') : '',
            orphanedActiveTasks: orphanedActiveTasks,
            orphanedDoneTasks: orphanedDoneTasks,
            orphanedTotalTasks: orphanedActiveTasks + orphanedDoneTasks
        };
    }

    function buildProjectRisks(allNodes, archivedNodes, analyzedTasks) {
        const projectList = getProjectsStore().filter(project => project && String(project.id || '').trim());
        if (projectList.length === 0) return [];

        const activeEntriesByProject = new Map();
        safeArray(analyzedTasks).forEach(entry => {
            const projectId = String(entry && entry.task && entry.task.projectId || '').trim();
            if (!projectId) return;

            let bucket = activeEntriesByProject.get(projectId);
            if (!bucket) {
                bucket = {
                    entries: [],
                    blockedCount: 0,
                    overdueCount: 0,
                    dueSoonCount: 0,
                    nextDueDayDelta: Infinity
                };
                activeEntriesByProject.set(projectId, bucket);
            }

            bucket.entries.push(entry);
            const state = entry && entry.state ? entry.state : {};
            if (state.isBlocked) bucket.blockedCount += 1;
            const dueDayDelta = Number(state.dueDayDelta);
            if (Number.isFinite(dueDayDelta)) {
                if (dueDayDelta < 0) bucket.overdueCount += 1;
                if (dueDayDelta <= 3) bucket.dueSoonCount += 1;
                if (dueDayDelta < bucket.nextDueDayDelta) bucket.nextDueDayDelta = dueDayDelta;
            }
        });

        const rows = [];

        projectList.forEach(project => {
            const projectId = String(project.id || '').trim();
            if (!projectId) return;

            const status = normalizeDashboardProjectStatus(project.status);
            if (status === 'completed' || status === 'archived') return;

            const bucket = activeEntriesByProject.get(projectId) || {
                entries: [],
                blockedCount: 0,
                overdueCount: 0,
                dueSoonCount: 0,
                nextDueDayDelta: Infinity
            };
            const stats = getProjectTaskStatsForDashboard(projectId, allNodes, archivedNodes);
            if ((stats.active || 0) <= 0) return;

            const urgency = getProjectUrgencyMetaForDashboard(projectId, bucket.entries);
            const isAtRisk = urgency.level >= 3
                || bucket.overdueCount > 0
                || bucket.blockedCount > 0
                || bucket.dueSoonCount > 0;
            if (!isAtRisk) return;

            rows.push({
                id: projectId,
                name: String(project.name || 'Untitled Project'),
                status: status,
                statusLabel: getDashboardProjectStatusLabel(status),
                urgencyScore: urgency.score,
                urgencyLevel: urgency.level,
                urgencyTag: urgency.tag,
                urgencyLabel: urgency.label,
                activeTasks: stats.active,
                doneTasks: stats.done,
                totalTasks: stats.total,
                blockedCount: bucket.blockedCount,
                overdueCount: bucket.overdueCount,
                dueSoonCount: bucket.dueSoonCount,
                nextDueDayDelta: Number.isFinite(bucket.nextDueDayDelta) ? bucket.nextDueDayDelta : Infinity,
                updatedAt: Number(project.updatedAt) || 0
            });
        });

        return rows
            .sort((a, b) => {
                if (b.urgencyScore !== a.urgencyScore) return b.urgencyScore - a.urgencyScore;
                if (b.overdueCount !== a.overdueCount) return b.overdueCount - a.overdueCount;
                if (b.blockedCount !== a.blockedCount) return b.blockedCount - a.blockedCount;
                const dueA = Number.isFinite(a.nextDueDayDelta) ? a.nextDueDayDelta : Infinity;
                const dueB = Number.isFinite(b.nextDueDayDelta) ? b.nextDueDayDelta : Infinity;
                if (dueA !== dueB) return dueA - dueB;
                if (b.activeTasks !== a.activeTasks) return b.activeTasks - a.activeTasks;
                if (b.updatedAt !== a.updatedAt) return b.updatedAt - a.updatedAt;
                return String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' });
            })
            .slice(0, PROJECT_RISK_LIMIT);
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
        const projectPortfolio = buildProjectPortfolio(allNodes, archived);
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
        const projectRisks = buildProjectRisks(allNodes, archived, analyzedTasks);
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
            projectPortfolio: projectPortfolio,
            projectRisks: projectRisks,
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
            const goalStyle = habit.goalId ? getGoalColorBoxInlineStyle(habit.goalId) : '';
            const goalLabel = habit.goalName
                ? `<span class="insights-habit-goal" style="${goalStyle}" title="${escapeHtml(habit.goalName)}">🎯 ${escapeHtml(habit.goalName)}</span>`
                : '';
            const completedLabel = habit.isArchived
                ? '<span class="insights-habit-goal">• Completed</span>'
                : '';
            row.innerHTML = `
                <div class="insights-habit-main">
                    <div class="insights-habit-icon insights-habit-icon-${escapeHtml(habit.type)}">${escapeHtml(getHabitTypeIcon(habit.type))}</div>
                    <div class="insights-habit-copy">
                        <div class="insights-habit-title">${escapeHtml(habit.title)}</div>
                        <div class="insights-habit-type-line">TYPE: ${escapeHtml(getHabitTypeDisplay(habit.type))} ${goalLabel} ${completedLabel}</div>
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

    function createInsightsProjectActionButton(label, onClick, tone = 'default') {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `insights-project-action-btn tone-${escapeHtml(String(tone || 'default'))}`;
        button.textContent = String(label || 'Action');
        button.addEventListener('click', (event) => {
            event.stopPropagation();
            if (typeof onClick === 'function') onClick();
        });
        return button;
    }

    function openProjectsPanelFromDashboard(options = {}) {
        const safeOptions = options && typeof options === 'object' ? options : {};
        const projectId = String(safeOptions.projectId || '').trim();
        const sortMode = Object.prototype.hasOwnProperty.call(safeOptions, 'sortMode')
            ? String(safeOptions.sortMode || '')
            : null;
        const hasUrgencyFilter = Object.prototype.hasOwnProperty.call(safeOptions, 'urgencyFilter');
        const urgencyFilter = hasUrgencyFilter ? String(safeOptions.urgencyFilter || '') : null;
        const shouldOpenDetails = !!safeOptions.openDetails;
        const shouldFocusCreateInput = !!safeOptions.focusCreateInput;

        const focusFn = (typeof focusProjectInProjectsPanel === 'function')
            ? focusProjectInProjectsPanel
            : (typeof window.focusProjectInProjectsPanel === 'function' ? window.focusProjectInProjectsPanel : null);

        if (projectId && focusFn) {
            const focusOptions = {
                openPanel: safeOptions.openPanel !== false,
                openDetails: shouldOpenDetails,
                scrollIntoView: safeOptions.scrollIntoView !== false
            };
            if (sortMode) focusOptions.sortMode = sortMode;
            if (hasUrgencyFilter) focusOptions.urgencyFilter = urgencyFilter;
            const focused = !!focusFn(projectId, focusOptions);
            if (focused) {
                if (shouldFocusCreateInput) {
                    window.setTimeout(() => {
                        const input = document.getElementById('new-project-input');
                        if (!input) return;
                        input.focus();
                        input.select();
                    }, 40);
                }
                closeInsightsDashboard();
                return true;
            }
        }

        const sortFn = (typeof setProjectsPanelSort === 'function')
            ? setProjectsPanelSort
            : (typeof window.setProjectsPanelSort === 'function' ? window.setProjectsPanelSort : null);
        if (sortMode && sortFn) sortFn(sortMode);

        const urgencyFn = (typeof setProjectsPanelUrgencyFilter === 'function')
            ? setProjectsPanelUrgencyFilter
            : (typeof window.setProjectsPanelUrgencyFilter === 'function' ? window.setProjectsPanelUrgencyFilter : null);
        if (hasUrgencyFilter && urgencyFn) urgencyFn(urgencyFilter);

        const toggleFn = (typeof toggleProjectsPanel === 'function')
            ? toggleProjectsPanel
            : (typeof window.toggleProjectsPanel === 'function' ? window.toggleProjectsPanel : null);
        const detailsFn = (typeof openProjectDetailsModal === 'function')
            ? openProjectDetailsModal
            : (typeof window.openProjectDetailsModal === 'function' ? window.openProjectDetailsModal : null);

        if (toggleFn) toggleFn(true);
        if (projectId && shouldOpenDetails && detailsFn) detailsFn(projectId);

        if (shouldFocusCreateInput) {
            window.setTimeout(() => {
                const input = document.getElementById('new-project-input');
                if (!input) return;
                input.focus();
                input.select();
            }, 40);
        }

        if (toggleFn || (projectId && shouldOpenDetails && detailsFn)) {
            closeInsightsDashboard();
            return true;
        }
        return false;
    }

    function renderProjectPortfolio(portfolio) {
        const container = document.getElementById('insights-project-portfolio');
        if (!container) return;
        container.innerHTML = '';

        const data = portfolio && typeof portfolio === 'object' ? portfolio : {};
        const totalProjects = Math.max(0, Number(data.totalProjects) || 0);
        if (totalProjects === 0) {
            const empty = document.createElement('div');
            empty.className = 'insights-empty';
            empty.textContent = 'No projects yet. Create one in the Projects panel.';
            container.appendChild(empty);

            const emptyActions = document.createElement('div');
            emptyActions.className = 'insights-project-actions';
            emptyActions.appendChild(createInsightsProjectActionButton('Open Projects', () => {
                openProjectsPanelFromDashboard({ openPanel: true });
            }));
            emptyActions.appendChild(createInsightsProjectActionButton('New Project', () => {
                openProjectsPanelFromDashboard({ openPanel: true, urgencyFilter: 'all', focusCreateInput: true });
            }, 'accent'));
            container.appendChild(emptyActions);
            return;
        }

        const statusCounts = data.statusCounts && typeof data.statusCounts === 'object'
            ? data.statusCounts
            : { active: 0, paused: 0, completed: 0, archived: 0 };
        const rows = [
            { label: 'Projects', value: totalProjects },
            { label: 'Active', value: Number(statusCounts.active) || 0 },
            { label: 'Paused', value: Number(statusCounts.paused) || 0 },
            { label: 'Completed', value: Number(statusCounts.completed) || 0 },
            { label: 'Archived', value: Number(statusCounts.archived) || 0 },
            { label: 'Linked Tasks', value: Number(data.linkedTotalTasks) || 0 },
            { label: 'Unassigned Tasks', value: Number(data.unassignedTotalTasks) || 0 }
        ];

        if ((Number(data.orphanedTotalTasks) || 0) > 0) {
            rows.push({ label: 'Orphaned Links', value: Number(data.orphanedTotalTasks) || 0 });
        }

        const list = document.createElement('div');
        list.className = 'insights-project-portfolio-list';
        rows.forEach(row => {
            const line = document.createElement('div');
            line.className = 'insights-project-portfolio-row';
            line.innerHTML = `
                <span>${escapeHtml(String(row.label || 'Metric'))}</span>
                <strong>${escapeHtml(String(Math.max(0, Number(row.value) || 0)))}</strong>
            `;
            list.appendChild(line);
        });

        container.appendChild(list);

        const note = document.createElement('div');
        note.className = 'insights-project-portfolio-note';
        const unassignedActive = Math.max(0, Number(data.unassignedActiveTasks) || 0);
        const orphanedActive = Math.max(0, Number(data.orphanedActiveTasks) || 0);
        if (unassignedActive > 0 || orphanedActive > 0) {
            const fragments = [];
            if (unassignedActive > 0) fragments.push(`${unassignedActive} active tasks are unassigned`);
            if (orphanedActive > 0) fragments.push(`${orphanedActive} active tasks link to missing projects`);
            note.textContent = fragments.join(' • ');
        } else {
            note.textContent = 'All active tasks are mapped to existing projects.';
        }
        container.appendChild(note);

        const actions = document.createElement('div');
        actions.className = 'insights-project-actions';
        actions.appendChild(createInsightsProjectActionButton('Open Projects', () => {
            openProjectsPanelFromDashboard({ openPanel: true });
        }));
        actions.appendChild(createInsightsProjectActionButton('Urgency View', () => {
            openProjectsPanelFromDashboard({ openPanel: true, sortMode: 'urgency-desc', urgencyFilter: 'all' });
        }, 'accent'));
        actions.appendChild(createInsightsProjectActionButton('New Project', () => {
            openProjectsPanelFromDashboard({ openPanel: true, urgencyFilter: 'all', focusCreateInput: true });
        }));

        const firstUnassignedTaskId = String(data.firstUnassignedTaskId || '').trim();
        if (firstUnassignedTaskId) {
            actions.appendChild(createInsightsProjectActionButton('Jump Unassigned', () => {
                if (typeof window.jumpToTask === 'function') {
                    window.jumpToTask(firstUnassignedTaskId);
                }
                closeInsightsDashboard();
            }, 'warn'));
        }

        container.appendChild(actions);
    }

    function renderProjectRisks(projectRisks) {
        const list = document.getElementById('insights-project-risks');
        if (!list) return;
        list.innerHTML = '';

        const actions = document.createElement('div');
        actions.className = 'insights-project-actions compact';
        actions.appendChild(createInsightsProjectActionButton('All Levels', () => {
            openProjectsPanelFromDashboard({ openPanel: true, sortMode: 'urgency-desc', urgencyFilter: 'all' });
        }));
        actions.appendChild(createInsightsProjectActionButton('High', () => {
            openProjectsPanelFromDashboard({ openPanel: true, sortMode: 'urgency-desc', urgencyFilter: '4' });
        }, 'warn'));
        actions.appendChild(createInsightsProjectActionButton('Critical', () => {
            openProjectsPanelFromDashboard({ openPanel: true, sortMode: 'urgency-desc', urgencyFilter: '5' });
        }, 'danger'));
        list.appendChild(actions);

        if (!Array.isArray(projectRisks) || projectRisks.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'insights-empty';
            empty.textContent = 'No active project risks detected.';
            list.appendChild(empty);
            return;
        }

        projectRisks.forEach(project => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'insights-project-risk-item';
            const nextDue = Number(project.nextDueDayDelta);
            const nextDueLabel = Number.isFinite(nextDue) ? formatRelativeDueLabel(nextDue) : 'No due date';
            const metaBits = [
                `${Math.max(0, Number(project.activeTasks) || 0)} active`,
                `${Math.max(0, Number(project.doneTasks) || 0)} done`,
                nextDueLabel
            ];
            if ((Number(project.blockedCount) || 0) > 0) metaBits.push(`${Number(project.blockedCount)} blocked`);
            if ((Number(project.overdueCount) || 0) > 0) metaBits.push(`${Number(project.overdueCount)} overdue`);

            btn.innerHTML = `
                <div class="insights-project-risk-top">
                    <h3 class="insights-project-risk-title">${escapeHtml(project.name || 'Untitled Project')}</h3>
                    <span class="insights-project-risk-level level-${escapeHtml(String(project.urgencyLevel || 1))}" title="${escapeHtml(project.urgencyLabel || 'Urgency')}">${escapeHtml(project.urgencyTag || 'LOWEST')}</span>
                </div>
                <div class="insights-project-risk-meta">${escapeHtml(metaBits.join(' • '))}</div>
                <div class="insights-project-risk-status">${escapeHtml(project.statusLabel || getDashboardProjectStatusLabel(project.status))}</div>
            `;

            btn.addEventListener('click', () => {
                const opened = openProjectsPanelFromDashboard({
                    projectId: project.id,
                    openPanel: true,
                    openDetails: true,
                    sortMode: 'urgency-desc',
                    urgencyFilter: 'all'
                });
                if (!opened) {
                    const openFn = (typeof openProjectDetailsModal === 'function')
                        ? openProjectDetailsModal
                        : (typeof window.openProjectDetailsModal === 'function' ? window.openProjectDetailsModal : null);
                    if (openFn) openFn(project.id);
                    closeInsightsDashboard();
                }
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
        renderProjectPortfolio(model.projectPortfolio);
        renderProjectRisks(model.projectRisks);
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
