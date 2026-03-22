const { contextBridge, ipcRenderer } = require("electron");
const QRCode = require("qrcode");

contextBridge.exposeInMainWorld("clawApi", {
  init: () => ipcRenderer.invoke("app:init"),
  getSettings: () => ipcRenderer.invoke("settings:get"),
  saveSettings: (patch) => ipcRenderer.invoke("settings:save", patch),
  getAuthStatus: () => ipcRenderer.invoke("auth:status"),
  authLogin: (provider) => ipcRenderer.invoke("auth:login", provider),
  getAuthSession: (sessionId) => ipcRenderer.invoke("auth:session", sessionId),
  startWeChatLogin: (channelConfig) => ipcRenderer.invoke("channels:wechat:login", channelConfig),
  getWeChatLoginSession: (sessionId) => ipcRenderer.invoke("channels:wechat:session", sessionId),
  generateQRCode: async (text) =>
    QRCode.toDataURL(String(text || ""), {
      errorCorrectionLevel: "M",
      margin: 2,
      width: 320
    }),
  listAgents: () => ipcRenderer.invoke("agents:list"),
  createAgent: (name) => ipcRenderer.invoke("agents:create", name),
  renameAgent: (id, name) => ipcRenderer.invoke("agents:rename", id, name),
  startAgent: (id) => ipcRenderer.invoke("agents:start", id),
  stopAgent: (id) => ipcRenderer.invoke("agents:stop", id),
  deleteAgent: (id) => ipcRenderer.invoke("agents:delete", id),
  getChatSession: (id, sessionKey) => ipcRenderer.invoke("agents:chat:session:get", id, sessionKey),
  createChatSession: (id) => ipcRenderer.invoke("agents:chat:session:new", id),
  sendChatMessage: (id, sessionKey, message) => ipcRenderer.invoke("agents:chat:send", id, sessionKey, message),
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
  openExternal: (target) => ipcRenderer.invoke("shell:openExternal", target),
  minimizeWindow: () => ipcRenderer.invoke("window:minimize"),
  closeWindow: () => ipcRenderer.invoke("window:close")
});
