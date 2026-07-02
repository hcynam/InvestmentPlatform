# Sensitivity Goal Loop Checklist

Status legend: `[ ]` not started, `[~]` in progress, `[x]` complete, `[!]` complete with explicit limitation note.

## Phase 0 - Audit and Plan

- [x] Run git status.
- [x] Identify branch and latest commit.
- [x] Locate sensitivity route, component, engine, types, tests, and module config.
- [x] Locate financial engines.
- [x] Locate Excel workbook.
- [x] Inspect workbook sheet names.
- [x] Locate sensitivity sheet.
- [x] Audit current web calculation behavior with live seed project.
- [x] Audit Excel sensitivity sheet structure and key formulas.
- [x] Document initial findings in `SENSITIVITY_IMPLEMENTATION_AUDIT.md`.
- [x] Document Excel findings in `SENSITIVITY_EXCEL_COMPARISON.md`.

## Phase 1 - Core Sensitivity Engine

- [x] Add typed sensitivity engine in `src/lib/sensitivity-engine.ts`.
- [x] Clone project safely for each sensitivity run.
- [x] Apply shocks to real model fields, not display labels alone.
- [x] Rerun the same core valuation/scenario path with `runCoreCalculation(..., false)`.
- [x] Extract selected metric consistently for NPV, IRR, payback, DSCR, equity value, and BCR.
- [x] Add warning and invalid-state handling.
- [x] Add guards for non-finite outputs.
- [x] Add focused unit tests for core sensitivity behavior.

## Phase 2 - One-Way Sensitivity and Tornado

- [x] Implement one-way table with base, low/high, absolute impact, percent impact, elasticity, and status.
- [x] Ensure CAPEX shock affects real CAPEX drivers.
- [x] Ensure FX shock affects FX rates and FX-linked assumptions, and reports no-exposure states.
- [x] Ensure revenue/price/volume shocks affect revenue.
- [x] Ensure OPEX/direct-cost shocks affect costs.
- [x] Ensure WACC/discount-rate shock affects valuation.
- [x] Ensure debt-interest shock affects financing/DSCR/FCFE and remains separate from WACC.
- [x] Build tornado output from one-way sensitivity outputs.

## Phase 3 - Two-Way Matrix / Heatmap

- [x] Implement two-variable matrix using real reruns per cell.
- [x] Support configurable 3x3-or-larger matrices.
- [x] Add invalid-cell labels and warnings.
- [x] Render matrix in advanced UI.

## Phase 4 - Break-Even / Threshold Analysis

- [x] Implement robust threshold search.
- [x] Use sign bracketing and interpolation where appropriate.
- [x] Prevent negative impossible thresholds.
- [x] Prevent boundary values from being reported as true thresholds.
- [x] Display tested ranges.
- [x] Document threshold assumptions and statuses.

## Phase 5 - Advanced UI/UX

- [x] Add active scenario display and metric controls.
- [x] Add unit, range, step, and shock-mode controls where practical.
- [!] Nominal/real basis follows the scenario's valuation basis and is displayed as read-only provenance; this tab does not duplicate the macro/valuation basis editor.
- [x] Add read-only assumption provenance.
- [x] Add one-way table.
- [x] Add tornado chart from real outputs.
- [x] Add two-way matrix/heatmap.
- [x] Add break-even/threshold cards and table.
- [x] Add model quality warning panel.
- [x] Remove repeated base-input editing where it duplicates previous tabs.
- [x] Keep Persian RTL labels and avoid placeholder/fake values.

## Phase 6 - Integration and Validation

- [x] Respect active scenario.
- [x] Keep scenario state consistent with top-level project state.
- [x] Keep report/export output structure typed and clean enough for later use.
- [x] Run `npm.cmd run lint`.
- [x] Run `npm.cmd run typecheck`.
- [x] Run `npm.cmd run test`.
- [x] Run `npm.cmd run build`.
- [x] Fix failures or document true blockers.
- [x] Update `SENSITIVITY_IMPLEMENTATION_REPORT.md`.

## Phase 7 - Final QA Correction Pass

- [x] Fix metric consistency so dropdown, header, one-way, tornado, and matrix use the same applied selected metric.
- [x] Add typed unit vocabulary for total money, unit price, percentage, ratio, FX rate, volume, months, days, years, and unknown units.
- [x] Add unit-safe formatter for sensitivity outputs.
- [x] Fix price break-even formatting so unit prices are never shown as total project money.
- [x] Fix FX formatting so exchange rates are never shown as billion/million Rial totals.
- [x] Add structured threshold target/status/reason/recommendation metadata.
- [x] Distinguish valid, notFound, invalid, boundaryOnly, noExposure, insufficientData, and modelError threshold states.
- [x] Improve assumption provenance unit display and read-only/source-path metadata.
- [x] Improve variable rows so base value/source are read-only and editable fields remain sensitivity configuration only.
- [x] Improve one-way table metric/unit header, input values, statuses, and warning/reason column.
- [x] Improve two-way matrix metric/unit/axis/base-cell/legend metadata.
- [x] Improve model-quality warning cards with severity, module, message, and recommendation.
- [x] Add formatter and metadata tests.

## Acceptance Criteria

- [x] Sensitivity base NPV equals main valuation engine NPV for the same project/scenario.
- [x] Zero shock returns the same metric as base valuation.
- [x] One-way sensitivity uses real recalculation, not hard-coded impacts.
- [x] Tornado chart uses one-way sensitivity outputs.
- [x] Two-way matrix uses real recalculation per cell.
- [x] Break-even analysis does not show impossible negative thresholds.
- [x] Boundary values are not reported as true critical thresholds.
- [x] CAPEX sensitivity is connected when CAPEX exists.
- [x] FX sensitivity is connected where FX-linked assumptions exist, or explicitly warns when there is no exposure.
- [x] WACC/discount-rate sensitivity has terminal growth guards.
- [x] Debt interest sensitivity is separated from WACC sensitivity.
- [x] The tab does not ask again for base inputs already collected in previous tabs.
- [x] Previous-tab assumptions are displayed as read-only provenance where useful.
- [x] Advanced mode is clearly more complete than simple mode.
- [x] No visible NaN, undefined, null, #N/A, test values, fake values, or placeholder outputs.
- [x] TypeScript passes.
- [x] Build passes.
- [x] Tests pass.
- [x] Implementation report is updated with changed files, logic, commands, limitations, Excel differences, and validation notes.
- [x] Selecting BCR does not show IRR labels unless explicitly intended.
- [x] Selecting IRR shows outputs as percentages.
- [x] Selecting NPV shows outputs as money.
- [x] Break-even targets are explicit and not silently mixed with the selected dropdown metric.
- [x] Price break-even is not displayed as `0 billion Rial` due to bad scaling.
- [x] FX rate is displayed as an exchange rate, not total money.
- [x] Volume break-even has a unit or an explicit fallback warning.
- [x] Threshold rows have structured status, reason, and recommendation metadata.
- [x] Boundary-only results are not marked valid.
- [x] Assumption provenance uses typed units.
- [x] One-way table shows metric/unit clearly.
- [x] Two-way matrix shows metric/unit/axis/base-cell/legend metadata.
- [x] Model quality warnings are readable and separated by severity/module/message/recommendation.

## Limitations Intentionally Kept

- The Excel sensitivity sheet contains cached NPV mismatches and impossible threshold values; the web implementation uses the live valuation engine instead of copying those workbook outputs.
- Thresholds are only reported as valid when the tested range brackets a real crossing. Otherwise the UI shows structured non-valid statuses such as `notFound`, `boundaryOnly`, or `noExposure`.
- The nominal/real sensitivity basis is inherited from the scenario valuation basis. Editing that basis remains in the macro/valuation flow.
