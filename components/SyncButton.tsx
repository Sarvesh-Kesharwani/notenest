"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { signIn, signOut, useSession } from "next-auth/react";
import { Cloud, CloudOff, LogIn, LogOut, RefreshCw } from "lucide-react";
import { clearLocalNotes, useNotesStore, type GraphNode } from "@/lib/store";

type SyncState = "idle" | "syncing" | "synced" | "error";

const PULLED_KEY = "notenest_drive_pulled";

export default function SyncButton() {
  const { data: session, status } = useSession();
  const editorHTML = useNotesStore((state) => state.editorHTML);
  const nodes = useNotesStore((state) => state.nodes);
  const hydrateFromDrive = useNotesStore((state) => state.hydrateFromDrive);

  const [state, setState] = useState<SyncState>("idle");
  const [lastSynced, setLastSynced] = useState<string | null>(null);
  const syncingRef = useRef(false);
  const pulledRef = useRef(false);
  const logoutInFlightRef = useRef(false);

  const clearSessionNotes = useCallback(() => {
    if (typeof window !== "undefined") {
      sessionStorage.removeItem(PULLED_KEY);
    }

    pulledRef.current = false;
    syncingRef.current = false;
    setLastSynced(null);
    setState("idle");
    clearLocalNotes();
  }, []);

  const push = useCallback(async () => {
    if (syncingRef.current || logoutInFlightRef.current || !session?.accessToken) {
      return;
    }

    syncingRef.current = true;
    setState("syncing");

    try {
      const response = await fetch("/api/drive/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ editorHTML, nodes }),
      });

      if (!response.ok) {
        setState("error");
        return;
      }

      const data = await response.json();
      setLastSynced(data.updatedAt ?? new Date().toISOString());
      setState("synced");
    } catch {
      setState("error");
    } finally {
      syncingRef.current = false;
    }
  }, [session?.accessToken, editorHTML, nodes]);

  useEffect(() => {
    if (status === "unauthenticated" && logoutInFlightRef.current) {
      clearSessionNotes();
      logoutInFlightRef.current = false;
    }
  }, [status, clearSessionNotes]);

  // Pull Drive once per login session.
  useEffect(() => {
    if (status !== "authenticated") return;
    if (pulledRef.current) return;

    if (typeof window !== "undefined" && sessionStorage.getItem(PULLED_KEY)) {
      pulledRef.current = true;
      setState("synced");
      return;
    }

    pulledRef.current = true;
    setState("syncing");

    fetch("/api/drive/sync", { method: "PUT" })
      .then(async (response) => {
        if (!response.ok) {
          setState("error");
          return;
        }

        const data = await response.json();

        if (
          data.hasDrive &&
          typeof data.editorHTML === "string" &&
          Array.isArray(data.nodes)
        ) {
          hydrateFromDrive({
            editorHTML: data.editorHTML,
            nodes: data.nodes as GraphNode[],
          });
          setLastSynced(data.updatedAt ?? null);
        }

        sessionStorage.setItem(PULLED_KEY, "1");
        setState("synced");
      })
      .catch(() => setState("error"));
  }, [status, hydrateFromDrive]);

  // Debounced auto-push on local edits after the initial pull completes.
  useEffect(() => {
    if (status !== "authenticated") return;
    if (!pulledRef.current) return;

    setState((current) => (current === "synced" ? "idle" : current));

    const timeoutId = setTimeout(() => {
      void push();
    }, 1200);

    return () => clearTimeout(timeoutId);
  }, [editorHTML, nodes, status, push]);

  if (status === "loading") {
    return (
      <div className="flex items-center gap-1 rounded-2xl border-2 border-duo-border bg-white px-3 py-1.5 text-xs font-bold text-gray-400">
        <RefreshCw size={12} className="animate-spin" /> ...
      </div>
    );
  }

  if (status !== "authenticated") {
    return (
      <button
        onClick={() => signIn("google")}
        className="flex items-center gap-1.5 rounded-2xl bg-duo-blue px-3 py-1.5 text-xs font-extrabold uppercase text-white shadow-duoBlue active:translate-y-[1px] active:shadow-none"
        title="Sign in with Google to sync to Drive"
      >
        <LogIn size={14} /> Sign in
      </button>
    );
  }

  const title =
    state === "syncing"
      ? "Syncing with Google Drive..."
      : state === "synced"
        ? `Synced${lastSynced ? " - " + new Date(lastSynced).toLocaleTimeString() : ""}`
        : state === "error"
          ? "Sync failed - click to retry"
          : "Local changes - click to sync";

  const icon =
    state === "syncing" ? (
      <RefreshCw size={14} className="animate-spin" />
    ) : state === "synced" ? (
      <Cloud size={14} />
    ) : (
      <CloudOff size={14} />
    );

  return (
    <div className="flex items-center gap-1.5">
      <button
        onClick={() => void push()}
        disabled={state === "syncing"}
        title={title}
        className={`flex items-center gap-1.5 rounded-2xl border-2 px-3 py-1.5 text-xs font-extrabold uppercase transition-colors ${
          state === "synced"
            ? "border-duo-green bg-duo-green/10 text-duo-greenDark"
            : state === "error"
              ? "border-duo-red/40 bg-duo-red/10 text-duo-red"
              : "border-duo-border bg-white text-duo-ink hover:bg-duo-soft"
        }`}
      >
        {icon}
        <span className="hidden sm:inline">
          {state === "syncing"
            ? "Syncing"
            : state === "synced"
              ? "Synced"
              : state === "error"
                ? "Retry"
                : "Sync"}
        </span>
      </button>
      <button
        onClick={async () => {
          if (logoutInFlightRef.current) return;
          logoutInFlightRef.current = true;

          if (typeof window !== "undefined") {
            sessionStorage.removeItem(PULLED_KEY);
          }

          try {
            await signOut({ redirect: false });
            clearSessionNotes();
            logoutInFlightRef.current = false;
          } catch {
            logoutInFlightRef.current = false;
          }
        }}
        title={session?.user?.email ?? "Sign out"}
        className="flex h-8 w-8 items-center justify-center rounded-xl text-gray-500 hover:bg-duo-soft"
      >
        <LogOut size={14} />
      </button>
    </div>
  );
}
