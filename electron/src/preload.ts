import { contextBridge, ipcRenderer, IpcRendererEvent } from "electron";

// Apply glass-enabled class as early as possible (before React mounts)
ipcRenderer.invoke("app:getGlassEnabled").then((enabled: boolean) => {
  if (enabled) {
    document.documentElement.classList.add("glass-enabled");
  }
});

const clientCoreApi = {
  getGlassEnabled: () => ipcRenderer.invoke("app:getGlassEnabled"),
  start: (options: unknown) => ipcRenderer.invoke("oagent:start", options),
  send: (sessionId: string, message: unknown) => ipcRenderer.invoke("oagent:send", { sessionId, message }),
  stop: (sessionId: string) => ipcRenderer.invoke("oagent:stop", sessionId),
  interrupt: (sessionId: string) => ipcRenderer.invoke("oagent:interrupt", sessionId),
  log: (label: string, data: unknown) => ipcRenderer.send("oagent:log", label, data),
  onEvent: (callback: (data: unknown) => void) => {
    const listener = (_event: IpcRendererEvent, data: unknown) => callback(data);
    ipcRenderer.on("oagent:event", listener);
    return () => ipcRenderer.removeListener("oagent:event", listener);
  },
  onStderr: (callback: (data: unknown) => void) => {
    const listener = (_event: IpcRendererEvent, data: unknown) => callback(data);
    ipcRenderer.on("oagent:stderr", listener);
    return () => ipcRenderer.removeListener("oagent:stderr", listener);
  },
  onExit: (callback: (data: unknown) => void) => {
    const listener = (_event: IpcRendererEvent, data: unknown) => callback(data);
    ipcRenderer.on("oagent:exit", listener);
    return () => ipcRenderer.removeListener("oagent:exit", listener);
  },
  onPermissionRequest: (callback: (data: unknown) => void) => {
    const listener = (_event: IpcRendererEvent, data: unknown) => callback(data);
    ipcRenderer.on("oagent:permission_request", listener);
    return () => ipcRenderer.removeListener("oagent:permission_request", listener);
  },
  respondPermission: (sessionId: string, requestId: string, behavior: string, toolUseId: string, toolInput: unknown, newPermissionMode?: string) =>
    ipcRenderer.invoke("oagent:permission_response", { sessionId, requestId, behavior, toolUseId, toolInput, newPermissionMode }),
  setPermissionMode: (sessionId: string, permissionMode: string) =>
    ipcRenderer.invoke("oagent:set-permission-mode", { sessionId, permissionMode }),
  mcpStatus: (sessionId: string) => ipcRenderer.invoke("oagent:mcp-status", sessionId),
  mcpReconnect: (sessionId: string, serverName: string) =>
    ipcRenderer.invoke("oagent:mcp-reconnect", { sessionId, serverName }),
  restartSession: (sessionId: string, mcpServers?: unknown[]) =>
    ipcRenderer.invoke("oagent:restart-session", { sessionId, mcpServers }),
  readFile: (filePath: string) => ipcRenderer.invoke("file:read", filePath),
  openInEditor: (filePath: string, line?: number) => ipcRenderer.invoke("file:open-in-editor", { filePath, line }),
  generateTitle: (
    message: string,
    cwd?: string,
    options?: {
      llmProvider?: "openrouter" | "ollama";
      model?: string;
      openRouterKey?: string;
      ollamaEndpoint?: string;
    },
  ) => ipcRenderer.invoke("oagent:generate-title", { message, cwd, ...options }),
  projects: {
    list: () => ipcRenderer.invoke("projects:list"),
    create: () => ipcRenderer.invoke("projects:create"),
    delete: (projectId: string) => ipcRenderer.invoke("projects:delete", projectId),
    rename: (projectId: string, name: string) => ipcRenderer.invoke("projects:rename", projectId, name),
    updateSpace: (projectId: string, spaceId: string) => ipcRenderer.invoke("projects:update-space", projectId, spaceId),
    reorder: (projectId: string, targetProjectId: string) => ipcRenderer.invoke("projects:reorder", projectId, targetProjectId),
  },
  sessions: {
    save: (data: unknown) => ipcRenderer.invoke("sessions:save", data),
    load: (projectId: string, sessionId: string) => ipcRenderer.invoke("sessions:load", projectId, sessionId),
    list: (projectId: string) => ipcRenderer.invoke("sessions:list", projectId),
    delete: (projectId: string, sessionId: string) => ipcRenderer.invoke("sessions:delete", projectId, sessionId),
    search: (projectIds: string[], query: string) => ipcRenderer.invoke("sessions:search", { projectIds, query }),
  },
  spaces: {
    list: () => ipcRenderer.invoke("spaces:list"),
    save: (spaces: unknown) => ipcRenderer.invoke("spaces:save", spaces),
  },
  legacySessions: {
    list: (projectPath: string) => ipcRenderer.invoke("legacy-sessions:list", projectPath),
    import: (projectPath: string, legacySessionId: string) => ipcRenderer.invoke("legacy-sessions:import", projectPath, legacySessionId),
  },
  files: {
    list: (cwd: string) => ipcRenderer.invoke("files:list", cwd),
    readMultiple: (cwd: string, paths: string[]) => ipcRenderer.invoke("files:read-multiple", { cwd, paths }),
  },
  git: {
    discoverRepos: (projectPath: string) => ipcRenderer.invoke("git:discover-repos", projectPath),
    status: (cwd: string) => ipcRenderer.invoke("git:status", cwd),
    diffStats: (cwd: string) => ipcRenderer.invoke("git:diff-stats", cwd),
    stage: (cwd: string, files: string[]) => ipcRenderer.invoke("git:stage", { cwd, files }),
    unstage: (cwd: string, files: string[]) => ipcRenderer.invoke("git:unstage", { cwd, files }),
    stageAll: (cwd: string) => ipcRenderer.invoke("git:stage-all", cwd),
    unstageAll: (cwd: string) => ipcRenderer.invoke("git:unstage-all", cwd),
    discard: (cwd: string, files: string[]) => ipcRenderer.invoke("git:discard", { cwd, files }),
    commit: (cwd: string, message: string) => ipcRenderer.invoke("git:commit", { cwd, message }),
    branches: (cwd: string) => ipcRenderer.invoke("git:branches", cwd),
    checkout: (cwd: string, branch: string) => ipcRenderer.invoke("git:checkout", { cwd, branch }),
    createBranch: (cwd: string, name: string) => ipcRenderer.invoke("git:create-branch", { cwd, name }),
    push: (cwd: string) => ipcRenderer.invoke("git:push", cwd),
    pull: (cwd: string) => ipcRenderer.invoke("git:pull", cwd),
    fetch: (cwd: string) => ipcRenderer.invoke("git:fetch", cwd),
    diffFile: (cwd: string, file: string, staged: boolean) => ipcRenderer.invoke("git:diff-file", { cwd, file, staged }),
    log: (cwd: string, count?: number) => ipcRenderer.invoke("git:log", { cwd, count }),
    generateCommitMessage: (
      cwd: string,
      options?: {
        llmProvider?: "openrouter" | "ollama";
        model?: string;
        openRouterKey?: string;
        ollamaEndpoint?: string;
      },
    ) => ipcRenderer.invoke("git:generate-commit-message", { cwd, ...options }),
  },
  terminal: {
    create: (options: unknown) => ipcRenderer.invoke("terminal:create", options),
    write: (terminalId: string, data: string) => ipcRenderer.invoke("terminal:write", { terminalId, data }),
    resize: (terminalId: string, cols: number, rows: number) => ipcRenderer.invoke("terminal:resize", { terminalId, cols, rows }),
    destroy: (terminalId: string) => ipcRenderer.invoke("terminal:destroy", terminalId),
    onData: (callback: (data: unknown) => void) => {
      const listener = (_event: IpcRendererEvent, data: unknown) => callback(data);
      ipcRenderer.on("terminal:data", listener);
      return () => ipcRenderer.removeListener("terminal:data", listener);
    },
    onExit: (callback: (data: unknown) => void) => {
      const listener = (_event: IpcRendererEvent, data: unknown) => callback(data);
      ipcRenderer.on("terminal:exit", listener);
      return () => ipcRenderer.removeListener("terminal:exit", listener);
    },
  },
  oap: {
    log: (label: string, data: unknown) => ipcRenderer.send("oap:log", label, data),
    start: (options: { agentId: string; cwd: string; mcpServers?: unknown[] }) => ipcRenderer.invoke("oap:start", options),
    prompt: (sessionId: string, text: string, images?: unknown[]) =>
      ipcRenderer.invoke("oap:prompt", { sessionId, text, images }),
    stop: (sessionId: string) => ipcRenderer.invoke("oap:stop", sessionId),
    reloadSession: (sessionId: string, mcpServers?: unknown[]) =>
      ipcRenderer.invoke("oap:reload-session", { sessionId, mcpServers }),
    reviveSession: (options: { agentId: string; cwd: string; agentSessionId?: string; mcpServers?: unknown[] }) =>
      ipcRenderer.invoke("oap:revive-session", options),
    cancel: (sessionId: string) => ipcRenderer.invoke("oap:cancel", sessionId),
    respondPermission: (sessionId: string, requestId: string, optionId: string) =>
      ipcRenderer.invoke("oap:permission_response", { sessionId, requestId, optionId }),
    setConfig: (sessionId: string, configId: string, value: string) =>
      ipcRenderer.invoke("oap:set-config", { sessionId, configId, value }),
    getConfigOptions: (sessionId: string) =>
      ipcRenderer.invoke("oap:get-config-options", sessionId),
    onEvent: (callback: (data: unknown) => void) => {
      const listener = (_event: IpcRendererEvent, data: unknown) => callback(data);
      ipcRenderer.on("oap:event", listener);
      return () => ipcRenderer.removeListener("oap:event", listener);
    },
    onPermissionRequest: (callback: (data: unknown) => void) => {
      const listener = (_event: IpcRendererEvent, data: unknown) => callback(data);
      ipcRenderer.on("oap:permission_request", listener);
      return () => ipcRenderer.removeListener("oap:permission_request", listener);
    },
    onTurnComplete: (callback: (data: unknown) => void) => {
      const listener = (_event: IpcRendererEvent, data: unknown) => callback(data);
      ipcRenderer.on("oap:turn_complete", listener);
      return () => ipcRenderer.removeListener("oap:turn_complete", listener);
    },
    onExit: (callback: (data: unknown) => void) => {
      const listener = (_event: IpcRendererEvent, data: unknown) => callback(data);
      ipcRenderer.on("oap:exit", listener);
      return () => ipcRenderer.removeListener("oap:exit", listener);
    },
  },
  mcp: {
    list: (projectId: string) => ipcRenderer.invoke("mcp:list", projectId),
    add: (projectId: string, server: unknown) => ipcRenderer.invoke("mcp:add", { projectId, server }),
    remove: (projectId: string, name: string) => ipcRenderer.invoke("mcp:remove", { projectId, name }),
    authenticate: (serverName: string, serverUrl: string) => ipcRenderer.invoke("mcp:authenticate", { serverName, serverUrl }),
    authStatus: (serverName: string) => ipcRenderer.invoke("mcp:auth-status", serverName),
    probe: (servers: unknown[]) => ipcRenderer.invoke("mcp:probe", servers),
  },
  agents: {
    list: () => ipcRenderer.invoke("agents:list"),
    save: (agent: unknown) => ipcRenderer.invoke("agents:save", agent),
    delete: (id: string) => ipcRenderer.invoke("agents:delete", id),
  },
  updater: {
    onUpdateAvailable: (cb: (info: unknown) => void) => {
      const listener = (_event: IpcRendererEvent, info: unknown) => cb(info);
      ipcRenderer.on("updater:update-available", listener);
      return () => ipcRenderer.removeListener("updater:update-available", listener);
    },
    onDownloadProgress: (cb: (progress: unknown) => void) => {
      const listener = (_event: IpcRendererEvent, progress: unknown) => cb(progress);
      ipcRenderer.on("updater:download-progress", listener);
      return () => ipcRenderer.removeListener("updater:download-progress", listener);
    },
    onUpdateDownloaded: (cb: (info: unknown) => void) => {
      const listener = (_event: IpcRendererEvent, info: unknown) => cb(info);
      ipcRenderer.on("updater:update-downloaded", listener);
      return () => ipcRenderer.removeListener("updater:update-downloaded", listener);
    },
    download: () => ipcRenderer.invoke("updater:download"),
    install: () => ipcRenderer.invoke("updater:install"),
    check: () => ipcRenderer.invoke("updater:check"),
  },
};

contextBridge.exposeInMainWorld("clientCore", clientCoreApi);
