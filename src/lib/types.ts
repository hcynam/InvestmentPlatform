export type ValidationSeverity = "error" | "warning" | "info";

export type CalculationMetricStatus = "ok" | "not_computable" | "invalid_input" | "multiple_solutions";

export type CalculationMetric = {
  value: number | null;
  status: CalculationMetricStatus;
  reason?: string;
};

export type ValidationIssue = {
  id: string;
  severity: ValidationSeverity;
  module: string;
  field?: string;
  message: string;
  recommendation?: string;
  impact?: string;
  sourceSheet?: string;
  sourceCell?: string;
};

export type FormulaTrace = {
  id: string;
  label: string;
  formula: string;
  inputs: { label: string; value: number | string | null; source?: string }[];
  result: number | string | null;
  sourceSheet?: string;
  sourceCell?: string;
};

export type FieldSource = {
  sourceSheet: string;
  sourceCell: string;
  sourceLabel: string;
};

export type BaseEntity = {
  id: string;
  projectId: string;
  scenarioId?: string;
  version: number;
  createdAt: string;
  updatedAt: string;
};

export type ProjectType =
  | "نرم‌افزاری / پلتفرمی"
  | "صنعتی / تولیدی"
  | "خدماتی"
  | "زیرساختی"
  | "کشاورزی"
  | "بازرگانی"
  | "معدنی"
  | "انرژی"
  | "ساختمانی"
  | "ترکیبی"
  // Legacy workbook values remain valid for existing scenarios.
  | "تولیدی"
  | "نرم‌افزار/SaaS"
  | "زیرساخت";
export type BaseCurrency = "ریال" | "تومان" | "هزار تومان" | "میلیون تومان" | "میلیارد تومان" | "دلار" | "یورو" | "درهم";
export type DisplayUnit =
  | "rial"
  | "million-rial"
  | "billion-rial"
  | "تومان"
  | "هزار تومان"
  | "میلیون تومان"
  | "میلیارد تومان"
  | "دلار"
  | "یورو"
  | "درهم";
export type FXRateType =
  | "official"
  | "freeMarket"
  | "nima"
  | "negotiated"
  | "persons"
  | "preferential"
  | "remittance"
  | "contractual"
  | "manual";

export type ProjectSetup = {
  projectName: string;
  projectCode: string;
  clientName: string;
  preparedBy: string;
  reviewedBy: string;
  approvedBy: string;
  modelPreparedDate: string;
  modelVersion: string;
  fileStatus: string;
  projectType: ProjectType;
  legalPersonality: string;
  ownershipType: string;
  registrationStatus: string;
  isKnowledgeBased: boolean;
  isFreeZone: boolean;
  isSpecialEconomicZone: boolean;
  isIndustrialTown: boolean;
  isLessDevelopedRegion: boolean;
  mainIndustry: string;
  subIndustry: string;
  businessModel: string;
  projectScale: string;
  primaryTargetMarket: string;
  province: string;
  city: string;
  baseYear: number;
  constructionStartDate: string;
  operationStartDate: string;
  operationStartDateOverrideEnabled: boolean;
  operationStartDateManual: string;
  constructionDurationMonths: number;
  analysisHorizonYears: number;
  fiscalYearEnd: string;
  calculationBasis: CalculationBasis;
  baseCurrency: BaseCurrency;
  displayUnit: DisplayUnit;
  activeScenarioId: string;
  scenarioStatus: string;
};

export type Project = BaseEntity & {
  setup: ProjectSetup;
  name: string;
  code: string;
  companyName: string;
  industry: string;
  subIndustry: string;
  projectType: ProjectType;
  province: string;
  city: string;
  legalEntityType: string;
  preparedBy: string;
  reviewedBy: string;
  approvedBy: string;
  purpose: string;
  baseYear: number;
  constructionStartDate: string;
  operationStartDate: string;
  constructionDurationMonths: number;
  rampUpMonths: number;
  modelHorizonYears: number;
  currency: string;
  displayUnit: DisplayUnit;
  activeScenarioId: string;
  scenarios: Scenario[];
};

export type Scenario = BaseEntity & {
  name: string;
  type: "base" | "optimistic" | "pessimistic" | "custom" | "fx-shock" | "inflation-shock" | "delay";
  code: string;
  priority: number;
  isActive: boolean;
  isLocked: boolean;
  isDefault: boolean;
  status: "active" | "inactive";
  description: string;
  adjustments: ScenarioAdjustments;
  assumptions: ScenarioAssumptions;
  outputs?: ScenarioOutputs;
};

export type ScenarioAdjustments = {
  inflationRateDelta: number;
  salesPriceGrowthDelta: number;
  wageGrowthDelta: number;
  energyGrowthDelta: number;
  rawMaterialGrowthDelta: number;
  fxRateMultiplier: number;
  capexMultiplier: number;
  salesVolumeMultiplier: number;
  capacityMultiplier: number;
  receivableDaysDelta: number;
  payableDaysDelta: number;
  financingRateDelta: number;
  taxRateDelta: number;
  executionDelayMonths: number;
  probability: number;
  riskWeight: number;
};

export type ScenarioAssumptions = {
  macro: MacroAssumptions;
  industry: IndustryTemplate;
  market: MarketDemandAssumptions;
  capacity: CapacityAssumptions;
  directCosts: DirectCostAssumptions;
  opex: OpexAssumptions;
  capex: CapexAssumptions;
  workingCapital: WorkingCapitalAssumptions;
  financing: FinancingAssumptions;
  construction: ConstructionAssumptions;
  tax: TaxAssumptions;
  economic: EconomicAssumptions;
  sensitivity: SensitivityAssumptions;
  monteCarlo: MonteCarloAssumptions;
};

export type CalculationBasis = "واقعی" | "اسمی" | "اسمی و واقعی";

export type FxMapping = {
  id: string;
  module: "capex" | "opex" | "exportRevenue" | "financing" | "directCosts" | "licenses";
  label: string;
  fxType: FXRateType;
  manualRate?: number;
  source?: string;
};

export type MacroAssumptions = {
  baseYear: number;
  analysisHorizon: number;
  calculationBasis: CalculationBasis;
  fiscalYearEnd: string;
  baseCurrency: BaseCurrency;
  activeScenarioId: string;
  inflationGeneralAnnual: number;
  inflationRate: number;
  salesPriceGrowth: number;
  wageGrowth: number;
  energyGrowth: number;
  rawMaterialGrowth: number;
  servicesGrowth: number;
  serviceGrowth: number;
  rentGrowth: number;
  assetCostGrowth: number;
  opexGrowth: number;
  marketingCostGrowth: number;
  marketingGrowth: number;
  otherCostGrowth: number;
  otherGrowth: number;
  officialFxRate: number;
  freeMarketFxRate: number;
  remittanceFxRate: number;
  baseFxRateType: FXRateType;
  baseFxRate: number;
  fxConversionFactor: number;
  fxRates: Record<FXRateType, number>;
  fxGrowthRate: number;
  fxVolatility: number;
  maxFxShock: number;
  fxShockCap: number;
  fxShockPeriod: number;
  fxRateSource: string;
  incomeTaxRate: number;
  corporateTaxRate: number;
  personnelInsuranceRate: number;
  socialInsuranceRate: number;
  vatRate: number;
  customsDutyRate: number;
  importDutyRate: number;
  specialIndustryTaxRate: number;
  industrySpecificTaxRate: number;
  taxExemptionType: "ندارد" | "دارد" | "نرخ ترجیحی" | "نرخ صفر";
  taxExemptionYears: number;
  taxPenaltyRate: number;
  insurancePenaltyRate: number;
  regulationSource: string;
  defaultDiscountRate: number;
  discountRate: number;
  costOfCapital: number;
  opportunityCostOfCapital: number;
  opportunityCostRate: number;
  countryRiskPremium: number;
  industryRiskPremium: number;
  projectRiskPremium: number;
  minimumSafetyMargin: number;
  minimumAcceptableReturn: number;
  allowedRiskLevel: "محافظه‌کارانه" | "متعادل" | "تهاجمی" | "سفارشی";
  analyticalNotes: string;
  terminalGrowthRate: number;
  reinvestmentRate: number;
  financeRate: number;
  capexFxRateType: FXRateType;
  directCostFxRateType: FXRateType;
  opexFxRateType: FXRateType;
  exportRevenueFxRateType: FXRateType;
  financingFxRateType: FXRateType;
  licenseFxRateType: FXRateType;
  fxMappings: FxMapping[];
};

export type ProductivityIndicator = {
  id: string;
  title: string;
  value: number;
  unit: string;
  description: string;
};

export type CostFxExposureRow = {
  id: string;
  costGroup: string;
  totalCostShare: number;
  fxShare: number;
  fxType: FXRateType;
  manualRate?: number;
  description: string;
};

export type IndustryRisk = {
  id: string;
  title: string;
  level: "پایین" | "متوسط" | "بالا" | "بحرانی";
  probability: number;
  impact: number;
  mitigation: string;
  modelEffect: string;
};

export type CostStructureSuggestion = {
  suggestedMainCostType: string;
  suggestedDominantVariableCost: string;
  suggestedDominantFixedCost: string;
  suggestedWorkingCapitalSensitivity: "پایین" | "متوسط" | "بالا" | "بسیار بالا";
  confidence: number;
  explanation: string;
};

export type IndustryTemplate = {
  mainIndustry: string;
  subIndustry: string;
  projectType: ProjectType;
  businessModel: string;
  activityType: string;
  projectScale: string;
  targetMarket: string;
  capitalIntensity: string;
  laborIntensity: string;
  nominalCapacity: number;
  effectiveCapacity: number;
  productUnit: string;
  customProductUnit: string;
  utilizationRate: number;
  wasteRate: number;
  returnRate: number;
  cycleTime: number;
  cycleTimeUnit: string;
  allowedDowntime: number;
  downtimeUnit: string;
  seasonalityFactor: number;
  bottleneckPoint: string;
  capacityGrowthRate: number;
  firstYearUtilization: number;
  stableUtilization: number;
  efficiency: number;
  productivityIndicators: ProductivityIndicator[];
  mainRevenueType: string;
  sideRevenueEnabled: boolean;
  sideRevenueDescription: string;
  pricingModel: string;
  mainCostType: string;
  dominantVariableCost: string;
  dominantFixedCost: string;
  systemSuggestedCostStructure: CostStructureSuggestion;
  revenueFxShare: number;
  costFxExposureTable: CostFxExposureRow[];
  receivablesDays: number;
  payablesDays: number;
  workingCapitalSensitivity: "پایین" | "متوسط" | "بالا" | "بسیار بالا";
  risks: IndustryRisk[];
  supplyRisk: string;
  importedCostShare: number;
  governmentTariffDependence: number;
  fxRisk: string;
  permitRisk: string;
  salesRisk: string;
  financingRisk: string;
  executionRisk: string;
  specialPermitRequired: boolean;
  specialPermits: string;
  mandatoryStandardRequired: boolean;
  mandatoryStandards: string;
  priceSensitivity: string;
  fxSensitivity: string;
  keyProductivityMetric: string;
  notes: string;
};

export type DemandBehavior = {
  priceSensitivity: "پایین" | "متوسط" | "بالا" | "بسیار بالا";
  qualitySensitivity: "پایین" | "متوسط" | "بالا" | "بسیار بالا";
  deliverySensitivity: "پایین" | "متوسط" | "بالا" | "بسیار بالا";
  brandSensitivity: "پایین" | "متوسط" | "بالا" | "بسیار بالا";
  permitSensitivity: "پایین" | "متوسط" | "بالا" | "بسیار بالا";
  seasonalityEnabled: boolean;
  seasonalityFactor: number;
  seasonalityDescription: string;
  purchasePattern: string;
  customerGrowthRate: number;
  retentionRate: number;
  conversionRate: number;
};

export type MarketDemandAssumptions = {
  mainMarket: string;
  marketSegment: string;
  targetCustomer: string;
  targetRegion: string;
  salesChannel: string;
  marketAnalysisUnit: string;
  unit: string;
  totalMarketSize: number;
  serviceableAvailableMarket: number;
  addressableMarket: number;
  targetMarketSize: number;
  targetMarket: number;
  targetShare: number;
  targetMarketShare: number;
  marketGrowthRate: number;
  initialPenetrationRate: number;
  penetrationRate: number;
  maxPenetrationRate: number;
  penetrationCap: number;
  marketAbsorptionCapacity: number;
  demandLimit: number;
  hasSupplyConstraint: boolean;
  supplyConstraintValue: number;
  demandBehavior: DemandBehavior;
  potentialSalesYear1: number;
  potentialSalesYear2: number | null;
  potentialSalesYear3: number | null;
  salesGrowthRate: number;
  marketAchievementFactor: number;
  salesCeiling: number;
  achievableSalesOverrideEnabled: boolean;
  achievableSalesOverride: number | null;
  achievableSales: number;
  unitSalesPrice: number;
  potentialRevenue: number;
  baseSalesPrice: number;
  priceGrowthRate: number;
  domesticShare: number;
  exportShare: number;
  customerConcentrationRisk: string;
  marketRiskScore: number;
  finalNotes: string;
};

export type RampUpMonth = {
  month: number;
  capacityPercent: number;
};

export type MonthlyProductionDistribution = {
  month: number;
  label: string;
  share: number;
};

export type CapacityProductionOutputs = {
  effectiveAnnualHours: number;
  nominalEffectiveCapacity: number;
  availableCapacity: number;
  rawMaterialConstrainedCapacity: number | null;
  energyConstrainedCapacity: number | null;
  grossAnnualProduction: number;
  netSellableProduction: number;
  capacityUtilizationPercent: number;
  remainingIdleCapacity: number;
  monthlyNetProduction: number[];
  bindingConstraint: string;
};

export type CapacityAssumptions = {
  unit: string;
  nominalCapacity: number;
  productionLines: number;
  workingDaysPerYear: number;
  shiftsPerDay: number;
  effectiveHoursPerShift: number;
  plannedDowntimeRate: number;
  unplannedDowntimeRate: number;
  firstYearUtilizationRate: number;
  secondYearUtilizationRate: number;
  stableYearUtilizationRate: number;
  utilizationYear1: number;
  utilizationYear2: number;
  utilizationStable: number;
  productionEfficiency: number;
  wasteRate: number;
  yieldRate: number;
  bottleneckHourlyCapacity: number;
  bottleneckCapacityPerHour: number;
  energyConstraintType: "ندارد" | "برق" | "گاز" | "آب" | "سوخت" | "چندگانه" | "نامشخص / نیازمند بررسی";
  energyAvailableQuantity: number;
  energyLimit: number;
  energyConsumptionPerUnit: number;
  energyPerUnit: number;
  hasRawMaterialConstraint: boolean;
  constrainedRawMaterialName: string;
  rawMaterialAvailableQuantity: number;
  rawMaterialQuantityUnit: string;
  rawMaterialAvailabilityPeriod: "روزانه" | "ماهانه" | "سالانه";
  rawMaterialToProductConversionFactor: number;
  materialLimit: number;
  trialProductionStartDate: string;
  rampUpDurationMonths: number;
  rampUpMonths: number;
  monthlyRampUpCapacityPercentages: RampUpMonth[];
  seasonalityMode: "یکنواخت" | "فصلی ملایم" | "فصلی شدید" | "سفارشی";
  monthlyProductionDistribution: MonthlyProductionDistribution[];
  outputs?: CapacityProductionOutputs;
};

export type DirectCostMethod = "unitCost";

export type DirectCostItem = {
  id: string;
  name: string;
  rialUnitCost: number;
  fxUnitCost: number;
  costType: "ریالی" | "ارزی" | "ترکیبی";
  fxShare: number;
  fxRateType: FXRateType;
  manualFxRate?: number;
  behavior: "متغیر" | "ثابت";
  description: string;
};

export type DirectCostOutputs = {
  baseYearUnitDirectCost: number;
  totalDirectProductionCostBaseYear: number;
  directRialCosts: number;
  directFxCosts: number;
  variableDirectCostShare: number;
  fixedDirectCostShare: number;
  cogs: number;
};

export type DirectCostAssumptions = {
  method: DirectCostMethod;
  cogsPercent: number;
  mainRawMaterialName: string;
  isMainRawMaterialFx: boolean;
  mainRawMaterialFxShare: number;
  mainRawMaterialRialPrice: number;
  mainRawMaterialFxPrice: number;
  mainRawMaterialFxRateType: FXRateType;
  mainRawMaterialManualFxRate?: number;
  rawMaterialFxUnitCost: number;
  rawMaterialRialUnitCost: number;
  rawMaterialFxShare: number;
  secondaryMaterialsCost: number;
  secondaryMaterialsUnitCost: number;
  packagingUnitCost: number;
  directEnergyCost: number;
  energyUnitCost: number;
  directLaborCost: number;
  directLaborUnitCost: number;
  avoidableWasteCost: number;
  avoidableWasteRate: number;
  directTransportCost: number;
  logisticsUnitCost: number;
  salesCommissionCost: number;
  salesCommissionRate: number;
  importDutiesAndClearanceCost: number;
  customsUnitCost: number;
  otherDirectProductionCosts: number;
  otherUnitCost: number;
  rialRawMaterialGrowthRate: number;
  rawMaterialRialGrowth: number;
  fxRawMaterialGrowthRate: number;
  rawMaterialFxGrowth: number;
  directLaborGrowthFactor: number;
  wageGrowth: number;
  energyTariffGrowthRate: number;
  energyGrowth: number;
  economiesOfScaleSavingPercent: number;
  scaleSavingRate: number;
  items: DirectCostItem[];
  outputs?: DirectCostOutputs;
};

export type OpexCostDriver =
  | "ثابت"
  | "وابسته به درآمد"
  | "وابسته به تولید"
  | "وابسته به تعداد پرسنل"
  | "وابسته به تورم عمومی"
  | "وابسته به نرخ ارز"
  | "وابسته به قرارداد"
  | "دستی";

export type OpexItem = {
  id: string;
  name: string;
  group: "اداری و عمومی" | "فروش و بازاریابی" | "مالی و بانکی" | "منابع انسانی" | "فناوری و زیرساخت" | "سربار تولید" | "غیرنقدی" | "سایر";
  baseYearAmount: number;
  cashOrNonCash: "نقدی" | "غیرنقدی";
  isFx: boolean;
  fxShare: number;
  fxRateType: FXRateType;
  manualFxRate?: number;
  growthRate: number;
  costDriver: OpexCostDriver;
  overheadAllocationPercent: number;
  notes: string;
};

export type OpexOutputs = {
  totalAnnualOpex: number;
  productionOverhead: number;
  gnaExpenses: number;
  salesMarketingExpenses: number;
  opexToRevenueRatio: number;
  cashOpexExcludingDepreciation: number;
  fxOpex: number;
};

export type OpexAssumptions = {
  items: OpexItem[];
  sharedCostAllocationPercent: number;
  allocationToProductionRate: number;
  salaries: number;
  employerInsuranceRate: number;
  bonuses: number;
  rent: number;
  buildingMaintenance: number;
  utilities: number;
  it: number;
  marketing: number;
  selling: number;
  travel: number;
  logistics: number;
  legalAudit: number;
  bankingFees: number;
  insurance: number;
  training: number;
  hospitality: number;
  nonProductionDepreciation: number;
  otherTaxes: number;
  otherAdmin: number;
  growthRate: number;
  scenarioAdjustmentRate: number;
  fxShare: number;
  outputs?: OpexOutputs;
};

export type CapexRiskLevel = "پایین" | "متوسط" | "بالا" | "بحرانی";

export type CapexItemOutputs = {
  appliedFxRate: number;
  rialPortion: number;
  fxPortionInBaseCurrency: number;
  unitPriceBase: number;
  finalAmount: number;
  adjustedAmount: number;
  delayMonthlyCostTotal: number;
  delayPriceEscalationCost: number;
  totalDelayCost: number;
  permitCost: number;
  contingencyCost: number;
  finalItemCost: number;
  annualDepreciation: number;
  accountingDepreciationAnnual: number;
  accountingDepreciationFirstYear: number;
  accountingAccumulatedDepreciation: number;
  accountingBookValueEnd: number;
  taxDepreciationAnnual: number;
  taxDepreciationFirstYear: number;
  taxAccumulatedDepreciation: number;
  taxBookValueEnd: number;
  bookValueEnd: number;
  importedShare: number;
  domesticShare: number;
  status: string[];
};

export type CapexItem = {
  id: string;
  code: string;
  name: string;
  assetClass: string;
  itemType: string;
  depreciable: boolean;
  unit: string;
  description: string;
  source: string;
  quantity: number;
  rialUnitPrice: number;
  fxUnitPrice: number;
  rialPriceShare: number;
  fxPriceShare: number;
  fxRateType: FXRateType;
  manualFxRate?: number;
  unitPrice: number;
  currency: string;
  fxRate: number;
  expectedInflationIncreasePercent: number;
  priceIncreaseRate: number;
  startDate: string;
  endDate: string;
  startYear: number;
  endYear: number;
  purchaseMonths: number;
  installationMonths: number;
  operationPeriodMonths: number;
  constructionPhase: string;
  delayEnabled: boolean;
  prepaymentRate: number;
  deliveryPaymentRate: number;
  postInstallPaymentRate: number;
  annualDelayEscalationRate: number;
  delayMonths: number;
  monthlyDelayCost: number;
  fxRisk: CapexRiskLevel;
  supplyDelayRisk: CapexRiskLevel;
  clearanceRisk: CapexRiskLevel;
  priceIncreaseRisk: CapexRiskLevel;
  permitRisk: CapexRiskLevel;
  contingencyRate: number;
  installationCost: number;
  transportInsuranceCost: number;
  trainingCost: number;
  preOperationCost: number;
  indirectProjectCost: number;
  permitCost: number;
  permitCostRate: number;
  usefulLifeYears: number;
  salvageValue: number;
  salvageValueRate: number;
  depreciationMethod: "خطی" | "نزولی" | "بر اساس تولید" | "یکجا" | "سفارشی" | "تولیدی";
  depreciationStartDate: string;
  depreciationStartYear: number;
  taxEligible: boolean;
  accountingEligible: boolean;
  accountingDepreciable: boolean;
  accountingUsefulLifeYears: number;
  accountingSalvageValue: number;
  accountingSalvageValueRate: number;
  accountingDepreciationMethod: string;
  accountingDepreciationStartDate: string;
  accountingDepreciationStartYear: number;
  taxDepreciable: boolean;
  taxUsefulLifeYears: number;
  taxSalvageValue: number;
  taxSalvageValueRate: number;
  taxDepreciationMethod: string;
  taxDepreciationStartDate: string;
  taxDepreciationStartYear: number;
  outputs?: CapexItemOutputs;
};

export type CapexAnnualSchedule = {
  year: number;
  calendarYear: number;
  plannedCapex: number;
  adjustedCapex: number;
  advancePayment: number;
  deliveryPayment: number;
  postInstallationPayment: number;
  delayCost: number;
  installationCost: number;
  preOperationCost: number;
  contingencyCost: number;
  finalAnnualCapex: number;
  depreciation: number;
  netFixedAssets: number;
};

export type CapexSummary = {
  totalFixedInvestment: number;
  totalFxInvestment: number;
  totalRialInvestment: number;
  totalDelayCost: number;
  totalPreOperationCost: number;
  totalContingencyCost: number;
  importedAssetShare: number;
  domesticAssetShare: number;
  totalAnnualDepreciation: number;
  incompleteItemCount: number;
  highRiskItemCount: number;
  largestItemName: string;
  largestItemShare: number;
};

export type CapexAssumptions = {
  items: CapexItem[];
  annualSchedule: CapexAnnualSchedule[];
  summary: CapexSummary;
};

export type WorkingCapitalAssumptions = {
  rawMaterialDays: number;
  inventoryDays: number;
  receivableDays: number;
  payableDays: number;
  supplierPrepaymentDays: number;
  minimumCashDays: number;
  accruedExpenseDays: number;
  otherCurrentLiabilitiesPercentOfRevenue: number;
  releaseInFinalYear: boolean;
};

export type LegacyRepaymentMethod =
  | "قسط ثابت"
  | "اصل مساوی"
  | "سود فقط سپس اصل در سررسید"
  | "یکجا در سررسید";

export type FinancingType =
  | "simpleBankLoan"
  | "qardAlHasan"
  | "murabaha"
  | "installmentSale"
  | "juala"
  | "custom";

export type GraceCostBehavior =
  | "paidDuringGrace"
  | "capitalizedToPrincipal"
  | "capitalizedDuringConstruction"
  | "noCostDuringGrace";

export type PaymentFrequency =
  | "monthly"
  | "quarterly"
  | "semiAnnual"
  | "annual";

export type RepaymentMethod =
  | LegacyRepaymentMethod
  | "fixedInstallment"
  | "equalPrincipal"
  | "stepUp"
  | "stepDown"
  | "interestOnlyThenFixed"
  | "interestOnlyThenEqualPrincipal"
  | "bullet"
  | "balloon"
  | "deferredLumpSum"
  | "equalMurabahaInstallments"
  | "unequalInstallments"
  | "milestoneBased"
  | "custom";

export type DrawdownModel =
  | "manual"
  | "equalYears"
  | "capexPercent"
  | "physicalProgress"
  | "sCurve"
  | "frontLoaded"
  | "backLoaded"
  | "milestone"
  | "lumpSumAtStart"
  | "lumpSumAtEnd"
  | "custom";

export type InterestDuringGraceBehavior =
  | "پرداخت بهره در تنفس"
  | "انباشت بهره در اصل بدهی"
  | "عدم محاسبه بهره در تنفس";

export type FinancingAssumptions = {
  equity: number;
  shortTermDebt: number;
  longTermDebt: number;
  gracePeriodYears: number;
  interestRate: number;
  feeRate: number;
  repaymentMethod: RepaymentMethod;
  repaymentYears: number;
  collateral: string;
  targetDebtToEquity: number;
  dividendPolicy: string;
  lenderCovenants: string;
  loanType: "وام بانکی ساده" | "قرض‌الحسنه" | "مرابحه" | "فروش اقساطی" | "جعاله";
  interestDuringGraceBehavior: InterestDuringGraceBehavior;
  drawdown: Record<number, number>;
  preferredShareAmount: number;
  preferredDividendRate: number;
  ordinaryDividendPayout: number;
  targetDscr: number;
  instruments?: FinancingInstrument[];
  drawdownRows?: DrawdownRow[];
  selectedDrawdownYears?: number[];
  drawdownModel?: DrawdownModel;
};

export type FinancingInstrument = {
  id: string;
  title: string;
  type: FinancingType;
  active: boolean;
  amount: number;
  annualRate: number;
  feeRate?: number;
  graceEnabled: boolean;
  graceMonths: number;
  graceCostBehavior: GraceCostBehavior;
  repaymentTermMonths: number;
  paymentFrequency: PaymentFrequency;
  repaymentMethod: RepaymentMethod;
  balloonPercent?: number;
  stepRate?: number;
  upfrontPaymentPercent?: number;
  blockedDepositPercent?: number;
  blockedDepositOpportunityRate?: number;
  guaranteeFeeRate?: number;
  collateralRequired: boolean;
  collateralItems: string[];
  collateralText?: string;
  collateralValue?: number;
  guaranteeRequired: boolean;
  guaranteeTypes: string[];
  guaranteeValue?: number;
  dividendPolicy: string;
  covenantsText?: string;
  covenantMinimumDscr?: number;
};

export type DrawdownRow = {
  year: number;
  instrumentId: string;
  amount: number;
  percentOfInstrument?: number;
};

export type DebtScheduleRow = {
  year: number;
  instrumentId?: string;
  instrumentTitle?: string;
  instrumentType?: FinancingType;
  drawdown: number;
  openingDebt: number;
  financingCost: number;
  cashFinancingCost: number;
  financingFees: number;
  guaranteeFee: number;
  blockedDepositOpportunityCost: number;
  capitalizedCost: number;
  principalRepayment: number;
  totalDebtService: number;
  closingDebt: number;
  cfads: number;
  dscr: number | null;
  status: string;
};

export type FinancingKpis = {
  totalFunding: number;
  shareholderEquity: number;
  totalDebt: number;
  debtToEquity: number | null;
  debtShareOfFunding: number | null;
  minimumDscr: number | null;
  averageDscr: number | null;
  averageAnnualFinancingCost: number;
  totalProjectFinancingCost: number;
  repaymentBaseDebt: number;
  baseFixedAnnualInstallment: number;
  maxRemainingDebt: number;
  peakDebtYear: number;
  peakDebtServiceYear: number;
  totalCollateralValue: number;
  collateralCoverage: number | null;
  loanToCollateral: number | null;
  totalGuaranteeValue: number;
};

export type ConstructionAssumptions = {
  bufferMonths: number;
  monthlyDevelopmentPayroll: number;
  monthlyContractorCost: number;
  monthlyInfrastructureCost: number;
  monthlyTestingCost: number;
  deploymentTrainingCost: number;
  minimumCashReserve: number;
  monthlyAdjustmentEnabled: boolean;
  equityTimingMethod: string;
  debtTimingMethod: string;
  creditLineEnabled: boolean;
  creditLineRate: number;
  delayScenarioEnabled: boolean;
  analysisMonths?: number;
  monthlyInflationRate?: number;
  monthlyFxGrowthRate?: number;
  delayMonthlyCost?: number;
  creditLineCap?: number;
  creditLineFeeRate?: number;
  delayAdjustmentRate?: number;
  allowedDelayMonths?: number;
  actualDelayMonths?: number;
  capexMilestones?: CapexPaymentMilestone[];
  costItems?: ConstructionCostItem[];
};

export type MonthNumber = number;

export type CostDistributionMode =
  | "repeatMonthly"
  | "fullAmountEachSelectedMonth"
  | "equalSplitAcrossSelectedMonths"
  | "manualPercent";

export type ConstructionCostItem = {
  id: string;
  title: string;
  baseAmount: number;
  active: boolean;
  isMonthly: boolean;
  selectedMonths: MonthNumber[];
  inflationIndexed: boolean;
  fxIndexed: boolean;
  fxShare: number;
  rialShare: number;
  distributionMode: CostDistributionMode;
  manualMonthPercents?: Record<number, number>;
  description?: string;
  isCustom?: boolean;
};

export type CapexPaymentMilestone = {
  id: "prepayment" | "delivery" | "postInstallation";
  title: string;
  percent: number;
  paymentMonth?: MonthNumber;
  active: boolean;
};

export type ConstructionControlStatus = "OK" | "هشدار" | "خطا";

export type ConstructionControlCheck = {
  id: string;
  title: string;
  status: ConstructionControlStatus;
  message: string;
};

export type ConstructionCashFlowKpis = {
  totalCashOutflow: number;
  totalAdjustedCapex: number;
  totalMonthlyCosts: number;
  totalDelayCost: number;
  totalShareholderInjection: number;
  totalNonEquityFundingDrawdown: number;
  totalCreditLineDraw: number;
  totalCreditLineFinanceCost: number;
  maxCashDeficit: number;
  peakDeficitMonth: number | null;
  cashCrunchMonths: number;
  minimumObservedCash: number;
  maxPositiveCash: number;
  biggestMonthlyGap: number;
  resourceCoveragePercent: number;
  finalStatus: string;
};

export type TaxIncentiveType =
  | "بدون معافیت"
  | "دانش‌بنیان"
  | "منطقه آزاد"
  | "منطقه کمتر توسعه‌یافته"
  | "نرخ ترجیحی"
  | "اعتبار مالیاتی سرمایه‌گذاری"
  | "معافیت درصدی"
  | "سفارشی";

export type TaxAssumptions = {
  assetClass: string;
  accountingUsefulLifeYears: number;
  taxUsefulLifeYears: number;
  accountingMethod: "خطی" | "نزولی" | "تولیدی";
  taxMethod: "خطی" | "نزولی" | "تولیدی";
  exemptionType: string;
  exemptionRate: number;
  exemptionYears: number;
  exemptionStartYear: number;
  preferredTaxRate: number;
  investmentTaxCredit: number;
  incentiveType: TaxIncentiveType;
  normalTaxRateOverride: number | null;
  approvedKnowledgeRevenueShare: number;
  knowledgeBasedExemptionYears: number;
  knowledgeBasedStartYear: number;
  freeZoneInsideActivityShare: number;
  freeZonePermitDate: string;
  freeZonePermitValid: boolean;
  freeZoneExemptionYears: number;
  lessDevelopedEligibleIncomeShare: number;
  lessDevelopedZeroRateYears: number;
  lessDevelopedStartYear: number;
  lessDevelopedActivityType: string;
  preferentialTaxRate: number;
  preferentialYears: number;
  preferentialIncomeShare: number;
  taxCreditAmount: number;
  taxCreditPercentOfCapex: number;
  annualTaxCreditCap: number;
  taxCreditCarryForward: boolean;
  percentExemptionRate: number;
  percentExemptionYears: number;
  percentExemptionIncomeShare: number;
  customEligibleIncomeShare: number;
  customEffectiveTaxRate: number;
  customIncentiveYears: number;
  customTaxCreditAmount: number;
  isKnowledgeBased: boolean;
  isFreeZone: boolean;
  isLessDevelopedRegion: boolean;
  isIndustrialTown: boolean;
};

export type EconomicAssumptions = {
  economicDiscountRate: number;
  standardConversionFactor: number;
  unskilledLaborShadowFactor: number;
  skilledLaborShadowFactor: number;
  shadowExchangeRateFactor: number;
  energyShadowFactor: number;
  waterShadowFactor: number;
  capitalServiceChargeRate: number;
  directEmploymentBenefit: number;
  indirectEmploymentBenefit: number;
  pollutionReductionBenefit: number;
  environmentalCost: number;
  infrastructurePressureCost: number;
  technologyTransferBenefit: number;
  importSubstitutionBenefit: number;
  regionalDevelopmentBenefit: number;
};

export type SensitivityAssumptions = {
  selectedMetric: "NPV" | "IRR" | "Payback" | "DSCR";
  variable1: string;
  variable2: string;
  shockLow: number;
  shockHigh: number;
  steps: number;
  variables: SensitivityVariable[];
};

export type SensitivityVariable = {
  id: string;
  parameter: string;
  label: string;
  low: number;
  high: number;
  steps: number;
  changeType: "percent" | "absolute";
};

export type DistributionType = "مثلثی" | "یکنواخت" | "نرمال";

export type MonteCarloVariable = {
  name: string;
  low: number;
  mid: number;
  high: number;
  distribution: DistributionType;
  enabled: boolean;
  description: string;
};

export type MonteCarloAssumptions = {
  enabled: boolean;
  iterations: number;
  seed: number;
  liquidityThreshold: number;
  npvThreshold: number;
  variables: MonteCarloVariable[];
};

export type YearlyRow = {
  year: number;
  calendarYear: number;
  salesVolume: number;
  salesPrice: number;
  revenue: number;
  cogs: number;
  grossProfit: number;
  grossMargin: number;
  opex: number;
  ebitda: number;
  depreciation: number;
  ebit: number;
  interest: number;
  ebt: number;
  tax: number;
  netProfit: number;
  dividends: number;
  retainedEarnings: number;
  capex: number;
  changeInWorkingCapital: number;
  cfo: number;
  cfi: number;
  cff: number;
  netCashFlow: number;
  cumulativeCashFlow: number;
  cash: number;
  operatingCurrentAssets: number;
  receivables: number;
  inventory: number;
  prepayments: number;
  minimumCash: number;
  grossFixedAssets: number;
  accumulatedDepreciation: number;
  netFixedAssets: number;
  operatingCurrentLiabilities: number;
  payables: number;
  accruedExpenses: number;
  otherCurrentLiabilities: number;
  shortTermFunding: number;
  debtDrawdown: number;
  principalRepayment: number;
  equityInjection: number;
  debt: number;
  equity: number;
  paidInCapital: number;
  totalAssets: number;
  totalLiabilitiesAndEquity: number;
  balanceCheck: number;
  balanceStatus: "balanced" | "out-of-balance";
  balanceDiagnostic: string | null;
  dscr: number | null;
  currentRatio: number | null;
  quickRatio: number | null;
  workingCapitalTurnover: number | null;
  interestCoverage: number | null;
  dio: number | null;
  dso: number | null;
  dpo: number | null;
  cashConversionCycle: number | null;
  fcff: number;
  fcfe: number;
};

export type LoanScheduleRow = {
  year: number;
  openingBalance: number;
  drawdown: number;
  interest: number;
  financingCost: number;
  cashFinancingCost: number;
  financingFees: number;
  guaranteeFee: number;
  blockedDepositOpportunityCost: number;
  capitalizedCost: number;
  principalRepayment: number;
  debtService: number;
  totalDebtService: number;
  endingBalance: number;
  closingDebt: number;
  cfads: number;
  dscr: number | null;
  status: string;
  byInstrument?: Record<string, DebtScheduleRow>;
};

export type MonthlyConstructionRow = {
  monthNumber: number;
  date: string;
  status: string;
  monthDate?: string;
  calendarYear?: number;
  modelYear?: number;
  developmentMonth?: number | null;
  monthStatus?: "development" | "delivery" | "installationAcceptance" | "bufferSettlement" | "delay";
  plannedCapex: number;
  inflationFactor: number;
  fxFactor: number;
  adjustedCapex: number;
  costByItem?: Record<string, number>;
  customCosts?: number;
  developmentPayroll: number;
  contractorCost: number;
  infrastructureCost: number;
  testingCost: number;
  deploymentCost: number;
  delayCost: number;
  otherCashOutflow: number;
  totalCashOutflow: number;
  shareholderInjection?: number;
  nonEquityFundingDrawdown?: number;
  creditLineDraw?: number;
  equityInjection: number;
  debtDrawdown: number;
  overdraft: number;
  totalCashInflow: number;
  netMonthlyCashFlow?: number;
  cumulativeCashBalance?: number;
  monthlySurplusDeficit: number;
  endingCash: number;
  minimumCashRequired: number;
  cashShortfall?: number;
  cashCrunchFlag?: "OK" | "Cash Crunch" | "Cash Crunch پوشش با خط اعتباری";
  creditLineBalance?: number;
  creditLineFinanceCost?: number;
  monthNote?: string;
  cashCrunch: boolean;
};

export type SensitivityPoint = {
  variable: string;
  shock: number;
  metric: number | null;
};

export type SensitivityMatrixCell = {
  rowShock: number;
  colShock: number;
  value: number | null;
};

export type MonteCarloResult = {
  p5: number;
  p50: number;
  p95: number;
  probabilityNpvPositive: number;
  probabilityDscrBelowThreshold: number;
  var95: number;
  cvar95: number;
  histogram: { bin: number; count: number }[];
  rows: { iteration: number; npv: number; irr: number | null; minDscr: number | null; liquidityGap: number }[];
  diagnostics: string[];
};

export type ScenarioOutputs = {
  generatedAt: string;
  years: number[];
  capacity: {
    effectiveAnnualHours: number;
    effectiveNominalCapacity: number;
    rows: { year: number; utilization: number; productionVolume: number; idleCapacity: number }[];
  };
  revenue: { rows: { year: number; demand: number; salesVolume: number; salesPrice: number; revenue: number }[] };
  directCosts: { rows: { year: number; unitCost: number; totalCost: number; variableShare: number; fxShare: number }[] };
  opex: { rows: { year: number; totalOpex: number; cashOpex: number; fxOpex: number }[] };
  capex: {
    totalCapex: number;
    rialCapex: number;
    fxCapex: number;
    delayCost: number;
    contingency: number;
    annual: { year: number; cashCapex: number; capitalizedCapex: number; depreciation: number; netFixedAssets: number }[];
  };
  workingCapital: {
    initialWorkingCapital: number;
    releaseFinalYear: number;
    rows: {
      year: number;
      dailyRawMaterialCost: number;
      dailyProductionCost: number;
      dailySales: number;
      dailyOpex: number;
      rawMaterialInventory: number;
      finishedGoodsInventory: number;
      receivables: number;
      inventory: number;
      prepayments: number;
      minimumCash: number;
      payables: number;
      accruedExpenses: number;
      otherCurrentLiabilities: number;
      currentAssets: number;
      currentLiabilities: number;
      workingCapital: number;
      changeInWorkingCapital: number;
    }[];
  };
  financing: {
    schedule: LoanScheduleRow[];
    annualSchedule: LoanScheduleRow[];
    instrumentSchedules: DebtScheduleRow[];
    averageDscr: number | null;
    minimumDscr: number | null;
    totalDebtService: number;
    totalInterest: number;
    remainingDebt: number;
    remainingDebtByYear: Record<number, number>;
    remainingDebtByInstrument: Record<string, number>;
    principalByInstrument: Record<string, number>;
    costByInstrument: Record<string, number>;
    kpis: FinancingKpis;
    warnings: string[];
  };
  construction: {
    rows: MonthlyConstructionRow[];
    maxCashDeficit: number;
    creditLineRequired: number;
    cashCrunchMonths: number;
    status: string;
    kpis?: ConstructionCashFlowKpis;
    controls?: ConstructionControlCheck[];
    warnings?: string[];
  };
  tax: {
    rows: {
      year: number;
      accountingDepreciation: number;
      taxDepreciation: number;
      depreciationAdjustment: number;
      accountingEbt: number;
      taxableProfitBeforeLoss: number;
      openingTaxLoss: number;
      lossUsed: number;
      taxableIncome: number;
      finalTaxableIncome: number;
      closingTaxLoss: number;
      lossCarryForward: number;
      normalTaxRate: number;
      baseTax: number;
      incentiveEffect: number;
      taxAfterIncentives: number;
      taxCreditUsed: number;
      taxCreditCarryForward: number;
      tax: number;
      finalTax: number;
      effectiveTaxRate: number;
      incentiveType: TaxIncentiveType;
    }[];
    kpis: {
      accountingDepreciationYear1: number;
      taxDepreciationYear1: number;
      depreciationAdjustmentYear1: number;
      finalTaxableIncomeYear1: number;
      closingTaxLossYear1: number;
      finalTaxYear1: number;
      effectiveTaxRateYear1: number;
      incentiveEffectYear1: number;
    };
  };
  statements: { rows: YearlyRow[] };
  valuation: {
    fcffByYear: number[];
    fcfeByYear: number[];
    nominalFcffByYear: number[];
    realFcffByYear: number[];
    nominalFcfeByYear: number[];
    realFcfeByYear: number[];
    discountedFcffByYear: number[];
    discountedFcfeByYear: number[];
    discountedNominalFcffByYear: number[];
    discountedRealFcffByYear: number[];
    discountedNominalFcfeByYear: number[];
    discountedRealFcfeByYear: number[];
    cumulativeFcff: number[];
    cumulativeFcfe: number[];
    cumulativeNominalFcff: number[];
    cumulativeRealFcff: number[];
    cumulativeNominalFcfe: number[];
    cumulativeRealFcfe: number[];
    nominalDiscountRate: number;
    realDiscountRate: number | null;
    appliedDiscountRate: number;
    inflationRate: number;
    calculationBasis: MacroAssumptions["calculationBasis"];
    terminalValue: number;
    discountedTerminalValue: number;
    terminalValueFcfe: number;
    discountedTerminalValueFcfe: number;
    nominalFcffNpv: number;
    realFcffNpv: number | null;
    nominalFcfeNpv: number;
    realFcfeNpv: number | null;
    fcffNpv: number;
    fcfeNpv: number;
    fcffIrr: number | null;
    fcfeIrr: number | null;
    fcffMirr: number | null;
    fcfeMirr: number | null;
    fcffPayback: number | null;
    fcfePayback: number | null;
    npv: number;
    irr: number | null;
    mirr: number | null;
    payback: number | null;
    discountedPayback: number | null;
    diagnostics: string[];
    metrics: {
      npv: CalculationMetric;
      irr: CalculationMetric;
      mirr: CalculationMetric;
      payback: CalculationMetric;
      discountedPayback: CalculationMetric;
      fcffNominalNpv: CalculationMetric;
      fcffRealNpv: CalculationMetric;
      fcfeNominalNpv: CalculationMetric;
      fcfeRealNpv: CalculationMetric;
      fcffIrr: CalculationMetric;
      fcfeIrr: CalculationMetric;
    };
  };
  economic: {
    encf: number;
    enpv: number;
    eirr: number | null;
    ebcr: number | null;
    valueAdded: number;
  };
  sensitivity: {
    oneWay: SensitivityPoint[];
    matrix: SensitivityMatrixCell[];
    tornado: { variable: string; low: number | null; high: number | null; range: number }[];
    breakEven: { price: number | null; volume: number | null; sales: number | null; fxRate: number | null };
  };
  monteCarlo?: MonteCarloResult;
  dashboards: {
    projectHealthScore: number;
    bankabilityScore: number;
    investmentReadinessScore: number;
    recommendation: string;
    aiReview: string[];
  };
  validations: ValidationIssue[];
  traces: FormulaTrace[];
  calculationLog: string[];
};

export type ModuleSlug =
  | "overview"
  | "setup"
  | "methodology"
  | "master-data"
  | "macro"
  | "scenarios"
  | "industry-template"
  | "market-demand"
  | "capacity-production"
  | "revenue"
  | "direct-costs"
  | "opex"
  | "capex"
  | "construction-cashflow"
  | "working-capital"
  | "financing"
  | "financial-statements"
  | "valuation"
  | "economic-analysis"
  | "sensitivity"
  | "monte-carlo"
  | "dashboard-executive"
  | "dashboard-bank"
  | "dashboard-management"
  | "report"
  | "exports"
  | "settings";
