import { useEffect, useRef, useState } from "react";
import { Camera, X } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { normalizeSku } from "./distribution";
import { cameraScanSupported, getCode128Detector } from "./barcodeDetector";

/**
 * SKU entry for scanning. USB / Bluetooth barcode scanners type like a keyboard and press Enter,
 * so a focused input is all they need. On phones (Android and iPhone), a camera button scans
 * Code 128 labels directly — no app or hardware required.
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
  /** Open with the camera already running (the header's quick scan). */
  startWithCamera?: boolean;
}) {
  const [value, setValue] = useState("");
  const cameraSupported = cameraScanSupported();
  const [camera, setCamera] = useState(startWithCamera && cameraSupported);

  const submit = (raw: string) => {
    const sku = normalizeSku(raw);
    if (sku) onScan(sku);
    setValue("");
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
        {cameraSupported && (
          <button
            type="button"
            onClick={() => setCamera((c) => !c)}
            aria-label={camera ? "Close camera" : "Scan with camera"}
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-lg border border-border text-fg hover:bg-surface-2"
          >
            {camera ? <X size={18} /> : <Camera size={18} />}
          </button>
        )}
      </form>
      {camera && <CameraScanner onScan={submit} />}
    </div>
  );
}

/** Live camera view that calls `onScan` with each Code 128 value it reads. */
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
        const detector = await getCode128Detector();
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
