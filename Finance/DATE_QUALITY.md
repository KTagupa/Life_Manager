# FinanceFlow Transaction Date Quality

Status: Phase 2B complete  
Date-quality version: 1.0.0  
Runtime sources: `assets/js/core/date-quality.js`, `assets/js/features/date-repair.js`

## Behavior

Every decrypted transaction is inspected before it enters the shared Activity and metric cache.

| Stored date | Status | Activity and metrics | Repair behavior |
|---|---|---|---|
| Valid ISO calendar date | Valid | Included | No action |
| Parseable non-ISO date | Warning | Included using its interpreted calendar day | Offered for explicit normalization |
| Missing, impossible, or unparseable date | Quarantined | Excluded | Requires a valid replacement date |

Quarantine does not delete or rewrite a record. The encrypted storage entry remains intact and appears in the Activity date-review workflow. The record returns to normal calculations only after a successful explicit repair.

## Repair workflow

1. The Activity view shows a data-quality banner whenever a date needs attention.
2. The review modal identifies the transaction, stored value, and reason.
3. The user chooses a strict `YYYY-MM-DD` calendar date.
4. The transaction payload is decrypted, the date is replaced with canonical ISO midnight UTC, derived cache fields are removed, and the payload is encrypted again.
5. Transactions are reloaded and repartitioned. A repaired record immediately re-enters Activity and metric scopes.

Preview Mode uses the same workflow against its in-memory encrypted snapshot. Its malformed sample transaction makes the behavior testable without touching a real vault.

## Invariants

- Missing or invalid dates never fall back to the current time.
- Quarantined records cannot affect summaries, charts, filters, statements, or Activity.
- Parseable legacy formats remain visible until the user normalizes them.
- Date inspection and partitioning do not mutate decrypted inputs.
- Repairs preserve the entry ID, creation metadata, and all non-date transaction fields.
- Persistence uses the app's existing vault encryption and storage path.

Regression coverage lives in `tests/date-quality.test.js`.
