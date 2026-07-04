# Monte Carlo Goal Loop Checklist

## QA/Fix Pass - 2026-07-03

- [x] Read the manual QA brief from the pasted text file.
- [x] Confirm real repo path: `D:\InvestmentPlatform`.
- [x] Confirm branch: `main` tracking `origin/main`.
- [x] Audit Monte Carlo engine, risk mutation, context runner, workbench UI, seed defaults, styles, and tests.
- [x] Measure baseline performance: 100 iterations 5,724 ms; 500 iterations 27,902 ms.
- [x] Identify primary bottleneck: full project clone per variable shock.
- [x] Optimize cloning to once per iteration with in-place scenario shocks.
- [x] Add chunked async Monte Carlo runner with progress callback.
- [x] Add cancel support.
- [x] Keep simulation run-on-demand instead of rerunning on every input edit.
- [x] Protect heavy presets: warning for 5000, disabled 10000.
- [x] Move variables before outputs.
- [x] Replace wide variable table with compact variable cards.
- [x] Show base value, unit, distribution, shock mode, exposure status, and effect logic per variable.
- [x] Format percentage/rate shocks as percentages in the UI.
- [x] Group repeated truncated-normal warnings.
- [x] Keep correlation disabled and clearly explained.
- [x] Select meaningful sampled rows instead of arbitrary iteration rows.
- [x] Surface valid/invalid counts, IRR invalid count, DSCR/cash-crunch probabilities, confidence interval, and VaR convention.
- [x] Update distribution defaults away from all-normal.
- [x] Add/update tests for deterministic async execution, cancel, grouped warnings, sampled labels, UI order, no full row rendering, and percentage shock formatting.

## Final Production Pass - 2026-07-04

- [x] Re-read the final production-readiness brief.
- [x] Confirm repo is clean at the start on `main...origin/main`.
- [x] Add visible run benchmark metrics: status, iterations, duration, average ms/iteration, started time, completed time.
- [x] Preserve progress, elapsed time, estimated remaining time, and cancel during chunked async runs.
- [x] Require explicit confirmation for 5000 iterations and keep 10000 disabled.
- [x] Block run when active variable configuration is invalid.
- [x] Group variables into revenue/market, macro/FX, investment/costs, financing/timing, and working-capital sections.
- [x] Make cards compact by default and move source path/effect logic/mutation details into expansion.
- [x] Add explicit missing, zero, and no-exposure base-value statuses.
- [x] Format percentage shocks as signed Persian percentages and absolute shocks with units.
- [x] Add delay discrete/integer validation warnings.
- [x] Add data-driven management interpretation near summary outputs.
- [x] Expand Persian VaR/CVaR convention text and negative-base-NPV note.
- [x] Add contribution-ranking methodology metadata and UI copy.
- [x] Improve chart axis/unit/context labels.
- [x] Add sampled-row reasons, specific status labels, and worst-row highlights.
- [x] Compact assumption provenance and hide overflow source paths behind expansion.
- [x] Strengthen independent-correlation limitation messaging.
- [x] Add/update tests for run metrics, progress snapshots, heavy protection, groups, formatting, base statuses, delay validation, VaR/CVaR metadata, contribution metadata, sample reasons, and seed determinism.
- [x] Fresh benchmark: 500 iterations 4,447 ms wall / 4,404 ms engine.
- [x] Fresh benchmark: 1000 iterations 8,846 ms wall / 8,790 ms engine.
- [x] Fresh benchmark: 5000 iterations 42,890 ms wall / 42,526 ms engine.
- [x] Run `npm.cmd run typecheck`.
- [x] Run `npm.cmd run test` - 82 tests passed.
- [x] Run `npm.cmd run lint`.
- [x] Run `npm.cmd run build`.
- [x] Run local route smoke check.
- [x] Review `git status`, `git diff --stat`, and `git diff --name-only`.
- [x] Commit with `Finalize Monte Carlo performance UX and risk interpretation`.
- [x] Push to tracked branch.
- [ ] Report commit hash, branch, changed files, validation results, push result, and Netlify verification status.

## Remaining Product Work

- [ ] Implement true correlation/covariance or copula-based sampling when product scope allows.
- [ ] Consider Web Worker execution for very large runs.
- [ ] Verify Netlify deployment after push before claiming deployed route freshness.
