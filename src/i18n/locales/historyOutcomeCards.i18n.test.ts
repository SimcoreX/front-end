import { describe, expect, it } from "vitest";
import en from "@/i18n/locales/en.json";
import pt from "@/i18n/locales/pt.json";
import es from "@/i18n/locales/es.json";

describe("history i18n consistency", () => {
  it("keeps outcomeCards, pnlPanel and layout key sets aligned across pt/en/es", () => {
    const enKeys = flattenObjectKeys((en as Record<string, unknown>).history as Record<string, unknown>, "history");
    const ptKeys = flattenObjectKeys((pt as Record<string, unknown>).history as Record<string, unknown>, "history");
    const esKeys = flattenObjectKeys((es as Record<string, unknown>).history as Record<string, unknown>, "history");

    const scopedPrefixes = ["history.outcomeCards.", "history.pnlPanel.", "history.layout."];

    const enOutcomeKeys = enKeys.filter((key) => scopedPrefixes.some((prefix) => key.startsWith(prefix)));
    const ptOutcomeKeys = ptKeys.filter((key) => scopedPrefixes.some((prefix) => key.startsWith(prefix)));
    const esOutcomeKeys = esKeys.filter((key) => scopedPrefixes.some((prefix) => key.startsWith(prefix)));

    expect(ptOutcomeKeys.sort()).toEqual(enOutcomeKeys.sort());
    expect(esOutcomeKeys.sort()).toEqual(enOutcomeKeys.sort());
  });
});

function flattenObjectKeys(input: Record<string, unknown>, prefix = ""): string[] {
  const keys: string[] = [];

  Object.entries(input).forEach(([key, value]) => {
    const current = prefix ? `${prefix}.${key}` : key;

    if (value && typeof value === "object" && !Array.isArray(value)) {
      keys.push(...flattenObjectKeys(value as Record<string, unknown>, current));
      return;
    }

    keys.push(current);
  });

  return keys;
}
