"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useNotesStore, type NodeContentType } from "@/lib/store";
import {
  Download,
  FileText,
  Film,
  Link as LinkIcon,
  Monitor,
  Square,
  Trash2,
  X,
} from "lucide-react";
import {
  getStoredVideoDownloadUrl,
  getStoredVideoUrl,
  saveVideoFile,
  triggerDownload,
} from "@/lib/local-video-client";
import RichEditor from "./RichEditor";
import { NodeLinkMark } from "@/lib/node-link-mark";

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
  const [videoLocalPath, setVideoLocalPath] = useState<string | undefined>();
  const [videoStorageDir, setVideoStorageDir] = useState<string | undefined>();
  const [color, setColor] = useState<string>("#58CC02");

  const fileRef = useRef<HTMLInputElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const displayStreamRef = useRef<MediaStream | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const mixedStreamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recSeconds, setRecSeconds] = useState(0);
  const [recError, setRecError] = useState<string | null>(null);
  const [micEnabled, setMicEnabled] = useState(true);

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
    setVideoLocalPath(node.videoLocalPath);
    setVideoStorageDir(undefined);
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
        videoLocalPath,
        color,
      });
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    title,
    text,
    videoUrl,
    contentType,
    videoDataUrl,
    videoFileName,
    videoLocalPath,
    color,
  ]);

  const embedUrl = useMemo(() => toEmbed(videoUrl), [videoUrl]);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      if (recorderRef.current && recorderRef.current.state !== "inactive") {
        try {
          recorderRef.current.stop();
        } catch {}
      }
      displayStreamRef.current?.getTracks().forEach((t) => t.stop());
      displayStreamRef.current = null;
      micStreamRef.current?.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
      mixedStreamRef.current?.getTracks().forEach((t) => t.stop());
      mixedStreamRef.current = null;
      audioCtxRef.current?.close().catch(() => {});
      audioCtxRef.current = null;
    };
  }, []);

  if (!selectedId || !node) return null;

  const close = () => selectNode(null);
  const localVideoSrc = videoLocalPath
    ? getStoredVideoUrl(videoLocalPath)
    : videoDataUrl;
  const localVideoDownloadUrl = videoLocalPath
    ? getStoredVideoDownloadUrl(videoLocalPath)
    : videoDataUrl;

  async function onPickLocalVideo(f: File) {
    setRecError(null);
    try {
      const saved = await saveVideoFile(f);
      setVideoLocalPath(saved.fileName);
      setVideoFileName(saved.originalName);
      setVideoStorageDir(saved.storageDir);
      setVideoDataUrl(undefined);
    } catch (error) {
      setRecError((error as Error).message || "Saving video failed");
    }
  }

  function stopTimer() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  function cleanupStreams() {
    displayStreamRef.current?.getTracks().forEach((t) => t.stop());
    displayStreamRef.current = null;
    micStreamRef.current?.getTracks().forEach((t) => t.stop());
    micStreamRef.current = null;
    mixedStreamRef.current?.getTracks().forEach((t) => t.stop());
    mixedStreamRef.current = null;
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
  }

  async function startScreenRecord() {
    setRecError(null);
    try {
      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 30 },
        audio: true,
      });
      displayStreamRef.current = displayStream;

      let micStream: MediaStream | null = null;
      if (micEnabled) {
        try {
          micStream = await navigator.mediaDevices.getUserMedia({
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
            },
          });
          micStreamRef.current = micStream;
        } catch {
          // mic denied — continue with whatever audio display provided
        }
      }

      const displayAudio = displayStream.getAudioTracks();
      const micAudio = micStream?.getAudioTracks() ?? [];
      const videoTrack = displayStream.getVideoTracks()[0];

      let finalStream: MediaStream;
      if (displayAudio.length && micAudio.length) {
        // mix both into one track via WebAudio
        const AC =
          (window as unknown as { AudioContext: typeof AudioContext })
            .AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext })
            .webkitAudioContext;
        const ctx = new AC();
        audioCtxRef.current = ctx;
        const dest = ctx.createMediaStreamDestination();
        ctx
          .createMediaStreamSource(new MediaStream([displayAudio[0]]))
          .connect(dest);
        ctx
          .createMediaStreamSource(new MediaStream([micAudio[0]]))
          .connect(dest);
        finalStream = new MediaStream([
          videoTrack,
          ...dest.stream.getAudioTracks(),
        ]);
      } else {
        const audio = displayAudio[0] ?? micAudio[0];
        finalStream = new MediaStream(
          audio ? [videoTrack, audio] : [videoTrack]
        );
      }
      mixedStreamRef.current = finalStream;

      chunksRef.current = [];
      const mime = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")
        ? "video/webm;codecs=vp9,opus"
        : MediaRecorder.isTypeSupported("video/webm;codecs=vp8,opus")
          ? "video/webm;codecs=vp8,opus"
          : "video/webm";
      const rec = new MediaRecorder(finalStream, { mimeType: mime });
      recorderRef.current = rec;
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        stopTimer();
        cleanupStreams();
        const blob = new Blob(chunksRef.current, { type: "video/webm" });
        chunksRef.current = [];
        setIsRecording(false);

        const fileName = `screen-${new Date()
          .toISOString()
          .replace(/[:.]/g, "-")}.webm`;
        const file = new File([blob], fileName, { type: blob.type || mime });

        void onPickLocalVideo(file);
      };
      videoTrack?.addEventListener("ended", () => {
        if (recorderRef.current && recorderRef.current.state !== "inactive") {
          recorderRef.current.stop();
        }
      });
      rec.start(1000);
      setIsRecording(true);
      setRecSeconds(0);
      timerRef.current = setInterval(() => setRecSeconds((s) => s + 1), 1000);
    } catch (err) {
      setRecError((err as Error).message || "Screen recording failed");
      cleanupStreams();
    }
  }

  function stopScreenRecord() {
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
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
              extraExtensions={[NodeLinkMark as never]}
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
            <div className="flex h-full flex-col overflow-hidden">
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
              <div className="min-h-0 flex-1 overflow-hidden px-8 pt-6 pb-4">
                <div className="mx-auto flex h-full max-w-[820px] items-center justify-center">
                  {localVideoSrc ? (
                    <video
                      src={localVideoSrc}
                      controls
                      className="max-h-full w-full rounded-2xl border-2 border-duo-border bg-black object-contain shadow-duo"
                    />
                  ) : (
                    <EmptyHint text="Pick a video file or record your screen. Videos are saved into a local folder on this machine." />
                  )}
                </div>
              </div>
              <div className="shrink-0 border-t-2 border-duo-border bg-duo-soft px-6 py-3">
                <div className="mx-auto max-w-[820px] space-y-2">
                  {recError && (
                    <div className="rounded-xl border-2 border-duo-red/40 bg-duo-red/10 px-4 py-1.5 text-xs font-bold text-duo-red">
                      {recError}
                    </div>
                  )}
                  {isRecording && (
                    <div className="flex items-center justify-center gap-2 rounded-xl border-2 border-duo-red/40 bg-duo-red/5 px-4 py-1.5 text-xs font-extrabold uppercase tracking-wider text-duo-red">
                      <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-duo-red" />
                      Recording · {formatSecs(recSeconds)}
                    </div>
                  )}
                  {(videoStorageDir || videoLocalPath) && (
                    <div className="rounded-xl border-2 border-duo-border bg-white px-4 py-1.5 text-[11px] font-bold text-gray-500">
                      Saved in local folder{videoStorageDir ? `: ${videoStorageDir}` : "."}
                    </div>
                  )}
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => fileRef.current?.click()}
                      disabled={isRecording}
                      className="flex flex-1 items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-duo-border bg-white py-3 text-sm font-extrabold text-duo-ink transition-colors hover:border-duo-green hover:bg-duo-green/5 disabled:opacity-50"
                    >
                      <Film size={18} />
                      <span className="truncate">
                        {videoFileName ? `Replace` : "Choose video file"}
                      </span>
                    </button>
                    {isRecording ? (
                      <button
                        onClick={stopScreenRecord}
                        className="flex flex-1 items-center justify-center gap-2 rounded-2xl border-2 border-duo-red bg-duo-red py-3 text-sm font-extrabold text-white shadow-duo transition-transform active:translate-y-[2px]"
                      >
                        <Square size={16} fill="white" />
                        Stop · {formatSecs(recSeconds)}
                      </button>
                    ) : (
                      <button
                        onClick={startScreenRecord}
                        className="flex flex-1 items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-duo-border bg-white py-3 text-sm font-extrabold text-duo-ink transition-colors hover:border-duo-red hover:bg-duo-red/5 hover:text-duo-red"
                      >
                        <Monitor size={18} /> Record screen
                      </button>
                    )}
                    {localVideoDownloadUrl && (
                      <button
                        type="button"
                        onClick={() =>
                          triggerDownload(
                            localVideoDownloadUrl,
                            videoFileName ?? `${node.title || node.id}.webm`
                          )
                        }
                        className="flex shrink-0 items-center justify-center gap-2 rounded-2xl border-2 border-duo-border bg-white px-4 py-3 text-sm font-extrabold text-duo-ink transition-colors hover:bg-duo-soft"
                        title="Download this recorded video"
                      >
                        <Download size={18} />
                        <span className="hidden sm:inline">Download</span>
                      </button>
                    )}
                    <label
                      className={`flex shrink-0 cursor-pointer items-center gap-1.5 rounded-2xl border-2 px-3 py-3 text-[11px] font-extrabold uppercase tracking-wide transition-colors ${
                        micEnabled
                          ? "border-duo-green bg-duo-green/10 text-duo-greenDark"
                          : "border-duo-border bg-white text-gray-500"
                      } ${isRecording ? "pointer-events-none opacity-60" : ""}`}
                      title="Include microphone in screen recording"
                    >
                      <input
                        type="checkbox"
                        checked={micEnabled}
                        onChange={(e) => setMicEnabled(e.target.checked)}
                        disabled={isRecording}
                        className="h-3.5 w-3.5 accent-duo-green"
                      />
                      Mic
                    </label>
                  </div>
                </div>
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

function formatSecs(n: number) {
  const m = Math.floor(n / 60);
  const s = n % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
