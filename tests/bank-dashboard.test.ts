import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { calculateScenario, calculateScenarioCore } from "../src/lib/calculations";
import {
  BANK_DASHBOARD_POLICY,
  buildBankDashboardViewModel,
} from "../src/lib/dashboard-selectors";
import { seedProject } from "../src/lib/seed";
import type { Project, ScenarioOutputs } from "../src/lib/types";

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const fixture = () => {
  const project = clone(seedProject) as Project;
  const scenario = project.scenarios.find((item) => item.id === project.activeScenarioId) ?? project.scenarios[0];
  const outputs = calculateScenarioCore(project, scenario);
  const view = buildBankDashboardViewModel(project, scenario, outputs);
  return { project, scenario, outputs, view };
};

describe("production Bank & Financing Dashboard", () => {
  it("shows an explicit no-debt state without zero-valued banking KPIs", () => {
    const project = clone(seedProject) as Project;
    const scenario = project.scenarios[0];
    scenario.assumptions.financing.longTermDebt = 0;
    scenario.assumptions.financing.shortTermDebt = 0;
    scenario.assumptions.financing.instruments?.forEach((instrument) => {
      instrument.active = false;
      instrument.amount = 0;
    });
    const outputs = calculateScenarioCore(project, scenario);
    const view = buildBankDashboardViewModel(project, scenario, outputs);
    assert.equal(view.context.hasDebt, false);
    assert.equal(view.creditConclusion.status, "not-applicable");
    assert.equal(view.metrics["minimum-dscr"].value, null);
    assert.equal(view.metrics["minimum-dscr"].status, "not-applicable");
    assert.equal(view.timeline.length, 0);
  });

  it("preserves canonical minimum and average DSCR over debt-service years only", () => {
    const { outputs, view } = fixture();
    const debtServiceDscr = outputs.financing.annualSchedule
      .filter((row) => row.debtService > 0 && row.dscr !== null)
      .map((row) => Number(row.dscr));
    const expectedMinimum = Math.min(...debtServiceDscr);
    const expectedAverage = debtServiceDscr.reduce((sum, value) => sum + value, 0) / debtServiceDscr.length;
    assert.equal(view.metrics["minimum-dscr"].value, outputs.financing.minimumDscr);
    assert.equal(view.metrics["minimum-dscr"].value, expectedMinimum);
    assert.equal(view.metrics["average-dscr"].value, outputs.financing.averageDscr);
    assert.ok(Math.abs(Number(view.metrics["average-dscr"].value) - expectedAverage) < 1e-12);
    assert.ok(outputs.financing.annualSchedule.some((row) => row.debtService === 0 && row.dscr === null));
  });

  it("uses the first principal-repayment year rather than the first operating year", () => {
    const { outputs, view } = fixture();
    const firstRepayment = outputs.financing.annualSchedule.find((row) => row.principalRepayment > 0);
    assert.ok(firstRepayment);
    assert.equal(view.metrics["first-repayment-dscr"].occurrenceYear, firstRepayment.year);
    assert.equal(view.metrics["first-repayment-dscr"].value, firstRepayment.dscr);
    assert.notEqual(firstRepayment.year, 1);
  });

  it("propagates null and stale states and blocks a definitive conclusion", () => {
    const { project, scenario, outputs } = fixture();
    const missing = clone(outputs) as ScenarioOutputs;
    missing.financing.minimumDscr = null;
    missing.financing.averageDscr = null;
    const incomplete = buildBankDashboardViewModel(project, scenario, missing);
    assert.equal(incomplete.metrics["minimum-dscr"].value, null);
    assert.equal(incomplete.metrics["minimum-dscr"].status, "unavailable");
    assert.equal(incomplete.creditConclusion.definitive, false);
    const stale = buildBankDashboardViewModel(project, scenario, outputs, { dirty: true });
    assert.equal(stale.metrics["minimum-dscr"].status, "stale");
    assert.equal(stale.creditConclusion.status, "recalculation-required");
    assert.equal(stale.creditConclusion.definitive, false);
  });

  it("centralizes covenant, leverage, interest and collateral thresholds in the semantic layer", () => {
    const { scenario, view } = fixture();
    assert.equal(view.metrics["minimum-dscr"].threshold?.value, scenario.assumptions.financing.targetDscr);
    assert.equal(view.metrics["debt-to-equity"].threshold?.value, scenario.assumptions.financing.targetDebtToEquity);
    assert.equal(view.metrics["interest-coverage"].threshold?.value, BANK_DASHBOARD_POLICY.minimumInterestCoverage);
    assert.equal(view.metrics["collateral-coverage"].threshold?.value, BANK_DASHBOARD_POLICY.minimumCollateralCoverage);
  });

  it("keeps the annual timeline identical to financing schedule values and flags only covenant breaches", () => {
    const { outputs, scenario, view } = fixture();
    for (const row of view.timeline) {
      const canonical = outputs.financing.annualSchedule.find((item) => item.year === row.year);
      assert.ok(canonical);
      assert.equal(row.dscr, canonical.dscr);
      assert.equal(row.principal, canonical.principalRepayment);
      assert.equal(row.interest, canonical.interest);
      assert.equal(row.debtService, canonical.debtService);
      assert.equal(row.outstandingDebt, canonical.endingBalance);
      assert.equal(row.status === "risk", canonical.debtService > 0 && canonical.dscr !== null && canonical.dscr < scenario.assumptions.financing.targetDscr);
    }
  });

  it("publishes stress DSCR only after genuine sensitivity-engine recalculation", () => {
    const project = clone(seedProject) as Project;
    const scenario = project.scenarios[0];
    scenario.assumptions.sensitivity.selectedMetric = "DSCR";
    const outputs = calculateScenario(project, scenario);
    const view = buildBankDashboardViewModel(project, scenario, outputs);
    assert.equal(outputs.sensitivity.selectedMetric, "DSCR");
    assert.ok(view.stressCases.some((stress) => stress.status === "available"));
    const priceStress = view.stressCases.find((stress) => stress.id === "price");
    const canonicalPoint = outputs.sensitivity.oneWay
      .filter((point) => /salesprice|قیمت فروش/i.test(`${point.variableId} ${point.variable}`) && point.shock < 0)
      .toSorted((left, right) => left.shock - right.shock)[0];
    assert.ok(priceStress && canonicalPoint);
    assert.equal(priceStress.dscr, canonicalPoint.metric);
    assert.equal(priceStress.shock, canonicalPoint.shock);

    const notDscr = calculateScenarioCore(project, { ...scenario, assumptions: { ...scenario.assumptions, sensitivity: { ...scenario.assumptions.sensitivity, selectedMetric: "NPV" } } });
    const unavailable = buildBankDashboardViewModel(project, scenario, notDscr);
    assert.ok(unavailable.stressCases.every((stress) => stress.status === "unavailable"));
  });

  it("uses working financing anchors and responsive overflow-safe UI without JSX formulas", () => {
    const selectorSource = readFileSync("src/lib/dashboard-selectors.ts", "utf8");
    const dashboardSource = readFileSync("src/components/project/DecisionDashboard.tsx", "utf8");
    const financingSource = readFileSync("src/components/project/FinancingWorkspace.tsx", "utf8");
    const css = readFileSync("src/styles/globals.css", "utf8");
    const bankBranch = dashboardSource.slice(dashboardSource.indexOf("function BankDashboard"), dashboardSource.indexOf("function ManagementDashboard"));
    assert.match(selectorSource, /financing#financing-debt-service-schedule/);
    assert.match(selectorSource, /financing#financing-cost-schedule/);
    assert.match(financingSource, /id="financing-facilities"/);
    assert.match(financingSource, /id="financing-cost-schedule"/);
    assert.match(financingSource, /id="financing-debt-service-schedule"/);
    assert.doesNotMatch(bankBranch, /outputs\.financing|outputs\.statements|safeDivide|calculateDSCR/);
    assert.match(css, /\.bank-timeline-table\s*\{[\s\S]*?overflow-x: auto/);
    assert.match(css, /@media \(max-width: 1100px\)[\s\S]*?\.bank-kpi-grid/);
    assert.match(css, /@media \(max-width: 720px\)[\s\S]*?\.bank-context[\s\S]*?grid-template-columns: 1fr/);
  });
});
