import { NextResponse } from "next/server";

export const runtime = "nodejs";

const AUTH_COOKIE_NAMES = [
  "authjs.csrf-token",
  "authjs.callback-url",
  "authjs.session-token",
  "authjs.pkce.code_verifier",
  "authjs.state",
  "authjs.nonce",
  "__Host-authjs.csrf-token",
  "__Secure-authjs.callback-url",
  "__Secure-authjs.session-token",
  "__Secure-authjs.pkce.code_verifier",
  "__Secure-authjs.state",
  "__Secure-authjs.nonce",
];

export async function POST() {
  const response = NextResponse.json({ ok: true });

  for (const name of AUTH_COOKIE_NAMES.flatMap((cookieName) => [
    cookieName,
    `${cookieName}.0`,
    `${cookieName}.1`,
  ])) {
    response.cookies.set(name, "", {
      httpOnly: true,
      maxAge: 0,
      path: "/",
      sameSite: "lax",
    });
  }

  return response;
}
