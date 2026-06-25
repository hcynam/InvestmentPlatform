import type { WorkingCapitalAssumptions } from "@/lib/types";

export type WorkingCapitalDriverRow = {
  year: number;
  revenue: number;
  cogs: number;
  cashOpex: number;
  rawMaterialAnnualCost: number;
};

const finite = (value: number) => Number.isFinite(value) ? Math.max(0, value) : 0;

export const calculateWorkingCapitalSchedule = (
  assumptions: WorkingCapitalAssumptions,
  driverRows: WorkingCapitalDriverRow[],
  finalYear: number,
) => {
  let previousWorkingCapital = 0;
  const rows = driverRows.map((driver) => {
    const revenue = finite(driver.revenue);
    const cogs = finite(driver.cogs);
    const cashOpex = finite(driver.cashOpex);
    const dailyRawMaterialCost = finite(driver.rawMaterialAnnualCost) / 365;
    const dailyProductionCost = cogs / 365;
    const dailySales = revenue / 365;
    const dailyOpex = cashOpex / 365;
    const rawMaterialInventory = dailyRawMaterialCost * finite(assumptions.rawMaterialDays);
    const finishedGoodsInventory = dailyProductionCost * finite(assumptions.inventoryDays);
    const receivables = dailySales * finite(assumptions.receivableDays);
    const inventory = rawMaterialInventory + finishedGoodsInventory;
    const prepayments = (dailyProductionCost + dailyOpex) * finite(assumptions.supplierPrepaymentDays);
    const minimumCash = (dailyProductionCost + dailyOpex) * finite(assumptions.minimumCashDays);
    const payables = (dailyProductionCost + dailyOpex) * finite(assumptions.payableDays);
    const accruedExpenses = dailyOpex * finite(assumptions.accruedExpenseDays);
    const otherCurrentLiabilities = revenue * finite(assumptions.otherCurrentLiabilitiesPercentOfRevenue);
    const currentAssets = receivables + inventory + prepayments + minimumCash;
    const currentLiabilities = payables + accruedExpenses + otherCurrentLiabilities;
    let workingCapital = currentAssets - currentLiabilities;
    if (assumptions.releaseInFinalYear && driver.year === finalYear) workingCapital = 0;
    const changeInWorkingCapital = driver.year === 0 ? 0 : workingCapital - previousWorkingCapital;
    previousWorkingCapital = workingCapital;
    return {
      year: driver.year,
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
      accruedExpenses,
      otherCurrentLiabilities,
      currentAssets,
      currentLiabilities,
      workingCapital,
      changeInWorkingCapital,
    };
  });
  const initialWorkingCapital = rows.find((row) => row.year === 1)?.workingCapital ?? 0;
  const releaseFinalYear = Math.max(0, -(rows.find((row) => row.year === finalYear)?.changeInWorkingCapital ?? 0));
  return { rows, initialWorkingCapital, releaseFinalYear };
};
