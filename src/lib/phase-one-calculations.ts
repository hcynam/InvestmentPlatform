import type {
  FormulaTrace,
  FXRateType,
  IndustryTemplate,
  MacroAssumptions,
  MarketDemandAssumptions,
  ProjectSetup,
  ValidationIssue,
} from "@/lib/types";

export type StructuredResult<T> = {
  values: T;
  warnings: ValidationIssue[];
  errors: ValidationIssue[];
  trace: FormulaTrace[];
};

const issue = (
  id: string,
  severity: ValidationIssue["severity"],
  module: string,
  field: string,
  message: string,
  recommendation: string,
  sourceSheet?: string,
  sourceCell?: string,
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
  result: number | string | null,
  sourceSheet?: string,
  sourceCell?: string,
): FormulaTrace => ({ id, label, formula, inputs, result, sourceSheet, sourceCell });

export const calculateEffectiveDiscountRate = (
  macro: MacroAssumptions,
): StructuredResult<{
  suggestedRate: number;
  manualRate: number;
  realRate: number;
  appliedRate: number;
  variance: number;
}> => {
  const suggestedRate =
    macro.costOfCapital +
    macro.countryRiskPremium +
    macro.industryRiskPremium +
    macro.projectRiskPremium;
  const manualRate = macro.defaultDiscountRate;
  const realRate = (1 + manualRate) / Math.max(0.000001, 1 + macro.inflationGeneralAnnual) - 1;
  const appliedRate = macro.calculationBasis === "واقعی" ? realRate : manualRate;
  const warnings: ValidationIssue[] = [];

  if (macro.calculationBasis === "اسمی" && manualRate < macro.inflationGeneralAnnual) {
    warnings.push(issue(
      "macro-discount-below-inflation",
      "warning",
      "macro",
      "defaultDiscountRate",
      "نرخ تنزیل اسمی از تورم عمومی کمتر است.",
      "نرخ تنزیل، مبنای محاسبه یا مفروضات تورم را بازبینی کنید.",
      "MarcoAssumptions05",
      "V61",
    ));
  }
  if (macro.minimumAcceptableReturn < manualRate) {
    warnings.push(issue(
      "macro-hurdle-below-discount",
      "warning",
      "macro",
      "minimumAcceptableReturn",
      "حداقل بازده قابل قبول از نرخ تنزیل کمتر است.",
      "Hurdle rate را با سیاست تصمیم‌گیری سرمایه‌گذار هماهنگ کنید.",
      "MarcoAssumptions05",
      "V68",
    ));
  }
  if (macro.calculationBasis === "اسمی و واقعی") {
    warnings.push(issue(
      "macro-dual-basis-preview",
      "info",
      "macro",
      "calculationBasis",
      "مبنای دوگانه فعال است؛ خروجی‌های اسمی و واقعی DCF به‌صورت موازی گزارش می‌شوند.",
      "FCFF/FCFE اسمی و واقعی را در صفحه ارزش‌گذاری و خروجی گزارش با هم مقایسه کنید.",
      "MarcoAssumptions05",
      "V10",
    ));
  }

  return {
    values: {
      suggestedRate,
      manualRate,
      realRate,
      appliedRate,
      variance: manualRate - suggestedRate,
    },
    warnings,
    errors: [],
    trace: [
      trace(
        "phase1.effectiveDiscountRate",
        "نرخ تنزیل مؤثر پیشنهادی",
        "Cost of Capital + Country Risk + Industry Risk + Project Risk",
        [
          { label: "هزینه سرمایه", value: macro.costOfCapital, source: "MarcoAssumptions05!V62" },
          { label: "ریسک کشور", value: macro.countryRiskPremium, source: "MarcoAssumptions05!V64" },
          { label: "ریسک صنعت", value: macro.industryRiskPremium, source: "MarcoAssumptions05!V65" },
          { label: "ریسک پروژه", value: macro.projectRiskPremium, source: "MarcoAssumptions05!V66" },
        ],
        suggestedRate,
        "MarcoAssumptions05",
        "V61:V66",
      ),
    ],
  };
};

export const calculateFxRateByType = (
  macro: MacroAssumptions,
  fxType: FXRateType,
): StructuredResult<{ fxType: FXRateType; rate: number }> => {
  const aliases: Partial<Record<FXRateType, number>> = {
    official: macro.officialFxRate,
    freeMarket: macro.freeMarketFxRate,
    remittance: macro.remittanceFxRate,
  };
  const rate = aliases[fxType] ?? macro.fxRates[fxType] ?? macro.baseFxRate;
  const errors = rate < 0
    ? [issue(
        `macro-negative-fx-${fxType}`,
        "error",
        "macro",
        "fxRates",
        "نرخ ارز نمی‌تواند منفی باشد.",
        "نرخ معتبر و مثبت وارد کنید.",
        "MarcoAssumptions05",
        "V33:V42",
      )]
    : [];

  return {
    values: { fxType, rate },
    warnings: [],
    errors,
    trace: [
      trace(
        `phase1.fx.${fxType}`,
        "نرخ ارز قابل اعمال",
        `FX Rate = FX Rates[${fxType}]`,
        [{ label: "نوع نرخ", value: fxType, source: "MarcoAssumptions05!V36" }],
        rate,
        "MarcoAssumptions05",
        "V33:V42",
      ),
    ],
  };
};

export const calculateFxMappingRates = (
  macro: MacroAssumptions,
): StructuredResult<Array<{ id: string; module: string; label: string; fxType: FXRateType; rate: number }>> => {
  const values = macro.fxMappings.map((mapping) => ({
    id: mapping.id,
    module: mapping.module,
    label: mapping.label,
    fxType: mapping.fxType,
    rate: mapping.fxType === "manual"
      ? mapping.manualRate ?? macro.fxRates.manual
      : calculateFxRateByType(macro, mapping.fxType).values.rate,
  }));
  const errors = values
    .filter((mapping) => mapping.rate <= 0)
    .map((mapping) => issue(
      `macro-fx-mapping-${mapping.id}`,
      "error",
      "macro",
      mapping.id,
      `نرخ ارز نگاشت‌شده برای «${mapping.label}» معتبر نیست.`,
      "نوع نرخ یا نرخ دستی این ماژول را اصلاح کنید.",
      "MarcoAssumptions05",
      "V33:V42",
    ));
  return {
    values,
    warnings: [],
    errors,
    trace: values.map((mapping) => trace(
      `phase1.fxMapping.${mapping.id}`,
      `نگاشت نرخ ارز ${mapping.label}`,
      "Module FX Rate = Selected FX Tier Rate",
      [{ label: "نوع نرخ", value: mapping.fxType, source: "MarcoAssumptions05!V36" }],
      mapping.rate,
      "MarcoAssumptions05",
      "V33:V42",
    )),
  };
};

export const inferIndustryCostStructure = (
  setup: ProjectSetup,
  industry: IndustryTemplate,
): StructuredResult<IndustryTemplate["systemSuggestedCostStructure"]> => {
  const combined = `${setup.projectType} ${setup.mainIndustry} ${industry.mainRevenueType}`.toLowerCase();
  let values: IndustryTemplate["systemSuggestedCostStructure"];
  if (combined.includes("نرم") || combined.includes("saas") || combined.includes("پلتفرم")) {
    values = {
      suggestedMainCostType: "نیروی انسانی",
      suggestedDominantVariableCost: "زیرساخت و سرور",
      suggestedDominantFixedCost: "نیروی انسانی",
      suggestedWorkingCapitalSensitivity: "پایین",
      confidence: 0.88,
      explanation: "در مدل‌های نرم‌افزاری، حقوق تیم و زیرساخت/Cloud محرک اصلی هزینه هستند.",
    };
  } else if (combined.includes("بازرگان")) {
    values = {
      suggestedMainCostType: "مواد اولیه",
      suggestedDominantVariableCost: "حمل و لجستیک",
      suggestedDominantFixedCost: "مالی و بانکی",
      suggestedWorkingCapitalSensitivity: "بسیار بالا",
      confidence: 0.84,
      explanation: "مدل بازرگانی به خرید کالا، لجستیک و چرخه سرمایه در گردش حساس است.",
    };
  } else if (combined.includes("خدمات")) {
    values = {
      suggestedMainCostType: "نیروی انسانی",
      suggestedDominantVariableCost: "پیمانکار",
      suggestedDominantFixedCost: "نیروی انسانی",
      suggestedWorkingCapitalSensitivity: "متوسط",
      confidence: 0.8,
      explanation: "در پروژه‌های خدماتی، نیروی انسانی و پیمانکار سهم اصلی هزینه را دارند.",
    };
  } else if (combined.includes("انرژی")) {
    values = {
      suggestedMainCostType: "انرژی",
      suggestedDominantVariableCost: "تعمیر و نگهداری",
      suggestedDominantFixedCost: "هزینه سرمایه",
      suggestedWorkingCapitalSensitivity: "متوسط",
      confidence: 0.82,
      explanation: "پروژه انرژی سرمایه‌بر است و هزینه سرمایه و نگهداری بر ساختار هزینه غالب‌اند.",
    };
  } else {
    values = {
      suggestedMainCostType: "مواد اولیه",
      suggestedDominantVariableCost: "مواد اولیه",
      suggestedDominantFixedCost: "نیروی انسانی",
      suggestedWorkingCapitalSensitivity: "بالا",
      confidence: 0.72,
      explanation: "قاعده عمومی پروژه‌های صنعتی/تولیدی اعمال شده است.",
    };
  }

  return {
    values,
    warnings: [],
    errors: [],
    trace: [
      trace(
        "phase1.industryCostSuggestion",
        "پیشنهاد ساختار هزینه صنعت",
        "Rule(projectType, industry, revenueModel)",
        [
          { label: "نوع پروژه", value: setup.projectType, source: "ProjectSetup02!U12" },
          { label: "صنعت", value: setup.mainIndustry, source: "ProjectSetup02!U10" },
          { label: "مدل درآمد", value: industry.mainRevenueType, source: "IndustryTemplate07!R38" },
        ],
        values.suggestedMainCostType,
        "IndustryTemplate07",
        "R41:R48",
      ),
    ],
  };
};

export const calculateOperationalIndicators = (
  industry: IndustryTemplate,
): StructuredResult<{
  modeledEffectiveCapacity: number;
  idleCapacity: number;
  operationalIntensityScore: number;
  averageRiskScore: number;
}> => {
  const modeledEffectiveCapacity =
    industry.nominalCapacity *
    industry.utilizationRate *
    (1 - industry.wasteRate) *
    industry.efficiency;
  const idleCapacity = Math.max(0, industry.nominalCapacity - industry.effectiveCapacity);
  const riskScores = industry.risks.map((risk) => risk.probability * risk.impact);
  const averageRiskScore = riskScores.length
    ? riskScores.reduce((sum, score) => sum + score, 0) / riskScores.length
    : 0;
  const operationalIntensityScore = Math.min(
    100,
    Math.max(0, industry.utilizationRate * 45 + industry.efficiency * 35 + (1 - industry.wasteRate) * 20),
  );

  return {
    values: { modeledEffectiveCapacity, idleCapacity, operationalIntensityScore, averageRiskScore },
    warnings: industry.effectiveCapacity > industry.nominalCapacity
      ? [issue(
          "industry-effective-over-nominal",
          "warning",
          "industry-template",
          "effectiveCapacity",
          "ظرفیت مؤثر از ظرفیت اسمی بیشتر است.",
          "در صورت نبود override تخصصی، ظرفیت مؤثر را حداکثر برابر ظرفیت اسمی قرار دهید.",
          "IndustryTemplate07",
          "R20:R21",
        )]
      : [],
    errors: [],
    trace: [
      trace(
        "phase1.operationalCapacity",
        "ظرفیت مؤثر مدل‌شده",
        "Nominal Capacity × Utilization × (1 - Waste) × Efficiency",
        [
          { label: "ظرفیت اسمی", value: industry.nominalCapacity, source: "IndustryTemplate07!R20" },
          { label: "ضریب بهره‌برداری", value: industry.utilizationRate, source: "IndustryTemplate07!R22" },
          { label: "ضایعات", value: industry.wasteRate, source: "IndustryTemplate07!R23" },
          { label: "راندمان", value: industry.efficiency, source: "CapacityProduction09" },
        ],
        modeledEffectiveCapacity,
        "IndustryTemplate07",
        "R20:R30",
      ),
    ],
  };
};

export const calculateMarketFunnel = (
  market: MarketDemandAssumptions,
): StructuredResult<{ tam: number; sam: number; som: number; targetShare: number }> => {
  const tam = market.totalMarketSize;
  const sam = market.serviceableAvailableMarket;
  const som = market.targetMarketSize > 0 ? market.targetMarketSize : sam * market.targetShare;
  const targetShare = sam > 0 ? som / sam : 0;
  const warnings: ValidationIssue[] = [];
  const errors: ValidationIssue[] = [];
  if (sam > tam) errors.push(issue("market-sam-over-tam", "error", "market-demand", "serviceableAvailableMarket", "بازار قابل دسترس از اندازه کل بازار بیشتر است.", "TAM و SAM را بازبینی کنید.", "MarketDemand08", "Q18:Q19"));
  if (som > sam) errors.push(issue("market-som-over-sam", "error", "market-demand", "targetMarketSize", "بازار هدف از بازار قابل دسترس بیشتر است.", "SOM را حداکثر برابر SAM قرار دهید.", "MarketDemand08", "Q19:Q20"));
  if (Math.abs(market.targetShare - targetShare) > 0.01) warnings.push(issue("market-share-mismatch", "warning", "market-demand", "targetShare", "سهم هدف با نسبت بازار هدف به بازار قابل دسترس همخوان نیست.", "سهم هدف یا اندازه بازار هدف را اصلاح کنید.", "MarketDemand08", "Q20:Q21"));
  return {
    values: { tam, sam, som, targetShare },
    warnings,
    errors,
    trace: [
      trace(
        "phase1.marketFunnel",
        "قیف بازار TAM / SAM / SOM",
        "TAM = Total Market; SAM = Serviceable Market; SOM = Target Market or SAM × Target Share",
        [
          { label: "TAM", value: tam, source: "MarketDemand08!Q18" },
          { label: "SAM", value: sam, source: "MarketDemand08!Q19" },
          { label: "SOM", value: som, source: "MarketDemand08!Q20" },
        ],
        som,
        "MarketDemand08",
        "Q18:Q21",
      ),
    ],
  };
};

export const calculateAchievableSales = (
  market: MarketDemandAssumptions,
  capacityData?: { supplyLimit?: number },
): StructuredResult<{
  calculatedAchievableSales: number;
  achievableSales: number;
  potentialSales: number;
  constraints: { salesCeiling: number; marketAbsorption: number; supplyLimit: number | null };
}> => {
  const potentialSales = market.potentialSalesYear1 * market.marketAchievementFactor;
  const supplyLimit = market.hasSupplyConstraint
    ? capacityData?.supplyLimit ?? market.supplyConstraintValue
    : Number.POSITIVE_INFINITY;
  const calculatedAchievableSales = Math.max(
    0,
    Math.min(potentialSales, market.salesCeiling, market.marketAbsorptionCapacity, supplyLimit),
  );
  const achievableSales = market.achievableSalesOverrideEnabled && market.achievableSalesOverride !== null
    ? market.achievableSalesOverride
    : calculatedAchievableSales;
  const warnings: ValidationIssue[] = [];
  const errors: ValidationIssue[] = [];
  if (achievableSales > market.salesCeiling) errors.push(issue("market-sales-over-ceiling", "error", "market-demand", "achievableSales", "فروش قابل تحقق از سقف فروش بیشتر است.", "سقف فروش یا override را اصلاح کنید.", "MarketDemand08", "Q50:Q51"));
  if (market.marketAchievementFactor > 0.8) warnings.push(issue("market-high-achievement", "warning", "market-demand", "marketAchievementFactor", "ضریب دستیابی به بازار بالاتر از ۸۰٪ است.", "شواهد قرارداد، ظرفیت فروش و ریسک اجرا را مستند کنید.", "MarketDemand08", "Q49"));
  return {
    values: {
      calculatedAchievableSales,
      achievableSales,
      potentialSales,
      constraints: {
        salesCeiling: market.salesCeiling,
        marketAbsorption: market.marketAbsorptionCapacity,
        supplyLimit: Number.isFinite(supplyLimit) ? supplyLimit : null,
      },
    },
    warnings,
    errors,
    trace: [
      trace(
        "phase1.achievableSales",
        "فروش قابل تحقق",
        "MIN(Potential Sales × Market Achievement, Sales Ceiling, Market Absorption, Supply Constraint)",
        [
          { label: "فروش بالقوه", value: market.potentialSalesYear1, source: "MarketDemand08!Q45" },
          { label: "ضریب دستیابی", value: market.marketAchievementFactor, source: "MarketDemand08!Q49" },
          { label: "سقف فروش", value: market.salesCeiling, source: "MarketDemand08!Q50" },
          { label: "ظرفیت جذب بازار", value: market.marketAbsorptionCapacity, source: "MarketDemand08!Q25" },
          { label: "محدودیت عرضه", value: Number.isFinite(supplyLimit) ? supplyLimit : "غیرفعال", source: "CapacityProduction09!Q46" },
        ],
        achievableSales,
        "MarketDemand08",
        "Q45:Q51",
      ),
    ],
  };
};

export const calculatePotentialRevenue = (
  market: MarketDemandAssumptions,
  capacityData?: { supplyLimit?: number },
): StructuredResult<{ achievableSales: number; potentialRevenue: number }> => {
  const sales = calculateAchievableSales(market, capacityData);
  const potentialRevenue = sales.values.achievableSales * market.unitSalesPrice;
  const warnings = [...sales.warnings];
  if (potentialRevenue === 0) warnings.push(issue("market-zero-revenue", "warning", "market-demand", "potentialRevenue", "درآمد بالقوه صفر است.", "فروش قابل تحقق و نرخ فروش واحد را بررسی کنید.", "MarketDemand08", "Q51:Q53"));
  return {
    values: { achievableSales: sales.values.achievableSales, potentialRevenue },
    warnings,
    errors: sales.errors,
    trace: [
      ...sales.trace,
      trace(
        "phase1.potentialRevenue",
        "درآمد بالقوه",
        "Achievable Sales × Unit Sales Price",
        [
          { label: "فروش قابل تحقق", value: sales.values.achievableSales, source: "MarketDemand08!Q51" },
          { label: "نرخ فروش واحد", value: market.unitSalesPrice, source: "MarketDemand08!Q52" },
        ],
        potentialRevenue,
        "MarketDemand08",
        "Q53",
      ),
    ],
  };
};

export const validateProjectSetup = (setup: ProjectSetup): StructuredResult<ProjectSetup> => {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  if (!setup.projectName.trim()) errors.push(issue("setup-name-required", "error", "setup", "projectName", "نام پروژه الزامی است.", "نام کامل پروژه را وارد کنید.", "ProjectSetup02", "U8"));
  if (!Number.isFinite(setup.baseYear) || setup.baseYear < 1300) errors.push(issue("setup-base-year", "error", "setup", "baseYear", "سال پایه معتبر نیست.", "سال پایه معتبر وارد کنید.", "ProjectSetup02", "U25"));
  if (!setup.projectType) errors.push(issue("setup-project-type", "error", "setup", "projectType", "نوع پروژه الزامی است.", "نوع پروژه را انتخاب کنید.", "ProjectSetup02", "U12"));
  if (!setup.mainIndustry.trim()) errors.push(issue("setup-industry", "error", "setup", "mainIndustry", "صنعت اصلی الزامی است.", "صنعت اصلی را تعیین کنید.", "ProjectSetup02", "U10"));
  if (!setup.legalPersonality) errors.push(issue("setup-legal", "error", "setup", "legalPersonality", "شخصیت حقوقی الزامی است.", "شخصیت حقوقی را انتخاب کنید.", "ProjectSetup02", "U15"));
  if (setup.operationStartDate < setup.constructionStartDate) errors.push(issue("setup-date-order", "error", "setup", "operationStartDate", "تاریخ بهره‌برداری قبل از شروع ساخت است.", "توالی زمانی پروژه را اصلاح کنید.", "ProjectSetup02", "U27:U28"));
  if (setup.constructionDurationMonths <= 0) errors.push(issue("setup-duration", "error", "setup", "constructionDurationMonths", "مدت ساخت باید مثبت باشد.", "مدت ساخت را بر حسب ماه وارد کنید.", "ProjectSetup02", "U29"));
  if (setup.analysisHorizonYears < 5) errors.push(issue("setup-horizon", "error", "setup", "analysisHorizonYears", "افق تحلیل باید حداقل ۵ سال باشد.", "افق تحلیل را افزایش دهید.", "ProjectSetup02", "U31"));
  else if (setup.analysisHorizonYears < 10 || setup.analysisHorizonYears > 20) warnings.push(issue("setup-horizon-preferred", "warning", "setup", "analysisHorizonYears", "افق تحلیل خارج از دامنه پیشنهادی ۱۰ تا ۲۰ سال است.", "تناسب افق مدل با عمر اقتصادی دارایی را بررسی کنید.", "ProjectSetup02", "U31"));
  return {
    values: setup,
    warnings,
    errors,
    trace: [
      trace(
        "phase1.setupTimeline",
        "کنترل توالی زمانی پروژه",
        "Operation Start >= Construction Start",
        [
          { label: "شروع ساخت", value: setup.constructionStartDate, source: "ProjectSetup02!U27" },
          { label: "شروع بهره‌برداری", value: setup.operationStartDate, source: "ProjectSetup02!U28" },
        ],
        setup.operationStartDate >= setup.constructionStartDate ? "معتبر" : "نامعتبر",
        "ProjectSetup02",
        "U27:U31",
      ),
    ],
  };
};

export const validateMacroAssumptions = (macro: MacroAssumptions): StructuredResult<MacroAssumptions> => {
  const errors: ValidationIssue[] = [];
  const warnings = [...calculateEffectiveDiscountRate(macro).warnings];
  const rates = [
    macro.inflationGeneralAnnual,
    macro.salesPriceGrowth,
    macro.wageGrowth,
    macro.energyGrowth,
    macro.rawMaterialGrowth,
    macro.servicesGrowth,
    macro.rentGrowth,
    macro.assetCostGrowth,
    macro.marketingCostGrowth,
    macro.otherCostGrowth,
  ];
  rates.forEach((rate, index) => {
    if (rate < -1 || rate > 3) errors.push(issue(`macro-growth-range-${index}`, "error", "macro", "growthRates", "نرخ رشد خارج از دامنه معتبر -۱۰۰٪ تا ۳۰۰٪ است.", "نرخ را اصلاح کنید.", "MarcoAssumptions05", `V${19 + index}`));
    else if (rate > 1) warnings.push(issue(`macro-growth-high-${index}`, "warning", "macro", "growthRates", "یک نرخ رشد بالاتر از ۱۰۰٪ ثبت شده است.", "فرض رشد را مستند و stress-test کنید.", "MarcoAssumptions05", `V${19 + index}`));
  });
  if (rates.every((rate) => rate === 0)) warnings.push(issue("macro-zero-inflation", "warning", "macro", "growthRates", "همه نرخ‌های تورم و رشد صفر هستند.", "در صورت مدل غیرتورمی بودن، این فرض را مستند کنید.", "MarcoAssumptions05", "V19:V28"));
  if (macro.calculationBasis === "واقعی" && macro.inflationGeneralAnnual === 0) errors.push(issue("macro-real-without-inflation", "error", "macro", "inflationGeneralAnnual", "برای مبنای واقعی باید تورم عمومی تعریف شود.", "نرخ تورم عمومی را وارد کنید.", "MarcoAssumptions05", "V10,V19"));
  if (!macro.baseCurrency) errors.push(issue("macro-currency-required", "error", "macro", "baseCurrency", "واحد پول مبنا انتخاب نشده است.", "واحد پول مبنا را انتخاب کنید.", "MarcoAssumptions05", "V12"));
  if ([macro.officialFxRate, macro.freeMarketFxRate, macro.remittanceFxRate, macro.baseFxRate].some((rate) => rate < 0)) errors.push(issue("macro-negative-fx", "error", "macro", "fxRates", "نرخ ارز نمی‌تواند منفی باشد.", "نرخ‌های ارزی را اصلاح کنید.", "MarcoAssumptions05", "V33:V36"));
  if (macro.maxFxShock < macro.fxVolatility) warnings.push(issue("macro-shock-below-volatility", "warning", "macro", "maxFxShock", "سقف شوک ارزی از نوسان ارز کمتر است.", "سقف شوک stress scenario را افزایش دهید.", "MarcoAssumptions05", "V39:V40"));
  if (macro.taxExemptionType !== "ندارد" && macro.taxExemptionYears <= 0) errors.push(issue("macro-tax-exemption-years", "error", "macro", "taxExemptionYears", "برای معافیت مالیاتی باید مدت معافیت مثبت باشد.", "تعداد سال معافیت را وارد کنید.", "MarcoAssumptions05", "V52:V53"));
  return {
    values: macro,
    warnings,
    errors,
    trace: [...calculateEffectiveDiscountRate(macro).trace, ...calculateFxMappingRates(macro).trace],
  };
};

export const validateIndustryTemplate = (industry: IndustryTemplate): StructuredResult<IndustryTemplate> => {
  const operational = calculateOperationalIndicators(industry);
  const errors: ValidationIssue[] = [];
  const warnings = [...operational.warnings];
  const percentages = [
    industry.utilizationRate,
    industry.wasteRate,
    industry.returnRate,
    industry.firstYearUtilization,
    industry.stableUtilization,
    industry.efficiency,
  ];
  if (percentages.some((value) => value < 0 || value > 1)) errors.push(issue("industry-percent-range", "error", "industry-template", "operationalPercentages", "درصدهای عملیاتی باید بین صفر و صد باشند.", "مقادیر بهره‌برداری، ضایعات و راندمان را اصلاح کنید.", "IndustryTemplate07", "R22:R29"));
  if (industry.stableUtilization < industry.firstYearUtilization) warnings.push(issue("industry-stable-below-first", "warning", "industry-template", "stableUtilization", "بهره‌برداری پایدار از سال اول کمتر است.", "منطق ramp-up را بازبینی کنید.", "IndustryTemplate07", "R20:R30"));
  if (industry.wasteRate > 0.2) warnings.push(issue("industry-high-waste", "warning", "industry-template", "wasteRate", "نرخ ضایعات بالاتر از ۲۰٪ است.", "برنامه کاهش ضایعات یا اثر آن روی COGS را ثبت کنید.", "IndustryTemplate07", "R23"));
  const exposureTotal = industry.costFxExposureTable.reduce((sum, row) => sum + row.totalCostShare, 0);
  if (Math.abs(exposureTotal - 1) > 0.02) warnings.push(issue("industry-cost-share-total", "warning", "industry-template", "costFxExposureTable", "جمع سهم گروه‌های هزینه با ۱۰۰٪ برابر نیست.", "سهم گروه‌های هزینه را متعادل کنید.", "IndustryTemplate07", "R45"));
  return { values: industry, warnings, errors, trace: operational.trace };
};

export const validateMarketDemand = (
  market: MarketDemandAssumptions,
  capacityData?: { supplyLimit?: number },
): StructuredResult<MarketDemandAssumptions> => {
  const funnel = calculateMarketFunnel(market);
  const revenue = calculatePotentialRevenue(market, capacityData);
  const warnings = [...funnel.warnings, ...revenue.warnings];
  const errors = [...funnel.errors, ...revenue.errors];
  if (market.maxPenetrationRate < market.initialPenetrationRate) errors.push(issue("market-penetration-order", "error", "market-demand", "maxPenetrationRate", "سقف نفوذ از نرخ نفوذ اولیه کمتر است.", "نرخ‌های نفوذ را اصلاح کنید.", "MarketDemand08", "Q23:Q24"));
  if (market.salesGrowthRate > 0.5) warnings.push(issue("market-high-sales-growth", "warning", "market-demand", "salesGrowthRate", "رشد فروش بالاتر از ۵۰٪ است.", "ظرفیت، قراردادها و ramp-up فروش را مستند کنید.", "MarketDemand08", "Q48"));
  if (market.demandBehavior.priceSensitivity === "بالا" || market.demandBehavior.priceSensitivity === "بسیار بالا") {
    if (market.priceGrowthRate > 0.15) warnings.push(issue("market-price-sensitivity", "warning", "market-demand", "priceGrowthRate", "حساسیت قیمت بالا و رشد قیمت فروش نیز قابل توجه است.", "سناریوی افت تقاضا در اثر افزایش قیمت را اجرا کنید.", "MarketDemand08", "Q31,Q52"));
  }
  if (market.demandBehavior.retentionRate < 0.6) warnings.push(issue("market-low-retention", "warning", "market-demand", "retentionRate", "نرخ حفظ مشتری پایین است.", "اثر churn بر فروش سال‌های بعد را بررسی کنید.", "MarketDemand08", "Q39"));
  return {
    values: { ...market, achievableSales: revenue.values.achievableSales, potentialRevenue: revenue.values.potentialRevenue },
    warnings,
    errors,
    trace: [...funnel.trace, ...revenue.trace],
  };
};

export const synchronizeMacroAssumptions = (macro: MacroAssumptions): MacroAssumptions => {
  const fxRates = {
    ...macro.fxRates,
    official: macro.officialFxRate,
    freeMarket: macro.freeMarketFxRate,
    remittance: macro.remittanceFxRate,
  };
  const baseFxRate = calculateFxRateByType({ ...macro, fxRates }, macro.baseFxRateType).values.rate * macro.fxConversionFactor;
  return {
    ...macro,
    inflationRate: macro.inflationGeneralAnnual,
    serviceGrowth: macro.servicesGrowth,
    opexGrowth: macro.assetCostGrowth,
    marketingGrowth: macro.marketingCostGrowth,
    otherGrowth: macro.otherCostGrowth,
    fxRates,
    baseFxRate,
    fxShockCap: macro.maxFxShock,
    corporateTaxRate: macro.incomeTaxRate,
    socialInsuranceRate: macro.personnelInsuranceRate,
    importDutyRate: macro.customsDutyRate,
    industrySpecificTaxRate: macro.specialIndustryTaxRate,
    discountRate: macro.defaultDiscountRate,
    opportunityCostRate: macro.opportunityCostOfCapital,
  };
};

export const synchronizeIndustryTemplate = (
  industry: IndustryTemplate,
  setup: ProjectSetup,
): IndustryTemplate => ({
  ...industry,
  mainIndustry: setup.mainIndustry,
  subIndustry: setup.subIndustry,
  projectType: setup.projectType,
  businessModel: setup.businessModel,
  activityType: setup.projectType,
  projectScale: industry.projectScale || setup.projectScale,
  targetMarket: industry.targetMarket || setup.primaryTargetMarket,
  importedCostShare: industry.costFxExposureTable.reduce(
    (sum, row) => sum + row.totalCostShare * row.fxShare,
    0,
  ),
  keyProductivityMetric: industry.productivityIndicators[0]?.title ?? "",
});

export const synchronizeMarketDemand = (
  market: MarketDemandAssumptions,
  capacityData?: { supplyLimit?: number },
): MarketDemandAssumptions => {
  const funnel = calculateMarketFunnel(market).values;
  const revenue = calculatePotentialRevenue(market, capacityData).values;
  return {
    ...market,
    unit: market.marketAnalysisUnit,
    addressableMarket: market.serviceableAvailableMarket,
    targetMarket: funnel.som,
    targetMarketSize: funnel.som,
    targetShare: funnel.targetShare,
    targetMarketShare: funnel.targetShare,
    penetrationRate: market.initialPenetrationRate,
    penetrationCap: market.maxPenetrationRate,
    demandLimit: market.salesCeiling,
    baseSalesPrice: market.unitSalesPrice,
    achievableSales: revenue.achievableSales,
    potentialRevenue: revenue.potentialRevenue,
  };
};
