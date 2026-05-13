import { parseModelResponse, extractFirstJsonObject } from "./parseModelResponse";

export { extractFirstJsonObject };

export type StudyAnalyzeResponse = {
  ocrText: string;
  rawOcrText: string;
  /** Mean OCR engine confidence 0–100 */
  ocrConfidence: number;
  /** Primary field — Tesseract language string, e.g. eng or eng+deu */
  ocrLanguage: string;
  /** @deprecated alias for ocrLanguage */
  ocrLang?: string;
  finalAnswer: string;
  explanation: string;
  keyConcept: string;
  optionAnalysis: string;
  answerType: "text" | "code" | "multi";
  codeLanguage: string;
  finalCode: string;
  items: Array<{
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
  }>;
  /** Model id string from the API, e.g. mimo-v2.5 */
  modelUsed: string;
  /** normal = first analysis; deep = Explain More */
  mode: "normal" | "deep";
  confidence: "high" | "medium" | "low";
  ocrWarning: string;
  needsClearerCrop: boolean;
  /** Debug only — omit from main UI */
  modelRawText: string;
  parseWarning: string;
  usedAutoRetry: boolean;
  retryReason: string;
  ocrDebug: {
    originalWidth: number;
    originalHeight: number;
    processedWidth: number;
    processedHeight: number;
  };
  timing: {
    preprocessMs: number;
    ocrMs: number;
    modelMs: number;
    parseMs: number;
    totalMs: number;
  };
};

const CODE_KEYWORD_RE =
  /\b(public|static|void|class|extends|implements|import|System\.out|println|int|double|String|boolean|def|return|print|pandas|pd\.|df|numpy|np\.|for|while|if|elif|else|#include|using\s+namespace|cout|cin|sizeof|nullptr|this|super|try|catch|finally|throws|new\s+\w+|ArrayList|List<|Map<|HashMap|interface|enum|package|abstract|final|volatile|synchronized)\b/i;

const CODE_SYMBOL_LINE =
  /[{}();]|^\s{2,}\S|;\s*$|\[[^\]]*\]|->|::|=>|\+\+|--|==|!=|<=|>=|&&|\|\||\+=|-=|\*=|\/=|%=|<<|>>/;

const MCQ_PATTERNS = [
  /(?:^|\n)\s*[A-Da-d][\.\)]\s+\S/,
  /(?:^|\n)\s*\([a-d]\)\s+\S/i,
  /(?:^|\n)\s*[A-D][\.\)]\s+\S/,
  /(?:^|\n)\s*(?:Option|Choice)\s*[A-D1-4]/i,
];

export function looksLikeCode(text: string): boolean {
  if (CODE_KEYWORD_RE.test(text)) return true;
  if (/[{};]/.test(text) && /[()]/.test(text)) return true;

  const lines = text.split("\n");
  const nonEmpty = lines.filter((l) => l.trim().length > 0);
  if (nonEmpty.length < 2) return false;

  let codeLikeLines = 0;
  for (const line of nonEmpty) {
    const t = line.trim();
    if (CODE_SYMBOL_LINE.test(line) || /^\s*#include\b/.test(t)) {
      codeLikeLines++;
      continue;
    }
    if (/^\s*(def |class |import |from |public |private |protected |package )/i.test(t)) {
      codeLikeLines++;
    }
  }
  if (codeLikeLines >= 2) return true;
  if (nonEmpty.length >= 4 && codeLikeLines >= 1 && /;/.test(text)) return true;

  return false;
}

export function looksLikeMultipleChoice(text: string): boolean {
  for (const re of MCQ_PATTERNS) {
    if (re.test(text)) return true;
  }
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  let optionish = 0;
  for (const line of lines) {
    if (/^[A-Da-d][\.\)]\s/.test(line) || /^\([a-d]\)\s/i.test(line)) optionish++;
  }
  return optionish >= 2;
}

export function mcqOptionsIncomplete(text: string): boolean {
  if (!looksLikeMultipleChoice(text)) return false;
  const hasA = /(?:^|\n)\s*A[\.\)]\s+/i.test(text);
  const hasB = /(?:^|\n)\s*B[\.\)]\s+/i.test(text);
  const hasC = /(?:^|\n)\s*C[\.\)]\s+/i.test(text);
  const hasD = /(?:^|\n)\s*D[\.\)]\s+/i.test(text);
  const count = [hasA, hasB, hasC, hasD].filter(Boolean).length;
  return count < 4;
}

export function multipleQuestionsLikely(text: string): boolean {
  const t = text;
  const numberedQ =
    (t.match(/(?:^|\n)\s*(?:Question|Q|Test)\s*\d+[\).\:\-]?\s+/gi) || []).length;
  if (numberedQ >= 2) return true;

  const numericStarts = (t.match(/(?:^|\n)\s*\d+[\.\)]\s+[A-Z]/g) || []).length;
  if (numericStarts >= 2) return true;

  const questionMarks = (t.match(/\?/g) || []).length;
  const optionBlocks =
    (t.match(/(?:^|\n)\s*(?:A[\.\)]|B[\.\)]|C[\.\)]|D[\.\)])/gim) || []).length;
  if (questionMarks >= 2 && optionBlocks >= 6) return true;

  const splitMcqGroups =
    (t.match(/(?:^|\n)\s*(?:1|2|3|4|5)[\.\)]\s+[^\n]+\n[\s\S]{0,220}?(?:^|\n)\s*A[\.\)]\s+/gim) || [])
      .length;
  return splitMcqGroups >= 2;
}

export function isComplexOcr(text: string): boolean {
  const t = text.trim();
  if (t.length > 1200) return true;
  const weird = (t.match(/[^\w\s.,;:!?'"()\-–—[\]{}%/+=<>]/g) || []).length;
  if (t.length > 200 && weird / t.length > 0.12) return true;
  if ((t.match(/\n/g) || []).length > 40) return true;
  return false;
}

/**
 * Light normalization only: unify newlines, trim outer whitespace, collapse extreme blank runs.
 */
export function cleanOcrText(raw: string): string {
  if (!raw) return "";
  let t = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  t = t.replace(/\n{5,}/g, "\n\n\n\n");
  return t.trim();
}

export function ocrSymbolsMayBeCorrupted(text: string): boolean {
  if (!looksLikeCode(text)) return false;
  const o = (text.match(/\{/g) || []).length;
  const c = (text.match(/\}/g) || []).length;
  if (Math.abs(o - c) > 2) return true;
  const op = (text.match(/\(/g) || []).length;
  const cp = (text.match(/\)/g) || []).length;
  if (Math.abs(op - cp) > 2) return true;
  const sq = (text.match(/\[/g) || []).length;
  const sqc = (text.match(/\]/g) || []).length;
  if (Math.abs(sq - sqc) > 2) return true;
  return false;
}

const DEFAULT_OCR_WARNING =
  "OCR may have misread some code symbols. Try cropping a clearer/larger area.";

export function buildServerOcrWarning(
  ocrConfidence: number,
  text: string,
): string | undefined {
  const parts: string[] = [];
  if (ocrConfidence > 0 && ocrConfidence < 58) {
    parts.push(DEFAULT_OCR_WARNING);
  }
  if (ocrSymbolsMayBeCorrupted(text)) {
    parts.push(DEFAULT_OCR_WARNING);
  }
  if (mcqOptionsIncomplete(text)) {
    parts.push("Some answer options may be missing from OCR. Try cropping the full question and all options.");
  }
  if (parts.length === 0) return undefined;
  return [...new Set(parts)].join(" ");
}

/** @deprecated use parseModelResponse */
export function parseStudyJsonFromContent(
  content: string,
): Partial<StudyAnalyzeResponse> | null {
  const p = parseModelResponse(content);
  if (!p.jsonParsed) return null;
  return {
    finalAnswer: p.finalAnswer,
    explanation: p.explanation,
    keyConcept: p.keyConcept,
    optionAnalysis: p.optionAnalysis,
    answerType: p.answerType,
    codeLanguage: p.codeLanguage,
    finalCode: p.finalCode,
    items: p.items,
    confidence: p.confidence,
    ocrWarning: p.ocrWarning,
    needsClearerCrop: p.needsClearerCrop,
    ocrText: "",
    ocrConfidence: 0,
    ocrLanguage: "eng",
    modelUsed: "",
    mode: "normal",
    modelRawText: "",
    parseWarning: p.parseWarning ?? "",
    usedAutoRetry: false,
    retryReason: "",
  };
}

export function fallbackParseFromProse(content: string): Partial<StudyAnalyzeResponse> {
  const p = parseModelResponse(content);
  return {
    finalAnswer: p.finalAnswer,
    explanation: p.explanation,
    keyConcept: p.keyConcept,
    optionAnalysis: p.optionAnalysis,
    answerType: p.answerType,
    codeLanguage: p.codeLanguage,
    finalCode: p.finalCode,
    items: p.items,
    confidence: p.confidence,
    ocrWarning: p.ocrWarning,
    needsClearerCrop: p.needsClearerCrop,
    ocrText: "",
    ocrConfidence: 0,
    ocrLanguage: "eng",
    modelUsed: "",
    mode: "normal",
    modelRawText: p.modelRawText ?? "",
    parseWarning: p.parseWarning ?? "",
    usedAutoRetry: false,
    retryReason: "",
  };
}

export function clampWordCount(text: string, maxWords: number): string {
  const t = text.trim();
  if (!t) return t;
  const words = t.split(/\s+/);
  if (words.length <= maxWords) return t;
  return `${words.slice(0, maxWords).join(" ")}…`;
}

