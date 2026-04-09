import { cn } from "@/lib/classNames";
import type { ReactNode } from "react";

type PageTitleProps = {
  children: ReactNode;
  className?: string;
};

export function PageTitle({ children, className }: PageTitleProps) {
  return (
    <h1 className={cn("font-display text-3xl font-semibold", className)}>
      {children}
    </h1>
  );
}
