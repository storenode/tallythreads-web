import { useState } from "react";
import { Image as ImageIcon, Trash2 } from "lucide-react";
import { Spinner } from "./Spinner";
import { Dropzone } from "./FileInput";

const DEFAULT_ACCEPT = "image/png,image/jpeg,image/webp";
const DEFAULT_MAX_BYTES = 2 * 1024 * 1024; // 2MB

export interface LogoUploadProps {
  label?: string;
  hint?: string;
  /** Currently stored logo URL, if any. */
  value?: string | null;
  /**
   * Uploads the chosen file wherever it belongs (org-logos bucket, a store
   * bucket, …) and resolves with the public URL to persist. Supplied by the
   * caller so this component stays entity-agnostic and reusable.
   */
  onUpload: (file: File) => Promise<string>;
  /** Called with the new public URL after a successful upload. */
  onChange?: (url: string) => void;
  /** When provided, a remove control is shown; called on click. */
  onRemove?: () => void | Promise<void>;
  disabled?: boolean;
  /** Comma-separated MIME list. Defaults to png/jpeg/webp. */
  accept?: string;
  /** Max file size in bytes. Defaults to 2MB. */
  maxBytes?: number;
}

function acceptsType(accept: string, type: string): boolean {
  return accept
    .split(",")
    .map((a) => a.trim())
    .some((a) => a === type || (a.endsWith("/*") && type.startsWith(a.slice(0, -1))));
}

function humanSize(bytes: number): string {
  return bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(0)}MB`
    : `${Math.ceil(bytes / 1024)}KB`;
}

/**
 * Preview + upload control for a single square-ish brand logo. Framework for the
 * organization edit page today; drop it into the store form later by passing a
 * store-scoped `onUpload`.
 */
export function LogoUpload({
  label = "Logo",
  hint,
  value,
  onUpload,
  onChange,
  onRemove,
  disabled = false,
  accept = DEFAULT_ACCEPT,
  maxBytes = DEFAULT_MAX_BYTES,
}: LogoUploadProps) {
  const [preview, setPreview] = useState<string | null>(value ?? null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);

  const busy = uploading || removing || disabled;

  async function handleFiles(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    setError(null);

    if (!acceptsType(accept, file.type)) {
      setError("Logo must be a PNG, JPEG, or WebP image.");
      return;
    }
    if (file.size > maxBytes) {
      setError(`Logo must be under ${humanSize(maxBytes)}.`);
      return;
    }

    const localUrl = URL.createObjectURL(file);
    setPreview(localUrl);
    setUploading(true);
    try {
      const url = await onUpload(file);
      setPreview(url);
      onChange?.(url);
    } catch (err) {
      setPreview(value ?? null);
      setError(
        err instanceof Error && err.message
          ? err.message
          : "Couldn't upload the logo.",
      );
    } finally {
      URL.revokeObjectURL(localUrl);
      setUploading(false);
    }
  }

  async function handleRemove() {
    if (!onRemove) return;
    setError(null);
    setRemoving(true);
    try {
      await onRemove();
      setPreview(null);
    } catch (err) {
      setError(
        err instanceof Error && err.message
          ? err.message
          : "Couldn't remove the logo.",
      );
    } finally {
      setRemoving(false);
    }
  }

  return (
    <div>
      {label && (
        <span className="mb-1.5 block text-sm font-medium text-fg-muted">
          {label}
        </span>
      )}

      <div className="flex items-start gap-4">
        <div className="relative h-40 w-28 shrink-0 overflow-hidden rounded-lg border border-border bg-surface-2">
          {preview ? (
            <img
              src={preview}
              alt="Logo preview"
              className="size-full object-contain"
            />
          ) : (
            <span className="flex size-full items-center justify-center text-fg-muted">
              <ImageIcon size={22} aria-hidden />
            </span>
          )}
          {(uploading || removing) && (
            <span className="absolute inset-0 flex items-center justify-center bg-surface/70">
              <Spinner size={18} />
            </span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <Dropzone
            accept={accept}
            multiple={false}
            disabled={busy}
            onChange={handleFiles}
            error={error ?? undefined}
            hint={
              hint ?? `PNG, JPEG, or WebP, up to ${humanSize(maxBytes)}.`
            }
          />
          {preview && onRemove && (
            <button
              type="button"
              onClick={handleRemove}
              disabled={busy}
              className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-error-text disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Trash2 size={14} aria-hidden />
              Remove logo
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
