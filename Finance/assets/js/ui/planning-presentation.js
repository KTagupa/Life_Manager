(function exposeFinancePlanningPresentation(root, factory) {
    const api = factory(root);

    if (typeof module === 'object' && module.exports) {
        module.exports = api;
    }

    if (root) {
        root.FINANCE_PLANNING_PRESENTATION_VERSION = api.VERSION;
        root.buildFinancePlanningPresentation = api.buildFinancePlanningPresentation;
        root.validateFinancePlanningPresentation = api.validate;
    }
})(typeof window !== 'undefined' ? window : globalThis, function buildFinancePlanningPresentationModule(root) {
    'use strict';

    const VERSION = '1.0.0';
    const DAY_MS = 24 * 60 * 60 * 1000;

    function deepFreeze(value) {
        if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
        Object.values(value).forEach(deepFreeze);
        return Object.freeze(value);
    }

    function toNumber(value) {
        const number = Number(value);
        return Number.isFinite(number) ? number : 0;
    }

    function positiveNumber(value) {
        return Math.max(0, toNumber(value));
    }

    function normalizeDate(value) {
        if (value instanceof Date && Number.isFinite(value.getTime())) return new Date(value.getTime());
        const date = new Date(value);
        return Number.isFinite(date.getTime()) ? date : null;
    }

    function localDateKey(date) {
        const value = normalizeDate(date);
        if (!value) return null;
        const year = value.getFullYear();
        const month = String(value.getMonth() + 1).padStart(2, '0');
        const day = String(value.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    function monthKey(date) {
        const key = localDateKey(date);
        return key ? key.slice(0, 7) : null;
    }

    function startOfLocalDay(date) {
        const value = normalizeDate(date) || new Date();
        return new Date(value.getFullYear(), value.getMonth(), value.getDate());
    }

    function daysBetween(fromDate, toDate) {
        const from = startOfLocalDay(fromDate);
        const to = startOfLocalDay(toDate);
        return Math.round((Date.UTC(to.getFullYear(), to.getMonth(), to.getDate())
            - Date.UTC(from.getFullYear(), from.getMonth(), from.getDate())) / DAY_MS);
    }

    function lastDayOfMonth(year, monthIndex) {
        return new Date(year, monthIndex + 1, 0).getDate();
    }

    function scheduledDate(year, monthIndex, day) {
        const clampedDay = Math.min(Math.max(1, Math.round(toNumber(day) || 1)), lastDayOfMonth(year, monthIndex));
        return new Date(year, monthIndex, clampedDay);
    }

    function latestElectricityCycle(bill) {
        return (Array.isArray(bill?.electricityHistory) ? bill.electricityHistory : [])
            .filter(cycle => cycle && typeof cycle === 'object')
            .slice()
            .sort((left, right) => String(right.billingMonth || '').localeCompare(String(left.billingMonth || '')))[0] || null;
    }

    function getBillExpectedAmount(bill) {
        const latestCycle = bill?.billType === 'electricity' ? latestElectricityCycle(bill) : null;
        return positiveNumber(latestCycle?.amount || bill?.amt);
    }

    function getNextBillDate(bill, now) {
        const today = startOfLocalDay(now);
        let year = today.getFullYear();
        let monthIndex = today.getMonth();
        let candidate = scheduledDate(year, monthIndex, bill?.day);
        const latestCycle = bill?.billType === 'electricity' ? latestElectricityCycle(bill) : null;
        const currentMonthPaid = latestCycle?.status === 'paid' && latestCycle.billingMonth === monthKey(today);

        if (candidate < today || currentMonthPaid) {
            monthIndex += 1;
            if (monthIndex > 11) {
                monthIndex = 0;
                year += 1;
            }
            candidate = scheduledDate(year, monthIndex, bill?.day);
        }
        return candidate;
    }

    function getClassifier(options = {}) {
        if (typeof options.classifier === 'function') return options.classifier;
        if (typeof root?.classifyFinanceTransaction === 'function') return root.classifyFinanceTransaction;
        return null;
    }

    function getCurrentMonthConsumption(transactions, now, options = {}) {
        const classifier = getClassifier(options);
        const targetMonth = monthKey(now);
        const byCategory = Object.create(null);
        let total = 0;

        (Array.isArray(transactions) ? transactions : []).forEach(transaction => {
            const classification = classifier
                ? classifier(transaction, options.context || {})
                : null;
            if (!classification || classification.classifiable !== true || classification.valid !== true) return;
            if (String(classification.dateKey || '').slice(0, 7) !== targetMonth) return;
            const amount = positiveNumber(classification.consumptionDelta);
            if (!amount) return;
            const category = String(transaction?.category || 'Uncategorized').trim() || 'Uncategorized';
            byCategory[category] = (byCategory[category] || 0) + amount;
            total += amount;
        });

        return { total, byCategory };
    }

    function buildBudgetPlan(budgets, consumption) {
        const configured = Object.entries(budgets && typeof budgets === 'object' ? budgets : {})
            .map(([category, limit]) => ({ category: String(category), limit: positiveNumber(limit) }))
            .filter(row => row.category && row.limit > 0);
        const configuredNames = new Set(configured.map(row => row.category));
        const rows = configured.map(row => {
            const spent = positiveNumber(consumption.byCategory[row.category]);
            const remaining = row.limit - spent;
            const utilization = row.limit > 0 ? (spent / row.limit) * 100 : null;
            return {
                ...row,
                spent,
                remaining,
                utilization,
                status: spent > row.limit ? 'over' : (utilization >= 80 ? 'watch' : 'on_track')
            };
        }).sort((left, right) => {
            const rank = { over: 0, watch: 1, on_track: 2 };
            return rank[left.status] - rank[right.status] || right.utilization - left.utilization;
        });
        const totalLimit = rows.reduce((sum, row) => sum + row.limit, 0);
        const budgetedSpending = rows.reduce((sum, row) => sum + row.spent, 0);
        const unbudgetedSpending = Object.entries(consumption.byCategory)
            .filter(([category]) => !configuredNames.has(category))
            .reduce((sum, [, amount]) => sum + positiveNumber(amount), 0);
        const overCount = rows.filter(row => row.status === 'over').length;

        return {
            configuredCount: rows.length,
            totalLimit,
            budgetedSpending,
            unbudgetedSpending,
            totalConsumption: consumption.total,
            remaining: totalLimit - budgetedSpending,
            overCount,
            status: !rows.length ? 'not_configured' : (overCount ? 'needs_attention' : 'on_track'),
            rows
        };
    }

    function buildBillsPlan(bills, now) {
        const source = Array.isArray(bills) ? bills : [];
        const pausedCount = source.filter(bill => bill?.paused).length;
        const activeRows = source.filter(bill => bill && !bill.paused).map(bill => {
            const nextDate = getNextBillDate(bill, now);
            return {
                id: String(bill.id || ''),
                name: String(bill.name || 'Bill'),
                amount: getBillExpectedAmount(bill),
                nextDate: localDateKey(nextDate),
                daysUntil: daysBetween(now, nextDate),
                billType: bill.billType === 'electricity' ? 'electricity' : 'standard'
            };
        }).sort((left, right) => left.daysUntil - right.daysUntil || left.name.localeCompare(right.name));

        return {
            activeCount: activeRows.length,
            pausedCount,
            monthlyExpected: activeRows.reduce((sum, bill) => sum + bill.amount, 0),
            dueSoonCount: activeRows.filter(bill => bill.daysUntil <= 7).length,
            nextDue: activeRows[0] || null,
            rows: activeRows
        };
    }

    function buildGoalsPlan(goals, now) {
        const source = Array.isArray(goals) ? goals : [];
        const activeRows = source.filter(goal => (goal?.status || 'active') === 'active').map(goal => {
            const targetDate = normalizeDate(goal.targetDate);
            return {
                id: String(goal.id || ''),
                name: String(goal.name || 'Goal'),
                targetAmount: positiveNumber(goal.targetAmount),
                targetDate: localDateKey(targetDate),
                daysUntil: targetDate ? daysBetween(now, targetDate) : null,
                linkedCategory: String(goal.linkedCategory || '') || null
            };
        }).sort((left, right) => (left.daysUntil ?? Infinity) - (right.daysUntil ?? Infinity));

        return {
            activeCount: activeRows.length,
            pausedCount: source.filter(goal => goal?.status === 'paused').length,
            completedCount: source.filter(goal => goal?.status === 'completed').length,
            targetTotal: activeRows.reduce((sum, goal) => sum + goal.targetAmount, 0),
            dueSoonCount: activeRows.filter(goal => goal.daysUntil !== null && goal.daysUntil >= 0 && goal.daysUntil <= 30).length,
            overdueCount: activeRows.filter(goal => goal.daysUntil !== null && goal.daysUntil < 0).length,
            nextDue: activeRows.find(goal => goal.targetDate) || null,
            rows: activeRows
        };
    }

    function buildWishlistPlan(wishlist, now, budgetPlan) {
        const rows = (Array.isArray(wishlist) ? wishlist : []).filter(item => item && !item.deletedAt).map(item => {
            const targetDate = normalizeDate(item.targetDate);
            const amount = positiveNumber(item.amt);
            const category = String(item.category || '').trim() || null;
            return {
                id: String(item.id || ''),
                name: String(item.desc || 'Wishlist item'),
                amount,
                category,
                targetDate: localDateKey(targetDate),
                daysUntil: targetDate ? daysBetween(now, targetDate) : null,
                hasBudget: !!category && budgetPlan.rows.some(row => row.category === category)
            };
        }).sort((left, right) => (left.daysUntil ?? Infinity) - (right.daysUntil ?? Infinity));

        return {
            count: rows.length,
            plannedTotal: rows.reduce((sum, item) => sum + item.amount, 0),
            missingAmountCount: rows.filter(item => item.amount <= 0).length,
            uncategorizedCount: rows.filter(item => !item.category).length,
            unbudgetedCount: rows.filter(item => item.category && !item.hasBudget).length,
            dueSoonCount: rows.filter(item => item.daysUntil !== null && item.daysUntil >= 0 && item.daysUntil <= 30).length,
            overdueCount: rows.filter(item => item.daysUntil !== null && item.daysUntil < 0).length,
            nextDue: rows.find(item => item.targetDate) || null,
            rows
        };
    }

    function buildAttention(budget, bills, goals, wishlist) {
        const attention = [];
        if (!budget.configuredCount) {
            attention.push({
                id: 'configure_budgets', tone: 'warning', title: 'Set monthly category limits',
                detail: 'Budget capacity cannot be coordinated until at least one limit is configured.',
                actionId: 'manage_budgets', actionLabel: 'Set budgets'
            });
        } else if (budget.overCount) {
            attention.push({
                id: 'budget_overages', tone: 'danger', title: `${budget.overCount} ${budget.overCount === 1 ? 'budget is' : 'budgets are'} over limit`,
                detail: 'Review the highest-utilization categories before adding new commitments.',
                actionId: 'focus_budgets', actionLabel: 'Review budgets'
            });
        }
        if (bills.dueSoonCount) {
            attention.push({
                id: 'bills_due_soon', tone: 'warning', title: `${bills.dueSoonCount} ${bills.dueSoonCount === 1 ? 'bill is' : 'bills are'} scheduled within 7 days`,
                detail: 'Confirm the expected amount and record payment from the bill row when ready.',
                actionId: 'focus_bills', actionLabel: 'Review bills'
            });
        }
        const goalDateReviewCount = goals.dueSoonCount + goals.overdueCount;
        if (goalDateReviewCount) {
            attention.push({
                id: 'goals_due_soon', tone: 'warning', title: `${goalDateReviewCount} active ${goalDateReviewCount === 1 ? 'goal needs' : 'goals need'} a target-date review`,
                detail: `${goals.overdueCount} overdue • ${goals.dueSoonCount} due within 30 days. Progress remains a cash proxy.`,
                actionId: 'manage_goals', actionLabel: 'Review goals'
            });
        }
        const incompleteWishlist = wishlist.missingAmountCount + wishlist.uncategorizedCount;
        if (incompleteWishlist) {
            attention.push({
                id: 'wishlist_incomplete', tone: 'neutral', title: 'Wishlist details need review',
                detail: `${wishlist.missingAmountCount} missing amount • ${wishlist.uncategorizedCount} missing category`,
                actionId: 'focus_wishlist', actionLabel: 'Review wishlist'
            });
        } else if (wishlist.unbudgetedCount) {
            attention.push({
                id: 'wishlist_unbudgeted', tone: 'neutral', title: `${wishlist.unbudgetedCount} wishlist ${wishlist.unbudgetedCount === 1 ? 'item has' : 'items have'} no matching budget`,
                detail: 'Assign a category limit before treating the purchase as part of the monthly plan.',
                actionId: 'focus_wishlist', actionLabel: 'Review wishlist'
            });
        }
        if (!attention.length) {
            attention.push({
                id: 'plan_clear', tone: 'positive', title: 'Planning inputs are coordinated',
                detail: 'No immediate budget, bill, goal, or wishlist setup issue is visible.',
                actionId: 'manage_goals', actionLabel: 'Open planner'
            });
        }
        return attention.slice(0, 4);
    }

    function buildFinancePlanningPresentation(input = {}, options = {}) {
        const now = normalizeDate(options.now || input.now) || new Date();
        const consumption = getCurrentMonthConsumption(input.transactions, now, options);
        const budget = buildBudgetPlan(input.budgets, consumption);
        const bills = buildBillsPlan(input.bills, now);
        const goals = buildGoalsPlan(input.goals, now);
        const wishlist = buildWishlistPlan(input.wishlist, now, budget);
        const periodKey = monthKey(now);

        return deepFreeze({
            version: VERSION,
            asOf: localDateKey(now),
            periodKey,
            periodLabel: now.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }),
            budget,
            bills,
            goals,
            wishlist,
            attention: buildAttention(budget, bills, goals, wishlist)
        });
    }

    function validate() {
        const fixture = buildFinancePlanningPresentation({}, { now: new Date(2026, 6, 31) });
        const errors = [];
        if (fixture.version !== VERSION) errors.push('Planning presentation version mismatch.');
        if (!fixture.periodKey) errors.push('Planning period is unavailable.');
        if (!fixture.budget || !fixture.bills || !fixture.goals || !fixture.wishlist) {
            errors.push('Planning domains are incomplete.');
        }
        if (!Array.isArray(fixture.attention) || !fixture.attention.length) {
            errors.push('Planning attention contract is empty.');
        }
        return Object.freeze({ valid: errors.length === 0, errors: Object.freeze(errors) });
    }

    return {
        VERSION,
        buildFinancePlanningPresentation,
        validate
    };
});
