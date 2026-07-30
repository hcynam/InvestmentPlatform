# Iran-Specific Source and Assumption Governance

## Principle
Iranian legal, regulatory, banking, labor, tax, customs, subsidy, regulated-price, inflation, and FX parameters change over time. Store them as governed model data, not permanent constants in code, AGENTS.md, or SKILL.md.

## Required metadata
Every externally sourced or policy-dependent assumption should support:
- `value`;
- `unit` and scale;
- `currency` where relevant;
- `effective_date`;
- `publication_date` if available;
- `source_title`;
- `source_organization`;
- `source_url` or document identifier;
- `source_version` / circular / article / table reference;
- `geography`;
- `industry_or_eligibility_scope`;
- `scenario`;
- `entered_by` or provenance type;
- `last_verified_at`;
- `confidence` or source-quality status;
- optional `expiry_or_review_date`;
- optional `user_override_reason`.

## Source hierarchy
Use the most authoritative and directly applicable source available:
1. enacted law, official regulation, cabinet resolution, or official gazette text;
2. current official instruction/circular from the responsible authority;
3. current official dataset or rate publication;
4. contractual offer or term sheet for project-specific financing/pricing;
5. recognized industry or market source;
6. documented analyst assumption;
7. user-entered assumption with explicit warning.

Examples of relevant authorities may include the official gazette and legislative sources, tax administration, central bank, statistical center, customs, social-security organization, labor ministry, planning and budget authorities, sector regulators, and lending institutions. Choose the authority that actually governs the parameter.

## No silent defaults
- Do not fabricate a current rate because a source is unavailable.
- Do not reuse a previous-year rate without showing that it is stale.
- Do not infer rial versus toman from number size.
- Do not treat an unofficial news summary as equivalent to the underlying law or circular.
- Do not apply a nationwide rule when the benefit depends on region, sector, project size, ownership, export status, or eligibility.

When a current authoritative value cannot be verified, use one of:
- required user input;
- scenario assumption;
- provisional default clearly labeled with date and confidence;
- unresolved validation state.

## Tax and statutory items
Model separately where relevant:
- corporate income tax;
- VAT and recoverability;
- withholding taxes;
- payroll/social-insurance contributions;
- customs duties and import charges;
- sector-specific taxes/levies;
- exemptions, holidays, credits, and eligibility conditions;
- loss carryforward rules;
- penalties only when a modeled risk scenario requires them.

Do not combine them into one universal “tax rate.”

## FX governance
Store:
- currency pair;
- official/regulated/market/contractual rate type;
- observation or effective date;
- path generation method;
- relationship with domestic/foreign inflation;
- conversion timing;
- scenario and source.

Financial FX assumptions and economic shadow FX factors are distinct concepts and must not share a field merely because both affect currency conversion.

## Inflation and price basis
Record:
- index/source;
- base period;
- general versus category-specific inflation;
- domestic versus foreign inflation;
- forecast method;
- nominal or real output basis;
- escalation start and timing convention.

## Financing and bankability
Project-specific loan assumptions should preferably come from a dated lender term sheet or documented financing scenario, including:
- currency;
- interest/profit rate basis;
- fees;
- grace period;
- amortization;
- collateral or reserve requirements;
- indexation/repricing;
- validity date;
- eligibility conditions.

Do not present a generic banking rate as a guaranteed financing offer.

## Freshness and validation
Recommended statuses:
- `verified-current`;
- `verified-historical`;
- `provisional`;
- `user-assumption`;
- `stale-review-required`;
- `unverified`.

A material decision output should warn when it depends on stale or unverified policy data.

## User overrides
Allow overrides where product design permits, but retain:
- original sourced value;
- override value;
- reason;
- author/time;
- scenario scope;
- affected outputs.

Never overwrite the sourced baseline silently.

## Web research rule for Codex
When the task requires a current Iranian legal, tax, banking, labor, customs, regulated-price, or FX fact:
- search current authoritative sources;
- prefer primary sources;
- capture effective date and scope;
- do not copy a rate into permanent code;
- implement it as versioned data or an assumption with metadata;
- state uncertainty when the primary text is unavailable or ambiguous.
