"use client";

import {
  ChevronDown,
  ChevronRight,
  File as FileIcon,
  FolderClosed,
  FolderOpen,
  FolderPlus,
  FilePlus,
  Trash2,
  HardDriveDownload,
  BookOpen,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useFilesStore } from "@/lib/files-store";
import type { FsEntry, NoteFileContent } from "@/lib/local-fs";
import { useNotesStore } from "@/lib/store";
import { useStudyStore } from "@/lib/study-store";

interface Props {
  onOpenFile: (content: NoteFileContent, path: string) => void;
}

export default function FileExplorer({ onOpenFile }: Props) {
  const supported = useFilesStore((s) => s.supported);
  const root = useFilesStore((s) => s.root);
  const tree = useFilesStore((s) => s.tree);
  const openedPath = useFilesStore((s) => s.openedPath);
  const loading = useFilesStore((s) => s.loading);
  const error = useFilesStore((s) => s.error);

  const init = useFilesStore((s) => s.init);
  const chooseRoot = useFilesStore((s) => s.chooseRoot);
  const openFile = useFilesStore((s) => s.openFile);
  const newFile = useFilesStore((s) => s.newFile);
  const newFolder = useFilesStore((s) => s.newFolder);
  const syncStudyTopicsToFiles = useFilesStore((s) => s.syncStudyTopicsToFiles);
  const removeEntry = useFilesStore((s) => s.removeEntry);
  const topics = useStudyStore((s) => s.topics);

  useEffect(() => {
    void init();
  }, [init]);

  if (!supported) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <HardDriveDownload size={32} className="text-duo-yellow" />
        <div className="text-sm font-extrabold text-duo-ink">
          Browser not supported
        </div>
        <p className="text-xs text-gray-500">
          Use Chrome, Edge, or another Chromium browser to enable local folder
          storage.
        </p>
      </div>
    );
  }

  if (!root) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <FolderOpen size={36} className="text-duo-green" />
        <div className="text-sm font-extrabold text-duo-ink">
          Pick a folder for your notes
        </div>
        <p className="text-xs text-gray-500">
          Notes will be saved as <code>.md</code> files. Subfolders allowed.
        </p>
        <button
          onClick={() => void chooseRoot()}
          className="rounded-2xl bg-duo-green px-4 py-2 text-xs font-extrabold uppercase text-white shadow-duoGreen active:translate-y-[1px] active:shadow-none"
        >
          Choose folder
        </button>
        {error && (
          <div className="text-[11px] font-bold text-duo-red">{error}</div>
        )}
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-2 border-b-2 border-duo-border px-3 py-2">
        <div className="min-w-0">
          <div className="truncate text-xs font-extrabold uppercase tracking-wide text-duo-ink">
            Sark JSON
          </div>
          <div className="truncate text-[10px] font-bold uppercase tracking-wide text-gray-400">
            {topics.length} study topics
          </div>
        </div>
        <button
          disabled={topics.length === 0 || loading}
          onClick={() => void syncStudyTopicsToFiles(topics)}
          title="Create folder hierarchy from Study topics"
          className="inline-flex h-7 shrink-0 items-center gap-1 rounded-lg border-2 border-duo-border bg-white px-2 text-[10px] font-extrabold uppercase text-duo-ink hover:bg-duo-soft disabled:cursor-not-allowed disabled:opacity-40"
        >
          <BookOpen size={12} />
          Sync topics
        </button>
      </div>
      <div className="flex-1 overflow-auto py-2 text-sm">
        {tree.length === 0 && !loading && (
          <div className="px-4 py-6 text-center text-xs text-gray-400">
            Empty folder. Create your first <strong>.md</strong> note.
          </div>
        )}
        {tree.map((e) => (
          <TreeRow
            key={e.path}
            entry={e}
            depth={0}
            openedPath={openedPath}
            onOpenFile={async (path) => {
              const content = await openFile(path);
              if (content != null) onOpenFile(content, path);
            }}
            onNewFile={async (dir) => {
              const name = window.prompt("File name (.md)");
              if (!name) return;
              const p = await newFile(dir, name);
              if (p) {
                const content = await openFile(p);
                if (content != null) onOpenFile(content, p);
              }
            }}
            onNewFolder={async (dir) => {
              const name = window.prompt("Folder name");
              if (!name) return;
              await newFolder(dir, name);
            }}
            onDelete={async (path, isDir) => {
              if (!window.confirm(`Delete ${path}?`)) return;
              await removeEntry(path, isDir);
            }}
          />
        ))}
      </div>
      {error && (
        <div className="border-t-2 border-duo-border bg-duo-red/10 px-3 py-1 text-[11px] font-bold text-duo-red">
          {error}
        </div>
      )}
    </div>
  );
}

function TreeRow({
  entry,
  depth,
  openedPath,
  onOpenFile,
  onNewFile,
  onNewFolder,
  onDelete,
}: {
  entry: FsEntry;
  depth: number;
  openedPath: string | null;
  onOpenFile: (path: string) => void | Promise<void>;
  onNewFile: (dir: string) => void | Promise<void>;
  onNewFolder: (dir: string) => void | Promise<void>;
  onDelete: (path: string, isDir: boolean) => void | Promise<void>;
}) {
  const expandedMap = useFilesStore((s) => s.expanded);
  const toggle = useFilesStore((s) => s.toggleExpand);
  const expanded = !!expandedMap[entry.path];
  const isFile = entry.kind === "file";
  const isOpen = isFile && openedPath === entry.path;
  const [hover, setHover] = useState(false);

  return (
    <div>
      <div
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        className={`group flex items-center gap-1 px-2 py-1 text-xs font-bold ${
          isOpen
            ? "bg-duo-green/15 text-duo-greenDark"
            : "text-duo-ink hover:bg-duo-soft"
        }`}
        style={{ paddingLeft: 8 + depth * 14 }}
      >
        <button
          className="flex flex-1 items-center gap-1 truncate text-left"
          onClick={() => {
            if (isFile) void onOpenFile(entry.path);
            else toggle(entry.path);
          }}
          title={entry.path}
        >
          {isFile ? (
            <>
              <span className="w-3" />
              <FileIcon size={13} className="shrink-0 text-gray-500" />
            </>
          ) : expanded ? (
            <>
              <ChevronDown size={12} className="shrink-0 text-gray-500" />
              <FolderOpen size={13} className="shrink-0 text-duo-yellow" />
            </>
          ) : (
            <>
              <ChevronRight size={12} className="shrink-0 text-gray-500" />
              <FolderClosed size={13} className="shrink-0 text-duo-yellow" />
            </>
          )}
          <span className="truncate">{entry.name}</span>
        </button>
        {hover && (
          <div className="flex items-center gap-0.5">
            {!isFile && (
              <>
                <button
                  title="New file"
                  className="rounded p-0.5 text-gray-500 hover:bg-white hover:text-duo-ink"
                  onClick={(e) => {
                    e.stopPropagation();
                    void onNewFile(entry.path);
                  }}
                >
                  <FilePlus size={11} />
                </button>
                <button
                  title="New folder"
                  className="rounded p-0.5 text-gray-500 hover:bg-white hover:text-duo-ink"
                  onClick={(e) => {
                    e.stopPropagation();
                    void onNewFolder(entry.path);
                  }}
                >
                  <FolderPlus size={11} />
                </button>
              </>
            )}
            <button
              title="Delete"
              className="rounded p-0.5 text-gray-500 hover:bg-white hover:text-duo-red"
              onClick={(e) => {
                e.stopPropagation();
                void onDelete(entry.path, !isFile);
              }}
            >
              <Trash2 size={11} />
            </button>
          </div>
        )}
      </div>
      {!isFile && expanded && entry.children && (
        <div>
          {entry.children.map((c) => (
            <TreeRow
              key={c.path}
              entry={c}
              depth={depth + 1}
              openedPath={openedPath}
              onOpenFile={onOpenFile}
              onNewFile={onNewFile}
              onNewFolder={onNewFolder}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// Convenience: import this elsewhere to wire opened HTML into the global editor store.
export function applyOpenedHtmlToStore(html: string) {
  useNotesStore.getState().setEditorHTML(html);
}
