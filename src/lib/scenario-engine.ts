import type { Scenario, ScenarioAdjustments, ScenarioAssumptions } from "@/lib/types";

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
const nonNegative = (value: number) => Math.max(0, Number.isFinite(value) ? value : 0);

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

export const defaultScenarioAdjustments = (type: Scenario["type"]): ScenarioAdjustments => {
  const base = { ...baseScenarioAdjustments };
  if (type === "optimistic") return {
    ...base,
    inflationRateDelta: -0.03,
    salesPriceGrowthDelta: 0.03,
    wageGrowthDelta: -0.02,
    fxRateMultiplier: 0.95,
    capexMultiplier: 0.95,
    salesVolumeMultiplier: 1.1,
    capacityMultiplier: 1.05,
    receivableDaysDelta: -10,
    payableDaysDelta: 10,
    financingRateDelta: -0.02,
    probability: 0.15,
    riskWeight: 0.8,
  };
  if (type === "pessimistic") return {
    ...base,
    inflationRateDelta: 0.08,
    salesPriceGrowthDelta: -0.03,
    wageGrowthDelta: 0.06,
    energyGrowthDelta: 0.08,
    rawMaterialGrowthDelta: 0.08,
    fxRateMultiplier: 1.25,
    capexMultiplier: 1.12,
    salesVolumeMultiplier: 0.88,
    capacityMultiplier: 0.9,
    receivableDaysDelta: 30,
    payableDaysDelta: -10,
    financingRateDelta: 0.05,
    executionDelayMonths: 6,
    probability: 0.15,
    riskWeight: 1.4,
  };
  if (type === "fx-shock") return {
    ...base,
    fxRateMultiplier: 1.45,
    capexMultiplier: 1.12,
    rawMaterialGrowthDelta: 0.08,
    financingRateDelta: 0.02,
    probability: 0.07,
    riskWeight: 1.55,
  };
  if (type === "inflation-shock") return {
    ...base,
    inflationRateDelta: 0.18,
    salesPriceGrowthDelta: 0.1,
    wageGrowthDelta: 0.14,
    energyGrowthDelta: 0.18,
    rawMaterialGrowthDelta: 0.18,
    fxRateMultiplier: 1.35,
    capexMultiplier: 1.18,
    receivableDaysDelta: 15,
    financingRateDelta: 0.08,
    probability: 0.08,
    riskWeight: 1.6,
  };
  if (type === "delay") return {
    ...base,
    capexMultiplier: 1.08,
    salesVolumeMultiplier: 0.95,
    financingRateDelta: 0.02,
    executionDelayMonths: 6,
    probability: 0.05,
    riskWeight: 1.5,
  };
  return base;
};

export const calculateScenarioAdjustedAssumptions = (
  source: ScenarioAssumptions,
  adjustments: ScenarioAdjustments,
): ScenarioAssumptions => {
  const next = clone(source);
  const addRate = (value: number, delta: number) => Math.max(-0.99, value + delta);
  const multiply = (value: number, factor: number) => nonNegative(value * nonNegative(factor));
  const sourceCorporateTaxRate = next.macro.corporateTaxRate;

  next.macro.inflationRate = addRate(next.macro.inflationRate, adjustments.inflationRateDelta);
  next.macro.inflationGeneralAnnual = addRate(next.macro.inflationGeneralAnnual, adjustments.inflationRateDelta);
  next.macro.salesPriceGrowth = addRate(next.macro.salesPriceGrowth, adjustments.salesPriceGrowthDelta);
  next.macro.wageGrowth = addRate(next.macro.wageGrowth, adjustments.wageGrowthDelta);
  next.macro.energyGrowth = addRate(next.macro.energyGrowth, adjustments.energyGrowthDelta);
  next.macro.rawMaterialGrowth = addRate(next.macro.rawMaterialGrowth, adjustments.rawMaterialGrowthDelta);
  next.macro.fxGrowthRate = addRate(next.macro.fxGrowthRate, Math.max(0, adjustments.fxRateMultiplier - 1));
  next.macro.officialFxRate = multiply(next.macro.officialFxRate, adjustments.fxRateMultiplier);
  next.macro.freeMarketFxRate = multiply(next.macro.freeMarketFxRate, adjustments.fxRateMultiplier);
  next.macro.remittanceFxRate = multiply(next.macro.remittanceFxRate, adjustments.fxRateMultiplier);
  next.macro.baseFxRate = multiply(next.macro.baseFxRate, adjustments.fxRateMultiplier);
  next.macro.fxRates = Object.fromEntries(
    Object.entries(next.macro.fxRates).map(([key, value]) => [key, multiply(value, adjustments.fxRateMultiplier)]),
  ) as typeof next.macro.fxRates;
  next.macro.corporateTaxRate = clamp(next.macro.corporateTaxRate + adjustments.taxRateDelta);
  next.macro.incomeTaxRate = clamp(next.macro.incomeTaxRate + adjustments.taxRateDelta);

  const salesFactor = nonNegative(adjustments.salesVolumeMultiplier);
  next.market.totalMarketSize = multiply(next.market.totalMarketSize, salesFactor);
  next.market.addressableMarket = multiply(next.market.addressableMarket, salesFactor);
  next.market.serviceableAvailableMarket = multiply(next.market.serviceableAvailableMarket, salesFactor);
  next.market.targetMarket = multiply(next.market.targetMarket, salesFactor);
  next.market.targetMarketSize = multiply(next.market.targetMarketSize, salesFactor);
  next.market.demandLimit = multiply(next.market.demandLimit, salesFactor);
  next.market.salesCeiling = multiply(next.market.salesCeiling, salesFactor);
  next.market.baseSalesPrice = multiply(next.market.baseSalesPrice, 1 + adjustments.salesPriceGrowthDelta);
  next.market.unitSalesPrice = multiply(next.market.unitSalesPrice, 1 + adjustments.salesPriceGrowthDelta);
  next.market.priceGrowthRate = addRate(next.market.priceGrowthRate, adjustments.salesPriceGrowthDelta);

  const capacityFactor = nonNegative(adjustments.capacityMultiplier);
  next.capacity.nominalCapacity = multiply(next.capacity.nominalCapacity, capacityFactor);
  next.capacity.firstYearUtilizationRate = clamp(next.capacity.firstYearUtilizationRate * capacityFactor);
  next.capacity.secondYearUtilizationRate = clamp(next.capacity.secondYearUtilizationRate * capacityFactor);
  next.capacity.stableYearUtilizationRate = clamp(next.capacity.stableYearUtilizationRate * capacityFactor);
  next.capacity.utilizationYear1 = next.capacity.firstYearUtilizationRate;
  next.capacity.utilizationYear2 = next.capacity.secondYearUtilizationRate;
  next.capacity.utilizationStable = next.capacity.stableYearUtilizationRate;
  next.industry.nominalCapacity = next.capacity.nominalCapacity;
  next.industry.firstYearUtilization = next.capacity.firstYearUtilizationRate;
  next.industry.stableUtilization = next.capacity.stableYearUtilizationRate;

  next.directCosts.rialRawMaterialGrowthRate = addRate(next.directCosts.rialRawMaterialGrowthRate, adjustments.rawMaterialGrowthDelta);
  next.directCosts.fxRawMaterialGrowthRate = addRate(next.directCosts.fxRawMaterialGrowthRate, adjustments.rawMaterialGrowthDelta);
  next.directCosts.directLaborGrowthFactor = addRate(next.directCosts.directLaborGrowthFactor, adjustments.wageGrowthDelta);
  next.directCosts.energyTariffGrowthRate = addRate(next.directCosts.energyTariffGrowthRate, adjustments.energyGrowthDelta);
  next.opex.scenarioAdjustmentRate = addRate(next.opex.scenarioAdjustmentRate, adjustments.inflationRateDelta);

  next.capex.items = next.capex.items.map((item) => ({
    ...item,
    rialUnitPrice: multiply(item.rialUnitPrice, adjustments.capexMultiplier),
    fxUnitPrice: multiply(item.fxUnitPrice, adjustments.capexMultiplier),
    unitPrice: multiply(item.unitPrice, adjustments.capexMultiplier),
    delayEnabled: item.delayEnabled || adjustments.executionDelayMonths > 0,
    delayMonths: nonNegative(item.delayMonths + adjustments.executionDelayMonths),
  }));

  next.industry.receivablesDays = nonNegative(next.industry.receivablesDays + adjustments.receivableDaysDelta);
  next.industry.payablesDays = nonNegative(next.industry.payablesDays + adjustments.payableDaysDelta);
  next.workingCapital.receivableDays = next.industry.receivablesDays;
  next.workingCapital.payableDays = next.industry.payablesDays;

  next.financing.interestRate = nonNegative(next.financing.interestRate + adjustments.financingRateDelta);
  next.financing.instruments = next.financing.instruments?.map((instrument) => ({
    ...instrument,
    annualRate: nonNegative(instrument.annualRate + adjustments.financingRateDelta),
  }));
  next.tax.normalTaxRateOverride = clamp((next.tax.normalTaxRateOverride ?? sourceCorporateTaxRate) + adjustments.taxRateDelta);
  next.construction.delayScenarioEnabled = next.construction.delayScenarioEnabled || adjustments.executionDelayMonths > 0;
  next.construction.actualDelayMonths = nonNegative((next.construction.actualDelayMonths ?? 0) + adjustments.executionDelayMonths);

  return next;
};
