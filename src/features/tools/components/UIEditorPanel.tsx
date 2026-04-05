import { useMemo, useRef, useState } from "react";
import {
  LayoutDashboard,
  Monitor,
  Eye,
  Send,
  RotateCcw,
  ExternalLink,
  Globe,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface UIEditorPanelProps {
  cwd?: string;
  onSendToAgent?: (text: string) => void;
}

export function UIEditorPanel({ cwd, onSendToAgent }: UIEditorPanelProps) {
  const [activeTab, setActiveTab] = useState<"preview" | "agent-feed">(
    "preview",
  );
  const [annotationText, setAnnotationText] = useState("");
  const [previewUrlInput, setPreviewUrlInput] = useState("http://localhost:5173");
  const [previewUrl, setPreviewUrl] = useState("http://localhost:5173");
  const [iframeStatus, setIframeStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [iframeKey, setIframeKey] = useState(0);
  const [events, setEvents] = useState<
    Array<{ id: string; kind: "system" | "preview" | "annotation"; text: string; at: number }>
  >([
    {
      id: "init",
      kind: "system",
      text: "Visual editor ready. Set a local app URL and start annotating.",
      at: Date.now(),
    },
  ]);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const addEvent = (
    kind: "system" | "preview" | "annotation",
    text: string,
  ) => {
    setEvents((prev) => [
      ...prev.slice(-99),
      { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, kind, text, at: Date.now() },
    ]);
  };

  const normalizedPreviewUrl = useMemo(() => {
    const raw = previewUrlInput.trim();
    if (!raw) return "";
    if (/^https?:\/\//i.test(raw)) return raw;
    return `http://${raw}`;
  }, [previewUrlInput]);

  const applyPreviewUrl = () => {
    if (!normalizedPreviewUrl) return;
    setPreviewUrl(normalizedPreviewUrl);
    setIframeStatus("loading");
    setIframeKey((k) => k + 1);
    addEvent("preview", `Opening preview: ${normalizedPreviewUrl}`);
  };

  const reloadPreview = () => {
    setIframeStatus("loading");
    setIframeKey((k) => k + 1);
    addEvent("preview", `Reloaded preview: ${previewUrl}`);
  };

  const handleSubmitAnnotation = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = annotationText.trim();
    if (!trimmed) return;

    addEvent("annotation", trimmed);

    if (onSendToAgent) {
      onSendToAgent(`[UI EDITOR] Apply this UI change request to the current frontend preview.

Workspace: ${cwd ?? "unknown"}
Preview URL: ${previewUrl}

Requested visual edit:
"${trimmed}"

Please inspect the frontend code, implement the change cleanly (preserve existing design system patterns), and summarize what was changed.`);
      addEvent("system", "Annotation sent to agent.");
    } else {
      addEvent("system", "No agent session available to receive annotation.");
    }
    setAnnotationText("");
    setActiveTab("agent-feed");
  };

  return (
    <div className="flex h-full flex-col bg-sidebar">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-foreground/[0.04] bg-foreground/[0.01]">
        <div className="flex items-center gap-1.5">
          <LayoutDashboard className="h-3.5 w-3.5 text-foreground/40" />
          <span className="text-[10px] font-bold text-foreground/40 tracking-widest uppercase">
            Visual Registry
          </span>
        </div>

        <div className="flex bg-foreground/[0.03] p-0.5 rounded-sm border border-foreground/[0.04]">
          <button
            type="button"
            onClick={() => setActiveTab("preview")}
            className={`px-3 py-1 rounded-xs text-[9px] font-bold uppercase tracking-wider transition-colors flex gap-1.5 items-center ${activeTab === "preview" ? "bg-background shadow-xs text-foreground/70" : "text-foreground/30 hover:text-foreground/50"}`}
          >
            <Monitor className="h-3 w-3" /> Canvas
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("agent-feed")}
            className={`px-3 py-1 rounded-xs text-[9px] font-bold uppercase tracking-wider transition-colors flex gap-1.5 items-center ${activeTab === "agent-feed" ? "bg-background shadow-xs text-foreground/70" : "text-foreground/30 hover:text-foreground/50"}`}
          >
            <Eye className="h-3 w-3" /> Observer
          </button>
        </div>
      </div>

      <div className="flex-1 relative overflow-hidden flex flex-col">
        {activeTab === "preview" ? (
          <div className="flex flex-col h-full animate-in fade-in duration-300">
            {/* Pseudo browser frame component */}
            <div className="flex items-center gap-2 border-b border-foreground/[0.06] bg-background/50 px-3 py-1.5">
              <div className="flex gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-red-500/40" />
                <div className="w-2.5 h-2.5 rounded-full bg-amber-500/40" />
                <div className="w-2.5 h-2.5 rounded-full bg-green-500/40" />
              </div>
              <form
                className="mx-auto flex w-full max-w-[520px] items-center gap-1.5"
                onSubmit={(e) => {
                  e.preventDefault();
                  applyPreviewUrl();
                }}
              >
                <div className="relative min-w-0 flex-1">
                  <Globe className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-foreground/30" />
                  <Input
                    value={previewUrlInput}
                    onChange={(e) => setPreviewUrlInput(e.target.value)}
                    className="h-6 border-foreground/[0.06] bg-foreground/5 pl-7 pr-2 text-[10px] font-mono text-foreground/70"
                    placeholder="localhost:5173"
                  />
                </div>
                <Button
                  type="submit"
                  variant="outline"
                  className="h-6 px-2 text-[10px]"
                  disabled={!normalizedPreviewUrl}
                >
                  Open
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={reloadPreview}
                  disabled={!previewUrl}
                >
                  <RotateCcw className="h-3 w-3" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => window.open(previewUrl, "_blank")}
                  disabled={!previewUrl}
                >
                  <ExternalLink className="h-3 w-3" />
                </Button>
              </form>
            </div>

            {/* Iframe View */}
            <div className="flex-1 relative bg-white dark:bg-zinc-950 overflow-hidden">
              <div className="absolute left-3 top-3 z-10 flex items-center gap-2 rounded-md border border-foreground/[0.08] bg-background/90 px-2 py-1 text-[10px]">
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    iframeStatus === "ready"
                      ? "bg-emerald-500"
                      : iframeStatus === "error"
                        ? "bg-rose-500"
                        : "bg-amber-500"
                  }`}
                />
                <span className="font-medium text-foreground/60">
                  {iframeStatus === "ready"
                    ? "Preview connected"
                    : iframeStatus === "error"
                      ? "Preview blocked or unavailable"
                      : iframeStatus === "loading"
                        ? "Loading preview…"
                        : "Idle"}
                </span>
              </div>

              {iframeStatus === "error" && (
                <div className="absolute inset-x-6 top-12 z-10 rounded-md border border-rose-500/20 bg-background/95 p-3 text-[11px] text-foreground/60 shadow-sm">
                  <div className="mb-1 flex items-center gap-2 font-medium text-rose-500/80">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Preview failed to load in iframe
                  </div>
                  <p className="text-foreground/50">
                    Your app may be offline or blocking embedding (`X-Frame-Options` / CSP). Use the open button to inspect in a separate window.
                  </p>
                </div>
              )}

              <iframe
                key={iframeKey}
                ref={iframeRef}
                src={previewUrl}
                className="h-full w-full border-none"
                title="Preview Canvas"
                onLoad={() => {
                  setIframeStatus("ready");
                  addEvent("preview", `Preview loaded: ${previewUrl}`);
                }}
                onError={() => {
                  setIframeStatus("error");
                  addEvent("preview", `Preview error: ${previewUrl}`);
                }}
              />
            </div>

            {/* Annotation Input */}
            <div className="p-4 border-t border-foreground/[0.04] bg-foreground/[0.01]">
              <form onSubmit={handleSubmitAnnotation} className="relative">
                <textarea
                  value={annotationText}
                  onChange={(e) => setAnnotationText(e.target.value)}
                  placeholder="Dispatch layout instructions..."
                  className="w-full bg-background border border-foreground/10 rounded-md p-3 pr-12 text-[11px] font-medium focus:outline-none focus:ring-1 focus:ring-foreground/20 placeholder:text-foreground/20 resize-none min-h-[80px] shadow-xs"
                />
                <Button
                  type="submit"
                  size="icon"
                  className="absolute bottom-3 right-3 h-7 w-7 bg-foreground/10 hover:bg-foreground/20 text-foreground/60 rounded-sm border border-foreground/5 shadow-none"
                  disabled={!annotationText.trim()}
                >
                  <Send className="h-3 w-3" />
                </Button>
              </form>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col p-4 animate-in fade-in slide-in-from-right-2 duration-300 bg-foreground/[0.01] min-h-0">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-widest text-foreground/40">
                  Annotation Feed
                </h3>
                <p className="text-[11px] text-foreground/35">
                  Preview events and UI edit requests sent from this panel.
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                className="h-7 px-2 text-[10px]"
                onClick={() => setEvents([])}
                disabled={events.length === 0}
              >
                Clear
              </Button>
            </div>
            <div className="min-h-0 flex-1 rounded-md border border-foreground/[0.06] bg-[#0c0c0c] p-3 font-mono text-[10px]">
              <div className="h-full overflow-y-auto space-y-1.5 text-foreground/50">
                {events.length === 0 ? (
                  <div className="flex items-center gap-2 text-foreground/25 italic">
                    <Eye className="h-3 w-3" />
                    No events yet.
                  </div>
                ) : (
                  events.map((event, idx) => (
                    <div key={event.id} className="flex gap-2">
                      <span className="w-5 shrink-0 text-foreground/15">
                        {String(idx + 1).padStart(2, "0")}
                      </span>
                      <span
                        className={`shrink-0 uppercase tracking-tight ${
                          event.kind === "annotation"
                            ? "text-blue-300/70"
                            : event.kind === "preview"
                              ? "text-emerald-300/70"
                              : "text-foreground/35"
                        }`}
                      >
                        [{event.kind}]
                      </span>
                      <span className="shrink-0 text-foreground/20">
                        {new Date(event.at).toLocaleTimeString()}
                      </span>
                      <span className="break-all">{event.text}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
