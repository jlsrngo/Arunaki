const EMOJI_REGEX = /[\u{1F300}-\u{1FAD6}\u{1F900}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}]/gu;

export function extractCanvasTitle(content: string): string {
  const lines = content.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return "Data Table";

  // Check if first non-empty line is a markdown title/heading
  const firstLine = lines[0]
    .replace(/^#+\s*/, "")
    .replace(EMOJI_REGEX, "")
    .replace(/[`*|_]/g, "")
    .trim();
  if (firstLine.length > 0 && !firstLine.startsWith("|") && firstLine.length <= 40) {
    return firstLine;
  }

  // If starts directly with a markdown table row
  if (lines[0].startsWith("|")) {
    const cells = lines[0]
      .split("|")
      .map((c) => c.replace(EMOJI_REGEX, "").trim())
      .filter(Boolean);
    if (cells.length > 0) {
      return `Table: ${cells.slice(0, 2).join(" / ")}`;
    }
    return "Data Table";
  }

  if (firstLine.length > 40) return firstLine.slice(0, 38) + "...";
  return "Data Canvas";
}

export function extractCanvasContent(llmText: string): string {
  if (!llmText) return "";

  // 1. Explicit completed [CANVAS]...[/CANVAS] block
  const completeMatch = llmText.match(/\[CANVAS\]\s*([\s\S]*?)\s*\[\/CANVAS\]/i);
  if (completeMatch?.[1]?.trim() && completeMatch[1].trim().length >= 10) {
    return completeMatch[1].trim();
  }

  // 2. Real-time streaming [CANVAS]... (only when meaningful body has started, at least 15 chars)
  const streamMatch = llmText.match(/\[CANVAS\]\s*([\s\S]*)$/i);
  if (streamMatch?.[1]?.trim() && streamMatch[1].trim().length >= 15) {
    return streamMatch[1].trim();
  }

  // 3. Explicit markdown codeblock tagged with canvas / deliverable / document / table / csv
  const blockMatch = llmText.match(/```(?:canvas|deliverable|document|table|csv)\s*\n([\s\S]*?)\n```/i);
  if (blockMatch?.[1]?.trim() && blockMatch[1].trim().length >= 10) {
    return blockMatch[1].trim();
  }

  // 4. Structured markdown tables in the response (e.g. order lists, tidy tables, recaps)
  const lines = llmText.split(/\r?\n/);
  let firstTableStart = -1;
  let lastTableEnd = -1;

  for (let i = 0; i < lines.length - 1; i++) {
    const l1 = lines[i].trim();
    const l2 = lines[i + 1].trim();
    if (
      l1.startsWith("|") &&
      l1.endsWith("|") &&
      l2.startsWith("|") &&
      l2.endsWith("|") &&
      /^\|[\s\-:]+(\|[\s\-:]+)+\|$/.test(l2)
    ) {
      if (firstTableStart === -1) {
        firstTableStart = i;
        let p = i - 1;
        while (p >= 0 && lines[p].trim() === "") p--;
        if (p >= 0 && lines[p].trim().startsWith("#")) {
          firstTableStart = p;
        }
      }
      let j = i + 2;
      while (j < lines.length && lines[j].trim().startsWith("|") && lines[j].trim().endsWith("|")) {
        j++;
      }
      lastTableEnd = j;
      i = j - 1;
    }
  }

  if (firstTableStart !== -1 && lastTableEnd !== -1) {
    const tableSnippet = lines.slice(firstTableStart, lastTableEnd).join("\n").trim();
    if (tableSnippet.length >= 20) {
      return tableSnippet;
    }
  }

  return "";
}
