"use client";

import { useCallback, useEffect, useRef } from "react";

interface Props {
  onResize: (deltaPx: number) => void;
  onDoubleClick?: () => void;
}

export default function Splitter({ onResize, onDoubleClick }: Props) {
  const startX = useRef<number | null>(null);
  const lastX = useRef<number>(0);

  const onPointerMove = useCallback(
    (e: PointerEvent) => {
      if (startX.current == null) return;
      const dx = e.clientX - lastX.current;
      lastX.current = e.clientX;
      if (dx !== 0) onResize(dx);
    },
    [onResize]
  );

  const onPointerUp = useCallback(() => {
    startX.current = null;
    document.body.style.userSelect = "";
    document.body.style.cursor = "";
  }, []);

  useEffect(() => {
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, [onPointerMove, onPointerUp]);

  return (
    <div
      onPointerDown={(e) => {
        startX.current = e.clientX;
        lastX.current = e.clientX;
        document.body.style.userSelect = "none";
        document.body.style.cursor = "col-resize";
      }}
      onDoubleClick={onDoubleClick}
      title="Drag to resize · double-click to reset"
      className="relative z-10 h-full w-1.5 shrink-0 cursor-col-resize bg-duo-border transition-colors hover:bg-duo-green/60"
    >
      <div className="pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-white/0" />
    </div>
  );
}
