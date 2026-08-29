import { forwardRef, useId, type ReactNode, type TextareaHTMLAttributes } from "react";

const BASE_CLASSES =
  "w-full rounded-lg border border-border bg-transparent px-4 py-2.5 text-sm text-fg " +
  "placeholder:text-fg-muted focus:border-brand focus:outline-hidden focus:ring-3 focus:ring-brand/10 " +
  "disabled:cursor-not-allowed disabled:border-border/60 disabled:placeholder:text-fg-muted/60";

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: ReactNode;
  error?: ReactNode | boolean;
  hint?: ReactNode;
}

/** Multiline counterpart to Input.tsx — same label/hint/error shape, no inline icons
 * (a textarea's content is usually too long for a corner icon to read well). */
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, error, hint, className = "", id, rows = 4, ...rest },
  ref,
) {
  const autoId = useId();
  const textareaId = id || autoId;
  const message = (typeof error === "string" && error) || hint;

  return (
    <div>
      {label && (
        <label
          htmlFor={textareaId}
          className="mb-1.5 block text-sm font-medium text-fg-muted"
        >
          {label}
        </label>
      )}
      <textarea
        ref={ref}
        id={textareaId}
        rows={rows}
        aria-invalid={Boolean(error) || undefined}
        className={`${BASE_CLASSES} ${error ? "border-error-text focus:border-error-text focus:ring-error-text/10" : ""} ${className}`}
        {...rest}
      />
      {message && (
        <p className={`mt-1.5 text-xs ${error ? "text-error-text" : "text-fg-muted"}`}>
          {message}
        </p>
      )}
    </div>
  );
});
