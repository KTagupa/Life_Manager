# Finance Phase 4 Quality Gate

Status: Phase 4-0 foundation, Phase 4A–4E route refinements, and Phase 5A–5D hardening implemented.

Phase 4-0 establishes shared interaction rules for the route-by-route refinement work. It changes UI infrastructure only; it does not change transaction classification, metric definitions, vault data, or accounting reconciliation.

## Shared modal contract

`assets/js/ui/modal-accessibility.js` automatically enhances every dialog container whose `div` id ends in `-modal`.

Each modal receives:

- `role="dialog"`, `aria-modal="true"`, and a programmatic name;
- `aria-hidden` synchronized with actual visibility;
- initial focus when opened;
- a Tab and Shift+Tab focus loop inside the topmost modal;
- Escape dismissal through the modal's existing close or cancel control;
- focus restoration to the opener;
- nested-modal stack handling;
- background scroll locking while a modal is open.

The layer observes existing class and `hidden` changes, so specialized workflows keep their own save, cancel, cleanup, and confirmation behavior.

## Descriptor rule

Descriptor hints may be real buttons beside headings or labels. They must never be placed inside another button or link. Action controls are marked descriptor-disabled instead of receiving a nested interactive hint.

## Automated checks

Run the full Finance suite:

```sh
node --test Finance/tests/*.test.js
```

When the Finance page is open and initialized, the browser-level smoke harness can be run from the page context:

```js
await window.runFinancePhase40BrowserChecks({ exerciseRoutes: true })
```

The result validates modal semantics, initial focus, Escape dismissal, focus restoration, nested interactive controls, and every registered Finance route without writing browser history or vault data.

## Acceptance checks for every Phase 4 subphase

Every changed route must pass all of the following before its subphase is complete:

1. Complete the changed workflow with a keyboard and visible focus.
2. Confirm every changed control has an accessible name and state.
3. Confirm every touched modal traps and restores focus and closes safely with Escape.
4. Check 360px mobile, 768px tablet, and desktop layouts without horizontal overflow or unreachable actions.
5. Exercise the route by direct hash, browser back, and browser forward.
6. Confirm no new nested interactive controls are introduced.
7. Run the canonical metric, snapshot, statement, reconciliation, navigation, and phase-specific tests.
8. Smoke-test the changed workflow in Preview Mode without writing the real vault.

Phase 5A–5D implement the screen-reader, contrast, browser-history, device-matrix, performance, backup, restore, Preview Mode, encrypted-vault, and composed release-readiness contracts. The automated final gate passes; live local-page Preview execution remains an environment acceptance step when browser URL policy permits it.

Phase 4E applies this gate to Tools. Backup and restore dialogs inherit the shared modal contract, status changes are announced politely, action groups collapse for tablet and phone widths, and real-vault safeguard/configuration controls fail closed in Preview Mode. Preview diagnostics return demo-only metadata before reading either real local persistence source. See `Finance/TOOLS_REFINEMENT.md`.

Phase 5A extends the shared gate across the whole Finance app: skip navigation, named route regions and tab panels, explicit legacy button semantics, derived control names, background inerting for the complete dialog stack, non-dismissible locked-vault focus trapping, contrast tokens, forced-colors support, duplicate-history prevention, invalid-hash canonicalization, and a real Back/Forward browser harness. See `Finance/PHASE_5A_ACCESSIBILITY_NAVIGATION.md`.

Phase 5D composes every prior hardening result into an eight-part fail-closed decision. Its browser half can run only from isolated Preview Mode, and its automated half syntax-checks every Finance JavaScript asset and executes the complete test suite. See `Finance/PHASE_5D_RELEASE_READINESS.md`.
