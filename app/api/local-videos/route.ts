import { saveVideoBuffer, readStoredVideo, getStoredVideoDownloadUrl, getStoredVideoUrl, getVideoStorageDir } from "@/lib/local-videos";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const formData = await req.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return Response.json({ error: "Missing video file" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const saved = await saveVideoBuffer({
    buffer,
    originalName: file.name,
    mimeType: file.type,
  });

  return Response.json({
    ok: true,
    fileName: saved.storedFileName,
    originalName: saved.originalName,
    url: getStoredVideoUrl(saved.storedFileName),
    downloadUrl: getStoredVideoDownloadUrl(saved.storedFileName),
    storageDir: getVideoStorageDir(),
  });
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const fileName = searchParams.get("file");

  if (!fileName) {
    return Response.json({ error: "Missing file name" }, { status: 400 });
  }

  try {
    const file = await readStoredVideo(fileName);
    const download = searchParams.get("download") === "1";

    return new Response(file.buffer, {
      headers: {
        "Content-Type": file.contentType,
        "Content-Length": String(file.size),
        "Cache-Control": "no-store",
        "Content-Disposition": download
          ? `attachment; filename="${fileName}"`
          : `inline; filename="${fileName}"`,
      },
    });
  } catch {
    return Response.json({ error: "Video not found" }, { status: 404 });
  }
}
