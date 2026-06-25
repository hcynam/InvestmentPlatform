"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  AssumptionInput,
  CurrencyInput,
  FormulaTraceMini,
  MetricStrip,
  NumberInput,
  PercentInput,
  SectionCard,
  SelectInput,
  ToggleInput,
  ValidationPanel,
  fxTypeOptions,
} from "@/components/phase-one/PhaseOneFields";
import {
  calculateAnnualCapexSchedule,
  calculateCapacityProduction,
  calculateCapexItem,
  calculateCapexSummary,
  calculateDirectCostSchedule,
  calculateDirectUnitCost,
  calculateOpexSchedule,
} from "@/lib/phase-two-calculations";
import {
  getTaxIncentiveDefaults,
  getVisibleTaxIncentiveFields,
  taxIncentiveTypes,
} from "@/lib/tax-capex-engine";
import { formatMoney, formatNumber, formatPercent } from "@/lib/format";
import { AlignedCardGrid, GlassButton, GlassCard, PremiumTableShell, StatusPill } from "@/components/project/PremiumUi";
import type {
  CapexAssumptions,
  CapexItem,
  CapacityAssumptions,
  DirectCostAssumptions,
  DirectCostItem,
  OpexAssumptions,
  OpexItem,
  TaxAssumptions,
  TaxIncentiveType,
  WorkingCapitalAssumptions,
} from "@/lib/types";
import { useProject } from "@/store/project-context";

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

function Tabs({
  tabs,
  active,
  onChange,
}: {
  tabs: Array<{ id: string; label: string; badge?: string }>;
  active: string;
  onChange: (value: string) => void;
}) {
  return (
    <nav className="phase-internal-tabs">
      {tabs.map((tab) => (
        <button key={tab.id} type="button" className={active === tab.id ? "active" : ""} onClick={() => onChange(tab.id)}>
          <span>{tab.label}</span>{tab.badge ? <small>{tab.badge}</small> : null}
        </button>
      ))}
    </nav>
  );
}

function Actions({
  onSave,
  onReset,
  nextHref,
  disabled,
  children,
}: {
  onSave: () => void;
  onReset: () => void;
  nextHref: string;
  disabled?: boolean;
  children?: ReactNode;
}) {
  return (
    <div className="phase-actions">
      {children}
      <button type="button" className="primary-button" onClick={onSave} disabled={disabled}>ذخیره و محاسبه مجدد</button>
      <button type="button" className="secondary-button" onClick={onReset}>بازنشانی تغییرات</button>
      <Link className="text-button" href={nextHref}>بخش بعدی</Link>
    </div>
  );
}

function EditableNumber({
  value,
  onChange,
  percent,
}: {
  value: number;
  onChange: (value: number) => void;
  percent?: boolean;
}) {
  return (
    <input
      className="table-input numeric"
      type="number"
      step="any"
      value={percent ? value * 100 : value}
      onChange={(event) => onChange(Number(event.target.value) / (percent ? 100 : 1))}
    />
  );
}

const capacityTabs = [
  { id: "base", label: "ظرفیت و تقویم" },
  { id: "constraints", label: "محدودیت‌ها" },
  { id: "ramp", label: "راه‌اندازی و Ramp-up" },
  { id: "monthly", label: "توزیع ماهانه" },
  { id: "results", label: "خروجی و Trace", badge: "پیشرفته" },
];

export function CapacityProductionWorkspace() {
  const { activeScenario, project, mode, applyCapacityAssumptions } = useProject();
  const source = activeScenario.assumptions.capacity;
  const [draft, setDraft] = useState<CapacityAssumptions>(() => clone(source));
  const [tab, setTab] = useState("base");
  useEffect(() => setDraft(clone(source)), [activeScenario.id, source]);
  useEffect(() => { if (mode === "basic" && tab === "results") setTab("base"); }, [mode, tab]);
  const update = useCallback(<K extends keyof CapacityAssumptions>(key: K, value: CapacityAssumptions[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
  }, []);
  const result = useMemo(() => calculateCapacityProduction(draft), [draft]);
  const productUnit = activeScenario.assumptions.industry.productUnit === "سفارشی"
    ? activeScenario.assumptions.industry.customProductUnit
    : activeScenario.assumptions.industry.productUnit;

  const updateRamp = (month: number, capacityPercent: number) => {
    update("monthlyRampUpCapacityPercentages", draft.monthlyRampUpCapacityPercentages.map((row) =>
      row.month === month ? { ...row, capacityPercent } : row));
  };
  const updateDistribution = (month: number, share: number) => {
    update("monthlyProductionDistribution", draft.monthlyProductionDistribution.map((row) =>
      row.month === month ? { ...row, share } : row));
  };
  const distributionTotal = draft.monthlyProductionDistribution.reduce((total, row) => total + row.share, 0);

  return (
    <div className="phase-workspace">
      <section className="setup-context-strip">
        <div><span>واحد محصول</span><strong>{productUnit}</strong></div>
        <div><span>شروع آزمایشی</span><strong>{draft.trialProductionStartDate}</strong></div>
        <div><span>گلوگاه فعال</span><strong>{result.values.bindingConstraint}</strong></div>
        <div><span>سناریو</span><strong>{activeScenario.name}</strong></div>
        <div><span>افق مدل</span><strong>{formatNumber(project.modelHorizonYears)} سال</strong></div>
      </section>
      <Tabs tabs={capacityTabs.filter((item) => mode === "advanced" || item.id !== "results")} active={tab} onChange={setTab} />
      <MetricStrip metrics={[
        { label: "ساعات مؤثر سالانه", value: formatNumber(result.values.effectiveAnnualHours), note: "CapacityProduction09!Q42" },
        { label: "ظرفیت در دسترس", value: `${formatNumber(result.values.availableCapacity)} ${productUnit}`, note: result.values.bindingConstraint },
        { label: "تولید خالص پایدار", value: `${formatNumber(result.values.netSellableProduction)} ${productUnit}`, note: "Q46" },
        { label: "بهره‌برداری مؤثر", value: formatPercent(result.values.capacityUtilizationPercent), note: "Q47" },
      ]} />

      {tab === "base" ? <SectionCard title="ظرفیت پایه و تقویم تولید" description="واحد از Industry Template خوانده می‌شود و در بازار، درآمد و هزینه مستقیم یکسان مصرف می‌شود.">
        <div className="phase-form-grid">
          <AssumptionInput label="واحد محصول / خدمت" value={productUnit} onChange={() => undefined} disabled source="IndustryTemplate07 / CapacityProduction09!Q6" />
          <NumberInput label="ظرفیت اسمی طراحی" value={draft.nominalCapacity} onChange={(value) => update("nominalCapacity", Number(value ?? 0))} source="CapacityProduction09!Q7" />
          <NumberInput label="تعداد خطوط / واحدها" value={draft.productionLines} onChange={(value) => update("productionLines", Number(value ?? 0))} source="CapacityProduction09!Q8" />
          <NumberInput label="روز کاری سالانه" value={draft.workingDaysPerYear} onChange={(value) => update("workingDaysPerYear", Number(value ?? 0))} source="CapacityProduction09!Q15" />
          <NumberInput label="شیفت روزانه" value={draft.shiftsPerDay} onChange={(value) => update("shiftsPerDay", Number(value ?? 0))} source="CapacityProduction09!Q16" />
          <NumberInput label="ساعت مؤثر هر شیفت" value={draft.effectiveHoursPerShift} onChange={(value) => update("effectiveHoursPerShift", Number(value ?? 0))} source="CapacityProduction09!Q17" />
          <PercentInput label="توقف برنامه‌ریزی‌شده" value={draft.plannedDowntimeRate} onChange={(value) => update("plannedDowntimeRate", Number(value ?? 0))} source="CapacityProduction09!Q18" />
          <PercentInput label="توقف برنامه‌ریزی‌نشده" value={draft.unplannedDowntimeRate} onChange={(value) => update("unplannedDowntimeRate", Number(value ?? 0))} source="CapacityProduction09!Q19" />
          <PercentInput label="بهره‌برداری سال اول" value={draft.firstYearUtilizationRate} onChange={(value) => update("firstYearUtilizationRate", Number(value ?? 0))} source="CapacityProduction09!Q20" />
          <PercentInput label="بهره‌برداری سال دوم" value={draft.secondYearUtilizationRate} onChange={(value) => update("secondYearUtilizationRate", Number(value ?? 0))} source="CapacityProduction09!Q21" />
          <PercentInput label="بهره‌برداری پایدار" value={draft.stableYearUtilizationRate} onChange={(value) => update("stableYearUtilizationRate", Number(value ?? 0))} source="CapacityProduction09!Q22" />
          <PercentInput label="راندمان تولید" value={draft.productionEfficiency} onChange={(value) => update("productionEfficiency", Number(value ?? 0))} source="CapacityProduction09!Q24" />
          <PercentInput label="ضایعات" value={draft.wasteRate} onChange={(value) => update("wasteRate", Number(value ?? 0))} source="CapacityProduction09!Q23" />
        </div>
      </SectionCard> : null}

      {tab === "constraints" ? <>
        <SectionCard title="گلوگاه فنی و انرژی" description="ظرفیت در دسترس برابر کمینه ظرفیت اسمی مؤثر و محدودیت‌های فعال است.">
          <div className="phase-form-grid">
            <NumberInput label="ظرفیت ساعتی گلوگاه" value={draft.bottleneckHourlyCapacity} onChange={(value) => update("bottleneckHourlyCapacity", Number(value ?? 0))} source="CapacityProduction09!Q26" />
            <SelectInput label="نوع محدودیت انرژی" value={draft.energyConstraintType} options={["ندارد", "برق", "گاز", "آب", "سوخت", "چندگانه", "نامشخص / نیازمند بررسی"]} onChange={(value) => update("energyConstraintType", value as CapacityAssumptions["energyConstraintType"])} source="CapacityProduction09!Q27" />
            <NumberInput label="انرژی در دسترس سالانه" value={draft.energyAvailableQuantity} onChange={(value) => update("energyAvailableQuantity", Number(value ?? 0))} source="CapacityProduction09!Q27" />
            <NumberInput label="مصرف انرژی هر واحد" value={draft.energyConsumptionPerUnit} onChange={(value) => update("energyConsumptionPerUnit", Number(value ?? 0))} source="CapacityProduction09!Q28" />
          </div>
        </SectionCard>
        <SectionCard title="محدودیت ماده اولیه">
          <div className="phase-form-grid">
            <ToggleInput label="محدودیت ماده اولیه فعال است" value={draft.hasRawMaterialConstraint} onChange={(value) => update("hasRawMaterialConstraint", Boolean(value))} />
            <AssumptionInput label="نام ماده محدودکننده" value={draft.constrainedRawMaterialName} onChange={(value) => update("constrainedRawMaterialName", String(value ?? ""))} disabled={!draft.hasRawMaterialConstraint} />
            <NumberInput label="مقدار ماده در دسترس" value={draft.rawMaterialAvailableQuantity} onChange={(value) => update("rawMaterialAvailableQuantity", Number(value ?? 0))} disabled={!draft.hasRawMaterialConstraint} />
            <AssumptionInput label="واحد مقدار ماده" value={draft.rawMaterialQuantityUnit} onChange={(value) => update("rawMaterialQuantityUnit", String(value ?? ""))} disabled={!draft.hasRawMaterialConstraint} />
            <SelectInput label="دوره دسترسی" value={draft.rawMaterialAvailabilityPeriod} options={["روزانه", "ماهانه", "سالانه"]} onChange={(value) => update("rawMaterialAvailabilityPeriod", value as CapacityAssumptions["rawMaterialAvailabilityPeriod"])} disabled={!draft.hasRawMaterialConstraint} />
            <NumberInput label="مصرف ماده برای یک واحد محصول" value={draft.rawMaterialToProductConversionFactor} onChange={(value) => update("rawMaterialToProductConversionFactor", Number(value ?? 0))} disabled={!draft.hasRawMaterialConstraint} source="CapacityProduction09!Q29" />
          </div>
        </SectionCard>
      </> : null}

      {tab === "ramp" ? <>
        <SectionCard title="راه‌اندازی و Ramp-up" description="درصد هر ماه نسبت به ظرفیت در دسترس همان ماه اعمال می‌شود.">
          <div className="phase-form-grid">
            <AssumptionInput label="تاریخ شروع تولید آزمایشی" type="date" value={draft.trialProductionStartDate} onChange={(value) => update("trialProductionStartDate", String(value ?? ""))} source="CapacityProduction09!Q34" />
            <NumberInput label="مدت Ramp-up" value={draft.rampUpDurationMonths} onChange={(value) => update("rampUpDurationMonths", Number(value ?? 0))} help="ماه" source="CapacityProduction09!Q35" />
          </div>
        </SectionCard>
        <SectionCard title="درصد ظرفیت ماهانه">
          <div className="month-grid">
            {draft.monthlyRampUpCapacityPercentages.map((row) => (
              <PercentInput key={row.month} label={`ماه ${formatNumber(row.month)}`} value={row.capacityPercent} onChange={(value) => updateRamp(row.month, Number(value ?? 0))} />
            ))}
          </div>
        </SectionCard>
      </> : null}

      {tab === "monthly" ? <SectionCard title="توزیع ماهانه تولید" description={`جمع سهم ماهانه: ${formatPercent(distributionTotal)}. موتور سهم‌ها را هنگام محاسبه نرمال می‌کند.`}>
        <div className="phase-form-grid">
          <SelectInput label="الگوی فصل‌پذیری" value={draft.seasonalityMode} options={["یکنواخت", "فصلی ملایم", "فصلی شدید", "سفارشی"]} onChange={(value) => update("seasonalityMode", value as CapacityAssumptions["seasonalityMode"])} />
        </div>
        <div className="table-wrap phase-table">
          <table>
            <thead><tr><th>ماه</th><th>سهم تولید</th><th>Ramp-up</th><th>تولید خالص محاسباتی</th></tr></thead>
            <tbody>{draft.monthlyProductionDistribution.map((row, index) => <tr key={row.month}>
              <td><strong>{row.label}</strong></td>
              <td><EditableNumber value={row.share} percent onChange={(value) => updateDistribution(row.month, value)} /></td>
              <td>{formatPercent(draft.monthlyRampUpCapacityPercentages[index]?.capacityPercent ?? 0)}</td>
              <td>{formatNumber(result.values.monthlyNetProduction[index] ?? 0)} {productUnit}</td>
            </tr>)}</tbody>
          </table>
        </div>
      </SectionCard> : null}

      {tab === "results" && mode === "advanced" ? <>
        <SectionCard title="خروجی‌های محاسباتی" description="تمام خروجی‌ها از ورودی‌های همین صفحه ساخته شده‌اند.">
          <div className="control-cards">
            <article><span>ظرفیت اسمی مؤثر</span><strong>{formatNumber(result.values.nominalEffectiveCapacity)}</strong><small>Q43</small></article>
            <article><span>ظرفیت محدودشده انرژی</span><strong>{formatNumber(result.values.energyConstrainedCapacity)}</strong><small>Q44</small></article>
            <article><span>ظرفیت محدودشده مواد</span><strong>{formatNumber(result.values.rawMaterialConstrainedCapacity)}</strong><small>Q44</small></article>
            <article><span>ظرفیت بلااستفاده</span><strong>{formatNumber(result.values.remainingIdleCapacity)}</strong><small>Q48</small></article>
          </div>
        </SectionCard>
        <FormulaTraceMini traces={result.trace} />
      </> : null}

      <ValidationPanel errors={result.errors} warnings={result.warnings} />
      <Actions onSave={() => applyCapacityAssumptions(draft)} onReset={() => setDraft(clone(source))} nextHref="../direct-costs" disabled={result.errors.length > 0} />
    </div>
  );
}

const directTabs = [
  { id: "material", label: "ماده اولیه اصلی" },
  { id: "items", label: "اقلام هزینه واحد" },
  { id: "growth", label: "رشد و رفتار" },
  { id: "results", label: "خروجی و Trace", badge: "پیشرفته" },
];

const newDirectItem = (): DirectCostItem => ({
  id: `dc-${Date.now()}`,
  name: "قلم جدید",
  rialUnitCost: 0,
  fxUnitCost: 0,
  costType: "ریالی",
  fxShare: 0,
  fxRateType: "freeMarket",
  behavior: "متغیر",
  description: "",
});

export function DirectCostsWorkspace() {
  const { activeScenario, project, mode, outputs, applyDirectCostAssumptions } = useProject();
  const source = activeScenario.assumptions.directCosts;
  const macro = activeScenario.assumptions.macro;
  const [draft, setDraft] = useState<DirectCostAssumptions>(() => clone(source));
  const [tab, setTab] = useState("material");
  useEffect(() => setDraft(clone(source)), [activeScenario.id, source]);
  useEffect(() => { if (mode === "basic" && tab === "results") setTab("material"); }, [mode, tab]);
  const update = useCallback(<K extends keyof DirectCostAssumptions>(key: K, value: DirectCostAssumptions[K]) =>
    setDraft((current) => ({ ...current, [key]: value })), []);
  const unitResult = useMemo(
    () => calculateDirectUnitCost(draft, macro, activeScenario.assumptions.market.baseSalesPrice),
    [activeScenario.assumptions.market.baseSalesPrice, draft, macro],
  );
  const production = outputs.capacity.rows.map((row) => row.productionVolume);
  const prices = outputs.revenue.rows.map((row) => row.salesPrice);
  const schedule = useMemo(() => calculateDirectCostSchedule(draft, macro, production, prices), [draft, macro, prices, production]);
  const yearOne = schedule.values[1];
  const productUnit = activeScenario.assumptions.capacity.unit;
  const updateItem = (id: string, patch: Partial<DirectCostItem>) =>
    update("items", draft.items.map((item) => item.id === id ? { ...item, ...patch } : item));

  return (
    <div className="phase-workspace">
      <section className="setup-context-strip">
        <div><span>روش محاسبه</span><strong>هزینه واحد</strong></div>
        <div><span>واحد محصول</span><strong>{productUnit}</strong></div>
        <div><span>تولید سال اول</span><strong>{formatNumber(production[1] ?? 0)}</strong></div>
        <div><span>نرخ ارز</span><strong>{formatNumber(macro.fxRates[macro.directCostFxRateType])}</strong></div>
        <div><span>سناریو</span><strong>{activeScenario.name}</strong></div>
      </section>
      <Tabs tabs={directTabs.filter((item) => mode === "advanced" || item.id !== "results")} active={tab} onChange={setTab} />
      <MetricStrip metrics={[
        { label: "هزینه مستقیم واحد", value: `${formatNumber(unitResult.values.baseYearUnitDirectCost)} ریال`, note: "COGS-DirectCost10!Q41" },
        { label: "COGS سال اول", value: formatMoney(yearOne?.totalCost ?? 0, project), note: productUnit },
        { label: "سهم ارزی", value: formatPercent(yearOne?.fxShare ?? 0), note: "پس از تبدیل به ریال" },
        { label: "سهم متغیر", value: formatPercent(unitResult.values.variableDirectCostShare), note: "ساختار اقلام" },
      ]} />

      {tab === "material" ? <SectionCard title="ماده اولیه اصلی" description="قیمت ریالی و ارزی مستقل نگهداری و با tier نرخ ارز انتخابی تبدیل می‌شوند.">
        <div className="phase-form-grid">
          <AssumptionInput label="نام ماده اولیه اصلی" value={draft.mainRawMaterialName} onChange={(value) => update("mainRawMaterialName", String(value ?? ""))} source="COGS-DirectCost10!Q15" />
          <ToggleInput label="دارای جزء ارزی" value={draft.isMainRawMaterialFx} onChange={(value) => update("isMainRawMaterialFx", Boolean(value))} />
          <PercentInput label="سهم ارزی ماده اصلی" value={draft.mainRawMaterialFxShare} onChange={(value) => update("mainRawMaterialFxShare", Number(value ?? 0))} disabled={!draft.isMainRawMaterialFx} source="COGS-DirectCost10!Q18" />
          <CurrencyInput label="قیمت ریالی واحد" value={draft.mainRawMaterialRialPrice} onChange={(value) => update("mainRawMaterialRialPrice", Number(value ?? 0))} source="COGS-DirectCost10!Q17" />
          <NumberInput label="قیمت ارزی واحد" value={draft.mainRawMaterialFxPrice} onChange={(value) => update("mainRawMaterialFxPrice", Number(value ?? 0))} disabled={!draft.isMainRawMaterialFx} source="COGS-DirectCost10!Q16" />
          <SelectInput label="نوع نرخ ارز" value={draft.mainRawMaterialFxRateType} options={fxTypeOptions} onChange={(value) => update("mainRawMaterialFxRateType", value as DirectCostAssumptions["mainRawMaterialFxRateType"])} disabled={!draft.isMainRawMaterialFx} />
          {draft.mainRawMaterialFxRateType === "manual" && draft.isMainRawMaterialFx ? <CurrencyInput label="نرخ ارز دستی" value={draft.mainRawMaterialManualFxRate ?? 0} onChange={(value) => update("mainRawMaterialManualFxRate", Number(value ?? 0))} /> : null}
        </div>
      </SectionCard> : null}

      {tab === "items" ? <SectionCard title="جدول اقلام هزینه مستقیم واحد" action={<button type="button" className="suggestion-button" onClick={() => update("items", [...draft.items, newDirectItem()])}>افزودن قلم</button>}>
        <div className="table-wrap phase-table xl">
          <table className="editable-model-table">
            <thead><tr><th>عنوان</th><th>ریالی/واحد</th><th>ارزی/واحد</th><th>نوع هزینه</th><th>سهم ارزی</th><th>نرخ ارز</th><th>رفتار</th><th>شرح</th><th /></tr></thead>
            <tbody>{draft.items.map((item) => <tr key={item.id}>
              <td><input value={item.name} onChange={(event) => updateItem(item.id, { name: event.target.value })} /></td>
              <td><EditableNumber value={item.rialUnitCost} onChange={(value) => updateItem(item.id, { rialUnitCost: value })} /></td>
              <td><EditableNumber value={item.fxUnitCost} onChange={(value) => updateItem(item.id, { fxUnitCost: value })} /></td>
              <td><select value={item.costType} onChange={(event) => updateItem(item.id, { costType: event.target.value as DirectCostItem["costType"] })}><option>ریالی</option><option>ارزی</option><option>ترکیبی</option></select></td>
              <td><EditableNumber value={item.fxShare} percent onChange={(value) => updateItem(item.id, { fxShare: value })} /></td>
              <td><select value={item.fxRateType} onChange={(event) => updateItem(item.id, { fxRateType: event.target.value as DirectCostItem["fxRateType"] })}>{fxTypeOptions.map((option) => <option key={option}>{option}</option>)}</select></td>
              <td><select value={item.behavior} onChange={(event) => updateItem(item.id, { behavior: event.target.value as DirectCostItem["behavior"] })}><option>متغیر</option><option>ثابت</option></select></td>
              <td><input value={item.description} onChange={(event) => updateItem(item.id, { description: event.target.value })} /></td>
              <td><button type="button" className="table-delete" onClick={() => update("items", draft.items.filter((row) => row.id !== item.id))}>حذف</button></td>
            </tr>)}</tbody>
          </table>
        </div>
      </SectionCard> : null}

      {tab === "growth" ? <SectionCard title="رشد هزینه و صرفه مقیاس">
        <div className="phase-form-grid">
          <PercentInput label="رشد مواد ریالی" value={draft.rialRawMaterialGrowthRate} onChange={(value) => update("rialRawMaterialGrowthRate", Number(value ?? 0))} source="COGS-DirectCost10!Q32" />
          <PercentInput label="رشد مواد ارزی" value={draft.fxRawMaterialGrowthRate} onChange={(value) => update("fxRawMaterialGrowthRate", Number(value ?? 0))} source="COGS-DirectCost10!Q33" />
          <PercentInput label="رشد دستمزد مستقیم" value={draft.directLaborGrowthFactor} onChange={(value) => update("directLaborGrowthFactor", Number(value ?? 0))} source="COGS-DirectCost10!Q34" />
          <PercentInput label="رشد تعرفه انرژی" value={draft.energyTariffGrowthRate} onChange={(value) => update("energyTariffGrowthRate", Number(value ?? 0))} source="COGS-DirectCost10!Q35" />
          <PercentInput label="صرفه‌جویی ناشی از مقیاس" value={draft.economiesOfScaleSavingPercent} onChange={(value) => update("economiesOfScaleSavingPercent", Number(value ?? 0))} source="COGS-DirectCost10!Q36" />
          <PercentInput label="کمیسیون فروش" value={draft.salesCommissionRate} onChange={(value) => update("salesCommissionRate", Number(value ?? 0))} source="COGS-DirectCost10!Q25" />
          <CurrencyInput label="هزینه ضایعات قابل اجتناب/واحد" value={draft.avoidableWasteCost} onChange={(value) => update("avoidableWasteCost", Number(value ?? 0))} source="COGS-DirectCost10!Q23" />
        </div>
      </SectionCard> : null}

      {tab === "results" && mode === "advanced" ? <>
        <SectionCard title="برنامه سالانه بهای مستقیم">
          <div className="table-wrap phase-table"><table><thead><tr><th>سال</th><th>تولید</th><th>هزینه واحد</th><th>COGS</th><th>سهم ارزی</th></tr></thead><tbody>
            {schedule.values.slice(1, 8).map((row) => <tr key={row.year}><td>{formatNumber(row.year)}</td><td>{formatNumber(production[row.year] ?? 0)}</td><td>{formatNumber(row.unitCost)}</td><td>{formatMoney(row.totalCost, project)}</td><td>{formatPercent(row.fxShare)}</td></tr>)}
          </tbody></table></div>
        </SectionCard>
        <FormulaTraceMini traces={schedule.trace} />
      </> : null}

      <ValidationPanel errors={schedule.errors} warnings={schedule.warnings} />
      <Actions onSave={() => applyDirectCostAssumptions(draft)} onReset={() => setDraft(clone(source))} nextHref="../opex" disabled={schedule.errors.length > 0} />
    </div>
  );
}

const newOpexItem = (): OpexItem => ({
  id: `opex-${Date.now()}`,
  name: "هزینه جدید",
  group: "سایر",
  baseYearAmount: 0,
  cashOrNonCash: "نقدی",
  isFx: false,
  fxShare: 0,
  fxRateType: "freeMarket",
  growthRate: 0,
  costDriver: "ثابت",
  overheadAllocationPercent: 0,
  notes: "",
});

export function OpexWorkspace() {
  const { activeScenario, project, outputs, applyOpexAssumptions } = useProject();
  const source = activeScenario.assumptions.opex;
  const [draft, setDraft] = useState<OpexAssumptions>(() => clone(source));
  useEffect(() => setDraft(clone(source)), [activeScenario.id, source]);
  const update = useCallback(<K extends keyof OpexAssumptions>(key: K, value: OpexAssumptions[K]) =>
    setDraft((current) => ({ ...current, [key]: value })), []);
  const revenues = outputs.revenue.rows.map((row) => row.revenue);
  const production = outputs.capacity.rows.map((row) => row.productionVolume);
  const result = useMemo(() => calculateOpexSchedule(draft, revenues, production), [draft, production, revenues]);
  const updateItem = (id: string, patch: Partial<OpexItem>) =>
    update("items", draft.items.map((item) => item.id === id ? { ...item, ...patch } : item));

  return (
    <div className="phase-workspace">
      <section className="setup-context-strip">
        <div><span>سناریو</span><strong>{activeScenario.name}</strong></div>
        <div><span>اقلام هزینه</span><strong>{formatNumber(draft.items.length)}</strong></div>
        <div><span>تخصیص سربار مشترک</span><strong>{formatPercent(draft.sharedCostAllocationPercent)}</strong></div>
        <div><span>درآمد سال اول</span><strong>{formatMoney(revenues[1] ?? 0, project)}</strong></div>
        <div><span>واحد پول</span><strong>{project.currency}</strong></div>
      </section>
      <MetricStrip metrics={[
        { label: "OPEX سال اول", value: formatMoney(result.values.outputs.totalAnnualOpex, project), note: "Opex-Indirect11!Q50" },
        { label: "OPEX نقدی", value: formatMoney(result.values.outputs.cashOpexExcludingDepreciation, project), note: "Q55" },
        { label: "سربار تولید", value: formatMoney(result.values.outputs.productionOverhead, project), note: "Q51" },
        { label: "OPEX / درآمد", value: formatPercent(result.values.outputs.opexToRevenueRatio), note: "Q54" },
      ]} />
      <SectionCard title="اقلام هزینه عملیاتی و غیرمستقیم" description="هر ردیف driver، رشد، سهم ارزی، نقدی/غیرنقدی و تخصیص سربار مستقل دارد." action={<button type="button" className="suggestion-button" onClick={() => update("items", [...draft.items, newOpexItem()])}>افزودن قلم</button>}>
        <div className="phase-form-grid">
          <PercentInput label="تخصیص مشترک به تولید" value={draft.sharedCostAllocationPercent} onChange={(value) => update("sharedCostAllocationPercent", Number(value ?? 0))} source="Opex-Indirect11!Q15" />
          <PercentInput label="تعدیل سناریو" value={draft.scenarioAdjustmentRate} onChange={(value) => update("scenarioAdjustmentRate", Number(value ?? 0))} source="Opex-Indirect11!Q45" />
        </div>
        <div className="table-wrap phase-table xl">
          <table className="editable-model-table opex-table">
            <thead><tr><th>عنوان</th><th>گروه</th><th>مبلغ پایه</th><th>نقدی؟</th><th>ارزی؟</th><th>سهم ارزی</th><th>رشد</th><th>Driver</th><th>تخصیص سربار</th><th>یادداشت</th><th /></tr></thead>
            <tbody>{draft.items.map((item) => <tr key={item.id}>
              <td><input value={item.name} onChange={(event) => updateItem(item.id, { name: event.target.value })} /></td>
              <td><select value={item.group} onChange={(event) => updateItem(item.id, { group: event.target.value as OpexItem["group"] })}>{["اداری و عمومی", "فروش و بازاریابی", "مالی و بانکی", "منابع انسانی", "فناوری و زیرساخت", "سربار تولید", "غیرنقدی", "سایر"].map((option) => <option key={option}>{option}</option>)}</select></td>
              <td><EditableNumber value={item.baseYearAmount} onChange={(value) => updateItem(item.id, { baseYearAmount: value })} /></td>
              <td><select value={item.cashOrNonCash} onChange={(event) => updateItem(item.id, { cashOrNonCash: event.target.value as OpexItem["cashOrNonCash"] })}><option>نقدی</option><option>غیرنقدی</option></select></td>
              <td><input type="checkbox" checked={item.isFx} onChange={(event) => updateItem(item.id, { isFx: event.target.checked })} /></td>
              <td><EditableNumber value={item.fxShare} percent onChange={(value) => updateItem(item.id, { fxShare: value })} /></td>
              <td><EditableNumber value={item.growthRate} percent onChange={(value) => updateItem(item.id, { growthRate: value })} /></td>
              <td><select value={item.costDriver} onChange={(event) => updateItem(item.id, { costDriver: event.target.value as OpexItem["costDriver"] })}>{["ثابت", "وابسته به درآمد", "وابسته به تولید", "وابسته به تعداد پرسنل", "وابسته به تورم عمومی", "وابسته به نرخ ارز", "وابسته به قرارداد", "دستی"].map((option) => <option key={option}>{option}</option>)}</select></td>
              <td><EditableNumber value={item.overheadAllocationPercent} percent onChange={(value) => updateItem(item.id, { overheadAllocationPercent: value })} /></td>
              <td><input value={item.notes} onChange={(event) => updateItem(item.id, { notes: event.target.value })} /></td>
              <td><button type="button" className="table-delete" onClick={() => update("items", draft.items.filter((row) => row.id !== item.id))}>حذف</button></td>
            </tr>)}</tbody>
          </table>
        </div>
      </SectionCard>
      <SectionCard title="برنامه OPEX سالانه">
        <div className="table-wrap phase-table"><table><thead><tr><th>سال</th><th>کل OPEX</th><th>نقدی</th><th>ارزی</th><th>نسبت به درآمد</th></tr></thead><tbody>
          {result.values.rows.slice(1, 8).map((row) => <tr key={row.year}><td>{formatNumber(row.year)}</td><td>{formatMoney(row.totalOpex, project)}</td><td>{formatMoney(row.cashOpex, project)}</td><td>{formatMoney(row.fxOpex, project)}</td><td>{formatPercent(row.totalOpex / Math.max(1, revenues[row.year] ?? 0))}</td></tr>)}
        </tbody></table></div>
      </SectionCard>
      <ValidationPanel errors={result.errors} warnings={result.warnings} />
      <FormulaTraceMini traces={result.trace} />
      <Actions onSave={() => applyOpexAssumptions(draft)} onReset={() => setDraft(clone(source))} nextHref="../capex" disabled={result.errors.length > 0} />
    </div>
  );
}

const capexTabs = [
  { id: "identity", label: "هویت قلم" },
  { id: "pricing", label: "مقدار و قیمت" },
  { id: "schedule", label: "زمان‌بندی و پرداخت" },
  { id: "risk", label: "تأخیر و ریسک" },
  { id: "side", label: "هزینه‌های جانبی" },
  { id: "depreciation", label: "استهلاک و مالیات" },
];

const createCapexItem = (baseYear: number, operationStartDate: string, unit: string): CapexItem => ({
  id: `capex-${Date.now()}`,
  code: `CAP-${Date.now().toString().slice(-4)}`,
  name: "دارایی جدید",
  assetClass: "ماشین‌آلات و تجهیزات",
  itemType: "خرید",
  depreciable: true,
  unit,
  description: "",
  source: "",
  quantity: 1,
  rialUnitPrice: 0,
  fxUnitPrice: 0,
  rialPriceShare: 1,
  fxPriceShare: 0,
  fxRateType: "freeMarket",
  unitPrice: 0,
  currency: "ریال",
  fxRate: 1,
  expectedInflationIncreasePercent: 0,
  priceIncreaseRate: 0,
  startDate: `${baseYear}-01-01`,
  endDate: operationStartDate,
  startYear: baseYear,
  endYear: Number(operationStartDate.slice(0, 4)) || baseYear,
  purchaseMonths: 1,
  installationMonths: 1,
  operationPeriodMonths: 0,
  constructionPhase: "ساخت",
  delayEnabled: false,
  prepaymentRate: 0.4,
  deliveryPaymentRate: 0.4,
  postInstallPaymentRate: 0.2,
  annualDelayEscalationRate: 0,
  delayMonths: 0,
  monthlyDelayCost: 0,
  fxRisk: "متوسط",
  supplyDelayRisk: "متوسط",
  clearanceRisk: "پایین",
  priceIncreaseRisk: "متوسط",
  permitRisk: "پایین",
  contingencyRate: 0.05,
  installationCost: 0,
  transportInsuranceCost: 0,
  trainingCost: 0,
  preOperationCost: 0,
  indirectProjectCost: 0,
  permitCost: 0,
  permitCostRate: 0,
  usefulLifeYears: 10,
  salvageValue: 0,
  salvageValueRate: 0,
  depreciationMethod: "خطی",
  depreciationStartDate: operationStartDate,
  depreciationStartYear: Number(operationStartDate.slice(0, 4)) || baseYear,
  taxEligible: true,
  accountingEligible: true,
  accountingDepreciable: true,
  accountingUsefulLifeYears: 10,
  accountingSalvageValue: 0,
  accountingSalvageValueRate: 0,
  accountingDepreciationMethod: "خطی",
  accountingDepreciationStartDate: operationStartDate,
  accountingDepreciationStartYear: Number(operationStartDate.slice(0, 4)) || baseYear,
  taxDepreciable: true,
  taxUsefulLifeYears: 10,
  taxSalvageValue: 0,
  taxSalvageValueRate: 0,
  taxDepreciationMethod: "خطی",
  taxDepreciationStartDate: operationStartDate,
  taxDepreciationStartYear: Number(operationStartDate.slice(0, 4)) || baseYear,
});

export function CapexWorkspace() {
  const { activeScenario, project, mode, outputs, applyCapexAssumptions, updateInput, runCalculation } = useProject();
  const source = activeScenario.assumptions.capex;
  const macro = activeScenario.assumptions.macro;
  const [draft, setDraft] = useState<CapexAssumptions>(() => clone(source));
  const [selectedId, setSelectedId] = useState(source.items[0]?.id ?? "");
  const [tab, setTab] = useState("identity");
  useEffect(() => {
    setDraft(clone(source));
    setSelectedId(source.items[0]?.id ?? "");
  }, [activeScenario.id, source]);
  const selected = draft.items.find((item) => item.id === selectedId) ?? draft.items[0];
  const summary = useMemo(() => calculateCapexSummary(draft.items, macro), [draft.items, macro]);
  const annual = useMemo(
    () => calculateAnnualCapexSchedule(draft, macro, project.baseYear, project.modelHorizonYears),
    [draft, macro, project.baseYear, project.modelHorizonYears],
  );
  const selectedResult = useMemo(
    () => selected ? calculateCapexItem(selected, macro) : null,
    [macro, selected],
  );
  const taxAssumptions = activeScenario.assumptions.tax;
  const taxVisibleFields = useMemo(
    () => getVisibleTaxIncentiveFields(taxAssumptions.incentiveType),
    [taxAssumptions.incentiveType],
  );
  const taxYearOne = outputs.tax.rows[1] ?? outputs.tax.rows[0];
  const updateTaxAssumption = <K extends keyof TaxAssumptions>(key: K, value: TaxAssumptions[K]) => {
    updateInput(`assumptions.tax.${String(key)}`, value);
  };
  const updateIncentiveType = (type: TaxIncentiveType) => {
    updateTaxAssumption("incentiveType", type);
    const defaults = getTaxIncentiveDefaults(type);
    Object.entries(defaults).forEach(([key, value]) => {
      updateInput(`assumptions.tax.${key}`, value);
    });
  };
  const showTaxField = (field: keyof TaxAssumptions) => taxVisibleFields.includes(String(field));
  const updateSelected = <K extends keyof CapexItem>(key: K, value: CapexItem[K]) => {
    if (!selected) return;
    setDraft((current) => ({
      ...current,
      items: current.items.map((item) => item.id === selected.id ? { ...item, [key]: value } : item),
    }));
  };
  const addItem = () => {
    const item = createCapexItem(project.baseYear, project.operationStartDate, activeScenario.assumptions.capacity.unit);
    setDraft((current) => ({ ...current, items: [...current.items, item] }));
    setSelectedId(item.id);
    setTab("identity");
  };
  const duplicateItem = () => {
    if (!selected) return;
    const copy = { ...clone(selected), id: `capex-${Date.now()}`, code: `${selected.code}-COPY`, name: `${selected.name} - کپی` };
    setDraft((current) => ({ ...current, items: [...current.items, copy] }));
    setSelectedId(copy.id);
  };
  const deleteItem = () => {
    if (!selected || draft.items.length <= 1) return;
    const next = draft.items.filter((item) => item.id !== selected.id);
    setDraft((current) => ({ ...current, items: next }));
    setSelectedId(next[0]?.id ?? "");
  };

  return (
    <div className="phase-workspace">
      <MetricStrip metrics={[
        { label: "کل سرمایه‌گذاری ثابت", value: formatMoney(summary.values.totalFixedInvestment, project), note: `${formatNumber(draft.items.length)} قلم` },
        { label: "سهم ارزی", value: formatPercent(summary.values.importedAssetShare), note: formatMoney(summary.values.totalFxInvestment, project) },
        { label: "هزینه تأخیر", value: formatMoney(summary.values.totalDelayCost, project), note: "فقط اقلام فعال" },
        { label: "استهلاک سالانه", value: formatMoney(summary.values.totalAnnualDepreciation, project), note: "بر مبنای قلم" },
      ]} />
      <div className="capex-builder">
        <aside className="capex-item-list">
          <header><div><span>Asset register</span><strong>اقلام CAPEX</strong></div><button type="button" onClick={addItem}>+ قلم جدید</button></header>
          <div>{draft.items.map((item) => {
            const result = calculateCapexItem(item, macro).values;
            return <button type="button" key={item.id} className={selected?.id === item.id ? "active" : ""} onClick={() => setSelectedId(item.id)}>
              <span>{item.code}</span><strong>{item.name}</strong><small>{formatMoney(result.finalItemCost, project)}</small>
              {result.status.length ? <i>{formatNumber(result.status.length)}</i> : null}
            </button>;
          })}</div>
          <footer><button type="button" onClick={duplicateItem} disabled={!selected}>تکثیر</button><button type="button" className="danger" onClick={deleteItem} disabled={draft.items.length <= 1}>حذف</button></footer>
        </aside>
        <main className="capex-editor">
          {selected && selectedResult ? <>
            <Tabs tabs={capexTabs} active={tab} onChange={setTab} />
            <section className="capex-item-head">
              <div><span>{selected.code}</span><h3>{selected.name}</h3><p>{selected.assetClass} · {selected.itemType}</p></div>
              <div><span>بهای نهایی قلم</span><strong>{formatMoney(selectedResult.values.finalItemCost, project)}</strong><small>{selectedResult.values.status.length ? selectedResult.values.status.join("، ") : "اطلاعات قلم کامل است"}</small></div>
            </section>

            {tab === "identity" ? <SectionCard title="هویت و طبقه‌بندی دارایی">
              <div className="phase-form-grid">
                <AssumptionInput label="کد قلم" value={selected.code} onChange={(value) => updateSelected("code", String(value ?? ""))} source="Capex12!U8" />
                <AssumptionInput label="نام قلم" value={selected.name} onChange={(value) => updateSelected("name", String(value ?? ""))} source="Capex12!U9" />
                <SelectInput label="طبقه دارایی" value={selected.assetClass} options={["زمین", "ساختمان", "ماشین‌آلات و تجهیزات", "تأسیسات", "وسائط نقلیه", "تجهیزات اداری", "دارایی نامشهود", "زیرساخت فناوری", "سایر"]} onChange={(value) => updateSelected("assetClass", String(value))} source="Capex12!U10" />
                <SelectInput label="نوع قلم" value={selected.itemType} options={["خرید", "ساخت", "نصب", "توسعه", "لایسنس", "حق بهره‌برداری", "سایر"]} onChange={(value) => updateSelected("itemType", String(value))} source="Capex12!U11" />
                <ToggleInput label="استهلاک‌پذیر" value={selected.depreciable} onChange={(value) => updateSelected("depreciable", Boolean(value))} source="Capex12!U12" />
                <AssumptionInput label="واحد" value={selected.unit} onChange={(value) => updateSelected("unit", String(value ?? ""))} source="Capex12!U13" />
                <AssumptionInput label="شرح" type="textarea" value={selected.description} onChange={(value) => updateSelected("description", String(value ?? ""))} source="Capex12!U14" />
                <AssumptionInput label="منبع قیمت" value={selected.source} onChange={(value) => updateSelected("source", String(value ?? ""))} source="Capex12!U15" />
              </div>
            </SectionCard> : null}

            {tab === "pricing" ? <SectionCard title="مقدار، قیمت و ارز">
              <div className="phase-form-grid">
                <NumberInput label="مقدار" value={selected.quantity} onChange={(value) => updateSelected("quantity", Number(value ?? 0))} source="Capex12!U20" />
                <CurrencyInput label="قیمت واحد ریالی" value={selected.rialUnitPrice} onChange={(value) => updateSelected("rialUnitPrice", Number(value ?? 0))} source="Capex12!U21" />
                <NumberInput label="قیمت واحد ارزی" value={selected.fxUnitPrice} onChange={(value) => updateSelected("fxUnitPrice", Number(value ?? 0))} source="Capex12!U21:U23" />
                <PercentInput label="سهم قیمت ریالی" value={selected.rialPriceShare} onChange={(value) => updateSelected("rialPriceShare", Number(value ?? 0))} />
                <PercentInput label="سهم قیمت ارزی" value={selected.fxPriceShare} onChange={(value) => updateSelected("fxPriceShare", Number(value ?? 0))} />
                <SelectInput label="نوع نرخ ارز" value={selected.fxRateType} options={fxTypeOptions} onChange={(value) => updateSelected("fxRateType", value as CapexItem["fxRateType"])} source="Capex12!U22:U23" />
                {selected.fxRateType === "manual" ? <CurrencyInput label="نرخ ارز دستی" value={selected.manualFxRate ?? 0} onChange={(value) => updateSelected("manualFxRate", Number(value ?? 0))} /> : null}
                <PercentInput label="افزایش قیمت مورد انتظار" value={selected.expectedInflationIncreasePercent} onChange={(value) => updateSelected("expectedInflationIncreasePercent", Number(value ?? 0))} source="Capex12!U25" />
              </div>
              <div className="calculation-preview">
                <div><span>قیمت واحد مبنا</span><strong>{formatMoney(selectedResult.values.unitPriceBase, project)}</strong></div>
                <div><span>مبلغ اولیه</span><strong>{formatMoney(selectedResult.values.finalAmount, project)}</strong></div>
                <div><span>مبلغ تعدیل‌شده</span><strong>{formatMoney(selectedResult.values.adjustedAmount, project)}</strong></div>
              </div>
            </SectionCard> : null}

            {tab === "schedule" ? <SectionCard title="زمان‌بندی خرید، نصب و پرداخت">
              <div className="phase-form-grid">
                <AssumptionInput label="تاریخ شروع" type="date" value={selected.startDate} onChange={(value) => updateSelected("startDate", String(value ?? ""))} source="Capex12!U32" />
                <AssumptionInput label="تاریخ پایان" type="date" value={selected.endDate} onChange={(value) => updateSelected("endDate", String(value ?? ""))} source="Capex12!U33" />
                <NumberInput label="مدت خرید" value={selected.purchaseMonths} onChange={(value) => updateSelected("purchaseMonths", Number(value ?? 0))} help="ماه" source="Capex12!U34" />
                <NumberInput label="مدت نصب" value={selected.installationMonths} onChange={(value) => updateSelected("installationMonths", Number(value ?? 0))} help="ماه" source="Capex12!U35" />
                <AssumptionInput label="فاز ساخت" value={selected.constructionPhase} onChange={(value) => updateSelected("constructionPhase", String(value ?? ""))} source="Capex12!U37" />
                <PercentInput label="پیش‌پرداخت" value={selected.prepaymentRate} onChange={(value) => updateSelected("prepaymentRate", Number(value ?? 0))} source="Capex12!U38" />
                <PercentInput label="پرداخت تحویل" value={selected.deliveryPaymentRate} onChange={(value) => updateSelected("deliveryPaymentRate", Number(value ?? 0))} source="Capex12!U39" />
                <PercentInput label="پرداخت پس از نصب" value={selected.postInstallPaymentRate} onChange={(value) => updateSelected("postInstallPaymentRate", Number(value ?? 0))} source="Capex12!U40" />
              </div>
              <p className={`payment-check ${Math.abs(selected.prepaymentRate + selected.deliveryPaymentRate + selected.postInstallPaymentRate - 1) < 0.0001 ? "ok" : "error"}`}>جمع برنامه پرداخت: {formatPercent(selected.prepaymentRate + selected.deliveryPaymentRate + selected.postInstallPaymentRate)}</p>
            </SectionCard> : null}

            {tab === "risk" ? <SectionCard title="تأخیر و ماتریس ریسک" description="تأخیر به‌صورت پیش‌فرض غیرفعال است و فقط در صورت فعال‌سازی وارد CAPEX می‌شود.">
              <div className="phase-form-grid">
                <ToggleInput label="سناریوی تأخیر برای این قلم" value={selected.delayEnabled} onChange={(value) => updateSelected("delayEnabled", Boolean(value))} />
                <NumberInput label="ماه تأخیر" value={selected.delayMonths} onChange={(value) => updateSelected("delayMonths", Number(value ?? 0))} disabled={!selected.delayEnabled} source="Capex12!U42" />
                <CurrencyInput label="هزینه مستقیم هر ماه تأخیر" value={selected.monthlyDelayCost} onChange={(value) => updateSelected("monthlyDelayCost", Number(value ?? 0))} disabled={!selected.delayEnabled} source="Capex12!U43" />
                <PercentInput label="رشد سالانه قیمت در تأخیر" value={selected.annualDelayEscalationRate} onChange={(value) => updateSelected("annualDelayEscalationRate", Number(value ?? 0))} disabled={!selected.delayEnabled} source="Capex12!U41" />
                {(["fxRisk", "supplyDelayRisk", "clearanceRisk", "priceIncreaseRisk", "permitRisk"] as const).map((key) => <SelectInput key={key} label={{ fxRisk: "ریسک ارز", supplyDelayRisk: "ریسک تأمین و تأخیر", clearanceRisk: "ریسک ترخیص", priceIncreaseRisk: "ریسک افزایش قیمت", permitRisk: "ریسک مجوز" }[key]} value={selected[key]} options={["پایین", "متوسط", "بالا", "بحرانی"]} onChange={(value) => updateSelected(key, value as CapexItem[typeof key])} />)}
              </div>
              <div className="calculation-preview">
                <div><span>هزینه مستقیم تأخیر</span><strong>{formatMoney(selectedResult.values.delayMonthlyCostTotal, project)}</strong></div>
                <div><span>تعدیل قیمت تأخیر</span><strong>{formatMoney(selectedResult.values.delayPriceEscalationCost, project)}</strong></div>
                <div><span>کل اثر تأخیر</span><strong>{formatMoney(selectedResult.values.totalDelayCost, project)}</strong></div>
              </div>
            </SectionCard> : null}

            {tab === "side" ? <SectionCard title="هزینه‌های جانبی و احتیاط">
              <div className="phase-form-grid">
                <CurrencyInput label="نصب" value={selected.installationCost} onChange={(value) => updateSelected("installationCost", Number(value ?? 0))} source="Capex12!U57" />
                <CurrencyInput label="حمل و بیمه" value={selected.transportInsuranceCost} onChange={(value) => updateSelected("transportInsuranceCost", Number(value ?? 0))} source="Capex12!U58" />
                <CurrencyInput label="آموزش" value={selected.trainingCost} onChange={(value) => updateSelected("trainingCost", Number(value ?? 0))} source="Capex12!U59" />
                <CurrencyInput label="پیش‌بهره‌برداری" value={selected.preOperationCost} onChange={(value) => updateSelected("preOperationCost", Number(value ?? 0))} source="Capex12!U60" />
                <CurrencyInput label="هزینه غیرمستقیم پروژه" value={selected.indirectProjectCost} onChange={(value) => updateSelected("indirectProjectCost", Number(value ?? 0))} source="Capex12!U61" />
                <CurrencyInput label="هزینه مجوز ثابت" value={selected.permitCost} onChange={(value) => updateSelected("permitCost", Number(value ?? 0))} source="Capex12!U62" />
                <PercentInput label="نرخ هزینه مجوز" value={selected.permitCostRate} onChange={(value) => updateSelected("permitCostRate", Number(value ?? 0))} source="Capex12!U62" />
                <PercentInput label="Contingency" value={selected.contingencyRate} onChange={(value) => updateSelected("contingencyRate", Number(value ?? 0))} source="Capex12!U56" />
              </div>
            </SectionCard> : null}

            {tab === "depreciation" ? <SectionCard title="استهلاک حسابداری و مالیاتی">
              <div className="tax-depreciation-grid">
                <GlassCard accent="info" className="depreciation-book-card">
                  <header><span>Accounting book</span><strong>استهلاک حسابداری</strong></header>
                  <div className="phase-form-grid">
                    <ToggleInput label="قابل استهلاک" value={selected.accountingDepreciable} onChange={(value) => updateSelected("accountingDepreciable", Boolean(value))} source="Capex12!U12 / TaxDepreciation15!R8" />
                    <NumberInput label="عمر مفید حسابداری" value={selected.accountingUsefulLifeYears} onChange={(value) => updateSelected("accountingUsefulLifeYears", Number(value ?? 0))} help="سال" source="TaxDepreciation15!R10" disabled={!selected.accountingDepreciable} />
                    <CurrencyInput label="ارزش اسقاط حسابداری" value={selected.accountingSalvageValue} onChange={(value) => updateSelected("accountingSalvageValue", Number(value ?? 0))} disabled={!selected.accountingDepreciable} />
                    <PercentInput label="نرخ ارزش اسقاط حسابداری" value={selected.accountingSalvageValueRate} onChange={(value) => updateSelected("accountingSalvageValueRate", Number(value ?? 0))} source="Capex12!U71" disabled={!selected.accountingDepreciable} />
                    <SelectInput label="روش استهلاک حسابداری" value={selected.accountingDepreciationMethod} options={["خطی", "نزولی", "یکجا"]} onChange={(value) => updateSelected("accountingDepreciationMethod", String(value))} source="TaxDepreciation15!R11" disabled={!selected.accountingDepreciable} help="روش‌های نمایشی حذف شده‌اند؛ هر گزینه این فهرست در engine برنامه مستقل دارد." />
                    <AssumptionInput label="تاریخ شروع استهلاک حسابداری" type="date" value={selected.accountingDepreciationStartDate} onChange={(value) => updateSelected("accountingDepreciationStartDate", String(value ?? ""))} source="Capex12!U73" disabled={!selected.accountingDepreciable} />
                  </div>
                  <div className="calculation-preview">
                    <div><span>استهلاک حسابداری سالانه</span><strong>{formatMoney(selectedResult.values.accountingDepreciationAnnual, project)}</strong></div>
                    <div><span>استهلاک حسابداری سال اول</span><strong>{formatMoney(selectedResult.values.accountingDepreciationFirstYear, project)}</strong></div>
                    <div><span>استهلاک تجمعی حسابداری</span><strong>{formatMoney(selectedResult.values.accountingAccumulatedDepreciation, project)}</strong></div>
                    <div><span>ارزش دفتری حسابداری پایان دوره</span><strong>{formatMoney(selectedResult.values.accountingBookValueEnd, project)}</strong></div>
                  </div>
                </GlassCard>
                <GlassCard accent="warning" className="depreciation-book-card">
                  <header><span>Tax book</span><strong>استهلاک مالیاتی</strong></header>
                  <div className="phase-form-grid">
                    <ToggleInput label="مشمول استهلاک مالیاتی" value={selected.taxDepreciable} onChange={(value) => updateSelected("taxDepreciable", Boolean(value))} source="TaxDepreciation15!R16" />
                    <NumberInput label="عمر مفید مالیاتی" value={selected.taxUsefulLifeYears} onChange={(value) => updateSelected("taxUsefulLifeYears", Number(value ?? 0))} help="سال" source="TaxDepreciation15!R18" disabled={!selected.taxDepreciable} />
                    <CurrencyInput label="ارزش اسقاط مالیاتی" value={selected.taxSalvageValue} onChange={(value) => updateSelected("taxSalvageValue", Number(value ?? 0))} disabled={!selected.taxDepreciable} />
                    <PercentInput label="نرخ ارزش اسقاط مالیاتی" value={selected.taxSalvageValueRate} onChange={(value) => updateSelected("taxSalvageValueRate", Number(value ?? 0))} disabled={!selected.taxDepreciable} />
                    <SelectInput label="روش استهلاک مالیاتی" value={selected.taxDepreciationMethod} options={["خطی", "نزولی", "یکجا"]} onChange={(value) => updateSelected("taxDepreciationMethod", String(value))} source="TaxDepreciation15!R19" disabled={!selected.taxDepreciable} help="استهلاک مالیاتی از دفتر حسابداری مستقل محاسبه می‌شود." />
                    <AssumptionInput label="تاریخ شروع استهلاک مالیاتی" type="date" value={selected.taxDepreciationStartDate} onChange={(value) => updateSelected("taxDepreciationStartDate", String(value ?? ""))} source="TaxDepreciation15!R18:R20" disabled={!selected.taxDepreciable} />
                  </div>
                  <div className="calculation-preview">
                    <div><span>استهلاک مالیاتی سالانه</span><strong>{formatMoney(selectedResult.values.taxDepreciationAnnual, project)}</strong></div>
                    <div><span>استهلاک مالیاتی سال اول</span><strong>{formatMoney(selectedResult.values.taxDepreciationFirstYear, project)}</strong></div>
                    <div><span>استهلاک تجمعی مالیاتی</span><strong>{formatMoney(selectedResult.values.taxAccumulatedDepreciation, project)}</strong></div>
                    <div><span>ارزش دفتری مالیاتی پایان دوره</span><strong>{formatMoney(selectedResult.values.taxBookValueEnd, project)}</strong></div>
                  </div>
                </GlassCard>
              </div>
            </SectionCard> : null}
            {mode === "advanced" ? <FormulaTraceMini traces={selectedResult.trace} /> : null}
          </> : <div className="empty-state large"><strong>هیچ قلم CAPEX ثبت نشده است.</strong><button type="button" className="primary-button" onClick={addItem}>ایجاد اولین قلم</button></div>}
        </main>
      </div>

      <SectionCard title="خلاصه سرمایه‌گذاری ثابت" description={`بزرگ‌ترین قلم: ${summary.values.largestItemName || "-"} (${formatPercent(summary.values.largestItemShare)})`}>
        <div className="control-cards">
          <article><span>سرمایه‌گذاری ریالی</span><strong>{formatMoney(summary.values.totalRialInvestment, project)}</strong></article>
          <article><span>سرمایه‌گذاری ارزی</span><strong>{formatMoney(summary.values.totalFxInvestment, project)}</strong></article>
          <article><span>پیش‌بهره‌برداری</span><strong>{formatMoney(summary.values.totalPreOperationCost, project)}</strong></article>
          <article><span>Contingency</span><strong>{formatMoney(summary.values.totalContingencyCost, project)}</strong></article>
        </div>
      </SectionCard>
      <SectionCard title="زمان‌بندی سالانه CAPEX و استهلاک">
        <div className="table-wrap phase-table xl"><table><thead><tr><th>سال مدل</th><th>سال تقویمی</th><th>پیش‌پرداخت</th><th>تحویل</th><th>پس از نصب</th><th>تأخیر</th><th>جانبی</th><th>CAPEX نهایی</th><th>استهلاک</th><th>خالص دارایی ثابت</th></tr></thead><tbody>
          {annual.filter((row) => row.finalAnnualCapex > 0 || row.depreciation > 0).map((row) => <tr key={row.year}><td>{formatNumber(row.year)}</td><td>{formatNumber(row.calendarYear)}</td><td>{formatMoney(row.advancePayment, project)}</td><td>{formatMoney(row.deliveryPayment, project)}</td><td>{formatMoney(row.postInstallationPayment, project)}</td><td>{formatMoney(row.delayCost, project)}</td><td>{formatMoney(row.installationCost + row.preOperationCost + row.contingencyCost, project)}</td><td>{formatMoney(row.finalAnnualCapex, project)}</td><td>{formatMoney(row.depreciation, project)}</td><td>{formatMoney(row.netFixedAssets, project)}</td></tr>)}
        </tbody></table></div>
      </SectionCard>
      <SectionCard title="مالیات" description="استهلاک حسابداری و مالیاتی اقلام CAPEX به جدول مالیات، تعدیل استهلاک، زیان قابل انتقال و مشوق‌ها وصل است.">
        <div className="capex-tax-workspace">
          <GlassCard accent="accent" className="tax-incentive-panel">
            <header>
              <div><span>TaxDepreciation15</span><strong>معافیت‌ها و مشوق‌ها</strong></div>
              <StatusPill tone={taxAssumptions.incentiveType === "بدون معافیت" ? "neutral" : "success"}>{taxAssumptions.incentiveType}</StatusPill>
            </header>
            <div className="phase-form-grid">
              <SelectInput label="نوع مشوق مالیاتی" value={taxAssumptions.incentiveType} options={taxIncentiveTypes} onChange={(value) => updateIncentiveType(value as TaxIncentiveType)} source="TaxDepreciation15!R36:R40" />
              <PercentInput label="نرخ عادی مالیات" value={taxAssumptions.normalTaxRateOverride ?? macro.corporateTaxRate} onChange={(value) => updateTaxAssumption("normalTaxRateOverride", Number(value ?? 0))} source="MarcoAssumptions05!V47" />
              {showTaxField("approvedKnowledgeRevenueShare") ? <PercentInput label="درصد درآمد دانش‌بنیان تأییدشده" value={taxAssumptions.approvedKnowledgeRevenueShare} onChange={(value) => updateTaxAssumption("approvedKnowledgeRevenueShare", Number(value ?? 0))} /> : null}
              {showTaxField("knowledgeBasedExemptionYears") ? <NumberInput label="مدت معافیت پیشنهادی" value={taxAssumptions.knowledgeBasedExemptionYears} onChange={(value) => updateTaxAssumption("knowledgeBasedExemptionYears", Number(value ?? 0))} help="سال" /> : null}
              {showTaxField("knowledgeBasedStartYear") ? <NumberInput label="سال شروع" value={taxAssumptions.knowledgeBasedStartYear} onChange={(value) => updateTaxAssumption("knowledgeBasedStartYear", Number(value ?? 0))} /> : null}
              {showTaxField("freeZoneInsideActivityShare") ? <PercentInput label="درصد فعالیت داخل منطقه آزاد" value={taxAssumptions.freeZoneInsideActivityShare} onChange={(value) => updateTaxAssumption("freeZoneInsideActivityShare", Number(value ?? 0))} /> : null}
              {showTaxField("freeZoneInsideActivityShare") ? <PercentInput label="درصد فعالیت خارج از منطقه آزاد" value={1 - taxAssumptions.freeZoneInsideActivityShare} onChange={(value) => updateTaxAssumption("freeZoneInsideActivityShare", Math.max(0, 1 - Number(value ?? 0)))} /> : null}
              {showTaxField("freeZonePermitDate") ? <AssumptionInput label="تاریخ بهره‌برداری مندرج در مجوز" type="date" value={taxAssumptions.freeZonePermitDate} onChange={(value) => updateTaxAssumption("freeZonePermitDate", String(value ?? ""))} /> : null}
              {showTaxField("freeZonePermitValid") ? <ToggleInput label="مجوز فعالیت منطقه آزاد دارد؟" value={taxAssumptions.freeZonePermitValid} onChange={(value) => updateTaxAssumption("freeZonePermitValid", Boolean(value))} /> : null}
              {showTaxField("lessDevelopedEligibleIncomeShare") ? <PercentInput label="درصد درآمد مشمول نرخ صفر" value={taxAssumptions.lessDevelopedEligibleIncomeShare} onChange={(value) => updateTaxAssumption("lessDevelopedEligibleIncomeShare", Number(value ?? 0))} /> : null}
              {showTaxField("lessDevelopedZeroRateYears") ? <NumberInput label="مدت نرخ صفر پیشنهادی" value={taxAssumptions.lessDevelopedZeroRateYears} onChange={(value) => updateTaxAssumption("lessDevelopedZeroRateYears", Number(value ?? 0))} help="سال" /> : null}
              {showTaxField("lessDevelopedStartYear") ? <NumberInput label="سال شروع بهره‌برداری" value={taxAssumptions.lessDevelopedStartYear} onChange={(value) => updateTaxAssumption("lessDevelopedStartYear", Number(value ?? 0))} /> : null}
              {showTaxField("lessDevelopedActivityType") ? <AssumptionInput label="نوع فعالیت مشمول" value={taxAssumptions.lessDevelopedActivityType} onChange={(value) => updateTaxAssumption("lessDevelopedActivityType", String(value ?? ""))} /> : null}
              {showTaxField("preferentialTaxRate") ? <PercentInput label="نرخ مالیات ترجیحی" value={taxAssumptions.preferentialTaxRate} onChange={(value) => updateTaxAssumption("preferentialTaxRate", Number(value ?? 0))} /> : null}
              {showTaxField("preferentialYears") ? <NumberInput label="مدت نرخ ترجیحی" value={taxAssumptions.preferentialYears} onChange={(value) => updateTaxAssumption("preferentialYears", Number(value ?? 0))} help="سال" /> : null}
              {showTaxField("preferentialIncomeShare") ? <PercentInput label="درصد درآمد مشمول نرخ ترجیحی" value={taxAssumptions.preferentialIncomeShare} onChange={(value) => updateTaxAssumption("preferentialIncomeShare", Number(value ?? 0))} /> : null}
              {showTaxField("taxCreditAmount") ? <CurrencyInput label="مبلغ اعتبار مالیاتی" value={taxAssumptions.taxCreditAmount} onChange={(value) => updateTaxAssumption("taxCreditAmount", Number(value ?? 0))} /> : null}
              {showTaxField("taxCreditPercentOfCapex") ? <PercentInput label="درصد اعتبار از CAPEX" value={taxAssumptions.taxCreditPercentOfCapex} onChange={(value) => updateTaxAssumption("taxCreditPercentOfCapex", Number(value ?? 0))} /> : null}
              {showTaxField("annualTaxCreditCap") ? <CurrencyInput label="سقف قابل استفاده سالانه" value={taxAssumptions.annualTaxCreditCap} onChange={(value) => updateTaxAssumption("annualTaxCreditCap", Number(value ?? 0))} /> : null}
              {showTaxField("taxCreditCarryForward") ? <ToggleInput label="قابلیت انتقال به سال بعد" value={taxAssumptions.taxCreditCarryForward} onChange={(value) => updateTaxAssumption("taxCreditCarryForward", Boolean(value))} /> : null}
              {showTaxField("percentExemptionRate") ? <PercentInput label="درصد معافیت" value={taxAssumptions.percentExemptionRate} onChange={(value) => updateTaxAssumption("percentExemptionRate", Number(value ?? 0))} /> : null}
              {showTaxField("percentExemptionYears") ? <NumberInput label="مدت معافیت" value={taxAssumptions.percentExemptionYears} onChange={(value) => updateTaxAssumption("percentExemptionYears", Number(value ?? 0))} /> : null}
              {showTaxField("percentExemptionIncomeShare") ? <PercentInput label="درصد درآمد مشمول" value={taxAssumptions.percentExemptionIncomeShare} onChange={(value) => updateTaxAssumption("percentExemptionIncomeShare", Number(value ?? 0))} /> : null}
              {showTaxField("customEligibleIncomeShare") ? <PercentInput label="درصد درآمد مشمول سفارشی" value={taxAssumptions.customEligibleIncomeShare} onChange={(value) => updateTaxAssumption("customEligibleIncomeShare", Number(value ?? 0))} /> : null}
              {showTaxField("customEffectiveTaxRate") ? <PercentInput label="نرخ موثر سفارشی" value={taxAssumptions.customEffectiveTaxRate} onChange={(value) => updateTaxAssumption("customEffectiveTaxRate", Number(value ?? 0))} /> : null}
            </div>
            <GlassButton variant="primary" onClick={runCalculation}>اعمال مفروضات مالیاتی و محاسبه مجدد</GlassButton>
          </GlassCard>

          <AlignedCardGrid className="tax-kpi-premium-grid">
            <GlassCard><span>استهلاک حسابداری سال 1</span><strong>{formatMoney(outputs.tax.kpis.accountingDepreciationYear1, project)}</strong></GlassCard>
            <GlassCard><span>استهلاک مالیاتی سال 1</span><strong>{formatMoney(outputs.tax.kpis.taxDepreciationYear1, project)}</strong></GlassCard>
            <GlassCard><span>تعدیل استهلاک سال 1</span><strong>{formatMoney(outputs.tax.kpis.depreciationAdjustmentYear1, project)}</strong></GlassCard>
            <GlassCard><span>سود مشمول مالیات نهایی</span><strong>{formatMoney(outputs.tax.kpis.finalTaxableIncomeYear1, project)}</strong></GlassCard>
            <GlassCard><span>زیان قابل انتقال پایان سال</span><strong>{formatMoney(outputs.tax.kpis.closingTaxLossYear1, project)}</strong></GlassCard>
            <GlassCard><span>مالیات نهایی سال 1</span><strong>{formatMoney(outputs.tax.kpis.finalTaxYear1, project)}</strong></GlassCard>
            <GlassCard><span>نرخ موثر مالیات</span><strong>{formatPercent(outputs.tax.kpis.effectiveTaxRateYear1)}</strong></GlassCard>
            <GlassCard><span>اثر مشوق مالیاتی</span><strong>{formatMoney(outputs.tax.kpis.incentiveEffectYear1, project)}</strong></GlassCard>
          </AlignedCardGrid>

          <GlassCard accent="info" className="tax-bridge-card">
            <header><span>Tax base bridge</span><strong>پایه مالیاتی و زیان قابل انتقال</strong></header>
            <div className="tax-bridge-mini">
              <div><span>سود قبل از مالیات حسابداری</span><strong>{formatMoney(taxYearOne.accountingEbt, project)}</strong></div>
              <div><span>تعدیل استهلاک</span><strong>{formatMoney(taxYearOne.depreciationAdjustment, project)}</strong></div>
              <div><span>سود مشمول قبل از زیان</span><strong>{formatMoney(taxYearOne.taxableProfitBeforeLoss, project)}</strong></div>
              <div><span>زیان مصرف‌شده</span><strong>{formatMoney(taxYearOne.lossUsed, project)}</strong></div>
              <div><span>مالیات قبل از مشوق</span><strong>{formatMoney(taxYearOne.baseTax, project)}</strong></div>
              <div><span>اعتبار مالیاتی مصرف‌شده</span><strong>{formatMoney(taxYearOne.taxCreditUsed, project)}</strong></div>
            </div>
          </GlassCard>

          <GlassCard accent="neutral" className="tax-annual-table-card">
            <header><span>Annual table</span><strong>جدول سالانه استهلاک و مالیات</strong></header>
            <PremiumTableShell className="xl sticky-first">
              <table>
                <thead><tr>{["سال", "استهلاک حسابداری", "استهلاک مالیاتی", "تعدیل استهلاک", "حسابداری EBT", "سود مشمول قبل از زیان", "زیان ابتدای سال", "زیان مصرف‌شده", "سود مشمول نهایی", "زیان پایان سال", "مالیات قبل از مشوق", "اثر مشوق", "اعتبار مصرف‌شده", "مالیات نهایی", "نرخ موثر"].map((head) => <th key={head}>{head}</th>)}</tr></thead>
                <tbody>
                  {outputs.tax.rows.map((row) => (
                    <tr key={row.year}>
                      <td>{formatNumber(row.year)}</td>
                      <td>{formatMoney(row.accountingDepreciation, project)}</td>
                      <td>{formatMoney(row.taxDepreciation, project)}</td>
                      <td>{formatMoney(row.depreciationAdjustment, project)}</td>
                      <td>{formatMoney(row.accountingEbt, project)}</td>
                      <td>{formatMoney(row.taxableProfitBeforeLoss, project)}</td>
                      <td>{formatMoney(row.openingTaxLoss, project)}</td>
                      <td>{formatMoney(row.lossUsed, project)}</td>
                      <td>{formatMoney(row.finalTaxableIncome, project)}</td>
                      <td>{formatMoney(row.closingTaxLoss, project)}</td>
                      <td>{formatMoney(row.baseTax, project)}</td>
                      <td>{formatMoney(row.incentiveEffect, project)}</td>
                      <td>{formatMoney(row.taxCreditUsed, project)}</td>
                      <td>{formatMoney(row.finalTax, project)}</td>
                      <td>{formatPercent(row.effectiveTaxRate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </PremiumTableShell>
          </GlassCard>
        </div>
      </SectionCard>
      <ValidationPanel errors={summary.errors} warnings={summary.warnings} />
      <Actions
        onSave={() => applyCapexAssumptions({ ...draft, annualSchedule: annual, summary: summary.values })}
        onReset={() => setDraft(clone(source))}
        nextHref="../construction-cashflow"
        disabled={summary.errors.length > 0}
      />
    </div>
  );
}

export function WorkingCapitalWorkspace() {
  const { activeScenario, project, outputs, applyWorkingCapitalAssumptions } = useProject();
  const source = activeScenario.assumptions.workingCapital;
  const industry = activeScenario.assumptions.industry;
  const [draft, setDraft] = useState<WorkingCapitalAssumptions>(() => clone(source));
  useEffect(() => {
    setDraft({
      ...clone(source),
      receivableDays: industry.receivablesDays,
      payableDays: industry.payablesDays,
    });
  }, [activeScenario.id, industry.payablesDays, industry.receivablesDays, source]);

  const effectiveDraft: WorkingCapitalAssumptions = {
    ...draft,
    receivableDays: industry.receivablesDays,
    payableDays: industry.payablesDays,
  };
  const update = <K extends keyof WorkingCapitalAssumptions>(key: K, value: WorkingCapitalAssumptions[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };
  const yearOne = outputs.workingCapital.rows[1] ?? outputs.workingCapital.rows[0];

  return (
    <div className="phase-workspace working-capital-workspace">
      <MetricStrip metrics={[
        { label: "سرمایه در گردش اولیه", value: formatMoney(outputs.workingCapital.initialWorkingCapital, project), note: "WorkingCapital13!R34" },
        { label: "آزادسازی پایان پروژه", value: formatMoney(outputs.workingCapital.releaseFinalYear, project), note: `سال ${formatNumber(project.modelHorizonYears)}` },
        { label: "دوره وصول مطالبات", value: `${formatNumber(industry.receivablesDays)} روز`, note: "از تب قالب صنعت" },
        { label: "دوره پرداخت به تامین‌کنندگان", value: `${formatNumber(industry.payablesDays)} روز`, note: "از تب قالب صنعت" },
      ]} />

      <SectionCard title="پارامترهای دوره زمانی" description="دوره وصول مطالبات و دوره پرداخت به تامین‌کنندگان از قالب صنعت خوانده و در این تب فقط نمایش داده می‌شوند.">
        <div className="phase-form-grid">
          <NumberInput label="دوره نگهداری مواد اولیه" value={effectiveDraft.rawMaterialDays} onChange={(value) => update("rawMaterialDays", Number(value ?? 0))} help="روز" source="WorkingCapital13!R8" />
          <NumberInput label="دوره نگهداری موجودی محصول تولید شده" value={effectiveDraft.inventoryDays} onChange={(value) => update("inventoryDays", Number(value ?? 0))} help="روز" source="WorkingCapital13!R9" />
          <AssumptionInput label="دوره وصول مطالبات" value={`${formatNumber(industry.receivablesDays)} روز`} onChange={() => undefined} disabled source="از تب قالب صنعت" />
          <AssumptionInput label="دوره پرداخت به تامین‌کنندگان" value={`${formatNumber(industry.payablesDays)} روز`} onChange={() => undefined} disabled source="از تب قالب صنعت" />
          <NumberInput label="دوره پیش‌پرداخت به تامین‌کنندگان" value={effectiveDraft.supplierPrepaymentDays} onChange={(value) => update("supplierPrepaymentDays", Number(value ?? 0))} help="روز" source="WorkingCapital13!R12" />
          <NumberInput label="دوره ذخیره نقد احتیاطی" value={effectiveDraft.minimumCashDays} onChange={(value) => update("minimumCashDays", Number(value ?? 0))} help="روز" source="WorkingCapital13!R13" />
          <NumberInput label="دوره هزینه‌های تعهدشده" value={effectiveDraft.accruedExpenseDays} onChange={(value) => update("accruedExpenseDays", Number(value ?? 0))} help="روز OPEX" />
          <PercentInput label="سایر بدهی جاری از درآمد" value={effectiveDraft.otherCurrentLiabilitiesPercentOfRevenue} onChange={(value) => update("otherCurrentLiabilitiesPercentOfRevenue", Number(value ?? 0))} />
        </div>
      </SectionCard>

      <SectionCard title="محاسبات سرمایه در گردش">
        <AlignedCardGrid>
          <GlassCard><span>هزینه مواد اولیه روزانه</span><strong>{formatMoney(yearOne.dailyRawMaterialCost, project)}</strong><small>COGS-DirectCost10 / 365</small></GlassCard>
          <GlassCard><span>هزینه تولید روزانه</span><strong>{formatMoney(yearOne.dailyProductionCost, project)}</strong><small>FinancialStatements16!R9 / 365</small></GlassCard>
          <GlassCard><span>فروش روزانه</span><strong>{formatMoney(yearOne.dailySales, project)}</strong><small>FinancialStatements16!R8 / 365</small></GlassCard>
          <GlassCard><span>هزینه عملیاتی</span><strong>{formatMoney(yearOne.dailyOpex, project)}</strong><small>FinancialStatements16!R12 / 365</small></GlassCard>
        </AlignedCardGrid>
      </SectionCard>

      <SectionCard title="اجزای سرمایه در گردش" description="فرمول خالص سرمایه در گردش: جمع دارایی جاری منهای جمع بدهی جاری. علامت بدهی معکوس نشده است.">
        <AlignedCardGrid className="working-capital-components">
          <GlassCard><span>موجودی مواد</span><strong>{formatMoney(yearOne.rawMaterialInventory, project)}</strong></GlassCard>
          <GlassCard><span>موجودی کالا</span><strong>{formatMoney(yearOne.finishedGoodsInventory, project)}</strong></GlassCard>
          <GlassCard><span>حساب‌های دریافتنی</span><strong>{formatMoney(yearOne.receivables, project)}</strong></GlassCard>
          <GlassCard><span>پیش‌پرداخت‌ها</span><strong>{formatMoney(yearOne.prepayments, project)}</strong></GlassCard>
          <GlassCard><span>ذخیره نقدی</span><strong>{formatMoney(yearOne.minimumCash, project)}</strong></GlassCard>
          <GlassCard><span>جمع دارایی جاری</span><strong>{formatMoney(yearOne.currentAssets, project)}</strong></GlassCard>
          <GlassCard><span>حساب‌های پرداختنی</span><strong>{formatMoney(yearOne.payables, project)}</strong></GlassCard>
          <GlassCard><span>هزینه‌های تعهدشده</span><strong>{formatMoney(yearOne.accruedExpenses, project)}</strong></GlassCard>
          <GlassCard><span>سایر بدهی جاری</span><strong>{formatMoney(yearOne.otherCurrentLiabilities, project)}</strong></GlassCard>
          <GlassCard><span>جمع بدهی جاری</span><strong>{formatMoney(yearOne.currentLiabilities, project)}</strong></GlassCard>
          <GlassCard accent={yearOne.workingCapital >= 0 ? "success" : "danger"}><span>سرمایه در گردش خالص</span><strong>{formatMoney(yearOne.workingCapital, project)}</strong></GlassCard>
        </AlignedCardGrid>
      </SectionCard>

      <SectionCard title="سرمایه در گردش اولیه و آزادسازی">
        <div className="phase-form-grid">
          <ToggleInput label="آزادسازی در پایان پروژه" value={effectiveDraft.releaseInFinalYear} onChange={(value) => update("releaseInFinalYear", Boolean(value))} source="WorkingCapital13!R40" />
          <AssumptionInput label="سرمایه در گردش اولیه" value={formatMoney(outputs.workingCapital.initialWorkingCapital, project)} onChange={() => undefined} disabled source="WorkingCapital13!R34" />
          <AssumptionInput label="آزادسازی در پایان پروژه" value={formatMoney(outputs.workingCapital.releaseFinalYear, project)} onChange={() => undefined} disabled />
          <AssumptionInput label="سال آزادسازی" value={formatNumber(project.modelHorizonYears)} onChange={() => undefined} disabled />
        </div>
      </SectionCard>

      <SectionCard title="جدول سرمایه در گردش سالانه">
        <PremiumTableShell className="xl sticky-first">
          <table>
            <thead><tr>{["سال", "موجودی مواد", "موجودی کالا", "حساب‌های دریافتنی", "پیش‌پرداخت‌ها", "ذخیره نقدی", "جمع دارایی جاری", "حساب‌های پرداختنی", "هزینه‌های تعهدشده", "سایر بدهی جاری", "جمع بدهی جاری", "سرمایه در گردش خالص", "تغییر سرمایه در گردش"].map((head) => <th key={head}>{head}</th>)}</tr></thead>
            <tbody>
              {outputs.workingCapital.rows.map((row) => (
                <tr key={row.year} className={effectiveDraft.releaseInFinalYear && row.year === project.modelHorizonYears ? "total-row" : undefined}>
                  <td>{formatNumber(row.year)}</td>
                  <td>{formatMoney(row.rawMaterialInventory, project)}</td>
                  <td>{formatMoney(row.finishedGoodsInventory, project)}</td>
                  <td>{formatMoney(row.receivables, project)}</td>
                  <td>{formatMoney(row.prepayments, project)}</td>
                  <td>{formatMoney(row.minimumCash, project)}</td>
                  <td>{formatMoney(row.currentAssets, project)}</td>
                  <td>{formatMoney(row.payables, project)}</td>
                  <td>{formatMoney(row.accruedExpenses, project)}</td>
                  <td>{formatMoney(row.otherCurrentLiabilities, project)}</td>
                  <td>{formatMoney(row.currentLiabilities, project)}</td>
                  <td>{formatMoney(row.workingCapital, project)}</td>
                  <td>{formatMoney(row.changeInWorkingCapital, project)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </PremiumTableShell>
      </SectionCard>

      <Actions
        onSave={() => applyWorkingCapitalAssumptions(effectiveDraft)}
        onReset={() => setDraft({ ...clone(source), receivableDays: industry.receivablesDays, payableDays: industry.payablesDays })}
        nextHref="../financing"
      />
    </div>
  );
}
