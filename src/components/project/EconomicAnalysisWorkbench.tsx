"use client";

import { type CSSProperties } from "react";
import { classNames, formatMoney, formatNumber, formatPercent } from "@/lib/format";
import type { EconomicAnalysisYear, EconomicConversionAssumption, EconomicDiagnostic, ModelSourceReference, Project } from "@/lib/types";
import { useProject } from "@/store/project-context";

const diagnosticLabel: Record<EconomicDiagnostic["severity"], string> = {
  error: "خطا",
  warning: "هشدار",
  info: "کنترل",
};

const assumptionStatusLabel: Record<EconomicConversionAssumption["status"], string> = {
  modeled: "مدل‌شده",
  missing: "تکمیل نشده",
  watch: "نیازمند بررسی",
};

const formatUnitValue = (
  value: number | string | null,
  unit: ModelSourceReference["unit"] | EconomicConversionAssumption["unit"] | "money" | "percent" | "ratio" | "number" | "year",
  project: Project,
) => {
  if (typeof value === "string") return value;
  if (unit === "money") return formatMoney(value, project);
  if (unit === "percent") return formatPercent(value);
  if (unit === "ratio") return value === null ? "ناموجود" : `${formatNumber(value)}x`;
  if (unit === "year") return value === null ? "ناموجود" : `${formatNumber(value)} سال`;
  return formatNumber(value);
};

const selectKeyYearRows = <T extends { year: number }>(rows: T[], horizon: number) => {
  const years = [0, 1, 5, 10, 15, horizon].filter((year, index, list) =>
    year <= horizon && list.indexOf(year) === index,
  );
  return years.map((year) => rows.find((row) => row.year === year)).filter((row): row is T => Boolean(row));
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

function EconomicClientYearTable({ rows, project }: { rows: EconomicAnalysisYear[]; project: Project }) {
  return (
    <section className="panel wide-panel financial-client-year-panel">
      <div className="panel-heading">
        <div>
          <span>سال‌های کلیدی</span>
          <strong>جدول فشرده جریان منفعت و هزینه اقتصادی</strong>
        </div>
        <small>نمای کارفرمایی؛ جدول کامل فقط در نمای پیشرفته</small>
      </div>
      <div className="financial-client-table-shell">
        <table className="financial-client-table">
          <thead>
            <tr>
              <th>سال</th>
              <th>منافع اقتصادی</th>
              <th>هزینه‌های اقتصادی</th>
              <th>حذف انتقالات</th>
              <th>خالص منافع</th>
              <th>ضریب اجتماعی</th>
              <th>تجمعی تنزیلی</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.year}>
                <th>سال {formatNumber(row.year, { maximumFractionDigits: 0 })}</th>
                <td>{formatMoney(row.economicBenefits, project)}</td>
                <td>{formatMoney(row.economicCosts, project)}</td>
                <td>{formatMoney(row.transferAdjustment, project)}</td>
                <td>{formatMoney(row.netEconomicBenefit, project)}</td>
                <td>{formatNumber(row.socialDiscountFactor)}</td>
                <td>{formatMoney(row.cumulativeDiscountedNetEconomicBenefit, project)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
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
  rows: EconomicAnalysisYear[];
  value: (row: EconomicAnalysisYear) => number;
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

function DiagnosticGrid({ diagnostics }: { diagnostics: EconomicDiagnostic[] }) {
  return (
    <section className="panel rf-check-panel">
      <div className="panel-heading">
        <div>
          <span>کنترل‌های تحلیل اقتصادی</span>
          <strong>کنترل‌های صحت تحلیل اقتصادی</strong>
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

function SourcePanel({ sources, project }: { sources: ModelSourceReference[]; project: Project }) {
  return (
    <section className="panel financial-source-panel">
      <div className="panel-heading">
        <div>
          <span>ردیابی منبع تحلیل اقتصادی</span>
          <strong>منبع اعداد تحلیل اقتصادی</strong>
        </div>
        <small>ورودی‌های تکراری در این تب بازنویسی نمی‌شوند</small>
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

function ConversionPanel({ assumptions, project }: { assumptions: EconomicConversionAssumption[]; project: Project }) {
  return (
    <section className="panel financial-source-panel">
      <div className="panel-heading">
        <div>
          <span>قیمت‌گذاری سایه‌ای</span>
          <strong>ضرایب تبدیل و قیمت‌های سایه‌ای</strong>
        </div>
        <small>مقادیر تکمیل‌نشده با قطعیت جعلی نمایش داده نمی‌شوند</small>
      </div>
      <div className="financial-source-grid">
        {assumptions.map((assumption) => (
          <article key={assumption.id}>
            <span>{assumption.sourceLabel}</span>
            <strong>{assumption.label}</strong>
            <b>{formatUnitValue(assumption.value, assumption.unit, project)}</b>
            <small className={assumption.status === "missing" ? "risk-cell" : assumption.status === "watch" ? "watch-cell" : "ok-cell"}>
              {assumptionStatusLabel[assumption.status]} | {assumption.note}
            </small>
          </article>
        ))}
      </div>
    </section>
  );
}

export function EconomicAnalysisWorkbench() {
  const { activeScenario, mode, outputs, project } = useProject();
  const economic = outputs.economic;
  const summary = economic.summary;
  const visibleDiagnostics = mode === "advanced" ? summary.diagnostics : summary.diagnostics.filter((item) => item.severity !== "info").slice(0, 4);
  const mainTone = summary.decisionStatus === "acceptable" ? "success" : summary.decisionStatus === "critical" ? "danger" : "warning";
  const eirrTone = economic.eirr !== null && economic.eirr >= summary.socialDiscountRate ? "success" : "warning";
  const clientRows = selectKeyYearRows(economic.annualRows, project.modelHorizonYears);

  return (
    <div className="rf-workbench">
      <section className="rf-toolbar">
        <div>
          <span>گزارش تحلیل اقتصادی و اجتماعی</span>
          <h3>ارزیابی اقتصادی سناریوی {activeScenario.name}</h3>
          <p>نرخ تنزیل اجتماعی: {formatPercent(summary.socialDiscountRate)} | ضریب تبدیل استاندارد: {formatNumber(summary.standardConversionFactor)} | ضریب نرخ ارز سایه‌ای: {formatNumber(summary.shadowExchangeRateFactor)}</p>
        </div>
      </section>

      <section className="financial-kpi-grid">
        <KpiCard label="ارزش فعلی خالص اقتصادی (ENPV)" value={economic.enpv} unit="money" note={summary.decisionLabel} tone={mainTone} project={project} />
        <KpiCard label="نرخ بازده داخلی اقتصادی (EIRR)" value={economic.eirr} unit="percent" note={`نرخ اجتماعی ${formatPercent(summary.socialDiscountRate)}`} tone={eirrTone} project={project} />
        <KpiCard label="نسبت منفعت به هزینه اقتصادی" value={economic.ebcr} unit="ratio" note="ارزش فعلی منافع / ارزش فعلی هزینه‌ها" tone={economic.ebcr !== null && economic.ebcr >= 1 ? "success" : "danger"} project={project} />
        <KpiCard label="ارزش افزوده اقتصادی" value={economic.valueAdded} unit="money" note="ارزش فعلی ارزش افزوده" tone={economic.valueAdded >= 0 ? "success" : "warning"} project={project} />
        <KpiCard label="ارزش فعلی منافع اقتصادی" value={economic.presentValueBenefits} unit="money" note="منافع عمومی و بازار اصلاح‌شده" tone="success" project={project} />
        <KpiCard label="ارزش فعلی هزینه‌های اقتصادی" value={economic.presentValueCosts} unit="money" note="CAPEX، OPEX، COGS و هزینه خارجی" tone={economic.presentValueCosts > economic.presentValueBenefits ? "warning" : "success"} project={project} />
        <KpiCard label="دوره بازگشت اقتصادی" value={economic.economicPayback} unit="year" note="بر مبنای خالص منافع اقتصادی" tone={economic.economicPayback === null ? "warning" : "success"} project={project} />
        <KpiCard label="اختلاف ENPV و NPV مالی" value={summary.npvDifference} unit="money" note="اثر قیمت سایه و منافع عمومی" tone={summary.npvDifference >= 0 ? "success" : "warning"} project={project} />
      </section>

      <section className="panel rf-interpretation-panel">
        <div>
          <span>جمع‌بندی توجیه اقتصادی</span>
          <strong>{summary.decisionLabel}</strong>
          <p>{summary.decisionNarrative}</p>
        </div>
        <div>
          <span>تفاوت تحلیل مالی و اقتصادی</span>
          <p>تحلیل مالی سودآوری پروژه برای سرمایه‌گذار و سهامدار را می‌سنجد؛ تحلیل اقتصادی منفعت خالص برای اقتصاد ملی و جامعه را با نرخ تنزیل اجتماعی، قیمت سایه‌ای، حذف انتقالات و منافع خارجی بررسی می‌کند.</p>
          <p>مالیات، یارانه، بهره و برخی پرداخت‌های انتقالی هزینه اجتماعی واقعی نیستند. در مقابل، منافع زیست‌محیطی، اشتغال، صرفه‌جویی ارزی، امنیت انرژی و آثار جانبی مثبت یا منفی باید جداگانه مستند شوند.</p>
        </div>
      </section>

      {visibleDiagnostics.length ? <DiagnosticGrid diagnostics={visibleDiagnostics} /> : null}

      <section className="rf-chart-grid">
        <TrendChart title="منافع اقتصادی سالانه" subtitle="منافع تعدیل‌شده" rows={economic.annualRows} value={(row) => row.economicBenefits} project={project} />
        <TrendChart title="هزینه‌های اقتصادی سالانه" subtitle="هزینه‌های تعدیل‌شده" rows={economic.annualRows} value={(row) => row.economicCosts} project={project} />
        <TrendChart title="خالص منافع اقتصادی تجمعی تنزیلی" subtitle="بازگشت اقتصادی" rows={economic.annualRows} value={(row) => row.cumulativeDiscountedNetEconomicBenefit} project={project} />
      </section>

      <EconomicClientYearTable rows={clientRows} project={project} />

      <section className="financial-bridge-grid">
        <article className="panel financial-bridge-card">
          <div><span>مقایسه مالی و اقتصادی</span></div>
          <strong>{formatMoney(summary.financialNpv, project)}</strong>
          <small>NPV مالی در برابر ENPV {formatMoney(economic.enpv, project)}</small>
          <b className={Math.abs(summary.npvDifference) > 0 ? "ok-cell" : "watch-cell"}>نتیجه اقتصادی مستقل از کپی مالی گزارش شده است</b>
        </article>
        <article className="panel financial-bridge-card">
          <div><span>انتقالات حذف‌شده</span></div>
          <strong>{formatMoney(summary.benefitCostLines.find((line) => line.id === "transfers")?.value ?? 0, project)}</strong>
          <small>مالیات و بهره به عنوان انتقال گزارش می‌شود</small>
          <b className="ok-cell">در هزینه اقتصادی دوباره‌شماری نشده است</b>
        </article>
        <article className="panel financial-bridge-card">
          <div><span>منافع بیرونی خورشیدی</span></div>
          <strong>{formatMoney(summary.benefitCostLines.find((line) => line.id === "environment")?.value ?? 0, project)}</strong>
          <small>CO2 و قیمت کربن هنوز ورودی عددی ندارند</small>
          <b className="watch-cell">ساختار گزارش آماده است؛ ورودی تکمیل شود</b>
        </article>
      </section>

      {mode === "advanced" ? (
        <>
          <ConversionPanel assumptions={summary.conversionAssumptions} project={project} />
          <SourcePanel sources={summary.sourceReferences} project={project} />

          <section className="panel wide-panel financial-statement-panel">
            <div className="panel-heading">
              <div>
                <span>پل منفعت و هزینه</span>
                <strong>پل منفعت-هزینه اقتصادی</strong>
              </div>
              <small>ارزش فعلی و اقلام منبع</small>
            </div>
            <div className="table-wrap rf-table-wrap">
              <table className="rf-detail-table">
                <thead><tr><th>ردیف</th><th>مقدار</th><th>منبع</th></tr></thead>
                <tbody>
                  {summary.benefitCostLines.map((line) => (
                    <tr key={line.id}>
                      <th>{line.label}</th>
                      <td>{formatUnitValue(line.value, line.unit, project)}</td>
                      <td>{line.sourceLabel}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="panel wide-panel financial-statement-panel">
            <div className="panel-heading">
              <div>
                <span>نمای خام پیشرفته</span>
                <strong>جدول سالانه جریان نقد اقتصادی</strong>
              </div>
              <small>قیمت سایه، انتقالات، منافع خارجی و ENCF</small>
            </div>
            <div className="table-wrap xl rf-table-wrap financial-table-wrap">
              <table className="financial-statement-table">
                <thead>
                  <tr>
                    {["سال", "درآمد/منافع مالی مبنا", "تعدیل قیمت سایه‌ای درآمد", "درآمد اقتصادی", "CAPEX اقتصادی", "هزینه مستقیم اقتصادی", "OPEX اقتصادی", "حذف مالیات/انتقالات", "منافع زیست‌محیطی", "صرفه‌جویی انرژی/ارزی", "منافع اشتغال", "هزینه خارجی", "خالص منافع اقتصادی", "ضریب تنزیل اجتماعی", "خالص منافع تنزیل‌شده", "تجمعی تنزیل‌شده"].map((head) => <th key={head}>{head}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {economic.annualRows.map((row) => (
                    <tr key={row.year}>
                      <th>{formatNumber(row.year, { maximumFractionDigits: 0 })}</th>
                      <td>{formatMoney(row.financialRevenue, project)}</td>
                      <td>{formatMoney(row.revenueShadowAdjustment, project)}</td>
                      <td>{formatMoney(row.economicRevenue, project)}</td>
                      <td>{formatMoney(row.economicCapexCost, project)}</td>
                      <td>{formatMoney(row.economicDirectCost, project)}</td>
                      <td>{formatMoney(row.economicOpexCost, project)}</td>
                      <td>{formatMoney(row.transferAdjustment, project)}</td>
                      <td>{formatMoney(row.environmentalBenefit, project)}</td>
                      <td>{formatMoney(row.energySavingBenefit, project)}</td>
                      <td>{formatMoney(row.employmentBenefit, project)}</td>
                      <td>{formatMoney(row.externalCost, project)}</td>
                      <td>{formatMoney(row.netEconomicBenefit, project)}</td>
                      <td>{formatNumber(row.socialDiscountFactor)}</td>
                      <td>{formatMoney(row.discountedNetEconomicBenefit, project)}</td>
                      <td>{formatMoney(row.cumulativeDiscountedNetEconomicBenefit, project)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="panel financial-statement-panel">
            <div className="panel-heading">
              <div>
                <span>حساسیت نرخ تنزیل اجتماعی</span>
                <strong>حساسیت ENPV به نرخ تنزیل اجتماعی</strong>
              </div>
              <small>نرخ مبنا و دو نقطه اطراف آن</small>
            </div>
            <div className="table-wrap rf-table-wrap">
              <table className="rf-detail-table">
                <thead><tr><th>نرخ اجتماعی</th><th>ENPV</th></tr></thead>
                <tbody>
                  {summary.sensitivityToSocialDiscountRate.map((item) => (
                    <tr key={item.rate}>
                      <th>{formatPercent(item.rate)}</th>
                      <td>{formatMoney(item.enpv, project)}</td>
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
