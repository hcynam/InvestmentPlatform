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
- [x] Run `npm.cmd run typecheck`.
- [x] Run `npm.cmd run test`.
- [x] Run `npm.cmd run lint`.
- [x] Run `npm.cmd run build`.
- [x] Run local route smoke check.
- [ ] Review `git status`, `git diff --stat`, and `git diff --name-only`.
- [ ] Commit with `Optimize Monte Carlo performance and risk variable workflow`.
- [ ] Push to tracked branch.
- [ ] Report commit hash, branch, changed files, validation results, push result, and Netlify verification status.

## Remaining Product Work

- [ ] Implement true correlation/covariance/coplanar sampling when product scope allows.
- [ ] Consider Web Worker execution for very large runs.
- [ ] Verify Netlify deployment after push before claiming deployed route freshness.
