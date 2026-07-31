import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { calculateScenarioCore } from "../src/lib/calculations";
import {
  buildManagementDashboardViewModel,
  MANAGEMENT_ACTIONS,
  MANAGEMENT_POLICY,
  selectStabilizedOperatingYear,
} from "../src/lib/dashboard-selectors";
import { seedProject } from "../src/lib/seed";
import type { Project, ScenarioOutputs } from "../src/lib/types";

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const baseResult = () => {
  const project = clone(seedProject) as Project;
  const scenario = project.scenarios.find((item) => item.id === project.activeScenarioId) ?? project.scenarios[0];
  const outputs = calculateScenarioCore(project, scenario);
  return { project, scenario, outputs };
};

describe("management dashboard production semantics", () => {
  it("keeps the existing route and render chain", () => {
    const page = readFileSync("src/app/projects/[projectId]/dashboard/management/page.tsx", "utf8");
    const modulePage = readFileSync("src/components/project/ModulePage.tsx", "utf8");
    const decisionDashboard = readFileSync("src/components/project/DecisionDashboard.tsx", "utf8");
    assert.match(page, /ModulePage slug="dashboard-management"/);
    assert.match(modulePage, /DecisionDashboard/);
    assert.match(decisionDashboard, /slug === "dashboard-management"\) return <ManagementDashboard/);
  });

  it("selects construction-only and pre-operation states without inventing actual progress", () => {
    const { project, scenario, outputs } = baseResult();
    const constructionOnly = clone(outputs) as ScenarioOutputs;
    constructionOnly.years = [0];
    constructionOnly.capacity.rows = [];
    constructionOnly.revenue.rows = [];
    constructionOnly.directCosts.rows = [];
    constructionOnly.opex.rows = [];
    constructionOnly.workingCapital.rows = [];
    constructionOnly.statements.rows = constructionOnly.statements.rows.filter((row) => row.year === 0);
    constructionOnly.valuation.annualRows = constructionOnly.valuation.annualRows.filter((row) => row.year === 0);
    const view = buildManagementDashboardViewModel(project, scenario, constructionOnly, { reportingYear: 0 });
    assert.equal(view.context.modelPhase, "construction-only");
    assert.equal(view.context.actualProgressAvailable, false);
    assert.equal(view.dimensions.find((item) => item.id === "operating-ramp-up")?.status, "not-applicable");
  });

  it("uses canonical first operating, ramp-up and stabilized years", () => {
    const { project, scenario, outputs } = baseResult();
    const stabilized = selectStabilizedOperatingYear(scenario, outputs);
    const view = buildManagementDashboardViewModel(project, scenario, outputs);
    const first = outputs.years.filter((year) => year > 0).toSorted((left, right) => left - right)[0] ?? null;
    assert.equal(view.context.firstOperatingYear, first);
    assert.equal(view.context.stabilizedOperatingYear, stabilized);
    const production = view.operatingSummaries.find((summary) => summary.id === "production");
    assert.equal(production?.first.year, first);
    assert.equal(production?.first.value, outputs.capacity.rows.find((row) => row.year === first)?.productionVolume);
    assert.equal(production?.stabilized.year, stabilized);
    assert.equal(production?.stabilized.value, outputs.capacity.rows.find((row) => row.year === stabilized)?.productionVolume);
    if (first !== null && stabilized !== null && first < stabilized) {
      const ramp = buildManagementDashboardViewModel(project, scenario, outputs, { reportingYear: first });
      assert.equal(ramp.context.modelPhase, "ramp-up");
    }
  });

  it("selects peak construction CAPEX and occurrence month from the canonical monthly schedule", () => {
    const { project, scenario, outputs } = baseResult();
    const expected = outputs.construction.rows.reduce((peak, row) => row.adjustedCapex > peak.adjustedCapex ? row : peak, outputs.construction.rows[0]);
    const view = buildManagementDashboardViewModel(project, scenario, outputs);
    assert.equal(view.metrics["peak-construction-capex"].value, expected.adjustedCapex);
    assert.equal(view.metrics["peak-construction-capex"].occurrenceMonth, expected.monthNumber);
  });

  it("selects peak working-capital need and occurrence year from the working-capital engine", () => {
    const { project, scenario, outputs } = baseResult();
    const expected = outputs.workingCapital.rows.filter((row) => row.year > 0).reduce((peak, row) => row.workingCapital > peak.workingCapital ? row : peak);
    const view = buildManagementDashboardViewModel(project, scenario, outputs);
    assert.equal(view.metrics["peak-working-capital"].value, expected.workingCapital);
    assert.equal(view.metrics["peak-working-capital"].occurrenceYear, expected.year);
  });

  it("allows active-versus-base comparison only for genuinely calculated aligned outputs", () => {
    const project = clone(seedProject) as Project;
    const base = project.scenarios.find((scenario) => scenario.type === "base");
    const downside = project.scenarios.find((scenario) => scenario.type === "pessimistic");
    assert.ok(base);
    assert.ok(downside);
    const downsideOutputs = calculateScenarioCore(project, downside);
    let view = buildManagementDashboardViewModel(project, downside, downsideOutputs);
    assert.equal(view.scenarioComparison.status, "unavailable");
    assert.match(view.scenarioComparison.reason, /سناریوی مبنا/);
    base.outputs = calculateScenarioCore(project, base);
    view = buildManagementDashboardViewModel(project, downside, downsideOutputs);
    assert.ok(["available", "partial"].includes(view.scenarioComparison.status));
    const capex = view.scenarioComparison.rows.find((row) => row.id === "capex");
    assert.equal(capex?.activeValue, downsideOutputs.capex.totalCapex);
    assert.equal(capex?.baseValue, base.outputs.capex.totalCapex);
    assert.equal(capex?.delta, downsideOutputs.capex.totalCapex - base.outputs.capex.totalCapex);
    assert.equal(buildManagementDashboardViewModel(project, downside, downsideOutputs, { dirty: true }).scenarioComparison.status, "stale");
  });

  it("preserves null and unavailable states instead of coercing them to zero", () => {
    const { project, scenario, outputs } = baseResult();
    const missing = clone(outputs) as ScenarioOutputs;
    missing.workingCapital.rows = [];
    const view = buildManagementDashboardViewModel(project, scenario, missing);
    assert.equal(view.metrics["peak-working-capital"].value, null);
    assert.equal(view.metrics["peak-working-capital"].status, "unavailable");
    assert.notEqual(view.metrics["peak-working-capital"].value, 0);
  });

  it("marks governed results stale and blocks a definitive conclusion", () => {
    const { project, scenario, outputs } = baseResult();
    const view = buildManagementDashboardViewModel(project, scenario, outputs, { dirty: true });
    assert.equal(view.context.freshness, "stale");
    assert.equal(view.conclusion.definitive, false);
    assert.ok(view.dimensions.filter((item) => item.status !== "not-applicable").every((item) => item.status === "stale"));
    assert.equal(view.exceptions[0]?.actionId, MANAGEMENT_ACTIONS.recalculate.id);
  });

  it("keeps thresholds, evidence codes, statuses and action identifiers in the semantic layer", () => {
    const { project, scenario, outputs } = baseResult();
    const view = buildManagementDashboardViewModel(project, scenario, outputs);
    assert.equal(MANAGEMENT_POLICY.minimumCurrentRatio, 1);
    assert.ok(view.dimensions.every((dimension) => dimension.evidenceCode.length > 0));
    assert.ok(view.exceptions.every((issue) => issue.actionId.length > 0));
    const source = readFileSync("src/components/project/ManagementDashboard.tsx", "utf8");
    assert.doesNotMatch(source, /currentRatio\s*[<>]=?\s*1/);
    assert.doesNotMatch(source, /revise-construction-funding|complete-working-capital|recalculate-model/);
  });

  it("preserves construction and annual period alignment and deterministic exception priority", () => {
    const { project, scenario, outputs } = baseResult();
    const view = buildManagementDashboardViewModel(project, scenario, outputs);
    assert.deepEqual(view.constructionSeries.map((row) => row.month), outputs.construction.rows.map((row) => row.monthNumber));
    assert.deepEqual(view.operatingSeries.map((row) => row.year), outputs.years.filter((year) => year > 0).toSorted((left, right) => left - right));
    assert.deepEqual(view.exceptions.map((issue) => issue.priority), view.exceptions.map((issue) => issue.priority).toSorted((left, right) => left - right));
    assert.ok(view.exceptions.length <= MANAGEMENT_POLICY.maximumExceptions);
  });

  it("uses only real module routes and contains no dead anchors", () => {
    const { project, scenario, outputs } = baseResult();
    const view = buildManagementDashboardViewModel(project, scenario, outputs);
    const routePages = new Map([
      ["../setup", "src/app/projects/[projectId]/setup/page.tsx"],
      ["../construction-cashflow", "src/app/projects/[projectId]/construction-cashflow/page.tsx"],
      ["../capex", "src/app/projects/[projectId]/capex/page.tsx"],
      ["../capacity-production", "src/app/projects/[projectId]/capacity-production/page.tsx"],
      ["../revenue", "src/app/projects/[projectId]/revenue/page.tsx"],
      ["../opex", "src/app/projects/[projectId]/opex/page.tsx"],
      ["../working-capital", "src/app/projects/[projectId]/working-capital/page.tsx"],
      ["../financing", "src/app/projects/[projectId]/financing/page.tsx"],
      ["../financial-statements", "src/app/projects/[projectId]/financial-statements/page.tsx"],
      ["../valuation", "src/app/projects/[projectId]/valuation/page.tsx"],
      ["../scenarios", "src/app/projects/[projectId]/scenarios/page.tsx"],
      ["../sensitivity", "src/app/projects/[projectId]/sensitivity/page.tsx"],
    ]);
    const drilldowns = new Set([
      ...view.dimensions.map((item) => item.drilldown),
      ...Object.values(view.metrics).map((item) => item.drilldown),
      ...view.exceptions.map((item) => item.drilldown),
      ...view.scenarioComparison.rows.map((item) => item.drilldown),
    ]);
    for (const drilldown of drilldowns) {
      const page = routePages.get(drilldown);
      assert.ok(page, `unapproved management drill-down: ${drilldown}`);
      assert.equal(existsSync(page), true, `missing route page: ${page}`);
    }
    assert.doesNotMatch(readFileSync("src/components/project/ManagementDashboard.tsx", "utf8"), /href=["'{`]#|placeholder/i);
  });

  it("keeps financial formulas and Executive/Bank KPI blocks out of Management JSX", () => {
    const source = readFileSync("src/components/project/ManagementDashboard.tsx", "utf8");
    assert.doesNotMatch(source, /outputs\.(capex|construction|workingCapital|statements|valuation|financing)/);
    assert.doesNotMatch(source, /\b(NPV|IRR|DSCR|payback|LLCR|PLCR)\b/);
    assert.doesNotMatch(source, /درصد پیشرفت|ارزش کسب‌شده|انحراف از برنامه/);
    assert.match(source, /داده پیشرفت واقعی.*موجود نیست/);
  });
});
