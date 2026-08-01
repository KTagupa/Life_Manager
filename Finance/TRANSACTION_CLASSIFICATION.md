# FinanceFlow Transaction Classification

Status: Phase 2A complete  
Classifier version: 1.0.0  
Runtime source: `assets/js/core/transaction-classifier.js`

## Purpose

The classifier gives every stored transaction one canonical event class plus orthogonal accounting deltas. It interprets existing data without mutating records, migrating storage, or changing visible dashboard totals.

This separation prevents a single legacy `expense` total from mixing purchases, card payments, debt principal, savings transfers, lending, and asset acquisitions.

## Canonical deltas

| Field | Meaning |
|---|---|
| `cashDelta` | Signed change in tracked cash |
| `earnedIncomeDelta` | Earned income recognized by the event |
| `otherCashInDelta` | Cash received that is not earned income |
| `consumptionDelta` | Consumption recognized once at purchase or charge time |
| `financeChargeConsumptionDelta` | Interest or fees included in consumption |
| `settlementDelta` | Principal or liability settlement, not new consumption |
| `transferDelta` | Signed movement between tracked positions without income or consumption |
| `assetAcquisitionDelta` | Value exchanged for a non-cash asset |
| `assetDisposalProceedsDelta` | Cash proceeds from an asset sale; not the accounting gain |
| `liabilityDelta` | Signed change in tracked liabilities |
| `receivableDelta` | Signed change in money owed to the user |

## Classification precedence

Strong transaction types and explicit links take priority over category inference:

1. Credit-card and installment payment types
2. Debt cash receipts, debt tracking, and linked debt repayments
3. Linked lending advances and repayments
4. Explicit or linked asset acquisitions, including crypto-buy mirrors
5. Savings and own-account transfers
6. Asset-sale and crypto-sale proceeds
7. Earned income and other cash in
8. Remaining cash or credit-card consumption purchases
9. Unclassified fallback with data-quality issues

Debt category names can be supplied as classifier context for legacy repayments that have no `debtId`. This is an explicit compatibility path and is reported with lower confidence.

## Key treatments

| Event | Cash | Income | Consumption | Settlement / position |
|---|---:|---:|---:|---|
| Cash purchase | − | — | + | — |
| Credit-card charge | — | — | + | Card liability + |
| Credit-card payment | − | — | — | Settlement +, card liability − |
| Installment payment | − | — | Fees only | Principal settlement + |
| Debt repayment | − | — | Interest and fees when split | Principal settlement + |
| Savings transfer | − | — | — | Transfer out |
| Lending advance | − | — | — | Receivable + |
| Lending repayment | + | Other cash in | — | Receivable − |
| Crypto or fixed-asset buy | Depends on payment source | — | — | Asset acquisition + |

## Data-quality reporting

Classification never assigns malformed dates to today. Each result carries `issues`, `valid`, `classifiable`, and `confidence` fields. Current issue codes cover invalid amounts and dates, unknown types or payment sources, missing card/installment links, inferred debt links, and incomplete debt-payment splits.

Phase 2B now quarantines missing or impossible dates before they reach metrics, charts, filters, or Activity. Parseable legacy formats remain usable but are surfaced for normalization. The encrypted repair workflow is documented in `DATE_QUALITY.md`.

Phase 2C-A consumes these deltas in a shadow canonical metric engine and compares them with legacy totals for every UI scope. Phase 2C-B uses that report as a live gate: reconciled vaults display canonical flow metrics, while unresolved vaults retain explicitly labeled legacy calculations. See `CANONICAL_METRICS.md`.
