import {
  forwardRef,
  useId,
  useState,
  type InputHTMLAttributes,
  type ReactNode,
} from "react";

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

const BASE_INPUT_CLASSES =
  "h-11 w-full rounded-lg border border-border bg-transparent py-2.5 text-sm text-fg " +
  "placeholder:text-fg-muted focus:border-brand focus:ring-brand/10 focus:ring-3 focus:outline-hidden " +
  "disabled:cursor-not-allowed disabled:border-border/60 disabled:placeholder:text-fg-muted/60";

const BASE_SELECT_CLASSES =
  "h-full appearance-none border-0 bg-transparent bg-none pr-8 pl-3.5 text-sm leading-tight text-fg-muted " +
  "focus:border-brand focus:ring-brand/10 focus:ring-3 focus:outline-hidden disabled:cursor-not-allowed";

export interface InputSelectOption {
  value: string;
  label: ReactNode;
}

interface InputSelectGroupProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "defaultValue"> {
  label?: ReactNode;
  options: InputSelectOption[];
  /** Controlled selected option value. */
  selectValue?: string;
  /** Initial selected option value when uncontrolled. */
  defaultSelectValue?: string;
  onSelectChange?: (value: string) => void;
  selectAriaLabel?: string;
  /** Which side the attached dropdown sits on (default "left"). */
  dropdownAlign?: "left" | "right";
  value?: string;
  defaultValue?: string;
  className?: string;
  selectClassName?: string;
}

/**
 * InputSelectGroup
 *
 * A text input with an attached inline <select>, e.g. a value plus its
 * type/unit/role — same pattern as a phone field's country-code dropdown,
 * generalized beyond phone numbers. The dropdown can sit on either side.
 */
export const InputSelectGroup = forwardRef<HTMLInputElement, InputSelectGroupProps>(
  function InputSelectGroup(
    {
      label,
      options,
      selectValue,
      defaultSelectValue,
      onSelectChange,
      selectAriaLabel = "Select option",
      dropdownAlign = "left",
      id,
      className = "",
      selectClassName = "",
      ...rest
    },
    ref,
  ) {
    const [internalValue, setInternalValue] = useState(
      defaultSelectValue ?? options[0]?.value,
    );
    const isControlled = selectValue !== undefined;
    const selected = isControlled ? selectValue : internalValue;

    const autoId = useId();
    const inputId = id || autoId;
    const isLeft = dropdownAlign === "left";

    function handleSelectChange(e: React.ChangeEvent<HTMLSelectElement>) {
      const next = e.target.value;
      if (!isControlled) setInternalValue(next);
      onSelectChange?.(next);
    }

    const dropdown = (
      <div
        className={`absolute inset-y-0 flex items-stretch ${isLeft ? "left-0" : "right-0"}`}
      >
        <select
          value={selected}
          onChange={handleSelectChange}
          disabled={rest.disabled}
          aria-label={selectAriaLabel}
          className={`${BASE_SELECT_CLASSES} ${
            isLeft
              ? "rounded-l-lg border-r border-border"
              : "rounded-r-lg border-l border-border"
          } ${selectClassName}`}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-fg-muted">
          <ChevronIcon />
        </div>
      </div>
    );

    return (
      <div>
        {label && (
          <label
            htmlFor={inputId}
            className="mb-1.5 block text-sm font-medium text-fg-muted"
          >
            {label}
          </label>
        )}

        <div className="relative">
          {isLeft && dropdown}
          <input
            ref={ref}
            id={inputId}
            className={`${BASE_INPUT_CLASSES} ${
              isLeft ? "pl-[104px] pr-4" : "pr-[104px] pl-4"
            } ${className}`}
            {...rest}
          />
          {!isLeft && dropdown}
        </div>
      </div>
    );
  },
);
