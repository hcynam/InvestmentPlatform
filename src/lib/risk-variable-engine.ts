import type {
  FXRateType,
  Project,
  Scenario,
  ScenarioAssumptions,
  ScenarioOutputs,
  SensitivityAssumptionProvenance,
  SensitivityUnitType,
  SensitivityValidationIssue,
  SensitivityVariable,
} from "@/lib/types";

export type CoreModelOutputs = Omit<ScenarioOutputs, "monteCarlo">;

export type RiskVariableKind =
  | "salesPrice"
  | "salesVolume"
  | "revenue"
  | "capex"
  | "opex"
  | "directCosts"
  | "fxRate"
  | "inflation"
  | "discountRate"
  | "debtInterest"
  | "delay"
  | "workingCapitalDays"
  | "taxRate";

export type RiskVariableMeta = {
  label: string;
  englishLabel: string;
  sourceModule: string;
  sourcePath: string;
  defaultLow: number;
  defaultMid: number;
  defaultHigh: number;
  defaultSteps: number;
  changeType: "percent" | "absolute";
  unitType: SensitivityUnitType;
  positiveOnly: boolean;
  exposureLogic: string;
  businessArea: string;
  available: boolean;
  unavailabilityReason?: string;
};

export type ResolvedRiskVariable = {
  id: string;
  parameter?: string;
  label: string;
  englishLabel?: string;
  kind: RiskVariableKind;
  sourceModule: string;
  sourcePath: string;
  low: number;
  mid?: number;
  high: number;
  steps?: number;
  changeType: "percent" | "absolute";
  unitType: SensitivityUnitType;
  positiveOnly: boolean;
  exposureLogic: string;
  businessArea: string;
  available: boolean;
  unavailabilityReason?: string;
  description?: string;
};

const EPSILON = 1e-6;

export const riskVariableMeta: Record<RiskVariableKind, RiskVariableMeta> = {
  salesPrice: {
    label: "قیمت فروش",
    englishLabel: "Sales price",
    sourceModule: "Revenue / Market Demand",
    sourcePath: "assumptions.market.baseSalesPrice",
    defaultLow: -0.15,
    defaultMid: 0,
    defaultHigh: 0.15,
    defaultSteps: 7,
    changeType: "percent",
    unitType: "unitPrice",
    positiveOnly: true,
    exposureLogic: "قیمت فروش پایه و قیمت واحد درآمد را تغییر می‌دهد.",
    businessArea: "بازار و فروش",
    available: true,
  },
  salesVolume: {
    label: "حجم فروش قابل تحقق",
    englishLabel: "Sales volume",
    sourceModule: "Market Demand",
    sourcePath: "outputs.revenue.rows[1].salesVolume",
    defaultLow: -0.15,
    defaultMid: 0,
    defaultHigh: 0.15,
    defaultSteps: 7,
    changeType: "percent",
    unitType: "volume",
    positiveOnly: true,
    exposureLogic: "فقط مسیر تقاضا و فروش قابل تحقق را تغییر می‌دهد؛ ظرفیت فیزیکی ثابت می‌ماند.",
    businessArea: "بازار و فروش",
    available: true,
  },
  revenue: {
    label: "درآمد فروش",
    englishLabel: "Revenue",
    sourceModule: "Revenue",
    sourcePath: "outputs.revenue.rows[1].revenue",
    defaultLow: -0.15,
    defaultMid: 0,
    defaultHigh: 0.15,
    defaultSteps: 7,
    changeType: "percent",
    unitType: "totalMoney",
    positiveOnly: true,
    exposureLogic: "مالک مستقل ورودی برای درآمد در مدل فعلی وجود ندارد.",
    businessArea: "بازار و فروش",
    available: false,
    unavailabilityReason: "درآمد راننده مستقل ندارد؛ برای تحلیل از قیمت فروش یا حجم فروش قابل تحقق استفاده کنید.",
  },
  capex: {
    label: "CAPEX",
    englishLabel: "Capital expenditure",
    sourceModule: "CAPEX",
    sourcePath: "outputs.capex.totalCapex",
    defaultLow: -0.1,
    defaultMid: 0.05,
    defaultHigh: 0.2,
    defaultSteps: 7,
    changeType: "percent",
    unitType: "totalMoney",
    positiveOnly: true,
    exposureLogic: "قیمت‌ها و هزینه‌های اقلام سرمایه‌ای را مقیاس می‌کند.",
    businessArea: "سرمایه‌گذاری",
    available: true,
  },
  opex: {
    label: "OPEX",
    englishLabel: "Operating expenditure",
    sourceModule: "OPEX",
    sourcePath: "outputs.opex.rows[1].totalOpex",
    defaultLow: -0.1,
    defaultMid: 0,
    defaultHigh: 0.1,
    defaultSteps: 7,
    changeType: "percent",
    unitType: "totalMoney",
    positiveOnly: true,
    exposureLogic: "اقلام OPEX و هزینه‌های عملیاتی پایه را مقیاس می‌کند.",
    businessArea: "هزینه",
    available: true,
  },
  directCosts: {
    label: "هزینه مستقیم / COGS",
    englishLabel: "Direct costs / COGS",
    sourceModule: "Direct Costs / COGS",
    sourcePath: "outputs.directCosts.rows[1].totalCost",
    defaultLow: -0.1,
    defaultMid: 0,
    defaultHigh: 0.1,
    defaultSteps: 7,
    changeType: "percent",
    unitType: "totalMoney",
    positiveOnly: true,
    exposureLogic: "مواد، انرژی، دستمزد مستقیم و اقلام COGS را مقیاس می‌کند.",
    businessArea: "هزینه",
    available: true,
  },
  fxRate: {
    label: "نرخ ارز",
    englishLabel: "FX rate",
    sourceModule: "Macro / FX-linked costs",
    sourcePath: "assumptions.macro.fxRates",
    defaultLow: -0.1,
    defaultMid: 0,
    defaultHigh: 0.25,
    defaultSteps: 7,
    changeType: "percent",
    unitType: "fxRate",
    positiveOnly: true,
    exposureLogic: "فقط نرخ‌های ارز و نرخ‌های دستی اقلام ارزی را تغییر می‌دهد.",
    businessArea: "کلان",
    available: true,
  },
  inflation: {
    label: "تغییر در نرخ تورم سالانه",
    englishLabel: "Inflation",
    sourceModule: "Macro",
    sourcePath: "assumptions.macro.inflationGeneralAnnual",
    defaultLow: -0.05,
    defaultMid: 0,
    defaultHigh: 0.1,
    defaultSteps: 7,
    changeType: "percent",
    unitType: "percentage",
    positiveOnly: true,
    exposureLogic: "دلتا بر حسب واحد درصد را روی مسیر تورم عمومی سالانه اعمال می‌کند.",
    businessArea: "کلان",
    available: true,
  },
  discountRate: {
    label: "نرخ تنزیل / WACC",
    englishLabel: "Discount rate / WACC",
    sourceModule: "Valuation",
    sourcePath: "assumptions.macro.defaultDiscountRate",
    defaultLow: -0.05,
    defaultMid: 0,
    defaultHigh: 0.05,
    defaultSteps: 7,
    changeType: "percent",
    unitType: "percentage",
    positiveOnly: true,
    exposureLogic: "فقط نرخ‌های تنزیل و هزینه سرمایه را تغییر می‌دهد، نه نرخ بهره بدهی.",
    businessArea: "ارزش‌گذاری",
    available: true,
  },
  debtInterest: {
    label: "نرخ بهره بدهی",
    englishLabel: "Debt interest",
    sourceModule: "Financing",
    sourcePath: "assumptions.financing.instruments[].annualRate",
    defaultLow: -0.05,
    defaultMid: 0,
    defaultHigh: 0.05,
    defaultSteps: 7,
    changeType: "percent",
    unitType: "percentage",
    positiveOnly: true,
    exposureLogic: "یک دلتای واحد درصد مشترک را به نرخ هر ابزار بدهی فعال اضافه می‌کند.",
    businessArea: "تأمین مالی",
    available: true,
  },
  delay: {
    label: "تاخیر اجرا",
    englishLabel: "Construction delay",
    sourceModule: "Construction Cashflow / CAPEX",
    sourcePath: "assumptions.construction.actualDelayMonths",
    defaultLow: 0,
    defaultMid: 4,
    defaultHigh: 12,
    defaultSteps: 7,
    changeType: "absolute",
    unitType: "months",
    positiveOnly: true,
    exposureLogic: "تاخیر ساخت و تاخیر اقلام CAPEX را فعال می‌کند.",
    businessArea: "زمان‌بندی",
    available: true,
  },
  workingCapitalDays: {
    label: "دوره وصول / سرمایه در گردش",
    englishLabel: "Working capital days",
    sourceModule: "Working Capital",
    sourcePath: "assumptions.workingCapital.receivableDays",
    defaultLow: -15,
    defaultMid: 0,
    defaultHigh: 30,
    defaultSteps: 4,
    changeType: "absolute",
    unitType: "days",
    positiveOnly: true,
    exposureLogic: "روزهای وصول مطالبات را در برنامه سرمایه در گردش تغییر می‌دهد.",
    businessArea: "سرمایه در گردش",
    available: true,
  },
  taxRate: {
    label: "نرخ مالیات",
    englishLabel: "Tax rate",
    sourceModule: "Tax / Macro",
    sourcePath: "assumptions.tax.normalTaxRateOverride",
    defaultLow: -0.05,
    defaultMid: 0,
    defaultHigh: 0.05,
    defaultSteps: 7,
    changeType: "percent",
    unitType: "percentage",
    positiveOnly: true,
    exposureLogic: "نرخ مالیات کلان و نرخ override مالیاتی را تغییر می‌دهد.",
    businessArea: "مالیات",
    available: true,
  },
};

export const defaultRiskVariableKinds: RiskVariableKind[] = [
  "salesPrice",
  "salesVolume",
  "fxRate",
  "inflation",
  "capex",
  "opex",
  "directCosts",
  "debtInterest",
  "discountRate",
  "delay",
  "workingCapitalDays",
  "taxRate",
];

export const runnableRiskVariableKinds = defaultRiskVariableKinds.filter((kind) => riskVariableMeta[kind].available);

export const riskVariableSupportedChangeTypes = (kind: RiskVariableKind): Array<"percent" | "absolute"> => {
  if (kind === "delay" || kind === "workingCapitalDays") return ["absolute"];
  if (kind === "inflation" || kind === "discountRate" || kind === "debtInterest" || kind === "taxRate") return ["percent"];
  return ["percent", "absolute"];
};

export const cloneProject = (project: Project): Project => JSON.parse(JSON.stringify(project)) as Project;

export const activeScenario = (project: Project, scenarioId?: string) =>
  project.scenarios.find((scenario) => scenario.id === scenarioId) ??
  project.scenarios.find((scenario) => scenario.id === project.activeScenarioId) ??
  project.scenarios[0];

const finiteOrNull = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const normalizeText = (value: string) => value.toLowerCase();

export const riskVariableKindFromText = (value: string): RiskVariableKind => {
  const text = normalizeText(value);
  if (text.includes("وصول") || text.includes("سرمایه در گردش") || text.includes("nwc")) return "workingCapitalDays";
  if (text.includes("capex") || text.includes("سرمایه")) return "capex";
  if (text.includes("opex")) return "opex";
  if (text.includes("cogs") || text.includes("مستقیم") || text.includes("مواد") || text.includes("دستمزد") || text.includes("انرژی")) return "directCosts";
  if (text.includes("ارز") || text.includes("fx")) return "fxRate";
  if (text.includes("تنزیل") || text.includes("wacc") || text.includes("discount")) return "discountRate";
  if (text.includes("بهره") || text.includes("interest")) return "debtInterest";
  if (text.includes("تاخیر") || text.includes("delay")) return "delay";
  if (text.includes("مالیات") || text.includes("tax")) return "taxRate";
  if (text.includes("تورم") || text.includes("inflation")) return "inflation";
  if (text.includes("حجم") || text.includes("تولید") || text.includes("volume")) return "salesVolume";
  if (text.includes("درآمد") || text.includes("revenue")) return "revenue";
  return "salesPrice";
};

export const defaultRiskVariable = (kind: RiskVariableKind): ResolvedRiskVariable => {
  const meta = riskVariableMeta[kind];
  return {
    id: `risk-${kind}`,
    parameter: meta.label,
    label: meta.label,
    englishLabel: meta.englishLabel,
    kind,
    sourceModule: meta.sourceModule,
    sourcePath: meta.sourcePath,
    low: meta.defaultLow,
    mid: meta.defaultMid,
    high: meta.defaultHigh,
    steps: meta.defaultSteps,
    changeType: meta.changeType,
    unitType: meta.unitType,
    positiveOnly: meta.positiveOnly,
    exposureLogic: meta.exposureLogic,
    businessArea: meta.businessArea,
    available: meta.available,
    unavailabilityReason: meta.unavailabilityReason,
  };
};

export const resolveRiskVariablesFromSensitivity = (variables: SensitivityVariable[]): ResolvedRiskVariable[] =>
  variables.map((variable) => {
    const kind = riskVariableKindFromText(`${variable.parameter} ${variable.label}`);
    const meta = riskVariableMeta[kind];
    return {
      id: variable.id,
      parameter: variable.parameter,
      label: variable.label || meta.label,
      englishLabel: meta.englishLabel,
      kind,
      sourceModule: variable.sourceModule ?? meta.sourceModule,
      sourcePath: variable.sourcePath ?? meta.sourcePath,
      low: variable.low,
      mid: (variable.low + variable.high) / 2,
      high: variable.high,
      steps: variable.steps,
      changeType: variable.changeType,
      unitType: variable.unitType ?? meta.unitType,
      positiveOnly: meta.positiveOnly,
      exposureLogic: meta.exposureLogic,
      businessArea: meta.businessArea,
      available: meta.available,
      unavailabilityReason: meta.unavailabilityReason,
    };
  });

export const weightedDebtRate = (assumptions: ScenarioAssumptions) => {
  const activeInstruments = (assumptions.financing.instruments ?? []).filter((instrument) => instrument.active && instrument.amount > 0);
  const total = activeInstruments.reduce((sum, instrument) => sum + instrument.amount, 0);
  if (total <= 0) return assumptions.financing.interestRate;
  return activeInstruments.reduce((sum, instrument) => sum + instrument.annualRate * instrument.amount, 0) / total;
};

export const fxBaseRate = (assumptions: ScenarioAssumptions) => {
  const type = assumptions.macro.baseFxRateType;
  return assumptions.macro.fxRates[type] ?? assumptions.macro.freeMarketFxRate ?? assumptions.macro.baseFxRate;
};

export const getRiskBaseValue = (
  kind: RiskVariableKind,
  scenario: Scenario,
  baseOutputs: CoreModelOutputs,
) => {
  const assumptions = scenario.assumptions;
  if (kind === "salesPrice") return finiteOrNull(assumptions.market.baseSalesPrice);
  if (kind === "salesVolume") return finiteOrNull(baseOutputs.revenue.rows[1]?.salesVolume ?? assumptions.market.targetMarket);
  if (kind === "revenue") return finiteOrNull(baseOutputs.revenue.rows[1]?.revenue);
  if (kind === "capex") return finiteOrNull(baseOutputs.capex.totalCapex);
  if (kind === "opex") return finiteOrNull(baseOutputs.opex.rows[1]?.totalOpex);
  if (kind === "directCosts") return finiteOrNull(baseOutputs.directCosts.rows[1]?.totalCost);
  if (kind === "fxRate") return finiteOrNull(fxBaseRate(assumptions));
  if (kind === "inflation") return finiteOrNull(assumptions.macro.inflationGeneralAnnual);
  if (kind === "discountRate") return finiteOrNull(assumptions.macro.defaultDiscountRate);
  if (kind === "debtInterest") return finiteOrNull(weightedDebtRate(assumptions));
  if (kind === "delay") return finiteOrNull(assumptions.construction.actualDelayMonths ?? 0);
  if (kind === "workingCapitalDays") return finiteOrNull(assumptions.workingCapital.receivableDays);
  if (kind === "taxRate") return finiteOrNull(assumptions.tax.normalTaxRateOverride ?? assumptions.macro.corporateTaxRate);
  return null;
};

const scaled = (value: number, ratio: number) => value * ratio;

const amountFromShock = (baseValue: number | null, shock: number, changeType: "percent" | "absolute") => {
  const base = baseValue ?? Number.NaN;
  return changeType === "absolute" ? base + shock : base * (1 + shock);
};

const rateFromShock = (baseValue: number | null, shock: number) => (baseValue ?? Number.NaN) + shock;

export const shockToRiskValue = (
  variable: Pick<ResolvedRiskVariable, "kind" | "changeType">,
  baseValue: number | null,
  shock: number,
) => {
  if (variable.kind === "discountRate" || variable.kind === "debtInterest" || variable.kind === "inflation" || variable.kind === "taxRate") {
    return rateFromShock(baseValue, shock);
  }
  return amountFromShock(baseValue, shock, variable.changeType);
};

const setMacroFxRate = (assumptions: ScenarioAssumptions, targetRate: number, baseRate: number) => {
  const ratio = baseRate > EPSILON ? targetRate / baseRate : 1;
  const macro = assumptions.macro;
  const nextRates = Object.fromEntries(
    Object.entries(macro.fxRates).map(([key, value]) => [key, scaled(value, ratio)]),
  ) as Record<FXRateType, number>;
  macro.fxRates = nextRates;
  macro.officialFxRate = nextRates.official ?? scaled(macro.officialFxRate, ratio);
  macro.freeMarketFxRate = nextRates.freeMarket ?? scaled(macro.freeMarketFxRate, ratio);
  macro.remittanceFxRate = nextRates.remittance ?? scaled(macro.remittanceFxRate, ratio);
  macro.baseFxRate = scaled(macro.baseFxRate, ratio);
  assumptions.directCosts.mainRawMaterialManualFxRate = assumptions.directCosts.mainRawMaterialManualFxRate === undefined
    ? assumptions.directCosts.mainRawMaterialManualFxRate
    : scaled(assumptions.directCosts.mainRawMaterialManualFxRate, ratio);
  assumptions.directCosts.items = assumptions.directCosts.items.map((item) => ({
    ...item,
    manualFxRate: item.manualFxRate === undefined ? item.manualFxRate : scaled(item.manualFxRate, ratio),
  }));
  assumptions.capex.items = assumptions.capex.items.map((item) => ({
    ...item,
    manualFxRate: item.manualFxRate === undefined ? item.manualFxRate : scaled(item.manualFxRate, ratio),
  }));
  assumptions.opex.items = assumptions.opex.items.map((item) => ({
    ...item,
    manualFxRate: item.manualFxRate === undefined ? item.manualFxRate : scaled(item.manualFxRate, ratio),
  }));
};

const scaleSalesVolumeDrivers = (assumptions: ScenarioAssumptions, ratio: number) => {
  assumptions.market.targetMarket = scaled(assumptions.market.targetMarket, ratio);
  assumptions.market.targetMarketSize = scaled(assumptions.market.targetMarketSize, ratio);
  assumptions.market.demandLimit = scaled(assumptions.market.demandLimit, ratio);
  assumptions.market.potentialSalesYear1 = scaled(assumptions.market.potentialSalesYear1, ratio);
  assumptions.market.achievableSales = scaled(assumptions.market.achievableSales, ratio);
  assumptions.market.salesCeiling = scaled(assumptions.market.salesCeiling, ratio);
  assumptions.market.marketAbsorptionCapacity = scaled(assumptions.market.marketAbsorptionCapacity, ratio);
};

const scaleDirectCosts = (assumptions: ScenarioAssumptions, ratio: number) => {
  const direct = assumptions.directCosts;
  direct.mainRawMaterialRialPrice = scaled(direct.mainRawMaterialRialPrice, ratio);
  direct.mainRawMaterialFxPrice = scaled(direct.mainRawMaterialFxPrice, ratio);
  direct.rawMaterialRialUnitCost = scaled(direct.rawMaterialRialUnitCost, ratio);
  direct.rawMaterialFxUnitCost = scaled(direct.rawMaterialFxUnitCost, ratio);
  direct.secondaryMaterialsCost = scaled(direct.secondaryMaterialsCost, ratio);
  direct.secondaryMaterialsUnitCost = scaled(direct.secondaryMaterialsUnitCost, ratio);
  direct.packagingUnitCost = scaled(direct.packagingUnitCost, ratio);
  direct.directEnergyCost = scaled(direct.directEnergyCost, ratio);
  direct.energyUnitCost = scaled(direct.energyUnitCost, ratio);
  direct.directLaborCost = scaled(direct.directLaborCost, ratio);
  direct.directLaborUnitCost = scaled(direct.directLaborUnitCost, ratio);
  direct.avoidableWasteCost = scaled(direct.avoidableWasteCost, ratio);
  direct.directTransportCost = scaled(direct.directTransportCost, ratio);
  direct.logisticsUnitCost = scaled(direct.logisticsUnitCost, ratio);
  direct.salesCommissionCost = scaled(direct.salesCommissionCost, ratio);
  direct.importDutiesAndClearanceCost = scaled(direct.importDutiesAndClearanceCost, ratio);
  direct.customsUnitCost = scaled(direct.customsUnitCost, ratio);
  direct.otherDirectProductionCosts = scaled(direct.otherDirectProductionCosts, ratio);
  direct.otherUnitCost = scaled(direct.otherUnitCost, ratio);
  direct.items = direct.items.map((item) => ({
    ...item,
    rialUnitCost: scaled(item.rialUnitCost, ratio),
    fxUnitCost: scaled(item.fxUnitCost, ratio),
  }));
};

const scaleOpex = (assumptions: ScenarioAssumptions, ratio: number) => {
  assumptions.opex.items = assumptions.opex.items.map((item) => ({
    ...item,
    baseYearAmount: scaled(item.baseYearAmount, ratio),
  }));
  assumptions.opex.salaries = scaled(assumptions.opex.salaries, ratio);
  assumptions.opex.bonuses = scaled(assumptions.opex.bonuses, ratio);
  assumptions.opex.rent = scaled(assumptions.opex.rent, ratio);
  assumptions.opex.utilities = scaled(assumptions.opex.utilities, ratio);
  assumptions.opex.it = scaled(assumptions.opex.it, ratio);
  assumptions.opex.marketing = scaled(assumptions.opex.marketing, ratio);
  assumptions.opex.selling = scaled(assumptions.opex.selling, ratio);
};

const scaleCapex = (assumptions: ScenarioAssumptions, ratio: number) => {
  assumptions.capex.items = assumptions.capex.items.map((item) => ({
    ...item,
    rialUnitPrice: scaled(item.rialUnitPrice, ratio),
    fxUnitPrice: scaled(item.fxUnitPrice, ratio),
    unitPrice: scaled(item.unitPrice, ratio),
    installationCost: scaled(item.installationCost, ratio),
    transportInsuranceCost: scaled(item.transportInsuranceCost, ratio),
    trainingCost: scaled(item.trainingCost, ratio),
    preOperationCost: scaled(item.preOperationCost, ratio),
    indirectProjectCost: scaled(item.indirectProjectCost, ratio),
    permitCost: scaled(item.permitCost, ratio),
    monthlyDelayCost: scaled(item.monthlyDelayCost, ratio),
  }));
};

const setDelay = (assumptions: ScenarioAssumptions, months: number) => {
  assumptions.construction.delayScenarioEnabled = months > 0;
  assumptions.construction.actualDelayMonths = months;
  assumptions.capex.items = assumptions.capex.items.map((item) => ({
    ...item,
    delayEnabled: months > 0,
    delayMonths: months,
  }));
};

const setDebtInterest = (assumptions: ScenarioAssumptions, delta: number) => {
  assumptions.financing.interestRate += delta;
  assumptions.financing.instruments = (assumptions.financing.instruments ?? []).map((instrument) => ({
    ...instrument,
    annualRate: instrument.active ? instrument.annualRate + delta : instrument.annualRate,
  }));
};

export const setRiskVariableValue = (
  assumptions: ScenarioAssumptions,
  kind: RiskVariableKind,
  targetValue: number,
  baseValue: number | null,
) => {
  const ratio = baseValue && Math.abs(baseValue) > EPSILON ? targetValue / baseValue : 1;
  const delta = baseValue === null ? Number.NaN : targetValue - baseValue;
  if (kind === "salesPrice") {
    assumptions.market.baseSalesPrice = targetValue;
    assumptions.market.unitSalesPrice = targetValue;
  } else if (kind === "salesVolume") {
    scaleSalesVolumeDrivers(assumptions, ratio);
  } else if (kind === "revenue") {
    return;
  } else if (kind === "capex") {
    scaleCapex(assumptions, ratio);
  } else if (kind === "opex") {
    scaleOpex(assumptions, ratio);
  } else if (kind === "directCosts") {
    scaleDirectCosts(assumptions, ratio);
  } else if (kind === "fxRate") {
    setMacroFxRate(assumptions, targetValue, baseValue ?? targetValue);
  } else if (kind === "inflation") {
    assumptions.macro.inflationGeneralAnnual += delta;
    assumptions.macro.inflationRate += delta;
  } else if (kind === "discountRate") {
    assumptions.macro.defaultDiscountRate += delta;
    assumptions.macro.discountRate += delta;
    assumptions.macro.opportunityCostOfCapital += delta;
    assumptions.macro.opportunityCostRate += delta;
  } else if (kind === "debtInterest") {
    setDebtInterest(assumptions, delta);
  } else if (kind === "delay") {
    setDelay(assumptions, targetValue);
  } else if (kind === "workingCapitalDays") {
    assumptions.workingCapital.receivableDays = targetValue;
  } else if (kind === "taxRate") {
    assumptions.macro.incomeTaxRate += delta;
    assumptions.macro.corporateTaxRate += delta;
    assumptions.tax.normalTaxRateOverride = (assumptions.tax.normalTaxRateOverride ?? assumptions.macro.corporateTaxRate - delta) + delta;
  }
};

export const hasFxExposure = (assumptions: ScenarioAssumptions) =>
  assumptions.capex.items.some((item) => item.fxUnitPrice > 0 && item.fxPriceShare > 0) ||
  assumptions.directCosts.isMainRawMaterialFx && assumptions.directCosts.mainRawMaterialFxPrice > 0 ||
  assumptions.directCosts.items.some((item) => item.fxUnitCost > 0 && item.fxShare > 0) ||
  assumptions.opex.items.some((item) => item.isFx && item.fxShare > 0) ||
  assumptions.construction.costItems?.some((item) => item.fxIndexed && item.fxShare > 0) === true;

export const hasActiveDebtExposure = (assumptions: ScenarioAssumptions) =>
  assumptions.financing.longTermDebt > EPSILON ||
  (assumptions.financing.instruments ?? []).some((instrument) => instrument.active && instrument.amount > EPSILON);

export const riskVariableAvailability = (
  kind: RiskVariableKind,
  scenario: Scenario,
  baseOutputs: CoreModelOutputs,
) => {
  const meta = riskVariableMeta[kind];
  if (!meta.available) return { available: false, reason: meta.unavailabilityReason ?? "این راننده در مدل فعلی در دسترس نیست." };
  if (kind === "salesVolume") {
    const market = scenario.assumptions.market;
    const ownsDemand = [market.targetMarket, market.demandLimit].every(Number.isFinite);
    if (!ownsDemand) return { available: false, reason: "مالک معتبر تقاضا/فروش قابل تحقق در مفروضات بازار موجود نیست." };
  }
  if (getRiskBaseValue(kind, scenario, baseOutputs) === null) {
    return { available: false, reason: "مقدار مبنای این راننده قابل محاسبه نیست." };
  }
  return { available: true as const };
};

export const validateRiskVariableConfiguration = (
  variable: ResolvedRiskVariable,
  scenario: Scenario,
  baseOutputs: CoreModelOutputs,
): SensitivityValidationIssue[] => {
  const issues: SensitivityValidationIssue[] = [];
  const add = (code: string, field: string, message: string) => issues.push({ code, field, message, variableId: variable.id });
  const availability = riskVariableAvailability(variable.kind, scenario, baseOutputs);
  if (!availability.available) add("unavailable-driver", "parameter", availability.reason);
  if (!riskVariableSupportedChangeTypes(variable.kind).includes(variable.changeType)) {
    add("unsupported-change-type", "changeType", "نوع تغییر برای این راننده پشتیبانی نمی‌شود.");
  }
  if (!Number.isFinite(variable.low)) add("invalid-low", "low", "حد پایین باید یک عدد متناهی باشد.");
  if (!Number.isFinite(variable.high)) add("invalid-high", "high", "حد بالا باید یک عدد متناهی باشد.");
  if (Number.isFinite(variable.low) && Number.isFinite(variable.high) && variable.low > variable.high) {
    add("invalid-range-order", "low", "حد پایین نباید از حد بالا بزرگ‌تر باشد.");
  }
  const steps = variable.steps;
  if (!Number.isFinite(steps) || !Number.isInteger(steps) || (steps ?? 0) < 3 || (steps ?? 0) > 41) {
    add("invalid-point-count", "steps", "تعداد نقاط باید عدد صحیحی بین ۳ و ۴۱ باشد.");
  }
  const baseValue = getRiskBaseValue(variable.kind, scenario, baseOutputs);
  if (baseValue === null) add("missing-base", "parameter", "مقدار مبنای راننده موجود نیست.");
  if (variable.changeType === "percent" && baseValue !== null && Math.abs(baseValue) < EPSILON && !["inflation", "discountRate", "debtInterest", "taxRate"].includes(variable.kind)) {
    add("percent-zero-base", "changeType", "تغییر درصدی روی مبنای صفر معتبر نیست؛ از تغییر مطلق استفاده کنید.");
  }
  if (Number.isFinite(variable.low) && Number.isFinite(variable.high) && baseValue !== null) {
    const endpointValues = [variable.low, variable.high].map((shock) => shockToRiskValue(variable, baseValue, shock));
    if (variable.positiveOnly && endpointValues.some((value) => !Number.isFinite(value) || value < 0)) {
      add("negative-result", "low", "بازه انتخابی مقدار نهایی منفی و نامعتبر ایجاد می‌کند.");
    }
    if (variable.kind === "taxRate" && endpointValues.some((value) => value < 0 || value > 1)) {
      add("tax-out-of-range", "low", "نرخ مالیات نهایی باید بین صفر و یک باشد.");
    }
    if (variable.kind === "debtInterest") {
      const activeRates = (scenario.assumptions.financing.instruments ?? [])
        .filter((instrument) => instrument.active && instrument.amount > 0)
        .map((instrument) => instrument.annualRate);
      if ([variable.low, variable.high].some((shock) => activeRates.some((rate) => rate + shock < 0))) {
        add("negative-debt-rate", "low", "دلتا نباید نرخ هیچ ابزار بدهی فعال را منفی کند.");
      }
    }
    if (variable.kind === "delay" || variable.kind === "workingCapitalDays") {
      if (![variable.low, variable.high].every(Number.isInteger)) {
        add("fractional-discrete-delta", "low", "دلتا برای روز/ماه باید عدد صحیح باشد.");
      }
      if (typeof steps === "number" && Number.isInteger(steps) && steps > 1 && Number.isFinite(variable.low) && Number.isFinite(variable.high)) {
        const increment = (variable.high - variable.low) / (steps - 1);
        if (!Number.isInteger(increment)) add("fractional-discrete-points", "steps", "گام‌های این بازه باید همگی روز/ماه صحیح تولید کنند.");
      }
    }
  }
  return issues;
};

export const applyRiskVariableShock = (
  project: Project,
  scenario: Scenario,
  variable: Pick<ResolvedRiskVariable, "kind" | "changeType">,
  shock: number,
  baseOutputs: CoreModelOutputs,
) => {
  const nextProject = cloneProject(project);
  nextProject.activeScenarioId = scenario.id;
  const nextScenario = activeScenario(nextProject, scenario.id);
  const result = applyRiskVariableShockToScenario(nextScenario, scenario, variable, shock, baseOutputs);

  return { project: nextProject, scenario: result.scenario, baseValue: result.baseValue, shockedValue: result.shockedValue, warnings: result.warnings };
};

export const applyRiskVariableShockToScenario = (
  targetScenario: Scenario,
  baseScenario: Scenario,
  variable: Pick<ResolvedRiskVariable, "kind" | "changeType">,
  shock: number,
  baseOutputs: CoreModelOutputs,
) => {
  const assumptions = targetScenario.assumptions;
  const baseValue = getRiskBaseValue(variable.kind, baseScenario, baseOutputs);
  const shockedValue = shockToRiskValue(variable, baseValue, shock);
  const warnings: string[] = [];

  if (!riskVariableMeta[variable.kind].available) {
    warnings.push(riskVariableMeta[variable.kind].unavailabilityReason ?? "این راننده در مدل فعلی در دسترس نیست.");
    return { scenario: targetScenario, baseValue, shockedValue: baseValue, warnings };
  }

  if (Math.abs(shock) < EPSILON) {
    return { scenario: targetScenario, baseValue, shockedValue: baseValue, warnings };
  }

  if (variable.kind === "fxRate" && !hasFxExposure(assumptions)) {
    warnings.push("در مفروضات فعلی، مواجهه ارزی معنادار برای این شوک پیدا نشد.");
  }
  if (variable.kind === "debtInterest" && !hasActiveDebtExposure(assumptions)) {
    warnings.push("برنامه بدهی فعال برای تحلیل نرخ بهره وجود ندارد.");
  }
  setRiskVariableValue(assumptions, variable.kind, shockedValue, baseValue);
  targetScenario.assumptions = assumptions;

  return { scenario: targetScenario, baseValue, shockedValue, warnings };
};

export const applyRiskVariableShockByName = (
  project: Project,
  scenario: Scenario,
  parameter: string,
  shock: number,
  baseOutputs: CoreModelOutputs,
  changeType: "percent" | "absolute" = "percent",
) => {
  const kind = riskVariableKindFromText(parameter);
  const variable = defaultRiskVariable(kind);
  return applyRiskVariableShock(
    project,
    scenario,
    {
      ...variable,
      changeType: kind === "delay" || kind === "workingCapitalDays" ? "absolute" : changeType,
    },
    shock,
    baseOutputs,
  );
};

export const buildRiskAssumptionProvenance = (scenario: Scenario, outputs: CoreModelOutputs): SensitivityAssumptionProvenance[] => {
  const assumptions = scenario.assumptions;
  return [
    { id: "calculation-basis", label: "مبنای محاسبه", value: assumptions.macro.calculationBasis, unit: "none", unitType: "none", editableHere: false, sourceModule: "Valuation / Macro", sourcePath: "assumptions.macro.calculationBasis" },
    { id: "revenue", label: "درآمد سال اول", value: outputs.revenue.rows[1]?.revenue ?? null, unit: "totalMoney", unitType: "totalMoney", editableHere: false, sourceModule: "Revenue", sourcePath: "outputs.revenue.rows[1].revenue" },
    { id: "sales-price", label: "قیمت فروش مبنا", value: assumptions.market.baseSalesPrice, unit: "unitPrice", unitType: "unitPrice", editableHere: false, sourceModule: "Market Demand", sourcePath: "assumptions.market.baseSalesPrice" },
    { id: "sales-volume", label: "حجم فروش سال اول", value: outputs.revenue.rows[1]?.salesVolume ?? null, unit: "volume", unitType: "volume", editableHere: false, sourceModule: "Capacity / Revenue", sourcePath: "outputs.revenue.rows[1].salesVolume" },
    { id: "capex", label: "CAPEX کل", value: outputs.capex.totalCapex, unit: "totalMoney", unitType: "totalMoney", editableHere: false, sourceModule: "CAPEX", sourcePath: "outputs.capex.totalCapex" },
    { id: "opex", label: "OPEX سال اول", value: outputs.opex.rows[1]?.totalOpex ?? null, unit: "totalMoney", unitType: "totalMoney", editableHere: false, sourceModule: "OPEX", sourcePath: "outputs.opex.rows[1].totalOpex" },
    { id: "direct-costs", label: "هزینه مستقیم سال اول", value: outputs.directCosts.rows[1]?.totalCost ?? null, unit: "totalMoney", unitType: "totalMoney", editableHere: false, sourceModule: "Direct Costs", sourcePath: "outputs.directCosts.rows[1].totalCost" },
    { id: "fx", label: "نرخ ارز مبنا", value: fxBaseRate(assumptions), unit: "fxRate", unitType: "fxRate", editableHere: false, sourceModule: "Macro", sourcePath: "assumptions.macro.fxRates" },
    { id: "inflation", label: "تورم عمومی", value: assumptions.macro.inflationGeneralAnnual, unit: "percentage", unitType: "percentage", editableHere: false, sourceModule: "Macro", sourcePath: "assumptions.macro.inflationGeneralAnnual" },
    { id: "discount", label: "نرخ تنزیل / WACC", value: assumptions.macro.defaultDiscountRate, unit: "percentage", unitType: "percentage", editableHere: false, sourceModule: "Valuation", sourcePath: "assumptions.macro.defaultDiscountRate" },
    { id: "debt-interest", label: "نرخ بهره بدهی", value: weightedDebtRate(assumptions), unit: "percentage", unitType: "percentage", editableHere: false, sourceModule: "Financing", sourcePath: "assumptions.financing.instruments[].annualRate" },
    { id: "working-capital", label: "روزهای وصول", value: assumptions.workingCapital.receivableDays, unit: "days", unitType: "days", editableHere: false, sourceModule: "Working Capital", sourcePath: "assumptions.workingCapital.receivableDays" },
    { id: "tax", label: "نرخ مالیات", value: assumptions.tax.normalTaxRateOverride ?? assumptions.macro.corporateTaxRate, unit: "percentage", unitType: "percentage", editableHere: false, sourceModule: "Tax", sourcePath: "assumptions.tax.normalTaxRateOverride" },
    { id: "delay", label: "تاخیر اجرا", value: assumptions.construction.actualDelayMonths ?? 0, unit: "months", unitType: "months", editableHere: false, sourceModule: "Construction Cashflow", sourcePath: "assumptions.construction.actualDelayMonths" },
  ];
};
