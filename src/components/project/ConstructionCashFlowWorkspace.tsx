"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CurrencyInput,
  NumberInput,
  PercentInput,
  SelectInput,
  ToggleInput,
} from "@/components/phase-one/PhaseOneFields";
import {
  buildConstructionCashFlowTable,
  calculateBufferMonths,
  calculateMonthlyRateFromAnnual,
  getAnalysisMonthOptions,
  normalizeConstructionAssumptions,
} from "@/lib/construction-cashflow-engine";
import { classNames, formatMoney, formatNumber, formatPercent } from "@/lib/format";
import type {
  CapexPaymentMilestone,
  ConstructionAssumptions,
  ConstructionCostItem,
  CostDistributionMode,
} from "@/lib/types";
import { useProject } from "@/store/project-context";

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const finite = (value: number | null | undefined) => Number.isFinite(value ?? Number.NaN) ? Number(value) : 0;

const sum = (values: number[]) => values.reduce((total, value) => total + finite(value), 0);

const monthList = (count: number) => Array.from({ length: Math.max(0, Math.round(count)) }, (_, index) => index + 1);

const distributionLabels: Record<CostDistributionMode, string> = {
  repeatMonthly: "تکرار ماهانه",
  fullAmountEachSelectedMonth: "کل مبلغ در هر ماه انتخابی",
  equalSplitAcrossSelectedMonths: "تقسیم مساوی بین ماه‌ها",
  manualPercent: "درصد دستی",
};

const financingTimingOptions = [
  "محافظه‌کارانه",
  "ساده",
  "مساوی ماهانه",
  "طبق برنامه دستی",
  "حداقل تزریق برای حفظ مانده احتیاطی",
];

const debtTimingOptions = [
  "محافظه‌کارانه",
  "ساده",
  "مساوی ماهانه",
  "متناسب با CAPEX",
  "بعد از مصرف آورده",
  "فقط هنگام Cash Crunch",
  "طبق جدول برداشت تسهیلات",
];

const monthStatusLabel: Record<string, string> = {
  development: "توسعه",
  delivery: "تحویل",
  installationAcceptance: "استقرار/قبولی",
  bufferSettlement: "بافر/تسویه",
  delay: "تأخیر",
};

function ConstructionKpiCard({
  label,
  value,
  note,
  tone,
  locked,
}: {
  label: string;
  value: string;
  note?: string;
  tone?: "good" | "warn" | "bad";
  locked?: boolean;
}) {
  return (
    <article className={classNames("construction-kpi-card", tone, locked && "locked")}>
      <span>{label}{locked ? <b>قفل‌شده از مدل</b> : null}</span>
      <strong>{value}</strong>
      {note ? <small>{note}</small> : null}
    </article>
  );
}

function LockedMetric({ label, value, source, note }: { label: string; value: string; source: string; note?: string }) {
  return (
    <div className="construction-locked-metric">
      <span>{label}<b>قفل‌شده</b></span>
      <strong>{value}</strong>
      <small>{source}</small>
      {note ? <em>{note}</em> : null}
    </div>
  );
}

function MonthChips({
  months,
  selected,
  disabled,
  onChange,
}: {
  months: number[];
  selected: number[];
  disabled?: boolean;
  onChange: (months: number[]) => void;
}) {
  const toggle = (month: number) => {
    if (disabled) return;
    const next = selected.includes(month) ? selected.filter((item) => item !== month) : [...selected, month];
    onChange(next.sort((a, b) => a - b));
  };

  return (
    <div className="construction-month-chips">
      {months.map((month) => (
        <button key={month} type="button" className={selected.includes(month) ? "active" : ""} disabled={disabled} onClick={() => toggle(month)}>
          {formatNumber(month)}
        </button>
      ))}
    </div>
  );
}

function updateMilestone(
  milestones: CapexPaymentMilestone[],
  id: CapexPaymentMilestone["id"],
  patch: Partial<CapexPaymentMilestone>,
) {
  return milestones.map((milestone) => milestone.id === id ? { ...milestone, ...patch } : milestone);
}

function updateCostItem(
  items: ConstructionCostItem[],
  id: string,
  patch: Partial<ConstructionCostItem>,
) {
  return items.map((item) => item.id === id ? { ...item, ...patch } : item);
}

const moneyClass = (value: number) => classNames(value < 0 && "negative", value > 0 && "positive");

const displayMonth = (value: number | null | undefined) => value ? formatNumber(value) : "-";

function controlTone(status: string) {
  if (status === "OK") return "good";
  if (status === "خطا") return "bad";
  return "warn";
}

export function ConstructionCashFlowWorkspace() {
  const { activeScenario, outputs, project, applyConstructionAssumptions, dirty } = useProject();
  const disabled = activeScenario.isLocked;
  const source = activeScenario.assumptions.construction;
  const macro = activeScenario.assumptions.macro;
  const financing = activeScenario.assumptions.financing;

  const normalizedSource = useMemo(() => {
    const normalized = normalizeConstructionAssumptions({
      project,
      assumptions: source,
      macro,
      capex: outputs.capex,
      financing,
    });

    return {
      ...source,
      analysisMonths: normalized.analysisMonths,
      bufferMonths: normalized.bufferMonths,
      monthlyInflationRate: normalized.monthlyInflationRate,
      monthlyFxGrowthRate: normalized.monthlyFxGrowthRate,
      delayMonthlyCost: normalized.delayMonthlyCost,
      creditLineCap: normalized.creditLineCap,
      creditLineFeeRate: normalized.creditLineFeeRate,
      delayAdjustmentRate: normalized.delayAdjustmentRate,
      allowedDelayMonths: normalized.allowedDelayMonths,
      actualDelayMonths: normalized.actualDelayMonths,
      capexMilestones: normalized.capexMilestones,
      costItems: normalized.costItems,
    } satisfies ConstructionAssumptions;
  }, [financing, macro, outputs.capex, project, source]);

  const [draft, setDraft] = useState<ConstructionAssumptions>(() => clone(normalizedSource));
  useEffect(() => setDraft(clone(normalizedSource)), [normalizedSource]);

  const preview = useMemo(() => buildConstructionCashFlowTable({
    project,
    assumptions: draft,
    macro,
    capex: outputs.capex,
    financing,
  }), [draft, financing, macro, outputs.capex, project]);

  const controlChecks = preview.controlsResult;
  const rows = preview.rows;
  const kpis = preview.kpis;
  const developmentMonths = preview.controls.developmentMonths;
  const analysisMonths = preview.controls.analysisMonths;
  const monthOptions = getAnalysisMonthOptions(developmentMonths);
  const allMonths = monthList(analysisMonths);
  const paymentPercent = sum((draft.capexMilestones ?? []).filter((item) => item.active).map((item) => item.percent));
  const paymentStatus = Math.abs(paymentPercent - 1) < 0.0001 ? "OK" : paymentPercent < 1 ? "کمتر از 100٪" : "بیشتر از 100٪";
  const resourcesAvailable = preview.controls.shareholderInjectionAvailable + preview.controls.nonEquityFundingAvailable;
  const delayFromCapex = activeScenario.assumptions.capex.items.reduce((total, item) => total + (item.delayEnabled ? finite(item.delayMonths) : 0), 0);
  const firstCrunch = rows.find((row) => finite(row.cashShortfall) > 0);

  const setPatch = (patch: Partial<ConstructionAssumptions>) => setDraft((current) => ({ ...current, ...patch }));
  const setMilestones = (capexMilestones: CapexPaymentMilestone[]) => setPatch({ capexMilestones });
  const setCostItems = (costItems: ConstructionCostItem[]) => setPatch({ costItems });

  const addCustomCost = () => {
    const id = `custom-cost-${Date.now()}`;
    setCostItems([
      ...(draft.costItems ?? []),
      {
        id,
        title: "هزینه سفارشی",
        baseAmount: 0,
        active: true,
        isMonthly: false,
        selectedMonths: [1],
        inflationIndexed: true,
        fxIndexed: false,
        fxShare: 0,
        rialShare: 1,
        distributionMode: "equalSplitAcrossSelectedMonths",
        description: "",
        isCustom: true,
      },
    ]);
  };

  return (
    <div className="construction-workspace">
      <section className="construction-hero">
        <div>
          <span>ConstructionCashFlow</span>
          <h3>جریان نقدی فاز ساخت</h3>
          <p>کنترل ماه‌به‌ماه پرداخت CAPEX، هزینه‌های توسعه، تأخیرات، تزریق منابع، خط اعتباری و ریسک نقدینگی پیش از بهره‌برداری.</p>
        </div>
        <div className={classNames("construction-calc-state", dirty && "dirty")}>
          <strong>{dirty ? "تغییرات مدل ذخیره‌نشده است" : "مدل اصلی به‌روز است"}</strong>
          <button className="primary-button" type="button" disabled={disabled} onClick={() => applyConstructionAssumptions(draft)}>ذخیره و محاسبه</button>
          <button className="secondary-button" type="button" onClick={() => setDraft(clone(normalizedSource))}>بازنشانی</button>
        </div>
      </section>

      <section className="construction-kpi-strip">
        <ConstructionKpiCard label="تعداد ماه‌های تحلیل" value={`${formatNumber(analysisMonths)} ماه`} note={`دامنه مجاز: ${formatNumber(monthOptions[0])} تا ${formatNumber(monthOptions.at(-1))}`} />
        <ConstructionKpiCard label="بافر" value={`${formatNumber(calculateBufferMonths(analysisMonths, developmentMonths))} ماه`} note="تحلیل - مدت توسعه" locked />
        <ConstructionKpiCard label="CAPEX نهایی" value={formatMoney(outputs.capex.totalCapex, project)} note="از تب CAPEX" locked />
        <ConstructionKpiCard label="کل منابع قابل تزریق" value={formatMoney(resourcesAvailable, project)} note="آورده + تأمین مالی غیرسهامدار" locked />
        <ConstructionKpiCard label="حداقل مانده نقد احتیاطی" value={formatMoney(draft.minimumCashReserve, project)} note="برای جلوگیری از Cash Crunch" />
        <ConstructionKpiCard label="وضعیت نقدینگی فاز ساخت" value={kpis.finalStatus} note={firstCrunch ? `اولین هشدار: ماه ${formatNumber(firstCrunch.monthNumber)}` : "بدون هشدار نقدینگی"} tone={kpis.finalStatus.includes("نیازمند") || kpis.finalStatus.includes("خطا") ? "bad" : kpis.finalStatus.includes("خط") ? "warn" : "good"} />
      </section>

      <section className="phase-section-card construction-section">
        <header>
          <div><span>Section 1</span><h3>ورودی‌ها و کنترل</h3><p>ورودی‌های editable از مقادیر قفل‌شده مدل جدا شده‌اند تا اتصال به Excel و تب‌های دیگر شفاف بماند.</p></div>
        </header>
        <div className="phase-card-body">
          <div className="construction-control-grid">
            <label className="phase-input">
              <span className="phase-input-label"><b>تعداد ماه‌های تحلیل</b><small>ProjectSetup02!U29 + buffer</small></span>
              <select value={draft.analysisMonths ?? analysisMonths} disabled={disabled} onChange={(event) => setPatch({ analysisMonths: Number(event.target.value), bufferMonths: calculateBufferMonths(Number(event.target.value), developmentMonths) })}>
                {monthOptions.map((month) => <option key={month} value={month}>{formatNumber(month)} ماه</option>)}
              </select>
            </label>
            <LockedMetric label="بافر" value={`${formatNumber(preview.controls.bufferMonths)} ماه`} source="محاسبه‌شده" />
            <LockedMetric label="CAPEX نهایی" value={formatMoney(outputs.capex.totalCapex, project)} source="از تب CAPEX" />
            <LockedMetric label="سهم هزینه ارزی از CAPEX" value={`${formatPercent(preview.controls.fxCostShare)} · ${formatMoney(outputs.capex.fxCapex, project)}`} source="از تب CAPEX" />
            <LockedMetric label="سهم هزینه ریالی از CAPEX" value={`${formatPercent(preview.controls.rialCostShare)} · ${formatMoney(outputs.capex.rialCapex, project)}`} source="از تب CAPEX" />
            <LockedMetric label="کل آورده قابل تزریق سهامدار" value={formatMoney(preview.controls.shareholderInjectionAvailable, project)} source="از تب تأمین مالی" />
            <LockedMetric label="کل تأمین مالی غیرسهامدار" value={formatMoney(preview.controls.nonEquityFundingAvailable, project)} source="از تب تأمین مالی" />
            <PercentInput label="نرخ تورم ماهانه" value={draft.monthlyInflationRate ?? 0} onChange={(value) => setPatch({ monthlyInflationRate: Number(value ?? 0) })} disabled={disabled} help={`پیشنهادی از نرخ سالانه: ${formatPercent(calculateMonthlyRateFromAnnual(macro.inflationRate))}`} />
            <PercentInput label="نرخ رشد ارز ماهانه" value={draft.monthlyFxGrowthRate ?? 0} onChange={(value) => setPatch({ monthlyFxGrowthRate: Number(value ?? 0) })} disabled={disabled} help={`پیشنهادی از رشد سالانه ارز: ${formatPercent(calculateMonthlyRateFromAnnual(macro.fxGrowthRate))}`} />
            <CurrencyInput label="هزینه تأخیر ماهانه" value={draft.delayMonthlyCost ?? 0} onChange={(value) => setPatch({ delayMonthlyCost: Number(value ?? 0) })} disabled={disabled} source="ConstructionCashFlow!U36" />
            <CurrencyInput label="حداقل مانده نقد احتیاطی" value={draft.minimumCashReserve} onChange={(value) => setPatch({ minimumCashReserve: Number(value ?? 0) })} disabled={disabled} source="ConstructionCashFlow!U37" />
            <ToggleInput label="خط اعتباری توسعه فعال است؟" value={draft.creditLineEnabled} onChange={(value) => setPatch({ creditLineEnabled: Boolean(value) })} disabled={disabled} source="ConstructionCashFlow!U42" />
            <PercentInput label="نرخ خط اعتباری توسعه" value={draft.creditLineRate} onChange={(value) => setPatch({ creditLineRate: Number(value ?? 0) })} disabled={disabled || !draft.creditLineEnabled} source="ConstructionCashFlow!U43" />
            <CurrencyInput label="سقف خط اعتباری توسعه" value={draft.creditLineCap ?? 0} onChange={(value) => setPatch({ creditLineCap: Number(value ?? 0) })} disabled={disabled || !draft.creditLineEnabled} help="صفر یعنی سقف جداگانه اعمال نمی‌شود." />
            <PercentInput label="کارمزد خط اعتباری" value={draft.creditLineFeeRate ?? 0} onChange={(value) => setPatch({ creditLineFeeRate: Number(value ?? 0) })} disabled={disabled || !draft.creditLineEnabled} />
            <PercentInput label="نرخ تعدیل ناشی از تأخیر" value={draft.delayAdjustmentRate ?? 0} onChange={(value) => setPatch({ delayAdjustmentRate: Number(value ?? 0) })} disabled={disabled} source="ConstructionCashFlow!U47" />
            <NumberInput label="مدت تأخیر مجاز" value={draft.allowedDelayMonths ?? 0} onChange={(value) => setPatch({ allowedDelayMonths: Number(value ?? 0) })} disabled={disabled} help="ماه" source="ConstructionCashFlow!U48" />
            <div className={classNames("construction-payment-check", paymentStatus === "OK" ? "ok" : "error")}>
              <span>جمع درصد پرداخت</span>
              <strong>{formatPercent(paymentPercent)}</strong>
              <small>{paymentStatus}</small>
            </div>
          </div>
        </div>
      </section>

      <section className="phase-section-card construction-section">
        <header><div><span>Section 2</span><h3>برنامه پرداخت CAPEX</h3><p>پرداخت‌ها به ماه‌های منتخب وصل‌اند و در جدول نهایی با تورم و رشد ارز تعدیل می‌شوند.</p></div></header>
        <div className="phase-card-body">
          <div className="construction-milestone-grid">
            {(draft.capexMilestones ?? []).map((milestone) => (
              <article key={milestone.id} className={classNames(!milestone.active && "muted")}>
                <header>
                  <div><span>Milestone</span><strong>{milestone.title}</strong></div>
                  <ToggleInput label="فعال" value={milestone.active} onChange={(value) => setMilestones(updateMilestone(draft.capexMilestones ?? [], milestone.id, { active: Boolean(value) }))} disabled={disabled} />
                </header>
                <PercentInput label={`${milestone.title} (%)`} value={milestone.percent} onChange={(value) => setMilestones(updateMilestone(draft.capexMilestones ?? [], milestone.id, { percent: Number(value ?? 0), active: Number(value ?? 0) > 0 }))} disabled={disabled} />
                {milestone.percent > 0 ? (
                  <label className="phase-input">
                    <span className="phase-input-label"><b>ماه پرداخت {milestone.title}</b></span>
                    <select value={milestone.paymentMonth ?? 1} disabled={disabled || !milestone.active} onChange={(event) => setMilestones(updateMilestone(draft.capexMilestones ?? [], milestone.id, { paymentMonth: Number(event.target.value) }))}>
                      {allMonths.map((month) => <option key={month} value={month}>ماه {formatNumber(month)}</option>)}
                    </select>
                  </label>
                ) : <p className="soft-note">درصد صفر است؛ انتخاب ماه غیرفعال می‌شود.</p>}
              </article>
            ))}
          </div>
          <div className="construction-timeline">
            {allMonths.map((month) => {
              const milestones = (draft.capexMilestones ?? []).filter((item) => item.active && item.percent > 0 && item.paymentMonth === month);
              return (
                <div key={month} className={milestones.length ? "has-payment" : ""}>
                  <span>{formatNumber(month)}</span>
                  {milestones.map((item) => <b key={item.id}>{item.title}</b>)}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="phase-section-card construction-section">
        <header>
          <div><span>Section 3</span><h3>هزینه‌های ماهانه فاز ساخت</h3><p>هر ردیف ماه‌های پرداخت، شاخص تورم/ارز و نحوه توزیع خودش را دارد.</p></div>
          <button className="secondary-button" type="button" onClick={addCustomCost} disabled={disabled}>افزودن هزینه جدید</button>
        </header>
        <div className="phase-card-body table-wrap xl">
          <table className="construction-cost-table">
            <thead><tr><th>وضعیت</th><th>عنوان هزینه</th><th>مبلغ پایه</th><th>ماهانه است؟</th><th>ماه‌های پرداخت</th><th>تورم</th><th>ارز</th><th>سهم ارزی</th><th>سهم ریالی</th><th>توزیع</th><th>توضیح</th><th>حذف</th></tr></thead>
            <tbody>{(draft.costItems ?? []).map((item) => (
              <tr key={item.id}>
                <td><input type="checkbox" checked={item.active} disabled={disabled} onChange={(event) => setCostItems(updateCostItem(draft.costItems ?? [], item.id, { active: event.target.checked }))} /></td>
                <td><input value={item.title} disabled={disabled || !item.isCustom} onChange={(event) => setCostItems(updateCostItem(draft.costItems ?? [], item.id, { title: event.target.value }))} /></td>
                <td><input type="number" step="any" value={item.baseAmount} disabled={disabled} onChange={(event) => setCostItems(updateCostItem(draft.costItems ?? [], item.id, { baseAmount: Number(event.target.value) }))} /></td>
                <td><input type="checkbox" checked={item.isMonthly} disabled={disabled} onChange={(event) => setCostItems(updateCostItem(draft.costItems ?? [], item.id, { isMonthly: event.target.checked, distributionMode: event.target.checked ? "repeatMonthly" : item.distributionMode }))} /></td>
                <td><MonthChips months={allMonths} selected={item.selectedMonths} disabled={disabled} onChange={(months) => setCostItems(updateCostItem(draft.costItems ?? [], item.id, { selectedMonths: months }))} /></td>
                <td><input type="checkbox" checked={item.inflationIndexed} disabled={disabled} onChange={(event) => setCostItems(updateCostItem(draft.costItems ?? [], item.id, { inflationIndexed: event.target.checked }))} /></td>
                <td><input type="checkbox" checked={item.fxIndexed} disabled={disabled} onChange={(event) => setCostItems(updateCostItem(draft.costItems ?? [], item.id, { fxIndexed: event.target.checked }))} /></td>
                <td><input type="number" step="0.01" value={item.fxShare * 100} disabled={disabled} onChange={(event) => setCostItems(updateCostItem(draft.costItems ?? [], item.id, { fxShare: Number(event.target.value) / 100, rialShare: Math.max(0, 1 - Number(event.target.value) / 100) }))} /></td>
                <td><input type="number" step="0.01" value={item.rialShare * 100} disabled={disabled} onChange={(event) => setCostItems(updateCostItem(draft.costItems ?? [], item.id, { rialShare: Number(event.target.value) / 100, fxShare: Math.max(0, 1 - Number(event.target.value) / 100) }))} /></td>
                <td><select value={item.distributionMode} disabled={disabled || item.isMonthly} onChange={(event) => setCostItems(updateCostItem(draft.costItems ?? [], item.id, { distributionMode: event.target.value as CostDistributionMode }))}>{Object.entries(distributionLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></td>
                <td><input value={item.description ?? ""} disabled={disabled} onChange={(event) => setCostItems(updateCostItem(draft.costItems ?? [], item.id, { description: event.target.value }))} /></td>
                <td><button className="text-button danger" type="button" disabled={disabled || !item.isCustom} onClick={() => setCostItems((draft.costItems ?? []).filter((row) => row.id !== item.id))}>حذف</button></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </section>

      <section className="construction-two-col">
        <article className="phase-section-card construction-section">
          <header><div><span>Section 4</span><h3>تاخیرات و ریسک‌های فاز ساخت</h3><p>داده‌های تأخیر از CAPEX/سناریو به‌صورت قفل‌شده نمایش داده می‌شود و اثر قابل اعمال در جدول ماهانه می‌نشیند.</p></div></header>
          <div className="phase-card-body construction-risk-grid">
            <LockedMetric label="تاخیر واردشده از تب CAPEX" value={`${formatNumber(delayFromCapex)} ماه`} source="از تب CAPEX" />
            <ToggleInput label="سناریوی تأخیر فعال است؟" value={draft.delayScenarioEnabled} onChange={(value) => setPatch({ delayScenarioEnabled: Boolean(value) })} disabled={disabled} source="ConstructionCashFlow!U50" />
            <NumberInput label="تأخیر سناریویی" value={draft.actualDelayMonths ?? 0} onChange={(value) => setPatch({ actualDelayMonths: Number(value ?? 0) })} disabled={disabled || !draft.delayScenarioEnabled} help="ماه" source="ConstructionCashFlow!U51" />
            <LockedMetric label="تأخیر قابل اعمال" value={`${formatNumber(preview.controls.effectiveDelayMonths)} ماه`} source="محاسبه‌شده" />
            <LockedMetric label="مازاد تأخیر نسبت به مجاز" value={`${formatNumber(Math.max(0, finite(draft.actualDelayMonths) - finite(draft.allowedDelayMonths)))} ماه`} source="محاسبه‌شده" />
            <LockedMetric label="اثر تأخیر بر CAPEX/هزینه ماهانه" value={formatMoney(kpis.totalDelayCost, project)} source="محاسبه‌شده" />
          </div>
        </article>

        <article className="phase-section-card construction-section">
          <header><div><span>Section 5</span><h3>منابع نقدینگی فاز ساخت</h3><p>زمان‌بندی آورده، برداشت غیرسهامدار و خط اعتباری توسعه کنترل می‌شود.</p></div></header>
          <div className="phase-card-body construction-risk-grid">
            <SelectInput label="روش زمان‌بندی تزریق آورده" value={draft.equityTimingMethod} options={financingTimingOptions} onChange={(value) => setPatch({ equityTimingMethod: String(value) })} disabled={disabled} source="ConstructionCashFlow!U40" />
            <SelectInput label="روش زمان‌بندی برداشت تأمین مالی" value={draft.debtTimingMethod} options={debtTimingOptions} onChange={(value) => setPatch({ debtTimingMethod: String(value) })} disabled={disabled} source="ConstructionCashFlow!U41" />
            <LockedMetric label="آورده دریافت‌شده" value={formatMoney(kpis.totalShareholderInjection, project)} source="محاسبه‌شده" />
            <LockedMetric label="تأمین مالی غیرسهامدار دریافت‌شده" value={formatMoney(kpis.totalNonEquityFundingDrawdown, project)} source="محاسبه‌شده" />
            <LockedMetric label="استفاده از خط اعتباری" value={formatMoney(kpis.totalCreditLineDraw, project)} source="محاسبه‌شده" />
            <LockedMetric label="هزینه مالی خط اعتباری" value={formatMoney(kpis.totalCreditLineFinanceCost, project)} source="محاسبه‌شده" />
          </div>
        </article>
      </section>

      <section className="phase-section-card construction-section construction-table-card">
        <header><div><span>Section 6</span><h3>جدول نهایی جریان نقدی ماهانه فاز ساخت</h3><p>هر ردیف یک ماه تحلیل است؛ ستون‌های وضعیت، Cash Crunch و خط اعتباری برای بررسی CFO/بانک برجسته شده‌اند.</p></div></header>
        <div className="phase-card-body table-wrap xl">
          <table className="construction-final-table">
            <thead><tr>{[
              "شماره ماه", "تاریخ ماه", "سال تقویمی", "سال مدل", "ماه توسعه", "وضعیت ماه", "CAPEX برنامه‌ای", "ضریب تورم", "ضریب ارز", "CAPEX تعدیل‌شده", "تیم توسعه", "پیمانکار", "مشاور فنی", "سرور", "لایسنس خاص", "API", "تست", "امنیت", "QA", "استقرار", "آموزش", "مستندسازی", "هزینه‌های سفارشی", "هزینه تأخیر", "سایر خروجی‌ها", "کل خروج نقدی", "آورده سهامدار", "برداشت تأمین مالی", "خط اعتباری توسعه", "کل ورود نقدی", "کسری/مازاد ماهانه", "مانده نقد تجمعی", "حداقل نقد موردنیاز", "کسری نقد", "پرچم Cash Crunch", "مانده خط اعتباری", "هزینه مالی خط اعتباری", "توضیح ماه",
            ].map((head) => <th key={head}>{head}</th>)}</tr></thead>
            <tbody>{rows.map((row) => (
              <tr key={row.monthNumber} className={classNames(row.cashCrunchFlag !== "OK" && "cash-warning", row.monthStatus === "delay" && "delay-row")}>
                <td>{formatNumber(row.monthNumber)}</td>
                <td>{row.monthDate}</td>
                <td>{formatNumber(row.calendarYear)}</td>
                <td>{formatNumber(row.modelYear)}</td>
                <td>{displayMonth(row.developmentMonth)}</td>
                <td><span className={`month-status ${row.monthStatus}`}>{monthStatusLabel[row.monthStatus ?? "development"]}</span></td>
                <td>{formatMoney(row.plannedCapex, project)}</td>
                <td>{formatNumber(row.inflationFactor)}</td>
                <td>{formatNumber(row.fxFactor)}</td>
                <td>{formatMoney(row.adjustedCapex, project)}</td>
                <td>{formatMoney(row.costByItem?.["development-team"] ?? 0, project)}</td>
                <td>{formatMoney(row.costByItem?.contractor ?? 0, project)}</td>
                <td>{formatMoney(row.costByItem?.["technical-consultant"] ?? 0, project)}</td>
                <td>{formatMoney(row.costByItem?.server ?? 0, project)}</td>
                <td>{formatMoney(row.costByItem?.["special-license"] ?? 0, project)}</td>
                <td>{formatMoney(row.costByItem?.api ?? 0, project)}</td>
                <td>{formatMoney(row.costByItem?.test ?? 0, project)}</td>
                <td>{formatMoney(row.costByItem?.security ?? 0, project)}</td>
                <td>{formatMoney(row.costByItem?.qa ?? 0, project)}</td>
                <td>{formatMoney(row.costByItem?.deployment ?? 0, project)}</td>
                <td>{formatMoney(row.costByItem?.training ?? 0, project)}</td>
                <td>{formatMoney(row.costByItem?.documentation ?? 0, project)}</td>
                <td>{formatMoney(row.customCosts ?? 0, project)}</td>
                <td>{formatMoney(row.delayCost, project)}</td>
                <td>{formatMoney(row.otherCashOutflow, project)}</td>
                <td><strong>{formatMoney(row.totalCashOutflow, project)}</strong></td>
                <td>{formatMoney(row.shareholderInjection ?? row.equityInjection, project)}</td>
                <td>{formatMoney(row.nonEquityFundingDrawdown ?? row.debtDrawdown, project)}</td>
                <td>{formatMoney(row.creditLineDraw ?? row.overdraft, project)}</td>
                <td>{formatMoney(row.totalCashInflow, project)}</td>
                <td className={moneyClass(row.netMonthlyCashFlow ?? row.monthlySurplusDeficit)}>{formatMoney(row.netMonthlyCashFlow ?? row.monthlySurplusDeficit, project)}</td>
                <td className={moneyClass(row.endingCash)}>{formatMoney(row.endingCash, project)}</td>
                <td>{formatMoney(row.minimumCashRequired, project)}</td>
                <td className="negative">{formatMoney(row.cashShortfall ?? 0, project)}</td>
                <td><span className={row.cashCrunchFlag === "OK" ? "ok-pill" : "risk-pill"}>{row.cashCrunchFlag}</span></td>
                <td>{formatMoney(row.creditLineBalance ?? 0, project)}</td>
                <td>{formatMoney(row.creditLineFinanceCost ?? 0, project)}</td>
                <td>{row.monthNote || "-"}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </section>

      <section className="phase-section-card construction-section">
        <header><div><span>Section 7</span><h3>خروجی‌ها و هشدارهای مدیریتی</h3><p>KPIها و کنترل‌های خطا از جدول ماهانه ساخته می‌شوند.</p></div></header>
        <div className="phase-card-body">
          <div className="construction-output-grid">
            <ConstructionKpiCard label="کل خروج نقدی فاز ساخت" value={formatMoney(kpis.totalCashOutflow, project)} />
            <ConstructionKpiCard label="کل CAPEX تعدیل‌شده" value={formatMoney(kpis.totalAdjustedCapex, project)} />
            <ConstructionKpiCard label="کل هزینه‌های ماهانه" value={formatMoney(kpis.totalMonthlyCosts, project)} />
            <ConstructionKpiCard label="کل هزینه تأخیر" value={formatMoney(kpis.totalDelayCost, project)} />
            <ConstructionKpiCard label="کل آورده دریافت‌شده" value={formatMoney(kpis.totalShareholderInjection, project)} />
            <ConstructionKpiCard label="کل تأمین مالی غیرسهامدار" value={formatMoney(kpis.totalNonEquityFundingDrawdown, project)} />
            <ConstructionKpiCard label="کل استفاده از خط اعتباری" value={formatMoney(kpis.totalCreditLineDraw, project)} tone={kpis.totalCreditLineDraw > 0 ? "warn" : "good"} />
            <ConstructionKpiCard label="کل هزینه مالی خط اعتباری" value={formatMoney(kpis.totalCreditLineFinanceCost, project)} />
            <ConstructionKpiCard label="بیشترین کسری نقدینگی" value={formatMoney(kpis.maxCashDeficit, project)} tone={kpis.maxCashDeficit > 0 ? "bad" : "good"} />
            <ConstructionKpiCard label="ماه وقوع بیشترین کسری" value={kpis.peakDeficitMonth ? `ماه ${formatNumber(kpis.peakDeficitMonth)}` : "ندارد"} />
            <ConstructionKpiCard label="تعداد ماه‌های Cash Crunch" value={`${formatNumber(kpis.cashCrunchMonths)} ماه`} tone={kpis.cashCrunchMonths > 0 ? "warn" : "good"} />
            <ConstructionKpiCard label="حداقل مانده نقد مشاهده‌شده" value={formatMoney(kpis.minimumObservedCash, project)} />
          </div>
          <div className="construction-control-checks">
            {controlChecks.map((item) => (
              <article key={item.id} className={controlTone(item.status)}>
                <span>{item.status}</span>
                <div><strong>{item.title}</strong><p>{item.message}</p></div>
              </article>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
