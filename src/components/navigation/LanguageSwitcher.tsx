"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { CaretDown as CaretDownIcon } from "@phosphor-icons/react";
import { cn } from "@/lib/classNames";
import { useTranslation } from "react-i18next";

const LANGUAGE_KEY = "simcorex-language";

type LanguageOption = {
  code: string;
  labelKey: string;
  icon: string;
};

const languages: LanguageOption[] = [
  { code: "en", labelKey: "language.english", icon: "/usa.svg" },
  { code: "es", labelKey: "language.spanish", icon: "/spain.svg" },
  { code: "pt", labelKey: "language.portuguese", icon: "/brasil.svg" },
];

export function LanguageSwitcher() {
  const { t, i18n } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [dropUp, setDropUp] = useState(false);

  const activeLanguage = i18n.resolvedLanguage ?? i18n.language;

  const selectedLanguage = useMemo(
    () => languages.find((lang) => lang.code === activeLanguage) ?? languages[0],
    [activeLanguage]
  );

  const handleLanguageChange = (code: string) => {
    i18n.changeLanguage(code);
    window.localStorage.setItem(LANGUAGE_KEY, code);
    setIsOpen(false);
  };

  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => {
          if (!isOpen && containerRef.current) {
            const { bottom, top } = containerRef.current.getBoundingClientRect();
            const spaceBelow = window.innerHeight - bottom;
            const spaceAbove = top;
            setDropUp(spaceBelow < 180 && spaceAbove > spaceBelow);
          }
          setIsOpen((prev) => !prev);
        }}
        className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold text-primary-200 transition hover:bg-primary-900/60 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary-400"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
      >
        <span className="flex items-center gap-2">
          <Image
            src={selectedLanguage.icon}
            alt={t(selectedLanguage.labelKey)}
            width={20}
            height={20}
            className="rounded-full"
          />
          <span>{t(selectedLanguage.labelKey)}</span>
        </span>
        <CaretDownIcon
          size={18}
          weight="bold"
          className={cn(
            "ml-auto text-primary-300 transition-transform",
            isOpen && "rotate-180"
          )}
          aria-hidden
        />
      </button>

      {isOpen && (
        <div
          className={cn(
            "absolute z-20 w-full rounded-xl border border-primary-800/70 bg-primary-950/95 shadow-lg backdrop-blur",
            dropUp ? "-translate-y-2 pb-2" : "translate-y-2 pt-2"
          )}
          style={{
            left: 0,
            right: 0,
            top: dropUp ? undefined : "100%",
            bottom: dropUp ? "100%" : undefined,
          }}
          role="listbox"
          aria-label={t("nav.language")}
        >
          <ul className="flex flex-col py-1">
            {languages.map((language) => {
              const isActive = language.code === activeLanguage;

              return (
                <li key={language.code}>
                  <button
                    type="button"
                    onClick={() => handleLanguageChange(language.code)}
                    className={cn(
                      "flex w-full items-center gap-3 px-3 py-2 text-sm transition",
                      isActive
                        ? "bg-secondary-500/15 text-secondary-200"
                        : "text-primary-100 hover:bg-primary-800"
                    )}
                    role="option"
                    aria-selected={isActive}
                  >
                    <Image
                      src={language.icon}
                      alt={t(language.labelKey)}
                      width={20}
                      height={20}
                      className="rounded-full"
                    />
                    <span className="font-semibold">{t(language.labelKey)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
