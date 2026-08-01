# Phase 4B: Plan Coordination

Status: implemented.

Phase 4B brings monthly budgets, recurring bills, financial goals, and wishlist purchases into one decision view. It adds no storage fields and changes no metric, statement, snapshot, or reconciliation formula.

## Route structure

Plan now opens with a full-width coordinator followed by a balanced two-column set of Monthly Budgets, Recurring Bills, Financial Goals, and Wishlist cards. Budget Variance and the detailed spending breakdown remain in Reports.

The coordinator answers four different questions without combining their meanings:

- **Budget remaining:** current-month canonical consumption inside configured category limits.
- **Active bills:** the count and expected monthly amount of non-paused recurring bills.
- **Active goals:** the count and combined target amount of goals whose status is active.
- **Wishlist planned:** the total entered amount and count of wishlist purchases.

Attention items connect setup gaps and upcoming commitments to the correct card or editor. Summary tiles focus the matching Plan card; they do not silently open an editor or write data.

## Accounting boundaries

`ui/planning-presentation.js` derives current-month budget usage from `classifyFinanceTransaction()` and `consumptionDelta`. A credit-card purchase consumes its category budget when purchased; its later card payment is a settlement and cannot consume the budget a second time.

The budget summary separates spending in configured categories from canonical Spending in categories without a limit. It does not use cash outflow as a substitute for consumption.

Bill amounts are scheduling inputs, not proof that cash moved. The next bill date is labeled as scheduled rather than overdue because standard recurring bills do not yet retain complete paid-state history. Electricity bills use the latest recorded cycle amount when available.

## Goal and wishlist limits

Goals do not have dedicated contribution ledgers. Existing progress bars are therefore labeled `Cash proxy`: they compare current Cash on Hand with each target and must not be interpreted as funded goal balances.

A wishlist category is considered coordinated only when it has a matching configured budget. This is a setup signal, not an affordability guarantee. The planner's scenario simulation remains the place for exploratory affordability checks.

## Interaction contract

- Bill and wishlist rows no longer make descriptive row content an implicit click target.
- Edit, Pay, Record, Pause, Buy now, and Delete are explicit keyboard-reachable controls with accessible names.
- The Plan coordinator and card actions have visible focus indicators.
- The four summary tiles collapse from four columns to two, then one, while row actions wrap on smaller screens.
- Phase 4-0 modal focus trapping, Escape handling, focus restoration, and reduced-motion behavior remain inherited by the existing editors.

Run the complete Finance regression suite with:

```sh
node --test Finance/tests/*.test.js
```
