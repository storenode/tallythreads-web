const sizeClasses = {
  sm: { mark: "size-8 sm:size-9", text: "text-xl sm:text-2xl" },
  md: { mark: "size-11 sm:size-14", text: "text-2xl sm:text-3xl" },
  lg: { mark: "size-16 sm:size-20", text: "text-3xl sm:text-4xl" },
} as const;

export function Logo({
  size = "sm",
  className = "",
}: {
  size?: keyof typeof sizeClasses;
  className?: string;
}) {
  const { mark, text } = sizeClasses[size];

  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <img
        src="/logo-mark.svg"
        alt=""
        className={`${mark} shrink-0 transition-transform duration-300 hover:scale-105`}
      />
      <span className={`font-script leading-none ${text}`}>
        <span className="text-tt-green-500">Tally</span>
        <span className="text-tt-lavender-500">Threads</span>
      </span>
    </span>
  );
}
