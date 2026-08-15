import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { calculateScenario, calculateScenarioCore } from "../src/lib/calculations";
import {
  buildSensitivityTornado,
  isSensitivitySnapshotCurrent,
  selectSensitivityRunVariables,
  sensitivityConfigsEqual,
  validateSensitivityConfiguration,
  withSensitivityMetricDraft,
} from "../src/lib/sensitivity-engine";
import { classifySensitivityHeatmapCell } from "../src/lib/sensitivity-format";
import {
  applyRiskVariableShock,
  defaultRiskVariable,
  getRiskBaseValue,
  resolveRiskVariablesFromSensitivity,
  runnableRiskVariableKinds,
} from "../src/lib/risk-variable-engine";
import { projectForStorage } from "../src/store/project-context";
import { seedProject } from "./fixtures/seed-project";
import type { Project, SensitivityAssumptions, SensitivityMetric, SensitivityPoint, SensitivityVariable } from "../src/lib/types";

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const variable = (
  id: string,
  parameter: string,
  low: number,
  high: number,
  changeType: SensitivityVariable["changeType"] = "percent",
  steps = 3,
): SensitivityVariable => ({ id, parameter, label: parameter, low, high, steps, changeType });

const configuredProject = (
  metric: SensitivityMetric,
  variables: SensitivityVariable[],
  prepare?: (project: Project) => void,
  options?: Partial<SensitivityAssumptions>,
) => {
  const project = clone(seedProject) as Project;
  prepare?.(project);
  const scenario = project.scenarios[0];
  project.activeScenarioId = scenario.id;
  scenario.assumptions.sensitivity = {
    ...scenario.assumptions.sensitivity,
    selectedMetric: metric,
    variables,
    matrixEnabled: false,
    thresholdVariableId: null,
    ...options,
  };
  return { project, scenario };
};

const runSensitivity = (
  metric: SensitivityMetric,
  variables: SensitivityVariable[],
  prepare?: (project: Project) => void,
  options?: Partial<SensitivityAssumptions>,
) => {
  const state = configuredProject(metric, variables, prepare, options);
  return { ...state, outputs: calculateScenario(state.project, state.scenario) };
};

const pointsFor = (outputs: ReturnType<typeof calculateScenario>, variableId: string) => outputs.sensitivity.oneWay.filter((point) => point.variableId === variableId);
const pointAt = (outputs: ReturnType<typeof calculateScenario>, variableId: string, shock: number) => {
  const point = pointsFor(outputs, variableId).find((item) => Math.abs(item.shock - shock) < 1e-9);
  assert.ok(point, `missing point ${variableId} shock ${shock}`);
  return point;
};

const mixedSignProject = () => {
  const project = clone(seedProject) as Project;
  const assumptions = project.scenarios[0].assumptions;
  assumptions.market.baseSalesPrice *= 500;
  assumptions.market.unitSalesPrice *= 500;
  assumptions.capex.items = assumptions.capex.items.map((item) => ({
    ...item,
    rialUnitPrice: item.rialUnitPrice * 0.01,
    fxUnitPrice: item.fxUnitPrice * 0.01,
    unitPrice: item.unitPrice * 0.01,
    installationCost: item.installationCost * 0.01,
    transportInsuranceCost: item.transportInsuranceCost * 0.01,
    trainingCost: item.trainingCost * 0.01,
    preOperationCost: item.preOperationCost * 0.01,
    indirectProjectCost: item.indirectProjectCost * 0.01,
    permitCost: item.permitCost * 0.01,
    monthlyDelayCost: item.monthlyDelayCost * 0.01,
  }));
  return project;
};

describe("sensitivity core and modeling contracts", () => {
  it("keeps zero-shock parity for every runnable driver", () => {
    for (const kind of runnableRiskVariableKinds) {
      const project = clone(seedProject) as Project;
      const scenario = project.scenarios[0];
      if (kind === "salesVolume" && getRiskBaseValue(kind, scenario, calculateScenarioCore(project, scenario)) === 0) continue;
      const baseOutputs = calculateScenarioCore(project, scenario);
      const shocked = applyRiskVariableShock(project, scenario, defaultRiskVariable(kind), 0, baseOutputs);
      assert.deepEqual(shocked.scenario.assumptions, scenario.assumptions, `neutral ${kind} changed assumptions`);
      const outputs = calculateScenarioCore(shocked.project, shocked.scenario);
      assert.equal(outputs.valuation.npv, baseOutputs.valuation.npv, `neutral ${kind} changed NPV`);
    }
  });

  it("preserves multi-instrument debt rates at zero shock", () => {
    const project = clone(seedProject) as Project;
    const scenario = project.scenarios[0];
    const instruments = scenario.assumptions.financing.instruments!;
    instruments[1].active = true;
    instruments[1].amount = 100_000_000;
    const baseOutputs = calculateScenarioCore(project, scenario);
    const before = instruments.map((item) => item.annualRate);
    const shocked = applyRiskVariableShock(project, scenario, defaultRiskVariable("debtInterest"), 0, baseOutputs);
    assert.deepEqual(shocked.scenario.assumptions.financing.instruments!.map((item) => item.annualRate), before);
  });

  it("adds a shared pp delta while preserving debt-rate heterogeneity", () => {
    const project = clone(seedProject) as Project;
    const scenario = project.scenarios[0];
    const instruments = scenario.assumptions.financing.instruments!;
    instruments[1].active = true;
    instruments[1].amount = 100_000_000;
    instruments[0].annualRate = 0.2;
    instruments[1].annualRate = 0.04;
    const baseOutputs = calculateScenarioCore(project, scenario);
    const shocked = applyRiskVariableShock(project, scenario, defaultRiskVariable("debtInterest"), 0.02, baseOutputs);
    const rates = shocked.scenario.assumptions.financing.instruments!.slice(0, 2).map((item) => item.annualRate);
    assert.ok(Math.abs(rates[0] - 0.22) < 1e-12);
    assert.ok(Math.abs(rates[1] - 0.06) < 1e-12);
  });

  it("never mutates the base project", () => {
    const project = clone(seedProject) as Project;
    const before = clone(project);
    const scenario = project.scenarios[0];
    applyRiskVariableShock(project, scenario, defaultRiskVariable("capex"), 0.2, calculateScenarioCore(project, scenario));
    assert.deepEqual(project, before);
  });

  it("runs each point from the same base without sequential contamination", () => {
    const project = clone(seedProject) as Project;
    const scenario = project.scenarios[0];
    const baseOutputs = calculateScenarioCore(project, scenario);
    const low = applyRiskVariableShock(project, scenario, defaultRiskVariable("salesPrice"), -0.1, baseOutputs);
    const high = applyRiskVariableShock(project, scenario, defaultRiskVariable("salesPrice"), 0.1, baseOutputs);
    assert.equal(low.shockedValue, scenario.assumptions.market.baseSalesPrice * 0.9);
    assert.equal(high.shockedValue, scenario.assumptions.market.baseSalesPrice * 1.1);
  });

  it("isolates two-way cells and preserves the Base/Base cell", () => {
    const price = variable("price", "قیمت فروش", -0.1, 0.1);
    const capex = variable("capex", "CAPEX", -0.1, 0.1);
    const { outputs } = runSensitivity("NPV", [price, capex], undefined, { analysisMode: "advanced", matrixEnabled: true });
    assert.equal(outputs.sensitivity.matrix.length, 9);
    const baseCell = outputs.sensitivity.matrix.find((cell) => Math.abs(cell.rowShock) < 1e-9 && Math.abs(cell.colShock) < 1e-9);
    assert.equal(baseCell?.value, outputs.valuation.npv);
    const corner = outputs.sensitivity.matrix.find((cell) => cell.rowShock === 0.1 && cell.colShock === 0.1);
    assert.ok(corner);
    assert.equal(corner.rowValue, outputs.capex.totalCapex * 1.1);
  });

  it("uses a valid mixed-sign fixture for WACC directionality", () => {
    const project = mixedSignProject();
    const scenario = project.scenarios[0];
    scenario.assumptions.sensitivity.variables = [variable("wacc", "نرخ تنزیل", -0.05, 0.05)];
    const outputs = calculateScenario(project, scenario);
    assert.ok(outputs.valuation.fcffByYear[0] < 0);
    assert.ok(outputs.valuation.fcffByYear.slice(1).some((value) => value > 0));
    assert.ok((pointAt(outputs, "wacc", 0.05).metric ?? Infinity) < outputs.valuation.npv);
  });

  it("keeps Revenue unavailable without an independent owner", () => {
    const { project, scenario } = configuredProject("NPV", [variable("revenue", "درآمد فروش", -0.1, 0.1)]);
    const baseOutputs = calculateScenarioCore(project, scenario);
    const issues = validateSensitivityConfiguration(project, scenario, baseOutputs, scenario.assumptions.sensitivity);
    assert.ok(issues.some((issue) => issue.code === "unavailable-driver"));
    assert.equal(calculateScenario(project, scenario).sensitivity.oneWay.length, 0);
  });

  it("changes Sales Volume demand without changing physical capacity", () => {
    const project = clone(seedProject) as Project;
    const scenario = project.scenarios[0];
    const baseOutputs = calculateScenarioCore(project, scenario);
    const beforeCapacity = clone(scenario.assumptions.capacity);
    const shocked = applyRiskVariableShock(project, scenario, defaultRiskVariable("salesVolume"), 0.1, baseOutputs);
    assert.deepEqual(shocked.scenario.assumptions.capacity, beforeCapacity);
    assert.equal(shocked.scenario.assumptions.market.targetMarket, scenario.assumptions.market.targetMarket * 1.1);
  });

  it("applies Inflation as a percentage-point delta", () => {
    const project = clone(seedProject) as Project;
    const scenario = project.scenarios[0];
    const baseOutputs = calculateScenarioCore(project, scenario);
    const beforeGeneral = scenario.assumptions.macro.inflationGeneralAnnual;
    const beforePath = scenario.assumptions.macro.inflationRate;
    const shocked = applyRiskVariableShock(project, scenario, defaultRiskVariable("inflation"), 0.05, baseOutputs);
    assert.equal(shocked.scenario.assumptions.macro.inflationGeneralAnnual, beforeGeneral + 0.05);
    assert.equal(shocked.scenario.assumptions.macro.inflationRate, beforePath + 0.05);
  });

  it("uses integer absolute deltas for Delay and WC days", () => {
    const project = clone(seedProject) as Project;
    const scenario = project.scenarios[0];
    scenario.assumptions.construction.actualDelayMonths = 3;
    const baseOutputs = calculateScenarioCore(project, scenario);
    const delay = applyRiskVariableShock(project, scenario, defaultRiskVariable("delay"), 2, baseOutputs);
    const wc = applyRiskVariableShock(project, scenario, defaultRiskVariable("workingCapitalDays"), 10, baseOutputs);
    assert.equal(delay.scenario.assumptions.construction.actualDelayMonths, 5);
    assert.equal(wc.scenario.assumptions.workingCapital.receivableDays, scenario.assumptions.workingCapital.receivableDays + 10);
  });
});

describe("sensitivity validation", () => {
  const issuesFor = (entry: SensitivityVariable) => {
    const { project, scenario } = configuredProject("NPV", [entry]);
    return validateSensitivityConfiguration(project, scenario, calculateScenarioCore(project, scenario), scenario.assumptions.sensitivity);
  };

  it("rejects min greater than max", () => assert.ok(issuesFor(variable("price", "قیمت فروش", 0.2, -0.1)).some((issue) => issue.code === "invalid-range-order")));
  it("rejects non-finite and invalid point counts", () => assert.ok(issuesFor(variable("price", "قیمت فروش", -0.1, 0.1, "percent", Number.NaN)).some((issue) => issue.code === "invalid-point-count")));
  it("allows percent change on a nonzero Base", () => assert.ok(issuesFor(variable("price", "قیمت فروش", -0.1, 0.1)).some((issue) => issue.code === "percent-zero-base") === false));

  it("rejects percent change on an actual zero Base", () => {
    const { project, scenario } = configuredProject("NPV", [variable("price", "قیمت فروش", -0.1, 0.1)], (value) => {
      value.scenarios[0].assumptions.market.baseSalesPrice = 0;
      value.scenarios[0].assumptions.market.unitSalesPrice = 0;
    });
    const issues = validateSensitivityConfiguration(project, scenario, calculateScenarioCore(project, scenario), scenario.assumptions.sensitivity);
    assert.ok(issues.some((issue) => issue.code === "percent-zero-base"));
  });

  it("rejects duplicate drivers", () => {
    const { project, scenario } = configuredProject("NPV", [variable("p1", "قیمت فروش", -0.1, 0.1), variable("p2", "قیمت فروش", -0.2, 0.2)]);
    const issues = validateSensitivityConfiguration(project, scenario, calculateScenarioCore(project, scenario), scenario.assumptions.sensitivity);
    assert.ok(issues.some((issue) => issue.code === "duplicate-driver"));
  });

  it("rejects negative resulting WC days", () => assert.ok(issuesFor(variable("wc", "دوره وصول", -10_000, 10, "absolute", 4)).some((issue) => issue.code === "negative-result")));
  it("rejects Tax outside zero to one", () => assert.ok(issuesFor(variable("tax", "نرخ مالیات", -0.8, 0.8)).some((issue) => issue.code === "tax-out-of-range")));
  it("rejects negative or fractional Delay results", () => {
    const issues = issuesFor(variable("delay", "تاخیر اجرا", -10_000.5, 2.5, "absolute", 3));
    assert.ok(issues.some((issue) => issue.code === "negative-result"));
    assert.ok(issues.some((issue) => issue.code === "fractional-discrete-delta"));
  });

  it("rejects unavailable drivers and KPIs", () => {
    const { project, scenario } = configuredProject("DSCR", [variable("revenue", "درآمد فروش", -0.1, 0.1)], (value) => {
      value.scenarios[0].assumptions.financing.instruments = [];
      value.scenarios[0].assumptions.financing.longTermDebt = 0;
    });
    const issues = validateSensitivityConfiguration(project, scenario, calculateScenarioCore(project, scenario), scenario.assumptions.sensitivity);
    assert.ok(issues.some((issue) => issue.code === "unavailable-driver"));
    assert.ok(issues.some((issue) => issue.code === "unavailable-kpi"));
  });
});

describe("sensitivity state, performance and persistence", () => {
  it("marks an applied output stale after a Base revision", () => {
    const { outputs, scenario, project } = runSensitivity("NPV", [variable("price", "قیمت فروش", -0.1, 0.1)]);
    assert.ok(outputs.sensitivity.applied);
    assert.equal(isSensitivitySnapshotCurrent(outputs.sensitivity.applied, scenario.version, scenario.id, scenario.version), true);
    assert.equal(isSensitivitySnapshotCurrent(outputs.sensitivity.applied, scenario.version + 1, scenario.id, scenario.version), false);
    assert.equal(project.scenarios[0].version, scenario.version);
  });

  it("keeps draft changes separate from the applied result", () => {
    const { outputs } = runSensitivity("NPV", [variable("price", "قیمت فروش", -0.1, 0.1)]);
    const draft = clone(outputs.sensitivity.applied!.config);
    draft.variables[0].high = 0.5;
    assert.equal(sensitivityConfigsEqual(draft, outputs.sensitivity.applied!.config), false);
    assert.equal(outputs.sensitivity.applied!.config.variables[0].high, 0.1);
  });

  it("changes KPI in draft without auto-applying unrelated fields", () => {
    const settings = clone(seedProject.scenarios[0].assumptions.sensitivity);
    const next = withSensitivityMetricDraft(settings, "IRR");
    assert.equal(next.selectedMetric, "IRR");
    assert.deepEqual(next.variables, settings.variables);
    assert.equal(settings.selectedMetric, "NPV");
  });

  it("keeps matrix headers and cells on the same applied snapshot", () => {
    const { outputs } = runSensitivity("NPV", [variable("price", "قیمت فروش", -0.1, 0.1), variable("capex", "CAPEX", -0.1, 0.1)], undefined, { analysisMode: "advanced", matrixEnabled: true });
    const appliedVariables = resolveRiskVariablesFromSensitivity(outputs.sensitivity.applied!.config.variables);
    const rows = appliedVariables[1].steps ?? 0;
    const columns = appliedVariables[0].steps ?? 0;
    assert.equal(outputs.sensitivity.matrix.length, rows * columns);
    assert.ok(outputs.sensitivity.matrix.every((cell) => cell.rowVariableId === appliedVariables[1].id && cell.colVariableId === appliedVariables[0].id));
  });

  it("persists configuration but strips derived outputs", () => {
    const { project, scenario, outputs } = runSensitivity("NPV", [variable("price", "قیمت فروش", -0.1, 0.1)]);
    scenario.outputs = outputs;
    const stored = projectForStorage(project);
    assert.deepEqual(stored.scenarios[0].assumptions.sensitivity.variables, scenario.assumptions.sensitivity.variables);
    assert.equal(stored.scenarios[0].outputs, undefined);
  });

  it("runs only one real driver in Simple while preserving Advanced configuration", () => {
    const settings = clone(seedProject.scenarios[0].assumptions.sensitivity);
    settings.analysisMode = "simple";
    settings.simpleDriverId = settings.variables[1].id;
    const selected = selectSensitivityRunVariables(settings);
    assert.equal(selected.length, 1);
    assert.equal(selected[0].id, settings.variables[1].id);
    assert.equal(settings.variables.length, 3);
    settings.analysisMode = "advanced";
    assert.equal(selectSensitivityRunVariables(settings).length, 3);
  });

  it("runs only configured drivers and keeps threshold on-demand", () => {
    const { outputs } = runSensitivity("NPV", [variable("price", "قیمت فروش", -0.1, 0.1)]);
    assert.deepEqual(new Set(outputs.sensitivity.oneWay.map((point) => point.variableId)), new Set(["price"]));
    assert.equal(outputs.sensitivity.matrix.length, 0);
    assert.equal(outputs.sensitivity.breakEven.results.length, 0);
  });
});

describe("sensitivity KPI and visualization semantics", () => {
  it("uses the current applied valuation basis for IRR heatmap", () => {
    const { outputs } = runSensitivity("IRR", [variable("price", "قیمت فروش", -0.1, 0.1), variable("capex", "CAPEX", -0.1, 0.1)], (project) => {
      project.scenarios[0].assumptions.macro.calculationBasis = "واقعی";
    }, { analysisMode: "advanced", matrixEnabled: true });
    assert.notEqual(outputs.valuation.appliedDiscountRate, outputs.valuation.nominalDiscountRate);
    outputs.sensitivity.matrix.forEach((cell) => {
      assert.equal(cell.heatmapStatus, classifySensitivityHeatmapCell("IRR", cell.value, { baseValue: outputs.sensitivity.baseMetric, discountRate: outputs.valuation.appliedDiscountRate, targetDscr: seedProject.scenarios[0].assumptions.financing.targetDscr, horizonYears: seedProject.modelHorizonYears }).status);
    });
  });

  it("keeps null and unavailable values explicit", () => {
    const { outputs } = runSensitivity("DSCR", [variable("price", "قیمت فروش", -0.1, 0.1)], (project) => {
      project.scenarios[0].assumptions.financing.instruments = [];
      project.scenarios[0].assumptions.financing.longTermDebt = 0;
    });
    assert.equal(outputs.sensitivity.baseMetric, null);
    assert.equal(outputs.sensitivity.oneWay.length, 0);
    assert.ok(outputs.sensitivity.validationErrors.some((issue) => issue.code === "unavailable-kpi"));
  });

  it("produces no fake analysis for a blank project", () => {
    const { outputs } = runSensitivity("NPV", [variable("price", "قیمت فروش", -0.1, 0.1)], (project) => {
      const assumptions = project.scenarios[0].assumptions;
      assumptions.market.baseSalesPrice = 0;
      assumptions.market.unitSalesPrice = 0;
      assumptions.capex.items = assumptions.capex.items.map((item) => ({ ...item, quantity: 0, rialUnitPrice: 0, fxUnitPrice: 0, unitPrice: 0 }));
    });
    assert.equal(outputs.sensitivity.readiness.ready, false);
    assert.equal(outputs.sensitivity.oneWay.length, 0);
    assert.equal(outputs.sensitivity.matrix.length, 0);
    assert.equal(outputs.sensitivity.tornado.length, 0);
  });

  it("defines absolute impact as the larger absolute Low/High delta", () => {
    const points: SensitivityPoint[] = [
      { variableId: "v", variable: "V", sourceModule: "M", unitType: "totalMoney", shock: -0.1, changeType: "percent", baseValue: 1, shockedValue: 0.9, baseMetric: 100, metric: 60, absoluteImpact: -40, percentImpact: -0.4, elasticity: 4, status: "valid", warnings: [] },
      { variableId: "v", variable: "V", sourceModule: "M", unitType: "totalMoney", shock: 0.1, changeType: "percent", baseValue: 1, shockedValue: 1.1, baseMetric: 100, metric: 120, absoluteImpact: 20, percentImpact: 0.2, elasticity: 2, status: "valid", warnings: [] },
    ];
    const tornado = buildSensitivityTornado([{ ...defaultRiskVariable("salesPrice"), id: "v" }], points, 100)[0];
    assert.equal(Math.max(Math.abs(tornado.lowDelta ?? 0), Math.abs(tornado.highDelta ?? 0)), 40);
  });

  it("does not fabricate a universal immaterial classification", () => {
    const { outputs } = runSensitivity("BCR", [variable("price", "قیمت فروش", -0.000001, 0.000001)]);
    assert.ok(outputs.sensitivity.oneWay.every((point) => point.status !== "immaterial"));
    assert.ok(outputs.sensitivity.tornado.every((item) => item.status !== "immaterial"));
  });

  it("computes a bounded NPV threshold only for the requested driver", () => {
    const { outputs } = runSensitivity("BCR", [variable("price", "قیمت فروش", -0.1, 0.1)], undefined, { thresholdVariableId: "price", analysisMode: "advanced" });
    assert.equal(outputs.sensitivity.breakEven.results.length, 1);
    assert.equal(outputs.sensitivity.breakEven.results[0].label, "آستانه NPV — قیمت فروش");
    assert.equal(outputs.sensitivity.breakEven.results[0].target.label, "NPV = 0");
  });
});
