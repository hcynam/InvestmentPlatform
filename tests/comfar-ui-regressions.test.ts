import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { formatGregorianDate, formatPlainYear, normalizeRate } from "../src/lib/format";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

describe("COMFAR baseline UI guardrails", () => {
  it("formats Gregorian dates without timezone drift and years without grouping", () => {
    assert.equal(formatGregorianDate("2026-08-04"), "۲۰۲۶/۰۸/۰۴");
    assert.equal(formatGregorianDate("2026-02-30"), "تعریف‌نشده");
    assert.equal(formatPlainYear(1405).includes("٬"), false);
  });

  it("normalizes floating point rate input", () => {
    assert.equal(normalizeRate(7.000000000000001), 7);
  });

  it("keeps technical provenance out of normal phase-one field rendering", () => {
    const fields = read("src/components/phase-one/PhaseOneFields.tsx");
    assert.equal(fields.includes("{source ? <small"), false);
    assert.equal(fields.includes("{item.sourceSheet ? <code>"), false);
    assert.match(fields, /optionLabels\?\.\[option\] \?\? option/);
  });

  it("keeps setup and macro workspaces free of scenario UUID and trace panels", () => {
    const workspaces = read("src/components/phase-one/PhaseOneWorkspaces.tsx");
    const setup = workspaces.slice(workspaces.indexOf("export function ProjectSetupWorkspace"), workspaces.indexOf("const macroTabs"));
    const macro = workspaces.slice(workspaces.indexOf("export function MacroWorkspace"), workspaces.indexOf("const industryTabs"));
    assert.equal(setup.includes("سناریوی فعال"), false);
    assert.equal(setup.includes("FormulaTraceMini"), false);
    assert.equal(macro.includes('id: "controls"'), false);
    assert.equal(macro.includes("FormulaTraceMini"), false);
  });

  it("labels project creation dates and currency display units explicitly", () => {
    const page = read("src/app/projects/new/page.tsx");
    assert.match(page, /تاریخ شروع ساخت \(میلادی\)/);
    assert.match(page, /پروژه جدید/);
    assert.equal(page.includes(">New Project<"), false);
    assert.match(page, /baseCurrency === "تومان" \? tomanUnits : rialUnits/);
  });

  it("keeps the shared project shell honest and omits empty separators", () => {
    const shell = read("src/components/project/ProjectShell.tsx");
    assert.equal(shell.includes("مدل به‌روز"), false);
    assert.match(shell, /محاسبات ثبت شده‌اند/);
    assert.match(shell, /filter\(Boolean\)\.join\(" \/ "\)/);
    assert.equal(shell.includes("{project.industry} / {project.subIndustry}"), false);
  });
});
