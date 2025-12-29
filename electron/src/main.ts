import { app, BrowserWindow, globalShortcut } from "electron";
import path from "path";
import http from "http";
import { log } from "./lib/logger";
import { glassEnabled, liquidGlass } from "./lib/glass";
import { initAutoUpdater } from "./lib/updater";
import { sessions } from "./handlers/oagent-sessions.handler";
import { oapSessions } from "./handlers/oap-sessions.handler";
import { terminals } from "./handlers/terminal.handler";

// IPC module registrations
import * as spacesHandler from "./handlers/spaces.handler";
import * as projectsHandler from "./handlers/projects.handler";
import * as sessionsHandler from "./handlers/sessions.handler";
import * as legacyImportHandler from "./handlers/legacy-import.handler";
import * as filesHandler from "./handlers/files.handler";
import * as oagentSessionsHandler from "./handlers/oagent-sessions.handler";
import * as titleGenHandler from "./handlers/title-gen.handler";
import * as terminalHandler from "./handlers/terminal.handler";
import * as gitHandler from "./handlers/git.handler";
import * as agentRegistryHandler from "./handlers/oagent-registry.handler";
import * as oapSessionsHandler from "./handlers/oap-sessions.handler";
import * as mcpHandler from "./handlers/mcp.handler";
import { ipcMain } from "electron";

// --- Liquid Glass command-line switches (must be set before app.whenReady()) ---
if (glassEnabled) {
  app.commandLine.appendSwitch("remote-debugging-port", "9222");
  app.commandLine.appendSwitch("remote-allow-origins", "*");
}

let mainWindow: BrowserWindow | null = null;

function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}

function createWindow(): void {
  const windowOptions: Electron.BrowserWindowConstructorOptions = {
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
      devTools: !glassEnabled,
    },
  };

  if (!app.isPackaged && process.platform !== "darwin") {
    windowOptions.icon = path.join(app.getAppPath(), "build", "icon.png");
  }

  if (glassEnabled) {
    windowOptions.titleBarStyle = "hidden";
    windowOptions.transparent = true;
    windowOptions.trafficLightPosition = { x: 16, y: 16 };
  } else {
    windowOptions.titleBarStyle = "hiddenInset";
    windowOptions.trafficLightPosition = { x: 16, y: 16 };
    windowOptions.backgroundColor = "#18181b";
  }

  mainWindow = new BrowserWindow(windowOptions);

  const isDev = !app.isPackaged;
  if (isDev) {
    mainWindow.loadURL("http://localhost:5173");
  } else {
    mainWindow.loadFile(path.join(__dirname, "../../dist/index.html"));
  }

  if (glassEnabled) {
    mainWindow.webContents.once("did-finish-load", () => {
      const glassId = liquidGlass!.addView(mainWindow!.getNativeWindowHandle(), {});
      log("GLASS", `Liquid glass applied, viewId=${glassId}`);
    });
  }
}

// --- Liquid Glass IPC ---
ipcMain.handle("app:getGlassEnabled", () => {
  return !!glassEnabled;
});

// --- Register all IPC modules ---
spacesHandler.register();
projectsHandler.register(getMainWindow);
sessionsHandler.register();
legacyImportHandler.register();
filesHandler.register();
oagentSessionsHandler.register(getMainWindow);
titleGenHandler.register();
terminalHandler.register(getMainWindow);
gitHandler.register();
agentRegistryHandler.register();
oapSessionsHandler.register(getMainWindow);
mcpHandler.register();

// --- DevTools in separate window via remote debugging ---
let devToolsWindow: BrowserWindow | null = null;

function openDevToolsWindow(): void {
  if (!glassEnabled) {
    mainWindow?.webContents.openDevTools({ mode: "detach" });
    return;
  }

  if (devToolsWindow && !devToolsWindow.isDestroyed()) {
    devToolsWindow.focus();
    return;
  }

  http.get("http://127.0.0.1:9222/json", (res) => {
    let body = "";
    res.on("data", (chunk: Buffer) => { body += chunk; });
    res.on("end", () => {
      try {
        const targets = JSON.parse(body) as Array<{ type: string; webSocketDebuggerUrl?: string }>;
        const page = targets.find((t) => t.type === "page");
        if (!page) {
          log("DEVTOOLS", "No debuggable page target found");
          return;
        }

        const wsUrl = page.webSocketDebuggerUrl;
        if (!wsUrl) {
          log("DEVTOOLS", "No webSocketDebuggerUrl in target");
          return;
        }

        const wsParam = encodeURIComponent(wsUrl.replace("ws://", ""));
        const fullUrl = `devtools://devtools/bundled/inspector.html?ws=${wsParam}`;

        devToolsWindow = new BrowserWindow({
          width: 1000,
          height: 700,
          title: "OAgent DevTools",
          webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
          },
        });

        devToolsWindow.loadURL(fullUrl);
        devToolsWindow.on("closed", () => {
          devToolsWindow = null;
        });

        log("DEVTOOLS", `Opened DevTools window: ${fullUrl}`);
      } catch (err) {
        log("DEVTOOLS_ERR", `Failed to parse targets: ${(err as Error).message}`);
      }
    });
  }).on("error", (err) => {
    log("DEVTOOLS_ERR", `Remote debugging not available: ${err.message}`);
  });
}

// --- App lifecycle ---
app.whenReady().then(() => {
  createWindow();
  initAutoUpdater(getMainWindow);

  const shortcuts = ["CommandOrControl+Alt+I", "F12", "CommandOrControl+Shift+J"];
  for (const shortcut of shortcuts) {
    const ok = globalShortcut.register(shortcut, () => {
      log("DEVTOOLS", `Shortcut ${shortcut} triggered`);
      openDevToolsWindow();
    });
    log("DEVTOOLS", `Register ${shortcut}: ${ok ? "OK" : "FAILED"}`);
  }
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});

app.on("window-all-closed", () => {
  for (const [sessionId, session] of sessions) {
    log("CLEANUP", `Closing session ${sessionId.slice(0, 8)}`);
    session.channel.close();
    session.queryHandle?.close();
  }
  sessions.clear();

  for (const [sessionId, entry] of oapSessions) {
    log("CLEANUP", `Stopping OAP session ${sessionId.slice(0, 8)}`);
    entry.process?.kill();
  }
  oapSessions.clear();

  for (const [terminalId, term] of terminals) {
    log("CLEANUP", `Killing terminal ${terminalId.slice(0, 8)}`);
    term.pty.kill();
  }
  terminals.clear();

  app.quit();
});
