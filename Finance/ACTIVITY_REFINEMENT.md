# Phase 4A: Activity Refinement

Status: implemented.

Phase 4A makes Activity easier to read and audit without changing the canonical transaction classifier, stored records, or finance formulas.

## Row contract

Every Recent Movement row is derived from `classifyFinanceTransaction()` through `ui/activity-presentation.js`. A row shows:

- one canonical classification, such as Cash purchase, Card purchase, Card payment, Borrowed cash, or Asset sale;
- its cash role, including the important distinction between `Cash out • spending`, `Spending now • cash later`, and `Cash out • settlement`;
- applicable Spending, Settlement, Transfer, Asset, Liability, and Receivable effects;
- `Needs review` when the classifier reports an incomplete or issue-bearing record;
- explicit Edit/Delete actions, or a single managed-record action that identifies the source feature.

The entire row is no longer an implicit click target. This removes hidden interaction from descriptive content and keeps row actions keyboard reachable.

## Filters and scope isolation

Activity can isolate Cash In, Cash Out, Earned Income, Other Cash In, Spending, Settlements, Transfers, Assets & Liabilities, No Cash Movement, and Needs Review.

The classification filter affects only the visible Activity rows. Month, year, and search establish the period transaction set; that complete set remains assigned to `window.filteredTransactions` and continues to feed metric consumers. In particular, selecting Settlements does not make Reports treat settlements as spending, and selecting Card purchases does not alter Net Cash Flow.

The `Export` control is labeled separately because it selects which rows an export includes; it is not a metric-scope control.

## Date review

The Activity header always exposes date health. It reads `Dates checked` when the usable ledger has no date repair work and `Review dates` with a count when records need normalization or repair. The existing encrypted repair workflow remains the only place that changes a stored transaction date.

## Acceptance checks

- Canonical classifier fixtures produce the expected row labels and cash-versus-spending effects.
- Activity classification filters do not narrow the period metric input.
- Row edit/delete actions remain visible on touch-sized layouts and keyboard reachable.
- The filter controls collapse to two columns and then one column on narrower screens.
- The cash-versus-spending guide is collapsed by default and can be opened without changing data.
- Phase 4-0 modal, keyboard, focus, contrast, and reduced-motion checks remain required.

Run the complete Finance regression suite with:

```sh
node --test Finance/tests/*.test.js
```
