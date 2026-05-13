"use client";

import html2canvas from "html2canvas";

export type ViewportRect = { left: number; top: number; width: number; height: number };

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

export async function sha256HexFromBlob(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}

export async function captureViewportRegionToBlob(
  rect: ViewportRect,
  ignoreSelector = "[data-study-capture-ui]",
): Promise<Blob> {
  const root = document.documentElement;
  const scale = Math.min(1, 1680 / Math.max(root.scrollWidth, window.innerWidth));

  const full = await html2canvas(root, {
    scale,
    useCORS: true,
    logging: false,
    ignoreElements: (el) => {
      if (!ignoreSelector) return false;
      try {
        return !!(el as HTMLElement).closest?.(ignoreSelector);
      } catch {
        return false;
      }
    },
  });

  const scaleX = full.width / root.scrollWidth;
  const scaleY = full.height / root.scrollHeight;

  const sx = Math.max(0, Math.floor((window.scrollX + rect.left) * scaleX));
  const sy = Math.max(0, Math.floor((window.scrollY + rect.top) * scaleY));
  const sw = Math.min(full.width - sx, Math.ceil(rect.width * scaleX));
  const sh = Math.min(full.height - sy, Math.ceil(rect.height * scaleY));

  if (sw < 2 || sh < 2) {
    throw new Error("Selection too small");
  }

  const out = document.createElement("canvas");
  out.width = sw;
  out.height = sh;
  const ctx = out.getContext("2d");
  if (!ctx) throw new Error("Canvas unsupported");
  ctx.drawImage(full, sx, sy, sw, sh, 0, 0, sw, sh);
  return compressCanvasToBlob(out);
}
