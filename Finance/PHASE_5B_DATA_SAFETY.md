# Phase 5B: Data-Safety Hardening

Status: Complete  
Backup contract: `assets/js/core/backup-contract.js` version 1.0.0  
Backup format: version 2  
Storage schema: unchanged at version 6

## Outcome

Phase 5B makes encrypted recovery fail closed and recoverable. It does not change a financial metric, decrypt records into the backup file, read a real vault during tests, or make cloud sync mandatory.

The phase covers:

- encrypted backup creation and deterministic integrity hashes;
- strict restore validation and active-key authentication;
- database and installment-image round trips;
- rollback when a local restore stage fails;
- Preview Mode isolation;
- automatic cloud retry with bounded exponential backoff;
- diagnostics for pending attachment uploads and scheduled retries.

## Backup format and compatibility

New recovery files use `backupFormatVersion: 2` and `canonical-json-v1` serialization before SHA-256 hashing. Canonical serialization sorts object keys, so semantically identical objects no longer hash differently because their key insertion order changed.

The validator requires:

- a supported backup, schema, and AES-GCM version;
- SHA-256 hashes for the database and attachment block;
- valid encrypted envelopes for transactions, bills, debts, cards, installments, receivables, crypto, wishlist items, budgets, and the optional vault probe;
- encrypted installment-image records with unique safe keys, 12-byte IVs, ciphertext, and image MIME types;
- no Preview Mode plaintext marker or Preview attachment data;
- no future storage schema or future backup format.

Existing format-1 backups with the prior order-sensitive JSON hash remain restorable when both legacy hashes verify. The restore preview identifies them as legacy; the next downloaded backup upgrades the format.

After structural and hash validation, every encrypted record and attachment is authenticated with the currently unlocked vault key. A backup from a different key, a mixed-key file, or ciphertext that cannot be authenticated is rejected before any write.

## Restore transaction

Restore now follows this order:

1. Parse the selected JSON and validate the complete recovery package without writing.
2. Authenticate every AES-GCM record and attachment with the active key.
3. Snapshot the current local database and all attachment records, including tombstones.
4. Write the replacement database to durable local storage with cloud sync paused.
5. replace attachment records in one IndexedDB transaction, marking cloud work as pending;
6. reload from local storage only;
7. enqueue cloud synchronization after the local restore is complete.

If steps 4–6 fail, the attachment snapshot and database snapshot are restored and the rollback state is reloaded. A cloud failure after the local commit does not undo the safe local restore.

## Local durability and attachments

Restore requires at least one successful durable database write: IndexedDB or the localStorage mirror. Attachment replacement clears and inserts records inside one IndexedDB transaction. Removed images become encrypted tombstones when cloud sync is active, preventing stale cloud images from reappearing. Rollback performs an exact replacement with the original attachment snapshot.

## Cloud failure recovery

Database revisions and pending attachment records are both treated as unsynced work. A failed Firebase write or attachment upload:

- leaves the encrypted local copy intact;
- keeps the work marked pending;
- records failure and next-retry timestamps in storage diagnostics;
- schedules an automatic retry with exponential backoff from one second to one minute;
- clears the recovery state only after all database and attachment work succeeds.

Tools shows **Retry scheduled** while this recovery path is active. No password, key material, ciphertext, record content, Firebase error text, or attachment content is included in diagnostics.

## Preview boundary

Preview Mode continues to use only its in-memory demo database and demo attachment map. Backup creation, restore selection, restore confirmation, readable export, backup scheduling, storage inspection, and cloud configuration remain unavailable. The backup contract independently rejects Preview plaintext even if a caller bypasses a UI control.

## Regression coverage

The Phase 5B suite uses generated AES-GCM keys, synthetic encrypted records, encrypted synthetic image data, and in-memory restore adapters. It never opens or modifies the real vault.

```sh
node --test Finance/tests/phase-5b-data-safety.test.js
node --test Finance/tests/*.test.js
```

Coverage includes canonical and legacy hashes, valid-key and wrong-key authentication, ciphertext preservation, corruption rejection, future-schema rejection, Preview rejection, card-envelope validation, duplicate attachment rejection, commit ordering, rollback, local success during cloud failure, retry backoff, Tools recovery state, and browser load/runtime wiring.

Phase 5C now implements the comprehensive device matrix, route-owned lazy presentation work, and performance profiling in `PHASE_5C_DEVICE_PERFORMANCE.md`.
