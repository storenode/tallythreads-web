import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Spinner } from "@/components/ui/Spinner";
import { paiseToRupeeInput, rupeesToPaise, formatInr } from "@/lib/money";
import { useMember } from "@/features/auth/useMember";
import { downscaleToBase64 } from "../receiptImage";
import {
  extractReceipt,
  queuePendingReceipt,
  saveExtractedInvoice,
  uploadReceipt,
  type ExtractedInvoice,
} from "../receiptQueue";

type Phase = "capture" | "extracting" | "review" | "offline" | "error";

function isOffline() {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

export function ScanReceiptModal({
  tripId,
  orgId,
  open,
  onClose,
}: {
  tripId: string;
  orgId: string;
  open: boolean;
  onClose: () => void;
}) {
  const { member } = useMember();
  const [phase, setPhase] = useState<Phase>("capture");
  const [image, setImage] = useState<{ base64: string; mediaType: string } | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [draft, setDraft] = useState<ExtractedInvoice | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setPhase("capture");
    setImage(null);
    setPreview(null);
    setDraft(null);
    setError(null);
    setSaving(false);
  };

  const close = () => {
    reset();
    onClose();
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    try {
      const { base64, mediaType } = await downscaleToBase64(file);
      setImage({ base64, mediaType });
      setPreview(`data:${mediaType};base64,${base64}`);
    } catch {
      setError("Couldn't read that image. Try another photo.");
    }
  };

  const scan = async () => {
    if (!image) return;
    // Offline: queue it and tell the owner it'll sync later.
    if (isOffline()) {
      await queuePendingReceipt(tripId, image.base64, image.mediaType);
      setPhase("offline");
      return;
    }
    setPhase("extracting");
    setError(null);
    try {
      const inv = await extractReceipt(image.base64, image.mediaType);
      setDraft(inv);
      setPhase("review");
    } catch (e) {
      // A network drop mid-call → treat like offline: queue for later.
      if (isOffline()) {
        await queuePendingReceipt(tripId, image.base64, image.mediaType);
        setPhase("offline");
        return;
      }
      setError(e instanceof Error ? e.message : "Extraction failed.");
      setPhase("error");
    }
  };

  const approve = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      const receiptPath = image
        ? await uploadReceipt(orgId, tripId, image.base64, image.mediaType)
        : null;
      // Explicit approval = reviewed by the owner → not flagged for later review.
      await saveExtractedInvoice(tripId, draft, {
        source: "ai_scan",
        needsReview: false,
        receiptPath,
        memberId: member?.id ?? null,
      });
      close();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save the invoice.");
      setSaving(false);
    }
  };

  const patchDraft = (p: Partial<ExtractedInvoice>) =>
    setDraft((d) => (d ? { ...d, ...p } : d));
  const patchItem = (i: number, p: Partial<ExtractedInvoice["items"][number]>) =>
    setDraft((d) =>
      d ? { ...d, items: d.items.map((it, idx) => (idx === i ? { ...it, ...p } : it)) } : d,
    );

  return (
    <Modal open={open} onClose={close} title="Scan receipt">
      {phase === "capture" && (
        <div className="space-y-4">
          <p className="text-sm text-fg-muted">
            Take a clear photo of the supplier's receipt/invoice.
          </p>
          <input
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(e) => onFile(e.target.files?.[0])}
            className="block w-full text-sm"
          />
          {preview && (
            <img
              src={preview}
              alt="Receipt preview"
              className="max-h-64 rounded-lg border border-border"
            />
          )}
          {error && <p className="text-sm text-red-500">{error}</p>}
          <div className="flex justify-end gap-3">
            <Button type="button" variant="ghost" onClick={close}>
              Cancel
            </Button>
            <Button type="button" onClick={scan} disabled={!image}>
              Scan
            </Button>
          </div>
        </div>
      )}

      {phase === "extracting" && (
        <div className="flex items-center gap-3 py-6 text-sm text-fg-muted">
          <Spinner /> Reading the receipt…
        </div>
      )}

      {phase === "offline" && (
        <div className="space-y-4">
          <p className="text-sm text-fg">
            📴 No internet connection. This receipt is saved on your device and will be
            <strong> scanned and synced automatically once you're back online</strong> —
            you can review it then.
          </p>
          <div className="flex justify-end">
            <Button type="button" onClick={close}>
              Done
            </Button>
          </div>
        </div>
      )}

      {phase === "error" && (
        <div className="space-y-4">
          <p className="text-sm text-red-500">{error ?? "Something went wrong."}</p>
          <div className="flex justify-end gap-3">
            <Button type="button" variant="ghost" onClick={reset}>
              Rescan
            </Button>
            <Button type="button" onClick={scan}>
              Try again
            </Button>
          </div>
        </div>
      )}

      {phase === "review" && draft && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-xs">
            <span className="text-fg-muted">AI confidence:</span>
            <span
              className={
                draft.confidence === "high"
                  ? "text-fg"
                  : draft.confidence === "medium"
                    ? "text-amber-500"
                    : "text-red-500"
              }
            >
              {draft.confidence}
            </span>
            <span className="ml-auto text-fg-muted">Check the numbers before approving.</span>
          </div>

          <Input
            label="Supplier"
            value={draft.supplier_name ?? ""}
            onChange={(e) => patchDraft({ supplier_name: e.target.value })}
          />
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Invoice no."
              value={draft.supplier_invoice_no ?? ""}
              onChange={(e) => patchDraft({ supplier_invoice_no: e.target.value })}
            />
            <Input
              label="Date"
              type="date"
              value={draft.invoice_date ?? ""}
              onChange={(e) => patchDraft({ invoice_date: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <div className="text-xs font-medium text-fg-muted">Items</div>
            {draft.items.map((it, i) => (
              <div key={i} className="grid grid-cols-12 gap-2">
                <div className="col-span-6">
                  <Input
                    label={i === 0 ? "Model" : undefined}
                    value={it.description}
                    onChange={(e) => patchItem(i, { description: e.target.value })}
                  />
                </div>
                <div className="col-span-2">
                  <Input
                    label={i === 0 ? "Qty" : undefined}
                    type="number"
                    value={it.quantity == null ? "" : String(it.quantity)}
                    onChange={(e) =>
                      patchItem(i, {
                        quantity: e.target.value === "" ? null : Number(e.target.value),
                      })
                    }
                  />
                </div>
                <div className="col-span-4">
                  <Input
                    label={i === 0 ? "Unit cost" : undefined}
                    type="number"
                    suffix="₹"
                    value={paiseToRupeeInput(it.unit_cost_paise)}
                    onChange={(e) =>
                      patchItem(i, { unit_cost_paise: rupeesToPaise(e.target.value) })
                    }
                  />
                </div>
              </div>
            ))}
            {draft.items.length === 0 && (
              <p className="text-sm text-fg-muted">
                No line items were read — you can still approve and add them manually.
              </p>
            )}
          </div>

          {draft.grand_total_paise != null && (
            <p className="text-sm text-fg-muted">
              Scanned total: {formatInr(draft.grand_total_paise)}
            </p>
          )}
          {error && <p className="text-sm text-red-500">{error}</p>}

          <div className="flex justify-end gap-3">
            <Button type="button" variant="ghost" onClick={reset} disabled={saving}>
              Rescan
            </Button>
            <Button type="button" onClick={approve} disabled={saving}>
              {saving ? "Saving…" : "Approve & add"}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
