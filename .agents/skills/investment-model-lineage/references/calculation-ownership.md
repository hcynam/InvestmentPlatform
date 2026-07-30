# Calculation Ownership Contract

## Architectural rule
Each business value has one authoritative producer. Other layers may validate, transform for display, aggregate, or export it, but must not independently recreate its domain formula.

## Layer responsibilities

| Layer | Owns | Must not own |
|---|---|---|
| Inputs / assumptions | user-entered or sourced values, metadata, scenario overrides | derived financial KPIs |
| Reference / master data | enumerations, units, classifications, reusable parameters | project-specific calculated results |
| Calculation engine | formulas, schedules, deterministic transformations, model validation | presentation formatting |
| Scenario orchestration | selection and application of scenario overrides | duplicate business formulas |
| Application state / selectors | canonical storage and retrieval of inputs/results | parallel calculation logic |
| UI workbench | editing, explanation, warnings, display and drill-down | hidden independent formulas |
| Dashboard | aggregation and decision presentation from canonical outputs | recalculating NPV, IRR, DSCR, ENPV, etc. |
| Report/export | formatting and packaging approved outputs | becoming a separate model |

## Expected workbook-to-web dependency order

### Foundations and inputs
1. `ReadMe01`
2. `ProjectSetup02`
3. `MethodologyMap03`
4. `MasterData04`
5. `MarcoAssumptions05`
6. `ScenarioManager06`
7. `IndustryTemplate07`

### Operating model
8. `MarketDemand08`
9. `CapacityProduction09`
10. `COGS-DirectCost10`
11. `Opex-Indirect11`
12. `Capex12`
13. `WorkingCapital13`

### Funding, tax, and statements
14. `Financing14`
15. `ConstructionCashFlow`
16. `TaxDepreciation15`
17. `FinancialStatements16`

### Decision analysis
18. `DCF-Valuation17`
19. `EconomicAnalysis18`
20. `Sensivity19`
21. `MonteCarlo20`

### Output-only layers
22. `DashboardExecutive21`
23. `DashboardBank22`
24. `DashboardManagement23`
25. `ReportPack24`

The exact web module names may differ. Preserve dependency meaning rather than forcing one-to-one screen duplication.

## Ownership decision test
When two locations appear to compute the same value, prefer the location that:
1. has the complete required inputs;
2. is upstream of all consumers;
3. is deterministic and testable without UI;
4. already owns related schedule calculations;
5. minimizes circular dependency;
6. exposes typed results with source/validation metadata.

If neither location satisfies these conditions, create or strengthen one narrow engine boundary rather than adding another copy.

## Simple and Advanced modes
- One canonical persisted value per assumption.
- One canonical calculated result per KPI.
- Simple mode may use guided defaults and hide advanced fields.
- Advanced mode may expose detailed schedules, overrides, provenance, and diagnostics.
- A mode switch must not mutate the underlying financial meaning or silently reset valid inputs.

## Scenario ownership
- Base inputs remain canonical.
- Scenario overrides must be explicit, traceable, and reversible.
- Engines receive a resolved scenario input set; engines should not each implement their own scenario lookup rules.
- Output labels must identify scenario, price basis, currency, and horizon when ambiguity is possible.

## Prohibited patterns
- NPV or IRR recomputed inside a dashboard component.
- tax logic duplicated in DCF and financial statements.
- currency conversion repeated with different rate selection rules.
- economic adjustments applied both in an upstream cost engine and again in Economic Analysis.
- Monte Carlo using a parallel formula that differs from the deterministic base engine without an explicit modeling reason.
- display rounding fed back into calculations.
