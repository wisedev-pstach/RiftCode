import hljs from "highlight.js/lib/common";
import powershell from "highlight.js/lib/languages/powershell";
import { createHighlighterCore } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";
import csharp from "shiki/langs/csharp.mjs";
import darkPlus from "shiki/themes/dark-plus.mjs";

interface DiffRow {
  kind: "header" | "hunk" | "context" | "addition" | "deletion" | "meta";
  content: string;
  highlighted?: string;
  oldHighlighted?: string;
  newHighlighted?: string;
  oldLine?: number;
  newLine?: number;
}

interface DiffHighlightRequest {
  type: "diff";
  requestId: number;
  rows: DiffRow[];
  languageId: string;
}

interface SearchHighlightRequest {
  type: "search";
  requestId: number;
  path: string;
  code: string;
  languageId: string;
}

hljs.registerLanguage("powershell", powershell);

const csharpHighlighter = createHighlighterCore({
  themes: [darkPlus],
  langs: [csharp],
  engine: createJavaScriptRegexEngine()
});

function splitHighlightedLines(html: string): string[] {
  const lines: string[] = [];
  const openSpans: string[] = [];
  let current = "";

  for (const token of html.split(/(<span class="[^"]+">|<\/span>|\n)/)) {
    if (token === "\n") {
      current += "</span>".repeat(openSpans.length);
      lines.push(current);
      current = openSpans.join("");
    } else if (token.startsWith("<span ")) {
      openSpans.push(token);
      current += token;
    } else if (token === "</span>") {
      openSpans.pop();
      current += token;
    } else {
      current += token;
    }
  }
  lines.push(current);
  return lines;
}

function escapeHtml(content: string): string {
  return content.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function scopeClass(scopes: string[]): string {
  const scope = scopes.join(" ");
  if (scope.includes("comment")) return "hljs-comment";
  if (scope.includes("string")) return "hljs-string";
  if (scope.includes("entity.name.function")) return "hljs-title function_";
  if (scope.includes("entity.name.type") || scope.includes("entity.name.class") || scope.includes("support.type")) return "hljs-type";
  if (scope.includes("variable.parameter")) return "hljs-params";
  if (scope.includes("constant.numeric")) return "hljs-number";
  if (scope.includes("constant.language")) return "hljs-literal";
  if (scope.includes("keyword") || scope.includes("storage")) return "hljs-keyword";
  if (scope.includes("entity.name.namespace")) return "hljs-title class_";
  if (scope.includes("variable")) return "hljs-variable";
  if (scope.includes("meta")) return "hljs-meta";
  return "";
}

function scopedToken(content: string, scopes: string[], fontStyle: number | undefined): string {
  const classes = [
    scopeClass(scopes),
    fontStyle && (fontStyle & 1) ? "syntax-italic" : "",
    fontStyle && (fontStyle & 2) ? "syntax-bold" : "",
    fontStyle && (fontStyle & 4) ? "syntax-underline" : ""
  ].filter(Boolean).join(" ");
  return classes ? `<span class="${classes}">${escapeHtml(content)}</span>` : escapeHtml(content);
}

async function highlightedLines(code: string, languageId: string): Promise<string[]> {
  if (languageId === "csharp") {
    const highlighter = await csharpHighlighter;
    return highlighter.codeToTokens(code, { lang: "csharp", theme: "dark-plus", includeExplanation: true }).tokens.map((line) => line.map((token) => (
      token.explanation?.map((part) => scopedToken(part.content, part.scopes.map((scope) => scope.scopeName), token.fontStyle)).join("")
      ?? scopedToken(token.content, [], token.fontStyle)
    )).join(""));
  }
  if (!hljs.getLanguage(languageId)) return code.split("\n").map(escapeHtml);
  return splitHighlightedLines(hljs.highlight(code, { language: languageId, ignoreIllegals: true }).value);
}

async function highlightRows(rows: DiffRow[], languageId: string): Promise<DiffRow[]> {
  if (!hljs.getLanguage(languageId)) return rows;
  const highlighted = rows.map((row) => ({ ...row }));

  async function applyHighlighting(indexes: number[], side: "oldHighlighted" | "newHighlighted"): Promise<void> {
    if (indexes.length === 0) return;
    try {
      const code = indexes.map((index) => rows[index].content).join("\n");
      const lines = await highlightedLines(code, languageId);
      indexes.forEach((rowIndex, lineIndex) => {
        highlighted[rowIndex][side] = lines[lineIndex];
      });
    } catch {
      // The renderer keeps displaying the plain rows if highlighting fails.
    }
  }

  let segmentStart = 0;
  for (let index = 0; index <= rows.length; index += 1) {
    if (index < rows.length && rows[index].kind !== "hunk") continue;
    const indexes = Array.from({ length: index - segmentStart }, (_, offset) => segmentStart + offset);
    await Promise.all([
      applyHighlighting(indexes.filter((rowIndex) => rows[rowIndex].kind !== "addition"), "oldHighlighted"),
      applyHighlighting(indexes.filter((rowIndex) => rows[rowIndex].kind !== "deletion"), "newHighlighted")
    ]);
    segmentStart = index + 1;
  }

  return highlighted.map((row) => ({
    ...row,
    highlighted: row.kind === "deletion" ? row.oldHighlighted : row.newHighlighted
  }));
}

self.onmessage = async ({ data }: MessageEvent<DiffHighlightRequest | SearchHighlightRequest>) => {
  if (data.type === "search") {
    const lines = await highlightedLines(data.code, data.languageId);
    self.postMessage({ type: "search", requestId: data.requestId, path: data.path, lines });
    return;
  }
  const rows = await highlightRows(data.rows, data.languageId);
  self.postMessage({ type: "diff", requestId: data.requestId, rows });
};
