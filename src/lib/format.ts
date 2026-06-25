import type { Project } from "@/lib/types";
import { safeNumber } from "@/lib/financial-math";

const finiteOrNull = (value: unknown) => {
  const number = safeNumber(value, Number.NaN);
  return Number.isFinite(number) ? number : null;
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
  return `${formatNumber(number / unitDivisor(project), { maximumFractionDigits: 1 })} ${unitLabel(project)}`;
};

export const formatMetric = (value: number | null | undefined, type: "money" | "number" | "percent", project: Project) => {
  if (type === "money") return formatMoney(value, project);
  if (type === "percent") return formatPercent(value);
  return formatNumber(value);
};

export const classNames = (...items: Array<string | false | null | undefined>) => items.filter(Boolean).join(" ");
