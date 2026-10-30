import { apiFetch } from "../../../lib/api";

export interface DiffLine {
  type: "unchanged" | "added" | "deleted";
  oldLineNumber?: number;
  newLineNumber?: number;
  content: string;
}

export interface SideBySideDiffCell {
  lineNumber?: number;
  content: string;
  type: "unchanged" | "added" | "deleted" | "empty";
}

export interface SideBySideDiffRow {
  id: string;
  left: SideBySideDiffCell;
  right: SideBySideDiffCell;
}

/**
 * Calls the native Rust `engine::diff` endpoint (`POST /api/desktop/line-diff`)
 * so large document diffs run off the WebView2 UI thread. Falls back to local LCS if offline.
 */
export async function computeLineDiffRust(
  oldText: string,
  newText: string
): Promise<{
  diffLines: DiffLine[];
  addedCount: number;
  deletedCount: number;
}> {
  try {
    const res = await apiFetch("/api/desktop/line-diff", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ oldText, newText }),
    });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data?.diffLines)) {
        return {
          diffLines: data.diffLines,
          addedCount: typeof data.addedCount === "number" ? data.addedCount : 0,
          deletedCount: typeof data.deletedCount === "number" ? data.deletedCount : 0,
        };
      }
    }
  } catch {
    // Fallback to synchronous LCS below
  }

  const diffLines = computeLineDiff(oldText, newText);
  return {
    diffLines,
    addedCount: diffLines.filter((l) => l.type === "added").length,
    deletedCount: diffLines.filter((l) => l.type === "deleted").length,
  };
}

/**
 * Synchronous LCS line-diff fallback with prefix/suffix trimming.
 */
export function computeLineDiff(oldText: string, newText: string): DiffLine[] {
  const oldLines = oldText ? oldText.split("\n") : [];
  const newLines = newText ? newText.split("\n") : [];

  const N = oldLines.length;
  const M = newLines.length;

  let prefixLen = 0;
  while (prefixLen < N && prefixLen < M && oldLines[prefixLen] === newLines[prefixLen]) {
    prefixLen++;
  }

  let suffixLen = 0;
  while (
    suffixLen < N - prefixLen &&
    suffixLen < M - prefixLen &&
    oldLines[N - 1 - suffixLen] === newLines[M - 1 - suffixLen]
  ) {
    suffixLen++;
  }

  const result: DiffLine[] = [];

  for (let idx = 0; idx < prefixLen; idx++) {
    result.push({
      type: "unchanged",
      oldLineNumber: idx + 1,
      newLineNumber: idx + 1,
      content: oldLines[idx],
    });
  }

  const oldMid = oldLines.slice(prefixLen, N - suffixLen);
  const newMid = newLines.slice(prefixLen, M - suffixLen);
  const midN = oldMid.length;
  const midM = newMid.length;

  if (midN > 0 || midM > 0) {
    const L: number[][] = Array.from({ length: midN + 1 }, () => new Array(midM + 1).fill(0));

    for (let i = 0; i < midN; i++) {
      for (let j = 0; j < midM; j++) {
        if (oldMid[i] === newMid[j]) {
          L[i + 1][j + 1] = L[i][j] + 1;
        } else {
          L[i + 1][j + 1] = Math.max(L[i + 1][j], L[i][j + 1]);
        }
      }
    }

    let i = midN;
    let j = midM;
    const midResult: DiffLine[] = [];

    while (i > 0 || j > 0) {
      if (i > 0 && j > 0 && oldMid[i - 1] === newMid[j - 1]) {
        midResult.unshift({
          type: "unchanged",
          oldLineNumber: prefixLen + i,
          newLineNumber: prefixLen + j,
          content: oldMid[i - 1],
        });
        i--;
        j--;
      } else if (j > 0 && (i === 0 || L[i][j - 1] >= L[i - 1][j])) {
        midResult.unshift({
          type: "added",
          newLineNumber: prefixLen + j,
          content: newMid[j - 1],
        });
        j--;
      } else {
        midResult.unshift({
          type: "deleted",
          oldLineNumber: prefixLen + i,
          content: oldMid[i - 1],
        });
        i--;
      }
    }

    result.push(...midResult);
  }

  for (let offset = 0; offset < suffixLen; offset++) {
    const oldIdx = N - suffixLen + offset;
    const newIdx = M - suffixLen + offset;
    result.push({
      type: "unchanged",
      oldLineNumber: oldIdx + 1,
      newLineNumber: newIdx + 1,
      content: oldLines[oldIdx],
    });
  }

  return result;
}

/**
 * Computes paired side-by-side rows (Left: Before, Right: After) for visual split comparison
 */
export function computeSideBySideDiff(oldText: string, newText: string): SideBySideDiffRow[] {
  const lines = computeLineDiff(oldText, newText);
  const rows: SideBySideDiffRow[] = [];
  let rowIdx = 0;

  let k = 0;
  while (k < lines.length) {
    const cur = lines[k];

    if (cur.type === "unchanged") {
      rows.push({
        id: `row-${rowIdx++}`,
        left: {
          lineNumber: cur.oldLineNumber,
          content: cur.content,
          type: "unchanged",
        },
        right: {
          lineNumber: cur.newLineNumber,
          content: cur.content,
          type: "unchanged",
        },
      });
      k++;
      continue;
    }

    const deletedChunk: DiffLine[] = [];
    const addedChunk: DiffLine[] = [];

    while (k < lines.length && lines[k].type === "deleted") {
      deletedChunk.push(lines[k]);
      k++;
    }
    while (k < lines.length && lines[k].type === "added") {
      addedChunk.push(lines[k]);
      k++;
    }

    const maxLen = Math.max(deletedChunk.length, addedChunk.length);
    for (let m = 0; m < maxLen; m++) {
      const delLine = deletedChunk[m];
      const addLine = addedChunk[m];

      rows.push({
        id: `row-${rowIdx++}`,
        left: delLine
          ? {
              lineNumber: delLine.oldLineNumber,
              content: delLine.content,
              type: "deleted",
            }
          : {
              content: "",
              type: "empty",
            },
        right: addLine
          ? {
              lineNumber: addLine.newLineNumber,
              content: addLine.content,
              type: "added",
            }
          : {
              content: "",
              type: "empty",
            },
      });
    }
  }

  return rows;
}
