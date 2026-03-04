const api = window.clawApi;

const state = {
  appInfo: null,
  agents: [],
  selectedAgentId: "",
  selectedTab: "dashboard",
  selectedConfigView: "quick",
  configDraft: null,
  configOriginal: null,
  logs: "",
  backups: [],
  settings: {
    closeBehavior: "ask"
  }
};

const els = {
  runtimeInfo: document.getElementById("runtimeInfo"),
  minimizeWindowBtn: document.getElementById("minimizeWindowBtn"),
  closeWindowBtn: document.getElementById("closeWindowBtn"),
  createAgentBtn: document.getElementById("createAgentBtn"),
  importBackupBtn: document.getElementById("importBackupBtn"),
  refreshAgentsBtn: document.getElementById("refreshAgentsBtn"),
  agentList: document.getElementById("agentList"),
  selectedAgentTitle: document.getElementById("selectedAgentTitle"),
  renameAgentBtn: document.getElementById("renameAgentBtn"),
  openAgentFolderBtn: document.getElementById("openAgentFolderBtn"),
  deleteAgentBtn: document.getElementById("deleteAgentBtn"),
  tabs: Array.from(document.querySelectorAll("nav.tabs .tab-btn[data-tab]")),
  panes: {
    dashboard: document.getElementById("tab-dashboard"),
    config: document.getElementById("tab-config"),
    logs: document.getElementById("tab-logs"),
    backups: document.getElementById("tab-backups"),
    settings: document.getElementById("tab-settings")
  },
  importConfigBtn: document.getElementById("importConfigBtn"),
  exportConfigBtn: document.getElementById("exportConfigBtn"),
  reloadConfigBtn: document.getElementById("reloadConfigBtn"),
  quickConfigTabBtn: document.getElementById("quickConfigTabBtn"),
  fullConfigTabBtn: document.getElementById("fullConfigTabBtn"),
  quickConfigPanel: document.getElementById("quickConfigPanel"),
  fullConfigPanel: document.getElementById("fullConfigPanel"),
  quickAgentName: document.getElementById("quickAgentName"),
  quickModelAlias: document.getElementById("quickModelAlias"),
  quickModelName: document.getElementById("quickModelName"),
  quickApiBase: document.getElementById("quickApiBase"),
  quickApiKey: document.getElementById("quickApiKey"),
  quickTelegramEnabled: document.getElementById("quickTelegramEnabled"),
  quickTelegramToken: document.getElementById("quickTelegramToken"),
  quickTelegramAllowFrom: document.getElementById("quickTelegramAllowFrom"),
  saveQuickConfigBtn: document.getElementById("saveQuickConfigBtn"),
  saveConfigBtn: document.getElementById("saveConfigBtn"),
  configEditor: document.getElementById("configEditor"),
  refreshLogsBtn: document.getElementById("refreshLogsBtn"),
  clearLogsBtn: document.getElementById("clearLogsBtn"),
  logViewer: document.getElementById("logViewer"),
  createBackupBtn: document.getElementById("createBackupBtn"),
  exportBackupBtn: document.getElementById("exportBackupBtn"),
  backupList: document.getElementById("backupList"),
  saveSettingsBtn: document.getElementById("saveSettingsBtn"),
  toastHost: document.getElementById("toastHost"),
  createWizardModal: document.getElementById("createWizardModal"),
  wizardStepLabel: document.getElementById("wizardStepLabel"),
  wizardStep1: document.getElementById("wizardStep1"),
  wizardStep2: document.getElementById("wizardStep2"),
  wizardAgentName: document.getElementById("wizardAgentName"),
  wizardModelAlias: document.getElementById("wizardModelAlias"),
  wizardModelName: document.getElementById("wizardModelName"),
  wizardApiBase: document.getElementById("wizardApiBase"),
  wizardApiKey: document.getElementById("wizardApiKey"),
  wizardTelegramEnabled: document.getElementById("wizardTelegramEnabled"),
  wizardTelegramToken: document.getElementById("wizardTelegramToken"),
  wizardTelegramAllowFrom: document.getElementById("wizardTelegramAllowFrom"),
  wizardCancelBtn: document.getElementById("wizardCancelBtn"),
  wizardPrevBtn: document.getElementById("wizardPrevBtn"),
  wizardNextBtn: document.getElementById("wizardNextBtn"),
  wizardSubmitBtn: document.getElementById("wizardSubmitBtn")
};

const wizardState = {
  open: false,
  step: 1,
  submitting: false
};

let logsRefreshInFlight = false;
let logsAutoRefreshTimer = null;

function showToast(message, type = "info") {
  if (!els.toastHost) {
    return;
  }
  const toast = document.createElement("div");
  toast.className = `toast ${type === "error" ? "toast-error" : ""}`;
  toast.textContent = String(message || "");
  els.toastHost.appendChild(toast);
  window.setTimeout(() => {
    toast.remove();
  }, 2600);
}

function showError(error) {
  const message = error && error.message ? error.message : String(error);
  showToast(message, "error");
}

function showInfo(message) {
  showToast(message, "info");
}

function safeClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function bytesToText(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 B";
  }
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i += 1;
  }
  return `${n.toFixed(i === 0 ? 0 : 2)} ${units[i]}`;
}

function fmtDate(value) {
  if (!value) {
    return "-";
  }
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    return value;
  }
  return d.toLocaleString();
}

function parseIdList(raw) {
  const text = String(raw || "");
  return text
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function stringifyIdList(list) {
  if (!Array.isArray(list)) {
    return "";
  }
  return list.map((item) => String(item)).join(", ");
}

function getSelectedAgent() {
  return state.agents.find((a) => a.id === state.selectedAgentId) || null;
}

function getAtPath(path) {
  let cursor = state.configDraft;
  for (const seg of path) {
    if (cursor === undefined || cursor === null) {
      return undefined;
    }
    cursor = cursor[seg];
  }
  return cursor;
}

function ensureSelectedAgent() {
  const selected = getSelectedAgent();
  if (!selected) {
    showInfo("Please select an agent first.");
    return null;
  }
  return selected;
}

function renderSettings() {
  const value = state.settings?.closeBehavior || "ask";
  const radios = Array.from(document.querySelectorAll('input[name="closeBehavior"]'));
  for (const radio of radios) {
    radio.checked = radio.value === value;
  }
}

async function loadSettings() {
  try {
    const payload = await api.getSettings();
    if (payload && typeof payload === "object") {
      state.settings = {
        closeBehavior: payload.closeBehavior || "ask"
      };
    }
  } catch {}
  renderSettings();
}

async function saveSettingsAction() {
  const checked = document.querySelector('input[name="closeBehavior"]:checked');
  const closeBehavior = checked ? checked.value : "ask";
  try {
    const saved = await api.saveSettings({ closeBehavior });
    state.settings = {
      closeBehavior: saved?.closeBehavior || "ask"
    };
    renderSettings();
    showInfo("Settings saved.");
  } catch (error) {
    showError(error);
  }
}

function renderRuntimeInfo() {
  const info = state.appInfo;
  if (!info) {
    els.runtimeInfo.textContent = "";
    return;
  }

  const lines = [];
  lines.push(`Platform: ${info.platform}/${info.arch}`);
  lines.push(`Runtime: ${info.runtimeRoot}`);
  if (info.binary.found) {
    lines.push(`4claw Binary: ${info.binary.resolvedPath}`);
  } else {
    lines.push(`Missing ${info.binary.binaryName}`);
    lines.push(`Drop binary at: ${info.binaryDropPath}`);
  }
  els.runtimeInfo.innerHTML = lines.join("<br/>");
}

function setTab(tabName) {
  state.selectedTab = tabName;
  for (const tab of els.tabs) {
    tab.classList.toggle("active", tab.dataset.tab === tabName);
  }
  for (const [key, pane] of Object.entries(els.panes)) {
    pane.classList.toggle("active", key === tabName);
  }

  if (tabName === "logs") {
    refreshLogs();
  }
  if (tabName === "backups") {
    refreshBackups();
  }
}

function setConfigView(nextView) {
  const view = nextView === "full" ? "full" : "quick";
  state.selectedConfigView = view;
  els.quickConfigTabBtn.classList.toggle("active", view === "quick");
  els.fullConfigTabBtn.classList.toggle("active", view === "full");
  els.quickConfigPanel.classList.toggle("active", view === "quick");
  els.fullConfigPanel.classList.toggle("active", view === "full");
}
function renderAgentList() {
  els.agentList.innerHTML = "";
  if (state.agents.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "No agents yet. Click create to get started.";
    els.agentList.appendChild(empty);
    return;
  }

  for (const agent of state.agents) {
    const card = document.createElement("div");
    card.className = `agent-card ${agent.id === state.selectedAgentId ? "active" : ""}`;
    card.addEventListener("click", () => {
      selectAgent(agent.id);
    });

    const top = document.createElement("div");
    top.className = "agent-top";
    const name = document.createElement("div");
    name.className = "agent-name";
    name.textContent = agent.meta.name || agent.id;
    const badge = document.createElement("div");
    badge.className = `status-badge ${agent.status.running ? "status-running" : "status-stopped"}`;
    badge.textContent = agent.status.running ? "Running" : "Stopped";
    top.appendChild(name);
    top.appendChild(badge);
    card.appendChild(top);

    const meta = document.createElement("div");
    meta.className = "agent-meta";
    meta.innerHTML = `
      <div>ID: ${agent.id}</div>
      <div>Port: ${(agent.config && agent.config.gateway && agent.config.gateway.port) || "-"}</div>
      <div>Last Start: ${fmtDate(agent.meta.lastStartedAt)}</div>
    `;
    card.appendChild(meta);

    const actions = document.createElement("div");
    actions.className = "agent-actions";

    const toggleBtn = document.createElement("button");
    toggleBtn.className = "btn btn-xs";
    toggleBtn.textContent = agent.status.running ? "Stop" : "Start";
    toggleBtn.addEventListener("click", async (event) => {
      event.stopPropagation();
      try {
        if (agent.status.running) {
          await api.stopAgent(agent.id);
        } else {
          await api.startAgent(agent.id);
        }
        await refreshAgents(false);
      } catch (error) {
        showError(error);
      }
    });

    const backupBtn = document.createElement("button");
    backupBtn.className = "btn btn-xs";
    backupBtn.textContent = "Backup";
    backupBtn.addEventListener("click", async (event) => {
      event.stopPropagation();
      try {
        await api.createBackup(agent.id);
        showInfo("Backup created.");
        if (agent.id === state.selectedAgentId) {
          await refreshBackups();
        }
      } catch (error) {
        showError(error);
      }
    });

    actions.appendChild(toggleBtn);
    actions.appendChild(backupBtn);
    card.appendChild(actions);
    els.agentList.appendChild(card);
  }
}

function renderSelectedTitle() {
  const selected = getSelectedAgent();
  els.selectedAgentTitle.textContent = selected ? `${selected.meta.name || selected.id} (${selected.id})` : "No Agent Selected";
}

function renderDashboard() {
  const pane = els.panes.dashboard;
  const selected = getSelectedAgent();
  if (!selected) {
    pane.innerHTML = '<div class="empty-state">Select an agent to view status and controls.</div>';
    return;
  }

  const port = selected.config && selected.config.gateway ? selected.config.gateway.port : "-";
  pane.innerHTML = `
    <div class="dashboard-grid">
      <div class="stat-card">
        <div class="stat-title">Status</div>
        <div class="stat-value">${selected.status.running ? "Running" : "Stopped"}</div>
      </div>
      <div class="stat-card">
        <div class="stat-title">PID</div>
        <div class="stat-value">${selected.status.pid || "-"}</div>
      </div>
      <div class="stat-card">
        <div class="stat-title">Gateway Port</div>
        <div class="stat-value">${port}</div>
      </div>
      <div class="stat-card">
        <div class="stat-title">Created At</div>
        <div class="stat-value">${fmtDate(selected.meta.createdAt)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-title">Updated At</div>
        <div class="stat-value">${fmtDate(selected.meta.updatedAt)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-title">Last Start</div>
        <div class="stat-value">${fmtDate(selected.meta.lastStartedAt)}</div>
      </div>
    </div>
    <div class="dashboard-actions">
      <button class="btn btn-primary" id="dashToggleBtn">${selected.status.running ? "Stop Agent" : "Start Agent"}</button>
      <button class="btn btn-soft" id="dashBackupBtn">Create Backup</button>
      <button class="btn btn-soft" id="dashExportBtn">Export Backup</button>
      <button class="btn btn-soft" id="dashLogsBtn">View Logs</button>
      <button class="btn btn-soft" id="dashConfigBtn">Open Config</button>
    </div>
  `;

  document.getElementById("dashToggleBtn").addEventListener("click", async () => {
    try {
      if (selected.status.running) {
        await api.stopAgent(selected.id);
      } else {
        await api.startAgent(selected.id);
      }
      await refreshAgents(false);
    } catch (error) {
      showError(error);
    }
  });

  document.getElementById("dashBackupBtn").addEventListener("click", async () => {
    try {
      await api.createBackup(selected.id);
      showInfo("Backup created.");
      await refreshBackups();
    } catch (error) {
      showError(error);
    }
  });

  document.getElementById("dashExportBtn").addEventListener("click", async () => {
    try {
      await api.exportBackup(selected.id);
      await refreshBackups();
    } catch (error) {
      showError(error);
    }
  });

  document.getElementById("dashLogsBtn").addEventListener("click", () => {
    setTab("logs");
  });

  document.getElementById("dashConfigBtn").addEventListener("click", () => {
    setTab("config");
    setConfigView("quick");
  });
}

async function refreshAgents(keepSelection = true) {
  const previous = state.selectedAgentId;
  const list = await api.listAgents();

  for (const item of list) {
    try {
      item.config = await api.loadConfig(item.id);
    } catch {
      item.config = null;
    }
  }

  state.agents = list;
  const ids = new Set(list.map((a) => a.id));
  if (!keepSelection || !ids.has(previous)) {
    state.selectedAgentId = list[0] ? list[0].id : "";
  } else {
    state.selectedAgentId = previous;
  }

  renderAgentList();
  renderSelectedTitle();
  renderDashboard();
}

async function selectAgent(id) {
  state.selectedAgentId = id;
  renderAgentList();
  renderSelectedTitle();
  renderDashboard();
  await Promise.all([loadConfig(), refreshLogs(), refreshBackups()]);
}

function ensureConfigRoots(cfg) {
  if (!cfg || typeof cfg !== "object" || Array.isArray(cfg)) {
    return {};
  }
  if (!cfg.agents || typeof cfg.agents !== "object") {
    cfg.agents = {};
  }
  if (!cfg.agents.defaults || typeof cfg.agents.defaults !== "object") {
    cfg.agents.defaults = {};
  }
  if (!Array.isArray(cfg.model_list)) {
    cfg.model_list = [];
  }
  if (!cfg.channels || typeof cfg.channels !== "object") {
    cfg.channels = {};
  }
  if (!cfg.channels.telegram || typeof cfg.channels.telegram !== "object") {
    cfg.channels.telegram = {
      enabled: false,
      token: "",
      allow_from: []
    };
  }
  return cfg;
}

function findModelEntry(cfg, alias) {
  if (!cfg || !Array.isArray(cfg.model_list)) {
    return null;
  }
  const key = String(alias || "").trim();
  if (!key) {
    return cfg.model_list.find((item) => item && typeof item === "object") || null;
  }
  return cfg.model_list.find((item) => item && typeof item === "object" && item.model_name === key) || null;
}

function getQuickDataFromConfig(cfg, selected) {
  const safe = ensureConfigRoots(safeClone(cfg || {}));
  const defaults = safe.agents.defaults || {};
  const defaultAlias = String(defaults.model || "").trim() || "gpt4";
  const entry = findModelEntry(safe, defaultAlias) || {};
  const telegram = safe.channels.telegram || {};

  return {
    agentName: selected ? String(selected.meta.name || selected.id || "") : "",
    modelAlias: defaultAlias,
    modelName: String(entry.model || ""),
    apiBase: String(entry.api_base || ""),
    apiKey: String(entry.api_key || ""),
    telegramEnabled: Boolean(telegram.enabled),
    telegramToken: String(telegram.token || ""),
    telegramAllowFrom: stringifyIdList(telegram.allow_from)
  };
}

function renderQuickConfig() {
  const selected = getSelectedAgent();
  if (!selected || !state.configDraft) {
    els.quickAgentName.value = "";
    els.quickModelAlias.value = "";
    els.quickModelName.value = "";
    els.quickApiBase.value = "";
    els.quickApiKey.value = "";
    els.quickTelegramEnabled.checked = false;
    els.quickTelegramToken.value = "";
    els.quickTelegramAllowFrom.value = "";
    return;
  }

  const quick = getQuickDataFromConfig(state.configDraft, selected);
  els.quickAgentName.value = quick.agentName;
  els.quickModelAlias.value = quick.modelAlias;
  els.quickModelName.value = quick.modelName;
  els.quickApiBase.value = quick.apiBase;
  els.quickApiKey.value = quick.apiKey;
  els.quickTelegramEnabled.checked = quick.telegramEnabled;
  els.quickTelegramToken.value = quick.telegramToken;
  els.quickTelegramAllowFrom.value = quick.telegramAllowFrom;
}

function getQuickDataFromInputs() {
  return {
    agentName: String(els.quickAgentName.value || "").trim(),
    modelAlias: String(els.quickModelAlias.value || "").trim(),
    modelName: String(els.quickModelName.value || "").trim(),
    apiBase: String(els.quickApiBase.value || "").trim(),
    apiKey: String(els.quickApiKey.value || "").trim(),
    telegramEnabled: Boolean(els.quickTelegramEnabled.checked),
    telegramToken: String(els.quickTelegramToken.value || "").trim(),
    telegramAllowFrom: String(els.quickTelegramAllowFrom.value || "")
  };
}

function applyQuickDataToConfig(cfg, quick) {
  const safe = ensureConfigRoots(cfg);
  const alias = quick.modelAlias || String(safe.agents.defaults.model || "").trim() || "gpt4";
  safe.agents.defaults.model = alias;

  if (!Array.isArray(safe.model_list)) {
    safe.model_list = [];
  }

  let entryIndex = safe.model_list.findIndex(
    (item) => item && typeof item === "object" && item.model_name === alias
  );
  if (entryIndex < 0) {
    safe.model_list.push({ model_name: alias });
    entryIndex = safe.model_list.length - 1;
  }

  const entry = safe.model_list[entryIndex] && typeof safe.model_list[entryIndex] === "object" ? safe.model_list[entryIndex] : {};
  entry.model_name = alias;
  entry.model = quick.modelName;
  entry.api_base = quick.apiBase;
  entry.api_key = quick.apiKey;
  safe.model_list[entryIndex] = entry;

  const telegram = safe.channels.telegram || {};
  telegram.enabled = Boolean(quick.telegramEnabled);
  telegram.token = quick.telegramToken;
  telegram.allow_from = parseIdList(quick.telegramAllowFrom);
  safe.channels.telegram = telegram;

  return safe;
}

async function saveQuickConfig() {
  const selected = ensureSelectedAgent();
  if (!selected || !state.configDraft) {
    return;
  }

  try {
    const quick = getQuickDataFromInputs();
    const nextCfg = applyQuickDataToConfig(safeClone(state.configDraft), quick);

    if (quick.agentName && quick.agentName !== (selected.meta.name || selected.id)) {
      await api.renameAgent(selected.id, quick.agentName);
    }

    await api.saveConfig(selected.id, nextCfg);
    state.configDraft = safeClone(nextCfg);
    state.configOriginal = safeClone(nextCfg);

    await refreshAgents(true);
    await selectAgent(selected.id);
    showInfo("Quick config saved.");
  } catch (error) {
    showError(error);
  }
}

async function loadConfig() {
  const selected = getSelectedAgent();
  if (!selected) {
    state.configDraft = null;
    state.configOriginal = null;
    renderQuickConfig();
    els.configEditor.innerHTML = '<div class="empty-state">No config available.</div>';
    return;
  }

  try {
    const cfg = await api.loadConfig(selected.id);
    state.configOriginal = safeClone(cfg);
    state.configDraft = safeClone(cfg);
    renderQuickConfig();
    renderConfigEditor();
  } catch (error) {
    showError(error);
    renderQuickConfig();
    els.configEditor.innerHTML = '<div class="empty-state">Failed to load config.json.</div>';
  }
}

async function saveConfig() {
  const selected = ensureSelectedAgent();
  if (!selected || !state.configDraft) {
    return;
  }
  try {
    await api.saveConfig(selected.id, state.configDraft);
    state.configOriginal = safeClone(state.configDraft);
    showInfo("Full config saved.");
    await refreshAgents(true);
  } catch (error) {
    showError(error);
  }
}
function typeOfValue(value) {
  if (value === null) {
    return "null";
  }
  if (Array.isArray(value)) {
    return "array";
  }
  return typeof value;
}

function getParentAndKey(root, path) {
  if (path.length === 0) {
    return { parent: null, key: null };
  }
  let cursor = root;
  for (let i = 0; i < path.length - 1; i += 1) {
    cursor = cursor[path[i]];
  }
  return { parent: cursor, key: path[path.length - 1] };
}

function setAtPath(path, nextValue, rerender = true) {
  if (path.length === 0) {
    state.configDraft = nextValue;
  } else {
    const { parent, key } = getParentAndKey(state.configDraft, path);
    if (parent !== undefined && parent !== null) {
      parent[key] = nextValue;
    }
  }
  if (rerender) {
    renderConfigEditor();
  }
}

function removeAtPath(path) {
  if (path.length === 0) {
    return;
  }
  const { parent, key } = getParentAndKey(state.configDraft, path);
  if (Array.isArray(parent)) {
    parent.splice(Number(key), 1);
  } else {
    delete parent[key];
  }
  renderConfigEditor();
}

function addObjectField(path) {
  const key = window.prompt("New field name");
  if (!key) {
    return;
  }
  let target = state.configDraft;
  for (const seg of path) {
    target = target[seg];
  }
  if (Object.prototype.hasOwnProperty.call(target, key)) {
    showInfo("Field already exists.");
    return;
  }
  target[key] = "";
  renderConfigEditor();
}

function addArrayItem(path, kind) {
  let target = state.configDraft;
  for (const seg of path) {
    target = target[seg];
  }
  let value = "";
  if (kind === "number") {
    value = 0;
  } else if (kind === "boolean") {
    value = false;
  } else if (kind === "object") {
    value = {};
  } else if (kind === "array") {
    value = [];
  } else if (kind === "null") {
    value = null;
  }
  target.push(value);
  renderConfigEditor();
}

function createPrimitiveEditor(value, path) {
  const wrap = document.createElement("div");
  wrap.className = "json-primitive";

  const typeSelect = document.createElement("select");
  const currentType = typeOfValue(value);
  for (const type of ["string", "number", "boolean", "null"]) {
    const opt = document.createElement("option");
    opt.value = type;
    opt.textContent = type;
    opt.selected = type === currentType;
    typeSelect.appendChild(opt);
  }

  const inputWrap = document.createElement("div");
  const inputType = currentType;

  const reassignByType = (targetType, rawValue) => {
    if (targetType === "string") {
      return String(rawValue ?? "");
    }
    if (targetType === "number") {
      const parsed = Number(rawValue);
      return Number.isFinite(parsed) ? parsed : 0;
    }
    if (targetType === "boolean") {
      return Boolean(rawValue);
    }
    return null;
  };

  typeSelect.addEventListener("change", () => {
    const currentValue = getAtPath(path);
    const converted = reassignByType(typeSelect.value, currentValue);
    setAtPath(path, converted, true);
  });

  if (inputType === "boolean") {
    const boolWrap = document.createElement("div");
    boolWrap.className = "json-boolean-wrap";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = Boolean(value);
    checkbox.addEventListener("change", () => {
      setAtPath(path, checkbox.checked, false);
    });
    boolWrap.appendChild(checkbox);
    inputWrap.appendChild(boolWrap);
  } else if (inputType === "number") {
    const input = document.createElement("input");
    input.type = "number";
    input.step = "any";
    input.value = Number.isFinite(value) ? String(value) : "0";
    input.addEventListener("input", () => {
      const parsed = Number(input.value);
      if (Number.isFinite(parsed)) {
        setAtPath(path, parsed, false);
      }
    });
    input.addEventListener("change", () => {
      const parsed = Number(input.value);
      setAtPath(path, Number.isFinite(parsed) ? parsed : 0, false);
    });
    inputWrap.appendChild(input);
  } else if (inputType === "null") {
    const p = document.createElement("div");
    p.className = "json-null";
    p.textContent = "null";
    inputWrap.appendChild(p);
  } else {
    const text = String(value ?? "");
    if (text.length > 120 || text.includes("\n")) {
      const textarea = document.createElement("textarea");
      textarea.rows = Math.min(8, Math.max(3, text.split("\n").length + 1));
      textarea.value = text;
      textarea.addEventListener("input", () => {
        setAtPath(path, textarea.value, false);
      });
      inputWrap.appendChild(textarea);
    } else {
      const input = document.createElement("input");
      input.type = "text";
      input.value = text;
      input.addEventListener("input", () => {
        setAtPath(path, input.value, false);
      });
      inputWrap.appendChild(input);
    }
  }

  wrap.appendChild(typeSelect);
  wrap.appendChild(inputWrap);
  return wrap;
}

function createNodeEditor(value, path, title) {
  const valueType = typeOfValue(value);
  if (valueType !== "object" && valueType !== "array") {
    return createPrimitiveEditor(value, path);
  }

  const box = document.createElement("div");
  box.className = "json-node";
  const header = document.createElement("div");
  header.className = "json-header";

  const titleEl = document.createElement("div");
  titleEl.className = "json-title";
  titleEl.textContent = `${title} (${valueType})`;
  header.appendChild(titleEl);

  const headerActions = document.createElement("div");
  headerActions.className = "json-actions-inline";

  if (valueType === "object") {
    const addBtn = document.createElement("button");
    addBtn.className = "btn btn-xs";
    addBtn.textContent = "Add Field";
    addBtn.addEventListener("click", () => addObjectField(path));
    headerActions.appendChild(addBtn);
  } else {
    for (const kind of ["string", "number", "boolean", "object", "array", "null"]) {
      const addBtn = document.createElement("button");
      addBtn.className = "btn btn-xs";
      addBtn.textContent = `+${kind}`;
      addBtn.addEventListener("click", () => addArrayItem(path, kind));
      headerActions.appendChild(addBtn);
    }
  }

  header.appendChild(headerActions);
  box.appendChild(header);

  const children = document.createElement("div");
  children.className = "json-children";

  const entries = valueType === "array" ? value.map((item, idx) => [idx, item]) : Object.entries(value);
  for (const [key, child] of entries) {
    const row = document.createElement("div");
    row.className = "json-row";
    const keyEl = document.createElement("div");
    keyEl.className = "json-key";
    keyEl.textContent = String(key);

    const childWrap = document.createElement("div");
    childWrap.className = "json-editor-cell";
    const childPath = [...path, key];
    const childType = typeOfValue(child);
    if (childType === "object" || childType === "array") {
      childWrap.appendChild(createNodeEditor(child, childPath, String(key)));
    } else {
      childWrap.appendChild(createPrimitiveEditor(child, childPath));
    }

    const removeBtn = document.createElement("button");
    removeBtn.className = "btn btn-xs json-remove-btn";
    removeBtn.textContent = "Delete";
    removeBtn.addEventListener("click", () => removeAtPath(childPath));

    row.appendChild(keyEl);
    row.appendChild(childWrap);
    row.appendChild(removeBtn);
    children.appendChild(row);
  }

  if (entries.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = valueType === "array" ? "Empty array, use + buttons to add items." : "Empty object, click Add Field.";
    children.appendChild(empty);
  }

  box.appendChild(children);
  return box;
}

function renderConfigEditor() {
  if (!state.configDraft) {
    els.configEditor.innerHTML = '<div class="empty-state">Select an agent to edit config.json.</div>';
    return;
  }
  els.configEditor.innerHTML = "";
  els.configEditor.appendChild(createNodeEditor(state.configDraft, [], "config"));
}

async function refreshLogs() {
  if (logsRefreshInFlight) {
    return;
  }
  const selected = getSelectedAgent();
  if (!selected) {
    els.logViewer.textContent = "";
    return;
  }
  logsRefreshInFlight = true;
  try {
    const shouldStickToBottom =
      Math.abs(els.logViewer.scrollHeight - els.logViewer.scrollTop - els.logViewer.clientHeight) < 40;
    state.logs = await api.getLogs(selected.id, 3500);
    els.logViewer.textContent = state.logs || "";
    if (shouldStickToBottom) {
      els.logViewer.scrollTop = els.logViewer.scrollHeight;
    }
  } catch (error) {
    showError(error);
  } finally {
    logsRefreshInFlight = false;
  }
}

async function refreshBackups() {
  const selected = getSelectedAgent();
  if (!selected) {
    els.backupList.innerHTML = '<div class="empty-state">Select an agent to view backups.</div>';
    return;
  }
  try {
    state.backups = await api.listBackups(selected.id);
    renderBackups();
  } catch (error) {
    showError(error);
  }
}

function renderBackups() {
  els.backupList.innerHTML = "";
  if (!state.backups.length) {
    els.backupList.innerHTML = '<div class="empty-state">No backups yet.</div>';
    return;
  }

  for (const item of state.backups) {
    const row = document.createElement("div");
    row.className = "backup-item";
    const main = document.createElement("div");
    main.className = "backup-main";
    main.innerHTML = `
      <div class="backup-name">${item.fileName}</div>
      <div class="backup-meta">Time: ${fmtDate(item.createdAt)}</div>
      <div class="backup-meta">Size: ${bytesToText(item.size)}</div>
    `;

    const actions = document.createElement("div");
    actions.className = "json-actions-inline";
    const restoreBtn = document.createElement("button");
    restoreBtn.className = "btn btn-xs";
    restoreBtn.textContent = "Restore As New Agent";
    restoreBtn.addEventListener("click", async () => {
      const name = window.prompt("Optional: new agent name", "");
      try {
        const imported = await api.restoreBackup(item.fileName, name || "");
        if (imported && imported.id) {
          state.selectedAgentId = imported.id;
          await refreshAgents(true);
          await selectAgent(imported.id);
          showInfo("Backup restored.");
        }
      } catch (error) {
        showError(error);
      }
    });
    actions.appendChild(restoreBtn);
    row.appendChild(main);
    row.appendChild(actions);
    els.backupList.appendChild(row);
  }
}
function setWizardStep(step) {
  wizardState.step = step === 2 ? 2 : 1;
  els.wizardStep1.classList.toggle("active", wizardState.step === 1);
  els.wizardStep2.classList.toggle("active", wizardState.step === 2);
  els.wizardStepLabel.textContent = `Step ${wizardState.step} / 2`;
  els.wizardPrevBtn.style.display = wizardState.step === 1 ? "none" : "inline-block";
  els.wizardNextBtn.style.display = wizardState.step === 1 ? "inline-block" : "none";
  els.wizardSubmitBtn.style.display = wizardState.step === 2 ? "inline-block" : "none";
}

function lockWizardButtons(locked) {
  const disabled = Boolean(locked);
  els.wizardCancelBtn.disabled = disabled;
  els.wizardPrevBtn.disabled = disabled;
  els.wizardNextBtn.disabled = disabled;
  els.wizardSubmitBtn.disabled = disabled;
}

function openCreateWizard() {
  wizardState.open = true;
  wizardState.submitting = false;
  lockWizardButtons(false);

  els.wizardAgentName.value = "";
  els.wizardModelAlias.value = "gpt4";
  els.wizardModelName.value = "";
  els.wizardApiBase.value = "https://api.openai.com/v1";
  els.wizardApiKey.value = "";
  els.wizardTelegramEnabled.checked = true;
  els.wizardTelegramToken.value = "";
  els.wizardTelegramAllowFrom.value = "";

  setWizardStep(1);
  els.createWizardModal.classList.remove("hidden");
  window.setTimeout(() => {
    els.wizardAgentName.focus();
  }, 0);
}

function closeCreateWizard() {
  wizardState.open = false;
  wizardState.submitting = false;
  els.createWizardModal.classList.add("hidden");
}

function collectWizardData() {
  return {
    agentName: String(els.wizardAgentName.value || "").trim(),
    modelAlias: String(els.wizardModelAlias.value || "").trim(),
    modelName: String(els.wizardModelName.value || "").trim(),
    apiBase: String(els.wizardApiBase.value || "").trim(),
    apiKey: String(els.wizardApiKey.value || "").trim(),
    telegramEnabled: Boolean(els.wizardTelegramEnabled.checked),
    telegramToken: String(els.wizardTelegramToken.value || "").trim(),
    telegramAllowFrom: String(els.wizardTelegramAllowFrom.value || "")
  };
}

function validateWizardStep(step) {
  const data = collectWizardData();

  if (step === 1) {
    if (!data.agentName) {
      showInfo("Agent name is required.");
      els.wizardAgentName.focus();
      return false;
    }
    if (!data.modelAlias) {
      showInfo("Model alias is required.");
      els.wizardModelAlias.focus();
      return false;
    }
    if (!data.modelName) {
      showInfo("Model name is required.");
      els.wizardModelName.focus();
      return false;
    }
    if (!data.apiBase) {
      showInfo("API base is required.");
      els.wizardApiBase.focus();
      return false;
    }
    if (!data.apiKey) {
      showInfo("API key is required.");
      els.wizardApiKey.focus();
      return false;
    }
  }

  if (step === 2 && data.telegramEnabled) {
    if (!data.telegramToken) {
      showInfo("Telegram bot token is required when Telegram is enabled.");
      els.wizardTelegramToken.focus();
      return false;
    }
    if (parseIdList(data.telegramAllowFrom).length === 0) {
      showInfo("At least one allowed Telegram user ID is required.");
      els.wizardTelegramAllowFrom.focus();
      return false;
    }
  }

  return true;
}

async function createAgentFromWizard() {
  if (wizardState.submitting) {
    return;
  }
  if (!validateWizardStep(2)) {
    return;
  }

  wizardState.submitting = true;
  lockWizardButtons(true);

  try {
    const data = collectWizardData();
    const created = await api.createAgent(data.agentName);
    const loaded = await api.loadConfig(created.id);
    const nextCfg = applyQuickDataToConfig(ensureConfigRoots(safeClone(loaded)), data);
    await api.saveConfig(created.id, nextCfg);
    await api.startAgent(created.id);

    closeCreateWizard();

    state.selectedAgentId = created.id;
    await refreshAgents(true);
    await selectAgent(created.id);
    setTab("dashboard");

    showInfo("Agent created and started.");
  } catch (error) {
    showError(error);
  } finally {
    wizardState.submitting = false;
    lockWizardButtons(false);
  }
}

function bindEvents() {
  els.minimizeWindowBtn.addEventListener("click", async () => {
    try {
      await api.minimizeWindow();
    } catch (error) {
      showError(error);
    }
  });

  els.closeWindowBtn.addEventListener("click", async () => {
    try {
      await api.closeWindow();
    } catch (error) {
      showError(error);
    }
  });

  els.tabs.forEach((tab) => {
    tab.addEventListener("click", () => setTab(tab.dataset.tab));
  });

  els.quickConfigTabBtn.addEventListener("click", () => setConfigView("quick"));
  els.fullConfigTabBtn.addEventListener("click", () => setConfigView("full"));

  els.createAgentBtn.addEventListener("click", () => openCreateWizard());

  els.importBackupBtn.addEventListener("click", async () => {
    const preferred = window.prompt("Optional: agent name after import", "");
    try {
      const imported = await api.importBackup(preferred || "");
      if (imported && imported.id) {
        state.selectedAgentId = imported.id;
        await refreshAgents(true);
        await selectAgent(imported.id);
      }
    } catch (error) {
      showError(error);
    }
  });

  els.refreshAgentsBtn.addEventListener("click", async () => {
    try {
      await refreshAgents(true);
    } catch (error) {
      showError(error);
    }
  });

  els.renameAgentBtn.addEventListener("click", async () => {
    const selected = ensureSelectedAgent();
    if (!selected) {
      return;
    }
    const name = window.prompt("New agent name", selected.meta.name || selected.id);
    if (name === null) {
      return;
    }
    try {
      await api.renameAgent(selected.id, name);
      await refreshAgents(true);
      renderSelectedTitle();
      renderQuickConfig();
    } catch (error) {
      showError(error);
    }
  });

  els.openAgentFolderBtn.addEventListener("click", async () => {
    const selected = ensureSelectedAgent();
    if (!selected) {
      return;
    }
    try {
      await api.openAgentFolder(selected.id);
    } catch (error) {
      showError(error);
    }
  });

  els.deleteAgentBtn.addEventListener("click", async () => {
    const selected = ensureSelectedAgent();
    if (!selected) {
      return;
    }
    const yes = window.confirm(`Delete agent "${selected.meta.name || selected.id}"? This removes config/workspace/logs.`);
    if (!yes) {
      return;
    }
    try {
      await api.deleteAgent(selected.id);
      state.selectedAgentId = "";
      await refreshAgents(false);
      await loadConfig();
      await refreshLogs();
      await refreshBackups();
    } catch (error) {
      showError(error);
    }
  });

  els.importConfigBtn.addEventListener("click", async () => {
    const selected = ensureSelectedAgent();
    if (!selected) {
      return;
    }
    try {
      const out = await api.importConfig(selected.id);
      if (out) {
        showInfo("Config imported.");
        await refreshAgents(true);
        await loadConfig();
      }
    } catch (error) {
      showError(error);
    }
  });

  els.exportConfigBtn.addEventListener("click", async () => {
    const selected = ensureSelectedAgent();
    if (!selected) {
      return;
    }
    try {
      const out = await api.exportConfig(selected.id);
      if (out) {
        showInfo(`Config exported: ${out.filePath}`);
      }
    } catch (error) {
      showError(error);
    }
  });

  els.reloadConfigBtn.addEventListener("click", () => loadConfig());
  els.saveQuickConfigBtn.addEventListener("click", () => saveQuickConfig());
  els.saveConfigBtn.addEventListener("click", () => saveConfig());
  els.refreshLogsBtn.addEventListener("click", () => refreshLogs());

  els.clearLogsBtn.addEventListener("click", async () => {
    const selected = ensureSelectedAgent();
    if (!selected) {
      return;
    }
    if (!window.confirm("Clear logs for current agent?")) {
      return;
    }
    try {
      await api.clearLogs(selected.id);
      await refreshLogs();
    } catch (error) {
      showError(error);
    }
  });

  els.createBackupBtn.addEventListener("click", async () => {
    const selected = ensureSelectedAgent();
    if (!selected) {
      return;
    }
    try {
      await api.createBackup(selected.id);
      showInfo("Backup created.");
      await refreshBackups();
    } catch (error) {
      showError(error);
    }
  });

  els.exportBackupBtn.addEventListener("click", async () => {
    const selected = ensureSelectedAgent();
    if (!selected) {
      return;
    }
    try {
      const out = await api.exportBackup(selected.id);
      if (out) {
        showInfo(`Backup exported: ${out.filePath}`);
      }
      await refreshBackups();
    } catch (error) {
      showError(error);
    }
  });

  els.saveSettingsBtn.addEventListener("click", () => {
    saveSettingsAction();
  });

  els.wizardCancelBtn.addEventListener("click", () => {
    if (!wizardState.submitting) {
      closeCreateWizard();
    }
  });

  els.wizardPrevBtn.addEventListener("click", () => {
    if (!wizardState.submitting) {
      setWizardStep(1);
    }
  });

  els.wizardNextBtn.addEventListener("click", () => {
    if (wizardState.submitting) {
      return;
    }
    if (!validateWizardStep(1)) {
      return;
    }
    setWizardStep(2);
  });

  els.wizardSubmitBtn.addEventListener("click", () => {
    createAgentFromWizard();
  });

  els.createWizardModal.addEventListener("click", (event) => {
    if (event.target === els.createWizardModal && !wizardState.submitting) {
      closeCreateWizard();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && wizardState.open && !wizardState.submitting) {
      closeCreateWizard();
    }
  });
}

async function boot() {
  bindEvents();
  state.appInfo = await api.init();
  if (state.appInfo && state.appInfo.settings) {
    state.settings = {
      closeBehavior: state.appInfo.settings.closeBehavior || "ask"
    };
  }
  renderRuntimeInfo();
  await loadSettings();
  setConfigView("quick");

  await refreshAgents(false);
  if (state.selectedAgentId) {
    await selectAgent(state.selectedAgentId);
  } else {
    await loadConfig();
    await refreshLogs();
    await refreshBackups();
  }

  if (logsAutoRefreshTimer) {
    clearInterval(logsAutoRefreshTimer);
  }
  logsAutoRefreshTimer = window.setInterval(() => {
    if (state.selectedTab !== "logs" || !state.selectedAgentId) {
      return;
    }
    refreshLogs().catch(() => {});
  }, 500);

  window.addEventListener("beforeunload", () => {
    if (logsAutoRefreshTimer) {
      clearInterval(logsAutoRefreshTimer);
    }
  });
}

boot().catch((error) => {
  showError(error);
});
