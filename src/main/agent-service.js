const fs = require("fs");
const http = require("http");
const https = require("https");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const WATCHDOG_INTERVAL_MS = 5000;
const WATCHDOG_HTTP_TIMEOUT_MS = 3000;
const WATCHDOG_FAILURE_THRESHOLD = 3;
const WATCHDOG_LLM_STALL_MS = 3 * 60 * 1000;

const AdmZip = require("adm-zip");

function nowISO() {
  return new Date().toISOString();
}

function stripUtf8Bom(text) {
  if (typeof text !== "string") {
    return "";
  }
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function readJson(filePath, fallback = null) {
  if (!fs.existsSync(filePath)) {
    return fallback;
  }
  try {
    return JSON.parse(stripUtf8Bom(fs.readFileSync(filePath, "utf8")));
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

function authStorePath() {
  return path.join(os.homedir(), ".4claw", "auth.json");
}

function sanitizeSessionFileName(sessionKey) {
  return String(sessionKey || "").replace(/:/g, "_");
}

function createChatSessionKey(agentId) {
  const safeAgentId = String(agentId || "agent").trim() || "agent";
  return `agent:main:desktop:${safeAgentId}`;
}

class AgentService {
  constructor(app) {
    this.app = app;
    this.running = new Map();
    this.desiredRunning = new Set();
    this.stoppingAgents = new Set();
    this.chatWorkers = new Map();
    this.authSessions = new Map();
    this.watchdogState = new Map();
    this.watchdogBusy = false;
    this.watchdogTimer = null;
    this.paths = this.initPaths();
    this.startWatchdog();
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

  startWatchdog() {
    if (this.watchdogTimer) {
      return;
    }
    this.watchdogTimer = setInterval(() => {
      this.runWatchdogCycle().catch(() => {});
    }, WATCHDOG_INTERVAL_MS);
    this.watchdogTimer.unref?.();
  }

  stopWatchdog() {
    if (this.watchdogTimer) {
      clearInterval(this.watchdogTimer);
      this.watchdogTimer = null;
    }
  }

  async dispose() {
    this.stopWatchdog();
  }

  getWatchdogEntry(id) {
    const existing = this.watchdogState.get(id);
    if (existing) {
      return existing;
    }
    const created = {
      failures: 0,
      lastReason: "",
      lastRestartAt: "",
      restarting: false
    };
    this.watchdogState.set(id, created);
    return created;
  }

  healthEndpointForAgent(agent) {
    const cfg = readJson(agent.configPath, {});
    const port = Number(cfg?.gateway?.port);
    const host = String(cfg?.gateway?.host || "127.0.0.1").trim() || "127.0.0.1";
    const localHost = host === "0.0.0.0" || host === "::" ? "127.0.0.1" : host;
    return Number.isInteger(port) && port > 0 ? `http://${localHost}:${port}/ready` : "";
  }

  async fetchJson(targetUrl, timeoutMs = WATCHDOG_HTTP_TIMEOUT_MS) {
    const parsed = new URL(targetUrl);
    const client = parsed.protocol === "https:" ? https : http;
    return await new Promise((resolve, reject) => {
      const req = client.request(
        parsed,
        { method: "GET", timeout: timeoutMs },
        (res) => {
          let body = "";
          res.setEncoding("utf8");
          res.on("data", (chunk) => {
            body += chunk;
          });
          res.on("end", () => {
            try {
              resolve({
                ok: res.statusCode >= 200 && res.statusCode < 300,
                statusCode: res.statusCode,
                data: body ? JSON.parse(body) : {}
              });
            } catch (error) {
              reject(error);
            }
          });
        }
      );
      req.on("timeout", () => {
        req.destroy(new Error(`watchdog request timed out after ${timeoutMs}ms`));
      });
      req.on("error", reject);
      req.end();
    });
  }

  parseWatchdogTimestamp(value) {
    const text = String(value || "").trim();
    if (!text) {
      return 0;
    }
    const time = Date.parse(text);
    return Number.isNaN(time) ? 0 : time;
  }

  getActivityTimestamp(activity, key) {
    return this.parseWatchdogTimestamp(activity?.[key]?.timestamp);
  }

  detectHealthStall(payload) {
    if (!payload || typeof payload !== "object") {
      return "";
    }
    if (String(payload.status || "").trim().toLowerCase() !== "ready") {
      return `ready endpoint returned status=${payload.status || "unknown"}`;
    }

    const activity = payload.activity && typeof payload.activity === "object" ? payload.activity : {};
    const requestAt = this.getActivityTimestamp(activity, "llm_request");
    if (!requestAt) {
      return "";
    }

    const responseAt = Math.max(
      this.getActivityTimestamp(activity, "llm_response"),
      this.getActivityTimestamp(activity, "llm_error")
    );
    if (responseAt >= requestAt) {
      return "";
    }

    const ageMs = Date.now() - requestAt;
    if (ageMs > WATCHDOG_LLM_STALL_MS) {
      return `llm_request has been in flight for ${Math.round(ageMs / 1000)}s`;
    }

    const toolStartAt = this.getActivityTimestamp(activity, "tool_start");
    const toolDoneAt = Math.max(
      this.getActivityTimestamp(activity, "tool_complete"),
      this.getActivityTimestamp(activity, "tool_async_complete")
    );
    if (toolStartAt && toolDoneAt < toolStartAt) {
      const toolAgeMs = Date.now() - toolStartAt;
      if (toolAgeMs > WATCHDOG_LLM_STALL_MS) {
        return `tool execution has been in flight for ${Math.round(toolAgeMs / 1000)}s`;
      }
    }

    return "";
  }

  async restartAgentFromWatchdog(id, reason) {
    const entry = this.getWatchdogEntry(id);
    if (entry.restarting) {
      return;
    }
    entry.restarting = true;
    entry.lastReason = reason;
    this.appendAgentLog(id, `[WATCHDOG] restarting agent: ${reason}`);
    try {
      await this.stopAgent(id, { preserveDesired: true });
      await this.startAgent(id);
      entry.failures = 0;
      entry.lastRestartAt = nowISO();
      this.appendAgentLog(id, "[WATCHDOG] agent restarted successfully");
    } catch (error) {
      this.appendAgentLog(id, `[WATCHDOG] restart failed: ${error.message}`);
    } finally {
      entry.restarting = false;
    }
  }

  async checkAgentWatchdog(id) {
    if (!this.desiredRunning.has(id) || this.stoppingAgents.has(id)) {
      return;
    }

    const entry = this.getWatchdogEntry(id);
    const agent = this.getAgent(id);
    if (!agent) {
      return;
    }

    if (!agent.status?.running) {
      entry.failures += 1;
      entry.lastReason = "process exited";
      if (entry.failures >= 1) {
        await this.restartAgentFromWatchdog(id, entry.lastReason);
      }
      return;
    }

    try {
      const targetUrl = this.healthEndpointForAgent(agent);
      if (!targetUrl) {
        throw new Error("agent health endpoint is not configured");
      }
      const result = await this.fetchJson(targetUrl);
      const stallReason = result.ok ? this.detectHealthStall(result.data) : `health status ${result.statusCode}`;
      if (!result.ok || stallReason) {
        entry.failures += 1;
        entry.lastReason = stallReason || `health status ${result.statusCode}`;
        this.appendAgentLog(id, `[WATCHDOG] health check failed (${entry.failures}/${WATCHDOG_FAILURE_THRESHOLD}): ${entry.lastReason}`);
        if (entry.failures >= WATCHDOG_FAILURE_THRESHOLD) {
          await this.restartAgentFromWatchdog(id, entry.lastReason);
        }
        return;
      }

      entry.failures = 0;
      entry.lastReason = "";
    } catch (error) {
      entry.failures += 1;
      entry.lastReason = error.message || String(error);
      this.appendAgentLog(id, `[WATCHDOG] health check error (${entry.failures}/${WATCHDOG_FAILURE_THRESHOLD}): ${entry.lastReason}`);
      if (entry.failures >= WATCHDOG_FAILURE_THRESHOLD) {
        await this.restartAgentFromWatchdog(id, entry.lastReason);
      }
    }
  }

  async runWatchdogCycle() {
    if (this.watchdogBusy) {
      return;
    }
    this.watchdogBusy = true;
    try {
      for (const id of Array.from(this.desiredRunning)) {
        await this.checkAgentWatchdog(id);
      }
    } finally {
      this.watchdogBusy = false;
    }
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

  runBinaryCommand(args, { cwd = this.paths.root, timeoutMs = 10 * 60 * 1000 } = {}) {
    const binary = this.resolveBinaryPath();
    if (!binary.found) {
      throw new Error(`4claw executable not found: ${binary.binaryName}`);
    }

    return new Promise((resolve, reject) => {
      const child = spawn(binary.resolvedPath, args, {
        cwd,
        windowsHide: true
      });

      let stdout = "";
      let stderr = "";
      let finished = false;
      let timer = null;

      const finish = (handler) => {
        if (finished) {
          return;
        }
        finished = true;
        if (timer) {
          clearTimeout(timer);
        }
        handler();
      };

      if (timeoutMs > 0) {
        timer = setTimeout(() => {
          try {
            child.kill("SIGTERM");
          } catch {}
          finish(() => reject(new Error(`4claw command timed out after ${timeoutMs}ms`)));
        }, timeoutMs);
      }

      child.stdout.on("data", (chunk) => {
        stdout += String(chunk);
      });

      child.stderr.on("data", (chunk) => {
        stderr += String(chunk);
      });

      child.on("error", (error) => {
        finish(() => reject(error));
      });

      child.on("close", (code, signal) => {
        if (code === 0) {
          finish(() =>
            resolve({
              code,
              signal: signal || null,
              stdout,
              stderr
            })
          );
          return;
        }
        finish(() => {
          const message = (stderr || stdout || `4claw exited with code ${code}`).trim();
          reject(new Error(message));
        });
      });
    });
  }

  getAuthStatus() {
    const store = readJson(authStorePath(), { credentials: {} }) || { credentials: {} };
    const credentials =
      store && store.credentials && typeof store.credentials === "object" ? store.credentials : {};

    const providers = {};
    for (const [provider, cred] of Object.entries(credentials)) {
      const expiresAt = cred?.expires_at ? new Date(cred.expires_at) : null;
      const now = Date.now();
      let status = "available";
      if (expiresAt && !Number.isNaN(expiresAt.getTime())) {
        if (expiresAt.getTime() <= now) {
          status = "expired";
        } else if (expiresAt.getTime() <= now + 5 * 60 * 1000) {
          status = "needs_refresh";
        }
      }

      providers[provider] = {
        provider,
        authMethod: String(cred?.auth_method || ""),
        accountId: String(cred?.account_id || ""),
        email: String(cred?.email || ""),
        projectId: String(cred?.project_id || ""),
        expiresAt: expiresAt && !Number.isNaN(expiresAt.getTime()) ? expiresAt.toISOString() : "",
        status
      };
    }

    return {
      filePath: authStorePath(),
      providers
    };
  }

  async loginWithOAuth(provider) {
    const normalizedProvider = String(provider || "").trim();
    if (!normalizedProvider) {
      throw new Error("OAuth provider is required");
    }

    if (normalizedProvider === "openai") {
      return this.startOpenAIDeviceCodeLogin();
    }

    return this.startBrowserOAuthLogin(normalizedProvider);
  }

  findPendingAuthSession(provider) {
    for (const session of this.authSessions.values()) {
      if (session.provider === provider && (session.status === "starting" || session.status === "pending")) {
        return session;
      }
    }
    return null;
  }

  parseOpenAIDeviceCodeOutput(text) {
    const source = String(text || "").replace(/\r/g, "");
    const urlMatch = source.match(/To authenticate, open this URL in your browser:\s+([^\s]+)/i);
    const codeMatch = source.match(/Then enter this code:\s+([A-Z0-9-]+)/i);
    return {
      deviceUrl: urlMatch ? String(urlMatch[1] || "").trim() : "",
      userCode: codeMatch ? String(codeMatch[1] || "").trim() : ""
    };
  }

  parseBrowserOAuthOutput(text) {
    const source = String(text || "").replace(/\r/g, "");
    const urlMatch = source.match(/Open this URL to authenticate:\s+([^\s]+)/i);
    return {
      deviceUrl: urlMatch ? String(urlMatch[1] || "").trim() : ""
    };
  }

  serializeAuthSession(session) {
    if (!session) {
      return null;
    }
    return {
      id: session.id,
      provider: session.provider,
      mode: session.mode,
      status: session.status,
      deviceUrl: session.deviceUrl || "",
      userCode: session.userCode || "",
      stdout: session.stdout || "",
      stderr: session.stderr || "",
      error: session.error || "",
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      authStatus: session.status === "success" ? this.getAuthStatus() : null
    };
  }

  updateAuthSession(session, patch = {}) {
    Object.assign(session, patch, { updatedAt: nowISO() });
  }

  getAuthSession(sessionId) {
    return this.serializeAuthSession(this.authSessions.get(String(sessionId || "").trim()));
  }

  scheduleAuthSessionCleanup(sessionId, delayMs = 10 * 60 * 1000) {
    setTimeout(() => {
      this.authSessions.delete(sessionId);
    }, delayMs).unref?.();
  }

  async startOpenAIDeviceCodeLogin() {
    const existing = this.findPendingAuthSession("openai");
    if (existing) {
      return this.serializeAuthSession(existing);
    }

    const binary = this.resolveBinaryPath();
    if (!binary.found) {
      throw new Error(`4claw executable not found: ${binary.binaryName}`);
    }

    const session = {
      id: `auth-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      provider: "openai",
      mode: "device_code",
      status: "starting",
      deviceUrl: "",
      userCode: "",
      stdout: "",
      stderr: "",
      error: "",
      createdAt: nowISO(),
      updatedAt: nowISO()
    };
    this.authSessions.set(session.id, session);

    const child = spawn(binary.resolvedPath, ["auth", "login", "--provider", "openai", "--device-code"], {
      cwd: this.paths.root,
      windowsHide: true
    });

    return new Promise((resolve, reject) => {
      let settled = false;

      const maybeResolvePending = () => {
        const parsed = this.parseOpenAIDeviceCodeOutput(`${session.stdout}\n${session.stderr}`);
        if (!session.deviceUrl && parsed.deviceUrl) {
          session.deviceUrl = parsed.deviceUrl;
        }
        if (!session.userCode && parsed.userCode) {
          session.userCode = parsed.userCode;
        }
        if (!settled && session.deviceUrl && session.userCode) {
          this.updateAuthSession(session, { status: "pending" });
          settled = true;
          resolve(this.serializeAuthSession(session));
        }
      };

      child.stdout.on("data", (chunk) => {
        session.stdout += String(chunk);
        maybeResolvePending();
      });

      child.stderr.on("data", (chunk) => {
        session.stderr += String(chunk);
        maybeResolvePending();
      });

      child.on("error", (error) => {
        this.updateAuthSession(session, {
          status: "error",
          error: error.message || String(error)
        });
        this.scheduleAuthSessionCleanup(session.id);
        if (!settled) {
          settled = true;
          reject(error);
        }
      });

      child.on("close", (code) => {
        if (code === 0) {
          this.updateAuthSession(session, { status: "success" });
          this.scheduleAuthSessionCleanup(session.id);
          if (!settled) {
            settled = true;
            resolve(this.serializeAuthSession(session));
          }
          return;
        }

        const message = (session.stderr || session.stdout || `4claw exited with code ${code}`).trim();
        this.updateAuthSession(session, {
          status: "error",
          error: message
        });
        this.scheduleAuthSessionCleanup(session.id);
        if (!settled) {
          settled = true;
          reject(new Error(message));
        }
      });

      setTimeout(() => {
        maybeResolvePending();
        if (!settled && !session.deviceUrl && !session.userCode) {
          const message = "Unable to read OpenAI device code information from 4claw output.";
          this.updateAuthSession(session, {
            status: "error",
            error: message
          });
          this.scheduleAuthSessionCleanup(session.id);
          settled = true;
          try {
            child.kill("SIGTERM");
          } catch {}
          reject(new Error(message));
        }
      }, 5000);
    });
  }

  async startBrowserOAuthLogin(provider) {
    const existing = this.findPendingAuthSession(provider);
    if (existing) {
      return this.serializeAuthSession(existing);
    }

    const binary = this.resolveBinaryPath();
    if (!binary.found) {
      throw new Error(`4claw executable not found: ${binary.binaryName}`);
    }

    const session = {
      id: `auth-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      provider,
      mode: "browser_link",
      status: "starting",
      deviceUrl: "",
      userCode: "",
      stdout: "",
      stderr: "",
      error: "",
      createdAt: nowISO(),
      updatedAt: nowISO()
    };
    this.authSessions.set(session.id, session);

    const child = spawn(binary.resolvedPath, ["auth", "login", "--provider", provider], {
      cwd: this.paths.root,
      windowsHide: true,
      env: {
        ...process.env,
        FOURCLAW_NO_BROWSER: "1"
      }
    });

    return new Promise((resolve, reject) => {
      let settled = false;

      const maybeResolvePending = () => {
        const parsed = this.parseBrowserOAuthOutput(`${session.stdout}\n${session.stderr}`);
        if (!session.deviceUrl && parsed.deviceUrl) {
          session.deviceUrl = parsed.deviceUrl;
        }
        if (!settled && session.deviceUrl) {
          this.updateAuthSession(session, { status: "pending" });
          settled = true;
          resolve(this.serializeAuthSession(session));
        }
      };

      child.stdout.on("data", (chunk) => {
        session.stdout += String(chunk);
        maybeResolvePending();
      });

      child.stderr.on("data", (chunk) => {
        session.stderr += String(chunk);
        maybeResolvePending();
      });

      child.on("error", (error) => {
        this.updateAuthSession(session, {
          status: "error",
          error: error.message || String(error)
        });
        this.scheduleAuthSessionCleanup(session.id);
        if (!settled) {
          settled = true;
          reject(error);
        }
      });

      child.on("close", (code) => {
        if (code === 0) {
          this.updateAuthSession(session, { status: "success" });
          this.scheduleAuthSessionCleanup(session.id);
          if (!settled) {
            settled = true;
            resolve(this.serializeAuthSession(session));
          }
          return;
        }

        const message = (session.stderr || session.stdout || `4claw exited with code ${code}`).trim();
        this.updateAuthSession(session, {
          status: "error",
          error: message
        });
        this.scheduleAuthSessionCleanup(session.id);
        if (!settled) {
          settled = true;
          reject(new Error(message));
        }
      });

      setTimeout(() => {
        maybeResolvePending();
        if (!settled && !session.deviceUrl) {
          const message = "Unable to read OAuth login URL from 4claw output.";
          this.updateAuthSession(session, {
            status: "error",
            error: message
          });
          this.scheduleAuthSessionCleanup(session.id);
          settled = true;
          try {
            child.kill("SIGTERM");
          } catch {}
          reject(new Error(message));
        }
      }, 5000);
    });
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
      throw new Error("default-config.json was not found. Check assets/default-config.json");
    }
    return JSON.parse(stripUtf8Bom(fs.readFileSync(configPath, "utf8")));
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
        startedAt: isRunning ? processInfo.startedAt : null,
        watchdog: this.watchdogState.get(id) || null
      }
    };
  }

  resolveAgentWorkspacePath(id) {
    const agent = this.getAgent(id);
    if (!agent) {
      throw new Error(`Agent ${id} does not exist`);
    }
    return agent.workspacePath;
  }

  resolveSessionStorageDir(id) {
    return path.join(this.resolveAgentWorkspacePath(id), "sessions");
  }

  appendAgentLog(id, line) {
    const agent = this.getAgent(id);
    if (!agent) {
      return;
    }
    fs.mkdirSync(path.dirname(agent.logPath), { recursive: true });
    fs.appendFileSync(agent.logPath, `[${nowISO()}] ${line}\n`, "utf8");
  }

  getChatWorker(id) {
    return this.chatWorkers.get(String(id || "").trim()) || null;
  }

  normalizeInteractiveReply(text) {
    return this.extractAgentReply(String(text || "").replace(/\u0000/g, ""));
  }

  isChatWorkerWritable(worker) {
    return Boolean(
      worker &&
        worker.proc &&
        worker.proc.exitCode === null &&
        !worker.proc.killed &&
        worker.proc.stdin &&
        !worker.proc.stdin.destroyed &&
        worker.proc.stdin.writable
    );
  }

  async stopChatWorker(id) {
    const worker = this.getChatWorker(id);
    if (!worker) {
      return false;
    }

    this.chatWorkers.delete(id);

    await new Promise((resolve) => {
      let done = false;
      const finish = () => {
        if (!done) {
          done = true;
          resolve();
        }
      };

      try {
        worker.proc.removeAllListeners("exit");
        worker.proc.once("exit", finish);
        if (process.platform === "win32") {
          const killer = spawn("taskkill", ["/PID", String(worker.proc.pid), "/T", "/F"], { windowsHide: true });
          killer.once("exit", () => setTimeout(finish, 120));
          killer.once("error", () => {
            try {
              worker.proc.kill("SIGTERM");
            } catch {}
            setTimeout(finish, 500);
          });
        } else {
          worker.proc.kill("SIGTERM");
          setTimeout(() => {
            try {
              worker.proc.kill("SIGKILL");
            } catch {}
          }, 1200);
          setTimeout(finish, 1800);
        }
      } catch {
        finish();
      }

      setTimeout(finish, 2500);
    });

    return true;
  }

  async startChatWorker(id, sessionKey = "") {
    const agent = this.getAgent(id);
    if (!agent) {
      throw new Error(`Agent ${id} does not exist`);
    }
    if (!agent.status?.running) {
      throw new Error("Agent must be running before chat is available");
    }

    const resolvedSessionKey = String(sessionKey || createChatSessionKey(id)).trim() || createChatSessionKey(id);
    const existing = this.getChatWorker(id);
    if (existing && existing.sessionKey === resolvedSessionKey && existing.ready && !existing.proc.killed) {
      return existing;
    }
    if (existing) {
      await this.stopChatWorker(id);
    }

    const binary = this.resolveBinaryPath();
    if (!binary.found) {
      throw new Error(`4claw executable not found: ${binary.binaryName}`);
    }

    const child = spawn(
      binary.resolvedPath,
      ["agent", "--config", agent.configPath, "--session", resolvedSessionKey, "--pipe-mode"],
      {
        cwd: agent.dir,
        windowsHide: true
      }
    );

    const worker = {
      id,
      sessionKey: resolvedSessionKey,
      proc: child,
      ready: false,
      startupBuffer: "",
      responseBuffer: "",
      pending: null,
      startedAt: nowISO()
    };
    this.chatWorkers.set(id, worker);
    this.appendAgentLog(id, `[CHAT] worker starting pid=${child.pid} session=${resolvedSessionKey}`);

    const promptToken = "4C You:";

    const flushPendingFromBuffer = () => {
      if (!worker.pending) {
        return;
      }
      const promptIndex = worker.responseBuffer.lastIndexOf(promptToken);
      if (promptIndex === -1) {
        return;
      }
      const raw = worker.responseBuffer.slice(0, promptIndex);
      worker.responseBuffer = worker.responseBuffer.slice(promptIndex + promptToken.length);
      const pending = worker.pending;
      worker.pending = null;
      if (pending.timer) {
        clearTimeout(pending.timer);
      }
      pending.resolve(this.normalizeInteractiveReply(raw));
    };

    child.stdout.on("data", (chunk) => {
      const text = String(chunk || "").replace(/\r/g, "");
      if (!text) {
        return;
      }
      this.appendAgentLog(id, `[CHAT-STDOUT] ${text.trimEnd()}`);

      if (!worker.ready) {
        worker.startupBuffer += text;
        if (worker.startupBuffer.includes(promptToken)) {
          worker.ready = true;
          if (worker.readyResolver) {
            worker.readyResolver(worker);
            worker.readyResolver = null;
          }
          worker.startupBuffer = "";
        }
        return;
      }

      worker.responseBuffer += text;
      flushPendingFromBuffer();
    });

    child.stderr.on("data", (chunk) => {
      const text = String(chunk || "").replace(/\r/g, "").trimEnd();
      if (text) {
        this.appendAgentLog(id, `[CHAT-STDERR] ${text}`);
      }
    });

    child.on("error", (error) => {
      this.appendAgentLog(id, `[CHAT-ERROR] ${error.message}`);
      if (worker.pending) {
        const pending = worker.pending;
        worker.pending = null;
        if (pending.timer) {
          clearTimeout(pending.timer);
        }
        pending.reject(error);
      }
      if (worker.readyResolver) {
        worker.readyRejecter(error);
        worker.readyResolver = null;
        worker.readyRejecter = null;
      }
      this.chatWorkers.delete(id);
    });

    child.on("close", (code, signal) => {
      this.appendAgentLog(id, `[CHAT] worker exited code=${code} signal=${signal || "none"}`);
      if (worker.pending) {
        const pending = worker.pending;
        worker.pending = null;
        if (pending.timer) {
          clearTimeout(pending.timer);
        }
        pending.reject(new Error(`Chat worker exited with code ${code}`));
      }
      if (worker.readyResolver) {
        worker.readyRejecter(new Error(`Chat worker exited with code ${code}`));
        worker.readyResolver = null;
        worker.readyRejecter = null;
      }
      this.chatWorkers.delete(id);
    });

    return await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (worker.ready) {
          resolve(worker);
          return;
        }
        this.stopChatWorker(id).catch(() => {});
        reject(new Error("Timed out while starting chat worker"));
      }, 15000);

      worker.readyResolver = (readyWorker) => {
        clearTimeout(timer);
        resolve(readyWorker);
      };
      worker.readyRejecter = (error) => {
        clearTimeout(timer);
        reject(error);
      };
    });
  }

  getChatSession(id, sessionKey = "") {
    const agent = this.getAgent(id);
    if (!agent) {
      throw new Error(`Agent ${id} does not exist`);
    }
    const resolvedSessionKey = String(sessionKey || createChatSessionKey(id)).trim() || createChatSessionKey(id);
    const sessionPath = path.join(this.resolveSessionStorageDir(id), `${sanitizeSessionFileName(resolvedSessionKey)}.json`);
    const payload = readJson(sessionPath, null);
    const messages = Array.isArray(payload?.messages)
      ? payload.messages
          .filter((item) => item && typeof item === "object")
          .map((item) => ({
            role: String(item.role || "").trim() || "assistant",
            content: String(item.content || ""),
            toolCalls: Array.isArray(item.tool_calls) ? item.tool_calls : []
          }))
      : [];

    return {
      agentId: id,
      sessionKey: resolvedSessionKey,
      filePath: sessionPath,
      exists: fs.existsSync(sessionPath),
      summary: String(payload?.summary || ""),
      updatedAt: String(payload?.updated || payload?.created || ""),
      messages,
      workerReady: Boolean(this.getChatWorker(id)?.ready),
      workerSessionKey: String(this.getChatWorker(id)?.sessionKey || "")
    };
  }

  async createChatSession(id) {
    const agent = this.getAgent(id);
    if (!agent) {
      throw new Error(`Agent ${id} does not exist`);
    }
    if (!agent.status?.running) {
      throw new Error("Start the agent first. Chat is unavailable while the agent is stopped.");
    }
    const sessionKey = `agent:main:desktop:${id}:${Date.now()}`;
    await this.startChatWorker(id, sessionKey);
    return this.getChatSession(id, sessionKey);
  }

  async sendChatMessage(id, sessionKey, message) {
    const agent = this.getAgent(id);
    if (!agent) {
      throw new Error(`Agent ${id} does not exist`);
    }
    if (!agent.status?.running) {
      throw new Error("Start the agent first. Chat is unavailable while the agent is stopped.");
    }

    const content = String(message || "").trim();
    if (!content) {
      throw new Error("Message is required");
    }

    const resolvedSessionKey = String(sessionKey || createChatSessionKey(id)).trim() || createChatSessionKey(id);
    let lastError = null;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const worker = await this.startChatWorker(id, resolvedSessionKey);
      if (worker.pending) {
        throw new Error("Chat worker is busy processing another message");
      }
      if (!this.isChatWorkerWritable(worker)) {
        await this.stopChatWorker(id);
        lastError = new Error("Chat worker is not writable");
        continue;
      }

      try {
        const reply = await new Promise((resolve, reject) => {
          const timer = setTimeout(() => {
            if (worker.pending && worker.pending.reject === reject) {
              worker.pending = null;
            }
            cleanup();
            reject(new Error("Chat worker timed out while waiting for a reply"));
          }, 20 * 60 * 1000);

          const handleStreamError = (error) => {
            cleanup();
            if (worker.pending && worker.pending.reject === reject) {
              worker.pending = null;
            }
            reject(error);
          };

          const cleanup = () => {
            clearTimeout(timer);
            worker.proc.stdin?.removeListener("error", handleStreamError);
          };

          worker.pending = {
            timer,
            resolve: (value) => {
              cleanup();
              resolve(value);
            },
            reject: (error) => {
              cleanup();
              reject(error);
            }
          };
          worker.responseBuffer = "";
          worker.proc.stdin.once("error", handleStreamError);

          try {
            worker.proc.stdin.write(`${content}\n`);
          } catch (error) {
            cleanup();
            worker.pending = null;
            reject(error);
          }
        });

        const session = this.getChatSession(id, resolvedSessionKey);
        return {
          agentId: id,
          sessionKey: resolvedSessionKey,
          reply,
          stdout: "",
          stderr: "",
          session
        };
      } catch (error) {
        lastError = error;
        if (attempt === 0) {
          this.appendAgentLog(id, `[CHAT] worker write failed, restarting: ${error.message}`);
          await this.stopChatWorker(id).catch(() => {});
          continue;
        }
      }
    }

    throw lastError || new Error("Chat worker failed to send message");
  }

  extractAgentReply(stdout) {
    const text = String(stdout || "").replace(/\r/g, "").trim();
    if (!text) {
      return "";
    }
    if (text.startsWith("4C ")) {
      return text.slice(3).trim();
    }
    const lines = text.split("\n").map((line) => line.trimEnd()).filter(Boolean);
    if (!lines.length) {
      return "";
    }
    if (lines[0].startsWith("4C ")) {
      lines[0] = lines[0].slice(3);
    }
    return lines.join("\n").trim();
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
      throw new Error(`Agent ${id} does not exist`);
    }
    const meta = agent.meta;
    meta.name = String(name || "").trim() || id;
    meta.updatedAt = nowISO();
    writeJson(path.join(agent.dir, "meta.json"), meta);
    return this.getAgent(id);
  }

  async stopAgent(id, options = {}) {
    const preserveDesired = Boolean(options && options.preserveDesired);
    this.stoppingAgents.add(id);
    if (!preserveDesired) {
      this.desiredRunning.delete(id);
      this.watchdogState.delete(id);
    }

    try {
      await this.stopChatWorker(id);

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
    } finally {
      this.stoppingAgents.delete(id);
    }
  }

  startAgent(id) {
    const existing = this.running.get(id);
    if (existing) {
      this.desiredRunning.add(id);
      return this.getAgent(id);
    }

    const agent = this.getAgent(id);
    if (!agent) {
      throw new Error(`Agent ${id} does not exist`);
    }

    if (!fs.existsSync(agent.configPath)) {
      throw new Error("config.json does not exist");
    }

    const normalized = this.normalizeConfigForAgent(agent, readJson(agent.configPath, {}));
    writeJson(agent.configPath, normalized.config);

    const binary = this.resolveBinaryPath();
    if (!binary.found) {
      throw new Error(
        `4claw executable was not found. Place it in ${path.join(process.cwd(), "resources", "bin", binary.binaryName)}`
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
    this.desiredRunning.add(id);

    const metaPath = path.join(agent.dir, "meta.json");
    const meta = readJson(metaPath, agent.meta);
    meta.updatedAt = nowISO();
    meta.lastStartedAt = nowISO();
    writeJson(metaPath, meta);

    child.on("close", async () => {
      try {
        await this.stopChatWorker(id);
      } catch {}
    });

    return this.startChatWorker(id, createChatSessionKey(id))
      .then(() => this.getAgent(id))
      .catch(async (error) => {
        this.appendAgentLog(id, `[CHAT] worker start failed: ${error.message}`);
        await this.stopAgent(id);
        throw error;
      });
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
      throw new Error(`Agent ${id} does not exist`);
    }
    const cfg = readJson(agent.configPath);
    if (!cfg) {
      throw new Error("config.json failed to load or is invalid");
    }
    const normalized = this.normalizeConfigForAgent(agent, cfg);
    if (normalized.changed) {
      writeJson(agent.configPath, normalized.config);
    }
    return normalized.config;
  }

  normalizeConfigForAgent(agent, data) {
    const cfg =
      data && typeof data === "object" && !Array.isArray(data) ? JSON.parse(JSON.stringify(data)) : {};
    let changed = false;

    if (!cfg.agents || typeof cfg.agents !== "object") {
      cfg.agents = {};
      changed = true;
    }
    if (!cfg.agents.defaults || typeof cfg.agents.defaults !== "object") {
      cfg.agents.defaults = {};
      changed = true;
    }
    if (cfg.agents.defaults.workspace !== agent.workspacePath) {
      cfg.agents.defaults.workspace = agent.workspacePath;
      changed = true;
    }

    if (!cfg.gateway || typeof cfg.gateway !== "object") {
      cfg.gateway = {};
      changed = true;
    }

    const otherPorts = this.usedPortsExcept(agent.id);
    const current = readJson(agent.configPath, {});
    const currentPort =
      current && current.gateway && Number.isInteger(current.gateway.port) && !otherPorts.has(current.gateway.port)
        ? current.gateway.port
        : null;
    if (!Number.isInteger(cfg.gateway.port) || otherPorts.has(cfg.gateway.port)) {
      cfg.gateway.port = currentPort || this.nextPort();
      changed = true;
    }

    return { config: cfg, changed };
  }

  saveConfig(id, data) {
    const agent = this.getAgent(id);
    if (!agent) {
      throw new Error(`Agent ${id} does not exist`);
    }
    const normalized = this.normalizeConfigForAgent(agent, data);
    writeJson(agent.configPath, normalized.config);
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

    const cfg = this.normalizeConfigForAgent(agent, incoming).config;

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
      throw new Error(`Agent ${id} does not exist`);
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
      throw new Error(`Agent ${id} does not exist`);
    }
    fs.mkdirSync(path.dirname(agent.logPath), { recursive: true });
    fs.writeFileSync(agent.logPath, "", "utf8");
    return true;
  }

  createBackup(id, destinationPath = "") {
    const agent = this.getAgent(id);
    if (!agent) {
      throw new Error(`Agent ${id} does not exist`);
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
  isAgentBackupDir(dir) {
    if (!dir || !fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
      return false;
    }
    return fs.existsSync(path.join(dir, "config.json"));
  }

  findBackupAgentDir(rootDir) {
    if (this.isAgentBackupDir(rootDir)) {
      return rootDir;
    }

    const queue = [rootDir];
    const visited = new Set();
    while (queue.length > 0) {
      const current = queue.shift();
      if (!current || visited.has(current) || !fs.existsSync(current)) {
        continue;
      }
      visited.add(current);

      const entries = fs.readdirSync(current, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) {
          continue;
        }
        const fullPath = path.join(current, entry.name);
        if (this.isAgentBackupDir(fullPath)) {
          return fullPath;
        }
        queue.push(fullPath);
      }
    }

    return "";
  }

  importBackup(backupPath, preferredName = "") {
    if (!fs.existsSync(backupPath)) {
      throw new Error("Backup file does not exist");
    }

    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "4claw-import-"));
    try {
      const zip = new AdmZip(backupPath);
      zip.extractAllTo(tempRoot, true);

      const srcDir = this.findBackupAgentDir(tempRoot);
      if (!srcDir) {
        throw new Error("Backup archive is invalid: unable to find config.json in extracted content");
      }

      const sourceId = path.basename(srcDir);
      const newId = this.normalizeAgentId(preferredName || sourceId || "imported-agent");
      const destDir = path.join(this.paths.agentsDir, newId);
      fs.cpSync(srcDir, destDir, { recursive: true, force: true });
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

      const importedAgent = this.getAgent(newId);
      if (!importedAgent) {
        throw new Error(`Imported agent ${newId} could not be initialized`);
      }

      const configPath = path.join(destDir, "config.json");
      const cfg = this.normalizeConfigForAgent(importedAgent, readJson(configPath, this.loadTemplateConfig())).config;
      writeJson(configPath, cfg);
      fs.appendFileSync(
        path.join(destDir, "logs", "runtime.log"),
        `[${nowISO()}] [SYSTEM] Backup imported from ${backupPath}\n`,
        "utf8"
      );

      return this.getAgent(newId);
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  }

  restoreFromLocalBackup(fileName, preferredName = "") {
    const backupPath = path.join(this.paths.backupsDir, fileName);
    return this.importBackup(backupPath, preferredName);
  }
}

module.exports = { AgentService, fileTimestamp, platformBinaryName };
