# Implementation Master Checklist

Date: 2026-06-25
Repository: `D:\InvestmentPlatform`
Reference workbook: `C:\Users\User\Desktop\edition19_4June.xlsx`
Audit prompt: `C:\Users\User\Downloads\investment_platform_audit_and_codex_prompt(1).md`
Continuation prompt: `C:\Users\User\.codex\attachments\1830b2a6-b0f2-436c-8924-9c06982f06c1\pasted-text.txt`

## Status legend

- Done: implemented in code and validated by a relevant command or deterministic test in this worktree.
- Partially done: implementation exists, but coverage, parity, browser verification, or one or more subrequirements remain.
- Not done: no meaningful implementation found yet.
- Not applicable: requirement does not apply to the current repository/product scope.
- Needs user verification: code exists, but the result needs manual/browser/product-owner confirmation before it can honestly be called complete.

## Phase gate log

### Phase 0 - Recovery and current-state audit

Objective: recover the interrupted work without overwriting prior changes.

Files inspected:

- `D:\InvestmentPlatform\IMPLEMENTATION_AUDIT.md`
- `D:\InvestmentPlatform\src\lib\calculations.ts`
- `D:\InvestmentPlatform\src\lib\financial-math.ts`
- `D:\InvestmentPlatform\src\lib\depreciation-engine.ts`
- `D:\InvestmentPlatform\src\lib\working-capital-engine.ts`
- `D:\InvestmentPlatform\src\lib\financing-engine.ts`
- `D:\InvestmentPlatform\src\lib\construction-cashflow-engine.ts`
- `D:\InvestmentPlatform\src\lib\scenario-engine.ts`
- `D:\InvestmentPlatform\src\store\project-context.tsx`
- `D:\InvestmentPlatform\src\components\project\DecisionDashboard.tsx`
- `D:\InvestmentPlatform\src\components\project\ScenarioManager.tsx`
- `D:\InvestmentPlatform\src\components\project\FinancingWorkspace.tsx`
- `D:\InvestmentPlatform\src\components\project\ModulePage.tsx`
- `D:\InvestmentPlatform\src\lib\report-export.ts`
- `D:\InvestmentPlatform\tests\financial-model-guards.test.ts`
- `D:\InvestmentPlatform\tests\financing-engine.test.ts`

Smallest safe action taken: no code changes; confirmed the real repo is `D:\InvestmentPlatform`, reviewed changed/untracked files, and checked the interrupted financing-driver patch.

Validation:

- `npm.cmd run typecheck`: passed
- `npm.cmd test`: passed, 37 tests
- `npm.cmd run lint`: passed

Outcome: Done.

### Phase 1 - Traceability scaffold

Objective: create the required checklist/report before continuing implementation.

Files edited:

- `D:\InvestmentPlatform\IMPLEMENTATION_MASTER_CHECKLIST.md`
- `D:\InvestmentPlatform\FINAL_IMPLEMENTATION_REPORT.md`

Smallest safe action taken: added this checklist and a resumable implementation report with conservative statuses.

Validation:

- Report/checklist content review only at creation time.

Outcome: Done.

### Phase 2 - Financing drawdown and construction cash-flow linkage

Objective: finish the interrupted linkage between generated financing drawdown schedules and monthly construction cash flow.

Files inspected/edited:

- `D:\InvestmentPlatform\src\lib\financing-engine.ts`
- `D:\InvestmentPlatform\src\lib\construction-cashflow-engine.ts`
- `D:\InvestmentPlatform\src\lib\calculations.ts`
- `D:\InvestmentPlatform\tests\financing-engine.test.ts`
- `D:\InvestmentPlatform\tests\construction-cashflow-engine.test.ts`

Smallest safe action taken:

- Added a financing test proving `drawdownModel: "capexPercent"` uses external CAPEX driver weights instead of stale manual drawdown rows.
- Added a construction test proving scheduled financing drawdowns are injected into the matching construction month and do not fall back to need-based drawdown in other months.
- No production calculation patch was required for these two behaviors; the interrupted code already satisfied the new tests.

Validation:

- `npm.cmd run typecheck`: passed
- `npm.cmd test`: passed, 39 tests
- `npm.cmd run lint`: passed

Outcome: Done.

### Phase 3 - Report export popup hardening

Objective: keep report/export controls real and make the PDF print flow safer in browser contexts.

Files inspected/edited:

- `D:\InvestmentPlatform\src\lib\report-export.ts`

Smallest safe action taken:

- Changed the PDF print popup to open a writable same-origin blank window first, then set `opener = null` before writing the report HTML and calling print.

Validation:

- `npm.cmd run typecheck`: passed
- `npm.cmd run lint`: passed

Outcome: Done, with manual browser verification still required for actual popup/download behavior.

### Phase 4 - Final validation and browser smoke

Objective: prove the repository remains buildable and the built app does not visibly expose invalid financial values.

Files inspected/edited:

- `D:\InvestmentPlatform\IMPLEMENTATION_AUDIT.md`
- `D:\InvestmentPlatform\IMPLEMENTATION_MASTER_CHECKLIST.md`
- `D:\InvestmentPlatform\FINAL_IMPLEMENTATION_REPORT.md`
- `D:\InvestmentPlatform\src\lib\excel-map.ts`
- `D:\InvestmentPlatform\src\lib\module-config.ts`
- `D:\InvestmentPlatform\src\lib\financing-engine.ts`

Smallest safe action taken:

- Sanitized raw spreadsheet-error tokens in exported Excel diagnostics so user-facing diagnostics describe invalid workbook references without rendering Excel error tokens.
- Removed stale export copy that said real export connection would happen in a later phase.
- Replaced the user-facing custom-financing `TODO(...)` label with an explicit unfinished-feature warning.
- Ran the full required validation stack and a built-app browser smoke scan.

Validation:

- `npm.cmd run typecheck`: passed
- `npm.cmd test`: passed, 39 tests
- `npm.cmd run lint`: passed
- `git diff --check`: passed, with only CRLF normalization warnings
- `npm.cmd run build`: passed
- Built app smoke on `http://localhost:3000/projects/solar-kerman/*`: 26 project routes scanned, no visible `NaN`, `undefined`, `null`, `#N/A`, `#NAME`, `#NUM`, `#VALUE`, `#REF`, `Infinity`, stale export copy, missing main landmark, 404, or console errors.

Outcome: Done.

## Master requirement checklist

| Requirement | Status | Evidence / notes | Remaining work |
|---|---|---|---|
| Excel reference consistency | Partially done | Workbook sheets/errors were audited in `IMPLEMENTATION_AUDIT.md`; calculations preserve workbook flow while avoiding cached Excel errors. | More formula-level parity tests are needed for all 25 sheets. |
| CAPEX logic | Partially done | `src/lib/phase-two-calculations.ts` calculates per-item CAPEX and annual schedules; CAPEX feeds core engine. | More browser/edit-path validation and fixed-asset balance tie-out remain. |
| Accounting depreciation | Done | `src/lib/depreciation-engine.ts` and `tests/financial-model-guards.test.ts` validate straight-line, declining, and immediate methods. | None for the implemented methods. |
| Tax depreciation | Done | CAPEX/tax schedule uses the same depreciation helper for tax book and direct tests cover depreciation methods. | More Excel parity cases by asset class remain. |
| Iranian tax incentives | Partially done | `src/lib/tax-capex-engine.ts` includes configurable incentive types and audit rows. | Must not be treated as legal advice; more real legal edge cases need product/legal verification. |
| Knowledge-based revenue-only incentive | Done | `tests/financial-model-guards.test.ts` verifies approved knowledge revenue share limits the exemption. | None for current configurable model. |
| Free zone activity-only incentive | Partially done | Engine has free-zone inside-activity share and permit fields. | Needs direct deterministic test and business/legal verification. |
| Less-developed region time-limited incentive | Partially done | Engine has less-developed eligibility share, start year, and zero-rate years. | Needs direct deterministic test and legal/product verification. |
| Preferential tax rate visibility and logic | Partially done | UI field visibility is conditional in CAPEX tax panel; engine supports preferential rate/share/years. | Needs direct deterministic test and browser verification. |
| Investment tax credit after tax calculation | Done | `tests/financial-model-guards.test.ts` verifies credit is applied after gross tax. | None for current model. |
| Tax loss carryforward | Done | `tests/financial-model-guards.test.ts` verifies loss carry-forward into later taxable income. | None for current model. |
| Working capital formula: Current Assets - Current Liabilities | Done | `src/lib/working-capital-engine.ts` and tests verify NWC equals current assets minus liabilities. | None for current formula. |
| Annual ΔNWC | Done | `src/lib/working-capital-engine.ts` calculates `changeInWorkingCapital`; consumed by statements/DCF. | Additional statement tie-out tests would strengthen coverage. |
| Final-year NWC release | Done | `src/lib/working-capital-engine.ts` releases NWC to zero in final year when enabled; direct test exists. | None for current model. |
| Receivable/payable days from IndustryTemplate | Done | `src/lib/scenario-engine.ts` and WC workspace use industry DSO/DPO as locked source values. | Browser verification of the locked display remains useful. |
| ScenarioManager as single source of truth | Done | `src/components/project/ScenarioManager.tsx` edits scenario adjustments through `src/store/project-context.tsx`; active selector uses scenario IDs. | Add UI/integration tests when available. |
| Default scenarios: Base, Optimistic, Pessimistic, FX Shock, Inflation Shock, Execution Delay | Done | `src/lib/seed.ts` seeds all six defaults with distinct adjustments and active statuses. | More scenario output comparison tests can be added. |
| Custom scenario add/delete behavior | Partially done | Store and ScenarioManager implement add/delete and protect default scenarios. | Needs browser verification for UX and persistence. |
| Multi-source financing | Done | `src/lib/financing-engine.ts` aggregates multiple active instruments; tests cover multi-instrument aggregation. | More UI edit-path validation remains. |
| Shareholder equity | Done | Financing assumptions and construction engine consume equity funding. | More explicit equity schedule tests would help. |
| Simple bank loan | Done | Financing tests validate fixed installment/equal principal/bullet loan behavior. | None for current model. |
| Qard-al-Hasanah fee/commission logic | Done | Financing test verifies it is fee-based rather than compounding interest. | None for current model. |
| Murabaha logic | Done | Financing tests verify Murabaha fixed contract cost behavior. | More product-specific amortization variants can be added later. |
| Installment sale logic | Partially done | Financing engine distinguishes installment sale defaults and repayment families. | Needs direct deterministic installment-sale test. |
| Ju'alah logic | Done | Financing tests verify Ju'alah contract fee differs from Murabaha/installment reducing-balance loan logic. | None for current model. |
| Custom financing method | Partially done | Custom instrument type is preserved and schedulable, with warnings/fallback behavior. | Needs richer custom schedule editing and tests. |
| Drawdown schedule | Done | Financing engine supports manual and generated drawdown models; `tests/financing-engine.test.ts` verifies external CAPEX drivers override stale manual rows for non-manual models. | None for current implemented models. |
| Principal repayment schedule | Done | Financing tests validate fixed, equal-principal, bullet, and aggregate schedules. | More method-specific edge tests are optional. |
| Interest/profit/fee schedule | Done | Financing tests cover loan interest, qard fee, grace behavior, and Sharia contract cost logic. | More UI display validation remains. |
| Debt balance | Done | Financing tests validate closing balance behavior and remaining debt by selected year. | None for current model. |
| Debt service | Done | Financing schedule aggregates principal, cost, fees, and total debt service. | None for current model. |
| DSCR | Done | DSCR comes from real CFADS/debt service; tests validate null on zero debt service. | Additional dashboard selector tests remain. |
| Construction monthly cash flow | Done | `src/lib/construction-cashflow-engine.ts` calculates monthly CAPEX, costs, funding, crunch, credit line, and scheduled debt drawdowns; `tests/construction-cashflow-engine.test.ts` verifies the linkage. | Browser edit-path verification remains separately listed under responsive/UI verification. |
| CAPEX payment timing | Done | Construction engine uses milestone/month timing and tests cover milestone CAPEX. | More browser edit-path validation remains. |
| Inflation/FX in construction phase | Done | Construction tests cover monthly inflation and FX adjustment. | None for current model. |
| Cash crunch | Done | Construction tests cover cash crunch and credit-line coverage. | None for current model. |
| Development credit line | Done | Construction tests verify credit line use to cover construction cash crunch. | None for current model. |
| Financial statements | Partially done | Core statements are generated with ratios and consume tax/WC/financing. | Balance sheet can still warn/out-of-balance; more tie-out tests remain. |
| DCF | Partially done | Core calculates FCFF-based DCF and typed metrics. | FCFE and more terminal/real-nominal parity remain. |
| NPV | Done | `src/lib/financial-math.ts` and tests validate NPV helper. | None for current helper. |
| IRR edge cases | Done | `src/lib/financial-math.ts` returns typed status/reason; tests cover no-sign-change case. | Multiple-root display/audit can be expanded. |
| MIRR edge cases | Done | `src/lib/financial-math.ts` validates MIRR inputs/sign patterns; tests cover non-computable case. | More boundary tests optional. |
| Payback | Partially done | Payback helper and typed metric are integrated into valuation. | Needs direct deterministic payback test. |
| Sensitivity | Partially done | Sensitivity workbench and core recalculation exist. | Variable mapping remains string-based/fragile; more tests needed. |
| Monte Carlo | Partially done | Monte Carlo recalculates scenarios and reports risk metrics. | Advanced distributions/correlation and tests remain. |
| Executive dashboard | Partially done | Dashboard consumes valuation/financing/statement outputs and displays IRR reasons. | Needs browser QA and selector tests. |
| Bank dashboard | Partially done | Bank dashboard uses real debt/DSCR/collateral/interest-coverage metrics. | Needs browser QA and covenant detail tests. |
| Management dashboard | Partially done | Management dashboard now shows current/quick ratios, CCC, WC turnover, and operating KPIs. | Needs browser QA and accessibility/responsive checks. |
| KPI truthfulness | Partially done | Fake report/export counts removed; major dashboard cards use engine outputs; built-app route scan found no invalid visible values. | Central KPI selectors/tests still incomplete. |
| Report pack | Partially done | `src/lib/report-export.ts` creates CSV/Word/HTML downloads and a PDF print flow; popup creation was hardened and stale export copy was removed. | Actual download/print artifacts still need manual browser verification. |
| Safe display: no NaN/undefined/null/#NUM-like/#VALUE-like/#NAME-like values | Done | Helpers guard unsafe values, tests cover them, and the built app smoke scan checked 26 project routes with no visible invalid-value tokens or console errors. | Continue to enforce on future new routes/components. |
| Persian labels and typo fixes | Partially done | WC source wording uses تامین‌کنندگان and audit documents workbook sheet typos. | Full Persian typo pass remains. |
| Premium glassmorphism SaaS UI | Needs user verification | Existing premium UI/CSS system remains; no broad cosmetic rewrite was done in this phase. | Browser/product-owner visual acceptance needed. |
| Consistent card heights | Needs user verification | Existing `PremiumUi`/CSS aligned-card system exists. | Needs responsive browser verification. |
| Responsive behavior | Needs user verification | CSS has responsive rules; not fully browser-tested in this continuation yet. | Test desktop/tablet/mobile layouts. |
| Tests or deterministic validation cases | Done | Test suite increased to 39 tests covering finance, tax, depreciation, WC, scenario, construction, and core calculations. | More UI/integration tests can be added later. |
| lint/typecheck/build | Done | `npm.cmd run typecheck`, `npm.cmd test`, `npm.cmd run lint`, `git diff --check`, and `npm.cmd run build` all passed. | None for this handoff. |
| Final implementation report | Done | `FINAL_IMPLEMENTATION_REPORT.md` exists and was updated after final validation/build. | Keep it current in future phases. |

## Current changed/untracked implementation files

Modified tracked files:

- `IMPLEMENTATION_AUDIT.md`
- `src/components/phase-two/PhaseTwoWorkspaces.tsx`
- `src/components/project/DecisionDashboard.tsx`
- `src/components/project/FinancingWorkspace.tsx`
- `src/components/project/ModulePage.tsx`
- `src/components/project/ScenarioManager.tsx`
- `src/lib/calculations.ts`
- `src/lib/construction-cashflow-engine.ts`
- `src/lib/financing-engine.ts`
- `src/lib/format.ts`
- `src/lib/module-config.ts`
- `src/lib/phase-two-calculations.ts`
- `src/lib/seed.ts`
- `src/lib/tax-capex-engine.ts`
- `src/lib/types.ts`
- `src/store/project-context.tsx`
- `tests/financing-engine.test.ts`
- `tsconfig.tsbuildinfo`

Untracked implementation files:

- `src/lib/depreciation-engine.ts`
- `src/lib/financial-math.ts`
- `src/lib/report-export.ts`
- `src/lib/scenario-engine.ts`
- `src/lib/working-capital-engine.ts`
- `tests/financial-model-guards.test.ts`
