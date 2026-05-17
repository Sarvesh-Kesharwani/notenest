"use client";

import { useEffect, useRef } from "react";

/**
 * Wraps a <video> element and repairs the broken duration on WebM files
 * produced by MediaRecorder (they lack a Cues / SegmentInfo duration, so
 * browsers report duration = Infinity until the file is fully scanned).
 *
 * On loadedmetadata we detect Infinity/NaN, seek to a huge value to force
 * the browser to scan the entire file, then reset to 0. After the seeked
 * callback fires, duration is accurate and the progress bar works normally.
 */
export default function VideoPlayer({
  src,
  className,
}: {
  src: string;
  className?: string;
}) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const v = ref.current;
    if (!v) return;

    let fixed = false;

    const onLoaded = () => {
      if (fixed) return;
      if (Number.isFinite(v.duration) && v.duration > 0) return;
      fixed = true;
      const onSeeked = () => {
        v.removeEventListener("seeked", onSeeked);
        // reset playhead after duration has been discovered
        try {
          v.currentTime = 0;
        } catch {}
      };
      v.addEventListener("seeked", onSeeked);
      try {
        // this seek forces the browser to scan the whole stream
        v.currentTime = 1e101;
      } catch {}
    };

    v.addEventListener("loadedmetadata", onLoaded);
    v.addEventListener("durationchange", onLoaded);
    // metadata may already be loaded (cached src)
    if (v.readyState >= 1) onLoaded();

    return () => {
      v.removeEventListener("loadedmetadata", onLoaded);
      v.removeEventListener("durationchange", onLoaded);
    };
  }, [src]);

  return (
    <video
      ref={ref}
      src={src}
      controls
      preload="metadata"
      className={className}
    />
  );
}
