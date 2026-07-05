import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { calculateScenarioCore } from "../src/lib/calculations";
import { seedProject } from "../src/lib/seed";
import type { Project } from "../src/lib/types";

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const closeTo = (actual: number, expected: number, tolerance = 1) => Math.abs(actual - expected) <= tolerance;

describe("DCF valuation professional output", () => {
  it("publishes finite annual DCF rows and reconciles selected FCFF/FCFE series", () => {
    const outputs = calculateScenarioCore(clone(seedProject));
    const valuation = outputs.valuation;

    assert.equal(valuation.annualRows.length, seedProject.modelHorizonYears + 1);
    valuation.annualRows.forEach((row, index) => {
      assert.equal(row.fcff, valuation.fcffByYear[index]);
      assert.equal(row.fcfe, valuation.fcfeByYear[index]);
      assert.equal(row.discountedFcff, valuation.discountedFcffByYear[index]);
      assert.ok(Object.values(row).every((value) => typeof value !== "number" || Number.isFinite(value)));
    });
  });

  it("keeps FCFF free of debt drawdown and principal while FCFE includes them", () => {
    const outputs = calculateScenarioCore(clone(seedProject));
    const drawdownYear = outputs.statements.rows.find((row) => row.debtDrawdown > 0);
    const repaymentYear = outputs.statements.rows.find((row) => row.principalRepayment > 0);

    assert.ok(drawdownYear);
    assert.ok(repaymentYear);
    assert.ok(closeTo(drawdownYear.fcff, drawdownYear.ebit - drawdownYear.tax + drawdownYear.depreciation - drawdownYear.capex - drawdownYear.changeInWorkingCapital, 0.01));
    assert.ok(closeTo(drawdownYear.fcfe, drawdownYear.netProfit + drawdownYear.depreciation - drawdownYear.capex - drawdownYear.changeInWorkingCapital + drawdownYear.debtDrawdown - drawdownYear.principalRepayment, 0.01));
    assert.equal(outputs.valuation.summary.diagnostics.some((item) => item.id === "financing-treatment"), true);
  });

  it("uses the active discount basis, Fisher real-rate conversion and terminal value consistently", () => {
    const outputs = calculateScenarioCore(clone(seedProject));
    const valuation = outputs.valuation;
    const expectedRealRate = (1 + valuation.nominalDiscountRate) / (1 + valuation.inflationRate) - 1;
    const reconstructedNpv = valuation.annualRows.reduce((total, row) => total + row.discountedFcff, 0) + valuation.discountedTerminalValue;

    assert.ok(closeTo(valuation.realDiscountRate ?? 0, expectedRealRate, 1e-12));
    assert.ok(closeTo(reconstructedNpv, valuation.fcffNpv, 0.01));
    assert.equal(valuation.summary.terminalDiagnostic.valid, true);
  });

  it("flags invalid terminal growth and unavailable payback without fake zeroes", () => {
    const project = clone(seedProject) as Project;
    project.scenarios[0].assumptions.macro.calculationBasis = "اسمی";
    project.scenarios[0].assumptions.macro.terminalGrowthRate = project.scenarios[0].assumptions.macro.defaultDiscountRate + 0.01;
    project.scenarios[0].assumptions.market.baseSalesPrice = 0;
    const valuation = calculateScenarioCore(project).valuation;

    assert.equal(valuation.summary.terminalDiagnostic.valid, false);
    assert.equal(valuation.metrics.npv.status, "invalid_input");
    assert.equal(valuation.payback, null);
    assert.equal(valuation.metrics.payback.status, "not_computable");
  });

  it("keeps NPV at IRR approximately zero when IRR is meaningful", () => {
    const valuation = calculateScenarioCore(clone(seedProject)).valuation;

    assert.ok(valuation.irr !== null);
    const npvAtIrr = valuation.fcffByYear.reduce((total, cashFlow, year) => total + cashFlow / (1 + (valuation.irr ?? 0)) ** year, 0);
    assert.ok(closeTo(npvAtIrr, 0, 1_000));
  });

  it("does not expose raw workbook/internal field IDs in the DCF workbench", () => {
    const source = readFileSync("src/components/project/DcfValuationWorkbench.tsx", "utf8");

    assert.doesNotMatch(source, /DCF-Valuation-v\d+R/i);
    assert.doesNotMatch(source, /EconomicAnalysis-v\d+R/i);
    assert.doesNotMatch(source, /Model inputs/i);
    assert.match(source, /DcfClientYearTable/);
    assert.match(source, /financial-client-table/);
    assert.match(source, /نمای خام پیشرفته/);
  });
});

describe("economic analysis professional output", () => {
  it("calculates finite annual economic rows, ENPV and BCR from social benefits and costs", () => {
    const economic = calculateScenarioCore(clone(seedProject)).economic;

    assert.equal(economic.annualRows.length, seedProject.modelHorizonYears + 1);
    assert.ok(economic.annualRows.every((row) => Number.isFinite(row.netEconomicBenefit) && Number.isFinite(row.discountedNetEconomicBenefit)));
    assert.ok(Number.isFinite(economic.enpv));
    assert.ok(economic.ebcr !== null);
    assert.ok(closeTo(economic.ebcr, economic.presentValueBenefits / economic.presentValueCosts, 1e-12));
  });

  it("uses social discount rate for ENPV instead of WACC", () => {
    const base = calculateScenarioCore(clone(seedProject)).economic.enpv;
    const waccOnlyProject = clone(seedProject) as Project;
    waccOnlyProject.scenarios[0].assumptions.macro.defaultDiscountRate += 0.1;
    const waccOnly = calculateScenarioCore(waccOnlyProject).economic.enpv;
    const socialRateProject = clone(seedProject) as Project;
    socialRateProject.scenarios[0].assumptions.economic.economicDiscountRate += 0.05;
    const socialChanged = calculateScenarioCore(socialRateProject).economic.enpv;

    assert.ok(closeTo(base, waccOnly, 0.01));
    assert.notEqual(base, socialChanged);
  });

  it("applies conversion factors once and reports missing environmental assumptions as warnings", () => {
    const project = clone(seedProject) as Project;
    const outputs = calculateScenarioCore(project);
    const row = outputs.economic.annualRows[1];
    const assumptions = project.scenarios[0].assumptions;
    const expectedRevenue = row.financialRevenue / (1 + assumptions.macro.vatRate) * assumptions.economic.standardConversionFactor;
    const expectedDirectCost = outputs.statements.rows[1].cogs * assumptions.economic.energyShadowFactor * assumptions.economic.shadowExchangeRateFactor;

    assert.ok(closeTo(row.economicRevenue, expectedRevenue, 0.01));
    assert.ok(closeTo(row.economicDirectCost, expectedDirectCost, 0.01));
    assert.equal(outputs.economic.summary.conversionAssumptions.some((item) => item.status === "missing" && item.id === "carbon-price"), true);
    assert.equal(outputs.economic.summary.diagnostics.some((item) => item.id === "carbon-not-modeled" && item.severity === "warning"), true);
  });

  it("handles invalid EIRR streams explicitly", () => {
    const project = clone(seedProject) as Project;
    project.scenarios[0].assumptions.market.baseSalesPrice = 0;
    project.scenarios[0].assumptions.economic.directEmploymentBenefit = 0;
    project.scenarios[0].assumptions.economic.indirectEmploymentBenefit = 0;
    project.scenarios[0].assumptions.economic.pollutionReductionBenefit = 0;
    project.scenarios[0].assumptions.economic.technologyTransferBenefit = 0;
    project.scenarios[0].assumptions.economic.importSubstitutionBenefit = 0;
    project.scenarios[0].assumptions.economic.regionalDevelopmentBenefit = 0;
    const economic = calculateScenarioCore(project).economic;

    assert.equal(economic.eirr, null);
    assert.notEqual(economic.summary.metrics.eirr.status, "ok");
  });

  it("keeps economic analysis visibly distinct from financial valuation", () => {
    const outputs = calculateScenarioCore(clone(seedProject));

    assert.notEqual(outputs.economic.enpv, outputs.valuation.npv);
    assert.equal(outputs.economic.summary.diagnostics.some((item) => item.id === "financial-economic-divergence"), true);
  });

  it("does not expose raw workbook/internal field IDs in the economic workbench", () => {
    const source = readFileSync("src/components/project/EconomicAnalysisWorkbench.tsx", "utf8");
    const calculationSource = readFileSync("src/lib/calculations.ts", "utf8");

    assert.doesNotMatch(source, /EconomicAnalysis-v\d+R/i);
    assert.doesNotMatch(source, /DCF-Valuation-v\d+R/i);
    assert.doesNotMatch(source, /Model impact/i);
    assert.match(source, /EconomicClientYearTable/);
    assert.match(source, /financial-client-table/);
    assert.match(source, /نمای خام پیشرفته/);
    assert.doesNotMatch(calculationSource, /sourceLabel:\s*"EconomicAnalysis18!/);
  });
});
