"use client";

import { useEffect, useRef } from "react";
import { dataUrlToFile, saveVideoFile } from "@/lib/local-video-client";
import { useNotesStore } from "@/lib/store";

export default function VideoStorageMigration() {
  const nodes = useNotesStore((state) => state.nodes);
  const updateNode = useNotesStore((state) => state.updateNode);
  const migratingIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    for (const node of nodes) {
      if (
        node.contentType !== "video-local" ||
        !node.videoDataUrl ||
        node.videoLocalPath ||
        migratingIds.current.has(node.id)
      ) {
        continue;
      }

      migratingIds.current.add(node.id);

      void (async () => {
        try {
          const file = await dataUrlToFile(
            node.videoDataUrl!,
            node.videoFileName ?? `${node.id}.webm`
          );
          const saved = await saveVideoFile(file);

          updateNode(node.id, {
            videoLocalPath: saved.fileName,
            videoFileName: saved.originalName,
            videoDataUrl: undefined,
          });
        } catch (error) {
          console.error("Failed to migrate local video", error);
        } finally {
          migratingIds.current.delete(node.id);
        }
      })();
    }
  }, [nodes, updateNode]);

  return null;
}
