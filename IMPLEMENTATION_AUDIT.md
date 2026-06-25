# Implementation Audit

Date: 2026-06-24; updated 2026-06-25
Application source: `D:\InvestmentPlatform`
Live deployment: `https://investmentsbu.netlify.app/projects/solar-kerman/overview`
Workbook source of truth: `C:\Users\User\Desktop\edition19_4June.xlsx`
Implementation brief: `C:\Users\User\Downloads\investment_platform_audit_and_codex_prompt(1).md`

## 1. Executive finding

The repository is a functioning Next.js 16 / React / TypeScript financial-modeling application, not a static mock. It has typed assumptions, a central in-memory project context, calculation engines, validation traces, real sensitivity/Monte Carlo recalculation, multi-instrument financing UI, monthly construction cash flow, and Persian RTL dashboards. The baseline passes lint, typecheck, 27 tests, and production compilation.

At baseline, it was not yet bank/CFO/investor-grade. Several controls were visually complete but mathematically incomplete or disconnected:

- all six seeded scenarios currently clone the same assumptions; the editable scenario shock matrix is local UI state and is not applied to the calculation engine;
- accounting/tax depreciation methods are selectable but both books are calculated as straight-line;
- Murabaha, installment sale, and Ju'alah are labeled separately, but important repayment methods collapse to generic fixed/equal/bullet loan families;
- working capital omits accrued expenses and other current liabilities, and management ratios such as Quick Ratio and CCC are not published by the engine;
- report/export buttons do not create files and static counts are exposed as if they were model outputs;
- dashboard scoring is computed, but bank collateral/covenant coverage is not calculated from structured data;
- browser state is in memory only; refreshing resets edits and custom scenarios;
- DCF safely returns `null` for invalid IRR/MIRR, but it does not yet expose typed status/reason objects or FCFE;
- the financial-statement balance sheet can remain out of balance and only emits warnings.

## 1.1 Continuation implementation status, 2026-06-25

This audit is now both a baseline audit and an implementation ledger. The 2026-06-25 continuation did not restart from zero; it recovered the dirty worktree, validated the interrupted code, created the required master checklist/final report, and finished the next unfinished financing/construction linkage phase.

Completed and validated in this continuation:

- `src/lib/financial-math.ts` and `src/lib/format.ts` now guard spreadsheet-style errors, non-finite numbers, unsafe division, and typed NPV/IRR/MIRR/Payback status paths.
- `src/lib/depreciation-engine.ts`, `src/lib/phase-two-calculations.ts`, and `src/lib/tax-capex-engine.ts` now use real accounting/tax depreciation methods instead of silently treating every method as straight-line.
- `src/lib/working-capital-engine.ts` now calculates Current Assets minus Current Liabilities, annual Delta NWC, accrued expenses, other current liabilities, and final-year release.
- `src/lib/financing-engine.ts` now includes structured collateral/guarantee KPIs, Sharia-contract cost differences, generated drawdown schedules, and external CAPEX/progress/milestone drawdown drivers.
- `src/lib/construction-cashflow-engine.ts` now respects scheduled financing drawdowns in monthly construction cash flow when drawdown rows are available.
- `src/lib/scenario-engine.ts`, `src/store/project-context.tsx`, and `src/components/project/ScenarioManager.tsx` now make scenario adjustments part of scenario state, keep default scenarios distinct, and persist edits locally.
- `src/components/project/DecisionDashboard.tsx` now consumes real financing/statement/valuation outputs for bank and management KPI cards including collateral coverage, interest coverage, current ratio, quick ratio, and CCC.
- `src/lib/report-export.ts` and `src/components/project/ModulePage.tsx` now create actual CSV/Word/HTML downloads and a browser print flow for PDF instead of inert placeholder buttons.
- Deterministic tests were added for financial math, depreciation, tax, working capital, scenario assumptions, financing drawdown drivers, and scheduled construction debt drawdowns.

Validation status after the continuation changes:

- `npm.cmd run typecheck`: passed.
- `npm.cmd test`: passed, 39 tests.
- `npm.cmd run lint`: passed.
- `npm.cmd run build`: passed.
- Built-app browser smoke: passed on 26 project routes with no visible `NaN`, `undefined`, `null`, spreadsheet-style error tokens, stale export copy, or browser console errors.

Still not complete:

- Browser verification is still needed for actual report download/print artifacts and responsive visual acceptance; the full route visible-value smoke scan passed.
- Financial-statement balance-sheet tie-out remains warning-based and needs a deeper accounting reconciliation pass.
- FCFE, real-vs-nominal valuation presentation, richer sensitivity mapping, advanced Monte Carlo correlation, and a fully user-entered custom financing repayment table remain future/unfinished items.
- Iranian tax incentive defaults remain configurable modeling assumptions and need legal/business verification before being presented as authoritative law.

## 2. Evidence reviewed before implementation

### Workbook

All 25 sheets and all populated cells were scanned in formula and cached-value modes. The workbook contains 38,000+ populated cells, including 33,125 formulas in `MonteCarlo20`.

Confirmed workbook defects:

- broken named ranges `نوع` and `نوع_وثیقه` point to `MasterData04!#REF!`;
- cached `#N/A` values exist in `TaxDepreciation15!H73:O73` (with gaps at M/P-Q);
- cached `#NUM!` and `#VALUE!` exist in `DCF-Valuation17!R43:R44`;
- cached `#NUM!` propagates to `DashboardExecutive21!T10` and `ReportPack24!T10,T20`;
- sheet typos remain `MarcoAssumptions05` and `Sensivity19`;
- the workbook NWC arithmetic is Current Assets minus Current Liabilities although one workbook description is reversed.

### Live deployment

The deployed workspace loads successfully. The overview is connected to computed NPV, IRR, Payback, revenue, EBITDA margin, DSCR, construction liquidity, validations, funding mix, and statement/valuation outputs. It does not display spreadsheet error strings on the reviewed route. The deployed navigation and source route set match this repository.

### Baseline quality gates

- `npm.cmd run lint`: pass
- `npm.cmd run typecheck`: pass
- `npm.cmd test`: pass, 27/27
- `npm.cmd run build`: production compilation and TypeScript pass

## 3. Application architecture

| Layer | Current files | Current behavior | Finding / required change | Risk |
|---|---|---|---|---|
| Routes | `src/app/projects/[projectId]/**/page.tsx` | Thin route wrappers render `ModulePage`; 27 project routes exist. | Good structure. Keep route contracts stable. | Low |
| Navigation/module metadata | `src/lib/module-config.ts`, `src/lib/excel-map.ts` | Maps routes, sheets, fields, KPI paths, Basic/Advanced menus, and diagnostics. | Several statuses/guides are stale; OPEX ratio, overview debt, report/export counts need correction. | High |
| State/store | `src/store/project-context.tsx` | One React context owns project, active scenario, outputs, recalculation actions, and scenario CRUD. | Central in-session source of truth exists, but no durable persistence; generic path mutation can bypass synchronization. | High |
| Seed/model data | `src/lib/seed.ts` | Seeds one project, six system scenarios, workbook-like assumptions and editable items. | Six system scenarios currently have identical assumption clones; some are inactive. | Critical |
| Domain types | `src/lib/types.ts` | Broad typed model for project, assumptions, schedules, tax, financing, construction, statements, sensitivity and Monte Carlo. | Add scenario shock metadata/status results, WC liabilities/ratios, structured collateral/covenants, and typed DCF metric status. | High |
| Core orchestrator | `src/lib/calculations.ts` | Runs workbook flow from capacity through dashboards and validations. | Real calculations exist. Separate reusable financial math/selectors; fix statement/ratio/economic issues. | Critical |
| Phase 1 calculations | `src/lib/phase-one-calculations.ts` | Setup/macro/industry/market validation and synchronized assumptions. | Real and tested. Real/nominal parallel DCF remains a TODO. | Medium |
| Phase 2 calculations | `src/lib/phase-two-calculations.ts` | Capacity, direct cost, OPEX, CAPEX items and annual schedule. | CAPEX methods shown in UI are ignored; annual schedule duplicates depreciation logic. | Critical |
| Tax/depreciation | `src/lib/tax-capex-engine.ts` | Separate accounting/tax books, loss carry-forward, conditional incentives, tax credits. | Integrated into CAPEX and statements, but depreciation methods are ignored; free-zone/preferential timing and non-carrying credit need fixes. | Critical |
| Financing | `src/lib/financing-engine.ts` | Multi-instrument schedules, drawdown, grace cost behavior, fees, DSCR and aggregation. | Qard-al-Hasanah is fee-based. Murabaha/installment/Ju'alah/custom schedules are not sufficiently distinct; CAPEX/progress drawdown drivers remain TODO. | Critical |
| Construction cash flow | `src/lib/construction-cashflow-engine.ts` | Monthly CAPEX milestones, indexed/custom costs, delay, cash reserve, equity/debt, credit line and cash-crunch controls. | Strongest engine. Add explicit integration tests for live edits and financing drawdown linkage. | Medium |
| Formatting | `src/lib/format.ts` | Central Persian number/money/percent formatting with null/NaN fallback. | Guard all non-finite values and spreadsheet-error strings; add `safeNumber`/`safeDivide`. | High |
| Phase 1 UI | `src/components/phase-one/*` | Dedicated editable setup, macro, industry and market workspaces. | Real forms; preserve. | Low |
| Phase 2 UI | `src/components/phase-two/PhaseTwoWorkspaces.tsx` | Dedicated capacity, COGS, OPEX, multi-item CAPEX/tax and working-capital workspaces. | Large monolith; method controls currently overpromise engine behavior. | High |
| Financing UI | `src/components/project/FinancingWorkspace.tsx` | Multi-source instrument editor and schedule tables. | Real UI, but custom/instrument-specific schedule behavior needs engine completion and collateral structure. | Critical |
| Construction UI | `src/components/project/ConstructionCashFlowWorkspace.tsx` | Complete monthly editor, month chips, custom costs, controls and schedule. | Real/dynamic. Preserve and validate responsiveness. | Medium |
| Scenario UI | `src/components/project/ScenarioManager.tsx` | CRUD is shared with the header selector, but shock/timing/weight matrices are component-local. | Matrix explicitly contains a TODO and does not alter scenario assumptions or outputs. | Critical |
| Dashboards | `src/components/project/DecisionDashboard.tsx` | Executive, bank and management dashboards consume model outputs. | Core KPIs are real. Add ratios, collateral/covenants, computability reasons, and central selectors. | High |
| Generic/report UI | `src/components/project/ModulePage.tsx` | Renders generic KPIs/tables, methodology, master data, report and export surfaces. | Report/export actions are placeholders; static counts are injected by the store. | Critical |
| Premium UI system | `src/components/project/PremiumUi.tsx`, `src/styles/globals.css` | Glass cards, aligned grids, tables, status pills, dashboard system and responsive rules. | Solid base; polish after calculation truthfulness. CSS is oversized and should be changed conservatively. | Medium |
| Tests | `tests/*.test.ts` | 27 deterministic tests for phase-one, financing, construction and core recalculation. | Missing direct tax, depreciation-method, WC/ratios, scenario CRUD/shocks, IRR/MIRR and dashboard-selector suites. | High |

## 4. Route/module map against Excel

| Product module | Route / source UI | Engine/store source | Excel sheet | Current truthfulness | Main gap |
|---|---|---|---|---|---|
| Project setup | `/setup`, `ProjectSetupWorkspace` | context + phase-one | `ProjectSetup02` | Dynamic | No durable persistence |
| Methodology | `/methodology`, generic internal panel | traces + `excel-map.ts` | `MethodologyMap03` | Dynamic/read-only | Workbook sheet is nearly empty; app documentation is code-authored |
| Master data | `/master-data` | module config / hard-coded option arrays | `MasterData04` | Partly static | No editable centralized master-data store; broken names only diagnosed |
| Macro assumptions | `/macro`, `MacroWorkspace` | phase-one + context | `MarcoAssumptions05` | Dynamic | Real/nominal parallel outputs incomplete |
| Scenario manager | `/scenarios`, `ScenarioManager` | context CRUD | `ScenarioManager06` | Partly fake/disconnected | Shock matrix does not persist or recalculate scenarios |
| Industry template | `/industry-template` | phase-one + context | `IndustryTemplate07` | Dynamic | Good downstream DSO/DPO lock |
| Market demand | `/market-demand` | phase-one/core | `MarketDemand08` | Dynamic | Scenario effects absent |
| Capacity/production | `/capacity-production` | phase-two/core | `CapacityProduction09` | Dynamic | Scenario effects absent |
| Revenue | `/revenue`, generic panel | core | workbook bridge | Dynamic | No separate product-mix / knowledge-income schedule |
| Direct cost / COGS | `/direct-costs` | phase-two/core | `COGS-DirectCost10` | Dynamic | Scenario effects absent |
| OPEX | `/opex` | phase-two/core | `Opex-Indirect11` | Dynamic | Generic KPI maps amount as a percent |
| CAPEX | `/capex`, `CapexWorkspace` | phase-two + tax engine | `Capex12` + `TaxDepreciation15` | Dynamic but incomplete | Non-straight-line methods ignored |
| Working capital | `/working-capital` | core + context | `WorkingCapital13` | Dynamic | Missing accrued expenses/other current liabilities and ratios |
| Financing | `/financing` | financing engine | `Financing14` | Dynamic but incomplete | Sharia/custom behavior and external drawdown drivers incomplete |
| Construction cash flow | `/construction-cashflow` | construction engine | `ConstructionCashFlow` | Dynamic/monthly | Verify all browser edit paths; financing timing integration |
| Financial statements | `/financial-statements` | core | `FinancialStatements16` | Dynamic | Balance sheet can remain out of balance; missing published ratios |
| DCF valuation | `/valuation` | core math | `DCF-Valuation17` | Dynamic/safe | Typed status/reasons, FCFE, robust reusable MIRR helper needed |
| Economic analysis | `/economic-analysis` | core | `EconomicAnalysis18` | Dynamic but simplified | EBCR is ENPV/CAPEX, not PV benefits/PV costs |
| Sensitivity | `/sensitivity` | core + workbench | `Sensivity19` | Dynamic | Variable mapping is string-based and fragile |
| Monte Carlo | `/monte-carlo` | core | `MonteCarlo20` | Dynamic/on-demand | Needs direct tests and correlation is deferred |
| Executive dashboard | `/dashboard/executive` | `DecisionDashboard` | `DashboardExecutive21` | Dynamic | Computability reasons and selector audit trail |
| Bank dashboard | `/dashboard/bank` | `DecisionDashboard` | `DashboardBank22` | Dynamic but incomplete | Structured collateral/covenants, coverage ratios, interest coverage |
| Management dashboard | `/dashboard/management` | `DecisionDashboard` | `DashboardManagement23` | Dynamic but incomplete | Quick/current ratios, DSO/DPO/DIO/CCC, WC turnover |
| Report pack | `/report` | generic report panel | `ReportPack24` | Narrative real; actions placeholder | No real export artifact |
| Exports | `/exports` | generic report panel | `ReportPack24` | Placeholder | Buttons have no action; static format count |

## 5. Calculation dependency map

```text
ProjectSetup
  -> Macro / Industry / model horizon / dates
IndustryTemplate
  -> Capacity defaults
  -> Market unit
  -> WorkingCapital locked DSO/DPO
Scenario (active scenarioId)
  -> all assumptions (currently no applied shock metadata)
MarketDemand + CapacityProduction
  -> Revenue
Production + DirectCost items + Macro FX/inflation
  -> COGS
Revenue + Production + OPEX drivers
  -> OPEX
CAPEX items + Macro FX/inflation
  -> CAPEX schedule
  -> Accounting depreciation
  -> Tax depreciation
  -> Construction monthly CAPEX
Revenue + COGS + OPEX + WC timing
  -> NWC and Delta NWC
Financing instruments + drawdowns + grace/repayment rules
  -> Debt service / closing debt / financing cost
Revenue + COGS + OPEX + depreciation + tax + WC + financing
  -> Financial statements / CFADS / DSCR / FCFF
FCFF + WACC + terminal assumptions
  -> NPV / IRR / MIRR / Payback
Statements + financing + construction + valuation
  -> Dashboard selectors / warnings / report narrative
```

## 6. Dashboard KPI source map

| KPI | Current source | Status | Required action |
|---|---|---|---|
| Revenue | `statements.rows[n].revenue` | Correct | Keep selector centralized |
| COGS / direct cost | `statements.rows[n].cogs` | Correct in dashboards | Fix generic OPEX ratio mapping and add selector tests |
| Gross Margin | `grossProfit / revenue`, stored as `grossMargin` | Correct | Add zero-revenue test |
| EBITDA margin | `ebitda / revenue` in component | Correct but duplicated | Move to selector/safe divide |
| NPV | `valuation.npv` | Correct | Add typed status when terminal assumptions invalid |
| IRR/MIRR | valuation helpers | Safe null, incomplete status | Export typed helper and reason |
| DSCR | `CFADS / debtService` | Correct at annual aggregate | Add instrument/bank selector tests and zero-service reason |
| Total debt | financing assumptions in dashboard | Potentially stale | Use financing-engine KPI total debt |
| Debt share | assumptions in component | Potentially stale | Use financing-engine KPI debt share |
| Collateral coverage | not calculated | Missing | Add structured collateral value and selector |
| Current/Quick ratio | not published | Missing | Add to annual statement/management selector |
| DIO/DSO/DPO/CCC | assumptions/rows exist partly | Missing | Add management selector and formula tests |
| Bankability / readiness | rule-based scores in `calculations.ts` | Dynamic but opaque | Publish components/reasons and trace |
| Report section/export counts | static synthetic values | Fake | Remove or derive from actual registry/artifacts |

## 7. Implementation priorities and acceptance criteria

### Phase 1: critical truth and safety

- robust `safeNumber`, `safeDivide`, and non-finite/error-string formatting;
- typed IRR/MIRR/Payback results while keeping backward-compatible numeric fields;
- fix incorrect/stale generic KPI paths and derive all dashboard KPI values from selectors;
- remove fake report/export counts and clearly disable unavailable actions;
- add tests for invalid cash-flow patterns and zero denominators.

### Phase 2: financial-model completion

- implement accounting/tax depreciation methods or remove unsupported choices;
- fix tax-credit carry-forward timing and incentive windows;
- add accrued expenses and other current liabilities to NWC;
- make Murabaha, installment sale and Ju'alah schedules materially distinct;
- correct economic benefit-cost calculation;
- add structured bank collateral/covenant metrics.

### Phase 3: cross-tab state

- store typed scenario shocks/timing/weights on each scenario;
- generate distinct default scenario assumptions and apply edits to the selected scenario;
- keep header selector and manager CRUD/fallback behavior unified;
- add durable local persistence with schema versioning;
- connect CAPEX/progress drawdown options to actual external drivers or label them unavailable.

### Phase 4/5: dashboards, reports and UI

- publish real bank and management ratio selectors;
- expose audit/reason panels for unavailable metrics;
- implement an actual browser-downloadable report/export artifact or disable the controls honestly;
- finish responsive table/browser QA after model changes.

## 8. Risks and assumptions

- Iranian tax incentive periods/rates are configurable model assumptions, not legal advice. Defaults must never be presented as universally applicable law.
- The workbook itself contains broken outputs; parity means preserving its business flow while correcting documented defects, not copying cached errors.
- The seed project is sample data. The product must label it as a sample project until persistence/import/create-project workflows exist.
- Large monolithic UI files and a 5,990-line stylesheet increase regression risk. Calculation work should land in pure helpers with focused tests before UI changes.
- The live deployment is a verification target only; `D:\InvestmentPlatform` is the implementation source of truth for this change.
