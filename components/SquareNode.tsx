"use client";

import { Handle, type Node, type NodeProps, Position } from "@xyflow/react";
import { FileText, Film, Link as LinkIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useNotesStore, type GraphNode } from "@/lib/store";
import { JsonNodePreview, parseJsonPreview } from "@/lib/json-highlight";

export type SquareNodeData = Pick<
  GraphNode,
  | "title"
  | "contentType"
  | "color"
  | "rawText"
  | "text"
  | "videoUrl"
  | "videoFileName"
  | "videoLocalPath"
> & {
  editing?: boolean;
  hovered?: boolean;
  pulsing?: boolean;
  stopEditing?: (id: string) => void;
};

export type SquareNodeType = Node<SquareNodeData, "square">;

export default function SquareNode({
  id,
  data,
  selected,
}: NodeProps<SquareNodeType>) {
  const d = data;
  const updateNode = useNotesStore((s) => s.updateNode);
  const Icon =
    d.contentType === "text"
      ? FileText
      : d.contentType === "video-local"
      ? Film
      : LinkIcon;

  const highlighted = !!d.hovered || !!d.pulsing;
  const raw = getNodeDisplayText(d);
  const hasText = raw.length > 0;
  const [draft, setDraft] = useState(raw);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const json = useMemo(
    () => (hasText ? parseJsonPreview(raw) : null),
    [raw, hasText]
  );

  useEffect(() => {
    if (!d.editing) setDraft(raw);
  }, [d.editing, raw]);

  useEffect(() => {
    if (!d.editing) return;
    setDraft(raw);
    requestAnimationFrame(() => textareaRef.current?.focus());
  }, [d.editing, raw]);

  const commitDraft = () => {
    const trimmed = draft.trim();
    const parsed = parseJsonPreview(trimmed);
    const nextRaw = parsed?.formatted ?? draft;
    updateNode(id, {
      rawText: nextRaw,
      text: nextRaw.trim() ? plainTextToHtml(nextRaw) : undefined,
      contentType: "text",
    });
    d.stopEditing?.(id);
  };

  const handleEditorKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      setDraft(raw);
      d.stopEditing?.(id);
      return;
    }

    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      commitDraft();
    }
  };

  if (d.editing) {
    return (
      <div
        className={`relative flex w-96 cursor-default flex-col rounded-2xl border-2 border-duo-green bg-white shadow-duoGreen ${
          d.pulsing ? "node-pulse" : ""
        }`}
        onDoubleClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-duo-border px-2.5 py-1.5">
          <div
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-white"
            style={{ background: d.color }}
          >
            <Icon size={12} />
          </div>
          <div className="min-w-0 flex-1 truncate text-[11px] font-extrabold text-duo-ink">
            {d.title}
          </div>
          <span className="rounded-md bg-duo-blue/15 px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wider text-duo-blue">
            JSON
          </span>
        </div>
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commitDraft}
          onKeyDown={handleEditorKeyDown}
          onPointerDown={(event) => event.stopPropagation()}
          placeholder={'{\n  "key": "value"\n}'}
          className="nodrag nowheel min-h-40 resize-none rounded-b-2xl bg-[#f7f6f4] px-3 py-2 font-mono text-[11px] leading-tight text-duo-ink outline-none placeholder:text-gray-400"
          spellCheck={false}
        />

        <Handle type="target" position={Position.Top} style={{ opacity: 0, pointerEvents: "none" }} />
        <Handle type="source" position={Position.Bottom} style={{ opacity: 0, pointerEvents: "none" }} />
      </div>
    );
  }

  if (!hasText) {
    return (
      <div
        className={`relative flex h-32 w-32 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 p-2 text-center transition-transform ${
          selected
            ? "scale-105 border-duo-green shadow-duoGreen"
            : highlighted
            ? "scale-110 border-duo-green shadow-duoGreen"
            : "border-duo-border bg-white shadow-duo hover:scale-[1.03]"
        } ${d.pulsing ? "node-pulse" : ""}`}
        style={{ background: selected || highlighted ? "#F2FBE6" : "white" }}
      >
        <div
          className="mb-1 flex h-10 w-10 items-center justify-center rounded-xl text-white"
          style={{ background: d.color }}
        >
          <Icon size={18} />
        </div>
        <div className="break-words text-xs font-extrabold leading-tight text-duo-ink">
          {d.title}
        </div>
        <div className="mt-1 text-[9px] font-bold uppercase tracking-wider text-gray-400">
          {d.contentType.replace("-", " ")}
        </div>

        <Handle type="target" position={Position.Top} style={{ opacity: 0, pointerEvents: "none" }} />
        <Handle type="source" position={Position.Bottom} style={{ opacity: 0, pointerEvents: "none" }} />
      </div>
    );
  }

  // Larger node with the dragged-in text inside.
  return (
    <div
      className={`relative flex w-96 cursor-pointer flex-col rounded-2xl border-2 transition-transform ${
        selected
          ? "scale-[1.02] border-duo-green shadow-duoGreen"
          : highlighted
          ? "scale-[1.03] border-duo-green shadow-duoGreen"
          : "border-duo-border bg-white shadow-duo hover:scale-[1.01]"
      } ${d.pulsing ? "node-pulse" : ""}`}
      style={{ background: selected || highlighted ? "#F2FBE6" : "white" }}
    >
      <div className="flex items-center gap-2 border-b border-duo-border px-2.5 py-1.5">
        <div
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-white"
          style={{ background: d.color }}
        >
          <Icon size={12} />
        </div>
        <div className="min-w-0 flex-1 truncate text-[11px] font-extrabold text-duo-ink">
          {d.title}
        </div>
        {json && (
          <span className="rounded-md bg-duo-blue/15 px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wider text-duo-blue">
            JSON
          </span>
        )}
      </div>
      <div className="px-3 py-2">
        {json ? (
          <JsonNodePreview value={json.value} />
        ) : (
          <pre className="m-0 whitespace-pre-wrap break-words font-mono text-[11px] leading-tight text-duo-ink">
            {raw}
          </pre>
        )}
      </div>

      <Handle type="target" position={Position.Top} style={{ opacity: 0, pointerEvents: "none" }} />
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0, pointerEvents: "none" }} />
    </div>
  );
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

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function getNodeDisplayText(data: SquareNodeData): string {
  const raw = (data.rawText ?? "").trim();
  if (raw) return raw;

  if (data.contentType === "video-url") {
    return (data.videoUrl ?? "").trim();
  }

  if (data.contentType === "video-local") {
    return (data.videoFileName ?? data.videoLocalPath ?? "").trim();
  }

  return htmlToPlainText(data.text ?? "").trim();
}

function htmlToPlainText(html: string): string {
  if (!html) return "";
  const withBreaks = html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|blockquote|pre)>/gi, "\n");

  if (typeof document === "undefined") {
    return withBreaks.replace(/<[^>]*>/g, " ");
  }

  const template = document.createElement("template");
  template.innerHTML = withBreaks;
  return template.content.textContent ?? "";
}
