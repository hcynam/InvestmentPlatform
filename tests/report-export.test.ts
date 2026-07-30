import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { calculateScenarioCore } from "../src/lib/calculations";
import { buildDashboardViewModel, formatDashboardMetric } from "../src/lib/dashboard-selectors";
import { buildReportCsv, buildReportHtml } from "../src/lib/report-export";
import { seedProject } from "../src/lib/seed";
import type { Project } from "../src/lib/types";

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const fixture = () => {
  const project = clone(seedProject) as Project;
  const scenario = project.scenarios[0];
  const outputs = calculateScenarioCore(project, scenario);
  const view = buildDashboardViewModel(project, scenario, outputs);
  return { project, scenario, outputs, view };
};

describe("dashboard and report parity", () => {
  it("uses identical canonical NPV, ENPV and minimum DSCR values", () => {
    const { project, scenario, outputs, view } = fixture();
    const csv = buildReportCsv(project, scenario, outputs, view);
    for (const id of ["project-npv", "enpv", "minimum-dscr"] as const) {
      const metric = view.metrics[id];
      assert.match(csv, new RegExp(String(metric.value)));
      assert.match(csv, new RegExp(formatDashboardMetric(metric, project).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }
    assert.equal(view.metrics["project-npv"].value, outputs.valuation.metrics.npv.value);
    assert.equal(view.metrics.enpv.value, outputs.economic.summary.metrics.enpv.value);
    assert.equal(view.metrics["minimum-dscr"].value, outputs.financing.minimumDscr);
  });

  it("includes shared scenario, period, basis, unit and calculation metadata", () => {
    const { project, scenario, outputs, view } = fixture();
    const html = buildReportHtml("board", project, scenario, outputs, view);
    assert.match(html, new RegExp(view.context.scenarioName));
    assert.match(html, new RegExp(view.context.periodLabel));
    assert.match(html, new RegExp(view.context.calculationBasis));
    assert.match(html, new RegExp(view.context.displayUnit));
    assert.match(html, new RegExp(view.context.calculatedAt));
  });

  it("blocks report generation while results are stale", () => {
    const { project, scenario, outputs } = fixture();
    const stale = buildDashboardViewModel(project, scenario, outputs, { dirty: true });
    assert.throws(
      () => buildReportHtml("board", project, scenario, outputs, stale),
      /محاسبه مجدد/,
    );
    assert.throws(
      () => buildReportCsv(project, scenario, outputs, stale),
      /محاسبه مجدد/,
    );
  });
});
