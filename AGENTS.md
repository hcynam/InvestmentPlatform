# InvestmentPlatform — Repository Guidance

## Product mission
This repository is the canonical web implementation of an Iranian, COMFAR-like investment-feasibility and decision-support platform. It supports Simple and Advanced modes over one shared financial/economic calculation model.

Correctness, traceability, usability for Iranian businesses, and controlled scope take precedence over broad refactoring or cosmetic completeness.

## Canonical scope
- Treat the tracked application under `src/` and its targeted tests under `tests/` as the default product scope.
- Treat these root-level duplicate or copied applications as out of scope unless the user explicitly names one:
  - `MarketPilot-repo/`
  - `OpenCodeTest/`
  - `OpenCodeTest_backup_after_hardening/`
  - `OpenCodeTest_backup_before_ai_phase1/`
  - `OpenCodeTest_backup_before_ai_phase2/`
  - `OpenCodeTest_backup_before_ai_phase4_final/`
  - `OpenCodeTest_backup_before_codex_finalization/`
  - `OpenCodeTest_backup_before_final_qa/`
  - `OpenCodeTest_backup_phase4_after_dynamic_kpi/`
  - `OpenCodeTest_backup_phase4_before_fix/`
  - `OpenCodeTest_backup_phase5_partial_after_limit/`
  - `OpenCodeTest_FINAL_PERSIAN_EXPORT_READY/`
  - `OpenCodeTest_FINAL_PERSIAN_PRO_READY/`
  - `OpenCodeTest_FINAL_READY_SUBMISSION/`
- Treat generated, cache, artifact, debug archive, and deployment-output paths as out of scope unless the task explicitly targets them.
- Treat `.codex-review/` as historical diagnostic output. Do not read or update it unless the user explicitly requests capability/configuration review.
- Do not modify global Codex skills or `C:\Users\User\.codex\` / `C:\Users\User\.agents\` configuration during ordinary project work.
- Do not infer that the newest-looking audit, backup, or copied file is canonical.
- Before using a historical audit or comparison document as authority, confirm that its paths, formulas, and decisions still match the current tracked code.
- Do not modify, reset, delete, stage, or commit pre-existing user changes unless explicitly requested.

## Product invariants
1. Simple and Advanced modes must use the same calculation engines and canonical data. They may differ in exposed inputs, explanations, controls, and depth of output—not in financial truth.
2. Every domain value must have one authoritative owner. UI components, dashboards, exports, and reports consume results; they do not silently recreate financial formulas.
3. A downstream module must consume upstream outputs through the existing typed model, selector, service, or engine boundary. Avoid copy-pasted formulas and parallel state.
4. Dashboards and report modules are output layers. They must not become independent sources of truth.
5. Preserve explicit distinctions between:
   - financial and economic analysis;
   - nominal/current and real/constant prices;
   - rial and toman;
   - base currency and transaction currency;
   - construction and operation periods;
   - project, equity, lender, and economic cash-flow views.
6. Do not hardcode changing Iranian rates, rules, or market values inside formulas or UI components. Model them as dated, sourced assumptions.
7. A confirmed workbook error must not be reproduced merely to force parity. Correct it only with concise evidence of the rule, impact, and affected outputs.

## Canonical workbook policy
The primary workbook reference is `edition19_4June.xlsx`, unless the user explicitly designates a newer canonical version.

The workbook is not currently present in the tracked repository or attached Codex kit. Confirm its exact repository or attachment path before opening or comparing it; do not invent a path or select a copy by folder name alone.

Its sheet sequence is documented in the repository-local `investment-model-lineage` skill. The workbook is a primary structural and numerical reference, but it is not infallible.

When workbook access is unavailable:
- continue with current code and existing lineage evidence when sufficient;
- state the limitation once;
- do not repeatedly retry unavailable Excel tooling.

## Required workflow for calculation changes
For any task that changes a formula, KPI, financial/economic output, dependency between modules, workbook mapping, or scenario behavior:
- use the `investment-model-lineage` skill;
- identify the input owner, calculation owner, and consuming outputs before editing;
- check whether the value already exists elsewhere before adding new state or logic;
- make the smallest coherent change;
- verify only affected calculations and immediate dependants.

For finance, feasibility, banking, economic analysis, or Iran-specific domain logic, also use the `iran-investment-feasibility` skill.

## Scope and implementation discipline
- Do not audit the entire repository unless the user explicitly requests a repository-wide audit.
- Do not refactor unrelated code, rename broad surfaces, replace libraries, change architecture, or introduce dependencies without a demonstrated requirement.
- Do not create large speculative frameworks for a single feature.
- Reuse existing types, engines, validators, formatters, and source-trace structures where they are fit for purpose.
- Keep domain calculations out of presentational React components.
- Keep display formatting out of core calculation functions.
- Preserve strict TypeScript behavior; do not bypass errors with broad `any`, disabled checks, or silent fallbacks.
- Do not replace real project data with mock data to make a screen appear complete.
- Do not silently swallow invalid financial inputs. Return or surface a meaningful validation state.

## UI skill policy
- Do not implicitly use `impeccable` or `ui-ux-pro-max` for routine forms, financial tables, spacing fixes, copy changes, or small component edits.
- Use those broad UI skills only when the user explicitly requests a full UI/UX audit, visual redesign, or design-system-level work.
- Use `motion-framer` only when animation or interaction motion is explicitly requested and the required package already exists.
- For ordinary product UI work, follow the existing design system and make a targeted change.
- Preserve Persian RTL behavior, Persian labels, financial readability, and correct mixed Persian/Latin number alignment.

## Verification policy
Verification must be proportional to the change.

Default order:
1. static inspection of changed code and direct call sites;
2. the smallest existing targeted test covering the changed engine or module, using the repository's declared Node test runner;
3. `npm run typecheck` or `npm run lint` only when needed for confidence or required by the task;
4. `npm run build` only when build-level integration evidence is warranted;
5. a narrow browser smoke check only for changed user-visible behavior.

Rules:
- Use the scripts declared in `package.json`: `test`, `typecheck`, `lint`, and `build`.
- Prefer a single targeted test file with `node --test --import tsx <test-file>` over `npm test` when one file covers the change.
- Do not run every test, full browser suites, broad audits, or repeated builds by default.
- If a check fails because of environment, missing external access, unavailable Excel session, or pre-existing unrelated errors, try once, record the exact blocker, and use the best low-cost alternative.
- Do not repeat the same failing command without a meaningful change in conditions.
- Never change domain logic merely to make an unsuitable test pass.

## Definition of done
A task is complete when:
- the requested behavior is implemented in the correct ownership layer;
- duplicate calculations were not introduced;
- affected inputs, units, time basis, and outputs remain traceable;
- targeted verification is complete or one clearly stated blocker remains;
- unrelated files and user changes remain untouched;
- the final response states changed files, key decision, verification performed, and any unresolved risk concisely.

## Communication
- Prefer implementation over long audits, planning documents, or repeated status narration.
- Ask a question only when a missing decision would materially change the financial meaning, data ownership, or irreversible implementation choice.
- Otherwise choose the smallest defensible option and state the assumption.
- Keep reports short and actionable. Do not create documentation unless it will remain a maintained project reference or the user explicitly requests it.
