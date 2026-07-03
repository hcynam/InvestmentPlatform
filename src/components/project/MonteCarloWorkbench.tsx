"use client";

import { useEffect, useMemo, useState } from "react";
import { formatMoney, formatNumber, formatPercent } from "@/lib/format";
import type {
  MonteCarloAssumptions,
  MonteCarloDistribution,
  MonteCarloDistributionType,
  MonteCarloIterationResult,
  MonteCarloMetric,
  MonteCarloMetricSummary,
  MonteCarloVariable,
  Project,
  SensitivityUnitType,
} from "@/lib/types";
import { useProject } from "@/store/project-context";
import { UiIcon } from "@/components/project/UiIcon";

const correlationMessage = "همبستگی در این نسخه فقط به‌صورت مستقل اجرا می‌شود";

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
            <tr><th>تکرار</th><th>NPV</th><th>IRR</th><th>DSCR</th><th>نقدینگی</th><th>وضعیت</th></tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr key={row.iteration}>
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
  const { activeScenario, applyMonteCarloSettings, mode, outputs, project, runMonteCarlo } = useProject();
  const [draft, setDraft] = useState(() => normalizeSettings(activeScenario.assumptions.monteCarlo));
  const [runState, setRunState] = useState<"idle" | "running" | "saved" | "completed">("idle");
  const result = outputs.monteCarlo;
  const selectedSummary = result?.metricSummaries[draft.selectedMetric ?? "NPV"];
  const activeVariables = draft.variables.filter((variable) => variable.active ?? variable.enabled);

  useEffect(() => {
    setDraft(normalizeSettings(activeScenario.assumptions.monteCarlo));
    setRunState("idle");
  }, [activeScenario.id, activeScenario.assumptions.monteCarlo]);

  const metricCards = useMemo(() => [
    { label: "P5 NPV", value: result?.metricSummaries.NPV.p5, unit: "totalMoney" as SensitivityUnitType },
    { label: "P50 NPV", value: result?.metricSummaries.NPV.p50, unit: "totalMoney" as SensitivityUnitType },
    { label: "P95 NPV", value: result?.metricSummaries.NPV.p95, unit: "totalMoney" as SensitivityUnitType },
    { label: "احتمال NPV مثبت", value: result?.probabilityNpvPositive, unit: "percentage" as SensitivityUnitType },
    { label: "VaR 95% زیان نسبی", value: result?.valueAtRisk95, unit: "totalMoney" as SensitivityUnitType },
    { label: "CVaR 95% زیان نسبی", value: result?.conditionalValueAtRisk95, unit: "totalMoney" as SensitivityUnitType },
    { label: "احتمال شکست بانک‌پذیری", value: result?.probabilityBankabilityFailure, unit: "percentage" as SensitivityUnitType },
    { label: "تکرار نامعتبر", value: result?.invalidIterationRate, unit: "percentage" as SensitivityUnitType },
  ], [result]);

  const runSimulation = () => {
    const normalized = normalizeSettings(draft);
    setDraft(normalized);
    setRunState("running");
    window.setTimeout(() => {
      runMonteCarlo(normalized);
      setRunState("completed");
    }, 0);
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
            <button className="secondary-button" type="button" onClick={saveSettings}>ذخیره تنظیمات</button>
            <button className="primary-button" type="button" onClick={runSimulation} disabled={runState === "running"}>
              {runState === "running" ? "در حال اجرا" : "اجرای شبیه‌سازی"}
            </button>
          </div>
        </div>
        <div className="monte-status-row">
          <article>
            <UiIcon name="risk" />
            <div><span>وضعیت اجرا</span><strong>{result ? `${formatNumber(result.completedIterations)} تکرار` : "اجرا نشده"}</strong></div>
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
        {runState === "running" ? <div className="monte-progress" role="status"><i /><span>محاسبه مسیرهای ریسک در جریان است</span></div> : null}
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
                className={draft.iterations === preset ? "active" : ""}
                type="button"
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
      </section>

      {result ? (
        <>
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
            <div className="monte-chart-grid">
              <HistogramChart result={result} project={project} />
              <CdfChart result={result} project={project} />
              <ScatterChart result={result} project={project} />
              <ContributionChart result={result} />
            </div>
          </section>

          <section className="panel wide-panel">
            <div className="panel-heading">
              <div><span>Quality</span><strong>هشدارهای کیفیت و اعتبار</strong></div>
              <small>{formatNumber(result.qualityWarnings.length)} مورد</small>
            </div>
            <div className="monte-warning-grid">
              {result.qualityWarnings.slice(0, 8).map((item) => (
                <article key={item.id}>
                  <strong>{item.message}</strong>
                  {item.recommendation ? <span>{item.recommendation}</span> : null}
                </article>
              ))}
              {!result.qualityWarnings.length ? <article className="ok"><strong>هشدار کیفیت ثبت نشده است.</strong></article> : null}
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

      <section className="panel wide-panel">
        <div className="panel-heading">
          <div><span>Variables</span><strong>جدول متغیرهای ریسک</strong></div>
          <small>{formatNumber(draft.variables.length)} متغیر</small>
        </div>
        <div className="table-wrap monte-variable-wrap">
          <table>
            <thead>
              <tr><th>فعال</th><th>متغیر</th><th>توزیع</th><th>حد پایین</th><th>محتمل</th><th>حد بالا</th><th>منبع</th><th>منطق اثر</th></tr>
            </thead>
            <tbody>
              {draft.variables.map((variable, index) => (
                <tr key={variable.id ?? variable.name}>
                  <td>
                    <input
                      aria-label={`فعال بودن ${variable.label ?? variable.name}`}
                      checked={variable.active ?? variable.enabled}
                      type="checkbox"
                      onChange={(event) => setDraft(updateVariableAt(draft, index, (item) => ({ ...item, active: event.target.checked, enabled: event.target.checked })))}
                    />
                  </td>
                  <td><strong>{variable.label ?? variable.name}</strong><small>{variable.description}</small></td>
                  <td>
                    <select
                      value={distributionTypeOf(variable)}
                      onChange={(event) => setDraft(updateVariableAt(draft, index, (item) => {
                        const previous = typeof item.distribution === "object" ? item.distribution : {};
                        return { ...item, distribution: { ...(previous as MonteCarloDistribution), type: event.target.value as MonteCarloDistributionType } };
                      }))}
                    >
                      {distributionOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                  </td>
                  {(["low", "mid", "high"] as const).map((key) => (
                    <td key={key}>
                      <input
                        type="number"
                        value={variable[key]}
                        step="0.01"
                        onChange={(event) => setDraft(updateVariableAt(draft, index, (item) => ({ ...item, [key]: numberFromInput(event.target.value, item[key]) })))}
                      />
                    </td>
                  ))}
                  <td><span>{variable.sourceModule ?? "مدل مالی"}</span></td>
                  <td><span>{variable.exposureLogic ?? variable.description}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
