const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const electronModule = require("electron");


function normalizeBootstrapArgs(args, cwd) {
  const launchCwd = String(cwd || process.cwd() || "").trim() || process.cwd();
  return (Array.isArray(args) ? args : []).map((arg) => {
    const value = String(arg || "");
    if (!value || value.startsWith("-")) {
      return value;
    }
    if (path.isAbsolute(value)) {
      return value;
    }
    const resolved = path.resolve(launchCwd, value);
    if (fs.existsSync(resolved)) {
      return resolved;
    }
    if (value === ".") {
      return launchCwd;
    }
    return value;
  });
}

if (typeof electronModule === "string") {
  // Some environments set ELECTRON_RUN_AS_NODE globally.
  const relaunchEnv = { ...process.env };
  delete relaunchEnv.ELECTRON_RUN_AS_NODE;
  const child = spawn(electronModule, normalizeBootstrapArgs(process.argv.slice(1), process.cwd()), {
    stdio: "inherit",
    env: relaunchEnv,
    cwd: process.cwd()
  });
  child.on("close", (code) => process.exit(code || 0));
  return;
}

const { app, BrowserWindow, ipcMain, dialog, shell, Tray, Menu, nativeImage } = electronModule;
const { AgentService, fileTimestamp } = require("./agent-service");

let mainWindow = null;
let agentService = null;
let tray = null;
let isQuitting = false;
let closeChoiceInProgress = false;
let appSettings = { closeBehavior: "ask", language: "en" };
let privilegeState = { elevated: false, label: "standard" };
const ELEVATION_FLAG = "--4claw-elevated-launch";
const ELEVATION_ENV = "FOURCLAW_ELEVATION_ATTEMPTED";
const ELEVATION_MARKER_PATH = path.join(os.tmpdir(), "4claw-cli-elevation-marker.json");
const MAIN_I18N = {
  en: {
    trayOpenPanel: "Open Panel",
    trayExit: "Exit",
    trayTooltip: "4claw CLI",
    closeTitle: "Exit 4claw CLI",
    closeMessage: "How should closing this window be handled?",
    closeDetail: "You can change default behavior in Settings.",
    closeBtnExit: "Exit Completely",
    closeBtnMinimize: "Minimize to Tray",
    closeBtnCancel: "Cancel",
    closeRemember: "Remember this choice",
    elevateTitle: "Launch 4claw CLI With Administrator Privileges",
    elevateMessage: "Do you want to relaunch 4claw CLI with administrator/root privileges?",
    elevateDetail:
      "The system will show its own security prompt. If you continue, 4claw CLI and any agent started from it will run with elevated privileges.",
    elevateBtnYes: "Relaunch Elevated",
    elevateBtnNo: "Continue Normally",
    elevateFailedTitle: "Elevation Failed",
    elevateFailedMessage: "4claw CLI could not relaunch with elevated privileges.",
    privilegeAdmin: "Administrator",
    privilegeRoot: "root",
    privilegeStandard: "standard"
  },
  "zh-CN": {
    trayOpenPanel: "打开面板",
    trayExit: "关闭退出",
    trayTooltip: "4claw CLI",
    closeTitle: "退出 4claw CLI",
    closeMessage: "关闭窗口时如何处理？",
    closeDetail: "可在“设置”页修改默认行为。",
    closeBtnExit: "彻底退出",
    closeBtnMinimize: "最小化运行",
    closeBtnCancel: "取消",
    closeRemember: "记住本次选择",
    elevateTitle: "以管理员权限启动 4claw CLI",
    elevateMessage: "是否要以管理员/root 权限重新启动 4claw CLI？",
    elevateDetail: "系统会弹出自己的安全确认窗口。继续后，4claw CLI 以及它启动的 agent 都会以高权限运行。",
    elevateBtnYes: "重新以高权限启动",
    elevateBtnNo: "继续普通启动",
    elevateFailedTitle: "提权失败",
    elevateFailedMessage: "4claw CLI 未能以高权限重新启动。",
    privilegeAdmin: "管理员",
    privilegeRoot: "root",
    privilegeStandard: "普通权限"
  },
  ru: {
    trayOpenPanel: "Открыть панель",
    trayExit: "Закрыть и выйти",
    trayTooltip: "4claw CLI",
    closeTitle: "Выход из 4claw CLI",
    closeMessage: "Как обработать закрытие окна?",
    closeDetail: "Поведение по умолчанию можно изменить в Настройках.",
    closeBtnExit: "Полный выход",
    closeBtnMinimize: "Свернуть в трей",
    closeBtnCancel: "Отмена",
    closeRemember: "Запомнить выбор",
    elevateTitle: "Запуск 4claw CLI с правами администратора",
    elevateMessage: "Перезапустить 4claw CLI с правами администратора/root?",
    elevateDetail:
      "Система покажет собственный запрос безопасности. Если продолжить, 4claw CLI и все агенты, запущенные из него, будут работать с повышенными правами.",
    elevateBtnYes: "Перезапустить с повышением",
    elevateBtnNo: "Продолжить обычно",
    elevateFailedTitle: "Не удалось повысить права",
    elevateFailedMessage: "Не удалось перезапустить 4claw CLI с повышенными правами.",
    privilegeAdmin: "Администратор",
    privilegeRoot: "root",
    privilegeStandard: "Обычные права"
  }
};
function getMainText() {
  return MAIN_I18N[appSettings.language] || MAIN_I18N.en;
}

function getSettingsPath() {
  return path.join(app.getPath("userData"), "runtime", "ui-settings.json");
}

function normalizeSettings(input) {
  const allowedCloseBehavior = new Set(["ask", "minimize", "exit"]);
  const allowedLanguages = new Set(["en", "zh-CN", "ru"]);
  const closeBehavior = typeof input?.closeBehavior === "string" ? input.closeBehavior : "ask";
  const language = typeof input?.language === "string" ? input.language : "en";
  return {
    closeBehavior: allowedCloseBehavior.has(closeBehavior) ? closeBehavior : "ask",
    language: allowedLanguages.has(language) ? language : "en"
  };
}

function loadSettings() {
  const filePath = getSettingsPath();
  if (!fs.existsSync(filePath)) {
    appSettings = { closeBehavior: "ask", language: "en" };
    return appSettings;
  }
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
    appSettings = normalizeSettings(raw);
  } catch {
    appSettings = { closeBehavior: "ask", language: "en" };
  }
  return appSettings;
}

function saveSettings(patch) {
  appSettings = normalizeSettings({ ...appSettings, ...(patch || {}) });
  const filePath = getSettingsPath();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(appSettings, null, 2)}\n`, "utf8");
  if (tray) {
    tray.setToolTip(getMainText().trayTooltip);
    const menu = Menu.buildFromTemplate([
      {
        label: getMainText().trayOpenPanel,
        click: () => showMainWindow()
      },
      {
        type: "separator"
      },
      {
        label: getMainText().trayExit,
        click: () => {
          isQuitting = true;
          app.quit();
        }
      }
    ]);
    tray.setContextMenu(menu);
  }
  return appSettings;
}

function resolveIconPath(candidates) {
  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return "";
}

function stripUtf8Bom(text) {
  if (typeof text !== "string") {
    return "";
  }
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function quoteForShell(value) {
  const text = String(value || "");
  return `'${text.replace(/'/g, `'\\''`)}'`;
}

function escapePowerShellString(value) {
  return String(value || "").replace(/'/g, "''");
}

function escapeAppleScriptString(value) {
  return String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"');
}

function normalizeLaunchArgs(args, cwd) {
  const launchCwd = String(cwd || process.cwd() || "").trim() || process.cwd();
  return (Array.isArray(args) ? args : []).map((arg) => {
    const value = String(arg || "");
    if (!value || value.startsWith("-")) {
      return value;
    }

    if (path.isAbsolute(value)) {
      return value;
    }

    const resolved = path.resolve(launchCwd, value);
    if (fs.existsSync(resolved)) {
      return resolved;
    }

    if (value === ".") {
      return launchCwd;
    }

    return value;
  });
}

function getLaunchCommand() {
  const cwd = process.cwd();
  const portableExecutable = process.platform === "win32" ? String(process.env.PORTABLE_EXECUTABLE_FILE || "").trim() : "";
  const portableDirectory = process.platform === "win32" ? String(process.env.PORTABLE_EXECUTABLE_DIR || "").trim() : "";
  if (app.isPackaged) {
    const file = portableExecutable || process.execPath;
    const launchCwd = portableDirectory || path.dirname(file) || cwd;
    return {
      file,
      args: normalizeLaunchArgs(process.argv.slice(1), cwd),
      cwd: launchCwd
    };
  }

  const electronBinary = process.execPath;
  const argv = normalizeLaunchArgs(process.argv.slice(1), cwd);
  return {
    file: electronBinary,
    args: argv,
    cwd
  };
}

function detectPrivilegeState() {
  if (process.platform === "win32") {
    return new Promise((resolve) => {
      const child = spawn(
        "powershell",
        [
          "-NoProfile",
          "-NonInteractive",
          "-Command",
          "[Console]::OutputEncoding=[System.Text.Encoding]::UTF8; if (([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { 'true' } else { 'false' }"
        ],
        { windowsHide: true }
      );
      let output = "";
      child.stdout.on("data", (chunk) => {
        output += String(chunk);
      });
      child.on("close", () => {
        const elevated = output.trim().toLowerCase() === "true";
        resolve({
          elevated,
          label: elevated ? getMainText().privilegeAdmin : getMainText().privilegeStandard
        });
      });
      child.on("error", () =>
        resolve({
          elevated: false,
          label: getMainText().privilegeStandard
        })
      );
    });
  }

  const elevated = typeof process.getuid === "function" ? process.getuid() === 0 : false;
  return Promise.resolve({
    elevated,
    label: elevated ? getMainText().privilegeRoot : getMainText().privilegeStandard
  });
}

function shouldAskForElevation() {
  if (privilegeState.elevated) {
    return false;
  }
  if (hasRecentElevationMarker()) {
    clearElevationMarker();
    return false;
  }
  if (process.argv.includes(ELEVATION_FLAG)) {
    return false;
  }
  if (process.env[ELEVATION_ENV] === "1") {
    return false;
  }
  return true;
}

function writeElevationMarker() {
  try {
    fs.writeFileSync(
      ELEVATION_MARKER_PATH,
      JSON.stringify({
        createdAt: Date.now(),
        pid: process.pid,
        execPath: process.execPath,
        portableExecutable: process.env.PORTABLE_EXECUTABLE_FILE || ""
      }),
      "utf8"
    );
  } catch {}
}

function clearElevationMarker() {
  try {
    if (fs.existsSync(ELEVATION_MARKER_PATH)) {
      fs.unlinkSync(ELEVATION_MARKER_PATH);
    }
  } catch {}
}

function hasRecentElevationMarker() {
  try {
    if (!fs.existsSync(ELEVATION_MARKER_PATH)) {
      return false;
    }
    const payload = JSON.parse(fs.readFileSync(ELEVATION_MARKER_PATH, "utf8"));
    const createdAt = Number(payload?.createdAt || 0);
    if (!Number.isFinite(createdAt) || createdAt <= 0) {
      return false;
    }
    return Date.now() - createdAt < 2 * 60 * 1000;
  } catch {
    return false;
  }
}

function relaunchElevated() {
  const launch = getLaunchCommand();
  const args = [...launch.args.filter((item) => item !== ELEVATION_FLAG), ELEVATION_FLAG];
  const env = { ...process.env, [ELEVATION_ENV]: "1" };
  const workingDirectory = String(launch.cwd || process.cwd() || "").trim() || process.cwd();
  writeElevationMarker();

  if (process.platform === "win32") {
    const argList = args.map((item) => `'${escapePowerShellString(item)}'`).join(",");
    const command = [
      "Start-Process",
      `-FilePath '${escapePowerShellString(launch.file)}'`,
      argList ? `-ArgumentList ${argList}` : "",
      `-WorkingDirectory '${escapePowerShellString(workingDirectory)}'`,
      "-Verb RunAs"
    ]
      .filter(Boolean)
      .join(" ");
    return new Promise((resolve, reject) => {
      const child = spawn("powershell", ["-NoProfile", "-NonInteractive", "-Command", command], {
        windowsHide: true,
        env
      });
      let stderr = "";
      child.stderr.on("data", (chunk) => {
        stderr += String(chunk);
      });
      child.on("error", (error) => {
        clearElevationMarker();
        reject(error);
      });
      child.on("close", (code) => {
        if (code === 0) {
          resolve(true);
          return;
        }
        clearElevationMarker();
        reject(new Error(stderr.trim() || `Elevation request failed with code ${code}`));
      });
    });
  }

  if (process.platform === "darwin") {
    const command = `cd ${quoteForShell(workingDirectory)} && nohup ${quoteForShell(launch.file)} ${args
      .map(quoteForShell)
      .join(" ")} >/dev/null 2>&1 &`;
    const appleScript = `do shell script "${escapeAppleScriptString(command)}" with administrator privileges`;
    return new Promise((resolve, reject) => {
      const child = spawn("osascript", ["-e", appleScript], {
        env
      });
      let stderr = "";
      child.stderr.on("data", (chunk) => {
        stderr += String(chunk);
      });
      child.on("error", (error) => {
        clearElevationMarker();
        reject(error);
      });
      child.on("close", (code) => {
        if (code === 0) {
          resolve(true);
          return;
        }
        clearElevationMarker();
        reject(new Error(stderr.trim() || `Elevation request failed with code ${code}`));
      });
    });
  }

  const envArgs = ["env"];
  for (const [key, value] of Object.entries({
    DISPLAY: process.env.DISPLAY || "",
    XAUTHORITY: process.env.XAUTHORITY || "",
    WAYLAND_DISPLAY: process.env.WAYLAND_DISPLAY || "",
    XDG_RUNTIME_DIR: process.env.XDG_RUNTIME_DIR || "",
    ...env
  })) {
    if (value) {
      envArgs.push(`${key}=${value}`);
    }
  }
  envArgs.push(launch.file, ...args);

  const spawnDetached = (command, commandArgs) =>
    new Promise((resolve, reject) => {
      const child = spawn(command, commandArgs, {
        env,
        cwd: workingDirectory,
        detached: true,
        stdio: "ignore"
      });
      child.on("error", (error) => {
        clearElevationMarker();
        reject(error);
      });
      child.on("spawn", () => {
        child.unref();
        resolve(true);
      });
    });

  return spawnDetached("pkexec", envArgs).catch((error) => {
    if (error && error.code !== "ENOENT") {
      throw error;
    }
    return spawnDetached("sudo", ["-E", launch.file, ...args]);
  });
}

async function maybePromptForElevation() {
  if (!shouldAskForElevation()) {
    return;
  }

  const text = getMainText();
  const result = await dialog.showMessageBox({
    type: "question",
    buttons: [text.elevateBtnYes, text.elevateBtnNo],
    defaultId: 0,
    cancelId: 1,
    noLink: true,
    title: text.elevateTitle,
    message: text.elevateMessage,
    detail: text.elevateDetail
  });

  if (result.response !== 0) {
    return;
  }

  try {
    await relaunchElevated();
    isQuitting = true;
    app.quit();
  } catch (error) {
    await dialog.showMessageBox({
      type: "error",
      buttons: ["OK"],
      defaultId: 0,
      noLink: true,
      title: text.elevateFailedTitle,
      message: text.elevateFailedMessage,
      detail: error && error.message ? error.message : String(error)
    });
  }
}

function loadModelCatalog() {
  const candidates = [
    path.join(app.getAppPath(), "src", "models.json"),
    path.join(process.cwd(), "src", "models.json")
  ];
  const filePath = candidates.find((item) => item && fs.existsSync(item));
  if (!filePath) {
    return [];
  }
  try {
    const parsed = JSON.parse(stripUtf8Bom(fs.readFileSync(filePath, "utf8")));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function loadDefaultConfigTemplate() {
  const candidates = [
    path.join(app.getAppPath(), "assets", "default-config.json"),
    path.join(process.cwd(), "assets", "default-config.json")
  ];
  const filePath = candidates.find((item) => item && fs.existsSync(item));
  if (!filePath) {
    return {};
  }
  try {
    const parsed = JSON.parse(stripUtf8Bom(fs.readFileSync(filePath, "utf8")));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function resolveAppIconPath() {
  return resolveIconPath([
    path.join(app.getAppPath(), "assets", "logo.png"),
    path.join(app.getAppPath(), "assets", "icon.png"),
    path.join(process.cwd(), "assets", "logo.png"),
    path.join(process.cwd(), "assets", "icon.png")
  ]);
}

function resolveTrayIconPath() {
  return resolveIconPath([
    path.join(app.getAppPath(), "assets", "tray.png"),
    path.join(app.getAppPath(), "assets", "logo.png"),
    path.join(process.cwd(), "assets", "tray.png"),
    path.join(process.cwd(), "assets", "logo.png"),
    process.execPath
  ]);
}

function resolveImage(iconPath) {
  if (!iconPath) {
    return nativeImage.createEmpty();
  }
  const icon = nativeImage.createFromPath(iconPath);
  if (!icon.isEmpty()) {
    return icon;
  }
  return nativeImage.createEmpty();
}

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow();
    return;
  }
  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }
  mainWindow.show();
  mainWindow.focus();
}

function ensureTray() {
  if (tray) {
    return;
  }

  const trayImage = resolveImage(resolveTrayIconPath());
  tray = new Tray(trayImage);
  tray.setToolTip(getMainText().trayTooltip);

  const menu = Menu.buildFromTemplate([
    {
      label: getMainText().trayOpenPanel,
      click: () => showMainWindow()
    },
    {
      type: "separator"
    },
    {
      label: getMainText().trayExit,
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ]);

  tray.setContextMenu(menu);
  tray.on("double-click", () => showMainWindow());
}

function hideToTray() {
  ensureTray();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.hide();
  }
}

async function handleCloseByBehavior() {
  const behavior = appSettings.closeBehavior || "ask";
  if (behavior === "exit") {
    isQuitting = true;
    app.quit();
    return;
  }
  if (behavior === "minimize") {
    hideToTray();
    return;
  }

  const text = getMainText();
  const result = await dialog.showMessageBox(mainWindow, {
    type: "question",
    buttons: [text.closeBtnExit, text.closeBtnMinimize, text.closeBtnCancel],
    defaultId: 1,
    cancelId: 2,
    noLink: true,
    title: text.closeTitle,
    message: text.closeMessage,
    detail: text.closeDetail,
    checkboxLabel: text.closeRemember,
    checkboxChecked: false
  });

  if (result.response === 0) {
    if (result.checkboxChecked) {
      saveSettings({ closeBehavior: "exit" });
    }
    isQuitting = true;
    app.quit();
    return;
  }

  if (result.response === 1) {
    if (result.checkboxChecked) {
      saveSettings({ closeBehavior: "minimize" });
    }
    hideToTray();
  }
}

function createWindow() {
  const iconPath = resolveAppIconPath();
  mainWindow = new BrowserWindow({
    width: 1500,
    height: 980,
    minWidth: 1200,
    minHeight: 780,
    backgroundColor: "#fef7dc",
    title: "4claw Desktop",
    icon: iconPath || undefined,
    frame: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "..", "preload", "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.setMenuBarVisibility(false);
  mainWindow.removeMenu();
  mainWindow.loadFile(path.join(__dirname, "..", "renderer", "index.html"));

  mainWindow.on("close", async (event) => {
    if (isQuitting) {
      return;
    }
    event.preventDefault();

    if (closeChoiceInProgress) {
      return;
    }

    closeChoiceInProgress = true;
    try {
      await handleCloseByBehavior();
    } finally {
      closeChoiceInProgress = false;
    }
  });
}

function setupIpc() {
  ipcMain.handle("app:init", () => {
    const binary = agentService.resolveBinaryPath();
    return {
      platform: process.platform,
      arch: process.arch,
      privilege: privilegeState,
      userData: agentService.paths.userData,
      runtimeRoot: agentService.paths.root,
      settings: appSettings,
      modelCatalog: loadModelCatalog(),
      defaultConfig: loadDefaultConfigTemplate(),
      binary,
      binaryDropPath: path.join(process.cwd(), "resources", "bin", binary.binaryName)
    };
  });

  ipcMain.handle("settings:get", () => appSettings);
  ipcMain.handle("settings:save", (_event, patch) => saveSettings(patch));
  ipcMain.handle("auth:status", () => agentService.getAuthStatus());
  ipcMain.handle("auth:login", (_event, provider) => agentService.loginWithOAuth(provider));
  ipcMain.handle("auth:session", (_event, sessionId) => agentService.getAuthSession(sessionId));
  ipcMain.handle("shell:openExternal", (_event, target) => {
    const url = String(target || "").trim();
    if (!url) {
      return false;
    }
    return shell.openExternal(url);
  });

  ipcMain.handle("agents:list", () => agentService.listAgents());
  ipcMain.handle("agents:create", (_event, name) => agentService.createAgent(name));
  ipcMain.handle("agents:rename", (_event, id, name) => agentService.renameAgent(id, name));
  ipcMain.handle("agents:start", (_event, id) => agentService.startAgent(id));
  ipcMain.handle("agents:stop", (_event, id) => agentService.stopAgent(id));
  ipcMain.handle("agents:delete", (_event, id) => agentService.deleteAgent(id));

  ipcMain.handle("agents:config:load", (_event, id) => agentService.loadConfig(id));
  ipcMain.handle("agents:config:save", (_event, id, data) => agentService.saveConfig(id, data));
  ipcMain.handle("agents:chat:session:get", (_event, id, sessionKey = "") =>
    agentService.getChatSession(id, sessionKey)
  );
  ipcMain.handle("agents:chat:session:new", (_event, id) => agentService.createChatSession(id));
  ipcMain.handle("agents:chat:send", (_event, id, sessionKey, message) =>
    agentService.sendChatMessage(id, sessionKey, message)
  );
  ipcMain.handle("agents:config:export", async (_event, id) => {
    const result = await dialog.showSaveDialog({
      title: "Export Agent Config",
      defaultPath: `${id}-config-${fileTimestamp()}.json`,
      filters: [{ name: "JSON", extensions: ["json"] }]
    });
    if (result.canceled || !result.filePath) {
      return null;
    }
    return agentService.exportConfig(id, result.filePath);
  });
  ipcMain.handle("agents:config:import", async (_event, id) => {
    const result = await dialog.showOpenDialog({
      title: "Import Agent Config",
      properties: ["openFile"],
      filters: [{ name: "JSON", extensions: ["json"] }]
    });
    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }
    return agentService.importConfig(id, result.filePaths[0]);
  });

  ipcMain.handle("agents:logs:get", (_event, id, maxLines) => agentService.getLogs(id, maxLines));
  ipcMain.handle("agents:logs:clear", (_event, id) => agentService.clearLogs(id));

  ipcMain.handle("agents:backups:list", (_event, id) => agentService.listBackups(id));
  ipcMain.handle("agents:backup:create", (_event, id) => agentService.createBackup(id));
  ipcMain.handle("agents:backup:export", async (_event, id) => {
    const result = await dialog.showSaveDialog({
      title: "Export Agent Backup",
      defaultPath: `${id}-${fileTimestamp()}.zip`,
      filters: [{ name: "Zip Archive", extensions: ["zip"] }]
    });
    if (result.canceled || !result.filePath) {
      return null;
    }
    return agentService.createBackup(id, result.filePath);
  });
  ipcMain.handle("agents:backup:import", async (_event, preferredName = "") => {
    const result = await dialog.showOpenDialog({
      title: "Import Agent Backup",
      properties: ["openFile"],
      filters: [{ name: "Zip Archive", extensions: ["zip"] }]
    });
    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }
    return agentService.importBackup(result.filePaths[0], preferredName);
  });
  ipcMain.handle("agents:backup:restore", (_event, fileName, preferredName = "") =>
    agentService.restoreFromLocalBackup(fileName, preferredName)
  );

  ipcMain.handle("agents:folder:open", async (_event, id) => {
    const agent = agentService.getAgent(id);
    if (!agent) {
      throw new Error(`Agent ${id} does not exist`);
    }
    await shell.openPath(agent.dir);
    return true;
  });

  ipcMain.handle("window:minimize", () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.minimize();
    }
    return true;
  });

  ipcMain.handle("window:close", () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.close();
    }
    return true;
  });
}

app.whenReady().then(() => {
  loadSettings();
  detectPrivilegeState()
    .then((state) => {
      privilegeState = state;
    })
    .catch(() => {
      privilegeState = { elevated: false, label: getMainText().privilegeStandard };
    })
    .finally(async () => {
      Menu.setApplicationMenu(null);

      const appIcon = resolveImage(resolveAppIconPath());
      if (process.platform === "darwin" && appIcon && !appIcon.isEmpty() && app.dock) {
        app.dock.setIcon(appIcon);
      }

      await maybePromptForElevation();
      if (isQuitting) {
        return;
      }

      agentService = new AgentService(app);
      setupIpc();
      createWindow();

      app.on("activate", () => {
        if (BrowserWindow.getAllWindows().length === 0) {
          createWindow();
        } else {
          showMainWindow();
        }
      });
    });
});

app.on("window-all-closed", () => {
  if (!isQuitting && tray) {
    return;
  }
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", async () => {
  isQuitting = true;

  if (!agentService) {
    return;
  }

  const active = agentService.listAgents().filter((a) => a.status.running);
  for (const item of active) {
    try {
      await agentService.stopAgent(item.id);
    } catch {}
  }

  if (tray) {
    tray.destroy();
    tray = null;
  }
});

