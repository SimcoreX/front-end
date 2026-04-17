import type { IconProps } from "@phosphor-icons/react";
import type { ComponentType } from "react";
import {
  ClockCounterClockwise as ClockCounterClockwiseIcon,
  House as HouseIcon,
} from "@phosphor-icons/react";

export type NavItem = {
  key: string;
  href: string;
  Icon: ComponentType<IconProps>;
};

export const NAV_ITEMS: NavItem[] = [
  {
    key: "nav.dashboard",
    href: "/dashboard",
    Icon: HouseIcon,
  },
  {
    key: "nav.history",
    href: "/history",
    Icon: ClockCounterClockwiseIcon,
  },
];
