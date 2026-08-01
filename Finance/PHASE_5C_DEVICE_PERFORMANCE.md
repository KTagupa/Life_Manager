# Phase 5C: Device and Performance Hardening

Status: Implemented  
Runtime contract: `assets/js/core/runtime-performance.js` version 1.0.0  
Financial storage schema: unchanged at version 6

## Outcome

Phase 5C adds a route lifecycle, a representative device matrix, bounded performance diagnostics, and a reusable read-only browser acceptance harness. It changes no financial formula, transaction classification, encrypted record, backup contract, or cloud-merge rule.

The Finance app no longer initializes and paints every route at startup. Canonical correctness work remains eager where another route depends on it; route-only presentation work initializes on first use and refreshes only while that route is active.

## Route lifecycle

`configureFinanceRouteRuntime()` registers one initializer list and one refresh function for each route. Initializers run once; refreshers run at startup, on navigation, and after `finance:dataready` for the active route only.

| Route | Deferred work |
|---|---|
| Overview | Overview actions and four-card presentation |
| Activity | Recent Movement rows and Activity-only filter summary |
| Plan | Plan coordinator, bill and wishlist painting, budgets, and goals |
| Wealth | asset, crypto, card, debt, installment, and receivable painting, including installment images |
| Reports | Chart.js construction, report charts, Close, KPI, Forecast, Statements, Variance, Revenue, and the shared Reports coordinator |
| Tools | safeguard coordinator and storage diagnostics presentation |

The old coordinator-level route listeners were removed or guarded, so they cannot repaint a hidden route after that route has been initialized.

## Correctness boundary

The following remain eager because visible metrics, snapshots, reminders, or synchronization depend on them:

- transaction decryption, date quarantine, classification, and scoped canonical metrics;
- metric and snapshot reconciliation gates;
- liability and receivable hydration used by the snapshot engine;
- snapshot history;
- bill and credit-card reminder synchronization;
- cloud and encrypted local-storage recovery state.

Plan-only wishlist decryption and every route-only DOM paint are deferred. Bill reminder synchronization may decrypt bills before Plan opens, but the Plan list is not painted until Plan is active.

## Device matrix

The required matrix is exported as `FINANCE_DEVICE_MATRIX`:

| Profile | Viewport |
|---|---:|
| Compact phone | 360 × 800 |
| Standard phone | 390 × 844 |
| Portrait tablet | 768 × 1024 |
| Landscape tablet | 1024 × 768 |
| Desktop | 1440 × 900 |

The shared CSS now constrains routed content to the viewport, wraps long diagnostic values, bounds enhanced dialogs to the dynamic viewport, accounts for bottom safe areas, preserves horizontal scrolling inside intentional table regions, and provides at least 44 × 44 CSS pixels for mobile navigation controls.

## Performance contract

`getFinancePerformanceDiagnostics()` returns bounded, immutable runtime metadata only. It contains no transaction, vault, password, key, ciphertext, attachment, or error-message content. Diagnostics JSON exported from Tools includes this performance block beside the existing sanitized storage block.

The initial budgets are:

| Measurement | Budget |
|---|---:|
| Synchronous application initialization | 500 ms |
| Route activation, including queued work | 250 ms |
| Active-route render | 750 ms |
| Cumulative blocking time above the long-task threshold | 200 ms |
| Long-task threshold | 50 ms |

The runtime retains at most 30 route activations and 30 long-task records. An unavailable browser measurement is reported as unavailable and does not fabricate a zero.

## Browser acceptance harness

In a disposable Preview Mode tab, set each required viewport and run:

```js
await window.runFinancePhase5CBrowserChecks()
```

The harness cycles through all six routes without adding browser history, verifies that exactly the active route is visible, checks page and card overflow, checks mobile route-control sizes, measures route work, evaluates budgets, and restores the original route.

The Codex in-app browser did not execute this live matrix during implementation because its URL policy rejects local `file://` navigation. No alternate browser surface or policy workaround was used. The harness remains ready for a permitted local-hosted Preview QA session.

## Regression coverage

```sh
node --test Finance/tests/phase-5c-device-performance.test.js
node --test Finance/tests/*.test.js
```

Coverage includes the frozen device/budget contracts, breakpoint resolution, passing and failing budget evaluation, once-only initialization, repeat refreshes, script order, active-route chart ownership, eager correctness hydration, deferred Plan-only lists, narrow-layout CSS, sanitized diagnostics, and the browser-harness wiring.

Phase 5D now composes this harness with the accounting, accessibility, data-safety, Preview-isolation, and automated-suite evidence. See `PHASE_5D_RELEASE_READINESS.md`.
