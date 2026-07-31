"use client";

import Link from "next/link";
import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import {
  buildDashboardViewModel,
  dashboardDecisionTone,
  dashboardMetricTone,
  formatDashboardMetric,
  type DashboardDecisionLens,
  type DashboardMetric,
  type DashboardMetricId,
  type DashboardViewModel,
} from "@/lib/dashboard-selectors";
import {
  classNames,
  formatMoney,
  formatNumber,
  formatPercent,
  unitDivisor,
  unitLabel,
} from "@/lib/format";
import type { Project, ScenarioOutputs, ValidationSeverity } from "@/lib/types";
import { useProject } from "@/store/project-context";
import { StatusPill } from "@/components/project/PremiumUi";
import { UiIcon } from "@/components/project/UiIcon";

const PRIMARY_METRIC_IDS: DashboardMetricId[] = [
  "project-npv",
  "project-irr",
  "total-capex",
  "discounted-project-payback",
  "minimum-dscr",
  "annual-revenue",
  "annual-ebitda",
  "annual-project-fcff",
];

const metricStatusLabel: Record<DashboardMetric["status"], string> = {
  available: "در دسترس",
  incomplete: "ناقص",
  unavailable: "قابل اعمال نیست",
  invalid: "نامعتبر",
  stale: "نتیجه پیشین",
};

const severityLabel: Record<ValidationSeverity, string> = {
  error: "بحرانی",
  warning: "نیازمند توجه",
  info: "اطلاع",
};

const basisLabel = (basis: string) => ({
  nominal: "اسمی / قیمت جاری",
  real: "واقعی / قیمت ثابت",
  "economic-current": "اقتصادی / قیمت جاری",
  "economic-constant": "اقتصادی / قیمت ثابت",
  "not-applicable": "قابل اعمال نیست",
}[basis] ?? basis);

const metricHref = (projectId: string, metric: DashboardMetric) =>
  `/projects/${projectId}/${metric.drilldown.replace(/^\.\.\//, "")}`;

const formatCalculatedAt = (value: string) => {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "زمان محاسبه ثبت نشده";
  return date.toLocaleString("fa-IR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Asia/Tehran",
  });
};

const thresholdText = (metric: DashboardMetric, project: Project) => {
  const threshold = metric.threshold;
  if (!threshold) return "بدون آستانه تصمیم";
  const value = threshold.unit === "money"
    ? formatMoney(threshold.value, project)
    : threshold.unit === "percent"
      ? formatPercent(threshold.value)
      : formatNumber(threshold.value);
  const comparison = threshold.comparison.includes("greater") ? "حداقل" : "حداکثر";
  return `${comparison} ${value}`;
};

const metricInterpretation = (metric: DashboardMetric) => {
  if (metric.status === "stale") return "این مقدار مربوط به محاسبه پیشین است و مبنای تصمیم جاری نیست.";
  if (metric.status !== "available") return metric.reason ?? "خروجی معتبر برای نمایش موجود نیست.";
  if (metric.comparison === "passes") return "معیار تصمیم را تأمین می‌کند.";
  if (metric.comparison === "fails") return "معیار تصمیم را تأمین نمی‌کند و نیازمند اقدام است.";
  return metric.reason ?? "برای تفسیر در کنار روند و مفروضات پروژه بررسی شود.";
};

function SourceTrace({
  owner,
  source,
  scenario,
  period,
  basis,
  calculatedAt,
}: {
  owner: string;
  source: string;
  scenario: string;
  period: string;
  basis: string;
  calculatedAt: string;
}) {
  return (
    <details className="executive-source-trace">
      <summary>منبع و ردیابی</summary>
      <dl>
        <div><dt>مالک محاسبه</dt><dd>{owner}</dd></div>
        <div><dt>ماژول مرجع</dt><dd>{source}</dd></div>
        <div><dt>سناریو</dt><dd>{scenario}</dd></div>
        <div><dt>دوره</dt><dd>{period}</dd></div>
        <div><dt>مبنا</dt><dd>{basisLabel(basis)}</dd></div>
        <div><dt>آخرین محاسبه</dt><dd>{formatCalculatedAt(calculatedAt)}</dd></div>
      </dl>
    </details>
  );
}

function ExecutiveKpiCard({
  metric,
  project,
  scenarioName,
}: {
  metric: DashboardMetric;
  project: Project;
  scenarioName: string;
}) {
  const tone = dashboardMetricTone(metric);
  return (
    <article className={classNames("executive-kpi", tone, metric.status)} data-metric-id={metric.id}>
      <header>
        <span>{metric.title}</span>
        <b>{metricStatusLabel[metric.status]}</b>
      </header>
      <strong className="executive-kpi-value">{formatDashboardMetric(metric, project)}</strong>
      <div className="executive-kpi-meta">
        <span>{metric.periodLabel}</span>
        {metric.threshold ? <span>{thresholdText(metric, project)}</span> : null}
      </div>
      <p>{metricInterpretation(metric)}</p>
      <footer>
        <SourceTrace
          basis={metric.priceBasis}
          calculatedAt={metric.calculatedAt}
          owner={metric.owner}
          period={metric.periodLabel}
          scenario={scenarioName}
          source={metric.sourceTab}
        />
        <Link href={metricHref(project.id, metric)}>مشاهده جزئیات <span aria-hidden="true">←</span></Link>
      </footer>
    </article>
  );
}

function SectionHeading({
  title,
  question,
  aside,
}: {
  title: string;
  question: string;
  aside?: ReactNode;
}) {
  return (
    <header className="executive-section-heading">
      <div>
        <h3>{title}</h3>
        <p>{question}</p>
      </div>
      {aside ? <aside>{aside}</aside> : null}
    </header>
  );
}

function ChartState({ stale, empty }: { stale: boolean; empty: boolean }) {
  if (empty) return <div className="executive-chart-state">داده معتبر برای ترسیم این نمودار موجود نیست.</div>;
  if (stale) return <div className="executive-chart-state warning">نتایج پیشین نمایش داده می‌شوند؛ برای تصمیم معتبر محاسبه مجدد لازم است.</div>;
  return null;
}

type MoneySeries = {
  key: "revenue" | "ebitda" | "projectFcff";
  label: string;
  color: string;
};

function OperatingPerformanceChart({
  view,
  project,
}: {
  view: DashboardViewModel;
  project: Project;
}) {
  const rows = view.annualSeries.filter((row) => row.year > 0);
  const series: MoneySeries[] = [
    { key: "revenue", label: "درآمد", color: "#236a63" },
    { key: "ebitda", label: "EBITDA", color: "#4f6fd6" },
    { key: "projectFcff", label: "FCFF پروژه", color: "#c97a1c" },
  ];
  const width = 920;
  const height = 320;
  const values = series.flatMap((item) => rows.flatMap((row) => {
    const value = row[item.key];
    return typeof value === "number" && Number.isFinite(value) ? [value] : [];
  }));
  const min = values.length ? Math.min(0, ...values) : 0;
  const max = values.length ? Math.max(1, ...values) : 1;
  const span = Math.max(1, max - min);
  const x = (index: number) => 72 + index / Math.max(1, rows.length - 1) * (width - 112);
  const y = (value: number) => 24 + (max - value) / span * (height - 78);
  const ticks = [0, 0.33, 0.66, 1].map((ratio) => max - ratio * span);
  const labelStep = Math.max(1, Math.ceil(rows.length / 8));

  return (
    <div className={classNames("executive-chart", view.context.dirty && "is-stale")}>
      <div className="executive-chart-legend">
        {series.map((item) => <span key={item.key}><i style={{ background: item.color }} />{item.label}</span>)}
        <em>مقیاس: {unitLabel(project)}</em>
      </div>
      <ChartState empty={!values.length} stale={view.context.dirty} />
      {values.length ? (
        <svg aria-label="روند سالانه درآمد، EBITDA و جریان نقد آزاد پروژه" role="img" viewBox={`0 0 ${width} ${height}`}>
          {ticks.map((tick) => (
            <g key={tick}>
              <line className="chart-grid-line" x1="72" x2={width - 40} y1={y(tick)} y2={y(tick)} />
              <text className="chart-axis-label" textAnchor="end" x="62" y={y(tick) + 4}>{formatNumber(tick / unitDivisor(project), { maximumFractionDigits: 1 })}</text>
            </g>
          ))}
          {series.map((item) => {
            const points = rows.flatMap((row, index) => {
              const value = row[item.key];
              return typeof value === "number" && Number.isFinite(value) ? [`${x(index)},${y(value)}`] : [];
            }).join(" ");
            return (
              <g key={item.key}>
                <polyline fill="none" points={points} stroke={item.color} strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" />
                {rows.map((row, index) => {
                  const value = row[item.key];
                  if (typeof value !== "number" || !Number.isFinite(value)) return null;
                  return <circle fill={item.color} key={`${item.key}-${row.year}`} r="3.5" cx={x(index)} cy={y(value)}><title>{`${item.label}، سال ${formatNumber(row.year)}: ${formatMoney(value, project)}`}</title></circle>;
                })}
              </g>
            );
          })}
          {rows.map((row, index) => index % labelStep === 0 || index === rows.length - 1
            ? <text className="chart-axis-label" key={row.year} textAnchor="middle" x={x(index)} y={height - 16}>{formatNumber(row.year)}</text>
            : null)}
        </svg>
      ) : null}
    </div>
  );
}

function ValueCreationChart({
  rows,
  payback,
  project,
  stale,
}: {
  rows: ScenarioOutputs["valuation"]["annualRows"];
  payback: DashboardMetric;
  project: Project;
  stale: boolean;
}) {
  const data = rows;
  const width = 920;
  const height = 330;
  const values = data.flatMap((row) => [row.fcff, row.discountedFcff, row.cumulativeDiscountedFcff]).filter(Number.isFinite);
  const min = values.length ? Math.min(0, ...values) : 0;
  const max = values.length ? Math.max(1, ...values) : 1;
  const span = Math.max(1, max - min);
  const x = (index: number) => 70 + index / Math.max(1, data.length - 1) * (width - 108);
  const y = (value: number) => 22 + (max - value) / span * (height - 76);
  const barWidth = Math.max(3, Math.min(12, (width - 140) / Math.max(1, data.length) / 3));
  const paybackX = payback.status === "available" && payback.value !== null && data.length
    ? x(Math.max(0, Math.min(data.length - 1, payback.value)))
    : null;
  const labelStep = Math.max(1, Math.ceil(data.length / 8));

  return (
    <div className={classNames("executive-chart", stale && "is-stale")}>
      <div className="executive-chart-legend">
        <span><i style={{ background: "#236a63" }} />FCFF سالانه</span>
        <span><i style={{ background: "#4f6fd6" }} />FCFF تنزیل‌شده</span>
        <span><i style={{ background: "#c97a1c" }} />تجمعی تنزیل‌شده</span>
        <em>مقیاس: {unitLabel(project)}</em>
      </div>
      <ChartState empty={!values.length} stale={stale} />
      {values.length ? (
        <svg aria-label="جریان نقد آزاد، جریان نقد تنزیل‌شده و بازیافت تجمعی سرمایه" role="img" viewBox={`0 0 ${width} ${height}`}>
          <line className="chart-zero-line" x1="64" x2={width - 34} y1={y(0)} y2={y(0)} />
          {data.map((row, index) => (
            <g key={row.year}>
              <rect fill="#236a63" opacity="0.78" x={x(index) - barWidth - 1} y={Math.min(y(row.fcff), y(0))} width={barWidth} height={Math.max(1, Math.abs(y(row.fcff) - y(0)))}><title>{`FCFF سال ${formatNumber(row.year)}: ${formatMoney(row.fcff, project)}`}</title></rect>
              <rect fill="#4f6fd6" opacity="0.78" x={x(index) + 1} y={Math.min(y(row.discountedFcff), y(0))} width={barWidth} height={Math.max(1, Math.abs(y(row.discountedFcff) - y(0)))}><title>{`FCFF تنزیل‌شده سال ${formatNumber(row.year)}: ${formatMoney(row.discountedFcff, project)}`}</title></rect>
              {index % labelStep === 0 || index === data.length - 1 ? <text className="chart-axis-label" textAnchor="middle" x={x(index)} y={height - 14}>{formatNumber(row.year)}</text> : null}
            </g>
          ))}
          <polyline fill="none" points={data.map((row, index) => `${x(index)},${y(row.cumulativeDiscountedFcff)}`).join(" ")} stroke="#c97a1c" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" />
          {data.map((row, index) => <circle fill="#c97a1c" key={row.year} r="3" cx={x(index)} cy={y(row.cumulativeDiscountedFcff)}><title>{`جریان تجمعی تنزیل‌شده سال ${formatNumber(row.year)}: ${formatMoney(row.cumulativeDiscountedFcff, project)}`}</title></circle>)}
          {paybackX !== null ? <g className="payback-marker"><line x1={paybackX} x2={paybackX} y1="18" y2={height - 36} /><text textAnchor="middle" x={paybackX} y="14">نقطه بازگشت تنزیل‌شده</text></g> : null}
        </svg>
      ) : null}
      {payback.status !== "available" ? <p className="executive-inline-notice">بازگشت تنزیل‌شده در افق مدل محقق نشده یا قابل محاسبه نیست؛ نشانگر اجباری نمایش داده نمی‌شود.</p> : null}
    </div>
  );
}

function ConstructionFundingChart({
  rows,
  fundingGap,
  project,
  stale,
}: {
  rows: ScenarioOutputs["construction"]["rows"];
  fundingGap: DashboardMetric;
  project: Project;
  stale: boolean;
}) {
  const data = rows;
  const width = 920;
  const height = 300;
  const values = data.flatMap((row) => [row.adjustedCapex, row.debtDrawdown, row.equityInjection]).filter(Number.isFinite);
  const max = values.length ? Math.max(1, ...values) : 1;
  const x = (index: number) => 58 + index / Math.max(1, data.length - 1) * (width - 92);
  const y = (value: number) => 20 + (max - value) / max * (height - 66);
  const barWidth = Math.max(2, Math.min(9, (width - 120) / Math.max(1, data.length) / 4));
  const labelStep = Math.max(1, Math.ceil(data.length / 10));

  return (
    <div className={classNames("executive-chart", stale && "is-stale")}>
      <div className="executive-chart-legend">
        <span><i style={{ background: "#b64a58" }} />CAPEX تعدیل‌شده</span>
        <span><i style={{ background: "#4f6fd6" }} />برداشت بدهی</span>
        <span><i style={{ background: "#236a63" }} />تزریق آورده</span>
        <em>دوره‌های ساخت · {unitLabel(project)}</em>
      </div>
      <ChartState empty={!values.length} stale={stale} />
      {values.length ? (
        <svg aria-label="تطابق زمانی هزینه ساخت، برداشت بدهی و تزریق آورده" role="img" viewBox={`0 0 ${width} ${height}`}>
          <line className="chart-grid-line" x1="52" x2={width - 28} y1={height - 42} y2={height - 42} />
          {data.map((row, index) => (
            <g key={row.monthNumber}>
              <rect fill="#b64a58" x={x(index) - barWidth * 1.6} y={y(row.adjustedCapex)} width={barWidth} height={Math.max(1, height - 42 - y(row.adjustedCapex))}><title>{`CAPEX دوره ${formatNumber(row.monthNumber)}: ${formatMoney(row.adjustedCapex, project)}`}</title></rect>
              <rect fill="#4f6fd6" x={x(index) - barWidth * 0.5} y={y(row.debtDrawdown)} width={barWidth} height={Math.max(1, height - 42 - y(row.debtDrawdown))}><title>{`برداشت بدهی دوره ${formatNumber(row.monthNumber)}: ${formatMoney(row.debtDrawdown, project)}`}</title></rect>
              <rect fill="#236a63" x={x(index) + barWidth * 0.6} y={y(row.equityInjection)} width={barWidth} height={Math.max(1, height - 42 - y(row.equityInjection))}><title>{`تزریق آورده دوره ${formatNumber(row.monthNumber)}: ${formatMoney(row.equityInjection, project)}`}</title></rect>
              {index % labelStep === 0 || index === data.length - 1 ? <text className="chart-axis-label" textAnchor="middle" x={x(index)} y={height - 14}>{formatNumber(row.monthNumber)}</text> : null}
            </g>
          ))}
        </svg>
      ) : null}
      <div className={classNames("funding-gap-summary", dashboardMetricTone(fundingGap))}>
        <div><span>{fundingGap.title}</span><strong>{formatDashboardMetric(fundingGap, project)}</strong></div>
        <p>{metricInterpretation(fundingGap)}</p>
        <Link href={metricHref(project.id, fundingGap)}>جریان نقد ساخت</Link>
      </div>
    </div>
  );
}

function DebtServiceChart({
  rows,
  targetMetric,
  project,
  stale,
}: {
  rows: ScenarioOutputs["financing"]["annualSchedule"];
  targetMetric: DashboardMetric;
  project: Project;
  stale: boolean;
}) {
  const data = rows.filter((row) => row.debtService > 0 || row.endingBalance > 0);
  const target = targetMetric.threshold?.value ?? null;
  const width = 920;
  const height = 310;
  const moneyMax = data.length ? Math.max(1, ...data.flatMap((row) => [row.cfads, row.debtService])) : 1;
  const ratioValues = data.flatMap((row) => row.dscr === null || !Number.isFinite(row.dscr) ? [] : [row.dscr]);
  const ratioMax = Math.max(1.5, target ?? 0, ...ratioValues);
  const x = (index: number) => 72 + index / Math.max(1, data.length - 1) * (width - 116);
  const moneyY = (value: number) => 24 + (moneyMax - value) / moneyMax * (height - 76);
  const ratioY = (value: number) => 24 + (ratioMax - value) / ratioMax * (height - 76);
  const barWidth = Math.max(6, Math.min(18, (width - 150) / Math.max(1, data.length) / 3));
  const breachYears = target === null ? [] : data.filter((row) => row.dscr !== null && row.dscr < target).map((row) => row.year);

  return (
    <div className={classNames("executive-chart", stale && "is-stale")}>
      <div className="executive-chart-legend">
        <span><i style={{ background: "#236a63" }} />CFADS</span>
        <span><i style={{ background: "#788492" }} />خدمت بدهی</span>
        <span><i style={{ background: "#4f6fd6" }} />DSCR</span>
        <span><i className="legend-line" style={{ background: "#b64a58" }} />هدف تأمین مالی</span>
      </div>
      <ChartState empty={!data.length} stale={stale} />
      {data.length ? (
        <svg aria-label="پوشش سالانه خدمت بدهی و نسبت DSCR" role="img" viewBox={`0 0 ${width} ${height}`}>
          <line className="chart-grid-line" x1="62" x2={width - 38} y1={height - 44} y2={height - 44} />
          {target !== null ? <g className="target-line"><line x1="62" x2={width - 38} y1={ratioY(target)} y2={ratioY(target)} /><text x={width - 40} y={ratioY(target) - 6}>هدف {formatNumber(target)}</text></g> : null}
          {data.map((row, index) => (
            <g key={row.year}>
              <rect fill="#236a63" x={x(index) - barWidth - 1} y={moneyY(row.cfads)} width={barWidth} height={Math.max(1, height - 44 - moneyY(row.cfads))}><title>{`CFADS سال ${formatNumber(row.year)}: ${formatMoney(row.cfads, project)}`}</title></rect>
              <rect fill="#788492" x={x(index) + 1} y={moneyY(row.debtService)} width={barWidth} height={Math.max(1, height - 44 - moneyY(row.debtService))}><title>{`خدمت بدهی سال ${formatNumber(row.year)}: ${formatMoney(row.debtService, project)}`}</title></rect>
              <text className={classNames("chart-axis-label", breachYears.includes(row.year) && "is-breach")} textAnchor="middle" x={x(index)} y={height - 15}>{formatNumber(row.year)}</text>
            </g>
          ))}
          <polyline fill="none" points={data.flatMap((row, index) => row.dscr === null ? [] : [`${x(index)},${ratioY(row.dscr)}`]).join(" ")} stroke="#4f6fd6" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" />
          {data.map((row, index) => row.dscr === null ? null : <circle className={breachYears.includes(row.year) ? "dscr-breach" : ""} fill="#4f6fd6" key={row.year} r="4" cx={x(index)} cy={ratioY(row.dscr)}><title>{`DSCR سال ${formatNumber(row.year)}: ${formatNumber(row.dscr)}`}</title></circle>)}
        </svg>
      ) : null}
      <p className={classNames("executive-inline-notice", breachYears.length > 0 && "danger")}>
        {breachYears.length
          ? `سال‌های نقض هدف DSCR: ${breachYears.map((year) => formatNumber(year)).join("، ")}`
          : "در برنامه فعلی، نقض هدف DSCR در سال‌های خدمت بدهی مشاهده نمی‌شود."}
      </p>
    </div>
  );
}

type ExecutiveException = {
  id: string;
  severity: ValidationSeverity;
  title: string;
  impact: string;
  action: string;
  href: string;
};

const exceptionFromMetric = (
  projectId: string,
  metric: DashboardMetric,
  title: string,
  action: string,
): ExecutiveException => ({
  id: metric.id,
  severity: metric.status === "invalid" ? "error" : "warning",
  title,
  impact: metric.reason ?? metricInterpretation(metric),
  action,
  href: metricHref(projectId, metric),
});

const buildExecutiveExceptions = (view: DashboardViewModel): ExecutiveException[] => {
  const issues: ExecutiveException[] = [];
  if (view.context.dirty) {
    issues.push({
      id: "stale-results",
      severity: "error",
      title: "نتایج با ورودی‌های جاری همگام نیستند",
      impact: "نتیجه تصمیم و رنگ‌های وضعیت تا محاسبه مجدد قابل اتکا نیستند.",
      action: "مدل را محاسبه مجدد کنید.",
      href: "#executive-recalculate",
    });
  }
  const npv = view.metrics["project-npv"];
  const irr = view.metrics["project-irr"];
  const payback = view.metrics["discounted-project-payback"];
  const dscr = view.metrics["minimum-dscr"];
  const funding = view.metrics["funding-gap"];
  if (npv.status === "invalid") issues.push(exceptionFromMetric(view.context.projectId, npv, "NPV پروژه نامعتبر است", "ورودی‌ها و اعتبارسنجی DCF را بازبینی کنید."));
  if (irr.status === "invalid" || irr.status === "unavailable") issues.push(exceptionFromMetric(view.context.projectId, irr, "IRR قابل اتکا نیست", "الگوی علامت جریان نقد و تشخیص ریشه را بررسی کنید."));
  if (payback.status !== "available" && payback.status !== "stale") issues.push(exceptionFromMetric(view.context.projectId, payback, "بازگشت تنزیل‌شده محقق نشده است", "افق مدل و محرک‌های جریان نقد را بررسی کنید."));
  if (dscr.comparison === "fails") issues.push(exceptionFromMetric(view.context.projectId, dscr, "حداقل DSCR هدف را تأمین نمی‌کند", "ساختار بازپرداخت یا ظرفیت پوشش بدهی را اصلاح کنید."));
  if (funding.comparison === "fails") issues.push(exceptionFromMetric(view.context.projectId, funding, "نیاز تأمین‌نشده ساخت وجود دارد", "زمان‌بندی منابع و مصارف ساخت را هم‌تراز کنید."));
  view.validationIssues.forEach((issue) => {
    issues.push({
      id: `validation-${issue.id}`,
      severity: issue.severity,
      title: issue.message,
      impact: issue.impact ?? "این مورد می‌تواند کیفیت تصمیم یا قابلیت اتکای خروجی را کاهش دهد.",
      action: issue.recommendation ?? "ماژول مبدأ را بررسی و ورودی ناقص را تکمیل کنید.",
      href: issue.module ? `/projects/${view.context.projectId}/${issue.module}` : `/projects/${view.context.projectId}/setup`,
    });
  });
  return issues
    .filter((issue, index, all) => all.findIndex((candidate) => candidate.id === issue.id) === index)
    .toSorted((left, right) => ({ error: 0, warning: 1, info: 2 }[left.severity]) - ({ error: 0, warning: 1, info: 2 }[right.severity]))
    .slice(0, 7);
};

function DecisionLens({ lens }: { lens: DashboardDecisionLens }) {
  return (
    <article className={classNames("executive-lens", dashboardDecisionTone(lens))}>
      <header><span>{lens.id === "financial" ? "توجیه مالی" : lens.id === "bankability" ? "بانک‌پذیری" : "توجیه اقتصادی"}</span><b>{lens.label}</b></header>
      <p>{lens.reason}</p>
    </article>
  );
}

export function ExecutiveDashboard() {
  const { outputs, project, activeScenario, dirty, selectScenario, runCalculation } = useProject();
  const [selectedYear, setSelectedYear] = useState<number | undefined>();
  const view = useMemo(
    () => buildDashboardViewModel(project, activeScenario, outputs, { dirty, operatingYear: selectedYear }),
    [activeScenario, dirty, outputs, project, selectedYear],
  );
  const debtExists = outputs.financing.annualSchedule.some((row) => row.debtService > 0);
  const years = outputs.years.filter((year) => year > 0);
  const exceptions = useMemo(() => buildExecutiveExceptions(view), [view]);
  const economicIssues = view.validationIssues.filter((issue) => issue.module.toLowerCase().includes("economic") || issue.sourceSheet?.includes("Economic"));
  const sensitivityDrivers = useMemo(() => {
    if (dirty || outputs.sensitivity.selectedMetric !== "NPV") return [];
    return outputs.sensitivity.tornado
      .filter((driver) => !["invalid", "notApplicable", "modelError", "noExposure"].includes(driver.status) && Number.isFinite(driver.range))
      .toSorted((left, right) => right.range - left.range)
      .slice(0, 3);
  }, [dirty, outputs.sensitivity]);
  const maxSensitivityRange = Math.max(1, ...sensitivityDrivers.map((driver) => driver.range));
  const monteCarloCurrent = !dirty && outputs.monteCarlo
    && view.metrics["mc-npv-above-threshold"].status === "available";
  const decisionWarning = exceptions[0];
  const nextAction = dirty
    ? "محاسبه مجدد مدل برای فعال‌شدن تصمیم جاری"
    : decisionWarning?.action ?? "پایش سناریو و مفروضات کلیدی در چرخه تصمیم";

  return (
    <main className="executive-cockpit">
      <section className="executive-context" aria-label="زمینه تحلیل">
        <div className="executive-context-identity">
          <span>داشبورد تصمیم سرمایه‌گذاری</span>
          <strong>{project.name}</strong>
        </div>
        <div className="executive-context-controls">
          <label>
            <span>سناریوی فعال</span>
            <select value={activeScenario.id} onChange={(event) => { setSelectedYear(undefined); selectScenario(event.target.value); }}>
              {project.scenarios.map((scenario) => <option key={scenario.id} value={scenario.id}>{scenario.name}</option>)}
            </select>
          </label>
          <label>
            <span>سال گزارش</span>
            <select value={view.context.selectedOperatingYear ?? ""} onChange={(event) => setSelectedYear(Number(event.target.value))}>
              {view.context.selectedOperatingYear === null ? <option value="">سال تثبیت‌شده موجود نیست</option> : null}
              {years.map((year) => <option key={year} value={year}>سال {formatNumber(year)}</option>)}
            </select>
          </label>
        </div>
        <dl className="executive-context-meta">
          <div><dt>دوره</dt><dd>{view.context.periodLabel}</dd></div>
          <div><dt>مبنای مالی</dt><dd>{basisLabel(view.context.calculationBasis)}</dd></div>
          <div><dt>مبنای اقتصادی</dt><dd>{basisLabel(view.context.economicPriceBasis)}</dd></div>
          <div><dt>واحد نمایش</dt><dd>{unitLabel(project)}</dd></div>
          <div><dt>افق تحلیل</dt><dd>{formatNumber(project.modelHorizonYears)} سال</dd></div>
          <div><dt>آخرین محاسبه</dt><dd>{formatCalculatedAt(view.context.calculatedAt)}</dd></div>
        </dl>
        <StatusPill tone={dirty ? "warning" : dashboardDecisionTone(view.decisions.overall)}>{dirty ? "نیازمند محاسبه مجدد" : view.decisions.overall.status === "invalid" ? "محاسبه نامعتبر" : view.decisions.overall.status === "incomplete" ? "تحلیل ناقص" : "نتایج جاری"}</StatusPill>
      </section>

      <section className={classNames("executive-decision-banner", dashboardDecisionTone(view.decisions.overall), dirty && "is-stale")}>
        <div className="executive-decision-primary">
          <span>جمع‌بندی تصمیم اجرایی</span>
          <h2>{view.decisions.overall.label}</h2>
          <p>{view.decisions.overall.reason}</p>
          <div className="executive-decision-action">
            <UiIcon name={dirty ? "risk" : "check"} size={19} />
            <div><span>اقدام پیشنهادی</span><strong>{nextAction}</strong></div>
          </div>
          {dirty ? <button id="executive-recalculate" className="executive-recalculate" type="button" onClick={runCalculation}>محاسبه مجدد مدل</button> : null}
        </div>
        <div className="executive-lenses" aria-label="لنزهای تصمیم">
          <DecisionLens lens={view.decisions.financial} />
          <DecisionLens lens={view.decisions.bankability} />
          <DecisionLens lens={view.decisions.economic} />
        </div>
        <div className="executive-decision-warning">
          <span>مهم‌ترین هشدار</span>
          <strong>{decisionWarning?.title ?? "هشدار بحرانی فعالی ثبت نشده است"}</strong>
          <p>{decisionWarning?.impact ?? "کنترل‌های جاری مدل برای خروجی‌های اصلی عبور کرده‌اند."}</p>
        </div>
      </section>

      <section className="executive-primary-kpis" aria-labelledby="executive-kpi-title">
        <SectionHeading title="شاخص‌های اصلی تصمیم" question="آیا پروژه از نظر ارزش‌آفرینی، بازده، سرمایه‌گذاری و پوشش بدهی قابل دفاع است؟" aside={<span id="executive-kpi-title">۸ شاخص حاکم‌شده</span>} />
        <div className="executive-kpi-grid">
          {PRIMARY_METRIC_IDS.map((id) => <ExecutiveKpiCard key={id} metric={view.metrics[id]} project={project} scenarioName={view.context.scenarioName} />)}
        </div>
      </section>

      <div className="executive-analysis-grid">
        <section className="executive-panel executive-operating-panel">
          <SectionHeading title="عملکرد عملیاتی و جریان نقد" question="آیا رشد درآمد به سودآوری عملیاتی و جریان نقد آزاد تبدیل می‌شود؟" aside={<StatusPill tone="info">مبنای {basisLabel(view.context.calculationBasis)}</StatusPill>} />
          <OperatingPerformanceChart project={project} view={view} />
          <SourceTrace owner="DCF valuation and financial statements engines" source="DCF-Valuation17 / FinancialStatements16" scenario={view.context.scenarioName} period={`سال ۱ تا ${project.modelHorizonYears}`} basis={view.context.calculationBasis} calculatedAt={view.context.calculatedAt} />
        </section>

        <section className="executive-panel executive-value-panel">
          <SectionHeading title="ارزش‌آفرینی و بازگشت سرمایه" question="پروژه چه زمانی سرمایه را بازیابی می‌کند و وارد ناحیه خلق ارزش می‌شود؟" aside={<StatusPill tone={dashboardMetricTone(view.metrics["discounted-project-payback"])}>{metricStatusLabel[view.metrics["discounted-project-payback"].status]}</StatusPill>} />
          <ValueCreationChart rows={outputs.valuation.annualRows} payback={view.metrics["discounted-project-payback"]} project={project} stale={dirty} />
          <SourceTrace owner="DCF valuation engine" source="DCF-Valuation17" scenario={view.context.scenarioName} period={`سال ۰ تا ${project.modelHorizonYears}`} basis={view.context.calculationBasis} calculatedAt={view.context.calculatedAt} />
        </section>

        <section className="executive-panel executive-funding-panel">
          <SectionHeading title="تأمین مالی دوره ساخت" question="آیا منابع متعهد با زمان‌بندی نیازهای ساخت هم‌راستا هستند؟" aside={<Link className="executive-section-link" href={`/projects/${project.id}/construction-cashflow`}>جریان نقد ساخت</Link>} />
          <ConstructionFundingChart rows={outputs.construction.rows} fundingGap={view.metrics["funding-gap"]} project={project} stale={dirty} />
          <SourceTrace owner="CAPEX, construction cash-flow and financing engines" source="Capex12 / ConstructionCashFlow / Financing14" scenario={view.context.scenarioName} period="دوره ساخت" basis="nominal" calculatedAt={view.context.calculatedAt} />
        </section>

        <section className="executive-panel executive-debt-panel">
          <SectionHeading title="خدمت بدهی و DSCR" question="آیا پروژه در تمام دوره تأمین مالی توان ایفای تعهدات بدهی را دارد؟" aside={<Link className="executive-section-link" href={`/projects/${project.id}/financing`}>تأمین مالی</Link>} />
          {debtExists ? (
            <DebtServiceChart rows={outputs.financing.annualSchedule} targetMetric={view.metrics["minimum-dscr"]} project={project} stale={dirty} />
          ) : (
            <div className="executive-na-state"><UiIcon name="lock" size={22} /><div><strong>قابل اعمال نیست</strong><p>در افق مدل خدمت بدهی وجود ندارد؛ DSCR و هشدار نقض covenant نمایش داده نمی‌شود.</p></div></div>
          )}
          <SourceTrace owner="Financing and statements DSCR schedule" source="Financing14 / FinancialStatements16" scenario={view.context.scenarioName} period="سال‌های دارای خدمت بدهی" basis="not-applicable" calculatedAt={view.context.calculatedAt} />
        </section>

        <section className="executive-panel executive-economic-panel">
          <SectionHeading title="توجیه اقتصادی" question="آیا پروژه مستقل از بازده مالی خصوصی، برای اقتصاد ملی ارزش ایجاد می‌کند؟" aside={<StatusPill tone={dashboardDecisionTone(view.decisions.economic)}>{view.decisions.economic.label}</StatusPill>} />
          <div className="executive-economic-metrics">
            {(["enpv", "eirr", "ebcr"] as DashboardMetricId[]).map((id) => <ExecutiveKpiCard key={id} metric={view.metrics[id]} project={project} scenarioName={view.context.scenarioName} />)}
          </div>
          <p className="executive-lens-explanation">{view.decisions.economic.reason}</p>
          {economicIssues.length ? <ul className="executive-quality-list">{economicIssues.slice(0, 3).map((issue) => <li key={issue.id}>{issue.message}</li>)}</ul> : null}
          <Link className="executive-section-link" href={`/projects/${project.id}/economic-analysis`}>مشاهده تحلیل اقتصادی</Link>
        </section>

        <section className="executive-panel executive-risk-panel">
          <SectionHeading title="ریسک و سناریو" question="کدام محرک‌ها بیشترین فشار را بر ارزش پروژه وارد می‌کنند و دامنه عدم‌قطعیت چیست؟" aside={<StatusPill tone={dirty ? "warning" : "neutral"}>{dirty ? "نتایج پیشین پنهان شده" : view.context.scenarioName}</StatusPill>} />
          {sensitivityDrivers.length ? (
            <div className="executive-sensitivity-drivers">
              <h4>سه محرک اصلی حساسیت NPV</h4>
              {sensitivityDrivers.map((driver) => <div key={driver.variableId}><span>{driver.variable}</span><i style={{ "--driver-width": `${driver.range / maxSensitivityRange * 100}%` } as CSSProperties} /><strong>{formatMoney(driver.range, project)}</strong></div>)}
              <Link href={`/projects/${project.id}/sensitivity`}>جزئیات حساسیت</Link>
            </div>
          ) : <div className="executive-na-state compact"><UiIcon name="risk" size={20} /><div><strong>خلاصه حساسیت NPV در دسترس نیست</strong><p>{dirty ? "نتایج ریسک تا محاسبه مجدد به‌عنوان جاری نمایش داده نمی‌شوند." : "خروجی جاری حساسیت برای NPV معتبر یا فعال نیست."}</p></div></div>}
          {monteCarloCurrent ? (
            <div className="executive-probabilities">
              {(["mc-npv-above-threshold", "mc-irr-above-hurdle", "mc-dscr-below-target"] as DashboardMetricId[]).map((id) => {
                const metric = view.metrics[id];
                return <article key={id}><span>{metric.title}</span><strong>{formatDashboardMetric(metric, project)}</strong><small>{metric.threshold ? thresholdText(metric, project) : metric.reason}</small></article>;
              })}
              <Link href={`/projects/${project.id}/monte-carlo`}>جزئیات مونت‌کارلو</Link>
            </div>
          ) : <p className="executive-inline-notice">نتیجه جاری و معتبر مونت‌کارلو برای این سناریو موجود نیست؛ احتمال‌های قدیمی نمایش داده نمی‌شوند.</p>}
          <SourceTrace owner="Sensitivity and Monte Carlo engines" source="Sensitivity19 / MonteCarlo20" scenario={view.context.scenarioName} period="افق کامل مدل / اجرای شبیه‌سازی" basis={view.context.calculationBasis} calculatedAt={view.context.calculatedAt} />
        </section>
      </div>

      <section className="executive-panel executive-exceptions-panel">
        <SectionHeading title="استثناها و اقدامات مدیریتی" question="کدام مسائل باید پیش از تصمیم یا تصویب بعدی برطرف شوند؟" aside={<StatusPill tone={exceptions.some((issue) => issue.severity === "error") ? "danger" : exceptions.length ? "warning" : "success"}>{formatNumber(exceptions.length)} مورد</StatusPill>} />
        {exceptions.length ? (
          <div className="executive-exception-table" role="table" aria-label="استثناها و اقدامات مدیریتی">
            <div className="executive-exception-head" role="row"><span>شدت</span><span>موضوع و اثر</span><span>اقدام پیشنهادی</span><span>مسیر پیگیری</span></div>
            {exceptions.map((issue) => <div className={classNames("executive-exception-row", issue.severity)} key={issue.id} role="row"><span><b>{severityLabel[issue.severity]}</b></span><span><strong>{issue.title}</strong><small>{issue.impact}</small></span><span>{issue.action}</span><span><Link href={issue.href}>پیگیری <span aria-hidden="true">←</span></Link></span></div>)}
          </div>
        ) : <div className="executive-na-state compact success"><UiIcon name="check" size={20} /><div><strong>استثنای فعالی ثبت نشده است</strong><p>کنترل‌های جاری مدل برای خروجی‌های اصلی عبور کرده‌اند.</p></div></div>}
      </section>
    </main>
  );
}
