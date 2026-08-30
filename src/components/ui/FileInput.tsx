import {
  forwardRef,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type InputHTMLAttributes,
  type ReactNode,
} from "react";
import { UploadCloud } from "lucide-react";

/* ------------------------------------------------------------------ */
/* Shared helpers                                                      */
/* ------------------------------------------------------------------ */

function fileNames(files: FileList | null): string {
  if (!files || files.length === 0) return "No file chosen";
  if (files.length === 1) return files[0].name;
  return `${files.length} files selected`;
}

interface CommonProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "onChange"> {
  label?: ReactNode;
  /** Fires with the raw FileList (or null when cleared). */
  onChange?: (files: FileList | null) => void;
  error?: string;
  hint?: ReactNode;
}

/* ------------------------------------------------------------------ */
/* FileInput — the compact <input type="file"> variant                */
/* ------------------------------------------------------------------ */

const INPUT_BASE =
  "h-11 w-full overflow-hidden rounded-lg border bg-transparent text-sm text-fg-muted " +
  "shadow-sm transition-colors focus:outline-hidden focus:border-brand";

const FILE_BUTTON =
  "file:mr-5 file:cursor-pointer file:rounded-l-lg file:border-0 file:border-r " +
  "file:border-solid file:border-border file:bg-surface-2 file:py-3 file:pl-3.5 file:pr-3 " +
  "file:text-sm file:text-fg";

export const FileInput = forwardRef<HTMLInputElement, CommonProps>(
  function FileInput(
    { label, onChange, error, hint, className = "", disabled, id, ...rest },
    ref,
  ) {
    const autoId = useId();
    const inputId = id || autoId;
    const [selected, setSelected] = useState<FileList | null>(null);

    const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
      setSelected(e.target.files);
      onChange?.(e.target.files);
    };

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

        <input
          ref={ref}
          id={inputId}
          type="file"
          disabled={disabled}
          onChange={handleChange}
          aria-invalid={error ? true : undefined}
          className={[
            INPUT_BASE,
            FILE_BUTTON,
            error ? "border-error-text" : "border-border",
            disabled
              ? "cursor-not-allowed opacity-60"
              : "hover:file:bg-surface-2/70",
            className,
          ].join(" ")}
          {...rest}
        />

        <p className="mt-1.5 text-xs text-fg-muted">{fileNames(selected)}</p>

        {error ? (
          <p className="mt-1.5 text-sm text-error-text">{error}</p>
        ) : (
          hint && <p className="mt-1.5 text-xs text-fg-muted">{hint}</p>
        )}
      </div>
    );
  },
);

/* ------------------------------------------------------------------ */
/* Dropzone — the large drag-and-drop variant                         */
/* ------------------------------------------------------------------ */

export function Dropzone({
  label,
  onChange,
  error,
  hint,
  accept,
  multiple,
  disabled,
  className = "",
  id,
}: CommonProps) {
  const autoId = useId();
  const inputId = id || autoId;
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [selected, setSelected] = useState<FileList | null>(null);

  const commit = (files: FileList | null) => {
    setSelected(files);
    onChange?.(files);
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    if (disabled) return;
    const dropped = e.dataTransfer.files;
    if (!dropped || dropped.length === 0) return;

    // Honour single-select: keep only the first file when `multiple` is off.
    let files = dropped;
    if (!multiple && dropped.length > 1) {
      const dt = new DataTransfer();
      dt.items.add(dropped[0]);
      files = dt.files;
    }
    if (inputRef.current) inputRef.current.files = files;
    commit(files);
  };

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

      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled || undefined}
        onClick={() => !disabled && inputRef.current?.click()}
        onKeyDown={(e) => {
          if (!disabled && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={[
          "flex min-h-40 flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-6 py-6 text-center transition-colors",
          error ? "border-error-text" : "border-border",
          disabled
            ? "cursor-not-allowed opacity-60"
            : "cursor-pointer hover:border-brand hover:bg-surface-2/50",
          dragging ? "border-brand bg-brand-subtle-bg" : "",
          className,
        ].join(" ")}
      >
        <UploadCloud className="text-fg-muted" size={28} aria-hidden />
        <p className="text-sm text-fg">
          <span className="font-medium text-brand">Click to upload</span> or drag
          and drop
        </p>
        <p className="text-xs text-fg-muted">{fileNames(selected)}</p>

        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept={accept}
          multiple={multiple}
          disabled={disabled}
          className="hidden"
          onChange={(e) => commit(e.target.files)}
        />
      </div>

      {error ? (
        <p className="mt-1.5 text-sm text-error-text">{error}</p>
      ) : (
        hint && <p className="mt-1.5 text-xs text-fg-muted">{hint}</p>
      )}
    </div>
  );
}
