"use client";

import {
  useEditor,
  EditorContent,
  BubbleMenu,
  FloatingMenu,
  type Editor,
  type Extension,
} from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Underline from "@tiptap/extension-underline";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import TextAlign from "@tiptap/extension-text-align";
import Highlight from "@tiptap/extension-highlight";
import Typography from "@tiptap/extension-typography";
import Link from "@tiptap/extension-link";
import TextStyle from "@tiptap/extension-text-style";
import Color from "@tiptap/extension-color";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  CheckSquare,
  Code,
  Code2,
  Heading1,
  Heading2,
  Heading3,
  Highlighter,
  Italic,
  Link2,
  List,
  ListOrdered,
  Minus,
  Pilcrow,
  Quote,
  Strikethrough,
  Underline as UnderlineIcon,
} from "lucide-react";
import { SlashCommands, type SlashCommandItem } from "@/lib/slash-commands";
import { CodeBlockWithWrap } from "@/lib/code-block";
import { JsonCodeHighlight } from "@/lib/json-code-highlight";
import "tippy.js/dist/tippy.css";
import "tippy.js/animations/shift-away.css";
import { useEffect, useRef } from "react";
import clsx from "clsx";

export interface RichEditorRef {
  editor: Editor | null;
}

const EMPTY_JSON_BLOCK = "<pre><code>{}</code></pre>";

function normalizeJsonCodeBlocks(html: string): string {
  const blocks = extractCodeBlockText(html);
  const sourceBlocks = blocks.length > 0 ? blocks : [htmlToPlainText(html)];

  const normalized = sourceBlocks
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => `<pre><code class="language-json">${escapeHtml(formatJsonBlock(block))}</code></pre>`)
    .join("");

  return normalized || EMPTY_JSON_BLOCK;
}

function formatJsonBlock(block: string): string {
  const trimmed = block.trim();
  if (!trimmed) return trimmed;
  const first = trimmed[0];
  const looksLikeObjectFragment = /^"[^"]+"\s*:/.test(trimmed);
  if (first !== "{" && first !== "[" && !looksLikeObjectFragment) return trimmed;

  try {
    return JSON.stringify(JSON.parse(trimmed), null, 2);
  } catch {
    if (looksLikeObjectFragment) {
      try {
        const formatted = JSON.stringify(JSON.parse(`{${trimmed}}`), null, 2);
        return formatted
          .replace(/^\{\n/, "")
          .replace(/\n\}$/, "")
          .replace(/^  /gm, "");
      } catch {
        return trimmed;
      }
    }

    return trimmed;
  }
}

function extractCodeBlockText(html: string): string[] {
  if (!html.trim()) return [];

  if (typeof document === "undefined") {
    const matches = [...html.matchAll(/<pre[^>]*>([\s\S]*?)<\/pre>/gi)];
    return matches.map((match) =>
      match[1].replace(/<[^>]*>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")
    );
  }

  const template = document.createElement("template");
  template.innerHTML = html;
  return Array.from(template.content.querySelectorAll("pre")).map(
    (pre) => pre.textContent ?? ""
  );
}

function htmlToPlainText(html: string): string {
  if (!html.trim()) return "";

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

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export interface RichEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  extraExtensions?: Extension[];
  editorProps?: Parameters<typeof useEditor>[0] extends infer T
    ? T extends { editorProps?: infer P }
      ? P
      : never
    : never;
  rightToolbarSlot?: React.ReactNode;
  bubbleRightSlot?: (editor: Editor) => React.ReactNode;
  className?: string;
  variant?: "page" | "compact";
  autoFocus?: boolean;
  onEditorReady?: (editor: Editor) => void;
  jsonBlocksOnly?: boolean;
  /**
   * If provided, the scroll position of the editor viewport is persisted to
   * localStorage under this key and restored when the same key mounts again.
   * The component restores the most recent saved offset on every key change
   * (e.g. after the editor value is set via reload-restore).
   */
  scrollKey?: string;
}

export default function RichEditor({
  value,
  onChange,
  placeholder,
  extraExtensions = [],
  editorProps,
  rightToolbarSlot,
  bubbleRightSlot,
  className,
  variant = "page",
  autoFocus,
  onEditorReady,
  jsonBlocksOnly = false,
  scrollKey,
}: RichEditorProps) {
  const initialValue = jsonBlocksOnly ? normalizeJsonCodeBlocks(value) : value;
  const lastExternal = useRef(initialValue);
  const pendingExternalSync = useRef(0);
  const editorAttributes =
    typeof editorProps?.attributes === "function"
      ? undefined
      : editorProps?.attributes;

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        codeBlock: false,
      }),
      CodeBlockWithWrap.configure({
        defaultLanguage: jsonBlocksOnly ? "json" : null,
        HTMLAttributes: { class: "tt-code" },
      }),
      JsonCodeHighlight,
      Underline,
      TextStyle,
      Color,
      Highlight.configure({ multicolor: false }),
      TaskList,
      TaskItem.configure({ nested: true }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Typography,
      Link.configure({
        openOnClick: true,
        autolink: true,
        HTMLAttributes: { class: "tt-link", rel: "noopener noreferrer" },
      }),
      Placeholder.configure({
        placeholder:
          placeholder ?? "Start writing… press “/” for blocks or just type.",
        emptyEditorClass: "is-editor-empty",
      }),
      SlashCommands.configure({
        items: (query) => filterSlashItems(SLASH_ITEMS, query),
      }),
      ...extraExtensions,
    ],
    content: initialValue,
    immediatelyRender: false,
    autofocus: autoFocus,
    onUpdate({ editor }) {
      const html = editor.getHTML();
      if (jsonBlocksOnly) {
        const normalized = normalizeJsonCodeBlocks(html);
        lastExternal.current = normalized;
        onChange(normalized);
        if (normalized !== html) {
          queueMicrotask(() => {
            if (!editor.isDestroyed && editor.getHTML() !== normalized) {
              editor.commands.setContent(normalized, false);
            }
          });
        }
        return;
      }

      lastExternal.current = html;
      onChange(html);
    },
    editorProps: {
      ...editorProps,
      attributes: {
        ...editorAttributes,
        class: clsx(
          "tiptap",
          variant === "page" && "tiptap-page",
          variant === "compact" && "tiptap-compact",
          editorAttributes?.class
        ),
        ...(jsonBlocksOnly
          ? {
              spellcheck: "false",
              autocorrect: "off",
              autocapitalize: "off",
            }
          : {}),
      },
    },
  });

  useEffect(() => {
    if (!editor) return;

    const nextValue = jsonBlocksOnly ? normalizeJsonCodeBlocks(value) : value;

    if (nextValue === lastExternal.current || nextValue === editor.getHTML()) return;

    const syncId = ++pendingExternalSync.current;

    queueMicrotask(() => {
      if (pendingExternalSync.current !== syncId || editor.isDestroyed) return;
      if (nextValue === lastExternal.current || nextValue === editor.getHTML()) return;

      editor.commands.setContent(nextValue, false);
      lastExternal.current = nextValue;
    });

    return () => {
      pendingExternalSync.current++;
    };
  }, [value, editor, jsonBlocksOnly]);

  useEffect(() => {
    if (editor && onEditorReady) onEditorReady(editor);
  }, [editor, onEditorReady]);

  if (!editor) {
    return <div className="p-6 text-sm text-gray-400">Loading editor…</div>;
  }

  return (
    <div className={clsx("flex h-full flex-col bg-white", className)}>
      {jsonBlocksOnly ? (
        <JsonToolbar right={rightToolbarSlot} />
      ) : (
        <Toolbar editor={editor} right={rightToolbarSlot} />
      )}

      {!jsonBlocksOnly && (
        <BubbleMenu
          editor={editor}
          tippyOptions={{ duration: 120, placement: "top" }}
          shouldShow={({ editor, from, to }) =>
            from !== to && editor.isEditable
          }
        >
          <div className="flex items-center gap-0.5 rounded-2xl border-2 border-duo-border bg-white p-1 shadow-duo">
            <BubbleIconBtn
              active={editor.isActive("bold")}
              onClick={() => editor.chain().focus().toggleBold().run()}
              label="Bold"
            >
              <Bold size={14} />
            </BubbleIconBtn>
            <BubbleIconBtn
              active={editor.isActive("italic")}
              onClick={() => editor.chain().focus().toggleItalic().run()}
              label="Italic"
            >
              <Italic size={14} />
            </BubbleIconBtn>
            <BubbleIconBtn
              active={editor.isActive("underline")}
              onClick={() => editor.chain().focus().toggleUnderline().run()}
              label="Underline"
            >
              <UnderlineIcon size={14} />
            </BubbleIconBtn>
            <BubbleIconBtn
              active={editor.isActive("strike")}
              onClick={() => editor.chain().focus().toggleStrike().run()}
              label="Strike"
            >
              <Strikethrough size={14} />
            </BubbleIconBtn>
            <BubbleIconBtn
              active={editor.isActive("highlight")}
              onClick={() => editor.chain().focus().toggleHighlight().run()}
              label="Highlight"
            >
              <Highlighter size={14} />
            </BubbleIconBtn>
            <BubbleIconBtn
              active={editor.isActive("code")}
              onClick={() => editor.chain().focus().toggleCode().run()}
              label="Inline code"
            >
              <Code size={14} />
            </BubbleIconBtn>
            <div className="mx-1 h-5 w-px bg-duo-border" />
            <BubbleIconBtn
              active={editor.isActive("link")}
              onClick={() => {
                const prev = editor.getAttributes("link").href as
                  | string
                  | undefined;
                const url = window.prompt("Link URL", prev ?? "https://");
                if (url === null) return;
                if (url === "") {
                  editor.chain().focus().extendMarkRange("link").unsetLink().run();
                  return;
                }
                editor
                  .chain()
                  .focus()
                  .extendMarkRange("link")
                  .setLink({ href: url })
                  .run();
              }}
              label="Link URL"
            >
              <Link2 size={14} />
            </BubbleIconBtn>
            {bubbleRightSlot?.(editor)}
          </div>
        </BubbleMenu>
      )}

      {jsonBlocksOnly && bubbleRightSlot && (
        <BubbleMenu
          editor={editor}
          tippyOptions={{ duration: 120, placement: "top" }}
          shouldShow={({ editor, from, to }) =>
            from !== to && editor.isEditable
          }
        >
          <div className="flex items-center gap-1 rounded-2xl border-2 border-duo-border bg-white p-1 shadow-duo">
            {bubbleRightSlot(editor)}
          </div>
        </BubbleMenu>
      )}

      {!jsonBlocksOnly && (
        <FloatingMenu
          editor={editor}
          tippyOptions={{ placement: "left-start", duration: 120 }}
          shouldShow={({ editor, state }) => {
            const { $from, empty } = state.selection;
            if (!empty) return false;
            if (!editor.isEditable) return false;
            const node = $from.parent;
            return node.type.name === "paragraph" && node.content.size === 0;
          }}
        >
          <div className="-ml-12 flex h-8 w-8 items-center justify-center rounded-full bg-duo-soft text-duo-green shadow-sm">
            <span className="text-lg font-black leading-none">+</span>
          </div>
        </FloatingMenu>
      )}

      <ScrollPersistedViewport
        scrollKey={scrollKey}
        // Re-restore once the editor's value swap completes so reload lands
        // the user on the exact line they were last viewing.
        restoreSignal={value}
        className={clsx(
          "flex-1 overflow-y-auto",
          variant === "page" ? "px-6 py-8 md:px-12" : "p-2"
        )}
      >
        <div className={variant === "page" ? "mx-auto max-w-[720px]" : ""}>
          <EditorContent editor={editor} />
          <AppendBlockButton editor={editor} jsonBlocksOnly={jsonBlocksOnly} />
        </div>
      </ScrollPersistedViewport>
    </div>
  );
}

function ScrollPersistedViewport({
  scrollKey,
  restoreSignal,
  className,
  children,
}: {
  scrollKey: string | undefined;
  restoreSignal: unknown;
  className?: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const restoredKeyRef = useRef<string | undefined>(undefined);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const storageKey = scrollKey ? `notenest:scroll:${scrollKey}` : null;

  // Restore on key change AND whenever the rendered value swaps (e.g. after
  // the editor finishes setting new HTML on reload-restore). We retry across
  // a couple of frames so the layout has measured by the time we set scroll.
  useEffect(() => {
    if (!storageKey) return;
    if (!ref.current) return;
    let attempts = 0;
    const apply = () => {
      const el = ref.current;
      if (!el) return;
      const raw = localStorage.getItem(storageKey);
      const top = raw ? Number(raw) : NaN;
      if (Number.isFinite(top)) el.scrollTop = top;
      attempts++;
      if (attempts < 3) requestAnimationFrame(apply);
    };
    restoredKeyRef.current = storageKey;
    requestAnimationFrame(apply);
  }, [storageKey, restoreSignal]);

  // Save on scroll (debounced) only after we've restored for this key, so the
  // initial 0 doesn't clobber the saved value.
  const onScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (!storageKey) return;
    if (restoredKeyRef.current !== storageKey) return;
    const top = e.currentTarget.scrollTop;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      try {
        localStorage.setItem(storageKey, String(Math.round(top)));
      } catch {
        /* ignore */
      }
    }, 200);
  };

  return (
    <div ref={ref} onScroll={onScroll} className={className}>
      {children}
    </div>
  );
}

function AppendBlockButton({
  editor,
  jsonBlocksOnly,
}: {
  editor: Editor;
  jsonBlocksOnly?: boolean;
}) {
  const append = () => {
    const end = editor.state.doc.content.size;
    if (jsonBlocksOnly) {
      editor
        .chain()
        .focus()
        .insertContentAt(end, {
          type: "codeBlock",
          attrs: { language: "json" },
          content: [{ type: "text", text: "{}" }],
        })
        .run();
    } else {
      editor
        .chain()
        .focus()
        .insertContentAt(end, { type: "paragraph" })
        .run();
    }
    const newEnd = editor.state.doc.content.size;
    editor
      .chain()
      .focus()
      .setTextSelection(jsonBlocksOnly ? Math.max(1, newEnd - 1) : newEnd)
      .run();
    requestAnimationFrame(() => {
      editor.view.dom.scrollIntoView?.({ block: "end" });
    });
  };

  return (
    <button
      type="button"
      onClick={append}
      title="Add a new block at the end"
      className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-duo-border bg-white py-3 text-xs font-extrabold uppercase tracking-wide text-gray-400 hover:border-duo-green hover:text-duo-greenDark"
    >
      <span className="text-lg leading-none">+</span>{" "}
      {jsonBlocksOnly ? "Add JSON block" : "Add block"}
    </button>
  );
}

function JsonToolbar({ right }: { right?: React.ReactNode }) {
  return (
    <div className="sticky top-0 z-10 flex items-center gap-2 border-b-2 border-duo-border bg-white/95 px-3 py-2 backdrop-blur">
      <div className="rounded-xl bg-duo-blue/15 px-3 py-1.5 text-xs font-extrabold uppercase tracking-wide text-duo-blue">
        JSON blocks
      </div>
      {right && <div className="ml-auto flex items-center gap-2">{right}</div>}
    </div>
  );
}

function Toolbar({
  editor,
  right,
}: {
  editor: Editor;
  right?: React.ReactNode;
}) {
  return (
    <div className="sticky top-0 z-10 flex flex-wrap items-center gap-0.5 border-b-2 border-duo-border bg-white/95 px-3 py-2 backdrop-blur">
      <IconBtn
        active={editor.isActive("heading", { level: 1 })}
        onClick={() =>
          editor.chain().focus().toggleHeading({ level: 1 }).run()
        }
        label="Heading 1"
      >
        <Heading1 size={16} />
      </IconBtn>
      <IconBtn
        active={editor.isActive("heading", { level: 2 })}
        onClick={() =>
          editor.chain().focus().toggleHeading({ level: 2 }).run()
        }
        label="Heading 2"
      >
        <Heading2 size={16} />
      </IconBtn>
      <IconBtn
        active={editor.isActive("heading", { level: 3 })}
        onClick={() =>
          editor.chain().focus().toggleHeading({ level: 3 }).run()
        }
        label="Heading 3"
      >
        <Heading3 size={16} />
      </IconBtn>
      <Divider />
      <IconBtn
        active={editor.isActive("bold")}
        onClick={() => editor.chain().focus().toggleBold().run()}
        label="Bold"
      >
        <Bold size={16} />
      </IconBtn>
      <IconBtn
        active={editor.isActive("italic")}
        onClick={() => editor.chain().focus().toggleItalic().run()}
        label="Italic"
      >
        <Italic size={16} />
      </IconBtn>
      <IconBtn
        active={editor.isActive("underline")}
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        label="Underline"
      >
        <UnderlineIcon size={16} />
      </IconBtn>
      <IconBtn
        active={editor.isActive("strike")}
        onClick={() => editor.chain().focus().toggleStrike().run()}
        label="Strikethrough"
      >
        <Strikethrough size={16} />
      </IconBtn>
      <IconBtn
        active={editor.isActive("highlight")}
        onClick={() => editor.chain().focus().toggleHighlight().run()}
        label="Highlight"
      >
        <Highlighter size={16} />
      </IconBtn>
      <Divider />
      <IconBtn
        active={editor.isActive("bulletList")}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        label="Bullet list"
      >
        <List size={16} />
      </IconBtn>
      <IconBtn
        active={editor.isActive("orderedList")}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        label="Ordered list"
      >
        <ListOrdered size={16} />
      </IconBtn>
      <IconBtn
        active={editor.isActive("taskList")}
        onClick={() => editor.chain().focus().toggleTaskList().run()}
        label="Task list"
      >
        <CheckSquare size={16} />
      </IconBtn>
      <IconBtn
        active={editor.isActive("blockquote")}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        label="Quote"
      >
        <Quote size={16} />
      </IconBtn>
      <IconBtn
        active={editor.isActive("codeBlock")}
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        label="Code block"
      >
        <Code2 size={16} />
      </IconBtn>
      <IconBtn
        onClick={() => editor.chain().focus().setHorizontalRule().run()}
        label="Divider"
      >
        <Minus size={16} />
      </IconBtn>
      <Divider />
      <IconBtn
        active={editor.isActive({ textAlign: "left" })}
        onClick={() => editor.chain().focus().setTextAlign("left").run()}
        label="Align left"
      >
        <AlignLeft size={16} />
      </IconBtn>
      <IconBtn
        active={editor.isActive({ textAlign: "center" })}
        onClick={() => editor.chain().focus().setTextAlign("center").run()}
        label="Align center"
      >
        <AlignCenter size={16} />
      </IconBtn>
      <IconBtn
        active={editor.isActive({ textAlign: "right" })}
        onClick={() => editor.chain().focus().setTextAlign("right").run()}
        label="Align right"
      >
        <AlignRight size={16} />
      </IconBtn>

      {right && <div className="ml-auto flex items-center gap-2">{right}</div>}
    </div>
  );
}

function Divider() {
  return <div className="mx-1 h-5 w-px bg-duo-border" />;
}

const SLASH_ITEMS: SlashCommandItem[] = [
  {
    title: "Text",
    description: "Plain paragraph",
    icon: Pilcrow,
    keywords: ["p", "paragraph", "text"],
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).setParagraph().run(),
  },
  {
    title: "Heading 1",
    description: "Big section heading",
    icon: Heading1,
    keywords: ["h1", "title"],
    command: ({ editor, range }) =>
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .setNode("heading", { level: 1 })
        .run(),
  },
  {
    title: "Heading 2",
    description: "Medium section heading",
    icon: Heading2,
    keywords: ["h2"],
    command: ({ editor, range }) =>
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .setNode("heading", { level: 2 })
        .run(),
  },
  {
    title: "Heading 3",
    description: "Small section heading",
    icon: Heading3,
    keywords: ["h3"],
    command: ({ editor, range }) =>
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .setNode("heading", { level: 3 })
        .run(),
  },
  {
    title: "Bulleted list",
    description: "Simple bullet list",
    icon: List,
    keywords: ["ul", "bullet", "list"],
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleBulletList().run(),
  },
  {
    title: "Numbered list",
    description: "Ordered list 1, 2, 3…",
    icon: ListOrdered,
    keywords: ["ol", "ordered", "numbered"],
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleOrderedList().run(),
  },
  {
    title: "To-do list",
    description: "Task list with checkboxes",
    icon: CheckSquare,
    keywords: ["todo", "task", "check"],
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleTaskList().run(),
  },
  {
    title: "Quote",
    description: "Blockquote callout",
    icon: Quote,
    keywords: ["blockquote", "quote"],
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleBlockquote().run(),
  },
  {
    title: "Code block",
    description: "Syntax-ready code area",
    icon: Code2,
    keywords: ["code", "pre"],
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleCodeBlock().run(),
  },
  {
    title: "Divider",
    description: "Horizontal line separator",
    icon: Minus,
    keywords: ["hr", "divider", "line", "rule"],
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).setHorizontalRule().run(),
  },
  {
    title: "Bold",
    description: "Toggle bold on cursor",
    icon: Bold,
    keywords: ["bold", "b"],
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleBold().run(),
  },
  {
    title: "Italic",
    description: "Toggle italic on cursor",
    icon: Italic,
    keywords: ["italic", "i"],
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleItalic().run(),
  },
  {
    title: "Highlight",
    description: "Toggle yellow highlight",
    icon: Highlighter,
    keywords: ["highlight", "mark"],
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleHighlight().run(),
  },
];

function filterSlashItems(
  all: SlashCommandItem[],
  query: string
): SlashCommandItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return all;
  return all.filter((it) => {
    const hay = [it.title, ...(it.keywords ?? [])].join(" ").toLowerCase();
    return hay.includes(q);
  });
}

function IconBtn({
  children,
  active,
  onClick,
  label,
}: {
  children: React.ReactNode;
  active?: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={clsx(
        "flex h-8 w-8 items-center justify-center rounded-xl transition-colors",
        active ? "bg-duo-green text-white" : "text-duo-ink hover:bg-duo-soft"
      )}
    >
      {children}
    </button>
  );
}

function BubbleIconBtn({
  children,
  active,
  onClick,
  label,
}: {
  children: React.ReactNode;
  active?: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={clsx(
        "flex h-7 w-7 items-center justify-center rounded-lg transition-colors",
        active ? "bg-duo-green text-white" : "text-duo-ink hover:bg-duo-soft"
      )}
    >
      {children}
    </button>
  );
}
