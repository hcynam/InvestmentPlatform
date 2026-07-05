"use client";

import { useEffect, useMemo, useState } from "react";
import { classNames, formatMoney, formatNumber, formatPercent } from "@/lib/format";
import {
  buildFinancialStatementsWorkbenchModel,
  type StatementLine,
  type StatementSection,
  type WorkbenchCheck,
  type WorkbenchKpi,
  type WorkbenchSource,
} from "@/lib/revenue-financial-workbench";
import type { Project } from "@/lib/types";
import { UiIcon } from "@/components/project/UiIcon";
import { useProject } from "@/store/project-context";

type StatementTab = "all" | StatementSection["id"];
type PeriodMode = "summary" | "all";

const statusLabel: Record<WorkbenchCheck["status"], string> = {
  pass: "قبول",
  warning: "نیازمند توجه",
  fail: "خطا",
};

const sectionKicker: Record<StatementSection["id"], string> = {
  income: "صورت سود و زیان",
  balance: "ترازنامه",
  cashflow: "صورت جریان نقد",
  ratios: "نسبت‌های مالی",
};

const formatUnitValue = (
  value: number | string | null,
  unit: WorkbenchKpi["unit"] | WorkbenchSource["unit"] | StatementLine["unit"],
  project: Project,
) => {
  if (typeof value === "string") return value;
  if (unit === "text") return value === null ? "ناموجود" : String(value);
  if (unit === "money") return formatMoney(value, project);
  if (unit === "unitMoney") return value === null ? "ناموجود" : `${formatNumber(value, { maximumFractionDigits: 0 })} ریال`;
  if (unit === "percent") return formatPercent(value);
  if (unit === "ratio") return value === null ? "بدون نسبت" : `${formatNumber(value)}x`;
  return formatNumber(value);
};

function SegmentedControl<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <div className="rf-segmented-control" role="group" aria-label={label}>
      <span>{label}</span>
      <div>
        {options.map((option) => (
          <button
            className={option.value === value ? "active" : ""}
            key={option.value}
            onClick={() => onChange(option.value)}
            type="button"
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function FinancialKpiCard({ kpi, project }: { kpi: WorkbenchKpi; project: Project }) {
  return (
    <article className={classNames("financial-kpi-card", kpi.tone)}>
      <span>{kpi.label}</span>
      <strong>{formatUnitValue(kpi.value, kpi.unit, project)}</strong>
      <small>{kpi.note}</small>
    </article>
  );
}

function CheckGrid({ checks }: { checks: WorkbenchCheck[] }) {
  return (
    <section className="panel rf-check-panel">
      <div className="panel-heading">
        <div>
          <span>کنترل‌های مدل</span>
          <strong>کنترل‌های سه صورت مالی</strong>
        </div>
        <small>{formatNumber(checks.length, { maximumFractionDigits: 0 })} کنترل</small>
      </div>
      <div className="rf-check-grid">
        {checks.map((check) => (
          <article className={check.status} key={check.id}>
            <div>
              <b>{statusLabel[check.status]}</b>
              <span>{check.label}</span>
            </div>
            <strong>{check.message}</strong>
            <small>{check.evidence}</small>
          </article>
        ))}
      </div>
    </section>
  );
}

function SourcePanel({ sources, project }: { sources: WorkbenchSource[]; project: Project }) {
  return (
    <section className="panel financial-source-panel">
      <div className="panel-heading">
        <div>
          <span>ردیابی منبع صورت‌ها</span>
          <strong>منبع اعداد صورت‌های مالی</strong>
        </div>
        <small>قابل ویرایش در تب‌های مبدا</small>
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

function StatementTable({
  section,
  years,
  indexes,
  project,
  compact,
}: {
  section: StatementSection;
  years: number[];
  indexes: number[];
  project: Project;
  compact: boolean;
}) {
  return (
    <section className={classNames("panel wide-panel financial-statement-panel", compact && "client-summary")}>
      <div className="panel-heading">
        <div>
          <span>{compact ? sectionKicker[section.id] : "نمای خام پیشرفته"}</span>
          <strong>{section.title}</strong>
        </div>
        <small>{section.subtitle}</small>
      </div>
      {compact ? (
        <div className="financial-client-table-shell">
          <table className="financial-client-table statement-client-table">
            <thead>
              <tr>
                <th>ردیف</th>
                {indexes.map((index) => (
                  <th key={years[index]}>سال {formatNumber(years[index], { maximumFractionDigits: 0 })}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {section.lines.map((line) => (
                <tr className={classNames(line.total && "total-line", line.indent && "indent-line")} key={line.id}>
                  <th>{line.label}</th>
                  {indexes.map((index) => (
                    <td key={`${line.id}-${years[index]}`}>
                      {formatUnitValue(line.values[index] ?? null, line.unit, project)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="table-wrap xl rf-table-wrap financial-table-wrap">
          <table className="financial-statement-table">
            <thead>
              <tr>
                <th>ردیف</th>
                <th>فرمول</th>
                {indexes.map((index) => (
                  <th key={years[index]}>سال {formatNumber(years[index], { maximumFractionDigits: 0 })}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {section.lines.map((line) => (
                <tr className={classNames(line.total && "total-line", line.indent && "indent-line")} key={line.id}>
                  <th>{line.label}</th>
                  <td>{line.formula ?? "-"}</td>
                  {indexes.map((index) => (
                    <td key={`${line.id}-${years[index]}`}>
                      {formatUnitValue(line.values[index] ?? null, line.unit, project)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function BalanceBridge({ model, project }: { model: ReturnType<typeof buildFinancialStatementsWorkbenchModel>; project: Project }) {
  const yearOne = model.rows[1] ?? model.rows[0];
  const finalYear = model.rows.at(-1) ?? yearOne;
  const cashFlow = yearOne.netCashFlow;
  return (
    <section className="financial-bridge-grid">
      <article className="panel financial-bridge-card">
        <div>
          <UiIcon name="results" />
          <span>ترازنامه</span>
        </div>
        <strong>{formatMoney(yearOne.totalAssets, project)}</strong>
        <small>دارایی‌ها در برابر {formatMoney(yearOne.totalLiabilitiesAndEquity, project)} بدهی و حقوق صاحبان سهام</small>
        <b className={yearOne.balanceStatus === "balanced" ? "ok-cell" : "risk-cell"}>
          {yearOne.balanceStatus === "balanced" ? "تراز سال اول برقرار است" : "سال اول نیازمند بررسی تراز است"}
        </b>
      </article>
      <article className="panel financial-bridge-card">
        <div>
          <UiIcon name="spark" />
          <span>حرکت وجه نقد</span>
        </div>
        <strong>{formatMoney(cashFlow, project)}</strong>
        <small>CFO + CFI + CFF برای سال اول بهره‌برداری</small>
        <b className={cashFlow >= 0 ? "ok-cell" : "risk-cell"}>{cashFlow >= 0 ? "افزایش نقد" : "کاهش نقد"}</b>
      </article>
      <article className="panel financial-bridge-card">
        <div>
          <UiIcon name="dashboard" />
          <span>پوشش خدمت بدهی</span>
        </div>
        <strong>{formatUnitValue(model.minDscr, "ratio", project)}</strong>
        <small>هدف بانک: {formatUnitValue(model.targetDscr, "ratio", project)} · میانگین: {formatUnitValue(model.averageDscr, "ratio", project)}</small>
        <b className={model.minDscr !== null && model.minDscr < model.targetDscr ? "risk-cell" : "ok-cell"}>
          DSCR بر پایه CFADS / خدمت بدهی
        </b>
      </article>
      <article className="panel financial-bridge-card">
        <div>
          <UiIcon name="risk" />
          <span>سال پایانی</span>
        </div>
        <strong>{formatMoney(finalYear.balanceCheck, project)}</strong>
        <small>{finalYear.balanceStatus === "balanced" ? "سال پایانی تراز است" : "اختلاف سال پایانی از موتور مالی گزارش شده است"}</small>
        <b className={finalYear.balanceStatus === "balanced" ? "ok-cell" : "risk-cell"}>
          {finalYear.balanceStatus === "balanced" ? "تراز" : "ناترازی قابل مشاهده"}
        </b>
      </article>
    </section>
  );
}

export function FinancialStatementsWorkbench() {
  const { activeScenario, mode, outputs, project } = useProject();
  const [tab, setTab] = useState<StatementTab>("all");
  const [period, setPeriod] = useState<PeriodMode>("summary");
  const model = useMemo(
    () => buildFinancialStatementsWorkbenchModel(project, activeScenario, outputs),
    [activeScenario, outputs, project],
  );
  const summaryYears = [0, 1, 5, 10, project.modelHorizonYears].filter((year, index, list) =>
    year <= project.modelHorizonYears && list.indexOf(year) === index,
  );
  const visibleIndexes = model.years
    .map((year, index) => ({ year, index }))
    .filter((item) => period === "all" || summaryYears.includes(item.year))
    .map((item) => item.index);
  const visibleSections = model.sections.filter((section) => tab === "all" || section.id === tab);
  const visibleKpis = model.kpis.slice(0, mode === "advanced" ? model.kpis.length : 8);
  const compactTables = period !== "all";
  const periodOptions: Array<{ value: PeriodMode; label: string }> = mode === "advanced"
    ? [
      { value: "summary", label: "کلیدی" },
      { value: "all", label: "همه سال‌ها" },
    ]
    : [{ value: "summary", label: "کلیدی" }];

  useEffect(() => {
    if (mode !== "advanced" && period === "all") setPeriod("summary");
  }, [mode, period]);

  return (
    <div className="financial-workbench rf-workbench">
      <section className="workbench-toolbar rf-toolbar">
        <div>
          <span>مدل صورت‌های مالی</span>
          <h3>صورت‌های مالی یکپارچه</h3>
          <p>
            سود و زیان، ترازنامه، جریان نقد، FCFF، FCFE و نسبت‌های بانکی از همان موتور محاسباتی پروژه ساخته می‌شوند.
          </p>
        </div>
        <div className="rf-toolbar-controls">
          <SegmentedControl
            label="صورت مالی"
            onChange={setTab}
            options={[
              { value: "all", label: "همه" },
              { value: "income", label: "سود و زیان" },
              { value: "balance", label: "ترازنامه" },
              { value: "cashflow", label: "جریان نقد" },
              { value: "ratios", label: "نسبت‌ها" },
            ]}
            value={tab}
          />
          <SegmentedControl
            label="دوره"
            onChange={setPeriod}
            options={periodOptions}
            value={period}
          />
        </div>
      </section>

      <section className="rf-context-strip">
        <article>
          <span>سناریوی فعال</span>
          <strong>{activeScenario.name}</strong>
        </article>
        <article>
          <span>سال‌های مدل</span>
          <strong>{formatNumber(model.years.length, { maximumFractionDigits: 0 })} سال</strong>
        </article>
        <article>
          <span>مبنای DSCR</span>
          <strong>CFADS / خدمت بدهی</strong>
        </article>
        <article>
          <span>واحد نمایش</span>
          <strong>{project.displayUnit}</strong>
        </article>
      </section>

      <section className="financial-kpi-grid">
        {visibleKpis.map((kpi) => (
          <FinancialKpiCard key={kpi.id} kpi={kpi} project={project} />
        ))}
      </section>

      <BalanceBridge model={model} project={project} />
      <CheckGrid checks={model.checks} />

      {mode === "advanced" ? <SourcePanel project={project} sources={model.sourceMap} /> : null}

      <div className="financial-statement-stack">
        {visibleSections.map((section) => (
          <StatementTable
            indexes={visibleIndexes}
            compact={compactTables}
            key={section.id}
            project={project}
            section={section}
            years={model.years}
          />
        ))}
      </div>
    </div>
  );
}
