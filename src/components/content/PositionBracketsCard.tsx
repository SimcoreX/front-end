"use client";

import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/classNames";
import { useState } from "react";
import { useTranslation } from "react-i18next";

type PositionBracketsCardProps = {
  className?: string;
};

export function PositionBracketsCard({ className }: PositionBracketsCardProps) {
  const { t } = useTranslation();
  const [isAutoOcoEnabled, setIsAutoOcoEnabled] = useState(false);
  const [riskAmount, setRiskAmount] = useState("250");
  const [profitAmount, setProfitAmount] = useState("500");
  const [autoApplyBrackets, setAutoApplyBrackets] = useState(true);
  const [preferencesMessage, setPreferencesMessage] = useState<string | null>(null);

  const handleToggleOcoMode = () => {
    setIsAutoOcoEnabled((prev) => !prev);
    setPreferencesMessage(t("profile.preferences.modeUpdatedMock"));
  };

  const handleSavePreferences = () => {
    setPreferencesMessage(t("profile.preferences.savedMock"));
  };

  const handleResetPreferences = () => {
    setIsAutoOcoEnabled(false);
    setRiskAmount("250");
    setProfitAmount("500");
    setAutoApplyBrackets(true);
    setPreferencesMessage(t("profile.preferences.resetMock"));
  };

  return (
    <div
      className={cn(
        "rounded-2xl bg-primary-900/60 p-4 shadow-[0_8px_24px_rgba(0,0,0,0.18)]",
        className
      )}
    >
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <p className="text-base font-semibold text-white sm:text-lg">
          {t("profile.preferences.positionBracketsTitle")}
        </p>

        <button
          type="button"
          onClick={handleToggleOcoMode}
          className="inline-flex h-9 items-center justify-center rounded-xl border border-[#C99D2A]/75 bg-[#E7B93A] px-3.5 text-[0.68rem] font-semibold uppercase tracking-[0.05em] text-[#2A1C00] transition hover:bg-[#F1C953]"
        >
          {isAutoOcoEnabled
            ? t("profile.preferences.switchToManualOco")
            : t("profile.preferences.switchToAutoOco")}
        </button>
      </div>

      <p className="mt-4 text-primary-200">{t("profile.preferences.positionBracketsDescription")}</p>

      <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
        <label className="flex flex-col gap-2 text-sm text-primary-100">
          <span className="font-medium text-primary-200">
            {t("profile.preferences.riskLabel")}
          </span>
          <input
            type="number"
            min="0"
            step="1"
            value={riskAmount}
            onChange={(event) => setRiskAmount(event.target.value)}
            className="h-12 rounded-xl border border-primary-800/60 bg-primary-950/60 px-4 text-lg font-semibold text-white outline-none transition focus:border-primary-500/70 focus:ring-2 focus:ring-primary-500/25"
          />
        </label>

        <label className="flex flex-col gap-2 text-sm text-primary-100">
          <span className="font-medium text-primary-200">
            {t("profile.preferences.profitLabel")}
          </span>
          <input
            type="number"
            min="0"
            step="1"
            value={profitAmount}
            onChange={(event) => setProfitAmount(event.target.value)}
            className="h-12 rounded-xl border border-primary-800/60 bg-primary-950/60 px-4 text-lg font-semibold text-white outline-none transition focus:border-primary-500/70 focus:ring-2 focus:ring-primary-500/25"
          />
        </label>
      </div>

      <label className="mt-5 inline-flex items-center gap-3 text-sm text-primary-100">
        <input
          type="checkbox"
          checked={autoApplyBrackets}
          onChange={(event) => setAutoApplyBrackets(event.target.checked)}
          className="h-4 w-4 rounded border border-primary-700/70 bg-primary-950/60 accent-secondary-500"
        />
        <span>{t("profile.preferences.autoApplyLabel")}</span>
      </label>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="light"
          onClick={handleSavePreferences}
          className="px-4 py-2 text-sm"
        >
          {t("profile.preferences.saveButton")}
        </Button>
        <button
          type="button"
          onClick={handleResetPreferences}
          className="inline-flex h-9 items-center justify-center rounded-xl border border-primary-800/60 bg-primary-950/60 px-4 text-xs font-semibold text-primary-100 transition hover:border-primary-500/70 hover:text-white"
        >
          {t("profile.preferences.resetButton")}
        </button>
      </div>

      {preferencesMessage ? <p className="mt-3 text-sm text-secondary-300">{preferencesMessage}</p> : null}
    </div>
  );
}
