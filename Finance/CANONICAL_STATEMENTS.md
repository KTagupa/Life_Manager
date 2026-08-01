# FinanceFlow Canonical Statements

Status: Phase 2D-D2 complete  
Projection version: 1.0.0  
Provenance schema version: 1  
Runtime engine: `assets/js/core/canonical-statements.js`  
UI and export boundary: `assets/js/features/statements.js`

## Purpose

Phase 2D-D2 replaces the live Financial Statement P&L and cash-flow reducer with a pure projection built from the canonical transaction classifier. It does not rewrite transactions or recalculate older saved statement snapshots.

The balance sheet remains a separate as-of position supplied by the Phase 2D-B2 book-value snapshot boundary. A statement can therefore report canonical flow provenance and canonical or fallback book provenance independently.

## P&L contract

The monthly P&L uses these rules:

- Revenue is earned income only.
- Cost of Earning and Operating Expenses contain canonical consumption only.
- Recorded debt or installment interest and fees are Finance Costs.
- Debt principal, card payments, installment principal, lending advances, savings transfers, and asset acquisitions are not P&L expenses.
- Credit-card consumption is recognized when the purchase occurs, even though cash moves later.
- Net Income is `EBITDA - Finance Costs` and is labeled `Pre-D&A/Tax` because the app has no depreciation or tax schedule.

Cost of Earning remains a management-reporting category heuristic. Work-related keywords are evaluated only after canonical classification says a transaction is consumption. An explicitly linked fixed asset or other asset acquisition cannot become COGS because of its category label.

## Cash-flow contract

| Bucket | Included activity |
|---|---|
| Operating | Earned-income cash, cash consumption purchases, and refunds/reimbursements |
| Investing | Lending advances and repayments, savings contributions, asset/crypto acquisitions, and asset/crypto disposals |
| Financing | Debt cash received, debt/card/installment settlements, generic settlements, and other financing-like cash in |
| Account transfers | Recorded transfers between the user's own accounts, shown separately to keep tracked-cash reconciliation transparent |

A credit-card purchase is displayed as a non-cash purchase disclosure. Its later payment is a financing cash outflow. This prevents the purchase and settlement from being counted twice as spending.

`Operating + Investing + Financing + Account Transfers + Unassigned` must equal canonical Net Cash Flow within PHP 0.005. Visible cutover is blocked when a cash delta is unassigned.

## Cutover and fallback

The Statements UI uses the canonical projection only when all of these conditions pass:

1. The shared metric adapter is in canonical mode for the selected month.
2. Every usable transaction has an aligned canonical classification.
3. There are no invalid, unclassified, or date-quarantined records in the projection scope.
4. The statement cash buckets reconcile to canonical Net Cash Flow.
5. The statement and adapter Net Cash Flow values agree.

If any condition fails, the prior statement reducer remains available as an explicit legacy fallback. The UI and PDF identify the flow source, and provenance records the cutover reason. A fallback never silently adopts canonical labels or recomputes an older snapshot.

## Persistence and exports

New statement snapshots store:

- statement projection schema version;
- metric and statement provenance;
- compact cutover and cash-reconciliation diagnostics;
- Finance Costs and P&L basis;
- operating, investing, financing, and transfer cash-flow totals;
- debt, card, and installment payment disclosures;
- savings and asset-acquisition disclosures.

Old snapshots retain their original values and normalize as `unversioned_saved_snapshot`. Statement history, live status, and PDFs show flow and book provenance separately.

## Non-goals and guardrails

- This is a personal management statement, not a GAAP- or IFRS-complete financial statement.
- Depreciation, tax expense, accruals, inventory, and gains or losses on asset disposal are not inferred from missing data.
- Unsplit debt payments are treated as principal by the classifier; only explicitly recorded interest and fees enter Finance Costs.
- 30-Day Obligation Coverage remains deferred until reliable due-date data exists.
