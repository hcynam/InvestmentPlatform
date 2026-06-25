"use client";

import { useEffect, useState } from "react";
import { classNames, formatMoney, formatNumber, formatPercent } from "@/lib/format";
import { defaultScenarioAdjustments } from "@/lib/scenario-engine";
import type { ScenarioAdjustments } from "@/lib/types";
import { useProject } from "@/store/project-context";

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

type AdjustmentField = {
  key: keyof ScenarioAdjustments;
  label: string;
  kind: "percent" | "factor" | "number";
  help: string;
};

const adjustmentFields: AdjustmentField[] = [
  { key: "inflationRateDelta", label: "تغییر تورم عمومی", kind: "percent", help: "MarcoAssumptions05!V19" },
  { key: "salesPriceGrowthDelta", label: "تغییر رشد قیمت فروش", kind: "percent", help: "MarcoAssumptions05!V20" },
  { key: "wageGrowthDelta", label: "تغییر رشد دستمزد", kind: "percent", help: "MarcoAssumptions05!V21" },
  { key: "energyGrowthDelta", label: "تغییر رشد انرژی", kind: "percent", help: "MarcoAssumptions05!V22" },
  { key: "rawMaterialGrowthDelta", label: "تغییر رشد مواد اولیه", kind: "percent", help: "MarcoAssumptions05!V23" },
  { key: "fxRateMultiplier", label: "ضریب نرخ ارز", kind: "factor", help: "MarcoAssumptions05!V33:V35" },
  { key: "capexMultiplier", label: "ضریب CAPEX", kind: "factor", help: "Capex12" },
  { key: "salesVolumeMultiplier", label: "ضریب حجم فروش", kind: "factor", help: "MarketDemand08" },
  { key: "capacityMultiplier", label: "ضریب ظرفیت", kind: "factor", help: "CapacityProduction09" },
  { key: "receivableDaysDelta", label: "تغییر روز وصول", kind: "number", help: "WorkingCapital13!R10" },
  { key: "payableDaysDelta", label: "تغییر روز پرداخت", kind: "number", help: "WorkingCapital13!R11" },
  { key: "financingRateDelta", label: "تغییر نرخ تأمین مالی", kind: "percent", help: "Financing14!R12" },
  { key: "taxRateDelta", label: "تغییر نرخ مالیات", kind: "percent", help: "MarcoAssumptions05!V47" },
  { key: "executionDelayMonths", label: "تأخیر اجرا", kind: "number", help: "ScenarioManager06!T28" },
  { key: "probability", label: "احتمال وقوع", kind: "percent", help: "ScenarioManager06!U44" },
  { key: "riskWeight", label: "وزن ریسک", kind: "factor", help: "ScenarioManager06!U43" },
];

const shownValue = (value: number, kind: AdjustmentField["kind"]) => kind === "percent" ? value * 100 : value;
const storedValue = (value: number, kind: AdjustmentField["kind"]) => kind === "percent" ? value / 100 : value;

export function ScenarioManager() {
  const {
    activeScenario,
    outputs,
    project,
    selectScenario,
    addScenario,
    duplicateScenario,
    updateScenario,
    applyScenarioAdjustments,
    deleteScenario,
  } = useProject();
  const [newScenarioName, setNewScenarioName] = useState("سناریوی جدید");
  const [draft, setDraft] = useState<ScenarioAdjustments>(() => clone(activeScenario.adjustments));

  useEffect(() => setDraft(clone(activeScenario.adjustments)), [activeScenario.id, activeScenario.adjustments]);

  const activeCount = project.scenarios.filter((scenario) => scenario.status === "active").length;
  const isBase = activeScenario.type === "base";
  const updateAdjustment = (key: keyof ScenarioAdjustments, value: number) => {
    setDraft((current) => ({ ...current, [key]: Number.isFinite(value) ? value : 0 }));
  };

  return (
    <div className="scenario-workbench scenario-redesign">
      <section className="scenario-hero">
        <div>
          <span>ScenarioManager06</span>
          <h3>مدیریت سناریوهای محاسباتی</h3>
          <p>هر سناریو با شناسه مستقل، ضرایب قابل ویرایش و اجرای واقعی موتور مالی نگهداری می‌شود. انتخاب سناریو همه ماژول‌های وابسته را باز محاسبه می‌کند.</p>
        </div>
        <div className="scenario-hero-metrics">
          <article><span>سناریوهای فعال</span><strong>{formatNumber(activeCount)}</strong></article>
          <article><span>NPV سناریوی فعال</span><strong>{formatMoney(outputs.valuation.npv, project)}</strong></article>
          <article><span>حداقل DSCR</span><strong>{formatNumber(outputs.financing.minimumDscr)}</strong></article>
        </div>
      </section>

      <section className="scenario-add-card">
        <div><span>سناریوی سفارشی</span><strong>ساخت از سناریوی فعال</strong></div>
        <input value={newScenarioName} onChange={(event) => setNewScenarioName(event.target.value)} />
        <button className="primary-button" type="button" onClick={() => addScenario(newScenarioName.trim() || "سناریوی جدید")}>افزودن سناریو</button>
      </section>

      <section className="scenario-list-grid">
        {[...project.scenarios].sort((left, right) => left.priority - right.priority).map((scenario) => (
          <article className={classNames("scenario-list-card", activeScenario.id === scenario.id && "active", scenario.status === "inactive" && "inactive")} key={scenario.id}>
            <button type="button" onClick={() => selectScenario(scenario.id)} disabled={scenario.status === "inactive"}>
              <span>{scenario.code}</span>
              <strong>{scenario.name}</strong>
              <small>{scenario.description}</small>
              <b>{scenario.status === "active" ? "فعال" : "غیرفعال"}</b>
            </button>
            <div className="scenario-card-editor">
              <label><span>نام</span><input value={scenario.name} onChange={(event) => updateScenario(scenario.id, { name: event.target.value })} /></label>
              <label><span>کد</span><input value={scenario.code} onChange={(event) => updateScenario(scenario.id, { code: event.target.value })} /></label>
              <label><span>وضعیت</span><select value={scenario.status} onChange={(event) => updateScenario(scenario.id, { status: event.target.value as "active" | "inactive" })}><option value="active">فعال</option><option value="inactive">غیرفعال</option></select></label>
            </div>
            <footer>
              <button type="button" onClick={() => duplicateScenario(scenario.id)}>تکثیر</button>
              <button type="button" className="danger" onClick={() => deleteScenario(scenario.id)} disabled={scenario.isDefault}>حذف</button>
            </footer>
          </article>
        ))}
      </section>

      <section className="scenario-timing-card">
        <header>
          <div>
            <span>Shock engine · {activeScenario.code}</span>
            <strong>ضرایب سناریوی «{activeScenario.name}»</strong>
            <p>{isBase ? "سناریوی پایه از ورودی‌های اصلی ماژول‌ها تغذیه می‌شود و ضریب شوک جداگانه ندارد." : "ذخیره این فرم مفروضات سناریو را از روی پایه بازسازی و کل مدل را محاسبه می‌کند."}</p>
          </div>
          {!isBase ? <div className="scenario-action-row"><button type="button" className="secondary-button" onClick={() => setDraft(defaultScenarioAdjustments(activeScenario.type))}>بازنشانی به پیش‌فرض</button><button type="button" className="primary-button" onClick={() => applyScenarioAdjustments(activeScenario.id, draft)}>ذخیره و محاسبه سناریو</button></div> : null}
        </header>
        <div className="scenario-timing-grid scenario-adjustment-grid">
          {adjustmentFields.map((field) => (
            <label key={field.key}>
              <span>{field.label}<small>{field.help}</small></span>
              <input
                type="number"
                step={field.kind === "percent" ? "0.01" : "any"}
                disabled={isBase || activeScenario.isLocked}
                value={shownValue(draft[field.key], field.kind)}
                onChange={(event) => updateAdjustment(field.key, storedValue(Number(event.target.value), field.kind))}
              />
            </label>
          ))}
        </div>
      </section>

      <section className="scenario-preview-card">
        <span>اثر تأییدشده در مدل فعال</span>
        <div>
          <article><strong>تورم</strong><small>تغییر: {formatPercent(activeScenario.adjustments.inflationRateDelta)}</small><b>{formatPercent(activeScenario.assumptions.macro.inflationRate)}</b></article>
          <article><strong>نرخ ارز آزاد</strong><small>ضریب: {formatNumber(activeScenario.adjustments.fxRateMultiplier)}</small><b>{formatNumber(activeScenario.assumptions.macro.fxRates.freeMarket)}</b></article>
          <article><strong>روز وصول</strong><small>تغییر: {formatNumber(activeScenario.adjustments.receivableDaysDelta)}</small><b>{formatNumber(activeScenario.assumptions.workingCapital.receivableDays)} روز</b></article>
          <article><strong>تأخیر اجرا</strong><small>اثر CAPEX و ساخت</small><b>{formatNumber(activeScenario.adjustments.executionDelayMonths)} ماه</b></article>
        </div>
        <p>شناسه سناریو، مفروضات مشتق‌شده و خروجی‌های محاسبه‌شده در یک state مشترک نگهداری می‌شوند؛ ماتریس نمایشی و جدا از engine حذف شده است.</p>
      </section>
    </div>
  );
}
