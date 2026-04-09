"use client";

import { cn } from "@/lib/classNames";
import { Spinner } from "@/components/ui/Spinner";
import type { ButtonHTMLAttributes, CSSProperties } from "react";

type ButtonVariant = "primary" | "secondary" | "destructive" | "inactive" | "light";
type ButtonSize = "sm" | "md" | "lg";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
};

const variantStyles: Record<ButtonVariant, string> = {
  primary:
    "border border-transparent bg-white text-primary-950 hover:bg-primary-100 focus-visible:ring-secondary-400",
  secondary:
    "border border-transparent bg-secondary-500 text-primary-950 hover:bg-secondary-400 focus-visible:ring-secondary-300",
  destructive:
    "border border-transparent bg-red-500 text-white hover:bg-red-400 focus-visible:ring-red-300",
  inactive: "border border-transparent bg-primary-800 text-primary-300",
  light:
    "border border-primary-200 bg-white text-black hover:bg-primary-100 hover:text-black focus-visible:ring-secondary-400",
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: "h-9 px-4 text-xs",
  md: "h-12 px-5 text-sm",
  lg: "h-14 px-6 text-base",
};

export function Button({
  variant = "primary",
  size = "md",
  isLoading = false,
  className,
  children,
  disabled,
  style,
  ...props
}: ButtonProps) {
  const isDisabled = disabled || isLoading || variant === "inactive";
  const inlineStyle: CSSProperties | undefined =
    variant === "light"
      ? {
          backgroundColor: "#ffffff",
          color: "#000000",
          borderColor: "#e5e7eb", // tailwind border-primary-200
          ...style,
        }
      : style;

  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition focus-visible:outline-none focus-visible:ring-2",
        variantStyles[variant],
        sizeStyles[size],
        isDisabled && "cursor-not-allowed opacity-70",
        className
      )}
      disabled={isDisabled}
      style={inlineStyle}
      {...props}
    >
      {isLoading && <Spinner className="h-4 w-4" />}
      <span>{children}</span>
    </button>
  );
}
