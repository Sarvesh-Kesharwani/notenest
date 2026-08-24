import { mkdir, copyFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { resolveStoredVideoPath, sanitizeOriginalName } from "@/lib/local-videos";

export const runtime = "nodejs";

const DEFAULT_SPACE_URL = "https://app.youlearn.ai/space/c9241bc0721046c8";

function baseUrl() {
  return (process.env.UPLOADPILOT_BASE_URL || "http://127.0.0.1:3000").replace(/\/+$/, "");
}

function targetFileName(title: string, sourceFileName: string) {
  const ext = path.extname(sourceFileName) || ".mp4";
  const safe = sanitizeOriginalName(title || sourceFileName);
  const parsed = path.parse(safe);
  return `${parsed.name || "video"}${ext}`;
}

export async function POST(req: Request) {
  const body = (await req.json()) as {
    storedFileName?: string;
    title?: string;
    spaceUrl?: string;
  };

  if (!body.storedFileName) {
    return Response.json({ error: "Missing storedFileName" }, { status: 400 });
  }

  const sourcePath = resolveStoredVideoPath(body.storedFileName);
  const stagedDir = path.join(
    process.cwd(),
    "storage",
    "uploadpilot-staging",
    randomUUID()
  );
  const stagedName = targetFileName(body.title?.trim() || body.storedFileName, body.storedFileName);
  const stagedPath = path.join(stagedDir, stagedName);
  const spaceUrl = body.spaceUrl?.trim() || process.env.YOULEARN_SPACE_URL || DEFAULT_SPACE_URL;

  try {
    await mkdir(stagedDir, { recursive: true });
    await copyFile(sourcePath, stagedPath);

    const response = await fetch(`${baseUrl()}/api/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ space_url: spaceUrl, folder: stagedDir }),
      signal: AbortSignal.timeout(10000),
    });
    const data = await response.json();

    if (!response.ok) {
      return Response.json(
        {
          error: data?.detail || data?.error || `UploadPilot returned ${response.status}`,
          stagedDir,
          stagedName,
        },
        { status: response.status }
      );
    }

    return Response.json({
      ok: true,
      stagedDir,
      stagedName,
      spaceUrl,
      state: data.state,
    });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to start UploadPilot upload",
        stagedDir,
        stagedName,
      },
      { status: 502 }
    );
  }
}
