import type { ValidationIssue, WorkingCapitalAssumptions } from "@/lib/types";

export type WorkingCapitalDriverRow = {
  year: number;
  revenue: number;
  cogs: number;
  cashOpex: number;
  rawMaterialAnnualCost: number;
};

const finite = (value: number) => Number.isFinite(value) ? Math.max(0, value) : 0;

const dayFields: Array<keyof WorkingCapitalAssumptions> = [
  "rawMaterialDays",
  "inventoryDays",
  "receivableDays",
  "payableDays",
  "supplierPrepaymentDays",
  "minimumCashDays",
  "accruedExpenseDays",
];

export const validateWorkingCapitalAssumptions = (assumptions: WorkingCapitalAssumptions): ValidationIssue[] => {
  const errors: ValidationIssue[] = [];
  dayFields.forEach((field) => {
    const value = assumptions[field];
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
      errors.push({
        id: `working-capital.invalid-days.${field}`,
        severity: "error",
        module: "working-capital",
        field,
        message: "تعداد روزهای سرمایه در گردش باید عددی معتبر و نامنفی باشد.",
        recommendation: "مقدار روز را صفر یا بیشتر وارد کنید.",
        sourceSheet: "WorkingCapital13",
      });
    }
  });
  const percentage = assumptions.otherCurrentLiabilitiesPercentOfRevenue;
  if (!Number.isFinite(percentage) || percentage < 0 || percentage > 1) {
    errors.push({
      id: "working-capital.invalid-percentage.otherCurrentLiabilitiesPercentOfRevenue",
      severity: "error",
      module: "working-capital",
      field: "otherCurrentLiabilitiesPercentOfRevenue",
      message: "درصد سایر بدهی‌های جاری باید بین صفر و ۱۰۰٪ باشد.",
      recommendation: "درصد را در محدوده معتبر وارد کنید.",
      sourceSheet: "WorkingCapital13",
    });
  }
  return errors;
};

export const calculateWorkingCapitalSchedule = (
  assumptions: WorkingCapitalAssumptions,
  driverRows: WorkingCapitalDriverRow[],
  finalYear: number,
) => {
  const errors = validateWorkingCapitalAssumptions(assumptions);
  let previousWorkingCapital = 0;
  const rows = driverRows.map((driver) => {
    const revenue = finite(driver.revenue);
    const cogs = finite(driver.cogs);
    const cashOpex = finite(driver.cashOpex);
    const dailyRawMaterialCost = finite(driver.rawMaterialAnnualCost) / 365;
    const dailyProductionCost = cogs / 365;
    const dailySales = revenue / 365;
    const dailyOpex = cashOpex / 365;
    const rawMaterialInventory = dailyRawMaterialCost * assumptions.rawMaterialDays;
    const finishedGoodsInventory = dailyProductionCost * assumptions.inventoryDays;
    const receivables = dailySales * assumptions.receivableDays;
    const inventory = rawMaterialInventory + finishedGoodsInventory;
    const prepayments = (dailyProductionCost + dailyOpex) * assumptions.supplierPrepaymentDays;
    const minimumCash = (dailyProductionCost + dailyOpex) * assumptions.minimumCashDays;
    const payables = (dailyProductionCost + dailyOpex) * assumptions.payableDays;
    const accruedExpenses = dailyOpex * assumptions.accruedExpenseDays;
    const otherCurrentLiabilities = revenue * assumptions.otherCurrentLiabilitiesPercentOfRevenue;
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
  return { rows, initialWorkingCapital, releaseFinalYear, errors };
};
