# Phase 4E: Tools Refinement

Status: Implemented

Phase 4E turns the Tools route into a safety center with a separate utility area. It does not change vault schemas, encryption, canonical metrics, backup payloads, restore validation, or cloud merge rules.

## Visible structure

The route begins with four plain-language status cards:

- **Session** distinguishes an encrypted vault from Preview Mode or a locked vault.
- **Recovery file** reports the last recorded encrypted backup and calls out missing or week-old recovery files.
- **Local protection** distinguishes two local copies, one local copy, and no detected local copy.
- **Cloud sync** distinguishes enabled, pending, reload-required, local-only, and Preview-paused states.

Actions are grouped by consequence:

- **Encrypted recovery** contains backup download, restore, and backup scheduling.
- **Portability and sync** contains cloud configuration and the explicitly plaintext readable archive.
- **Utilities** contains the rebalancer, FX spread scanner, and item tracker.

Technical resolver, localStorage, IndexedDB, record-count, and JSON-copy diagnostics remain available in a collapsed advanced section.

## Preview boundary

Preview Mode fails all real-vault safeguard and configuration controls closed. Storage diagnostics return the in-memory demo snapshot before attempting any localStorage or IndexedDB vault read. The route therefore never exposes real-vault counts, timestamps, source selection, or backup settings while the app claims to be demo-only.

## Backup and sync semantics

- The encrypted JSON file is the recovery artifact.
- Restore validates the versioned package, canonical or verified legacy hashes, every encrypted collection and attachment, and active-key decryptability before replacing the vault. Local database and attachment stages complete before cloud sync begins, with rollback on a local failure.
- The readable ZIP remains plaintext and is explicitly not presented as a recovery backup.
- Cloud sync remains optional. Local-only is neutral when local persistence is available.
- A saved but inactive Firebase configuration is labeled **Reload required**.
- A differing local and last-known remote revision or pending attachment upload is labeled **Local changes pending**. A failed upload with automatic recovery queued is labeled **Retry scheduled**.

## Accessibility and responsive acceptance

- Status updates use polite live regions.
- Every action is a real button with an accessible visible name.
- Disabled Preview controls expose native disabled and `aria-disabled` state.
- Keyboard focus uses the shared three-pixel focus ring.
- The four status cards collapse to two columns on tablet and one column on phones.
- Action groups and advanced storage sources collapse to one column before phone width.
- Backup and restore modals use the Phase 4-0 dialog, focus-trap, Escape, and focus-restoration contract.

## Regression coverage

Run:

```sh
node --test Finance/tests/phase-4e-tools.test.js
node --test Finance/tests/*.test.js
```

The focused suite validates immutable presentation output, recovery freshness, local redundancy, cloud states, Preview isolation, route placement, load order, workflow guards, and responsive/focus styling.
