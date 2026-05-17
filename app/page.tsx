"use client";

import dynamic from "next/dynamic";
import {
  ArrowLeft,
  Feather,
  FileText,
  FolderOpen,
  HardDriveDownload,
  Maximize2,
  Minimize2,
  Network,
  PanelLeftClose,
  PanelRightClose,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { LinkDragProvider } from "@/components/LinkDragProvider";
import { useFilesStore } from "@/lib/files-store";
import { useNotesStore } from "@/lib/store";

const Editor = dynamic(() => import("@/components/Editor"), { ssr: false });
const Graph = dynamic(() => import("@/components/Graph"), { ssr: false });
const NodeModal = dynamic(() => import("@/components/NodeModal"), {
  ssr: false,
});
const LinkHoverOverlay = dynamic(
  () => import("@/components/LinkHoverOverlay"),
  { ssr: false }
);
const VideoStorageMigration = dynamic(
  () => import("@/components/VideoStorageMigration"),
  { ssr: false }
);
const FileExplorer = dynamic(() => import("@/components/FileExplorer"), {
  ssr: false,
});
const Splitter = dynamic(() => import("@/components/Splitter"), {
  ssr: false,
});

type LeftMode = "explorer" | "editor";
type Maximize = "none" | "left" | "right";

const DEFAULT_LEFT_PCT = 50;
const MIN_PCT = 15;
const MAX_PCT = 85;

export default function Page() {
  const [leftPct, setLeftPct] = useState(DEFAULT_LEFT_PCT);
  const [maximize, setMaximize] = useState<Maximize>("none");
  const [leftMode, setLeftMode] = useState<LeftMode>("explorer");

  const containerRef = useRef<HTMLDivElement>(null);

  const openedPath = useFilesStore((s) => s.openedPath);
  const closeFile = useFilesStore((s) => s.closeFile);
  const saveCurrentHtml = useFilesStore((s) => s.saveCurrentHtml);
  const chooseRoot = useFilesStore((s) => s.chooseRoot);
  const rootName = useFilesStore((s) => s.rootName);
  const root = useFilesStore((s) => s.root);
  const editorHTML = useNotesStore((s) => s.editorHTML);
  const setEditorHTML = useNotesStore((s) => s.setEditorHTML);

  // Track which path we've already loaded into the editor so a reload-restore
  // doesn't re-fetch on every render.
  const loadedPathRef = useRef<string | null>(null);

  // Restore persisted UI prefs
  useEffect(() => {
    try {
      const raw = localStorage.getItem("notenest:layout");
      if (raw) {
        const v = JSON.parse(raw) as { leftPct?: number };
        if (typeof v.leftPct === "number") {
          setLeftPct(Math.max(MIN_PCT, Math.min(MAX_PCT, v.leftPct)));
        }
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("notenest:layout", JSON.stringify({ leftPct }));
    } catch {
      /* ignore */
    }
  }, [leftPct]);

  const handleResize = useCallback((dx: number) => {
    const el = containerRef.current;
    if (!el) return;
    const w = el.clientWidth || 1;
    setLeftPct((p) => {
      const next = p + (dx / w) * 100;
      return Math.max(MIN_PCT, Math.min(MAX_PCT, next));
    });
  }, []);

  // Auto-save opened file content on debounce
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!openedPath) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void saveCurrentHtml(editorHTML);
    }, 600);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [editorHTML, openedPath, saveCurrentHtml]);

  // When a file gets opened, switch the left pane into editor mode
  useEffect(() => {
    if (openedPath) setLeftMode("editor");
    else setLeftMode("explorer");
  }, [openedPath]);

  // Reload-restore: when the page mounts (or root becomes available after
  // permission grant), if openedPath is persisted from a prior session, read
  // its content from disk and hydrate the editor so the user lands on the
  // exact file they were viewing.
  useEffect(() => {
    if (!root || !openedPath) return;
    if (loadedPathRef.current === openedPath) return;
    loadedPathRef.current = openedPath;
    void (async () => {
      const html = await useFilesStore.getState().openFile(openedPath);
      if (html != null) {
        setEditorHTML(html);
        setLeftMode("editor");
      }
    })();
  }, [root, openedPath, setEditorHTML]);

  const backToExplorer = useCallback(async () => {
    if (openedPath) await saveCurrentHtml(editorHTML);
    closeFile();
    setLeftMode("explorer");
  }, [closeFile, editorHTML, openedPath, saveCurrentHtml]);

  const leftStyle =
    maximize === "left"
      ? { flex: "1 1 100%" }
      : maximize === "right"
      ? { display: "none" }
      : { width: `${leftPct}%` };

  const rightStyle =
    maximize === "right"
      ? { flex: "1 1 100%" }
      : maximize === "left"
      ? { display: "none" }
      : { width: `${100 - leftPct}%` };

  const leftLabel =
    leftMode === "explorer"
      ? "Explorer"
      : openedPath
      ? openedPath.split("/").pop()
      : "Editor";

  return (
    <LinkDragProvider>
      <main className="flex h-screen w-screen flex-col overflow-hidden bg-duo-soft">
        {/* Combined top bar: logo + pane tabs in one row */}
        <header className="flex h-12 shrink-0 items-stretch border-b-2 border-duo-border bg-white">
          <div className="flex shrink-0 items-center gap-2 border-r border-duo-border px-4">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-duo-green text-white shadow-duoGreen">
              <Feather size={14} />
            </div>
            <div className="text-sm font-extrabold uppercase tracking-widest text-duo-ink">
              NoteNest
            </div>
          </div>

          {/* Left pane tab */}
          {maximize !== "right" && (
            <div
              style={maximize === "left" ? { flex: "1 1 100%" } : { width: `calc(${leftPct}% - 64px)` }}
              className="flex min-w-0 items-center justify-between gap-2 border-r border-duo-border px-3"
            >
              <div className="flex min-w-0 items-center gap-1.5">
                {leftMode === "editor" && (
                  <button
                    onClick={() => void backToExplorer()}
                    title="Back to file explorer"
                    className="flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-extrabold uppercase text-duo-ink hover:bg-duo-soft"
                  >
                    <ArrowLeft size={12} /> Files
                  </button>
                )}
                <div className="flex min-w-0 items-center gap-1.5 text-xs font-extrabold text-duo-ink">
                  {leftMode === "explorer" ? (
                    <FolderOpen size={14} className="shrink-0 text-duo-green" />
                  ) : (
                    <FileText size={14} className="shrink-0 text-duo-blue" />
                  )}
                  <span className="truncate">{leftLabel}</span>
                </div>
                {leftMode === "explorer" && (
                  <button
                    onClick={() => void chooseRoot()}
                    title={
                      rootName
                        ? `Current folder: ${rootName} — click to change`
                        : "Choose a notes folder"
                    }
                    className="flex shrink-0 items-center gap-1 rounded-md border border-duo-border bg-white px-1.5 py-0.5 text-[11px] font-extrabold uppercase text-duo-ink hover:bg-duo-soft"
                  >
                    <HardDriveDownload size={12} />
                    {rootName ? "Change project" : "Pick project"}
                  </button>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <PanelBtn
                  title={maximize === "left" ? "Restore" : "Maximize editor"}
                  onClick={() =>
                    setMaximize((m) => (m === "left" ? "none" : "left"))
                  }
                >
                  {maximize === "left" ? (
                    <Minimize2 size={12} />
                  ) : (
                    <Maximize2 size={12} />
                  )}
                </PanelBtn>
                <PanelBtn
                  title="Hide editor"
                  onClick={() => setMaximize("right")}
                >
                  <PanelLeftClose size={12} />
                </PanelBtn>
              </div>
            </div>
          )}

          {/* Right pane tab */}
          {maximize !== "left" && (
            <div
              style={maximize === "right" ? { flex: "1 1 100%" } : undefined}
              className="flex min-w-0 flex-1 items-center justify-between gap-2 px-3"
            >
              <div className="flex min-w-0 items-center gap-1.5 text-xs font-extrabold text-duo-ink">
                <Network size={14} className="shrink-0 text-duo-purple" />
                <span className="truncate">Graph</span>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <PanelBtn
                  title={maximize === "right" ? "Restore" : "Maximize graph"}
                  onClick={() =>
                    setMaximize((m) => (m === "right" ? "none" : "right"))
                  }
                >
                  {maximize === "right" ? (
                    <Minimize2 size={12} />
                  ) : (
                    <Maximize2 size={12} />
                  )}
                </PanelBtn>
                <PanelBtn title="Hide graph" onClick={() => setMaximize("left")}>
                  <PanelRightClose size={12} />
                </PanelBtn>
              </div>
            </div>
          )}
        </header>

        <div ref={containerRef} className="relative flex min-h-0 flex-1">
          <section
            style={leftStyle}
            className="relative flex h-full min-w-0 flex-col border-r-2 border-duo-border bg-white"
          >
            <div className="min-h-0 flex-1 overflow-hidden">
              {leftMode === "explorer" ? (
                <FileExplorer
                  onOpenFile={(html) => {
                    setEditorHTML(html);
                    setLeftMode("editor");
                  }}
                />
              ) : (
                <Editor />
              )}
            </div>
          </section>

          {maximize === "none" && (
            <Splitter
              onResize={handleResize}
              onDoubleClick={() => setLeftPct(DEFAULT_LEFT_PCT)}
            />
          )}

          <section
            style={rightStyle}
            className="relative flex h-full min-w-0 flex-col"
          >
            <div className="min-h-0 flex-1">
              <Graph />
            </div>
          </section>

        </div>

        <NodeModal />
        <LinkHoverOverlay />
        <VideoStorageMigration />
      </main>
    </LinkDragProvider>
  );
}

function PanelBtn({
  children,
  onClick,
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="flex h-6 w-6 items-center justify-center rounded-md border border-duo-border bg-white text-duo-ink hover:bg-duo-soft"
    >
      {children}
    </button>
  );
}
