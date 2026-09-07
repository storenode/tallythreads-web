/** Downscale a captured photo to keep it small (cheaper Claude call, under the
 * Edge Function's ~5 MB limit). Draws to a canvas at a max dimension and re-encodes
 * as JPEG. Returns base64 (no data: prefix) + media type. */
export async function downscaleToBase64(
  file: File,
  maxDim = 1600,
  quality = 0.8,
): Promise<{ base64: string; mediaType: string }> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result as string);
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("Could not read the image"));
    el.src = dataUrl;
  });

  const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");
  ctx.drawImage(img, 0, 0, w, h);

  const out = canvas.toDataURL("image/jpeg", quality);
  return { base64: out.split(",")[1] ?? "", mediaType: "image/jpeg" };
}
