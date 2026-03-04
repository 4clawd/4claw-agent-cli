const api = window.clawApi;

const state = {
  appInfo: null,
  agents: [],
  selectedAgentId: "",
  selectedTab: "dashboard",
  configDraft: null,
  configOriginal: null,
  logs: "",
  backups: [],
  isEditingInput: false
};

const els = {
  runtimeInfo: document.getElementById("runtimeInfo"),
  newAgentName: document.getElementById("newAgentName"),
  createAgentBtn: document.getElementById("createAgentBtn"),
  importBackupBtn: document.getElementById("importBackupBtn"),
  refreshAgentsBtn: document.getElementById("refreshAgentsBtn"),
  agentList: document.getElementById("agentList"),
  selectedAgentTitle: document.getElementById("selectedAgentTitle"),
  renameAgentBtn: document.getElementById("renameAgentBtn"),
  openAgentFolderBtn: document.getElementById("openAgentFolderBtn"),
  deleteAgentBtn: document.getElementById("deleteAgentBtn"),
  tabs: Array.from(document.querySelectorAll(".tab-btn")),
  panes: {
    dashboard: document.getElementById("tab-dashboard"),
    config: document.getElementById("tab-config"),
    logs: document.getElementById("tab-logs"),
    backups: document.getElementById("tab-backups")
  },
  reloadConfigBtn: document.getElementById("reloadConfigBtn"),
  saveConfigBtn: document.getElementById("saveConfigBtn"),
  configEditor: document.getElementById("configEditor"),
  refreshLogsBtn: document.getElementById("refreshLogsBtn"),
  clearLogsBtn: document.getElementById("clearLogsBtn"),
  logViewer: document.getElementById("logViewer"),
  createBackupBtn: document.getElementById("createBackupBtn"),
  exportBackupBtn: document.getElementById("exportBackupBtn"),
  backupList: document.getElementById("backupList")
  ,
  toastHost: document.getElementById("toastHost")
};

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
    showInfo("请先选择一个 Agent。");
    return null;
  }
  return selected;
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
    lines.push(`未找到 ${info.binary.binaryName}`);
    lines.push(`请放置到: ${info.binaryDropPath}`);
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

function renderAgentList() {
  els.agentList.innerHTML = "";
  if (state.agents.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "暂无 Agent，点击“创建 Agent”开始。";
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
    badge.textContent = agent.status.running ? "运行中" : "已停止";
    top.appendChild(name);
    top.appendChild(badge);
    card.appendChild(top);

    const meta = document.createElement("div");
    meta.className = "agent-meta";
    meta.innerHTML = `
      <div>ID: ${agent.id}</div>
      <div>端口: ${(agent.config && agent.config.gateway && agent.config.gateway.port) || "-"}</div>
      <div>最后启动: ${fmtDate(agent.meta.lastStartedAt)}</div>
    `;
    card.appendChild(meta);

    const actions = document.createElement("div");
    actions.className = "agent-actions";

    const toggleBtn = document.createElement("button");
    toggleBtn.className = "btn btn-xs";
    toggleBtn.textContent = agent.status.running ? "关闭" : "启动";
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
    backupBtn.textContent = "备份";
    backupBtn.addEventListener("click", async (event) => {
      event.stopPropagation();
      try {
        await api.createBackup(agent.id);
        showInfo("备份已创建");
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
  els.selectedAgentTitle.textContent = selected ? `${selected.meta.name || selected.id} (${selected.id})` : "未选择 Agent";
}

function renderDashboard() {
  const pane = els.panes.dashboard;
  const selected = getSelectedAgent();
  if (!selected) {
    pane.innerHTML = `<div class="empty-state">选择左侧 Agent 后可查看状态和控制按钮。</div>`;
    return;
  }

  const port = selected.config && selected.config.gateway ? selected.config.gateway.port : "-";
  pane.innerHTML = `
    <div class="dashboard-grid">
      <div class="stat-card">
        <div class="stat-title">运行状态</div>
        <div class="stat-value">${selected.status.running ? "运行中" : "已停止"}</div>
      </div>
      <div class="stat-card">
        <div class="stat-title">进程 PID</div>
        <div class="stat-value">${selected.status.pid || "-"}</div>
      </div>
      <div class="stat-card">
        <div class="stat-title">Gateway Port</div>
        <div class="stat-value">${port}</div>
      </div>
      <div class="stat-card">
        <div class="stat-title">创建时间</div>
        <div class="stat-value">${fmtDate(selected.meta.createdAt)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-title">最后修改</div>
        <div class="stat-value">${fmtDate(selected.meta.updatedAt)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-title">最后启动</div>
        <div class="stat-value">${fmtDate(selected.meta.lastStartedAt)}</div>
      </div>
    </div>
    <div class="dashboard-actions">
      <button class="btn btn-primary" id="dashToggleBtn">${selected.status.running ? "关闭 Agent" : "启动 Agent"}</button>
      <button class="btn btn-soft" id="dashBackupBtn">创建备份</button>
      <button class="btn btn-soft" id="dashExportBtn">导出备份</button>
      <button class="btn btn-soft" id="dashLogsBtn">查看日志</button>
      <button class="btn btn-soft" id="dashConfigBtn">编辑 Config</button>
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
      showInfo("备份已创建");
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

async function loadConfig() {
  const selected = ensureSelectedAgent();
  if (!selected) {
    state.configDraft = null;
    state.configOriginal = null;
    els.configEditor.innerHTML = `<div class="empty-state">暂无配置可展示。</div>`;
    return;
  }

  try {
    const cfg = await api.loadConfig(selected.id);
    state.configOriginal = safeClone(cfg);
    state.configDraft = safeClone(cfg);
    renderConfigEditor();
  } catch (error) {
    showError(error);
    els.configEditor.innerHTML = `<div class="empty-state">config.json 读取失败。</div>`;
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
    showInfo("Config 已保存");
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
  const key = window.prompt("请输入字段名");
  if (!key) {
    return;
  }
  let target = state.configDraft;
  for (const seg of path) {
    target = target[seg];
  }
  if (Object.prototype.hasOwnProperty.call(target, key)) {
    showInfo("字段已存在");
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
    addBtn.textContent = "新增字段";
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
    removeBtn.textContent = "删除";
    removeBtn.addEventListener("click", () => removeAtPath(childPath));

    row.appendChild(keyEl);
    row.appendChild(childWrap);
    row.appendChild(removeBtn);
    children.appendChild(row);
  }

  if (entries.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = valueType === "array" ? "数组为空，可点击上方 + 按钮添加项。" : "对象为空，可点击“新增字段”。";
    children.appendChild(empty);
  }

  box.appendChild(children);
  return box;
}

function renderConfigEditor() {
  if (!state.configDraft) {
    els.configEditor.innerHTML = `<div class="empty-state">选择 Agent 后可编辑 config.json。</div>`;
    return;
  }
  els.configEditor.innerHTML = "";
  els.configEditor.appendChild(createNodeEditor(state.configDraft, [], "config"));
}

async function refreshLogs() {
  const selected = getSelectedAgent();
  if (!selected) {
    els.logViewer.textContent = "";
    return;
  }
  try {
    state.logs = await api.getLogs(selected.id, 3500);
    els.logViewer.textContent = state.logs || "";
    els.logViewer.scrollTop = els.logViewer.scrollHeight;
  } catch (error) {
    showError(error);
  }
}

async function refreshBackups() {
  const selected = getSelectedAgent();
  if (!selected) {
    els.backupList.innerHTML = `<div class="empty-state">选择 Agent 后显示备份列表。</div>`;
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
    els.backupList.innerHTML = `<div class="empty-state">暂无备份。点击“创建备份”即可生成。</div>`;
    return;
  }

  for (const item of state.backups) {
    const row = document.createElement("div");
    row.className = "backup-item";
    const main = document.createElement("div");
    main.className = "backup-main";
    main.innerHTML = `
      <div class="backup-name">${item.fileName}</div>
      <div class="backup-meta">时间: ${fmtDate(item.createdAt)}</div>
      <div class="backup-meta">大小: ${bytesToText(item.size)}</div>
    `;

    const actions = document.createElement("div");
    actions.className = "json-actions-inline";
    const restoreBtn = document.createElement("button");
    restoreBtn.className = "btn btn-xs";
    restoreBtn.textContent = "恢复为新 Agent";
    restoreBtn.addEventListener("click", async () => {
      const name = window.prompt("可选：为新 Agent 指定名称（可留空）", "");
      try {
        const imported = await api.restoreBackup(item.fileName, name || "");
        if (imported && imported.id) {
          state.selectedAgentId = imported.id;
          await refreshAgents(true);
          await selectAgent(imported.id);
          showInfo("备份恢复成功");
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

function bindEvents() {
  // Force input focus reliability after dynamic DOM updates.
  document.addEventListener("pointerdown", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement)) {
      return;
    }
    target.disabled = false;
    target.readOnly = false;
    requestAnimationFrame(() => {
      if (document.activeElement !== target) {
        target.focus();
      }
    });
  });

  const markEditing = () => {
    const active = document.activeElement;
    state.isEditingInput = Boolean(
      active &&
        (active.tagName === "INPUT" ||
          active.tagName === "TEXTAREA" ||
          active.tagName === "SELECT" ||
          active.isContentEditable)
    );
  };

  document.addEventListener("focusin", markEditing);
  document.addEventListener("focusout", () => {
    setTimeout(markEditing, 0);
  });

  // Prevent global handlers from stealing key events while typing.
  document.addEventListener(
    "keydown",
    (event) => {
      const active = document.activeElement;
      if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement || active instanceof HTMLSelectElement) {
        event.stopPropagation();
      }
    },
    true
  );

  els.tabs.forEach((tab) => {
    tab.addEventListener("click", () => setTab(tab.dataset.tab));
  });

  const createAgentFromInput = async () => {
    const name = els.newAgentName.value.trim();
    try {
      const created = await api.createAgent(name || "agent");
      els.newAgentName.value = "";
      state.selectedAgentId = created.id;
      await refreshAgents(true);
      await selectAgent(created.id);
    } catch (error) {
      showError(error);
    }
  };

  els.createAgentBtn.addEventListener("click", createAgentFromInput);
  els.newAgentName.addEventListener("keydown", async (event) => {
    // IME composition should not trigger create action.
    if (event.isComposing || event.keyCode === 229) {
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      await createAgentFromInput();
    }
  });

  els.importBackupBtn.addEventListener("click", async () => {
    const preferred = window.prompt("可选：导入后 Agent 名称（可留空）", "");
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
    const name = window.prompt("新的 Agent 名称", selected.meta.name || selected.id);
    if (name === null) {
      return;
    }
    try {
      await api.renameAgent(selected.id, name);
      await refreshAgents(true);
      renderSelectedTitle();
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
    const yes = window.confirm(`确认删除 Agent "${selected.meta.name || selected.id}"？\n此操作会删除其 config/workspace/logs。`);
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

  els.reloadConfigBtn.addEventListener("click", () => loadConfig());
  els.saveConfigBtn.addEventListener("click", () => saveConfig());
  els.refreshLogsBtn.addEventListener("click", () => refreshLogs());

  els.clearLogsBtn.addEventListener("click", async () => {
    const selected = ensureSelectedAgent();
    if (!selected) {
      return;
    }
    if (!window.confirm("确认清空当前 Agent 日志？")) {
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
      showInfo("备份创建成功");
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
        showInfo(`导出完成: ${out.filePath}`);
      }
      await refreshBackups();
    } catch (error) {
      showError(error);
    }
  });
}

async function boot() {
  bindEvents();
  state.appInfo = await api.init();
  renderRuntimeInfo();
  await refreshAgents(false);
  if (state.selectedAgentId) {
    await selectAgent(state.selectedAgentId);
  } else {
    await loadConfig();
    await refreshLogs();
    await refreshBackups();
  }
}

boot().catch((error) => {
  showError(error);
});
