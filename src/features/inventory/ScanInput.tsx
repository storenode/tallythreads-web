import { useEffect, useRef, useState, type ReactNode } from "react";
import { Camera, Loader2, Video, X } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { skuFromScan } from "./codes";
import { cameraScanSupported, decodeImageFile, getBarcodeDetector } from "./barcodeDetector";

/**
 * SKU entry for scanning. USB / Bluetooth barcode scanners type like a keyboard and press Enter,
 * so a focused input is all they need. Phones can also read labels (QR, or Code 128) with no app or
 * hardware: a photo button on every phone (iPhone's native camera, full resolution), and a live
 * camera view where the browser supports it well (Android).
 */
export function ScanInput({
  label = "Scan or type a SKU",
  onScan,
  autoFocus,
  startWithCamera = false,
}: {
  label?: string;
  onScan: (sku: string) => void;
  autoFocus?: boolean;
  /** Quick-scan mode (the header): start the live camera, or on iPhone lead with the photo button. */
  startWithCamera?: boolean;
}) {
  const [value, setValue] = useState("");
  const liveSupported = cameraScanSupported();
  const [camera, setCamera] = useState(startWithCamera && liveSupported);
  const [photo, setPhoto] = useState<{ busy: boolean; error: string | null }>({ busy: false, error: null });

  const submit = (raw: string) => {
    const sku = skuFromScan(raw);
    if (sku) onScan(sku);
    setValue("");
  };

  const readPhoto = async (file: File) => {
    setPhoto({ busy: true, error: null });
    try {
      const code = await decodeImageFile(file);
      if (code) {
        setPhoto({ busy: false, error: null });
        submit(code);
      } else {
        setPhoto({ busy: false, error: "No barcode found — take the photo closer, with the whole label in view." });
      }
    } catch {
      setPhoto({ busy: false, error: "Couldn't read that photo — try again, or type the SKU." });
    }
  };

  return (
    <div>
      <form
        className="flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          submit(value);
        }}
      >
        <div className="min-w-0 flex-1">
          <Input
            label={label}
            value={value}
            autoFocus={autoFocus}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            enterKeyHint="go"
            onChange={(e) => setValue(e.target.value)}
          />
        </div>
        {liveSupported && (
          <button
            type="button"
            onClick={() => setCamera((c) => !c)}
            aria-label={camera ? "Close camera" : "Scan with camera"}
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-lg border border-border text-fg hover:bg-surface-2"
          >
            {camera ? <X size={18} /> : <Video size={18} />}
          </button>
        )}
        <PhotoPicker
          onFile={readPhoto}
          aria-label="Scan from a photo"
          className="inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-border text-fg hover:bg-surface-2"
        >
          {photo.busy ? <Loader2 size={18} className="animate-spin" /> : <Camera size={18} />}
        </PhotoPicker>
      </form>
      {startWithCamera && !liveSupported && (
        <PhotoPicker
          onFile={readPhoto}
          className="mt-3 flex min-h-14 w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-tt-green-500 px-4 text-base font-semibold text-white"
        >
          {photo.busy ? <Loader2 size={20} className="animate-spin" /> : <Camera size={20} />}
          {photo.busy ? "Reading the barcode…" : "Take a photo of the label"}
        </PhotoPicker>
      )}
      {photo.error && <p className="mt-2 text-sm text-fg-muted">{photo.error}</p>}
      {camera && <CameraScanner onScan={submit} />}
    </div>
  );
}

/** A label that opens the phone's camera (or photo picker) and hands back the chosen image. */
function PhotoPicker({
  onFile,
  className,
  children,
  "aria-label": ariaLabel,
}: {
  onFile: (file: File) => void;
  className: string;
  children: ReactNode;
  "aria-label"?: string;
}) {
  return (
    <label className={className} aria-label={ariaLabel}>
      {children}
      <input
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = ""; // the same label can be photographed again
          if (file) onFile(file);
        }}
      />
    </label>
  );
}

/** Live camera view that calls `onScan` with each label code (QR or Code 128) it reads. */
export function CameraScanner({ onScan }: { onScan: (sku: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  // Shown under the preview so a failing phone can be diagnosed from a screenshot.
  const [status, setStatus] = useState<{ size: string; readError: string | null }>({ size: "", readError: null });
  const onScanRef = useRef(onScan);
  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let timer: number | undefined;
    let last = "";
    let lastAt = 0;
    let stopped = false;

    (async () => {
      try {
        const detector = await getBarcodeDetector();
        if (stopped) return;
        // Ask for HD: iPhone Safari defaults to 640×480, where a full-length SKU label's bars are
        // ~1 px wide and don't decode. 1280×720 and up read reliably.
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } },
        });
        if (stopped || !videoRef.current) {
          stream.getTracks().forEach((t) => t.stop()); // closed while the permission prompt was up
          return;
        }
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        // Grab frames onto a plain canvas and hand the decoder ImageData: the ponyfill's own
        // video path (OffscreenCanvas / createImageBitmap) is unreliable on iPhone WebKit.
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        let failures = 0;
        const tick = async () => {
          const video = videoRef.current;
          if (stopped || !video) return;
          try {
            if (!ctx || video.readyState < 2 || !video.videoWidth) throw new Error("frame not ready");
            if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
              canvas.width = video.videoWidth;
              canvas.height = video.videoHeight;
              setStatus((st) => ({ ...st, size: `${canvas.width}×${canvas.height}` }));
            }
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const codes = await detector.detect(ctx.getImageData(0, 0, canvas.width, canvas.height));
            failures = 0;
            const v = codes[0]?.rawValue;
            // Same label held in view: count it once every 1.5 s, not every frame.
            if (v && (v !== last || Date.now() - lastAt > 1500)) {
              last = v;
              lastAt = Date.now();
              navigator.vibrate?.(40);
              onScanRef.current(v);
            }
          } catch (err) {
            // A frame or two before the video starts is normal; a steady failure is a bug to show.
            if (++failures === 8) {
              setStatus((st) => ({ ...st, readError: err instanceof Error ? err.message : String(err) }));
            }
          }
          timer = window.setTimeout(tick, 250);
        };
        void tick();
      } catch {
        setError("Camera unavailable — allow camera access, or type the SKU.");
      }
    })();

    return () => {
      stopped = true;
      window.clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return (
    <div className="mt-2 overflow-hidden rounded-lg border border-border bg-black">
      {error ? (
        <p className="p-3 text-sm text-white">{error}</p>
      ) : (
        <>
          <video ref={videoRef} muted playsInline className="block max-h-56 w-full object-cover" />
          <p className="bg-surface px-3 py-1.5 text-xs text-fg-muted">
            Hold the label flat, filling most of the frame.
            {status.size && <span className="float-right">{status.size}</span>}
          </p>
          {status.readError && (
            <p className="bg-surface px-3 pb-1.5 text-xs text-fg-muted">Scanner error: {status.readError}</p>
          )}
        </>
      )}
    </div>
  );
}
