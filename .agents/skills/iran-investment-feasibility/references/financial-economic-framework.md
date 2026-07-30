# Financial and Economic Feasibility Framework

## 1. Perspectives and cash-flow families

| Perspective | Typical cash flow | Typical decision outputs | Financing flows included? |
|---|---|---|---|
| Project / total investment | FCFF or project free cash flow | Project NPV, project IRR, payback | No debt draw/principal; financing effect enters discounting or separate analysis |
| Equity investor | FCFE / equity cash flow | Equity NPV, equity IRR, dividend capacity | Yes, debt draw, principal, interest, fees as appropriate |
| Lender | debt-service schedule | DSCR, LLCR, PLCR, covenant headroom | Focused on scheduled debt service and available cash |
| Financial statements | accrual statements + cash-flow statement | profit, balance-sheet integrity, liquidity ratios | Yes, according to accounting presentation |
| Economic / national welfare | economic resource-benefit cash flow | ENPV, EIRR, EBCR, economic payback | Financing is normally a transfer, not an economic resource cost |

Never compare an IRR from one perspective with a hurdle rate from another.

## 2. Nominal and real consistency

Use one coherent basis:
- nominal/current cash flows with a nominal discount rate;
- real/constant cash flows with a real discount rate.

When converting a nominal rate `n` and expected inflation `i` to a real rate `r`, use the consistent Fisher relationship rather than simple subtraction when material:

`1 + r = (1 + n) / (1 + i)`

Document whether inflation is general, category-specific, domestic, foreign, or embedded in FX assumptions.

## 3. Currency consistency
- Record transaction currency, reporting/base currency, FX rate type, rate date/path, and unit scale.
- Convert at the correct period and rate convention.
- Avoid converting the same stream in both an upstream schedule and downstream report.
- Distinguish accounting translation, cash conversion, and economic shadow-FX adjustment.
- Rial/toman conversion must be explicit and never inferred from the magnitude alone.

## 4. Core DCF controls
- Define project start, construction periods, operating horizon, and cash-flow timing.
- Separate CAPEX, operating cash flow, working capital, tax, financing, residual value, and decommissioning.
- Reconcile opening and closing working capital and release at the chosen terminal point.
- Use after-tax discounting with after-tax cash flows unless a documented alternative is applied consistently.
- Ensure WACC weights, costs, tax shield, and valuation perspective match.
- Do not let display rounding enter valuation calculations.
- Validate sign patterns before IRR; where multiple sign changes exist, show NPV and MIRR or an NPV profile.

## 5. Financing and bankability
Possible lender outputs include:
- debt draw and repayment schedule;
- interest during construction;
- grace period and capitalization treatment;
- debt service;
- cash available for debt service;
- DSCR by period and minimum/average DSCR;
- LLCR/PLCR when supported;
- refinancing or balloon exposure;
- covenant and reserve-account headroom.

Definitions must be explicit. Do not label a generic cash-flow ratio as DSCR without a clear numerator and denominator.

## 6. Financial-to-economic bridge
Economic analysis should be constructed by item classification, not by applying one blanket factor.

### Common classifications
- tradable goods and services;
- non-tradable goods and services;
- skilled and unskilled labor;
- land and natural resources;
- taxes, duties, subsidies, and other transfers;
- financing flows;
- external costs and benefits;
- residual value.

### Typical treatment principles
- Taxes, duties, and subsidies may be transfers from the national perspective, but treatment depends on the chosen methodology and boundary.
- Tradables may require border-parity valuation and a shadow exchange rate or SERF.
- Non-tradables may use item-specific factors or a standard conversion factor (SCF).
- Labor may use skill-, region-, and employment-condition-specific shadow wage factors rather than a universal SWRF.
- Land should reflect opportunity cost, not automatically the accounting purchase price or zero.
- Financing drawdowns, repayments, and interest are generally transfers in economic analysis, though resource costs of financial intermediation may be treated separately under a defined method.

## 7. Economic indicators

### ENPV
Present value of incremental economic benefits minus incremental economic costs discounted at EOCK.

Decision rule: ENPV greater than zero supports economic justification under the modeled assumptions.

### EIRR
The rate at which ENPV equals zero, subject to the same root/existence cautions as financial IRR.

Decision rule: compare EIRR with EOCK using a consistent convention.

### EBCR
Present value of economic benefits divided by present value of economic costs.

Decision rule: EBCR greater than one supports economic justification, but the result depends on consistent classification of net benefits versus gross benefits/costs.

### Economic payback
Time required for cumulative undiscounted or discounted economic net benefits to recover economic investment. Label which definition is used.

## 8. Externalities and additional benefits
Include only when all are true:
1. incremental to the without-project case;
2. attributable to the project;
3. measurable with a documented method;
4. valued in a consistent price basis;
5. not already captured in revenue, avoided cost, shadow pricing, or another benefit line;
6. timing and affected population are defined.

Examples may include emissions, reliability, congestion, learning spillovers, public-health effects, or strategic resilience. Their inclusion is project-specific, not automatic.

## 9. Double-counting checks
Check that:
- VAT/tax removal is not repeated across both source schedules and the economic bridge;
- FX shadow adjustment is not applied to items already valued at economic border prices;
- labor adjustment is not applied again within a blanket SCF;
- avoided cost is not also included as revenue uplift;
- residual value is not included both in terminal cash flow and asset sale proceeds;
- working-capital release is not duplicated;
- inflation is not included in both real cash flows and a nominal discount rate.

## 10. Minimum management interpretation
Each important KPI should answer:
- What is the result?
- What is the decision threshold?
- Which perspective does it represent?
- What are the top drivers?
- Which assumptions are uncertain, stale, or policy-dependent?
- What action follows if the result deteriorates?
