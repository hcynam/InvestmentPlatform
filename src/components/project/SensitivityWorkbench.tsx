"use client";

import { useEffect, useMemo, useState } from "react";
import { formatNumber, formatPercent } from "@/lib/format";
import {
  formatSensitivityMetric,
  formatSensitivityValue,
  formatThresholdStatus,
  metricMetadata,
  resolveVolumeUnit,
} from "@/lib/sensitivity-format";
import type {
  BreakEvenResult,
  SensitivityHeatmapStatus,
  SensitivityAssumptions,
  SensitivityMetric,
  SensitivityPoint,
  SensitivityRunStatus,
  SensitivityThresholdStatus,
  SensitivityUnitType,
  SensitivityVariable,
} from "@/lib/types";
import { useProject } from "@/store/project-context";
import { UiIcon } from "@/components/project/UiIcon";

const parameterOptions: Array<{ label: string; unitType: SensitivityUnitType }> = [
  { label: "قیمت فروش", unitType: "unitPrice" },
  { label: "حجم فروش", unitType: "volume" },
  { label: "درآمد فروش", unitType: "totalMoney" },
  { label: "COGS", unitType: "totalMoney" },
  { label: "OPEX", unitType: "totalMoney" },
  { label: "CAPEX", unitType: "totalMoney" },
  { label: "نرخ ارز", unitType: "fxRate" },
  { label: "تورم", unitType: "percentage" },
  { label: "نرخ تنزیل", unitType: "percentage" },
  { label: "نرخ بهره", unitType: "percentage" },
  { label: "تاخیر اجرا", unitType: "months" },
  { label: "دوره وصول", unitType: "days" },
  { label: "نرخ مالیات", unitType: "percentage" },
];

const metricOptions: Array<{ value: SensitivityMetric; label: string }> = [
  { value: "NPV", label: metricMetadata("NPV").label },
  { value: "IRR", label: metricMetadata("IRR").label },
  { value: "Payback", label: metricMetadata("Payback").label },
  { value: "DSCR", label: metricMetadata("DSCR").label },
  { value: "EquityValue", label: metricMetadata("EquityValue").label },
  { value: "BCR", label: metricMetadata("BCR").label },
];

const defaultVariable = (): SensitivityVariable => ({
  id: `sensitivity-${Date.now()}`,
  parameter: "قیمت فروش",
  label: "متغیر جدید",
  low: -0.1,
  high: 0.1,
  steps: 5,
  changeType: "percent",
  unitType: "unitPrice",
});

const shockValue = (value: number, changeType: SensitivityVariable["changeType"]) =>
  changeType === "percent" ? formatPercent(value) : formatNumber(value);

const runStatusLabel = (status: SensitivityRunStatus) => {
  if (status === "valid") return "معتبر";
  if (status === "validWithBaseRisk") return "معتبر، با هشدار مدل پایه";
  if (status === "watch") return "نیازمند توجه";
  if (status === "noExposure") return "بدون مواجهه مؤثر";
  if (status === "immaterial") return "اثر ناچیز";
  if (status === "notApplicable") return "نامرتبط";
  if (status === "modelError") return "خطای مدل";
  return "نامعتبر";
};

const severityLabel = (severity: "error" | "warning" | "info") => {
  if (severity === "error") return "خطا";
  if (severity === "warning") return "هشدار";
  return "اطلاع";
};

const statusClass = (status: SensitivityRunStatus | SensitivityThresholdStatus) => {
  if (status === "valid") return "ok-cell";
  if (status === "validWithBaseRisk" || status === "watch" || status === "boundaryOnly") return "watch-cell";
  if (status === "noExposure" || status === "immaterial" || status === "notApplicable" || status === "notFound" || status === "insufficientData") return "neutral-cell";
  return "risk-cell";
};

const heatmapStatusLabel = (status: SensitivityHeatmapStatus) => {
  if (status === "highRisk") return "ریسک بالا";
  if (status === "watch") return "نیازمند توجه";
  if (status === "acceptable") return "قابل قبول";
  if (status === "strong") return "قوی";
  return "نامعتبر";
};

const valueText = (
  value: number | string | null | undefined,
  unitType: SensitivityUnitType | undefined,
  project: Parameters<typeof formatSensitivityValue>[1],
  unitLabel?: string,
) => formatSensitivityValue({ value, unitType: unitType ?? "unknown", unitLabel }, project).text;

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

const firstAppliedPoint = (points: SensitivityPoint[] | undefined) =>
  points?.find((point) => Math.abs(point.shock) < 1e-6) ?? points?.[0];

export function SensitivityWorkbench() {
  const { activeScenario, outputs, project, mode, applySensitivitySettings } = useProject();
  const [draft, setDraft] = useState<SensitivityAssumptions>(() => structuredClone(activeScenario.assumptions.sensitivity));

  useEffect(() => {
    setDraft(structuredClone(activeScenario.assumptions.sensitivity));
  }, [activeScenario.id, activeScenario.assumptions.sensitivity]);

  const selectedMetric = outputs.sensitivity.selectedMetric;
  const selectedMetricMeta = outputs.sensitivity.metricMetadata ?? metricMetadata(selectedMetric);
  const volumeUnit = resolveVolumeUnit(project);
  const baseMetricText = formatSensitivityMetric(outputs.sensitivity.baseMetric, selectedMetric, project);
  const targetLabel = outputs.sensitivity.target?.label ?? "NPV = 0";

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

  const applyMetric = (metric: SensitivityMetric) => {
    const next = { ...draft, selectedMetric: metric };
    setDraft(next);
    applySensitivitySettings(next);
  };

  const pointsByVariable = useMemo(() => byVariable(outputs.sensitivity.oneWay), [outputs.sensitivity.oneWay]);
  const thresholdById = useMemo(() => new Map(outputs.sensitivity.breakEven.results.map((item) => [item.id, item])), [outputs.sensitivity.breakEven.results]);
  const matrixVariables = draft.variables.slice(0, 2);
  const column = matrixVariables[0];
  const row = matrixVariables[1] ?? matrixVariables[0];
  const columnHeaders = useMemo(() => column ? shockRange(column.low, column.high, column.steps) : [], [column]);
  const rowHeaders = useMemo(() => row ? shockRange(row.low, row.high, row.steps) : [], [row]);
  const maxRange = Math.max(1, ...outputs.sensitivity.tornado.map((item) => item.range));
  const topWarnings = outputs.sensitivity.qualityWarnings.slice(0, mode === "advanced" ? 6 : 3);
  const lowerIsBetter = selectedMetric === "Payback";

  const thresholdText = (id: string) => {
    const result = thresholdById.get(id);
    if (!result) return "ناموجود";
    if (result.status !== "valid") return formatThresholdStatus(result.status);
    return valueText(result.value, result.unitType, project, result.unitLabel);
  };

  return (
    <div className="sensitivity-workbench">
      <section className="workbench-toolbar">
        <div>
          <span>تحلیل حساسیت</span>
          <h3>نمای {mode === "advanced" ? "پیشرفته" : "ساده"} سناریوی {activeScenario.name}</h3>
          <p>شاخص: {selectedMetricMeta.label} | واحد: {selectedMetricMeta.unitLabel} | مقدار مبنا: {baseMetricText}</p>
        </div>
        <div className="toolbar-actions">
          <label className="metric-selector">
            <span>شاخص خروجی</span>
            <select onChange={(event) => applyMetric(event.target.value as SensitivityMetric)} value={selectedMetric}>
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
            <div><span>کیفیت مدل</span><strong>هشدارهای مدل پایه</strong></div>
            <small>{formatNumber(outputs.sensitivity.qualityWarnings.length)} مورد</small>
          </div>
          {mode === "advanced" ? (
            <p className="quality-note">این تحلیل روی مدل دارای هشدار پایه اجرا شده است؛ برای تصمیم نهایی بانکی ابتدا خطاهای مدل پایه را اصلاح کنید.</p>
          ) : null}
          <div className="diagnostic-grid">
            {topWarnings.map((warning) => (
              <article className={`diagnostic-card ${warning.severity}`} key={warning.id}>
                <div className="diagnostic-meta">
                  <b>{severityLabel(warning.severity)}</b>
                  <span>{warning.sourceModule ?? "مدل"}</span>
                </div>
                <strong>{warning.message}</strong>
                {warning.recommendation ? <small>{warning.recommendation}</small> : null}
                {warning.actionSlug ? <a className="diagnostic-action" href={`../${warning.actionSlug}`}>رفتن به ماژول</a> : null}
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {mode === "advanced" ? (
        <>
          <section className="panel sensitivity-provenance-panel">
            <div className="panel-heading">
              <div><span>ردیابی مفروضات</span><strong>منبع داده و مفروضات مبنا</strong></div>
            </div>
            <div className="provenance-grid">
              {outputs.sensitivity.assumptionProvenance.map((item) => {
                const formatted = formatSensitivityValue({ value: item.value, unitType: item.unitType ?? item.unit ?? "unknown", unitLabel: item.unitLabel }, project);
                return (
                  <article key={item.id} title={item.sourcePath}>
                    <span>{item.sourceModule}</span>
                    <strong>{formatted.text}</strong>
                    <small>{item.label}</small>
                    <em>{formatted.unitLabel || "فقط خواندنی"} | فقط خواندنی</em>
                    {formatted.warning ? <small className="risk-text">{formatted.warning}</small> : null}
                  </article>
                );
              })}
            </div>
          </section>

          <section className="panel sensitivity-builder">
            <div className="panel-heading">
              <div><span>متغیرها</span><strong>متغیرهای تحلیل</strong></div>
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
              {draft.variables.map((variable, index) => {
                const option = parameterOptions.find((item) => item.label === variable.parameter);
                const point = firstAppliedPoint(pointsByVariable.get(variable.id));
                const baseUnit = point?.unitType ?? variable.unitType ?? option?.unitType ?? "unknown";
                return (
                  <article className="variable-row" key={variable.id}>
                    <div className="variable-order">
                      <span>{formatNumber(index + 1)}</span>
                      <button disabled={index === 0} onClick={() => moveVariable(index, -1)} type="button" aria-label="انتقال به بالا">↑</button>
                      <button disabled={index === draft.variables.length - 1} onClick={() => moveVariable(index, 1)} type="button" aria-label="انتقال به پایین">↓</button>
                    </div>
                    <label>
                      <span>نام نمایشی</span>
                      <input onChange={(event) => updateVariable(variable.id, { label: event.target.value })} value={variable.label} />
                    </label>
                    <label>
                      <span>متغیر کنترل‌شده</span>
                      <select
                        onChange={(event) => {
                          const nextOption = parameterOptions.find((item) => item.label === event.target.value);
                          updateVariable(variable.id, {
                            parameter: event.target.value,
                            unitType: nextOption?.unitType,
                            label: variable.label === variable.parameter || variable.label === "متغیر جدید" ? event.target.value : variable.label,
                          });
                        }}
                        value={variable.parameter}
                      >
                        {parameterOptions.map((item) => <option key={item.label}>{item.label}</option>)}
                      </select>
                    </label>
                    <label><span>نوع شوک</span><select onChange={(event) => updateVariable(variable.id, { changeType: event.target.value as SensitivityVariable["changeType"] })} value={variable.changeType}><option value="percent">درصدی / نرخ</option><option value="absolute">مطلق</option></select></label>
                    <label><span>حد پایین</span><input onChange={(event) => updateVariable(variable.id, { low: Number(event.target.value) / (variable.changeType === "percent" ? 100 : 1) })} type="number" value={variable.low * (variable.changeType === "percent" ? 100 : 1)} /></label>
                    <label><span>حد بالا</span><input onChange={(event) => updateVariable(variable.id, { high: Number(event.target.value) / (variable.changeType === "percent" ? 100 : 1) })} type="number" value={variable.high * (variable.changeType === "percent" ? 100 : 1)} /></label>
                    <label><span>گام</span><input max="15" min="3" onChange={(event) => updateVariable(variable.id, { steps: Number(event.target.value) })} type="number" value={variable.steps} /></label>
                    <div className="variable-source">
                      <span>{point?.sourceModule ?? variable.sourceModule ?? "منبع پس از اجرای تحلیل"}</span>
                      <strong>{valueText(point?.baseValue ?? null, baseUnit, project)}</strong>
                    </div>
                    <button className="remove-variable" disabled={draft.variables.length <= 2} onClick={() => removeVariable(variable.id)} type="button" aria-label="حذف متغیر"><UiIcon name="trash" size={16} /></button>
                  </article>
                );
              })}
            </div>
          </section>
        </>
      ) : null}

      <section className="sensitivity-insights-grid">
        <article className="panel tornado-panel">
          <div className="panel-heading">
            <div><span>رتبه‌بندی اثر</span><strong>نمودار تورنادو</strong></div>
            <small>شاخص: {selectedMetricMeta.label} | واحد: {selectedMetricMeta.unitLabel} | مقدار مبنا: {baseMetricText}</small>
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
                <small>{formatSensitivityMetric(item.range, selectedMetric, project)}</small>
              </div>
            ))}
          </div>
        </article>

        <article className="panel driver-summary">
          <div className="panel-heading"><div><span>آستانه‌ها</span><strong>آستانه شکست</strong></div></div>
          <div className="driver-kpis">
            <div><span>قیمت سر به سر</span><strong>{thresholdText("price")}</strong></div>
            <div><span>حجم سر به سر</span><strong>{thresholdText("volume")}</strong></div>
            <div><span>CAPEX بحرانی</span><strong>{thresholdText("capex")}</strong></div>
            <div><span>نرخ تنزیل بحرانی</span><strong>{thresholdText("wacc")}</strong></div>
          </div>
          <div className="insight-callout">
            <UiIcon name="risk" />
            <p>هدف آستانه شکست: {targetLabel}. تغییر شاخص خروجی، هدف آستانه شکست را به‌صورت خودکار تغییر نمی‌دهد.</p>
          </div>
        </article>
      </section>

      {mode === "advanced" ? (
        <section className="panel one-way-panel">
          <div className="panel-heading">
            <div><span>حساسیت یک‌طرفه</span><strong>جدول حساسیت یک‌طرفه</strong></div>
            <small>شاخص: {selectedMetricMeta.label} | واحد: {selectedMetricMeta.unitLabel} | مقدار مبنا: {baseMetricText}</small>
          </div>
          <div className="table-wrap xl sensitivity-table-wrap">
            <table className="sensitivity-detail-table">
              <thead>
                <tr>
                  <th>متغیر</th>
                  <th>منبع</th>
                  <th>مقدار مبنا</th>
                  <th>ورودی پایین</th>
                  <th>خروجی پایین</th>
                  <th>خروجی مبنا</th>
                  <th>ورودی بالا</th>
                  <th>خروجی بالا</th>
                  <th>اثر مطلق</th>
                  <th>اثر درصدی</th>
                  <th>کشش</th>
                  <th>وضعیت</th>
                  <th>علت / هشدار</th>
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
                  const inputUnit = base?.unitType ?? item.unitType;
                  return (
                    <tr key={item.variableId}>
                      <td>{item.variable}</td>
                      <td>{item.sourceModule}</td>
                      <td>{valueText(base?.baseValue ?? null, inputUnit, project)}</td>
                      <td>{low ? `${valueText(low.shockedValue, low.unitType, project)} (${shockValue(low.shock, low.changeType)})` : "ناموجود"}</td>
                      <td>{formatSensitivityMetric(low?.metric ?? null, selectedMetric, project)}</td>
                      <td>{formatSensitivityMetric(base?.baseMetric ?? outputs.sensitivity.baseMetric, selectedMetric, project)}</td>
                      <td>{high ? `${valueText(high.shockedValue, high.unitType, project)} (${shockValue(high.shock, high.changeType)})` : "ناموجود"}</td>
                      <td>{formatSensitivityMetric(high?.metric ?? null, selectedMetric, project)}</td>
                      <td>{formatSensitivityMetric(impact, selectedMetric, project)}</td>
                      <td>{formatPercent(percentImpact)}</td>
                      <td>{formatNumber(elasticity)}</td>
                      <td className={statusClass(item.status)}>{runStatusLabel(item.status)}</td>
                      <td>{item.reason ?? item.warnings[0] ?? "بدون هشدار"}</td>
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
            <div><span>ماتریس دوطرفه</span><strong>ماتریس حساسیت</strong></div>
            <div className="heatmap-legend">
              <span className="legend-highRisk">ریسک بالا</span>
              <span className="legend-watch">نیازمند توجه</span>
              <span className="legend-acceptable">قابل قبول</span>
              <span className="legend-strong">قوی</span>
            </div>
          </div>
          <div className="matrix-meta-grid">
            <div><span>ردیف‌ها</span><strong>{row.label}</strong></div>
            <div><span>ستون‌ها</span><strong>{column.label}</strong></div>
            <div><span>شاخص / واحد</span><strong>{selectedMetricMeta.label} / {selectedMetricMeta.unitLabel}</strong></div>
            <div><span>مقدار مبنا</span><strong>{baseMetricText}</strong></div>
            <div><span>تفسیر</span><strong>{lowerIsBetter ? "کمتر بهتر است" : "بیشتر بهتر است"}</strong></div>
          </div>
          <div className="table-wrap sensitivity-matrix-wrap">
            <table className="sensitivity-matrix">
              <thead>
                <tr>
                  <th>ردیف‌ها: {row.label} / ستون‌ها: {column.label}</th>
                  {columnHeaders.map((value) => <th key={value}>{shockValue(value, column.changeType)}</th>)}
                </tr>
              </thead>
              <tbody>
                {rowHeaders.map((rowValue, rowIndex) => (
                  <tr key={rowValue}>
                    <th>{shockValue(rowValue, row.changeType)}</th>
                    {columnHeaders.map((colValue, colIndex) => {
                      const cell = outputs.sensitivity.matrix[rowIndex * columnHeaders.length + colIndex];
                      const isBaseCell = Math.abs(rowValue) < 1e-6 && Math.abs(colValue) < 1e-6;
                      return (
                        <td
                          className={`heat-${cell?.heatmapStatus ?? "invalid"} ${cell?.status === "modelError" ? "risk-cell" : ""} ${isBaseCell ? "base-cell" : ""}`}
                          key={`${rowIndex}-${colIndex}`}
                          title={`${cell ? heatmapStatusLabel(cell.heatmapStatus) : "نامعتبر"} - ${cell?.heatmapReason ?? cell?.reason ?? "مقدار قابل محاسبه نیست."}`}
                        >
                          {cell?.status === "modelError" ? "نامعتبر" : formatSensitivityMetric(cell?.value ?? null, selectedMetric, project)}
                          {isBaseCell ? <span className="base-cell-badge">مبنا</span> : null}
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
            <div><span>آستانه شکست</span><strong>تحلیل آستانه شکست</strong></div>
            <small>هدف آستانه شکست: {targetLabel}. تغییر شاخص خروجی، هدف آستانه شکست را خودکار تغییر نمی‌دهد.</small>
          </div>
          <div className="table-wrap sensitivity-table-wrap">
            <table className="sensitivity-detail-table">
              <thead><tr><th>آستانه</th><th>منبع</th><th>هدف</th><th>مقدار مبنا</th><th>نتیجه</th><th>بازه آزمون</th><th>وضعیت</th><th>دلیل</th><th>توصیه</th></tr></thead>
              <tbody>
                {outputs.sensitivity.breakEven.results.map((result: BreakEvenResult) => (
                  <tr key={result.id}>
                    <td>{result.label}</td>
                    <td>{result.sourceModule}</td>
                    <td>{result.target.label}</td>
                    <td>{valueText(result.baseValue, result.unitType, project, result.unitLabel)}</td>
                    <td>{result.status === "valid" ? valueText(result.resultValue, result.unitType, project, result.unitLabel) : "ناموجود"}</td>
                    <td>{valueText(result.testedMin, result.unitType, project, result.unitLabel)} تا {valueText(result.testedMax, result.unitType, project, result.unitLabel)}</td>
                    <td className={statusClass(result.status)}>{formatThresholdStatus(result.status)}</td>
                    <td>{result.reason}</td>
                    <td>{result.recommendation}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="soft-note">واحد حجم: {volumeUnit}. آستانه قیمت با قالب قیمت واحد نمایش داده می‌شود و به‌اشتباه مثل مبلغ کل پروژه مقیاس نمی‌گیرد.</p>
        </section>
      ) : null}
    </div>
  );
}
