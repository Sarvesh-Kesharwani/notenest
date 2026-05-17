import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

// Capture groups:
// 1. key       = "...":
// 2. string    = "..."        (value strings, no trailing punct)
// 3. trail     = trailing  ,]} punctuation right after the value string. We
//                emit a SEPARATE decoration covering string+trail with a
//                wrapper class so the trailing punctuation rides inside the
//                same inline-block as its string, instead of dropping onto a
//                new line after the wrapped string. Per-character punct color
//                is preserved via a second decoration over the trail itself.
// 4. bool/null
// 5. number
// 6. standalone punct
const JSON_TOKEN_RE =
  /("(?:[^"\\]|\\.)*"\s*:)|("(?:[^"\\]|\\.)*")([,\]}]*)|\b(true|false|null)\b|(-?\d+(?:\.\d+)?(?:[eE][+\-]?\d+)?)|([{}\[\],])/g;

function classForStandaloneMatch(match: RegExpExecArray): string {
  if (match[1]) return "json-token-key";
  if (match[4]) return match[4] === "null" ? "json-token-null" : "json-token-bool";
  if (match[5]) return "json-token-number";
  return "json-token-punct";
}

export const JsonCodeHighlight = Extension.create({
  name: "jsonCodeHighlight",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("jsonCodeHighlight"),
        props: {
          decorations(state) {
            const decorations: Decoration[] = [];

            state.doc.descendants((node, pos) => {
              if (node.type.name !== "codeBlock") return true;
              const language = node.attrs.language as string | null | undefined;
              if (language && language !== "json") return false;

              const text = node.textContent;
              JSON_TOKEN_RE.lastIndex = 0;
              let match: RegExpExecArray | null;

              while ((match = JSON_TOKEN_RE.exec(text)) !== null) {
                const start = pos + 1 + match.index;
                const end = start + match[0].length;

                if (match[2] !== undefined) {
                  // Value string (group 2) + optional trailing punct (group 3).
                  const trail = match[3] ?? "";
                  const stringLen = match[2].length;
                  const stringEnd = start + stringLen;

                  // Outer wrapper carries the inline-block layout AND the
                  // string color so the comma sits inside the same block.
                  decorations.push(
                    Decoration.inline(start, end, {
                      class: "json-token-string-wrap json-token-string",
                    })
                  );
                  // Re-color the trailing punctuation back to the punct color
                  // (this nested decoration paints over the outer color).
                  if (trail.length > 0) {
                    decorations.push(
                      Decoration.inline(stringEnd, end, {
                        class: "json-token-trail json-token-punct",
                      })
                    );
                  }
                } else {
                  decorations.push(
                    Decoration.inline(start, end, {
                      class: classForStandaloneMatch(match),
                    })
                  );
                }
              }

              return false;
            });

            return DecorationSet.create(state.doc, decorations);
          },
        },
      }),
    ];
  },
});
