"use client";

import { useEffect, useMemo, useState } from "react";
import { classNames, formatMoney, formatNumber, formatPercent } from "@/lib/format";
import {
  scenarioDriverDescriptors,
  scenarioHasNonNeutralAdjustments,
  validateScenarioAdjustments,
  type ScenarioDriverDescriptor,
} from "@/lib/scenario-engine";
import { selectScenarioComparison, type ScenarioDecisionKpi } from "@/lib/scenario-decision-selectors";
import type { ScenarioAdjustments, ScenarioCalculationState } from "@/lib/types";
import { useProject } from "@/store/project-context";

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const groupLabels: Record<ScenarioDriverDescriptor["group"], string> = {
  market: "بازار و درآمد",
  "operating-costs": "هزینه‌های عملیاتی",
  investment: "سرمایه‌گذاری",
  "working-capital": "سرمایه در گردش",
  financing: "تأمین مالی",
  macro: "کلان، ارز و مالیات",
  schedule: "زمان‌بندی",
};

const stateLabels: Record<ScenarioCalculationState, string> = {
  uncalculated: "محاسبه‌نشده",
  calculating: "در حال محاسبه",
  calculated: "محاسبه‌شده",
  stale: "نیازمند محاسبه مجدد",
  invalid: "نامعتبر",
  failed: "محاسبه ناموفق",
};

const shownValue = (value: number, driver: ScenarioDriverDescriptor) =>
  driver.semantic === "percentage-point-delta" ? value * 100 : value;

const storedValue = (text: string, driver: ScenarioDriverDescriptor) => {
  if (!text.trim()) return Number.NaN;
  const value = Number(text);
  return driver.semantic === "percentage-point-delta" ? value / 100 : value;
};

const initialInputText = (adjustments: ScenarioAdjustments) => Object.fromEntries(
  scenarioDriverDescriptors.map((driver) => [driver.key, String(shownValue(adjustments[driver.key], driver))]),
) as Record<ScenarioDriverDescriptor["key"], string>;

const unitLabel = (driver: ScenarioDriverDescriptor) => {
  if (driver.unit === "pp") return "واحد درصد نسبت به مبنا";
  if (driver.unit === "multiplier") return "ضریب (۱ = بدون تغییر)";
  if (driver.unit === "days") return "روز نسبت به مبنا";
  return "ماه";
};

const signed = (value: number) => `${value > 0 ? "+" : ""}${formatNumber(value)}`;

const adjustmentSummary = (driver: ScenarioDriverDescriptor, value: number) => {
  if (driver.semantic === "percentage-point-delta") return `${signed(value * 100)} واحد درصد`;
  if (driver.semantic === "multiplier") return `× ${formatNumber(value)}`;
  if (driver.semantic === "day-delta") return `${signed(value)} روز`;
  return `${formatNumber(value)} ماه`;
};

const formatKpiValue = (kpi: ScenarioDecisionKpi, project: Parameters<typeof formatMoney>[1]) => {
  if (kpi.value === null || !Number.isFinite(kpi.value)) return "ناموجود";
  if (kpi.unit === "money") return formatMoney(kpi.value, project);
  if (kpi.unit === "percent") return formatPercent(kpi.value);
  if (kpi.unit === "years") return `${formatNumber(kpi.value)} سال`;
  if (kpi.unit === "months") return `${formatNumber(kpi.value)} ماه`;
  return formatNumber(kpi.value);
};

const formatKpiDelta = (kpi: ScenarioDecisionKpi, project: Parameters<typeof formatMoney>[1]) => {
  if (kpi.delta === null || !Number.isFinite(kpi.delta)) return "مقایسه‌پذیر نیست";
  if (kpi.unchanged) return "بدون تغییر";
  if (kpi.unit === "money") return `${kpi.delta > 0 ? "+" : ""}${formatMoney(kpi.delta, project)}`;
  if (kpi.unit === "percent") return `${signed(kpi.delta * 100)} واحد درصد`;
  if (kpi.unit === "years") return `${signed(kpi.delta)} سال`;
  return signed(kpi.delta);
};

const formatTimestamp = (value?: string) => {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : new Intl.DateTimeFormat("fa-IR", { dateStyle: "short", timeStyle: "short" }).format(date);
};

export function ScenarioManager() {
  const {
    activeScenario,
    project,
    mode,
    selectScenario,
    addScenario,
    duplicateScenario,
    updateScenario,
    applyScenarioAdjustments,
    deleteScenario,
    calculateScenarioOnDemand,
    setScenarioDraftState,
  } = useProject();
  const baseScenario = project.scenarios.find((scenario) => scenario.type === "base") ?? project.scenarios[0];
  const visibleScenarios = useMemo(
    () => project.scenarios.filter((scenario) => scenario.type === "base" || scenario.type === "custom").sort((left, right) => left.priority - right.priority),
    [project.scenarios],
  );
  const [newScenarioName, setNewScenarioName] = useState("سناریوی جدید");
  const [draft, setDraft] = useState<ScenarioAdjustments>(() => clone(activeScenario.adjustments));
  const [inputText, setInputText] = useState(() => initialInputText(activeScenario.adjustments));
  const [draftDirty, setDraftDirty] = useState(false);
  const [renameId, setRenameId] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState("");
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [comparisonIds, setComparisonIds] = useState<string[]>(() => activeScenario.type === "base" ? [] : [activeScenario.id]);

  useEffect(() => {
    setDraft(clone(activeScenario.adjustments));
    setInputText(initialInputText(activeScenario.adjustments));
    setDraftDirty(false);
    setRenameId(null);
    setDeleteConfirmId(null);
    if (activeScenario.type !== "base") {
      setComparisonIds((current) => current.includes(activeScenario.id) ? current : [activeScenario.id, ...current].slice(0, 3));
    }
  }, [activeScenario.id, activeScenario.adjustments]);

  const validation = useMemo(
    () => validateScenarioAdjustments(baseScenario.assumptions, draft),
    [baseScenario.assumptions, draft],
  );
  useEffect(() => {
    if (activeScenario.type !== "base" && draftDirty) {
      setScenarioDraftState(activeScenario.id, validation.length ? "invalid" : "stale");
    }
  }, [activeScenario.id, activeScenario.type, draftDirty, setScenarioDraftState, validation.length]);
  const errorsByKey = useMemo(() => new Map(validation.map((issue) => [issue.key, issue.message])), [validation]);
  const visibleDrivers = scenarioDriverDescriptors.filter((driver) => mode === "advanced" || driver.mode === "basic");
  const groupedDrivers = Object.entries(groupLabels).map(([group, label]) => ({
    group: group as ScenarioDriverDescriptor["group"],
    label,
    drivers: visibleDrivers.filter((driver) => driver.group === group),
  })).filter((group) => group.drivers.length);
  const currentState: ScenarioCalculationState = validation.length
    ? "invalid"
    : draftDirty
      ? "stale"
      : activeScenario.calculationState ?? "uncalculated";
  const nonNeutralDrivers = scenarioDriverDescriptors.filter((driver) => draft[driver.key] !== driver.neutralValue);

  const baseResult = useMemo(() => calculateScenarioOnDemand(baseScenario.id), [baseScenario.id, calculateScenarioOnDemand]);
  const comparisonResults = useMemo(() => comparisonIds
    .filter((id) => id !== baseScenario.id)
    .map((id) => calculateScenarioOnDemand(id))
    .filter((result): result is NonNullable<typeof result> => Boolean(result)), [baseScenario.id, calculateScenarioOnDemand, comparisonIds]);
  const comparison = useMemo(
    () => baseResult ? selectScenarioComparison(project, baseResult, comparisonResults) : [],
    [baseResult, comparisonResults, project],
  );
  const activeColumn = activeScenario.type === "base"
    ? baseResult ? selectScenarioComparison(project, baseResult, [baseResult])[0] : null
    : comparison.find((column) => column.scenarioId === activeScenario.id) ?? null;

  const updateAdjustment = (driver: ScenarioDriverDescriptor, text: string) => {
    setInputText((current) => ({ ...current, [driver.key]: text }));
    setDraft((current) => ({ ...current, [driver.key]: storedValue(text, driver) }));
    setDraftDirty(true);
  };

  const toggleComparison = (scenarioId: string) => {
    setComparisonIds((current) => {
      if (current.includes(scenarioId)) return current.filter((id) => id !== scenarioId);
      if (current.length >= 3) return current;
      return [...current, scenarioId];
    });
  };

  const saveAndCalculate = () => {
    if (activeScenario.type === "base" || validation.length) return;
    applyScenarioAdjustments(activeScenario.id, draft);
    setDraftDirty(false);
  };

  const handleSelectScenario = (scenarioId: string) => {
    if (activeScenario.type !== "base" && draftDirty) setScenarioDraftState(activeScenario.id, null);
    selectScenario(scenarioId);
  };

  const cancelDraft = () => {
    setDraft(clone(activeScenario.adjustments));
    setInputText(initialInputText(activeScenario.adjustments));
    setDraftDirty(false);
    setScenarioDraftState(activeScenario.id, null);
  };

  const startRename = (scenarioId: string, name: string) => {
    setRenameId(scenarioId);
    setNameDraft(name);
  };

  const commitRename = () => {
    if (!renameId || !nameDraft.trim()) return;
    updateScenario(renameId, { name: nameDraft.trim() });
    setRenameId(null);
  };

  return (
    <div className="scenario-workbench scenario-decision-workspace">
      <section className="scenario-hero">
        <div>
          <span>مدیریت سناریو</span>
          <h3>فضای تصمیم‌گیری سناریوها</h3>
          <p>مبنای پروژه همیشه زنده است. هر سناریوی سفارشی فقط مجموعه تغییرات خود را نگه می‌دارد و نتایج آن با موتورهای مالی مشترک محاسبه می‌شود.</p>
        </div>
        <div className="scenario-hero-metrics">
          <article><span>سناریوهای سفارشی</span><strong>{formatNumber(visibleScenarios.filter((scenario) => scenario.type === "custom").length)}</strong></article>
          <article><span>سناریوی انتخاب‌شده</span><strong>{activeScenario.name}</strong></article>
          <article className={classNames("scenario-state", currentState)}><span>وضعیت نتیجه</span><strong>{stateLabels[currentState]}</strong></article>
        </div>
      </section>

      <section className="scenario-add-card">
        <div><span>سناریوی سفارشی</span><strong>ساخت از مبنای جاری پروژه</strong><small>سناریوی جدید با تغییرات خنثی ایجاد می‌شود.</small></div>
        <label><span>نام سناریو</span><input value={newScenarioName} onChange={(event) => setNewScenarioName(event.target.value)} /></label>
        <button className="primary-button" type="button" disabled={!newScenarioName.trim()} onClick={() => addScenario(newScenarioName.trim())}>ایجاد سناریو</button>
      </section>

      <section className="scenario-master-detail">
        <aside className="scenario-master-list" aria-label="فهرست سناریوها">
          {visibleScenarios.map((scenario) => {
            const state = scenario.id === activeScenario.id && draftDirty
              ? "stale"
              : scenario.calculationState ?? "uncalculated";
            const isRename = renameId === scenario.id;
            const isDeleteConfirm = deleteConfirmId === scenario.id;
            return (
              <article className={classNames("scenario-master-item", activeScenario.id === scenario.id && "selected", scenario.status === "inactive" && "inactive")} key={scenario.id}>
                <button className="scenario-master-select" type="button" onClick={() => handleSelectScenario(scenario.id)} disabled={scenario.status === "inactive"}>
                  <span>{scenario.type === "base" ? "مبنا" : "سفارشی"}</span>
                  <strong>{scenario.name}</strong>
                  <small className={classNames("scenario-state-pill", state)}>{stateLabels[state]}</small>
                  {state === "calculated" && scenario.calculatedAt ? <time dateTime={scenario.calculatedAt}>محاسبه: {formatTimestamp(scenario.calculatedAt)}</time> : null}
                </button>
                {isRename ? <div className="scenario-inline-edit"><input autoFocus value={nameDraft} onChange={(event) => setNameDraft(event.target.value)} /><button type="button" disabled={!nameDraft.trim()} onClick={commitRename}>ذخیره</button><button type="button" onClick={() => setRenameId(null)}>لغو</button></div> : null}
                {isDeleteConfirm ? <div className="scenario-delete-confirm"><span>این سناریو حذف شود؟</span><button className="danger" type="button" onClick={() => { deleteScenario(scenario.id); setDeleteConfirmId(null); }}>حذف</button><button type="button" onClick={() => setDeleteConfirmId(null)}>انصراف</button></div> : null}
                <footer>
                  {scenario.type === "custom" ? <button type="button" onClick={() => startRename(scenario.id, scenario.name)}>تغییر نام</button> : null}
                  <button type="button" onClick={() => duplicateScenario(scenario.id)}>تکثیر</button>
                  {scenario.type === "custom" ? <button type="button" className="danger" onClick={() => setDeleteConfirmId(scenario.id)}>حذف</button> : null}
                </footer>
              </article>
            );
          })}
        </aside>

        <div className="scenario-detail-pane">
          <section className="scenario-timing-card">
            <header>
              <div><span>{activeScenario.type === "base" ? "مبنای زنده پروژه" : "ویرایش تغییرات"}</span><strong>{activeScenario.name}</strong><p>{activeScenario.type === "base" ? "مفروضات مبنا از ماژول‌های اصلی پروژه ویرایش می‌شوند." : `حالت ${mode === "advanced" ? "پیشرفته" : "ساده"}؛ تغییرات پنهان حالت پیشرفته حفظ می‌شوند.`}</p></div>
              {activeScenario.type !== "base" ? <div className="scenario-action-row"><button type="button" onClick={cancelDraft}>لغو تغییرات</button><button type="button" className="primary-button" disabled={validation.length > 0 || !draftDirty} onClick={saveAndCalculate}>ذخیره و محاسبه</button></div> : null}
            </header>
            {activeScenario.type === "base" ? <div className="scenario-base-note"><strong>سناریوی مبنا قابل شوک‌دادن نیست.</strong><p>برای آزمون تصمیم، یک سناریوی سفارشی بسازید. تغییر مفروضات اصلی در ماژول‌های مربوط، مبنا را به‌روز و نتایج وابسته را منقضی می‌کند.</p></div> : (
              <div className="scenario-driver-groups">
                {groupedDrivers.map((group) => <fieldset key={group.group}><legend>{group.label}</legend><div className="scenario-adjustment-grid">{group.drivers.map((driver) => {
                  const error = errorsByKey.get(driver.key);
                  return <label className={classNames("scenario-driver", error && "invalid")} key={driver.key}><span>{driver.label}</span><div><input type="number" inputMode="decimal" step={driver.semantic === "months" ? "1" : "any"} value={inputText[driver.key]} onChange={(event) => updateAdjustment(driver, event.target.value)} /><small>{unitLabel(driver)}</small></div>{error ? <em>{error}</em> : <p>{driver.validation}</p>}</label>;
                })}</div></fieldset>)}
              </div>
            )}
          </section>

          {activeScenario.type !== "base" ? <section className="scenario-delta-card"><header><div><span>خلاصه تغییرات</span><strong>فقط تغییرات غیرخنثی</strong></div></header>{scenarioHasNonNeutralAdjustments(draft) ? <div>{nonNeutralDrivers.map((driver) => <article key={driver.key}><span>{driver.label}</span><strong>{adjustmentSummary(driver, draft[driver.key])}</strong></article>)}</div> : <p>همه تغییرات خنثی هستند؛ نتیجه با مبنای جاری یکسان خواهد بود.</p>}</section> : null}
        </div>
      </section>

      <section className="scenario-kpi-card">
        <header><div><span>خلاصه تصمیم</span><strong>شاخص‌های سناریوی انتخاب‌شده</strong></div><small>{draftDirty ? "نتایج تا ذخیره و محاسبه مجدد منقضی هستند." : "مقادیر از خروجی‌های canonical مدل خوانده می‌شوند."}</small></header>
        {draftDirty || validation.length ? <div className="scenario-results-blocked">برای مشاهده نتیجه معتبر، خطاها را رفع و سناریو را ذخیره و محاسبه کنید.</div> : activeColumn ? <div className="scenario-kpi-grid">{activeColumn.kpis.map((kpi) => <article className={classNames("scenario-kpi", kpi.status, kpi.thresholdStatus)} key={kpi.id}><span>{kpi.label}</span><strong>{formatKpiValue(kpi, project)}</strong><small>{formatKpiDelta(kpi, project)} نسبت به مبنا{kpi.id === "total-capex" && kpi.deltaPercent !== null ? ` · ${formatPercent(kpi.deltaPercent)}` : ""}</small>{kpi.reason ? <p>{kpi.reason}</p> : null}</article>)}</div> : <div className="scenario-results-blocked">نتیجه قابل محاسبه در دسترس نیست.</div>}
      </section>

      <section className="scenario-comparison-card">
        <header><div><span>مقایسه سناریوها</span><strong>مبنا و حداکثر سه سناریوی سفارشی</strong></div><div className="scenario-comparison-picker">{visibleScenarios.filter((scenario) => scenario.type === "custom").map((scenario) => <label key={scenario.id}><input type="checkbox" checked={comparisonIds.includes(scenario.id)} disabled={!comparisonIds.includes(scenario.id) && comparisonIds.length >= 3} onChange={() => toggleComparison(scenario.id)} /><span>{scenario.name}</span></label>)}</div></header>
        {baseResult ? <>
          <div className="scenario-comparison-desktop"><table><thead><tr><th>شاخص</th><th>مبنا</th>{comparison.map((column) => <th key={column.scenarioId}>{column.scenarioName}</th>)}</tr></thead><tbody>{selectScenarioComparison(project, baseResult, [baseResult])[0].kpis.map((baseKpi, index) => <tr key={baseKpi.id}><th>{baseKpi.label}</th><td><strong>{formatKpiValue(baseKpi, project)}</strong><small>مبنای مقایسه</small></td>{comparison.map((column) => { const kpi = column.kpis[index]; return <td key={column.scenarioId}><strong>{formatKpiValue(kpi, project)}</strong><small>{formatKpiDelta(kpi, project)}</small></td>; })}</tr>)}</tbody></table></div>
          <div className="scenario-comparison-mobile">{selectScenarioComparison(project, baseResult, [baseResult])[0].kpis.map((baseKpi, index) => <article key={baseKpi.id}><h4>{baseKpi.label}</h4><div><span>مبنا</span><strong>{formatKpiValue(baseKpi, project)}</strong></div>{comparison.map((column) => { const kpi = column.kpis[index]; return <div key={column.scenarioId}><span>{column.scenarioName}</span><strong>{formatKpiValue(kpi, project)}</strong><small>{formatKpiDelta(kpi, project)}</small></div>; })}</article>)}</div>
        </> : <div className="scenario-results-blocked">مبنای پروژه قابل محاسبه نیست.</div>}
      </section>
    </div>
  );
}
