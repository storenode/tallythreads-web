import { Loader2 } from "lucide-react";

export function Spinner({
  size = 20,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  return (
    <Loader2
      size={size}
      className={`animate-spin text-tt-green-600 ${className}`}
      aria-hidden
    />
  );
}
