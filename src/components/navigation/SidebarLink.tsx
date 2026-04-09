"use client";

import { cn } from "@/lib/classNames";
import type { IconProps } from "@phosphor-icons/react";
import type { ComponentType } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslation } from "react-i18next";

type SidebarLinkProps = {
  href: string;
  labelKey: string;
  Icon: ComponentType<IconProps>;
  onClick?: () => void;
  disabled?: boolean;
};

export function SidebarLink({ href, labelKey, Icon, onClick, disabled = false }: SidebarLinkProps) {
  const pathname = usePathname();
  const { t } = useTranslation();
  const isActive = pathname === href;

  if (disabled) {
    return (
      <span
        className="flex items-center gap-3 rounded-xl border border-primary-800/60 px-3 py-2 text-sm font-medium text-primary-500/80 opacity-65"
        aria-disabled="true"
      >
        <Icon size={20} weight="duotone" />
        {t(labelKey)}
      </span>
    );
  }

  return (
    <Link
      href={href}
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition",
        isActive
          ? "bg-[#2E5C8A]/20 text-white shadow-[0_10px_26px_rgba(46,92,138,0.25)] border border-[#2E5C8A]/60"
          : "text-primary-200 hover:bg-primary-900/60 hover:text-white"
      )}
      aria-current={isActive ? "page" : undefined}
    >
      <Icon size={20} weight="duotone" />
      {t(labelKey)}
    </Link>
  );
}
