import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { PanelLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useWorkspace } from "@/features/workspace";
import { AppSidebar } from "@/features/workspace";
import { ChatHeader, ChatView, InputBar, PermissionPrompt, TodoPanel, WelcomeScreen } from "@/features/chat";
import { BackgroundAgentsPanel } from "./BackgroundAgentsPanel";
import { ToolsPanel, BrowserPanel, GitPanel, FilesPanel, McpPanel, ToolPicker } from "@/features/tools";
import type { ToolId } from "@/features/tools";
import { SettingsDialog } from "./SettingsDialog";
import { useBackgroundAgents } from "@/hooks/useBackgroundAgents";
import { useOAgentRegistry } from "@/core/agents/hooks/useAgentCatalog";
import type {
  TodoItem,
  ImageAttachment,
  AgentDefinition,
} from "@/types";

export function AppLayout() {
  const {
    sidebar,
    projectManager,
    settings,
    manager,
    effectiveModel,
    activeProjectId,
  } = useWorkspace();

  const activeProjectPath = projectManager.projects.find(
    (p) => p.id === activeProjectId,
  )?.path;
  const { agents } = useOAgentRegistry();

  const [selectedAgent, setSelectedAgent] = useState<AgentDefinition | null>(
    null,
  );
  const handleAgentChange = useCallback(
    (agent: AgentDefinition | null) => {
      setSelectedAgent(agent);
      manager.setDraftAgent(
        agent?.engine ?? "agent",
        agent?.id ?? "oagent-core",
      );
    },
    [manager.setDraftAgent],
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [scrollToMessageId, setScrollToMessageId] = useState<
    string | undefined
  >();
  const [isResizing, setIsResizing] = useState(false);
  const [pinnedSessionIds, setPinnedSessionIds] = useState<Set<string>>(
    () => {
      try {
        const raw = localStorage.getItem("oagent-pinned-session-ids");
        if (!raw) return new Set();
        const parsed = JSON.parse(raw);
        return new Set(Array.isArray(parsed) ? parsed : []);
      } catch {
        return new Set();
      }
    },
  );

  const hasProjects = projectManager.projects.length > 0;

  // ── Tool toggle with suppression ──

  const handleToggleTool = useCallback(
    (toolId: ToolId) => {
      const isContextual = toolId === "tasks" || toolId === "agents";
      settings.setActiveTools((prev) => {
        const next = new Set(prev);
        if (next.has(toolId)) {
          next.delete(toolId);
          // User manually closed a contextual panel → suppress auto-open
          if (isContextual) settings.suppressPanel(toolId);
        } else {
          next.add(toolId);
          // User manually opened a contextual panel → clear suppression
          if (isContextual) settings.unsuppressPanel(toolId);
        }
        return next;
      });
    },
    [settings],
  );

  const handleNewChat = useCallback(
    async (projectId: string) => {
      const agent = selectedAgent;
      await manager.createSession(projectId, {
        model: effectiveModel,
        permissionMode: settings.permissionMode,
        engine: agent?.engine ?? "agent",
        agentId: agent?.id ?? "oagent-core",
      });
    },
    [
      manager.createSession,
      effectiveModel,
      settings.permissionMode,
      selectedAgent,
    ],
  );

  const handleSend = useCallback(
    async (text: string, images?: ImageAttachment[]) => {
      // If the selected agent's engine differs from the current session, start a new session first
      const currentEngine = manager.activeSession?.engine ?? "agent";
      const wantedEngine = selectedAgent?.engine ?? "agent";
      if (
        !manager.isDraft &&
        currentEngine !== wantedEngine &&
        manager.activeSession
      ) {
        await manager.createSession(manager.activeSession.projectId, {
          model: effectiveModel,
          permissionMode: settings.permissionMode,
          engine: wantedEngine,
          agentId: selectedAgent?.id ?? "oagent-core",
        });
      }
      await manager.send(text, images);
    },
    [
      manager.send,
      manager.isDraft,
      manager.activeSession,
      manager.createSession,
      selectedAgent,
      effectiveModel,
      settings.permissionMode,
    ],
  );

  const handleModelChange = useCallback(
    (nextModel: string) => {
      const openRouterModels = (
        settings.openRouterModel || "z-ai/glm-4.5-air:free"
      )
        .split(",")
        .map((s) => s.trim());
      const ollamaModels = (settings.ollamaModel || "llama3.2")
        .split(",")
        .map((s) => s.trim());

      let newProvider: "openrouter" | "ollama" | undefined = undefined;
      if (openRouterModels.includes(nextModel)) {
        newProvider = "openrouter";
      } else if (ollamaModels.includes(nextModel)) {
        newProvider = "ollama";
      }

      if (newProvider && newProvider !== settings.llmProvider) {
        settings.setLlmProvider(newProvider);
      }
      settings.setModel(nextModel);
      manager.setActiveModel(nextModel);
    },
    [settings, manager.setActiveModel],
  );

  const handlePermissionModeChange = useCallback(
    (nextMode: string) => {
      settings.setPermissionMode(nextMode);
      manager.setActivePermissionMode(nextMode);
    },
    [settings, manager.setActivePermissionMode],
  );

  const handleStop = useCallback(async () => {
    await manager.interrupt();
  }, [manager.interrupt]);

  const handleImportCCSession = useCallback(
    async (projectId: string, legacySessionId: string) => {
      await manager.importCCSession(projectId, legacySessionId);
    },
    [manager.importCCSession],
  );

  const handleNavigateToMessage = useCallback(
    (sessionId: string, messageId: string) => {
      manager.switchSession(sessionId);
      setTimeout(() => setScrollToMessageId(messageId), 200);
    },
    [manager.switchSession],
  );

  useEffect(() => {
    localStorage.setItem(
      "oagent-pinned-session-ids",
      JSON.stringify(Array.from(pinnedSessionIds)),
    );
  }, [pinnedSessionIds]);

  const handleTogglePinSession = useCallback(() => {
    const sid = manager.activeSessionId;
    if (!sid) return;
    setPinnedSessionIds((prev) => {
      const next = new Set(prev);
      if (next.has(sid)) next.delete(sid);
      else next.add(sid);
      return next;
    });
  }, [manager.activeSessionId]);

  const handleRenameSessionFromHeader = useCallback(() => {
    const session = manager.activeSession;
    if (!session) return;
    const proposed = window.prompt("Rename session", session.title);
    if (!proposed) return;
    const trimmed = proposed.trim();
    if (!trimmed || trimmed === session.title) return;
    manager.renameSession(session.id, trimmed);
  }, [manager.activeSession, manager.renameSession]);

  // Sync model from loaded session
  useEffect(() => {
    if (!manager.activeSessionId || manager.isDraft) return;
    const session = manager.sessions.find(
      (s) => s.id === manager.activeSessionId,
    );
    if (session?.model && session.model !== settings.model) {
      settings.setModel(session.model);
    }
  }, [manager.activeSessionId, manager.isDraft, manager.sessions]); // eslint-disable-line react-hooks/exhaustive-deps

  // Derive the latest todo list from the most recent TodoWrite tool call
  const activeTodos = useMemo(() => {
    for (let i = manager.messages.length - 1; i >= 0; i--) {
      const msg = manager.messages[i];
      if (
        msg.role === "tool_call" &&
        msg.toolName === "TodoWrite" &&
        msg.toolInput?.todos
      ) {
        return msg.toolInput.todos as TodoItem[];
      }
    }
    return [];
  }, [manager.messages]);

  const bgAgents = useBackgroundAgents({
    messages: manager.messages,
    sessionId: manager.activeSessionId,
  });

  // ── Contextual tools (tasks / agents) — auto-activate when data appears ──

  const hasTodos = activeTodos.length > 0;
  const hasAgents = bgAgents.agents.length > 0;

  const availableContextual = useMemo(() => {
    const s = new Set<ToolId>();
    if (hasTodos) s.add("tasks");
    if (hasAgents) s.add("agents");
    return s;
  }, [hasTodos, hasAgents]);

  // Auto-add contextual tools when data appears (unless suppressed)
  useEffect(() => {
    if (!hasTodos) {
      // Data gone → clear suppression so next session starts fresh
      settings.unsuppressPanel("tasks");
      return;
    }
    if (settings.suppressedPanels.has("tasks")) return;
    settings.setActiveTools((prev) => {
      if (prev.has("tasks")) return prev;
      const next = new Set(prev);
      next.add("tasks");
      return next;
    });
  }, [hasTodos]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!hasAgents) {
      settings.unsuppressPanel("agents");
      return;
    }
    if (settings.suppressedPanels.has("agents")) return;
    settings.setActiveTools((prev) => {
      if (prev.has("agents")) return prev;
      const next = new Set(prev);
      next.add("agents");
      return next;
    });
  }, [hasAgents]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Right panel resize ──

  const MIN_PANEL_WIDTH = 200;
  const MAX_PANEL_WIDTH = 500;

  const rightPanelWidthRef = useRef(settings.rightPanelWidth);
  rightPanelWidthRef.current = settings.rightPanelWidth;

  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setIsResizing(true);
      const startX = e.clientX;
      const startWidth = rightPanelWidthRef.current;

      const onMouseMove = (ev: MouseEvent) => {
        const delta = startX - ev.clientX;
        const next = Math.max(
          MIN_PANEL_WIDTH,
          Math.min(MAX_PANEL_WIDTH, startWidth + delta),
        );
        settings.setRightPanelWidth(next);
      };

      const onMouseUp = () => {
        setIsResizing(false);
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
        settings.saveRightPanelWidth();
      };

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    },
    [settings],
  );

  // ── Tools panel resize ──

  const MIN_TOOLS_WIDTH = 280;
  const MAX_TOOLS_WIDTH = 800;

  const toolsPanelWidthRef = useRef(settings.toolsPanelWidth);
  toolsPanelWidthRef.current = settings.toolsPanelWidth;

  const handleToolsResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setIsResizing(true);
      const startX = e.clientX;
      const startWidth = toolsPanelWidthRef.current;

      const onMouseMove = (ev: MouseEvent) => {
        const delta = startX - ev.clientX;
        const next = Math.max(
          MIN_TOOLS_WIDTH,
          Math.min(MAX_TOOLS_WIDTH, startWidth + delta),
        );
        settings.setToolsPanelWidth(next);
      };

      const onMouseUp = () => {
        setIsResizing(false);
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
        settings.saveToolsPanelWidth();
      };

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    },
    [settings],
  );

  // ── Tools vertical split ratio ──

  const toolsSplitRef = useRef(settings.toolsSplitRatio);
  toolsSplitRef.current = settings.toolsSplitRatio;
  const toolsColumnRef = useRef<HTMLDivElement>(null);

  const handleToolsSplitStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setIsResizing(true);
      const startY = e.clientY;
      const startRatio = toolsSplitRef.current;
      const columnEl = toolsColumnRef.current;
      if (!columnEl) return;
      const columnHeight = columnEl.getBoundingClientRect().height;

      const onMouseMove = (ev: MouseEvent) => {
        const deltaY = ev.clientY - startY;
        const deltaRatio = deltaY / columnHeight;
        const next = Math.max(0.2, Math.min(0.8, startRatio + deltaRatio));
        settings.setToolsSplitRatio(next);
      };

      const onMouseUp = () => {
        setIsResizing(false);
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
        settings.saveToolsSplitRatio();
      };

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    },
    [settings],
  );

  // Sync InputBar toggle when sessionInfo.permissionMode changes (e.g. ExitPlanMode)
  useEffect(() => {
    const mode = manager.sessionInfo?.permissionMode;
    if (mode && mode !== settings.permissionMode) {
      settings.setPermissionMode(mode);
    }
  }, [manager.sessionInfo?.permissionMode]); // eslint-disable-line react-hooks/exhaustive-deps

  const { activeTools } = settings;

  // Terminal/Browser are still available to the agent runtime, but hidden from the tool dock UI.
  useEffect(() => {
    if (!activeTools.has("terminal") && !activeTools.has("browser")) return;
    settings.setActiveTools((prev) => {
      const next = new Set(prev);
      next.delete("terminal");
      next.delete("browser");
      return next;
    });
  }, [activeTools, settings]);

  return (
      <div className="relative flex h-screen overflow-hidden bg-sidebar text-foreground">
      {manager.activeSessionId && (
        <div
          className="fixed right-4 top-3 z-[70] no-drag pointer-events-auto"
          style={{ WebkitAppRegion: "no-drag" } as CSSProperties}
          onMouseDownCapture={(e) => e.stopPropagation()}
          onPointerDownCapture={(e) => e.stopPropagation()}
        >
          <ToolPicker
            activeTools={activeTools}
            onToggle={handleToggleTool}
            availableContextual={availableContextual}
          />
        </div>
      )}

      <AppSidebar
        isOpen={sidebar.isOpen}
        projects={projectManager.projects}
        sessions={manager.sessions}
        activeSessionId={manager.activeSessionId}
        onNewChat={handleNewChat}
        onSelectSession={manager.switchSession}
        onDeleteSession={manager.deleteSession}
        onRenameSession={manager.renameSession}
        onCreateProject={projectManager.createProject}
        onDeleteProject={projectManager.deleteProject}
        onRenameProject={projectManager.renameProject}
        onImportCCSession={handleImportCCSession}
        onToggleSidebar={sidebar.toggle}
        onNavigateToMessage={handleNavigateToMessage}
        onReorderProject={projectManager.reorderProject}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      <div
        className={`my-2 ms-3 me-3 flex min-w-0 flex-1 ${isResizing ? "select-none" : ""}`}
      >
        <div className="island relative flex min-w-0 flex-1 flex-col overflow-hidden rounded-lg bg-background">
          {manager.activeSessionId ? (
            <>
              <div className="pointer-events-none absolute inset-x-0 top-0 z-10 bg-background">
                <ChatHeader
                  sidebarOpen={sidebar.isOpen}
                  isProcessing={manager.isProcessing}
                  model={manager.sessionInfo?.model}
                  sessionId={manager.sessionInfo?.sessionId}
                  totalCost={manager.totalCost}
                  title={manager.activeSession?.title}
                  isPinned={
                    !!manager.activeSessionId &&
                    pinnedSessionIds.has(manager.activeSessionId)
                  }
                  permissionMode={manager.sessionInfo?.permissionMode}
                  onToggleSidebar={sidebar.toggle}
                  projectPath={activeProjectPath}
                  onTogglePin={handleTogglePinSession}
                  onRenameSession={handleRenameSessionFromHeader}
                />
              </div>
              <ChatView
                messages={manager.messages}
                extraBottomPadding={!!manager.pendingPermission}
                scrollToMessageId={scrollToMessageId}
                onScrolledToMessage={() => setScrollToMessageId(undefined)}
              />
              <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[5] h-24 bg-gradient-to-t from-background/90 to-transparent" />
              <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10">
                {manager.pendingPermission ? (
                  <PermissionPrompt
                    request={manager.pendingPermission}
                    onRespond={manager.respondPermission}
                  />
                ) : (
                  <InputBar
                    onSend={handleSend}
                    onStop={handleStop}
                    isProcessing={manager.isProcessing}
                    model={effectiveModel}
                    thinking={settings.thinking}
                    permissionMode={settings.permissionMode}
                    onModelChange={handleModelChange}
                    onThinkingChange={settings.setThinking}
                    onPermissionModeChange={handlePermissionModeChange}
                    projectPath={activeProjectPath}
                    contextUsage={manager.contextUsage}
                    isCompacting={manager.isCompacting}
                    onCompact={manager.compact}
                    agents={agents}
                    selectedAgent={selectedAgent}
                    onAgentChange={handleAgentChange}
                    oapConfigOptions={manager.oapConfigOptions}
                    onOAPConfigChange={manager.setOAPConfig}
                    settings={settings}
                  />
                )}
              </div>
            </>
          ) : (
            <>
              <div
                className={`drag-region flex h-12 items-center px-3 ${
                  !sidebar.isOpen ? "ps-[78px]" : ""
                }`}
              >
                {!sidebar.isOpen && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="no-drag h-7 w-7 text-muted-foreground/60 hover:text-foreground"
                    onClick={sidebar.toggle}
                  >
                    <PanelLeft className="h-4 w-4" />
                  </Button>
                )}
              </div>
              <WelcomeScreen
                hasProjects={hasProjects}
                onCreateProject={projectManager.createProject}
              />
            </>
          )}
        </div>

        {((hasTodos && activeTools.has("tasks")) ||
          (hasAgents && activeTools.has("agents"))) &&
          manager.activeSessionId && (
            <>
              {/* Resize handle */}
              <div
                className="group flex w-2 shrink-0 cursor-col-resize items-center justify-center"
                onMouseDown={handleResizeStart}
              >
                <div
                  className={`h-10 w-0.5 rounded-full transition-colors duration-150 ${
                    isResizing
                      ? "bg-foreground/40"
                      : "bg-transparent group-hover:bg-foreground/25"
                  }`}
                />
              </div>

              {/* Right panel — Tasks / Agents */}
              <div
                className="flex shrink-0 flex-col gap-2 overflow-hidden"
                style={{ width: settings.rightPanelWidth }}
              >
                {hasTodos && activeTools.has("tasks") && (
                  <div
                    className={`island flex flex-col overflow-hidden rounded-lg bg-background ${
                      hasAgents && activeTools.has("agents")
                        ? "shrink-0"
                        : "min-h-0 flex-1"
                    }`}
                    style={{
                      maxHeight:
                        hasAgents && activeTools.has("agents")
                          ? "50%"
                          : undefined,
                    }}
                  >
                    <TodoPanel todos={activeTodos} />
                  </div>
                )}
                {hasAgents && activeTools.has("agents") && (
                  <div className="island flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg bg-background">
                    <BackgroundAgentsPanel
                      agents={bgAgents.agents}
                      onDismiss={bgAgents.dismissAgent}
                    />
                  </div>
                )}
              </div>
            </>
          )}

        {/* Tools panels — shown when toggled from picker */}
        {(activeTools.has("terminal") ||
          activeTools.has("browser") ||
          activeTools.has("git") ||
          activeTools.has("files") ||
          activeTools.has("mcp")) &&
          manager.activeSessionId && (
            <>
              {/* Resize handle */}
              <div
                className="group animate-tool-pane-in flex w-2 shrink-0 cursor-col-resize items-center justify-center"
                onMouseDown={handleToolsResizeStart}
              >
                <div
                  className={`h-10 w-0.5 rounded-full transition-colors duration-150 ${
                    isResizing
                      ? "bg-foreground/40"
                      : "bg-transparent group-hover:bg-foreground/25"
                  }`}
                />
              </div>

              <div
                ref={toolsColumnRef}
                className="animate-tool-pane-in flex shrink-0 flex-col gap-0 overflow-hidden"
                style={{ width: settings.toolsPanelWidth }}
              >
                {(() => {
                  const toolOrder: Array<{
                    id: string;
                    node: React.ReactNode;
                  }> = [];
                  if (activeTools.has("terminal"))
                    toolOrder.push({
                      id: "terminal",
                      node: <ToolsPanel cwd={activeProjectPath} />,
                    });
                  if (activeTools.has("git"))
                    toolOrder.push({
                      id: "git",
                      node: (
                        <GitPanel
                          cwd={activeProjectPath}
                          modelOptions={{
                            llmProvider: settings.llmProvider,
                            model: effectiveModel,
                            openRouterKey: settings.openRouterKey,
                            ollamaEndpoint: settings.ollamaEndpoint,
                          }}
                          collapsedRepos={settings.collapsedRepos}
                          onToggleRepoCollapsed={settings.toggleRepoCollapsed}
                        />
                      ),
                    });
                  if (activeTools.has("browser"))
                    toolOrder.push({ id: "browser", node: <BrowserPanel /> });
                  if (activeTools.has("files"))
                    toolOrder.push({
                      id: "files",
                      node: (
                        <FilesPanel
                          messages={manager.messages}
                          cwd={activeProjectPath}
                          onScrollToToolCall={setScrollToMessageId}
                        />
                      ),
                    });
                  if (activeTools.has("mcp"))
                    toolOrder.push({
                      id: "mcp",
                      node: (
                        <McpPanel
                          projectId={activeProjectId ?? null}
                          runtimeStatuses={manager.mcpServerStatuses}
                          isPreliminary={manager.mcpStatusPreliminary}
                          hasLiveSession={!manager.isDraft}
                          onRefreshStatus={manager.refreshMcpStatus}
                          onReconnect={manager.reconnectMcpServer}
                          onRestartWithServers={manager.restartWithMcpServers}
                        />
                      ),
                    });

                  const count = toolOrder.length;
                  const gapPx = (count - 1) * 8;

                  return toolOrder.map((tool, i) => (
                    <div key={tool.id} className="contents">
                      <div
                        className="island animate-tool-pane-in flex flex-col overflow-hidden rounded-lg bg-background"
                        style={
                          count === 1
                            ? { flex: "1 1 0%", minHeight: 0 }
                            : {
                                height: `calc(${100 / count}% - ${gapPx / count}px)`,
                                flexShrink: 0,
                              }
                        }
                      >
                        {tool.node}
                      </div>
                      {i < count - 1 && (
                        <div
                          className="group flex h-2 shrink-0 cursor-row-resize items-center justify-center"
                          onMouseDown={handleToolsSplitStart}
                        >
                          <div
                            className={`w-10 h-0.5 rounded-full transition-colors duration-150 ${
                              isResizing
                                ? "bg-foreground/40"
                                : "bg-transparent group-hover:bg-foreground/25"
                            }`}
                          />
                        </div>
                      )}
                    </div>
                  ));
                })()}
              </div>
            </>
          )}

      </div>

      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        settings={settings}
      />
    </div>
  );
}
