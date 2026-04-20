"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { nanoid } from "nanoid";

export type NodeContentType = "text" | "video-local" | "video-url";

export interface GraphNode {
  id: string;
  title: string;
  contentType: NodeContentType;
  text?: string;
  videoUrl?: string;
  videoFileName?: string;
  videoDataUrl?: string;
  position: { x: number; y: number };
  color: string;
}

interface FocusSignal {
  id: string;
  nonce: number;
}

interface NotesState {
  editorHTML: string;
  nodes: GraphNode[];
  selectedNodeId: string | null;
  hoveredLinkNodeId: string | null;
  focusSignal: FocusSignal | null;
  setEditorHTML: (html: string) => void;
  addNode: (partial?: Partial<GraphNode>) => GraphNode;
  updateNode: (id: string, patch: Partial<GraphNode>) => void;
  deleteNode: (id: string) => void;
  setNodePosition: (id: string, pos: { x: number; y: number }) => void;
  selectNode: (id: string | null) => void;
  getNode: (id: string) => GraphNode | undefined;
  setHoveredLinkNode: (id: string | null) => void;
  focusNodeInGraph: (id: string) => void;
  hydrateFromDrive: (s: { editorHTML: string; nodes: GraphNode[] }) => void;
}

const DUO_COLORS = ["#58CC02", "#1CB0F6", "#FFC800", "#CE82FF", "#FF4B4B"];

function stripNodeLinkMark(html: string, nodeId: string): string {
  if (typeof window === "undefined") return html;
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(`<div>${html}</div>`, "text/html");
    const wrapper = doc.body.firstElementChild as HTMLElement | null;
    if (!wrapper) return html;
    const safeId =
      typeof CSS !== "undefined" && CSS.escape
        ? CSS.escape(nodeId)
        : nodeId.replace(/"/g, '\\"');
    wrapper
      .querySelectorAll(`[data-node-id="${safeId}"]`)
      .forEach((el) => {
        while (el.firstChild) el.parentNode?.insertBefore(el.firstChild, el);
        el.remove();
      });
    return wrapper.innerHTML;
  } catch {
    return html;
  }
}

export const useNotesStore = create<NotesState>()(
  persist(
    (set, get) => ({
      editorHTML: `<h1>Welcome to NoteNest ✨</h1><p>Select any text, then drag the green <strong>Drag to node</strong> button onto a node to link it.</p><p>Hover a green pill to see its connection. Click it to jump to that node in the graph.</p>`,
      nodes: [
        {
          id: "seed-1",
          title: "Idea: Duolingo UX",
          contentType: "text",
          text: "<h2>Why it works</h2><p>Bright, playful, friendly. Big rounded buttons. Satisfying micro-interactions.</p><ul><li>Motion feels rewarding</li><li>Bold typography carries personality</li><li>Friendly color palette</li></ul><blockquote>Design that makes you smile.</blockquote>",
          position: { x: 80, y: 80 },
          color: "#58CC02",
        },
        {
          id: "seed-2",
          title: "Reference Video",
          contentType: "video-url",
          videoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
          position: { x: 340, y: 200 },
          color: "#1CB0F6",
        },
      ],
      selectedNodeId: null,
      hoveredLinkNodeId: null,
      focusSignal: null,

      setEditorHTML: (html) => set({ editorHTML: html }),

      addNode: (partial) => {
        const id = partial?.id ?? nanoid(8);
        const node: GraphNode = {
          id,
          title: partial?.title ?? "Untitled node",
          contentType: partial?.contentType ?? "text",
          text: partial?.text,
          videoUrl: partial?.videoUrl,
          videoFileName: partial?.videoFileName,
          videoDataUrl: partial?.videoDataUrl,
          position: partial?.position ?? {
            x: 120 + Math.random() * 300,
            y: 80 + Math.random() * 300,
          },
          color:
            partial?.color ??
            DUO_COLORS[Math.floor(Math.random() * DUO_COLORS.length)],
        };
        set({ nodes: [...get().nodes, node] });
        return node;
      },

      updateNode: (id, patch) =>
        set({
          nodes: get().nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)),
        }),

      deleteNode: (id) => {
        const state = get();
        const cleanedMain = stripNodeLinkMark(state.editorHTML, id);
        const cleanedNodes = state.nodes
          .filter((n) => n.id !== id)
          .map((n) =>
            n.text ? { ...n, text: stripNodeLinkMark(n.text, id) } : n
          );
        set({
          nodes: cleanedNodes,
          editorHTML: cleanedMain,
          selectedNodeId:
            state.selectedNodeId === id ? null : state.selectedNodeId,
          hoveredLinkNodeId:
            state.hoveredLinkNodeId === id ? null : state.hoveredLinkNodeId,
        });
      },

      setNodePosition: (id, position) =>
        set({
          nodes: get().nodes.map((n) =>
            n.id === id ? { ...n, position } : n
          ),
        }),

      selectNode: (id) => set({ selectedNodeId: id }),
      getNode: (id) => get().nodes.find((n) => n.id === id),

      setHoveredLinkNode: (id) => {
        if (get().hoveredLinkNodeId === id) return;
        set({ hoveredLinkNodeId: id });
      },

      focusNodeInGraph: (id) => {
        set({
          focusSignal: { id, nonce: (get().focusSignal?.nonce ?? 0) + 1 },
        });
      },

      hydrateFromDrive: ({ editorHTML, nodes }) => {
        set({
          editorHTML,
          nodes,
          selectedNodeId: null,
          hoveredLinkNodeId: null,
        });
      },
    }),
    {
      name: "notenest-v1",
      partialize: (s) => ({ editorHTML: s.editorHTML, nodes: s.nodes }),
    }
  )
);
