// OAP event types for renderer (what main process forwards via IPC)

export interface OAPSessionEvent {
  _sessionId: string;
  sessionId: string;
  update: OAPSessionUpdate;
}

export type OAPSessionUpdate =
  | oapAgentMessageChunk
  | oapAgentThoughtChunk
  | OAPUserMessageChunk
  | OAPToolCall
  | OAPToolCallUpdate
  | OAPPlan
  | OAPUsageUpdate
  | OAPSessionInfoUpdate
  | OAPCurrentModeUpdate
  | OAPConfigOptionUpdate
  | OAPAvailableCommandsUpdate;

export interface oapAgentMessageChunk { sessionUpdate: "agent_message_chunk"; content: { type: string; text?: string } }
export interface oapAgentThoughtChunk { sessionUpdate: "agent_thought_chunk"; content: { type: string; text?: string } }
export interface OAPUserMessageChunk { sessionUpdate: "user_message_chunk"; content: { type: string; text?: string } }
export interface OAPToolCall {
  sessionUpdate: "tool_call"; toolCallId: string; title: string; kind?: string; status: string;
  locations?: Array<{ path: string; line?: number }>; content?: unknown[]; rawInput?: unknown; rawOutput?: unknown;
}
export interface OAPToolCallUpdate {
  sessionUpdate: "tool_call_update"; toolCallId: string; status?: string;
  content?: unknown[]; rawOutput?: unknown; locations?: Array<{ path: string; line?: number }>;
}
export interface OAPPlan { sessionUpdate: "plan"; entries: Array<{ content: string; status: string; priority?: string }> }
export interface OAPUsageUpdate { sessionUpdate: "usage_update"; size?: number; used?: number; cost?: { amount: number; currency: string } }
export interface OAPSessionInfoUpdate { sessionUpdate: "session_info_update"; title?: string }
export interface OAPCurrentModeUpdate { sessionUpdate: "current_mode_update"; currentModeId: string }
export interface OAPConfigOptionUpdate { sessionUpdate: "config_option_update"; configOptions: OAPConfigOption[] }
export interface OAPAvailableCommandsUpdate { sessionUpdate: "available_commands_update"; availableCommands: unknown[] }

// OAP Session Config Option types (model, mode, thought_level, etc.)
export interface OAPConfigOption {
  id: string;
  name: string;
  category?: "model" | "mode" | "thought_level" | string | null;
  type: "select";
  currentValue: string;
  options: OAPConfigSelectOption[] | OAPConfigSelectGroup[];
}

export interface OAPConfigSelectOption {
  value: string;
  name: string;
  description?: string | null;
}

export interface OAPConfigSelectGroup {
  group: string;
  name: string;
  options: OAPConfigSelectOption[];
}

/** Flatten grouped or flat options into a single flat list */
export function flattenConfigOptions(
  options: OAPConfigSelectOption[] | OAPConfigSelectGroup[],
): OAPConfigSelectOption[] {
  if (options.length === 0) return [];
  if ("value" in options[0]) return options as OAPConfigSelectOption[];
  return (options as OAPConfigSelectGroup[]).flatMap((g) => g.options);
}

export interface OAPPermissionEvent {
  _sessionId: string;
  requestId: string;
  sessionId: string;
  toolCall: {
    toolCallId: string;
    title: string;
    kind?: string;
    status?: string;
    rawInput?: unknown;
  };
  options: Array<{
    optionId: string;
    name: string;
    kind: "allow_once" | "allow_always" | "reject_once" | "reject_always";
  }>;
}

export interface OAPTurnCompleteEvent {
  _sessionId: string;
  stopReason: string;
  usage?: { inputTokens?: number; outputTokens?: number } | null;
}
