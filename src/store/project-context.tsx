"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { calculateMonteCarlo, calculateMonteCarloAsync, calculateScenario, calculateScenarioCore } from "@/lib/calculations";
import { buildConstructionCashFlowTable } from "@/lib/construction-cashflow-engine";
import { normalizeEconomicAssumptions } from "@/lib/economic-analysis-engine";
import { validateFinancingAssumptions } from "@/lib/financing-engine";
import type { MonteCarloAsyncOptions } from "@/lib/monte-carlo-engine";
import {
  synchronizeIndustryTemplate,
  synchronizeMacroAssumptions,
  synchronizeMarketDemand,
  validateMarketDemand,
} from "@/lib/phase-one-calculations";
import {
  calculateAnnualCapexSchedule,
  calculateCapacityProduction,
  calculateCapexSummary,
  calculateDirectUnitCost,
  calculateOperationStartDate,
  calculateOpexSchedule,
  normalizeCapacityAssumptions,
} from "@/lib/phase-two-calculations";
import { normalizeProductUnit, resolveMarketProductUnit } from "@/lib/product-unit";
import { saveProject } from "@/lib/project-storage";
import {
  calculateScenarioAdjustedAssumptions,
  defaultScenarioAdjustments,
  scenarioAdjustmentsEqual,
  scenarioAdjustmentsForClone,
  validateScenarioAdjustments,
} from "@/lib/scenario-engine";
import { synchronizeTaxAssumptionsFromMacro } from "@/lib/tax-capex-engine";
import { validateWorkingCapitalAssumptions } from "@/lib/working-capital-engine";
import type {
  CapexAssumptions,
  CapacityAssumptions,
  ConstructionAssumptions,
  DirectCostAssumptions,
  EconomicAssumptions,
  FinancingAssumptions,
  FormulaTrace,
  IndustryTemplate,
  MacroAssumptions,
  MarketDemandAssumptions,
  MonteCarloAssumptions,
  OpexAssumptions,
  Project,
  ProjectSetup,
  Scenario,
  ScenarioAdjustments,
  ScenarioOutputs,
  SensitivityAssumptions,
  WorkingCapitalAssumptions,
} from "@/lib/types";

type Mode = "basic" | "advanced";

type ProjectContextValue = {
  project: Project;
  activeScenario: Scenario;
  outputs: ScenarioOutputs;
  mode: Mode;
  dirty: boolean;
  selectedTrace: FormulaTrace | null;
  setMode: (mode: Mode) => void;
  setDirtyState: (dirty: boolean) => void;
  updateInput: (path: string, value: unknown) => void;
  runCalculation: () => void;
  runMonteCarlo: (settings?: MonteCarloAssumptions) => void;
  runMonteCarloAsync: (settings?: MonteCarloAssumptions, options?: MonteCarloAsyncOptions) => Promise<boolean>;
  applyMonteCarloSettings: (settings: MonteCarloAssumptions) => void;
  applySensitivitySettings: (settings: SensitivityAssumptions) => void;
  applyProjectSetup: (setup: ProjectSetup) => void;
  applyMacroAssumptions: (macro: MacroAssumptions) => void;
  applyIndustryTemplate: (industry: IndustryTemplate) => void;
  applyMarketDemand: (market: MarketDemandAssumptions) => void;
  applyCapacityAssumptions: (capacity: CapacityAssumptions) => void;
  applyDirectCostAssumptions: (directCosts: DirectCostAssumptions) => void;
  applyOpexAssumptions: (opex: OpexAssumptions) => void;
  applyCapexAssumptions: (capex: CapexAssumptions) => void;
  applyWorkingCapitalAssumptions: (workingCapital: WorkingCapitalAssumptions) => void;
  applyFinancingAssumptions: (financing: FinancingAssumptions) => void;
  applyConstructionAssumptions: (construction: ConstructionAssumptions) => void;
  applyEconomicAssumptions: (economic: EconomicAssumptions) => void;
  selectScenario: (scenarioId: string) => void;
  addScenario: (name?: string) => void;
  duplicateScenario: (scenarioId: string) => void;
  updateScenario: (scenarioId: string, patch: Partial<Pick<Scenario, "name" | "description" | "type" | "isLocked" | "code" | "status">>) => void;
  applyScenarioAdjustments: (scenarioId: string, adjustments: ScenarioAdjustments) => void;
  deleteScenario: (scenarioId: string) => void;
  calculateScenarioOnDemand: (scenarioId: string) => { scenario: Scenario; outputs: ScenarioOutputs } | null;
  setScenarioDraftState: (scenarioId: string, state: "stale" | "invalid" | null) => void;
  selectTrace: (traceId: string | null) => void;
  getValue: (path: string) => unknown;
};

const ProjectContext = createContext<ProjectContextValue | null>(null);

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const getByPath = (root: unknown, path: string): unknown => {
  if (!path) return undefined;
  if (path === "traces.length" && typeof root === "object" && root && "outputs" in root) {
    return (root as { outputs: ScenarioOutputs }).outputs.traces.length;
  }
  return path.split(".").reduce<unknown>((current, key) => {
    if (current === null || current === undefined) return undefined;
    if (Array.isArray(current)) return current[Number(key)];
    return (current as Record<string, unknown>)[key];
  }, root);
};

const setByPath = (root: Record<string, unknown> | unknown[], path: string[], value: unknown) => {
  const [head, ...tail] = path;
  if (!head) return;
  if (tail.length === 0) {
    if (Array.isArray(root)) root[Number(head)] = value;
    else root[head] = value;
    return;
  }
  const next = Array.isArray(root) ? root[Number(head)] : root[head];
  if (next && typeof next === "object") setByPath(next as Record<string, unknown> | unknown[], tail, value);
};

const activeScenarioOf = (project: Project) =>
  project.scenarios.find((scenario) => scenario.id === project.activeScenarioId) ?? project.scenarios[0];

const baseScenarioOf = (project: Project) =>
  project.scenarios.find((scenario) => scenario.type === "base") ?? project.scenarios[0];

const normalizeScenarioAssumptions = (assumptions: Scenario["assumptions"]): Scenario["assumptions"] => {
  const legacyProductUnit = assumptions.industry.productUnit === "سفارشی"
    ? assumptions.industry.customProductUnit
    : assumptions.industry.productUnit;
  const persistedMarket = {
    ...assumptions.market,
    customMarketAnalysisUnit: assumptions.market.customMarketAnalysisUnit ?? "",
    inputPresence: assumptions.market.inputPresence ?? {},
    potentialSalesYear2: assumptions.market.potentialSalesYear2 ?? null,
    potentialSalesYear3: assumptions.market.potentialSalesYear3 ?? null,
  };
  const canonicalProductUnit = resolveMarketProductUnit(persistedMarket)
    || normalizeProductUnit(assumptions.capacity.unit)
    || normalizeProductUnit(legacyProductUnit);
  const persistedWorkingCapital = assumptions.workingCapital;
  const workingCapital = {
    ...persistedWorkingCapital,
    receivableDays: Number.isFinite(persistedWorkingCapital.receivableDays)
      ? persistedWorkingCapital.receivableDays
      : assumptions.industry.receivablesDays,
    payableDays: Number.isFinite(persistedWorkingCapital.payableDays)
      ? persistedWorkingCapital.payableDays
      : assumptions.industry.payablesDays,
    accruedExpenseDays: persistedWorkingCapital.accruedExpenseDays ?? 0,
    otherCurrentLiabilitiesPercentOfRevenue: persistedWorkingCapital.otherCurrentLiabilitiesPercentOfRevenue ?? 0,
  };
  return {
    ...assumptions,
    industry: {
      ...assumptions.industry,
      receivablesDays: workingCapital.receivableDays,
      payablesDays: workingCapital.payableDays,
      selectedProductivityKpiIds: assumptions.industry.selectedProductivityKpiIds ?? [
        "operational-capacity-utilization",
        "operational-waste-rate",
        "operational-efficiency",
      ],
    },
    market: {
      ...persistedMarket,
      marketAnalysisUnit: persistedMarket.marketAnalysisUnit || canonicalProductUnit,
      unit: canonicalProductUnit,
    },
    capacity: normalizeCapacityAssumptions({ ...assumptions.capacity, unit: canonicalProductUnit }),
    workingCapital,
    economic: normalizeEconomicAssumptions(assumptions.economic),
  };
};

export const deriveScenarioForCalculation = (project: Project, source: Scenario): Scenario => {
  const scenario = clone(source);
  if (scenario.type === "base") return scenario;
  scenario.assumptions = calculateScenarioAdjustedAssumptions(baseScenarioOf(project).assumptions, scenario.adjustments);
  scenario.assumptions.macro.activeScenarioId = scenario.id;
  return scenario;
};

export const calculateProjectScenarioOnDemand = (project: Project, scenarioId: string) => {
  const source = project.scenarios.find((scenario) => scenario.id === scenarioId);
  if (!source) return null;
  if (source.type !== "base" && validateScenarioAdjustments(baseScenarioOf(project).assumptions, source.adjustments).length) return null;
  const scenario = deriveScenarioForCalculation(project, source);
  return { scenario, outputs: calculateScenarioCore(project, scenario) };
};

export const invalidateScenarioOutputsForBaseChange = (project: Project) => {
  const base = baseScenarioOf(project);
  project.scenarios.forEach((scenario) => {
    if (scenario.id === base.id) return;
    scenario.outputs = undefined;
    scenario.calculatedAt = undefined;
    scenario.calculatedBaseVersion = undefined;
    scenario.calculatedAdjustmentVersion = undefined;
    const errors = validateScenarioAdjustments(base.assumptions, scenario.adjustments);
    scenario.calculationState = errors.length ? "invalid" : "stale";
    if (!errors.length) scenario.assumptions = calculateScenarioAdjustedAssumptions(base.assumptions, scenario.adjustments);
  });
};

export const normalizePersistedProject = (value: Project): Project => {
  const next = clone(value);
  const persistedScenarios = next.scenarios as Array<Scenario & { assumptions?: Scenario["assumptions"] }>;
  const persistedBase = persistedScenarios.find((scenario) => scenario.type === "base")
    ?? persistedScenarios.find((scenario) => scenario.assumptions);
  if (!persistedBase?.assumptions) return next;
  persistedBase.assumptions = normalizeScenarioAssumptions(persistedBase.assumptions);
  next.scenarios = next.scenarios.map((scenario) => {
    const adjustments = scenario.adjustments ?? defaultScenarioAdjustments(scenario.type);
    const isBase = scenario.id === persistedBase.id;
    const adjustmentErrors = isBase ? [] : validateScenarioAdjustments(persistedBase.assumptions!, adjustments);
    const assumptions = isBase
      ? persistedBase.assumptions!
      : adjustmentErrors.length
        ? clone(persistedBase.assumptions!)
        : calculateScenarioAdjustedAssumptions(persistedBase.assumptions!, adjustments);
    return {
      ...scenario,
      type: isBase ? "base" as const : "custom" as const,
      isDefault: isBase,
      isLocked: isBase,
      adjustments,
      assumptions,
      outputs: undefined,
      calculationState: adjustmentErrors.length ? "invalid" as const : "uncalculated" as const,
      calculatedAt: undefined,
      calculatedBaseVersion: undefined,
      calculatedAdjustmentVersion: undefined,
    };
  });
  return next;
};

const projectForStorage = (project: Project) => {
  const next = clone(project);
  next.scenarios.forEach((scenario) => {
    scenario.outputs = undefined;
    scenario.calculatedAt = undefined;
    scenario.calculatedBaseVersion = undefined;
    scenario.calculatedAdjustmentVersion = undefined;
    if (scenario.type !== "base") delete (scenario as unknown as { assumptions?: Scenario["assumptions"] }).assumptions;
  });
  return next;
};

const calculateScenarioAndUpdate = (project: Project, scenarioId: string): ScenarioOutputs | null => {
  const stored = project.scenarios.find((scenario) => scenario.id === scenarioId);
  if (!stored) return null;
  if (stored.type !== "base") {
    const errors = validateScenarioAdjustments(baseScenarioOf(project).assumptions, stored.adjustments);
    if (errors.length) {
      stored.outputs = undefined;
      stored.calculationState = "invalid";
      return null;
    }
  }
  try {
    stored.calculationState = "calculating";
    const scenario = deriveScenarioForCalculation(project, stored);
    const outputs = calculateScenario(project, scenario);
    stored.assumptions = scenario.assumptions;
    stored.outputs = outputs;
    stored.calculationState = "calculated";
    stored.calculatedAt = outputs.generatedAt;
    stored.calculatedBaseVersion = baseScenarioOf(project).version;
    stored.calculatedAdjustmentVersion = stored.version;
    return outputs;
  } catch {
    stored.outputs = undefined;
    stored.calculationState = "failed";
    return null;
  }
};

export function ProjectProvider({ children, initialProject }: { children: React.ReactNode; initialProject: Project }) {
  const [project, setProject] = useState<Project>(() => {
    const next = clone(initialProject);
    const scenario = activeScenarioOf(next);
    calculateScenarioAndUpdate(next, scenario.id);
    return next;
  });
  const [outputs, setOutputs] = useState<ScenarioOutputs>(() => {
    const next = clone(initialProject);
    const scenario = activeScenarioOf(next);
    return calculateScenarioAndUpdate(next, scenario.id) ?? calculateScenario(next, baseScenarioOf(next));
  });
  const [mode, setMode] = useState<Mode>("basic");
  const [dirty, setDirty] = useState(false);
  const [selectedTrace, setSelectedTrace] = useState<FormulaTrace | null>(null);

  const activeScenario = useMemo(() => activeScenarioOf(project), [project]);

  useEffect(() => {
    try {
      saveProject(window.localStorage, projectForStorage(project));
    } catch {
      // Storage can be disabled by browser policy; the in-memory model remains usable.
    }
  }, [project]);

  const activateScenario = useCallback((next: Project, scenarioId: string) => {
    const requested = next.scenarios.find((item) => item.id === scenarioId);
    const scenario = requested?.status === "inactive" ? baseScenarioOf(next) : requested ?? baseScenarioOf(next);
    const adjustmentErrors = scenario.type === "base" ? [] : validateScenarioAdjustments(baseScenarioOf(next).assumptions, scenario.adjustments);
    if (scenario.type !== "base" && !adjustmentErrors.length) scenario.assumptions = calculateScenarioAdjustedAssumptions(baseScenarioOf(next).assumptions, scenario.adjustments);
    scenario.assumptions.macro.activeScenarioId = scenario.id;
    next.activeScenarioId = scenario.id;
    next.scenarios.forEach((item) => {
      item.isActive = item.id === scenario.id;
    });
    if (adjustmentErrors.length) {
      scenario.calculationState = "invalid";
      const base = baseScenarioOf(next);
      const baseOutputs = base.outputs ?? calculateScenarioAndUpdate(next, base.id);
      if (baseOutputs) setOutputs(baseOutputs);
      setDirty(true);
      return;
    }
    const nextOutputs = scenario.outputs ?? calculateScenarioAndUpdate(next, scenario.id);
    if (nextOutputs) setOutputs(nextOutputs);
    setDirty(false);
  }, []);

  const completeBaseUpdate = useCallback((next: Project, timestamp: string) => {
    const base = baseScenarioOf(next);
    base.updatedAt = timestamp;
    base.version += 1;
    next.updatedAt = timestamp;
    calculateScenarioAndUpdate(next, base.id);
    invalidateScenarioOutputsForBaseChange(next);
    const active = activeScenarioOf(next);
    const nextOutputs = calculateScenarioAndUpdate(next, active.id) ?? base.outputs;
    if (nextOutputs) setOutputs(nextOutputs);
    setDirty(false);
  }, []);

  const runCalculation = useCallback(() => {
    setProject((current) => {
      const next = clone(current);
      const scenario = activeScenarioOf(next);
      next.updatedAt = new Date().toISOString();
      scenario.updatedAt = next.updatedAt;
      const base = baseScenarioOf(next);
      if (!base.outputs || base.calculationState === "stale") calculateScenarioAndUpdate(next, base.id);
      const nextOutputs = calculateScenarioAndUpdate(next, scenario.id);
      if (nextOutputs) setOutputs(nextOutputs);
      setDirty(false);
      return next;
    });
  }, []);

  const runMonteCarlo = useCallback((settings?: MonteCarloAssumptions) => {
    setProject((current) => {
      const next = clone(current);
      const scenario = activeScenarioOf(next);
      next.updatedAt = new Date().toISOString();
      scenario.updatedAt = next.updatedAt;
      if (settings) scenario.assumptions.monteCarlo = clone(settings);
      const monteCarlo = calculateMonteCarlo(next, scenario);
      const nextOutputs: ScenarioOutputs = { ...(scenario.outputs ?? calculateScenario(next, scenario)), monteCarlo };
      scenario.outputs = nextOutputs;
      setOutputs(nextOutputs);
      setDirty(false);
      return next;
    });
  }, []);

  const runMonteCarloAsync = useCallback(async (settings?: MonteCarloAssumptions, options?: MonteCarloAsyncOptions) => {
    const source = clone(project);
    const sourceScenario = activeScenarioOf(source);
    if (settings) sourceScenario.assumptions.monteCarlo = clone(settings);
    const monteCarlo = await calculateMonteCarloAsync(source, sourceScenario, options);
    if (!monteCarlo || options?.signal?.aborted) return false;

    setProject((current) => {
      const next = clone(current);
      const scenario = activeScenarioOf(next);
      const timestamp = new Date().toISOString();
      next.updatedAt = timestamp;
      scenario.updatedAt = timestamp;
      if (settings) scenario.assumptions.monteCarlo = clone(settings);
      const nextOutputs: ScenarioOutputs = { ...(scenario.outputs ?? calculateScenario(next, scenario)), monteCarlo };
      scenario.outputs = nextOutputs;
      setOutputs(nextOutputs);
      setDirty(false);
      return next;
    });
    return true;
  }, [project]);

  const applyMonteCarloSettings = useCallback((settings: MonteCarloAssumptions) => {
    setProject((current) => {
      const next = clone(current);
      const scenario = baseScenarioOf(next);
      const timestamp = new Date().toISOString();
      scenario.assumptions.monteCarlo = clone(settings);
      completeBaseUpdate(next, timestamp);
      return next;
    });
  }, [completeBaseUpdate]);

  const applySensitivitySettings = useCallback((settings: SensitivityAssumptions) => {
    setProject((current) => {
      const next = clone(current);
      const scenario = baseScenarioOf(next);
      const timestamp = new Date().toISOString();
      scenario.assumptions.sensitivity = clone(settings);
      completeBaseUpdate(next, timestamp);
      return next;
    });
  }, [completeBaseUpdate]);

  const applyProjectSetup = useCallback((setup: ProjectSetup) => {
    setProject((current) => {
      const next = clone(current);
      const operationStartDate = calculateOperationStartDate(setup).values.operationStartDate;
      const normalizedSetup = { ...setup, operationStartDate };
      const selectedScenario =
        next.scenarios.find((item) => item.id === setup.activeScenarioId) ?? activeScenarioOf(next);
      next.activeScenarioId = selectedScenario.id;
      next.scenarios.forEach((item) => {
        item.isActive = item.id === selectedScenario.id;
      });
      const scenario = baseScenarioOf(next);
      const timestamp = new Date().toISOString();
      next.setup = clone(normalizedSetup);
      next.name = normalizedSetup.projectName;
      next.code = normalizedSetup.projectCode;
      next.companyName = normalizedSetup.clientName;
      next.industry = normalizedSetup.mainIndustry;
      next.subIndustry = normalizedSetup.subIndustry;
      next.projectType = normalizedSetup.projectType;
      next.province = normalizedSetup.province;
      next.city = normalizedSetup.city;
      next.legalEntityType = normalizedSetup.legalPersonality;
      next.preparedBy = normalizedSetup.preparedBy;
      next.reviewedBy = normalizedSetup.reviewedBy;
      next.approvedBy = normalizedSetup.approvedBy;
      next.baseYear = normalizedSetup.baseYear;
      next.constructionStartDate = normalizedSetup.constructionStartDate;
      next.operationStartDate = normalizedSetup.operationStartDate;
      next.constructionDurationMonths = normalizedSetup.constructionDurationMonths;
      next.modelHorizonYears = normalizedSetup.analysisHorizonYears;
      next.currency = normalizedSetup.baseCurrency;
      next.displayUnit = normalizedSetup.displayUnit;
      scenario.assumptions.macro = synchronizeMacroAssumptions({
        ...scenario.assumptions.macro,
        baseYear: normalizedSetup.baseYear,
        analysisHorizon: normalizedSetup.analysisHorizonYears,
        fiscalYearEnd: normalizedSetup.fiscalYearEnd,
        baseCurrency: normalizedSetup.baseCurrency,
        calculationBasis: normalizedSetup.calculationBasis,
        activeScenarioId: selectedScenario.id,
      });
      scenario.assumptions.industry = synchronizeIndustryTemplate(scenario.assumptions.industry, normalizedSetup);
      if (!scenario.assumptions.capacity.trialProductionStartDate) {
        scenario.assumptions.capacity.trialProductionStartDate = operationStartDate;
      }
      completeBaseUpdate(next, timestamp);
      return next;
    });
  }, [completeBaseUpdate]);

  const applyMacroAssumptions = useCallback((macro: MacroAssumptions) => {
    setProject((current) => {
      const next = clone(current);
      const scenario = baseScenarioOf(next);
      const timestamp = new Date().toISOString();
      const synchronized = synchronizeMacroAssumptions(macro);
      scenario.assumptions.macro = synchronized;
      scenario.assumptions.tax = synchronizeTaxAssumptionsFromMacro(scenario.assumptions.tax, synchronized);
      completeBaseUpdate(next, timestamp);
      return next;
    });
  }, [completeBaseUpdate]);

  const applyIndustryTemplate = useCallback((industry: IndustryTemplate) => {
    setProject((current) => {
      const next = clone(current);
      const scenario = baseScenarioOf(next);
      const timestamp = new Date().toISOString();
      const capacity = scenario.assumptions.capacity;
      const workingCapital = scenario.assumptions.workingCapital;
      const synchronized = synchronizeIndustryTemplate({
        ...industry,
        productUnit: capacity.unit,
        customProductUnit: "",
        nominalCapacity: capacity.nominalCapacity,
        utilizationRate: capacity.firstYearUtilizationRate,
        firstYearUtilization: capacity.firstYearUtilizationRate,
        stableUtilization: capacity.stableYearUtilizationRate,
        wasteRate: capacity.wasteRate,
        efficiency: capacity.productionEfficiency,
        receivablesDays: workingCapital.receivableDays,
        payablesDays: workingCapital.payableDays,
      }, next.setup);
      scenario.assumptions.industry = synchronized;
      completeBaseUpdate(next, timestamp);
      return next;
    });
  }, [completeBaseUpdate]);

  const applyCapacityAssumptions = useCallback((capacity: CapacityAssumptions) => {
    setProject((current) => {
      const next = clone(current);
      const scenario = baseScenarioOf(next);
      const timestamp = new Date().toISOString();
      const canonicalUnit = resolveMarketProductUnit(scenario.assumptions.market) || normalizeProductUnit(capacity.unit);
      const normalizedCapacity = normalizeCapacityAssumptions({ ...capacity, unit: canonicalUnit });
      const calculated = calculateCapacityProduction(normalizedCapacity, { requireComplete: true });
      if (calculated.errors.length > 0) return current;
      scenario.assumptions.capacity = {
        ...clone(normalizedCapacity),
        unit: canonicalUnit,
        utilizationYear1: capacity.firstYearUtilizationRate,
        utilizationYear2: capacity.secondYearUtilizationRate,
        utilizationStable: capacity.stableYearUtilizationRate,
        yieldRate: capacity.productionEfficiency,
        bottleneckCapacityPerHour: capacity.bottleneckHourlyCapacity,
        energyLimit: capacity.energyAvailableQuantity,
        energyPerUnit: capacity.energyConsumptionPerUnit,
        materialLimit: calculated.values.rawMaterialConstrainedCapacity ?? 0,
        rampUpMonths: capacity.rampUpDurationMonths,
        outputs: calculated.values,
      };
      scenario.assumptions.industry = {
        ...scenario.assumptions.industry,
        productUnit: canonicalUnit,
        customProductUnit: "",
        nominalCapacity: capacity.nominalCapacity,
        utilizationRate: capacity.firstYearUtilizationRate,
        firstYearUtilization: capacity.firstYearUtilizationRate,
        stableUtilization: capacity.stableYearUtilizationRate,
        wasteRate: capacity.wasteRate,
        efficiency: capacity.productionEfficiency,
      };
      scenario.assumptions.market = synchronizeMarketDemand({
        ...scenario.assumptions.market,
        unit: canonicalUnit,
        hasSupplyConstraint: true,
        supplyConstraintValue: calculated.values.netSellableProduction,
      }, { supplyLimit: calculated.values.netSellableProduction });
      completeBaseUpdate(next, timestamp);
      return next;
    });
  }, [completeBaseUpdate]);

  const applyDirectCostAssumptions = useCallback((directCosts: DirectCostAssumptions) => {
    setProject((current) => {
      const next = clone(current);
      const scenario = baseScenarioOf(next);
      const timestamp = new Date().toISOString();
      const calculated = calculateDirectUnitCost(
        directCosts,
        scenario.assumptions.macro,
        scenario.assumptions.market.baseSalesPrice,
      );
      scenario.assumptions.directCosts = {
        ...clone(directCosts),
        rawMaterialFxUnitCost: directCosts.mainRawMaterialFxPrice,
        rawMaterialRialUnitCost: directCosts.mainRawMaterialRialPrice,
        rawMaterialFxShare: directCosts.mainRawMaterialFxShare,
        rawMaterialRialGrowth: directCosts.rialRawMaterialGrowthRate,
        rawMaterialFxGrowth: directCosts.fxRawMaterialGrowthRate,
        wageGrowth: directCosts.directLaborGrowthFactor,
        energyGrowth: directCosts.energyTariffGrowthRate,
        scaleSavingRate: directCosts.economiesOfScaleSavingPercent,
        outputs: {
          ...calculated.values,
          totalDirectProductionCostBaseYear:
            calculated.values.baseYearUnitDirectCost *
            (scenario.assumptions.capacity.outputs?.netSellableProduction ?? 0),
          cogs:
            calculated.values.baseYearUnitDirectCost *
            (scenario.assumptions.capacity.outputs?.netSellableProduction ?? 0),
        },
      };
      completeBaseUpdate(next, timestamp);
      return next;
    });
  }, [completeBaseUpdate]);

  const applyOpexAssumptions = useCallback((opex: OpexAssumptions) => {
    setProject((current) => {
      const next = clone(current);
      const scenario = baseScenarioOf(next);
      const timestamp = new Date().toISOString();
      const revenues = scenario.outputs?.revenue.rows.map((row) => row.revenue) ?? [0, scenario.assumptions.market.potentialRevenue];
      const production = scenario.outputs?.capacity.rows.map((row) => row.productionVolume) ?? [0, scenario.assumptions.capacity.outputs?.netSellableProduction ?? 0];
      const calculated = calculateOpexSchedule(opex, revenues, production, scenario.assumptions.macro);
      scenario.assumptions.opex = {
        ...clone(opex),
        allocationToProductionRate: opex.sharedCostAllocationPercent,
        outputs: calculated.values.outputs,
      };
      completeBaseUpdate(next, timestamp);
      return next;
    });
  }, [completeBaseUpdate]);

  const applyCapexAssumptions = useCallback((capex: CapexAssumptions) => {
    setProject((current) => {
      const next = clone(current);
      const scenario = baseScenarioOf(next);
      const timestamp = new Date().toISOString();
      const summary = calculateCapexSummary(capex.items, scenario.assumptions.macro);
      if (summary.errors.length > 0) return current;
      scenario.assumptions.capex = {
        ...clone(capex),
        summary: summary.values,
        annualSchedule: calculateAnnualCapexSchedule(
          capex,
          scenario.assumptions.macro,
          next.baseYear,
          next.modelHorizonYears,
        ),
      };
      completeBaseUpdate(next, timestamp);
      return next;
    });
  }, [completeBaseUpdate]);

  const applyWorkingCapitalAssumptions = useCallback((workingCapital: WorkingCapitalAssumptions) => {
    setProject((current) => {
      if (validateWorkingCapitalAssumptions(workingCapital).length > 0) return current;
      const next = clone(current);
      const scenario = baseScenarioOf(next);
      const timestamp = new Date().toISOString();
      scenario.assumptions.workingCapital = clone(workingCapital);
      scenario.assumptions.industry = {
        ...scenario.assumptions.industry,
        receivablesDays: workingCapital.receivableDays,
        payablesDays: workingCapital.payableDays,
      };
      completeBaseUpdate(next, timestamp);
      return next;
    });
  }, [completeBaseUpdate]);

  const applyFinancingAssumptions = useCallback((financing: FinancingAssumptions) => {
    setProject((current) => {
      if (validateFinancingAssumptions(financing, current.modelHorizonYears).length > 0) return current;
      const next = clone(current);
      const scenario = baseScenarioOf(next);
      const timestamp = new Date().toISOString();
      const activeInstruments = financing.instruments?.filter((instrument) => instrument.active) ?? [];
      const primaryInstrument = activeInstruments[0] ?? financing.instruments?.[0];
      const legacyDrawdown = (financing.drawdownRows ?? [])
        .filter((row) => !primaryInstrument || row.instrumentId === primaryInstrument.id)
        .reduce<Record<number, number>>((map, row) => {
          map[row.year] = (map[row.year] ?? 0) + row.amount;
          return map;
        }, {});
      scenario.assumptions.financing = {
        ...clone(financing),
        longTermDebt: activeInstruments.reduce((total, instrument) => total + instrument.amount, 0),
        interestRate: primaryInstrument?.type === "qardAlHasan"
          ? financing.interestRate
          : primaryInstrument?.annualRate ?? financing.interestRate,
        feeRate: primaryInstrument?.type === "qardAlHasan"
          ? primaryInstrument.annualRate
          : primaryInstrument?.feeRate ?? financing.feeRate,
        repaymentMethod: primaryInstrument?.repaymentMethod ?? financing.repaymentMethod,
        repaymentYears: Math.max(1, Math.round((primaryInstrument?.repaymentTermMonths ?? financing.repaymentYears * 12) / 12)),
        gracePeriodYears: Math.max(0, (primaryInstrument?.graceMonths ?? financing.gracePeriodYears * 12) / 12),
        drawdown: Object.keys(legacyDrawdown).length ? legacyDrawdown : financing.drawdown,
        collateral: primaryInstrument?.collateralText ?? financing.collateral,
        dividendPolicy: primaryInstrument?.dividendPolicy ?? financing.dividendPolicy,
        lenderCovenants: primaryInstrument?.covenantsText ?? financing.lenderCovenants,
      };
      completeBaseUpdate(next, timestamp);
      return next;
    });
  }, [completeBaseUpdate]);

  const applyConstructionAssumptions = useCallback((construction: ConstructionAssumptions) => {
    setProject((current) => {
      const next = clone(current);
      const scenario = baseScenarioOf(next);
      const canonicalOutputs = scenario.outputs ?? calculateScenario(next, scenario);
      const validation = buildConstructionCashFlowTable({
        project: next,
        assumptions: construction,
        macro: scenario.assumptions.macro,
        capex: canonicalOutputs.capex,
        financing: scenario.assumptions.financing,
        financingSchedule: canonicalOutputs.financing.schedule,
      });
      if (!validation.isValid) return current;
      const timestamp = new Date().toISOString();
      scenario.assumptions.construction = clone(construction);
      completeBaseUpdate(next, timestamp);
      return next;
    });
  }, [completeBaseUpdate]);

  const applyEconomicAssumptions = useCallback((economic: EconomicAssumptions) => {
    setProject((current) => {
      const next = clone(current);
      const scenario = baseScenarioOf(next);
      const timestamp = new Date().toISOString();
      scenario.assumptions.economic = normalizeEconomicAssumptions(clone(economic));
      completeBaseUpdate(next, timestamp);
      return next;
    });
  }, [completeBaseUpdate]);

  const applyMarketDemand = useCallback((market: MarketDemandAssumptions) => {
    setProject((current) => {
      const next = clone(current);
      const scenario = baseScenarioOf(next);
      const timestamp = new Date().toISOString();
      const validation = validateMarketDemand(market, {
        supplyLimit: market.hasSupplyConstraint ? market.supplyConstraintValue : undefined,
      });
      if (validation.errors.length > 0) return current;
      const synchronized = synchronizeMarketDemand(market, {
        supplyLimit: market.hasSupplyConstraint ? market.supplyConstraintValue : undefined,
      });
      scenario.assumptions.market = synchronized;
      const canonicalUnit = resolveMarketProductUnit(synchronized);
      scenario.assumptions.capacity = normalizeCapacityAssumptions({ ...scenario.assumptions.capacity, unit: canonicalUnit });
      scenario.assumptions.industry = { ...scenario.assumptions.industry, productUnit: canonicalUnit, customProductUnit: "" };
      completeBaseUpdate(next, timestamp);
      return next;
    });
  }, [completeBaseUpdate]);

  const selectScenario = useCallback((scenarioId: string) => {
    setProject((current) => {
      const next = clone(current);
      activateScenario(next, scenarioId);
      return next;
    });
  }, [activateScenario]);

  const addScenario = useCallback((name = "سناریوی جدید") => {
    setProject((current) => {
      const next = clone(current);
      const source = baseScenarioOf(next);
      const timestamp = new Date().toISOString();
      const id = `scenario-${Date.now()}`;
      const customCount = next.scenarios.filter((item) => item.type === "custom").length + 1;
      const scenario: Scenario = {
        ...clone(source),
        id,
        scenarioId: id,
        name,
        type: "custom",
        code: `C${String(customCount).padStart(2, "0")}`,
        priority: next.scenarios.length + 1,
        description: "سناریوی سفارشی بر پایه مفروضات جاری پروژه",
        adjustments: defaultScenarioAdjustments("custom"),
        assumptions: clone(source.assumptions),
        isActive: true,
        isLocked: false,
        isDefault: false,
        status: "active",
        version: 1,
        createdAt: timestamp,
        updatedAt: timestamp,
        outputs: undefined,
        calculationState: "uncalculated",
        calculatedAt: undefined,
        calculatedBaseVersion: undefined,
        calculatedAdjustmentVersion: undefined,
      };
      next.scenarios.push(scenario);
      next.updatedAt = timestamp;
      activateScenario(next, id);
      return next;
    });
  }, [activateScenario]);

  const duplicateScenario = useCallback((scenarioId: string) => {
    setProject((current) => {
      const next = clone(current);
      const source = next.scenarios.find((item) => item.id === scenarioId) ?? activeScenarioOf(next);
      const timestamp = new Date().toISOString();
      const id = `scenario-${Date.now()}`;
      const customCount = next.scenarios.filter((item) => item.type === "custom").length + 1;
      const adjustments = scenarioAdjustmentsForClone(source);
      const scenario: Scenario = {
        ...clone(source),
        id,
        scenarioId: id,
        name: `${source.name} - کپی`,
        type: "custom",
        code: `C${String(customCount).padStart(2, "0")}`,
        priority: next.scenarios.length + 1,
        adjustments,
        assumptions: calculateScenarioAdjustedAssumptions(baseScenarioOf(next).assumptions, adjustments),
        isActive: true,
        isLocked: false,
        isDefault: false,
        status: "active",
        version: 1,
        createdAt: timestamp,
        updatedAt: timestamp,
        outputs: undefined,
        calculationState: "uncalculated",
        calculatedAt: undefined,
        calculatedBaseVersion: undefined,
        calculatedAdjustmentVersion: undefined,
      };
      next.scenarios.push(scenario);
      next.updatedAt = timestamp;
      activateScenario(next, id);
      return next;
    });
  }, [activateScenario]);

  const updateScenario = useCallback((
    scenarioId: string,
    patch: Partial<Pick<Scenario, "name" | "description" | "type" | "isLocked" | "code" | "status">>,
  ) => {
    setProject((current) => {
      const next = clone(current);
      const scenario = next.scenarios.find((item) => item.id === scenarioId);
      if (!scenario) return current;
      if (patch.name !== undefined && !patch.name.trim()) return current;
      const requestedCode = patch.code?.trim();
      if (requestedCode !== undefined && next.scenarios.some((item) => item.id !== scenarioId && item.code === requestedCode)) return current;
      const sanitizedPatch = {
        ...patch,
        ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
        ...(patch.code !== undefined ? { code: patch.code.trim() } : {}),
      };
      Object.assign(scenario, sanitizedPatch);
      const timestamp = new Date().toISOString();
      scenario.updatedAt = timestamp;
      next.updatedAt = timestamp;
      if (scenario.id === next.activeScenarioId && scenario.status === "inactive") {
        activateScenario(next, baseScenarioOf(next).id);
      }
      return next;
    });
  }, [activateScenario]);

  const applyScenarioAdjustments = useCallback((scenarioId: string, adjustments: ScenarioAdjustments) => {
    setProject((current) => {
      const next = clone(current);
      const scenario = next.scenarios.find((item) => item.id === scenarioId);
      if (!scenario || scenario.type === "base") return current;
      const errors = validateScenarioAdjustments(baseScenarioOf(next).assumptions, adjustments);
      if (errors.length) {
        scenario.calculationState = "invalid";
        scenario.outputs = undefined;
        return next;
      }
      const unchanged = scenarioAdjustmentsEqual(scenario.adjustments, adjustments);
      const currentForBase = scenario.calculationState === "calculated"
        && scenario.calculatedBaseVersion === baseScenarioOf(next).version
        && scenario.calculatedAdjustmentVersion === scenario.version;
      if (unchanged && currentForBase) return current;
      const timestamp = new Date().toISOString();
      scenario.adjustments = clone(adjustments);
      scenario.assumptions = calculateScenarioAdjustedAssumptions(baseScenarioOf(next).assumptions, adjustments);
      scenario.assumptions.macro.activeScenarioId = scenario.id;
      if (!unchanged) scenario.version += 1;
      scenario.updatedAt = timestamp;
      next.updatedAt = timestamp;
      const nextOutputs = calculateScenarioAndUpdate(next, scenario.id);
      if (scenario.id === next.activeScenarioId) {
        if (nextOutputs) setOutputs(nextOutputs);
        setDirty(false);
      }
      return next;
    });
  }, []);

  const deleteScenario = useCallback((scenarioId: string) => {
    setProject((current) => {
      if (current.scenarios.length <= 1) return current;
      const next = clone(current);
      const target = next.scenarios.find((item) => item.id === scenarioId);
      if (!target || target.type === "base" || target.isDefault) return current;
      next.scenarios = next.scenarios.filter((item) => item.id !== scenarioId);
      next.updatedAt = new Date().toISOString();
      if (next.activeScenarioId === scenarioId) activateScenario(next, baseScenarioOf(next).id);
      return next;
    });
  }, [activateScenario]);

  const calculateScenarioOnDemand = useCallback(
    (scenarioId: string) => calculateProjectScenarioOnDemand(project, scenarioId),
    [project],
  );

  const setScenarioDraftState = useCallback((scenarioId: string, state: "stale" | "invalid" | null) => {
    setProject((current) => {
      const scenario = current.scenarios.find((item) => item.id === scenarioId);
      if (!scenario || scenario.type === "base") return current;
      const next = clone(current);
      const target = next.scenarios.find((item) => item.id === scenarioId)!;
      target.calculationState = state ?? (target.outputs ? "calculated" : "uncalculated");
      return next;
    });
  }, []);

  const updateInput = useCallback((path: string, value: unknown) => {
    setProject((current) => {
      const next = clone(current);
      const scenario = activeScenarioOf(next);
      const base = baseScenarioOf(next);
      const parts = path.split(".");
      if (parts[0] === "project") setByPath(next as unknown as Record<string, unknown>, parts.slice(1), value);
      if (parts[0] === "assumptions") {
        setByPath(base.assumptions as unknown as Record<string, unknown>, parts.slice(1), value);
        base.version += 1;
        base.outputs = undefined;
        base.calculationState = "stale";
        invalidateScenarioOutputsForBaseChange(next);
      }
      if (parts[0] === "scenario") setByPath(scenario as unknown as Record<string, unknown>, parts.slice(1), value);
      next.updatedAt = new Date().toISOString();
      (parts[0] === "assumptions" ? base : scenario).updatedAt = next.updatedAt;
      setDirty(true);
      return next;
    });
  }, []);

  const selectTrace = useCallback(
    (traceId: string | null) => {
      if (!traceId) {
        setSelectedTrace(null);
        return;
      }
      setSelectedTrace(outputs.traces.find((item) => item.id === traceId) ?? null);
    },
    [outputs.traces],
  );

  const getValue = useCallback(
    (path: string) => {
      const synthetic: Record<string, unknown> = {
        project,
        scenario: activeScenario,
        assumptions: activeScenario.assumptions,
        ...outputs,
        traces: outputs.traces,
        validations: outputs.validations,
        diagnostics: { brokenNamedRanges: 2 },
        excelSheets: { length: 25 },
      };
      return getByPath(synthetic, path);
    },
    [activeScenario, outputs, project],
  );

  const value = useMemo<ProjectContextValue>(
    () => ({
      project,
      activeScenario,
      outputs,
      mode,
      dirty,
      selectedTrace,
      setMode,
      setDirtyState: setDirty,
      updateInput,
      runCalculation,
      runMonteCarlo,
      runMonteCarloAsync,
      applyMonteCarloSettings,
      applySensitivitySettings,
      applyProjectSetup,
      applyMacroAssumptions,
      applyIndustryTemplate,
      applyMarketDemand,
      applyCapacityAssumptions,
      applyDirectCostAssumptions,
      applyOpexAssumptions,
      applyCapexAssumptions,
      applyWorkingCapitalAssumptions,
      applyFinancingAssumptions,
      applyConstructionAssumptions,
      applyEconomicAssumptions,
      selectScenario,
      addScenario,
      duplicateScenario,
      updateScenario,
      applyScenarioAdjustments,
      deleteScenario,
      calculateScenarioOnDemand,
      setScenarioDraftState,
      selectTrace,
      getValue,
    }),
    [
      activeScenario,
      addScenario,
      applyIndustryTemplate,
      applyCapacityAssumptions,
      applyCapexAssumptions,
      applyConstructionAssumptions,
      applyEconomicAssumptions,
      applyDirectCostAssumptions,
      applyFinancingAssumptions,
      applyWorkingCapitalAssumptions,
      applyMacroAssumptions,
      applyMonteCarloSettings,
      applyMarketDemand,
      applyOpexAssumptions,
      applyProjectSetup,
      applySensitivitySettings,
      deleteScenario,
      dirty,
      duplicateScenario,
      getValue,
      mode,
      outputs,
      project,
      runCalculation,
      runMonteCarlo,
      runMonteCarloAsync,
      selectScenario,
      selectTrace,
      selectedTrace,
      updateInput,
      updateScenario,
      applyScenarioAdjustments,
      calculateScenarioOnDemand,
      setScenarioDraftState,
    ],
  );

  return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>;
}

export const useProject = () => {
  const context = useContext(ProjectContext);
  if (!context) throw new Error("useProject must be used within ProjectProvider");
  return context;
};
