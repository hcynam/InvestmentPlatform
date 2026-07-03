# Monte Carlo Excel Comparison

## Workbook

- Workbook path: `C:\Users\User\Desktop\edition19_4June.xlsx`
- Sheet audited: `MonteCarlo20`
- Workbook sheet count: 25

## Excel Structure To Preserve

- Variable table with low, mode, high, distribution, active flag, and description.
- Simulation controls for active status, iteration count, seed, thresholds, and comments.
- Statistical outputs for percentiles, probability metrics, VaR/CVaR, histogram data, and model validity.
- Iteration-level sample rows for shocks and simulated outputs.
- Persian RTL labels for a professional financial feasibility workflow.

## Excel Findings To Improve

- Seed cell `T13` is `123`, but simulation formulas use `RAND()`, so the workbook is not reproducible.
- Active status `T9` is `غیرفعال`, while formulas and outputs remain calculated.
- Distribution formulas use independent random numbers; no real correlation, copula, Cholesky, or matrix logic was found.
- NPV uses a simplified one-year adjusted FCFF plus terminal-value approximation:
  - adjusted sales, costs, OPEX, CAPEX, discount rate, FCFF, terminal value, then NPV.
- IRR is not a true IRR. It uses a proxy like `(NPV / CAPEX)^(1 / horizon) - 1` and falls back to zero through `IFERROR`.
- Debt interest shock is mixed into discount rate logic in the Excel model; web implementation must keep WACC and debt interest separate.
- Liquidity output is a working-capital proxy, not a full cash-flow or construction/operating liquidity run.
- Histogram references are documented as `A1094:B1115` and `C1094:D1115`, but the sheet dimensions end at row 1090.
- Model validity is weak: iteration count, output count, and standard deviation checks only.

## Web Implementation Difference

- The web engine does not copy the flawed Excel formulas.
- Each iteration clones the project, applies typed shocks, reruns the platform calculation engine, and extracts NPV, IRR, MIRR, payback, DSCR, liquidity, equity value, BCR, financing cost, cash-crunch, bankability, and health metrics from real outputs.
- Seeded deterministic sampling replaces Excel `RAND()`.
- Invalid iterations and invalid metrics are counted and explained with typed invalid reasons.
- VaR/CVaR uses a documented base-relative downside loss convention: `loss = base NPV - iteration NPV`.
- Correlation is explicitly disabled for this version instead of being implied.
- The UI shows provenance and quality warnings rather than fake matrix/copula controls.

## Variable Mapping

- Sales price: `assumptions.market.baseSalesPrice`
- Sales volume: market/capacity volume drivers
- Revenue: sales price adjustment without double-counting price and volume
- FX: FX-rate tiers and FX-linked exposures only
- Inflation: macro inflation assumptions
- CAPEX: CAPEX item prices and delay-sensitive CAPEX fields
- OPEX: OPEX item amounts
- Direct costs: direct/COGS item costs
- Debt interest: financing instruments and debt-service schedule
- WACC/discount rate: macro valuation rates
- Delay: construction delay and CAPEX delay metadata
- Working capital: receivable days
- Tax: macro/tax rate assumptions

## Implemented Statistics

- Per-metric count, valid/invalid count, mean, median, standard deviation, min/max, P1/P5/P10/P25/P50/P75/P90/P95/P99, standard error, 95% confidence interval, skewness, and kurtosis.
- Probability of NPV above threshold, IRR above hurdle, DSCR breach, cash crunch, and bankability failure.
- VaR/CVaR at 95% and 99%, downside deviation, histogram, CDF, scatter, and contribution ranking.
