import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatSensitivityMetric,
  formatSensitivityValue,
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
    assert.match(percent.text, /٪|%/);
    assert.match(bcr, /x/);
    assert.doesNotMatch(bcr, /٪|%/);
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
