"use client";

import { useEffect, useState } from "react";
import { useNotesStore } from "@/lib/store";

interface Endpoints {
  a: { x: number; y: number };
  b: { x: number; y: number };
}

export default function LinkHoverOverlay() {
  const hoveredId = useNotesStore((s) => s.hoveredLinkNodeId);
  const [ep, setEp] = useState<Endpoints | null>(null);

  useEffect(() => {
    if (!hoveredId) {
      setEp(null);
      return;
    }

    let raf = 0;
    const measure = () => {
      const safeId =
        typeof CSS !== "undefined" && CSS.escape
          ? CSS.escape(hoveredId)
          : hoveredId.replace(/"/g, '\\"');

      const pill = document.querySelector<HTMLElement>(
        `.tiptap [data-node-id="${safeId}"]`
      );
      const nodeEl = document.querySelector<HTMLElement>(
        `.react-flow__node[data-id="${safeId}"]`
      );
      if (!pill || !nodeEl) {
        setEp(null);
        return;
      }
      const pr = pill.getBoundingClientRect();
      const nr = nodeEl.getBoundingClientRect();
      setEp({
        a: { x: pr.right, y: pr.top + pr.height / 2 },
        b: { x: nr.left + nr.width / 2, y: nr.top + nr.height / 2 },
      });
    };

    measure();
    const loop = () => {
      measure();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [hoveredId]);

  if (!hoveredId || !ep) return null;

  const { a, b } = ep;
  const mx = (a.x + b.x) / 2;
  const path = `M ${a.x} ${a.y} C ${mx} ${a.y}, ${mx} ${b.y}, ${b.x} ${b.y}`;

  return (
    <div className="pointer-events-none fixed inset-0 z-[55]">
      <svg className="h-full w-full">
        <defs>
          <filter id="link-cord-shadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow
              dx="0"
              dy="2"
              stdDeviation="2"
              floodColor="#58CC02"
              floodOpacity="0.35"
            />
          </filter>
        </defs>
        <path
          d={path}
          stroke="#58CC02"
          strokeWidth={4}
          strokeDasharray="8 6"
          strokeLinecap="round"
          fill="none"
          filter="url(#link-cord-shadow)"
        >
          <animate
            attributeName="stroke-dashoffset"
            from="0"
            to="-28"
            dur="0.6s"
            repeatCount="indefinite"
          />
        </path>
        <circle cx={a.x} cy={a.y} r={7} fill="#58CC02" />
        <circle cx={a.x} cy={a.y} r={3} fill="white" />
        <circle cx={b.x} cy={b.y} r={9} fill="white" stroke="#58CC02" strokeWidth={3} />
      </svg>
    </div>
  );
}
