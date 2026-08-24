"use client";

import type { StudyTopic } from "./study-store";

export function findTopicForPath(path: string | null | undefined, topics: StudyTopic[]) {
  if (!path) return null;
  const cleanPath = normalize(path.replace(/\.[a-z0-9]+$/i, ""));
  if (!cleanPath) return null;

  return (
    topics
      .filter((topic) => normalize(topic.title))
      .sort((a, b) => normalize(b.title).length - normalize(a.title).length)
      .find((topic) => {
        const title = normalize(topic.title);
        return cleanPath === title || cleanPath.endsWith(title) || cleanPath.includes(title);
      }) ?? null
  );
}

export function normalizeStudyLabel(value: string) {
  return normalize(value);
}

function normalize(value: string) {
  return value
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
