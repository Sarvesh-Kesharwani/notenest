import CodeBlock from "@tiptap/extension-code-block";
import { ReactNodeViewRenderer } from "@tiptap/react";
import CodeBlockView from "@/components/CodeBlockView";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    codeBlockWrap: {
      toggleCodeBlockWrap: () => ReturnType;
    };
  }
}

export const CodeBlockWithWrap = CodeBlock.extend({
  marks: "nodeLink",

  addAttributes() {
    return {
      ...this.parent?.(),
      wrap: {
        default: false,
        parseHTML: (el) => el.getAttribute("data-wrap") === "true",
        renderHTML: (attrs) =>
          attrs.wrap ? { "data-wrap": "true" } : {},
      },
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(CodeBlockView);
  },

  addCommands() {
    return {
      ...this.parent?.(),
      toggleCodeBlockWrap:
        () =>
        ({ editor, commands }) => {
          if (!editor.isActive("codeBlock")) return false;
          const current = editor.getAttributes("codeBlock").wrap === true;
          return commands.updateAttributes("codeBlock", { wrap: !current });
        },
    };
  },
});
