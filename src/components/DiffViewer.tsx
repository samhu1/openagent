import { useMemo, useState, useEffect, useCallback } from "react";
import { Copy, Check, ChevronDown } from "lucide-react";
import { OpenInEditorButton } from "./OpenInEditorButton";
import {
  computeDiffLines,
  computeFullFileDiff,
  collapseContext,
  type DiffLine,
} from "@/lib/diff-utils";

// ── Types ──

interface DiffViewerProps {
  oldString: string;
  newString: string;
  filePath: string;
}

const CONTEXT_LINES = 3;

// ── Main component ──

export function DiffViewer({ oldString, newString, filePath }: DiffViewerProps) {
  const [fullFileContent, setFullFileContent] = useState<string | null>(null);
  const [expandedSections, setExpandedSections] = useState<Set<number>>(new Set());
  const [copied, setCopied] = useState(false);

  const fileName = filePath.split("/").pop() ?? filePath;

  // Auto-load full file on mount
  useEffect(() => {
    let cancelled = false;
    window.clientCore
      .readFile(filePath)
      .then((result) => {
        if (!cancelled && result.content != null) {
          setFullFileContent(result.content);
        }
      })
      .catch(() => {
        // File not readable — stay with change-only diff
      });
    return () => {
      cancelled = true;
    };
  }, [filePath]);

  // Compute raw diff lines
  const { allLines, stats } = useMemo(() => {
    if (fullFileContent !== null) {
      return computeFullFileDiff(fullFileContent, oldString, newString);
    }
    return computeDiffLines(oldString, newString);
  }, [oldString, newString, fullFileContent]);

  // Collapse context runs (respecting expanded sections)
  const displayLines = useMemo(
    () => collapseContext(allLines, CONTEXT_LINES, expandedSections),
    [allLines, expandedSections],
  );

  const expandSection = useCallback((sectionIdx: number) => {
    setExpandedSections((prev) => new Set(prev).add(sectionIdx));
  }, []);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(newString);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [newString]);

  return (
    <div className="rounded-lg border border-border/50 overflow-hidden font-mono text-[12px] leading-[1.55] bg-black/20">
      {/* Header */}
      <div className="group/diff flex items-center gap-3 px-3 py-1.5 bg-foreground/[0.04] border-b border-border/40">
        <span className="text-foreground/80 truncate flex-1">{fileName}</span>
        <OpenInEditorButton filePath={filePath} className="group-hover/diff:text-foreground/25" />

        <div className="flex items-center gap-1.5 text-[11px] shrink-0 tabular-nums">
          {stats.added > 0 && (
            <span className="text-emerald-400">+{stats.added}</span>
          )}
          {stats.removed > 0 && (
            <span className="text-red-400">-{stats.removed}</span>
          )}
        </div>

        <button
          onClick={handleCopy}
          className="flex items-center justify-center h-6 w-6 rounded text-muted-foreground/50 hover:text-muted-foreground/80 hover:bg-accent/30 transition-colors shrink-0"
          title="Copy new content"
        >
          {copied ? (
            <Check className="h-3.5 w-3.5 text-emerald-400" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
        </button>
      </div>

      {/* Diff body */}
      <div className="overflow-auto max-h-[28rem]">
        {displayLines.map((line, i) =>
          line.type === "collapsed" ? (
            <CollapsedRow
              key={`col-${i}`}
              count={line.count}
              onExpand={() => expandSection(i)}
            />
          ) : (
            <DiffLineRow key={i} line={line} />
          ),
        )}
      </div>
    </div>
  );
}

// ── Diff line row ──

function DiffLineRow({ line }: { line: DiffLine }) {
  // Left accent: thin colored border on changed lines
  const accentClass =
    line.type === "removed"
      ? "border-s-2 border-s-red-500/70"
      : line.type === "added"
        ? "border-s-2 border-s-emerald-500/70"
        : "border-s-2 border-s-transparent";

  const bgClass =
    line.type === "removed"
      ? "bg-red-500/[0.12]"
      : line.type === "added"
        ? "bg-emerald-500/[0.14]"
        : "";

  const numClass =
    line.type === "removed"
      ? "text-red-400/50"
      : line.type === "added"
        ? "text-emerald-400/50"
        : "text-muted-foreground/35";

  const contentClass =
    line.type === "removed"
      ? "text-foreground/70"
      : line.type === "added"
        ? "text-foreground/85"
        : "text-foreground/60";

  return (
    <div className={`flex ${accentClass} ${bgClass}`}>
      {/* Line number */}
      <span
        className={`w-10 shrink-0 text-right pe-3 py-px select-none ${numClass}`}
      >
        {line.lineNum ?? ""}
      </span>
      {/* Content */}
      <span
        className={`flex-1 px-3 py-px whitespace-pre-wrap wrap-break-word ${contentClass}`}
      >
        {line.highlights ? (
          line.highlights.map((part, j) => (
            <span
              key={j}
              className={
                part.type === "removed"
                  ? "bg-red-400/30 rounded-[2px]"
                  : part.type === "added"
                    ? "bg-emerald-400/30 rounded-[2px]"
                    : ""
              }
            >
              {part.value}
            </span>
          ))
        ) : (
          line.content || " "
        )}
      </span>
    </div>
  );
}

// ── Collapsed context ──

function CollapsedRow({
  count,
  onExpand,
}: {
  count: number;
  onExpand: () => void;
}) {
  return (
    <button
      onClick={onExpand}
      className="flex w-full items-center justify-center gap-1 py-0.5 bg-foreground/[0.02] hover:bg-foreground/[0.05] transition-colors text-[10px] text-foreground/30 hover:text-foreground/50 border-s-2 border-s-transparent"
    >
      <ChevronDown className="h-2.5 w-2.5" />
      <span>
        {count} unchanged line{count !== 1 ? "s" : ""}
      </span>
    </button>
  );
}
