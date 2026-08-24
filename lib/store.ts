"use client";

import { nanoid } from "nanoid";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { StoredGraphNode } from "./local-fs";

export type NodeContentType = "text" | "video-local" | "video-url";

export interface GraphNode {
  id: string;
  title: string;
  contentType: NodeContentType;
  text?: string;
  /** Plain-text preview shown inside the graph node (e.g. dragged-in selection). */
  rawText?: string;
  videoUrl?: string;
  videoFileName?: string;
  videoDataUrl?: string;
  videoLocalPath?: string;
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
  hydrateFromFile: (s: { editorHTML: string; nodes: StoredGraphNode[] }) => void;
  hydrateFromDrive: (s: { editorHTML: string; nodes: GraphNode[] }) => void;
  resetNotes: () => void;
}

const DUO_COLORS = ["#58CC02", "#1CB0F6", "#FFC800", "#CE82FF", "#FF4B4B"];

const DEFAULT_EDITOR_HTML =
  '<pre><code class="language-json">{\n  "note": "Start with JSON here"\n}</code></pre>';

const DEFAULT_NODES: GraphNode[] = [
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
];

function getDefaultNotesState() {
  return {
    editorHTML: DEFAULT_EDITOR_HTML,
    nodes: DEFAULT_NODES.map((node) => ({
      ...node,
      position: { ...node.position },
    })),
    selectedNodeId: null,
    hoveredLinkNodeId: null,
    focusSignal: null,
  };
}

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

    wrapper.querySelectorAll(`[data-node-id="${safeId}"]`).forEach((el) => {
      while (el.firstChild) {
        el.parentNode?.insertBefore(el.firstChild, el);
      }

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
      ...getDefaultNotesState(),

      setEditorHTML: (html) => set({ editorHTML: html }),

      addNode: (partial) => {
        const id = partial?.id ?? nanoid(8);
        const node: GraphNode = {
          id,
          title: partial?.title ?? "Untitled node",
          contentType: partial?.contentType ?? "text",
          text: partial?.text,
          rawText: partial?.rawText,
          videoUrl: partial?.videoUrl,
          videoFileName: partial?.videoFileName,
          videoDataUrl: partial?.videoDataUrl,
          videoLocalPath: partial?.videoLocalPath,
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
          nodes: get().nodes.map((node) =>
            node.id === id ? { ...node, ...patch } : node
          ),
        }),

      deleteNode: (id) => {
        const state = get();
        const cleanedMain = stripNodeLinkMark(state.editorHTML, id);
        const cleanedNodes = state.nodes
          .filter((node) => node.id !== id)
          .map((node) =>
            node.text
              ? { ...node, text: stripNodeLinkMark(node.text, id) }
              : node
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
          nodes: get().nodes.map((node) =>
            node.id === id ? { ...node, position } : node
          ),
        }),

      selectNode: (id) => {
        if (get().selectedNodeId === id) return;
        set({ selectedNodeId: id });
      },
      getNode: (id) => get().nodes.find((node) => node.id === id),

      setHoveredLinkNode: (id) => {
        if (get().hoveredLinkNodeId === id) return;
        set({ hoveredLinkNodeId: id });
      },

      focusNodeInGraph: (id) => {
        set({
          focusSignal: { id, nonce: (get().focusSignal?.nonce ?? 0) + 1 },
        });
      },

      hydrateFromFile: ({ editorHTML, nodes }) => {
        set({
          editorHTML,
          nodes: normalizeGraphNodes(nodes),
          selectedNodeId: null,
          hoveredLinkNodeId: null,
          focusSignal: null,
        });
      },

      hydrateFromDrive: ({ editorHTML, nodes }) => {
        set({
          editorHTML,
          nodes: normalizeGraphNodes(nodes),
          selectedNodeId: null,
          hoveredLinkNodeId: null,
          focusSignal: null,
        });
      },

      resetNotes: () => {
        set(getDefaultNotesState());
      },
    }),
    {
      name: "notenest-v1",
      partialize: (state) => ({
        editorHTML: state.editorHTML,
        nodes: state.nodes,
      }),
    }
  )
);

function normalizeGraphNodes(nodes: Array<Partial<GraphNode> | StoredGraphNode>): GraphNode[] {
  return nodes.map((node) => ({
    id: node.id ?? nanoid(8),
    title: node.title ?? "Untitled node",
    contentType:
      node.contentType === "video-local" || node.contentType === "video-url"
        ? node.contentType
        : "text",
    text: node.text,
    rawText: node.rawText,
    videoUrl: node.videoUrl,
    videoFileName: node.videoFileName,
    videoDataUrl: node.videoDataUrl,
    videoLocalPath: node.videoLocalPath,
    position: {
      x:
        typeof node.position?.x === "number" && Number.isFinite(node.position.x)
          ? node.position.x
          : 120,
      y:
        typeof node.position?.y === "number" && Number.isFinite(node.position.y)
          ? node.position.y
          : 80,
    },
    color: node.color ?? DUO_COLORS[0],
  }));
}

export function clearLocalNotes() {
  useNotesStore.persist.clearStorage();
  useNotesStore.getState().resetNotes();
}
