"use client";

import { useEffect, useMemo, useState } from "react";
import { formatMoney, formatNumber, formatPercent } from "@/lib/format";
import type { SensitivityAssumptions, SensitivityVariable } from "@/lib/types";
import { useProject } from "@/store/project-context";
import { UiIcon } from "@/components/project/UiIcon";

const parameters = [
  "قیمت فروش",
  "حجم فروش",
  "COGS",
  "OPEX",
  "CAPEX",
  "نرخ ارز",
  "نرخ تنزیل",
  "نرخ بهره",
  "تاخیر اجرا",
  "دوره وصول",
];

const defaultVariable = (): SensitivityVariable => ({
  id: `sensitivity-${Date.now()}`,
  parameter: "قیمت فروش",
  label: "متغیر جدید",
  low: -0.1,
  high: 0.1,
  steps: 5,
  changeType: "percent",
});

const metricValue = (
  value: number | null,
  metric: SensitivityAssumptions["selectedMetric"],
  project: Parameters<typeof formatMoney>[1],
) => {
  if (metric === "NPV") return formatMoney(value, project);
  if (metric === "IRR") return formatPercent(value);
  return formatNumber(value);
};

export function SensitivityWorkbench() {
  const { activeScenario, outputs, project, mode, applySensitivitySettings } = useProject();
  const [draft, setDraft] = useState<SensitivityAssumptions>(() => structuredClone(activeScenario.assumptions.sensitivity));

  useEffect(() => {
    setDraft(structuredClone(activeScenario.assumptions.sensitivity));
  }, [activeScenario.id, activeScenario.assumptions.sensitivity]);

  const updateVariable = (id: string, patch: Partial<SensitivityVariable>) => {
    setDraft((current) => ({
      ...current,
      variables: current.variables.map((variable) => variable.id === id ? { ...variable, ...patch } : variable),
    }));
  };

  const removeVariable = (id: string) => {
    setDraft((current) => ({
      ...current,
      variables: current.variables.length <= 2
        ? current.variables
        : current.variables.filter((variable) => variable.id !== id),
    }));
  };

  const moveVariable = (index: number, direction: -1 | 1) => {
    setDraft((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.variables.length) return current;
      const variables = [...current.variables];
      [variables[index], variables[target]] = [variables[target], variables[index]];
      return { ...current, variables };
    });
  };

  const matrixVariables = draft.variables.slice(0, 2);
  const column = matrixVariables[0];
  const row = matrixVariables[1] ?? matrixVariables[0];
  const columnHeaders = useMemo(() => {
    if (!column) return [];
    return Array.from({ length: Math.max(2, column.steps) }, (_, index) =>
      column.low + ((column.high - column.low) * index) / (Math.max(2, column.steps) - 1)
    );
  }, [column]);
  const rowHeaders = useMemo(() => {
    if (!row) return [];
    return Array.from({ length: Math.max(2, row.steps) }, (_, index) =>
      row.low + ((row.high - row.low) * index) / (Math.max(2, row.steps) - 1)
    );
  }, [row]);

  const matrixValues = outputs.sensitivity.matrix.map((cell) => cell.value).filter((value): value is number => value !== null);
  const matrixMin = Math.min(...matrixValues, 0);
  const matrixMax = Math.max(...matrixValues, 1);
  const maxRange = Math.max(1, ...outputs.sensitivity.tornado.map((item) => item.range));

  return (
    <div className="sensitivity-workbench">
      <section className="workbench-toolbar">
        <div>
          <span>Dynamic sensitivity model</span>
          <h3>تحلیل محرک‌های ارزش و ریسک</h3>
          <p>متغیرها را اضافه یا مرتب کنید؛ ماتریس و نمودارها از engine دوباره محاسبه می‌شوند.</p>
        </div>
        <div className="toolbar-actions">
          <label className="metric-selector">
            <span>شاخص خروجی</span>
            <select
              onChange={(event) => setDraft((current) => ({
                ...current,
                selectedMetric: event.target.value as SensitivityAssumptions["selectedMetric"],
              }))}
              value={draft.selectedMetric}
            >
              <option value="NPV">NPV</option>
              <option value="IRR">IRR</option>
              <option value="Payback">Payback</option>
              <option value="DSCR">DSCR</option>
            </select>
          </label>
          <button className="primary-button" onClick={() => applySensitivitySettings(draft)} type="button">
            اعمال و به‌روزرسانی تحلیل
          </button>
        </div>
      </section>

      {mode === "advanced" ? (
        <section className="panel sensitivity-builder">
          <div className="panel-heading">
            <div><span>Variables</span><strong>متغیرهای تحلیل</strong></div>
            <button
              className="icon-text-button"
              onClick={() => setDraft((current) => ({ ...current, variables: [...current.variables, defaultVariable()] }))}
              type="button"
            >
              <UiIcon name="plus" size={16} />
              افزودن متغیر
            </button>
          </div>
          <div className="variable-list">
            {draft.variables.map((variable, index) => (
              <article className="variable-row" key={variable.id}>
                <div className="variable-order">
                  <span>{formatNumber(index + 1)}</span>
                  <button disabled={index === 0} onClick={() => moveVariable(index, -1)} type="button" aria-label="انتقال به بالا">↑</button>
                  <button disabled={index === draft.variables.length - 1} onClick={() => moveVariable(index, 1)} type="button" aria-label="انتقال به پایین">↓</button>
                </div>
                <label><span>عنوان</span><input onChange={(event) => updateVariable(variable.id, { label: event.target.value })} value={variable.label} /></label>
                <label><span>پارامتر</span><select onChange={(event) => updateVariable(variable.id, { parameter: event.target.value })} value={variable.parameter}>{parameters.map((item) => <option key={item}>{item}</option>)}</select></label>
                <label><span>نوع تغییر</span><select onChange={(event) => updateVariable(variable.id, { changeType: event.target.value as SensitivityVariable["changeType"] })} value={variable.changeType}><option value="percent">درصدی</option><option value="absolute">مطلق</option></select></label>
                <label><span>حد پایین</span><input onChange={(event) => updateVariable(variable.id, { low: Number(event.target.value) / (variable.changeType === "percent" ? 100 : 1) })} type="number" value={variable.low * (variable.changeType === "percent" ? 100 : 1)} /></label>
                <label><span>حد بالا</span><input onChange={(event) => updateVariable(variable.id, { high: Number(event.target.value) / (variable.changeType === "percent" ? 100 : 1) })} type="number" value={variable.high * (variable.changeType === "percent" ? 100 : 1)} /></label>
                <label><span>تعداد گام</span><input max="15" min="2" onChange={(event) => updateVariable(variable.id, { steps: Number(event.target.value) })} type="number" value={variable.steps} /></label>
                <button className="remove-variable" disabled={draft.variables.length <= 2} onClick={() => removeVariable(variable.id)} type="button" aria-label="حذف متغیر"><UiIcon name="trash" size={16} /></button>
              </article>
            ))}
          </div>
          <p className="soft-note">دو متغیر اول محورهای ماتریس دوبعدی هستند. ترتیب متغیرها را با فلش‌ها تغییر دهید.</p>
        </section>
      ) : (
        <section className="basic-explainer">
          <UiIcon name="spark" />
          <div><strong>نمای ساده</strong><p>مهم‌ترین محرک‌ها و اثر آن‌ها نمایش داده شده‌اند. تعریف متغیر و ماتریس کامل در حالت پیشرفته در دسترس است.</p></div>
        </section>
      )}

      <section className="sensitivity-insights-grid">
        <article className="panel tornado-panel">
          <div className="panel-heading">
            <div><span>Impact ranking</span><strong>محرک‌های اصلی ارزش</strong></div>
            <small>{draft.selectedMetric}</small>
          </div>
          <div className="tornado-chart">
            {outputs.sensitivity.tornado.map((item, index) => (
              <div className="tornado-row" key={item.variable}>
                <div className="tornado-label"><span>{formatNumber(index + 1)}</span><strong>{item.variable}</strong></div>
                <div className="tornado-bars">
                  <i className="downside" style={{ width: `${Math.max(4, item.range / maxRange * 50)}%` }} />
                  <b />
                  <i className="upside" style={{ width: `${Math.max(4, item.range / maxRange * 50)}%` }} />
                </div>
                <small>{metricValue(item.range, draft.selectedMetric, project)}</small>
              </div>
            ))}
          </div>
        </article>

        <article className="panel driver-summary">
          <div className="panel-heading"><div><span>Decision summary</span><strong>جمع‌بندی حساسیت</strong></div></div>
          <div className="driver-kpis">
            <div><span>محرک اول</span><strong>{outputs.sensitivity.tornado[0]?.variable ?? "ناموجود"}</strong></div>
            <div><span>دامنه اثر</span><strong>{metricValue(outputs.sensitivity.tornado[0]?.range ?? null, draft.selectedMetric, project)}</strong></div>
            <div><span>قیمت سربه‌سر</span><strong>{formatNumber(outputs.sensitivity.breakEven.price)}</strong></div>
            <div><span>فروش سربه‌سر</span><strong>{formatMoney(outputs.sensitivity.breakEven.sales, project)}</strong></div>
          </div>
          <div className="insight-callout">
            <UiIcon name="risk" />
            <p>اولویت مدیریت ریسک باید روی متغیرهایی باشد که بیشترین دامنه تغییر در {draft.selectedMetric} ایجاد می‌کنند.</p>
          </div>
        </article>
      </section>

      {mode === "advanced" && column && row ? (
        <section className="panel heatmap-panel">
          <div className="panel-heading">
            <div><span>Two-way matrix</span><strong>ماتریس حساسیت {row.label} × {column.label}</strong></div>
            <div className="heatmap-legend"><span>اثر منفی</span><i /><span>اثر مثبت</span></div>
          </div>
          <div className="table-wrap sensitivity-matrix-wrap">
            <table className="sensitivity-matrix">
              <thead>
                <tr>
                  <th>{row.label} / {column.label}</th>
                  {columnHeaders.map((value) => <th key={value}>{column.changeType === "percent" ? formatPercent(value) : formatNumber(value)}</th>)}
                </tr>
              </thead>
              <tbody>
                {rowHeaders.map((rowValue, rowIndex) => (
                  <tr key={rowValue}>
                    <th>{row.changeType === "percent" ? formatPercent(rowValue) : formatNumber(rowValue)}</th>
                    {columnHeaders.map((_, colIndex) => {
                      const cell = outputs.sensitivity.matrix[rowIndex * columnHeaders.length + colIndex];
                      const normalized = cell?.value === null || cell?.value === undefined
                        ? 0.5
                        : (cell.value - matrixMin) / Math.max(1, matrixMax - matrixMin);
                      return (
                        <td
                          key={`${rowIndex}-${colIndex}`}
                          style={{ "--heat": normalized } as React.CSSProperties}
                          title={metricValue(cell?.value ?? null, draft.selectedMetric, project)}
                        >
                          {metricValue(cell?.value ?? null, draft.selectedMetric, project)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}
