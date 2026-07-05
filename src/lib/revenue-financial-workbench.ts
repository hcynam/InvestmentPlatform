import type { Project, Scenario, ScenarioOutputs, YearlyRow } from "@/lib/types";

export type WorkbenchTone = "success" | "warning" | "danger" | "neutral" | "info";

export type WorkbenchKpi = {
  id: string;
  label: string;
  value: number | null;
  unit: "money" | "unitMoney" | "number" | "percent" | "ratio";
  note: string;
  tone?: WorkbenchTone;
};

export type WorkbenchCheck = {
  id: string;
  label: string;
  status: "pass" | "warning" | "fail";
  message: string;
  evidence: string;
};

export type WorkbenchSource = {
  id: string;
  label: string;
  value: number | string | null;
  unit: "money" | "unitMoney" | "number" | "percent" | "ratio" | "text";
  sourceLabel: string;
  editHref: string;
  editLabel: string;
};

export type RevenueWorkbenchYear = {
  year: number;
  calendarYear: number;
  demand: number;
  productionCapacity: number;
  utilization: number;
  salesVolume: number;
  salesPrice: number;
  priceGrowth: number | null;
  revenue: number;
  realRevenue: number | null;
  domesticShare: number;
  exportShare: number;
  grossMargin: number | null;
  ebitdaMargin: number | null;
  sourceNote: string;
};

export type RevenueDriver = {
  id: string;
  label: string;
  value: number | string | null;
  unit: "money" | "unitMoney" | "number" | "percent" | "text";
  sourceLabel: string;
  description: string;
};

export type RevenueWorkbenchModel = {
  isSolar: boolean;
  volumeUnit: string;
  activeScenarioLabel: string;
  calculationBasis: string;
  rows: RevenueWorkbenchYear[];
  kpis: WorkbenchKpi[];
  drivers: RevenueDriver[];
  sources: WorkbenchSource[];
  checks: WorkbenchCheck[];
};

export type StatementLine = {
  id: string;
  label: string;
  unit: "money" | "percent" | "ratio" | "number";
  values: Array<number | null>;
  total?: boolean;
  indent?: boolean;
  formula?: string;
};

export type StatementSection = {
  id: "income" | "balance" | "cashflow" | "ratios";
  title: string;
  subtitle: string;
  lines: StatementLine[];
};

export type FinancialWorkbenchModel = {
  years: number[];
  rows: YearlyRow[];
  kpis: WorkbenchKpi[];
  sections: StatementSection[];
  checks: WorkbenchCheck[];
  sourceMap: WorkbenchSource[];
  minDscr: number | null;
  averageDscr: number | null;
  targetDscr: number;
};

const finiteOrNull = (value: unknown) => {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : null;
};

const finite = (value: unknown) => finiteOrNull(value) ?? 0;

const ratio = (numerator: number, denominator: number) =>
  Number.isFinite(numerator) && Number.isFinite(denominator) && Math.abs(denominator) > 1e-9
    ? numerator / denominator
    : null;

const closeTo = (actual: number, expected: number, tolerance = 1) =>
  Math.abs(actual - expected) <= tolerance;

const cagr = (start: number, end: number, years: number) => {
  if (start <= 0 || end <= 0 || years <= 0) return null;
  return (end / start) ** (1 / years) - 1;
};

const firstOperatingRow = <T extends { year: number }>(rows: T[]) =>
  rows.find((row) => row.year > 0) ?? rows[0];

const rowByYear = <T extends { year: number }>(rows: T[], year: number) =>
  rows.find((row) => row.year === year);

const allFinite = (values: Array<number | null | undefined>) =>
  values.every((value) => value === null || value === undefined || Number.isFinite(value));

const hasSolarProfile = (project: Project, scenario: Scenario) => {
  const text = [
    project.industry,
    project.subIndustry,
    project.projectType,
    scenario.assumptions.industry.mainIndustry,
    scenario.assumptions.industry.subIndustry,
    scenario.assumptions.industry.businessModel,
    scenario.assumptions.market.salesChannel,
  ].join(" ").toLowerCase();
  return text.includes("خورشیدی") || text.includes("برق") || text.includes("solar") || text.includes("ppa");
};

const checkStatus = (pass: boolean, warning = false): WorkbenchCheck["status"] =>
  pass ? "pass" : warning ? "warning" : "fail";

const passFailCheck = (
  id: string,
  label: string,
  pass: boolean,
  evidence: string,
  passMessage: string,
  failMessage: string,
  warning = false,
): WorkbenchCheck => ({
  id,
  label,
  status: checkStatus(pass, warning),
  message: pass ? passMessage : failMessage,
  evidence,
});

export const buildRevenueWorkbenchModel = (
  project: Project,
  scenario: Scenario,
  outputs: ScenarioOutputs,
): RevenueWorkbenchModel => {
  const isSolar = hasSolarProfile(project, scenario);
  const market = scenario.assumptions.market;
  const capacity = scenario.assumptions.capacity;
  const macro = scenario.assumptions.macro;
  const volumeUnit = market.unit || capacity.unit || scenario.assumptions.industry.productUnit || "واحد";
  const rows: RevenueWorkbenchYear[] = outputs.revenue.rows.map((row) => {
    const statement = rowByYear(outputs.statements.rows, row.year);
    const capacityRow = rowByYear(outputs.capacity.rows, row.year);
    const previous = rowByYear(outputs.revenue.rows, row.year - 1);
    const priceGrowth = row.year <= 1 || !previous || previous.salesPrice <= 0
      ? null
      : ratio(row.salesPrice - previous.salesPrice, previous.salesPrice);
    const inflationFactor = macro.inflationGeneralAnnual > -1
      ? (1 + macro.inflationGeneralAnnual) ** row.year
      : Number.NaN;
    return {
      year: row.year,
      calendarYear: project.baseYear + row.year,
      demand: row.demand,
      productionCapacity: capacityRow?.productionVolume ?? 0,
      utilization: capacityRow?.utilization ?? 0,
      salesVolume: row.salesVolume,
      salesPrice: row.salesPrice,
      priceGrowth,
      revenue: row.revenue,
      realRevenue: Number.isFinite(inflationFactor) && inflationFactor > 0 ? row.revenue / inflationFactor : null,
      domesticShare: market.domesticShare,
      exportShare: market.exportShare,
      grossMargin: statement?.grossMargin ?? null,
      ebitdaMargin: statement && statement.revenue > 0 ? statement.ebitda / statement.revenue : null,
      sourceNote: row.year === 0
        ? "سال ساخت و آماده‌سازی"
        : "تقاضا و قیمت از بازار، ظرفیت از تولید، درآمد از صورت سود و زیان کنترل می‌شود.",
    };
  });

  const yearOne = rows[1] ?? firstOperatingRow(rows);
  const stabilizedYear = Math.min(project.modelHorizonYears, Math.max(3, Math.min(5, project.modelHorizonYears)));
  const stabilized = rowByYear(rows, stabilizedYear) ?? rows.at(-1) ?? yearOne;
  const firstStatement = rowByYear(outputs.statements.rows, yearOne.year);
  const stableStatement = rowByYear(outputs.statements.rows, stabilized.year);
  const revenueCagr = cagr(yearOne.revenue, stabilized.revenue, Math.max(1, stabilized.year - yearOne.year));
  const marketCoverage = yearOne.demand > 0 ? yearOne.salesVolume / yearOne.demand : null;

  const kpis: WorkbenchKpi[] = [
    { id: "year-one-revenue", label: "درآمد سال اول بهره‌برداری", value: yearOne.revenue, unit: "money", note: `سال ${yearOne.calendarYear}` },
    { id: "stabilized-revenue", label: "درآمد سال پایدار", value: stabilized.revenue, unit: "money", note: `سال ${stabilized.calendarYear}` },
    { id: "revenue-cagr", label: "CAGR درآمد", value: revenueCagr, unit: "percent", note: `از سال ${yearOne.year} تا ${stabilized.year}` },
    { id: "sales-volume", label: isSolar ? "انرژی فروخته‌شده" : "حجم فروش", value: yearOne.salesVolume, unit: "number", note: volumeUnit },
    { id: "average-price", label: isSolar ? "تعرفه فروش برق" : "میانگین قیمت فروش", value: yearOne.salesPrice, unit: "unitMoney", note: `به ازای هر ${volumeUnit}` },
    { id: "price-growth", label: "رشد قیمت / تعرفه", value: market.priceGrowthRate || macro.salesPriceGrowth, unit: "percent", note: "از تب بازار یا مفروضات کلان" },
    { id: "utilization", label: isSolar ? "ضریب بهره‌برداری نیروگاه" : "ضریب بهره‌برداری", value: yearOne.utilization, unit: "percent", note: "سال اول" },
    { id: "market-coverage", label: "پوشش تقاضا", value: marketCoverage, unit: "percent", note: "فروش نسبت به تقاضای قابل تحقق" },
    { id: "gross-margin", label: "Gross Margin", value: firstStatement?.grossMargin ?? null, unit: "percent", note: "حاشیه ناخالص" },
    { id: "ebitda-margin", label: "EBITDA Margin", value: firstStatement && firstStatement.revenue > 0 ? firstStatement.ebitda / firstStatement.revenue : null, unit: "percent", note: "حاشیه عملیاتی نقدی" },
  ];

  if (isSolar) {
    kpis.push(
      { id: "installed-capacity", label: "ظرفیت نصب‌شده", value: capacity.nominalCapacity, unit: "number", note: "مگاوات" },
      { id: "effective-hours", label: "ساعات موثر سالانه", value: outputs.capacity.effectiveAnnualHours, unit: "number", note: "ساعت در سال" },
    );
  }

  const drivers: RevenueDriver[] = [
    {
      id: "demand",
      label: isSolar ? "تقاضای خرید برق" : "تقاضای بازار",
      value: yearOne.demand,
      unit: "number",
      sourceLabel: "از تب بازار و تقاضا",
      description: "تقاضای قابل جذب قبل از کنترل ظرفیت و سقف فروش.",
    },
    {
      id: "capacity",
      label: isSolar ? "تولید قابل فروش" : "ظرفیت قابل فروش",
      value: yearOne.productionCapacity,
      unit: "number",
      sourceLabel: "از تب ظرفیت و تولید",
      description: "ظرفیت موثر پس از بهره‌برداری، راندمان و تلفات.",
    },
    {
      id: "volume",
      label: isSolar ? "انرژی فروخته‌شده" : "مقدار فروش",
      value: yearOne.salesVolume,
      unit: "number",
      sourceLabel: "خروجی موتور درآمد",
      description: "کمینه ظرفیت قابل فروش و تقاضای قابل تحقق.",
    },
    {
      id: "price",
      label: isSolar ? "تعرفه PPA" : "قیمت فروش",
      value: yearOne.salesPrice,
      unit: "unitMoney",
      sourceLabel: "از تب بازار و مفروضات کلان",
      description: "قیمت پایه با رشد قیمت یا تعرفه سالانه.",
    },
    {
      id: "revenue",
      label: "درآمد عملیاتی",
      value: yearOne.revenue,
      unit: "money",
      sourceLabel: "کنترل با صورت سود و زیان",
      description: "قیمت ضربدر مقدار فروش و همسان با صورت‌های مالی.",
    },
  ];

  const sources: WorkbenchSource[] = [
    { id: "market", label: "تقاضا، مشتری هدف، کانال فروش و سقف فروش", value: `${market.mainMarket} / ${market.salesChannel}`, unit: "text", sourceLabel: "از تب بازار و تقاضا", editHref: "../market-demand", editLabel: "ویرایش بازار" },
    { id: "capacity", label: isSolar ? "ظرفیت نصب‌شده، تولید سالانه و بهره‌برداری" : "ظرفیت، تولید و بهره‌برداری", value: capacity.nominalCapacity, unit: "number", sourceLabel: "از تب ظرفیت و تولید", editHref: "../capacity-production", editLabel: "ویرایش ظرفیت" },
    { id: "price", label: isSolar ? "تعرفه فروش برق و رشد تعرفه" : "قیمت فروش و رشد قیمت", value: market.baseSalesPrice, unit: "unitMoney", sourceLabel: "از تب بازار و مفروضات کلان", editHref: "../market-demand", editLabel: "ویرایش قیمت" },
    { id: "scenario", label: "سناریوی فعال", value: scenario.name, unit: "text", sourceLabel: "از مدیر سناریو", editHref: "../scenarios", editLabel: "مدیریت سناریو" },
    { id: "macro", label: "تورم، مبنای اسمی/حقیقی و رشد قیمت", value: macro.calculationBasis, unit: "text", sourceLabel: "از تب مفروضات کلان", editHref: "../macro", editLabel: "ویرایش کلان" },
    { id: "statements", label: "تطابق درآمد با صورت سود و زیان", value: firstStatement?.revenue ?? null, unit: "money", sourceLabel: "از صورت‌های مالی", editHref: "../financial-statements", editLabel: "مشاهده صورت‌ها" },
  ];

  const tolerance = Math.max(1, Math.abs(yearOne.revenue) * 0.000001);
  const finiteValues = rows.flatMap((row) => [
    row.demand,
    row.productionCapacity,
    row.salesVolume,
    row.salesPrice,
    row.revenue,
    row.realRevenue,
    row.grossMargin,
    row.ebitdaMargin,
  ]);
  const checks: WorkbenchCheck[] = [
    passFailCheck(
      "price-volume",
      "کنترل فرمول درآمد",
      rows.every((row) => closeTo(row.salesPrice * row.salesVolume, row.revenue, Math.max(1, Math.abs(row.revenue) * 0.000001))),
      "قیمت × مقدار فروش = درآمد",
      "تمام سال‌ها با فرمول اصلی درآمد همخوان است.",
      "حداقل یک سال با فرمول قیمت ضربدر مقدار فروش همخوان نیست.",
    ),
    passFailCheck(
      "demand-cap",
      "کنترل سقف تقاضا و ظرفیت",
      rows.every((row) => row.year === 0 || (row.salesVolume <= row.demand + 1 && row.salesVolume <= row.productionCapacity + 1)),
      "Sales Volume <= Demand و Sales Volume <= Production",
      "حجم فروش از تقاضا و ظرفیت قابل فروش عبور نمی‌کند.",
      "حجم فروش در یک یا چند سال از تقاضا یا ظرفیت قابل فروش عبور کرده است.",
    ),
    passFailCheck(
      "statement-reconciliation",
      "تطابق با صورت‌های مالی",
      rows.every((row) => closeTo(row.revenue, rowByYear(outputs.statements.rows, row.year)?.revenue ?? 0, Math.max(1, Math.abs(row.revenue) * 0.000001))),
      `اختلاف سال اول: ${Math.abs((firstStatement?.revenue ?? 0) - yearOne.revenue).toFixed(2)} ریال`,
      "درآمد صفحه درآمد با فروش صورت سود و زیان برابر است.",
      "درآمد صفحه درآمد با صورت سود و زیان اختلاف دارد.",
    ),
    passFailCheck(
      "price-growth-source",
      "منبع رشد قیمت",
      Number.isFinite(market.priceGrowthRate || macro.salesPriceGrowth),
      "رشد قیمت از بازار یا مفروضات کلان خوانده می‌شود.",
      "رشد قیمت یا تعرفه منبع معتبر دارد.",
      "رشد قیمت یا تعرفه نامعتبر است.",
    ),
    passFailCheck(
      "finite-values",
      "کنترل مقادیر نامعتبر",
      allFinite(finiteValues),
      `تلورانس درآمد سال اول: ${tolerance.toFixed(2)} ریال`,
      "هیچ مقدار NaN یا Infinity در خروجی درآمد وجود ندارد.",
      "در خروجی درآمد مقدار نامعتبر وجود دارد.",
    ),
    passFailCheck(
      "domestic-export",
      "کنترل سهم داخلی و صادرات",
      closeTo(market.domesticShare + market.exportShare, 1, 0.0001),
      "سهم داخلی + صادرات = ۱",
      "تقسیم فروش داخلی و صادراتی کامل است.",
      "سهم داخلی و صادراتی به ۱ نمی‌رسد.",
      true,
    ),
    passFailCheck(
      "profitability-link",
      "اتصال به سودآوری",
      firstStatement !== undefined && stableStatement !== undefined,
      "Gross Margin و EBITDA Margin از صورت‌های مالی خوانده می‌شود.",
      "حاشیه‌ها از موتور صورت‌های مالی گرفته شده‌اند.",
      "برای محاسبه حاشیه‌ها ردیف صورت مالی کافی وجود ندارد.",
      true,
    ),
  ];

  return {
    isSolar,
    volumeUnit,
    activeScenarioLabel: scenario.name,
    calculationBasis: macro.calculationBasis,
    rows,
    kpis,
    drivers,
    sources,
    checks,
  };
};

const values = (rows: YearlyRow[], selector: (row: YearlyRow) => number | null) =>
  rows.map((row) => {
    const value = selector(row);
    return value === null || Number.isFinite(value) ? value : null;
  });

const totalLiabilities = (row: YearlyRow) => row.debt + row.operatingCurrentLiabilities;

const debtServiceForYear = (outputs: ScenarioOutputs, year: number) =>
  rowByYear(outputs.financing.schedule, year)?.debtService ?? 0;

export const buildFinancialStatementsWorkbenchModel = (
  project: Project,
  scenario: Scenario,
  outputs: ScenarioOutputs,
): FinancialWorkbenchModel => {
  const rows = outputs.statements.rows;
  const yearOne = rows[1] ?? firstOperatingRow(rows);
  const finalYear = rows.at(-1) ?? yearOne;
  const targetDscr = scenario.assumptions.financing.targetDscr;
  const debtToEquity = ratio(yearOne.debt, yearOne.equity);
  const firstCfo = yearOne.cfo;
  const balanceIssues = rows.filter((row) => row.balanceStatus !== "balanced");
  const dscrValues = rows.map((row) => row.dscr).filter((value): value is number => value !== null && Number.isFinite(value));
  const minDscr = outputs.financing.minimumDscr ?? (dscrValues.length ? Math.min(...dscrValues) : null);
  const averageDscr = outputs.financing.averageDscr ?? (dscrValues.length ? dscrValues.reduce((total, value) => total + value, 0) / dscrValues.length : null);

  const kpis: WorkbenchKpi[] = [
    { id: "revenue", label: "درآمد سال اول", value: yearOne.revenue, unit: "money", note: "صورت سود و زیان" },
    { id: "ebitda", label: "EBITDA سال اول", value: yearOne.ebitda, unit: "money", note: "سود عملیاتی نقدی", tone: yearOne.ebitda >= 0 ? "success" : "danger" },
    { id: "net-profit", label: "سود خالص سال اول", value: yearOne.netProfit, unit: "money", note: "پس از مالیات و هزینه مالی", tone: yearOne.netProfit >= 0 ? "success" : "warning" },
    { id: "cfo", label: "جریان نقد عملیاتی", value: firstCfo, unit: "money", note: "Net Income + D&A - ΔNWC", tone: firstCfo >= 0 ? "success" : "warning" },
    { id: "fcff", label: "FCFF سال اول", value: yearOne.fcff, unit: "money", note: "برای DCF شرکت", tone: yearOne.fcff >= 0 ? "success" : "warning" },
    { id: "fcfe", label: "FCFE سال اول", value: yearOne.fcfe, unit: "money", note: "برای سهامدار", tone: yearOne.fcfe >= 0 ? "success" : "warning" },
    { id: "ending-cash", label: "مانده نقد پایان سال", value: yearOne.cash, unit: "money", note: `سال ${project.baseYear + yearOne.year}` },
    { id: "total-assets", label: "کل دارایی‌ها", value: yearOne.totalAssets, unit: "money", note: "ترازنامه" },
    { id: "debt", label: "بدهی مالی / مانده وام", value: yearOne.debt, unit: "money", note: "وام و تامین کوتاه‌مدت" },
    { id: "equity", label: "حقوق صاحبان سهام", value: yearOne.equity, unit: "money", note: "آورده + سود انباشته" },
    { id: "balance", label: "کنترل تراز", value: yearOne.balanceCheck, unit: "money", note: yearOne.balanceStatus === "balanced" ? "تراز است" : "نیازمند بررسی", tone: yearOne.balanceStatus === "balanced" ? "success" : "danger" },
    { id: "min-dscr", label: "حداقل DSCR", value: minDscr, unit: "ratio", note: "CFADS / Debt Service", tone: minDscr === null ? "neutral" : minDscr >= targetDscr ? "success" : "danger" },
    { id: "interest-coverage", label: "پوشش بهره", value: yearOne.interestCoverage, unit: "ratio", note: "EBIT / Interest" },
    { id: "current-ratio", label: "نسبت جاری", value: yearOne.currentRatio, unit: "ratio", note: "دارایی جاری / بدهی جاری" },
    { id: "debt-to-equity", label: "Debt-to-Equity", value: debtToEquity, unit: "ratio", note: "بدهی / حقوق صاحبان" },
  ];

  const sections: StatementSection[] = [
    {
      id: "income",
      title: "صورت سود و زیان",
      subtitle: "درآمد، هزینه مستقیم، OPEX، EBITDA، EBIT، هزینه مالی، مالیات و سود خالص.",
      lines: [
        { id: "revenue", label: "فروش / درآمد عملیاتی", unit: "money", values: values(rows, (row) => row.revenue), total: true, formula: "Price × Sales Volume" },
        { id: "cogs", label: "COGS / هزینه مستقیم", unit: "money", values: values(rows, (row) => row.cogs), indent: true },
        { id: "gross-profit", label: "سود ناخالص", unit: "money", values: values(rows, (row) => row.grossProfit), total: true, formula: "Revenue - COGS" },
        { id: "gross-margin", label: "Gross Margin", unit: "percent", values: values(rows, (row) => row.grossMargin) },
        { id: "opex", label: "OPEX / هزینه‌های عملیاتی", unit: "money", values: values(rows, (row) => row.opex), indent: true },
        { id: "ebitda", label: "EBITDA", unit: "money", values: values(rows, (row) => row.ebitda), total: true, formula: "Gross Profit - OPEX" },
        { id: "depreciation", label: "استهلاک", unit: "money", values: values(rows, (row) => row.depreciation), indent: true },
        { id: "ebit", label: "EBIT", unit: "money", values: values(rows, (row) => row.ebit), total: true, formula: "EBITDA - Depreciation" },
        { id: "interest", label: "هزینه مالی / بهره", unit: "money", values: values(rows, (row) => row.interest), indent: true },
        { id: "ebt", label: "EBT", unit: "money", values: values(rows, (row) => row.ebt), total: true },
        { id: "tax", label: "مالیات", unit: "money", values: values(rows, (row) => row.tax), indent: true },
        { id: "net-profit", label: "سود خالص", unit: "money", values: values(rows, (row) => row.netProfit), total: true },
        { id: "net-margin", label: "Net Margin", unit: "percent", values: values(rows, (row) => ratio(row.netProfit, row.revenue)) },
      ],
    },
    {
      id: "balance",
      title: "ترازنامه",
      subtitle: "دارایی‌های جاری و ثابت، بدهی‌ها، آورده، سود انباشته و کنترل تراز.",
      lines: [
        { id: "cash", label: "وجه نقد", unit: "money", values: values(rows, (row) => row.cash) },
        { id: "receivables", label: "حساب‌های دریافتنی", unit: "money", values: values(rows, (row) => row.receivables), indent: true },
        { id: "inventory", label: "موجودی مواد/کالا", unit: "money", values: values(rows, (row) => row.inventory), indent: true },
        { id: "prepayments", label: "پیش‌پرداخت‌ها و سایر جاری", unit: "money", values: values(rows, (row) => row.prepayments), indent: true },
        { id: "current-assets", label: "دارایی‌های جاری عملیاتی", unit: "money", values: values(rows, (row) => row.operatingCurrentAssets), total: true },
        { id: "gross-fixed-assets", label: "دارایی ثابت ناخالص", unit: "money", values: values(rows, (row) => row.grossFixedAssets) },
        { id: "accumulated-depreciation", label: "استهلاک انباشته", unit: "money", values: values(rows, (row) => row.accumulatedDepreciation), indent: true },
        { id: "net-fixed-assets", label: "دارایی ثابت خالص", unit: "money", values: values(rows, (row) => row.netFixedAssets), total: true },
        { id: "total-assets", label: "کل دارایی‌ها", unit: "money", values: values(rows, (row) => row.totalAssets), total: true },
        { id: "payables", label: "حساب‌های پرداختنی", unit: "money", values: values(rows, (row) => row.payables), indent: true },
        { id: "current-liabilities", label: "بدهی جاری عملیاتی", unit: "money", values: values(rows, (row) => row.operatingCurrentLiabilities), total: true },
        { id: "short-term-funding", label: "تامین مالی کوتاه‌مدت ضمنی", unit: "money", values: values(rows, (row) => row.shortTermFunding), indent: true },
        { id: "debt", label: "بدهی بلندمدت / مانده وام", unit: "money", values: values(rows, (row) => row.debt), total: true },
        { id: "total-liabilities", label: "کل بدهی‌ها", unit: "money", values: values(rows, totalLiabilities), total: true },
        { id: "paid-in-capital", label: "سرمایه پرداخت‌شده", unit: "money", values: values(rows, (row) => row.paidInCapital) },
        { id: "retained-earnings", label: "سود انباشته", unit: "money", values: values(rows, (row) => row.retainedEarnings), indent: true },
        { id: "equity", label: "کل حقوق صاحبان سهام", unit: "money", values: values(rows, (row) => row.equity), total: true },
        { id: "liabilities-equity", label: "کل بدهی و حقوق صاحبان سهام", unit: "money", values: values(rows, (row) => row.totalLiabilitiesAndEquity), total: true },
        { id: "balance-check", label: "کنترل تراز", unit: "money", values: values(rows, (row) => row.balanceCheck), total: true },
      ],
    },
    {
      id: "cashflow",
      title: "صورت جریان وجوه نقد",
      subtitle: "CFO، CFI، CFF و اتصال مانده نقد به ترازنامه.",
      lines: [
        { id: "net-profit", label: "سود خالص", unit: "money", values: values(rows, (row) => row.netProfit) },
        { id: "depreciation", label: "استهلاک", unit: "money", values: values(rows, (row) => row.depreciation) },
        { id: "delta-nwc", label: "تغییرات سرمایه در گردش", unit: "money", values: values(rows, (row) => row.changeInWorkingCapital) },
        { id: "cfo", label: "CFO / جریان نقد عملیاتی", unit: "money", values: values(rows, (row) => row.cfo), total: true },
        { id: "capex", label: "CAPEX / سرمایه‌گذاری ثابت", unit: "money", values: values(rows, (row) => row.capex) },
        { id: "cfi", label: "CFI / جریان نقد سرمایه‌گذاری", unit: "money", values: values(rows, (row) => row.cfi), total: true },
        { id: "debt-drawdown", label: "دریافت وام", unit: "money", values: values(rows, (row) => row.debtDrawdown) },
        { id: "principal", label: "بازپرداخت اصل وام", unit: "money", values: values(rows, (row) => row.principalRepayment) },
        { id: "equity-injection", label: "تزریق سرمایه", unit: "money", values: values(rows, (row) => row.equityInjection) },
        { id: "dividends", label: "سود تقسیمی", unit: "money", values: values(rows, (row) => row.dividends) },
        { id: "cff", label: "CFF / جریان نقد تامین مالی", unit: "money", values: values(rows, (row) => row.cff), total: true },
        { id: "net-cash-flow", label: "تغییر خالص وجه نقد", unit: "money", values: values(rows, (row) => row.netCashFlow), total: true },
        { id: "ending-cash", label: "وجه نقد پایان دوره", unit: "money", values: values(rows, (row) => row.cash), total: true },
      ],
    },
    {
      id: "ratios",
      title: "نسبت‌ها و بانک‌پذیری",
      subtitle: "DSCR بر اساس CFADS / Debt Service و پوشش بهره به صورت جداگانه.",
      lines: [
        { id: "dscr", label: "DSCR = CFADS / Debt Service", unit: "ratio", values: values(rows, (row) => row.dscr), total: true },
        { id: "interest-coverage", label: "Interest Coverage = EBIT / Interest", unit: "ratio", values: values(rows, (row) => row.interestCoverage) },
        { id: "debt-service", label: "Debt Service", unit: "money", values: values(rows, (row) => debtServiceForYear(outputs, row.year)) },
        { id: "debt-balance", label: "Debt Balance", unit: "money", values: values(rows, (row) => row.debt) },
        { id: "debt-to-equity", label: "Debt-to-Equity", unit: "ratio", values: values(rows, (row) => ratio(row.debt, row.equity)) },
        { id: "current-ratio", label: "Current Ratio", unit: "ratio", values: values(rows, (row) => row.currentRatio) },
        { id: "ebitda-margin", label: "EBITDA Margin", unit: "percent", values: values(rows, (row) => ratio(row.ebitda, row.revenue)) },
        { id: "net-margin", label: "Net Margin", unit: "percent", values: values(rows, (row) => ratio(row.netProfit, row.revenue)) },
        { id: "roa", label: "ROA", unit: "percent", values: values(rows, (row) => ratio(row.netProfit, row.totalAssets)) },
        { id: "roe", label: "ROE", unit: "percent", values: values(rows, (row) => ratio(row.netProfit, row.equity)) },
      ],
    },
  ];

  const finiteValues = rows.flatMap((row) => [
    row.revenue,
    row.cogs,
    row.grossProfit,
    row.opex,
    row.ebitda,
    row.depreciation,
    row.ebit,
    row.interest,
    row.ebt,
    row.tax,
    row.netProfit,
    row.cfo,
    row.cfi,
    row.cff,
    row.cash,
    row.debt,
    row.equity,
    row.balanceCheck,
    row.dscr,
    row.interestCoverage,
  ]);

  const checks: WorkbenchCheck[] = [
    passFailCheck(
      "revenue-reconcile",
      "درآمد با صفحه Revenue برابر است",
      rows.every((row) => closeTo(row.revenue, rowByYear(outputs.revenue.rows, row.year)?.revenue ?? 0, Math.max(1, Math.abs(row.revenue) * 0.000001))),
      "فروش سالانه با خروجی درآمد متناظر کنترل شد.",
      "فروش صورت سود و زیان با خروجی درآمد همخوان است.",
      "فروش صورت سود و زیان با خروجی درآمد اختلاف دارد.",
    ),
    passFailCheck("gross-profit", "Gross Profit = Revenue - COGS", rows.every((row) => closeTo(row.grossProfit, row.revenue - row.cogs)), "تمام سال‌ها", "سود ناخالص درست محاسبه شده است.", "سود ناخالص در یک یا چند سال همخوان نیست."),
    passFailCheck("ebitda", "EBITDA = Gross Profit - OPEX", rows.every((row) => closeTo(row.ebitda, row.grossProfit - row.opex)), "تمام سال‌ها", "EBITDA با سود ناخالص و OPEX همخوان است.", "EBITDA در یک یا چند سال همخوان نیست."),
    passFailCheck("ebit", "EBIT = EBITDA - Depreciation", rows.every((row) => closeTo(row.ebit, row.ebitda - row.depreciation)), "تمام سال‌ها", "EBIT با استهلاک همخوان است.", "EBIT در یک یا چند سال همخوان نیست."),
    passFailCheck("ebt", "EBT = EBIT - Interest", rows.every((row) => closeTo(row.ebt, row.ebit - row.interest)), "تمام سال‌ها", "EBT با هزینه مالی همخوان است.", "EBT در یک یا چند سال همخوان نیست."),
    passFailCheck("cfo", "CFO = Net Income + D&A - ΔNWC", rows.every((row) => row.year === 0 || closeTo(row.cfo, row.netProfit + row.depreciation - row.changeInWorkingCapital)), "سال‌های عملیاتی", "جریان نقد عملیاتی با سود خالص، استهلاک و سرمایه در گردش همخوان است.", "CFO در یک یا چند سال همخوان نیست."),
    passFailCheck("cfi", "CFI شامل CAPEX است", rows.every((row) => closeTo(row.cfi, -row.capex)), "CFI = -CAPEX", "جریان نقد سرمایه‌گذاری با CAPEX همخوان است.", "CFI و CAPEX اختلاف دارند."),
    passFailCheck("cff", "CFF شامل بدهی، آورده و بازپرداخت است", rows.every((row) => closeTo(row.cff, row.debtDrawdown + row.equityInjection - row.principalRepayment - row.dividends)), "Debt Drawdown + Equity - Principal - Dividends", "جریان نقد تامین مالی همخوان است.", "CFF در یک یا چند سال همخوان نیست."),
    passFailCheck("cash-roll-forward", "مانده نقد و تامین کوتاه‌مدت", rows.every((row) => closeTo(row.cash - row.shortTermFunding, row.cumulativeCashFlow)), "Cash - Short Term Funding = cumulative cash flow", "مانده نقد و تامین کوتاه‌مدت با جریان نقد تجمعی همخوان است.", "مانده نقد با جریان نقد تجمعی همخوان نیست."),
    passFailCheck(
      "balance",
      "کنترل ترازنامه",
      balanceIssues.length === 0,
      balanceIssues.length ? `سال‌های ناتراز: ${balanceIssues.map((row) => row.year).join(", ")}` : "تمام سال‌ها تراز هستند.",
      "ترازنامه در همه سال‌ها تراز است.",
      "ترازنامه در یک یا چند سال ناتراز است و اختلاف باید نمایش داده شود.",
      true,
    ),
    passFailCheck(
      "dscr-definition",
      "DSCR با CFADS / Debt Service محاسبه می‌شود",
      rows.every((row) => {
        const debtService = debtServiceForYear(outputs, row.year);
        const expected = debtService > 0 ? ratio(row.ebitda - row.tax - row.changeInWorkingCapital, debtService) : null;
        return expected === null ? row.dscr === null : closeTo(row.dscr ?? 0, expected, 0.000001);
      }),
      "CFADS = EBITDA - Tax - ΔNWC",
      "DSCR از CFADS و خدمت بدهی استفاده می‌کند و با پوشش بهره یکی نیست.",
      "DSCR با تعریف CFADS / Debt Service همخوان نیست.",
    ),
    passFailCheck(
      "finite-values",
      "کنترل NaN / Infinity",
      allFinite(finiteValues),
      "تمام خروجی‌های عددی اصلی بررسی شدند.",
      "مقادیر عددی اصلی معتبر هستند.",
      "در صورت‌های مالی مقدار NaN یا Infinity وجود دارد.",
    ),
    passFailCheck(
      "final-year",
      "وضعیت سال پایانی",
      finalYear.balanceStatus === "balanced",
      finalYear.balanceStatus === "balanced" ? "سال پایانی تراز است." : `اختلاف تراز سال پایانی: ${finalYear.balanceCheck.toFixed(2)} ریال`,
      "سال پایانی هم تراز است.",
      "سال پایانی دارای اختلاف تراز است و به عنوان محدودیت مدل نمایش داده می‌شود.",
      true,
    ),
  ];

  const sourceMap: WorkbenchSource[] = [
    { id: "revenue", label: "فروش و حجم فروش", value: yearOne.revenue, unit: "money", sourceLabel: "از Revenue و Market Demand", editHref: "../revenue", editLabel: "مشاهده درآمد" },
    { id: "cogs", label: "هزینه مستقیم", value: yearOne.cogs, unit: "money", sourceLabel: "از تب هزینه مستقیم", editHref: "../direct-costs", editLabel: "ویرایش COGS" },
    { id: "opex", label: "هزینه عملیاتی", value: yearOne.opex, unit: "money", sourceLabel: "از تب OPEX", editHref: "../opex", editLabel: "ویرایش OPEX" },
    { id: "capex", label: "CAPEX و استهلاک", value: outputs.capex.totalCapex, unit: "money", sourceLabel: "از Capex و TaxDepreciation", editHref: "../capex", editLabel: "ویرایش CAPEX" },
    { id: "working-capital", label: "سرمایه در گردش", value: yearOne.changeInWorkingCapital, unit: "money", sourceLabel: "از تب سرمایه در گردش", editHref: "../working-capital", editLabel: "ویرایش NWC" },
    { id: "financing", label: "وام، بهره، اصل و DSCR", value: minDscr, unit: "ratio", sourceLabel: "از تب تامین مالی", editHref: "../financing", editLabel: "ویرایش تامین مالی" },
    { id: "tax", label: "مالیات و استهلاک مالیاتی", value: yearOne.tax, unit: "money", sourceLabel: "از موتور مالیات و استهلاک", editHref: "../valuation", editLabel: "مشاهده DCF" },
  ];

  return {
    years: rows.map((row) => row.year),
    rows,
    kpis,
    sections,
    checks,
    sourceMap,
    minDscr,
    averageDscr,
    targetDscr,
  };
};

export const workbenchInternals = {
  closeTo,
  finite,
  finiteOrNull,
  ratio,
};
