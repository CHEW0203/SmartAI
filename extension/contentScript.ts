import { mountCaptureOverlay, type OverlayHandle } from "./injected/overlay";
import { mountStudyAssistantPanel } from "./injected/panel";
import { cropDataUrlToBlob } from "./injected/capture";
import { postAnalyzeImage, postExplainMore } from "./injected/apiClient";
import {
  type CaptureVisibleTabResponse,
  type ViewportRect,
} from "./injected/types";

console.log("[StudyCapture Extension] content script loaded v-runtime-fix-2", location.href);

function showErrorInPanel(message: string) {
  panel.open();
  panel.setLoading(false, "");
  panel.setError(message);
}

async function sendRuntimeMessageSafe(
  message: Record<string, unknown>,
): Promise<CaptureVisibleTabResponse | null> {
  try {
    if (
      typeof chrome === "undefined" ||
      !chrome.runtime ||
      !chrome.runtime.id ||
      typeof chrome.runtime.sendMessage !== "function"
    ) {
      console.error("[StudyCapture Extension] runtime unavailable", {
        hasChrome: typeof chrome !== "undefined",
        hasRuntime: typeof chrome !== "undefined" && !!chrome.runtime,
        runtimeId: typeof chrome !== "undefined" ? chrome.runtime?.id : undefined,
        href: location.href,
      });
      showErrorInPanel(
        "Extension runtime is unavailable. Reload the extension and refresh this page.",
      );
      return null;
    }
    console.log("[StudyCapture Extension] sending runtime message", message);
    const response = await new Promise<CaptureVisibleTabResponse>((resolve, reject) => {
      chrome.runtime.sendMessage(message, (res: CaptureVisibleTabResponse | undefined) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (!res) {
          reject(new Error("No response from extension runtime."));
          return;
        }
        resolve(res);
      });
    });
    console.log("[StudyCapture Extension] runtime response received", response);
    return response;
  } catch (error) {
    const messageText = error instanceof Error ? error.message : String(error);
    console.error("[StudyCapture Extension] sendMessage failed:", messageText);
    showErrorInPanel(messageText);
    return null;
  }
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) return false;
  const el = target;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  const editable = el.isContentEditable || Boolean(el.closest("[contenteditable], [contenteditable=true]"));
  if (editable) {
    const host = location.hostname.toLowerCase();
    const isChatgptHost = host === "chatgpt.com" || host === "chat.openai.com";
    if (isChatgptHost) {
      // Allow capture hotkeys on ChatGPT pages even with contenteditable focus.
      return false;
    }
    return true;
  }
  return Boolean(el.closest("input, textarea, select"));
}

async function sha256Hex(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function requestVisibleTabCapture(): Promise<string> {
  return new Promise((resolve, reject) => {
    void (async () => {
      const response = await sendRuntimeMessageSafe({ type: "CAPTURE_VISIBLE_TAB" });
      if (!response || response.ok === false) {
        reject(new Error(response?.error || "Failed to capture visible tab."));
        return;
      }
      console.log(
        "[StudyCapture][ext] screenshot received (data URL length)",
        response.dataUrl.length,
      );
      resolve(response.dataUrl);
    })();
  });
}

const panel = mountStudyAssistantPanel();

let captureMode = false;
let overlayHandle: OverlayHandle | null = null;
let isLoading = false;
let explainBusy = false;
let lastBlob: Blob | null = null;
let lastRect: ViewportRect | null = null;
let lastOcr = "";
let lastSuccessHash: string | null = null;
let loadingPhaseTimers: number[] = [];

function clearLoadingPhases() {
  loadingPhaseTimers.forEach((id) => window.clearTimeout(id));
  loadingPhaseTimers = [];
}

function startLoadingPhases() {
  clearLoadingPhases();
  panel.setLoading(true, "Reading OCR...");
  loadingPhaseTimers.push(
    window.setTimeout(() => {
      panel.setLoading(true, "Analyzing...");
    }, 900),
  );
  loadingPhaseTimers.push(
    window.setTimeout(() => {
      panel.setLoading(true, "Formatting answer...");
    }, 4500),
  );
}

async function analyzeBlob(blob: Blob, opts: { force: boolean }) {
  const hash = await sha256Hex(blob);
  if (!opts.force && lastSuccessHash === hash) {
    isLoading = false;
    panel.open();
    panel.setLoading(false, "");
    clearLoadingPhases();
    panel.setResult(null);
    panel.setError("Same capture skipped. Press Ctrl+Shift+R to force re-analysis.");
    return;
  }

  isLoading = true;
  panel.open();
  startLoadingPhases();
  panel.setError(null);
  panel.setResult(null);

  try {
    const data = await postAnalyzeImage(blob);
    clearLoadingPhases();
    panel.setLoading(false, "");
    isLoading = false;
    panel.setError(null);
    panel.setResult(data);
    lastOcr = data.ocrText ?? "";
    lastBlob = blob;
    lastSuccessHash = hash;
    if (data.modelRawText) {
      console.log("[StudyCapture][ext] modelRawText", data.modelRawText);
    }
    if (data.parseWarning) console.log("[StudyCapture][ext] parseWarning", data.parseWarning);
    if (data.usedAutoRetry) console.log("[StudyCapture][ext] usedAutoRetry", data.retryReason ?? "");
    console.log("[StudyCapture][ext] analysis complete, panel updated", {
      finalAnswer: (data.finalAnswer || "").slice(0, 160),
      answerType: data.answerType,
      itemsLength: (data.items || []).length,
      ocrTextLen: (data.ocrText || "").length,
    });
  } catch (e) {
    clearLoadingPhases();
    panel.setLoading(false, "");
    isLoading = false;
    panel.setError(e instanceof Error ? e.message : "Request failed");
  }
}

function teardownCaptureUi() {
  if (overlayHandle) {
    overlayHandle.destroy();
    overlayHandle = null;
  }
  captureMode = false;
  document.body.style.cursor = "";
}

function startCaptureMode() {
  if (isLoading || explainBusy) return;
  if (captureMode) return;

  console.log("[StudyCapture][ext] hotkey detected: start capture (Ctrl+Shift+X)");
  captureMode = true;
  document.body.style.cursor = "crosshair";

  overlayHandle = mountCaptureOverlay(
    (rect) => {
      void onRegionComplete(rect);
    },
    () => {
      console.log("[StudyCapture][ext] capture cancelled (small selection)");
      teardownCaptureUi();
    },
  );
}

async function onRegionComplete(rect: ViewportRect) {
  lastRect = rect;
  console.log("[StudyCapture][ext] drag start/end — region", rect);
  panel.open();
  panel.setLoading(true, "Capturing...");

  if (!overlayHandle) return;
  overlayHandle.hideForScreenshot();

  await new Promise<void>((r) => requestAnimationFrame(() => r()));
  await new Promise<void>((r) => requestAnimationFrame(() => r()));

  try {
    const dataUrl = await requestVisibleTabCapture();
    const blob = await cropDataUrlToBlob(dataUrl, rect);
    lastBlob = blob;
    teardownCaptureUi();

    await analyzeBlob(blob, { force: false });
  } catch (e) {
    overlayHandle?.showAfterScreenshot();
    teardownCaptureUi();
    panel.open();
    panel.setLoading(false, "");
    clearLoadingPhases();
    isLoading = false;
    panel.setError(e instanceof Error ? e.message : "Capture failed");
  }
}

async function retryLast() {
  if (isLoading || explainBusy) return;
  panel.setError(null);

  if (lastBlob) {
    await analyzeBlob(lastBlob, { force: true });
    return;
  }

  if (lastRect) {
    isLoading = true;
    panel.open();
    startLoadingPhases();
    try {
      const dataUrl = await requestVisibleTabCapture();
      const blob = await cropDataUrlToBlob(dataUrl, lastRect);
      lastBlob = blob;
      await analyzeBlob(blob, { force: true });
    } catch (e) {
      clearLoadingPhases();
      panel.setLoading(false, "");
      isLoading = false;
      panel.setError(e instanceof Error ? e.message : "Retry failed");
    }
    return;
  }

  panel.open();
  panel.setError("Nothing to retry yet.");
}

async function explainMore() {
  const ocr = lastOcr.trim();
  if (!ocr) {
    panel.open();
    panel.setError("No question text to expand.");
    return;
  }

  explainBusy = true;
  panel.setExplainBusy(true);
  panel.setError(null);

  try {
    const data = await postExplainMore(ocr);
    panel.setResult(data);
    lastOcr = data.ocrText ?? ocr;
    console.log("[StudyCapture][ext] explain more complete, panel updated");
  } catch (e) {
    panel.setError(e instanceof Error ? e.message : "Request failed");
  } finally {
    explainBusy = false;
    panel.setExplainBusy(false);
  }
}

window.addEventListener("study-capture:explain-more", (event: Event) => {
  console.log("[StudyCapture Extension] panel event received: explain-more", event);
  void explainMore();
});

window.addEventListener("study-capture:retry", (event: Event) => {
  console.log("[StudyCapture Extension] panel event received: retry", event);
  void retryLast();
});

window.addEventListener(
  "keydown",
  (e: KeyboardEvent) => {
    console.log("[StudyCapture Extension] keydown detected", {
      code: e.code,
      key: e.key,
      ctrlKey: e.ctrlKey,
      shiftKey: e.shiftKey,
      altKey: e.altKey,
      target: e.target,
    });

    if (e.ctrlKey && e.shiftKey && e.code === "KeyX") {
      e.preventDefault();
      e.stopPropagation();
      console.log("[StudyCapture Extension] capture mode started");
      startCaptureMode();
      return;
    }

    if (e.ctrlKey && e.shiftKey && e.code === "KeyR") {
      if (isTypingTarget(e.target)) return;
      e.preventDefault();
      e.stopPropagation();
      console.log("[StudyCapture][ext] hotkey detected: retry (Ctrl+Shift+R)");
      void retryLast();
      return;
    }

    if (e.code === "Escape" && captureMode) {
      e.preventDefault();
      teardownCaptureUi();
    }
  },
  true,
);
