"use client";

import { cn } from "@/lib/classNames";
import type { ChangeEvent, SelectHTMLAttributes } from "react";
import { useEffect, useRef, useState } from "react";

type SelectOption = {
  value: string;
  label: string;
};

type SelectFieldProps = SelectHTMLAttributes<HTMLSelectElement> & {
  label: string;
  options: SelectOption[];
};

export function SelectField({ label, options, className, id, ...props }: SelectFieldProps) {
  const selectId = id ?? props.name;
  const wrapperRef = useRef<HTMLLabelElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const value = typeof props.value === "string" ? props.value : "";
  const activeLabel = options.find((option) => option.value === value)?.label ?? "Selecione...";

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (!wrapperRef.current) return;
      if (!wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const handleSelect = (nextValue: string) => {
    setIsOpen(false);
    if (!props.onChange) return;
    const syntheticEvent = { target: { value: nextValue } } as ChangeEvent<HTMLSelectElement>;
    props.onChange(syntheticEvent);
  };

  return (
    <label ref={wrapperRef} className="relative flex flex-col gap-2 text-sm text-primary-100">
      <span className="font-medium">{label}</span>
      <button
        id={selectId}
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className={cn(
          "flex w-full items-center justify-between gap-3 rounded-xl border border-secondary-500/40 bg-primary-900/60 px-4 py-3 text-left text-white outline-none transition focus-visible:border-secondary-400 focus-visible:ring-2 focus-visible:ring-secondary-500/30",
          !value && "text-primary-300",
          className
        )}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <span>{activeLabel}</span>
        <ChevronDown />
      </button>
      {props.name && <input type="hidden" name={props.name} value={value} />}
      {isOpen && (
        <div className="absolute left-0 top-full z-20 mt-2 w-full min-w-55 rounded-2xl border border-[#2E5C8A]/50 bg-[#1B314B] p-2 shadow-[0_14px_32px_rgba(0,0,0,0.35)]">
          <div className="max-h-56 overflow-auto py-1">
            {options.map((option) => {
              const isSelected = option.value === value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => handleSelect(option.value)}
                  className={cn(
                    "flex w-full items-center rounded-lg px-3 py-2 text-sm font-semibold transition",
                    isSelected
                      ? "bg-[#2E5C8A]/45 text-white"
                      : "text-primary-100 hover:bg-[#2E5C8A]/25"
                  )}
                  role="option"
                  aria-selected={isSelected}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </label>
  );
}

function ChevronDown() {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      className="h-4 w-4 text-primary-200"
      aria-hidden
    >
      <path d="M5 7.5L10 12.5L15 7.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
