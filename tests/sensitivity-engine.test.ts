import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { calculateScenario } from "../src/lib/calculations";
import { seedProject } from "../src/lib/seed";
import type { Project, SensitivityMetric, SensitivityVariable } from "../src/lib/types";

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const runSensitivity = (
  metric: SensitivityMetric,
  variable: SensitivityVariable,
  prepare?: (project: Project) => void,
) => {
  const project = clone(seedProject) as Project;
  prepare?.(project);
  const scenario = project.scenarios[0];
  project.activeScenarioId = scenario.id;
  scenario.assumptions.sensitivity.selectedMetric = metric;
  scenario.assumptions.sensitivity.variables = [variable];
  return calculateScenario(project, scenario);
};

const variable = (
  id: string,
  parameter: string,
  low: number,
  high: number,
  changeType: SensitivityVariable["changeType"] = "percent",
): SensitivityVariable => ({
  id,
  parameter,
  label: parameter,
  low,
  high,
  steps: 3,
  changeType,
});

const pointsFor = (project: ReturnType<typeof calculateScenario>, variableId: string) =>
  project.sensitivity.oneWay.filter((point) => point.variableId === variableId);

const pointAt = (project: ReturnType<typeof calculateScenario>, variableId: string, shock: number) => {
  const point = pointsFor(project, variableId).find((item) => Math.abs(item.shock - shock) < 1e-9);
  assert.ok(point, `missing point ${variableId} shock ${shock}`);
  return point;
};

describe("sensitivity engine", () => {
  it("keeps zero-shock NPV equal to the main valuation NPV", () => {
    const outputs = runSensitivity("NPV", variable("price", "قیمت فروش", -0.1, 0.1));
    const zero = pointAt(outputs, "price", 0);

    assert.equal(zero.metric, outputs.valuation.npv);
    assert.equal(outputs.sensitivity.baseMetric, outputs.valuation.npv);
  });

  it("connects revenue, cost and CAPEX shocks to real model recalculation", () => {
    const price = runSensitivity("NPV", variable("price", "قیمت فروش", -0.1, 0.1));
    assert.ok((pointAt(price, "price", 0.1).metric ?? -Infinity) > price.valuation.npv);

    const capex = runSensitivity("NPV", variable("capex", "CAPEX", -0.1, 0.1));
    assert.ok((pointAt(capex, "capex", 0.1).metric ?? Infinity) < capex.valuation.npv);
    assert.ok((pointAt(capex, "capex", -0.1).metric ?? -Infinity) > capex.valuation.npv);

    const opex = runSensitivity("NPV", variable("opex", "OPEX", -0.1, 0.1));
    assert.ok((pointAt(opex, "opex", 0.1).metric ?? Infinity) < opex.valuation.npv);

    const directCosts = runSensitivity("NPV", variable("cogs", "COGS", -0.1, 0.1));
    assert.ok((pointAt(directCosts, "cogs", 0.1).metric ?? Infinity) < directCosts.valuation.npv);
  });

  it("separates WACC sensitivity from debt-interest sensitivity", () => {
    const wacc = runSensitivity("NPV", variable("wacc", "نرخ تنزیل", -0.05, 0.05));
    assert.ok((pointAt(wacc, "wacc", 0.05).metric ?? Infinity) < wacc.valuation.npv);

    const debt = runSensitivity("DSCR", variable("debt", "نرخ بهره", -0.05, 0.05));
    const baseDscr = debt.financing.minimumDscr ?? 0;
    assert.ok((pointAt(debt, "debt", -0.05).metric ?? -Infinity) > baseDscr);
    assert.ok((pointAt(debt, "debt", 0.05).metric ?? Infinity) < baseDscr);
  });

  it("does not report impossible or boundary-fake thresholds as valid", () => {
    const outputs = runSensitivity("NPV", variable("fx", "نرخ ارز", -0.1, 0.1));
    const fx = outputs.sensitivity.breakEven.results.find((result) => result.id === "fxRate");
    const debt = outputs.sensitivity.breakEven.results.find((result) => result.id === "debtInterest");
    const delay = outputs.sensitivity.breakEven.results.find((result) => result.id === "delay");

    assert.ok(fx);
    assert.ok(fx.value === null || fx.value >= 0);
    assert.notEqual(fx.status === "valid" && fx.value !== null && fx.value < 0, true);
    assert.notEqual(debt?.status, "valid");
    assert.notEqual(delay?.status, "valid");
    assert.ok(debt?.reason);
    assert.ok(delay?.recommendation);
  });

  it("publishes structured threshold metadata and unit types", () => {
    const outputs = runSensitivity("NPV", variable("price", "قیمت فروش", -0.1, 0.1));
    const price = outputs.sensitivity.breakEven.results.find((result) => result.id === "price");
    const fx = outputs.sensitivity.breakEven.results.find((result) => result.id === "fxRate");

    assert.ok(price);
    assert.equal(price.unitType, "unitPrice");
    assert.equal(price.target.label, "NPV = 0");
    assert.equal(price.baseMetricValue, outputs.valuation.npv);
    assert.ok(price.reason);
    assert.ok(price.recommendation);
    assert.ok(fx);
    assert.equal(fx.unitType, "fxRate");
    assert.notEqual(fx.status, "valid");
  });

  it("keeps selected metric metadata consistent with extracted metric", () => {
    const bcr = runSensitivity("BCR", variable("price", "قیمت فروش", -0.1, 0.1));
    assert.equal(bcr.sensitivity.selectedMetric, "BCR");
    assert.equal(bcr.sensitivity.metricMetadata.metric, "BCR");
    assert.equal(bcr.sensitivity.metricMetadata.unitType, "ratio");
    assert.equal(bcr.sensitivity.metricMetadata.targetLabel, "BCR = 1");
    assert.equal(bcr.sensitivity.baseMetric, bcr.economic.ebcr);

    const irr = runSensitivity("IRR", variable("price", "قیمت فروش", -0.1, 0.1));
    assert.equal(irr.sensitivity.metricMetadata.unitType, "percentage");
    assert.equal(irr.sensitivity.baseMetric, irr.valuation.irr);
  });

  it("calculates classical BCR as a positive benefits-to-costs ratio", () => {
    const outputs = runSensitivity("BCR", variable("price", "قیمت فروش", -0.1, 0.1), (project) => {
      const economic = project.scenarios[0].assumptions.economic;
      economic.directEmploymentBenefit = 1_000;
      economic.indirectEmploymentBenefit = 500;
      economic.pollutionReductionBenefit = 250;
      economic.technologyTransferBenefit = 250;
      economic.importSubstitutionBenefit = 250;
      economic.regionalDevelopmentBenefit = 250;
      economic.environmentalCost = 10;
      economic.infrastructurePressureCost = 10;
    });

    assert.ok(outputs.economic.ebcr !== null);
    assert.ok(outputs.economic.ebcr > 0);
    assert.equal(outputs.sensitivity.baseMetric, outputs.economic.ebcr);
  });

  it("keeps a weak economic project BCR below one instead of fake-negative", () => {
    const outputs = runSensitivity("BCR", variable("price", "قیمت فروش", -0.1, 0.1), (project) => {
      const scenario = project.scenarios[0];
      scenario.assumptions.market.baseSalesPrice = 1;
      scenario.assumptions.economic.standardConversionFactor = 0.01;
      scenario.assumptions.economic.directEmploymentBenefit = 0;
      scenario.assumptions.economic.indirectEmploymentBenefit = 0;
      scenario.assumptions.economic.pollutionReductionBenefit = 0;
      scenario.assumptions.economic.technologyTransferBenefit = 0;
      scenario.assumptions.economic.importSubstitutionBenefit = 0;
      scenario.assumptions.economic.regionalDevelopmentBenefit = 0;
    });

    assert.ok(outputs.economic.ebcr !== null);
    assert.ok(outputs.economic.ebcr >= 0);
    assert.ok(outputs.economic.ebcr < 1);
  });

  it("uses specific one-way statuses for real impact, no exposure and base-model risk", () => {
    const capex = runSensitivity("NPV", variable("capex", "CAPEX", -0.1, 0.1));
    const capexHigh = pointAt(capex, "capex", 0.1);
    assert.notEqual(capexHigh.status, "noExposure");
    assert.ok(Math.abs(capexHigh.absoluteImpact ?? 0) > 1);

    const fx = runSensitivity("NPV", variable("fx", "نرخ ارز", -0.1, 0.1), (project) => {
      const assumptions = project.scenarios[0].assumptions;
      assumptions.capex.items = assumptions.capex.items.map((item) => ({ ...item, fxUnitPrice: 0, fxPriceShare: 0 }));
      assumptions.directCosts.isMainRawMaterialFx = false;
      assumptions.directCosts.mainRawMaterialFxPrice = 0;
      assumptions.directCosts.items = assumptions.directCosts.items.map((item) => ({ ...item, fxUnitCost: 0, fxShare: 0 }));
      assumptions.opex.items = assumptions.opex.items.map((item) => ({ ...item, isFx: false, fxShare: 0 }));
      assumptions.construction.costItems = assumptions.construction.costItems?.map((item) => ({ ...item, fxIndexed: false, fxShare: 0 }));
    });
    assert.equal(pointAt(fx, "fx", 0).status, "noExposure");
    assert.equal(fx.sensitivity.tornado.find((item) => item.variableId === "fx")?.status, "noExposure");

    const baseRisk = runSensitivity("NPV", variable("capex-risk", "CAPEX", 0, 0.1), (project) => {
      project.scenarios[0].assumptions.market.baseSalesPrice = 1;
    });
    assert.ok(baseRisk.sensitivity.qualityWarnings.some((warning) => warning.id === "base-negative-npv"));
    assert.equal(pointAt(baseRisk, "capex-risk", 0.1).status, "validWithBaseRisk");
  });

  it("marks non-finite selected-metric rows as model errors", () => {
    const outputs = runSensitivity("NPV", variable("wacc", "نرخ تنزیل", 0, 0.02), (project) => {
      const macro = project.scenarios[0].assumptions.macro;
      macro.defaultDiscountRate = 0.02;
      macro.discountRate = 0.02;
      macro.terminalGrowthRate = 0.03;
    });

    assert.ok(pointsFor(outputs, "wacc").some((point) => point.status === "modelError"));
  });

  it("flags invalid discount-rate and terminal-growth states", () => {
    const outputs = runSensitivity("NPV", variable("wacc", "نرخ تنزیل", 0, 0.02), (project) => {
      const macro = project.scenarios[0].assumptions.macro;
      macro.defaultDiscountRate = 0.02;
      macro.discountRate = 0.02;
      macro.terminalGrowthRate = 0.03;
    });

    assert.ok(outputs.sensitivity.qualityWarnings.some((warning) => warning.id === "terminal-growth-invalid"));
    assert.ok(outputs.sensitivity.qualityWarnings.some((warning) => warning.id === "base-metric-invalid"));
  });

  it("keeps sensitivity outputs finite or explicitly null", () => {
    const outputs = runSensitivity("NPV", variable("capex", "CAPEX", -0.1, 0.1));

    outputs.sensitivity.oneWay.forEach((point) => {
      assert.ok(point.metric === null || Number.isFinite(point.metric));
      assert.ok(point.absoluteImpact === null || Number.isFinite(point.absoluteImpact));
      assert.ok(point.percentImpact === null || Number.isFinite(point.percentImpact));
    });
    outputs.sensitivity.matrix.forEach((cell) => {
      assert.ok(cell.value === null || Number.isFinite(cell.value));
    });
    outputs.sensitivity.breakEven.results.forEach((result) => {
      assert.ok(result.value === null || Number.isFinite(result.value));
      assert.ok(result.metricValue === null || Number.isFinite(result.metricValue));
      assert.doesNotMatch(`${result.reason} ${result.recommendation}`, /NaN|undefined|null|#N\/A/);
    });
  });
});
