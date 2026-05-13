import sharp from "sharp";
import { createWorker, PSM } from "tesseract.js";

const MAX_DIMENSION = 3200;

export type StudyOcrResult = {
  text: string;
  /** Tesseract mean confidence 0–100 */
  confidence: number;
  /** True when stronger upscaling / code-friendly pipeline was used */
  codeAwarePreprocess: boolean;
  /** Dimensions of the buffer passed to Tesseract after preprocessing */
  processedWidth: number;
  processedHeight: number;
  preprocessMs: number;
};

/** Tesseract language(s), e.g. `eng` or `eng+deu` */
export function getStudyOcrLang(): string {
  const raw = process.env.OCR_LANG?.trim();
  if (!raw) return "eng";
  return raw.replace(/\s+/g, "");
}

/**
 * Code-aware preprocessing: grayscale, normalize, upscale small screenshots (~2×),
 * sharpen, PNG with light compression only.
 */
export async function preprocessImageForStudyOcr(
  input: Buffer,
  codeAware: boolean,
): Promise<Buffer> {
  const meta = await sharp(input).rotate().metadata();
  const w0 = meta.width ?? 0;
  const h0 = meta.height ?? 0;
  if (!w0 || !h0) {
    throw new Error("Invalid image dimensions");
  }

  const maxSide = Math.max(w0, h0);
  let scale = 1;
  if (w0 < 960) scale = 2;
  if (maxSide < 900 || w0 < 1200) {
    scale = Math.max(scale, 2);
  }
  if (codeAware && w0 < 1400) {
    scale = Math.max(scale, 2);
  }

  let targetW = Math.round(w0 * scale);
  let targetH = Math.round(h0 * scale);
  const maxDim = Math.max(targetW, targetH);
  if (maxDim > MAX_DIMENSION) {
    const r = MAX_DIMENSION / maxDim;
    targetW = Math.max(1, Math.round(targetW * r));
    targetH = Math.max(1, Math.round(targetH * r));
  }

  return sharp(input)
    .rotate()
    .flatten({ background: "#ffffff" })
    .greyscale()
    .normalize()
    .resize({
      width: targetW,
      height: targetH,
      fit: "fill",
      kernel: sharp.kernel.lanczos3,
    })
    .sharpen({ sigma: 0.55, m1: 0.55, m2: 2.8 })
    .png({ compressionLevel: 1, effort: 2 })
    .toBuffer();
}

/**
 * Likely programming / dense-text crop → stronger upscaling rules.
 */
export function shouldUseCodeAwarePreprocess(meta: { width?: number; height?: number }): boolean {
  const w = meta.width ?? 0;
  const h = meta.height ?? 0;
  if (w > 0 && w < 1100) return true;
  if (w > 0 && h > 0) {
    const ratio = h / w;
    if (ratio > 0.35 && ratio < 2.8 && w < 1400) return true;
  }
  return false;
}

export async function runStudyCaptureOcr(imageBuffer: Buffer): Promise<StudyOcrResult> {
  const meta = await sharp(imageBuffer).rotate().metadata();
  const codeAware = shouldUseCodeAwarePreprocess(meta);
  const preStart = Date.now();
  const preprocessed = await preprocessImageForStudyOcr(imageBuffer, codeAware);
  const preprocessMs = Date.now() - preStart;
  const procMeta = await sharp(preprocessed).metadata();
  const processedWidth = procMeta.width ?? 0;
  const processedHeight = procMeta.height ?? 0;
  const langs = getStudyOcrLang();

  const worker = await createWorker(langs);
  try {
    await worker.setParameters({
      preserve_interword_spaces: "1",
      tessedit_pageseg_mode: PSM.AUTO,
    });

    const {
      data: { text, confidence },
    } = await worker.recognize(preprocessed);

    return {
      text: text ?? "",
      confidence: typeof confidence === "number" ? confidence : 0,
      codeAwarePreprocess: codeAware,
      processedWidth,
      processedHeight,
      preprocessMs,
    };
  } finally {
    await worker.terminate();
  }
}
