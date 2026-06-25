import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { calculateScenario } from "../src/lib/calculations";
import { seedProject } from "../src/lib/seed";
import type { Project } from "../src/lib/types";

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const closeTo = (actual: number, expected: number, tolerance = 1) => Math.abs(actual - expected) <= tolerance;
const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

const disableDebt = (project: Project, equity = 2_300_000_000_000) => {
  const financing = project.scenarios[0].assumptions.financing;
  financing.equity = equity;
  financing.longTermDebt = 0;
  financing.shortTermDebt = 0;
  financing.drawdown = {};
  financing.drawdownRows = [];
  financing.selectedDrawdownYears = [0];
  financing.instruments = (financing.instruments ?? []).map((instrument) => ({
    ...instrument,
    active: false,
    amount: 0,
  }));
  return project;
};

describe("calculation engine", () => {
  it("builds full annual statements from year 0 to model horizon", () => {
    const project = clone(seedProject);
    const outputs = calculateScenario(project);

    assert.equal(outputs.statements.rows.length, project.modelHorizonYears + 1);
    assert.equal(outputs.statements.rows[0].year, 0);
    assert.equal(outputs.statements.rows.at(-1)?.year, 20);
    assert.equal(outputs.valuation.fcffByYear.length, 21);
  });

  it("ties out funded balance-sheet years with explicit accounting components", () => {
    const project = clone(seedProject);
    const outputs = calculateScenario(project);
    const rowsBeforeFinalRelease = outputs.statements.rows.filter((row) => row.year < project.modelHorizonYears);
    const unbalancedYears = rowsBeforeFinalRelease.filter((row) => row.balanceStatus !== "balanced").map((row) => row.year);
    const yearOne = outputs.statements.rows[1];

    assert.deepEqual(unbalancedYears, []);
    assert.ok(closeTo(yearOne.totalAssets, yearOne.cash + yearOne.operatingCurrentAssets + yearOne.netFixedAssets));
    assert.ok(closeTo(yearOne.totalLiabilitiesAndEquity, yearOne.debt + yearOne.operatingCurrentLiabilities + yearOne.equity));
    assert.ok(closeTo(yearOne.operatingCurrentAssets, yearOne.receivables + yearOne.inventory + yearOne.prepayments + yearOne.minimumCash));
    assert.ok(closeTo(yearOne.operatingCurrentLiabilities, yearOne.payables + yearOne.accruedExpenses + yearOne.otherCurrentLiabilities));
  });

  it("creates a real loan schedule with debt service and remaining balance", () => {
    const project = clone(seedProject);
    const outputs = calculateScenario(project);
    const paidYears = outputs.financing.schedule.filter((row) => row.debtService > 0);

    assert.ok(paidYears.length > 0);
    assert.ok(Math.abs(outputs.financing.schedule.at(-1)?.endingBalance ?? 0) < 1);
    assert.ok(outputs.financing.totalInterest > 0);
  });

  it("maps debt financing into statements, FCFE and balance-sheet debt", () => {
    const project = clone(seedProject);
    const outputs = calculateScenario(project);
    const drawdownYear = outputs.statements.rows.find((row) => row.debtDrawdown > 0);
    const repaymentYear = outputs.statements.rows.find((row) => row.principalRepayment > 0);

    assert.ok(drawdownYear);
    assert.ok(repaymentYear);
    assert.ok(drawdownYear.fcfe > drawdownYear.fcff);
    assert.ok(repaymentYear.fcfe < repaymentYear.fcff);
    assert.ok(closeTo(drawdownYear.debt, outputs.financing.schedule[drawdownYear.year].endingBalance + drawdownYear.shortTermFunding));
  });

  it("keeps FCFE equal to FCFF in an equity-financed case with no debt service", () => {
    const project = disableDebt(clone(seedProject) as Project);
    const outputs = calculateScenario(project);

    assert.equal(sum(outputs.statements.rows.map((row) => row.debtDrawdown)), 0);
    assert.equal(sum(outputs.statements.rows.map((row) => row.principalRepayment)), 0);
    assert.ok(outputs.statements.rows.every((row) => closeTo(row.fcfe, row.fcff, 0.01)));
    assert.equal(outputs.statements.rows[0].paidInCapital, project.scenarios[0].assumptions.financing.equity);
  });

  it("flows working-capital changes through cash flow and current balance-sheet accounts", () => {
    const baseOutputs = calculateScenario(clone(seedProject));
    const stressedProject = clone(seedProject) as Project;
    stressedProject.scenarios[0].assumptions.workingCapital.receivableDays = 120;
    const stressedOutputs = calculateScenario(stressedProject);
    const baseYearOne = baseOutputs.statements.rows[1];
    const stressedYearOne = stressedOutputs.statements.rows[1];

    assert.ok(stressedYearOne.changeInWorkingCapital > baseYearOne.changeInWorkingCapital);
    assert.ok(stressedYearOne.receivables > baseYearOne.receivables);
    assert.ok(closeTo(stressedYearOne.operatingCurrentAssets, stressedYearOne.receivables + stressedYearOne.inventory + stressedYearOne.prepayments + stressedYearOne.minimumCash));
    assert.ok(closeTo(stressedYearOne.cfo, stressedYearOne.netProfit + stressedYearOne.depreciation - stressedYearOne.changeInWorkingCapital));
  });

  it("keeps the final out-of-balance case diagnostic instead of silently plugging it", () => {
    const project = clone(seedProject);
    const outputs = calculateScenario(project);
    const finalYear = outputs.statements.rows.at(-1);

    assert.equal(finalYear?.balanceStatus, "out-of-balance");
    assert.match(finalYear?.balanceDiagnostic ?? "", /Balance mismatch/);
    assert.ok(outputs.validations.some((item) => item.id === `statements.balance-${project.modelHorizonYears}`));
  });

  it("does not propagate Excel #N/A tax errors into year 20", () => {
    const project = clone(seedProject);
    const outputs = calculateScenario(project);
    const finalTax = outputs.tax.rows.at(-1);

    assert.equal(finalTax?.year, 20);
    assert.equal(Number.isFinite(finalTax?.tax ?? Number.NaN), true);
    assert.equal(Number.isFinite(finalTax?.lossCarryForward ?? Number.NaN), true);
  });

  it("recalculates valuation when an editable input changes", () => {
    const baseProject = clone(seedProject);
    const highPriceProject = clone(seedProject) as Project;
    highPriceProject.scenarios[0].assumptions.market.baseSalesPrice *= 1.25;

    const baseNpv = calculateScenario(baseProject).valuation.npv;
    const highPriceNpv = calculateScenario(highPriceProject).valuation.npv;

    assert.notEqual(baseNpv, highPriceNpv);
    assert.ok(highPriceNpv > baseNpv);
  });

  it("publishes FCFF, FCFE and nominal/real valuation series without mock values", () => {
    const project = clone(seedProject);
    const outputs = calculateScenario(project);
    const valuation = outputs.valuation;

    assert.equal(valuation.nominalFcffByYear.length, project.modelHorizonYears + 1);
    assert.equal(valuation.realFcffByYear.length, project.modelHorizonYears + 1);
    assert.equal(valuation.nominalFcfeByYear.length, project.modelHorizonYears + 1);
    assert.equal(valuation.realFcfeByYear.length, project.modelHorizonYears + 1);
    assert.ok(closeTo(valuation.realFcffByYear[1], valuation.nominalFcffByYear[1] / (1 + valuation.inflationRate), 0.01));
    assert.ok(Number.isFinite(valuation.nominalFcffNpv));
    assert.ok(valuation.realFcffNpv === null || Number.isFinite(valuation.realFcffNpv));
    assert.ok(valuation.fcffIrr !== null);
    assert.ok(valuation.fcfeIrr !== null);
  });

  it("switches active valuation output between nominal and real calculation bases", () => {
    const nominalProject = clone(seedProject) as Project;
    nominalProject.scenarios[0].assumptions.macro.calculationBasis = "اسمی";
    const realProject = clone(seedProject) as Project;
    realProject.scenarios[0].assumptions.macro.calculationBasis = "واقعی";

    const nominalOutputs = calculateScenario(nominalProject);
    const realOutputs = calculateScenario(realProject);

    assert.equal(nominalOutputs.valuation.fcffByYear[1], nominalOutputs.valuation.nominalFcffByYear[1]);
    assert.equal(realOutputs.valuation.fcffByYear[1], realOutputs.valuation.realFcffByYear[1]);
    assert.equal(nominalOutputs.valuation.appliedDiscountRate, nominalOutputs.valuation.nominalDiscountRate);
    assert.equal(realOutputs.valuation.appliedDiscountRate, realOutputs.valuation.realDiscountRate);
  });

  it("keeps invalid valuation rates safe and explicitly diagnosed", () => {
    const project = clone(seedProject) as Project;
    project.scenarios[0].assumptions.macro.defaultDiscountRate = -1;
    const outputs = calculateScenario(project);

    assert.equal(outputs.valuation.metrics.npv.status, "invalid_input");
    assert.equal(Number.isFinite(outputs.valuation.npv), true);
    assert.ok(outputs.valuation.discountedFcffByYear.every((value) => Number.isFinite(value)));
    assert.ok(outputs.valuation.diagnostics.length > 0);
  });
});
