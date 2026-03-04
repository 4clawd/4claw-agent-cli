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

function resolveTrayIcon() {
  const candidates = [
    path.join(app.getAppPath(), "assets", "tray.ico"),
    path.join(app.getAppPath(), "assets", "tray.png"),
    path.join(process.cwd(), "assets", "tray.ico"),
    path.join(process.cwd(), "assets", "tray.png"),
    process.execPath
  ];
  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }
    try {
      const icon = nativeImage.createFromPath(candidate);
      if (!icon.isEmpty()) {
        return icon;
      }
    } catch {}
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
  tray = new Tray(resolveTrayIcon());
  tray.setToolTip("4claw CLI");

  const menu = Menu.buildFromTemplate([
    {
      label: "打开面板",
      click: () => showMainWindow()
    },
    {
      type: "separator"
    },
    {
      label: "关闭退出",
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

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1500,
    height: 980,
    minWidth: 1200,
    minHeight: 780,
    backgroundColor: "#fef7dc",
    title: "4claw Desktop",
    webPreferences: {
      preload: path.join(__dirname, "..", "preload", "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

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
      const result = await dialog.showMessageBox(mainWindow, {
        type: "question",
        buttons: ["彻底退出", "最小化运行", "取消"],
        defaultId: 1,
        cancelId: 2,
        noLink: true,
        title: "退出 4claw CLI",
        message: "关闭窗口时如何处理？",
        detail: "选择“最小化运行”后，程序会继续在后台运行，并在系统托盘显示图标。"
      });

      if (result.response === 0) {
        isQuitting = true;
        app.quit();
        return;
      }
      if (result.response === 1) {
        hideToTray();
      }
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
      binary,
      binaryDropPath: path.join(process.cwd(), "resources", "bin", binary.binaryName)
    };
  });

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
      title: "导出 Agent 备份",
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
      title: "导入备份",
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
      throw new Error(`Agent ${id} 不存在`);
    }
    await shell.openPath(agent.dir);
    return true;
  });
}

app.whenReady().then(() => {
  agentService = new AgentService(app);
  setupIpc();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
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
