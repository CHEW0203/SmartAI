import type { ViewportRect } from "./types";

const ROOT_ID = "study-capture-ext-overlay-root";

export type OverlayHandle = {
  hideForScreenshot: () => void;
  showAfterScreenshot: () => void;
  destroy: () => void;
};

/**
 * Full-page drag-select overlay. Rect is in viewport (CSS) coordinates.
 */
export function mountCaptureOverlay(
  onComplete: (rect: ViewportRect) => void,
  onCancel: () => void,
): OverlayHandle {
  let existing = document.getElementById(ROOT_ID);
  if (existing) existing.remove();

  const root = document.createElement("div");
  root.id = ROOT_ID;
  root.className = "study-capture-ext-overlay";
  root.setAttribute("data-study-capture-ui", "");
  root.style.position = "fixed";
  root.style.inset = "0";
  root.style.zIndex = "2147483647";
  root.style.cursor = "crosshair";

  let dragging = false;
  const start = { x: 0, y: 0 };
  const current = { x: 0, y: 0 };
  let boxEl: HTMLDivElement | null = null;

  const updateBox = () => {
    if (!dragging) return;
    const left = Math.min(start.x, current.x);
    const top = Math.min(start.y, current.y);
    const width = Math.abs(current.x - start.x);
    const height = Math.abs(current.y - start.y);
    if (!boxEl) {
      boxEl = document.createElement("div");
      boxEl.className = "study-capture-ext-overlay-box";
      root.appendChild(boxEl);
    }
    boxEl.style.left = `${left}px`;
    boxEl.style.top = `${top}px`;
    boxEl.style.width = `${width}px`;
    boxEl.style.height = `${height}px`;
  };

  const finishDrag = () => {
    if (!dragging) return;
    dragging = false;
    const left = Math.min(start.x, current.x);
    const top = Math.min(start.y, current.y);
    const width = Math.abs(current.x - start.x);
    const height = Math.abs(current.y - start.y);
    if (width < 4 || height < 4) {
      onCancel();
      return;
    }
    console.log("[StudyCapture][ext] drag end coordinates", { left, top, width, height });
    onComplete({ left, top, width, height });
  };

  const onMouseDown = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragging = true;
    start.x = e.clientX;
    start.y = e.clientY;
    current.x = e.clientX;
    current.y = e.clientY;
    console.log("[StudyCapture][ext] drag start coordinates", { x: start.x, y: start.y });
    if (boxEl) {
      boxEl.remove();
      boxEl = null;
    }
    updateBox();
  };

  const onMouseMove = (e: MouseEvent) => {
    if (!dragging) return;
    e.preventDefault();
    current.x = e.clientX;
    current.y = e.clientY;
    updateBox();
  };

  const onMouseUp = () => {
    finishDrag();
  };

  root.addEventListener("mousedown", onMouseDown, true);
  root.addEventListener("mousemove", onMouseMove, true);
  window.addEventListener("mouseup", onMouseUp, true);

  document.documentElement.appendChild(root);
  console.log("[StudyCapture][ext] capture overlay shown");

  return {
    hideForScreenshot: () => {
      root.style.visibility = "hidden";
      root.style.pointerEvents = "none";
    },
    showAfterScreenshot: () => {
      root.style.visibility = "";
      root.style.pointerEvents = "";
    },
    destroy: () => {
      window.removeEventListener("mouseup", onMouseUp, true);
      root.removeEventListener("mousedown", onMouseDown, true);
      root.removeEventListener("mousemove", onMouseMove, true);
      root.remove();
    },
  };
}
