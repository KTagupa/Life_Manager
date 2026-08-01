# Phase 5D: Final Release Readiness

Status: Implemented; automated gate passing, live Preview acceptance pending a permitted browser session  
Runtime contract: `assets/js/core/release-readiness.js` version 1.0.0  
Financial storage schema: unchanged at version 6

## Outcome

Phase 5D combines the earlier accounting, accessibility, data-safety, device, and performance work into one fail-closed release decision. It adds no financial formula, classification, persistence, encryption, restore, or synchronization behavior.

A release is ready only when all eight gates have explicit passing evidence:

1. canonical metric and presentation contracts;
2. counted-once fixture reconciliation;
3. accessibility and browser navigation;
4. backup, restore, cloud-recovery, and Preview safety;
5. device layout and performance budgets;
6. active Preview isolation;
7. the complete automated regression suite; and
8. a live browser acceptance run.

Missing evidence is a blocker, not a warning. Reports are immutable and retain only fixed gate labels, status, and issue counts; arbitrary runtime error text and vault content are not copied into the report.

## Two-part gate

Run the automated half from the workspace root:

```sh
node Finance/scripts/run-phase-5d-automated-gate.js --json
```

The command syntax-checks every Finance JavaScript asset, runs every Finance test, and requires the Phase 2E fixture/reconciliation evidence. It reads source and test files only; it does not open the vault or write Finance persistence.

Then open a disposable Preview Mode session and pass the command's JSON result to the browser half:

```js
const automatedResult = /* JSON printed by the automated command */;
await window.runFinancePhase5DBrowserChecks({
  automatedEvidence: automatedResult
});
```

The browser half refuses to start unless Preview Mode is active, an in-memory Preview database exists, key material is cleared, and the Preview banner is visible. Only after that boundary passes does it run the canonical validators, Phase 5A accessibility/navigation checks, Phase 5B storage-isolation checks, and Phase 5C route/device/performance checks.

The Tools route also exposes **Run Preview release audit**. It runs the browser half safely and reports that automated evidence is still required for final sign-off. The control is disabled outside Preview Mode.

## Release interpretation

- `ready`: all eight gates passed in the same composed report.
- `blocked`: at least one gate failed or its evidence is missing.
- `runtimeValid: true` with a blocked report: live Preview checks passed, but automated evidence was not attached.

The document root receives only `data-finance-release-status` and the blocker count. The complete sanitized report is available as `window.financeReleaseReadinessReport` for the active session.

## Environment acceptance note

The complete automated gate passes in the implementation environment. The Codex in-app browser cannot navigate to the local `file://` Finance page under its URL policy, so the live Preview audit was not executed and final release sign-off remains pending that permitted browser run. No alternate browser or policy workaround was used.

## Regression coverage

```sh
node --test Finance/tests/phase-5d-release-readiness.test.js
node --test Finance/tests/*.test.js
```

Coverage proves the immutable eight-gate contract, fail-closed missing evidence, sanitized blocker output, Preview-first execution order, startup load order, the Preview-only Tools action, and full-suite automation.
