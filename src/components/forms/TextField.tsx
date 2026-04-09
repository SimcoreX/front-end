"use client";

import { cn } from "@/lib/classNames";
import type { InputHTMLAttributes } from "react";

type TextFieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
};

export function TextField({ label, className, id, ...props }: TextFieldProps) {
  const inputId = id ?? props.name;

  return (
    <label className="flex flex-col gap-2 text-sm text-primary-100">
      <span className="font-medium">{label}</span>
      <input
        id={inputId}
        className={cn(
          "rounded-xl border border-secondary-500/40 bg-primary-900/60 px-4 py-3 text-white placeholder:text-primary-400 outline-none transition focus:border-secondary-400 focus:ring-2 focus:ring-secondary-500/30",
          className
        )}
        {...props}
      />
    </label>
  );
}
