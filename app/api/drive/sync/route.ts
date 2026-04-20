import { auth } from "@/auth";
import { readDriveState, writeDriveState } from "@/lib/drive";

export async function GET() {
  const session = await auth();
  if (!session?.accessToken) {
    return Response.json({ error: "Not signed in" }, { status: 401 });
  }

  try {
    const data = await readDriveState(session.accessToken);
    return Response.json({
      ok: true,
      hasDrive: !!data,
      updatedAt: data?.updatedAt ?? null,
      editorHTML: data?.editorHTML ?? null,
      nodes: data?.nodes ?? null,
    });
  } catch {
    return Response.json({ error: "Failed to read Drive" }, { status: 502 });
  }
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.accessToken) {
    return Response.json({ error: "Not signed in" }, { status: 401 });
  }

  let body: { editorHTML?: string; nodes?: unknown[] } = {};
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid body" }, { status: 400 });
  }

  if (typeof body.editorHTML !== "string" || !Array.isArray(body.nodes)) {
    return Response.json({ error: "Missing editorHTML or nodes" }, { status: 400 });
  }

  try {
    const saved = await writeDriveState(session.accessToken, {
      editorHTML: body.editorHTML,
      nodes: body.nodes,
    });
    return Response.json({ ok: true, updatedAt: saved.updatedAt });
  } catch {
    return Response.json({ error: "Failed to write Drive" }, { status: 502 });
  }
}

export async function PUT() {
  const session = await auth();
  if (!session?.accessToken) {
    return Response.json({ error: "Not signed in" }, { status: 401 });
  }

  try {
    const data = await readDriveState(session.accessToken);
    if (!data) {
      return Response.json({ ok: true, hasDrive: false });
    }
    return Response.json({
      ok: true,
      hasDrive: true,
      updatedAt: data.updatedAt,
      editorHTML: data.editorHTML,
      nodes: data.nodes,
    });
  } catch {
    return Response.json({ error: "Failed to pull Drive" }, { status: 502 });
  }
}
