"use client";

import { useCallback, useEffect, useState } from "react";
import type { Editor as TiptapEditor } from "@tiptap/react";
import { Braces, Link2Off, Plus } from "lucide-react";
import { NodeLinkMark } from "@/lib/node-link-mark";
import { useFilesStore } from "@/lib/files-store";
import { useNotesStore } from "@/lib/store";
import { tryFormatJson } from "@/lib/json-highlight";
import RichEditor from "./RichEditor";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export default function Editor() {
  const editorHTML = useNotesStore((s) => s.editorHTML);
  const setEditorHTML = useNotesStore((s) => s.setEditorHTML);
  const setHoveredLinkNode = useNotesStore((s) => s.setHoveredLinkNode);
  const focusNodeInGraph = useNotesStore((s) => s.focusNodeInGraph);
  const addNode = useNotesStore((s) => s.addNode);
  const selectNode = useNotesStore((s) => s.selectNode);

  const [editor, setEditor] = useState<TiptapEditor | null>(null);

  const addSelectionAsNode = useCallback(
    (ed: TiptapEditor) => {
      const { from, to } = ed.state.selection;
      if (from === to) return;
      const raw = ed.state.doc.textBetween(from, to, "\n");
      if (!raw.trim()) return;

      const pretty = tryFormatJson(raw);
      const stored = pretty ?? raw;

      const titleLine =
        (pretty
          ? pretty.split(/\n/).find((l) => l.trim()) ?? ""
          : raw.split(/\n/)[0] ?? "")
          .trim()
          .replace(/[{}[\],]/g, " ")
          .replace(/\s+/g, " ")
          .slice(0, 60) || (pretty ? "JSON snippet" : "Snippet");

      const n = addNode({
        title: titleLine,
        rawText: stored,
        text: `<pre><code class="language-json">${escapeHtml(stored)}</code></pre>`,
        contentType: "text",
      });
      selectNode(n.id);
      focusNodeInGraph(n.id);
    },
    [addNode, selectNode, focusNodeInGraph]
  );

  useEffect(() => {
    if (!editor) return;
    const root = editor.view.dom;
    const findPill = (t: EventTarget | null) =>
      (t instanceof HTMLElement ? t.closest?.("[data-node-id]") : null) as
        | HTMLElement
        | null;

    const onOver = (e: Event) => {
      const el = findPill(e.target);
      if (!el) return;
      const id = el.getAttribute("data-node-id");
      if (id) setHoveredLinkNode(id);
    };
    const onOut = (e: Event) => {
      const el = findPill(e.target);
      if (!el) return;
      const related = (e as MouseEvent).relatedTarget as Node | null;
      if (related && el.contains(related)) return;
      setHoveredLinkNode(null);
    };
    root.addEventListener("mouseover", onOver);
    root.addEventListener("mouseout", onOut);
    return () => {
      root.removeEventListener("mouseover", onOver);
      root.removeEventListener("mouseout", onOut);
    };
  }, [editor, setHoveredLinkNode]);

  const unlinkNode = useCallback(() => {
    if (!editor) return;
    editor
      .chain()
      .focus()
      .extendMarkRange("nodeLink")
      .unsetMark("nodeLink")
      .run();
  }, [editor]);

  const isLinked = editor?.isActive("nodeLink") ?? false;
  const openedPath = useFilesStore((s) => s.openedPath);

  return (
    <RichEditor
      value={editorHTML}
      onChange={setEditorHTML}
      placeholder="Write your page… select any text and drag the cord to a node →"
      extraExtensions={[NodeLinkMark as never]}
      variant="page"
      jsonBlocksOnly
      scrollKey={openedPath ?? "scratch"}
      onEditorReady={setEditor}
      editorProps={{
        handleClickOn(_view, pos, _node, _nPos, event) {
          const target = event.target as HTMLElement;
          const linkEl = target.closest?.(
            "[data-node-id]"
          ) as HTMLElement | null;
          if (linkEl && editor) {
            const id = linkEl.getAttribute("data-node-id");
            if (id) {
              focusNodeInGraph(id);
              // Select the whole mark range so bubble menu shows Unlink
              setTimeout(() => {
                editor
                  .chain()
                  .focus()
                  .setTextSelection(pos)
                  .extendMarkRange("nodeLink")
                  .run();
              }, 0);
              return true;
            }
          }
          return false;
        },
      }}
      rightToolbarSlot={
        isLinked ? (
          <button
            onClick={unlinkNode}
            className="flex items-center gap-1.5 rounded-2xl border-2 border-duo-red/40 bg-duo-red/10 px-3 py-1.5 text-xs font-extrabold uppercase text-duo-red"
          >
            <Link2Off size={14} /> Unlink
          </button>
        ) : null
      }
      bubbleRightSlot={(ed) => {
        if (ed.isActive("nodeLink")) {
          return (
            <button
              onClick={() =>
                ed
                  .chain()
                  .focus()
                  .extendMarkRange("nodeLink")
                  .unsetMark("nodeLink")
                  .run()
              }
              className="ml-1 flex items-center gap-1 rounded-lg bg-duo-red/10 px-2 py-1 text-[10px] font-extrabold uppercase text-duo-red hover:bg-duo-red/20"
            >
              <Link2Off size={12} /> Unlink
            </button>
          );
        }

        const { from, to } = ed.state.selection;
        if (from === to) return null;
        const raw = ed.state.doc.textBetween(from, to, "\n");
        if (!raw.trim()) return null;
        const isJson = tryFormatJson(raw) !== null;

        return (
          <button
            onClick={() => addSelectionAsNode(ed)}
            title={
              isJson
                ? "Add as JSON node (color-coded)"
                : "Add selection as node"
            }
            className={`ml-1 flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-extrabold uppercase text-white shadow-duoGreen ${
              isJson ? "bg-duo-blue" : "bg-duo-green"
            }`}
          >
            {isJson ? <Braces size={12} /> : <Plus size={12} />}
            {isJson ? "JSON node" : "Add node"}
          </button>
        );
      }}
    />
  );
}
