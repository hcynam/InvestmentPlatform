# Workbook Parity and Formula Lineage Contract

## Canonical reference
Default canonical workbook: `edition19_4June.xlsx`.

The workbook is not currently stored in the tracked repository or attached Codex kit. Confirm the actual repository or attached-file path before use. If multiple copies exist, compare filename, modified date, size, and preferably SHA-256; do not choose by folder name alone.

## Workbook role
The workbook is:
- a structural reference for modules and dependencies;
- a numerical reference for representative scenarios;
- formula evidence for intended behavior;
- not an infallible specification.

## Minimum mapping record
For a changed or disputed calculation, map:

| Field | Example |
|---|---|
| Workbook version | filename + hash/date |
| Sheet | `EconomicAnalysis18` |
| Cell/range | exact address or named range |
| Workbook label | visible business label |
| Workbook formula/rule | normalized formula, not only raw Excel syntax |
| Web field | typed input/result path |
| Web owner | function/module |
| Unit | IRR %, rial, toman, million/billion rial, physical unit |
| Price basis | nominal/current or real/constant |
| Currency basis | base/transaction and FX rate type |
| Timing | construction month, operating year, year 0, end/mid-period |
| Scenario | base/upside/downside/custom |
| Status | aligned / intentional difference / workbook defect / web defect |

## Parity comparison order
Before comparing outputs, align:
1. project dates and number of construction/operation periods;
2. scenario and all active overrides;
3. currency and unit scale;
4. nominal versus real price basis;
5. inflation and FX conventions;
6. tax and financing assumptions;
7. cash-flow timing convention;
8. residual value and working-capital release;
9. precision before display rounding.

## Tolerance
Use a tolerance appropriate to the value:
- exact match for categories, flags, dates, period counts, and integer schedules;
- absolute plus relative tolerance for financial amounts;
- basis-point tolerance for rates;
- compare unrounded values first and separately classify display differences.

Do not invent a universal tolerance. State it for the specific check.

## Error classification
A difference is not automatically a defect. Classify it as one of:
- missing/incorrect source mapping;
- formula difference;
- sign convention;
- unit scaling;
- currency/rate type;
- nominal/real basis;
- timing convention;
- scenario resolution;
- rounding/display;
- stale version;
- workbook defect;
- web defect;
- intentional product improvement.

## Correcting the workbook logic in web
A workbook deviation is allowed when the current formula is demonstrably wrong, internally inconsistent, incompatible with the stated methodology, or unsafe for the product.

Required note, kept concise:
- workbook sheet/cell or rule;
- defect;
- corrected rule;
- reason;
- affected outputs;
- targeted evidence.

Do not maintain a second compatibility formula unless backward compatibility is an explicit product requirement.

## Economic Analysis reference signals
`EconomicAnalysis18` includes concepts such as:
- EOCK;
- SCF;
- SWRF;
- SERF;
- bridge from financial to economic values;
- removal of indirect taxes/transfer payments;
- shadow-price adjustments for energy, labor, FX, land, CAPEX, COGS, and OPEX;
- economic benefits/externalities;
- ENPV, EIRR, economic payback, and EBCR;
- annual economic cash flow.

These labels establish intended coverage, not automatic correctness of every formula or coefficient.

## Verification packet
For ordinary implementation, the final evidence should fit in a few lines:
- scenario used;
- inputs aligned;
- outputs checked;
- tolerance;
- result;
- any intentional difference.

Create a full parity report only when explicitly requested.
