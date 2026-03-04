const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const AdmZip = require("adm-zip");

function nowISO() {
  return new Date().toISOString();
}

function readJson(filePath, fallback = null) {
  if (!fs.existsSync(filePath)) {
    return fallback;
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function fileTimestamp() {
  const d = new Date();
  const p2 = (v) => String(v).padStart(2, "0");
  return `${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}-${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}`;
}

function platformBinaryName() {
  if (process.platform === "win32") {
    return "4claw-windows-amd64.exe";
  }
  if (process.platform === "darwin") {
    return process.arch === "arm64" ? "4claw-darwin-arm64" : "4claw-darwin-amd64";
  }
  return process.arch === "arm64" ? "4claw-linux-arm64" : "4claw-linux-amd64";
}

class AgentService {
  constructor(app) {
    this.app = app;
    this.running = new Map();
    this.paths = this.initPaths();
  }

  initPaths() {
    const userData = this.app.getPath("userData");
    const root = path.join(userData, "runtime");
    const agentsDir = path.join(root, "agents");
    const backupsDir = path.join(root, "backups");
    fs.mkdirSync(agentsDir, { recursive: true });
    fs.mkdirSync(backupsDir, { recursive: true });
    return { root, userData, agentsDir, backupsDir };
  }

  binarySearchPaths() {
    const binaryName = platformBinaryName();
    const envPath = process.env.FOURCLAW_BINARY || "";
    const appPath = this.app.getAppPath();
    const candidates = [
      envPath,
      path.join(process.resourcesPath, "bin", binaryName),
      path.join(path.dirname(process.execPath), "resources", "bin", binaryName),
      path.join(appPath, "resources", "bin", binaryName),
      path.join(process.cwd(), "resources", "bin", binaryName),
      path.join(process.cwd(), "bin", binaryName)
    ].filter(Boolean);
    return [...new Set(candidates)];
  }

  resolveBinaryPath() {
    const searchPaths = this.binarySearchPaths();
    const resolvedPath = searchPaths.find((p) => fs.existsSync(p) && fs.statSync(p).isFile()) || "";
    return {
      binaryName: platformBinaryName(),
      searchPaths,
      resolvedPath,
      found: Boolean(resolvedPath)
    };
  }

  templateConfigPath() {
    const candidates = [
      path.join(this.app.getAppPath(), "assets", "default-config.json"),
      path.join(process.cwd(), "assets", "default-config.json"),
      path.join(__dirname, "..", "..", "assets", "default-config.json")
    ];
    return candidates.find((p) => fs.existsSync(p));
  }

  loadTemplateConfig() {
    const configPath = this.templateConfigPath();
    if (!configPath) {
      throw new Error("未找到 default-config.json，请检查 assets/default-config.json");
    }
    return JSON.parse(fs.readFileSync(configPath, "utf8"));
  }

  listAgents() {
    if (!fs.existsSync(this.paths.agentsDir)) {
      return [];
    }

    const entries = fs.readdirSync(this.paths.agentsDir, { withFileTypes: true });
    const agents = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }
      const item = this.getAgent(entry.name);
      if (item) {
        agents.push(item);
      }
    }

    agents.sort((a, b) => (a.meta.createdAt || "").localeCompare(b.meta.createdAt || ""));
    return agents;
  }

  getAgent(id) {
    const dir = path.join(this.paths.agentsDir, id);
    if (!fs.existsSync(dir)) {
      return null;
    }

    const configPath = path.join(dir, "config.json");
    const workspacePath = path.join(dir, "workspace");
    const logsDir = path.join(dir, "logs");
    const logPath = path.join(logsDir, "runtime.log");
    const metaPath = path.join(dir, "meta.json");

    const meta = readJson(metaPath, {
      id,
      name: id,
      createdAt: nowISO(),
      updatedAt: nowISO(),
      lastStartedAt: null
    });

    const processInfo = this.running.get(id);
    const isRunning = Boolean(processInfo && !processInfo.proc.killed);

    return {
      id,
      dir,
      configPath,
      workspacePath,
      logPath,
      meta,
      status: {
        running: isRunning,
        pid: isRunning ? processInfo.proc.pid : null,
        startedAt: isRunning ? processInfo.startedAt : null
      }
    };
  }

  normalizeAgentId(name) {
    const base = String(name || "agent")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-_]+/g, "-")
      .replace(/^-+|-+$/g, "") || "agent";

    let candidate = base;
    let idx = 1;
    while (fs.existsSync(path.join(this.paths.agentsDir, candidate))) {
      idx += 1;
      candidate = `${base}-${idx}`;
    }
    return candidate;
  }

  usedPorts() {
    const ports = new Set();
    for (const agent of this.listAgents()) {
      const cfg = readJson(agent.configPath, {});
      if (cfg && cfg.gateway && Number.isInteger(cfg.gateway.port)) {
        ports.add(cfg.gateway.port);
      }
    }
    return ports;
  }

  usedPortsExcept(excludedAgentId) {
    const ports = new Set();
    for (const agent of this.listAgents()) {
      if (agent.id === excludedAgentId) {
        continue;
      }
      const cfg = readJson(agent.configPath, {});
      if (cfg && cfg.gateway && Number.isInteger(cfg.gateway.port)) {
        ports.add(cfg.gateway.port);
      }
    }
    return ports;
  }

  nextPort() {
    const inUse = this.usedPorts();
    let port = 18790;
    while (inUse.has(port)) {
      port += 1;
    }
    return port;
  }

  ensureAgentTree(dir) {
    fs.mkdirSync(path.join(dir, "workspace"), { recursive: true });
    fs.mkdirSync(path.join(dir, "logs"), { recursive: true });
  }

  createAgent(name) {
    const id = this.normalizeAgentId(name);
    const dir = path.join(this.paths.agentsDir, id);
    this.ensureAgentTree(dir);

    const config = this.loadTemplateConfig();
    if (!config.agents) {
      config.agents = {};
    }
    if (!config.agents.defaults) {
      config.agents.defaults = {};
    }
    if (!config.gateway) {
      config.gateway = {};
    }

    config.agents.defaults.workspace = path.join(dir, "workspace");
    config.gateway.port = this.nextPort();

    writeJson(path.join(dir, "config.json"), config);
    writeJson(path.join(dir, "meta.json"), {
      id,
      name: name || id,
      createdAt: nowISO(),
      updatedAt: nowISO(),
      lastStartedAt: null
    });

    fs.appendFileSync(path.join(dir, "logs", "runtime.log"), `[${nowISO()}] [SYSTEM] Agent created\n`, "utf8");
    return this.getAgent(id);
  }

  renameAgent(id, name) {
    const agent = this.getAgent(id);
    if (!agent) {
      throw new Error(`Agent ${id} 不存在`);
    }
    const meta = agent.meta;
    meta.name = String(name || "").trim() || id;
    meta.updatedAt = nowISO();
    writeJson(path.join(agent.dir, "meta.json"), meta);
    return this.getAgent(id);
  }

  async stopAgent(id) {
    const running = this.running.get(id);
    if (!running) {
      return this.getAgent(id);
    }

    const child = running.proc;
    await new Promise((resolve) => {
      let done = false;
      const finish = () => {
        if (!done) {
          done = true;
          resolve();
        }
      };

      child.once("exit", finish);
      try {
        if (process.platform === "win32") {
          const killer = spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true });
          killer.once("exit", () => setTimeout(finish, 120));
          killer.once("error", () => {
            try {
              child.kill("SIGTERM");
            } catch {}
            setTimeout(finish, 500);
          });
        } else {
          child.kill("SIGTERM");
          setTimeout(() => {
            if (!child.killed) {
              try {
                child.kill("SIGKILL");
              } catch {}
            }
          }, 1500);
          setTimeout(finish, 2200);
        }
      } catch {
        finish();
      }

      setTimeout(finish, 3000);
    });

    return this.getAgent(id);
  }

  startAgent(id) {
    const existing = this.running.get(id);
    if (existing) {
      return this.getAgent(id);
    }

    const agent = this.getAgent(id);
    if (!agent) {
      throw new Error(`Agent ${id} 不存在`);
    }

    if (!fs.existsSync(agent.configPath)) {
      throw new Error("config.json 不存在");
    }

    const binary = this.resolveBinaryPath();
    if (!binary.found) {
      throw new Error(
        `未找到 4claw 可执行文件。请放置到: ${path.join(process.cwd(), "resources", "bin", binary.binaryName)}`
      );
    }

    this.ensureAgentTree(agent.dir);
    const logStream = fs.createWriteStream(agent.logPath, { flags: "a" });
    const writeLog = (line) => {
      logStream.write(`[${nowISO()}] ${line}\n`);
    };

    const child = spawn(binary.resolvedPath, ["gateway", "--config", agent.configPath], {
      cwd: agent.dir,
      windowsHide: true
    });

    writeLog(`[SYSTEM] starting process pid=${child.pid} binary=${binary.resolvedPath}`);

    child.stdout.on("data", (chunk) => {
      const text = String(chunk).replace(/\r/g, "").trimEnd();
      if (text) {
        for (const line of text.split("\n")) {
          writeLog(`[STDOUT] ${line}`);
        }
      }
    });

    child.stderr.on("data", (chunk) => {
      const text = String(chunk).replace(/\r/g, "").trimEnd();
      if (text) {
        for (const line of text.split("\n")) {
          writeLog(`[STDERR] ${line}`);
        }
      }
    });

    child.on("error", (error) => {
      writeLog(`[ERROR] ${error.message}`);
    });

    child.on("close", (code, signal) => {
      writeLog(`[SYSTEM] process exited code=${code} signal=${signal || "none"}`);
      this.running.delete(id);
      logStream.end();
    });

    this.running.set(id, {
      proc: child,
      startedAt: nowISO()
    });

    const metaPath = path.join(agent.dir, "meta.json");
    const meta = readJson(metaPath, agent.meta);
    meta.updatedAt = nowISO();
    meta.lastStartedAt = nowISO();
    writeJson(metaPath, meta);

    return this.getAgent(id);
  }

  async deleteAgent(id) {
    const agent = this.getAgent(id);
    if (!agent) {
      return false;
    }
    await this.stopAgent(id);
    fs.rmSync(agent.dir, { recursive: true, force: true });
    return true;
  }

  loadConfig(id) {
    const agent = this.getAgent(id);
    if (!agent) {
      throw new Error(`Agent ${id} 不存在`);
    }
    const cfg = readJson(agent.configPath);
    if (!cfg) {
      throw new Error("config.json 读取失败或格式错误");
    }
    return cfg;
  }

  saveConfig(id, data) {
    const agent = this.getAgent(id);
    if (!agent) {
      throw new Error(`Agent ${id} 不存在`);
    }
    writeJson(agent.configPath, data);
    const meta = readJson(path.join(agent.dir, "meta.json"), agent.meta);
    meta.updatedAt = nowISO();
    writeJson(path.join(agent.dir, "meta.json"), meta);
    return this.getAgent(id);
  }

  exportConfig(id, destinationPath = "") {
    const agent = this.getAgent(id);
    if (!agent) {
      throw new Error(`Agent ${id} does not exist`);
    }

    const cfg = this.loadConfig(id);
    const fileName = `${id}-config-${fileTimestamp()}.json`;
    const outPath = destinationPath || path.join(agent.dir, fileName);
    writeJson(outPath, cfg);
    const stat = fs.statSync(outPath);
    return {
      filePath: outPath,
      fileName: path.basename(outPath),
      size: stat.size,
      createdAt: stat.mtime.toISOString()
    };
  }

  importConfig(id, sourcePath) {
    const agent = this.getAgent(id);
    if (!agent) {
      throw new Error(`Agent ${id} does not exist`);
    }
    if (!fs.existsSync(sourcePath)) {
      throw new Error("Config file does not exist");
    }

    let incoming;
    try {
      incoming = JSON.parse(fs.readFileSync(sourcePath, "utf8"));
    } catch {
      throw new Error("Config file is not valid JSON");
    }
    if (!incoming || typeof incoming !== "object" || Array.isArray(incoming)) {
      throw new Error("Config file must be a JSON object");
    }

    const current = this.loadConfig(id);
    const cfg = incoming;
    if (!cfg.agents || typeof cfg.agents !== "object") {
      cfg.agents = {};
    }
    if (!cfg.agents.defaults || typeof cfg.agents.defaults !== "object") {
      cfg.agents.defaults = {};
    }
    cfg.agents.defaults.workspace = agent.workspacePath;

    if (!cfg.gateway || typeof cfg.gateway !== "object") {
      cfg.gateway = {};
    }
    const otherPorts = this.usedPortsExcept(id);
    const candidate = cfg.gateway.port;
    if (!Number.isInteger(candidate) || otherPorts.has(candidate)) {
      if (current && current.gateway && Number.isInteger(current.gateway.port) && !otherPorts.has(current.gateway.port)) {
        cfg.gateway.port = current.gateway.port;
      } else {
        cfg.gateway.port = this.nextPort();
      }
    }

    writeJson(agent.configPath, cfg);
    const meta = readJson(path.join(agent.dir, "meta.json"), agent.meta);
    meta.updatedAt = nowISO();
    writeJson(path.join(agent.dir, "meta.json"), meta);
    fs.appendFileSync(agent.logPath, `[${nowISO()}] [SYSTEM] Config imported from ${sourcePath}\n`, "utf8");
    return this.getAgent(id);
  }

  getLogs(id, maxLines = 3000) {
    const agent = this.getAgent(id);
    if (!agent) {
      throw new Error(`Agent ${id} 不存在`);
    }
    if (!fs.existsSync(agent.logPath)) {
      return "";
    }
    const raw = fs.readFileSync(agent.logPath, "utf8");
    const lines = raw.split(/\r?\n/);
    if (lines.length <= maxLines) {
      return raw;
    }
    return lines.slice(-maxLines).join("\n");
  }

  clearLogs(id) {
    const agent = this.getAgent(id);
    if (!agent) {
      throw new Error(`Agent ${id} 不存在`);
    }
    fs.mkdirSync(path.dirname(agent.logPath), { recursive: true });
    fs.writeFileSync(agent.logPath, "", "utf8");
    return true;
  }

  createBackup(id, destinationPath = "") {
    const agent = this.getAgent(id);
    if (!agent) {
      throw new Error(`Agent ${id} 不存在`);
    }

    const fileName = `${id}-${fileTimestamp()}.zip`;
    const outPath = destinationPath || path.join(this.paths.backupsDir, fileName);

    const zip = new AdmZip();
    zip.addLocalFolder(agent.dir, id);
    zip.writeZip(outPath);

    const stat = fs.statSync(outPath);
    return {
      filePath: outPath,
      fileName: path.basename(outPath),
      size: stat.size,
      createdAt: stat.mtime.toISOString()
    };
  }

  listBackups(id = "") {
    const backups = [];
    const files = fs.readdirSync(this.paths.backupsDir, { withFileTypes: true });
    for (const file of files) {
      if (!file.isFile() || !file.name.toLowerCase().endsWith(".zip")) {
        continue;
      }
      if (id && !file.name.startsWith(`${id}-`)) {
        continue;
      }
      const fullPath = path.join(this.paths.backupsDir, file.name);
      const stat = fs.statSync(fullPath);
      backups.push({
        fileName: file.name,
        filePath: fullPath,
        size: stat.size,
        createdAt: stat.mtime.toISOString()
      });
    }

    backups.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return backups;
  }

  importBackup(backupPath, preferredName = "") {
    if (!fs.existsSync(backupPath)) {
      throw new Error("备份文件不存在");
    }

    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "4claw-import-"));
    const zip = new AdmZip(backupPath);
    zip.extractAllTo(tempRoot, true);

    const topDirs = fs
      .readdirSync(tempRoot, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => path.join(tempRoot, d.name));

    if (topDirs.length === 0) {
      throw new Error("备份文件格式错误：找不到 Agent 目录");
    }

    const srcDir = topDirs[0];
    const sourceId = path.basename(srcDir);
    const newId = this.normalizeAgentId(preferredName || sourceId || "imported-agent");
    const destDir = path.join(this.paths.agentsDir, newId);
    fs.cpSync(srcDir, destDir, { recursive: true });
    this.ensureAgentTree(destDir);

    const metaPath = path.join(destDir, "meta.json");
    const meta = readJson(metaPath, {
      id: newId,
      name: preferredName || newId,
      createdAt: nowISO(),
      updatedAt: nowISO(),
      lastStartedAt: null
    });
    meta.id = newId;
    meta.name = preferredName || meta.name || newId;
    meta.updatedAt = nowISO();
    meta.importedAt = nowISO();
    writeJson(metaPath, meta);

    const configPath = path.join(destDir, "config.json");
    const cfg = readJson(configPath, this.loadTemplateConfig());
    if (!cfg.agents) {
      cfg.agents = {};
    }
    if (!cfg.agents.defaults) {
      cfg.agents.defaults = {};
    }
    cfg.agents.defaults.workspace = path.join(destDir, "workspace");
    if (!cfg.gateway) {
      cfg.gateway = {};
    }
    if (!Number.isInteger(cfg.gateway.port) || this.usedPorts().has(cfg.gateway.port)) {
      cfg.gateway.port = this.nextPort();
    }
    writeJson(configPath, cfg);

    fs.rmSync(tempRoot, { recursive: true, force: true });
    return this.getAgent(newId);
  }

  restoreFromLocalBackup(fileName, preferredName = "") {
    const backupPath = path.join(this.paths.backupsDir, fileName);
    return this.importBackup(backupPath, preferredName);
  }
}

module.exports = { AgentService, fileTimestamp, platformBinaryName };
