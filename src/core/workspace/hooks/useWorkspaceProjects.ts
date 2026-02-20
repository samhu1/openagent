import { useState, useCallback, useEffect } from "react";
import type { Project } from "@/types";

export function useProjectManager() {
  const [projects, setProjects] = useState<Project[]>([]);

  useEffect(() => {
    window.clientCore.projects.list().then(setProjects);
  }, []);

  const createProject = useCallback(async () => {
    const project = await window.clientCore.projects.create();
    if (!project) return null;
    setProjects((prev) => {
      if (prev.some((p) => p.id === project.id)) return prev;
      return [...prev, project];
    });
    return project;
  }, []);

  const deleteProject = useCallback(async (id: string) => {
    await window.clientCore.projects.delete(id);
    setProjects((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const renameProject = useCallback(async (id: string, name: string) => {
    await window.clientCore.projects.rename(id, name);
    setProjects((prev) =>
      prev.map((p) => (p.id === id ? { ...p, name } : p)),
    );
  }, []);

  const updateProjectSpace = useCallback(async (id: string, spaceId: string) => {
    await window.clientCore.projects.updateSpace(id, spaceId);
    setProjects((prev) =>
      prev.map((p) => (p.id === id ? { ...p, spaceId } : p)),
    );
  }, []);

  const reorderProject = useCallback(async (projectId: string, targetProjectId: string) => {
    await window.clientCore.projects.reorder(projectId, targetProjectId);
    setProjects((prev) => {
      const next = [...prev];
      const fromIdx = next.findIndex((p) => p.id === projectId);
      const toIdx = next.findIndex((p) => p.id === targetProjectId);
      if (fromIdx === -1 || toIdx === -1) return prev;
      const [moved] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, moved);
      return next;
    });
  }, []);

  return {
    projects,
    createProject,
    deleteProject,
    renameProject,
    updateProjectSpace,
    reorderProject,
  };
}
