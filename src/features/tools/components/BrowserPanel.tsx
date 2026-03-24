import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type FormEvent,
} from "react";

// Electron webview element with navigation methods
interface ElectronWebviewElement extends HTMLElement {
  src: string;
  getURL(): string;
  getTitle(): string;
  loadURL(url: string): Promise<void>;
  goBack(): void;
  goForward(): void;
  reload(): void;
  stop(): void;
  canGoBack(): boolean;
  canGoForward(): boolean;
  executeJavaScript(code: string): Promise<any>;
}

import {
  Globe,
  ArrowLeft,
  ArrowRight,
  RotateCw,
  X as XIcon,
  Plus,
  Lock,
  Loader2,
  MousePointer2,
  Send,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface BrowserTab {
  id: string;
  url: string;
  title: string;
  isLoading: boolean;
  isInspecting?: boolean;
}

interface BrowserPanelProps {
  onSendToAgent?: (text: string) => void;
}

export function BrowserPanel({ onSendToAgent }: BrowserPanelProps) {
  const [tabs, setTabs] = useState<BrowserTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);

  const createTab = useCallback((url = "https://www.google.com") => {
    const tab: BrowserTab = {
      id: crypto.randomUUID(),
      url,
      title: "New Tab",
      isLoading: true,
    };
    setTabs((prev) => [...prev, tab]);
    setActiveTabId(tab.id);
  }, []);

  // Auto-create first tab
  useEffect(() => {
    if (tabs.length === 0) createTab();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const closeTab = useCallback(
    (tabId: string) => {
      setTabs((prev) => {
        const next = prev.filter((t) => t.id !== tabId);
        if (activeTabId === tabId) {
          setActiveTabId(next.length > 0 ? next[next.length - 1].id : null);
        }
        return next;
      });
    },
    [activeTabId],
  );

  const updateTab = useCallback(
    (tabId: string, updates: Partial<BrowserTab>) => {
      setTabs((prev) =>
        prev.map((t) => (t.id === tabId ? { ...t, ...updates } : t)),
      );
    },
    [],
  );

  return (
    <div className="flex h-full flex-col">
      {/* Tab bar */}
      <div className="flex items-center gap-1 px-2 pt-2 pb-1">
        <div className="flex items-center gap-1.5 ps-1.5">
          <Globe className="h-3.5 w-3.5 text-foreground/40" />
          <span className="text-xs font-medium text-foreground/50">
            Browser
          </span>
        </div>

        <div className="ms-2 flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTabId(tab.id)}
              className={`group flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-[11px] transition-colors cursor-pointer ${
                tab.id === activeTabId
                  ? "bg-foreground/[0.08] text-foreground/80"
                  : "text-foreground/35 hover:text-foreground/55 hover:bg-foreground/[0.04]"
              }`}
            >
              {tab.isLoading ? (
                <Loader2 className="h-2.5 w-2.5 animate-spin opacity-50" />
              ) : (
                <Globe className="h-2.5 w-2.5 opacity-50" />
              )}
              <span className="truncate max-w-24">
                {tab.title || "New Tab"}
              </span>
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => {
                  e.stopPropagation();
                  closeTab(tab.id);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.stopPropagation();
                    closeTab(tab.id);
                  }
                }}
                className="ms-0.5 rounded p-0.5 opacity-0 transition-opacity hover:bg-foreground/10 group-hover:opacity-100"
              >
                <XIcon className="h-2.5 w-2.5" />
              </span>
            </button>
          ))}
        </div>

        <Button
          variant="ghost"
          size="icon"
          className="h-5 w-5 shrink-0 text-foreground/30 hover:text-foreground/60"
          onClick={() => createTab()}
        >
          <Plus className="h-3 w-3" />
        </Button>
      </div>

      {/* Separator */}
      <div className="border-t border-foreground/[0.06]" />

      {/* Webview content */}
      <div className="relative min-h-0 flex-1">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className={`absolute inset-0 flex flex-col ${tab.id === activeTabId ? "visible" : "invisible"}`}
          >
            <WebviewInstance
              tab={tab}
              onUpdateTab={(updates) => updateTab(tab.id, updates)}
              onNavigate={(url) => updateTab(tab.id, { url, isLoading: true })}
              onSendToAgent={onSendToAgent}
            />
          </div>
        ))}
        {tabs.length === 0 && (
          <div className="flex h-full items-center justify-center">
            <button
              type="button"
              onClick={() => createTab()}
              className="flex items-center gap-2 rounded-md px-3 py-2 text-xs text-foreground/30 transition-colors hover:bg-foreground/[0.04] hover:text-foreground/50 cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" />
              New Tab
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function WebviewInstance({
  tab,
  onUpdateTab,
  onNavigate,
  onSendToAgent,
}: {
  tab: BrowserTab;
  onUpdateTab: (updates: Partial<BrowserTab>) => void;
  onNavigate: (url: string) => void;
  onSendToAgent?: (text: string) => void;
}) {
  const webviewRef = useRef<ElectronWebviewElement | null>(null);
  const [urlInput, setUrlInput] = useState(tab.url);
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  const [isSecure, setIsSecure] = useState(false);
  const [isInspecting, setIsInspecting] = useState(tab.isInspecting || false);
  const [selectedIdentity, setSelectedIdentity] = useState<any | null>(null);
  const [commentText, setCommentText] = useState("");
  const [annotations, setAnnotations] = useState<any[]>([]);

  // Prevent unused warning by exposing globally for debug
  useEffect(() => {
    (window as any).__oagent_annotations = annotations;
  }, [annotations]);

  // Sync URL input when tab url changes externally
  useEffect(() => {
    setUrlInput(tab.url);
  }, [tab.url]);

  // Sync inspecting state
  useEffect(() => {
    setIsInspecting(tab.isInspecting || false);
  }, [tab.isInspecting]);

  // Attach webview event listeners
  useEffect(() => {
    const wv = webviewRef.current;
    if (!wv) return;

    const onDidNavigate = () => {
      const currentUrl = wv.getURL();
      setUrlInput(currentUrl);
      setCanGoBack(wv.canGoBack());
      setCanGoForward(wv.canGoForward());
      setIsSecure(currentUrl.startsWith("https://"));
      onUpdateTab({
        url: currentUrl,
        title: wv.getTitle() || currentUrl,
        isLoading: false,
      });
    };

    const onDidStartLoading = () => {
      onUpdateTab({ isLoading: true });
    };

    const onDidStopLoading = () => {
      const currentUrl = wv.getURL();
      setCanGoBack(wv.canGoBack());
      setCanGoForward(wv.canGoForward());
      setIsSecure(currentUrl.startsWith("https://"));
      onUpdateTab({ title: wv.getTitle() || currentUrl, isLoading: false });
    };

    const onPageTitleUpdated = (e: Event) => {
      const ev = e as CustomEvent & { title: string };
      onUpdateTab({ title: ev.title });
    };

    wv.addEventListener("did-navigate", onDidNavigate);
    wv.addEventListener("did-navigate-in-page", onDidNavigate);
    wv.addEventListener("did-start-loading", onDidStartLoading);
    wv.addEventListener("did-stop-loading", onDidStopLoading);
    wv.addEventListener("page-title-updated", onPageTitleUpdated);

    // Setup IPC message listener for when the injected script sends an element back
    const onIpcMessage = (e: Event) => {
      const ev = e as any;
      if (ev.channel === "oagent-review-selected") {
        const { identity } = ev.args[0];
        console.log("Selected Component:", identity);
        setSelectedIdentity(identity);
        // Turn off inspection mode after a selection
        onUpdateTab({ isInspecting: false });
      }
    };
    wv.addEventListener("ipc-message", onIpcMessage);

    return () => {
      wv.removeEventListener("did-navigate", onDidNavigate);
      wv.removeEventListener("did-navigate-in-page", onDidNavigate);
      wv.removeEventListener("did-start-loading", onDidStartLoading);
      wv.removeEventListener("did-stop-loading", onDidStopLoading);
      wv.removeEventListener("page-title-updated", onPageTitleUpdated);
      wv.removeEventListener("ipc-message", onIpcMessage);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle injecting the inspection script
  useEffect(() => {
    const wv = webviewRef.current;
    if (!wv) return;

    if (isInspecting) {
      const overlayScript = `
        (function() {
          if (window.__oagent_inspect_active) return;
          window.__oagent_inspect_active = true;

          const overlay = document.createElement("div");
          overlay.id = "oagent-review-overlay";
          overlay.style.position = "fixed";
          overlay.style.top = "0";
          overlay.style.left = "0";
          overlay.style.width = "100%";
          overlay.style.height = "100%";
          overlay.style.pointerEvents = "none";
          overlay.style.zIndex = "999999";
          document.body.appendChild(overlay);

          const highlight = document.createElement("div");
          highlight.style.position = "absolute";
          highlight.style.border = "2px solid #3b82f6";
          highlight.style.backgroundColor = "rgba(59, 130, 246, 0.1)";
          highlight.style.pointerEvents = "none";
          highlight.style.display = "none";
          highlight.style.transition = "all 0.1s ease-out";
          overlay.appendChild(highlight);

          const tooltip = document.createElement("div");
          tooltip.style.position = "absolute";
          tooltip.style.background = "#1e293b";
          tooltip.style.color = "white";
          tooltip.style.padding = "4px 8px";
          tooltip.style.borderRadius = "4px";
          tooltip.style.fontSize = "12px";
          tooltip.style.fontFamily = "ui-monospace, monospace";
          tooltip.style.pointerEvents = "none";
          tooltip.style.display = "none";
          tooltip.style.whiteSpace = "nowrap";
          overlay.appendChild(tooltip);

          let currentTarget = null;

          const getNearestIdentity = (el) => {
            while (el && el !== document.body) {
              if (el.hasAttribute("data-ai-file") || el.hasAttribute("data-ai-name")) {
                return el;
              }
              el = el.parentElement;
            }
            return null;
          };

          const handleMouseMove = (e) => {
            const target = document.elementFromPoint(e.clientX, e.clientY);
            if (!target || target === currentTarget || target === overlay || target === highlight) return;

            const identityNode = getNearestIdentity(target);

            if (identityNode) {
              currentTarget = identityNode;
              const rect = identityNode.getBoundingClientRect();
              
              highlight.style.display = "block";
              highlight.style.top = rect.top + "px";
              highlight.style.left = rect.left + "px";
              highlight.style.width = rect.width + "px";
              highlight.style.height = rect.height + "px";

              const file = identityNode.getAttribute("data-ai-file");
              const name = identityNode.getAttribute("data-ai-name");
              
              tooltip.style.display = "block";
              tooltip.style.top = Math.max(0, rect.top - 28) + "px";
              tooltip.style.left = rect.left + "px";
              tooltip.style.textContent = name ? "<" + name + ">" : (file ? file.split('/').pop() || 'file' : 'Element');
            } else {
              currentTarget = null;
              highlight.style.display = "none";
              tooltip.style.display = "none";
            }
          };

          const handleClick = (e) => {
            if (!currentTarget) return;
            e.preventDefault();
            e.stopPropagation();

            const rect = currentTarget.getBoundingClientRect();
            const identity = {
              file: currentTarget.getAttribute("data-ai-file") || "",
              name: currentTarget.getAttribute("data-ai-name") || "",
              line: parseInt(currentTarget.getAttribute("data-ai-line") || "0", 10) || null,
              boundingBox: {
                x: rect.x,
                y: rect.y,
                width: rect.width,
                height: rect.height
              }
            };

            const ipcRenderer = require('electron').ipcRenderer;
            ipcRenderer.sendToHost("oagent-review-selected", { identity });
          };

          document.addEventListener("mousemove", handleMouseMove, true);
          document.addEventListener("click", handleClick, true);
          document.body.style.cursor = "crosshair";

          window.__oagent_inspect_cleanup = () => {
             document.removeEventListener("mousemove", handleMouseMove, true);
             document.removeEventListener("click", handleClick, true);
             document.body.style.cursor = "default";
             overlay.remove();
             window.__oagent_inspect_active = false;
          };
        })();
      `;
      wv.executeJavaScript(overlayScript);
    } else {
      wv.executeJavaScript(`
        if (window.__oagent_inspect_cleanup) {
          window.__oagent_inspect_cleanup();
        }
      `);
    }
  }, [isInspecting]);

  const navigateTo = useCallback(
    (input: string) => {
      let url = input.trim();
      if (!url) return;

      // If it looks like a URL, add protocol
      if (/^[\w-]+(\.[\w-]+)+/.test(url) && !url.includes(" ")) {
        url = `https://${url}`;
      } else if (!url.startsWith("http://") && !url.startsWith("https://")) {
        // Treat as search query
        url = `https://www.google.com/search?q=${encodeURIComponent(url)}`;
      }

      setUrlInput(url);
      onNavigate(url);
      webviewRef.current?.loadURL(url);
    },
    [onNavigate],
  );

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    navigateTo(urlInput);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      setUrlInput(tab.url);
      (e.target as HTMLInputElement).blur();
    }
  };

  const handleCommentSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!commentText.trim() || !selectedIdentity) return;

    const newAnnotation = {
      id: crypto.randomUUID(),
      identity: selectedIdentity,
      comment: commentText,
      timestamp: Date.now(),
      url: tab.url,
    };

    setAnnotations((prev) => [...prev, newAnnotation]);
    setCommentText("");
    setSelectedIdentity(null);
    console.log("Saved Annotation:", newAnnotation);

    if (onSendToAgent) {
      const prompt = `[UI AGENT PIPELINE]
Please apply the following UI review feedback to \`<${selectedIdentity.name || "Component"}>\` in \`${selectedIdentity.file}\`:

**User Comment:**
"${commentText}"

**Component Context:**
- **File:** ${selectedIdentity.file}
- **Element Bounding Box:** ${Math.round(selectedIdentity.boundingBox.width)}x${Math.round(selectedIdentity.boundingBox.height)}

**Instructions (Spec-First Pipeline):**
1. **Analyze:** Read the target file to understand the current component implementation.
2. **Structured UI Spec:** Before making any code changes, output a concise structured spec covering the intended changes for Spacing, Typography, Layout, and Colors. **Constraint:** Strictly adhere to standard Tailwind CSS tokens. Avoid magic numbers.
3. **Draft Patch:** Apply the spec by modifying the code using your file editing tools. **Scope Limiter:** ONLY edit the file specified in the prompt unless absolutely necessary. Preserve existing functionality.
4. **Validation:** Run \`pnpm typecheck\` and \`pnpm lint\` in the terminal to verify no regressions were introduced.
5. **Visual Diff:** Run \`node scripts/diff-component.js "http://localhost:5173" "button[data-ai-name='<Component>']" <Component>\` to capture a screenshot of the change (replace URL and selector appropriately).
6. **Review & PR:** If validation passes, commit the changes to a new branch and open a Pull Request with the structured spec in the description.`;

      onSendToAgent(prompt);
    }
  };

  return (
    <div className="flex h-full flex-col">
      {/* Navigation bar */}
      <div className="flex items-center gap-1.5 px-2 py-1.5">
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 shrink-0 text-foreground/30 hover:text-foreground/60 disabled:opacity-20"
          onClick={() => webviewRef.current?.goBack()}
          disabled={!canGoBack}
        >
          <ArrowLeft className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 shrink-0 text-foreground/30 hover:text-foreground/60 disabled:opacity-20"
          onClick={() => webviewRef.current?.goForward()}
          disabled={!canGoForward}
        >
          <ArrowRight className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 shrink-0 text-foreground/30 hover:text-foreground/60"
          onClick={() =>
            tab.isLoading
              ? webviewRef.current?.stop()
              : webviewRef.current?.reload()
          }
        >
          {tab.isLoading ? (
            <XIcon className="h-3.5 w-3.5" />
          ) : (
            <RotateCw className="h-3 w-3" />
          )}
        </Button>
        <Button
          variant={isInspecting ? "default" : "ghost"}
          size="icon"
          className={`h-6 w-6 shrink-0 ${isInspecting ? "bg-blue-500 hover:bg-blue-600 text-white" : "text-foreground/30 hover:text-foreground/60"}`}
          onClick={() => onUpdateTab({ isInspecting: !isInspecting })}
          title="Inspect UI Element"
        >
          <MousePointer2 className="h-3.5 w-3.5" />
        </Button>

        {/* URL bar */}
        <form onSubmit={handleSubmit} className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 rounded-md bg-foreground/[0.05] px-2 py-1 transition-colors focus-within:bg-foreground/[0.08] focus-within:ring-1 focus-within:ring-foreground/[0.08]">
            {isSecure ? (
              <Lock className="h-3 w-3 shrink-0 text-emerald-500/60" />
            ) : (
              <Globe className="h-3 w-3 shrink-0 text-foreground/25" />
            )}
            <input
              type="text"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={(e) => e.target.select()}
              className="min-w-0 flex-1 bg-transparent text-[11px] text-foreground/70 outline-none placeholder:text-foreground/20"
              placeholder="Search or enter URL"
              spellCheck={false}
            />
          </div>
        </form>
      </div>

      {/* Loading bar */}
      {tab.isLoading && (
        <div className="h-px bg-foreground/[0.06] overflow-hidden">
          <div className="h-full w-1/3 animate-pulse rounded-full bg-blue-500/40" />
        </div>
      )}

      {/* Webview */}
      <div className="relative min-h-0 flex-1">
        <webview
          ref={webviewRef as React.RefObject<ElectronWebviewElement>}
          src={tab.url}
          className="h-full w-full"
          {...({ allowpopups: "true" } as Record<string, string>)}
        />

        {/* Comment Overlay */}
        {selectedIdentity && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/40 backdrop-blur-[2px]">
            <div className="w-[400px] overflow-hidden rounded-xl border border-foreground/[0.08] bg-background shadow-2xl animate-in fade-in zoom-in-95 duration-200">
              <div className="flex items-center justify-between border-b border-foreground/[0.06] bg-foreground/[0.02] px-3 py-2">
                <div className="flex flex-col">
                  <span className="text-xs font-semibold text-foreground/80">
                    {selectedIdentity.name
                      ? "<" + selectedIdentity.name + ">"
                      : "DOM Element"}
                  </span>
                  <span className="text-[10px] text-foreground/40 font-mono truncate max-w-[300px]">
                    {selectedIdentity.file}:{selectedIdentity.line || "?"}
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => setSelectedIdentity(null)}
                >
                  <XIcon className="h-3 w-3" />
                </Button>
              </div>

              <form
                onSubmit={handleCommentSubmit}
                className="p-3 flex flex-col gap-3"
              >
                <textarea
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  placeholder="What needs to change? (e.g. 'Make this button red and add more padding')"
                  className="w-full resize-none rounded-md border border-foreground/[0.08] bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-foreground/30 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500 min-h-[80px]"
                  //eslint-disable-next-line
                  autoFocus
                />

                <div className="flex justify-between items-center">
                  <div className="text-[10px] text-foreground/40 hidden md:block">
                    Bounding Box:{" "}
                    {Math.round(selectedIdentity.boundingBox.width)}x
                    {Math.round(selectedIdentity.boundingBox.height)}
                  </div>
                  <Button
                    type="submit"
                    size="sm"
                    className="h-7 text-xs gap-1.5"
                    disabled={!commentText.trim()}
                  >
                    Save Request <Send className="h-3 w-3" />
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
