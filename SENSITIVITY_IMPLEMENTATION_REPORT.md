# Sensitivity Implementation Report

Date: 2026-07-02

## Current Status

The Sensitivity Analysis module has been refactored from a thin inline calculation into a typed production-oriented engine with real scenario reruns, richer outputs, advanced UI rendering, and test coverage. Validation passed.

## Audited Inputs

- Active git repo: `D:\InvestmentPlatform`
- Latest inspected commit before work: `53ccf2a Add balance-sheet tie-out and FCFE real-nominal valuation`
- Workbook: `C:\Users\User\Desktop\edition19_4June.xlsx`
- Excel sensitivity sheet: `Sensivity19`
- Current web calculation path and seed project behavior

## Key Implementation Changes

- Added `src/lib/sensitivity-engine.ts` with typed one-way, two-way, tornado, threshold, quality-warning, and provenance outputs.
- Updated `src/lib/calculations.ts` so sensitivity uses the same core valuation/scenario path as the rest of the app, while avoiding recursive risk calculations.
- Expanded `src/lib/types.ts` for metrics, statuses, warnings, provenance, tornado results, break-even metadata, and richer sensitivity cells.
- Reworked `src/components/project/SensitivityWorkbench.tsx` into an advanced sensitivity workbench with metric controls, warning panels, provenance, one-way table, tornado chart, two-way matrix, and threshold cards.
- Added CSS support in `src/styles/globals.css`.
- Added `tests/sensitivity-engine.test.ts` for zero-shock parity, connected revenue/cost/CAPEX/WACC/debt-interest shocks, invalid threshold handling, terminal-growth warnings, and finite/null output safety.

## Corrected Model Behavior

- Zero shock now preserves the base valuation metric.
- CAPEX sensitivity applies to actual CAPEX price/cost drivers.
- Direct-cost and OPEX sensitivities apply to actual model cost drivers/items.
- Revenue, price, and volume sensitivities rerun the real revenue/valuation engine.
- WACC/discount-rate sensitivity updates valuation discount-rate fields.
- Debt-interest sensitivity updates financing assumptions and active instruments separately from WACC.
- FX sensitivity updates macro/manual FX assumptions and reports flat/no-exposure states instead of implying false impact.
- Break-even analysis uses sign bracketing/interpolation and does not report impossible negative or nearest-boundary thresholds as valid roots.
- Terminal-growth and invalid-rate states surface warnings instead of silently emitting fake values.

## Excel Differences Preserved on Purpose

- Excel `Sensivity19!D8` and `DCF-Valuation17!R42` have different cached base NPV values, so the web module uses the app valuation engine as source of truth.
- Excel conflates discount rate and debt interest in the sensitivity formulas; the web implementation separates them.
- Excel has an impossible negative critical FX rate; the web implementation rejects invalid thresholds.
- Excel debt/discount-rate and delay thresholds use nearest-point lookup; the web implementation requires a real sign crossing.

## Validation

Commands run from `D:\InvestmentPlatform`:

- `npm.cmd run lint` - passed.
- `npm.cmd run typecheck` - passed.
- `npm.cmd run test` - passed: 56 tests, 8 suites, 56 passed, 0 failed.
- `npm.cmd run build` - passed; Next.js generated the `/projects/[projectId]/sensitivity` route.
- Dev smoke: `http://localhost:3000/projects/solar-kerman/sensitivity` returned HTTP 200.

## Known Limitations

- Nominal/real sensitivity follows the scenario valuation basis and is displayed as read-only provenance; basis editing remains in the macro/valuation modules.
- Thresholds can return `not_found` when no real crossing exists in the tested range. This is intentional and safer than reporting workbook-style nearest boundaries.
- Report/export wiring was kept type-ready but not expanded into a separate export template in this pass.
