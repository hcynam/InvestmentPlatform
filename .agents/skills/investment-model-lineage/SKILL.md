---
name: investment-model-lineage
description: Trace and govern calculations across the canonical Excel workbook, typed web data, calculation engines, UI, dashboards, and exports. Use when mapping sheets/cells/formulas to web fields, changing a financial or economic formula, resolving duplicate calculations, defining single-source-of-truth ownership, diagnosing Excel/Web differences, tracing a KPI, or selecting targeted parity checks. Do not use for ordinary UI styling, copywriting, deployment, or purely conceptual finance questions with no project-model impact.
---

# Investment Model Lineage

Use this workflow to make model changes traceable, minimal, and consistent.

## 1. Establish the exact change boundary
State in one compact block:
- requested outcome;
- affected module(s);
- expected input owner;
- expected calculation owner;
- expected consumer(s);
- workbook sheet(s), if relevant.

Do not begin with a repository-wide audit.

## 2. Find the authoritative producer before editing
Search in this order:
1. existing typed domain state and source/provenance metadata;
2. existing calculation engine or domain service;
3. direct callers and downstream consumers;
4. canonical workbook mapping and formula evidence;
5. historical audit documents only as supporting evidence.

Before adding a field or formula, prove that an equivalent value is not already produced elsewhere.

Read `references/calculation-ownership.md` when ownership or module boundaries are unclear.
Read `references/workbook-parity-contract.md` for workbook mapping, parity, units, timing, or correction rules.

## 3. Build a minimal lineage record
For every changed output, capture only what is necessary:

| Item | Required evidence |
|---|---|
| Business meaning | What the value represents and for whom |
| Source | User input, upstream engine, workbook cell/range, or external assumption |
| Owner | The single function/module that computes or validates it |
| Formula/rule | Formula, algorithm, or transformation in normalized terms |
| Dimensions | Currency, unit scale, nominal/real basis, period, scenario |
| Consumers | Screens, dashboards, exports, and dependant engines |
| Verification | One or more targeted checks |

Do not produce a large lineage document unless the user asks for one. Keep this in working notes or a concise final summary.

## 4. Preserve single-source-of-truth boundaries
- Put reusable domain formulas in the relevant engine or domain utility, not in React presentation code.
- Consume upstream results rather than reconstructing them downstream.
- Keep dashboards and reports read-only consumers of canonical outputs.
- Keep Simple and Advanced modes on the same underlying value and formula.
- Do not create a second scenario engine, currency conversion path, discounting implementation, tax formula, or KPI definition when one already exists.
- When consolidation is necessary, change the smallest safe boundary and migrate direct consumers; do not refactor the entire project.

## 5. Reconcile workbook and web deliberately
Classify differences before changing code:
- mapping error;
- sign convention;
- unit scale;
- nominal/real mismatch;
- currency mismatch;
- timing/year-zero convention;
- scenario mismatch;
- rounding/display-only difference;
- stale workbook or stale code;
- confirmed workbook defect;
- confirmed web defect.

Do not force numeric equality until the classification is known.

If the workbook is wrong, implement the defensible rule and record:
- workbook location;
- current behavior;
- corrected rule;
- affected outputs;
- evidence or rationale.

## 6. Implement the smallest coherent change
- Modify only the authoritative producer and necessary consumers.
- Reuse existing types such as source, trace, validation, and scenario metadata where available.
- Add validation at the earliest layer that understands the business rule.
- Preserve deterministic calculation functions where possible.
- Do not hide invalid values with `0`, empty strings, fabricated defaults, or silent catches.

## 7. Verify proportionally
Choose the smallest useful set:
1. one direct formula/unit check;
2. one affected engine or module test;
3. one immediate downstream check;
4. one narrow UI smoke check only when visible behavior changed.

For workbook parity, use a small representative scenario and compare raw, unrounded values before display formatting.

If a tool or environment is unavailable, try once, state the blocker, and use static formula tracing or existing fixtures. Do not loop on failed tooling.

## 8. Return a concise implementation record
Report only:
- files changed;
- authoritative owner used;
- workbook/code difference resolved, if any;
- verification performed;
- remaining risk or blocker.

Do not create an audit report unless explicitly requested.
