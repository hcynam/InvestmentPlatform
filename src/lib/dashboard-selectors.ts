import { formatMoney, formatNumber, formatPercent, isForeignDisplayUnit } from "@/lib/format";
import type {
  CalculationMetric,
  DisplayUnit,
  Project,
  Scenario,
  ScenarioOutputs,
} from "@/lib/types";

export type DashboardMetricStatus = "available" | "incomplete" | "unavailable" | "invalid" | "stale";
export type DashboardPriceBasis = "nominal" | "real" | "economic-current" | "economic-constant" | "not-applicable";
export type DashboardPeriodType = "all-model-years" | "construction-total" | "model-year" | "debt-service-years" | "simulation-run";
export type DashboardComparison = "greater-than" | "greater-than-or-equal" | "less-than" | "less-than-or-equal";
export type DashboardMetricUnit = "money" | "percent" | "ratio" | "years" | "months" | "number";

export type DashboardThreshold = {
  value: number;
  unit: DashboardMetricUnit;
  comparison: DashboardComparison;
  owner: string;
  priceBasis: DashboardPriceBasis;
};

export type DashboardMetric = {
  id: DashboardMetricId;
  title: string;
  value: number | null;
  status: DashboardMetricStatus;
  reason?: string;
  owner: string;
  sourceTab: string;
  scenarioId: string;
  calculationVersion: string;
  calculatedAt: string;
  periodType: DashboardPeriodType;
  periodLabel: string;
  priceBasis: DashboardPriceBasis;
  internalUnit: string;
  displayUnit: DisplayUnit;
  unit: DashboardMetricUnit;
  signConvention: string;
  threshold: DashboardThreshold | null;
  comparison: "passes" | "fails" | "not-evaluated";
  drilldown: string;
  dataQualityIssues: string[];
};

export type DashboardMetricId =
  | "total-capex"
  | "annual-capex"
  | "funding-gap"
  | "project-npv"
  | "project-irr"
  | "project-payback"
  | "discounted-project-payback"
  | "equity-irr"
  | "minimum-dscr"
  | "average-dscr"
  | "annual-revenue"
  | "annual-ebitda"
  | "annual-net-profit"
  | "annual-project-fcff"
  | "enpv"
  | "eirr"
  | "ebcr"
  | "mc-npv-above-threshold"
  | "mc-irr-above-hurdle"
  | "mc-dscr-below-target";

export type DashboardDecisionStatus =
  | "recalculation-required"
  | "invalid"
  | "incomplete"
  | "financially-unacceptable"
  | "conditionally-acceptable"
  | "financially-acceptable"
  | "acceptable"
  | "unacceptable"
  | "not-applicable";

export type DashboardDecisionLens = {
  id: "overall" | "financial" | "bankability" | "economic";
  status: DashboardDecisionStatus;
  label: string;
  reason: string;
  metricIds: DashboardMetricId[];
};

export type DashboardAnnualSeriesRow = {
  year: number;
  calendarYear: number;
  revenue: number | null;
  ebitda: number | null;
  netProfit: number | null;
  projectFcff: number | null;
};

export type DashboardViewModel = {
  context: {
    projectId: string;
    scenarioId: string;
    scenarioName: string;
    calculationVersion: string;
    calculatedAt: string;
    dirty: boolean;
    calculationBasis: DashboardPriceBasis;
    economicPriceBasis: DashboardPriceBasis;
    baseCurrency: string;
    displayUnit: DisplayUnit;
    displayUnitSupported: boolean;
    stabilizedOperatingYear: number | null;
    selectedOperatingYear: number | null;
    periodLabel: string;
  };
  metrics: Record<DashboardMetricId, DashboardMetric>;
  decisions: {
    overall: DashboardDecisionLens;
    financial: DashboardDecisionLens;
    bankability: DashboardDecisionLens;
    economic: DashboardDecisionLens;
  };
  annualSeries: DashboardAnnualSeriesRow[];
  validationIssues: ScenarioOutputs["validations"];
};

type SelectorOptions = {
  dirty?: boolean;
  operatingYear?: number;
};

const finiteOrNull = (value: number | null | undefined) =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const selectedFinancialBasis = (outputs: ScenarioOutputs): DashboardPriceBasis =>
  outputs.valuation.calculationBasis === "واقعی" ? "real" : "nominal";

const selectedEconomicBasis = (outputs: ScenarioOutputs): DashboardPriceBasis =>
  outputs.economic.summary.priceBasis === "real" ? "economic-constant" : "economic-current";

const metricStatus = (metric: CalculationMetric): DashboardMetricStatus => {
  if (metric.status === "ok" && finiteOrNull(metric.value) !== null) return "available";
  if (metric.status === "not_computable") return "unavailable";
  return "invalid";
};

const compare = (
  value: number | null,
  threshold: DashboardThreshold | null,
  status: DashboardMetricStatus,
): DashboardMetric["comparison"] => {
  if (status !== "available" || value === null || threshold === null) return "not-evaluated";
  if (threshold.comparison === "greater-than") return value > threshold.value ? "passes" : "fails";
  if (threshold.comparison === "greater-than-or-equal") return value >= threshold.value ? "passes" : "fails";
  if (threshold.comparison === "less-than") return value < threshold.value ? "passes" : "fails";
  return value <= threshold.value ? "passes" : "fails";
};

export const selectStabilizedOperatingYear = (
  scenario: Scenario,
  outputs: ScenarioOutputs,
): number | null => {
  const target = finiteOrNull(
    scenario.assumptions.capacity.stableYearUtilizationRate
      ?? scenario.assumptions.capacity.utilizationStable,
  );
  if (target === null) return null;
  const operatingRows = outputs.capacity.rows.filter((row) => row.year > 0);
  const tolerance = Math.max(1e-9, Math.abs(target) * 1e-6);
  const stabilized = operatingRows.find((row, index) =>
    Math.abs(row.utilization - target) <= tolerance
    && operatingRows.slice(index).every((later) => Math.abs(later.utilization - target) <= tolerance));
  return stabilized?.year ?? null;
};

export const buildDashboardViewModel = (
  project: Project,
  scenario: Scenario,
  outputs: ScenarioOutputs,
  options: SelectorOptions = {},
): DashboardViewModel => {
  const dirty = options.dirty ?? false;
  const financialBasis = selectedFinancialBasis(outputs);
  const economicBasis = selectedEconomicBasis(outputs);
  const calculationVersion = `${project.version}:${scenario.version}`;
  const stabilizedOperatingYear = selectStabilizedOperatingYear(scenario, outputs);
  const requestedYear = options.operatingYear;
  const selectedOperatingYear = requestedYear !== undefined
    && outputs.statements.rows.some((row) => row.year === requestedYear && row.year > 0)
    ? requestedYear
    : stabilizedOperatingYear;
  const statementRow = selectedOperatingYear === null
    ? undefined
    : outputs.statements.rows.find((row) => row.year === selectedOperatingYear);
  const valuationRow = selectedOperatingYear === null
    ? undefined
    : outputs.valuation.annualRows.find((row) => row.year === selectedOperatingYear);
  const capexRow = selectedOperatingYear === null
    ? undefined
    : outputs.capex.annual.find((row) => row.year === selectedOperatingYear);
  const debtExists = outputs.financing.annualSchedule.some((row) => row.debtService > 0);
  const displayUnitSupported = !isForeignDisplayUnit(project.displayUnit);
  const moneyQualityIssues = displayUnitSupported
    ? []
    : ["نمایش ارزی بدون مالک تبدیل نرخ ارز پشتیبانی نمی‌شود؛ مقدار خام همچنان در واحد پول مبنا نگهداری شده است."];

  const common = {
    scenarioId: scenario.id,
    calculationVersion,
    calculatedAt: outputs.generatedAt,
    displayUnit: project.displayUnit,
  };

  const makeMetric = (input: Omit<DashboardMetric, keyof typeof common | "comparison" | "dataQualityIssues"> & {
    dataQualityIssues?: string[];
  }): DashboardMetric => {
    const baseStatus = input.status;
    const status = dirty && baseStatus !== "incomplete" ? "stale" : baseStatus;
    const reason = dirty
      ? "ورودی‌های بالادست تغییر کرده‌اند؛ برای تصمیم معتبر محاسبه مجدد لازم است."
      : input.reason;
    const dataQualityIssues = [
      ...(input.unit === "money" ? moneyQualityIssues : []),
      ...(input.dataQualityIssues ?? []),
    ];
    return {
      ...common,
      ...input,
      status,
      reason,
      dataQualityIssues,
      comparison: compare(input.value, input.threshold, status),
    };
  };

  const fromCalculationMetric = (
    id: DashboardMetricId,
    title: string,
    metric: CalculationMetric,
    details: Omit<Parameters<typeof makeMetric>[0], "id" | "title" | "value" | "status" | "reason">,
  ) => makeMetric({
    id,
    title,
    value: finiteOrNull(metric.value),
    status: metricStatus(metric),
    reason: metric.reason,
    ...details,
  });

  const rawMetric = (
    id: DashboardMetricId,
    title: string,
    value: number | null | undefined,
    details: Omit<Parameters<typeof makeMetric>[0], "id" | "title" | "value" | "status" | "reason">,
    unavailableReason?: string,
  ) => {
    const finiteValue = finiteOrNull(value);
    return makeMetric({
      id,
      title,
      value: finiteValue,
      status: finiteValue === null ? "unavailable" : "available",
      reason: finiteValue === null ? unavailableReason ?? "خروجی معتبر در مالک محاسبه موجود نیست." : undefined,
      ...details,
    });
  };

  const projectNpvThreshold: DashboardThreshold = {
    value: 0,
    unit: "money",
    comparison: "greater-than-or-equal",
    owner: "Dashboard semantic policy",
    priceBasis: financialBasis,
  };
  const projectIrrThreshold: DashboardThreshold | null = finiteOrNull(outputs.valuation.appliedDiscountRate) === null
    ? null
    : {
      value: outputs.valuation.appliedDiscountRate,
      unit: "percent",
      comparison: "greater-than-or-equal",
      owner: "DCF valuation applied discount rate",
      priceBasis: financialBasis,
    };
  const dscrThreshold: DashboardThreshold = {
    value: scenario.assumptions.financing.targetDscr,
    unit: "ratio",
    comparison: "greater-than-or-equal",
    owner: "Financing assumptions targetDscr",
    priceBasis: "not-applicable",
  };
  const eockThreshold: DashboardThreshold = {
    value: outputs.economic.summary.socialDiscountRate,
    unit: "percent",
    comparison: "greater-than-or-equal",
    owner: "Economic analysis EOCK",
    priceBasis: economicBasis,
  };
  const equityHurdle = finiteOrNull(outputs.valuation.summary.discountRateBuildUp.appliedCostOfEquity);
  const equityThreshold: DashboardThreshold | null = equityHurdle === null
    ? null
    : {
      value: equityHurdle,
      unit: "percent",
      comparison: "greater-than-or-equal",
      owner: "DCF valuation selected-basis Cost of Equity",
      priceBasis: financialBasis,
    };
  const periodLabel = selectedOperatingYear === null
    ? "سال تثبیت‌شده تعیین نشده"
    : `سال عملیاتی ${selectedOperatingYear}`;

  const metrics = {
    "total-capex": rawMetric("total-capex", "کل CAPEX", outputs.capex.totalCapex, {
      owner: "CAPEX engine",
      sourceTab: "Capex12",
      periodType: "construction-total",
      periodLabel: "کل دوره سرمایه‌گذاری",
      priceBasis: "nominal",
      internalUnit: `${project.currency}:base-unit`,
      unit: "money",
      signConvention: "مقدار مثبت نشان‌دهنده مخارج سرمایه‌ای است.",
      threshold: null,
      drilldown: "../capex",
    }),
    "annual-capex": rawMetric("annual-capex", "CAPEX سالانه", capexRow?.cashCapex, {
      owner: "CAPEX annual schedule",
      sourceTab: "Capex12 / ConstructionCashFlow",
      periodType: "model-year",
      periodLabel,
      priceBasis: "nominal",
      internalUnit: `${project.currency}:base-unit`,
      unit: "money",
      signConvention: "مقدار مثبت نشان‌دهنده پرداخت CAPEX است.",
      threshold: null,
      drilldown: "../capex",
    }, "سال عملیاتی تثبیت‌شده برای CAPEX سالانه موجود نیست."),
    "funding-gap": rawMetric("funding-gap", "نیاز تأمین‌نشده ساخت", outputs.construction.creditLineRequired, {
      owner: "Construction cash-flow engine",
      sourceTab: "ConstructionCashFlow",
      periodType: "construction-total",
      periodLabel: "دوره ساخت",
      priceBasis: "nominal",
      internalUnit: `${project.currency}:base-unit`,
      unit: "money",
      signConvention: "مقدار مثبت نشان‌دهنده نیاز به خط اعتباری یا منبع تکمیلی است.",
      threshold: {
        value: 0,
        unit: "money",
        comparison: "less-than-or-equal",
        owner: "Construction funding control",
        priceBasis: "nominal",
      },
      drilldown: "../construction-cashflow",
    }),
    "project-npv": fromCalculationMetric("project-npv", "NPV پروژه", outputs.valuation.metrics.npv, {
      owner: "DCF valuation engine",
      sourceTab: "DCF-Valuation17",
      periodType: "all-model-years",
      periodLabel: `سال ۰ تا ${project.modelHorizonYears}`,
      priceBasis: financialBasis,
      internalUnit: `${project.currency}:base-unit`,
      unit: "money",
      signConvention: "مثبت نشان‌دهنده خلق ارزش مالی پروژه است.",
      threshold: projectNpvThreshold,
      drilldown: "../valuation",
    }),
    "project-irr": fromCalculationMetric("project-irr", "IRR پروژه", outputs.valuation.metrics.irr, {
      owner: "DCF valuation engine",
      sourceTab: "DCF-Valuation17",
      periodType: "all-model-years",
      periodLabel: `سال ۰ تا ${project.modelHorizonYears}`,
      priceBasis: financialBasis,
      internalUnit: "decimal-rate",
      unit: "percent",
      signConvention: "نرخ بازده FCFF پروژه.",
      threshold: projectIrrThreshold,
      drilldown: "../valuation",
      dataQualityIssues: projectIrrThreshold?.priceBasis === financialBasis
        ? []
        : ["مبنای نرخ بازده و نرخ تنزیل همسان نیست."],
    }),
    "project-payback": fromCalculationMetric("project-payback", "دوره بازگشت پروژه", outputs.valuation.metrics.payback, {
      owner: "DCF valuation engine",
      sourceTab: "DCF-Valuation17",
      periodType: "all-model-years",
      periodLabel: `سال ۰ تا ${project.modelHorizonYears}`,
      priceBasis: financialBasis,
      internalUnit: "years",
      unit: "years",
      signConvention: "مدت کمتر به معنی بازیافت سریع‌تر است.",
      threshold: null,
      drilldown: "../valuation",
    }),
    "discounted-project-payback": fromCalculationMetric("discounted-project-payback", "دوره بازگشت تنزیل‌شده", outputs.valuation.metrics.discountedPayback, {
      owner: "DCF valuation engine",
      sourceTab: "DCF-Valuation17",
      periodType: "all-model-years",
      periodLabel: `سال ۰ تا ${project.modelHorizonYears}`,
      priceBasis: financialBasis,
      internalUnit: "years",
      unit: "years",
      signConvention: "مدت کمتر به معنی بازیافت سریع‌تر است.",
      threshold: null,
      drilldown: "../valuation",
    }),
    "equity-irr": fromCalculationMetric("equity-irr", "IRR حقوق صاحبان سهام", outputs.valuation.metrics.fcfeIrr, {
      owner: "DCF valuation engine / FCFE",
      sourceTab: "DCF-Valuation17",
      periodType: "all-model-years",
      periodLabel: `سال ۰ تا ${project.modelHorizonYears}`,
      priceBasis: financialBasis,
      internalUnit: "decimal-rate",
      unit: "percent",
      signConvention: "نرخ بازده جریان نقدی سهامدار.",
      threshold: equityThreshold,
      drilldown: "../valuation",
      dataQualityIssues: equityThreshold === null ? ["هزینه حقوق صاحبان سهام هم‌مبنا در خروجی DCF موجود نیست."] : [],
    }),
    "minimum-dscr": debtExists
      ? rawMetric("minimum-dscr", "حداقل DSCR", outputs.financing.minimumDscr, {
        owner: "Financing/statements DSCR schedule",
        sourceTab: "Financing14 / FinancialStatements16",
        periodType: "debt-service-years",
        periodLabel: "سال‌های دارای خدمت بدهی",
        priceBasis: "not-applicable",
        internalUnit: "ratio",
        unit: "ratio",
        signConvention: "نسبت بالاتر نشان‌دهنده پوشش بیشتر خدمت بدهی است.",
        threshold: dscrThreshold,
        drilldown: "../financing",
      })
      : makeMetric({
        id: "minimum-dscr",
        title: "حداقل DSCR",
        value: null,
        status: "unavailable",
        reason: "خدمت بدهی در افق مدل وجود ندارد؛ DSCR قابل اعمال نیست.",
        owner: "Financing/statements DSCR schedule",
        sourceTab: "Financing14 / FinancialStatements16",
        periodType: "debt-service-years",
        periodLabel: "بدون خدمت بدهی",
        priceBasis: "not-applicable",
        internalUnit: "ratio",
        unit: "ratio",
        signConvention: "نسبت بالاتر نشان‌دهنده پوشش بیشتر خدمت بدهی است.",
        threshold: dscrThreshold,
        drilldown: "../financing",
      }),
    "average-dscr": debtExists
      ? rawMetric("average-dscr", "میانگین DSCR", outputs.financing.averageDscr, {
        owner: "Financing/statements DSCR schedule",
        sourceTab: "Financing14 / FinancialStatements16",
        periodType: "debt-service-years",
        periodLabel: "سال‌های دارای خدمت بدهی",
        priceBasis: "not-applicable",
        internalUnit: "ratio",
        unit: "ratio",
        signConvention: "نسبت بالاتر نشان‌دهنده پوشش بیشتر خدمت بدهی است.",
        threshold: dscrThreshold,
        drilldown: "../financing",
      })
      : makeMetric({
        id: "average-dscr",
        title: "میانگین DSCR",
        value: null,
        status: "unavailable",
        reason: "خدمت بدهی در افق مدل وجود ندارد؛ DSCR قابل اعمال نیست.",
        owner: "Financing/statements DSCR schedule",
        sourceTab: "Financing14 / FinancialStatements16",
        periodType: "debt-service-years",
        periodLabel: "بدون خدمت بدهی",
        priceBasis: "not-applicable",
        internalUnit: "ratio",
        unit: "ratio",
        signConvention: "نسبت بالاتر نشان‌دهنده پوشش بیشتر خدمت بدهی است.",
        threshold: dscrThreshold,
        drilldown: "../financing",
      }),
    "annual-revenue": rawMetric("annual-revenue", "درآمد سالانه", statementRow?.revenue, {
      owner: "Revenue engine",
      sourceTab: "MarketDemand08 / FinancialStatements16",
      periodType: "model-year",
      periodLabel,
      priceBasis: "nominal",
      internalUnit: `${project.currency}:base-unit`,
      unit: "money",
      signConvention: "درآمد مثبت.",
      threshold: null,
      drilldown: "../revenue",
    }, "سال عملیاتی تثبیت‌شده تعیین نشده است."),
    "annual-ebitda": rawMetric("annual-ebitda", "EBITDA سالانه", statementRow?.ebitda, {
      owner: "Financial statements engine",
      sourceTab: "FinancialStatements16",
      periodType: "model-year",
      periodLabel,
      priceBasis: "nominal",
      internalUnit: `${project.currency}:base-unit`,
      unit: "money",
      signConvention: "مقدار منفی نشان‌دهنده زیان عملیاتی پیش از استهلاک است.",
      threshold: null,
      drilldown: "../financial-statements",
    }, "سال عملیاتی تثبیت‌شده تعیین نشده است."),
    "annual-net-profit": rawMetric("annual-net-profit", "سود خالص سالانه", statementRow?.netProfit, {
      owner: "Financial statements engine",
      sourceTab: "FinancialStatements16",
      periodType: "model-year",
      periodLabel,
      priceBasis: "nominal",
      internalUnit: `${project.currency}:base-unit`,
      unit: "money",
      signConvention: "مقدار منفی نشان‌دهنده زیان خالص است.",
      threshold: null,
      drilldown: "../financial-statements",
    }, "سال عملیاتی تثبیت‌شده تعیین نشده است."),
    "annual-project-fcff": rawMetric("annual-project-fcff", "FCFF پروژه", valuationRow?.fcff, {
      owner: "DCF valuation selected-basis annual schedule",
      sourceTab: "DCF-Valuation17",
      periodType: "model-year",
      periodLabel,
      priceBasis: financialBasis,
      internalUnit: `${project.currency}:base-unit`,
      unit: "money",
      signConvention: "مثبت نشان‌دهنده جریان نقدی آزاد پروژه است.",
      threshold: null,
      drilldown: "../valuation",
    }, "سال عملیاتی تثبیت‌شده تعیین نشده است."),
    enpv: fromCalculationMetric("enpv", "ENPV", outputs.economic.summary.metrics.enpv, {
      owner: "Economic analysis engine",
      sourceTab: "EconomicAnalysis18",
      periodType: "all-model-years",
      periodLabel: `سال ۰ تا ${project.modelHorizonYears}`,
      priceBasis: economicBasis,
      internalUnit: `${project.currency}:base-unit`,
      unit: "money",
      signConvention: "مثبت نشان‌دهنده ارزش اقتصادی خالص است.",
      threshold: {
        value: 0,
        unit: "money",
        comparison: "greater-than-or-equal",
        owner: "Economic viability policy",
        priceBasis: economicBasis,
      },
      drilldown: "../economic-analysis",
    }),
    eirr: fromCalculationMetric("eirr", "EIRR", outputs.economic.summary.metrics.eirr, {
      owner: "Economic analysis engine",
      sourceTab: "EconomicAnalysis18",
      periodType: "all-model-years",
      periodLabel: `سال ۰ تا ${project.modelHorizonYears}`,
      priceBasis: economicBasis,
      internalUnit: "decimal-rate",
      unit: "percent",
      signConvention: "نرخ بازده اقتصادی.",
      threshold: eockThreshold,
      drilldown: "../economic-analysis",
    }),
    ebcr: fromCalculationMetric("ebcr", "EBCR", outputs.economic.summary.metrics.ebcr, {
      owner: "Economic analysis engine",
      sourceTab: "EconomicAnalysis18",
      periodType: "all-model-years",
      periodLabel: `سال ۰ تا ${project.modelHorizonYears}`,
      priceBasis: economicBasis,
      internalUnit: "ratio",
      unit: "ratio",
      signConvention: "بیشتر از یک نشان‌دهنده فزونی منافع اقتصادی بر هزینه‌ها است.",
      threshold: {
        value: 1,
        unit: "ratio",
        comparison: "greater-than-or-equal",
        owner: "Economic viability policy",
        priceBasis: economicBasis,
      },
      drilldown: "../economic-analysis",
    }),
    "mc-npv-above-threshold": rawMetric("mc-npv-above-threshold", "احتمال عبور NPV از آستانه", outputs.monteCarlo?.probabilityNpvPositive, {
      owner: "Monte Carlo engine",
      sourceTab: "MonteCarlo20",
      periodType: "simulation-run",
      periodLabel: outputs.monteCarlo ? `اجرای ${outputs.monteCarlo.completedAt}` : "اجرا نشده",
      priceBasis: financialBasis,
      internalUnit: "decimal-probability",
      unit: "percent",
      signConvention: "احتمال بیشتر نشان‌دهنده تکرار بیشتر عبور از آستانه است.",
      threshold: outputs.monteCarlo ? {
        value: scenario.assumptions.monteCarlo.npvThreshold,
        unit: "money",
        comparison: "greater-than",
        owner: "Monte Carlo assumptions npvThreshold",
        priceBasis: financialBasis,
      } : null,
      drilldown: "../monte-carlo",
    }, "مونت‌کارلو برای نتایج جاری اجرا نشده است."),
    "mc-irr-above-hurdle": rawMetric("mc-irr-above-hurdle", "احتمال عبور IRR از نرخ مبنا", outputs.monteCarlo?.probabilityIrrAboveHurdle, {
      owner: "Monte Carlo engine",
      sourceTab: "MonteCarlo20",
      periodType: "simulation-run",
      periodLabel: outputs.monteCarlo ? `اجرای ${outputs.monteCarlo.completedAt}` : "اجرا نشده",
      priceBasis: financialBasis,
      internalUnit: "decimal-probability",
      unit: "percent",
      signConvention: "احتمال بیشتر نشان‌دهنده تکرار بیشتر عبور IRR از نرخ تنزیل هم‌مبنا است.",
      threshold: outputs.monteCarlo?.baseIrrHurdle === null || outputs.monteCarlo?.baseIrrHurdle === undefined ? null : {
        value: outputs.monteCarlo.baseIrrHurdle,
        unit: "percent",
        comparison: "greater-than",
        owner: "Monte Carlo selected-basis IRR hurdle",
        priceBasis: financialBasis,
      },
      drilldown: "../monte-carlo",
      dataQualityIssues: outputs.monteCarlo
        && ((outputs.monteCarlo.irrHurdleBasis === "real") !== (financialBasis === "real"))
        ? ["مبنای نرخ مانع مونت‌کارلو با مبنای ارزش‌گذاری همسان نیست."]
        : [],
    }, "مونت‌کارلو برای نتایج جاری اجرا نشده است."),
    "mc-dscr-below-target": rawMetric("mc-dscr-below-target", "احتمال نقض DSCR", outputs.monteCarlo?.probabilityDscrBelowThreshold, {
      owner: "Monte Carlo engine",
      sourceTab: "MonteCarlo20",
      periodType: "simulation-run",
      periodLabel: outputs.monteCarlo ? `اجرای ${outputs.monteCarlo.completedAt}` : "اجرا نشده",
      priceBasis: "not-applicable",
      internalUnit: "decimal-probability",
      unit: "percent",
      signConvention: "احتمال بیشتر نشان‌دهنده ریسک بیشتر نقض covenant است.",
      threshold: dscrThreshold,
      drilldown: "../monte-carlo",
    }, debtExists ? "مونت‌کارلو برای نتایج جاری اجرا نشده است." : "خدمت بدهی وجود ندارد؛ احتمال نقض DSCR قابل اعمال نیست."),
  } satisfies Record<DashboardMetricId, DashboardMetric>;

  const financialMetricIds: DashboardMetricId[] = ["project-npv", "project-irr", "project-payback"];
  const criticalFinancial = [metrics["project-npv"], metrics["project-irr"]];
  const financial: DashboardDecisionLens = dirty
    ? {
      id: "financial",
      status: "recalculation-required",
      label: "نیازمند محاسبه مجدد",
      reason: "نتایج مالی نسبت به ورودی‌های جاری قدیمی هستند.",
      metricIds: financialMetricIds,
    }
    : criticalFinancial.some((metric) => metric.status === "invalid")
      ? {
        id: "financial",
        status: "invalid",
        label: "محاسبه مالی نامعتبر",
        reason: "حداقل یکی از شاخص‌های اصلی DCF نامعتبر است.",
        metricIds: financialMetricIds,
      }
      : criticalFinancial.some((metric) => metric.status !== "available")
        ? {
          id: "financial",
          status: "incomplete",
          label: "تحلیل مالی ناقص",
          reason: "NPV یا IRR معتبر برای تصمیم مالی موجود نیست.",
          metricIds: financialMetricIds,
        }
        : metrics["project-npv"].comparison === "passes" && metrics["project-irr"].comparison === "passes"
          ? {
            id: "financial",
            status: "acceptable",
            label: "از نظر مالی قابل قبول",
            reason: "NPV غیرمنفی و IRR حداقل برابر نرخ تنزیل هم‌مبنا است.",
            metricIds: financialMetricIds,
          }
          : {
            id: "financial",
            status: "unacceptable",
            label: "از نظر مالی غیرقابل قبول",
            reason: "NPV یا IRR معیار مالی مصوب را تأمین نمی‌کند.",
            metricIds: financialMetricIds,
          };

  const bankMetricIds: DashboardMetricId[] = ["minimum-dscr", "average-dscr", "funding-gap"];
  const fundingGapValue = metrics["funding-gap"].value;
  const fundingIssue = metrics["funding-gap"].status === "available"
    && fundingGapValue !== null
    && fundingGapValue > 0;
  const bankability: DashboardDecisionLens = dirty
    ? {
      id: "bankability",
      status: "recalculation-required",
      label: "نیازمند محاسبه مجدد",
      reason: "نتایج تأمین مالی نسبت به ورودی‌های جاری قدیمی هستند.",
      metricIds: bankMetricIds,
    }
    : !debtExists
      ? {
        id: "bankability",
        status: fundingIssue ? "unacceptable" : "not-applicable",
        label: fundingIssue ? "نیاز تأمین ساخت پوشش داده نشده" : "بدون خدمت بدهی",
        reason: fundingIssue
          ? "مالک جریان نقدی ساخت نیاز به منبع تکمیلی را گزارش کرده است."
          : "در افق مدل خدمت بدهی وجود ندارد؛ آزمون DSCR قابل اعمال نیست.",
        metricIds: bankMetricIds,
      }
      : metrics["minimum-dscr"].status !== "available"
        ? {
          id: "bankability",
          status: metrics["minimum-dscr"].status === "invalid" ? "invalid" : "incomplete",
          label: "تحلیل بانک‌پذیری ناقص",
          reason: "حداقل DSCR معتبر در سال‌های خدمت بدهی موجود نیست.",
          metricIds: bankMetricIds,
        }
        : metrics["minimum-dscr"].comparison === "passes" && !fundingIssue
          ? {
            id: "bankability",
            status: "acceptable",
            label: "پوشش تأمین مالی قابل قبول",
            reason: "حداقل DSCR هدف را تأمین می‌کند و نیاز ساخت پوشش‌داده‌نشده گزارش نشده است.",
            metricIds: bankMetricIds,
          }
          : {
            id: "bankability",
            status: "unacceptable",
            label: "نیازمند شرط یا اصلاح تأمین مالی",
            reason: fundingIssue
              ? "مالک جریان نقدی ساخت نیاز به منبع تکمیلی را گزارش کرده است."
              : "حداقل DSCR از هدف تأمین مالی کمتر است.",
            metricIds: bankMetricIds,
          };

  const economicMetricIds: DashboardMetricId[] = ["enpv", "eirr", "ebcr"];
  const economicMetrics = economicMetricIds.map((id) => metrics[id]);
  const economic: DashboardDecisionLens = dirty
    ? {
      id: "economic",
      status: "recalculation-required",
      label: "نیازمند محاسبه مجدد",
      reason: "نتایج اقتصادی نسبت به ورودی‌های جاری قدیمی هستند.",
      metricIds: economicMetricIds,
    }
    : economicMetrics.some((metric) => metric.status === "invalid")
      ? {
        id: "economic",
        status: "invalid",
        label: "تحلیل اقتصادی نامعتبر",
        reason: "حداقل یکی از شاخص‌های اقتصادی نامعتبر است.",
        metricIds: economicMetricIds,
      }
      : economicMetrics.some((metric) => metric.status !== "available")
        ? {
          id: "economic",
          status: "incomplete",
          label: "تحلیل اقتصادی ناقص",
          reason: "نبود خروجی اقتصادی نباید تصمیم مالی خصوصی را رد کند.",
          metricIds: economicMetricIds,
        }
        : economicMetrics.every((metric) => metric.comparison === "passes")
          ? {
            id: "economic",
            status: "acceptable",
            label: "از نظر اقتصادی قابل قبول",
            reason: "ENPV، EIRR و EBCR معیارهای اقتصادی را تأمین می‌کنند.",
            metricIds: economicMetricIds,
          }
          : {
            id: "economic",
            status: "unacceptable",
            label: "از نظر اقتصادی غیرقابل قبول",
            reason: "حداقل یکی از معیارهای اقتصادی تأمین نشده است.",
            metricIds: economicMetricIds,
          };

  const overall: DashboardDecisionLens = dirty
    ? {
      id: "overall",
      status: "recalculation-required",
      label: "محاسبه مجدد لازم است",
      reason: "خروجی‌های قبلی فقط به‌عنوان نتایج قدیمی قابل مشاهده‌اند و مبنای تصمیم نیستند.",
      metricIds: [...financialMetricIds, ...bankMetricIds],
    }
    : financial.status === "invalid" || bankability.status === "invalid"
      ? {
        id: "overall",
        status: "invalid",
        label: "تصمیم نامعتبر",
        reason: "یک محاسبه حیاتی مالی یا تأمین مالی نامعتبر است.",
        metricIds: [...financialMetricIds, ...bankMetricIds],
      }
      : financial.status === "incomplete" || bankability.status === "incomplete"
        ? {
          id: "overall",
          status: "incomplete",
          label: "تصمیم ناقص",
          reason: "خروجی لازم برای تصمیم مالی یا تأمین مالی موجود نیست.",
          metricIds: [...financialMetricIds, ...bankMetricIds],
        }
        : financial.status === "unacceptable"
          ? {
            id: "overall",
            status: "financially-unacceptable",
            label: "از نظر مالی غیرقابل قبول",
            reason: financial.reason,
            metricIds: financialMetricIds,
          }
          : bankability.status === "unacceptable"
            ? {
              id: "overall",
              status: "conditionally-acceptable",
              label: "قابل قبول مشروط",
              reason: "پروژه از نظر مالی قابل قبول است اما ساختار تأمین مالی یا پوشش بدهی نیازمند اصلاح است.",
              metricIds: [...financialMetricIds, ...bankMetricIds],
            }
            : {
              id: "overall",
              status: "financially-acceptable",
              label: "از نظر مالی قابل قبول",
              reason: bankability.status === "not-applicable"
                ? "معیارهای مالی تأمین شده‌اند و پروژه خدمت بدهی ندارد."
                : "معیارهای مالی و پوشش تأمین مالی تأمین شده‌اند.",
              metricIds: [...financialMetricIds, ...bankMetricIds],
            };

  return {
    context: {
      projectId: project.id,
      scenarioId: scenario.id,
      scenarioName: scenario.name,
      calculationVersion,
      calculatedAt: outputs.generatedAt,
      dirty,
      calculationBasis: financialBasis,
      economicPriceBasis: economicBasis,
      baseCurrency: project.currency,
      displayUnit: project.displayUnit,
      displayUnitSupported,
      stabilizedOperatingYear,
      selectedOperatingYear,
      periodLabel,
    },
    metrics,
    decisions: { overall, financial, bankability, economic },
    annualSeries: outputs.valuation.annualRows.map((row) => ({
      year: row.year,
      calendarYear: row.calendarYear,
      revenue: finiteOrNull(row.revenue),
      ebitda: finiteOrNull(row.ebitda),
      netProfit: finiteOrNull(outputs.statements.rows.find((item) => item.year === row.year)?.netProfit),
      projectFcff: finiteOrNull(row.fcff),
    })),
    validationIssues: outputs.validations,
  };
};

export const formatDashboardMetric = (metric: DashboardMetric, project: Project) => {
  if (metric.status === "invalid") return "نامعتبر";
  if (metric.status === "incomplete") return "ناقص";
  if (metric.status === "unavailable") return "ناموجود";
  if (metric.value === null) return "ناموجود";
  if (metric.unit === "money") return formatMoney(metric.value, project);
  if (metric.unit === "percent") return formatPercent(metric.value);
  if (metric.unit === "years") return `${formatNumber(metric.value)} سال`;
  if (metric.unit === "months") return `${formatNumber(metric.value)} ماه`;
  return formatNumber(metric.value);
};

export const dashboardMetricTone = (metric: DashboardMetric) => {
  if (metric.status === "stale" || metric.status === "incomplete") return "warning" as const;
  if (metric.status === "invalid") return "danger" as const;
  if (metric.status === "unavailable") return "neutral" as const;
  if (metric.comparison === "passes") return "success" as const;
  if (metric.comparison === "fails") return "danger" as const;
  return "neutral" as const;
};

export const dashboardDecisionTone = (decision: DashboardDecisionLens) => {
  if (decision.status === "financially-acceptable" || decision.status === "acceptable") return "success" as const;
  if (decision.status === "conditionally-acceptable" || decision.status === "incomplete" || decision.status === "recalculation-required") return "warning" as const;
  if (decision.status === "not-applicable") return "neutral" as const;
  return "danger" as const;
};

export const canExportDashboardView = (view: DashboardViewModel) =>
  !view.context.dirty && view.decisions.overall.status !== "recalculation-required";

export const BANK_DASHBOARD_POLICY = Object.freeze({
  minimumInterestCoverage: 1.5,
  minimumCollateralCoverage: 1,
});

export type BankMetricStatus = "available" | "stale" | "unavailable" | "invalid" | "not-applicable";
export type BankMetricComparison = "passes" | "fails" | "not-evaluated";
export type BankMetricId =
  | "minimum-dscr"
  | "average-dscr"
  | "first-repayment-dscr"
  | "total-debt"
  | "debt-share"
  | "equity-share"
  | "debt-to-equity"
  | "peak-debt"
  | "peak-debt-service"
  | "total-principal"
  | "total-interest"
  | "total-debt-service"
  | "interest-coverage"
  | "collateral-coverage";

export type BankMetric = {
  id: BankMetricId;
  title: string;
  value: number | null;
  unit: DashboardMetricUnit;
  status: BankMetricStatus;
  comparison: BankMetricComparison;
  threshold: DashboardThreshold | null;
  occurrenceYear: number | null;
  owner: string;
  sourceTab: string;
  drilldown: string;
  periodLabel: string;
  reason?: string;
};

export type BankTimelineRow = {
  year: number;
  dscr: number | null;
  threshold: number;
  principal: number;
  interest: number;
  debtService: number;
  outstandingDebt: number;
  status: "safe" | "risk" | "not-evaluated" | "stale";
  financingDrilldown: string;
  costDrilldown: string;
};

export type BankStressCase = {
  id: "price" | "opex" | "capex" | "delay" | "interest" | "fx";
  label: string;
  status: BankMetricStatus;
  shock: number | null;
  changeType: "percent" | "absolute" | null;
  dscr: number | null;
  threshold: number;
  comparison: BankMetricComparison;
  reason: string;
  sourceModule: string;
  drilldown: string;
};

export type BankCreditDimension = {
  id: "coverage" | "leverage" | "interest-coverage" | "stress" | "collateral" | "data-completeness";
  label: string;
  status: "pass" | "warning" | "fail" | "unavailable" | "not-applicable" | "stale" | "invalid";
  summary: string;
  drilldown: string;
};

export type BankDashboardViewModel = {
  context: DashboardViewModel["context"] & {
    hasDebt: boolean;
    freshness: "fresh" | "stale";
  };
  metrics: Record<BankMetricId, BankMetric>;
  timeline: BankTimelineRow[];
  facilities: Array<{
    id: string;
    title: string;
    amount: number;
    annualRate: number;
    graceMonths: number;
    repaymentTermMonths: number;
    collateralRequired: boolean;
    collateralValue: number | null;
  }>;
  stressCases: BankStressCase[];
  creditConclusion: {
    status: "acceptable" | "conditionally-acceptable" | "unacceptable" | "incomplete" | "recalculation-required" | "not-applicable" | "invalid";
    label: string;
    reason: string;
    definitive: boolean;
    dimensions: BankCreditDimension[];
  };
  unavailableAnalyses: Array<{ label: string; reason: string }>;
};

const bankComparison = (
  value: number | null,
  threshold: DashboardThreshold | null,
  status: BankMetricStatus,
): BankMetricComparison => {
  if (status !== "available" || value === null || threshold === null) return "not-evaluated";
  return compare(value, threshold, "available");
};

const bankDimensionStatus = (metric: BankMetric): BankCreditDimension["status"] => {
  if (metric.status === "stale") return "stale";
  if (metric.status === "invalid") return "invalid";
  if (metric.status === "not-applicable") return "not-applicable";
  if (metric.status !== "available") return "unavailable";
  if (metric.comparison === "fails") return "fail";
  return metric.comparison === "passes" ? "pass" : "warning";
};

const stressKind = (point: ScenarioOutputs["sensitivity"]["oneWay"][number]) => {
  const text = `${point.variableId} ${point.variable} ${point.sourceModule}`.toLowerCase();
  if (text.includes("salesprice") || text.includes("قیمت فروش")) return "price";
  if (text.includes("opex")) return "opex";
  if (text.includes("capex")) return "capex";
  if (text.includes("delay") || text.includes("تاخیر")) return "delay";
  if (text.includes("debtinterest") || text.includes("نرخ بهره")) return "interest";
  if (text.includes("fxrate") || text.includes("نرخ ارز")) return "fx";
  return null;
};

const stressDefinitions = [
  { id: "price", label: "کاهش قیمت / درآمد", adverse: "low" },
  { id: "opex", label: "افزایش OPEX", adverse: "high" },
  { id: "capex", label: "افزایش CAPEX", adverse: "high" },
  { id: "delay", label: "تأخیر راه‌اندازی", adverse: "high" },
  { id: "interest", label: "افزایش نرخ تسهیلات", adverse: "high" },
  { id: "fx", label: "شوک نرخ ارز", adverse: "high" },
] as const;

export const buildBankDashboardViewModel = (
  project: Project,
  scenario: Scenario,
  outputs: ScenarioOutputs,
  options: SelectorOptions = {},
): BankDashboardViewModel => {
  const base = buildDashboardViewModel(project, scenario, outputs, options);
  const dirty = base.context.dirty;
  const targetDscr = finiteOrNull(scenario.assumptions.financing.targetDscr);
  const dscrThreshold: DashboardThreshold | null = targetDscr === null ? null : {
    value: targetDscr,
    unit: "ratio",
    comparison: "greater-than-or-equal",
    owner: "Financing assumptions targetDscr",
    priceBasis: "not-applicable",
  };
  const targetDebtToEquity = finiteOrNull(scenario.assumptions.financing.targetDebtToEquity);
  const leverageThreshold: DashboardThreshold | null = targetDebtToEquity === null || targetDebtToEquity < 0 ? null : {
    value: targetDebtToEquity,
    unit: "ratio",
    comparison: "less-than-or-equal",
    owner: "Financing assumptions targetDebtToEquity",
    priceBasis: "not-applicable",
  };
  const interestCoverageThreshold: DashboardThreshold = {
    value: BANK_DASHBOARD_POLICY.minimumInterestCoverage,
    unit: "ratio",
    comparison: "greater-than-or-equal",
    owner: "Bank dashboard semantic policy",
    priceBasis: "not-applicable",
  };
  const collateralThreshold: DashboardThreshold = {
    value: BANK_DASHBOARD_POLICY.minimumCollateralCoverage,
    unit: "ratio",
    comparison: "greater-than-or-equal",
    owner: "Bank dashboard semantic policy",
    priceBasis: "not-applicable",
  };
  const activeInstruments = (scenario.assumptions.financing.instruments ?? [])
    .filter((instrument) => instrument.active && finiteOrNull(instrument.amount) !== null && instrument.amount > 0);
  const totalDebt = finiteOrNull(outputs.financing.kpis.totalDebt);
  const hasDebt = (totalDebt ?? 0) > 0 || activeInstruments.length > 0;
  const debtRows = outputs.financing.annualSchedule.filter((row) => row.debtService > 0);
  const repaymentRows = outputs.financing.annualSchedule.filter((row) => row.principalRepayment > 0);
  const firstRepaymentRow = repaymentRows[0];
  const minimumDscr = finiteOrNull(outputs.financing.minimumDscr);
  const minimumDscrRow = minimumDscr === null
    ? undefined
    : debtRows.find((row) => row.dscr !== null && Math.abs(row.dscr - minimumDscr) <= Math.max(1e-9, Math.abs(minimumDscr) * 1e-9));
  const interestCoverageRows = outputs.statements.rows
    .filter((row) => row.interest > 0 && finiteOrNull(row.interestCoverage) !== null);
  const minimumInterestCoverageRow = interestCoverageRows.reduce<typeof interestCoverageRows[number] | undefined>(
    (lowest, row) => !lowest || Number(row.interestCoverage) < Number(lowest.interestCoverage) ? row : lowest,
    undefined,
  );
  const peakDebtServiceRow = outputs.financing.annualSchedule
    .find((row) => row.year === outputs.financing.kpis.peakDebtServiceYear);
  const collateralRequired = activeInstruments.some((instrument) => instrument.collateralRequired);
  const collateralDataComplete = collateralRequired && activeInstruments
    .filter((instrument) => instrument.collateralRequired)
    .every((instrument) => finiteOrNull(instrument.collateralValue) !== null && Number(instrument.collateralValue) > 0);

  const makeMetric = (input: Omit<BankMetric, "status" | "comparison"> & { status?: BankMetricStatus }): BankMetric => {
    const baseStatus = input.status ?? (input.value === null ? "unavailable" : "available");
    const status = dirty && baseStatus === "available" ? "stale" : baseStatus;
    return {
      ...input,
      status,
      comparison: bankComparison(input.value, input.threshold, status),
      reason: dirty && baseStatus === "available"
        ? "ورودی‌های بالادست تغییر کرده‌اند؛ این مقدار فقط نتیجه پیشین است."
        : input.reason,
    };
  };

  const noDebtMetric = (id: BankMetricId, title: string, unit: DashboardMetricUnit, owner: string, sourceTab: string, drilldown: string) => makeMetric({
    id,
    title,
    value: null,
    unit,
    status: "not-applicable",
    threshold: null,
    occurrenceYear: null,
    owner,
    sourceTab,
    drilldown,
    periodLabel: "بدون تأمین مالی بدهی",
    reason: "پروژه تسهیلات بدهی فعال ندارد.",
  });

  const metricInputs: Record<BankMetricId, BankMetric> = {
    "minimum-dscr": hasDebt ? makeMetric({ id: "minimum-dscr", title: "حداقل DSCR", value: minimumDscr, unit: "ratio", threshold: dscrThreshold, occurrenceYear: minimumDscrRow?.year ?? null, owner: "Financing/statements DSCR schedule", sourceTab: "Financing14 / FinancialStatements16", drilldown: "../financing#financing-debt-service-schedule", periodLabel: "سال‌های دارای خدمت بدهی", reason: minimumDscr === null ? "DSCR معتبر برای سال‌های خدمت بدهی موجود نیست." : undefined }) : noDebtMetric("minimum-dscr", "حداقل DSCR", "ratio", "Financing/statements DSCR schedule", "Financing14 / FinancialStatements16", "../financing#financing-debt-service-schedule"),
    "average-dscr": hasDebt ? makeMetric({ id: "average-dscr", title: "میانگین DSCR", value: finiteOrNull(outputs.financing.averageDscr), unit: "ratio", threshold: dscrThreshold, occurrenceYear: null, owner: "Financing/statements DSCR schedule", sourceTab: "Financing14 / FinancialStatements16", drilldown: "../financing#financing-debt-service-schedule", periodLabel: "فقط سال‌های دارای خدمت بدهی", reason: outputs.financing.averageDscr === null ? "میانگین DSCR برای سال‌های خدمت بدهی قابل محاسبه نیست." : undefined }) : noDebtMetric("average-dscr", "میانگین DSCR", "ratio", "Financing/statements DSCR schedule", "Financing14 / FinancialStatements16", "../financing#financing-debt-service-schedule"),
    "first-repayment-dscr": hasDebt ? makeMetric({ id: "first-repayment-dscr", title: "DSCR اولین سال بازپرداخت اصل", value: finiteOrNull(firstRepaymentRow?.dscr), unit: "ratio", threshold: dscrThreshold, occurrenceYear: firstRepaymentRow?.year ?? null, owner: "Financing/statements DSCR schedule", sourceTab: "Financing14 / FinancialStatements16", drilldown: "../financing#financing-debt-service-schedule", periodLabel: firstRepaymentRow ? `سال مدل ${firstRepaymentRow.year}` : "سال بازپرداخت اصل تعیین نشده", reason: firstRepaymentRow ? "DSCR سال نخست بازپرداخت اصل معتبر نیست." : "بازپرداخت اصل در افق مدل وجود ندارد." }) : noDebtMetric("first-repayment-dscr", "DSCR اولین سال بازپرداخت اصل", "ratio", "Financing/statements DSCR schedule", "Financing14 / FinancialStatements16", "../financing#financing-debt-service-schedule"),
    "total-debt": hasDebt ? makeMetric({ id: "total-debt", title: "کل تسهیلات بدهی", value: totalDebt, unit: "money", threshold: null, occurrenceYear: null, owner: "Financing engine", sourceTab: "Financing14", drilldown: "../financing#financing-facilities", periodLabel: "ساختار مصوب تأمین مالی" }) : noDebtMetric("total-debt", "کل تسهیلات بدهی", "money", "Financing engine", "Financing14", "../financing#financing-facilities"),
    "debt-share": hasDebt ? makeMetric({ id: "debt-share", title: "سهم بدهی از منابع", value: finiteOrNull(outputs.financing.kpis.debtShareOfFunding), unit: "percent", threshold: null, occurrenceYear: null, owner: "Financing engine", sourceTab: "Financing14", drilldown: "../financing#financing-facilities", periodLabel: "بدهی ÷ کل منابع" }) : noDebtMetric("debt-share", "سهم بدهی از منابع", "percent", "Financing engine", "Financing14", "../financing#financing-facilities"),
    "equity-share": hasDebt ? makeMetric({ id: "equity-share", title: "سهم آورده از منابع", value: outputs.financing.kpis.totalFunding > 0 ? finiteOrNull(outputs.financing.kpis.shareholderEquity / outputs.financing.kpis.totalFunding) : null, unit: "percent", threshold: null, occurrenceYear: null, owner: "Dashboard semantic aggregation of financing outputs", sourceTab: "Financing14", drilldown: "../financing#financing-facilities", periodLabel: "آورده ÷ کل منابع" }) : noDebtMetric("equity-share", "سهم آورده از منابع", "percent", "Financing engine", "Financing14", "../financing#financing-facilities"),
    "debt-to-equity": hasDebt ? makeMetric({ id: "debt-to-equity", title: "بدهی به آورده", value: finiteOrNull(outputs.financing.kpis.debtToEquity), unit: "ratio", threshold: leverageThreshold, occurrenceYear: null, owner: "Financing engine", sourceTab: "Financing14", drilldown: "../financing#financing-facilities", periodLabel: "ساختار منابع" }) : noDebtMetric("debt-to-equity", "بدهی به آورده", "ratio", "Financing engine", "Financing14", "../financing#financing-facilities"),
    "peak-debt": hasDebt ? makeMetric({ id: "peak-debt", title: "اوج مانده بدهی", value: finiteOrNull(outputs.financing.kpis.maxRemainingDebt), unit: "money", threshold: null, occurrenceYear: outputs.financing.kpis.peakDebtYear, owner: "Financing engine", sourceTab: "Financing14", drilldown: "../financing#financing-debt-service-schedule", periodLabel: "مانده پایان سال" }) : noDebtMetric("peak-debt", "اوج مانده بدهی", "money", "Financing engine", "Financing14", "../financing#financing-debt-service-schedule"),
    "peak-debt-service": hasDebt ? makeMetric({ id: "peak-debt-service", title: "اوج خدمت سالانه بدهی", value: finiteOrNull(peakDebtServiceRow?.debtService), unit: "money", threshold: null, occurrenceYear: peakDebtServiceRow?.year ?? null, owner: "Financing annual debt schedule", sourceTab: "Financing14", drilldown: "../financing#financing-debt-service-schedule", periodLabel: "بیشترین پرداخت سالانه" }) : noDebtMetric("peak-debt-service", "اوج خدمت سالانه بدهی", "money", "Financing annual debt schedule", "Financing14", "../financing#financing-debt-service-schedule"),
    "total-principal": hasDebt ? makeMetric({ id: "total-principal", title: "کل بازپرداخت اصل", value: finiteOrNull(outputs.financing.annualSchedule.reduce((sum, row) => sum + row.principalRepayment, 0)), unit: "money", threshold: null, occurrenceYear: null, owner: "Financing annual debt schedule", sourceTab: "Financing14", drilldown: "../financing#financing-debt-service-schedule", periodLabel: "افق کامل مدل" }) : noDebtMetric("total-principal", "کل بازپرداخت اصل", "money", "Financing annual debt schedule", "Financing14", "../financing#financing-debt-service-schedule"),
    "total-interest": hasDebt ? makeMetric({ id: "total-interest", title: "کل سود / هزینه مالی", value: finiteOrNull(outputs.financing.annualSchedule.reduce((sum, row) => sum + row.interest, 0)), unit: "money", threshold: null, occurrenceYear: null, owner: "Financing annual debt schedule", sourceTab: "Financing14", drilldown: "../financing#financing-cost-schedule", periodLabel: "افق کامل مدل" }) : noDebtMetric("total-interest", "کل سود / هزینه مالی", "money", "Financing annual debt schedule", "Financing14", "../financing#financing-cost-schedule"),
    "total-debt-service": hasDebt ? makeMetric({ id: "total-debt-service", title: "کل خدمت بدهی", value: finiteOrNull(outputs.financing.totalDebtService), unit: "money", threshold: null, occurrenceYear: null, owner: "Financing engine", sourceTab: "Financing14", drilldown: "../financing#financing-debt-service-schedule", periodLabel: "افق کامل مدل" }) : noDebtMetric("total-debt-service", "کل خدمت بدهی", "money", "Financing engine", "Financing14", "../financing#financing-debt-service-schedule"),
    "interest-coverage": hasDebt ? makeMetric({ id: "interest-coverage", title: "حداقل پوشش بهره (ICR)", value: finiteOrNull(minimumInterestCoverageRow?.interestCoverage), unit: "ratio", threshold: interestCoverageThreshold, occurrenceYear: minimumInterestCoverageRow?.year ?? null, owner: "Financial statements engine", sourceTab: "FinancialStatements16", drilldown: "../financial-statements", periodLabel: "سال‌های دارای هزینه بهره", reason: minimumInterestCoverageRow ? undefined : "نسبت پوشش بهره معتبر در صورت‌های مالی موجود نیست." }) : noDebtMetric("interest-coverage", "حداقل پوشش بهره (ICR)", "ratio", "Financial statements engine", "FinancialStatements16", "../financial-statements"),
    "collateral-coverage": hasDebt ? makeMetric({ id: "collateral-coverage", title: "پوشش وثیقه", value: collateralDataComplete ? finiteOrNull(outputs.financing.kpis.collateralCoverage) : null, unit: "ratio", status: collateralRequired ? collateralDataComplete ? undefined : "unavailable" : "not-applicable", threshold: collateralRequired ? collateralThreshold : null, occurrenceYear: null, owner: "Financing engine from entered collateral values", sourceTab: "Financing14", drilldown: "../financing#financing-facilities", periodLabel: "وثایق ثبت‌شده", reason: collateralRequired ? collateralDataComplete ? undefined : "برای همه تسهیلات وثیقه‌دار، ارزش واقعی وثیقه ثبت نشده است." : "هیچ تسهیلات فعالی الزام وثیقه ندارد." }) : noDebtMetric("collateral-coverage", "پوشش وثیقه", "ratio", "Financing engine", "Financing14", "../financing#financing-facilities"),
  };

  const timeline: BankTimelineRow[] = hasDebt ? outputs.financing.annualSchedule
    .filter((row) => row.drawdown > 0 || row.openingBalance > 0 || row.endingBalance > 0 || row.debtService > 0)
    .map((row) => ({
      year: row.year,
      dscr: finiteOrNull(row.dscr),
      threshold: targetDscr ?? 0,
      principal: row.principalRepayment,
      interest: row.interest,
      debtService: row.debtService,
      outstandingDebt: row.endingBalance,
      status: dirty ? "stale" : row.debtService <= 0 || row.dscr === null || targetDscr === null
        ? "not-evaluated"
        : row.dscr < targetDscr ? "risk" : "safe",
      financingDrilldown: "../financing#financing-debt-service-schedule",
      costDrilldown: "../financing#financing-cost-schedule",
    })) : [];

  const stressCases: BankStressCase[] = stressDefinitions.map((definition) => {
    const threshold = targetDscr ?? 0;
    if (!hasDebt) return { ...definition, status: "not-applicable", shock: null, changeType: null, dscr: null, threshold, comparison: "not-evaluated", reason: "پروژه تأمین مالی بدهی فعال ندارد.", sourceModule: "Sensitivity19", drilldown: "../sensitivity" };
    if (dirty) return { ...definition, status: "stale", shock: null, changeType: null, dscr: null, threshold, comparison: "not-evaluated", reason: "نتایج تنش تا محاسبه مجدد جاری نیستند.", sourceModule: "Sensitivity19", drilldown: "../sensitivity" };
    if (outputs.sensitivity.selectedMetric !== "DSCR") return { ...definition, status: "unavailable", shock: null, changeType: null, dscr: null, threshold, comparison: "not-evaluated", reason: `تحلیل حساسیت جاری برای ${outputs.sensitivity.selectedMetric} اجرا شده است، نه DSCR.`, sourceModule: "Sensitivity19", drilldown: "../sensitivity" };
    const candidates = outputs.sensitivity.oneWay.filter((point) => stressKind(point) === definition.id && (definition.adverse === "low" ? point.shock < 0 : point.shock > 0));
    const point = candidates.toSorted((left, right) => definition.adverse === "low" ? left.shock - right.shock : right.shock - left.shock)[0];
    if (!point) return { ...definition, status: "unavailable", shock: null, changeType: null, dscr: null, threshold, comparison: "not-evaluated", reason: "این تنش با باز‌محاسبه موتور سناریو ارزیابی نشده است.", sourceModule: "Sensitivity19", drilldown: "../sensitivity" };
    const status: BankMetricStatus = point.status === "noExposure" || point.status === "notApplicable"
      ? "not-applicable"
      : point.status === "invalid" || point.status === "modelError"
        ? "invalid"
        : point.metric === null ? "unavailable" : "available";
    const value = finiteOrNull(point.metric);
    const comparison = status === "available" && value !== null && targetDscr !== null
      ? value >= targetDscr ? "passes" : "fails"
      : "not-evaluated";
    return { ...definition, status, shock: point.shock, changeType: point.changeType, dscr: value, threshold, comparison, reason: point.reason ?? "خروجی از باز‌محاسبه کامل موتور سناریو استخراج شده است.", sourceModule: point.sourceModule, drilldown: "../sensitivity" };
  });

  const stressEvaluated = stressCases.filter((item) => item.status !== "not-applicable");
  const stressDimensionStatus: BankCreditDimension["status"] = dirty
    ? "stale"
    : stressEvaluated.some((item) => item.status === "invalid")
      ? "invalid"
      : stressEvaluated.some((item) => item.status !== "available")
        ? "unavailable"
        : stressEvaluated.some((item) => item.comparison === "fails") ? "fail" : "pass";
  const relevantValidationIssues = outputs.validations.filter((issue) => /financ|statement|construction|capex|تأمین|مالی/i.test(`${issue.module} ${issue.sourceSheet ?? ""}`));
  const completenessMetrics: BankMetricId[] = ["minimum-dscr", "average-dscr", "first-repayment-dscr", "total-debt", "debt-to-equity", "peak-debt", "peak-debt-service", "total-principal", "total-interest", "total-debt-service", "interest-coverage"];
  const completenessStatus: BankCreditDimension["status"] = dirty
    ? "stale"
    : completenessMetrics.some((id) => metricInputs[id].status === "invalid") || relevantValidationIssues.some((issue) => issue.severity === "error")
      ? "invalid"
      : completenessMetrics.some((id) => metricInputs[id].status !== "available")
        ? "unavailable"
        : relevantValidationIssues.some((issue) => issue.severity === "warning") || outputs.financing.warnings.length
          ? "warning"
          : "pass";
  const dimensions: BankCreditDimension[] = [
    { id: "coverage", label: "پوشش خدمت بدهی", status: bankDimensionStatus(metricInputs["minimum-dscr"]), summary: metricInputs["minimum-dscr"].comparison === "fails" ? "حداقل DSCR کمتر از covenant مصوب است." : metricInputs["minimum-dscr"].reason ?? "حداقل DSCR با آستانه مصوب مقایسه شده است.", drilldown: metricInputs["minimum-dscr"].drilldown },
    { id: "leverage", label: "اهرم مالی", status: bankDimensionStatus(metricInputs["debt-to-equity"]), summary: metricInputs["debt-to-equity"].comparison === "fails" ? "نسبت بدهی به آورده از هدف ساختار منابع بیشتر است." : metricInputs["debt-to-equity"].reason ?? "نسبت بدهی به آورده با هدف تأمین مالی مقایسه شده است.", drilldown: metricInputs["debt-to-equity"].drilldown },
    { id: "interest-coverage", label: "پوشش بهره", status: bankDimensionStatus(metricInputs["interest-coverage"]), summary: metricInputs["interest-coverage"].comparison === "fails" ? "حداقل ICR کمتر از سیاست اعتباری داشبورد است." : metricInputs["interest-coverage"].reason ?? "حداقل ICR سال‌های دارای بهره ارزیابی شده است.", drilldown: metricInputs["interest-coverage"].drilldown },
    { id: "stress", label: "تاب‌آوری تنش", status: stressDimensionStatus, summary: stressDimensionStatus === "fail" ? "حداقل یک تنش باز‌محاسبه‌شده DSCR را زیر covenant می‌برد." : stressDimensionStatus === "pass" ? "تمام تنش‌های قابل اعمال و باز‌محاسبه‌شده covenant را حفظ می‌کنند." : "تحلیل تنش معتبر و کامل DSCR در دسترس نیست.", drilldown: "../sensitivity" },
    { id: "collateral", label: "وضعیت وثیقه", status: bankDimensionStatus(metricInputs["collateral-coverage"]), summary: metricInputs["collateral-coverage"].reason ?? (metricInputs["collateral-coverage"].comparison === "fails" ? "پوشش وثیقه کمتر از سیاست اعتباری است." : "ارزش وثایق ثبت‌شده پوشش لازم را تأمین می‌کند."), drilldown: metricInputs["collateral-coverage"].drilldown },
    { id: "data-completeness", label: "کامل‌بودن داده", status: completenessStatus, summary: completenessStatus === "pass" ? "خروجی‌های حیاتی بانکی معتبر و بدون هشدار مرتبط هستند." : completenessStatus === "warning" ? "خروجی‌ها موجودند اما هشدار مرتبط باید بررسی شود." : "حداقل یک خروجی حیاتی، اعتبار یا تازگی لازم را ندارد.", drilldown: "../financial-statements" },
  ];
  const requiredDimensions = dimensions.filter((dimension) => dimension.status !== "not-applicable");
  const definitive = hasDebt && requiredDimensions.every((dimension) => ["pass", "warning", "fail"].includes(dimension.status));
  const creditConclusion = !hasDebt
    ? { status: "not-applicable" as const, label: "بدون تأمین مالی بدهی", reason: "هیچ تسهیلات بدهی فعالی برای ارزیابی اعتباری وجود ندارد.", definitive: false, dimensions }
    : dirty
      ? { status: "recalculation-required" as const, label: "محاسبه مجدد لازم است", reason: "ورودی‌ها تغییر کرده‌اند؛ نتیجه اعتباری پیشین مبنای تصمیم یا خروجی معتبر نیست.", definitive: false, dimensions }
      : requiredDimensions.some((dimension) => dimension.status === "invalid")
        ? { status: "invalid" as const, label: "تحلیل اعتباری نامعتبر", reason: "حداقل یک محاسبه حیاتی اعتباری نامعتبر است.", definitive: false, dimensions }
        : !definitive
          ? { status: "incomplete" as const, label: "جمع‌بندی اعتباری ناقص", reason: "تا تکمیل خروجی‌های حیاتی و تحلیل تنش، نتیجه قطعی صادر نمی‌شود.", definitive: false, dimensions }
          : requiredDimensions.some((dimension) => dimension.status === "fail")
            ? { status: "unacceptable" as const, label: "نیازمند اصلاح ساختار اعتباری", reason: "حداقل یک بعد اعتباری معیار مصوب را تأمین نمی‌کند.", definitive: true, dimensions }
            : requiredDimensions.some((dimension) => dimension.status === "warning")
              ? { status: "conditionally-acceptable" as const, label: "قابل بررسی با شرط", reason: "معیارهای عددی عبور کرده‌اند اما هشدارهای داده یا مدل باید رفع شوند.", definitive: true, dimensions }
              : { status: "acceptable" as const, label: "قابل بررسی اعتباری", reason: "ابعاد پوشش بدهی، اهرم، بهره، تنش و داده معیارهای جاری را تأمین می‌کنند.", definitive: true, dimensions };

  return {
    context: { ...base.context, hasDebt, freshness: dirty ? "stale" : "fresh" },
    metrics: metricInputs,
    timeline,
    facilities: activeInstruments.map((instrument) => ({
      id: instrument.id,
      title: instrument.title,
      amount: instrument.amount,
      annualRate: instrument.annualRate,
      graceMonths: instrument.graceEnabled ? instrument.graceMonths : 0,
      repaymentTermMonths: instrument.repaymentTermMonths,
      collateralRequired: instrument.collateralRequired,
      collateralValue: finiteOrNull(instrument.collateralValue),
    })),
    stressCases,
    creditConclusion,
    unavailableAnalyses: [
      { label: "LLCR", reason: "تعریف و سری CFADS عمر وام به‌صورت خروجی canonical مستقل موجود نیست." },
      { label: "PLCR", reason: "تعریف و سری جریان نقد عمر پروژه برای PLCR در موتور تأمین مالی موجود نیست." },
    ],
  };
};

export const formatBankMetric = (metric: BankMetric, project: Project) => {
  if (metric.status === "invalid") return "نامعتبر";
  if (metric.status === "unavailable") return "ناموجود";
  if (metric.status === "not-applicable") return "قابل اعمال نیست";
  if (metric.value === null) return "ناموجود";
  if (metric.unit === "money") return formatMoney(metric.value, project);
  if (metric.unit === "percent") return formatPercent(metric.value);
  if (metric.unit === "years") return `${formatNumber(metric.value)} سال`;
  if (metric.unit === "months") return `${formatNumber(metric.value)} ماه`;
  return formatNumber(metric.value);
};
