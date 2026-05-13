"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ViewportRect } from "@/lib/client/captureImage";

type Props = {
  open: boolean;
  onCancel: () => void;
  onRegionComplete: (rect: ViewportRect) => void;
};

const OVERLAY_Z = 2147483647;

export function ScreenCaptureOverlay({ open, onCancel, onRegionComplete }: Props) {
  const [dragging, setDragging] = useState(false);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const currentRef = useRef<{ x: number; y: number } | null>(null);
  const [, bump] = useState(0);

  useEffect(() => {
    if (!open) {
      setDragging(false);
      startRef.current = null;
      currentRef.current = null;
    }
  }, [open]);

  const finishDrag = useCallback(() => {
    const start = startRef.current;
    const end = currentRef.current;
    if (!start || !end) return;
    const left = Math.min(start.x, end.x);
    const top = Math.min(start.y, end.y);
    const width = Math.abs(end.x - start.x);
    const height = Math.abs(end.y - start.y);
    if (width < 4 || height < 4) {
      onCancel();
      return;
    }
    onRegionComplete({ left, top, width, height });
  }, [onCancel, onRegionComplete]);

  useEffect(() => {
    if (!open) return;
    const onUp = () => {
      if (!dragging) return;
      setDragging(false);
      finishDrag();
    };
    window.addEventListener("mouseup", onUp);
    return () => window.removeEventListener("mouseup", onUp);
  }, [open, dragging, finishDrag]);

  if (!open) return null;

  const start = startRef.current;
  const current = currentRef.current;
  const box =
    dragging && start && current
      ? {
          left: Math.min(start.x, current.x),
          top: Math.min(start.y, current.y),
          width: Math.abs(current.x - start.x),
          height: Math.abs(current.y - start.y),
        }
      : null;

  return (
    <div
      data-study-capture-ui
      style={{
        position: "fixed",
        inset: 0,
        zIndex: OVERLAY_Z,
        cursor: "crosshair",
        background: "rgba(8, 12, 18, 0.35)",
        touchAction: "none",
      }}
      onMouseDown={(e) => {
        e.preventDefault();
        startRef.current = { x: e.clientX, y: e.clientY };
        currentRef.current = { x: e.clientX, y: e.clientY };
        setDragging(true);
        bump((n) => n + 1);
      }}
      onMouseMove={(e) => {
        if (!dragging || !startRef.current) return;
        e.preventDefault();
        currentRef.current = { x: e.clientX, y: e.clientY };
        bump((n) => n + 1);
      }}
    >
      {box && (
        <div
          style={{
            position: "fixed",
            left: box.left,
            top: box.top,
            width: box.width,
            height: box.height,
            outline: "2px solid var(--study-accent, #5b9fd8)",
            boxShadow: "0 0 0 9999px rgba(8, 12, 18, 0.45)",
            pointerEvents: "none",
          }}
        />
      )}
    </div>
  );
}

/** @deprecated Use ScreenCaptureOverlay */
export const StudyCaptureOverlay = ScreenCaptureOverlay;
