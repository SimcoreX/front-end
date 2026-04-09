"use client";

import { PageTitle } from "@/components/content/PageTitle";
import { ProfileTabs } from "@/components/content/ProfileTabs";
import { useTranslation } from "react-i18next";

export default function ProfilePage() {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-6">
      <PageTitle>{t("profile.title")}</PageTitle>
      <ProfileTabs />
    </div>
  );
}
