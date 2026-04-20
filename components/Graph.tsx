"use client";

import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useNodesState,
  useReactFlow,
  type Node as RFNode,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNotesStore } from "@/lib/store";
import SquareNode from "./SquareNode";
import { Plus, Sparkles, Unplug } from "lucide-react";
import {
  LINK_DRAG_DROP_EVENT,
  useLinkDrag,
  type LinkDragDropDetail,
} from "./LinkDragProvider";

const nodeTypes = { square: SquareNode };

function toRFNode(
  n: ReturnType<typeof useNotesStore.getState>["nodes"][number],
  extras: { hovered?: boolean; pulsing?: boolean } = {}
): RFNode {
  return {
    id: n.id,
    type: "square",
    position: n.position,
    data: {
      title: n.title,
      contentType: n.contentType,
      color: n.color,
      hovered: !!extras.hovered,
      pulsing: !!extras.pulsing,
    },
  };
}

function GraphInner() {
  const storeNodes = useNotesStore((s) => s.nodes);
  const addNode = useNotesStore((s) => s.addNode);
  const selectNode = useNotesStore((s) => s.selectNode);
  const selectedId = useNotesStore((s) => s.selectedNodeId);
  const setPos = useNotesStore((s) => s.setNodePosition);
  const hoveredId = useNotesStore((s) => s.hoveredLinkNodeId);
  const focusSignal = useNotesStore((s) => s.focusSignal);

  const [rfNodes, setRfNodes, onNodesChange] = useNodesState<RFNode>(
    storeNodes.map((n) => toRFNode(n))
  );

  const lastSyncedRef = useRef<string>("");
  const [pulsingId, setPulsingId] = useState<string | null>(null);

  useEffect(() => {
    const sig = storeNodes
      .map(
        (n) =>
          `${n.id}:${n.position.x},${n.position.y}:${n.title}:${n.color}:${n.contentType}`
      )
      .join("|");
    if (sig === lastSyncedRef.current) return;
    lastSyncedRef.current = sig;

    setRfNodes((current) => {
      const currentById = new Map(current.map((n) => [n.id, n]));
      return storeNodes.map((sn) => {
        const existing = currentById.get(sn.id);
        return {
          ...toRFNode(sn),
          position: existing ? existing.position : sn.position,
        };
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeNodes]);

  useEffect(() => {
    setRfNodes((cur) =>
      cur.map((n) =>
        n.selected === (n.id === selectedId)
          ? n
          : { ...n, selected: n.id === selectedId }
      )
    );
  }, [selectedId, setRfNodes]);

  useEffect(() => {
    setRfNodes((cur) =>
      cur.map((n) => {
        const prev = n.data as { hovered?: boolean; pulsing?: boolean };
        const hovered = n.id === hoveredId;
        const pulsing = n.id === pulsingId;
        if (prev.hovered === hovered && prev.pulsing === pulsing) return n;
        return { ...n, data: { ...prev, hovered, pulsing } };
      })
    );
  }, [hoveredId, pulsingId, setRfNodes]);

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

  // ===== Link-drag drop handling =====
  const linkDrag = useLinkDrag();
  const graphRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDrop = (ev: Event) => {
      const { clientX, clientY, payload } = (
        ev as CustomEvent<LinkDragDropDetail>
      ).detail;

      const el = document.elementFromPoint(clientX, clientY);
      if (!el) return;

      // 1. Dropped on an existing node?
      const nodeEl = el.closest<HTMLElement>(".react-flow__node");
      if (nodeEl) {
        const id = nodeEl.getAttribute("data-id");
        if (id) {
          payload.applyLink(id);
          selectNode(id);
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
        const flowPos = rf.screenToFlowPosition({ x: clientX, y: clientY });
        // Center the 128x128 node on the drop point
        const pos = { x: flowPos.x - 64, y: flowPos.y - 64 };
        const n = addNode({
          title:
            payload.selectionText.trim().slice(0, 60) || "Untitled node",
          position: pos,
          contentType: "text",
        });
        payload.applyLink(n.id);
        selectNode(n.id);
      }
    };

    window.addEventListener(LINK_DRAG_DROP_EVENT, onDrop);
    return () => window.removeEventListener(LINK_DRAG_DROP_EVENT, onDrop);
  }, [rf, addNode, selectNode]);

  const isDragging = linkDrag.active !== null;

  return (
    <div
      ref={graphRef}
      className={`relative h-full w-full bg-[#fafafa] transition-all ${
        isDragging ? "ring-4 ring-inset ring-duo-green/40" : ""
      }`}
    >
      <div className="absolute left-4 top-4 z-10 flex items-center gap-2">
        <button
          onClick={() => {
            const n = addNode({ title: "New note" });
            selectNode(n.id);
          }}
          className="flex items-center gap-2 rounded-2xl bg-duo-green px-4 py-2 text-sm font-extrabold uppercase text-white shadow-duoGreen active:translate-y-[2px] active:shadow-none"
        >
          <Plus size={16} /> New node
        </button>
        <div className="flex items-center gap-1.5 rounded-2xl border-2 border-duo-border bg-white px-3 py-1.5 text-xs font-bold text-gray-500">
          <Sparkles size={14} className="text-duo-yellow" />
          Click a node to open · drag text here to link
        </div>
      </div>

      {isDragging && (
        <div className="pointer-events-none absolute inset-x-0 top-16 z-10 flex items-center justify-center">
          <div className="flex items-center gap-2 rounded-2xl border-2 border-duo-green bg-white px-4 py-2 text-xs font-extrabold uppercase tracking-wide text-duo-greenDark shadow-duo">
            <Unplug size={14} /> Drop on a node to link · drop on empty space
            to create a new one
          </div>
        </div>
      )}

      <ReactFlow
        nodes={rfNodes}
        edges={[]}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onNodeDragStop={handleNodeDragStop}
        onNodeClick={(_e, n) => selectNode(n.id)}
        onPaneClick={() => selectNode(null)}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        proOptions={{ hideAttribution: true }}
        panOnScroll
        zoomOnScroll={false}
        snapToGrid={false}
        nodesDraggable={!isDragging}
        selectNodesOnDrag={false}
      >
        <Background gap={24} size={1.5} color="#e5e5e5" />
        <Controls
          showInteractive={false}
          className="!rounded-2xl !border-2 !border-duo-border !bg-white !shadow-duo"
        />
        <MiniMap
          pannable
          zoomable
          nodeColor={(n) => (n.data as { color?: string })?.color ?? "#58CC02"}
          style={{
            background: "white",
            border: "2px solid #E5E5E5",
            borderRadius: 16,
          }}
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
