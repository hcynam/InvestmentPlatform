"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  calculateEffectiveDiscountRate,
  calculateFxMappingRates,
  calculateMarketFunnel,
  calculateOperationalIndicators,
  calculatePotentialRevenue,
  inferIndustryCostStructure,
  validateIndustryTemplate,
  validateMacroAssumptions,
  validateMarketDemand,
  validateProjectSetup,
} from "@/lib/phase-one-calculations";
import { calculateOperationStartDate } from "@/lib/phase-two-calculations";
import { formatMoney, formatNumber, formatPercent } from "@/lib/format";
import type {
  BaseCurrency,
  DisplayUnit,
  IndustryTemplate,
  MacroAssumptions,
  MarketDemandAssumptions,
  ProjectSetup,
  ProjectType,
} from "@/lib/types";
import { useProject } from "@/store/project-context";
import {
  AchievableSalesPanel,
  AssumptionInput,
  CostFxExposureTable,
  CurrencyInput,
  EditableAssumptionTable,
  FormulaTraceMini,
  FxMappingTable,
  LockedField,
  MarketFunnelChart,
  MetricStrip,
  NumberInput,
  PercentInput,
  ProductivityIndicatorsTable,
  RiskHeatmap,
  SectionCard,
  SelectInput,
  ToggleInput,
  ValidationPanel,
} from "@/components/phase-one/PhaseOneFields";

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const levels = ["پایین", "متوسط", "بالا", "بسیار بالا"] as const;
const projectTypes: ProjectType[] = ["نرم‌افزاری / پلتفرمی", "صنعتی / تولیدی", "خدماتی", "زیرساختی", "کشاورزی", "بازرگانی", "معدنی", "انرژی", "ساختمانی", "ترکیبی"];
const legalTypes = ["شخص حقیقی", "شرکت سهامی خاص", "شرکت سهامی عام", "شرکت با مسئولیت محدود", "تعاونی", "مؤسسه غیرتجاری", "شرکت دانش‌بنیان", "نهاد عمومی / دولتی", "صندوق / نهاد مالی", "سایر"];
const ownershipTypes = ["خصوصی", "دولتی", "عمومی غیردولتی", "مشارکتی", "خارجی", "مشترک داخلی و خارجی"];
const projectScales = ["کوچک", "متوسط", "بزرگ", "ملی / راهبردی"];
const targetMarkets = ["داخلی", "صادراتی", "داخلی و صادراتی", "B2B", "B2C", "B2G", "ترکیبی"];
const currencies: BaseCurrency[] = ["ریال", "تومان", "هزار تومان", "میلیون تومان", "میلیارد تومان", "دلار", "یورو", "درهم"];
const displayUnits: DisplayUnit[] = ["rial", "million-rial", "billion-rial", "تومان", "هزار تومان", "میلیون تومان", "میلیارد تومان", "دلار", "یورو", "درهم"];
const displayUnitLabels: Record<DisplayUnit, string> = {
  rial: "ریال",
  "million-rial": "میلیون ریال",
  "billion-rial": "میلیارد ریال",
  تومان: "تومان",
  "هزار تومان": "هزار تومان",
  "میلیون تومان": "میلیون تومان",
  "میلیارد تومان": "میلیارد تومان",
  دلار: "دلار",
  یورو: "یورو",
  درهم: "درهم",
};

function InternalTabs({
  tabs,
  active,
  onChange,
}: {
  tabs: Array<{ id: string; label: string; badge?: string }>;
  active: string;
  onChange: (id: string) => void;
}) {
  return (
    <nav className="phase-internal-tabs" aria-label="بخش‌های داخلی صفحه">
      {tabs.map((tab) => <button key={tab.id} type="button" className={active === tab.id ? "active" : ""} onClick={() => onChange(tab.id)}><span>{tab.label}</span>{tab.badge ? <small>{tab.badge}</small> : null}</button>)}
    </nav>
  );
}

function WorkspaceActions({
  onSave,
  onReset,
  nextHref,
  disabled,
}: {
  onSave: () => void;
  onReset: () => void;
  nextHref: string;
  disabled?: boolean;
}) {
  return (
    <div className="phase-actions">
      <button type="button" className="primary-button" onClick={onSave} disabled={disabled}>ذخیره و محاسبه مجدد</button>
      <button type="button" className="secondary-button" onClick={onReset}>بازنشانی تغییرات</button>
      <Link className="text-button" href={nextHref}>بخش بعدی</Link>
    </div>
  );
}

export function ProjectSetupWorkspace() {
  const { project, mode, applyProjectSetup } = useProject();
  const [draft, setDraft] = useState<ProjectSetup>(() => clone(project.setup));
  const operationTimeline = useMemo(() => calculateOperationStartDate(draft), [draft]);
  const normalizedDraft = useMemo(
    () => ({ ...draft, operationStartDate: operationTimeline.values.operationStartDate }),
    [draft, operationTimeline.values.operationStartDate],
  );
  const validation = useMemo(() => {
    const setupValidation = validateProjectSetup(normalizedDraft);
    return {
      ...setupValidation,
      errors: [...setupValidation.errors, ...operationTimeline.errors],
      warnings: [...setupValidation.warnings, ...operationTimeline.warnings],
      trace: [...setupValidation.trace, ...operationTimeline.trace],
    };
  }, [normalizedDraft, operationTimeline]);
  const update = useCallback(<K extends keyof ProjectSetup>(key: K, value: ProjectSetup[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
  }, []);
  const constructionEnd = useMemo(() => {
    const date = new Date(draft.constructionStartDate);
    if (Number.isNaN(date.getTime())) return "-";
    date.setMonth(date.getMonth() + draft.constructionDurationMonths);
    return date.toLocaleDateString("fa-IR");
  }, [draft.constructionDurationMonths, draft.constructionStartDate]);

  return (
    <div className="phase-workspace">
      <div className="setup-summary-grid">
        <section className="identity-card">
          <span>Project identity</span><h3>{draft.projectName || "پروژه بدون نام"}</h3>
          <p>{draft.clientName} · {draft.mainIndustry} / {draft.subIndustry}</p>
          <div><b>{draft.projectCode}</b><small>{draft.projectType}</small><small>{draft.legalPersonality}</small></div>
        </section>
        <section className="timeline-card">
          <span>Timeline</span><h3>{formatNumber(draft.constructionDurationMonths)} ماه ساخت</h3>
          <div className="timeline-line"><i /><b /><i /></div>
          <div><span>شروع<br /><strong>{new Date(draft.constructionStartDate).toLocaleDateString("fa-IR")}</strong></span><span>پایان محاسباتی<br /><strong>{constructionEnd}</strong></span><span>بهره‌برداری<br /><strong>{operationTimeline.values.operationStartDate ? new Date(operationTimeline.values.operationStartDate).toLocaleDateString("fa-IR") : "-"}</strong></span></div>
        </section>
      </div>

      <SectionCard title="هویت پروژه" eyebrow="۱ از ۴" description="اطلاعات مرجع پرونده امکان‌سنجی و مسئولان تهیه مدل">
        <div className="phase-form-grid">
          <AssumptionInput label="نام پروژه" value={draft.projectName} onChange={(value) => update("projectName", String(value ?? ""))} source="ProjectSetup02!U8" />
          <AssumptionInput label="کد پروژه" value={draft.projectCode} onChange={(value) => update("projectCode", String(value ?? ""))} source="ProjectSetup02!U9" />
          <AssumptionInput label="نام کارفرما / شرکت" value={draft.clientName} onChange={(value) => update("clientName", String(value ?? ""))} source="ProjectSetup02!U9" />
          <AssumptionInput label="تهیه‌کننده" value={draft.preparedBy} onChange={(value) => update("preparedBy", String(value ?? ""))} source="ProjectSetup02!U16" />
          {mode === "advanced" ? <>
            <AssumptionInput label="بازبین" value={draft.reviewedBy} onChange={(value) => update("reviewedBy", String(value ?? ""))} source="ProjectSetup02!U56" />
            <AssumptionInput label="تأییدکننده" value={draft.approvedBy} onChange={(value) => update("approvedBy", String(value ?? ""))} source="ProjectSetup02!U57" />
            <AssumptionInput label="تاریخ تهیه مدل" type="date" value={draft.modelPreparedDate} onChange={(value) => update("modelPreparedDate", String(value ?? ""))} source="ProjectSetup02!U17" />
            <AssumptionInput label="نسخه مدل" value={draft.modelVersion} onChange={(value) => update("modelVersion", String(value ?? ""))} source="ProjectSetup02!U18" />
            <AssumptionInput label="وضعیت فایل" value={draft.fileStatus} onChange={(value) => update("fileStatus", String(value ?? ""))} source="ProjectSetup02" />
          </> : null}
        </div>
      </SectionCard>

      <SectionCard title="طبقه‌بندی پروژه" eyebrow="۲ از ۴" description="طبقه‌بندی روی پیشنهاد ساختار هزینه، ریسک و صفحات بعد اثر دارد">
        <div className="phase-form-grid">
          <SelectInput label="نوع پروژه" value={draft.projectType} options={projectTypes} onChange={(value) => update("projectType", value as ProjectType)} source="ProjectSetup02!U12" />
          <AssumptionInput label="صنعت اصلی" value={draft.mainIndustry} onChange={(value) => update("mainIndustry", String(value ?? ""))} source="ProjectSetup02!U10" />
          <AssumptionInput label="زیرصنعت" value={draft.subIndustry} onChange={(value) => update("subIndustry", String(value ?? ""))} source="ProjectSetup02!U11" />
          <AssumptionInput label="نوع فعالیت / مدل کسب‌وکار" value={draft.businessModel} onChange={(value) => update("businessModel", String(value ?? ""))} source="ProjectSetup02!U12" />
          <SelectInput label="مقیاس پروژه" value={draft.projectScale} options={projectScales} onChange={(value) => update("projectScale", String(value))} />
          <SelectInput label="بازار هدف اولیه" value={draft.primaryTargetMarket} options={targetMarkets} onChange={(value) => update("primaryTargetMarket", String(value))} />
          <AssumptionInput label="استان" value={draft.province} onChange={(value) => update("province", String(value ?? ""))} />
          <AssumptionInput label="شهر" value={draft.city} onChange={(value) => update("city", String(value ?? ""))} />
        </div>
      </SectionCard>

      <SectionCard title="مشخصات حقوقی و سازمانی" eyebrow="۳ از ۴">
        <div className="phase-form-grid">
          <SelectInput label="شخصیت حقوقی" value={draft.legalPersonality} options={legalTypes} onChange={(value) => update("legalPersonality", String(value))} source="ProjectSetup02!U15" />
          <SelectInput label="نوع مالکیت" value={draft.ownershipType} options={ownershipTypes} onChange={(value) => update("ownershipType", String(value))} />
          {mode === "advanced" ? <>
            <AssumptionInput label="وضعیت ثبت شرکت" value={draft.registrationStatus} onChange={(value) => update("registrationStatus", String(value ?? ""))} />
            <ToggleInput label="دانش‌بنیان" value={draft.isKnowledgeBased} onChange={(value) => update("isKnowledgeBased", Boolean(value))} />
            <ToggleInput label="منطقه آزاد" value={draft.isFreeZone} onChange={(value) => update("isFreeZone", Boolean(value))} />
            <ToggleInput label="منطقه ویژه اقتصادی" value={draft.isSpecialEconomicZone} onChange={(value) => update("isSpecialEconomicZone", Boolean(value))} />
            <ToggleInput label="شهرک صنعتی" value={draft.isIndustrialTown} onChange={(value) => update("isIndustrialTown", Boolean(value))} />
            <ToggleInput label="منطقه کمترتوسعه‌یافته" value={draft.isLessDevelopedRegion} onChange={(value) => update("isLessDevelopedRegion", Boolean(value))} />
          </> : null}
        </div>
      </SectionCard>

      <SectionCard title="زمان‌بندی و افق مدل" eyebrow="۴ از ۴">
        <div className="phase-form-grid">
          <NumberInput label="سال پایه" value={draft.baseYear} onChange={(value) => update("baseYear", Number(value ?? 0))} source="ProjectSetup02!U25" />
          <AssumptionInput label="تاریخ شروع ساخت / توسعه" type="date" value={draft.constructionStartDate} onChange={(value) => update("constructionStartDate", String(value ?? ""))} source="ProjectSetup02!U27" />
          <NumberInput label="مدت ساخت / توسعه" value={draft.constructionDurationMonths} onChange={(value) => update("constructionDurationMonths", Number(value ?? 0))} help="ماه" source="ProjectSetup02!U29" />
          <AssumptionInput label="تاریخ بهره‌برداری محاسباتی" type="date" value={operationTimeline.values.calculatedDate} onChange={() => undefined} disabled source="ProjectSetup02!U28" help="به‌صورت خودکار از تاریخ شروع ساخت و مدت ساخت محاسبه می‌شود." />
          {mode === "advanced" ? <>
            <ToggleInput label="Override تاریخ بهره‌برداری" value={draft.operationStartDateOverrideEnabled} onChange={(value) => update("operationStartDateOverrideEnabled", Boolean(value))} />
            <AssumptionInput label="تاریخ دستی بهره‌برداری" type="date" value={draft.operationStartDateManual} onChange={(value) => update("operationStartDateManual", String(value ?? ""))} disabled={!draft.operationStartDateOverrideEnabled} source="ProjectSetup02!U28" />
          </> : null}
          <NumberInput label="افق تحلیل" value={draft.analysisHorizonYears} onChange={(value) => update("analysisHorizonYears", Number(value ?? 0))} help="سال" source="ProjectSetup02!U31" />
          <SelectInput label="پایان سال مالی" value={draft.fiscalYearEnd} options={["اسفند", "شهریور", "آذر", "خرداد", "سفارشی"]} onChange={(value) => update("fiscalYearEnd", String(value))} source="ProjectSetup02!U39" />
          <SelectInput label="مبنای محاسبه" value={draft.calculationBasis} options={["اسمی", "واقعی", "اسمی و واقعی"]} onChange={(value) => update("calculationBasis", value as ProjectSetup["calculationBasis"])} source="ProjectSetup02!U38" />
          <SelectInput label="واحد پول مبنا" value={draft.baseCurrency} options={currencies} onChange={(value) => update("baseCurrency", value as BaseCurrency)} source="ProjectSetup02!U35" />
          <SelectInput label="واحد نمایش" value={draft.displayUnit} options={displayUnits} onChange={(value) => update("displayUnit", value as DisplayUnit)} source="ProjectSetup02!U36" />
          <SelectInput label="سناریوی فعال" value={draft.activeScenarioId} options={project.scenarios.map((scenario) => scenario.id)} onChange={(value) => {
            const scenarioId = String(value);
            const selected = project.scenarios.find((scenario) => scenario.id === scenarioId);
            setDraft((current) => ({ ...current, activeScenarioId: scenarioId, scenarioStatus: selected?.name ?? current.scenarioStatus }));
          }} source="ProjectSetup02!U47" help={project.scenarios.map((scenario) => `${scenario.id}: ${scenario.name}`).join(" | ")} />
          <AssumptionInput label="وضعیت سناریو" value={draft.scenarioStatus} onChange={(value) => update("scenarioStatus", String(value ?? ""))} source="ProjectSetup02!U47" />
        </div>
      </SectionCard>

      <ValidationPanel errors={validation.errors} warnings={validation.warnings} />
      {mode === "advanced" ? <FormulaTraceMini traces={validation.trace} /> : null}
      <WorkspaceActions onSave={() => applyProjectSetup(normalizedDraft)} onReset={() => setDraft(clone(project.setup))} nextHref="../macro" disabled={validation.errors.length > 0} />
    </div>
  );
}

const macroTabs = [
  { id: "growth", label: "تورم و رشد" },
  { id: "fx", label: "فرضیات ارزی" },
  { id: "tax", label: "مالیات و بیمه" },
  { id: "discount", label: "تنزیل، ریسک و بازده" },
  { id: "controls", label: "کنترل‌ها", badge: "پیشرفته" },
];

export function MacroWorkspace() {
  const { activeScenario, mode, project, applyMacroAssumptions } = useProject();
  const [draft, setDraft] = useState<MacroAssumptions>(() => clone(activeScenario.assumptions.macro));
  const [tab, setTab] = useState("growth");
  useEffect(() => setDraft(clone(activeScenario.assumptions.macro)), [activeScenario.id, activeScenario.assumptions.macro]);
  useEffect(() => {
    setDraft((current) => ({
      ...current,
      baseYear: project.setup.baseYear,
      analysisHorizon: project.setup.analysisHorizonYears,
      calculationBasis: project.setup.calculationBasis,
      fiscalYearEnd: project.setup.fiscalYearEnd,
      baseCurrency: project.setup.baseCurrency,
      activeScenarioId: activeScenario.id,
    }));
  }, [activeScenario.id, project.setup]);
  useEffect(() => { if (mode === "basic" && tab === "controls") setTab("growth"); }, [mode, tab]);
  const update = useCallback(<K extends keyof MacroAssumptions>(key: K, value: MacroAssumptions[K]) => setDraft((current) => ({ ...current, [key]: value })), []);
  const validation = useMemo(() => validateMacroAssumptions(draft), [draft]);
  const discount = useMemo(() => calculateEffectiveDiscountRate(draft), [draft]);
  const fxMappings = useMemo(() => calculateFxMappingRates(draft), [draft]);
  const growthRows = useMemo(() => [
    ["inflationGeneralAnnual", "تورم عمومی سالانه", "MarcoAssumptions05!V19", "شاخص پایه تورم مدل", "هزینه‌ها و نرخ واقعی"],
    ["salesPriceGrowth", "رشد قیمت فروش", "MarcoAssumptions05!V20", "رشد سالانه نرخ فروش", "Revenue"],
    ["wageGrowth", "رشد دستمزد", "MarcoAssumptions05!V21", "رشد حقوق و دستمزد", "OPEX / COGS"],
    ["energyGrowth", "رشد انرژی", "MarcoAssumptions05!V22", "رشد هزینه حامل‌های انرژی", "Direct Costs"],
    ["rawMaterialGrowth", "رشد مواد اولیه", "MarcoAssumptions05!V23", "رشد مواد مستقیم", "COGS"],
    ["servicesGrowth", "رشد خدمات", "MarcoAssumptions05!V24", "رشد خدمات پشتیبانی", "OPEX"],
    ["rentGrowth", "رشد اجاره", "MarcoAssumptions05!V25", "رشد اجاره و ساختمان", "OPEX"],
    ["assetCostGrowth", "رشد هزینه دارایی", "MarcoAssumptions05!V26", "تعدیل خرید و نگهداری دارایی", "CAPEX / OPEX"],
    ["marketingCostGrowth", "رشد بازاریابی", "MarcoAssumptions05!V27", "رشد بودجه فروش و بازاریابی", "OPEX"],
    ["otherCostGrowth", "رشد سایر هزینه‌ها", "MarcoAssumptions05!V28", "رشد باقیمانده هزینه‌ها", "OPEX"],
  ].map(([key, label, source, description, effect]) => ({
    id: key,
    label,
    value: draft[key as keyof MacroAssumptions] as number,
    onChange: (value: number) => update(key as keyof MacroAssumptions, value as never),
    unit: "درصد",
    source,
    description,
    effect,
  })), [draft, update]);
  const taxPreviewRate = draft.taxExemptionType === "نرخ صفر" ? 0 : draft.taxExemptionType === "نرخ ترجیحی" ? draft.incomeTaxRate * 0.5 : draft.incomeTaxRate;

  return (
    <div className="phase-workspace">
      <section className="setup-context-strip">
        <div><span>سال مبنا</span><strong>{formatNumber(project.setup.baseYear)}</strong></div>
        <div><span>افق تحلیل</span><strong>{formatNumber(project.setup.analysisHorizonYears)} سال</strong></div>
        <div><span>مبنای محاسبه</span><strong>{project.setup.calculationBasis}</strong></div>
        <div><span>واحد پول</span><strong>{project.setup.baseCurrency}</strong></div>
        <div><span>سناریوی فعال</span><strong>{activeScenario.name}</strong></div>
      </section>
      <InternalTabs tabs={macroTabs.filter((item) => mode === "advanced" || item.id !== "controls")} active={tab} onChange={setTab} />
      <MetricStrip metrics={[
        { label: "تورم عمومی", value: formatPercent(draft.inflationGeneralAnnual), note: "Excel V19" },
        { label: "نرخ ارز مبنا", value: `${formatNumber(draft.baseFxRate)} ریال`, note: draft.fxRateSource },
        { label: "تنزیل اعمال‌شونده", value: formatPercent(discount.values.appliedRate), note: draft.calculationBasis },
        { label: "سناریوی فعال", value: activeScenario.name, note: project.currency },
      ]} />

      {tab === "growth" ? <SectionCard title="تورم و رشد" description="نرخ‌ها به‌صورت اعشاری در state ذخیره و به مسیرهای مرتبط موتور منتقل می‌شوند.">
        {mode === "advanced" ? <EditableAssumptionTable rows={growthRows} /> : <>
          <div className="phase-form-grid">
            {growthRows.filter((_, index) => [0, 1, 2, 3, 4, 9].includes(index)).map((row) => <PercentInput key={row.id} label={row.label} value={row.value} onChange={(value) => row.onChange(Number(value ?? 0))} source={row.source} help={row.effect} />)}
          </div>
          <details className="phase-accordion"><summary>جزئیات رشد هزینه‌ها</summary><div className="phase-form-grid">{growthRows.filter((_, index) => [5, 6, 7, 8].includes(index)).map((row) => <PercentInput key={row.id} label={row.label} value={row.value} onChange={(value) => row.onChange(Number(value ?? 0))} source={row.source} help={row.effect} />)}</div></details>
        </>}
      </SectionCard> : null}

      {tab === "fx" ? <>
        <SectionCard title="نرخ‌های ارز و شوک ارزی" action={<span className="system-badge">Multi-tier FX</span>}>
          <div className="phase-form-grid">
            <CurrencyInput label="نرخ ارز رسمی" value={draft.officialFxRate} onChange={(value) => update("officialFxRate", Number(value ?? 0))} source="MarcoAssumptions05!V33" />
            <CurrencyInput label="نرخ ارز آزاد" value={draft.freeMarketFxRate} onChange={(value) => update("freeMarketFxRate", Number(value ?? 0))} source="MarcoAssumptions05!V34" />
            <CurrencyInput label="نرخ ارز حواله‌ای" value={draft.remittanceFxRate} onChange={(value) => update("remittanceFxRate", Number(value ?? 0))} source="MarcoAssumptions05!V35" />
            <SelectInput label="نوع نرخ ارز مبنا" value={draft.baseFxRateType} options={["official", "freeMarket", "remittance", "nima", "negotiated", "persons", "preferential", "contractual", "manual"]} onChange={(value) => update("baseFxRateType", value as MacroAssumptions["baseFxRateType"])} source="MarcoAssumptions05!V36" />
            <CurrencyInput label="نرخ ارز مبنا" value={draft.baseFxRate} onChange={(value) => update("baseFxRate", Number(value ?? 0))} source="MarcoAssumptions05!V36" />
            <NumberInput label="ضریب تبدیل ارز" value={draft.fxConversionFactor} onChange={(value) => update("fxConversionFactor", Number(value ?? 0))} source="MarcoAssumptions05!V37" />
            <PercentInput label="نرخ رشد ارز" value={draft.fxGrowthRate} onChange={(value) => update("fxGrowthRate", Number(value ?? 0))} source="MarcoAssumptions05!V38" />
            <PercentInput label="نوسان ارز" value={draft.fxVolatility} onChange={(value) => update("fxVolatility", Number(value ?? 0))} source="MarcoAssumptions05!V39" />
            <PercentInput label="سقف شوک ارزی" value={draft.maxFxShock} onChange={(value) => update("maxFxShock", Number(value ?? 0))} source="MarcoAssumptions05!V40" />
            <NumberInput label="دوره اعمال شوک" value={draft.fxShockPeriod} onChange={(value) => update("fxShockPeriod", Number(value ?? 0))} help="ماه" source="MarcoAssumptions05!V41" />
            <SelectInput label="منبع نرخ ارز" value={draft.fxRateSource} options={["بانک مرکزی", "مرکز مبادله", "سامانه نیما", "بازار آزاد", "سامانه سنا", "نرخ قراردادی", "ورودی دستی", "سایر"]} onChange={(value) => update("fxRateSource", String(value))} source="MarcoAssumptions05!V42" />
          </div>
          <div className="fx-rate-visual">
            {[["رسمی", draft.officialFxRate], ["حواله‌ای", draft.remittanceFxRate], ["آزاد", draft.freeMarketFxRate], ["مبنا", draft.baseFxRate]].map(([label, value]) => <div key={String(label)}><span>{label}</span><i style={{ height: `${Math.max(8, Number(value) / Math.max(draft.freeMarketFxRate, 1) * 100)}%` }} /><b>{formatNumber(Number(value))}</b></div>)}
          </div>
        </SectionCard>
        {mode === "advanced" ? <SectionCard title="نگاشت نرخ ارز به ماژول‌ها" description="هر جریان ارزی با tier مستقل وارد محاسبات می‌شود."><FxMappingTable rows={draft.fxMappings} macro={draft} onChange={(rows) => update("fxMappings", rows)} /></SectionCard> : null}
      </> : null}

      {tab === "tax" ? <SectionCard title="مالیات، بیمه و مشوق‌ها" action={<span className="system-badge">نرخ مؤثر {formatPercent(taxPreviewRate)}</span>}>
        <div className="phase-form-grid">
          <PercentInput label="نرخ مالیات بر درآمد" value={draft.incomeTaxRate} onChange={(value) => update("incomeTaxRate", Number(value ?? 0))} source="MarcoAssumptions05!V47" />
          <PercentInput label="نرخ بیمه پرسنل" value={draft.personnelInsuranceRate} onChange={(value) => update("personnelInsuranceRate", Number(value ?? 0))} source="MarcoAssumptions05!V48" />
          <PercentInput label="مالیات ارزش افزوده" value={draft.vatRate} onChange={(value) => update("vatRate", Number(value ?? 0))} source="MarcoAssumptions05!V49" />
          <PercentInput label="عوارض / حقوق گمرکی" value={draft.customsDutyRate} onChange={(value) => update("customsDutyRate", Number(value ?? 0))} source="MarcoAssumptions05!V50" />
          <PercentInput label="مالیات صنعت خاص" value={draft.specialIndustryTaxRate} onChange={(value) => update("specialIndustryTaxRate", Number(value ?? 0))} source="MarcoAssumptions05!V51" />
          <SelectInput label="معافیت مالیاتی" value={draft.taxExemptionType} options={["ندارد", "دارد", "نرخ ترجیحی", "نرخ صفر"]} onChange={(value) => update("taxExemptionType", value as MacroAssumptions["taxExemptionType"])} source="MarcoAssumptions05!V52" />
          <NumberInput label="مدت معافیت" value={draft.taxExemptionYears} onChange={(value) => update("taxExemptionYears", Number(value ?? 0))} help="سال" source="MarcoAssumptions05!V53" />
          {mode === "advanced" ? <>
            <PercentInput label="نرخ جرائم مالیاتی" value={draft.taxPenaltyRate} onChange={(value) => update("taxPenaltyRate", Number(value ?? 0))} />
            <PercentInput label="نرخ جرائم بیمه" value={draft.insurancePenaltyRate} onChange={(value) => update("insurancePenaltyRate", Number(value ?? 0))} />
            <AssumptionInput label="منبع مقررات" value={draft.regulationSource} onChange={(value) => update("regulationSource", String(value ?? ""))} />
          </> : null}
        </div>
        <div className="tax-preview"><article><span>سال‌های معاف</span><strong>{formatNumber(draft.taxExemptionYears)}</strong></article><article><span>نرخ اسمی</span><strong>{formatPercent(draft.incomeTaxRate)}</strong></article><article><span>نرخ مؤثر دوره مشوق</span><strong>{formatPercent(taxPreviewRate)}</strong></article></div>
      </SectionCard> : null}

      {tab === "discount" ? <>
        <SectionCard title="نرخ تنزیل، ریسک و بازده" action={<span className="system-badge">پیشنهاد سیستم {formatPercent(discount.values.suggestedRate)}</span>}>
          <div className="phase-form-grid">
            <PercentInput label="نرخ تنزیل پیش‌فرض" value={draft.defaultDiscountRate} onChange={(value) => update("defaultDiscountRate", Number(value ?? 0))} source="MarcoAssumptions05!V61" />
            <PercentInput label="نرخ هزینه سرمایه" value={draft.costOfCapital} onChange={(value) => update("costOfCapital", Number(value ?? 0))} source="MarcoAssumptions05!V62" />
            <PercentInput label="هزینه فرصت سرمایه" value={draft.opportunityCostOfCapital} onChange={(value) => update("opportunityCostOfCapital", Number(value ?? 0))} source="MarcoAssumptions05!V63" />
            <PercentInput label="ضریب ریسک کشور" value={draft.countryRiskPremium} onChange={(value) => update("countryRiskPremium", Number(value ?? 0))} source="MarcoAssumptions05!V64" />
            <PercentInput label="ضریب ریسک صنعت" value={draft.industryRiskPremium} onChange={(value) => update("industryRiskPremium", Number(value ?? 0))} source="MarcoAssumptions05!V65" />
            <PercentInput label="ضریب ریسک پروژه" value={draft.projectRiskPremium} onChange={(value) => update("projectRiskPremium", Number(value ?? 0))} source="MarcoAssumptions05!V66" />
            <PercentInput label="حداقل حاشیه اطمینان" value={draft.minimumSafetyMargin} onChange={(value) => update("minimumSafetyMargin", Number(value ?? 0))} source="MarcoAssumptions05!V67" />
            <PercentInput label="حداقل بازده قابل قبول" value={draft.minimumAcceptableReturn} onChange={(value) => update("minimumAcceptableReturn", Number(value ?? 0))} source="MarcoAssumptions05!V68" />
            <SelectInput label="سطح ریسک مجاز" value={draft.allowedRiskLevel} options={["محافظه‌کارانه", "متعادل", "تهاجمی", "سفارشی"]} onChange={(value) => update("allowedRiskLevel", value as MacroAssumptions["allowedRiskLevel"])} source="MarcoAssumptions05!V69" />
            <AssumptionInput label="یادداشت تحلیلی" type="textarea" value={draft.analyticalNotes} onChange={(value) => update("analyticalNotes", String(value ?? ""))} />
          </div>
        </SectionCard>
        <MetricStrip metrics={[
          { label: "نرخ دستی", value: formatPercent(discount.values.manualRate) },
          { label: "نرخ پیشنهادی", value: formatPercent(discount.values.suggestedRate) },
          { label: "نرخ واقعی", value: formatPercent(discount.values.realRate) },
          { label: "اختلاف دستی و پیشنهادی", value: formatPercent(discount.values.variance) },
        ]} />
      </> : null}

      {tab === "controls" && mode === "advanced" ? <SectionCard title="کنترل‌ها و اثرات محاسباتی" description="نمای زنده مفروضاتی که engine در محاسبه بعدی مصرف می‌کند.">
        <div className="control-cards">
          <article><span>مبنای محاسبه</span><strong>{draft.calculationBasis}</strong><small>DCF از نرخ {formatPercent(discount.values.appliedRate)} استفاده می‌کند</small></article>
          <article><span>واحد پول مبنا</span><strong>{draft.baseCurrency}</strong><small>formatter پروژه پس از ذخیره به‌روزرسانی می‌شود</small></article>
          {fxMappings.values.map((item) => <article key={item.id}><span>{item.label}</span><strong>{formatNumber(item.rate)} ریال</strong><small>{item.fxType}</small></article>)}
        </div>
        <FormulaTraceMini traces={validation.trace} />
      </SectionCard> : null}

      <ValidationPanel errors={validation.errors} warnings={validation.warnings} />
      <WorkspaceActions onSave={() => applyMacroAssumptions(draft)} onReset={() => setDraft(clone(activeScenario.assumptions.macro))} nextHref="../industry-template" disabled={validation.errors.length > 0} />
    </div>
  );
}

const industryTabs = [
  { id: "identity", label: "شناسه صنعت" },
  { id: "operations", label: "شاخص‌های عملیاتی" },
  { id: "costs", label: "ساختار درآمد و هزینه" },
  { id: "risks", label: "ریسک‌ها و موارد خاص" },
];

export function IndustryTemplateWorkspace() {
  const { activeScenario, project, mode, applyIndustryTemplate } = useProject();
  const macro = activeScenario.assumptions.macro;
  const [draft, setDraft] = useState<IndustryTemplate>(() => clone(activeScenario.assumptions.industry));
  const [tab, setTab] = useState("identity");
  useEffect(() => setDraft(clone(activeScenario.assumptions.industry)), [activeScenario.id, activeScenario.assumptions.industry]);
  const update = useCallback(<K extends keyof IndustryTemplate>(key: K, value: IndustryTemplate[K]) => setDraft((current) => ({ ...current, [key]: value })), []);
  const validation = useMemo(() => validateIndustryTemplate(draft), [draft]);
  const operational = useMemo(() => calculateOperationalIndicators(draft), [draft]);
  const suggestion = useMemo(() => inferIndustryCostStructure(project.setup, draft), [draft, project.setup]);

  return (
    <div className="phase-workspace">
      <InternalTabs tabs={industryTabs} active={tab} onChange={setTab} />
      <MetricStrip metrics={[
        { label: "ظرفیت مؤثر مدل‌شده", value: formatNumber(operational.values.modeledEffectiveCapacity), note: draft.cycleTimeUnit },
        { label: "ظرفیت بلااستفاده", value: formatNumber(operational.values.idleCapacity) },
        { label: "شدت عملیاتی", value: `${formatNumber(operational.values.operationalIntensityScore)} از ۱۰۰` },
        { label: "میانگین امتیاز ریسک", value: formatNumber(operational.values.averageRiskScore), note: "احتمال × اثر" },
      ]} />

      {tab === "identity" ? <SectionCard title="شناسه صنعت" description="سه فیلد مرجع از تنظیمات پایه خوانده می‌شوند و در این صفحه قفل هستند.">
        <div className="phase-form-grid">
          <LockedField label="صنعت اصلی" value={project.setup.mainIndustry} source="ProjectSetup02!U10" />
          <LockedField label="زیرصنعت" value={project.setup.subIndustry} source="ProjectSetup02!U11" />
          <LockedField label="نوع پروژه" value={project.setup.projectType} source="ProjectSetup02!U12" />
          <SelectInput label="مقیاس پروژه" value={draft.projectScale} options={projectScales} onChange={(value) => update("projectScale", String(value))} source="IndustryTemplate07!R12" />
          <SelectInput label="بازار هدف" value={draft.targetMarket} options={targetMarkets} onChange={(value) => update("targetMarket", String(value))} source="IndustryTemplate07!R13" />
          <SelectInput label="شدت سرمایه‌بر بودن" value={draft.capitalIntensity} options={levels} onChange={(value) => update("capitalIntensity", String(value))} source="IndustryTemplate07!R14" />
          <SelectInput label="شدت نیروبر بودن" value={draft.laborIntensity} options={levels} onChange={(value) => update("laborIntensity", String(value))} source="IndustryTemplate07!R15" />
        </div>
      </SectionCard> : null}

      {tab === "operations" ? <>
        <SectionCard title="شاخص‌های عملیاتی صنعت" action={<span className="system-badge">Operational intensity {formatNumber(operational.values.operationalIntensityScore)}</span>}>
          <div className="phase-form-grid">
            <SelectInput label="واحد محصول / خدمت" value={draft.productUnit} options={["عدد", "کیلوگرم", "تن", "لیتر", "متر", "مترمربع", "مترمکعب", "مگاوات", "مگاوات‌ساعت", "نفر-ساعت", "اشتراک", "تراکنش", "پروژه", "سفارشی"]} onChange={(value) => update("productUnit", String(value))} source="IndustryTemplate07 / CapacityProduction09!Q6 / COGS-DirectCost10!Q6" />
            {draft.productUnit === "سفارشی" ? <AssumptionInput label="واحد سفارشی" value={draft.customProductUnit} onChange={(value) => update("customProductUnit", String(value ?? ""))} /> : null}
            <NumberInput label="ظرفیت اسمی" value={draft.nominalCapacity} onChange={(value) => update("nominalCapacity", Number(value ?? 0))} source="IndustryTemplate07!R20" />
            <NumberInput label="ظرفیت مؤثر" value={draft.effectiveCapacity} onChange={(value) => update("effectiveCapacity", Number(value ?? 0))} source="IndustryTemplate07!R21" />
            <PercentInput label="ضریب بهره‌برداری" value={draft.utilizationRate} onChange={(value) => update("utilizationRate", Number(value ?? 0))} source="IndustryTemplate07!R22" />
            <PercentInput label="نرخ ضایعات" value={draft.wasteRate} onChange={(value) => update("wasteRate", Number(value ?? 0))} source="IndustryTemplate07!R23" />
            <PercentInput label="نرخ مرجوعی" value={draft.returnRate} onChange={(value) => update("returnRate", Number(value ?? 0))} source="IndustryTemplate07!R24" />
            <NumberInput label="زمان چرخه تولید / خدمت" value={draft.cycleTime} onChange={(value) => update("cycleTime", Number(value ?? 0))} source="IndustryTemplate07!R25" />
            <SelectInput label="واحد زمان چرخه" value={draft.cycleTimeUnit} options={["دقیقه", "ساعت", "روز", "ماه"]} onChange={(value) => update("cycleTimeUnit", String(value))} />
            <NumberInput label="زمان توقف مجاز" value={draft.allowedDowntime} onChange={(value) => update("allowedDowntime", Number(value ?? 0))} source="IndustryTemplate07!R26" />
            <SelectInput label="واحد توقف" value={draft.downtimeUnit} options={["دقیقه", "ساعت", "روز", "درصد"]} onChange={(value) => update("downtimeUnit", String(value))} />
            <PercentInput label="ضریب فصلی بودن" value={draft.seasonalityFactor} onChange={(value) => update("seasonalityFactor", Number(value ?? 0))} source="IndustryTemplate07!R27" />
            <AssumptionInput label="نقطه گلوگاه" value={draft.bottleneckPoint} onChange={(value) => update("bottleneckPoint", String(value ?? ""))} source="IndustryTemplate07!R28" />
            <PercentInput label="نرخ رشد ظرفیت" value={draft.capacityGrowthRate} onChange={(value) => update("capacityGrowthRate", Number(value ?? 0))} source="IndustryTemplate07!R29" />
            <PercentInput label="بهره‌برداری سال اول" value={draft.firstYearUtilization} onChange={(value) => update("firstYearUtilization", Number(value ?? 0))} />
            <PercentInput label="بهره‌برداری پایدار" value={draft.stableUtilization} onChange={(value) => update("stableUtilization", Number(value ?? 0))} />
            <PercentInput label="راندمان" value={draft.efficiency} onChange={(value) => update("efficiency", Number(value ?? 0))} />
          </div>
        </SectionCard>
        {mode === "advanced" ? <SectionCard title="شاخص‌های بهره‌وری کلیدی" description="ردیف‌ها پویا و مستقیماً در IndustryTemplate ذخیره می‌شوند."><ProductivityIndicatorsTable rows={draft.productivityIndicators} onChange={(rows) => update("productivityIndicators", rows)} /></SectionCard> : <SectionCard title="شاخص بهره‌وری اصلی"><MetricStrip metrics={draft.productivityIndicators.slice(0, 3).map((item) => ({ label: item.title, value: `${formatNumber(item.value)} ${item.unit}`, note: item.description }))} /></SectionCard>}
      </> : null}

      {tab === "costs" ? <>
        <SectionCard title="ساختار درآمد و هزینه" action={<button type="button" className="suggestion-button" onClick={() => setDraft((current) => ({ ...current, mainCostType: suggestion.values.suggestedMainCostType, dominantVariableCost: suggestion.values.suggestedDominantVariableCost, dominantFixedCost: suggestion.values.suggestedDominantFixedCost, workingCapitalSensitivity: suggestion.values.suggestedWorkingCapitalSensitivity, systemSuggestedCostStructure: suggestion.values }))}>اعمال پیشنهاد سیستم</button>}>
          <div className="system-suggestion">
            <span>پیشنهاد سیستم · اطمینان {formatPercent(suggestion.values.confidence)}</span>
            <strong>{suggestion.values.suggestedMainCostType} / {suggestion.values.suggestedDominantVariableCost} / {suggestion.values.suggestedDominantFixedCost}</strong>
            <p>{suggestion.values.explanation}</p>
          </div>
          <div className="phase-form-grid">
            <SelectInput label="نوع درآمد اصلی" value={draft.mainRevenueType} options={["فروش محصول", "فروش خدمت", "اشتراک / SaaS", "کارمزد تراکنش", "قرارداد پروژه‌ای", "اجاره / بهره‌برداری", "صادرات", "فروش ترکیبی"]} onChange={(value) => update("mainRevenueType", String(value))} source="IndustryTemplate07!R38" />
            <ToggleInput label="درآمد جانبی" value={draft.sideRevenueEnabled} onChange={(value) => update("sideRevenueEnabled", Boolean(value))} />
            <AssumptionInput label="شرح درآمد جانبی" type="textarea" value={draft.sideRevenueDescription} onChange={(value) => update("sideRevenueDescription", String(value ?? ""))} disabled={!draft.sideRevenueEnabled} />
            <SelectInput label="مدل قیمت‌گذاری" value={draft.pricingModel} options={["قیمت ثابت", "قیمت تورمی", "قیمت دلاری", "قیمت مبتنی بر قرارداد", "قیمت پلکانی", "اشتراکی", "کارمزدی", "ترکیبی"]} onChange={(value) => update("pricingModel", String(value))} />
            <SelectInput label="نوع هزینه اصلی" value={draft.mainCostType} options={["مواد اولیه", "نیروی انسانی", "انرژی", "پیمانکار", "زیرساخت و سرور", "لایسنس و API", "اجاره", "بازاریابی", "مالی و بانکی", "ترکیبی"]} onChange={(value) => update("mainCostType", String(value))} />
            <SelectInput label="هزینه متغیر غالب" value={draft.dominantVariableCost} options={["مواد اولیه", "نیروی انسانی", "انرژی", "پیمانکار", "زیرساخت و سرور", "لایسنس و API", "اجاره", "بازاریابی", "مالی و بانکی", "تعمیر و نگهداری", "ترکیبی"]} onChange={(value) => update("dominantVariableCost", String(value))} />
            <SelectInput label="هزینه ثابت غالب" value={draft.dominantFixedCost} options={["مواد اولیه", "نیروی انسانی", "انرژی", "پیمانکار", "زیرساخت و سرور", "لایسنس و API", "اجاره", "بازاریابی", "مالی و بانکی", "هزینه سرمایه", "ترکیبی"]} onChange={(value) => update("dominantFixedCost", String(value))} />
            <PercentInput label="سهم ارزی درآمد" value={draft.revenueFxShare} onChange={(value) => update("revenueFxShare", Number(value ?? 0))} />
            <NumberInput label="دوره وصول مطالبات" value={draft.receivablesDays} onChange={(value) => update("receivablesDays", Number(value ?? 0))} help="روز" />
            <NumberInput label="دوره پرداخت تأمین‌کنندگان" value={draft.payablesDays} onChange={(value) => update("payablesDays", Number(value ?? 0))} help="روز" />
            <SelectInput label="حساسیت سرمایه در گردش" value={draft.workingCapitalSensitivity} options={levels} onChange={(value) => update("workingCapitalSensitivity", value as IndustryTemplate["workingCapitalSensitivity"])} />
          </div>
        </SectionCard>
        <SectionCard title="Exposure هزینه ارزی" description="سهم ارزی هر گروه و tier نرخ ارز آن جداگانه قابل تنظیم است."><CostFxExposureTable rows={draft.costFxExposureTable} macro={macro} onChange={(rows) => update("costFxExposureTable", rows)} /></SectionCard>
      </> : null}

      {tab === "risks" ? <>
        <SectionCard title="ریسک‌های صنعت" description="امتیاز هر ریسک برابر احتمال ضرب‌در شدت اثر است."><RiskHeatmap risks={draft.risks} editable={mode === "advanced"} onChange={(risks) => update("risks", risks)} /></SectionCard>
        <SectionCard title="موارد خاص و وابستگی‌ها">
          <div className="phase-form-grid">
            <SelectInput label="ریسک تأمین مواد" value={draft.supplyRisk} options={["پایین", "متوسط", "بالا", "بحرانی"]} onChange={(value) => update("supplyRisk", String(value))} />
            <SelectInput label="ریسک ارزی" value={draft.fxRisk} options={["پایین", "متوسط", "بالا", "بحرانی"]} onChange={(value) => update("fxRisk", String(value))} />
            <SelectInput label="ریسک مجوز" value={draft.permitRisk} options={["پایین", "متوسط", "بالا", "بحرانی"]} onChange={(value) => update("permitRisk", String(value))} />
            <SelectInput label="ریسک فروش" value={draft.salesRisk} options={["پایین", "متوسط", "بالا", "بحرانی"]} onChange={(value) => update("salesRisk", String(value))} />
            <SelectInput label="ریسک تأمین مالی" value={draft.financingRisk} options={["پایین", "متوسط", "بالا", "بحرانی"]} onChange={(value) => update("financingRisk", String(value))} />
            <SelectInput label="ریسک اجرایی" value={draft.executionRisk} options={["پایین", "متوسط", "بالا", "بحرانی"]} onChange={(value) => update("executionRisk", String(value))} />
            <ToggleInput label="نیاز به مجوز خاص" value={draft.specialPermitRequired} onChange={(value) => update("specialPermitRequired", Boolean(value))} />
            <AssumptionInput label="شرح مجوزها" value={draft.specialPermits} onChange={(value) => update("specialPermits", String(value ?? ""))} disabled={!draft.specialPermitRequired} />
            <ToggleInput label="استاندارد اجباری" value={draft.mandatoryStandardRequired} onChange={(value) => update("mandatoryStandardRequired", Boolean(value))} />
            <AssumptionInput label="شرح استانداردها" value={draft.mandatoryStandards} onChange={(value) => update("mandatoryStandards", String(value ?? ""))} disabled={!draft.mandatoryStandardRequired} />
            <PercentInput label="وابستگی به واردات" value={draft.importedCostShare} onChange={(value) => update("importedCostShare", Number(value ?? 0))} />
            <PercentInput label="وابستگی به دولت / تعرفه" value={draft.governmentTariffDependence} onChange={(value) => update("governmentTariffDependence", Number(value ?? 0))} />
            <SelectInput label="حساسیت به قیمت" value={draft.priceSensitivity} options={levels} onChange={(value) => update("priceSensitivity", String(value))} />
            <SelectInput label="حساسیت به نرخ ارز" value={draft.fxSensitivity} options={levels} onChange={(value) => update("fxSensitivity", String(value))} />
          </div>
        </SectionCard>
      </> : null}

      <ValidationPanel errors={validation.errors} warnings={validation.warnings} />
      {mode === "advanced" ? <FormulaTraceMini traces={[...validation.trace, ...suggestion.trace]} /> : null}
      <WorkspaceActions onSave={() => applyIndustryTemplate(draft)} onReset={() => setDraft(clone(activeScenario.assumptions.industry))} nextHref="../market-demand" disabled={validation.errors.length > 0} />
    </div>
  );
}

const marketTabs = [
  { id: "identity", label: "شناسه بازار" },
  { id: "size", label: "اندازه و ساختار بازار" },
  { id: "behavior", label: "رفتار تقاضا" },
  { id: "sales", label: "فروش قابل تحقق" },
];

export function MarketDemandWorkspace() {
  const { activeScenario, project, mode, applyMarketDemand } = useProject();
  const [draft, setDraft] = useState<MarketDemandAssumptions>(() => clone(activeScenario.assumptions.market));
  const [tab, setTab] = useState("identity");
  useEffect(() => setDraft(clone(activeScenario.assumptions.market)), [activeScenario.id, activeScenario.assumptions.market]);
  const update = useCallback(<K extends keyof MarketDemandAssumptions>(key: K, value: MarketDemandAssumptions[K]) => setDraft((current) => ({ ...current, [key]: value })), []);
  const validation = useMemo(() => validateMarketDemand(draft, { supplyLimit: draft.supplyConstraintValue }), [draft]);
  const funnel = useMemo(() => calculateMarketFunnel(draft), [draft]);
  const revenue = useMemo(() => calculatePotentialRevenue(draft, { supplyLimit: draft.supplyConstraintValue }), [draft]);
  const demandScore = useMemo(() => {
    const map = { پایین: 90, متوسط: 70, بالا: 45, "بسیار بالا": 25 };
    const behavior = draft.demandBehavior;
    return (map[behavior.priceSensitivity] + map[behavior.qualitySensitivity] + map[behavior.deliverySensitivity] + behavior.retentionRate * 100 + behavior.conversionRate * 100) / 5;
  }, [draft.demandBehavior]);
  const updateBehavior = useCallback(<K extends keyof MarketDemandAssumptions["demandBehavior"]>(key: K, value: MarketDemandAssumptions["demandBehavior"][K]) => {
    setDraft((current) => ({ ...current, demandBehavior: { ...current.demandBehavior, [key]: value } }));
  }, []);
  const salesRows = useMemo(() => Array.from({ length: mode === "advanced" ? 5 : 3 }, (_, index) => {
    const year = index + 1;
    const manual = year === 1 ? draft.potentialSalesYear1 : year === 2 ? draft.potentialSalesYear2 : year === 3 ? draft.potentialSalesYear3 : null;
    const potential = manual ?? draft.potentialSalesYear1 * (1 + draft.salesGrowthRate) ** index;
    const achievable = Math.min(potential * draft.marketAchievementFactor, draft.salesCeiling, draft.marketAbsorptionCapacity, draft.hasSupplyConstraint ? draft.supplyConstraintValue : Number.POSITIVE_INFINITY);
    const price = draft.unitSalesPrice * (1 + draft.priceGrowthRate) ** index;
    return { year, potential, achievable, price, revenue: achievable * price };
  }), [draft, mode]);

  return (
    <div className="phase-workspace">
      <InternalTabs tabs={marketTabs} active={tab} onChange={setTab} />
      <MetricStrip metrics={[
        { label: "TAM", value: formatNumber(funnel.values.tam), note: draft.marketAnalysisUnit },
        { label: "SAM", value: formatNumber(funnel.values.sam), note: formatPercent(funnel.values.sam / Math.max(1, funnel.values.tam)) },
        { label: "SOM", value: formatNumber(funnel.values.som), note: formatPercent(funnel.values.targetShare) },
        { label: "درآمد بالقوه", value: formatMoney(revenue.values.potentialRevenue, project), note: "سال اول" },
      ]} />

      {tab === "identity" ? <SectionCard title="شناسه بازار" description="تعریف دقیق بازار، مشتری و کانال فروش مبنای TAM/SAM/SOM است.">
        <div className="phase-form-grid">
          <AssumptionInput label="بازار اصلی" value={draft.mainMarket} onChange={(value) => update("mainMarket", String(value ?? ""))} source="MarketDemand08!Q8" />
          <AssumptionInput label="بخش بازار" value={draft.marketSegment} onChange={(value) => update("marketSegment", String(value ?? ""))} source="MarketDemand08!Q9" />
          <SelectInput label="مشتری هدف" value={draft.targetCustomer} options={["مصرف‌کننده نهایی", "شرکت‌ها", "دولت", "بانک‌ها و مؤسسات مالی", "تولیدکنندگان", "توزیع‌کنندگان", "توسعه‌دهندگان", "سرمایه‌گذاران", "شرکت توانیر", "سایر"]} onChange={(value) => update("targetCustomer", String(value))} source="MarketDemand08!Q10" />
          <SelectInput label="منطقه هدف" value={draft.targetRegion} options={["محلی", "استانی", "ملی", "منطقه‌ای", "صادراتی", "بین‌المللی"]} onChange={(value) => update("targetRegion", String(value))} source="MarketDemand08!Q11" />
          <SelectInput label="کانال فروش" value={draft.salesChannel} options={["فروش مستقیم", "نمایندگی", "آنلاین", "B2B", "B2G", "مارکت‌پلیس", "قرارداد بلندمدت", "قرارداد خرید تضمینی", "صادرات", "ترکیبی"]} onChange={(value) => update("salesChannel", String(value))} source="MarketDemand08!Q12" />
          <SelectInput label="واحد تحلیل بازار" value={draft.marketAnalysisUnit} options={["تعداد مشتری", "تعداد واحد محصول", "ظرفیت تولید", "تعداد قرارداد", "تراکنش", "اشتراک", "تن", "مترمربع", "مگاوات", "مگاوات ساعت", "نفر-ساعت", "سایر"]} onChange={(value) => update("marketAnalysisUnit", String(value))} source="MarketDemand08!Q13" />
        </div>
      </SectionCard> : null}

      {tab === "size" ? <div className="market-size-layout">
        <SectionCard title="اندازه و ساختار بازار">
          <div className="phase-form-grid">
            <NumberInput label="اندازه کل بازار (TAM)" value={draft.totalMarketSize} onChange={(value) => update("totalMarketSize", Number(value ?? 0))} source="MarketDemand08!Q18" />
            <NumberInput label="بازار قابل دسترس (SAM)" value={draft.serviceableAvailableMarket} onChange={(value) => update("serviceableAvailableMarket", Number(value ?? 0))} source="MarketDemand08!Q19" />
            <NumberInput label="بازار هدف (SOM)" value={draft.targetMarketSize} onChange={(value) => update("targetMarketSize", Number(value ?? 0))} source="MarketDemand08!Q20" />
            <PercentInput label="سهم هدف" value={draft.targetShare} onChange={(value) => update("targetShare", Number(value ?? 0))} source="MarketDemand08!Q21" />
            <PercentInput label="نرخ رشد بازار" value={draft.marketGrowthRate} onChange={(value) => update("marketGrowthRate", Number(value ?? 0))} source="MarketDemand08!Q22" />
            <PercentInput label="نرخ نفوذ اولیه" value={draft.initialPenetrationRate} onChange={(value) => update("initialPenetrationRate", Number(value ?? 0))} source="MarketDemand08!Q23" />
            <PercentInput label="سقف نفوذ" value={draft.maxPenetrationRate} onChange={(value) => update("maxPenetrationRate", Number(value ?? 0))} source="MarketDemand08!Q24" />
            <NumberInput label="ظرفیت جذب بازار" value={draft.marketAbsorptionCapacity} onChange={(value) => update("marketAbsorptionCapacity", Number(value ?? 0))} source="MarketDemand08!Q25" />
            <ToggleInput label="محدودیت عرضه" value={draft.hasSupplyConstraint} onChange={(value) => update("hasSupplyConstraint", Boolean(value))} />
            {draft.hasSupplyConstraint ? <NumberInput label="سقف عرضه / ظرفیت" value={draft.supplyConstraintValue} onChange={(value) => update("supplyConstraintValue", Number(value ?? 0))} source="CapacityProduction09!Q46" /> : null}
          </div>
        </SectionCard>
        <SectionCard title="Market Funnel" description="مقیاس بصری برای خوانایی لگاریتمی تعدیل شده است."><MarketFunnelChart market={draft} /><div className={`market-validation ${funnel.errors.length ? "invalid" : "valid"}`}><strong>{funnel.errors.length ? "ساختار بازار ناسازگار است" : "TAM / SAM / SOM معتبر است"}</strong><p>سهم محاسباتی بازار هدف: {formatPercent(funnel.values.targetShare)}</p></div></SectionCard>
      </div> : null}

      {tab === "behavior" ? <>
        <SectionCard title="رفتار تقاضا" action={<span className="system-badge">امتیاز رفتار تقاضا {formatNumber(demandScore)}</span>}>
          <div className="phase-form-grid">
            <SelectInput label="حساسیت به قیمت" value={draft.demandBehavior.priceSensitivity} options={levels} onChange={(value) => updateBehavior("priceSensitivity", value as typeof draft.demandBehavior.priceSensitivity)} source="MarketDemand08!Q31" />
            <SelectInput label="حساسیت به کیفیت" value={draft.demandBehavior.qualitySensitivity} options={levels} onChange={(value) => updateBehavior("qualitySensitivity", value as typeof draft.demandBehavior.qualitySensitivity)} />
            <SelectInput label="حساسیت به تحویل" value={draft.demandBehavior.deliverySensitivity} options={levels} onChange={(value) => updateBehavior("deliverySensitivity", value as typeof draft.demandBehavior.deliverySensitivity)} />
            <SelectInput label="حساسیت به برند" value={draft.demandBehavior.brandSensitivity} options={levels} onChange={(value) => updateBehavior("brandSensitivity", value as typeof draft.demandBehavior.brandSensitivity)} />
            <SelectInput label="حساسیت به مجوز" value={draft.demandBehavior.permitSensitivity} options={levels} onChange={(value) => updateBehavior("permitSensitivity", value as typeof draft.demandBehavior.permitSensitivity)} />
            <ToggleInput label="فصلی بودن" value={draft.demandBehavior.seasonalityEnabled} onChange={(value) => updateBehavior("seasonalityEnabled", Boolean(value))} />
            <NumberInput label="ضریب فصلی" value={draft.demandBehavior.seasonalityFactor} onChange={(value) => updateBehavior("seasonalityFactor", Number(value ?? 0))} disabled={!draft.demandBehavior.seasonalityEnabled} />
            <AssumptionInput label="شرح فصلی بودن" value={draft.demandBehavior.seasonalityDescription} onChange={(value) => updateBehavior("seasonalityDescription", String(value ?? ""))} disabled={!draft.demandBehavior.seasonalityEnabled} />
            <SelectInput label="الگوی خرید" value={draft.demandBehavior.purchasePattern} options={["یکباره", "تکرارشونده", "اشتراکی", "قراردادی", "فصلی", "پروژه‌ای", "مصرف مستمر", "ترکیبی"]} onChange={(value) => updateBehavior("purchasePattern", String(value))} />
            <PercentInput label="نرخ رشد مشتری" value={draft.demandBehavior.customerGrowthRate} onChange={(value) => updateBehavior("customerGrowthRate", Number(value ?? 0))} />
            <PercentInput label="نرخ حفظ مشتری" value={draft.demandBehavior.retentionRate} onChange={(value) => updateBehavior("retentionRate", Number(value ?? 0))} source="MarketDemand08!Q39" />
            <PercentInput label="نرخ تبدیل به فروش" value={draft.demandBehavior.conversionRate} onChange={(value) => updateBehavior("conversionRate", Number(value ?? 0))} source="MarketDemand08!Q40" />
          </div>
        </SectionCard>
        {mode === "advanced" ? <div className="behavior-impact-grid">{[
          ["حساسیت قیمت", "اثر مستقیم بر نرخ تبدیل و سناریوی افت تقاضا"],
          ["حساسیت کیفیت", "اثر بر retention، مرجوعی و هزینه خدمات"],
          ["حساسیت تحویل", "اثر بر backlog، جریمه و زمان شناسایی درآمد"],
          ["فصلی بودن", "اثر بر توزیع ماهانه فروش و سرمایه در گردش"],
        ].map(([title, text]) => <article key={title}><strong>{title}</strong><p>{text}</p></article>)}</div> : null}
      </> : null}

      {tab === "sales" ? <>
        <SectionCard title="فروش قابل تحقق" description="مقدار محاسباتی از محدودیت بازار، عرضه و سقف فروش عبور نمی‌کند.">
          <div className="phase-form-grid">
            <NumberInput label="فروش بالقوه سال اول" value={draft.potentialSalesYear1} onChange={(value) => update("potentialSalesYear1", Number(value ?? 0))} source="MarketDemand08!Q45" />
            <NumberInput label="فروش سال دوم" value={draft.potentialSalesYear2} onChange={(value) => update("potentialSalesYear2", value === null ? null : Number(value))} source="MarketDemand08!Q46" help="خالی = محاسبه با نرخ رشد" />
            <NumberInput label="فروش سال سوم" value={draft.potentialSalesYear3} onChange={(value) => update("potentialSalesYear3", value === null ? null : Number(value))} source="MarketDemand08!Q47" help="خالی = محاسبه با نرخ رشد" />
            <PercentInput label="نرخ رشد فروش" value={draft.salesGrowthRate} onChange={(value) => update("salesGrowthRate", Number(value ?? 0))} source="MarketDemand08!Q48" />
            <PercentInput label="ضریب دستیابی به بازار" value={draft.marketAchievementFactor} onChange={(value) => update("marketAchievementFactor", Number(value ?? 0))} source="MarketDemand08!Q49" />
            <NumberInput label="سقف فروش" value={draft.salesCeiling} onChange={(value) => update("salesCeiling", Number(value ?? 0))} source="MarketDemand08!Q50" />
            <CurrencyInput label="نرخ فروش هر واحد" value={draft.unitSalesPrice} onChange={(value) => update("unitSalesPrice", Number(value ?? 0))} source="MarketDemand08!Q52" />
            <PercentInput label="رشد نرخ فروش" value={draft.priceGrowthRate} onChange={(value) => update("priceGrowthRate", Number(value ?? 0))} />
          </div>
          <AchievableSalesPanel market={draft} onOverride={(enabled, value) => setDraft((current) => ({ ...current, achievableSalesOverrideEnabled: enabled, achievableSalesOverride: value }))} />
        </SectionCard>
        <SectionCard title={mode === "advanced" ? "پیش‌بینی پنج‌ساله فروش" : "نمای سه‌ساله فروش"}>
          <div className="table-wrap phase-table"><table><thead><tr><th>سال</th><th>فروش بالقوه</th><th>ضریب دستیابی</th><th>محدودیت بازار</th>{mode === "advanced" ? <th>محدودیت عرضه</th> : null}<th>فروش قابل تحقق</th><th>قیمت واحد</th><th>درآمد بالقوه</th></tr></thead><tbody>{salesRows.map((row) => <tr key={row.year}><td>{formatNumber(row.year)}</td><td>{formatNumber(row.potential)}</td><td>{formatPercent(draft.marketAchievementFactor)}</td><td>{formatNumber(draft.marketAbsorptionCapacity)}</td>{mode === "advanced" ? <td>{draft.hasSupplyConstraint ? formatNumber(draft.supplyConstraintValue) : "نامحدود"}</td> : null}<td><strong>{formatNumber(row.achievable)}</strong></td><td>{formatMoney(row.price, project)}</td><td>{formatMoney(row.revenue, project)}</td></tr>)}</tbody></table></div>
        </SectionCard>
      </> : null}

      <ValidationPanel errors={validation.errors} warnings={validation.warnings} />
      {mode === "advanced" ? <FormulaTraceMini traces={validation.trace} /> : null}
      <WorkspaceActions onSave={() => applyMarketDemand(draft)} onReset={() => setDraft(clone(activeScenario.assumptions.market))} nextHref="../capacity-production" disabled={validation.errors.length > 0} />
    </div>
  );
}

export const formatDisplayUnit = (unit: DisplayUnit) => displayUnitLabels[unit];
