import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

describe("financing and construction workspace QA contracts", () => {
  it("uses canonical financing dependencies for preview and marks draft edits stale", () => {
    const source = read("src/components/project/FinancingWorkspace.tsx");

    assert.match(source, /createFinancingDrawdownDrivers\(outputs\.capex\.annual\)/);
    assert.match(source, /setDirtyState\(true\)/);
    assert.match(source, /disabled=\{disabled \|\| !preview\.isValid\}/);
    assert.match(source, /mode === "advanced"/);
    assert.doesNotMatch(source, />Section \d+</);
    assert.doesNotMatch(source, />Financing14</);
    assert.doesNotMatch(source, /label="پیش‌دریافت \/ پیش‌پرداخت"/);
  });

  it("keeps construction on the canonical financing schedule and contains development credit", () => {
    const source = read("src/components/project/ConstructionCashFlowWorkspace.tsx");
    const context = read("src/store/project-context.tsx");
    const styles = read("src/styles/globals.css");

    assert.match(source, /financingSchedule: outputs\.financing\.schedule/);
    assert.match(source, /setDirtyState\(true\)/);
    assert.match(source, /mode === "advanced"/);
    assert.doesNotMatch(source, />Section \d+</);
    assert.doesNotMatch(source, />ConstructionCashFlow</);
    assert.doesNotMatch(source, /label="خط اعتباری توسعه فعال است؟"/);
    assert.match(context, /validateFinancingAssumptions\(financing, current\.modelHorizonYears\)/);
    assert.match(context, /if \(!validation\.isValid\) return current/);
    assert.match(styles, /container-type:\s*inline-size/);
    assert.match(styles, /\.construction-cost-table th:nth-child\(2\)/);
    assert.match(styles, /\.financing-service-table th:first-child/);
  });

  it("removes known technical labels from other production-facing traces", () => {
    const scenarios = read("src/components/project/ScenarioManager.tsx");
    const dashboard = read("src/components/project/ExecutiveDashboard.tsx");

    assert.doesNotMatch(scenarios, />ScenarioManager06</);
    assert.doesNotMatch(scenarios, /<small>\{field\.help\}<\/small>/);
    assert.doesNotMatch(dashboard, /source="(?:DCF-Valuation17|Financing14|Sensitivity19)/);
  });
});
