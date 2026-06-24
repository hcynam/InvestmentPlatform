"use client";

import { memo, type ReactNode } from "react";
import { formatNumber, formatPercent } from "@/lib/format";
import type {
  CostFxExposureRow,
  FormulaTrace,
  FxMapping,
  IndustryRisk,
  MacroAssumptions,
  MarketDemandAssumptions,
  ProductivityIndicator,
  ValidationIssue,
} from "@/lib/types";
import { calculateAchievableSales, calculateFxRateByType, calculateMarketFunnel } from "@/lib/phase-one-calculations";

type InputType = "text" | "number" | "percent" | "currency" | "date" | "textarea" | "select" | "toggle";

type AssumptionInputProps = {
  label: string;
  value: string | number | boolean | null;
  onChange: (value: string | number | boolean | null) => void;
  type?: InputType;
  options?: readonly string[];
  help?: string;
  source?: string;
  error?: string;
  disabled?: boolean;
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
};

export const SectionCard = memo(function SectionCard({
  title,
  eyebrow,
  description,
  action,
  children,
  className = "",
}: {
  title: string;
  eyebrow?: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`phase-section-card ${className}`}>
      <header>
        <div>
          {eyebrow ? <span>{eyebrow}</span> : null}
          <h3>{title}</h3>
          {description ? <p>{description}</p> : null}
        </div>
        {action ? <div className="phase-card-action">{action}</div> : null}
      </header>
      <div className="phase-card-body">{children}</div>
    </section>
  );
});

export const AssumptionInput = memo(function AssumptionInput({
  label,
  value,
  onChange,
  type = "text",
  options = [],
  help,
  source,
  error,
  disabled,
  min,
  max,
  step,
  placeholder,
}: AssumptionInputProps) {
  const numericValue = typeof value === "number" ? value : value === null ? "" : String(value);
  const displayedValue = type === "percent" && typeof value === "number" ? value * 100 : numericValue;
  const updateNumeric = (raw: string) => {
    if (raw === "") {
      onChange(null);
      return;
    }
    const parsed = Number(raw);
    onChange(type === "percent" ? parsed / 100 : parsed);
  };

  return (
    <label className={`phase-input ${error ? "has-error" : ""}`}>
      <span className="phase-input-label">
        <b>{label}</b>
        {source ? <small title="سلول مرجع در فایل Excel">{source}</small> : null}
      </span>
      {type === "select" ? (
        <select value={String(value ?? "")} disabled={disabled} onChange={(event) => onChange(event.target.value)}>
          {options.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
      ) : type === "toggle" ? (
        <button
          type="button"
          className={`phase-toggle ${value ? "active" : ""}`}
          aria-pressed={Boolean(value)}
          disabled={disabled}
          onClick={() => onChange(!value)}
        >
          <i />
          <span>{value ? "بله، فعال" : "خیر، غیرفعال"}</span>
        </button>
      ) : type === "textarea" ? (
        <textarea
          value={String(value ?? "")}
          disabled={disabled}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
          rows={3}
        />
      ) : (
        <div className="phase-input-control">
          <input
            type={type === "date" ? "date" : type === "text" ? "text" : "number"}
            value={displayedValue}
            disabled={disabled}
            min={min}
            max={max}
            step={step ?? (type === "percent" ? 0.01 : type === "currency" ? 1 : "any")}
            placeholder={placeholder}
            onChange={(event) => {
              if (type === "number" || type === "percent" || type === "currency") updateNumeric(event.target.value);
              else onChange(event.target.value);
            }}
          />
          {type === "percent" ? <span>٪</span> : null}
          {type === "currency" ? <span>ریال</span> : null}
        </div>
      )}
      {help ? <em>{help}</em> : null}
      {error ? <strong className="phase-input-error">{error}</strong> : null}
    </label>
  );
});

export const PercentInput = (props: Omit<AssumptionInputProps, "type">) => <AssumptionInput {...props} type="percent" />;
export const CurrencyInput = (props: Omit<AssumptionInputProps, "type">) => <AssumptionInput {...props} type="currency" />;
export const NumberInput = (props: Omit<AssumptionInputProps, "type">) => <AssumptionInput {...props} type="number" />;
export const SelectInput = (props: Omit<AssumptionInputProps, "type">) => <AssumptionInput {...props} type="select" />;
export const ToggleInput = (props: Omit<AssumptionInputProps, "type">) => <AssumptionInput {...props} type="toggle" />;

export const EditableAssumptionTable = memo(function EditableAssumptionTable({
  rows,
}: {
  rows: Array<{
    id: string;
    label: string;
    value: number;
    onChange: (value: number) => void;
    unit: string;
    source: string;
    description: string;
    effect: string;
  }>;
}) {
  return (
    <div className="table-wrap phase-table">
      <table>
        <thead><tr><th>عنوان فرض</th><th>مقدار</th><th>واحد</th><th>منبع</th><th>توضیح</th><th>اثر در مدل</th></tr></thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td><strong>{row.label}</strong></td>
              <td><input type="number" step="0.01" value={row.value * 100} onChange={(event) => row.onChange(Number(event.target.value) / 100)} /></td>
              <td>{row.unit}</td>
              <td><code>{row.source}</code></td>
              <td>{row.description}</td>
              <td><span className="model-effect">{row.effect}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
});

export const ValidationPanel = memo(function ValidationPanel({
  errors,
  warnings,
}: {
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}) {
  const all = [...errors, ...warnings];
  return (
    <section className="phase-validation-panel">
      <header>
        <div><span>کنترل کیفیت ورودی‌ها</span><strong>{all.length ? `${formatNumber(all.length)} مورد نیازمند بررسی` : "همه کنترل‌ها معتبر است"}</strong></div>
        <div className="validation-counts"><b>{formatNumber(errors.length)} خطا</b><i>{formatNumber(warnings.length)} هشدار</i></div>
      </header>
      {all.length ? (
        <div className="validation-list">
          {all.map((item) => (
            <article key={item.id} className={item.severity}>
              <span>{item.severity === "error" ? "خطا" : item.severity === "warning" ? "هشدار" : "اطلاع"}</span>
              <div><strong>{item.message}</strong>{item.recommendation ? <p>{item.recommendation}</p> : null}</div>
              {item.sourceSheet ? <code>{item.sourceSheet}!{item.sourceCell}</code> : null}
            </article>
          ))}
        </div>
      ) : <p className="validation-ok">مقادیر فعلی با قواعد مرحله اول سازگار هستند.</p>}
    </section>
  );
});

export const FormulaTraceMini = memo(function FormulaTraceMini({ traces }: { traces: FormulaTrace[] }) {
  if (!traces.length) return null;
  return (
    <div className="formula-trace-mini">
      {traces.slice(0, 4).map((item) => (
        <article key={item.id}>
          <div><span>Formula trace</span><strong>{item.label}</strong></div>
          <code>{item.formula}</code>
          <p>{item.inputs.map((input) => `${input.label}: ${typeof input.value === "number" ? formatNumber(input.value) : input.value}`).join(" · ")}</p>
        </article>
      ))}
    </div>
  );
});

export const LockedField = memo(function LockedField({ label, value, source }: { label: string; value: string; source: string }) {
  return (
    <div className="locked-field">
      <span>{label}<small>{source}</small></span>
      <strong>{value}</strong>
      <a href="../setup">ویرایش در تنظیمات پایه</a>
    </div>
  );
});

const fxTypeLabels: Record<string, string> = {
  official: "رسمی",
  freeMarket: "آزاد",
  remittance: "حواله‌ای",
  nima: "نیما",
  negotiated: "توافقی",
  persons: "اشخاص",
  preferential: "ترجیحی",
  contractual: "ثابت قراردادی",
  manual: "دستی",
};
export const fxTypeOptions = Object.keys(fxTypeLabels);

export const FxMappingTable = memo(function FxMappingTable({
  rows,
  macro,
  onChange,
}: {
  rows: FxMapping[];
  macro: MacroAssumptions;
  onChange: (rows: FxMapping[]) => void;
}) {
  return (
    <div className="table-wrap phase-table">
      <table>
        <thead><tr><th>ماژول</th><th>نوع نرخ ارز</th><th>نرخ قابل اعمال</th><th>منبع</th></tr></thead>
        <tbody>
          {rows.map((row, index) => {
            const rate = row.fxType === "manual" ? row.manualRate ?? 0 : calculateFxRateByType(macro, row.fxType).values.rate;
            return (
              <tr key={row.id}>
                <td><strong>{row.label}</strong></td>
                <td>
                  <select value={row.fxType} onChange={(event) => {
                    const next = [...rows];
                    next[index] = { ...row, fxType: event.target.value as FxMapping["fxType"] };
                    onChange(next);
                  }}>
                    {fxTypeOptions.map((option) => <option key={option} value={option}>{fxTypeLabels[option]}</option>)}
                  </select>
                </td>
                <td>
                  {row.fxType === "manual" ? (
                    <input type="number" value={row.manualRate ?? 0} onChange={(event) => {
                      const next = [...rows];
                      next[index] = { ...row, manualRate: Number(event.target.value) };
                      onChange(next);
                    }} />
                  ) : <b>{formatNumber(rate)} ریال</b>}
                </td>
                <td><code>{row.source ?? "-"}</code></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
});

export const ProductivityIndicatorsTable = memo(function ProductivityIndicatorsTable({
  rows,
  onChange,
}: {
  rows: ProductivityIndicator[];
  onChange: (rows: ProductivityIndicator[]) => void;
}) {
  return (
    <div className="editable-list">
      <div className="table-wrap phase-table">
        <table>
          <thead><tr><th>عنوان شاخص</th><th>مقدار</th><th>واحد</th><th>توضیح</th><th /></tr></thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={row.id}>
                <td><input value={row.title} onChange={(event) => {
                  const next = [...rows]; next[index] = { ...row, title: event.target.value }; onChange(next);
                }} /></td>
                <td><input type="number" value={row.value} onChange={(event) => {
                  const next = [...rows]; next[index] = { ...row, value: Number(event.target.value) }; onChange(next);
                }} /></td>
                <td><input value={row.unit} onChange={(event) => {
                  const next = [...rows]; next[index] = { ...row, unit: event.target.value }; onChange(next);
                }} /></td>
                <td><input value={row.description} onChange={(event) => {
                  const next = [...rows]; next[index] = { ...row, description: event.target.value }; onChange(next);
                }} /></td>
                <td><button type="button" className="table-remove" disabled={rows.length === 1} onClick={() => onChange(rows.filter((item) => item.id !== row.id))}>حذف</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button type="button" className="secondary-button" onClick={() => onChange([...rows, {
        id: `productivity-${Date.now()}`,
        title: "",
        value: 0,
        unit: "",
        description: "",
      }])}>افزودن شاخص بهره‌وری</button>
    </div>
  );
});

export const CostFxExposureTable = memo(function CostFxExposureTable({
  rows,
  macro,
  onChange,
}: {
  rows: CostFxExposureRow[];
  macro: MacroAssumptions;
  onChange: (rows: CostFxExposureRow[]) => void;
}) {
  return (
    <div className="table-wrap phase-table">
      <table>
        <thead><tr><th>گروه هزینه</th><th>سهم کل هزینه</th><th>سهم ارزی</th><th>نوع نرخ</th><th>نرخ قابل اعمال</th><th>توضیح</th></tr></thead>
        <tbody>
          {rows.map((row, index) => {
            const rate = row.fxType === "manual" ? row.manualRate ?? 0 : calculateFxRateByType(macro, row.fxType).values.rate;
            const set = (patch: Partial<CostFxExposureRow>) => {
              const next = [...rows]; next[index] = { ...row, ...patch }; onChange(next);
            };
            return (
              <tr key={row.id}>
                <td><strong>{row.costGroup}</strong></td>
                <td><input type="number" step="0.1" value={row.totalCostShare * 100} onChange={(event) => set({ totalCostShare: Number(event.target.value) / 100 })} /></td>
                <td><input type="number" step="0.1" value={row.fxShare * 100} onChange={(event) => set({ fxShare: Number(event.target.value) / 100 })} /></td>
                <td><select value={row.fxType} onChange={(event) => set({ fxType: event.target.value as CostFxExposureRow["fxType"] })}>{fxTypeOptions.map((option) => <option key={option} value={option}>{fxTypeLabels[option]}</option>)}</select></td>
                <td>{row.fxType === "manual" ? <input type="number" value={row.manualRate ?? 0} onChange={(event) => set({ manualRate: Number(event.target.value) })} /> : <b>{formatNumber(rate)} ریال</b>}</td>
                <td><input value={row.description} onChange={(event) => set({ description: event.target.value })} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
});

export const RiskHeatmap = memo(function RiskHeatmap({
  risks,
  editable = false,
  onChange,
}: {
  risks: IndustryRisk[];
  editable?: boolean;
  onChange?: (risks: IndustryRisk[]) => void;
}) {
  return (
    <div className="risk-workspace">
      <div className="risk-heatmap" aria-label="نقشه حرارتی ریسک">
        {Array.from({ length: 25 }, (_, index) => {
          const probability = 5 - Math.floor(index / 5);
          const impact = (index % 5) + 1;
          const count = risks.filter((risk) => risk.probability === probability && risk.impact === impact).length;
          return <div key={index} data-score={probability * impact} title={`احتمال ${probability}، اثر ${impact}`}>{count ? <b>{count}</b> : null}</div>;
        })}
        <span className="axis-y">احتمال</span><span className="axis-x">شدت اثر</span>
      </div>
      <div className="table-wrap phase-table">
        <table>
          <thead><tr><th>ریسک</th><th>سطح</th><th>احتمال</th><th>اثر</th><th>امتیاز</th>{editable ? <><th>برنامه کاهش</th><th>اثر مدل</th></> : null}</tr></thead>
          <tbody>
            {risks.map((risk, index) => {
              const set = (patch: Partial<IndustryRisk>) => {
                if (!onChange) return;
                const next = [...risks]; next[index] = { ...risk, ...patch }; onChange(next);
              };
              return (
                <tr key={risk.id}>
                  <td><strong>{risk.title}</strong></td>
                  <td>{editable ? <select value={risk.level} onChange={(event) => set({ level: event.target.value as IndustryRisk["level"] })}>{["پایین", "متوسط", "بالا", "بحرانی"].map((value) => <option key={value}>{value}</option>)}</select> : risk.level}</td>
                  <td>{editable ? <input type="number" min="1" max="5" value={risk.probability} onChange={(event) => set({ probability: Number(event.target.value) })} /> : formatNumber(risk.probability)}</td>
                  <td>{editable ? <input type="number" min="1" max="5" value={risk.impact} onChange={(event) => set({ impact: Number(event.target.value) })} /> : formatNumber(risk.impact)}</td>
                  <td><b className="risk-score">{formatNumber(risk.probability * risk.impact)}</b></td>
                  {editable ? <><td><input value={risk.mitigation} onChange={(event) => set({ mitigation: event.target.value })} /></td><td><input value={risk.modelEffect} onChange={(event) => set({ modelEffect: event.target.value })} /></td></> : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
});

export const MarketFunnelChart = memo(function MarketFunnelChart({ market }: { market: MarketDemandAssumptions }) {
  const funnel = calculateMarketFunnel(market).values;
  const max = Math.max(1, funnel.tam);
  const rows = [
    { label: "TAM", title: "کل بازار", value: funnel.tam },
    { label: "SAM", title: "بازار قابل دسترس", value: funnel.sam },
    { label: "SOM", title: "بازار هدف", value: funnel.som },
  ];
  return (
    <div className="market-funnel">
      {rows.map((row, index) => {
        const visualWidth = index === 0 ? 100 : Math.max(32, Math.min(92, 28 + Math.sqrt(row.value / max) * 70));
        return <div key={row.label} style={{ width: `${visualWidth}%` }}><span>{row.label}</span><strong>{formatNumber(row.value)}</strong><small>{row.title}</small></div>;
      })}
    </div>
  );
});

export const AchievableSalesPanel = memo(function AchievableSalesPanel({
  market,
  onOverride,
}: {
  market: MarketDemandAssumptions;
  onOverride: (enabled: boolean, value: number | null) => void;
}) {
  const result = calculateAchievableSales(market, { supplyLimit: market.supplyConstraintValue }).values;
  return (
    <div className="achievable-panel">
      <div className="achievable-formula">
        <span>فروش قابل تحقق</span>
        <strong>{formatNumber(result.achievableSales)} {market.marketAnalysisUnit}</strong>
        <code>MIN(فروش بالقوه × دستیابی، سقف فروش، جذب بازار، محدودیت عرضه)</code>
      </div>
      <div className="constraint-grid">
        <article><span>فروش تعدیل‌شده</span><b>{formatNumber(result.potentialSales)}</b></article>
        <article><span>سقف فروش</span><b>{formatNumber(result.constraints.salesCeiling)}</b></article>
        <article><span>جذب بازار</span><b>{formatNumber(result.constraints.marketAbsorption)}</b></article>
        <article><span>محدودیت عرضه</span><b>{formatNumber(result.constraints.supplyLimit)}</b></article>
      </div>
      <label className="override-control">
        <input type="checkbox" checked={market.achievableSalesOverrideEnabled} onChange={(event) => onOverride(event.target.checked, market.achievableSalesOverride)} />
        <span>Override تخصصی فروش قابل تحقق</span>
        {market.achievableSalesOverrideEnabled ? <input type="number" value={market.achievableSalesOverride ?? result.calculatedAchievableSales} onChange={(event) => onOverride(true, Number(event.target.value))} /> : null}
      </label>
    </div>
  );
});

export const MetricStrip = memo(function MetricStrip({ metrics }: { metrics: Array<{ label: string; value: string; note?: string }> }) {
  return <div className="phase-metric-strip">{metrics.map((metric) => <article key={metric.label}><span>{metric.label}</span><strong>{metric.value}</strong>{metric.note ? <small>{metric.note}</small> : null}</article>)}</div>;
});

export const formatRate = (value: number) => formatPercent(value);
