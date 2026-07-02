"use client";

import { useEffect, useMemo, useState } from "react";
import { formatMoney, formatNumber, formatPercent } from "@/lib/format";
import type {
  BreakEvenResult,
  SensitivityAssumptionProvenance,
  SensitivityAssumptions,
  SensitivityMetric,
  SensitivityPoint,
  SensitivityVariable,
} from "@/lib/types";
import { useProject } from "@/store/project-context";
import { UiIcon } from "@/components/project/UiIcon";

const parameters = [
  "قیمت فروش",
  "حجم فروش",
  "درآمد فروش",
  "COGS",
  "OPEX",
  "CAPEX",
  "نرخ ارز",
  "تورم",
  "نرخ تنزیل",
  "نرخ بهره",
  "تاخیر اجرا",
  "دوره وصول",
  "نرخ مالیات",
];

const metricOptions: Array<{ value: SensitivityMetric; label: string }> = [
  { value: "NPV", label: "NPV" },
  { value: "IRR", label: "IRR" },
  { value: "Payback", label: "Payback" },
  { value: "DSCR", label: "DSCR" },
  { value: "EquityValue", label: "ارزش حقوق صاحبان سهام" },
  { value: "BCR", label: "BCR" },
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
  value: number | null | undefined,
  metric: SensitivityMetric,
  project: Parameters<typeof formatMoney>[1],
) => {
  if (metric === "NPV" || metric === "EquityValue") return formatMoney(value, project);
  if (metric === "IRR" || metric === "BCR") return formatPercent(value);
  return formatNumber(value);
};

const unitValue = (
  value: number | string | null | undefined,
  unit: BreakEvenResult["unit"] | SensitivityAssumptionProvenance["unit"] | undefined,
  project: Parameters<typeof formatMoney>[1],
) => {
  if (typeof value === "string") return value;
  if (unit === "money") return formatMoney(value, project);
  if (unit === "percent") return formatPercent(value);
  if (unit === "months") return `${formatNumber(value)} ماه`;
  return formatNumber(value);
};

const shockValue = (value: number, changeType: SensitivityVariable["changeType"]) =>
  changeType === "percent" ? formatPercent(value) : formatNumber(value);

const statusLabel = (status: BreakEvenResult["status"]) => {
  if (status === "ok") return "معتبر";
  if (status === "warning") return "نیازمند توجه";
  if (status === "invalid") return "نامعتبر";
  return "یافت نشد در بازه آزمون";
};

const shockRange = (low: number, high: number, steps: number) => {
  const safeSteps = Math.max(3, Math.min(15, Math.round(steps || 3)));
  const values = Array.from({ length: safeSteps }, (_, index) => low + ((high - low) * index) / Math.max(1, safeSteps - 1));
  if (low <= 0 && high >= 0 && !values.some((value) => Math.abs(value) < 1e-6)) values.push(0);
  return Array.from(new Set(values.map((value) => Number(value.toFixed(8))))).sort((left, right) => left - right);
};

const byVariable = (points: SensitivityPoint[]) => {
  const map = new Map<string, SensitivityPoint[]>();
  points.forEach((point) => {
    map.set(point.variableId, [...(map.get(point.variableId) ?? []), point]);
  });
  return map;
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

  const pointsByVariable = useMemo(() => byVariable(outputs.sensitivity.oneWay), [outputs.sensitivity.oneWay]);
  const matrixVariables = draft.variables.slice(0, 2);
  const column = matrixVariables[0];
  const row = matrixVariables[1] ?? matrixVariables[0];
  const columnHeaders = useMemo(() => column ? shockRange(column.low, column.high, column.steps) : [], [column]);
  const rowHeaders = useMemo(() => row ? shockRange(row.low, row.high, row.steps) : [], [row]);
  const matrixValues = outputs.sensitivity.matrix.map((cell) => cell.value).filter((value): value is number => value !== null);
  const matrixMin = Math.min(...matrixValues, 0);
  const matrixMax = Math.max(...matrixValues, 1);
  const maxRange = Math.max(1, ...outputs.sensitivity.tornado.map((item) => item.range));
  const topWarnings = outputs.sensitivity.qualityWarnings.slice(0, mode === "advanced" ? 6 : 3);

  return (
    <div className="sensitivity-workbench">
      <section className="workbench-toolbar">
        <div>
          <span>تحلیل حساسیت</span>
          <h3>نمای {mode === "advanced" ? "پیشرفته" : "ساده"} سناریوی {activeScenario.name}</h3>
          <p>{metricOptions.find((option) => option.value === outputs.sensitivity.selectedMetric)?.label ?? outputs.sensitivity.selectedMetric} مبنا: {metricValue(outputs.sensitivity.baseMetric, outputs.sensitivity.selectedMetric, project)}</p>
        </div>
        <div className="toolbar-actions">
          <label className="metric-selector">
            <span>شاخص خروجی</span>
            <select
              onChange={(event) => setDraft((current) => ({
                ...current,
                selectedMetric: event.target.value as SensitivityMetric,
              }))}
              value={draft.selectedMetric}
            >
              {metricOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <button className="primary-button" onClick={() => applySensitivitySettings(draft)} type="button">
            اعمال تحلیل
          </button>
        </div>
      </section>

      {topWarnings.length ? (
        <section className="panel sensitivity-warning-panel">
          <div className="panel-heading">
            <div><span>Model quality</span><strong>هشدار کیفیت مدل</strong></div>
            <small>{formatNumber(outputs.sensitivity.qualityWarnings.length)} مورد</small>
          </div>
          <div className="diagnostic-grid">
            {topWarnings.map((warning) => (
              <article className={`diagnostic-card ${warning.severity}`} key={warning.id}>
                <span>{warning.sourceModule ?? "Model"}</span>
                <strong>{warning.message}</strong>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {mode === "advanced" ? (
        <>
          <section className="panel sensitivity-provenance-panel">
            <div className="panel-heading">
              <div><span>Assumption provenance</span><strong>منبع داده و مفروضات مبنا</strong></div>
            </div>
            <div className="provenance-grid">
              {outputs.sensitivity.assumptionProvenance.map((item) => (
                <article key={item.id}>
                  <span>{item.sourceModule}</span>
                  <strong>{unitValue(item.value, item.unit, project)}</strong>
                  <small>{item.label}</small>
                </article>
              ))}
            </div>
          </section>

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
                  <label><span>متغیر</span><select onChange={(event) => updateVariable(variable.id, { parameter: event.target.value })} value={variable.parameter}>{parameters.map((item) => <option key={item}>{item}</option>)}</select></label>
                  <label><span>نوع شوک</span><select onChange={(event) => updateVariable(variable.id, { changeType: event.target.value as SensitivityVariable["changeType"] })} value={variable.changeType}><option value="percent">درصدی / نرخ</option><option value="absolute">مطلق</option></select></label>
                  <label><span>حد پایین</span><input onChange={(event) => updateVariable(variable.id, { low: Number(event.target.value) / (variable.changeType === "percent" ? 100 : 1) })} type="number" value={variable.low * (variable.changeType === "percent" ? 100 : 1)} /></label>
                  <label><span>حد بالا</span><input onChange={(event) => updateVariable(variable.id, { high: Number(event.target.value) / (variable.changeType === "percent" ? 100 : 1) })} type="number" value={variable.high * (variable.changeType === "percent" ? 100 : 1)} /></label>
                  <label><span>گام</span><input max="15" min="3" onChange={(event) => updateVariable(variable.id, { steps: Number(event.target.value) })} type="number" value={variable.steps} /></label>
                  <button className="remove-variable" disabled={draft.variables.length <= 2} onClick={() => removeVariable(variable.id)} type="button" aria-label="حذف متغیر"><UiIcon name="trash" size={16} /></button>
                </article>
              ))}
            </div>
          </section>
        </>
      ) : null}

      <section className="sensitivity-insights-grid">
        <article className="panel tornado-panel">
          <div className="panel-heading">
            <div><span>Impact ranking</span><strong>نمودار تورنادو</strong></div>
            <small>{outputs.sensitivity.selectedMetric}</small>
          </div>
          <div className="tornado-chart">
            {outputs.sensitivity.tornado.slice(0, mode === "advanced" ? 10 : 5).map((item, index) => (
              <div className={`tornado-row ${item.status}`} key={item.variableId}>
                <div className="tornado-label"><span>{formatNumber(index + 1)}</span><strong>{item.variable}</strong></div>
                <div className="tornado-bars">
                  <i className="downside" style={{ width: `${Math.max(4, item.range / maxRange * 50)}%` }} />
                  <b />
                  <i className="upside" style={{ width: `${Math.max(4, item.range / maxRange * 50)}%` }} />
                </div>
                <small>{metricValue(item.range, outputs.sensitivity.selectedMetric, project)}</small>
              </div>
            ))}
          </div>
        </article>

        <article className="panel driver-summary">
          <div className="panel-heading"><div><span>Thresholds</span><strong>آستانه شکست</strong></div></div>
          <div className="driver-kpis">
            <div><span>قیمت سر به سر</span><strong>{unitValue(outputs.sensitivity.breakEven.price, "money", project)}</strong></div>
            <div><span>حجم سر به سر</span><strong>{unitValue(outputs.sensitivity.breakEven.volume, "number", project)}</strong></div>
            <div><span>CAPEX بحرانی</span><strong>{unitValue(outputs.sensitivity.breakEven.capex, "money", project)}</strong></div>
            <div><span>نرخ تنزیل بحرانی</span><strong>{unitValue(outputs.sensitivity.breakEven.wacc, "percent", project)}</strong></div>
          </div>
          <div className="insight-callout">
            <UiIcon name="risk" />
            <p>{outputs.sensitivity.breakEven.results.some((item) => item.status === "not_found") ? "برخی آستانه‌ها در بازه آزمون یافت نشدند." : "آستانه‌های معتبر با بازاجرای مدل محاسبه شده‌اند."}</p>
          </div>
        </article>
      </section>

      {mode === "advanced" ? (
        <section className="panel one-way-panel">
          <div className="panel-heading">
            <div><span>One-way sensitivity</span><strong>جدول حساسیت یک‌طرفه</strong></div>
          </div>
          <div className="table-wrap xl">
            <table>
              <thead>
                <tr>
                  <th>متغیر</th>
                  <th>منبع</th>
                  <th>مقدار مبنا</th>
                  <th>شوک پایین</th>
                  <th>خروجی پایین</th>
                  <th>خروجی مبنا</th>
                  <th>شوک بالا</th>
                  <th>خروجی بالا</th>
                  <th>اثر مطلق</th>
                  <th>اثر درصدی</th>
                  <th>کشش</th>
                  <th>وضعیت</th>
                </tr>
              </thead>
              <tbody>
                {outputs.sensitivity.tornado.map((item) => {
                  const points = pointsByVariable.get(item.variableId) ?? [];
                  const low = [...points].sort((left, right) => left.shock - right.shock)[0];
                  const high = [...points].sort((left, right) => right.shock - left.shock)[0];
                  const base = points.find((point) => Math.abs(point.shock) < 1e-6) ?? low;
                  const impact = Math.abs(high?.absoluteImpact ?? low?.absoluteImpact ?? item.range);
                  const percentImpact = Math.max(Math.abs(high?.percentImpact ?? 0), Math.abs(low?.percentImpact ?? 0));
                  const elasticity = high?.elasticity ?? low?.elasticity ?? null;
                  return (
                    <tr key={item.variableId}>
                      <td>{item.variable}</td>
                      <td>{item.sourceModule}</td>
                      <td>{formatNumber(base?.baseValue)}</td>
                      <td>{low ? shockValue(low.shock, low.changeType) : "ناموجود"}</td>
                      <td>{metricValue(low?.metric ?? null, outputs.sensitivity.selectedMetric, project)}</td>
                      <td>{metricValue(base?.baseMetric ?? outputs.sensitivity.baseMetric, outputs.sensitivity.selectedMetric, project)}</td>
                      <td>{high ? shockValue(high.shock, high.changeType) : "ناموجود"}</td>
                      <td>{metricValue(high?.metric ?? null, outputs.sensitivity.selectedMetric, project)}</td>
                      <td>{metricValue(impact, outputs.sensitivity.selectedMetric, project)}</td>
                      <td>{formatPercent(percentImpact)}</td>
                      <td>{formatNumber(elasticity)}</td>
                      <td className={item.status === "ok" ? "ok-cell" : "risk-cell"}>{statusLabel(item.status)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {mode === "advanced" && column && row ? (
        <section className="panel heatmap-panel">
          <div className="panel-heading">
            <div><span>Two-way matrix</span><strong>ماتریس حساسیت {row.label} × {column.label}</strong></div>
            <div className="heatmap-legend"><span>ریسک بالاتر</span><i /><span>ریسک کمتر</span></div>
          </div>
          <div className="table-wrap sensitivity-matrix-wrap">
            <table className="sensitivity-matrix">
              <thead>
                <tr>
                  <th>{row.label} / {column.label}</th>
                  {columnHeaders.map((value) => <th key={value}>{shockValue(value, column.changeType)}</th>)}
                </tr>
              </thead>
              <tbody>
                {rowHeaders.map((rowValue, rowIndex) => (
                  <tr key={rowValue}>
                    <th>{shockValue(rowValue, row.changeType)}</th>
                    {columnHeaders.map((_, colIndex) => {
                      const cell = outputs.sensitivity.matrix[rowIndex * columnHeaders.length + colIndex];
                      const normalized = cell?.value === null || cell?.value === undefined
                        ? 0.5
                        : (cell.value - matrixMin) / Math.max(1, matrixMax - matrixMin);
                      return (
                        <td
                          className={cell?.status === "invalid" ? "risk-cell" : undefined}
                          key={`${rowIndex}-${colIndex}`}
                          style={{ "--heat": normalized } as React.CSSProperties}
                          title={cell?.warnings[0] ?? metricValue(cell?.value ?? null, outputs.sensitivity.selectedMetric, project)}
                        >
                          {cell?.status === "invalid" ? "نامعتبر" : metricValue(cell?.value ?? null, outputs.sensitivity.selectedMetric, project)}
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

      {mode === "advanced" ? (
        <section className="panel threshold-panel">
          <div className="panel-heading">
            <div><span>Break-even</span><strong>تحلیل آستانه شکست</strong></div>
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>آستانه</th><th>منبع</th><th>نتیجه</th><th>بازه آزمون</th><th>وضعیت</th></tr></thead>
              <tbody>
                {outputs.sensitivity.breakEven.results.map((result) => (
                  <tr key={result.id}>
                    <td>{result.label}</td>
                    <td>{result.sourceModule}</td>
                    <td>{result.status === "ok" ? unitValue(result.value, result.unit, project) : result.message ?? "یافت نشد در بازه آزمون"}</td>
                    <td>{unitValue(result.testedMin, result.unit, project)} تا {unitValue(result.testedMax, result.unit, project)}</td>
                    <td className={result.status === "ok" ? "ok-cell" : "risk-cell"}>{statusLabel(result.status)}</td>
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
