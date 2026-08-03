import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { calculateMonteCarlo, calculateScenarioCore } from "../src/lib/calculations";
import {
  buildDashboardViewModel,
  formatDashboardMetric,
  selectStabilizedOperatingYear,
} from "../src/lib/dashboard-selectors";
import { isForeignDisplayUnit } from "../src/lib/format";
import { seedProject } from "./fixtures/seed-project";
import type { Project, ScenarioOutputs } from "../src/lib/types";

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const baseResult = () => {
  const project = clone(seedProject) as Project;
  const scenario = project.scenarios.find((item) => item.id === project.activeScenarioId) ?? project.scenarios[0];
  const outputs = calculateScenarioCore(project, scenario);
  return { project, scenario, outputs };
};

describe("dashboard semantic selectors", () => {
  it("keeps dashboard project NPV identical to the canonical valuation metric", () => {
    const { project, scenario, outputs } = baseResult();
    const view = buildDashboardViewModel(project, scenario, outputs);
    assert.equal(view.metrics["project-npv"].value, outputs.valuation.metrics.npv.value);
  });

  it("uses the selected-basis applied discount rate as the project IRR threshold", () => {
    const { project, scenario, outputs } = baseResult();
    const view = buildDashboardViewModel(project, scenario, outputs);
    assert.equal(view.metrics["project-irr"].threshold?.value, outputs.valuation.appliedDiscountRate);
    assert.equal(view.metrics["project-irr"].threshold?.priceBasis, view.metrics["project-irr"].priceBasis);
  });

  it("never compares a real project IRR with a nominal hurdle", () => {
    const { project, scenario } = baseResult();
    scenario.assumptions.macro.calculationBasis = "واقعی";
    scenario.assumptions.macro.defaultDiscountRate = 0.24;
    scenario.assumptions.macro.inflationGeneralAnnual = 0.12;
    const outputs = calculateScenarioCore(project, scenario);
    const view = buildDashboardViewModel(project, scenario, outputs);
    assert.equal(view.metrics["project-irr"].priceBasis, "real");
    assert.equal(view.metrics["project-irr"].threshold?.priceBasis, "real");
    assert.equal(view.metrics["project-irr"].threshold?.value, outputs.valuation.realDiscountRate);
    assert.notEqual(view.metrics["project-irr"].threshold?.value, outputs.valuation.nominalDiscountRate);
  });

  it("publishes the selected-basis hurdle used by Monte Carlo IRR comparisons", () => {
    const project = clone(seedProject) as Project;
    const scenario = project.scenarios[0];
    project.activeScenarioId = scenario.id;
    scenario.assumptions.macro.calculationBasis = "واقعی";
    scenario.assumptions.macro.defaultDiscountRate = 0.24;
    scenario.assumptions.macro.inflationGeneralAnnual = 0.12;
    scenario.assumptions.monteCarlo.iterations = 3;
    scenario.assumptions.monteCarlo.variables = [];
    const baseOutputs = calculateScenarioCore(project, scenario);
    const result = calculateMonteCarlo(project, scenario);
    assert.equal(result.irrHurdleBasis, "real");
    assert.equal(result.baseIrrHurdle, baseOutputs.valuation.appliedDiscountRate);
    assert.ok(result.rows.every((row) => row.irrHurdle === baseOutputs.valuation.appliedDiscountRate));
    const comparable = result.rows.filter((row) => row.irr !== null && row.irrHurdle !== null);
    const expected = comparable.length
      ? comparable.filter((row) => Number(row.irr) > Number(row.irrHurdle)).length / comparable.length
      : null;
    assert.equal(result.probabilityIrrAboveHurdle, expected);
  });

  it("keeps invalid NPV invalid instead of converting it to zero", () => {
    const { project, scenario } = baseResult();
    scenario.assumptions.macro.defaultDiscountRate = -1;
    const outputs = calculateScenarioCore(project, scenario);
    const view = buildDashboardViewModel(project, scenario, outputs);
    assert.equal(outputs.valuation.metrics.npv.value, null);
    assert.equal(view.metrics["project-npv"].value, null);
    assert.equal(view.metrics["project-npv"].status, "invalid");
  });

  it("keeps unavailable IRR unavailable instead of converting it to zero", () => {
    const { project, scenario, outputs } = baseResult();
    const unavailable = clone(outputs) as ScenarioOutputs;
    unavailable.valuation.metrics.irr = { value: null, status: "not_computable", reason: "No valid root" };
    const view = buildDashboardViewModel(project, scenario, unavailable);
    assert.equal(view.metrics["project-irr"].value, null);
    assert.equal(view.metrics["project-irr"].status, "unavailable");
  });

  it("treats no-debt DSCR as unavailable rather than zero", () => {
    const { project, scenario, outputs } = baseResult();
    const noDebt = clone(outputs) as ScenarioOutputs;
    noDebt.financing.annualSchedule.forEach((row) => {
      row.debtService = 0;
      row.totalDebtService = 0;
      row.dscr = null;
    });
    noDebt.financing.minimumDscr = null;
    noDebt.financing.averageDscr = null;
    const view = buildDashboardViewModel(project, scenario, noDebt);
    assert.equal(view.metrics["minimum-dscr"].value, null);
    assert.equal(view.metrics["minimum-dscr"].status, "unavailable");
  });

  it("uses financing.targetDscr as the minimum DSCR covenant threshold", () => {
    const { project, scenario, outputs } = baseResult();
    scenario.assumptions.financing.targetDscr = 1.37;
    const view = buildDashboardViewModel(project, scenario, outputs);
    assert.equal(view.metrics["minimum-dscr"].threshold?.value, 1.37);
    assert.equal(view.metrics["minimum-dscr"].threshold?.owner, "Financing assumptions targetDscr");
  });

  it("keeps economic dashboard metrics identical to canonical economic outputs", () => {
    const { project, scenario, outputs } = baseResult();
    const view = buildDashboardViewModel(project, scenario, outputs);
    assert.equal(view.metrics.enpv.value, outputs.economic.summary.metrics.enpv.value);
    assert.equal(view.metrics.eirr.value, outputs.economic.summary.metrics.eirr.value);
    assert.equal(view.metrics.ebcr.value, outputs.economic.summary.metrics.ebcr.value);
  });

  it("marks calculated metrics stale when upstream inputs are dirty", () => {
    const { project, scenario, outputs } = baseResult();
    const view = buildDashboardViewModel(project, scenario, outputs, { dirty: true });
    assert.equal(view.metrics["project-npv"].status, "stale");
    assert.equal(view.metrics["minimum-dscr"].status, "stale");
  });

  it("prevents stale results from producing an acceptable decision", () => {
    const { project, scenario, outputs } = baseResult();
    const view = buildDashboardViewModel(project, scenario, outputs, { dirty: true });
    assert.equal(view.decisions.overall.status, "recalculation-required");
    assert.notEqual(view.decisions.overall.status, "financially-acceptable");
  });

  it("changes display scale without changing raw values or decisions", () => {
    const { project, scenario, outputs } = baseResult();
    project.displayUnit = "rial";
    const rial = buildDashboardViewModel(project, scenario, outputs);
    const rialText = formatDashboardMetric(rial.metrics["project-npv"], project);
    const scaledProject = clone(project);
    scaledProject.displayUnit = "billion-rial";
    const billion = buildDashboardViewModel(scaledProject, scenario, outputs);
    const billionText = formatDashboardMetric(billion.metrics["project-npv"], scaledProject);
    assert.equal(rial.metrics["project-npv"].value, billion.metrics["project-npv"].value);
    assert.equal(rial.decisions.overall.status, billion.decisions.overall.status);
    assert.notEqual(rialText, billionText);
  });

  it("rejects foreign-currency relabelling without conversion", () => {
    const { project, scenario, outputs } = baseResult();
    project.displayUnit = "دلار";
    const view = buildDashboardViewModel(project, scenario, outputs);
    assert.equal(isForeignDisplayUnit(project.displayUnit), true);
    assert.equal(view.context.displayUnitSupported, false);
    assert.match(formatDashboardMetric(view.metrics["project-npv"], project), /تبدیل ارز تعریف نشده/);
  });

  it("uses one explicit stabilized period for revenue, EBITDA, net profit and FCFF", () => {
    const { project, scenario, outputs } = baseResult();
    const stabilizedYear = selectStabilizedOperatingYear(scenario, outputs);
    const view = buildDashboardViewModel(project, scenario, outputs);
    assert.equal(view.context.selectedOperatingYear, stabilizedYear);
    const ids = ["annual-revenue", "annual-ebitda", "annual-net-profit", "annual-project-fcff"] as const;
    assert.deepEqual(new Set(ids.map((id) => view.metrics[id].periodLabel)).size, 1);
    const statement = outputs.statements.rows.find((row) => row.year === stabilizedYear);
    const valuation = outputs.valuation.annualRows.find((row) => row.year === stabilizedYear);
    assert.equal(view.metrics["annual-revenue"].value, statement?.revenue);
    assert.equal(view.metrics["annual-ebitda"].value, statement?.ebitda);
    assert.equal(view.metrics["annual-net-profit"].value, statement?.netProfit);
    assert.equal(view.metrics["annual-project-fcff"].value, valuation?.fcff);
  });

  it("updates the selector coherently when the active scenario changes", () => {
    const project = clone(seedProject) as Project;
    const base = project.scenarios[0];
    const downside = project.scenarios.find((scenario) => scenario.type === "pessimistic");
    assert.ok(downside);
    const baseView = buildDashboardViewModel(project, base, calculateScenarioCore(project, base));
    const downsideView = buildDashboardViewModel(project, downside, calculateScenarioCore(project, downside));
    assert.equal(baseView.context.scenarioId, base.id);
    assert.equal(downsideView.context.scenarioId, downside.id);
    assert.ok(Object.values(downsideView.metrics).every((metric) => metric.scenarioId === downside.id));
    assert.notEqual(baseView.metrics["project-npv"].value, downsideView.metrics["project-npv"].value);
  });

  it("does not evaluate Equity IRR when selected-basis Cost of Equity is unavailable", () => {
    const { project, scenario, outputs } = baseResult();
    const missingHurdle = clone(outputs) as ScenarioOutputs;
    missingHurdle.valuation.summary.discountRateBuildUp.appliedCostOfEquity = null;
    const view = buildDashboardViewModel(project, scenario, missingHurdle);
    assert.equal(view.metrics["equity-irr"].threshold, null);
    assert.equal(view.metrics["equity-irr"].comparison, "not-evaluated");
  });

  it("keeps core financial formulas and score decisions out of dashboard/report React consumers", () => {
    const dashboardSource = readFileSync("src/components/project/DecisionDashboard.tsx", "utf8");
    const shellSource = readFileSync("src/components/project/ProjectShell.tsx", "utf8");
    const moduleSource = readFileSync("src/components/project/ModulePage.tsx", "utf8");
    for (const source of [dashboardSource, shellSource]) {
      assert.doesNotMatch(source, /outputs\.dashboards/);
      assert.doesNotMatch(source, /investmentDecision|bankDecision|safeDivide/);
      assert.doesNotMatch(source, /valuation\.(npv|irr)/);
      assert.doesNotMatch(source, /totalCapex\s*\+/);
    }
    assert.doesNotMatch(moduleSource, /outputs\.dashboards/);
  });
});
