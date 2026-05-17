"use client";

import React from "react";

// Try to parse a string as JSON. Returns the pretty-printed string (2-space indent)
// or null if the input isn't valid JSON.
export function tryFormatJson(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const first = trimmed[0];
  if (first !== "{" && first !== "[") return null;
  try {
    const parsed = JSON.parse(trimmed);
    return JSON.stringify(parsed, null, 2);
  } catch {
    return null;
  }
}

const JSON_TOKEN_RE =
  /("(?:[^"\\]|\\.)*"\s*:)|("(?:[^"\\]|\\.)*")|\b(true|false|null)\b|(-?\d+(?:\.\d+)?(?:[eE][+\-]?\d+)?)|([{}\[\],])/g;

// Match the editor's in-document code-block token colors (globals.css).
const COLORS = {
  key: "#d21f87",
  string: "#4a9a00",
  number: "#b7791f",
  bool: "#8750c8",
  null: "#8750c8",
  punct: "#9a948d",
};

export function HighlightJson({ json }: { json: string }) {
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  JSON_TOKEN_RE.lastIndex = 0;
  while ((m = JSON_TOKEN_RE.exec(json)) !== null) {
    if (m.index > lastIndex) parts.push(json.slice(lastIndex, m.index));
    const [full, mKey, mStr, mBool, mNum, mPunct] = m;
    let color = "inherit";
    if (mKey) color = COLORS.key;
    else if (mStr) color = COLORS.string;
    else if (mBool) color = mBool === "null" ? COLORS.null : COLORS.bool;
    else if (mNum) color = COLORS.number;
    else if (mPunct) color = COLORS.punct;

    if (mStr) {
      // Pull any immediately-trailing JSON punctuation (",", "]", "}") into the
      // same inline-block as the string. Without this the comma after a long,
      // wrapped string ends up rendered on its own line below the string box.
      let trailing = "";
      let i = m.index + full.length;
      while (
        i < json.length &&
        (json[i] === "," || json[i] === "]" || json[i] === "}")
      ) {
        trailing += json[i];
        i++;
      }
      parts.push(
        <span
          key={key++}
          style={{
            display: "inline-block",
            maxWidth: "calc(100% - 18ch)",
            whiteSpace: "pre-wrap",
            overflowWrap: "anywhere",
            wordBreak: "normal",
            verticalAlign: "top",
          }}
        >
          <span style={{ color }}>{full}</span>
          {trailing && <span style={{ color: COLORS.punct }}>{trailing}</span>}
        </span>
      );
      lastIndex = i;
      JSON_TOKEN_RE.lastIndex = i;
      continue;
    }

    parts.push(
      <span key={key++} style={{ color }}>
        {full}
      </span>
    );
    lastIndex = m.index + full.length;
  }
  if (lastIndex < json.length) parts.push(json.slice(lastIndex));
  return (
    <pre className="m-0 whitespace-pre-wrap break-words font-mono text-[11px] leading-tight text-duo-ink">
      {parts}
    </pre>
  );
}
