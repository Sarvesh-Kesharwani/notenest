"use client";

import { NodeViewContent, NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { WrapText } from "lucide-react";

export default function CodeBlockView({ node, updateAttributes, editor }: NodeViewProps) {
  const wrap = !!node.attrs.wrap;

  return (
    <NodeViewWrapper
      className="tt-code-wrapper relative my-4"
      data-wrap={wrap ? "true" : undefined}
    >
      <pre
        className="tt-code overflow-x-auto rounded-2xl px-5 py-4 font-mono text-[0.9em] leading-relaxed"
        data-wrap={wrap ? "true" : undefined}
        style={{
          background: "#f5f7f3",
          color: "#2d3b23",
          border: "2px solid #e3ead9",
          whiteSpace: wrap ? "pre-wrap" : "pre",
          wordBreak: wrap ? "break-word" : undefined,
          overflowWrap: wrap ? "anywhere" : undefined,
        }}
      >
        <NodeViewContent as="code" />
      </pre>
      {editor.isEditable && (
        <button
          type="button"
          contentEditable={false}
          onClick={(e) => {
            e.preventDefault();
            updateAttributes({ wrap: !wrap });
          }}
          title={wrap ? "Disable word wrap" : "Enable word wrap"}
          className={`absolute right-2 top-2 flex items-center gap-1 rounded-lg border-2 px-2 py-1 text-[10px] font-extrabold uppercase transition-colors ${
            wrap
              ? "border-duo-green bg-duo-green text-white shadow-duoGreen"
              : "border-duo-border bg-white text-duo-ink hover:bg-duo-soft"
          }`}
        >
          <WrapText size={12} /> Wrap
        </button>
      )}
    </NodeViewWrapper>
  );
}
