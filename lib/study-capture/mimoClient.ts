import {
  clampWordCount,
  looksLikeCode,
  looksLikeMultipleChoice,
  multipleQuestionsLikely,
  type StudyAnalyzeResponse,
} from "./textHeuristics";
import {
  parseModelResponse,
  shouldAutoRetryParsed,
  isUnusableParsed,
  type ParsedModelFields,
} from "./parseModelResponse";

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

function joinChatCompletionsUrl(base: string): string {
  const b = base.replace(/\/+$/, "");
  if (b.endsWith("/chat/completions")) return b;
  if (b.endsWith("/v1")) return `${b}/chat/completions`;
  return `${b}/v1/chat/completions`;
}

type CallOptions = {
  model: string;
  messages: ChatMessage[];
  maxTokens: number;
  temperature?: number;
};

export async function callMimoChat({
  model,
  messages,
  maxTokens,
  temperature = 0.12,
}: CallOptions): Promise<{ content: string; raw: unknown }> {
  const key = process.env.MIMO_API_KEY;
  const base = process.env.MIMO_BASE_URL;
  if (!key || !base) {
    throw new Error("Missing MIMO_API_KEY or MIMO_BASE_URL");
  }

  const url = joinChatCompletionsUrl(base);
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: maxTokens,
      temperature,
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`MIMO error ${res.status}: ${errText.slice(0, 400)}`);
  }

  const raw = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = raw.choices?.[0]?.message?.content ?? "";
  return { content, raw };
}

const SYSTEM_PROMPT_DEFAULT = `You are a precise AI study assistant for revision and practice.

You will receive OCR text extracted from a cropped screenshot.

Your tasks:

1. Decide whether the crop contains one question or multiple questions.
2. If it contains one question, return a single JSON object.
3. If it contains multiple questions, return a JSON object with answerType "multi" and an items array.
4. If the answer is code, put the code in finalCode and set answerType to "code".
5. If the answer is normal text or MCQ, put the answer in finalAnswer and set answerType to "text".
6. Always provide explanation.
7. If it is multiple-choice, identify the best option and explain why.
8. If it contains code, reconstruct and trace the code carefully.
9. If OCR is imperfect but understandable, answer with medium or low confidence.
10. If OCR is too unclear, explain what is unclear and set needsClearerCrop to true.
11. Do not return empty fields.
12. Return valid JSON only. Do not use markdown code fences.

For a single question, return exactly this shape:
{
"answerType": "text" | "code",
"finalAnswer": "...",
"explanation": "...",
"keyConcept": "...",
"optionAnalysis": "...",
"confidence": "high" | "medium" | "low",
"ocrWarning": "",
"needsClearerCrop": false,
"codeLanguage": "",
"finalCode": ""
}

For code-generation answers:
{
"answerType": "code",
"finalAnswer": "See code solution.",
"explanation": "Short explanation of what the code does.",
"keyConcept": "...",
"optionAnalysis": "",
"confidence": "high" | "medium" | "low",
"ocrWarning": "",
"needsClearerCrop": false,
"codeLanguage": "java" | "python" | "sql" | "cpp" | "javascript" | "text",
"finalCode": "complete code here"
}

For multiple questions, return exactly this shape:
{
"answerType": "multi",
"finalAnswer": "Multiple questions detected.",
"explanation": "Answered each question separately.",
"keyConcept": "",
"optionAnalysis": "",
"confidence": "medium",
"ocrWarning": "",
"needsClearerCrop": false,
"codeLanguage": "",
"finalCode": "",
"items": [
{
"questionNumber": "1",
"questionText": "...",
"answerType": "text" | "code",
"finalAnswer": "...",
"explanation": "...",
"keyConcept": "...",
"optionAnalysis": "...",
"confidence": "high" | "medium" | "low",
"codeLanguage": "",
"finalCode": ""
}
]
}`;

const SYSTEM_PROMPT_DEEPER = `You are a precise AI study assistant for revision and practice.

The user wants a deeper explanation. Preserve answerType from the original answer intent.
If answerType is multi, explain each item more deeply.
If answerType is code, explain the code line-by-line and keep finalCode.

Return strict JSON only (no markdown, no code fences):
{
"answerType": "text" | "code" | "multi",
"finalAnswer": "...",
"explanation": "...",
"keyConcept": "...",
"optionAnalysis": "...",
"confidence": "high" | "medium" | "low",
"ocrWarning": "",
"needsClearerCrop": false,
"codeLanguage": "",
"finalCode": "",
"items": []
}

Do not leave finalAnswer or explanation empty if OCR is readable.`;

const SYSTEM_PROMPT_AUTO_RETRY = `You are a precise AI study assistant. A previous attempt returned incomplete, empty, or invalid JSON.

You MUST return one complete, valid JSON object only. The OCR text contains a real question — answer it fully.

Use exactly these keys:
{
"answerType": "text" | "code" | "multi",
"finalAnswer": "...",
"explanation": "...",
"keyConcept": "...",
"optionAnalysis": "...",
"confidence": "high" | "medium" | "low",
"ocrWarning": "",
"needsClearerCrop": false,
"codeLanguage": "",
"finalCode": "",
"items": []
}

finalAnswer and explanation must be non-empty strings unless the OCR is genuinely unreadable (then explain why, set needsClearerCrop true). Do not use markdown code fences. Do not add text outside the JSON object.`;

export function studyModelId(): string {
  return (
    process.env.MIMO_STUDY_MODEL ??
    process.env.MIMO_FAST_MODEL ??
    process.env.MIMO_PRO_MODEL ??
    "mimo-v2.5"
  );
}

function buildUserBlock(ocrText: string, deeper: boolean): string {
  const hints: string[] = [];
  if (looksLikeCode(ocrText)) hints.push("The OCR appears to include programming code.");
  if (looksLikeMultipleChoice(ocrText)) hints.push("The OCR appears to include multiple-choice options.");
  if (multipleQuestionsLikely(ocrText)) {
    hints.push("multipleQuestionsLikely: true. Return answerType 'multi' with one item per question.");
  }

  const hintLine = hints.length ? `\nHeuristics: ${hints.join(" ")}\n` : "";

  if (deeper) {
    return `OCR text:\n\n${ocrText}${hintLine}\nProvide a deeper explanation (longer explanation and optionAnalysis as needed).`;
  }
  return `OCR text:\n\n${ocrText}${hintLine}`;
}

function mergeParseWarnings(a?: string, b?: string): string {
  const parts = [a, b].filter((x) => x && x.trim()) as string[];
  if (!parts.length) return "";
  return [...new Set(parts.map((p) => p.trim()))].join(" ");
}

function parsedFieldsToResponse(
  p: ParsedModelFields,
  extraParseWarning: string,
): Omit<StudyAnalyzeResponse, "ocrText" | "ocrConfidence" | "ocrLanguage" | "ocrLang"> {
  return {
    answerType: p.answerType,
    finalAnswer: p.finalAnswer,
    explanation: p.explanation,
    keyConcept: p.keyConcept,
    optionAnalysis: p.optionAnalysis,
    codeLanguage: p.codeLanguage,
    finalCode: p.finalCode,
    items: p.items,
    modelUsed: studyModelId(),
    mode: "normal",
    confidence: p.confidence,
    ocrWarning: p.ocrWarning,
    needsClearerCrop: p.needsClearerCrop,
    modelRawText: "",
    parseWarning: mergeParseWarnings(extraParseWarning, p.parseWarning),
    usedAutoRetry: false,
    retryReason: "",
    rawOcrText: "",
    ocrDebug: {
      originalWidth: 0,
      originalHeight: 0,
      processedWidth: 0,
      processedHeight: 0,
    },
    timing: {
      preprocessMs: 0,
      ocrMs: 0,
      modelMs: 0,
      parseMs: 0,
      totalMs: 0,
    },
  };
}

function answerQuality(p: ParsedModelFields): number {
  return p.finalAnswer.length + p.explanation.length + p.keyConcept.length + p.optionAnalysis.length;
}

function pickBetterParsed(a: ParsedModelFields, b: ParsedModelFields): ParsedModelFields {
  const aBad = isUnusableParsed(a);
  const bBad = isUnusableParsed(b);
  if (aBad && !bBad) return b;
  if (!aBad && bBad) return a;
  if (answerQuality(b) > answerQuality(a)) return b;
  return a;
}

/**
 * Runs analysis with one automatic retry when the first pass is weak or unparseable.
 */
export async function analyzeQuestionText(params: {
  ocrText: string;
  deeperExplanation: boolean;
}): Promise<StudyAnalyzeResponse> {
  const t0 = Date.now();
  let parseMs = 0;
  let modelMs = 0;
  const model = studyModelId();
  const ocrLen = params.ocrText.trim().length;
  const mode: "normal" | "deep" = params.deeperExplanation ? "deep" : "normal";

  const maxTokensFirst = params.deeperExplanation ? 2000 : 1200;
  const maxTokensRetry = 2000;

  const systemFirst = params.deeperExplanation ? SYSTEM_PROMPT_DEEPER : SYSTEM_PROMPT_DEFAULT;
  const userBlock = buildUserBlock(params.ocrText, params.deeperExplanation);

  const m0 = Date.now();
  let { content: raw1 } = await callMimoChat({
    model,
    messages: [
      { role: "system", content: systemFirst },
      { role: "user", content: userBlock },
    ],
    maxTokens: maxTokensFirst,
    temperature: 0.1,
  });
  modelMs += Date.now() - m0;

  console.log("[StudyCapture][LLM] model raw (first pass)", raw1.slice(0, 4000) + (raw1.length > 4000 ? "\n… [truncated]" : ""));

  let p1Start = Date.now();
  let p1 = parseModelResponse(raw1);
  parseMs += Date.now() - p1Start;
  console.log("[StudyCapture][LLM] parsed (first pass)", {
    jsonParsed: p1.jsonParsed,
    finalAnswerPreview: p1.finalAnswer.slice(0, 120),
    explanationLen: p1.explanation.length,
    parseWarning: p1.parseWarning,
  });

  let chosen = p1;
  let modelRawText = raw1;
  let usedAutoRetry = false;
  let retryReason = "";

  if (!params.deeperExplanation && shouldAutoRetryParsed(p1, ocrLen)) {
    retryReason = "First response was malformed or unusable.";
    const retryUser = `${userBlock}\n\n[Automatic retry: your previous reply was incomplete, malformed, or had empty fields. Output one complete JSON object with non-empty finalAnswer and explanation.]`;

    const m1 = Date.now();
    const { content: raw2 } = await callMimoChat({
      model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT_AUTO_RETRY },
        { role: "user", content: retryUser },
      ],
      maxTokens: maxTokensRetry,
      temperature: 0.08,
    });
    modelMs += Date.now() - m1;

    console.log("[StudyCapture][LLM] model raw (auto-retry)", raw2.slice(0, 4000) + (raw2.length > 4000 ? "\n… [truncated]" : ""));

    const p2Start = Date.now();
    const p2 = parseModelResponse(raw2);
    parseMs += Date.now() - p2Start;
    console.log("[StudyCapture][LLM] parsed (auto-retry)", {
      jsonParsed: p2.jsonParsed,
      finalAnswerPreview: p2.finalAnswer.slice(0, 120),
      explanationLen: p2.explanation.length,
    });

    const better = pickBetterParsed(p1, p2);
    usedAutoRetry = true;
    if (better === p2 && !isUnusableParsed(p2)) {
      chosen = p2;
      modelRawText = `[first]\n${raw1}\n\n[retry]\n${raw2}`;
      retryReason = "First response was malformed or unusable.";
    } else if (better === p2) {
      chosen = p2;
      modelRawText = `[first]\n${raw1}\n\n[retry]\n${raw2}`;
      retryReason = "First response was malformed or unusable.";
    } else {
      chosen = p1;
      modelRawText = `[first]\n${raw1}\n\n[retry]\n${raw2}`;
      retryReason = "First response was malformed or unusable.";
    }
  }

  const base = parsedFieldsToResponse(chosen, "");
  let out: StudyAnalyzeResponse = {
    ...base,
    ocrText: params.ocrText,
    ocrConfidence: 0,
    ocrLanguage: "eng",
    ocrLang: "eng",
    rawOcrText: params.ocrText,
    mode,
    modelRawText,
    usedAutoRetry,
    retryReason,
    ocrDebug: {
      originalWidth: 0,
      originalHeight: 0,
      processedWidth: 0,
      processedHeight: 0,
    },
    timing: {
      preprocessMs: 0,
      ocrMs: 0,
      modelMs,
      parseMs,
      totalMs: Date.now() - t0,
    },
  };

  if (params.deeperExplanation) {
    out.explanation = clampWordCount(out.explanation, 400);
    out.optionAnalysis = clampWordCount(out.optionAnalysis, 400);
  }

  console.log("[StudyCapture][LLM] final normalized", {
    usedAutoRetry: out.usedAutoRetry,
    retryReason: out.retryReason,
    finalAnswer: out.finalAnswer.slice(0, 200),
    parseWarning: out.parseWarning,
  });

  return out;
}
