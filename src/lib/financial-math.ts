import type { CalculationMetric } from "@/lib/types";

const EPSILON = 1e-9;

export const safeNumber = (value: unknown, fallback = 0) => {
  if (typeof value === "number") return Number.isFinite(value) ? value : fallback;
  if (typeof value === "string") {
    const normalized = value.trim();
    if (!normalized || /^#(N\/A|NAME\??|NUM!?|VALUE!?|REF!?|DIV\/0!?)/i.test(normalized)) return fallback;
    const parsed = Number(normalized.replaceAll(",", ""));
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
};

export const safeDivide = (numerator: unknown, denominator: unknown): number | null => {
  const top = safeNumber(numerator, Number.NaN);
  const bottom = safeNumber(denominator, Number.NaN);
  if (!Number.isFinite(top) || !Number.isFinite(bottom) || Math.abs(bottom) <= EPSILON) return null;
  const result = top / bottom;
  return Number.isFinite(result) ? result : null;
};

const validCashFlows = (cashFlows: number[]) =>
  cashFlows.length > 0 && cashFlows.every((value) => Number.isFinite(value));

export const calculateNpv = (cashFlows: number[], rate: number): CalculationMetric => {
  if (!validCashFlows(cashFlows) || !Number.isFinite(rate) || rate <= -1) {
    return { value: null, status: "invalid_input", reason: "جریان نقد یا نرخ تنزیل نامعتبر است." };
  }
  const value = cashFlows.reduce((total, cashFlow, year) => total + cashFlow / (1 + rate) ** year, 0);
  return Number.isFinite(value)
    ? { value, status: "ok" }
    : { value: null, status: "not_computable", reason: "NPV با ورودی‌های فعلی مقدار متناهی تولید نمی‌کند." };
};

export const countCashFlowSignChanges = (cashFlows: number[]) => {
  const signs = cashFlows.filter((value) => Math.abs(value) > EPSILON).map((value) => Math.sign(value));
  return signs.slice(1).reduce((changes, sign, index) => changes + (sign !== signs[index] ? 1 : 0), 0);
};

export const calculateIrrResult = (cashFlows: number[]): CalculationMetric => {
  if (!validCashFlows(cashFlows)) {
    return { value: null, status: "invalid_input", reason: "سری جریان نقد شامل مقدار نامعتبر است." };
  }
  if (!cashFlows.some((value) => value > EPSILON) || !cashFlows.some((value) => value < -EPSILON)) {
    return { value: null, status: "not_computable", reason: "برای IRR حداقل یک جریان مثبت و یک جریان منفی لازم است." };
  }

  const npvAt = (rate: number) => calculateNpv(cashFlows, rate).value;
  const candidates = [
    ...Array.from({ length: 200 }, (_, index) => -0.999 + index * (0.999 / 199)),
    ...Array.from({ length: 240 }, (_, index) => Math.expm1(index * (Math.log(1001) / 239))),
  ];
  const brackets: Array<[number, number]> = [];
  let previousRate = candidates[0];
  let previousNpv = npvAt(previousRate);
  for (const rate of candidates.slice(1)) {
    const currentNpv = npvAt(rate);
    if (previousNpv !== null && currentNpv !== null) {
      if (Math.abs(currentNpv) < 0.000001) brackets.push([rate, rate]);
      else if (previousNpv * currentNpv < 0) brackets.push([previousRate, rate]);
    }
    previousRate = rate;
    previousNpv = currentNpv;
  }
  if (!brackets.length) {
    return { value: null, status: "not_computable", reason: "در دامنه معتبر، ریشه‌ای برای NPV پیدا نشد." };
  }

  let [low, high] = brackets[0];
  if (low !== high) {
    let lowNpv = npvAt(low) ?? 0;
    for (let iteration = 0; iteration < 160; iteration += 1) {
      const mid = (low + high) / 2;
      const midNpv = npvAt(mid) ?? 0;
      if (Math.abs(midNpv) < 0.000001) {
        low = mid;
        high = mid;
        break;
      }
      if (lowNpv * midNpv <= 0) high = mid;
      else {
        low = mid;
        lowNpv = midNpv;
      }
    }
  }
  const value = (low + high) / 2;
  const multiple = brackets.length > 1 || countCashFlowSignChanges(cashFlows) > 1;
  return {
    value,
    status: multiple ? "multiple_solutions" : "ok",
    reason: multiple ? "جریان نقد چند تغییر علامت دارد؛ IRR گزارش‌شده نخستین ریشه معتبر است." : undefined,
  };
};

export const calculateMirrResult = (
  cashFlows: number[],
  financeRate: number,
  reinvestmentRate: number,
): CalculationMetric => {
  if (!validCashFlows(cashFlows) || !Number.isFinite(financeRate) || !Number.isFinite(reinvestmentRate) || financeRate <= -1 || reinvestmentRate <= -1) {
    return { value: null, status: "invalid_input", reason: "جریان نقد یا نرخ‌های MIRR نامعتبر هستند." };
  }
  const periods = cashFlows.length - 1;
  if (periods <= 0) return { value: null, status: "not_computable", reason: "برای MIRR حداقل دو دوره لازم است." };
  const negativePv = cashFlows.reduce((total, cashFlow, year) =>
    cashFlow < 0 ? total + cashFlow / (1 + financeRate) ** year : total, 0);
  const positiveFv = cashFlows.reduce((total, cashFlow, year) =>
    cashFlow > 0 ? total + cashFlow * (1 + reinvestmentRate) ** (periods - year) : total, 0);
  if (negativePv >= -EPSILON || positiveFv <= EPSILON) {
    return { value: null, status: "not_computable", reason: "MIRR به جریان‌های مثبت و منفی معتبر نیاز دارد." };
  }
  const value = (positiveFv / Math.abs(negativePv)) ** (1 / periods) - 1;
  return Number.isFinite(value)
    ? { value, status: "ok" }
    : { value: null, status: "not_computable", reason: "MIRR با ورودی‌های فعلی محاسبه‌پذیر نیست." };
};

export const calculatePaybackResult = (cashFlows: number[]): CalculationMetric => {
  if (!validCashFlows(cashFlows)) {
    return { value: null, status: "invalid_input", reason: "سری جریان نقد شامل مقدار نامعتبر است." };
  }
  let cumulative = 0;
  for (let index = 0; index < cashFlows.length; index += 1) {
    const previous = cumulative;
    cumulative += cashFlows[index];
    if (cumulative >= 0) {
      if (index === 0) return { value: 0, status: "ok" };
      const generated = cashFlows[index];
      const fraction = Math.abs(generated) > EPSILON ? Math.abs(previous) / generated : 0;
      const value = index - 1 + fraction;
      return Number.isFinite(value) ? { value, status: "ok" } : { value: null, status: "not_computable" };
    }
  }
  return { value: null, status: "not_computable", reason: "در افق مدل بازگشت سرمایه رخ نمی‌دهد." };
};
