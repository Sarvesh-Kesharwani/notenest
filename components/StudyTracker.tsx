"use client";

import {
  AlertTriangle,
  BookOpen,
  ChevronDown,
  ChevronRight,
  Clock3,
  FolderPlus,
  GripVertical,
  Link2,
  Monitor,
  MoveRight,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type DragEvent,
  type ReactNode,
} from "react";
import Splitter from "./Splitter";
import {
  collectTopicIds,
  dependencyBlockers,
  jsonStudyMinutes,
  lastStudiedAt,
  manualStudyMinutes,
  totalStudyMinutes,
  useStudyStore,
  videoStudyMinutes,
  type StudyTopic,
} from "@/lib/study-store";
import { useRevisionVideosStore } from "@/lib/revision-videos-store";
import { useFilesStore } from "@/lib/files-store";

const STUDY_DND_MIME = "application/x-nodenest-study-topic";
let currentDragTopicId: string | null = null;

interface Props {
  leftStyle: CSSProperties;
  rightStyle: CSSProperties;
  maximize: "none" | "left" | "right";
  onResize: (dx: number) => void;
  onResetSplit: () => void;
}

export default function StudyTracker({
  leftStyle,
  rightStyle,
  maximize,
  onResize,
  onResetSplit,
}: Props) {
  const topics = useStudyStore((s) => s.topics);
  const selectedTopicId = useStudyStore((s) => s.selectedTopicId);
  const selectedTopic = topics.find((topic) => topic.id === selectedTopicId) ?? null;

  return (
    <>
      <section
        style={leftStyle}
        className="relative flex h-full min-w-0 flex-col border-r-2 border-duo-border bg-white"
      >
        <StudyTopicTree />
      </section>

      {maximize === "none" && <Splitter onResize={onResize} onDoubleClick={onResetSplit} />}

      <section style={rightStyle} className="relative flex h-full min-w-0 flex-col bg-white">
        <StudyTopicDetail topic={selectedTopic} />
      </section>
    </>
  );
}

function StudyTopicTree() {
  const topics = useStudyStore((s) => s.topics);
  const addTopic = useStudyStore((s) => s.addTopic);
  const initRemoteSync = useStudyStore((s) => s.initRemoteSync);
  const supabaseStatus = useStudyStore((s) => s.supabaseStatus);
  const syncError = useStudyStore((s) => s.syncError);
  const rootName = useFilesStore((s) => s.rootName);
  const roots = useMemo(
    () =>
      topics
        .filter((topic) => topic.parentId === null)
        .sort((a, b) => a.title.localeCompare(b.title)),
    [topics]
  );

  useEffect(() => {
    void initRemoteSync(rootName ?? "nodenest-default");
  }, [initRemoteSync, rootName]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-2 border-b-2 border-duo-border px-3 py-2">
        <div className="min-w-0">
          <div className="truncate text-xs font-extrabold uppercase tracking-wide text-duo-ink">
            Study topics
          </div>
          <div className="truncate text-[10px] font-bold uppercase tracking-wide text-gray-400">
            {topics.length} topics
            {supabaseStatus === "synced" ? " - db synced" : ""}
            {supabaseStatus === "loading" ? " - syncing" : ""}
            {supabaseStatus === "signed-out" ? " - sign in for db sync" : ""}
            {supabaseStatus === "missing-env" ? " - local only" : ""}
          </div>
        </div>
        <IconBtn
          title="Add root topic"
          onClick={() => {
            const title = window.prompt("Topic name");
            if (title) addTopic(null, title);
          }}
        >
          <Plus size={14} />
        </IconBtn>
      </div>

      {syncError && (
        <div className="border-b-2 border-duo-red/20 bg-duo-red/10 px-3 py-1 text-[11px] font-bold text-duo-red">
          {syncError}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-auto py-2">
        {roots.length > 0 ? (
          roots.map((topic) => <TopicRow key={topic.id} topic={topic} depth={0} />)
        ) : (
          <div className="px-5 py-8 text-center text-xs font-extrabold text-gray-400">
            Add your first topic.
          </div>
        )}
      </div>
    </div>
  );
}

function TopicRow({ topic, depth }: { topic: StudyTopic; depth: number }) {
  const topics = useStudyStore((s) => s.topics);
  const expanded = useStudyStore((s) => !!s.expanded[topic.id]);
  const selectedTopicId = useStudyStore((s) => s.selectedTopicId);
  const selectTopic = useStudyStore((s) => s.selectTopic);
  const toggleTopic = useStudyStore((s) => s.toggleTopic);
  const addTopic = useStudyStore((s) => s.addTopic);
  const renameTopic = useStudyStore((s) => s.renameTopic);
  const deleteTopic = useStudyStore((s) => s.deleteTopic);
  const moveTopic = useStudyStore((s) => s.moveTopic);
  const [hover, setHover] = useState(false);
  const [dropActive, setDropActive] = useState(false);

  const children = useMemo(
    () =>
      topics
        .filter((item) => item.parentId === topic.id)
        .sort((a, b) => a.title.localeCompare(b.title)),
    [topic.id, topics]
  );
  const blockers = dependencyBlockers(topic, topics);
  const selected = selectedTopicId === topic.id;
  const last = lastStudiedAt(topic);

  return (
    <div>
      <div
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        draggable
        onDragStart={(event) => writeDragTopic(event, topic.id)}
        onDragOver={(event) => {
          const dragId = readDragTopic(event);
          if (!canDropTopic(topics, dragId, topic.id)) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
          setDropActive(true);
        }}
        onDragLeave={(event) => {
          if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
          setDropActive(false);
        }}
        onDrop={(event) => {
          const dragId = readDragTopic(event);
          if (!canDropTopic(topics, dragId, topic.id)) return;
          event.preventDefault();
          setDropActive(false);
          moveTopic(dragId!, topic.id);
        }}
        onDragEnd={() => {
          currentDragTopicId = null;
          setDropActive(false);
        }}
        className={`group flex cursor-grab items-center gap-1 px-2 py-1 text-xs font-bold active:cursor-grabbing ${
          selected ? "bg-duo-green/15 text-duo-ink" : "text-duo-ink hover:bg-duo-soft"
        } ${dropActive ? "bg-duo-blue/10 ring-2 ring-inset ring-duo-blue/40" : ""}`}
        style={{ paddingLeft: 8 + depth * 14 }}
      >
        <GripVertical size={11} className="shrink-0 text-gray-300" />
        <div
          role="button"
          tabIndex={0}
          className="flex min-w-0 flex-1 items-center gap-1 text-left"
          title={topic.title}
          onClick={() => selectTopic(topic.id)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") selectTopic(topic.id);
          }}
        >
          <button
            type="button"
            className="shrink-0 text-gray-500"
            onClick={(event) => {
              event.stopPropagation();
              toggleTopic(topic.id);
            }}
          >
            {children.length > 0 ? (
              expanded ? (
                <ChevronDown size={12} />
              ) : (
                <ChevronRight size={12} />
              )
            ) : (
              <span className="block w-3" />
            )}
          </button>
          <BookOpen
            size={13}
            className={`shrink-0 ${blockers.length > 0 ? "text-duo-red" : "text-duo-green"}`}
          />
          <span className="min-w-0 flex-1">
            <span className="flex min-w-0 items-center gap-1">
              <span className="truncate">{topic.title}</span>
              {blockers.length > 0 && <AlertTriangle size={11} className="shrink-0 text-duo-red" />}
            </span>
            <span className="block truncate text-[10px] font-bold uppercase text-gray-400">
              {totalStudyMinutes(topic)} min
              {last ? ` - last ${formatRelative(last)}` : " - never"}
            </span>
          </span>
        </div>

        {hover && (
          <div className="flex shrink-0 items-center gap-0.5">
            <MiniBtn
              title="Add child topic"
              onClick={() => {
                const title = window.prompt("Child topic name");
                if (title) addTopic(topic.id, title);
              }}
            >
              <FolderPlus size={11} />
            </MiniBtn>
            <MiniBtn
              title="Rename topic"
              onClick={() => {
                const title = window.prompt("Topic name", topic.title);
                if (title) renameTopic(topic.id, title);
              }}
            >
              <Pencil size={11} />
            </MiniBtn>
            <MiniBtn
              title="Move topic"
              onClick={() => {
                const parentId = pickTopicId(topics, topic.parentId, topic.id);
                if (parentId !== undefined) moveTopic(topic.id, parentId);
              }}
            >
              <MoveRight size={11} />
            </MiniBtn>
            <MiniBtn
              title="Delete topic"
              onClick={() => {
                if (window.confirm(`Delete ${topic.title} and its children?`)) {
                  deleteTopic(topic.id);
                }
              }}
            >
              <Trash2 size={11} />
            </MiniBtn>
          </div>
        )}
      </div>

      {expanded &&
        children.map((child) => (
          <TopicRow key={child.id} topic={child} depth={depth + 1} />
        ))}
    </div>
  );
}

function StudyTopicDetail({ topic }: { topic: StudyTopic | null }) {
  const topics = useStudyStore((s) => s.topics);
  const logStudy = useStudyStore((s) => s.logStudy);
  const addDependency = useStudyStore((s) => s.addDependency);
  const removeDependency = useStudyStore((s) => s.removeDependency);
  const folders = useRevisionVideosStore((s) => s.folders);
  const videos = useRevisionVideosStore((s) => s.videos);
  const initProjectConfig = useRevisionVideosStore((s) => s.initProjectConfig);
  const [minutes, setMinutes] = useState(25);

  useEffect(() => {
    void initProjectConfig();
  }, [initProjectConfig]);

  if (!topic) {
    return (
      <div className="flex h-full items-center justify-center bg-duo-soft p-8 text-center">
        <div className="rounded-2xl border-2 border-dashed border-duo-border bg-white p-6 text-sm font-extrabold text-gray-500">
          Select a study topic.
        </div>
      </div>
    );
  }

  const blockers = dependencyBlockers(topic, topics);
  const dependencies = topic.dependencyIds
    .map((id) => topics.find((item) => item.id === id))
    .filter((item): item is StudyTopic => Boolean(item));
  const ownTree = collectTopicIds(topics, topic.id);
  const dependencyOptions = topics.filter(
    (item) => item.id !== topic.id && !topic.dependencyIds.includes(item.id) && !ownTree.has(item.id)
  );
  const last = lastStudiedAt(topic);
  const recentLogs = [...topic.logs]
    .sort((a, b) => Date.parse(b.studiedAt) - Date.parse(a.studiedAt))
    .slice(0, 8);
  const recordings = videos.filter((video) =>
    folderPathIds(video.folderId, folders).includes(`study-topic-${topic.id}`)
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b-2 border-duo-border px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-xl font-extrabold text-duo-ink">{topic.title}</h2>
            <div className="mt-1 flex flex-wrap gap-2 text-[11px] font-extrabold uppercase text-gray-500">
              <Pill icon={<Clock3 size={12} />}>{totalStudyMinutes(topic)} min total</Pill>
              <Pill icon={<BookOpen size={12} />}>{manualStudyMinutes(topic)} min manual</Pill>
              <Pill icon={<Monitor size={12} />}>{videoStudyMinutes(topic)} min video</Pill>
              <Pill icon={<Clock3 size={12} />}>{jsonStudyMinutes(topic)} min json</Pill>
              <Pill icon={<BookOpen size={12} />}>{last ? `last ${formatDateTime(last)}` : "never studied"}</Pill>
            </div>
          </div>
          <div className={`rounded-lg px-3 py-1.5 text-[11px] font-extrabold uppercase ${
            blockers.length > 0 ? "bg-duo-red/10 text-duo-red" : "bg-duo-green/10 text-duo-green"
          }`}>
            {blockers.length > 0 ? "blocked" : "ready"}
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-5">
        {blockers.length > 0 && (
          <section className="mb-4 rounded-lg border-2 border-duo-red/30 bg-duo-red/10 p-3 text-xs font-bold text-duo-red">
            Study blocked. Refresh these dependencies first:{" "}
            {blockers.map((item) => item.title).join(", ")}.
          </section>
        )}

        <section className="mb-5">
          <h3 className="mb-2 text-xs font-extrabold uppercase tracking-wide text-duo-ink">
            Log study
          </h3>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="number"
              min={1}
              value={minutes}
              onChange={(event) => setMinutes(Number(event.target.value))}
              className="h-9 w-24 rounded-lg border-2 border-duo-border px-3 text-sm font-bold text-duo-ink outline-none focus:border-duo-green"
            />
            <button
              disabled={blockers.length > 0}
              onClick={() => logStudy(topic.id, minutes)}
              className="h-9 rounded-lg bg-duo-green px-4 text-xs font-extrabold uppercase text-white shadow-duoGreen active:translate-y-[1px] active:shadow-none disabled:cursor-not-allowed disabled:opacity-40"
            >
              Add minutes
            </button>
          </div>
        </section>

        <section className="mb-5">
          <h3 className="mb-2 text-xs font-extrabold uppercase tracking-wide text-duo-ink">
            Explanation recordings
          </h3>
          <div className="overflow-hidden rounded-lg border-2 border-duo-border">
            {recordings.length > 0 ? (
              recordings.map((recording) => (
                <a
                  key={recording.id}
                  href={recording.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-between gap-3 border-b border-duo-border px-3 py-2 text-xs font-bold text-duo-ink hover:bg-duo-soft last:border-b-0"
                >
                  <span className="truncate">{recording.title}</span>
                  <span className="shrink-0 text-[10px] font-extrabold uppercase text-duo-blue">
                    Open
                  </span>
                </a>
              ))
            ) : (
              <div className="px-3 py-4 text-xs font-bold text-gray-400">
                No explanation recordings yet. Record from Sark JSON.
              </div>
            )}
          </div>
        </section>

        <section className="mb-5">
          <h3 className="mb-2 text-xs font-extrabold uppercase tracking-wide text-duo-ink">
            Dependencies
          </h3>
          <div className="mb-2 flex flex-wrap gap-2">
            {dependencies.length > 0 ? (
              dependencies.map((dependency) => {
                const stale = dependencyBlockers(topic, topics).some((item) => item.id === dependency.id);
                return (
                  <span
                    key={dependency.id}
                    className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-extrabold ${
                      stale
                        ? "border-duo-red/30 bg-duo-red/10 text-duo-red"
                        : "border-duo-border bg-duo-soft text-duo-ink"
                    }`}
                  >
                    <Link2 size={11} />
                    {dependency.title}
                    <button
                      title="Remove dependency"
                      onClick={() => removeDependency(topic.id, dependency.id)}
                    >
                      <X size={11} />
                    </button>
                  </span>
                );
              })
            ) : (
              <div className="text-xs font-bold text-gray-400">No dependencies.</div>
            )}
          </div>
          <select
            value=""
            onChange={(event) => {
              if (event.target.value) addDependency(topic.id, event.target.value);
            }}
            className="h-9 max-w-full rounded-lg border-2 border-duo-border bg-white px-3 text-xs font-bold text-duo-ink outline-none focus:border-duo-green"
          >
            <option value="">
              {dependencies.length > 0 ? "Add another dependency..." : "Add dependency..."}
            </option>
            {dependencyOptions.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title}
              </option>
            ))}
          </select>
        </section>

        <section>
          <h3 className="mb-2 text-xs font-extrabold uppercase tracking-wide text-duo-ink">
            Recent sessions
          </h3>
          <div className="overflow-hidden rounded-lg border-2 border-duo-border">
            {recentLogs.length > 0 ? (
              recentLogs.map((log) => (
                <div
                  key={log.id}
                  className="flex items-center justify-between gap-3 border-b border-duo-border px-3 py-2 last:border-b-0"
                >
                  <span className="text-xs font-bold text-duo-ink">{formatDateTime(log.studiedAt)}</span>
                  <span className="text-xs font-extrabold text-duo-green">{log.minutes} min</span>
                </div>
              ))
            ) : (
              <div className="px-3 py-4 text-xs font-bold text-gray-400">No sessions yet.</div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function IconBtn({ children, onClick, title }: { children: ReactNode; onClick: () => void; title: string }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="flex h-7 w-7 items-center justify-center rounded-lg border-2 border-duo-border bg-white text-duo-ink hover:bg-duo-soft"
    >
      {children}
    </button>
  );
}

function MiniBtn({ children, onClick, title }: { children: ReactNode; onClick: () => void; title: string }) {
  return (
    <button
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      title={title}
      className="flex h-5 min-w-5 items-center justify-center rounded px-1 text-[10px] font-extrabold text-gray-500 hover:bg-white hover:text-duo-ink"
    >
      {children}
    </button>
  );
}

function Pill({ children, icon }: { children: ReactNode; icon: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-lg border border-duo-border bg-duo-soft px-2 py-1">
      {icon}
      {children}
    </span>
  );
}

function pickTopicId(topics: StudyTopic[], currentId: string | null, movingId: string) {
  const ownTree = collectTopicIds(topics, movingId);
  const options = ["root = Root"]
    .concat(
      topics
        .filter((topic) => !ownTree.has(topic.id))
        .map((topic) => `${topic.id} = ${topic.title}`)
    )
    .join("\n");
  const next = window.prompt(`Move to topic id.\n\n${options}`, currentId ?? "root");
  if (next === null) return undefined;
  const clean = next.trim();
  if (!clean || clean === "root") return null;
  return topics.some((topic) => topic.id === clean && !ownTree.has(topic.id)) ? clean : currentId;
}

function writeDragTopic(event: DragEvent<HTMLElement>, topicId: string) {
  currentDragTopicId = topicId;
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData(STUDY_DND_MIME, topicId);
  event.dataTransfer.setData("text/plain", topicId);
}

function readDragTopic(event: DragEvent<HTMLElement>) {
  return event.dataTransfer.getData(STUDY_DND_MIME) || currentDragTopicId;
}

function canDropTopic(topics: StudyTopic[], dragId: string | null, targetId: string) {
  if (!dragId || dragId === targetId) return false;
  return !collectTopicIds(topics, dragId).has(targetId);
}

function formatRelative(iso: string) {
  const diff = Date.now() - Date.parse(iso);
  if (!Number.isFinite(diff)) return "unknown";
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function formatDateTime(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function folderPathIds(folderId: string, folders: { id: string; parentId: string | null }[]) {
  const ids: string[] = [];
  let current = folders.find((folder) => folder.id === folderId);
  while (current) {
    ids.push(current.id);
    current = current.parentId ? folders.find((folder) => folder.id === current?.parentId) : undefined;
  }
  return ids;
}
