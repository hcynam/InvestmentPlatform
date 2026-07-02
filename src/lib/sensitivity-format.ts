import { formatNumber, formatPercent } from "@/lib/format";
import type {
  Project,
  SensitivityFormatInput,
  SensitivityFormatOutput,
  SensitivityMetric,
  SensitivityMetricMetadata,
  SensitivityThresholdStatus,
  SensitivityThresholdTarget,
  SensitivityUnitType,
} from "@/lib/types";

const missingText = "ناموجود";

const finiteOrNull = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

export const resolveVolumeUnit = (project?: Project) =>
  project?.scenarios[0]?.assumptions.capacity.unit ||
  project?.scenarios[0]?.assumptions.industry.productUnit ||
  "unit";

const moneyUnit = (value: number) => {
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return { divisor: 1_000_000_000, label: "میلیارد ریال", digits: 2 };
  if (abs >= 1_000_000) return { divisor: 1_000_000, label: "میلیون ریال", digits: 2 };
  return { divisor: 1, label: "ریال", digits: 0 };
};

const unitLabelFor = (unitType: SensitivityUnitType, project?: Project, explicit?: string) => {
  if (explicit) return explicit;
  const volumeUnit = resolveVolumeUnit(project);
  if (unitType === "totalMoney") return "ریال";
  if (unitType === "unitPrice") return `ریال/${volumeUnit}`;
  if (unitType === "percentage") return "%";
  if (unitType === "ratio") return "x";
  if (unitType === "fxRate") return "ریال/USD";
  if (unitType === "volume" || unitType === "energy") return volumeUnit;
  if (unitType === "months") return "ماه";
  if (unitType === "days") return "روز";
  if (unitType === "count") return "عدد";
  if (unitType === "year") return "سال";
  if (unitType === "none") return "";
  return "واحد نامشخص";
};

export const formatSensitivityValue = (
  input: SensitivityFormatInput,
  project?: Project,
): SensitivityFormatOutput => {
  if (typeof input.value === "string") {
    return {
      text: input.value,
      unitLabel: input.unitLabel ?? "",
      missing: false,
    };
  }

  const value = finiteOrNull(input.value);
  const unitLabel = unitLabelFor(input.unitType, project, input.unitLabel ?? input.fallbackUnit);
  if (value === null) return { text: missingText, unitLabel, missing: true };

  if (input.unitType === "totalMoney") {
    const unit = moneyUnit(value);
    return {
      text: `${formatNumber(value / unit.divisor, { maximumFractionDigits: unit.digits })} ${unit.label}`,
      unitLabel: unit.label,
      missing: false,
    };
  }

  if (input.unitType === "unitPrice") {
    return {
      text: `${formatNumber(value, { maximumFractionDigits: value >= 100 ? 0 : 4 })} ${unitLabel}`,
      unitLabel,
      missing: false,
    };
  }

  if (input.unitType === "fxRate") {
    return {
      text: `${formatNumber(value, { maximumFractionDigits: 0 })} ${unitLabel}`,
      unitLabel,
      missing: false,
    };
  }

  if (input.unitType === "percentage") {
    return { text: formatPercent(value), unitLabel, missing: false };
  }

  if (input.unitType === "ratio") {
    return { text: `${formatNumber(value, { maximumFractionDigits: 3 })}x`, unitLabel, missing: false };
  }

  if (input.unitType === "volume" || input.unitType === "energy") {
    const warning = unitLabel === "unit" ? "واحد حجم در مدل مشخص نیست." : undefined;
    return {
      text: `${formatNumber(value, { maximumFractionDigits: 2 })} ${unitLabel}`,
      unitLabel,
      missing: false,
      warning,
    };
  }

  if (input.unitType === "months" || input.unitType === "days" || input.unitType === "year" || input.unitType === "count") {
    return {
      text: `${formatNumber(value, { maximumFractionDigits: input.unitType === "year" ? 2 : 0 })} ${unitLabel}`,
      unitLabel,
      missing: false,
    };
  }

  if (input.unitType === "none") {
    return { text: formatNumber(value), unitLabel: "", missing: false };
  }

  return {
    text: `${formatNumber(value)} ${unitLabel}`,
    unitLabel,
    missing: false,
    warning: "واحد این مقدار نامشخص است.",
  };
};

export const metricMetadata = (metric: SensitivityMetric): SensitivityMetricMetadata => {
  if (metric === "NPV") return { metric, label: "NPV", unitType: "totalMoney", unitLabel: "ریال", targetLabel: "NPV = 0" };
  if (metric === "IRR") return { metric, label: "IRR", unitType: "percentage", unitLabel: "%", targetLabel: "IRR" };
  if (metric === "Payback") return { metric, label: "Payback", unitType: "year", unitLabel: "سال", targetLabel: "Payback" };
  if (metric === "DSCR") return { metric, label: "DSCR", unitType: "ratio", unitLabel: "x", targetLabel: "DSCR" };
  if (metric === "EquityValue") return { metric, label: "Equity value", unitType: "totalMoney", unitLabel: "ریال", targetLabel: "Equity value" };
  return { metric, label: "BCR", unitType: "ratio", unitLabel: "x", targetLabel: "BCR" };
};

export const npvZeroTarget = (): SensitivityThresholdTarget => ({
  metric: "NPV",
  operator: "=",
  value: 0,
  unitType: "totalMoney",
  label: "NPV = 0",
});

export const formatSensitivityMetric = (
  value: number | null | undefined,
  metric: SensitivityMetric,
  project?: Project,
) => {
  const meta = metricMetadata(metric);
  return formatSensitivityValue({ value, unitType: meta.unitType, unitLabel: meta.unitLabel }, project).text;
};

export const formatThresholdStatus = (status: SensitivityThresholdStatus) => {
  if (status === "valid") return "معتبر";
  if (status === "notFound") return "یافت نشد";
  if (status === "boundaryOnly") return "فقط مرزی";
  if (status === "noExposure") return "بدون مواجهه";
  if (status === "insufficientData") return "داده ناکافی";
  if (status === "modelError") return "خطای مدل";
  return "نامعتبر";
};
