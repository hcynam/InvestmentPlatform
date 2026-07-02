import type {
  BreakEvenResult,
  FXRateType,
  Project,
  Scenario,
  ScenarioAssumptions,
  ScenarioOutputs,
  SensitivityAssumptionProvenance,
  SensitivityMatrixCell,
  SensitivityMetric,
  SensitivityPoint,
  SensitivityRunStatus,
  SensitivityThresholdStatus,
  SensitivityUnitType,
  SensitivityVariable,
  SensitivityWarning,
  TornadoResult,
} from "@/lib/types";
import { metricMetadata, npvZeroTarget } from "@/lib/sensitivity-format";

type CoreOutputs = Omit<ScenarioOutputs, "monteCarlo">;
type CoreRunner = (project: Project, scenario: Scenario, includeRisk?: boolean) => CoreOutputs;

type SensitivityVariableKind =
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

type ResolvedSensitivityVariable = SensitivityVariable & {
  kind: SensitivityVariableKind;
  sourceModule: string;
  sourcePath: string;
  unitType: SensitivityUnitType;
};

const EPSILON = 1e-6;
const ROOT_TOLERANCE = 1e-4;

const variableMeta: Record<SensitivityVariableKind, {
  label: string;
  sourceModule: string;
  sourcePath: string;
  defaultLow: number;
  defaultHigh: number;
  defaultSteps: number;
  changeType: "percent" | "absolute";
  unitType: SensitivityUnitType;
}> = {
  salesPrice: {
    label: "قیمت فروش",
    sourceModule: "Revenue / Market Demand",
    sourcePath: "assumptions.market.baseSalesPrice",
    defaultLow: -0.15,
    defaultHigh: 0.15,
    defaultSteps: 7,
    changeType: "percent",
    unitType: "unitPrice",
  },
  salesVolume: {
    label: "حجم فروش / تولید",
    sourceModule: "Market Demand / Capacity Production",
    sourcePath: "outputs.revenue.rows[1].salesVolume",
    defaultLow: -0.15,
    defaultHigh: 0.15,
    defaultSteps: 7,
    changeType: "percent",
    unitType: "volume",
  },
  revenue: {
    label: "درآمد فروش",
    sourceModule: "Revenue",
    sourcePath: "outputs.revenue.rows[1].revenue",
    defaultLow: -0.15,
    defaultHigh: 0.15,
    defaultSteps: 7,
    changeType: "percent",
    unitType: "totalMoney",
  },
  capex: {
    label: "CAPEX",
    sourceModule: "CAPEX",
    sourcePath: "outputs.capex.totalCapex",
    defaultLow: -0.1,
    defaultHigh: 0.2,
    defaultSteps: 7,
    changeType: "percent",
    unitType: "totalMoney",
  },
  opex: {
    label: "OPEX",
    sourceModule: "OPEX",
    sourcePath: "outputs.opex.rows[1].totalOpex",
    defaultLow: -0.1,
    defaultHigh: 0.1,
    defaultSteps: 7,
    changeType: "percent",
    unitType: "totalMoney",
  },
  directCosts: {
    label: "هزینه مستقیم / COGS",
    sourceModule: "Direct Costs / COGS",
    sourcePath: "outputs.directCosts.rows[1].totalCost",
    defaultLow: -0.1,
    defaultHigh: 0.1,
    defaultSteps: 7,
    changeType: "percent",
    unitType: "totalMoney",
  },
  fxRate: {
    label: "نرخ ارز",
    sourceModule: "Macro / FX-linked costs",
    sourcePath: "assumptions.macro.fxRates",
    defaultLow: -0.1,
    defaultHigh: 0.25,
    defaultSteps: 7,
    changeType: "percent",
    unitType: "fxRate",
  },
  inflation: {
    label: "تورم",
    sourceModule: "Macro",
    sourcePath: "assumptions.macro.inflationGeneralAnnual",
    defaultLow: -0.05,
    defaultHigh: 0.1,
    defaultSteps: 7,
    changeType: "percent",
    unitType: "percentage",
  },
  discountRate: {
    label: "نرخ تنزیل / WACC",
    sourceModule: "Valuation",
    sourcePath: "assumptions.macro.defaultDiscountRate",
    defaultLow: -0.05,
    defaultHigh: 0.05,
    defaultSteps: 7,
    changeType: "percent",
    unitType: "percentage",
  },
  debtInterest: {
    label: "نرخ بهره بدهی",
    sourceModule: "Financing",
    sourcePath: "assumptions.financing.instruments[].annualRate",
    defaultLow: -0.05,
    defaultHigh: 0.05,
    defaultSteps: 7,
    changeType: "percent",
    unitType: "percentage",
  },
  delay: {
    label: "تاخیر اجرا",
    sourceModule: "Construction Cashflow / CAPEX",
    sourcePath: "assumptions.construction.actualDelayMonths",
    defaultLow: 0,
    defaultHigh: 12,
    defaultSteps: 7,
    changeType: "absolute",
    unitType: "months",
  },
  workingCapitalDays: {
    label: "دوره وصول / سرمایه در گردش",
    sourceModule: "Working Capital",
    sourcePath: "assumptions.workingCapital.receivableDays",
    defaultLow: -15,
    defaultHigh: 30,
    defaultSteps: 7,
    changeType: "absolute",
    unitType: "days",
  },
  taxRate: {
    label: "نرخ مالیات",
    sourceModule: "Tax / Macro",
    sourcePath: "assumptions.tax.normalTaxRateOverride",
    defaultLow: -0.05,
    defaultHigh: 0.05,
    defaultSteps: 7,
    changeType: "percent",
    unitType: "percentage",
  },
};

const defaultVariableKinds: SensitivityVariableKind[] = [
  "salesPrice",
  "salesVolume",
  "revenue",
  "capex",
  "opex",
  "directCosts",
  "fxRate",
  "inflation",
  "discountRate",
  "debtInterest",
  "delay",
  "workingCapitalDays",
  "taxRate",
];

const cloneProject = (project: Project): Project => JSON.parse(JSON.stringify(project)) as Project;

const activeScenario = (project: Project, scenarioId?: string) =>
  project.scenarios.find((scenario) => scenario.id === scenarioId) ??
  project.scenarios.find((scenario) => scenario.id === project.activeScenarioId) ??
  project.scenarios[0];

const finiteOrNull = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const safePercentImpact = (impact: number | null, base: number | null) => {
  if (impact === null || base === null || Math.abs(base) < EPSILON) return null;
  return impact / Math.abs(base);
};

const safeElasticity = (percentImpact: number | null, shock: number) => {
  if (percentImpact === null || Math.abs(shock) < EPSILON) return null;
  return percentImpact / shock;
};

const clampNonNegative = (value: number) => Math.max(0, Number.isFinite(value) ? value : 0);
const clampRate = (value: number) => Math.max(0, Number.isFinite(value) ? value : 0);

const scaled = (value: number, ratio: number) => clampNonNegative(value * ratio);
const addRateShock = (base: number, shock: number) => clampRate(base + shock);

const amountFromShock = (baseValue: number | null, shock: number, changeType: "percent" | "absolute") => {
  const base = baseValue ?? 0;
  return changeType === "absolute" ? clampNonNegative(base + shock) : clampNonNegative(base * (1 + shock));
};

const rateFromShock = (baseValue: number | null, shock: number) => addRateShock(baseValue ?? 0, shock);

const range = (low: number, high: number, steps: number, minimumSteps = 3) => {
  const safeSteps = Math.max(minimumSteps, Math.min(15, Math.round(steps || minimumSteps)));
  const values = Array.from({ length: safeSteps }, (_, index) =>
    low + ((high - low) * index) / Math.max(1, safeSteps - 1)
  );
  if (low <= 0 && high >= 0 && !values.some((value) => Math.abs(value) < EPSILON)) values.push(0);
  return Array.from(new Set(values.map((value) => Number(value.toFixed(8))))).sort((left, right) => left - right);
};

const normalizeText = (value: string) => value.toLowerCase();

const variableKindFromText = (value: string): SensitivityVariableKind => {
  const text = normalizeText(value);
  if (text.includes("capex") || text.includes("سرمایه")) return "capex";
  if (text.includes("opex")) return "opex";
  if (text.includes("cogs") || text.includes("مستقیم") || text.includes("هزینه")) return "directCosts";
  if (text.includes("ارز") || text.includes("fx")) return "fxRate";
  if (text.includes("تنزیل") || text.includes("wacc") || text.includes("discount")) return "discountRate";
  if (text.includes("بهره") || text.includes("interest")) return "debtInterest";
  if (text.includes("تاخیر") || text.includes("delay")) return "delay";
  if (text.includes("وصول") || text.includes("سرمایه در گردش") || text.includes("nwc")) return "workingCapitalDays";
  if (text.includes("مالیات") || text.includes("tax")) return "taxRate";
  if (text.includes("تورم") || text.includes("inflation")) return "inflation";
  if (text.includes("حجم") || text.includes("تولید") || text.includes("volume")) return "salesVolume";
  if (text.includes("درآمد") || text.includes("revenue")) return "revenue";
  return "salesPrice";
};

const defaultVariable = (kind: SensitivityVariableKind): ResolvedSensitivityVariable => {
  const meta = variableMeta[kind];
  return {
    id: `sensitivity-${kind}`,
    parameter: meta.label,
    label: meta.label,
    low: meta.defaultLow,
    high: meta.defaultHigh,
    steps: meta.defaultSteps,
    changeType: meta.changeType,
    sourceModule: meta.sourceModule,
    sourcePath: meta.sourcePath,
    unitType: meta.unitType,
    kind,
  };
};

const resolveVariables = (scenario: Scenario): ResolvedSensitivityVariable[] => {
  const assumptions = scenario.assumptions.sensitivity;
  const legacyVariables: SensitivityVariable[] = [
    {
      id: "legacy-sensitivity-1",
      parameter: assumptions.variable1,
      label: assumptions.variable1,
      low: assumptions.shockLow,
      high: assumptions.shockHigh,
      steps: assumptions.steps,
      changeType: "percent",
    },
    {
      id: "legacy-sensitivity-2",
      parameter: assumptions.variable2,
      label: assumptions.variable2,
      low: assumptions.shockLow,
      high: assumptions.shockHigh,
      steps: assumptions.steps,
      changeType: "percent",
    },
  ];
  const sourceVariables = assumptions.variables?.length ? assumptions.variables : legacyVariables;
  const resolved = sourceVariables.map((variable) => {
    const kind = variableKindFromText(`${variable.parameter} ${variable.label}`);
    const meta = variableMeta[kind];
    return {
      ...variable,
      label: variable.label || meta.label,
      sourceModule: variable.sourceModule ?? meta.sourceModule,
      sourcePath: variable.sourcePath ?? meta.sourcePath,
      unitType: variable.unitType ?? meta.unitType,
      kind,
    };
  });
  const existingKinds = new Set(resolved.map((variable) => variable.kind));
  const missing = defaultVariableKinds
    .filter((kind) => !existingKinds.has(kind))
    .map(defaultVariable);

  return [...resolved, ...missing];
};

const weightedDebtRate = (assumptions: ScenarioAssumptions) => {
  const activeInstruments = (assumptions.financing.instruments ?? []).filter((instrument) => instrument.active && instrument.amount > 0);
  const total = activeInstruments.reduce((sum, instrument) => sum + instrument.amount, 0);
  if (total <= 0) return assumptions.financing.interestRate;
  return activeInstruments.reduce((sum, instrument) => sum + instrument.annualRate * instrument.amount, 0) / total;
};

const fxBaseRate = (assumptions: ScenarioAssumptions) => {
  const type = assumptions.macro.baseFxRateType;
  return assumptions.macro.fxRates[type] ?? assumptions.macro.freeMarketFxRate ?? assumptions.macro.baseFxRate;
};

const getBaseValue = (
  kind: SensitivityVariableKind,
  scenario: Scenario,
  baseOutputs: CoreOutputs,
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

const shockToValue = (
  variable: ResolvedSensitivityVariable,
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
  assumptions.capacity.nominalCapacity = scaled(assumptions.capacity.nominalCapacity, ratio);
  assumptions.capacity.bottleneckHourlyCapacity = scaled(assumptions.capacity.bottleneckHourlyCapacity, ratio);
  assumptions.capacity.bottleneckCapacityPerHour = scaled(assumptions.capacity.bottleneckCapacityPerHour, ratio);
  assumptions.capacity.energyAvailableQuantity = scaled(assumptions.capacity.energyAvailableQuantity, ratio);
  assumptions.capacity.energyLimit = scaled(assumptions.capacity.energyLimit, ratio);
  assumptions.capacity.rawMaterialAvailableQuantity = scaled(assumptions.capacity.rawMaterialAvailableQuantity, ratio);
  assumptions.capacity.materialLimit = scaled(assumptions.capacity.materialLimit, ratio);
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
  const roundedMonths = Math.max(0, Math.round(months));
  assumptions.construction.delayScenarioEnabled = roundedMonths > 0;
  assumptions.construction.actualDelayMonths = roundedMonths;
  assumptions.construction.allowedDelayMonths = Math.max(assumptions.construction.allowedDelayMonths ?? 0, roundedMonths);
  assumptions.capex.items = assumptions.capex.items.map((item) => ({
    ...item,
    delayEnabled: roundedMonths > 0,
    delayMonths: roundedMonths,
  }));
};

const setDebtInterest = (assumptions: ScenarioAssumptions, value: number) => {
  const rate = clampRate(value);
  assumptions.financing.interestRate = rate;
  assumptions.financing.instruments = (assumptions.financing.instruments ?? []).map((instrument) => ({
    ...instrument,
    annualRate: instrument.active ? rate : instrument.annualRate,
  }));
};

const setVariableValue = (
  assumptions: ScenarioAssumptions,
  kind: SensitivityVariableKind,
  targetValue: number,
  baseValue: number | null,
) => {
  const ratio = baseValue && Math.abs(baseValue) > EPSILON ? targetValue / baseValue : 1;
  if (kind === "salesPrice") {
    assumptions.market.baseSalesPrice = clampNonNegative(targetValue);
    assumptions.market.unitSalesPrice = clampNonNegative(targetValue);
  } else if (kind === "salesVolume") {
    scaleSalesVolumeDrivers(assumptions, ratio);
  } else if (kind === "revenue") {
    assumptions.market.baseSalesPrice = scaled(assumptions.market.baseSalesPrice, ratio);
    assumptions.market.unitSalesPrice = scaled(assumptions.market.unitSalesPrice, ratio);
  } else if (kind === "capex") {
    scaleCapex(assumptions, ratio);
  } else if (kind === "opex") {
    scaleOpex(assumptions, ratio);
  } else if (kind === "directCosts") {
    scaleDirectCosts(assumptions, ratio);
  } else if (kind === "fxRate") {
    setMacroFxRate(assumptions, targetValue, baseValue ?? targetValue);
  } else if (kind === "inflation") {
    assumptions.macro.inflationGeneralAnnual = clampRate(targetValue);
    assumptions.macro.inflationRate = clampRate(targetValue);
  } else if (kind === "discountRate") {
    assumptions.macro.defaultDiscountRate = clampRate(targetValue);
    assumptions.macro.discountRate = clampRate(targetValue);
    assumptions.macro.costOfCapital = clampRate(targetValue);
    assumptions.macro.opportunityCostOfCapital = clampRate(targetValue);
    assumptions.macro.opportunityCostRate = clampRate(targetValue);
  } else if (kind === "debtInterest") {
    setDebtInterest(assumptions, targetValue);
  } else if (kind === "delay") {
    setDelay(assumptions, targetValue);
  } else if (kind === "workingCapitalDays") {
    assumptions.workingCapital.receivableDays = clampNonNegative(targetValue);
  } else if (kind === "taxRate") {
    const rate = clampRate(targetValue);
    assumptions.macro.incomeTaxRate = rate;
    assumptions.macro.corporateTaxRate = rate;
    assumptions.tax.normalTaxRateOverride = rate;
  }
};

const hasFxExposure = (assumptions: ScenarioAssumptions) =>
  assumptions.capex.items.some((item) => item.fxUnitPrice > 0 && item.fxPriceShare > 0) ||
  assumptions.directCosts.isMainRawMaterialFx && assumptions.directCosts.mainRawMaterialFxPrice > 0 ||
  assumptions.directCosts.items.some((item) => item.fxUnitCost > 0 && item.fxShare > 0) ||
  assumptions.opex.items.some((item) => item.isFx && item.fxShare > 0) ||
  assumptions.construction.costItems?.some((item) => item.fxIndexed && item.fxShare > 0) === true;

const applyShock = (
  project: Project,
  scenario: Scenario,
  variable: ResolvedSensitivityVariable,
  shock: number,
  baseOutputs: CoreOutputs,
) => {
  const nextProject = cloneProject(project);
  nextProject.activeScenarioId = scenario.id;
  const nextScenario = activeScenario(nextProject, scenario.id);
  const assumptions = nextScenario.assumptions;
  const baseValue = getBaseValue(variable.kind, scenario, baseOutputs);
  const shockedValue = shockToValue(variable, baseValue, shock);
  const warnings: string[] = [];

  if (variable.kind === "fxRate" && !hasFxExposure(assumptions)) {
    warnings.push("در مفروضات فعلی، مواجهه ارزی معنادار برای این شوک پیدا نشد.");
  }
  if ((variable.kind === "discountRate" || variable.kind === "inflation" || variable.kind === "taxRate" || variable.kind === "debtInterest") && shockedValue < 0) {
    warnings.push("نرخ شوک‌یافته منفی بود و به صفر محدود شد.");
  }

  setVariableValue(assumptions, variable.kind, shockedValue, baseValue);
  nextScenario.assumptions = assumptions;

  return { project: nextProject, scenario: nextScenario, baseValue, shockedValue, warnings };
};

const metricFromOutputs = (outputs: CoreOutputs, metric: SensitivityMetric) => {
  if (metric === "IRR") return outputs.valuation.metrics.irr;
  if (metric === "Payback") return outputs.valuation.metrics.payback;
  if (metric === "DSCR") {
    const value = finiteOrNull(outputs.financing.minimumDscr);
    return value === null
      ? { value: null, status: "not_computable" as const, reason: "DSCR قابل محاسبه نیست چون برنامه خدمت بدهی معتبر یا بدهی فعال وجود ندارد." }
      : { value, status: "ok" as const };
  }
  if (metric === "EquityValue") {
    const value = finiteOrNull(outputs.valuation.fcfeNpv);
    return value === null
      ? { value: null, status: "not_computable" as const, reason: "ارزش حقوق صاحبان سهام قابل محاسبه نیست." }
      : { value, status: "ok" as const };
  }
  if (metric === "BCR") {
    const value = finiteOrNull(outputs.economic.ebcr);
    return value === null
      ? { value: null, status: "not_computable" as const, reason: "BCR اقتصادی قابل محاسبه نیست." }
      : { value, status: "ok" as const };
  }
  return outputs.valuation.metrics.npv;
};

const runCase = (
  project: Project,
  scenario: Scenario,
  variable: ResolvedSensitivityVariable,
  shock: number,
  baseOutputs: CoreOutputs,
  baseMetric: number | null,
  metric: SensitivityMetric,
  runCore: CoreRunner,
): SensitivityPoint => {
  const shocked = applyShock(project, scenario, variable, shock, baseOutputs);
  const outputs = runCore(shocked.project, shocked.scenario, false);
  const metricResult = metricFromOutputs(outputs, metric);
  const metricValue = metricResult.status === "ok" ? finiteOrNull(metricResult.value) : null;
  const warnings = [...shocked.warnings];
  if (metricResult.reason) warnings.push(metricResult.reason);
  if (metricValue === null) warnings.push("خروجی این شوک نامعتبر یا غیرقابل محاسبه است.");
  if (variable.kind === "discountRate" && shocked.shockedValue <= shocked.scenario.assumptions.macro.terminalGrowthRate) {
    warnings.push("نرخ تنزیل کمتر یا مساوی نرخ رشد پایانی است؛ ارزش پایانی پایدار نیست.");
  }
  const absoluteImpact = metricValue !== null && baseMetric !== null ? metricValue - baseMetric : null;
  const percentImpact = safePercentImpact(absoluteImpact, baseMetric);
  const noExposure = variable.kind === "fxRate" && !hasFxExposure(scenario.assumptions);
  const tinyImpact = absoluteImpact !== null && Math.abs(absoluteImpact) < Math.max(1, Math.abs(baseMetric ?? 0) * 0.000001);
  const status: SensitivityRunStatus = metricValue === null
    ? "modelError"
    : noExposure || (tinyImpact && variable.kind === "fxRate")
      ? "noExposure"
      : warnings.length
        ? "watch"
        : "valid";
  const reason = metricValue === null
    ? "Metric could not be calculated for this shock."
    : noExposure
      ? "No material FX exposure is connected to this variable in the current scenario."
      : warnings[0];
  return {
    variableId: variable.id,
    variable: variable.label,
    sourceModule: variable.sourceModule,
    unitType: variable.unitType,
    shock,
    changeType: variable.changeType,
    baseValue: shocked.baseValue,
    shockedValue: shocked.shockedValue,
    baseMetric,
    metric: metricValue,
    absoluteImpact,
    percentImpact,
    elasticity: safeElasticity(percentImpact, shock),
    status,
    warnings: Array.from(new Set(warnings)),
    reason,
    recommendation: status === "noExposure"
      ? "Review FX-linked CAPEX, OPEX, direct-cost, or construction assumptions before relying on FX sensitivity."
      : warnings.length
        ? "Review the source module and rerun sensitivity after resolving the warning."
        : undefined,
  };
};

const buildTornado = (
  variables: ResolvedSensitivityVariable[],
  oneWay: SensitivityPoint[],
  baseMetric: number | null,
) => variables.map((variable): TornadoResult => {
  const points = oneWay.filter((point) => point.variableId === variable.id);
  const low = [...points].sort((left, right) => left.shock - right.shock)[0];
  const high = [...points].sort((left, right) => right.shock - left.shock)[0];
  const lowValue = low?.metric ?? null;
  const highValue = high?.metric ?? null;
  const warnings = Array.from(new Set(points.flatMap((point) => point.warnings)));
  const rangeValue = lowValue !== null && highValue !== null
    ? Math.abs(highValue - lowValue)
    : Math.max(...points.map((point) => Math.abs(point.absoluteImpact ?? 0)), 0);
  const allFlat = points.length > 1 && points.every((point) => Math.abs(point.absoluteImpact ?? 0) < 1);
  if (allFlat) warnings.push("این متغیر در مدل فعلی اثر معنادار نشان نداد؛ اتصال ورودی یا مواجهه مدل را بررسی کنید.");
  const status: SensitivityRunStatus = points.some((point) => point.status === "modelError" || point.status === "invalid")
    ? "modelError"
    : points.every((point) => point.status === "noExposure")
      ? "noExposure"
      : warnings.length
        ? "watch"
        : "valid";
  return {
    variableId: variable.id,
    variable: variable.label,
    sourceModule: variable.sourceModule,
    unitType: variable.unitType,
    low: lowValue,
    high: highValue,
    base: baseMetric,
    range: Number.isFinite(rangeValue) ? rangeValue : 0,
    lowShock: low?.shock ?? variable.low,
    highShock: high?.shock ?? variable.high,
    status,
    warnings,
    reason: warnings[0],
    recommendation: status === "noExposure" ? "Verify that this variable has an active model exposure." : undefined,
  };
}).sort((left, right) => right.range - left.range);

const buildMatrix = (
  project: Project,
  scenario: Scenario,
  rowVariable: ResolvedSensitivityVariable,
  colVariable: ResolvedSensitivityVariable,
  baseOutputs: CoreOutputs,
  metric: SensitivityMetric,
  runCore: CoreRunner,
): SensitivityMatrixCell[] => {
  const rowShocks = range(rowVariable.low, rowVariable.high, rowVariable.steps, 3);
  const colShocks = range(colVariable.low, colVariable.high, colVariable.steps, 3);
  return rowShocks.flatMap((rowShock) =>
    colShocks.map((colShock) => {
      const first = applyShock(project, scenario, colVariable, colShock, baseOutputs);
      const second = applyShock(first.project, first.scenario, rowVariable, rowShock, baseOutputs);
      const outputs = runCore(second.project, second.scenario, false);
      const metricResult = metricFromOutputs(outputs, metric);
      const value = metricResult.status === "ok" ? finiteOrNull(metricResult.value) : null;
      const warnings = Array.from(new Set([...first.warnings, ...second.warnings, metricResult.reason].filter((item): item is string => Boolean(item))));
      return {
        rowVariableId: rowVariable.id,
        colVariableId: colVariable.id,
        rowShock,
        colShock,
        rowValue: second.shockedValue,
        colValue: first.shockedValue,
        value,
        status: value === null ? "modelError" : warnings.length ? "watch" : "valid",
        warnings,
        reason: warnings[0],
      };
    }),
  );
};

const runNpvAtValue = (
  project: Project,
  scenario: Scenario,
  variable: ResolvedSensitivityVariable,
  targetValue: number,
  baseOutputs: CoreOutputs,
  runCore: CoreRunner,
) => {
  const nextProject = cloneProject(project);
  nextProject.activeScenarioId = scenario.id;
  const nextScenario = activeScenario(nextProject, scenario.id);
  const baseValue = getBaseValue(variable.kind, scenario, baseOutputs);
  setVariableValue(nextScenario.assumptions, variable.kind, targetValue, baseValue);
  const outputs = runCore(nextProject, nextScenario, false);
  const metric = metricFromOutputs(outputs, "NPV");
  return metric.status === "ok" ? finiteOrNull(metric.value) : null;
};

const interpolateRoot = (x1: number, y1: number, x2: number, y2: number) => {
  if (Math.abs(y2 - y1) < EPSILON) return (x1 + x2) / 2;
  return x1 - y1 * (x2 - x1) / (y2 - y1);
};

const findThreshold = ({
  id,
  label,
  variable,
  min,
  max,
  unitType,
  project,
  scenario,
  baseOutputs,
  runCore,
  impossibleNegative = true,
}: {
  id: string;
  label: string;
  variable: ResolvedSensitivityVariable;
  min: number;
  max: number;
  unitType: SensitivityUnitType;
  project: Project;
  scenario: Scenario;
  baseOutputs: CoreOutputs;
  runCore: CoreRunner;
  impossibleNegative?: boolean;
}): BreakEvenResult => {
  const lower = Math.min(min, max);
  const upper = Math.max(min, max);
  const target = npvZeroTarget();
  const baseValue = getBaseValue(variable.kind, scenario, baseOutputs);
  const baseMetricValue = finiteOrNull(baseOutputs.valuation.npv);
  const noExposure = variable.kind === "fxRate" && !hasFxExposure(scenario.assumptions);

  const makeResult = (
    status: SensitivityThresholdStatus,
    value: number | null,
    metricValue: number | null,
    reason: string,
    recommendation: string,
  ): BreakEvenResult => ({
    id,
    label,
    variableId: variable.id,
    sourceModule: variable.sourceModule,
    value,
    unit: unitType,
    unitType,
    metric: target.metric,
    target,
    baseValue,
    resultValue: value,
    baseMetricValue,
    metricValue,
    status,
    testedMin: lower,
    testedMax: upper,
    reason,
    recommendation,
  });

  if (noExposure) {
    return makeResult(
      "noExposure",
      null,
      null,
      "No active FX-linked assumptions were found for this scenario.",
      "Connect FX exposure in CAPEX, direct costs, OPEX, or construction inputs, then rerun the threshold.",
    );
  }

  if (!Number.isFinite(lower) || !Number.isFinite(upper) || upper <= lower) {
    return makeResult(
      "insufficientData",
      null,
      null,
      "The tested range is not valid.",
      "Check the base assumption value and threshold range before using this result.",
    );
  }

  const rawPoints = range(lower, upper, 41, 41)
    .map((value) => ({ value, npv: runNpvAtValue(project, scenario, variable, value, baseOutputs, runCore) }));
  const points = rawPoints
    .filter((point): point is { value: number; npv: number } => point.npv !== null && Number.isFinite(point.npv));

  if (!points.length) {
    return makeResult(
      "modelError",
      null,
      null,
      "No valid NPV output was produced inside the tested range.",
      "Review valuation warnings, terminal-growth guards, and the source module before relying on this threshold.",
    );
  }

  for (let index = 0; index < points.length - 1; index += 1) {
    const current = points[index];
    const next = points[index + 1];
    if (Math.abs(current.npv) <= ROOT_TOLERANCE) {
      const value = impossibleNegative && current.value < 0 ? null : current.value;
      if (value === null) {
        return makeResult(
          "invalid",
          null,
          null,
          "The calculated threshold is an impossible negative value.",
          "Review the source assumptions or expand the tested range with non-negative values.",
        );
      }
      if (index === 0 || index === points.length - 1) {
        return makeResult(
          "boundaryOnly",
          null,
          current.npv,
          "The closest target match is only on the tested boundary, not a bracketed root.",
          "Expand the range and rerun before treating this as a real threshold.",
        );
      }
      return makeResult(
        "valid",
        value,
        current.npv,
        "NPV crosses the target within the tested range.",
        "Use this threshold together with the model-quality warnings and scenario assumptions.",
      );
    }
    if (current.npv * next.npv < 0) {
      const value = interpolateRoot(current.value, current.npv, next.value, next.npv);
      if (impossibleNegative && value < 0) {
        return makeResult(
          "invalid",
          null,
          null,
          "The interpolated threshold is an impossible negative value.",
          "Review the source assumptions or expand the tested range with non-negative values.",
        );
      }
      return makeResult(
        "valid",
        value,
        0,
        "NPV crosses the target within the tested range.",
        "Use this threshold together with the model-quality warnings and scenario assumptions.",
      );
    }
  }

  const firstNpv = points[0]?.npv;
  const allFlat = firstNpv !== undefined && points.every((point) => Math.abs(point.npv - firstNpv) < Math.max(1, Math.abs(firstNpv) * 0.000001));
  if (allFlat) {
    return makeResult(
      "noExposure",
      null,
      null,
      "NPV did not materially change across the tested range.",
      "Verify that this variable is connected to the active financial model and selected scenario.",
    );
  }

  return makeResult(
    "notFound",
    null,
    null,
    "NPV did not cross the target within the tested range.",
    "Expand the range or review whether this threshold is meaningful for the current scenario.",
  );
};

const buildBreakEven = (
  project: Project,
  scenario: Scenario,
  baseOutputs: CoreOutputs,
  variables: ResolvedSensitivityVariable[],
  runCore: CoreRunner,
) => {
  const byKind = (kind: SensitivityVariableKind) => variables.find((variable) => variable.kind === kind) ?? defaultVariable(kind);
  const priceBase = getBaseValue("salesPrice", scenario, baseOutputs) ?? 0;
  const volumeBase = getBaseValue("salesVolume", scenario, baseOutputs) ?? 0;
  const revenueBase = getBaseValue("revenue", scenario, baseOutputs) ?? 0;
  const fxBase = getBaseValue("fxRate", scenario, baseOutputs) ?? 0;
  const capexBase = getBaseValue("capex", scenario, baseOutputs) ?? 0;
  const discountBase = getBaseValue("discountRate", scenario, baseOutputs) ?? 0;
  const debtBase = getBaseValue("debtInterest", scenario, baseOutputs) ?? 0;

  const results: BreakEvenResult[] = [
    findThreshold({
      id: "price",
      label: "قیمت سر به سر",
      variable: byKind("salesPrice"),
      min: 0,
      max: Math.max(priceBase * 10, priceBase + 1),
      unitType: "unitPrice",
      project,
      scenario,
      baseOutputs,
      runCore,
    }),
    findThreshold({
      id: "volume",
      label: "حجم سر به سر",
      variable: byKind("salesVolume"),
      min: 0,
      max: Math.max(volumeBase * 10, volumeBase + 1),
      unitType: "volume",
      project,
      scenario,
      baseOutputs,
      runCore,
    }),
    findThreshold({
      id: "sales",
      label: "فروش سر به سر",
      variable: byKind("revenue"),
      min: 0,
      max: Math.max(revenueBase * 10, revenueBase + 1),
      unitType: "totalMoney",
      project,
      scenario,
      baseOutputs,
      runCore,
    }),
    findThreshold({
      id: "fxRate",
      label: "نرخ ارز بحرانی",
      variable: byKind("fxRate"),
      min: 0,
      max: Math.max(fxBase * 5, fxBase + 1),
      unitType: "fxRate",
      project,
      scenario,
      baseOutputs,
      runCore,
    }),
    findThreshold({
      id: "capex",
      label: "CAPEX بحرانی",
      variable: byKind("capex"),
      min: 0,
      max: Math.max(capexBase * 3, capexBase + 1),
      unitType: "totalMoney",
      project,
      scenario,
      baseOutputs,
      runCore,
    }),
    findThreshold({
      id: "wacc",
      label: "نرخ تنزیل بحرانی",
      variable: byKind("discountRate"),
      min: 0,
      max: Math.max(1, discountBase + 0.5, scenario.assumptions.macro.terminalGrowthRate + 0.05),
      unitType: "percentage",
      project,
      scenario,
      baseOutputs,
      runCore,
    }),
    findThreshold({
      id: "debtInterest",
      label: "نرخ بهره بحرانی",
      variable: byKind("debtInterest"),
      min: 0,
      max: Math.max(1, debtBase + 0.5),
      unitType: "percentage",
      project,
      scenario,
      baseOutputs,
      runCore,
    }),
    findThreshold({
      id: "delay",
      label: "تاخیر بحرانی",
      variable: byKind("delay"),
      min: 0,
      max: 120,
      unitType: "months",
      project,
      scenario,
      baseOutputs,
      runCore,
    }),
  ];

  const resultValue = (id: string) => results.find((result) => result.id === id && result.status === "valid")?.value ?? null;
  return {
    price: resultValue("price"),
    volume: resultValue("volume"),
    sales: resultValue("sales"),
    fxRate: resultValue("fxRate"),
    capex: resultValue("capex"),
    wacc: resultValue("wacc"),
    debtInterest: resultValue("debtInterest"),
    delay: resultValue("delay"),
    results,
  };
};

const buildQualityWarnings = (project: Project, scenario: Scenario, outputs: CoreOutputs): SensitivityWarning[] => {
  const warnings: SensitivityWarning[] = [];
  const add = (
    id: string,
    severity: SensitivityWarning["severity"],
    message: string,
    sourceModule?: string,
    recommendation = "قبل از تصمیم نهایی، مفروضات مرتبط را بررسی و مدل را دوباره اجرا کنید.",
    actionSlug?: SensitivityWarning["actionSlug"],
  ) => {
    warnings.push({ id, severity, message, sourceModule, recommendation, actionSlug });
  };
  if (outputs.valuation.npv < 0) add("base-negative-npv", "warning", "NPV مبنا منفی است؛ نتایج حساسیت باید به عنوان تحلیل ریسک/احیا تفسیر شود.", "Valuation", "سناریو و نرخ تنزیل را در ماژول ارزش‌گذاری بازبینی کنید.", "valuation");
  if (outputs.financing.minimumDscr !== null && outputs.financing.minimumDscr < scenario.assumptions.financing.targetDscr) {
    add("base-low-dscr", "error", "حداقل DSCR کمتر از هدف بانک است.", "Financing", "برنامه بدهی، دوره تنفس، یا ساختار تامین مالی را بازبینی کنید.", "financing");
  }
  if (outputs.valuation.metrics.irr.status !== "ok") add("base-invalid-irr", "warning", "IRR مبنا قابل اتکا یا قابل محاسبه نیست.", "Valuation", "جریان‌های نقدی و علامت آن‌ها را در ارزش‌گذاری بررسی کنید.", "valuation");
  if ((outputs.revenue.rows[1]?.revenue ?? 0) <= 0) add("missing-revenue", "error", "درآمد سال اول صفر یا نامعتبر است.", "Revenue", "قیمت، ظرفیت و مفروضات بازار را اصلاح کنید.", "revenue");
  if (outputs.capex.totalCapex <= 0) add("missing-capex", "error", "CAPEX مبنا صفر یا نامعتبر است.", "CAPEX", "اقلام سرمایه‌گذاری را در ماژول CAPEX بررسی کنید.", "capex");
  if (scenario.assumptions.macro.defaultDiscountRate <= scenario.assumptions.macro.terminalGrowthRate) {
    add("terminal-growth-invalid", "error", "نرخ تنزیل کمتر یا مساوی نرخ رشد پایانی است؛ ارزش پایانی معتبر نیست.", "Valuation", "نرخ تنزیل یا نرخ رشد پایانی را اصلاح کنید.", "valuation");
  }
  const balanceIssues = outputs.validations.filter((issue) => issue.id.startsWith("statements.balance-") && issue.severity !== "info");
  if (balanceIssues.length) add("balance-mismatch", "warning", "صورت‌های مالی دارای عدم تراز در برخی سال‌ها هستند.", "Financial Statements", "صورت‌های مالی و اجزای ترازنامه را قبل از اتکا به حساسیت بررسی کنید.", "financial-statements");
  if (outputs.financing.schedule.length === 0 && scenario.assumptions.financing.longTermDebt > 0) {
    add("missing-financing-schedule", "error", "برنامه تامین مالی برای بدهی فعال کامل نیست.", "Financing", "ابزارهای تامین مالی و زمان‌بندی بازپرداخت را کامل کنید.", "financing");
  }
  const nonFinite = [
    outputs.valuation.npv,
    outputs.valuation.nominalFcffNpv,
    outputs.financing.minimumDscr,
    outputs.capex.totalCapex,
  ].some((value) => typeof value === "number" && !Number.isFinite(value));
  if (nonFinite) add("non-finite-base-output", "error", "یکی از خروجی‌های مبنا مقدار غیرمتناهی دارد.", "Model", "خروجی‌های مبنا را از ماژول‌های منبع بررسی کنید.");
  if (project.modelHorizonYears <= 0) add("invalid-horizon", "error", "افق تحلیل پروژه معتبر نیست.", "Project Setup", "افق مدل را در تنظیمات پروژه اصلاح کنید.", "setup");
  return warnings;
};

const buildProvenance = (scenario: Scenario, outputs: CoreOutputs): SensitivityAssumptionProvenance[] => {
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

export const emptySensitivity = () => ({
  baseMetric: null,
  selectedMetric: "NPV" as SensitivityMetric,
  metricMetadata: metricMetadata("NPV"),
  target: npvZeroTarget(),
  oneWay: [],
  matrix: [],
  tornado: [],
  breakEven: {
    price: null,
    volume: null,
    sales: null,
    fxRate: null,
    capex: null,
    wacc: null,
    debtInterest: null,
    delay: null,
    results: [],
  },
  qualityWarnings: [],
  assumptionProvenance: [],
});

export const applySensitivityShockByName = (
  project: Project,
  scenario: Scenario,
  parameter: string,
  shock: number,
  baseOutputs: CoreOutputs,
  changeType: "percent" | "absolute" = "percent",
) => {
  const kind = variableKindFromText(parameter);
  const meta = variableMeta[kind];
  const variable: ResolvedSensitivityVariable = {
    id: `shock-${kind}`,
    parameter,
    label: meta.label,
    low: shock,
    high: shock,
    steps: 1,
    changeType: kind === "delay" || kind === "workingCapitalDays" ? "absolute" : changeType,
    sourceModule: meta.sourceModule,
    sourcePath: meta.sourcePath,
    unitType: meta.unitType,
    kind,
  };
  return applyShock(project, scenario, variable, shock, baseOutputs);
};

export const calculateSensitivityAnalysis = (
  project: Project,
  scenario: Scenario,
  baseOutputs: CoreOutputs,
  runCore: CoreRunner,
) => {
  const selectedMetric = scenario.assumptions.sensitivity.selectedMetric;
  const baseMetricResult = metricFromOutputs(baseOutputs, selectedMetric);
  const baseMetric = baseMetricResult.status === "ok" ? finiteOrNull(baseMetricResult.value) : null;
  const variables = resolveVariables(scenario);

  const oneWay: SensitivityPoint[] = variables.flatMap((variable) =>
    range(variable.low, variable.high, variable.steps).map((shock) =>
      runCase(project, scenario, variable, shock, baseOutputs, baseMetric, selectedMetric, runCore)
    )
  );
  const matrixColumn = variables[0] ?? defaultVariable("salesPrice");
  const matrixRow = variables[1] ?? defaultVariable("capex");
  const matrix = buildMatrix(project, scenario, matrixRow, matrixColumn, baseOutputs, selectedMetric, runCore);
  const tornado = buildTornado(variables, oneWay, baseMetric);
  const breakEven = buildBreakEven(project, scenario, baseOutputs, variables, runCore);
  const qualityWarnings = buildQualityWarnings(project, scenario, baseOutputs);
  if (baseMetricResult.reason) {
    qualityWarnings.push({
      id: "base-metric-invalid",
      severity: "error",
      message: baseMetricResult.reason,
      sourceModule: "Valuation",
      recommendation: "شاخص خروجی انتخاب‌شده را تغییر دهید یا علت نامعتبر بودن آن را در ماژول منبع اصلاح کنید.",
      actionSlug: "valuation",
    });
  }

  return {
    baseMetric,
    selectedMetric,
    metricMetadata: metricMetadata(selectedMetric),
    target: npvZeroTarget(),
    oneWay,
    matrix,
    tornado,
    breakEven,
    qualityWarnings,
    assumptionProvenance: buildProvenance(scenario, baseOutputs),
  };
};
