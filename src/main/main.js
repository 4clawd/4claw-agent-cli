const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const electronModule = require("electron");

if (typeof electronModule === "string") {
  // Some environments set ELECTRON_RUN_AS_NODE globally.
  const relaunchEnv = { ...process.env };
  delete relaunchEnv.ELECTRON_RUN_AS_NODE;
  const child = spawn(electronModule, process.argv.slice(1), {
    stdio: "inherit",
    env: relaunchEnv
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
    closeRemember: "Remember this choice"
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
    closeRemember: "记住本次选择"
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
    closeRemember: "Запомнить выбор"
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
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
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
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
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

  ipcMain.handle("agents:list", () => agentService.listAgents());
  ipcMain.handle("agents:create", (_event, name) => agentService.createAgent(name));
  ipcMain.handle("agents:rename", (_event, id, name) => agentService.renameAgent(id, name));
  ipcMain.handle("agents:start", (_event, id) => agentService.startAgent(id));
  ipcMain.handle("agents:stop", (_event, id) => agentService.stopAgent(id));
  ipcMain.handle("agents:delete", (_event, id) => agentService.deleteAgent(id));

  ipcMain.handle("agents:config:load", (_event, id) => agentService.loadConfig(id));
  ipcMain.handle("agents:config:save", (_event, id, data) => agentService.saveConfig(id, data));
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
  Menu.setApplicationMenu(null);

  const appIcon = resolveImage(resolveAppIconPath());
  if (process.platform === "darwin" && appIcon && !appIcon.isEmpty() && app.dock) {
    app.dock.setIcon(appIcon);
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
