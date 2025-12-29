import { useCallback, useEffect, useRef, useState } from "react";
import type { GitRepoInfo, GitStatus, GitBranch, GitLogEntry } from "@/types";

export interface RepoState {
  repo: GitRepoInfo;
  status: GitStatus | null;
  branches: GitBranch[];
  log: GitLogEntry[];
}

interface UseGitStatusOptions {
  projectPath?: string;
}

export function useGitStatus({ projectPath }: UseGitStatusOptions) {
  const [repoStates, setRepoStates] = useState<RepoState[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const repoStatesRef = useRef(repoStates);
  repoStatesRef.current = repoStates;

  // Discover repos when projectPath changes
  useEffect(() => {
    if (!projectPath) {
      setRepoStates([]);
      return;
    }
    (async () => {
      const discovered = await window.clientCore.git.discoverRepos(projectPath);
      setRepoStates(discovered.map((repo) => ({ repo, status: null, branches: [], log: [] })));
    })();
  }, [projectPath]);

  const refreshAll = useCallback(async () => {
    const states = repoStatesRef.current;
    if (states.length === 0) return;
    setIsLoading(true);
    try {
      const updated = await Promise.all(
        states.map(async (rs) => {
          const [statusResult, branchesResult, logResult] = await Promise.all([
            window.clientCore.git.status(rs.repo.path),
            window.clientCore.git.branches(rs.repo.path),
            window.clientCore.git.log(rs.repo.path, 30),
          ]);
          return {
            repo: rs.repo,
            status: (!("error" in statusResult) || !statusResult.error) ? statusResult as GitStatus : rs.status,
            branches: Array.isArray(branchesResult) ? branchesResult : rs.branches,
            log: Array.isArray(logResult) ? logResult : rs.log,
          };
        }),
      );
      setRepoStates(updated);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const refreshRepo = useCallback(async (repoPath: string) => {
    const states = repoStatesRef.current;
    const idx = states.findIndex((rs) => rs.repo.path === repoPath);
    if (idx === -1) return;
    const rs = states[idx];
    const [statusResult, branchesResult, logResult] = await Promise.all([
      window.clientCore.git.status(rs.repo.path),
      window.clientCore.git.branches(rs.repo.path),
      window.clientCore.git.log(rs.repo.path, 30),
    ]);
    setRepoStates((prev) => {
      const next = [...prev];
      next[idx] = {
        repo: rs.repo,
        status: (!("error" in statusResult) || !statusResult.error) ? statusResult as GitStatus : rs.status,
        branches: Array.isArray(branchesResult) ? branchesResult : rs.branches,
        log: Array.isArray(logResult) ? logResult : rs.log,
      };
      return next;
    });
  }, []);

  // Poll all repos every 3s
  useEffect(() => {
    if (repoStates.length === 0) return;
    refreshAll();

    const interval = setInterval(() => {
      if (!document.hidden) refreshAll();
    }, 3000);

    const onVisibilityChange = () => {
      if (!document.hidden) refreshAll();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [repoStates.length, refreshAll]);

  // Per-repo action creators
  const stage = useCallback(
    async (repoPath: string, files: string[]) => {
      await window.clientCore.git.stage(repoPath, files);
      refreshRepo(repoPath);
    },
    [refreshRepo],
  );

  const unstage = useCallback(
    async (repoPath: string, files: string[]) => {
      await window.clientCore.git.unstage(repoPath, files);
      refreshRepo(repoPath);
    },
    [refreshRepo],
  );

  const stageAll = useCallback(
    async (repoPath: string) => {
      await window.clientCore.git.stageAll(repoPath);
      refreshRepo(repoPath);
    },
    [refreshRepo],
  );

  const unstageAll = useCallback(
    async (repoPath: string) => {
      await window.clientCore.git.unstageAll(repoPath);
      refreshRepo(repoPath);
    },
    [refreshRepo],
  );

  const discard = useCallback(
    async (repoPath: string, files: string[]) => {
      await window.clientCore.git.discard(repoPath, files);
      refreshRepo(repoPath);
    },
    [refreshRepo],
  );

  const commit = useCallback(
    async (repoPath: string, message: string) => {
      const result = await window.clientCore.git.commit(repoPath, message);
      refreshRepo(repoPath);
      return result;
    },
    [refreshRepo],
  );

  const checkout = useCallback(
    async (repoPath: string, branch: string) => {
      const result = await window.clientCore.git.checkout(repoPath, branch);
      if (!result.error) refreshRepo(repoPath);
      return result;
    },
    [refreshRepo],
  );

  const createBranch = useCallback(
    async (repoPath: string, name: string) => {
      const result = await window.clientCore.git.createBranch(repoPath, name);
      if (!result.error) refreshRepo(repoPath);
      return result;
    },
    [refreshRepo],
  );

  const push = useCallback(
    async (repoPath: string) => {
      const result = await window.clientCore.git.push(repoPath);
      refreshRepo(repoPath);
      return result;
    },
    [refreshRepo],
  );

  const pull = useCallback(
    async (repoPath: string) => {
      const result = await window.clientCore.git.pull(repoPath);
      refreshRepo(repoPath);
      return result;
    },
    [refreshRepo],
  );

  const fetchRemote = useCallback(
    async (repoPath: string) => {
      const result = await window.clientCore.git.fetch(repoPath);
      refreshRepo(repoPath);
      return result;
    },
    [refreshRepo],
  );

  const getDiff = useCallback(
    async (repoPath: string, file: string, staged: boolean) => {
      return window.clientCore.git.diffFile(repoPath, file, staged);
    },
    [],
  );

  return {
    repoStates,
    isLoading,
    refreshAll,
    refreshRepo,
    stage,
    unstage,
    stageAll,
    unstageAll,
    discard,
    commit,
    checkout,
    createBranch,
    push,
    pull,
    fetchRemote,
    getDiff,
  };
}
