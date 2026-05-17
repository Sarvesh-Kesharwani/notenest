"use client";

// FileSystem Access API wrapper for offline .md storage.
// Persists the root directory handle in IndexedDB so reload re-uses it.

export type FsEntry = {
  kind: "file" | "dir";
  name: string;
  path: string; // posix-style relative path from root
  children?: FsEntry[];
};

const DB_NAME = "notenest-fs";
const STORE = "handles";
const ROOT_KEY = "root";

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet<T>(key: string): Promise<T | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const r = tx.objectStore(STORE).get(key);
    r.onsuccess = () => resolve((r.result as T) ?? null);
    r.onerror = () => reject(r.error);
  });
}

async function idbSet(key: string, value: unknown): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbDel(key: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export function isFsAccessSupported(): boolean {
  return typeof window !== "undefined" && "showDirectoryPicker" in window;
}

export async function pickRoot(): Promise<FileSystemDirectoryHandle | null> {
  if (!isFsAccessSupported()) return null;
  // @ts-expect-error - showDirectoryPicker isn't fully typed across TS lib versions
  const handle: FileSystemDirectoryHandle = await window.showDirectoryPicker({
    id: "notenest-root",
    mode: "readwrite",
    startIn: "documents",
  });
  await idbSet(ROOT_KEY, handle);
  return handle;
}

export async function loadSavedRoot(): Promise<FileSystemDirectoryHandle | null> {
  const handle = await idbGet<FileSystemDirectoryHandle>(ROOT_KEY);
  if (!handle) return null;
  try {
    // Re-check permission. Browsers require a gesture to re-prompt — caller decides.
    // @ts-expect-error permission API not in default TS lib
    const perm = await handle.queryPermission({ mode: "readwrite" });
    if (perm === "granted") return handle;
    return handle; // returned but caller must call ensurePermission()
  } catch {
    return handle;
  }
}

export async function ensurePermission(
  handle: FileSystemDirectoryHandle
): Promise<boolean> {
  try {
    // @ts-expect-error
    const cur = await handle.queryPermission({ mode: "readwrite" });
    if (cur === "granted") return true;
    // @ts-expect-error
    const next = await handle.requestPermission({ mode: "readwrite" });
    return next === "granted";
  } catch {
    return false;
  }
}

export async function clearSavedRoot() {
  await idbDel(ROOT_KEY);
}

export async function listTree(
  root: FileSystemDirectoryHandle,
  prefix = ""
): Promise<FsEntry[]> {
  const entries: FsEntry[] = [];
  // @ts-expect-error - .entries() returns an async iterable in supporting browsers
  for await (const [name, handle] of root.entries()) {
    const path = prefix ? `${prefix}/${name}` : name;
    if (handle.kind === "directory") {
      entries.push({
        kind: "dir",
        name,
        path,
        children: await listTree(handle as FileSystemDirectoryHandle, path),
      });
    } else if (name.toLowerCase().endsWith(".md")) {
      entries.push({ kind: "file", name, path });
    }
  }
  entries.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "dir" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return entries;
}

async function resolveDir(
  root: FileSystemDirectoryHandle,
  segments: string[],
  create: boolean
): Promise<FileSystemDirectoryHandle> {
  let cur = root;
  for (const seg of segments) {
    cur = await cur.getDirectoryHandle(seg, { create });
  }
  return cur;
}

function splitPath(path: string): { dirs: string[]; file: string } {
  const parts = path.split("/").filter(Boolean);
  const file = parts.pop() ?? "";
  return { dirs: parts, file };
}

export async function readFile(
  root: FileSystemDirectoryHandle,
  path: string
): Promise<string> {
  const { dirs, file } = splitPath(path);
  const dir = await resolveDir(root, dirs, false);
  const fh = await dir.getFileHandle(file, { create: false });
  const f = await fh.getFile();
  return await f.text();
}

export async function writeFile(
  root: FileSystemDirectoryHandle,
  path: string,
  content: string
): Promise<void> {
  const { dirs, file } = splitPath(path);
  const dir = await resolveDir(root, dirs, true);
  const fh = await dir.getFileHandle(file, { create: true });
  const w: FileSystemWritableFileStream = await fh.createWritable();
  await w.write(content);
  await w.close();
}

export async function createFolder(
  root: FileSystemDirectoryHandle,
  path: string
): Promise<void> {
  const parts = path.split("/").filter(Boolean);
  await resolveDir(root, parts, true);
}

export async function createFile(
  root: FileSystemDirectoryHandle,
  path: string,
  content = ""
): Promise<void> {
  if (!path.toLowerCase().endsWith(".md")) path += ".md";
  await writeFile(root, path, content);
}

export async function deletePath(
  root: FileSystemDirectoryHandle,
  path: string,
  isDir: boolean
): Promise<void> {
  const { dirs, file } = splitPath(path);
  const parent = await resolveDir(root, dirs, false);
  await parent.removeEntry(file, { recursive: isDir });
}

// ===== minimal HTML <-> .md round-trip =====
// We store the editor HTML inside the .md file with a fence so it round-trips
// losslessly. Tools that render .md will still see the HTML as raw markup.
const HTML_FENCE_OPEN = "<!--notenest:html-->";
const HTML_FENCE_CLOSE = "<!--/notenest:html-->";

export function wrapHtmlAsMd(html: string): string {
  return `${HTML_FENCE_OPEN}\n${html}\n${HTML_FENCE_CLOSE}\n`;
}

export function unwrapMdToHtml(md: string): string {
  const o = md.indexOf(HTML_FENCE_OPEN);
  const c = md.lastIndexOf(HTML_FENCE_CLOSE);
  if (o !== -1 && c !== -1 && c > o) {
    return md.slice(o + HTML_FENCE_OPEN.length, c).trim();
  }
  // plain markdown: render as escaped paragraphs
  const escaped = md
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return `<p>${escaped.replace(/\n{2,}/g, "</p><p>").replace(/\n/g, "<br/>")}</p>`;
}
