import type { MarketDemandAssumptions } from "@/lib/types";

export const normalizeProductUnit = (unit: string | null | undefined) =>
  String(unit ?? "")
    .trim()
    .replace(/\s*(?:\/|در)\s*(?:سال|ساعت)\s*$/u, "")
    .trim();

export const resolveMarketProductUnit = (market: Pick<MarketDemandAssumptions, "marketAnalysisUnit" | "customMarketAnalysisUnit">) =>
  normalizeProductUnit(market.marketAnalysisUnit === "سایر" ? market.customMarketAnalysisUnit : market.marketAnalysisUnit);

export const formatAnnualProductUnit = (unit: string) => unit ? `${normalizeProductUnit(unit)}/سال` : "واحد/سال";

export const formatHourlyProductUnit = (unit: string) => unit ? `${normalizeProductUnit(unit)}/ساعت` : "واحد/ساعت";

export const isLatinIdentifier = (value: string) => /[A-Za-z0-9]/.test(value) && !/[\u0600-\u06ff]/u.test(value);
