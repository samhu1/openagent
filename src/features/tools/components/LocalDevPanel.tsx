import { useState, useCallback, useEffect, useRef } from "react";
import {
  Server,
  Play,
  Square,
  Loader2,
  CheckCircle2,
  ChevronRight,
  AlertCircle,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface LocalDevPanelProps {
  cwd?: string;
  onSendToAgent?: (text: string) => void;
}

export function LocalDevPanel({ cwd, onSendToAgent }: LocalDevPanelProps) {
  const [status, setStatus] = useState<
    "idle" | "scanning" | "starting" | "running" | "error" | "stopping"
  >("idle");
  const [logs, setLogs] = useState<string[]>([]);
  const [terminalId, setTerminalId] = useState<string | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const statusRef = useRef(status);
  const terminalIdRef = useRef<string | null>(null);
  const manualStopRef = useRef(false);

  const addLog = useCallback((msg: string) => {
    setLogs((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
  }, []);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    terminalIdRef.current = terminalId;
  }, [terminalId]);

  const cleanupTerminalListeners = useCallback(() => {
    cleanupRef.current?.();
    cleanupRef.current = null;
  }, []);

  useEffect(() => {
    return () => {
      cleanupTerminalListeners();
    };
  }, [cleanupTerminalListeners]);

  const stopEnvironment = useCallback(
    async (options?: { forRestart?: boolean }) => {
      const activeTerminalId = terminalIdRef.current;
      if (!activeTerminalId) {
        setStatus("idle");
        return;
      }

      manualStopRef.current = true;
      setStatus("stopping");
      addLog(options?.forRestart ? "Restart requested. Stopping services..." : "Initiating shutdown...");
      addLog(" > Sending interrupt to environment process");

      try {
        await window.clientCore.terminal.write(activeTerminalId, "\x03");
      } catch {
        // Terminal may already be gone.
      }

      await new Promise((resolve) => setTimeout(resolve, 800));

      try {
        await window.clientCore.terminal.destroy(activeTerminalId);
      } catch {
        // Ignore destroy errors.
      }

      cleanupTerminalListeners();
      setTerminalId(null);
      addLog(" > Processes terminated.");
      if (!options?.forRestart) {
        addLog("All services disconnected.");
      }
      setStatus("idle");
      manualStopRef.current = false;
    },
    [addLog, cleanupTerminalListeners],
  );

  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs]);

  const handleStart = useCallback(async () => {
    if (!cwd) {
      addLog("No workspace directory selected. Unable to start environment.");
      setStatus("error");
      return;
    }
    setStatus("scanning");
    setLogs([]);
    addLog(`Analyzing workspace architecture in ${cwd}...`);

    try {
      const { files } = await window.clientCore.files.list(cwd);
      const hasPackageJson = files.includes("package.json");
      const hasDockerCompose =
        files.includes("docker-compose.yml") ||
        files.includes("docker-compose.yaml") ||
        files.includes("compose.yml") ||
        files.includes("compose.yaml");
      const hasRequirements =
        files.includes("requirements.txt") || files.includes("pyproject.toml");

      const commands: string[] = [];

      if (hasDockerCompose) {
        addLog(" └─ Database/Infra: docker-compose detected");
        commands.push("(docker compose up -d || docker-compose up -d)");
      }

      let packageManager = "npm";
      if (files.includes("pnpm-lock.yaml")) packageManager = "pnpm";
      else if (files.includes("yarn.lock")) packageManager = "yarn";
      else if (files.includes("bun.lockb")) packageManager = "bun";

      const installNodeDeps =
        packageManager === "yarn"
          ? "yarn install"
          : packageManager === "pnpm"
            ? "pnpm install"
            : packageManager === "bun"
              ? "bun install"
              : "npm install";
      const runNodeScript = (scriptName: string) => {
        if (packageManager === "yarn") return `yarn ${scriptName}`;
        if (packageManager === "pnpm") return `pnpm ${scriptName}`;
        if (packageManager === "bun") return `bun run ${scriptName}`;
        return `npm run ${scriptName}`;
      };

      if (hasRequirements) {
        addLog(" ├─ Backend: Python project detected");
        commands.push(
          "if [ -f requirements.txt ]; then (python3 -m pip install -r requirements.txt || python -m pip install -r requirements.txt || pip install -r requirements.txt); fi",
        );
        commands.push(
          "if [ -f main.py ]; then ((python3 -m uvicorn main:app --reload --port 8000) || (python -m uvicorn main:app --reload --port 8000) || uvicorn main:app --reload --port 8000) & fi",
        );
      }

      if (hasPackageJson) {
        addLog(` ├─ Frontend/Node: package.json via ${packageManager}`);
        const { content } = await window.clientCore.readFile(
          `${cwd}/package.json`,
        );
        if (content) {
          try {
            const pkg = JSON.parse(content);
            const deps = { ...pkg.dependencies, ...pkg.devDependencies };
            if (deps["vite"]) addLog("    framework: Vite");
            else if (deps["next"]) addLog("    framework: Next.js");
            else if (deps["react-scripts"])
              addLog("    framework: Create React App");

            commands.push(installNodeDeps);
            if (pkg.scripts?.dev) {
              commands.push(runNodeScript("dev"));
            } else if (pkg.scripts?.start) {
              commands.push(runNodeScript("start"));
            }
          } catch (e) {
            // ignore JSON parse error
          }
        }
      }

      if (commands.length === 0) {
        addLog("No standard start scripts detected. Falling back to agent.");
        if (onSendToAgent)
          onSendToAgent(
            "Start the local development server for this project. Analyze the framework and figure out the correct commands.",
          );
        setStatus("error");
        return;
      }

      addLog("Formulating intelligent startup sequence...");
      setStatus("starting");

      if (terminalIdRef.current) {
        await stopEnvironment({ forRestart: true });
      }
      cleanupTerminalListeners();
      manualStopRef.current = false;

      const res = await window.clientCore.terminal.create({ cwd });
      if (!res.terminalId) {
        throw new Error("Failed to create background terminal");
      }

      setTerminalId(res.terminalId);

      const unsubData = window.clientCore.terminal.onData((data) => {
        if (data.terminalId === res.terminalId) {
          // clean ansi escape codes for logging, split into lines
          const cleanText = data.data.replace(/\x1b\[[0-9;]*m/g, "").trim();
          if (cleanText) {
            const lines = cleanText.split(/[\r\n]+/);
            lines.forEach((l) => {
              if (l.trim()) addLog(`> ${l.trim()}`);
            });
            // rudimentary check for successful start
            if (
              cleanText.toLowerCase().includes("ready in") ||
              cleanText.includes("http://localhost:") ||
              cleanText.includes("Uvicorn running on")
            ) {
              setStatus("running");
            }
            if (
              /command not found|error: listen eaddrinuse|npm err!|traceback/i.test(
                cleanText,
              )
            ) {
              setStatus("error");
            }
          }
        }
      });

      const unsubExit = window.clientCore.terminal.onExit((data) => {
        if (data.terminalId === res.terminalId) {
          cleanupTerminalListeners();
          setTerminalId(null);
          if (manualStopRef.current) {
            manualStopRef.current = false;
            return;
          }
          if (
            statusRef.current === "starting" ||
            statusRef.current === "scanning"
          ) {
            addLog("Environment process exited during startup.");
            setStatus("error");
            return;
          }
          addLog("Environment process exited.");
          setStatus("idle");
        }
      });

      cleanupRef.current = () => {
        unsubData();
        unsubExit();
      };

      const finalCmd = commands.join(" && ");
      addLog(`Executing: ${finalCmd}`);
      await window.clientCore.terminal.write(res.terminalId, finalCmd + "\r");

      // Set fallback running state if no logs match
      setTimeout(() => {
        setStatus((prev) => (prev === "starting" ? "running" : prev));
      }, 5000);
    } catch (err: any) {
      cleanupTerminalListeners();
      addLog(`Error: ${err.message}`);
      setStatus("error");
    }
  }, [cwd, addLog, onSendToAgent, cleanupTerminalListeners, stopEnvironment]);

  const handleStop = useCallback(async () => {
    await stopEnvironment();
  }, [stopEnvironment]);

  const handleRestart = useCallback(async () => {
    await stopEnvironment({ forRestart: true });
    await handleStart();
  }, [handleStart, stopEnvironment]);

  return (
    <div className="flex h-full flex-col bg-sidebar">
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-foreground/[0.04] bg-foreground/[0.01]">
        <Server className="h-3.5 w-3.5 text-foreground/40" />
        <span className="text-[10px] font-bold text-foreground/40 tracking-widest uppercase">
          Local Environment
        </span>

        {status === "running" && (
          <span className="ml-auto flex items-center gap-1 text-[9px] font-bold text-foreground/60 bg-foreground/5 px-2 py-0.5 rounded-sm border border-foreground/10">
            <div className="w-1 h-1 rounded-full bg-foreground/40 animate-pulse" />{" "}
            LIVE
          </span>
        )}
      </div>

      <div className="p-4 flex flex-col gap-4 flex-1 overflow-y-auto">
        {/* Control Box */}
        <div className="rounded-md border border-foreground/[0.06] bg-background p-4 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-[1px] bg-foreground/20" />

          <h3 className="text-[11px] font-bold uppercase tracking-tight text-foreground/40 border-b border-foreground/[0.04] pb-2 mb-4">
            Service State
          </h3>

          <div className="flex flex-col items-center py-4">
            {status === "idle" && (
              <>
                <div className="w-12 h-12 rounded-md bg-foreground/[0.03] border border-foreground/[0.06] flex items-center justify-center mb-3">
                  <Play className="h-5 w-5 text-foreground/40" />
                </div>
                <p className="text-[11px] text-foreground/40 text-center px-4 mb-5 leading-relaxed">
                  Provision your full-stack environment. AI detect services,
                  resolves dependencies, and boots them seamlessly.
                </p>
                <Button
                  onClick={handleStart}
                  variant="outline"
                  className="w-full bg-foreground/[0.02] hover:bg-foreground/[0.04] text-foreground/70 rounded-md border-foreground/10 font-medium h-9 gap-2 text-xs"
                >
                  <Play className="h-3.5 w-3.5" /> Start Services
                </Button>
              </>
            )}

            {(status === "scanning" || status === "starting") && (
              <>
                <Loader2 className="h-8 w-8 text-foreground/20 animate-spin mb-3" />
                <h4 className="text-xs font-bold text-foreground/60 tracking-tight mb-1">
                  {status === "scanning"
                    ? "SCANNING WORKSPACE"
                    : "STARTING ENVIRONMENT"}
                </h4>
                <p className="text-[10px] text-foreground/30 text-center uppercase tracking-wider">
                  Resolving dependencies...
                </p>
              </>
            )}

            {status === "running" && (
              <>
                <div className="w-12 h-12 rounded-md bg-foreground/[0.02] border border-foreground/[0.08] flex items-center justify-center mb-3">
                  <CheckCircle2 className="h-5 w-5 text-foreground/40" />
                </div>
                <h4 className="text-xs font-bold text-foreground/60 uppercase tracking-widest mb-5">
                  Environment active
                </h4>

                <div className="flex gap-2 w-full">
                  <Button
                    variant="outline"
                    onClick={handleRestart}
                    className="flex-1 rounded-md gap-2 border-foreground/10 bg-foreground/[0.01] text-xs h-8 text-foreground/50"
                  >
                    <RefreshCw className="h-3 w-3" /> Restart
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleStop}
                    className="flex-1 rounded-md gap-2 bg-foreground/[0.03] text-foreground/70 hover:bg-foreground/[0.06] border-foreground/10 text-xs h-8"
                  >
                    <Square className="h-3 w-3 fill-foreground/40 border-none" />{" "}
                    Stop
                  </Button>
                </div>
              </>
            )}

            {status === "stopping" && (
              <>
                <Loader2 className="h-6 w-6 text-foreground/20 animate-spin mb-3" />
                <p className="text-[10px] font-bold text-foreground/30 uppercase tracking-widest">
                  Shutting down...
                </p>
              </>
            )}

            {status === "error" && (
              <>
                <AlertCircle className="h-10 w-10 text-foreground/20 mb-3" />
                <h4 className="text-xs font-bold text-foreground/60 uppercase mb-5">
                  Startup Failed
                </h4>
                <p className="text-[10px] text-foreground/30 text-center mb-5 uppercase tracking-wider">
                  Terminal returned a non-zero exit code.
                </p>
                <Button
                  onClick={handleStart}
                  variant="outline"
                  className="w-full bg-foreground text-background hover:bg-foreground/90 rounded-md gap-2 h-9 text-xs"
                >
                  <RefreshCw className="h-3.5 w-3.5" /> Retry
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Console Box */}
        <div className="flex-1 flex flex-col rounded-md border border-foreground/[0.08] bg-[#0c0c0c] overflow-hidden min-h-[200px] shadow-sm">
          <div className="bg-[#141414] px-3 py-1.5 border-b border-foreground/[0.04] flex items-center text-[9px] text-foreground/30 font-bold uppercase tracking-widest">
            <span className="w-1.5 h-1.5 rounded-full bg-foreground/10 mr-1.5" />
            <span className="w-1.5 h-1.5 rounded-full bg-foreground/10 mr-1.5" />
            <span className="w-1.5 h-1.5 rounded-full bg-foreground/10 mr-1.5" />
            <span className="ml-2">System Output</span>
          </div>
          <div className="flex-1 overflow-y-auto p-3 font-mono text-[10px] leading-relaxed text-foreground/50 space-y-1">
            {logs.length === 0 ? (
              <div className="text-foreground/20 italic flex items-center gap-2">
                <ChevronRight className="h-3 w-3" /> Waiting for service boot...
              </div>
            ) : (
              logs.map((log, i) => (
                <div key={i} className="flex items-start gap-2 break-all">
                  <ChevronRight className="h-3 w-3 mt-0.5 shrink-0 text-foreground/20" />
                  <span>{log}</span>
                </div>
              ))
            )}
            <div ref={logsEndRef} />
          </div>
        </div>
      </div>
    </div>
  );
}
