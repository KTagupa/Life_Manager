# FinanceFlow Canonical Consumers

Status: Phase 4D Reports consumer placement complete  
Adapter version: 1.1.0  
Consumer runtime boundary: `assets/js/core/metric-adapter.js`  
Statement runtime boundary: `assets/js/core/canonical-statements.js`

## Scope

Phase 2D-D1 consolidates these low-risk consumers on the existing reconciliation-gated metric boundary:

- Business KPI scorecard
- Insights
- PDF Reports
- Quarterly Business Review
- Monthly Close and KPI snapshots
- Readable backup summary PDF

Phase 2D-D2 adds a dedicated statement projection over the same canonical transaction classes. Live Financial Statement P&L and cash flow now use that projection when both the metric and statement reconciliation gates pass. The canonical book-value balance sheet delivered in Phase 2D-B2 remains an independent position boundary.

Phase 3B changes presentation ownership without changing those calculation boundaries. Overview consumes the four-card presentation model and at most three ranked attention actions. Insights reuse that model for concise action summaries, while the complete KPI scorecard now lives in Reports. Activity type filtering is ledger-only and cannot narrow period metrics.

Phase 4C adds the Wealth coordinator as a snapshot consumer. It reads the canonical snapshot shadow report and its independent cash, market, and book readiness signals. Market and book Estimated Net Worth remain separate, missing crypto prices fail market displays closed, and the domain drill-downs retain receivable, principal, outstanding, and contractual liability meanings instead of recomputing one blended total.

Phase 4D adds one Reports presentation boundary over the existing canonical consumers. KPI, Revenue Mix, Trends, Spend Breakdown, and Reports exports share a date-only flow scope, while the position comparison consumes the independently gated canonical market and book snapshot values. Monthly budget and close consumers fail closed when that flow scope is wider than one calendar month.

## Provenance contract

Every display summary now carries immutable `metricProvenance` containing:

- provenance schema version;
- canonical or legacy engine mode;
- canonical engine and classifier versions when available;
- adapter version;
- the explicit reason when reconciliation requires legacy fallback.

Reports and exported summaries print this source. Insights, Close, and KPI snapshots retain it in saved data. Existing saved records keep their original amounts and are marked `unversioned_saved_snapshot` when they have no historical provenance.

Statements carry a separate immutable `statementProvenance` object because their accounting projection can fall back independently of the balance sheet. It records the statement projection, metric-engine, and classifier versions plus an explicit cutover reason. Saved statement snapshots and statement PDFs preserve or print this source; old snapshots remain unchanged and normalize as legacy.

## Derived consumer metrics

While the canonical gate is ready, KPI debt service, savings contributions, and QBR income sources are derived from the exact classifications attached to the summary scope. Classification and transaction arrays must align one-to-one. If they do not—or if the vault is on legacy fallback—the consumer uses its previous audited reducer and records the fallback source.

KPI and Insights use canonical tracked cash when snapshot history and reconciliation are ready. They retain the previous cash helper when that independent snapshot boundary is unavailable. Liquidity continues to use the Phase 2D-C three-complete-month definition.

Monthly Close retains its historical selected-month runway calculation. Phase 2D-D1 does not replace it with the current-liquidity metric and does not recalculate older close records.

## Statement projection

The canonical P&L recognizes earned income and consumption in the selected month. Debt principal, card settlements, installment principal, savings transfers, lending, and asset acquisitions do not reduce profit. Only recorded interest and fees enter Finance Costs. The resulting bottom line is explicitly labeled `Net Income, Pre-D&A/Tax` because depreciation and tax schedules are not available.

The cash-flow projection separates operating, investing, financing, and own-account transfer activity. A card purchase is a non-cash expense when charged; its later payment is a financing cash outflow and is not another expense. Every canonical cash delta must land in a bucket, and the bucket total must reconcile to canonical Net Cash Flow before visible cutover.

`Cost of Earning` remains a management-reporting heuristic. It applies the documented work-related category keywords only after a transaction has been classified as consumption, so a fixed-asset purchase with a capital signal cannot enter COGS merely because its category contains `equipment`.

See `Finance/CANONICAL_STATEMENTS.md` for the full projection and fallback contract.

## Regression fixtures

Coverage verifies canonical and legacy provenance, classification-aligned debt service and savings, consumer wiring, stored provenance, explicit backup fallback, P&L exclusions, cash-flow bucket reconciliation, statement fallback behavior, saved statement provenance, and browser load order.
