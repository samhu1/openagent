/**
 * Features:
 *  - Shows a structured diff of old_string to new_string
 *  - Each diff hunk has an individual approve/reject toggle
 *  - "Allow All" fast path acts exactly like the previous all-or-nothing prompt
 *  - "Apply Selected" sends back a reconstructed new_string with only approved hunks
 *  - "Deny" rejects the whole edit
 */

import { useState, useMemo, useCallback } from "react";
import { Check, X, ChevronDown, CheckSquare, Square, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { OpenInEditorButton } from "@/components/OpenInEditorButton";
import type { PermissionRequest } from "@/types";
import {
  computeDiffLines,
  collapseContext,
  groupIntoHunks,
  applySelectedHunks,
  type DiffLine,
  type DiffHunk,
  type DisplayLine,
} from "@/lib/diff-utils";

const CONTEXT_LINES = 3;

// ── Types ──

interface EditPermissionPromptProps {
  request: PermissionRequest;
  onRespond: (
    behavior: "allow" | "deny",
    updatedInput?: Record<string, unknown>,
    newPermissionMode?: string,
  ) => void;
}

// ── Main component ──

export function EditPermissionPrompt({ request, onRespond }: EditPermissionPromptProps) {
  const filePath = String(request.toolInput.file_path ?? "");
  const oldStr = String(request.toolInput.old_string ?? "");
  const newStr = String(request.toolInput.new_string ?? "");

  // Compute diff once
  const { allLines, stats } = useMemo(
    () => computeDiffLines(oldStr, newStr),
    [oldStr, newStr],
  );

  // Group into hunks
  const hunks = useMemo(() => groupIntoHunks(allLines), [allLines]);

  // All hunks approved by default (mirrors Allow All semantics)
  const [approvedIds, setApprovedIds] = useState<Set<number>>(
    () => new Set(hunks.map((h) => h.id)),
  );

  const [expandedSections, setExpandedSections] = useState<Set<number>>(new Set());

  // Collapsed display lines
  const displayLines = useMemo(
    () => collapseContext(allLines, CONTEXT_LINES, expandedSections),
    [allLines, expandedSections],
  );

  const expandSection = useCallback((idx: number) => {
    setExpandedSections((prev) => new Set(prev).add(idx));
  }, []);

  const toggleHunk = useCallback((id: number) => {
    setApprovedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    setApprovedIds((prev) =>
      prev.size === hunks.length
        ? new Set()
        : new Set(hunks.map((h) => h.id)),
    );
  }, [hunks]);

  // Fast path — approve the whole edit exactly as before
  const handleAllowAll = useCallback(() => {
    onRespond("allow");
  }, [onRespond]);

  // Partial path — rebuild new_string with only approved hunks
  const handleApplySelected = useCallback(() => {
    if (approvedIds.size === 0) {
      onRespond("deny");
      return;
    }
    const partialNew = applySelectedHunks(oldStr, newStr, hunks, approvedIds);
    if (partialNew === null) {
      // Reconstruction failed — fall back to full allow
      onRespond("allow");
      return;
    }
    if (partialNew === oldStr) {
      // Nothing would change — treat as deny
      onRespond("deny");
      return;
    }
    onRespond("allow", {
      ...request.toolInput,
      new_string: partialNew,
    });
  }, [approvedIds, oldStr, newStr, hunks, request.toolInput, onRespond]);

  const allApproved = approvedIds.size === hunks.length;
  const noneApproved = approvedIds.size === 0;

  // If there's only one hunk (or no hunks), skip the select UI and show a simpler approve/deny prompt with the diff
  const showHunkToggles = hunks.length > 1;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-4">
      <div className="pointer-events-auto rounded-2xl border border-border/60 bg-background/55 shadow-lg backdrop-blur-lg overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border/40">
          <ShieldAlert className="h-4 w-4 shrink-0 text-foreground/60" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground">Edit a file</p>
            <p className="text-xs font-mono text-muted-foreground truncate">{filePath}</p>
          </div>
          <div className="flex items-center gap-1.5 text-[11px] shrink-0 tabular-nums">
            {stats.added > 0 && (
              <span className="text-emerald-400">+{stats.added}</span>
            )}
            {stats.removed > 0 && (
              <span className="text-red-400">-{stats.removed}</span>
            )}
          </div>
          <OpenInEditorButton filePath={filePath} />
        </div>

        {/* Hunk-level select controls — only shown when there are multiple hunks */}
        {showHunkToggles && (
          <div className="flex items-center gap-2 px-4 py-2 border-b border-border/40 bg-foreground/[0.02]">
            <button
              onClick={toggleAll}
              className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
            >
              {allApproved ? (
                <CheckSquare className="h-3.5 w-3.5 text-emerald-400" />
              ) : (
                <Square className="h-3.5 w-3.5" />
              )}
              {allApproved ? "Deselect all changes" : "Select all changes"}
            </button>
            <span className="text-[10px] text-muted-foreground/50">
              {approvedIds.size} / {hunks.length} selected
            </span>
          </div>
        )}

        {/* Diff viewer with optional per-hunk toggle borders */}
        <div className="font-mono text-[12px] leading-[1.55] overflow-auto max-h-[22rem] bg-black/10">
          <DiffBody
            displayLines={displayLines}
            allLines={allLines}
            hunks={hunks}
            approvedIds={approvedIds}
            showHunkToggles={showHunkToggles}
            onExpandSection={expandSection}
            onToggleHunk={toggleHunk}
          />
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 border-t border-border/40 px-3 py-2.5">
          {request.decisionReason && (
            <p className="text-[11px] text-muted-foreground/60 truncate flex-1">
              {request.decisionReason}
            </p>
          )}
          <div className="flex items-center gap-2 ms-auto">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onRespond("deny")}
              className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
              Deny
            </Button>

            {showHunkToggles && (
              <Button
                size="sm"
                variant="outline"
                onClick={handleApplySelected}
                disabled={noneApproved}
                className="h-8 gap-1.5 text-xs"
              >
                <Check className="h-3.5 w-3.5" />
                Apply Selected
              </Button>
            )}

            <Button
              size="sm"
              onClick={handleAllowAll}
              className="h-8 gap-1.5 text-xs"
            >
              <Check className="h-3.5 w-3.5" />
              Allow All
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Diff body with per-hunk toggle markers ──

interface DiffBodyProps {
  displayLines: DisplayLine[];
  allLines: DiffLine[];
  hunks: DiffHunk[];
  approvedIds: Set<number>;
  showHunkToggles: boolean;
  onExpandSection: (idx: number) => void;
  onToggleHunk: (id: number) => void;
}

function DiffBody({
  displayLines,
  allLines,
  hunks,
  approvedIds,
  showHunkToggles,
  onExpandSection,
  onToggleHunk,
}: DiffBodyProps) {
  // Build a map: allLine index → hunk
  const indexToHunk = useMemo(() => {
    const m = new Map<number, DiffHunk>();
    for (const h of hunks) {
      for (let i = h.startIdx; i < h.startIdx + h.lines.length; i++) {
        m.set(i, h);
      }
    }
    return m;
  }, [hunks]);

  // Track which hunk IDs we have already rendered a toggle for in this pass
  const renderedToggles = new Set<number>();

  return (
    <>
      {displayLines.map((line, dispIdx) => {
        if (line.type === "collapsed") {
          return (
            <button
              key={`col-${dispIdx}`}
              onClick={() => onExpandSection(dispIdx)}
              className="flex w-full items-center justify-center gap-1 py-0.5 bg-foreground/[0.02] hover:bg-foreground/[0.05] transition-colors text-[10px] text-foreground/30 hover:text-foreground/50 border-s-2 border-s-transparent"
            >
              <ChevronDown className="h-2.5 w-2.5" />
              <span>
                {line.count} unchanged line{line.count !== 1 ? "s" : ""}
              </span>
            </button>
          );
        }

        // Find original index in allLines to look up hunk
        const origIdx = allLines.indexOf(line);
        const hunk = origIdx >= 0 ? indexToHunk.get(origIdx) : undefined;

        // Before first changed line of a new hunk, emit a hunk header row
        let hunkHeader: React.ReactNode = null;
        if (showHunkToggles && hunk && line.type !== "context" && !renderedToggles.has(hunk.id)) {
          renderedToggles.add(hunk.id);
          const approved = approvedIds.has(hunk.id);
          const hunkId = hunk.id;
          hunkHeader = (
            <div
              key={`hunk-header-${hunkId}`}
              className={`flex items-center gap-2 px-3 py-0.5 text-[10px] cursor-pointer select-none transition-colors ${
                approved
                  ? "bg-emerald-500/10 text-emerald-400/80 hover:bg-emerald-500/15"
                  : "bg-foreground/[0.03] text-muted-foreground/50 hover:bg-foreground/[0.06]"
              }`}
              onClick={() => onToggleHunk(hunkId)}
            >
              {approved ? (
                <CheckSquare className="h-3 w-3 shrink-0" />
              ) : (
                <Square className="h-3 w-3 shrink-0" />
              )}
              <span>Change {hunkId + 1}</span>
              <span className="ms-auto">
                {approved ? "will be applied" : "will be skipped"}
              </span>
            </div>
          );
        }

        const approved = hunk ? approvedIds.has(hunk.id) : true;

        const accentClass =
          line.type === "removed"
            ? "border-s-2 border-s-red-500/70"
            : line.type === "added"
              ? "border-s-2 border-s-emerald-500/70"
              : "border-s-2 border-s-transparent";

        const bgClass =
          !approved && line.type !== "context"
            ? "opacity-40"
            : line.type === "removed"
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
          <>
            {hunkHeader}
            <div key={`line-${dispIdx}`} className={`flex ${accentClass} ${bgClass}`}>
              <span className={`w-10 shrink-0 text-right pe-3 py-px select-none ${numClass}`}>
                {line.lineNum ?? ""}
              </span>
              <span className={`flex-1 px-3 py-px whitespace-pre-wrap wrap-break-word ${contentClass}`}>
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
          </>
        );
      })}
    </>
  );
}
