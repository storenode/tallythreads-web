import { useEffect, useRef, useState } from "react";
import { Camera, X } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { normalizeSku } from "./distribution";

/**
 * SKU entry for scanning. USB / Bluetooth barcode scanners type like a keyboard and press Enter,
 * so a focused input is all they need. On phones with the browser's BarcodeDetector (Chrome on
 * Android), a camera button scans Code 128 labels directly — no app or hardware required.
 */
export function ScanInput({
  label = "Scan or type a SKU",
  onScan,
  autoFocus,
}: {
  label?: string;
  onScan: (sku: string) => void;
  autoFocus?: boolean;
}) {
  const [value, setValue] = useState("");
  const [camera, setCamera] = useState(false);
  const cameraSupported = typeof window !== "undefined" && "BarcodeDetector" in window;

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

interface DetectedBarcode {
  rawValue: string;
}
interface BarcodeDetectorLike {
  detect(source: HTMLVideoElement): Promise<DetectedBarcode[]>;
}

function CameraScanner({ onScan }: { onScan: (sku: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
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
    const Detector = (window as unknown as { BarcodeDetector: new (o: { formats: string[] }) => BarcodeDetectorLike })
      .BarcodeDetector;
    const detector = new Detector({ formats: ["code_128"] });

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (stopped || !videoRef.current) return;
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        const tick = async () => {
          if (stopped || !videoRef.current) return;
          try {
            const codes = await detector.detect(videoRef.current);
            const v = codes[0]?.rawValue;
            // Same label held in view: count it once every 1.5 s, not every frame.
            if (v && (v !== last || Date.now() - lastAt > 1500)) {
              last = v;
              lastAt = Date.now();
              navigator.vibrate?.(40);
              onScanRef.current(v);
            }
          } catch {
            /* frame not ready */
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
        <video ref={videoRef} muted playsInline className="block max-h-56 w-full object-cover" />
      )}
    </div>
  );
}
