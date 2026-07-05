# Revenue and Financial Statements Implementation Report

Date: 2026-07-05

## Changed Areas

- Added a shared workbench model builder: `src/lib/revenue-financial-workbench.ts`.
- Added a dedicated revenue workbench: `src/components/project/RevenueWorkbench.tsx`.
- Added a dedicated financial statements workbench: `src/components/project/FinancialStatementsWorkbench.tsx`.
- Routed `revenue` and `financial-statements` through the dedicated workbenches in `src/components/project/ModulePage.tsx`.
- Added scoped UI styles under `rf-*`, `revenue-*`, and `financial-*` classes in `src/styles/globals.css`.
- Added model/UI guard tests in `tests/revenue-financial-workbench.test.ts`.

## Revenue Workbench

The revenue workbench now presents:

- Solar-aware KPI strip for year-one revenue, stabilized revenue, tariff, volume, utilization, installed capacity, effective hours, gross margin, and EBITDA margin.
- Driver bridge from demand and capacity into sales volume, tariff, and revenue.
- Nominal/real revenue toggle.
- Operation-year/all-year toggle.
- Trend charts for revenue, sales volume, tariff/price, and utilization.
- Read-only source provenance in advanced mode.
- Checks for price x volume, demand/capacity caps, revenue tie-out to statements, finite values, domestic/export share, and profitability linkage.

## Financial Statements Workbench

The financial statements workbench now presents:

- KPI strip for revenue, EBITDA, net profit, CFO, FCFF, FCFE, cash, assets, debt, equity, balance check, DSCR, interest coverage, current ratio, and leverage.
- Balance/cash/debt-service/final-year bridge cards.
- Statement tabs for all, P&L, balance sheet, cash flow, and ratios.
- Period toggle for key years or all model years.
- Grouped statement tables with formulas and sticky row labels.
- Source provenance in advanced mode, linking each block back to its owner tab.
- Checks for revenue reconciliation, gross profit, EBITDA, EBIT, EBT, CFO, CFI, CFF, cash roll-forward, balance status, DSCR definition, finite values, and final-year status.

## Workbook Alignment

- Revenue follows workbook tabs `MarketDemand08`, `CapacityProduction09`, `MarcoAssumptions05`, and the statement tie-out in `FinancialStatements16`.
- Statements follow `FinancialStatements16` sections for P&L, balance sheet, cash flow, and ratios.
- DSCR uses the app's required `CFADS / Debt Service` engine definition, with the workbook shortcut noted in the audit.
- Interest coverage remains separate as `EBIT / Interest`.

## Validation Status

Final local validation completed on 2026-07-05:

- Lint: passed with `npm.cmd run lint`.
- Typecheck: passed with `npm.cmd run typecheck`.
- Tests: passed with `npm.cmd run test` (`97` tests, `11` suites).
- Build: passed with `npm.cmd run build`.
- Route smoke: passed with production preview on `http://127.0.0.1:3107`.
  - `/projects/solar-kerman/revenue`: HTTP 200.
  - `/projects/solar-kerman/financial-statements`: HTTP 200.
- Browser/source guard: rebuilt workbench components and shared issue drawer were checked for raw workbook references after the drawer cleanup.

## Repository Notes

Before this implementation, the worktree already contained unrelated dirty Monte Carlo/generated-file changes on branch `fix/monte-carlo-final-hardening`. Any commit/push step must stage only the revenue/financial statements work or report why it is not safe to push.
