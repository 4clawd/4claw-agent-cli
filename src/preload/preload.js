const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("clawApi", {
  init: () => ipcRenderer.invoke("app:init"),
  getSettings: () => ipcRenderer.invoke("settings:get"),
  saveSettings: (patch) => ipcRenderer.invoke("settings:save", patch),
  listAgents: () => ipcRenderer.invoke("agents:list"),
  createAgent: (name) => ipcRenderer.invoke("agents:create", name),
  renameAgent: (id, name) => ipcRenderer.invoke("agents:rename", id, name),
  startAgent: (id) => ipcRenderer.invoke("agents:start", id),
  stopAgent: (id) => ipcRenderer.invoke("agents:stop", id),
  deleteAgent: (id) => ipcRenderer.invoke("agents:delete", id),
  loadConfig: (id) => ipcRenderer.invoke("agents:config:load", id),
  saveConfig: (id, data) => ipcRenderer.invoke("agents:config:save", id, data),
  exportConfig: (id) => ipcRenderer.invoke("agents:config:export", id),
  importConfig: (id) => ipcRenderer.invoke("agents:config:import", id),
  getLogs: (id, maxLines) => ipcRenderer.invoke("agents:logs:get", id, maxLines),
  clearLogs: (id) => ipcRenderer.invoke("agents:logs:clear", id),
  listBackups: (id) => ipcRenderer.invoke("agents:backups:list", id),
  createBackup: (id) => ipcRenderer.invoke("agents:backup:create", id),
  exportBackup: (id) => ipcRenderer.invoke("agents:backup:export", id),
  importBackup: (preferredName) => ipcRenderer.invoke("agents:backup:import", preferredName),
  restoreBackup: (fileName, preferredName) =>
    ipcRenderer.invoke("agents:backup:restore", fileName, preferredName),
  openAgentFolder: (id) => ipcRenderer.invoke("agents:folder:open", id),
  minimizeWindow: () => ipcRenderer.invoke("window:minimize"),
  closeWindow: () => ipcRenderer.invoke("window:close")
});
