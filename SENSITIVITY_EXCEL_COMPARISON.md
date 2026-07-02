# Sensitivity Excel Comparison

Workbook: `C:\Users\User\Desktop\edition19_4June.xlsx`
Sensitivity sheet: `Sensivity19`
Inspection date: 2026-07-02

## Workbook Sheet Map

The workbook has 25 sheets:

`ReadMe01`, `ProjectSetup02`, `MethodologyMap03`, `MasterData04`, `MarcoAssumptions05`, `ScenarioManager06`, `IndustryTemplate07`, `MarketDemand08`, `CapacityProduction09`, `COGS-DirectCost10`, `Opex-Indirect11`, `Capex12`, `WorkingCapital13`, `Financing14`, `ConstructionCashFlow`, `TaxDepreciation15`, `FinancialStatements16`, `DCF-Valuation17`, `EconomicAnalysis18`, `Sensivity19`, `MonteCarlo20`, `DashboardExecutive21`, `DashboardBank22`, `DashboardManagement23`, `ReportPack24`.

## Sensivity19 Structure

Sheet dimensions: 142 rows by 21 columns.

Main sections found:

- `A5:G9`: one-way data table with low/base/high rows.
- `A12:D17`: two-way sensitivity matrix.
- `A20:G142`: discount-rate and delay threshold sweep tables.
- `R7:U19`: general sensitivity controls and metadata.
- `R23:U35`: one-way sensitivity control/output metadata.
- `R39:U50`: two-way matrix controls.
- `R54:U62`: tornado chart preparation.
- `R66:U74`: break-even and risk flag outputs.

## Important Input and Control Cells

- `T9`: analysis type, linked to `DCF-Valuation17!R15` and cached as `اسمی`.
- `T10`: base scenario, linked to `DCF-Valuation17!R14` and cached as `سناریوی پایه`.
- `T11`: analysis horizon, linked to `DCF-Valuation17!R8` and cached as `20`.
- `T12`: base discount rate, formula chooses `DCF-Valuation17!R11` or `DCF-Valuation17!R10` and cached as `0.2`.
- `T13`: inflation, linked to `MarcoAssumptions05!V19` and cached as `0.2`.
- `T14`: base FX rate, cached as `500000`.
- `T15`: base implementation delay, linked to `ScenarioManager06!W26` and cached as `0`.
- `T24`: selected one-way variable, cached as `فروش`.
- `T25:T29`: base/low/mid/high/step values for the one-way variable.
- `T40:T47`: horizontal and vertical variable controls for two-way matrix.

## Important Output Cells

- `D7:D9`: low/base/high sensitivity NPV outputs.
- `T30:T35`: one-way output low/base/high, absolute change, percent change, elasticity.
- `B13:D16`: two-way matrix values.
- `T56:T61`: tornado low/base/high/range/rank/direction.
- `T67`: price break-even.
- `T68`: volume break-even.
- `T69`: sales break-even.
- `T70`: critical FX rate.
- `T71`: critical CAPEX.
- `T72`: critical debt/discount rate by sweep lookup.
- `T73`: critical delay by sweep lookup.
- `T74`: risk flag.

## Links to Other Sheets

The sensitivity formulas directly reference:

- `FinancialStatements16`: sales, COGS, OPEX, depreciation, EBIT.
- `DCF-Valuation17`: horizon, discount rate, terminal growth, tax, FCFF, terminal value, DCF NPV, IRR.
- `Capex12`: total CAPEX.
- `WorkingCapital13`: working capital.
- `COGS-DirectCost10`: production volume, FX rate, FX cost, variable cost.
- `MarcoAssumptions05`: inflation and macro assumptions.
- `ScenarioManager06`: delay.
- `ProjectSetup02`: metadata/version/owner.

## Verified Excel Issues

### Base NPV mismatch

- `Sensivity19!D8` cached NPV: `-507,920,037,272.76306`.
- `DCF-Valuation17!R42` cached NPV: `-1,961,338,183,929.0674`.

The sensitivity sheet is not using the same NPV result as the DCF sheet. The web implementation should use the real valuation engine, not clone this mismatch.

### Discount rate and debt interest are conflated

The long LET sensitivity formulas set `_xlpm.r` with:

`IF(OR(var="نرخ تنزیل", var="نرخ بهره"), x, r0)`

This treats debt interest and discount rate as the same DCF discount variable. The web implementation must keep them separate:

- WACC/discount rate affects DCF discounting and terminal value.
- Debt interest affects financing schedule, interest, DSCR, FCFE, and debt service.

### Risk flag threshold is reversed

`Sensivity19!T74` formula:

`IF('DCF-Valuation17'!R42>0,"سبز",IF('DCF-Valuation17'!R42>=-10%*'DCF-Valuation17'!R26,"قرمز","زرد"))`

This marks deeply negative NPV as yellow when it falls below the negative tolerance. Correct logic should be:

- positive NPV: green
- small negative within tolerance: yellow/watch
- materially negative: red/high risk

### Critical FX rate is impossible

`Sensivity19!T70` cached value:

- `-2,886,933,255.0461397`

A negative FX rate is impossible and must not be shown as a valid threshold in the web app.

### Critical debt/discount rate and delay use boundary lookup

- `T72` uses `INDEX($A$22:$A$122, MATCH(MIN($C$22:$C$122), ...))`.
- `T73` uses `INDEX($E$22:$E$142, MATCH(MIN($G$22:$G$142), ...))`.

These return the tested point closest to zero, not necessarily a real root. If no sign change exists within the tested range, the web app must report "not found in tested range" instead of reporting a boundary or nearest point as a true threshold.

### Terminal value guard is silent

Excel terminal value formulas often use an `IF(rate > growth, ..., 0)` pattern. The web should not silently set terminal value to zero without surfacing a warning/invalid state.

## Items Worth Copying from Excel

- Overall structure: one-way table, two-way matrix, tornado preparation, break-even/threshold area.
- Read-only control/provenance concept linking sensitivity to DCF, macro, financial statements, CAPEX, working capital, and scenario metadata.
- Low/base/high and range/elasticity output concepts.

## Items to Improve or Correct in Web

- Use the web valuation/scenario engine as the single source of truth.
- Correct the NPV mismatch instead of copying the sensitivity-sheet formula.
- Separate discount rate sensitivity from debt interest sensitivity.
- Reject impossible negative thresholds.
- Avoid boundary fake thresholds.
- Add warnings for invalid terminal growth/discount-rate states.
- Use real model reruns for every one-way and two-way cell.
- Preserve previous-tab inputs as provenance, not duplicated editable forms.

## Web Implementation Resolution

The web implementation intentionally follows the app's scenario and valuation engines rather than copying the workbook's cached sensitivity outputs.

- Base sensitivity metric parity is tied to `outputs.valuation` for the active project/scenario.
- Discount-rate/WACC shocks update valuation fields; debt-interest shocks update financing fields and active instruments.
- Impossible thresholds, including negative FX rates, are returned as invalid or not found instead of displayed as critical values.
- Boundary lookup behavior from Excel is replaced by sign-crossing checks.
- The sensitivity tab keeps workbook-style concepts that are useful: one-way table, two-way matrix, tornado ranking, threshold area, and read-only source/provenance metadata.
- The web implementation further improves on Excel by separating unit-price, total-money, FX-rate, percentage, ratio, volume, days/months, and year formatting so thresholds cannot look valid only because of rounded display units.
