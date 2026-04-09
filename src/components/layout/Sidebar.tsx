"use client";

import { Logo } from "@/components/branding/Logo";
import { SidebarLink } from "@/components/navigation/SidebarLink";
import { LanguageSwitcher } from "@/components/navigation/LanguageSwitcher";
import { NAV_ITEMS } from "@/constants/navigation";
import { useAuthActions } from "@/hooks/useAuthActions";
import { cn } from "@/lib/classNames";
import { useAuthStore } from "@/stores/authStore";
import {
  SignOut as SignOutIcon,
  UserCircle as UserCircleIcon,
  List as ListIcon,
  X as XIcon,
} from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { useState } from "react";

export function Sidebar() {
  const router = useRouter();
  const { t } = useTranslation();
  const { logoutAction } = useAuthActions();
  const userStatus = useAuthStore((state) => state.userStatus);
  const [isOpen, setIsOpen] = useState(false);
  const isInactiveUser = userStatus?.toUpperCase() === "INACTIVE";
  const isMobileMenuOpen = isInactiveUser || isOpen;

  const closeMobileMenu = () => {
    if (isInactiveUser) return;
    setIsOpen(false);
  };

  const handleLogout = async () => {
    closeMobileMenu();
    await logoutAction();
    router.push("/login");
  };

  return (
    <>
      <aside className="hidden w-full flex-col border-b border-primary-800/70 bg-primary-950 px-6 py-6 lg:flex lg:w-64 lg:border-b-0 lg:border-r lg:py-8 lg:min-h-screen lg:h-auto lg:sticky lg:top-0">
        <Logo size="sm" />

        <nav className="mt-10 flex flex-1 flex-col gap-2">
          {NAV_ITEMS.map((item) => (
            <SidebarLink
              key={item.href}
              href={item.href}
              labelKey={item.key}
              Icon={item.Icon}
              disabled={isInactiveUser}
            />
          ))}
        </nav>

        <div className="mt-6 flex flex-col gap-4">
          <SidebarLink
            href="/profile"
            labelKey="nav.profile"
            Icon={UserCircleIcon}
            disabled={isInactiveUser}
          />
          <LanguageSwitcher />
          <button
            type="button"
            onClick={handleLogout}
            className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-primary-200 transition hover:bg-primary-900/60 hover:text-white"
          >
            <SignOutIcon size={20} weight="duotone" />
            {t("nav.logout")}
          </button>
        </div>
      </aside>

      {/* Mobile top bar */}
      <div className="flex items-center justify-between border-b border-primary-800/70 bg-primary-950 px-4 py-3 lg:hidden">
        <Logo size="xs" />
        <button
          type="button"
          onClick={() => {
            if (isInactiveUser) return;
            setIsOpen((prev) => !prev);
          }}
          disabled={isInactiveUser}
          className={cn(
            "flex items-center gap-2 rounded-xl border border-primary-800 px-3 py-2 text-sm font-semibold text-primary-100 transition",
            isInactiveUser
              ? "cursor-not-allowed opacity-55"
              : "hover:bg-primary-900/60 hover:text-white"
          )}
          aria-expanded={isMobileMenuOpen}
          aria-disabled={isInactiveUser}
          aria-label="Toggle menu"
        >
          {isMobileMenuOpen ? <XIcon size={18} weight="bold" /> : <ListIcon size={18} weight="bold" />}
          <span className="hidden sm:inline">Menu</span>
        </button>
      </div>

      <div
        className={cn(
          "overflow-hidden transition-[max-height,opacity] duration-300 ease-out lg:hidden",
          isMobileMenuOpen ? "max-h-[80vh] opacity-100" : "pointer-events-none max-h-0 opacity-0"
        )}
      >
        <aside
          className={cn(
            "flex w-full flex-col gap-3 border-b border-primary-800/70 bg-primary-950 px-4 py-4 shadow-lg transition-transform duration-300 ease-out",
            isMobileMenuOpen ? "translate-y-0" : "-translate-y-2"
          )}
        >
            <nav className="flex flex-col gap-2">
              {NAV_ITEMS.map((item) => (
                <SidebarLink
                  key={item.href}
                  href={item.href}
                  labelKey={item.key}
                  Icon={item.Icon}
                  onClick={closeMobileMenu}
                  disabled={isInactiveUser}
                />
              ))}
            </nav>

            <div className="flex flex-col gap-3 pt-2">
              <SidebarLink
                href="/profile"
                labelKey="nav.profile"
                Icon={UserCircleIcon}
                onClick={closeMobileMenu}
                disabled={isInactiveUser}
              />
              <LanguageSwitcher />
              <button
                type="button"
                onClick={handleLogout}
                className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-primary-200 transition hover:bg-primary-900/60 hover:text-white"
              >
                <SignOutIcon size={20} weight="duotone" />
                {t("nav.logout")}
              </button>
            </div>
          </aside>
      </div>
    </>
  );
}
