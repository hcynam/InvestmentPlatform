import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  classifySensitivityHeatmapCell,
  formatSensitivityMetric,
  formatSensitivityValue,
  formatThresholdStatus,
  metricMetadata,
} from "../src/lib/sensitivity-format";
import { seedProject } from "../src/lib/seed";

describe("sensitivity formatter", () => {
  it("formats unit prices without total-money scaling", () => {
    const formatted = formatSensitivityValue({ value: 1_234_567, unitType: "unitPrice" }, seedProject);

    assert.match(formatted.text, /ریال\//);
    assert.doesNotMatch(formatted.text, /میلیارد/);
    assert.doesNotMatch(formatted.text, /^0\b/);
  });

  it("formats FX rates as exchange rates, not total money", () => {
    const formatted = formatSensitivityValue({ value: 500_000, unitType: "fxRate" }, seedProject);

    assert.match(formatted.text, /ریال\/USD/);
    assert.doesNotMatch(formatted.text, /میلیارد|میلیون/);
  });

  it("formats percentages and ratios with different units", () => {
    const percent = formatSensitivityValue({ value: 0.2, unitType: "percentage" }, seedProject);
    const bcr = formatSensitivityMetric(1.2345, "BCR", seedProject);

    assert.equal(metricMetadata("IRR").unitType, "percentage");
    assert.equal(metricMetadata("BCR").unitType, "ratio");
    assert.equal(metricMetadata("BCR").unitLabel, "x");
    assert.equal(metricMetadata("BCR").targetLabel, "BCR = 1");
    assert.match(metricMetadata("BCR").label, /منفعت به هزینه/);
    assert.match(percent.text, /٪|%/);
    assert.match(bcr, /x/);
    assert.doesNotMatch(bcr, /٪|%/);
  });

  it("classifies matrix heatmap cells by metric-specific risk thresholds", () => {
    assert.equal(classifySensitivityHeatmapCell("NPV", -100, { baseValue: 50 }).status, "highRisk");
    assert.equal(classifySensitivityHeatmapCell("NPV", 100, { baseValue: 50 }).status, "strong");
    assert.equal(classifySensitivityHeatmapCell("BCR", 0.95, { baseValue: 1.2 }).status, "highRisk");
    assert.equal(classifySensitivityHeatmapCell("BCR", 1.04, { baseValue: 1.2 }).status, "watch");
    assert.equal(classifySensitivityHeatmapCell("BCR", 1.35, { baseValue: 1.2 }).status, "strong");
    assert.equal(classifySensitivityHeatmapCell("IRR", 0.09, { discountRate: 0.12 }).status, "highRisk");
    assert.equal(classifySensitivityHeatmapCell("DSCR", 1.1, { targetDscr: 1.25 }).status, "highRisk");
    assert.equal(classifySensitivityHeatmapCell("DSCR", 1.6, { targetDscr: 1.25 }).status, "strong");
  });

  it("labels boundary-only threshold results as non-valid roots", () => {
    assert.equal(formatThresholdStatus("boundaryOnly"), "مرزی، نه ریشه معتبر");
  });

  it("keeps volume units visible and warns when the unit is unknown", () => {
    const known = formatSensitivityValue({ value: 42, unitType: "volume" }, seedProject);
    const unknown = formatSensitivityValue({ value: 42, unitType: "volume" });

    assert.doesNotMatch(known.text, /میلیارد|میلیون/);
    assert.match(known.text, /مگاوات|unit/);
    assert.match(unknown.text, /unit/);
    assert.ok(unknown.warning);
  });

  it("does not leak NaN undefined null or spreadsheet error tokens", () => {
    const samples = [
      formatSensitivityValue({ value: Number.NaN, unitType: "unitPrice" }, seedProject).text,
      formatSensitivityValue({ value: undefined, unitType: "fxRate" }, seedProject).text,
      formatSensitivityValue({ value: null, unitType: "volume" }, seedProject).text,
      formatSensitivityMetric(null, "NPV", seedProject),
    ];

    samples.forEach((text) => {
      assert.doesNotMatch(text, /NaN|undefined|null|#N\/A/);
    });
  });
});
