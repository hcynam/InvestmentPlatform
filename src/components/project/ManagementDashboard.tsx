"use client";

import Link from "next/link";
import { useMemo, useState, type CSSProperties } from "react";
import {
  buildManagementDashboardViewModel,
  formatManagementValue,
  type ManagementDimension,
  type ManagementMetric,
  type ManagementMetricId,
  type ManagementOperatingRow,
  type ManagementStatus,
} from "@/lib/dashboard-selectors";
import { classNames, formatMoney, formatNumber, formatPercent, unitLabel } from "@/lib/format";
import { DashboardSection, PremiumTableShell, StatusPill } from "@/components/project/PremiumUi";
import { useProject } from "@/store/project-context";

const statusLabels: Record<ManagementStatus, string> = {
  ready: "آماده",
  attention: "نیازمند توجه",
  critical: "بحرانی",
  stale: "قدیمی",
  invalid: "نامعتبر",
  unavailable: "ناموجود",
  "not-applicable": "قابل اعمال نیست",
};

const statusTone = (status: ManagementStatus) => {
  if (status === "ready") return "success" as const;
  if (status === "attention" || status === "stale") return "warning" as const;
  if (status === "critical" || status === "invalid") return "danger" as const;
  if (status === "unavailable") return "neutral" as const;
  return "info" as const;
};

const basisLabel = (basis: string) => basis === "real" ? "واقعی / قیمت ثابت" : "اسمی / قیمت جاری";

const calculatedAtLabel = (value: string) => {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? date.toLocaleString("fa-IR", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Tehran" })
    : "ثبت نشده";
};

const managementHref = (projectId: string, drilldown: string) =>
  `/projects/${projectId}/${drilldown.replace(/^\.\.\//, "")}`;

function MetricCard({ metric, projectId }: { metric: ManagementMetric; projectId: string }) {
  const { project } = useProject();
  return (
    <article className={classNames("management-metric-card", metric.status)} data-management-metric={metric.id}>
      <header>
        <span>{metric.label}</span>
        <StatusPill tone={statusTone(metric.status)}>{statusLabels[metric.status]}</StatusPill>
      </header>
      <strong>{formatManagementValue(metric.value, metric.unit, project)}</strong>
      <p>{metric.period}{metric.occurrenceMonth !== null ? ` · ماه ${formatNumber(metric.occurrenceMonth)}` : metric.occurrenceYear !== null ? ` · سال ${formatNumber(metric.occurrenceYear)}` : ""}</p>
      <small>{metric.reason ?? `مالک: ${metric.owner}`}</small>
      <Link href={managementHref(projectId, metric.drilldown)}>مشاهده منبع <span aria-hidden="true">←</span></Link>
    </article>
  );
}

function DimensionCard({ dimension, projectId }: { dimension: ManagementDimension; projectId: string }) {
  return (
    <article className={classNames("management-dimension-card", dimension.status)} data-management-dimension={dimension.id}>
      <header>
        <strong>{dimension.label}</strong>
        <StatusPill tone={statusTone(dimension.status)}>{statusLabels[dimension.status]}</StatusPill>
      </header>
      <p>{dimension.evidence}</p>
      <dl>
        <div><dt>دوره اثر</dt><dd>{dimension.affectedPeriod}</dd></div>
        <div><dt>کد شواهد</dt><dd dir="ltr">{dimension.evidenceCode}</dd></div>
      </dl>
      <footer><span>{dimension.source}</span><Link href={managementHref(projectId, dimension.drilldown)}>پیگیری</Link></footer>
    </article>
  );
}

type TrendKey = "revenue" | "ebitda" | "operatingCashFlow";

function OperatingTrendChart({ rows }: { rows: ManagementOperatingRow[] }) {
  const series: { key: TrendKey; label: string; color: string }[] = [
    { key: "revenue", label: "درآمد", color: "#14b8a6" },
    { key: "ebitda", label: "EBITDA", color: "#3b82f6" },
    { key: "operatingCashFlow", label: "جریان نقد عملیاتی", color: "#f59e0b" },
  ];
  const width = 840;
  const height = 260;
  const values = series.flatMap((item) => rows.map((row) => row[item.key])).filter((value): value is number => value !== null && Number.isFinite(value));
  if (!rows.length || !values.length) return <div className="management-unavailable"><strong>روند عملیاتی موجود نیست</strong><p>سری سالانه معتبر برای ترسیم از موتورهای مبدأ دریافت نشده است.</p></div>;
  const minimum = Math.min(0, ...values);
  const maximum = Math.max(1, ...values);
  const x = (index: number) => 34 + index / Math.max(1, rows.length - 1) * (width - 68);
  const y = (value: number) => 18 + (maximum - value) / Math.max(1, maximum - minimum) * (height - 56);
  return (
    <div className="management-trend-chart">
      <div className="management-chart-legend">{series.map((item) => <span key={item.key}><i style={{ background: item.color }} />{item.label}</span>)}</div>
      <svg role="img" aria-label="روند سالانه درآمد، EBITDA و جریان نقد عملیاتی" viewBox={`0 0 ${width} ${height}`}>
        {[0.2, 0.5, 0.8].map((position) => <line key={position} x1="34" x2={width - 34} y1={height * position} y2={height * position} />)}
        {series.map((item) => {
          const points = rows.flatMap((row, index) => row[item.key] === null ? [] : [`${x(index)},${y(row[item.key] as number)}`]).join(" ");
          return points ? <polyline fill="none" key={item.key} points={points} stroke={item.color} strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" /> : null;
        })}
        {rows.map((row, index) => <text key={row.year} x={x(index)} y={height - 8} textAnchor="middle">{formatNumber(row.year)}</text>)}
      </svg>
    </div>
  );
}

function ConstructionSpendChart({ rows }: { rows: ReturnType<typeof buildManagementDashboardViewModel>["constructionSeries"] }) {
  const maximum = Math.max(0, ...rows.map((row) => row.capex ?? 0), ...rows.map((row) => row.totalOutflow ?? 0));
  if (!rows.length || maximum <= 0) return <div className="management-unavailable"><strong>برنامه ماهانه ساخت موجود نیست</strong><p>خروجی معتبر CAPEX و جریان نقد ماهانه تولید نشده است.</p></div>;
  return (
    <div className="management-construction-chart" role="img" aria-label="CAPEX و خروج نقد ماهانه دوره ساخت">
      <div className="management-chart-legend"><span><i className="capex" />CAPEX</span><span><i className="outflow" />کل خروج نقد</span></div>
      <div className="management-month-bars">
        {rows.map((row) => (
          <div className={classNames("management-month-bar", row.fundingStatus)} key={row.month} title={`ماه ${row.month} · ${row.date}`}>
            <i className="outflow" style={{ "--bar-height": `${(row.totalOutflow ?? 0) / maximum * 100}%` } as CSSProperties} />
            <i className="capex" style={{ "--bar-height": `${(row.capex ?? 0) / maximum * 100}%` } as CSSProperties} />
            <span>{formatNumber(row.month)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const SUMMARY_IDS = ["production", "utilization", "revenue", "opex", "ebitda", "operating-cash-flow", "fcff", "working-capital"] as const;

export function ManagementDashboard() {
  const { outputs, project, activeScenario, dirty, selectScenario, runCalculation } = useProject();
  const [reportingYear, setReportingYear] = useState<number | undefined>();
  const view = useMemo(
    () => buildManagementDashboardViewModel(project, activeScenario, outputs, { dirty, reportingYear }),
    [activeScenario, dirty, outputs, project, reportingYear],
  );
  const reportingYears = outputs.years.toSorted((left, right) => left - right);
  const exceptionTone = view.exceptions.some((issue) => issue.severity === "critical") ? "danger" : view.exceptions.some((issue) => issue.severity === "warning") ? "warning" : "success";

  return (
    <main className="management-cockpit">
      <section className="management-context" aria-label="زمینه و اعتبار نتیجه">
        <div className="management-context-heading">
          <span>Management Cockpit</span>
          <strong>{view.context.projectName}</strong>
          <small>کنترل اجرای مدل، ساخت، راه‌اندازی، عملیات و نقدینگی</small>
        </div>
        <div className="management-context-controls">
          <label><span>سناریوی فعال</span><select value={activeScenario.id} onChange={(event) => { setReportingYear(undefined); selectScenario(event.target.value); }}>{project.scenarios.map((scenario) => <option key={scenario.id} value={scenario.id}>{scenario.name}</option>)}</select></label>
          <label><span>دوره گزارش مدل</span><select value={view.context.reportingYear ?? ""} onChange={(event) => setReportingYear(Number(event.target.value))}>{view.context.reportingYear === null ? <option value="">دوره موجود نیست</option> : null}{reportingYears.map((year) => <option key={year} value={year}>{year === 0 ? "دوره ساخت" : `سال مدل ${formatNumber(year)}`}</option>)}</select></label>
        </div>
        <dl className="management-context-meta">
          <div><dt>مبنای قیمت</dt><dd>{basisLabel(view.context.calculationBasis)}</dd></div>
          <div><dt>ارز و مقیاس</dt><dd>{view.context.baseCurrency} · {unitLabel(project)}</dd></div>
          <div><dt>مرحله مدل</dt><dd>{view.context.modelPhaseLabel}</dd></div>
          <div><dt>دوره گزارش</dt><dd>{view.context.reportingPeriod}</dd></div>
          <div><dt>افق ساخت</dt><dd>{formatNumber(view.context.constructionDurationMonths)} ماه</dd></div>
          <div><dt>افق عملیات</dt><dd>{formatNumber(view.context.operationHorizonYears)} سال</dd></div>
          <div><dt>آخرین محاسبه موفق</dt><dd>{calculatedAtLabel(view.context.calculatedAt)}</dd></div>
          <div><dt>تازگی / دسترس‌پذیری</dt><dd>{view.context.freshness === "fresh" ? "جاری" : "قدیمی"} · {view.context.calculationState === "available" ? "معتبر" : view.context.calculationState === "partial" ? "همراه هشدار" : view.context.calculationState === "error" ? "خطا" : "ناموجود"}</dd></div>
        </dl>
      </section>

      <section className={classNames("management-conclusion", view.conclusion.definitive ? "definitive" : "blocked", view.context.freshness)}>
        <div>
          <span>جمع‌بندی چندبعدی مدیریت</span>
          <h2>{view.conclusion.label}</h2>
          <p>{view.conclusion.reason}</p>
          <div className="management-hero-pills">
            <StatusPill tone={view.conclusion.definitive ? "success" : "warning"}>{view.conclusion.definitive ? "قابل استناد" : "غیرقطعی"}</StatusPill>
            <StatusPill tone="info">سناریو: {view.context.scenarioName}</StatusPill>
            <StatusPill tone="neutral">{view.context.modelPhaseLabel}</StatusPill>
          </div>
        </div>
        <aside>
          <strong>مرز تفسیر</strong>
          <p>همه دوره‌ها برنامه مدل‌شده‌اند. داده پیشرفت واقعی، درصد تکمیل و مقایسه برنامه با عملکرد واقعی در مدل موجود نیست.</p>
          {dirty ? <button id="management-recalculate" type="button" onClick={runCalculation}>محاسبه مجدد مدل</button> : null}
        </aside>
      </section>

      <section className="management-dimensions" aria-labelledby="management-dimensions-title">
        <header><div><span>Independent Controls</span><h3 id="management-dimensions-title">ابعاد مستقل مدیریت</h3></div><p>هیچ امتیاز ترکیبی یا میانگین چراغ راهنمایی ساخته نشده است.</p></header>
        <div>{view.dimensions.map((dimension) => <DimensionCard dimension={dimension} key={dimension.id} projectId={project.id} />)}</div>
      </section>

      <DashboardSection
        className="management-section"
        eyebrow="Implementation & Construction"
        title="کنترل اجرا، ساخت و راه‌اندازی"
        aside={<Link href={`/projects/${project.id}/construction-cashflow`}>جریان نقد ساخت</Link>}
      >
        <div className="management-metric-grid">{(["construction-duration", "peak-construction-capex", "construction-funding-requirement", "construction-credit-line", "peak-construction-deficit", "delay-cost"] as ManagementMetricId[]).map((id) => <MetricCard key={id} metric={view.metrics[id]} projectId={project.id} />)}</div>
        <ConstructionSpendChart rows={view.constructionSeries} />
        <PremiumTableShell className="management-table-shell">
          <table>
            <thead><tr><th>ماه / تاریخ</th><th>مرحله مدل‌شده</th><th>CAPEX</th><th>CAPEX تجمعی</th><th>آورده</th><th>برداشت بدهی</th><th>کسری تأمین مالی</th><th>خروج نقد</th><th>مانده نقد</th><th>وضعیت پوشش</th></tr></thead>
            <tbody>{view.constructionSeries.map((row) => <tr className={`funding-${row.fundingStatus}`} key={row.month}><td><strong>ماه {formatNumber(row.month)}</strong><small>{row.date}</small></td><td>{row.phase}</td><td>{row.capex === null ? "—" : formatMoney(row.capex, project)}</td><td>{row.cumulativeCapex === null ? "—" : formatMoney(row.cumulativeCapex, project)}</td><td>{row.equityDraw === null ? "—" : formatMoney(row.equityDraw, project)}</td><td>{row.debtDraw === null ? "—" : formatMoney(row.debtDraw, project)}</td><td>{row.creditLineDraw === null ? "—" : formatMoney(row.creditLineDraw, project)}</td><td>{row.totalOutflow === null ? "—" : formatMoney(row.totalOutflow, project)}</td><td>{row.endingCash === null ? "—" : formatMoney(row.endingCash, project)}</td><td><StatusPill tone={row.fundingStatus === "uncovered" ? "danger" : "success"}>{row.fundingStatus === "uncovered" ? "پوشش‌نیافته" : "کافی"}</StatusPill></td></tr>)}</tbody>
          </table>
        </PremiumTableShell>
      </DashboardSection>

      <DashboardSection
        className="management-section"
        eyebrow="Operating Ramp-up"
        title="عملکرد عملیاتی و افزایش ظرفیت"
        aside={<Link href={`/projects/${project.id}/capacity-production`}>ظرفیت و تولید</Link>}
      >
        <div className="management-operating-summaries">
          {view.operatingSummaries.filter((summary) => SUMMARY_IDS.includes(summary.id as typeof SUMMARY_IDS[number])).map((summary) => (
            <article className={summary.status} key={summary.id}>
              <header><strong>{summary.label}</strong><StatusPill tone={statusTone(summary.status)}>{statusLabels[summary.status]}</StatusPill></header>
              <dl>
                <div><dt>سال اول</dt><dd>{formatManagementValue(summary.first.value, summary.unit, project)}<small>{summary.first.year === null ? "—" : `سال ${formatNumber(summary.first.year)}`}</small></dd></div>
                <div><dt>سال تثبیت</dt><dd>{formatManagementValue(summary.stabilized.value, summary.unit, project)}<small>{summary.stabilized.year === null ? "—" : `سال ${formatNumber(summary.stabilized.year)}`}</small></dd></div>
                <div><dt>کمینه</dt><dd>{formatManagementValue(summary.minimum.value, summary.unit, project)}<small>{summary.minimum.year === null ? "—" : `سال ${formatNumber(summary.minimum.year)}`}</small></dd></div>
                <div><dt>بیشینه</dt><dd>{formatManagementValue(summary.maximum.value, summary.unit, project)}<small>{summary.maximum.year === null ? "—" : `سال ${formatNumber(summary.maximum.year)}`}</small></dd></div>
              </dl>
              <Link href={managementHref(project.id, summary.drilldown)}>منبع: {summary.source}</Link>
            </article>
          ))}
        </div>
        <OperatingTrendChart rows={view.operatingSeries} />
        <PremiumTableShell className="management-table-shell operating">
          <table>
            <thead><tr><th>سال مدل</th><th>مرحله</th><th>تولید</th><th>استفاده ظرفیت</th><th>فروش</th><th>درآمد</th><th>COGS</th><th>OPEX</th><th>EBITDA</th><th>جریان نقد عملیاتی</th><th>FCFF</th><th>سرمایه در گردش</th></tr></thead>
            <tbody>{view.operatingSeries.map((row) => <tr key={row.year}><td><strong>{formatNumber(row.year)}</strong><small>{row.calendarYear === null ? "" : formatNumber(row.calendarYear)}</small></td><td>{row.phase === "stabilized" ? "تثبیت‌شده" : "افزایش ظرفیت"}</td><td>{row.productionVolume === null ? "—" : formatNumber(row.productionVolume)}</td><td>{row.utilization === null ? "—" : formatPercent(row.utilization)}</td><td>{row.salesVolume === null ? "—" : formatNumber(row.salesVolume)}</td><td>{row.revenue === null ? "—" : formatMoney(row.revenue, project)}</td><td>{row.cogs === null ? "—" : formatMoney(row.cogs, project)}</td><td>{row.opex === null ? "—" : formatMoney(row.opex, project)}</td><td>{row.ebitda === null ? "—" : formatMoney(row.ebitda, project)}</td><td>{row.operatingCashFlow === null ? "—" : formatMoney(row.operatingCashFlow, project)}</td><td>{row.fcff === null ? "—" : formatMoney(row.fcff, project)}</td><td>{row.workingCapital === null ? "—" : formatMoney(row.workingCapital, project)}</td></tr>)}</tbody>
          </table>
        </PremiumTableShell>
      </DashboardSection>

      <div className="management-two-column">
        <DashboardSection className="management-section" eyebrow="Cost Control" title="تمرکز CAPEX و محرک‌های هزینه" aside={<Link href={`/projects/${project.id}/capex`}>CAPEX</Link>}>
          <div className="management-metric-grid compact">{(["total-capex", "contingency", "capex-fx-exposure", "opex-fx-exposure"] as ManagementMetricId[]).map((id) => <MetricCard key={id} metric={view.metrics[id]} projectId={project.id} />)}</div>
          <div className="management-driver-columns">
            <div><h4>بزرگ‌ترین اقلام CAPEX</h4>{view.capexConcentration.length ? view.capexConcentration.map((item) => <article key={item.label}><span>{item.label}<small>{item.owner}</small></span><strong>{formatMoney(item.value, project)}<small>{item.share === null ? "سهم ناموجود" : formatPercent(item.share)}</small></strong></article>) : <p className="management-inline-unavailable">خروجی قلم‌به‌قلم CAPEX در مالک محاسبه موجود نیست؛ مقدار جایگزین ساخته نشده است.</p>}</div>
            <div><h4>محرک‌های هزینه سال گزارش</h4>{view.operatingCostDrivers.length ? view.operatingCostDrivers.map((item) => <article key={item.label}><span>{item.label}<small>{item.owner}</small></span><strong>{formatMoney(item.value, project)}<small>{item.share === null ? "سهم ناموجود" : formatPercent(item.share)}</small></strong></article>) : <p className="management-inline-unavailable">هزینه عملیاتی هم‌دوره در دسترس نیست.</p>}</div>
          </div>
        </DashboardSection>

        <DashboardSection className="management-section" eyebrow="Liquidity Control" title="نقدینگی و سرمایه در گردش" aside={<Link href={`/projects/${project.id}/working-capital`}>سرمایه در گردش</Link>}>
          <div className="management-metric-grid compact">{(["peak-working-capital", "cumulative-cash-requirement", "minimum-cash", "operating-cash-transition"] as ManagementMetricId[]).map((id) => <MetricCard key={id} metric={view.metrics[id]} projectId={project.id} />)}</div>
          <div className="management-source-note"><strong>مرز مالی</strong><p>جریان نقد عملیاتی از صورت‌های مالی و FCFF از موتور DCF مصرف می‌شود؛ جریان‌های تأمین مالی داخل FCFF بازسازی نشده‌اند.</p></div>
        </DashboardSection>
      </div>

      <div className="management-two-column risk">
        <DashboardSection className="management-section" eyebrow="Scenario Comparison" title="مقایسه سناریوی فعال با مبنا" aside={<Link href={`/projects/${project.id}/scenarios`}>مدیریت سناریو</Link>}>
          <p className="management-section-explanation">{view.scenarioComparison.reason}</p>
          {view.scenarioComparison.rows.length ? <PremiumTableShell className="management-table-shell comparison"><table><thead><tr><th>شاخص</th><th>دوره</th><th>{view.context.scenarioName}</th><th>{view.context.baseScenarioName ?? "مبنا"}</th><th>تغییر سناریویی</th><th>منبع</th></tr></thead><tbody>{view.scenarioComparison.rows.map((row) => <tr key={row.id}><td><strong>{row.label}</strong>{row.reason ? <small>{row.reason}</small> : null}</td><td>{row.period}</td><td>{formatManagementValue(row.activeValue, row.unit, project)}</td><td>{formatManagementValue(row.baseValue, row.unit, project)}</td><td>{formatManagementValue(row.delta, row.unit, project)}</td><td><Link href={managementHref(project.id, row.drilldown)}>{row.source}</Link></td></tr>)}</tbody></table></PremiumTableShell> : <div className="management-unavailable"><strong>{view.scenarioComparison.status === "not-applicable" ? "سناریوی مبنا فعال است" : "مقایسه قابل اتکا موجود نیست"}</strong><p>{view.scenarioComparison.reason}</p></div>}
        </DashboardSection>

        <DashboardSection className="management-section" eyebrow="Risk Drivers" title="محرک‌های ریسک مدیریتی" aside={<Link href={`/projects/${project.id}/sensitivity`}>تحلیل حساسیت</Link>}>
          {view.riskDrivers.length ? <div className="management-risk-drivers">{view.riskDrivers.map((driver) => <article key={driver.id}><header><strong>{driver.label}</strong><StatusPill tone="warning">{driver.metric}</StatusPill></header><div><span>دامنه خروجی موتور</span><b>{formatMoney(driver.range, project)}</b></div><p>حد پایین: {driver.low === null ? "ناموجود" : formatMoney(driver.low, project)} · حد بالا: {driver.high === null ? "ناموجود" : formatMoney(driver.high, project)}</p><Link href={managementHref(project.id, driver.drilldown)}>{driver.source}</Link></article>)}</div> : <div className="management-unavailable"><strong>تحلیل نشده / ناموجود</strong><p>{view.riskUnavailableReason}</p><Link href={`/projects/${project.id}/sensitivity`}>اجرای تحلیل از ماژول مبدأ</Link></div>}
        </DashboardSection>
      </div>

      <DashboardSection className="management-section exceptions" eyebrow="Exceptions & Actions" title="استثناها و اقدامات مدیریتی" aside={<StatusPill tone={exceptionTone}>{formatNumber(view.exceptions.length)} مورد اولویت‌دار</StatusPill>}>
        {view.exceptions.length ? <PremiumTableShell className="management-table-shell exceptions"><table><thead><tr><th>شدت</th><th>مسئله مدیریت</th><th>شواهد / مقدار</th><th>دوره اثر</th><th>اثر کسب‌وکار</th><th>اقدام لازم</th><th>منبع</th></tr></thead><tbody>{view.exceptions.map((issue) => <tr className={issue.severity} key={issue.id}><td><StatusPill tone={issue.severity === "critical" ? "danger" : issue.severity === "warning" ? "warning" : "info"}>{issue.severity === "critical" ? "بحرانی" : issue.severity === "warning" ? "هشدار" : "اطلاع"}</StatusPill></td><td><strong>{issue.issue}</strong></td><td>{issue.evidence}</td><td>{issue.affectedPeriod}</td><td>{issue.impact}</td><td>{issue.action}</td><td><Link href={managementHref(project.id, issue.drilldown)}>{issue.source} <span aria-hidden="true">←</span></Link></td></tr>)}</tbody></table></PremiumTableShell> : <div className="management-unavailable success"><strong>استثنای اولویت‌دار ثبت نشده است</strong><p>کنترل‌های قابل اعمال از خروجی‌های تازه و معتبر عبور کرده‌اند.</p></div>}
      </DashboardSection>
    </main>
  );
}
