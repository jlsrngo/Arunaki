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
 * Line-by-line diff algorithm (LCS-based) for gutter change indicators
 */
export function computeLineDiff(oldText: string, newText: string): DiffLine[] {
  const oldLines = oldText ? oldText.split("\n") : [];
  const newLines = newText ? newText.split("\n") : [];

  const N = oldLines.length;
  const M = newLines.length;

  const L: number[][] = Array.from({ length: N + 1 }, () => new Array(M + 1).fill(0));

  for (let i = 0; i < N; i++) {
    for (let j = 0; j < M; j++) {
      if (oldLines[i] === newLines[j]) {
        L[i + 1][j + 1] = L[i][j] + 1;
      } else {
        L[i + 1][j + 1] = Math.max(L[i + 1][j], L[i][j + 1]);
      }
    }
  }

  let i = N;
  let j = M;
  const result: DiffLine[] = [];

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      result.unshift({
        type: "unchanged",
        oldLineNumber: i,
        newLineNumber: j,
        content: oldLines[i - 1],
      });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || L[i][j - 1] >= L[i - 1][j])) {
      result.unshift({
        type: "added",
        newLineNumber: j,
        content: newLines[j - 1],
      });
      j--;
    } else if (i > 0 && (j === 0 || L[i][j - 1] < L[i - 1][j])) {
      result.unshift({
        type: "deleted",
        oldLineNumber: i,
        content: oldLines[i - 1],
      });
      i--;
    }
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

    // Collect consecutive deleted and added chunks
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
