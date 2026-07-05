# DCF and Economic Analysis Audit

Date: 2026-07-05

## Scope

This audit covers the `DCF Valuation` and `Economic Analysis` result tabs for the Persian RTL investment platform. The workbook `C:\Users\User\Desktop\edition19_4June.xlsx` was treated as the product reference, with the app engine used as the implementation surface.

The final pages are intended to be report/output workbenches. They do not duplicate editable upstream assumptions; they show values, source ownership, diagnostics, and annual cash-flow evidence.

## Workbook Mapping

### DCF-Valuation17

- Analysis horizon: `DCF-Valuation17!R8`, 20 years.
- Base year: `DCF-Valuation17!R9`, 2026.
- Nominal WACC: `DCF-Valuation17!R10`, linked from `MarcoAssumptions05!V61`.
- Real WACC formula: `DCF-Valuation17!R11`, based on Fisher conversion with macro inflation.
- Terminal growth: `DCF-Valuation17!R12`, 3%.
- Active basis: `DCF-Valuation17!R15`, nominal in the workbook.
- Reinvestment and finance rates: `DCF-Valuation17!R16:R17`.
- FCFF/discounted valuation table: `DCF-Valuation17` rows 54-74.
- Workbook cached issue: IRR and MIRR can produce `#NUM!` or `#VALUE!`; the app now reports unavailable states explicitly instead of masking them as zero.

### EconomicAnalysis18

- Social discount rate: `EconomicAnalysis18!R9`, 8%.
- Standard conversion factor: `EconomicAnalysis18!R10`, 0.9.
- Labor conversion factors: `EconomicAnalysis18!R11:R12`.
- Shadow exchange rate factor: `EconomicAnalysis18!R13`, 1.1.
- Energy conversion factor: `EconomicAnalysis18!R15`, 1.2.
- Workbook limitation: the sheet is mostly a thin single-year ENCF projection and does not provide numeric CO2 volume or carbon price inputs.

## Upstream Source Ownership

- `ProjectSetup02`: project identity, location, display context.
- `MarcoAssumptions05`: inflation, WACC, real/nominal basis, FX and discount settings.
- `MarketDemand08` and `CapacityProduction09`: production and revenue drivers.
- `COGS-DirectCost10`, `Opex-Indirect11`, `Capex12`: operating and investment cost drivers.
- `WorkingCapital13`: working-capital movements.
- `Financing14`: debt drawdown, principal repayment, interest, debt-service and DSCR context.
- `TaxDepreciation15`: depreciation and tax behavior.
- `FinancialStatements16`: P&L, balance sheet, cash-flow bridge, FCFF/FCFE source rows.

## Gaps Found

- The old valuation route reused a generic module layout and did not read as a DCF report.
- FCFF and FCFE were not visible side by side, making financing effects hard to audit.
- Terminal value, nominal/real discount basis, payback availability, and invalid IRR/MIRR states needed typed diagnostics.
- The old economic route showed generic output/input tables rather than a social appraisal report.
- Economic analysis did not clearly separate market-cash-flow values from social conversion factors, transfers, externalities, and public benefits/costs.
- Carbon pricing and CO2 tonnage were not available in the workbook; the UI needed to say that honestly instead of inventing values.
- Raw internal labels such as workbook-style route tokens and generic `Model inputs`/`Model impact` wording were not acceptable for these report pages.

## Implementation Direction

- Keep upstream assumptions editable in their owner tabs and make DCF/Economic read-only report pages.
- Build typed annual output rows for both modules, not ad hoc UI-only derived arrays.
- Keep FCFF as project cash flow excluding financing and FCFE as shareholder cash flow including debt drawdown and principal repayment.
- Use Fisher conversion for real discount rate evidence and clearly label the active nominal/real basis.
- Compute economic ENPV, EIRR, EBCR, PV benefits, PV costs, value added, and economic payback from annual social appraisal rows.
- Remove taxes/interest/financing as transfer items in the social analysis, while keeping the adjustment visible.
- Surface missing carbon assumptions as `missing`, not as fake zero-benefit certainty.
- Use Persian RTL report wording with finance abbreviations preserved where they are standard labels.

## Current Limitations

- Carbon price and CO2 tonnage are not numeric workbook inputs, so carbon value is not fabricated.
- Risk-free rate, beta, and full CAPM decomposition are not available in the current app data model; WACC evidence is shown from available macro/project fields.
- The economic analysis is a stronger social-appraisal model than the workbook sheet, but it remains bounded by currently available app drivers.
- Deployed-site freshness still requires remote deployment verification after push; local build success alone does not prove deployment completion.
