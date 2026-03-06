const api = window.clawApi;

const state = {
  appInfo: null,
  modelCatalog: [],
  defaultConfig: {},
  agents: [],
  selectedAgentId: "",
  selectedTab: "dashboard",
  selectedConfigView: "quick",
  configDraft: null,
  configOriginal: null,
  logs: "",
  backups: [],
  settings: {
    closeBehavior: "ask",
    language: "en"
  },
  quickChannelValues: {},
  wizardChannelValues: {}
};

const els = {
  minimizeWindowBtn: document.getElementById("minimizeWindowBtn"),
  closeWindowBtn: document.getElementById("closeWindowBtn"),
  createAgentBtn: document.getElementById("createAgentBtn"),
  importBackupBtn: document.getElementById("importBackupBtn"),
  refreshAgentsBtn: document.getElementById("refreshAgentsBtn"),
  agentList: document.getElementById("agentList"),
  selectedAgentTitle: document.getElementById("selectedAgentTitle"),
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
  quickModelPlatform: document.getElementById("quickModelPlatform"),
  quickModelPreset: document.getElementById("quickModelPreset"),
  quickModelName: document.getElementById("quickModelName"),
  quickApiBase: document.getElementById("quickApiBase"),
  quickApiKey: document.getElementById("quickApiKey"),
  quickChannelPlatform: document.getElementById("quickChannelPlatform"),
  quickChannelFields: document.getElementById("quickChannelFields"),
  saveQuickConfigBtn: document.getElementById("saveQuickConfigBtn"),
  saveConfigBtn: document.getElementById("saveConfigBtn"),
  configEditor: document.getElementById("configEditor"),
  refreshLogsBtn: document.getElementById("refreshLogsBtn"),
  clearLogsBtn: document.getElementById("clearLogsBtn"),
  logScrollBottomBtn: document.getElementById("logScrollBottomBtn"),
  logViewer: document.getElementById("logViewer"),
  createBackupBtn: document.getElementById("createBackupBtn"),
  exportBackupBtn: document.getElementById("exportBackupBtn"),
  backupList: document.getElementById("backupList"),
  languageSelect: document.getElementById("languageSelect"),
  saveSettingsBtn: document.getElementById("saveSettingsBtn"),
  toastHost: document.getElementById("toastHost"),
  createWizardModal: document.getElementById("createWizardModal"),
  wizardStepLabel: document.getElementById("wizardStepLabel"),
  wizardStep1: document.getElementById("wizardStep1"),
  wizardStep2: document.getElementById("wizardStep2"),
  wizardAgentName: document.getElementById("wizardAgentName"),
  wizardModelPlatform: document.getElementById("wizardModelPlatform"),
  wizardModelPreset: document.getElementById("wizardModelPreset"),
  wizardModelName: document.getElementById("wizardModelName"),
  wizardApiBase: document.getElementById("wizardApiBase"),
  wizardApiKey: document.getElementById("wizardApiKey"),
  wizardChannelPlatform: document.getElementById("wizardChannelPlatform"),
  wizardChannelFields: document.getElementById("wizardChannelFields"),
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
const CUSTOMER_PLATFORM = "__customer_platform__";
const CUSTOMER_MODEL = "__customer_model__";
const CHANNEL_ORDER = ["telegram", "discord", "qq", "whatsapp", "feishu", "dingtalk", "slack", "line"];
const CHANNEL_LABELS = {
  telegram: "Telegram",
  discord: "Discord",
  qq: "QQ",
  whatsapp: "WhatsApp",
  feishu: "飞书",
  dingtalk: "钉钉",
  slack: "Slack",
  line: "Line"
};

const I18N = {
  en: {
    brand_subtitle: "Simple desktop shell for 4claw",
    win_minimize: "Minimize",
    win_close: "Close",
    agent_list: "Agent List",
    create_agent_wizard: "Create Agent (Wizard)",
    import_backup: "Import Backup",
    refresh: "Refresh",
    no_agent_selected: "No Agent Selected",
    rename: "Rename",
    open_folder: "Open Folder",
    delete: "Delete",
    tab_dashboard: "Dashboard",
    tab_config: "Config",
    tab_logs: "Logs",
    tab_backups: "Backups",
    tab_settings: "Settings",
    import_config: "Import Config",
    export_config: "Export Config",
    reload: "Reload",
    quick_config: "Quick Config",
    full_config: "Full Config",
    agent_name: "Agent Name",
    model_platform: "Model Platform",
    platform_model: "Platform Model",
    model_customer: "customer",
    model_name: "Model Name",
    api_base: "API Base",
    api_key: "API Key",
    channel_platform: "Channel Platform",
    channel_config: "Channel Config",
    channel_no_fields: "No configurable fields in default-config for this platform.",
    placeholder_model_name: "e.g. openai/gpt-5.2",
    placeholder_api_base: "e.g. https://api.openai.com/v1",
    placeholder_channel_json: "Use JSON format",
    save_quick_config: "Save Quick Config",
    save_full_config: "Save Full Config",
    refresh_logs: "Refresh Logs",
    clear_logs: "Clear Logs",
    logs_scroll_bottom: "Scroll to bottom",
    create_backup: "Create Backup",
    export_backup: "Export Backup",
    settings_close_behavior: "Window Close Behavior",
    close_ask: "Ask every time",
    close_minimize: "Minimize to tray",
    close_exit: "Exit directly",
    settings_language: "Language",
    settings_ui_language: "UI Language",
    save_settings: "Save Settings",
    settings_hint: "When set to Ask, close dialog includes a remember checkbox.",
    language_en: "English",
    language_zh: "Simplified Chinese",
    language_ru: "Russian",
    wizard_title: "Create Agent Wizard",
    wizard_cancel: "Cancel",
    wizard_back: "Back",
    wizard_next: "Next",
    wizard_create_start: "Create & Start",
    wizard_step: "Step {step} / 2",
    empty_no_agents: "No agents yet. Click create to get started.",
    empty_select_agent_controls: "Select an agent to view status and controls.",
    empty_no_config: "No config available.",
    empty_config_load_failed: "Failed to load config.json.",
    empty_select_agent_edit: "Select an agent to edit config.json.",
    empty_select_agent_backups: "Select an agent to view backups.",
    empty_no_backups: "No backups yet.",
    status_running: "Running",
    status_stopped: "Stopped",
    label_id: "ID",
    label_port: "Port",
    label_last_start: "Last Start",
    action_stop: "Stop",
    action_start: "Start",
    action_backup: "Backup",
    stat_status: "Status",
    stat_pid: "PID",
    stat_gateway_port: "Gateway Port",
    stat_created_at: "Created At",
    stat_updated_at: "Updated At",
    dash_stop_agent: "Stop Agent",
    dash_start_agent: "Start Agent",
    dash_create_backup: "Create Backup",
    dash_export_backup: "Export Backup",
    dash_view_logs: "View Logs",
    dash_open_config: "Open Config",
    toast_select_agent: "Please select an agent first.",
    toast_settings_saved: "Settings saved.",
    toast_backup_created: "Backup created.",
    toast_quick_saved: "Quick config saved.",
    toast_full_saved: "Full config saved.",
    toast_config_imported: "Config imported.",
    toast_agent_created_started: "Agent created and started.",
    toast_backup_restored: "Backup restored.",
    toast_config_exported: "Config exported: {path}",
    toast_backup_exported: "Backup exported: {path}",
    backup_time: "Time",
    backup_size: "Size",
    backup_restore_new: "Restore As New Agent",
    prompt_optional_agent_name: "Optional: new agent name",
    prompt_optional_imported_name: "Optional: agent name after import",
    prompt_new_agent_name: "New agent name",
    confirm_delete_agent: "Delete agent \"{name}\"? This removes config/workspace/logs.",
    confirm_clear_logs: "Clear logs for current agent?",
    json_add_field: "Add Field",
    json_delete: "Delete",
    json_empty_array: "Empty array, use + buttons to add items.",
    json_empty_object: "Empty object, click Add Field.",
    prompt_new_field_name: "New field name",
    toast_field_exists: "Field already exists.",
    toast_invalid_channel_json: "Invalid JSON in channel field: {field}",
    wizard_req_agent_name: "Agent name is required.",
    wizard_req_model_name: "Model name is required.",
    wizard_req_api_base: "API base is required.",
    wizard_req_api_key: "API key is required."
  },
  "zh-CN": {
    brand_subtitle: "简易便捷的桌面端 4claw CLI",
    win_minimize: "最小化",
    win_close: "关闭",
    agent_list: "Agent 列表",
    create_agent_wizard: "创建 Agent（向导）",
    import_backup: "导入备份",
    refresh: "刷新",
    no_agent_selected: "未选择 Agent",
    rename: "重命名",
    open_folder: "打开目录",
    delete: "删除",
    tab_dashboard: "总览",
    tab_config: "配置",
    tab_logs: "日志",
    tab_backups: "备份",
    tab_settings: "设置",
    import_config: "导入配置",
    export_config: "导出配置",
    reload: "重载",
    quick_config: "快速配置",
    full_config: "完整配置",
    agent_name: "Agent 名称",
    model_platform: "模型平台",
    platform_model: "平台模型",
    model_customer: "customer（自定义）",
    model_name: "模型名称",
    api_base: "API 地址",
    api_key: "API Key",
    channel_platform: "通讯平台",
    channel_config: "平台配置",
    channel_no_fields: "该平台在 default-config 中没有可配置字段。",
    placeholder_model_name: "例如 openai/gpt-5.2",
    placeholder_api_base: "例如 https://api.openai.com/v1",
    placeholder_channel_json: "请使用 JSON 格式",
    save_quick_config: "保存快速配置",
    save_full_config: "保存完整配置",
    refresh_logs: "刷新日志",
    clear_logs: "清空日志",
    logs_scroll_bottom: "滑到底部",
    create_backup: "创建备份",
    export_backup: "导出备份",
    settings_close_behavior: "关闭窗口行为",
    close_ask: "每次询问",
    close_minimize: "最小化到托盘",
    close_exit: "直接退出",
    settings_language: "语言",
    settings_ui_language: "界面语言",
    save_settings: "保存设置",
    settings_hint: "当设置为“每次询问”时，关闭弹窗会显示“是否记住”选项。",
    language_en: "English",
    language_zh: "简体中文",
    language_ru: "Русский",
    wizard_title: "创建 Agent 向导",
    wizard_cancel: "取消",
    wizard_back: "上一步",
    wizard_next: "下一步",
    wizard_create_start: "创建并启动",
    wizard_step: "第 {step} / 2 步",
    empty_no_agents: "暂无 Agent，点击“创建”开始。",
    empty_select_agent_controls: "请选择一个 Agent 查看状态和控制项。",
    empty_no_config: "暂无配置可显示。",
    empty_config_load_failed: "读取 config.json 失败。",
    empty_select_agent_edit: "请选择一个 Agent 后编辑配置。",
    empty_select_agent_backups: "请选择一个 Agent 查看备份。",
    empty_no_backups: "暂无备份。",
    status_running: "运行中",
    status_stopped: "已停止",
    label_id: "ID",
    label_port: "端口",
    label_last_start: "最后启动",
    action_stop: "停止",
    action_start: "启动",
    action_backup: "备份",
    stat_status: "运行状态",
    stat_pid: "进程 PID",
    stat_gateway_port: "网关端口",
    stat_created_at: "创建时间",
    stat_updated_at: "更新时间",
    dash_stop_agent: "停止 Agent",
    dash_start_agent: "启动 Agent",
    dash_create_backup: "创建备份",
    dash_export_backup: "导出备份",
    dash_view_logs: "查看日志",
    dash_open_config: "打开配置",
    toast_select_agent: "请先选择一个 Agent。",
    toast_settings_saved: "设置已保存。",
    toast_backup_created: "备份已创建。",
    toast_quick_saved: "快速配置已保存。",
    toast_full_saved: "完整配置已保存。",
    toast_config_imported: "配置导入完成。",
    toast_agent_created_started: "Agent 已创建并启动。",
    toast_backup_restored: "备份恢复成功。",
    toast_config_exported: "配置已导出：{path}",
    toast_backup_exported: "备份已导出：{path}",
    backup_time: "时间",
    backup_size: "大小",
    backup_restore_new: "恢复为新 Agent",
    prompt_optional_agent_name: "可选：新 Agent 名称",
    prompt_optional_imported_name: "可选：导入后的 Agent 名称",
    prompt_new_agent_name: "新的 Agent 名称",
    confirm_delete_agent: "确认删除 Agent \"{name}\"？将删除 config/workspace/logs。",
    confirm_clear_logs: "确认清空当前 Agent 日志？",
    json_add_field: "新增字段",
    json_delete: "删除",
    json_empty_array: "数组为空，可用 + 按钮添加。",
    json_empty_object: "对象为空，点击“新增字段”。",
    prompt_new_field_name: "请输入字段名",
    toast_field_exists: "字段已存在。",
    toast_invalid_channel_json: "通讯字段 JSON 无效：{field}",
    wizard_req_agent_name: "Agent 名称不能为空。",
    wizard_req_model_name: "模型名称不能为空。",
    wizard_req_api_base: "API 地址不能为空。",
    wizard_req_api_key: "API Key 不能为空。"
  },
  ru: {
    brand_subtitle: "Простой настольный клиент для 4claw CLI",
    win_minimize: "Свернуть",
    win_close: "Закрыть",
    agent_list: "Список агентов",
    create_agent_wizard: "Создать агента (мастер)",
    import_backup: "Импорт бэкапа",
    refresh: "Обновить",
    no_agent_selected: "Агент не выбран",
    rename: "Переименовать",
    open_folder: "Открыть папку",
    delete: "Удалить",
    tab_dashboard: "Панель",
    tab_config: "Конфиг",
    tab_logs: "Логи",
    tab_backups: "Бэкапы",
    tab_settings: "Настройки",
    import_config: "Импорт конфига",
    export_config: "Экспорт конфига",
    reload: "Перезагрузить",
    quick_config: "Быстрый конфиг",
    full_config: "Полный конфиг",
    agent_name: "Имя агента",
    model_platform: "Платформа модели",
    platform_model: "Модель платформы",
    model_customer: "customer",
    model_name: "Имя модели",
    api_base: "API Base",
    api_key: "API Key",
    channel_platform: "Платформа связи",
    channel_config: "Конфиг платформы",
    channel_no_fields: "Для этой платформы нет настраиваемых полей в default-config.",
    placeholder_model_name: "например openai/gpt-5.2",
    placeholder_api_base: "например https://api.openai.com/v1",
    placeholder_channel_json: "Используйте формат JSON",
    save_quick_config: "Сохранить быстрый конфиг",
    save_full_config: "Сохранить полный конфиг",
    refresh_logs: "Обновить логи",
    clear_logs: "Очистить логи",
    logs_scroll_bottom: "Прокрутить вниз",
    create_backup: "Создать бэкап",
    export_backup: "Экспорт бэкапа",
    settings_close_behavior: "Поведение при закрытии окна",
    close_ask: "Спрашивать каждый раз",
    close_minimize: "Сворачивать в трей",
    close_exit: "Выходить сразу",
    settings_language: "Язык",
    settings_ui_language: "Язык интерфейса",
    save_settings: "Сохранить настройки",
    settings_hint: "В режиме «Спрашивать» диалог закрытия содержит опцию «Запомнить».",
    language_en: "English",
    language_zh: "简体中文",
    language_ru: "Русский",
    wizard_title: "Мастер создания агента",
    wizard_cancel: "Отмена",
    wizard_back: "Назад",
    wizard_next: "Далее",
    wizard_create_start: "Создать и запустить",
    wizard_step: "Шаг {step} / 2",
    empty_no_agents: "Агентов пока нет. Нажмите «Создать».",
    empty_select_agent_controls: "Выберите агента для просмотра состояния и управления.",
    empty_no_config: "Нет доступного конфига.",
    empty_config_load_failed: "Не удалось загрузить config.json.",
    empty_select_agent_edit: "Выберите агента для редактирования config.json.",
    empty_select_agent_backups: "Выберите агента для просмотра бэкапов.",
    empty_no_backups: "Бэкапов пока нет.",
    status_running: "Запущен",
    status_stopped: "Остановлен",
    label_id: "ID",
    label_port: "Порт",
    label_last_start: "Последний запуск",
    action_stop: "Стоп",
    action_start: "Старт",
    action_backup: "Бэкап",
    stat_status: "Статус",
    stat_pid: "PID",
    stat_gateway_port: "Порт Gateway",
    stat_created_at: "Создан",
    stat_updated_at: "Обновлен",
    dash_stop_agent: "Остановить агента",
    dash_start_agent: "Запустить агента",
    dash_create_backup: "Создать бэкап",
    dash_export_backup: "Экспорт бэкапа",
    dash_view_logs: "Открыть логи",
    dash_open_config: "Открыть конфиг",
    toast_select_agent: "Сначала выберите агента.",
    toast_settings_saved: "Настройки сохранены.",
    toast_backup_created: "Бэкап создан.",
    toast_quick_saved: "Быстрый конфиг сохранен.",
    toast_full_saved: "Полный конфиг сохранен.",
    toast_config_imported: "Конфиг импортирован.",
    toast_agent_created_started: "Агент создан и запущен.",
    toast_backup_restored: "Бэкап восстановлен.",
    toast_config_exported: "Конфиг экспортирован: {path}",
    toast_backup_exported: "Бэкап экспортирован: {path}",
    backup_time: "Время",
    backup_size: "Размер",
    backup_restore_new: "Восстановить как нового агента",
    prompt_optional_agent_name: "Опционально: имя нового агента",
    prompt_optional_imported_name: "Опционально: имя после импорта",
    prompt_new_agent_name: "Новое имя агента",
    confirm_delete_agent: "Удалить агента \"{name}\"? Будут удалены config/workspace/logs.",
    confirm_clear_logs: "Очистить логи текущего агента?",
    json_add_field: "Добавить поле",
    json_delete: "Удалить",
    json_empty_array: "Массив пуст. Используйте кнопки + для добавления.",
    json_empty_object: "Объект пуст. Нажмите «Добавить поле».",
    prompt_new_field_name: "Введите имя поля",
    toast_field_exists: "Поле уже существует.",
    toast_invalid_channel_json: "Некорректный JSON в поле канала: {field}",
    wizard_req_agent_name: "Требуется имя агента.",
    wizard_req_model_name: "Требуется имя модели.",
    wizard_req_api_base: "Требуется API Base.",
    wizard_req_api_key: "Требуется API Key."
  }
};

function getLocale() {
  const lang = state.settings?.language;
  return I18N[lang] ? lang : "en";
}

function t(key, vars = {}) {
  const lang = getLocale();
  const dict = I18N[lang] || I18N.en;
  const fallback = I18N.en[key] || key;
  let text = dict[key] || fallback;
  for (const [k, v] of Object.entries(vars)) {
    text = text.replaceAll(`{${k}}`, String(v));
  }
  return text;
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) {
    el.textContent = value;
  }
}

function normalizeModelCatalog(raw) {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw
    .map((item, index) => {
      const displayName = String(item?.name || "").trim();
      const id = displayName ? displayName.toLowerCase() : `platform-${index + 1}`;
      const models = Array.isArray(item?.models)
        ? item.models.map((m) => String(m || "").trim()).filter(Boolean)
        : [];
      return {
        id,
        name: displayName || `Platform ${index + 1}`,
        baseUrl: String(item?.base_url || "").trim(),
        models
      };
    })
    .filter((item) => item.name);
}

function getPlatformById(platformId) {
  return state.modelCatalog.find((item) => item.id === platformId) || null;
}

function getModelFormElements(scope) {
  if (scope === "wizard") {
    return {
      platform: els.wizardModelPlatform,
      preset: els.wizardModelPreset,
      modelName: els.wizardModelName,
      apiBase: els.wizardApiBase
    };
  }
  return {
    platform: els.quickModelPlatform,
    preset: els.quickModelPreset,
    modelName: els.quickModelName,
    apiBase: els.quickApiBase
  };
}

function setSelectOptions(selectEl, options, selectedValue) {
  if (!selectEl) {
    return;
  }
  selectEl.innerHTML = "";
  for (const item of options) {
    const opt = document.createElement("option");
    opt.value = item.value;
    opt.textContent = item.label;
    selectEl.appendChild(opt);
  }
  const hasSelected = options.some((item) => item.value === selectedValue);
  selectEl.value = hasSelected ? selectedValue : options[0]?.value || "";
}

function getPlatformOptions() {
  const options = state.modelCatalog.map((platform) => ({
    value: platform.id,
    label: platform.name
  }));
  options.push({ value: CUSTOMER_PLATFORM, label: t("model_customer") });
  return options;
}

function getModelPresetOptions(platformId) {
  const platform = getPlatformById(platformId);
  if (!platform) {
    return [{ value: CUSTOMER_MODEL, label: t("model_customer") }];
  }
  const options = platform.models.map((modelName) => ({
    value: modelName,
    label: modelName
  }));
  options.push({ value: CUSTOMER_MODEL, label: t("model_customer") });
  return options;
}

function renderModelSelectors(scope, desiredPlatformId = "", desiredPreset = "") {
  const form = getModelFormElements(scope);
  if (!form.platform || !form.preset) {
    return;
  }
  const fallbackPlatformId = state.modelCatalog[0]?.id || CUSTOMER_PLATFORM;
  const platformId =
    desiredPlatformId && (desiredPlatformId === CUSTOMER_PLATFORM || getPlatformById(desiredPlatformId))
      ? desiredPlatformId
      : fallbackPlatformId;

  setSelectOptions(form.platform, getPlatformOptions(), platformId);

  const modelOptions = getModelPresetOptions(form.platform.value);
  const fallbackPreset = modelOptions[0]?.value || CUSTOMER_MODEL;
  const presetValue = modelOptions.some((item) => item.value === desiredPreset) ? desiredPreset : fallbackPreset;
  setSelectOptions(form.preset, modelOptions, presetValue);
}

function applyModelSelection(scope, { preserveCustomName = false } = {}) {
  const form = getModelFormElements(scope);
  if (!form.platform || !form.preset || !form.modelName || !form.apiBase) {
    return;
  }

  const platformId = form.platform.value || CUSTOMER_PLATFORM;
  const preset = form.preset.value || CUSTOMER_MODEL;
  const platform = getPlatformById(platformId);

  if (!platform || platformId === CUSTOMER_PLATFORM) {
    form.apiBase.readOnly = false;
    form.modelName.readOnly = false;
    if (!preserveCustomName) {
      form.apiBase.value = "";
      form.modelName.value = "";
    }
    return;
  }

  form.apiBase.value = platform.baseUrl || "";
  form.apiBase.readOnly = true;

  if (preset === CUSTOMER_MODEL) {
    form.modelName.readOnly = false;
    if (!preserveCustomName) {
      form.modelName.value = "";
    }
    return;
  }

  form.modelName.value = preset;
  form.modelName.readOnly = true;
}

function detectModelSelection(modelName, apiBase) {
  const name = String(modelName || "").trim();
  const base = String(apiBase || "").trim();
  for (const platform of state.modelCatalog) {
    if (!platform.baseUrl || platform.baseUrl !== base) {
      continue;
    }
    if (platform.models.includes(name)) {
      return { platformId: platform.id, modelPreset: name };
    }
    return { platformId: platform.id, modelPreset: CUSTOMER_MODEL };
  }
  return { platformId: CUSTOMER_PLATFORM, modelPreset: CUSTOMER_MODEL };
}

function refreshModelControlsLocale() {
  const quickPlatform = els.quickModelPlatform?.value || "";
  const quickPreset = els.quickModelPreset?.value || "";
  renderModelSelectors("quick", quickPlatform, quickPreset);
  applyModelSelection("quick", { preserveCustomName: true });

  const wizardPlatform = els.wizardModelPlatform?.value || "";
  const wizardPreset = els.wizardModelPreset?.value || "";
  renderModelSelectors("wizard", wizardPlatform, wizardPreset);
  applyModelSelection("wizard", { preserveCustomName: true });
}

function getChannelElements(scope) {
  if (scope === "wizard") {
    return {
      platform: els.wizardChannelPlatform,
      fields: els.wizardChannelFields
    };
  }
  return {
    platform: els.quickChannelPlatform,
    fields: els.quickChannelFields
  };
}

function getChannelStore(scope) {
  return scope === "wizard" ? state.wizardChannelValues : state.quickChannelValues;
}

function getChannelTemplate(channelKey) {
  const channels = state.defaultConfig?.channels;
  const channel = channels && typeof channels === "object" ? channels[channelKey] : null;
  if (channel && typeof channel === "object" && !Array.isArray(channel)) {
    return safeClone(channel);
  }
  return { enabled: false };
}

function getChannelFieldEntries(channelKey) {
  const template = getChannelTemplate(channelKey);
  return Object.entries(template).filter(([key]) => key !== "enabled" && !key.startsWith("_"));
}

function normalizeChannelRawValue(value) {
  if (Array.isArray(value) || (value && typeof value === "object")) {
    return JSON.stringify(value, null, 2);
  }
  if (value === undefined || value === null) {
    return "";
  }
  return value;
}

function parseChannelTypedValue(rawValue, templateValue, fieldName) {
  if (Array.isArray(templateValue) || (templateValue && typeof templateValue === "object")) {
    const raw = String(rawValue || "").trim();
    if (!raw) {
      return Array.isArray(templateValue) ? [] : {};
    }
    try {
      return JSON.parse(raw);
    } catch {
      throw new Error(t("toast_invalid_channel_json", { field: fieldName }));
    }
  }
  if (typeof templateValue === "boolean") {
    return Boolean(rawValue);
  }
  if (typeof templateValue === "number") {
    const n = Number(rawValue);
    return Number.isFinite(n) ? n : 0;
  }
  return String(rawValue ?? "");
}

function getChannelLabel(channelKey) {
  return CHANNEL_LABELS[channelKey] || channelKey;
}

function ensureChannelStoreFromConfig(scope, channelsConfig = {}) {
  const store = {};
  for (const key of CHANNEL_ORDER) {
    const template = getChannelTemplate(key);
    const current = channelsConfig && typeof channelsConfig === "object" ? channelsConfig[key] : null;
    const values = {};
    for (const [field, templateValue] of Object.entries(template)) {
      if (field === "enabled" || field.startsWith("_")) {
        continue;
      }
      const value =
        current && typeof current === "object" && Object.prototype.hasOwnProperty.call(current, field)
          ? current[field]
          : templateValue;
      values[field] = normalizeChannelRawValue(value);
    }
    store[key] = values;
  }
  if (scope === "wizard") {
    state.wizardChannelValues = store;
  } else {
    state.quickChannelValues = store;
  }
}

function detectEnabledChannel(channelsConfig) {
  for (const key of CHANNEL_ORDER) {
    if (channelsConfig && channelsConfig[key] && channelsConfig[key].enabled === true) {
      return key;
    }
  }
  return "telegram";
}

function renderChannelPlatformOptions(scope, selectedKey = "telegram") {
  const { platform } = getChannelElements(scope);
  if (!platform) {
    return;
  }
  const options = CHANNEL_ORDER.map((key) => ({
    value: key,
    label: getChannelLabel(key)
  }));
  setSelectOptions(platform, options, selectedKey);
}

function renderChannelFields(scope, channelKey) {
  const { fields } = getChannelElements(scope);
  if (!fields) {
    return;
  }
  const store = getChannelStore(scope);
  if (!store[channelKey]) {
    store[channelKey] = {};
  }

  fields.innerHTML = "";
  const entries = getChannelFieldEntries(channelKey);
  if (!entries.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = t("channel_no_fields");
    fields.appendChild(empty);
    return;
  }

  for (const [field, templateValue] of entries) {
    if (!Object.prototype.hasOwnProperty.call(store[channelKey], field)) {
      store[channelKey][field] = normalizeChannelRawValue(templateValue);
    }

    const wrap = document.createElement("label");
    wrap.className = "channel-field-item";

    const title = document.createElement("span");
    title.textContent = field;
    wrap.appendChild(title);

    if (typeof templateValue === "boolean") {
      const input = document.createElement("input");
      input.type = "checkbox";
      input.checked = Boolean(store[channelKey][field]);
      input.addEventListener("change", () => {
        store[channelKey][field] = input.checked;
      });
      wrap.appendChild(input);
      fields.appendChild(wrap);
      continue;
    }

    if (typeof templateValue === "number") {
      const input = document.createElement("input");
      input.type = "number";
      input.step = "any";
      input.value = String(store[channelKey][field] ?? "");
      input.addEventListener("input", () => {
        store[channelKey][field] = input.value;
      });
      wrap.appendChild(input);
      fields.appendChild(wrap);
      continue;
    }

    if (Array.isArray(templateValue) || (templateValue && typeof templateValue === "object")) {
      const textarea = document.createElement("textarea");
      textarea.value = String(store[channelKey][field] ?? "");
      textarea.placeholder = t("placeholder_channel_json");
      textarea.addEventListener("input", () => {
        store[channelKey][field] = textarea.value;
      });
      wrap.appendChild(textarea);
      fields.appendChild(wrap);
      continue;
    }

    const input = document.createElement("input");
    input.type = "text";
    input.value = String(store[channelKey][field] ?? "");
    input.addEventListener("input", () => {
      store[channelKey][field] = input.value;
    });
    wrap.appendChild(input);
    fields.appendChild(wrap);
  }
}

function refreshChannelControlsLocale() {
  const quickSelected = els.quickChannelPlatform?.value || "telegram";
  renderChannelPlatformOptions("quick", quickSelected);
  renderChannelFields("quick", els.quickChannelPlatform?.value || "telegram");

  const wizardSelected = els.wizardChannelPlatform?.value || "telegram";
  renderChannelPlatformOptions("wizard", wizardSelected);
  renderChannelFields("wizard", els.wizardChannelPlatform?.value || "telegram");
}

function getTypedChannelValues(scope, channelKey) {
  const store = getChannelStore(scope);
  const rawValues = store[channelKey] && typeof store[channelKey] === "object" ? store[channelKey] : {};
  const typed = {};
  for (const [field, templateValue] of getChannelFieldEntries(channelKey)) {
    const raw = Object.prototype.hasOwnProperty.call(rawValues, field)
      ? rawValues[field]
      : normalizeChannelRawValue(templateValue);
    typed[field] = parseChannelTypedValue(raw, templateValue, field);
  }
  return typed;
}

function applyLocale() {
  const locale = getLocale();
  document.documentElement.lang = locale === "zh-CN" ? "zh-CN" : locale;

  setText("brandSubtitle", t("brand_subtitle"));
  setText("agentListTitle", t("agent_list"));
  setText("createAgentBtn", t("create_agent_wizard"));
  setText("importBackupBtn", t("import_backup"));
  setText("refreshAgentsBtn", t("refresh"));
  setText("openAgentFolderBtn", t("open_folder"));
  setText("deleteAgentBtn", t("delete"));
  setText("tabDashboardBtn", t("tab_dashboard"));
  setText("tabConfigBtn", t("tab_config"));
  setText("tabLogsBtn", t("tab_logs"));
  setText("tabBackupsBtn", t("tab_backups"));
  setText("tabSettingsBtn", t("tab_settings"));
  setText("importConfigBtn", t("import_config"));
  setText("exportConfigBtn", t("export_config"));
  setText("reloadConfigBtn", t("reload"));
  setText("quickConfigTabBtn", t("quick_config"));
  setText("fullConfigTabBtn", t("full_config"));
  setText("quickAgentNameLabel", t("agent_name"));
  setText("quickModelPlatformLabel", t("model_platform"));
  setText("quickModelPresetLabel", t("platform_model"));
  setText("quickModelNameLabel", t("model_name"));
  setText("quickApiBaseLabel", t("api_base"));
  setText("quickApiKeyLabel", t("api_key"));
  setText("quickChannelPlatformLabel", t("channel_platform"));
  setText("quickChannelConfigLabel", t("channel_config"));
  setText("saveQuickConfigBtn", t("save_quick_config"));
  setText("saveConfigBtn", t("save_full_config"));
  setText("refreshLogsBtn", t("refresh_logs"));
  setText("clearLogsBtn", t("clear_logs"));
  if (els.logScrollBottomBtn) {
    const label = t("logs_scroll_bottom");
    els.logScrollBottomBtn.title = label;
    els.logScrollBottomBtn.setAttribute("aria-label", label);
  }
  setText("createBackupBtn", t("create_backup"));
  setText("exportBackupBtn", t("export_backup"));
  setText("settingsCloseBehaviorTitle", t("settings_close_behavior"));
  setText("closeBehaviorAskLabel", t("close_ask"));
  setText("closeBehaviorMinimizeLabel", t("close_minimize"));
  setText("closeBehaviorExitLabel", t("close_exit"));
  setText("settingsLanguageTitle", t("settings_language"));
  setText("settingsLanguageLabel", t("settings_ui_language"));
  setText("saveSettingsBtn", t("save_settings"));
  setText("settingsHintText", t("settings_hint"));
  setText("wizardTitle", t("wizard_title"));
  setText("wizardAgentNameLabel", t("agent_name"));
  setText("wizardModelPlatformLabel", t("model_platform"));
  setText("wizardModelPresetLabel", t("platform_model"));
  setText("wizardModelNameLabel", t("model_name"));
  setText("wizardApiBaseLabel", t("api_base"));
  setText("wizardApiKeyLabel", t("api_key"));
  setText("wizardChannelPlatformLabel", t("channel_platform"));
  setText("wizardChannelConfigLabel", t("channel_config"));
  setText("wizardCancelBtn", t("wizard_cancel"));
  setText("wizardPrevBtn", t("wizard_back"));
  setText("wizardNextBtn", t("wizard_next"));
  setText("wizardSubmitBtn", t("wizard_create_start"));

  if (els.quickModelName) {
    els.quickModelName.placeholder = t("placeholder_model_name");
  }
  if (els.quickApiBase) {
    els.quickApiBase.placeholder = t("placeholder_api_base");
  }
  if (els.wizardModelName) {
    els.wizardModelName.placeholder = t("placeholder_model_name");
  }
  if (els.wizardApiBase) {
    els.wizardApiBase.placeholder = t("placeholder_api_base");
  }

  els.minimizeWindowBtn.title = t("win_minimize");
  els.closeWindowBtn.title = t("win_close");

  const langOptionEN = els.languageSelect?.querySelector('option[value="en"]');
  const langOptionZH = els.languageSelect?.querySelector('option[value="zh-CN"]');
  const langOptionRU = els.languageSelect?.querySelector('option[value="ru"]');
  if (langOptionEN) {
    langOptionEN.textContent = t("language_en");
  }
  if (langOptionZH) {
    langOptionZH.textContent = t("language_zh");
  }
  if (langOptionRU) {
    langOptionRU.textContent = t("language_ru");
  }

  refreshModelControlsLocale();
  refreshChannelControlsLocale();

  renderSelectedTitle();
  renderAgentList();
  renderDashboard();
  renderConfigEditor();
  renderBackups();
  if (wizardState.open) {
    setWizardStep(wizardState.step);
  }
}

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
    showInfo(t("toast_select_agent"));
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
  if (els.languageSelect) {
    els.languageSelect.value = state.settings?.language || "en";
  }
}

async function loadSettings() {
  try {
    const payload = await api.getSettings();
    if (payload && typeof payload === "object") {
      state.settings = {
        closeBehavior: payload.closeBehavior || "ask",
        language: payload.language || "en"
      };
    }
  } catch {}
  renderSettings();
  applyLocale();
}

async function saveSettingsAction() {
  const checked = document.querySelector('input[name="closeBehavior"]:checked');
  const closeBehavior = checked ? checked.value : "ask";
  const language = els.languageSelect?.value || "en";
  try {
    const saved = await api.saveSettings({ closeBehavior, language });
    state.settings = {
      closeBehavior: saved?.closeBehavior || "ask",
      language: saved?.language || "en"
    };
    renderSettings();
    applyLocale();
    showInfo(t("toast_settings_saved"));
  } catch (error) {
    showError(error);
  }
}

function renderRuntimeInfo() {
  // Hidden by UI requirement.
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
    empty.textContent = t("empty_no_agents");
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
    badge.textContent = agent.status.running ? t("status_running") : t("status_stopped");
    top.appendChild(name);
    top.appendChild(badge);
    card.appendChild(top);

    const meta = document.createElement("div");
    meta.className = "agent-meta";
    meta.innerHTML = `
      <div>${t("label_id")}: ${agent.id}</div>
      <div>${t("label_port")}: ${(agent.config && agent.config.gateway && agent.config.gateway.port) || "-"}</div>
      <div>${t("label_last_start")}: ${fmtDate(agent.meta.lastStartedAt)}</div>
    `;
    card.appendChild(meta);

    const actions = document.createElement("div");
    actions.className = "agent-actions";

    const toggleBtn = document.createElement("button");
    toggleBtn.className = "btn btn-xs";
    toggleBtn.textContent = agent.status.running ? t("action_stop") : t("action_start");
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
    backupBtn.textContent = t("action_backup");
    backupBtn.addEventListener("click", async (event) => {
      event.stopPropagation();
      try {
        await api.createBackup(agent.id);
        showInfo(t("toast_backup_created"));
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
  els.selectedAgentTitle.textContent = selected ? `${selected.meta.name || selected.id} (${selected.id})` : t("no_agent_selected");
}

function renderDashboard() {
  const pane = els.panes.dashboard;
  const selected = getSelectedAgent();
  if (!selected) {
    pane.innerHTML = `<div class="empty-state">${t("empty_select_agent_controls")}</div>`;
    return;
  }

  const port = selected.config && selected.config.gateway ? selected.config.gateway.port : "-";
  pane.innerHTML = `
    <div class="dashboard-grid">
      <div class="stat-card">
        <div class="stat-title">${t("stat_status")}</div>
        <div class="stat-value">${selected.status.running ? t("status_running") : t("status_stopped")}</div>
      </div>
      <div class="stat-card">
        <div class="stat-title">${t("stat_pid")}</div>
        <div class="stat-value">${selected.status.pid || "-"}</div>
      </div>
      <div class="stat-card">
        <div class="stat-title">${t("stat_gateway_port")}</div>
        <div class="stat-value">${port}</div>
      </div>
      <div class="stat-card">
        <div class="stat-title">${t("stat_created_at")}</div>
        <div class="stat-value">${fmtDate(selected.meta.createdAt)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-title">${t("stat_updated_at")}</div>
        <div class="stat-value">${fmtDate(selected.meta.updatedAt)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-title">${t("label_last_start")}</div>
        <div class="stat-value">${fmtDate(selected.meta.lastStartedAt)}</div>
      </div>
    </div>
    <div class="dashboard-actions">
      <button class="btn btn-primary" id="dashToggleBtn">${selected.status.running ? t("dash_stop_agent") : t("dash_start_agent")}</button>
      <button class="btn btn-soft" id="dashBackupBtn">${t("dash_create_backup")}</button>
      <button class="btn btn-soft" id="dashExportBtn">${t("dash_export_backup")}</button>
      <button class="btn btn-soft" id="dashLogsBtn">${t("dash_view_logs")}</button>
      <button class="btn btn-soft" id="dashConfigBtn">${t("dash_open_config")}</button>
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
      showInfo(t("toast_backup_created"));
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
  const defaultAlias = String(defaults.model || "").trim() || "";
  const entry = findModelEntry(safe, defaultAlias) || {};
  const modelName = String(entry.model || defaultAlias || "").trim();
  const apiBase = String(entry.api_base || "").trim();
  const selection = detectModelSelection(modelName, apiBase);
  const activeChannel = detectEnabledChannel(safe.channels || {});

  return {
    agentName: selected ? String(selected.meta.name || selected.id || "") : "",
    modelPlatform: selection.platformId,
    modelPreset: selection.modelPreset,
    modelName,
    apiBase,
    apiKey: String(entry.api_key || ""),
    channelPlatform: activeChannel
  };
}

function renderQuickConfig() {
  const selected = getSelectedAgent();
  if (!selected || !state.configDraft) {
    els.quickAgentName.value = "";
    renderModelSelectors("quick");
    els.quickModelName.value = "";
    els.quickApiBase.value = "";
    applyModelSelection("quick", { preserveCustomName: true });
    els.quickApiKey.value = "";
    ensureChannelStoreFromConfig("quick", {});
    renderChannelPlatformOptions("quick", "telegram");
    renderChannelFields("quick", "telegram");
    return;
  }

  const quick = getQuickDataFromConfig(state.configDraft, selected);
  els.quickAgentName.value = quick.agentName;
  renderModelSelectors("quick", quick.modelPlatform, quick.modelPreset);
  els.quickModelName.value = quick.modelName;
  els.quickApiBase.value = quick.apiBase;
  applyModelSelection("quick", { preserveCustomName: true });
  els.quickApiKey.value = quick.apiKey;
  ensureChannelStoreFromConfig("quick", state.configDraft.channels || {});
  renderChannelPlatformOptions("quick", quick.channelPlatform);
  renderChannelFields("quick", quick.channelPlatform);
}

function getQuickDataFromInputs() {
  const channelPlatform = String(els.quickChannelPlatform.value || "telegram");
  const channelValues = getTypedChannelValues("quick", channelPlatform);
  return {
    agentName: String(els.quickAgentName.value || "").trim(),
    modelPlatform: String(els.quickModelPlatform.value || "").trim(),
    modelPreset: String(els.quickModelPreset.value || "").trim(),
    modelName: String(els.quickModelName.value || "").trim(),
    apiBase: String(els.quickApiBase.value || "").trim(),
    apiKey: String(els.quickApiKey.value || "").trim(),
    channelPlatform,
    channelValues
  };
}

function applyQuickDataToConfig(cfg, quick) {
  const safe = ensureConfigRoots(cfg);
  const alias = quick.modelName || String(safe.agents.defaults.model || "").trim() || "default-model";
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

  if (!safe.channels || typeof safe.channels !== "object") {
    safe.channels = {};
  }
  const allChannelKeys = new Set([...CHANNEL_ORDER, ...Object.keys(safe.channels)]);
  for (const key of allChannelKeys) {
    const existing = safe.channels[key] && typeof safe.channels[key] === "object" ? safe.channels[key] : {};
    safe.channels[key] = { ...existing, enabled: key === quick.channelPlatform };
  }
  const selectedChannel = quick.channelPlatform || "telegram";
  const selectedExisting =
    safe.channels[selectedChannel] && typeof safe.channels[selectedChannel] === "object" ? safe.channels[selectedChannel] : {};
  safe.channels[selectedChannel] = {
    ...selectedExisting,
    enabled: true,
    ...(quick.channelValues || {})
  };

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
    showInfo(t("toast_quick_saved"));
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
    els.configEditor.innerHTML = `<div class="empty-state">${t("empty_no_config")}</div>`;
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
    els.configEditor.innerHTML = `<div class="empty-state">${t("empty_config_load_failed")}</div>`;
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
    showInfo(t("toast_full_saved"));
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
  const key = window.prompt(t("prompt_new_field_name"));
  if (!key) {
    return;
  }
  let target = state.configDraft;
  for (const seg of path) {
    target = target[seg];
  }
  if (Object.prototype.hasOwnProperty.call(target, key)) {
    showInfo(t("toast_field_exists"));
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
    addBtn.textContent = t("json_add_field");
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
    removeBtn.textContent = t("json_delete");
    removeBtn.addEventListener("click", () => removeAtPath(childPath));

    row.appendChild(keyEl);
    row.appendChild(childWrap);
    row.appendChild(removeBtn);
    children.appendChild(row);
  }

  if (entries.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = valueType === "array" ? t("json_empty_array") : t("json_empty_object");
    children.appendChild(empty);
  }

  box.appendChild(children);
  return box;
}

function renderConfigEditor() {
  if (!state.configDraft) {
    els.configEditor.innerHTML = `<div class="empty-state">${t("empty_select_agent_edit")}</div>`;
    return;
  }
  els.configEditor.innerHTML = "";
  els.configEditor.appendChild(createNodeEditor(state.configDraft, [], "config"));
}

function scrollLogsToBottom() {
  if (!els.logViewer) {
    return;
  }
  try {
    els.logViewer.scrollTo({ top: els.logViewer.scrollHeight, behavior: "smooth" });
  } catch {
    els.logViewer.scrollTop = els.logViewer.scrollHeight;
  }
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
    els.backupList.innerHTML = `<div class="empty-state">${t("empty_select_agent_backups")}</div>`;
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
    els.backupList.innerHTML = `<div class="empty-state">${t("empty_no_backups")}</div>`;
    return;
  }

  for (const item of state.backups) {
    const row = document.createElement("div");
    row.className = "backup-item";
    const main = document.createElement("div");
    main.className = "backup-main";
    main.innerHTML = `
      <div class="backup-name">${item.fileName}</div>
      <div class="backup-meta">${t("backup_time")}: ${fmtDate(item.createdAt)}</div>
      <div class="backup-meta">${t("backup_size")}: ${bytesToText(item.size)}</div>
    `;

    const actions = document.createElement("div");
    actions.className = "json-actions-inline";
    const restoreBtn = document.createElement("button");
    restoreBtn.className = "btn btn-xs";
    restoreBtn.textContent = t("backup_restore_new");
    restoreBtn.addEventListener("click", async () => {
      const name = window.prompt(t("prompt_optional_agent_name"), "");
      try {
        const imported = await api.restoreBackup(item.fileName, name || "");
        if (imported && imported.id) {
          state.selectedAgentId = imported.id;
          await refreshAgents(true);
          await selectAgent(imported.id);
          showInfo(t("toast_backup_restored"));
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
  els.wizardStepLabel.textContent = t("wizard_step", { step: wizardState.step });
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
  renderModelSelectors("wizard");
  els.wizardModelName.value = "";
  els.wizardApiBase.value = "";
  applyModelSelection("wizard", { preserveCustomName: false });
  els.wizardApiKey.value = "";
  ensureChannelStoreFromConfig("wizard", {});
  renderChannelPlatformOptions("wizard", "telegram");
  renderChannelFields("wizard", "telegram");

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
  const channelPlatform = String(els.wizardChannelPlatform.value || "telegram");
  const channelValues = getTypedChannelValues("wizard", channelPlatform);
  return {
    agentName: String(els.wizardAgentName.value || "").trim(),
    modelPlatform: String(els.wizardModelPlatform.value || "").trim(),
    modelPreset: String(els.wizardModelPreset.value || "").trim(),
    modelName: String(els.wizardModelName.value || "").trim(),
    apiBase: String(els.wizardApiBase.value || "").trim(),
    apiKey: String(els.wizardApiKey.value || "").trim(),
    channelPlatform,
    channelValues
  };
}

function validateWizardStep(step) {
  let data;
  try {
    data = collectWizardData();
  } catch (error) {
    showError(error);
    return false;
  }

  if (step === 1) {
    if (!data.agentName) {
      showInfo(t("wizard_req_agent_name"));
      els.wizardAgentName.focus();
      return false;
    }
    if (!data.modelName) {
      showInfo(t("wizard_req_model_name"));
      els.wizardModelName.focus();
      return false;
    }
    if (!data.apiBase) {
      showInfo(t("wizard_req_api_base"));
      els.wizardApiBase.focus();
      return false;
    }
    if (!data.apiKey) {
      showInfo(t("wizard_req_api_key"));
      els.wizardApiKey.focus();
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

    showInfo(t("toast_agent_created_started"));
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

  els.quickModelPlatform.addEventListener("change", () => {
    renderModelSelectors("quick", els.quickModelPlatform.value, "");
    applyModelSelection("quick", { preserveCustomName: false });
  });
  els.quickModelPreset.addEventListener("change", () => {
    applyModelSelection("quick", { preserveCustomName: false });
  });

  els.wizardModelPlatform.addEventListener("change", () => {
    renderModelSelectors("wizard", els.wizardModelPlatform.value, "");
    applyModelSelection("wizard", { preserveCustomName: false });
  });
  els.wizardModelPreset.addEventListener("change", () => {
    applyModelSelection("wizard", { preserveCustomName: false });
  });

  els.quickChannelPlatform.addEventListener("change", () => {
    renderChannelFields("quick", els.quickChannelPlatform.value || "telegram");
  });

  els.wizardChannelPlatform.addEventListener("change", () => {
    renderChannelFields("wizard", els.wizardChannelPlatform.value || "telegram");
  });

  els.createAgentBtn.addEventListener("click", () => openCreateWizard());

  els.importBackupBtn.addEventListener("click", async () => {
    const preferred = window.prompt(t("prompt_optional_imported_name"), "");
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
    const yes = window.confirm(
      t("confirm_delete_agent", {
        name: selected.meta.name || selected.id
      })
    );
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
        showInfo(t("toast_config_imported"));
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
        showInfo(t("toast_config_exported", { path: out.filePath }));
      }
    } catch (error) {
      showError(error);
    }
  });

  els.reloadConfigBtn.addEventListener("click", () => loadConfig());
  els.saveQuickConfigBtn.addEventListener("click", () => saveQuickConfig());
  els.saveConfigBtn.addEventListener("click", () => saveConfig());
  els.refreshLogsBtn.addEventListener("click", () => refreshLogs());
  els.logScrollBottomBtn.addEventListener("click", () => scrollLogsToBottom());

  els.clearLogsBtn.addEventListener("click", async () => {
    const selected = ensureSelectedAgent();
    if (!selected) {
      return;
    }
    if (!window.confirm(t("confirm_clear_logs"))) {
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
      showInfo(t("toast_backup_created"));
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
        showInfo(t("toast_backup_exported", { path: out.filePath }));
      }
      await refreshBackups();
    } catch (error) {
      showError(error);
    }
  });

  els.languageSelect.addEventListener("change", () => {
    state.settings.language = els.languageSelect.value || "en";
    applyLocale();
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
  state.modelCatalog = normalizeModelCatalog(state.appInfo?.modelCatalog || []);
  state.defaultConfig =
    state.appInfo?.defaultConfig && typeof state.appInfo.defaultConfig === "object" ? state.appInfo.defaultConfig : {};
  if (state.appInfo && state.appInfo.settings) {
    state.settings = {
      closeBehavior: state.appInfo.settings.closeBehavior || "ask",
      language: state.appInfo.settings.language || "en"
    };
  }
  renderModelSelectors("quick");
  renderModelSelectors("wizard");
  applyModelSelection("quick", { preserveCustomName: true });
  applyModelSelection("wizard", { preserveCustomName: true });
  ensureChannelStoreFromConfig("quick", {});
  ensureChannelStoreFromConfig("wizard", {});
  renderChannelPlatformOptions("quick", "telegram");
  renderChannelPlatformOptions("wizard", "telegram");
  renderChannelFields("quick", "telegram");
  renderChannelFields("wizard", "telegram");
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
