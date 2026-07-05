"use client";

import { type CSSProperties } from "react";
import { classNames, formatMoney, formatNumber, formatPercent } from "@/lib/format";
import type { CashFlowBridgeLine, DcfDiagnostic, DcfValuationYear, ModelSourceReference, Project } from "@/lib/types";
import { useProject } from "@/store/project-context";

const diagnosticLabel: Record<DcfDiagnostic["severity"], string> = {
  error: "خطا",
  warning: "هشدار",
  info: "کنترل",
};

const formatUnitValue = (
  value: number | string | null,
  unit: ModelSourceReference["unit"] | "money" | "percent" | "ratio" | "number" | "year",
  project: Project,
) => {
  if (typeof value === "string") return value;
  if (unit === "money") return formatMoney(value, project);
  if (unit === "percent") return formatPercent(value);
  if (unit === "ratio") return value === null ? "ناموجود" : `${formatNumber(value)}x`;
  if (unit === "year") return value === null ? "ناموجود" : `${formatNumber(value)} سال`;
  return formatNumber(value);
};

function KpiCard({
  label,
  value,
  unit,
  note,
  tone,
  project,
}: {
  label: string;
  value: number | null;
  unit: "money" | "percent" | "ratio" | "number" | "year";
  note: string;
  tone: "success" | "warning" | "danger";
  project: Project;
}) {
  return (
    <article className={classNames("financial-kpi-card", tone)}>
      <span>{label}</span>
      <strong>{formatUnitValue(value, unit, project)}</strong>
      <small>{note}</small>
    </article>
  );
}

function TrendChart({
  title,
  subtitle,
  rows,
  value,
  project,
}: {
  title: string;
  subtitle: string;
  rows: DcfValuationYear[];
  value: (row: DcfValuationYear) => number;
  project: Project;
}) {
  const sampled = rows.filter((row) => row.year > 0).slice(0, 12);
  const values = sampled.map(value);
  const max = Math.max(1, ...values.map((item) => Math.abs(item)));
  return (
    <article className="rf-chart-card">
      <header>
        <div>
          <span>{subtitle}</span>
          <strong>{title}</strong>
        </div>
      </header>
      <div className="rf-bar-chart" role="img" aria-label={`${title} در سال‌های منتخب`}>
        {sampled.map((row) => {
          const current = value(row);
          const height = Math.max(4, Math.abs(current) / max * 100);
          return (
            <div className={classNames(current < 0 && "negative")} key={row.year}>
              <i style={{ "--bar": `${height}%` } as CSSProperties} />
              <small>{formatNumber(row.year, { maximumFractionDigits: 0 })}</small>
              <b>{formatMoney(current, project)}</b>
            </div>
          );
        })}
      </div>
    </article>
  );
}

function SourcePanel({ sources, project }: { sources: ModelSourceReference[]; project: Project }) {
  return (
    <section className="panel financial-source-panel">
      <div className="panel-heading">
        <div>
          <span>ردیابی منبع مفروضات</span>
          <strong>منبع مفروضات و خروجی‌های ارزش‌گذاری</strong>
        </div>
        <small>خواندنی در این تب، قابل ویرایش در تب مبدأ</small>
      </div>
      <div className="financial-source-grid">
        {sources.map((source) => (
          <article key={source.id}>
            <span>{source.sourceLabel}</span>
            <strong>{source.label}</strong>
            <b>{formatUnitValue(source.value, source.unit, project)}</b>
            <a href={source.editHref}>{source.editLabel}</a>
          </article>
        ))}
      </div>
    </section>
  );
}

function BridgePanel({ title, subtitle, lines, project }: { title: string; subtitle: string; lines: CashFlowBridgeLine[]; project: Project }) {
  return (
    <section className="panel financial-statement-panel">
      <div className="panel-heading">
        <div>
          <span>{subtitle}</span>
          <strong>{title}</strong>
        </div>
        <small>سال اول بهره‌برداری</small>
      </div>
      <div className="table-wrap rf-table-wrap">
        <table className="rf-detail-table">
          <thead>
            <tr><th>علامت</th><th>ردیف</th><th>مقدار</th><th>منبع</th></tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr key={line.id}>
                <td>{line.formulaSign}</td>
                <th>{line.label}</th>
                <td>{formatMoney(line.value, project)}</td>
                <td>{line.sourceLabel}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function DiagnosticGrid({ diagnostics }: { diagnostics: DcfDiagnostic[] }) {
  return (
    <section className="panel rf-check-panel">
      <div className="panel-heading">
        <div>
          <span>کنترل‌های ارزش‌گذاری</span>
          <strong>کنترل‌های صحت ارزش‌گذاری</strong>
        </div>
        <small>{formatNumber(diagnostics.length, { maximumFractionDigits: 0 })} کنترل</small>
      </div>
      <div className="rf-check-grid">
        {diagnostics.map((diagnostic) => (
          <article className={diagnostic.severity === "error" ? "fail" : diagnostic.severity} key={diagnostic.id}>
            <div>
              <b>{diagnosticLabel[diagnostic.severity]}</b>
              <span>{diagnostic.label}</span>
            </div>
            <strong>{diagnostic.message}</strong>
            <small>{diagnostic.evidence}</small>
          </article>
        ))}
      </div>
    </section>
  );
}

export function DcfValuationWorkbench() {
  const { activeScenario, mode, outputs, project } = useProject();
  const valuation = outputs.valuation;
  const summary = valuation.summary;
  const visibleDiagnostics = mode === "advanced" ? summary.diagnostics : summary.diagnostics.filter((item) => item.severity !== "info").slice(0, 4);
  const terminalShare = summary.terminalValueShare;
  const irrTone = valuation.irr !== null && valuation.irr >= valuation.appliedDiscountRate ? "success" : "warning";
  const mainTone = summary.decisionStatus === "acceptable" ? "success" : summary.decisionStatus === "critical" ? "danger" : "warning";

  return (
    <div className="rf-workbench">
      <section className="rf-toolbar">
        <div>
          <span>گزارش ارزش‌گذاری DCF</span>
          <h3>ارزش‌گذاری سناریوی {activeScenario.name}</h3>
          <p>مبنای فعال: {summary.basisLabel} | نرخ تنزیل: {formatPercent(valuation.appliedDiscountRate)} | واحد: {project.displayUnit}</p>
        </div>
      </section>

      <section className="financial-kpi-grid">
        <KpiCard label="ارزش فعلی خالص (NPV)" value={valuation.npv} unit="money" note={summary.decisionLabel} tone={mainTone} project={project} />
        <KpiCard label="نرخ بازده داخلی (IRR)" value={valuation.irr} unit="percent" note={`نرخ تنزیل ${formatPercent(valuation.appliedDiscountRate)}`} tone={irrTone} project={project} />
        <KpiCard label="نرخ بازده داخلی تعدیل‌شده (MIRR)" value={valuation.mirr} unit="percent" note={`بازسرمایه‌گذاری ${formatPercent(summary.discountRateBuildUp.costOfEquity)}`} tone={valuation.mirr === null ? "warning" : "success"} project={project} />
        <KpiCard label="دوره بازگشت سرمایه" value={valuation.payback} unit="year" note={`تنزیلی: ${formatUnitValue(valuation.discountedPayback, "year", project)}`} tone={valuation.payback === null ? "warning" : "success"} project={project} />
        <KpiCard label="ارزش فعلی FCFF" value={summary.presentValueFcff} unit="money" note="جریان نقد آزاد شرکت" tone={summary.presentValueFcff >= 0 ? "success" : "danger"} project={project} />
        <KpiCard label="ارزش فعلی FCFE" value={summary.presentValueFcfe} unit="money" note="جریان نقد آزاد سهامدار" tone={summary.presentValueFcfe >= 0 ? "success" : "danger"} project={project} />
        <KpiCard label="ارزش پایانی" value={valuation.discountedTerminalValue} unit="money" note={`سهم: ${formatPercent(terminalShare)}`} tone={terminalShare !== null && terminalShare > 0.6 ? "warning" : "success"} project={project} />
        <KpiCard label="حداقل DSCR" value={summary.minimumDscr} unit="ratio" note="در صورت وجود بدهی" tone={summary.minimumDscr !== null && summary.minimumDscr < 1.25 ? "warning" : "success"} project={project} />
      </section>

      <section className="panel rf-interpretation-panel">
        <div>
          <span>جمع‌بندی تصمیم سرمایه‌گذاری</span>
          <strong>{summary.decisionLabel}</strong>
          <p>{summary.decisionNarrative}</p>
        </div>
        <div>
          <span>برداشت مدیریتی</span>
          <p>FCFF برای ارزش پروژه با WACC استفاده شده و FCFE اثر دریافت بدهی و بازپرداخت اصل را برای سهامدار نشان می‌دهد. اگر FCFE از FCFF فاصله زیادی دارد، علت اصلی در ساختار تأمین مالی و زمان‌بندی بدهی است.</p>
        </div>
      </section>

      {visibleDiagnostics.length ? <DiagnosticGrid diagnostics={visibleDiagnostics} /> : null}

      <section className="rf-chart-grid">
        <TrendChart title="روند FCFF سالانه" subtitle="جریان نقد آزاد شرکت" rows={valuation.annualRows} value={(row) => row.fcff} project={project} />
        <TrendChart title="روند FCFE سالانه" subtitle="اثر بدهی بر سهامدار" rows={valuation.annualRows} value={(row) => row.fcfe} project={project} />
        <TrendChart title="جریان نقد تنزیل‌شده تجمعی" subtitle="نقطه بازگشت تنزیلی" rows={valuation.annualRows} value={(row) => row.cumulativeDiscountedFcff} project={project} />
      </section>

      <section className="financial-bridge-grid">
        <article className="panel financial-bridge-card">
          <div><span>WACC</span></div>
          <strong>{formatPercent(summary.discountRateBuildUp.appliedDiscountRate)}</strong>
          <small>نرخ اسمی {formatPercent(summary.discountRateBuildUp.nominalWacc)} | نرخ واقعی {formatPercent(summary.discountRateBuildUp.realWacc)}</small>
          <b className="ok-cell">مبنای نرخ با جریان نقد فعال کنترل شده است</b>
        </article>
        <article className="panel financial-bridge-card">
          <div><span>هزینه بدهی پس از مالیات</span></div>
          <strong>{formatPercent(summary.discountRateBuildUp.afterTaxCostOfDebt)}</strong>
          <small>وزن بدهی {formatPercent(summary.discountRateBuildUp.debtWeight)} | وزن حقوق صاحبان سهام {formatPercent(summary.discountRateBuildUp.equityWeight)}</small>
          <b className={summary.discountRateBuildUp.afterTaxCostOfDebt === null ? "neutral-cell" : "ok-cell"}>از ساختار تأمین مالی خوانده شده است</b>
        </article>
        <article className="panel financial-bridge-card">
          <div><span>ارزش پایانی</span></div>
          <strong>{formatMoney(summary.terminalDiagnostic.discountedTerminalValue, project)}</strong>
          <small>روش گوردون | رشد پایانی {formatPercent(summary.terminalDiagnostic.terminalGrowthRate)}</small>
          <b className={summary.terminalDiagnostic.valid ? "ok-cell" : "risk-cell"}>{summary.terminalDiagnostic.valid ? "رشد پایانی معتبر است" : "رشد پایانی نامعتبر است"}</b>
        </article>
      </section>

      {mode === "advanced" ? (
        <>
          <div className="financial-bridge-grid">
            <BridgePanel title="پل جریان نقد آزاد شرکت (FCFF)" subtitle="از EBIT تا FCFF" lines={summary.fcffBridge} project={project} />
            <BridgePanel title="پل جریان نقد آزاد سهامدار (FCFE)" subtitle="از سود خالص تا FCFE" lines={summary.fcfeBridge} project={project} />
          </div>

          <SourcePanel sources={summary.sourceReferences} project={project} />

          <section className="panel wide-panel financial-statement-panel">
            <div className="panel-heading">
              <div>
                <span>جدول سالانه DCF</span>
                <strong>جدول سالانه ارزش‌گذاری DCF</strong>
              </div>
              <small>FCFF، FCFE، ضریب تنزیل و تجمعی</small>
            </div>
            <div className="table-wrap xl rf-table-wrap financial-table-wrap">
              <table className="financial-statement-table">
                <thead>
                  <tr>
                    {["سال", "درآمد", "EBITDA", "EBIT", "مالیات نقدی", "استهلاک", "CAPEX", "تغییر سرمایه در گردش", "FCFF", "خالص بدهی", "FCFE", "ضریب تنزیل", "FCFF تنزیل‌شده", "FCFE تنزیل‌شده", "FCFF تجمعی", "FCFF تنزیلی تجمعی"].map((head) => <th key={head}>{head}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {valuation.annualRows.map((row) => (
                    <tr key={row.year}>
                      <th>{formatNumber(row.year, { maximumFractionDigits: 0 })}</th>
                      <td>{formatMoney(row.revenue, project)}</td>
                      <td>{formatMoney(row.ebitda, project)}</td>
                      <td>{formatMoney(row.ebit, project)}</td>
                      <td>{formatMoney(row.cashTax, project)}</td>
                      <td>{formatMoney(row.depreciation, project)}</td>
                      <td>{formatMoney(row.capex, project)}</td>
                      <td>{formatMoney(row.changeInWorkingCapital, project)}</td>
                      <td>{formatMoney(row.fcff, project)}</td>
                      <td>{formatMoney(row.netDebtFlow, project)}</td>
                      <td>{formatMoney(row.fcfe, project)}</td>
                      <td>{formatNumber(row.discountFactor)}</td>
                      <td>{formatMoney(row.discountedFcff, project)}</td>
                      <td>{formatMoney(row.discountedFcfe, project)}</td>
                      <td>{formatMoney(row.cumulativeFcff, project)}</td>
                      <td>{formatMoney(row.cumulativeDiscountedFcff, project)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
