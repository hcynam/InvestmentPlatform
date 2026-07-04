# Monte Carlo Implementation Audit

## Current QA Findings Addressed

- Runtime evidence is now visible in the result contract and the UI: last run iterations, duration, average ms/iteration, status, started time, and completed time.
- Chunked async execution remains the implemented responsiveness mechanism; progress and cancel are visible during run.
- Heavy presets are safer: 5000 requires explicit confirmation and 10000 remains disabled.
- Variable configuration remains above outputs and is now grouped into compact collapsible sections.
- Variable cards show explicit base-value states, including missing base value, zero base value, and no effective exposure.
- Percentage/rate shocks are displayed as signed Persian percentages, while absolute shocks include units.
- Delay variables are validated for discrete/integer month handling.
- Independent-only correlation is clearly explained as a limitation for investment-report use.
- Summary outputs now include a data-driven management interpretation.
- VaR/CVaR wording distinguishes NPV percentiles from base-relative downside loss and includes the negative-base-NPV caution.
- Contribution ranking is explicitly correlation-based and non-causal.
- Charts now show axis/context/unit labels.
- Sampled rows include reasons, specific risk status labels, and highlighted worst paths.
- Assumption provenance remains available but is compacted to reduce visual repetition.

## Evidence

Fresh local benchmark on the current working tree:

- 500 iterations: 4,447 ms wall time; 4,404 ms engine duration; 8.81 ms per iteration.
- 1000 iterations: 8,846 ms wall time; 8,790 ms engine duration; 8.79 ms per iteration.
- 5000 iterations: 42,890 ms wall time; 42,526 ms engine duration; 8.51 ms per iteration.

Validation completed in this final pass:

- `npm.cmd run lint` passed.
- `npm.cmd run typecheck` passed.
- `npm.cmd run test` passed with 82 tests.
- `npm.cmd run build` passed.
- Local HTTP smoke returned 200 with Monte Carlo content for `http://127.0.0.1:3100/projects/solar-kerman/monte-carlo`.

## Risks And Limitations

- Correlation remains independent-only by design for this pass; no fake correlation controls or fabricated matrix are shown.
- Web Worker execution is not implemented; chunking is acceptable for v1 but a Worker remains the natural next step for very large professional runs.
- 5000 iterations are benchmarked but still heavy in a browser context, so confirmation remains required.
- Netlify deployment must still be verified after push before claiming the deployed page is updated.
