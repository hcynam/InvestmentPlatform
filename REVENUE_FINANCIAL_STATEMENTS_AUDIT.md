# Revenue and Financial Statements Audit

Date: 2026-07-05

## Scope

This audit covers the `Revenue` and `Financial Statements` tabs in the Persian RTL investment platform, using `C:\Users\User\Desktop\edition19_4June.xlsx` as the product source of truth. The implementation keeps existing upstream assumption tabs editable and makes these two tabs calculation/provenance workbenches rather than duplicate input forms.

## Workbook Mapping

### Revenue

- `MarketDemand08`: market/customer/channel, target demand, sales unit, base tariff/price, price growth, and year-one potential revenue.
- `CapacityProduction09`: nominal capacity, working days, effective hours, downtime, first/stable utilization, yield, effective annual hours, and production volume.
- `MarcoAssumptions05`: calculation basis, inflation, sales price growth fallback, display unit, FX, and discount settings.
- `FinancialStatements16`: revenue tie-out, gross margin, EBITDA margin, and annual statement reconciliation.

Key workbook values inspected:

- Project: 10 MW solar plant in Kerman, base year 2026.
- Unit: MWh for energy sales.
- Nominal installed capacity: 10 MW.
- Effective annual hours: 2,305.8875.
- Net production reference: 19,715.338125.
- Base sales tariff: 1,200,000 rial per MWh.
- Year-one potential revenue reference: 23,658,405,750 rial.

### Financial Statements

- `FinancialStatements16` rows 8-19: P&L from revenue through net profit.
- `FinancialStatements16` rows 22-36: balance sheet assets, debt, liabilities, equity, and balance check.
- `FinancialStatements16` rows 39 onward: cash flow bridge and financing links.
- `Financing14`: debt schedule, principal, interest, debt service, and covenant/DSCR context.
- `WorkingCapital13`, `Capex12`, `TaxDepreciation15`, `COGS-DirectCost10`, and `Opex-Indirect11`: upstream drivers feeding the statements.

## Current App Gaps Found

### Revenue tab

- The page reused the generic module layout, so it repeated editable market fields already owned by `Market Demand` and `Macro`.
- It did not show the workbook's revenue chain clearly: demand -> capacity -> sales volume -> tariff/price -> revenue.
- Solar-specific interpretation was missing even though the workbook is a solar/PPA project.
- Advanced mode only showed a generic output table, not a source-provenance or reconciliation workbench.
- No visible model checks confirmed price x volume, demand/capacity caps, or tie-out to `FinancialStatements16`.

### Financial Statements tab

- The page showed one very wide raw table instead of grouped P&L, balance sheet, cash flow, and ratio sections.
- Balance status existed in the engine but was not surfaced as a clear management control.
- DSCR needed explicit presentation as `CFADS / Debt Service`, separate from interest coverage.
- Source ownership was hard to see; users could not tell which upstream tab controls each statement block.
- The final-year balance diagnostic was present but not framed as an explicit model limitation.

## DSCR Finding

The workbook contains shortcut DSCR formulas in some cells:

- `FinancialStatements16` row 69 uses an EBITDA divided by interest/principal style expression.
- `Financing14` row 84 also links EBITDA against financing service cells.

The app engine already follows the finance definition required by the brief:

- `CFADS = EBITDA - Tax - Delta NWC`
- `DSCR = CFADS / Debt Service`

The new workbench preserves the app definition and displays interest coverage separately as `EBIT / Interest`.

## Implementation Direction

- Keep `Revenue` and `Financial Statements` as read-only output/provenance workbenches.
- Send edits back to owner modules: Market Demand, Capacity Production, Macro, Direct Costs, OPEX, Capex, Working Capital, and Financing.
- Show invalid, unavailable, or final-year diagnostic states explicitly instead of masking them with fake zeroes.
- Keep the UI Persian RTL, dense, and finance-dashboard oriented, with no raw workbook cell references in client-facing component text.
