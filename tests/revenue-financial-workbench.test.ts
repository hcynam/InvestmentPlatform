import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { calculateScenario } from "../src/lib/calculations";
import {
  buildFinancialStatementsWorkbenchModel,
  buildRevenueWorkbenchModel,
  workbenchInternals,
} from "../src/lib/revenue-financial-workbench";
import { seedProject } from "../src/lib/seed";
import type { Project } from "../src/lib/types";

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const closeTo = workbenchInternals.closeTo;

const buildBase = () => {
  const project = clone(seedProject) as Project;
  const scenario = project.scenarios[0];
  const outputs = calculateScenario(project);
  return { project, scenario, outputs };
};

const disableDebt = (project: Project, equity = 2_300_000_000_000) => {
  const financing = project.scenarios[0].assumptions.financing;
  financing.equity = equity;
  financing.longTermDebt = 0;
  financing.shortTermDebt = 0;
  financing.drawdown = {};
  financing.drawdownRows = [];
  financing.selectedDrawdownYears = [0];
  financing.instruments = (financing.instruments ?? []).map((instrument) => ({
    ...instrument,
    active: false,
    amount: 0,
  }));
  return project;
};

describe("revenue and financial statements workbenches", () => {
  it("builds revenue rows from demand, capacity, price and real statement outputs", () => {
    const { project, scenario, outputs } = buildBase();
    const model = buildRevenueWorkbenchModel(project, scenario, outputs);
    const yearOne = model.rows.find((row) => row.year === 1);

    assert.ok(model.isSolar);
    assert.equal(model.rows.length, project.modelHorizonYears + 1);
    assert.ok(yearOne);
    assert.ok(closeTo(yearOne.salesPrice * yearOne.salesVolume, yearOne.revenue, Math.max(1, yearOne.revenue * 0.000001)));
    assert.ok(yearOne.salesVolume <= yearOne.demand + 1);
    assert.ok(yearOne.salesVolume <= yearOne.productionCapacity + 1);
    assert.ok(closeTo(yearOne.revenue, outputs.statements.rows[1].revenue, 0.01));
    assert.ok(model.kpis.some((kpi) => kpi.id === "average-price" && kpi.unit === "unitMoney"));
    assert.ok(model.kpis.some((kpi) => kpi.id === "installed-capacity"));
    assert.ok(model.checks.every((check) => check.status !== "fail"));
  });

  it("keeps revenue model values finite and source-driven", () => {
    const { project, scenario, outputs } = buildBase();
    const model = buildRevenueWorkbenchModel(project, scenario, outputs);
    const numericValues = model.rows.flatMap((row) => [
      row.demand,
      row.productionCapacity,
      row.utilization,
      row.salesVolume,
      row.salesPrice,
      row.revenue,
      row.realRevenue,
      row.grossMargin,
      row.ebitdaMargin,
    ]);

    assert.ok(numericValues.every((value) => value === null || Number.isFinite(value)));
    assert.deepEqual(
      model.sources.map((source) => source.id).sort(),
      ["capacity", "macro", "market", "price", "scenario", "statements"].sort(),
    );
    assert.ok(model.sources.every((source) => source.editHref.startsWith("../")));
  });

  it("builds statement sections that tie out P&L, balance sheet, cash flow and ratios", () => {
    const { project, scenario, outputs } = buildBase();
    const model = buildFinancialStatementsWorkbenchModel(project, scenario, outputs);
    const yearOne = outputs.statements.rows[1];
    const debtService = outputs.financing.schedule[1].debtService;
    const expectedDscr = debtService > 0
      ? (yearOne.ebitda - yearOne.tax - yearOne.changeInWorkingCapital) / debtService
      : null;

    assert.deepEqual(model.sections.map((section) => section.id), ["income", "balance", "cashflow", "ratios"]);
    assert.ok(closeTo(yearOne.grossProfit, yearOne.revenue - yearOne.cogs));
    assert.ok(closeTo(yearOne.ebitda, yearOne.grossProfit - yearOne.opex));
    assert.ok(closeTo(yearOne.ebit, yearOne.ebitda - yearOne.depreciation));
    assert.ok(closeTo(yearOne.ebt, yearOne.ebit - yearOne.interest));
    assert.ok(closeTo(yearOne.cfo, yearOne.netProfit + yearOne.depreciation - yearOne.changeInWorkingCapital));
    assert.ok(closeTo(yearOne.cfi, -yearOne.capex));
    assert.ok(closeTo(yearOne.cff, yearOne.debtDrawdown + yearOne.equityInjection - yearOne.principalRepayment - yearOne.dividends));
    assert.ok(expectedDscr === null || closeTo(yearOne.dscr ?? 0, expectedDscr, 0.000001));
    assert.ok(model.checks.every((check) => check.status !== "fail"));
    assert.ok(model.sourceMap.some((source) => source.id === "financing" && source.unit === "ratio"));
  });

  it("keeps DSCR explicit and non-fake when there is no debt service", () => {
    const project = disableDebt(clone(seedProject) as Project);
    const scenario = project.scenarios[0];
    const outputs = calculateScenario(project);
    const model = buildFinancialStatementsWorkbenchModel(project, scenario, outputs);
    const dscrCheck = model.checks.find((check) => check.id === "dscr-definition");

    assert.equal(model.minDscr, null);
    assert.equal(model.averageDscr, null);
    assert.ok(outputs.statements.rows.every((row) => row.dscr === null));
    assert.equal(dscrCheck?.status, "pass");
    assert.ok(model.kpis.some((kpi) => kpi.id === "min-dscr" && kpi.value === null));
  });

  it("does not expose workbook cell references in the page components", () => {
    const revenueComponent = readFileSync("src/components/project/RevenueWorkbench.tsx", "utf8");
    const financialComponent = readFileSync("src/components/project/FinancialStatementsWorkbench.tsx", "utf8");

    assert.doesNotMatch(revenueComponent, /MarketDemand08|CapacityProduction09|FinancialStatements16|![A-Z]+\d+|Q52/);
    assert.doesNotMatch(financialComponent, /MarketDemand08|CapacityProduction09|FinancialStatements16|![A-Z]+\d+|Q52/);
    assert.match(financialComponent, /CFADS \/ Debt Service/);
  });
});
