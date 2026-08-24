"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface StudyLog {
  id: string;
  minutes: number;
  studiedAt: string;
}

export interface StudyTopic {
  id: string;
  title: string;
  parentId: string | null;
  dependencyIds: string[];
  logs: StudyLog[];
  videoSeconds: number;
  jsonSeconds: number;
}

interface StudyState {
  topics: StudyTopic[];
  selectedTopicId: string | null;
  expanded: Record<string, boolean>;
  updatedAt: string | null;
  projectKey: string | null;
  supabaseStatus: "idle" | "loading" | "synced" | "signed-out" | "missing-env" | "error";
  syncError: string | null;
  initRemoteSync: (projectKey: string | null) => Promise<void>;
  saveRemote: () => Promise<void>;
  addTopic: (parentId: string | null, title: string) => void;
  renameTopic: (id: string, title: string) => void;
  deleteTopic: (id: string) => void;
  selectTopic: (id: string | null) => void;
  toggleTopic: (id: string) => void;
  moveTopic: (id: string, parentId: string | null) => void;
  addDependency: (topicId: string, dependencyId: string) => void;
  removeDependency: (topicId: string, dependencyId: string) => void;
  logStudy: (topicId: string, minutes: number) => void;
  addVideoSeconds: (topicId: string, seconds: number) => void;
  addJsonSeconds: (topicId: string, seconds: number) => void;
}

export const DEPENDENCY_FRESH_DAYS = 4;
const STUDY_SCHEMA_VERSION = 1;

interface RemoteStudyConfig {
  schemaVersion?: number;
  updatedAt?: string | null;
  topics?: StudyTopic[];
  selectedTopicId?: string | null;
  expanded?: Record<string, boolean>;
}

export const useStudyStore = create<StudyState>()(
  persist(
    (set, get) => {
      let saveTimer: ReturnType<typeof setTimeout> | null = null;

      const queueSave = () => {
        if (typeof window === "undefined") return;
        const projectKey = get().projectKey;
        if (!projectKey) return;
        if (saveTimer) clearTimeout(saveTimer);
        saveTimer = setTimeout(() => void get().saveRemote(), 900);
      };

      const commit = (producer: (state: StudyState) => Partial<StudyState>, shouldSave = true) => {
        set((state) => ({
          ...producer(state),
          updatedAt: new Date().toISOString(),
        }));
        if (shouldSave) queueSave();
      };

      return {
        topics: [],
        selectedTopicId: null,
        expanded: {},
        updatedAt: null,
        projectKey: null,
        supabaseStatus: "idle",
        syncError: null,

      initRemoteSync: async (projectKey) => {
        set({ projectKey, syncError: null });
        if (!projectKey) {
          set({ supabaseStatus: "idle" });
          return;
        }

        set({ supabaseStatus: "loading" });
        try {
          const response = await fetch(
            `/api/nodenest/revision-config?projectKey=${encodeURIComponent(projectKey)}`,
            { cache: "no-store" }
          );
          const data = (await response.json()) as {
            config?: { study?: RemoteStudyConfig } | null;
            skipped?: boolean;
            reason?: string;
            error?: string;
          };

          if (response.status === 401 || data.reason === "signed-out") {
            set({ supabaseStatus: "signed-out" });
            return;
          }
          if (data.skipped && data.reason === "missing-supabase-env") {
            set({ supabaseStatus: "missing-env" });
            return;
          }
          if (!response.ok) {
            throw new Error(data.error || "Study sync failed");
          }

          const remote = parseRemoteStudy(data.config?.study);
          const state = get();
          const remoteTime = Date.parse(remote?.updatedAt ?? "");
          const localTime = Date.parse(state.updatedAt ?? "");
          const shouldUseRemote =
            remote &&
            (state.topics.length === 0 ||
              (Number.isFinite(remoteTime) && (!Number.isFinite(localTime) || remoteTime > localTime)));

          if (shouldUseRemote) {
            set({
              topics: remote.topics,
              selectedTopicId: remote.selectedTopicId,
              expanded: remote.expanded,
              updatedAt: remote.updatedAt,
              supabaseStatus: "synced",
              syncError: null,
            });
            return;
          }

          if (state.topics.length > 0) {
            await get().saveRemote();
          } else {
            set({ supabaseStatus: "synced" });
          }
        } catch (error) {
          set({
            supabaseStatus: "error",
            syncError: error instanceof Error ? error.message : String(error),
          });
        }
      },

      saveRemote: async () => {
        const state = get();
        if (!state.projectKey) return;
        try {
          const response = await fetch("/api/nodenest/revision-config", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              projectKey: state.projectKey,
              projectName: state.projectKey,
              config: {
                study: toRemoteStudy(state),
              },
            }),
          });
          const data = (await response.json()) as {
            skipped?: boolean;
            reason?: string;
            error?: string;
          };
          if (response.status === 401 || data.reason === "signed-out") {
            set({ supabaseStatus: "signed-out" });
          } else if (data.skipped && data.reason === "missing-supabase-env") {
            set({ supabaseStatus: "missing-env" });
          } else if (!response.ok) {
            throw new Error(data.error || "Study sync failed");
          } else {
            set({ supabaseStatus: "synced", syncError: null });
          }
        } catch (error) {
          set({
            supabaseStatus: "error",
            syncError: error instanceof Error ? error.message : String(error),
          });
        }
      },

      addTopic: (parentId, title) => {
        const clean = title.trim();
        if (!clean) return;
        const id = `topic-${crypto.randomUUID()}`;
        commit((state) => ({
          topics: [
            ...state.topics,
            {
              id,
              title: clean,
              parentId,
              dependencyIds: [],
              logs: [],
              videoSeconds: 0,
              jsonSeconds: 0,
            },
          ],
          selectedTopicId: id,
          expanded: parentId ? { ...state.expanded, [parentId]: true } : state.expanded,
        }));
      },

      renameTopic: (id, title) => {
        const clean = title.trim();
        if (!clean) return;
        commit((state) => ({
          topics: state.topics.map((topic) =>
            topic.id === id ? { ...topic, title: clean } : topic
          ),
        }));
      },

      deleteTopic: (id) => {
        const state = get();
        const removeIds = collectTopicIds(state.topics, id);
        commit((state) => ({
          topics: state.topics
            .filter((topic) => !removeIds.has(topic.id))
            .map((topic) => ({
              ...topic,
              dependencyIds: topic.dependencyIds.filter((depId) => !removeIds.has(depId)),
            })),
          selectedTopicId: removeIds.has(state.selectedTopicId ?? "")
            ? null
            : state.selectedTopicId,
        }));
      },

      selectTopic: (id) => set({ selectedTopicId: id }),
      toggleTopic: (id) =>
        commit((state) => ({ expanded: { ...state.expanded, [id]: !state.expanded[id] } })),

      moveTopic: (id, parentId) => {
        const state = get();
        if (id === parentId) return;
        const ownTree = collectTopicIds(state.topics, id);
        if (parentId && ownTree.has(parentId)) return;
        commit((state) => ({
          topics: state.topics.map((topic) =>
            topic.id === id ? { ...topic, parentId } : topic
          ),
          expanded: parentId ? { ...state.expanded, [parentId]: true } : state.expanded,
        }));
      },

      addDependency: (topicId, dependencyId) => {
        if (topicId === dependencyId) return;
        const state = get();
        const topicTree = collectTopicIds(state.topics, topicId);
        if (topicTree.has(dependencyId)) return;
        commit((state) => ({
          topics: state.topics.map((topic) =>
            topic.id === topicId && !topic.dependencyIds.includes(dependencyId)
              ? { ...topic, dependencyIds: [...topic.dependencyIds, dependencyId] }
              : topic
          ),
        }));
      },

      removeDependency: (topicId, dependencyId) =>
        commit((state) => ({
          topics: state.topics.map((topic) =>
            topic.id === topicId
              ? {
                  ...topic,
                  dependencyIds: topic.dependencyIds.filter((id) => id !== dependencyId),
                }
              : topic
          ),
        })),

      logStudy: (topicId, minutes) => {
        const cleanMinutes = Math.max(1, Math.round(minutes));
        if (!Number.isFinite(cleanMinutes)) return;
        commit((state) => ({
          topics: state.topics.map((topic) =>
            topic.id === topicId
              ? {
                  ...topic,
                  logs: [
                    ...topic.logs,
                    {
                      id: `log-${crypto.randomUUID()}`,
                      minutes: cleanMinutes,
                      studiedAt: new Date().toISOString(),
                    },
                  ],
                }
              : topic
          ),
        }));
      },

      addVideoSeconds: (topicId, seconds) => {
        const cleanSeconds = safeSeconds(seconds);
        if (cleanSeconds <= 0) return;
        commit((state) => ({
          topics: state.topics.map((topic) =>
            topic.id === topicId
              ? { ...topic, videoSeconds: safeSeconds(topic.videoSeconds) + cleanSeconds }
              : topic
          ),
        }));
      },

      addJsonSeconds: (topicId, seconds) => {
        const cleanSeconds = safeSeconds(seconds);
        if (cleanSeconds <= 0) return;
        commit((state) => ({
          topics: state.topics.map((topic) =>
            topic.id === topicId
              ? { ...topic, jsonSeconds: safeSeconds(topic.jsonSeconds) + cleanSeconds }
              : topic
          ),
        }));
      },
      };
    },
    {
      name: "notenest-study-tracker-v1",
      partialize: (state) => ({
        topics: state.topics,
        selectedTopicId: state.selectedTopicId,
        expanded: state.expanded,
        updatedAt: state.updatedAt,
      }),
      merge: (persisted, current) => {
        const value = persisted as Partial<StudyState> | undefined;
        return {
          ...current,
          ...value,
          topics: normalizeTopics(value?.topics ?? current.topics),
          expanded: value?.expanded ?? current.expanded,
          updatedAt: value?.updatedAt ?? current.updatedAt,
        };
      },
    }
  )
);

export function manualStudyMinutes(topic: StudyTopic) {
  return topic.logs.reduce((sum, log) => sum + safeMinutes(log.minutes), 0);
}

export function videoStudyMinutes(topic: StudyTopic) {
  return secondsToMinutes(topic.videoSeconds);
}

export function jsonStudyMinutes(topic: StudyTopic) {
  return secondsToMinutes(topic.jsonSeconds);
}

export function totalStudyMinutes(topic: StudyTopic) {
  return secondsToMinutes(totalStudySeconds(topic));
}

export function totalStudySeconds(topic: StudyTopic) {
  return manualStudyMinutes(topic) * 60 + safeSeconds(topic.videoSeconds) + safeSeconds(topic.jsonSeconds);
}

export function lastStudiedAt(topic: StudyTopic) {
  return topic.logs.reduce<string | null>((latest, log) => {
    if (!latest) return log.studiedAt;
    return Date.parse(log.studiedAt) > Date.parse(latest) ? log.studiedAt : latest;
  }, null);
}

export function dependencyBlockers(topic: StudyTopic, topics: StudyTopic[]) {
  const byId = new Map(topics.map((item) => [item.id, item]));
  const cutoff = Date.now() - DEPENDENCY_FRESH_DAYS * 24 * 60 * 60 * 1000;

  return topic.dependencyIds
    .map((id) => byId.get(id))
    .filter((item): item is StudyTopic => Boolean(item))
    .filter((item) => {
      const last = lastStudiedAt(item);
      return !last || Date.parse(last) < cutoff;
    });
}

export function collectTopicIds(topics: StudyTopic[], rootId: string) {
  const ids = new Set<string>([rootId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const topic of topics) {
      if (topic.parentId && ids.has(topic.parentId) && !ids.has(topic.id)) {
        ids.add(topic.id);
        changed = true;
      }
    }
  }
  return ids;
}

function normalizeTopics(topics: StudyTopic[]) {
  return topics.map((topic) => ({
    id: topic.id,
    title: topic.title || "Untitled topic",
    parentId: topic.parentId ?? null,
    dependencyIds: Array.from(new Set(topic.dependencyIds ?? [])).filter(Boolean),
    videoSeconds: safeSeconds(topic.videoSeconds),
    jsonSeconds: safeSeconds(topic.jsonSeconds),
    logs: (topic.logs ?? []).map((log) => ({
      id: log.id || `log-${crypto.randomUUID()}`,
      minutes: safeMinutes(log.minutes),
      studiedAt: log.studiedAt || new Date().toISOString(),
    })),
  }));
}

function safeMinutes(value: number) {
  const minutes = Number(value);
  if (!Number.isFinite(minutes)) return 0;
  return Math.max(0, Math.round(minutes));
}

function safeSeconds(value: number | undefined) {
  const seconds = Number(value ?? 0);
  if (!Number.isFinite(seconds)) return 0;
  return Math.max(0, Math.round(seconds));
}

function secondsToMinutes(seconds: number) {
  return Math.round(safeSeconds(seconds) / 60);
}

function parseRemoteStudy(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const candidate = value as RemoteStudyConfig;
  return {
    updatedAt: candidate.updatedAt ?? null,
    topics: normalizeTopics(candidate.topics ?? []),
    selectedTopicId: candidate.selectedTopicId ?? null,
    expanded: candidate.expanded ?? {},
  };
}

function toRemoteStudy(state: StudyState): RemoteStudyConfig {
  return {
    schemaVersion: STUDY_SCHEMA_VERSION,
    updatedAt: state.updatedAt ?? new Date().toISOString(),
    topics: normalizeTopics(state.topics),
    selectedTopicId: state.selectedTopicId,
    expanded: state.expanded,
  };
}
