"use client";

import {
  Background,
  Controls,
  ReactFlow,
  ReactFlowProvider,
  useNodesState,
  useReactFlow,
  type Edge as RFEdge,
  type Node as RFNode,
  type OnSelectionChangeParams,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
} from "react";
import { useNotesStore } from "@/lib/store";
import SquareNode from "./SquareNode";
import { Sparkles, Trash2, Unplug, X } from "lucide-react";
import {
  LINK_DRAG_DROP_EVENT,
  useLinkDrag,
  type LinkDragDropDetail,
} from "./LinkDragProvider";

const nodeTypes = { square: SquareNode };
const emptyEdges: RFEdge[] = [];
const fitViewOptions = { padding: 0.8, maxZoom: 0.75 };
const proOptions = { hideAttribution: true };

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function plainTextToHtml(raw: string): string | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;

  return trimmed
    .split(/\n{2,}/)
    .map((paragraph) => {
      const lineHtml = paragraph
        .split(/\n/)
        .map((line) => escapeHtml(line))
        .join("<br>");
      return `<p>${lineHtml || "<br>"}</p>`;
    })
    .join("");
}

function sameIds(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function toRFNode(
  n: ReturnType<typeof useNotesStore.getState>["nodes"][number],
  extras: {
    editing?: boolean;
    hovered?: boolean;
    pulsing?: boolean;
    stopEditing?: (id: string) => void;
  } = {}
): RFNode {
  return {
    id: n.id,
    type: "square",
    position: n.position,
    data: {
      title: n.title,
      contentType: n.contentType,
      color: n.color,
      rawText: n.rawText,
      text: n.text,
      videoUrl: n.videoUrl,
      videoFileName: n.videoFileName,
      videoLocalPath: n.videoLocalPath,
      editing: !!extras.editing,
      hovered: !!extras.hovered,
      pulsing: !!extras.pulsing,
      stopEditing: extras.stopEditing,
    },
  };
}

function GraphInner() {
  const storeNodes = useNotesStore((s) => s.nodes);
  const addNode = useNotesStore((s) => s.addNode);
  const selectNode = useNotesStore((s) => s.selectNode);
  const selectedId = useNotesStore((s) => s.selectedNodeId);
  const setPos = useNotesStore((s) => s.setNodePosition);
  const deleteNode = useNotesStore((s) => s.deleteNode);
  const hoveredId = useNotesStore((s) => s.hoveredLinkNodeId);
  const focusSignal = useNotesStore((s) => s.focusSignal);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const selectedIdsRef = useRef<string[]>([]);
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [boxSelectMode, setBoxSelectMode] = useState(false);
  // Locks a multi-selection so a stray node click doesn't shrink it.
  // Only pane-click, the explicit X button, batch-delete, or Esc clears it.
  const lockedGroupRef = useRef<Set<string> | null>(null);
  const allowClearRef = useRef(false);

  const [rfNodes, setRfNodes, onNodesChange] = useNodesState<RFNode>(
    storeNodes.map((n) => toRFNode(n))
  );

  const lastSyncedRef = useRef<string>("");
  const [pulsingId, setPulsingId] = useState<string | null>(null);
  const stopEditing = useCallback(
    (id: string) => {
      setEditingNodeId((current) => (current === id ? null : current));
    },
    []
  );

  useEffect(() => {
    selectedIdsRef.current = selectedIds;
  }, [selectedIds]);

  useEffect(() => {
    const sig = storeNodes
      .map(
        (n) =>
          `${n.id}:${n.position.x},${n.position.y}:${n.title}:${n.color}:${n.contentType}:${n.rawText ?? ""}:${n.text ?? ""}:${n.videoUrl ?? ""}:${n.videoFileName ?? ""}:${n.videoLocalPath ?? ""}`
      )
      .join("|");
    if (sig === lastSyncedRef.current) return;
    lastSyncedRef.current = sig;

    setRfNodes((current) => {
      const currentById = new Map(current.map((n) => [n.id, n]));
      return storeNodes.map((sn) => {
        const existing = currentById.get(sn.id);
        return {
          ...toRFNode(sn, {
            editing: sn.id === editingNodeId,
            stopEditing,
          }),
          position: existing ? existing.position : sn.position,
        };
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeNodes, editingNodeId, stopEditing]);

  useEffect(() => {
    setRfNodes((cur) =>
      cur.map((n) => {
        const prev = n.data as {
          editing?: boolean;
          hovered?: boolean;
          pulsing?: boolean;
          stopEditing?: (id: string) => void;
        };
        const editing = n.id === editingNodeId;
        const hovered = n.id === hoveredId;
        const pulsing = n.id === pulsingId;
        if (
          prev.editing === editing &&
          prev.hovered === hovered &&
          prev.pulsing === pulsing &&
          prev.stopEditing === stopEditing
        ) {
          return n;
        }
        return {
          ...n,
          data: { ...prev, editing, hovered, pulsing, stopEditing },
        };
      })
    );
  }, [editingNodeId, hoveredId, pulsingId, setRfNodes, stopEditing]);

  const rf = useReactFlow();

  useEffect(() => {
    if (!focusSignal) return;
    const node = useNotesStore
      .getState()
      .nodes.find((n) => n.id === focusSignal.id);
    if (!node) return;
    const cx = node.position.x + 64;
    const cy = node.position.y + 64;
    rf.setCenter(cx, cy, { zoom: 1.25, duration: 600 });
    setPulsingId(focusSignal.id);
    const t = setTimeout(
      () => setPulsingId((p) => (p === focusSignal.id ? null : p)),
      1600
    );
    return () => clearTimeout(t);
  }, [focusSignal, rf]);

  const handleNodeDragStop = useCallback(
    (_e: unknown, node: RFNode) => {
      setPos(node.id, node.position);
    },
    [setPos]
  );

  // Batch move: when a group of selected nodes is dragged together
  const handleSelectionDragStop = useCallback(
    (_e: unknown, nodes: RFNode[]) => {
      for (const n of nodes) setPos(n.id, n.position);
    },
    [setPos]
  );

  // Selection change -> mirror to local state for batch actions only.
  // Node details stay inline in graph cards; graph selection must not open
  // the node modal.
  //
  // Sticky group: once >1 nodes are selected, the group is "locked". Stray
  // node clicks won't shrink it â€” only the explicit clear paths (pane click,
  // X button, batch delete, Esc) flip allowClearRef.
  const handleSelectionChange = useCallback(
    ({ nodes }: OnSelectionChangeParams) => {
      const ids = nodes.map((n) => n.id);
      const locked = lockedGroupRef.current;

      if (locked && !allowClearRef.current && ids.length < locked.size) {
        // Re-assert the locked group; React Flow tried to shrink it.
        setRfNodes((cur) => {
          let changed = false;
          const next = cur.map((n) => {
            const shouldBeSelected = locked.has(n.id);
            if (n.selected === shouldBeSelected) return n;
            changed = true;
            return { ...n, selected: shouldBeSelected };
          });
          return changed ? next : cur;
        });
        return;
      }

      // Update or release the lock
      if (ids.length > 1) {
        lockedGroupRef.current = new Set(ids);
      } else {
        lockedGroupRef.current = null;
      }
      allowClearRef.current = false;

      if (!sameIds(selectedIdsRef.current, ids)) {
        selectedIdsRef.current = ids;
        setSelectedIds(ids);
      }

      if (selectedId !== null) selectNode(null);
    },
    [selectNode, selectedId, setRfNodes]
  );

  // Batch delete from React Flow (Backspace/Delete)
  const handleNodesDelete = useCallback(
    (deleted: RFNode[]) => {
      allowClearRef.current = true;
      lockedGroupRef.current = null;
      for (const n of deleted) deleteNode(n.id);
      setSelectedIds([]);
    },
    [deleteNode]
  );

  const deleteSelected = useCallback(() => {
    if (selectedIds.length === 0) return;
    if (selectedIds.length > 1 && !window.confirm(`Delete ${selectedIds.length} nodes?`)) return;
    allowClearRef.current = true;
    lockedGroupRef.current = null;
    for (const id of selectedIds) deleteNode(id);
    setSelectedIds([]);
  }, [deleteNode, selectedIds]);

  const clearSelection = useCallback(() => {
    allowClearRef.current = true;
    lockedGroupRef.current = null;
    setRfNodes((cur) => cur.map((n) => (n.selected ? { ...n, selected: false } : n)));
    setSelectedIds([]);
    selectNode(null);
  }, [selectNode, setRfNodes]);

  // Escape clears the locked group.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && lockedGroupRef.current) {
        clearSelection();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [clearSelection]);

  const multiKeyCodes = useMemo(
    () => ["Shift", "Meta", "Control"],
    []
  );
  const deleteKeyCodes = useMemo(() => ["Backspace", "Delete"], []);

  // ===== Link-drag drop handling =====
  const linkDrag = useLinkDrag();
  const graphRef = useRef<HTMLDivElement>(null);

  const createTextNodeAt = useCallback(
    (clientX: number, clientY: number, rawInput: string) => {
      const raw = rawInput.trim();
      if (!raw) return null;

      const flowPos = rf.screenToFlowPosition({ x: clientX, y: clientY });
      const pos = { x: flowPos.x - 140, y: flowPos.y - 60 };
      const titleLine = raw.split(/\n/)[0]?.trim() ?? "";

      return addNode({
        title: titleLine.slice(0, 60) || "Untitled node",
        rawText: raw,
        text: plainTextToHtml(raw),
        position: pos,
        contentType: "text",
      });
    },
    [addNode, rf]
  );

  const createEmptyJsonNodeAt = useCallback(
    (clientX: number, clientY: number) => {
      const flowPos = rf.screenToFlowPosition({ x: clientX, y: clientY });
      const node = addNode({
        title: "JSON node",
        rawText: "",
        text: undefined,
        position: { x: flowPos.x - 192, y: flowPos.y - 90 },
        contentType: "text",
      });

      allowClearRef.current = true;
      lockedGroupRef.current = null;
      setSelectedIds([]);
      selectNode(null);
      setEditingNodeId(node.id);
      return node;
    },
    [addNode, rf, selectNode]
  );

  useEffect(() => {
    const onDrop = (ev: Event) => {
      const detail = (ev as CustomEvent<LinkDragDropDetail>).detail;
      if (!detail?.payload) return;

      const { clientX, clientY, payload } = detail;

      const el = document.elementFromPoint(clientX, clientY);
      if (!el) return;

      // 1. Dropped on an existing node?
      const nodeEl = el.closest<HTMLElement>(".react-flow__node");
      if (nodeEl) {
        const id = nodeEl.getAttribute("data-id");
        if (id) {
          try {
            payload.applyLink(id);
          } catch (err) {
            console.warn("[nodeLink] drop apply failed", err);
          }
          if (selectedId !== null) selectNode(null);
          return;
        }
      }

      // 2. Dropped elsewhere inside the graph pane?
      const graphEl = graphRef.current;
      if (!graphEl) return;
      const bounds = graphEl.getBoundingClientRect();
      const insideGraph =
        clientX >= bounds.left &&
        clientX <= bounds.right &&
        clientY >= bounds.top &&
        clientY <= bounds.bottom;

      if (insideGraph) {
        const n = createTextNodeAt(clientX, clientY, payload.selectionText ?? "");
        if (!n) return;
        try {
          payload.applyLink(n.id);
        } catch (err) {
          console.warn("[nodeLink] create apply failed", err);
        }
      }
    };

    window.addEventListener(LINK_DRAG_DROP_EVENT, onDrop);
    return () => window.removeEventListener(LINK_DRAG_DROP_EVENT, onDrop);
  }, [createTextNodeAt, selectNode, selectedId]);

  const handleNativeDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    if (e.dataTransfer.types.includes("text/plain")) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    }
  }, []);

  const handleNativeDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      const raw = e.dataTransfer.getData("text/plain");
      if (!raw.trim()) return;

      e.preventDefault();
      e.stopPropagation();

      const n = createTextNodeAt(e.clientX, e.clientY, raw);
      if (n && selectedId !== null) selectNode(null);
    },
    [createTextNodeAt, selectNode, selectedId]
  );

  const isDragging = linkDrag.active !== null;

  return (
    <div
      ref={graphRef}
      onDragOver={handleNativeDragOver}
      onDrop={handleNativeDrop}
      onDoubleClick={(event) => {
        const target = event.target as HTMLElement | null;
        if (
          target?.closest(".react-flow__node") ||
          target?.closest(".react-flow__controls")
        ) {
          return;
        }
        createEmptyJsonNodeAt(event.clientX, event.clientY);
      }}
      className={`relative h-full w-full bg-[#fafafa] transition-all ${
        isDragging ? "ring-4 ring-inset ring-duo-green/40" : ""
      }`}
    >
      <div className="absolute left-4 top-4 z-10 flex items-center gap-2">
        {selectedIds.length === 0 ? (
          <div className="flex items-center gap-1.5 rounded-2xl border-2 border-duo-border bg-white px-3 py-1.5 text-xs font-bold text-gray-500">
            <Sparkles size={14} className="text-duo-yellow" />
            Shift+click / Shift+drag to multi-select
          </div>
        ) : (
          <div className="flex items-center gap-2 rounded-2xl border-2 border-duo-blue bg-white px-2 py-1 text-xs font-extrabold text-duo-ink shadow-duoBlue">
            <span className="rounded-lg bg-duo-blue px-2 py-0.5 text-[10px] font-extrabold uppercase text-white">
              {selectedIds.length} selected
            </span>
            <button
              onClick={deleteSelected}
              title="Delete selected (Del/Backspace)"
              className="flex items-center gap-1 rounded-lg bg-duo-red px-2 py-1 text-[11px] font-extrabold uppercase text-white hover:bg-red-600"
            >
              <Trash2 size={12} /> Delete
            </button>
            <button
              onClick={clearSelection}
              title="Clear selection (Esc)"
              className="flex items-center gap-1 rounded-lg border-2 border-duo-border px-1.5 py-0.5 text-gray-500 hover:bg-duo-soft"
            >
              <X size={12} />
            </button>
          </div>
        )}
      </div>

      {isDragging && (
        <div className="pointer-events-none absolute inset-x-0 top-16 z-10 flex items-center justify-center">
          <div className="flex items-center gap-2 rounded-2xl border-2 border-duo-green bg-white px-4 py-2 text-xs font-extrabold uppercase tracking-wide text-duo-greenDark shadow-duo">
            <Unplug size={14} /> Drop on a node to link Â· drop on empty space
            to create a new one
          </div>
        </div>
      )}

      <ReactFlow
        nodes={rfNodes}
        edges={emptyEdges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onNodeDragStop={handleNodeDragStop}
        onSelectionDragStop={handleSelectionDragStop}
        onSelectionChange={handleSelectionChange}
        onNodesDelete={handleNodesDelete}
        onNodeClick={(e) => {
          if (e.shiftKey || e.metaKey || e.ctrlKey) return; // let RF handle multi-select
          // Sticky group: clicking a node while a group is selected does not
          // shrink the selection.
          if (lockedGroupRef.current) return;
        }}
        onNodeDoubleClick={(_event, node) => {
          selectNode(null);
          setEditingNodeId(node.id);
        }}
        onPaneClick={() => {
          allowClearRef.current = true;
          lockedGroupRef.current = null;
          selectNode(null);
          setSelectedIds([]);
          setEditingNodeId(null);
        }}
        fitView
        fitViewOptions={fitViewOptions}
        minZoom={0.2}
        proOptions={proOptions}
        panOnScroll
        zoomOnScroll={false}
        snapToGrid={false}
        nodesDraggable={!isDragging && editingNodeId === null}
        selectNodesOnDrag={false}
        multiSelectionKeyCode={multiKeyCodes}
        deleteKeyCode={deleteKeyCodes}
        selectionOnDrag={boxSelectMode}
        panOnDrag={boxSelectMode ? [1, 2] : true}
      >
        <Background gap={24} size={1.5} color="#e5e5e5" />
        <Controls
          showInteractive={false}
          className="!rounded-2xl !border-2 !border-duo-border !bg-white !shadow-duo"
        />
      </ReactFlow>
    </div>
  );
}

export default function Graph() {
  return (
    <ReactFlowProvider>
      <GraphInner />
    </ReactFlowProvider>
  );
}
