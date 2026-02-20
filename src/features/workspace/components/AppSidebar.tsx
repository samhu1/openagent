import { useState, useEffect, useMemo, useRef, useCallback, memo } from "react";
import {
  PanelLeft,
  Pencil,
  MessageSquare,
  Trash2,
  MoreHorizontal,
  FolderOpen,
  Plus,
  SquarePen,
  ChevronRight,
  Loader2,
  History,
  Settings,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ChatSession, LegacySessionInfo, Project } from "@/types";
import { SidebarSearch } from "@/components/SidebarSearch";

interface AppSidebarProps {
  isOpen: boolean;
  projects: Project[];
  sessions: ChatSession[];
  activeSessionId: string | null;
  onNewChat: (projectId: string) => void;
  onSelectSession: (id: string) => void;
  onDeleteSession: (id: string) => void;
  onRenameSession: (id: string, title: string) => void;
  onCreateProject: () => void;
  onDeleteProject: (id: string) => void;
  onRenameProject: (id: string, name: string) => void;
  onImportCCSession: (projectId: string, ccSessionId: string) => void;
  onToggleSidebar: () => void;
  onNavigateToMessage: (sessionId: string, messageId: string) => void;
  onReorderProject: (projectId: string, targetProjectId: string) => void;
  onOpenSettings: () => void;
}

interface SessionGroup {
  label: string;
  sessions: ChatSession[];
}

function groupSessionsByDate(sessions: ChatSession[]): SessionGroup[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayMs = today.getTime();
  const yesterdayMs = todayMs - 86_400_000;
  const weekAgoMs = todayMs - 7 * 86_400_000;

  const groups: SessionGroup[] = [
    { label: "Today", sessions: [] },
    { label: "Yesterday", sessions: [] },
    { label: "Last 7 Days", sessions: [] },
    { label: "Older", sessions: [] },
  ];

  for (const session of sessions) {
    const ts = session.createdAt;
    if (ts >= todayMs) {
      groups[0].sessions.push(session);
    } else if (ts >= yesterdayMs) {
      groups[1].sessions.push(session);
    } else if (ts >= weekAgoMs) {
      groups[2].sessions.push(session);
    } else {
      groups[3].sessions.push(session);
    }
  }

  return groups.filter((g) => g.sessions.length > 0);
}

export const AppSidebar = memo(function AppSidebar({
  isOpen,
  projects,
  sessions,
  activeSessionId,
  onNewChat,
  onSelectSession,
  onDeleteSession,
  onRenameSession,
  onCreateProject,
  onDeleteProject,
  onRenameProject,
  onImportCCSession,
  onToggleSidebar,
  onNavigateToMessage,
  onReorderProject,
  onOpenSettings,
}: AppSidebarProps) {
  const projectIds = useMemo(() => projects.map((p) => p.id), [projects]);

  // Scroll fade: hide top/bottom fade when at the edge
  const scrollRef = useRef<HTMLDivElement>(null);
  const [fadeTop, setFadeTop] = useState(false);
  const [fadeBottom, setFadeBottom] = useState(false);

  const updateFade = useCallback(() => {
    const viewport = scrollRef.current?.querySelector<HTMLElement>(
      "[data-radix-scroll-area-viewport]",
    );
    if (!viewport) return;
    const { scrollTop, scrollHeight, clientHeight } = viewport;
    setFadeTop(scrollTop > 4);
    setFadeBottom(scrollHeight - scrollTop - clientHeight > 4);
  }, []);

  useEffect(() => {
    const viewport = scrollRef.current?.querySelector<HTMLElement>(
      "[data-radix-scroll-area-viewport]",
    );
    if (!viewport) return;
    viewport.addEventListener("scroll", updateFade, { passive: true });
    // Check initial state
    updateFade();
    return () => viewport.removeEventListener("scroll", updateFade);
  }, [updateFade]);

  // Recheck fade when projects/space change (content size changes)
  useEffect(() => {
    updateFade();
  }, [projects, updateFade]);

  const maskTop = fadeTop ? "transparent 0%, black 32px" : "black 0%";
  const maskBottom = fadeBottom ? "black calc(100% - 32px), transparent 100%" : "black 100%";
  const maskValue = `linear-gradient(to bottom, ${maskTop}, ${maskBottom})`;

  return (
    <div
      className={`flex shrink-0 flex-col overflow-hidden bg-sidebar transition-[width] duration-200 ${
        isOpen ? "w-[260px]" : "w-0"
      }`}
    >
      <div className="drag-region flex h-[50px] items-center gap-2 pe-2 ps-[84px]">
        <Button
          variant="ghost"
          size="icon"
          className="no-drag h-7 w-7 text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent"
          onClick={onToggleSidebar}
        >
          <PanelLeft className="h-4 w-4" />
        </Button>

        <div className="flex-1 min-w-0" />

        <button
          onClick={onCreateProject}
          className="no-drag flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-sidebar-foreground/65 transition-colors hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
        >
          <Plus className="h-3.5 w-3.5 shrink-0" />
          <span>Add project</span>
        </button>
      </div>

      <SidebarSearch
        projectIds={projectIds}
        onNavigateToMessage={onNavigateToMessage}
        onSelectSession={onSelectSession}
      />

      <div className="min-h-0 flex-1" style={{ maskImage: maskValue, WebkitMaskImage: maskValue }}>
        <ScrollArea ref={scrollRef} className="h-full">
          <div className="px-2 pb-8 pt-2">
            {projects.map((project) => {
            const projectSessions = sessions.filter(
              (s) => s.projectId === project.id,
            );

            return (
              <ProjectSection
                key={project.id}
                project={project}
                sessions={projectSessions}
                activeSessionId={activeSessionId}
                onNewChat={() => onNewChat(project.id)}
                onSelectSession={onSelectSession}
                onDeleteSession={onDeleteSession}
                onRenameSession={onRenameSession}
                onDeleteProject={() => onDeleteProject(project.id)}
                onRenameProject={(name) => onRenameProject(project.id, name)}
                onImportCCSession={(ccSessionId) => onImportCCSession(project.id, ccSessionId)}
                onReorderProject={(targetId) => onReorderProject(project.id, targetId)}
              />
            );
          })}

          {projects.length === 0 && (
            <p className="px-2 py-8 text-center text-xs text-sidebar-foreground/40">
              Add a project to get started
            </p>
          )}
          </div>
        </ScrollArea>
      </div>

      <div className="border-t border-sidebar-border/50 px-2 py-2">
        <button
          onClick={onOpenSettings}
          className="no-drag flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs font-medium text-sidebar-foreground/65 transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
        >
          <Settings className="h-3.5 w-3.5" />
          Settings
        </button>
      </div>
    </div>
  );
});

function ProjectSection({
  project,
  sessions,
  activeSessionId,
  onNewChat,
  onSelectSession,
  onDeleteSession,
  onRenameSession,
  onDeleteProject,
  onRenameProject,
  onImportCCSession,
  onReorderProject,
}: {
  project: Project;
  sessions: ChatSession[];
  activeSessionId: string | null;
  onNewChat: () => void;
  onSelectSession: (id: string) => void;
  onDeleteSession: (id: string) => void;
  onRenameSession: (id: string, title: string) => void;
  onDeleteProject: () => void;
  onRenameProject: (name: string) => void;
  onImportCCSession: (ccSessionId: string) => void;
  onReorderProject: (targetProjectId: string) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(project.name);
  const [isDragOver, setIsDragOver] = useState(false);
  const groups = useMemo(() => groupSessionsByDate(sessions), [sessions]);

  const handleRename = () => {
    const trimmed = editName.trim();
    if (trimmed && trimmed !== project.name) {
      onRenameProject(trimmed);
    }
    setIsEditing(false);
  };

  if (isEditing) {
    return (
      <div className="mb-1 flex items-center gap-1 px-1">
        <input
          autoFocus
          value={editName}
          onChange={(e) => setEditName(e.target.value)}
          onBlur={handleRename}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleRename();
            if (e.key === "Escape") setIsEditing(false);
          }}
          className="flex-1 rounded bg-sidebar-accent px-2 py-1 text-sm text-sidebar-foreground outline-none ring-1 ring-sidebar-ring"
        />
      </div>
    );
  }

  return (
    <div
      className={`mb-1 rounded-md transition-colors ${isDragOver ? "bg-sidebar-accent/60" : ""}`}
      onDragOver={(e) => {
        // Accept project drops for reorder
        if (e.dataTransfer.types.includes("application/x-project-id")) {
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          setIsDragOver(true);
        }
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={(e) => {
        setIsDragOver(false);
        const draggedId = e.dataTransfer.getData("application/x-project-id");
        if (draggedId && draggedId !== project.id) {
          onReorderProject(draggedId);
        }
      }}
    >
      {/* Project header row */}
      <div
        className="group flex items-center"
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData("application/x-project-id", project.id);
          e.dataTransfer.effectAllowed = "move";
        }}
      >
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-2 py-1.5 text-start text-sm font-medium text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent/50"
        >
          <ChevronRight
            className={`h-3 w-3 shrink-0 text-sidebar-foreground/40 transition-transform ${
              expanded ? "rotate-90" : ""
            }`}
          />
          <FolderOpen className="h-3.5 w-3.5 shrink-0 text-sidebar-foreground/50" />
          <span className="min-w-0 truncate">{project.name}</span>
        </button>

        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 shrink-0 text-sidebar-foreground/40 hover:text-sidebar-foreground opacity-0 transition-opacity group-hover:opacity-100"
          onClick={onNewChat}
        >
          <SquarePen className="h-3.5 w-3.5" />
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 shrink-0 text-sidebar-foreground/40 hover:text-sidebar-foreground opacity-0 transition-opacity group-hover:opacity-100"
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem
              onClick={() => {
                setEditName(project.name);
                setIsEditing(true);
              }}
            >
              <Pencil className="me-2 h-3.5 w-3.5" />
              Rename
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <History className="me-2 h-3.5 w-3.5" />
                Resume CC Chat
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-72 max-h-80 overflow-y-auto">
                <CCSessionList
                  projectPath={project.path}
                  onSelect={onImportCCSession}
                />
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={onDeleteProject}
            >
              <Trash2 className="me-2 h-3.5 w-3.5" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Nested chats */}
      {expanded && (
        <div className="ms-5 overflow-hidden">
          {groups.map((group) => (
            <div key={group.label} className="mb-1.5">
              <p className="mb-0.5 px-2 text-[11px] font-medium text-sidebar-foreground/30 uppercase tracking-wider">
                {group.label}
              </p>
              {group.sessions.map((session) => (
                <SessionItem
                  key={session.id}
                  session={session}
                  isActive={session.id === activeSessionId}
                  onSelect={() => onSelectSession(session.id)}
                  onDelete={() => onDeleteSession(session.id)}
                  onRename={(title) => onRenameSession(session.id, title)}
                />
              ))}
            </div>
          ))}

          {sessions.length === 0 && (
            <p className="px-2 py-2 text-xs text-sidebar-foreground/25">
              No conversations yet
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function SessionItem({
  session,
  isActive,
  onSelect,
  onDelete,
  onRename,
}: {
  session: ChatSession;
  isActive: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onRename: (title: string) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(session.title);

  const handleRename = () => {
    const trimmed = editTitle.trim();
    if (trimmed && trimmed !== session.title) {
      onRename(trimmed);
    }
    setIsEditing(false);
  };

  if (isEditing) {
    return (
      <div className="flex items-center gap-1 px-1">
        <input
          autoFocus
          value={editTitle}
          onChange={(e) => setEditTitle(e.target.value)}
          onBlur={handleRename}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleRename();
            if (e.key === "Escape") setIsEditing(false);
          }}
          className="flex-1 rounded bg-sidebar-accent px-2 py-1 text-sm text-sidebar-foreground outline-none ring-1 ring-sidebar-ring"
        />
      </div>
    );
  }

  return (
    <div className="group relative">
      <button
        onClick={onSelect}
        className={`flex w-full min-w-0 items-center gap-2 rounded-md ps-2 pe-6 py-1 text-start text-[13px] transition-colors ${
          isActive
            ? "bg-sidebar-accent text-sidebar-accent-foreground"
            : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50"
        }`}
      >
        {session.isProcessing ? (
          <Loader2 className="h-3 w-3 shrink-0 animate-spin text-sidebar-foreground/50" />
        ) : (
          <MessageSquare className="h-3 w-3 shrink-0 text-sidebar-foreground/40" />
        )}
        {session.titleGenerating ? (
          <span className="flex items-center gap-1.5 text-sidebar-foreground/50">
            <Loader2 className="h-3 w-3 animate-spin" />
            <span className="italic">Generating title...</span>
          </span>
        ) : (
          <span className="min-w-0 truncate">{session.title}</span>
        )}
      </button>

      <div className="absolute end-1 top-1/2 -translate-y-1/2 opacity-0 transition-opacity group-hover:opacity-100">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5 text-sidebar-foreground/50 hover:text-sidebar-foreground"
            >
              <MoreHorizontal className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-36">
            <DropdownMenuItem
              onClick={() => {
                setEditTitle(session.title);
                setIsEditing(true);
              }}
            >
              <Pencil className="me-2 h-3.5 w-3.5" />
              Rename
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={onDelete}
            >
              <Trash2 className="me-2 h-3.5 w-3.5" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

function formatRelativeDate(isoString: string): string {
  const date = new Date(isoString);
  const now = Date.now();
  const diffMs = now - date.getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMs / 3_600_000);
  const diffDays = Math.floor(diffMs / 86_400_000);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function CCSessionList({
  projectPath,
  onSelect,
}: {
  projectPath: string;
  onSelect: (sessionId: string) => void;
}) {
  const [sessions, setSessions] = useState<LegacySessionInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    window.clientCore.legacySessions
      .list(projectPath)
      .then((result) => {
        setSessions(result);
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });
  }, [projectPath]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <p className="px-3 py-2 text-xs text-muted-foreground">
        No chats yet
      </p>
    );
  }

  return (
    <>
      {sessions.map((s) => (
        <DropdownMenuItem
          key={s.sessionId}
          onClick={() => onSelect(s.sessionId)}
          className="flex flex-col items-start gap-0.5 py-2"
        >
          <span className="line-clamp-1 text-sm">{s.preview}</span>
          <span className="text-xs text-muted-foreground">
            {formatRelativeDate(s.timestamp)} · {s.model}
          </span>
        </DropdownMenuItem>
      ))}
    </>
  );
}
