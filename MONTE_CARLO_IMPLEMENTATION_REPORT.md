# Monte Carlo Implementation Report

## Status

Final production-readiness QA/fix pass completed locally on 2026-07-04. The Monte Carlo tab now exposes run benchmark metrics, progress/cancel, protected heavy presets, compact grouped risk-variable cards, clearer statistical/financial interpretation, and stronger production UX around warnings, provenance, charts, and sampled paths.

## Performance Evidence

Measured in the local working tree with the real calculation engine and seeded `solar-kerman` assumptions.

| Run | Prior instrumented baseline | Current wall time | Engine duration | Average per iteration |
| --- | ---: | ---: | ---: | ---: |
| 500 iterations | 27,902 ms | 4,447 ms | 4,404 ms | 8.81 ms |
| 1000 iterations | not previously recorded | 8,846 ms | 8,790 ms | 8.79 ms |
| 5000 iterations | not previously recorded | 42,890 ms | 42,526 ms | 8.51 ms |

Manual QA originally observed about one minute for 500 browser iterations. The current 500-run local engine probe is under 5 seconds, and the UI uses chunked async execution so browser runs can show progress and remain cancellable.

Top bottlenecks found in the earlier audit:

- Full-project cloning once per variable shock was the dominant cost.
- The original browser runner behaved like one synchronous task.
- Rendering all iterations was avoided, but the old variable table created workflow and layout friction.

## What Changed In This Final Pass

- Added result-level `durationMs`, `averageMsPerIteration`, `baseNpv`, VaR notes, and contribution-method metadata.
- Added visible run benchmark cards for status, iterations, progress, duration, average ms/iteration, started time, and completed time.
- Kept chunked async execution with progress, estimated remaining time, and cancel; a Web Worker is still not implemented.
- Protected the 5000 preset with explicit confirmation; 10000 remains disabled.
- Blocked runs when active variable configurations are invalid.
- Grouped risk variables into five collapsible sections: revenue/market, macro/FX, investment/costs, financing/timing, and working capital.
- Made variable cards compact by default, with base value, unit, distribution, shock chips, and exposure/status visible; source path, mutation target, effect logic, and warnings are expandable.
- Added explicit missing/zero/no-exposure base-value states.
- Added delay validation for discrete/integer month handling.
- Added a data-driven Persian management interpretation box.
- Expanded VaR/CVaR explanation in Persian, including the negative-base-NPV caution.
- Made contribution ranking explicitly correlation-based and non-causal.
- Added chart axis/unit/context labels for histogram, CDF, scatter, and contribution views.
- Added sampled-row reasons, specific status labels, and highlight classes for worst NPV, worst DSCR, and worst liquidity.
- Made provenance compact and moved overflow source detail behind expansion.
- Strengthened independent-correlation limitation messaging.

## Distribution Defaults

No additional seed-default churn was needed in this final pass. The current defaults already avoid presenting every variable as normal: sales price uses PERT, sales volume triangular, FX/CAPEX/material/labor/energy PERT-style skewed ranges, debt interest discrete, construction delay discrete, and receivable days triangular.

## Validation

Passed locally during this pass:

- `npm.cmd run lint`
- `npm.cmd run typecheck`
- `npm.cmd run test` - 82 tests passed
- `npm.cmd run build`
- Local HTTP smoke: `http://127.0.0.1:3100/projects/solar-kerman/monte-carlo` returned 200 with Monte Carlo content.

## Changed Files

- `src/components/project/MonteCarloWorkbench.tsx`
- `src/lib/monte-carlo-engine.ts`
- `src/lib/types.ts`
- `src/styles/globals.css`
- `tests/monte-carlo-engine.test.ts`
- `MONTE_CARLO_IMPLEMENTATION_REPORT.md`
- `MONTE_CARLO_GOAL_LOOP_CHECKLIST.md`
- `MONTE_CARLO_IMPLEMENTATION_AUDIT.md`

## Remaining Limitations

- Correlation/covariance is still independent-only and explicitly disclosed.
- Web Worker execution is not implemented; chunked async execution is the current responsiveness mechanism.
- `5000` is usable but heavy, so it remains confirmation-protected.
- Netlify deployment status must not be claimed until the pushed commit finishes deploying and the deployed route is verified.
