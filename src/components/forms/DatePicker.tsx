"use client";

import { cn } from "@/lib/classNames";
import type { ChangeEvent, InputHTMLAttributes } from "react";
import { useEffect, useRef, useState } from "react";

type DatePickerProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  isOpen?: boolean;
  onOpenChange?: (isOpen: boolean) => void;
  openToDate?: string;
};

export function DatePicker({
  label,
  className,
  id,
  isOpen: controlledIsOpen,
  onOpenChange,
  openToDate,
  ...props
}: DatePickerProps) {
  const inputId = id ?? props.name;
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [internalIsOpen, setInternalIsOpen] = useState(false);
  const isOpen = controlledIsOpen ?? internalIsOpen;
  const value = typeof props.value === "string" ? props.value : "";
  const displayValue = value ? formatDisplay(value) : props.placeholder ?? "Selecione...";
  const [viewDate, setViewDate] = useState(() => {
    const initial = openToDate || value;
    return initial ? new Date(`${initial}T00:00:00`) : new Date();
  });

  const setOpen = (nextIsOpen: boolean) => {
    if (controlledIsOpen === undefined) {
      setInternalIsOpen(nextIsOpen);
    }
    onOpenChange?.(nextIsOpen);
  };

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (!wrapperRef.current) return;
      if (!wrapperRef.current.contains(event.target as Node)) {
        if (controlledIsOpen === undefined) {
          setInternalIsOpen(false);
        }
        onOpenChange?.(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [controlledIsOpen, onOpenChange]);

  const days = buildCalendarDays(viewDate, value);

  const handleDaySelect = (nextDate: string) => {
    setOpen(false);
    if (!props.onChange) return;
    const syntheticEvent = { target: { value: nextDate } } as ChangeEvent<HTMLInputElement>;
    props.onChange(syntheticEvent);
  };

  return (
    <div ref={wrapperRef} className="relative flex flex-col gap-2 text-sm text-primary-100">
      <span className="font-medium">{label}</span>
      <button
        id={inputId}
        type="button"
        onClick={() => {
          if (!isOpen) {
            const anchorDate = openToDate || value;
            if (anchorDate) {
              setViewDate(new Date(`${anchorDate}T00:00:00`));
            }
          }
          setOpen(!isOpen);
        }}
        className={cn(
          "flex w-full items-center justify-between gap-3 rounded-xl border border-secondary-500/40 bg-primary-900/60 px-4 py-3 text-left text-white outline-none transition focus-visible:border-secondary-400 focus-visible:ring-2 focus-visible:ring-secondary-500/30",
          !value && "text-primary-300",
          className
        )}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
      >
        <span>{displayValue}</span>
        <CalendarIcon />
      </button>
      {props.name && <input type="hidden" name={props.name} value={value} />}
      {isOpen && (
        <div className="absolute left-0 top-full z-20 mt-2 w-full min-w-65 rounded-2xl border border-[#2E5C8A]/50 bg-[#1B314B] p-4 shadow-[0_14px_32px_rgba(0,0,0,0.35)]">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setViewDate((prev) => addMonths(prev, -1))}
              className="rounded-lg border border-[#2E5C8A]/50 px-2 py-1 text-xs text-primary-100 transition hover:text-white"
            >
              Prev
            </button>
            <span className="text-sm font-semibold text-white">{formatMonthYear(viewDate)}</span>
            <button
              type="button"
              onClick={() => setViewDate((prev) => addMonths(prev, 1))}
              className="rounded-lg border border-[#2E5C8A]/50 px-2 py-1 text-xs text-primary-100 transition hover:text-white"
            >
              Next
            </button>
          </div>

          <div className="mt-3 grid grid-cols-7 gap-1 text-center text-[10px] uppercase tracking-[0.2em] text-primary-200">
            {weekdays.map((day) => (
              <span key={day}>{day}</span>
            ))}
          </div>

          <div className="mt-2 grid grid-cols-7 gap-1">
            {days.map((day) => (
              <button
                key={day.key}
                type="button"
                onClick={() => handleDaySelect(day.value)}
                className={cn(
                  "flex h-9 w-full items-center justify-center rounded-lg text-xs font-semibold transition",
                  day.isCurrentMonth ? "text-white" : "text-primary-300",
                  day.isSelected
                    ? "bg-[#2E5C8A]/45 text-white"
                    : "hover:bg-[#2E5C8A]/25"
                )}
              >
                {day.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function CalendarIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      className="h-4 w-4 text-primary-300"
      aria-hidden
    >
      <path
        d="M6 3V6M14 3V6M4 8.5H16M5 6H15C15.5523 6 16 6.44772 16 7V15C16 15.5523 15.5523 16 15 16H5C4.44772 16 4 15.5523 4 15V7C4 6.44772 4.44772 6 5 6Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

type CalendarDay = {
  key: string;
  label: number;
  value: string;
  isCurrentMonth: boolean;
  isSelected: boolean;
};

function buildCalendarDays(viewDate: Date, selectedValue: string): CalendarDay[] {
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const startOffset = firstDay.getDay();
  const totalDays = 42;
  const days: CalendarDay[] = [];
  const selected = selectedValue ? new Date(`${selectedValue}T00:00:00`) : null;

  for (let i = 0; i < totalDays; i += 1) {
    const date = new Date(year, month, 1 - startOffset + i);
    const isCurrentMonth = date.getMonth() === month;
    const value = toISODate(date);
    days.push({
      key: value,
      label: date.getDate(),
      value,
      isCurrentMonth,
      isSelected: selected ? toISODate(selected) === value : false,
    });
  }

  return days;
}

function addMonths(date: Date, delta: number) {
  const year = date.getFullYear();
  const month = date.getMonth();
  return new Date(year, month + delta, 1);
}

function formatMonthYear(date: Date) {
  const month = date.toLocaleString("en-US", { month: "long" });
  return `${month} ${date.getFullYear()}`;
}

function formatDisplay(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return value;
  return `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}/${year}`;
}

function toISODate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
