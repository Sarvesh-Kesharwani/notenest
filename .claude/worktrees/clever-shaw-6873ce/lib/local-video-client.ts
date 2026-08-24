"use client";

export interface StoredVideoResult {
  fileName: string;
  originalName: string;
  url: string;
  downloadUrl: string;
  storageDir: string;
}

export function getStoredVideoUrl(fileName: string) {
  return `/api/local-videos?file=${encodeURIComponent(fileName)}`;
}

export function getStoredVideoDownloadUrl(fileName: string) {
  return `/api/local-videos?file=${encodeURIComponent(fileName)}&download=1`;
}

export async function saveVideoFile(file: File): Promise<StoredVideoResult> {
  const formData = new FormData();
  formData.append("file", file, file.name);

  const response = await fetch("/api/local-videos", {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    throw new Error("Failed to save video locally");
  }

  return (await response.json()) as StoredVideoResult;
}

export async function dataUrlToFile(
  dataUrl: string,
  fileName: string,
  fallbackType = "video/webm"
) {
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  return new File([blob], fileName, {
    type: blob.type || fallbackType,
  });
}

export function triggerDownload(url: string, suggestedName?: string) {
  const anchor = document.createElement("a");
  anchor.href = url;
  if (suggestedName) {
    anchor.download = suggestedName;
  }
  anchor.rel = "noopener";
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}
