import { Mark, mergeAttributes } from "@tiptap/core";

export interface NodeLinkAttrs {
  nodeId: string;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    nodeLink: {
      setNodeLink: (attrs: NodeLinkAttrs) => ReturnType;
      unsetNodeLink: () => ReturnType;
    };
  }
}

export const NodeLinkMark = Mark.create({
  name: "nodeLink",
  inclusive: false,
  exitable: true,

  addAttributes() {
    return {
      nodeId: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-node-id"),
        renderHTML: (attrs) =>
          attrs.nodeId ? { "data-node-id": attrs.nodeId } : {},
      },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-node-id]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        class: "node-link",
        "data-node-link": "true",
      }),
      0,
    ];
  },

  addCommands() {
    return {
      setNodeLink:
        (attrs) =>
        ({ commands }) =>
          commands.setMark(this.name, attrs),
      unsetNodeLink:
        () =>
        ({ commands }) =>
          commands.unsetMark(this.name),
    };
  },
});
