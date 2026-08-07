import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { calculateScenario } from "../src/lib/calculations";
import {
  calculateOperationalIndicators,
  selectAvailableOperationalKpis,
  synchronizeIndustryTemplate,
  validateIndustryTemplate,
} from "../src/lib/phase-one-calculations";
import {
  calculateScenarioAdjustedAssumptions,
  defaultScenarioAdjustments,
} from "../src/lib/scenario-engine";
import { seedProject } from "./fixtures/seed-project";

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

describe("industry template stabilization", () => {
  it("uses canonical capacity inputs for effective and unused capacity with the capacity unit", () => {
    const capacity = clone(seedProject.scenarios[0].assumptions.capacity);
    capacity.unit = "تن در سال";
    capacity.nominalCapacity = 6_000;
    capacity.firstYearUtilizationRate = 0.85;
    capacity.wasteRate = 0.025;
    capacity.productionEfficiency = 0.95;

    const result = calculateOperationalIndicators(capacity, []);

    assert.equal(capacity.unit, "تن در سال");
    assert.ok(Math.abs((result.values.modeledEffectiveCapacity ?? 0) - 4_723.875) < 1e-9);
    assert.ok(Math.abs((result.values.idleCapacity ?? 0) - 1_276.125) < 1e-9);
    assert.equal(result.trace[0]?.sourceSheet, "CapacityProduction09");
  });

  it("keeps missing operational data and risks unavailable instead of fabricating zero or low", () => {
    const capacity = clone(seedProject.scenarios[0].assumptions.capacity);
    capacity.nominalCapacity = 0;
    capacity.firstYearUtilizationRate = 0;
    capacity.productionEfficiency = 0;

    const result = calculateOperationalIndicators(capacity, []);

    assert.equal(result.values.modeledEffectiveCapacity, null);
    assert.equal(result.values.idleCapacity, null);
    assert.equal(result.values.operationalIntensityScore, null);
    assert.equal(result.values.averageRiskScore, null);
    assert.deepEqual(selectAvailableOperationalKpis(capacity), []);
  });

  it("does not warn about cost-share totals before a cost group exists", () => {
    const industry = clone(seedProject.scenarios[0].assumptions.industry);
    industry.costFxExposureTable = [];
    const result = validateIndustryTemplate(industry, seedProject.scenarios[0].assumptions.capacity);
    assert.equal(result.warnings.some((item) => item.id === "industry-cost-share-total"), false);
  });

  it("persists adding and deleting a custom productivity KPI", () => {
    const industry = clone(seedProject.scenarios[0].assumptions.industry);
    const custom = { id: "custom-throughput", title: "بهره‌وری سفارشی", value: 12, unit: "واحد", description: "" };
    industry.productivityIndicators = [custom];
    industry.selectedProductivityKpiIds = [custom.id];
    const added = synchronizeIndustryTemplate(industry, seedProject.setup);
    assert.deepEqual(added.productivityIndicators, [custom]);
    assert.deepEqual(added.selectedProductivityKpiIds, [custom.id]);

    const deleted = synchronizeIndustryTemplate({
      ...added,
      productivityIndicators: [],
      selectedProductivityKpiIds: [],
    }, seedProject.setup);
    assert.deepEqual(deleted.productivityIndicators, []);
    assert.deepEqual(deleted.selectedProductivityKpiIds, []);
    assert.equal(deleted.keyProductivityMetric, "");
  });

  it("applies a scenario capacity multiplier to capacity once and preserves utilization rates", () => {
    const assumptions = clone(seedProject.scenarios[0].assumptions);
    const adjustments = { ...defaultScenarioAdjustments("base"), capacityMultiplier: 1.1 };
    const adjusted = calculateScenarioAdjustedAssumptions(assumptions, adjustments);

    assert.equal(adjusted.capacity.nominalCapacity, assumptions.capacity.nominalCapacity * 1.1);
    assert.equal(adjusted.capacity.firstYearUtilizationRate, assumptions.capacity.firstYearUtilizationRate);
    assert.equal(adjusted.capacity.stableYearUtilizationRate, assumptions.capacity.stableYearUtilizationRate);
  });

  it("uses Working Capital as the owner of receivable and payable day scenario adjustments", () => {
    const assumptions = clone(seedProject.scenarios[0].assumptions);
    assumptions.industry.receivablesDays = 999;
    assumptions.industry.payablesDays = 999;
    const adjustments = {
      ...defaultScenarioAdjustments("base"),
      receivableDaysDelta: 5,
      payableDaysDelta: -3,
    };
    const adjusted = calculateScenarioAdjustedAssumptions(assumptions, adjustments);

    assert.equal(adjusted.workingCapital.receivableDays, assumptions.workingCapital.receivableDays + 5);
    assert.equal(adjusted.workingCapital.payableDays, assumptions.workingCapital.payableDays - 3);
    assert.equal(adjusted.industry.receivablesDays, adjusted.workingCapital.receivableDays);
    assert.equal(adjusted.industry.payablesDays, adjusted.workingCapital.payableDays);
  });

  it("keeps return-rate and industry-risk metadata from reducing cash-flow outputs again", () => {
    const baseProject = clone(seedProject);
    const baseScenario = baseProject.scenarios[0];
    const baseOutputs = calculateScenario(baseProject, baseScenario);

    const metadataProject = clone(seedProject);
    const metadataScenario = metadataProject.scenarios[0];
    metadataScenario.assumptions.industry.returnRate = 0.9;
    metadataScenario.assumptions.industry.risks = metadataScenario.assumptions.industry.risks.map((risk) => ({
      ...risk,
      probability: 5,
      impact: 5,
      level: "بحرانی",
    }));
    const metadataOutputs = calculateScenario(metadataProject, metadataScenario);

    assert.deepEqual(metadataOutputs.revenue.rows, baseOutputs.revenue.rows);
    assert.deepEqual(metadataOutputs.statements.rows, baseOutputs.statements.rows);
  });

  it("keeps the Industry Template user surface free of trace panels and system suggestions", () => {
    const workspaces = read("src/components/phase-one/PhaseOneWorkspaces.tsx");
    const industry = workspaces.slice(workspaces.indexOf("export function IndustryTemplateWorkspace"), workspaces.indexOf("const marketTabs"));
    const fields = read("src/components/phase-one/PhaseOneFields.tsx");
    const moduleConfig = read("src/lib/module-config.ts");
    const css = read("src/styles/globals.css");

    assert.equal(industry.includes("FormulaTraceMini"), false);
    assert.equal(industry.includes("Operational intensity"), false);
    assert.equal(industry.includes("Exposure هزینه ارزی"), false);
    assert.equal(industry.includes("پیشنهاد سیستم"), false);
    assert.equal(industry.includes("ردیف‌ها پویا و مستقیماً"), false);
    assert.match(industry, /capacity\.unit\.trim\(\)/);
    assert.match(industry, /placeholder="ارزیابی‌نشده"/);
    assert.match(fields, /هنوز مواجهه هزینه ارزی تعریف نشده است/);
    assert.match(fields, /rows\.filter\(\(item\) => item\.id !== row\.id\)/);
    assert.equal(fields.includes('disabled={rows.length === 1}'), false);
    assert.match(moduleConfig, /eyebrow: "تعریف الگوی صنعت"/);
    assert.match(css, /unicode-bidi: plaintext/);
    assert.match(css, /\.risk-table-wrap table[\s\S]*table-layout: fixed/);
  });
});
