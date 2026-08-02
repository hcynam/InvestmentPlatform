import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { calculateScenarioCore } from "../src/lib/calculations";
import { buildProjectOverviewViewModel } from "../src/lib/dashboard-selectors";
import { seedProject } from "../src/lib/seed";
import type { Project, ScenarioOutputs, ValidationIssue } from "../src/lib/types";

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const sourceProject = clone(seedProject) as Project;
const sourceScenario = sourceProject.scenarios.find((item) => item.id === sourceProject.activeScenarioId) ?? sourceProject.scenarios[0];
const sourceOutputs = calculateScenarioCore(sourceProject, sourceScenario);

const fixture = () => {
  const project = clone(sourceProject);
  const outputs = clone(sourceOutputs) as ScenarioOutputs;
  outputs.validations = [];
  return { project, outputs };
};

const issue = (
  id: string,
  severity: ValidationIssue["severity"] = "error",
  module = "setup",
): ValidationIssue => ({
  id,
  severity,
  module,
  message: `پیام واقعی ${id}`,
});

describe("project overview operational selector", () => {
  it("marks the project blocked when an error validation exists", () => {
    const { project, outputs } = fixture();
    outputs.validations = [issue("setup.required")];
    const view = buildProjectOverviewViewModel(project, outputs);
    assert.equal(view.operationalState, "blocked");
    assert.equal(view.blockers[0].message, "پیام واقعی setup.required");
  });

  it("gives blocked priority over dirty and stale states", () => {
    const { project, outputs } = fixture();
    outputs.validations = [issue("financing.invalid", "error", "financing")];
    const view = buildProjectOverviewViewModel(project, outputs, { dirty: true, stale: true });
    assert.equal(view.operationalState, "blocked");
  });

  it("requires recalculation when current inputs are dirty", () => {
    const { project, outputs } = fixture();
    const view = buildProjectOverviewViewModel(project, outputs, { dirty: true });
    assert.equal(view.operationalState, "recalculation-required");
    assert.deepEqual(view.primaryAction, { kind: "calculate", label: "محاسبه مجدد" });
  });

  it("requires recalculation when an upstream selector reports stale results", () => {
    const { project, outputs } = fixture();
    const view = buildProjectOverviewViewModel(project, outputs, { stale: true });
    assert.equal(view.operationalState, "recalculation-required");
  });

  it("marks a project without generatedAt as not calculated", () => {
    const { project, outputs } = fixture();
    outputs.generatedAt = "";
    const view = buildProjectOverviewViewModel(project, outputs);
    assert.equal(view.operationalState, "not-calculated");
    assert.equal(view.generatedAt, null);
    assert.deepEqual(view.primaryAction, { kind: "calculate", label: "محاسبه پروژه" });
  });

  it("marks clean calculated results current", () => {
    const { project, outputs } = fixture();
    const view = buildProjectOverviewViewModel(project, outputs);
    assert.equal(view.operationalState, "current");
    assert.equal(view.generatedAt, outputs.generatedAt);
  });

  it("shows no more than three error blockers in module order", () => {
    const { project, outputs } = fixture();
    outputs.validations = [
      issue("unknown.first", "error", "unknown-module"),
      issue("financing.error", "error", "financing"),
      issue("setup.error", "error", "setup"),
      issue("capex.error", "error", "capex"),
    ];
    const view = buildProjectOverviewViewModel(project, outputs);
    assert.equal(view.blockers.length, 3);
    assert.deepEqual(view.blockers.map((blocker) => blocker.id), ["setup.error", "capex.error", "financing.error"]);
  });

  it("does not treat warnings as blockers", () => {
    const { project, outputs } = fixture();
    outputs.validations = [issue("setup.warning", "warning")];
    const view = buildProjectOverviewViewModel(project, outputs);
    assert.equal(view.operationalState, "current");
    assert.deepEqual(view.blockers, []);
  });

  it("uses the canonical executive dashboard route for current results", () => {
    const { project, outputs } = fixture();
    const view = buildProjectOverviewViewModel(project, outputs);
    assert.deepEqual(view.primaryAction, {
      kind: "navigate",
      label: "مشاهده داشبورد اجرایی",
      href: `/projects/${project.id}/dashboard/executive`,
    });
  });

  it("falls back to the validation drawer when a blocker module has no valid route", () => {
    const { project, outputs } = fixture();
    outputs.validations = [issue("unknown.error", "error", "unknown-module")];
    const view = buildProjectOverviewViewModel(project, outputs);
    assert.deepEqual(view.primaryAction, { kind: "open-validation", label: "رفع اولین مانع" });
    assert.equal(view.blockers[0].href, null);
  });
});
