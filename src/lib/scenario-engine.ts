import { resolveMacroGrowthRate } from "@/lib/phase-one-calculations";
import type { Scenario, ScenarioAdjustments, ScenarioAssumptions } from "@/lib/types";

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export type ScenarioDriverSemantic = "percentage-point-delta" | "multiplier" | "day-delta" | "months";
export type ScenarioDriverMode = "basic" | "advanced";
export type ScenarioDriverGroup = "market" | "operating-costs" | "investment" | "working-capital" | "financing" | "macro" | "schedule";

export type ScenarioDriverDescriptor = {
  key: Exclude<keyof ScenarioAdjustments, "probability" | "riskWeight">;
  label: string;
  group: ScenarioDriverGroup;
  unit: "pp" | "multiplier" | "days" | "months";
  semantic: ScenarioDriverSemantic;
  mode: ScenarioDriverMode;
  neutralValue: number;
  validation: string;
};

export const scenarioDriverDescriptors: readonly ScenarioDriverDescriptor[] = [
  { key: "salesPriceGrowthDelta", label: "رشد سالانه قیمت فروش", group: "market", unit: "pp", semantic: "percentage-point-delta", mode: "basic", neutralValue: 0, validation: "نرخ مؤثر باید در دامنه معتبر رشد سالانه باشد." },
  { key: "salesVolumeMultiplier", label: "حجم فروش / تقاضا", group: "market", unit: "multiplier", semantic: "multiplier", mode: "basic", neutralValue: 1, validation: "ضریب باید عددی متناهی و بزرگ‌تر از صفر باشد." },
  { key: "capacityMultiplier", label: "ظرفیت تولید", group: "market", unit: "multiplier", semantic: "multiplier", mode: "basic", neutralValue: 1, validation: "ضریب باید عددی متناهی و بزرگ‌تر از صفر باشد." },
  { key: "inflationRateDelta", label: "تورم عمومی", group: "operating-costs", unit: "pp", semantic: "percentage-point-delta", mode: "basic", neutralValue: 0, validation: "نرخ مؤثر باید در دامنه معتبر رشد سالانه باشد." },
  { key: "wageGrowthDelta", label: "رشد دستمزد", group: "operating-costs", unit: "pp", semantic: "percentage-point-delta", mode: "advanced", neutralValue: 0, validation: "نرخ مؤثر باید در دامنه معتبر رشد سالانه باشد." },
  { key: "rawMaterialGrowthDelta", label: "رشد مواد اولیه", group: "operating-costs", unit: "pp", semantic: "percentage-point-delta", mode: "advanced", neutralValue: 0, validation: "نرخ مؤثر باید در دامنه معتبر رشد سالانه باشد." },
  { key: "energyGrowthDelta", label: "رشد هزینه انرژی", group: "operating-costs", unit: "pp", semantic: "percentage-point-delta", mode: "advanced", neutralValue: 0, validation: "نرخ مؤثر باید در دامنه معتبر رشد سالانه باشد." },
  { key: "capexMultiplier", label: "سرمایه‌گذاری ثابت (CAPEX)", group: "investment", unit: "multiplier", semantic: "multiplier", mode: "basic", neutralValue: 1, validation: "ضریب باید عددی متناهی و بزرگ‌تر از صفر باشد." },
  { key: "receivableDaysDelta", label: "روزهای وصول مطالبات", group: "working-capital", unit: "days", semantic: "day-delta", mode: "advanced", neutralValue: 0, validation: "روزهای مؤثر وصول نمی‌تواند منفی باشد." },
  { key: "payableDaysDelta", label: "روزهای پرداخت بدهی", group: "working-capital", unit: "days", semantic: "day-delta", mode: "advanced", neutralValue: 0, validation: "روزهای مؤثر پرداخت نمی‌تواند منفی باشد." },
  { key: "financingRateDelta", label: "نرخ تأمین مالی", group: "financing", unit: "pp", semantic: "percentage-point-delta", mode: "basic", neutralValue: 0, validation: "نرخ مؤثر ابزارهای تأمین مالی باید بین صفر و صد درصد باشد." },
  { key: "fxRateMultiplier", label: "سطح نرخ ارز", group: "macro", unit: "multiplier", semantic: "multiplier", mode: "basic", neutralValue: 1, validation: "ضریب باید عددی متناهی و بزرگ‌تر از صفر باشد." },
  { key: "taxRateDelta", label: "نرخ مالیات", group: "macro", unit: "pp", semantic: "percentage-point-delta", mode: "advanced", neutralValue: 0, validation: "نرخ مؤثر مالیات باید بین صفر و صد درصد باشد." },
  { key: "executionDelayMonths", label: "تأخیر ساخت", group: "schedule", unit: "months", semantic: "months", mode: "basic", neutralValue: 0, validation: "تأخیر باید عدد صحیح و نامنفی باشد." },
] as const;

export const baseScenarioAdjustments: ScenarioAdjustments = {
  inflationRateDelta: 0,
  salesPriceGrowthDelta: 0,
  wageGrowthDelta: 0,
  energyGrowthDelta: 0,
  rawMaterialGrowthDelta: 0,
  fxRateMultiplier: 1,
  capexMultiplier: 1,
  salesVolumeMultiplier: 1,
  capacityMultiplier: 1,
  receivableDaysDelta: 0,
  payableDaysDelta: 0,
  financingRateDelta: 0,
  taxRateDelta: 0,
  executionDelayMonths: 0,
  probability: 0.5,
  riskWeight: 1,
};

// Legacy scenario types remain loadable, but unsupported presets receive no invented shock coefficients.
export const defaultScenarioAdjustments = (type: Scenario["type"]): ScenarioAdjustments => {
  void type;
  return { ...baseScenarioAdjustments };
};

export type ScenarioAdjustmentError = {
  key: ScenarioDriverDescriptor["key"] | "adjustments";
  message: string;
};

const growthInRange = (value: number) => Number.isFinite(value) && value >= -1 && value <= 3;
const rateInRange = (value: number) => Number.isFinite(value) && value >= 0 && value <= 1;

export const validateScenarioAdjustments = (
  source: ScenarioAssumptions,
  adjustments: ScenarioAdjustments,
): ScenarioAdjustmentError[] => {
  const errors: ScenarioAdjustmentError[] = [];
  const add = (key: ScenarioAdjustmentError["key"], message: string) => errors.push({ key, message });

  scenarioDriverDescriptors.forEach((driver) => {
    if (!Number.isFinite(adjustments[driver.key])) add(driver.key, "مقدار باید یک عدد متناهی باشد.");
  });
  if (errors.length) return errors;

  const growthChecks: Array<[ScenarioDriverDescriptor["key"], number]> = [
    ["inflationRateDelta", source.macro.inflationGeneralAnnual + adjustments.inflationRateDelta],
    ["salesPriceGrowthDelta", resolveMacroGrowthRate(source.macro, "salesPriceGrowth", 1, source.market.priceGrowthRate) + adjustments.salesPriceGrowthDelta],
    ["wageGrowthDelta", resolveMacroGrowthRate(source.macro, "wageGrowth", 1, source.directCosts.directLaborGrowthFactor) + adjustments.wageGrowthDelta],
    ["energyGrowthDelta", resolveMacroGrowthRate(source.macro, "energyGrowth", 1, source.directCosts.energyTariffGrowthRate) + adjustments.energyGrowthDelta],
    ["rawMaterialGrowthDelta", resolveMacroGrowthRate(source.macro, "rawMaterialGrowth", 1, source.directCosts.rialRawMaterialGrowthRate) + adjustments.rawMaterialGrowthDelta],
  ];
  growthChecks.forEach(([key, value]) => {
    if (!growthInRange(value)) add(key, "نرخ مؤثر باید بین منفی ۱۰۰٪ و ۳۰۰٪ باشد.");
  });

  (["fxRateMultiplier", "capexMultiplier", "salesVolumeMultiplier", "capacityMultiplier"] as const).forEach((key) => {
    if (adjustments[key] <= 0) add(key, "ضریب باید بزرگ‌تر از صفر باشد.");
  });

  if (source.workingCapital.receivableDays + adjustments.receivableDaysDelta < 0) add("receivableDaysDelta", "روزهای مؤثر وصول نمی‌تواند منفی باشد.");
  if (source.workingCapital.payableDays + adjustments.payableDaysDelta < 0) add("payableDaysDelta", "روزهای مؤثر پرداخت نمی‌تواند منفی باشد.");

  const financingRates = [
    source.financing.interestRate + adjustments.financingRateDelta,
    ...(source.financing.instruments ?? []).map((instrument) => instrument.annualRate + adjustments.financingRateDelta),
  ];
  if (financingRates.some((rate) => !rateInRange(rate))) add("financingRateDelta", "نرخ مؤثر تأمین مالی باید بین صفر و صد درصد باشد.");

  const taxRates = [
    source.macro.corporateTaxRate + adjustments.taxRateDelta,
    source.macro.incomeTaxRate + adjustments.taxRateDelta,
    (source.tax.normalTaxRateOverride ?? source.macro.corporateTaxRate) + adjustments.taxRateDelta,
  ];
  if (taxRates.some((rate) => !rateInRange(rate))) add("taxRateDelta", "نرخ مؤثر مالیات باید بین صفر و صد درصد باشد.");

  if (!Number.isInteger(adjustments.executionDelayMonths) || adjustments.executionDelayMonths < 0) {
    add("executionDelayMonths", "تأخیر ساخت باید عدد صحیح و نامنفی باشد.");
  }
  return errors;
};

export class ScenarioValidationError extends Error {
  readonly issues: ScenarioAdjustmentError[];

  constructor(issues: ScenarioAdjustmentError[]) {
    super("Scenario adjustments are invalid.");
    this.name = "ScenarioValidationError";
    this.issues = issues;
  }
}

const addRate = (value: number, delta: number) => value + delta;
const multiply = (value: number, factor: number) => value * factor;
const effectiveGrowth = (
  source: ScenarioAssumptions,
  key: "salesPriceGrowth" | "wageGrowth" | "energyGrowth" | "rawMaterialGrowth",
  specific: number,
  delta: number,
) => addRate(resolveMacroGrowthRate(source.macro, key, 1, specific), delta);

export const calculateScenarioAdjustedAssumptions = (
  source: ScenarioAssumptions,
  adjustments: ScenarioAdjustments,
): ScenarioAssumptions => {
  const validation = validateScenarioAdjustments(source, adjustments);
  if (validation.length) throw new ScenarioValidationError(validation);

  const next = clone(source);
  const sourceCorporateTaxRate = source.macro.corporateTaxRate;

  next.macro.inflationRate = addRate(source.macro.inflationRate, adjustments.inflationRateDelta);
  next.macro.inflationGeneralAnnual = addRate(source.macro.inflationGeneralAnnual, adjustments.inflationRateDelta);
  next.macro.salesPriceGrowth = addRate(source.macro.salesPriceGrowth, adjustments.salesPriceGrowthDelta);
  next.macro.wageGrowth = addRate(source.macro.wageGrowth, adjustments.wageGrowthDelta);
  next.macro.energyGrowth = addRate(source.macro.energyGrowth, adjustments.energyGrowthDelta);
  next.macro.rawMaterialGrowth = addRate(source.macro.rawMaterialGrowth, adjustments.rawMaterialGrowthDelta);
  next.macro.growthPaths = (source.macro.growthPaths ?? []).map((point) => {
    const delta = point.key === "salesPriceGrowth" ? adjustments.salesPriceGrowthDelta
      : point.key === "wageGrowth" ? adjustments.wageGrowthDelta
        : point.key === "energyGrowth" ? adjustments.energyGrowthDelta
          : point.key === "rawMaterialGrowth" ? adjustments.rawMaterialGrowthDelta
            : point.key === "inflationGeneralAnnual" ? adjustments.inflationRateDelta
              : 0;
    return { ...point, rate: addRate(point.rate, delta) };
  });

  next.macro.officialFxRate = multiply(source.macro.officialFxRate, adjustments.fxRateMultiplier);
  next.macro.freeMarketFxRate = multiply(source.macro.freeMarketFxRate, adjustments.fxRateMultiplier);
  next.macro.remittanceFxRate = multiply(source.macro.remittanceFxRate, adjustments.fxRateMultiplier);
  next.macro.baseFxRate = multiply(source.macro.baseFxRate, adjustments.fxRateMultiplier);
  next.macro.fxRates = Object.fromEntries(
    Object.entries(source.macro.fxRates).map(([key, value]) => [key, multiply(value, adjustments.fxRateMultiplier)]),
  ) as typeof next.macro.fxRates;
  next.macro.corporateTaxRate = addRate(source.macro.corporateTaxRate, adjustments.taxRateDelta);
  next.macro.incomeTaxRate = addRate(source.macro.incomeTaxRate, adjustments.taxRateDelta);

  const salesFactor = adjustments.salesVolumeMultiplier;
  next.market.totalMarketSize = multiply(source.market.totalMarketSize, salesFactor);
  next.market.addressableMarket = multiply(source.market.addressableMarket, salesFactor);
  next.market.serviceableAvailableMarket = multiply(source.market.serviceableAvailableMarket, salesFactor);
  next.market.targetMarket = multiply(source.market.targetMarket, salesFactor);
  next.market.targetMarketSize = multiply(source.market.targetMarketSize, salesFactor);
  next.market.demandLimit = multiply(source.market.demandLimit, salesFactor);
  next.market.salesCeiling = multiply(source.market.salesCeiling, salesFactor);
  next.market.priceGrowthRate = effectiveGrowth(source, "salesPriceGrowth", source.market.priceGrowthRate, adjustments.salesPriceGrowthDelta);

  next.capacity.nominalCapacity = multiply(source.capacity.nominalCapacity, adjustments.capacityMultiplier);
  next.capacity.utilizationYear1 = next.capacity.firstYearUtilizationRate;
  next.capacity.utilizationYear2 = next.capacity.secondYearUtilizationRate;
  next.capacity.utilizationStable = next.capacity.stableYearUtilizationRate;
  next.industry.nominalCapacity = next.capacity.nominalCapacity;
  next.industry.firstYearUtilization = next.capacity.firstYearUtilizationRate;
  next.industry.stableUtilization = next.capacity.stableYearUtilizationRate;

  next.directCosts.rialRawMaterialGrowthRate = effectiveGrowth(source, "rawMaterialGrowth", source.directCosts.rialRawMaterialGrowthRate, adjustments.rawMaterialGrowthDelta);
  next.directCosts.fxRawMaterialGrowthRate = effectiveGrowth(source, "rawMaterialGrowth", source.directCosts.fxRawMaterialGrowthRate, adjustments.rawMaterialGrowthDelta);
  next.directCosts.directLaborGrowthFactor = effectiveGrowth(source, "wageGrowth", source.directCosts.directLaborGrowthFactor, adjustments.wageGrowthDelta);
  next.directCosts.energyTariffGrowthRate = effectiveGrowth(source, "energyGrowth", source.directCosts.energyTariffGrowthRate, adjustments.energyGrowthDelta);
  next.opex.scenarioAdjustmentRate = addRate(source.opex.scenarioAdjustmentRate, adjustments.inflationRateDelta);

  next.capex.items = source.capex.items.map((item) => ({
    ...item,
    rialUnitPrice: multiply(item.rialUnitPrice, adjustments.capexMultiplier),
    fxUnitPrice: multiply(item.fxUnitPrice, adjustments.capexMultiplier),
    unitPrice: multiply(item.unitPrice, adjustments.capexMultiplier),
    delayEnabled: item.delayEnabled || adjustments.executionDelayMonths > 0,
    delayMonths: item.delayMonths + adjustments.executionDelayMonths,
  }));

  next.workingCapital.receivableDays = source.workingCapital.receivableDays + adjustments.receivableDaysDelta;
  next.workingCapital.payableDays = source.workingCapital.payableDays + adjustments.payableDaysDelta;
  next.industry.receivablesDays = next.workingCapital.receivableDays;
  next.industry.payablesDays = next.workingCapital.payableDays;

  next.financing.interestRate = source.financing.interestRate + adjustments.financingRateDelta;
  next.financing.instruments = source.financing.instruments?.map((instrument) => ({
    ...instrument,
    annualRate: instrument.annualRate + adjustments.financingRateDelta,
  }));
  next.tax.normalTaxRateOverride = (source.tax.normalTaxRateOverride ?? sourceCorporateTaxRate) + adjustments.taxRateDelta;
  next.construction.delayScenarioEnabled = source.construction.delayScenarioEnabled || adjustments.executionDelayMonths > 0;
  next.construction.actualDelayMonths = (source.construction.actualDelayMonths ?? 0) + adjustments.executionDelayMonths;

  return next;
};

export const scenarioHasNonNeutralAdjustments = (adjustments: ScenarioAdjustments) =>
  scenarioDriverDescriptors.some((driver) => adjustments[driver.key] !== driver.neutralValue);

export const scenarioAdjustmentsForClone = (scenario: Pick<Scenario, "type" | "adjustments">) =>
  scenario.type === "base" ? defaultScenarioAdjustments("custom") : clone(scenario.adjustments);

export const scenarioAdjustmentsEqual = (left: ScenarioAdjustments, right: ScenarioAdjustments) =>
  scenarioDriverDescriptors.every((driver) => left[driver.key] === right[driver.key])
  && left.probability === right.probability
  && left.riskWeight === right.riskWeight;
