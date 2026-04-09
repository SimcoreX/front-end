import { cn } from "@/lib/classNames";
import type { ComponentPropsWithoutRef, CSSProperties, ElementType } from "react";

type SkeletonMode = "round" | "block" | "line";

type SkeletonProps<T extends ElementType = "div"> = {
  as?: T;
  mode?: SkeletonMode;
  width?: string | number;
  height?: string | number;
  className?: string;
  style?: CSSProperties;
} & Omit<ComponentPropsWithoutRef<T>, "as" | "className" | "children" | "style">;

export function Skeleton<T extends ElementType = "div">({
  as,
  mode = "block",
  width,
  height,
  className,
  style,
  ...props
}: SkeletonProps<T>) {
  const Component = as ?? "div";
  let shapeClasses = "";
  let resolvedHeight = height;

  switch (mode) {
    case "round":
      shapeClasses = "rounded-full";
      break;
    case "block":
      shapeClasses = "rounded-md";
      break;
    case "line":
      shapeClasses = "rounded-sm";
      resolvedHeight = resolvedHeight ?? "16px";
      break;
  }

  const inlineStyle: CSSProperties = {
    ...style,
    ...(width !== undefined
      ? { width: typeof width === "number" ? `${width}px` : width }
      : null),
    ...(resolvedHeight !== undefined
      ? { height: typeof resolvedHeight === "number" ? `${resolvedHeight}px` : resolvedHeight }
      : null),
  };

  return (
    <Component
      aria-hidden
      className={cn("animate-pulse bg-gray-300 dark:bg-gray-700", shapeClasses, className)}
      style={inlineStyle}
      {...props}
    />
  );
}
