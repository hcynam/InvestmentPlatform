import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { calculateDepreciationSchedule } from "../src/lib/depreciation-engine";
import {
  calculateIrrResult,
  calculateMirrResult,
  calculateNpv,
  calculatePaybackResult,
  calculateRealRate,
  deflateCashFlows,
  safeDivide,
  safeNumber,
} from "../src/lib/financial-math";
import { calculateScenarioAdjustedAssumptions, defaultScenarioAdjustments } from "../src/lib/scenario-engine";
import { baseAssumptions, seedProject } from "../src/lib/seed";
import { calculateTaxBridge } from "../src/lib/tax-capex-engine";
import { calculateWorkingCapitalSchedule } from "../src/lib/working-capital-engine";

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

describe("financial math guardrails", () => {
  it("calculates NPV and a valid IRR", () => {
    assert.ok(Math.abs((calculateNpv([-100, 60, 60], 0.1).value ?? 0) - 4.1322) < 0.001);
    const irr = calculateIrrResult([-100, 60, 60]);
    assert.equal(irr.status, "ok");
    assert.ok(Math.abs((irr.value ?? 0) - 0.13066) < 0.0001);
  });

  it("returns an explicit non-computable status without a sign change", () => {
    const irr = calculateIrrResult([0, 10, 20]);
    const mirr = calculateMirrResult([0, 10, 20], 0.2, 0.15);
    assert.equal(irr.value, null);
    assert.equal(irr.status, "not_computable");
    assert.equal(mirr.value, null);
  });

  it("keeps all-positive and all-negative IRR cases explicit and safe", () => {
    const allPositive = calculateIrrResult([10, 20, 30]);
    const allNegative = calculateIrrResult([-10, -20, -30]);

    assert.equal(allPositive.value, null);
    assert.equal(allPositive.status, "not_computable");
    assert.equal(allNegative.value, null);
    assert.equal(allNegative.status, "not_computable");
  });

  it("deflates nominal cash flows and rejects invalid real-rate inputs", () => {
    const realRate = calculateRealRate(0.2, 0.1);
    const deflated = deflateCashFlows([100, 110, 121], 0.1);

    assert.ok(Math.abs((realRate.value ?? 0) - 0.090909) < 0.000001);
    assert.deepEqual(deflated.cashFlows.map((value) => Math.round(value)), [100, 100, 100]);
    assert.equal(calculateRealRate(0.1, -1).status, "invalid_input");
    assert.equal(deflateCashFlows([100, Number.POSITIVE_INFINITY], 0.1).status, "invalid_input");
  });

  it("blocks spreadsheet errors and unsafe division", () => {
    assert.equal(safeNumber("#VALUE!", 7), 7);
    assert.equal(safeNumber(Number.POSITIVE_INFINITY, 9), 9);
    assert.equal(safeDivide(10, 0), null);
    assert.equal(safeDivide(10, 2), 5);
    assert.equal(calculateNpv([Number.NaN], 0.1).status, "invalid_input");
    assert.equal(calculatePaybackResult([Number.NaN]).status, "invalid_input");
  });
});

describe("depreciation and tax", () => {
  it("implements separate straight-line, declining and immediate schedules", () => {
    const input = { basis: 120, salvageValue: 0, usefulLifeYears: 4, startDate: "2026-01-01", startYear: 2026, baseYear: 2026, horizonYears: 4 };
    const straight = calculateDepreciationSchedule({ ...input, method: "خطی" });
    const declining = calculateDepreciationSchedule({ ...input, method: "نزولی" });
    const immediate = calculateDepreciationSchedule({ ...input, method: "یکجا" });
    assert.equal(straight.rows[0].depreciation, 30);
    assert.equal(declining.rows[0].depreciation, 60);
    assert.equal(immediate.rows[0].depreciation, 120);
    assert.equal(Math.round(straight.rows.reduce((sum, row) => sum + row.depreciation, 0)), 120);
  });

  it("carries tax losses and limits knowledge-based exemption to the approved share", () => {
    const tax = { ...clone(baseAssumptions.tax), incentiveType: "دانش‌بنیان" as const, approvedKnowledgeRevenueShare: 0.4, knowledgeBasedStartYear: 1, knowledgeBasedExemptionYears: 5, normalTaxRateOverride: 0.25 };
    const project = { ...clone(seedProject), modelHorizonYears: 2 };
    const output = calculateTaxBridge({
      project,
      tax,
      macro: clone(baseAssumptions.macro),
      depreciationRows: [0, 1, 2].map((year) => ({ year, accountingDepreciation: 0, taxDepreciation: 0, accountingBookValueEnd: 0, taxBookValueEnd: 0 })),
      accountingEbtByYear: { 0: 0, 1: -100, 2: 150 },
      totalCapex: 0,
    });
    assert.equal(output.rows[1].closingTaxLoss, 100);
    assert.equal(output.rows[2].finalTaxableIncome, 50);
    assert.equal(output.rows[2].finalTax, 7.5);
  });

  it("applies an investment tax credit after gross tax", () => {
    const tax = { ...clone(baseAssumptions.tax), incentiveType: "اعتبار مالیاتی سرمایه‌گذاری" as const, taxCreditAmount: 10, taxCreditPercentOfCapex: 0, annualTaxCreditCap: 10, taxCreditCarryForward: false, normalTaxRateOverride: 0.25 };
    const project = { ...clone(seedProject), modelHorizonYears: 1 };
    const output = calculateTaxBridge({
      project,
      tax,
      macro: clone(baseAssumptions.macro),
      depreciationRows: [0, 1].map((year) => ({ year, accountingDepreciation: 0, taxDepreciation: 0, accountingBookValueEnd: 0, taxBookValueEnd: 0 })),
      accountingEbtByYear: { 0: 0, 1: 100 },
      totalCapex: 0,
    });
    assert.equal(output.rows[1].baseTax, 25);
    assert.equal(output.rows[1].taxCreditUsed, 10);
    assert.equal(output.rows[1].finalTax, 15);
  });

  it("bridges accounting depreciation to taxable income before tax", () => {
    const tax = { ...clone(baseAssumptions.tax), incentiveType: "بدون معافیت" as const, normalTaxRateOverride: 0.25, taxCreditAmount: 0, taxCreditPercentOfCapex: 0 };
    const project = { ...clone(seedProject), modelHorizonYears: 1 };
    const output = calculateTaxBridge({
      project,
      tax,
      macro: clone(baseAssumptions.macro),
      depreciationRows: [
        { year: 0, accountingDepreciation: 0, taxDepreciation: 0, accountingBookValueEnd: 0, taxBookValueEnd: 0 },
        { year: 1, accountingDepreciation: 30, taxDepreciation: 60, accountingBookValueEnd: 90, taxBookValueEnd: 60 },
      ],
      accountingEbtByYear: { 0: 0, 1: 100 },
      totalCapex: 120,
    });

    assert.equal(output.rows[1].depreciationAdjustment, -30);
    assert.equal(output.rows[1].finalTaxableIncome, 70);
    assert.equal(output.rows[1].finalTax, 17.5);
  });
});

describe("working capital and scenarios", () => {
  it("uses current assets minus all current liabilities and releases NWC", () => {
    const assumptions = { ...clone(baseAssumptions.workingCapital), rawMaterialDays: 10, inventoryDays: 10, receivableDays: 30, payableDays: 20, accruedExpenseDays: 10, minimumCashDays: 5 };
    const result = calculateWorkingCapitalSchedule(assumptions, [
      { year: 0, revenue: 0, cogs: 0, cashOpex: 0, rawMaterialAnnualCost: 0 },
      { year: 1, revenue: 3650, cogs: 1825, cashOpex: 365, rawMaterialAnnualCost: 730 },
      { year: 2, revenue: 3650, cogs: 1825, cashOpex: 365, rawMaterialAnnualCost: 730 },
    ], 2);
    const yearOne = result.rows[1];
    assert.equal(yearOne.workingCapital, yearOne.currentAssets - yearOne.currentLiabilities);
    assert.ok(yearOne.accruedExpenses > 0);
    assert.equal(result.rows[2].workingCapital, 0);
    assert.ok(result.releaseFinalYear > 0);
  });

  it("creates materially different scenario assumptions", () => {
    const pessimistic = defaultScenarioAdjustments("pessimistic");
    const adjusted = calculateScenarioAdjustedAssumptions(baseAssumptions, pessimistic);
    assert.ok(adjusted.macro.inflationRate > baseAssumptions.macro.inflationRate);
    assert.ok(adjusted.macro.fxRates.freeMarket > baseAssumptions.macro.fxRates.freeMarket);
    assert.ok(adjusted.workingCapital.receivableDays > baseAssumptions.workingCapital.receivableDays);
    assert.ok(adjusted.capex.items[0].rialUnitPrice > baseAssumptions.capex.items[0].rialUnitPrice);
    assert.equal(adjusted.construction.delayScenarioEnabled, true);
  });
});
