# JavaScript Structure

This folder is organized by responsibility to keep the app easier to maintain:

- `core/`: shared state, persistence, auth/encryption, and startup bootstrap.
- `ui/`: reusable UI rendering/filter helpers used across features (including click-to-open descriptors/tooltips).
- `features/`: domain modules (crypto, close, statements, reminders, etc.).

## Load Order

Because the app uses global functions across files, keep the script order aligned with `index.html`:

1. `core/*` (except `app-init.js`)
2. `features/xrpl.js` (read-only XRP Ledger reconciliation helpers)
3. `features/ronin.js` (read-only Ronin reconciliation helpers)
4. `features/crypto.js` (shared crypto helpers used by other modules)
5. `ui/*`
6. remaining `features/*`
7. `core/app-init.js`

`core/app-init.js` is the single startup entrypoint for DOM-ready boot logic and shared event binding.
