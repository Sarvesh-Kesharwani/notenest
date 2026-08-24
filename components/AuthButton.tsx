"use client";

import { signIn, signOut, useSession } from "next-auth/react";
import { AlertTriangle, LogIn, LogOut, RefreshCw, UserRound } from "lucide-react";

export default function AuthButton() {
  const { data: session, status } = useSession();

  const handleSignIn = async () => {
    if (window.location.hostname === "127.0.0.1") {
      window.location.href = window.location.href.replace(
        "127.0.0.1",
        "localhost"
      );
      return;
    }

    await fetch("/api/auth/clear-stale", {
      method: "POST",
      cache: "no-store",
    }).catch(() => null);

    await signIn("google");
  };

  if (status === "loading") {
    return (
      <div className="flex h-8 items-center gap-1 rounded-xl border border-duo-border bg-white px-2 text-[11px] font-extrabold uppercase text-gray-400">
        <RefreshCw size={12} className="animate-spin" /> Auth
      </div>
    );
  }

  if (status !== "authenticated") {
    return (
      <button
        onClick={() => void handleSignIn()}
        title="Sign in with Google"
        className="flex h-8 items-center gap-1 rounded-xl bg-duo-blue px-2.5 text-[11px] font-extrabold uppercase text-white shadow-duoBlue active:translate-y-[1px] active:shadow-none"
      >
        <LogIn size={13} /> Sign in
      </button>
    );
  }

  const hasTokenError = session.error === "RefreshAccessTokenError";

  return (
    <div className="flex items-center gap-1">
      <div
        title={hasTokenError ? "Google token refresh failed. Sign in again." : session.user?.email ?? "Signed in"}
        className={`flex h-8 min-w-0 items-center gap-1 rounded-xl border px-2 text-[11px] font-extrabold uppercase ${
          hasTokenError
            ? "border-duo-red/40 bg-duo-red/10 text-duo-red"
            : "border-duo-border bg-white text-duo-ink"
        }`}
      >
        {hasTokenError ? <AlertTriangle size={13} /> : <UserRound size={13} />}
        <span className="hidden max-w-[160px] truncate sm:inline">
          {session.user?.email ?? "Signed in"}
        </span>
      </div>
      <button
        onClick={() => void signOut({ redirect: false })}
        title="Sign out"
        className="flex h-8 w-8 items-center justify-center rounded-xl text-gray-500 hover:bg-duo-soft"
      >
        <LogOut size={13} />
      </button>
    </div>
  );
}
