# FinanceFlow Canonical Snapshot Shadow

Status: Phase 3B Overview snapshot cutover complete  
Canonical snapshot engine version: 1.3.0  
Shadow reporter version: 1.2.0  
Snapshot adapter version: 1.1.0  
Statement snapshot schema version: 2  
Runtime sources: `assets/js/core/canonical-snapshots.js`, `assets/js/core/snapshot-schema.js`, `assets/js/core/snapshot-adapter.js`, `assets/js/features/snapshot-shadow.js`

## Purpose

Phase 2D-A establishes one side-effect-free, date-bound source of truth for financial positions. It runs beside the current KPI and statement calculations so differences can be inspected before any visible snapshot value changes.

Phase 2D-A did not change card values, labels, saved statements, or encrypted records.

Phase 2D-B1 hardens the shadow path without changing visible values. It adds a separate decrypted history cache, versioned saved-position fields, explicit market-value availability states, and exact detection of the known legacy card-order calculation.

Phase 2D-B2 cuts over visible snapshot surfaces through independent gates. The Overview uses the market-value variant only when prices and reconciliation are ready. Statements use the book-value variant independently, including fixed-asset net book value. Missing market prices display `n/a`; they never cause a silent book-value substitution.

Phase 2E-B makes split debt repayments principal-aware and adds explicit installment principal versus contractual-balance disclosures. The shared fixture reconciles those positions with the classifier, canonical metrics, and Financial Statements.

Phase 2E-C locks that behavior with one immutable reconciliation report spanning P&L, cash, settlements, embedded snapshot flows, ending positions, and the audited legacy comparison. Negative fixtures prove unexplained consumption or debt differences fail closed.

Phase 3A adds a dedicated Cash on Hand display surface. It uses the tracked-cash snapshot whenever transaction classification and the cash invariant reconcile, even if missing crypto prices or incomplete liability history independently make market-value net worth unavailable. Its fallback never fabricates a zero balance and always retains the tracked, not bank-reconciled, caveat.

Phase 3B makes that Cash on Hand surface and the independently gated market-value net-worth surface two of the four visible Overview cards. Both show explicit as-of captions and retain separate canonical, legacy, or unavailable states.

## Canonical snapshot

For a requested as-of date, the engine returns:

- tracked cash: configured opening cash, or the documented zero assumption, plus canonical cash deltas through the as-of date;
- receivables: lending advances minus repayments, clamped at zero with overpayment diagnostics;
- debt liabilities: opening principal plus later increases minus principal repayments;
- credit-card liabilities: opening balances plus linked charges minus linked payments;
- installment liabilities: remaining contractual obligations, with principal and remaining finance-charge subtotals exposed separately;
- fixed assets: acquisition cost, straight-line accumulated depreciation, and net book value as of the date;
- crypto book value and market value as independent nullable inputs;
- Estimated Net Worth for book and market valuation variants.

Deleted fixed assets remain available to historical snapshots until their deletion timestamp. Liabilities with a future effective date are excluded. Missing effective dates do not silently become today; they produce readiness diagnostics.

## Liability rules

A debt record owns its opening principal. A `debtPrincipalSeed` transaction can represent the corresponding cash receipt but is never added to the liability a second time. Later `debt_increase` records add to principal. Linked expense records reduce principal only by canonical `settlementDelta`; explicitly recorded interest and fees remain consumption and Finance Costs.

For legacy reconciliation, the engine retains the old debt result that subtracts the entire payment. The comparison marks a debt difference as expected only when the legacy value exactly equals that audited full-payment result. Other debt differences still block cutover.

Installment `total` and `outstanding` retain the existing product meaning: the amount still contractually payable, including remaining tracked fees. `principalTotal`, `principalOutstanding`, and `remainingFinanceChargeTotal` make the accounting split explicit without changing the visible contractual balance. Historical payments without a fee split are counted in `missingFeeSplitPaymentCount`; they are not silently assigned estimated fees.

ID linkage takes priority. Legacy category linkage is used only when a category has one unambiguous owner.

Card and installment records retain their storage creation timestamps after decryption so historical snapshots do not include positions before they existed.

## Historical record cache

Current UI lists remain active-only. Canonical snapshots use a separate decrypted cache containing active and soft-deleted debts, cards, installment plans, and receivable records. `deletedAt` acts as the end of the record's historical availability, so a liability can appear in a statement before deletion without returning to the current UI.

The cache is hydrated once during storage load and refreshed after liability render cycles. Decryption failures are counted in the shadow report and block a clean handoff rather than silently turning missing records into zero.

## Valuation variants

The book variant uses crypto cost basis. The market variant uses current market prices. Both include fixed-asset net book value and the same cash, receivable, and liability components.

If either crypto valuation is unavailable, that variant is `null`. The engine never falls back from market to book value, or from book to market value, without saying so.

The shadow comparison treats a legacy cost-basis fallback caused by missing market prices as an expected difference, while still blocking market-value cutover readiness. Availability is explicit: `available`, `available_empty`, `unavailable_missing_prices`, or `unavailable_engine`.

## Saved statement schema version 2

Newly generated statement snapshots store `snapshotSchemaVersion: 2` and an explicit month-end `asOf` timestamp. Their balance sheet preserves legacy aliases for compatibility and adds:

- `installmentDebt`;
- `fixedAssets`;
- `cryptoBookValue` and nullable `cryptoMarketValue`;
- `totalAssetsBookValue` and nullable `totalAssetsMarketValue`;
- `netWorthBookValue` and nullable `netWorthMarketValue`;
- `valuationBasis`, `marketValuationStatus`, and `positionSource`.

Legacy snapshots normalize into the same shape with zero fixed assets and their existing book values as fallbacks. Phase 2D-B2 does not rewrite stored snapshots. Panels, history, trends, and PDF exports identify those records as legacy instead of presenting them as canonical.

## Runtime reconciliation

`refreshFinanceSnapshotShadow()` produces an immutable report containing:

- the current canonical market-value snapshot versus the existing KPI calculation;
- the previous month-end canonical book-value snapshot versus the existing statement calculation;
- cash invariant failures;
- component differences requiring review;
- expected differences caused by adding fixed assets and separating valuation variants;
- readiness and source-quality diagnostics.

The report is available as `window.financeSnapshotShadowReport` or through `getFinanceSnapshotShadowReport()`. Refreshes are debounced across transaction filters and liability/asset renders, with one awaited refresh after storage, assets, and crypto data finish loading.

## Visible cutover gate

Phase 2D-B2 requires the following common checks before either canonical surface is visible:

1. canonical transaction classification is safe;
2. tracked cash matches the legacy calculation;
3. receivable and liability components reconcile;
4. liability and fixed-asset effective dates are complete;
5. the required crypto valuation variant is available for that surface;
6. visible titles identify `Estimated Net Worth (Market)` and `Net Worth (Book)` rather than using an unlabeled shared title.

The market KPI and book statement then resolve separately:

- Market ready: show canonical `Estimated Net Worth (Market)`.
- Market prices missing: show `n/a`, the missing holding count, and direct the user to book-value Statements.
- Book ready: show canonical statement assets and `Net Worth (Book)`, including fixed assets at net book value.
- Reconciliation or history failure: keep an explicitly labeled legacy fallback.
- Old saved snapshot: retain its historical legacy values and label it `Legacy snapshot`.

Expected fixed-asset, net-worth, audited card-order, and audited debt-finance-charge differences are recorded but do not count as unexplained component failures.

Preview reconciliation also exposed FIN-DQ-008: the legacy card helper clamps balances after every transaction without first normalizing chronological order. A payment encountered before older charges can therefore be discarded in part. The canonical calculation is order-independent. Phase 2D-B1 records the legacy order-sensitive total separately and treats a difference as expected only when the legacy value exactly matches that audited calculation.

Phase 2E fixture reconciliation exposed FIN-DQ-009: the legacy debt helper subtracts the full payment from principal even when a split identifies interest or fees. Phase 2E-B uses principal settlement only and treats the exact legacy full-payment result as an expected comparison difference.

## Non-goals

Phase 2E-B does not:

- add or infer account opening balances;
- rewrite transactions or liability records;
- rewrite or delete legacy balance-sheet aliases retained for compatibility;
- invent market prices for holdings whose prices are unavailable;
- implement liquidity maturity, three-complete-month burn windows, or calendar-denominator fixes.

Regression coverage is in `tests/phase-2e-fixture.test.js`, `tests/phase-2e-reconciliation.test.js`, `tests/canonical-snapshots.test.js`, `tests/snapshot-schema.test.js`, `tests/snapshot-adapter.test.js`, and `tests/overview-model.test.js`.
