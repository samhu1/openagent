import fs from "fs";
import path from "path";
import { getDataDir } from "./data-dir";

export interface AgentDefinition {
  id: string;
  name: string;
  engine: "agent" | "oap";
  binary?: string;
  args?: string[];
  env?: Record<string, string>;
  icon?: string;
  builtIn?: boolean;
}

const BUILTIN_AGENT: AgentDefinition = {
  id: "oagent-core",
  name: "OAgent Core",
  engine: "agent",
  builtIn: true,
  icon: "brain",
};

const agents = new Map<string, AgentDefinition>();
agents.set(BUILTIN_AGENT.id, BUILTIN_AGENT);

function getConfigPath(): string {
  return path.join(getDataDir(), "agents.json");
}

export function loadUserAgents(): void {
  try {
    const data = JSON.parse(fs.readFileSync(getConfigPath(), "utf-8"));
    for (const agent of data) {
      if (agent.id !== "oagent-core") agents.set(agent.id, agent);
    }
  } catch {
    /* no config yet */
  }
}

export function getAgent(id: string): AgentDefinition | undefined {
  return agents.get(id);
}

export function listAgents(): AgentDefinition[] {
  return Array.from(agents.values());
}

export function saveAgent(agent: AgentDefinition): void {
  if (agent.id === "oagent-core") return;
  if (!agent.id?.trim() || !agent.name?.trim()) throw new Error("Agent must have id and name");
  if (agent.engine === "oap" && !agent.binary?.trim()) throw new Error("OAP agents require a binary");
  agents.set(agent.id, agent);
  persistUserAgents();
}

export function deleteAgent(id: string): void {
  if (id === "oagent-core") return;
  agents.delete(id);
  persistUserAgents();
}

function persistUserAgents(): void {
  const userAgents = listAgents().filter((a) => !a.builtIn);
  const dir = path.dirname(getConfigPath());
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(getConfigPath(), JSON.stringify(userAgents, null, 2));
}
