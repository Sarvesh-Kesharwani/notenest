import { Extension, type Editor, type Range } from "@tiptap/core";
import { ReactRenderer } from "@tiptap/react";
import Suggestion, { type SuggestionOptions } from "@tiptap/suggestion";
import tippy, { type Instance as TippyInstance } from "tippy.js";
import SlashMenu, { type SlashMenuRef } from "@/components/SlashMenu";
import type { ComponentType } from "react";

export interface SlashCommandItem {
  title: string;
  description: string;
  icon: ComponentType<{ size?: number }>;
  keywords?: string[];
  command: (ctx: { editor: Editor; range: Range }) => void;
}

export interface SlashCommandsOptions {
  items: (query: string) => SlashCommandItem[];
}

export const SlashCommands = Extension.create<SlashCommandsOptions>({
  name: "slashCommands",

  addOptions() {
    return {
      items: () => [],
    };
  },

  addProseMirrorPlugins() {
    const items = this.options.items;

    const suggestion: Omit<SuggestionOptions, "editor"> = {
      char: "/",
      startOfLine: false,
      allowSpaces: false,
      command: ({ editor, range, props }) => {
        (props as SlashCommandItem).command({ editor, range });
      },
      items: ({ query }) => items(query).slice(0, 10),
      render: () => {
        let component: ReactRenderer<SlashMenuRef> | null = null;
        let popup: TippyInstance[] = [];

        return {
          onStart: (props) => {
            component = new ReactRenderer(SlashMenu, {
              props,
              editor: props.editor,
            });

            if (!props.clientRect) return;
            popup = tippy("body", {
              getReferenceClientRect: () =>
                props.clientRect?.() ?? new DOMRect(),
              appendTo: () => document.body,
              content: component.element,
              showOnCreate: true,
              interactive: true,
              trigger: "manual",
              placement: "bottom-start",
              offset: [0, 8],
              animation: "shift-away",
              duration: [120, 80],
            });
          },
          onUpdate: (props) => {
            component?.updateProps(props);
            if (!props.clientRect) return;
            popup[0]?.setProps({
              getReferenceClientRect: () =>
                props.clientRect?.() ?? new DOMRect(),
            });
          },
          onKeyDown: (props) => {
            if (props.event.key === "Escape") {
              popup[0]?.hide();
              return true;
            }
            return component?.ref?.onKeyDown(props) ?? false;
          },
          onExit: () => {
            popup[0]?.destroy();
            component?.destroy();
            popup = [];
            component = null;
          },
        };
      },
    };

    return [
      Suggestion({
        editor: this.editor,
        ...suggestion,
      }),
    ];
  },
});
