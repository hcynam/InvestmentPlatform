import {
  buildDashboardViewModel,
  canExportDashboardView,
  formatDashboardMetric,
  type DashboardMetricId,
  type DashboardViewModel,
} from "@/lib/dashboard-selectors";
import { formatMoney, formatNumber } from "@/lib/format";
import type { Project, Scenario, ScenarioOutputs } from "@/lib/types";

export type ReportExportKind = "excel" | "pdf" | "word" | "bank" | "investor" | "board";

const escapeHtml = (value: unknown) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;");

const csvCell = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;

const download = (content: string, mime: string, filename: string) => {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
};

const coreMetricIds: DashboardMetricId[] = [
  "total-capex",
  "funding-gap",
  "project-npv",
  "project-irr",
  "project-payback",
  "discounted-project-payback",
  "minimum-dscr",
  "average-dscr",
  "annual-revenue",
  "annual-ebitda",
  "annual-net-profit",
  "annual-project-fcff",
  "enpv",
  "eirr",
  "ebcr",
];

const assertExportable = (view: DashboardViewModel) => {
  if (!canExportDashboardView(view)) {
    throw new Error("نتایج نسبت به ورودی‌های جاری قدیمی هستند؛ پیش از گزارش‌گیری محاسبه مجدد لازم است.");
  }
};

const metricCards = (project: Project, view: DashboardViewModel) =>
  coreMetricIds.map((id) => {
    const metric = view.metrics[id];
    return `<div><span>${escapeHtml(metric.title)}</span><strong>${escapeHtml(formatDashboardMetric(metric, project))}</strong><small>${escapeHtml(metric.periodLabel)} · ${escapeHtml(metric.priceBasis)} · ${escapeHtml(metric.status)}</small></div>`;
  }).join("");

const statementTable = (project: Project, outputs: ScenarioOutputs) => `
  <table><thead><tr><th>سال</th><th>درآمد</th><th>COGS</th><th>OPEX</th><th>EBITDA</th><th>مالیات</th><th>سود خالص</th><th>FCFF</th><th>FCFE</th><th>DSCR</th></tr></thead>
  <tbody>${outputs.statements.rows.map((row) => `<tr><td>${formatNumber(row.year)}</td><td>${escapeHtml(formatMoney(row.revenue, project))}</td><td>${escapeHtml(formatMoney(row.cogs, project))}</td><td>${escapeHtml(formatMoney(row.opex, project))}</td><td>${escapeHtml(formatMoney(row.ebitda, project))}</td><td>${escapeHtml(formatMoney(row.tax, project))}</td><td>${escapeHtml(formatMoney(row.netProfit, project))}</td><td>${escapeHtml(formatMoney(row.fcff, project))}</td><td>${escapeHtml(formatMoney(row.fcfe, project))}</td><td>${formatNumber(row.dscr)}</td></tr>`).join("")}</tbody></table>`;

export const buildReportHtml = (
  kind: ReportExportKind,
  project: Project,
  scenario: Scenario,
  outputs: ScenarioOutputs,
  view: DashboardViewModel,
) => {
  assertExportable(view);
  const title = {
    excel: "خروجی داده مدل",
    pdf: "گزارش امکان‌سنجی و بانک‌پذیری",
    word: "گزارش امکان‌سنجی و بانک‌پذیری",
    bank: "پکیج اعتبارسنجی بانک",
    investor: "پکیج سرمایه‌گذار",
    board: "گزارش هیئت‌مدیره",
  }[kind];
  const riskRows = view.validationIssues
    .map((issue) => `<li><b>${escapeHtml(issue.message)}</b>${issue.recommendation ? `<span>${escapeHtml(issue.recommendation)}</span>` : ""}</li>`)
    .join("");

  return `<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>
    body{font-family:Tahoma,Arial,sans-serif;color:#172033;margin:32px;line-height:1.8}h1,h2{color:#0f3d55}small{color:#64748b}.context,.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}.context div,.grid div{border:1px solid #cbd5e1;border-radius:10px;padding:12px}.grid span,.grid strong,.grid small{display:block}.grid strong{font-size:17px}table{border-collapse:collapse;width:100%;font-size:11px;margin-top:16px}th,td{border:1px solid #cbd5e1;padding:6px;text-align:center}th{background:#eaf3f6}li{margin:8px 0}li span{display:block;color:#64748b}@media print{body{margin:12mm}}
  </style></head><body>
  <h1>${escapeHtml(title)}</h1>
  <p><b>${escapeHtml(project.name)}</b> · ${escapeHtml(project.code)}</p>
  <div class="context">
    <div>سناریو<strong>${escapeHtml(view.context.scenarioName)}</strong></div>
    <div>مبنای مالی<strong>${escapeHtml(view.context.calculationBasis)}</strong></div>
    <div>دوره اجرایی<strong>${escapeHtml(view.context.periodLabel)}</strong></div>
    <div>واحد نمایش<strong>${escapeHtml(view.context.displayUnit)}</strong></div>
    <div>واحد پول مبنا<strong>${escapeHtml(view.context.baseCurrency)}</strong></div>
    <div>نسخه محاسبه<strong>${escapeHtml(view.context.calculationVersion)}</strong></div>
    <div>محاسبه‌شده در<strong>${escapeHtml(view.context.calculatedAt)}</strong></div>
    <div>وضعیت<strong>${escapeHtml(view.decisions.overall.label)}</strong></div>
  </div>
  <h2>خلاصه تصمیم</h2><p>${escapeHtml(view.decisions.overall.reason)}</p>
  <div class="grid">${metricCards(project, view)}</div>
  <h2>صورت‌های مالی سالانه</h2>${statementTable(project, outputs)}
  <h2>ریسک‌ها و کنترل‌ها</h2><ul>${riskRows || "<li>هشدار فعالی ثبت نشده است.</li>"}</ul>
  </body></html>`;
};

export const buildReportCsv = (
  project: Project,
  scenario: Scenario,
  outputs: ScenarioOutputs,
  view: DashboardViewModel,
) => {
  assertExportable(view);
  const metadata = [
    ["Project", project.name],
    ["Scenario", scenario.name],
    ["CalculationVersion", view.context.calculationVersion],
    ["CalculatedAt", view.context.calculatedAt],
    ["FinancialPriceBasis", view.context.calculationBasis],
    ["EconomicPriceBasis", view.context.economicPriceBasis],
    ["BaseCurrency", view.context.baseCurrency],
    ["DisplayUnit", view.context.displayUnit],
    ["OperatingPeriod", view.context.periodLabel],
    ["DecisionStatus", view.decisions.overall.status],
  ].map((row) => row.map(csvCell).join(","));
  const metricHeader = ["MetricId", "Title", "RawValue", "DisplayValue", "Status", "Period", "PriceBasis", "InternalUnit", "DisplayUnit", "Threshold", "ThresholdOwner"];
  const metricRows = coreMetricIds.map((id) => {
    const metric = view.metrics[id];
    return [
      metric.id,
      metric.title,
      metric.value ?? "",
      formatDashboardMetric(metric, project),
      metric.status,
      metric.periodLabel,
      metric.priceBasis,
      metric.internalUnit,
      metric.displayUnit,
      metric.threshold?.value ?? "",
      metric.threshold?.owner ?? "",
    ].map(csvCell).join(",");
  });
  const statementHeader = ["Year", "RevenueRawBaseUnit", "COGSRawBaseUnit", "OPEXRawBaseUnit", "EBITDARawBaseUnit", "NetProfitRawBaseUnit", "FCFFRawBaseUnit", "FCFERawBaseUnit", "DSCR"];
  const statementRows = outputs.statements.rows.map((row) => [
    row.year,
    row.revenue,
    row.cogs,
    row.opex,
    row.ebitda,
    row.netProfit,
    row.fcff,
    row.fcfe,
    row.dscr ?? "",
  ].map(csvCell).join(","));
  return `\uFEFF${metadata.join("\n")}\n\n${metricHeader.map(csvCell).join(",")}\n${metricRows.join("\n")}\n\n${statementHeader.map(csvCell).join(",")}\n${statementRows.join("\n")}`;
};

export const exportReport = (
  kind: ReportExportKind,
  project: Project,
  scenario: Scenario,
  outputs: ScenarioOutputs,
  dirty = false,
) => {
  const view = buildDashboardViewModel(project, scenario, outputs, { dirty });
  if (!canExportDashboardView(view)) {
    return "گزارش مسدود شد: ابتدا تغییرات را محاسبه کنید تا خروجی جاری و قابل اتکا باشد.";
  }
  if (!view.context.displayUnitSupported) {
    return "گزارش مسدود شد: نمایش ارز خارجی بدون مسیر تبدیل نرخ ارز پشتیبانی نمی‌شود.";
  }
  const slug = `${project.code}-${scenario.code}`.replace(/[^a-zA-Z0-9-_]+/g, "-");
  if (kind === "excel") {
    download(buildReportCsv(project, scenario, outputs, view), "text/csv;charset=utf-8", `${slug}-model.csv`);
    return "فایل CSV با داده و فراداده یکسان داشبورد ساخته شد.";
  }
  const html = buildReportHtml(kind, project, scenario, outputs, view);
  if (kind === "pdf") {
    const printWindow = window.open("", "_blank");
    if (!printWindow) return "مرورگر پنجره چاپ را مسدود کرد؛ اجازه popup را فعال کنید.";
    printWindow.opener = null;
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
    return "نسخه چاپ باز شد؛ از Print گزینه Save as PDF را انتخاب کنید.";
  }
  const extension = kind === "word" ? "doc" : "html";
  const mime = kind === "word" ? "application/msword;charset=utf-8" : "text/html;charset=utf-8";
  download(`\uFEFF${html}`, mime, `${slug}-${kind}.${extension}`);
  return "فایل گزارش با داده و فراداده یکسان داشبورد ساخته شد.";
};
