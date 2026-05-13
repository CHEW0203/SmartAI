export type ParsedItem = {
  questionNumber: string;
  questionText: string;
  finalAnswer: string;
  explanation: string;
  keyConcept: string;
  optionAnalysis: string;
  answerType: "text" | "code";
  codeLanguage: string;
  finalCode: string;
  confidence: "high" | "medium" | "low";
};

export type ParsedModelFields = {
  finalAnswer: string;
  explanation: string;
  keyConcept: string;
  optionAnalysis: string;
  confidence: "high" | "medium" | "low";
  ocrWarning: string;
  needsClearerCrop: boolean;
  answerType: "text" | "code" | "multi";
  codeLanguage: string;
  finalCode: string;
  items: ParsedItem[];
  parseWarning?: string;
  modelRawText?: string;
  jsonParsed: boolean;
};

function normalizeConfidence(v: unknown): "high" | "medium" | "low" {
  const s = String(v ?? "").toLowerCase();
  if (s === "high" || s === "medium" || s === "low") return s;
  return "medium";
}

function pickStr(obj: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const v = obj[k];
    if (v != null && typeof v !== "object") {
      const s = String(v).trim();
      if (s) return s;
    }
  }
  return "";
}

/** Remove markdown ```json ... ``` wrappers (first fence block or line-based). */
export function stripCodeFence(text: string): string {
  let t = text.trim();
  const multiline = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (multiline) return multiline[1].trim();
  t = t.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "");
  return t.trim();
}

export function normalizeSmartQuotes(text: string): string {
  return text
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/,\s*([}\]])/g, "$1");
}

/**
 * First balanced `{ ... }` by brace depth; respects strings and escapes.
 * Do not use greedy /{.*}/s.
 */
export function extractFirstJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (c === "\\" && inString) {
      escape = true;
      continue;
    }
    if (c === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

export function extractFirstJsonArray(text: string): string | null {
  const start = text.indexOf("[");
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (c === "\\" && inString) {
      escape = true;
      continue;
    }
    if (c === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (c === "[") depth++;
    else if (c === "]") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

function parseJsonCore(text: string): unknown | null {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    /* ignore */
  }
  return null;
}

export function tryParseJson(text: string): {
  value: unknown | null;
  warning?: string;
} {
  const trimmed = text.trim();
  if (!trimmed) return { value: null };
  const normalized = normalizeSmartQuotes(stripCodeFence(trimmed));

  let v = parseJsonCore(normalized);
  if (v == null) {
    const obj = extractFirstJsonObject(normalized);
    if (obj) {
      v = parseJsonCore(obj);
      if (v != null) return { value: v, warning: "JSON was embedded in surrounding text." };
    }
  }
  if (v == null) {
    const arr = extractFirstJsonArray(normalized);
    if (arr) {
      v = parseJsonCore(arr);
      if (v != null) return { value: v, warning: "JSON array was embedded in surrounding text." };
    }
  }
  if (typeof v === "string") {
    const nested = parseJsonCore(normalizeSmartQuotes(stripCodeFence(v.trim())));
    if (nested != null) return { value: nested, warning: "Model returned escaped JSON string." };
  }
  return { value: v };
}

function itemFromRecord(obj: Record<string, unknown>, idx: number): ParsedItem {
  const codeLanguage = pickStr(obj, ["codeLanguage", "language"]);
  const finalCode = pickStr(obj, ["finalCode", "code", "solutionCode"]);
  const answerType = finalCode ? "code" : "text";
  return {
    questionNumber: pickStr(obj, ["questionNumber", "number"]) || String(idx + 1),
    questionText: pickStr(obj, ["questionText", "question", "prompt"]),
    finalAnswer: pickStr(obj, ["finalAnswer", "answer", "correctAnswer", "result"]),
    explanation: pickStr(obj, ["explanation", "reasoning", "analysis"]),
    keyConcept: pickStr(obj, ["keyConcept", "concept"]),
    optionAnalysis: pickStr(obj, ["optionAnalysis", "optionsAnalysis", "optionExplanation"]),
    answerType,
    codeLanguage,
    finalCode,
    confidence: normalizeConfidence(obj.confidence),
  };
}

function normalizeFromUnknown(
  value: unknown,
  rawForDebug: string,
  parseNote?: string,
): ParsedModelFields {
  let obj: Record<string, unknown> = {};
  if (Array.isArray(value)) {
    obj = {
      answerType: "multi",
      finalAnswer: "Multiple questions detected.",
      explanation: "Answered each question separately.",
      items: value,
    };
  } else if (value && typeof value === "object") {
    obj = value as Record<string, unknown>;
  }

  let finalAnswer = pickStr(obj, ["finalAnswer", "answer", "correctAnswer", "result"]);
  let explanation = pickStr(obj, ["explanation", "reasoning", "analysis"]);
  const keyConcept = pickStr(obj, ["keyConcept", "concept"]);
  let optionAnalysis = pickStr(obj, [
    "optionAnalysis",
    "optionsAnalysis",
    "optionExplanation",
  ]);
  const confidence = normalizeConfidence(obj.confidence);
  const ocrWarning = String(obj.ocrWarning ?? "").trim();
  const needsClearerCrop = Boolean(obj.needsClearerCrop);
  const codeLanguage = pickStr(obj, ["codeLanguage", "language"]);
  const finalCode = pickStr(obj, ["finalCode", "code", "solutionCode"]);

  let items: ParsedItem[] = [];
  const itemsRaw = obj.items ?? obj.questions;
  if (Array.isArray(itemsRaw)) {
    items = itemsRaw
      .filter((it) => it && typeof it === "object")
      .map((it, idx) => itemFromRecord(it as Record<string, unknown>, idx));
  }

  const tryRepairInText = (t: string): Record<string, unknown> | null => {
    const parsed = tryParseJson(t).value;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return null;
  };

  if ((!finalAnswer || finalAnswer === "{") && explanation.includes("finalAnswer")) {
    const inner = tryRepairInText(explanation);
    if (inner) {
      if (!finalAnswer) {
        finalAnswer = pickStr(inner, ["finalAnswer", "answer", "correctAnswer", "result"]);
      }
      explanation = pickStr(inner, ["explanation", "reasoning", "analysis"]) || explanation;
      if (!optionAnalysis) {
        optionAnalysis = pickStr(inner, ["optionAnalysis", "optionsAnalysis", "optionExplanation"]);
      }
    }
  }

  let answerType = pickStr(obj, ["answerType"]).toLowerCase() as ParsedModelFields["answerType"];
  if (answerType !== "multi" && answerType !== "code" && answerType !== "text") {
    if (items.length > 0) answerType = "multi";
    else if (finalCode) answerType = "code";
    else answerType = "text";
  }

  return {
    finalAnswer: finalAnswer.trim(),
    explanation: explanation.trim(),
    keyConcept: keyConcept.trim(),
    optionAnalysis: optionAnalysis.trim(),
    confidence,
    ocrWarning,
    needsClearerCrop,
    answerType,
    codeLanguage,
    finalCode,
    items,
    parseWarning: parseNote,
    modelRawText: rawForDebug,
    jsonParsed: true,
  };
}

function proseFallback(rawText: string): ParsedModelFields {
  const explanation = rawText.replace(/\r\n/g, "\n").trim().slice(0, 16000);
  return {
    finalAnswer: "See explanation",
    explanation: explanation || rawText.slice(0, 16000),
    keyConcept: "",
    optionAnalysis: "",
    confidence: "medium",
    ocrWarning: "",
    needsClearerCrop: false,
    answerType: "text",
    codeLanguage: "",
    finalCode: "",
    items: [],
    parseWarning: "Model response was not valid JSON.",
    modelRawText: rawText,
    jsonParsed: false,
  };
}

/**
 * Parse model output into normalized fields. Never puts raw JSON into explanation when JSON parses.
 */
export function parseModelResponse(rawText: string): ParsedModelFields {
  const trimmed = rawText.trim();
  if (!trimmed) {
    return {
      finalAnswer: "See explanation",
      explanation: "(Empty model response)",
      keyConcept: "",
      optionAnalysis: "",
      confidence: "low",
      ocrWarning: "",
      needsClearerCrop: false,
      answerType: "text",
      codeLanguage: "",
      finalCode: "",
      items: [],
      parseWarning: "Empty model response.",
      modelRawText: rawText,
      jsonParsed: false,
    };
  }

  const parsed = tryParseJson(trimmed);
  if (parsed.value != null) {
    return normalizeFromUnknown(parsed.value, rawText, parsed.warning);
  }

  return proseFallback(rawText);
}

export function isUnusableParsed(p: ParsedModelFields): boolean {
  const fa = p.finalAnswer.trim();
  const ex = p.explanation.trim();
  const looksLikeJsonBlob = /"finalAnswer"\s*:/.test(ex) || (/^\s*[\[{]/.test(ex) && /"explanation"\s*:/.test(ex));
  if (!fa || fa === "-" || fa === "—" || fa === "{") return true;
  if (fa === "See explanation" && !p.jsonParsed) return true;
  if (fa === "See explanation" && looksLikeJsonBlob) return true;
  if (!ex) return true;
  if (fa.startsWith("{") && fa.includes("finalAnswer")) return true;
  return false;
}

/** Whether the first model pass should trigger a single automatic retry. */
export function shouldAutoRetryParsed(p: ParsedModelFields, ocrTextLength: number): boolean {
  if (!p.jsonParsed) return true;
  const fa = p.finalAnswer.trim();
  const ex = p.explanation.trim();
  const exLooksJson = /"finalAnswer"\s*:/.test(ex);
  if (!fa || fa === "-" || fa === "—" || fa === "{") return true;
  if (!ex) return true;
  if (fa === "See explanation") return true;
  if (fa === "See explanation" && exLooksJson) return true;
  if (isUnusableParsed(p)) return true;
  if (p.confidence === "low" && ocrTextLength >= 50) return true;
  return false;
}
