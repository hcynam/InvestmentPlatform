import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  calculateDSCR,
  calculateFinancingEngine,
  calculateRemainingDebtByYear,
} from "../src/lib/financing-engine";
import type { FinancingAssumptions, FinancingInstrument, FinancingType, RepaymentMethod } from "../src/lib/types";

const baseInstrument = (
  patch: Partial<FinancingInstrument> & { id: string; type: FinancingType; repaymentMethod: RepaymentMethod },
): FinancingInstrument => ({
  id: patch.id,
  title: patch.title ?? patch.id,
  type: patch.type,
  active: true,
  amount: patch.amount ?? 1_000,
  annualRate: patch.annualRate ?? 0.1,
  feeRate: patch.feeRate ?? 0,
  graceEnabled: patch.graceEnabled ?? false,
  graceMonths: patch.graceMonths ?? 0,
  graceCostBehavior: patch.graceCostBehavior ?? "paidDuringGrace",
  repaymentTermMonths: patch.repaymentTermMonths ?? 24,
  paymentFrequency: patch.paymentFrequency ?? "annual",
  repaymentMethod: patch.repaymentMethod,
  balloonPercent: patch.balloonPercent ?? 0,
  stepRate: patch.stepRate ?? 0.05,
  upfrontPaymentPercent: patch.upfrontPaymentPercent ?? 0,
  blockedDepositPercent: patch.blockedDepositPercent ?? 0,
  blockedDepositOpportunityRate: patch.blockedDepositOpportunityRate ?? 0,
  guaranteeFeeRate: patch.guaranteeFeeRate ?? 0,
  collateralRequired: patch.collateralRequired ?? false,
  collateralItems: patch.collateralItems ?? [],
  collateralText: patch.collateralText ?? "",
  collateralValue: patch.collateralValue ?? 0,
  guaranteeRequired: patch.guaranteeRequired ?? false,
  guaranteeTypes: patch.guaranteeTypes ?? [],
  guaranteeValue: patch.guaranteeValue ?? 0,
  dividendPolicy: patch.dividendPolicy ?? "عدم تقسیم سود تا پایان دوره بازپرداخت",
  covenantsText: patch.covenantsText ?? "",
  covenantMinimumDscr: patch.covenantMinimumDscr ?? 1.25,
});

const assumptions = (instruments: FinancingInstrument[]): FinancingAssumptions => ({
  equity: 500,
  shortTermDebt: 0,
  longTermDebt: instruments.reduce((total, instrument) => total + instrument.amount, 0),
  gracePeriodYears: 0,
  interestRate: instruments[0]?.annualRate ?? 0,
  feeRate: 0,
  repaymentMethod: "قسط ثابت",
  repaymentYears: 2,
  collateral: "",
  targetDebtToEquity: 0.7,
  dividendPolicy: "عدم تقسیم سود تا پایان دوره بازپرداخت",
  lenderCovenants: "",
  loanType: "وام بانکی ساده",
  interestDuringGraceBehavior: "پرداخت بهره در تنفس",
  drawdown: { 0: instruments[0]?.amount ?? 0 },
  preferredShareAmount: 0,
  preferredDividendRate: 0,
  ordinaryDividendPayout: 0,
  targetDscr: 1.25,
  instruments,
  selectedDrawdownYears: [0],
  drawdownModel: "manual",
  drawdownRows: instruments.map((instrument) => ({ year: 0, instrumentId: instrument.id, amount: instrument.amount })),
});

describe("financing engine", () => {
  it("amortizes a fixed installment loan and closes the balance", () => {
    const output = calculateFinancingEngine(assumptions([
      baseInstrument({ id: "loan", type: "simpleBankLoan", repaymentMethod: "fixedInstallment", amount: 1_000, annualRate: 0.1, repaymentTermMonths: 24 }),
    ]), 3);

    assert.ok(output.schedule[1].debtService > output.schedule[1].principalRepayment);
    assert.ok(output.schedule[1].principalRepayment > 0);
    assert.equal(Math.round(output.schedule[2].endingBalance), 0);
  });

  it("calculates equal principal repayments", () => {
    const output = calculateFinancingEngine(assumptions([
      baseInstrument({ id: "equal", type: "simpleBankLoan", repaymentMethod: "equalPrincipal", amount: 1_200, annualRate: 0.12, repaymentTermMonths: 36 }),
    ]), 4);

    assert.equal(Math.round(output.schedule[1].principalRepayment), 400);
    assert.equal(Math.round(output.schedule[2].principalRepayment), 400);
    assert.equal(Math.round(output.schedule[3].endingBalance), 0);
  });

  it("keeps bullet principal until maturity", () => {
    const output = calculateFinancingEngine(assumptions([
      baseInstrument({ id: "bullet", type: "simpleBankLoan", repaymentMethod: "bullet", amount: 900, annualRate: 0.1, repaymentTermMonths: 36 }),
    ]), 4);

    assert.equal(Math.round(output.schedule[1].principalRepayment), 0);
    assert.equal(Math.round(output.schedule[2].principalRepayment), 0);
    assert.equal(Math.round(output.schedule[3].principalRepayment), 900);
    assert.equal(Math.round(output.schedule[3].endingBalance), 0);
  });

  it("treats qard al-hasan as service fee instead of compounding interest", () => {
    const output = calculateFinancingEngine(assumptions([
      baseInstrument({ id: "qard", type: "qardAlHasan", repaymentMethod: "equalPrincipal", amount: 1_000, annualRate: 0.04, repaymentTermMonths: 24 }),
    ]), 3);

    assert.ok(output.schedule[1].financingCost > 0);
    assert.ok(output.costByInstrument.qard > 0);
    assert.equal(Math.round(output.schedule[2].endingBalance), 0);
  });

  it("builds a murabaha installment schedule", () => {
    const output = calculateFinancingEngine(assumptions([
      baseInstrument({ id: "murabaha", type: "murabaha", repaymentMethod: "equalMurabahaInstallments", amount: 1_500, annualRate: 0.18, repaymentTermMonths: 36 }),
    ]), 4);

    assert.ok(output.schedule[1].debtService > 0);
    assert.ok(output.schedule[1].financingCost > 0);
    assert.equal(Math.round(output.costByInstrument.murabaha), 810);
    assert.equal(Math.round(output.schedule[3].endingBalance), 0);
  });

  it("keeps Murabaha and Juala contract costs distinct from reducing-balance loan interest", () => {
    const murabaha = calculateFinancingEngine(assumptions([
      baseInstrument({ id: "m", type: "murabaha", repaymentMethod: "equalMurabahaInstallments", amount: 1_000, annualRate: 0.1, repaymentTermMonths: 24 }),
    ]), 3);
    const juala = calculateFinancingEngine(assumptions([
      baseInstrument({ id: "j", type: "juala", repaymentMethod: "milestoneBased", amount: 1_000, annualRate: 0.1, repaymentTermMonths: 24 }),
    ]), 3);
    assert.equal(Math.round(murabaha.costByInstrument.m), 200);
    assert.equal(Math.round(juala.costByInstrument.j), 100);
    assert.notEqual(Math.round(murabaha.schedule[1].principalRepayment), Math.round(juala.schedule[1].principalRepayment));
  });

  it("calculates collateral and guarantee coverage from structured values", () => {
    const output = calculateFinancingEngine(assumptions([
      baseInstrument({ id: "secured", type: "simpleBankLoan", repaymentMethod: "equalPrincipal", amount: 1_000, collateralRequired: true, collateralValue: 1_250, guaranteeRequired: true, guaranteeValue: 300 }),
    ]), 3);
    assert.equal(output.kpis.collateralCoverage, 1.25);
    assert.equal(output.kpis.loanToCollateral, 0.8);
    assert.equal(output.kpis.totalGuaranteeValue, 300);
  });

  it("pays financing cost during grace when selected", () => {
    const output = calculateFinancingEngine(assumptions([
      baseInstrument({
        id: "grace-paid",
        type: "simpleBankLoan",
        repaymentMethod: "fixedInstallment",
        amount: 1_000,
        annualRate: 0.1,
        graceEnabled: true,
        graceMonths: 12,
        graceCostBehavior: "paidDuringGrace",
        repaymentTermMonths: 24,
      }),
    ]), 4);

    assert.equal(Math.round(output.schedule[1].principalRepayment), 0);
    assert.ok(output.schedule[1].debtService > 0);
    assert.equal(Math.round(output.schedule[1].endingBalance), 1_000);
  });

  it("capitalizes financing cost during grace when selected", () => {
    const output = calculateFinancingEngine(assumptions([
      baseInstrument({
        id: "grace-cap",
        type: "simpleBankLoan",
        repaymentMethod: "fixedInstallment",
        amount: 1_000,
        annualRate: 0.1,
        graceEnabled: true,
        graceMonths: 12,
        graceCostBehavior: "capitalizedToPrincipal",
        repaymentTermMonths: 24,
      }),
    ]), 4);

    assert.equal(Math.round(output.schedule[1].debtService), 0);
    assert.ok(output.schedule[1].endingBalance > 1_000);
  });

  it("aggregates multiple instruments into one annual debt service schedule", () => {
    const output = calculateFinancingEngine(assumptions([
      baseInstrument({ id: "bank", type: "simpleBankLoan", repaymentMethod: "fixedInstallment", amount: 1_000, annualRate: 0.1 }),
      baseInstrument({ id: "qard", type: "qardAlHasan", repaymentMethod: "equalPrincipal", amount: 300, annualRate: 0.04 }),
    ]), 3);

    assert.equal(output.schedule[0].drawdown, 1_300);
    assert.ok(output.schedule[1].debtService > output.instrumentSchedules.find((row) => row.instrumentId === "bank" && row.year === 1)!.totalDebtService);
    assert.equal(Object.keys(output.remainingDebtByInstrument).length, 2);
  });

  it("uses external CAPEX drivers for non-manual drawdown models instead of stale manual rows", () => {
    const input = assumptions([
      baseInstrument({ id: "driven", type: "simpleBankLoan", repaymentMethod: "bullet", amount: 1_000, annualRate: 0.1, repaymentTermMonths: 36 }),
    ]);
    input.drawdownModel = "capexPercent";
    input.selectedDrawdownYears = [0];
    input.drawdownRows = [{ year: 0, instrumentId: "driven", amount: 1_000 }];

    const output = calculateFinancingEngine(input, 4, {
      capexByYear: { 0: 100, 1: 300, 2: 600 },
    });

    assert.equal(Math.round(output.schedule[0].drawdown), 100);
    assert.equal(Math.round(output.schedule[1].drawdown), 300);
    assert.equal(Math.round(output.schedule[2].drawdown), 600);
    assert.equal(Math.round(output.schedule.reduce((total, row) => total + row.drawdown, 0)), 1_000);
  });

  it("calculates remaining debt by selected year", () => {
    const output = calculateFinancingEngine(assumptions([
      baseInstrument({ id: "remaining", type: "simpleBankLoan", repaymentMethod: "equalPrincipal", amount: 1_000, annualRate: 0.1, repaymentTermMonths: 24 }),
    ]), 3);
    const remaining = calculateRemainingDebtByYear(output.schedule);

    assert.equal(Math.round(remaining[1]), 500);
    assert.equal(Math.round(remaining[2]), 0);
  });

  it("returns null DSCR when debt service is zero", () => {
    assert.equal(calculateDSCR(1_000, 0), null);
  });
});
