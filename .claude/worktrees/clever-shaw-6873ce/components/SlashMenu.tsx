"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useState,
} from "react";
import type { SlashCommandItem } from "@/lib/slash-commands";
import type { Editor, Range } from "@tiptap/core";

export interface SlashMenuProps {
  items: SlashCommandItem[];
  command: (item: SlashCommandItem) => void;
  editor: Editor;
  range: Range;
  query: string;
}

export interface SlashMenuRef {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
}


const SlashMenu = forwardRef<SlashMenuRef, SlashMenuProps>(
  ({ items, command }, ref) => {
    const [selected, setSelected] = useState(0);

    useEffect(() => setSelected(0), [items]);

    useImperativeHandle(ref, () => ({
      onKeyDown: ({ event }) => {
        if (event.key === "ArrowDown") {
          setSelected((s) => (items.length ? (s + 1) % items.length : 0));
          return true;
        }
        if (event.key === "ArrowUp") {
          setSelected((s) =>
            items.length ? (s - 1 + items.length) % items.length : 0
          );
          return true;
        }
        if (event.key === "Enter") {
          const item = items[selected];
          if (item) {
            command(item);
            return true;
          }
        }
        return false;
      },
    }));

    if (items.length === 0) {
      return (
        <div className="w-[280px] rounded-2xl border-2 border-duo-border bg-white p-3 text-center text-sm font-bold text-gray-400 shadow-xl">
          No matches
        </div>
      );
    }

    return (
      <div className="w-[320px] overflow-hidden rounded-2xl border-2 border-duo-border bg-white shadow-xl">
        <div className="border-b-2 border-duo-border bg-duo-soft px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-widest text-gray-500">
          Insert block
        </div>
        <div className="max-h-80 overflow-y-auto p-1.5">
          {items.map((item, i) => {
            const Icon = item.icon;
            const active = i === selected;
            return (
              <button
                key={item.title + i}
                onMouseEnter={() => setSelected(i)}
                onClick={() => command(item)}
                className={`flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors ${
                  active ? "bg-duo-green/10" : "hover:bg-duo-soft"
                }`}
              >
                <div
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                    active
                      ? "bg-duo-green text-white shadow-duoGreen"
                      : "bg-duo-soft text-duo-ink"
                  }`}
                >
                  <Icon size={16} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-extrabold text-duo-ink">
                    {item.title}
                  </div>
                  <div className="truncate text-xs font-medium text-gray-500">
                    {item.description}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  }
);

SlashMenu.displayName = "SlashMenu";
export default SlashMenu;
