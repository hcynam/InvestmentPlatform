import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { calculateMonteCarlo, calculateScenarioCore } from "../src/lib/calculations";
import {
  buildHistogram,
  calculatePercentile,
  createSeededRandom,
  runMonteCarloSimulation,
  sampleMonteCarloDistribution,
  validateMonteCarloVariable,
} from "../src/lib/monte-carlo-engine";
import { applyRiskVariableShock, defaultRiskVariable } from "../src/lib/risk-variable-engine";
import { seedProject } from "../src/lib/seed";
import type { MonteCarloVariable, Project } from "../src/lib/types";

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const baseMonteCarloProject = (iterations = 8) => {
  const project = clone(seedProject) as Project;
  const scenario = project.scenarios[0];
  project.activeScenarioId = scenario.id;
  scenario.assumptions.monteCarlo.iterations = iterations;
  scenario.assumptions.monteCarlo.seed = 123;
  scenario.assumptions.monteCarlo.variables = [
    variable("price", "قیمت فروش", -0.08, 0, 0.08),
    variable("capex", "CAPEX", -0.05, 0, 0.12),
    variable("wacc", "WACC", -0.02, 0, 0.02),
  ];
  return { project, scenario };
};

const variable = (
  id: string,
  name: string,
  low: number,
  mid: number,
  high: number,
  distribution: MonteCarloVariable["distribution"] = "normal",
): MonteCarloVariable => ({
  id,
  name,
  label: name,
  low,
  mid,
  high,
  distribution,
  enabled: true,
  active: true,
  description: name,
});

describe("monte carlo engine", () => {
  it("produces deterministic same-seed output and different paths for different seeds", () => {
    const first = baseMonteCarloProject();
    const second = baseMonteCarloProject();
    const third = baseMonteCarloProject();
    third.scenario.assumptions.monteCarlo.seed = 999;

    const firstResult = calculateMonteCarlo(first.project, first.scenario);
    const secondResult = calculateMonteCarlo(second.project, second.scenario);
    const thirdResult = calculateMonteCarlo(third.project, third.scenario);

    assert.deepEqual(firstResult.rows.map((row) => row.samples.map((sample) => sample.shock)), secondResult.rows.map((row) => row.samples.map((sample) => sample.shock)));
    assert.notDeepEqual(firstResult.rows.map((row) => row.samples.map((sample) => sample.shock)), thirdResult.rows.map((row) => row.samples.map((sample) => sample.shock)));
    assert.equal(firstResult.metricSummaries.NPV.p50, secondResult.metricSummaries.NPV.p50);
  });

  it("keeps the core simulation free of ambient random sources", () => {
    const source = readFileSync("src/lib/monte-carlo-engine.ts", "utf8");
    assert.equal(source.includes("Math.random"), false);
  });

  it("validates distributions and samples within supported bounds", () => {
    const invalid = validateMonteCarloVariable(variable("bad", "CAPEX", 0.2, 0, 0.1, "triangular"));
    assert.equal(invalid.ok, false);
    assert.ok(invalid.warnings.some((warning) => warning.id.includes("mode") || warning.id.includes("bounds")));

    const guarded = validateMonteCarloVariable({ ...variable("guard", "قیمت فروش", -1.2, 0, 0.1), positiveOnly: true });
    assert.ok(guarded.warnings.some((warning) => warning.id.includes("positive-guard")));

    const random = createSeededRandom(42);
    const triangular = Array.from({ length: 30 }, () => sampleMonteCarloDistribution(random, { type: "triangular", min: -0.1, mode: 0, max: 0.2 }));
    const pert = Array.from({ length: 30 }, () => sampleMonteCarloDistribution(random, { type: "pert", min: -0.1, mode: 0.05, max: 0.2 }));
    const normal = Array.from({ length: 30 }, () => sampleMonteCarloDistribution(random, { type: "normal", min: -0.05, mean: 0, max: 0.05, stdDev: 0.02 }));
    const lognormal = Array.from({ length: 30 }, () => sampleMonteCarloDistribution(random, { type: "lognormal", min: 0, mean: 0.02, max: 0.25, stdDev: 0.05 }));

    [...triangular, ...pert].forEach((sample) => assert.ok(sample >= -0.1 && sample <= 0.2));
    normal.forEach((sample) => assert.ok(sample >= -0.05 && sample <= 0.05));
    lognormal.forEach((sample) => assert.ok(sample >= 0 && sample <= 0.25));
  });

  it("handles zero active variables and constant histogram series explicitly", () => {
    const { project, scenario } = baseMonteCarloProject(4);
    scenario.assumptions.monteCarlo.variables = scenario.assumptions.monteCarlo.variables.map((item) => ({ ...item, enabled: false, active: false }));
    const result = calculateMonteCarlo(project, scenario);

    assert.equal(result.activeVariableCount, 0);
    assert.ok(result.qualityWarnings.some((warning) => warning.id === "mc.zero-active-variables"));
    assert.deepEqual(new Set(result.rows.map((row) => row.npv)).size, 1);

    const histogram = buildHistogram([5, 5, 5], 5);
    assert.equal(histogram.reduce((total, bin) => total + bin.count, 0), 3);
    assert.equal(histogram.length, 5);
  });

  it("does not coerce invalid IRR outputs to zero", () => {
    const { project, scenario } = baseMonteCarloProject(3);
    const baseOutputs = calculateScenarioCore(project, scenario);
    const result = runMonteCarloSimulation(project, scenario, () => ({
      ...baseOutputs,
      valuation: {
        ...baseOutputs.valuation,
        irr: null,
        mirr: null,
      },
    }));

    assert.equal(result.metricSummaries.IRR.validCount, 0);
    assert.equal(result.rows.every((row) => row.irr === null), true);
    assert.equal(result.rows.some((row) => row.irr === 0), false);
    assert.ok(result.rows.every((row) => row.invalidReasons.includes("invalidIrr")));
  });

  it("calculates finite summaries, invalid counts, VaR convention and contribution ranking", () => {
    const { project, scenario } = baseMonteCarloProject(10);
    const baseOutputs = calculateScenarioCore(project, scenario);
    const result = calculateMonteCarlo(project, scenario);
    const npvs = result.rows.map((row) => row.npv).filter((value): value is number => typeof value === "number");
    const losses = npvs.map((npv) => baseOutputs.valuation.npv - npv);

    assert.equal(Number.isFinite(result.metricSummaries.NPV.mean ?? Number.NaN), true);
    assert.equal(result.metricSummaries.NPV.count, 10);
    assert.equal(result.valueAtRisk95, calculatePercentile(losses, 0.95));
    assert.equal(result.varConvention, "baseRelativeNpvLoss");
    assert.ok(result.contributions.every((item, index, list) => index === 0 || list[index - 1].absoluteCorrelation >= item.absoluteCorrelation));
    assert.ok(result.sampledRows.length < result.rows.length || result.rows.length <= 15);
  });

  it("connects Monte Carlo risk variables to the real financial model", () => {
    const project = clone(seedProject) as Project;
    const scenario = project.scenarios[0];
    const baseOutputs = calculateScenarioCore(project, scenario);

    const capexShock = applyRiskVariableShock(project, scenario, defaultRiskVariable("capex"), 0.2, baseOutputs);
    const capexOutputs = calculateScenarioCore(capexShock.project, capexShock.scenario);
    assert.ok(capexOutputs.valuation.npv < baseOutputs.valuation.npv);

    const waccShock = applyRiskVariableShock(project, scenario, defaultRiskVariable("discountRate"), 0.02, baseOutputs);
    const waccOutputs = calculateScenarioCore(waccShock.project, waccShock.scenario);
    assert.ok(waccOutputs.valuation.npv < baseOutputs.valuation.npv);
    assert.equal(waccShock.scenario.assumptions.financing.interestRate, scenario.assumptions.financing.interestRate);

    const debtShock = applyRiskVariableShock(project, scenario, defaultRiskVariable("debtInterest"), 0.03, baseOutputs);
    const debtOutputs = calculateScenarioCore(debtShock.project, debtShock.scenario);
    assert.ok((debtOutputs.financing.minimumDscr ?? Infinity) < (baseOutputs.financing.minimumDscr ?? Infinity));

    const workingCapitalShock = applyRiskVariableShock(project, scenario, defaultRiskVariable("workingCapitalDays"), 30, baseOutputs);
    const workingCapitalOutputs = calculateScenarioCore(workingCapitalShock.project, workingCapitalShock.scenario);
    assert.ok(workingCapitalOutputs.workingCapital.rows[1].receivables > baseOutputs.workingCapital.rows[1].receivables);

    const delayShock = applyRiskVariableShock(project, scenario, defaultRiskVariable("delay"), 4, baseOutputs);
    const delayOutputs = calculateScenarioCore(delayShock.project, delayShock.scenario);
    assert.equal(delayShock.scenario.assumptions.construction.actualDelayMonths, 4);
    assert.ok(delayOutputs.capex.delayCost >= baseOutputs.capex.delayCost);
  });

  it("surfaces FX no-exposure warnings instead of fake sensitivity", () => {
    const project = clone(seedProject) as Project;
    const assumptions = project.scenarios[0].assumptions;
    assumptions.capex.items = assumptions.capex.items.map((item) => ({ ...item, fxUnitPrice: 0, fxPriceShare: 0 }));
    assumptions.directCosts.isMainRawMaterialFx = false;
    assumptions.directCosts.mainRawMaterialFxPrice = 0;
    assumptions.directCosts.items = assumptions.directCosts.items.map((item) => ({ ...item, fxUnitCost: 0, fxShare: 0 }));
    assumptions.opex.items = assumptions.opex.items.map((item) => ({ ...item, isFx: false, fxShare: 0 }));
    assumptions.construction.costItems = assumptions.construction.costItems?.map((item) => ({ ...item, fxIndexed: false, fxShare: 0 }));
    const scenario = project.scenarios[0];
    const baseOutputs = calculateScenarioCore(project, scenario);

    const shocked = applyRiskVariableShock(project, scenario, defaultRiskVariable("fxRate"), 0.2, baseOutputs);
    assert.ok(shocked.warnings.some((item) => item.includes("مواجهه ارزی")));

    scenario.assumptions.monteCarlo.iterations = 4;
    scenario.assumptions.monteCarlo.variables = [variable("fx", "نرخ ارز", -0.05, 0, 0.2)];
    const result = calculateMonteCarlo(project, scenario);
    assert.ok(result.qualityWarnings.some((warning) => warning.id.includes("no-fx-exposure")));
  });

  it("keeps the React workbench aggregated and free of invalid text leaks", () => {
    const source = readFileSync("src/components/project/MonteCarloWorkbench.tsx", "utf8");

    assert.ok(source.includes("sampledRows"));
    assert.equal(source.includes("result.rows.map"), false);
    assert.ok(source.includes("همبستگی در این نسخه فقط به‌صورت مستقل اجرا می‌شود"));
    assert.equal(source.includes(">NaN<"), false);
    assert.equal(source.includes(">undefined<"), false);
    assert.equal(source.includes(">null<"), false);
    assert.equal(source.includes("#N/A"), false);
  });
});
