"use client";

import { SelectField } from "@/components/forms/SelectField";
import { Button } from "@/components/ui/Button";
import { useState } from "react";
import { useTranslation } from "react-i18next";

type CandleType = "candlestick" | "hollow" | "ohlc" | "heikinAshi";
type CandleColorPreset = "greenRed" | "blackWhite" | "blueOrange" | "custom";

type ChartCandleSettings = {
  candleType: CandleType;
  colorPreset: CandleColorPreset;
  bullishBodyColor: string;
  bearishBodyColor: string;
  bullishWickColor: string;
  bearishWickColor: string;
  bullishBorderColor: string;
  bearishBorderColor: string;
  useBodyColorForWicks: boolean;
};

const PRESET_VALUES: Record<Exclude<CandleColorPreset, "custom">, Omit<ChartCandleSettings, "candleType" | "colorPreset" | "useBodyColorForWicks">> = {
  greenRed: {
    bullishBodyColor: "#22C55E",
    bearishBodyColor: "#EF4444",
    bullishWickColor: "#16A34A",
    bearishWickColor: "#DC2626",
    bullishBorderColor: "#15803D",
    bearishBorderColor: "#B91C1C",
  },
  blackWhite: {
    bullishBodyColor: "#FFFFFF",
    bearishBodyColor: "#111111",
    bullishWickColor: "#D1D5DB",
    bearishWickColor: "#6B7280",
    bullishBorderColor: "#E5E7EB",
    bearishBorderColor: "#000000",
  },
  blueOrange: {
    bullishBodyColor: "#3B82F6",
    bearishBodyColor: "#F97316",
    bullishWickColor: "#2563EB",
    bearishWickColor: "#EA580C",
    bullishBorderColor: "#1D4ED8",
    bearishBorderColor: "#C2410C",
  },
};

const INITIAL_SETTINGS: ChartCandleSettings = {
  candleType: "candlestick",
  colorPreset: "greenRed",
  useBodyColorForWicks: false,
  ...PRESET_VALUES.greenRed,
};

export function SessionChartCustomizationCard() {
  const { t } = useTranslation();
  const [settings, setSettings] = useState<ChartCandleSettings>(INITIAL_SETTINGS);
  const [feedbackKey, setFeedbackKey] = useState<string | null>(null);

  const candleTypeOptions = [
    { value: "candlestick", label: t("profile.preferences.chart.options.candleType.candlestick") },
    { value: "hollow", label: t("profile.preferences.chart.options.candleType.hollow") },
    { value: "ohlc", label: t("profile.preferences.chart.options.candleType.ohlc") },
    { value: "heikinAshi", label: t("profile.preferences.chart.options.candleType.heikinAshi") },
  ];

  const presetOptions = [
    { value: "greenRed", label: t("profile.preferences.chart.options.colorPreset.greenRed") },
    { value: "blackWhite", label: t("profile.preferences.chart.options.colorPreset.blackWhite") },
    { value: "blueOrange", label: t("profile.preferences.chart.options.colorPreset.blueOrange") },
    { value: "custom", label: t("profile.preferences.chart.options.colorPreset.custom") },
  ];

  const updateField = <K extends keyof ChartCandleSettings>(field: K, value: ChartCandleSettings[K]) => {
    setFeedbackKey(null);
    setSettings((prev) => {
      const next = { ...prev, [field]: value };

      if (field === "colorPreset" && value !== "custom") {
        const preset = PRESET_VALUES[value as Exclude<CandleColorPreset, "custom">];
        return {
          ...next,
          ...preset,
        };
      }

      if (
        prev.useBodyColorForWicks &&
        (field === "bullishBodyColor" || field === "bearishBodyColor")
      ) {
        if (field === "bullishBodyColor") {
          next.bullishWickColor = value as string;
        }
        if (field === "bearishBodyColor") {
          next.bearishWickColor = value as string;
        }
      }

      if (field === "useBodyColorForWicks" && value) {
        next.bullishWickColor = prev.bullishBodyColor;
        next.bearishWickColor = prev.bearishBodyColor;
      }

      return next;
    });
  };

  const handleReset = () => {
    setSettings(INITIAL_SETTINGS);
    setFeedbackKey("profile.preferences.chart.messages.reset");
  };

  const handleSave = () => {
    setFeedbackKey("profile.preferences.chart.messages.saved");
  };

  return (
    <div className="rounded-2xl bg-primary-900/60 p-4 shadow-[0_8px_24px_rgba(0,0,0,0.18)]">
      <div className="space-y-2">
        <p className="text-base font-semibold text-white sm:text-lg">{t("profile.preferences.chart.title")}</p>
        <p className="text-primary-200">{t("profile.preferences.chart.description")}</p>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
        <SelectField
          label={t("profile.preferences.chart.fields.candleType")}
          value={settings.candleType}
          options={candleTypeOptions}
          onChange={(event) => updateField("candleType", event.target.value as CandleType)}
        />

        <SelectField
          label={t("profile.preferences.chart.fields.colorPreset")}
          value={settings.colorPreset}
          options={presetOptions}
          onChange={(event) => updateField("colorPreset", event.target.value as CandleColorPreset)}
        />

        <ColorField
          label={t("profile.preferences.chart.fields.bullishBodyColor")}
          value={settings.bullishBodyColor}
          onChange={(value) => updateField("bullishBodyColor", value)}
        />

        <ColorField
          label={t("profile.preferences.chart.fields.bearishBodyColor")}
          value={settings.bearishBodyColor}
          onChange={(value) => updateField("bearishBodyColor", value)}
        />

        <ColorField
          label={t("profile.preferences.chart.fields.bullishWickColor")}
          value={settings.bullishWickColor}
          onChange={(value) => updateField("bullishWickColor", value)}
          disabled={settings.useBodyColorForWicks}
        />

        <ColorField
          label={t("profile.preferences.chart.fields.bearishWickColor")}
          value={settings.bearishWickColor}
          onChange={(value) => updateField("bearishWickColor", value)}
          disabled={settings.useBodyColorForWicks}
        />

        <ColorField
          label={t("profile.preferences.chart.fields.bullishBorderColor")}
          value={settings.bullishBorderColor}
          onChange={(value) => updateField("bullishBorderColor", value)}
        />

        <ColorField
          label={t("profile.preferences.chart.fields.bearishBorderColor")}
          value={settings.bearishBorderColor}
          onChange={(value) => updateField("bearishBorderColor", value)}
        />
      </div>

      <label className="mt-5 inline-flex items-center gap-3 text-sm text-primary-100">
        <input
          type="checkbox"
          checked={settings.useBodyColorForWicks}
          onChange={(event) => updateField("useBodyColorForWicks", event.target.checked)}
          className="h-4 w-4 rounded border border-primary-700/70 bg-primary-950/60 accent-secondary-500"
        />
        <span>{t("profile.preferences.chart.fields.useBodyColorForWicks")}</span>
      </label>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" variant="light" onClick={handleSave} className="px-4 py-2 text-sm">
          {t("profile.preferences.chart.actions.save")}
        </Button>
        <button
          type="button"
          onClick={handleReset}
          className="inline-flex h-9 items-center justify-center rounded-xl border border-primary-800/60 bg-primary-950/60 px-4 text-xs font-semibold text-primary-100 transition hover:border-primary-500/70 hover:text-white"
        >
          {t("profile.preferences.chart.actions.reset")}
        </button>
      </div>

      {feedbackKey && <p className="mt-3 text-sm text-secondary-300">{t(feedbackKey)}</p>}
    </div>
  );
}

function ColorField({
  label,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <label className="flex flex-col gap-2 text-sm text-primary-100">
      <span className="font-medium">{label}</span>
      <div className="flex h-11 items-center gap-3 rounded-xl border border-primary-800/60 bg-primary-950/60 px-3">
        <input
          type="color"
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          className="h-7 w-10 cursor-pointer rounded border border-primary-700/70 bg-transparent disabled:cursor-not-allowed disabled:opacity-50"
        />
        <span className="text-xs uppercase text-primary-300">{value}</span>
      </div>
    </label>
  );
}
