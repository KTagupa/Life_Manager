# FinanceFlow Fixture Reconciliation

Status: Phase 2E-C complete  
Shared fixture: `tests/fixtures/counted-once-ledger.fixture.js`  
Audit helper: `tests/helpers/phase-2e-reconciliation.js`  
Regression tests: `tests/phase-2e-fixture.test.js`, `tests/phase-2e-reconciliation.test.js`

## Purpose

Phase 2E-A establishes one reusable ledger fixture for the accounting paths most vulnerable to double counting. Phase 2E-B extends the same fixture through the canonical position engine, so classification, metrics, Statements, and ending liabilities share one expected ledger. Phase 2E-C produces one immutable end-to-end reconciliation report and proves that unaudited differences still fail closed.

The fixture contains:

- one credit-card purchase and a later partial card payment;
- one debt payment split into principal, interest, and fee;
- one installment payment split into principal and fee;
- earned income and opening position records needed to reconcile flows and later balance-sheet work.

## Counted-once invariants

The fixture proves that:

1. A card purchase creates consumption and card liability, but no immediate cash movement.
2. The later card payment creates cash and liability settlement, but no second consumption event.
3. Debt and installment principal create settlement and liability movement, but no consumption.
4. Explicit interest and fees create consumption and Finance Costs exactly once.
5. Statement cash-flow buckets equal canonical Net Cash Flow.
6. Total settlement plus finance charges equals the cash Debt Service disclosure.
7. Debt principal falls only by the principal portion of a payment; interest and fees do not reduce it.
8. Card ending balance equals opening balance plus purchases minus payments.
9. Installments expose principal outstanding separately from the remaining contractual obligation.

## Expected ledger dimensions

The shared fixture keeps these concepts separate instead of collapsing them into one `expense` number:

- cash movement;
- consumption recognition;
- finance-charge consumption;
- principal settlement;
- liability movement;
- installment principal balance and remaining contractual balance.

This distinction is important because the installment plan's stored `totalAmount` includes tracked fees, while the transaction classifier exposes principal and fee deltas separately.

## Position reconciliation

Debt snapshots now consume the classifier's principal settlement instead of subtracting the full payment amount. The engine retains the prior full-payment result solely as an audited legacy comparison value. A difference is considered expected only when the legacy debt output exactly matches that value.

Installment plans retain their established visible balance meaning: `liabilities.installments.total` is the remaining contractual amount, including unpaid tracked fees. The engine additionally exposes `principalTotal` and `remainingFinanceChargeTotal`, derived from recorded fee splits. Missing historical fee splits are counted diagnostically and are treated as zero-fee splits; stored data is not rewritten.

The counted-once fixture now proves the principal-position bridge:

`ending debt principal + ending card balance + ending installment principal - opening principal positions = canonical liability delta`

Phase 2E-B does not migrate stored transactions or liability records. A canonical net-worth value can legitimately differ from its legacy fallback by recorded debt interest and fees because the corrected balance no longer treats those charges as principal reduction.

## Final reconciliation report

Phase 2E-C evaluates 20 named identities in one report, including:

- unique fixture transaction identities;
- purchase-plus-finance-cost consumption recognition;
- settlement-plus-finance-charge Debt Service;
- P&L and statement cash-flow equations;
- opening cash to ending tracked cash;
- agreement between standalone metrics and the snapshot's embedded canonical flows;
- debt, card, installment, and aggregate principal-position bridges;
- installment contractual balance versus principal and remaining finance charges;
- the exact amount and reason for the audited legacy debt difference;
- zero unexplained comparison differences and a ready reconciliation gate.

The report is immutable and returns `reconciled` only when every check passes. Regression tests deliberately alter consumption and the legacy debt value by PHP 1; both cases return `failed`, and the unexplained debt mismatch blocks visible cutover.

Phase 2E is test- and calculation-only. It does not rewrite stored records or relax the runtime reconciliation gate.
