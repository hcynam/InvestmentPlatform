import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { calculateScenario } from "../src/lib/calculations";
import {
  calculateAchievableSales,
  buildFxChartSeries,
  calculateEffectiveDiscountRate,
  calculateFxRateByType,
  calculateMarketFunnel,
  calculatePotentialRevenue,
  isMacroInputEntered,
  resolveGrowthRate,
  resolveMacroGrowthRate,
  synchronizeMacroAssumptions,
  validateMacroAssumptions,
  validateProjectSetup,
} from "../src/lib/phase-one-calculations";
import { seedProject } from "./fixtures/seed-project";
import { synchronizeTaxAssumptionsFromMacro } from "../src/lib/tax-capex-engine";

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

describe("phase one calculations", () => {
  it("calculates suggested and applied discount rates from typed macro assumptions", () => {
    const macro = clone(seedProject.scenarios[0].assumptions.macro);
    macro.calculationBasis = "اسمی";
    const result = calculateEffectiveDiscountRate(macro);

    assert.equal(result.values.suggestedRate, macro.costOfCapital);
    assert.equal(result.values.appliedRate, macro.defaultDiscountRate);
    assert.ok(result.trace.some((item) => item.sourceCell === "V61:V66"));
  });

  it("keeps general growth as fallback and replaces it with one specific override", () => {
    assert.equal(resolveGrowthRate(0.2, null), 0.2);
    assert.equal(resolveGrowthRate(0.2, 0.08), 0.08);
    assert.equal(resolveGrowthRate(0.2, 0, true), 0);
  });

  it("resolves annual growth paths without adding the general rate twice", () => {
    const macro = clone(seedProject.scenarios[0].assumptions.macro);
    macro.salesPriceGrowth = 0.1;
    macro.growthPaths = [
      { id: "sales-y2", key: "salesPriceGrowth", year: 2, rate: 0.2 },
      { id: "sales-y4", key: "salesPriceGrowth", year: 4, rate: 0.05 },
    ];
    assert.equal(resolveMacroGrowthRate(macro, "salesPriceGrowth", 1), 0.1);
    assert.equal(resolveMacroGrowthRate(macro, "salesPriceGrowth", 3), 0.2);
    assert.equal(resolveMacroGrowthRate(macro, "salesPriceGrowth", 4), 0.05);
    assert.equal(resolveMacroGrowthRate(macro, "salesPriceGrowth", 4, 0.07), 0.07);
  });

  it("distinguishes an untouched macro default from an explicitly entered zero", () => {
    const macro = clone(seedProject.scenarios[0].assumptions.macro);
    macro.inflationGeneralAnnual = 0;
    macro.inputPresence = { inflationGeneralAnnual: false };
    assert.equal(isMacroInputEntered(macro, "inflationGeneralAnnual"), false);
    macro.inputPresence.inflationGeneralAnnual = true;
    assert.equal(isMacroInputEntered(macro, "inflationGeneralAnnual"), true);
  });

  it("does not require exemption years when no tax exemption applies", () => {
    const macro = clone(seedProject.scenarios[0].assumptions.macro);
    macro.taxExemptionType = "ندارد";
    macro.taxExemptionYears = 9;
    const synchronized = synchronizeMacroAssumptions(macro);
    assert.equal(synchronized.taxExemptionYears, 0);
    assert.equal(validateMacroAssumptions(synchronized).errors.some((item) => item.id === "macro-tax-exemption-years"), false);
  });

  it("synchronizes explicit macro tax inputs into the canonical tax engine", () => {
    const macro = clone(seedProject.scenarios[0].assumptions.macro);
    const tax = clone(seedProject.scenarios[0].assumptions.tax);
    macro.incomeTaxRate = 0.2;
    macro.taxExemptionType = "ندارد";
    macro.inputPresence = { incomeTaxRate: true, taxExemptionType: true };
    const withoutExemption = synchronizeTaxAssumptionsFromMacro(tax, macro);
    assert.equal(withoutExemption.normalTaxRateOverride, 0.2);
    assert.equal(withoutExemption.incentiveType, "بدون معافیت");
    assert.equal(withoutExemption.exemptionYears, 0);

    macro.taxExemptionType = "دارد";
    macro.taxExemptionRate = 0.4;
    macro.taxExemptionYears = 3;
    macro.taxExemptionStartYear = 2;
    const withExemption = synchronizeTaxAssumptionsFromMacro(tax, macro);
    assert.equal(withExemption.incentiveType, "معافیت درصدی");
    assert.equal(withExemption.percentExemptionRate, 0.4);
    assert.equal(withExemption.percentExemptionYears, 3);
    assert.equal(withExemption.exemptionStartYear, 2);
  });

  it("returns an empty FX chart without data and a bounded bar for one rate", () => {
    const macro = clone(seedProject.scenarios[0].assumptions.macro);
    macro.officialFxRate = 0;
    macro.freeMarketFxRate = 0;
    macro.remittanceFxRate = 0;
    macro.baseFxRate = 0;
    assert.deepEqual(buildFxChartSeries(macro), []);
    macro.freeMarketFxRate = 500_000;
    assert.deepEqual(buildFxChartSeries(macro), [{ label: "آزاد", value: 500_000, heightPercent: 100 }]);
  });

  it("resolves the selected Iranian FX tier", () => {
    const macro = clone(seedProject.scenarios[0].assumptions.macro);

    assert.equal(calculateFxRateByType(macro, "official").values.rate, 380000);
    assert.equal(calculateFxRateByType(macro, "freeMarket").values.rate, 500000);
    assert.equal(calculateFxRateByType(macro, "remittance").values.rate, 480000);
  });

  it("validates and calculates the TAM/SAM/SOM funnel", () => {
    const market = clone(seedProject.scenarios[0].assumptions.market);
    const result = calculateMarketFunnel(market);

    assert.deepEqual(result.values, {
      tam: 300000000,
      sam: 10000000,
      som: 21900,
      targetShare: 0.00219,
    });
    assert.equal(result.errors.length, 0);
  });

  it("caps achievable sales by market and supply constraints", () => {
    const market = clone(seedProject.scenarios[0].assumptions.market);
    market.potentialSalesYear1 = 50000;
    market.marketAchievementFactor = 0.9;
    market.salesCeiling = 40000;
    market.marketAbsorptionCapacity = 30000;
    market.supplyConstraintValue = 20000;

    const sales = calculateAchievableSales(market, { supplyLimit: 20000 });
    const revenue = calculatePotentialRevenue(market, { supplyLimit: 20000 });

    assert.equal(sales.values.achievableSales, 20000);
    assert.equal(revenue.values.potentialRevenue, 20000 * market.unitSalesPrice);
  });

  it("rejects an invalid setup timeline and exposes Excel source mapping", () => {
    const setup = clone(seedProject.setup);
    setup.operationStartDate = "2025-01-01";
    const result = validateProjectSetup(setup);

    assert.ok(result.errors.some((item) => item.id === "setup-date-order"));
    assert.ok(result.errors.some((item) => item.sourceSheet === "ProjectSetup02"));
  });

  it("publishes phase-one validations and traces in the main calculation output", () => {
    const project = clone(seedProject);
    const outputs = calculateScenario(project);

    assert.ok(outputs.traces.some((item) => item.id === "phase1.marketFunnel"));
    assert.ok(outputs.traces.some((item) => item.id === "phase1.effectiveDiscountRate"));
    assert.ok(outputs.validations.some((item) => item.module === "macro"));
  });
});
