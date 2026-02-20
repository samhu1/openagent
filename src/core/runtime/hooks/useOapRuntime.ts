import { useState, useCallback, useEffect, useRef } from "react";
import type { UIMessage, PermissionRequest, SessionInfo, ContextUsage, ImageAttachment } from "@/types";
import type { OAPSessionEvent, OAPPermissionEvent, OAPTurnCompleteEvent, OAPConfigOption } from "@/types/oap";
import { OAPStreamingBuffer, normalizeToolInput, normalizeToolResult, deriveToolName } from "@/lib/oap-adapter";

interface useOAPOptions {
  sessionId: string | null;
  initialMessages?: UIMessage[];
  initialConfigOptions?: OAPConfigOption[];
  initialMeta?: {
    isProcessing: boolean;
    isConnected: boolean;
    sessionInfo: SessionInfo | null;
    totalCost: number;
  } | null;
  onUsageUpdate?: (stats: { tokens?: number; cost?: number }) => void;
}

/** Renderer-side OAP log — forwarded to main process log file as [OAP_UI:TAG] */
function oapLog(label: string, data: unknown): void {
  window.clientCore.oap.log(label, data);
}

let oapIdCounter = 0;
function nextAcpId(prefix: string): string {
  return `${prefix}-${Date.now()}-${oapIdCounter++}`;
}

export function useOAP({
  sessionId,
  initialMessages,
  initialConfigOptions,
  initialMeta,
  onUsageUpdate,
}: useOAPOptions) {
  const [messages, setMessages] = useState<UIMessage[]>(initialMessages ?? []);
  const [isProcessing, setIsProcessing] = useState(initialMeta?.isProcessing ?? false);
  const [isConnected, setIsConnected] = useState(initialMeta?.isConnected ?? false);
  const [sessionInfo, setSessionInfo] = useState<SessionInfo | null>(initialMeta?.sessionInfo ?? null);
  const [totalCost, setTotalCost] = useState(initialMeta?.totalCost ?? 0);
  const [pendingPermission, setPendingPermission] = useState<PermissionRequest | null>(null);
  const [contextUsage, setContextUsage] = useState<ContextUsage | null>(null);
  const [isCompacting] = useState(false);
  const [configOptions, setConfigOptions] = useState<OAPConfigOption[]>(initialConfigOptions ?? []);

  // Sync initialConfigOptions prop → state (useState ignores prop changes after mount)
  useEffect(() => {
    if (initialConfigOptions && initialConfigOptions.length > 0) {
      setConfigOptions(initialConfigOptions);
    }
  }, [initialConfigOptions]);

  const sessionIdRef = useRef(sessionId);
  const buffer = useRef(new OAPStreamingBuffer());
  const pendingFlush = useRef(false);
  const rafId = useRef(0);
  const oapPermissionRef = useRef<OAPPermissionEvent | null>(null);

  sessionIdRef.current = sessionId;

  const sessionCumulativeTokens = useRef(0);

  // Reset state when sessionId changes (mirrors useOAgent's reset effect)
  useEffect(() => {
    setMessages(initialMessages ?? []);
    setIsProcessing(initialMeta?.isProcessing ?? false);
    setIsConnected(initialMeta?.isConnected ?? false);
    setSessionInfo(initialMeta?.sessionInfo ?? null);
    setTotalCost(initialMeta?.totalCost ?? 0);
    setPendingPermission(null);
    setContextUsage(null);
    setConfigOptions(initialConfigOptions ?? []);
    oapPermissionRef.current = null;
    buffer.current.reset();
    cancelAnimationFrame(rafId.current);
    pendingFlush.current = false;
    sessionCumulativeTokens.current = 0;
  }, [sessionId]); // eslint-disable-line react-hooks/exhaustive-deps

  const flushStreamingToState = useCallback(() => {
    const buf = buffer.current;
    if (!buf.messageId) return;
    const text = buf.getText();
    const thinking = buf.getThinking();
    const thinkingComplete = buf.thinkingComplete;
    setMessages(prev => prev.map(m => {
      if (m.id !== buf.messageId) return m;
      return {
        ...m,
        content: text,
        thinking: thinking || m.thinking,
        ...(thinkingComplete ? { thinkingComplete: true } : {}),
      };
    }));
  }, []);

  const scheduleFlush = useCallback(() => {
    if (pendingFlush.current) return;
    pendingFlush.current = true;
    rafId.current = requestAnimationFrame(() => {
      pendingFlush.current = false;
      flushStreamingToState();
    });
  }, [flushStreamingToState]);

  const ensureStreamingMessage = useCallback(() => {
    if (buffer.current.messageId) return;
    const id = nextAcpId("stream");
    buffer.current.messageId = id;
    oapLog("MSG_START", { id });
    setMessages(prev => [...prev, {
      id,
      role: "assistant",
      content: "",
      isStreaming: true,
      timestamp: Date.now(),
    }]);
  }, []);

  const finalizeStreamingMessage = useCallback(() => {
    const buf = buffer.current;
    if (!buf.messageId) return;
    if (buf.getThinking()) buf.thinkingComplete = true;
    flushStreamingToState();
    oapLog("MSG_FINALIZE", { id: buf.messageId, textLen: buf.getText().length, thinkingLen: buf.getThinking().length });
    setMessages(prev => prev.map(m =>
      m.id === buf.messageId ? { ...m, isStreaming: false } : m
    ));
    buf.reset();
  }, [flushStreamingToState]);

  // Mark any tool_call messages still missing a result as completed.
  // Some OAP agents (e.g. Codex) skip sending tool_call_update for fast tools.
  const closePendingTools = useCallback(() => {
    setMessages(prev => {
      const pending = prev.filter(m => m.role === "tool_call" && !m.toolResult && !m.toolError);
      if (pending.length === 0) return prev;
      oapLog("CLOSE_PENDING_TOOLS", { count: pending.length, ids: pending.map(m => m.id) });
      return prev.map(m => {
        if (m.role === "tool_call" && !m.toolResult && !m.toolError) {
          return { ...m, toolResult: { status: "completed" } };
        }
        return m;
      });
    });
  }, []);

  const handleSessionUpdate = useCallback((event: OAPSessionEvent) => {
    if (event._sessionId !== sessionIdRef.current) return;
    const { update } = event;
    const kind = update.sessionUpdate;

    if (kind === "agent_message_chunk" || kind === "agent_thought_chunk") {
      // Agent moved on to generating text — close any pending tools
      closePendingTools();
      const content = update.content as { type: string; text?: string } | undefined;
      if (content?.type === "text" && content.text) {
        ensureStreamingMessage();
        if (kind === "agent_message_chunk") {
          // Text arriving means thinking phase is over
          if (buffer.current.getThinking()) {
            buffer.current.thinkingComplete = true;
          }
          buffer.current.appendText(content.text);
        } else {
          buffer.current.appendThinking(content.text);
        }
        scheduleFlush();
      }
    } else if (kind === "tool_call") {
      closePendingTools();
      finalizeStreamingMessage();
      const tc = update as Extract<typeof update, { sessionUpdate: "tool_call" }>;
      const msgId = `tool-${tc.toolCallId}`;
      const toolName = deriveToolName(tc.title, tc.kind);
      oapLog("TOOL_CALL", {
        toolCallId: tc.toolCallId?.slice(0, 12),
        title: tc.title,
        kind: tc.kind,
        toolName,
        msgId,
      });
      // The initial tool_call event may already carry status/rawOutput (protocol allows it).
      // If the tool arrived completed, set toolResult immediately so it doesn't show as running.
      const isAlreadyDone = tc.status === "completed" || tc.status === "failed";
      const initialResult = isAlreadyDone ? normalizeToolResult(tc.rawOutput, tc.content) : undefined;
      setMessages(prev => {
        if (prev.some(m => m.id === msgId)) return prev;
        return [...prev, {
          id: msgId,
          role: "tool_call" as const,
          content: "",
          toolName,
          toolInput: normalizeToolInput(tc.rawInput),
          ...(initialResult ? { toolResult: initialResult } : {}),
          ...(tc.status === "failed" ? { toolError: true } : {}),
          timestamp: Date.now(),
        }];
      });
    } else if (kind === "tool_call_update") {
      const tcu = update as Extract<typeof update, { sessionUpdate: "tool_call_update" }>;
      const msgId = `tool-${tcu.toolCallId}`;
      const result = normalizeToolResult(tcu.rawOutput, tcu.content);
      oapLog("TOOL_RESULT", {
        toolCallId: tcu.toolCallId?.slice(0, 12),
        status: tcu.status,
        isError: tcu.status === "failed",
        hasResult: result != null,
      });
      setMessages(prev => prev.map(m => {
        if (m.id !== msgId) return m;
        return {
          ...m,
          toolResult: result ?? m.toolResult,
          toolError: tcu.status === "failed",
        };
      }));
    } else if (kind === "config_option_update") {
      const cou = update as { sessionUpdate: "config_option_update"; configOptions: OAPConfigOption[] };
      oapLog("CONFIG_UPDATE", { optionCount: cou.configOptions?.length });
      setConfigOptions(cou.configOptions);
    } else if (kind === "usage_update") {
      const uu = update as Extract<typeof update, { sessionUpdate: "usage_update" }>;
      if (uu.size != null || uu.used != null) {
        if (uu.used != null) {
          const delta = uu.used - sessionCumulativeTokens.current;
          if (delta > 0) {
            onUsageUpdate?.({ tokens: delta });
            sessionCumulativeTokens.current = uu.used;
          }
        }
        setContextUsage(prev => ({
          inputTokens: uu.used ?? prev?.inputTokens ?? 0,
          outputTokens: prev?.outputTokens ?? 0,
          cacheReadTokens: prev?.cacheReadTokens ?? 0,
          cacheCreationTokens: prev?.cacheCreationTokens ?? 0,
          contextWindow: uu.size ?? prev?.contextWindow ?? 0,
        }));
      }
      if (uu.cost) {
        oapLog("COST", { amount: uu.cost.amount, currency: uu.cost.currency });
        setTotalCost(prev => prev + uu.cost!.amount);
        onUsageUpdate?.({ cost: uu.cost.amount });
      }
    } else if (kind === "session_info_update") {
      const si = update as Extract<typeof update, { sessionUpdate: "session_info_update" }>;
      oapLog("SESSION_INFO", { title: si.title });
    } else if (kind === "current_mode_update") {
      const cm = update as Extract<typeof update, { sessionUpdate: "current_mode_update" }>;
      oapLog("MODE_UPDATE", { modeId: cm.currentModeId });
    } else if (kind === "plan") {
      const p = update as Extract<typeof update, { sessionUpdate: "plan" }>;
      oapLog("PLAN", { entryCount: p.entries?.length });
    }
  }, [closePendingTools, ensureStreamingMessage, finalizeStreamingMessage, scheduleFlush]);

  useEffect(() => {
    if (!sessionId) return;
    oapLog("SESSION_CONNECTED", { sessionId: sessionId.slice(0, 8) });
    setIsConnected(true);

    // Fetch any config options buffered in main process during the DRAFT→active transition
    // (events may have arrived before this listener was subscribed)
    window.clientCore.oap.getConfigOptions(sessionId).then(result => {
      if (result?.configOptions?.length) {
        oapLog("CONFIG_FETCHED", { count: result.configOptions.length });
        setConfigOptions(result.configOptions as OAPConfigOption[]);
      }
    }).catch(() => { /* session may have been stopped */ });

    const unsubEvent = window.clientCore.oap.onEvent(handleSessionUpdate);

    const unsubPermission = window.clientCore.oap.onPermissionRequest((data: OAPPermissionEvent) => {
      if (data._sessionId !== sessionIdRef.current) return;
      oapLog("PERMISSION_REQUEST", {
        requestId: data.requestId,
        tool: data.toolCall.title,
        toolCallId: data.toolCall.toolCallId?.slice(0, 12),
        optionCount: data.options?.length,
      });
      oapPermissionRef.current = data;
      setPendingPermission({
        requestId: data.requestId,
        toolName: data.toolCall.title,
        toolInput: normalizeToolInput(data.toolCall.rawInput),
        toolUseId: data.toolCall.toolCallId,
      });
    });

    const unsubTurnComplete = window.clientCore.oap.onTurnComplete((data: OAPTurnCompleteEvent) => {
      if (data._sessionId !== sessionIdRef.current) return;
      oapLog("TURN_COMPLETE", { stopReason: data.stopReason });
      finalizeStreamingMessage();
      closePendingTools();
      setIsProcessing(false);
    });

    const unsubExit = window.clientCore.oap.onExit((data: { _sessionId: string; code: number | null }) => {
      if (data._sessionId !== sessionIdRef.current) return;
      oapLog("SESSION_EXIT", { code: data.code });
      setIsConnected(false);
      setIsProcessing(false);
    });

    return () => {
      unsubEvent(); unsubPermission(); unsubTurnComplete(); unsubExit();
      if (pendingFlush.current) {
        cancelAnimationFrame(rafId.current);
        pendingFlush.current = false;
      }
    };
  }, [sessionId, handleSessionUpdate, finalizeStreamingMessage, closePendingTools]);

  const send = useCallback(async (text: string, images?: ImageAttachment[]) => {
    if (!sessionId) return;
    oapLog("SEND", { session: sessionId.slice(0, 8), textLen: text.length, images: images?.length ?? 0 });
    setMessages(prev => [...prev, {
      id: nextAcpId("user"),
      role: "user" as const,
      content: text,
      images,
      timestamp: Date.now(),
    }]);
    setIsProcessing(true);
    await window.clientCore.oap.prompt(sessionId, text, images);
  }, [sessionId]);

  const stop = useCallback(async () => {
    if (!sessionId) return;
    oapLog("STOP", { session: sessionId.slice(0, 8) });
    await window.clientCore.oap.stop(sessionId);
  }, [sessionId]);

  const interrupt = useCallback(async () => {
    if (!sessionId) return;
    oapLog("INTERRUPT", { session: sessionId.slice(0, 8) });
    await window.clientCore.oap.cancel(sessionId);
  }, [sessionId]);

  const respondPermission = useCallback(async (
    behavior: "allow" | "deny",
    _updatedInput?: Record<string, unknown>,
    _newPermissionMode?: string,
  ) => {
    if (!sessionId || !pendingPermission || !oapPermissionRef.current) return;
    const oapData = oapPermissionRef.current;

    const optionId = behavior === "allow"
      ? oapData.options.find(o => o.kind.startsWith("allow"))?.optionId
      : oapData.options.find(o => o.kind.startsWith("reject"))?.optionId;

    oapLog("PERMISSION_RESPONSE", {
      session: sessionId.slice(0, 8),
      behavior,
      requestId: oapData.requestId,
      optionId,
    });

    if (optionId) {
      await window.clientCore.oap.respondPermission(sessionId, oapData.requestId, optionId);
    }
    setPendingPermission(null);
    oapPermissionRef.current = null;
  }, [sessionId, pendingPermission]);

  const setConfig = useCallback(async (configId: string, value: string) => {
    if (!sessionId) return;
    oapLog("CONFIG_SET", { session: sessionId.slice(0, 8), configId, value });
    const result = await window.clientCore.oap.setConfig(sessionId, configId, value);
    if (result.configOptions) {
      setConfigOptions(result.configOptions);
    }
  }, [sessionId]);

  const compact = useCallback(async () => { /* no-op for OAP */ }, []);
  const setPermissionMode = useCallback(async (_mode: string) => { /* no-op for OAP */ }, []);

  return {
    messages, setMessages,
    isProcessing, setIsProcessing,
    isConnected, setIsConnected,
    sessionInfo, setSessionInfo,
    totalCost, setTotalCost,
    contextUsage,
    isCompacting,
    send, stop, interrupt, compact,
    pendingPermission, respondPermission,
    setPermissionMode,
    configOptions, setConfigOptions, setConfig,
  };
}
