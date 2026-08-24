"use client";

import { Mic, Monitor, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { saveVideoFile } from "@/lib/local-video-client";
import { useRevisionVideosStore } from "@/lib/revision-videos-store";
import type { StudyTopic } from "@/lib/study-store";

interface Props {
  topic: StudyTopic | null;
  topicPath: { id: string; title: string }[];
}

export default function TopicExplanationRecorder({ topic, topicPath }: Props) {
  const recorderRef = useRef<MediaRecorder | null>(null);
  const displayStreamRef = useRef<MediaStream | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const mixedStreamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const recordingRef = useRef<{ title: string; path: { id: string; title: string }[] } | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [saving, setSaving] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [micEnabled, setMicEnabled] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      stopTimer(timerRef);
      if (recorderRef.current && recorderRef.current.state !== "inactive") {
        try {
          recorderRef.current.stop();
        } catch {}
      }
      cleanupStreams(displayStreamRef, micStreamRef, mixedStreamRef, audioCtxRef);
    };
  }, []);

  async function startRecording() {
    if (!topic) return;
    setError(null);
    recordingRef.current = { title: topic.title, path: topicPath };

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
          /* Screen audio only. */
        }
      }

      const videoTrack = displayStream.getVideoTracks()[0];
      if (!videoTrack) throw new Error("No screen video track available");
      const displayAudio = displayStream.getAudioTracks();
      const micAudio = micStream?.getAudioTracks() ?? [];
      let finalStream: MediaStream;

      if (displayAudio.length && micAudio.length) {
        const AC =
          (window as unknown as { AudioContext: typeof AudioContext }).AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const ctx = new AC();
        audioCtxRef.current = ctx;
        const dest = ctx.createMediaStreamDestination();
        ctx.createMediaStreamSource(new MediaStream([displayAudio[0]])).connect(dest);
        ctx.createMediaStreamSource(new MediaStream([micAudio[0]])).connect(dest);
        finalStream = new MediaStream([videoTrack, ...dest.stream.getAudioTracks()]);
      } else {
        const audioTrack = displayAudio[0] ?? micAudio[0];
        finalStream = new MediaStream(audioTrack ? [videoTrack, audioTrack] : [videoTrack]);
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
      rec.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      rec.onstop = () => {
        stopTimer(timerRef);
        cleanupStreams(displayStreamRef, micStreamRef, mixedStreamRef, audioCtxRef);
        const blob = new Blob(chunksRef.current, { type: "video/webm" });
        chunksRef.current = [];
        setIsRecording(false);
        void saveRecording(blob, mime);
      };
      videoTrack.addEventListener("ended", () => stopRecording());
      rec.start(1000);
      setIsRecording(true);
      setSeconds(0);
      timerRef.current = window.setInterval(() => setSeconds((value) => value + 1), 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Screen recording failed");
      cleanupStreams(displayStreamRef, micStreamRef, mixedStreamRef, audioCtxRef);
      setIsRecording(false);
    }
  }

  function stopRecording() {
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
  }

  async function saveRecording(blob: Blob, mime: string) {
    const recordedTopic = recordingRef.current;
    if (!recordedTopic) return;
    if (blob.size === 0) {
      setError("Recording was empty");
      return;
    }

    setSaving(true);
    try {
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const fileName = `${safeFileName(recordedTopic.title)}-explanation-${stamp}.webm`;
      const file = new File([blob], fileName, { type: blob.type || mime });
      const saved = await saveVideoFile(file);
      await useRevisionVideosStore.getState().initProjectConfig();
      useRevisionVideosStore.getState().addStudyRecording({
        topicPath: recordedTopic.path,
        title: `${recordedTopic.title} explanation`,
        storedFileName: saved.fileName,
        originalName: saved.originalName,
        url: saved.url,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Saving recording failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      {error && (
        <span className="max-w-48 truncate text-[11px] font-bold text-duo-red" title={error}>
          {error}
        </span>
      )}
      {isRecording && (
        <span className="inline-flex items-center gap-1 rounded-lg bg-duo-red/10 px-2 py-1 text-[11px] font-extrabold uppercase text-duo-red">
          <span className="h-2 w-2 animate-pulse rounded-full bg-duo-red" />
          {formatSecs(seconds)}
        </span>
      )}
      <label
        title="Record mic audio"
        className={`inline-flex h-7 cursor-pointer items-center gap-1 rounded-lg border px-2 text-[10px] font-extrabold uppercase ${
          micEnabled ? "border-duo-green bg-duo-green/10 text-duo-greenDark" : "border-duo-border text-gray-500"
        } ${isRecording ? "pointer-events-none opacity-60" : ""}`}
      >
        <input
          type="checkbox"
          checked={micEnabled}
          onChange={(event) => setMicEnabled(event.target.checked)}
          disabled={isRecording}
          className="h-3 w-3 accent-duo-green"
        />
        <Mic size={12} />
      </label>
      {isRecording ? (
        <button
          onClick={stopRecording}
          className="inline-flex h-7 items-center gap-1 rounded-lg bg-duo-red px-3 text-[10px] font-extrabold uppercase text-white shadow-duo active:translate-y-[1px]"
        >
          <Square size={12} fill="white" />
          Stop
        </button>
      ) : (
        <button
          disabled={!topic || saving}
          onClick={() => void startRecording()}
          title={topic ? `Record explanation for ${topic.title}` : "Open a topic note first"}
          className="inline-flex h-7 items-center gap-1 rounded-lg bg-duo-blue px-3 text-[10px] font-extrabold uppercase text-white shadow-duoBlue active:translate-y-[1px] disabled:cursor-not-allowed disabled:bg-gray-300 disabled:shadow-none"
        >
          <Monitor size={12} />
          {saving ? "Saving" : "Record"}
        </button>
      )}
    </div>
  );
}

function stopTimer(timerRef: { current: number | null }) {
  if (timerRef.current) {
    window.clearInterval(timerRef.current);
    timerRef.current = null;
  }
}

function cleanupStreams(
  displayRef: { current: MediaStream | null },
  micRef: { current: MediaStream | null },
  mixedRef: { current: MediaStream | null },
  audioCtxRef: { current: AudioContext | null }
) {
  displayRef.current?.getTracks().forEach((track) => track.stop());
  displayRef.current = null;
  micRef.current?.getTracks().forEach((track) => track.stop());
  micRef.current = null;
  mixedRef.current?.getTracks().forEach((track) => track.stop());
  mixedRef.current = null;
  audioCtxRef.current?.close().catch(() => {});
  audioCtxRef.current = null;
}

function safeFileName(value: string) {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 50) || "topic"
  );
}

function formatSecs(value: number) {
  const minutes = Math.floor(value / 60);
  const seconds = value % 60;
  return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}
