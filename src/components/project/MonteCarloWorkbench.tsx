"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { formatMoney, formatNumber, formatPercent } from "@/lib/format";
import { getRiskBaseValue, hasActiveDebtExposure, hasFxExposure, riskVariableKindFromText, type CoreModelOutputs } from "@/lib/risk-variable-engine";
import type { MonteCarloProgressSnapshot } from "@/lib/monte-carlo-engine";
import type {
  MonteCarloAssumptions,
  MonteCarloDistribution,
  MonteCarloDistributionType,
  MonteCarloIterationResult,
  MonteCarloMetric,
  MonteCarloMetricSummary,
  MonteCarloQualityWarning,
  MonteCarloVariable,
  Project,
  Scenario,
  SensitivityUnitType,
} from "@/lib/types";
import { useProject } from "@/store/project-context";
import { UiIcon } from "@/components/project/UiIcon";

const correlationMessage = "نمونه‌گیری فعلی مستقل است؛ همبستگی بین تورم، نرخ ارز، CAPEX، تأخیر و فروش در این نسخه اعمال نمی‌شود. بنابراین ریسک هم‌زمانی شوک‌ها ممکن است کمتر از واقع برآورد شود.";

const metricOptions: MonteCarloMetric[] = ["NPV", "IRR", "MIRR", "Payback", "DSCR", "EquityValue", "BCR", "Liquidity", "FinancingCost"];
const distributionOptions: Array<{ value: MonteCarloDistributionType; label: string }> = [
  { value: "normal", label: "نرمال محدود" },
  { value: "triangular", label: "مثلثی" },
  { value: "pert", label: "Beta-PERT" },
  { value: "uniform", label: "یکنواخت" },
  { value: "lognormal", label: "لگ‌نرمال" },
  { value: "discrete", label: "گسسته" },
];

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

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

const normalizeSettings = (settings: MonteCarloAssumptions): MonteCarloAssumptions => ({
  ...clone(settings),
  selectedMetric: settings.selectedMetric ?? "NPV",
  samplingMethod: settings.samplingMethod ?? "random",
  invalidIterationHandling: settings.invalidIterationHandling ?? "exclude",
  correlation: { mode: "independent", warning: correlationMessage },
  variables: settings.variables.map((variable, index) => ({
    ...variable,
    id: variable.id ?? `mc-variable-${index + 1}`,
    label: variable.label ?? variable.name,
    active: variable.active ?? variable.enabled,
    enabled: variable.enabled ?? variable.active ?? true,
  })),
});

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

const updateVariableAt = (
  settings: MonteCarloAssumptions,
  index: number,
  updater: (variable: MonteCarloVariable) => MonteCarloVariable,
) => ({
  ...settings,
  variables: settings.variables.map((variable, variableIndex) => (variableIndex === index ? updater(variable) : variable)),
});

const numberFromInput = (value: string, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const formatDuration = (ms: number | null | undefined) => {
  if (ms === null || ms === undefined) return "نامشخص";
  if (ms < 1000) return `${formatNumber(ms, { maximumFractionDigits: 0 })} ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${formatNumber(seconds, { maximumFractionDigits: 1 })} ثانیه`;
  return `${formatNumber(seconds / 60, { maximumFractionDigits: 1 })} دقیقه`;
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

const formatShockValue = (variable: MonteCarloVariable, value: number) => {
  const mode = shockModeOf(variable);
  if (mode === "percent" || mode === "rateDelta") return formatPercent(value);
  return formatNumber(value);
};

const distributionLabel = (value: MonteCarloDistributionType) =>
  distributionOptions.find((option) => option.value === value)?.label ?? value;

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
    <div className="monte-chart" aria-label="نمودار CDF">
      <div className="monte-chart-head">
        <strong>CDF تجمعی</strong>
        <span>{formatMoney(min, project)} تا {formatMoney(max, project)}</span>
      </div>
      <svg className="monte-svg" viewBox="0 0 100 100" role="img" aria-label="منحنی احتمال تجمعی">
        <polyline points={points} />
      </svg>
    </div>
  );
}

function ScatterChart({ result, project }: { result: NonNullable<ReturnType<typeof useProject>["outputs"]["monteCarlo"]>; project: Project }) {
  const firstKey = Object.keys(result.scatter)[0];
  const points = firstKey ? result.scatter[firstKey] : [];
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
        <strong>پراکندگی اثر ریسک</strong>
        <span>{contribution?.variable ?? "بدون داده"}</span>
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
      {points.length ? <small>محور عمودی: {formatMoney(minY, project)} تا {formatMoney(maxY, project)}</small> : null}
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
        <span>{result.dominantRiskScenario}</span>
      </div>
      <div className="monte-contribution-list">
        {top.map((item) => (
          <div key={item.variableId}>
            <span>{item.variable}</span>
            <b style={{ width: `${Math.max(4, (item.absoluteCorrelation / max) * 100)}%` }} />
            <small>{formatNumber(item.correlationWithNpv)}</small>
          </div>
        ))}
      </div>
    </div>
  );
}

function QualityWarningsPanel({ warnings }: { warnings: MonteCarloQualityWarning[] }) {
  return (
    <section className="panel wide-panel">
      <div className="panel-heading">
        <div><span>Quality</span><strong>هشدارهای کیفیت و اعتبار</strong></div>
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
  return (
    <section className="panel wide-panel monte-variable-panel">
      <div className="panel-heading">
        <div><span>Variables</span><strong>پیکربندی متغیرهای ریسک</strong></div>
        <small>{formatNumber(draft.variables.length)} متغیر</small>
      </div>
      <div className="monte-variable-card-grid">
        {draft.variables.map((variable, index) => {
          const distributionType = distributionTypeOf(variable);
          const baseValue = baseValueForVariable(variable, activeScenario, outputs);
          const status = exposureStatus(variable, activeScenario);
          return (
            <article className="monte-variable-card" key={variable.id ?? variable.name}>
              <div className="monte-variable-card-head">
                <label className="monte-variable-toggle">
                  <input
                    aria-label={`فعال بودن ${variable.label ?? variable.name}`}
                    checked={variable.active ?? variable.enabled}
                    type="checkbox"
                    onChange={(event) => setDraft(updateVariableAt(draft, index, (item) => ({ ...item, active: event.target.checked, enabled: event.target.checked })))}
                  />
                  <span>فعال</span>
                </label>
                <span className={`monte-exposure-badge ${status.className}`}>{status.label}</span>
              </div>
              <div className="monte-variable-title">
                <strong>{variable.label ?? variable.name}</strong>
                <span>{variable.sourceModule ?? "مدل مالی"}</span>
              </div>
              <div className="monte-variable-base">
                <span>مقدار پایه</span>
                <strong>{formatByUnit(baseValue, variable.unitType ?? "none", project)}</strong>
              </div>
              <div className="monte-variable-fields">
                <label className="editable-field">
                  <span>توزیع</span>
                  <select
                    value={distributionType}
                    onChange={(event) => setDraft(updateVariableAt(draft, index, (item) => {
                      const previous = typeof item.distribution === "object" ? item.distribution : {};
                      return { ...item, distribution: { ...(previous as MonteCarloDistribution), type: event.target.value as MonteCarloDistributionType } };
                    }))}
                  >
                    {distributionOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </label>
                {(["low", "mid", "high"] as const).map((key) => (
                  <label className="editable-field" key={key}>
                    <span>{key === "low" ? "حد پایین" : key === "mid" ? "محتمل" : "حد بالا"}</span>
                    <input
                      type="number"
                      value={variable[key]}
                      step={shockModeOf(variable) === "absolute" ? "1" : "0.01"}
                      onChange={(event) => setDraft(updateVariableAt(draft, index, (item) => ({ ...item, [key]: numberFromInput(event.target.value, item[key]) })))}
                    />
                  </label>
                ))}
              </div>
              <div className="monte-shock-preview" aria-label="واحد شوک">
                <span>{shockModeLabel(variable)}</span>
                <b>{formatShockValue(variable, variable.low)}</b>
                <b>{formatShockValue(variable, variable.mid)}</b>
                <b>{formatShockValue(variable, variable.high)}</b>
              </div>
              <p title={variable.sourcePath ?? variable.exposureLogic ?? variable.description}>
                {variable.exposureLogic ?? variable.description}
              </p>
              <small>{distributionLabel(distributionType)}</small>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function SampleRowsTable({ rows, project }: { rows: MonteCarloIterationResult[]; project: Project }) {
  const [page, setPage] = useState(0);
  const pageSize = 8;
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const visible = rows.slice(page * pageSize, page * pageSize + pageSize);

  useEffect(() => {
    setPage(0);
  }, [rows.length]);

  return (
    <section className="panel wide-panel">
      <div className="panel-heading">
        <div><span>Sampled iterations</span><strong>نمونه مسیرها</strong></div>
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
            {visible.map((row) => (
              <tr key={row.iteration}>
                <td>{row.sampleLabel ?? "نمونه منتخب"}</td>
                <td>{formatNumber(row.iteration)}</td>
                <td>{formatMoney(row.npv, project)}</td>
                <td>{formatPercent(row.irr)}</td>
                <td>{formatNumber(row.minDscr)}</td>
                <td>{formatMoney(row.liquidityGap, project)}</td>
                <td className={row.bankabilityFailure ? "risk-cell" : row.invalidReasons.length ? "watch-cell" : "ok-cell"}>
                  {row.invalidReasons.length ? "نیازمند بررسی" : row.bankabilityFailure ? "ریسکی" : "معتبر"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function MonteCarloWorkbench() {
  const { activeScenario, applyMonteCarloSettings, mode, outputs, project, runMonteCarloAsync } = useProject();
  const [draft, setDraft] = useState(() => normalizeSettings(activeScenario.assumptions.monteCarlo));
  const [runState, setRunState] = useState<"idle" | "running" | "saved" | "completed" | "cancelled">("idle");
  const [progress, setProgress] = useState<MonteCarloProgressSnapshot | null>(null);
  const cancelRef = useRef<AbortController | null>(null);
  const result = outputs.monteCarlo;
  const selectedSummary = result?.metricSummaries[draft.selectedMetric ?? "NPV"];
  const activeVariables = draft.variables.filter((variable) => variable.active ?? variable.enabled);
  const heavyRun = draft.iterations >= 5000;

  useEffect(() => {
    setDraft(normalizeSettings(activeScenario.assumptions.monteCarlo));
    setRunState("idle");
    setProgress(null);
  }, [activeScenario.id, activeScenario.assumptions.monteCarlo]);

  const metricCards = useMemo(() => [
    { label: "P5 NPV", value: result?.metricSummaries.NPV.p5, unit: "totalMoney" as SensitivityUnitType },
    { label: "P50 NPV", value: result?.metricSummaries.NPV.p50, unit: "totalMoney" as SensitivityUnitType },
    { label: "P95 NPV", value: result?.metricSummaries.NPV.p95, unit: "totalMoney" as SensitivityUnitType },
    { label: "احتمال NPV مثبت", value: result?.probabilityNpvPositive, unit: "percentage" as SensitivityUnitType },
    { label: "VaR 95% زیان نسبی", value: result?.valueAtRisk95, unit: "totalMoney" as SensitivityUnitType },
    { label: "CVaR 95% زیان نسبی", value: result?.conditionalValueAtRisk95, unit: "totalMoney" as SensitivityUnitType },
    { label: "احتمال نقض DSCR", value: result?.probabilityDscrBelowThreshold, unit: "percentage" as SensitivityUnitType },
    { label: "احتمال Cash Crunch", value: result?.probabilityCashCrunch, unit: "percentage" as SensitivityUnitType },
    { label: "احتمال شکست بانک‌پذیری", value: result?.probabilityBankabilityFailure, unit: "percentage" as SensitivityUnitType },
    { label: "تکرار نامعتبر", value: result?.invalidIterationRate, unit: "percentage" as SensitivityUnitType },
  ], [result]);

  const invalidReasons = useMemo(() => topInvalidReasons(result?.rows ?? []), [result]);

  const runSimulation = async () => {
    const normalized = normalizeSettings(draft);
    setDraft(normalized);
    setRunState("running");
    setProgress({
      running: true,
      completedIterations: 0,
      totalIterations: normalized.iterations,
      elapsedMs: 0,
      estimatedRemainingMs: null,
    });
    const controller = new AbortController();
    cancelRef.current = controller;
    const completed = await runMonteCarloAsync(normalized, {
      signal: controller.signal,
      chunkSize: normalized.iterations >= 5000 ? 5 : 8,
      onProgress: setProgress,
    });
    cancelRef.current = null;
    setRunState(completed ? "completed" : "cancelled");
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
            <span>Monte Carlo risk</span>
            <strong>شبیه‌سازی ریسک تولیدی</strong>
          </div>
          <div className="monte-run-actions">
            <button className="secondary-button" type="button" onClick={saveSettings} disabled={runState === "running"}>ذخیره تنظیمات</button>
            <button className="primary-button" type="button" onClick={runSimulation} disabled={runState === "running"}>
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
                  : result ? `${formatNumber(result.completedIterations)} تکرار` : runState === "cancelled" ? "لغوشده" : "اجرا نشده"}
              </strong>
            </div>
          </article>
          <article>
            <UiIcon name="settings" />
            <div><span>متغیر فعال</span><strong>{formatNumber(activeVariables.length)}</strong></div>
          </article>
          <article>
            <UiIcon name="check" />
            <div><span>Seed</span><strong>{formatNumber(draft.seed, { maximumFractionDigits: 0 })}</strong></div>
          </article>
          <article className="monte-disabled">
            <UiIcon name="lock" />
            <div><span>همبستگی</span><strong>غیرفعال در v1</strong></div>
          </article>
        </div>
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
          <div><span>Controls</span><strong>کنترل اجرای شبیه‌سازی</strong></div>
          <small>{mode === "basic" ? "نمای ساده با کنترل‌های اصلی" : "نمای پیشرفته با جدول متغیرها"}</small>
        </div>
        <div className="monte-control-grid">
          <label className="editable-field">
            <span>Seed</span>
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
                onClick={() => setDraft({ ...draft, iterations: preset })}
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
            اجرای ۵۰۰۰ تکرار ممکن است زمان‌بر باشد؛ برای ادامه از اجرای پس‌زمینه استفاده می‌شود.
          </div>
        ) : null}
      </section>

      <VariableConfiguration
        activeScenario={activeScenario}
        draft={draft}
        outputs={outputs}
        project={project}
        setDraft={setDraft}
      />

      <section className="panel wide-panel">
        <div className="panel-heading">
          <div><span>Correlation</span><strong>وضعیت وابستگی متغیرها</strong></div>
          <small>v1 مستقل</small>
        </div>
        <p className="monte-var-note">{correlationMessage}</p>
      </section>

      {result ? (
        <>
          <QualityWarningsPanel warnings={result.qualityWarnings} />

          <section className="dashboard-kpis compact monte-kpis">
            {metricCards.map((card) => (
              <article key={card.label}>
                <span>{card.label}</span>
                <strong>{formatByUnit(card.value ?? null, card.unit, project)}</strong>
                <small>خروجی موتور واقعی</small>
              </article>
            ))}
          </section>

          <section className="panel wide-panel">
            <div className="panel-heading">
              <div><span>Selected metric</span><strong>{metricTitle(draft.selectedMetric ?? "NPV")}</strong></div>
              <small>میانگین {formatMetricSummaryValue(selectedSummary, "mean", project)} · SE {formatMetricSummaryValue(selectedSummary, "standardError", project)}</small>
            </div>
            <p className="monte-var-note">{result.varConventionDescription}</p>
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
            <div className="monte-chart-grid">
              <HistogramChart result={result} project={project} />
              <CdfChart result={result} project={project} />
              <ScatterChart result={result} project={project} />
              <ContributionChart result={result} />
            </div>
          </section>

          <section className="panel wide-panel">
            <div className="panel-heading">
              <div><span>Assumption provenance</span><strong>ردیابی مفروضات پایه</strong></div>
              <small>خواندنی و غیرقابل ویرایش در این تب</small>
            </div>
            <div className="monte-provenance-grid">
              {result.assumptionProvenance.map((item) => (
                <article key={item.id}>
                  <span>{item.label}</span>
                  <strong>{typeof item.value === "number" ? formatByUnit(item.value, item.unitType ?? "none", project) : item.value}</strong>
                  <small>{item.sourceModule}</small>
                </article>
              ))}
            </div>
          </section>

          <SampleRowsTable rows={result.sampledRows} project={project} />
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

    </div>
  );
}
