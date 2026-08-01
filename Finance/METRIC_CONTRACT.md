# FinanceFlow Metric Contract

Status: Phase 5D final release-readiness gate implemented  
Contract version: 1.0.0  
Base storage currency: PHP  
Runtime source: `assets/js/core/metric-contract.js`

Implementation progress: Phase 2A adds the canonical, side-effect-free transaction classifier in `assets/js/core/transaction-classifier.js`. Phase 2B resolves FIN-DQ-004 with date inspection, quarantine, and encrypted in-app repair. Phase 2C-A computes canonical flow metrics and reconciliation diagnostics in shadow mode. Phase 2C-B cuts over Net Cash Flow, Earned Income, Other Cash In, Spending, Savings Rate, and their dependent ratios through a per-vault reconciliation gate. Phase 2D-A adds a pure as-of snapshot engine and shadow reconciliation for cash, receivables, liabilities, fixed assets, crypto book/market values, and Estimated Net Worth. Phase 2D-B1 hardens that layer with history-complete liability inputs, statement snapshot schema version 2, explicit market-unavailable states, and audited card-order reconciliation. Phase 2D-B2 cuts over the visible market KPI and book statement through independent gates, with explicit `n/a` and legacy states. Phase 2D-C aligns current liquidity metrics on cash-only reserves and canonical consumption across the previous three complete months; 30-Day Obligation Coverage remains deferred. Phase 2D-D1 consolidates KPI, Insights, Reports, QBR, Close, and readable backup summaries on the provenance-aware gated consumer boundary. Phase 2D-D2 completes the migration with a dedicated, reconciliation-gated P&L and cash-flow projection for Financial Statements, including separate saved and exported provenance. Phase 2E-A adds one shared counted-once fixture proving card purchases, later payments, principal settlements, and explicit finance charges reconcile across classification, canonical metrics, and Statements. Phase 2E-B extends that proof through ending positions, makes debt snapshots principal-aware, and explicitly keeps installment visible balances on a remaining-contractual-obligation basis while exposing their principal and finance-charge components. Phase 2E-C completes the fixture reconciliation with one immutable 20-check accounting report and negative tests proving unexplained consumption or debt differences fail closed. Phase 3A adds an immutable final-Overview presentation model, a crypto-independent Cash on Hand gate, explicit snapshot/flow captions, and ranked attention actions without changing the visible transitional layout. Phase 3B cuts the visible Overview over to that model, consolidates review signals into a three-item attention surface, turns Insights into actionable summaries, moves the full KPI scorecard to Reports, and makes Other Cash In directly filterable in Activity while retaining it in the Net Cash Flow breakdown. Phase 4-0 establishes the shared modal, keyboard, focus, reduced-motion, and descriptor quality gate. Phase 4A adds canonical row labels and effects, expanded Activity-only filters, persistent date-review entry, and responsive explicit row actions without changing metric inputs or stored data. Phase 4B coordinates monthly budgets, recurring bills, active goals, and wishlist purchases in one Plan view, keeps card settlements out of budget consumption, and labels bill schedules and goal cash proxies honestly without adding storage or formula changes. Phase 4C unifies fixed assets, receivables, crypto, cards, debts, and installments on the canonical snapshot boundary, keeps market and book values separate, and replaces implicit or hover-only Wealth row actions with accessible controls without adding storage or formula changes. Phase 4D gives Reports one visible date-only scope, monthly-only guards, and explicit market/book comparison. Phase 4E separates Tools safeguards, plaintext portability, utilities, and advanced diagnostics while preserving all canonical calculations and stored data. Phase 5A hardens application-wide accessibility and browser navigation. Phase 5B adds a versioned encrypted-backup contract, active-key authentication, rollback-capable local restore, atomic attachment replacement, Preview isolation fixtures, and automatic recovery for failed database or attachment cloud uploads. Phase 5C adds route-owned lazy presentation work, a five-viewport device contract, bounded privacy-safe performance diagnostics, and a reusable all-route browser acceptance harness while retaining eager canonical correctness inputs. Phase 5D composes the accounting, accessibility, data-safety, device, performance, Preview-isolation, and regression evidence into one fail-closed final release decision.

Phase 4D gives KPI, Revenue Mix, Trends, Spend Breakdown, Budget Variance, and Reports exports one visible date-only scope; fails monthly budget and close comparisons closed outside a single month; and prints independently gated market-value and book-value positions without changing formulas or stored records.

Phase 4E gives Tools a pure presentation boundary over existing backup settings, local diagnostics, Preview state, and Firebase runtime status. It changes no metric, snapshot, statement, reconciliation, encryption, restore-validation, or cloud-merge formula.

Phase 5A adds application-wide keyboard, screen-reader, contrast, modal isolation, deep-link, and browser-history quality gates. It changes no metric definition, calculation, provenance, reconciliation, or persisted record.

Phase 5B hardens backup, restore, encrypted attachment, Preview, and cloud failure boundaries. It changes no metric definition, calculation, provenance, or financial storage schema. See `PHASE_5B_DATA_SAFETY.md`.

Phase 5C defers route-only initialization and painting, guards hidden-route coordinators, adds the device and performance acceptance contracts, and changes no metric definition, calculation, provenance, encryption rule, or financial storage schema. See `PHASE_5C_DEVICE_PERFORMANCE.md`.

Phase 5D adds only a release-readiness composition and audit surface. It changes no metric definition, calculation, provenance, classification, encryption rule, restore behavior, synchronization rule, or financial storage schema. Missing evidence blocks readiness. See `PHASE_5D_RELEASE_READINESS.md`.

## Purpose

This contract fixes the meaning, date grain, and accounting treatment of FinanceFlow metrics before the UI is reorganized. It does not migrate stored data or silently change existing numbers. Later phases must implement these definitions and clearly label any temporary legacy calculation.

The primary distinction is:

- A **flow** measures activity during a selected period.
- A **snapshot** measures a position as of a specific date.
- An **operational metric** reports workflow state for a selected month.

A period selector may change flows. It must not silently change a current snapshot.

## Canonical Overview metrics

| Metric | Grain | Canonical meaning | Current readiness |
|---|---|---|---|
| Cash on Hand | Snapshot | Opening cash plus all cash deltas through the as-of date | Usable with zero-opening-balance and reconciliation caveats |
| Net Cash Flow | Flow | Cash increases minus cash decreases during the selected period | Canonical visible metric; gated legacy fallback |
| Spending to Income | Flow | Consumption spending divided by earned income | Canonical visible metric; gated legacy fallback |
| Estimated Net Worth | Snapshot | Cash + receivables + crypto market value + fixed assets - liabilities | Canonical visible market/book variants with independent gates |

The Overview should eventually show the first two cards with explicit captions such as `As of Jul 31` and `For Jul 2026`.

## Final Overview acceptance criteria

Phase 3A fixes the presentation contract for the final Overview. `assets/js/core/overview-model.js` returns exactly four ordered cards:

1. Cash on Hand — tracked-cash snapshot with an explicit `As of <date>` caption;
2. Net Cash Flow — period flow with an explicit `For <period>` caption;
3. Spending to Income — period ratio with `n/a` when earned income is zero;
4. Estimated Net Worth — explicitly market-value, with an independent unavailable or legacy state.

Cash on Hand is gated independently from crypto pricing and liability-history readiness. Missing crypto prices or incomplete liability history may make Estimated Net Worth unavailable, but must not hide tracked cash when transaction classification and the cash comparison reconcile. Cash remains described as tracked and not bank-reconciled until account opening balances and bank reconciliation exist.

The same model produces a ranked `needs attention` collection. Data exclusions and unavailable core values outrank fallback warnings, low liquidity, budget risk, and unusual activity. The visible list is capped at three actions while the complete immutable list remains available for audit and future drill-down.

Phase 3B replaces the transitional five-card row with this model, renders Insights as concise actionable summaries, keeps Other Cash In in Activity and the Net Cash Flow breakdown, and moves the full KPI scorecard to Reports. Activity type filtering changes only the visible ledger rows; it does not narrow the period transaction set used by Overview metrics, Reports, or reconciliations.

## Canonical definitions

### Cash on Hand

`opening cash + sum(cash delta through the as-of date)`

Credit-card charges do not reduce cash until paid. Receivables, investments, and fixed assets are not cash. Until account opening balances and reconciliation exist, this value must be described as **tracked cash**, not a verified bank balance.

### Net Cash Flow

`sum(cash increases in period) - sum(cash decreases in period)`

The legacy `computeLegacySummaryMetrics(...).balance` implements this cash-flow behavior. Phase 2C-B maps the visible compatibility field to canonical Net Cash Flow and retires the old `Total Balance` label. All-time Net Cash Flow happens to equal tracked Cash on Hand only because the app currently assumes zero opening cash.

### Earned Income

Income from work or business activity. Borrowed cash, lent repayments, refunds, reimbursements, asset sales, transfers, and crypto sale proceeds are excluded.

### Other Cash In

Cash received that is not earned income. It belongs in the Net Cash Flow breakdown and Activity filters, not as a primary Overview KPI.

### Spending

Consumption is recognized once when the purchase happens:

- A cash purchase reduces cash and increases spending.
- A credit-card charge increases spending and card liability, but does not reduce cash.
- A later card payment reduces cash and liability, but does not create spending again.
- Installment principal and debt principal are settlements, not new spending.
- Interest and fees are spending.
- Lending advances, savings transfers, crypto buys, and fixed-asset acquisitions exchange one asset for another and are not consumption.

The Phase 2C-B adapter now maps the visible `expense` compatibility field to canonical consumption spending. The original legacy aggregate remains available only for reconciliation and an explicitly labeled fallback.

### Savings Rate

`(earned income - consumption spending) / earned income × 100`

Return `n/a` when earned income is zero. Do not include other cash in as income. Phase 2C-B applies this definition to the Overview, charts, budgets, reports, close workflow, KPI surfaces, forecasts, insights, and QBR.

### Estimated Net Worth

`cash + receivables + crypto market value + fixed-asset net book value - debts - card balances - installment balances`

The Overview uses an estimated market-value variant. Financial statements use the book-value variant and say so explicitly. Phase 2D-B2 independently gates both surfaces, includes fixed assets at net book value, and never substitutes one crypto valuation for the other when a price or cost basis is unavailable.

Installment/BNPL liabilities remain the amount contractually payable, including remaining tracked fees. The canonical snapshot also exposes principal and remaining-finance-charge subtotals so this product balance is not confused with principal-only liability movement.

### Debt Repayment Load

`required loan, card, and installment repayments / earned income × 100`

This is a personal operating indicator, not a lender-qualified debt-to-income calculation. Phase 2D-D1 uses actual debt, card, and installment settlements identified by the canonical classifier, including recorded interest and fees. It remains an actual-payment proxy until reliable required-due amounts exist.

### Investment Rate

`tracked savings and financial-investment contributions / earned income × 100`

Price appreciation and transfers between already-counted investment accounts are excluded.

### Emergency Fund Coverage

`eligible emergency reserves / average monthly essential consumption over the last 3 complete months`

Receivables, volatile investments, restricted savings, debt principal, and asset purchases are excluded. Phase 2D-C uses all canonical consumption as a conservative spending proxy across the previous three complete months. The UI labels this as a proxy until transactions can be marked essential or discretionary.

### Liquidity Runway

`cash and cash equivalents / average monthly consumption spending over the last 3 complete months`

Money lent and crypto are not assumed to be immediately liquid. Phase 2D-C uses tracked cash only and shares one calculation between the KPI scorecard and Insights.

### 30-Day Obligation Coverage

`cash and cash equivalents / payments due in the next 30 days`

This is the intended replacement for the separately labeled `Current Ratio (Proxy)`. Phase 2D-C deliberately leaves it unimplemented because the existing data cannot reliably identify every obligation due within 30 days.

### Close Readiness

The saved close status plus passed checklist items for the selected month. It is an operational control, not a financial-performance KPI.

## Transaction treatment

| Event | Cash | Income | Consumption spending | Position effect |
|---|---:|---:|---:|---|
| Earned income | + | + | — | Cash increases |
| Refund, lent repayment, asset sale, borrowed cash | + | — | — | Cash and another asset/liability change |
| Cash consumption purchase | − | — | + | Cash decreases |
| Credit-card consumption charge | — | — | + | Card liability increases |
| Credit-card payment | − | — | — | Card liability decreases |
| Installment principal payment | − | — | — | Installment liability decreases |
| Debt cash received | + | — | — | Debt liability increases |
| Lending advance | − | — | — | Receivable increases |
| Savings transfer or crypto buy | Depends on account coverage | — | — | Investment asset increases |

## Data-quality findings

| ID | Severity | Finding | Required remediation |
|---|---|---|---|
| FIN-DQ-001 | Resolved in Phase 2C-B | `Total Balance` was a scoped flow with a snapshot label | Visible metric renamed Net Cash Flow; Cash on Hand remains future snapshot work |
| FIN-DQ-002 | Resolved in Phase 2C-B | Legacy expense totals can count a card charge and its later payment | Visible Spending uses canonical consumption; the legacy aggregate is fallback-only |
| FIN-DQ-003 | Resolved in Phase 2D-B2 | KPI and statement net worth used different unlabeled crypto values and omitted fixed assets | Visible market and book variants are explicit, gated independently, and include fixed-asset net book value |
| FIN-DQ-004 | Resolved in Phase 2B | Invalid dates previously fell back to today | Missing and impossible dates are quarantined; the Activity repair workflow restores them after an explicit encrypted edit |
| FIN-DQ-005 | Medium | Average daily spend uses inconsistent day denominators | Use elapsed/full calendar days based on period state |
| FIN-DQ-006 | Resolved in Phase 2D-C | The three-month burn window previously included parts of four months | KPI and Insights now share exactly the previous three complete calendar months |
| FIN-DQ-007 | Deferred in Phase 2D-C | Current Ratio lacks current-liability maturity logic | Keep it labeled as a proxy; implement 30-Day Obligation Coverage only after due-date support is sufficient |
| FIN-DQ-008 | Resolved in Phase 2D-B2 | Legacy card liabilities can change with transaction array order because payments are clamped before the ledger is chronologically normalized | Gated visible snapshot surfaces use the chronological, order-independent canonical liability calculation |
| FIN-DQ-009 | Resolved in Phase 2E-B | Legacy debt positions subtract the full payment from principal even when interest or fees are explicitly split | Canonical debt positions subtract principal settlement only and audit the exact legacy full-payment difference |

## Phase boundaries

The original Phase 0 contract intentionally did not:

- change stored transactions;
- change current dashboard results;
- rename visible UI elements;
- infer account opening balances;
- retroactively split principal, interest, or fees where the data does not contain that detail.

Phase 1 may use this contract to introduce navigation and captions. Metric calculation changes should be shipped behind focused tests and reconciled against representative user data.

Phase 4A is a presentation-only Activity refinement. Recent Movement rows and classification filters consume the canonical classifier, expose cash, spending, settlement, transfer, asset, liability, and receivable effects explicitly, and surface records that need review. These filters never replace the full date/search-filtered period used by metric consumers, and the phase does not rewrite stored transactions or change any formula in this contract.

Phase 4C is a presentation-only Wealth refinement. Its coordinator consumes the canonical snapshot report and independent cutover gates, retains explicit market, book, receivable, principal, outstanding, and contractual labels, and fails market values closed when crypto prices are incomplete. Fixed-asset detail rendering reuses the canonical depreciation engine; no position formula or stored record is rewritten.

Phase 4D is a presentation-only Reports refinement. Activity search and classification controls cannot narrow Reports. Flow cards and report exports consume one shared date scope, while as-of position cards remain independent snapshots. Monthly budget and close comparisons require one resolved calendar month, and market and book Estimated Net Worth remain separately labeled and gated.

## Required implementation rules

1. Every financial card must identify its grain with `For <period>` or `As of <date>`.
2. A zero denominator displays `n/a`; it does not imply 0% performance.
3. A cash settlement must not create consumption a second time.
4. Transfers between tracked assets do not change net worth.
5. Market and book valuation variants must never share an unlabeled `Net Worth` title.
6. Threshold colors are guidance, not accounting truth, and must be configurable or documented.
7. Malformed dates and missing required classifications must be surfaced, not silently assigned.
8. Release readiness must fail closed when any required accounting, accessibility, safety, device, performance, Preview, regression, or live-browser evidence is missing.
