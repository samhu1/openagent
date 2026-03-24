import { memo, useState, useEffect } from "react";
import {
  MoreHorizontal,
  PanelLeft,
  Pin,
  PinOff,
  PencilLine,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ToolPicker,
  type ToolId,
} from "@/features/tools/components/ToolPicker";

const PERMISSION_MODE_LABELS: Record<string, string> = {
  plan: "Plan",
  default: "Ask Before Edits",
  acceptEdits: "Accept Edits",
  dontAsk: "Don't Ask",
  bypassPermissions: "Allow All",
};

interface ChatHeaderProps {
  sidebarOpen: boolean;
  model?: string;
  sessionId?: string;
  totalCost: number;
  title?: string;
  isPinned?: boolean;
  permissionMode?: string;
  projectPath?: string;
  onToggleSidebar: () => void;
  onRenameSession?: () => void;
  onTogglePin?: () => void;
  activeTools?: Set<ToolId>;
  onToggleTool?: (toolId: ToolId) => void;
  availableContextual?: Set<ToolId>;
}

export const ChatHeader = memo(function ChatHeader({
  sidebarOpen,
  model,
  sessionId,
  totalCost,
  title,
  isPinned,
  permissionMode,
  projectPath,
  onToggleSidebar,
  onRenameSession,
  onTogglePin,
  activeTools,
  onToggleTool,
  availableContextual,
}: ChatHeaderProps) {
  const modeLabel = permissionMode
    ? PERMISSION_MODE_LABELS[permissionMode]
    : null;

  const [diffStats, setDiffStats] = useState<{
    insertions: number;
    deletions: number;
  } | null>(null);

  useEffect(() => {
    if (!projectPath) return;

    const fetchDiff = async () => {
      try {
        const stats = await window.clientCore.git.diffStats(projectPath);
        setDiffStats(stats);
      } catch {
        setDiffStats(null);
      }
    };

    fetchDiff();
    const timer = setInterval(fetchDiff, 5000);
    return () => clearInterval(timer);
  }, [projectPath]);

  return (
    <div
      className={`pointer-events-auto flex h-10 items-center gap-3 px-3 ${
        !sidebarOpen ? "ps-[78px]" : ""
      }`}
    >
      {!sidebarOpen && (
        <Button
          variant="ghost"
          size="icon"
          className="no-drag h-7 w-7 text-muted-foreground/60 hover:text-foreground"
          onClick={onToggleSidebar}
        >
          <PanelLeft className="h-4 w-4" />
        </Button>
      )}

      {title && title !== "New Chat" && (
        <div className="no-drag flex max-w-[34ch] items-center gap-1.5">
          <span className="truncate text-sm font-medium text-foreground/80">
            {title}
          </span>
          {isPinned && <Pin className="h-3 w-3 text-foreground/45" />}
          {(onRenameSession || onTogglePin) && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-muted-foreground/60 hover:text-foreground"
                >
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-36">
                {onTogglePin && (
                  <DropdownMenuItem onClick={onTogglePin}>
                    {isPinned ? (
                      <PinOff className="me-2 h-3.5 w-3.5" />
                    ) : (
                      <Pin className="me-2 h-3.5 w-3.5" />
                    )}
                    {isPinned ? "Unpin" : "Pin"}
                  </DropdownMenuItem>
                )}
                {onRenameSession && (
                  <DropdownMenuItem onClick={onRenameSession}>
                    <PencilLine className="me-2 h-3.5 w-3.5" />
                    Rename
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      )}

      {model && (
        <Badge variant="secondary" className="no-drag text-[11px] font-normal">
          {model}
        </Badge>
      )}

      {modeLabel && permissionMode !== "default" && (
        <Badge variant="outline" className="no-drag text-[11px] font-normal">
          {modeLabel}
        </Badge>
      )}

      <div className="ms-auto flex items-center gap-3">
        {totalCost > 0 && (
          <span className="text-[10px] font-bold text-foreground/30 tabular-nums uppercase tracking-widest">
            ${totalCost.toFixed(4)}
          </span>
        )}

        {sessionId && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="no-drag cursor-default text-[10px] font-bold text-foreground/20 tabular-nums uppercase tracking-widest">
                {sessionId.slice(0, 8)}
              </span>
            </TooltipTrigger>
            <TooltipContent>
              <p className="font-mono text-[10px] uppercase tracking-tighter">
                {sessionId}
              </p>
            </TooltipContent>
          </Tooltip>
        )}

        {diffStats && (diffStats.insertions > 0 || diffStats.deletions > 0) && (
          <div className="flex items-center gap-1.5 no-drag text-[10px] font-mono font-bold tracking-tighter">
            {diffStats.insertions > 0 && (
              <span className="text-foreground/40">
                +{diffStats.insertions}
              </span>
            )}
            {diffStats.deletions > 0 && (
              <span className="text-foreground/20">-{diffStats.deletions}</span>
            )}
          </div>
        )}

        {activeTools && onToggleTool && (
          <>
            <div className="h-4 w-px bg-foreground/5 mx-1" />
            <ToolPicker
              activeTools={activeTools}
              onToggle={onToggleTool}
              availableContextual={availableContextual}
            />
          </>
        )}
      </div>
    </div>
  );
});
