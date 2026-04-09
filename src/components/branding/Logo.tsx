import { cn } from "@/lib/classNames";
import Image from "next/image";

type LogoProps = {
  size?: "xs" | "sm" | "md" | "lg";
  className?: string;
};

const sizeStyles = {
  xs: {
    wrapper: "gap-1.5",
    icon: "h-5 w-5",
    text: "text-base tracking-[0.2em]",
  },
  sm: {
    wrapper: "gap-2",
    icon: "h-8 w-8",
    text: "text-[1.35rem] tracking-[0.22em]",
  },
  md: {
    wrapper: "gap-2.5",
    icon: "h-9 w-9",
    text: "text-[1.8rem] tracking-[0.26em]",
  },
  lg: {
    wrapper: "gap-3",
    icon: "h-11 w-11",
    text: "text-[2.25rem] tracking-[0.28em]",
  },
};

export function Logo({ size = "md", className }: LogoProps) {
  return (
    <div className={cn("inline-flex items-center", sizeStyles[size].wrapper, className)}>
      <Image
        src="/simcorex-logo-only.png"
        alt="Simcorex"
        width={36}
        height={36}
        className={cn("object-contain", sizeStyles[size].icon)}
        priority
      />
      <span className={cn("font-display font-bold text-white", sizeStyles[size].text)}>SIMCOREX</span>
    </div>
  );
}
