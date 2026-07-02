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
  applySensitivityShockByName,
  calculateSensitivityAnalysis,
  emptySensitivity,
} from "@/lib/sensitivity-engine";
import type {
  CapexAssumptions,
  FinancingAssumptions,
  FormulaTrace,
  Project,
  Scenario,
  ScenarioOutputs,
  ValidationIssue,
  YearlyRow,
} from "@/lib/types";

const EPSILON = 1e-9;

const range = (end: number) => Array.from({ length: end + 1 }, (_, year) => year);

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

const cloneProject = (project: Project): Project => JSON.parse(JSON.stringify(project)) as Project;

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

const calculateEconomic = (project: Project, scenario: Scenario, statements: { rows: YearlyRow[] }, valuation: ReturnType<typeof calculateValuation>) => {
  const a = scenario.assumptions.economic;
  const year1 = byYear(statements.rows, 1);
  const revenueMarket = year1?.revenue ?? 0;
  const adjustedRevenue = (revenueMarket / (1 + scenario.assumptions.macro.vatRate)) * a.standardConversionFactor;
  const externalBenefits =
    a.directEmploymentBenefit +
    a.indirectEmploymentBenefit +
    a.pollutionReductionBenefit +
    a.technologyTransferBenefit +
    a.importSubstitutionBenefit +
    a.regionalDevelopmentBenefit;
  const externalCosts = Math.max(0, a.environmentalCost) + Math.max(0, a.infrastructurePressureCost);
  const economicCapex = Math.abs(valuation.nominalFcffByYear[0] ?? 0) * (1 + (a.shadowExchangeRateFactor - 1));
  const economicOpex = (year1?.opex ?? 0) * a.unskilledLaborShadowFactor;
  const economicCogs = (year1?.cogs ?? 0) * a.energyShadowFactor * a.shadowExchangeRateFactor;
  const annualBenefits = adjustedRevenue + externalBenefits;
  const annualCosts = economicCogs + economicOpex + externalCosts + economicCapex * a.capitalServiceChargeRate;
  const encf = annualBenefits - annualCosts;
  const presentValueBenefits = range(project.modelHorizonYears).slice(1).reduce(
    (total, year) => total + annualBenefits / (1 + a.economicDiscountRate) ** year,
    0,
  );
  const presentValueCosts = economicCapex + range(project.modelHorizonYears).slice(1).reduce(
    (total, year) => total + annualCosts / (1 + a.economicDiscountRate) ** year,
    0,
  );
  const enpv = presentValueBenefits - presentValueCosts;
  const eirr = calculateIrr([-economicCapex, ...range(project.modelHorizonYears).slice(1).map(() => encf)]);
  const ebcr = safeDivide(presentValueBenefits, presentValueCosts);
  const valueAdded = adjustedRevenue - economicCogs - economicOpex;
  return { encf, enpv, eirr, ebcr, valueAdded };
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
  const economic = calculateEconomic(project, scenario, statementsResult.statements, valuation);
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
  const paymentSum = capexItem.prepaymentRate + capexItem.deliveryPaymentRate + capexItem.postInstallPaymentRate;
  if (Math.abs(paymentSum - 1) > 0.0001) {
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

const mulberry32 = (seed: number) => {
  let state = seed;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
};

const normalSample = (random: () => number, low: number, mid: number, high: number) => {
  const u1 = Math.max(random(), EPSILON);
  const u2 = random();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return clamp(mid + z * ((high - low) / 6), low, high);
};

const triangularSample = (random: () => number, low: number, mid: number, high: number) => {
  const u = random();
  const c = (mid - low) / (high - low);
  if (u < c) return low + Math.sqrt(u * (high - low) * (mid - low));
  return high - Math.sqrt((1 - u) * (high - low) * (high - mid));
};

const sampleVariable = (random: () => number, low: number, mid: number, high: number, distribution: string) => {
  if (distribution === "مثلثی") return triangularSample(random, low, mid, high);
  if (distribution === "یکنواخت") return low + random() * (high - low);
  return normalSample(random, low, mid, high);
};

const percentile = (values: number[], p: number) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = clamp((sorted.length - 1) * p, 0, sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
};

const histogram = (values: number[], bins = 18) => {
  if (!values.length) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const width = (max - min || 1) / bins;
  const counts = Array.from({ length: bins }, (_, index) => ({ bin: min + width * index, count: 0 }));
  values.forEach((value) => {
    const index = Math.min(bins - 1, Math.floor((value - min) / width));
    counts[index].count += 1;
  });
  return counts;
};

export const calculateMonteCarlo = (project: Project, scenario = activeScenario(project)) => {
  const random = mulberry32(scenario.assumptions.monteCarlo.seed);
  const iterations = clamp(Math.round(scenario.assumptions.monteCarlo.iterations), 50, 3000);
  const baseOutputs = runCoreCalculation(project, scenario, false);
  const rows = [];
  for (let iteration = 1; iteration <= iterations; iteration += 1) {
    let shocked = cloneProject(project);
    scenario.assumptions.monteCarlo.variables.filter((variable) => variable.enabled).forEach((variable) => {
      const shock = sampleVariable(random, variable.low, variable.mid, variable.high, variable.distribution);
      const mapped =
        variable.name.includes("قیمت")
          ? "قیمت فروش"
          : variable.name.includes("حجم")
            ? "حجم فروش"
            : variable.name.includes("ارز")
              ? "نرخ ارز"
              : variable.name.includes("تورم")
                ? "تورم"
                : variable.name.includes("CAPEX")
                  ? "CAPEX"
                  : variable.name.includes("بهره")
                    ? "نرخ بهره"
                    : variable.name.includes("تاخیر")
                      ? "تاخیر"
                      : variable.name.includes("وصول")
                        ? "وصول"
                        : "هزینه";
      shocked = applySensitivityShockByName(shocked, activeScenario(shocked), mapped, shock, baseOutputs).project;
    });
    const shockedScenario = activeScenario(shocked);
    const outputs = runCoreCalculation(shocked, shockedScenario, false);
    rows.push({
      iteration,
      npv: outputs.valuation.npv,
      irr: outputs.valuation.irr,
      minDscr: outputs.financing.minimumDscr,
      liquidityGap: Math.min(...outputs.statements.rows.map((row) => row.cumulativeCashFlow)),
    });
  }
  const npvs = rows.map((row) => row.npv);
  const negativeTail = npvs.filter((value) => value <= percentile(npvs, 0.05));
  return {
    p5: percentile(npvs, 0.05),
    p50: percentile(npvs, 0.5),
    p95: percentile(npvs, 0.95),
    probabilityNpvPositive: rows.filter((row) => row.npv > scenario.assumptions.monteCarlo.npvThreshold).length / rows.length,
    probabilityDscrBelowThreshold:
      rows.filter((row) => row.minDscr !== null && row.minDscr < scenario.assumptions.financing.targetDscr).length / rows.length,
    var95: Math.abs(percentile(npvs, 0.05)),
    cvar95: negativeTail.length ? Math.abs(sum(negativeTail) / negativeTail.length) : 0,
    histogram: histogram(npvs),
    rows,
    diagnostics: rows.some((row) => row.irr !== null)
      ? ["IRR فقط برای تکرارهایی گزارش شده که سری کامل جریان نقد تغییر علامت معتبر داشته است."]
      : ["IRR مونت‌کارلو قابل گزارش نیست چون سری‌های شبیه‌سازی‌شده تغییر علامت معتبر ندارند."],
  };
};

export const calculateScenarioWithMonteCarlo = (project: Project, scenario = activeScenario(project)): ScenarioOutputs => {
  const outputs = calculateScenario(project, scenario);
  return { ...outputs, monteCarlo: calculateMonteCarlo(project, scenario) };
};
