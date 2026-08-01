# Phase 4D: Reports Refinement

Status: implemented.

Phase 4D gives the Reports route one visible scope contract and explicit market-versus-book position reporting. It adds no storage fields and changes no canonical transaction, metric, snapshot, statement, or reconciliation formula.

## Shared scope

Reports now begins with a full-width coordinator containing `Selected`, `Current`, and `All-Time` scope controls. Selected scope uses the synchronized month and year controls. The same date-only transaction set drives:

- Business KPI flow measures;
- Revenue Mix;
- Income and Spending Trend;
- Spend Breakdown;
- transaction rows in Reports CSV and PDF exports.

Activity classification and search controls remain ledger-only. A search term can hide Activity rows, but it cannot silently narrow a report metric or export launched from Reports.

Every report card prints its own `For <period>` caption. Trends use daily points for a one-month scope and monthly points for wider scopes, so the chart no longer keeps an unrelated six- or twelve-month window.

## Monthly-only comparisons

Configured budgets are monthly limits. Budget Adherence and Budget Variance therefore render only when the shared report scope resolves to exactly one month. Year, all-time, month-across-years, and unbounded selected scopes show a single-month requirement instead of comparing many months of Spending with one monthly plan.

Close Readiness follows the same rule. Wider scopes show `n/a` and retain the latest close only as historical context.

## Position reporting

The Reports coordinator shows two current as-of positions side by side:

- **Estimated Net Worth — Market-value snapshot**;
- **Estimated Net Worth — Current book-value estimate**.

Both consume the existing canonical snapshot and cutover boundaries. They never substitute for each other. Missing crypto prices leave the market value at `n/a` without hiding an independently reconciled book estimate.

Position values do not follow the flow-period selector. Their shared as-of timestamp and the distinction between flows and snapshots are printed next to the comparison. The book-value estimate is explicitly not described as a saved month-end statement.

Reports PDF exports now print the shared flow period, metric provenance, the market-value snapshot, the current book-value estimate, and the same statement caveat. CSV exports contain only transactions in the shared Reports scope.

## Interaction and responsive contract

- The Reports scope controls have synchronized pressed and disabled states.
- Export, KPI utility, scope, month, and year controls are keyboard reachable and have visible focus.
- Report controls collapse from three columns to two and then one.
- The market/book comparison collapses to one column on narrow phones.
- Phase 4-0 modal focus trapping, Escape handling, focus restoration, and reduced-motion behavior remain inherited by KPI utilities and report modals.

Run the complete Finance regression suite with:

```sh
node --test Finance/tests/*.test.js
```
