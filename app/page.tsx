"use client";

import dynamic from "next/dynamic";
import { Feather } from "lucide-react";
import { LinkDragProvider } from "@/components/LinkDragProvider";

const Editor = dynamic(() => import("@/components/Editor"), { ssr: false });
const Graph = dynamic(() => import("@/components/Graph"), { ssr: false });
const NodeModal = dynamic(() => import("@/components/NodeModal"), {
  ssr: false,
});
const LinkHoverOverlay = dynamic(
  () => import("@/components/LinkHoverOverlay"),
  { ssr: false }
);
const SyncButton = dynamic(() => import("@/components/SyncButton"), {
  ssr: false,
});
const VideoStorageMigration = dynamic(
  () => import("@/components/VideoStorageMigration"),
  { ssr: false }
);
const DownloadVideosButton = dynamic(
  () => import("@/components/DownloadVideosButton"),
  { ssr: false }
);

export default function Page() {
  return (
    <LinkDragProvider>
    <main className="flex h-screen w-screen flex-col overflow-hidden bg-duo-soft">
      <header className="flex h-14 items-center justify-between border-b-2 border-duo-border bg-white px-5">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-duo-green text-white shadow-duoGreen">
            <Feather size={18} />
          </div>
          <div>
            <div className="text-sm font-extrabold uppercase tracking-widest text-duo-ink">
              NoteNest
            </div>
            <div className="-mt-0.5 text-[10px] font-bold uppercase tracking-widest text-gray-400">
              Notes · Graph · Links
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs font-bold text-gray-500">
          <span className="hidden rounded-full bg-duo-yellow/20 px-3 py-1 font-extrabold uppercase text-duo-yellow sm:inline">
            Prototype
          </span>
          <DownloadVideosButton />
          <SyncButton />
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <section className="relative h-full w-1/2 border-r-2 border-duo-border bg-white">
          <Editor />
        </section>
        <section className="relative h-full w-1/2">
          <Graph />
        </section>
      </div>

      <NodeModal />
      <LinkHoverOverlay />
      <VideoStorageMigration />
    </main>
    </LinkDragProvider>
  );
}
