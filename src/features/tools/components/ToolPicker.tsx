import { memo, useMemo, type CSSProperties } from "react";
import { GitBranch, FileText, ListTodo, Bot, Plug, type LucideIcon } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Separator } from "@/components/ui/separator";

export type ToolId = "terminal" | "browser" | "git" | "files" | "tasks" | "agents" | "mcp";

interface ToolDef {
  id: ToolId;
  label: string;
  icon: LucideIcon;
}

const PANEL_TOOLS: ToolDef[] = [
  { id: "git", label: "Source Control", icon: GitBranch },
  { id: "files", label: "Open Files", icon: FileText },
  { id: "mcp", label: "MCP Servers", icon: Plug },
];

const CONTEXTUAL_TOOLS: ToolDef[] = [
  { id: "tasks", label: "Tasks", icon: ListTodo },
  { id: "agents", label: "Background Agents", icon: Bot },
];

interface ToolPickerProps {
  activeTools: Set<ToolId>;
  onToggle: (toolId: ToolId) => void;
  /** Which contextual tools have data and should be shown */
  availableContextual?: Set<ToolId>;
}

export const ToolPicker = memo(function ToolPicker({ activeTools, onToggle, availableContextual }: ToolPickerProps) {
  const visibleContextual = useMemo(
    () => CONTEXTUAL_TOOLS.filter((t) => availableContextual?.has(t.id)),
    [availableContextual],
  );

  return (
    <div
      className="no-drag pointer-events-auto flex items-center gap-1 rounded-xl px-0.5 py-0.5"
      style={{ WebkitAppRegion: "no-drag" } as CSSProperties}
      onMouseDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {visibleContextual.length > 0 && (
        <>
          {visibleContextual.map((tool) => {
            const Icon = tool.icon;
            const isActive = activeTools.has(tool.id);
            return (
              <Tooltip key={tool.id}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    style={{ WebkitAppRegion: "no-drag" } as CSSProperties}
                    onMouseDown={(e) => e.stopPropagation()}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={() => onToggle(tool.id)}
                    className={`no-drag pointer-events-auto relative flex h-7 w-7 items-center justify-center rounded-md transition-all duration-200 cursor-pointer ${
                      isActive
                        ? "bg-foreground/14 text-foreground ring-1 ring-foreground/20"
                        : "text-foreground/38 hover:text-foreground/85 hover:bg-foreground/8"
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" strokeWidth={isActive ? 2 : 1.75} />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" sideOffset={8}>
                  <p className="text-xs font-medium">{tool.label}</p>
                </TooltipContent>
              </Tooltip>
            );
          })}
          <Separator orientation="vertical" className="mx-0.5 h-5" />
        </>
      )}
      {PANEL_TOOLS.map((tool) => {
        const Icon = tool.icon;
        const isActive = activeTools.has(tool.id);
        return (
          <Tooltip key={tool.id}>
            <TooltipTrigger asChild>
              <button
                type="button"
                style={{ WebkitAppRegion: "no-drag" } as CSSProperties}
                onMouseDown={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => onToggle(tool.id)}
                className={`no-drag pointer-events-auto relative flex h-7 w-7 items-center justify-center rounded-md transition-all duration-200 cursor-pointer ${
                  isActive
                    ? "bg-foreground/14 text-foreground ring-1 ring-foreground/20"
                    : "text-foreground/38 hover:text-foreground/85 hover:bg-foreground/8"
                }`}
              >
                <Icon className="h-3.5 w-3.5" strokeWidth={isActive ? 2 : 1.75} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" sideOffset={8}>
              <p className="text-xs font-medium">{tool.label}</p>
            </TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
});
