import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  calculateScenarioAdjustedAssumptions,
  defaultScenarioAdjustments,
  scenarioAdjustmentsEqual,
  scenarioAdjustmentsForClone,
  scenarioDriverDescriptors,
  validateScenarioAdjustments,
} from "../src/lib/scenario-engine";
import {
  calculateProjectScenarioOnDemand,
  invalidateScenarioOutputsForBaseChange,
  normalizePersistedProject,
} from "../src/store/project-context";
import type { Project, Scenario, ScenarioAdjustments } from "../src/lib/types";
import { baseAssumptions, seedProject } from "./fixtures/seed-project";

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const customScenario = (adjustments: ScenarioAdjustments): Scenario => ({
  ...clone(seedProject.scenarios[0]),
  id: "scenario-custom-test",
  scenarioId: "scenario-custom-test",
  name: "آزمون سفارشی",
  type: "custom",
  code: "C01",
  priority: 20,
  isActive: false,
  isDefault: false,
  isLocked: false,
  adjustments: clone(adjustments),
  assumptions: calculateScenarioAdjustedAssumptions(baseAssumptions, adjustments),
  outputs: undefined,
  calculationState: "uncalculated",
});

describe("scenario driver semantics", () => {
  it("adds raw-material delta to the effective canonical growth rate", () => {
    const source = clone(baseAssumptions);
    source.macro.rawMaterialGrowth = 0.08;
    source.directCosts.rialRawMaterialGrowthRate = 0;
    source.directCosts.fxRawMaterialGrowthRate = 0;
    const adjusted = calculateScenarioAdjustedAssumptions(source, {
      ...defaultScenarioAdjustments("custom"),
      rawMaterialGrowthDelta: 0.05,
    });
    assert.equal(adjusted.directCosts.rialRawMaterialGrowthRate, 0.13);
    assert.equal(adjusted.directCosts.fxRawMaterialGrowthRate, 0.13);
    assert.equal(calculateScenarioAdjustedAssumptions(source, defaultScenarioAdjustments("custom")).directCosts.rialRawMaterialGrowthRate, 0.08);
  });

  it("changes annual sales-price growth without changing the initial price level", () => {
    const source = clone(baseAssumptions);
    source.macro.salesPriceGrowth = 0.1;
    source.market.priceGrowthRate = 0;
    source.market.baseSalesPrice = 1_000;
    source.market.unitSalesPrice = 1_000;
    const adjusted = calculateScenarioAdjustedAssumptions(source, {
      ...defaultScenarioAdjustments("custom"),
      salesPriceGrowthDelta: 0.03,
    });
    assert.equal(adjusted.market.priceGrowthRate, 0.13);
    assert.equal(adjusted.market.baseSalesPrice, 1_000);
    assert.equal(adjusted.market.unitSalesPrice, 1_000);
  });

  it("applies the FX multiplier once to level and never to FX escalation", () => {
    const source = clone(baseAssumptions);
    const adjusted = calculateScenarioAdjustedAssumptions(source, {
      ...defaultScenarioAdjustments("custom"),
      fxRateMultiplier: 1.1,
    });
    assert.equal(adjusted.macro.freeMarketFxRate, source.macro.freeMarketFxRate * 1.1);
    assert.equal(adjusted.macro.fxGrowthRate, source.macro.fxGrowthRate);
  });
});

describe("scenario validation", () => {
  const errorsFor = (patch: Partial<ScenarioAdjustments>) => validateScenarioAdjustments(baseAssumptions, {
    ...defaultScenarioAdjustments("custom"),
    ...patch,
  }).map((error) => error.key);

  it("rejects invalid multipliers, WC days, effective tax and non-finite values", () => {
    assert.ok(errorsFor({ fxRateMultiplier: 0 }).includes("fxRateMultiplier"));
    assert.ok(errorsFor({ receivableDaysDelta: -baseAssumptions.workingCapital.receivableDays - 1 }).includes("receivableDaysDelta"));
    assert.ok(errorsFor({ payableDaysDelta: -baseAssumptions.workingCapital.payableDays - 1 }).includes("payableDaysDelta"));
    assert.ok(errorsFor({ taxRateDelta: 2 }).includes("taxRateDelta"));
    assert.ok(errorsFor({ capexMultiplier: Number.NaN }).includes("capexMultiplier"));
    assert.ok(errorsFor({ salesVolumeMultiplier: Number.POSITIVE_INFINITY }).includes("salesVolumeMultiplier"));
  });

  it("rejects fractional or negative construction delay", () => {
    assert.ok(errorsFor({ executionDelayMonths: 1.5 }).includes("executionDelayMonths"));
    assert.ok(errorsFor({ executionDelayMonths: -1 }).includes("executionDelayMonths"));
  });
});

describe("scenario state, clone and refresh", () => {
  it("clones a custom adjustment set and gives a Base clone neutral adjustments", () => {
    const adjustments = { ...defaultScenarioAdjustments("custom"), inflationRateDelta: 0.03, fxRateMultiplier: 1.15 };
    const custom = customScenario(adjustments);
    assert.deepEqual(scenarioAdjustmentsForClone(custom), adjustments);
    assert.deepEqual(scenarioAdjustmentsForClone(seedProject.scenarios[0]), defaultScenarioAdjustments("custom"));
  });

  it("treats save-without-change as adjustment-idempotent", () => {
    const adjustments = { ...defaultScenarioAdjustments("custom"), capexMultiplier: 1.08 };
    assert.equal(scenarioAdjustmentsEqual(adjustments, clone(adjustments)), true);
  });

  it("never mutates Base and keeps scenarios isolated", () => {
    const base = clone(baseAssumptions);
    const firstAdjustments = { ...defaultScenarioAdjustments("custom"), capexMultiplier: 1.1 };
    const secondAdjustments = { ...defaultScenarioAdjustments("custom"), fxRateMultiplier: 1.2 };
    const first = calculateScenarioAdjustedAssumptions(base, firstAdjustments);
    const second = calculateScenarioAdjustedAssumptions(base, secondAdjustments);
    assert.deepEqual(base, baseAssumptions);
    assert.notEqual(first.capex.items[0].rialUnitPrice, second.capex.items[0].rialUnitPrice);
    assert.equal(second.capex.items[0].rialUnitPrice, base.capex.items[0].rialUnitPrice);
    assert.equal(first.macro.freeMarketFxRate, base.macro.freeMarketFxRate);
  });

  it("invalidates every dependent output when Base changes", () => {
    const project = clone(seedProject) as Project;
    const custom = customScenario({ ...defaultScenarioAdjustments("custom"), inflationRateDelta: 0.02 });
    custom.calculationState = "calculated";
    custom.calculatedAt = project.updatedAt;
    project.scenarios = [project.scenarios[0], custom];
    project.scenarios[0].version += 1;
    invalidateScenarioOutputsForBaseChange(project);
    assert.equal(custom.calculationState, "stale");
    assert.equal(custom.outputs, undefined);
    assert.equal(custom.calculatedAt, undefined);
  });

  it("rebuilds custom assumptions after refresh and calculates comparison without a persisted output cache", () => {
    const project = clone(seedProject) as Project;
    const custom = customScenario({ ...defaultScenarioAdjustments("custom"), salesVolumeMultiplier: 0.95 });
    project.scenarios = [project.scenarios[0], custom];
    const persisted = clone(project) as Project;
    delete (persisted.scenarios[1] as unknown as { assumptions?: Scenario["assumptions"] }).assumptions;
    persisted.scenarios.forEach((scenario) => { scenario.outputs = undefined; });
    const restored = normalizePersistedProject(persisted);
    const baseResult = calculateProjectScenarioOnDemand(restored, restored.scenarios[0].id);
    const customResult = calculateProjectScenarioOnDemand(restored, restored.scenarios[1].id);
    assert.ok(baseResult?.outputs.valuation);
    assert.ok(customResult?.outputs.valuation);
    assert.equal(restored.scenarios[1].outputs, undefined);
  });
});

describe("scenario production UI contract", () => {
  it("exposes the exact Simple and Advanced driver sets without probabilistic fields", () => {
    const simple = scenarioDriverDescriptors.filter((driver) => driver.mode === "basic").map((driver) => driver.key);
    const advanced = scenarioDriverDescriptors.map((driver) => driver.key);
    assert.deepEqual(simple.sort(), [
      "inflationRateDelta", "salesPriceGrowthDelta", "salesVolumeMultiplier", "capacityMultiplier",
      "fxRateMultiplier", "capexMultiplier", "financingRateDelta", "executionDelayMonths",
    ].sort());
    assert.ok(advanced.includes("rawMaterialGrowthDelta"));
    assert.ok(advanced.includes("taxRateDelta"));
    assert.ok(!advanced.includes("probability" as never));
    assert.ok(!advanced.includes("riskWeight" as never));
  });

  it("does not render technical workbook or probabilistic labels", () => {
    const source = readFileSync("src/components/project/ScenarioManager.tsx", "utf8");
    assert.doesNotMatch(source, /ScenarioManager\d+|MacroAssumptions\d+|![A-Z]+\d+|Formula Trace|SHOCK ENGINE/i);
    assert.doesNotMatch(source, /احتمال وقوع|وزن ریسک|probability|riskWeight/);
    assert.match(source, /scenario-master-detail/);
    assert.match(source, /scenario-comparison-mobile/);
  });
});
