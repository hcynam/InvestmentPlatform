# Implementation Audit

## Source of Truth

- Active project folder: `D:\InvestmentPlatform`
- Excel source reviewed: `C:\Users\User\Desktop\edition19_4June.xlsx`
- Relevant Excel sheets confirmed: `ScenarioManager06`, `IndustryTemplate07`, `Capex12`, `WorkingCapital13`, `TaxDepreciation15`, `FinancialStatements16`

## Already Implemented

- The app runs as a Next.js RTL Persian web application with project context, calculation engine, validation traces, dashboards, financing, construction cash flow, and phase-two workspaces.
- A premium visual layer exists partially through `PremiumUi.tsx`, dashboard cards, dark finance tokens, and premium tables.
- The top header no longer has a global add-scenario button.
- Financing and construction cash-flow modules already calculate real schedules from assumptions.

## Missing / Incorrect

- The old standalone `tax-depreciation` route, navigation item, component, and module config were still active.
- CAPEX items only had one depreciation book; accounting and tax depreciation were not separated at item level.
- Tax incentives used simple exemption/preferred-rate fields instead of smart conditional logic by incentive type.
- Tax base, depreciation adjustment, loss carry-forward, and tax-credit bridge were not exposed inside CAPEX.
- Working capital used a generic module page; it did not expose the five Excel-aligned sections and did not show DSO/payable days as locked values from the industry template.
- Scenario manager used static/local UI state rather than fully editing the same scenario list shown in the global selector.
- Reusable premium layout component names requested by the prompt were incomplete.

## Files / Areas Involved

- Types and data model: `src/lib/types.ts`, `src/lib/seed.ts`
- Calculation engine: `src/lib/calculations.ts`, `src/lib/phase-two-calculations.ts`
- New engines: `src/lib/tax-capex-engine.ts`, `src/lib/working-capital-engine.ts`
- Routing/config: `src/lib/module-config.ts`, `src/lib/excel-map.ts`, `src/components/project/ModulePage.tsx`, `src/app/projects/[projectId]/tax-depreciation/page.tsx`
- UI/workspaces: `src/components/phase-two/PhaseTwoWorkspaces.tsx`, `src/components/project/ScenarioManager.tsx`, `src/components/project/ProjectShell.tsx`, `src/components/project/PremiumUi.tsx`, `src/styles/globals.css`
- Tests: `tests/*`

## Implementation Plan

1. Remove user-facing standalone tax/depreciation tab and route, and migrate useful logic into CAPEX.
2. Extend CAPEX item model with separate accounting and tax depreciation inputs and calculated outputs.
3. Add a real CAPEX tax engine for annual depreciation aggregation, taxable-income bridge, loss carry-forward, incentive logic, and tax credits.
4. Replace working-capital UI with the five Excel-aligned sections and ensure NWC = current assets - current liabilities with final-year release.
5. Normalize scenario data to six default scenarios plus custom scenarios, and make header/manager share the same store actions.
6. Complete reusable premium UI components and apply them to new/updated tables and cards.
7. Run lint, typecheck, tests, and production build.

## Acceptance Checklist

- [ ] Separate tax/depreciation tab removed from navigation and routing.
- [ ] CAPEX tab includes accounting and tax depreciation per item.
- [ ] CAPEX tab includes a connected `مالیات` section.
- [ ] Tax incentive panel is conditional by incentive type.
- [ ] Knowledge-based, free-zone, less-developed, preferential-rate, percent-exemption, and tax-credit logic are distinct.
- [ ] Tax base and loss carry-forward bridge uses the required formulas.
- [ ] Working-capital tab has the exact five requested sections.
- [ ] DSO and supplier payment days are locked from industry template with source badge.
- [ ] Working capital formula uses current assets minus current liabilities and final-year release.
- [ ] Header scenario selector and scenario manager use one shared scenario list.
- [ ] Add/edit/status/delete scenario is inside scenario manager; defaults are protected.
- [ ] Financing and construction layouts use aligned premium card grids/tables.
- [ ] Real glass components and finance tokens are available and used.
- [ ] No visible NaN/undefined/null/#N/A placeholders.
- [ ] `npm.cmd run lint`, `npm.cmd run typecheck`, `npm.cmd test`, and `npm.cmd run build` pass.
