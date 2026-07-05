# Monte Carlo P0 Repair Report

Date: 2026-07-05

Scope: restore the Monte Carlo simulation variable editor as a primary workflow, repair the discrete distribution UI path, verify the route in a real browser, and keep regression coverage around the P0 failure.

## Issues Found

- The editable variable configuration was rendered inside `details.monte-advanced-shell`, after the risk summary and result/report sections. The user could see summary assumption cards, but the actual editor was effectively treated as an advanced/bottom detail.
- A regression test encoded the bad placement by asserting that `<VariableConfiguration` appeared after `monte-advanced-shell`.
- Discrete distribution controls existed, but the selector and parameter editor were hidden behind each variable card's collapsed technical details.
- The discrete option row layout used a cramped five-column grid inside a narrow card. Switching a variable to `discrete` could make the active card look broken and make adjacent cards appear like blank stretched panels.
- The stale-results warning did not give the user a direct rerun action near the warning.

## Files Changed

- `src/components/project/MonteCarloWorkbench.tsx`
- `src/styles/globals.css`
- `tests/monte-carlo-engine.test.ts`
- `qa-artifacts/monte-carlo-p0-before.png`
- `qa-artifacts/monte-carlo-p0-before.json`
- `qa-artifacts/monte-carlo-p0-after-top-final.png`
- `qa-artifacts/monte-carlo-p0-after-editor-final.png`
- `qa-artifacts/monte-carlo-p0-after-discrete-final.png`
- `qa-artifacts/monte-carlo-p0-after-run-final.png`
- `qa-artifacts/monte-carlo-p0-after-final-browser-verification.json`

## Missing Editor Root Cause and Fix

Root cause: `VariableConfiguration` was mounted inside the advanced analyst accordion, below the summary/results flow. The main page presented the Monte Carlo output as a report, not as a workbench where variables are visible and editable.

Fix:

- Moved `VariableConfiguration` immediately after the simulation controls and before `ActiveVariablesSummary`.
- Renamed the visible editor heading to the Persian business label for "simulation variables and risk assumptions".
- Added stable browser/test hooks: `data-testid="monte-variable-editor"`, `monte-variable-card`, and `monte-distribution-select`.
- Kept the advanced section for diagnostics, methodology, provenance, and technical warnings only.
- Added a direct rerun button to the stale-results warning.

## Discrete Distribution Root Cause and Fix

Root cause: discrete distributions used typed option arrays, but the UI path still treated distribution editing as a secondary detail. The discrete outcome editor was not visible in the default card flow, and its five-column layout was too wide for the card. This caused the "blank/white broken box" symptom when the user switched a variable to discrete.

Fix:

- Distribution selector is now visible on every variable card by default.
- Continuous low/mid/high fields are visible for continuous distributions.
- `DiscreteOptionsEditor` is visible immediately when `distribution.type === "discrete"`.
- Each variable card now shows a validation message without requiring an accordion.
- The technical details accordion now contains only source logic, model provenance, and warnings.
- Discrete rows now use a responsive two-column grid with full-width help text and a stable remove button.
- Variable card grids use `align-items: start`, so a taller discrete editor does not stretch neighboring cards into blank-looking panels.

## Discrete Representation, Validation, and Sampling

- Types are defined in `src/lib/types.ts`: `MonteCarloDistributionType`, `MonteCarloDiscreteOption`, and `MonteCarloDistribution`.
- Discrete payloads use `distribution.type === "discrete"`, `distribution.valueMode`, and `distribution.options`.
- UI reads options through `getMonteCarloDiscreteOptions` and `getMonteCarloDiscreteValueMode`.
- Switching schemas uses `changeMonteCarloDistributionType`, preserving safe defaults and avoiding neighbor corruption.
- Validation uses `validateMonteCarloVariable` and blocks active invalid variables through the existing run-disabled path.
- Sampling routes discrete distributions to `sampleDiscrete`; it does not silently fall back to a continuous sampler.

## Browser Verification

Before screenshot/evidence:

- `qa-artifacts/monte-carlo-p0-before.png`
- `qa-artifacts/monte-carlo-p0-before.json`
- Baseline showed `variablePanelRect.top = 1520.046875` and `advancedShellRect.top = 1471.046875`, confirming the editor was below/inside the advanced area.

After screenshot/evidence:

- `qa-artifacts/monte-carlo-p0-after-top-final.png`
- `qa-artifacts/monte-carlo-p0-after-editor-final.png`
- `qa-artifacts/monte-carlo-p0-after-discrete-final.png`
- `qa-artifacts/monte-carlo-p0-after-run-final.png`
- `qa-artifacts/monte-carlo-p0-after-final-browser-verification.json`

Final browser metrics from Microsoft Edge headless via CDP at 1366x900:

- Editor visible: `true`
- Editable variable cards: `11`
- Distribution selectors: `11`
- Page horizontal overflow: `0`
- Switch first variable to discrete: `ok`
- Discrete editors after switch: `3`
- Discrete rows after switch: `9`
- Bad input values (`undefined`, `null`, `[object Object]`, `NaN`): `0`
- Blank/broken editor panels detected: `0`
- Run button click: `ok`
- Result stack present after run: `true`
- Result KPI articles after run: `9`
- Chart blocks after run: `4`
- Runtime error detected: `false`

## Tests Added or Updated

- Updated the existing Monte Carlo workbench test so it now asserts the variable editor appears before the summary and before the advanced shell.
- Added assertions for the visible P0 hooks and visible discrete editor path.
- Added the regression test `keeps the P0 Monte Carlo editor out of hidden advanced layout traps`.
- The new test checks that fields are before technical details, validation styling exists, stale warnings have a direct rerun action, the card grid aligns items to start, and the old five-column discrete row layout is gone.

## Validation Results

- `npm.cmd run lint`: pass
- `npm.cmd run typecheck`: pass
- `npm.cmd run test`: pass, 110 tests / 13 suites
- `npm.cmd run build`: pass, Next.js production build completed
- `git diff --check`: pass

## Remaining Limitations

- This P0 pass focused only on the Monte Carlo editor visibility and discrete distribution bug requested in the focused brief.
- The external Netlify URL was not used as deployment proof in this pass. Local browser verification was performed against `http://127.0.0.1:3000/projects/solar-kerman/monte-carlo`.
- Commit hash and push status are recorded in the final handoff after the commit is created and pushed; the report file itself is part of that same commit, so its final commit hash cannot be embedded in this file without changing the hash.
