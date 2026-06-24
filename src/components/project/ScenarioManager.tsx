"use client";

import { useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { classNames, formatMoney, formatNumber, formatPercent } from "@/lib/format";
import { useProject } from "@/store/project-context";

type ScenarioColumnKey = "base" | "pessimistic" | "inflationShock";
type MatrixValueType = "percent" | "number" | "days" | "months" | "money" | "risk" | "text";

type ScenarioColumn = {
  key: ScenarioColumnKey;
  label: string;
};

type ScenarioMatrixRow = {
  id: string;
  label: string;
  valueType: MatrixValueType;
  values: Record<ScenarioColumnKey, number | string>;
  source: string;
};

type TimingState = {
  startDate: string;
  endDate: string;
  duration: number;
  effectType: "فوری" | "تدریجی" | "دائمی" | "موقت";
  effectSlope: "فوری" | "تدریجی" | "پلکانی";
  applicationPeriod: "سالانه" | "ماهانه";
};

const columns: ScenarioColumn[] = [
  { key: "base", label: "ورودی پایه" },
  { key: "pessimistic", label: "ورودی بدبینانه" },
  { key: "inflationShock", label: "ورودی شوک‌تورمی" },
];

const riskLevels = ["پایین", "متوسط", "بالا", "خیلی بالا"] as const;
const effectTypes: TimingState["effectType"][] = ["فوری", "تدریجی", "دائمی", "موقت"];
const effectSlopes: TimingState["effectSlope"][] = ["فوری", "تدریجی", "پلکانی"];
const applicationPeriods: TimingState["applicationPeriod"][] = ["سالانه", "ماهانه"];

const finite = (value: number | null | undefined) => Number.isFinite(value ?? NaN) ? Number(value) : 0;
const addYearsIso = (date: string, years: number) => {
  const next = new Date(`${date}T00:00:00`);
  if (Number.isNaN(next.getTime())) return date;
  next.setFullYear(next.getFullYear() + years);
  return next.toISOString().slice(0, 10);
};

function formatScenarioValue(value: number | string, valueType: MatrixValueType) {
  if (typeof value === "string") return value;
  if (valueType === "percent") return formatPercent(value);
  if (valueType === "days") return `${formatNumber(value)} روز`;
  if (valueType === "months") return `${formatNumber(value)} ماه`;
  if (valueType === "money") return formatNumber(value);
  return formatNumber(value);
}

function MatrixInput({
  row,
  column,
  onChange,
}: {
  row: ScenarioMatrixRow;
  column: ScenarioColumn;
  onChange: (rowId: string, column: ScenarioColumnKey, value: number | string) => void;
}) {
  const value = row.values[column.key];
  if (row.valueType === "risk") {
    return (
      <select
        className="scenario-table-input risk-select"
        onChange={(event) => onChange(row.id, column.key, event.target.value)}
        value={String(value)}
      >
        {riskLevels.map((level) => <option key={level} value={level}>{level}</option>)}
      </select>
    );
  }
  if (row.valueType === "text") {
    return (
      <input
        className="scenario-table-input"
        onChange={(event) => onChange(row.id, column.key, event.target.value)}
        type="text"
        value={String(value)}
      />
    );
  }

  const shown = row.valueType === "percent" ? finite(Number(value)) * 100 : finite(Number(value));
  return (
    <input
      className="scenario-table-input"
      onChange={(event) => {
        const next = Number(event.target.value);
        onChange(row.id, column.key, Number.isFinite(next) ? (row.valueType === "percent" ? next / 100 : next) : 0);
      }}
      step={row.valueType === "percent" ? "0.01" : "any"}
      type="number"
      value={shown}
    />
  );
}

function ScenarioMatrix({
  title,
  subtitle,
  rows,
  onChange,
  compact = false,
}: {
  title: string;
  subtitle: string;
  rows: ScenarioMatrixRow[];
  onChange: (rowId: string, column: ScenarioColumnKey, value: number | string) => void;
  compact?: boolean;
}) {
  return (
    <section className="scenario-matrix-card">
      <header>
        <div>
          <span>{subtitle}</span>
          <strong>{title}</strong>
        </div>
      </header>
      <div className="table-wrap scenario-table-wrap">
        <table className={classNames("scenario-matrix-table", compact && "compact")}>
          <thead>
            <tr>
              <th>متغیر</th>
              {columns.map((column) => <th key={column.key}>{column.label}</th>)}
              <th>منبع</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>
                  <strong>{row.label}</strong>
                </td>
                {columns.map((column) => (
                  <td key={column.key}>
                    <MatrixInput column={column} onChange={onChange} row={row} />
                  </td>
                ))}
                <td><code>{row.source}</code></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function ScenarioManager() {
  const { activeScenario, outputs, project, runCalculation, selectScenario, addScenario, duplicateScenario, updateScenario, deleteScenario } = useProject();
  const assumptions = activeScenario.assumptions;
  const macro = assumptions.macro;
  const capexItem = assumptions.capex.items[0];
  const [newScenarioName, setNewScenarioName] = useState("سناریوی جدید");
  const [timing, setTiming] = useState<TimingState>(() => ({
    startDate: project.operationStartDate,
    endDate: addYearsIso(project.operationStartDate, project.modelHorizonYears),
    duration: project.modelHorizonYears,
    effectType: "تدریجی",
    effectSlope: "پلکانی",
    applicationPeriod: "سالانه",
  }));

  const initialShockRows = useMemo<ScenarioMatrixRow[]>(() => [
    {
      id: "general-inflation",
      label: "تورم عمومی",
      valueType: "percent",
      source: "MarcoAssumptions05!V19",
      values: {
        base: macro.inflationGeneralAnnual || macro.inflationRate,
        pessimistic: (macro.inflationGeneralAnnual || macro.inflationRate) + 0.08,
        inflationShock: (macro.inflationGeneralAnnual || macro.inflationRate) + 0.18,
      },
    },
    {
      id: "sales-price-growth",
      label: "رشد قیمت فروش",
      valueType: "percent",
      source: "MarcoAssumptions05!V20",
      values: {
        base: macro.salesPriceGrowth,
        pessimistic: Math.max(-0.5, macro.salesPriceGrowth - 0.03),
        inflationShock: macro.salesPriceGrowth + 0.1,
      },
    },
    {
      id: "wage-growth",
      label: "رشد دستمزد",
      valueType: "percent",
      source: "MarcoAssumptions05!V21",
      values: { base: macro.wageGrowth, pessimistic: macro.wageGrowth + 0.06, inflationShock: macro.wageGrowth + 0.14 },
    },
    {
      id: "energy-growth",
      label: "رشد انرژی",
      valueType: "percent",
      source: "MarcoAssumptions05!V22",
      values: { base: macro.energyGrowth, pessimistic: macro.energyGrowth + 0.08, inflationShock: macro.energyGrowth + 0.18 },
    },
    {
      id: "raw-material-growth",
      label: "رشد مواد اولیه",
      valueType: "percent",
      source: "MarcoAssumptions05!V23",
      values: { base: macro.rawMaterialGrowth, pessimistic: macro.rawMaterialGrowth + 0.08, inflationShock: macro.rawMaterialGrowth + 0.18 },
    },
    {
      id: "official-fx",
      label: "نرخ ارز رسمی",
      valueType: "money",
      source: "MarcoAssumptions05!V33",
      values: { base: macro.officialFxRate, pessimistic: macro.officialFxRate * 1.2, inflationShock: macro.officialFxRate * 1.35 },
    },
    {
      id: "free-fx",
      label: "نرخ ارز آزاد",
      valueType: "money",
      source: "MarcoAssumptions05!V34",
      values: { base: macro.freeMarketFxRate, pessimistic: macro.freeMarketFxRate * 1.25, inflationShock: macro.freeMarketFxRate * 1.45 },
    },
    {
      id: "remittance-fx",
      label: "نرخ ارز حواله‌ای",
      valueType: "money",
      source: "MarcoAssumptions05!V35",
      values: { base: macro.remittanceFxRate, pessimistic: macro.remittanceFxRate * 1.22, inflationShock: macro.remittanceFxRate * 1.4 },
    },
    {
      id: "execution-delay",
      label: "مدت تاخیر اجرا",
      valueType: "months",
      source: "ScenarioManager06!T28",
      values: { base: finite(capexItem?.delayMonths), pessimistic: finite(capexItem?.delayMonths) + 6, inflationShock: finite(capexItem?.delayMonths) + 3 },
    },
    {
      id: "capex-increase",
      label: "افزایش CAPEX",
      valueType: "percent",
      source: "Capex12!U56",
      values: { base: finite(capexItem?.contingencyRate), pessimistic: finite(capexItem?.contingencyRate) + 0.12, inflationShock: finite(capexItem?.contingencyRate) + 0.18 },
    },
    {
      id: "sales-volume-drop",
      label: "افت حجم فروش",
      valueType: "percent",
      source: "ScenarioManager06!T34",
      values: { base: 0, pessimistic: 0.12, inflationShock: 0.05 },
    },
    {
      id: "capacity-drop",
      label: "افت ظرفیت بهره‌برداری",
      valueType: "percent",
      source: "CapacityProduction09!Q20:Q22",
      values: { base: 0, pessimistic: 0.1, inflationShock: 0.04 },
    },
    {
      id: "receivable-days",
      label: "دوره وصول مطالبات",
      valueType: "days",
      source: "WorkingCapital13!R10",
      values: {
        base: assumptions.workingCapital.receivableDays,
        pessimistic: assumptions.workingCapital.receivableDays + 30,
        inflationShock: assumptions.workingCapital.receivableDays + 15,
      },
    },
    {
      id: "payable-days",
      label: "دوره پرداخت بدهی",
      valueType: "days",
      source: "WorkingCapital13!R11",
      values: {
        base: assumptions.workingCapital.payableDays,
        pessimistic: Math.max(0, assumptions.workingCapital.payableDays - 10),
        inflationShock: assumptions.workingCapital.payableDays,
      },
    },
    {
      id: "loan-rate",
      label: "نرخ بهره وام",
      valueType: "percent",
      source: "Financing14!R12",
      values: { base: assumptions.financing.interestRate, pessimistic: assumptions.financing.interestRate + 0.05, inflationShock: assumptions.financing.interestRate + 0.08 },
    },
    {
      id: "tax-rate",
      label: "نرخ مالیات",
      valueType: "percent",
      source: "MarcoAssumptions05!V47",
      values: { base: macro.corporateTaxRate, pessimistic: macro.corporateTaxRate, inflationShock: macro.corporateTaxRate },
    },
    {
      id: "finance-cost",
      label: "هزینه تامین مالی",
      valueType: "percent",
      source: "MarcoAssumptions05!V70",
      values: { base: macro.financeRate, pessimistic: macro.financeRate + 0.04, inflationShock: macro.financeRate + 0.07 },
    },
  ], [assumptions.financing.interestRate, assumptions.workingCapital.payableDays, assumptions.workingCapital.receivableDays, capexItem, macro]);

  const [shockRows, setShockRows] = useState<ScenarioMatrixRow[]>(initialShockRows);

  const [weightRows, setWeightRows] = useState<ScenarioMatrixRow[]>(() => [
    {
      id: "scenario-intensity",
      label: "ضریب شدت کل سناریو",
      valueType: "number",
      source: "ScenarioManager06!U42",
      values: { base: 1, pessimistic: 1.35, inflationShock: 1.55 },
    },
    {
      id: "risk-factor",
      label: "ضریب ریسک سناریو",
      valueType: "number",
      source: "ScenarioManager06!U43",
      values: { base: 1, pessimistic: 1.4, inflationShock: 1.6 },
    },
    {
      id: "probability",
      label: "احتمال وقوع",
      valueType: "percent",
      source: "ScenarioManager06!U44",
      values: { base: 0.5, pessimistic: 0.3, inflationShock: 0.2 },
    },
    {
      id: "risk-level",
      label: "سطح ریسک",
      valueType: "risk",
      source: "ScenarioManager06!U45",
      values: { base: "متوسط", pessimistic: "بالا", inflationShock: "خیلی بالا" },
    },
    {
      id: "funding-basis",
      label: "مبنای تامین",
      valueType: "text",
      source: "ScenarioManager06!U46",
      values: { base: "مدل پایه", pessimistic: "وام محافظه‌کارانه", inflationShock: "ذخیره نقدی و تعدیل قیمت" },
    },
    {
      id: "source",
      label: "منبع",
      valueType: "text",
      source: "ScenarioManager06!U47",
      values: { base: "edition19_4June.xlsx", pessimistic: "مدل ریسک داخلی", inflationShock: "شاخص‌های تورمی" },
    },
  ]);

  const updateRows = (
    setter: Dispatch<SetStateAction<ScenarioMatrixRow[]>>,
    rowId: string,
    column: ScenarioColumnKey,
    value: number | string,
  ) => {
    setter((current) => current.map((row) => (
      row.id === rowId
        ? { ...row, values: { ...row.values, [column]: value } }
        : row
    )));
  };

  const activeCount = project.scenarios.filter((scenario) => scenario.status === "active").length;
  const baseNpv = outputs.valuation.npv;
  const minDscr = outputs.financing.minimumDscr;

  return (
    <div className="scenario-workbench scenario-redesign">
      <section className="scenario-hero">
        <div>
          <span>ScenarioManager06</span>
          <h3>مدیریت سناریو</h3>
          <p>تعریف سناریوهای پایه، بدبینانه و شوک‌تورمی با زمان اثر، موتور شوک، وزن‌دهی ریسک و mapping آماده برای engine سناریو.</p>
        </div>
        <div className="scenario-hero-metrics">
          <article><span>سناریوهای فعال</span><strong>{formatNumber(activeCount)}</strong></article>
          <article><span>NPV مبنا</span><strong>{formatMoney(baseNpv, project)}</strong></article>
          <article><span>حداقل DSCR</span><strong>{formatNumber(minDscr)}</strong></article>
        </div>
      </section>

      <section className="scenario-add-card">
        <div>
          <span>سناریوی سفارشی</span>
          <strong>افزودن سناریو از همین manager</strong>
        </div>
        <input value={newScenarioName} onChange={(event) => setNewScenarioName(event.target.value)} />
        <button className="primary-button" type="button" onClick={() => addScenario(newScenarioName.trim() || "سناریوی جدید")}>افزودن سناریو</button>
      </section>

      <section className="scenario-list-grid">
        {[...project.scenarios].sort((left, right) => left.priority - right.priority).map((scenario) => (
          <article
            className={classNames("scenario-list-card", activeScenario.id === scenario.id && "active", scenario.status === "inactive" && "inactive")}
            key={scenario.id}
          >
            <button type="button" onClick={() => selectScenario(scenario.id)} disabled={scenario.status === "inactive"}>
              <span>{scenario.code}</span>
              <strong>{scenario.name}</strong>
              <small>{scenario.description}</small>
              <b>{scenario.status === "active" ? "فعال" : "غیرفعال"}</b>
            </button>
            <div className="scenario-card-editor">
              <label><span>نام</span><input value={scenario.name} onChange={(event) => updateScenario(scenario.id, { name: event.target.value })} /></label>
              <label><span>کد</span><input value={scenario.code} onChange={(event) => updateScenario(scenario.id, { code: event.target.value })} /></label>
              <label>
                <span>وضعیت</span>
                <select value={scenario.status} onChange={(event) => updateScenario(scenario.id, { status: event.target.value as "active" | "inactive" })}>
                  <option value="active">فعال</option>
                  <option value="inactive">غیرفعال</option>
                </select>
              </label>
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
            <span>زمان اثر سناریو</span>
            <strong>دوره، نوع و شیب اعمال شوک</strong>
          </div>
          <button className="primary-button" onClick={runCalculation} type="button">محاسبه مجدد مدل</button>
        </header>
        <div className="scenario-timing-grid">
          <label>
            <span>تاریخ شروع اثر</span>
            <input onChange={(event) => setTiming((current) => ({ ...current, startDate: event.target.value }))} type="date" value={timing.startDate} />
          </label>
          <label>
            <span>تاریخ پایان اثر</span>
            <input onChange={(event) => setTiming((current) => ({ ...current, endDate: event.target.value }))} type="date" value={timing.endDate} />
          </label>
          <label>
            <span>مدت اثر</span>
            <input onChange={(event) => setTiming((current) => ({ ...current, duration: Number(event.target.value) }))} type="number" value={timing.duration} />
          </label>
          <label>
            <span>نوع اثر</span>
            <select onChange={(event) => setTiming((current) => ({ ...current, effectType: event.target.value as TimingState["effectType"] }))} value={timing.effectType}>
              {effectTypes.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <label>
            <span>شیب اثر</span>
            <select onChange={(event) => setTiming((current) => ({ ...current, effectSlope: event.target.value as TimingState["effectSlope"] }))} value={timing.effectSlope}>
              {effectSlopes.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <label>
            <span>دوره اعمال</span>
            <select onChange={(event) => setTiming((current) => ({ ...current, applicationPeriod: event.target.value as TimingState["applicationPeriod"] }))} value={timing.applicationPeriod}>
              {applicationPeriods.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
        </div>
      </section>

      <section className="scenario-active-card">
        <div>
          <span>سناریوی فعال در state مدل</span>
          <strong>{activeScenario.name}</strong>
          <small>{activeScenario.description}</small>
        </div>
        <label>
          <span>نام سناریو</span>
          <input
            disabled={activeScenario.isLocked}
            onChange={(event) => updateScenario(activeScenario.id, { name: event.target.value })}
            type="text"
            value={activeScenario.name}
          />
        </label>
      </section>

      <div className="scenario-matrix-layout">
        <ScenarioMatrix
          onChange={(rowId, column, value) => updateRows(setShockRows, rowId, column, value)}
          rows={shockRows}
          subtitle="Shock Engine"
          title="موتور شوک سناریو"
        />
        <ScenarioMatrix
          compact
          onChange={(rowId, column, value) => updateRows(setWeightRows, rowId, column, value)}
          rows={weightRows}
          subtitle="Weights and Sources"
          title="وزن، شدت و منبع سناریو"
        />
      </div>

      <section className="scenario-preview-card">
        <span>خلاصه قابل بررسی</span>
        <div>
          {columns.map((column) => {
            const inflationRow = shockRows.find((row) => row.id === "general-inflation");
            const probabilityRow = weightRows.find((row) => row.id === "probability");
            const riskRow = weightRows.find((row) => row.id === "risk-level");
            return (
              <article key={column.key}>
                <strong>{column.label}</strong>
                <small>تورم: {formatScenarioValue(inflationRow?.values[column.key] ?? 0, "percent")}</small>
                <small>احتمال وقوع: {formatScenarioValue(probabilityRow?.values[column.key] ?? 0, "percent")}</small>
                <b>{String(riskRow?.values[column.key] ?? "متوسط")}</b>
              </article>
            );
          })}
        </div>
        <p>
          TODO(ScenarioManager06): این ماتریس typed و editable است. اتصال نهایی هر ستون به اجرای مستقل calculation engine باید با ساخت ScenarioAssumptions مشتق‌شده و ذخیره خروجی سناریو انجام شود.
        </p>
      </section>
    </div>
  );
}
