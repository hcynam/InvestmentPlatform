import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { calculateDirectCostSchedule, calculateOpexSchedule } from "../src/lib/phase-two-calculations";
import { visibleProjectValidationIssues } from "../src/lib/validation-visibility";
import { seedProject } from "./fixtures/seed-project";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const section = (source: string, start: string, end: string) =>
  source.slice(source.indexOf(start), source.indexOf(end));

describe("Direct Costs and OPEX UI regressions", () => {
  const workspaces = read("src/components/phase-two/PhaseTwoWorkspaces.tsx");
  const direct = section(workspaces, "export function DirectCostsWorkspace", "const newOpexItem");
  const opex = section(workspaces, "export function OpexWorkspace", "const capexTabs");

  it("keeps Direct Costs free of technical helpers and localizes every FX option label", () => {
    assert.doesNotMatch(direct, /COGS-DirectCost10!Q41|پس از تبدیل به ریال|ساختار اقلام/);
    assert.doesNotMatch(direct, /قیمت ریالی و ارزی مستقل نگهداری/);
    assert.match(direct, /optionLabels=\{fxTypeLabels\}/);
    assert.match(direct, /value=\{option\}>\{fxTypeLabel\(option\)\}/);
    assert.match(direct, /هنوز قلم هزینه مستقیمی تعریف نشده است/);
    assert.match(direct, /draft\.items\.length \? \(/);
  });

  it("keeps OPEX references and redundant copy out while retaining an explicit empty state", () => {
    assert.doesNotMatch(opex, /Opex-Indirect11!Q50|note: "Q5[145]"/);
    assert.doesNotMatch(opex, /هر ردیف driver/);
    assert.doesNotMatch(opex, /row\.totalOpex \/ Math\.max\(1,/);
    assert.match(opex, /هنوز قلم هزینه عملیاتی تعریف نشده است/);
    assert.match(opex, /draft\.items\.length \? \(/);
  });

  it("uses a compact desktop OPEX table with mobile overflow only as fallback", () => {
    const styles = read("src/styles/globals.css");
    assert.match(opex, /<colgroup>/);
    assert.match(styles, /\.editable-model-table\.opex-table \{[\s\S]*?min-width: 0;[\s\S]*?table-layout: fixed;/);
    assert.doesNotMatch(styles, /\.editable-model-table\.opex-table \{\s*min-width: 1500px;/);
    assert.match(styles, /@media \(max-width: 720px\)[\s\S]*?\.editable-model-table\.opex-table \{[\s\S]*?min-width: 1050px;/);
  });

  it("keeps formula traces, Excel sources, and per-tab calculation status out of normal UI", () => {
    const fields = read("src/components/phase-one/PhaseOneFields.tsx");
    const modulePage = read("src/components/project/ModulePage.tsx");
    const shell = read("src/components/project/ProjectShell.tsx");
    assert.doesNotMatch(fields, /<code>\{item\.formula\}<\/code>/);
    assert.doesNotMatch(modulePage, /showSource|مشاهده منطق محاسبه|className=\{classNames\("calculation-state"/);
    assert.doesNotMatch(modulePage, /outputs\.traces\.map|excelSheets\.map|sourceSheet|sourceCell/);
    assert.doesNotMatch(shell, /function FormulaTraceDrawer|<FormulaTraceDrawer/);
    assert.doesNotMatch(workspaces, /<FormulaTraceMini/);
  });

  it("renders neutral validation states until input tabs are configured", () => {
    const fields = read("src/components/phase-one/PhaseOneFields.tsx");
    const phaseOne = read("src/components/phase-one/PhaseOneWorkspaces.tsx");
    assert.match(fields, /configured = true/);
    assert.match(fields, /اطلاعات این بخش هنوز تکمیل نشده است/);
    assert.match(phaseOne, /configured=\{setupConfigured\}/);
    assert.match(phaseOne, /configured=\{macroConfigured\}/);
    assert.match(phaseOne, /configured=\{industryConfigured\}/);
    assert.match(phaseOne, /configured=\{marketConfigured\}/);
    assert.match(workspaces, /configured=\{capacityConfigured\}/);
    assert.match(workspaces, /configured=\{directCostsConfigured\}/);
    assert.match(workspaces, /configured=\{opexConfigured\}/);
  });

  it("filters unconfigured module issues from the shared project validation UI", () => {
    const project = structuredClone(seedProject);
    const scenario = project.scenarios[0];
    project.setup.mainIndustry = "";
    project.setup.legalPersonality = "";
    scenario.assumptions.directCosts.mainRawMaterialName = "";
    scenario.assumptions.directCosts.mainRawMaterialRialPrice = 0;
    scenario.assumptions.directCosts.mainRawMaterialFxPrice = 0;
    scenario.assumptions.directCosts.directEnergyCost = 0;
    scenario.assumptions.directCosts.directLaborCost = 0;
    scenario.assumptions.directCosts.avoidableWasteCost = 0;
    scenario.assumptions.directCosts.items = [];
    scenario.assumptions.opex.items = [];
    scenario.assumptions.opex.sharedCostAllocationPercent = 0;
    scenario.assumptions.opex.scenarioAdjustmentRate = 0;

    const visible = visibleProjectValidationIssues(project, scenario, [
      { id: "setup-industry", severity: "error", module: "setup", field: "mainIndustry", message: "missing" },
      { id: "phase2.direct.zero-unit-cost", severity: "warning", module: "direct-costs", field: "baseYearUnitDirectCost", message: "zero" },
      { id: "phase2.opex.high-ratio", severity: "warning", module: "opex", field: "opexToRevenueRatio", message: "ratio" },
      { id: "unrelated", severity: "error", module: "financing", field: "loan", message: "invalid" },
    ], 0);

    assert.deepEqual(visible.map((issue) => issue.id), ["unrelated"]);
  });

  it("preserves Direct Costs and OPEX calculation results", () => {
    const assumptions = seedProject.scenarios[0].assumptions;
    const directResult = calculateDirectCostSchedule(
      assumptions.directCosts,
      assumptions.macro,
      [0, 100, 120],
      [0, 200_000, 210_000],
    );
    const opexResult = calculateOpexSchedule(
      assumptions.opex,
      [0, 10_000_000_000, 11_000_000_000],
      [0, 100, 120],
      assumptions.macro,
    );

    assert.equal(directResult.values[1]?.unitCost, 5_000);
    assert.equal(directResult.values[1]?.totalCost, 500_000);
    assert.equal(opexResult.values.outputs.totalAnnualOpex, 2_320_000_000);
    assert.equal(opexResult.values.outputs.cashOpexExcludingDepreciation, 2_320_000_000);
    assert.equal(opexResult.values.outputs.opexToRevenueRatio, 0.232);
  });
});
