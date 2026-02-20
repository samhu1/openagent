import { app } from "electron";
import path from "path";
import fs from "fs";

const NEW_DIR_NAME = "oagent-data";
const LEGACY_DIR_NAME = "OAgentui-data";
const MIGRATION_MARKER = ".oagent-migrated-v1";

function migrateLegacyDataDir(newDir: string, legacyDir: string): void {
  const markerPath = path.join(newDir, MIGRATION_MARKER);
  if (fs.existsSync(markerPath)) return;

  fs.mkdirSync(newDir, { recursive: true });

  if (fs.existsSync(legacyDir)) {
    // Copy only if destination appears empty to avoid clobbering newer data.
    const newDirEntries = fs.readdirSync(newDir);
    if (newDirEntries.length === 0) {
      fs.cpSync(legacyDir, newDir, { recursive: true, force: false, errorOnExist: false });
    }
  }

  fs.writeFileSync(markerPath, String(Date.now()));
}

export function getDataDir(): string {
  const userData = app.getPath("userData");
  const dir = path.join(userData, NEW_DIR_NAME);
  const legacyDir = path.join(userData, LEGACY_DIR_NAME);
  migrateLegacyDataDir(dir, legacyDir);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function getProjectSessionsDir(projectId: string): string {
  const dir = path.join(getDataDir(), "sessions", projectId);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function getSessionFilePath(projectId: string, sessionId: string): string {
  return path.join(getProjectSessionsDir(projectId), `${sessionId}.json`);
}
