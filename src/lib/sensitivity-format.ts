import { formatNumber, formatPercent } from "@/lib/format";
import type {
  Project,
  SensitivityFormatInput,
  SensitivityFormatOutput,
  SensitivityHeatmapStatus,
  SensitivityMetric,
  SensitivityMetricMetadata,
  SensitivityThresholdStatus,
  SensitivityThresholdTarget,
  SensitivityUnitType,
} from "@/lib/types";

const missingText = "ناموجود";

const finiteOrNull = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const clampScore = (value: number) => Math.max(0, Math.min(1, value));

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
  if (metric === "NPV") return { metric, label: "ارزش فعلی خالص (NPV)", unitType: "totalMoney", unitLabel: "ریال", targetLabel: "NPV = 0" };
  if (metric === "IRR") return { metric, label: "نرخ بازده داخلی (IRR)", unitType: "percentage", unitLabel: "%", targetLabel: "IRR >= نرخ تنزیل" };
  if (metric === "Payback") return { metric, label: "دوره بازگشت", unitType: "year", unitLabel: "سال", targetLabel: "دوره بازگشت کمتر از افق مدل" };
  if (metric === "DSCR") return { metric, label: "پوشش خدمت بدهی (DSCR)", unitType: "ratio", unitLabel: "x", targetLabel: "DSCR >= حداقل بانک" };
  if (metric === "EquityValue") return { metric, label: "ارزش حقوق صاحبان سهام", unitType: "totalMoney", unitLabel: "ریال", targetLabel: "ارزش حقوق صاحبان سهام >= 0" };
  return { metric, label: "نسبت منفعت به هزینه (BCR)", unitType: "ratio", unitLabel: "x", targetLabel: "BCR = 1" };
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

export const classifySensitivityHeatmapCell = (
  metric: SensitivityMetric,
  value: number | null | undefined,
  context: {
    baseValue?: number | null;
    discountRate?: number | null;
    targetDscr?: number | null;
    horizonYears?: number | null;
  } = {},
): { status: SensitivityHeatmapStatus; score: number; reason: string } => {
  const metricValue = finiteOrNull(value);
  if (metricValue === null) {
    return { status: "invalid", score: 0, reason: "مقدار این خانه قابل محاسبه نیست." };
  }

  const baseValue = finiteOrNull(context.baseValue);
  const discountRate = finiteOrNull(context.discountRate);
  const targetDscr = finiteOrNull(context.targetDscr) ?? 1.2;
  const horizonYears = finiteOrNull(context.horizonYears) ?? 20;
  const scale = Math.max(1, Math.abs(baseValue ?? 0));

  if (metric === "NPV" || metric === "EquityValue") {
    if (metricValue < 0 && (baseValue === null || metricValue < baseValue)) {
      return { status: "highRisk", score: 0.12, reason: "مقدار منفی و بدتر از مبناست." };
    }
    if (metricValue < 0 || Math.abs(metricValue) <= scale * 0.05) {
      return { status: "watch", score: 0.38, reason: "مقدار نزدیک به آستانه صفر یا هنوز منفی است." };
    }
    if (baseValue !== null && metricValue >= Math.max(baseValue * 1.1, baseValue + scale * 0.1)) {
      return { status: "strong", score: 0.9, reason: "مقدار نسبت به مبنا حاشیه قوی دارد." };
    }
    return { status: "acceptable", score: 0.68, reason: "مقدار مثبت و قابل قبول است." };
  }

  if (metric === "IRR") {
    const hurdle = discountRate ?? 0;
    if (hurdle > 0 && metricValue < hurdle) {
      return { status: "highRisk", score: 0.14, reason: "IRR کمتر از نرخ تنزیل است." };
    }
    if (hurdle > 0 && metricValue < hurdle + Math.max(0.02, hurdle * 0.1)) {
      return { status: "watch", score: 0.42, reason: "IRR فقط کمی بالاتر از نرخ تنزیل است." };
    }
    if (hurdle > 0 && metricValue >= hurdle + Math.max(0.05, hurdle * 0.25)) {
      return { status: "strong", score: 0.9, reason: "IRR حاشیه مناسبی نسبت به نرخ تنزیل دارد." };
    }
    return { status: "acceptable", score: 0.68, reason: "IRR بالاتر از نرخ تنزیل است." };
  }

  if (metric === "BCR") {
    if (metricValue < 1) return { status: "highRisk", score: 0.15, reason: "BCR کمتر از 1 است." };
    if (metricValue < 1.1) return { status: "watch", score: 0.42, reason: "BCR نزدیک آستانه 1 است." };
    if (metricValue >= 1.25) return { status: "strong", score: 0.88, reason: "BCR حاشیه اقتصادی قوی دارد." };
    return { status: "acceptable", score: 0.68, reason: "BCR بالاتر از 1 و قابل قبول است." };
  }

  if (metric === "DSCR") {
    if (metricValue < targetDscr) return { status: "highRisk", score: 0.15, reason: "DSCR کمتر از حداقل بانک است." };
    if (metricValue < targetDscr * 1.1) return { status: "watch", score: 0.42, reason: "DSCR نزدیک حداقل بانک است." };
    if (metricValue >= targetDscr * 1.25) return { status: "strong", score: 0.88, reason: "DSCR حاشیه پوشش قوی دارد." };
    return { status: "acceptable", score: 0.68, reason: "DSCR بالاتر از حداقل بانک است." };
  }

  if (metric === "Payback") {
    if (metricValue <= 0 || metricValue > horizonYears) {
      return { status: "highRisk", score: 0.15, reason: "دوره بازگشت خارج از افق قابل قبول مدل است." };
    }
    if (baseValue !== null && metricValue > baseValue * 1.15) {
      return { status: "watch", score: 0.42, reason: "دوره بازگشت نسبت به مبنا طولانی‌تر شده است." };
    }
    if (baseValue !== null && metricValue <= baseValue * 0.9) {
      return { status: "strong", score: 0.88, reason: "دوره بازگشت نسبت به مبنا کوتاه‌تر شده است." };
    }
    return { status: "acceptable", score: clampScore(1 - metricValue / Math.max(1, horizonYears)), reason: "دوره بازگشت در افق مدل قابل قبول است." };
  }

  return { status: "acceptable", score: 0.65, reason: "مقدار در محدوده قابل قبول است." };
};

export const formatThresholdStatus = (status: SensitivityThresholdStatus) => {
  if (status === "valid") return "معتبر";
  if (status === "notFound") return "یافت نشد";
  if (status === "boundaryOnly") return "مرزی، نه ریشه معتبر";
  if (status === "noExposure") return "بدون مواجهه";
  if (status === "insufficientData") return "داده ناکافی";
  if (status === "modelError") return "خطای مدل";
  return "نامعتبر";
};
