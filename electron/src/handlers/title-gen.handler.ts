import { ipcMain } from "electron";
import { log } from "../lib/logger";
import { getSDK } from "../lib/sdk";
import { gitExec } from "../lib/git-exec";

type LlmProvider = "openrouter" | "ollama";

function applyProviderOptions(
  baseOptions: Record<string, unknown>,
  {
    provider,
    model,
    openRouterKey,
    ollamaEndpoint,
  }: {
    provider: LlmProvider;
    model?: string;
    openRouterKey?: string;
    ollamaEndpoint?: string;
  },
): { options: Record<string, unknown>; error?: string } {
  const opts: Record<string, unknown> = { ...baseOptions };
  const currentEnv = (process.env ?? {}) as Record<string, string | undefined>;

  if (provider === "openrouter") {
    const key = (openRouterKey || "").trim();
    if (!key) return { options: opts, error: "OpenRouter API key is required." };

    opts.env = {
      ...currentEnv,
      ANTHROPIC_BASE_URL: "https://openrouter.ai/api",
      ANTHROPIC_AUTH_TOKEN: key,
      ANTHROPIC_API_KEY: "",
    };
    opts.dangerouslyIgnoreLogin = true;
    opts.ignoreLogin = true;
    opts.ignoreLoginCheck = true;
    opts.skipLoginCheck = true;
    opts.settingSources = [];
    if (model) opts.model = model;
    return { options: opts };
  }

  if (provider === "ollama") {
    const endpoint = (ollamaEndpoint || "http://localhost:11434").trim().replace(/\/+$/, "");
    opts.env = {
      ...currentEnv,
      ANTHROPIC_BASE_URL: `${endpoint}/v1`,
      ANTHROPIC_AUTH_TOKEN: "ollama",
      ANTHROPIC_API_KEY: "",
    };
    opts.dangerouslyIgnoreLogin = true;
    opts.ignoreLogin = true;
    opts.ignoreLoginCheck = true;
    opts.skipLoginCheck = true;
    opts.settingSources = [];
    if (model) opts.model = model;
    return { options: opts };
  }

  // Agent defaults
  opts.settingSources = ["project", "user"];
  opts.model = model || "z-ai/glm-4.5-air:free";
  return { options: opts };
}

function looksLikeErrorTitle(raw: string): boolean {
  const v = raw.toLowerCase();
  return (
    v.includes("not logged in") ||
    v.includes("please run /login") ||
    v.includes("selected model") ||
    v.includes("run --model") ||
    v.includes("issue with the selected model")
  );
}

export function register(): void {
  const handleBoth = (
    suffix: string,
    handler: (
      event: Electron.IpcMainInvokeEvent,
      payload: {
        message: string;
        cwd?: string;
        llmProvider?: LlmProvider;
        model?: string;
        openRouterKey?: string;
        ollamaEndpoint?: string;
      },
    ) => Promise<{ title?: string; error?: string } | { error: string }>,
  ): void => {
    ipcMain.handle(`oagent:${suffix}`, handler);
    ipcMain.handle(`agent:${suffix}`, handler);
  };

  handleBoth(
    "generate-title",
    async (
      _event,
      {
        message,
        cwd,
        llmProvider,
        model,
        openRouterKey,
        ollamaEndpoint,
      }: {
        message: string;
        cwd?: string;
        llmProvider?: LlmProvider;
        model?: string;
        openRouterKey?: string;
        ollamaEndpoint?: string;
    },
  ) => {
    try {
      const query = await getSDK();
      const truncatedMsg = message.length > 500 ? message.slice(0, 500) + "..." : message;
      const prompt = `Generate a very short title (3-7 words) for a chat that starts with this message. Reply with ONLY the title, no quotes, no punctuation at the end.\n\nMessage: ${truncatedMsg}`;

      const provider = llmProvider ?? "agent";
      const baseOptions: Record<string, unknown> = {
        cwd: cwd || process.cwd(),
        maxTurns: 1,
        permissionMode: "bypassPermissions",
        allowDangerouslySkipPermissions: true,
        persistSession: false,
      };
      const providerApplied = applyProviderOptions(baseOptions, {
        provider,
        model,
        openRouterKey,
        ollamaEndpoint,
      });
      if (providerApplied.error) return { error: providerApplied.error };

      log("TITLE_GEN", `Spawning for: "${truncatedMsg.slice(0, 80)}..." cwd=${cwd} provider=${provider} model=${String(providerApplied.options.model || "")}`);

      const q = query({
        prompt,
        options: providerApplied.options,
      });

      const timeout = setTimeout(() => {
        q.close();
      }, 15000);

      try {
        for await (const msg of q) {
          const m = msg as Record<string, unknown>;
          if (m.type === "result") {
            clearTimeout(timeout);
            const raw = ((m.result as string) || "").split("\n")[0].trim();
            if (!raw || looksLikeErrorTitle(raw)) {
              return { error: raw || "empty result" };
            }
            log("TITLE_GEN", `Generated: "${raw}"`);
            return { title: raw };
          }
        }
      } catch (err) {
        clearTimeout(timeout);
        log("TITLE_GEN_ERR", (err as Error).message);
        return { error: (err as Error).message };
      }

      clearTimeout(timeout);
      return { error: "No result received" };
    } catch (err) {
      log("TITLE_GEN_ERR", `spawn error: ${(err as Error).message}`);
      return { error: (err as Error).message };
    }
  });

  ipcMain.handle(
    "git:generate-commit-message",
    async (
      _event,
      {
        cwd,
        llmProvider,
        model,
        openRouterKey,
        ollamaEndpoint,
      }: {
        cwd: string;
        llmProvider?: LlmProvider;
        model?: string;
        openRouterKey?: string;
        ollamaEndpoint?: string;
      },
    ) => {
    try {
      let diff: string;
      try {
        diff = (await gitExec(["diff", "--staged"], cwd)).trim();
      } catch { diff = ""; }
      if (!diff) {
        try {
          diff = (await gitExec(["diff"], cwd)).trim();
        } catch { diff = ""; }
      }
      if (!diff) {
        try {
          diff = (await gitExec(["status", "--short"], cwd)).trim();
        } catch { diff = ""; }
      }
      if (!diff) return { error: "No changes to describe" };

      const maxChars = 500000;
      const truncated = diff.length > maxChars ? diff.slice(0, maxChars) + "\n... (truncated)" : diff;

      const prompt = `Generate a commit message for the following diff. Follow any OAGENT.md instructions for commit message format and style. Reply with ONLY the commit message, nothing else.\n\n${truncated}`;

      log("COMMIT_MSG_GEN", `Generating for ${diff.length} chars of diff`);

      const query = await getSDK();
      const provider = llmProvider ?? "agent";
      const baseOptions: Record<string, unknown> = {
        cwd,
        maxTurns: 1,
        permissionMode: "bypassPermissions",
        allowDangerouslySkipPermissions: true,
        persistSession: false,
        systemPrompt: { type: "preset", preset: "claude_code" },
      };
      const providerApplied = applyProviderOptions(baseOptions, {
        provider,
        model,
        openRouterKey,
        ollamaEndpoint,
      });
      if (providerApplied.error) return { error: providerApplied.error };

      log("COMMIT_MSG_GEN", `provider=${provider} model=${String(providerApplied.options.model || "")}`);

      const q = query({
        prompt,
        options: providerApplied.options,
      });

      const timeout = setTimeout(() => { q.close(); }, 15000);

      try {
        for await (const msg of q) {
          const m = msg as Record<string, unknown>;
          if (m.type === "result") {
            clearTimeout(timeout);
            const raw = ((m.result as string) || "").split("\n")[0].trim();
            log("COMMIT_MSG_GEN", `Generated: "${raw}"`);
            return { message: raw || undefined, error: raw ? undefined : "empty result" };
          }
        }
      } catch (err) {
        clearTimeout(timeout);
        log("COMMIT_MSG_GEN_ERR", (err as Error).message);
        return { error: (err as Error).message };
      }

      clearTimeout(timeout);
      return { error: "No result received" };
    } catch (err) {
      log("COMMIT_MSG_GEN_ERR", `spawn error: ${(err as Error).message}`);
      return { error: (err as Error).message };
    }
  });
}
