import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { calculateScenario } from "../src/lib/calculations";
import {
  calculateAchievableSales,
  calculateEffectiveDiscountRate,
  calculateFxRateByType,
  calculateMarketFunnel,
  calculatePotentialRevenue,
  validateProjectSetup,
} from "../src/lib/phase-one-calculations";
import { seedProject } from "../src/lib/seed";

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

describe("phase one calculations", () => {
  it("calculates suggested and applied discount rates from typed macro assumptions", () => {
    const macro = clone(seedProject.scenarios[0].assumptions.macro);
    macro.calculationBasis = "اسمی";
    const result = calculateEffectiveDiscountRate(macro);

    assert.ok(Math.abs(result.values.suggestedRate - 0.43) < 1e-12);
    assert.equal(result.values.appliedRate, macro.defaultDiscountRate);
    assert.ok(result.trace.some((item) => item.sourceCell === "V61:V66"));
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
