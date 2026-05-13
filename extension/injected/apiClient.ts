import type { StudyAnalyzeResponse } from "./types";
import { STUDY_CAPTURE_API_URL } from "../config";

export async function postAnalyzeImage(blob: Blob): Promise<StudyAnalyzeResponse> {
  const fd = new FormData();
  const name = blob.type.includes("webp") ? "capture.webp" : "capture.jpg";
  fd.append("image", blob, name);

  console.log("[StudyCapture][ext] API request started", STUDY_CAPTURE_API_URL);
  const res = await fetch(STUDY_CAPTURE_API_URL, { method: "POST", body: fd });
  const data = (await res.json()) as StudyAnalyzeResponse & { error?: string };
  const ocrLen = typeof data.ocrText === "string" ? data.ocrText.length : 0;
  console.log("[StudyCapture][ext] API response status", res.status, {
    finalAnswer: (data.finalAnswer || "").slice(0, 120),
    answerType: data.answerType,
    itemsLength: (data.items || []).length,
    ocrTextLen: ocrLen,
    usedAutoRetry: data.usedAutoRetry,
    parseWarning: data.parseWarning,
    json: data,
  });

  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data as StudyAnalyzeResponse;
}

export async function postExplainMore(ocrText: string): Promise<StudyAnalyzeResponse> {
  const fd = new FormData();
  fd.append("ocrText", ocrText);
  fd.append("deeperExplanation", "true");

  console.log("[StudyCapture][ext] API request started (explain more)", STUDY_CAPTURE_API_URL);
  const res = await fetch(STUDY_CAPTURE_API_URL, { method: "POST", body: fd });
  const data = (await res.json()) as StudyAnalyzeResponse & { error?: string };
  console.log("[StudyCapture][ext] API response (explain more) status", res.status, {
    finalAnswer: (data.finalAnswer || "").slice(0, 120),
    mode: data.mode,
    answerType: data.answerType,
    itemsLength: (data.items || []).length,
    json: data,
  });

  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data as StudyAnalyzeResponse;
}
