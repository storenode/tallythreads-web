import type { ElementType, ReactNode } from "react";

type Size = "sm" | "md" | "lg";

const sizeClasses: Record<Size, string> = {
  sm: "text-sm font-medium",
  md: "text-base font-medium",
  lg: "text-xl font-semibold",
};

const defaultTag: Record<Size, ElementType> = {
  sm: "h4",
  md: "h4",
  lg: "h2",
};

interface PageHeadingProps {
  children: ReactNode;
  size?: Size;
  /** Adds the bordered "section heading" treatment (border-b + padded wrapper). */
  divider?: boolean;
  as?: ElementType;
  className?: string;
  /** Trailing content (e.g. a button) rendered to the right of the heading. */
  action?: ReactNode;
}

export function PageHeading({
  children,
  size = "lg",
  divider = false,
  as,
  className = "",
  action,
}: PageHeadingProps) {
  const Tag = as ?? defaultTag[size];

  const heading = (
    <Tag
      className={`font-display text-fg ${sizeClasses[size]} ${className}`}
    >
      {children}
    </Tag>
  );

  const content = action ? (
    <div className="flex items-center justify-between gap-3">
      {heading}
      {action}
    </div>
  ) : (
    heading
  );

  if (!divider) return content;

  return (
    <div className="w-full border-b border-border px-2.5 pb-4">
      {content}
    </div>
  );
}
