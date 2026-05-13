import type { ViewportRect } from "./types";

function supportsWebp(canvas: HTMLCanvasElement): boolean {
  const d = canvas.toDataURL("image/webp", 0.6);
  return d.startsWith("data:image/webp");
}

export async function compressCanvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  const type = supportsWebp(canvas) ? "image/webp" : "image/jpeg";
  const quality = type === "image/webp" ? 0.78 : 0.72;
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Could not encode image"))),
      type,
      quality,
    );
  });
}

/**
 * Crop a full-tab screenshot (data URL) using a viewport rectangle in CSS pixels.
 */
export async function cropDataUrlToBlob(
  dataUrl: string,
  rect: ViewportRect,
): Promise<Blob> {
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("Screenshot image failed to load"));
    img.src = dataUrl;
  });

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const scaleX = img.naturalWidth / vw;
  const scaleY = img.naturalHeight / vh;

  const sx = Math.max(0, Math.round(rect.left * scaleX));
  const sy = Math.max(0, Math.round(rect.top * scaleY));
  const sw = Math.max(1, Math.round(rect.width * scaleX));
  const sh = Math.max(1, Math.round(rect.height * scaleY));

  const canvas = document.createElement("canvas");
  canvas.width = sw;
  canvas.height = sh;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unsupported");
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);

  const blob = await compressCanvasToBlob(canvas);
  console.log("[StudyCapture][ext] cropped blob", {
    size: blob.size,
    type: blob.type,
    sx,
    sy,
    sw,
    sh,
  });
  return blob;
}
