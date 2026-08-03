import blankProjectTemplate from "@/lib/blank-project-template.json";
import { addMonthsToDate } from "@/lib/phase-two-calculations";
import { defaultScenarioAdjustments } from "@/lib/scenario-engine";
import type {
  BaseCurrency,
  CalculationBasis,
  DisplayUnit,
  Project,
  ProjectType,
  ScenarioAssumptions,
} from "@/lib/types";

export type NewProjectInput = {
  name: string;
  code: string;
  projectType: ProjectType;
  baseYear: number;
  constructionStartDate: string;
  constructionDurationMonths: number;
  analysisHorizonYears: number;
  baseCurrency: BaseCurrency;
  calculationBasis: CalculationBasis;
  displayUnit: DisplayUnit;
};

type ProjectFactoryOptions = {
  id?: string;
  now?: string;
};

const cloneBlankAssumptions = () =>
  JSON.parse(JSON.stringify(blankProjectTemplate)) as ScenarioAssumptions;

const createProjectId = () => {
  if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
  return `project-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

export const createBlankProject = (
  input: NewProjectInput,
  options: ProjectFactoryOptions = {},
): Project => {
  const id = options.id ?? createProjectId();
  const timestamp = options.now ?? new Date().toISOString();
  const scenarioId = `${id}-base`;
  const operationStartDate = addMonthsToDate(
    input.constructionStartDate,
    input.constructionDurationMonths,
  );
  const assumptions = cloneBlankAssumptions();

  assumptions.macro.baseYear = input.baseYear;
  assumptions.macro.analysisHorizon = input.analysisHorizonYears;
  assumptions.macro.calculationBasis = input.calculationBasis;
  assumptions.macro.baseCurrency = input.baseCurrency;
  assumptions.macro.activeScenarioId = scenarioId;
  assumptions.industry.projectType = input.projectType;

  return {
    id,
    projectId: id,
    version: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
    setup: {
      projectName: input.name.trim(),
      projectCode: input.code.trim(),
      clientName: "",
      preparedBy: "",
      reviewedBy: "",
      approvedBy: "",
      modelPreparedDate: timestamp.slice(0, 10),
      modelVersion: "1.0",
      fileStatus: "پیش‌نویس",
      projectType: input.projectType,
      legalPersonality: "",
      ownershipType: "",
      registrationStatus: "",
      isKnowledgeBased: false,
      isFreeZone: false,
      isSpecialEconomicZone: false,
      isIndustrialTown: false,
      isLessDevelopedRegion: false,
      mainIndustry: "",
      subIndustry: "",
      businessModel: "",
      projectScale: "",
      primaryTargetMarket: "",
      province: "",
      city: "",
      baseYear: input.baseYear,
      constructionStartDate: input.constructionStartDate,
      operationStartDate,
      operationStartDateOverrideEnabled: false,
      operationStartDateManual: "",
      constructionDurationMonths: input.constructionDurationMonths,
      analysisHorizonYears: input.analysisHorizonYears,
      fiscalYearEnd: "اسفند",
      calculationBasis: input.calculationBasis,
      baseCurrency: input.baseCurrency,
      displayUnit: input.displayUnit,
      activeScenarioId: scenarioId,
      scenarioStatus: "سناریوی پایه",
    },
    name: input.name.trim(),
    code: input.code.trim(),
    companyName: "",
    industry: "",
    subIndustry: "",
    projectType: input.projectType,
    province: "",
    city: "",
    legalEntityType: "",
    preparedBy: "",
    reviewedBy: "",
    approvedBy: "",
    purpose: "",
    baseYear: input.baseYear,
    constructionStartDate: input.constructionStartDate,
    operationStartDate,
    constructionDurationMonths: input.constructionDurationMonths,
    rampUpMonths: 0,
    modelHorizonYears: input.analysisHorizonYears,
    currency: input.baseCurrency,
    displayUnit: input.displayUnit,
    activeScenarioId: scenarioId,
    scenarios: [
      {
        id: scenarioId,
        projectId: id,
        scenarioId,
        version: 1,
        createdAt: timestamp,
        updatedAt: timestamp,
        name: "پایه",
        type: "base",
        code: "S01",
        priority: 1,
        isActive: true,
        isLocked: false,
        isDefault: true,
        status: "active",
        description: "",
        adjustments: defaultScenarioAdjustments("base"),
        assumptions,
      },
    ],
  };
};
