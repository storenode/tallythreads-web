import { forwardRef, useId, type ReactNode, type SelectHTMLAttributes } from "react";

function ChevronIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      className="stroke-current"
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <path
        d="M4.79175 7.396L10.0001 12.6043L15.2084 7.396"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const BASE_CLASSES =
  "h-11 w-full appearance-none rounded-lg border border-border bg-transparent bg-none px-4 py-2.5 " +
  "pr-11 text-sm focus:border-brand focus:ring-brand/10 focus:ring-3 focus:outline-hidden " +
  "disabled:cursor-not-allowed disabled:border-border/60 disabled:text-fg-muted/60";

export interface SingleSelectOption {
  value: string;
  label: ReactNode;
  disabled?: boolean;
}

interface SingleSelectProps
  extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "value" | "defaultValue"> {
  label?: ReactNode;
  options: readonly (string | SingleSelectOption)[];
  /** First (disabled) option shown when nothing is selected; pass `null` to omit it. */
  placeholder?: string | null;
  hint?: ReactNode;
  error?: boolean;
  value?: string;
  defaultValue?: string;
  className?: string;
}

/**
 * SingleSelect
 *
 * Reusable <select>: same border/focus/appearance-none styling as the
 * rest of this app's form fields, with the chevron-down icon positioned
 * absolutely inside the field.
 *
 * It extends the native <select> element — every standard select prop
 * (value, onChange, name, disabled, required, onBlur, etc.) is forwarded
 * via {...rest}, and the DOM node is exposed through `ref`.
 *
 * The placeholder option renders muted text, and the field switches to
 * the normal solid text color once a real option is chosen — driven by
 * whether the current value is empty, so it works whether the select is
 * controlled or uncontrolled.
 *
 * Usage:
 *   <SingleSelect
 *     label="Role"
 *     placeholder="Select Role"
 *     options={["Owner", "Manager", "Accountant"]}
 *     value={role}
 *     onChange={(e) => setRole(e.target.value)}
 *   />
 *
 *   <SingleSelect
 *     label="Scope"
 *     options={[
 *       { value: "organization", label: "Organization" },
 *       { value: "store", label: "Store" },
 *     ]}
 *     defaultValue="organization"
 *   />
 */
export const SingleSelect = forwardRef<HTMLSelectElement, SingleSelectProps>(
  function SingleSelect(
    {
      label,
      options,
      placeholder = "Select Option",
      hint,
      error = false,
      id,
      className = "",
      value,
      defaultValue,
      ...rest
    },
    ref,
  ) {
    const autoId = useId();
    const selectId = id || autoId;

    const currentValue = value !== undefined ? value : defaultValue;
    const hasValue =
      currentValue !== undefined && currentValue !== null && currentValue !== "";

    const normalizedOptions: SingleSelectOption[] = options.map((opt) =>
      typeof opt === "string" ? { value: opt, label: opt } : opt,
    );

    const textColorClasses = hasValue ? "text-fg" : "text-fg-muted";

    return (
      <div>
        {label && (
          <label
            htmlFor={selectId}
            className="mb-1.5 block text-sm font-medium text-fg-muted"
          >
            {label}
          </label>
        )}

        <div className="relative z-20 bg-transparent">
          <select
            ref={ref}
            id={selectId}
            value={value}
            defaultValue={defaultValue}
            className={`${BASE_CLASSES} ${textColorClasses} ${className}`}
            {...rest}
          >
            {placeholder !== null && (
              <option value="" disabled>
                {placeholder}
              </option>
            )}
            {normalizedOptions.map((opt) => (
              <option key={opt.value} value={opt.value} disabled={opt.disabled}>
                {opt.label}
              </option>
            ))}
          </select>

          <span className="pointer-events-none absolute top-1/2 right-4 z-30 -translate-y-1/2 text-fg-muted">
            <ChevronIcon />
          </span>
        </div>

        {hint && (
          <p
            className={`mt-1.5 text-xs ${error ? "text-error-text" : "text-fg-muted"}`}
          >
            {hint}
          </p>
        )}
      </div>
    );
  },
);
