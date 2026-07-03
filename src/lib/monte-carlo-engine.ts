import {
  activeScenario,
  applyRiskVariableShockToScenario,
  buildRiskAssumptionProvenance,
  cloneProject,
  defaultRiskVariable,
  getRiskBaseValue,
  hasFxExposure,
  riskVariableKindFromText,
  type CoreModelOutputs,
  type ResolvedRiskVariable,
} from "@/lib/risk-variable-engine";
import type {
  MonteCarloAssumptions,
  MonteCarloContribution,
  MonteCarloDistribution,
  MonteCarloDistributionType,
  MonteCarloHistogramBin,
  MonteCarloInvalidIterationReason,
  MonteCarloIterationResult,
  MonteCarloMetric,
  MonteCarloMetricSummary,
  MonteCarloQualityWarning,
  MonteCarloResult,
  MonteCarloSample,
  MonteCarloVariable,
  Project,
  Scenario,
  SensitivityRunStatus,
  SensitivityUnitType,
} from "@/lib/types";

const EPSILON = 1e-9;
const DEFAULT_BINS = 18;
const MAX_ITERATIONS = 5000;
const CORRELATION_DISABLED_MESSAGE = "نمونه‌گیری فعلی مستقل است؛ همبستگی بین تورم، نرخ ارز، CAPEX، تأخیر و فروش در این نسخه اعمال نمی‌شود. بنابراین ریسک هم‌زمانی شوک‌ها ممکن است کمتر از واقع برآورد شود.";

type CoreRunner = (project: Project, scenario: Scenario, includeRisk?: boolean) => CoreModelOutputs;

export type MonteCarloProgressSnapshot = {
  running: boolean;
  completedIterations: number;
  totalIterations: number;
  elapsedMs: number;
  estimatedRemainingMs: number | null;
};

export type MonteCarloAsyncOptions = {
  chunkSize?: number;
  signal?: { aborted: boolean };
  onProgress?: (progress: MonteCarloProgressSnapshot) => void;
};

type VariableValidation = {
  ok: boolean;
  distribution: MonteCarloDistribution;
  distributionType: MonteCarloDistributionType;
  warnings: MonteCarloQualityWarning[];
};

type ResolvedMonteCarloVariable = ResolvedRiskVariable & {
  name: string;
  active: boolean;
  distribution: MonteCarloDistribution;
  distributionType: MonteCarloDistributionType;
  description: string;
};

type MonteCarloSimulationState = {
  project: Project;
  scenario: Scenario;
  coreRunner: CoreRunner;
  baseOutputs: CoreModelOutputs;
  assumptions: MonteCarloAssumptions;
  requestedIterations: number;
  seed: number;
  random: () => number;
  selectedMetric: MonteCarloMetric;
  variables: ResolvedMonteCarloVariable[];
  qualityWarnings: MonteCarloQualityWarning[];
  rows: MonteCarloIterationResult[];
  startedAt: string;
};

const metricLabels: Record<MonteCarloMetric, { label: string; unitType: SensitivityUnitType }> = {
  NPV: { label: "NPV", unitType: "totalMoney" },
  IRR: { label: "IRR", unitType: "percentage" },
  MIRR: { label: "MIRR", unitType: "percentage" },
  Payback: { label: "دوره بازگشت", unitType: "year" },
  DSCR: { label: "حداقل DSCR", unitType: "ratio" },
  EquityValue: { label: "ارزش حقوق صاحبان سهام", unitType: "totalMoney" },
  BCR: { label: "BCR اقتصادی", unitType: "ratio" },
  Liquidity: { label: "کمترین نقدینگی تجمعی", unitType: "totalMoney" },
  FinancingCost: { label: "هزینه تامین مالی", unitType: "totalMoney" },
};

const metricKeys = Object.keys(metricLabels) as MonteCarloMetric[];

const warning = (
  id: string,
  message: string,
  recommendation?: string,
  variableId?: string,
  sourceModule?: string,
): MonteCarloQualityWarning => ({
  id,
  severity: "warning",
  message,
  recommendation,
  variableId,
  sourceModule,
});

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const finiteOrNull = (value: unknown) => (isFiniteNumber(value) ? value : null);

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const mean = (values: number[]) => values.length ? values.reduce((total, value) => total + value, 0) / values.length : null;

export const createSeededRandom = (seed: number) => {
  let state = Number.isFinite(seed) ? Math.trunc(seed) : 123;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
};

export const calculatePercentile = (values: number[], percentile: number) => {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const index = clamp((sorted.length - 1) * percentile, 0, sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
};

export const buildHistogram = (values: number[], bins = DEFAULT_BINS): MonteCarloHistogramBin[] => {
  const finite = values.filter(Number.isFinite);
  if (!finite.length) return [];
  const min = Math.min(...finite);
  const max = Math.max(...finite);
  const safeBins = Math.max(1, Math.round(bins));
  const span = max - min;
  const start = span <= EPSILON ? min - 0.5 : min;
  const width = span <= EPSILON ? 1 / safeBins : span / safeBins;
  const output = Array.from({ length: safeBins }, (_, index) => ({
    bin: start + width * (index + 0.5),
    start: start + width * index,
    end: start + width * (index + 1),
    count: 0,
    probability: 0,
  }));
  finite.forEach((value) => {
    const index = Math.min(safeBins - 1, Math.max(0, Math.floor((value - start) / width)));
    output[index].count += 1;
  });
  return output.map((bin) => ({ ...bin, probability: bin.count / finite.length }));
};

const normalFromRandom = (random: () => number) => {
  const u1 = Math.max(random(), EPSILON);
  const u2 = random();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
};

const sampleTriangular = (random: () => number, min: number, mode: number, max: number) => {
  if (Math.abs(max - min) <= EPSILON) return min;
  const u = random();
  const c = clamp((mode - min) / (max - min), 0, 1);
  if (u < c) return min + Math.sqrt(u * (max - min) * Math.max(mode - min, 0));
  return max - Math.sqrt((1 - u) * (max - min) * Math.max(max - mode, 0));
};

const sampleNormal = (random: () => number, meanValue: number, stdDev: number, min?: number, max?: number) => {
  const safeStd = Math.max(Math.abs(stdDev), EPSILON);
  const lower = min ?? Number.NEGATIVE_INFINITY;
  const upper = max ?? Number.POSITIVE_INFINITY;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const value = meanValue + normalFromRandom(random) * safeStd;
    if (value >= lower && value <= upper) return value;
  }
  return clamp(meanValue + normalFromRandom(random) * safeStd, lower, upper);
};

const sampleGamma = (random: () => number, shape: number): number => {
  if (shape < 1) {
    const u = Math.max(random(), EPSILON);
    return sampleGamma(random, shape + 1) * u ** (1 / shape);
  }
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const x = normalFromRandom(random);
    const v = (1 + c * x) ** 3;
    if (v <= 0) continue;
    const u = random();
    if (u < 1 - 0.0331 * x ** 4) return d * v;
    if (Math.log(Math.max(u, EPSILON)) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
  return Math.max(EPSILON, shape);
};

const samplePert = (random: () => number, min: number, mode: number, max: number, lambda = 4) => {
  if (Math.abs(max - min) <= EPSILON) return min;
  const safeMode = clamp(mode, min, max);
  const alpha = 1 + lambda * ((safeMode - min) / (max - min));
  const beta = 1 + lambda * ((max - safeMode) / (max - min));
  const x = sampleGamma(random, alpha);
  const y = sampleGamma(random, beta);
  const ratio = x / Math.max(x + y, EPSILON);
  return min + ratio * (max - min);
};

const sampleLognormal = (random: () => number, distribution: MonteCarloDistribution) => {
  const meanValue = distribution.mean ?? distribution.mode ?? 0;
  const stdDev = Math.max(Math.abs(distribution.stdDev ?? (Math.abs(meanValue) * 0.2 || 0.01)), EPSILON);
  const normal = sampleNormal(random, meanValue, stdDev, distribution.min, distribution.max);
  return Math.exp(normal) - 1;
};

const sampleDiscrete = (random: () => number, values: { value: number; probability: number }[]) => {
  const totalProbability = values.reduce((total, item) => total + Math.max(0, item.probability), 0);
  if (totalProbability <= EPSILON) return values[0]?.value ?? 0;
  const draw = random() * totalProbability;
  let cumulative = 0;
  for (const item of values) {
    cumulative += Math.max(0, item.probability);
    if (draw <= cumulative) return item.value;
  }
  return values[values.length - 1]?.value ?? 0;
};

const distributionFromLegacy = (value: string): MonteCarloDistributionType => {
  const lower = value.toLowerCase();
  if (lower.includes("triangular") || lower.includes("مثلث")) return "triangular";
  if (lower.includes("uniform") || lower.includes("یکنواخت")) return "uniform";
  if (lower.includes("pert")) return "pert";
  if (lower.includes("log")) return "lognormal";
  if (lower.includes("discrete") || lower.includes("گسسته")) return "discrete";
  return "normal";
};

const normalizeDistribution = (variable: MonteCarloVariable): MonteCarloDistribution => {
  if (typeof variable.distribution === "object") {
    return {
      ...variable.distribution,
      min: variable.distribution.min ?? variable.low,
      mode: variable.distribution.mode ?? variable.mid,
      max: variable.distribution.max ?? variable.high,
      mean: variable.distribution.mean ?? variable.mid,
      stdDev: variable.distribution.stdDev ?? Math.abs(variable.high - variable.low) / 6,
    };
  }
  const type = distributionFromLegacy(variable.distribution);
  return {
    type,
    min: variable.low,
    mode: variable.mid,
    max: variable.high,
    mean: variable.mid,
    stdDev: Math.abs(variable.high - variable.low) / 6,
    truncated: type === "normal",
  };
};

export const validateMonteCarloVariable = (variable: MonteCarloVariable): VariableValidation => {
  const distribution = normalizeDistribution(variable);
  const distributionType = distribution.type;
  const warnings: MonteCarloQualityWarning[] = [];
  const id = variable.id ?? variable.name;
  const min = distribution.min ?? variable.low;
  const mode = distribution.mode ?? variable.mid;
  const max = distribution.max ?? variable.high;

  if (["triangular", "pert", "uniform", "normal", "lognormal"].includes(distributionType)) {
    if (!isFiniteNumber(min) || !isFiniteNumber(max) || min > max) {
      warnings.push(warning(
        `mc.variable.${id}.bounds`,
        "کران‌های توزیع معتبر نیستند و این متغیر از اجرا کنار گذاشته شد.",
        "حد پایین و بالا را عددی و به ترتیب درست وارد کنید.",
        id,
        variable.sourceModule,
      ));
      return { ok: false, distribution, distributionType, warnings };
    }
  }

  if ((distributionType === "triangular" || distributionType === "pert") && (!isFiniteNumber(mode) || mode < min || mode > max)) {
    warnings.push(warning(
      `mc.variable.${id}.mode`,
      "مقدار محتمل توزیع بیرون از محدوده است و این متغیر از اجرا کنار گذاشته شد.",
      "مقدار mode را بین حد پایین و حد بالا قرار دهید.",
      id,
      variable.sourceModule,
    ));
    return { ok: false, distribution, distributionType, warnings };
  }

  if (distributionType === "normal" && (!isFiniteNumber(distribution.stdDev) || Math.abs(distribution.stdDev) <= EPSILON)) {
    warnings.push(warning(
      `mc.variable.${id}.stddev`,
      "انحراف معیار توزیع نرمال معتبر نیست و از دامنه حد پایین/بالا بازسازی شد.",
      "برای کنترل بهتر، stdDev مثبت وارد کنید.",
      id,
      variable.sourceModule,
    ));
    distribution.stdDev = Math.max(Math.abs(max - min) / 6, EPSILON);
  }

  if (distributionType === "normal" && (isFiniteNumber(distribution.min) || isFiniteNumber(distribution.max))) {
    warnings.push(warning(
      `mc.variable.${id}.truncated-normal`,
      "توزیع نرمال با کران اجرا می‌شود؛ نمونه‌های بیرون از محدوده دوباره نمونه‌گیری یا محدود می‌شوند.",
      "برای سناریوهای بدون کران، حد پایین/بالا را حذف کنید.",
      id,
      variable.sourceModule,
    ));
  }

  if (distributionType === "lognormal" && max <= -1) {
    warnings.push(warning(
      `mc.variable.${id}.lognormal`,
      "توزیع لگ‌نرمال برای این دامنه معتبر نیست و متغیر کنار گذاشته شد.",
      "دامنه شوک لگ‌نرمال باید خروجی مثبت قابل تبدیل داشته باشد.",
      id,
      variable.sourceModule,
    ));
    return { ok: false, distribution, distributionType, warnings };
  }

  if (distributionType === "discrete") {
    const values = distribution.values ?? [];
    const validValues = values.filter((item) => isFiniteNumber(item.value) && isFiniteNumber(item.probability) && item.probability > 0);
    if (!validValues.length) {
      warnings.push(warning(
        `mc.variable.${id}.discrete`,
        "توزیع گسسته مقدار و احتمال معتبر ندارد و متغیر کنار گذاشته شد.",
        "برای هر حالت، مقدار عددی و احتمال مثبت وارد کنید.",
        id,
        variable.sourceModule,
      ));
      return { ok: false, distribution, distributionType, warnings };
    }
    distribution.values = validValues;
  }

  if ((variable.positiveOnly ?? false) && min <= -1 && (variable.shockMode ?? "percent") === "percent") {
    warnings.push(warning(
      `mc.variable.${id}.positive-guard`,
      "این متغیر مثبت‌محور است؛ شوک‌های کمتر از منفی ۱۰۰٪ هنگام اعمال به صفر محدود می‌شوند.",
      "دامنه شوک را طوری تنظیم کنید که خروجی اقتصادی منفی نشود.",
      id,
      variable.sourceModule,
    ));
  }

  return { ok: true, distribution, distributionType, warnings };
};

export const sampleMonteCarloDistribution = (
  random: () => number,
  distribution: MonteCarloDistribution,
) => {
  const min = distribution.min ?? 0;
  const mode = distribution.mode ?? distribution.mean ?? 0;
  const max = distribution.max ?? mode;
  if (distribution.type === "triangular") return sampleTriangular(random, min, mode, max);
  if (distribution.type === "pert") return samplePert(random, min, mode, max, distribution.lambda ?? 4);
  if (distribution.type === "uniform") return min + random() * (max - min);
  if (distribution.type === "lognormal") return clamp(sampleLognormal(random, distribution), min, max);
  if (distribution.type === "discrete") return sampleDiscrete(random, distribution.values ?? []);
  return sampleNormal(random, distribution.mean ?? mode, distribution.stdDev ?? Math.abs(max - min) / 6, distribution.min, distribution.max);
};

const resolveMonteCarloVariable = (variable: MonteCarloVariable): ResolvedMonteCarloVariable => {
  const kind = riskVariableKindFromText(`${variable.id ?? ""} ${variable.name} ${variable.label ?? ""} ${variable.englishLabel ?? ""}`);
  const meta = defaultRiskVariable(kind);
  const changeType =
    variable.shockMode === "absolute" || kind === "delay" || kind === "workingCapitalDays"
      ? "absolute"
      : "percent";
  const validation = validateMonteCarloVariable({
    ...variable,
    positiveOnly: variable.positiveOnly ?? meta.positiveOnly,
  });
  return {
    ...meta,
    id: variable.id ?? meta.id,
    name: variable.name,
    parameter: variable.name,
    label: variable.label ?? variable.name,
    englishLabel: variable.englishLabel ?? meta.englishLabel,
    kind,
    sourceModule: variable.sourceModule ?? meta.sourceModule,
    sourcePath: variable.sourcePath ?? meta.sourcePath,
    low: variable.low,
    mid: variable.mid,
    high: variable.high,
    changeType,
    unitType: variable.unitType ?? meta.unitType,
    positiveOnly: variable.positiveOnly ?? meta.positiveOnly,
    exposureLogic: variable.exposureLogic ?? meta.exposureLogic,
    description: variable.description,
    active: variable.active ?? variable.enabled,
    distribution: validation.distribution,
    distributionType: validation.distributionType,
  };
};

const resolveVariables = (variables: MonteCarloVariable[], baseScenario: Scenario, baseOutputs: CoreModelOutputs) => {
  const qualityWarnings: MonteCarloQualityWarning[] = [];
  const resolved = variables.map((variable) => {
    const validation = validateMonteCarloVariable(variable);
    qualityWarnings.push(...validation.warnings);
    return { variable: resolveMonteCarloVariable(variable), validation };
  });
  const validVariables = resolved
    .filter((item) => item.validation.ok && item.variable.active)
    .map((item) => item.variable);

  if (!validVariables.length) {
    qualityWarnings.push(warning(
      "mc.zero-active-variables",
      "هیچ متغیر فعالی برای شبیه‌سازی وجود ندارد؛ اجرای فعلی همان مسیر پایه را تکرار می‌کند.",
      "حداقل یک متغیر ریسک را فعال کنید.",
    ));
  }

  validVariables.forEach((variable) => {
    const baseValue = getRiskBaseValue(variable.kind, baseScenario, baseOutputs);
    if (variable.positiveOnly && baseValue !== null && baseValue <= 0) {
      qualityWarnings.push(warning(
        `mc.variable.${variable.id}.base-nonpositive`,
        "مقدار پایه این متغیر مثبت‌محور، صفر یا نامعتبر است؛ اثر شوک ممکن است ناچیز باشد.",
        "فرض پایه متغیر را در ماژول منبع بررسی کنید.",
        variable.id,
        variable.sourceModule,
      ));
    }
    if (variable.kind === "fxRate" && !hasFxExposure(baseScenario.assumptions)) {
      qualityWarnings.push(warning(
        `mc.variable.${variable.id}.no-fx-exposure`,
        "برای شوک نرخ ارز مواجهه معنادار پیدا نشد.",
        "اقلام ارزی CAPEX، OPEX یا هزینه مستقیم را در ماژول‌های مربوط بررسی کنید.",
        variable.id,
        variable.sourceModule,
      ));
    }
  });

  return { variables: validVariables, qualityWarnings };
};

const metricValuesFromOutputs = (outputs: CoreModelOutputs) => {
  const liquidity = outputs.statements.rows.reduce(
    (minimum, row) => Math.min(minimum, row.cumulativeCashFlow),
    Number.POSITIVE_INFINITY,
  );
  const metrics: Record<MonteCarloMetric, number | null> = {
    NPV: finiteOrNull(outputs.valuation.npv),
    IRR: finiteOrNull(outputs.valuation.irr),
    MIRR: finiteOrNull(outputs.valuation.mirr),
    Payback: finiteOrNull(outputs.valuation.payback),
    DSCR: finiteOrNull(outputs.financing.minimumDscr),
    EquityValue: finiteOrNull(outputs.valuation.fcfeNpv),
    BCR: finiteOrNull(outputs.economic.ebcr),
    Liquidity: finiteOrNull(liquidity),
    FinancingCost: finiteOrNull(outputs.financing.totalInterest),
  };
  return metrics;
};

const invalidReasonsFromMetrics = (
  metrics: Record<MonteCarloMetric, number | null>,
): MonteCarloInvalidIterationReason[] => {
  const reasons: MonteCarloInvalidIterationReason[] = [];
  if (metrics.NPV === null) reasons.push("invalidNpv");
  if (metrics.IRR === null) reasons.push("invalidIrr");
  if (metrics.DSCR === null) reasons.push("invalidDscr");
  if (metrics.Liquidity === null) reasons.push("invalidLiquidity");
  if (Object.values(metrics).some((value) => value !== null && !Number.isFinite(value))) reasons.push("nonFiniteOutput");
  return reasons;
};

const emptyMetricSummary = (metric: MonteCarloMetric, count: number): MonteCarloMetricSummary => ({
  metric,
  label: metricLabels[metric].label,
  unitType: metricLabels[metric].unitType,
  count,
  validCount: 0,
  invalidCount: count,
  mean: null,
  median: null,
  standardDeviation: null,
  min: null,
  max: null,
  p1: null,
  p5: null,
  p10: null,
  p25: null,
  p50: null,
  p75: null,
  p90: null,
  p95: null,
  p99: null,
  standardError: null,
  confidenceInterval95: { low: null, high: null },
  skewness: null,
  kurtosis: null,
});

const summarizeMetric = (metric: MonteCarloMetric, rawValues: Array<number | null>, count: number): MonteCarloMetricSummary => {
  const values = rawValues.filter(isFiniteNumber);
  if (!values.length) return emptyMetricSummary(metric, count);
  const average = mean(values) ?? 0;
  const variance = values.reduce((total, value) => total + (value - average) ** 2, 0) / values.length;
  const standardDeviation = Math.sqrt(variance);
  const standardError = standardDeviation / Math.sqrt(values.length);
  const skewness = standardDeviation > EPSILON
    ? values.reduce((total, value) => total + ((value - average) / standardDeviation) ** 3, 0) / values.length
    : null;
  const kurtosis = standardDeviation > EPSILON
    ? values.reduce((total, value) => total + ((value - average) / standardDeviation) ** 4, 0) / values.length - 3
    : null;
  return {
    metric,
    label: metricLabels[metric].label,
    unitType: metricLabels[metric].unitType,
    count,
    validCount: values.length,
    invalidCount: count - values.length,
    mean: average,
    median: calculatePercentile(values, 0.5),
    standardDeviation,
    min: Math.min(...values),
    max: Math.max(...values),
    p1: calculatePercentile(values, 0.01),
    p5: calculatePercentile(values, 0.05),
    p10: calculatePercentile(values, 0.1),
    p25: calculatePercentile(values, 0.25),
    p50: calculatePercentile(values, 0.5),
    p75: calculatePercentile(values, 0.75),
    p90: calculatePercentile(values, 0.9),
    p95: calculatePercentile(values, 0.95),
    p99: calculatePercentile(values, 0.99),
    standardError,
    confidenceInterval95: {
      low: average - 1.96 * standardError,
      high: average + 1.96 * standardError,
    },
    skewness,
    kurtosis,
  };
};

const buildCdf = (values: number[]) => {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return [];
  const maxPoints = 80;
  const step = Math.max(1, Math.floor(sorted.length / maxPoints));
  const points = sorted
    .filter((_, index) => index % step === 0 || index === sorted.length - 1)
    .map((value, index, list) => ({
      value,
      probability: list.length <= 1 ? 1 : index / (list.length - 1),
    }));
  return points;
};

const correlation = (pairs: { x: number; y: number }[]) => {
  if (pairs.length < 3) return null;
  const xs = pairs.map((pair) => pair.x);
  const ys = pairs.map((pair) => pair.y);
  const meanX = mean(xs) ?? 0;
  const meanY = mean(ys) ?? 0;
  const numerator = pairs.reduce((total, pair) => total + (pair.x - meanX) * (pair.y - meanY), 0);
  const varianceX = pairs.reduce((total, pair) => total + (pair.x - meanX) ** 2, 0);
  const varianceY = pairs.reduce((total, pair) => total + (pair.y - meanY) ** 2, 0);
  const denominator = Math.sqrt(varianceX * varianceY);
  if (denominator <= EPSILON) return null;
  return numerator / denominator;
};

const buildContributions = (
  variables: ResolvedMonteCarloVariable[],
  iterations: MonteCarloIterationResult[],
): MonteCarloContribution[] =>
  variables.map((variable) => {
    const pairs = iterations.flatMap((iteration) => {
      const sample = iteration.samples.find((item) => item.variableId === variable.id);
      return sample && iteration.npv !== null ? [{ x: sample.shock, y: iteration.npv }] : [];
    });
    const value = correlation(pairs);
    const status: SensitivityRunStatus = value === null
      ? "notApplicable"
      : Math.abs(value) < 0.05
        ? "immaterial"
        : "valid";
    return {
      variableId: variable.id,
      variable: variable.label,
      sourceModule: variable.sourceModule,
      correlationWithNpv: value,
      absoluteCorrelation: Math.abs(value ?? 0),
      validPairs: pairs.length,
      status,
    };
  }).sort((a, b) => b.absoluteCorrelation - a.absoluteCorrelation);

const sampleScatterPoints = (points: { x: number; y: number; iteration: number }[]) => {
  const maxPoints = 140;
  if (points.length <= maxPoints) return points;
  const step = Math.max(1, Math.floor(points.length / maxPoints));
  return points.filter((_, index) => index % step === 0);
};

const buildScatter = (
  contributions: MonteCarloContribution[],
  iterations: MonteCarloIterationResult[],
) => {
  const selected = contributions.slice(0, 6);
  return Object.fromEntries(selected.map((contribution) => {
    const points = iterations.flatMap((iteration) => {
      const sample = iteration.samples.find((item) => item.variableId === contribution.variableId);
      return sample && iteration.npv !== null ? [{ x: sample.shock, y: iteration.npv, iteration: iteration.iteration }] : [];
    });
    return [contribution.variableId, sampleScatterPoints(points)];
  }));
};

const rowWithSampleLabel = (row: MonteCarloIterationResult, sampleLabel: string): MonteCarloIterationResult => ({
  ...row,
  sampleLabel: row.sampleLabel ? `${row.sampleLabel} / ${sampleLabel}` : sampleLabel,
});

const closestBy = (
  rows: MonteCarloIterationResult[],
  value: number | null,
  selector: (row: MonteCarloIterationResult) => number | null,
) => {
  if (value === null) return null;
  return rows
    .filter((row) => selector(row) !== null)
    .sort((a, b) => Math.abs((selector(a) ?? 0) - value) - Math.abs((selector(b) ?? 0) - value))[0] ?? null;
};

const sampledRows = (rows: MonteCarloIterationResult[], metricSummaries: Record<MonteCarloMetric, MonteCarloMetricSummary>) => {
  const byIteration = new Map<number, MonteCarloIterationResult>();
  const add = (row: MonteCarloIterationResult | null | undefined, label: string) => {
    if (!row) return;
    const existing = byIteration.get(row.iteration);
    byIteration.set(row.iteration, rowWithSampleLabel(existing ?? row, label));
  };
  const validNpvRows = rows.filter((row) => row.npv !== null);
  const validDscrRows = rows.filter((row) => row.minDscr !== null);
  const validLiquidityRows = rows.filter((row) => row.liquidityGap !== null);

  add([...validNpvRows].sort((a, b) => (a.npv ?? 0) - (b.npv ?? 0))[0], "بدترین NPV");
  add([...validNpvRows].sort((a, b) => (b.npv ?? 0) - (a.npv ?? 0))[0], "بهترین NPV");
  add(closestBy(validNpvRows, metricSummaries.NPV.p5, (row) => row.npv), "نزدیک P5");
  add(closestBy(validNpvRows, metricSummaries.NPV.p50, (row) => row.npv), "میانه P50");
  add(closestBy(validNpvRows, metricSummaries.NPV.p95, (row) => row.npv), "نزدیک P95");
  add([...validDscrRows].sort((a, b) => (a.minDscr ?? Infinity) - (b.minDscr ?? Infinity))[0], "بدترین DSCR");
  add(
    rows.filter((row) => row.cashCrunch).sort((a, b) => (a.liquidityGap ?? Infinity) - (b.liquidityGap ?? Infinity))[0] ??
      [...validLiquidityRows].sort((a, b) => (a.liquidityGap ?? Infinity) - (b.liquidityGap ?? Infinity))[0],
    "بدترین نقدینگی",
  );
  add(rows[Math.min(rows.length - 1, Math.floor(rows.length * 0.37))], "نمونه تصادفی");

  return [...byIteration.values()].sort((a, b) => a.iteration - b.iteration);
};

const probability = (values: Array<number | null>, predicate: (value: number) => boolean) => {
  const finite = values.filter(isFiniteNumber);
  if (!finite.length) return null;
  return finite.filter(predicate).length / finite.length;
};

const calculateDownsideDeviation = (values: number[], threshold: number) => {
  if (!values.length) return null;
  const downside = values.map((value) => Math.min(0, value - threshold));
  return Math.sqrt(downside.reduce((total, value) => total + value * value, 0) / values.length);
};

const calculateTailRisk = (baseNpv: number | null, npvs: number[]) => {
  if (baseNpv === null || !npvs.length) {
    return { valueAtRisk95: null, valueAtRisk99: null, conditionalValueAtRisk95: null, conditionalValueAtRisk99: null };
  }
  const losses = npvs.map((npv) => baseNpv - npv).sort((a, b) => a - b);
  const valueAtRisk95 = calculatePercentile(losses, 0.95);
  const valueAtRisk99 = calculatePercentile(losses, 0.99);
  const cvar = (varValue: number | null) => {
    if (varValue === null) return null;
    const tail = losses.filter((loss) => loss >= varValue);
    return mean(tail);
  };
  return {
    valueAtRisk95,
    valueAtRisk99,
    conditionalValueAtRisk95: cvar(valueAtRisk95),
    conditionalValueAtRisk99: cvar(valueAtRisk99),
  };
};

const configWarnings = (assumptions: MonteCarloAssumptions, iterations: number) => {
  const warnings: MonteCarloQualityWarning[] = [];
  if (iterations < 500) {
    warnings.push(warning(
      "mc.iterations.low",
      "تعداد تکرار کمتر از ۵۰۰ است؛ خروجی برای کنترل سریع مناسب است نه تصمیم نهایی.",
      "برای گزارش رسمی از ۱۰۰۰ یا ۵۰۰۰ تکرار استفاده کنید.",
    ));
  }
  if (assumptions.iterations > MAX_ITERATIONS) {
    warnings.push(warning(
      "mc.iterations.capped",
      "تعداد تکرار به سقف امن ۵۰۰۰ محدود شد.",
      "اجرای ۱۰۰۰۰ تکرار تا زمان benchmark رسمی غیرفعال می‌ماند.",
    ));
  }
  if ((assumptions.correlation?.mode ?? "independent") !== "independent") {
    warnings.push(warning(
      "mc.correlation.disabled",
      CORRELATION_DISABLED_MESSAGE,
      "برای v1، نمونه‌گیری مستقل استفاده می‌شود و ماتریس همبستگی اعمال نمی‌شود.",
    ));
  } else {
    warnings.push(warning(
      "mc.correlation.independent",
      CORRELATION_DISABLED_MESSAGE,
      "همبستگی مصنوعی، ماتریس نمایشی یا copula جعلی در خروجی نمایش داده نمی‌شود.",
    ));
  }
  if ((assumptions.samplingMethod ?? "random") !== "random") {
    warnings.push(warning(
      "mc.sampling.random-only",
      "روش نمونه‌گیری Latin Hypercube هنوز فعال نیست؛ اجرای فعلی با نمونه‌گیری مستقل تصادفی-بذردار انجام شد.",
      "برای تکرارپذیری، seed ثابت نگه داشته شده است.",
    ));
  }
  return warnings;
};

export const groupMonteCarloQualityWarnings = (
  warnings: MonteCarloQualityWarning[],
  variables: Array<{ id: string; label: string }> = [],
) => {
  const variableLabels = new Map(variables.map((variable) => [variable.id, variable.label]));
  const truncatedNormal = warnings.filter((item) => item.id.includes("truncated-normal"));
  const remaining = warnings.filter((item) => !item.id.includes("truncated-normal"));
  if (truncatedNormal.length <= 1) return warnings;

  return [
    ...remaining,
    {
      id: "mc.variable.truncated-normal.grouped",
      severity: "warning",
      message: `${truncatedNormal.length} متغیر با توزیع نرمال محدودشده اجرا می‌شوند.`,
      recommendation: "نمونه‌های خارج از بازه مجاز دوباره نمونه‌گیری یا محدود می‌شوند؛ این موضوع می‌تواند شکل توزیع را تغییر دهد.",
      details: truncatedNormal.map((item) => variableLabels.get(item.variableId ?? "") ?? item.variableId ?? item.sourceModule ?? item.id),
    } satisfies MonteCarloQualityWarning,
  ];
};

const prepareMonteCarloSimulation = (
  project: Project,
  scenario: Scenario,
  coreRunner: CoreRunner,
): MonteCarloSimulationState => {
  const startedAt = new Date().toISOString();
  const baseOutputs = coreRunner(project, scenario, false);
  const assumptions = scenario.assumptions.monteCarlo;
  const requestedIterations = Math.max(1, Math.min(MAX_ITERATIONS, Math.round(assumptions.iterations || 1)));
  const seed = Number.isFinite(assumptions.seed) ? Math.trunc(assumptions.seed) : 123;
  const random = createSeededRandom(seed);
  const selectedMetric = assumptions.selectedMetric ?? "NPV";
  const qualityWarnings = configWarnings(assumptions, requestedIterations);
  const { variables, qualityWarnings: variableWarnings } = resolveVariables(assumptions.variables, scenario, baseOutputs);
  qualityWarnings.push(...variableWarnings);

  return {
    project,
    scenario,
    coreRunner,
    baseOutputs,
    assumptions,
    requestedIterations,
    seed,
    random,
    selectedMetric,
    variables,
    qualityWarnings,
    rows: [],
    startedAt,
  };
};

const appendMonteCarloIteration = (state: MonteCarloSimulationState, iteration: number) => {
  const samples: MonteCarloSample[] = [];
  const iterationWarnings: string[] = [];
  try {
    const shockedProject = state.variables.length ? cloneProject(state.project) : state.project;
    shockedProject.activeScenarioId = state.scenario.id;
    let shockedScenario = state.variables.length ? activeScenario(shockedProject, state.scenario.id) : state.scenario;

    for (const variable of state.variables) {
      const shock = sampleMonteCarloDistribution(state.random, variable.distribution);
      const result = applyRiskVariableShockToScenario(shockedScenario, state.scenario, variable, shock, state.baseOutputs);
      shockedScenario = result.scenario;
      samples.push({
        variableId: variable.id,
        variable: variable.label,
        sourceModule: variable.sourceModule,
        sourcePath: variable.sourcePath,
        unitType: variable.unitType,
        distributionType: variable.distributionType,
        shock,
        baseValue: result.baseValue,
        shockedValue: result.shockedValue,
        warnings: result.warnings,
      });
      iterationWarnings.push(...result.warnings);
    }

    const outputs = state.variables.length
      ? state.coreRunner(shockedProject, activeScenario(shockedProject, shockedScenario.id), false)
      : state.baseOutputs;
    const metrics = metricValuesFromOutputs(outputs);
    const invalidReasons = invalidReasonsFromMetrics(metrics);
    const liquidityGap = metrics.Liquidity;
    const cashCrunch = (liquidityGap !== null && liquidityGap < state.assumptions.liquidityThreshold) || outputs.construction.cashCrunchMonths > 0;
    const dscrBreach = metrics.DSCR !== null && metrics.DSCR < state.scenario.assumptions.financing.targetDscr;
    const bankabilityFailure = (metrics.NPV !== null && metrics.NPV <= state.assumptions.npvThreshold) || dscrBreach || cashCrunch;
    state.rows.push({
      iteration,
      samples,
      metrics,
      npv: metrics.NPV,
      irr: metrics.IRR,
      minDscr: metrics.DSCR,
      liquidityGap,
      payback: metrics.Payback,
      equityValue: metrics.EquityValue,
      bcr: metrics.BCR,
      totalFinancingCost: metrics.FinancingCost,
      cashCrunch,
      bankabilityFailure,
      projectHealthScore: finiteOrNull(outputs.dashboards.projectHealthScore),
      invalidReasons,
      warnings: iterationWarnings,
    });
  } catch {
    state.rows.push({
      iteration,
      samples,
      metrics: Object.fromEntries(metricKeys.map((metric) => [metric, null])) as Record<MonteCarloMetric, number | null>,
      npv: null,
      irr: null,
      minDscr: null,
      liquidityGap: null,
      payback: null,
      equityValue: null,
      bcr: null,
      totalFinancingCost: null,
      cashCrunch: false,
      bankabilityFailure: true,
      projectHealthScore: null,
      invalidReasons: ["modelError"],
      warnings: iterationWarnings,
    });
  }
};

const finalizeMonteCarloSimulation = (state: MonteCarloSimulationState): MonteCarloResult => {
  const { assumptions, baseOutputs, rows, scenario, selectedMetric, seed, requestedIterations, startedAt, variables } = state;
  const metricSummaries = Object.fromEntries(metricKeys.map((metric) => [
    metric,
    summarizeMetric(metric, rows.map((row) => row.metrics[metric]), rows.length),
  ])) as Record<MonteCarloMetric, MonteCarloMetricSummary>;
  const validNpvs = rows.map((row) => row.npv).filter(isFiniteNumber);
  const tailRisk = calculateTailRisk(finiteOrNull(baseOutputs.valuation.npv), validNpvs);
  const contributions = buildContributions(variables, rows);
  const histograms = Object.fromEntries(metricKeys.map((metric) => [
    metric,
    buildHistogram(rows.map((row) => row.metrics[metric]).filter(isFiniteNumber)),
  ]));
  const validIterationCount = rows.filter((row) => row.invalidReasons.length === 0).length;
  const probabilityNpvPositive = probability(rows.map((row) => row.npv), (value) => value > assumptions.npvThreshold) ?? 0;
  const probabilityIrrAboveHurdle = probability(rows.map((row) => row.irr), (value) => value > scenario.assumptions.macro.defaultDiscountRate);
  const probabilityDscrBelowThreshold = probability(rows.map((row) => row.minDscr), (value) => value < scenario.assumptions.financing.targetDscr) ?? 0;
  const probabilityCashCrunch = rows.filter((row) => row.cashCrunch).length / Math.max(1, rows.length);
  const probabilityBankabilityFailure = rows.filter((row) => row.bankabilityFailure).length / Math.max(1, rows.length);
  const completedAt = new Date().toISOString();
  const dominant = contributions[0];
  const qualityWarnings = groupMonteCarloQualityWarnings(state.qualityWarnings, variables);
  const diagnostics = [
    rows.some((row) => row.irr !== null)
      ? "IRR فقط برای تکرارهایی گزارش شده که جریان نقد معتبر و قابل حل داشته‌اند."
      : "IRR مونت‌کارلو قابل گزارش نیست؛ مقدار نمایشی صفر استفاده نشده است.",
    CORRELATION_DISABLED_MESSAGE,
    "VaR بر اساس زیان نسبت به NPV پایه محاسبه شده است: loss = base NPV - iteration NPV.",
  ];

  return {
    runStatus: qualityWarnings.length || validIterationCount < rows.length ? "completedWithWarnings" : "completed",
    seed,
    requestedIterations,
    completedIterations: rows.length,
    activeVariableCount: variables.length,
    validIterationCount,
    invalidIterationCount: rows.length - validIterationCount,
    invalidIterationRate: (rows.length - validIterationCount) / Math.max(1, rows.length),
    startedAt,
    completedAt,
    selectedMetric,
    metricSummaries,
    probabilityNpvPositive,
    probabilityIrrAboveHurdle,
    probabilityDscrBelowThreshold,
    probabilityCashCrunch,
    probabilityBankabilityFailure,
    valueAtRisk95: tailRisk.valueAtRisk95,
    valueAtRisk99: tailRisk.valueAtRisk99,
    conditionalValueAtRisk95: tailRisk.conditionalValueAtRisk95,
    conditionalValueAtRisk99: tailRisk.conditionalValueAtRisk99,
    downsideDeviation: calculateDownsideDeviation(validNpvs, assumptions.npvThreshold),
    dominantRiskScenario: dominant ? dominant.variable : "ریسک غالب قابل تشخیص نیست",
    varConvention: "baseRelativeNpvLoss",
    varConventionDescription: "VaR به صورت زیان نسبت به NPV پایه گزارش می‌شود: loss = base NPV - iteration NPV.",
    histograms,
    cdf: buildCdf(validNpvs),
    scatter: buildScatter(contributions, rows),
    contributions,
    qualityWarnings,
    assumptionProvenance: buildRiskAssumptionProvenance(scenario, baseOutputs),
    p5: metricSummaries.NPV.p5,
    p50: metricSummaries.NPV.p50,
    p95: metricSummaries.NPV.p95,
    var95: tailRisk.valueAtRisk95,
    cvar95: tailRisk.conditionalValueAtRisk95,
    histogram: histograms.NPV ?? [],
    rows,
    sampledRows: sampledRows(rows, metricSummaries),
    diagnostics,
  };
};

const progressSnapshot = (state: MonteCarloSimulationState, startedMs: number, running: boolean): MonteCarloProgressSnapshot => {
  const elapsedMs = Date.now() - startedMs;
  const completedIterations = state.rows.length;
  const remainingIterations = Math.max(0, state.requestedIterations - completedIterations);
  return {
    running,
    completedIterations,
    totalIterations: state.requestedIterations,
    elapsedMs,
    estimatedRemainingMs: completedIterations > 0 && remainingIterations > 0
      ? Math.round((elapsedMs / completedIterations) * remainingIterations)
      : null,
  };
};

const yieldMonteCarloChunk = () => new Promise<void>((resolve) => {
  if (typeof globalThis.requestIdleCallback === "function") {
    globalThis.requestIdleCallback(() => resolve(), { timeout: 50 });
    return;
  }
  setTimeout(resolve, 0);
});

export const runMonteCarloSimulation = (
  project: Project,
  scenario = activeScenario(project),
  coreRunner: CoreRunner,
): MonteCarloResult => {
  const state = prepareMonteCarloSimulation(project, scenario, coreRunner);
  for (let iteration = 1; iteration <= state.requestedIterations; iteration += 1) {
    appendMonteCarloIteration(state, iteration);
  }
  return finalizeMonteCarloSimulation(state);
};

export const runMonteCarloSimulationAsync = async (
  project: Project,
  scenario = activeScenario(project),
  coreRunner: CoreRunner,
  options: MonteCarloAsyncOptions = {},
): Promise<MonteCarloResult | null> => {
  const state = prepareMonteCarloSimulation(project, scenario, coreRunner);
  const chunkSize = Math.max(1, Math.round(options.chunkSize ?? 8));
  const startedMs = Date.now();
  options.onProgress?.(progressSnapshot(state, startedMs, true));

  for (let iteration = 1; iteration <= state.requestedIterations; iteration += 1) {
    if (options.signal?.aborted) return null;
    appendMonteCarloIteration(state, iteration);
    if (iteration % chunkSize === 0 || iteration === state.requestedIterations) {
      options.onProgress?.(progressSnapshot(state, startedMs, true));
      await yieldMonteCarloChunk();
    }
  }

  options.onProgress?.(progressSnapshot(state, startedMs, false));
  return finalizeMonteCarloSimulation(state);
};
