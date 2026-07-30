import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  calculateEconomicAnalysis,
  defaultEconomicAssumptions,
} from "../src/lib/economic-analysis-engine";
import { calculateScenarioCore } from "../src/lib/calculations";
import { seedProject } from "../src/lib/seed";
import type {
  EconomicAnalysisEngineInput,
} from "../src/lib/economic-analysis-engine";
import type {
  EconomicExternality,
  EconomicFinancialItem,
  EconomicItemClassification,
  Project,
} from "../src/lib/types";

const closeTo = (actual: number | null, expected: number, tolerance = 1e-4) =>
  actual !== null && Math.abs(actual - expected) <= tolerance;
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const item = (
  year: number,
  sourceId: string,
  kind: "benefit" | "cost",
  value: number,
  classification: EconomicItemClassification = "non-tradable-domestic",
): EconomicFinancialItem => ({
  id: `${sourceId}:${year}`,
  sourceId,
  label: sourceId,
  sourceModule: "test",
  year,
  calendarYear: 1405 + year,
  kind,
  financialValue: value,
  defaultClassification: classification,
});

const input = (
  financialItems: EconomicFinancialItem[],
  patch: Partial<EconomicAnalysisEngineInput> = {},
): EconomicAnalysisEngineInput => ({
  horizonYears: 2,
  baseYear: 1405,
  assumptions: {
    ...defaultEconomicAssumptions(),
    economicDiscountRate: 0.1,
    standardConversionFactor: 1,
    shadowExchangeRateFactor: 1,
    skilledLaborShadowFactor: 1,
    unskilledLaborShadowFactor: 1,
    energyShadowFactor: 1,
    waterShadowFactor: 1,
    landOpportunityCostFactor: 1,
    outputBorderPriceFactor: 1,
  },
  macroCalculationBasis: "واقعی",
  baseFinancialFxRate: 1,
  financialNpv: 4.132231404958667,
  financialItems,
  ...patch,
});

describe("annual economic analysis engine", () => {
  it("matches the independent -100, +60, +60 benchmark", () => {
    const result = calculateEconomicAnalysis(input([
      item(0, "investment-domestic", "cost", 100),
      item(1, "output", "benefit", 60),
      item(2, "output", "benefit", 60),
    ]));

    assert.ok(closeTo(result.enpv, 4.1322314));
    assert.ok(closeTo(result.eirr, 0.1306624));
    assert.ok(closeTo(result.ebcr, 1.0413223));
    assert.ok(closeTo(result.economicPayback, 1.6666667));
    assert.ok(closeTo(result.discountedEconomicPayback, 1.9166667));
    assert.deepEqual(result.annualRows.map((row) => row.netEconomicBenefit), [-100, 60, 60]);
    assert.ok(closeTo(result.annualRows[2].cumulativeDiscountedNetEconomicBenefit, result.enpv));
  });

  it("returns controlled unavailable metrics for no sign change and zero denominators", () => {
    const benefitsOnly = calculateEconomicAnalysis(input([
      item(0, "output", "benefit", 10),
      item(1, "output", "benefit", 20),
    ]));
    const costsOnly = calculateEconomicAnalysis(input([
      item(0, "investment-domestic", "cost", 10),
      item(1, "direct-domestic", "cost", 20),
    ]));

    assert.equal(benefitsOnly.eirr, null);
    assert.equal(benefitsOnly.ebcr, null);
    assert.equal(benefitsOnly.summary.metrics.ebcr.status, "not_computable");
    assert.equal(costsOnly.eirr, null);
    assert.equal(costsOnly.economicPayback, null);
  });

  it("places multi-period construction, working-capital recovery, and residual value in their actual years", () => {
    const result = calculateEconomicAnalysis(input([
      item(0, "investment-domestic", "cost", 40),
      item(1, "investment-domestic", "cost", 60),
      item(1, "working-capital-increase", "cost", 10),
      item(1, "output", "benefit", 30),
      item(2, "output", "benefit", 80),
      item(2, "working-capital-recovery", "benefit", 10),
      item(2, "residual-value", "benefit", 20),
    ]));

    assert.equal(result.annualRows[0].economicCapexCost, 40);
    assert.equal(result.annualRows[1].economicCapexCost, 60);
    assert.equal(result.annualRows[1].workingCapitalEconomicCost, 10);
    assert.equal(result.annualRows[2].workingCapitalRecoveryBenefit, 10);
    assert.equal(result.annualRows[2].residualValueBenefit, 20);
    assert.equal(result.annualRows[0].economicCapexCost + result.annualRows[1].economicCapexCost, 100);
  });

  it("applies one classification factor per category and removes transfers", () => {
    const classes: Array<[EconomicItemClassification, number]> = [
      ["imported-tradable", 1.2],
      ["non-tradable-domestic", 0.9],
      ["skilled-labor", 0.8],
      ["unskilled-labor", 0.7],
      ["energy", 1.3],
      ["water", 1.1],
      ["land", 0.6],
      ["tax-transfer", 0],
    ];
    const assumptions = {
      ...defaultEconomicAssumptions(),
      economicDiscountRate: 0,
      standardConversionFactor: 0.9,
      shadowExchangeRateFactor: 1.2,
      skilledLaborShadowFactor: 0.8,
      unskilledLaborShadowFactor: 0.7,
      energyShadowFactor: 1.3,
      waterShadowFactor: 1.1,
      landOpportunityCostFactor: 0.6,
    };
    const result = calculateEconomicAnalysis(input(
      classes.map(([classification], index) => item(0, `cost-${index}`, "cost", 10, classification)),
      { assumptions },
    ));

    classes.forEach(([classification, factor], index) => {
      const row = result.summary.reconciliation.find((entry) => entry.sourceId === `cost-${index}`);
      assert.equal(row?.classification, classification);
      assert.ok(closeTo(row?.economicValue ?? null, 10 * factor));
    });
    assert.equal(result.summary.reconciliation.find((entry) => entry.classification === "tax-transfer")?.economicValue, 0);
  });

  it("rejects price-basis mismatch and excludes incomplete or double-counted externalities", () => {
    const externalities: EconomicExternality[] = [
      {
        id: "jobs",
        title: "اشتغال",
        direction: "benefit",
        physicalUnit: "نفر-سال",
        annualQuantity: 10,
        economicUnitValue: 2,
        startYear: 1,
        endYear: 2,
        source: "مطالعه بازار کار",
        explanation: "ارزش فرصت اشتغال",
        doubleCountCategory: "employment",
        active: true,
      },
      {
        id: "incomplete",
        title: "اثر ناقص",
        direction: "benefit",
        physicalUnit: "",
        annualQuantity: 1,
        economicUnitValue: 2,
        startYear: 1,
        endYear: 2,
        source: "",
        explanation: "",
        active: true,
      },
    ];
    const result = calculateEconomicAnalysis(input([
      item(0, "opex-labor", "cost", 10, "skilled-labor"),
      item(1, "output", "benefit", 20),
    ], {
      assumptions: { ...defaultEconomicAssumptions(), priceBasis: "nominal", externalities },
      macroCalculationBasis: "واقعی",
    }));

    assert.equal(result.summary.metrics.enpv.status, "invalid_input");
    assert.equal(result.eirr, null);
    assert.equal(result.summary.diagnostics.some((row) => row.id === "economic-price-basis" && row.severity === "error"), true);
    assert.equal(result.summary.diagnostics.some((row) => row.id === "externality-double-counting"), true);
    assert.equal(result.summary.diagnostics.some((row) => row.id === "externality-missing-data"), true);
    assert.equal(result.summary.reconciliation.some((row) => row.sourceId === "externality:jobs"), false);
  });

  it("reconciles the bridge exactly, obeys the selected horizon, and never repeats year one", () => {
    const result = calculateEconomicAnalysis(input([
      item(0, "investment-domestic", "cost", 100),
      item(1, "output", "benefit", 40),
      item(2, "output", "benefit", 90),
      item(3, "output", "benefit", 999),
    ]));

    assert.equal(result.annualRows.length, 3);
    assert.equal(result.annualRows[1].economicBenefits, 40);
    assert.equal(result.annualRows[2].economicBenefits, 90);
    assert.equal(result.summary.bridgeReconciled, true);
    result.annualRows.forEach((row) => {
      const benefits = row.reconciliation.filter((entry) => entry.kind === "benefit").reduce((total, entry) => total + entry.economicValue, 0);
      const costs = row.reconciliation.filter((entry) => entry.kind === "cost").reduce((total, entry) => total + entry.economicValue, 0);
      assert.ok(closeTo(row.netEconomicBenefit, benefits - costs));
    });
  });
});

describe("economic analysis integration", () => {
  it("propagates scenarios and display-unit changes do not alter raw results", () => {
    const base = calculateScenarioCore(clone(seedProject));
    const scenarioChanged = clone(seedProject) as Project;
    scenarioChanged.scenarios[0].assumptions.market.baseSalesPrice *= 1.2;
    const changed = calculateScenarioCore(scenarioChanged);
    const unitChanged = clone(seedProject) as Project;
    unitChanged.displayUnit = unitChanged.displayUnit === "rial" ? "million-rial" : "rial";
    const sameRaw = calculateScenarioCore(unitChanged);

    assert.notEqual(changed.economic.enpv, base.economic.enpv);
    assert.equal(sameRaw.economic.enpv, base.economic.enpv);
    assert.equal(base.economic.annualRows.length, seedProject.modelHorizonYears + 1);
    assert.equal(base.economic.summary.bridgeReconciled, true);
  });
});
