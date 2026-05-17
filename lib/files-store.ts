"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  createFile,
  createFolder,
  deletePath,
  ensurePermission,
  isFsAccessSupported,
  listTree,
  loadSavedRoot,
  pickRoot,
  readFile,
  unwrapMdToHtml,
  wrapHtmlAsMd,
  writeFile,
  type FsEntry,
} from "./local-fs";

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
  openFile: (path: string) => Promise<string | null>;
  saveCurrentHtml: (html: string) => Promise<void>;
  newFile: (parentDir: string, name: string) => Promise<string | null>;
  newFolder: (parentDir: string, name: string) => Promise<void>;
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
      const html = unwrapMdToHtml(md);
      set({ openedPath: path });
      return html;
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) });
      return null;
    }
  },

  saveCurrentHtml: async (html) => {
    const { root, openedPath } = get();
    if (!root || !openedPath) return;
    try {
      await writeFile(root, openedPath, wrapHtmlAsMd(html));
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
