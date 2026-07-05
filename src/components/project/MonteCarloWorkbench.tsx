"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { formatMoney, formatNumber, formatPercent, parseLocalizedNumber, unitLabel } from "@/lib/format";
import { getRiskBaseValue, hasActiveDebtExposure, hasFxExposure, riskVariableKindFromText, type CoreModelOutputs } from "@/lib/risk-variable-engine";
import {
  buildDefaultDiscreteDistribution,
  changeMonteCarloDistributionType,
  getMonteCarloDiscreteOptions,
  getMonteCarloDiscreteProbabilityTotal,
  getMonteCarloDiscreteValueMode,
  nextMonteCarloDiscreteOptionId,
  normalizeMonteCarloSettings,
  setMonteCarloDiscreteValueMode,
  updateMonteCarloDiscreteOption,
  updateMonteCarloVariableById,
  validateMonteCarloVariable,
  type MonteCarloProgressSnapshot,
} from "@/lib/monte-carlo-engine";
import type {
  MonteCarloAssumptions,
  MonteCarloDiscreteOption,
  MonteCarloDiscreteValueMode,
  MonteCarloDistribution,
  MonteCarloDistributionType,
  MonteCarloIterationResult,
  MonteCarloMetric,
  MonteCarloMetricSummary,
  MonteCarloQualityWarning,
  MonteCarloResult,
  MonteCarloVariable,
  Project,
  Scenario,
  SensitivityUnitType,
} from "@/lib/types";
import { useProject } from "@/store/project-context";
import { UiIcon } from "@/components/project/UiIcon";

const correlationMessage = "نمونه‌گیری فعلی مستقل است. همبستگی بین تورم، نرخ ارز، CAPEX، تأخیر اجرا، قیمت فروش و حجم فروش در این نسخه اعمال نمی‌شود. بنابراین ریسک هم‌زمانی شوک‌ها ممکن است کمتر از واقع برآورد شود. برای گزارش نهایی سرمایه‌گذاری، سناریوی همبسته یا ماتریس همبستگی باید اضافه شود.";

const metricOptions: MonteCarloMetric[] = ["NPV", "IRR", "MIRR", "Payback", "DSCR", "EquityValue", "BCR", "Liquidity", "FinancingCost"];
const distributionOptions: Array<{ value: MonteCarloDistributionType; label: string }> = [
  { value: "normal", label: "نرمال محدود" },
  { value: "triangular", label: "مثلثی" },
  { value: "pert", label: "Beta-PERT" },
  { value: "uniform", label: "یکنواخت" },
  { value: "lognormal", label: "لگ‌نرمال" },
  { value: "discrete", label: "گسسته" },
];

const runStateLabels = {
  idle: "اجرا نشده",
  running: "در حال اجرا",
  saved: "ذخیره‌شده",
  completed: "تکمیل‌شده",
  cancelled: "لغوشده",
  failed: "ناموفق",
};

const variableGroups = [
  { id: "market", title: "درآمد و بازار", kinds: ["salesPrice", "salesVolume", "revenue"] },
  { id: "macro", title: "کلان و نرخ ارز", kinds: ["fxRate", "inflation", "discountRate", "taxRate"] },
  { id: "investment", title: "سرمایه‌گذاری و هزینه‌ها", kinds: ["capex", "opex", "directCosts"] },
  { id: "finance", title: "تأمین مالی و زمان‌بندی", kinds: ["debtInterest", "delay"] },
  { id: "workingCapital", title: "سرمایه در گردش", kinds: ["workingCapitalDays"] },
] as const;

const distributionTypeOf = (variable: MonteCarloVariable): MonteCarloDistributionType => {
  if (typeof variable.distribution === "object") return variable.distribution.type;
  const value = variable.distribution.toLowerCase();
  if (value.includes("مثلث") || value.includes("triangular")) return "triangular";
  if (value.includes("یکنواخت") || value.includes("uniform")) return "uniform";
  if (value.includes("pert")) return "pert";
  if (value.includes("log")) return "lognormal";
  if (value.includes("گسسته") || value.includes("discrete")) return "discrete";
  return "normal";
};

const normalizeSettings = normalizeMonteCarloSettings;

const metricTitle = (metric: MonteCarloMetric) => {
  if (metric === "EquityValue") return "ارزش سهام";
  if (metric === "FinancingCost") return "هزینه مالی";
  if (metric === "Liquidity") return "نقدینگی";
  return metric;
};

const formatByUnit = (value: number | null | undefined, unitType: SensitivityUnitType, project: Project) => {
  if (unitType === "totalMoney" || unitType === "unitPrice" || unitType === "fxRate") return formatMoney(value, project);
  if (unitType === "percentage") return formatPercent(value);
  return formatNumber(value);
};

const formatMetricSummaryValue = (
  summary: MonteCarloMetricSummary | undefined,
  key: keyof MonteCarloMetricSummary,
  project: Project,
) => {
  if (!summary) return "ناموجود";
  const value = summary[key];
  return typeof value === "number" ? formatByUnit(value, summary.unitType, project) : "ناموجود";
};

const numberFromInput = (value: string, fallback: number) => {
  const parsed = parseLocalizedNumber(value);
  return parsed === null ? fallback : parsed;
};

const formatDuration = (ms: number | null | undefined) => {
  if (ms === null || ms === undefined) return "نامشخص";
  if (ms < 1000) return `${formatNumber(ms, { maximumFractionDigits: 0 })} ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${formatNumber(seconds, { maximumFractionDigits: 1 })} ثانیه`;
  return `${formatNumber(seconds / 60, { maximumFractionDigits: 1 })} دقیقه`;
};

const formatDateTime = (value: string | null | undefined) => {
  if (!value) return "ثبت نشده";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "ثبت نشده";
  return new Intl.DateTimeFormat("fa-IR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
};

const settingsSignature = (settings: MonteCarloAssumptions) =>
  JSON.stringify(normalizeSettings(settings));

const formatSignedPercent = (value: number) => {
  if (Math.abs(value) < 0.0000001) return formatPercent(0);
  return `${value > 0 ? "+" : "−"}${formatPercent(Math.abs(value))}`;
};

const variableKind = (variable: MonteCarloVariable) =>
  riskVariableKindFromText(`${variable.id ?? ""} ${variable.name} ${variable.label ?? ""} ${variable.englishLabel ?? ""}`);

const shockModeOf = (variable: MonteCarloVariable) => {
  if (variable.shockMode) return variable.shockMode;
  const kind = variableKind(variable);
  if (kind === "delay" || kind === "workingCapitalDays") return "absolute";
  if (kind === "discountRate" || kind === "debtInterest" || kind === "inflation" || kind === "taxRate") return "rateDelta";
  return "percent";
};

const shockModeLabel = (variable: MonteCarloVariable) => {
  const mode = shockModeOf(variable);
  if (mode === "percent") return "شوک درصدی نسبت به مقدار پایه";
  if (mode === "rateDelta") return "تغییر واحد درصدی نرخ";
  return "مقدار مطلق / سناریویی";
};

const unitLabelForVariable = (variable: MonteCarloVariable, project: Project) => {
  const unitType = variable.unitType ?? "none";
  if (unitType === "months") return "ماه";
  if (unitType === "days") return "روز";
  if (unitType === "year") return "سال";
  if (unitType === "percentage") return "واحد درصد";
  if (unitType === "ratio") return "نسبت";
  if (unitType === "fxRate") return `${unitLabel(project)} / USD`;
  if (unitType === "unitPrice") return `${unitLabel(project)} / واحد`;
  if (unitType === "energy") return `${unitLabel(project)} / کیلووات‌ساعت`;
  if (unitType === "volume") return "واحد فروش";
  if (unitType === "totalMoney") return unitLabel(project);
  return "واحد";
};

const formatShockValue = (variable: MonteCarloVariable, value: number, project: Project) => {
  const mode = shockModeOf(variable);
  if (mode === "percent" || mode === "rateDelta") return formatSignedPercent(value);
  return `${formatNumber(value)} ${unitLabelForVariable(variable, project)}`;
};

const baseValueState = (
  variable: MonteCarloVariable,
  baseValue: number | null,
  status: { className: string; label: string },
  project: Project,
) => {
  if (baseValue === null) {
    return { className: "missing", label: "مقدار پایه یافت نشد", value: "مقدار پایه یافت نشد" };
  }
  if (Math.abs(baseValue) < 0.0000001) {
    return {
      className: "zero",
      label: status.className === "watch" ? "متغیر بدون مواجهه مؤثر" : "مقدار پایه صفر است",
      value: `${formatByUnit(0, variable.unitType ?? "none", project)} · ${unitLabelForVariable(variable, project)}`,
    };
  }
  if (status.className === "watch") {
    return {
      className: "watch",
      label: "متغیر بدون مواجهه مؤثر",
      value: formatByUnit(baseValue, variable.unitType ?? "none", project),
    };
  }
  return {
    className: "ok",
    label: "مقدار پایه معتبر",
    value: formatByUnit(baseValue, variable.unitType ?? "none", project),
  };
};

const variableGroupFor = (variable: MonteCarloVariable) => {
  const kind = variableKind(variable);
  return variableGroups.find((group) => (group.kinds as readonly string[]).includes(kind)) ?? variableGroups[2];
};

const distributionLabel = (value: MonteCarloDistributionType) =>
  distributionOptions.find((option) => option.value === value)?.label ?? value;

const discreteValueModeLabels: Record<MonteCarloDiscreteValueMode, string> = {
  percentShock: "مقدار بر اساس درصد تغییر نسبت به مقدار پایه",
  absoluteValue: "مقدار مطلق",
  multiplier: "ضریب",
};

const syncDiscreteDistribution = (
  distribution: MonteCarloDistribution,
  options: MonteCarloDiscreteOption[],
  valueMode: MonteCarloDiscreteValueMode,
): MonteCarloDistribution => ({
  ...distribution,
  type: "discrete",
  valueMode,
  options,
  values: options.map((option) => ({ value: option.value, probability: option.probability })),
});

const discreteDistributionFor = (variable: MonteCarloVariable) => {
  const distribution = typeof variable.distribution === "object" && variable.distribution.type === "discrete"
    ? variable.distribution
    : buildDefaultDiscreteDistribution(variable);
  const valueMode = distribution.valueMode ?? getMonteCarloDiscreteValueMode({ ...variable, distribution });
  const options = getMonteCarloDiscreteOptions({ ...variable, distribution });
  return syncDiscreteDistribution(distribution, options, valueMode);
};

const probabilityIsComplete = (total: number) => Math.abs(total - 1) <= 0.0001;

const formatDiscreteOptionValue = (
  variable: MonteCarloVariable,
  option: Pick<MonteCarloDiscreteOption, "value">,
  valueMode: MonteCarloDiscreteValueMode,
  project: Project,
) => {
  if (valueMode === "percentShock") return formatSignedPercent(option.value);
  if (valueMode === "multiplier") return `${formatNumber(option.value, { maximumFractionDigits: 2 })}x`;
  if (variable.unitType === "percentage") return formatPercent(option.value);
  return `${formatNumber(option.value)} ${unitLabelForVariable(variable, project)}`;
};

const discreteSummary = (variable: MonteCarloVariable) => {
  const validation = validateMonteCarloVariable(variable);
  const total = getMonteCarloDiscreteProbabilityTotal(variable);
  const options = getMonteCarloDiscreteOptions(variable);
  return validation.ok
    ? `گسسته | ${formatNumber(options.length)} گزینه | جمع احتمال‌ها: ${formatPercent(total)}`
    : `گسسته | نامعتبر | جمع احتمال‌ها: ${formatPercent(total)}`;
};

const baseValueForVariable = (
  variable: MonteCarloVariable,
  scenario: Scenario,
  outputs: CoreModelOutputs,
) => variable.baseValue ?? getRiskBaseValue(variableKind(variable), scenario, outputs);

const exposureStatus = (variable: MonteCarloVariable, scenario: Scenario) => {
  const kind = variableKind(variable);
  if (!(variable.active ?? variable.enabled)) return { className: "muted", label: "غیرفعال" };
  if (kind === "fxRate" && !hasFxExposure(scenario.assumptions)) return { className: "watch", label: "بدون مواجهه" };
  if (kind === "debtInterest" && !hasActiveDebtExposure(scenario.assumptions)) return { className: "watch", label: "بدون بدهی فعال" };
  if (kind === "revenue") return { className: "partial", label: "مواجهه جزئی" };
  return { className: "ok", label: "مواجهه فعال" };
};

const invalidReasonLabels: Record<string, string> = {
  invalidNpv: "NPV نامعتبر",
  invalidIrr: "IRR نامعتبر",
  invalidDscr: "DSCR نامعتبر",
  invalidLiquidity: "نقدینگی نامعتبر",
  modelError: "خطای مدل",
  nonFiniteOutput: "خروجی غیرمتناهی",
  terminalGrowthInvalid: "رشد پایانی نامعتبر",
};

const topInvalidReasons = (rows: MonteCarloIterationResult[]) => {
  const counts = new Map<string, number>();
  rows.forEach((row) => row.invalidReasons.forEach((reason) => counts.set(reason, (counts.get(reason) ?? 0) + 1)));
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([reason, count]) => ({ reason, label: invalidReasonLabels[reason] ?? reason, count }));
};

function HistogramChart({ result, project }: { result: NonNullable<ReturnType<typeof useProject>["outputs"]["monteCarlo"]>; project: Project }) {
  const bins = result.histogram;
  const maxCount = Math.max(1, ...bins.map((bin) => bin.count));
  return (
    <div className="monte-chart" aria-label="نمودار هیستوگرام NPV">
      <div className="monte-chart-head">
        <strong>هیستوگرام NPV</strong>
        <span>{formatNumber(result.validIterationCount)} مسیر معتبر</span>
      </div>
      <div className="monte-histogram">
        {bins.map((bin) => (
          <i
            key={`${bin.start}-${bin.end}`}
            style={{ height: `${Math.max(4, (bin.count / maxCount) * 100)}%` }}
            title={`${formatMoney(bin.start, project)} تا ${formatMoney(bin.end, project)}`}
          />
        ))}
      </div>
      <div className="monte-chart-axis-labels">
        <span>محور افقی: NPV، {unitLabel(project)}</span>
        <span>محور عمودی: تعداد تکرار</span>
      </div>
    </div>
  );
}

function CdfChart({ result, project }: { result: NonNullable<ReturnType<typeof useProject>["outputs"]["monteCarlo"]>; project: Project }) {
  const cdf = result.cdf;
  const min = cdf.length ? Math.min(...cdf.map((point) => point.value)) : 0;
  const max = cdf.length ? Math.max(...cdf.map((point) => point.value)) : 1;
  const span = Math.max(max - min, 1);
  const points = cdf.map((point) => {
    const x = ((point.value - min) / span) * 100;
    const y = 100 - point.probability * 100;
    return `${x},${y}`;
  }).join(" ");
  return (
    <div className="monte-chart" aria-label="تابع توزیع تجمعی NPV">
      <div className="monte-chart-head">
        <strong>تابع توزیع تجمعی NPV</strong>
        <span>{formatMoney(min, project)} تا {formatMoney(max, project)}</span>
      </div>
      <svg className="monte-svg" viewBox="0 0 100 100" role="img" aria-label="منحنی احتمال تجمعی">
        <polyline points={points} />
      </svg>
      <div className="monte-chart-axis-labels">
        <span>محور افقی: NPV، {unitLabel(project)}</span>
        <span>محور عمودی: احتمال تجمعی</span>
      </div>
    </div>
  );
}

function ScatterChart({ result, project }: { result: NonNullable<ReturnType<typeof useProject>["outputs"]["monteCarlo"]>; project: Project }) {
  const firstKey = Object.keys(result.scatter)[0];
  const points = firstKey ? result.scatter[firstKey] : [];
  if (points.length < 3) return null;
  const contribution = result.contributions.find((item) => item.variableId === firstKey);
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = xs.length ? Math.min(...xs) : -1;
  const maxX = xs.length ? Math.max(...xs) : 1;
  const minY = ys.length ? Math.min(...ys) : 0;
  const maxY = ys.length ? Math.max(...ys) : 1;
  const xSpan = Math.max(maxX - minX, 0.0001);
  const ySpan = Math.max(maxY - minY, 1);
  return (
    <div className="monte-chart" aria-label="نمودار پراکندگی سهم ریسک">
      <div className="monte-chart-head">
        <strong>پراکندگی NPV نسبت به {contribution?.variable ?? "متغیر منتخب"}</strong>
        <span>{contribution?.correlationWithNpv !== null && contribution?.correlationWithNpv !== undefined ? `همبستگی ${formatNumber(contribution.correlationWithNpv)}` : "بدون داده"}</span>
      </div>
      <svg className="monte-svg monte-scatter" viewBox="0 0 100 100" role="img" aria-label="پراکندگی شوک و NPV">
        {points.map((point) => (
          <circle
            key={point.iteration}
            cx={((point.x - minX) / xSpan) * 92 + 4}
            cy={96 - ((point.y - minY) / ySpan) * 92}
            r="1.6"
          />
        ))}
      </svg>
      {points.length ? (
        <div className="monte-chart-axis-labels">
          <span>محور افقی: مقدار شوک متغیر</span>
          <span>محور عمودی: NPV، {unitLabel(project)} ({formatMoney(minY, project)} تا {formatMoney(maxY, project)})</span>
        </div>
      ) : null}
    </div>
  );
}

function ContributionChart({ result }: { result: NonNullable<ReturnType<typeof useProject>["outputs"]["monteCarlo"]> }) {
  const top = result.contributions.slice(0, 6);
  const max = Math.max(0.001, ...top.map((item) => item.absoluteCorrelation));
  return (
    <div className="monte-chart contribution-chart" aria-label="رتبه بندی سهم ریسک">
      <div className="monte-chart-head">
        <strong>سهم ریسک</strong>
        <span>روش: همبستگی نمونه‌ای با NPV</span>
      </div>
      <div className="monte-contribution-list">
        {top.map((item) => (
          <div key={item.variableId}>
            <span>{item.variable}</span>
            <b style={{ width: `${Math.max(4, (item.absoluteCorrelation / max) * 100)}%` }} />
            <small>{item.correlationWithNpv !== null && item.correlationWithNpv > 0 ? "+" : ""}{formatNumber(item.correlationWithNpv)}</small>
          </div>
        ))}
      </div>
      <small className="monte-method-note">{result.contributionMethodDescription}</small>
    </div>
  );
}

function QualityWarningsPanel({ warnings }: { warnings: MonteCarloQualityWarning[] }) {
  return (
    <section className="panel wide-panel">
      <div className="panel-heading">
        <div><span>کیفیت</span><strong>هشدارهای کیفیت و اعتبار</strong></div>
        <small>{formatNumber(warnings.length)} مورد</small>
      </div>
      <div className="monte-warning-grid">
        {warnings.slice(0, 8).map((item) => (
          <article key={item.id}>
            <strong>{item.message}</strong>
            {item.recommendation ? <span>{item.recommendation}</span> : null}
            {item.details?.length ? (
              <details>
                <summary>جزئیات</summary>
                <ul>
                  {item.details.map((detail) => <li key={detail}>{detail}</li>)}
                </ul>
              </details>
            ) : null}
          </article>
        ))}
        {!warnings.length ? <article className="ok"><strong>هشدار کیفیت ثبت نشده است.</strong></article> : null}
      </div>
    </section>
  );
}

function RunBenchmarkPanel({
  draft,
  progress,
  result,
  runState,
}: {
  draft: MonteCarloAssumptions;
  progress: MonteCarloProgressSnapshot | null;
  result: MonteCarloResult | undefined;
  runState: keyof typeof runStateLabels;
}) {
  const completed = progress?.completedIterations ?? result?.completedIterations ?? 0;
  const total = progress?.totalIterations ?? result?.requestedIterations ?? draft.iterations;
  const durationMs = runState === "running" ? progress?.elapsedMs : result?.durationMs;
  const averageMs = result?.averageMsPerIteration ?? (completed > 0 && durationMs !== undefined ? durationMs / completed : null);
  const percent = total > 0 ? completed / total : 0;

  return (
    <div className="monte-benchmark-grid" aria-label="اطلاعات اجرای شبیه‌سازی">
      <article>
        <span>وضعیت اجرا</span>
        <strong>{runStateLabels[runState]}</strong>
      </article>
      <article>
        <span>تکرار آخرین اجرا</span>
        <strong>{formatNumber(runState === "running" ? total : result?.completedIterations ?? draft.iterations, { maximumFractionDigits: 0 })}</strong>
      </article>
      <article>
        <span>پیشرفت</span>
        <strong>{formatNumber(completed, { maximumFractionDigits: 0 })} / {formatNumber(total, { maximumFractionDigits: 0 })}</strong>
        <small>{formatPercent(percent)}</small>
      </article>
      <article>
        <span>مدت اجرا</span>
        <strong>{formatDuration(durationMs)}</strong>
      </article>
      <article>
        <span>میانگین هر تکرار</span>
        <strong>{averageMs === null ? "نامشخص" : `${formatNumber(averageMs, { maximumFractionDigits: 2 })} ms`}</strong>
      </article>
      <article>
        <span>شروع / پایان</span>
        <strong>{formatDateTime(progress?.startedAt ?? result?.startedAt)} / {formatDateTime(result?.completedAt)}</strong>
      </article>
    </div>
  );
}

function ManagementInterpretation({ project, result }: { project: Project; result: MonteCarloResult }) {
  const drivers = result.contributions
    .filter((item) => item.status === "valid" && item.correlationWithNpv !== null)
    .slice(0, 3);
  const driverText = drivers.length ? drivers.map((item) => item.variable).join("، ") : "ریسک غالب قابل اتکا شناسایی نشد";
  const npvPositive = result.probabilityNpvPositive;
  const npvPositiveForRisk = npvPositive ?? 0;
  const bankFailure = result.probabilityBankabilityFailure;
  const cashCrunch = result.probabilityCashCrunch;
  const conclusion = npvPositiveForRisk < 0.2 || bankFailure > 0.5
    ? "پروژه با مفروضات فعلی برای ارائه سرمایه‌گذاری و تأمین مالی نیازمند اصلاح جدی است."
    : npvPositiveForRisk < 0.55 || bankFailure > 0.25 || cashCrunch > 0.25
      ? "پروژه قابل بررسی است، اما حاشیه اطمینان آن برای تصمیم نهایی کافی نیست."
      : "پروژه در اجرای فعلی تاب‌آوری قابل قبول‌تری نشان می‌دهد، مشروط به کنترل ریسک‌های غالب.";
  const recommendations = new Set<string>();
  drivers.forEach((item) => {
    const text = `${item.variable} ${item.sourceModule}`;
    if (text.includes("قیمت") || text.includes("فروش") || text.includes("درآمد")) recommendations.add("تعرفه، قیمت فروش و قرارداد خرید را بازبینی کنید.");
    if (text.includes("CAPEX") || text.includes("سرمایه")) recommendations.add("CAPEX را مرحله‌بندی یا با مناقصه و ذخیره احتیاطی کنترل کنید.");
    if (text.includes("ارز") || text.includes("FX")) recommendations.add("مواجهه ارزی و نرخ‌های خرید/تأمین را جداگانه پوشش دهید.");
    if (text.includes("بدهی") || text.includes("بهره") || text.includes("DSCR")) recommendations.add("ساختار بدهی، دوره تنفس و نرخ بهره را بازطراحی کنید.");
    if (text.includes("نقد") || text.includes("گردش")) recommendations.add("بافر آورده و سرمایه در گردش را افزایش دهید.");
  });
  if (cashCrunch > 0.25) recommendations.add("بافر نقدینگی و برنامه پرداخت CAPEX را دوباره تنظیم کنید.");
  recommendations.add("برای گزارش نهایی، سناریوی همبسته ریسک‌ها یا ماتریس همبستگی اجرا شود.");

  return (
    <section className="panel wide-panel monte-management-panel">
      <div className="panel-heading">
        <div><span>نگاه مدیریتی</span><strong>تفسیر مدیریتی شبیه‌سازی</strong></div>
        <small>جمع‌بندی داده‌محور</small>
      </div>
      <div className="monte-management-grid">
        <article>
          <span>نتیجه کلیدی</span>
          <strong>{conclusion}</strong>
          <p>
            احتمال مثبت شدن NPV برابر {formatPercent(npvPositive)}، احتمال شکست بانک‌پذیری {formatPercent(bankFailure)} و احتمال بحران نقدینگی {formatPercent(cashCrunch)} است.
          </p>
        </article>
        <article>
          <span>فشارهای اصلی</span>
          <strong>{driverText}</strong>
          <p>P5/P50/P95 NPV: {formatMoney(result.p5, project)} / {formatMoney(result.p50, project)} / {formatMoney(result.p95, project)}</p>
        </article>
        <article>
          <span>اقدام پیشنهادی</span>
          <ul>
            {[...recommendations].slice(0, 5).map((item) => <li key={item}>{item}</li>)}
          </ul>
        </article>
      </div>
    </section>
  );
}

function ActiveVariablesSummary({
  activeScenario,
  outputs,
  project,
  variables,
}: {
  activeScenario: Scenario;
  outputs: CoreModelOutputs;
  project: Project;
  variables: MonteCarloVariable[];
}) {
  const active = variables.filter((variable) => variable.active ?? variable.enabled);
  return (
    <section className="panel wide-panel monte-client-variable-summary">
      <div className="panel-heading">
        <div><span>متغیرهای فعال</span><strong>خلاصه مفروضات ریسک</strong></div>
        <small>{formatNumber(active.length)} متغیر فعال</small>
      </div>
      <div className="monte-client-variable-grid">
        {active.slice(0, 8).map((variable) => {
          const distributionType = distributionTypeOf(variable);
          const isDiscrete = distributionType === "discrete";
          const baseValue = baseValueForVariable(variable, activeScenario, outputs);
          return (
            <article key={variable.id ?? variable.name}>
              <span>{variable.label ?? variable.name}</span>
              <strong>{baseValue === null ? "ناموجود" : formatByUnit(baseValue, variable.unitType ?? "none", project)}</strong>
              <small>{distributionLabel(distributionType)} · {isDiscrete ? discreteSummary(variable) : `${formatShockValue(variable, variable.low, project)} تا ${formatShockValue(variable, variable.high, project)}`}</small>
            </article>
          );
        })}
        {!active.length ? (
          <article className="empty">
            <span>متغیر فعال وجود ندارد</span>
            <strong>مسیر پایه تکرار می‌شود</strong>
            <small>برای تحلیل ریسک، در نمای تحلیلگر حداقل یک متغیر را فعال کنید.</small>
          </article>
        ) : null}
      </div>
    </section>
  );
}

function VarConventionBox({ project, result }: { project: Project; result: MonteCarloResult }) {
  return (
    <div className="monte-var-explanation">
      <div>
        <span>NPV پایه</span>
        <strong>{formatMoney(result.baseNpv, project)}</strong>
      </div>
      <p>{result.varConventionDescription}</p>
      <ul>
        {result.varConventionNotes.map((note) => <li key={note}>{note}</li>)}
      </ul>
    </div>
  );
}

function DiscreteOptionsEditor({
  onChange,
  project,
  variable,
}: {
  onChange: (variable: MonteCarloVariable) => void;
  project: Project;
  variable: MonteCarloVariable;
}) {
  const distribution = discreteDistributionFor(variable);
  const options = distribution.options ?? [];
  const valueMode = distribution.valueMode ?? "percentShock";
  const probabilityTotal = options.reduce((total, option) => total + (Number.isFinite(option.probability) ? option.probability : 0), 0);
  const validation = validateMonteCarloVariable({ ...variable, distribution });
  const valueStep = valueMode === "absoluteValue" && (variable.unitType === "months" || variable.unitType === "days") ? "1" : "0.01";
  const inputUsesPercent = valueMode === "percentShock" || (valueMode === "absoluteValue" && variable.unitType === "percentage");
  const valueLabel = valueMode === "percentShock"
    ? "مقدار شوک (%)"
    : valueMode === "multiplier" ? "ضریب" : `مقدار (${unitLabelForVariable(variable, project)})`;

  const commit = (nextOptions: MonteCarloDiscreteOption[], nextMode = valueMode) => {
    const nextDistribution = syncDiscreteDistribution(distribution, nextOptions, nextMode);
    onChange({ ...variable, distribution: nextDistribution });
  };

  const updateOption = (optionId: string, updater: (option: MonteCarloDiscreteOption) => MonteCarloDiscreteOption) => {
    onChange(updateMonteCarloDiscreteOption(variable, optionId, updater));
  };

  const addOption = () => {
    const nextIndex = options.length + 1;
    commit([
      ...options,
      {
        id: nextMonteCarloDiscreteOptionId(variable, options),
        label: `گزینه ${nextIndex}`,
        value: valueMode === "multiplier" ? 1 : 0,
        probability: 0,
        description: "",
      },
    ]);
  };

  const removeOption = (optionId: string) => {
    commit(options.filter((option) => option.id !== optionId));
  };

  const resetPreset = () => {
    const preset = buildDefaultDiscreteDistribution(variable);
    onChange({ ...variable, distribution: preset });
  };

  const normalizeProbabilities = () => {
    const positiveTotal = options.reduce((total, option) => total + Math.max(0, Number.isFinite(option.probability) ? option.probability : 0), 0);
    if (positiveTotal <= 0) return;
    commit(options.map((option) => ({
      ...option,
      probability: Math.max(0, Number.isFinite(option.probability) ? option.probability : 0) / positiveTotal,
    })));
  };

  return (
    <div className="monte-discrete-editor">
      <div className="monte-discrete-toolbar">
        <div>
          <strong>گزینه‌های گسسته</strong>
          <span className={probabilityIsComplete(probabilityTotal) ? "ok" : "invalid"}>
            جمع احتمال‌ها: {formatPercent(probabilityTotal)}
          </span>
        </div>
        <div className="monte-discrete-actions">
          <button type="button" onClick={resetPreset}>پیش‌فرض</button>
          <button type="button" onClick={normalizeProbabilities}>نرمال‌سازی احتمال‌ها</button>
          <button type="button" onClick={addOption}>افزودن گزینه</button>
        </div>
      </div>

      <label className="editable-field monte-discrete-mode">
        <span>نوع مقدار</span>
        <select
          value={valueMode}
          onChange={(event) => {
            const nextMode = event.target.value as MonteCarloDiscreteValueMode;
            onChange(setMonteCarloDiscreteValueMode(variable, nextMode));
          }}
        >
          {Object.entries(discreteValueModeLabels).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </label>

      <div className="monte-discrete-list">
        {options.map((option) => {
          const displayedValue = inputUsesPercent ? option.value * 100 : option.value;
          return (
            <div className="monte-discrete-row" key={option.id}>
              <label className="editable-field">
                <span>برچسب گزینه</span>
                <input
                  value={option.label}
                  onChange={(event) => updateOption(option.id, (item) => ({ ...item, label: event.target.value }))}
                />
              </label>
              <label className="editable-field">
                <span>{valueLabel}</span>
                <input
                  type="number"
                  step={valueStep}
                  value={displayedValue}
                  onChange={(event) => updateOption(option.id, (item) => {
                    const parsed = numberFromInput(event.target.value, displayedValue);
                    return { ...item, value: inputUsesPercent ? parsed / 100 : parsed };
                  })}
                />
              </label>
              <label className="editable-field">
                <span>احتمال (%)</span>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={option.probability * 100}
                  onChange={(event) => updateOption(option.id, (item) => ({
                    ...item,
                    probability: Math.max(0, numberFromInput(event.target.value, item.probability * 100)) / 100,
                  }))}
                />
              </label>
              <label className="editable-field">
                <span>توضیح</span>
                <input
                  value={option.description ?? ""}
                  onChange={(event) => updateOption(option.id, (item) => ({ ...item, description: event.target.value }))}
                />
              </label>
              <button type="button" className="monte-discrete-remove" onClick={() => removeOption(option.id)}>حذف گزینه</button>
              <small>{formatDiscreteOptionValue(variable, option, valueMode, project)} | {formatPercent(option.probability)}</small>
            </div>
          );
        })}
      </div>

      <div className={`monte-discrete-validation ${validation.ok ? "ok" : "invalid"}`}>
        {validation.ok ? "پیکربندی گسسته معتبر است." : validation.warnings[0]?.message ?? "احتمال نامعتبر"}
      </div>
    </div>
  );
}

function VariableConfiguration({
  activeScenario,
  draft,
  outputs,
  project,
  setDraft,
}: {
  activeScenario: Scenario;
  draft: MonteCarloAssumptions;
  outputs: CoreModelOutputs;
  project: Project;
  setDraft: (settings: MonteCarloAssumptions) => void;
}) {
  const groupedVariables = variableGroups
    .map((group) => ({
      ...group,
      variables: draft.variables
        .filter((variable) => variableGroupFor(variable).id === group.id),
    }))
    .filter((group) => group.variables.length > 0);

  return (
    <section className="panel wide-panel monte-variable-panel">
      <div className="panel-heading">
        <div><span>متغیرها</span><strong>پیکربندی متغیرهای ریسک</strong></div>
        <small>{formatNumber(draft.variables.length)} متغیر</small>
      </div>
      <div className="monte-variable-groups">
        {groupedVariables.map((group) => (
          <details className="monte-variable-group" key={group.id} open>
            <summary>
              <strong>{group.title}</strong>
              <span>{formatNumber(group.variables.length)} متغیر</span>
            </summary>
            <div className="monte-variable-card-grid">
              {group.variables.map((variable) => {
                const distributionType = distributionTypeOf(variable);
                const validation = validateMonteCarloVariable(variable);
                const baseValue = baseValueForVariable(variable, activeScenario, outputs);
                const status = exposureStatus(variable, activeScenario);
                const baseState = baseValueState(variable, baseValue, status, project);
                const isDiscrete = distributionType === "discrete";
                const discreteOptions = isDiscrete ? getMonteCarloDiscreteOptions(variable) : [];
                const discreteMode = isDiscrete ? getMonteCarloDiscreteValueMode(variable) : "percentShock";
                const variableId = variable.id ?? variable.name;
                return (
                  <article className={`monte-variable-card compact ${validation.ok ? "" : "invalid"}`} key={variableId}>
                    <div className="monte-variable-card-head">
                      <label className="monte-variable-toggle">
                        <input
                          aria-label={`فعال بودن ${variable.label ?? variable.name}`}
                          checked={variable.active ?? variable.enabled}
                          type="checkbox"
                          onChange={(event) => setDraft(updateMonteCarloVariableById(draft, variableId, (item) => ({ ...item, active: event.target.checked, enabled: event.target.checked })))}
                        />
                        <span>فعال</span>
                      </label>
                      <span className={`monte-exposure-badge ${validation.ok ? status.className : "watch"}`}>{validation.ok ? status.label : "پیکربندی نامعتبر"}</span>
                    </div>
                    <div className="monte-variable-title">
                      <strong>{variable.label ?? variable.name}</strong>
                      <span>{variable.sourceModule ?? "مدل مالی"}</span>
                    </div>
                    <div className="monte-variable-card-summary">
                      <div>
                        <span>مقدار پایه</span>
                        <strong>{baseState.value}</strong>
                        <small className={`monte-base-status ${baseState.className}`}>{baseState.label}</small>
                      </div>
                      <div>
                        <span>توزیع</span>
                        <strong>{distributionLabel(distributionType)}</strong>
                        <small>{isDiscrete ? discreteSummary(variable) : shockModeLabel(variable)}</small>
                      </div>
                    </div>
                    <div className="monte-shock-preview compact" aria-label="حدود شوک">
                      {isDiscrete ? (
                        discreteOptions.slice(0, 4).map((option) => (
                          <b key={option.id} title={option.description}>
                            {option.label}: {formatDiscreteOptionValue(variable, option, discreteMode, project)} | {formatPercent(option.probability)}
                          </b>
                        ))
                      ) : (
                        <>
                          <b>{formatShockValue(variable, variable.low, project)}</b>
                          <b>{formatShockValue(variable, variable.mid, project)}</b>
                          <b>{formatShockValue(variable, variable.high, project)}</b>
                        </>
                      )}
                    </div>
                    <details className="monte-variable-details">
                      <summary>جزئیات و ویرایش</summary>
                      <div className="monte-variable-fields">
                        <label className="editable-field">
                          <span>توزیع</span>
                          <select
                            value={distributionType}
                            onChange={(event) => setDraft(updateMonteCarloVariableById(
                              draft,
                              variableId,
                              (item) => changeMonteCarloDistributionType(item, event.target.value as MonteCarloDistributionType),
                            ))}
                          >
                            {distributionOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                          </select>
                        </label>
                        {isDiscrete ? null : (["low", "mid", "high"] as const).map((key) => (
                          <label className="editable-field" key={key}>
                            <span>{key === "low" ? "حد پایین" : key === "mid" ? "محتمل" : "حد بالا"}</span>
                            <input
                              type="number"
                              value={variable[key]}
                              step={shockModeOf(variable) === "absolute" ? "1" : "0.01"}
                              onChange={(event) => setDraft(updateMonteCarloVariableById(draft, variableId, (item) => ({ ...item, [key]: numberFromInput(event.target.value, item[key]) })))}
                            />
                          </label>
                        ))}
                      </div>
                      {isDiscrete ? (
                        <DiscreteOptionsEditor
                          project={project}
                          variable={variable}
                          onChange={(nextVariable) => setDraft(updateMonteCarloVariableById(draft, variableId, () => nextVariable))}
                        />
                      ) : null}
                      <div className="monte-variable-debug">
                        <p>{variable.exposureLogic ?? variable.description}</p>
                        <small title={variable.sourcePath}>مسیر منبع: {variable.sourcePath ?? "ثبت نشده"}</small>
                        <small>هدف جهش: {shockModeLabel(variable)} · واحد: {unitLabelForVariable(variable, project)}</small>
                        {validation.warnings.length ? (
                          <ul>
                            {validation.warnings.map((item) => <li key={item.id}>{item.message}</li>)}
                          </ul>
                        ) : null}
                      </div>
                    </details>
                  </article>
                );
              })}
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}

function SampleRowsTable({ rows, project }: { rows: MonteCarloIterationResult[]; project: Project }) {
  const [page, setPage] = useState(0);
  const pageSize = 8;
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const visible = rows.slice(page * pageSize, page * pageSize + pageSize);
  const allRisky = rows.length > 0 && rows.every((row) => row.invalidReasons.length || row.bankabilityFailure || row.cashCrunch);

  const rowStatus = (row: MonteCarloIterationResult) => {
    if (row.invalidReasons.length) return { className: "watch-cell", label: "نامعتبر" };
    if (row.cashCrunch) return { className: "risk-cell", label: "بحران نقدینگی" };
    if (row.bankabilityFailure) return { className: "risk-cell", label: "شکست بانکی" };
    if ((row.npv ?? 0) <= 0 || (row.minDscr ?? Infinity) < 1) return { className: "watch-cell", label: "ریسکی" };
    return { className: "ok-cell", label: "قابل قبول" };
  };

  const rowStatusBadges = (row: MonteCarloIterationResult, fallback: { className: string; label: string }) => {
    const badges: Array<{ className: string; label: string }> = [];
    if (row.invalidReasons.length) badges.push({ className: "watch-cell", label: "نامعتبر" });
    if ((row.npv ?? 0) < 0) badges.push({ className: "watch-cell", label: "NPV منفی" });
    if (row.bankabilityFailure) badges.push({ className: "risk-cell", label: "شکست بانکی" });
    if (row.cashCrunch) badges.push({ className: "risk-cell", label: "بحران نقدینگی" });
    if ((row.minDscr ?? Infinity) < 1) badges.push({ className: "watch-cell", label: "DSCR ضعیف" });
    if (row.irr === null || (row.irr ?? 0) < 0) badges.push({ className: "watch-cell", label: row.irr === null ? "IRR نامعتبر" : "IRR منفی" });
    return badges.length ? badges : [fallback];
  };

  useEffect(() => {
    setPage(0);
  }, [rows.length]);

  return (
    <section className="panel wide-panel">
      <div className="panel-heading">
        <div><span>نمونه مسیرها</span><strong>نمونه مسیرهای منتخب</strong></div>
        <div className="pager-controls">
          <button type="button" onClick={() => setPage((current) => Math.max(0, current - 1))} disabled={page === 0}>قبلی</button>
          <span>{formatNumber(page + 1)} / {formatNumber(pageCount)}</span>
          <button type="button" onClick={() => setPage((current) => Math.min(pageCount - 1, current + 1))} disabled={page >= pageCount - 1}>بعدی</button>
        </div>
      </div>
      <div className="table-wrap monte-sample-wrap">
        <table>
          <thead>
            <tr><th>نوع نمونه</th><th>تکرار</th><th>NPV</th><th>IRR</th><th>DSCR</th><th>نقدینگی</th><th>وضعیت</th></tr>
          </thead>
          <tbody>
            {visible.map((row) => {
              const statuses = rowStatusBadges(row, rowStatus(row));
              return (
                <tr className={row.sampleRole ? `sample-${row.sampleRole.replaceAll(" ", " sample-")}` : ""} key={row.iteration}>
                  <td title={row.sampleReason ?? undefined}>
                    <strong>{row.sampleLabel ?? "نمونه منتخب"}</strong>
                    {row.sampleReason ? <small>{row.sampleReason}</small> : null}
                  </td>
                  <td>{formatNumber(row.iteration)}</td>
                  <td>{formatMoney(row.npv, project)}</td>
                  <td>{formatPercent(row.irr)}</td>
                  <td>{formatNumber(row.minDscr)}</td>
                  <td>{formatMoney(row.liquidityGap, project)}</td>
                  <td>
                    <div className="monte-status-badges">
                      {statuses.map((status) => <span className={status.className} key={status.label}>{status.label}</span>)}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {allRisky ? (
        <p className="monte-sample-note">در اجرای فعلی همه نمونه‌های منتخب ریسکی هستند؛ این به دلیل NPV منفی، DSCR پایین یا فشار نقدینگی در مسیرهای نمونه است.</p>
      ) : null}
    </section>
  );
}

export function MonteCarloWorkbench() {
  const { activeScenario, applyMonteCarloSettings, mode, outputs, project, runMonteCarloAsync } = useProject();
  const [draft, setDraft] = useState(() => normalizeSettings(activeScenario.assumptions.monteCarlo));
  const [runState, setRunState] = useState<keyof typeof runStateLabels>("idle");
  const [progress, setProgress] = useState<MonteCarloProgressSnapshot | null>(null);
  const [heavyRunConfirmed, setHeavyRunConfirmed] = useState(false);
  const [lastRunSignature, setLastRunSignature] = useState<string | null>(() =>
    outputs.monteCarlo ? settingsSignature(activeScenario.assumptions.monteCarlo) : null);
  const cancelRef = useRef<AbortController | null>(null);
  const result = outputs.monteCarlo;
  const selectedSummary = result?.metricSummaries[draft.selectedMetric ?? "NPV"];
  const activeVariables = draft.variables.filter((variable) => variable.active ?? variable.enabled);
  const heavyRun = draft.iterations >= 5000;
  const invalidActiveVariables = useMemo(
    () => draft.variables
      .map((variable) => ({ variable, validation: validateMonteCarloVariable(variable) }))
      .filter((item) => (item.variable.active ?? item.variable.enabled) && !item.validation.ok),
    [draft.variables],
  );
  const invalidVariableCount = invalidActiveVariables.length;
  const firstInvalidVariable = invalidActiveVariables[0];
  const runDisabledReason = firstInvalidVariable
    ? `برای اجرای شبیه‌سازی ابتدا خطاهای ورودی را اصلاح کنید. متغیر «${firstInvalidVariable.variable.label ?? firstInvalidVariable.variable.name}» ${firstInvalidVariable.validation.warnings[0]?.message ?? "پیکربندی نامعتبر دارد."}`
    : heavyRun && !heavyRunConfirmed ? "برای اجرای سنگین ابتدا تایید اجرای سنگین را بزنید." : undefined;
  const runDisabled = runState === "running" || invalidVariableCount > 0 || (heavyRun && !heavyRunConfirmed);
  const draftSignature = useMemo(() => settingsSignature(draft), [draft]);
  const resultsStale = Boolean(result && lastRunSignature && draftSignature !== lastRunSignature && runState !== "running");
  const statusBadge = runState === "running"
    ? { className: "running", label: "در حال اجرا" }
    : invalidVariableCount > 0
      ? { className: "invalid", label: "نیازمند اصلاح ورودی" }
      : resultsStale
        ? { className: "stale", label: "نتایج قدیمی شده‌اند" }
        : result
          ? { className: "done", label: "اجرا شده" }
          : { className: "ready", label: "آماده اجرا" };

  useEffect(() => {
    setDraft(normalizeSettings(activeScenario.assumptions.monteCarlo));
    setProgress(null);
    setHeavyRunConfirmed(false);
  }, [activeScenario.id, activeScenario.assumptions.monteCarlo]);

  useEffect(() => {
    setRunState("idle");
    setLastRunSignature(result ? settingsSignature(activeScenario.assumptions.monteCarlo) : null);
  }, [activeScenario.id]);

  useEffect(() => {
    if (!result) {
      setLastRunSignature(null);
      return;
    }
    setLastRunSignature(settingsSignature(activeScenario.assumptions.monteCarlo));
    setRunState((current) => (current === "running" ? current : "completed"));
  }, [activeScenario.id, result?.completedAt]);

  useEffect(() => {
    if (!heavyRun) setHeavyRunConfirmed(false);
  }, [heavyRun, draft.iterations]);

  const metricCards = useMemo(() => {
    const cards = [
      { label: "P50 NPV", value: result?.metricSummaries.NPV.p50, unit: "totalMoney" as SensitivityUnitType, note: "میانه ارزش فعلی خالص" },
      { label: "P5 NPV", value: result?.metricSummaries.NPV.p5, unit: "totalMoney" as SensitivityUnitType, note: "سناریوی بدبینانه" },
      { label: "P95 NPV", value: result?.metricSummaries.NPV.p95, unit: "totalMoney" as SensitivityUnitType, note: "سناریوی خوش‌بینانه" },
      { label: "احتمال NPV مثبت", value: result?.probabilityNpvPositive, unit: "percentage" as SensitivityUnitType, note: "سهم مسیرهای دارای NPV بالاتر از آستانه" },
      { label: "VaR 95%", value: result?.valueAtRisk95, unit: "totalMoney" as SensitivityUnitType, note: "زیان نسبی نسبت به مدل پایه" },
      { label: "CVaR 95%", value: result?.conditionalValueAtRisk95, unit: "totalMoney" as SensitivityUnitType, note: "میانگین زیان دنباله بدتر از VaR" },
    ];
    if (result?.metricSummaries.DSCR.validCount) {
      cards.push({ label: "احتمال نقض DSCR", value: result.probabilityDscrBelowThreshold, unit: "percentage" as SensitivityUnitType, note: "فقط مسیرهای دارای DSCR معتبر" });
    }
    cards.push(
      { label: "احتمال بحران نقدینگی", value: result?.probabilityCashCrunch, unit: "percentage" as SensitivityUnitType, note: "مسیرهای دارای فشار نقدی" },
      { label: "احتمال شکست بانک‌پذیری", value: result?.probabilityBankabilityFailure, unit: "percentage" as SensitivityUnitType, note: "ترکیب NPV، DSCR و نقدینگی" },
    );
    return cards;
  }, [result]);

  const invalidReasons = useMemo(() => topInvalidReasons(result?.rows ?? []), [result]);

  const runSimulation = async () => {
    const normalized = normalizeSettings(draft);
    const hasInvalidVariables = normalized.variables.some((variable) => (variable.active ?? variable.enabled) && !validateMonteCarloVariable(variable).ok);
    if (hasInvalidVariables || (normalized.iterations >= 5000 && !heavyRunConfirmed)) return;
    setDraft(normalized);
    setRunState("running");
    const startedAt = new Date().toISOString();
    setProgress({
      running: true,
      completedIterations: 0,
      totalIterations: normalized.iterations,
      elapsedMs: 0,
      estimatedRemainingMs: null,
      startedAt,
    });
    const controller = new AbortController();
    cancelRef.current = controller;
    try {
      const completed = await runMonteCarloAsync(normalized, {
        signal: controller.signal,
        chunkSize: normalized.iterations >= 5000 ? 5 : 8,
        onProgress: setProgress,
      });
      cancelRef.current = null;
      if (completed) setLastRunSignature(settingsSignature(normalized));
      setRunState(completed ? "completed" : "cancelled");
    } catch {
      cancelRef.current = null;
      setRunState("failed");
      setProgress((current) => current ? { ...current, running: false } : current);
    }
  };

  const cancelSimulation = () => {
    cancelRef.current?.abort();
    setRunState("cancelled");
    setProgress((current) => current ? { ...current, running: false } : current);
  };

  const saveSettings = () => {
    const normalized = normalizeSettings(draft);
    setDraft(normalized);
    applyMonteCarloSettings(normalized);
    setRunState("saved");
  };

  return (
    <div className="monte-carlo-workbench">
      <section className="panel wide-panel monte-header-panel">
        <div className="panel-heading">
          <div>
            <span>شبیه‌سازی عدم‌قطعیت NPV، DSCR و جریان نقدی</span>
            <strong>مونت‌کارلو و ریسک سرمایه‌گذاری</strong>
          </div>
          <span className={`monte-status-badge ${statusBadge.className}`}>{statusBadge.label}</span>
          <div className="monte-run-actions">
            <button className="secondary-button" type="button" onClick={saveSettings} disabled={runState === "running"}>ذخیره تنظیمات</button>
            <button className="primary-button" type="button" onClick={runSimulation} disabled={runDisabled} title={runDisabledReason}>
              {runState === "running" ? "در حال اجرا" : "اجرای شبیه‌سازی"}
            </button>
            {runState === "running" ? (
              <button className="danger-button subtle" type="button" onClick={cancelSimulation}>توقف</button>
            ) : null}
          </div>
        </div>
        <div className="monte-status-row">
          <article>
            <UiIcon name="risk" />
            <div>
              <span>وضعیت اجرا</span>
              <strong>
                {runState === "running" && progress
                  ? `${formatNumber(progress.completedIterations)} / ${formatNumber(progress.totalIterations)}`
                  : result ? `${formatNumber(result.completedIterations)} تکرار` : runStateLabels[runState]}
              </strong>
            </div>
          </article>
          <article>
            <UiIcon name="settings" />
            <div><span>متغیر فعال</span><strong>{formatNumber(activeVariables.length)}</strong></div>
          </article>
          <article>
            <UiIcon name="check" />
            <div><span>بذر تصادفی</span><strong>{formatNumber(draft.seed, { maximumFractionDigits: 0 })}</strong></div>
          </article>
          <article className="monte-disabled">
            <UiIcon name="lock" />
            <div><span>همبستگی</span><strong>غیرفعال در v1</strong></div>
          </article>
        </div>
        <RunBenchmarkPanel draft={draft} progress={progress} result={result} runState={runState} />
        {runState === "running" && progress ? (
          <div className="monte-progress" role="status">
            <i><b style={{ width: `${Math.max(3, (progress.completedIterations / Math.max(1, progress.totalIterations)) * 100)}%` }} /></i>
            <span>
              محاسبه در جریان است · سپری‌شده {formatDuration(progress.elapsedMs)} · باقی‌مانده {formatDuration(progress.estimatedRemainingMs)}
            </span>
          </div>
        ) : null}
      </section>

      <section className="panel wide-panel">
        <div className="panel-heading">
          <div><span>کنترل‌ها</span><strong>کنترل اجرای شبیه‌سازی</strong></div>
          <small>{mode === "basic" ? "نمای ساده با کنترل‌های اصلی" : "نمای پیشرفته با کارت‌های متغیرها"}</small>
        </div>
        <div className="monte-control-grid">
          <label className="editable-field">
            <span>بذر تصادفی</span>
            <input type="number" value={draft.seed} onChange={(event) => setDraft({ ...draft, seed: numberFromInput(event.target.value, draft.seed) })} />
          </label>
          <label className="editable-field">
            <span>شاخص منتخب</span>
            <select value={draft.selectedMetric ?? "NPV"} onChange={(event) => setDraft({ ...draft, selectedMetric: event.target.value as MonteCarloMetric })}>
              {metricOptions.map((metric) => <option key={metric} value={metric}>{metricTitle(metric)}</option>)}
            </select>
          </label>
          <label className="editable-field">
            <span>روش نمونه‌گیری</span>
            <select value="random" disabled>
              <option value="random">مستقل بذردار</option>
            </select>
          </label>
          <div className="monte-preset-group" aria-label="تعداد تکرار">
            {[500, 1000, 5000].map((preset) => (
              <button
                key={preset}
                className={`${draft.iterations === preset ? "active" : ""} ${preset >= 5000 ? "heavy" : ""}`}
                type="button"
                title={preset === 500 ? "سریع" : preset === 1000 ? "استاندارد" : "حرفه‌ای با اجرای پس‌زمینه"}
                onClick={() => {
                  setDraft({ ...draft, iterations: preset });
                  setHeavyRunConfirmed(false);
                }}
              >
                {formatNumber(preset, { maximumFractionDigits: 0 })}
              </button>
            ))}
            <button type="button" disabled title="تا زمان benchmark رسمی غیرفعال است">۱۰۰۰۰</button>
          </div>
        </div>
        <div className="monte-disabled-copy">
          <UiIcon name="lock" />
          <span>{correlationMessage}</span>
        </div>
        {heavyRun ? (
          <div className="monte-heavy-warning" role="note">
            <span>اجرای ۵۰۰۰ تکرار ممکن است زمان‌بر باشد؛ برای ادامه از اجرای قطعه‌ای پس‌زمینه استفاده می‌شود و پیشرفت/لغو فعال است.</span>
            <button type="button" onClick={() => setHeavyRunConfirmed(true)} disabled={heavyRunConfirmed}>
              {heavyRunConfirmed ? "اجرای سنگین تأیید شد" : "تأیید اجرای سنگین"}
            </button>
          </div>
        ) : null}
        {invalidVariableCount ? (
          <div className="monte-heavy-warning danger" role="alert">
            <strong>{runDisabledReason}</strong>
            {formatNumber(invalidVariableCount)} متغیر فعال پیکربندی نامعتبر دارد؛ قبل از اجرا کارت‌های علامت‌دار را اصلاح کنید.
          </div>
        ) : null}
      </section>

      <ActiveVariablesSummary
        activeScenario={activeScenario}
        outputs={outputs}
        project={project}
        variables={draft.variables}
      />

      {resultsStale ? (
        <section className="panel wide-panel monte-stale-warning" role="status">
          <UiIcon name="risk" />
          <div>
            <strong>نتایج با تنظیمات فعلی به‌روز نیستند؛ دوباره اجرا کنید.</strong>
            <p>برای جلوگیری از برداشت اشتباه، کارت‌ها و نمودارهای زیر با برچسب نتیجه قدیمی نمایش داده شده‌اند.</p>
          </div>
        </section>
      ) : null}

      {result ? (
        <>
          <div className={resultsStale ? "monte-result-stack stale" : "monte-result-stack"}>
            <ManagementInterpretation project={project} result={result} />

            <section className="dashboard-kpis compact monte-kpis">
              {metricCards.map((card) => (
                <article key={card.label}>
                  <span>{card.label}</span>
                  <strong>{formatByUnit(card.value ?? null, card.unit, project)}</strong>
                  <small>{resultsStale ? "نتیجه قدیمی؛ دوباره اجرا کنید" : card.note}</small>
                </article>
              ))}
            </section>

            <section className="panel wide-panel">
              <div className="panel-heading">
                <div><span>نمودارهای اصلی</span><strong>توزیع و محرک‌های ریسک NPV</strong></div>
                <small>واحد محور پولی: {unitLabel(project)}</small>
              </div>
              {result.metricSummaries.NPV.validCount >= 2 ? (
                <div className="monte-chart-grid">
                  <HistogramChart result={result} project={project} />
                  <CdfChart result={result} project={project} />
                  <ScatterChart result={result} project={project} />
                  <ContributionChart result={result} />
                </div>
              ) : (
                <div className="empty-state large">
                  <UiIcon name="risk" />
                  <strong>نتایج کافی برای گزارش آماری وجود ندارد.</strong>
                  <p>پس از اصلاح ورودی‌ها و اجرای شبیه‌سازی، نمودارهای توزیع و سهم ریسک نمایش داده می‌شوند.</p>
                </div>
              )}
            </section>

            <details className="monte-collapsible-section">
              <summary>
                <strong>نمونه مسیرهای منتخب</strong>
                <span>بدترین، میانه و مسیرهای شاخص</span>
              </summary>
              <SampleRowsTable rows={result.sampledRows} project={project} />
            </details>
          </div>
        </>
      ) : (
        <section className="panel wide-panel">
          <div className="empty-state large">
            <UiIcon name="risk" />
            <strong>شبیه‌سازی هنوز اجرا نشده است.</strong>
            <p>تنظیمات را بررسی کنید و اجرای شبیه‌سازی را بزنید؛ خروجی فقط با درخواست شما محاسبه می‌شود.</p>
          </div>
        </section>
      )}

      <details className="monte-advanced-shell">
        <summary>
          <strong>نمای تحلیلگر پیشرفته</strong>
          <span>ویرایش متغیرها، هشدارها، روش‌شناسی و ردیابی مدل</span>
        </summary>
        <div className="monte-advanced-content">
          <VariableConfiguration
            activeScenario={activeScenario}
            draft={draft}
            outputs={outputs}
            project={project}
            setDraft={setDraft}
          />

          <section className="panel wide-panel">
            <div className="panel-heading">
              <div><span>وابستگی</span><strong>وضعیت وابستگی متغیرها</strong></div>
              <small>v1 مستقل</small>
            </div>
            <p className="monte-var-note">{correlationMessage}</p>
          </section>

          {result ? (
            <>
              <QualityWarningsPanel warnings={result.qualityWarnings} />

              <section className="panel wide-panel">
                <div className="panel-heading">
                  <div><span>شاخص منتخب</span><strong>{metricTitle(draft.selectedMetric ?? "NPV")}</strong></div>
                  <small>میانگین {formatMetricSummaryValue(selectedSummary, "mean", project)} · SE {formatMetricSummaryValue(selectedSummary, "standardError", project)}</small>
                </div>
                <VarConventionBox project={project} result={result} />
                <div className="monte-validity-grid">
                  <article><span>تکرار معتبر</span><strong>{formatNumber(result.validIterationCount)}</strong></article>
                  <article><span>تکرار نامعتبر</span><strong>{formatNumber(result.invalidIterationCount)}</strong></article>
                  <article><span>IRR معتبر</span><strong>{formatNumber(result.metricSummaries.IRR.validCount)}</strong></article>
                  <article><span>IRR نامعتبر</span><strong>{formatNumber(result.metricSummaries.IRR.invalidCount)}</strong></article>
                  <article>
                    <span>بازه اطمینان میانگین NPV</span>
                    <strong>{formatMoney(result.metricSummaries.NPV.confidenceInterval95.low, project)} تا {formatMoney(result.metricSummaries.NPV.confidenceInterval95.high, project)}</strong>
                  </article>
                  <article>
                    <span>دلایل نامعتبر برتر</span>
                    <strong>{invalidReasons.length ? invalidReasons.map((item) => `${item.label}: ${formatNumber(item.count)}`).join(" · ") : "موردی ثبت نشده"}</strong>
                  </article>
                </div>
              </section>

              <section className="panel wide-panel">
                <div className="panel-heading">
                  <div><span>ردیابی مفروضات</span><strong>ردیابی مفروضات پایه</strong></div>
                  <small>فشرده، خواندنی و غیرقابل ویرایش در این تب</small>
                </div>
                <div className="monte-provenance-grid compact">
                  {result.assumptionProvenance.slice(0, 8).map((item) => (
                    <article key={item.id}>
                      <span>{item.label}</span>
                      <strong>{typeof item.value === "number" ? formatByUnit(item.value, item.unitType ?? "none", project) : item.value}</strong>
                      <small>{item.sourceModule}</small>
                    </article>
                  ))}
                </div>
                {result.assumptionProvenance.length > 8 ? (
                  <details className="monte-provenance-more">
                    <summary>نمایش مسیرهای منبع بیشتر</summary>
                    <div className="monte-provenance-grid compact">
                      {result.assumptionProvenance.slice(8).map((item) => (
                        <article key={item.id}>
                          <span>{item.label}</span>
                          <strong>{typeof item.value === "number" ? formatByUnit(item.value, item.unitType ?? "none", project) : item.value}</strong>
                          <small title={item.sourcePath}>{item.sourceModule}</small>
                        </article>
                      ))}
                    </div>
                  </details>
                ) : null}
              </section>
            </>
          ) : null}
        </div>
      </details>

    </div>
  );
}
