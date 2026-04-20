import { randomUUID } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const VIDEO_DIR = path.join(process.cwd(), "storage", "videos");

const MIME_BY_EXT: Record<string, string> = {
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".m4v": "video/x-m4v",
  ".webm": "video/webm",
  ".ogg": "video/ogg",
  ".ogv": "video/ogg",
  ".avi": "video/x-msvideo",
  ".mkv": "video/x-matroska",
};

const EXT_BY_MIME: Record<string, string> = {
  "video/mp4": ".mp4",
  "video/quicktime": ".mov",
  "video/x-m4v": ".m4v",
  "video/webm": ".webm",
  "video/ogg": ".ogv",
  "video/x-msvideo": ".avi",
  "video/x-matroska": ".mkv",
};

export function getVideoStorageDir() {
  return VIDEO_DIR;
}

export async function ensureVideoStorageDir() {
  await mkdir(VIDEO_DIR, { recursive: true });
  return VIDEO_DIR;
}

export function getStoredVideoUrl(fileName: string) {
  return `/api/local-videos?file=${encodeURIComponent(fileName)}`;
}

export function getStoredVideoDownloadUrl(fileName: string) {
  return `/api/local-videos?file=${encodeURIComponent(fileName)}&download=1`;
}

export function sanitizeOriginalName(fileName: string) {
  const parsed = path.parse(fileName);
  const safeBase = parsed.name
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  const safeExt = parsed.ext.toLowerCase().replace(/[^a-z0-9.]+/g, "");
  return `${safeBase || "video"}${safeExt}`;
}

export function inferVideoExtension(
  fileName: string | undefined,
  mimeType: string | undefined
) {
  const extFromName = fileName ? path.extname(fileName).toLowerCase() : "";
  if (extFromName) return extFromName;
  if (mimeType && EXT_BY_MIME[mimeType]) return EXT_BY_MIME[mimeType];
  return ".webm";
}

export async function saveVideoBuffer(options: {
  buffer: Buffer;
  originalName?: string;
  mimeType?: string;
}) {
  await ensureVideoStorageDir();

  const sanitizedName = sanitizeOriginalName(options.originalName ?? "video");
  const ext = inferVideoExtension(sanitizedName, options.mimeType);
  const stem = path.basename(sanitizedName, path.extname(sanitizedName));
  const storedFileName = `${Date.now()}-${stem}-${randomUUID()}${ext}`;
  const absolutePath = path.join(VIDEO_DIR, storedFileName);

  await writeFile(absolutePath, options.buffer);

  return {
    storedFileName,
    absolutePath,
    originalName: sanitizedName,
    contentType: getVideoContentType(storedFileName, options.mimeType),
  };
}

export function resolveStoredVideoPath(fileName: string) {
  const baseName = path.basename(fileName);
  if (!baseName || baseName !== fileName) {
    throw new Error("Invalid video file");
  }
  return path.join(VIDEO_DIR, baseName);
}

export async function readStoredVideo(fileName: string) {
  const absolutePath = resolveStoredVideoPath(fileName);
  const [buffer, fileStat] = await Promise.all([
    readFile(absolutePath),
    stat(absolutePath),
  ]);

  return {
    buffer,
    size: fileStat.size,
    contentType: getVideoContentType(fileName),
  };
}

export function getVideoContentType(
  fileName: string,
  fallback?: string | undefined
) {
  const ext = path.extname(fileName).toLowerCase();
  return MIME_BY_EXT[ext] ?? fallback ?? "application/octet-stream";
}
