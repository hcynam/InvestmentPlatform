"use client";

import { useState } from "react";
import { formatMoney, formatNumber, formatPercent } from "@/lib/format";
import type { ModuleSlug, YearlyRow } from "@/lib/types";
import { useProject } from "@/store/project-context";
import { UiIcon } from "@/components/project/UiIcon";
import {
  DashboardSection,
  GlassMetricCard,
  PremiumTableShell,
  StatusPill,
} from "@/components/project/PremiumUi";

const finite = (value: number | null | undefined) => Number.isFinite(value ?? Number.NaN) ? Number(value) : 0;

const percentOf = (value: number, total: number) => total > 0 ? Math.max(0, Math.min(100, value / total * 100)) : 0;

function investmentDecision({
  npv,
  irr,
  discountRate,
  minimumDscr,
}: {
  npv: number;
  irr: number | null;
  discountRate: number;
  minimumDscr: number | null;
}) {
  if (npv < 0 || (irr !== null && irr < discountRate * 0.85)) return { label: "رد سرمایه‌گذاری", tone: "danger" as const };
  if ((minimumDscr ?? 0) < 1 || irr === null) return { label: "پرریسک", tone: "danger" as const };
  if ((minimumDscr ?? 0) < 1.25 || npv < 0.08 * Math.max(1, Math.abs(npv))) return { label: "قابل بررسی", tone: "warning" as const };
  return { label: "جذاب", tone: "success" as const };
}

function bankDecision(score: number, minimumDscr: number | null, target: number) {
  if (score >= 75 && (minimumDscr ?? 0) >= target) return { label: "قابل قبول", tone: "success" as const };
  if (score >= 55 && (minimumDscr ?? 0) >= 1) return { label: "قابل بررسی با شروط", tone: "warning" as const };
  if (score >= 40) return { label: "پرریسک", tone: "danger" as const };
  return { label: "غیرقابل قبول", tone: "danger" as const };
}

function LineChart({
  rows,
  series,
}: {
  rows: YearlyRow[];
  series: { key: keyof YearlyRow; label: string; color: string }[];
}) {
  const width = 760;
  const height = 260;
  const data = rows.slice(0, 12);
  const values = series.flatMap((item) => data.map((row) => Number(row[item.key]) || 0));
  const min = Math.min(0, ...values);
  const max = Math.max(1, ...values);
  const x = (index: number) => 28 + index / Math.max(1, data.length - 1) * (width - 56);
  const y = (value: number) => 20 + (max - value) / Math.max(1, max - min) * (height - 54);

  return (
    <div className="chart-frame premium-chart-frame">
      <div className="chart-legend">
        {series.map((item) => <span key={item.label}><i style={{ background: item.color }} />{item.label}</span>)}
      </div>
      <svg aria-label="روند مالی" className="decision-line-chart" role="img" viewBox={`0 0 ${width} ${height}`}>
        {[0.2, 0.5, 0.8].map((position) => (
          <line key={position} x1="28" x2={width - 28} y1={height * position} y2={height * position} stroke="rgba(148, 163, 184, 0.22)" />
        ))}
        {series.map((item) => {
          const points = data.map((row, index) => `${x(index)},${y(Number(row[item.key]) || 0)}`).join(" ");
          return <polyline fill="none" key={item.label} points={points} stroke={item.color} strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" />;
        })}
        {data.map((row, index) => <text fill="#94a3b8" fontSize="11" key={row.year} textAnchor="middle" x={x(index)} y={height - 8}>{row.year}</text>)}
      </svg>
    </div>
  );
}

function DashboardControls({
  selectedYear,
  onYearChange,
  label = "سال تحلیل",
}: {
  selectedYear: number;
  onYearChange: (year: number) => void;
  label?: string;
}) {
  const { project, activeScenario, selectScenario } = useProject();
  return (
    <section className="dashboard-controls premium-dashboard-controls">
      <label>
        <span>سناریو</span>
        <select value={activeScenario.id} onChange={(event) => selectScenario(event.target.value)}>
          {project.scenarios.map((scenario) => <option key={scenario.id} value={scenario.id}>{scenario.name}</option>)}
        </select>
      </label>
      <label>
        <span>{label}</span>
        <select value={selectedYear} onChange={(event) => onYearChange(Number(event.target.value))}>
          {Array.from({ length: project.modelHorizonYears }, (_, index) => index + 1).map((year) => <option key={year} value={year}>سال {formatNumber(year)}</option>)}
        </select>
      </label>
    </section>
  );
}

function ExecutiveDashboard() {
  const { outputs, project, activeScenario } = useProject();
  const [selectedYear, setSelectedYear] = useState(1);
  const rows = outputs.statements.rows;
  const selectedRow = rows[selectedYear] ?? rows[1] ?? rows[0];
  const discountRate = activeScenario.assumptions.macro.discountRate;
  const decision = investmentDecision({
    npv: outputs.valuation.npv,
    irr: outputs.valuation.irr,
    discountRate,
    minimumDscr: outputs.financing.minimumDscr,
  });
  const revenue = rows.slice(1).reduce((sum, row) => sum + row.revenue, 0);
  const costs = rows.slice(1).reduce((sum, row) => sum + row.cogs + row.opex, 0);
  const taxes = rows.slice(1).reduce((sum, row) => sum + row.tax, 0);
  const waterfall = [
    { label: "درآمد عمر پروژه", value: revenue, tone: "success" },
    { label: "هزینه عملیاتی", value: -costs, tone: "danger" },
    { label: "CAPEX", value: -outputs.capex.totalCapex, tone: "danger" },
    { label: "مالیات", value: -taxes, tone: "warning" },
    { label: "ارزش نهایی", value: outputs.valuation.discountedTerminalValue, tone: "accent" },
  ];
  const maxWaterfall = Math.max(1, ...waterfall.map((item) => Math.abs(item.value)));
  const financing = activeScenario.assumptions.financing;
  const totalFunding = financing.equity + financing.longTermDebt + financing.shortTermDebt;
  const debtShare = totalFunding > 0 ? (financing.longTermDebt + financing.shortTermDebt) / totalFunding : 0;
  const trendRows = rows.slice(1, 8);

  return (
    <div className="dashboard-layout premium-dashboard executive-dashboard">
      <DashboardControls selectedYear={selectedYear} onYearChange={setSelectedYear} />

      <section className="premium-dashboard-hero executive-hero">
        <div>
          <span>Executive Control Room</span>
          <h3>{project.name}</h3>
          <p>{outputs.dashboards.aiReview[0] ?? outputs.dashboards.recommendation}</p>
          <div className="hero-pill-row">
            <StatusPill tone={decision.tone}>{decision.label}</StatusPill>
            <StatusPill tone="info">سناریو: {activeScenario.name}</StatusPill>
            <StatusPill tone="neutral">سال پایه {formatNumber(project.baseYear)}</StatusPill>
          </div>
        </div>
        <div className="hero-score-card">
          <span>آمادگی سرمایه‌گذاری</span>
          <strong>{formatNumber(outputs.dashboards.investmentReadinessScore)}</strong>
          <i style={{ "--score": `${outputs.dashboards.investmentReadinessScore}%` } as React.CSSProperties} />
        </div>
      </section>

      <section className="glass-metric-grid executive-metric-grid">
        <GlassMetricCard label="NPV" value={formatMoney(outputs.valuation.npv, project)} note="ارزش فعلی خالص" tone={outputs.valuation.npv >= 0 ? "success" : "danger"} sparkline={trendRows.map((row) => row.fcff)} />
        <GlassMetricCard label="IRR" value={formatPercent(outputs.valuation.irr)} note={`نرخ تنزیل ${formatPercent(discountRate)}`} tone={outputs.valuation.irr !== null && outputs.valuation.irr >= discountRate ? "success" : "warning"} progress={outputs.valuation.irr ? outputs.valuation.irr * 100 : 0} />
        <GlassMetricCard label="Payback" value={outputs.valuation.payback === null ? "ناموجود" : `${formatNumber(outputs.valuation.payback)} سال`} note={`تنزیل‌شده: ${formatNumber(outputs.valuation.discountedPayback)}`} tone="info" />
        <GlassMetricCard label="سرمایه‌گذاری کل" value={formatMoney(outputs.capex.totalCapex + outputs.workingCapital.initialWorkingCapital, project)} note="CAPEX + سرمایه در گردش اولیه" tone="accent" />
        <GlassMetricCard label="درآمد سال اول" value={formatMoney(rows[1]?.revenue ?? 0, project)} note="از صورت‌های مالی" tone="success" sparkline={trendRows.map((row) => row.revenue)} />
        <GlassMetricCard label="حاشیه EBITDA" value={formatPercent(selectedRow?.revenue ? selectedRow.ebitda / selectedRow.revenue : null)} note={`سال ${formatNumber(selectedYear)}`} tone={(selectedRow?.ebitda ?? 0) >= 0 ? "success" : "danger"} />
        <GlassMetricCard label="حداقل DSCR" value={formatNumber(outputs.financing.minimumDscr)} note="آستانه بانکی ۱٫۲۵" tone={(outputs.financing.minimumDscr ?? 0) >= 1.25 ? "success" : "warning"} />
        <GlassMetricCard label="ریسک نقدینگی ساخت" value={`${formatNumber(outputs.construction.cashCrunchMonths)} ماه`} note={outputs.construction.creditLineRequired > 0 ? `خط اعتباری: ${formatMoney(outputs.construction.creditLineRequired, project)}` : "بدون نیاز خط اعتباری"} tone={outputs.construction.cashCrunchMonths > 0 ? "warning" : "success"} />
      </section>

      <section className="dashboard-two-col premium-two-col">
        <DashboardSection eyebrow="Value Trajectory" title="روند درآمد، EBITDA و FCFF" aside={<StatusPill tone="info">۱۲ سال اول</StatusPill>}>
          <LineChart rows={rows} series={[
            { key: "revenue", label: "درآمد", color: "#34d399" },
            { key: "ebitda", label: "EBITDA", color: "#60a5fa" },
            { key: "fcff", label: "FCFF", color: "#fbbf24" },
          ]} />
        </DashboardSection>
        <DashboardSection eyebrow="Value Bridge" title="پل ارزش اقتصادی پروژه">
          <div className="waterfall-chart premium-waterfall">
            {waterfall.map((item) => (
              <div key={item.label}>
                <span>{item.label}</span>
                <div><i className={item.tone} style={{ height: `${Math.max(8, Math.abs(item.value) / maxWaterfall * 100)}%` }} /></div>
                <strong>{formatMoney(item.value, project)}</strong>
              </div>
            ))}
          </div>
        </DashboardSection>
      </section>

      <section className="dashboard-two-col premium-two-col">
        <DashboardSection eyebrow="Risk Signals" title="سیگنال‌های تصمیم" aside={<StatusPill tone={outputs.validations.length ? "warning" : "success"}>{formatNumber(outputs.validations.length)} مورد</StatusPill>}>
          <div className="risk-signal-list premium-risk-list">
            {outputs.validations.slice(0, 5).map((issue) => (
              <div key={issue.id}>
                <span className={`signal ${issue.severity}`} />
                <div><strong>{issue.message}</strong><small>{issue.recommendation ?? issue.impact}</small></div>
              </div>
            ))}
            {!outputs.validations.length ? <div><span className="signal info" /><div><strong>هشدار فعالی وجود ندارد.</strong><small>مدل فعلاً از کنترل‌های اصلی عبور کرده است.</small></div></div> : null}
          </div>
        </DashboardSection>
        <DashboardSection eyebrow="Capital Structure" title="ترکیب تأمین مالی">
          <div className="capital-mix premium-capital-mix">
            <div className="donut premium-donut" style={{ "--debt": `${debtShare * 100}%` } as React.CSSProperties}>
              <strong>{formatPercent(debtShare)}</strong>
              <span>سهم بدهی</span>
            </div>
            <dl>
              <div><dt>آورده سهامدار</dt><dd>{formatMoney(financing.equity, project)}</dd></div>
              <div><dt>بدهی کل</dt><dd>{formatMoney(financing.longTermDebt + financing.shortTermDebt, project)}</dd></div>
              <div><dt>کل هزینه مالی</dt><dd>{formatMoney(outputs.financing.totalInterest, project)}</dd></div>
            </dl>
          </div>
        </DashboardSection>
      </section>
    </div>
  );
}

function BankDashboard() {
  const { outputs, project, activeScenario } = useProject();
  const [selectedYear, setSelectedYear] = useState(1);
  const target = activeScenario.assumptions.financing.targetDscr;
  const selectedDebtRow = outputs.financing.schedule[selectedYear];
  const debtRows = outputs.financing.schedule.filter((row) => row.debtService > 0 || row.endingBalance > 0);
  const maxDebt = Math.max(1, ...debtRows.map((row) => row.endingBalance));
  const peakDebtRow = outputs.financing.schedule.reduce((best, row) => row.debtService > best.debtService ? row : best, outputs.financing.schedule[0]);
  const financing = activeScenario.assumptions.financing;
  const funding = financing.equity + financing.longTermDebt + financing.shortTermDebt;
  const debtEquity = financing.equity > 0 ? (financing.longTermDebt + financing.shortTermDebt) / financing.equity : 0;
  const decision = bankDecision(outputs.dashboards.bankabilityScore, outputs.financing.minimumDscr, target);

  return (
    <div className="dashboard-layout premium-dashboard bank-dashboard">
      <DashboardControls selectedYear={selectedYear} onYearChange={setSelectedYear} label="سال covenant" />
      <section className="premium-dashboard-hero bank-hero">
        <div>
          <span>Credit Committee Cockpit</span>
          <h3>داشبورد اعتبارسنجی بانک</h3>
          <p>تمرکز روی توان بازپرداخت، ساختار تأمین مالی، ریسک نقدینگی ساخت و نتیجه اعتباری پروژه.</p>
          <div className="hero-pill-row">
            <StatusPill tone={decision.tone}>{decision.label}</StatusPill>
            <StatusPill tone={(outputs.financing.minimumDscr ?? 0) >= target ? "success" : "danger"}>DSCR هدف {formatNumber(target)}</StatusPill>
            <StatusPill tone="info">سناریو: {activeScenario.name}</StatusPill>
          </div>
        </div>
        <div className="hero-score-card">
          <span>Bankability</span>
          <strong>{formatNumber(outputs.dashboards.bankabilityScore)}</strong>
          <i style={{ "--score": `${outputs.dashboards.bankabilityScore}%` } as React.CSSProperties} />
        </div>
      </section>

      <section className="glass-metric-grid bank-metric-grid">
        <GlassMetricCard label="حداقل DSCR" value={formatNumber(outputs.financing.minimumDscr)} note={`هدف: ${formatNumber(target)}`} tone={(outputs.financing.minimumDscr ?? 0) >= target ? "success" : "danger"} />
        <GlassMetricCard label="میانگین DSCR" value={formatNumber(outputs.financing.averageDscr)} note="دوره بازپرداخت" tone={(outputs.financing.averageDscr ?? 0) >= target ? "success" : "warning"} />
        <GlassMetricCard label="سال اوج خدمت بدهی" value={`سال ${formatNumber(peakDebtRow?.year ?? 0)}`} note={formatMoney(peakDebtRow?.debtService ?? 0, project)} tone="warning" />
        <GlassMetricCard label="نسبت بدهی به آورده" value={formatNumber(debtEquity)} note={`کل منابع ${formatMoney(funding, project)}`} tone={debtEquity <= 2 ? "success" : "warning"} />
        <GlassMetricCard label="بدهی کل" value={formatMoney(financing.longTermDebt + financing.shortTermDebt, project)} note="تسهیلات بلندمدت و کوتاه‌مدت" tone="accent" />
        <GlassMetricCard label="آورده سهامدار" value={formatMoney(financing.equity, project)} note="Equity commitment" tone="info" />
        <GlassMetricCard label="Cash Crunch ساخت" value={`${formatNumber(outputs.construction.cashCrunchMonths)} ماه`} note={formatMoney(outputs.construction.creditLineRequired, project)} tone={outputs.construction.cashCrunchMonths ? "warning" : "success"} />
        <GlassMetricCard label="مانده بدهی سال منتخب" value={formatMoney(selectedDebtRow?.endingBalance ?? 0, project)} note={`سال ${formatNumber(selectedYear)}`} tone="neutral" />
      </section>

      <section className="dashboard-two-col premium-two-col">
        <DashboardSection eyebrow="Repayment Capacity" title="توان بازپرداخت و heatmap DSCR">
          <div className="bullet-chart-list premium-dscr-list">
            {debtRows.map((row) => (
              <div key={row.year}>
                <span>سال {formatNumber(row.year)}</span>
                <div><i className={(row.dscr ?? 0) < target ? "below" : ""} style={{ width: `${Math.min(100, (row.dscr ?? 0) / Math.max(target * 1.6, 1) * 100)}%` }} /><b style={{ right: `${target / Math.max(target * 1.6, 1) * 100}%` }} /></div>
                <strong>{formatNumber(row.dscr)}</strong>
              </div>
            ))}
          </div>
        </DashboardSection>
        <DashboardSection eyebrow="Debt Profile" title="مسیر کاهش مانده تسهیلات">
          <div className="debt-profile premium-debt-profile">
            {debtRows.map((row) => (
              <div key={row.year} title={formatMoney(row.endingBalance, project)}>
                <i style={{ height: `${Math.max(3, row.endingBalance / maxDebt * 100)}%` }} />
                <span>{formatNumber(row.year)}</span>
              </div>
            ))}
          </div>
        </DashboardSection>
      </section>

      <DashboardSection eyebrow="Credit Risk" title="کنترل‌های اعتبارسنجی">
        <div className="covenant-grid premium-covenant-grid">
          <article className={(outputs.financing.minimumDscr ?? 0) >= target ? "pass" : "fail"}><UiIcon name={(outputs.financing.minimumDscr ?? 0) >= target ? "check" : "risk"} /><div><strong>DSCR حداقل</strong><span>{formatNumber(outputs.financing.minimumDscr)} / {formatNumber(target)}</span></div></article>
          <article className={outputs.construction.cashCrunchMonths === 0 ? "pass" : "fail"}><UiIcon name={outputs.construction.cashCrunchMonths === 0 ? "check" : "risk"} /><div><strong>کسری نقد ساخت</strong><span>{formatNumber(outputs.construction.cashCrunchMonths)} ماه</span></div></article>
          <article className={outputs.financing.remainingDebt === 0 ? "pass" : "fail"}><UiIcon name={outputs.financing.remainingDebt === 0 ? "check" : "risk"} /><div><strong>تسویه در افق مدل</strong><span>{formatMoney(outputs.financing.remainingDebt, project)}</span></div></article>
          <article className={Math.abs(outputs.statements.rows.at(-1)?.balanceCheck ?? 0) < 1_000_000 ? "pass" : "fail"}><UiIcon name={Math.abs(outputs.statements.rows.at(-1)?.balanceCheck ?? 0) < 1_000_000 ? "check" : "risk"} /><div><strong>کنترل ترازنامه</strong><span>{formatMoney(outputs.statements.rows.at(-1)?.balanceCheck ?? 0, project)}</span></div></article>
        </div>
      </DashboardSection>
    </div>
  );
}

function ManagementDashboard() {
  const { outputs, project, activeScenario } = useProject();
  const [selectedYear, setSelectedYear] = useState(1);
  const year = outputs.statements.rows[selectedYear] ?? outputs.statements.rows[1] ?? outputs.statements.rows[0];
  const capacity = outputs.capacity.rows[selectedYear] ?? outputs.capacity.rows[1];
  const costTotal = Math.max(1, year.cogs + year.opex + year.interest + year.tax);
  const costs = [
    { label: "COGS", value: year.cogs, color: "#34d399" },
    { label: "OPEX", value: year.opex, color: "#60a5fa" },
    { label: "بهره", value: year.interest, color: "#fbbf24" },
    { label: "مالیات", value: year.tax, color: "#fb7185" },
  ];
  const workingCapitalRow = outputs.workingCapital.rows[selectedYear] ?? outputs.workingCapital.rows[1];

  return (
    <div className="dashboard-layout premium-dashboard management-dashboard">
      <DashboardControls selectedYear={selectedYear} onYearChange={setSelectedYear} />
      <section className="premium-dashboard-hero management-hero">
        <div>
          <span>Operational Control Panel</span>
          <h3>داشبورد مدیریت عملکرد</h3>
          <p>نمای عملیاتی فروش، ظرفیت، حاشیه سود، نقدینگی، فاز ساخت، سرمایه در گردش و ریسک‌های سناریویی.</p>
          <div className="hero-pill-row">
            <StatusPill tone={year.cash >= 0 ? "success" : "danger"}>{year.cash >= 0 ? "نقدینگی مثبت" : "کسری نقد"}</StatusPill>
            <StatusPill tone="info">سناریو: {activeScenario.name}</StatusPill>
            <StatusPill tone="neutral">سال {formatNumber(selectedYear)}</StatusPill>
          </div>
        </div>
        <div className="hero-score-card">
          <span>سلامت پروژه</span>
          <strong>{formatNumber(outputs.dashboards.projectHealthScore)}</strong>
          <i style={{ "--score": `${outputs.dashboards.projectHealthScore}%` } as React.CSSProperties} />
        </div>
      </section>

      <section className="glass-metric-grid management-metric-grid">
        <GlassMetricCard label="فروش و ظرفیت" value={formatMoney(year.revenue, project)} note={`${formatNumber(capacity?.productionVolume)} واحد تولید`} tone="success" sparkline={outputs.statements.rows.slice(1, 8).map((row) => row.revenue)} />
        <GlassMetricCard label="بهره‌برداری ظرفیت" value={formatPercent(capacity?.utilization)} note="نسبت استفاده از ظرفیت" tone={finite(capacity?.utilization) >= 0.7 ? "success" : "warning"} progress={finite(capacity?.utilization) * 100} />
        <GlassMetricCard label="حاشیه ناخالص" value={formatPercent(year.grossMargin)} note={formatMoney(year.grossProfit, project)} tone={year.grossProfit >= 0 ? "success" : "danger"} />
        <GlassMetricCard label="جریان نقدی" value={formatMoney(year.cash, project)} note="نقد پایان سال منتخب" tone={year.cash >= 0 ? "success" : "danger"} />
        <GlassMetricCard label="فاز ساخت" value={`${formatNumber(outputs.construction.cashCrunchMonths)} ماه هشدار`} note={outputs.construction.status} tone={outputs.construction.cashCrunchMonths ? "warning" : "success"} />
        <GlassMetricCard label="سرمایه در گردش" value={formatMoney(workingCapitalRow?.workingCapital ?? 0, project)} note={`تغییر: ${formatMoney(workingCapitalRow?.changeInWorkingCapital ?? 0, project)}`} tone={(workingCapitalRow?.workingCapital ?? 0) >= 0 ? "warning" : "success"} />
      </section>

      <section className="dashboard-two-col premium-two-col">
        <DashboardSection eyebrow="Sales & Capacity" title="روند عملکرد عملیاتی">
          <LineChart rows={outputs.statements.rows} series={[
            { key: "revenue", label: "فروش", color: "#34d399" },
            { key: "cogs", label: "بهای تمام‌شده", color: "#fbbf24" },
            { key: "opex", label: "هزینه عملیاتی", color: "#fb7185" },
          ]} />
        </DashboardSection>
        <DashboardSection eyebrow="Cost & Margin" title="ترکیب هزینه سال منتخب">
          <div className="stacked-cost-bar premium-cost-bar">
            {costs.map((item) => <i key={item.label} style={{ background: item.color, width: `${percentOf(item.value, costTotal)}%` }} title={item.label} />)}
          </div>
          <div className="cost-breakdown premium-cost-breakdown">
            {costs.map((item) => <div key={item.label}><span><i style={{ background: item.color }} />{item.label}</span><strong>{formatMoney(item.value, project)}</strong><small>{formatPercent(item.value / costTotal)}</small></div>)}
          </div>
        </DashboardSection>
      </section>

      <section className="dashboard-two-col premium-two-col">
        <DashboardSection eyebrow="Top Risks" title="۵ ریسک و هشدار مهم">
          <div className="risk-signal-list premium-risk-list">
            {outputs.validations.slice(0, 5).map((issue) => (
              <div key={issue.id}><span className={`signal ${issue.severity}`} /><div><strong>{issue.message}</strong><small>{issue.recommendation ?? issue.impact}</small></div></div>
            ))}
          </div>
        </DashboardSection>
        <DashboardSection eyebrow="Management View" title="خلاصه پنج‌ساله عملیات">
          <PremiumTableShell>
            <table>
              <thead><tr><th>سال</th><th>درآمد</th><th>EBITDA</th><th>حاشیه EBITDA</th><th>تولید</th><th>نقد</th></tr></thead>
              <tbody>{outputs.statements.rows.slice(1, 6).map((row) => <tr key={row.year}><td>{formatNumber(row.year)}</td><td>{formatMoney(row.revenue, project)}</td><td>{formatMoney(row.ebitda, project)}</td><td>{formatPercent(row.revenue ? row.ebitda / row.revenue : null)}</td><td>{formatNumber(outputs.capacity.rows[row.year]?.productionVolume)}</td><td>{formatMoney(row.cash, project)}</td></tr>)}</tbody>
            </table>
          </PremiumTableShell>
        </DashboardSection>
      </section>
    </div>
  );
}

export function DecisionDashboard({ slug }: { slug: ModuleSlug }) {
  if (slug === "dashboard-bank") return <BankDashboard />;
  if (slug === "dashboard-management") return <ManagementDashboard />;
  return <ExecutiveDashboard />;
}
