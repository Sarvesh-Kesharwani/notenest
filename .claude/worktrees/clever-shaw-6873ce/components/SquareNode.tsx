"use client";

import { Handle, type Node, type NodeProps, Position } from "@xyflow/react";
import { FileText, Film, Link as LinkIcon } from "lucide-react";
import type { GraphNode } from "@/lib/store";

export type SquareNodeData = Pick<
  GraphNode,
  "title" | "contentType" | "color"
> & {
  hovered?: boolean;
  pulsing?: boolean;
};

export type SquareNodeType = Node<SquareNodeData, "square">;

export default function SquareNode({
  data,
  selected,
}: NodeProps<SquareNodeType>) {
  const d = data;
  const Icon =
    d.contentType === "text"
      ? FileText
      : d.contentType === "video-local"
      ? Film
      : LinkIcon;

  const highlighted = !!d.hovered || !!d.pulsing;

  return (
    <div
      className={`relative flex h-32 w-32 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 p-2 text-center transition-transform ${
        selected
          ? "scale-105 border-duo-green shadow-duoGreen"
          : highlighted
          ? "scale-110 border-duo-green shadow-duoGreen"
          : "border-duo-border bg-white shadow-duo hover:scale-[1.03]"
      } ${d.pulsing ? "node-pulse" : ""}`}
      style={{
        background: selected || highlighted ? "#F2FBE6" : "white",
      }}
    >
      <div
        className="mb-1 flex h-10 w-10 items-center justify-center rounded-xl text-white"
        style={{ background: d.color }}
      >
        <Icon size={18} />
      </div>
      <div className="line-clamp-2 text-xs font-extrabold leading-tight text-duo-ink">
        {d.title}
      </div>
      <div className="mt-1 text-[9px] font-bold uppercase tracking-wider text-gray-400">
        {d.contentType.replace("-", " ")}
      </div>

      <Handle
        type="target"
        position={Position.Top}
        style={{ opacity: 0, pointerEvents: "none" }}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        style={{ opacity: 0, pointerEvents: "none" }}
      />
    </div>
  );
}
