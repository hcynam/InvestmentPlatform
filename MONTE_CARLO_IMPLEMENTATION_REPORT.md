# Monte Carlo Implementation Report

## Status

Focused QA/fix pass completed locally. The Monte Carlo tab now has a faster real-engine simulation path, chunked browser execution with progress/cancel, configuration-first variable UX, grouped warnings, meaningful sampled rows, and updated tests. Git commit/push and Netlify verification are handled after validation.

## Performance Audit

Measured with the local Node timing probe against `calculateMonteCarlo` and the real calculation engine:

| Run | Before | After |
| --- | ---: | ---: |
| 100 iterations | 5,724 ms | 1,223 ms |
| 500 iterations | 27,902 ms | 4,693 ms |
| Time per 100 iterations at 500-run scale | 5,580 ms | 939 ms |

Top bottleneck found:

- Each variable shock deep-cloned the entire project. A 500-iteration run with many active variables could create thousands of full project clones before each core model rerun.
- The browser runner was synchronous, so even moderate runs blocked the main thread until the full simulation returned.
- Rendering was not the main bottleneck because the UI already avoided `result.rows.map`, but the variable table was too wide and placed after the outputs.

Main-thread behavior:

- Before: the browser run was effectively one synchronous task.
- After: the workbench uses chunked async execution and yields between chunks. A Web Worker was not added in this pass; chunking is the implemented v1 responsiveness fix.

## What Changed

- Optimized risk mutation so Monte Carlo clones the project once per iteration, then applies all active shocks in place to that iteration scenario.
- Added `calculateMonteCarloAsync` / `runMonteCarloSimulationAsync` with chunk size, progress callback, elapsed time, estimated remaining time, and cancel signal.
- Kept the synchronous deterministic runner for tests and non-UI callers.
- Added progress and cancel controls to the workbench header.
- Kept simulation run-on-demand only; changing controls edits the draft and does not rerun automatically.
- Moved risk-variable configuration above outputs.
- Replaced the wide risk-variable table with compact cards showing active state, source module, base value, distribution, low/mode/high inputs, shock mode, exposure badge, and effect logic.
- Added percentage/rate/absolute shock previews so values like `-0.10 / 0 / 0.10` are visibly shown as percentage shocks when appropriate.
- Grouped repeated truncated-normal warnings into one expandable warning.
- Updated correlation copy to explicitly state independent-only sampling and the possible understatement of simultaneous shocks.
- Reworked sampled iterations to select worst NPV, best NPV, P5/P50/P95-nearest, worst DSCR, worst liquidity, and one deterministic example row.
- Added validity/statistical clarity: valid/invalid counts, IRR valid/invalid counts, DSCR breach probability, cash-crunch probability, NPV confidence interval, top invalid reasons, and explicit VaR/CVaR convention copy.
- Changed default seeded distributions away from all-normal: PERT/triangular for price, volume, CAPEX, materials, labor and energy; discrete for debt-rate and delay; triangular for receivable days.

## Heavy Presets

- `500`: quick interactive run.
- `1000`: standard run.
- `5000`: available as a professional/heavy run with visible warning and chunked execution.
- `10000`: still disabled until a formal benchmark supports it.

## Validation

Passed locally:

- `npm.cmd run typecheck`
- `npm.cmd run test` - 82 tests passed
- `npm.cmd run lint`
- `npm.cmd run build`
- Local HTTP smoke: `http://127.0.0.1:3000/projects/solar-kerman/monte-carlo` returned 200 with Monte Carlo content

Additional performance probe:

- 500 iterations completed in 4,693 ms locally after optimization, down from 27,902 ms before.

Browser automation:

- Playwright is not installed in this repo/runtime, so no automated screenshot was captured in this pass.
- Local route smoke passed; manual deployed-site visual verification is still required after Netlify redeploys.

## Changed Files

- `src/lib/monte-carlo-engine.ts`
- `src/lib/risk-variable-engine.ts`
- `src/lib/calculations.ts`
- `src/store/project-context.tsx`
- `src/components/project/MonteCarloWorkbench.tsx`
- `src/styles/globals.css`
- `src/lib/seed.ts`
- `src/lib/types.ts`
- `tests/monte-carlo-engine.test.ts`
- `MONTE_CARLO_IMPLEMENTATION_REPORT.md`
- `MONTE_CARLO_GOAL_LOOP_CHECKLIST.md`
- `MONTE_CARLO_IMPLEMENTATION_AUDIT.md`

## Remaining Limitations

- Correlation/covariance is still not implemented; the UI explicitly communicates independent sampling.
- Web Worker execution is not implemented; chunked async execution is the current responsiveness mechanism.
- `5000` is protected with warning/chunking, but still should be treated as a heavier professional run.
- Netlify deployment status must not be claimed until the pushed commit finishes deploying and the route is verified there.
