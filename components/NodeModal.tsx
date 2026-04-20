"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useNotesStore, type NodeContentType } from "@/lib/store";
import { FileText, Film, Link as LinkIcon, Trash2, X } from "lucide-react";
import RichEditor from "./RichEditor";

const COLOR_SWATCHES = [
  "#58CC02",
  "#1CB0F6",
  "#FFC800",
  "#CE82FF",
  "#FF4B4B",
  "#FF9600",
  "#2B70C9",
];

export default function NodeModal() {
  const selectedId = useNotesStore((s) => s.selectedNodeId);
  const node = useNotesStore((s) =>
    s.selectedNodeId ? s.getNode(s.selectedNodeId) : undefined
  );
  const updateNode = useNotesStore((s) => s.updateNode);
  const deleteNode = useNotesStore((s) => s.deleteNode);
  const selectNode = useNotesStore((s) => s.selectNode);

  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [contentType, setContentType] = useState<NodeContentType>("text");
  const [videoDataUrl, setVideoDataUrl] = useState<string | undefined>();
  const [videoFileName, setVideoFileName] = useState<string | undefined>();
  const [color, setColor] = useState<string>("#58CC02");

  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!node) return;
    setTitle(node.title);
    // migrate plain text to HTML paragraph if needed
    const content = node.text ?? "";
    const isHtml = /<[a-z][\s\S]*>/i.test(content);
    setText(isHtml ? content : content ? `<p>${escapeHtml(content)}</p>` : "");
    setVideoUrl(node.videoUrl ?? "");
    setContentType(node.contentType);
    setVideoDataUrl(node.videoDataUrl);
    setVideoFileName(node.videoFileName);
    setColor(node.color);
  }, [node?.id]); // eslint-disable-line

  useEffect(() => {
    if (!node) return;
    const t = setTimeout(() => {
      updateNode(node.id, {
        title,
        text,
        videoUrl,
        contentType,
        videoDataUrl,
        videoFileName,
        color,
      });
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, text, videoUrl, contentType, videoDataUrl, videoFileName, color]);

  const embedUrl = useMemo(() => toEmbed(videoUrl), [videoUrl]);

  if (!selectedId || !node) return null;

  const close = () => selectNode(null);

  async function onPickLocalVideo(f: File) {
    const reader = new FileReader();
    reader.onload = () => {
      setVideoDataUrl(reader.result as string);
      setVideoFileName(f.name);
    };
    reader.readAsDataURL(f);
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={close}
    >
      <div
        className="flex h-[85vh] w-full max-w-4xl flex-col overflow-hidden rounded-[28px] border-2 border-duo-border bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="relative h-28 shrink-0"
          style={{
            background: `linear-gradient(135deg, ${color}33 0%, ${color}11 100%)`,
          }}
        >
          <div className="absolute inset-x-0 bottom-0 flex items-end justify-between px-8 pb-4">
            <div className="flex items-end gap-4">
              <div
                className="flex h-14 w-14 items-center justify-center rounded-2xl text-white shadow-lg"
                style={{ background: color }}
              >
                {contentType === "text" ? (
                  <FileText size={24} />
                ) : contentType === "video-local" ? (
                  <Film size={24} />
                ) : (
                  <LinkIcon size={24} />
                )}
              </div>
              <div className="pb-1">
                <div className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-gray-500">
                  Node · {node.id}
                </div>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Untitled"
                  className="mt-0.5 w-[400px] max-w-full bg-transparent text-2xl font-black tracking-tight text-duo-ink outline-none placeholder:text-gray-300"
                />
              </div>
            </div>
            <div className="flex items-center gap-1 pb-1">
              <ColorPicker value={color} onChange={setColor} />
              <button
                onClick={() => {
                  if (confirm("Delete this node?")) deleteNode(node.id);
                }}
                className="rounded-xl p-2 text-duo-red hover:bg-duo-red/10"
                aria-label="Delete"
              >
                <Trash2 size={18} />
              </button>
              <button
                onClick={close}
                className="rounded-xl p-2 text-gray-500 hover:bg-white"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>
          </div>
        </div>

        <div className="flex shrink-0 gap-1 border-b-2 border-duo-border px-6 py-2">
          <TabBtn
            active={contentType === "text"}
            onClick={() => setContentType("text")}
            icon={<FileText size={14} />}
            label="Page"
          />
          <TabBtn
            active={contentType === "video-url"}
            onClick={() => setContentType("video-url")}
            icon={<LinkIcon size={14} />}
            label="Online video"
          />
          <TabBtn
            active={contentType === "video-local"}
            onClick={() => setContentType("video-local")}
            icon={<Film size={14} />}
            label="Local video"
          />
        </div>

        <div className="min-h-0 flex-1 overflow-hidden">
          {contentType === "text" && (
            <RichEditor
              value={text}
              onChange={setText}
              placeholder="Write the page content… bold, lists, quotes, code, tasks — all supported."
              variant="page"
            />
          )}

          {contentType === "video-url" && (
            <div className="h-full overflow-y-auto px-8 py-6">
              <div className="mx-auto max-w-[720px] space-y-4">
                <label className="block text-xs font-extrabold uppercase tracking-wider text-gray-500">
                  Video URL
                </label>
                <input
                  value={videoUrl}
                  onChange={(e) => setVideoUrl(e.target.value)}
                  placeholder="Paste YouTube, Vimeo, or direct video URL"
                  className="w-full rounded-2xl border-2 border-duo-border bg-duo-soft px-5 py-4 font-medium outline-none focus:border-duo-green"
                />
                {embedUrl ? (
                  <div className="aspect-video overflow-hidden rounded-2xl border-2 border-duo-border bg-black shadow-duo">
                    <iframe
                      src={embedUrl}
                      className="h-full w-full"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                    />
                  </div>
                ) : videoUrl ? (
                  <video
                    src={videoUrl}
                    controls
                    className="w-full rounded-2xl border-2 border-duo-border bg-black shadow-duo"
                  />
                ) : (
                  <EmptyHint text="Paste a video URL above to preview it." />
                )}
              </div>
            </div>
          )}

          {contentType === "video-local" && (
            <div className="h-full overflow-y-auto px-8 py-6">
              <div className="mx-auto max-w-[720px] space-y-4">
                <input
                  ref={fileRef}
                  type="file"
                  accept="video/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) onPickLocalVideo(f);
                  }}
                />
                <button
                  onClick={() => fileRef.current?.click()}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-duo-border bg-duo-soft py-8 font-bold text-duo-ink transition-colors hover:border-duo-green hover:bg-duo-green/5"
                >
                  <Film size={20} />{" "}
                  {videoFileName
                    ? `Replace (${videoFileName})`
                    : "Choose a local video file"}
                </button>
                {videoDataUrl ? (
                  <video
                    src={videoDataUrl}
                    controls
                    className="w-full rounded-2xl border-2 border-duo-border bg-black shadow-duo"
                  />
                ) : (
                  <EmptyHint text="Pick a video file from your computer. It stays in-browser." />
                )}
              </div>
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center justify-between gap-2 border-t-2 border-duo-border bg-duo-soft px-6 py-3">
          <div className="text-xs font-bold uppercase tracking-wider text-gray-400">
            Autosaved
          </div>
          <button
            onClick={close}
            className="rounded-2xl bg-duo-green px-5 py-2 text-sm font-extrabold uppercase tracking-wide text-white shadow-duoGreen active:translate-y-[2px] active:shadow-none"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

function ColorPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (c: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex h-8 w-8 items-center justify-center rounded-xl border-2 border-white shadow-duo"
        style={{ background: value }}
        aria-label="Node color"
      />
      {open && (
        <div
          className="absolute right-0 top-10 z-10 flex gap-1 rounded-2xl border-2 border-duo-border bg-white p-2 shadow-xl"
          onMouseLeave={() => setOpen(false)}
        >
          {COLOR_SWATCHES.map((c) => (
            <button
              key={c}
              onClick={() => {
                onChange(c);
                setOpen(false);
              }}
              className="h-6 w-6 rounded-lg border-2 border-white shadow-sm hover:scale-110"
              style={{ background: c }}
              aria-label={c}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-extrabold uppercase tracking-wide transition-colors ${
        active
          ? "bg-duo-green text-white"
          : "text-gray-500 hover:bg-duo-soft"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function EmptyHint({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border-2 border-dashed border-duo-border bg-duo-soft p-6 text-center text-sm font-bold text-gray-500">
      {text}
    </div>
  );
}

function toEmbed(url: string): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtube.com")) {
      const id = u.searchParams.get("v");
      if (id) return `https://www.youtube.com/embed/${id}`;
    }
    if (u.hostname === "youtu.be") {
      return `https://www.youtube.com/embed/${u.pathname.slice(1)}`;
    }
    if (u.hostname.includes("vimeo.com")) {
      const id = u.pathname.split("/").filter(Boolean).pop();
      if (id) return `https://player.vimeo.com/video/${id}`;
    }
    return null;
  } catch {
    return null;
  }
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
