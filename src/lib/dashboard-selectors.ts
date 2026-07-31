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

export const MANAGEMENT_POLICY = {
  minimumCurrentRatio: 1,
  maximumExceptions: 8,
  owner: "Management dashboard semantic policy",
} as const;

export const MANAGEMENT_ACTIONS = {
  recalculate: {
    id: "recalculate-model",
    label: "مدل را پس از تغییر ورودی‌ها دوباره محاسبه کنید.",
    drilldown: "../setup",
  },
  resolveCalculation: {
    id: "resolve-calculation-error",
    label: "خطاهای محاسباتی ماژول مبدأ را رفع و محاسبه را تکرار کنید.",
    drilldown: "../financial-statements",
  },
  reviseFunding: {
    id: "revise-construction-funding",
    label: "برنامه تأمین مالی دوره ساخت و زمان‌بندی تزریق منابع را بازنگری کنید.",
    drilldown: "../construction-cashflow",
  },
  reviewCommissioning: {
    id: "review-commissioning-assumptions",
    label: "فرض‌های تأخیر و آمادگی راه‌اندازی را در برنامه ساخت بررسی کنید.",
    drilldown: "../construction-cashflow",
  },
  validateRampUp: {
    id: "validate-production-ramp-up",
    label: "پروفایل راه‌اندازی ظرفیت و سال تثبیت تولید را تکمیل یا بازبینی کنید.",
    drilldown: "../capacity-production",
  },
  reviewOpex: {
    id: "review-operating-costs",
    label: "هشدارهای هزینه عملیاتی و محرک غالب هزینه را در ماژول مبدأ بررسی کنید.",
    drilldown: "../opex",
  },
  completeWorkingCapital: {
    id: "complete-working-capital",
    label: "ورودی‌ها و خروجی‌های سرمایه در گردش و نقدینگی را تکمیل کنید.",
    drilldown: "../working-capital",
  },
  runRiskAnalysis: {
    id: "run-risk-analysis",
    label: "تحلیل حساسیت را از ماژول ریسک با باز‌محاسبه کامل موتور اجرا کنید.",
    drilldown: "../sensitivity",
  },
} as const;

export type ManagementStatus =
  | "ready"
  | "attention"
  | "critical"
  | "stale"
  | "invalid"
  | "unavailable"
  | "not-applicable";

export type ManagementMetricUnit = "money" | "percent" | "ratio" | "number" | "months" | "year";

export type ManagementMetricId =
  | "construction-duration"
  | "peak-construction-capex"
  | "construction-funding-requirement"
  | "construction-credit-line"
  | "peak-construction-deficit"
  | "total-capex"
  | "contingency"
  | "delay-cost"
  | "peak-working-capital"
  | "cumulative-cash-requirement"
  | "minimum-cash"
  | "operating-cash-transition"
  | "capex-fx-exposure"
  | "opex-fx-exposure";

export type ManagementMetric = {
  id: ManagementMetricId;
  label: string;
  value: number | null;
  unit: ManagementMetricUnit;
  status: ManagementStatus;
  reason?: string;
  period: string;
  occurrenceYear: number | null;
  occurrenceMonth: number | null;
  owner: string;
  source: string;
  drilldown: string;
  priceBasis: DashboardPriceBasis;
};

export type ManagementDimensionId =
  | "implementation-readiness"
  | "construction-funding"
  | "commissioning-readiness"
  | "operating-ramp-up"
  | "operating-cost-control"
  | "liquidity-working-capital"
  | "risk-driver-exposure"
  | "model-validity";

export type ManagementDimension = {
  id: ManagementDimensionId;
  label: string;
  status: ManagementStatus;
  evidenceCode: string;
  evidence: string;
  affectedPeriod: string;
  owner: string;
  source: string;
  drilldown: string;
  unavailableReason?: string;
};

export type ManagementOperatingRow = {
  year: number;
  calendarYear: number | null;
  phase: "ramp-up" | "stabilized";
  productionVolume: number | null;
  utilization: number | null;
  salesVolume: number | null;
  revenue: number | null;
  cogs: number | null;
  opex: number | null;
  ebitda: number | null;
  operatingCashFlow: number | null;
  fcff: number | null;
  workingCapital: number | null;
  changeInWorkingCapital: number | null;
};

export type ManagementConstructionRow = {
  month: number;
  date: string;
  phase: string;
  capex: number | null;
  cumulativeCapex: number | null;
  equityDraw: number | null;
  debtDraw: number | null;
  creditLineDraw: number | null;
  totalOutflow: number | null;
  endingCash: number | null;
  fundingStatus: "sufficient" | "credit-line" | "uncovered";
};

export type ManagementOperatingSummaryId =
  | "production"
  | "utilization"
  | "sales-volume"
  | "revenue"
  | "cogs"
  | "opex"
  | "ebitda"
  | "operating-cash-flow"
  | "fcff"
  | "working-capital";

export type ManagementOperatingSummary = {
  id: ManagementOperatingSummaryId;
  label: string;
  unit: ManagementMetricUnit;
  status: ManagementStatus;
  first: { value: number | null; year: number | null };
  stabilized: { value: number | null; year: number | null };
  minimum: { value: number | null; year: number | null };
  maximum: { value: number | null; year: number | null };
  owner: string;
  source: string;
  drilldown: string;
};

export type ManagementScenarioComparisonRow = {
  id: string;
  label: string;
  unit: ManagementMetricUnit;
  status: "available" | "unavailable";
  activeValue: number | null;
  baseValue: number | null;
  delta: number | null;
  period: string;
  owner: string;
  source: string;
  drilldown: string;
  reason?: string;
};

export type ManagementException = {
  id: string;
  severity: "critical" | "warning" | "information";
  priority: number;
  issue: string;
  evidence: string;
  affectedPeriod: string;
  impact: string;
  actionId: string;
  action: string;
  source: string;
  drilldown: string;
};

export type ManagementRiskDriver = {
  id: string;
  label: string;
  metric: string;
  range: number;
  low: number | null;
  high: number | null;
  source: string;
  drilldown: string;
};

export type ManagementDashboardViewModel = {
  context: {
    projectId: string;
    projectName: string;
    scenarioId: string;
    scenarioName: string;
    baseScenarioId: string | null;
    baseScenarioName: string | null;
    calculationVersion: string;
    calculatedAt: string;
    freshness: "fresh" | "stale";
    calculationState: "available" | "partial" | "error" | "unavailable";
    calculationStateReason: string;
    calculationBasis: DashboardPriceBasis;
    baseCurrency: string;
    displayUnit: DisplayUnit;
    displayUnitSupported: boolean;
    reportingYear: number | null;
    reportingPeriod: string;
    modelPhase: "pre-construction" | "modeled-construction" | "ramp-up" | "stabilized-operation" | "construction-only";
    modelPhaseLabel: string;
    constructionStart: string;
    constructionEnd: string | null;
    constructionDurationMonths: number;
    operationStart: string;
    firstOperatingYear: number | null;
    stabilizedOperatingYear: number | null;
    operationHorizonYears: number;
    actualProgressAvailable: false;
  };
  conclusion: {
    definitive: boolean;
    label: string;
    reason: string;
  };
  dimensions: ManagementDimension[];
  metrics: Record<ManagementMetricId, ManagementMetric>;
  constructionSeries: ManagementConstructionRow[];
  operatingSeries: ManagementOperatingRow[];
  operatingSummaries: ManagementOperatingSummary[];
  capexConcentration: { label: string; value: number; share: number | null; owner: string }[];
  operatingCostDrivers: { label: string; value: number; share: number | null; owner: string }[];
  scenarioComparison: {
    status: "available" | "partial" | "unavailable" | "not-applicable" | "stale";
    reason: string;
    rows: ManagementScenarioComparisonRow[];
  };
  riskDrivers: ManagementRiskDriver[];
  riskUnavailableReason: string | null;
  exceptions: ManagementException[];
};

type ManagementSelectorOptions = {
  dirty?: boolean;
  reportingYear?: number;
};

const managementModuleDrilldown = (module: string) => {
  if (/construction/i.test(module)) return "../construction-cashflow";
  if (/capex/i.test(module)) return "../capex";
  if (/capacity|production/i.test(module)) return "../capacity-production";
  if (/revenue|market/i.test(module)) return "../revenue";
  if (/opex|direct|cogs/i.test(module)) return "../opex";
  if (/working/i.test(module)) return "../working-capital";
  if (/financ/i.test(module)) return "../financing";
  if (/sensitiv|risk|monte/i.test(module)) return "../sensitivity";
  return "../financial-statements";
};

const managementPhaseLabel = (phase: ManagementDashboardViewModel["context"]["modelPhase"]) => ({
  "pre-construction": "پیش از ساخت در خط زمانی مدل",
  "modeled-construction": "دوره ساخت مدل‌شده",
  "ramp-up": "راه‌اندازی و افزایش ظرفیت مدل‌شده",
  "stabilized-operation": "عملیات تثبیت‌شده مدل‌شده",
  "construction-only": "مدل صرفاً دوره ساخت",
}[phase]);

const managementStatusWithFreshness = (status: ManagementStatus, dirty: boolean): ManagementStatus =>
  dirty && status !== "not-applicable" ? "stale" : status;

const findExtreme = <T,>(
  rows: T[],
  valueOf: (row: T) => number | null,
  direction: "minimum" | "maximum",
) => rows.reduce<{ row: T; value: number } | null>((selected, row) => {
  const value = valueOf(row);
  if (value === null) return selected;
  if (!selected) return { row, value };
  if (direction === "minimum" ? value < selected.value : value > selected.value) return { row, value };
  return selected;
}, null);

const buildOperatingSummary = (
  id: ManagementOperatingSummaryId,
  label: string,
  unit: ManagementMetricUnit,
  rows: ManagementOperatingRow[],
  key: keyof Omit<ManagementOperatingRow, "year" | "calendarYear" | "phase">,
  firstYear: number | null,
  stabilizedYear: number | null,
  dirty: boolean,
  owner: string,
  source: string,
  drilldown: string,
): ManagementOperatingSummary => {
  const valueOf = (row: ManagementOperatingRow) => finiteOrNull(row[key] as number | null);
  const firstRow = firstYear === null ? undefined : rows.find((row) => row.year === firstYear);
  const stabilizedRow = stabilizedYear === null ? undefined : rows.find((row) => row.year === stabilizedYear);
  const minimum = findExtreme(rows, valueOf, "minimum");
  const maximum = findExtreme(rows, valueOf, "maximum");
  const hasValue = rows.some((row) => valueOf(row) !== null);
  return {
    id,
    label,
    unit,
    status: managementStatusWithFreshness(hasValue ? "ready" : "unavailable", dirty),
    first: { value: firstRow ? valueOf(firstRow) : null, year: firstRow?.year ?? null },
    stabilized: { value: stabilizedRow ? valueOf(stabilizedRow) : null, year: stabilizedRow?.year ?? null },
    minimum: { value: minimum?.value ?? null, year: minimum ? (minimum.row as ManagementOperatingRow).year : null },
    maximum: { value: maximum?.value ?? null, year: maximum ? (maximum.row as ManagementOperatingRow).year : null },
    owner,
    source,
    drilldown,
  };
};

export const buildManagementDashboardViewModel = (
  project: Project,
  scenario: Scenario,
  outputs: ScenarioOutputs,
  options: ManagementSelectorOptions = {},
): ManagementDashboardViewModel => {
  const dirty = options.dirty ?? false;
  const calculationBasis = selectedFinancialBasis(outputs);
  const displayUnitSupported = !isForeignDisplayUnit(project.displayUnit);
  const baseScenario = project.scenarios.find((item) => item.type === "base") ?? null;
  const stabilizedOperatingYear = selectStabilizedOperatingYear(scenario, outputs);
  const operatingYears = outputs.years.filter((year) => year > 0).toSorted((left, right) => left - right);
  const firstOperatingYear = operatingYears[0] ?? null;
  const requestedYear = options.reportingYear;
  const reportingYear = requestedYear !== undefined && outputs.years.includes(requestedYear)
    ? requestedYear
    : stabilizedOperatingYear ?? firstOperatingYear ?? (outputs.years.includes(0) ? 0 : null);
  const selectedStatement = reportingYear === null ? undefined : outputs.statements.rows.find((row) => row.year === reportingYear);
  const selectedDirectCosts = reportingYear === null ? undefined : outputs.directCosts.rows.find((row) => row.year === reportingYear);
  const selectedOpex = reportingYear === null ? undefined : outputs.opex.rows.find((row) => row.year === reportingYear);
  const selectedWorkingCapital = reportingYear === null ? undefined : outputs.workingCapital.rows.find((row) => row.year === reportingYear);
  const selectedCapacity = reportingYear === null ? undefined : outputs.capacity.rows.find((row) => row.year === reportingYear);
  const constructionRows = outputs.construction.rows;
  const constructionEnd = constructionRows.at(-1)?.date ?? null;
  const hasOperatingData = operatingYears.length > 0 && outputs.statements.rows.some((row) => row.year > 0);
  const modelPhase: ManagementDashboardViewModel["context"]["modelPhase"] = !hasOperatingData
    ? constructionRows.length ? "construction-only" : "pre-construction"
    : reportingYear === null || reportingYear <= 0
      ? constructionRows.length ? "modeled-construction" : "pre-construction"
      : stabilizedOperatingYear !== null && reportingYear >= stabilizedOperatingYear
        ? "stabilized-operation"
        : "ramp-up";

  const validationErrors = outputs.validations.filter((issue) => issue.severity === "error");
  const validationWarnings = outputs.validations.filter((issue) => issue.severity === "warning");
  const generatedAtValid = Number.isFinite(new Date(outputs.generatedAt).getTime());
  const calculationState: ManagementDashboardViewModel["context"]["calculationState"] = !generatedAtValid
    ? "unavailable"
    : validationErrors.length
      ? "error"
      : validationWarnings.length ? "partial" : "available";
  const calculationStateReason = calculationState === "unavailable"
    ? "زمان یک محاسبه موفق معتبر در خروجی ثبت نشده است."
    : calculationState === "error"
      ? `${formatNumber(validationErrors.length)} خطای محاسباتی مانع نتیجه قطعی است.`
      : calculationState === "partial"
        ? `${formatNumber(validationWarnings.length)} هشدار اعتبار یا تکمیل داده باید بررسی شود.`
        : "خروجی‌های محاسباتی جاری و بدون خطای مسدودکننده هستند.";

  let cumulativeCapex = 0;
  const constructionSeries: ManagementConstructionRow[] = constructionRows.map((row) => {
    const capex = finiteOrNull(row.adjustedCapex);
    cumulativeCapex += capex ?? 0;
    const fundingStatus = row.cashCrunchFlag === "Cash Crunch"
      ? "uncovered" as const
      : row.cashCrunchFlag?.includes("Credit") || row.creditLineDraw && row.creditLineDraw > 0
        ? "credit-line" as const
        : "sufficient" as const;
    return {
      month: row.monthNumber,
      date: row.date,
      phase: row.status,
      capex,
      cumulativeCapex: Number.isFinite(cumulativeCapex) ? cumulativeCapex : null,
      equityDraw: finiteOrNull(row.shareholderInjection ?? row.equityInjection),
      debtDraw: finiteOrNull(row.nonEquityFundingDrawdown ?? row.debtDrawdown),
      creditLineDraw: finiteOrNull(row.creditLineDraw ?? row.overdraft),
      totalOutflow: finiteOrNull(row.totalCashOutflow),
      endingCash: finiteOrNull(row.endingCash),
      fundingStatus,
    };
  });
  const peakConstructionCapex = findExtreme(constructionSeries, (row) => row.capex, "maximum");
  const peakConstructionDeficit = finiteOrNull(outputs.construction.maxCashDeficit);
  const constructionFundingRequirement = finiteOrNull(outputs.construction.kpis?.totalCashOutflow)
    ?? (constructionSeries.length ? constructionSeries.reduce((total, row) => total + (row.totalOutflow ?? 0), 0) : null);

  const operatingSeries: ManagementOperatingRow[] = operatingYears.map((year) => {
    const capacity = outputs.capacity.rows.find((row) => row.year === year);
    const revenue = outputs.revenue.rows.find((row) => row.year === year);
    const directCosts = outputs.directCosts.rows.find((row) => row.year === year);
    const opex = outputs.opex.rows.find((row) => row.year === year);
    const statement = outputs.statements.rows.find((row) => row.year === year);
    const valuation = outputs.valuation.annualRows.find((row) => row.year === year);
    const workingCapital = outputs.workingCapital.rows.find((row) => row.year === year);
    return {
      year,
      calendarYear: finiteOrNull(statement?.calendarYear),
      phase: stabilizedOperatingYear !== null && year >= stabilizedOperatingYear ? "stabilized" : "ramp-up",
      productionVolume: finiteOrNull(capacity?.productionVolume),
      utilization: finiteOrNull(capacity?.utilization),
      salesVolume: finiteOrNull(revenue?.salesVolume),
      revenue: finiteOrNull(revenue?.revenue ?? statement?.revenue),
      cogs: finiteOrNull(directCosts?.totalCost ?? statement?.cogs),
      opex: finiteOrNull(opex?.totalOpex ?? statement?.opex),
      ebitda: finiteOrNull(statement?.ebitda),
      operatingCashFlow: finiteOrNull(statement?.cfo),
      fcff: finiteOrNull(valuation?.fcff ?? statement?.fcff),
      workingCapital: finiteOrNull(workingCapital?.workingCapital),
      changeInWorkingCapital: finiteOrNull(workingCapital?.changeInWorkingCapital),
    };
  });

  const peakWorkingCapital = findExtreme(
    outputs.workingCapital.rows.filter((row) => row.year > 0),
    (row) => finiteOrNull(row.workingCapital),
    "maximum",
  );
  const minimumCash = findExtreme(
    outputs.statements.rows.filter((row) => row.year > 0),
    (row) => finiteOrNull(row.cash),
    "minimum",
  );
  const cumulativeCashRequirement = findExtreme(
    outputs.statements.rows,
    (row) => {
      const value = finiteOrNull(row.cumulativeCashFlow);
      return value !== null && value < 0 ? -value : 0;
    },
    "maximum",
  );
  const operatingCashTransition = outputs.statements.rows.find((row) => row.year > 0 && finiteOrNull(row.cfo) !== null && row.cfo >= 0);
  const capexFxShare = outputs.capex.totalCapex > 0 ? finiteOrNull(outputs.capex.fxCapex / outputs.capex.totalCapex) : null;
  const opexFxShare = selectedOpex && selectedOpex.totalOpex > 0 ? finiteOrNull(selectedOpex.fxOpex / selectedOpex.totalOpex) : null;

  const metric = (
    id: ManagementMetricId,
    label: string,
    value: number | null | undefined,
    unit: ManagementMetricUnit,
    period: string,
    occurrenceYear: number | null,
    occurrenceMonth: number | null,
    owner: string,
    source: string,
    drilldown: string,
    priceBasis: DashboardPriceBasis = calculationBasis,
    reason?: string,
  ): ManagementMetric => {
    const finiteValue = finiteOrNull(value);
    return {
      id,
      label,
      value: finiteValue,
      unit,
      status: managementStatusWithFreshness(finiteValue === null ? "unavailable" : "ready", dirty),
      reason: finiteValue === null ? reason ?? "خروجی معتبر در مالک محاسبه موجود نیست." : undefined,
      period,
      occurrenceYear,
      occurrenceMonth,
      owner,
      source,
      drilldown,
      priceBasis,
    };
  };

  const metrics: Record<ManagementMetricId, ManagementMetric> = {
    "construction-duration": metric("construction-duration", "مدت ساخت مدل‌شده", project.constructionDurationMonths, "months", "دوره ساخت", null, null, "Project setup timeline", "ProjectSetup02", "../setup", "not-applicable"),
    "peak-construction-capex": metric("peak-construction-capex", "اوج CAPEX ساخت", peakConstructionCapex?.value, "money", "تقویم ماهانه ساخت", null, peakConstructionCapex?.row.month ?? null, "Construction cash-flow engine", "ConstructionCashFlow", "../construction-cashflow", "nominal"),
    "construction-funding-requirement": metric("construction-funding-requirement", "نیاز کل نقدی ساخت", constructionFundingRequirement, "money", "کل دوره ساخت", null, null, "Construction cash-flow engine", "ConstructionCashFlow", "../construction-cashflow", "nominal"),
    "construction-credit-line": metric("construction-credit-line", "نیاز به خط اعتباری", outputs.construction.creditLineRequired, "money", "کل دوره ساخت", null, null, "Construction cash-flow engine", "ConstructionCashFlow", "../construction-cashflow", "nominal"),
    "peak-construction-deficit": metric("peak-construction-deficit", "اوج کسری نقد ساخت", peakConstructionDeficit, "money", "دوره ساخت", null, outputs.construction.kpis?.peakDeficitMonth ?? null, "Construction cash-flow engine", "ConstructionCashFlow", "../construction-cashflow", "nominal"),
    "total-capex": metric("total-capex", "کل CAPEX", outputs.capex.totalCapex, "money", "کل افق سرمایه‌گذاری", null, null, "CAPEX engine", "Capex12", "../capex", "nominal"),
    contingency: metric("contingency", "ذخیره احتیاط CAPEX", outputs.capex.contingency, "money", "کل افق سرمایه‌گذاری", null, null, "CAPEX engine", "Capex12", "../capex", "nominal"),
    "delay-cost": metric("delay-cost", "هزینه تأخیر مدل‌شده", outputs.capex.delayCost, "money", "سناریوی CAPEX", null, null, "CAPEX engine", "Capex12", "../capex", "nominal"),
    "peak-working-capital": metric("peak-working-capital", "اوج سرمایه در گردش", peakWorkingCapital?.value, "money", "افق عملیات", peakWorkingCapital?.row.year ?? null, null, "Working-capital engine", "WorkingCapital13", "../working-capital"),
    "cumulative-cash-requirement": metric("cumulative-cash-requirement", "بیشترین نیاز تجمعی نقد", cumulativeCashRequirement?.value, "money", "افق مدل", cumulativeCashRequirement?.row.year ?? null, null, "Financial statements cash-flow schedule", "FinancialStatements16", "../financial-statements"),
    "minimum-cash": metric("minimum-cash", "حداقل مانده نقد", minimumCash?.value, "money", "افق عملیات", minimumCash?.row.year ?? null, null, "Financial statements cash balance", "FinancialStatements16", "../financial-statements"),
    "operating-cash-transition": metric("operating-cash-transition", "اولین سال جریان نقد عملیاتی غیرمنفی", operatingCashTransition?.year, "year", "افق عملیات", operatingCashTransition?.year ?? null, null, "Financial statements CFO schedule", "FinancialStatements16", "../financial-statements", calculationBasis, "گذار جریان نقد عملیاتی در افق مدل رخ نداده است."),
    "capex-fx-exposure": metric("capex-fx-exposure", "سهم ارزی CAPEX", capexFxShare, "percent", "کل CAPEX", null, null, "CAPEX engine currency classification", "Capex12", "../capex", "not-applicable", "طبقه‌بندی ارزی معتبر CAPEX موجود نیست."),
    "opex-fx-exposure": metric("opex-fx-exposure", "سهم ارزی OPEX", opexFxShare, "percent", reportingYear === null ? "سال گزارش نامشخص" : `سال مدل ${reportingYear}`, reportingYear, null, "OPEX engine currency classification", "Opex-Indirect11", "../opex", "not-applicable", "طبقه‌بندی ارزی OPEX برای دوره گزارش موجود نیست."),
  };

  const operatingSummaries: ManagementOperatingSummary[] = [
    buildOperatingSummary("production", "حجم تولید", "number", operatingSeries, "productionVolume", firstOperatingYear, stabilizedOperatingYear, dirty, "Capacity/production engine", "CapacityProduction09", "../capacity-production"),
    buildOperatingSummary("utilization", "بهره‌برداری ظرفیت", "percent", operatingSeries, "utilization", firstOperatingYear, stabilizedOperatingYear, dirty, "Capacity/production engine", "CapacityProduction09", "../capacity-production"),
    buildOperatingSummary("sales-volume", "حجم فروش", "number", operatingSeries, "salesVolume", firstOperatingYear, stabilizedOperatingYear, dirty, "Revenue engine", "MarketDemand08 / Revenue", "../revenue"),
    buildOperatingSummary("revenue", "درآمد", "money", operatingSeries, "revenue", firstOperatingYear, stabilizedOperatingYear, dirty, "Revenue engine", "MarketDemand08 / FinancialStatements16", "../revenue"),
    buildOperatingSummary("cogs", "بهای تمام‌شده", "money", operatingSeries, "cogs", firstOperatingYear, stabilizedOperatingYear, dirty, "Direct-cost engine", "COGS-DirectCost10", "../opex"),
    buildOperatingSummary("opex", "OPEX", "money", operatingSeries, "opex", firstOperatingYear, stabilizedOperatingYear, dirty, "OPEX engine", "Opex-Indirect11", "../opex"),
    buildOperatingSummary("ebitda", "EBITDA", "money", operatingSeries, "ebitda", firstOperatingYear, stabilizedOperatingYear, dirty, "Financial statements engine", "FinancialStatements16", "../financial-statements"),
    buildOperatingSummary("operating-cash-flow", "جریان نقد عملیاتی", "money", operatingSeries, "operatingCashFlow", firstOperatingYear, stabilizedOperatingYear, dirty, "Financial statements engine", "FinancialStatements16", "../financial-statements"),
    buildOperatingSummary("fcff", "FCFF پروژه", "money", operatingSeries, "fcff", firstOperatingYear, stabilizedOperatingYear, dirty, "DCF valuation engine", "DCF-Valuation17", "../valuation"),
    buildOperatingSummary("working-capital", "سرمایه در گردش", "money", operatingSeries, "workingCapital", firstOperatingYear, stabilizedOperatingYear, dirty, "Working-capital engine", "WorkingCapital13", "../working-capital"),
  ];

  const capexItems = scenario.assumptions.capex.items
    .map((item) => ({ label: item.name, value: finiteOrNull(item.outputs?.finalItemCost), owner: "CAPEX item engine" }))
    .filter((item): item is { label: string; value: number; owner: string } => item.value !== null)
    .toSorted((left, right) => right.value - left.value)
    .slice(0, 4);
  const capexConcentration = capexItems.map((item) => ({
    ...item,
    share: outputs.capex.totalCapex > 0 ? finiteOrNull(item.value / outputs.capex.totalCapex) : null,
  }));
  const costDriverInputs = [
    { label: "بهای مستقیم تولید", value: finiteOrNull(selectedDirectCosts?.totalCost), owner: "Direct-cost engine" },
    { label: "هزینه‌های عملیاتی غیرمستقیم", value: finiteOrNull(selectedOpex?.totalOpex), owner: "OPEX engine" },
  ].filter((item): item is { label: string; value: number; owner: string } => item.value !== null)
    .toSorted((left, right) => right.value - left.value);
  const totalOperatingCosts = costDriverInputs.reduce((total, item) => total + item.value, 0);
  const operatingCostDrivers = costDriverInputs.map((item) => ({
    ...item,
    share: totalOperatingCosts > 0 ? finiteOrNull(item.value / totalOperatingCosts) : null,
  }));

  const constructionControls = outputs.construction.controls ?? [];
  const constructionControlErrors = constructionControls.filter((control) => control.status === "خطا");
  const constructionControlWarnings = constructionControls.filter((control) => control.status === "هشدار");
  const uncoveredConstruction = constructionSeries.filter((row) => row.fundingStatus === "uncovered");
  const creditLineMonths = constructionSeries.filter((row) => row.fundingStatus === "credit-line");
  const delayMonths = constructionRows.filter((row) => row.monthStatus === "delay");
  const opexIssues = outputs.validations.filter((issue) => /opex|direct|cogs/i.test(`${issue.module} ${issue.sourceSheet ?? ""}`));
  const workingCapitalIssues = outputs.validations.filter((issue) => /working/i.test(`${issue.module} ${issue.sourceSheet ?? ""}`));
  const validRiskDrivers = dirty ? [] : outputs.sensitivity.tornado
    .filter((driver) => !["invalid", "notApplicable", "modelError", "noExposure"].includes(driver.status) && Number.isFinite(driver.range))
    .toSorted((left, right) => right.range - left.range)
    .slice(0, 4);
  const riskDrivers: ManagementRiskDriver[] = validRiskDrivers.map((driver) => ({
    id: driver.variableId,
    label: driver.variable,
    metric: outputs.sensitivity.selectedMetric,
    range: driver.range,
    low: finiteOrNull(driver.low),
    high: finiteOrNull(driver.high),
    source: driver.sourceModule,
    drilldown: "../sensitivity",
  }));
  const riskUnavailableReason = dirty
    ? "نتایج ریسک پس از تغییر ورودی‌ها قدیمی است و تا محاسبه مجدد نمایش داده نمی‌شود."
    : riskDrivers.length ? null : "خروجی معتبر و باز‌محاسبه‌شده حساسیت برای محرک‌های مدیریتی موجود نیست.";

  const dimensions: ManagementDimension[] = [
    {
      id: "implementation-readiness",
      label: "آمادگی اجرا",
      status: managementStatusWithFreshness(!constructionRows.length ? "not-applicable" : constructionControlErrors.length ? "critical" : constructionControlWarnings.length ? "attention" : "ready", dirty),
      evidenceCode: constructionControlErrors.length ? "CONSTRUCTION_CONTROL_ERROR" : constructionControlWarnings.length ? "CONSTRUCTION_CONTROL_WARNING" : "CONSTRUCTION_CONTROLS_CLEAR",
      evidence: !constructionRows.length ? "برنامه ساخت در خروجی محاسبه موجود نیست." : constructionControlErrors[0]?.message ?? constructionControlWarnings[0]?.message ?? "کنترل‌های ساخت بدون خطای مسدودکننده عبور کرده‌اند.",
      affectedPeriod: constructionRows.length ? `ماه ۱ تا ${constructionRows.length}` : "نامشخص",
      owner: "Construction cash-flow controls",
      source: "ConstructionCashFlow",
      drilldown: "../construction-cashflow",
      unavailableReason: !constructionRows.length ? "خروجی برنامه ساخت موجود نیست." : undefined,
    },
    {
      id: "construction-funding",
      label: "تداوم تأمین مالی ساخت",
      status: managementStatusWithFreshness(!constructionRows.length ? "not-applicable" : uncoveredConstruction.length ? "critical" : creditLineMonths.length ? "attention" : "ready", dirty),
      evidenceCode: uncoveredConstruction.length ? "CONSTRUCTION_FUNDING_UNCOVERED" : creditLineMonths.length ? "CONSTRUCTION_CREDIT_LINE_USED" : "CONSTRUCTION_FUNDING_SUFFICIENT",
      evidence: uncoveredConstruction.length
        ? `${formatNumber(uncoveredConstruction.length)} ماه دارای کسری پوشش‌نیافته در خروجی موتور است.`
        : creditLineMonths.length
          ? `${formatNumber(creditLineMonths.length)} ماه برای حفظ حداقل نقد به خط اعتباری متکی است.`
          : constructionRows.length ? "منابع مدل‌شده نیاز نقدی ماهانه ساخت را پوشش می‌دهند." : "دوره ساخت قابل ارزیابی نیست.",
      affectedPeriod: uncoveredConstruction[0]?.date ?? creditLineMonths[0]?.date ?? "کل دوره ساخت",
      owner: "Construction cash-flow engine",
      source: "ConstructionCashFlow / Financing14",
      drilldown: "../construction-cashflow",
      unavailableReason: !constructionRows.length ? "برنامه جریان نقد ساخت موجود نیست." : undefined,
    },
    {
      id: "commissioning-readiness",
      label: "آمادگی زمان‌بندی و راه‌اندازی",
      status: managementStatusWithFreshness(!constructionRows.length ? "unavailable" : delayMonths.length ? "attention" : "ready", dirty),
      evidenceCode: delayMonths.length ? "MODELED_COMMISSIONING_DELAY" : "MODELED_COMMISSIONING_ON_SCHEDULE",
      evidence: delayMonths.length
        ? `${formatNumber(delayMonths.length)} ماه تأخیر سناریویی در خط زمانی مدل‌شده وجود دارد؛ این مقدار عملکرد واقعی نیست.`
        : `پایان برنامه ساخت در ${constructionEnd ?? "دوره نامشخص"} مدل شده است؛ داده پیشرفت واقعی وجود ندارد.`,
      affectedPeriod: delayMonths[0]?.date ?? constructionEnd ?? "نامشخص",
      owner: "Project timeline and construction cash-flow engine",
      source: "ProjectSetup02 / ConstructionCashFlow",
      drilldown: "../construction-cashflow",
      unavailableReason: !constructionRows.length ? "خط زمانی ساخت محاسبه نشده است." : undefined,
    },
    {
      id: "operating-ramp-up",
      label: "راه‌اندازی عملیات",
      status: managementStatusWithFreshness(!hasOperatingData ? "not-applicable" : reportingYear !== null && reportingYear <= 0 ? "not-applicable" : stabilizedOperatingYear === null ? "attention" : reportingYear !== null && reportingYear < stabilizedOperatingYear ? "attention" : "ready", dirty),
      evidenceCode: !hasOperatingData ? "NO_OPERATING_YEARS" : stabilizedOperatingYear === null ? "STABILIZED_YEAR_UNAVAILABLE" : reportingYear !== null && reportingYear < stabilizedOperatingYear ? "RAMP_UP_IN_PROGRESS_MODELED" : "STABILIZED_OPERATION_MODELED",
      evidence: !hasOperatingData
        ? "سال عملیاتی در افق خروجی موجود نیست."
        : stabilizedOperatingYear === null
          ? "سال تثبیت از پروفایل ظرفیت قابل تعیین نیست."
          : reportingYear !== null && reportingYear < stabilizedOperatingYear
            ? `سال گزارش در دوره افزایش ظرفیت پیش از سال تثبیت ${formatNumber(stabilizedOperatingYear)} است.`
            : `ظرفیت از سال مدل ${formatNumber(stabilizedOperatingYear)} در سطح تثبیت‌شده باقی می‌ماند.`,
      affectedPeriod: reportingYear === null ? "نامشخص" : `سال مدل ${reportingYear}`,
      owner: "Capacity/production engine and management semantic period selection",
      source: "CapacityProduction09",
      drilldown: "../capacity-production",
      unavailableReason: !hasOperatingData ? "افق عملیاتی موجود نیست." : undefined,
    },
    {
      id: "operating-cost-control",
      label: "کنترل هزینه عملیاتی",
      status: managementStatusWithFreshness(!hasOperatingData || reportingYear !== null && reportingYear <= 0 ? "not-applicable" : opexIssues.some((issue) => issue.severity === "error") ? "invalid" : opexIssues.length ? "attention" : selectedOpex ? "ready" : "unavailable", dirty),
      evidenceCode: opexIssues.some((issue) => issue.severity === "error") ? "OPERATING_COST_INVALID" : opexIssues.length ? "OPERATING_COST_WARNING" : selectedOpex ? "OPERATING_COST_AVAILABLE" : "OPERATING_COST_UNAVAILABLE",
      evidence: opexIssues[0]?.message ?? (selectedOpex ? `OPEX سال گزارش ${formatMoney(selectedOpex.totalOpex, project)} است و از موتور OPEX مصرف می‌شود.` : "خروجی هزینه عملیاتی برای دوره گزارش موجود نیست."),
      affectedPeriod: reportingYear === null ? "نامشخص" : `سال مدل ${reportingYear}`,
      owner: "Direct-cost and OPEX engines",
      source: "COGS-DirectCost10 / Opex-Indirect11",
      drilldown: "../opex",
      unavailableReason: !selectedOpex ? "خروجی OPEX دوره گزارش موجود نیست." : undefined,
    },
    {
      id: "liquidity-working-capital",
      label: "کفایت نقدینگی و سرمایه در گردش",
      status: managementStatusWithFreshness(!hasOperatingData ? "not-applicable" : workingCapitalIssues.some((issue) => issue.severity === "error") ? "invalid" : minimumCash?.value !== undefined && minimumCash.value < 0 ? "critical" : selectedStatement?.currentRatio !== null && selectedStatement?.currentRatio !== undefined && selectedStatement.currentRatio < MANAGEMENT_POLICY.minimumCurrentRatio ? "attention" : peakWorkingCapital ? "ready" : "unavailable", dirty),
      evidenceCode: minimumCash?.value !== undefined && minimumCash.value < 0 ? "OPERATING_CASH_DEFICIT" : selectedStatement?.currentRatio !== null && selectedStatement?.currentRatio !== undefined && selectedStatement.currentRatio < MANAGEMENT_POLICY.minimumCurrentRatio ? "CURRENT_RATIO_BELOW_POLICY" : peakWorkingCapital ? "WORKING_CAPITAL_AVAILABLE" : "WORKING_CAPITAL_UNAVAILABLE",
      evidence: !hasOperatingData
        ? "سال عملیاتی برای ارزیابی نقدینگی وجود ندارد."
        : minimumCash?.value !== undefined && minimumCash.value < 0
          ? `حداقل مانده نقد ${formatMoney(minimumCash.value, project)} در سال ${formatNumber(minimumCash.row.year)} است.`
          : selectedStatement?.currentRatio !== null && selectedStatement?.currentRatio !== undefined && selectedStatement.currentRatio < MANAGEMENT_POLICY.minimumCurrentRatio
            ? `نسبت جاری سال گزارش ${formatNumber(selectedStatement.currentRatio)} و کمتر از آستانه ${formatNumber(MANAGEMENT_POLICY.minimumCurrentRatio)} است.`
            : peakWorkingCapital ? `اوج نیاز سرمایه در گردش در سال ${formatNumber(peakWorkingCapital.row.year)} رخ می‌دهد.` : "خروجی معتبر سرمایه در گردش موجود نیست.",
      affectedPeriod: minimumCash?.row.year ? `سال مدل ${minimumCash.row.year}` : peakWorkingCapital?.row.year ? `سال مدل ${peakWorkingCapital.row.year}` : "نامشخص",
      owner: "Working-capital and financial statements engines",
      source: "WorkingCapital13 / FinancialStatements16",
      drilldown: "../working-capital",
      unavailableReason: !peakWorkingCapital ? "سری سرمایه در گردش موجود نیست." : undefined,
    },
    {
      id: "risk-driver-exposure",
      label: "مواجهه با محرک‌های ریسک",
      status: managementStatusWithFreshness(riskDrivers.length ? "attention" : "unavailable", dirty),
      evidenceCode: riskDrivers.length ? "RECALCULATED_RISK_DRIVERS_AVAILABLE" : "RISK_ANALYSIS_UNAVAILABLE",
      evidence: riskDrivers.length ? `محرک غالب ${riskDrivers[0].label} بر مبنای خروجی باز‌محاسبه‌شده ${riskDrivers[0].metric} است.` : riskUnavailableReason ?? "تحلیل ریسک موجود نیست.",
      affectedPeriod: "افق کامل مدل",
      owner: "Sensitivity engine",
      source: "Sensivity19",
      drilldown: "../sensitivity",
      unavailableReason: riskUnavailableReason ?? undefined,
    },
    {
      id: "model-validity",
      label: "کامل‌بودن داده و اعتبار مدل",
      status: managementStatusWithFreshness(calculationState === "error" ? "invalid" : calculationState === "unavailable" ? "unavailable" : calculationState === "partial" ? "attention" : "ready", dirty),
      evidenceCode: calculationState === "error" ? "CALCULATION_ERROR" : calculationState === "unavailable" ? "CALCULATION_UNAVAILABLE" : calculationState === "partial" ? "CALCULATION_WARNINGS" : "CALCULATION_VALID",
      evidence: calculationStateReason,
      affectedPeriod: "کل افق مدل",
      owner: "Scenario calculation validation layer",
      source: "Calculation validations",
      drilldown: "../financial-statements",
      unavailableReason: calculationState === "unavailable" ? calculationStateReason : undefined,
    },
  ];

  const requiredDimensions = dimensions.filter((dimension) => dimension.status !== "not-applicable");
  const definitive = !dirty
    && calculationState === "available"
    && requiredDimensions.every((dimension) => !["stale", "invalid", "unavailable"].includes(dimension.status));
  const conclusion = !definitive
    ? { definitive: false, label: "جمع‌بندی قطعی مسدود است", reason: dirty ? "نتایج پس از تغییر ورودی‌ها قدیمی است و باید دوباره محاسبه شود." : "حداقل یک بعد مدیریتی فاقد خروجی معتبر و کامل است." }
    : requiredDimensions.some((dimension) => dimension.status === "critical")
      ? { definitive: true, label: "اقدام مدیریتی فوری لازم است", reason: "حداقل یک بعد مستقل دارای وضعیت بحرانی و شواهد قابل ردیابی است." }
      : requiredDimensions.some((dimension) => dimension.status === "attention")
        ? { definitive: true, label: "قابل اتکا با اقدامات مشخص", reason: "مدل معتبر است، اما ابعاد نیازمند توجه باید از مسیرهای مبدأ پیگیری شوند." }
        : { definitive: true, label: "کنترل‌های مدیریتی جاری آماده‌اند", reason: "ابعاد قابل اعمال بر خروجی‌های معتبر و تازه استوار هستند و هشدار مسدودکننده ندارند." };

  const exceptions: ManagementException[] = [];
  if (dirty) exceptions.push({
    id: "stale-results",
    severity: "critical",
    priority: 0,
    issue: "نتایج پس از تغییر ورودی‌ها قدیمی است",
    evidence: "وضعیت dirty در مالک پروژه فعال است.",
    affectedPeriod: "کل مدل",
    impact: "هیچ نتیجه یا مقایسه مدیریتی قطعی قابل استناد نیست.",
    actionId: MANAGEMENT_ACTIONS.recalculate.id,
    action: MANAGEMENT_ACTIONS.recalculate.label,
    source: "Project calculation state",
    drilldown: MANAGEMENT_ACTIONS.recalculate.drilldown,
  });
  if (validationErrors.length) exceptions.push({
    id: "calculation-errors",
    severity: "critical",
    priority: 1,
    issue: "خطای محاسباتی فعال",
    evidence: validationErrors[0].message,
    affectedPeriod: "کل افق مدل",
    impact: "خروجی قطعی و صادرات حاکم‌شده باید مسدود بماند.",
    actionId: MANAGEMENT_ACTIONS.resolveCalculation.id,
    action: MANAGEMENT_ACTIONS.resolveCalculation.label,
    source: validationErrors[0].sourceSheet ?? validationErrors[0].module,
    drilldown: managementModuleDrilldown(validationErrors[0].module),
  });
  if (uncoveredConstruction.length) exceptions.push({
    id: "uncovered-construction-funding",
    severity: "critical",
    priority: 2,
    issue: "کسری پوشش‌نیافته در ساخت",
    evidence: `${formatNumber(uncoveredConstruction.length)} ماه با وضعیت Cash Crunch پوشش‌نیافته؛ نخستین دوره ${uncoveredConstruction[0].date}.`,
    affectedPeriod: uncoveredConstruction[0].date,
    impact: "تداوم پرداخت‌های ساخت در برنامه مدل‌شده تضمین نشده است.",
    actionId: MANAGEMENT_ACTIONS.reviseFunding.id,
    action: MANAGEMENT_ACTIONS.reviseFunding.label,
    source: "ConstructionCashFlow",
    drilldown: MANAGEMENT_ACTIONS.reviseFunding.drilldown,
  });
  if (minimumCash && minimumCash.value < 0) exceptions.push({
    id: "negative-operating-cash",
    severity: "critical",
    priority: 3,
    issue: "مانده نقد عملیاتی منفی",
    evidence: `${formatMoney(minimumCash.value, project)} در سال مدل ${formatNumber(minimumCash.row.year)}.`,
    affectedPeriod: `سال مدل ${minimumCash.row.year}`,
    impact: "برنامه عملیات با فشار نقدینگی و نیاز به منبع تکمیلی مواجه است.",
    actionId: MANAGEMENT_ACTIONS.completeWorkingCapital.id,
    action: MANAGEMENT_ACTIONS.completeWorkingCapital.label,
    source: "FinancialStatements16 / WorkingCapital13",
    drilldown: MANAGEMENT_ACTIONS.completeWorkingCapital.drilldown,
  });
  if (!uncoveredConstruction.length && creditLineMonths.length) exceptions.push({
    id: "construction-credit-line-dependence",
    severity: "warning",
    priority: 4,
    issue: "وابستگی ساخت به خط اعتباری",
    evidence: `${formatNumber(creditLineMonths.length)} ماه از خط اعتباری استفاده می‌کند؛ نیاز کل ${formatMoney(outputs.construction.creditLineRequired, project)}.`,
    affectedPeriod: creditLineMonths[0].date,
    impact: "تأخیر یا محدودیت خط اعتباری می‌تواند برنامه پرداخت ساخت را مختل کند.",
    actionId: MANAGEMENT_ACTIONS.reviseFunding.id,
    action: MANAGEMENT_ACTIONS.reviseFunding.label,
    source: "ConstructionCashFlow / Financing14",
    drilldown: MANAGEMENT_ACTIONS.reviseFunding.drilldown,
  });
  if (delayMonths.length) exceptions.push({
    id: "modeled-commissioning-delay",
    severity: "warning",
    priority: 5,
    issue: "تأخیر سناریویی در برنامه راه‌اندازی",
    evidence: `${formatNumber(delayMonths.length)} ماه تأخیر در خروجی سناریوی ساخت مدل شده است؛ این داده actual نیست.`,
    affectedPeriod: delayMonths[0].date,
    impact: "زمان‌بندی هزینه ساخت و آمادگی بهره‌برداری تحت فشار قرار می‌گیرد.",
    actionId: MANAGEMENT_ACTIONS.reviewCommissioning.id,
    action: MANAGEMENT_ACTIONS.reviewCommissioning.label,
    source: "ConstructionCashFlow",
    drilldown: MANAGEMENT_ACTIONS.reviewCommissioning.drilldown,
  });
  if (hasOperatingData && stabilizedOperatingYear === null) exceptions.push({
    id: "stabilized-year-missing",
    severity: "warning",
    priority: 6,
    issue: "سال تثبیت عملیات قابل تعیین نیست",
    evidence: "پروفایل ظرفیت به سطح پایدار تعریف‌شده نمی‌رسد یا سطح پایدار موجود نیست.",
    affectedPeriod: "افق عملیات",
    impact: "مقایسه سال راه‌اندازی با عملکرد تثبیت‌شده قابل اتکا نیست.",
    actionId: MANAGEMENT_ACTIONS.validateRampUp.id,
    action: MANAGEMENT_ACTIONS.validateRampUp.label,
    source: "CapacityProduction09",
    drilldown: MANAGEMENT_ACTIONS.validateRampUp.drilldown,
  });
  if (!peakWorkingCapital && hasOperatingData) exceptions.push({
    id: "working-capital-unavailable",
    severity: "warning",
    priority: 7,
    issue: "نیاز سرمایه در گردش در دسترس نیست",
    evidence: "سری معتبر سرمایه در گردش برای سال‌های عملیاتی تولید نشده است.",
    affectedPeriod: "افق عملیات",
    impact: "نیاز نقد و زمان اوج تأمین مالی کوتاه‌مدت قابل کنترل نیست.",
    actionId: MANAGEMENT_ACTIONS.completeWorkingCapital.id,
    action: MANAGEMENT_ACTIONS.completeWorkingCapital.label,
    source: "WorkingCapital13",
    drilldown: MANAGEMENT_ACTIONS.completeWorkingCapital.drilldown,
  });
  if (!riskDrivers.length && !dirty) exceptions.push({
    id: "risk-analysis-unavailable",
    severity: "information",
    priority: 9,
    issue: "محرک ریسک باز‌محاسبه‌شده موجود نیست",
    evidence: riskUnavailableReason ?? "خروجی حساسیت موجود نیست.",
    affectedPeriod: "افق کامل مدل",
    impact: "اولویت‌بندی فشار سناریوها بر مبنای خروجی موتور ممکن نیست.",
    actionId: MANAGEMENT_ACTIONS.runRiskAnalysis.id,
    action: MANAGEMENT_ACTIONS.runRiskAnalysis.label,
    source: "Sensivity19",
    drilldown: MANAGEMENT_ACTIONS.runRiskAnalysis.drilldown,
  });
  validationWarnings.slice(0, 3).forEach((issue, index) => exceptions.push({
    id: `validation-${issue.id}`,
    severity: "warning",
    priority: 10 + index,
    issue: issue.module,
    evidence: issue.message,
    affectedPeriod: "دوره مرتبط با ماژول مبدأ",
    impact: "کیفیت یا کامل‌بودن خروجی مدیریتی مرتبط کاهش می‌یابد.",
    actionId: MANAGEMENT_ACTIONS.resolveCalculation.id,
    action: issue.recommendation ?? MANAGEMENT_ACTIONS.resolveCalculation.label,
    source: issue.sourceSheet ?? issue.module,
    drilldown: managementModuleDrilldown(issue.module),
  }));

  const comparisonBaseOutputs = baseScenario?.outputs;
  const comparisonCompatible = comparisonBaseOutputs
    && selectedFinancialBasis(comparisonBaseOutputs) === calculationBasis
    && comparisonBaseOutputs.years.length === outputs.years.length;
  const comparisonRow = (
    id: string,
    label: string,
    unit: ManagementMetricUnit,
    activeValue: number | null | undefined,
    baseValue: number | null | undefined,
    period: string,
    owner: string,
    source: string,
    drilldown: string,
    unavailableReason?: string,
  ): ManagementScenarioComparisonRow => {
    const active = finiteOrNull(activeValue);
    const base = finiteOrNull(baseValue);
    const available = active !== null && base !== null;
    return {
      id,
      label,
      unit,
      status: available ? "available" : "unavailable",
      activeValue: active,
      baseValue: base,
      delta: available ? active - base : null,
      period,
      owner,
      source,
      drilldown,
      reason: available ? undefined : unavailableReason ?? "یکی از دو خروجی هم‌دوره در دسترس نیست.",
    };
  };
  let comparisonRows: ManagementScenarioComparisonRow[] = [];
  let scenarioComparison: ManagementDashboardViewModel["scenarioComparison"];
  if (scenario.type === "base" || baseScenario?.id === scenario.id) {
    scenarioComparison = { status: "not-applicable", reason: "سناریوی فعال همان سناریوی مبنا است.", rows: [] };
  } else if (dirty) {
    scenarioComparison = { status: "stale", reason: "مقایسه سناریو تا محاسبه مجدد ورودی‌های تغییرکرده مسدود است.", rows: [] };
  } else if (!comparisonBaseOutputs) {
    scenarioComparison = { status: "unavailable", reason: "خروجی محاسبه‌شده سناریوی مبنا در مالک سناریو موجود نیست.", rows: [] };
  } else if (!comparisonCompatible) {
    scenarioComparison = { status: "unavailable", reason: "مبنای قیمت یا افق دو سناریو هم‌تراز نیست.", rows: [] };
  } else {
    const baseStatement = comparisonBaseOutputs.statements.rows.find((row) => row.year === reportingYear);
    const baseOpex = comparisonBaseOutputs.opex.rows.find((row) => row.year === reportingYear);
    const baseWorkingCapital = comparisonBaseOutputs.workingCapital.rows.find((row) => row.year === reportingYear);
    const baseCapacity = comparisonBaseOutputs.capacity.rows.find((row) => row.year === reportingYear);
    const baseValuation = comparisonBaseOutputs.valuation.annualRows.find((row) => row.year === reportingYear);
    const basePeakWorkingCapital = findExtreme(comparisonBaseOutputs.workingCapital.rows.filter((row) => row.year > 0), (row) => finiteOrNull(row.workingCapital), "maximum");
    comparisonRows = [
      comparisonRow("operation-start", "شروع عملیات", "year", null, null, "خط زمانی سناریو", "Project/scenario timeline", "ProjectSetup02 / ScenarioManager06", "../scenarios", "موتور سناریو خروجی مستقل و هم‌تراز برای جابه‌جایی تاریخ شروع عملیات منتشر نمی‌کند."),
      comparisonRow("capex", "کل CAPEX", "money", outputs.capex.totalCapex, comparisonBaseOutputs.capex.totalCapex, "کل افق سرمایه‌گذاری", "CAPEX engine", "Capex12", "../capex"),
      comparisonRow("opex", "OPEX", "money", selectedOpex?.totalOpex, baseOpex?.totalOpex, reportingYear === null ? "نامشخص" : `سال مدل ${reportingYear}`, "OPEX engine", "Opex-Indirect11", "../opex"),
      comparisonRow("revenue", "درآمد", "money", selectedStatement?.revenue, baseStatement?.revenue, reportingYear === null ? "نامشخص" : `سال مدل ${reportingYear}`, "Revenue/statements engines", "MarketDemand08 / FinancialStatements16", "../revenue"),
      comparisonRow("ebitda", "EBITDA", "money", selectedStatement?.ebitda, baseStatement?.ebitda, reportingYear === null ? "نامشخص" : `سال مدل ${reportingYear}`, "Financial statements engine", "FinancialStatements16", "../financial-statements"),
      comparisonRow("fcff", "FCFF", "money", selectedStatement?.fcff, baseValuation?.fcff ?? baseStatement?.fcff, reportingYear === null ? "نامشخص" : `سال مدل ${reportingYear}`, "DCF valuation engine", "DCF-Valuation17", "../valuation"),
      comparisonRow("working-capital", "سرمایه در گردش", "money", selectedWorkingCapital?.workingCapital, baseWorkingCapital?.workingCapital, reportingYear === null ? "نامشخص" : `سال مدل ${reportingYear}`, "Working-capital engine", "WorkingCapital13", "../working-capital"),
      comparisonRow("peak-working-capital", "اوج سرمایه در گردش", "money", peakWorkingCapital?.value, basePeakWorkingCapital?.value, "افق عملیات", "Working-capital engine", "WorkingCapital13", "../working-capital"),
      comparisonRow("peak-funding", "اوج نیاز تأمین ساخت", "money", outputs.construction.creditLineRequired, comparisonBaseOutputs.construction.creditLineRequired, "دوره ساخت", "Construction cash-flow engine", "ConstructionCashFlow", "../construction-cashflow"),
      comparisonRow("capacity", "بهره‌برداری ظرفیت", "percent", selectedCapacity?.utilization, baseCapacity?.utilization, reportingYear === null ? "نامشخص" : `سال مدل ${reportingYear}`, "Capacity/production engine", "CapacityProduction09", "../capacity-production"),
    ];
    scenarioComparison = {
      status: comparisonRows.every((row) => row.status === "available") ? "available" : "partial",
      reason: "مقایسه از خروجی‌های محاسبه‌شده دو سناریو با مبنای قیمت، ارز، مقیاس و افق یکسان ساخته شده است.",
      rows: comparisonRows,
    };
  }

  return {
    context: {
      projectId: project.id,
      projectName: project.name,
      scenarioId: scenario.id,
      scenarioName: scenario.name,
      baseScenarioId: baseScenario?.id ?? null,
      baseScenarioName: baseScenario?.name ?? null,
      calculationVersion: `${project.version}:${scenario.version}`,
      calculatedAt: outputs.generatedAt,
      freshness: dirty ? "stale" : "fresh",
      calculationState,
      calculationStateReason,
      calculationBasis,
      baseCurrency: project.currency,
      displayUnit: project.displayUnit,
      displayUnitSupported,
      reportingYear,
      reportingPeriod: reportingYear === null ? "دوره گزارش موجود نیست" : reportingYear === 0 ? "دوره ساخت مدل‌شده" : `سال مدل ${reportingYear}`,
      modelPhase,
      modelPhaseLabel: managementPhaseLabel(modelPhase),
      constructionStart: project.constructionStartDate,
      constructionEnd,
      constructionDurationMonths: project.constructionDurationMonths,
      operationStart: project.operationStartDate,
      firstOperatingYear,
      stabilizedOperatingYear,
      operationHorizonYears: operatingYears.length,
      actualProgressAvailable: false,
    },
    conclusion,
    dimensions,
    metrics,
    constructionSeries,
    operatingSeries,
    operatingSummaries,
    capexConcentration,
    operatingCostDrivers,
    scenarioComparison,
    riskDrivers,
    riskUnavailableReason,
    exceptions: exceptions
      .filter((issue, index, all) => all.findIndex((candidate) => candidate.id === issue.id) === index)
      .toSorted((left, right) => left.priority - right.priority)
      .slice(0, MANAGEMENT_POLICY.maximumExceptions),
  };
};

export const formatManagementValue = (
  value: number | null,
  unit: ManagementMetricUnit,
  project: Project,
) => {
  if (value === null) return "ناموجود";
  if (unit === "money") return formatMoney(value, project);
  if (unit === "percent") return formatPercent(value);
  if (unit === "months") return `${formatNumber(value)} ماه`;
  if (unit === "year") return `سال ${formatNumber(value)}`;
  return formatNumber(value);
};
