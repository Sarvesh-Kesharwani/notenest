"use client";

import React from "react";

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

interface ParsedJson {
  formatted: string;
  value: JsonValue;
  isFragment: boolean;
}

// Try to parse a string as JSON. Returns the pretty-printed string (2-space indent)
// or null if the input isn't valid JSON.
export function tryFormatJson(input: string): string | null {
  return parseJsonPreview(input)?.formatted ?? null;
}

export function parseJsonPreview(input: string): ParsedJson | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const first = trimmed[0];

  if (first === "{" || first === "[") {
    return parseAndFormatJson(trimmed, false);
  }

  const looksLikeObjectFragment = /^"[^"\\]*(?:\\.[^"\\]*)*"\s*:/.test(trimmed);
  if (!looksLikeObjectFragment) return null;

  const formatted = parseAndFormatJson(`{${trimmed.replace(/,\s*$/, "")}}`, true);
  if (!formatted) return null;

  return {
    ...formatted,
    formatted: formatted.formatted
      .replace(/^\{\n/, "")
      .replace(/\n\}$/, "")
      .replace(/^  /gm, ""),
  };
}

function parseAndFormatJson(input: string, isFragment: boolean): ParsedJson | null {
  try {
    const value = JSON.parse(input) as JsonValue;
    return {
      formatted: JSON.stringify(value, null, 2),
      value,
      isFragment,
    };
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

export function JsonNodePreview({ value }: { value: JsonValue }) {
  return (
    <div className="space-y-1.5 font-mono text-[11px] leading-tight text-duo-ink">
      <JsonValueBlock value={value} root />
    </div>
  );
}

function JsonValueBlock({
  value,
  root = false,
}: {
  value: JsonValue;
  root?: boolean;
}) {
  if (Array.isArray(value)) {
    if (value.length === 0) return <JsonPrimitive value={value} />;

    return (
      <div className={root ? "space-y-1.5" : "space-y-1"}>
        {!root && <JsonPunct value="[" />}
        {value.map((item, index) => (
          <JsonEntry
            key={index}
            label={`[${index}]`}
            value={item}
            labelColor={COLORS.punct}
          />
        ))}
        {!root && <JsonPunct value="]" />}
      </div>
    );
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value);
    if (entries.length === 0) return <JsonPrimitive value={value} />;

    return (
      <div className={root ? "space-y-1.5" : "space-y-1"}>
        {!root && <JsonPunct value="{" />}
        {entries.map(([key, item]) => (
          <JsonEntry key={key} label={`"${key}":`} value={item} />
        ))}
        {!root && <JsonPunct value="}" />}
      </div>
    );
  }

  return <JsonPrimitive value={value} />;
}

function JsonEntry({
  label,
  value,
  labelColor = COLORS.key,
}: {
  label: string;
  value: JsonValue;
  labelColor?: string;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)] items-start gap-1.5 rounded-lg border border-duo-border/70 bg-white/80 px-2 py-1.5">
      <span
        className="min-w-0 break-words font-extrabold"
        style={{ color: labelColor }}
      >
        {label}
      </span>
      <div className="min-w-0 rounded-md bg-[#f7f6f4] px-1.5 py-1">
        <JsonValueBlock value={value} />
      </div>
    </div>
  );
}

function JsonPrimitive({ value }: { value: JsonValue }) {
  if (typeof value === "string") {
    return (
      <span className="break-words" style={{ color: COLORS.string }}>
        {JSON.stringify(value)}
      </span>
    );
  }

  if (typeof value === "number") {
    return <span style={{ color: COLORS.number }}>{String(value)}</span>;
  }

  if (typeof value === "boolean") {
    return <span style={{ color: COLORS.bool }}>{String(value)}</span>;
  }

  if (value === null) {
    return <span style={{ color: COLORS.null }}>null</span>;
  }

  return <JsonPunct value={Array.isArray(value) ? "[]" : "{}"} />;
}

function JsonPunct({ value }: { value: string }) {
  return <span style={{ color: COLORS.punct }}>{value}</span>;
}
