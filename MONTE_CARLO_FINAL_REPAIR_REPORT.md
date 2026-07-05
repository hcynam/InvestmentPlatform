# Monte Carlo Final Repair Report

## 1. Baseline Safety

- Repository: `D:\InvestmentPlatform`
- Starting branch: `main`
- Safety branch: `fix/monte-carlo-final-hardening`
- Starting commit: `b5c6dcf Fix Monte Carlo discrete distribution support`
- Starting working tree: clean
- Package scripts found: `typecheck`, `lint`, `test`, `build`, `dev`, `start`

Baseline validation before product edits:

- `npm.cmd run typecheck` - passed
- `npm.cmd run lint` - passed
- `npm.cmd run test` - passed, 86 tests
- `npm.cmd run build` - passed, `/projects/[projectId]/monte-carlo` included in the route list

Validation generated only `next-env.d.ts` and `tsconfig.tsbuildinfo` cache noise; both were restored before implementation.

## 2. Files Audited

Monte Carlo-only or Monte Carlo-primary files:

- `src/app/projects/[projectId]/monte-carlo/page.tsx`
- `src/components/project/MonteCarloWorkbench.tsx`
- `src/lib/monte-carlo-engine.ts`
- `tests/monte-carlo-engine.test.ts`
- `MONTE_CARLO_IMPLEMENTATION_AUDIT.md`
- `MONTE_CARLO_IMPLEMENTATION_REPORT.md`
- `MONTE_CARLO_GOAL_LOOP_CHECKLIST.md`
- `MONTE_CARLO_EXCEL_COMPARISON.md`

Shared files that Monte Carlo depends on:

- `src/lib/types.ts` - shared project, scenario, sensitivity, and Monte Carlo contracts
- `src/lib/risk-variable-engine.ts` - shared risk variable mapping used by Monte Carlo and sensitivity
- `src/lib/calculations.ts` - shared calculation entry point; Monte Carlo calls the core calculation runner through wrappers
- `src/store/project-context.tsx` - shared project/scenario state, save, and run actions
- `src/lib/format.ts` - shared user-facing number, percent, and money formatting
- `src/components/project/ModulePage.tsx` - shared route shell that mounts the Monte Carlo workbench
- `src/styles/globals.css` - global stylesheet with Monte Carlo-specific class blocks

Tabs potentially affected by shared changes:

- Sensitivity, because it shares `risk-variable-engine.ts`, `types.ts`, and calculation assumptions.
- DCF valuation and executive dashboards, because Monte Carlo uses core valuation outputs from `calculations.ts`.
- Financing/bankability, because Monte Carlo reads DSCR and debt service outputs.
- CAPEX, direct costs, OPEX, working capital, construction cashflow, and macro tabs, because sampled variable shocks are mapped into those assumptions.
- Scenario management and report/export, because Monte Carlo settings and outputs live in scenario state.

Shared contracts that must not be broken:

- `calculateScenario`, `calculateScenarioCore`, `calculateMonteCarlo`, and `calculateMonteCarloAsync` output shapes.
- `Scenario.assumptions.monteCarlo` persistence contract.
- `ScenarioOutputs.monteCarlo` optional output contract.
- `SensitivityVariable`, `SensitivityRunStatus`, and `SensitivityUnitType` compatibility.
- `applyRiskVariableShockToScenario` semantics for sensitivity and Monte Carlo.

## 3. Current Data Flow

The Monte Carlo route renders `ModulePage` with slug `monte-carlo`; `ModulePage` mounts `MonteCarloWorkbench`.

`MonteCarloWorkbench` reads scenario settings from `activeScenario.assumptions.monteCarlo`, keeps a local draft, and calls `runMonteCarloAsync` or `applyMonteCarloSettings` from `project-context`.

`project-context` clones the project before running Monte Carlo, writes provided Monte Carlo settings to the cloned active scenario, calls `calculateMonteCarloAsync`, and then stores only the Monte Carlo output and saved settings back into the active scenario.

`calculateMonteCarloAsync` delegates to `runMonteCarloSimulationAsync` in `monte-carlo-engine.ts`.

The engine computes base outputs through the existing core calculation path, samples active risk variables with seeded RNG, clones the project for each shocked iteration, applies shocks through `risk-variable-engine.ts`, reruns the core financial model, sanitizes metrics, and aggregates summaries, histograms, CDF, scatter, contributions, sampled paths, and diagnostics.

Current simulation uses local cloned project/scenario copies for iteration shocks. It does not mutate the base project during simulation; only explicit save/run writes the Monte Carlo config/output back to scenario state.

## 4. Discrete Distribution Bug Audit

The current code already contains a previous discrete-option implementation, but the new prompt requires proof and final hardening. Current discrete support includes stable variable-card keys, labeled options, seeded cumulative sampling, explicit probability validation, and active invalid variable blocking.

Remaining risks found before implementation:

- Several UI updates still route through a helper named `updateVariableAt`, which targets by array index. The grouped UI currently carries the original array index, so this is not always wrong, but it violates the final requirement and remains fragile if sorting/filtering changes.
- New discrete option IDs are generated with `Date.now()`. The ID is stable after creation, but it is not deterministic and is weaker than deriving the next ID from the target variable and existing options.
- Numeric input parsing uses `Number(value)`, so Persian/Arabic digits are not safely parsed.
- Results are not clearly marked stale when the user changes draft settings after a run.
- DSCR breach probability currently falls back to `0` if no valid DSCR exists, which can be misread as a real 0% breach probability.
- Quality warnings, provenance, dependency messaging, and full variable editing are too prominent in the default page, making the client view look like an analyst/debug surface.

## 5. Non-Regression Boundary

Implementation will stay scoped to:

- Monte Carlo workbench behavior and layout.
- Monte Carlo engine probability/unavailable handling.
- Monte Carlo-focused tests.
- Additive shared formatter support for localized numeric parsing.
- Additive shared type changes only where required to represent unavailable Monte Carlo metrics.

No global financial calculation rewrite is planned. No DCF, financing, sensitivity, scenario, Excel import, navigation, or global app-shell contract will be changed unless a Monte Carlo-specific defect proves it necessary.

## 6. Implementation Status

Complete.

## 7. Root Cause and Fix

Root cause classification: real user-facing layout/click-target bug plus fragile state update patterns.

The discrete distribution engine and helper-level add option behavior were sound in isolation, but the live RTL variable-card grid allowed the expanded discrete editor to overflow horizontally. In RTL, the editor spilled over the adjacent card, so the visible add/delete controls could be covered by the neighboring variable card. Browser hit-testing confirmed the add button's center was hitting the next card before the CSS repair, then hit the button itself after the repair.

Related hardening also removed fragile implementation paths:

- Variable updates now use stable `variable.id` rather than grouped display index.
- Discrete option IDs are derived deterministically from the target variable and existing option IDs; `Date.now()` is no longer used.
- Distribution switching is centralized through `changeMonteCarloDistributionType`.
- Discrete option updates use stable `option.id`.
- Persian/Arabic numeric input parsing is supported through `parseLocalizedNumber`.
- Discrete probability validation remains explicit and blocks execution when invalid.

## 8. Files Changed

- `src/components/project/MonteCarloWorkbench.tsx`
  - Replaced index-based variable updates with `updateMonteCarloVariableById`.
  - Routed distribution switching through schema-aware helpers.
  - Added executive/client default view structure and active-variable summary.
  - Moved full variable editing, warnings, provenance, methodology, and technical details into the advanced analyst section.
  - Added stale-result status and warning behavior.
  - Hid scatter output when there are not enough valid points.
  - Kept sample paths collapsed by default.

- `src/lib/monte-carlo-engine.ts`
  - Added stable normalization/update helpers for Monte Carlo settings and variables.
  - Added deterministic discrete option helper functions.
  - Preserved discrete/continuous distribution-specific schema transitions.
  - Recorded iteration model errors as diagnostics instead of silently swallowing them.
  - Returned `null` for unavailable NPV-positive or DSCR-breach probabilities instead of fake `0`.

- `src/lib/types.ts`
  - Made Monte Carlo probability fields nullable where the underlying metric may be unavailable.

- `src/lib/format.ts`
  - Added localized Persian/Arabic digit parsing for numeric inputs.

- `src/styles/globals.css`
  - Added Monte Carlo-scoped status, stale, executive summary, advanced, and collapsible styles.
  - Constrained the discrete editor and row grid to prevent RTL overflow over adjacent cards.

- `tests/monte-carlo-engine.test.ts`
  - Added stable variable-id update tests.
  - Added distribution switch discrete -> normal -> discrete regression coverage.
  - Added discrete option add/edit/delete target-only coverage.
  - Added DSCR unavailable probability coverage.
  - Added Persian/Arabic numeric parsing coverage.
  - Added unavailable formatter coverage.
  - Updated source-shape assertions for advanced/client separation and stable option IDs.

Shared files touched:

- `src/lib/types.ts`: additive nullable Monte Carlo metrics only.
- `src/lib/format.ts`: additive localized parser only; existing formatter behavior preserved.
- `src/styles/globals.css`: changes use Monte Carlo-scoped selectors.

No shared financial calculation engine, DCF engine, financing engine, sensitivity engine behavior, scenario persistence contract, or Excel import path was rewritten.

## 9. Simulation and Metric Hardening

- Seeded RNG behavior remains tested: same seed and same config are reproducible; different seed changes results.
- Monte Carlo still reruns the real financial model through the existing calculation pipeline.
- Iteration shocks are applied to cloned/derived project/scenario copies; the base project is not mutated during simulation.
- Invalid active discrete variables block execution.
- Inactive invalid variables do not poison valid runs.
- Unavailable DSCR breach probability is represented as `null` and formatted as `ناموجود` instead of fake 0%.
- The default UI avoids empty/fake metrics; unavailable values use safe formatting.

## 10. UX and Warning Hierarchy

Default executive view now prioritizes:

- Persian-first header, subtitle, and status badge.
- Compact run controls.
- Active-variable summary.
- Managerial interpretation generated from actual results.
- KPI cards and main charts.
- Collapsed sample paths.

Advanced analyst view now contains:

- Full variable editor.
- Discrete option editor.
- Correlation/dependency note.
- Quality warnings and model health.
- VaR convention and validity diagnostics.
- Assumption provenance and technical source paths.

This keeps raw diagnostics out of the default client-facing surface while preserving traceability for analysts.

## 11. Manual QA Checklist

- Default Monte Carlo page load: passed locally, no `NaN`, `Infinity`, or `undefined%` text detected.
- Default run: passed locally; results render with management panel, KPI cards, histogram, CDF, scatter when available, risk contribution, and collapsed sample paths.
- Price variable to discrete: passed locally; neighboring sales-volume card remains intact.
- Add/delete discrete option: passed locally after CSS repair; row count changed 3 -> 4 -> 3.
- Edit invalid probability: passed locally; run disabled and clean Persian error shown.
- Restore valid probability: passed locally; run enabled.
- FX variable to discrete while inflation visible: passed locally; inflation remained intact.
- Change inflation distribution after FX discrete: passed locally; FX remained discrete and intact.
- Stale results: passed locally; changing seed after run shows stale badge/warning, keeps old results visually marked stale, and leaves rerun enabled.
- Seed reproducibility: covered by automated tests rather than repeated browser loops, per timebox.
- Cross-tab smoke: production server returned HTTP 200 for overview, sensitivity, valuation, financing, capex, working capital, scenarios, report, exports, and Monte Carlo.
- Remote deployed reference: attempted `https://investmentsbu.netlify.app/projects/solar-kerman/monte-carlo`, but the remote server was unreachable from this environment. Local production build was used for final verification.

## 12. Validation Results

Baseline before edits:

- `npm.cmd run typecheck` - passed.
- `npm.cmd run lint` - passed.
- `npm.cmd run test` - passed, 86 tests.
- `npm.cmd run build` - passed.

Focused validation after changes:

- `node --test --import tsx tests/monte-carlo-engine.test.ts` - passed, 23 tests.

Final validation after changes:

- `npm.cmd run typecheck` - passed.
- `npm.cmd run lint` - passed.
- `npm.cmd run test` - passed, 92 tests, 10 suites.
- `npm.cmd run build` - passed; `/projects/[projectId]/monte-carlo` and neighboring project routes generated successfully.
- `rg -n "as any|@ts-ignore|eslint-disable|TODO|FIXME|undefined%" src tests` - no hits.
- Broader requested scan for `any|NaN|Infinity` returns existing/intentional literals such as `overflow-wrap: anywhere`, `step="any"`, and explicit guardrail tests/fallbacks using `Number.NaN` or `Infinity`; no new unsafe suppression patterns were introduced.

Production route smoke after build:

- `/projects/solar-kerman/overview` - 200
- `/projects/solar-kerman/sensitivity` - 200
- `/projects/solar-kerman/valuation` - 200
- `/projects/solar-kerman/financing` - 200
- `/projects/solar-kerman/capex` - 200
- `/projects/solar-kerman/working-capital` - 200
- `/projects/solar-kerman/scenarios` - 200
- `/projects/solar-kerman/report` - 200
- `/projects/solar-kerman/exports` - 200
- `/projects/solar-kerman/monte-carlo` - 200

## 13. Remaining Limitations and Risk

- Browser QA was intentionally timeboxed after the discrete add/delete root cause was identified and verified. Remaining broad cross-tab confidence comes from production route smoke plus typecheck/lint/tests/build.
- The remote deployed Netlify page could not be reached from this environment, so visual comparison to the deployed reference is not confirmed.
- Latin Hypercube sampling remains unavailable/disabled in the UI; the current method is independent seeded random sampling.
- Correlation remains explicitly disabled with an advanced warning rather than faked.
- Existing non-Monte-Carlo code still contains intentional guardrail literals such as `Number.NaN` and `Infinity` in tests and safe fallback helpers.

## 14. Client-Presentable Status

The Monte Carlo tab is now client-presentable locally:

- Default view is clean and executive-oriented.
- Advanced diagnostics are collapsed.
- Discrete distribution no longer corrupts neighboring cards.
- Simulation executes and results render.
- Invalid inputs block execution cleanly.
- Results are sanitized and unavailable states are explicit.
- Other major project tabs passed production route smoke.
