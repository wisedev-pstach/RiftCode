import hljs from "highlight.js/lib/common";
import powershell from "highlight.js/lib/languages/powershell";

interface DiffRow {
  kind: "header" | "hunk" | "context" | "addition" | "deletion" | "meta";
  content: string;
  highlighted?: string;
  oldHighlighted?: string;
  newHighlighted?: string;
  oldLine?: number;
  newLine?: number;
}

interface HighlightRequest {
  requestId: number;
  rows: DiffRow[];
  languageId: string;
}

hljs.registerLanguage("powershell", powershell);

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

function highlightRows(rows: DiffRow[], languageId: string): DiffRow[] {
  if (!hljs.getLanguage(languageId)) return rows;
  const highlighted = rows.map((row) => ({ ...row }));

  function applyHighlighting(indexes: number[], side: "oldHighlighted" | "newHighlighted"): void {
    if (indexes.length === 0) return;
    try {
      const code = indexes.map((index) => rows[index].content).join("\n");
      const lines = splitHighlightedLines(hljs.highlight(code, { language: languageId, ignoreIllegals: true }).value);
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
    applyHighlighting(indexes.filter((rowIndex) => rows[rowIndex].kind !== "addition"), "oldHighlighted");
    applyHighlighting(indexes.filter((rowIndex) => rows[rowIndex].kind !== "deletion"), "newHighlighted");
    segmentStart = index + 1;
  }

  return highlighted.map((row) => ({
    ...row,
    highlighted: row.kind === "deletion" ? row.oldHighlighted : row.newHighlighted
  }));
}

self.onmessage = ({ data }: MessageEvent<HighlightRequest>) => {
  self.postMessage({ requestId: data.requestId, rows: highlightRows(data.rows, data.languageId) });
};
