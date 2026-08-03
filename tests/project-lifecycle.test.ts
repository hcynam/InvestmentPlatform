import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { calculateScenario } from "../src/lib/calculations";
import { buildDashboardViewModel, buildManagementDashboardViewModel } from "../src/lib/dashboard-selectors";
import { createBlankProject } from "../src/lib/project-factory";
import {
  LEGACY_PROJECT_STORAGE_KEY,
  PROJECTS_STORAGE_KEY,
  loadProjects,
  saveProject,
  type ProjectStorage,
} from "../src/lib/project-storage";
import { seedProject } from "./fixtures/seed-project";

class MemoryStorage implements ProjectStorage {
  readonly values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }

  removeItem(key: string) {
    this.values.delete(key);
  }
}

const newProjectInput = {
  name: "پروژه واقعی کاربر",
  code: "REAL-001",
  projectType: "انرژی" as const,
  baseYear: 2026,
  constructionStartDate: "2026-09-01",
  constructionDurationMonths: 9,
  analysisHorizonYears: 20,
  baseCurrency: "ریال" as const,
  calculationBasis: "واقعی" as const,
  displayUnit: "billion-rial" as const,
};

describe("clean project lifecycle", () => {
  it("keeps an empty storage empty without creating a project", () => {
    const storage = new MemoryStorage();
    assert.deepEqual(loadProjects(storage), []);
    assert.equal(storage.values.size, 0);
  });

  it("removes only the recognized legacy demo and preserves real projects", () => {
    const storage = new MemoryStorage();
    const realProject = createBlankProject(newProjectInput, {
      id: "real-project-1",
      now: "2026-08-03T00:00:00.000Z",
    });
    storage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify([realProject]));
    storage.setItem(LEGACY_PROJECT_STORAGE_KEY, JSON.stringify(seedProject));

    const projects = loadProjects(storage);

    assert.deepEqual(projects.map((project) => project.id), ["real-project-1"]);
    assert.equal(storage.getItem(LEGACY_PROJECT_STORAGE_KEY), null);
    assert.deepEqual(
      JSON.parse(storage.getItem(PROJECTS_STORAGE_KEY) ?? "[]").map((project: { id: string }) => project.id),
      ["real-project-1"],
    );
  });

  it("migrates a non-demo legacy project instead of deleting it", () => {
    const storage = new MemoryStorage();
    const realProject = createBlankProject(newProjectInput, {
      id: "legacy-real-project",
      now: "2026-08-03T00:00:00.000Z",
    });
    storage.setItem(LEGACY_PROJECT_STORAGE_KEY, JSON.stringify(realProject));

    assert.deepEqual(loadProjects(storage).map((project) => project.id), ["legacy-real-project"]);
    assert.equal(storage.getItem(LEGACY_PROJECT_STORAGE_KEY), null);
  });

  it("creates and persists a project with no demo financial records or fabricated KPI", () => {
    const storage = new MemoryStorage();
    const project = createBlankProject(newProjectInput, {
      id: "real-project-2",
      now: "2026-08-03T00:00:00.000Z",
    });

    saveProject(storage, project);
    const restored = loadProjects(storage)[0];
    const assumptions = restored.scenarios[0].assumptions;
    const outputs = calculateScenario(restored);
    const executive = buildDashboardViewModel(restored, restored.scenarios[0], outputs);
    const management = buildManagementDashboardViewModel(restored, restored.scenarios[0], outputs);

    assert.equal(restored.id, "real-project-2");
    assert.equal(restored.scenarios.length, 1);
    assert.deepEqual(assumptions.capex.items, []);
    assert.deepEqual(assumptions.opex.items, []);
    assert.deepEqual(assumptions.financing.instruments, []);
    assert.deepEqual(assumptions.economic.externalities, []);
    assert.deepEqual(assumptions.sensitivity.variables, []);
    assert.deepEqual(assumptions.monteCarlo.variables, []);
    assert.equal(outputs.valuation.metrics.npv.status, "invalid_input");
    assert.equal(outputs.valuation.metrics.irr.value, null);
    assert.ok(Object.values(executive.metrics).every((metric) => metric.value === null && metric.status !== "available"));
    assert.deepEqual(executive.annualSeries, []);
    assert.equal(management.context.calculationState, "unavailable");
    assert.equal(management.metrics["construction-duration"].value, 9);
    assert.ok(Object.entries(management.metrics)
      .filter(([id]) => id !== "construction-duration")
      .every(([, metric]) => metric.value === null && metric.status === "unavailable"));
    assert.doesNotMatch(JSON.stringify(restored), /solar-kerman|نیروگاه خورشیدی|IR-FS-2026-001/);
  });
});
