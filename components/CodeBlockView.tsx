"use client";

import { NodeViewContent, NodeViewWrapper, type NodeViewProps } from "@tiptap/react";

export default function CodeBlockView({ node }: NodeViewProps) {
  const isJson = node.attrs.language === "json";
  const shouldWrap = isJson || node.attrs.wrap === true;

  return (
    <NodeViewWrapper
      className="tt-code-wrapper relative my-3"
      data-json={isJson ? "true" : undefined}
    >
      <pre
        className="tt-code max-w-full overflow-x-auto rounded-xl px-4 py-4 font-mono text-[0.78em] leading-relaxed"
        data-json={isJson ? "true" : undefined}
        data-wrap={shouldWrap ? "true" : undefined}
      >
        <NodeViewContent as="code" />
      </pre>
    </NodeViewWrapper>
  );
}
