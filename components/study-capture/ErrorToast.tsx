"use client";

import { useEffect } from "react";

type Props = {
  message: string | null;
  onDismiss: () => void;
};

export function ErrorToast({ message, onDismiss }: Props) {
  useEffect(() => {
    if (!message) return;
    const t = window.setTimeout(onDismiss, 4200);
    return () => window.clearTimeout(t);
  }, [message, onDismiss]);

  if (!message) return null;

  return (
    <div
      data-study-capture-ui
      role="alert"
      style={{
        position: "fixed",
        bottom: 20,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 2147483647,
        maxWidth: "min(520px, calc(100vw - 32px))",
        padding: "12px 16px",
        borderRadius: 10,
        background: "#3a1f24",
        border: "1px solid var(--study-error, #e06c6c)",
        color: "var(--study-text, #e8eef5)",
        fontSize: 14,
        boxShadow: "0 10px 30px rgba(0,0,0,0.45)",
      }}
    >
      {message}
    </div>
  );
}
