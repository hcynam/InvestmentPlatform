import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { calculateScenario } from "../src/lib/calculations";
import { seedProject } from "../src/lib/seed";
import type { Project } from "../src/lib/types";

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

describe("calculation engine", () => {
  it("builds full annual statements from year 0 to model horizon", () => {
    const project = clone(seedProject);
    const outputs = calculateScenario(project);

    assert.equal(outputs.statements.rows.length, project.modelHorizonYears + 1);
    assert.equal(outputs.statements.rows[0].year, 0);
    assert.equal(outputs.statements.rows.at(-1)?.year, 20);
    assert.equal(outputs.valuation.fcffByYear.length, 21);
  });

  it("creates a real loan schedule with debt service and remaining balance", () => {
    const project = clone(seedProject);
    const outputs = calculateScenario(project);
    const paidYears = outputs.financing.schedule.filter((row) => row.debtService > 0);

    assert.ok(paidYears.length > 0);
    assert.ok(Math.abs(outputs.financing.schedule.at(-1)?.endingBalance ?? 0) < 1);
    assert.ok(outputs.financing.totalInterest > 0);
  });

  it("does not propagate Excel #N/A tax errors into year 20", () => {
    const project = clone(seedProject);
    const outputs = calculateScenario(project);
    const finalTax = outputs.tax.rows.at(-1);

    assert.equal(finalTax?.year, 20);
    assert.equal(Number.isFinite(finalTax?.tax ?? Number.NaN), true);
    assert.equal(Number.isFinite(finalTax?.lossCarryForward ?? Number.NaN), true);
  });

  it("recalculates valuation when an editable input changes", () => {
    const baseProject = clone(seedProject);
    const highPriceProject = clone(seedProject) as Project;
    highPriceProject.scenarios[0].assumptions.market.baseSalesPrice *= 1.25;

    const baseNpv = calculateScenario(baseProject).valuation.npv;
    const highPriceNpv = calculateScenario(highPriceProject).valuation.npv;

    assert.notEqual(baseNpv, highPriceNpv);
    assert.ok(highPriceNpv > baseNpv);
  });
});
