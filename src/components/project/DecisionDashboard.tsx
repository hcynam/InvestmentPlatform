"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  buildDashboardViewModel,
  dashboardDecisionTone,
  dashboardMetricTone,
  formatDashboardMetric,
  type DashboardAnnualSeriesRow,
  type DashboardMetric,
  type DashboardMetricId,
} from "@/lib/dashboard-selectors";
import { formatMoney, formatNumber, formatPercent } from "@/lib/format";
import type { ModuleSlug } from "@/lib/types";
import { useProject } from "@/store/project-context";
import {
  DashboardSection,
  GlassMetricCard,
  PremiumTableShell,
  StatusPill,
} from "@/components/project/PremiumUi";

function LineChart({
  rows,
  series,
}: {
  rows: DashboardAnnualSeriesRow[];
  series: { key: keyof Pick<DashboardAnnualSeriesRow, "revenue" | "ebitda" | "netProfit" | "projectFcff">; label: string; color: string }[];
}) {
  const width = 760;
  const height = 260;
  const data = rows.filter((row) => row.year > 0).slice(0, 12);
  const values = series
    .flatMap((item) => data.map((row) => row[item.key]))
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const min = values.length ? Math.min(0, ...values) : 0;
  const max = values.length ? Math.max(1, ...values) : 1;
  const x = (index: number) => 28 + index / Math.max(1, data.length - 1) * (width - 56);
  const y = (value: number) => 20 + (max - value) / Math.max(1, max - min) * (height - 54);

  return (
    <div className="chart-frame premium-chart-frame">
      <div className="chart-legend">
        {series.map((item) => <span key={item.label}><i style={{ background: item.color }} />{item.label}</span>)}
      </div>
      <svg aria-label="روند مالی سالانه" className="decision-line-chart" role="img" viewBox={`0 0 ${width} ${height}`}>
        {[0.2, 0.5, 0.8].map((position) => (
          <line key={position} x1="28" x2={width - 28} y1={height * position} y2={height * position} stroke="rgba(148, 163, 184, 0.22)" />
        ))}
        {series.map((item) => {
          const points = data.flatMap((row, index) => {
            const value = row[item.key];
            return typeof value === "number" && Number.isFinite(value) ? [`${x(index)},${y(value)}`] : [];
          }).join(" ");
          return points ? <polyline fill="none" key={item.label} points={points} stroke={item.color} strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" /> : null;
        })}
        {data.map((row, index) => <text fill="#94a3b8" fontSize="11" key={row.year} textAnchor="middle" x={x(index)} y={height - 8}>{row.year}</text>)}
      </svg>
    </div>
  );
}

function DashboardControls({
  selectedYear,
  onYearChange,
  onScenarioChange,
  years,
  label = "سال تحلیل",
}: {
  selectedYear: number | null;
  onYearChange: (year: number) => void;
  onScenarioChange: () => void;
  years: number[];
  label?: string;
}) {
  const { project, activeScenario, selectScenario } = useProject();
  return (
    <section className="dashboard-controls premium-dashboard-controls">
      <label>
        <span>سناریو</span>
        <select
          value={activeScenario.id}
          onChange={(event) => {
            onScenarioChange();
            selectScenario(event.target.value);
          }}
        >
          {project.scenarios.map((scenario) => <option key={scenario.id} value={scenario.id}>{scenario.name}</option>)}
        </select>
      </label>
      <label>
        <span>{label}</span>
        <select value={selectedYear ?? ""} onChange={(event) => onYearChange(Number(event.target.value))}>
          {selectedYear === null ? <option value="">سال تثبیت‌شده موجود نیست</option> : null}
          {years.map((year) => <option key={year} value={year}>سال {formatNumber(year)}</option>)}
        </select>
      </label>
    </section>
  );
}

const metricNote = (metric: DashboardMetric) => {
  if (metric.reason) return metric.reason;
  if (metric.threshold) return `${metric.periodLabel} · آستانه ${formatNumber(metric.threshold.value)}`;
  return `${metric.periodLabel} · ${metric.sourceTab}`;
};

function MetricCards({
  ids,
  metrics,
  project,
}: {
  ids: DashboardMetricId[];
  metrics: Record<DashboardMetricId, DashboardMetric>;
  project: ReturnType<typeof useProject>["project"];
}) {
  return (
    <>
      {ids.map((id) => {
        const metric = metrics[id];
        return (
          <GlassMetricCard
            key={id}
            label={metric.title}
            value={formatDashboardMetric(metric, project)}
            note={metricNote(metric)}
            tone={dashboardMetricTone(metric)}
            badge={metric.status === "stale" ? "قدیمی" : metric.status === "available" ? undefined : metric.status}
          />
        );
      })}
    </>
  );
}

function ExecutiveDashboard() {
  const { outputs, project, activeScenario, dirty } = useProject();
  const [selectedYear, setSelectedYear] = useState<number | undefined>();
  const view = useMemo(
    () => buildDashboardViewModel(project, activeScenario, outputs, { dirty, operatingYear: selectedYear }),
    [activeScenario, dirty, outputs, project, selectedYear],
  );
  const decision = view.decisions.overall;
  const years = outputs.years.filter((year) => year > 0);

  return (
    <div className="dashboard-layout premium-dashboard executive-dashboard">
      <DashboardControls
        selectedYear={view.context.selectedOperatingYear}
        onYearChange={setSelectedYear}
        onScenarioChange={() => setSelectedYear(undefined)}
        years={years}
      />

      <section className="premium-dashboard-hero executive-hero">
        <div>
          <span>Executive Decision Foundation</span>
          <h3>{project.name}</h3>
          <p>{decision.reason}</p>
          <div className="hero-pill-row">
            <StatusPill tone={dashboardDecisionTone(decision)}>{decision.label}</StatusPill>
            <StatusPill tone="info">سناریو: {view.context.scenarioName}</StatusPill>
            <StatusPill tone={dirty ? "warning" : "neutral"}>{view.context.periodLabel}</StatusPill>
            <StatusPill tone="neutral">مبنای {view.context.calculationBasis}</StatusPill>
          </div>
        </div>
        <div className="hero-score-card">
          <span>وضعیت محاسبه</span>
          <strong>{dirty ? "قدیمی" : "جاری"}</strong>
          <small>{view.context.calculatedAt}</small>
        </div>
      </section>

      <section className="glass-metric-grid executive-metric-grid">
        <MetricCards
          ids={[
            "project-npv",
            "project-irr",
            "project-payback",
            "discounted-project-payback",
            "total-capex",
            "annual-revenue",
            "annual-ebitda",
            "annual-net-profit",
            "annual-project-fcff",
            "minimum-dscr",
            "funding-gap",
          ]}
          metrics={view.metrics}
          project={project}
        />
      </section>

      <section className="dashboard-two-col premium-two-col">
        <DashboardSection eyebrow="Value Trajectory" title="روند سالانه درآمد، EBITDA و FCFF پروژه" aside={<StatusPill tone="info">مبنای {view.context.calculationBasis}</StatusPill>}>
          <LineChart rows={view.annualSeries} series={[
            { key: "revenue", label: "درآمد", color: "#34d399" },
            { key: "ebitda", label: "EBITDA", color: "#60a5fa" },
            { key: "projectFcff", label: "FCFF پروژه", color: "#fbbf24" },
          ]} />
        </DashboardSection>
        <DashboardSection eyebrow="Decision Lenses" title="تفکیک تصمیم مالی، بانک‌پذیری و اقتصادی">
          <div className="risk-signal-list premium-risk-list">
            {[view.decisions.financial, view.decisions.bankability, view.decisions.economic].map((lens) => (
              <div key={lens.id}>
                <span className={`signal ${dashboardDecisionTone(lens)}`} />
                <div><strong>{lens.label}</strong><small>{lens.reason}</small></div>
              </div>
            ))}
          </div>
        </DashboardSection>
      </section>

      <section className="dashboard-two-col premium-two-col">
        <DashboardSection eyebrow="Economic Lens" title="خروجی‌های مستقل تحلیل اقتصادی">
          <div className="glass-metric-grid">
            <MetricCards ids={["enpv", "eirr", "ebcr"]} metrics={view.metrics} project={project} />
          </div>
        </DashboardSection>
        <DashboardSection eyebrow="Risk Signals" title="اعتبارسنجی‌های مدل" aside={<StatusPill tone={view.validationIssues.length ? "warning" : "success"}>{formatNumber(view.validationIssues.length)} مورد</StatusPill>}>
          <div className="risk-signal-list premium-risk-list">
            {view.validationIssues.slice(0, 5).map((issue) => (
              <div key={issue.id}>
                <span className={`signal ${issue.severity}`} />
                <div><strong>{issue.message}</strong><small>{issue.recommendation ?? issue.impact}</small></div>
              </div>
            ))}
            {!view.validationIssues.length ? <div><span className="signal info" /><div><strong>هشدار فعالی وجود ندارد.</strong><small>کنترل‌های جاری مدل عبور کرده‌اند.</small></div></div> : null}
          </div>
        </DashboardSection>
      </section>
    </div>
  );
}

function BankDashboard() {
  const { outputs, project, activeScenario, dirty } = useProject();
  const [selectedYear, setSelectedYear] = useState<number | undefined>();
  const view = useMemo(
    () => buildDashboardViewModel(project, activeScenario, outputs, { dirty, operatingYear: selectedYear }),
    [activeScenario, dirty, outputs, project, selectedYear],
  );
  const selectedDebtRow = outputs.financing.annualSchedule.find((row) => row.year === view.context.selectedOperatingYear);
  const years = outputs.years.filter((year) => year > 0);

  return (
    <div className="dashboard-layout premium-dashboard bank-dashboard">
      <DashboardControls
        selectedYear={view.context.selectedOperatingYear}
        onYearChange={setSelectedYear}
        onScenarioChange={() => setSelectedYear(undefined)}
        years={years}
        label="سال covenant"
      />
      <section className="premium-dashboard-hero bank-hero">
        <div>
          <span>Credit Committee Cockpit</span>
          <h3>داشبورد اعتبارسنجی بانک</h3>
          <p>{view.decisions.bankability.reason}</p>
          <div className="hero-pill-row">
            <StatusPill tone={dashboardDecisionTone(view.decisions.bankability)}>{view.decisions.bankability.label}</StatusPill>
            <StatusPill tone="info">سناریو: {view.context.scenarioName}</StatusPill>
            <StatusPill tone={dirty ? "warning" : "neutral"}>{dirty ? "محاسبه مجدد لازم است" : "نتایج جاری"}</StatusPill>
          </div>
        </div>
      </section>

      <section className="glass-metric-grid bank-metric-grid">
        <MetricCards ids={["minimum-dscr", "average-dscr", "funding-gap"]} metrics={view.metrics} project={project} />
        <GlassMetricCard label="بدهی کل" value={formatMoney(outputs.financing.kpis.totalDebt, project)} note="مالک: موتور تأمین مالی" tone="neutral" />
        <GlassMetricCard label="نسبت بدهی به آورده" value={formatNumber(outputs.financing.kpis.debtToEquity)} note="مالک: موتور تأمین مالی" tone="neutral" />
        <GlassMetricCard label="پوشش وثیقه" value={formatNumber(outputs.financing.kpis.collateralCoverage)} note="مالک: موتور تأمین مالی" tone="neutral" />
        <GlassMetricCard label="مانده بدهی سال منتخب" value={formatMoney(selectedDebtRow?.endingBalance, project)} note={view.context.periodLabel} tone="neutral" />
      </section>

      <DashboardSection eyebrow="Debt Service" title="برنامه خدمت بدهی و DSCR">
        <PremiumTableShell>
          <table>
            <thead><tr><th>سال</th><th>مانده آغاز</th><th>خدمت بدهی</th><th>CFADS</th><th>DSCR</th><th>مانده پایان</th></tr></thead>
            <tbody>{outputs.financing.annualSchedule.filter((row) => row.debtService > 0 || row.endingBalance > 0).map((row) => (
              <tr key={row.year}>
                <td>{formatNumber(row.year)}</td>
                <td>{formatMoney(row.openingBalance, project)}</td>
                <td>{formatMoney(row.debtService, project)}</td>
                <td>{formatMoney(row.cfads, project)}</td>
                <td>{formatNumber(row.dscr)}</td>
                <td>{formatMoney(row.endingBalance, project)}</td>
              </tr>
            ))}</tbody>
          </table>
        </PremiumTableShell>
      </DashboardSection>
    </div>
  );
}

function ManagementDashboard() {
  const { outputs, project, activeScenario, dirty } = useProject();
  const [selectedYear, setSelectedYear] = useState<number | undefined>();
  const view = useMemo(
    () => buildDashboardViewModel(project, activeScenario, outputs, { dirty, operatingYear: selectedYear }),
    [activeScenario, dirty, outputs, project, selectedYear],
  );
  const selectedStatement = outputs.statements.rows.find((row) => row.year === view.context.selectedOperatingYear);
  const selectedCapacity = outputs.capacity.rows.find((row) => row.year === view.context.selectedOperatingYear);
  const years = outputs.years.filter((year) => year > 0);

  return (
    <div className="dashboard-layout premium-dashboard management-dashboard">
      <DashboardControls
        selectedYear={view.context.selectedOperatingYear}
        onYearChange={setSelectedYear}
        onScenarioChange={() => setSelectedYear(undefined)}
        years={years}
      />
      <section className="premium-dashboard-hero management-hero">
        <div>
          <span>Operational Control Panel</span>
          <h3>داشبورد مدیریت عملکرد</h3>
          <p>شاخص‌های سال صریح انتخاب‌شده مستقیماً از برنامه ظرفیت، صورت‌های مالی و DCF مصرف می‌شوند.</p>
          <div className="hero-pill-row">
            <StatusPill tone={dirty ? "warning" : "success"}>{dirty ? "نتایج قدیمی" : "نتایج جاری"}</StatusPill>
            <StatusPill tone="info">سناریو: {view.context.scenarioName}</StatusPill>
            <StatusPill tone="neutral">{view.context.periodLabel}</StatusPill>
          </div>
        </div>
      </section>

      <section className="glass-metric-grid management-metric-grid">
        <MetricCards ids={["annual-revenue", "annual-ebitda", "annual-net-profit", "annual-project-fcff", "annual-capex"]} metrics={view.metrics} project={project} />
        <GlassMetricCard label="بهره‌برداری ظرفیت" value={formatPercent(selectedCapacity?.utilization)} note={view.context.periodLabel} tone="neutral" />
        <GlassMetricCard label="حاشیه ناخالص" value={formatPercent(selectedStatement?.grossMargin)} note="مالک: موتور صورت‌های مالی" tone="neutral" />
        <GlassMetricCard label="نسبت جاری" value={formatNumber(selectedStatement?.currentRatio)} note="مالک: موتور صورت‌های مالی" tone="neutral" />
        <GlassMetricCard label="نسبت سریع" value={formatNumber(selectedStatement?.quickRatio)} note="مالک: موتور صورت‌های مالی" tone="neutral" />
        <GlassMetricCard label="پوشش بهره" value={formatNumber(selectedStatement?.interestCoverage)} note="مالک: موتور صورت‌های مالی" tone="neutral" />
      </section>

      <DashboardSection eyebrow="Management View" title="روند عملیاتی سالانه">
        <LineChart rows={view.annualSeries} series={[
          { key: "revenue", label: "درآمد", color: "#34d399" },
          { key: "ebitda", label: "EBITDA", color: "#60a5fa" },
          { key: "netProfit", label: "سود خالص", color: "#fb7185" },
        ]} />
      </DashboardSection>
    </div>
  );
}

function OverviewPlaceholder() {
  const { project } = useProject();
  return (
    <section className="panel wide-panel">
      <div className="panel-heading">
        <div><span>Project Overview</span><strong>نمای کلی اختصاصی در مرحله بعد پیاده‌سازی می‌شود</strong></div>
      </div>
      <p className="soft-note">برای جلوگیری از تکرار ناخواسته داشبورد اجرایی، این مسیر فعلاً فقط به سطح تصمیم معتبر ارجاع می‌دهد.</p>
      <Link className="primary-button" href={`/projects/${project.id}/executive`}>مشاهده داشبورد اجرایی</Link>
    </section>
  );
}

export function DecisionDashboard({ slug }: { slug: ModuleSlug }) {
  if (slug === "overview") return <OverviewPlaceholder />;
  if (slug === "dashboard-bank") return <BankDashboard />;
  if (slug === "dashboard-management") return <ManagementDashboard />;
  return <ExecutiveDashboard />;
}
