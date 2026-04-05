/**
 * Shared diff computation utilities used by both DiffViewer and
 * EditPermissionPrompt (ask-before-edits review UI).
 */
import { diffLines, diffWords } from "diff";

// ── Types ──

export interface DiffLine {
  type: "added" | "removed" | "context";
  content: string;
  lineNum?: number;
  highlights?: WordHighlight[];
}

export interface CollapsedLine {
  type: "collapsed";
  count: number;
}

export type DisplayLine = DiffLine | CollapsedLine;

export interface WordHighlight {
  value: string;
  type: "added" | "removed" | "unchanged";
}

export interface DiffStats {
  added: number;
  removed: number;
}

export interface DiffHunk {
  startIdx: number;
  lines: DiffLine[];
  id: number;
}

// ── Core helpers ──

export function splitLines(value: string): string[] {
  const lines = value.split("\n");
  if (lines.length > 0 && lines[lines.length - 1] === "") {
    lines.pop();
  }
  return lines;
}

export function computeWordHighlights(
  oldLine: string,
  newLine: string,
): { removed: WordHighlight[]; added: WordHighlight[] } {
  const diffs = diffWords(oldLine, newLine);
  const removed: WordHighlight[] = [];
  const added: WordHighlight[] = [];

  for (const d of diffs) {
    if (d.removed) {
      removed.push({ value: d.value, type: "removed" });
    } else if (d.added) {
      added.push({ value: d.value, type: "added" });
    } else {
      removed.push({ value: d.value, type: "unchanged" });
      added.push({ value: d.value, type: "unchanged" });
    }
  }

  return { removed, added };
}

export function computeDiffLines(
  oldStr: string,
  newStr: string,
): { allLines: DiffLine[]; stats: DiffStats } {
  const changes = diffLines(oldStr, newStr);
  const result: DiffLine[] = [];
  let oldNum = 1;
  let newNum = 1;
  let added = 0;
  let removed = 0;

  for (let i = 0; i < changes.length; i++) {
    const change = changes[i];
    const changeLines = splitLines(change.value);

    if (change.removed) {
      removed += changeLines.length;

      const nextChange = changes[i + 1];
      const hasMatchingAdd = nextChange?.added === true;
      const addedLines = hasMatchingAdd ? splitLines(nextChange.value) : [];
      const maxPaired = Math.min(changeLines.length, addedLines.length);

      for (let j = 0; j < changeLines.length; j++) {
        const wordDiffs =
          j < maxPaired
            ? computeWordHighlights(changeLines[j], addedLines[j])
            : undefined;
        result.push({
          type: "removed",
          content: changeLines[j],
          lineNum: oldNum++,
          highlights: wordDiffs?.removed,
        });
      }

      if (hasMatchingAdd) {
        added += addedLines.length;
        for (let j = 0; j < addedLines.length; j++) {
          const wordDiffs =
            j < maxPaired
              ? computeWordHighlights(changeLines[j], addedLines[j])
              : undefined;
          result.push({
            type: "added",
            content: addedLines[j],
            lineNum: newNum++,
            highlights: wordDiffs?.added,
          });
        }
        i++;
      }
    } else if (change.added) {
      added += changeLines.length;
      for (const line of changeLines) {
        result.push({ type: "added", content: line, lineNum: newNum++ });
      }
    } else {
      for (const line of changeLines) {
        result.push({ type: "context", content: line, lineNum: newNum++ });
        oldNum++;
      }
    }
  }

  return { allLines: result, stats: { added, removed } };
}

export function computeFullFileDiff(
  fileContent: string,
  oldStr: string,
  newStr: string,
): { allLines: DiffLine[]; stats: DiffStats } {

  const idx = fileContent.indexOf(newStr);
  if (idx !== -1) {
    const oldFileContent =
      fileContent.slice(0, idx) + oldStr + fileContent.slice(idx + newStr.length);
    return computeDiffLines(oldFileContent, fileContent);
  }

  const oldIdx = fileContent.indexOf(oldStr);
  if (oldIdx !== -1) {
    const newFileContent =
      fileContent.slice(0, oldIdx) +
      newStr +
      fileContent.slice(oldIdx + oldStr.length);
    return computeDiffLines(fileContent, newFileContent);
  }

  return computeDiffLines(oldStr, newStr);
}

export function collapseContext(
  lines: DiffLine[],
  keep: number,
  expanded: Set<number>,
): DisplayLine[] {
  const result: DisplayLine[] = [];
  let contextRun: DiffLine[] = [];
  let contextStartIdx = result.length;

  const flushContext = () => {
    const insertIdx = contextStartIdx;
    if (contextRun.length <= keep * 2 + 2 || expanded.has(insertIdx + keep)) {
      result.push(...contextRun);
    } else {
      result.push(...contextRun.slice(0, keep));
      result.push({ type: "collapsed", count: contextRun.length - keep * 2 });
      result.push(...contextRun.slice(-keep));
    }
    contextRun = [];
  };

  for (const line of lines) {
    if (line.type === "context") {
      if (contextRun.length === 0) contextStartIdx = result.length;
      contextRun.push(line);
    } else {
      if (contextRun.length > 0) flushContext();
      result.push(line);
    }
  }
  if (contextRun.length > 0) flushContext();

  return result;
}

/**
 * Split a flat list of DiffLines into contiguous groups of changed lines
 * Each hunk is bordered by context lines.
 * Context lines themselves are NOT included in hunks — they are used only
 * to locate boundaries.
 *
 * Returns an array of hunks where each hunk holds a slice of DiffLines that
 * are "added" or "removed" (plus the immediately adjacent context lines needed
 * to reconstruct an edit).
 */
export function groupIntoHunks(allLines: DiffLine[]): DiffHunk[] {
  const hunks: DiffHunk[] = [];
  let id = 0;
  let i = 0;

  while (i < allLines.length) {
    if (allLines[i].type !== "context") {
      const start = i;
      while (i < allLines.length && allLines[i].type !== "context") {
        i++;
      }
      hunks.push({ startIdx: start, lines: allLines.slice(start, i), id: id++ });
    } else {
      i++;
    }
  }

  return hunks;
}

/**
 * Given the original old_string, new_string and a set of approved hunk ids,
 * rebuild a new_string-like string that applies only the approved hunks.
 *
 * For rejected hunks, the old lines are kept in place.
 * For approved hunks, the new lines are used.
 *
 * Returns null if reconstruction is not possible (fall back to full allow/deny).
 */
export function applySelectedHunks(
  oldStr: string,
  newStr: string,
  hunks: DiffHunk[],
  approvedIds: Set<number>,
): string | null {
  if (hunks.length === 0) return newStr;

  if (approvedIds.size === hunks.length) return newStr;

  if (approvedIds.size === 0) return oldStr;

  const { allLines } = computeDiffLines(oldStr, newStr);
  const result: string[] = [];

  const lineToHunk = new Map<number, DiffHunk>();
  for (const hunk of hunks) {
    for (let i = hunk.startIdx; i < hunk.startIdx + hunk.lines.length; i++) {
      lineToHunk.set(i, hunk);
    }
  }

  for (let i = 0; i < allLines.length; i++) {
    const line = allLines[i];
    const hunk = lineToHunk.get(i);

    if (line.type === "context") {
      result.push(line.content);
    } else if (hunk && approvedIds.has(hunk.id)) {
      if (line.type === "added") result.push(line.content);
    } else {
      if (line.type === "removed") result.push(line.content);
    }
  }

  return result.join("\n") + (newStr.endsWith("\n") ? "\n" : "");
}
