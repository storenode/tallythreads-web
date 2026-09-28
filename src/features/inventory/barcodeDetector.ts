/**
 * A Code 128 reader for the camera scanners. Chrome on Android ships the browser's
 * BarcodeDetector; Safari (every iPhone browser) doesn't, so there we load the `barcode-detector`
 * ponyfill (ZXing-C++ as WebAssembly) on first use. The .wasm is served from our own origin and
 * precached by the service worker — not the package's default CDN — so scanning works offline.
 */

export interface DetectedBarcode {
  rawValue: string;
}

export interface Code128Detector {
  detect(source: HTMLVideoElement): Promise<DetectedBarcode[]>;
}

type DetectorCtor = {
  new (options: { formats: string[] }): Code128Detector;
  getSupportedFormats?: () => Promise<string[]>;
};

/** Whether this device can scan with its camera at all. */
export const cameraScanSupported = () =>
  typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia;

let detector: Promise<Code128Detector> | null = null;

export function getCode128Detector(): Promise<Code128Detector> {
  detector ??= (async () => {
    const Native = (window as unknown as { BarcodeDetector?: DetectorCtor }).BarcodeDetector;
    if (Native) {
      const formats = (await Native.getSupportedFormats?.().catch(() => [])) ?? [];
      if (formats.includes("code_128")) return new Native({ formats: ["code_128"] });
    }
    const [{ BarcodeDetector, prepareZXingModule }, { default: wasmUrl }] = await Promise.all([
      import("barcode-detector/ponyfill"),
      import("zxing-wasm/reader/zxing_reader.wasm?url"),
    ]);
    prepareZXingModule({
      overrides: { locateFile: (path: string, prefix: string) => (path.endsWith(".wasm") ? wasmUrl : prefix + path) },
    });
    return new BarcodeDetector({ formats: ["code_128"] });
  })().catch((err) => {
    detector = null; // let the next attempt retry (e.g. the .wasm fetch failed offline)
    throw err;
  });
  return detector;
}
