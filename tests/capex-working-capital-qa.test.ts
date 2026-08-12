import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  calculateAnnualCapexSchedule,
  calculateCapexItem,
} from "../src/lib/phase-two-calculations";
import {
  calculateWorkingCapitalSchedule,
  validateWorkingCapitalAssumptions,
} from "../src/lib/working-capital-engine";
import { baseAssumptions, seedProject } from "./fixtures/seed-project";

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

describe("CAPEX QA guardrails", () => {
  it("rejects allocations outside an exact 100% total without normalizing them", () => {
    const macro = { ...clone(baseAssumptions.macro), fxReferenceCurrency: "دلار آمریکا" as const };
    const item = {
      ...clone(baseAssumptions.capex.items[0]),
      rialUnitPrice: 200,
      fxUnitPrice: 10,
      rialPriceShare: 0.5,
      fxPriceShare: 1,
      currency: "دلار آمریکا",
    };

    const invalid = calculateCapexItem(item, macro);
    assert.ok(invalid.errors.some((issue) => issue.id.includes("price-allocation")));
    assert.equal(Number.isNaN(invalid.values.finalItemCost), true);

    const valid = calculateCapexItem({ ...item, rialPriceShare: 0.4, fxPriceShare: 0.6 }, macro);
    assert.equal(valid.errors.some((issue) => issue.id.includes("price-allocation")), false);
    assert.equal(Number.isFinite(valid.values.finalItemCost), true);
  });

  it("requires the transaction currency and a positive item-level manual FX rate", () => {
    const macro = { ...clone(baseAssumptions.macro), fxReferenceCurrency: "دلار آمریکا" as const };
    const item = {
      ...clone(baseAssumptions.capex.items[0]),
      rialUnitPrice: 100,
      fxUnitPrice: 10,
      rialPriceShare: 0.4,
      fxPriceShare: 0.6,
      currency: "",
      fxRateType: "manual" as const,
      manualFxRate: 0,
    };

    const missing = calculateCapexItem(item, macro);
    assert.ok(missing.errors.some((issue) => issue.id.includes("transaction-currency")));
    assert.ok(missing.errors.some((issue) => issue.id.includes(".fx-rate.")));
    assert.equal(Number.isNaN(missing.values.finalItemCost), true);

    const valid = calculateCapexItem({ ...item, currency: "دلار آمریکا", manualFxRate: 500_000 }, macro);
    assert.equal(valid.errors.length, 0);
    assert.equal(valid.values.appliedFxRate, 500_000);
    assert.equal(valid.values.unitPriceBase, 100 * 0.4 + 10 * 0.6 * 500_000);
    assert.equal(valid.values.finalAmount, valid.values.unitPriceBase * item.quantity);
  });

  it("preserves valid payment schedules and continues to reject invalid totals", () => {
    const item = {
      ...clone(baseAssumptions.capex.items[0]),
      prepaymentRate: 0.4,
      deliveryPaymentRate: 0.4,
      postInstallPaymentRate: 0.2,
    };
    const valid = calculateCapexItem(item, clone(baseAssumptions.macro));
    const invalid = calculateCapexItem({ ...item, postInstallPaymentRate: 0.4 }, clone(baseAssumptions.macro));

    assert.equal(valid.errors.some((issue) => issue.id.includes("payment-share")), false);
    assert.equal(invalid.errors.some((issue) => issue.id.includes("payment-share")), true);
  });

  it("keeps land in the asset base while producing no accounting or tax depreciation", () => {
    const macro = clone(baseAssumptions.macro);
    const item = {
      ...clone(baseAssumptions.capex.items[0]),
      assetClass: "زمین",
      accountingDepreciable: true,
      taxDepreciable: true,
    };
    const result = calculateCapexItem(item, macro);
    const annual = calculateAnnualCapexSchedule(
      { items: [item] },
      macro,
      seedProject.baseYear,
      seedProject.modelHorizonYears,
    );

    assert.equal(result.values.accountingDepreciationAnnual, 0);
    assert.equal(result.values.taxDepreciationAnnual, 0);
    assert.equal(result.values.accountingBookValueEnd, result.values.finalItemCost);
    assert.equal(annual.reduce((total, row) => total + row.depreciation, 0), 0);
  });

  it("uses a zero contingency default while preserving explicit saved values", () => {
    const source = readFileSync("src/components/phase-two/PhaseTwoWorkspaces.tsx", "utf8");
    const factory = source.slice(source.indexOf("const createCapexItem"), source.indexOf("export function CapexWorkspace"));
    const item = {
      ...clone(baseAssumptions.capex.items[0]),
      contingencyRate: 0,
      installationCost: 0,
      transportInsuranceCost: 0,
      trainingCost: 0,
      preOperationCost: 0,
      indirectProjectCost: 0,
      permitCost: 0,
      permitCostRate: 0,
      delayEnabled: false,
    };
    const result = calculateCapexItem(item, clone(baseAssumptions.macro));

    assert.match(factory, /contingencyRate:\s*0,/);
    assert.equal(result.values.contingencyCost, 0);
    assert.equal(result.values.finalItemCost, result.values.adjustedAmount);
    assert.equal(baseAssumptions.capex.items[0].contingencyRate, 0.05);
  });
});

describe("working-capital ownership and validation", () => {
  it("rejects negative days without silently coercing the calculation to zero", () => {
    const assumptions = {
      ...clone(baseAssumptions.workingCapital),
      rawMaterialDays: -10,
      releaseInFinalYear: false,
    };
    const result = calculateWorkingCapitalSchedule(assumptions, [
      { year: 1, revenue: 365, cogs: 365, cashOpex: 0, rawMaterialAnnualCost: 730 },
    ], 1);

    assert.ok(result.errors.some((issue) => issue.field === "rawMaterialDays"));
    assert.equal(result.rows[0].rawMaterialInventory, -20);
  });

  it("rejects ordinary WC percentages above 100%", () => {
    const assumptions = {
      ...clone(baseAssumptions.workingCapital),
      otherCurrentLiabilitiesPercentOfRevenue: 1.5,
    };
    const errors = validateWorkingCapitalAssumptions(assumptions);
    assert.ok(errors.some((issue) => issue.field === "otherCurrentLiabilitiesPercentOfRevenue"));
  });

  it("edits and persists receivable/payable days from the WC canonical draft", () => {
    const source = readFileSync("src/components/phase-two/PhaseTwoWorkspaces.tsx", "utf8");
    const workspace = source.slice(source.indexOf("export function WorkingCapitalWorkspace"));

    assert.match(workspace, /value=\{draft\.receivableDays\}[^\n]+update\("receivableDays"/);
    assert.match(workspace, /value=\{draft\.payableDays\}[^\n]+update\("payableDays"/);
    assert.match(workspace, /applyWorkingCapitalAssumptions\(draft\)/);
    assert.doesNotMatch(workspace, /industry\.(receivablesDays|payablesDays)/);
    assert.match(workspace, /disabled=\{validationErrors\.length > 0\}/);
  });

  it("keeps advanced state hidden rather than resetting it and removes visible workbook identifiers", () => {
    const source = readFileSync("src/components/phase-two/PhaseTwoWorkspaces.tsx", "utf8");
    const capex = source.slice(source.indexOf("export function CapexWorkspace"), source.indexOf("export function WorkingCapitalWorkspace"));
    const workingCapital = source.slice(source.indexOf("export function WorkingCapitalWorkspace"));

    assert.match(capex, /mode === "advanced"/);
    assert.match(workingCapital, /mode === "advanced"/);
    assert.doesNotMatch(workingCapital, /<small>[^<]*(WorkingCapital13|FinancialStatements16|COGS-DirectCost10)/);
    assert.doesNotMatch(workingCapital, /note:\s*["'`]WorkingCapital13/);
    assert.doesNotMatch(capex, /<span>TaxDepreciation15<\/span>/);
  });
});
