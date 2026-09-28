/**
 * The label reader for the camera scanners: QR codes (current labels, which carry the lookup link)
 * and Code 128 (older labels, USB-scanner style). Chrome on Android ships the browser's
 * BarcodeDetector; Safari (every iPhone browser) doesn't, so there we load the `barcode-detector`
 * ponyfill (ZXing-C++ as WebAssembly) on first use. The .wasm is served from our own origin and
 * precached by the service worker — not the package's default CDN — so scanning works offline.
 */

export interface DetectedBarcode {
  rawValue: string;
}

export interface LabelDetector {
  detect(source: ImageData): Promise<DetectedBarcode[]>;
}

type DetectorCtor = {
  new (options: { formats: string[] }): LabelDetector;
  getSupportedFormats?: () => Promise<string[]>;
};

/** iPhone / iPad (iPadOS reports itself as a Mac with touch). */
const isIOS = () =>
  typeof navigator !== "undefined" &&
  (/iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));

/**
 * Whether live camera scanning should be offered. Not on iPhone: its browser video is low
 * resolution with poor focus for dense Code 128 labels, and live reads failed on a real device —
 * iPhones take a photo instead (`decodeImageFile`), which uses the native camera at full resolution.
 */
export const cameraScanSupported = () =>
  typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia && !isIOS();

/** Longest side a photo is decoded at: sharp enough for a 50 mm label, well under iOS canvas limits. */
const PHOTO_MAX_SIDE = 3000;

/** Read the first label code (QR or Code 128) in a photo (from a file input). Null when there isn't one. */
export async function decodeImageFile(file: Blob): Promise<string | null> {
  const detector = await getBarcodeDetector();
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode(); // drawImage below honours the photo's EXIF orientation
    // Full size first; a smaller copy second, which sometimes reads a blurry or noisy photo.
    for (const maxSide of [PHOTO_MAX_SIDE, 1600]) {
      const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.round(img.naturalWidth * scale);
      const h = Math.round(img.naturalHeight * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) break;
      ctx.drawImage(img, 0, 0, w, h);
      const codes = await detector.detect(ctx.getImageData(0, 0, w, h));
      if (codes[0]?.rawValue) return codes[0].rawValue;
    }
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

const FORMATS = ["qr_code", "code_128"] as const;

let detector: Promise<LabelDetector> | null = null;

export function getBarcodeDetector(): Promise<LabelDetector> {
  detector ??= (async () => {
    const Native = (window as unknown as { BarcodeDetector?: DetectorCtor }).BarcodeDetector;
    if (Native) {
      const formats = (await Native.getSupportedFormats?.().catch(() => [])) ?? [];
      if (FORMATS.every((f) => formats.includes(f))) return new Native({ formats: [...FORMATS] });
    }
    const [{ BarcodeDetector, prepareZXingModule }, { default: wasmUrl }] = await Promise.all([
      import("barcode-detector/ponyfill"),
      import("zxing-wasm/reader/zxing_reader.wasm?url"),
    ]);
    prepareZXingModule({
      overrides: { locateFile: (path: string, prefix: string) => (path.endsWith(".wasm") ? wasmUrl : prefix + path) },
    });
    return new BarcodeDetector({ formats: [...FORMATS] });
  })().catch((err) => {
    detector = null; // let the next attempt retry (e.g. the .wasm fetch failed offline)
    throw err;
  });
  return detector;
}
