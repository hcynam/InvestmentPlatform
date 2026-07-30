import {
  calculateIrrResult,
  calculatePaybackResult,
  safeDivide,
} from "@/lib/financial-math";
import type {
  CalculationBasis,
  CalculationMetric,
  EconomicAnalysisSummary,
  EconomicAnalysisYear,
  EconomicAssumptions,
  EconomicConversionAssumption,
  EconomicDiagnostic,
  EconomicExternality,
  EconomicFinancialItem,
  EconomicFinancialReconciliation,
  EconomicItemClassification,
  EconomicMappingSummary,
  ModelSourceReference,
} from "@/lib/types";

const EPSILON = 1e-7;
const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);
const finite = (value: number | null | undefined, fallback = 0) =>
  Number.isFinite(value ?? Number.NaN) ? Number(value) : fallback;

export const defaultEconomicAssumptions = (): EconomicAssumptions => ({
  priceBasis: "real",
  economicDiscountRate: 0.08,
  standardConversionFactor: 0.9,
  unskilledLaborShadowFactor: 0.85,
  skilledLaborShadowFactor: 0.9,
  shadowExchangeRateFactor: 1.1,
  energyShadowFactor: 1.2,
  waterShadowFactor: 0.95,
  landOpportunityCostFactor: 1,
  outputClassification: "non-tradable-domestic",
  outputBorderPriceFactor: 1,
  itemMappings: [],
  externalities: [],
  capitalServiceChargeRate: 0,
  directEmploymentBenefit: 0,
  indirectEmploymentBenefit: 0,
  pollutionReductionBenefit: 0,
  environmentalCost: 0,
  infrastructurePressureCost: 0,
  technologyTransferBenefit: 0,
  importSubstitutionBenefit: 0,
  regionalDevelopmentBenefit: 0,
});

export const normalizeEconomicAssumptions = (
  value: Partial<EconomicAssumptions> | null | undefined,
): EconomicAssumptions => {
  const defaults = defaultEconomicAssumptions();
  return {
    ...defaults,
    ...value,
    itemMappings: Array.isArray(value?.itemMappings) ? value.itemMappings : [],
    externalities: Array.isArray(value?.externalities) ? value.externalities : [],
  };
};

export type EconomicAnalysisEngineInput = {
  horizonYears: number;
  baseYear: number;
  assumptions: Partial<EconomicAssumptions>;
  macroCalculationBasis: CalculationBasis;
  baseFinancialFxRate: number;
  financialNpv: number;
  financialItems: EconomicFinancialItem[];
  sourceReferences?: ModelSourceReference[];
};

const classificationLabel: Record<EconomicItemClassification, string> = {
  "imported-tradable": "قابل‌مبادله وارداتی",
  "domestic-tradable": "قابل‌مبادله داخلی",
  "exportable-output": "محصول صادراتی",
  "import-substituting-output": "محصول جایگزین واردات",
  "non-tradable-domestic": "غیرقابل‌مبادله داخلی",
  "skilled-labor": "نیروی کار ماهر",
  "unskilled-labor": "نیروی کار غیرماهر",
  energy: "انرژی",
  water: "آب",
  land: "زمین",
  "tax-transfer": "مالیات/انتقال",
  "financing-transfer": "انتقال تأمین مالی",
  externality: "اثر خارجی",
  "excluded-non-resource": "حذف‌شده/غیرمنبعی",
};

const validFactor = (value: number) => Number.isFinite(value) && value >= 0 && value <= 5;

const factorFor = (
  classification: EconomicItemClassification,
  assumptions: EconomicAssumptions,
) => {
  switch (classification) {
    case "imported-tradable":
      return assumptions.shadowExchangeRateFactor;
    case "exportable-output":
    case "import-substituting-output":
      return assumptions.outputBorderPriceFactor;
    case "domestic-tradable":
    case "non-tradable-domestic":
      return assumptions.standardConversionFactor;
    case "skilled-labor":
      return assumptions.skilledLaborShadowFactor;
    case "unskilled-labor":
      return assumptions.unskilledLaborShadowFactor;
    case "energy":
      return assumptions.energyShadowFactor;
    case "water":
      return assumptions.waterShadowFactor;
    case "land":
      return assumptions.landOpportunityCostFactor;
    case "tax-transfer":
    case "financing-transfer":
    case "excluded-non-resource":
      return 0;
    case "externality":
      return 1;
  }
};

const adjustmentField = (classification: EconomicItemClassification) => {
  if (classification === "tax-transfer" || classification === "financing-transfer" || classification === "excluded-non-resource") {
    return "transferPaymentsRemoved" as const;
  }
  if (classification === "imported-tradable" || classification === "exportable-output" || classification === "import-substituting-output") {
    return "foreignExchangeAdjustment" as const;
  }
  if (classification === "skilled-labor" || classification === "unskilled-labor") return "laborShadowAdjustment" as const;
  if (classification === "energy") return "energyAdjustment" as const;
  if (classification === "water") return "waterAdjustment" as const;
  if (classification === "land") return "landOpportunityCostAdjustment" as const;
  if (classification === "externality") return "externalityAdjustment" as const;
  return "tradableBorderAdjustment" as const;
};

const reconcileItem = (
  item: EconomicFinancialItem,
  assumptions: EconomicAssumptions,
): EconomicFinancialReconciliation => {
  const override = assumptions.itemMappings.find((mapping) => mapping.sourceId === item.sourceId);
  const classification = override?.classification ??
    (item.sourceId === "output" ? assumptions.outputClassification : item.defaultClassification);
  const baseFactor = factorFor(classification, assumptions);
  const factor = validFactor(override?.itemSpecificFactor ?? baseFactor)
    ? finite(override?.itemSpecificFactor ?? baseFactor, 1)
    : 1;
  const economicValue = Math.max(0, item.financialValue) * factor;
  const adjustment = economicValue - Math.max(0, item.financialValue);
  const bridge: EconomicFinancialReconciliation = {
    id: item.id,
    sourceId: item.sourceId,
    label: item.label,
    sourceModule: item.sourceModule,
    year: item.year,
    calendarYear: item.calendarYear,
    kind: item.kind,
    classification,
    appliedFactor: factor,
    financialMarketValue: Math.max(0, item.financialValue),
    transferPaymentsRemoved: 0,
    tradableBorderAdjustment: 0,
    foreignExchangeAdjustment: 0,
    laborShadowAdjustment: 0,
    energyAdjustment: 0,
    waterAdjustment: 0,
    landOpportunityCostAdjustment: 0,
    externalityAdjustment: 0,
    itemSpecificAdjustment: override?.itemSpecificFactor === undefined ? 0 : adjustment,
    economicValue,
    ruleSource: override ? "override" : "default",
  };
  if (override?.itemSpecificFactor === undefined) bridge[adjustmentField(classification)] = adjustment;
  return bridge;
};

const externalityIsComplete = (item: EconomicExternality) =>
  item.title.trim().length > 0 &&
  item.physicalUnit.trim().length > 0 &&
  item.source.trim().length > 0 &&
  item.explanation.trim().length > 0 &&
  Number.isFinite(item.annualQuantity) &&
  item.annualQuantity >= 0 &&
  Number.isFinite(item.economicUnitValue) &&
  item.economicUnitValue >= 0 &&
  Number.isInteger(item.startYear) &&
  Number.isInteger(item.endYear) &&
  item.startYear >= 0 &&
  item.endYear >= item.startYear;

const externalityDoubleCounts = (
  item: EconomicExternality,
  classifications: Set<EconomicItemClassification>,
) =>
  (item.doubleCountCategory === "employment" &&
    (classifications.has("skilled-labor") || classifications.has("unskilled-labor"))) ||
  (item.doubleCountCategory === "foreign-exchange" &&
    (classifications.has("exportable-output") || classifications.has("import-substituting-output"))) ||
  (item.doubleCountCategory === "output-shadow-price" &&
    (classifications.has("exportable-output") ||
      classifications.has("import-substituting-output") ||
      classifications.has("domestic-tradable") ||
      classifications.has("non-tradable-domestic")));

const buildExternalityBridge = (
  item: EconomicExternality,
  year: number,
  calendarYear: number,
): EconomicFinancialReconciliation => {
  const economicValue = item.annualQuantity * item.economicUnitValue;
  return {
    id: `externality:${item.id}:${year}`,
    sourceId: `externality:${item.id}`,
    label: item.title,
    sourceModule: item.source,
    year,
    calendarYear,
    kind: item.direction,
    classification: "externality",
    appliedFactor: 1,
    financialMarketValue: 0,
    transferPaymentsRemoved: 0,
    tradableBorderAdjustment: 0,
    foreignExchangeAdjustment: 0,
    laborShadowAdjustment: 0,
    energyAdjustment: 0,
    waterAdjustment: 0,
    landOpportunityCostAdjustment: 0,
    externalityAdjustment: economicValue,
    itemSpecificAdjustment: 0,
    economicValue,
    ruleSource: "externality",
  };
};

const metricUnavailable = (reason: string): CalculationMetric => ({
  value: null,
  status: "not_computable",
  reason,
});

export const calculateEconomicAnalysis = (
  input: EconomicAnalysisEngineInput,
) => {
  const assumptions = normalizeEconomicAssumptions(input.assumptions);
  const diagnostics: EconomicDiagnostic[] = [];
  const horizon = Math.max(0, Math.round(input.horizonYears));
  const expectedBasis = assumptions.priceBasis === "real" ? "واقعی" : "اسمی";
  const basisConsistent =
    input.macroCalculationBasis === expectedBasis ||
    input.macroCalculationBasis === "اسمی و واقعی";
  const socialRateValid =
    Number.isFinite(assumptions.economicDiscountRate) &&
    assumptions.economicDiscountRate > -1;
  const factorEntries = [
    ["SCF", assumptions.standardConversionFactor],
    ["SERF", assumptions.shadowExchangeRateFactor],
    ["SWRF", assumptions.unskilledLaborShadowFactor],
    ["ضریب نیروی ماهر", assumptions.skilledLaborShadowFactor],
    ["ضریب انرژی", assumptions.energyShadowFactor],
    ["ضریب آب", assumptions.waterShadowFactor],
    ["ضریب فرصت زمین", assumptions.landOpportunityCostFactor],
    ["ضریب قیمت مرزی محصول", assumptions.outputBorderPriceFactor],
  ] as const;
  const invalidFactors = factorEntries.filter(([, value]) => !validFactor(value));
  const analysisInputsValid = basisConsistent && socialRateValid && invalidFactors.length === 0;
  if (!basisConsistent) {
    diagnostics.push({
      id: "economic-price-basis",
      severity: "error",
      label: "سازگاری مبنای قیمت",
      message: "مبنای جریان اقتصادی با مبنای مدل کلان سازگار نیست.",
      evidence: `economic=${assumptions.priceBasis}; macro=${input.macroCalculationBasis}`,
    });
  }
  if (!socialRateValid) {
    diagnostics.push({
      id: "economic-discount-rate",
      severity: "error",
      label: "نرخ فرصت اقتصادی سرمایه",
      message: "EOCK باید عددی متناهی و بزرگ‌تر از منفی صد درصد باشد.",
      evidence: `EOCK=${assumptions.economicDiscountRate}`,
    });
  }
  if (invalidFactors.length) {
    diagnostics.push({
      id: "economic-conversion-factors",
      severity: "error",
      label: "ضرایب تبدیل",
      message: "یک یا چند ضریب تبدیل خارج از دامنه کنترل‌شده صفر تا پنج است.",
      evidence: invalidFactors.map(([label, value]) => `${label}=${value}`).join("; "),
    });
  }

  const sourceBridge = input.financialItems
    .filter((item) => item.year >= 0 && item.year <= horizon && Number.isFinite(item.financialValue))
    .map((item) => reconcileItem(item, assumptions));
  const classifications = new Set(sourceBridge.map((row) => row.classification));
  const completeExternalities = assumptions.externalities.filter((item) => item.active && externalityIsComplete(item));
  const incompleteExternalities = assumptions.externalities.filter((item) => item.active && !externalityIsComplete(item));
  const doubleCountedExternalities = completeExternalities.filter((item) => externalityDoubleCounts(item, classifications));
  const includedExternalities = completeExternalities.filter((item) => !externalityDoubleCounts(item, classifications));
  if (incompleteExternalities.length) {
    diagnostics.push({
      id: "externality-missing-data",
      severity: "error",
      label: "ثبت آثار خارجی",
      message: "آثار خارجی ناقص از محاسبه حذف شده‌اند؛ مقدار فیزیکی، ارزش واحد، منبع، دوره و توضیح الزامی است.",
      evidence: incompleteExternalities.map((item) => item.title || item.id).join("، "),
    });
  }
  if (doubleCountedExternalities.length) {
    diagnostics.push({
      id: "externality-double-counting",
      severity: "warning",
      label: "کنترل دوباره‌شماری",
      message: "آثار خارجی مشکوک به دوباره‌شماری از ENPV کنار گذاشته شدند.",
      evidence: doubleCountedExternalities.map((item) => item.title).join("، "),
    });
  }
  const externalityBridge = includedExternalities.flatMap((item) =>
    Array.from({ length: horizon + 1 }, (_, year) => year)
      .filter((year) => year >= item.startYear && year <= item.endYear)
      .map((year) => buildExternalityBridge(item, year, input.baseYear + year)));
  const reconciliation = [...sourceBridge, ...externalityBridge];

  let cumulativeNet = 0;
  let cumulativeDiscounted = 0;
  const annualRows: EconomicAnalysisYear[] = Array.from({ length: horizon + 1 }, (_, year) => {
    const yearBridge = reconciliation.filter((row) => row.year === year);
    const economicBenefits = sum(yearBridge.filter((row) => row.kind === "benefit").map((row) => row.economicValue));
    const economicCosts = sum(yearBridge.filter((row) => row.kind === "cost").map((row) => row.economicValue));
    const netEconomicBenefit = economicBenefits - economicCosts;
    const socialDiscountFactor = socialRateValid ? 1 / (1 + assumptions.economicDiscountRate) ** year : 0;
    const discountedEconomicBenefit = economicBenefits * socialDiscountFactor;
    const discountedEconomicCost = economicCosts * socialDiscountFactor;
    const discountedNetEconomicBenefit = netEconomicBenefit * socialDiscountFactor;
    cumulativeNet += netEconomicBenefit;
    cumulativeDiscounted += discountedNetEconomicBenefit;
    const value = (sourceId: string, kind?: "benefit" | "cost") =>
      sum(yearBridge.filter((row) => row.sourceId === sourceId && (!kind || row.kind === kind)).map((row) => row.economicValue));
    const financialRevenue = sum(yearBridge.filter((row) => row.sourceId === "output").map((row) => row.financialMarketValue));
    const economicRevenue = value("output", "benefit");
    const employmentBenefit = sum(yearBridge.filter((row) => row.sourceId.startsWith("externality:") && row.label.includes("اشتغال")).map((row) => row.economicValue));
    const environmentalBenefit = sum(yearBridge.filter((row) => row.sourceId.startsWith("externality:") && row.kind === "benefit" && row.label.includes("محیط")).map((row) => row.economicValue));
    const externalBenefit = sum(yearBridge.filter((row) => row.sourceId.startsWith("externality:") && row.kind === "benefit").map((row) => row.economicValue));
    const externalCost = sum(yearBridge.filter((row) => row.sourceId.startsWith("externality:") && row.kind === "cost").map((row) => row.economicValue));
    const netForeignExchangeEffect =
      sum(yearBridge.filter((row) => row.kind === "benefit" && ["exportable-output", "import-substituting-output"].includes(row.classification)).map((row) => row.economicValue)) -
      sum(yearBridge.filter((row) => row.kind === "cost" && row.classification === "imported-tradable").map((row) => row.economicValue));
    const economicDirectCost = sum(yearBridge.filter((row) => row.sourceId.startsWith("direct-")).map((row) => row.economicValue));
    const economicOpexCost = sum(yearBridge.filter((row) => row.sourceId.startsWith("opex-")).map((row) => row.economicValue));
    return {
      year,
      calendarYear: input.baseYear + year,
      financialRevenue,
      revenueShadowAdjustment: economicRevenue - financialRevenue,
      economicRevenue,
      economicCapexCost: sum(yearBridge.filter((row) => row.sourceId.startsWith("investment-")).map((row) => row.economicValue)),
      economicDirectCost,
      economicOpexCost,
      transferAdjustment: -sum(yearBridge.map((row) => row.transferPaymentsRemoved)),
      environmentalBenefit,
      energySavingBenefit: Math.max(0, externalBenefit - environmentalBenefit - employmentBenefit),
      employmentBenefit,
      externalCost,
      economicBenefits,
      economicCosts,
      netEconomicBenefit,
      cumulativeNetEconomicBenefit: cumulativeNet,
      socialDiscountFactor,
      discountedEconomicBenefit,
      discountedEconomicCost,
      discountedNetEconomicBenefit,
      cumulativeDiscountedNetEconomicBenefit: cumulativeDiscounted,
      valueAdded: economicRevenue - economicDirectCost - economicOpexCost,
      workingCapitalEconomicCost: value("working-capital-increase", "cost"),
      workingCapitalRecoveryBenefit: value("working-capital-recovery", "benefit"),
      residualValueBenefit: value("residual-value", "benefit"),
      netForeignExchangeEffect,
      discountedNetForeignExchangeEffect: netForeignExchangeEffect * socialDiscountFactor,
      reconciliation: yearBridge,
    };
  });

  const presentValueBenefits = sum(annualRows.map((row) => row.discountedEconomicBenefit));
  const presentValueCosts = sum(annualRows.map((row) => row.discountedEconomicCost));
  const enpv = presentValueBenefits - presentValueCosts;
  const rawEirr = calculateIrrResult(annualRows.map((row) => row.netEconomicBenefit));
  const eirrMetric = rawEirr.status === "multiple_solutions"
    ? metricUnavailable("جریان اقتصادی بیش از یک تغییر علامت دارد؛ EIRR یکتا و قابل اتکا نیست.")
    : rawEirr;
  const ebcr = safeDivide(presentValueBenefits, presentValueCosts);
  const paybackMetric = calculatePaybackResult(annualRows.map((row) => row.netEconomicBenefit));
  const discountedPaybackMetric = calculatePaybackResult(annualRows.map((row) => row.discountedNetEconomicBenefit));
  const valueAddedPresentValue = sum(annualRows.map((row) => row.valueAdded * row.socialDiscountFactor));
  const enpvToFinancialNpvRatio = safeDivide(enpv, input.financialNpv);
  const ratioMetric = enpvToFinancialNpvRatio === null
    ? metricUnavailable("NPV مالی صفر یا نامعتبر است؛ نسبت ENPV به NPV گزارش نمی‌شود.")
    : { value: enpvToFinancialNpvRatio, status: "ok" as const };
  const netForeignExchangeEffectPresentValue = sum(annualRows.map((row) => row.discountedNetForeignExchangeEffect));
  const bridgeDelta = annualRows.reduce((total, row) =>
    total + row.economicBenefits - row.economicCosts - row.netEconomicBenefit, 0);
  const bridgeReconciled = Math.abs(bridgeDelta) <= EPSILON;
  diagnostics.push({
    id: "economic-bridge-reconciliation",
    severity: bridgeReconciled ? "info" : "error",
    label: "تطبیق پل مالی به اقتصادی",
    message: bridgeReconciled
      ? "پل سالانه دقیقاً با ENCF تطبیق دارد."
      : "پل مالی به اقتصادی با ENCF تطبیق ندارد.",
    evidence: `difference=${bridgeDelta}`,
  });
  diagnostics.push({
    id: "economic-financing-separation",
    severity: "info",
    label: "جداسازی تأمین مالی و استهلاک",
    message: "بهره، اصل بدهی، آورده، سود سهام و استهلاک در جریان منابع اقتصادی منظور نشده‌اند.",
    evidence: "Economic perspective: national/social welfare",
  });
  diagnostics.push({
    id: "financial-economic-divergence",
    severity: Math.abs(enpv - input.financialNpv) > Math.max(1, Math.abs(input.financialNpv) * 0.01) ? "info" : "warning",
    label: "تفاوت نتیجه مالی و اقتصادی",
    message: "ENPV از جریان منابع اقتصادی و EOCK ساخته شده و کپی NPV مالی نیست.",
    evidence: `ENPV=${enpv}; financial NPV=${input.financialNpv}`,
  });

  const legacyTotals = [
    assumptions.directEmploymentBenefit,
    assumptions.indirectEmploymentBenefit,
    assumptions.pollutionReductionBenefit,
    assumptions.environmentalCost,
    assumptions.infrastructurePressureCost,
    assumptions.technologyTransferBenefit,
    assumptions.importSubstitutionBenefit,
    assumptions.regionalDevelopmentBenefit,
  ].map((value) => finite(value));
  if (legacyTotals.some((value) => Math.abs(value) > EPSILON)) {
    diagnostics.push({
      id: "legacy-economic-totals-ignored",
      severity: "warning",
      label: "مقادیر قدیمی بدون واحد",
      message: "مبالغ تجمیعی قدیمی در محاسبه استفاده نشدند؛ آن‌ها را به ثبت فیزیکی آثار خارجی تبدیل کنید.",
      evidence: "Legacy lump-sum economic assumptions are excluded.",
    });
  }

  const enpvAtRate = (rate: number) =>
    annualRows.reduce((total, row) => total + row.netEconomicBenefit / (1 + rate) ** row.year, 0);
  const sensitivityToSocialDiscountRate = [-0.02, 0, 0.02].map((delta) => {
    const rate = Math.max(0, assumptions.economicDiscountRate + delta);
    return { rate, enpv: enpvAtRate(rate) };
  });
  const mappingRows: EconomicMappingSummary[] = Array.from(
    reconciliation.reduce<Map<string, EconomicMappingSummary>>((map, row) => {
      const existing = map.get(row.sourceId);
      if (existing) {
        existing.financialValue += row.financialMarketValue;
        existing.economicValue += row.economicValue;
      } else {
        map.set(row.sourceId, {
          sourceId: row.sourceId,
          label: row.label,
          sourceModule: row.sourceModule,
          kind: row.kind,
          classification: row.classification,
          appliedFactor: row.appliedFactor,
          financialValue: row.financialMarketValue,
          economicValue: row.economicValue,
          ruleSource: row.ruleSource,
        });
      }
      return map;
    }, new Map()).values(),
  );
  const factorOk = (value: number) => validFactor(value);
  const conversionAssumptions: EconomicConversionAssumption[] = [
    { id: "eock", label: "نرخ فرصت اقتصادی سرمایه (EOCK)", value: assumptions.economicDiscountRate, unit: "percent", sourceLabel: "ورودی تحلیل اقتصادی", sourceModule: "Economic Analysis", status: socialRateValid ? "modeled" : "watch", note: `مبنای ${assumptions.priceBasis === "real" ? "واقعی/ثابت" : "اسمی/جاری"}` },
    { id: "scf", label: "ضریب تبدیل استاندارد (SCF)", value: assumptions.standardConversionFactor, unit: "ratio", sourceLabel: "ورودی تحلیل اقتصادی", sourceModule: "Economic Analysis", status: factorOk(assumptions.standardConversionFactor) ? "modeled" : "watch", note: "فقط برای اقلام طبقه‌بندی‌شده مرتبط اعمال می‌شود." },
    { id: "serf", label: "ضریب نرخ ارز سایه‌ای (SERF)", value: assumptions.shadowExchangeRateFactor, unit: "ratio", sourceLabel: "ورودی تحلیل اقتصادی", sourceModule: "Economic Analysis", status: factorOk(assumptions.shadowExchangeRateFactor) ? "modeled" : "watch", note: "روی اقلام وارداتی قابل‌مبادله اعمال می‌شود." },
    { id: "shadow-fx", label: "نرخ ارز سایه‌ای", value: finite(input.baseFinancialFxRate) * assumptions.shadowExchangeRateFactor, unit: "money", sourceLabel: "نرخ ارز پایه × SERF", sourceModule: "Macro / Economic Analysis", status: finite(input.baseFinancialFxRate) > 0 ? "modeled" : "watch", note: "نرخ پایه از مفروضات کلان خوانده می‌شود." },
    { id: "skilled-wage", label: "ضریب دستمزد ماهر", value: assumptions.skilledLaborShadowFactor, unit: "ratio", sourceLabel: "ورودی تحلیل اقتصادی", sourceModule: "Economic Analysis", status: factorOk(assumptions.skilledLaborShadowFactor) ? "modeled" : "watch", note: "فقط روی ردیف نیروی ماهر." },
    { id: "unskilled-wage", label: "ضریب دستمزد غیرماهر (SWRF)", value: assumptions.unskilledLaborShadowFactor, unit: "ratio", sourceLabel: "ورودی تحلیل اقتصادی", sourceModule: "Economic Analysis", status: factorOk(assumptions.unskilledLaborShadowFactor) ? "modeled" : "watch", note: "فقط روی ردیف نیروی غیرماهر." },
    { id: "energy", label: "ضریب اقتصادی انرژی", value: assumptions.energyShadowFactor, unit: "ratio", sourceLabel: "ورودی تحلیل اقتصادی", sourceModule: "Economic Analysis", status: factorOk(assumptions.energyShadowFactor) ? "modeled" : "watch", note: "فقط روی ردیف انرژی." },
    { id: "water", label: "ضریب اقتصادی آب", value: assumptions.waterShadowFactor, unit: "ratio", sourceLabel: "ورودی تحلیل اقتصادی", sourceModule: "Economic Analysis", status: factorOk(assumptions.waterShadowFactor) ? "modeled" : "watch", note: "فقط روی ردیف آب." },
    { id: "land", label: "ضریب هزینه فرصت زمین", value: assumptions.landOpportunityCostFactor, unit: "ratio", sourceLabel: "ورودی تحلیل اقتصادی", sourceModule: "Economic Analysis", status: factorOk(assumptions.landOpportunityCostFactor) ? "modeled" : "watch", note: "فقط روی ردیف زمین." },
  ];
  const decisionStatus: "acceptable" | "review" | "critical" =
    !analysisInputsValid
      ? "review"
      : enpv > 0 && eirrMetric.status === "ok" && (eirrMetric.value ?? -Infinity) > assumptions.economicDiscountRate && (ebcr ?? -Infinity) > 1
      ? "acceptable"
      : enpv <= 0 || (ebcr !== null && ebcr <= 1)
        ? "critical"
        : "review";
  const decisionLabel = decisionStatus === "acceptable" ? "توجیه‌پذیر اقتصادی" : decisionStatus === "critical" ? "فاقد توجیه اقتصادی" : "نیازمند تکمیل/بازنگری";
  const decisionNarrative = !analysisInputsValid
    ? "تا رفع ناسازگاری مبنای قیمت، EOCK یا ضرایب تبدیل، تصمیم اقتصادی نهایی صادر نمی‌شود."
    : `تصمیم بر مبنای سه آزمون ENPV ${enpv > 0 ? "مثبت" : "نامثبت"}، EIRR ${eirrMetric.status === "ok" && (eirrMetric.value ?? 0) > assumptions.economicDiscountRate ? "بالاتر از EOCK" : "نامعتبر یا پایین‌تر از EOCK"} و EBCR ${ebcr !== null && ebcr > 1 ? "بالاتر از یک" : "ناموجود یا حداکثر یک"} اتخاذ شده است.`;
  const enpvMetric: CalculationMetric =
    analysisInputsValid
      ? { value: enpv, status: "ok" }
      : { value: null, status: "invalid_input", reason: "مبنای قیمت، EOCK یا ضرایب تبدیل معتبر نیست." };
  const reportedEirrMetric: CalculationMetric = analysisInputsValid
    ? eirrMetric
    : { value: null, status: "invalid_input", reason: "ابتدا مبنای قیمت، EOCK و ضرایب تبدیل را اصلاح کنید." };
  const ebcrMetric: CalculationMetric = ebcr === null
    ? metricUnavailable("ارزش فعلی هزینه اقتصادی صفر است؛ EBCR تعریف نمی‌شود.")
    : { value: ebcr, status: "ok" };
  const summary: EconomicAnalysisSummary = {
    decisionStatus,
    decisionLabel,
    decisionNarrative,
    presentValueBenefits,
    presentValueCosts,
    socialDiscountRate: assumptions.economicDiscountRate,
    standardConversionFactor: assumptions.standardConversionFactor,
    shadowExchangeRateFactor: assumptions.shadowExchangeRateFactor,
    shadowExchangeRate: finite(input.baseFinancialFxRate) * assumptions.shadowExchangeRateFactor,
    priceBasis: assumptions.priceBasis,
    economicPayback: paybackMetric.value,
    discountedEconomicPayback: discountedPaybackMetric.value,
    valueAddedPresentValue,
    financialNpv: input.financialNpv,
    npvDifference: enpv - input.financialNpv,
    enpvToFinancialNpvRatio,
    netForeignExchangeEffectPresentValue,
    bridgeReconciled,
    sensitivityToSocialDiscountRate,
    conversionAssumptions,
    benefitCostLines: [
      { id: "pv-benefits", label: "ارزش فعلی منافع اقتصادی", value: presentValueBenefits, unit: "money", sourceLabel: "جمع سری سالانه منافع" },
      { id: "pv-costs", label: "ارزش فعلی هزینه‌های اقتصادی", value: presentValueCosts, unit: "money", sourceLabel: "جمع سری سالانه هزینه‌ها" },
      { id: "net-fx", label: "اثر خالص ارزی تنزیل‌شده", value: netForeignExchangeEffectPresentValue, unit: "money", sourceLabel: "صادرات/جایگزینی واردات منهای منابع وارداتی" },
      { id: "transfers", label: "انتقالات حذف‌شده", value: -sum(reconciliation.map((row) => row.transferPaymentsRemoved)), unit: "money", sourceLabel: "پل مالی به اقتصادی" },
    ],
    sourceReferences: input.sourceReferences ?? [],
    diagnostics,
    mappingRows,
    reconciliation,
    metrics: {
      enpv: enpvMetric,
      eirr: reportedEirrMetric,
      ebcr: ebcrMetric,
      economicPayback: paybackMetric,
      discountedEconomicPayback: discountedPaybackMetric,
      enpvToFinancialNpvRatio: ratioMetric,
    },
  };

  return {
    annualRows,
    summary,
    encf: annualRows[1]?.netEconomicBenefit ?? annualRows[0]?.netEconomicBenefit ?? 0,
    enpv,
    eirr: reportedEirrMetric.value,
    ebcr,
    valueAdded: valueAddedPresentValue,
    presentValueBenefits,
    presentValueCosts,
    economicPayback: paybackMetric.value,
    discountedEconomicPayback: discountedPaybackMetric.value,
    netForeignExchangeEffectPresentValue,
  };
};

export const economicClassificationLabel = classificationLabel;
