import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import blankTemplate from "../src/lib/blank-project-template.json";
import {
  buildPotentialSalesForecast,
  calculateMarketFunnel,
  validateMarketDemand,
} from "../src/lib/phase-one-calculations";
import {
  buildMonthlyProductionDistribution,
  buildRampUpSchedule,
  calculateCapacityProduction,
  normalizeCapacityAssumptions,
} from "../src/lib/phase-two-calculations";
import { formatAnnualProductUnit, formatHourlyProductUnit, isLatinIdentifier } from "../src/lib/product-unit";
import type { CapacityAssumptions, MarketDemandAssumptions } from "../src/lib/types";
import { baseAssumptions, seedProject } from "./fixtures/seed-project";
import { normalizePersistedProject } from "../src/store/project-context";

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const blankMarket = () => clone(blankTemplate.market) as unknown as MarketDemandAssumptions;
const blankCapacity = () => clone(blankTemplate.capacity) as unknown as CapacityAssumptions;

describe("market and capacity stabilization", () => {
  it("keeps a pristine market silent and warns only after meaningful sales data", () => {
    const market = blankMarket();
    assert.deepEqual(validateMarketDemand(market).errors, []);
    assert.deepEqual(validateMarketDemand(market).warnings, []);
    market.unitSalesPrice = 10;
    market.inputPresence = { unitSalesPrice: true };
    assert.ok(validateMarketDemand(market).warnings.some((item) => item.id === "market-zero-revenue"));
  });

  it("enforces TAM >= SAM > SOM >= 0 and every entered percentage range", () => {
    const market = blankMarket();
    Object.assign(market, { totalMarketSize: 100, serviceableAvailableMarket: 80, targetMarketSize: 80 });
    market.inputPresence = { totalMarketSize: true, serviceableAvailableMarket: true, targetMarketSize: true };
    assert.ok(calculateMarketFunnel(market).errors.some((item) => item.id === "market-som-over-sam"));
    market.targetMarketSize = 20;
    market.demandBehavior.conversionRate = 1.01;
    market.inputPresence["demandBehavior.conversionRate"] = true;
    assert.ok(validateMarketDemand(market).errors.some((item) => item.id.includes("market-percent-range")));
  });

  it("preserves null forecast fallback and an explicit zero override", () => {
    const market = blankMarket();
    Object.assign(market, { potentialSalesYear1: 100, potentialSalesYear2: null, potentialSalesYear3: 0, salesGrowthRate: 0.1 });
    assert.deepEqual(buildPotentialSalesForecast(market), [100, 110.00000000000001, 0]);
  });

  it("renders Latin identifiers directionally and keeps trace UI out of both workspaces", () => {
    assert.equal(isLatinIdentifier("B2B"), true);
    assert.equal(isLatinIdentifier("B2G"), true);
    const marketUi = readFileSync("src/components/phase-one/PhaseOneWorkspaces.tsx", "utf8");
    const marketSection = marketUi.slice(marketUi.indexOf("export function MarketDemandWorkspace"), marketUi.indexOf("export const formatDisplayUnit"));
    const capacityUi = readFileSync("src/components/phase-two/PhaseTwoWorkspaces.tsx", "utf8");
    const capacitySection = capacityUi.slice(capacityUi.indexOf("export function CapacityProductionWorkspace"), capacityUi.indexOf("const directTabs"));
    assert.doesNotMatch(marketSection, /FormulaTraceMini/);
    assert.doesNotMatch(capacitySection, /FormulaTraceMini|خروجی و Trace|Q4[2367]/);
  });

  it("treats nominal capacity as annual, applies lines once, and reports no false binding constraint", () => {
    const capacity = normalizeCapacityAssumptions({
      ...blankCapacity(), unit: "تن", nominalCapacity: 1000, productionLines: 1,
      workingDaysPerYear: 300, shiftsPerDay: 2, effectiveHoursPerShift: 8,
      plannedDowntimeRate: 0.1, unplannedDowntimeRate: 0.05,
      firstYearUtilizationRate: 1, secondYearUtilizationRate: 1, stableYearUtilizationRate: 1,
      productionEfficiency: 1, wasteRate: 0,
    });
    const result = calculateCapacityProduction(capacity);
    assert.equal(result.values.nominalEffectiveCapacity, 855);
    assert.equal(result.values.bindingConstraint, "ندارد");
    assert.ok(result.values.nominalEffectiveCapacity < 4104000);
  });

  it("keeps pristine capacity silent, blocks incomplete save, and validates percentages and monthly total", () => {
    const capacity = blankCapacity();
    assert.deepEqual(calculateCapacityProduction(capacity).errors, []);
    assert.ok(calculateCapacityProduction(capacity, { requireComplete: true }).errors.some((item) => item.id === "phase2.capacity.base-inputs"));
    const invalid = normalizeCapacityAssumptions({ ...clone(baseAssumptions.capacity), rampUpMode: "سفارشی" });
    invalid.monthlyRampUpCapacityPercentages[0].capacityPercent = 1.2;
    invalid.seasonalityMode = "سفارشی";
    invalid.monthlyProductionDistribution[0].share = 0.5;
    const validation = calculateCapacityProduction(invalid);
    assert.ok(validation.errors.some((item) => item.id === "phase2.capacity.percent-range"));
    assert.ok(validation.errors.some((item) => item.id === "phase2.capacity.monthly-share-total"));
  });

  it("builds deterministic 12-month ramp and distribution schedules whose production sums to annual output", () => {
    const capacity = normalizeCapacityAssumptions({ ...clone(baseAssumptions.capacity), rampUpMode: "خطی", rampUpDurationMonths: 6, seasonalityMode: "یکنواخت", bottleneckHourlyCapacity: 0 });
    const ramp = buildRampUpSchedule(capacity);
    assert.equal(ramp.length, 12);
    assert.equal(ramp[5].capacityPercent, capacity.stableYearUtilizationRate);
    const custom = buildMonthlyProductionDistribution("سفارشی", []);
    assert.equal(custom.length, 12);
    assert.ok(Math.abs(custom.reduce((sum, row) => sum + row.share, 0) - 1) < 1e-12);
    const result = calculateCapacityProduction(capacity);
    assert.ok(Math.abs(result.values.monthlyNetProduction.reduce((sum, value) => sum + value, 0) - result.values.netSellableProduction) < 1e-9);
  });

  it("uses one base product unit with explicit annual and hourly rate labels", () => {
    assert.equal(formatAnnualProductUnit("تن در سال"), "تن/سال");
    assert.equal(formatHourlyProductUnit("تن/سال"), "تن/ساعت");
  });

  it("migrates product-unit ownership to Market and preserves null, zero, and custom monthly state", () => {
    const project = clone(seedProject);
    const scenario = project.scenarios[0];
    scenario.assumptions.market.marketAnalysisUnit = "تن";
    scenario.assumptions.market.potentialSalesYear2 = null;
    scenario.assumptions.market.potentialSalesYear3 = 0;
    scenario.assumptions.capacity.unit = "کیلوگرم/سال";
    scenario.assumptions.capacity.rampUpMode = "سفارشی";
    scenario.assumptions.capacity.seasonalityMode = "سفارشی";
    const ramp = clone(scenario.assumptions.capacity.monthlyRampUpCapacityPercentages);
    const distribution = clone(scenario.assumptions.capacity.monthlyProductionDistribution);
    const normalized = normalizePersistedProject(project).scenarios[0].assumptions;
    assert.equal(normalized.capacity.unit, "تن");
    assert.equal(normalized.market.potentialSalesYear2, null);
    assert.equal(normalized.market.potentialSalesYear3, 0);
    assert.deepEqual(normalized.capacity.monthlyRampUpCapacityPercentages, ramp);
    assert.deepEqual(normalized.capacity.monthlyProductionDistribution, distribution);
  });
});
