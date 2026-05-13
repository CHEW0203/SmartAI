import { NextRequest } from "next/server";
import sharp from "sharp";
import { analyzeQuestionText, studyModelId } from "@/lib/study-capture/mimoClient";
import { parseModelResponse } from "@/lib/study-capture/parseModelResponse";
import { runStudyCaptureOcr, getStudyOcrLang } from "@/lib/study-capture/ocr";
import { getCached, hashOcrText, setCached } from "@/lib/study-capture/ocrCache";
import {
  buildServerOcrWarning,
  cleanOcrText,
  type StudyAnalyzeResponse,
} from "@/lib/study-capture/textHeuristics";
import { studyCaptureJson, studyCaptureOptions } from "@/lib/study-capture/studyCaptureCors";

export const runtime = "nodejs";
export const maxDuration = 120;

export function OPTIONS() {
  return studyCaptureOptions();
}

const MAX_BYTES = 4 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);
const MIN_OCR_CHARS_FOR_AI = 20;

function cacheKey(ocr: string, deeper: boolean): string {
  return `${hashOcrText(ocr)}:${deeper ? "d" : "s"}`;
}

function mergeOcrWarnings(a?: string, b?: string): string {
  const parts = [a, b].filter((s) => s && String(s).trim().length > 0) as string[];
  if (parts.length === 0) return "";
  return [...new Set(parts.map((p) => p.trim()))].join(" ");
}

function normalizeStudyResponse(
  partial: Partial<StudyAnalyzeResponse> & { ocrText: string },
  defaults: { ocrLanguage: string; mode: "normal" | "deep" },
): StudyAnalyzeResponse {
  const lang = partial.ocrLanguage ?? partial.ocrLang ?? defaults.ocrLanguage;
  return {
    answerType: partial.answerType ?? "text",
    finalAnswer: partial.finalAnswer ?? "",
    explanation: partial.explanation ?? "",
    keyConcept: partial.keyConcept ?? "",
    optionAnalysis: partial.optionAnalysis ?? "",
    codeLanguage: partial.codeLanguage ?? "",
    finalCode: partial.finalCode ?? "",
    items: partial.items ?? [],
    confidence: partial.confidence ?? "medium",
    ocrText: partial.ocrText,
    rawOcrText: partial.rawOcrText ?? partial.ocrText,
    ocrConfidence: partial.ocrConfidence ?? 0,
    ocrLanguage: lang,
    ocrLang: lang,
    modelUsed: partial.modelUsed ?? studyModelId(),
    mode: partial.mode ?? defaults.mode,
    ocrWarning: partial.ocrWarning ?? "",
    needsClearerCrop: partial.needsClearerCrop ?? false,
    modelRawText: partial.modelRawText ?? "",
    parseWarning: partial.parseWarning ?? "",
    usedAutoRetry: partial.usedAutoRetry ?? false,
    retryReason: partial.retryReason ?? "",
    ocrDebug: partial.ocrDebug ?? {
      originalWidth: 0,
      originalHeight: 0,
      processedWidth: 0,
      processedHeight: 0,
    },
    timing: partial.timing ?? {
      preprocessMs: 0,
      ocrMs: 0,
      modelMs: 0,
      parseMs: 0,
      totalMs: 0,
    },
  };
}

export async function POST(req: NextRequest) {
  const totalStart = Date.now();
  try {
    const form = await req.formData();
    const deeperRaw = form.get("deeperExplanation");
    const deeper =
      deeperRaw === "true" ||
      deeperRaw === "1" ||
      String(deeperRaw ?? "").toLowerCase() === "true";

    const ocrField = form.get("ocrText");
    const providedOcr =
      typeof ocrField === "string" && ocrField.trim().length > 0
        ? cleanOcrText(ocrField)
        : "";

    const file = form.get("image");

    let ocrText = providedOcr;
    let ocrEngineConfidence: number | null = null;
    let rawOcrText = "";
    let originalWidth = 0;
    let originalHeight = 0;
    let processedWidth = 0;
    let processedHeight = 0;
    let preprocessMs = 0;
    let ocrMs = 0;
    const ocrLang = getStudyOcrLang();

    if (!ocrText) {
      if (!(file instanceof Blob) || file.size === 0) {
        return studyCaptureJson({ error: "Missing image or ocrText" }, { status: 400 });
      }

      if (file.size > MAX_BYTES) {
        return studyCaptureJson(
          { error: `Image too large (max ${MAX_BYTES} bytes)` },
          { status: 400 },
        );
      }

      const mime = (file as Blob).type || "application/octet-stream";
      if (!ALLOWED.has(mime)) {
        return studyCaptureJson(
          { error: "Invalid file type. Use JPEG, PNG, or WebP." },
          { status: 400 },
        );
      }

      const ab = await file.arrayBuffer();
      const buf = Buffer.from(ab);

      const meta = await sharp(buf).metadata();
      if (!meta.width || !meta.height) {
        return studyCaptureJson({ error: "Invalid image" }, { status: 400 });
      }
      if (meta.width > 8000 || meta.height > 8000) {
        return studyCaptureJson({ error: "Image dimensions too large" }, { status: 400 });
      }

      originalWidth = meta.width ?? 0;
      originalHeight = meta.height ?? 0;
      const ocrStart = Date.now();
      const ocrResult = await runStudyCaptureOcr(buf);
      ocrMs = Date.now() - ocrStart;
      preprocessMs = ocrResult.preprocessMs;
      const rawOcr = ocrResult.text ?? "";
      rawOcrText = rawOcr;
      ocrEngineConfidence = ocrResult.confidence;
      ocrText = cleanOcrText(rawOcr);
      processedWidth = ocrResult.processedWidth;
      processedHeight = ocrResult.processedHeight;

      console.log("[StudyCapture][OCR] original image size", {
        width: meta.width,
        height: meta.height,
      });
      console.log("[StudyCapture][OCR] processed image size", {
        width: ocrResult.processedWidth,
        height: ocrResult.processedHeight,
        codeAwarePreprocess: ocrResult.codeAwarePreprocess,
      });
      console.log("[StudyCapture][OCR] language", ocrLang);
      console.log("[StudyCapture][OCR] confidence (mean)", ocrEngineConfidence);
      console.log("[StudyCapture][OCR] raw length / cleaned length", rawOcr.length, ocrText.length);
      console.log("[StudyCapture][OCR] raw text\n", rawOcr.slice(0, 4000) + (rawOcr.length > 4000 ? "\n… [truncated log]" : ""));
      console.log("[StudyCapture][OCR] cleaned text\n", ocrText.slice(0, 4000) + (ocrText.length > 4000 ? "\n… [truncated log]" : ""));
    } else if (file instanceof Blob && file.size > 0) {
      return studyCaptureJson({ error: "Send either image or ocrText, not both" }, { status: 400 });
    } else if (ocrText) {
      console.log("[StudyCapture][OCR] client-provided text", {
        length: ocrText.length,
        trimmed: ocrText.trim().length,
        preview: ocrText.slice(0, 800),
        lang: ocrLang,
      });
    }

    const mode: "normal" | "deep" = deeper ? "deep" : "normal";

    if (!ocrText || ocrText.trim().length === 0) {
      console.log("[StudyCapture][OCR] reject: almost empty");
      return studyCaptureJson(
        normalizeStudyResponse(
          {
            finalAnswer: "",
            explanation:
              "Very little text was read from the selection. Try a tighter crop with higher contrast, or zoom the page before capture.",
            keyConcept: "OCR quality",
            optionAnalysis: "",
            answerType: "text",
            codeLanguage: "",
            finalCode: "",
            items: [],
            confidence: "low",
            ocrWarning: mergeOcrWarnings(
              buildServerOcrWarning(ocrEngineConfidence ?? 0, ocrText ?? ""),
              "",
            ),
            needsClearerCrop: true,
            rawOcrText,
            ocrText: ocrText ?? "",
            ocrConfidence: ocrEngineConfidence ?? 0,
            ocrDebug: {
              originalWidth,
              originalHeight,
              processedWidth,
              processedHeight,
            },
            timing: {
              preprocessMs,
              ocrMs,
              modelMs: 0,
              parseMs: 0,
              totalMs: Date.now() - totalStart,
            },
          },
          { ocrLanguage: ocrLang, mode },
        ),
        { status: 200 },
      );
    }

    if (ocrText.trim().length < MIN_OCR_CHARS_FOR_AI) {
      console.log("[StudyCapture][OCR] skip AI: text too short", ocrText.trim().length);
      return studyCaptureJson(
        normalizeStudyResponse(
          {
            finalAnswer: "OCR could not read enough text.",
            explanation:
              "Please crop a clearer or larger area that includes the full question, code, and options.",
            keyConcept: "",
            optionAnalysis: "",
            answerType: "text",
            codeLanguage: "",
            finalCode: "",
            items: [],
            confidence: "low",
            needsClearerCrop: true,
            rawOcrText,
            ocrText,
            ocrConfidence: ocrEngineConfidence ?? 0,
            ocrWarning: mergeOcrWarnings(
              "OCR text is too short.",
              buildServerOcrWarning(ocrEngineConfidence ?? 0, ocrText),
            ),
            ocrDebug: {
              originalWidth,
              originalHeight,
              processedWidth,
              processedHeight,
            },
            timing: {
              preprocessMs,
              ocrMs,
              modelMs: 0,
              parseMs: 0,
              totalMs: Date.now() - totalStart,
            },
          },
          { ocrLanguage: ocrLang, mode },
        ),
        { status: 200 },
      );
    }

    if (ocrText.length > 12000) {
      return studyCaptureJson({ error: "OCR text too long" }, { status: 400 });
    }

    const ck = cacheKey(ocrText, deeper);
    const cached = getCached<StudyAnalyzeResponse>(ck);
    if (cached) {
      const normalized = normalizeStudyResponse(
        {
          ...cached,
          ocrText,
          rawOcrText: cached.rawOcrText || rawOcrText || ocrText,
          ocrConfidence: ocrEngineConfidence ?? cached.ocrConfidence,
          ocrLanguage: cached.ocrLanguage ?? ocrLang,
          ocrDebug: cached.ocrDebug,
          timing: {
            ...(cached.timing || {
              preprocessMs,
              ocrMs,
              modelMs: 0,
              parseMs: 0,
              totalMs: 0,
            }),
            totalMs: Date.now() - totalStart,
          },
        },
        { ocrLanguage: ocrLang, mode },
      );
      return studyCaptureJson(normalized);
    }

    const analyzed = await analyzeQuestionText({
      ocrText,
      deeperExplanation: deeper,
    });
    const maybeRepair =
      analyzed.parseWarning &&
      /"finalAnswer"\s*:/.test(analyzed.modelRawText) &&
      (!analyzed.finalAnswer ||
        analyzed.finalAnswer === "{" ||
        (analyzed.finalAnswer === "See explanation" && /"finalAnswer"\s*:/.test(analyzed.explanation)));
    let repaired = analyzed;
    if (maybeRepair) {
      const repairedParsed = parseModelResponse(analyzed.modelRawText);
      if (repairedParsed.jsonParsed) {
        repaired = {
          ...analyzed,
          answerType: repairedParsed.answerType,
          finalAnswer: repairedParsed.finalAnswer,
          explanation: repairedParsed.explanation,
          keyConcept: repairedParsed.keyConcept,
          optionAnalysis: repairedParsed.optionAnalysis,
          codeLanguage: repairedParsed.codeLanguage,
          finalCode: repairedParsed.finalCode,
          items: repairedParsed.items,
          confidence: repairedParsed.confidence,
          ocrWarning: repairedParsed.ocrWarning || analyzed.ocrWarning,
          needsClearerCrop: repairedParsed.needsClearerCrop || analyzed.needsClearerCrop,
          parseWarning: repairedParsed.parseWarning ?? analyzed.parseWarning,
        };
      }
    }

    const serverWarn = buildServerOcrWarning(ocrEngineConfidence ?? 0, ocrText);
    const ocrWarning = mergeOcrWarnings(serverWarn, repaired.ocrWarning);
    const needsClearerCrop =
      repaired.needsClearerCrop ||
      (ocrEngineConfidence != null && ocrEngineConfidence < 48);

    const out = normalizeStudyResponse(
      {
        ...repaired,
        ocrText,
        rawOcrText: rawOcrText || ocrText,
        ocrConfidence: ocrEngineConfidence ?? analyzed.ocrConfidence,
        ocrLanguage: ocrLang,
        ocrWarning,
        needsClearerCrop,
        mode: repaired.mode,
        ocrDebug: {
          originalWidth,
          originalHeight,
          processedWidth,
          processedHeight,
        },
        timing: {
          ...repaired.timing,
          preprocessMs,
          ocrMs,
          totalMs: Date.now() - totalStart,
        },
      },
      { ocrLanguage: ocrLang, mode: repaired.mode },
    );

    console.log("[StudyCapture][LLM] usedAutoRetry", out.usedAutoRetry, out.retryReason);
    console.log("[StudyCapture][response] normalized JSON", {
      finalAnswer: out.finalAnswer.slice(0, 160),
      ocrTextLen: out.ocrText.length,
      parseWarning: out.parseWarning,
      timing: out.timing,
    });

    setCached(ck, out);
    return studyCaptureJson(out);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unexpected error";
    return studyCaptureJson({ error: msg }, { status: 500 });
  }
}
