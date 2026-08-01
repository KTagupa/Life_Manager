# Phase 5A: Accessibility and Navigation Hardening

Status: Implemented

Phase 5A adds a shared accessibility audit and hardens route and dialog navigation. It changes no financial calculation, encrypted record, storage schema, backup payload, or cloud merge rule.

## Screen-reader contract

- A keyboard-visible skip link moves directly to the Finance main landmark.
- The desktop application controls have a named navigation landmark.
- Primary route controls use complete tab semantics with stable `aria-controls`, `aria-selected`, and labelled tab panels.
- Tools is exposed as a named region because it is intentionally outside the primary tab row.
- Route changes retain the polite live announcement and synchronize `hidden` with `aria-hidden`.
- The locked-vault overlay participates in the shared dialog and focus-trap contract but cannot be dismissed with Escape.
- While a dialog is open, background body regions become `inert`; their prior inert state is restored when the dialog stack closes.
- Legacy and dynamically rendered buttons receive explicit `type="button"`, unnamed controls receive a derived accessible name, and Lucide icons are marked decorative.

## Keyboard contract

- Every interactive Finance control inherits a visible three-pixel focus indicator in light and dark themes.
- The primary route tab row supports Left, Right, Home, and End.
- Escape closes the More panel and returns focus to its trigger.
- Choosing a destination from the More panel focuses the updated route heading so focus never remains in hidden content.
- Modal Tab and Shift+Tab trapping, nested-modal handling, Escape, and opener focus restoration remain centralized in `ui/modal-accessibility.js`.

## Deep-link and history contract

- Route URLs preserve the current path and query string.
- Unknown hashes canonicalize to `#overview` with `replaceState`.
- Selecting the already-active route replaces rather than pushes a duplicate history entry.
- Back and Forward continue to resolve the hash through the same route normalizer.
- `runFinanceNavigationHistoryChecks()` exercises three real routes through Back and Forward, then restores the original URL and route.

The browser history harness intentionally adds temporary same-page history entries while it runs. Use it in a disposable Preview QA tab.

## Contrast contract

`ui/accessibility.js` defines ten light/dark foreground-background pairs. Normal text must meet 4.5:1. Large text and focus indicators must meet 3:1. The shared muted light-theme text color is raised from Slate 400 to Slate 500, while intentionally dark panels retain a light override.

The stylesheet also supports:

- `prefers-reduced-motion`;
- `prefers-contrast: more`;
- Windows and browser forced-colors mode.

`auditFinanceComputedContrast()` checks visible text against computed foreground/background colors and reports gradient-backed text separately for manual review.

## Browser audit

After opening a disposable Preview Mode tab, run:

```js
await window.runFinancePhase5ABrowserChecks({
  exerciseModals: true,
  exerciseHistory: true
})
```

The combined result covers accessible names, explicit button types, duplicate IDs, landmarks, routes, tab panels, nested controls, the modal lifecycle, computed contrast, and real browser Back/Forward behavior without writing vault data.

## Regression coverage

```sh
node --test Finance/tests/phase-5a-accessibility-navigation.test.js
node --test Finance/tests/*.test.js
```

Phase 5B covers backup/restore, encrypted-vault, Preview, and cloud failure-path integration tests in `PHASE_5B_DATA_SAFETY.md`. Phase 5C now covers device-matrix and performance/lazy-initialization work in `PHASE_5C_DEVICE_PERFORMANCE.md`.
