# DCF and Economic Analysis Checklist

Date: 2026-07-05

## Workbook and Repo Audit

- [x] Read the pasted task brief before continuing.
- [x] Confirm real repo path: `D:\InvestmentPlatform`.
- [x] Confirm workbook path: `C:\Users\User\Desktop\edition19_4June.xlsx`.
- [x] Inspect workbook sheet names and the relevant DCF/Economic sheets.
- [x] Inspect `DCF-Valuation17` formulas, cached values, discount basis, terminal growth, FCFF table, and error states.
- [x] Inspect `EconomicAnalysis18` social discount/conversion factors and its thin ENCF structure.
- [x] Inspect upstream workbook sheets that own assumptions feeding DCF/Economic analysis.
- [x] Run baseline validation before changing the DCF/Economic modules.

## Engine Work

- [x] Add typed DCF annual rows.
- [x] Add typed DCF summary, source references, bridge lines, WACC evidence, terminal diagnostics, and diagnostics.
- [x] Keep FCFF excluding financing.
- [x] Keep FCFE including debt drawdown and principal repayment.
- [x] Keep invalid IRR/MIRR/payback states explicit instead of fake zero.
- [x] Add typed annual economic rows.
- [x] Add typed economic summary, conversion assumptions, benefit/cost lines, source references, and diagnostics.
- [x] Use social discount rate for ENPV/EBCR/EIRR instead of financial WACC.
- [x] Separate benefits and costs before EBCR.
- [x] Remove transfer items from social cost treatment while showing the adjustment.
- [x] Mark missing CO2/carbon-price inputs honestly.

## UI Work

- [x] Replace generic valuation route content with a dedicated DCF report workbench.
- [x] Replace generic economic route content with a dedicated economic/social appraisal workbench.
- [x] Keep the pages Persian RTL and report-oriented.
- [x] Avoid duplicate editable upstream inputs in the result tabs.
- [x] Show eight management KPI cards in simple mode for each page.
- [x] Show bridges, source references, diagnostics, and annual tables in advanced mode.
- [x] Remove generic `Model inputs`/`Model impact` presentation from these two routes.
- [x] Remove raw workbook/internal route labels from these two routes.
- [x] Polish leftover English section captions while preserving standard finance abbreviations.

## Tests and Validation

- [x] Add DCF tests for annual-row reconciliation.
- [x] Add DCF tests proving FCFF excludes financing and FCFE includes financing.
- [x] Add Fisher real-rate and terminal-value consistency tests.
- [x] Add invalid terminal/payback/IRR-state tests.
- [x] Add UI source-text guards for the DCF workbench.
- [x] Add economic tests for annual rows, ENPV, EBCR, PV benefits, and PV costs.
- [x] Add social-rate-not-WACC test.
- [x] Add conversion-factor and missing-carbon tests.
- [x] Add UI source-text guards for the economic workbench.
- [x] Run `npm.cmd run lint`.
- [x] Run `npm.cmd run typecheck`.
- [x] Run `npm.cmd run test`.
- [x] Run `npm.cmd run build`.
- [x] Run local HTTP smoke for both routes.
- [x] Run browser smoke for simple/advanced valuation and economic views.

## Git and Handoff

- [x] Review git status and confirm whether pre-existing dirty Monte Carlo/global-style changes should be included or kept out of this commit.
- [x] Commit the DCF/Economic work if the repository state is safe.
- [ ] Push the safe branch/target if remote access is available and branch target is confirmed.
- [ ] Report exact commit hash, push target, validation results, and any deployment uncertainty.
