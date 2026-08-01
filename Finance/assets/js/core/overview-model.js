// =============================================
// PHASE 3A: FINAL OVERVIEW PRESENTATION MODEL
// =============================================
// Pure, immutable view data for the Phase 3B Overview UI cutover.

(function exposeFinanceOverviewModel(root, factory) {
    const api = factory();

    if (root) {
        root.FINANCE_OVERVIEW_MODEL_VERSION = api.VERSION;
        root.FINANCE_OVERVIEW_CARD_ORDER = api.CARD_ORDER;
        root.buildFinanceOverviewModel = api.buildFinanceOverviewModel;
        root.validateFinanceOverviewModel = api.validate;
    }

    if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis, function createFinanceOverviewModel() {
    const VERSION = '1.0.0';
    const SCHEMA_VERSION = 1;
    const CARD_ORDER = Object.freeze([
        'cash_on_hand',
        'net_cash_flow',
        'spending_to_income',
        'estimated_net_worth'
    ]);
    const MONTHS = Object.freeze([
        'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
        'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
    ]);
    const SEVERITY_ORDER = Object.freeze({ critical: 0, warning: 1, info: 2 });

    function deepFreeze(value) {
        if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
        Object.getOwnPropertyNames(value).forEach(key => deepFreeze(value[key]));
        return Object.freeze(value);
    }

    function finite(value) {
        return value != null && value !== '' && Number.isFinite(Number(value));
    }

    function text(value) {
        const normalized = String(value || '').trim();
        return normalized || null;
    }

    function normalizeMode(value, hasValue) {
        const mode = String(value || '').trim();
        if (['canonical', 'legacy', 'unavailable'].includes(mode)) return mode;
        return hasValue ? 'legacy' : 'unavailable';
    }

    function parseCalendarDate(value) {
        const normalized = text(value);
        if (!normalized) return null;
        const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (!match) return null;
        const year = Number(match[1]);
        const month = Number(match[2]);
        const day = Number(match[3]);
        const date = new Date(Date.UTC(year, month - 1, day));
        if (date.getUTCFullYear() !== year
            || date.getUTCMonth() !== month - 1
            || date.getUTCDate() !== day) return null;
        return { year, month, day };
    }

    function formatAsOfCaption(value) {
        const parsed = parseCalendarDate(value);
        return parsed
            ? `As of ${MONTHS[parsed.month - 1]} ${parsed.day}, ${parsed.year}`
            : 'As of date unavailable';
    }

    function formatPeriodCaption(value) {
        const label = text(value) || 'selected period';
        return /^for\s/i.test(label) ? label : `For ${label}`;
    }

    function buildCard(input) {
        const hasValue = finite(input.value);
        const mode = normalizeMode(input.mode, hasValue);
        return {
            id: input.id,
            label: input.label,
            grain: input.grain,
            unit: input.unit,
            value: hasValue ? Number(input.value) : null,
            availability: input.availability || (hasValue ? 'available' : 'unavailable'),
            mode,
            basis: input.basis,
            caption: input.caption,
            detail: input.detail,
            reason: text(input.reason) || (hasValue ? 'ready' : 'value_unavailable')
        };
    }

    function addAttention(items, item) {
        if (!item || items.some(existing => existing.id === item.id)) return;
        items.push({
            id: item.id,
            severity: item.severity,
            rank: item.rank,
            title: item.title,
            summary: item.summary,
            action: {
                id: item.action.id,
                label: item.action.label,
                targetView: item.action.targetView || null
            }
        });
    }

    function buildAttentionModel(cards, signals = {}, options = {}) {
        const items = [];
        const quarantinedCount = Math.max(0, Number(signals?.dateQuality?.quarantinedCount || 0));
        const normalizableCount = Math.max(0, Number(signals?.dateQuality?.normalizableCount || 0));
        const cashCard = cards.cash_on_hand;
        const flowCard = cards.net_cash_flow;
        const netWorthCard = cards.estimated_net_worth;

        if (quarantinedCount > 0) {
            addAttention(items, {
                id: 'date_quality',
                severity: 'critical',
                rank: 10,
                title: 'Transaction dates need review',
                summary: `${quarantinedCount} transaction${quarantinedCount === 1 ? '' : 's'} excluded until the date is repaired.`,
                action: { id: 'review_dates', label: 'Review dates', targetView: 'activity' }
            });
        } else if (normalizableCount > 0) {
            addAttention(items, {
                id: 'date_normalization',
                severity: 'info',
                rank: 80,
                title: 'Legacy dates can be normalized',
                summary: `${normalizableCount} usable date${normalizableCount === 1 ? '' : 's'} can be standardized.`,
                action: { id: 'review_dates', label: 'Review dates', targetView: 'activity' }
            });
        }

        const explicitMetricFallback = signals?.metricFallback?.active === true;
        if (flowCard.mode === 'unavailable') {
            addAttention(items, {
                id: 'flow_metrics_unavailable',
                severity: 'critical',
                rank: 20,
                title: 'Period metrics are unavailable',
                summary: text(signals?.metricFallback?.detail) || 'Review transaction classification and reconciliation diagnostics.',
                action: { id: 'review_metric_data', label: 'Review activity', targetView: 'activity' }
            });
        } else if (flowCard.mode === 'legacy' || explicitMetricFallback) {
            addAttention(items, {
                id: 'metric_fallback',
                severity: 'warning',
                rank: 20,
                title: 'Canonical period metrics are paused',
                summary: text(signals?.metricFallback?.detail) || 'Legacy calculations remain visible until reconciliation is ready.',
                action: { id: 'review_metric_data', label: 'Review activity', targetView: 'activity' }
            });
        }

        if (cashCard.mode === 'legacy') {
            addAttention(items, {
                id: 'cash_reconciliation',
                severity: 'warning',
                rank: 30,
                title: 'Cash position uses a legacy estimate',
                summary: 'Tracked cash will cut over after snapshot history and reconciliation are ready.',
                action: { id: 'review_cash_reconciliation', label: 'Review activity', targetView: 'activity' }
            });
        } else if (cashCard.availability === 'unavailable') {
            addAttention(items, {
                id: 'cash_unavailable',
                severity: 'critical',
                rank: 30,
                title: 'Cash position is unavailable',
                summary: 'Tracked cash could not be calculated safely.',
                action: { id: 'review_cash_reconciliation', label: 'Review activity', targetView: 'activity' }
            });
        }

        if (netWorthCard.mode === 'unavailable') {
            const missingPriceCount = Math.max(0, Number(signals?.market?.missingPriceCount || 0));
            addAttention(items, {
                id: 'market_value_unavailable',
                severity: 'warning',
                rank: 40,
                title: 'Market-value net worth is unavailable',
                summary: missingPriceCount > 0
                    ? `Current prices are missing for ${missingPriceCount} crypto holding${missingPriceCount === 1 ? '' : 's'}.`
                    : 'The market-value snapshot is not ready.',
                action: { id: 'update_market_prices', label: 'Review holdings', targetView: 'wealth' }
            });
        } else if (netWorthCard.mode === 'legacy') {
            addAttention(items, {
                id: 'market_value_legacy',
                severity: 'warning',
                rank: 40,
                title: 'Net worth uses a legacy estimate',
                summary: 'Canonical market-value reconciliation is not ready.',
                action: { id: 'review_market_reconciliation', label: 'Review wealth', targetView: 'wealth' }
            });
        }

        const liquidity = signals?.liquidity || {};
        const runwayDays = finite(liquidity.runwayDays) ? Number(liquidity.runwayDays) : null;
        const runwayThresholdDays = finite(liquidity.thresholdDays)
            ? Math.max(0, Number(liquidity.thresholdDays))
            : 90;
        if (liquidity.ready === false) {
            addAttention(items, {
                id: 'liquidity_unavailable',
                severity: 'warning',
                rank: 50,
                title: 'Liquidity needs review',
                summary: text(liquidity.detail) || 'Runway could not be calculated safely.',
                action: { id: 'review_liquidity', label: 'Review reports', targetView: 'reports' }
            });
        } else if (runwayDays != null && runwayDays < runwayThresholdDays) {
            addAttention(items, {
                id: 'low_liquidity',
                severity: 'critical',
                rank: 50,
                title: 'Liquidity runway is short',
                summary: `${Math.round(runwayDays)} days of tracked cash remain at the recent spending rate.`,
                action: { id: 'review_liquidity', label: 'Review plan', targetView: 'plan' }
            });
        }

        const budgetRisks = Array.isArray(signals?.budgetRisks) ? signals.budgetRisks.filter(Boolean) : [];
        if (budgetRisks.length > 0) {
            const category = text(budgetRisks[0]?.category) || 'A category';
            addAttention(items, {
                id: 'budget_risk',
                severity: 'warning',
                rank: 60,
                title: 'Budget is projected over plan',
                summary: budgetRisks.length === 1
                    ? `${category} is projected over budget.`
                    : `${category} and ${budgetRisks.length - 1} other categor${budgetRisks.length === 2 ? 'y are' : 'ies are'} projected over budget.`,
                action: { id: 'open_budgets', label: 'Review budgets', targetView: 'plan' }
            });
        }

        const anomalies = Array.isArray(signals?.anomalies) ? signals.anomalies.filter(Boolean) : [];
        if (anomalies.length > 0) {
            addAttention(items, {
                id: 'unusual_activity',
                severity: 'info',
                rank: 70,
                title: 'Unusual activity detected',
                summary: `${anomalies.length} movement${anomalies.length === 1 ? '' : 's'} stand out from recent activity.`,
                action: { id: 'review_activity', label: 'Review activity', targetView: 'activity' }
            });
        }

        items.sort((left, right) => {
            const severityDifference = SEVERITY_ORDER[left.severity] - SEVERITY_ORDER[right.severity];
            return severityDifference || left.rank - right.rank || left.id.localeCompare(right.id);
        });

        const requestedLimit = Number(options.maxAttentionItems);
        const maxAttentionItems = Number.isInteger(requestedLimit)
            ? Math.min(5, Math.max(1, requestedLimit))
            : 3;
        const visibleItems = items.slice(0, maxAttentionItems);

        return {
            status: items.length > 0 ? 'needs_attention' : 'clear',
            count: items.length,
            hiddenCount: Math.max(0, items.length - visibleItems.length),
            summary: items.length > 0
                ? `${items.length} item${items.length === 1 ? '' : 's'} need attention.`
                : 'Nothing needs immediate attention.',
            items: visibleItems,
            allItems: items
        };
    }

    function buildFinanceOverviewModel(input = {}, options = {}) {
        const cashView = input.cashView && typeof input.cashView === 'object' ? input.cashView : {};
        const flowMetrics = input.flowMetrics && typeof input.flowMetrics === 'object' ? input.flowMetrics : {};
        const netWorthView = input.netWorthView && typeof input.netWorthView === 'object' ? input.netWorthView : {};
        const asOf = cashView.asOf || netWorthView.asOf || options.asOf || null;
        const periodCaption = formatPeriodCaption(options.periodLabel || flowMetrics.periodLabel || flowMetrics.scopeLabel);
        const cashValueAvailable = finite(cashView.value);
        const netCashFlowAvailable = finite(flowMetrics.balance);
        const earnedIncome = finite(flowMetrics.income) ? Number(flowMetrics.income) : null;
        const spending = finite(flowMetrics.expense) ? Number(flowMetrics.expense) : null;
        const explicitRatio = finite(flowMetrics.spendingToIncome)
            ? Number(flowMetrics.spendingToIncome)
            : null;
        const spendingToIncome = explicitRatio != null
            ? explicitRatio
            : (earnedIncome != null && earnedIncome > 0 && spending != null
                ? (spending / earnedIncome) * 100
                : null);
        const flowEngine = String(flowMetrics?.metricProvenance?.engine || flowMetrics.metricEngine || '').trim();
        const flowMode = flowEngine === 'canonical'
            ? 'canonical'
            : ((netCashFlowAvailable || spendingToIncome != null) ? 'legacy' : 'unavailable');

        const cards = {
            cash_on_hand: buildCard({
                id: 'cash_on_hand',
                label: 'Cash on Hand',
                grain: 'snapshot',
                unit: 'currency',
                value: cashView.value,
                mode: cashView.mode,
                basis: 'tracked_cash',
                caption: formatAsOfCaption(cashView.asOf || asOf),
                detail: cashValueAvailable
                    ? (cashView.mode === 'canonical'
                        ? 'Tracked cash; not a bank-reconciled balance'
                        : 'Legacy tracked-cash estimate')
                    : 'Tracked cash is unavailable',
                reason: cashView.reason
            }),
            net_cash_flow: buildCard({
                id: 'net_cash_flow',
                label: 'Net Cash Flow',
                grain: 'flow',
                unit: 'currency',
                value: flowMetrics.balance,
                mode: flowMode,
                basis: 'cash_movement',
                caption: periodCaption,
                detail: flowMode === 'canonical'
                    ? 'Canonical cash increases minus cash decreases'
                    : (flowMode === 'legacy' ? 'Legacy cash-flow fallback' : 'Period cash flow is unavailable'),
                reason: flowMetrics?.metricProvenance?.cutoverReason
            }),
            spending_to_income: buildCard({
                id: 'spending_to_income',
                label: 'Spending to Income',
                grain: 'flow',
                unit: 'percent',
                value: spendingToIncome,
                mode: flowMode,
                availability: earnedIncome === 0 ? 'not_applicable' : undefined,
                basis: 'consumption_over_earned_income',
                caption: periodCaption,
                detail: earnedIncome === 0
                    ? 'n/a because earned income is zero'
                    : (spendingToIncome == null
                        ? 'Earned income or spending is unavailable'
                        : 'Consumption spending divided by earned income'),
                reason: earnedIncome === 0 ? 'zero_earned_income' : flowMetrics?.metricProvenance?.cutoverReason
            }),
            estimated_net_worth: buildCard({
                id: 'estimated_net_worth',
                label: 'Estimated Net Worth',
                grain: 'snapshot',
                unit: 'currency',
                value: netWorthView.value,
                mode: netWorthView.mode,
                basis: netWorthView.mode === 'canonical' ? 'market' : (netWorthView.basis || 'market'),
                caption: formatAsOfCaption(netWorthView.asOf || asOf),
                detail: netWorthView.mode === 'canonical'
                    ? 'Market-value snapshot'
                    : (netWorthView.mode === 'legacy'
                        ? 'Legacy estimate; canonical market value pending'
                        : 'Market-value snapshot unavailable'),
                reason: netWorthView.reason
            })
        };
        const attentionSignals = {
            ...(input.attentionSignals || {}),
            market: {
                ...(input.attentionSignals?.market || {}),
                missingPriceCount: input.attentionSignals?.market?.missingPriceCount
                    ?? netWorthView.missingPriceCount
                    ?? 0
            }
        };
        const attention = buildAttentionModel(cards, attentionSignals, options);
        const orderedCards = CARD_ORDER.map(cardId => cards[cardId]);
        const canonicalCardCount = orderedCards.filter(card => card.mode === 'canonical').length;
        const unavailableCardCount = orderedCards.filter(card => card.availability === 'unavailable').length;
        const notApplicableCardCount = orderedCards.filter(card => card.availability === 'not_applicable').length;

        return deepFreeze({
            schemaVersion: SCHEMA_VERSION,
            modelVersion: VERSION,
            status: unavailableCardCount > 0
                ? 'partial'
                : (canonicalCardCount === CARD_ORDER.length ? 'canonical' : 'legacy_fallback'),
            cardOrder: CARD_ORDER,
            cards,
            orderedCards,
            attention,
            diagnostics: {
                canonicalCardCount,
                unavailableCardCount,
                notApplicableCardCount,
                totalCardCount: CARD_ORDER.length
            }
        });
    }

    function validate() {
        const model = buildFinanceOverviewModel({
            cashView: { mode: 'canonical', value: 1000, asOf: '2026-07-31', reason: 'ready' },
            flowMetrics: {
                balance: 200,
                income: 1000,
                expense: 600,
                metricProvenance: { engine: 'canonical' }
            },
            netWorthView: { mode: 'canonical', basis: 'market', value: 2500, asOf: '2026-07-31', reason: 'ready' }
        }, { periodLabel: 'Jul 2026' });
        const errors = [];
        if (model.orderedCards.length !== 4) errors.push('Four-card invariant failed.');
        if (model.cards.spending_to_income.value !== 60) errors.push('Spending-to-income invariant failed.');
        if (model.cards.cash_on_hand.caption !== 'As of Jul 31, 2026') errors.push('Snapshot caption invariant failed.');
        if (model.cards.net_cash_flow.caption !== 'For Jul 2026') errors.push('Flow caption invariant failed.');
        return deepFreeze({ valid: errors.length === 0, errors, version: VERSION });
    }

    return deepFreeze({
        VERSION,
        SCHEMA_VERSION,
        CARD_ORDER,
        buildFinanceOverviewModel,
        validate
    });
});
