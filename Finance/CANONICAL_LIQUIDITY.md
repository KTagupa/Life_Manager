# FinanceFlow Canonical Liquidity

Status: Phase 2D-C complete  
Canonical liquidity engine version: 1.0.0  
Runtime source: `assets/js/core/canonical-liquidity.js`

## Shared calculation

Current liquidity metrics use one side-effect-free calculation:

`tracked cash / average monthly canonical consumption during the previous 3 complete calendar months`

For an as-of date in July 2026, the window is April 1 through June 30. March and the partial July month are excluded. The divisor is always three because the window always contains three complete calendar months.

Canonical consumption recognizes purchases once and excludes settlements, transfers, lending, savings transfers, crypto purchases, fixed-asset acquisitions, and debt principal movements.

## Liquidity numerator

The current app has no separately verified cash-equivalent accounts, so Phase 2D-C uses tracked cash only. The calculation cannot include:

- money lent or other receivables;
- crypto holdings;
- fixed assets;
- estimated asset-sale proceeds.

Negative tracked cash produces zero eligible cash rather than negative runway.

## Visible metrics

- `Liquidity Runway` reports cash-only months in the KPI scorecard and cash-only days in Insights.
- `Emergency Fund (Proxy)` uses the same cash reserve and burn window. It remains a conservative proxy because the app cannot yet distinguish essential from discretionary consumption.
- A zero burn rate displays `n/a` with the completed window instead of presenting an unbounded runway as decision-grade.
- Quarantined dates or unclassified records block the visible calculation and display a data-review state.

Forecast runway and monthly-close runway remain scenario and historical-period calculations respectively; they are not current-liquidity estimates.

## Deferred metric

`30-Day Obligation Coverage` is not implemented in Phase 2D-C. Bills and liability records do not yet provide enough consistent maturity information to calculate every payment due within 30 days.

The existing card is therefore labeled `Current Ratio (Proxy)` and must not be interpreted or exported as 30-Day Obligation Coverage.

Regression coverage is in `tests/canonical-liquidity.test.js`.
