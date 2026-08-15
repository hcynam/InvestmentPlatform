import type {
  BreakEvenResult,
  Project,
  Scenario,
  SensitivityAssumptions,
  SensitivityAppliedSnapshot,
  SensitivityMatrixCell,
  SensitivityMetric,
  SensitivityPoint,
  SensitivityRunStatus,
  SensitivityThresholdStatus,
  SensitivityValidationIssue,
  SensitivityVariable,
  SensitivityWarning,
  TornadoResult,
} from "@/lib/types";
import { classifySensitivityHeatmapCell, metricMetadata, npvZeroTarget } from "@/lib/sensitivity-format";
import {
  activeScenario,
  applyRiskVariableShock,
  applyRiskVariableShockByName,
  applyRiskVariableShockToScenario,
  buildRiskAssumptionProvenance,
  cloneProject,
  getRiskBaseValue,
  hasActiveDebtExposure,
  hasFxExposure,
  resolveRiskVariablesFromSensitivity,
  riskVariableKindFromText,
  riskVariableMeta,
  runnableRiskVariableKinds,
  setRiskVariableValue,
  validateRiskVariableConfiguration,
  type CoreModelOutputs,
  type ResolvedRiskVariable,
  type RiskVariableKind,
} from "@/lib/risk-variable-engine";

type CoreOutputs = CoreModelOutputs;
type CoreRunner = (project: Project, scenario: Scenario, includeRisk?: boolean) => CoreOutputs;

const EPSILON = 1e-6;
const ROOT_TOLERANCE = 1e-4;
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const finiteOrNull = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : null;

export const generateSensitivityRange = (variable: Pick<ResolvedRiskVariable, "kind" | "low" | "high" | "steps">) => {
  const steps = variable.steps ?? 0;
  if (!Number.isInteger(steps) || steps < 3 || steps > 41 || !Number.isFinite(variable.low) || !Number.isFinite(variable.high) || variable.low > variable.high) return [];
  const values = Array.from({ length: steps }, (_, index) => variable.low + ((variable.high - variable.low) * index) / (steps - 1));
  if (variable.low <= 0 && variable.high >= 0 && !values.some((value) => Math.abs(value) < EPSILON)) values.push(0);
  return Array.from(new Set(values.map((value) => Number(value.toFixed(8))))).sort((left, right) => left - right);
};

const resolveVariables = (settings: SensitivityAssumptions): ResolvedRiskVariable[] => {
  if (settings.variables?.length) return resolveRiskVariablesFromSensitivity(settings.variables);
  const legacy = [settings.variable1, settings.variable2]
    .filter((value) => typeof value === "string" && value.trim().length > 0)
    .map((parameter, index): SensitivityVariable => {
      const kind = riskVariableKindFromText(parameter);
      const meta = riskVariableMeta[kind];
      return {
        id: `legacy-sensitivity-${index + 1}`,
        parameter,
        label: meta.label,
        low: settings.shockLow,
        high: settings.shockHigh,
        steps: settings.steps,
        changeType: meta.changeType,
        unitType: meta.unitType,
      };
    });
  return resolveRiskVariablesFromSensitivity(legacy);
};

export const sensitivityConfigsEqual = (left: SensitivityAssumptions | null | undefined, right: SensitivityAssumptions | null | undefined) =>
  JSON.stringify(left ?? null) === JSON.stringify(right ?? null);

export const withSensitivityMetricDraft = (settings: SensitivityAssumptions, selectedMetric: SensitivityMetric): SensitivityAssumptions => ({
  ...settings,
  selectedMetric,
});

export const isSensitivitySnapshotCurrent = (
  snapshot: SensitivityAppliedSnapshot | null | undefined,
  baseVersion: number,
  scenarioId: string,
  scenarioVersion: number,
) => Boolean(snapshot && snapshot.baseVersion === baseVersion && snapshot.scenarioId === scenarioId && snapshot.scenarioVersion === scenarioVersion);

export const selectSensitivityRunVariables = (settings: SensitivityAssumptions) => {
  const configured = resolveVariables(settings);
  return settings.analysisMode === "simple"
    ? [configured.find((variable) => variable.id === settings.simpleDriverId) ?? configured[0]].filter((item): item is ResolvedRiskVariable => Boolean(item))
    : configured;
};

const metricFromOutputs = (outputs: CoreOutputs, metric: SensitivityMetric, scenario?: Scenario) => {
  if (metric === "IRR") return outputs.valuation.metrics.irr;
  if (metric === "Payback") return outputs.valuation.metrics.payback;
  if (metric === "DSCR") {
    if (scenario && !hasActiveDebtExposure(scenario.assumptions)) {
      return { value: null, status: "not_computable" as const, reason: "حداقل DSCR بدون بدهی فعال قابل محاسبه نیست." };
    }
    const value = finiteOrNull(outputs.financing.minimumDscr);
    return value === null
      ? { value: null, status: "not_computable" as const, reason: "حداقل DSCR بدون برنامه معتبر خدمت بدهی قابل محاسبه نیست." }
      : { value, status: "ok" as const };
  }
  if (metric === "EquityValue") {
    const value = finiteOrNull(outputs.valuation.fcfeNpv);
    return value === null
      ? { value: null, status: "not_computable" as const, reason: "NPV حقوق صاحبان سهام بر مبنای FCFE قابل محاسبه نیست." }
      : { value, status: "ok" as const };
  }
  if (metric === "BCR") {
    const value = finiteOrNull(outputs.economic.ebcr);
    return value === null
      ? { value: null, status: "not_computable" as const, reason: "نسبت منفعت به هزینه اقتصادی قابل محاسبه نیست." }
      : { value, status: "ok" as const };
  }
  return outputs.valuation.metrics.npv;
};

const readinessFor = (project: Project, scenario: Scenario, outputs: CoreOutputs, metric: SensitivityMetric) => {
  const reasons: string[] = [];
  if (project.modelHorizonYears <= 0) reasons.push("افق تحلیل پروژه معتبر نیست.");
  if ((outputs.revenue.rows[1]?.revenue ?? 0) <= 0) reasons.push("درآمد عملیاتی مبنا هنوز قابل محاسبه نیست.");
  if (!Number.isFinite(outputs.capex.totalCapex) || outputs.capex.totalCapex <= 0) reasons.push("CAPEX مبنا هنوز تکمیل نشده است.");
  const metricResult = metricFromOutputs(outputs, metric, scenario);
  if (metricResult.status !== "ok" || finiteOrNull(metricResult.value) === null) reasons.push(metricResult.reason ?? "شاخص هدف قابل محاسبه نیست.");
  return { ready: reasons.length === 0, reasons: Array.from(new Set(reasons)) };
};

export const validateSensitivityConfiguration = (
  project: Project,
  scenario: Scenario,
  baseOutputs: CoreOutputs,
  settings: SensitivityAssumptions,
): SensitivityValidationIssue[] => {
  const issues: SensitivityValidationIssue[] = [];
  const add = (code: string, field: string, message: string, variableId?: string) => issues.push({ code, field, message, variableId });
  const supportedMetrics: SensitivityMetric[] = ["NPV", "IRR", "Payback", "DSCR", "EquityValue", "BCR"];
  if (!supportedMetrics.includes(settings.selectedMetric)) add("unavailable-kpi", "selectedMetric", "شاخص خروجی انتخاب‌شده در دسترس نیست.");
  const metricResult = metricFromOutputs(baseOutputs, settings.selectedMetric, scenario);
  if (metricResult.status !== "ok" || finiteOrNull(metricResult.value) === null) add("unavailable-kpi", "selectedMetric", metricResult.reason ?? "شاخص خروجی قابل محاسبه نیست.");
  const variables = resolveVariables(settings);
  if (!variables.length) add("missing-driver", "variables", "حداقل یک راننده حساسیت انتخاب کنید.");
  if (variables.length > runnableRiskVariableKinds.length) add("too-many-drivers", "variables", "تعداد راننده‌ها از تعداد راننده‌های یکتای قابل اجرا بیشتر است.");
  const seenKinds = new Set<RiskVariableKind>();
  const seenIds = new Set<string>();
  variables.forEach((variable) => {
    if (seenKinds.has(variable.kind) || seenIds.has(variable.id)) add("duplicate-driver", "parameter", "هر راننده فقط یک‌بار می‌تواند به تحلیل اضافه شود.", variable.id);
    seenKinds.add(variable.kind);
    seenIds.add(variable.id);
    issues.push(...validateRiskVariableConfiguration(variable, scenario, baseOutputs));
  });
  if (settings.analysisMode === "simple" && settings.simpleDriverId && !variables.some((variable) => variable.id === settings.simpleDriverId)) {
    add("simple-driver-missing", "simpleDriverId", "راننده نمای ساده باید در پیکربندی فعلی وجود داشته باشد.");
  }
  if (settings.analysisMode !== "simple" && settings.matrixEnabled) {
    if (variables.length < 2) add("matrix-needs-two-drivers", "matrixEnabled", "ماتریس به دو راننده یکتا نیاز دارد.");
    const [column, row] = variables;
    if (column && row && column.kind === row.kind) add("matrix-duplicate-driver", "matrixEnabled", "راننده سطر و ستون ماتریس باید متفاوت باشند.");
    [column, row].filter((item): item is ResolvedRiskVariable => Boolean(item)).forEach((variable) => {
      if ((variable.steps ?? 0) > 11) add("matrix-point-limit", "steps", "هر محور ماتریس حداکثر ۱۱ نقطه دارد.", variable.id);
    });
  }
  if (settings.thresholdVariableId && !variables.some((variable) => variable.id === settings.thresholdVariableId)) {
    add("threshold-driver-missing", "thresholdVariableId", "راننده آستانه باید در پیکربندی فعلی وجود داشته باشد.");
  }
  readinessFor(project, scenario, baseOutputs, settings.selectedMetric).reasons.forEach((message) => add("base-not-ready", "base", message));
  return issues;
};

const safePercentImpact = (impact: number | null, base: number | null) => impact === null || base === null || Math.abs(base) < EPSILON ? null : impact / Math.abs(base);
const safeElasticity = (percentImpact: number | null, shock: number) => percentImpact === null || Math.abs(shock) < EPSILON ? null : percentImpact / shock;

const failedPoint = (variable: ResolvedRiskVariable, shock: number, baseMetric: number | null, reason: string): SensitivityPoint => ({
  variableId: variable.id, variable: variable.label, sourceModule: variable.sourceModule, unitType: variable.unitType,
  shock, changeType: variable.changeType, baseValue: null, shockedValue: null, baseMetric, metric: null,
  absoluteImpact: null, percentImpact: null, elasticity: null, status: "modelError", warnings: [reason], reason,
  recommendation: "مفروضات راننده و خطاهای مدل پایه را بررسی کنید.",
});

const runCase = (
  project: Project,
  scenario: Scenario,
  variable: ResolvedRiskVariable,
  shock: number,
  baseOutputs: CoreOutputs,
  baseMetric: number | null,
  metric: SensitivityMetric,
  runCore: CoreRunner,
  hasBaseRisk: boolean,
): SensitivityPoint => {
  try {
    const baseValue = getRiskBaseValue(variable.kind, scenario, baseOutputs);
    const noExposure = variable.kind === "fxRate" && !hasFxExposure(scenario.assumptions);
    const noDebt = variable.kind === "debtInterest" && !hasActiveDebtExposure(scenario.assumptions);
    if (noExposure || noDebt) {
      return {
        variableId: variable.id, variable: variable.label, sourceModule: variable.sourceModule, unitType: variable.unitType,
        shock, changeType: variable.changeType, baseValue, shockedValue: baseValue, baseMetric, metric: baseMetric,
        absoluteImpact: baseMetric === null ? null : 0, percentImpact: baseMetric === null || Math.abs(baseMetric) < EPSILON ? null : 0,
        elasticity: null, status: noExposure ? "noExposure" : "notApplicable", warnings: [],
        reason: noExposure ? "در سناریوی فعلی مواجهه ارزی فعال وجود ندارد." : "ابزار بدهی فعال برای این تحلیل وجود ندارد.",
      };
    }
    if (Math.abs(shock) < EPSILON) {
      return {
        variableId: variable.id, variable: variable.label, sourceModule: variable.sourceModule, unitType: variable.unitType,
        shock: 0, changeType: variable.changeType, baseValue, shockedValue: baseValue, baseMetric, metric: baseMetric,
        absoluteImpact: baseMetric === null ? null : 0, percentImpact: baseMetric === null || Math.abs(baseMetric) < EPSILON ? null : 0,
        elasticity: null, status: baseMetric === null ? "modelError" : hasBaseRisk ? "validWithBaseRisk" : "valid", warnings: [],
        reason: baseMetric === null ? "شاخص مبنا قابل محاسبه نیست." : "نقطه خنثی دقیقاً از خروجی مبنا استفاده می‌کند.",
      };
    }
    const shocked = applyRiskVariableShock(project, scenario, variable, shock, baseOutputs);
    const outputs = runCore(shocked.project, shocked.scenario, false);
    const metricResult = metricFromOutputs(outputs, metric, shocked.scenario);
    const metricValue = metricResult.status === "ok" ? finiteOrNull(metricResult.value) : null;
    const warnings = [...shocked.warnings];
    if (metricResult.reason) warnings.push(metricResult.reason);
    if (variable.kind === "discountRate" && outputs.valuation.appliedDiscountRate <= shocked.scenario.assumptions.macro.terminalGrowthRate) warnings.push("نرخ تنزیل اعمال‌شده کمتر یا مساوی نرخ رشد پایانی است.");
    const absoluteImpact = metricValue !== null && baseMetric !== null ? metricValue - baseMetric : null;
    const percentImpact = safePercentImpact(absoluteImpact, baseMetric);
    const status: SensitivityRunStatus = metricValue === null || baseMetric === null ? "modelError" : warnings.length ? "watch" : hasBaseRisk ? "validWithBaseRisk" : "valid";
    return {
      variableId: variable.id, variable: variable.label, sourceModule: variable.sourceModule, unitType: variable.unitType,
      shock, changeType: variable.changeType, baseValue: shocked.baseValue, shockedValue: shocked.shockedValue,
      baseMetric, metric: metricValue, absoluteImpact, percentImpact, elasticity: safeElasticity(percentImpact, shock), status,
      warnings: Array.from(new Set(warnings)), reason: metricValue === null ? "شاخص این نقطه قابل محاسبه نیست." : warnings[0] ?? (hasBaseRisk ? "محاسبه معتبر است، اما مدل مبنا هشدار دارد." : "محاسبه معتبر است."),
    };
  } catch {
    return failedPoint(variable, shock, baseMetric, "محاسبه این نقطه با خطای مدل متوقف شد.");
  }
};

export const buildSensitivityTornado = (variables: ResolvedRiskVariable[], oneWay: SensitivityPoint[], baseMetric: number | null): TornadoResult[] => variables.map((variable): TornadoResult => {
  const points = oneWay.filter((point) => point.variableId === variable.id);
  const low = [...points].sort((left, right) => left.shock - right.shock)[0];
  const high = [...points].sort((left, right) => right.shock - left.shock)[0];
  const validValues = points.map((point) => point.metric).filter((value): value is number => value !== null && Number.isFinite(value));
  const range = validValues.length ? Math.max(...validValues) - Math.min(...validValues) : 0;
  const warnings = Array.from(new Set(points.flatMap((point) => point.warnings)));
  const status: SensitivityRunStatus = points.some((point) => point.status === "modelError" || point.status === "invalid") ? "modelError"
    : points.every((point) => point.status === "noExposure") ? "noExposure"
      : points.every((point) => point.status === "notApplicable") ? "notApplicable"
        : points.some((point) => point.status === "watch") ? "watch"
          : points.some((point) => point.status === "validWithBaseRisk") ? "validWithBaseRisk" : "valid";
  return {
    variableId: variable.id, variable: variable.label, sourceModule: variable.sourceModule, unitType: variable.unitType,
    low: low?.metric ?? null, high: high?.metric ?? null, base: baseMetric,
    lowDelta: low?.metric !== null && low?.metric !== undefined && baseMetric !== null ? low.metric - baseMetric : null,
    highDelta: high?.metric !== null && high?.metric !== undefined && baseMetric !== null ? high.metric - baseMetric : null,
    range: Number.isFinite(range) ? range : 0, lowShock: low?.shock ?? variable.low, highShock: high?.shock ?? variable.high,
    status, warnings, reason: status === "noExposure" ? "بدون مواجهه مؤثر" : status === "notApplicable" ? "برای سناریوی فعلی نامرتبط است." : warnings[0],
  };
}).sort((left, right) => right.range - left.range);

const buildMatrix = (
  project: Project, scenario: Scenario, rowVariable: ResolvedRiskVariable, colVariable: ResolvedRiskVariable,
  baseOutputs: CoreOutputs, metric: SensitivityMetric, runCore: CoreRunner, baseMetric: number | null,
  hasBaseRisk: boolean, oneWay: SensitivityPoint[],
): SensitivityMatrixCell[] => {
  const rowShocks = generateSensitivityRange(rowVariable);
  const colShocks = generateSensitivityRange(colVariable);
  return rowShocks.flatMap((rowShock) => colShocks.map((colShock): SensitivityMatrixCell => {
    const baseCell = Math.abs(rowShock) < EPSILON && Math.abs(colShock) < EPSILON;
    try {
      let value: number | null = baseCell ? baseMetric : null;
      let warnings: string[] = [];
      let rowValue = getRiskBaseValue(rowVariable.kind, scenario, baseOutputs);
      let colValue = getRiskBaseValue(colVariable.kind, scenario, baseOutputs);
      let appliedDiscountRate = baseOutputs.valuation.appliedDiscountRate;
      if (!baseCell) {
        const oneDimensional = Math.abs(rowShock) < EPSILON
          ? oneWay.find((point) => point.variableId === colVariable.id && Math.abs(point.shock - colShock) < EPSILON)
          : Math.abs(colShock) < EPSILON ? oneWay.find((point) => point.variableId === rowVariable.id && Math.abs(point.shock - rowShock) < EPSILON) : undefined;
        if (oneDimensional) {
          value = oneDimensional.metric;
          warnings = oneDimensional.warnings;
          if (Math.abs(rowShock) < EPSILON) colValue = oneDimensional.shockedValue;
          else rowValue = oneDimensional.shockedValue;
        } else {
          const nextProject = cloneProject(project);
          nextProject.activeScenarioId = scenario.id;
          const target = activeScenario(nextProject, scenario.id);
          const first = applyRiskVariableShockToScenario(target, scenario, colVariable, colShock, baseOutputs);
          const second = applyRiskVariableShockToScenario(first.scenario, scenario, rowVariable, rowShock, baseOutputs);
          rowValue = second.shockedValue;
          colValue = first.shockedValue;
          warnings = Array.from(new Set([...first.warnings, ...second.warnings]));
          const outputs = runCore(nextProject, second.scenario, false);
          const metricResult = metricFromOutputs(outputs, metric, second.scenario);
          value = metricResult.status === "ok" ? finiteOrNull(metricResult.value) : null;
          if (metricResult.reason) warnings.push(metricResult.reason);
          appliedDiscountRate = outputs.valuation.appliedDiscountRate;
        }
      }
      const heatmap = classifySensitivityHeatmapCell(metric, value, { baseValue: baseMetric, discountRate: appliedDiscountRate, targetDscr: scenario.assumptions.financing.targetDscr, horizonYears: project.modelHorizonYears });
      return {
        rowVariableId: rowVariable.id, colVariableId: colVariable.id, rowShock, colShock, rowValue, colValue, value,
        status: value === null ? "modelError" : warnings.length ? "watch" : hasBaseRisk ? "validWithBaseRisk" : "valid",
        heatmapStatus: heatmap.status, heatmapScore: heatmap.score, heatmapReason: heatmap.reason,
        warnings: Array.from(new Set(warnings)), reason: warnings[0] ?? heatmap.reason,
      };
    } catch {
      return {
        rowVariableId: rowVariable.id, colVariableId: colVariable.id, rowShock, colShock, rowValue: null, colValue: null, value: null,
        status: "modelError", heatmapStatus: "invalid", heatmapScore: 0, heatmapReason: "محاسبه این سلول ناموفق بود.",
        warnings: ["محاسبه این سلول ناموفق بود."], reason: "محاسبه این سلول ناموفق بود.",
      };
    }
  }));
};

const thresholdBounds = (kind: RiskVariableKind, base: number) => {
  if (kind === "delay") return { min: 0, max: 120 };
  if (kind === "workingCapitalDays") return { min: 0, max: Math.max(365, base + 180) };
  if (["inflation", "discountRate", "debtInterest", "taxRate"].includes(kind)) return { min: 0, max: Math.max(1, base + 0.5) };
  return { min: 0, max: Math.max(base * (kind === "fxRate" ? 5 : 3), base + 1) };
};

const findThreshold = (project: Project, scenario: Scenario, variable: ResolvedRiskVariable, baseOutputs: CoreOutputs, runCore: CoreRunner): BreakEvenResult => {
  const target = npvZeroTarget();
  const baseValue = getRiskBaseValue(variable.kind, scenario, baseOutputs);
  const baseMetricValue = finiteOrNull(baseOutputs.valuation.npv);
  const bounds = thresholdBounds(variable.kind, baseValue ?? 0);
  const result = (status: SensitivityThresholdStatus, value: number | null, metricValue: number | null, reason: string, recommendation: string): BreakEvenResult => ({
    id: variable.kind, label: `آستانه NPV — ${variable.label}`, variableId: variable.id, sourceModule: variable.sourceModule,
    value, unit: variable.unitType, unitType: variable.unitType, metric: "NPV", target, baseValue, resultValue: value,
    baseMetricValue, metricValue, status, testedMin: bounds.min, testedMax: bounds.max, reason, recommendation,
  });
  if (baseValue === null) return result("insufficientData", null, null, "مقدار مبنا موجود نیست.", "ورودی مبنا را تکمیل کنید.");
  if (variable.kind === "fxRate" && !hasFxExposure(scenario.assumptions)) return result("noExposure", null, null, "مواجهه ارزی فعال وجود ندارد.", "اقلام ارزی را در ماژول منبع بررسی کنید.");
  const samples = Array.from({ length: 31 }, (_, index) => bounds.min + ((bounds.max - bounds.min) * index) / 30).map((value) => {
    try {
      const nextProject = cloneProject(project);
      nextProject.activeScenarioId = scenario.id;
      const nextScenario = activeScenario(nextProject, scenario.id);
      setRiskVariableValue(nextScenario.assumptions, variable.kind, value, baseValue);
      const output = runCore(nextProject, nextScenario, false);
      return { value, npv: finiteOrNull(output.valuation.npv) };
    } catch {
      return { value, npv: null };
    }
  }).filter((point): point is { value: number; npv: number } => point.npv !== null);
  if (!samples.length) return result("modelError", null, null, "در بازه آزمون NPV معتبر تولید نشد.", "مدل منبع را اصلاح و دوباره اجرا کنید.");
  for (let index = 0; index < samples.length - 1; index += 1) {
    const current = samples[index];
    const next = samples[index + 1];
    if (Math.abs(current.npv) <= ROOT_TOLERANCE) {
      if (index === 0 || index === samples.length - 1) return result("boundaryOnly", null, current.npv, "برخورد فقط در مرز بازه رخ داد.", "بازه را گسترش دهید.");
      return result("valid", current.value, current.npv, "NPV به صفر رسیده است.", "آستانه را همراه با بازه آزمون تفسیر کنید.");
    }
    if (current.npv * next.npv < 0) {
      const value = current.value - current.npv * (next.value - current.value) / (next.npv - current.npv);
      return result("valid", value, 0, "NPV در بازه آزمون از صفر عبور کرده است.", "آستانه را همراه با بازه آزمون تفسیر کنید.");
    }
  }
  const first = samples[0].npv;
  const flat = samples.every((point) => Math.abs(point.npv - first) < Math.max(EPSILON, Math.abs(first) * 1e-9));
  return flat ? result("noExposure", null, null, "NPV در بازه آزمون تغییری نکرد.", "اتصال راننده به مدل منبع را بررسی کنید.")
    : result("notFound", null, null, "NPV در بازه آزمون از صفر عبور نکرد.", "در صورت توجیه کسب‌وکاری بازه را بازبینی کنید.");
};

const buildBreakEven = (project: Project, scenario: Scenario, baseOutputs: CoreOutputs, variables: ResolvedRiskVariable[], runCore: CoreRunner, thresholdVariableId?: string | null) => {
  const variable = thresholdVariableId ? variables.find((item) => item.id === thresholdVariableId) : undefined;
  const results = variable ? [findThreshold(project, scenario, variable, baseOutputs, runCore)] : [];
  const valueFor = (kind: RiskVariableKind) => results.find((item) => item.id === kind && item.status === "valid")?.value ?? null;
  return {
    price: valueFor("salesPrice"), volume: valueFor("salesVolume"), sales: null, fxRate: valueFor("fxRate"),
    capex: valueFor("capex"), wacc: valueFor("discountRate"), debtInterest: valueFor("debtInterest"), delay: valueFor("delay"), results,
  };
};

const buildQualityWarnings = (project: Project, scenario: Scenario, outputs: CoreOutputs): SensitivityWarning[] => {
  const warnings: SensitivityWarning[] = [];
  const add = (id: string, severity: SensitivityWarning["severity"], message: string, sourceModule?: string, recommendation = "مفروضات مرتبط را اصلاح و مدل را دوباره اجرا کنید.", actionSlug?: SensitivityWarning["actionSlug"]) => warnings.push({ id, severity, message, sourceModule, recommendation, actionSlug });
  if (outputs.valuation.npv < 0) add("base-negative-npv", "warning", "NPV مبنا منفی است؛ نتیجه باید به‌عنوان تحلیل ریسک تفسیر شود.", "ارزش‌گذاری", "سناریو و نرخ تنزیل را بازبینی کنید.", "valuation");
  if (outputs.financing.minimumDscr !== null && outputs.financing.minimumDscr < scenario.assumptions.financing.targetDscr) add("base-low-dscr", "error", "حداقل DSCR کمتر از هدف بانک است.", "تأمین مالی", "برنامه بدهی را بازبینی کنید.", "financing");
  if (outputs.valuation.metrics.irr.status !== "ok") add("base-invalid-irr", "warning", "IRR مبنا قابل محاسبه یا اتکا نیست.", "ارزش‌گذاری", "علامت جریان‌های نقدی را بررسی کنید.", "valuation");
  if ((outputs.revenue.rows[1]?.revenue ?? 0) <= 0) add("missing-revenue", "error", "درآمد سال اول صفر یا نامعتبر است.", "بازار و فروش", "مفروضات بازار را تکمیل کنید.", "revenue");
  if (outputs.capex.totalCapex <= 0) add("missing-capex", "error", "CAPEX مبنا صفر یا نامعتبر است.", "سرمایه‌گذاری", "اقلام CAPEX را تکمیل کنید.", "capex");
  if (outputs.valuation.appliedDiscountRate <= scenario.assumptions.macro.terminalGrowthRate) add("terminal-growth-invalid", "error", "نرخ تنزیل اعمال‌شده کمتر یا مساوی رشد پایانی است.", "ارزش‌گذاری", "نرخ‌ها را اصلاح کنید.", "valuation");
  if (project.modelHorizonYears <= 0) add("invalid-horizon", "error", "افق تحلیل پروژه معتبر نیست.", "تنظیمات پروژه", "افق مدل را اصلاح کنید.", "setup");
  return warnings;
};

export const emptySensitivity = (metric: SensitivityMetric = "NPV") => ({
  baseMetric: null,
  selectedMetric: metric,
  metricMetadata: metricMetadata(metric),
  target: npvZeroTarget(),
  oneWay: [] as SensitivityPoint[],
  matrix: [] as SensitivityMatrixCell[],
  tornado: [] as TornadoResult[],
  breakEven: { price: null, volume: null, sales: null, fxRate: null, capex: null, wacc: null, debtInterest: null, delay: null, results: [] as BreakEvenResult[] },
  qualityWarnings: [] as SensitivityWarning[],
  assumptionProvenance: [],
  applied: null,
  validationErrors: [] as SensitivityValidationIssue[],
  readiness: { ready: false, reasons: [] as string[] },
});

export { applyRiskVariableShockByName as applySensitivityShockByName };

export const calculateSensitivityAnalysis = (project: Project, scenario: Scenario, baseOutputs: CoreOutputs, runCore: CoreRunner) => {
  const settings = scenario.assumptions.sensitivity;
  const selectedMetric = settings.selectedMetric;
  const baseMetricResult = metricFromOutputs(baseOutputs, selectedMetric, scenario);
  const baseMetric = baseMetricResult.status === "ok" ? finiteOrNull(baseMetricResult.value) : null;
  const readiness = readinessFor(project, scenario, baseOutputs, selectedMetric);
  const validationErrors = validateSensitivityConfiguration(project, scenario, baseOutputs, settings);
  const qualityWarnings = buildQualityWarnings(project, scenario, baseOutputs);
  if (baseMetricResult.reason) qualityWarnings.push({ id: "base-metric-invalid", severity: "error", message: baseMetricResult.reason, sourceModule: "ارزش‌گذاری", recommendation: "شاخص یا مفروضات منبع را اصلاح کنید.", actionSlug: "valuation" });
  const base = project.scenarios.find((item) => item.type === "base") ?? project.scenarios[0];
  const common = {
    baseMetric, selectedMetric, metricMetadata: metricMetadata(selectedMetric), target: npvZeroTarget(), qualityWarnings,
    assumptionProvenance: buildRiskAssumptionProvenance(scenario, baseOutputs), validationErrors, readiness,
  };
  if (!readiness.ready || validationErrors.length) return { ...emptySensitivity(selectedMetric), ...common, breakEven: emptySensitivity(selectedMetric).breakEven };
  const variables = selectSensitivityRunVariables(settings);
  const hasBaseRisk = qualityWarnings.some((warning) => warning.severity !== "info");
  const oneWay = variables.flatMap((variable) => generateSensitivityRange(variable).map((shock) => runCase(project, scenario, variable, shock, baseOutputs, baseMetric, selectedMetric, runCore, hasBaseRisk)));
  const tornado = buildSensitivityTornado(variables, oneWay, baseMetric);
  const matrix = settings.analysisMode !== "simple" && settings.matrixEnabled && variables[0] && variables[1]
    ? buildMatrix(project, scenario, variables[1], variables[0], baseOutputs, selectedMetric, runCore, baseMetric, hasBaseRisk, oneWay)
    : [];
  const breakEven = buildBreakEven(project, scenario, baseOutputs, variables, runCore, settings.analysisMode === "simple" ? null : settings.thresholdVariableId);
  return {
    ...common, oneWay, matrix, tornado, breakEven,
    applied: {
      config: clone(settings), baseVersion: base.version, scenarioId: scenario.id, scenarioVersion: scenario.version,
      calculationBasis: scenario.assumptions.macro.calculationBasis, currency: project.currency, generatedAt: baseOutputs.generatedAt,
    },
  };
};
