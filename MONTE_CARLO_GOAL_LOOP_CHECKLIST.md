# Monte Carlo Goal Loop Checklist

## Phase 0 - Audit

- [x] Confirm repo and branch.
- [x] Inspect current Monte Carlo route, UI, engine, types, and tests.
- [x] Locate and inspect workbook `MonteCarlo20`.
- [x] Record initial Excel findings.
- [x] Create initial audit, comparison, checklist, and report files.

## Phase 1 - Engine

- [x] Add dedicated Monte Carlo engine.
- [x] Add typed Monte Carlo config, variable, distribution, sample, iteration, summary, histogram, warning, invalid-reason, run-status, and correlation types.
- [x] Reuse shared risk-variable mutation logic.
- [x] Remove legacy inline Monte Carlo logic from `calculations.ts`.

## Phase 2 - Sampling

- [x] Use deterministic seeded randomness.
- [x] Support triangular, PERT, uniform, normal/truncated normal, lognormal, and discrete distributions.
- [x] Validate invalid parameters and positive-only variables.
- [x] Report truncation and invalid distribution warnings.

## Phase 3 - Model Mapping

- [x] Map shocks to real model fields.
- [x] Keep WACC separate from debt interest.
- [x] Restrict FX to FX-linked exposures.
- [x] Avoid price/volume/revenue double counting.
- [x] Connect delay and working-capital shocks or report limitations.

## Phase 4 - Outputs And Statistics

- [x] Extract iteration metrics from the recalculated model.
- [x] Count valid and invalid iterations.
- [x] Compute percentiles, confidence intervals, standard error, skewness, kurtosis, VaR, CVaR, probabilities, downside deviation, and contribution ranking.
- [x] Generate histogram, CDF, scatter, and contribution data from real results.

## Phase 5 - UI

- [x] Replace generic Monte Carlo panel with dedicated workbench.
- [x] Add simulation controls, quality warnings, provenance, variable table, summary cards, charts, and sample iteration table.
- [x] Keep correlation visibly disabled.
- [x] Avoid rendering all iterations in the DOM.
- [x] Preserve compact Persian RTL financial SaaS style.

## Phase 6 - Tests And Validation

- [x] Add Monte Carlo engine tests.
- [x] Add UI/render tests where feasible.
- [x] Run `npm.cmd run lint`.
- [x] Run `npm.cmd run typecheck`.
- [x] Run `npm.cmd run test`.
- [x] Run `npm.cmd run build`.

## Phase 7 - Git And Deployment

- [x] Review `git status`, `git diff --stat`, and changed files.
- [ ] Commit with `Implement production-grade Monte Carlo simulation engine`.
- [ ] Push to `origin/main`.
- [ ] Retry Netlify route verification and report actual status.
