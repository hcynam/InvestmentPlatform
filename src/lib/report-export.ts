import type { Project, Scenario, ScenarioOutputs } from "@/lib/types";

export type ReportExportKind = "excel" | "pdf" | "word" | "bank" | "investor" | "board";

const escapeHtml = (value: unknown) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;");

const number = (value: number | null | undefined) =>
  value === null || value === undefined || !Number.isFinite(value)
    ? "ناموجود"
    : new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 2 }).format(value);

const percent = (value: number | null | undefined) =>
  value === null || value === undefined || !Number.isFinite(value)
    ? "ناموجود"
    : new Intl.NumberFormat("fa-IR", { style: "percent", maximumFractionDigits: 2 }).format(value);

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

const statementTable = (outputs: ScenarioOutputs) => `
  <table><thead><tr><th>سال</th><th>درآمد</th><th>COGS</th><th>OPEX</th><th>EBITDA</th><th>مالیات</th><th>سود خالص</th><th>FCFF</th><th>DSCR</th></tr></thead>
  <tbody>${outputs.statements.rows.map((row) => `<tr><td>${number(row.year)}</td><td>${number(row.revenue)}</td><td>${number(row.cogs)}</td><td>${number(row.opex)}</td><td>${number(row.ebitda)}</td><td>${number(row.tax)}</td><td>${number(row.netProfit)}</td><td>${number(row.fcff)}</td><td>${number(row.dscr)}</td></tr>`).join("")}</tbody></table>`;

const reportHtml = (kind: ReportExportKind, project: Project, scenario: Scenario, outputs: ScenarioOutputs) => {
  const title = {
    excel: "خروجی داده مدل",
    pdf: "گزارش امکان‌سنجی و بانک‌پذیری",
    word: "گزارش امکان‌سنجی و بانک‌پذیری",
    bank: "پکیج اعتباری بانک",
    investor: "پکیج سرمایه‌گذار",
    board: "گزارش هیئت‌مدیره",
  }[kind];
  const bankSection = kind === "bank" || kind === "pdf" || kind === "word" ? `
    <h2>تحلیل بانک‌پذیری</h2>
    <div class="grid"><div>حداقل DSCR<strong>${number(outputs.financing.minimumDscr)}</strong></div><div>میانگین DSCR<strong>${number(outputs.financing.averageDscr)}</strong></div><div>بدهی فعال<strong>${number(outputs.financing.kpis.totalDebt)}</strong></div><div>پوشش وثیقه<strong>${number(outputs.financing.kpis.collateralCoverage)}</strong></div></div>` : "";
  const riskRows = outputs.validations.map((issue) => `<li><b>${escapeHtml(issue.message)}</b>${issue.recommendation ? `<span>${escapeHtml(issue.recommendation)}</span>` : ""}</li>`).join("");
  return `<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>
    body{font-family:Tahoma,Arial,sans-serif;color:#172033;margin:32px;line-height:1.8}h1,h2{color:#0f3d55}small{color:#64748b}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}.grid div{border:1px solid #cbd5e1;border-radius:10px;padding:12px}.grid strong{display:block;font-size:18px}table{border-collapse:collapse;width:100%;font-size:11px;margin-top:16px}th,td{border:1px solid #cbd5e1;padding:6px;text-align:center}th{background:#eaf3f6}li{margin:8px 0}li span{display:block;color:#64748b}@media print{body{margin:12mm}.no-print{display:none}}
  </style></head><body><h1>${escapeHtml(title)}</h1><p><b>${escapeHtml(project.name)}</b> · ${escapeHtml(project.code)} · سناریو ${escapeHtml(scenario.name)}</p><small>تولیدشده در ${escapeHtml(new Date().toLocaleString("fa-IR"))}</small>
  <h2>خلاصه تصمیم</h2><p>${escapeHtml(outputs.dashboards.aiReview.join(" "))}</p>
  <div class="grid"><div>NPV<strong>${number(outputs.valuation.npv)}</strong></div><div>IRR<strong>${percent(outputs.valuation.irr)}</strong></div><div>Payback<strong>${number(outputs.valuation.payback)}</strong></div><div>Bankability<strong>${number(outputs.dashboards.bankabilityScore)}</strong></div></div>
  ${bankSection}<h2>صورت‌های مالی سالانه</h2>${statementTable(outputs)}<h2>ریسک‌ها و کنترل‌ها</h2><ul>${riskRows || "<li>هشدار فعالی ثبت نشده است.</li>"}</ul></body></html>`;
};

const csv = (project: Project, scenario: Scenario, outputs: ScenarioOutputs) => {
  const header = ["Project", project.name, "Scenario", scenario.name, "GeneratedAt", outputs.generatedAt].join(",");
  const columns = ["Year", "Revenue", "COGS", "OPEX", "EBITDA", "Depreciation", "EBIT", "Interest", "Tax", "NetProfit", "CFO", "CFI", "CFF", "Cash", "Debt", "Equity", "FCFF", "DSCR", "CurrentRatio", "QuickRatio", "CCC"];
  const rows = outputs.statements.rows.map((row) => [row.year, row.revenue, row.cogs, row.opex, row.ebitda, row.depreciation, row.ebit, row.interest, row.tax, row.netProfit, row.cfo, row.cfi, row.cff, row.cash, row.debt, row.equity, row.fcff, row.dscr ?? "", row.currentRatio ?? "", row.quickRatio ?? "", row.cashConversionCycle ?? ""].join(","));
  return `\uFEFF${header}\n${columns.join(",")}\n${rows.join("\n")}`;
};

export const exportReport = (
  kind: ReportExportKind,
  project: Project,
  scenario: Scenario,
  outputs: ScenarioOutputs,
) => {
  const slug = `${project.code}-${scenario.code}`.replace(/[^a-zA-Z0-9-_]+/g, "-");
  if (kind === "excel") {
    download(csv(project, scenario, outputs), "text/csv;charset=utf-8", `${slug}-model.csv`);
    return "فایل Excel/CSV واقعی ساخته شد.";
  }
  const html = reportHtml(kind, project, scenario, outputs);
  if (kind === "pdf") {
    const printWindow = window.open("", "_blank");
    if (!printWindow) return "مرورگر پنجره چاپ را مسدود کرد؛ اجازه popup را فعال کنید.";
    printWindow.opener = null;
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
    return "نسخه چاپ باز شد؛ از Print، گزینه Save as PDF را انتخاب کنید.";
  }
  const extension = kind === "word" ? "doc" : "html";
  const mime = kind === "word" ? "application/msword;charset=utf-8" : "text/html;charset=utf-8";
  download(`\uFEFF${html}`, mime, `${slug}-${kind}.${extension}`);
  return "فایل گزارش واقعی ساخته شد.";
};
