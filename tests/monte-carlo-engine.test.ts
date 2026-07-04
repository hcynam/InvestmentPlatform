import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { calculateMonteCarlo, calculateMonteCarloAsync, calculateScenarioCore } from "../src/lib/calculations";
import {
  buildDefaultDiscreteDistribution,
  buildHistogram,
  calculatePercentile,
  createSeededRandom,
  groupMonteCarloQualityWarnings,
  runMonteCarloSimulation,
  sampleMonteCarloDistribution,
  sampleMonteCarloDistributionResult,
  validateMonteCarloVariable,
} from "../src/lib/monte-carlo-engine";
import { applyRiskVariableShock, defaultRiskVariable } from "../src/lib/risk-variable-engine";
import { seedProject } from "../src/lib/seed";
import type { MonteCarloVariable, Project } from "../src/lib/types";

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const baseMonteCarloProject = (iterations = 8) => {
  const project = clone(seedProject) as Project;
  const scenario = project.scenarios[0];
  project.activeScenarioId = scenario.id;
  scenario.assumptions.monteCarlo.iterations = iterations;
  scenario.assumptions.monteCarlo.seed = 123;
  scenario.assumptions.monteCarlo.variables = [
    variable("price", "قیمت فروش", -0.08, 0, 0.08),
    variable("capex", "CAPEX", -0.05, 0, 0.12),
    variable("wacc", "WACC", -0.02, 0, 0.02),
  ];
  return { project, scenario };
};

const variable = (
  id: string,
  name: string,
  low: number,
  mid: number,
  high: number,
  distribution: MonteCarloVariable["distribution"] = "normal",
): MonteCarloVariable => ({
  id,
  name,
  label: name,
  low,
  mid,
  high,
  distribution,
  enabled: true,
  active: true,
  description: name,
});

describe("monte carlo engine", () => {
  it("produces deterministic same-seed output and different paths for different seeds", () => {
    const first = baseMonteCarloProject();
    const second = baseMonteCarloProject();
    const third = baseMonteCarloProject();
    third.scenario.assumptions.monteCarlo.seed = 999;

    const firstResult = calculateMonteCarlo(first.project, first.scenario);
    const secondResult = calculateMonteCarlo(second.project, second.scenario);
    const thirdResult = calculateMonteCarlo(third.project, third.scenario);

    assert.deepEqual(firstResult.rows.map((row) => row.samples.map((sample) => sample.shock)), secondResult.rows.map((row) => row.samples.map((sample) => sample.shock)));
    assert.notDeepEqual(firstResult.rows.map((row) => row.samples.map((sample) => sample.shock)), thirdResult.rows.map((row) => row.samples.map((sample) => sample.shock)));
    assert.equal(firstResult.metricSummaries.NPV.p50, secondResult.metricSummaries.NPV.p50);
  });

  it("keeps the core simulation free of ambient random sources", () => {
    const source = readFileSync("src/lib/monte-carlo-engine.ts", "utf8");
    assert.equal(source.includes("Math.random"), false);
  });

  it("validates distributions and samples within supported bounds", () => {
    const invalid = validateMonteCarloVariable(variable("bad", "CAPEX", 0.2, 0, 0.1, "triangular"));
    assert.equal(invalid.ok, false);
    assert.ok(invalid.warnings.some((warning) => warning.id.includes("mode") || warning.id.includes("bounds")));

    const guarded = validateMonteCarloVariable({ ...variable("guard", "قیمت فروش", -1.2, 0, 0.1), positiveOnly: true });
    assert.ok(guarded.warnings.some((warning) => warning.id.includes("positive-guard")));

    const delay = validateMonteCarloVariable({ ...variable("delay", "تاخیر اجرا", 0, 2.5, 7, "triangular"), shockMode: "absolute" });
    assert.ok(delay.warnings.some((warning) => warning.id.includes("delay-discrete")));
    assert.ok(delay.warnings.some((warning) => warning.id.includes("delay-integer")));

    const random = createSeededRandom(42);
    const triangular = Array.from({ length: 30 }, () => sampleMonteCarloDistribution(random, { type: "triangular", min: -0.1, mode: 0, max: 0.2 }));
    const pert = Array.from({ length: 30 }, () => sampleMonteCarloDistribution(random, { type: "pert", min: -0.1, mode: 0.05, max: 0.2 }));
    const normal = Array.from({ length: 30 }, () => sampleMonteCarloDistribution(random, { type: "normal", min: -0.05, mean: 0, max: 0.05, stdDev: 0.02 }));
    const lognormal = Array.from({ length: 30 }, () => sampleMonteCarloDistribution(random, { type: "lognormal", min: 0, mean: 0.02, max: 0.25, stdDev: 0.05 }));

    [...triangular, ...pert].forEach((sample) => assert.ok(sample >= -0.1 && sample <= 0.2));
    normal.forEach((sample) => assert.ok(sample >= -0.05 && sample <= 0.05));
    lognormal.forEach((sample) => assert.ok(sample >= 0 && sample <= 0.25));
  });

  it("validates discrete options, probability totals and variable-specific constraints", () => {
    const valid = validateMonteCarloVariable({
      ...variable("mc-sales-price", "شوک قیمت فروش", -0.1, 0, 0.1),
      distribution: {
        type: "discrete",
        valueMode: "percentShock",
        options: [
          { id: "down", label: "کاهش قیمت", value: -0.1, probability: 0.25 },
          { id: "base", label: "قیمت پایه", value: 0, probability: 0.5 },
          { id: "up", label: "افزایش قیمت", value: 0.1, probability: 0.25 },
        ],
      },
    });
    assert.equal(valid.ok, true);
    assert.equal(valid.distribution.options?.length, 3);

    const badSum = validateMonteCarloVariable({
      ...variable("mc-capex", "CAPEX", 0, 0.1, 0.25),
      distribution: {
        type: "discrete",
        valueMode: "percentShock",
        options: [
          { id: "base", label: "پایه", value: 0, probability: 0.4 },
          { id: "high", label: "بالا", value: 0.25, probability: 0.4 },
        ],
      },
    });
    assert.equal(badSum.ok, false);
    assert.ok(badSum.warnings.some((warning) => warning.id.includes("discrete-probability-sum")));

    const delay = validateMonteCarloVariable({
      ...variable("mc-delay", "تاخیر اجرا", 0, 3, 12, {
        type: "discrete",
        valueMode: "absoluteValue",
        options: [
          { id: "zero", label: "بدون تاخیر", value: 0, probability: 0.5 },
          { id: "fraction", label: "تاخیر اعشاری", value: 1.5, probability: 0.5 },
        ],
      }),
      shockMode: "absolute",
    });
    assert.equal(delay.ok, false);
    assert.ok(delay.warnings.some((warning) => warning.id.includes("delay-discrete-integer")));

    const receivables = validateMonteCarloVariable({
      ...variable("mc-receivable-days", "روزهای وصول مطالبات", 45, 60, 90, {
        type: "discrete",
        valueMode: "absoluteValue",
        options: [
          { id: "bad", label: "منفی", value: -1, probability: 0.5 },
          { id: "base", label: "پایه", value: 60, probability: 0.5 },
        ],
      }),
      shockMode: "absolute",
    });
    assert.equal(receivables.ok, false);
    assert.ok(receivables.warnings.some((warning) => warning.id.includes("receivable-days-nonnegative")));
  });

  it("runs valid discrete variables and skips inactive invalid discrete variables", () => {
    const { project, scenario } = baseMonteCarloProject(12);
    scenario.assumptions.monteCarlo.variables = [
      {
        ...variable("mc-sales-price", "شوک قیمت فروش", -0.1, 0, 0.1, {
          type: "discrete",
          valueMode: "percentShock",
          options: [
            { id: "down", label: "کاهش قیمت", value: -0.1, probability: 0.25 },
            { id: "base", label: "قیمت پایه", value: 0, probability: 0.5 },
            { id: "up", label: "افزایش قیمت", value: 0.1, probability: 0.25 },
          ],
        }),
        active: true,
        enabled: true,
      },
      {
        ...variable("mc-capex", "CAPEX", 0, 0.1, 0.25, {
          type: "discrete",
          valueMode: "percentShock",
          options: [
            { id: "base", label: "پایه", value: 0, probability: 0.25 },
            { id: "high", label: "بالا", value: 0.25, probability: 0.25 },
          ],
        }),
        active: false,
        enabled: false,
      },
    ];

    const result = calculateMonteCarlo(project, scenario);
    assert.equal(result.completedIterations, 12);
    assert.equal(result.activeVariableCount, 1);
    assert.ok(result.rows.every((row) => row.samples[0]?.selectedOptionLabel));
    assert.ok(result.rows.every((row) => row.samples[0]?.discreteValueMode === "percentShock"));
  });

  it("samples discrete distributions deterministically and approximately respects probabilities", () => {
    const distribution = {
      type: "discrete" as const,
      valueMode: "percentShock" as const,
      options: [
        { id: "low", label: "کم", value: -0.1, probability: 0.2 },
        { id: "high", label: "زیاد", value: 0.2, probability: 0.8 },
      ],
    };
    const firstRandom = createSeededRandom(77);
    const secondRandom = createSeededRandom(77);
    const thirdRandom = createSeededRandom(78);
    const first = Array.from({ length: 80 }, () => sampleMonteCarloDistributionResult(firstRandom, distribution).selectedOption?.id);
    const second = Array.from({ length: 80 }, () => sampleMonteCarloDistributionResult(secondRandom, distribution).selectedOption?.id);
    const third = Array.from({ length: 80 }, () => sampleMonteCarloDistributionResult(thirdRandom, distribution).selectedOption?.id);
    assert.deepEqual(first, second);
    assert.notDeepEqual(first, third);

    const probabilityRandom = createSeededRandom(1234);
    const draws = Array.from({ length: 2000 }, () => sampleMonteCarloDistributionResult(probabilityRandom, distribution).selectedOption?.id);
    const lowShare = draws.filter((id) => id === "low").length / draws.length;
    assert.ok(lowShare > 0.16 && lowShare < 0.24);
  });

  it("creates valid variable-aware discrete defaults", () => {
    const delayVariable = { ...variable("mc-delay", "تاخیر اجرا", 0, 4, 12), shockMode: "absolute" as const };
    const delayDefault = buildDefaultDiscreteDistribution(delayVariable);
    assert.equal(delayDefault.type, "discrete");
    assert.equal(delayDefault.valueMode, "absoluteValue");
    assert.equal(delayDefault.options?.length, 4);
    assert.equal(delayDefault.options?.reduce((total, option) => total + option.probability, 0), 1);
    assert.equal(validateMonteCarloVariable({ ...delayVariable, distribution: delayDefault }).ok, true);

    const capexDefault = buildDefaultDiscreteDistribution(variable("mc-capex", "CAPEX", 0, 0.1, 0.25));
    assert.equal(capexDefault.valueMode, "percentShock");
    assert.ok(capexDefault.options?.some((option) => option.value === 0.25));
  });

  it("handles zero active variables and constant histogram series explicitly", () => {
    const { project, scenario } = baseMonteCarloProject(4);
    scenario.assumptions.monteCarlo.variables = scenario.assumptions.monteCarlo.variables.map((item) => ({ ...item, enabled: false, active: false }));
    const result = calculateMonteCarlo(project, scenario);

    assert.equal(result.activeVariableCount, 0);
    assert.ok(result.qualityWarnings.some((warning) => warning.id === "mc.zero-active-variables"));
    assert.deepEqual(new Set(result.rows.map((row) => row.npv)).size, 1);

    const histogram = buildHistogram([5, 5, 5], 5);
    assert.equal(histogram.reduce((total, bin) => total + bin.count, 0), 3);
    assert.equal(histogram.length, 5);
  });

  it("does not coerce invalid IRR outputs to zero", () => {
    const { project, scenario } = baseMonteCarloProject(3);
    const baseOutputs = calculateScenarioCore(project, scenario);
    const result = runMonteCarloSimulation(project, scenario, () => ({
      ...baseOutputs,
      valuation: {
        ...baseOutputs.valuation,
        irr: null,
        mirr: null,
      },
    }));

    assert.equal(result.metricSummaries.IRR.validCount, 0);
    assert.equal(result.rows.every((row) => row.irr === null), true);
    assert.equal(result.rows.some((row) => row.irr === 0), false);
    assert.ok(result.rows.every((row) => row.invalidReasons.includes("invalidIrr")));
  });

  it("calculates finite summaries, invalid counts, VaR convention and contribution ranking", () => {
    const { project, scenario } = baseMonteCarloProject(10);
    const baseOutputs = calculateScenarioCore(project, scenario);
    const result = calculateMonteCarlo(project, scenario);
    const npvs = result.rows.map((row) => row.npv).filter((value): value is number => typeof value === "number");
    const losses = npvs.map((npv) => baseOutputs.valuation.npv - npv);

    assert.equal(Number.isFinite(result.metricSummaries.NPV.mean ?? Number.NaN), true);
    assert.equal(result.metricSummaries.NPV.count, 10);
    assert.equal(result.valueAtRisk95, calculatePercentile(losses, 0.95));
    assert.equal(result.varConvention, "baseRelativeNpvLoss");
    assert.equal(result.baseNpv, baseOutputs.valuation.npv);
    assert.equal(typeof result.durationMs, "number");
    assert.equal(typeof result.averageMsPerIteration, "number");
    assert.ok(result.varConventionDescription.includes("loss = base NPV - iteration NPV"));
    assert.ok(result.varConventionNotes.some((note) => note.includes("P5/P50/P95")));
    assert.equal(result.contributionMethod, "pearsonCorrelation");
    assert.ok(result.contributionMethodDescription.includes("همبستگی"));
    assert.ok(result.contributions.every((item, index, list) => index === 0 || list[index - 1].absoluteCorrelation >= item.absoluteCorrelation));
    assert.ok(result.sampledRows.length < result.rows.length || result.rows.length <= 15);
  });

  it("groups repeated truncated-normal warnings", () => {
    const { project, scenario } = baseMonteCarloProject(6);
    const result = calculateMonteCarlo(project, scenario);
    const grouped = result.qualityWarnings.find((warning) => warning.id === "mc.variable.truncated-normal.grouped");

    assert.ok(grouped);
    assert.ok(grouped.details?.length);
    assert.equal(result.qualityWarnings.some((warning) => warning.id.endsWith(".truncated-normal")), false);
    assert.equal(groupMonteCarloQualityWarnings(result.qualityWarnings), result.qualityWarnings);
  });

  it("returns meaningful sampled iteration labels", () => {
    const { project, scenario } = baseMonteCarloProject(30);
    const result = calculateMonteCarlo(project, scenario);
    const labels = result.sampledRows.flatMap((row) => row.sampleLabel?.split(" / ") ?? []);

    assert.ok(labels.includes("بدترین NPV"));
    assert.ok(labels.includes("بهترین NPV"));
    assert.ok(labels.includes("نزدیک P5"));
    assert.ok(labels.includes("میانه P50"));
    assert.ok(labels.includes("نزدیک P95"));
    assert.ok(labels.includes("بدترین DSCR"));
    assert.ok(labels.includes("بدترین نقدینگی"));
    assert.ok(result.sampledRows.every((row) => row.sampleReason));
    assert.ok(result.sampledRows.some((row) => row.sampleRole?.includes("worstNpv")));
  });

  it("chunked async execution matches deterministic synchronous summaries", async () => {
    const sync = baseMonteCarloProject(16);
    const asyncRun = baseMonteCarloProject(16);
    const progress: Array<{ completedIterations: number; running: boolean; startedAt: string }> = [];

    const syncResult = calculateMonteCarlo(sync.project, sync.scenario);
    const asyncResult = await calculateMonteCarloAsync(asyncRun.project, asyncRun.scenario, {
      chunkSize: 4,
      onProgress: (snapshot) => progress.push({
        completedIterations: snapshot.completedIterations,
        running: snapshot.running,
        startedAt: snapshot.startedAt,
      }),
    });

    assert.ok(asyncResult);
    assert.equal(asyncResult.metricSummaries.NPV.p50, syncResult.metricSummaries.NPV.p50);
    assert.equal(asyncResult.valueAtRisk95, syncResult.valueAtRisk95);
    assert.deepEqual(
      asyncResult.sampledRows.map((row) => row.sampleLabel),
      syncResult.sampledRows.map((row) => row.sampleLabel),
    );
    assert.ok(progress.some((snapshot) => snapshot.completedIterations === 0 && snapshot.running));
    assert.ok(progress.some((snapshot) => snapshot.completedIterations === 16));
    assert.ok(progress.every((snapshot) => snapshot.startedAt));
  });

  it("cancels chunked async execution without returning partial results", async () => {
    const { project, scenario } = baseMonteCarloProject(40);
    const controller = new AbortController();
    const progress: number[] = [];

    const result = await calculateMonteCarloAsync(project, scenario, {
      chunkSize: 2,
      signal: controller.signal,
      onProgress: (snapshot) => {
        progress.push(snapshot.completedIterations);
        if (snapshot.completedIterations >= 2) controller.abort();
      },
    });

    assert.equal(result, null);
    assert.ok(progress.some((count) => count >= 2 && count < 40));
  });

  it("connects Monte Carlo risk variables to the real financial model", () => {
    const project = clone(seedProject) as Project;
    const scenario = project.scenarios[0];
    const baseOutputs = calculateScenarioCore(project, scenario);

    const capexShock = applyRiskVariableShock(project, scenario, defaultRiskVariable("capex"), 0.2, baseOutputs);
    const capexOutputs = calculateScenarioCore(capexShock.project, capexShock.scenario);
    assert.ok(capexOutputs.valuation.npv < baseOutputs.valuation.npv);

    const waccShock = applyRiskVariableShock(project, scenario, defaultRiskVariable("discountRate"), 0.02, baseOutputs);
    const waccOutputs = calculateScenarioCore(waccShock.project, waccShock.scenario);
    assert.ok(waccOutputs.valuation.npv < baseOutputs.valuation.npv);
    assert.equal(waccShock.scenario.assumptions.financing.interestRate, scenario.assumptions.financing.interestRate);

    const debtShock = applyRiskVariableShock(project, scenario, defaultRiskVariable("debtInterest"), 0.03, baseOutputs);
    const debtOutputs = calculateScenarioCore(debtShock.project, debtShock.scenario);
    assert.ok((debtOutputs.financing.minimumDscr ?? Infinity) < (baseOutputs.financing.minimumDscr ?? Infinity));

    const workingCapitalShock = applyRiskVariableShock(project, scenario, defaultRiskVariable("workingCapitalDays"), 30, baseOutputs);
    const workingCapitalOutputs = calculateScenarioCore(workingCapitalShock.project, workingCapitalShock.scenario);
    assert.ok(workingCapitalOutputs.workingCapital.rows[1].receivables > baseOutputs.workingCapital.rows[1].receivables);

    const delayShock = applyRiskVariableShock(project, scenario, defaultRiskVariable("delay"), 4, baseOutputs);
    const delayOutputs = calculateScenarioCore(delayShock.project, delayShock.scenario);
    assert.equal(delayShock.scenario.assumptions.construction.actualDelayMonths, 4);
    assert.ok(delayOutputs.capex.delayCost >= baseOutputs.capex.delayCost);
  });

  it("surfaces FX no-exposure warnings instead of fake sensitivity", () => {
    const project = clone(seedProject) as Project;
    const assumptions = project.scenarios[0].assumptions;
    assumptions.capex.items = assumptions.capex.items.map((item) => ({ ...item, fxUnitPrice: 0, fxPriceShare: 0 }));
    assumptions.directCosts.isMainRawMaterialFx = false;
    assumptions.directCosts.mainRawMaterialFxPrice = 0;
    assumptions.directCosts.items = assumptions.directCosts.items.map((item) => ({ ...item, fxUnitCost: 0, fxShare: 0 }));
    assumptions.opex.items = assumptions.opex.items.map((item) => ({ ...item, isFx: false, fxShare: 0 }));
    assumptions.construction.costItems = assumptions.construction.costItems?.map((item) => ({ ...item, fxIndexed: false, fxShare: 0 }));
    const scenario = project.scenarios[0];
    const baseOutputs = calculateScenarioCore(project, scenario);

    const shocked = applyRiskVariableShock(project, scenario, defaultRiskVariable("fxRate"), 0.2, baseOutputs);
    assert.ok(shocked.warnings.some((item) => item.includes("مواجهه ارزی")));

    scenario.assumptions.monteCarlo.iterations = 4;
    scenario.assumptions.monteCarlo.variables = [variable("fx", "نرخ ارز", -0.05, 0, 0.2)];
    const result = calculateMonteCarlo(project, scenario);
    assert.ok(result.qualityWarnings.some((warning) => warning.id.includes("no-fx-exposure")));
  });

  it("keeps the React workbench aggregated and free of invalid text leaks", () => {
    const source = readFileSync("src/components/project/MonteCarloWorkbench.tsx", "utf8");

    assert.ok(source.includes("sampledRows"));
    assert.equal(source.includes("result.rows.map"), false);
    assert.ok(source.includes("نمونه‌گیری فعلی مستقل است"));
    assert.ok(source.indexOf("<VariableConfiguration") < source.indexOf("{result ? ("));
    assert.ok(source.includes("onClick={runSimulation}"));
    assert.ok(source.includes("runMonteCarloAsync(normalized"));
    assert.ok(source.includes("setRunState(\"cancelled\")"));
    assert.ok(source.includes("heavyRunConfirmed"));
    assert.ok(source.includes("تأیید اجرای سنگین"));
    assert.ok(source.includes("درآمد و بازار"));
    assert.ok(source.includes("کلان و نرخ ارز"));
    assert.ok(source.includes("سرمایه‌گذاری و هزینه‌ها"));
    assert.ok(source.includes("تأمین مالی و زمان‌بندی"));
    assert.ok(source.includes("سرمایه در گردش"));
    assert.ok(source.includes("مقدار پایه یافت نشد"));
    assert.ok(source.includes("مقدار پایه صفر است"));
    assert.ok(source.includes("formatShockValue"));
    assert.ok(source.includes("formatSignedPercent"));
    assert.ok(source.includes("formatPercent(Math.abs(value))"));
    assert.ok(source.includes("VarConventionBox"));
    assert.ok(source.includes("ManagementInterpretation"));
    assert.ok(source.includes("contributionMethodDescription"));
    assert.ok(source.includes("محور افقی: NPV"));
    assert.ok(source.includes("sampleLabel"));
    assert.ok(source.includes("sampleReason"));
    assert.ok(source.includes("DiscreteOptionsEditor"));
    assert.ok(source.includes("گزینه‌های گسسته") || source.includes("Ú¯Ø²ÛŒÙ†Ù‡â€ŒÙ‡Ø§ÛŒ Ú¯Ø³Ø³ØªÙ‡"));
    assert.ok(source.includes("نرمال‌سازی احتمال‌ها") || source.includes("Ù†Ø±Ù…Ø§Ù„â€ŒØ³Ø§Ø²ÛŒ Ø§Ø­ØªÙ…Ø§Ù„â€ŒÙ‡Ø§"));
    assert.ok(source.includes("buildDefaultDiscreteDistribution(item)"));
    assert.ok(source.includes("continuousDistributionFor"));
    assert.ok(source.includes("rowStatusBadges"));
    assert.equal(source.includes(">NaN<"), false);
    assert.equal(source.includes(">undefined<"), false);
    assert.equal(source.includes(">null<"), false);
    assert.equal(source.includes("#N/A"), false);
  });
});
