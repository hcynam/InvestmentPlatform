export type DepreciationMethod = "straightLine" | "decliningBalance" | "immediate";

export type DepreciationScheduleInput = {
  basis: number;
  salvageValue: number;
  usefulLifeYears: number;
  method: string;
  startDate: string;
  startYear: number;
  baseYear: number;
  horizonYears: number;
};

const finite = (value: number, fallback = 0) => Number.isFinite(value) ? value : fallback;

export const normalizeDepreciationMethod = (method: string): DepreciationMethod => {
  if (method.includes("نزولی")) return "decliningBalance";
  if (method.includes("یکجا")) return "immediate";
  return "straightLine";
};

const parsedStart = (date: string, fallbackYear: number) => {
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return { year: fallbackYear, firstYearFactor: 1 };
  return {
    year: parsed.getUTCFullYear(),
    firstYearFactor: Math.max(1 / 12, (12 - parsed.getUTCMonth()) / 12),
  };
};

export const calculateDepreciationSchedule = (input: DepreciationScheduleInput) => {
  const basis = Math.max(0, finite(input.basis));
  const salvageValue = Math.min(basis, Math.max(0, finite(input.salvageValue)));
  const depreciableBasis = Math.max(0, basis - salvageValue);
  const usefulLifeYears = Math.max(0, Math.round(finite(input.usefulLifeYears)));
  const method = normalizeDepreciationMethod(input.method);
  const start = parsedStart(input.startDate, input.startYear);
  const startIndex = Math.max(0, start.year - input.baseYear);
  let accumulatedDepreciation = 0;
  let openingBookValue = basis;

  const rows = Array.from({ length: input.horizonYears + 1 }, (_, year) => {
    const offset = year - startIndex;
    let depreciation = 0;
    if (depreciableBasis > 0 && usefulLifeYears > 0 && offset >= 0 && offset < usefulLifeYears) {
      const remainingDepreciable = Math.max(0, openingBookValue - salvageValue);
      const firstYearFactor = offset === 0 ? start.firstYearFactor : 1;
      if (method === "immediate") {
        depreciation = offset === 0 ? remainingDepreciable : 0;
      } else if (method === "decliningBalance") {
        const decliningRate = Math.min(1, 2 / usefulLifeYears);
        depreciation = remainingDepreciable * decliningRate * firstYearFactor;
        if (offset === usefulLifeYears - 1) depreciation = remainingDepreciable;
      } else {
        depreciation = depreciableBasis / usefulLifeYears * firstYearFactor;
        if (offset === usefulLifeYears - 1) depreciation = remainingDepreciable;
      }
      depreciation = Math.min(remainingDepreciable, Math.max(0, depreciation));
    }
    accumulatedDepreciation += depreciation;
    openingBookValue = Math.max(salvageValue, basis - accumulatedDepreciation);
    return {
      year,
      depreciation,
      accumulatedDepreciation,
      bookValueEnd: openingBookValue,
    };
  });

  return {
    basis,
    salvageValue,
    depreciableBasis,
    usefulLifeYears,
    method,
    startIndex,
    rows,
    firstYearDepreciation: rows[startIndex]?.depreciation ?? 0,
    accumulatedDepreciation,
    bookValueEnd: openingBookValue,
  };
};
