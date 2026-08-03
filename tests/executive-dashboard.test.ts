import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { calculateScenarioCore } from "../src/lib/calculations";
import { buildDashboardViewModel, formatDashboardMetric } from "../src/lib/dashboard-selectors";
import { seedProject } from "./fixtures/seed-project";
import type { Project, ScenarioOutputs } from "../src/lib/types";

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const fixture = () => {
  const project = clone(seedProject) as Project;
  const scenario = project.scenarios.find((item) => item.id === project.activeScenarioId) ?? project.scenarios[0];
  const outputs = calculateScenarioCore(project, scenario);
  const view = buildDashboardViewModel(project, scenario, outputs);
  return { project, scenario, outputs, view };
};

const source = readFileSync("src/components/project/ExecutiveDashboard.tsx", "utf8");
const css = readFileSync("src/styles/globals.css", "utf8");

describe("production Executive Dashboard", () => {
  it("uses canonical selector NPV, IRR hurdle and stabilized-year metadata", () => {
    const { outputs, view } = fixture();
    assert.equal(view.metrics["project-npv"].value, outputs.valuation.metrics.npv.value);
    assert.equal(view.metrics["project-irr"].threshold?.value, outputs.valuation.appliedDiscountRate);
    assert.equal(view.metrics["project-irr"].threshold?.priceBasis, view.context.calculationBasis);
    const operatingIds = ["annual-revenue", "annual-ebitda", "annual-project-fcff"] as const;
    assert.ok(operatingIds.every((id) => view.metrics[id].periodLabel === view.context.periodLabel));
    assert.ok(operatingIds.every((id) => view.metrics[id].periodType === "model-year"));
  });

  it("never formats invalid, unavailable or stale headline values as numeric zero", () => {
    const { project, scenario, outputs } = fixture();
    const invalid = clone(outputs) as ScenarioOutputs;
    invalid.valuation.metrics.npv = { value: null, status: "invalid_input", reason: "Invalid rate" };
    invalid.valuation.metrics.irr = { value: null, status: "not_computable", reason: "No root" };
    const invalidView = buildDashboardViewModel(project, scenario, invalid);
    assert.equal(formatDashboardMetric(invalidView.metrics["project-npv"], project), "نامعتبر");
    assert.equal(formatDashboardMetric(invalidView.metrics["project-irr"], project), "ناموجود");
    assert.notEqual(formatDashboardMetric(invalidView.metrics["project-npv"], project), "۰");
    const stale = buildDashboardViewModel(project, scenario, outputs, { dirty: true });
    assert.equal(stale.decisions.overall.status, "recalculation-required");
    assert.match(source, /محاسبه مجدد مدل/);
  });

  it("shows no-debt DSCR as not applicable and debt DSCR against the canonical selector target", () => {
    const { project, scenario, outputs, view } = fixture();
    assert.equal(view.metrics["minimum-dscr"].threshold?.value, scenario.assumptions.financing.targetDscr);
    const noDebt = clone(outputs) as ScenarioOutputs;
    noDebt.financing.annualSchedule.forEach((row) => {
      row.debtService = 0;
      row.totalDebtService = 0;
      row.dscr = null;
    });
    noDebt.financing.minimumDscr = null;
    noDebt.financing.averageDscr = null;
    const noDebtView = buildDashboardViewModel(project, scenario, noDebt);
    assert.equal(noDebtView.metrics["minimum-dscr"].status, "unavailable");
    assert.equal(noDebtView.metrics["minimum-dscr"].value, null);
    assert.match(source, /targetMetric\.threshold\?\.value/);
    assert.doesNotMatch(source, /assumptions\.financing\.targetDscr/);
    assert.match(source, /قابل اعمال نیست/);
  });

  it("keeps the Executive economic summary equal to canonical economic outputs", () => {
    const { outputs, view } = fixture();
    assert.equal(view.metrics.enpv.value, outputs.economic.summary.metrics.enpv.value);
    assert.equal(view.metrics.eirr.value, outputs.economic.summary.metrics.eirr.value);
    assert.equal(view.metrics.ebcr.value, outputs.economic.summary.metrics.ebcr.value);
    assert.match(source, /\["enpv", "eirr", "ebcr"\]/);
  });

  it("hides stale sensitivity and Monte Carlo results", () => {
    assert.match(source, /if \(dirty \|\| outputs\.sensitivity\.selectedMetric !== "NPV"\) return \[\]/);
    assert.match(source, /const monteCarloCurrent = !dirty && outputs\.monteCarlo/);
    assert.match(source, /احتمال‌های قدیمی نمایش داده نمی‌شوند/);
  });

  it("uses governed drill-down metadata for every primary KPI", () => {
    const { view } = fixture();
    const ids = [
      "project-npv",
      "project-irr",
      "total-capex",
      "discounted-project-payback",
      "minimum-dscr",
      "annual-revenue",
      "annual-ebitda",
      "annual-project-fcff",
    ] as const;
    assert.ok(ids.every((id) => view.metrics[id].drilldown.startsWith("../")));
    assert.ok(ids.every((id) => view.metrics[id].owner.length > 0 && view.metrics[id].sourceTab.length > 0));
    assert.match(source, /metric\.drilldown\.replace/);
    assert.match(source, /<SourceTrace/);
  });

  it("updates decision, KPI and chart inputs coherently when the active scenario changes", () => {
    const project = clone(seedProject) as Project;
    const base = project.scenarios[0];
    const downside = project.scenarios.find((scenario) => scenario.type === "pessimistic");
    assert.ok(downside);
    const baseView = buildDashboardViewModel(project, base, calculateScenarioCore(project, base));
    const downsideView = buildDashboardViewModel(project, downside, calculateScenarioCore(project, downside));
    assert.notEqual(baseView.metrics["project-npv"].value, downsideView.metrics["project-npv"].value);
    assert.equal(downsideView.context.scenarioId, downside.id);
    assert.ok(downsideView.annualSeries.every((row, index) => row.projectFcff === calculateScenarioCore(project, downside).valuation.annualRows[index]?.fcff));
    assert.match(source, /\[activeScenario, dirty, outputs, project, selectedYear\]/);
  });

  it("changes display formatting without changing selector values or decisions", () => {
    const { project, scenario, outputs } = fixture();
    project.displayUnit = "rial";
    const rial = buildDashboardViewModel(project, scenario, outputs);
    const scaledProject = clone(project);
    scaledProject.displayUnit = "billion-rial";
    const scaled = buildDashboardViewModel(scaledProject, scenario, outputs);
    assert.equal(rial.metrics["project-npv"].value, scaled.metrics["project-npv"].value);
    assert.equal(rial.decisions.overall.status, scaled.decisions.overall.status);
    assert.notEqual(formatDashboardMetric(rial.metrics["project-npv"], project), formatDashboardMetric(scaled.metrics["project-npv"], scaledProject));
  });

  it("preserves logical RTL content order and narrow responsive layouts", () => {
    const orderedSections = [
      "executive-context",
      "executive-decision-banner",
      "executive-primary-kpis",
      "executive-analysis-grid",
      "executive-exceptions-panel",
    ];
    orderedSections.reduce((lastIndex, className) => {
      const index = source.indexOf(className);
      assert.ok(index > lastIndex, `${className} must follow the previous section`);
      return index;
    }, -1);
    assert.match(css, /@media \(max-width: 1024px\)[\s\S]*?\.executive-analysis-grid[\s\S]*?grid-template-columns: 1fr/);
    assert.match(css, /@media \(max-width: 720px\)[\s\S]*?\.executive-kpi-grid[\s\S]*?grid-template-columns: 1fr/);
    assert.match(css, /\.executive-chart\s*\{[\s\S]*?overflow-x: auto/);
    assert.match(css, /:focus-visible/);
  });

  it("contains no duplicated core financial formulas or sample KPI values", () => {
    assert.doesNotMatch(source, /outputs\.dashboards|investmentDecision|bankDecision|safeDivide/);
    assert.doesNotMatch(source, /outputs\.valuation\.(npv|irr|payback)/);
    assert.doesNotMatch(source, /totalCapex\s*\+|initialWorkingCapital\s*\+/);
    assert.doesNotMatch(source, /function\s+(npv|irr|payback|dscr)|calculate(Npv|Irr|Dscr|Payback)/i);
    assert.doesNotMatch(source, /(?:value|npv|irr|dscr)\s*[:=]\s*["']?1(?:\.25)?["']?/i);
  });
});
