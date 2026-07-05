# Revenue and Financial Statements Checklist

Date: 2026-07-05

## Workbook Review

- [x] Read user pasted brief before implementation.
- [x] Verified active repo path as `D:\InvestmentPlatform`.
- [x] Inspected workbook sheets relevant to Revenue and Financial Statements.
- [x] Mapped Revenue to Market Demand, Capacity Production, Macro, and Financial Statements.
- [x] Mapped Financial Statements to P&L, balance sheet, cash flow, financing, tax, working capital, capex, COGS, and OPEX inputs.
- [x] Documented workbook DSCR shortcut and app-required CFADS/debt service definition.

## Product Changes

- [x] Revenue no longer relies on the generic duplicated-input page.
- [x] Revenue shows demand/capacity/volume/price/revenue bridge.
- [x] Revenue supports nominal and real display.
- [x] Revenue exposes source provenance in advanced mode.
- [x] Revenue has model checks for formula tie-out and invalid values.
- [x] Financial Statements no longer rely on one raw wide table.
- [x] Financial Statements are grouped into P&L, balance sheet, cash flow, and ratios.
- [x] Financial Statements expose DSCR as CFADS / Debt Service and interest coverage separately.
- [x] Financial Statements expose balance and final-year diagnostic status.
- [x] Financial Statements expose source provenance in advanced mode.

## Tests And Validation

- [x] Added focused tests for revenue and financial statements workbench models.
- [x] Lint passes.
- [x] Typecheck passes.
- [x] Test suite passes.
- [x] Production build passes.
- [x] Revenue route smoke passes.
- [x] Financial Statements route smoke passes.

## Commit And Push

- [ ] Staged only scoped Revenue/Financial Statements work.
- [ ] Created commit.
- [ ] Pushed to remote, if safe.
- [ ] Reported commit hash and push range, or reported why push was unsafe.
