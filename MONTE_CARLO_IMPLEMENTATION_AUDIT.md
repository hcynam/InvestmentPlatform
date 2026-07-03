# Monte Carlo Implementation Audit

## Baseline

- Repo: `D:\InvestmentPlatform`
- Branch: `main` tracking `origin/main`
- Baseline commit before this implementation: `f4202b2 Finalize sensitivity analysis BCR units layout and thresholds`
- Baseline validation before edits:
  - `npm.cmd run lint`: passed
  - `npx.cmd tsc --noEmit --incremental false`: passed
  - `npm.cmd run test`: passed, 69 tests

## Current Code Findings

- Route `src/app/projects/[projectId]/monte-carlo/page.tsx` delegates to the generic `ModulePage`.
- Existing Monte Carlo UI is a small generic advanced panel inside `ModulePage`.
- Existing Monte Carlo calculation is embedded in `src/lib/calculations.ts`, not isolated from React-facing code.
- Current simulation already reruns the core calculation engine, but the variable model is legacy string matching over Persian names.
- Existing output is too small for production risk analysis: only P5/P50/P95, NPV probability, DSCR breach probability, VaR95/CVaR95, histogram, and full iteration rows.
- Existing distribution support is limited to triangular, uniform, and truncated normal.
- Existing implementation does not expose iteration invalid reasons, confidence intervals, contribution analysis, CDF, scatter data, or explicit quality gates.
- Existing UI renders only a simple histogram, with no provenance, variable library, invalid iteration breakdown, or correlation status.

## Implementation Direction

- Implemented `src/lib/monte-carlo-engine.ts` as a standalone deterministic engine.
- `calculateMonteCarlo` now delegates to `runMonteCarloSimulation`, while `calculateScenarioCore` exposes the risk-safe core runner for tests and reuse.
- Implemented shared risk-variable mutation in `src/lib/risk-variable-engine.ts`; sensitivity now uses the shared mutation call for shock application.
- The engine supports seeded triangular, PERT, uniform, truncated normal, lognormal, and discrete sampling with validation warnings.
- Correlation remains independent-only in v1 and emits the visible disabled message: `همبستگی در این نسخه فقط به‌صورت مستقل اجرا می‌شود`.
- Iteration rows remain structured in engine output, while the UI renders only `sampledRows`.
- Invalid metric values are kept as `null` with invalid reasons; IRR is never faked as zero.

## Implemented Code Findings

- Added rich Monte Carlo types in `src/lib/types.ts`: run status, invalid reasons, distributions, samples, iteration results, metric summaries, quality warnings, histograms, CDF/scatter data, contribution ranking, and correlation config.
- Added `src/components/project/MonteCarloWorkbench.tsx` and replaced the old generic `ModulePage` Monte Carlo block for both Basic and Advanced views.
- Added context actions for save-only settings and run-on-demand simulation.
- Added focused tests in `tests/monte-carlo-engine.test.ts`.

## Initial Risks

- Full model reruns are expensive; 5,000 iterations can be heavy in the browser.
- The sensitivity engine already owns much of the variable mapping; duplicating it would create drift.
- `next-env.d.ts` and `tsconfig.tsbuildinfo` are tracked and can be touched by validation commands; review before commit.

## Current Risk Treatment

- UI exposes 500, 1000, and 5000 presets; 10000 remains disabled.
- No full iteration table is rendered in React; charts use aggregated data and the table uses curated samples.
- Shared mutation reduces drift between sensitivity and Monte Carlo mappings.
