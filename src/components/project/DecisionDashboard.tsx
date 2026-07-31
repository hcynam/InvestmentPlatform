"use client";

import Link from "next/link";
import { useMemo } from "react";
import { ExecutiveDashboard } from "@/components/project/ExecutiveDashboard";
import { ManagementDashboard } from "@/components/project/ManagementDashboard";
import {
  buildBankDashboardViewModel,
  formatBankMetric,
  type BankCreditDimension,
  type BankMetric,
  type BankMetricId,
} from "@/lib/dashboard-selectors";
import { classNames, formatMoney, formatNumber, formatPercent, unitLabel } from "@/lib/format";
import type { ModuleSlug } from "@/lib/types";
import { useProject } from "@/store/project-context";
import {
  DashboardSection,
  PremiumTableShell,
  StatusPill,
} from "@/components/project/PremiumUi";

const bankMetricTone = (metric: BankMetric) => {
  if (metric.status === "stale") return "warning" as const;
  if (metric.status === "invalid" || metric.comparison === "fails") return "danger" as const;
  if (metric.comparison === "passes") return "success" as const;
  return "neutral" as const;
};

const bankConclusionTone = (status: string) => {
  if (status === "acceptable") return "success" as const;
  if (status === "unacceptable" || status === "invalid") return "danger" as const;
  if (status === "conditionally-acceptable" || status === "incomplete" || status === "recalculation-required") return "warning" as const;
  return "neutral" as const;
};

const bankDimensionTone = (status: BankCreditDimension["status"]) => {
  if (status === "pass") return "success" as const;
  if (status === "fail" || status === "invalid") return "danger" as const;
  if (status === "warning" || status === "stale") return "warning" as const;
  return "neutral" as const;
};

const bankStatusLabel = (status: BankCreditDimension["status"] | BankMetric["status"]) => ({
  available: "در دسترس",
  stale: "قدیمی",
  unavailable: "ناموجود",
  invalid: "نامعتبر",
  "not-applicable": "قابل اعمال نیست",
  pass: "عبور",
  warning: "نیازمند توجه",
  fail: "عدم عبور",
}[status] ?? status);

const bankBasisLabel = (basis: string) => basis === "real" ? "واقعی / قیمت ثابت" : "اسمی / قیمت جاری";

const bankCalculatedAt = (value: string) => {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? date.toLocaleString("fa-IR", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Tehran" })
    : "ثبت نشده";
};

const bankHref = (projectId: string, drilldown: string) =>
  `/projects/${projectId}/${drilldown.replace(/^\.\.\//, "")}`;

function BankKpiCard({ metric, projectId, project }: { metric: BankMetric; projectId: string; project: ReturnType<typeof useProject>["project"] }) {
  return (
    <article className={classNames("bank-kpi-card", bankMetricTone(metric), metric.status)} data-bank-metric={metric.id}>
      <header><span>{metric.title}</span><StatusPill tone={bankMetricTone(metric)}>{bankStatusLabel(metric.status)}</StatusPill></header>
      <strong>{formatBankMetric(metric, project)}</strong>
      <p>{metric.occurrenceYear === null ? metric.periodLabel : `${metric.periodLabel} · سال ${formatNumber(metric.occurrenceYear)}`}</p>
      <small>{metric.reason ?? (metric.threshold ? `آستانه: ${formatNumber(metric.threshold.value)}` : `مالک: ${metric.owner}`)}</small>
      <Link href={bankHref(projectId, metric.drilldown)}>مشاهده منبع <span aria-hidden="true">←</span></Link>
    </article>
  );
}

function BankDashboard() {
  const { outputs, project, activeScenario, dirty, runCalculation, selectScenario } = useProject();
  const view = useMemo(
    () => buildBankDashboardViewModel(project, activeScenario, outputs, { dirty }),
    [activeScenario, dirty, outputs, project],
  );
  const metricGroups: Array<{ title: string; eyebrow: string; ids: BankMetricId[] }> = [
    { eyebrow: "Coverage", title: "ظرفیت پوشش بدهی", ids: ["minimum-dscr", "average-dscr", "first-repayment-dscr", "interest-coverage"] },
    { eyebrow: "Capital Structure", title: "ساختار تأمین مالی", ids: ["total-debt", "debt-share", "equity-share", "debt-to-equity"] },
    { eyebrow: "Debt Exposure", title: "مواجهه و تعهدات بدهی", ids: ["peak-debt", "peak-debt-service", "total-principal", "total-interest", "total-debt-service", "collateral-coverage"] },
  ];

  return (
    <main className="bank-cockpit">
      <section className="bank-context" aria-label="زمینه تحلیل اعتباری">
        <div className="bank-context-heading"><span>Bank & Financing Dashboard</span><strong>{project.name}</strong></div>
        <label><span>سناریوی فعال</span><select value={activeScenario.id} onChange={(event) => selectScenario(event.target.value)}>{project.scenarios.map((scenario) => <option key={scenario.id} value={scenario.id}>{scenario.name}</option>)}</select></label>
        <dl>
          <div><dt>مبنای محاسبه</dt><dd>{bankBasisLabel(view.context.calculationBasis)}</dd></div>
          <div><dt>ارز مبنا</dt><dd>{view.context.baseCurrency}</dd></div>
          <div><dt>مقیاس نمایش</dt><dd>{unitLabel(project)}</dd></div>
          <div><dt>آخرین محاسبه</dt><dd>{bankCalculatedAt(view.context.calculatedAt)}</dd></div>
          <div><dt>تازگی</dt><dd>{view.context.freshness === "fresh" ? "جاری" : "قدیمی"}</dd></div>
          <div><dt>تأمین مالی بدهی</dt><dd>{view.context.hasDebt ? "فعال" : "وجود ندارد"}</dd></div>
        </dl>
      </section>

      <section className={classNames("bank-decision-hero", bankConclusionTone(view.creditConclusion.status), dirty && "is-stale")}>
        <div>
          <span>جمع‌بندی کمیته اعتباری</span>
          <h2>{view.creditConclusion.label}</h2>
          <p>{view.creditConclusion.reason}</p>
          <div className="hero-pill-row">
            <StatusPill tone={bankConclusionTone(view.creditConclusion.status)}>{view.creditConclusion.definitive ? "جمع‌بندی قطعی بر مبنای داده جاری" : "جمع‌بندی غیرقطعی"}</StatusPill>
            <StatusPill tone="info">سناریو: {view.context.scenarioName}</StatusPill>
          </div>
        </div>
        {dirty ? <button type="button" onClick={runCalculation}>محاسبه مجدد مدل</button> : null}
      </section>

      {!view.context.hasDebt ? (
        <section className="bank-empty-state">
          <strong>تأمین مالی بدهی وجود ندارد</strong>
          <p>هیچ KPI بانکی صفرسازی یا شبیه‌سازی نشده است. برای ایجاد برنامه خدمت بدهی، ابتدا تسهیلات معتبر را در ماژول تأمین مالی ثبت کنید.</p>
          <Link href={`/projects/${project.id}/financing#financing-facilities`}>تعریف تأمین مالی</Link>
        </section>
      ) : (
        <>
          {metricGroups.map((group) => (
            <section className="bank-kpi-section" key={group.eyebrow}>
              <header><div><span>{group.eyebrow}</span><h3>{group.title}</h3></div></header>
              <div className="bank-kpi-grid">{group.ids.map((id) => <BankKpiCard key={id} metric={view.metrics[id]} project={project} projectId={project.id} />)}</div>
            </section>
          ))}

          <DashboardSection
            className="bank-timeline-section"
            eyebrow="Annual Debt Timeline"
            title="خط زمانی خدمت بدهی و covenant"
            aside={<Link href={`/projects/${project.id}/financing#financing-debt-service-schedule`}>جدول کامل تأمین مالی</Link>}
          >
            <PremiumTableShell className="bank-timeline-table">
              <table>
                <thead><tr><th>سال</th><th>DSCR</th><th>حد covenant</th><th>بازپرداخت اصل</th><th>سود / هزینه مالی</th><th>کل خدمت بدهی</th><th>مانده بدهی</th><th>وضعیت</th><th>پیگیری</th></tr></thead>
                <tbody>{view.timeline.map((row) => (
                  <tr className={classNames(`bank-row-${row.status}`, row.status === "risk" && "is-risky")} key={row.year}>
                    <td>{formatNumber(row.year)}</td>
                    <td>{row.dscr === null ? "—" : formatNumber(row.dscr)}</td>
                    <td>{formatNumber(row.threshold)}</td>
                    <td>{formatMoney(row.principal, project)}</td>
                    <td>{formatMoney(row.interest, project)}</td>
                    <td>{formatMoney(row.debtService, project)}</td>
                    <td>{formatMoney(row.outstandingDebt, project)}</td>
                    <td><StatusPill tone={row.status === "risk" ? "danger" : row.status === "safe" ? "success" : row.status === "stale" ? "warning" : "neutral"}>{row.status === "risk" ? "پرریسک" : row.status === "safe" ? "ایمن" : row.status === "stale" ? "قدیمی" : "بدون خدمت بدهی"}</StatusPill></td>
                    <td><Link href={bankHref(project.id, row.financingDrilldown)}>برنامه بدهی</Link><Link href={bankHref(project.id, row.costDrilldown)}>هزینه مالی</Link></td>
                  </tr>
                ))}</tbody>
              </table>
            </PremiumTableShell>
          </DashboardSection>

          <div className="bank-two-column">
            <DashboardSection eyebrow="Facility Terms" title="شرایط تسهیلات" aside={<Link href={`/projects/${project.id}/financing#financing-facilities`}>ویرایش تسهیلات</Link>}>
              {view.facilities.length ? <div className="bank-facility-list">{view.facilities.map((facility) => (
                <article key={facility.id}>
                  <header><strong>{facility.title}</strong><span>{formatMoney(facility.amount, project)}</span></header>
                  <dl>
                    <div><dt>نرخ سالانه</dt><dd>{formatPercent(facility.annualRate)}</dd></div>
                    <div><dt>دوره تنفس</dt><dd>{formatNumber(facility.graceMonths)} ماه</dd></div>
                    <div><dt>دوره بازپرداخت</dt><dd>{formatNumber(facility.repaymentTermMonths)} ماه</dd></div>
                    <div><dt>وثیقه</dt><dd>{facility.collateralRequired ? facility.collateralValue === null || facility.collateralValue <= 0 ? "ارزش ثبت نشده" : formatMoney(facility.collateralValue, project) : "الزام ندارد"}</dd></div>
                  </dl>
                </article>
              ))}</div> : <p className="bank-inline-unavailable">جزئیات ابزارها در ورودی canonical موجود نیست؛ از ساخت داده جایگزین خودداری شده است.</p>}
            </DashboardSection>

            <DashboardSection eyebrow="Canonical Availability" title="شاخص‌های فاقد تعریف canonical">
              <div className="bank-unavailable-list">{view.unavailableAnalyses.map((item) => <article key={item.label}><strong>{item.label}</strong><p>{item.reason}</p></article>)}</div>
            </DashboardSection>
          </div>

          <DashboardSection eyebrow="Recalculated Stress" title="تحلیل تنش بر پایه باز‌محاسبه موتور" aside={<Link href={`/projects/${project.id}/sensitivity`}>مدیریت تحلیل حساسیت</Link>}>
            <div className="bank-stress-grid">{view.stressCases.map((stress) => (
              <article className={classNames("bank-stress-card", stress.comparison === "fails" && "danger", stress.status)} key={stress.id}>
                <header><strong>{stress.label}</strong><StatusPill tone={stress.status === "available" ? stress.comparison === "fails" ? "danger" : "success" : stress.status === "invalid" ? "danger" : stress.status === "stale" ? "warning" : "neutral"}>{bankStatusLabel(stress.status)}</StatusPill></header>
                <div><span>شوک</span><b>{stress.shock === null ? "—" : stress.changeType === "percent" ? formatPercent(stress.shock) : `${formatNumber(stress.shock)} ماه`}</b></div>
                <div><span>DSCR باز‌محاسبه‌شده</span><b>{stress.dscr === null ? "—" : formatNumber(stress.dscr)}</b></div>
                <p>{stress.reason}</p>
                <Link href={bankHref(project.id, stress.drilldown)}>مشاهده اجرای موتور</Link>
              </article>
            ))}</div>
          </DashboardSection>

          <DashboardSection eyebrow="Credit Conclusion" title="جمع‌بندی چندبعدی اعتبار">
            <div className="bank-credit-dimensions">{view.creditConclusion.dimensions.map((dimension) => (
              <article key={dimension.id}>
                <header><strong>{dimension.label}</strong><StatusPill tone={bankDimensionTone(dimension.status)}>{bankStatusLabel(dimension.status)}</StatusPill></header>
                <p>{dimension.summary}</p>
                <Link href={bankHref(project.id, dimension.drilldown)}>بررسی منبع</Link>
              </article>
            ))}</div>
            <div className={classNames("bank-credit-final", bankConclusionTone(view.creditConclusion.status))}>
              <div><span>نتیجه</span><strong>{view.creditConclusion.label}</strong><p>{view.creditConclusion.reason}</p></div>
              <StatusPill tone={bankConclusionTone(view.creditConclusion.status)}>{view.creditConclusion.definitive ? "قابل استناد" : "غیرقطعی"}</StatusPill>
            </div>
          </DashboardSection>
        </>
      )}
    </main>
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
