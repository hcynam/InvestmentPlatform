"use client";

import { useState } from "react";
import { excelSheets } from "@/lib/excel-map";
import { classNames, formatMetric, formatMoney, formatNumber, formatPercent } from "@/lib/format";
import { moduleBySlug, type FieldConfig, type KpiConfig } from "@/lib/module-config";
import type { ModuleSlug } from "@/lib/types";
import { useProject } from "@/store/project-context";
import { DecisionDashboard } from "@/components/project/DecisionDashboard";
import { ConstructionCashFlowWorkspace } from "@/components/project/ConstructionCashFlowWorkspace";
import { FinancingWorkspace } from "@/components/project/FinancingWorkspace";
import { ScenarioManager } from "@/components/project/ScenarioManager";
import { SensitivityWorkbench } from "@/components/project/SensitivityWorkbench";
import { UiIcon } from "@/components/project/UiIcon";
import { exportReport, type ReportExportKind } from "@/lib/report-export";
import {
  CapacityProductionWorkspace,
  CapexWorkspace,
  DirectCostsWorkspace,
  OpexWorkspace,
  WorkingCapitalWorkspace,
} from "@/components/phase-two/PhaseTwoWorkspaces";
import {
  IndustryTemplateWorkspace,
  MacroWorkspace,
  MarketDemandWorkspace,
  ProjectSetupWorkspace,
} from "@/components/phase-one/PhaseOneWorkspaces";

const isNumeric = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

function EditableField({ field, showSource }: { field: FieldConfig; showSource: boolean }) {
  const { getValue, updateInput, activeScenario } = useProject();
  const rawValue = getValue(field.path);
  const disabled = activeScenario.isLocked;
  const onChange = (value: unknown) => updateInput(field.path, value);

  return (
    <label className="editable-field">
      <span>{field.label}{showSource && field.source ? <small>{field.source}</small> : null}</span>
      {field.type === "select" ? (
        <select value={String(rawValue ?? "")} disabled={disabled} onChange={(event) => onChange(event.target.value)}>
          {(field.options ?? []).map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
      ) : field.type === "boolean" ? (
        <span className="switch-control">
          <input type="checkbox" checked={Boolean(rawValue)} disabled={disabled} onChange={(event) => onChange(event.target.checked)} />
          <i />
          <b>{Boolean(rawValue) ? "فعال" : "غیرفعال"}</b>
        </span>
      ) : (
        <input
          type={field.type === "date" ? "date" : field.type === "text" ? "text" : "number"}
          value={field.type === "percent" && isNumeric(rawValue) ? rawValue * 100 : String(rawValue ?? "")}
          disabled={disabled}
          step={field.type === "percent" ? "0.01" : field.type === "number" ? "any" : undefined}
          onChange={(event) => {
            if (field.type === "percent") onChange(Number(event.target.value) / 100);
            else if (field.type === "number") onChange(Number(event.target.value));
            else onChange(event.target.value);
          }}
        />
      )}
      {field.help ? <em>{field.help}</em> : null}
    </label>
  );
}

function KpiCard({ kpi }: { kpi: KpiConfig }) {
  const { getValue, project, selectTrace } = useProject();
  const value = getValue(kpi.valuePath);
  const numeric = isNumeric(value) ? value : null;
  return (
    <button className={kpi.traceId ? "kpi-card traceable" : "kpi-card"} type="button" onClick={() => kpi.traceId && selectTrace(kpi.traceId)}>
      <span>{kpi.label}</span>
      <strong>{formatMetric(numeric, kpi.type, project)}</strong>
      <small>{kpi.traceId ? "مشاهده منطق محاسبه" : "خروجی مدل"}</small>
    </button>
  );
}

function FieldSection({ fields, advanced }: { fields: FieldConfig[]; advanced: boolean }) {
  if (!fields.length) return null;
  const visibleFields = advanced ? fields : fields.slice(0, 4);
  return (
    <section className="panel input-panel">
      <div className="panel-heading">
        <div><span>{advanced ? "Model inputs" : "Key inputs"}</span><strong>{advanced ? "ورودی‌های کامل مدل" : "ورودی‌های کلیدی"}</strong></div>
        <small>{formatNumber(visibleFields.length)} فیلد قابل ویرایش</small>
      </div>
      <div className="field-grid">
        {visibleFields.map((field) => <EditableField key={field.path} field={field} showSource={advanced} />)}
      </div>
    </section>
  );
}

function BasicDecisionPanel() {
  const { outputs } = useProject();
  return (
    <section className="basic-decision-panel">
      <div className="basic-explainer">
        <UiIcon name="spark" />
        <div>
          <strong>جمع‌بندی مدل</strong>
          <p>{outputs.dashboards.aiReview[0] ?? outputs.dashboards.recommendation}</p>
        </div>
      </div>
      <div className="basic-status-list">
        <div><span>سلامت پروژه</span><strong>{formatNumber(outputs.dashboards.projectHealthScore)}٪</strong></div>
        <div><span>بانک‌پذیری</span><strong>{formatNumber(outputs.dashboards.bankabilityScore)}٪</strong></div>
        <div><span>موارد نیازمند توجه</span><strong>{formatNumber(outputs.validations.filter((item) => item.severity !== "info").length)}</strong></div>
      </div>
    </section>
  );
}

function GenericAdvanced() {
  const { outputs, project } = useProject();
  const selectedYears = [1, 5, 10, project.modelHorizonYears].filter((year, index, list) => year <= project.modelHorizonYears && list.indexOf(year) === index);
  return (
    <section className="panel">
      <div className="panel-heading">
        <div><span>Model impact</span><strong>اثر مفروضات بر خروجی‌های منتخب</strong></div>
        <small>سال‌های کلیدی مدل</small>
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>سال</th><th>درآمد</th><th>EBITDA</th><th>سود خالص</th><th>FCFF</th><th>DSCR</th></tr></thead>
          <tbody>
            {selectedYears.map((year) => {
              const row = outputs.statements.rows[year];
              return row ? (
                <tr key={row.year}>
                  <td>{formatNumber(row.year)}</td>
                  <td>{formatMoney(row.revenue, project)}</td>
                  <td>{formatMoney(row.ebitda, project)}</td>
                  <td>{formatMoney(row.netProfit, project)}</td>
                  <td>{formatMoney(row.fcff, project)}</td>
                  <td>{formatNumber(row.dscr)}</td>
                </tr>
              ) : null;
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function FinancialsAdvanced() {
  const { outputs, project, selectTrace } = useProject();
  return (
    <section className="panel wide-panel">
      <div className="panel-heading"><div><span>Financial statements 0..20</span><strong>صورت‌های مالی کامل و کنترل تراز</strong></div><small>سلول‌های سبز قابل trace هستند</small></div>
      <div className="table-wrap xl">
        <table>
          <thead><tr>{["سال", "فروش", "COGS", "OPEX", "EBITDA", "استهلاک", "EBIT", "بهره", "مالیات", "سود خالص", "CFO", "CFI", "CFF", "Cash", "Debt", "Equity", "Balance Check", "FCFF"].map((head) => <th key={head}>{head}</th>)}</tr></thead>
          <tbody>
            {outputs.statements.rows.map((row) => (
              <tr key={row.year}>
                <td>{formatNumber(row.year)}</td>
                <td><button onClick={() => selectTrace("revenue.year1")} type="button">{formatMoney(row.revenue, project)}</button></td>
                <td>{formatMoney(row.cogs, project)}</td><td>{formatMoney(row.opex, project)}</td>
                <td><button onClick={() => selectTrace("statements.ebitda.year1")} type="button">{formatMoney(row.ebitda, project)}</button></td>
                <td>{formatMoney(row.depreciation, project)}</td><td>{formatMoney(row.ebit, project)}</td>
                <td>{formatMoney(row.interest, project)}</td><td>{formatMoney(row.tax, project)}</td>
                <td>{formatMoney(row.netProfit, project)}</td><td>{formatMoney(row.cfo, project)}</td>
                <td>{formatMoney(row.cfi, project)}</td><td>{formatMoney(row.cff, project)}</td>
                <td>{formatMoney(row.cash, project)}</td><td>{formatMoney(row.debt, project)}</td>
                <td>{formatMoney(row.equity, project)}</td>
                <td className={Math.abs(row.balanceCheck) > 1_000_000 ? "risk-cell" : "ok-cell"}>{formatMoney(row.balanceCheck, project)}</td>
                <td>{formatMoney(row.fcff, project)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function FinancingAdvanced() {
  const { outputs, project, activeScenario } = useProject();
  const target = activeScenario.assumptions.financing.targetDscr;
  return (
    <section className="panel wide-panel">
      <div className="panel-heading"><div><span>Loan schedule</span><strong>برنامه بازپرداخت و پوشش بدهی</strong></div><small>DSCR هدف {formatNumber(target)}</small></div>
      <div className="table-wrap">
        <table>
          <thead><tr>{["سال", "مانده اول", "برداشت", "بهره", "بازپرداخت اصل", "قسط کل", "مانده پایان", "DSCR"].map((head) => <th key={head}>{head}</th>)}</tr></thead>
          <tbody>{outputs.financing.schedule.map((row) => <tr key={row.year}><td>{formatNumber(row.year)}</td><td>{formatMoney(row.openingBalance, project)}</td><td>{formatMoney(row.drawdown, project)}</td><td>{formatMoney(row.interest, project)}</td><td>{formatMoney(row.principalRepayment, project)}</td><td>{formatMoney(row.debtService, project)}</td><td>{formatMoney(row.endingBalance, project)}</td><td className={row.dscr !== null && row.dscr < target ? "risk-cell" : "ok-cell"}>{formatNumber(row.dscr)}</td></tr>)}</tbody>
        </table>
      </div>
    </section>
  );
}

function ConstructionAdvanced() {
  const { outputs, project } = useProject();
  return (
    <section className="panel wide-panel">
      <div className="panel-heading"><div><span>Monthly construction cash flow</span><strong>جریان نقد ماهانه ساخت</strong></div><small>{formatNumber(outputs.construction.cashCrunchMonths)} ماه کسری</small></div>
      <div className="table-wrap xl">
        <table>
          <thead><tr>{["ماه", "تاریخ", "CAPEX تعدیل‌شده", "حقوق", "پیمانکار", "زیرساخت", "خروجی", "آورده", "وام", "خط اعتباری", "نقد پایان", "وضعیت"].map((head) => <th key={head}>{head}</th>)}</tr></thead>
          <tbody>{outputs.construction.rows.map((row) => <tr key={row.monthNumber}><td>{formatNumber(row.monthNumber)}</td><td>{row.date}</td><td>{formatMoney(row.adjustedCapex, project)}</td><td>{formatMoney(row.developmentPayroll, project)}</td><td>{formatMoney(row.contractorCost, project)}</td><td>{formatMoney(row.infrastructureCost, project)}</td><td>{formatMoney(row.totalCashOutflow, project)}</td><td>{formatMoney(row.equityInjection, project)}</td><td>{formatMoney(row.debtDrawdown, project)}</td><td>{formatMoney(row.overdraft, project)}</td><td>{formatMoney(row.endingCash, project)}</td><td className={row.cashCrunch ? "risk-cell" : "ok-cell"}>{row.cashCrunch ? "کسری" : "عادی"}</td></tr>)}</tbody>
        </table>
      </div>
    </section>
  );
}

function ValuationAdvanced() {
  const { outputs, project, selectTrace } = useProject();
  return (
    <section className="panel wide-panel">
      <div className="panel-heading"><div><span>DCF diagnostics</span><strong>جریان نقد تنزیل‌شده و ارزش نهایی</strong></div></div>
      {outputs.valuation.diagnostics.length ? <div className="diagnostic-grid">{outputs.valuation.diagnostics.map((item) => <article key={item} className="diagnostic-card">{item}</article>)}</div> : null}
      <div className="table-wrap">
        <table><thead><tr><th>سال</th><th>FCFF</th><th>FCFF تنزیل‌شده</th><th>FCFF تجمعی</th></tr></thead><tbody>{outputs.years.map((year, index) => <tr key={year}><td>{formatNumber(year)}</td><td><button type="button" onClick={() => selectTrace("valuation.npv")}>{formatMoney(outputs.valuation.fcffByYear[index], project)}</button></td><td>{formatMoney(outputs.valuation.discountedFcffByYear[index], project)}</td><td>{formatMoney(outputs.valuation.cumulativeFcff[index], project)}</td></tr>)}</tbody></table>
      </div>
    </section>
  );
}

function MonteCarloAdvanced() {
  const { outputs, project, runMonteCarlo } = useProject();
  return (
    <section className="panel wide-panel">
      <div className="panel-heading"><div><span>Risk simulation</span><strong>شبیه‌سازی مونت‌کارلو</strong></div><button className="primary-button" onClick={runMonteCarlo} type="button">اجرای شبیه‌سازی</button></div>
      {outputs.monteCarlo ? (
        <>
          <div className="dashboard-kpis compact">
            <article><span>P5</span><strong>{formatMoney(outputs.monteCarlo.p5, project)}</strong></article>
            <article><span>P50</span><strong>{formatMoney(outputs.monteCarlo.p50, project)}</strong></article>
            <article><span>P95</span><strong>{formatMoney(outputs.monteCarlo.p95, project)}</strong></article>
            <article><span>احتمال NPV مثبت</span><strong>{formatPercent(outputs.monteCarlo.probabilityNpvPositive)}</strong></article>
          </div>
          <div className="histogram">{outputs.monteCarlo.histogram.map((bin) => <i key={bin.bin} style={{ height: `${Math.max(4, bin.count)}px` }} title={formatMoney(bin.bin, project)} />)}</div>
        </>
      ) : <div className="empty-state large"><UiIcon name="risk" /><strong>شبیه‌سازی هنوز اجرا نشده است.</strong><p>برای حفظ سرعت workspace، محاسبه ریسک به‌صورت on-demand انجام می‌شود.</p></div>}
    </section>
  );
}

function MethodologyPanel() {
  const { outputs } = useProject();
  return (
    <section className="panel wide-panel internal-panel">
      <div className="panel-heading"><div><span>Internal / model team</span><strong>دیکشنری فرمول و mapping</strong></div></div>
      <div className="table-wrap"><table><thead><tr><th>Trace</th><th>Formula</th><th>Source</th></tr></thead><tbody>{outputs.traces.map((item) => <tr key={item.id}><td>{item.label}</td><td><code>{item.formula}</code></td><td>{item.sourceSheet ? `${item.sourceSheet}!${item.sourceCell}` : "-"}</td></tr>)}</tbody></table></div>
    </section>
  );
}

function MasterDataPanel() {
  return (
    <section className="panel wide-panel internal-panel">
      <div className="panel-heading"><div><span>Internal / model team</span><strong>Excel mapping</strong></div></div>
      <div className="table-wrap"><table><thead><tr><th>Route</th><th>Excel Sheet</th><th>Role</th></tr></thead><tbody>{excelSheets.map((sheet) => <tr key={sheet.slug}><td>{sheet.slug}</td><td>{sheet.sheet}</td><td>{sheet.role}</td></tr>)}</tbody></table></div>
    </section>
  );
}

function ReportPanel({ slug }: { slug: ModuleSlug }) {
  const { outputs, project, activeScenario } = useProject();
  const [exportStatus, setExportStatus] = useState("");
  const sections = ["خلاصه مدیریتی", "معرفی پروژه", "فرضیات کلیدی", "بازار", "درآمد", "هزینه‌ها", "CAPEX", "تأمین مالی", "صورت‌های مالی", "ارزش‌گذاری", "حساسیت", "ریسک‌ها", "نتیجه‌گیری"];
  const actions: Array<{ label: string; kind: ReportExportKind }> = [
    { label: "Excel / CSV", kind: "excel" },
    { label: "PDF / چاپ", kind: "pdf" },
    { label: "Word", kind: "word" },
    { label: "Bank Package", kind: "bank" },
    { label: "Investor Pack", kind: "investor" },
    { label: "Board Pack", kind: "board" },
  ];
  return (
    <section className="panel wide-panel">
      <div className="panel-heading"><div><span>{slug === "exports" ? "Export center" : "Report builder"}</span><strong>پکیج گزارش تصمیم‌گیری</strong></div></div>
      <div className="report-grid"><aside>{sections.map((section, index) => <button className={index === 0 ? "active" : ""} key={section} type="button">{section}</button>)}</aside><article><span className="report-kicker">Executive narrative</span><h3>خلاصه خودکار بر اساس engine</h3><p>{outputs.dashboards.aiReview.join(" ")}</p><div className="export-actions">{actions.map((action) => <button key={action.kind} type="button" onClick={() => setExportStatus(exportReport(action.kind, project, activeScenario, outputs))}>{action.label}</button>)}</div><p className="soft-note">Excel/CSV، Word و بسته‌های HTML دانلود می‌شوند؛ PDF از مسیر استاندارد چاپ مرورگر ساخته می‌شود.</p>{exportStatus ? <p className="ok-note" role="status">{exportStatus}</p> : null}</article></div>
    </section>
  );
}

function AdvancedPanel({ slug }: { slug: ModuleSlug }) {
  const config = moduleBySlug(slug);
  if (config.advanced === "financials") return <FinancialsAdvanced />;
  if (config.advanced === "valuation") return <ValuationAdvanced />;
  if (config.advanced === "financing") return <FinancingAdvanced />;
  if (config.advanced === "construction") return <ConstructionAdvanced />;
  if (config.advanced === "montecarlo") return <MonteCarloAdvanced />;
  if (config.advanced === "methodology") return <MethodologyPanel />;
  if (config.advanced === "masterdata") return <MasterDataPanel />;
  if (config.advanced === "report") return <ReportPanel slug={slug} />;
  return <GenericAdvanced />;
}

function ModuleHeader({ slug }: { slug: ModuleSlug }) {
  const config = moduleBySlug(slug);
  const { mode, outputs, dirty } = useProject();
  return (
    <>
      <div className="breadcrumbs"><span>پروژه</span><i>/</i><strong>{config.title}</strong></div>
      <section className="module-hero">
        <div>
          <span>{config.eyebrow}</span>
          <h2>{config.title}</h2>
          <p>{config.description}</p>
        </div>
        <div className={classNames("calculation-state", dirty && "dirty")}>
          <i className="state-dot" />
          <div><strong>{dirty ? "نیازمند محاسبه" : "مدل به‌روز است"}</strong><small>{mode === "basic" ? "نمای ساده" : "نمای پیشرفته"} · {new Date(outputs.generatedAt).toLocaleString("fa-IR", { timeZone: "Asia/Tehran", dateStyle: "short", timeStyle: "short" })}</small></div>
        </div>
      </section>
    </>
  );
}

export function ModulePage({ slug }: { slug: ModuleSlug }) {
  const config = moduleBySlug(slug);
  const { mode } = useProject();
  const isDashboard = config.advanced === "dashboard";
  const phaseOneWorkspace =
    slug === "setup" ? <ProjectSetupWorkspace /> :
    slug === "macro" ? <MacroWorkspace /> :
    slug === "industry-template" ? <IndustryTemplateWorkspace /> :
    slug === "market-demand" ? <MarketDemandWorkspace /> :
    null;
  const phaseTwoWorkspace =
    slug === "capacity-production" ? <CapacityProductionWorkspace /> :
    slug === "direct-costs" ? <DirectCostsWorkspace /> :
    slug === "opex" ? <OpexWorkspace /> :
    slug === "capex" ? <CapexWorkspace /> :
    slug === "working-capital" ? <WorkingCapitalWorkspace /> :
    null;

  return (
    <div className="module-page">
      <ModuleHeader slug={slug} />

      {slug === "scenarios" ? <ScenarioManager /> : null}
      {slug === "sensitivity" ? <SensitivityWorkbench /> : null}
      {slug === "financing" ? <FinancingWorkspace /> : null}
      {slug === "construction-cashflow" ? <ConstructionCashFlowWorkspace /> : null}
      {isDashboard ? <DecisionDashboard slug={slug} /> : null}
      {phaseOneWorkspace}
      {phaseTwoWorkspace}

      {slug !== "scenarios" && slug !== "sensitivity" && slug !== "financing" && slug !== "construction-cashflow" && !isDashboard && !phaseOneWorkspace && !phaseTwoWorkspace ? (
        <>
          {mode === "basic" ? (
            <section className="guided-card">
              <UiIcon name="spark" />
              <div><strong>مسیر هدایت‌شده</strong><p>{config.basicGuide}</p></div>
            </section>
          ) : null}
          <div className={classNames("kpi-grid", mode === "basic" && "basic-kpis")}>
            {config.kpis.map((kpi) => <KpiCard key={kpi.id} kpi={kpi} />)}
          </div>
          <FieldSection fields={config.fields} advanced={mode === "advanced"} />
          {mode === "advanced" ? <AdvancedPanel slug={slug} /> : <BasicDecisionPanel />}
        </>
      ) : null}
    </div>
  );
}
