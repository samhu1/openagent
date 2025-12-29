import { useEffect, useMemo, useState } from "react";
import { useProjectManager } from "@/core/workspace/hooks/useWorkspaceProjects";
import { useSessionManager } from "@/core/workspace/hooks/useWorkspaceSessions";
import { useSidebar } from "@/core/workspace/hooks/useWorkspaceSidebar";
import { useSettings } from "@/core/workspace/hooks/useWorkspaceSettings";

export function useWorkspace() {
  const sidebar = useSidebar();
  const projectManager = useProjectManager();

  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const settings = useSettings(activeProjectId);
  const manager = useSessionManager(projectManager.projects, settings);

  useEffect(() => {
    const pid = manager.activeSession?.projectId ?? manager.draftProjectId ?? null;
    if (pid !== activeProjectId) setActiveProjectId(pid);
  }, [manager.activeSession?.projectId, manager.draftProjectId, activeProjectId]);

  const effectiveModel = useMemo(() => {
    if (settings.llmProvider === "openrouter") return settings.openRouterModel;
    if (settings.llmProvider === "ollama") return settings.ollamaModel;
    return settings.model;
  }, [settings.llmProvider, settings.openRouterModel, settings.ollamaModel, settings.model]);

  return {
    sidebar,
    projectManager,
    settings,
    manager,
    effectiveModel,
    activeProjectId,
  };
}
