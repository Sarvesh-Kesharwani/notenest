"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { readFile as readProjectFile, writeFile as writeProjectFile } from "./local-fs";
import { useFilesStore } from "./files-store";
import { getStoredVideoUrl, saveVideoFile } from "./local-video-client";

export const YOULEARN_ROOT_ID = "youlearn-root";
export const LOCAL_ROOT_ID = "local-root";
const CONFIG_PATH = ".nodenest/revision-videos.config.json";
const SCHEMA_VERSION = 1;

export type RevisionVideoSource = "youlearn" | "local";
export type UploadStatus =
  | "local"
  | "queued"
  | "uploading"
  | "settling"
  | "renaming"
  | "validating"
  | "uploaded"
  | "uploaded_needs_link"
  | "failed"
  | "skipped";

export interface RevisionFolder {
  id: string;
  name: string;
  parentId: string | null;
}

export interface RevisionVideo {
  id: string;
  title: string;
  url: string;
  thumbnailUrl?: string;
  length?: number;
  size?: number;
  author?: string;
  folderId: string;
  sourceFolderId?: string;
  sourceType: RevisionVideoSource;
  sourceTitle?: string;
  youlearnContentId?: string;
  storedFileName?: string;
  originalName?: string;
  uploadStatus?: UploadStatus;
  uploadProgressPercent?: number;
  uploadJobId?: string;
  uploadTargetTitle?: string;
  uploadError?: string;
  mappedYouLearnId?: string;
}

export interface StudyRecordingInput {
  topicPath: { id: string; title: string }[];
  title: string;
  storedFileName: string;
  originalName: string;
  url?: string;
}

interface YouLearnContent {
  _id?: string;
  content_id?: string;
  type?: string;
  title?: string;
  thumbnail_url?: string;
  content_url?: string;
  length?: number;
  size?: number;
  author?: string;
}

interface YouLearnMap {
  content?: { id?: string };
  folder?: { id?: string };
}

interface YouLearnSpaceResponse {
  space?: { name?: string };
  contents?: YouLearnContent[];
  space_content_maps?: YouLearnMap[];
}

interface UploadPilotItem {
  path: string;
  name: string;
  status: UploadStatus;
  progress_percent?: number;
  display_title?: string;
  error?: string;
}

interface UploadPilotState {
  job?: {
    id: string;
    items: UploadPilotItem[];
    finished_at?: number | null;
  } | null;
  error?: string;
}

interface RevisionConfig {
  schemaVersion: number;
  projectId: string;
  updatedAt: string;
  folders: RevisionFolder[];
  videos: RevisionVideo[];
  hiddenVideoIds: string[];
  expanded: Record<string, boolean>;
  spaceName: string;
  lastFetchedAt: string | null;
}

interface RevisionVideosState {
  projectId: string | null;
  folders: RevisionFolder[];
  videos: RevisionVideo[];
  selectedVideoId: string | null;
  hiddenVideoIds: string[];
  expanded: Record<string, boolean>;
  loading: boolean;
  saving: boolean;
  error: string | null;
  configError: string | null;
  supabaseStatus: "idle" | "synced" | "signed-out" | "missing-env" | "error";
  spaceName: string;
  lastFetchedAt: string | null;

  initProjectConfig: () => Promise<void>;
  saveProjectConfig: () => Promise<void>;
  fetchFromYouLearn: () => Promise<void>;
  importLocalVideos: (files: FileList | File[]) => Promise<void>;
  checkUploadStatus: () => Promise<void>;
  startUpload: (id: string) => Promise<void>;
  selectVideo: (id: string | null) => void;
  toggleFolder: (id: string) => void;
  createFolder: (parentId: string | null, name: string) => void;
  renameFolder: (id: string, name: string) => void;
  deleteFolder: (id: string) => void;
  moveFolder: (id: string, parentId: string | null) => void;
  renameVideo: (id: string, title: string) => void;
  deleteVideo: (id: string) => void;
  moveVideo: (id: string, folderId: string | null) => Promise<void>;
  addStudyRecording: (recording: StudyRecordingInput) => void;
}

const DEFAULT_FOLDERS: RevisionFolder[] = [
  { id: YOULEARN_ROOT_ID, name: "YouLearn videos", parentId: null },
  { id: LOCAL_ROOT_ID, name: "Local videos", parentId: null },
];

const DEFAULT_EXPANDED = {
  [YOULEARN_ROOT_ID]: true,
  [LOCAL_ROOT_ID]: true,
};

let saveTimer: ReturnType<typeof setTimeout> | null = null;

export const useRevisionVideosStore = create<RevisionVideosState>()(
  persist(
    (set, get) => {
      const queueSave = () => {
        if (typeof window === "undefined") return;
        if (saveTimer) clearTimeout(saveTimer);
        saveTimer = setTimeout(() => void get().saveProjectConfig(), 700);
      };

      const commit = (partial: Partial<RevisionVideosState>, shouldSave = true) => {
        set(partial);
        if (shouldSave) queueSave();
      };

      return {
        projectId: null,
        folders: DEFAULT_FOLDERS,
        videos: [],
        selectedVideoId: null,
        hiddenVideoIds: [],
        expanded: DEFAULT_EXPANDED,
        loading: false,
        saving: false,
        error: null,
        configError: null,
        supabaseStatus: "idle",
        spaceName: "Obsidian Projects",
        lastFetchedAt: null,

        initProjectConfig: async () => {
          const { root, rootName } = useFilesStore.getState();
          if (!root || !rootName) {
            commit(
              {
                folders: ensureBaseFolders(get().folders),
                expanded: { ...DEFAULT_EXPANDED, ...get().expanded },
                configError: null,
              },
              false
            );
            return;
          }

          let localConfig: RevisionConfig | null = null;
          let remoteConfig: RevisionConfig | null = null;

          try {
            const raw = await readProjectFile(root, CONFIG_PATH);
            localConfig = parseConfig(JSON.parse(raw));
          } catch {
            localConfig = null;
          }

          try {
            const response = await fetch(
              `/api/nodenest/revision-config?projectKey=${encodeURIComponent(rootName)}`,
              { cache: "no-store" }
            );
            if (response.status === 401) {
              set({ supabaseStatus: "signed-out" });
            } else {
              const data = (await response.json()) as {
                config?: RevisionConfig | null;
                skipped?: boolean;
                reason?: string;
                error?: string;
              };
              if (data.skipped && data.reason === "missing-supabase-env") {
                set({ supabaseStatus: "missing-env" });
              } else if (!response.ok) {
                set({ supabaseStatus: "error", configError: data.error || "Supabase backup failed" });
              } else if (data.config) {
                remoteConfig = parseConfig(data.config);
              }
            }
          } catch (error) {
            set({
              supabaseStatus: "error",
              configError: error instanceof Error ? error.message : String(error),
            });
          }

          const chosen = pickNewestConfig(localConfig, remoteConfig);
          if (chosen) {
            commit(applyConfig(chosen), false);
          } else if (!get().projectId) {
            commit({ projectId: crypto.randomUUID(), folders: ensureBaseFolders(get().folders) });
          }

          if (chosen && chosen === remoteConfig && root) {
            await get().saveProjectConfig();
          }
        },

        saveProjectConfig: async () => {
          const { root, rootName } = useFilesStore.getState();
          const state = get();
          const projectId = state.projectId ?? crypto.randomUUID();
          const config = toConfig({ ...state, projectId });

          set({ projectId, saving: true, configError: null });

          if (root) {
            try {
              await writeProjectFile(root, CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`);
            } catch (error) {
              set({
                configError: error instanceof Error ? error.message : String(error),
              });
            }
          }

          if (rootName) {
            try {
              const response = await fetch("/api/nodenest/revision-config", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  projectKey: rootName,
                  projectName: rootName,
                  config,
                }),
              });
              const data = (await response.json()) as {
                skipped?: boolean;
                reason?: string;
                error?: string;
              };
              if (response.status === 401) {
                set({ supabaseStatus: "signed-out" });
              } else if (data.skipped && data.reason === "missing-supabase-env") {
                set({ supabaseStatus: "missing-env" });
              } else if (!response.ok) {
                set({ supabaseStatus: "error", configError: data.error || "Supabase backup failed" });
              } else {
                set({ supabaseStatus: "synced" });
              }
            } catch (error) {
              set({
                supabaseStatus: "error",
                configError: error instanceof Error ? error.message : String(error),
              });
            }
          }

          set({ saving: false });
        },

        fetchFromYouLearn: async () => {
          set({ loading: true, error: null });
          try {
            const response = await fetch("/api/youlearn-space");
            const data = (await response.json()) as YouLearnSpaceResponse & {
              error?: string;
            };

            if (!response.ok) {
              throw new Error(data.error || "Failed to fetch YouLearn space");
            }

            const state = get();
            const contentToFolder = new Map<string, string>();
            for (const map of data.space_content_maps ?? []) {
              const contentId = map.content?.id;
              const folderId = map.folder?.id;
              if (contentId && folderId) contentToFolder.set(contentId, folderId);
            }

            const foldersById = new Map(ensureBaseFolders(state.folders).map((f) => [f.id, f]));
            const hiddenVideoIds = new Set(state.hiddenVideoIds);
            const videosBySource = new Map<string, RevisionVideo>();
            const videosById = new Map<string, RevisionVideo>();
            for (const video of state.videos) {
              if (isHiddenVideo(video, hiddenVideoIds)) continue;
              if (video.sourceType === "youlearn" && video.youlearnContentId) {
                videosBySource.set(video.youlearnContentId, video);
              }
              videosById.set(video.id, video);
            }

            const incomingVideos = (data.contents ?? []).filter(
              (item) => item.type === "video" && item.content_url
            );

            const nextVideos: RevisionVideo[] = [];
            const mappedLocalIds = new Set<string>();

            for (const item of incomingVideos) {
              const sourceId = item.content_id ?? item._id;
              if (!sourceId || !item.content_url) continue;
              if (isHiddenRemoteVideo(sourceId, item.title, hiddenVideoIds)) continue;

              const sourceFolderId = contentToFolder.get(sourceId) ?? "youlearn-unfoldered";
              if (!foldersById.has(sourceFolderId)) {
                foldersById.set(sourceFolderId, {
                  id: sourceFolderId,
                  name:
                    sourceFolderId === "youlearn-unfoldered"
                      ? "Unfoldered"
                      : `Folder ${sourceFolderId.slice(-4)}`,
                  parentId: YOULEARN_ROOT_ID,
                });
              }

              const mappedLocal = state.videos.find(
                (video) =>
                  video.sourceType === "local" &&
                  !isHiddenVideo(video, hiddenVideoIds) &&
                  (video.mappedYouLearnId === sourceId ||
                    (!video.mappedYouLearnId &&
                      isUploaded(video.uploadStatus) &&
                      titleMatchesUpload(video, item.title ?? "")))
              );

              if (mappedLocal) {
                mappedLocalIds.add(mappedLocal.id);
                nextVideos.push({
                  ...mappedLocal,
                  url: item.content_url,
                  thumbnailUrl: item.thumbnail_url,
                  length: item.length,
                  size: item.size,
                  author: item.author,
                  sourceTitle: item.title ?? mappedLocal.sourceTitle,
                  sourceFolderId,
                  mappedYouLearnId: sourceId,
                uploadStatus: "uploaded",
                uploadProgressPercent: 100,
                uploadError: undefined,
                });
                continue;
              }

              const existing = videosBySource.get(sourceId) ?? videosById.get(sourceId);
              if (existing && isHiddenVideo(existing, hiddenVideoIds)) {
                continue;
              }

              nextVideos.push({
                id: existing?.id ?? `youlearn-${sourceId}`,
                title: existing?.title ?? item.title ?? "Untitled video",
                url: item.content_url,
                thumbnailUrl: item.thumbnail_url,
                length: item.length,
                size: item.size,
                author: item.author,
                sourceFolderId,
                folderId: existing?.folderId ?? sourceFolderId,
                sourceType: "youlearn",
                sourceTitle: item.title ?? "Untitled video",
                youlearnContentId: sourceId,
              });
            }

            for (const video of state.videos) {
              if (
                video.sourceType === "local" &&
                !mappedLocalIds.has(video.id) &&
                !isHiddenVideo(video, hiddenVideoIds)
              ) {
                nextVideos.push(video);
              }
            }

            const selectedVideoId =
              state.selectedVideoId &&
              nextVideos.some((video) => video.id === state.selectedVideoId)
                ? state.selectedVideoId
                : nextVideos[0]?.id ?? null;

            commit({
              folders: Array.from(foldersById.values()),
              videos: nextVideos,
              selectedVideoId,
              loading: false,
              error: null,
              spaceName: data.space?.name ?? state.spaceName,
              lastFetchedAt: new Date().toISOString(),
              expanded: { ...DEFAULT_EXPANDED, ...state.expanded, [YOULEARN_ROOT_ID]: true },
            });
          } catch (error) {
            set({
              loading: false,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        },

        importLocalVideos: async (files) => {
          const selected = Array.from(files);
          if (selected.length === 0) return;

          set({ loading: true, error: null });
          try {
            const savedVideos: RevisionVideo[] = [];
            for (const file of selected) {
              const saved = await saveVideoFile(file);
              savedVideos.push({
                id: `local-${crypto.randomUUID()}`,
                title: stripVideoExtension(saved.originalName || file.name),
                url: saved.url || getStoredVideoUrl(saved.fileName),
                folderId: LOCAL_ROOT_ID,
                sourceType: "local",
                sourceTitle: saved.originalName || file.name,
                storedFileName: saved.fileName,
                originalName: saved.originalName || file.name,
                uploadStatus: "local",
                uploadProgressPercent: 0,
              });
            }

            commit({
              videos: [...get().videos, ...savedVideos],
              loading: false,
              selectedVideoId: savedVideos[0]?.id ?? get().selectedVideoId,
              expanded: { ...get().expanded, [LOCAL_ROOT_ID]: true },
            });
          } catch (error) {
            set({
              loading: false,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        },

        checkUploadStatus: async () => {
          try {
            const response = await fetch("/api/nodenest/uploadpilot/state", {
              cache: "no-store",
            });
            const data = (await response.json()) as UploadPilotState;
            if (!response.ok || data.error || !data.job) return;

            let shouldRefetch = false;
            const videos = get().videos.map((video) => {
              if (video.sourceType !== "local") return video;
              const item = data.job?.items.find(
                (candidate) =>
                  candidate.name === video.uploadTargetTitle ||
                  candidate.display_title === video.uploadTargetTitle ||
                  candidate.name === `${video.title}${extensionOf(video.storedFileName)}`
              );
              if (!item) return video;

              const nextStatus = item.status;
              if (isUploaded(nextStatus)) shouldRefetch = true;
              const nextUploadStatus = isUploaded(nextStatus)
                ? "uploaded_needs_link"
                : nextStatus;
              const progress = uploadProgress({ ...item, status: nextUploadStatus });
              return {
                ...video,
                uploadJobId: data.job?.id ?? video.uploadJobId,
                uploadStatus: nextUploadStatus,
                uploadProgressPercent: progress,
                uploadError:
                  item.error ||
                  (nextUploadStatus === "uploaded_needs_link"
                    ? "Upload finished locally, waiting for YouLearn confirmation."
                    : undefined),
              };
            });

            commit({ videos }, shouldRefetch);
            if (shouldRefetch) void get().fetchFromYouLearn();
          } catch {
            /* UploadPilot status is optional. */
          }
        },

        startUpload: async (id) => {
          const state = get();
          const video = state.videos.find((item) => item.id === id);
          if (!video || video.sourceType !== "local" || !video.storedFileName) return;

          commit({
            videos: state.videos.map((item) =>
              item.id === id
                ? {
                    ...item,
                    uploadStatus: "queued",
                    uploadProgressPercent: 0,
                    uploadError: undefined,
                  }
                : item
            ),
          });

          try {
            const response = await fetch("/api/nodenest/uploadpilot/start", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                storedFileName: video.storedFileName,
                title: video.title,
              }),
            });
            const data = (await response.json()) as {
              error?: string;
              stagedName?: string;
              state?: UploadPilotState;
            };

            if (!response.ok) {
              throw new Error(data.error || "UploadPilot upload failed to start");
            }

            const jobId = data.state?.job?.id;
            const uploadedItem = data.state?.job?.items.find(
              (item) => item.name === data.stagedName || item.display_title === data.stagedName
            );
            commit({
              videos: get().videos.map((item) =>
                item.id === id
                  ? {
                      ...item,
                      uploadStatus: "uploading",
                      uploadProgressPercent: uploadProgress(uploadedItem, "uploading"),
                      uploadJobId: jobId,
                      uploadTargetTitle: data.stagedName,
                      uploadError: undefined,
                    }
                  : item
              ),
            });
          } catch (error) {
            commit({
              videos: get().videos.map((item) =>
                item.id === id
                  ? {
                      ...item,
                      uploadStatus: "failed",
                      uploadProgressPercent: 0,
                      uploadError:
                        error instanceof Error ? error.message : String(error),
                    }
                  : item
              ),
            });
          }
        },

        selectVideo: (id) => set({ selectedVideoId: id }),
        toggleFolder: (id) =>
          set({ expanded: { ...get().expanded, [id]: !get().expanded[id] } }),

        createFolder: (parentId, name) => {
          const clean = name.trim();
          if (!clean) return;
          const id = `folder-${crypto.randomUUID()}`;
          commit({
            folders: [
              ...ensureBaseFolders(get().folders),
              { id, name: clean, parentId: parentId ?? YOULEARN_ROOT_ID },
            ],
            expanded: {
              ...get().expanded,
              [parentId ?? YOULEARN_ROOT_ID]: true,
              [id]: true,
            },
          });
        },

        renameFolder: (id, name) => {
          const clean = name.trim();
          if (!clean || isFixedRoot(id)) return;
          commit({
            folders: get().folders.map((folder) =>
              folder.id === id ? { ...folder, name: clean } : folder
            ),
          });
        },

        deleteFolder: (id) => {
          if (isFixedRoot(id)) return;
          const state = get();
          const removeIds = collectFolderIds(state.folders, id);
          const parentId = state.folders.find((f) => f.id === id)?.parentId ?? YOULEARN_ROOT_ID;
          const videos = state.videos.map((video) =>
            removeIds.has(video.folderId) ? { ...video, folderId: parentId } : video
          );

          commit({
            folders: state.folders.filter((folder) => !removeIds.has(folder.id)),
            videos,
          });
        },

        moveFolder: (id, parentId) => {
          if (isFixedRoot(id)) return;
          const state = get();
          const nextParent = parentId ?? YOULEARN_ROOT_ID;
          const ownTree = collectFolderIds(state.folders, id);
          if (ownTree.has(nextParent)) return;

          commit({
            folders: state.folders.map((folder) =>
              folder.id === id ? { ...folder, parentId: nextParent } : folder
            ),
            expanded: { ...state.expanded, [nextParent]: true },
          });
        },

        renameVideo: (id, title) => {
          const clean = title.trim();
          if (!clean) return;
          commit({
            videos: get().videos.map((video) =>
              video.id === id ? { ...video, title: clean } : video
            ),
          });
        },

        deleteVideo: (id) => {
          const state = get();
          const video = state.videos.find((item) => item.id === id);
          const hiddenKeys = hiddenKeysForVideo(video);

          commit({
            videos: state.videos.filter((item) => item.id !== id),
            hiddenVideoIds: Array.from(new Set([...state.hiddenVideoIds, ...hiddenKeys])),
            selectedVideoId: state.selectedVideoId === id ? null : state.selectedVideoId,
          });
          void get().saveProjectConfig();
        },

        moveVideo: async (id, folderId) => {
          const state = get();
          const nextFolder = folderId ?? YOULEARN_ROOT_ID;
          commit({
            videos: state.videos.map((video) =>
              video.id === id ? { ...video, folderId: nextFolder } : video
            ),
            expanded: { ...state.expanded, [nextFolder]: true },
          });

          const moved = get().videos.find((video) => video.id === id);
          if (
            moved?.sourceType === "local" &&
            moved.uploadStatus !== "uploaded" &&
            isUnderFolder(get().folders, nextFolder, YOULEARN_ROOT_ID)
          ) {
            await get().startUpload(id);
          }
        },

        addStudyRecording: (recording) => {
          const state = get();
          const foldersById = new Map(ensureBaseFolders(state.folders).map((folder) => [folder.id, folder]));
          let parentId = LOCAL_ROOT_ID;
          const rootId = "study-recordings-root";

          if (!foldersById.has(rootId)) {
            foldersById.set(rootId, {
              id: rootId,
              name: "Study explanations",
              parentId,
            });
          }
          parentId = rootId;
          const expandedFolders = new Set([LOCAL_ROOT_ID, rootId]);

          for (const topic of recording.topicPath) {
            const folderId = `study-topic-${topic.id}`;
            const existing = foldersById.get(folderId);
            foldersById.set(folderId, {
              id: folderId,
              name: topic.title,
              parentId,
            });
            if (existing && existing.parentId !== parentId) {
              foldersById.set(folderId, { ...existing, name: topic.title, parentId });
            }
            parentId = folderId;
            expandedFolders.add(folderId);
          }

          const video: RevisionVideo = {
            id: `local-study-${crypto.randomUUID()}`,
            title: recording.title,
            url: recording.url || getStoredVideoUrl(recording.storedFileName),
            folderId: parentId,
            sourceType: "local",
            sourceTitle: recording.originalName,
            storedFileName: recording.storedFileName,
            originalName: recording.originalName,
            uploadStatus: "local",
            uploadProgressPercent: 0,
          };

          commit({
            folders: Array.from(foldersById.values()),
            videos: [...state.videos, video],
            selectedVideoId: video.id,
            expanded: {
              ...state.expanded,
              ...Object.fromEntries(Array.from(expandedFolders).map((id) => [id, true])),
            },
          });
          void get().saveProjectConfig();
        },
      };
    },
    {
      name: "notenest-revision-videos-v1",
      partialize: (state) => ({
        projectId: state.projectId,
        folders: state.folders,
        videos: state.videos,
        selectedVideoId: state.selectedVideoId,
        hiddenVideoIds: state.hiddenVideoIds,
        expanded: state.expanded,
        spaceName: state.spaceName,
        lastFetchedAt: state.lastFetchedAt,
      }),
      merge: (persisted, current) => ({
        ...current,
        ...(persisted as Partial<RevisionVideosState>),
        folders: ensureBaseFolders(
          (persisted as Partial<RevisionVideosState>)?.folders ?? current.folders
        ),
        expanded: {
          ...DEFAULT_EXPANDED,
          ...((persisted as Partial<RevisionVideosState>)?.expanded ?? {}),
        },
        hiddenVideoIds: normalizeHiddenVideoIds(
          (persisted as Partial<RevisionVideosState>)?.hiddenVideoIds ?? current.hiddenVideoIds
        ),
        videos: normalizeVideos(
          (persisted as Partial<RevisionVideosState>)?.videos ?? current.videos
        ),
      }),
    }
  )
);

function collectFolderIds(folders: RevisionFolder[], rootId: string): Set<string> {
  const ids = new Set<string>([rootId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const folder of folders) {
      if (folder.parentId && ids.has(folder.parentId) && !ids.has(folder.id)) {
        ids.add(folder.id);
        changed = true;
      }
    }
  }
  return ids;
}

function ensureBaseFolders(folders: RevisionFolder[]) {
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  if (byId.has("root") && !byId.has(YOULEARN_ROOT_ID)) {
    const oldRoot = byId.get("root")!;
    byId.delete("root");
    byId.set(YOULEARN_ROOT_ID, {
      ...oldRoot,
      id: YOULEARN_ROOT_ID,
      name: "YouLearn videos",
      parentId: null,
    });
  }

  for (const folder of DEFAULT_FOLDERS) {
    if (!byId.has(folder.id)) byId.set(folder.id, folder);
  }

  return Array.from(byId.values()).map((folder) =>
    folder.parentId === "root" ? { ...folder, parentId: YOULEARN_ROOT_ID } : folder
  );
}

function normalizeVideos(videos: RevisionVideo[]) {
  return videos.map((video) => {
    const uploadStatus =
      video.sourceType === "local" ? video.uploadStatus ?? "local" : video.uploadStatus;

    return {
      ...video,
      id:
        video.id === "root"
          ? `youlearn-${video.youlearnContentId ?? crypto.randomUUID()}`
          : video.id,
      folderId: video.folderId === "root" ? YOULEARN_ROOT_ID : video.folderId,
      sourceType: video.sourceType ?? "youlearn",
      uploadStatus,
      uploadProgressPercent: normalizeProgress(uploadStatus, video.uploadProgressPercent),
    };
  });
}

function isFixedRoot(id: string) {
  return id === YOULEARN_ROOT_ID || id === LOCAL_ROOT_ID || id === "root";
}

function isUnderFolder(folders: RevisionFolder[], folderId: string, rootId: string) {
  if (folderId === rootId) return true;
  let current = folders.find((folder) => folder.id === folderId);
  while (current?.parentId) {
    if (current.parentId === rootId) return true;
    current = folders.find((folder) => folder.id === current?.parentId);
  }
  return false;
}

function toConfig(state: RevisionVideosState & { projectId: string }): RevisionConfig {
  return {
    schemaVersion: SCHEMA_VERSION,
    projectId: state.projectId,
    updatedAt: new Date().toISOString(),
    folders: ensureBaseFolders(state.folders),
    videos: normalizeVideos(state.videos),
    hiddenVideoIds: normalizeHiddenVideoIds(state.hiddenVideoIds),
    expanded: { ...DEFAULT_EXPANDED, ...state.expanded },
    spaceName: state.spaceName,
    lastFetchedAt: state.lastFetchedAt,
  };
}

function parseConfig(value: unknown): RevisionConfig | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<RevisionConfig>;
  if (!Array.isArray(candidate.folders) || !Array.isArray(candidate.videos)) {
    return null;
  }

  return {
    schemaVersion: candidate.schemaVersion ?? SCHEMA_VERSION,
    projectId: candidate.projectId || crypto.randomUUID(),
    updatedAt: candidate.updatedAt || new Date(0).toISOString(),
    folders: ensureBaseFolders(candidate.folders),
    videos: normalizeVideos(candidate.videos),
    hiddenVideoIds: normalizeHiddenVideoIds(candidate.hiddenVideoIds ?? []),
    expanded: { ...DEFAULT_EXPANDED, ...(candidate.expanded ?? {}) },
    spaceName: candidate.spaceName ?? "Obsidian Projects",
    lastFetchedAt: candidate.lastFetchedAt ?? null,
  };
}

function pickNewestConfig(local: RevisionConfig | null, remote: RevisionConfig | null) {
  if (!local) return remote;
  if (!remote) return local;
  return Date.parse(remote.updatedAt) > Date.parse(local.updatedAt) ? remote : local;
}

function applyConfig(config: RevisionConfig): Partial<RevisionVideosState> {
  return {
    projectId: config.projectId,
    folders: ensureBaseFolders(config.folders),
    videos: normalizeVideos(config.videos),
    hiddenVideoIds: normalizeHiddenVideoIds(config.hiddenVideoIds),
    expanded: { ...DEFAULT_EXPANDED, ...config.expanded },
    spaceName: config.spaceName,
    lastFetchedAt: config.lastFetchedAt,
    configError: null,
  };
}

function stripVideoExtension(name: string) {
  return name.replace(/\.(mp4|mov|m4v|webm|ogg|ogv|avi|mkv)$/i, "");
}

function extensionOf(name?: string) {
  const match = name?.match(/\.[a-z0-9]+$/i);
  return match?.[0] ?? "";
}

function titleMatchesUpload(video: RevisionVideo, remoteTitle: string) {
  const title = remoteTitle.trim().toLowerCase();
  const localTitle = video.title.trim().toLowerCase();
  const targetTitle = (video.uploadTargetTitle ?? "").trim().toLowerCase();
  return title === localTitle || title === targetTitle || title === `${localTitle}${extensionOf(video.storedFileName)}`;
}

function isUploaded(status?: UploadStatus) {
  return status === "uploaded" || status === "skipped";
}

function uploadProgress(item?: UploadPilotItem, fallbackStatus?: UploadStatus) {
  const status = item?.status ?? fallbackStatus;
  if (status === "failed") return 0;
  const raw = Number(item?.progress_percent ?? progressForStatus(status));
  if (!Number.isFinite(raw)) return 0;
  const max = status === "uploaded_needs_link" ? 90 : 100;
  return Math.max(0, Math.min(max, Math.round(raw)));
}

function progressForStatus(status?: UploadStatus) {
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

function normalizeProgress(status: UploadStatus | undefined, value: number | undefined) {
  if (status === "failed") return 0;
  const fallback = progressForStatus(status);
  const raw = Number(value ?? fallback);
  if (!Number.isFinite(raw)) return fallback;
  const max = status === "uploaded_needs_link" ? 90 : 100;
  return Math.max(0, Math.min(max, Math.round(raw)));
}

function normalizeHiddenVideoIds(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function hiddenKeysForVideo(video?: RevisionVideo | null) {
  if (!video) return [];
  const keys: string[] = [];
  addHiddenKey(keys, "id", video.id, true);
  addHiddenKey(keys, "source", video.youlearnContentId, true);
  addHiddenKey(keys, "source", video.mappedYouLearnId, true);
  addHiddenKey(keys, "stored", video.storedFileName);
  addHiddenKey(keys, "original", video.originalName);
  addHiddenKey(keys, "target", video.uploadTargetTitle);
  addHiddenKey(keys, "title", video.title);
  addHiddenKey(keys, "title", video.sourceTitle);
  return keys;
}

function isHiddenVideo(video: RevisionVideo, hiddenKeys: Set<string>) {
  return hiddenKeysForVideo(video).some((key) => hiddenKeys.has(key));
}

function isHiddenRemoteVideo(
  sourceId: string,
  title: string | undefined,
  hiddenKeys: Set<string>
) {
  return (
    hiddenKeys.has(sourceId) ||
    hiddenKeys.has(hiddenKey("id", sourceId)) ||
    hiddenKeys.has(hiddenKey("source", sourceId)) ||
    Boolean(title && hiddenKeys.has(hiddenKey("title", title)))
  );
}

function addHiddenKey(
  keys: string[],
  prefix: string,
  value: string | undefined,
  includeRaw = false
) {
  const clean = value?.trim();
  if (!clean) return;
  if (includeRaw) keys.push(clean);
  keys.push(hiddenKey(prefix, clean));
}

function hiddenKey(prefix: string, value: string) {
  return `${prefix}:${value.trim().toLowerCase()}`;
}
