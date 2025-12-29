import { useCallback, useEffect, useRef, useState } from "react";
import type { ToolId } from "@/features/tools";

// ── Helpers ──

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function readNumber(
  key: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const raw = localStorage.getItem(key);
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
}

function readBool(key: string, fallback: boolean): boolean {
  const raw = localStorage.getItem(key);
  if (raw === null) return fallback;
  return raw === "true";
}

// ── Constants ──

const MIN_RIGHT_PANEL = 200;
const MAX_RIGHT_PANEL = 500;
const DEFAULT_RIGHT_PANEL = 288;

const MIN_TOOLS_PANEL = 280;
const MAX_TOOLS_PANEL = 800;
const DEFAULT_TOOLS_PANEL = 420;

const MIN_SPLIT = 0.2;
const MAX_SPLIT = 0.8;
const DEFAULT_SPLIT = 0.5;

const DEFAULT_MODEL = "z-ai/glm-4.5-air:free";
const DEFAULT_PERMISSION_MODE = "plan";
const DEFAULT_OPENROUTER_FREE_MODEL = "z-ai/glm-4.5-air:free";

function normalizeOpenRouterModel(model: string): string {
  const value = model.trim();
  if (!value) return DEFAULT_OPENROUTER_FREE_MODEL;
  // Enforce free-tier-only policy for OpenRouter models.
  if (!value.endsWith(":free")) return DEFAULT_OPENROUTER_FREE_MODEL;
  return value;
}

// ── Hook ──

export interface Settings {
  // Global
  permissionMode: string;
  setPermissionMode: (mode: string) => void;
  thinking: boolean;
  setThinking: (on: boolean) => void;

  // Provider settings
  llmProvider: "openrouter" | "ollama";
  setLlmProvider: (p: "openrouter" | "ollama") => void;
  openRouterKey: string;
  setOpenRouterKey: (k: string) => void;
  ollamaEndpoint: string;
  setOllamaEndpoint: (e: string) => void;
  openRouterModel: string;
  setOpenRouterModel: (m: string) => void;
  ollamaModel: string;
  setOllamaModel: (m: string) => void;

  // Per-project
  model: string;
  setModel: (m: string) => void;
  activeTools: Set<ToolId>;
  setActiveTools: (
    updater: Set<ToolId> | ((prev: Set<ToolId>) => Set<ToolId>),
  ) => void;
  rightPanelWidth: number;
  setRightPanelWidth: (w: number) => void;
  saveRightPanelWidth: () => void;
  toolsPanelWidth: number;
  setToolsPanelWidth: (w: number) => void;
  saveToolsPanelWidth: () => void;
  toolsSplitRatio: number;
  setToolsSplitRatio: (r: number) => void;
  saveToolsSplitRatio: () => void;
  collapsedRepos: Set<string>;
  toggleRepoCollapsed: (path: string) => void;
  suppressedPanels: Set<ToolId>;
  suppressPanel: (id: ToolId) => void;
  unsuppressPanel: (id: ToolId) => void;

  // Global usage tracking
  cumulativeTokens: number;
  addCumulativeTokens: (tokens: number) => void;
  cumulativeCost: number;
  addCumulativeCost: (cost: number) => void;
  resetUsage: () => void;
}

export function useSettings(projectId: string | null): Settings {
  const pid = projectId ?? "__none__";

  useEffect(() => {
    const sentinelKey = "oagent-migrated-v1";
    if (localStorage.getItem(sentinelKey) === "true") return;

    const updates: Array<[string, string]> = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith("OAgentui-")) continue;
      const migratedKey = `oagent-${key.slice("OAgentui-".length)}`;
      if (localStorage.getItem(migratedKey) !== null) continue;
      const value = localStorage.getItem(key);
      if (value !== null) updates.push([migratedKey, value]);
    }

    for (const [key, value] of updates) {
      localStorage.setItem(key, value);
    }
    localStorage.setItem(sentinelKey, "true");
  }, []);

  // ── Global settings ──

  const [permissionMode, setPermissionModeRaw] = useState(
    () =>
      localStorage.getItem("oagent-permission-mode") ??
      DEFAULT_PERMISSION_MODE,
  );
  const setPermissionMode = useCallback((mode: string) => {
    setPermissionModeRaw(mode);
    localStorage.setItem("oagent-permission-mode", mode);
  }, []);

  const [thinking, setThinkingRaw] = useState(() =>
    readBool("oagent-thinking", true),
  );
  const setThinking = useCallback((on: boolean) => {
    setThinkingRaw(on);
    localStorage.setItem("oagent-thinking", String(on));
  }, []);

  // ── Provider settings ──

  const [llmProvider, setLlmProviderRaw] = useState<"openrouter" | "ollama">(() =>
    (localStorage.getItem("oagent-llm-provider") as any) ?? "openrouter",
  );
  const setLlmProvider = useCallback((p: "openrouter" | "ollama") => {
    setLlmProviderRaw(p);
    localStorage.setItem("oagent-llm-provider", p);
  }, []);

  const [openRouterKey, setOpenRouterKeyRaw] = useState(() =>
    localStorage.getItem("oagent-openrouter-key") ?? "",
  );
  const setOpenRouterKey = useCallback((k: string) => {
    setOpenRouterKeyRaw(k);
    localStorage.setItem("oagent-openrouter-key", k);
  }, []);

  const [ollamaEndpoint, setOllamaEndpointRaw] = useState(() =>
    localStorage.getItem("oagent-ollama-endpoint") ?? "http://localhost:11434",
  );
  const setOllamaEndpoint = useCallback((e: string) => {
    setOllamaEndpointRaw(e);
    localStorage.setItem("oagent-ollama-endpoint", e);
  }, []);

  const [openRouterModel, setOpenRouterModelRaw] = useState(() =>
    normalizeOpenRouterModel(
      localStorage.getItem("oagent-openrouter-model") ?? DEFAULT_OPENROUTER_FREE_MODEL,
    ),
  );
  const setOpenRouterModel = useCallback((m: string) => {
    const normalized = normalizeOpenRouterModel(m);
    setOpenRouterModelRaw(normalized);
    localStorage.setItem("oagent-openrouter-model", normalized);
  }, []);

  const [ollamaModel, setOllamaModelRaw] = useState(() =>
    localStorage.getItem("oagent-ollama-model") ?? "llama3.2",
  );
  const setOllamaModel = useCallback((m: string) => {
    setOllamaModelRaw(m);
    localStorage.setItem("oagent-ollama-model", m);
  }, []);

  // ── Usage Tracking ──

  const [cumulativeTokens, setCumulativeTokensRaw] = useState(() =>
    readNumber("oagent-global-tokens", 0, 0, Number.MAX_SAFE_INTEGER),
  );
  const addCumulativeTokens = useCallback((tokens: number) => {
    setCumulativeTokensRaw((prev) => {
      const next = prev + tokens;
      localStorage.setItem("oagent-global-tokens", String(next));
      return next;
    });
  }, []);

  const [cumulativeCost, setCumulativeCostRaw] = useState(() =>
    readNumber("oagent-global-cost", 0, 0, Number.MAX_SAFE_INTEGER),
  );
  const addCumulativeCost = useCallback((cost: number) => {
    setCumulativeCostRaw((prev) => {
      const next = prev + cost;
      localStorage.setItem("oagent-global-cost", String(next.toFixed(6)));
      return next;
    });
  }, []);

  const resetUsage = useCallback(() => {
    setCumulativeTokensRaw(0);
    localStorage.setItem("oagent-global-tokens", "0");
    setCumulativeCostRaw(0);
    localStorage.setItem("oagent-global-cost", "0");
  }, []);

  // ── Per-project settings ──

  const [model, setModelRaw] = useState(
    () => localStorage.getItem(`oagent-${pid}-model`) ?? DEFAULT_MODEL,
  );
  const setModel = useCallback(
    (m: string) => {
      setModelRaw(m);
      localStorage.setItem(`oagent-${pid}-model`, m);
    },
    [pid],
  );

  const [activeTools, setActiveToolsRaw] = useState<Set<ToolId>>(() => {
    const arr = readJson<ToolId[]>(`oagent-${pid}-active-tools`, []);
    return new Set(arr);
  });
  const setActiveTools = useCallback(
    (updater: Set<ToolId> | ((prev: Set<ToolId>) => Set<ToolId>)) => {
      setActiveToolsRaw((prev) => {
        const next = typeof updater === "function" ? updater(prev) : updater;
        localStorage.setItem(
          `oagent-${pid}-active-tools`,
          JSON.stringify([...next]),
        );
        return next;
      });
    },
    [pid],
  );

  const [rightPanelWidth, setRightPanelWidth] = useState(() =>
    readNumber(
      `oagent-${pid}-right-panel-width`,
      DEFAULT_RIGHT_PANEL,
      MIN_RIGHT_PANEL,
      MAX_RIGHT_PANEL,
    ),
  );
  const rightPanelWidthRef = useRef(rightPanelWidth);
  rightPanelWidthRef.current = rightPanelWidth;
  const saveRightPanelWidth = useCallback(() => {
    localStorage.setItem(
      `oagent-${pid}-right-panel-width`,
      String(rightPanelWidthRef.current),
    );
  }, [pid]);

  const [toolsPanelWidth, setToolsPanelWidth] = useState(() =>
    readNumber(
      `oagent-${pid}-tools-panel-width`,
      DEFAULT_TOOLS_PANEL,
      MIN_TOOLS_PANEL,
      MAX_TOOLS_PANEL,
    ),
  );
  const toolsPanelWidthRef = useRef(toolsPanelWidth);
  toolsPanelWidthRef.current = toolsPanelWidth;
  const saveToolsPanelWidth = useCallback(() => {
    localStorage.setItem(
      `oagent-${pid}-tools-panel-width`,
      String(toolsPanelWidthRef.current),
    );
  }, [pid]);

  const [toolsSplitRatio, setToolsSplitRatio] = useState(() =>
    readNumber(
      `oagent-${pid}-tools-split`,
      DEFAULT_SPLIT,
      MIN_SPLIT,
      MAX_SPLIT,
    ),
  );
  const toolsSplitRef = useRef(toolsSplitRatio);
  toolsSplitRef.current = toolsSplitRatio;
  const saveToolsSplitRatio = useCallback(() => {
    localStorage.setItem(
      `oagent-${pid}-tools-split`,
      String(toolsSplitRef.current),
    );
  }, [pid]);

  const [collapsedRepos, setCollapsedRepos] = useState<Set<string>>(() => {
    const arr = readJson<string[]>(`oagent-${pid}-collapsed-repos`, []);
    return new Set(arr);
  });
  const toggleRepoCollapsed = useCallback(
    (path: string) => {
      setCollapsedRepos((prev) => {
        const next = new Set(prev);
        if (next.has(path)) next.delete(path);
        else next.add(path);
        localStorage.setItem(
          `oagent-${pid}-collapsed-repos`,
          JSON.stringify([...next]),
        );
        return next;
      });
    },
    [pid],
  );

  const [suppressedPanels, setSuppressedPanels] = useState<Set<ToolId>>(() => {
    const arr = readJson<ToolId[]>(`oagent-${pid}-suppressed-panels`, []);
    return new Set(arr);
  });
  const suppressPanel = useCallback(
    (id: ToolId) => {
      setSuppressedPanels((prev) => {
        const next = new Set(prev);
        next.add(id);
        localStorage.setItem(
          `oagent-${pid}-suppressed-panels`,
          JSON.stringify([...next]),
        );
        return next;
      });
    },
    [pid],
  );
  const unsuppressPanel = useCallback(
    (id: ToolId) => {
      setSuppressedPanels((prev) => {
        if (!prev.has(id)) return prev;
        const next = new Set(prev);
        next.delete(id);
        localStorage.setItem(
          `oagent-${pid}-suppressed-panels`,
          JSON.stringify([...next]),
        );
        return next;
      });
    },
    [pid],
  );

  // ── Re-read per-project values when projectId changes ──

  useEffect(() => {
    setModelRaw(
      localStorage.getItem(`oagent-${pid}-model`) ?? DEFAULT_MODEL,
    );

    const tools = readJson<ToolId[]>(`oagent-${pid}-active-tools`, []);
    setActiveToolsRaw(new Set(tools));

    setRightPanelWidth(
      readNumber(
        `oagent-${pid}-right-panel-width`,
        DEFAULT_RIGHT_PANEL,
        MIN_RIGHT_PANEL,
        MAX_RIGHT_PANEL,
      ),
    );
    setToolsPanelWidth(
      readNumber(
        `oagent-${pid}-tools-panel-width`,
        DEFAULT_TOOLS_PANEL,
        MIN_TOOLS_PANEL,
        MAX_TOOLS_PANEL,
      ),
    );
    setToolsSplitRatio(
      readNumber(
        `oagent-${pid}-tools-split`,
        DEFAULT_SPLIT,
        MIN_SPLIT,
        MAX_SPLIT,
      ),
    );

    const repos = readJson<string[]>(`oagent-${pid}-collapsed-repos`, []);
    setCollapsedRepos(new Set(repos));

    const suppressed = readJson<ToolId[]>(
      `oagent-${pid}-suppressed-panels`,
      [],
    );
    setSuppressedPanels(new Set(suppressed));
  }, [pid]);

  return {
    permissionMode,
    setPermissionMode,
    thinking,
    setThinking,
    llmProvider,
    setLlmProvider,
    openRouterKey,
    setOpenRouterKey,
    ollamaEndpoint,
    setOllamaEndpoint,
    openRouterModel,
    setOpenRouterModel,
    ollamaModel,
    setOllamaModel,
    model,
    setModel,
    activeTools,
    setActiveTools,
    rightPanelWidth,
    setRightPanelWidth,
    saveRightPanelWidth,
    toolsPanelWidth,
    setToolsPanelWidth,
    saveToolsPanelWidth,
    toolsSplitRatio,
    setToolsSplitRatio,
    saveToolsSplitRatio,
    collapsedRepos,
    toggleRepoCollapsed,
    suppressedPanels,
    suppressPanel,
    unsuppressPanel,
    cumulativeTokens,
    addCumulativeTokens,
    cumulativeCost,
    addCumulativeCost,
    resetUsage,
  };
}
