"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  createFile,
  createFolder,
  deletePath,
  ensurePermission,
  fileExists,
  isFsAccessSupported,
  listTree,
  loadSavedRoot,
  pickRoot,
  readFile,
  unwrapMdToContent,
  wrapHtmlAsMd,
  writeFile,
  type FsEntry,
  type NoteFileContent,
  type StoredGraphNode,
} from "./local-fs";
import type { StudyTopic } from "./study-store";

interface FilesState {
  supported: boolean;
  root: FileSystemDirectoryHandle | null;
  rootName: string | null;
  tree: FsEntry[];
  expanded: Record<string, boolean>;
  openedPath: string | null;
  loading: boolean;
  error: string | null;

  init: () => Promise<void>;
  chooseRoot: () => Promise<void>;
  refresh: () => Promise<void>;
  toggleExpand: (path: string) => void;
  openFile: (path: string) => Promise<NoteFileContent | null>;
  saveCurrentHtml: (html: string, nodes?: StoredGraphNode[]) => Promise<void>;
  newFile: (parentDir: string, name: string) => Promise<string | null>;
  newFolder: (parentDir: string, name: string) => Promise<void>;
  syncStudyTopicsToFiles: (topics: StudyTopic[]) => Promise<void>;
  removeEntry: (path: string, isDir: boolean) => Promise<void>;
  closeFile: () => void;
}

export const useFilesStore = create<FilesState>()(
  persist(
    (set, get) => ({
  supported: isFsAccessSupported(),
  root: null,
  rootName: null,
  tree: [],
  expanded: {},
  openedPath: null,
  loading: false,
  error: null,

  init: async () => {
    if (!get().supported) return;
    const handle = await loadSavedRoot();
    if (!handle) return;
    const ok = await ensurePermission(handle);
    if (!ok) {
      set({ root: handle, rootName: handle.name });
      return;
    }
    set({ root: handle, rootName: handle.name });
    await get().refresh();
  },

  chooseRoot: async () => {
    try {
      const handle = await pickRoot();
      if (!handle) return;
      set({ root: handle, rootName: handle.name, error: null });
      await get().refresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!/aborted/i.test(msg)) set({ error: msg });
    }
  },

  refresh: async () => {
    const root = get().root;
    if (!root) return;
    set({ loading: true });
    try {
      const tree = await listTree(root);
      set({ tree, loading: false });
    } catch (e) {
      set({
        loading: false,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  },

  toggleExpand: (path) =>
    set({ expanded: { ...get().expanded, [path]: !get().expanded[path] } }),

  openFile: async (path) => {
    const root = get().root;
    if (!root) return null;
    try {
      const md = await readFile(root, path);
      const content = unwrapMdToContent(md);
      set({ openedPath: path });
      return content;
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) });
      return null;
    }
  },

  saveCurrentHtml: async (html, nodes = []) => {
    const { root, openedPath } = get();
    if (!root || !openedPath) return;
    try {
      await writeFile(root, openedPath, wrapHtmlAsMd(html, nodes));
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) });
    }
  },

  newFile: async (parentDir, name) => {
    const root = get().root;
    if (!root) return null;
    const clean = name.trim();
    if (!clean) return null;
    const path = parentDir ? `${parentDir}/${clean}` : clean;
    await createFile(root, path);
    await get().refresh();
    const finalPath = path.toLowerCase().endsWith(".md") ? path : `${path}.md`;
    set({ expanded: { ...get().expanded, [parentDir]: true } });
    return finalPath;
  },

  newFolder: async (parentDir, name) => {
    const root = get().root;
    if (!root) return;
    const clean = name.trim();
    if (!clean) return;
    const path = parentDir ? `${parentDir}/${clean}` : clean;
    await createFolder(root, path);
    set({ expanded: { ...get().expanded, [parentDir]: true, [path]: true } });
    await get().refresh();
  },

  syncStudyTopicsToFiles: async (topics) => {
    const root = get().root;
    if (!root) return;
    set({ loading: true, error: null });

    try {
      const byParent = new Map<string | null, StudyTopic[]>();
      for (const topic of topics) {
        const siblings = byParent.get(topic.parentId) ?? [];
        siblings.push(topic);
        byParent.set(topic.parentId, siblings);
      }

      const expanded = { ...get().expanded };
      const walk = async (parentId: string | null, parentPath: string) => {
        const children = (byParent.get(parentId) ?? []).sort((a, b) =>
          a.title.localeCompare(b.title)
        );

        for (const topic of children) {
          const folderName = safePathSegment(topic.title);
          const folderPath = parentPath ? `${parentPath}/${folderName}` : folderName;
          await createFolder(root, folderPath);
          expanded[folderPath] = true;

          const notePath = `${folderPath}/${folderName}.md`;
          if (!(await fileExists(root, notePath))) {
            await createFile(root, notePath, defaultTopicNote(topic.title));
          }

          await walk(topic.id, folderPath);
        }
      };

      await walk(null, "");
      set({ expanded });
      await get().refresh();
    } catch (e) {
      set({
        loading: false,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  },

  removeEntry: async (path, isDir) => {
    const root = get().root;
    if (!root) return;
    await deletePath(root, path, isDir);
    if (get().openedPath === path) set({ openedPath: null });
    await get().refresh();
  },

      closeFile: () => set({ openedPath: null }),
    }),
    {
      name: "notenest-files-v1",
      // Only the user's last-opened path needs to survive a page reload.
      // Root handles live in IndexedDB; tree/expanded state is recomputed.
      partialize: (s) => ({ openedPath: s.openedPath, expanded: s.expanded }),
    }
  )
);

function safePathSegment(value: string) {
  return (
    value
      .trim()
      .replace(/[<>:"\\|?*\u0000-\u001f]/g, " ")
      .replace(/\s+/g, " ")
      .replace(/[. ]+$/g, "")
      .slice(0, 80) || "Untitled topic"
  );
}

function defaultTopicNote(title: string) {
  const json = JSON.stringify({ topic: title, notes: [] }, null, 2);
  return wrapHtmlAsMd(
    `<pre><code class="language-json">${escapeHtml(json)}</code></pre>`,
    []
  );
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
