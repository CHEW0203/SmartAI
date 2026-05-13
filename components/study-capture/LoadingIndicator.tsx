"use client";

type Props = {
  visible: boolean;
};

export function LoadingIndicator({ visible }: Props) {
  if (!visible) return null;
  return (
    <div
      data-study-capture-ui
      style={{
        position: "fixed",
        bottom: 96,
        right: 20,
        zIndex: 2147483645,
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 14px",
        borderRadius: 10,
        background: "var(--study-panel, #1a2332)",
        border: "1px solid var(--study-border, #2d3a4d)",
        color: "var(--study-text, #e8eef5)",
        fontSize: 13,
        boxShadow: "0 8px 28px rgba(0,0,0,0.35)",
      }}
    >
      <span
        aria-hidden
        style={{
          width: 16,
          height: 16,
          borderRadius: "50%",
          border: "2px solid var(--study-border, #2d3a4d)",
          borderTopColor: "var(--study-accent, #5b9fd8)",
          animation: "study-spin 0.75s linear infinite",
        }}
      />
      Analyzing…
      <style>{`@keyframes study-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
