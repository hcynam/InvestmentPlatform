---
name: iran-investment-feasibility
description: Design, review, or implement project-feasibility, project-finance, banking, DCF, and economic-analysis logic for this Iranian COMFAR-like platform. Use for NPV/IRR/MIRR/WACC/FCFF/FCFE, financing and debt-service metrics, inflation and FX treatment, nominal-versus-real modeling, tax/depreciation assumptions, ENPV/EIRR/EBCR, shadow pricing, transfer payments, externalities, Iran-specific source governance, or management/bank interpretation. Do not use for routine UI work, deployment, generic accounting questions, or workbook tracing without a domain-methodology decision.
---

# Iran Investment Feasibility

Apply finance and economic-analysis logic consistently, transparently, and without embedding short-lived Iranian rates as permanent truths.

## 1. Identify the decision perspective
Before changing formulas, determine which perspective the output serves:
- project / total investment;
- equity investor;
- lender / debt service;
- financial statements;
- national economic / social welfare.

Do not mix cash flows, discount rates, or decision rules across perspectives.

Read `references/financial-economic-framework.md` for methodology.
Read `references/iran-source-governance.md` whenever a value depends on Iranian law, regulation, market data, official rates, or dated policy.

## 2. Lock dimensions before calculation
For every significant input and output, know:
- currency and unit scale;
- rial versus toman;
- nominal/current versus real/constant price basis;
- construction month or operating year;
- base date and effective date;
- scenario;
- pre-tax or after-tax;
- project, equity, lender, or economic perspective.

Reject or warn on ambiguous dimensions rather than guessing silently.

## 3. Keep financial and economic analysis separate
Financial analysis measures returns and liquidity to actual capital providers using market/contract cash flows.

Economic analysis measures incremental resource costs and benefits to the economy using economic values, excluding transfer payments where methodologically appropriate and applying conversion/shadow factors where justified.

Never convert a financial cash flow to an economic cash flow with a single unexplained multiplier.

## 4. Apply core consistency rules
- Match nominal cash flows with nominal discount rates and real cash flows with real discount rates.
- Keep inflation treatment explicit by cost/revenue category when material.
- Avoid double-counting inflation in both forecast amounts and discount-rate conversion.
- Separate operating performance from financing flows.
- Do not include debt drawdown or principal repayment in FCFF.
- Keep equity cash flow and lender metrics derived from the appropriate financing schedule.
- Treat working-capital investment and release consistently.
- Define terminal/residual value and decommissioning explicitly.
- Define year-zero and end-period/mid-period timing conventions.
- Do not rely on Excel-style IRR alone when cash-flow sign changes make multiple or missing roots possible; surface validation and use MIRR/NPV profile where appropriate.

## 5. Handle Iran-specific assumptions as governed data
Changing values such as tax rates, VAT, insurance, customs duties, regulated prices, loan rates, wage rules, FX rates, and exemptions must be model inputs with source metadata—not constants buried in code or this skill.

Required metadata and source hierarchy are in `references/iran-source-governance.md`.

## 6. Economic-analysis discipline
For ENPV/EIRR/EBCR and economic cash flow:
- start from incremental project resources and benefits;
- classify items as tradable, non-tradable, labor, land, transfer, externality, or financing;
- remove transfer payments only when the chosen economic methodology requires it;
- use item-specific conversion factors when available and defensible;
- use SCF/SERF/SWRF only with documented definitions and scope;
- include externalities only when incremental, measurable, attributable, and not already embedded in another benefit/cost;
- avoid counting the same benefit as revenue uplift, avoided cost, and externality simultaneously;
- document the economic discount rate (EOCK) and its basis.

## 7. Design for Iranian managers and banks
Outputs must support action, not only display formulas.

Where relevant, present:
- result and decision threshold;
- base/upside/downside interpretation;
- key value drivers;
- liquidity and debt-service risks;
- assumption freshness and source quality;
- a concise warning when a conclusion depends heavily on regulated prices, FX policy, exemptions, or refinancing assumptions.

Simple mode should explain decisions in plain Persian. Advanced mode should expose schedules, assumptions, formula trace, and diagnostics while using the same engine.

## 8. Implement conservatively
- Reuse the existing domain engine and types.
- Keep law/policy data out of UI components.
- Do not add a new KPI unless its definition, perspective, units, and decision use are clear.
- Do not fabricate missing Iranian data. Use an explicit user assumption or unresolved-data state.
- For current legal, regulatory, banking, tax, wage, customs, or FX facts, verify against current authoritative sources before treating them as defaults.

## 9. Verify and communicate
Use a small representative scenario to verify:
- cash-flow identity and sign convention;
- discount-rate/price-basis consistency;
- financing separation;
- unit and currency conversion;
- decision threshold behavior;
- no double-counting in economic adjustments.

Return a concise note containing:
- methodology decision;
- affected formula/owner;
- source status for variable Iranian assumptions;
- targeted verification;
- unresolved judgment or data dependency.
