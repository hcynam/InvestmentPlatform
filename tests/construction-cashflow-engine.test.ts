import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildConstructionCashFlowTable,
  calculateBufferMonths,
  calculateMonthlyCostSchedule,
  calculateMonthlyRateFromAnnual,
  getAnalysisMonthOptions,
  normalizeConstructionAssumptions,
} from "../src/lib/construction-cashflow-engine";
import { seedProject } from "../src/lib/seed";
import type { ConstructionAssumptions, ConstructionCostItem, Project } from "../src/lib/types";

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const closeTo = (actual: number, expected: number, tolerance = 1e-6) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} is not within ${tolerance} of ${expected}`);
};

const costItem = (patch: Partial<ConstructionCostItem> & { id: string; baseAmount: number }): ConstructionCostItem => ({
  id: patch.id,
  title: patch.title ?? patch.id,
  baseAmount: patch.baseAmount,
  active: patch.active ?? true,
  isMonthly: patch.isMonthly ?? true,
  selectedMonths: patch.selectedMonths ?? [1],
  inflationIndexed: patch.inflationIndexed ?? false,
  fxIndexed: patch.fxIndexed ?? false,
  fxShare: patch.fxShare ?? 0,
  rialShare: patch.rialShare ?? 1,
  distributionMode: patch.distributionMode ?? "repeatMonthly",
  description: patch.description ?? "",
  isCustom: patch.isCustom ?? false,
  manualMonthPercents: patch.manualMonthPercents,
});

const makeInput = (patch: Partial<ConstructionAssumptions> = {}) => {
  const project = clone(seedProject) as Project;
  project.constructionDurationMonths = 3;
  project.constructionStartDate = "2026-01-01";
  project.baseYear = 2026;

  const scenario = project.scenarios[0];
  const assumptions: ConstructionAssumptions = {
    ...clone(scenario.assumptions.construction),
    analysisMonths: 6,
    bufferMonths: 3,
    monthlyAdjustmentEnabled: true,
    monthlyInflationRate: 0.01,
    monthlyFxGrowthRate: 0.02,
    monthlyDevelopmentPayroll: 0,
    monthlyContractorCost: 0,
    monthlyInfrastructureCost: 0,
    monthlyTestingCost: 0,
    deploymentTrainingCost: 0,
    delayMonthlyCost: 0,
    minimumCashReserve: 0,
    creditLineEnabled: false,
    creditLineCap: 0,
    creditLineRate: 0,
    creditLineFeeRate: 0,
    delayScenarioEnabled: false,
    delayAdjustmentRate: 0,
    allowedDelayMonths: 0,
    actualDelayMonths: 0,
    capexMilestones: [
      { id: "prepayment", title: "prepayment", percent: 0.2, paymentMonth: 1, active: true },
      { id: "delivery", title: "delivery", percent: 0.3, paymentMonth: 2, active: true },
      { id: "postInstallation", title: "post-installation", percent: 0.5, paymentMonth: 3, active: true },
    ],
    costItems: [],
    ...patch,
  };

  return {
    project,
    assumptions,
    macro: { ...clone(scenario.assumptions.macro), inflationRate: 0.12, fxGrowthRate: 0.24 },
    capex: { totalCapex: 1_000, rialCapex: 500, fxCapex: 500, delayCost: 0 },
    financing: { ...clone(scenario.assumptions.financing), equity: 0, longTermDebt: 0, shortTermDebt: 0 },
  };
};

describe("construction cash-flow engine", () => {
  it("builds the allowed analysis-month range from development duration", () => {
    const options = getAnalysisMonthOptions(9);

    assert.equal(options.length, 13);
    assert.equal(options[0], 9);
    assert.equal(options.at(-1), 21);
    assert.equal(calculateBufferMonths(12, 9), 3);
  });

  it("converts annual rates to monthly compound rates", () => {
    closeTo(calculateMonthlyRateFromAnnual(0.12), (1.12 ** (1 / 12)) - 1);
    closeTo(calculateMonthlyRateFromAnnual(0.12, "simple"), 0.01);
  });

  it("allocates milestone CAPEX and applies inflation plus FX adjustment", () => {
    const output = buildConstructionCashFlowTable(makeInput());
    const monthTwo = output.rows[1];

    assert.equal(monthTwo.plannedCapex, 300);
    closeTo(monthTwo.adjustedCapex, 304.5);
    closeTo(output.rows.reduce((total, row) => total + row.plannedCapex, 0), 1_000);
  });

  it("calculates monthly cost schedules by selected months and split mode", () => {
    const controls = normalizeConstructionAssumptions(makeInput({
      costItems: [
        costItem({ id: "monthly", baseAmount: 10, isMonthly: true, selectedMonths: [1, 2] }),
        costItem({ id: "split", baseAmount: 90, isMonthly: false, selectedMonths: [2, 4], distributionMode: "equalSplitAcrossSelectedMonths" }),
      ],
    }));
    const schedule = calculateMonthlyCostSchedule(controls);

    assert.equal(schedule.get(1)?.monthly, 10);
    assert.equal(schedule.get(2)?.monthly, 10);
    assert.equal(schedule.get(2)?.split, 45);
    assert.equal(schedule.get(4)?.split, 45);
  });

  it("charges delay cost only after the allowed delay window", () => {
    const output = buildConstructionCashFlowTable(makeInput({
      monthlyAdjustmentEnabled: false,
      delayScenarioEnabled: true,
      delayMonthlyCost: 100,
      allowedDelayMonths: 1,
      actualDelayMonths: 3,
    }));

    assert.equal(output.controls.effectiveDelayMonths, 2);
    assert.equal(output.rows[2].delayCost, 0);
    assert.equal(output.rows[3].delayCost, 100);
    assert.equal(output.rows[4].delayCost, 100);
    assert.equal(output.rows[5].delayCost, 0);
  });

  it("uses the development credit line to cover construction cash crunch", () => {
    const withoutCredit = buildConstructionCashFlowTable(makeInput({
      minimumCashReserve: 100,
      capexMilestones: [{ id: "prepayment", title: "single", percent: 1, paymentMonth: 1, active: true }],
    }));
    const withCredit = buildConstructionCashFlowTable(makeInput({
      minimumCashReserve: 100,
      creditLineEnabled: true,
      creditLineCap: 2_000,
      capexMilestones: [{ id: "prepayment", title: "single", percent: 1, paymentMonth: 1, active: true }],
    }));

    assert.equal(withoutCredit.rows[0].cashCrunchFlag, "Cash Crunch");
    assert.notEqual(withCredit.rows[0].cashCrunchFlag, "Cash Crunch");
    assert.equal(withCredit.rows[0].creditLineDraw, 1_100);
    assert.equal(withCredit.kpis.totalCreditLineDraw, 1_100);
  });

  it("uses scheduled financing drawdowns in the matching construction month", () => {
    const input = makeInput({
      capexMilestones: [{ id: "prepayment", title: "single", percent: 1, paymentMonth: 1, active: true }],
    });
    input.financing = {
      ...input.financing,
      equity: 0,
      longTermDebt: 1_000,
      instruments: input.financing.instruments!.map((instrument, index) => ({
        ...instrument,
        active: index === 0,
        amount: index === 0 ? 1_000 : instrument.amount,
      })),
      drawdownRows: [{ year: 0, instrumentId: "facility-main-bank", amount: 400 }],
    };

    const output = buildConstructionCashFlowTable(input);

    assert.equal(output.controls.hasScheduledDebtDrawdown, true);
    assert.equal(output.rows[0].debtDrawdown, 400);
    assert.equal(output.rows[1].debtDrawdown, 0);
    assert.equal(output.kpis.totalNonEquityFundingDrawdown, 400);
    assert.equal(output.rows[0].cashCrunchFlag, "Cash Crunch");
  });

  it("flags invalid payment percentages and never emits non-finite numeric rows", () => {
    const output = buildConstructionCashFlowTable(makeInput({
      capexMilestones: [
        { id: "prepayment", title: "prepayment", percent: 0.2, paymentMonth: 1, active: true },
        { id: "delivery", title: "delivery", percent: 0.3, paymentMonth: 2, active: true },
      ],
    }));
    const paymentCheck = output.controlsResult.find((item) => item.id === "payment-percent");

    assert.ok(paymentCheck);
    assert.notEqual(paymentCheck?.status, "OK");
    output.rows.forEach((row) => {
      [
        row.plannedCapex,
        row.adjustedCapex,
        row.totalCashOutflow,
        row.totalCashInflow,
        row.endingCash,
        row.minimumCashRequired,
        row.cashShortfall ?? 0,
        row.creditLineBalance ?? 0,
      ].forEach((value) => assert.equal(Number.isFinite(value), true));
      assert.ok(row.cashCrunchFlag);
    });
  });
});
