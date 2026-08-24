"use client";

import { Coffee, TimerReset } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { findTopicForPath } from "@/lib/study-topic-match";
import { useStudyStore } from "@/lib/study-store";

interface Props {
  openedPath: string | null;
  active: boolean;
}

export default function JsonActivityClock({ openedPath, active }: Props) {
  const topics = useStudyStore((s) => s.topics);
  const addJsonSeconds = useStudyStore((s) => s.addJsonSeconds);
  const [seconds, setSeconds] = useState(0);
  const [onBreak, setOnBreak] = useState(false);
  const lastActivityRef = useRef(Date.now());
  const topic = useMemo(() => findTopicForPath(openedPath, topics), [openedPath, topics]);

  useEffect(() => {
    const markActive = () => {
      lastActivityRef.current = Date.now();
    };

    window.addEventListener("pointerdown", markActive);
    window.addEventListener("mousemove", markActive);
    window.addEventListener("keydown", markActive);
    window.addEventListener("wheel", markActive);
    window.addEventListener("touchstart", markActive);
    return () => {
      window.removeEventListener("pointerdown", markActive);
      window.removeEventListener("mousemove", markActive);
      window.removeEventListener("keydown", markActive);
      window.removeEventListener("wheel", markActive);
      window.removeEventListener("touchstart", markActive);
    };
  }, []);

  useEffect(() => {
    setSeconds(0);
    setOnBreak(false);
    lastActivityRef.current = Date.now();
  }, [openedPath, topic?.id]);

  useEffect(() => {
    if (!active || !topic || onBreak) return;
    const id = window.setInterval(() => {
      const recentlyActive = Date.now() - lastActivityRef.current < 60_000;
      if (document.visibilityState !== "visible" || !document.hasFocus() || !recentlyActive) {
        return;
      }

      setSeconds((value) => value + 1);
      addJsonSeconds(topic.id, 1);
    }, 1000);

    return () => window.clearInterval(id);
  }, [active, addJsonSeconds, onBreak, topic]);

  if (!active || !openedPath) return null;

  return (
    <>
      <div className="flex items-center gap-2 rounded-lg border border-duo-border bg-white px-2 py-1 text-[11px] font-extrabold uppercase text-duo-ink">
        <TimerReset size={13} className={topic && !onBreak ? "text-duo-green" : "text-gray-400"} />
        <span title={topic ? `Counting active JSON time for ${topic.title}` : "No matching study topic"}>
          {topic ? formatSecs(seconds) : "no topic"}
        </span>
        <button
          disabled={!topic}
          onClick={() => setOnBreak(true)}
          title="Take break"
          className="inline-flex h-6 items-center gap-1 rounded-md bg-duo-blue px-2 text-[10px] text-white disabled:cursor-not-allowed disabled:bg-gray-300"
        >
          <Coffee size={12} />
          Break
        </button>
      </div>

      {onBreak && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/55 p-6 backdrop-blur-md">
          <div className="w-full max-w-sm rounded-lg border-2 border-duo-border bg-white p-8 text-center shadow-duo">
            <div className="text-4xl font-extrabold uppercase text-duo-ink">On break</div>
            <div className="mt-3 text-sm font-bold text-gray-500">
              JSON study clock paused.
            </div>
            <button
              onClick={() => {
                lastActivityRef.current = Date.now();
                setOnBreak(false);
              }}
              className="mt-6 h-10 rounded-lg bg-duo-green px-6 text-xs font-extrabold uppercase text-white shadow-duoGreen active:translate-y-[1px] active:shadow-none"
            >
              Resume
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function formatSecs(value: number) {
  const minutes = Math.floor(value / 60);
  const seconds = value % 60;
  return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}
