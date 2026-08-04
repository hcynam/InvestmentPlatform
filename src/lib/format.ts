import type { Project } from "@/lib/types";
import { safeNumber } from "@/lib/financial-math";

const finiteOrNull = (value: unknown) => {
  const number = safeNumber(value, Number.NaN);
  return Number.isFinite(number) ? number : null;
};

const localizedDigits: Record<string, string> = {
  "۰": "0",
  "۱": "1",
  "۲": "2",
  "۳": "3",
  "۴": "4",
  "۵": "5",
  "۶": "6",
  "۷": "7",
  "۸": "8",
  "۹": "9",
  "٠": "0",
  "١": "1",
  "٢": "2",
  "٣": "3",
  "٤": "4",
  "٥": "5",
  "٦": "6",
  "٧": "7",
  "٨": "8",
  "٩": "9",
};

export const parseLocalizedNumber = (value: string) => {
  const normalized = value
    .trim()
    .replace(/[۰-۹٠-٩]/g, (digit) => localizedDigits[digit] ?? digit)
    .replace(/[٬,]/g, "")
    .replace(/٫/g, ".");
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

export const formatNumber = (value: number | null | undefined, options?: Intl.NumberFormatOptions) => {
  const number = finiteOrNull(value);
  if (number === null) return "ناموجود";
  return new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 2, ...options }).format(number);
};

export const formatPercent = (value: number | null | undefined) => {
  const number = finiteOrNull(value);
  if (number === null) return "ناموجود";
  return new Intl.NumberFormat("fa-IR", { style: "percent", maximumFractionDigits: 2 }).format(number);
};

export const normalizeRate = (value: number, precision = 10) => {
  if (!Number.isFinite(value)) return value;
  const factor = 10 ** precision;
  return Math.round((value + Number.EPSILON) * factor) / factor;
};

export const formatPlainYear = (value: number | null | undefined) =>
  formatNumber(value, { useGrouping: false, maximumFractionDigits: 0 });

export const formatGregorianDate = (value: string | null | undefined) => {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return "تعریف‌نشده";
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) return "تعریف‌نشده";
  return new Intl.DateTimeFormat("fa-IR-u-ca-gregory", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "UTC",
  }).format(date);
};

export const isForeignDisplayUnit = (unit: Project["displayUnit"]) =>
  unit === "دلار" || unit === "یورو" || unit === "درهم";

export const unitDivisor = (project: Project) => {
  if (project.displayUnit === "billion-rial") return 1_000_000_000;
  if (project.displayUnit === "million-rial") return 1_000_000;
  if (project.displayUnit === "تومان") return 10;
  if (project.displayUnit === "هزار تومان") return 10_000;
  if (project.displayUnit === "میلیون تومان") return 10_000_000;
  if (project.displayUnit === "میلیارد تومان") return 10_000_000_000;
  return 1;
};

export const unitLabel = (project: Project) => {
  if (project.displayUnit === "billion-rial") return "میلیارد ریال";
  if (project.displayUnit === "million-rial") return "میلیون ریال";
  if (project.displayUnit === "تومان") return "تومان";
  if (project.displayUnit === "هزار تومان") return "هزار تومان";
  if (project.displayUnit === "میلیون تومان") return "میلیون تومان";
  if (project.displayUnit === "میلیارد تومان") return "میلیارد تومان";
  if (project.displayUnit === "دلار") return "دلار";
  if (project.displayUnit === "یورو") return "یورو";
  if (project.displayUnit === "درهم") return "درهم";
  if (project.currency && project.currency !== "ریال") return project.currency;
  return "ریال";
};

export const formatMoney = (value: number | null | undefined, project: Project) => {
  const number = finiteOrNull(value);
  if (number === null) return "ناموجود";
  if (isForeignDisplayUnit(project.displayUnit)) return "ناموجود — تبدیل ارز تعریف نشده";
  return `${formatNumber(number / unitDivisor(project), { maximumFractionDigits: 1 })} ${unitLabel(project)}`;
};

export const formatMetric = (value: number | null | undefined, type: "money" | "number" | "percent", project: Project) => {
  if (type === "money") return formatMoney(value, project);
  if (type === "percent") return formatPercent(value);
  return formatNumber(value);
};

export const classNames = (...items: Array<string | false | null | undefined>) => items.filter(Boolean).join(" ");
