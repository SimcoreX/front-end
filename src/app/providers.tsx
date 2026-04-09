"use client";

import { useEffect } from "react";
import type { ReactNode } from "react";
import { I18nextProvider } from "react-i18next";
import i18n from "@/i18n/i18n";

const LANGUAGE_KEY = "simcorex-language";

export function Providers({ children }: { children: ReactNode }) {
  useEffect(() => {
    const savedLanguage = window.localStorage.getItem(LANGUAGE_KEY);
    if (savedLanguage && savedLanguage !== i18n.language) {
      i18n.changeLanguage(savedLanguage);
    }
  }, []);

  useEffect(() => {
    const handleLanguageChange = (language: string) => {
      document.documentElement.lang = language;
    };

    handleLanguageChange(i18n.language);
    i18n.on("languageChanged", handleLanguageChange);

    return () => {
      i18n.off("languageChanged", handleLanguageChange);
    };
  }, []);

  return <I18nextProvider i18n={i18n}>{children}</I18nextProvider>;
}
