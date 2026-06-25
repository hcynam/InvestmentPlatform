import { calculateCapexItem } from "@/lib/phase-two-calculations";
import { calculateDepreciationSchedule } from "@/lib/depreciation-engine";
import type {
  CapexItem,
  MacroAssumptions,
  Project,
  ScenarioOutputs,
  TaxAssumptions,
  TaxIncentiveType,
} from "@/lib/types";

const clamp = (value: number, min = 0, max = 1) => Math.min(Math.max(Number.isFinite(value) ? value : 0, min), max);

const byYear = <T extends { year: number }>(rows: T[], year: number) => rows.find((row) => row.year === year);

export const taxIncentiveTypes: TaxIncentiveType[] = [
  "بدون معافیت",
  "دانش‌بنیان",
  "منطقه آزاد",
  "منطقه کمتر توسعه‌یافته",
  "نرخ ترجیحی",
  "اعتبار مالیاتی سرمایه‌گذاری",
  "معافیت درصدی",
  "سفارشی",
];

export const getTaxIncentiveDefaults = (type: TaxIncentiveType): Partial<TaxAssumptions> => {
  if (type === "دانش‌بنیان") return { approvedKnowledgeRevenueShare: 1, knowledgeBasedExemptionYears: 15, knowledgeBasedStartYear: 1 };
  if (type === "منطقه آزاد") return { freeZoneInsideActivityShare: 1, freeZoneExemptionYears: 20, freeZonePermitValid: true };
  if (type === "منطقه کمتر توسعه‌یافته") return { lessDevelopedEligibleIncomeShare: 1, lessDevelopedZeroRateYears: 10, lessDevelopedStartYear: 1 };
  if (type === "نرخ ترجیحی") return { preferentialIncomeShare: 1, preferentialTaxRate: 0.1, preferentialYears: 5 };
  if (type === "اعتبار مالیاتی سرمایه‌گذاری") return { taxCreditPercentOfCapex: 0.1, taxCreditCarryForward: true };
  if (type === "معافیت درصدی") return { percentExemptionRate: 0.2, percentExemptionYears: 5, percentExemptionIncomeShare: 1 };
  if (type === "سفارشی") return { customEligibleIncomeShare: 1, customEffectiveTaxRate: 0.25, customIncentiveYears: 1 };
  return {};
};

export const getVisibleTaxIncentiveFields = (type: TaxIncentiveType) => {
  const common = ["incentiveType", "normalTaxRateOverride"];
  const map: Record<TaxIncentiveType, string[]> = {
    "بدون معافیت": common,
    "دانش‌بنیان": [...common, "approvedKnowledgeRevenueShare", "knowledgeBasedExemptionYears", "knowledgeBasedStartYear"],
    "منطقه آزاد": [...common, "freeZoneInsideActivityShare", "freeZonePermitDate", "freeZonePermitValid", "freeZoneExemptionYears"],
    "منطقه کمتر توسعه‌یافته": [...common, "lessDevelopedEligibleIncomeShare", "lessDevelopedZeroRateYears", "lessDevelopedStartYear", "lessDevelopedActivityType"],
    "نرخ ترجیحی": [...common, "preferentialTaxRate", "preferentialYears", "preferentialIncomeShare"],
    "اعتبار مالیاتی سرمایه‌گذاری": [...common, "taxCreditAmount", "taxCreditPercentOfCapex", "annualTaxCreditCap", "taxCreditCarryForward"],
    "معافیت درصدی": [...common, "percentExemptionRate", "percentExemptionYears", "percentExemptionIncomeShare"],
    "سفارشی": [...common, "customEligibleIncomeShare", "customEffectiveTaxRate", "customIncentiveYears", "customTaxCreditAmount"],
  };
  return map[type] ?? common;
};

export type DepreciationBookRow = {
  year: number;
  accountingDepreciation: number;
  taxDepreciation: number;
  accountingBookValueEnd: number;
  taxBookValueEnd: number;
};

type BookKind = "accounting" | "tax";

const bookSettings = (item: CapexItem, kind: BookKind) => {
  if (kind === "accounting") {
    return {
      depreciable: item.accountingDepreciable ?? item.accountingEligible ?? item.depreciable,
      usefulLifeYears: item.accountingUsefulLifeYears ?? item.usefulLifeYears,
      salvageValue: item.accountingSalvageValue ?? item.salvageValue,
      salvageRate: item.accountingSalvageValueRate ?? item.salvageValueRate,
      method: item.accountingDepreciationMethod ?? item.depreciationMethod,
      startDate: item.accountingDepreciationStartDate ?? item.depreciationStartDate,
      startYear: item.accountingDepreciationStartYear ?? item.depreciationStartYear,
    };
  }
  return {
    depreciable: item.taxDepreciable ?? item.taxEligible ?? item.depreciable,
    usefulLifeYears: item.taxUsefulLifeYears ?? item.usefulLifeYears,
    salvageValue: item.taxSalvageValue ?? item.salvageValue,
    salvageRate: item.taxSalvageValueRate ?? item.salvageValueRate,
    method: item.taxDepreciationMethod ?? item.depreciationMethod,
    startDate: item.taxDepreciationStartDate ?? item.depreciationStartDate,
    startYear: item.taxDepreciationStartYear ?? item.depreciationStartYear,
  };
};

export const calculateItemDepreciationBook = (
  item: CapexItem,
  macro: MacroAssumptions,
  project: Project,
  kind: BookKind,
) => {
  const output = calculateCapexItem(item, macro).values;
  const settings = bookSettings(item, kind);
  const basis = Math.max(0, output.finalItemCost);
  const salvage = settings.salvageValue > 0 ? settings.salvageValue : basis * clamp(settings.salvageRate);
  const schedule = calculateDepreciationSchedule({
    basis: settings.depreciable ? basis : 0,
    salvageValue: salvage,
    usefulLifeYears: settings.usefulLifeYears,
    method: settings.method,
    startDate: settings.startDate,
    startYear: settings.startYear,
    baseYear: project.baseYear,
    horizonYears: project.modelHorizonYears,
  });
  const rows = schedule.rows;

  return {
    basis,
    salvage,
    annualDepreciation: rows.find((row) => row.depreciation > 0)?.depreciation ?? 0,
    firstYearDepreciation: schedule.firstYearDepreciation,
    accumulatedDepreciation: schedule.accumulatedDepreciation,
    bookValueEnd: schedule.bookValueEnd,
    rows,
  };
};

export const calculateCapexDepreciationByYear = (
  items: CapexItem[],
  macro: MacroAssumptions,
  project: Project,
): DepreciationBookRow[] => {
  const rows = Array.from({ length: project.modelHorizonYears + 1 }, (_, year) => ({
    year,
    accountingDepreciation: 0,
    taxDepreciation: 0,
    accountingBookValueEnd: 0,
    taxBookValueEnd: 0,
  }));

  items.forEach((item) => {
    const accounting = calculateItemDepreciationBook(item, macro, project, "accounting");
    const tax = calculateItemDepreciationBook(item, macro, project, "tax");
    rows.forEach((row) => {
      const accountingRow = accounting.rows[row.year];
      const taxRow = tax.rows[row.year];
      row.accountingDepreciation += accountingRow?.depreciation ?? 0;
      row.taxDepreciation += taxRow?.depreciation ?? 0;
      row.accountingBookValueEnd += accountingRow?.bookValueEnd ?? 0;
      row.taxBookValueEnd += taxRow?.bookValueEnd ?? 0;
    });
  });

  return rows;
};

const isInsideWindow = (year: number, startYear: number, years: number) =>
  years > 0 && year >= startYear && year < startYear + years;

const incentiveTaxAfterBenefit = ({
  tax,
  type,
  year,
  taxableIncome,
  baseTax,
  normalTaxRate,
}: {
  tax: TaxAssumptions;
  type: TaxIncentiveType;
  year: number;
  taxableIncome: number;
  baseTax: number;
  normalTaxRate: number;
}) => {
  if (taxableIncome <= 0 || baseTax <= 0) return baseTax;

  if (type === "دانش‌بنیان" && isInsideWindow(year, tax.knowledgeBasedStartYear, tax.knowledgeBasedExemptionYears)) {
    const exemptShare = clamp(tax.approvedKnowledgeRevenueShare);
    return taxableIncome * (1 - exemptShare) * normalTaxRate;
  }

  if (type === "منطقه آزاد" && tax.freeZonePermitValid && isInsideWindow(year, Math.max(1, tax.exemptionStartYear), tax.freeZoneExemptionYears)) {
    const exemptShare = clamp(tax.freeZoneInsideActivityShare);
    return taxableIncome * (1 - exemptShare) * normalTaxRate;
  }

  if (type === "منطقه کمتر توسعه‌یافته" && isInsideWindow(year, tax.lessDevelopedStartYear, tax.lessDevelopedZeroRateYears)) {
    const zeroRateShare = clamp(tax.lessDevelopedEligibleIncomeShare);
    return taxableIncome * (1 - zeroRateShare) * normalTaxRate;
  }

  if (type === "نرخ ترجیحی" && isInsideWindow(year, Math.max(1, tax.exemptionStartYear), tax.preferentialYears)) {
    const preferentialShare = clamp(tax.preferentialIncomeShare);
    const preferentialRate = clamp(tax.preferentialTaxRate, 0, normalTaxRate);
    return taxableIncome * preferentialShare * preferentialRate + taxableIncome * (1 - preferentialShare) * normalTaxRate;
  }

  if (type === "معافیت درصدی" && isInsideWindow(year, tax.exemptionStartYear, tax.percentExemptionYears || tax.exemptionYears)) {
    const eligibleShare = clamp(tax.percentExemptionIncomeShare);
    const exemptionRate = clamp(tax.percentExemptionRate || tax.exemptionRate);
    return baseTax * (1 - eligibleShare * exemptionRate);
  }

  if (type === "سفارشی" && isInsideWindow(year, tax.exemptionStartYear, tax.customIncentiveYears)) {
    const eligibleShare = clamp(tax.customEligibleIncomeShare);
    const customRate = clamp(tax.customEffectiveTaxRate, 0, normalTaxRate);
    return taxableIncome * eligibleShare * customRate + taxableIncome * (1 - eligibleShare) * normalTaxRate;
  }

  return baseTax;
};

export const calculateTaxBridge = ({
  project,
  tax,
  macro,
  depreciationRows,
  accountingEbtByYear,
  totalCapex,
}: {
  project: Project;
  tax: TaxAssumptions;
  macro: MacroAssumptions;
  depreciationRows: DepreciationBookRow[];
  accountingEbtByYear: Record<number, number>;
  totalCapex: number;
}): ScenarioOutputs["tax"] => {
  let openingTaxLoss = 0;
  let creditCarryForward = 0;
  const type = tax.incentiveType || "بدون معافیت";
  const normalTaxRate = tax.normalTaxRateOverride ?? macro.corporateTaxRate;
  const initialCreditPool =
    type === "اعتبار مالیاتی سرمایه‌گذاری"
      ? Math.max(0, tax.taxCreditAmount) + Math.max(0, totalCapex) * clamp(tax.taxCreditPercentOfCapex || tax.investmentTaxCredit)
      : type === "سفارشی"
        ? Math.max(0, tax.customTaxCreditAmount)
        : 0;
  creditCarryForward = initialCreditPool;

  const rows = Array.from({ length: project.modelHorizonYears + 1 }, (_, year) => {
    const depreciation = byYear(depreciationRows, year);
    const accountingDepreciation = depreciation?.accountingDepreciation ?? 0;
    const taxDepreciation = depreciation?.taxDepreciation ?? 0;
    const accountingEbt = accountingEbtByYear[year] ?? 0;
    const depreciationAdjustment = accountingDepreciation - taxDepreciation;
    const taxableProfitBeforeLoss = accountingEbt + depreciationAdjustment;
    const lossUsed = Math.min(Math.max(taxableProfitBeforeLoss, 0), openingTaxLoss);
    const finalTaxableIncome = Math.max(0, taxableProfitBeforeLoss - lossUsed);
    const closingTaxLoss = openingTaxLoss - lossUsed + Math.max(0, -taxableProfitBeforeLoss);
    const baseTax = finalTaxableIncome * normalTaxRate;
    const taxAfterIncentives = Math.max(0, incentiveTaxAfterBenefit({
      tax,
      type,
      year,
      taxableIncome: finalTaxableIncome,
      baseTax,
      normalTaxRate,
    }));
    const annualCreditCap = tax.annualTaxCreditCap > 0 ? tax.annualTaxCreditCap : Number.POSITIVE_INFINITY;
    const taxCreditUsed = type === "اعتبار مالیاتی سرمایه‌گذاری" || type === "سفارشی"
      ? Math.min(taxAfterIncentives, annualCreditCap, creditCarryForward)
      : 0;
    const finalTax = Math.max(0, taxAfterIncentives - taxCreditUsed);
    const incentiveEffect = Math.max(0, baseTax - taxAfterIncentives);
    if ((type === "اعتبار مالیاتی سرمایه‌گذاری" || type === "سفارشی") && finalTaxableIncome > 0) {
      creditCarryForward = tax.taxCreditCarryForward ? Math.max(0, creditCarryForward - taxCreditUsed) : 0;
    }
    const row = {
      year,
      accountingDepreciation,
      taxDepreciation,
      depreciationAdjustment,
      accountingEbt,
      taxableProfitBeforeLoss,
      openingTaxLoss,
      lossUsed,
      taxableIncome: finalTaxableIncome,
      finalTaxableIncome,
      closingTaxLoss,
      lossCarryForward: closingTaxLoss,
      normalTaxRate,
      baseTax,
      incentiveEffect,
      taxAfterIncentives,
      taxCreditUsed,
      taxCreditCarryForward: creditCarryForward,
      tax: finalTax,
      finalTax,
      effectiveTaxRate: finalTaxableIncome > 0 ? finalTax / finalTaxableIncome : 0,
      incentiveType: type,
    };
    openingTaxLoss = closingTaxLoss;
    return row;
  });

  const yearOne = rows[1] ?? rows[0];
  return {
    rows,
    kpis: {
      accountingDepreciationYear1: yearOne.accountingDepreciation,
      taxDepreciationYear1: yearOne.taxDepreciation,
      depreciationAdjustmentYear1: yearOne.depreciationAdjustment,
      finalTaxableIncomeYear1: yearOne.finalTaxableIncome,
      closingTaxLossYear1: yearOne.closingTaxLoss,
      finalTaxYear1: yearOne.finalTax,
      effectiveTaxRateYear1: yearOne.effectiveTaxRate,
      incentiveEffectYear1: yearOne.incentiveEffect + yearOne.taxCreditUsed,
    },
  };
};
