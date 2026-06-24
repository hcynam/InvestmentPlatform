"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AssumptionInput,
  CurrencyInput,
  NumberInput,
  PercentInput,
  SelectInput,
  ToggleInput,
} from "@/components/phase-one/PhaseOneFields";
import {
  calculateDSCR,
  calculateFinancingEngine,
  costColumnLabels,
  createFinancingInstrument,
  dscrBadge,
  dscrStatus,
  financingTypeLabels,
  graceBehaviorLabels,
  normalizeFinancingAssumptions,
  repaymentMethodLabels,
  repaymentMethodsByType,
} from "@/lib/financing-engine";
import { classNames, formatMoney, formatNumber, formatPercent } from "@/lib/format";
import type {
  DrawdownModel,
  DrawdownRow,
  FinancingAssumptions,
  FinancingInstrument,
  FinancingType,
  GraceCostBehavior,
  PaymentFrequency,
  Project,
  RepaymentMethod,
} from "@/lib/types";
import { useProject } from "@/store/project-context";

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const financingTypes: FinancingType[] = ["simpleBankLoan", "qardAlHasan", "murabaha", "installmentSale", "juala"];

const frequencyLabels: Record<PaymentFrequency, string> = {
  monthly: "ماهانه",
  quarterly: "سه‌ماهه",
  semiAnnual: "شش‌ماهه",
  annual: "سالانه",
};

const drawdownModelLabels: Record<DrawdownModel, string> = {
  manual: "طبق برنامه دستی",
  equalYears: "مساوی بین سال‌ها",
  capexPercent: "درصدی از CAPEX",
  physicalProgress: "متناسب با پیشرفت فیزیکی",
  sCurve: "S-Curve",
  frontLoaded: "Front-loaded",
  backLoaded: "Back-loaded",
  milestone: "مرحله‌ای / Milestone",
  lumpSumAtStart: "یکجا در شروع",
  lumpSumAtEnd: "یکجا در پایان ساخت",
  custom: "سفارشی",
};

const collateralCategories = [
  "سند ملکی",
  "زمین پروژه",
  "ماشین‌آلات و تجهیزات",
  "سپرده نقدی / مسدودی",
  "سهام / اوراق بهادار",
  "چک",
  "سفته",
  "ضامن شخصی",
  "ضامن حقوقی",
  "قرارداد فروش / مطالبات",
  "صورت‌وضعیت پیمانکاری",
  "بیمه‌نامه",
  "حق بهره‌برداری یا قرارداد تخصیص زمین",
  "سایر",
];

const guaranteeTypes = [
  "ضمانت‌نامه شرکت در مناقصه / مزایده",
  "ضمانت‌نامه حسن انجام تعهدات",
  "ضمانت‌نامه پیش‌پرداخت",
  "ضمانت‌نامه استرداد کسور وجه‌الضمان",
  "ضمانت‌نامه تعهد پرداخت",
  "ضمانت‌نامه گمرکی",
  "ضمانت‌نامه بانکی",
  "ضمانت‌نامه شرکتی",
  "تعهد سهامداران",
  "چک / سفته ضمانتی",
  "سایر",
];

const dividendPolicyOptions = [
  "عدم تقسیم سود تا پایان دوره بازپرداخت",
  "تقسیم درصد ثابت از سود خالص",
  "تقسیم فقط پس از رعایت حداقل DSCR",
  "تقسیم مازاد نقدینگی پس از خدمت بدهی",
  "تقسیم سود پلکانی",
  "تقسیم سود پس از کاهش بدهی به سطح هدف",
  "سیاست دلخواه",
];

const methodDescription: Record<FinancingType, string> = {
  simpleBankLoan: "تسهیلات نقدی با بازپرداخت اصل و سود؛ مناسب برای مدل‌سازی کلاسیک DSCR و بانک‌پذیری.",
  qardAlHasan: "قرض بدون بهره؛ هزینه آن به‌صورت کارمزد خدمت مدل می‌شود و نرخ پیش‌فرض ۴٪ قابل ویرایش است.",
  murabaha: "قیمت فروش شامل بهای تمام‌شده و سود قرارداد است؛ برای خرید کالا، تجهیزات یا خدمات مشخص.",
  installmentSale: "دارایی فیزیکی با قیمت اقساطی واگذار می‌شود؛ سود در قیمت فروش اقساطی نهفته است.",
  juala: "قرارداد انجام کار در برابر جعل/اجرت؛ برای تعمیر، تکمیل، اجرا و خدمات پیمانکاری مناسب است.",
  custom: "روش سفارشی با توضیح و منطق بازپرداخت قابل تنظیم.",
};

const finite = (value: number | null | undefined) => Number.isFinite(value ?? Number.NaN) ? Number(value) : 0;

const sum = (values: number[]) => values.reduce((total, value) => total + finite(value), 0);

const ratio = (value: number | null | undefined) => value === null || value === undefined || !Number.isFinite(value) ? "بدون خدمت بدهی" : formatNumber(value);

const methodLabel = (method: RepaymentMethod) => repaymentMethodLabels[method] ?? method;

const drawdownRowsForInstrument = (rows: DrawdownRow[], instrumentId: string) =>
  rows.filter((row) => row.instrumentId === instrumentId);

function ChipGroup({
  options,
  selected,
  disabled,
  onChange,
}: {
  options: string[];
  selected: string[];
  disabled?: boolean;
  onChange: (items: string[]) => void;
}) {
  const toggle = (item: string) => {
    if (disabled) return;
    onChange(selected.includes(item) ? selected.filter((value) => value !== item) : [...selected, item]);
  };

  return (
    <div className="financing-chip-grid">
      {options.map((item) => (
        <button key={item} type="button" className={selected.includes(item) ? "selected" : ""} onClick={() => toggle(item)} disabled={disabled}>
          {item}
        </button>
      ))}
    </div>
  );
}

function FundingKpi({ label, value, note, tone }: { label: string; value: string; note?: string; tone?: "good" | "warn" | "bad" }) {
  return (
    <article className={classNames("financing-kpi-card", tone)}>
      <span>{label}</span>
      <strong>{value}</strong>
      {note ? <small>{note}</small> : null}
    </article>
  );
}

function InstrumentCard({
  instrument,
  disabled,
  update,
  deactivate,
  project,
}: {
  instrument: FinancingInstrument;
  disabled: boolean;
  update: (patch: Partial<FinancingInstrument>) => void;
  deactivate: () => void;
  project: Project;
}) {
  const methodOptions = repaymentMethodsByType[instrument.type] ?? repaymentMethodsByType.custom;
  const costLabel = instrument.type === "qardAlHasan" ? "نرخ کارمزد خدمت" : instrument.type === "juala" ? "نرخ جعل / اجرت" : "نرخ سود / کارمزد";

  return (
    <details className="financing-instrument-card" open={instrument.active}>
      <summary>
        <div>
          <span>{financingTypeLabels[instrument.type]}</span>
          <strong>{instrument.title}</strong>
          <small>{methodLabel(instrument.repaymentMethod)} · {frequencyLabels[instrument.paymentFrequency]}</small>
        </div>
        <div className="instrument-summary-metrics">
          <b>{formatMoney(instrument.amount, project)}</b>
          <i>{formatPercent(instrument.annualRate)}</i>
          <em>{instrument.active ? "فعال" : "غیرفعال"}</em>
        </div>
      </summary>
      <div className="financing-instrument-body">
        <div className="phase-form-grid">
          <AssumptionInput label="عنوان ابزار" value={instrument.title} onChange={(value) => update({ title: String(value ?? "") })} disabled={disabled} />
          <CurrencyInput label="مبلغ تسهیلات" value={instrument.amount} onChange={(value) => update({ amount: Number(value ?? 0) })} disabled={disabled} source="Financing14!R10" />
          <PercentInput label={costLabel} value={instrument.annualRate} onChange={(value) => update({ annualRate: Number(value ?? 0) })} disabled={disabled} source="Financing14!R12:R13" />
          <PercentInput label="کارمزد و هزینه‌های جانبی" value={instrument.feeRate ?? 0} onChange={(value) => update({ feeRate: Number(value ?? 0) })} disabled={disabled} />
          <ToggleInput label="تنفس دارد؟" value={instrument.graceEnabled} onChange={(value) => update({ graceEnabled: Boolean(value) })} disabled={disabled} source="Financing14!R11" />
          <NumberInput label="مدت تنفس" value={instrument.graceMonths} onChange={(value) => update({ graceMonths: Number(value ?? 0) })} disabled={disabled || !instrument.graceEnabled} help="ماه" />
          <SelectInput
            label="رفتار سود/کارمزد در تنفس"
            value={instrument.graceCostBehavior}
            options={Object.keys(graceBehaviorLabels)}
            onChange={(value) => update({ graceCostBehavior: value as GraceCostBehavior })}
            disabled={disabled || !instrument.graceEnabled}
            help={graceBehaviorLabels[instrument.graceCostBehavior]}
          />
          <NumberInput label="مدت بازپرداخت" value={instrument.repaymentTermMonths} onChange={(value) => update({ repaymentTermMonths: Number(value ?? 0) })} disabled={disabled} help="ماه" source="Financing14!R15" />
          <SelectInput label="تناوب پرداخت" value={instrument.paymentFrequency} options={Object.keys(frequencyLabels)} onChange={(value) => update({ paymentFrequency: value as PaymentFrequency })} disabled={disabled} />
          <SelectInput label="نحوه بازپرداخت" value={instrument.repaymentMethod} options={methodOptions} onChange={(value) => update({ repaymentMethod: value as RepaymentMethod })} disabled={disabled} help={methodLabel(instrument.repaymentMethod)} source="Financing14!R14" />
          <PercentInput label="درصد بالون / پرداخت نهایی" value={instrument.balloonPercent ?? 0} onChange={(value) => update({ balloonPercent: Number(value ?? 0) })} disabled={disabled} />
          <PercentInput label="نرخ رشد اقساط پلکانی" value={instrument.stepRate ?? 0} onChange={(value) => update({ stepRate: Number(value ?? 0) })} disabled={disabled} />
          <PercentInput label="سپرده مسدودی نزد بانک" value={instrument.blockedDepositPercent ?? 0} onChange={(value) => update({ blockedDepositPercent: Number(value ?? 0) })} disabled={disabled} />
          <PercentInput label="هزینه فرصت سپرده مسدودی" value={instrument.blockedDepositOpportunityRate ?? 0} onChange={(value) => update({ blockedDepositOpportunityRate: Number(value ?? 0) })} disabled={disabled} />
          <PercentInput label="هزینه ضمانت‌نامه" value={instrument.guaranteeFeeRate ?? 0} onChange={(value) => update({ guaranteeFeeRate: Number(value ?? 0) })} disabled={disabled} />
          <PercentInput label="پیش‌دریافت / پیش‌پرداخت" value={instrument.upfrontPaymentPercent ?? 0} onChange={(value) => update({ upfrontPaymentPercent: Number(value ?? 0) })} disabled={disabled} />
        </div>

        <div className="financing-subgrid">
          <section>
            <header><strong>وثیقه</strong><ToggleInput label="نیاز دارد؟" value={instrument.collateralRequired} onChange={(value) => update({ collateralRequired: Boolean(value) })} disabled={disabled} /></header>
            {instrument.collateralRequired ? (
              <>
                <ChipGroup options={collateralCategories} selected={instrument.collateralItems} disabled={disabled} onChange={(items) => update({ collateralItems: items })} />
                <AssumptionInput label="شرح وثیقه" type="textarea" value={instrument.collateralText ?? ""} onChange={(value) => update({ collateralText: String(value ?? "") })} disabled={disabled} source="Financing14!R16" />
              </>
            ) : <p className="soft-note">برای این ابزار وثیقه الزامی ثبت نشده است.</p>}
          </section>
          <section>
            <header><strong>ضمانت‌نامه</strong><ToggleInput label="دارد؟" value={instrument.guaranteeRequired} onChange={(value) => update({ guaranteeRequired: Boolean(value) })} disabled={disabled} /></header>
            {instrument.guaranteeRequired ? (
              <ChipGroup options={guaranteeTypes} selected={instrument.guaranteeTypes} disabled={disabled} onChange={(items) => update({ guaranteeTypes: items })} />
            ) : <p className="soft-note">ضمانت‌نامه جداگانه برای این ابزار فعال نیست.</p>}
          </section>
        </div>

        <div className="phase-form-grid">
          <SelectInput label="تقسیم سود" value={instrument.dividendPolicy} options={dividendPolicyOptions} onChange={(value) => update({ dividendPolicy: String(value) })} disabled={disabled} source="Financing14!R18" />
          <AssumptionInput label="تعهدات و covenants" type="textarea" value={instrument.covenantsText ?? ""} onChange={(value) => update({ covenantsText: String(value ?? "") })} disabled={disabled} source="Financing14!R19" />
        </div>

        <footer>
          <p>{methodDescription[instrument.type]}</p>
          <button type="button" className="secondary-button danger" disabled={disabled} onClick={deactivate}>غیرفعال کردن این روش</button>
        </footer>
      </div>
    </details>
  );
}

function enrichWithCfads(schedule: ReturnType<typeof calculateFinancingEngine>, statements: ReturnType<typeof useProject>["outputs"]["statements"]) {
  const annual = schedule.schedule.map((row) => {
    const statement = statements.rows.find((item) => item.year === row.year);
    const cfads = statement ? statement.ebitda - statement.tax - statement.changeInWorkingCapital : 0;
    const dscr = calculateDSCR(cfads, row.debtService);
    return { ...row, cfads, dscr, status: dscrStatus(dscr) };
  });

  const instrumentSchedules = schedule.instrumentSchedules.map((row) => {
    const annualRow = annual.find((item) => item.year === row.year);
    const share = annualRow && annualRow.debtService > 0 ? row.totalDebtService / annualRow.debtService : 0;
    const cfads = annualRow ? annualRow.cfads * share : 0;
    const dscr = calculateDSCR(cfads, row.totalDebtService);
    return { ...row, cfads, dscr, status: dscrStatus(dscr) };
  });

  const dscrValues = annual.map((row) => row.dscr).filter((value): value is number => value !== null && Number.isFinite(value));
  return {
    ...schedule,
    schedule: annual,
    annualSchedule: annual,
    instrumentSchedules,
    minimumDscr: dscrValues.length ? Math.min(...dscrValues) : null,
    averageDscr: dscrValues.length ? sum(dscrValues) / dscrValues.length : null,
    kpis: {
      ...schedule.kpis,
      minimumDscr: dscrValues.length ? Math.min(...dscrValues) : null,
      averageDscr: dscrValues.length ? sum(dscrValues) / dscrValues.length : null,
    },
  };
}

export function FinancingWorkspace() {
  const { activeScenario, outputs, project, mode, applyFinancingAssumptions, dirty } = useProject();
  const normalizedSource = useMemo(
    () => normalizeFinancingAssumptions(activeScenario.assumptions.financing),
    [activeScenario.id, activeScenario.assumptions.financing],
  );
  const [draft, setDraft] = useState<FinancingAssumptions>(() => clone(normalizedSource));
  const [selectedYear, setSelectedYear] = useState(1);
  const [customTitle, setCustomTitle] = useState("");
  const disabled = activeScenario.isLocked;

  useEffect(() => setDraft(clone(normalizedSource)), [normalizedSource]);

  const modelYears = useMemo(() => Array.from({ length: project.modelHorizonYears + 1 }, (_, year) => year), [project.modelHorizonYears]);
  const activeInstruments = draft.instruments?.filter((instrument) => instrument.active) ?? [];
  const preview = useMemo(
    () => enrichWithCfads(calculateFinancingEngine(draft, project.modelHorizonYears), outputs.statements),
    [draft, outputs.statements, project.modelHorizonYears],
  );
  const selectedScheduleRow = preview.schedule.find((row) => row.year === selectedYear) ?? preview.schedule[0];
  const costTypes = Array.from(new Set(activeInstruments.map((instrument) => instrument.type)));

  const updateDraft = (patch: Partial<FinancingAssumptions>) => {
    setDraft((current) => ({ ...current, ...patch }));
  };

  const updateInstrument = (id: string, patch: Partial<FinancingInstrument>) => {
    setDraft((current) => ({
      ...current,
      instruments: (current.instruments ?? []).map((instrument) => instrument.id === id ? { ...instrument, ...patch } : instrument),
    }));
  };

  const toggleType = (type: FinancingType) => {
    setDraft((current) => {
      const instruments = current.instruments ?? [];
      const existing = instruments.find((instrument) => instrument.type === type);
      if (existing) {
        return {
          ...current,
          instruments: instruments.map((instrument) => instrument.id === existing.id ? { ...instrument, active: !instrument.active } : instrument),
        };
      }
      return {
        ...current,
        instruments: [...instruments, createFinancingInstrument(type, { id: `${type}-${Date.now()}` })],
      };
    });
  };

  const addCustomInstrument = () => {
    const title = customTitle.trim() || "روش سفارشی";
    const id = `custom-${Date.now()}`;
    setDraft((current) => ({
      ...current,
      instruments: [...(current.instruments ?? []), createFinancingInstrument("custom", { id, title })],
    }));
    setCustomTitle("");
  };

  const toggleDrawdownYear = (year: number) => {
    setDraft((current) => {
      const selected = new Set(current.selectedDrawdownYears ?? [0]);
      if (selected.has(year) && selected.size > 1) selected.delete(year);
      else selected.add(year);
      return { ...current, selectedDrawdownYears: Array.from(selected).sort((a, b) => a - b) };
    });
  };

  const setDrawdown = (year: number, instrumentId: string, amount: number) => {
    setDraft((current) => {
      const rows = current.drawdownRows ?? [];
      const nextRows = rows.some((row) => row.year === year && row.instrumentId === instrumentId)
        ? rows.map((row) => row.year === year && row.instrumentId === instrumentId ? { ...row, amount } : row)
        : [...rows, { year, instrumentId, amount }];
      return { ...current, drawdownRows: nextRows };
    });
  };

  const selectedYears = (draft.selectedDrawdownYears?.length ? draft.selectedDrawdownYears : [0]).filter((year) => year <= project.modelHorizonYears);
  const tableYears = preview.schedule.filter((row) => row.drawdown > 0 || row.principalRepayment > 0 || row.debtService > 0 || row.endingBalance > 0);
  const debtToEquityTone = preview.kpis.debtToEquity === null ? "warn" : preview.kpis.debtToEquity > 4 ? "bad" : preview.kpis.debtToEquity > 2 ? "warn" : "good";
  const selectedDscrTone = selectedScheduleRow?.dscr !== null && selectedScheduleRow?.dscr !== undefined
    ? selectedScheduleRow.dscr < 1 ? "bad" : selectedScheduleRow.dscr < 1.2 ? "warn" : "good"
    : undefined;

  return (
    <div className="financing-workspace">
      <section className="financing-hero">
        <div>
          <span>Financing14</span>
          <h3>تأمین مالی، بانک‌پذیری و خدمت بدهی</h3>
          <p>مدل تک‌وام اکسل به یک سازنده چندابزاری تبدیل شده است: برداشت، اصل، سود/کارمزد، وثیقه، تعهدات، CFADS و DSCR از یک engine قابل تست ساخته می‌شوند.</p>
        </div>
        <div className={classNames("financing-calc-state", dirty && "dirty")}>
          <strong>{dirty ? "تغییرات ذخیره‌نشده در مدل" : "مدل اصلی به‌روز است"}</strong>
          <button className="primary-button" type="button" disabled={disabled} onClick={() => applyFinancingAssumptions(draft)}>ذخیره و محاسبه</button>
          <button className="secondary-button" type="button" onClick={() => setDraft(clone(normalizedSource))}>بازنشانی</button>
        </div>
      </section>

      <section className="financing-kpi-strip">
        <FundingKpi label="کل منابع تأمین مالی" value={formatMoney(preview.kpis.totalFunding, project)} note="آورده + بدهی فعال" />
        <FundingKpi label="آورده سهامدار" value={formatMoney(draft.equity, project)} note="حقوق صاحبان سهام" />
        <FundingKpi label="کل بدهی" value={formatMoney(preview.kpis.totalDebt, project)} note={`${formatNumber(activeInstruments.length)} ابزار فعال`} />
        <FundingKpi label="نسبت بدهی به سرمایه" value={preview.kpis.debtToEquity === null ? "نیازمند آورده" : formatNumber(preview.kpis.debtToEquity)} note="Debt / Equity" tone={debtToEquityTone} />
        <FundingKpi label="حداقل DSCR" value={ratio(preview.minimumDscr)} note={dscrBadge(preview.minimumDscr)} tone={preview.minimumDscr === null ? undefined : preview.minimumDscr < 1.2 ? "bad" : "good"} />
        <FundingKpi label="کل هزینه مالی پروژه" value={formatMoney(preview.kpis.totalProjectFinancingCost, project)} note="بدون بازپرداخت اصل" />
      </section>

      <section className="phase-section-card financing-section">
        <header>
          <div><span>Section 1</span><h3>منابع تأمین مالی</h3><p>انتخاب چند روش تأمین مالی، تعریف تعهدات و کنترل ساختار بدهی/آورده.</p></div>
        </header>
        <div className="phase-card-body">
          <div className="financing-source-layout">
            <aside className="financing-source-panel">
              <CurrencyInput label="آورده سهامدار" value={draft.equity} onChange={(value) => updateDraft({ equity: Number(value ?? 0) })} disabled={disabled} source="Financing14!R8" />
              <div className="financing-method-picker">
                <strong>نوع تسهیلات</strong>
                <div>
                  {financingTypes.map((type) => {
                    const active = draft.instruments?.some((instrument) => instrument.type === type && instrument.active);
                    return (
                      <button key={type} type="button" className={active ? "active" : ""} onClick={() => toggleType(type)} disabled={disabled}>
                        <span>{financingTypeLabels[type]}</span>
                        <small>{active ? "انتخاب شده" : "افزودن"}</small>
                      </button>
                    );
                  })}
                </div>
              </div>
              <label className="financing-custom-method">
                <span>روش سفارشی</span>
                <div>
                  <input value={customTitle} onChange={(event) => setCustomTitle(event.target.value)} placeholder="مثلاً اوراق مشارکت پروژه" disabled={disabled} />
                  <button type="button" onClick={addCustomInstrument} disabled={disabled}>افزودن</button>
                </div>
              </label>
            </aside>
            <main className="financing-instrument-list">
              {activeInstruments.length ? activeInstruments.map((instrument) => (
                <InstrumentCard
                  key={instrument.id}
                  instrument={instrument}
                  disabled={disabled}
                  update={(patch) => updateInstrument(instrument.id, patch)}
                  deactivate={() => updateInstrument(instrument.id, { active: false })}
                  project={project}
                />
              )) : (
                <div className="empty-state large">
                  <strong>هیچ روش تأمین مالی فعالی انتخاب نشده است.</strong>
                  <p>حداقل یک روش را از لیست سمت راست فعال کنید تا جدول برداشت و خدمت بدهی ساخته شود.</p>
                </div>
              )}
            </main>
          </div>
        </div>
      </section>

      <section className="phase-section-card financing-section">
        <header>
          <div><span>Section 2</span><h3>جدول برداشت تسهیلات</h3><p>سال‌های برداشت را انتخاب کنید و مبلغ برداشت هر ابزار را در ماتریس وارد کنید.</p></div>
          <SelectInput label="مدل برداشت" value={draft.drawdownModel ?? "manual"} options={Object.keys(drawdownModelLabels)} onChange={(value) => updateDraft({ drawdownModel: value as DrawdownModel })} disabled={disabled} help={drawdownModelLabels[draft.drawdownModel ?? "manual"]} />
        </header>
        <div className="phase-card-body">
          <div className="financing-year-selector">
            {modelYears.slice(0, Math.min(project.modelHorizonYears + 1, 12)).map((year) => (
              <button key={year} type="button" className={selectedYears.includes(year) ? "active" : ""} onClick={() => toggleDrawdownYear(year)} disabled={disabled}>
                سال {formatNumber(year)}
              </button>
            ))}
          </div>
          <div className="table-wrap financing-drawdown-table">
            <table>
              <thead>
                <tr>
                  <th>سال</th>
                  {activeInstruments.map((instrument) => <th key={instrument.id}>{instrument.title}</th>)}
                  <th>جمع سال</th>
                </tr>
              </thead>
              <tbody>
                {selectedYears.map((year) => {
                  const rowTotal = sum(activeInstruments.map((instrument) => finite((draft.drawdownRows ?? []).find((row) => row.year === year && row.instrumentId === instrument.id)?.amount)));
                  return (
                    <tr key={year}>
                      <td>سال {formatNumber(year)}</td>
                      {activeInstruments.map((instrument) => {
                        const value = finite((draft.drawdownRows ?? []).find((row) => row.year === year && row.instrumentId === instrument.id)?.amount);
                        return (
                          <td key={instrument.id}>
                            <input type="number" step="any" value={value} disabled={disabled} onChange={(event) => setDrawdown(year, instrument.id, Number(event.target.value))} />
                            <small>{instrument.amount > 0 ? formatPercent(value / instrument.amount) : "بدون مبلغ"}</small>
                          </td>
                        );
                      })}
                      <td>{formatMoney(rowTotal, project)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="financing-allocation-grid">
            {activeInstruments.map((instrument) => {
              const allocated = sum(drawdownRowsForInstrument(draft.drawdownRows ?? [], instrument.id).map((row) => row.amount));
              const progress = instrument.amount > 0 ? Math.min(140, allocated / instrument.amount * 100) : 0;
              const over = allocated - instrument.amount;
              return (
                <article key={instrument.id} className={over > 1 ? "over" : allocated < instrument.amount ? "warn" : "ok"}>
                  <div><span>{instrument.title}</span><strong>{formatMoney(allocated, project)}</strong></div>
                  <i><b style={{ width: `${Math.min(100, progress)}%` }} /></i>
                  <small>{over > 1 ? `اضافه برداشت: ${formatMoney(over, project)}` : `مانده تخصیص‌نیافته: ${formatMoney(Math.max(0, instrument.amount - allocated), project)}`}</small>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className="financing-two-col">
        <article className="phase-section-card financing-section">
          <header><div><span>Section 3</span><h3>جدول بازپرداخت اصل وام</h3><p>اصل بدهی بر اساس تنفس، دوره و روش بازپرداخت خودکار محاسبه می‌شود.</p></div></header>
          <div className="phase-card-body table-wrap">
            <table>
              <thead><tr><th>سال</th>{activeInstruments.map((instrument) => <th key={instrument.id}>{instrument.title}</th>)}<th>جمع بازپرداخت اصل</th></tr></thead>
              <tbody>{tableYears.map((row) => (
                <tr key={row.year}>
                  <td>{formatNumber(row.year)}</td>
                  {activeInstruments.map((instrument) => {
                    const detail = preview.instrumentSchedules.find((item) => item.year === row.year && item.instrumentId === instrument.id);
                    return <td key={instrument.id}>{formatMoney(detail?.principalRepayment ?? 0, project)}</td>;
                  })}
                  <td><strong>{formatMoney(row.principalRepayment, project)}</strong></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </article>

        <article className="phase-section-card financing-section">
          <header><div><span>Section 4</span><h3>جدول بهره، سود و کارمزد تسهیلات</h3><p>هزینه‌ها با نام درست هر عقد بانکی نمایش داده می‌شوند؛ اصل بدهی هزینه مالی نیست.</p></div></header>
          <div className="phase-card-body table-wrap">
            <table>
              <thead><tr><th>سال</th>{costTypes.map((type) => <th key={type}>{costColumnLabels[type]}</th>)}<th>هزینه‌های جانبی</th><th>جمع هزینه مالی سال</th></tr></thead>
              <tbody>{tableYears.map((row) => {
                const sideCosts = row.financingFees + row.guaranteeFee + row.blockedDepositOpportunityCost;
                return (
                  <tr key={row.year}>
                    <td>{formatNumber(row.year)}</td>
                    {costTypes.map((type) => {
                      const cost = sum(preview.instrumentSchedules.filter((item) => item.year === row.year && item.instrumentType === type).map((item) => item.financingCost));
                      return <td key={type}>{formatMoney(cost, project)}</td>;
                    })}
                    <td>{formatMoney(sideCosts, project)}</td>
                    <td><strong>{formatMoney(row.financingCost + sideCosts, project)}</strong></td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
        </article>
      </section>

      <section className="phase-section-card financing-section">
        <header>
          <div><span>Section 5</span><h3>خروجی‌های مالی</h3><p>DSCR، بدهی باقی‌مانده، هزینه مالی و قسط مبنا برای تحلیل بانک‌پذیری.</p></div>
          <label className="financing-year-dropdown">
            <span>انتخاب سال</span>
            <select value={selectedYear} onChange={(event) => setSelectedYear(Number(event.target.value))}>
              {modelYears.map((year) => <option key={year} value={year}>سال {formatNumber(year)}</option>)}
            </select>
          </label>
        </header>
        <div className="phase-card-body">
          <div className="financing-output-grid">
            <FundingKpi label="DSCR سال منتخب" value={ratio(selectedScheduleRow?.dscr)} note={dscrBadge(selectedScheduleRow?.dscr ?? null)} tone={selectedDscrTone} />
            <FundingKpi label="حداقل DSCR" value={ratio(preview.minimumDscr)} note="کمترین نسبت پوشش خدمت بدهی" tone={preview.minimumDscr === null ? undefined : preview.minimumDscr < 1.2 ? "bad" : "good"} />
            <FundingKpi label="میانگین DSCR" value={ratio(preview.averageDscr)} note="فقط سال‌های دارای خدمت بدهی" />
            <FundingKpi label="بدهی باقی‌مانده" value={formatMoney(selectedScheduleRow?.endingBalance ?? 0, project)} note={`پایان سال ${formatNumber(selectedYear)}`} />
            <FundingKpi label="میانگین هزینه مالی سالانه" value={formatMoney(preview.kpis.averageAnnualFinancingCost, project)} note="فقط سال‌های با هزینه مثبت" />
            <FundingKpi label="بدهی مبنای بازپرداخت" value={formatMoney(preview.kpis.repaymentBaseDebt, project)} note="پس از برداشت و سرمایه‌ای شدن هزینه‌ها" />
            <FundingKpi label="قسط ثابت سالانه مبنا" value={preview.kpis.baseFixedAnnualInstallment > 0 ? formatMoney(preview.kpis.baseFixedAnnualInstallment, project) : "غیرقابل اعمال"} note="برای ابزارهای با قسط ثابت" />
            <FundingKpi label="سال اوج خدمت بدهی" value={`سال ${formatNumber(preview.kpis.peakDebtServiceYear)}`} note={formatMoney(preview.schedule[preview.kpis.peakDebtServiceYear]?.debtService ?? 0, project)} />
          </div>
          <div className="financing-remaining-list">
            {activeInstruments.map((instrument) => {
              const row = preview.instrumentSchedules.find((item) => item.year === selectedYear && item.instrumentId === instrument.id);
              return <article key={instrument.id}><span>{instrument.title}</span><strong>{formatMoney(row?.closingDebt ?? 0, project)}</strong></article>;
            })}
          </div>
        </div>
      </section>

      <section className="phase-section-card financing-section">
        <header><div><span>Section 6</span><h3>برنامه کامل خدمت بدهی</h3><p>برنامه سالانه تعمیم‌یافته مشابه شیت اکسل، همراه با CFADS و وضعیت بانکی.</p></div></header>
        <div className="phase-card-body table-wrap xl">
          <table className="financing-service-table">
            <thead><tr><th>سال</th><th>برداشت تسهیلات</th><th>مانده اول دوره</th><th>سود / کارمزد / هزینه مالی</th><th>بازپرداخت اصل</th><th>کل خدمت بدهی</th><th>مانده پایان دوره</th><th>CFADS</th><th>DSCR</th><th>وضعیت بانکی</th></tr></thead>
            <tbody>{preview.schedule.map((row) => (
              <tr key={row.year} className={classNames(row.dscr !== null && row.dscr < 1 && "bad-dscr", row.dscr !== null && row.dscr >= 1 && row.dscr < 1.2 && "warn-dscr", row.dscr !== null && row.dscr >= 1.5 && "good-dscr")}>
                <td>{formatNumber(row.year)}</td>
                <td>{formatMoney(row.drawdown, project)}</td>
                <td>{formatMoney(row.openingBalance, project)}</td>
                <td>{formatMoney(row.financingCost + row.financingFees + row.guaranteeFee + row.blockedDepositOpportunityCost, project)}</td>
                <td>{formatMoney(row.principalRepayment, project)}</td>
                <td>{formatMoney(row.debtService, project)}</td>
                <td>{formatMoney(row.endingBalance, project)}</td>
                <td>{formatMoney(row.cfads, project)}</td>
                <td>{ratio(row.dscr)}</td>
                <td>{row.status}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </section>

      {mode === "advanced" && preview.warnings.length ? (
        <section className="financing-warning-box">
          {preview.warnings.map((warning) => <p key={warning}>{warning}</p>)}
        </section>
      ) : null}
    </div>
  );
}
