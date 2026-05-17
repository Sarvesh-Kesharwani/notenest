import CodeBlock from "@tiptap/extension-code-block";
import { TextSelection } from "@tiptap/pm/state";
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

  addKeyboardShortcuts() {
    return {
      ...this.parent?.(),
      "Mod-a": ({ editor }) => {
        const { doc, selection } = editor.state;
        const { $from, $to } = selection;
        let codeBlockDepth: number | null = null;

        for (let depth = $from.depth; depth > 0; depth--) {
          if ($from.node(depth).type.name === this.name) {
            codeBlockDepth = depth;
            break;
          }
        }

        if (codeBlockDepth === null) return false;
        if (
          $to.depth < codeBlockDepth ||
          $to.node(codeBlockDepth) !== $from.node(codeBlockDepth)
        ) {
          return false;
        }

        editor.view.dispatch(
          editor.state.tr.setSelection(
            TextSelection.create(
              doc,
              $from.start(codeBlockDepth),
              $from.end(codeBlockDepth)
            )
          )
        );

        return true;
      },
    };
  },
});
