# FinanceFlow Canonical Metric Cutover

Status: Phase 2C-B complete  
Canonical engine version: 1.0.0  
Adapter version: 1.1.0  
Runtime sources: `assets/js/core/canonical-metrics.js`, `assets/js/core/metric-adapter.js`, `assets/js/features/metric-shadow.js`

## Purpose

Phase 2C-A introduced shadow calculation and reconciliation. Phase 2C-B keeps that shadow layer as a live safety gate and cuts reconciled vaults over to canonical transaction-derived metrics.

The original summary calculator remains available as `computeLegacySummaryMetrics()`. The compatibility adapter owns `computeSummaryMetrics()` so existing consumers receive canonical fields without a flag-day rewrite.

## Canonical outputs

| Output | Source |
|---|---|
| Net Cash Flow | Sum of canonical `cashDelta` |
| Earned Income | Sum of `earnedIncomeDelta` |
| Other Cash In | Sum of `otherCashInDelta` |
| Consumption Spending | Sum of `consumptionDelta` |
| Finance-charge spending | Interest and fee subset of consumption |
| Settlements | Principal and liability settlements |
| Transfers | Signed own-account, savings, and lending movements |
| Asset acquisitions | Crypto and explicitly identified capital-asset purchases |
| Savings Rate | `(earned income - consumption spending) / earned income`; `null` when earned income is zero |

The engine also returns category spending, class counts, issue counts, coverage percentage, and transaction IDs requiring review. It never mutates transaction inputs.

## Runtime context

The runtime shadow reporter builds classification context from decrypted active debts and their current and legacy category names. Context is fingerprinted so reports can identify which reference state produced a result.

The shadow report is refreshed before visible transaction and metric rendering and contains three scopes:

- selected period, including the current search and month/year filters;
- current month;
- all time.

The latest immutable report is available as `window.financeMetricShadowReport` or through `getFinanceMetricShadowReport()`.

## Reconciliation rules

Net Cash Flow is the invariant. A difference between canonical cash delta and legacy balance is an unexplained failure that blocks visible cutover.

Differences in earned income, other cash in, spending, and savings rate may be expected because canonical classification intentionally removes settlements, transfers, lending, and asset acquisitions from consumption and earned income. Every difference remains visible in the comparison report.

`readyForVisibleCutover` requires:

1. no invalid or unclassified usable transactions;
2. no Net Cash Flow invariant failure in any scope.

Warnings remain visible as review diagnostics even when they do not block the readiness flag.

## Visible cutover

When `readyForVisibleCutover` is true, the adapter supplies canonical Net Cash Flow, Earned Income, Other Cash In, Spending, Savings Rate, daily spending, and category spending to existing cards and modules. Category keys preserve their stored spelling so budgets continue to match.

When the gate is false or canonical calculation fails scope reconciliation, the app:

- retains legacy amounts;
- uses explicit `Legacy ...` labels;
- shows a visible “Canonical metrics paused” notice with diagnostic counts;
- sets `document.body.dataset.financeMetricEngine` to `legacy`.

Zero earned income displays and persists an unavailable (`null` / `n/a`) savings rate instead of `0%`.

## Consumer provenance

Phase 2D-D1 adds immutable provenance to every adapter result. It records the active engine, canonical engine and classifier versions, adapter version, semantic mode, and any legacy fallback reason. KPI, Insights, Reports, QBR, Close, and readable backup summaries consume this boundary. Newly saved insight, close, and KPI snapshots retain the same provenance; older unversioned snapshots are identified as legacy without recalculating their financial values.

The adapter also exposes a classification-aligned consumer breakdown for debt service, savings contributions, and earned-income sources. It is available only while canonical metrics are active. Consumers retain their audited legacy reducers when reconciliation pauses the cutover.

## Non-goals

Phase 2C-B does not:

- migrate or rewrite transactions;
- implement opening cash balances, net-worth valuation, liquidity maturity, or fixed-asset accounting;
- automatically resolve classification warnings.

Regression coverage is in `tests/canonical-metrics.test.js`, `tests/metric-adapter.test.js`, and `tests/consumer-migration.test.js`.
