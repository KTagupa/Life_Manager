# JavaScript Structure

This folder is organized by responsibility to keep the app easier to maintain:

- `core/`: shared state, persistence, auth/encryption, and startup bootstrap.
- `ui/`: reusable UI rendering/filter helpers used across features (including navigation, accessible modal lifecycle, and descriptors/tooltips).
- `features/`: domain modules (crypto, close, statements, reminders, etc.).

## Workspace Navigation

`ui/navigation.js` owns the Phase 1 workspace routes (`overview`, `activity`, `plan`, `wealth`, `reports`, and `tools`). It moves existing panels into their declared view slots once at startup; panels must not be cloned. Card shortcuts use `getFinanceViewForCard()` before focusing their target, so keep `FINANCE_CARD_VIEW_MAP` aligned with every `data-finance-card` anchor.

Routes are hash-based for direct links and browser history. `core/app-init.js` must initialize navigation before descriptor and feature startup code.

## Phase 4 Quality Foundation

`ui/modal-accessibility.js` automatically applies the Phase 4-0 contract to every `div[id$="-modal"]`: dialog naming/state, topmost-modal focus trapping, Escape through the existing close action, nested-modal stacking, opener focus restoration, and background scroll locking. It also exposes `runFinancePhase40BrowserChecks()` for route and modal smoke testing without writing history or vault data.

Descriptor hints beside non-interactive labels are native buttons. `ui/descriptors.js` must not append a descriptor control inside an existing button or link. See `Finance/PHASE_4_QUALITY_GATE.md` for the acceptance checks required by each Phase 4 route refinement.

## Metric Contract

`core/metric-contract.js` is the machine-readable source of truth for finance metric names, grains, scope behavior, formulas, transaction treatment, guardrails, and known legacy conflicts. The human-readable decision record is `Finance/METRIC_CONTRACT.md`.

Load the contract before `core/metrics.js`. Phase 0 is definition-only: code must not treat the presence of a contract entry as proof that its canonical formula has already replaced the legacy implementation. Check each metric's `implementationState` first.

## Transaction Classification

`core/transaction-classifier.js` implements the side-effect-free Phase 2A interpretation layer. It separates cash movement, earned income, other cash in, consumption, settlements, transfers, asset acquisitions, liabilities, and receivables without rewriting stored transactions or changing legacy dashboard totals.

Load it after `core/metric-contract.js` and before `core/metrics.js`. New metric work should consume `classifyFinanceTransaction()` or `summarizeFinanceClassifications()` instead of adding new category heuristics. The decision record is `Finance/TRANSACTION_CLASSIFICATION.md`.

Phase 4A adds `ui/activity-presentation.js` as a presentation-only adapter over that classifier. It owns the Activity row label, cash-versus-spending effect badges, amount role, review state, and expanded classification filters. `ui/charts.js` applies those filters only to the rows passed to `renderTransactions()`; it must continue assigning the complete date/search-filtered period to `window.filteredTransactions` so Activity refinement cannot change Overview, Reports, or canonical metrics. See `Finance/ACTIVITY_REFINEMENT.md`.

## Plan Coordination

Phase 4B adds `ui/planning-presentation.js` as a pure decision model for the Plan route. Current-month budget usage consumes the canonical classifier's `consumptionDelta`, while bills, goals, and wishlist entries retain their separate scheduling and planning meanings. `features/planning.js` renders the coordinated summary, attention actions, and dedicated Plan budget card. It must not treat bill schedules as cash transactions, goal cash proxies as dedicated contributions, or wishlist amounts as guaranteed affordability. See `Finance/PLAN_COORDINATION.md`.

## Transaction Date Quality

`core/date-quality.js` is the pure Phase 2B inspection and partitioning layer. It loads after the classifier and before `core/metrics.js`. `ui/charts.js` partitions decrypted transactions at the shared cache boundary: usable records enter Activity and calculations, while quarantined records remain encrypted in storage.

`features/date-repair.js` owns the Activity warning banner and encrypted repair modal. Never reintroduce a current-time fallback for malformed dates. The workflow and invariants are documented in `Finance/DATE_QUALITY.md`.

## Canonical Metric Shadow

`core/canonical-metrics.js` is the side-effect-free Phase 2C-A metric engine. It consumes the canonical transaction classifier and emits orthogonal flow totals, savings rate, classification coverage, and issue diagnostics. It must load after `core/date-quality.js` and before legacy `core/metrics.js`.

`core/metric-adapter.js` is the Phase 2C-B compatibility boundary. It captures the legacy summary calculator for reconciliation, gates canonical visible metrics on the current shadow report, and provides explicit legacy fallback labels plus `n/a` savings-rate formatting. It must load immediately after `core/metrics.js`.

`features/metric-shadow.js` builds runtime debt context and compares canonical results with legacy summaries for selected-period, current-month, and all-time scopes. The latest immutable report is available through `getFinanceMetricShadowReport()`. Shadow mode must not write storage or change visible metric values. See `Finance/CANONICAL_METRICS.md`.

Phase 2D-D1 extends `core/metric-adapter.js` with immutable engine provenance and a canonical consumer breakdown. KPI, Insights, Reports, QBR, Close, and readable backup summaries use that boundary. Saved close and KPI records preserve provenance, while unversioned records normalize as explicit legacy snapshots without recomputing their values.

`core/canonical-statements.js` is the pure Phase 2D-D2 P&L and cash-flow projection. It consumes the canonical metric output and its aligned classifications, keeps principal and asset transfers outside profit, places recorded interest and fees in Finance Costs, and requires every cash delta to reconcile across operating, investing, financing, transfer, or explicit unassigned buckets. `features/statements.js` uses this boundary only after both the metric and projection gates pass; otherwise it renders the preserved legacy reducer with an explicit reason. Saved statement snapshots retain separate flow and book provenance. See `Finance/CANONICAL_STATEMENTS.md`.

Phase 2E-A adds `tests/fixtures/counted-once-ledger.fixture.js` as a shared ledger contract for classifier, metric, statement, and position reconciliation. Phase 2E-B extends `tests/phase-2e-fixture.test.js` through canonical snapshots: debt balances use principal settlement, legacy full-payment differences are audited explicitly, and installment output separates principal from the remaining contractual obligation while retaining the contractual total for visible balances. Phase 2E-C adds an immutable 20-check report in `tests/helpers/phase-2e-reconciliation.js`; its regression suite proves the complete accounting bridge passes and PHP 1 unexplained differences fail closed. See `Finance/FIXTURE_RECONCILIATION.md`.

## Canonical Snapshot Cutover

`core/canonical-snapshots.js` is the pure as-of engine. It composes tracked cash, transaction-derived receivables, debt/card/installment liabilities, fixed-asset net book value, and explicit crypto book/market valuations into separate Estimated Net Worth variants. Phase 2D-B2 exposes independent book and market readiness flags.

`core/snapshot-adapter.js` is the Phase 2D-B2 display boundary. It gates the Overview market KPI and book-value statement independently, returns `n/a` when market prices are missing, and labels legacy fallbacks. It loads after `core/snapshot-schema.js`.

Phase 3A extends that adapter with an independent Cash on Hand surface, then composes it with canonical period metrics and market-value net worth in `core/overview-model.js`. The model always returns the ordered four-card contract, explicit `As of`/`For` captions, immutable availability and provenance states, and at most three highest-priority attention actions.

Phase 3B renders that model through `features/overview.js`. Overview now owns only the four core cards, the ranked attention surface, and actionable Insights. The complete KPI scorecard is routed to Reports, crypto duplicate review is routed to Activity, and the Activity type filter can isolate Other Cash In without changing the period transaction set consumed by metrics.

`features/snapshot-shadow.js` builds current and prior-month runtime comparisons without persisting values. Its immutable report is available through `getFinanceSnapshotShadowReport()`, including per-surface readiness. The document-root data attributes expose compact diagnostic metadata for Preview QA. See `Finance/CANONICAL_SNAPSHOTS.md`.

`core/snapshot-schema.js` is the pure Phase 2D-B1 compatibility layer for saved statement positions. Version 2 keeps the legacy `crypto`, `totalAssets`, and `netWorth` aliases while adding installment debt, fixed assets, explicit book/market fields, valuation status, and position provenance. `core/storage.js` normalizes old and new snapshots through this module.

The separate decrypted liability-history cache remains canonical-only. Active lists stay unchanged, while historical snapshots can include a soft-deleted record until its deletion timestamp.

## Canonical Liquidity

`core/canonical-liquidity.js` is the pure Phase 2D-C engine. It calculates average canonical consumption over exactly the previous three complete calendar months, then divides tracked cash by that burn rate. Receivables, crypto, and fixed assets cannot enter the liquidity numerator.

The KPI scorecard and Insights share this calculation. Emergency Fund remains explicitly labeled as a spending proxy because essential-spend classification does not exist yet. Current Ratio remains a separate proxy, and 30-Day Obligation Coverage remains deferred until due-date data is sufficient. See `Finance/CANONICAL_LIQUIDITY.md`.

## Load Order

Because the app uses global functions across files, keep the script order aligned with `index.html`:

1. `core/config.js`, `core/metric-contract.js`, `core/transaction-classifier.js`, `core/date-quality.js`, `core/canonical-metrics.js`, `core/canonical-statements.js`, `core/canonical-liquidity.js`, `core/canonical-snapshots.js`, `core/snapshot-schema.js`, `core/snapshot-adapter.js`, `core/metrics.js`, `core/metric-adapter.js`, `core/overview-model.js`, then the remaining `core/*` files (except `app-init.js`)
2. `features/xrpl.js` (read-only XRP Ledger reconciliation helpers)
3. `features/ronin.js` (read-only Ronin reconciliation helpers)
4. `features/crypto.js` (shared crypto helpers used by Activity and other modules)
5. `ui/activity-presentation.js`, `ui/planning-presentation.js`, `ui/charts.js`, and `ui/renderers.js`
6. remaining `features/*`
7. `ui/modal-accessibility.js`, `ui/navigation.js`, `ui/accessibility.js`, `ui/preferences.js`, and `ui/descriptors.js`
8. `core/release-readiness.js`
9. `core/app-init.js`

`core/app-init.js` is the single startup entrypoint for DOM-ready boot logic and shared event binding.

`ui/tools-presentation.js` is the pure Phase 4E safety-status model. `features/tools.js` gathers backup settings, storage diagnostics, Preview state, and cloud runtime state, then coordinates the Tools route without changing persistence. Preview diagnostics must return from `core/storage.js` before any real localStorage or IndexedDB vault read. See `Finance/TOOLS_REFINEMENT.md`.

`ui/accessibility.js` owns the Phase 5A application-wide semantic and contrast audit. It normalizes legacy and dynamic control names/types, marks icons decorative, validates the AA contrast token contract, and exposes the combined browser audit. `ui/navigation.js` owns canonical hashes, duplicate-history prevention, tab-panel semantics, hidden-panel focus recovery, and the real Back/Forward harness. `ui/modal-accessibility.js` also covers the non-dismissible locked-vault overlay and makes background regions inert while any dialog is open. See `Finance/PHASE_5A_ACCESSIBILITY_NAVIGATION.md`.

`core/runtime-performance.js` owns the Phase 5C route lifecycle, device profiles, bounded performance diagnostics, and all-route browser harness. Route-only presentation work must register through that lifecycle; canonical correctness inputs remain eager. See `Finance/PHASE_5C_DEVICE_PERFORMANCE.md`.

`core/release-readiness.js` owns the Phase 5D fail-closed release composition. It must load after the browser audit contracts and before `core/app-init.js`. The browser audit refuses to run outside isolated Preview Mode and accepts the evidence produced by `scripts/run-phase-5d-automated-gate.js`. See `Finance/PHASE_5D_RELEASE_READINESS.md`.
