import { excelDiagnostics, fieldSources } from "@/lib/excel-map";
import {
  calculateEffectiveDiscountRate,
  validateIndustryTemplate,
  validateMacroAssumptions,
  validateMarketDemand,
  validateProjectSetup,
} from "@/lib/phase-one-calculations";
import {
  calculateAnnualCapexSchedule,
  calculateCapacityProduction,
  calculateCapexSummary,
  calculateDirectCostSchedule,
  calculateDirectUnitCost,
  calculateOpexSchedule,
} from "@/lib/phase-two-calculations";
import {
  calculateDSCR,
  calculateFinancingEngine,
  calculateRemainingDebtByYear,
  dscrStatus,
} from "@/lib/financing-engine";
import { buildConstructionCashFlowTable } from "@/lib/construction-cashflow-engine";
import { calculateEconomicAnalysis } from "@/lib/economic-analysis-engine";
import {
  calculateIrrResult,
  calculateMirrResult,
  calculatePaybackResult,
  calculateRealRate,
  countCashFlowSignChanges,
  deflateCashFlows,
  safeDivide,
} from "@/lib/financial-math";
import { calculateWorkingCapitalSchedule } from "@/lib/working-capital-engine";
import {
  calculateCapexDepreciationByYear,
  calculateTaxBridge,
} from "@/lib/tax-capex-engine";
import {
  calculateSensitivityAnalysis,
  emptySensitivity,
} from "@/lib/sensitivity-engine";
import { runMonteCarloSimulation, runMonteCarloSimulationAsync, type MonteCarloAsyncOptions } from "@/lib/monte-carlo-engine";
import type {
  CapexAssumptions,
  CashFlowBridgeLine,
  DcfDiagnostic,
  EconomicFinancialItem,
  FinancingAssumptions,
  FormulaTrace,
  ModelSourceReference,
  Project,
  Scenario,
  ScenarioOutputs,
  ValidationIssue,
  YearlyRow,
} from "@/lib/types";

const range = (end: number) => Array.from({ length: end + 1 }, (_, year) => year);

const EPSILON = 1e-9;

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const byYear = <T extends { year: number }>(rows: T[], year: number) => rows.find((row) => row.year === year);

const cumulativeSeries = (values: number[]) => {
  const output: number[] = [];
  values.reduce((total, value, index) => {
    const next = total + value;
    output[index] = next;
    return next;
  }, 0);
  return output;
};

const sourceRef = (key: keyof typeof fieldSources) => {
  const src = fieldSources[key];
  return src ? `${src.sourceSheet}!${src.sourceCell}` : undefined;
};

const trace = (
  id: string,
  label: string,
  formula: string,
  inputs: FormulaTrace["inputs"],
  result: number | string | null,
  sourceKey?: keyof typeof fieldSources,
): FormulaTrace => {
  const src = sourceKey ? fieldSources[sourceKey] : undefined;
  return {
    id,
    label,
    formula,
    inputs,
    result,
    sourceSheet: src?.sourceSheet,
    sourceCell: src?.sourceCell,
  };
};

const issue = (
  id: string,
  severity: ValidationIssue["severity"],
  module: string,
  message: string,
  recommendation?: string,
  sourceKey?: keyof typeof fieldSources,
): ValidationIssue => {
  const src = sourceKey ? fieldSources[sourceKey] : undefined;
  return {
    id,
    severity,
    module,
    message,
    recommendation,
    sourceSheet: src?.sourceSheet,
    sourceCell: src?.sourceCell,
  };
};

export const calculateIrr = (cashFlows: number[]) => calculateIrrResult(cashFlows).value;

const activeScenario = (project: Project) =>
  project.scenarios.find((scenario) => scenario.id === project.activeScenarioId) ?? project.scenarios[0];

const calculateCapacity = (project: Project, scenario: Scenario, traces: FormulaTrace[]) => {
  const assumptions = scenario.assumptions.capacity;
  const result = calculateCapacityProduction(assumptions);
  traces.push(...result.trace);
  return {
    effectiveAnnualHours: result.values.effectiveAnnualHours,
    effectiveNominalCapacity: result.values.nominalEffectiveCapacity,
    rows: range(project.modelHorizonYears).map((year) => {
      const utilization =
        year === 0
          ? 0
          : year === 1
            ? assumptions.firstYearUtilizationRate
            : year === 2
              ? assumptions.secondYearUtilizationRate
              : assumptions.stableYearUtilizationRate;
      const productionVolume =
        result.values.availableCapacity *
        utilization *
        assumptions.productionEfficiency *
        (1 - assumptions.wasteRate);
      return {
        year,
        utilization,
        productionVolume,
        idleCapacity: Math.max(0, result.values.nominalEffectiveCapacity - productionVolume),
      };
    }),
  };
};

const calculateRevenue = (project: Project, scenario: Scenario, capacity: ReturnType<typeof calculateCapacity>, traces: FormulaTrace[]) => {
  const a = scenario.assumptions.market;
  const macro = scenario.assumptions.macro;
  const rows = range(project.modelHorizonYears).map((year) => {
    const demand = year === 0 ? 0 : Math.min(a.addressableMarket, a.targetMarket * (1 + a.marketGrowthRate) ** (year - 1), a.demandLimit);
    const production = byYear(capacity.rows, year)?.productionVolume ?? 0;
    const achievableDemand = year === 0 ? 0 : Math.min(demand * a.penetrationRate, a.demandLimit);
    const salesVolume = Math.min(production, achievableDemand);
    const priceGrowth = a.priceGrowthRate || macro.salesPriceGrowth;
    const salesPrice = year === 0 ? 0 : a.baseSalesPrice * (1 + priceGrowth) ** (year - 1);
    const revenue = salesVolume * salesPrice;
    return { year, demand, salesVolume, salesPrice, revenue };
  });

  const year1 = rows[1];
  traces.push(
    trace(
      "revenue.year1",
      "درآمد سال ۱",
      "Revenue = MIN(Demand, EffectiveCapacity) * BaseSalesPrice",
      [
        { label: "حجم فروش", value: year1?.salesVolume ?? 0, source: "MarketDemand08!Q51 / CapacityProduction09!Q46" },
        { label: "قیمت فروش", value: year1?.salesPrice ?? 0, source: sourceRef("baseSalesPrice") },
      ],
      year1?.revenue ?? 0,
      "baseSalesPrice",
    ),
  );

  return { rows };
};

const calculateDirectCosts = (
  project: Project,
  scenario: Scenario,
  revenue: ReturnType<typeof calculateRevenue>,
  capacity: ReturnType<typeof calculateCapacity>,
  traces: FormulaTrace[],
) => {
  const a = scenario.assumptions.directCosts;
  const volumes = range(project.modelHorizonYears).map((year) =>
    byYear(revenue.rows, year)?.salesVolume ?? byYear(capacity.rows, year)?.productionVolume ?? 0);
  const prices = range(project.modelHorizonYears).map((year) => byYear(revenue.rows, year)?.salesPrice ?? 0);
  const result = calculateDirectCostSchedule(a, scenario.assumptions.macro, volumes, prices);
  traces.push(...result.trace);
  return { rows: result.values };
};

const calculateOpex = (
  project: Project,
  scenario: Scenario,
  traces: FormulaTrace[],
  revenueRows?: ReturnType<typeof calculateRevenue>["rows"],
  capacityRows?: ReturnType<typeof calculateCapacity>["rows"],
) => {
  const revenues = range(project.modelHorizonYears).map((year) => byYear(revenueRows ?? [], year)?.revenue ?? 0);
  const production = range(project.modelHorizonYears).map((year) => byYear(capacityRows ?? [], year)?.productionVolume ?? 0);
  const result = calculateOpexSchedule(scenario.assumptions.opex, revenues, production);
  traces.push(...result.trace);
  return { rows: result.values.rows };
};

const calculateCapex = (project: Project, scenario: Scenario, traces: FormulaTrace[]) => {
  const a: CapexAssumptions = scenario.assumptions.capex;
  const summary = calculateCapexSummary(a.items, scenario.assumptions.macro);
  const schedule = calculateAnnualCapexSchedule(
    a,
    scenario.assumptions.macro,
    project.baseYear,
    project.modelHorizonYears,
  );
  traces.push(...summary.trace);
  return {
    totalCapex: summary.values.totalFixedInvestment,
    rialCapex: summary.values.totalRialInvestment,
    fxCapex: summary.values.totalFxInvestment,
    delayCost: summary.values.totalDelayCost,
    contingency: summary.values.totalContingencyCost,
    annual: schedule.map((row) => ({
      year: row.year,
      cashCapex: row.finalAnnualCapex,
      capitalizedCapex: row.finalAnnualCapex,
      depreciation: row.depreciation,
      netFixedAssets: row.netFixedAssets,
    })),
  };
};

const calculateConstructionCashFlow = (
  project: Project,
  scenario: Scenario,
  capex: ReturnType<typeof calculateCapex>,
  traces: FormulaTrace[],
) => {
  const result = buildConstructionCashFlowTable({
    project,
    assumptions: scenario.assumptions.construction,
    macro: scenario.assumptions.macro,
    capex,
    financing: scenario.assumptions.financing,
  });

  traces.push(
    trace(
      "construction.cashCrunch",
      "نیاز نقدینگی فاز ساخت",
      "EndingCash = BeginningCash + ShareholderInjection + NonEquityFunding + CreditLine - MonthlyOutflow",
      [
        { label: "کل خروجی ساخت", value: result.kpis.totalCashOutflow, source: sourceRef("constructionTotalOutflow") },
        { label: "حداقل نقد", value: scenario.assumptions.construction.minimumCashReserve, source: "ConstructionCashFlow!U37" },
        { label: "خط اعتباری", value: result.kpis.totalCreditLineDraw, source: "ConstructionCashFlow!U42:U43" },
      ],
      result.creditLineRequired,
      "constructionTotalOutflow",
    ),
  );

  return {
    rows: result.rows,
    maxCashDeficit: result.maxCashDeficit,
    creditLineRequired: result.creditLineRequired,
    cashCrunchMonths: result.cashCrunchMonths,
    status: result.status,
    kpis: result.kpis,
    controls: result.controlsResult,
    warnings: result.warnings,
  };
};

const calculateWorkingCapital = (
  project: Project,
  scenario: Scenario,
  revenue: ReturnType<typeof calculateRevenue>,
  directCosts: ReturnType<typeof calculateDirectCosts>,
  opex: ReturnType<typeof calculateOpex>,
  traces: FormulaTrace[],
) => {
  const a = scenario.assumptions.workingCapital;
  const driverRows = range(project.modelHorizonYears).map((year) => {
    const revenueValue = byYear(revenue.rows, year)?.revenue ?? 0;
    const salesVolume = byYear(revenue.rows, year)?.salesVolume ?? 0;
    const cogs = byYear(directCosts.rows, year)?.totalCost ?? 0;
    const opexCash = byYear(opex.rows, year)?.cashOpex ?? 0;
    const direct = scenario.assumptions.directCosts;
    const rawMaterialFxRate = direct.mainRawMaterialFxRateType === "manual"
      ? (direct.mainRawMaterialManualFxRate ?? scenario.assumptions.macro.fxRates.manual)
      : (scenario.assumptions.macro.fxRates[direct.mainRawMaterialFxRateType] ?? scenario.assumptions.macro.baseFxRate);
    const rawMaterialUnitCost =
      Math.max(0, direct.rawMaterialRialUnitCost || direct.mainRawMaterialRialPrice) +
      Math.max(0, direct.rawMaterialFxUnitCost || direct.mainRawMaterialFxPrice) * rawMaterialFxRate +
      Math.max(0, direct.secondaryMaterialsUnitCost) +
      Math.max(0, direct.packagingUnitCost);
    const rawMaterialAnnualCost = rawMaterialUnitCost > 0 && salesVolume > 0
      ? Math.min(cogs, rawMaterialUnitCost * salesVolume)
      : cogs;
    return { year, revenue: revenueValue, cogs, cashOpex: opexCash, rawMaterialAnnualCost };
  });
  const result = calculateWorkingCapitalSchedule(a, driverRows, project.modelHorizonYears);
  const { rows, initialWorkingCapital, releaseFinalYear } = result;
  traces.push(
    trace(
      "workingCapital.year1",
      "سرمایه در گردش سال ۱",
      "Receivables + Inventory + Prepayments + MinimumCash - Payables",
      [
        { label: "روز وصول", value: a.receivableDays, source: "WorkingCapital13!R10" },
        { label: "روز پرداخت", value: a.payableDays, source: "WorkingCapital13!R11" },
      ],
      initialWorkingCapital,
      "workingCapital",
    ),
  );

  return { initialWorkingCapital, releaseFinalYear, rows };
};

const calculateFinancing = (
  project: Project,
  scenario: Scenario,
  capex: ReturnType<typeof calculateCapex>,
  traces: FormulaTrace[],
) => {
  const a: FinancingAssumptions = scenario.assumptions.financing;
  const capexByYear = Object.fromEntries(capex.annual.map((row) => [row.year, row.cashCapex]));
  const financing = calculateFinancingEngine(a, project.modelHorizonYears, {
    capexByYear,
    physicalProgressByYear: capexByYear,
    milestoneByYear: capexByYear,
  });

  traces.push(
    trace(
      "financing.fixedPayment",
      "قسط ثابت سالانه مبنا",
      "Σ PMT(periodicRate, repaymentPeriods, instrumentAmount) × paymentsPerYear",
      [
        { label: "نرخ سود/کارمزد", value: a.interestRate, source: sourceRef("interestRate") },
        { label: "مدت بازپرداخت", value: a.repaymentYears, source: sourceRef("repaymentYears") },
        { label: "بدهی مبنا", value: financing.kpis.repaymentBaseDebt, source: "Financing14!R88" },
      ],
      financing.kpis.baseFixedAnnualInstallment,
      "interestRate",
    ),
  );

  traces.push(
    trace(
      "financing.debtService",
      "برنامه کامل خدمت بدهی",
      "Drawdown + Cost behavior during grace + Principal schedule + Financing fees",
      [
        { label: "تعداد ابزارهای فعال", value: financing.instrumentSchedules.filter((row) => row.year === 0 && row.instrumentId).length, source: "Financing14!S6:S21" },
        { label: "کل بدهی", value: financing.kpis.totalDebt, source: "Financing14!R10" },
      ],
      financing.totalDebtService,
    ),
  );

  return financing;
};

const calculateStatements = (
  project: Project,
  scenario: Scenario,
  revenue: ReturnType<typeof calculateRevenue>,
  directCosts: ReturnType<typeof calculateDirectCosts>,
  opex: ReturnType<typeof calculateOpex>,
  capex: ReturnType<typeof calculateCapex>,
  workingCapital: ReturnType<typeof calculateWorkingCapital>,
  financing: ReturnType<typeof calculateFinancing>,
  traces: FormulaTrace[],
) => {
  let cumulativeCashFlow = 0;
  let retainedEarnings = 0;
  let cumulativeEquity = 0;
  const statementRows: YearlyRow[] = [];
  const depreciationRows = calculateCapexDepreciationByYear(
    scenario.assumptions.capex.items,
    scenario.assumptions.macro,
    project,
  );
  const preTaxRows = range(project.modelHorizonYears).map((year) => {
    const revenueRow = byYear(revenue.rows, year)!;
    const directCostRow = byYear(directCosts.rows, year)!;
    const opexRow = byYear(opex.rows, year)!;
    const capexRow = byYear(capex.annual, year)!;
    const loanRow = byYear(financing.schedule, year)!;
    const grossProfit = revenueRow.revenue - directCostRow.totalCost;
    const grossMargin = revenueRow.revenue > 0 ? grossProfit / revenueRow.revenue : 0;
    const ebitda = grossProfit - opexRow.cashOpex;
    const depreciation = capexRow.depreciation;
    const ebit = ebitda - depreciation;
    const interest = loanRow.interest;
    const ebt = ebit - interest;
    return { year, revenueRow, directCostRow, opexRow, capexRow, loanRow, grossProfit, grossMargin, ebitda, depreciation, ebit, interest, ebt };
  });
  const taxOutput = calculateTaxBridge({
    project,
    tax: scenario.assumptions.tax,
    macro: scenario.assumptions.macro,
    depreciationRows,
    accountingEbtByYear: Object.fromEntries(preTaxRows.map((row) => [row.year, row.ebt])),
    totalCapex: capex.totalCapex,
  });

  range(project.modelHorizonYears).forEach((year) => {
    const preTaxRow = preTaxRows[year];
    const { revenueRow, directCostRow, opexRow, capexRow, loanRow, grossProfit, grossMargin, ebitda, depreciation, ebit, interest, ebt } = preTaxRow;
    const wcRow = byYear(workingCapital.rows, year)!;
    const taxRow = taxOutput.rows[year];
    const tax = taxRow.finalTax;
    const netProfit = ebt - tax;
    const debtOutstanding = loanRow.endingBalance;
    const dividends =
      scenario.assumptions.financing.dividendPolicy === "درصدی" && debtOutstanding <= 0
        ? Math.max(0, netProfit * scenario.assumptions.financing.ordinaryDividendPayout)
        : 0;
    retainedEarnings += netProfit - dividends;
    const cfo = year === 0 ? 0 : netProfit + depreciation - wcRow.changeInWorkingCapital;
    const cfi = -capexRow.cashCapex;
    const equityInjection = year === 0 ? scenario.assumptions.financing.equity : 0;
    cumulativeEquity += equityInjection;
    const debtDrawdown = loanRow.drawdown;
    const principalRepayment = loanRow.principalRepayment;
    const cff = debtDrawdown + equityInjection - principalRepayment - dividends;
    const netCashFlow = cfo + cfi + cff;
    cumulativeCashFlow += netCashFlow;
    const cash = Math.max(0, cumulativeCashFlow);
    const shortTermFunding = Math.max(0, -cumulativeCashFlow);
    const operatingCurrentAssets = wcRow.currentAssets;
    const operatingCurrentLiabilities = wcRow.currentLiabilities;
    const fixedAssetsGross = capex.annual.slice(0, year + 1).reduce((total, row) => total + row.capitalizedCapex, 0);
    const accumulatedDepreciation = capex.annual.slice(0, year + 1).reduce((total, row) => total + row.depreciation, 0);
    const netFixedAssets = Math.max(0, fixedAssetsGross - accumulatedDepreciation);
    const totalAssets = cash + operatingCurrentAssets + netFixedAssets;
    const debt = loanRow.endingBalance + shortTermFunding;
    const paidInCapital = cumulativeEquity;
    const equity = paidInCapital + retainedEarnings;
    const totalLiabilitiesAndEquity = debt + operatingCurrentLiabilities + equity;
    const balanceCheck = totalAssets - totalLiabilitiesAndEquity;
    const balanceTolerance = Math.max(1_000_000, Math.abs(totalAssets) * 0.000001);
    const balanceStatus = Math.abs(balanceCheck) <= balanceTolerance ? "balanced" : "out-of-balance";
    const balanceDiagnostic = balanceStatus === "balanced"
      ? null
      : `Balance mismatch in year ${year}: assets minus liabilities/equity = ${balanceCheck}. Check cash sweep, NWC release, debt drawdown/repayment, dividends, and retained earnings mapping to FinancialStatements16.`;
    const debtService = loanRow.debtService;
    const cfads = ebitda - tax - wcRow.changeInWorkingCapital;
    const dscr = calculateDSCR(cfads, debtService);
    const currentAssetsForRatio = cash + wcRow.currentAssets;
    const currentLiabilitiesForRatio = wcRow.currentLiabilities + shortTermFunding;
    const currentRatio = safeDivide(currentAssetsForRatio, currentLiabilitiesForRatio);
    const quickRatio = safeDivide(cash + wcRow.receivables + wcRow.prepayments, currentLiabilitiesForRatio);
    const workingCapitalTurnover = safeDivide(revenueRow.revenue, wcRow.workingCapital);
    const interestCoverage = safeDivide(ebit, interest);
    const dio = safeDivide(wcRow.inventory * 365, directCostRow.totalCost);
    const dso = safeDivide(wcRow.receivables * 365, revenueRow.revenue);
    const dpo = safeDivide(wcRow.payables * 365, directCostRow.totalCost + opexRow.cashOpex);
    const cashConversionCycle = dio !== null && dso !== null && dpo !== null ? dio + dso - dpo : null;
    loanRow.cfads = cfads;
    loanRow.dscr = dscr;
    loanRow.status = dscrStatus(dscr);
    const fcff = year === 0
      ? -capexRow.cashCapex - wcRow.changeInWorkingCapital
      : ebit - tax + depreciation - capexRow.cashCapex - wcRow.changeInWorkingCapital;
    const fcfe = netProfit + depreciation - capexRow.cashCapex - wcRow.changeInWorkingCapital + debtDrawdown - principalRepayment;

    statementRows.push({
      year,
      calendarYear: project.baseYear + year,
      salesVolume: revenueRow.salesVolume,
      salesPrice: revenueRow.salesPrice,
      revenue: revenueRow.revenue,
      cogs: directCostRow.totalCost,
      grossProfit,
      grossMargin,
      opex: opexRow.cashOpex,
      ebitda,
      depreciation,
      ebit,
      interest,
      ebt,
      tax,
      netProfit,
      dividends,
      retainedEarnings,
      capex: capexRow.cashCapex,
      changeInWorkingCapital: wcRow.changeInWorkingCapital,
      cfo,
      cfi,
      cff,
      netCashFlow,
      cumulativeCashFlow,
      cash,
      operatingCurrentAssets,
      receivables: wcRow.receivables,
      inventory: wcRow.inventory,
      prepayments: wcRow.prepayments,
      minimumCash: wcRow.minimumCash,
      grossFixedAssets: fixedAssetsGross,
      accumulatedDepreciation,
      netFixedAssets,
      operatingCurrentLiabilities,
      payables: wcRow.payables,
      accruedExpenses: wcRow.accruedExpenses,
      otherCurrentLiabilities: wcRow.otherCurrentLiabilities,
      shortTermFunding,
      debtDrawdown,
      principalRepayment,
      equityInjection,
      debt,
      equity,
      paidInCapital,
      totalAssets,
      totalLiabilitiesAndEquity,
      balanceCheck,
      balanceStatus,
      balanceDiagnostic,
      dscr,
      currentRatio,
      quickRatio,
      workingCapitalTurnover,
      interestCoverage,
      dio,
      dso,
      dpo,
      cashConversionCycle,
      fcff,
      fcfe,
    });
  });

  financing.instrumentSchedules.forEach((instrumentRow) => {
    const annualRow = byYear(financing.schedule, instrumentRow.year);
    const share = annualRow && annualRow.debtService > 0 ? instrumentRow.totalDebtService / annualRow.debtService : 0;
    instrumentRow.cfads = annualRow ? annualRow.cfads * share : 0;
    instrumentRow.dscr = calculateDSCR(instrumentRow.cfads, instrumentRow.totalDebtService);
    instrumentRow.status = dscrStatus(instrumentRow.dscr);
  });

  const dscrValues = financing.schedule.map((row) => row.dscr).filter((value): value is number => value !== null && Number.isFinite(value));
  financing.minimumDscr = dscrValues.length ? Math.min(...dscrValues) : null;
  financing.averageDscr = dscrValues.length ? sum(dscrValues) / dscrValues.length : null;
  financing.remainingDebtByYear = calculateRemainingDebtByYear(financing.schedule);
  financing.kpis = {
    ...financing.kpis,
    minimumDscr: financing.minimumDscr,
    averageDscr: financing.averageDscr,
  };

  traces.push(
    trace(
      "statements.ebitda.year1",
      "EBITDA سال ۱",
      "Revenue - COGS - Cash OPEX",
      [
        { label: "درآمد", value: byYear(statementRows, 1)?.revenue ?? 0, source: "FinancialStatements16!AQ79" },
        { label: "COGS", value: byYear(statementRows, 1)?.cogs ?? 0, source: "FinancialStatements16!AP79" },
        { label: "OPEX", value: byYear(statementRows, 1)?.opex ?? 0, source: "FinancialStatements16!AM79" },
      ],
      byYear(statementRows, 1)?.ebitda ?? 0,
    ),
  );

  return { statements: { rows: statementRows }, tax: taxOutput, financing };
};

const calculateValuation = (project: Project, scenario: Scenario, statements: { rows: YearlyRow[] }, traces: FormulaTrace[]) => {
  const macro = scenario.assumptions.macro;
  const discountRateResult = calculateEffectiveDiscountRate(macro);
  const nominalDiscountRate = macro.defaultDiscountRate;
  const inflationRate = macro.inflationGeneralAnnual;
  const realDiscountMetric = calculateRealRate(nominalDiscountRate, inflationRate);
  const realTerminalGrowthMetric = calculateRealRate(macro.terminalGrowthRate, inflationRate);
  const realDiscountRate = realDiscountMetric.value;
  const nominalTerminalGrowthRate = macro.terminalGrowthRate;
  const realTerminalGrowthRate = realTerminalGrowthMetric.value ?? macro.terminalGrowthRate;
  const nominalFcffByYear = statements.rows.map((row) => row.fcff);
  const nominalFcfeByYear = statements.rows.map((row) => row.fcfe);
  const realFcffConversion = deflateCashFlows(nominalFcffByYear, inflationRate);
  const realFcfeConversion = deflateCashFlows(nominalFcfeByYear, inflationRate);
  const realFcffByYear = realFcffConversion.cashFlows.length ? realFcffConversion.cashFlows : nominalFcffByYear.map(() => 0);
  const realFcfeByYear = realFcfeConversion.cashFlows.length ? realFcfeConversion.cashFlows : nominalFcfeByYear.map(() => 0);

  const buildDcf = (
    cashFlows: number[],
    discountRate: number | null,
    terminalGrowthRate: number,
    label: string,
  ) => {
    const invalidRate = discountRate === null || !Number.isFinite(discountRate) || discountRate <= -1 || !Number.isFinite(terminalGrowthRate);
    const discountedByYear = invalidRate
      ? cashFlows.map(() => 0)
      : cashFlows.map((cashFlow, year) => cashFlow / (1 + discountRate) ** year);
    const finalCashFlow = cashFlows.at(-1) ?? 0;
    const terminalAllowed = !invalidRate && discountRate > terminalGrowthRate;
    const terminalValue = terminalAllowed
      ? (finalCashFlow * (1 + terminalGrowthRate)) / (discountRate - terminalGrowthRate)
      : 0;
    const discountedTerminalValue = terminalAllowed
      ? terminalValue / (1 + (discountRate ?? 0)) ** project.modelHorizonYears
      : 0;
    const npv = sum(discountedByYear) + discountedTerminalValue;
    const npvMetric = invalidRate
      ? { value: null, status: "invalid_input" as const, reason: `نرخ تنزیل ${label} معتبر نیست؛ NPV ${label} محاسبه نشد.` }
      : terminalAllowed
        ? { value: npv, status: "ok" as const }
        : { value: npv, status: "invalid_input" as const, reason: `نرخ رشد پایانی ${label} باید از نرخ تنزیل همان مبنا کمتر باشد؛ ارزش نهایی ${label} صفر لحاظ شد.` };
    const irrMetric = calculateIrrResult(cashFlows);
    const mirrMetric = calculateMirrResult(cashFlows, macro.financeRate, macro.reinvestmentRate);
    const paybackMetric = calculatePaybackResult(cashFlows);
    const discountedPaybackMetric = calculatePaybackResult(discountedByYear);

    return {
      cashFlows,
      discountedByYear,
      cumulative: cumulativeSeries(cashFlows),
      terminalValue,
      discountedTerminalValue,
      npv,
      npvMetric,
      irrMetric,
      mirrMetric,
      paybackMetric,
      discountedPaybackMetric,
    };
  };

  const nominalFcff = buildDcf(nominalFcffByYear, nominalDiscountRate, nominalTerminalGrowthRate, "FCFF اسمی");
  const nominalFcfe = buildDcf(nominalFcfeByYear, nominalDiscountRate, nominalTerminalGrowthRate, "FCFE اسمی");
  const realFcff = buildDcf(realFcffByYear, realDiscountRate, realTerminalGrowthRate, "FCFF واقعی");
  const realFcfe = buildDcf(realFcfeByYear, realDiscountRate, realTerminalGrowthRate, "FCFE واقعی");
  const useRealBasis = macro.calculationBasis === "واقعی";
  const selectedDiscountRate = useRealBasis ? realDiscountRate ?? discountRateResult.values.appliedRate : nominalDiscountRate;
  const selectedTerminalGrowthRate = useRealBasis ? realTerminalGrowthRate : nominalTerminalGrowthRate;
  const selectedFcff = useRealBasis ? realFcff : nominalFcff;
  const selectedFcfe = useRealBasis ? realFcfe : nominalFcfe;
  const fcffByYear = selectedFcff.cashFlows;
  const fcfeByYear = selectedFcfe.cashFlows;
  const discountedFcffByYear = selectedFcff.discountedByYear;
  const discountedFcfeByYear = selectedFcfe.discountedByYear;
  const cumulativeFcff = selectedFcff.cumulative;
  const cumulativeFcfe = selectedFcfe.cumulative;
  const terminalValue = selectedFcff.terminalValue;
  const discountedTerminalValue = selectedFcff.discountedTerminalValue;
  const terminalValueFcfe = selectedFcfe.terminalValue;
  const discountedTerminalValueFcfe = selectedFcfe.discountedTerminalValue;
  const npv = selectedFcff.npvMetric.value ?? 0;
  const irrMetric = selectedFcff.irrMetric;
  const mirrMetric = selectedFcff.mirrMetric;
  const paybackMetric = selectedFcff.paybackMetric;
  const discountedPaybackMetric = selectedFcff.discountedPaybackMetric;
  const irr = irrMetric.value;
  const mirr = mirrMetric.value;
  const payback = paybackMetric.value;
  const discountedPayback = discountedPaybackMetric.value;
  const diagnostics: string[] = [];
  const addCashFlowDiagnostics = (
    label: string,
    dcf: ReturnType<typeof buildDcf>,
  ) => {
    if (!dcf.cashFlows.some((value) => value < 0)) diagnostics.push(`${label}: IRR قابل اتکا نیست چون جریان نقد منفی وجود ندارد.`);
    if (!dcf.cashFlows.some((value) => value > 0)) diagnostics.push(`${label}: IRR قابل محاسبه نیست چون جریان نقد مثبت کافی وجود ندارد.`);
    if (countCashFlowSignChanges(dcf.cashFlows) > 1) diagnostics.push(`${label}: جریان نقد چند تغییر علامت دارد؛ امکان چند IRR وجود دارد.`);
    if (dcf.npvMetric.reason) diagnostics.push(dcf.npvMetric.reason);
    if (dcf.irrMetric.reason) diagnostics.push(`${label}: ${dcf.irrMetric.reason}`);
    if (dcf.mirrMetric.reason) diagnostics.push(`${label}: ${dcf.mirrMetric.reason}`);
    if (dcf.paybackMetric.reason) diagnostics.push(`${label}: ${dcf.paybackMetric.reason}`);
    if ((dcf.npvMetric.value ?? dcf.npv) < 0) diagnostics.push(`${label}: NPV منفی است؛ پروژه با مفروضات فعلی ارزش اقتصادی مالی کافی ندارد.`);
  };
  addCashFlowDiagnostics("FCFF اسمی", nominalFcff);
  addCashFlowDiagnostics("FCFE اسمی", nominalFcfe);
  addCashFlowDiagnostics("FCFF واقعی", realFcff);
  addCashFlowDiagnostics("FCFE واقعی", realFcfe);
  if (realDiscountMetric.reason) diagnostics.push(realDiscountMetric.reason);
  if (realTerminalGrowthMetric.reason) diagnostics.push(realTerminalGrowthMetric.reason);
  if (realFcffConversion.reason) diagnostics.push(realFcffConversion.reason);
  if (realFcfeConversion.reason) diagnostics.push(realFcfeConversion.reason);

  const annualRows = statements.rows.map((row, index) => ({
    year: row.year,
    calendarYear: row.calendarYear,
    revenue: row.revenue,
    ebitda: row.ebitda,
    ebit: row.ebit,
    cashTax: row.tax,
    depreciation: row.depreciation,
    capex: row.capex,
    changeInWorkingCapital: row.changeInWorkingCapital,
    fcff: fcffByYear[index] ?? 0,
    netDebtFlow: row.debtDrawdown - row.principalRepayment,
    debtDrawdown: row.debtDrawdown,
    principalRepayment: row.principalRepayment,
    fcfe: fcfeByYear[index] ?? 0,
    discountFactor: selectedDiscountRate > -1 && Number.isFinite(selectedDiscountRate) ? 1 / (1 + selectedDiscountRate) ** row.year : 0,
    discountedFcff: discountedFcffByYear[index] ?? 0,
    discountedFcfe: discountedFcfeByYear[index] ?? 0,
    cumulativeFcff: cumulativeFcff[index] ?? 0,
    cumulativeDiscountedFcff: cumulativeSeries(discountedFcffByYear)[index] ?? 0,
    cumulativeFcfe: cumulativeFcfe[index] ?? 0,
    cumulativeDiscountedFcfe: cumulativeSeries(discountedFcfeByYear)[index] ?? 0,
  }));

  const yearOne = annualRows[1] ?? annualRows[0];
  const presentValueFcff = sum(discountedFcffByYear) + discountedTerminalValue;
  const presentValueFcfe = sum(discountedFcfeByYear) + discountedTerminalValueFcfe;
  const presentValueCapex = annualRows.reduce((total, row) => total + row.capex * row.discountFactor, 0);
  const presentValueOperatingCashFlows = presentValueFcff + presentValueCapex;
  const terminalValueShare = safeDivide(Math.abs(discountedTerminalValue), Math.abs(presentValueFcff));
  const dscrValues = statements.rows.map((row) => row.dscr).filter((value): value is number => value !== null && Number.isFinite(value));
  const minimumDscr = dscrValues.length ? Math.min(...dscrValues) : null;
  const activeDebtInstruments = scenario.assumptions.financing.instruments?.filter((instrument) => instrument.active && instrument.amount > 0) ?? [];
  const totalDebtFunding = activeDebtInstruments.length
    ? sum(activeDebtInstruments.map((instrument) => instrument.amount))
    : scenario.assumptions.financing.longTermDebt + scenario.assumptions.financing.shortTermDebt;
  const equityFunding = scenario.assumptions.financing.equity;
  const totalFunding = totalDebtFunding + equityFunding;
  const debtWeight = safeDivide(totalDebtFunding, totalFunding);
  const equityWeight = safeDivide(equityFunding, totalFunding);
  const preTaxCostOfDebt = totalDebtFunding > 0
    ? activeDebtInstruments.length
      ? safeDivide(sum(activeDebtInstruments.map((instrument) => instrument.amount * instrument.annualRate)), totalDebtFunding)
      : scenario.assumptions.financing.interestRate
    : null;
  const taxRate = scenario.assumptions.macro.corporateTaxRate || scenario.assumptions.macro.incomeTaxRate;
  const afterTaxCostOfDebt = preTaxCostOfDebt === null ? null : preTaxCostOfDebt * (1 - taxRate);
  const costOfEquityCandidate = Number.isFinite(scenario.assumptions.macro.costOfCapital)
    ? scenario.assumptions.macro.costOfCapital
    : scenario.assumptions.macro.opportunityCostOfCapital;
  const costOfEquity = Number.isFinite(costOfEquityCandidate) ? costOfEquityCandidate : null;
  const realCostOfEquityMetric = costOfEquity === null
    ? { value: null }
    : calculateRealRate(costOfEquity, inflationRate);
  const realCostOfEquity = realCostOfEquityMetric.value;
  const appliedCostOfEquity = useRealBasis ? realCostOfEquity : costOfEquity;
  const impliedWacc = debtWeight !== null && equityWeight !== null && afterTaxCostOfDebt !== null && costOfEquity !== null
    ? debtWeight * afterTaxCostOfDebt + equityWeight * costOfEquity
    : null;
  const terminalWarnings: string[] = [];
  const terminalValid = Number.isFinite(selectedDiscountRate) && selectedDiscountRate > selectedTerminalGrowthRate;
  if (!terminalValid) terminalWarnings.push("نرخ رشد پایانی باید از نرخ تنزیل همان مبنا کمتر باشد.");
  if (terminalValueShare !== null && terminalValueShare > 0.6) terminalWarnings.push("سهم ارزش پایانی از ارزش کل بالاست و تصمیم باید به مفروضات رشد پایانی حساس تلقی شود.");
  const sourceReferences: ModelSourceReference[] = [
    { id: "financial-statements", label: "جریان‌های FCFF و FCFE", value: "سال‌های ۰ تا افق مدل", unit: "text", sourceLabel: "از تب صورت‌های مالی", sourceModule: "FinancialStatements16", editHref: "../financial-statements", editLabel: "مشاهده صورت‌ها" },
    { id: "financing", label: "دریافت و بازپرداخت بدهی", value: totalDebtFunding, unit: "money", sourceLabel: "از تب تأمین مالی", sourceModule: "Financing14", editHref: "../financing", editLabel: "مشاهده تأمین مالی" },
    { id: "capex", label: "CAPEX و استهلاک", value: presentValueCapex, unit: "money", sourceLabel: "از تب CAPEX", sourceModule: "Capex12", editHref: "../capex", editLabel: "مشاهده CAPEX" },
    { id: "working-capital", label: "تغییرات سرمایه در گردش", value: yearOne.changeInWorkingCapital, unit: "money", sourceLabel: "از تب سرمایه در گردش", sourceModule: "WorkingCapital13", editHref: "../working-capital", editLabel: "مشاهده سرمایه در گردش" },
    { id: "macro", label: "تورم، مبنای محاسبه و نرخ تنزیل", value: selectedDiscountRate, unit: "percent", sourceLabel: "از تب مفروضات کلان و DCF", sourceModule: "MarcoAssumptions05 / DCF-Valuation17", editHref: "../macro", editLabel: "مشاهده مفروضات کلان" },
    { id: "tax", label: "مالیات نقدی و مشوق‌ها", value: yearOne.cashTax, unit: "money", sourceLabel: "از تب مالیات و استهلاک", sourceModule: "TaxDepreciation15", editHref: "../financial-statements", editLabel: "مشاهده اثر مالیات" },
  ];
  const fcffBridge: CashFlowBridgeLine[] = [
    { id: "ebit", label: "EBIT", value: yearOne.ebit, formulaSign: "=", sourceLabel: "صورت سود و زیان" },
    { id: "tax", label: "مالیات نقدی بر عملیات", value: yearOne.cashTax, formulaSign: "-", sourceLabel: "موتور مالیات" },
    { id: "depreciation", label: "استهلاک", value: yearOne.depreciation, formulaSign: "+", sourceLabel: "CAPEX / استهلاک" },
    { id: "capex", label: "CAPEX", value: yearOne.capex, formulaSign: "-", sourceLabel: "برنامه سرمایه‌گذاری" },
    { id: "nwc", label: "تغییر سرمایه در گردش", value: yearOne.changeInWorkingCapital, formulaSign: "-", sourceLabel: "سرمایه در گردش" },
    { id: "fcff", label: "جریان نقد آزاد شرکت (FCFF)", value: yearOne.fcff, formulaSign: "=", sourceLabel: "خروجی DCF" },
  ];
  const fcfeBridge: CashFlowBridgeLine[] = [
    { id: "net-profit", label: "سود خالص", value: statements.rows[1]?.netProfit ?? 0, formulaSign: "=", sourceLabel: "صورت سود و زیان" },
    { id: "depreciation", label: "استهلاک", value: yearOne.depreciation, formulaSign: "+", sourceLabel: "CAPEX / استهلاک" },
    { id: "capex", label: "CAPEX", value: yearOne.capex, formulaSign: "-", sourceLabel: "برنامه سرمایه‌گذاری" },
    { id: "nwc", label: "تغییر سرمایه در گردش", value: yearOne.changeInWorkingCapital, formulaSign: "-", sourceLabel: "سرمایه در گردش" },
    { id: "debt-drawdown", label: "دریافت بدهی", value: yearOne.debtDrawdown, formulaSign: "+", sourceLabel: "تأمین مالی" },
    { id: "principal", label: "بازپرداخت اصل بدهی", value: yearOne.principalRepayment, formulaSign: "-", sourceLabel: "برنامه بدهی" },
    { id: "fcfe", label: "جریان نقد آزاد سهامدار (FCFE)", value: yearOne.fcfe, formulaSign: "=", sourceLabel: "خروجی DCF" },
  ];
  const summaryDiagnostics: DcfDiagnostic[] = [];
  const addSummaryDiagnostic = (diagnostic: DcfDiagnostic) => {
    summaryDiagnostics.push(diagnostic);
  };
  const finiteSeries = [
    ...fcffByYear,
    ...fcfeByYear,
    ...discountedFcffByYear,
    ...discountedFcfeByYear,
    terminalValue,
    discountedTerminalValue,
    presentValueFcff,
    presentValueFcfe,
  ].every((value) => Number.isFinite(value));
  addSummaryDiagnostic({
    id: "finite-dcf-values",
    severity: finiteSeries ? "info" : "error",
    label: "کنترل عددی DCF",
    message: finiteSeries ? "همه جریان‌ها و ارزش‌های تنزیلی مقدار متناهی دارند." : "در خروجی DCF مقدار نامتناهی یا نامعتبر دیده شد.",
    evidence: "FCFF، FCFE، ضرایب تنزیل و ارزش پایانی بررسی شدند.",
  });
  addSummaryDiagnostic({
    id: "financing-treatment",
    severity: "info",
    label: "تفکیک FCFF و FCFE",
    message: "FCFF مستقل از دریافت و بازپرداخت بدهی محاسبه می‌شود و اثر بدهی فقط در FCFE می‌آید.",
    evidence: "ستون خالص بدهی جدا از FCFF در جدول سالانه گزارش می‌شود.",
  });
  addSummaryDiagnostic({
    id: "discount-basis",
    severity: selectedDiscountRate > -1 && Number.isFinite(selectedDiscountRate) ? "info" : "error",
    label: "سازگاری نرخ و جریان نقد",
    message: useRealBasis ? "جریان نقد واقعی با نرخ تنزیل واقعی تنزیل شده است." : "جریان نقد اسمی با نرخ تنزیل اسمی تنزیل شده است.",
    evidence: `مبنای فعال: ${macro.calculationBasis}`,
  });
  addSummaryDiagnostic({
    id: "terminal-growth",
    severity: terminalValid ? "info" : "error",
    label: "کنترل ارزش پایانی",
    message: terminalValid ? "نرخ رشد پایانی از نرخ تنزیل کمتر است." : "ارزش پایانی با نرخ رشد فعلی قابل اتکا نیست.",
    evidence: `g=${selectedTerminalGrowthRate}; discount=${selectedDiscountRate}`,
  });
  if (terminalValueShare !== null && terminalValueShare > 0.6) {
    addSummaryDiagnostic({
      id: "terminal-share",
      severity: "warning",
      label: "اتکای بالا به ارزش پایانی",
      message: "بخش بزرگی از ارزش پروژه از ارزش پایانی می‌آید.",
      evidence: `سهم ارزش پایانی: ${terminalValueShare}`,
    });
  }
  if (paybackMetric.status !== "ok") {
    addSummaryDiagnostic({
      id: "payback-unavailable",
      severity: "warning",
      label: "بازگشت سرمایه",
      message: paybackMetric.reason ?? "دوره بازگشت سرمایه قابل محاسبه نیست.",
      evidence: "جریان نقد تجمعی در افق مدل بررسی شد.",
    });
  }
  if (irr !== null) {
    const npvAtIrr = fcffByYear.reduce((total, cashFlow, year) => total + cashFlow / (1 + irr) ** year, 0);
    addSummaryDiagnostic({
      id: "npv-at-irr",
      severity: Math.abs(npvAtIrr) <= 1 ? "info" : "warning",
      label: "کنترل IRR",
      message: Math.abs(npvAtIrr) <= 1 ? "NPV سری خام FCFF در نرخ IRR تقریبا صفر است." : "NPV در نرخ IRR به صفر نزدیک نیست و باید سری جریان نقد بررسی شود.",
      evidence: `NPV@IRR=${npvAtIrr}`,
    });
  }
  diagnostics.forEach((message, index) => {
    addSummaryDiagnostic({
      id: `cash-flow-diagnostic-${index}`,
      severity: message.includes("NPV منفی") || message.includes("قابل محاسبه نیست") ? "warning" : "info",
      label: "هشدار جریان نقد",
      message,
      evidence: "خروجی موتور DCF",
    });
  });
  const irrBelowDiscount = irr !== null && irr < selectedDiscountRate;
  const decisionStatus: "acceptable" | "review" | "critical" =
    npv >= 0 && !irrBelowDiscount && terminalValid && !(terminalValueShare !== null && terminalValueShare > 0.6)
      ? "acceptable"
      : npv < 0 || irrBelowDiscount || !terminalValid
        ? "critical"
        : "review";
  const decisionLabel = decisionStatus === "acceptable" ? "قابل قبول" : decisionStatus === "critical" ? "بحرانی" : "نیازمند بازنگری";
  const decisionNarrative = npv < 0
    ? "ارزش فعلی خالص پروژه در مفروضات فعلی منفی است؛ یعنی جریان‌های نقدی تنزیل‌شده، سرمایه‌گذاری و ریسک پروژه را پوشش نمی‌دهند."
    : irrBelowDiscount
      ? "اگرچه بخشی از جریان‌ها مثبت است، نرخ بازده داخلی از نرخ تنزیل مبنا کمتر است و پروژه حاشیه بازده کافی ندارد."
      : terminalValueShare !== null && terminalValueShare > 0.6
        ? "نتیجه پروژه قابل بررسی است اما اتکا به ارزش پایانی بالاست؛ نرخ رشد پایانی باید با احتیاط مستند شود."
        : "در مفروضات فعلی، شاخص‌های اصلی DCF با نرخ تنزیل و مبنای جریان نقد سازگار هستند.";
  const summary = {
    decisionStatus,
    decisionLabel,
    decisionNarrative,
    basisLabel: useRealBasis ? "مبنای واقعی" : "مبنای اسمی",
    presentValueFcff,
    presentValueFcfe,
    presentValueCapex,
    presentValueOperatingCashFlows,
    enterpriseValue: presentValueFcff,
    equityValue: presentValueFcfe,
    terminalValueShare,
    minimumDscr,
    sourceReferences,
    fcffBridge,
    fcfeBridge,
    discountRateBuildUp: {
      calculationBasis: macro.calculationBasis,
      nominalWacc: nominalDiscountRate,
      realWacc: realDiscountRate,
      appliedDiscountRate: selectedDiscountRate,
      inflationRate,
      costOfEquity,
      nominalCostOfEquity: costOfEquity,
      realCostOfEquity,
      appliedCostOfEquity,
      preTaxCostOfDebt,
      afterTaxCostOfDebt,
      taxRate,
      debtWeight,
      equityWeight,
      impliedWacc,
      riskFreeRate: null,
      marketRiskPremium: scenario.assumptions.macro.industryRiskPremium,
      beta: null,
      countryRiskPremium: scenario.assumptions.macro.countryRiskPremium,
      projectRiskPremium: scenario.assumptions.macro.projectRiskPremium,
    },
    terminalDiagnostic: {
      method: terminalValid ? "gordon-growth" as const : "not-computed" as const,
      terminalGrowthRate: selectedTerminalGrowthRate,
      terminalDiscountRate: selectedDiscountRate,
      terminalFcff: selectedFcff.cashFlows.at(-1) ?? 0,
      terminalValue,
      discountedTerminalValue,
      enterpriseValue: presentValueFcff,
      terminalValueShare,
      valid: terminalValid,
      warnings: terminalWarnings,
    },
    diagnostics: summaryDiagnostics,
  };

  traces.push(
    trace(
      "valuation.npv",
      "NPV اسمی/واقعی و FCFE",
      "NPV = Sum(Cash Flow / (1 + Discount Rate)^year) + Terminal Value / (1 + Discount Rate)^horizon; FCFE = Net Profit + Depreciation - CAPEX - Delta NWC + Debt Drawdown - Principal",
      [
        { label: "نرخ تنزیل اسمی", value: nominalDiscountRate, source: sourceRef("discountRate") },
        { label: "نرخ تنزیل واقعی", value: realDiscountRate, source: "MarcoAssumptions05!V10,V19,V61" },
        { label: "تورم عمومی", value: inflationRate, source: "MarcoAssumptions05!V19" },
        { label: "ارزش نهایی FCFF", value: terminalValue, source: "DCF-Valuation17!R34" },
        { label: "مجموع FCFF تنزیل‌شده", value: sum(discountedFcffByYear), source: "DCF-Valuation17!P54:P74" },
      ],
      npv,
      "npv",
    ),
  );

  return {
    annualRows,
    summary,
    fcffByYear,
    fcfeByYear,
    nominalFcffByYear,
    realFcffByYear,
    nominalFcfeByYear,
    realFcfeByYear,
    discountedFcffByYear,
    discountedFcfeByYear,
    discountedNominalFcffByYear: nominalFcff.discountedByYear,
    discountedRealFcffByYear: realFcff.discountedByYear,
    discountedNominalFcfeByYear: nominalFcfe.discountedByYear,
    discountedRealFcfeByYear: realFcfe.discountedByYear,
    cumulativeFcff,
    cumulativeFcfe,
    cumulativeNominalFcff: nominalFcff.cumulative,
    cumulativeRealFcff: realFcff.cumulative,
    cumulativeNominalFcfe: nominalFcfe.cumulative,
    cumulativeRealFcfe: realFcfe.cumulative,
    nominalDiscountRate,
    realDiscountRate,
    appliedDiscountRate: selectedDiscountRate,
    inflationRate,
    calculationBasis: macro.calculationBasis,
    terminalValue,
    discountedTerminalValue,
    terminalValueFcfe,
    discountedTerminalValueFcfe,
    nominalFcffNpv: nominalFcff.npvMetric.value ?? nominalFcff.npv,
    realFcffNpv: realFcff.npvMetric.value,
    nominalFcfeNpv: nominalFcfe.npvMetric.value ?? nominalFcfe.npv,
    realFcfeNpv: realFcfe.npvMetric.value,
    fcffNpv: selectedFcff.npvMetric.value ?? selectedFcff.npv,
    fcfeNpv: selectedFcfe.npvMetric.value ?? selectedFcfe.npv,
    fcffIrr: selectedFcff.irrMetric.value,
    fcfeIrr: selectedFcfe.irrMetric.value,
    fcffMirr: selectedFcff.mirrMetric.value,
    fcfeMirr: selectedFcfe.mirrMetric.value,
    fcffPayback: selectedFcff.paybackMetric.value,
    fcfePayback: selectedFcfe.paybackMetric.value,
    npv,
    irr,
    mirr,
    payback,
    discountedPayback,
    diagnostics: Array.from(new Set(diagnostics)),
    metrics: {
      npv: selectedFcff.npvMetric,
      irr: irrMetric,
      mirr: mirrMetric,
      payback: paybackMetric,
      discountedPayback: discountedPaybackMetric,
      fcffNominalNpv: nominalFcff.npvMetric,
      fcffRealNpv: realFcff.npvMetric,
      fcfeNominalNpv: nominalFcfe.npvMetric,
      fcfeRealNpv: realFcfe.npvMetric,
      fcffIrr: selectedFcff.irrMetric,
      fcfeIrr: selectedFcfe.irrMetric,
    },
  };
};

const calculateProfessionalEconomicAnalysis = (
  project: Project,
  scenario: Scenario,
  revenue: ReturnType<typeof calculateRevenue>,
  directCosts: ReturnType<typeof calculateDirectCosts>,
  opex: ReturnType<typeof calculateOpex>,
  capex: ReturnType<typeof calculateCapex>,
  construction: ReturnType<typeof calculateConstructionCashFlow>,
  workingCapital: ReturnType<typeof calculateWorkingCapital>,
  valuation: ReturnType<typeof calculateValuation>,
) => {
  const financialItems: EconomicFinancialItem[] = [];
  const addItem = (
    year: number,
    sourceId: string,
    label: string,
    sourceModule: string,
    kind: EconomicFinancialItem["kind"],
    financialValue: number,
    defaultClassification: EconomicFinancialItem["defaultClassification"],
  ) => {
    const value = Math.max(0, Number.isFinite(financialValue) ? financialValue : 0);
    if (value <= 0) return;
    financialItems.push({
      id: `${sourceId}:${year}`,
      sourceId,
      label,
      sourceModule,
      year,
      calendarYear: project.baseYear + year,
      kind,
      financialValue: value,
      defaultClassification,
    });
  };

  const constructionByYear = construction.rows.reduce<Record<number, number>>((map, row) => {
    const year = clamp(row.modelYear ?? (row.calendarYear ?? project.baseYear) - project.baseYear, 0, project.modelHorizonYears);
    const resourceCost =
      Math.max(0, row.adjustedCapex) +
      sum(Object.values(row.costByItem ?? {}).map((value) => Math.max(0, value))) +
      Math.max(0, row.delayCost);
    map[year] = (map[year] ?? 0) + resourceCost;
    return map;
  }, {});
  const constructionYears = Object.keys(constructionByYear).map(Number);
  const lastConstructionYear = constructionYears.length ? Math.max(...constructionYears) : -1;
  const importedInvestmentShare = capex.totalCapex > 0 ? clamp(capex.fxCapex / capex.totalCapex, 0, 1) : 0;
  Object.entries(constructionByYear).forEach(([yearText, value]) => {
    const year = Number(yearText);
    addItem(year, "investment-imported", "سرمایه‌گذاری و هزینه ساخت وارداتی", "ConstructionCashFlow / Capex12", "cost", value * importedInvestmentShare, "imported-tradable");
    addItem(year, "investment-domestic", "سرمایه‌گذاری و هزینه ساخت داخلی", "ConstructionCashFlow / Capex12", "cost", value * (1 - importedInvestmentShare), "non-tradable-domestic");
  });
  capex.annual
    .filter((row) => row.year > lastConstructionYear && row.cashCapex > 0)
    .forEach((row) => {
      addItem(row.year, "investment-imported", "CAPEX جایگزینی وارداتی", "Capex12", "cost", row.cashCapex * importedInvestmentShare, "imported-tradable");
      addItem(row.year, "investment-domestic", "CAPEX جایگزینی داخلی", "Capex12", "cost", row.cashCapex * (1 - importedInvestmentShare), "non-tradable-domestic");
    });

  const cashOpexItems = scenario.assumptions.opex.items.filter((item) => item.cashOrNonCash === "نقدی");
  const baseCashOpex = sum(cashOpexItems.map((item) => Math.max(0, item.baseYearAmount)));
  const baseTransferOpex = sum(cashOpexItems
    .filter((item) => item.group === "مالی و بانکی" || /مالیات|عوارض|بهره|بانکی|کارمزد/.test(item.name))
    .map((item) => Math.max(0, item.baseYearAmount)));
  const baseLaborOpex = sum(cashOpexItems
    .filter((item) => item.group === "منابع انسانی")
    .map((item) => Math.max(0, item.baseYearAmount)));

  range(project.modelHorizonYears).forEach((year) => {
    const revenueRow = byYear(revenue.rows, year);
    const directRow = byYear(directCosts.rows, year);
    const opexRow = byYear(opex.rows, year);
    const workingCapitalRow = byYear(workingCapital.rows, year);
    addItem(year, "output", "ارزش مالی محصول/خدمت", "MarketDemand08 / FinancialStatements16", "benefit", revenueRow?.revenue ?? 0, scenario.assumptions.economic.outputClassification);

    const directTotal = Math.max(0, directRow?.totalCost ?? 0);
    const importedDirect = directTotal * clamp(directRow?.fxShare ?? 0, 0, 1);
    let directDomesticRemaining = Math.max(0, directTotal - importedDirect);
    const directUnitCost = Math.max(EPSILON, directRow?.unitCost ?? 0);
    const laborDirect = Math.min(
      directDomesticRemaining,
      directTotal * clamp(scenario.assumptions.directCosts.directLaborUnitCost / directUnitCost, 0, 1),
    );
    directDomesticRemaining -= laborDirect;
    const energyDirect = Math.min(
      directDomesticRemaining,
      directTotal * clamp(scenario.assumptions.directCosts.energyUnitCost / directUnitCost, 0, 1),
    );
    directDomesticRemaining -= energyDirect;
    addItem(year, "direct-imported", "مواد و خدمات مستقیم وارداتی", "COGS-DirectCost10", "cost", importedDirect, "imported-tradable");
    addItem(year, "direct-labor", "نیروی کار مستقیم", "COGS-DirectCost10", "cost", laborDirect, "unskilled-labor");
    addItem(year, "direct-energy", "انرژی مستقیم", "COGS-DirectCost10", "cost", energyDirect, "energy");
    addItem(year, "direct-domestic", "سایر هزینه‌های مستقیم داخلی", "COGS-DirectCost10", "cost", directDomesticRemaining, "non-tradable-domestic");

    const cashOpex = Math.max(0, opexRow?.cashOpex ?? 0);
    let opexRemaining = cashOpex;
    const transferOpex = Math.min(opexRemaining, cashOpex * (safeDivide(baseTransferOpex, baseCashOpex) ?? 0));
    opexRemaining -= transferOpex;
    const importedOpex = Math.min(opexRemaining, Math.max(0, opexRow?.fxOpex ?? 0));
    opexRemaining -= importedOpex;
    const laborOpex = Math.min(opexRemaining, cashOpex * (safeDivide(baseLaborOpex, baseCashOpex) ?? 0));
    opexRemaining -= laborOpex;
    addItem(year, "opex-transfer", "مالیات، عوارض و خدمات مالی انتقالی", "Opex-Indirect11", "cost", transferOpex, "tax-transfer");
    addItem(year, "opex-imported", "OPEX وارداتی", "Opex-Indirect11", "cost", importedOpex, "imported-tradable");
    addItem(year, "opex-labor", "نیروی کار غیرمستقیم", "Opex-Indirect11", "cost", laborOpex, "skilled-labor");
    addItem(year, "opex-domestic", "سایر OPEX نقدی داخلی", "Opex-Indirect11", "cost", opexRemaining, "non-tradable-domestic");

    const workingCapitalChange = workingCapitalRow?.changeInWorkingCapital ?? 0;
    if (workingCapitalChange > 0) {
      addItem(year, "working-capital-increase", "افزایش سرمایه در گردش", "WorkingCapital13", "cost", workingCapitalChange, "non-tradable-domestic");
    } else if (workingCapitalChange < 0) {
      addItem(year, "working-capital-recovery", "بازیافت سرمایه در گردش", "WorkingCapital13", "benefit", -workingCapitalChange, "non-tradable-domestic");
    }
  });

  const residualValue = sum(scenario.assumptions.capex.items.map((item) =>
    Math.max(0, item.accountingSalvageValue || item.salvageValue)));
  addItem(project.modelHorizonYears, "residual-value", "ارزش باقیمانده اقتصادی صریح", "Capex12", "benefit", residualValue, "non-tradable-domestic");

  return calculateEconomicAnalysis({
    horizonYears: project.modelHorizonYears,
    baseYear: project.baseYear,
    assumptions: scenario.assumptions.economic,
    macroCalculationBasis: scenario.assumptions.macro.calculationBasis,
    baseFinancialFxRate: scenario.assumptions.macro.baseFxRate,
    financialNpv: valuation.npv,
    financialItems,
    sourceReferences: [
      { id: "financial-statements", label: "درآمد، COGS و OPEX سالانه", value: revenue.rows[1]?.revenue ?? 0, unit: "money", sourceLabel: "خروجی سالانه canonical", sourceModule: "FinancialStatements16", editHref: "../financial-statements", editLabel: "مشاهده صورت‌ها" },
      { id: "construction", label: "برنامه واقعی ساخت", value: sum(Object.values(constructionByYear)), unit: "money", sourceLabel: "تجمیع ماه‌های ساخت در سال اقتصادی", sourceModule: "ConstructionCashFlow", editHref: "../construction-cashflow", editLabel: "مشاهده جریان ساخت" },
      { id: "working-capital", label: "تغییر و بازیافت سرمایه در گردش", value: workingCapital.initialWorkingCapital, unit: "money", sourceLabel: "تغییر مانده سالانه", sourceModule: "WorkingCapital13", editHref: "../working-capital", editLabel: "مشاهده سرمایه در گردش" },
      { id: "macro", label: "مبنای قیمت و نرخ ارز پایه", value: scenario.assumptions.macro.baseFxRate, unit: "money", sourceLabel: "مفروضات کلان سناریوی فعال", sourceModule: "MarcoAssumptions05", editHref: "../macro", editLabel: "مشاهده مفروضات کلان" },
    ],
  });
};

const runCoreCalculation = (project: Project, scenario: Scenario, includeRisk = true): Omit<ScenarioOutputs, "monteCarlo"> => {
  const traces: FormulaTrace[] = [];
  const calculationLog: string[] = [];
  calculationLog.push("شروع محاسبات سناریو طبق ترتیب workbook.");
  const years = range(project.modelHorizonYears);
  const capacity = calculateCapacity(project, scenario, traces);
  const revenue = calculateRevenue(project, scenario, capacity, traces);
  const directCosts = calculateDirectCosts(project, scenario, revenue, capacity, traces);
  const opex = calculateOpex(project, scenario, traces, revenue.rows, capacity.rows);
  const capex = calculateCapex(project, scenario, traces);
  const construction = calculateConstructionCashFlow(project, scenario, capex, traces);
  const workingCapital = calculateWorkingCapital(project, scenario, revenue, directCosts, opex, traces);
  const financingInitial = calculateFinancing(project, scenario, capex, traces);
  const statementsResult = calculateStatements(project, scenario, revenue, directCosts, opex, capex, workingCapital, financingInitial, traces);
  const valuation = calculateValuation(project, scenario, statementsResult.statements, traces);
  const economic = calculateProfessionalEconomicAnalysis(
    project,
    scenario,
    revenue,
    directCosts,
    opex,
    capex,
    construction,
    workingCapital,
    valuation,
  );
  const dashboards = calculateDashboards(scenario, statementsResult.statements.rows, statementsResult.financing, valuation, construction);
  const validations = validateScenario(project, scenario, statementsResult.statements.rows, statementsResult.financing, valuation, construction);
  const baseOutputs = {
    generatedAt: project.updatedAt,
    years,
    capacity,
    revenue,
    directCosts,
    opex,
    capex,
    workingCapital,
    financing: statementsResult.financing,
    construction,
    tax: statementsResult.tax,
    statements: statementsResult.statements,
    valuation,
    economic,
    sensitivity: emptySensitivity(),
    dashboards,
    validations,
    traces,
    calculationLog,
  };
  const sensitivity = includeRisk ? calculateSensitivityAnalysis(project, scenario, baseOutputs, runCoreCalculation) : emptySensitivity();
  const phaseOneTraces = [
    ...validateProjectSetup(project.setup).trace,
    ...validateMacroAssumptions(scenario.assumptions.macro).trace,
    ...validateIndustryTemplate(scenario.assumptions.industry).trace,
    ...validateMarketDemand(scenario.assumptions.market, {
      supplyLimit: scenario.assumptions.market.supplyConstraintValue,
    }).trace,
  ];
  traces.push(...phaseOneTraces);
  calculationLog.push("محاسبات صورت‌های مالی، DCF، validation و trace کامل شد.");

  return {
    generatedAt: project.updatedAt,
    years,
    capacity,
    revenue,
    directCosts,
    opex,
    capex,
    workingCapital,
    financing: statementsResult.financing,
    construction,
    tax: statementsResult.tax,
    statements: statementsResult.statements,
    valuation,
    economic,
    sensitivity,
    dashboards,
    validations,
    traces,
    calculationLog,
  };
};

const calculateDashboards = (
  scenario: Scenario,
  rows: YearlyRow[],
  financing: ReturnType<typeof calculateFinancing>,
  valuation: ReturnType<typeof calculateValuation>,
  construction: ReturnType<typeof calculateConstructionCashFlow>,
) => {
  const profitableYears = rows.filter((row) => row.netProfit > 0).length;
  const balanceOk = rows.every((row) => row.balanceStatus === "balanced");
  const minDscr = financing.minimumDscr ?? 0;
  const bankabilityScore = clamp(
    (minDscr / scenario.assumptions.financing.targetDscr) * 45 +
      (valuation.npv > 0 ? 25 : 0) +
      (construction.cashCrunchMonths === 0 ? 15 : 5) +
      (balanceOk ? 15 : 5),
    0,
    100,
  );
  const projectHealthScore = clamp(
    (profitableYears / Math.max(1, rows.length - 1)) * 35 +
      (valuation.payback !== null ? 25 : 5) +
      (valuation.npv > 0 ? 25 : 5) +
      (balanceOk ? 15 : 5),
    0,
    100,
  );
  const investmentReadinessScore = clamp((projectHealthScore + bankabilityScore) / 2, 0, 100);
  const recommendation =
    bankabilityScore >= 70 ? "قابل ارائه به بانک" : bankabilityScore >= 45 ? "قابل ارائه با اصلاحات" : "غیرقابل ارائه";
  const aiReview = [
    valuation.npv >= 0
      ? "NPV مثبت است و ارزش تنزیل‌شده جریان نقد آزاد از سرمایه‌گذاری اولیه عبور می‌کند."
      : "NPV منفی است؛ مهم‌ترین فشار از ترکیب CAPEX، بدهی بزرگ و جریان نقد عملیاتی کم می‌آید.",
    minDscr >= scenario.assumptions.financing.targetDscr
      ? "DSCR از حد هدف بانک بالاتر است."
      : "DSCR کمتر از سطح هدف بانک است و ساختار وام یا آورده باید اصلاح شود.",
    construction.cashCrunchMonths === 0
      ? "زمان‌بندی تزریق منابع در فاز ساخت Cash Crunch ایجاد نمی‌کند."
      : "در فاز ساخت ریسک کمبود نقدینگی وجود دارد و خط اعتباری/زمان‌بندی منابع باید بازبینی شود.",
  ];
  return { projectHealthScore, bankabilityScore, investmentReadinessScore, recommendation, aiReview };
};

const validateScenario = (
  project: Project,
  scenario: Scenario,
  rows: YearlyRow[],
  financing: ReturnType<typeof calculateFinancing>,
  valuation: ReturnType<typeof calculateValuation>,
  constructionOutput: ReturnType<typeof calculateConstructionCashFlow>,
) => {
  const setupValidation = validateProjectSetup(project.setup);
  const macroValidation = validateMacroAssumptions(scenario.assumptions.macro);
  const industryValidation = validateIndustryTemplate(scenario.assumptions.industry);
  const marketValidation = validateMarketDemand(scenario.assumptions.market, {
    supplyLimit: scenario.assumptions.market.supplyConstraintValue,
  });
  const capacityValidation = calculateCapacityProduction(scenario.assumptions.capacity);
  const directValidation = calculateDirectUnitCost(
    scenario.assumptions.directCosts,
    scenario.assumptions.macro,
    scenario.assumptions.market.baseSalesPrice,
  );
  const opexValidation = calculateOpexSchedule(
    scenario.assumptions.opex,
    rows.map((row) => row.revenue),
    rows.map((row) => row.salesVolume),
  );
  const capexValidation = calculateCapexSummary(scenario.assumptions.capex.items, scenario.assumptions.macro);
  const issues: ValidationIssue[] = [
    ...excelDiagnostics,
    ...setupValidation.errors,
    ...setupValidation.warnings,
    ...macroValidation.errors,
    ...macroValidation.warnings,
    ...industryValidation.errors,
    ...industryValidation.warnings,
    ...marketValidation.errors,
    ...marketValidation.warnings,
    ...capacityValidation.errors,
    ...capacityValidation.warnings,
    ...directValidation.errors,
    ...directValidation.warnings,
    ...opexValidation.errors,
    ...opexValidation.warnings,
    ...capexValidation.errors,
    ...capexValidation.warnings,
  ];
  const operation = new Date(project.operationStartDate);
  const constructionEnd = new Date(project.constructionStartDate);
  constructionEnd.setMonth(constructionEnd.getMonth() + project.constructionDurationMonths);
  if (operation < constructionEnd) {
    issues.push(
      issue(
        "dates.operation-before-construction-end",
        "error",
        "setup",
        "تاریخ بهره‌برداری قبل از پایان ساخت است.",
        "شروع بهره‌برداری یا مدت ساخت را اصلاح کنید.",
        "operationStartDate",
      ),
    );
  }
  const capexItem = scenario.assumptions.capex.items[0];
  const paymentSum = capexItem
    ? capexItem.prepaymentRate + capexItem.deliveryPaymentRate + capexItem.postInstallPaymentRate
    : null;
  if (paymentSum !== null && Math.abs(paymentSum - 1) > 0.0001) {
    issues.push(issue("capex.payment-sum", "error", "capex", "جمع درصدهای پرداخت CAPEX برابر ۱۰۰٪ نیست.", "درصدهای پرداخت را در جدول CAPEX اصلاح کنید.", "totalCapex"));
  }
  if (scenario.assumptions.financing.repaymentYears + scenario.assumptions.financing.gracePeriodYears > project.modelHorizonYears) {
    issues.push(issue("financing.repayment-after-horizon", "error", "financing", "مدت تنفس و بازپرداخت از افق مدل بلندتر است.", "افق مدل یا دوره وام را اصلاح کنید.", "repaymentYears"));
  }
  if (valuation.npv < 0) {
    issues.push(issue("valuation.negative-npv", "warning", "valuation", "NPV منفی است.", "قیمت فروش، CAPEX، ساختار بدهی و نرخ تنزیل را بررسی کنید.", "npv"));
  }
  if (valuation.irr === null) {
    issues.push(issue("valuation.irr-not-computable", "warning", "valuation", "IRR محاسبه‌پذیر نیست.", "جریان نقد خام سالانه را بررسی کنید؛ از مقدار 0 نمایشی استفاده نشده است.", "irr"));
  }
  const minDscr = financing.minimumDscr;
  if (minDscr !== null && minDscr < scenario.assumptions.financing.targetDscr) {
    issues.push(issue("financing.dscr-breach", "error", "financing", "DSCR کمتر از حداقل هدف بانک است.", "سهم آورده، نرخ/مدت وام یا دوره تنفس را اصلاح کنید.", "minDscr"));
  }
  if (constructionOutput.cashCrunchMonths > 0) {
    issues.push(issue("construction.cash-crunch", "warning", "construction-cashflow", "در فاز ساخت Cash Crunch رخ می‌دهد.", "زمان‌بندی تزریق منابع یا خط اعتباری توسعه را اصلاح کنید.", "constructionTotalOutflow"));
  }
  rows.forEach((row) => {
    if (row.balanceStatus === "out-of-balance") {
      issues.push({
        id: `statements.balance-${row.year}`,
        severity: "warning",
        module: "financial-statements",
        field: `year-${row.year}`,
        message: `ترازنامه در سال ${row.year} ناتراز است.`,
        recommendation: row.balanceDiagnostic ?? "جریان نقد، بدهی کوتاه‌مدت ضمنی، سرمایه در گردش و سیاست تقسیم سود را بازبینی کنید.",
        sourceSheet: "FinancialStatements16",
        sourceCell: `Q${78 + row.year}`,
      });
    }
  });
  return issues;
};

export const calculateScenario = (project: Project, scenario = activeScenario(project)): ScenarioOutputs => {
  const outputs = runCoreCalculation(project, scenario, true);
  return outputs;
};

export const calculateScenarioCore = (project: Project, scenario = activeScenario(project)) =>
  runCoreCalculation(project, scenario, false);

export const calculateMonteCarlo = (project: Project, scenario = activeScenario(project)) =>
  runMonteCarloSimulation(project, scenario, runCoreCalculation);

export const calculateMonteCarloAsync = (project: Project, scenario = activeScenario(project), options?: MonteCarloAsyncOptions) =>
  runMonteCarloSimulationAsync(project, scenario, runCoreCalculation, options);

export const calculateScenarioWithMonteCarlo = (project: Project, scenario = activeScenario(project)): ScenarioOutputs => {
  const outputs = calculateScenario(project, scenario);
  return { ...outputs, monteCarlo: calculateMonteCarlo(project, scenario) };
};
