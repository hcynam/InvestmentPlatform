# Sensitivity Implementation Report

Date: 2026-07-02

## Current Status

The Sensitivity Analysis module has been refactored from a thin inline calculation into a typed production-oriented engine with real scenario reruns, richer outputs, advanced UI rendering, unit-safe formatting, structured threshold metadata, BCR-specific financial semantics, value/risk heatmap scoring, and test coverage. Validation passed after the final production-readiness pass.

## Audited Inputs

- Active git repo: `D:\InvestmentPlatform`
- Latest inspected commit before this pass: `ef824cb Polish sensitivity analysis units metrics and thresholds`
- Workbook: `C:\Users\User\Desktop\edition19_4June.xlsx`
- Excel sensitivity sheet: `Sensivity19`
- Current web calculation path and seed project behavior

## Key Implementation Changes

- Added `src/lib/sensitivity-engine.ts` with typed one-way, two-way, tornado, threshold, quality-warning, and provenance outputs.
- Updated `src/lib/calculations.ts` so sensitivity uses the same core valuation/scenario path as the rest of the app, while avoiding recursive risk calculations.
- Expanded `src/lib/types.ts` for metrics, statuses, warnings, provenance, tornado results, break-even metadata, and richer sensitivity cells.
- Added `src/lib/sensitivity-format.ts` for unit-safe sensitivity display formatting.
- Reworked `src/components/project/SensitivityWorkbench.tsx` into an advanced sensitivity workbench with metric controls, warning panels, provenance, one-way table, tornado chart, two-way matrix, and threshold cards.
- Added CSS support in `src/styles/globals.css`.
- Added `tests/sensitivity-engine.test.ts` for zero-shock parity, connected revenue/cost/CAPEX/WACC/debt-interest shocks, invalid threshold handling, terminal-growth warnings, and finite/null output safety.
- Added `tests/sensitivity-format.test.ts` for unit-price, FX-rate, percentage, ratio, volume fallback, and no invalid-token display guards.
- Added BCR tests proving classical positive benefits-to-costs behavior and weak-project BCR below 1 without fake-negative output.
- Added matrix heatmap classification tests for NPV, BCR, IRR, and DSCR thresholds.

## Corrected Model Behavior

- Zero shock now preserves the base valuation metric.
- CAPEX sensitivity applies to actual CAPEX price/cost drivers.
- Direct-cost and OPEX sensitivities apply to actual model cost drivers/items.
- Revenue, price, and volume sensitivities rerun the real revenue/valuation engine.
- WACC/discount-rate sensitivity updates valuation discount-rate fields.
- Debt-interest sensitivity updates financing assumptions and active instruments separately from WACC.
- FX sensitivity updates macro/manual FX assumptions and reports flat/no-exposure states instead of implying false impact.
- Economic BCR is a classical `PV(benefits) / PV(costs)` ratio. Benefit inputs and cost inputs are bucketed as non-negative components before discounting so cost sign conventions do not turn a plain BCR into a misleading negative net-ratio display.
- Break-even analysis uses sign bracketing/interpolation and does not report impossible negative or nearest-boundary thresholds as valid roots.
- Terminal-growth and invalid-rate states surface warnings instead of silently emitting fake values.

## Final QA Corrections

- Metric selection now has one applied source of truth; the dropdown, header, tornado, one-way table, matrix, and threshold context all render from `outputs.sensitivity.selectedMetric` and `metricMetadata`.
- BCR is labeled as `نسبت منفعت به هزینه (BCR)`, formatted as a ratio, and documented with `BCR = 1` as its metric threshold. IRR is a percentage, Payback is years, DSCR is a ratio, and NPV/equity value are money.
- Price break-even uses `unitPrice`, never total-money scaling, so it cannot display as a misleading zero billion Rial value.
- FX values use `fxRate` formatting and display as an exchange rate instead of project money.
- Volume values use the project/capacity unit, with an explicit fallback warning when unknown.
- Threshold rows now include target, base value, result value, tested range, unit type, status, reason, and recommendation.
- Threshold statuses now distinguish `valid`, `notFound`, `invalid`, `boundaryOnly`, `noExposure`, `insufficientData`, and `modelError`.
- One-way statuses now distinguish `valid`, `validWithBaseRisk`, `watch`, `noExposure`, `immaterial`, `invalid`, `notApplicable`, and `modelError` with Persian reasons/recommendations.
- The two-way matrix now uses metric-specific value/risk heatmap classes instead of min/max row striping. NPV/equity value compare to zero/base, IRR compares to the discount rate, BCR compares to 1, DSCR compares to the bank target, and Payback treats lower as better.
- Warning cards now separate severity, module, Persian message, recommendation, and optional module action.
- Assumption provenance keeps developer paths in tooltips instead of primary card text.
- Wide one-way, matrix, and threshold tables scroll inside their own wrappers. The page/workspace CSS now sets defensive `min-width: 0`, `max-width: 100%`, and contained `overflow-x` rules so tables do not widen the whole page.
- User-facing advanced sensitivity labels and explanations were cleaned up in Persian. Technical abbreviations such as NPV, IRR, DSCR, BCR, CAPEX, OPEX, and COGS remain where they are finance/module labels.

## Responsive QA Note

- CSS containment was audited for normal desktop widths including 1366px and 1920px: the workbench, panels, grid children, and table wrappers now have defensive shrink/overflow rules, while wide tables use internal horizontal scroll.
- Local route smoke passed: `http://127.0.0.1:3000/projects/solar-kerman/sensitivity` returned HTTP 200.
- Browser viewport automation was not available in this environment because no local Chrome/Edge/Playwright/Puppeteer runtime was present. Manual deployed-site verification should still check that 1366px and 1920px viewports have no page-level horizontal scrollbar and that only table cards scroll horizontally.

## Excel Differences Preserved on Purpose

- Excel `Sensivity19!D8` and `DCF-Valuation17!R42` have different cached base NPV values, so the web module uses the app valuation engine as source of truth.
- Excel conflates discount rate and debt interest in the sensitivity formulas; the web implementation separates them.
- Excel has an impossible negative critical FX rate; the web implementation rejects invalid thresholds.
- Excel debt/discount-rate and delay thresholds use nearest-point lookup; the web implementation requires a real sign crossing.

## Validation

Commands run from `D:\InvestmentPlatform`:

- `npm.cmd run lint` - passed.
- `npm.cmd run typecheck` - passed.
- `npm.cmd run test` - passed: 69 tests, 9 suites, 69 passed, 0 failed.
- `npm.cmd run build` - passed; Next.js generated the `/projects/[projectId]/sensitivity` route.
- Local dev smoke: `http://127.0.0.1:3000/projects/solar-kerman/sensitivity` returned HTTP 200.

## Known Limitations

- Nominal/real sensitivity follows the scenario valuation basis and is displayed as read-only provenance; basis editing remains in the macro/valuation modules.
- Thresholds can return `notFound`, `boundaryOnly`, or `noExposure` when no real crossing exists in the tested range. This is intentional and safer than reporting workbook-style nearest boundaries.
- Report/export wiring was kept type-ready but not expanded into a separate export template in this pass.
- Netlify deployment completion must be verified after the GitHub push; this local pass does not prove the deployed site is already updated.
