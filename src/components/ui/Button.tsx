import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost";
type Size = "sm" | "md" | "lg" | "xl";

const variantClasses: Record<Variant, string> = {
  primary:
    "bg-tt-green-500 text-white hover:enabled:bg-tt-green-600 shadow-sm shadow-tt-green-500/20 disabled:bg-fg-muted disabled:text-bg disabled:shadow-none",
  secondary:
    "bg-tt-lavender-500 text-white hover:enabled:bg-tt-lavender-600 shadow-sm shadow-tt-lavender-500/20 disabled:bg-fg-muted disabled:text-bg disabled:shadow-none",
  ghost:
    "bg-transparent text-fg border border-border hover:enabled:bg-surface-2 disabled:text-fg-muted disabled:border-border/60",
};

const sizeClasses: Record<Size, string> = {
  sm: "min-h-9 px-4 text-xs",
  md: "min-h-11 px-5 text-sm",
  lg: "min-h-14 px-7 text-base",
  xl: "min-h-16 px-9 text-lg",
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  children: ReactNode;
}

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={`inline-flex cursor-pointer items-center justify-center gap-2 rounded-full font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-70 ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
