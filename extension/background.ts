import { MSG_CAPTURE_VISIBLE, type CaptureVisibleTabResponse } from "./injected/types";

console.log("[StudyCapture BG] background loaded v-runtime-fix-2");

chrome.runtime.onMessage.addListener(
  (message: { type?: string }, sender, sendResponse: (r: CaptureVisibleTabResponse) => void) => {
    console.log("[StudyCapture BG] message received", message);
    if (message?.type !== MSG_CAPTURE_VISIBLE && message?.type !== "CAPTURE_VISIBLE_TAB") {
      return;
    }

    const onCapture = (dataUrl: string | null) => {
      if (chrome.runtime.lastError) {
        console.error("[StudyCapture BG] captureVisibleTab error", chrome.runtime.lastError.message);
        sendResponse({ ok: false, error: chrome.runtime.lastError.message });
        return;
      }
      if (!dataUrl) {
        sendResponse({ ok: false, error: "Empty screenshot" });
        return;
      }
      sendResponse({ ok: true, dataUrl });
    };

    chrome.tabs.captureVisibleTab(null, { format: "png" }, onCapture);

    return true;
  },
);
