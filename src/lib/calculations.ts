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
  calculateCapexDepreciationByYear,
  calculateTaxBridge,
} from "@/lib/tax-capex-engine";
import type {
  CapexAssumptions,
  FinancingAssumptions,
  FormulaTrace,
  Project,
  Scenario,
  ScenarioAssumptions,
  ScenarioOutputs,
  SensitivityMatrixCell,
  SensitivityPoint,
  ValidationIssue,
  YearlyRow,
} from "@/lib/types";

const EPSILON = 1e-9;

const range = (end: number) => Array.from({ length: end + 1 }, (_, year) => year);

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const byYear = <T extends { year: number }>(rows: T[], year: number) => rows.find((row) => row.year === year);

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

const npvForRate = (cashFlows: number[], rate: number) =>
  cashFlows.reduce((total, cashFlow, year) => total + cashFlow / (1 + rate) ** year, 0);

const signChanges = (cashFlows: number[]) => {
  const signs = cashFlows.filter((value) => Math.abs(value) > EPSILON).map((value) => Math.sign(value));
  let changes = 0;
  for (let index = 1; index < signs.length; index += 1) {
    if (signs[index] !== signs[index - 1]) changes += 1;
  }
  return changes;
};

export const calculateIrr = (cashFlows: number[]) => {
  const hasPositive = cashFlows.some((value) => value > EPSILON);
  const hasNegative = cashFlows.some((value) => value < -EPSILON);
  if (!hasPositive || !hasNegative) return null;

  let low = -0.95;
  let high = 5;
  let lowNpv = npvForRate(cashFlows, low);
  let highNpv = npvForRate(cashFlows, high);

  for (let attempt = 0; attempt < 40 && lowNpv * highNpv > 0; attempt += 1) {
    high += 5;
    highNpv = npvForRate(cashFlows, high);
  }

  if (lowNpv * highNpv > 0) return null;

  for (let iteration = 0; iteration < 100; iteration += 1) {
    const mid = (low + high) / 2;
    const midNpv = npvForRate(cashFlows, mid);
    if (Math.abs(midNpv) < 0.01) return mid;
    if (lowNpv * midNpv < 0) {
      high = mid;
      highNpv = midNpv;
    } else {
      low = mid;
      lowNpv = midNpv;
    }
  }
  return (low + high) / 2;
};

const calculateMirr = (cashFlows: number[], financeRate: number, reinvestmentRate: number) => {
  const n = cashFlows.length - 1;
  if (n <= 0) return null;
  const pvNegative = cashFlows.reduce((total, cf, year) => {
    if (cf >= 0) return total;
    return total + cf / (1 + financeRate) ** year;
  }, 0);
  const fvPositive = cashFlows.reduce((total, cf, year) => {
    if (cf <= 0) return total;
    return total + cf * (1 + reinvestmentRate) ** (n - year);
  }, 0);
  if (pvNegative >= 0 || fvPositive <= 0) return null;
  return (fvPositive / Math.abs(pvNegative)) ** (1 / n) - 1;
};

const calculatePayback = (cashFlows: number[]) => {
  let cumulative = 0;
  for (let index = 0; index < cashFlows.length; index += 1) {
    const previous = cumulative;
    cumulative += cashFlows[index];
    if (cumulative >= 0) {
      if (index === 0) return 0;
      const needed = Math.abs(previous);
      const generated = cashFlows[index];
      return generated === 0 ? index : index - 1 + needed / generated;
    }
  }
  return null;
};

const cloneProject = (project: Project): Project => JSON.parse(JSON.stringify(project)) as Project;

const activeScenario = (project: Project) =>
  project.scenarios.find((scenario) => scenario.id === project.activeScenarioId) ?? project.scenarios[0];

const updateActiveScenario = (project: Project, assumptions: ScenarioAssumptions) => {
  const scenario = activeScenario(project);
  scenario.assumptions = assumptions;
  return scenario;
};

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
  let previousWorkingCapital = 0;
  const rows = range(project.modelHorizonYears).map((year) => {
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
    const dailyRawMaterialCost = rawMaterialAnnualCost / 365;
    const dailyProductionCost = cogs / 365;
    const dailySales = revenueValue / 365;
    const dailyOpex = opexCash / 365;
    const rawMaterialInventory = dailyRawMaterialCost * a.rawMaterialDays;
    const finishedGoodsInventory = dailyProductionCost * a.inventoryDays;
    const receivables = dailySales * a.receivableDays;
    const inventory = rawMaterialInventory + finishedGoodsInventory;
    const prepayments = (dailyProductionCost + dailyOpex) * a.supplierPrepaymentDays;
    const minimumCash = (dailyProductionCost + dailyOpex) * a.minimumCashDays;
    const payables = (dailyProductionCost + dailyOpex) * a.payableDays;
    const currentAssets = receivables + inventory + prepayments + minimumCash;
    const currentLiabilities = payables;
    let workingCapital = currentAssets - currentLiabilities;
    if (a.releaseInFinalYear && year === project.modelHorizonYears) workingCapital = 0;
    const changeInWorkingCapital = year === 0 ? 0 : workingCapital - previousWorkingCapital;
    previousWorkingCapital = workingCapital;
    return {
      year,
      dailyRawMaterialCost,
      dailyProductionCost,
      dailySales,
      dailyOpex,
      rawMaterialInventory,
      finishedGoodsInventory,
      receivables,
      inventory,
      prepayments,
      minimumCash,
      payables,
      currentAssets,
      currentLiabilities,
      workingCapital,
      changeInWorkingCapital,
    };
  });

  const initialWorkingCapital = byYear(rows, 1)?.workingCapital ?? 0;
  const releaseFinalYear = Math.max(0, -(byYear(rows, project.modelHorizonYears)?.changeInWorkingCapital ?? 0));
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

const calculateFinancing = (project: Project, scenario: Scenario, traces: FormulaTrace[]) => {
  const a: FinancingAssumptions = scenario.assumptions.financing;
  const financing = calculateFinancingEngine(a, project.modelHorizonYears);

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
    const cff = loanRow.drawdown + equityInjection - loanRow.principalRepayment - dividends;
    const netCashFlow = cfo + cfi + cff;
    cumulativeCashFlow += netCashFlow;
    const cash = Math.max(0, cumulativeCashFlow);
    const implicitShortTermDebt = Math.max(0, -cumulativeCashFlow);
    const workingCapitalAssets = wcRow.currentAssets;
    const fixedAssetsGross = capex.annual.slice(0, year + 1).reduce((total, row) => total + row.capitalizedCapex, 0);
    const accumulatedDepreciation = capex.annual.slice(0, year + 1).reduce((total, row) => total + row.depreciation, 0);
    const netFixedAssets = Math.max(0, fixedAssetsGross - accumulatedDepreciation);
    const totalAssets = cash + workingCapitalAssets + netFixedAssets;
    const debt = loanRow.endingBalance + implicitShortTermDebt;
    const equity = cumulativeEquity + retainedEarnings;
    const totalLiabilitiesAndEquity = debt + wcRow.currentLiabilities + equity;
    const balanceCheck = totalAssets - totalLiabilitiesAndEquity;
    const debtService = loanRow.debtService;
    const cfads = ebitda - tax - wcRow.changeInWorkingCapital;
    const dscr = calculateDSCR(cfads, debtService);
    loanRow.cfads = cfads;
    loanRow.dscr = dscr;
    loanRow.status = dscrStatus(dscr);
    const fcff = year === 0
      ? -capexRow.cashCapex - wcRow.changeInWorkingCapital
      : ebit - tax + depreciation - capexRow.cashCapex - wcRow.changeInWorkingCapital;

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
      debt,
      equity,
      totalAssets,
      totalLiabilitiesAndEquity,
      balanceCheck,
      dscr,
      fcff,
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
  const wacc = discountRateResult.values.appliedRate;
  const g = macro.terminalGrowthRate;
  const fcffByYear = statements.rows.map((row) => row.fcff);
  const discountedFcffByYear = fcffByYear.map((fcff, year) => fcff / (1 + wacc) ** year);
  const finalFcff = fcffByYear.at(-1) ?? 0;
  const terminalValue = wacc > g ? (finalFcff * (1 + g)) / (wacc - g) : 0;
  const discountedTerminalValue = terminalValue / (1 + wacc) ** project.modelHorizonYears;
  const npv = sum(discountedFcffByYear) + discountedTerminalValue;
  const irr = calculateIrr(fcffByYear);
  const mirr = calculateMirr(fcffByYear, macro.financeRate, macro.reinvestmentRate);
  const cumulativeFcff: number[] = [];
  fcffByYear.reduce((acc, fcff, index) => {
    const next = acc + fcff;
    cumulativeFcff[index] = next;
    return next;
  }, 0);
  const payback = calculatePayback(fcffByYear);
  const discountedPayback = calculatePayback(discountedFcffByYear);
  const diagnostics: string[] = [];
  if (!fcffByYear.some((value) => value < 0)) diagnostics.push("IRR قابل اتکا نیست چون جریان نقد منفی وجود ندارد.");
  if (!fcffByYear.some((value) => value > 0)) diagnostics.push("IRR قابل محاسبه نیست چون جریان نقد مثبت کافی وجود ندارد.");
  if (signChanges(fcffByYear) > 1) diagnostics.push("جریان نقد چند تغییر علامت دارد؛ امکان چند IRR وجود دارد.");
  if (irr === null) diagnostics.push("IRR عددی پیدا نشد؛ به جای 0، وضعیت ناموجود نمایش داده می‌شود.");
  if (payback === null) diagnostics.push("عدم بازگشت در افق مدل.");
  if (npv < 0) diagnostics.push("NPV منفی است؛ پروژه با مفروضات فعلی ارزش اقتصادی مالی کافی ندارد.");
  if (wacc <= g) diagnostics.push("نرخ تنزیل باید بزرگ‌تر از نرخ رشد پایانی باشد.");

  traces.push(
    trace(
      "valuation.npv",
      "NPV",
      "NPV = Sum(FCFF / (1 + WACC)^year) + TerminalValue / (1 + WACC)^horizon",
      [
        { label: "WACC", value: wacc, source: sourceRef("discountRate") },
        { label: "Terminal Value", value: terminalValue, source: "DCF-Valuation17!R34" },
        { label: "مجموع FCFF تنزیل‌شده", value: sum(discountedFcffByYear), source: "DCF-Valuation17!P54:P74" },
      ],
      npv,
      "npv",
    ),
  );

  return { fcffByYear, discountedFcffByYear, cumulativeFcff, terminalValue, discountedTerminalValue, npv, irr, mirr, payback, discountedPayback, diagnostics };
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
    a.environmentalCost +
    a.infrastructurePressureCost +
    a.technologyTransferBenefit +
    a.importSubstitutionBenefit +
    a.regionalDevelopmentBenefit;
  const economicCapex = Math.abs(valuation.fcffByYear[0] ?? 0) * (1 + (a.shadowExchangeRateFactor - 1));
  const economicOpex = (year1?.opex ?? 0) * a.unskilledLaborShadowFactor;
  const economicCogs = (year1?.cogs ?? 0) * a.energyShadowFactor * a.shadowExchangeRateFactor;
  const encf = adjustedRevenue + externalBenefits - economicCogs - economicOpex - economicCapex * a.capitalServiceChargeRate;
  const enpv = range(project.modelHorizonYears).reduce((total, year) => {
    if (year === 0) return total - economicCapex;
    return total + encf / (1 + a.economicDiscountRate) ** year;
  }, 0);
  const eirr = calculateIrr([-economicCapex, ...range(project.modelHorizonYears).slice(1).map(() => encf)]);
  const ebcr = economicCapex > 0 ? enpv / economicCapex : null;
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
  const financingInitial = calculateFinancing(project, scenario, traces);
  const statementsResult = calculateStatements(project, scenario, revenue, directCosts, opex, capex, workingCapital, financingInitial, traces);
  const valuation = calculateValuation(project, scenario, statementsResult.statements, traces);
  const economic = calculateEconomic(project, scenario, statementsResult.statements, valuation);
  const sensitivity = includeRisk ? calculateSensitivity(project, scenario, valuation.npv) : emptySensitivity();
  const dashboards = calculateDashboards(scenario, statementsResult.statements.rows, statementsResult.financing, valuation, construction);
  const validations = validateScenario(project, scenario, statementsResult.statements.rows, statementsResult.financing, valuation, construction);
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

const applyShock = (
  project: Project,
  variable: string,
  shock: number,
  changeType: "percent" | "absolute" = "percent",
) => {
  const next = cloneProject(project);
  const scenario = activeScenario(next);
  const a = scenario.assumptions;
  const adjust = (value: number) => changeType === "absolute" ? value + shock : value * (1 + shock);

  if (variable.includes("فروش") || variable.includes("قیمت")) a.market.baseSalesPrice = Math.max(0, adjust(a.market.baseSalesPrice));
  else if (variable.includes("حجم")) a.market.targetMarket = Math.max(0, adjust(a.market.targetMarket));
  else if (variable.includes("CAPEX")) {
    a.capex.items = a.capex.items.map((item) => ({
      ...item,
      unitPrice: Math.max(0, adjust(item.unitPrice)),
    }));
  }
  else if (variable.includes("OPEX") || variable.includes("تورم") || variable.includes("دستمزد")) {
    if (changeType === "absolute") a.opex.salaries = Math.max(0, a.opex.salaries + shock);
    else a.opex.scenarioAdjustmentRate += shock;
  } else if (variable.includes("COGS") || variable.includes("هزینه")) {
    a.directCosts.directLaborUnitCost = Math.max(0, adjust(a.directCosts.directLaborUnitCost));
  }
  else if (variable.includes("ارز")) a.macro.fxRates.freeMarket = Math.max(0, adjust(a.macro.fxRates.freeMarket));
  else if (variable.includes("تنزیل")) a.macro.discountRate = Math.max(0, a.macro.discountRate + shock);
  else if (variable.includes("بهره")) a.financing.interestRate = Math.max(0, a.financing.interestRate + shock);
  else if (variable.includes("تاخیر")) {
    a.capex.items = a.capex.items.map((item) => ({
      ...item,
      delayMonths: Math.max(0, changeType === "absolute" ? item.delayMonths + Math.round(shock) : Math.round(item.delayMonths * (1 + shock))),
    }));
  }
  else if (variable.includes("وصول")) a.workingCapital.receivableDays = Math.max(0, a.workingCapital.receivableDays + shock);
  updateActiveScenario(next, a);
  return { project: next, scenario };
};

const emptySensitivity = () => ({ oneWay: [], matrix: [], tornado: [], breakEven: { price: null, volume: null, sales: null, fxRate: null } });

const metricFromOutputs = (outputs: Omit<ScenarioOutputs, "monteCarlo">, metric: string) => {
  if (metric === "IRR") return outputs.valuation.irr;
  if (metric === "Payback") return outputs.valuation.payback;
  if (metric === "DSCR") return outputs.financing.minimumDscr;
  return outputs.valuation.npv;
};

const sensitivityRange = (low: number, high: number, steps: number) => {
  const safeSteps = Math.max(2, Math.min(15, Math.round(steps)));
  return Array.from({ length: safeSteps }, (_, index) => low + ((high - low) * index) / (safeSteps - 1));
};

const calculateSensitivity = (project: Project, scenario: Scenario, baseNpv: number) => {
  const a = scenario.assumptions.sensitivity;
  const configuredVariables = a.variables?.length
    ? a.variables
    : [
        { id: "legacy-1", parameter: a.variable1, label: a.variable1, low: a.shockLow, high: a.shockHigh, steps: a.steps, changeType: "percent" as const },
        { id: "legacy-2", parameter: a.variable2, label: a.variable2, low: a.shockLow, high: a.shockHigh, steps: a.steps, changeType: "percent" as const },
      ];

  const oneWay: SensitivityPoint[] = configuredVariables.flatMap((variable) =>
    sensitivityRange(variable.low, variable.high, variable.steps).map((shock) => {
      const shocked = applyShock(project, variable.parameter, shock, variable.changeType);
      const outputs = runCoreCalculation(shocked.project, shocked.scenario, false);
      return { variable: variable.label, shock, metric: metricFromOutputs(outputs, a.selectedMetric) };
    }),
  );

  const matrix: SensitivityMatrixCell[] = [];
  const matrixColumn = configuredVariables[0];
  const matrixRow = configuredVariables[1] ?? configuredVariables[0];
  const columnShocks = sensitivityRange(matrixColumn.low, matrixColumn.high, matrixColumn.steps);
  const rowShocks = sensitivityRange(matrixRow.low, matrixRow.high, matrixRow.steps);
  rowShocks.forEach((rowShock) => {
    columnShocks.forEach((colShock) => {
      const first = applyShock(project, matrixColumn.parameter, colShock, matrixColumn.changeType);
      const second = applyShock(first.project, matrixRow.parameter, rowShock, matrixRow.changeType);
      const outputs = runCoreCalculation(second.project, second.scenario, false);
      matrix.push({ rowShock, colShock, value: metricFromOutputs(outputs, a.selectedMetric) });
    });
  });

  const tornado = configuredVariables.map((variable) => {
    const lowShock = applyShock(project, variable.parameter, variable.low, variable.changeType);
    const highShock = applyShock(project, variable.parameter, variable.high, variable.changeType);
    const low = metricFromOutputs(runCoreCalculation(lowShock.project, lowShock.scenario, false), a.selectedMetric);
    const high = metricFromOutputs(runCoreCalculation(highShock.project, highShock.scenario, false), a.selectedMetric);
    return { variable: variable.label, low, high, range: Math.abs((high ?? 0) - (low ?? 0)) };
  }).sort((left, right) => right.range - left.range);

  const year1Revenue = scenario.outputs?.statements.rows[1]?.revenue ?? 0;
  const price = scenario.assumptions.market.baseSalesPrice;
  const volume = year1Revenue > 0 && price > 0 ? Math.abs(baseNpv / year1Revenue) * (year1Revenue / price) : null;
  return {
    oneWay,
    matrix,
    tornado,
    breakEven: {
      price: price > 0 ? price + Math.abs(baseNpv) / Math.max(1, scenario.assumptions.market.targetMarket) : null,
      volume,
      sales: price && volume ? price * volume : null,
      fxRate: scenario.assumptions.macro.fxRates.freeMarket * (1 + Math.abs(baseNpv) / Math.max(1, Math.abs(baseNpv) + year1Revenue)),
    },
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
  const balanceOk = rows.every((row) => Math.abs(row.balanceCheck) < Math.max(1000000, row.totalAssets * 0.01));
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
    if (Math.abs(row.balanceCheck) > Math.max(1000000, Math.abs(row.totalAssets) * 0.01)) {
      issues.push({
        id: `statements.balance-${row.year}`,
        severity: "warning",
        module: "financial-statements",
        field: `year-${row.year}`,
        message: `ترازنامه در سال ${row.year} ناتراز است.`,
        recommendation: "جریان نقد، بدهی کوتاه‌مدت ضمنی، سرمایه در گردش و سیاست تقسیم سود را بازبینی کنید.",
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
      shocked = applyShock(shocked, mapped, shock).project;
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
