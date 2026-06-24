import type {
  DebtScheduleRow,
  DrawdownModel,
  DrawdownRow,
  FinancingAssumptions,
  FinancingInstrument,
  FinancingKpis,
  FinancingType,
  GraceCostBehavior,
  InterestDuringGraceBehavior,
  LoanScheduleRow,
  PaymentFrequency,
  RepaymentMethod,
} from "@/lib/types";

const EPSILON = 1e-6;

export const financingTypeLabels: Record<FinancingType, string> = {
  simpleBankLoan: "وام بانکی ساده",
  qardAlHasan: "قرض‌الحسنه",
  murabaha: "مرابحه",
  installmentSale: "فروش اقساطی",
  juala: "جعاله",
  custom: "روش سفارشی",
};

export const costColumnLabels: Record<FinancingType, string> = {
  simpleBankLoan: "بهره وام بانکی ساده",
  qardAlHasan: "کارمزد قرض‌الحسنه",
  murabaha: "سود مرابحه",
  installmentSale: "سود فروش اقساطی",
  juala: "جعل / کارمزد جعاله",
  custom: "هزینه مالی سفارشی",
};

export const repaymentMethodsByType: Record<FinancingType, RepaymentMethod[]> = {
  simpleBankLoan: [
    "fixedInstallment",
    "equalPrincipal",
    "stepUp",
    "stepDown",
    "interestOnlyThenFixed",
    "interestOnlyThenEqualPrincipal",
    "bullet",
    "balloon",
    "custom",
  ],
  qardAlHasan: [
    "equalPrincipal",
    "fixedInstallment",
    "interestOnlyThenEqualPrincipal",
    "custom",
  ],
  murabaha: [
    "equalMurabahaInstallments",
    "unequalInstallments",
    "deferredLumpSum",
    "stepUp",
    "custom",
  ],
  installmentSale: [
    "fixedInstallment",
    "unequalInstallments",
    "stepUp",
    "balloon",
    "custom",
  ],
  juala: [
    "milestoneBased",
    "fixedInstallment",
    "unequalInstallments",
    "deferredLumpSum",
    "custom",
  ],
  custom: [
    "fixedInstallment",
    "equalPrincipal",
    "stepUp",
    "stepDown",
    "interestOnlyThenFixed",
    "interestOnlyThenEqualPrincipal",
    "bullet",
    "balloon",
    "deferredLumpSum",
    "equalMurabahaInstallments",
    "unequalInstallments",
    "milestoneBased",
    "custom",
  ],
};

export const repaymentMethodLabels: Record<RepaymentMethod, string> = {
  fixedInstallment: "قسط ثابت",
  equalPrincipal: "اصل مساوی",
  stepUp: "اقساط پلکانی افزایشی",
  stepDown: "اقساط پلکانی کاهشی",
  interestOnlyThenFixed: "سود فقط در دوره تنفس، سپس قسط ثابت",
  interestOnlyThenEqualPrincipal: "سود فقط در دوره تنفس، سپس اصل مساوی",
  bullet: "یکجا در سررسید",
  balloon: "بالون / پرداخت عمده در سررسید",
  deferredLumpSum: "نسیه دفعی / سررسیدی",
  equalMurabahaInstallments: "نسیه اقساطی مساوی",
  unequalInstallments: "اقساط غیرمساوی",
  milestoneBased: "پرداخت مرحله‌ای بر اساس پیشرفت کار",
  custom: "برنامه سفارشی",
  "قسط ثابت": "قسط ثابت",
  "اصل مساوی": "اصل مساوی",
  "سود فقط سپس اصل در سررسید": "سود فقط سپس اصل در سررسید",
  "یکجا در سررسید": "یکجا در سررسید",
};

export const graceBehaviorLabels: Record<GraceCostBehavior, string> = {
  paidDuringGrace: "پرداخت سود/کارمزد در تنفس",
  capitalizedToPrincipal: "انباشت در اصل بدهی",
  capitalizedDuringConstruction: "سرمایه‌ای شدن در دوره ساخت",
  noCostDuringGrace: "عدم محاسبه در دوره تنفس",
};

const frequencyPerYear: Record<PaymentFrequency, number> = {
  monthly: 12,
  quarterly: 4,
  semiAnnual: 2,
  annual: 1,
};

const legacyTypeMap: Record<string, FinancingType> = {
  "وام بانکی ساده": "simpleBankLoan",
  "قرض‌الحسنه": "qardAlHasan",
  "مرابحه": "murabaha",
  "فروش اقساطی": "installmentSale",
  "جعاله": "juala",
};

const legacyGraceMap: Record<InterestDuringGraceBehavior, GraceCostBehavior> = {
  "پرداخت بهره در تنفس": "paidDuringGrace",
  "انباشت بهره در اصل بدهی": "capitalizedToPrincipal",
  "عدم محاسبه بهره در تنفس": "noCostDuringGrace",
};

export const normalizeRepaymentMethod = (method: RepaymentMethod): RepaymentMethod => {
  if (method === "قسط ثابت") return "fixedInstallment";
  if (method === "اصل مساوی") return "equalPrincipal";
  if (method === "سود فقط سپس اصل در سررسید") return "interestOnlyThenEqualPrincipal";
  if (method === "یکجا در سررسید") return "bullet";
  return method;
};

const finite = (value: number | null | undefined, fallback = 0) =>
  Number.isFinite(value ?? Number.NaN) ? Number(value) : fallback;

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const sum = (values: number[]) => values.reduce((total, value) => total + finite(value), 0);

const pmt = (rate: number, periods: number, principal: number) => {
  if (periods <= 0 || principal <= 0) return 0;
  if (Math.abs(rate) < EPSILON) return principal / periods;
  return (principal * rate) / (1 - (1 + rate) ** -periods);
};

export const calculateDSCR = (cfads: number, debtService: number) => {
  if (debtService <= EPSILON) return null;
  const value = cfads / debtService;
  return Number.isFinite(value) ? value : null;
};

export const dscrStatus = (dscr: number | null) => {
  if (dscr === null) return "بدون خدمت بدهی";
  if (dscr < 1) return "عدم کفایت جریان نقد";
  if (dscr < 1.2) return "مرزی";
  if (dscr < 1.5) return "قابل بررسی";
  return "مناسب";
};

export const dscrBadge = (dscr: number | null) => {
  if (dscr === null) return "بدون خدمت بدهی";
  if (dscr < 1) return "بحرانی";
  if (dscr < 1.2) return "پرریسک";
  if (dscr < 1.5) return "قابل بررسی";
  return "مناسب";
};

const defaultInstrumentForType = (type: FinancingType, id: string): FinancingInstrument => ({
  id,
  title: financingTypeLabels[type],
  type,
  active: true,
  amount: 0,
  annualRate: type === "qardAlHasan" ? 0.04 : 0.2,
  feeRate: 0,
  graceEnabled: false,
  graceMonths: 0,
  graceCostBehavior: "paidDuringGrace",
  repaymentTermMonths: 60,
  paymentFrequency: "annual",
  repaymentMethod: repaymentMethodsByType[type][0],
  balloonPercent: type === "installmentSale" ? 0.2 : 0,
  stepRate: 0.05,
  upfrontPaymentPercent: 0,
  blockedDepositPercent: 0,
  blockedDepositOpportunityRate: 0,
  guaranteeFeeRate: 0,
  collateralRequired: type !== "qardAlHasan",
  collateralItems: [],
  collateralText: "",
  guaranteeRequired: false,
  guaranteeTypes: [],
  dividendPolicy: "عدم تقسیم سود تا پایان دوره بازپرداخت",
  covenantsText: "",
});

export const createFinancingInstrument = (type: FinancingType, seed?: Partial<FinancingInstrument>) => ({
  ...defaultInstrumentForType(type, `${type}-${Date.now()}`),
  ...seed,
  type,
});

export const normalizeFinancingAssumptions = (assumptions: FinancingAssumptions) => {
  const legacyType = legacyTypeMap[assumptions.loanType] ?? "simpleBankLoan";
  const legacyId = "facility-main-bank";
  const legacyInstrument = createFinancingInstrument(legacyType, {
    id: legacyId,
    title: assumptions.loanType || financingTypeLabels[legacyType],
    amount: finite(assumptions.longTermDebt),
    annualRate: legacyType === "qardAlHasan" ? finite(assumptions.feeRate, 0.04) || 0.04 : finite(assumptions.interestRate),
    feeRate: legacyType === "qardAlHasan" ? 0 : finite(assumptions.feeRate),
    graceEnabled: finite(assumptions.gracePeriodYears) > 0,
    graceMonths: Math.max(0, Math.round(finite(assumptions.gracePeriodYears) * 12)),
    graceCostBehavior: legacyGraceMap[assumptions.interestDuringGraceBehavior] ?? "paidDuringGrace",
    repaymentTermMonths: Math.max(12, Math.round(finite(assumptions.repaymentYears, 1) * 12)),
    paymentFrequency: "annual",
    repaymentMethod: normalizeRepaymentMethod(assumptions.repaymentMethod),
    collateralRequired: Boolean(assumptions.collateral),
    collateralItems: assumptions.collateral ? [assumptions.collateral] : [],
    collateralText: assumptions.collateral,
    dividendPolicy: assumptions.dividendPolicy,
    covenantsText: assumptions.lenderCovenants,
  });

  const instruments = (assumptions.instruments?.length ? assumptions.instruments : [legacyInstrument])
    .map((instrument) => ({
      ...defaultInstrumentForType(instrument.type, instrument.id),
      ...instrument,
      annualRate: instrument.type === "qardAlHasan" && !Number.isFinite(instrument.annualRate)
        ? 0.04
        : finite(instrument.annualRate),
      repaymentMethod: normalizeRepaymentMethod(instrument.repaymentMethod),
    }));

  const primaryId = instruments.find((instrument) => instrument.active)?.id ?? instruments[0]?.id ?? legacyId;
  const legacyDrawdowns: DrawdownRow[] = Object.entries(assumptions.drawdown ?? {}).map(([year, amount]) => ({
    year: Number(year),
    instrumentId: primaryId,
    amount: finite(amount),
  }));

  const drawdownRows = assumptions.drawdownRows?.length ? assumptions.drawdownRows : legacyDrawdowns;
  const selectedDrawdownYears = assumptions.selectedDrawdownYears?.length
    ? assumptions.selectedDrawdownYears
    : Array.from(new Set(drawdownRows.map((row) => row.year))).sort((a, b) => a - b);

  return {
    ...assumptions,
    instruments,
    drawdownRows,
    selectedDrawdownYears: selectedDrawdownYears.length ? selectedDrawdownYears : [0],
    drawdownModel: assumptions.drawdownModel ?? "manual",
  };
};

export const calculateDrawdownSchedule = (
  instruments: FinancingInstrument[],
  drawdownRows: DrawdownRow[],
  years: number[],
  model: DrawdownModel = "manual",
) => {
  const active = instruments.filter((instrument) => instrument.active);
  const keyed = new Map<string, number>();
  drawdownRows.forEach((row) => {
    const key = `${row.year}::${row.instrumentId}`;
    keyed.set(key, finite(row.amount));
  });

  if (model !== "manual") {
    active.forEach((instrument) => {
      const totalEntered = sum(years.map((year) => keyed.get(`${year}::${instrument.id}`) ?? 0));
      if (totalEntered > EPSILON || instrument.amount <= EPSILON) return;
      const weights = years.map((year, index) => {
        if (model === "equalYears") return 1;
        if (model === "frontLoaded") return years.length - index;
        if (model === "backLoaded") return index + 1;
        if (model === "lumpSumAtStart") return index === 0 ? 1 : 0;
        if (model === "lumpSumAtEnd") return index === years.length - 1 ? 1 : 0;
        if (model === "sCurve") {
          const x = years.length <= 1 ? 1 : index / (years.length - 1);
          return Math.max(0.05, 1 / (1 + Math.exp(-10 * (x - 0.5))));
        }
        return 1;
      });
      const totalWeight = Math.max(EPSILON, sum(weights));
      years.forEach((year, index) => {
        keyed.set(`${year}::${instrument.id}`, instrument.amount * weights[index] / totalWeight);
      });
    });
  }

  return years.flatMap((year) =>
    active.map((instrument) => ({
      year,
      instrumentId: instrument.id,
      amount: finite(keyed.get(`${year}::${instrument.id}`)),
      percentOfInstrument: instrument.amount > EPSILON ? finite(keyed.get(`${year}::${instrument.id}`)) / instrument.amount : 0,
    })),
  );
};

const repaymentFamily = (method: RepaymentMethod) => {
  const normalized = normalizeRepaymentMethod(method);
  if (normalized === "equalMurabahaInstallments") return "fixed";
  if (normalized === "deferredLumpSum") return "bullet";
  if (normalized === "unequalInstallments" || normalized === "milestoneBased" || normalized === "custom") return "equal";
  if (normalized === "interestOnlyThenFixed") return "fixed";
  if (normalized === "interestOnlyThenEqualPrincipal") return "equal";
  if (normalized === "stepUp") return "stepUp";
  if (normalized === "stepDown") return "stepDown";
  if (normalized === "balloon") return "balloon";
  if (normalized === "bullet") return "bullet";
  if (normalized === "equalPrincipal") return "equal";
  return "fixed";
};

const rowForYear = (rows: DebtScheduleRow[], year: number, instrument: FinancingInstrument): DebtScheduleRow => ({
  year,
  instrumentId: instrument.id,
  instrumentTitle: instrument.title,
  instrumentType: instrument.type,
  drawdown: 0,
  openingDebt: 0,
  financingCost: 0,
  cashFinancingCost: 0,
  financingFees: 0,
  guaranteeFee: 0,
  blockedDepositOpportunityCost: 0,
  capitalizedCost: 0,
  principalRepayment: 0,
  totalDebtService: 0,
  closingDebt: 0,
  cfads: 0,
  dscr: null,
  status: "بدون خدمت بدهی",
});

export const calculateInstrumentDebtSchedule = (
  instrument: FinancingInstrument,
  drawdowns: DrawdownRow[],
  modelHorizonYears: number,
) => {
  const years = Array.from({ length: modelHorizonYears + 1 }, (_, year) => year);
  const periodPerYear = frequencyPerYear[instrument.paymentFrequency] ?? 1;
  const periodRate = instrument.type === "qardAlHasan" ? finite(instrument.annualRate, 0.04) / periodPerYear : finite(instrument.annualRate) / periodPerYear;
  const sideFeeRate = finite(instrument.feeRate) / periodPerYear;
  const guaranteeRate = finite(instrument.guaranteeFeeRate) / periodPerYear;
  const blockedRate = finite(instrument.blockedDepositOpportunityRate) * finite(instrument.blockedDepositPercent) / periodPerYear;
  const gracePeriods = instrument.graceEnabled ? Math.max(0, Math.ceil(finite(instrument.graceMonths) / (12 / periodPerYear))) : 0;
  const repaymentPeriods = Math.max(1, Math.ceil(finite(instrument.repaymentTermMonths, 12) / (12 / periodPerYear)));
  const methodFamily = repaymentFamily(instrument.repaymentMethod);
  const rows: DebtScheduleRow[] = [];
  let balance = 0;
  let amortizationBase: number | null = null;
  let fixedPayment = 0;
  let balloonBase = 0;
  let openingForYear = 0;

  years.forEach((year) => {
    rows.push(rowForYear(rows, year, instrument));
  });

  for (let year = 0; year <= modelHorizonYears; year += 1) {
    const row = rows[year];
    openingForYear = balance;
    row.openingDebt = openingForYear;
    const drawdown = sum(drawdowns.filter((item) => item.year === year && item.instrumentId === instrument.id).map((item) => item.amount));
    row.drawdown = drawdown;
    balance += drawdown;

    for (let periodOfYear = 0; periodOfYear < periodPerYear; periodOfYear += 1) {
      const periodIndex = year * periodPerYear + periodOfYear;
      if (periodIndex === 0 || balance <= EPSILON) continue;
      const inGrace = periodIndex <= gracePeriods;
      const repaymentIndex = Math.max(0, periodIndex - gracePeriods);
      const isFinalRepaymentPeriod = repaymentIndex >= repaymentPeriods || year === modelHorizonYears;
      let financingCost = balance * periodRate;
      const ancillaryFees = balance * sideFeeRate;
      const guaranteeFee = balance * guaranteeRate;
      const blockedOpportunity = balance * blockedRate;
      let cashFinancingCost = financingCost;
      let capitalizedCost = 0;
      let principalRepayment = 0;

      if (inGrace) {
        if (instrument.graceCostBehavior === "noCostDuringGrace") {
          financingCost = 0;
          cashFinancingCost = 0;
        } else if (
          instrument.graceCostBehavior === "capitalizedToPrincipal" ||
          instrument.graceCostBehavior === "capitalizedDuringConstruction"
        ) {
          cashFinancingCost = 0;
          capitalizedCost = financingCost;
          balance += capitalizedCost;
        }
      } else {
        if (amortizationBase === null) {
          amortizationBase = balance;
          balloonBase = balance * clamp(finite(instrument.balloonPercent), 0, 0.95);
          const regularBase = methodFamily === "balloon" ? Math.max(0, balance - balloonBase) : balance;
          fixedPayment = pmt(periodRate, repaymentPeriods, regularBase);
        }

        if (methodFamily === "fixed") {
          principalRepayment = Math.max(0, fixedPayment - cashFinancingCost);
        } else if (methodFamily === "equal") {
          principalRepayment = (amortizationBase ?? balance) / repaymentPeriods;
        } else if (methodFamily === "bullet") {
          principalRepayment = isFinalRepaymentPeriod ? balance : 0;
        } else if (methodFamily === "balloon") {
          principalRepayment = Math.max(0, fixedPayment - cashFinancingCost);
          if (isFinalRepaymentPeriod) principalRepayment += balloonBase;
        } else if (methodFamily === "stepUp" || methodFamily === "stepDown") {
          const stepRate = Math.max(0, finite(instrument.stepRate, 0.05));
          const base = amortizationBase ?? balance;
          const weights = Array.from({ length: repaymentPeriods }, (_, index) =>
            methodFamily === "stepUp" ? (1 + stepRate) ** index : (1 + stepRate) ** (repaymentPeriods - index - 1),
          );
          const weight = weights[Math.min(repaymentIndex - 1, weights.length - 1)] ?? 1;
          principalRepayment = base * weight / Math.max(EPSILON, sum(weights));
        }

        if (isFinalRepaymentPeriod) principalRepayment = balance;
      }

      principalRepayment = clamp(principalRepayment, 0, balance);
      balance = Math.max(0, balance - principalRepayment);
      const debtService = principalRepayment + cashFinancingCost + ancillaryFees + guaranteeFee + blockedOpportunity;

      row.financingCost += financingCost;
      row.cashFinancingCost += cashFinancingCost;
      row.financingFees += ancillaryFees;
      row.guaranteeFee += guaranteeFee;
      row.blockedDepositOpportunityCost += blockedOpportunity;
      row.capitalizedCost += capitalizedCost;
      row.principalRepayment += principalRepayment;
      row.totalDebtService += debtService;
    }

    row.closingDebt = Math.abs(balance) < 1 ? 0 : balance;
  }

  return rows.map((row) => ({
    ...row,
    status: dscrStatus(row.dscr),
  }));
};

export const aggregateAnnualDebtSchedule = (
  instrumentRows: DebtScheduleRow[],
  modelHorizonYears: number,
): LoanScheduleRow[] => {
  const rows: LoanScheduleRow[] = Array.from({ length: modelHorizonYears + 1 }, (_, year) => ({
    year,
    openingBalance: 0,
    drawdown: 0,
    interest: 0,
    financingCost: 0,
    cashFinancingCost: 0,
    financingFees: 0,
    guaranteeFee: 0,
    blockedDepositOpportunityCost: 0,
    capitalizedCost: 0,
    principalRepayment: 0,
    debtService: 0,
    totalDebtService: 0,
    endingBalance: 0,
    closingDebt: 0,
    cfads: 0,
    dscr: null,
    status: "بدون خدمت بدهی",
    byInstrument: {},
  }));

  instrumentRows.forEach((item) => {
    const row = rows[item.year];
    row.openingBalance += item.openingDebt;
    row.drawdown += item.drawdown;
    row.interest += item.financingCost;
    row.financingCost += item.financingCost;
    row.cashFinancingCost += item.cashFinancingCost;
    row.financingFees += item.financingFees;
    row.guaranteeFee += item.guaranteeFee;
    row.blockedDepositOpportunityCost += item.blockedDepositOpportunityCost;
    row.capitalizedCost += item.capitalizedCost;
    row.principalRepayment += item.principalRepayment;
    row.debtService += item.totalDebtService;
    row.totalDebtService += item.totalDebtService;
    row.endingBalance += item.closingDebt;
    row.closingDebt += item.closingDebt;
    row.byInstrument = row.byInstrument ?? {};
    row.byInstrument[item.instrumentId ?? "unknown"] = item;
  });

  return rows.map((row) => ({
    ...row,
    openingBalance: Math.abs(row.openingBalance) < 1 ? 0 : row.openingBalance,
    endingBalance: Math.abs(row.endingBalance) < 1 ? 0 : row.endingBalance,
    closingDebt: Math.abs(row.closingDebt) < 1 ? 0 : row.closingDebt,
  }));
};

export const calculateRemainingDebtByYear = (rows: Array<{ year: number; closingDebt?: number; endingBalance?: number }>) =>
  rows.reduce<Record<number, number>>((map, row) => {
    map[row.year] = finite(row.closingDebt ?? row.endingBalance);
    return map;
  }, {});

export const calculateFinancingKPIs = (
  annualRows: LoanScheduleRow[],
  instrumentRows: DebtScheduleRow[],
  instruments: FinancingInstrument[],
  equity: number,
): FinancingKpis => {
  const active = instruments.filter((instrument) => instrument.active);
  const totalDebt = sum(active.map((instrument) => instrument.amount));
  const totalFunding = totalDebt + finite(equity);
  const dscrValues = annualRows.map((row) => row.dscr).filter((value): value is number => value !== null && Number.isFinite(value));
  const positiveCostRows = annualRows.filter((row) => row.financingCost + row.financingFees + row.guaranteeFee + row.blockedDepositOpportunityCost > EPSILON);
  const maxDebtRow = annualRows.reduce((best, row) => row.endingBalance > best.endingBalance ? row : best, annualRows[0] ?? { year: 0, endingBalance: 0 });
  const peakDebtServiceRow = annualRows.reduce((best, row) => row.debtService > best.debtService ? row : best, annualRows[0] ?? { year: 0, debtService: 0 });
  const fixedAnnualInstallmentBase = sum(instruments.filter((instrument) => {
    const method = normalizeRepaymentMethod(instrument.repaymentMethod);
    return instrument.active && (method === "fixedInstallment" || method === "equalMurabahaInstallments" || method === "interestOnlyThenFixed");
  }).map((instrument) => {
    const perYear = frequencyPerYear[instrument.paymentFrequency] ?? 1;
    const periodRate = finite(instrument.annualRate) / perYear;
    const periods = Math.max(1, Math.ceil(finite(instrument.repaymentTermMonths, 12) / (12 / perYear)));
    return pmt(periodRate, periods, instrument.amount) * perYear;
  }));

  return {
    totalFunding,
    shareholderEquity: finite(equity),
    totalDebt,
    debtToEquity: equity > EPSILON ? totalDebt / equity : null,
    debtShareOfFunding: totalFunding > EPSILON ? totalDebt / totalFunding : null,
    minimumDscr: dscrValues.length ? Math.min(...dscrValues) : null,
    averageDscr: dscrValues.length ? sum(dscrValues) / dscrValues.length : null,
    averageAnnualFinancingCost: positiveCostRows.length
      ? sum(positiveCostRows.map((row) => row.financingCost + row.financingFees + row.guaranteeFee + row.blockedDepositOpportunityCost)) / positiveCostRows.length
      : 0,
    totalProjectFinancingCost: sum(annualRows.map((row) => row.financingCost + row.financingFees + row.guaranteeFee + row.blockedDepositOpportunityCost)),
    repaymentBaseDebt: sum(instrumentRows.filter((row) => row.year > 0).map((row) => row.openingDebt + row.drawdown + row.capitalizedCost)),
    baseFixedAnnualInstallment: fixedAnnualInstallmentBase,
    maxRemainingDebt: maxDebtRow?.endingBalance ?? 0,
    peakDebtYear: maxDebtRow?.year ?? 0,
    peakDebtServiceYear: peakDebtServiceRow?.year ?? 0,
  };
};

export const calculateFinancingEngine = (assumptions: FinancingAssumptions, modelHorizonYears: number) => {
  const normalized = normalizeFinancingAssumptions(assumptions);
  const years = normalized.selectedDrawdownYears.filter((year) => year >= 0 && year <= modelHorizonYears);
  const drawdownRows = calculateDrawdownSchedule(
    normalized.instruments,
    normalized.drawdownRows,
    years.length ? years : [0],
    normalized.drawdownModel,
  );
  const active = normalized.instruments.filter((instrument) => instrument.active);
  const instrumentSchedules = active.flatMap((instrument) =>
    calculateInstrumentDebtSchedule(instrument, drawdownRows, modelHorizonYears),
  );
  const schedule = aggregateAnnualDebtSchedule(instrumentSchedules, modelHorizonYears);
  const remainingDebtByYear = calculateRemainingDebtByYear(schedule);
  const remainingDebtByInstrument = active.reduce<Record<string, number>>((map, instrument) => {
    const finalRow = instrumentSchedules.filter((row) => row.instrumentId === instrument.id).at(-1);
    map[instrument.id] = finite(finalRow?.closingDebt);
    return map;
  }, {});
  const principalByInstrument = active.reduce<Record<string, number>>((map, instrument) => {
    map[instrument.id] = sum(instrumentSchedules.filter((row) => row.instrumentId === instrument.id).map((row) => row.principalRepayment));
    return map;
  }, {});
  const costByInstrument = active.reduce<Record<string, number>>((map, instrument) => {
    map[instrument.id] = sum(instrumentSchedules.filter((row) => row.instrumentId === instrument.id).map((row) =>
      row.financingCost + row.financingFees + row.guaranteeFee + row.blockedDepositOpportunityCost,
    ));
    return map;
  }, {});
  const kpis = calculateFinancingKPIs(schedule, instrumentSchedules, active, normalized.equity);
  const drawdownMappingNeedsExternalDriver = ["capexPercent", "physicalProgress", "milestone", "custom"].includes(normalized.drawdownModel);
  const warnings = [
    ...(
      active.some((instrument) => normalizeRepaymentMethod(instrument.repaymentMethod) === "custom")
        ? ["TODO(Financing14): برنامه سفارشی باید در فاز بعد به جدول دوره‌ای قابل ورود توسط کاربر و mapping اکسل وصل شود."]
        : []
    ),
    ...(
      drawdownMappingNeedsExternalDriver
        ? ["TODO(Financing14!R29): مدل برداشت انتخاب‌شده باید به CAPEX12، پیشرفت فیزیکی ساخت یا milestones قراردادی وصل شود؛ فعلاً ساختار داده و نوع خروجی آماده است و ورودی دستی مبنا می‌ماند."]
        : []
    ),
  ];

  return {
    schedule,
    annualSchedule: schedule,
    instrumentSchedules,
    averageDscr: kpis.averageDscr,
    minimumDscr: kpis.minimumDscr,
    totalDebtService: sum(schedule.map((row) => row.debtService)),
    totalInterest: kpis.totalProjectFinancingCost,
    remainingDebt: schedule.at(-1)?.endingBalance ?? 0,
    remainingDebtByYear,
    remainingDebtByInstrument,
    principalByInstrument,
    costByInstrument,
    kpis,
    warnings,
  };
};
