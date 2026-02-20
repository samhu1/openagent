import { BrowserWindow, ipcMain } from "electron";
import { spawn, ChildProcess } from "child_process";
import { Readable, Writable } from "stream";
import crypto from "crypto";
import { log } from "../lib/logger";
import { getAgent } from "../lib/oagent-registry";
import { getMcpAuthHeaders } from "../lib/mcp-oauth-flow";

// OAP SDK is ESM-only, must be async-imported
let _oap: typeof import("@agentclientprotocol/sdk") | null = null;
async function getOAP() {
  if (!_oap) _oap = await import("@agentclientprotocol/sdk");
  return _oap;
}

interface OAPSessionEntry {
  process: ChildProcess;
  connection: unknown; // ClientSideConnection — typed as unknown to avoid top-level ESM import
  oapSessionId: string;
  internalId: string;
  eventCounter: number;
  pendingPermissions: Map<string, { resolve: (response: unknown) => void }>;
  cwd: string;
  supportsLoadSession: boolean;
  /** True while session/load is in-flight — suppresses history replay notifications from reaching the renderer */
  isReloading: boolean;
}

export const oapSessions = new Map<string, OAPSessionEntry>();

// Buffer latest config options per session — survives the renderer's DRAFT→active transition
// where events arrive before useOAP's listener is subscribed
const configBuffer = new Map<string, unknown[]>();

/** One-line summary for each OAP session update (mirrors summarizeEvent for Agent) */
function summarizeUpdate(update: Record<string, unknown>): string {
  const kind = update.sessionUpdate as string;
  switch (kind) {
    case "agent_message_chunk": {
      const c = update.content as { type?: string; text?: string } | undefined;
      return `agent_message_chunk text_len=${c?.text?.length ?? 0}`;
    }
    case "agent_thought_chunk": {
      const c = update.content as { type?: string; text?: string } | undefined;
      return `agent_thought_chunk text_len=${c?.text?.length ?? 0}`;
    }
    case "user_message_chunk": {
      const c = update.content as { type?: string; text?: string } | undefined;
      return `user_message_chunk text_len=${c?.text?.length ?? 0}`;
    }
    case "tool_call": {
      const tc = update as { toolCallId?: string; title?: string; kind?: string; status?: string };
      return `tool_call id=${tc.toolCallId?.slice(0, 12)} title="${tc.title}" kind=${tc.kind ?? "?"} status=${tc.status}`;
    }
    case "tool_call_update": {
      const tcu = update as { toolCallId?: string; status?: string; rawOutput?: unknown; content?: unknown[] };
      const hasOutput = tcu.rawOutput != null;
      const contentCount = Array.isArray(tcu.content) ? tcu.content.length : 0;
      return `tool_call_update id=${tcu.toolCallId?.slice(0, 12)} status=${tcu.status ?? "?"} hasOutput=${hasOutput} content_items=${contentCount}`;
    }
    case "plan": {
      const p = update as { entries?: unknown[] };
      return `plan entries=${p.entries?.length ?? 0}`;
    }
    case "usage_update": {
      const uu = update as { size?: number; used?: number; cost?: { amount?: number; currency?: string } };
      const parts: string[] = [];
      if (uu.size != null) parts.push(`size=${uu.size}`);
      if (uu.used != null) parts.push(`used=${uu.used}`);
      if (uu.cost) parts.push(`cost=$${uu.cost.amount}`);
      return `usage_update ${parts.join(" ")}`;
    }
    case "session_info_update": {
      const si = update as { title?: string };
      return `session_info_update title="${si.title ?? ""}"`;
    }
    case "current_mode_update": {
      const cm = update as { currentModeId?: string };
      return `current_mode_update mode=${cm.currentModeId}`;
    }
    case "config_option_update": {
      const co = update as { configOptions?: unknown[] };
      return `config_option_update options_count=${co.configOptions?.length ?? 0}`;
    }
    case "available_commands_update": {
      const ac = update as { availableCommands?: unknown[] };
      return `available_commands_update count=${ac.availableCommands?.length ?? 0}`;
    }
    default:
      return `${kind} (unknown)`;
  }
}

export function register(getMainWindow: () => BrowserWindow | null): void {

  // Forward renderer-side OAP logs to main process log file
  ipcMain.on("oap:log", (_event, label: string, data: unknown) => {
    log(`OAP_UI:${label}`, data);
  });

  ipcMain.handle("oap:start", async (_event, options: { agentId: string; cwd: string; mcpServers?: Array<{ name: string; transport: string; command?: string; args?: string[]; env?: Record<string, string>; url?: string; headers?: Record<string, string> }> }) => {
    log("OAP_SPAWN", `oap:start called with agentId=${options.agentId} cwd=${options.cwd}`);

    const agentDef = getAgent(options.agentId);
    if (!agentDef || agentDef.engine !== "oap") {
      const err = `Agent "${options.agentId}" not found or not an OAP agent`;
      log("OAP_SPAWN", `ERROR: ${err}`);
      return { error: err };
    }
    if (!agentDef.binary) {
      const err = `Agent "${options.agentId}" has no binary configured`;
      log("OAP_SPAWN", `ERROR: ${err}`);
      return { error: err };
    }

    let proc: ReturnType<typeof spawn> | null = null;
    try {
      log("OAP_SPAWN", `Importing OAP SDK...`);
      const oap = await getOAP();
      const internalId = crypto.randomUUID();
      log("OAP_SPAWN", {
        sessionId: internalId,
        agent: agentDef.name,
        binary: agentDef.binary,
        args: agentDef.args ?? [],
        cwd: options.cwd,
      });

      proc = spawn(agentDef.binary, agentDef.args ?? [], {
        stdio: ["pipe", "pipe", "pipe"],
        env: { ...process.env, ...agentDef.env },
      });

      proc.on("error", (err) => {
        log("OAP_SPAWN", `ERROR: spawn failed: ${err.message}`);
      });

      proc.stderr?.on("data", (chunk: Buffer) => {
        log("OAP_STDERR", `session=${internalId.slice(0, 8)} ${chunk.toString().trim()}`);
      });

      proc.on("exit", (code) => {
        const entry = oapSessions.get(internalId);
        log("OAP_EXIT", `session=${internalId.slice(0, 8)} code=${code} total_events=${entry?.eventCounter ?? 0}`);
        // Resolve any pending permissions so the SDK doesn't hang
        if (entry) {
          for (const [, resolver] of entry.pendingPermissions) {
            resolver.resolve({ outcome: { outcome: "cancelled" } });
          }
          entry.pendingPermissions.clear();
        }
        getMainWindow()?.webContents.send("oap:exit", {
          _sessionId: internalId,
          code,
        });
        oapSessions.delete(internalId);
        configBuffer.delete(internalId);
      });

      log("OAP_SPAWN", `Process spawned pid=${proc.pid}, creating ClientSideConnection...`);
      const input = Writable.toWeb(proc.stdin!) as WritableStream;
      const output = Readable.toWeb(proc.stdout!) as ReadableStream<Uint8Array>;
      const stream = oap.ndJsonStream(input, output);

      const pendingPermissions = new Map<string, { resolve: (r: unknown) => void }>();

      const connection = new oap.ClientSideConnection((_agent) => ({
        async sessionUpdate(params: Record<string, unknown>) {
          const update = (params as { update: Record<string, unknown> }).update;
          const entry = oapSessions.get(internalId);
          if (entry) entry.eventCounter++;
          const count = entry?.eventCounter ?? 0;
          const summary = summarizeUpdate(update);
          log("oap_event", `session=${internalId.slice(0, 8)} #${count} ${entry?.isReloading ? "[suppressed] " : ""}${summary}`);

          // Full dump for tool calls and tool results (like EVENT_FULL for Agent)
          const eventKind = update?.sessionUpdate as string;
          if (eventKind === "tool_call" || eventKind === "tool_call_update") {
            log("oap_event_FULL", update);
          }

          // Buffer config options so renderer can retrieve them even if events arrive
          // before useOAP's listener is subscribed (during DRAFT→active transition)
          if (eventKind === "config_option_update") {
            const configOptions = (update as { configOptions: unknown[] }).configOptions;
            configBuffer.set(internalId, configOptions);
          }

          // During session/load, the agent streams back history as notifications.
          // We suppress these from reaching the renderer since the UI already has
          // the full conversation — forwarding would cause duplicate messages.
          if (entry?.isReloading) return;

          getMainWindow()?.webContents.send("oap:event", {
            _sessionId: internalId,
            sessionId: (params as { sessionId: string }).sessionId,
            update,
          });
        },

        async requestPermission(params: Record<string, unknown>) {
          return new Promise((resolve) => {
            const requestId = crypto.randomUUID();
            const toolCall = (params as { toolCall: Record<string, unknown> }).toolCall;
            const options = (params as { options: unknown[] }).options;
            pendingPermissions.set(requestId, { resolve });

            log("OAP_PERMISSION_REQUEST", {
              session: internalId.slice(0, 8),
              requestId,
              tool: toolCall?.title,
              kind: toolCall?.kind,
              toolCallId: (toolCall?.toolCallId as string)?.slice(0, 12),
              optionCount: Array.isArray(options) ? options.length : 0,
            });

            getMainWindow()?.webContents.send("oap:permission_request", {
              _sessionId: internalId,
              requestId,
              sessionId: (params as { sessionId: string }).sessionId,
              toolCall,
              options,
            });
          });
        },

        async readTextFile(params: { uri: string }) {
          log("OAP_FS", `readTextFile uri=${params.uri}`);
          const fs = await import("fs/promises");
          const content = await fs.readFile(params.uri, "utf-8");
          log("OAP_FS", `readTextFile result len=${content.length}`);
          return { content };
        },
        async writeTextFile(params: { uri: string; content: string }) {
          log("OAP_FS", `writeTextFile uri=${params.uri} len=${params.content.length}`);
          const fs = await import("fs/promises");
          await fs.writeFile(params.uri, params.content, "utf-8");
          return {};
        },
      }), stream);

      log("OAP_SPAWN", `Initializing protocol...`);
      const initResult = await connection.initialize({
        protocolVersion: oap.PROTOCOL_VERSION,
        clientCapabilities: {
          fs: { readTextFile: true, writeTextFile: true },
        },
      });
      const caps = (initResult as { agentCapabilities?: { loadSession?: boolean } }).agentCapabilities;
      const supportsLoadSession = caps?.loadSession === true;
      log("OAP_SPAWN", `Initialized protocol v${initResult.protocolVersion} for ${agentDef.name} (loadSession=${supportsLoadSession})`);

      const oapMcpServers = (await Promise.all((options.mcpServers ?? []).map(async (s) => {
        if (s.transport === "stdio") {
          if (!s.command) { log("OAP_MCP_WARN", `Server "${s.name}" (stdio) missing command — skipping`); return null; }
          return {
            name: s.name,
            command: s.command,
            args: s.args ?? [],
            env: s.env ? Object.entries(s.env).map(([name, value]) => ({ name, value })) : [],
          };
        }
        if (!s.url) { log("OAP_MCP_WARN", `Server "${s.name}" (${s.transport}) missing URL — skipping`); return null; }
        const authHeaders = await getMcpAuthHeaders(s.name, s.url);
        const mergedHeaders = { ...s.headers, ...authHeaders };
        return {
          type: s.transport as "http" | "sse",
          name: s.name,
          url: s.url,
          headers: Object.entries(mergedHeaders).map(([name, value]) => ({ name, value })),
        };
      }))).filter(Boolean);

      log("OAP_SPAWN", `Creating new session with ${oapMcpServers.length} MCP server(s)...`);
      const sessionResult = await connection.newSession({
        cwd: options.cwd,
        mcpServers: oapMcpServers,
      });
      log("OAP_SPAWN", `Created session ${sessionResult.sessionId} for ${agentDef.name}`);

      const entry: OAPSessionEntry = {
        process: proc,
        connection,
        oapSessionId: sessionResult.sessionId,
        internalId,
        eventCounter: 0,
        pendingPermissions,
        cwd: options.cwd,
        supportsLoadSession,
        isReloading: false,
      };
      oapSessions.set(internalId, entry);

      // Merge: configOptions from newSession response + any that arrived via events during newSession
      const fromResponse = sessionResult.configOptions ?? [];
      const fromEvents = configBuffer.get(internalId) ?? [];
      let configOptions = fromResponse.length ? fromResponse : fromEvents;

      // Fallback: if no configOptions but models field exists (unstable API), synthesize a model config option
      const models = (sessionResult as Record<string, unknown>).models as { currentModelId?: string; availableModels?: Array<{ modelId: string; name: string; description?: string }> } | null;
      if (configOptions.length === 0 && models?.availableModels?.length) {
        log("OAP_SPAWN", `No configOptions, synthesizing from ${models.availableModels.length} models (unstable API)`);
        configOptions = [{
          id: "model",
          name: "Model",
          category: "model",
          type: "select",
          currentValue: models.currentModelId ?? models.availableModels[0].modelId,
          options: models.availableModels.map(m => ({
            value: m.modelId,
            name: m.name,
            description: m.description ?? null,
          })),
        }];
      }

      if (configOptions.length) configBuffer.set(internalId, configOptions);
      log("OAP_SPAWN", `Session has ${configOptions.length} config options (response=${fromResponse.length}, buffered=${fromEvents.length}, models=${models?.availableModels?.length ?? 0})`);

      // Derive MCP statuses — OAP doesn't report them, so infer from config
      const mcpStatuses = (options.mcpServers ?? []).map(s => ({
        name: s.name,
        status: "connected" as const,
      }));

      return {
        sessionId: internalId,
        agentSessionId: sessionResult.sessionId,
        agentName: agentDef.name,
        configOptions,
        mcpStatuses,
      };
    } catch (err) {
      // Kill the spawned process to avoid orphans
      try { proc?.kill(); } catch { /* already dead */ }
      const msg = err instanceof Error ? err.message : String(err);
      log("OAP_SPAWN", `ERROR: ${msg}`);
      if (err instanceof Error && err.stack) {
        log("OAP_SPAWN", `Stack: ${err.stack}`);
      }
      return { error: msg };
    }
  });

  // Revive a dead OAP session after app restart.
  // Spawns a fresh agent process and calls session/load (if supported) to restore context,
  // or falls back to newSession (fresh context, UI messages already restored from disk).
  ipcMain.handle("oap:revive-session", async (_event, options: {
    agentId: string;
    cwd: string;
    agentSessionId?: string; // OAP-side session ID from previous run
    mcpServers?: Array<{ name: string; transport: string; command?: string; args?: string[]; env?: Record<string, string>; url?: string; headers?: Record<string, string> }>;
  }) => {
    log("OAP_REVIVE", `agentId=${options.agentId} agentSessionId=${options.agentSessionId?.slice(0, 12) ?? "none"} cwd=${options.cwd}`);

    const agentDef = getAgent(options.agentId);
    if (!agentDef || agentDef.engine !== "oap" || !agentDef.binary) {
      return { error: `Agent "${options.agentId}" not found or not an OAP agent` };
    }

    let reviveProc: ReturnType<typeof spawn> | null = null;
    let reviveInternalId: string | null = null;
    try {
      const oap = await getOAP();
      const internalId = crypto.randomUUID();
      reviveInternalId = internalId;

      const proc = spawn(agentDef.binary, agentDef.args ?? [], {
        stdio: ["pipe", "pipe", "pipe"],
        env: { ...process.env, ...agentDef.env },
      });
      reviveProc = proc;

      proc.on("error", (err) => log("OAP_REVIVE", `ERROR: spawn failed: ${err.message}`));
      proc.stderr?.on("data", (chunk: Buffer) => log("OAP_STDERR", `session=${internalId.slice(0, 8)} ${chunk.toString().trim()}`));
      proc.on("exit", (code) => {
        const entry = oapSessions.get(internalId);
        log("OAP_EXIT", `session=${internalId.slice(0, 8)} code=${code}`);
        if (entry) {
          for (const [, resolver] of entry.pendingPermissions) {
            resolver.resolve({ outcome: { outcome: "cancelled" } });
          }
          entry.pendingPermissions.clear();
        }
        getMainWindow()?.webContents.send("oap:exit", { _sessionId: internalId, code });
        oapSessions.delete(internalId);
        configBuffer.delete(internalId);
      });

      const input = Writable.toWeb(proc.stdin!) as WritableStream;
      const output = Readable.toWeb(proc.stdout!) as ReadableStream<Uint8Array>;
      const stream = oap.ndJsonStream(input, output);
      const pendingPermissions = new Map<string, { resolve: (r: unknown) => void }>();

      const connection = new oap.ClientSideConnection((_agent) => ({
        async sessionUpdate(params: Record<string, unknown>) {
          const entry = oapSessions.get(internalId);
          if (entry) entry.eventCounter++;
          const update = (params as { update: Record<string, unknown> }).update;
          if (entry?.isReloading) return; // suppress history replay
          getMainWindow()?.webContents.send("oap:event", {
            _sessionId: internalId,
            sessionId: (params as { sessionId: string }).sessionId,
            update,
          });
        },
        async requestPermission(params: Record<string, unknown>) {
          return new Promise((resolve) => {
            const requestId = crypto.randomUUID();
            const toolCall = (params as { toolCall: Record<string, unknown> }).toolCall;
            const opts = (params as { options: unknown[] }).options;
            pendingPermissions.set(requestId, { resolve });
            getMainWindow()?.webContents.send("oap:permission_request", {
              _sessionId: internalId, requestId,
              sessionId: (params as { sessionId: string }).sessionId,
              toolCall, options: opts,
            });
          });
        },
        async readTextFile(params: { uri: string }) {
          const fs = await import("fs/promises");
          return { content: await fs.readFile(params.uri, "utf-8") };
        },
        async writeTextFile(params: { uri: string; content: string }) {
          const fs = await import("fs/promises");
          await fs.writeFile(params.uri, params.content, "utf-8");
          return {};
        },
      }), stream);

      const initResult = await connection.initialize({
        protocolVersion: oap.PROTOCOL_VERSION,
        clientCapabilities: { fs: { readTextFile: true, writeTextFile: true } },
      });

      const caps = (initResult as { agentCapabilities?: { loadSession?: boolean } }).agentCapabilities;
      const supportsLoadSession = caps?.loadSession === true;
      log("OAP_REVIVE", `initialized (loadSession=${supportsLoadSession})`);

      const oapMcpServers = await Promise.all((options.mcpServers ?? []).map(async (s) => {
        if (s.transport === "stdio") {
          return { name: s.name, command: s.command!, args: s.args ?? [], env: s.env ? Object.entries(s.env).map(([name, value]) => ({ name, value })) : [] };
        }
        const authHeaders = await getMcpAuthHeaders(s.name, s.url!);
        return { type: s.transport as "http" | "sse", name: s.name, url: s.url!, headers: Object.entries({ ...s.headers, ...authHeaders }).map(([name, value]) => ({ name, value })) };
      }));

      let oapSessionId: string;
      let usedLoad = false;
      let configOptions: unknown[] = [];

      type SessionResult = { sessionId?: string; configOptions?: unknown[]; models?: unknown };

      if (supportsLoadSession && options.agentSessionId) {
        // Restore full context — suppress history replay from reaching the renderer
        const conn = connection as { loadSession: (p: unknown) => Promise<SessionResult> };
        const entry: OAPSessionEntry = { process: proc, connection, oapSessionId: options.agentSessionId, internalId, eventCounter: 0, pendingPermissions, cwd: options.cwd, supportsLoadSession, isReloading: true };
        oapSessions.set(internalId, entry);
        const loadResult = await conn.loadSession({ sessionId: options.agentSessionId, cwd: options.cwd, mcpServers: oapMcpServers });
        entry.isReloading = false;
        oapSessionId = options.agentSessionId;
        usedLoad = true;
        configOptions = (loadResult.configOptions ?? configBuffer.get(internalId) ?? []) as unknown[];
        log("OAP_REVIVE", `loadSession OK, session=${oapSessionId.slice(0, 12)} configOptions=${configOptions.length}`);
      } else {
        // Fall back to fresh session — UI messages already restored from disk
        const conn = connection as { newSession: (p: unknown) => Promise<SessionResult> };
        const sessionResult = await conn.newSession({ cwd: options.cwd, mcpServers: oapMcpServers });
        oapSessionId = sessionResult.sessionId!;
        const entry: OAPSessionEntry = { process: proc, connection, oapSessionId, internalId, eventCounter: 0, pendingPermissions, cwd: options.cwd, supportsLoadSession, isReloading: false };
        oapSessions.set(internalId, entry);

        // Build configOptions same way as oap:start (response + events + models fallback)
        const fromResponse = (sessionResult.configOptions ?? []) as unknown[];
        const fromEvents = (configBuffer.get(internalId) ?? []) as unknown[];
        configOptions = fromResponse.length ? fromResponse : fromEvents;
        const models = (sessionResult as Record<string, unknown>).models as { currentModelId?: string; availableModels?: Array<{ modelId: string; name: string; description?: string }> } | null;
        if (configOptions.length === 0 && models?.availableModels?.length) {
          configOptions = [{ id: "model", name: "Model", category: "model", type: "select", currentValue: models.currentModelId ?? models.availableModels[0].modelId, options: models.availableModels.map(m => ({ value: m.modelId, name: m.name, description: m.description ?? null })) }];
        }
        log("OAP_REVIVE", `newSession fallback, session=${oapSessionId.slice(0, 12)} configOptions=${configOptions.length}`);
      }

      if (configOptions.length) configBuffer.set(internalId, configOptions);
      const mcpStatuses = (options.mcpServers ?? []).map(s => ({ name: s.name, status: "connected" as const }));
      return { sessionId: internalId, agentSessionId: oapSessionId, usedLoad, configOptions, mcpStatuses };
    } catch (err) {
      // Kill process and clean up any partial session entry
      try { reviveProc?.kill(); } catch { /* already dead */ }
      if (reviveInternalId) {
        oapSessions.delete(reviveInternalId);
        configBuffer.delete(reviveInternalId);
      }
      const msg = err instanceof Error ? err.message : String(err);
      log("OAP_REVIVE", `ERROR: ${msg}`);
      return { error: msg };
    }
  });

  ipcMain.handle("oap:prompt", async (_event, { sessionId, text, images }: { sessionId: string; text: string; images?: Array<{ data: string; mediaType: string }> }) => {
    const session = oapSessions.get(sessionId);
    if (!session) {
      log("OAP_SEND", `ERROR: session ${sessionId?.slice(0, 8)} not found`);
      return { error: "Session not found" };
    }

    log("OAP_SEND", `session=${sessionId.slice(0, 8)} text=${text.slice(0, 500)} images=${images?.length ?? 0}`);

    const prompt: Array<{ type: string; text?: string; data?: string; mimeType?: string }> = [];
    if (images) {
      for (const img of images) {
        prompt.push({ type: "image", data: img.data, mimeType: img.mediaType });
      }
    }
    prompt.push({ type: "text", text });

    try {
      const conn = session.connection as { prompt: (params: unknown) => Promise<{ stopReason: string; usage?: unknown }> };
      const result = await conn.prompt({
        sessionId: session.oapSessionId,
        prompt,
      });

      log("OAP_TURN_COMPLETE", `session=${sessionId.slice(0, 8)} stopReason=${result.stopReason} usage=${JSON.stringify(result.usage ?? null)}`);

      getMainWindow()?.webContents.send("oap:turn_complete", {
        _sessionId: sessionId,
        stopReason: result.stopReason,
        usage: result.usage,
      });

      return { ok: true };
    } catch (err) {
      log("OAP_SEND", `ERROR: session=${sessionId.slice(0, 8)} ${String(err)}`);
      return { error: String(err) };
    }
  });

  ipcMain.handle("oap:stop", async (_event, sessionId: string) => {
    const session = oapSessions.get(sessionId);
    if (!session) {
      log("OAP_STOP", `session=${sessionId?.slice(0, 8)} already removed`);
      return { ok: true };
    }
    log("OAP_STOP", `session=${sessionId.slice(0, 8)} killing pid=${session.process.pid} total_events=${session.eventCounter}`);
    // Drain pending permissions before killing
    for (const [, resolver] of session.pendingPermissions) {
      resolver.resolve({ outcome: { outcome: "cancelled" } });
    }
    session.pendingPermissions.clear();
    session.process.kill();
    oapSessions.delete(sessionId);
    configBuffer.delete(sessionId);
    return { ok: true };
  });

  // Reload an existing OAP session with a new MCP server list using session/load.
  // This preserves full conversation context on the agent side — no process restart needed.
  // Returns { ok: true, supportsLoad: true } if successful, { supportsLoad: false } if not supported.
  ipcMain.handle("oap:reload-session", async (_event, { sessionId, mcpServers }: {
    sessionId: string;
    mcpServers?: Array<{ name: string; transport: string; command?: string; args?: string[]; env?: Record<string, string>; url?: string; headers?: Record<string, string> }>;
  }) => {
    const session = oapSessions.get(sessionId);
    if (!session) {
      log("OAP_RELOAD", `ERROR: session ${sessionId?.slice(0, 8)} not found`);
      return { error: "Session not found" };
    }
    if (!session.supportsLoadSession) {
      log("OAP_RELOAD", `session=${sessionId.slice(0, 8)} agent does not support session/load, falling back to restart`);
      return { supportsLoad: false };
    }

    log("OAP_RELOAD", `session=${sessionId.slice(0, 8)} calling loadSession with ${mcpServers?.length ?? 0} MCP server(s)`);

    const oapMcpServers = await Promise.all((mcpServers ?? []).map(async (s) => {
      if (s.transport === "stdio") {
        return {
          name: s.name,
          command: s.command!,
          args: s.args ?? [],
          env: s.env ? Object.entries(s.env).map(([name, value]) => ({ name, value })) : [],
        };
      }
      const authHeaders = await getMcpAuthHeaders(s.name, s.url!);
      const mergedHeaders = { ...s.headers, ...authHeaders };
      return {
        type: s.transport as "http" | "sse",
        name: s.name,
        url: s.url!,
        headers: Object.entries(mergedHeaders).map(([name, value]) => ({ name, value })),
      };
    }));

    try {
      const conn = session.connection as {
        loadSession: (params: unknown) => Promise<{ configOptions?: unknown[]; modes?: unknown; models?: unknown }>;
      };
      // Suppress history replay notifications so the renderer doesn't get duplicates
      session.isReloading = true;
      try {
        await conn.loadSession({
          sessionId: session.oapSessionId,
          cwd: session.cwd,
          mcpServers: oapMcpServers,
        });
      } finally {
        // Always reset — even if loadSession throws or process crashes
        if (oapSessions.has(sessionId)) {
          oapSessions.get(sessionId)!.isReloading = false;
        }
      }
      log("OAP_RELOAD", `session=${sessionId.slice(0, 8)} loadSession OK`);
      return { ok: true, supportsLoad: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log("OAP_RELOAD", `ERROR: session=${sessionId.slice(0, 8)} loadSession failed: ${msg}`);
      return { error: msg, supportsLoad: true };
    }
  });

  ipcMain.handle("oap:cancel", async (_event, sessionId: string) => {
    const session = oapSessions.get(sessionId);
    if (!session) {
      log("OAP_CANCEL", `ERROR: session ${sessionId?.slice(0, 8)} not found`);
      return { error: "Session not found" };
    }

    const pendingCount = session.pendingPermissions.size;
    log("OAP_CANCEL", `session=${sessionId.slice(0, 8)} cancelling (${pendingCount} pending permissions)`);

    for (const [, resolver] of session.pendingPermissions) {
      resolver.resolve({ outcome: { outcome: "cancelled" } });
    }
    session.pendingPermissions.clear();

    try {
      const conn = session.connection as { cancel: (params: unknown) => Promise<unknown> };
      await conn.cancel({ sessionId: session.oapSessionId });
      log("OAP_CANCEL", `session=${sessionId.slice(0, 8)} acknowledged`);
    } catch (err) {
      log("OAP_CANCEL", `ERROR: session=${sessionId.slice(0, 8)} ${String(err)}`);
    }
    return { ok: true };
  });

  ipcMain.handle("oap:set-config", async (_event, { sessionId, configId, value }: { sessionId: string; configId: string; value: string }) => {
    const session = oapSessions.get(sessionId);
    if (!session) {
      log("OAP_CONFIG", `ERROR: session ${sessionId?.slice(0, 8)} not found`);
      return { error: "Session not found" };
    }
    log("OAP_CONFIG", `session=${sessionId.slice(0, 8)} setting ${configId}=${value}`);
    try {
      const conn = session.connection as {
        setSessionConfigOption: (params: unknown) => Promise<{ configOptions: unknown[] }>;
        unstable_setSessionModel?: (params: unknown) => Promise<unknown>;
      };

      // Try the stable config option API first
      try {
        const result = await conn.setSessionConfigOption({
          sessionId: session.oapSessionId,
          configId,
          value,
        });
        log("OAP_CONFIG", `session=${sessionId.slice(0, 8)} ${configId}=${value} OK (via setSessionConfigOption)`);
        if (result.configOptions) configBuffer.set(sessionId, result.configOptions);
        return { configOptions: result.configOptions };
      } catch (configErr) {
        // If it fails and this is the model config, try the unstable setSessionModel API
        if (configId === "model" && conn.unstable_setSessionModel) {
          log("OAP_CONFIG", `session=${sessionId.slice(0, 8)} setSessionConfigOption failed, trying unstable_setSessionModel...`);
          await conn.unstable_setSessionModel({
            sessionId: session.oapSessionId,
            modelId: value,
          });
          log("OAP_CONFIG", `session=${sessionId.slice(0, 8)} model=${value} OK (via unstable_setSessionModel)`);

          // Update the synthesized config option in the buffer
          const buffered = configBuffer.get(sessionId) as Array<{ id: string; currentValue: string }> | undefined;
          if (buffered) {
            const modelOpt = buffered.find(o => o.id === "model");
            if (modelOpt) modelOpt.currentValue = value;
            return { configOptions: buffered };
          }
          return {};
        }
        throw configErr;
      }
    } catch (err) {
      log("OAP_CONFIG", `ERROR: session=${sessionId.slice(0, 8)} ${String(err)}`);
      return { error: String(err) };
    }
  });

  // Retrieve buffered config options — used by renderer when useOAP first mounts
  // and may have missed config_option_update events during DRAFT→active transition
  ipcMain.handle("oap:get-config-options", async (_event, sessionId: string) => {
    return { configOptions: configBuffer.get(sessionId) ?? [] };
  });

  ipcMain.handle("oap:permission_response", async (_event, { sessionId, requestId, optionId }: { sessionId: string; requestId: string; optionId: string }) => {
    const session = oapSessions.get(sessionId);
    if (!session) {
      log("OAP_PERMISSION_RESPONSE", `ERROR: session ${sessionId?.slice(0, 8)} not found`);
      return { error: "Session not found" };
    }

    const resolver = session.pendingPermissions.get(requestId);
    if (!resolver) {
      log("OAP_PERMISSION_RESPONSE", `ERROR: session=${sessionId.slice(0, 8)} no pending permission for requestId=${requestId}`);
      return { error: "No pending permission" };
    }

    log("OAP_PERMISSION_RESPONSE", `session=${sessionId.slice(0, 8)} requestId=${requestId} optionId=${optionId}`);
    resolver.resolve({ outcome: { outcome: "selected", optionId } });
    session.pendingPermissions.delete(requestId);
    return { ok: true };
  });
}
