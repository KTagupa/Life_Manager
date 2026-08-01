# Phase 4C: Wealth Coordination

Status: implemented.

Phase 4C unifies fixed assets, receivables, crypto, credit cards, debts, and installments in one Wealth decision view. It adds no storage fields and changes no canonical transaction, statement, snapshot, or reconciliation formula.

## Route structure

Wealth now opens with a full-width position coordinator, followed by the crypto toolkit and the six detailed position domains. Asset-side cards appear before obligation-side cards so the route reads from owned value to amounts owed.

The coordinator separates four meanings:

- **Estimated Net Worth — market-value snapshot:** current cash, receivables, fixed-asset net book value, and crypto market value less liabilities. This remains `n/a` if any required crypto market price or reconciliation gate is unavailable.
- **Estimated Net Worth — current book-value estimate:** the same position with crypto at book value. This current estimate is gated independently and is not presented as a saved book-value statement.
- **Cash on Hand:** the independently gated tracked-cash position. It is explicitly not a bank-verified balance.
- **Total liabilities:** debt principal, credit-card outstanding balances, and remaining contractual installment obligations.

The six drill-down summaries retain their own bases. Fixed assets show net book value, receivables show outstanding advances, crypto shows market value with book value only as labeled context, debts show principal outstanding, credit cards show outstanding balances, and installments show the contractual amount remaining with principal and future finance charges separated in the detail.

## Fail-closed valuation behavior

`assets/js/ui/wealth-presentation.js` consumes the canonical snapshot shadow report and its per-surface cutover assessment. It does not calculate a second wealth position.

The crypto toolkit no longer substitutes holding cost when a live price is missing. In that state its market value and unrealized profit/loss display `n/a`, while the explicitly labeled book value remains visible as context. This keeps book and market values from being combined in one unlabeled total.

The coordinator surfaces missing crypto prices, incomplete encrypted history, missing liability effective dates, fixed-asset date gaps, untracked or overpaid receivables, and incomplete installment fee splits as direct review actions.

## Interaction contract

- Every coordinator summary is either descriptive text or a real button that focuses its matching detailed card.
- Fixed asset and debt rows no longer make their whole descriptive surface an implicit click target.
- Manage, Payment, Previous payment, Edit, and Delete controls are explicit, keyboard reachable, touch visible, and given record-specific accessible names.
- Fixed-asset rows and totals use `computeFinanceFixedAssetBookValue()` so their depreciation display matches the canonical snapshot engine.
- Position and domain grids collapse from four or three columns to two, then one; row controls wrap instead of becoming hover-only on small screens.
- Phase 4-0 modal focus trapping, Escape handling, focus restoration, and reduced-motion behavior remain inherited by the existing editors.

Run the complete Finance regression suite with:

```sh
node --test Finance/tests/*.test.js
```
