import { describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { WinnersLosersCards } from "@/components/content/WinnersLosersCards";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: "pt-BR" },
  }),
}));

describe("WinnersLosersCards", () => {
  it("renders placeholder '-' for nullable backend fields", () => {
    const html = renderToString(
      <WinnersLosersCards
        outcomeCards={{
          winners: {
            total: null,
            bestPnl: null,
            worstPnl: null,
            averagePnl: null,
            averageDurationMs: null,
            maxConsecutive: null,
            avgConsecutive: null,
          },
          losers: {
            total: null,
            bestPnl: null,
            worstPnl: null,
            averagePnl: null,
            averageDurationMs: null,
            maxConsecutive: null,
            avgConsecutive: null,
          },
        }}
        isLoading={false}
      />
    );

    expect(html).toContain("history.outcomeCards.winners.title");
    expect(html).toContain("history.outcomeCards.losers.title");
    expect(html).toContain(">-<");
  });
});
