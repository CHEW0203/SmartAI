"use client";

import { useCallback, useState } from "react";
import type { StudyAnalyzeResponse } from "@/lib/study-capture/textHeuristics";

type Props = {
  isOpen: boolean;
  result: StudyAnalyzeResponse | null;
  isLoading: boolean;
  loadingMessage: string;
  error: string | null;
  explainBusy: boolean;
  onClose: () => void;
  onExplainMore: () => void;
};

export function FloatingResultPanel({
  isOpen,
  result,
  isLoading,
  loadingMessage,
  error,
  explainBusy,
  onClose,
  onExplainMore,
}: Props) {
  const [ocrOpen, setOcrOpen] = useState(true);
  const [debugOpen, setDebugOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string>("");

  const copyOcr = useCallback(async () => {
    const t = result?.ocrText ?? "";
    if (!t) return;
    try {
      await navigator.clipboard.writeText(t);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  }, [result?.ocrText]);

  const copyCode = useCallback(async (txt: string, key: string) => {
    if (!txt) return;
    try {
      await navigator.clipboard.writeText(txt);
      setCopiedCode(key);
      window.setTimeout(() => setCopiedCode(""), 2000);
    } catch {
      /* ignore */
    }
  }, []);

  if (!isOpen) return null;

  const showLoading = isLoading || explainBusy;
  const showResult = Boolean(result) && !showLoading;
  const showErrorBlock = Boolean(error) && !showLoading;
  const busyLabel = explainBusy ? "Deeper explanation..." : loadingMessage;

  const ocrConfPct =
    result?.ocrConfidence != null && Number.isFinite(result.ocrConfidence)
      ? Math.round(result.ocrConfidence)
      : null;

  const lang = result?.ocrLanguage ?? result?.ocrLang ?? "eng";

  const renderCodeBlock = (code: string, codeLanguage: string, key: string) => (
    <section style={{ marginBottom: 12 }}>
      <h3 style={{ margin: "0 0 6px", fontSize: 12, color: "var(--study-muted, #8b9cb3)" }}>
        Code Solution
      </h3>
      <p style={{ margin: "0 0 6px", fontSize: 12, color: "var(--study-muted, #8b9cb3)" }}>
        {codeLanguage || "text"}
      </p>
      <button
        type="button"
        onClick={() => void copyCode(code, key)}
        style={{
          border: "1px solid var(--study-accent, #5b9fd8)",
          background: "rgba(91, 159, 216, 0.12)",
          color: "var(--study-text, #e8eef5)",
          borderRadius: 8,
          padding: "6px 10px",
          cursor: "pointer",
          fontSize: 12,
          marginBottom: 8,
        }}
      >
        {copiedCode === key ? "Copied" : "Copy Code"}
      </button>
      <pre
        style={{
          margin: 0,
          padding: "10px 12px",
          fontSize: 11,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          borderRadius: 8,
          border: "1px solid var(--study-border, #2d3a4d)",
          maxHeight: 260,
          overflow: "auto",
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
          lineHeight: 1.35,
          background: "rgba(0,0,0,0.2)",
        }}
      >
        {code || "—"}
      </pre>
    </section>
  );

  return (
    <aside
      data-study-capture-ui
      style={{
        position: "fixed",
        right: 16,
        bottom: 16,
        width: "min(420px, calc(100vw - 32px))",
        maxHeight: "min(70vh, 640px)",
        overflow: "auto",
        zIndex: 2147483644,
        borderRadius: 12,
        background: "var(--study-panel, #1a2332)",
        border: "1px solid var(--study-border, #2d3a4d)",
        color: "var(--study-text, #e8eef5)",
        boxShadow: "0 12px 40px rgba(0,0,0,0.45)",
        fontSize: 13,
        lineHeight: 1.45,
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          padding: "12px 14px",
          borderBottom: "1px solid var(--study-border, #2d3a4d)",
          position: "sticky",
          top: 0,
          background: "var(--study-panel, #1a2332)",
        }}
      >
        <div>
          <div style={{ fontWeight: 700, letterSpacing: 0.2 }}>Study Assistant</div>
          {showResult && result && (
            <div style={{ fontSize: 11, color: "var(--study-muted, #8b9cb3)", marginTop: 2 }}>
              {ocrConfPct != null
                ? `OCR confidence (Tesseract): ${ocrConfPct}%`
                : "Ready"}
              {result.ocrText != null && (
                <span>
                  {" "}
                  · {(result.ocrText || "").length} characters extracted
                </span>
              )}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close panel"
          style={{
            border: "1px solid var(--study-border, #2d3a4d)",
            background: "transparent",
            color: "var(--study-text, #e8eef5)",
            borderRadius: 8,
            padding: "4px 10px",
            cursor: "pointer",
            fontSize: 12,
          }}
        >
          Close
        </button>
      </header>

      <div style={{ padding: "12px 14px 10px" }}>
        <p style={{ margin: "0 0 10px", fontSize: 11, color: "var(--study-warn, #c9a227)" }}>
          For revision and practice only. Do not use during live graded assessments.
        </p>

        {showLoading && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              marginBottom: 14,
              padding: "10px 0",
            }}
          >
            <span
              aria-hidden
              style={{
                width: 18,
                height: 18,
                borderRadius: "50%",
                border: "2px solid var(--study-border, #2d3a4d)",
                borderTopColor: "var(--study-accent, #5b9fd8)",
                animation: "study-spin 0.75s linear infinite",
                flexShrink: 0,
              }}
            />
            <p style={{ margin: 0, fontSize: 14 }}>{busyLabel}</p>
            <style>{`@keyframes study-spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        )}

        {showErrorBlock && (
          <div
            role="alert"
            style={{
              marginBottom: 14,
              padding: "10px 12px",
              borderRadius: 8,
              background: "rgba(224, 108, 108, 0.12)",
              border: "1px solid var(--study-error, #e06c6c)",
              color: "var(--study-text, #e8eef5)",
              fontSize: 14,
            }}
          >
            {error}
          </div>
        )}

        {showResult && result && (
          <>
            <section style={{ marginBottom: 14 }}>
              <h3 style={{ margin: "0 0 8px", fontSize: 12, color: "var(--study-muted, #8b9cb3)" }}>
                Final Answer
              </h3>
              <p
                style={{
                  margin: 0,
                  whiteSpace: "pre-wrap",
                  fontSize: 15,
                  fontWeight: 600,
                  lineHeight: 1.4,
                }}
              >
                {result.finalAnswer?.trim() ? result.finalAnswer : "—"}
              </p>
            </section>

            {(result.answerType === "multi" || (result.items?.length ?? 0) > 0) ? (
              <section style={{ marginBottom: 12 }}>
                {(result.items || []).map((it, idx) => (
                  <article
                    key={`${it.questionNumber}-${idx}`}
                    style={{
                      marginBottom: 10,
                      border: "1px solid var(--study-border, #2d3a4d)",
                      borderRadius: 8,
                      padding: "10px 12px",
                    }}
                  >
                    <h3 style={{ margin: "0 0 6px", fontSize: 13 }}>
                      Question {it.questionNumber || String(idx + 1)}
                    </h3>
                    <p style={{ margin: "0 0 8px", whiteSpace: "pre-wrap", fontSize: 12 }}>
                      {it.questionText || "—"}
                    </p>
                    <p style={{ margin: "0 0 6px", fontWeight: 600, whiteSpace: "pre-wrap" }}>
                      Final Answer: {it.finalAnswer || "—"}
                    </p>
                    {it.answerType === "code" ? renderCodeBlock(it.finalCode, it.codeLanguage, `item-${idx}`) : null}
                    <p style={{ margin: "0 0 6px", whiteSpace: "pre-wrap" }}>
                      Explanation: {it.explanation || "—"}
                    </p>
                    <p style={{ margin: "0 0 6px", whiteSpace: "pre-wrap" }}>
                      Key Concept: {it.keyConcept || "—"}
                    </p>
                    <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>
                      Option Analysis: {it.optionAnalysis || "—"}
                    </p>
                  </article>
                ))}
              </section>
            ) : (
              <>
                {result.answerType === "code"
                  ? renderCodeBlock(result.finalCode, result.codeLanguage, "single")
                  : null}
                <section style={{ marginBottom: 12 }}>
                  <h3 style={{ margin: "0 0 6px", fontSize: 12, color: "var(--study-muted, #8b9cb3)" }}>
                    Explanation
                  </h3>
                  <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>
                    {result.explanation?.trim() ? result.explanation : "—"}
                  </p>
                </section>
                <section style={{ marginBottom: 12 }}>
                  <h3 style={{ margin: "0 0 6px", fontSize: 12, color: "var(--study-muted, #8b9cb3)" }}>
                    Key Concept
                  </h3>
                  <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>
                    {result.keyConcept?.trim() ? result.keyConcept : "—"}
                  </p>
                </section>
                <section style={{ marginBottom: 12 }}>
                  <h3 style={{ margin: "0 0 6px", fontSize: 12, color: "var(--study-muted, #8b9cb3)" }}>
                    Option Analysis
                  </h3>
                  <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>
                    {result.optionAnalysis?.trim() ? result.optionAnalysis : "—"}
                  </p>
                </section>
              </>
            )}

            <section style={{ marginBottom: 12 }}>
              <h3 style={{ margin: "0 0 6px", fontSize: 12, color: "var(--study-muted, #8b9cb3)" }}>
                Model Used
              </h3>
              <p style={{ margin: 0 }}>
                {result.modelUsed || "—"}
                {result.mode === "deep" && (
                  <span style={{ color: "var(--study-muted, #8b9cb3)", fontSize: 12 }}>
                    {" "}
                    (deep explanation)
                  </span>
                )}
              </p>
            </section>

            <section style={{ marginBottom: 12 }}>
              <h3 style={{ margin: "0 0 6px", fontSize: 12, color: "var(--study-muted, #8b9cb3)" }}>
                Answer Confidence
              </h3>
              <p style={{ margin: 0, textTransform: "capitalize" }}>{result.confidence}</p>
            </section>

            <section style={{ marginBottom: 14 }}>
              <button
                type="button"
                onClick={() => setOcrOpen((v) => !v)}
                aria-expanded={ocrOpen}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  width: "100%",
                  textAlign: "left",
                  cursor: "pointer",
                  padding: "8px 10px",
                  borderRadius: 8,
                  border: "1px solid var(--study-border, #2d3a4d)",
                  background: "rgba(45, 58, 77, 0.25)",
                  color: "var(--study-text, #e8eef5)",
                  fontSize: 12,
                  fontWeight: 600,
                  marginBottom: 8,
                }}
              >
                <span>
                  OCR Text
                  {ocrConfPct != null ? ` · confidence ${ocrConfPct}%` : ""}
                  <span style={{ fontWeight: 400, color: "var(--study-muted, #8b9cb3)" }}>
                    {" "}
                    · {lang}
                  </span>
                </span>
                <span aria-hidden style={{ color: "var(--study-muted, #8b9cb3)" }}>
                  {ocrOpen ? "▼" : "▶"}
                </span>
              </button>
              {ocrOpen && (
                <>
                  <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
                    <button
                      type="button"
                      onClick={() => void copyOcr()}
                      style={{
                        border: "1px solid var(--study-accent, #5b9fd8)",
                        background: "rgba(91, 159, 216, 0.12)",
                        color: "var(--study-text, #e8eef5)",
                        borderRadius: 8,
                        padding: "6px 10px",
                        cursor: "pointer",
                        fontSize: 12,
                      }}
                    >
                      {copied ? "Copied" : "Copy OCR Text"}
                    </button>
                  </div>
                  <pre
                    style={{
                      margin: 0,
                      padding: "10px 12px",
                      fontSize: 11,
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                      borderRadius: 8,
                      border: "1px solid var(--study-border, #2d3a4d)",
                      maxHeight: 280,
                      overflow: "auto",
                      fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                      lineHeight: 1.35,
                      background: "rgba(0,0,0,0.2)",
                    }}
                  >
                    {(result.ocrText || "").length > 0 ? result.ocrText : "—"}
                  </pre>
                </>
              )}
            </section>

            {(result.usedAutoRetry || result.parseWarning) && (
              <div
                style={{
                  marginBottom: 10,
                  padding: "8px 10px",
                  borderRadius: 8,
                  fontSize: 11,
                  color: "var(--study-muted, #8b9cb3)",
                  border: "1px dashed var(--study-border, #2d3a4d)",
                }}
              >
                {result.usedAutoRetry && (
                  <div>
                    Refined automatically
                    {result.retryReason ? ` (${result.retryReason})` : ""}.
                  </div>
                )}
                {result.parseWarning ? (
                  <div style={{ marginTop: result.usedAutoRetry ? 4 : 0 }}>
                    Parse: {result.parseWarning}
                  </div>
                ) : null}
              </div>
            )}

            {result.needsClearerCrop && (
              <div
                style={{
                  marginBottom: 12,
                  padding: "10px 12px",
                  borderRadius: 8,
                  background: "rgba(201, 162, 39, 0.12)",
                  border: "1px solid var(--study-warn, #c9a227)",
                  fontSize: 13,
                }}
              >
                OCR may not have captured the question clearly. Try cropping a larger area including
                the full question, code, and all options.
              </div>
            )}

            {result.ocrWarning ? (
              <div
                style={{
                  marginBottom: 12,
                  padding: "10px 12px",
                  borderRadius: 8,
                  background: "rgba(139, 156, 179, 0.12)",
                  border: "1px solid var(--study-border, #2d3a4d)",
                  fontSize: 13,
                }}
              >
                {result.ocrWarning}
              </div>
            ) : null}

            {result.modelRawText ? (
              <details
                open={debugOpen}
                onToggle={(e) => setDebugOpen((e.target as HTMLDetailsElement).open)}
                style={{ marginBottom: 12, fontSize: 11, color: "var(--study-muted, #8b9cb3)" }}
              >
                <summary style={{ cursor: "pointer", userSelect: "none" }}>Debug: raw model output</summary>
                <pre
                  style={{
                    margin: "8px 0 0",
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                    maxHeight: 160,
                    overflow: "auto",
                    fontSize: 10,
                    fontFamily: "ui-monospace, monospace",
                  }}
                >
                  {result.modelRawText}
                </pre>
              </details>
            ) : null}
            <details style={{ marginBottom: 12, fontSize: 11, color: "var(--study-muted, #8b9cb3)" }}>
              <summary style={{ cursor: "pointer", userSelect: "none" }}>Debug: timing and raw OCR</summary>
              <pre
                style={{
                  margin: "8px 0 0",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  maxHeight: 160,
                  overflow: "auto",
                  fontSize: 10,
                  fontFamily: "ui-monospace, monospace",
                }}
              >
                {JSON.stringify(
                  {
                    timing: result.timing,
                    ocrDebug: result.ocrDebug,
                    rawOcrText: result.rawOcrText,
                  },
                  null,
                  2,
                )}
              </pre>
            </details>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
              <button
                type="button"
                onClick={onExplainMore}
                disabled={explainBusy || isLoading}
                style={{
                  border: "1px solid var(--study-accent, #5b9fd8)",
                  background: "rgba(91, 159, 216, 0.12)",
                  color: "var(--study-text, #e8eef5)",
                  borderRadius: 8,
                  padding: "8px 12px",
                  cursor: explainBusy || isLoading ? "wait" : "pointer",
                  fontSize: 12,
                }}
              >
                {explainBusy ? "Loading…" : "Explain More"}
              </button>
            </div>
          </>
        )}
      </div>
    </aside>
  );
}
