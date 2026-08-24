"use client";

import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  FolderClosed,
  FolderOpen,
  FolderPlus,
  GripVertical,
  HardDrive,
  MoveRight,
  Play,
  RefreshCw,
  Trash2,
  Upload,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent,
  type ReactNode,
} from "react";
import Splitter from "./Splitter";
import {
  LOCAL_ROOT_ID,
  YOULEARN_ROOT_ID,
  useRevisionVideosStore,
  type RevisionFolder,
  type RevisionVideo,
} from "@/lib/revision-videos-store";
import { useFilesStore } from "@/lib/files-store";
import { normalizeStudyLabel } from "@/lib/study-topic-match";
import { useStudyStore, videoStudyMinutes } from "@/lib/study-store";

const REVISION_DND_MIME = "application/x-nodenest-revision-item";
let currentDragPayload: RevisionDragPayload | null = null;

type RevisionDragPayload =
  | { type: "video"; id: string }
  | { type: "folder"; id: string };

interface Props {
  leftStyle: CSSProperties;
  rightStyle: CSSProperties;
  maximize: "none" | "left" | "right";
  onResize: (dx: number) => void;
  onResetSplit: () => void;
}

export default function RevisionVideos({
  leftStyle,
  rightStyle,
  maximize,
  onResize,
  onResetSplit,
}: Props) {
  const selectedVideoId = useRevisionVideosStore((s) => s.selectedVideoId);
  const videos = useRevisionVideosStore((s) => s.videos);
  const folders = useRevisionVideosStore((s) => s.folders);
  const selectedVideo = videos.find((video) => video.id === selectedVideoId) ?? null;

  return (
    <>
      <section
        style={leftStyle}
        className="relative flex h-full min-w-0 flex-col border-r-2 border-duo-border bg-white"
      >
        <RevisionExplorer />
      </section>

      {maximize === "none" && (
        <Splitter onResize={onResize} onDoubleClick={onResetSplit} />
      )}

      <section
        style={rightStyle}
        className="relative flex h-full min-w-0 flex-col bg-[#101010]"
      >
        <RevisionVideoPlayer video={selectedVideo} folders={folders} />
      </section>
    </>
  );
}

function RevisionExplorer() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folders = useRevisionVideosStore((s) => s.folders);
  const videos = useRevisionVideosStore((s) => s.videos);
  const loading = useRevisionVideosStore((s) => s.loading);
  const saving = useRevisionVideosStore((s) => s.saving);
  const error = useRevisionVideosStore((s) => s.error);
  const configError = useRevisionVideosStore((s) => s.configError);
  const supabaseStatus = useRevisionVideosStore((s) => s.supabaseStatus);
  const spaceName = useRevisionVideosStore((s) => s.spaceName);
  const lastFetchedAt = useRevisionVideosStore((s) => s.lastFetchedAt);
  const fetchFromYouLearn = useRevisionVideosStore((s) => s.fetchFromYouLearn);
  const initProjectConfig = useRevisionVideosStore((s) => s.initProjectConfig);
  const importLocalVideos = useRevisionVideosStore((s) => s.importLocalVideos);
  const checkUploadStatus = useRevisionVideosStore((s) => s.checkUploadStatus);
  const createFolder = useRevisionVideosStore((s) => s.createFolder);
  const rootName = useFilesStore((s) => s.rootName);

  const hasActiveUpload = videos.some((video) =>
    ["queued", "uploading", "settling", "renaming", "validating", "uploaded_needs_link"].includes(
      video.uploadStatus ?? ""
    )
  );

  useEffect(() => {
    void initProjectConfig();
  }, [initProjectConfig, rootName]);

  useEffect(() => {
    if (videos.length === 0 && !loading) void fetchFromYouLearn();
  }, [fetchFromYouLearn, loading, videos.length]);

  useEffect(() => {
    if (!hasActiveUpload) return;
    const id = window.setInterval(() => void checkUploadStatus(), 2500);
    return () => window.clearInterval(id);
  }, [checkUploadStatus, hasActiveUpload]);

  const roots = folders
    .filter((folder) => folder.parentId === null)
    .sort((a, b) => rootSort(a.id) - rootSort(b.id) || a.name.localeCompare(b.name));

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-2 border-b-2 border-duo-border bg-white px-3 py-2">
        <div className="min-w-0">
          <div className="truncate text-xs font-extrabold uppercase tracking-wide text-duo-ink">
            {spaceName}
          </div>
          <div className="truncate text-[10px] font-bold uppercase tracking-wide text-gray-400">
            {videos.length} videos
            {lastFetchedAt ? ` - synced ${new Date(lastFetchedAt).toLocaleTimeString()}` : ""}
            {saving ? " - saving" : ""}
            {supabaseStatus === "synced" ? " - db synced" : ""}
            {supabaseStatus === "signed-out" ? " - sign in for db backup" : ""}
            {supabaseStatus === "missing-env" ? " - local config only" : ""}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <input
            ref={fileInputRef}
            type="file"
            accept="video/*"
            multiple
            className="hidden"
            onChange={(event) => {
              const files = event.target.files;
              if (files?.length) void importLocalVideos(files);
              event.currentTarget.value = "";
            }}
          />
          <IconBtn title="Import local videos" onClick={() => fileInputRef.current?.click()}>
            <Upload size={14} />
          </IconBtn>
          <IconBtn
            title="New folder under YouLearn videos"
            onClick={() => {
              const name = window.prompt("Folder name");
              if (name) createFolder(YOULEARN_ROOT_ID, name);
            }}
          >
            <FolderPlus size={14} />
          </IconBtn>
          <IconBtn title="Refresh from YouLearn" onClick={() => void fetchFromYouLearn()}>
            <RefreshCw size={14} className={loading ? "animate-spin" : undefined} />
          </IconBtn>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto py-2 text-sm">
        {roots.length > 0 ? (
          roots.map((root) => <FolderRow key={root.id} folder={root} depth={0} />)
        ) : (
          <div className="px-4 py-6 text-center text-xs font-bold text-gray-400">
            Loading workspace...
          </div>
        )}
      </div>

      {(error || configError) && (
        <div className="border-t-2 border-duo-border bg-duo-red/10 px-3 py-1 text-[11px] font-bold text-duo-red">
          {error || configError}
        </div>
      )}
    </div>
  );
}

function FolderRow({
  folder,
  depth,
}: {
  folder: RevisionFolder;
  depth: number;
}) {
  const folders = useRevisionVideosStore((s) => s.folders);
  const videos = useRevisionVideosStore((s) => s.videos);
  const expanded = useRevisionVideosStore((s) => !!s.expanded[folder.id]);
  const toggleFolder = useRevisionVideosStore((s) => s.toggleFolder);
  const createFolder = useRevisionVideosStore((s) => s.createFolder);
  const renameFolder = useRevisionVideosStore((s) => s.renameFolder);
  const deleteFolder = useRevisionVideosStore((s) => s.deleteFolder);
  const moveFolder = useRevisionVideosStore((s) => s.moveFolder);
  const moveVideo = useRevisionVideosStore((s) => s.moveVideo);

  const children = useMemo(
    () =>
      folders
        .filter((item) => item.parentId === folder.id)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [folder.id, folders]
  );
  const childVideos = useMemo(
    () =>
      videos
        .filter((item) => item.folderId === folder.id)
        .sort((a, b) => a.title.localeCompare(b.title)),
    [folder.id, videos]
  );
  const isRoot = folder.id === YOULEARN_ROOT_ID || folder.id === LOCAL_ROOT_ID;
  const [hover, setHover] = useState(false);
  const [dropActive, setDropActive] = useState(false);

  const canDrop = (payload: RevisionDragPayload | null) =>
    canDropOnFolder(payload, folder.id, folders);

  return (
    <div>
      <div
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        draggable={!isRoot}
        onDragStart={(event) => {
          if (isRoot) return;
          writeDragPayload(event, { type: "folder", id: folder.id });
        }}
        onDragOver={(event) => {
          if (!canDrop(readDragPayload(event))) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
          setDropActive(true);
        }}
        onDragLeave={(event) => {
          if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
          setDropActive(false);
        }}
        onDrop={(event) => {
          const payload = readDragPayload(event);
          if (!canDrop(payload)) return;
          event.preventDefault();
          setDropActive(false);
          if (payload?.type === "video") {
            void moveVideo(payload.id, folder.id);
          } else if (payload?.type === "folder") {
            moveFolder(payload.id, folder.id);
          }
        }}
        onDragEnd={() => {
          setDropActive(false);
          currentDragPayload = null;
        }}
        className={`group flex items-center gap-1 px-2 py-1 text-xs font-bold text-duo-ink hover:bg-duo-soft ${
          dropActive ? "bg-duo-blue/10 ring-2 ring-inset ring-duo-blue/40" : ""
        } ${!isRoot ? "cursor-grab active:cursor-grabbing" : ""}`}
        style={{ paddingLeft: 8 + depth * 14 }}
      >
        {!isRoot && <GripVertical size={11} className="shrink-0 text-gray-300" />}
        <button
          className="flex min-w-0 flex-1 items-center gap-1 text-left"
          onClick={() => toggleFolder(folder.id)}
          title={folder.name}
        >
          {expanded ? (
            <ChevronDown size={12} className="shrink-0 text-gray-500" />
          ) : (
            <ChevronRight size={12} className="shrink-0 text-gray-500" />
          )}
          {folder.id === LOCAL_ROOT_ID ? (
            <HardDrive size={13} className="shrink-0 text-duo-blue" />
          ) : expanded ? (
            <FolderOpen size={13} className="shrink-0 text-duo-yellow" />
          ) : (
            <FolderClosed size={13} className="shrink-0 text-duo-yellow" />
          )}
          <span className="truncate">{folder.name}</span>
        </button>

        {hover && (
          <div className="flex shrink-0 items-center gap-0.5">
            <MiniBtn
              title="New folder"
              onClick={() => {
                const name = window.prompt("Folder name");
                if (name) createFolder(folder.id, name);
              }}
            >
              <FolderPlus size={11} />
            </MiniBtn>
            {!isRoot && (
              <>
                <MiniBtn
                  title="Rename folder"
                  onClick={() => {
                    const name = window.prompt("New folder name", folder.name);
                    if (name) renameFolder(folder.id, name);
                  }}
                >
                  R
                </MiniBtn>
                <MiniBtn
                  title="Move folder"
                  onClick={() => {
                    const parentId = pickFolderId(folders, folder.parentId);
                    if (parentId !== undefined) moveFolder(folder.id, parentId);
                  }}
                >
                  <MoveRight size={11} />
                </MiniBtn>
                <MiniBtn
                  title="Delete folder"
                  onClick={() => {
                    if (window.confirm(`Delete folder ${folder.name}? Videos move to parent.`)) {
                      deleteFolder(folder.id);
                    }
                  }}
                >
                  <Trash2 size={11} />
                </MiniBtn>
              </>
            )}
          </div>
        )}
      </div>

      {expanded && (
        <div>
          {children.map((child) => (
            <FolderRow key={child.id} folder={child} depth={depth + 1} />
          ))}
          {childVideos.map((video) => (
            <VideoRow key={video.id} video={video} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

function VideoRow({ video, depth }: { video: RevisionVideo; depth: number }) {
  const selectedVideoId = useRevisionVideosStore((s) => s.selectedVideoId);
  const selectVideo = useRevisionVideosStore((s) => s.selectVideo);
  const folders = useRevisionVideosStore((s) => s.folders);
  const renameVideo = useRevisionVideosStore((s) => s.renameVideo);
  const moveVideo = useRevisionVideosStore((s) => s.moveVideo);
  const deleteVideo = useRevisionVideosStore((s) => s.deleteVideo);
  const startUpload = useRevisionVideosStore((s) => s.startUpload);
  const [hover, setHover] = useState(false);
  const selected = selectedVideoId === video.id;
  const status = video.uploadStatus;
  const progress = uploadPercent(video);
  const failed = status === "failed";
  const showProgress = status && status !== "local" && !failed;

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      draggable
      onDragStart={(event) => writeDragPayload(event, { type: "video", id: video.id })}
      onDragEnd={() => {
        currentDragPayload = null;
      }}
      className={`group flex cursor-grab items-center gap-1 px-2 py-1 text-xs font-bold active:cursor-grabbing ${
        selected ? "bg-duo-blue/15 text-duo-ink" : "text-duo-ink hover:bg-duo-soft"
      }`}
      style={{ paddingLeft: 8 + depth * 14 }}
    >
      <GripVertical size={11} className="shrink-0 text-gray-300" />
      <button
        className="flex min-w-0 flex-1 items-center gap-1 text-left"
        onClick={() => selectVideo(video.id)}
        title={videoTitle(video)}
      >
        <Play size={12} className="shrink-0 text-duo-blue" />
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-1">
            <span className="truncate">{video.title}</span>
            {showProgress && <UploadBadge status={status} />}
            {failed && <UploadBadge status={status} />}
            {showProgress && (
              <span className="shrink-0 text-[10px] font-extrabold text-gray-400">
                {progress}%
              </span>
            )}
            {failed && (
              <span className="shrink-0 text-[10px] font-extrabold text-duo-red">
                failed
              </span>
            )}
          </span>
          {showProgress && <UploadProgress value={progress} status={status} />}
        </span>
      </button>
      {failed && (
        <div className="flex shrink-0 items-center gap-0.5">
          <MiniBtn title={video.uploadError || "Retry upload"} onClick={() => void startUpload(video.id)}>
            <RefreshCw size={11} />
          </MiniBtn>
          <MiniBtn title="Remove failed entry" onClick={() => deleteVideo(video.id)}>
            <Trash2 size={11} />
          </MiniBtn>
        </div>
      )}
      {hover && !failed && (
        <div className="flex shrink-0 items-center gap-0.5">
          <MiniBtn
            title="Rename video locally"
            onClick={() => {
              const title = window.prompt("New local video title", video.title);
              if (title) renameVideo(video.id, title);
            }}
          >
            R
          </MiniBtn>
          <MiniBtn
            title="Move video locally"
            onClick={() => {
              const folderId = pickFolderId(folders, video.folderId);
              if (folderId !== undefined) void moveVideo(video.id, folderId);
            }}
          >
            <MoveRight size={11} />
          </MiniBtn>
          <MiniBtn
            title="Delete video from local revision list"
            onClick={() => {
              if (window.confirm(`Delete ${video.title} from this revision list?`)) {
                deleteVideo(video.id);
              }
            }}
          >
            <Trash2 size={11} />
          </MiniBtn>
        </div>
      )}
    </div>
  );
}

function UploadBadge({ status }: { status: NonNullable<RevisionVideo["uploadStatus"]> }) {
  if (status === "uploaded" || status === "skipped") {
    return <CheckCircle2 size={11} className="shrink-0 text-duo-green" />;
  }
  if (status === "failed" || status === "uploaded_needs_link") {
    return <AlertCircle size={11} className="shrink-0 text-duo-red" />;
  }
  return <RefreshCw size={11} className="shrink-0 animate-spin text-duo-blue" />;
}

function UploadProgress({
  value,
  status,
}: {
  value: number;
  status: NonNullable<RevisionVideo["uploadStatus"]>;
}) {
  const failed = status === "failed" || status === "uploaded_needs_link";
  const done = status === "uploaded" || status === "skipped";
  return (
    <span
      className="mt-1 block h-1.5 overflow-hidden rounded-full bg-gray-200"
      title={`${value}% ${status}`}
      aria-label={`${value}% ${status}`}
    >
      <span
        className={`block h-full rounded-full transition-[width] ${
          failed ? "bg-duo-red" : done ? "bg-duo-green" : "bg-duo-blue"
        }`}
        style={{ width: `${value}%` }}
      />
    </span>
  );
}

function RevisionVideoPlayer({
  video,
  folders,
}: {
  video: RevisionVideo | null;
  folders: RevisionFolder[];
}) {
  const topics = useStudyStore((s) => s.topics);
  const addVideoSeconds = useStudyStore((s) => s.addVideoSeconds);
  const topic = useMemo(
    () => (video ? findTopicForVideo(video, folders, topics) : null),
    [folders, topics, video]
  );
  const intervalRef = useRef<number | null>(null);

  const stopCounting = () => {
    if (intervalRef.current) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  useEffect(() => stopCounting, []);
  useEffect(() => {
    stopCounting();
  }, [video?.id, topic?.id]);

  if (!video) {
    return (
      <div className="flex h-full items-center justify-center bg-duo-soft p-8 text-center">
        <div className="rounded-2xl border-2 border-dashed border-duo-border bg-white p-6 text-sm font-extrabold text-gray-500">
          Select a revision video.
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#101010]">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 bg-black px-4 py-3 text-white">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-extrabold">{video.title}</div>
          <div className="truncate text-[11px] font-bold uppercase tracking-wide text-white/50">
            {video.sourceType === "youlearn" ? "YouLearn" : "Local"}
            {video.sourceTitle ? ` - source: ${video.sourceTitle}` : ""}
            {video.uploadStatus && video.uploadStatus !== "local" ? ` - ${video.uploadStatus}` : ""}
            {video.author ? ` - ${video.author}` : ""}
            {topic ? ` - ${topic.title}: ${videoStudyMinutes(topic)} min watched` : ""}
          </div>
          {video.uploadStatus && video.uploadStatus !== "local" && video.uploadStatus !== "failed" && (
            <div className="mt-2 flex items-center gap-2">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/15">
                <div
                  className={`h-full rounded-full transition-[width] ${
                    video.uploadStatus === "uploaded" || video.uploadStatus === "skipped"
                      ? "bg-duo-green"
                      : video.uploadStatus === "uploaded_needs_link"
                        ? "bg-duo-red"
                        : "bg-duo-blue"
                  }`}
                  style={{ width: `${uploadPercent(video)}%` }}
                />
              </div>
              <span className="w-9 shrink-0 text-right text-[10px] font-extrabold text-white/60">
                {uploadPercent(video)}%
              </span>
            </div>
          )}
        </div>
        <a
          href={video.url}
          target="_blank"
          rel="noreferrer"
          className="shrink-0 rounded-xl border border-white/20 px-3 py-1.5 text-[11px] font-extrabold uppercase text-white hover:bg-white/10"
        >
          Open source
        </a>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center bg-black">
        <video
          key={`${video.id}-${video.url}`}
          src={video.url}
          poster={video.thumbnailUrl}
          controls
          onPlay={() => {
            if (!topic || intervalRef.current) return;
            intervalRef.current = window.setInterval(() => {
              if (document.visibilityState !== "visible" || !document.hasFocus()) return;
              addVideoSeconds(topic.id, 1);
            }, 1000);
          }}
          onPause={stopCounting}
          onEnded={stopCounting}
          className="max-h-full w-full bg-black"
        />
      </div>
    </div>
  );
}

function findTopicForVideo(
  video: RevisionVideo,
  folders: RevisionFolder[],
  topics: ReturnType<typeof useStudyStore.getState>["topics"]
) {
  const folderNames = folderPathNames(video.folderId, folders);
  const folderIds = folderPathIds(video.folderId, folders);
  for (const id of folderIds) {
    if (id.startsWith("study-topic-")) {
      const topicId = id.slice("study-topic-".length);
      const topic = topics.find((item) => item.id === topicId);
      if (topic) return topic;
    }
  }

  const haystack = normalizeStudyLabel(
    [...folderNames, video.title, video.sourceTitle ?? ""].join(" ")
  );
  return (
    topics
      .filter((topic) => normalizeStudyLabel(topic.title))
      .sort((a, b) => normalizeStudyLabel(b.title).length - normalizeStudyLabel(a.title).length)
      .find((topic) => haystack.includes(normalizeStudyLabel(topic.title))) ?? null
  );
}

function folderPathIds(folderId: string, folders: RevisionFolder[]) {
  const ids: string[] = [];
  let current = folders.find((folder) => folder.id === folderId);
  while (current) {
    ids.push(current.id);
    current = current.parentId ? folders.find((folder) => folder.id === current?.parentId) : undefined;
  }
  return ids;
}

function folderPathNames(folderId: string, folders: RevisionFolder[]) {
  return folderPathIds(folderId, folders)
    .map((id) => folders.find((folder) => folder.id === id)?.name)
    .filter((name): name is string => Boolean(name));
}

function IconBtn({
  children,
  onClick,
  title,
}: {
  children: ReactNode;
  onClick: () => void;
  title: string;
}) {
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

function MiniBtn({
  children,
  onClick,
  title,
}: {
  children: ReactNode;
  onClick: () => void;
  title: string;
}) {
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

function pickFolderId(
  folders: RevisionFolder[],
  currentId: string | null
): string | null | undefined {
  const options = folders.map((folder) => `${folder.id} = ${folder.name}`).join("\n");
  const next = window.prompt(
    `Move to folder id.\n\n${options}`,
    currentId ?? YOULEARN_ROOT_ID
  );
  if (next === null) return undefined;
  const clean = next.trim() || YOULEARN_ROOT_ID;
  return folders.some((folder) => folder.id === clean) ? clean : currentId;
}

function rootSort(id: string) {
  if (id === YOULEARN_ROOT_ID) return 0;
  if (id === LOCAL_ROOT_ID) return 1;
  return 2;
}

function videoTitle(video: RevisionVideo) {
  const parts = [video.title];
  if (video.sourceTitle && video.sourceTitle !== video.title) {
    parts.push(`YouLearn/source: ${video.sourceTitle}`);
  }
  if (video.uploadError) parts.push(video.uploadError);
  return parts.join("\n");
}

function writeDragPayload(
  event: DragEvent<HTMLElement>,
  payload: RevisionDragPayload
) {
  event.dataTransfer.effectAllowed = "move";
  currentDragPayload = payload;
  event.dataTransfer.setData(REVISION_DND_MIME, JSON.stringify(payload));
  event.dataTransfer.setData("text/plain", payload.id);
}

function readDragPayload(event: DragEvent<HTMLElement>): RevisionDragPayload | null {
  const raw = event.dataTransfer.getData(REVISION_DND_MIME);
  if (!raw) return currentDragPayload;
  try {
    const payload = JSON.parse(raw) as Partial<RevisionDragPayload>;
    if (payload.type === "video" && typeof payload.id === "string") {
      return { type: "video", id: payload.id };
    }
    if (payload.type === "folder" && typeof payload.id === "string") {
      return { type: "folder", id: payload.id };
    }
  } catch {
    return null;
  }
  return null;
}

function canDropOnFolder(
  payload: RevisionDragPayload | null,
  targetFolderId: string,
  folders: RevisionFolder[]
) {
  if (!payload) return false;
  if (payload.type === "video") return true;
  if (
    payload.id === targetFolderId ||
    payload.id === YOULEARN_ROOT_ID ||
    payload.id === LOCAL_ROOT_ID
  ) {
    return false;
  }
  return !isFolderInside(folders, targetFolderId, payload.id);
}

function isFolderInside(
  folders: RevisionFolder[],
  folderId: string,
  possibleAncestorId: string
) {
  let current = folders.find((folder) => folder.id === folderId);
  while (current?.parentId) {
    if (current.parentId === possibleAncestorId) return true;
    current = folders.find((folder) => folder.id === current?.parentId);
  }
  return false;
}

function uploadPercent(video: RevisionVideo) {
  if (video.uploadStatus === "failed") return 0;
  const fallback = progressForUploadStatus(video.uploadStatus);
  const raw = Number(video.uploadProgressPercent ?? fallback);
  if (!Number.isFinite(raw)) return fallback;
  const max = video.uploadStatus === "uploaded_needs_link" ? 90 : 100;
  return Math.max(0, Math.min(max, Math.round(raw)));
}

function progressForUploadStatus(status?: RevisionVideo["uploadStatus"]) {
  switch (status) {
    case "queued":
    case "local":
      return 0;
    case "uploading":
      return 25;
    case "settling":
      return 55;
    case "renaming":
      return 75;
    case "validating":
      return 90;
    case "uploaded_needs_link":
      return 90;
    case "uploaded":
    case "skipped":
      return 100;
    default:
      return 0;
  }
}
