export type StudyAnalyzeResponse = {
  ocrText: string;
  rawOcrText: string;
  ocrConfidence: number;
  ocrLanguage: string;
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
  modelUsed: string;
  mode: "normal" | "deep";
  confidence: "high" | "medium" | "low";
  ocrWarning: string;
  needsClearerCrop: boolean;
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

export type CaptureVisibleTabResponse =
  | { ok: true; dataUrl: string }
  | { ok: false; error: string };

export type ViewportRect = { left: number; top: number; width: number; height: number };

export const MSG_CAPTURE_VISIBLE = "STUDY_CAPTURE_VISIBLE_TAB" as const;
