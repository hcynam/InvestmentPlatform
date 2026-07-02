# Sensitivity Implementation Audit

Date: 2026-07-02
Repo: `D:\InvestmentPlatform`
Branch: `main`
Latest commit inspected: `53ccf2a Add balance-sheet tie-out and FCFE real-nominal valuation`

## Phase 0 Scope

This audit covers the current Sensitivity Analysis route, its calculation path, the Excel reference workbook, and the first set of implementation gaps that must be closed before the tab can be considered production-grade.

## Repository State

- `C:\Users\User\Documents\InvestmentPlatform` is not a git repository.
- The active implementation checkout is `D:\InvestmentPlatform`.
- `git status --short --branch` reported `## main...origin/main` with no dirty files before this audit pass.
- Package scripts available:
  - `npm run lint`
  - `npm run typecheck`
  - `npm run test`
  - `npm run build`

## Sensitivity-Related Files Found

- `src/app/projects/[projectId]/sensitivity/page.tsx`
- `src/components/project/SensitivityWorkbench.tsx`
- `src/components/project/ModulePage.tsx`
- `src/lib/calculations.ts`
- `src/lib/types.ts`
- `src/lib/module-config.ts`
- `src/lib/seed.ts`
- `src/styles/globals.css`
- Existing tests under `tests/*.test.ts`

## Existing Financial Engine Files

- `src/lib/calculations.ts`: main scenario calculation orchestration; currently contains `calculateSensitivity` inline.
- `src/lib/phase-one-calculations.ts`: macro, market, setup, and industry validation/calculation helpers.
- `src/lib/phase-two-calculations.ts`: capacity, direct cost, OPEX, CAPEX, depreciation-related phase-two helpers.
- `src/lib/financing-engine.ts`: financing instruments, drawdowns, debt schedule, DSCR.
- `src/lib/construction-cashflow-engine.ts`: monthly construction cash flow.
- `src/lib/working-capital-engine.ts`: working capital schedule.
- `src/lib/tax-capex-engine.ts`: accounting/tax depreciation and tax bridge.
- `src/lib/financial-math.ts`: NPV, IRR, MIRR, payback, real-rate guards.
- `src/lib/scenario-engine.ts`: scenario adjustment logic.

## Workbook Location

- Found: `C:\Users\User\Desktop\edition19_4June.xlsx`
- Workbook has 25 sheets.
- Sensitivity sheet found: `Sensivity19`

## Current Web Sensitivity Architecture

Current calculation flow:

1. `calculateScenario()` calls `runCoreCalculation(project, scenario)`.
2. `runCoreCalculation()` calculates capacity, revenue, direct costs, OPEX, CAPEX, construction, working capital, financing, statements, valuation, economics.
3. `runCoreCalculation()` then calls inline `calculateSensitivity(project, scenario, valuation.npv)`.
4. `calculateSensitivity()` uses `applyShock()` to clone the project, mutate a field based on a Persian label string, and rerun `runCoreCalculation(..., false)`.
5. UI renders `outputs.sensitivity.oneWay`, `outputs.sensitivity.matrix`, `outputs.sensitivity.tornado`, and `outputs.sensitivity.breakEven`.

This is directionally correct because sensitivity reruns the core engine. However, several mutations hit the wrong fields, several outputs are too weakly typed, and break-even logic is formula-like rather than root-finding.

## Verified Current Bugs

### 1. Base NPV mismatch versus Excel

Excel `Sensivity19!D8` cached base NPV:

- `-507,920,037,272.76306`

Excel `DCF-Valuation17!R42` cached NPV:

- `-1,961,338,183,929.0674`

The Excel sensitivity sheet does not match the Excel DCF sheet. The web must not copy this mismatch; it should use the same valuation engine as the valuation page.

Current web seed valuation NPV:

- `outputs.valuation.npv = -132,940,007,242.74648`
- Zero shock in current sensitivity one-way price run returns the same NPV, which proves the web sensitivity can use the live valuation engine for zero shock.

### 2. CAPEX sensitivity is disconnected

Current web audit with a +/-10% CAPEX shock:

- low: `-132,940,007,242.74648`
- base: `-132,940,007,242.74648`
- high: `-132,940,007,242.74648`

Root cause: `applyShock()` mutates legacy `item.unitPrice`, but the CAPEX engine uses `rialUnitPrice` and `fxUnitPrice` when present.

### 3. FX sensitivity is disconnected in the seed project

Current web audit with a +/-10% FX shock:

- low: `-132,940,007,242.74648`
- base: `-132,940,007,242.74648`
- high: `-132,940,007,242.74648`

Root cause: the mutation changes `macro.fxRates.freeMarket`, but current seed values only move if actual FX-linked CAPEX/direct/OPEX inputs are connected to that rate. The engine must report when a variable has no model exposure instead of silently presenting a flat result as meaningful.

### 4. Discount-rate sensitivity is disconnected

Current web audit with a +/-10% discount-rate shock:

- low: `-132,940,007,242.74648`
- base: `-132,940,007,242.74648`
- high: `-132,940,007,242.74648`

Root cause: `applyShock()` mutates `macro.discountRate`, while `calculateValuation()` uses `macro.defaultDiscountRate` for nominal DCF.

### 5. Debt interest sensitivity is disconnected when instruments exist

Current web audit with a +/-10% debt-rate shock:

- low: `-132,940,007,242.74648`
- base: `-132,940,007,242.74648`
- high: `-132,940,007,242.74648`

Root cause: `applyShock()` mutates `financing.interestRate`, but `normalizeFinancingAssumptions()` prefers existing `financing.instruments[].annualRate` when instruments are present.

### 6. COGS/direct-cost sensitivity is disconnected for current seed

Current web audit with a +/-10% COGS shock:

- low: `-132,940,007,242.74648`
- base: `-132,940,007,242.74648`
- high: `-132,940,007,242.74648`

Root cause: the mutation only changes `directLaborUnitCost`; in the current seed this does not materially feed the direct cost schedule. The shock should apply to the actual direct-cost drivers used by `calculateDirectUnitCost()`.

### 7. Break-even output is not robust

Current web seed break-even output:

- price: `7,270,319.965422213`
- volume: `null`
- sales: `null`
- fxRate: `1,000,000`

Problems:

- `calculateSensitivity()` uses `scenario.outputs?.statements.rows[1]`, but during calculation the active scenario output is not populated yet.
- Price/volume/sales thresholds are algebraic estimates, not root-finding.
- FX rate threshold is a formula-like value and is not verified as a root.
- Boundary or impossible values are not distinguished from real roots.

### 8. UI repeats sensitivity variables as editable inputs

The sensitivity page has a custom workbench, so `ModulePage` does not render `module-config` fields for this route. However, `SensitivityWorkbench` still exposes editable variable definitions in the sensitivity tab. The production requirement is to show prior-tab assumptions as read-only provenance and only expose sensitivity-specific controls.

### 9. Output types are too thin

Current types only include:

- `SensitivityPoint`: `{ variable, shock, metric }`
- `SensitivityMatrixCell`: `{ rowShock, colShock, value }`
- `tornado`: `{ variable, low, high, range }`
- `breakEven`: `{ price, volume, sales, fxRate }`

Missing:

- variable IDs and source modules
- base/low/high values
- absolute and percent impact
- elasticity
- warnings/errors per run
- invalid state reasons
- threshold status/range metadata
- quality warning panel data

## Excel-Dependent Findings

See `SENSITIVITY_EXCEL_COMPARISON.md` for workbook-specific details.

## Initial Implementation Direction

1. Move sensitivity calculation out of ad hoc UI-like label handling into a typed sensitivity engine.
2. Keep the core rerun architecture: clone project, apply shock, rerun `runCoreCalculation(..., false)`.
3. Fix field mappings:
   - WACC/discount rate -> `macro.defaultDiscountRate` and `macro.discountRate`.
   - Debt interest -> `financing.interestRate` and active `financing.instruments[].annualRate`.
   - CAPEX -> `rialUnitPrice`, `fxUnitPrice`, legacy `unitPrice`, side costs where appropriate.
   - Direct costs -> actual direct unit cost drivers and direct-cost items.
   - FX -> only FX-linked assumptions and FX rates, with warnings if exposure is zero.
4. Add typed warning/status outputs and no non-finite values.
5. Replace break-even algebra with robust sweep/root bracketing and interpolation.
6. Update UI to render professional advanced outputs, provenance, warnings, and invalid states.

## Implementation Update

The initial gaps above have been addressed in this pass.

- Sensitivity calculation now lives in `src/lib/sensitivity-engine.ts`.
- `runCoreCalculation()` builds the normal project outputs first, then calls the sensitivity engine with those base outputs and a non-recursive core runner.
- One-way, two-way, tornado, and threshold outputs are generated from real core reruns rather than hard-coded impact formulas.
- CAPEX, OPEX, direct costs, revenue/price/volume, FX, inflation, WACC, debt interest, delay, working-capital days, and tax rate have typed shock handlers.
- WACC and debt interest are intentionally separate model variables.
- Thresholds use sign bracketing and interpolation; no negative impossible threshold or boundary-only value is reported as a valid root.
- The advanced UI now shows metric controls, quality warnings, read-only provenance, sensitivity-specific variable controls, one-way detail, tornado output, threshold status, and a two-way matrix.
- Tests now cover zero-shock parity, connected variable behavior, WACC/debt-interest separation, invalid threshold rejection, invalid terminal-growth warnings, and finite/null output safety.

Final validation passed with:

- `npm.cmd run lint`
- `npm.cmd run typecheck`
- `npm.cmd run test`
- `npm.cmd run build`

## Final QA Correction Update

The post-deployment QA findings around metric consistency, unit formatting, threshold validity, and professional UX have been addressed.

- Added a shared sensitivity formatter so unit prices, FX rates, percentages, ratios, volumes, days/months, years, and total money use distinct formatting rules.
- Added metric metadata so BCR/DSCR render as ratios, IRR renders as a percentage, Payback renders as years, and NPV/equity value render as money.
- Changed the metric selector to render from the applied sensitivity output metric, preventing the dropdown from showing BCR while the page renders IRR outputs.
- Added threshold target metadata. Break-even rows explicitly state `NPV = 0` and do not silently follow the selected metric dropdown.
- Expanded threshold statuses from generic ok/not-found states into `valid`, `notFound`, `invalid`, `boundaryOnly`, `noExposure`, `insufficientData`, and `modelError`.
- Price break-even and tested price ranges now use unit-price formatting instead of project-money formatting.
- FX thresholds and provenance use exchange-rate formatting instead of total-money formatting.
- Assumption provenance now includes typed units, read-only status, and source-path display.
- Warning cards now separate severity, source module, message, and recommendation.
- Added formatter tests for price, FX, percentages, ratios, volume fallback, and invalid-token display safety.
