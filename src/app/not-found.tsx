"use client";

import { PageTitle } from "@/components/content/PageTitle";
import { ArrowLeft as ArrowLeftIcon } from "@phosphor-icons/react";
import Link from "next/link";
import { useTranslation } from "react-i18next";

export default function NotFound() {
  const { t } = useTranslation();

  return (
    <div className="flex min-h-screen items-center justify-center bg-primary-950 px-6 py-12 text-white">
      <div className="flex w-full max-w-md flex-col gap-6 rounded-2xl bg-primary-900/60 p-8 text-center shadow-[0_8px_24px_rgba(0,0,0,0.18)]">
        <PageTitle>{t("status.notFound")}</PageTitle>
        <Link
          href="/login"
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-secondary-500/60 px-4 py-2 text-sm font-semibold text-secondary-200 transition hover:bg-secondary-500/10"
        >
          <ArrowLeftIcon size={18} weight="bold" />
          {t("status.backToLogin")}
        </Link>
      </div>
    </div>
  );
}
