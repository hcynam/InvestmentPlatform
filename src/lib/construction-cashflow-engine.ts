import type {
  CapexPaymentMilestone,
  ConstructionAssumptions,
  ConstructionCashFlowKpis,
  ConstructionControlCheck,
  ConstructionCostItem,
  CostDistributionMode,
  FinancingAssumptions,
  MacroAssumptions,
  MonthlyConstructionRow,
  Project,
} from "@/lib/types";

type CapexBridge = {
  totalCapex: number;
  rialCapex: number;
  fxCapex: number;
  delayCost: number;
};

type ConstructionEngineInput = {
  project: Project;
  assumptions: ConstructionAssumptions;
  macro: MacroAssumptions;
  capex: CapexBridge;
  financing: FinancingAssumptions;
};

const EPSILON = 1e-7;

const finite = (value: number | null | undefined, fallback = 0) =>
  Number.isFinite(value ?? Number.NaN) ? Number(value) : fallback;

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const sum = (values: number[]) => values.reduce((total, value) => total + finite(value), 0);

const monthNumbers = (months: number) => Array.from({ length: Math.max(0, Math.round(months)) }, (_, index) => index + 1);

export const getAnalysisMonthOptions = (developmentMonths: number) => {
  const minimum = Math.max(1, Math.round(finite(developmentMonths, 12)));
  return monthNumbers(13).map((offset) => minimum + offset - 1);
};

export const calculateBufferMonths = (analysisMonths: number, developmentMonths: number) =>
  Math.max(0, Math.round(finite(analysisMonths) - finite(developmentMonths)));

export const calculateMonthlyRateFromAnnual = (annualRate: number, mode: "compound" | "simple" = "compound") => {
  const rate = finite(annualRate);
  if (mode === "simple") return rate / 12;
  return (1 + rate) ** (1 / 12) - 1;
};

export const addMonthsToDate = (date: string, months: number) => {
  const next = new Date(`${date || "2026-01-01"}T00:00:00`);
  next.setMonth(next.getMonth() + months);
  return Number.isNaN(next.getTime()) ? "2026-01-01" : next.toISOString().slice(0, 10);
};

const safeShare = (value: number) => clamp(finite(value), 0, 1);

const normalizeShares = (fxShare: number, rialShare?: number) => {
  const fx = safeShare(fxShare);
  const rial = rialShare === undefined ? 1 - fx : safeShare(rialShare);
  const total = fx + rial;
  if (total <= EPSILON) return { fxShare: 0, rialShare: 1 };
  return { fxShare: fx / total, rialShare: rial / total };
};

export const createDefaultCapexMilestones = (developmentMonths: number, source?: {
  prepaymentRate?: number;
  deliveryPaymentRate?: number;
  postInstallPaymentRate?: number;
}): CapexPaymentMilestone[] => {
  const dev = Math.max(1, Math.round(finite(developmentMonths, 12)));
  return [
    {
      id: "prepayment",
      title: "پیش‌پرداخت",
      percent: finite(source?.prepaymentRate, 0.2),
      paymentMonth: 1,
      active: finite(source?.prepaymentRate, 0.2) > 0,
    },
    {
      id: "delivery",
      title: "تحویل",
      percent: finite(source?.deliveryPaymentRate, 0.5),
      paymentMonth: Math.max(1, Math.ceil(dev / 2)),
      active: finite(source?.deliveryPaymentRate, 0.5) > 0,
    },
    {
      id: "postInstallation",
      title: "پس از نصب/استقرار",
      percent: finite(source?.postInstallPaymentRate, 0.3),
      paymentMonth: dev,
      active: finite(source?.postInstallPaymentRate, 0.3) > 0,
    },
  ];
};

const defaultSelectedMonths = (developmentMonths: number) => monthNumbers(Math.max(1, developmentMonths));

export const createDefaultConstructionCostItems = (
  developmentMonths: number,
  assumptions: ConstructionAssumptions,
  fxShare: number,
): ConstructionCostItem[] => {
  const months = defaultSelectedMonths(developmentMonths);
  const shares = normalizeShares(fxShare);
  const shared = {
    active: true,
    isMonthly: true,
    selectedMonths: months,
    inflationIndexed: true,
    fxIndexed: false,
    fxShare: 0,
    rialShare: 1,
    distributionMode: "repeatMonthly" as CostDistributionMode,
    isCustom: false,
  };

  return [
    { id: "development-team", title: "تیم توسعه", baseAmount: finite(assumptions.monthlyDevelopmentPayroll), description: "Backend، Frontend، Data، DevOps، PM", ...shared },
    { id: "contractor", title: "پیمانکار", baseAmount: finite(assumptions.monthlyContractorCost), description: "پیمانکار توسعه و پیاده‌سازی", ...shared, fxIndexed: true, ...shares },
    { id: "technical-consultant", title: "مشاور فنی", baseAmount: 0, description: "مشاور فنی/بانکی/کنترل پروژه", ...shared },
    { id: "server", title: "سرور", baseAmount: finite(assumptions.monthlyInfrastructureCost) * 0.45, description: "Cloud، سرور، ابزار زیرساخت", ...shared, fxIndexed: true, ...shares },
    { id: "special-license", title: "لایسنس خاص", baseAmount: finite(assumptions.monthlyInfrastructureCost) * 0.25, description: "لایسنس نرم‌افزار و ابزارهای تخصصی", ...shared, fxIndexed: true, ...shares },
    { id: "api", title: "API", baseAmount: finite(assumptions.monthlyInfrastructureCost) * 0.3, description: "API، BI و سرویس‌های بیرونی", ...shared, fxIndexed: true, ...shares },
    { id: "test", title: "تست", baseAmount: finite(assumptions.monthlyTestingCost) * 0.35, description: "تست فنی و عملکردی", ...shared },
    { id: "security", title: "امنیت", baseAmount: finite(assumptions.monthlyTestingCost) * 0.35, description: "امنیت، کنترل دسترسی و آزمون نفوذ", ...shared },
    { id: "qa", title: "QA", baseAmount: finite(assumptions.monthlyTestingCost) * 0.3, description: "کنترل کیفیت مدل و محصول", ...shared },
    {
      id: "deployment",
      title: "هزینه استقرار",
      baseAmount: finite(assumptions.deploymentTrainingCost) * 0.45,
      active: true,
      isMonthly: false,
      selectedMonths: [Math.max(1, developmentMonths)],
      inflationIndexed: true,
      fxIndexed: false,
      fxShare: 0,
      rialShare: 1,
      distributionMode: "equalSplitAcrossSelectedMonths",
      description: "استقرار/قبولی نهایی",
      isCustom: false,
    },
    {
      id: "training",
      title: "هزینه آموزش",
      baseAmount: finite(assumptions.deploymentTrainingCost) * 0.35,
      active: true,
      isMonthly: false,
      selectedMonths: [Math.max(1, developmentMonths)],
      inflationIndexed: true,
      fxIndexed: false,
      fxShare: 0,
      rialShare: 1,
      distributionMode: "equalSplitAcrossSelectedMonths",
      description: "آموزش تیم بهره‌برداری",
      isCustom: false,
    },
    {
      id: "documentation",
      title: "هزینه مستندسازی",
      baseAmount: finite(assumptions.deploymentTrainingCost) * 0.2,
      active: true,
      isMonthly: false,
      selectedMonths: [Math.max(1, developmentMonths)],
      inflationIndexed: true,
      fxIndexed: false,
      fxShare: 0,
      rialShare: 1,
      distributionMode: "equalSplitAcrossSelectedMonths",
      description: "مستندسازی و تحویل دانش",
      isCustom: false,
    },
  ];
};

export const normalizeConstructionAssumptions = (input: ConstructionEngineInput) => {
  const developmentMonths = Math.max(1, Math.round(finite(input.project.constructionDurationMonths, 12)));
  const monthOptions = getAnalysisMonthOptions(developmentMonths);
  const capexShares = normalizeShares(input.capex.totalCapex > EPSILON ? input.capex.fxCapex / input.capex.totalCapex : 0);
  const analysisMonths = clamp(
    Math.round(finite(input.assumptions.analysisMonths, developmentMonths + finite(input.assumptions.bufferMonths, 0))),
    monthOptions[0],
    monthOptions.at(-1) ?? developmentMonths + 12,
  );
  const monthlyInflationRate = input.assumptions.monthlyInflationRate ?? calculateMonthlyRateFromAnnual(input.macro.inflationRate);
  const monthlyFxGrowthRate = input.assumptions.monthlyFxGrowthRate ?? calculateMonthlyRateFromAnnual(input.macro.fxGrowthRate);
  const capexMilestones = input.assumptions.capexMilestones?.length
    ? input.assumptions.capexMilestones
    : createDefaultCapexMilestones(developmentMonths, {
      prepaymentRate: input.assumptions.capexMilestones?.[0]?.percent,
      deliveryPaymentRate: input.assumptions.capexMilestones?.[1]?.percent,
      postInstallPaymentRate: input.assumptions.capexMilestones?.[2]?.percent,
    });
  const costItems = input.assumptions.costItems?.length
    ? input.assumptions.costItems
    : createDefaultConstructionCostItems(developmentMonths, input.assumptions, capexShares.fxShare);
  const actualDelayMonths = input.assumptions.delayScenarioEnabled
    ? finite(input.assumptions.actualDelayMonths, finite(input.assumptions.allowedDelayMonths, 0))
    : 0;
  const activeInstrumentIds = new Set(input.financing.instruments?.filter((instrument) => instrument.active).map((instrument) => instrument.id) ?? []);
  const scheduledDebtByMonth = (input.financing.drawdownRows ?? []).reduce<Record<number, number>>((map, row) => {
    if (activeInstrumentIds.size && !activeInstrumentIds.has(row.instrumentId)) return map;
    const month = row.year * 12 + 1;
    if (month >= 1 && month <= analysisMonths) map[month] = (map[month] ?? 0) + finite(row.amount);
    return map;
  }, {});

  return {
    ...input.assumptions,
    developmentMonths,
    analysisMonths,
    bufferMonths: calculateBufferMonths(analysisMonths, developmentMonths),
    finalCapex: input.capex.totalCapex,
    fxCostShare: capexShares.fxShare,
    rialCostShare: capexShares.rialShare,
    monthlyInflationRate,
    monthlyFxGrowthRate,
    delayMonthlyCost: finite(input.assumptions.delayMonthlyCost, finite(input.assumptions.monthlyDevelopmentPayroll) + finite(input.assumptions.monthlyContractorCost)),
    minimumCashReserve: finite(input.assumptions.minimumCashReserve),
    shareholderInjectionAvailable: finite(input.financing.equity),
    nonEquityFundingAvailable: Math.max(0, finite(input.financing.longTermDebt) + finite(input.financing.shortTermDebt)),
    scheduledDebtByMonth,
    hasScheduledDebtDrawdown: Object.keys(scheduledDebtByMonth).length > 0,
    creditLineCap: finite(input.assumptions.creditLineCap, 0),
    creditLineFeeRate: finite(input.assumptions.creditLineFeeRate, 0),
    delayAdjustmentRate: finite(input.assumptions.delayAdjustmentRate, 0),
    allowedDelayMonths: finite(input.assumptions.allowedDelayMonths, 0),
    actualDelayMonths,
    effectiveDelayMonths: Math.max(0, actualDelayMonths - finite(input.assumptions.allowedDelayMonths, 0)),
    capexMilestones,
    costItems,
  };
};

type NormalizedConstruction = ReturnType<typeof normalizeConstructionAssumptions>;

export const calculateCapexMilestoneSchedule = (controls: NormalizedConstruction) => {
  const schedule = new Map<number, { plannedCapex: number; adjustedCapex: number; inflationFactor: number; fxFactor: number }>();
  monthNumbers(controls.analysisMonths).forEach((month) => {
    const inflationFactor = controls.monthlyAdjustmentEnabled ? (1 + controls.monthlyInflationRate) ** (month - 1) : 1;
    const fxFactor = controls.monthlyAdjustmentEnabled ? (1 + controls.monthlyFxGrowthRate) ** (month - 1) : 1;
    schedule.set(month, { plannedCapex: 0, adjustedCapex: 0, inflationFactor, fxFactor });
  });

  controls.capexMilestones.filter((milestone) => milestone.active && milestone.percent > 0).forEach((milestone) => {
    const month = Math.round(finite(milestone.paymentMonth, 0));
    const row = schedule.get(month);
    if (!row) return;
    const planned = controls.finalCapex * milestone.percent;
    row.plannedCapex += planned;
    row.adjustedCapex += controls.monthlyAdjustmentEnabled
      ? planned * (controls.rialCostShare * row.inflationFactor + controls.fxCostShare * row.fxFactor)
      : planned;
  });

  return schedule;
};

const adjustedCost = (amount: number, item: ConstructionCostItem, inflationFactor: number, fxFactor: number) => {
  const shares = normalizeShares(item.fxShare, item.rialShare);
  const rialFactor = item.inflationIndexed ? inflationFactor : 1;
  const foreignFactor = item.fxIndexed ? fxFactor : 1;
  return amount * (shares.rialShare * rialFactor + shares.fxShare * foreignFactor);
};

export const calculateMonthlyCostSchedule = (controls: NormalizedConstruction) => {
  const months = monthNumbers(controls.analysisMonths);
  const byMonth = new Map<number, Record<string, number>>();
  months.forEach((month) => byMonth.set(month, {}));

  controls.costItems.filter((item) => item.active).forEach((item) => {
    const selected = (item.selectedMonths?.length ? item.selectedMonths : controls.developmentMonths ? monthNumbers(controls.developmentMonths) : [1])
      .filter((month) => month >= 1 && month <= controls.analysisMonths);
    if (!selected.length) return;

    selected.forEach((month) => {
      const inflationFactor = (1 + controls.monthlyInflationRate) ** (month - 1);
      const fxFactor = (1 + controls.monthlyFxGrowthRate) ** (month - 1);
      const manualPercent = finite(item.manualMonthPercents?.[month], 0);
      const base =
        item.isMonthly || item.distributionMode === "repeatMonthly"
          ? item.baseAmount
          : item.distributionMode === "equalSplitAcrossSelectedMonths"
            ? item.baseAmount / selected.length
            : item.distributionMode === "manualPercent"
              ? item.baseAmount * manualPercent
              : item.baseAmount;
      const row = byMonth.get(month);
      if (row) row[item.id] = finite(row[item.id]) + adjustedCost(base, item, inflationFactor, fxFactor);
    });
  });

  return byMonth;
};

export const calculateDelayImpact = (controls: NormalizedConstruction, month: number, inflationFactor: number) => {
  const delayStart = controls.developmentMonths + 1;
  const delayEnd = controls.developmentMonths + controls.effectiveDelayMonths;
  if (!controls.delayScenarioEnabled || month < delayStart || month > delayEnd) return 0;
  const adjustmentFactor = 1 + controls.delayAdjustmentRate * controls.effectiveDelayMonths / 12;
  return controls.delayMonthlyCost * inflationFactor * adjustmentFactor;
};

const fundingNeed = (previousCash: number, minimumCash: number, totalOutflow: number) =>
  Math.max(0, totalOutflow + minimumCash - previousCash);

const allocateFunding = (
  method: string,
  remaining: number,
  need: number,
  month: number,
  totalMonths: number,
) => {
  if (remaining <= EPSILON || need <= EPSILON) return 0;
  if (method.includes("ساده")) return month === 1 ? Math.min(remaining, need) : 0;
  if (method.includes("مساوی")) return Math.min(remaining, remaining / Math.max(1, totalMonths - month + 1), need);
  return Math.min(remaining, need);
};

export const buildConstructionCashFlowTable = (input: ConstructionEngineInput) => {
  const controls = normalizeConstructionAssumptions(input);
  const capexSchedule = calculateCapexMilestoneSchedule(controls);
  const costSchedule = calculateMonthlyCostSchedule(controls);
  let remainingEquity = controls.shareholderInjectionAvailable;
  let remainingDebt = controls.nonEquityFundingAvailable;
  let endingCash = 0;
  let creditLineBalance = 0;
  const rows: MonthlyConstructionRow[] = [];

  monthNumbers(controls.analysisMonths).forEach((month) => {
    const capexRow = capexSchedule.get(month)!;
    const costByItem = costSchedule.get(month) ?? {};
    const customCosts = sum(controls.costItems.filter((item) => item.isCustom).map((item) => finite(costByItem[item.id])));
    const developmentPayroll = finite(costByItem["development-team"]);
    const contractorCost = finite(costByItem["contractor"]) + finite(costByItem["technical-consultant"]);
    const infrastructureCost = finite(costByItem["server"]) + finite(costByItem["special-license"]) + finite(costByItem["api"]);
    const testingCost = finite(costByItem["test"]) + finite(costByItem["security"]) + finite(costByItem["qa"]);
    const deploymentCost = finite(costByItem["deployment"]) + finite(costByItem["training"]) + finite(costByItem["documentation"]);
    const delayCost = calculateDelayImpact(controls, month, capexRow.inflationFactor);
    const creditLineFinanceCost = creditLineBalance * (finite(controls.creditLineRate) + finite(controls.creditLineFeeRate)) / 12;
    const totalMonthlyCosts = sum(Object.values(costByItem));
    const totalCashOutflow = capexRow.adjustedCapex + totalMonthlyCosts + delayCost + creditLineFinanceCost;
    const need = fundingNeed(endingCash, controls.minimumCashReserve, totalCashOutflow);
    const shareholderInjection = allocateFunding(controls.equityTimingMethod, remainingEquity, need, month, controls.analysisMonths);
    remainingEquity -= shareholderInjection;
    const needAfterEquity = Math.max(0, need - shareholderInjection);
    const scheduledDebtDraw = finite(controls.scheduledDebtByMonth[month]);
    const nonEquityFundingDrawdown = controls.hasScheduledDebtDrawdown
      ? Math.min(remainingDebt, scheduledDebtDraw)
      : allocateFunding(controls.debtTimingMethod, remainingDebt, needAfterEquity, month, controls.analysisMonths);
    remainingDebt -= nonEquityFundingDrawdown;
    const totalCashInflowBeforeCredit = shareholderInjection + nonEquityFundingDrawdown;
    const preCreditEndingCash = endingCash + totalCashInflowBeforeCredit - totalCashOutflow;
    const cashShortfall = Math.max(0, controls.minimumCashReserve - preCreditEndingCash);
    const remainingCreditCap = controls.creditLineCap > EPSILON ? Math.max(0, controls.creditLineCap - creditLineBalance) : Number.POSITIVE_INFINITY;
    const creditLineDraw = controls.creditLineEnabled ? Math.min(cashShortfall, remainingCreditCap) : 0;
    creditLineBalance += creditLineDraw;
    endingCash = preCreditEndingCash + creditLineDraw;
    const uncoveredShortfall = Math.max(0, controls.minimumCashReserve - endingCash);
    const cashCrunchFlag =
      cashShortfall <= EPSILON ? "OK" :
      uncoveredShortfall <= EPSILON && creditLineDraw > 0 ? "Cash Crunch پوشش با خط اعتباری" :
      "Cash Crunch";
    const monthDate = addMonthsToDate(input.project.constructionStartDate, month - 1);
    const calendarYear = Number(monthDate.slice(0, 4)) || input.project.baseYear;
    const monthStatus =
      month <= controls.developmentMonths
        ? month === controls.developmentMonths ? "installationAcceptance" : "development"
        : month <= controls.developmentMonths + controls.effectiveDelayMonths
          ? "delay"
          : "bufferSettlement";
    const monthStatusLabel = {
      development: "توسعه",
      delivery: "تحویل",
      installationAcceptance: "استقرار/قبولی",
      bufferSettlement: "بافر/تسویه",
      delay: "تأخیر",
    }[monthStatus];
    const netMonthlyCashFlow = totalCashInflowBeforeCredit + creditLineDraw - totalCashOutflow;

    rows.push({
      monthNumber: month,
      date: monthDate,
      monthDate,
      calendarYear,
      modelYear: Math.max(0, calendarYear - input.project.baseYear),
      developmentMonth: month <= controls.developmentMonths ? month : null,
      status: monthStatusLabel,
      monthStatus,
      plannedCapex: capexRow.plannedCapex,
      inflationFactor: capexRow.inflationFactor,
      fxFactor: capexRow.fxFactor,
      adjustedCapex: capexRow.adjustedCapex,
      costByItem,
      customCosts,
      developmentPayroll,
      contractorCost,
      infrastructureCost,
      testingCost,
      deploymentCost,
      delayCost,
      otherCashOutflow: 0,
      totalCashOutflow,
      shareholderInjection,
      nonEquityFundingDrawdown,
      creditLineDraw,
      equityInjection: shareholderInjection,
      debtDrawdown: nonEquityFundingDrawdown,
      overdraft: creditLineDraw,
      totalCashInflow: totalCashInflowBeforeCredit + creditLineDraw,
      netMonthlyCashFlow,
      cumulativeCashBalance: endingCash,
      monthlySurplusDeficit: netMonthlyCashFlow,
      endingCash,
      minimumCashRequired: controls.minimumCashReserve,
      cashShortfall,
      cashCrunchFlag,
      creditLineBalance,
      creditLineFinanceCost,
      monthNote: cashCrunchFlag === "OK" ? "" : "مانده نقد کمتر از حداقل احتیاطی است.",
      cashCrunch: cashShortfall > EPSILON,
    });
  });

  const controlsResult = validateConstructionCashFlowControls(controls, rows);
  const kpis = calculateConstructionCashFlowKPIs(rows, controlsResult);

  return {
    controls,
    rows,
    kpis,
    controlsResult,
    maxCashDeficit: kpis.maxCashDeficit,
    creditLineRequired: Math.max(kpis.totalCreditLineDraw, ...rows.map((row) => finite(row.creditLineBalance))),
    cashCrunchMonths: kpis.cashCrunchMonths,
    status: kpis.finalStatus,
    warnings: controlsResult.filter((item) => item.status !== "OK").map((item) => item.message),
  };
};

export const calculateConstructionCashFlowKPIs = (
  rows: MonthlyConstructionRow[],
  controls: ConstructionControlCheck[] = [],
): ConstructionCashFlowKpis => {
  const maxDeficitRow = rows.reduce<MonthlyConstructionRow | null>((best, row) =>
    !best || finite(row.cashShortfall) > finite(best.cashShortfall) ? row : best, null);
  const minCash = rows.length ? Math.min(...rows.map((row) => row.endingCash)) : 0;
  const totalCashOutflow = sum(rows.map((row) => row.totalCashOutflow));
  const totalInflows = sum(rows.map((row) => row.totalCashInflow));
  const paymentInvalid = controls.some((item) => item.id === "payment-percent" && item.status === "خطا");
  const horizonInvalid = controls.some((item) => item.id === "delay-horizon" && item.status === "خطا");
  const uncoveredCrunch = rows.some((row) => row.cashCrunchFlag === "Cash Crunch");
  const coveredCrunch = rows.some((row) => row.cashCrunchFlag === "Cash Crunch پوشش با خط اعتباری");
  const finalRow = rows.at(-1);
  const finalStatus =
    paymentInvalid ? "خطای برنامه پرداخت" :
    horizonInvalid ? "افق تحلیل ناکافی" :
    uncoveredCrunch ? "نیازمند اصلاح برنامه تأمین مالی" :
    coveredCrunch ? "قابل اجرا با خط اعتباری" :
    finalRow && finalRow.endingCash >= finalRow.minimumCashRequired ? "قابل اجرا" :
    "نیازمند بررسی";

  return {
    totalCashOutflow,
    totalAdjustedCapex: sum(rows.map((row) => row.adjustedCapex)),
    totalMonthlyCosts: sum(rows.map((row) => sum(Object.values(row.costByItem ?? {})))),
    totalDelayCost: sum(rows.map((row) => row.delayCost)),
    totalShareholderInjection: sum(rows.map((row) => finite(row.shareholderInjection ?? row.equityInjection))),
    totalNonEquityFundingDrawdown: sum(rows.map((row) => finite(row.nonEquityFundingDrawdown ?? row.debtDrawdown))),
    totalCreditLineDraw: sum(rows.map((row) => finite(row.creditLineDraw ?? row.overdraft))),
    totalCreditLineFinanceCost: sum(rows.map((row) => finite(row.creditLineFinanceCost))),
    maxCashDeficit: finite(maxDeficitRow?.cashShortfall),
    peakDeficitMonth: maxDeficitRow && finite(maxDeficitRow.cashShortfall) > EPSILON ? maxDeficitRow.monthNumber : null,
    cashCrunchMonths: rows.filter((row) => finite(row.cashShortfall) > EPSILON).length,
    minimumObservedCash: minCash,
    maxPositiveCash: rows.length ? Math.max(...rows.map((row) => row.endingCash)) : 0,
    biggestMonthlyGap: Math.max(0, ...rows.map((row) => Math.max(0, row.totalCashOutflow - row.totalCashInflow))),
    resourceCoveragePercent: totalCashOutflow > EPSILON ? totalInflows / totalCashOutflow : 0,
    finalStatus,
  };
};

export const validateConstructionCashFlowControls = (
  controls: NormalizedConstruction,
  rows: MonthlyConstructionRow[] = [],
): ConstructionControlCheck[] => {
  const paymentPercent = sum(controls.capexMilestones.filter((milestone) => milestone.active).map((milestone) => milestone.percent));
  const shareTotal = controls.fxCostShare + controls.rialCostShare;
  const totalResources = controls.shareholderInjectionAvailable + controls.nonEquityFundingAvailable;
  const totalNonCreditInflow = sum(rows.map((row) => finite(row.shareholderInjection) + finite(row.nonEquityFundingDrawdown)));
  const overdrawnDebt = sum(rows.map((row) => finite(row.nonEquityFundingDrawdown))) - controls.nonEquityFundingAvailable;
  const invalidMilestone = controls.capexMilestones.some((milestone) => milestone.active && milestone.percent > 0 && (!milestone.paymentMonth || milestone.paymentMonth < 1 || milestone.paymentMonth > controls.analysisMonths));
  const invalidCostMonths = controls.costItems.some((item) => item.active && item.selectedMonths.some((month) => month < 1 || month > controls.analysisMonths));
  const delayHorizonRequired = controls.developmentMonths + controls.effectiveDelayMonths;

  const check = (id: string, title: string, ok: boolean, message: string, warning = false): ConstructionControlCheck => ({
    id,
    title,
    status: ok ? "OK" : warning ? "هشدار" : "خطا",
    message: ok ? "OK" : message,
  });

  return [
    check("payment-percent", "کنترل جمع درصد پرداخت", Math.abs(paymentPercent - 1) < 0.0001, paymentPercent < 1 ? "جمع درصد پرداخت کمتر از 100٪ است." : "جمع درصد پرداخت بیشتر از 100٪ است."),
    check("fx-rial-share", "کنترل سهم ارزی و ریالی", Math.abs(shareTotal - 1) < 0.0001, "سهم ارزی و ریالی باید جمعاً 100٪ باشد."),
    check("capex-program", "کنترل CAPEX برنامه‌ای", rows.length === 0 || Math.abs(sum(rows.map((row) => row.plannedCapex)) - controls.finalCapex) <= Math.max(1, controls.finalCapex * 0.001), "جمع CAPEX برنامه‌ای با CAPEX نهایی برابر نیست.", true),
    check("funding-cap", "کنترل سقف منابع مالی", totalNonCreditInflow <= totalResources + 1, "منابع دریافتی از سقف منابع مالی بیشتر است."),
    check("monthly-costs", "کنترل هزینه‌های ماهانه", controls.costItems.some((item) => item.active && item.baseAmount > 0), "هزینه‌های ماهانه/توسعه صفر یا غیرفعال است.", true),
    check("delay-coverage", "کنترل پوشش تأخیر", !controls.delayScenarioEnabled || controls.effectiveDelayMonths >= 0, "مدت تأخیر معتبر نیست."),
    check("credit-line", "کنترل خط اعتباری", controls.creditLineEnabled || rows.every((row) => finite(row.cashShortfall) <= EPSILON), "بدون خط اعتباری، Cash Crunch پوشش داده نمی‌شود.", true),
    check("minimum-cash", "کنترل مانده نقد احتیاطی", controls.minimumCashReserve >= 0, "حداقل مانده نقد نمی‌تواند منفی باشد."),
    check("cost-months", "کنترل ماه‌های پرداخت هزینه‌ها", !invalidCostMonths, "برخی ماه‌های پرداخت هزینه خارج از افق تحلیل هستند."),
    check("milestone-months", "کنترل ماه‌های پرداخت CAPEX", !invalidMilestone, "ماه پرداخت یکی از milestones خارج از افق تحلیل است."),
    check("debt-overdraw", "کنترل برداشت اضافه وام", overdrawnDebt <= 1, "برداشت تأمین مالی غیرسهامدار بیشتر از سقف مصوب است."),
    check("delay-horizon", "کنترل افق تحلیل برای تأخیر", controls.analysisMonths >= delayHorizonRequired, "افق تحلیل برای پوشش تأخیر کافی نیست."),
  ];
};
