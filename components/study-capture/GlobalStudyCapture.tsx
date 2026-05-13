"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { StudyAnalyzeResponse } from "@/lib/study-capture/textHeuristics";
import {
  captureViewportRegionToBlob,
  sha256HexFromBlob,
  type ViewportRect,
} from "@/lib/client/captureImage";
import { FloatingResultPanel } from "./FloatingResultPanel";
import { ScreenCaptureOverlay } from "./ScreenCaptureOverlay";

function isTypingTarget(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) return false;
  const el = target;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (el.closest("[contenteditable], [contenteditable=true]")) return true;
  return Boolean(el.closest("input, textarea, select"));
}

export function GlobalStudyCapture() {
  const [isCaptureMode, setIsCaptureMode] = useState(false);
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("");
  const [analysisResult, setAnalysisResult] = useState<StudyAnalyzeResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [explainBusy, setExplainBusy] = useState(false);

  const lastBlobRef = useRef<Blob | null>(null);
  const lastRectRef = useRef<ViewportRect | null>(null);
  const lastSuccessHashRef = useRef<string | null>(null);
  const lastOcrRef = useRef<string>("");
  const isLoadingRef = useRef(false);

  useEffect(() => {
    console.log("[StudyCapture] GlobalStudyCapture mounted");
  }, []);

  useEffect(() => {
    isLoadingRef.current = isLoading;
  }, [isLoading]);

  useEffect(() => {
    if (!isCaptureMode) return;
    const prev = document.body.style.cursor;
    document.body.style.cursor = "crosshair";
    return () => {
      document.body.style.cursor = prev;
    };
  }, [isCaptureMode]);

  useEffect(() => {
    if (!isLoading) return;

    setLoadingMessage("Reading OCR...");
    const t1 = window.setTimeout(() => {
      if (!isLoadingRef.current) return;
      setLoadingMessage("Analyzing...");
    }, 900);
    const t2 = window.setTimeout(() => {
      if (!isLoadingRef.current) return;
      setLoadingMessage("Formatting answer...");
    }, 4500);

    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [isLoading]);

  const sendBlob = useCallback(async (blob: Blob, opts?: { force?: boolean }) => {
    const hash = await sha256HexFromBlob(blob);
    if (!opts?.force && lastSuccessHashRef.current === hash) {
      setIsPanelOpen(true);
      setIsLoading(false);
      setLoadingMessage("");
      setAnalysisResult(null);
      setErrorMessage(
        "Same capture skipped. Press Ctrl+Shift+R to force re-analysis.",
      );
      return;
    }

    setIsPanelOpen(true);
    setIsLoading(true);
    setErrorMessage(null);
    setAnalysisResult(null);
    setLoadingMessage("Reading OCR...");

    try {
      const fd = new FormData();
      fd.append(
        "image",
        blob,
        blob.type.includes("webp") ? "capture.webp" : "capture.jpg",
      );
      const res = await fetch("/api/study-capture/analyze", { method: "POST", body: fd });
      const data = (await res.json()) as StudyAnalyzeResponse & { error?: string };
      if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);

      setAnalysisResult(data);
      setErrorMessage(null);
      setIsPanelOpen(true);
      lastOcrRef.current = data.ocrText ?? "";
      console.log("[StudyCapture] panel data", {
        finalAnswer: (data.finalAnswer || "").slice(0, 160),
        ocrTextLen: (data.ocrText || "").length,
        usedAutoRetry: data.usedAutoRetry,
        parseWarning: data.parseWarning,
      });
      if (data.modelRawText) {
        console.log("[StudyCapture] modelRawText", data.modelRawText);
      }
      lastBlobRef.current = blob;
      lastSuccessHashRef.current = hash;
    } catch (e) {
      setAnalysisResult(null);
      setErrorMessage(e instanceof Error ? e.message : "Request failed");
      setIsPanelOpen(true);
    } finally {
      setIsLoading(false);
      setLoadingMessage("");
    }
  }, []);

  const performCapture = useCallback(
    async (rect: ViewportRect) => {
      setIsCaptureMode(false);
      lastRectRef.current = rect;
      setIsPanelOpen(true);
      setIsLoading(true);
      setErrorMessage(null);
      setAnalysisResult(null);
      setLoadingMessage("Capturing...");

      try {
        const blob = await captureViewportRegionToBlob(rect);
        lastBlobRef.current = blob;
        await sendBlob(blob);
      } catch (e) {
        setIsLoading(false);
        setLoadingMessage("");
        setErrorMessage(e instanceof Error ? e.message : "Capture failed");
        setIsPanelOpen(true);
      }
    },
    [sendBlob],
  );

  const retryLast = useCallback(async () => {
    if (isLoading || explainBusy) return;

    setIsPanelOpen(true);
    setErrorMessage(null);

    if (lastBlobRef.current) {
      setAnalysisResult(null);
      await sendBlob(lastBlobRef.current, { force: true });
      return;
    }

    const rect = lastRectRef.current;
    if (rect) {
      setAnalysisResult(null);
      setIsLoading(true);
      setLoadingMessage("Reading OCR...");
      try {
        const blob = await captureViewportRegionToBlob(rect);
        lastBlobRef.current = blob;
        await sendBlob(blob, { force: true });
      } catch (e) {
        setIsLoading(false);
        setLoadingMessage("");
        setErrorMessage(e instanceof Error ? e.message : "Retry failed");
      }
      return;
    }

    setErrorMessage("Nothing to retry yet.");
  }, [explainBusy, isLoading, sendBlob]);

  const explainMore = useCallback(async () => {
    const ocr = (lastOcrRef.current || analysisResult?.ocrText || "").trim();
    if (!ocr) {
      setIsPanelOpen(true);
      setErrorMessage("No question text to expand.");
      return;
    }

    setExplainBusy(true);
    setErrorMessage(null);
    setIsPanelOpen(true);

    try {
      const fd = new FormData();
      fd.append("ocrText", ocr);
      fd.append("deeperExplanation", "true");
      const res = await fetch("/api/study-capture/analyze", { method: "POST", body: fd });
      const data = (await res.json()) as StudyAnalyzeResponse & { error?: string };
      if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);

      setAnalysisResult(data);
      setErrorMessage(null);
      setIsPanelOpen(true);
      lastOcrRef.current = data.ocrText ?? ocr;
      if (data.modelRawText) console.log("[StudyCapture] explainMore modelRawText", data.modelRawText);
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : "Request failed");
    } finally {
      setExplainBusy(false);
    }
  }, [analysisResult?.ocrText]);

  const closePanel = useCallback(() => {
    setIsPanelOpen(false);
    setAnalysisResult(null);
    setErrorMessage(null);
    setLoadingMessage("");
    setIsLoading(false);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      console.log("[StudyCapture] keydown event detected", {
        code: e.code,
        ctrlKey: e.ctrlKey,
        shiftKey: e.shiftKey,
        altKey: e.altKey,
      });

      if (e.ctrlKey && e.shiftKey && e.code === "KeyX") {
        if (isTypingTarget(e.target)) return;
        e.preventDefault();
        e.stopPropagation();
        if (isLoading || explainBusy) return;
        console.log("[StudyCapture] capture mode started (Ctrl+Shift+X)");
        setIsCaptureMode(true);
        return;
      }

      if (e.ctrlKey && e.shiftKey && e.code === "KeyR") {
        if (isTypingTarget(e.target)) return;
        e.preventDefault();
        e.stopPropagation();
        void retryLast();
        return;
      }

      if (e.code === "Escape" && isCaptureMode) {
        e.preventDefault();
        setIsCaptureMode(false);
      }
    };

    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [explainBusy, isCaptureMode, isLoading, retryLast]);

  return (
    <>
      <ScreenCaptureOverlay
        open={isCaptureMode}
        onCancel={() => setIsCaptureMode(false)}
        onRegionComplete={(rect) => {
          void performCapture(rect);
        }}
      />
      <FloatingResultPanel
        isOpen={isPanelOpen}
        result={analysisResult}
        isLoading={isLoading}
        loadingMessage={loadingMessage}
        error={errorMessage}
        explainBusy={explainBusy}
        onClose={closePanel}
        onExplainMore={() => {
          void explainMore();
        }}
      />
    </>
  );
}
