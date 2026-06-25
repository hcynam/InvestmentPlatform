import { calculateFxRateByType, type StructuredResult } from "@/lib/phase-one-calculations";
import type {
  CapexAnnualSchedule,
  CapexAssumptions,
  CapexItem,
  CapexItemOutputs,
  CapexSummary,
  CapacityAssumptions,
  CapacityProductionOutputs,
  DirectCostAssumptions,
  DirectCostOutputs,
  FormulaTrace,
  MacroAssumptions,
  OpexAssumptions,
  OpexOutputs,
  ProjectSetup,
  ValidationIssue,
} from "@/lib/types";
import { calculateDepreciationSchedule } from "@/lib/depreciation-engine";

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(Math.max(Number.isFinite(value) ? value : 0, minimum), maximum);

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

const issue = (
  id: string,
  severity: ValidationIssue["severity"],
  module: string,
  field: string,
  message: string,
  recommendation: string,
  sourceSheet: string,
  sourceCell: string,
): ValidationIssue => ({
  id,
  severity,
  module,
  field,
  message,
  recommendation,
  sourceSheet,
  sourceCell,
});

const trace = (
  id: string,
  label: string,
  formula: string,
  inputs: FormulaTrace["inputs"],
  result: FormulaTrace["result"],
  sourceSheet: string,
  sourceCell: string,
): FormulaTrace => ({ id, label, formula, inputs, result, sourceSheet, sourceCell });

const safeDate = (value: string) => {
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
};

export const addMonthsToDate = (value: string, months: number) => {
  const source = safeDate(value);
  if (!source) return "";
  const day = source.getUTCDate();
  const result = new Date(Date.UTC(source.getUTCFullYear(), source.getUTCMonth(), 1));
  result.setUTCMonth(result.getUTCMonth() + Math.max(0, Math.round(months)));
  const finalDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(day, finalDay));
  return result.toISOString().slice(0, 10);
};

export const calculateOperationStartDate = (
  setup: Pick<
    ProjectSetup,
    | "constructionStartDate"
    | "constructionDurationMonths"
    | "operationStartDateOverrideEnabled"
    | "operationStartDateManual"
  >,
): StructuredResult<{ calculatedDate: string; operationStartDate: string }> => {
  const calculatedDate = addMonthsToDate(setup.constructionStartDate, setup.constructionDurationMonths);
  const operationStartDate =
    setup.operationStartDateOverrideEnabled && setup.operationStartDateManual
      ? setup.operationStartDateManual
      : calculatedDate;
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  if (!calculatedDate) {
    errors.push(issue(
      "phase2.setup.invalid-construction-date",
      "error",
      "setup",
      "constructionStartDate",
      "تاریخ شروع ساخت معتبر نیست و تاریخ بهره‌برداری قابل محاسبه نیست.",
      "تاریخ شروع ساخت را اصلاح کنید.",
      "ProjectSetup02",
      "U27:U29",
    ));
  }
  if (
    setup.operationStartDateOverrideEnabled &&
    setup.operationStartDateManual &&
    calculatedDate &&
    setup.operationStartDateManual < calculatedDate
  ) {
    warnings.push(issue(
      "phase2.setup.manual-operation-before-calculated",
      "warning",
      "setup",
      "operationStartDateManual",
      "تاریخ دستی بهره‌برداری قبل از پایان محاسباتی دوره ساخت است.",
      "تاریخ دستی یا مدت ساخت را بازبینی و مستند کنید.",
      "ProjectSetup02",
      "U27:U29",
    ));
  }
  return {
    values: { calculatedDate, operationStartDate },
    errors,
    warnings,
    trace: [
      trace(
        "phase2.setup.operationStartDate",
        "تاریخ شروع بهره‌برداری",
        "Construction Start Date + Construction Duration (months), unless advanced override is enabled",
        [
          { label: "شروع ساخت", value: setup.constructionStartDate, source: "ProjectSetup02!U27" },
          { label: "مدت ساخت", value: setup.constructionDurationMonths, source: "ProjectSetup02!U29" },
          { label: "override دستی", value: setup.operationStartDateOverrideEnabled ? "فعال" : "غیرفعال" },
        ],
        operationStartDate,
        "ProjectSetup02",
        "U27:U29",
      ),
    ],
  };
};

const annualRawMaterialAvailability = (capacity: CapacityAssumptions) => {
  if (!capacity.hasRawMaterialConstraint || capacity.rawMaterialAvailableQuantity <= 0) return null;
  if (capacity.rawMaterialAvailabilityPeriod === "روزانه") {
    return capacity.rawMaterialAvailableQuantity * capacity.workingDaysPerYear;
  }
  if (capacity.rawMaterialAvailabilityPeriod === "ماهانه") {
    return capacity.rawMaterialAvailableQuantity * 12;
  }
  return capacity.rawMaterialAvailableQuantity;
};

const normalizedMonthlyShares = (capacity: CapacityAssumptions) => {
  const configured = capacity.monthlyProductionDistribution.length === 12
    ? capacity.monthlyProductionDistribution.map((row) => Math.max(0, row.share))
    : Array.from({ length: 12 }, () => 1 / 12);
  const total = sum(configured);
  return total > 0 ? configured.map((share) => share / total) : Array.from({ length: 12 }, () => 1 / 12);
};

export const calculateMonthlyNetProduction = (
  capacity: CapacityAssumptions,
  availableCapacity: number,
): number[] => {
  const shares = normalizedMonthlyShares(capacity);
  const stableNetCapacity =
    availableCapacity *
    clamp(capacity.stableYearUtilizationRate, 0, 1) *
    clamp(capacity.productionEfficiency, 0, 1) *
    (1 - clamp(capacity.wasteRate, 0, 1));
  return shares.map((share, index) => {
    const configuredRamp = capacity.monthlyRampUpCapacityPercentages.find((row) => row.month === index + 1);
    const rampFactor = index < capacity.rampUpDurationMonths
      ? clamp(configuredRamp?.capacityPercent ?? capacity.firstYearUtilizationRate, 0, 1)
      : clamp(capacity.stableYearUtilizationRate, 0, 1);
    const stableUtilization = Math.max(capacity.stableYearUtilizationRate, 0.000001);
    return stableNetCapacity * share * (rampFactor / stableUtilization);
  });
};

export const calculateCapacityProduction = (
  capacity: CapacityAssumptions,
): StructuredResult<CapacityProductionOutputs> => {
  const effectiveAnnualHours =
    Math.max(0, capacity.workingDaysPerYear) *
    Math.max(0, capacity.shiftsPerDay) *
    Math.max(0, capacity.effectiveHoursPerShift) *
    (1 - clamp(capacity.plannedDowntimeRate, 0, 1)) *
    (1 - clamp(capacity.unplannedDowntimeRate, 0, 1));
  const nominalEffectiveCapacity = Math.max(0, capacity.nominalCapacity) * effectiveAnnualHours;
  const bottleneckCapacity =
    capacity.bottleneckHourlyCapacity > 0
      ? capacity.bottleneckHourlyCapacity * effectiveAnnualHours
      : nominalEffectiveCapacity;
  const energyConstrainedCapacity =
    capacity.energyAvailableQuantity > 0 && capacity.energyConsumptionPerUnit > 0
      ? capacity.energyAvailableQuantity / capacity.energyConsumptionPerUnit
      : null;
  const annualMaterial = annualRawMaterialAvailability(capacity);
  const rawMaterialConstrainedCapacity =
    annualMaterial !== null && capacity.rawMaterialToProductConversionFactor > 0
      ? annualMaterial / capacity.rawMaterialToProductConversionFactor
      : null;
  const limits = [
    { label: "ظرفیت اسمی مؤثر", value: nominalEffectiveCapacity },
    { label: "گلوگاه فنی", value: bottleneckCapacity },
    ...(energyConstrainedCapacity === null ? [] : [{ label: "محدودیت انرژی", value: energyConstrainedCapacity }]),
    ...(rawMaterialConstrainedCapacity === null ? [] : [{ label: "محدودیت ماده اولیه", value: rawMaterialConstrainedCapacity }]),
  ];
  const availableCapacity = Math.max(0, Math.min(...limits.map((item) => item.value)));
  const bindingConstraint = limits.find((item) => Math.abs(item.value - availableCapacity) < 0.000001)?.label ?? "نامشخص";
  const grossAnnualProduction = availableCapacity * clamp(capacity.stableYearUtilizationRate, 0, 1);
  const netSellableProduction =
    grossAnnualProduction *
    clamp(capacity.productionEfficiency, 0, 1) *
    (1 - clamp(capacity.wasteRate, 0, 1));
  const monthlyNetProduction = calculateMonthlyNetProduction(capacity, availableCapacity);
  const values: CapacityProductionOutputs = {
    effectiveAnnualHours,
    nominalEffectiveCapacity,
    availableCapacity,
    rawMaterialConstrainedCapacity,
    energyConstrainedCapacity,
    grossAnnualProduction,
    netSellableProduction,
    capacityUtilizationPercent: nominalEffectiveCapacity > 0 ? netSellableProduction / nominalEffectiveCapacity : 0,
    remainingIdleCapacity: Math.max(0, nominalEffectiveCapacity - netSellableProduction),
    monthlyNetProduction,
    bindingConstraint,
  };
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  const rates = [
    capacity.plannedDowntimeRate,
    capacity.unplannedDowntimeRate,
    capacity.firstYearUtilizationRate,
    capacity.secondYearUtilizationRate,
    capacity.stableYearUtilizationRate,
    capacity.productionEfficiency,
    capacity.wasteRate,
  ];
  if (rates.some((value) => value < 0 || value > 1)) {
    errors.push(issue(
      "phase2.capacity.percent-range",
      "error",
      "capacity-production",
      "operationalRates",
      "درصدهای ظرفیت، توقف، راندمان و ضایعات باید بین صفر و صد درصد باشند.",
      "مقادیر درصدی را اصلاح کنید.",
      "CapacityProduction09",
      "Q18:Q24",
    ));
  }
  if (capacity.nominalCapacity <= 0 || capacity.workingDaysPerYear <= 0 || capacity.effectiveHoursPerShift <= 0) {
    errors.push(issue(
      "phase2.capacity.base-inputs",
      "error",
      "capacity-production",
      "nominalCapacity",
      "ظرفیت اسمی و تقویم کاری باید مثبت باشند.",
      "ظرفیت، روز کاری و ساعت مؤثر را تکمیل کنید.",
      "CapacityProduction09",
      "Q7:Q17",
    ));
  }
  if (capacity.stableYearUtilizationRate < capacity.firstYearUtilizationRate) {
    warnings.push(issue(
      "phase2.capacity.ramp-order",
      "warning",
      "capacity-production",
      "stableYearUtilizationRate",
      "بهره‌برداری پایدار از سال اول کمتر ثبت شده است.",
      "منطق ramp-up را بازبینی کنید.",
      "CapacityProduction09",
      "Q20:Q22",
    ));
  }
  if (capacity.energyAvailableQuantity > 0 && capacity.energyConsumptionPerUnit <= 0) {
    errors.push(issue(
      "phase2.capacity.energy-conversion",
      "error",
      "capacity-production",
      "energyConsumptionPerUnit",
      "برای اعمال محدودیت انرژی، مصرف انرژی به ازای واحد محصول الزامی است.",
      "مصرف انرژی واحد را وارد کنید یا محدودیت انرژی را غیرفعال کنید.",
      "CapacityProduction09",
      "Q27:Q28",
    ));
  }
  if (capacity.hasRawMaterialConstraint && capacity.rawMaterialToProductConversionFactor <= 0) {
    errors.push(issue(
      "phase2.capacity.material-conversion",
      "error",
      "capacity-production",
      "rawMaterialToProductConversionFactor",
      "ضریب تبدیل ماده اولیه به محصول باید مثبت باشد.",
      "ضریب مصرف ماده اولیه به ازای یک واحد محصول را وارد کنید.",
      "CapacityProduction09",
      "Q29",
    ));
  }
  return {
    values,
    errors,
    warnings,
    trace: [
      trace(
        "phase2.capacity.effectiveAnnualHours",
        "ساعات مؤثر سالانه",
        "Working Days × Shifts × Hours × (1-Planned Downtime) × (1-Unplanned Downtime)",
        [
          { label: "روز کاری", value: capacity.workingDaysPerYear, source: "CapacityProduction09!Q15" },
          { label: "شیفت", value: capacity.shiftsPerDay, source: "CapacityProduction09!Q16" },
          { label: "ساعت مؤثر", value: capacity.effectiveHoursPerShift, source: "CapacityProduction09!Q17" },
        ],
        effectiveAnnualHours,
        "CapacityProduction09",
        "Q42",
      ),
      trace(
        "phase2.capacity.availableCapacity",
        "ظرفیت در دسترس",
        "MIN(Nominal Effective, Bottleneck, Energy Constraint, Raw Material Constraint)",
        limits.map((item) => ({ label: item.label, value: item.value })),
        availableCapacity,
        "CapacityProduction09",
        "Q43:Q44",
      ),
      trace(
        "phase2.capacity.netSellableProduction",
        "تولید خالص قابل فروش",
        "Available Capacity × Stable Utilization × Production Efficiency × (1-Waste)",
        [
          { label: "ظرفیت در دسترس", value: availableCapacity, source: "CapacityProduction09!Q44" },
          { label: "بهره‌برداری پایدار", value: capacity.stableYearUtilizationRate, source: "CapacityProduction09!Q22" },
          { label: "راندمان", value: capacity.productionEfficiency, source: "CapacityProduction09!Q24" },
          { label: "ضایعات", value: capacity.wasteRate, source: "CapacityProduction09!Q23" },
        ],
        netSellableProduction,
        "CapacityProduction09",
        "Q45:Q49",
      ),
    ],
  };
};

const resolveFxRate = (
  macro: MacroAssumptions,
  type: CapexItem["fxRateType"],
  manualRate?: number,
) => type === "manual" ? Math.max(0, manualRate ?? macro.fxRates.manual) : calculateFxRateByType(macro, type).values.rate;

export const calculateDirectUnitCost = (
  assumptions: DirectCostAssumptions,
  macro: MacroAssumptions,
  unitSalesPrice = 0,
): StructuredResult<DirectCostOutputs> => {
  const mainFxRate = assumptions.mainRawMaterialFxRateType === "manual"
    ? Math.max(0, assumptions.mainRawMaterialManualFxRate ?? macro.fxRates.manual)
    : calculateFxRateByType(macro, assumptions.mainRawMaterialFxRateType).values.rate;
  const mainFx = assumptions.isMainRawMaterialFx
    ? assumptions.mainRawMaterialFxPrice * clamp(assumptions.mainRawMaterialFxShare, 0, 1) * mainFxRate
    : 0;
  const mainRial = assumptions.mainRawMaterialRialPrice;
  let directRialCosts = mainRial;
  let directFxCosts = mainFx;
  let variableCost = mainRial + mainFx;
  let fixedCost = 0;
  assumptions.items.forEach((item) => {
    const fxRate = item.fxRateType === "manual"
      ? Math.max(0, item.manualFxRate ?? macro.fxRates.manual)
      : calculateFxRateByType(macro, item.fxRateType).values.rate;
    const fxShare = item.costType === "ریالی" ? 0 : item.costType === "ارزی" ? 1 : clamp(item.fxShare, 0, 1);
    const rial = Math.max(0, item.rialUnitCost) * (item.costType === "ارزی" ? 0 : 1);
    const fx = Math.max(0, item.fxUnitCost) * fxShare * fxRate;
    directRialCosts += rial;
    directFxCosts += fx;
    if (item.behavior === "متغیر") variableCost += rial + fx;
    else fixedCost += rial + fx;
  });
  const salesCommissionCost = unitSalesPrice * clamp(assumptions.salesCommissionRate, 0, 1);
  variableCost += salesCommissionCost;
  directRialCosts += salesCommissionCost;
  const baseYearUnitDirectCost = Math.max(
    0,
    (variableCost + fixedCost + assumptions.avoidableWasteCost) *
      (1 - clamp(assumptions.economiesOfScaleSavingPercent, 0, 1)),
  );
  const totalClassified = variableCost + fixedCost;
  const values: DirectCostOutputs = {
    baseYearUnitDirectCost,
    totalDirectProductionCostBaseYear: 0,
    directRialCosts,
    directFxCosts,
    variableDirectCostShare: totalClassified > 0 ? variableCost / totalClassified : 0,
    fixedDirectCostShare: totalClassified > 0 ? fixedCost / totalClassified : 0,
    cogs: 0,
  };
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  if (assumptions.mainRawMaterialFxShare < 0 || assumptions.mainRawMaterialFxShare > 1) {
    errors.push(issue(
      "phase2.direct.main-fx-share",
      "error",
      "direct-costs",
      "mainRawMaterialFxShare",
      "سهم ارزی ماده اولیه اصلی باید بین صفر و صد درصد باشد.",
      "سهم ارزی را اصلاح کنید.",
      "COGS-DirectCost10",
      "Q18",
    ));
  }
  if (assumptions.items.some((item) => item.rialUnitCost < 0 || item.fxUnitCost < 0)) {
    errors.push(issue(
      "phase2.direct.negative-item",
      "error",
      "direct-costs",
      "items",
      "هزینه واحد مستقیم نمی‌تواند منفی باشد.",
      "مقادیر جدول اقلام هزینه را اصلاح کنید.",
      "COGS-DirectCost10",
      "Q15:Q27",
    ));
  }
  if (baseYearUnitDirectCost === 0) {
    warnings.push(issue(
      "phase2.direct.zero-unit-cost",
      "warning",
      "direct-costs",
      "baseYearUnitDirectCost",
      "هزینه مستقیم واحد صفر است.",
      "قیمت مواد، انرژی، دستمزد و سایر اقلام را کنترل کنید.",
      "COGS-DirectCost10",
      "Q41",
    ));
  }
  return {
    values,
    errors,
    warnings,
    trace: [
      trace(
        "phase2.direct.baseUnitCost",
        "هزینه مستقیم واحد سال پایه",
        "Main Material (Rial + FX×Rate) + Σ Direct Cost Items + Sales Commission + Avoidable Waste - Scale Saving",
        [
          { label: "بخش ریالی", value: directRialCosts, source: "COGS-DirectCost10!Q17,Q19:Q27" },
          { label: "بخش ارزی تبدیل‌شده", value: directFxCosts, source: "COGS-DirectCost10!Q16,Q18" },
          { label: "صرفه مقیاس", value: assumptions.economiesOfScaleSavingPercent, source: "COGS-DirectCost10!Q36" },
        ],
        baseYearUnitDirectCost,
        "COGS-DirectCost10",
        "Q41:Q48",
      ),
    ],
  };
};

export const calculateDirectCostSchedule = (
  assumptions: DirectCostAssumptions,
  macro: MacroAssumptions,
  productionByYear: number[],
  salesPriceByYear: number[],
): StructuredResult<Array<{ year: number; unitCost: number; totalCost: number; variableShare: number; fxShare: number }>> => {
  const base = calculateDirectUnitCost(assumptions, macro, salesPriceByYear[1] ?? 0);
  const directTotal = base.values.directRialCosts + base.values.directFxCosts;
  const fxWeight = directTotal > 0 ? base.values.directFxCosts / directTotal : 0;
  const rialWeight = 1 - fxWeight;
  const blendedGrowth =
    rialWeight * assumptions.rialRawMaterialGrowthRate +
    fxWeight * assumptions.fxRawMaterialGrowthRate +
    (assumptions.directLaborCost > 0 ? assumptions.directLaborGrowthFactor * 0.2 : 0) +
    (assumptions.directEnergyCost > 0 ? assumptions.energyTariffGrowthRate * 0.1 : 0);
  const rows = productionByYear.map((production, year) => {
    if (year === 0) return { year, unitCost: 0, totalCost: 0, variableShare: base.values.variableDirectCostShare, fxShare: fxWeight };
    const salesCommissionDelta =
      Math.max(0, (salesPriceByYear[year] ?? 0) - (salesPriceByYear[1] ?? 0)) *
      clamp(assumptions.salesCommissionRate, 0, 1);
    const unitCost = Math.max(0, base.values.baseYearUnitDirectCost * (1 + blendedGrowth) ** (year - 1) + salesCommissionDelta);
    return {
      year,
      unitCost,
      totalCost: unitCost * Math.max(0, production),
      variableShare: base.values.variableDirectCostShare,
      fxShare: fxWeight,
    };
  });
  return {
    values: rows,
    errors: base.errors,
    warnings: base.warnings,
    trace: [
      ...base.trace,
      trace(
        "phase2.direct.schedule",
        "برنامه سالانه هزینه مستقیم",
        "Unit Cost(y) = Base Unit Cost × (1 + Blended Growth)^(y-1); COGS(y) = Unit Cost(y) × Production(y)",
        [
          { label: "رشد ترکیبی", value: blendedGrowth },
          { label: "تولید سال اول", value: productionByYear[1] ?? 0, source: "CapacityProduction09!Q46" },
        ],
        rows[1]?.totalCost ?? 0,
        "COGS-DirectCost10",
        "Q41:Q48",
      ),
    ],
  };
};

export const calculateOpexSchedule = (
  assumptions: OpexAssumptions,
  revenueByYear: number[],
  productionByYear: number[],
): StructuredResult<{
  rows: Array<{ year: number; totalOpex: number; cashOpex: number; fxOpex: number }>;
  outputs: OpexOutputs;
}> => {
  const baseRevenue = Math.max(1, revenueByYear[1] ?? 0);
  const baseProduction = Math.max(1, productionByYear[1] ?? 0);
  const rows = revenueByYear.map((revenue, year) => {
    if (year === 0) return { year, totalOpex: 0, cashOpex: 0, fxOpex: 0 };
    let totalOpex = 0;
    let cashOpex = 0;
    let fxOpex = 0;
    assumptions.items.forEach((item) => {
      const growthFactor = (1 + item.growthRate) ** (year - 1);
      const driverFactor =
        item.costDriver === "وابسته به درآمد"
          ? Math.max(0, revenue / baseRevenue)
          : item.costDriver === "وابسته به تولید"
            ? Math.max(0, (productionByYear[year] ?? 0) / baseProduction)
            : 1;
      const amount = Math.max(0, item.baseYearAmount * growthFactor * driverFactor * (1 + assumptions.scenarioAdjustmentRate));
      totalOpex += amount;
      if (item.cashOrNonCash === "نقدی") cashOpex += amount;
      if (item.isFx) fxOpex += amount * clamp(item.fxShare, 0, 1);
    });
    return { year, totalOpex, cashOpex, fxOpex };
  });
  const yearOne = rows[1] ?? { totalOpex: 0, cashOpex: 0, fxOpex: 0 };
  const productionOverhead = assumptions.items.reduce(
    (total, item) => total + item.baseYearAmount * clamp(item.overheadAllocationPercent, 0, 1),
    0,
  );
  const salesMarketingExpenses = assumptions.items
    .filter((item) => item.group === "فروش و بازاریابی")
    .reduce((total, item) => total + item.baseYearAmount, 0);
  const gnaExpenses = Math.max(0, yearOne.totalOpex - productionOverhead - salesMarketingExpenses);
  const outputs: OpexOutputs = {
    totalAnnualOpex: yearOne.totalOpex,
    productionOverhead,
    gnaExpenses,
    salesMarketingExpenses,
    opexToRevenueRatio: baseRevenue > 0 ? yearOne.totalOpex / baseRevenue : 0,
    cashOpexExcludingDepreciation: yearOne.cashOpex,
    fxOpex: yearOne.fxOpex,
  };
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  if (assumptions.items.some((item) => item.baseYearAmount < 0)) {
    errors.push(issue(
      "phase2.opex.negative-item",
      "error",
      "opex",
      "items",
      "مبلغ پایه اقلام OPEX نمی‌تواند منفی باشد.",
      "مقادیر جدول هزینه‌های غیرمستقیم را اصلاح کنید.",
      "Opex-Indirect11",
      "Q20:Q38",
    ));
  }
  if (outputs.opexToRevenueRatio > 0.5) {
    warnings.push(issue(
      "phase2.opex.high-ratio",
      "warning",
      "opex",
      "opexToRevenueRatio",
      "نسبت OPEX به درآمد بیش از پنجاه درصد است.",
      "ساختار هزینه، مقیاس فروش و تخصیص سربار را بررسی کنید.",
      "Opex-Indirect11",
      "Q50:Q56",
    ));
  }
  return {
    values: { rows, outputs },
    errors,
    warnings,
    trace: [
      trace(
        "phase2.opex.total",
        "OPEX سال اول",
        "Σ Base Amount × Growth Driver × Operational Driver × Scenario Adjustment",
        [
          { label: "تعداد اقلام", value: assumptions.items.length, source: "Opex-Indirect11!Q20:Q38" },
          { label: "تعدیل سناریو", value: assumptions.scenarioAdjustmentRate, source: "Opex-Indirect11!Q45" },
        ],
        yearOne.totalOpex,
        "Opex-Indirect11",
        "Q50:Q56",
      ),
    ],
  };
};

export const calculateCapexItem = (
  item: CapexItem,
  macro: MacroAssumptions,
): StructuredResult<CapexItemOutputs> => {
  const appliedFxRate = resolveFxRate(macro, item.fxRateType, item.manualFxRate);
  const rialPortion = Math.max(0, item.rialUnitPrice) * clamp(item.rialPriceShare, 0, 1);
  const fxPortionInBaseCurrency = Math.max(0, item.fxUnitPrice) * clamp(item.fxPriceShare, 0, 1) * appliedFxRate;
  const legacyUnitPrice = Math.max(0, item.unitPrice) * Math.max(0, item.fxRate);
  const unitPriceBase = rialPortion + fxPortionInBaseCurrency || legacyUnitPrice;
  const finalAmount = Math.max(0, item.quantity) * unitPriceBase;
  const adjustedAmount = finalAmount * (1 + Math.max(-1, item.expectedInflationIncreasePercent));
  const delayMonthlyCostTotal = item.delayEnabled
    ? Math.max(0, item.delayMonths) * Math.max(0, item.monthlyDelayCost)
    : 0;
  const delayPriceEscalationCost =
    item.delayEnabled && item.delayMonths > 0
      ? adjustedAmount * ((1 + Math.max(0, item.annualDelayEscalationRate)) ** (item.delayMonths / 12) - 1)
      : 0;
  const totalDelayCost = delayMonthlyCostTotal + delayPriceEscalationCost;
  const permitCost = item.permitCost > 0
    ? item.permitCost
    : adjustedAmount * clamp(item.permitCostRate, 0, 1);
  const contingencyCost = adjustedAmount * clamp(item.contingencyRate, 0, 1);
  const sideCosts =
    Math.max(0, item.installationCost) +
    Math.max(0, item.transportInsuranceCost) +
    Math.max(0, item.trainingCost) +
    Math.max(0, item.preOperationCost) +
    Math.max(0, item.indirectProjectCost) +
    permitCost;
  const finalItemCost = adjustedAmount + totalDelayCost + contingencyCost + sideCosts;
  const accountingDepreciable = item.accountingDepreciable ?? item.accountingEligible ?? item.depreciable;
  const accountingUsefulLifeYears = item.accountingUsefulLifeYears ?? item.usefulLifeYears;
  const accountingSalvageValue = (item.accountingSalvageValue ?? 0) > 0
    ? item.accountingSalvageValue
    : finalItemCost * clamp(item.accountingSalvageValueRate ?? item.salvageValueRate, 0, 1);
  const accountingPreview = calculateDepreciationSchedule({
    basis: accountingDepreciable ? finalItemCost : 0,
    salvageValue: accountingSalvageValue,
    usefulLifeYears: accountingUsefulLifeYears,
    method: item.accountingDepreciationMethod ?? item.depreciationMethod,
    startDate: item.accountingDepreciationStartDate ?? item.depreciationStartDate,
    startYear: item.accountingDepreciationStartYear ?? item.depreciationStartYear,
    baseYear: item.accountingDepreciationStartYear ?? item.depreciationStartYear,
    horizonYears: Math.max(1, accountingUsefulLifeYears),
  });
  const accountingDepreciationAnnual = accountingPreview.rows.find((row) => row.depreciation > 0)?.depreciation ?? 0;
  const taxDepreciable = item.taxDepreciable ?? item.taxEligible ?? item.depreciable;
  const taxUsefulLifeYears = item.taxUsefulLifeYears ?? item.usefulLifeYears;
  const taxSalvageValue = (item.taxSalvageValue ?? 0) > 0
    ? item.taxSalvageValue
    : finalItemCost * clamp(item.taxSalvageValueRate ?? 0, 0, 1);
  const taxPreview = calculateDepreciationSchedule({
    basis: taxDepreciable ? finalItemCost : 0,
    salvageValue: taxSalvageValue,
    usefulLifeYears: taxUsefulLifeYears,
    method: item.taxDepreciationMethod ?? item.depreciationMethod,
    startDate: item.taxDepreciationStartDate ?? item.depreciationStartDate,
    startYear: item.taxDepreciationStartYear ?? item.depreciationStartYear,
    baseYear: item.taxDepreciationStartYear ?? item.depreciationStartYear,
    horizonYears: Math.max(1, taxUsefulLifeYears),
  });
  const taxDepreciationAnnual = taxPreview.rows.find((row) => row.depreciation > 0)?.depreciation ?? 0;
  const annualDepreciation = accountingDepreciationAnnual;
  const importedShare = unitPriceBase > 0 ? fxPortionInBaseCurrency / unitPriceBase : 0;
  const status: string[] = [];
  if (!item.name.trim()) status.push("نام قلم ناقص");
  if (item.quantity <= 0) status.push("مقدار نامعتبر");
  if (unitPriceBase <= 0) status.push("قیمت تکمیل نشده");
  if (item.depreciable && item.usefulLifeYears <= 0) status.push("عمر مفید نامعتبر");
  if (Math.abs(item.prepaymentRate + item.deliveryPaymentRate + item.postInstallPaymentRate - 1) > 0.0001) {
    status.push("جمع پرداخت‌ها نابرابر با ۱۰۰٪");
  }
  const values: CapexItemOutputs = {
    appliedFxRate,
    rialPortion,
    fxPortionInBaseCurrency,
    unitPriceBase,
    finalAmount,
    adjustedAmount,
    delayMonthlyCostTotal,
    delayPriceEscalationCost,
    totalDelayCost,
    permitCost,
    contingencyCost,
    finalItemCost,
    annualDepreciation,
    accountingDepreciationAnnual,
    accountingDepreciationFirstYear: accountingPreview.firstYearDepreciation,
    accountingAccumulatedDepreciation: accountingPreview.accumulatedDepreciation,
    accountingBookValueEnd: accountingPreview.bookValueEnd,
    taxDepreciationAnnual,
    taxDepreciationFirstYear: taxPreview.firstYearDepreciation,
    taxAccumulatedDepreciation: taxPreview.accumulatedDepreciation,
    taxBookValueEnd: taxPreview.bookValueEnd,
    bookValueEnd: accountingPreview.bookValueEnd,
    importedShare,
    domesticShare: 1 - importedShare,
    status,
  };
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  if (status.includes("جمع پرداخت‌ها نابرابر با ۱۰۰٪")) {
    errors.push(issue(
      `phase2.capex.payment-share.${item.id}`,
      "error",
      "capex",
      `items.${item.id}.paymentRates`,
      `جمع درصدهای پرداخت قلم «${item.name || item.code}» برابر ۱۰۰٪ نیست.`,
      "پیش‌پرداخت، تحویل و پس از نصب را اصلاح کنید.",
      "Capex12",
      "U38:U40",
    ));
  }
  if (status.some((itemStatus) => itemStatus !== "جمع پرداخت‌ها نابرابر با ۱۰۰٪")) {
    warnings.push(issue(
      `phase2.capex.incomplete.${item.id}`,
      "warning",
      "capex",
      `items.${item.id}`,
      `قلم «${item.name || item.code}» نیازمند تکمیل است: ${status.join("، ")}`,
      "اطلاعات هویتی، قیمت، زمان‌بندی و استهلاک قلم را تکمیل کنید.",
      "Capex12",
      "U8:U89",
    ));
  }
  return {
    values,
    errors,
    warnings,
    trace: [
      trace(
        `phase2.capex.item.${item.id}`,
        `بهای نهایی ${item.name || item.code}`,
        "Quantity × (Rial Unit Price + FX Unit Price × FX Rate) × (1 + Price Increase) + Delay + Side Costs + Contingency",
        [
          { label: "تعداد", value: item.quantity, source: "Capex12!U20" },
          { label: "قیمت واحد مبنا", value: unitPriceBase, source: "Capex12!U21:U24" },
          { label: "افزایش قیمت", value: item.expectedInflationIncreasePercent, source: "Capex12!U25" },
          { label: "هزینه تأخیر", value: totalDelayCost, source: "Capex12!U41:U46" },
        ],
        finalItemCost,
        "Capex12",
        "U20:U64",
      ),
    ],
  };
};

export const calculateAnnualCapexSchedule = (
  assumptions: Pick<CapexAssumptions, "items">,
  macro: MacroAssumptions,
  baseYear: number,
  horizon: number,
): CapexAnnualSchedule[] => {
  const rows = Array.from({ length: horizon + 1 }, (_, year) => ({
    year,
    calendarYear: baseYear + year,
    plannedCapex: 0,
    adjustedCapex: 0,
    advancePayment: 0,
    deliveryPayment: 0,
    postInstallationPayment: 0,
    delayCost: 0,
    installationCost: 0,
    preOperationCost: 0,
    contingencyCost: 0,
    finalAnnualCapex: 0,
    depreciation: 0,
    netFixedAssets: 0,
  }));
  assumptions.items.forEach((item) => {
    const output = calculateCapexItem(item, macro).values;
    const startYear = safeDate(item.startDate)?.getUTCFullYear() ?? item.startYear;
    const endYear = safeDate(item.endDate)?.getUTCFullYear() ?? item.endYear;
    const depreciationStartDate = item.accountingDepreciationStartDate ?? item.depreciationStartDate;
    const depreciationStartYear = item.accountingDepreciationStartYear ?? item.depreciationStartYear;
    const depreciationYear = safeDate(depreciationStartDate)?.getUTCFullYear() ?? depreciationStartYear;
    const advanceIndex = clamp(startYear - baseYear, 0, horizon);
    const deliveryIndex = clamp(endYear - baseYear, 0, horizon);
    const postInstallIndex = clamp(
      Math.max(endYear, depreciationYear) - baseYear,
      0,
      horizon,
    );
    const advance = output.adjustedAmount * clamp(item.prepaymentRate, 0, 1);
    const delivery = output.adjustedAmount * clamp(item.deliveryPaymentRate, 0, 1);
    const postInstall = output.adjustedAmount * clamp(item.postInstallPaymentRate, 0, 1);
    rows[advanceIndex].plannedCapex += output.finalAmount * clamp(item.prepaymentRate, 0, 1);
    rows[advanceIndex].adjustedCapex += advance;
    rows[advanceIndex].advancePayment += advance;
    rows[deliveryIndex].plannedCapex += output.finalAmount * clamp(item.deliveryPaymentRate, 0, 1);
    rows[deliveryIndex].adjustedCapex += delivery;
    rows[deliveryIndex].deliveryPayment += delivery;
    rows[postInstallIndex].plannedCapex += output.finalAmount * clamp(item.postInstallPaymentRate, 0, 1);
    rows[postInstallIndex].adjustedCapex += postInstall;
    rows[postInstallIndex].postInstallationPayment += postInstall;
    rows[postInstallIndex].delayCost += output.totalDelayCost;
    rows[postInstallIndex].installationCost += item.installationCost + item.transportInsuranceCost + item.trainingCost;
    rows[postInstallIndex].preOperationCost += item.preOperationCost + item.indirectProjectCost + output.permitCost;
    rows[postInstallIndex].contingencyCost += output.contingencyCost;
    const accountingSchedule = calculateDepreciationSchedule({
      basis: (item.accountingDepreciable ?? item.accountingEligible ?? item.depreciable) ? output.finalItemCost : 0,
      salvageValue: item.accountingSalvageValue > 0
        ? item.accountingSalvageValue
        : output.finalItemCost * clamp(item.accountingSalvageValueRate ?? item.salvageValueRate, 0, 1),
      usefulLifeYears: item.accountingUsefulLifeYears ?? item.usefulLifeYears,
      method: item.accountingDepreciationMethod ?? item.depreciationMethod,
      startDate: depreciationStartDate,
      startYear: depreciationYear,
      baseYear,
      horizonYears: horizon,
    });
    accountingSchedule.rows.forEach((depreciationRow) => {
      rows[depreciationRow.year].depreciation += depreciationRow.depreciation;
    });
  });
  let grossFixedAssets = 0;
  let accumulatedDepreciation = 0;
  rows.forEach((row) => {
    row.finalAnnualCapex =
      row.adjustedCapex +
      row.delayCost +
      row.installationCost +
      row.preOperationCost +
      row.contingencyCost;
    grossFixedAssets += row.finalAnnualCapex;
    accumulatedDepreciation += Math.min(row.depreciation, Math.max(0, grossFixedAssets - accumulatedDepreciation));
    row.netFixedAssets = Math.max(0, grossFixedAssets - accumulatedDepreciation);
  });
  return rows;
};

export const calculateDepreciationForCapexItems = (
  items: CapexItem[],
  macro: MacroAssumptions,
) => items.map((item) => ({
  itemId: item.id,
  itemName: item.name,
  annualDepreciation: calculateCapexItem(item, macro).values.accountingDepreciationAnnual,
  accountingDepreciation: calculateCapexItem(item, macro).values.accountingDepreciationAnnual,
  taxDepreciation: calculateCapexItem(item, macro).values.taxDepreciationAnnual,
  depreciationStartDate: item.accountingDepreciationStartDate ?? item.depreciationStartDate,
  usefulLifeYears: item.accountingUsefulLifeYears ?? item.usefulLifeYears,
}));

export const calculateCapexSummary = (
  items: CapexItem[],
  macro: MacroAssumptions,
): StructuredResult<CapexSummary> => {
  const calculated = items.map((item) => ({ item, result: calculateCapexItem(item, macro) }));
  const totalFixedInvestment = sum(calculated.map(({ result }) => result.values.finalItemCost));
  const totalFxInvestment = sum(calculated.map(({ result }) =>
    result.values.finalItemCost * result.values.importedShare));
  const totalRialInvestment = Math.max(0, totalFixedInvestment - totalFxInvestment);
  const largest = [...calculated].sort((left, right) =>
    right.result.values.finalItemCost - left.result.values.finalItemCost)[0];
  const values: CapexSummary = {
    totalFixedInvestment,
    totalFxInvestment,
    totalRialInvestment,
    totalDelayCost: sum(calculated.map(({ result }) => result.values.totalDelayCost)),
    totalPreOperationCost: sum(calculated.map(({ item, result }) =>
      item.preOperationCost + item.indirectProjectCost + result.values.permitCost)),
    totalContingencyCost: sum(calculated.map(({ result }) => result.values.contingencyCost)),
    importedAssetShare: totalFixedInvestment > 0 ? totalFxInvestment / totalFixedInvestment : 0,
    domesticAssetShare: totalFixedInvestment > 0 ? totalRialInvestment / totalFixedInvestment : 0,
    totalAnnualDepreciation: sum(calculated.map(({ result }) => result.values.annualDepreciation)),
    incompleteItemCount: calculated.filter(({ result }) => result.values.status.length > 0).length,
    highRiskItemCount: calculated.filter(({ item }) =>
      [item.fxRisk, item.supplyDelayRisk, item.clearanceRisk, item.priceIncreaseRisk, item.permitRisk]
        .some((risk) => risk === "بالا" || risk === "بحرانی")).length,
    largestItemName: largest?.item.name ?? "",
    largestItemShare:
      largest && totalFixedInvestment > 0
        ? largest.result.values.finalItemCost / totalFixedInvestment
        : 0,
  };
  return {
    values,
    errors: calculated.flatMap(({ result }) => result.errors),
    warnings: calculated.flatMap(({ result }) => result.warnings),
    trace: [
      ...calculated.flatMap(({ result }) => result.trace),
      trace(
        "phase2.capex.summary",
        "کل سرمایه‌گذاری ثابت",
        "Σ Final Item Cost",
        [{ label: "تعداد اقلام", value: items.length, source: "Capex12!U8:U102" }],
        totalFixedInvestment,
        "Capex12",
        "U94:U101",
      ),
    ],
  };
};

export const synchronizePhaseTwoAssumptions = (
  setup: ProjectSetup,
  capacity: CapacityAssumptions,
  directCosts: DirectCostAssumptions,
  opex: OpexAssumptions,
  capex: CapexAssumptions,
  macro: MacroAssumptions,
  productUnit: string,
) => {
  const operation = calculateOperationStartDate(setup).values.operationStartDate;
  const synchronizedCapacity: CapacityAssumptions = {
    ...capacity,
    unit: productUnit,
    firstYearUtilizationRate: capacity.firstYearUtilizationRate,
    secondYearUtilizationRate: capacity.secondYearUtilizationRate,
    stableYearUtilizationRate: capacity.stableYearUtilizationRate,
    utilizationYear1: capacity.firstYearUtilizationRate,
    utilizationYear2: capacity.secondYearUtilizationRate,
    utilizationStable: capacity.stableYearUtilizationRate,
    yieldRate: capacity.productionEfficiency,
    bottleneckCapacityPerHour: capacity.bottleneckHourlyCapacity,
    energyLimit: capacity.energyAvailableQuantity,
    energyPerUnit: capacity.energyConsumptionPerUnit,
    materialLimit: calculateCapacityProduction(capacity).values.rawMaterialConstrainedCapacity ?? 0,
    rampUpMonths: capacity.rampUpDurationMonths,
    trialProductionStartDate: capacity.trialProductionStartDate || operation,
    outputs: calculateCapacityProduction(capacity).values,
  };
  const directResult = calculateDirectUnitCost(directCosts, macro);
  const synchronizedDirect: DirectCostAssumptions = {
    ...directCosts,
    rawMaterialFxUnitCost: directCosts.mainRawMaterialFxPrice,
    rawMaterialRialUnitCost: directCosts.mainRawMaterialRialPrice,
    rawMaterialFxShare: directCosts.mainRawMaterialFxShare,
    rawMaterialRialGrowth: directCosts.rialRawMaterialGrowthRate,
    rawMaterialFxGrowth: directCosts.fxRawMaterialGrowthRate,
    wageGrowth: directCosts.directLaborGrowthFactor,
    energyGrowth: directCosts.energyTariffGrowthRate,
    scaleSavingRate: directCosts.economiesOfScaleSavingPercent,
    outputs: directResult.values,
  };
  const opexResult = calculateOpexSchedule(opex, [0, 1], [0, 1]);
  const synchronizedOpex: OpexAssumptions = {
    ...opex,
    allocationToProductionRate: opex.sharedCostAllocationPercent,
    outputs: opexResult.values.outputs,
  };
  const summary = calculateCapexSummary(capex.items, macro).values;
  const annualSchedule = calculateAnnualCapexSchedule(capex, macro, setup.baseYear, setup.analysisHorizonYears);
  return {
    setup: { ...setup, operationStartDate: operation },
    capacity: synchronizedCapacity,
    directCosts: synchronizedDirect,
    opex: synchronizedOpex,
    capex: { ...capex, summary, annualSchedule },
  };
};
