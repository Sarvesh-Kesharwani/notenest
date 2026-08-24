"use client";

import { Download } from "lucide-react";
import { getStoredVideoDownloadUrl, triggerDownload } from "@/lib/local-video-client";
import { useNotesStore } from "@/lib/store";

export default function DownloadVideosButton() {
  const nodes = useNotesStore((state) => state.nodes);

  const downloadableNodes = nodes.filter(
    (node) =>
      node.contentType === "video-local" &&
      (node.videoLocalPath || node.videoDataUrl)
  );

  if (downloadableNodes.length === 0) {
    return null;
  }

  return (
    <button
      type="button"
      onClick={() => {
        downloadableNodes.forEach((node, index) => {
          const url = node.videoLocalPath
            ? getStoredVideoDownloadUrl(node.videoLocalPath)
            : node.videoDataUrl!;
          const name = node.videoFileName ?? `${node.title || node.id}.webm`;

          window.setTimeout(() => {
            triggerDownload(url, name);
          }, index * 180);
        });
      }}
      className="flex items-center gap-1.5 rounded-2xl border-2 border-duo-border bg-white px-3 py-1.5 text-xs font-extrabold uppercase text-duo-ink hover:bg-duo-soft"
      title="Download all locally recorded videos"
    >
      <Download size={14} />
      <span className="hidden md:inline">Backup videos</span>
    </button>
  );
}
