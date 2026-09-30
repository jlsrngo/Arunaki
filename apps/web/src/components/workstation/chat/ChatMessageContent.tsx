import { memo, useMemo } from "react";
import Markdown from "react-markdown";
import { FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";
import { cn } from "../../../lib/utils";
import { useI18n } from "../../../lib/i18n";

export interface TableBlock {
  type: "table";
  headers: string[];
  rows: string[][];
}

export interface TextBlock {
  type: "text";
  content: string;
}

export type ContentBlock = TableBlock | TextBlock;

export function parseContentBlocks(rawContent: string): ContentBlock[] {
  const content = rawContent
    .replace(/\[\/?CANVAS\]/gi, "")
    .replace(/<\/?think\??>/gi, "")
    // Remove Hunyuan / open-source XML tool calls & arguments
    .replace(/(?:\[Assistant tool call\]:\s*)?(?:<tool_calls(?::[a-zA-Z0-9_-]+)?>)?(?:<tool_call(?::[a-zA-Z0-9_-]+)?>)?[a-zA-Z0-9_-]+<tool_sep(?::[a-zA-Z0-9_-]+)?>[\s\S]*?<\/tool_call(?::[a-zA-Z0-9_-]+)?>(?:\s*<\/tool_calls(?::[a-zA-Z0-9_-]+)?>)?/gi, "")
    .replace(/<arg_key:[a-zA-Z0-9_-]+>[\s\S]*?<\/arg_key:[a-zA-Z0-9_-]+>/gi, "")
    .replace(/<arg_value:[a-zA-Z0-9_-]+>[\s\S]*?<\/arg_value:[a-zA-Z0-9_-]+>/gi, "")
    .replace(/<\/?(?:tool_call|tool_calls|tool_sep|arg_key|arg_value)(?::[a-zA-Z0-9_-]+)?>/gi, "")
    // Remove pseudo tool calls and compaction transcript leaks
    .replace(/\[Assistant tool call\]:[^\n]*(\n|$)/gi, "")
    .replace(/\[Tool (?:result|error)\]:?[^\n]*(\n|$)/gi, "")
    .replace(/\[Tool result:[^\n]*(\n|$)/gi, "")
    .replace(/\[Assistant\]:\s*/gi, "")
    .replace(/^Wrote file successfully:.*(\n|$)/gmi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!content.includes("|")) {
    return [{ type: "text", content }];
  }

  const lines = content.split("\n");
  const blocks: ContentBlock[] = [];
  let currentTextLines: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i].trim();
    if (line.startsWith("|") && line.endsWith("|") && i + 1 < lines.length) {
      const nextLine = lines[i + 1].trim();
      const isSeparator =
        nextLine.startsWith("|") &&
        nextLine.endsWith("|") &&
        /^\|[\s\-:]+(\|[\s\-:]+)+\|$/.test(nextLine);

      if (isSeparator) {
        if (currentTextLines.length > 0) {
          const text = currentTextLines.join("\n").trim();
          if (text) blocks.push({ type: "text", content: text });
          currentTextLines = [];
        }

        const headers = line
          .slice(1, -1)
          .split("|")
          .map((h) => h.trim());

        i += 2;
        const rows: string[][] = [];

        while (
          i < lines.length &&
          lines[i].trim().startsWith("|") &&
          lines[i].trim().endsWith("|")
        ) {
          const rowLine = lines[i].trim();
          const cells = rowLine
            .slice(1, -1)
            .split("|")
            .map((c) => c.trim());
          rows.push(cells);
          i++;
        }

        blocks.push({ type: "table", headers, rows });
        continue;
      }
    }

    currentTextLines.push(lines[i]);
    i++;
  }

  if (currentTextLines.length > 0) {
    const remainingText = currentTextLines.join("\n").trim();
    if (remainingText) {
      blocks.push({ type: "text", content: remainingText });
    }
  }

  return blocks.length > 0 ? blocks : [{ type: "text", content }];
}

const MARKDOWN_COMPONENTS = {
  p: ({ children }: any) => (
    <p className="mb-2 last:mb-0 leading-relaxed whitespace-pre-wrap break-words [word-break:break-word] [overflow-wrap:anywhere]">
      {children}
    </p>
  ),
  hr: () => <hr className="my-2.5 border-t border-[var(--border-color)] w-full" />,
  strong: ({ children }: any) => (
    <strong className="font-semibold text-[var(--text-primary)]">{children}</strong>
  ),
  ul: ({ children }: any) => (
    <ul className="list-disc ml-4 my-1 space-y-1 break-words [word-break:break-word]">
      {children}
    </ul>
  ),
  ol: ({ children }: any) => (
    <ol className="list-decimal ml-4 my-1 space-y-1 break-words [word-break:break-word]">
      {children}
    </ol>
  ),
  li: ({ children }: any) => (
    <li className="leading-snug break-words [word-break:break-word]">{children}</li>
  ),
  code: ({ children }: any) => (
    <code className="bg-[var(--bg-panel)] text-[var(--text-primary)] px-1.5 py-0.5 rounded font-mono text-[11px] border border-[var(--border-color)] break-words [word-break:break-word]">
      {children}
    </code>
  ),
  pre: ({ children }: any) => (
    <pre className="bg-[var(--bg-panel)] p-2.5 rounded-lg overflow-x-auto max-w-full my-2 font-mono text-[11px] border border-[var(--border-color)] text-[var(--text-primary)]">
      {children}
    </pre>
  ),
};

const CELL_MARKDOWN_COMPONENTS = {
  p: ({ children }: any) => <>{children}</>,
  strong: ({ children }: any) => (
    <strong className="font-semibold text-[var(--text-primary)]">
      {children}
    </strong>
  ),
  code: ({ children }: any) => (
    <code className="bg-[var(--bg-panel)] text-[var(--text-primary)] px-1.5 py-0.5 rounded font-mono text-[11px] border border-[var(--border-color)] break-words [word-break:break-word]">
      {children}
    </code>
  ),
};

function renderMarkdownCell(text: string) {
  // Fast path: plain text without markdown syntax skips mounting React-Markdown completely
  if (!text.includes("*") && !text.includes("`") && !text.includes("_") && !text.includes("[")) {
    return text;
  }
  return <Markdown components={CELL_MARKDOWN_COMPONENTS}>{text}</Markdown>;
}

export const ChatMessageContent = memo(function ChatMessageContent({
  content,
}: {
  content: string;
  isUser?: boolean;
}) {
  const { t } = useI18n();
  const blocks = useMemo(() => parseContentBlocks(content), [content]);

  return (
    <div className="space-y-2 font-sans min-w-0 max-w-full break-words [word-break:break-word] [overflow-wrap:anywhere]">
      {blocks.map((block, bIdx) => {
        if (block.type === "table") {
          return (
            <div
              key={bIdx}
              className="my-2 max-w-full overflow-hidden rounded-xl border border-[var(--border-strong)] bg-[var(--bg-panel)] select-text shadow-xs"
            >
              <div className="flex items-center justify-between px-3 py-1.5 bg-[var(--bg-panel-sub)] border-b border-[var(--border-color)] text-[11px] text-[var(--text-muted)] select-none">
                <span className="font-medium text-[11px] text-[var(--text-secondary)]">
                  {t("dataTableLabel", "Data Table")} ({block.rows.length} {t("rowsLabel", "rows")})
                </span>
                <button
                  type="button"
                  onClick={() => {
                    const fullTableMd = [
                      `| ${block.headers.join(" | ")} |`,
                      `| ${block.headers.map(() => "---").join(" | ")} |`,
                      ...block.rows.map((r) => `| ${r.join(" | ")} |`),
                    ].join("\n");
                    window.dispatchEvent(
                      new CustomEvent("arunaki-open-canvas", {
                        detail: { content: fullTableMd },
                      })
                    );
                    toast.success(t("tableOpenedInCanvas", "Table opened in Canvas panel"));
                  }}
                  className="flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] border border-[var(--border-color)] transition-colors cursor-pointer"
                  title={t("openInCanvasTooltip", "Open this table in Center Canvas Panel")}
                >
                  <FileSpreadsheet className="w-3 h-3 text-emerald-400" />
                  <span>{t("openInCanvas", "Open in Canvas")}</span>
                </button>
              </div>
              <div className="overflow-x-auto no-scrollbar max-w-full">
                <table className="w-full text-left border-collapse font-sans text-xs">
                  <thead>
                    <tr className="bg-[var(--bg-panel-sub)] border-b border-[var(--border-color)]">
                      {block.headers.map((h, hIdx) => (
                        <th
                          key={hIdx}
                          className="px-3 py-2 font-semibold text-[var(--text-primary)] border-r last:border-r-0 border-[var(--border-color)] text-[11px] tracking-wide whitespace-nowrap"
                        >
                          {renderMarkdownCell(h)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-color)]">
                    {block.rows.map((row, rIdx) => {
                      const isTotal = row.some((c) => c.toLowerCase().includes("total"));
                      return (
                        <tr
                          key={rIdx}
                          className={cn(
                            "transition-colors",
                            isTotal
                              ? "bg-[var(--bg-card)] font-semibold text-[var(--text-primary)]"
                              : "hover:bg-[var(--bg-hover)] text-[var(--text-secondary)]"
                          )}
                        >
                          {row.map((cell, cIdx) => (
                            <td
                              key={cIdx}
                              className="px-3 py-1.5 border-r last:border-r-0 border-[var(--border-color)] text-xs font-normal"
                            >
                              {renderMarkdownCell(cell)}
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          );
        }

        return (
          <Markdown key={bIdx} components={MARKDOWN_COMPONENTS}>
            {block.content}
          </Markdown>
        );
      })}
    </div>
  );
});
