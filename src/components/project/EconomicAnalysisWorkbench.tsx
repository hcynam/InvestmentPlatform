"use client";

import { type CSSProperties, useEffect, useState } from "react";
import {
  NumberInput,
  PercentInput,
  SectionCard,
  SelectInput,
} from "@/components/phase-one/PhaseOneFields";
import {
  economicClassificationLabel,
  normalizeEconomicAssumptions,
} from "@/lib/economic-analysis-engine";
import { classNames, formatMoney, formatNumber, formatPercent, unitLabel } from "@/lib/format";
import type {
  EconomicAnalysisYear,
  EconomicAssumptions,
  EconomicDiagnostic,
  EconomicExternality,
  EconomicFinancialReconciliation,
  EconomicItemClassification,
  EconomicMappingSummary,
  Project,
} from "@/lib/types";
import { useProject } from "@/store/project-context";

const classifications = Object.keys(economicClassificationLabel) as EconomicItemClassification[];

const diagnosticLabel: Record<EconomicDiagnostic["severity"], string> = {
  error: "خطا",
  warning: "هشدار",
  info: "کنترل",
};

const externalityDirectionLabel = {
  benefit: "منفعت",
  cost: "هزینه",
} as const;

const doubleCountLabels: Record<NonNullable<EconomicExternality["doubleCountCategory"]>, string> = {
  none: "بدون هم‌پوشانی",
  employment: "اشتغال",
  "foreign-exchange": "صرفه‌جویی ارزی",
  "output-shadow-price": "شکاف قیمت محصول",
};

const selectKeyYearRows = <T extends { year: number }>(rows: T[], horizon: number) => {
  const years = [0, 1, 2, 5, 10, horizon].filter((year, index, list) =>
    year <= horizon && list.indexOf(year) === index);
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
  unit: "money" | "percent" | "ratio" | "year";
  note: string;
  tone: "success" | "warning" | "danger";
  project: Project;
}) {
  const displayed = value === null
    ? "ناموجود"
    : unit === "money"
      ? formatMoney(value, project)
      : unit === "percent"
        ? formatPercent(value)
        : unit === "year"
          ? `${formatNumber(value)} سال`
          : `${formatNumber(value)}x`;
  return (
    <article className={classNames("financial-kpi-card", tone)}>
      <span>{label}</span>
      <strong>{displayed}</strong>
      <small>{note}</small>
    </article>
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
  const sampled = rows.slice(0, 13);
  const values = sampled.map(value);
  const max = Math.max(1, ...values.map((item) => Math.abs(item)));
  return (
    <article className="rf-chart-card">
      <header><div><span>{subtitle}</span><strong>{title}</strong></div></header>
      <div className="rf-bar-chart" role="img" aria-label={title}>
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

function Diagnostics({ diagnostics }: { diagnostics: EconomicDiagnostic[] }) {
  if (!diagnostics.length) return null;
  return (
    <section className="panel rf-check-panel">
      <div className="panel-heading">
        <div><span>کنترل روش‌شناسی و داده</span><strong>اعتبار تحلیل اقتصادی</strong></div>
        <small>{formatNumber(diagnostics.length, { maximumFractionDigits: 0 })} کنترل</small>
      </div>
      <div className="rf-check-grid">
        {diagnostics.map((item) => (
          <article className={item.severity === "error" ? "fail" : item.severity} key={item.id}>
            <div><b>{diagnosticLabel[item.severity]}</b><span>{item.label}</span></div>
            <strong>{item.message}</strong>
            <small>{item.evidence}</small>
          </article>
        ))}
      </div>
    </section>
  );
}

function AssumptionsEditor({
  draft,
  onChange,
  onSave,
}: {
  draft: EconomicAssumptions;
  onChange: (next: EconomicAssumptions) => void;
  onSave: () => void;
}) {
  const set = <K extends keyof EconomicAssumptions>(key: K, value: EconomicAssumptions[K]) =>
    onChange({ ...draft, [key]: value });
  return (
    <SectionCard
      eyebrow="مفروضات اختصاصی اقتصادی"
      title="EOCK و ضرایب تبدیل"
      description="ورودی‌های مالی، سناریو، افق، ارز و واحد نمایش از تب‌های بالادست خوانده می‌شوند و اینجا تکرار نمی‌شوند."
      action={<button type="button" className="primary-button" onClick={onSave}>ذخیره و محاسبه</button>}
    >
      <div className="phase-form-grid">
        <label className="phase-input">
          <span className="phase-input-label"><b>مبنای قیمت اقتصادی</b></span>
          <select value={draft.priceBasis} onChange={(event) => set("priceBasis", event.target.value as EconomicAssumptions["priceBasis"])}>
            <option value="real">واقعی / قیمت ثابت</option>
            <option value="nominal">اسمی / قیمت جاری</option>
          </select>
          <em>باید با مبنای جریان‌های سناریوی فعال سازگار باشد.</em>
        </label>
        <PercentInput label="نرخ فرصت اقتصادی سرمایه (EOCK)" value={draft.economicDiscountRate} onChange={(value) => set("economicDiscountRate", Number(value ?? 0))} />
        <NumberInput label="ضریب تبدیل استاندارد (SCF)" value={draft.standardConversionFactor} min={0} max={5} onChange={(value) => set("standardConversionFactor", Number(value ?? 0))} />
        <NumberInput label="ضریب نرخ ارز سایه‌ای (SERF)" value={draft.shadowExchangeRateFactor} min={0} max={5} onChange={(value) => set("shadowExchangeRateFactor", Number(value ?? 0))} />
        <NumberInput label="ضریب دستمزد ماهر" value={draft.skilledLaborShadowFactor} min={0} max={5} onChange={(value) => set("skilledLaborShadowFactor", Number(value ?? 0))} />
        <NumberInput label="ضریب دستمزد غیرماهر (SWRF)" value={draft.unskilledLaborShadowFactor} min={0} max={5} onChange={(value) => set("unskilledLaborShadowFactor", Number(value ?? 0))} />
        <NumberInput label="ضریب اقتصادی انرژی" value={draft.energyShadowFactor} min={0} max={5} onChange={(value) => set("energyShadowFactor", Number(value ?? 0))} />
        <NumberInput label="ضریب اقتصادی آب" value={draft.waterShadowFactor} min={0} max={5} onChange={(value) => set("waterShadowFactor", Number(value ?? 0))} />
        <NumberInput label="ضریب هزینه فرصت زمین" value={draft.landOpportunityCostFactor} min={0} max={5} onChange={(value) => set("landOpportunityCostFactor", Number(value ?? 0))} />
        <SelectInput
          label="طبقه اقتصادی محصول"
          value={draft.outputClassification}
          options={classifications}
          onChange={(value) => set("outputClassification", value as EconomicItemClassification)}
          help={economicClassificationLabel[draft.outputClassification]}
        />
        <NumberInput label="ضریب قیمت مرزی محصول" value={draft.outputBorderPriceFactor} min={0} max={5} onChange={(value) => set("outputBorderPriceFactor", Number(value ?? 0))} />
      </div>
    </SectionCard>
  );
}

function MappingTable({
  rows,
  draft,
  onChange,
  onSave,
  project,
}: {
  rows: EconomicMappingSummary[];
  draft: EconomicAssumptions;
  onChange: (next: EconomicAssumptions) => void;
  onSave: () => void;
  project: Project;
}) {
  const update = (row: EconomicMappingSummary, patch: { classification?: EconomicItemClassification; factor?: number | undefined }) => {
    const existing = draft.itemMappings.find((item) => item.sourceId === row.sourceId);
    const nextMapping = {
      sourceId: row.sourceId,
      classification: patch.classification ?? existing?.classification ?? row.classification,
      itemSpecificFactor: patch.factor === undefined ? existing?.itemSpecificFactor : patch.factor,
      note: existing?.note,
    };
    onChange({
      ...draft,
      itemMappings: [...draft.itemMappings.filter((item) => item.sourceId !== row.sourceId), nextMapping],
    });
  };
  return (
    <SectionCard
      eyebrow="طبقه‌بندی و تبدیل در سطح دسته"
      title="نگاشت مالی به اقتصادی"
      description="هر ردیف دقیقاً یک طبقه و یک قاعده تبدیل دارد؛ ضریب اختصاصی در صورت ورود، جایگزین ضریب طبقه می‌شود."
      action={<button type="button" className="primary-button" onClick={onSave}>اعمال نگاشت</button>}
    >
      <div className="table-wrap phase-table">
        <table>
          <thead><tr><th>قلم / منبع</th><th>نوع</th><th>طبقه اقتصادی</th><th>ضریب اختصاصی</th><th>ارزش مالی</th><th>ارزش اقتصادی</th></tr></thead>
          <tbody>
            {rows.filter((row) => !row.sourceId.startsWith("externality:")).map((row) => {
              const mapping = draft.itemMappings.find((item) => item.sourceId === row.sourceId);
              return (
                <tr key={row.sourceId}>
                  <td><strong>{row.label}</strong><small>{row.sourceModule}</small></td>
                  <td>{row.kind === "benefit" ? "منفعت" : "هزینه"}</td>
                  <td>
                    <select value={mapping?.classification ?? row.classification} onChange={(event) => update(row, { classification: event.target.value as EconomicItemClassification })}>
                      {classifications.map((classification) => <option key={classification} value={classification}>{economicClassificationLabel[classification]}</option>)}
                    </select>
                  </td>
                  <td><input type="number" min="0" max="5" step="0.01" value={mapping?.itemSpecificFactor ?? ""} placeholder={formatNumber(row.appliedFactor)} onChange={(event) => update(row, { factor: event.target.value === "" ? undefined : Number(event.target.value) })} /></td>
                  <td>{formatMoney(row.financialValue, project)}</td>
                  <td>{formatMoney(row.economicValue, project)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}

function ExternalityRegister({
  draft,
  onChange,
  onSave,
}: {
  draft: EconomicAssumptions;
  onChange: (next: EconomicAssumptions) => void;
  onSave: () => void;
}) {
  const update = (index: number, patch: Partial<EconomicExternality>) => {
    const externalities = [...draft.externalities];
    externalities[index] = { ...externalities[index], ...patch };
    onChange({ ...draft, externalities });
  };
  const add = () => onChange({
    ...draft,
    externalities: [...draft.externalities, {
      id: `externality-${Date.now()}`,
      title: "",
      direction: "benefit",
      physicalUnit: "",
      annualQuantity: 0,
      economicUnitValue: 0,
      startYear: 1,
      endYear: 1,
      source: "",
      explanation: "",
      doubleCountCategory: "none",
      active: true,
    }],
  });
  return (
    <SectionCard
      eyebrow="quantity × shadow unit value"
      title="ثبت منافع و هزینه‌های خارجی"
      description="ردیف ناقص یا مشکوک به دوباره‌شماری در ENPV وارد نمی‌شود."
      action={<div className="button-row"><button type="button" className="secondary-button" onClick={add}>افزودن اثر</button><button type="button" className="primary-button" onClick={onSave}>ذخیره آثار</button></div>}
    >
      {draft.externalities.length ? (
        <div className="table-wrap phase-table">
          <table>
            <thead><tr><th>عنوان</th><th>جهت</th><th>مقدار سالانه</th><th>واحد فیزیکی</th><th>ارزش اقتصادی واحد</th><th>از سال</th><th>تا سال</th><th>کنترل هم‌پوشانی</th><th>منبع و توضیح</th><th /></tr></thead>
            <tbody>
              {draft.externalities.map((item, index) => (
                <tr key={item.id}>
                  <td><input value={item.title} onChange={(event) => update(index, { title: event.target.value })} /></td>
                  <td><select value={item.direction} onChange={(event) => update(index, { direction: event.target.value as EconomicExternality["direction"] })}>{Object.entries(externalityDirectionLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></td>
                  <td><input type="number" min="0" value={item.annualQuantity} onChange={(event) => update(index, { annualQuantity: Number(event.target.value) })} /></td>
                  <td><input value={item.physicalUnit} onChange={(event) => update(index, { physicalUnit: event.target.value })} /></td>
                  <td><input type="number" min="0" value={item.economicUnitValue} onChange={(event) => update(index, { economicUnitValue: Number(event.target.value) })} /></td>
                  <td><input type="number" min="0" step="1" value={item.startYear} onChange={(event) => update(index, { startYear: Number(event.target.value) })} /></td>
                  <td><input type="number" min="0" step="1" value={item.endYear} onChange={(event) => update(index, { endYear: Number(event.target.value) })} /></td>
                  <td><select value={item.doubleCountCategory ?? "none"} onChange={(event) => update(index, { doubleCountCategory: event.target.value as EconomicExternality["doubleCountCategory"] })}>{Object.entries(doubleCountLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></td>
                  <td><input placeholder="منبع" value={item.source} onChange={(event) => update(index, { source: event.target.value })} /><input placeholder="روش ارزش‌گذاری و انتساب" value={item.explanation} onChange={(event) => update(index, { explanation: event.target.value })} /></td>
                  <td><button type="button" className="table-remove" onClick={() => onChange({ ...draft, externalities: draft.externalities.filter((row) => row.id !== item.id) })}>حذف</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p>اثر خارجی ثبت نشده است؛ هیچ مبلغ نمونه یا فرضی به ENPV اضافه نمی‌شود.</p>}
    </SectionCard>
  );
}

function AnnualTable({ rows, project, advanced }: { rows: EconomicAnalysisYear[]; project: Project; advanced: boolean }) {
  const visible = advanced ? rows : selectKeyYearRows(rows, rows.at(-1)?.year ?? 0);
  return (
    <section className="panel wide-panel financial-client-year-panel">
      <div className="panel-heading">
        <div><span>سری کامل دوره‌ای</span><strong>جریان نقد اقتصادی سالانه</strong></div>
        <small>واحد پولی: {unitLabel(project)} · دوره صفر و سال‌های ساخت محفوظ است</small>
      </div>
      <div className="table-wrap xl financial-table-wrap">
        <table className="financial-client-table">
          <thead><tr><th>سال</th><th>منافع اقتصادی</th><th>هزینه اقتصادی</th><th>ENCF</th><th>ضریب تنزیل</th><th>ENCF تنزیلی</th><th>تجمعی ENCF</th><th>تجمعی تنزیلی</th><th>اثر خالص ارزی</th></tr></thead>
          <tbody>
            {visible.map((row) => (
              <tr key={row.year}>
                <th>{formatNumber(row.year, { maximumFractionDigits: 0 })} ({formatNumber(row.calendarYear, { maximumFractionDigits: 0 })})</th>
                <td>{formatMoney(row.economicBenefits, project)}</td>
                <td>{formatMoney(row.economicCosts, project)}</td>
                <td>{formatMoney(row.netEconomicBenefit, project)}</td>
                <td>{formatNumber(row.socialDiscountFactor)}</td>
                <td>{formatMoney(row.discountedNetEconomicBenefit, project)}</td>
                <td>{formatMoney(row.cumulativeNetEconomicBenefit, project)}</td>
                <td>{formatMoney(row.cumulativeDiscountedNetEconomicBenefit, project)}</td>
                <td>{formatMoney(row.netForeignExchangeEffect, project)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function BridgeTable({ rows, project }: { rows: EconomicFinancialReconciliation[]; project: Project }) {
  return (
    <section className="panel wide-panel financial-statement-panel">
      <div className="panel-heading">
        <div><span>تطبیق متصل به موتور</span><strong>پل مالی به اقتصادی سالانه</strong></div>
        <small>ارزش مالی + تعدیلات = ارزش اقتصادی</small>
      </div>
      <div className="table-wrap xl financial-table-wrap">
        <table className="financial-statement-table">
          <thead><tr><th>سال</th><th>قلم / طبقه</th><th>ارزش مالی</th><th>حذف انتقال</th><th>قیمت مرزی</th><th>ارز سایه</th><th>دستمزد سایه</th><th>انرژی</th><th>آب</th><th>زمین</th><th>اثر خارجی</th><th>ضریب اختصاصی</th><th>ارزش اقتصادی</th></tr></thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <th>{formatNumber(row.year, { maximumFractionDigits: 0 })}</th>
                <td><strong>{row.label}</strong><small>{economicClassificationLabel[row.classification]} · {row.sourceModule}</small></td>
                <td>{formatMoney(row.financialMarketValue, project)}</td>
                <td>{formatMoney(row.transferPaymentsRemoved, project)}</td>
                <td>{formatMoney(row.tradableBorderAdjustment, project)}</td>
                <td>{formatMoney(row.foreignExchangeAdjustment, project)}</td>
                <td>{formatMoney(row.laborShadowAdjustment, project)}</td>
                <td>{formatMoney(row.energyAdjustment, project)}</td>
                <td>{formatMoney(row.waterAdjustment, project)}</td>
                <td>{formatMoney(row.landOpportunityCostAdjustment, project)}</td>
                <td>{formatMoney(row.externalityAdjustment, project)}</td>
                <td>{formatMoney(row.itemSpecificAdjustment, project)}</td>
                <td>{formatMoney(row.economicValue, project)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function EconomicAnalysisWorkbench() {
  const { activeScenario, applyEconomicAssumptions, mode, outputs, project } = useProject();
  const economic = outputs.economic;
  const summary = economic.summary;
  const [draft, setDraft] = useState(() => normalizeEconomicAssumptions(activeScenario.assumptions.economic));
  useEffect(() => {
    setDraft(normalizeEconomicAssumptions(activeScenario.assumptions.economic));
  }, [activeScenario.id, activeScenario.assumptions.economic]);
  const save = () => applyEconomicAssumptions(draft);
  const mainTone = summary.decisionStatus === "acceptable" ? "success" : summary.decisionStatus === "critical" ? "danger" : "warning";
  const visibleDiagnostics = mode === "advanced" ? summary.diagnostics : summary.diagnostics.filter((item) => item.severity !== "info");

  return (
    <div className="rf-workbench">
      <section className="rf-toolbar">
        <div>
          <span>دیدگاه اقتصاد ملی / رفاه اجتماعی</span>
          <h3>تحلیل اقتصادی سناریوی {activeScenario.name}</h3>
          <p>مبنای {summary.priceBasis === "real" ? "واقعی و قیمت ثابت" : "اسمی و قیمت جاری"} · EOCK {formatPercent(summary.socialDiscountRate)} · نرخ ارز سایه‌ای {formatMoney(summary.shadowExchangeRate, project)}</p>
        </div>
        <b className={summary.decisionStatus === "acceptable" ? "ok-cell" : summary.decisionStatus === "critical" ? "risk-cell" : "watch-cell"}>{summary.decisionLabel}</b>
      </section>

      <section className="financial-kpi-grid">
        <KpiCard label="ENPV" value={summary.metrics.enpv.value} unit="money" note={summary.metrics.enpv.reason ?? "ارزش فعلی کامل ENCF"} tone={mainTone} project={project} />
        <KpiCard label="EIRR" value={economic.eirr} unit="percent" note={summary.metrics.eirr.reason ?? `مقایسه با EOCK ${formatPercent(summary.socialDiscountRate)}`} tone={economic.eirr !== null && economic.eirr > summary.socialDiscountRate ? "success" : "warning"} project={project} />
        <KpiCard label="EBCR" value={economic.ebcr} unit="ratio" note="PV منافع / PV هزینه‌ها" tone={economic.ebcr !== null && economic.ebcr > 1 ? "success" : "danger"} project={project} />
        <KpiCard label="بازگشت اقتصادی" value={economic.economicPayback} unit="year" note={`تنزیلی: ${economic.discountedEconomicPayback === null ? "ناموجود" : `${formatNumber(economic.discountedEconomicPayback)} سال`}`} tone={economic.economicPayback === null ? "warning" : "success"} project={project} />
        <KpiCard label="ارزش افزوده اقتصادی" value={economic.valueAdded} unit="money" note="PV محصول اقتصادی منهای نهاده‌های مستقیم و OPEX" tone={economic.valueAdded >= 0 ? "success" : "warning"} project={project} />
        <KpiCard label="اثر خالص ارزی" value={economic.netForeignExchangeEffectPresentValue} unit="money" note="PV صادرات/جایگزینی واردات منهای نهاده وارداتی" tone={economic.netForeignExchangeEffectPresentValue >= 0 ? "success" : "warning"} project={project} />
        <KpiCard label="اختلاف ENPV و NPV مالی" value={summary.npvDifference} unit="money" note={summary.metrics.enpvToFinancialNpvRatio.reason ?? `نسبت ${formatNumber(summary.enpvToFinancialNpvRatio)}x`} tone={summary.npvDifference >= 0 ? "success" : "warning"} project={project} />
        <KpiCard label="تطبیق پل" value={summary.bridgeReconciled ? 1 : 0} unit="ratio" note="جمع پل سالانه = ENCF" tone={summary.bridgeReconciled ? "success" : "danger"} project={project} />
      </section>

      <section className="panel rf-interpretation-panel">
        <div><span>جمع‌بندی تصمیم</span><strong>{summary.decisionLabel}</strong><p>{summary.decisionNarrative}</p></div>
        <div><span>مرز محاسبه</span><p>درآمد، COGS، OPEX، برنامه ماهانه ساخت، تغییر سرمایه در گردش، سناریو، ارز و افق از مالکان بالادست خوانده می‌شوند. بهره، اصل بدهی، آورده، سود سهام، مالیات بر درآمد و استهلاک منابع اقتصادی واقعی محسوب نشده‌اند.</p></div>
      </section>

      <AssumptionsEditor draft={draft} onChange={setDraft} onSave={save} />
      <Diagnostics diagnostics={visibleDiagnostics} />

      <section className="rf-chart-grid">
        <TrendChart title="منافع اقتصادی سالانه" subtitle="Economic benefits" rows={economic.annualRows} value={(row) => row.economicBenefits} project={project} />
        <TrendChart title="هزینه‌های اقتصادی سالانه" subtitle="Economic costs" rows={economic.annualRows} value={(row) => row.economicCosts} project={project} />
        <TrendChart title="ENCF و بازیافت اقتصادی" subtitle="Cumulative discounted ENCF" rows={economic.annualRows} value={(row) => row.cumulativeDiscountedNetEconomicBenefit} project={project} />
      </section>

      <AnnualTable rows={economic.annualRows} project={project} advanced={mode === "advanced"} />

      {mode === "advanced" ? (
        <>
          <MappingTable rows={summary.mappingRows} draft={draft} onChange={setDraft} onSave={save} project={project} />
          <ExternalityRegister draft={draft} onChange={setDraft} onSave={save} />
          <BridgeTable rows={summary.reconciliation} project={project} />
          <section className="panel financial-source-panel">
            <div className="panel-heading"><div><span>ردیابی بالادست</span><strong>منابع canonical مصرف‌شده</strong></div><small>فقط خواندنی</small></div>
            <div className="financial-source-grid">
              {summary.sourceReferences.map((source) => (
                <article key={source.id}><span>{source.sourceLabel}</span><strong>{source.label}</strong><b>{source.unit === "money" ? formatMoney(Number(source.value), project) : String(source.value)}</b><a href={source.editHref}>{source.editLabel}</a></article>
              ))}
            </div>
          </section>
          <section className="panel wide-panel financial-statement-panel">
            <div className="panel-heading"><div><span>حساسیت EOCK</span><strong>ENPV در نرخ‌های اطراف مبنا</strong></div></div>
            <div className="table-wrap phase-table"><table><thead><tr><th>EOCK</th><th>ENPV</th></tr></thead><tbody>{summary.sensitivityToSocialDiscountRate.map((item) => <tr key={item.rate}><th>{formatPercent(item.rate)}</th><td>{formatMoney(item.enpv, project)}</td></tr>)}</tbody></table></div>
          </section>
        </>
      ) : null}
    </div>
  );
}
