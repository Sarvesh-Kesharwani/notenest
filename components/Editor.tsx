"use client";

import { useCallback, useEffect, useState } from "react";
import type { Editor as TiptapEditor } from "@tiptap/react";
import { Link2Off, Unplug } from "lucide-react";
import { NodeLinkMark } from "@/lib/node-link-mark";
import { useNotesStore } from "@/lib/store";
import { useLinkDrag } from "./LinkDragProvider";
import RichEditor from "./RichEditor";

export default function Editor() {
  const editorHTML = useNotesStore((s) => s.editorHTML);
  const setEditorHTML = useNotesStore((s) => s.setEditorHTML);
  const setHoveredLinkNode = useNotesStore((s) => s.setHoveredLinkNode);
  const focusNodeInGraph = useNotesStore((s) => s.focusNodeInGraph);

  const [editor, setEditor] = useState<TiptapEditor | null>(null);
  const linkDrag = useLinkDrag();

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

  const startDragFromSocket = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      if (!editor) return;
      const { from, to } = editor.state.selection;
      if (from === to) return;
      e.preventDefault();
      e.stopPropagation();

      const selectionText = editor.state.doc.textBetween(from, to, " ");
      const rect = e.currentTarget.getBoundingClientRect();
      const origin = {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      };

      linkDrag.start(origin, {
        selectionText,
        applyLink: (nodeId: string) => {
          editor
            .chain()
            .focus()
            .setTextSelection({ from, to })
            .setMark("nodeLink", { nodeId })
            .run();
        },
      });
    },
    [editor, linkDrag]
  );

  const unlinkNode = useCallback(() => {
    if (!editor) return;
    editor
      .chain()
      .focus()
      .extendMarkRange("nodeLink")
      .unsetMark("nodeLink")
      .run();
  }, [editor]);

  const hasSelection = editor
    ? editor.state.selection.from !== editor.state.selection.to
    : false;
  const isLinked = editor?.isActive("nodeLink") ?? false;

  return (
    <RichEditor
      value={editorHTML}
      onChange={setEditorHTML}
      placeholder="Write your page… select any text and drag the cord to a node →"
      extraExtensions={[NodeLinkMark as never]}
      variant="page"
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
        ) : (
          <button
            onPointerDown={startDragFromSocket}
            disabled={!hasSelection}
            title={
              hasSelection
                ? "Drag onto a node to link"
                : "Select some text first"
            }
            className="flex items-center gap-1.5 rounded-2xl bg-duo-green px-4 py-2 text-xs font-extrabold uppercase text-white shadow-duoGreen active:translate-y-[1px] active:shadow-none disabled:opacity-40 disabled:cursor-not-allowed touch-none"
          >
            <Unplug size={14} /> Drag to node
          </button>
        )
      }
      bubbleRightSlot={(ed) =>
        ed.isActive("nodeLink") ? (
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
        ) : (
          <button
            onPointerDown={(e) => {
              const { from, to } = ed.state.selection;
              if (from === to) return;
              e.preventDefault();
              e.stopPropagation();
              const selectionText = ed.state.doc.textBetween(from, to, " ");
              const rect = (
                e.currentTarget as HTMLElement
              ).getBoundingClientRect();
              linkDrag.start(
                {
                  x: rect.left + rect.width / 2,
                  y: rect.top + rect.height / 2,
                },
                {
                  selectionText,
                  applyLink: (nodeId: string) => {
                    ed
                      .chain()
                      .focus()
                      .setTextSelection({ from, to })
                      .setMark("nodeLink", { nodeId })
                      .run();
                  },
                }
              );
            }}
            title="Drag onto a node to link"
            className="ml-1 flex items-center gap-1 rounded-lg bg-duo-green px-2 py-1 text-[10px] font-extrabold uppercase text-white shadow-duoGreen active:translate-y-[1px] active:shadow-none touch-none"
          >
            <Unplug size={12} /> Drag
          </button>
        )
      }
    />
  );
}
