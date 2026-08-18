import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** Default plugin configuration. Overridable from the profile patch layer. */
const DEFAULT_CONFIG = {
  // The desktop shortcut display name (the ".lnk" name).
  launcherName: "DSH Web 启动器",
  // Absolute path to a custom .ico; empty = use the bundled assets/dfy.ico.
  iconPath: "",
  // Set true to pop a Windows file picker to choose the icon.
  // Defaults false: the bundled assets/dfy.ico is used, no prompt.
  askIconOnStart: false,
  // The web server port the launcher watches for readiness.
  port: 3080,
  // The URL opened once the service is listening.
  url: "http://127.0.0.1:3080",
};

/** Where a remembered icon choice is persisted (survives restarts). */
function choiceFile() {
  return path.join(os.homedir(), ".dsh", "dsh-desktop-launcher-icon.txt");
}

/** Remember the user's picked icon for later launches. */
function rememberIcon(picked) {
  try {
    fs.mkdirSync(path.dirname(choiceFile()), { recursive: true });
    fs.writeFileSync(choiceFile(), picked, "utf8");
  } catch (err) {
    console.warn(`[dsh-desktop-launcher-win32] could not persist icon choice: ${String(err)}`);
  }
}

/** Pop a native Windows file picker for a .ico; returns the chosen path or null. */
function pickIconDialog() {
  const ps = [
    "Add-Type -AssemblyName System.Windows.Forms",
    "$f = New-Object System.Windows.Forms.OpenFileDialog",
    "$f.Filter = 'Icon files (*.ico)|*.ico|All files (*.*)|*.*'",
    "$f.Title = 'Select launcher icon'",
    "$f.CheckFileExists = $true",
    "$f.Multiselect = $false",
    "if ($f.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {",
    "  [Console]::OutputEncoding = [System.Text.Encoding]::UTF8",
    "  Write-Output $f.FileName",
    "}",
  ].join("\n");
  const encoded = Buffer.from(ps, "utf16le").toString("base64");
  const r = spawnSync(
    "powershell.exe",
    ["-NoProfile", "-STA", "-ExecutionPolicy", "Bypass", "-EncodedCommand", encoded],
    { encoding: "utf8", windowsHide: true }
  );
  const line = (r.stdout || "")
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean)
    .pop();
  return line || null;
}

/**
 * Resolve the .ico used for the desktop shortcut icon.
 * Priority: explicit iconPath > remembered choice > bundled dfy.ico > shell fallback.
 * A native file picker pops ONLY when askIconOnStart is explicitly true.
 */
function resolveIcon(cfg, allowAsk) {
  if (cfg.iconPath && fs.existsSync(cfg.iconPath)) return cfg.iconPath;

  const remembered = fs.existsSync(choiceFile()) ? fs.readFileSync(choiceFile(), "utf8").trim() : "";
  if (remembered && fs.existsSync(remembered)) return remembered;

  if (allowAsk && cfg.askIconOnStart === true) {
    console.log("[dsh-desktop-launcher-win32] popping icon picker...");
    const picked = pickIconDialog();
    if (picked && fs.existsSync(picked)) {
      rememberIcon(picked);
      console.log(`[dsh-desktop-launcher-win32] icon chosen: ${picked}`);
      return picked;
    }
    console.log("[dsh-desktop-launcher-win32] no icon chosen, using default");
  }

  const builtin = path.join(__dirname, "assets", "dfy.ico");
  if (fs.existsSync(builtin)) return builtin;
  // Fallback: a generic Windows shell icon (never empty so the .lnk is valid).
  return `${path.join(process.env.SystemRoot || "C:\\Windows", "System32", "shell32.dll")},13`;
}

/**
 * The generated launcher batch file. Kept 100% ASCII on purpose: the batch
 * parser runs under the system OEM codepage (GBK on zh-CN), so embedding the
 * CJK home path would corrupt it. User paths come from environment variables.
 */
function cmdContentFor(cfg) {
  const port = Number(cfg.port) || 3080;
  const url = cfg.url || `http://127.0.0.1:${port}`;
  return [
    "@echo off",
    "setlocal EnableExtensions",
    `set "URL=${url}"`,
    `set "PORT=${port}"`,
    'set "NODE=%ProgramFiles%\\nodejs\\node.exe"',
    'if not exist "%NODE%" set "NODE=node"',
    'set "DSH_BIN=%USERPROFILE%\\.dsh\\profiles\\node_modules\\@deepseek-ai\\dsh\\lib\\bin.js"',
    'if not exist "%DSH_BIN%" set "DSH_BIN=%APPDATA%\\npm\\node_modules\\@deepseek-ai\\dsh\\lib\\bin.js"',
    "",
    "REM already listening? just open the browser",
    'netstat -ano | findstr "LISTENING" | findstr ":%PORT%" >nul 2>&1',
    "if not errorlevel 1 goto open",
    "",
    "REM wake the dsh web service",
    'echo [DSH Web] starting service on port %PORT% ...',
    'start "" /b "%NODE%" "%DSH_BIN%" web',
    "",
    "set /a tries=0",
    ":wait",
    "set /a tries+=1",
    "if %tries% gtr 60 goto fail",
    "ping -n 2 127.0.0.1 >nul",
    'netstat -ano | findstr "LISTENING" | findstr ":%PORT%" >nul 2>&1',
    "if errorlevel 1 goto wait",
    "",
    ":open",
    "echo [DSH Web] ready: %URL%",
    'start "" "%URL%"',
    "exit /b 0",
    "",
    ":fail",
    "echo [DSH Web] ERROR: service did not start in time.",
    "pause",
    "exit /b 1",
  ].join("\r\n");
}

/**
 * Create a Windows ".lnk" shortcut that runs the launcher batch via cmd.exe,
 * with a custom icon. Uses -EncodedCommand (UTF-16LE base64) so CJK paths
 * never travel through the CLI's codepage.
 */
function createShortcut(lnkName, icoPath, cmdPath) {
  const ps = [
    "$ErrorActionPreference = 'Stop'",
    "$desktop = [Environment]::GetFolderPath('Desktop')",
    `$lnkPath = Join-Path $desktop '${lnkName}'`,
    `$cmdPath = '${cmdPath}'`,
    `$ico = '${icoPath}'`,
    "$ws = New-Object -ComObject WScript.Shell",
    "$sc = $ws.CreateShortcut($lnkPath)",
    "$sc.TargetPath = \"$env:SystemRoot\\System32\\cmd.exe\"",
    "$sc.Arguments = '/c \"\"' + $cmdPath + '\"\"'",
    "$sc.IconLocation = $ico + ',0'",
    "$sc.WorkingDirectory = (Split-Path $cmdPath -Parent)",
    "$sc.WindowStyle = 7",
    "$sc.Description = 'DSH Web launcher: start dsh web and open the browser'",
    "$sc.Save()",
    "Write-Output ('OK:' + $lnkPath)",
  ].join("\n");
  const encoded = Buffer.from(ps, "utf16le").toString("base64");
  return spawnSync(
    "powershell.exe",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-EncodedCommand", encoded],
    { encoding: "utf8", windowsHide: true }
  );
}

/** Resolve the real Desktop folder (handles OneDrive redirection). */
function desktopDir() {
  const r = spawnSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-Command",
      "[Console]::OutputEncoding=[System.Text.Encoding]::UTF8; [Environment]::GetFolderPath('Desktop')",
    ],
    { encoding: "utf8", windowsHide: true }
  );
  const line = (r.stdout || "")
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean)
    .pop();
  return line && fs.existsSync(line) ? line : path.join(os.homedir(), "Desktop");
}

export function apply(ctx, config = {}) {
  console.log("[dsh-desktop-launcher-win32] plugin loading");

  if (process.platform !== "win32") {
    console.log("[dsh-desktop-launcher-win32] not Windows, skip");
    return;
  }

  const cfg = { ...DEFAULT_CONFIG, ...(config ?? {}) };

  try {
    const desktop = desktopDir();
    const cmdName = "dsh-web-launcher.cmd";
    const cmdPath = path.join(desktop, cmdName);
    const icoPath = resolveIcon(cfg, true);

    fs.writeFileSync(cmdPath, cmdContentFor(cfg), "ascii");
    console.log(`[dsh-desktop-launcher-win32] wrote launcher script: ${cmdPath}`);

    const lnkName = `${cfg.launcherName || "DSH Web"}.lnk`;
    const r = createShortcut(lnkName, icoPath, cmdPath);
    if (r.status !== 0) {
      console.warn(`[dsh-desktop-launcher-win32] shortcut creation failed: ${r.stderr || r.stdout}`);
    } else {
      console.log(`[dsh-desktop-launcher-win32] created desktop shortcut: ${path.join(desktop, lnkName)}`);
    }
  } catch (err) {
    console.error("[dsh-desktop-launcher-win32] failed:", err instanceof Error ? err.stack ?? err.message : String(err));
  }

  ctx.effect(() => {
    return () => {
      console.log("[dsh-desktop-launcher-win32] plugin unloaded");
    };
  });
}

export const config = DEFAULT_CONFIG;
