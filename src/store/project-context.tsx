"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { calculateMonteCarlo, calculateScenario } from "@/lib/calculations";
import {
  synchronizeIndustryTemplate,
  synchronizeMacroAssumptions,
  synchronizeMarketDemand,
} from "@/lib/phase-one-calculations";
import {
  calculateAnnualCapexSchedule,
  calculateCapacityProduction,
  calculateCapexSummary,
  calculateDirectUnitCost,
  calculateOperationStartDate,
  calculateOpexSchedule,
} from "@/lib/phase-two-calculations";
import { seedProject } from "@/lib/seed";
import { calculateScenarioAdjustedAssumptions, defaultScenarioAdjustments } from "@/lib/scenario-engine";
import type {
  CapexAssumptions,
  CapacityAssumptions,
  ConstructionAssumptions,
  DirectCostAssumptions,
  FinancingAssumptions,
  FormulaTrace,
  IndustryTemplate,
  MacroAssumptions,
  MarketDemandAssumptions,
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
  updateInput: (path: string, value: unknown) => void;
  runCalculation: () => void;
  runMonteCarlo: () => void;
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
  selectScenario: (scenarioId: string) => void;
  addScenario: (name?: string) => void;
  duplicateScenario: (scenarioId: string) => void;
  updateScenario: (scenarioId: string, patch: Partial<Pick<Scenario, "name" | "description" | "type" | "isLocked" | "code" | "status">>) => void;
  applyScenarioAdjustments: (scenarioId: string, adjustments: ScenarioAdjustments) => void;
  deleteScenario: (scenarioId: string) => void;
  selectTrace: (traceId: string | null) => void;
  getValue: (path: string) => unknown;
};

const ProjectContext = createContext<ProjectContextValue | null>(null);
const STORAGE_KEY = "iran-investment-platform.project.v2";

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

const normalizePersistedProject = (value: Project): Project => {
  const next = clone(value);
  next.scenarios = next.scenarios.map((scenario) => ({
    ...scenario,
    adjustments: scenario.adjustments ?? defaultScenarioAdjustments(scenario.type),
    assumptions: {
      ...scenario.assumptions,
      workingCapital: {
        ...scenario.assumptions.workingCapital,
        accruedExpenseDays: scenario.assumptions.workingCapital.accruedExpenseDays ?? 0,
        otherCurrentLiabilitiesPercentOfRevenue: scenario.assumptions.workingCapital.otherCurrentLiabilitiesPercentOfRevenue ?? 0,
      },
    },
    outputs: undefined,
  }));
  return next;
};

const projectForStorage = (project: Project) => {
  const next = clone(project);
  next.scenarios.forEach((scenario) => {
    scenario.outputs = undefined;
  });
  return next;
};

const initialProject = clone(seedProject);
const initialScenario = activeScenarioOf(initialProject);
const initialOutputs = calculateScenario(initialProject, initialScenario);
initialScenario.outputs = initialOutputs;

export function ProjectProvider({ children }: { children: React.ReactNode }) {
  const [project, setProject] = useState<Project>(initialProject);
  const [outputs, setOutputs] = useState<ScenarioOutputs>(initialOutputs);
  const [mode, setMode] = useState<Mode>("basic");
  const [dirty, setDirty] = useState(false);
  const [selectedTrace, setSelectedTrace] = useState<FormulaTrace | null>(null);
  const [persistenceReady, setPersistenceReady] = useState(false);

  const activeScenario = useMemo(() => activeScenarioOf(project), [project]);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const restored = normalizePersistedProject(JSON.parse(saved) as Project);
        const scenario = activeScenarioOf(restored);
        if (scenario.isDefault && scenario.type !== "base") {
          scenario.assumptions = calculateScenarioAdjustedAssumptions(baseScenarioOf(restored).assumptions, scenario.adjustments);
        }
        const restoredOutputs = calculateScenario(restored, scenario);
        scenario.outputs = restoredOutputs;
        setProject(restored);
        setOutputs(restoredOutputs);
      }
    } catch {
      // Ignore corrupt or unavailable storage and keep the validated seed project.
    } finally {
      setPersistenceReady(true);
    }
  }, []);

  useEffect(() => {
    if (!persistenceReady) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(projectForStorage(project)));
    } catch {
      // Storage can be disabled by browser policy; the in-memory model remains usable.
    }
  }, [persistenceReady, project]);

  const activateScenario = useCallback((next: Project, scenarioId: string) => {
    const requested = next.scenarios.find((item) => item.id === scenarioId);
    const scenario = requested?.status === "inactive" ? baseScenarioOf(next) : requested ?? baseScenarioOf(next);
    if (scenario.isDefault && scenario.type !== "base") {
      scenario.assumptions = calculateScenarioAdjustedAssumptions(baseScenarioOf(next).assumptions, scenario.adjustments);
    }
    scenario.assumptions.macro.activeScenarioId = scenario.id;
    next.activeScenarioId = scenario.id;
    next.scenarios.forEach((item) => {
      item.isActive = item.id === scenario.id;
    });
    const nextOutputs = scenario.outputs ?? calculateScenario(next, scenario);
    scenario.outputs = nextOutputs;
    setOutputs(nextOutputs);
    setDirty(false);
  }, []);

  const runCalculation = useCallback(() => {
    setProject((current) => {
      const next = clone(current);
      const scenario = activeScenarioOf(next);
      next.updatedAt = new Date().toISOString();
      scenario.updatedAt = next.updatedAt;
      const nextOutputs = calculateScenario(next, scenario);
      scenario.outputs = nextOutputs;
      setOutputs(nextOutputs);
      setDirty(false);
      return next;
    });
  }, []);

  const runMonteCarlo = useCallback(() => {
    setProject((current) => {
      const next = clone(current);
      const scenario = activeScenarioOf(next);
      next.updatedAt = new Date().toISOString();
      scenario.updatedAt = next.updatedAt;
      const monteCarlo = calculateMonteCarlo(next, scenario);
      const nextOutputs: ScenarioOutputs = { ...(scenario.outputs ?? calculateScenario(next, scenario)), monteCarlo };
      scenario.outputs = nextOutputs;
      setOutputs(nextOutputs);
      setDirty(false);
      return next;
    });
  }, []);

  const applySensitivitySettings = useCallback((settings: SensitivityAssumptions) => {
    setProject((current) => {
      const next = clone(current);
      const scenario = activeScenarioOf(next);
      const timestamp = new Date().toISOString();
      scenario.assumptions.sensitivity = clone(settings);
      scenario.updatedAt = timestamp;
      next.updatedAt = timestamp;
      const nextOutputs = calculateScenario(next, scenario);
      scenario.outputs = nextOutputs;
      setOutputs(nextOutputs);
      setDirty(false);
      return next;
    });
  }, []);

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
      const scenario = selectedScenario;
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
        activeScenarioId: scenario.id,
      });
      scenario.assumptions.industry = synchronizeIndustryTemplate(scenario.assumptions.industry, normalizedSetup);
      if (!scenario.assumptions.capacity.trialProductionStartDate) {
        scenario.assumptions.capacity.trialProductionStartDate = operationStartDate;
      }
      scenario.updatedAt = timestamp;
      next.updatedAt = timestamp;
      const nextOutputs = calculateScenario(next, scenario);
      scenario.outputs = nextOutputs;
      setOutputs(nextOutputs);
      setDirty(false);
      return next;
    });
  }, []);

  const applyMacroAssumptions = useCallback((macro: MacroAssumptions) => {
    setProject((current) => {
      const next = clone(current);
      const scenario = activeScenarioOf(next);
      const timestamp = new Date().toISOString();
      const synchronized = synchronizeMacroAssumptions(macro);
      scenario.assumptions.macro = synchronized;
      scenario.updatedAt = timestamp;
      next.updatedAt = timestamp;
      const nextOutputs = calculateScenario(next, scenario);
      scenario.outputs = nextOutputs;
      setOutputs(nextOutputs);
      setDirty(false);
      return next;
    });
  }, []);

  const applyIndustryTemplate = useCallback((industry: IndustryTemplate) => {
    setProject((current) => {
      const next = clone(current);
      const scenario = activeScenarioOf(next);
      const timestamp = new Date().toISOString();
      const synchronized = synchronizeIndustryTemplate(industry, next.setup);
      const productUnit =
        synchronized.productUnit === "سفارشی" && synchronized.customProductUnit.trim()
          ? synchronized.customProductUnit.trim()
          : synchronized.productUnit;
      scenario.assumptions.industry = synchronized;
      scenario.assumptions.capacity = {
        ...scenario.assumptions.capacity,
        unit: productUnit,
        nominalCapacity: synchronized.nominalCapacity,
        firstYearUtilizationRate: synchronized.firstYearUtilization,
        stableYearUtilizationRate: synchronized.stableUtilization,
        utilizationYear1: synchronized.firstYearUtilization,
        utilizationStable: synchronized.stableUtilization,
        wasteRate: synchronized.wasteRate,
        productionEfficiency: synchronized.efficiency,
        yieldRate: synchronized.efficiency,
      };
      scenario.assumptions.market = {
        ...scenario.assumptions.market,
        marketAnalysisUnit: productUnit,
        unit: productUnit,
      };
      scenario.assumptions.workingCapital = {
        ...scenario.assumptions.workingCapital,
        receivableDays: synchronized.receivablesDays,
        payableDays: synchronized.payablesDays,
      };
      scenario.updatedAt = timestamp;
      next.updatedAt = timestamp;
      const nextOutputs = calculateScenario(next, scenario);
      scenario.outputs = nextOutputs;
      setOutputs(nextOutputs);
      setDirty(false);
      return next;
    });
  }, []);

  const applyCapacityAssumptions = useCallback((capacity: CapacityAssumptions) => {
    setProject((current) => {
      const next = clone(current);
      const scenario = activeScenarioOf(next);
      const timestamp = new Date().toISOString();
      const calculated = calculateCapacityProduction(capacity);
      scenario.assumptions.capacity = {
        ...clone(capacity),
        unit: scenario.assumptions.industry.productUnit,
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
      scenario.assumptions.market = synchronizeMarketDemand({
        ...scenario.assumptions.market,
        marketAnalysisUnit: scenario.assumptions.industry.productUnit,
        unit: scenario.assumptions.industry.productUnit,
        hasSupplyConstraint: true,
        supplyConstraintValue: calculated.values.netSellableProduction,
        potentialSalesYear1: calculated.values.monthlyNetProduction.reduce((total, value) => total + value, 0),
      }, { supplyLimit: calculated.values.netSellableProduction });
      scenario.updatedAt = timestamp;
      next.updatedAt = timestamp;
      const nextOutputs = calculateScenario(next, scenario);
      scenario.outputs = nextOutputs;
      setOutputs(nextOutputs);
      setDirty(false);
      return next;
    });
  }, []);

  const applyDirectCostAssumptions = useCallback((directCosts: DirectCostAssumptions) => {
    setProject((current) => {
      const next = clone(current);
      const scenario = activeScenarioOf(next);
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
      scenario.updatedAt = timestamp;
      next.updatedAt = timestamp;
      const nextOutputs = calculateScenario(next, scenario);
      scenario.outputs = nextOutputs;
      setOutputs(nextOutputs);
      setDirty(false);
      return next;
    });
  }, []);

  const applyOpexAssumptions = useCallback((opex: OpexAssumptions) => {
    setProject((current) => {
      const next = clone(current);
      const scenario = activeScenarioOf(next);
      const timestamp = new Date().toISOString();
      const revenues = scenario.outputs?.revenue.rows.map((row) => row.revenue) ?? [0, scenario.assumptions.market.potentialRevenue];
      const production = scenario.outputs?.capacity.rows.map((row) => row.productionVolume) ?? [0, scenario.assumptions.capacity.outputs?.netSellableProduction ?? 0];
      const calculated = calculateOpexSchedule(opex, revenues, production);
      scenario.assumptions.opex = {
        ...clone(opex),
        allocationToProductionRate: opex.sharedCostAllocationPercent,
        outputs: calculated.values.outputs,
      };
      scenario.updatedAt = timestamp;
      next.updatedAt = timestamp;
      const nextOutputs = calculateScenario(next, scenario);
      scenario.outputs = nextOutputs;
      setOutputs(nextOutputs);
      setDirty(false);
      return next;
    });
  }, []);

  const applyCapexAssumptions = useCallback((capex: CapexAssumptions) => {
    setProject((current) => {
      const next = clone(current);
      const scenario = activeScenarioOf(next);
      const timestamp = new Date().toISOString();
      scenario.assumptions.capex = {
        ...clone(capex),
        summary: calculateCapexSummary(capex.items, scenario.assumptions.macro).values,
        annualSchedule: calculateAnnualCapexSchedule(
          capex,
          scenario.assumptions.macro,
          next.baseYear,
          next.modelHorizonYears,
        ),
      };
      scenario.updatedAt = timestamp;
      next.updatedAt = timestamp;
      const nextOutputs = calculateScenario(next, scenario);
      scenario.outputs = nextOutputs;
      setOutputs(nextOutputs);
      setDirty(false);
      return next;
    });
  }, []);

  const applyWorkingCapitalAssumptions = useCallback((workingCapital: WorkingCapitalAssumptions) => {
    setProject((current) => {
      const next = clone(current);
      const scenario = activeScenarioOf(next);
      const timestamp = new Date().toISOString();
      scenario.assumptions.workingCapital = clone(workingCapital);
      scenario.updatedAt = timestamp;
      next.updatedAt = timestamp;
      const nextOutputs = calculateScenario(next, scenario);
      scenario.outputs = nextOutputs;
      setOutputs(nextOutputs);
      setDirty(false);
      return next;
    });
  }, []);

  const applyFinancingAssumptions = useCallback((financing: FinancingAssumptions) => {
    setProject((current) => {
      const next = clone(current);
      const scenario = activeScenarioOf(next);
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
      scenario.updatedAt = timestamp;
      next.updatedAt = timestamp;
      const nextOutputs = calculateScenario(next, scenario);
      scenario.outputs = nextOutputs;
      setOutputs(nextOutputs);
      setDirty(false);
      return next;
    });
  }, []);

  const applyConstructionAssumptions = useCallback((construction: ConstructionAssumptions) => {
    setProject((current) => {
      const next = clone(current);
      const scenario = activeScenarioOf(next);
      const timestamp = new Date().toISOString();
      scenario.assumptions.construction = clone(construction);
      scenario.updatedAt = timestamp;
      next.updatedAt = timestamp;
      const nextOutputs = calculateScenario(next, scenario);
      scenario.outputs = nextOutputs;
      setOutputs(nextOutputs);
      setDirty(false);
      return next;
    });
  }, []);

  const applyMarketDemand = useCallback((market: MarketDemandAssumptions) => {
    setProject((current) => {
      const next = clone(current);
      const scenario = activeScenarioOf(next);
      const timestamp = new Date().toISOString();
      const synchronized = synchronizeMarketDemand(market, {
        supplyLimit: market.hasSupplyConstraint ? market.supplyConstraintValue : undefined,
      });
      scenario.assumptions.market = synchronized;
      scenario.updatedAt = timestamp;
      next.updatedAt = timestamp;
      const nextOutputs = calculateScenario(next, scenario);
      scenario.outputs = nextOutputs;
      setOutputs(nextOutputs);
      setDirty(false);
      return next;
    });
  }, []);

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
      const source = activeScenarioOf(next);
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
        description: "سناریوی سفارشی ساخته‌شده از مفروضات سناریوی فعال",
        adjustments: defaultScenarioAdjustments("custom"),
        isActive: true,
        isLocked: false,
        isDefault: false,
        status: "active",
        version: 1,
        createdAt: timestamp,
        updatedAt: timestamp,
        outputs: undefined,
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
      const scenario: Scenario = {
        ...clone(source),
        id,
        scenarioId: id,
        name: `${source.name} - کپی`,
        type: "custom",
        code: `C${String(customCount).padStart(2, "0")}`,
        priority: next.scenarios.length + 1,
        isActive: true,
        isLocked: false,
        isDefault: false,
        status: "active",
        version: source.version + 1,
        createdAt: timestamp,
        updatedAt: timestamp,
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
      Object.assign(scenario, patch);
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
      const timestamp = new Date().toISOString();
      scenario.adjustments = clone(adjustments);
      scenario.assumptions = calculateScenarioAdjustedAssumptions(baseScenarioOf(next).assumptions, adjustments);
      scenario.assumptions.macro.activeScenarioId = scenario.id;
      scenario.updatedAt = timestamp;
      next.updatedAt = timestamp;
      const nextOutputs = calculateScenario(next, scenario);
      scenario.outputs = nextOutputs;
      if (scenario.id === next.activeScenarioId) {
        setOutputs(nextOutputs);
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

  const updateInput = useCallback((path: string, value: unknown) => {
    setProject((current) => {
      const next = clone(current);
      const scenario = activeScenarioOf(next);
      const parts = path.split(".");
      if (parts[0] === "project") setByPath(next as unknown as Record<string, unknown>, parts.slice(1), value);
      if (parts[0] === "assumptions") setByPath(scenario.assumptions as unknown as Record<string, unknown>, parts.slice(1), value);
      if (parts[0] === "scenario") setByPath(scenario as unknown as Record<string, unknown>, parts.slice(1), value);
      next.updatedAt = new Date().toISOString();
      scenario.updatedAt = next.updatedAt;
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
      updateInput,
      runCalculation,
      runMonteCarlo,
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
      selectScenario,
      addScenario,
      duplicateScenario,
      updateScenario,
      applyScenarioAdjustments,
      deleteScenario,
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
      applyDirectCostAssumptions,
      applyFinancingAssumptions,
      applyWorkingCapitalAssumptions,
      applyMacroAssumptions,
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
      selectScenario,
      selectTrace,
      selectedTrace,
      updateInput,
      updateScenario,
      applyScenarioAdjustments,
    ],
  );

  return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>;
}

export const useProject = () => {
  const context = useContext(ProjectContext);
  if (!context) throw new Error("useProject must be used within ProjectProvider");
  return context;
};
