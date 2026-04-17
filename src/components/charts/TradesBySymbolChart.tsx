"use client";

import { cn } from "@/lib/classNames";
import { useEffect, useMemo, useState } from "react";

type TradesBySymbolChartProps = {
  data: number[];
  labels: string[];
  valueSuffix?: string;
  color?: string;
};

export function TradesBySymbolChart({ data, labels, valueSuffix = "", color = "#1D9BF0" }: TradesBySymbolChartProps) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [isAnimated, setIsAnimated] = useState(false);
  const max = Math.max(0, ...data);
  const denominator = max <= 0 ? 1 : max;
  const animationSeed = useMemo(() => `${labels.join("|")}::${data.join("|")}::${valueSuffix}`, [data, labels, valueSuffix]);

  useEffect(() => {
    setIsAnimated(false);
    const frame = window.requestAnimationFrame(() => {
      setIsAnimated(true);
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [animationSeed]);

  const formatValue = (value: number) => (valueSuffix ? `${value}${valueSuffix}` : `${value}`);

  return (
    <div className="relative h-full w-full">
      <div className="flex h-52 flex-col justify-center gap-2">
        {data.map((value, idx) => {
          const normalizedValue = Math.max(0, Number(value) || 0);
          const widthPercent = Math.max(0, Math.min(100, (normalizedValue / denominator) * 100));
          const isHover = hoverIdx === idx;

          return (
            <div
              key={`${labels[idx]}-${idx}`}
              className="flex items-center gap-2"
              onMouseEnter={() => setHoverIdx(idx)}
              onMouseLeave={() => setHoverIdx(null)}
            >
              <span className="w-16 truncate text-[10px] font-semibold uppercase tracking-wide text-primary-300">
                {labels[idx]}
              </span>

              <div
                className={cn(
                  "relative h-6 flex-1 overflow-hidden rounded-r-lg",
                  isHover && "border border-white/70"
                )}
                aria-label={`${labels[idx]}: ${formatValue(normalizedValue)}`}
              >
                <div
                  className="h-full rounded-r-lg"
                  style={{
                    width: `${widthPercent}%`,
                    transformOrigin: "left",
                    transform: isAnimated ? "scaleX(1)" : "scaleX(0)",
                    transition: `transform 650ms cubic-bezier(0.2, 0.9, 0.2, 1) ${idx * 55}ms`,
                    backgroundImage: `linear-gradient(to right, ${color}08 0%, ${color}50 40%, ${color}CC 75%, ${color}FF 100%)`,
                    opacity: isHover ? 1 : 0.82,
                    boxShadow: isHover
                      ? `inset 0 1px 0 rgba(255,255,255,0.3), 0 0 18px ${color}50`
                      : `inset 0 1px 0 rgba(255,255,255,0.12)`,
                  }}
                />
              </div>

              <span className="w-10 text-right text-xs font-semibold text-primary-100">{formatValue(normalizedValue)}</span>
            </div>
          );
        })}
      </div>

      {hoverIdx !== null && (
        <div className="pointer-events-none absolute -top-10 left-0 flex w-full justify-center">
          <div className="rounded-xl border border-[#2E5C8A]/50 bg-[#1B314B] px-3 py-2 text-xs text-white shadow-[0_12px_28px_rgba(0,0,0,0.35)]">
            <div className="font-semibold text-white">{labels[hoverIdx]}</div>
            <div className="text-primary-100">{formatValue(data[hoverIdx])}</div>
          </div>
        </div>
      )}
    </div>
  );
}
