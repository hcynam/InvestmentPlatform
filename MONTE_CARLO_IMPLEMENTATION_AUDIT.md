# Monte Carlo Implementation Audit

## Current QA Findings Addressed

- Performance was unacceptable because the previous loop cloned the full project once per variable shock. This has been replaced with one project clone per iteration and in-place shock application for that iteration scenario.
- The browser workflow previously ran synchronously. The workbench now uses chunked async execution with progress, elapsed time, estimated remaining time, and cancel.
- Variable configuration was below outputs. It is now above warnings, summary cards, charts, sampled rows, and provenance.
- The wide variable table has been replaced by compact cards to avoid page-level horizontal overflow.
- Repetitive truncated-normal warnings are grouped.
- Independent-only correlation is explicitly explained.
- Sampled rows are meaningful: worst/best NPV, P5/P50/P95-nearest, worst DSCR, worst liquidity, and one deterministic example.
- Statistical clarity was improved with valid/invalid counts, IRR invalid count, DSCR and cash-crunch probabilities, confidence interval, top invalid reasons, and VaR/CVaR convention text.
- Default distributions no longer present every variable as normal.

## Evidence

- Baseline timing probe before fix:
  - 100 iterations: 5,724 ms
  - 500 iterations: 27,902 ms
- Timing probe after fix:
  - 100 iterations: 1,223 ms
  - 500 iterations: 4,693 ms
- Validation passed:
  - `npm.cmd run typecheck`
  - `npm.cmd run test` - 82 tests passed
  - `npm.cmd run lint`
  - `npm.cmd run build`
  - Local HTTP smoke returned 200 for `http://127.0.0.1:3000/projects/solar-kerman/monte-carlo`

## Risks And Limitations

- Correlation remains independent-only by design for this pass.
- The v1 responsiveness mechanism is chunking, not a Web Worker.
- Browser visual automation was not available because Playwright is not installed and the in-app browser tool is not exposed in this thread.
- Netlify deployment must still be verified after push.
