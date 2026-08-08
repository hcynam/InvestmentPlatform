import type {
  DirectCostAssumptions,
  OpexAssumptions,
  Project,
  ProjectSetup,
  Scenario,
  ValidationIssue,
} from "@/lib/types";

export const hasProjectSetupConfiguration = (setup: ProjectSetup) =>
  Boolean(setup.mainIndustry.trim() || setup.legalPersonality);

export const hasDirectCostsConfiguration = (directCosts: DirectCostAssumptions) =>
  Boolean(
    directCosts.mainRawMaterialName.trim() || directCosts.mainRawMaterialRialPrice !== 0 ||
    directCosts.mainRawMaterialFxPrice !== 0 || directCosts.items.length || directCosts.directEnergyCost !== 0 ||
    directCosts.directLaborCost !== 0 || directCosts.avoidableWasteCost !== 0,
  );

export const hasOpexConfiguration = (opex: OpexAssumptions) =>
  Boolean(opex.items.length || opex.sharedCostAllocationPercent !== 0 || opex.scenarioAdjustmentRate !== 0);

export const visibleProjectValidationIssues = (
  project: Project,
  scenario: Scenario,
  issues: ValidationIssue[],
  firstYearRevenue: number,
) => {
  const setupConfigured = hasProjectSetupConfiguration(project.setup);
  const directCostsConfigured = hasDirectCostsConfiguration(scenario.assumptions.directCosts);
  const opexConfigured = hasOpexConfiguration(scenario.assumptions.opex);

  return issues.filter((issue) => {
    if (issue.module === "setup" && !setupConfigured) return false;
    if (issue.module === "direct-costs" && !directCostsConfigured) return false;
    if (issue.module === "opex" && !opexConfigured) return false;
    if (issue.id === "phase2.opex.high-ratio" && firstYearRevenue <= 0) return false;
    return true;
  });
};
