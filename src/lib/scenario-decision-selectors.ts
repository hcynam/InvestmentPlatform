import {
  buildDashboardViewModel,
  type DashboardMetric,
  type DashboardMetricId,
  type DashboardMetricUnit,
} from "@/lib/dashboard-selectors";
import type { Project, Scenario, ScenarioOutputs } from "@/lib/types";

export const scenarioDecisionKpiIds = [
  "project-npv",
  "project-irr",
  "minimum-dscr",
  "discounted-project-payback",
  "total-capex",
  "funding-gap",
  "enpv",
] as const satisfies readonly DashboardMetricId[];

export type ScenarioDecisionKpiId = typeof scenarioDecisionKpiIds[number];

export type ScenarioDecisionKpi = {
  id: ScenarioDecisionKpiId;
  label: string;
  unit: DashboardMetricUnit;
  value: number | null;
  status: DashboardMetric["status"];
  reason?: string;
  thresholdStatus: DashboardMetric["comparison"];
  delta: number | null;
  deltaPercent: number | null;
  unchanged: boolean;
};

export type ScenarioDecisionResult = {
  scenario: Scenario;
  outputs: ScenarioOutputs;
};

const finite = (value: number | null | undefined): value is number =>
  typeof value === "number" && Number.isFinite(value);

const percentDelta = (value: number | null, baseValue: number | null) =>
  finite(value) && finite(baseValue) && baseValue !== 0 ? (value - baseValue) / Math.abs(baseValue) : null;

export const selectScenarioDecisionKpis = (
  project: Project,
  result: ScenarioDecisionResult,
  baseResult: ScenarioDecisionResult,
): ScenarioDecisionKpi[] => {
  const selected = buildDashboardViewModel(project, result.scenario, result.outputs).metrics;
  const base = buildDashboardViewModel(project, baseResult.scenario, baseResult.outputs).metrics;
  return scenarioDecisionKpiIds.map((id) => {
    const metric = selected[id];
    const baseMetric = base[id];
    const delta = finite(metric.value) && finite(baseMetric.value) ? metric.value - baseMetric.value : null;
    return {
      id,
      label: metric.title,
      unit: metric.unit,
      value: metric.value,
      status: metric.status,
      reason: metric.reason,
      thresholdStatus: metric.comparison,
      delta,
      deltaPercent: id === "total-capex" ? percentDelta(metric.value, baseMetric.value) : null,
      unchanged: delta === 0,
    };
  });
};

export type ScenarioComparisonColumn = {
  scenarioId: string;
  scenarioName: string;
  kpis: ScenarioDecisionKpi[];
};

export const selectScenarioComparison = (
  project: Project,
  baseResult: ScenarioDecisionResult,
  results: ScenarioDecisionResult[],
): ScenarioComparisonColumn[] => results.map((result) => ({
  scenarioId: result.scenario.id,
  scenarioName: result.scenario.name,
  kpis: selectScenarioDecisionKpis(project, result, baseResult),
}));
