"use client";

import { cn } from "@/lib/classNames";
import { useEffect, useMemo, useState } from "react";

type TradesBySymbolChartProps = {
  data: number[];
  labels: string[];
  valueSuffix?: string;
};

export function TradesBySymbolChart({ data, labels, valueSuffix = "" }: TradesBySymbolChartProps) {
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
          const tone = getBlueScaleColor(idx, data.length);

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
                  "relative h-6 flex-1 overflow-hidden rounded-lg border border-primary-800/70 bg-primary-950/70",
                  isHover && "border-white/70"
                )}
                aria-label={`${labels[idx]}: ${formatValue(normalizedValue)}`}
              >
                <div
                  className="h-full rounded-lg"
                  style={{
                    width: `${widthPercent}%`,
                    transformOrigin: "left",
                    transform: isAnimated ? "scaleX(1)" : "scaleX(0)",
                    transition: `transform 650ms cubic-bezier(0.2, 0.9, 0.2, 1) ${idx * 55}ms, opacity 220ms ease`,
                    backgroundImage: `linear-gradient(to right, ${tone}A8 0%, ${tone}D8 65%, rgba(196,230,255,0.9) 100%)`,
                    opacity: isHover ? 1 : 0.9,
                    boxShadow: isHover
                      ? `inset 0 1px 0 rgba(255,255,255,0.55), 0 0 10px ${tone}55`
                      : "inset 0 1px 0 rgba(255,255,255,0.3)",
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

const BLUE_SCALE = ["#1F3D63", "#25537F", "#2E5C8A", "#3A71A2", "#4C87BA", "#63A1D3"];

function getBlueScaleColor(index: number, total: number) {
  if (total <= 1) return BLUE_SCALE[2];
  const position = index / (total - 1);
  const paletteIndex = Math.min(
    BLUE_SCALE.length - 1,
    Math.round(position * (BLUE_SCALE.length - 1))
  );
  return BLUE_SCALE[paletteIndex];
}
