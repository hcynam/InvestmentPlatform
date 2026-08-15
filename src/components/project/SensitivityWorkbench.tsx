"use client";

import { useEffect, useMemo, useState } from "react";
import { formatNumber, formatPercent } from "@/lib/format";
import {
  formatSensitivityMetric,
  formatSensitivityValue,
  formatThresholdStatus,
  metricMetadata,
} from "@/lib/sensitivity-format";
import {
  generateSensitivityRange,
  isSensitivitySnapshotCurrent,
  sensitivityConfigsEqual,
  validateSensitivityConfiguration,
  withSensitivityMetricDraft,
} from "@/lib/sensitivity-engine";
import {
  defaultRiskVariable,
  resolveRiskVariablesFromSensitivity,
  riskVariableKindFromText,
  riskVariableMeta,
  riskVariableSupportedChangeTypes,
  runnableRiskVariableKinds,
  type RiskVariableKind,
} from "@/lib/risk-variable-engine";
import type {
  SensitivityAssumptions,
  SensitivityHeatmapStatus,
  SensitivityMetric,
  SensitivityPoint,
  SensitivityRunStatus,
  SensitivityThresholdStatus,
  SensitivityUnitType,
  SensitivityValidationIssue,
  SensitivityVariable,
} from "@/lib/types";
import { useProject } from "@/store/project-context";
import { UiIcon } from "@/components/project/UiIcon";

const metricOptions: SensitivityMetric[] = ["NPV", "IRR", "Payback", "DSCR", "EquityValue", "BCR"];

const variableFromKind = (kind: RiskVariableKind, id = `sensitivity-${kind}-${Date.now()}`): SensitivityVariable => {
  const variable = defaultRiskVariable(kind);
  return {
    id,
    parameter: variable.parameter ?? variable.label,
    label: variable.label,
    low: variable.low,
    high: variable.high,
    steps: variable.steps ?? 7,
    changeType: variable.changeType,
    unitType: variable.unitType,
  };
};

const initialDraft = (settings: SensitivityAssumptions): SensitivityAssumptions => {
  const copy = structuredClone(settings);
  if (!copy.variables?.length) copy.variables = [variableFromKind("salesPrice", "sensitivity-sales-price")];
  copy.simpleDriverId = copy.simpleDriverId && copy.variables.some((variable) => variable.id === copy.simpleDriverId)
    ? copy.simpleDriverId
    : copy.variables[0]?.id;
  return copy;
};

const numericValue = (value: string, divisor = 1) => value === "" ? Number.NaN : Number(value) / divisor;
const displayInputValue = (value: number, multiplier = 1) => Number.isFinite(value) ? value * multiplier : "";

const runStatusLabel = (status: SensitivityRunStatus) => {
  if (status === "valid") return "معتبر";
  if (status === "validWithBaseRisk") return "معتبر با هشدار مبنا";
  if (status === "watch") return "نیازمند توجه";
  if (status === "noExposure") return "بدون مواجهه";
  if (status === "notApplicable") return "نامرتبط";
  if (status === "modelError") return "خطای مدل";
  return "نامعتبر";
};

const heatmapStatusLabel = (status: SensitivityHeatmapStatus) => {
  if (status === "highRisk") return "ریسک بالا";
  if (status === "watch") return "نیازمند توجه";
  if (status === "acceptable") return "قابل قبول";
  if (status === "strong") return "قوی";
  return "نامعتبر";
};

const statusClass = (status: SensitivityRunStatus | SensitivityThresholdStatus) => {
  if (status === "valid") return "ok-cell";
  if (status === "validWithBaseRisk" || status === "watch" || status === "boundaryOnly") return "watch-cell";
  if (["noExposure", "notApplicable", "notFound", "insufficientData"].includes(status)) return "neutral-cell";
  return "risk-cell";
};

const valueText = (
  value: number | string | null | undefined,
  unitType: SensitivityUnitType | undefined,
  project: Parameters<typeof formatSensitivityValue>[1],
  unitLabel?: string,
) => formatSensitivityValue({ value, unitType: unitType ?? "unknown", unitLabel }, project).text;

const shockText = (value: number, variable: SensitivityVariable) => {
  const kind = riskVariableKindFromText(`${variable.parameter} ${variable.label}`);
  if (["inflation", "discountRate", "debtInterest", "taxRate"].includes(kind)) return `${formatNumber(value * 100)} واحد درصد`;
  return variable.changeType === "percent" ? formatPercent(value) : valueText(value, variable.unitType, undefined);
};

const pointsByVariable = (points: SensitivityPoint[]) => {
  const grouped = new Map<string, SensitivityPoint[]>();
  points.forEach((point) => grouped.set(point.variableId, [...(grouped.get(point.variableId) ?? []), point]));
  return grouped;
};

const issueFor = (issues: SensitivityValidationIssue[], variableId: string | undefined, field: string) =>
  issues.find((issue) => issue.field === field && (!variableId || issue.variableId === variableId));

export function SensitivityWorkbench() {
  const { activeScenario, outputs, project, mode, dirty, applySensitivitySettings } = useProject();
  const [draft, setDraft] = useState<SensitivityAssumptions>(() => initialDraft(activeScenario.assumptions.sensitivity));
  const [calculating, setCalculating] = useState(false);
  const [failed, setFailed] = useState(false);
  const [selectedCell, setSelectedCell] = useState<string | null>(null);
  const [thresholdDriverId, setThresholdDriverId] = useState(() => activeScenario.assumptions.sensitivity.thresholdVariableId ?? "");

  useEffect(() => {
    setDraft(initialDraft(activeScenario.assumptions.sensitivity));
    setThresholdDriverId(activeScenario.assumptions.sensitivity.thresholdVariableId ?? "");
    setFailed(false);
  }, [activeScenario.id, activeScenario.assumptions.sensitivity]);

  const baseScenario = project.scenarios.find((scenario) => scenario.type === "base") ?? project.scenarios[0];
  const applied = outputs.sensitivity.applied;
  const appliedConfig = applied?.config ?? null;
  const requestedAnalysisMode = mode === "advanced" ? "advanced" as const : "simple" as const;
  const validationSettings = useMemo(() => ({ ...draft, analysisMode: requestedAnalysisMode, simpleDriverId: draft.simpleDriverId ?? draft.variables[0]?.id }), [draft, requestedAnalysisMode]);
  const revisionStale = Boolean(applied) && (!isSensitivitySnapshotCurrent(applied, baseScenario.version, activeScenario.id, activeScenario.version) || activeScenario.calculationState !== "calculated");
  const stale = dirty || revisionStale;
  const draftChanged = !sensitivityConfigsEqual(validationSettings, appliedConfig);
  const validationIssues = useMemo(
    () => validateSensitivityConfiguration(project, activeScenario, outputs, validationSettings),
    [activeScenario, outputs, project, validationSettings],
  );
  const ready = !validationIssues.some((issue) => issue.field === "base");
  const lifecycle = calculating ? "calculating" : failed ? "failed" : validationIssues.length ? "invalid" : stale ? "stale" : draftChanged ? "draftChanged" : applied ? "calculated" : "ready";
  const lifecycleLabel = {
    ready: "آماده اجرا",
    draftChanged: "پیش‌نویس تغییر کرده",
    calculating: "در حال محاسبه",
    calculated: "محاسبه جاری",
    stale: "نتیجه قدیمی",
    invalid: "پیکربندی نامعتبر",
    failed: "محاسبه ناموفق",
  }[lifecycle];

  const configuredKinds = useMemo(() => new Set(draft.variables.map((variable) => riskVariableKindFromText(`${variable.parameter} ${variable.label}`))), [draft.variables]);
  const availableToAdd = runnableRiskVariableKinds.filter((kind) => !configuredKinds.has(kind));
  const simpleVariable = draft.variables.find((variable) => variable.id === draft.simpleDriverId) ?? draft.variables[0];
  const resolvedApplied = useMemo(() => appliedConfig ? resolveRiskVariablesFromSensitivity(appliedConfig.variables) : [], [appliedConfig]);
  const appliedVariables = appliedConfig?.analysisMode === "simple"
    ? resolvedApplied.filter((variable) => variable.id === appliedConfig.simpleDriverId).slice(0, 1)
    : resolvedApplied;
  const appliedMetric = outputs.sensitivity.selectedMetric;
  const appliedMetricMeta = outputs.sensitivity.metricMetadata ?? metricMetadata(appliedMetric);
  const baseMetricText = formatSensitivityMetric(outputs.sensitivity.baseMetric, appliedMetric, project);
  const groupedPoints = useMemo(() => pointsByVariable(outputs.sensitivity.oneWay), [outputs.sensitivity.oneWay]);
  const maxDelta = Math.max(1, ...outputs.sensitivity.tornado.flatMap((item) => [Math.abs(item.lowDelta ?? 0), Math.abs(item.highDelta ?? 0)]));
  const matrixColumn = appliedVariables[0];
  const matrixRow = appliedVariables[1];
  const columnHeaders = matrixColumn ? generateSensitivityRange(matrixColumn) : [];
  const rowHeaders = matrixRow ? generateSensitivityRange(matrixRow) : [];
  const currentResults = Boolean(applied) && !stale && !draftChanged && !calculating && !failed;

  const updateVariable = (id: string, patch: Partial<SensitivityVariable>) => setDraft((current) => ({
    ...current,
    variables: current.variables.map((variable) => variable.id === id ? { ...variable, ...patch } : variable),
  }));

  const changeVariableKind = (id: string, kind: RiskVariableKind) => {
    const replacement = variableFromKind(kind, id);
    setDraft((current) => ({
      ...current,
      variables: current.variables.map((variable) => variable.id === id ? replacement : variable),
    }));
  };

  const addVariable = () => {
    const kind = availableToAdd[0];
    if (!kind) return;
    setDraft((current) => ({ ...current, variables: [...current.variables, variableFromKind(kind)] }));
  };

  const removeVariable = (id: string) => setDraft((current) => {
    if (current.variables.length <= 1) return current;
    const variables = current.variables.filter((variable) => variable.id !== id);
    return { ...current, variables, simpleDriverId: current.simpleDriverId === id ? variables[0]?.id : current.simpleDriverId };
  });

  const runSettings = async (settings: SensitivityAssumptions) => {
    if (calculating || dirty) return;
    const issues = validateSensitivityConfiguration(project, activeScenario, outputs, settings);
    if (issues.length) return;
    setCalculating(true);
    setFailed(false);
    await new Promise<void>((resolve) => window.setTimeout(resolve, 250));
    const accepted = applySensitivitySettings(settings);
    if (!accepted) setFailed(true);
    setCalculating(false);
  };

  const run = () => runSettings({ ...draft, analysisMode: requestedAnalysisMode, simpleDriverId: simpleVariable?.id });

  const renderVariableControls = (variable: SensitivityVariable, compact = false) => {
    const kind = riskVariableKindFromText(`${variable.parameter} ${variable.label}`);
    const meta = riskVariableMeta[kind];
    const rateDriver = ["inflation", "discountRate", "debtInterest", "taxRate"].includes(kind);
    const multiplier = variable.changeType === "percent" ? 100 : 1;
    const absoluteUnit = formatSensitivityValue({ value: 0, unitType: meta.unitType }, project).unitLabel;
    const changeUnit = rateDriver ? "واحد درصد" : variable.changeType === "percent" ? "٪" : absoluteUnit;
    const lowError = issueFor(validationIssues, variable.id, "low");
    const highError = issueFor(validationIssues, variable.id, "high");
    const stepError = issueFor(validationIssues, variable.id, "steps");
    const parameterError = issueFor(validationIssues, variable.id, "parameter");
    return (
      <div className={`sensitivity-variable-fields ${compact ? "compact" : ""}`}>
        <label>
          <span>راننده</span>
          <select
            aria-describedby={parameterError ? `error-${variable.id}-parameter` : undefined}
            aria-invalid={Boolean(parameterError)}
            onChange={(event) => changeVariableKind(variable.id, event.target.value as RiskVariableKind)}
            value={kind}
          >
            {runnableRiskVariableKinds.map((optionKind) => {
              const usedElsewhere = configuredKinds.has(optionKind) && optionKind !== kind;
              return <option disabled={usedElsewhere} key={optionKind} value={optionKind}>{riskVariableMeta[optionKind].label}</option>;
            })}
          </select>
          {parameterError ? <small className="field-error" id={`error-${variable.id}-parameter`}>{parameterError.message}</small> : null}
        </label>
        <label>
          <span>نوع تغییر</span>
          <select
            onChange={(event) => updateVariable(variable.id, { changeType: event.target.value as SensitivityVariable["changeType"] })}
            value={variable.changeType}
          >
            {riskVariableSupportedChangeTypes(kind).map((changeType) => <option key={changeType} value={changeType}>{rateDriver ? "دلتا، واحد درصد" : changeType === "percent" ? "درصد نسبت به مبنا" : "دلتای مطلق"}</option>)}
          </select>
        </label>
        <label>
          <span>حد پایین{changeUnit ? ` (${changeUnit})` : ""}</span>
          <input
            aria-describedby={lowError ? `error-${variable.id}-low` : undefined}
            aria-invalid={Boolean(lowError)}
            dir="ltr"
            inputMode="decimal"
            onChange={(event) => updateVariable(variable.id, { low: numericValue(event.target.value, multiplier) })}
            type="number"
            value={displayInputValue(variable.low, multiplier)}
          />
          {lowError ? <small className="field-error" id={`error-${variable.id}-low`}>{lowError.message}</small> : null}
        </label>
        <label>
          <span>حد بالا{changeUnit ? ` (${changeUnit})` : ""}</span>
          <input
            aria-describedby={highError ? `error-${variable.id}-high` : undefined}
            aria-invalid={Boolean(highError)}
            dir="ltr"
            inputMode="decimal"
            onChange={(event) => updateVariable(variable.id, { high: numericValue(event.target.value, multiplier) })}
            type="number"
            value={displayInputValue(variable.high, multiplier)}
          />
          {highError ? <small className="field-error" id={`error-${variable.id}-high`}>{highError.message}</small> : null}
        </label>
        {!compact ? (
          <label>
            <span>تعداد نقاط</span>
            <input
              aria-describedby={stepError ? `error-${variable.id}-steps` : undefined}
              aria-invalid={Boolean(stepError)}
              dir="ltr"
              inputMode="numeric"
              max={draft.matrixEnabled && draft.variables.slice(0, 2).some((item) => item.id === variable.id) ? 11 : 41}
              min={3}
              onChange={(event) => updateVariable(variable.id, { steps: numericValue(event.target.value) })}
              type="number"
              value={displayInputValue(variable.steps)}
            />
            {stepError ? <small className="field-error" id={`error-${variable.id}-steps`}>{stepError.message}</small> : null}
          </label>
        ) : null}
        <div className="driver-provenance"><span>حوزه کسب‌وکار</span><strong>{meta.businessArea}</strong><small>{meta.exposureLogic}</small></div>
      </div>
    );
  };

  return (
    <div className="sensitivity-workbench">
      <section className="sensitivity-context" aria-labelledby="sensitivity-title">
        <div>
          <span>تحلیل حساسیت</span>
          <h3 id="sensitivity-title">زمینه مبنا و سناریوی فعال</h3>
          <p>{activeScenario.type === "base" ? "پروژه مبنا" : `سناریو: ${activeScenario.name}`} · مبنا: {activeScenario.assumptions.macro.calculationBasis} · ارز: {project.currency}</p>
        </div>
        <div className={`sensitivity-lifecycle ${lifecycle}`} aria-live="polite" role="status">
          <span className="state-dot" />
          <div><strong>{lifecycleLabel}</strong><small>{applied ? `آخرین اجرا: ${new Date(applied.generatedAt).toLocaleString("fa-IR")}` : "هنوز اجرای معتبری ثبت نشده است"}</small></div>
        </div>
      </section>

      <section className="panel sensitivity-configuration" aria-labelledby="sensitivity-config-title">
        <div className="panel-heading">
          <div><strong id="sensitivity-config-title">پیکربندی تحلیل</strong><small>تغییرات تا انتخاب «اعمال و محاسبه» فقط پیش‌نویس هستند.</small></div>
        </div>
        <div className="sensitivity-config-top">
          <label>
            <span>شاخص هدف</span>
            <select onChange={(event) => setDraft((current) => withSensitivityMetricDraft(current, event.target.value as SensitivityMetric))} value={draft.selectedMetric}>
              {metricOptions.map((metric) => <option key={metric} value={metric}>{metricMetadata(metric).label}</option>)}
            </select>
          </label>
          <div className="basis-note"><span>دیدگاه و مبنا</span><strong>{metricMetadata(draft.selectedMetric).label}</strong><small>{activeScenario.assumptions.macro.calculationBasis} · {project.currency}</small></div>
        </div>

        {mode === "advanced" ? (
          <div className="advanced-driver-list">
            {draft.variables.map((variable, index) => (
              <article className="sensitivity-variable-row" key={variable.id}>
                <div className="variable-row-heading"><strong>راننده {formatNumber(index + 1)}</strong><button aria-label={`حذف ${variable.label}`} disabled={draft.variables.length <= 1} onClick={() => removeVariable(variable.id)} type="button"><UiIcon name="trash" size={16} /></button></div>
                {renderVariableControls(variable)}
              </article>
            ))}
            <div className="advanced-controls">
              <button className="secondary-button" disabled={!availableToAdd.length} onClick={addVariable} type="button"><UiIcon name="plus" size={16} />افزودن راننده یکتا</button>
              <label className="matrix-toggle"><input checked={Boolean(draft.matrixEnabled)} onChange={(event) => setDraft((current) => ({ ...current, matrixEnabled: event.target.checked }))} type="checkbox" /><span>محاسبه ماتریس دوطرفه برای دو راننده اول</span></label>
            </div>
          </div>
        ) : simpleVariable ? (
          <div className="simple-sensitivity-flow">
            <label className="simple-driver-select"><span>یک راننده</span><select onChange={(event) => setDraft((current) => ({ ...current, simpleDriverId: event.target.value }))} value={simpleVariable.id}>{draft.variables.map((variable) => <option key={variable.id} value={variable.id}>{variable.label}</option>)}</select></label>
            {renderVariableControls(simpleVariable, true)}
          </div>
        ) : null}

        <div className="sensitivity-run-row">
          <div className="validation-summary" aria-live="polite">
            {dirty ? <p className="field-error">ابتدا تغییرات مبنای پروژه را محاسبه کنید؛ نتیجه قبلی قدیمی است.</p> : null}
            {validationIssues.slice(0, 5).map((issue, index) => <p className="field-error" key={`${issue.code}-${issue.variableId ?? issue.field}-${index}`}>{issue.message}</p>)}
            {!dirty && !validationIssues.length ? <p>پیکربندی معتبر است و با اقدام صریح شما اجرا می‌شود.</p> : null}
          </div>
          <button className="primary-button sensitivity-run-button" disabled={calculating || dirty || validationIssues.length > 0} onClick={run} type="button">
            {calculating ? "در حال محاسبه…" : "اعمال و محاسبه"}
          </button>
        </div>
      </section>

      {!ready ? (
        <section className="panel sensitivity-empty-state" role="status">
          <UiIcon name="risk" size={24} />
          <strong>مدل پایه برای تحلیل آماده نیست</strong>
          <p>ورودی‌های زیر باید در ماژول‌های منبع تکمیل شوند:</p>
          <ul>{validationIssues.filter((issue) => issue.field === "base").map((issue) => <li key={`${issue.code}-${issue.message}`}>{issue.message}</li>)}</ul>
        </section>
      ) : !currentResults ? (
        <section className={`panel sensitivity-result-gate ${stale ? "stale" : ""}`} role="status">
          <strong>{stale ? "نتیجه قبلی دیگر جاری نیست" : draftChanged ? "پیش‌نویس آماده اجراست" : "تحلیل را اجرا کنید"}</strong>
          <p>{stale ? "مفروضات یا revision سناریو تغییر کرده است؛ نمودار و جدول قدیمی تا اجرای مجدد نمایش داده نمی‌شوند." : "همه خروجی‌ها از یک snapshot اعمال‌شده ساخته می‌شوند."}</p>
        </section>
      ) : (
        <>
          <section className="sensitivity-primary-results" aria-labelledby="primary-result-title">
            <div><span id="primary-result-title">مقدار مبنا</span><strong>{baseMetricText}</strong><small>{appliedMetricMeta.label}</small></div>
            {outputs.sensitivity.tornado[0] ? (
              <>
                <div><span>سناریوی پایین راننده اصلی</span><strong>{formatSensitivityMetric(outputs.sensitivity.tornado[0].low, appliedMetric, project)}</strong><small>{outputs.sensitivity.tornado[0].variable}</small></div>
                <div><span>سناریوی بالا راننده اصلی</span><strong>{formatSensitivityMetric(outputs.sensitivity.tornado[0].high, appliedMetric, project)}</strong><small>{outputs.sensitivity.tornado[0].variable}</small></div>
              </>
            ) : null}
          </section>

          <section className="panel tornado-panel" aria-labelledby="tornado-title">
            <div className="panel-heading"><div><strong id="tornado-title">خلاصه رتبه‌بندی حساسیت</strong><small>رتبه بر اساس دامنه انتخاب‌شده است و بزرگی اثر به بازه هر راننده وابسته است.</small></div></div>
            <div className="tornado-chart" role="img" aria-label={`نمودار تورنادو برای ${appliedMetricMeta.label}`}>
              {outputs.sensitivity.tornado.map((item, index) => (
                <div className={`tornado-row ${item.status}`} key={item.variableId}>
                  <div className="tornado-label"><span>{formatNumber(index + 1)}</span><strong>{item.variable}</strong></div>
                  <div className="signed-tornado-bars" aria-label={`اثر پایین ${formatSensitivityMetric(item.lowDelta, appliedMetric, project)}؛ اثر بالا ${formatSensitivityMetric(item.highDelta, appliedMetric, project)}`}>
                    {[{ value: item.lowDelta, name: "low" }, { value: item.highDelta, name: "high" }].map((bar) => bar.value === null ? null : <i className={`${bar.name} ${bar.value < 0 ? "negative" : "positive"}`} key={bar.name} style={{ "--bar-width": `${Math.max(2, Math.abs(bar.value) / maxDelta * 48)}%` } as React.CSSProperties} />)}
                    <b aria-hidden="true" />
                  </div>
                  <div className="tornado-values"><small>پایین Δ {formatSensitivityMetric(item.lowDelta, appliedMetric, project)}</small><small>بالا Δ {formatSensitivityMetric(item.highDelta, appliedMetric, project)}</small></div>
                </div>
              ))}
            </div>
          </section>

          {mode === "advanced" ? (
            <>
              <section className="panel one-way-panel" aria-labelledby="one-way-title">
                <div className="panel-heading"><div><strong id="one-way-title">جزئیات یک‌طرفه</strong><small>{appliedMetricMeta.label} · snapshot اعمال‌شده</small></div></div>
                <p className="scroll-hint">برای مشاهده ستون‌های بیشتر، جدول را به‌صورت افقی پیمایش کنید.</p>
                <div aria-label="جدول جزئیات تحلیل حساسیت یک‌طرفه" className="table-wrap sensitivity-table-wrap" role="region" tabIndex={0}>
                  <table className="sensitivity-detail-table">
                    <thead><tr><th>راننده</th><th>حوزه</th><th>مبنا</th><th>ورودی پایین</th><th>خروجی پایین</th><th>Δ پایین</th><th>ورودی بالا</th><th>خروجی بالا</th><th>Δ بالا</th><th>اثر مطلق بیشینه</th><th>اثر درصدی</th><th>کشش</th><th>وضعیت</th><th>علت / هشدار</th></tr></thead>
                    <tbody>
                      {outputs.sensitivity.tornado.map((item) => {
                        const points = groupedPoints.get(item.variableId) ?? [];
                        const low = [...points].sort((left, right) => left.shock - right.shock)[0];
                        const high = [...points].sort((left, right) => right.shock - left.shock)[0];
                        const absoluteImpact = Math.max(Math.abs(item.lowDelta ?? 0), Math.abs(item.highDelta ?? 0));
                        const percentValues = [low?.percentImpact, high?.percentImpact].filter((value): value is number => value !== null && value !== undefined);
                        const elasticityValues = [low?.elasticity, high?.elasticity].filter((value): value is number => value !== null && value !== undefined);
                        const configured = appliedConfig?.variables.find((variable) => variable.id === item.variableId);
                        const kind = configured ? riskVariableKindFromText(`${configured.parameter} ${configured.label}`) : "salesPrice";
                        return (
                          <tr key={item.variableId}>
                            <td>{item.variable}</td><td>{riskVariableMeta[kind].businessArea}</td>
                            <td>{valueText(low?.baseValue ?? null, item.unitType, project)}</td>
                            <td>{low ? `${valueText(low.shockedValue, low.unitType, project)} (${shockText(low.shock, configured ?? variableFromKind(kind))})` : "ناموجود"}</td>
                            <td>{formatSensitivityMetric(low?.metric ?? null, appliedMetric, project)}</td><td>{formatSensitivityMetric(item.lowDelta, appliedMetric, project)}</td>
                            <td>{high ? `${valueText(high.shockedValue, high.unitType, project)} (${shockText(high.shock, configured ?? variableFromKind(kind))})` : "ناموجود"}</td>
                            <td>{formatSensitivityMetric(high?.metric ?? null, appliedMetric, project)}</td><td>{formatSensitivityMetric(item.highDelta, appliedMetric, project)}</td>
                            <td>{formatSensitivityMetric(absoluteImpact, appliedMetric, project)}</td>
                            <td>{percentValues.length ? formatPercent(Math.max(...percentValues.map(Math.abs))) : "ناموجود"}</td>
                            <td>{elasticityValues.length ? formatNumber(elasticityValues.reduce((current, value) => Math.abs(value) > Math.abs(current) ? value : current, 0)) : "ناموجود"}</td>
                            <td className={statusClass(item.status)}>{runStatusLabel(item.status)}</td><td className="wrap-cell">{item.reason ?? item.warnings[0] ?? "بدون هشدار"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>

              {appliedConfig?.matrixEnabled && matrixColumn && matrixRow ? (
                <section className="panel heatmap-panel" aria-labelledby="matrix-title">
                  <div className="panel-heading"><div><strong id="matrix-title">ماتریس حساسیت دوطرفه</strong><small>ردیف: {matrixRow.label} · ستون: {matrixColumn.label} · {appliedMetricMeta.label}</small></div></div>
                  <p className="scroll-hint">ماتریس قابل پیمایش است؛ هر سلول مقدار و برچسب وضعیت متنی دارد.</p>
                  <div aria-label="ماتریس حساسیت دوطرفه" className="table-wrap sensitivity-matrix-wrap" role="region" tabIndex={0}>
                    <table className="sensitivity-matrix">
                      <thead><tr><th>ردیف / ستون</th>{columnHeaders.map((value) => <th key={value}>{shockText(value, appliedConfig.variables[0])}</th>)}</tr></thead>
                      <tbody>{rowHeaders.map((rowValue, rowIndex) => <tr key={rowValue}><th>{shockText(rowValue, appliedConfig.variables[1])}</th>{columnHeaders.map((colValue, colIndex) => {
                        const cell = outputs.sensitivity.matrix[rowIndex * columnHeaders.length + colIndex];
                        const key = `${rowIndex}-${colIndex}`;
                        const baseCell = Math.abs(rowValue) < 1e-6 && Math.abs(colValue) < 1e-6;
                        const description = `${heatmapStatusLabel(cell?.heatmapStatus ?? "invalid")}؛ ${cell?.heatmapReason ?? cell?.reason ?? "مقدار قابل محاسبه نیست"}`;
                        return <td className={`heat-${cell?.heatmapStatus ?? "invalid"} ${baseCell ? "base-cell" : ""}`} key={key}><button aria-label={`${formatSensitivityMetric(cell?.value ?? null, appliedMetric, project)}؛ ${description}`} onClick={() => setSelectedCell(selectedCell === key ? null : key)} type="button"><span>{formatSensitivityMetric(cell?.value ?? null, appliedMetric, project)}</span><small>{cell?.status === "modelError" ? "خطا" : heatmapStatusLabel(cell?.heatmapStatus ?? "invalid")}</small>{baseCell ? <em className="base-cell-badge">مبنا</em> : null}</button>{selectedCell === key ? <div className="matrix-cell-popover" role="status">{description}</div> : null}</td>;
                      })}</tr>)}</tbody>
                    </table>
                  </div>
                </section>
              ) : null}

              <section className="panel threshold-panel" aria-labelledby="threshold-title">
                <div className="panel-heading"><div><strong id="threshold-title">آستانه NPV</strong><small>اسکن فقط برای یک راننده پیکربندی‌شده و به‌صورت درخواستی اجرا می‌شود.</small></div></div>
                <div className="threshold-controls">
                  <label><span>راننده آستانه</span><select onChange={(event) => setThresholdDriverId(event.target.value)} value={thresholdDriverId}><option value="">انتخاب کنید</option>{draft.variables.map((variable) => <option key={variable.id} value={variable.id}>{variable.label}</option>)}</select></label>
                  <button className="secondary-button" disabled={!thresholdDriverId || calculating || dirty || validationIssues.length > 0} onClick={() => appliedConfig && runSettings({ ...appliedConfig, thresholdVariableId: thresholdDriverId })} type="button">محاسبه آستانه NPV</button>
                </div>
                {outputs.sensitivity.breakEven.results.length ? <div aria-label="نتیجه آستانه NPV" className="table-wrap sensitivity-table-wrap" role="region" tabIndex={0}><table className="sensitivity-detail-table threshold-table"><thead><tr><th>آستانه</th><th>حوزه</th><th>مبنا</th><th>نتیجه</th><th>بازه آزمون</th><th>وضعیت</th><th>دلیل</th><th>توصیه</th></tr></thead><tbody>{outputs.sensitivity.breakEven.results.map((result) => <tr key={result.id}><td>{result.label}</td><td>{riskVariableMeta[result.id as RiskVariableKind]?.businessArea ?? "مدل"}</td><td>{valueText(result.baseValue, result.unitType, project)}</td><td>{result.status === "valid" ? valueText(result.value, result.unitType, project) : "ناموجود"}</td><td>{valueText(result.testedMin, result.unitType, project)} تا {valueText(result.testedMax, result.unitType, project)}</td><td className={statusClass(result.status)}>{formatThresholdStatus(result.status)}</td><td className="wrap-cell">{result.reason}</td><td className="wrap-cell">{result.recommendation}</td></tr>)}</tbody></table></div> : <p className="soft-note">برای محاسبه، یک راننده را انتخاب کنید.</p>}
              </section>

              <section className="panel sensitivity-provenance-panel" aria-labelledby="provenance-title">
                <div className="panel-heading"><div><strong id="provenance-title">مالکیت و منشأ کسب‌وکار</strong><small>جزئیات فنی داخلی در رابط نمایش داده نمی‌شوند.</small></div></div>
                <div className="provenance-grid">{appliedVariables.map((variable) => <article key={variable.id}><span>{variable.businessArea}</span><strong>{variable.label}</strong><small>{variable.exposureLogic}</small></article>)}</div>
              </section>
            </>
          ) : null}
        </>
      )}
    </div>
  );
}
