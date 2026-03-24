import { app, ipcMain } from "electron";
import fs from "fs";
import os from "os";
import path from "path";
import crypto from "crypto";
import { getDataDir } from "../lib/data-dir";
import { loadMcpServers } from "../lib/mcp-store";
import { getCurrentLogFile, getLogsDir, log } from "../lib/logger";
import { sessions } from "./oagent-sessions.handler";
import { oapSessions } from "./oap-sessions.handler";
import { terminals } from "./terminal.handler";

interface ProjectRecord {
  id: string;
  name: string;
  path: string;
}

interface DebugIssuePayload {
  generatedAt: string;
  app: Record<string, unknown>;
  runtime: Record<string, unknown>;
  projects: unknown[];
  mcp: unknown;
  logs: unknown;
}

function shortHash(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex").slice(0, 12);
}

function sanitizePath(value: string): { name: string; hash: string } {
  return {
    name: path.basename(value),
    hash: shortHash(value),
  };
}

function readProjects(): ProjectRecord[] {
  const filePath = path.join(getDataDir(), "projects.json");
  if (!fs.existsSync(filePath)) return [];
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8")) as ProjectRecord[];
  } catch {
    return [];
  }
}

function sanitizeUrl(raw?: string): string | undefined {
  if (!raw) return undefined;
  try {
    const parsed = new URL(raw);
    return `${parsed.protocol}//${parsed.hostname}${parsed.port ? `:${parsed.port}` : ""}`;
  } catch {
    return "<invalid-url>";
  }
}

function redactSensitive(text: string): string {
  const home = os.homedir();
  const escapedHome = home.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return text
    .replace(new RegExp(escapedHome, "g"), "<home>")
    .replace(/[A-Za-z]:\\[^ \n\r\t"']+/g, "<windows-path>")
    .replace(/(token|key|secret|password)=([^&\s]+)/gi, "$1=[REDACTED]")
    .replace(/\b(gh[opus]_[A-Za-z0-9]{20,})\b/g, "[REDACTED]")
    .replace(/\b(sk-or-v1-[A-Za-z0-9_-]{8,}|sk-[A-Za-z0-9_-]{8,})\b/g, "[REDACTED]")
    .replace(/\bBearer\s+[A-Za-z0-9\-._~+/]+=*\b/gi, "Bearer [REDACTED]");
}

function parseRecentLogDetails() {
  const logDir = getLogsDir();
  const fileEntries = fs.existsSync(logDir)
    ? fs.readdirSync(logDir)
        .filter((name) => name.endsWith(".log"))
        .map((name) => {
          const fullPath = path.join(logDir, name);
          const stat = fs.statSync(fullPath);
          return { name, fullPath, stat };
        })
        .sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs)
    : [];

  const recentFiles = fileEntries.slice(0, 5).map((entry) => ({
    file: entry.name,
    bytes: entry.stat.size,
    modifiedAt: new Date(entry.stat.mtimeMs).toISOString(),
  }));

  const newest = fileEntries[0];
  const labelCounts: Record<string, number> = {};
  const recentErrors: Array<{ ts: string; label: string; message: string }> = [];

  if (newest) {
    const lines = fs.readFileSync(newest.fullPath, "utf-8").split("\n").filter(Boolean);
    const tail = lines.slice(-600);
    for (const line of tail) {
      const match = line.match(/^\[(?<ts>[^\]]+)\]\s\[(?<label>[^\]]+)\]\s(?<msg>.*)$/);
      if (!match?.groups) continue;
      const ts = match.groups.ts;
      const label = match.groups.label;
      const msg = match.groups.msg;
      labelCounts[label] = (labelCounts[label] ?? 0) + 1;
      if (label.includes("ERR") || label.includes("WARN")) {
        recentErrors.push({
          ts,
          label,
          message: redactSensitive(msg).slice(0, 240),
        });
      }
    }
  }

  return {
    currentLogFile: path.basename(getCurrentLogFile()),
    recentFiles,
    labelCounts,
    recentErrors: recentErrors.slice(-25),
  };
}

function buildPayload(): DebugIssuePayload {
  const generatedAt = new Date().toISOString();
  const dataDir = getDataDir();
  const projects = readProjects();
  const logSummary = parseRecentLogDetails();

  const projectSummaries = projects.map((project) => {
    const mcpServers = loadMcpServers(project.id);
    const sessionDir = path.join(dataDir, "sessions", project.id);
    const persistedSessions = fs.existsSync(sessionDir)
      ? fs.readdirSync(sessionDir).filter((name) => name.endsWith(".json")).length
      : 0;
    return {
      id: project.id,
      name: project.name,
      path: sanitizePath(project.path),
      persistedSessions,
      mcpServers: mcpServers.map((server) => ({
        name: server.name,
        transport: server.transport,
        hasCommand: Boolean(server.command),
        argsCount: server.args?.length ?? 0,
        hasEnv: Boolean(server.env && Object.keys(server.env).length > 0),
        envKeyCount: Object.keys(server.env ?? {}).length,
        hasHeaders: Boolean(server.headers && Object.keys(server.headers).length > 0),
        headerKeyCount: Object.keys(server.headers ?? {}).length,
        endpoint: sanitizeUrl(server.url),
      })),
    };
  });

  const oauthDir = path.join(dataDir, "mcp-oauth");
  const oauthFiles = fs.existsSync(oauthDir)
    ? fs.readdirSync(oauthDir).filter((name) => name.endsWith(".json"))
    : [];

  return {
    generatedAt,
    app: {
      version: app.getVersion(),
      electron: process.versions.electron,
      chrome: process.versions.chrome,
      node: process.versions.node,
      platform: process.platform,
      arch: process.arch,
      isPackaged: app.isPackaged,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      locale: app.getLocale(),
    },
    runtime: {
      activeOAgentSessions: sessions.size,
      activeOapSessions: oapSessions.size,
      activeTerminals: terminals.size,
      projectCount: projects.length,
    },
    projects: projectSummaries,
    mcp: {
      oauthTokenFiles: oauthFiles.length,
      oauthServerIds: oauthFiles.map((name) => path.basename(name, ".json")),
    },
    logs: logSummary,
  };
}

function buildIssueMarkdown(payload: DebugIssuePayload): string {
  return [
    "### OAgent Debug Info",
    "",
    "Paste this section into your GitHub issue:",
    "",
    "```json",
    JSON.stringify(payload, null, 2),
    "```",
  ].join("\n");
}

export function register(): void {
  ipcMain.handle("debug:collect", () => {
    try {
      const payload = buildPayload();
      const outputDir = path.join(getDataDir(), "debug-reports");
      fs.mkdirSync(outputDir, { recursive: true });
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const outputFile = path.join(outputDir, `debug-info-${timestamp}.json`);
      fs.writeFileSync(outputFile, `${JSON.stringify(payload, null, 2)}\n`, "utf-8");
      return {
        report: buildIssueMarkdown(payload),
        filePath: outputFile,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log("DEBUG_COLLECT_ERR", message);
      return { error: message };
    }
  });
}
