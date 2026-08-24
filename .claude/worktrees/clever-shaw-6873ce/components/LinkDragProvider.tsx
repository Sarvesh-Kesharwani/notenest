"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

export interface LinkDragPayload {
  selectionText: string;
  /** Apply the `nodeLink` mark to the source selection. */
  applyLink: (nodeId: string) => void;
}

interface ActiveDrag extends LinkDragPayload {
  origin: { x: number; y: number };
  current: { x: number; y: number };
}

export interface LinkDragDropDetail {
  clientX: number;
  clientY: number;
  payload: LinkDragPayload;
}

interface LinkDragContextValue {
  active: ActiveDrag | null;
  start: (
    origin: { x: number; y: number },
    payload: LinkDragPayload
  ) => void;
  cancel: () => void;
}

const LinkDragContext = createContext<LinkDragContextValue | null>(null);

export function useLinkDrag() {
  const v = useContext(LinkDragContext);
  if (!v) throw new Error("useLinkDrag outside provider");
  return v;
}

export const LINK_DRAG_DROP_EVENT = "notenest:link-drag-drop";

export function LinkDragProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState<ActiveDrag | null>(null);
  const activeRef = useRef<ActiveDrag | null>(null);
  activeRef.current = active;

  useEffect(() => {
    if (!active) return;
    const onMove = (e: PointerEvent) => {
      setActive((a) =>
        a ? { ...a, current: { x: e.clientX, y: e.clientY } } : a
      );
    };
    const onUp = (e: PointerEvent) => {
      const a = activeRef.current;
      if (a) {
        window.dispatchEvent(
          new CustomEvent<LinkDragDropDetail>(LINK_DRAG_DROP_EVENT, {
            detail: {
              clientX: e.clientX,
              clientY: e.clientY,
              payload: {
                selectionText: a.selectionText,
                applyLink: a.applyLink,
              },
            },
          })
        );
      }
      setActive(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setActive(null);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("keydown", onKey);
    };
  }, [active !== null]); // re-bind only on active/inactive flip

  return (
    <LinkDragContext.Provider
      value={{
        active,
        start: (origin, payload) =>
          setActive({ origin, current: origin, ...payload }),
        cancel: () => setActive(null),
      }}
    >
      {children}
      {active && <LinkDragOverlay active={active} />}
    </LinkDragContext.Provider>
  );
}

function LinkDragOverlay({ active }: { active: ActiveDrag }) {
  const { origin, current, selectionText } = active;
  const dx = current.x - origin.x;
  const mx = origin.x + dx / 2;
  const path = `M ${origin.x} ${origin.y} C ${mx} ${origin.y}, ${mx} ${current.y}, ${current.x} ${current.y}`;

  const labelX = current.x + 14;
  const labelY = current.y + 4;
  const shortText =
    selectionText.length > 40
      ? selectionText.slice(0, 40) + "…"
      : selectionText;

  return (
    <div className="pointer-events-none fixed inset-0 z-[60]">
      <svg className="h-full w-full">
        <defs>
          <filter id="cord-shadow" x="-20%" y="-20%" width="140%" height="140%">
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
          strokeWidth="4"
          strokeDasharray="8 6"
          strokeLinecap="round"
          fill="none"
          filter="url(#cord-shadow)"
        >
          <animate
            attributeName="stroke-dashoffset"
            from="0"
            to="-28"
            dur="0.6s"
            repeatCount="indefinite"
          />
        </path>
        <circle cx={origin.x} cy={origin.y} r={8} fill="#58CC02" />
        <circle cx={origin.x} cy={origin.y} r={3} fill="white" />
        <circle
          cx={current.x}
          cy={current.y}
          r={9}
          fill="white"
          stroke="#58CC02"
          strokeWidth={3}
        />
      </svg>
      {shortText && (
        <div
          className="absolute select-none rounded-xl border-2 border-duo-green bg-white px-2 py-1 text-[11px] font-extrabold text-duo-greenDark shadow-md"
          style={{ left: labelX, top: labelY }}
        >
          “{shortText}”
        </div>
      )}
    </div>
  );
}
