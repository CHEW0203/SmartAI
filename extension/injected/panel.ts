import type { StudyAnalyzeResponse } from "./types";

// IMPORTANT: This module runs as DOM UI only. Do not call chrome.runtime here.
console.log("[StudyCapture Extension] panel module loaded v-runtime-fix-2");

const PANEL_ID = "study-capture-ext-panel-root";

export type StudyPanelController = {
  open: () => void;
  close: () => void;
  setLoading: (loading: boolean, message: string) => void;
  setExplainBusy: (busy: boolean) => void;
  setError: (message: string | null) => void;
  setResult: (result: StudyAnalyzeResponse | null) => void;
  onExplainMore: (handler: () => void) => void;
};

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function mountStudyAssistantPanel(): StudyPanelController {
  document.getElementById(PANEL_ID)?.remove();

  const root = document.createElement("aside");
  root.id = PANEL_ID;
  root.className = "study-capture-ext-panel";
  root.setAttribute("data-study-capture-ui", "");
  root.style.display = "none";

  const header = el("header", "study-capture-ext-panel-header");
  const titleWrap = el("div");
  titleWrap.appendChild(el("div", "study-capture-ext-panel-title", "Study Assistant"));
  const subtitle = el("div", "study-capture-ext-panel-subtitle", "");
  titleWrap.appendChild(subtitle);

  const closeBtn = el("button", "study-capture-ext-panel-close", "Close");
  closeBtn.type = "button";
  header.appendChild(titleWrap);
  header.appendChild(closeBtn);

  const body = el("div", "study-capture-ext-panel-body");
  const notice = el(
    "p",
    "study-capture-ext-panel-notice",
    "For revision and practice only. Do not use during live graded assessments.",
  );

  const loadingRow = el("div", "study-capture-ext-panel-loading");
  loadingRow.style.display = "none";
  const spinner = el("span", "study-capture-ext-spinner");
  spinner.setAttribute("aria-hidden", "true");
  const loadingText = el("p", "study-capture-ext-loading-text", "");
  loadingRow.appendChild(spinner);
  loadingRow.appendChild(loadingText);

  const errorBox = el("div", "study-capture-ext-error");
  errorBox.style.display = "none";
  errorBox.setAttribute("role", "alert");

  const resultWrap = el("div", "study-capture-ext-result");
  resultWrap.style.display = "none";

  const parseRetryStrip = el("div", "study-capture-ext-debug-strip");
  parseRetryStrip.style.display = "none";

  const sections = {
    finalAnswer: makeSection("Final Answer", true),
    explanation: makeSection("Explanation"),
    keyConcept: makeSection("Key Concept"),
    optionAnalysis: makeSection("Option Analysis"),
    modelUsed: makeSection("Model Used"),
    confidence: makeSection("Answer Confidence"),
  };

  const codeBlock = document.createElement("section");
  codeBlock.className = "study-capture-ext-code-wrap";
  codeBlock.style.display = "none";
  const codeTitle = el("h3", "study-capture-ext-section-title", "Code Solution");
  const codeLang = el("p", "study-capture-ext-ocr-meta", "");
  const copyCodeBtn = el("button", "study-capture-ext-btn-secondary", "Copy Code");
  copyCodeBtn.type = "button";
  const codePre = el("pre", "study-capture-ext-ocr-pre", "");
  codeBlock.appendChild(codeTitle);
  codeBlock.appendChild(codeLang);
  codeBlock.appendChild(copyCodeBtn);
  codeBlock.appendChild(codePre);

  const multiWrap = document.createElement("section");
  multiWrap.className = "study-capture-ext-multi-wrap";
  multiWrap.style.display = "none";

  const ocrBlock = el("section", "study-capture-ext-ocr-block");
  const ocrDetails = document.createElement("details");
  ocrDetails.className = "study-capture-ext-ocr-details";
  ocrDetails.open = true;
  const ocrSummary = el("summary", "study-capture-ext-ocr-summary");
  ocrDetails.appendChild(ocrSummary);
  const ocrToolbar = el("div", "study-capture-ext-ocr-toolbar");
  const copyOcrBtn = el("button", "study-capture-ext-btn-secondary", "Copy OCR Text");
  copyOcrBtn.type = "button";
  ocrToolbar.appendChild(copyOcrBtn);
  ocrDetails.appendChild(ocrToolbar);
  const ocrPre = el("pre", "study-capture-ext-ocr-pre");
  ocrDetails.appendChild(ocrPre);
  ocrBlock.appendChild(ocrDetails);

  const clearerCropBanner = el("div", "study-capture-ext-banner-crop");
  clearerCropBanner.style.display = "none";
  clearerCropBanner.textContent =
    "OCR may not have captured the question clearly. Try cropping a larger area including the full question, code, and all options.";

  const ocrWarnBox = el("div", "study-capture-ext-ocr-warn");
  ocrWarnBox.style.display = "none";

  const modelRawDetails = document.createElement("details");
  modelRawDetails.className = "study-capture-ext-model-raw";
  modelRawDetails.style.display = "none";
  const modelRawSummary = el("summary", "study-capture-ext-ocr-summary", "Debug: raw model output");
  const modelRawPre = el("pre", "study-capture-ext-ocr-pre");
  modelRawDetails.appendChild(modelRawSummary);
  modelRawDetails.appendChild(modelRawPre);

  const actions = el("div", "study-capture-ext-actions");
  const explainBtn = el("button", "study-capture-ext-btn-primary", "Explain More");
  explainBtn.type = "button";
  actions.appendChild(explainBtn);

  body.appendChild(notice);
  body.appendChild(loadingRow);
  body.appendChild(errorBox);
  body.appendChild(resultWrap);

  resultWrap.appendChild(parseRetryStrip);
  resultWrap.appendChild(sections.finalAnswer.wrap);
  resultWrap.appendChild(codeBlock);
  resultWrap.appendChild(multiWrap);
  resultWrap.appendChild(sections.explanation.wrap);
  resultWrap.appendChild(sections.keyConcept.wrap);
  resultWrap.appendChild(sections.optionAnalysis.wrap);
  resultWrap.appendChild(sections.modelUsed.wrap);
  resultWrap.appendChild(sections.confidence.wrap);
  resultWrap.appendChild(ocrBlock);
  resultWrap.appendChild(clearerCropBanner);
  resultWrap.appendChild(ocrWarnBox);
  resultWrap.appendChild(modelRawDetails);
  resultWrap.appendChild(actions);

  root.appendChild(header);
  root.appendChild(body);
  document.documentElement.appendChild(root);

  let explainHandler: (() => void) | null = null;
  let loading = false;
  let explainBusy = false;
  let lastOcrForCopy = "";
  let lastCodeForCopy = "";

  closeBtn.addEventListener("click", () => {
    root.style.display = "none";
  });

  explainBtn.addEventListener("click", () => {
    window.dispatchEvent(
      new CustomEvent("study-capture:explain-more", {
        detail: { ocrText: lastOcrForCopy },
      }),
    );
    explainHandler?.();
  });

  copyOcrBtn.addEventListener("click", async () => {
    if (!lastOcrForCopy) return;
    try {
      await navigator.clipboard.writeText(lastOcrForCopy);
      copyOcrBtn.textContent = "Copied";
      window.setTimeout(() => {
        copyOcrBtn.textContent = "Copy OCR Text";
      }, 2000);
    } catch {
      /* ignore */
    }
  });
  copyCodeBtn.addEventListener("click", async () => {
    if (!lastCodeForCopy) return;
    try {
      await navigator.clipboard.writeText(lastCodeForCopy);
      copyCodeBtn.textContent = "Copied";
      window.setTimeout(() => {
        copyCodeBtn.textContent = "Copy Code";
      }, 2000);
    } catch {
      /* ignore */
    }
  });

  function syncChrome() {
    const busy = loading || explainBusy;
    loadingRow.style.display = busy ? "flex" : "none";
    if (explainBusy) {
      loadingText.textContent = "Deeper explanation...";
    }
    explainBtn.disabled = busy;
    explainBtn.textContent = explainBusy ? "Loading…" : "Explain More";
  }

  const api: StudyPanelController = {
    open: () => {
      root.style.display = "block";
    },
    close: () => {
      root.style.display = "none";
    },
    setLoading: (is, message) => {
      loading = is;
      loadingText.textContent = message;
      syncChrome();
    },
    setExplainBusy: (busy) => {
      explainBusy = busy;
      syncChrome();
    },
    setError: (message) => {
      if (message) {
        errorBox.textContent = message;
        errorBox.style.display = "block";
      } else {
        errorBox.style.display = "none";
        errorBox.textContent = "";
      }
    },
    setResult: (result) => {
      if (!result) {
        resultWrap.style.display = "none";
        subtitle.textContent = "";
        return;
      }
      resultWrap.style.display = "block";

      const ocrPct =
        result.ocrConfidence != null && Number.isFinite(result.ocrConfidence)
          ? Math.round(result.ocrConfidence)
          : null;
      const ocrLen = (result.ocrText || "").length;
      subtitle.textContent =
        ocrPct != null
          ? `OCR (Tesseract): ${ocrPct}% · ${ocrLen} chars`
          : `OCR · ${ocrLen} chars extracted`;

      const rawOcr = result.ocrText || "";
      lastOcrForCopy = rawOcr;
      const lang = result.ocrLanguage ?? result.ocrLang ?? "eng";

      ocrSummary.textContent = `OCR Text${ocrPct != null ? ` · confidence ${ocrPct}%` : ""} · ${lang}`;

      if (result.usedAutoRetry || result.parseWarning) {
        parseRetryStrip.style.display = "block";
        const parts: string[] = [];
        if (result.usedAutoRetry) {
          parts.push(`Refined automatically${result.retryReason ? ` (${result.retryReason})` : ""}.`);
        }
        if (result.parseWarning) parts.push(`Parse: ${result.parseWarning}`);
        parseRetryStrip.textContent = parts.join(" ");
      } else {
        parseRetryStrip.style.display = "none";
        parseRetryStrip.textContent = "";
      }

      sections.finalAnswer.body.textContent = result.finalAnswer?.trim() ? result.finalAnswer : "—";
      sections.explanation.body.textContent = result.explanation?.trim() ? result.explanation : "—";
      sections.keyConcept.body.textContent = result.keyConcept?.trim() ? result.keyConcept : "—";
      sections.optionAnalysis.body.textContent = result.optionAnalysis?.trim() ? result.optionAnalysis : "—";
      sections.optionAnalysis.wrap.style.display = "block";

      const isMulti = result.answerType === "multi" || (result.items || []).length > 0;
      if (isMulti) {
        multiWrap.style.display = "block";
        multiWrap.innerHTML = "";
        for (let i = 0; i < (result.items || []).length; i++) {
          const it = result.items[i];
          const card = document.createElement("article");
          card.className = "study-capture-ext-multi-card";
          const title = el("h3", "study-capture-ext-section-title", `Question ${it.questionNumber || String(i + 1)}`);
          const qText = el("p", "study-capture-ext-section-body", it.questionText || "—");
          const ans = el("p", "study-capture-ext-section-body", `Final Answer: ${it.finalAnswer || "—"}`);
          ans.style.fontWeight = "600";
          const exp = el("p", "study-capture-ext-section-body", `Explanation: ${it.explanation || "—"}`);
          const kc = el("p", "study-capture-ext-section-body", `Key Concept: ${it.keyConcept || "—"}`);
          const oa = el("p", "study-capture-ext-section-body", `Option Analysis: ${it.optionAnalysis || "—"}`);
          card.appendChild(title);
          card.appendChild(qText);
          card.appendChild(ans);
          if (it.answerType === "code") {
            const code = el("pre", "study-capture-ext-ocr-pre", it.finalCode || "—");
            const langP = el("p", "study-capture-ext-ocr-meta", `Code: ${it.codeLanguage || "text"}`);
            card.appendChild(langP);
            card.appendChild(code);
          }
          card.appendChild(exp);
          card.appendChild(kc);
          card.appendChild(oa);
          multiWrap.appendChild(card);
        }
      } else {
        multiWrap.style.display = "none";
        multiWrap.innerHTML = "";
      }

      if (!isMulti && result.answerType === "code") {
        codeBlock.style.display = "block";
        lastCodeForCopy = result.finalCode || "";
        codeLang.textContent = result.codeLanguage || "text";
        codePre.textContent = result.finalCode || "—";
      } else {
        codeBlock.style.display = "none";
        lastCodeForCopy = "";
        codePre.textContent = "";
      }

      let modelLine = result.modelUsed || "—";
      if (result.mode === "deep") modelLine += " (deep explanation)";
      sections.modelUsed.body.textContent = modelLine;

      sections.confidence.body.textContent = result.confidence;
      sections.confidence.body.style.textTransform = "capitalize";

      ocrPre.textContent = rawOcr.length > 0 ? rawOcr : "—";

      clearerCropBanner.style.display = result.needsClearerCrop ? "block" : "none";

      if (result.ocrWarning?.trim()) {
        ocrWarnBox.textContent = result.ocrWarning;
        ocrWarnBox.style.display = "block";
      } else {
        ocrWarnBox.style.display = "none";
        ocrWarnBox.textContent = "";
      }

      const raw = result.modelRawText?.trim() ?? "";
      if (raw) {
        modelRawDetails.style.display = "block";
        modelRawPre.textContent = raw;
      } else {
        modelRawDetails.style.display = "none";
        modelRawPre.textContent = "";
      }

      console.log("[StudyCapture][ext] panel rendered with result", {
        finalAnswer: (result.finalAnswer || "").slice(0, 160),
        answerType: result.answerType,
        itemsLength: (result.items || []).length,
        ocrTextLen: ocrLen,
      });
    },
    onExplainMore: (handler) => {
      explainHandler = handler;
    },
  };

  return api;
}

function makeSection(title: string, emphasizeAnswer?: boolean) {
  const wrap = el("section", "study-capture-ext-section");
  const h = el("h3", "study-capture-ext-section-title", title);
  const body = el(
    "p",
    emphasizeAnswer ? "study-capture-ext-section-body study-capture-ext-final-answer" : "study-capture-ext-section-body",
    "—",
  );
  wrap.appendChild(h);
  wrap.appendChild(body);
  return { wrap, body };
}
