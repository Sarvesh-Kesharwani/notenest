"use client";

import dynamic from "next/dynamic";
import {
  ArrowLeft,
  Feather,
  FilePlus,
  FolderOpen,
  FolderPlus,
  Maximize2,
  Minimize2,
  PanelLeftClose,
  PanelRightClose,
  RefreshCw,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { LinkDragProvider } from "@/components/LinkDragProvider";
import { useFilesStore } from "@/lib/files-store";
import { findTopicForPath } from "@/lib/study-topic-match";
import { useStudyStore } from "@/lib/study-store";
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
const RevisionVideos = dynamic(() => import("@/components/RevisionVideos"), {
  ssr: false,
});
const StudyTracker = dynamic(() => import("@/components/StudyTracker"), {
  ssr: false,
});
const AuthButton = dynamic(() => import("@/components/AuthButton"), {
  ssr: false,
});
const JsonActivityClock = dynamic(() => import("@/components/JsonActivityClock"), {
  ssr: false,
});
const TopicExplanationRecorder = dynamic(
  () => import("@/components/TopicExplanationRecorder"),
  { ssr: false }
);
const Splitter = dynamic(() => import("@/components/Splitter"), {
  ssr: false,
});

type ActivePage = "ai-json" | "revision-videos" | "study-tracker";
type LeftMode = "explorer" | "editor";
type Maximize = "none" | "left" | "right";

const DEFAULT_LEFT_PCT = 50;
const MIN_PCT = 15;
const MAX_PCT = 85;

export default function Page() {
  const [leftPct, setLeftPct] = useState(DEFAULT_LEFT_PCT);
  const [maximize, setMaximize] = useState<Maximize>("none");
  const [leftMode, setLeftMode] = useState<LeftMode>("explorer");
  const [activePage, setActivePage] = useState<ActivePage>("ai-json");

  const containerRef = useRef<HTMLDivElement>(null);

  const openedPath = useFilesStore((s) => s.openedPath);
  const closeFile = useFilesStore((s) => s.closeFile);
  const saveCurrentHtml = useFilesStore((s) => s.saveCurrentHtml);
  const openFile = useFilesStore((s) => s.openFile);
  const newFile = useFilesStore((s) => s.newFile);
  const newFolder = useFilesStore((s) => s.newFolder);
  const refresh = useFilesStore((s) => s.refresh);
  const filesLoading = useFilesStore((s) => s.loading);
  const rootName = useFilesStore((s) => s.rootName);
  const root = useFilesStore((s) => s.root);
  const editorHTML = useNotesStore((s) => s.editorHTML);
  const nodes = useNotesStore((s) => s.nodes);
  const hydrateFromFile = useNotesStore((s) => s.hydrateFromFile);
  const topics = useStudyStore((s) => s.topics);
  const activeTopic = useMemo(
    () => findTopicForPath(openedPath, topics),
    [openedPath, topics]
  );
  const activeTopicPath = useMemo(
    () => (activeTopic ? topicPath(topics, activeTopic.id) : []),
    [activeTopic, topics]
  );

  const loadedPathRef = useRef<string | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("notenest:layout");
      if (!raw) return;

      const value = JSON.parse(raw) as {
        activePage?: ActivePage;
        leftPct?: number;
      };

      if (typeof value.leftPct === "number") {
        setLeftPct(Math.max(MIN_PCT, Math.min(MAX_PCT, value.leftPct)));
      }

      if (
        value.activePage === "ai-json" ||
        value.activePage === "revision-videos" ||
        value.activePage === "study-tracker"
      ) {
        setActivePage(value.activePage);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(
        "notenest:layout",
        JSON.stringify({ activePage, leftPct })
      );
    } catch {
      /* ignore */
    }
  }, [activePage, leftPct]);

  const handleResize = useCallback((dx: number) => {
    const el = containerRef.current;
    if (!el) return;
    const width = el.clientWidth || 1;
    setLeftPct((current) => {
      const next = current + (dx / width) * 100;
      return Math.max(MIN_PCT, Math.min(MAX_PCT, next));
    });
  }, []);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!openedPath) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void saveCurrentHtml(editorHTML, nodes);
    }, 600);

    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [editorHTML, nodes, openedPath, saveCurrentHtml]);

  useEffect(() => {
    if (openedPath) setLeftMode("editor");
    else setLeftMode("explorer");
  }, [openedPath]);

  useEffect(() => {
    if (!root || !openedPath) return;
    if (loadedPathRef.current === openedPath) return;
    loadedPathRef.current = openedPath;

    void (async () => {
      const content = await useFilesStore.getState().openFile(openedPath);
      if (content != null) {
        hydrateFromFile({ editorHTML: content.html, nodes: content.nodes });
        setLeftMode("editor");
      }
    })();
  }, [root, openedPath, hydrateFromFile]);

  const backToExplorer = useCallback(async () => {
    if (openedPath) await saveCurrentHtml(editorHTML, nodes);
    closeFile();
    setLeftMode("explorer");
  }, [closeFile, editorHTML, nodes, openedPath, saveCurrentHtml]);

  const currentFolder = openedPath
    ? openedPath.split("/").slice(0, -1).join("/")
    : "";
  const fullFilePath = rootName
    ? openedPath
      ? `${rootName}/${openedPath}`
      : rootName
    : "No project folder selected";

  const createFileFromHeader = useCallback(async () => {
    if (!root) return;
    const name = window.prompt("File name (.md will be added)");
    if (!name) return;

    const path = await newFile(currentFolder, name);
    if (!path) return;

    const content = await openFile(path);
    if (content != null) {
      loadedPathRef.current = path;
      hydrateFromFile({ editorHTML: content.html, nodes: content.nodes });
      setLeftMode("editor");
    }
  }, [currentFolder, hydrateFromFile, newFile, openFile, root]);

  const createFolderFromHeader = useCallback(async () => {
    if (!root) return;
    const name = window.prompt("Folder name");
    if (!name) return;
    await newFolder(currentFolder, name);
  }, [currentFolder, newFolder, root]);

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

  return (
    <LinkDragProvider>
      <main className="flex h-screen w-screen flex-col overflow-hidden bg-duo-soft">
        <header className="flex h-12 shrink-0 items-stretch border-b-2 border-duo-border bg-white">
          <div className="flex shrink-0 items-center gap-2 border-r border-duo-border px-3">
            <button
              onClick={() =>
                setActivePage((page) =>
                  page === "ai-json"
                    ? "revision-videos"
                    : page === "revision-videos"
                      ? "study-tracker"
                      : "ai-json"
                )
              }
              title="Switch page"
              className="flex h-7 w-7 items-center justify-center rounded-lg bg-duo-green text-white shadow-duoGreen active:translate-y-[1px] active:shadow-none"
            >
              <Feather size={14} />
            </button>
            <div className="hidden text-sm font-extrabold uppercase tracking-widest text-duo-ink sm:block">
              NoteNest
            </div>
            <div className="ml-2 flex items-center gap-1">
              <AppTab
                active={activePage === "ai-json"}
                onClick={() => setActivePage("ai-json")}
                label="AI_json to Sark_json"
              />
              <AppTab
                active={activePage === "revision-videos"}
                onClick={() => setActivePage("revision-videos")}
                label="revision videos"
              />
              <AppTab
                active={activePage === "study-tracker"}
                onClick={() => setActivePage("study-tracker")}
                label="study"
              />
            </div>
          </div>

          {activePage === "ai-json" && (
            <div className="flex shrink-0 items-center gap-1 border-r border-duo-border px-3">
              <HeaderIconBtn
                title="New file"
                disabled={!root}
                onClick={() => void createFileFromHeader()}
              >
                <FilePlus size={14} />
              </HeaderIconBtn>
              <HeaderIconBtn
                title="New folder"
                disabled={!root}
                onClick={() => void createFolderFromHeader()}
              >
                <FolderPlus size={14} />
              </HeaderIconBtn>
              <HeaderIconBtn
                title="Refresh files"
                disabled={!root}
                onClick={() => void refresh()}
              >
                <RefreshCw
                  size={14}
                  className={filesLoading ? "animate-spin" : undefined}
                />
              </HeaderIconBtn>
            </div>
          )}

          <div className="min-w-0 flex-1" />
          {activePage === "ai-json" && openedPath && (
            <div className="flex shrink-0 items-center gap-2 border-l border-duo-border px-3">
              <JsonActivityClock openedPath={openedPath} active={activePage === "ai-json"} />
              <TopicExplanationRecorder topic={activeTopic} topicPath={activeTopicPath} />
            </div>
          )}
          <div className="flex shrink-0 items-center border-l border-duo-border px-3">
            <AuthButton />
          </div>
        </header>

        <div className="flex h-10 shrink-0 items-stretch border-b-2 border-duo-border bg-white">
          {maximize !== "right" && (
            <div
              style={
                maximize === "left"
                  ? { flex: "1 1 100%" }
                  : { width: `${leftPct}%` }
              }
              className="flex min-w-0 items-center justify-between gap-2 border-r border-duo-border px-3"
            >
              <div className="flex min-w-0 items-center gap-2">
                {activePage === "ai-json" && openedPath && (
                  <button
                    onClick={() => void backToExplorer()}
                    title="Back to folder"
                    className="flex h-7 shrink-0 items-center gap-1 rounded-lg border border-duo-border bg-white px-2 text-[11px] font-extrabold uppercase text-duo-ink hover:bg-duo-soft"
                  >
                    <ArrowLeft size={12} /> Back
                  </button>
                )}
                <FolderOpen size={14} className="shrink-0 text-duo-green" />
                <span
                  title={
                    activePage === "revision-videos"
                      ? "revision videos"
                      : activePage === "study-tracker"
                        ? "study tracker"
                      : fullFilePath
                  }
                  className="truncate text-xs font-extrabold text-duo-ink"
                >
                  {activePage === "revision-videos"
                    ? "revision videos"
                    : activePage === "study-tracker"
                      ? "study tracker"
                    : fullFilePath}
                </span>
              </div>
              <ViewControls
                side="left"
                maximize={maximize}
                setMaximize={setMaximize}
              />
            </div>
          )}

          {maximize !== "left" && (
            <div
              style={
                maximize === "right"
                  ? { flex: "1 1 100%" }
                  : { width: `${100 - leftPct}%` }
              }
              className="flex min-w-0 flex-1 items-center justify-end gap-1 px-3"
            >
              <ViewControls
                side="right"
                maximize={maximize}
                setMaximize={setMaximize}
              />
            </div>
          )}
        </div>

        <div ref={containerRef} className="relative flex min-h-0 flex-1">
          {activePage === "revision-videos" ? (
            <RevisionVideos
              leftStyle={leftStyle}
              rightStyle={rightStyle}
              maximize={maximize}
              onResize={handleResize}
              onResetSplit={() => setLeftPct(DEFAULT_LEFT_PCT)}
            />
          ) : activePage === "study-tracker" ? (
            <StudyTracker
              leftStyle={leftStyle}
              rightStyle={rightStyle}
              maximize={maximize}
              onResize={handleResize}
              onResetSplit={() => setLeftPct(DEFAULT_LEFT_PCT)}
            />
          ) : (
            <>
              <section
                style={leftStyle}
                className="relative flex h-full min-w-0 flex-col border-r-2 border-duo-border bg-white"
              >
                <div className="min-h-0 flex-1 overflow-hidden">
                  {leftMode === "explorer" ? (
                    <FileExplorer
                      onOpenFile={(content, path) => {
                        loadedPathRef.current = path;
                        hydrateFromFile({
                          editorHTML: content.html,
                          nodes: content.nodes,
                        });
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
            </>
          )}
        </div>

        {activePage === "ai-json" && (
          <>
            <NodeModal />
            <LinkHoverOverlay />
            <VideoStorageMigration />
          </>
        )}
      </main>
    </LinkDragProvider>
  );
}

function ViewControls({
  side,
  maximize,
  setMaximize,
}: {
  side: "left" | "right";
  maximize: Maximize;
  setMaximize: Dispatch<SetStateAction<Maximize>>;
}) {
  const isLeft = side === "left";
  const active = isLeft ? maximize === "left" : maximize === "right";
  return (
    <div className="flex shrink-0 items-center gap-1">
      <PanelBtn
        title={active ? "Restore" : `Maximize ${side} view`}
        onClick={() =>
          setMaximize((current) =>
            current === side ? "none" : side
          )
        }
      >
        {active ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
      </PanelBtn>
      <PanelBtn
        title={`Hide ${side} view`}
        onClick={() => setMaximize(isLeft ? "right" : "left")}
      >
        {isLeft ? <PanelLeftClose size={12} /> : <PanelRightClose size={12} />}
      </PanelBtn>
    </div>
  );
}

function AppTab({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-lg px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-wide transition-colors ${
        active
          ? "bg-duo-green text-white"
          : "border border-duo-border bg-white text-gray-500 hover:bg-duo-soft"
      }`}
    >
      {label}
    </button>
  );
}

function HeaderIconBtn({
  children,
  disabled,
  onClick,
  title,
}: {
  children: React.ReactNode;
  disabled?: boolean;
  onClick: () => void;
  title: string;
}) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      title={title}
      className="flex h-7 w-7 items-center justify-center rounded-lg border-2 border-duo-border bg-white text-duo-ink hover:bg-duo-soft disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
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

function topicPath(topics: { id: string; title: string; parentId: string | null }[], topicId: string) {
  const byId = new Map(topics.map((topic) => [topic.id, topic]));
  const path: { id: string; title: string }[] = [];
  let current = byId.get(topicId);
  while (current) {
    path.unshift({ id: current.id, title: current.title });
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return path;
}
