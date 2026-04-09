"use client";

import { WarningCircle as WarningCircleIcon } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";

export function UnderConstruction() {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-primary-800/70 bg-primary-900/40 p-6">
      <div className="flex items-center gap-3 text-secondary-300">
        <WarningCircleIcon size={28} weight="duotone" />
        <span className="text-lg font-semibold">{t("status.underConstruction")}</span>
      </div>
      <p className="text-sm text-primary-200">
        {t("status.notFound")}
      </p>
    </div>
  );
}
