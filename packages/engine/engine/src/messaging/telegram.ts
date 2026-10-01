import path from "path";
import fs from "fs/promises";
import { Global } from "@arunaki/core/global";
import { ServerAuth } from "../server/auth";

export interface TelegramConfig {
  enabled: boolean;
  botToken: string;
  allowedUserId: string; // comma-separated user IDs or @usernames, or "*"
  targetFolder?: string; // folder where Arunaki executes document operations
}

export interface MessagingConfig {
  telegram: TelegramConfig;
}

export interface TelegramStatus {
  connected: boolean;
  botUsername?: string | null;
  botFirstName?: string | null;
  lastActive?: number | null;
  lastError?: string | null;
}

export interface MessagingStatus {
  telegram: TelegramStatus;
}

export interface TestResult {
  success: boolean;
  botUsername?: string;
  botFirstName?: string;
  error?: string;
}

const DEFAULT_CONFIG: MessagingConfig = {
  telegram: {
    enabled: false,
    botToken: "",
    allowedUserId: "",
    targetFolder: "",
  },
};

/**
 * Checks whether an incoming sender is permitted based on the configured whitelist.
 */
export function isSenderAllowed(whitelist: string, senderId: string, senderUsername?: string): boolean {
  if (!whitelist) return false;
  const trimmed = whitelist.trim();
  if (trimmed === "*") return true;
  if (!trimmed) return false;

  const allowedItems = trimmed
    .split(",")
    .map((item) => item.trim().toLowerCase().replace(/^@/, ""))
    .filter(Boolean);

  const cleanSenderId = senderId.trim().toLowerCase();
  const cleanUsername = senderUsername ? senderUsername.trim().toLowerCase().replace(/^@/, "") : "";

  return allowedItems.includes(cleanSenderId) || (cleanUsername !== "" && allowedItems.includes(cleanUsername));
}

/**
 * Splits a long text message into safe chunks for Telegram (max 4096 chars, default 4000 chars).
 */
export function splitTelegramMessage(text: string, maxLength = 4000): string[] {
  if (!text) return [];
  if (text.length <= maxLength) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      chunks.push(remaining);
      break;
    }

    let splitIndex = remaining.lastIndexOf("\n\n", maxLength);
    if (splitIndex === -1 || splitIndex < maxLength / 2) {
      splitIndex = remaining.lastIndexOf("\n", maxLength);
    }
    if (splitIndex === -1 || splitIndex < maxLength / 2) {
      splitIndex = remaining.lastIndexOf(" ", maxLength);
    }
    if (splitIndex === -1 || splitIndex === 0) {
      splitIndex = maxLength;
    }

    chunks.push(remaining.slice(0, splitIndex).trim());
    remaining = remaining.slice(splitIndex).trim();
  }

  return chunks.filter(Boolean);
}

export function normalizeFolderPath(dir: string): string {
  if (!dir) return "";
  let normalized = path.normalize(dir).replace(/\\/g, "/");
  normalized = normalized.replace(/\/+/g, "/");
  if (normalized.length > 3 && normalized.endsWith("/")) {
    normalized = normalized.slice(0, -1);
  }
  return normalized;
}

/**
 * Robustly extracts assistant response text from engine message.
 * Returns only genuine LLM text response. Never returns raw tool names or dummy progress strings.
 */
export function extractAssistantReply(messageData: any): string {
  if (!messageData) return "";
  const content = messageData.content || messageData.parts || [];
  const texts: string[] = [];

  if (Array.isArray(content)) {
    for (const item of content) {
      if (item && item.type === "text" && item.text && typeof item.text === "string") {
        const t = item.text.trim();
        if (t) texts.push(t);
      }
    }
  } else if (typeof content === "string" && content.trim()) {
    texts.push(content.trim());
  }

  if (typeof messageData.text === "string" && messageData.text.trim()) {
    const raw = messageData.text.trim();
    if (!texts.includes(raw)) {
      texts.push(raw);
    }
  }

  return texts.join("\n\n").trim();
}

export const TELEGRAM_BOT_COMMANDS = [
  { command: "files", description: "Daftar file di folder kerja PC" },
  { command: "rekap", description: "Panduan & format rekap pesanan ke Excel" },
  { command: "status", description: "Cek status Arunaki & target folder" },
  { command: "new", description: "Mulai sesi percakapan baru" },
  { command: "help", description: "Panduan instruksi & contoh format" },
];

/**
 * Detects if the user sent ONLY a file mention (e.g. "@ORDER.txt" or "ORDER.txt")
 * without any accompanying instructions or words.
 */
export function isBareFileMention(text: string, filesInFolder: string[]): string | null {
  if (!text || !Array.isArray(filesInFolder) || filesInFolder.length === 0) return null;
  const trimmed = text.trim();

  // Matches "@filename", "@\"filename\"", or "filename" with no other words
  const match = trimmed.match(/^[@#]?(?:["']([^"'\n\r]+)["']|([^\s"'\n\r]+))$/);
  if (!match) return null;

  const candidate = (match[1] || match[2] || "").trim().toLowerCase();
  if (!candidate) return null;

  // 1. Exact match
  const found = filesInFolder.find((f) => f.toLowerCase() === candidate);
  if (found) return found;

  // 2. Numeric match (e.g. "#1" or "@1" -> 1st file)
  const num = parseInt(candidate, 10);
  if (!isNaN(num) && num >= 1 && num <= filesInFolder.length) {
    return filesInFolder[num - 1];
  }

  // 3. Single-letter / prefix match (e.g. "@o" -> "ORDER.txt")
  const prefixMatches = filesInFolder.filter((f) => f.toLowerCase().startsWith(candidate));
  if (prefixMatches.length === 1) return prefixMatches[0];

  return null;
}

/**
 * Detects @filename mentions or file references in the user's prompt,
 * verifies whether they exist in the target directory, and provides rich context
 * so the LLM engine clearly understands the role and purpose of each attached file.
 */
export async function enrichPromptWithFileMentions(
  promptText: string,
  targetDir: string
): Promise<{ enrichedPrompt: string; detectedFiles: string[] }> {
  if (!promptText || !targetDir) {
    return { enrichedPrompt: promptText, detectedFiles: [] };
  }

  try {
    const entries = await fs.readdir(targetDir, { withFileTypes: true }).catch(() => []);
    if (entries.length === 0) {
      return { enrichedPrompt: promptText, detectedFiles: [] };
    }

    const detected: Array<{ name: string; fullPath: string; isDir: boolean; ext: string }> = [];

    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      const fileName = entry.name;

      // Check if fileName or @fileName or @"fileName" is present in promptText (case-insensitive)
      const atMention = `@${fileName.toLowerCase()}`;
      const atQuoteMention = `@"${fileName.toLowerCase()}"`;
      const lowerPrompt = promptText.toLowerCase();

      let isMatch = lowerPrompt.includes(atMention) || lowerPrompt.includes(atQuoteMention);
      if (!isMatch) {
        // Also check regex word boundary if prompt contains exact filename
        const escaped = fileName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        isMatch = new RegExp("(?:^|\\s|[@\"'`])" + escaped + "(?:$|\\s|[.,!?:;\"'`])", "i").test(promptText);
      }

      if (isMatch) {
        detected.push({
          name: fileName,
          fullPath: path.join(targetDir, fileName).replace(/\\/g, "/"),
          isDir: entry.isDirectory(),
          ext: path.extname(fileName).toLowerCase(),
        });
      }
    }

    // If no exact filename match was detected, check for 1-letter prefix or numeric shorthand (@o, @r, #1, @1)
    if (detected.length === 0) {
      const tokens = Array.from(promptText.matchAll(/[@#]([a-zA-Z0-9_.-]+)/g)).map((m) => m[1].toLowerCase());
      for (const token of tokens) {
        // Numeric index (#1 or @1)
        const num = parseInt(token, 10);
        if (!isNaN(num) && num >= 1 && num <= entries.length) {
          const entry = entries[num - 1];
          if (entry && !detected.some((d) => d.name === entry.name)) {
            detected.push({
              name: entry.name,
              fullPath: path.join(targetDir, entry.name).replace(/\\/g, "/"),
              isDir: entry.isDirectory(),
              ext: path.extname(entry.name).toLowerCase(),
            });
            continue;
          }
        }

        // Prefix match (e.g. token "o" matches "ORDER.txt")
        const prefixMatches = entries.filter((e) => !e.name.startsWith(".") && e.name.toLowerCase().startsWith(token));
        if (prefixMatches.length >= 1) {
          const entry = prefixMatches[0];
          if (!detected.some((d) => d.name === entry.name)) {
            detected.push({
              name: entry.name,
              fullPath: path.join(targetDir, entry.name).replace(/\\/g, "/"),
              isDir: entry.isDirectory(),
              ext: path.extname(entry.name).toLowerCase(),
            });
          }
        }
      }
    }

    if (detected.length === 0) {
      return { enrichedPrompt: promptText, detectedFiles: [] };
    }

    const fileDescriptions = detected.map((f) => {
      const typeDesc = f.isDir
        ? "Direktori/Folder"
        : f.ext === ".xlsx" || f.ext === ".xls"
        ? "Dokumen Spreadsheet Excel"
        : f.ext === ".csv"
        ? "File Data CSV"
        : f.ext === ".docx" || f.ext === ".doc"
        ? "Dokumen Word"
        : f.ext === ".pdf"
        ? "Dokumen PDF"
        : "File Dokumen / Catatan Teks";

      return `- File: "${f.name}" (${typeDesc}, Path: ${f.fullPath})`;
    });

    const fileNamesOnly = detected.map((f) => f.name);

    const enrichedPrompt =
      `[Dokumen Terlampir / Di-mention Pengguna]:\n` +
      `${fileDescriptions.join("\n")}\n\n` +
      `[Instruksi dan Peran Dokumen dari Pengguna]:\n` +
      `${promptText}`;

    return { enrichedPrompt, detectedFiles: fileNamesOnly };
  } catch {
    return { enrichedPrompt: promptText, detectedFiles: [] };
  }
}

export class TelegramService {
  private static instance: TelegramService | null = null;

  private running = false;
  private abortController: AbortController | null = null;
  private chatSessionMap = new Map<number, string>();
  private activeFolderSessionMap = new Map<string, string>();
  private status: TelegramStatus = {
    connected: false,
    botUsername: null,
    botFirstName: null,
    lastActive: null,
    lastError: null,
  };

  private constructor() {}

  public static getInstance(): TelegramService {
    if (!TelegramService.instance) {
      TelegramService.instance = new TelegramService();
    }
    return TelegramService.instance;
  }

  public setActiveSession(directory: string, sessionID: string): void {
    if (!directory || !sessionID) return;
    const clean = normalizeFolderPath(directory);
    this.activeFolderSessionMap.set(clean, sessionID);
  }

  private getConfigFilePath(): string {
    return path.join(Global.Path.data, "messaging.json");
  }

  public async getConfig(): Promise<MessagingConfig> {
    try {
      const filePath = this.getConfigFilePath();
      const content = await fs.readFile(filePath, "utf-8");
      const parsed = JSON.parse(content);
      return {
        telegram: {
          enabled: Boolean(parsed?.telegram?.enabled),
          botToken: String(parsed?.telegram?.botToken || ""),
          allowedUserId: String(parsed?.telegram?.allowedUserId || ""),
          targetFolder: parsed?.telegram?.targetFolder ? normalizeFolderPath(String(parsed.telegram.targetFolder)) : "",
        },
      };
    } catch {
      return DEFAULT_CONFIG;
    }
  }

  public async saveConfig(newConfig: MessagingConfig): Promise<MessagingConfig> {
    const configToSave: MessagingConfig = {
      telegram: {
        enabled: Boolean(newConfig.telegram?.enabled),
        botToken: String(newConfig.telegram?.botToken || "").trim(),
        allowedUserId: String(newConfig.telegram?.allowedUserId || "").trim(),
        targetFolder: newConfig.telegram?.targetFolder ? normalizeFolderPath(String(newConfig.telegram.targetFolder)) : "",
      },
    };

    const filePath = this.getConfigFilePath();
    await fs.writeFile(filePath, JSON.stringify(configToSave, null, 2), "utf-8");

    // Hot reload service loop
    await this.restart();
    return configToSave;
  }

  public getStatus(): MessagingStatus {
    return {
      telegram: {
        connected: Boolean(this.status.connected),
        botUsername: this.status.botUsername ?? null,
        botFirstName: this.status.botFirstName ?? null,
        lastActive: this.status.lastActive ?? null,
        lastError: this.status.lastError ?? null,
      },
    };
  }

  public async testToken(botToken: string): Promise<TestResult> {
    const token = botToken.trim();
    if (!token) {
      return { success: false, error: "Bot token is empty." };
    }

    try {
      const res = await fetch(`https://api.telegram.org/bot${token}/getMe`, {
        signal: AbortSignal.timeout(10000),
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        return {
          success: false,
          error: data.description || `HTTP ${res.status}: Failed to authenticate with Telegram.`,
        };
      }

      return {
        success: true,
        botUsername: data.result?.username,
        botFirstName: data.result?.first_name,
      };
    } catch (err: any) {
      return {
        success: false,
        error: err.message || "Network error while connecting to Telegram API.",
      };
    }
  }

  public async startIfEnabled(): Promise<void> {
    const config = await this.getConfig();
    if (config.telegram.enabled && config.telegram.botToken) {
      await this.start();
    }
  }

  public async start(): Promise<void> {
    if (this.running) return;

    const config = await this.getConfig();
    if (!config.telegram.enabled || !config.telegram.botToken) {
      this.status.connected = false;
      return;
    }

    // Validate bot token
    const test = await this.testToken(config.telegram.botToken);
    if (!test.success) {
      this.status.connected = false;
      this.status.lastError = test.error || "Invalid token";
      return;
    }

    this.running = true;
    this.abortController = new AbortController();
    this.status.connected = true;
    this.status.botUsername = test.botUsername || null;
    this.status.botFirstName = test.botFirstName || null;
    this.status.lastError = null;

    // Clear lingering webhooks so long-polling (getUpdates) works without 409 Conflict
    await this.deleteWebhook(config.telegram.botToken).catch(() => {});

    // Register native Telegram [/ Menu] commands
    await this.registerBotCommands(config.telegram.botToken).catch(() => {});

    // Launch polling loop in background
    this.pollLoop(this.abortController.signal).catch((err) => {
      this.status.connected = false;
      this.status.lastError = err?.message || String(err);
      this.running = false;
    });
  }

  /**
   * Clears any active Telegram webhook so long-polling (getUpdates) can operate seamlessly.
   */
  public async deleteWebhook(botToken: string): Promise<boolean> {
    if (!botToken || !botToken.trim()) return false;
    try {
      const res = await fetch(`https://api.telegram.org/bot${botToken.trim()}/deleteWebhook?drop_pending_updates=false`, {
        method: "POST",
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  /**
   * Registers native Telegram [/ Menu] commands with setMyCommands API.
   * This displays the blue [/ Menu] button in Telegram mobile & desktop.
   */
  public async registerBotCommands(botToken: string): Promise<boolean> {
    try {
      const res = await fetch(`https://api.telegram.org/bot${botToken}/setMyCommands`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commands: TELEGRAM_BOT_COMMANDS }),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  public async stop(): Promise<void> {
    this.running = false;
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    this.status.connected = false;
  }

  public async restart(): Promise<void> {
    await this.stop();
    await this.startIfEnabled();
  }

  private getLocalServerUrl(): string {
    try {
      // Dynamically resolve Server.url if running inside engine
      // oxlint-disable-next-line @typescript-eslint/no-var-requires
      const { url } = require("../server/server");
      if (url) return url.toString().replace(/\/$/, "");
    } catch {}
    return "http://127.0.0.1:4096";
  }

  private async sendTelegramMessage(
    botToken: string,
    chatId: number | string,
    text: string,
    replyToMessageId?: number,
    replyMarkup?: any
  ): Promise<{ ok: boolean; messageId?: number }> {
    try {
      const payload: any = {
        chat_id: chatId,
        text,
        parse_mode: "Markdown",
        ...(replyToMessageId ? { reply_to_message_id: replyToMessageId } : {}),
        ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
      };

      // First attempt with Markdown formatting
      const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const json = await res.json().catch(() => ({}));
        return { ok: true, messageId: json?.result?.message_id };
      }

      // If Markdown parsing fails, fall back to plain text
      delete payload.parse_mode;
      const fallbackRes = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (fallbackRes.ok) {
        const json = await fallbackRes.json().catch(() => ({}));
        return { ok: true, messageId: json?.result?.message_id };
      }

      return { ok: false };
    } catch {
      return { ok: false };
    }
  }

  private async editTelegramMessage(
    botToken: string,
    chatId: number | string,
    messageId: number,
    text: string
  ): Promise<boolean> {
    try {
      const res = await fetch(`https://api.telegram.org/bot${botToken}/editMessageText`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          message_id: messageId,
          text,
          parse_mode: "Markdown",
        }),
      });

      if (res.ok) return true;

      const fallbackRes = await fetch(`https://api.telegram.org/bot${botToken}/editMessageText`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          message_id: messageId,
          text,
        }),
      });

      return fallbackRes.ok;
    } catch {
      return false;
    }
  }

  private async deleteTelegramMessage(
    botToken: string,
    chatId: number | string,
    messageId: number
  ): Promise<boolean> {
    try {
      const res = await fetch(`https://api.telegram.org/bot${botToken}/deleteMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          message_id: messageId,
        }),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  private async sendChatAction(botToken: string, chatId: number | string, action = "typing"): Promise<void> {
    try {
      await fetch(`https://api.telegram.org/bot${botToken}/sendChatAction`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, action }),
      });
    } catch {}
  }

  private async pollLoop(signal: AbortSignal): Promise<void> {
    let offset = 0;

    while (this.running && !signal.aborted) {
      const config = await this.getConfig();
      if (!config.telegram.enabled || !config.telegram.botToken) {
        this.status.connected = false;
        break;
      }

      try {
        const fetchUrl = `https://api.telegram.org/bot${config.telegram.botToken}/getUpdates?offset=${offset}&timeout=25`;
        const res = await fetch(fetchUrl, {
          signal: AbortSignal.any([signal, AbortSignal.timeout(35000)]),
        });

        if (!res.ok) {
          const errText = await res.text().catch(() => "");
          if (res.status === 409 && errText.toLowerCase().includes("webhook")) {
            // Auto-heal: delete lingering webhook and resume polling
            await this.deleteWebhook(config.telegram.botToken).catch(() => {});
            await new Promise((r) => setTimeout(r, 1500));
            continue;
          }

          this.status.connected = false;
          this.status.lastError = `Telegram error: HTTP ${res.status} ${errText}`;
          await new Promise((r) => setTimeout(r, 4000));
          continue;
        }

        const data = await res.json();
        if (!data.ok || !Array.isArray(data.result)) {
          this.status.connected = false;
          this.status.lastError = data.description || "Invalid getUpdates response format.";
          await new Promise((r) => setTimeout(r, 4000));
          continue;
        }

        this.status.connected = true;
        this.status.lastError = null;

        for (const update of data.result) {
          offset = Math.max(offset, update.update_id + 1);

          // Handle Telegram Inline Query (@BotUsername query)
          if (update.inline_query) {
            this.status.lastActive = Date.now();
            await this.handleInlineQuery(config, update.inline_query);
            continue;
          }

          const message = update.message;
          if (!message) continue;

          const text = (message.text || message.caption || "").trim();
          if (!text) continue;

          this.status.lastActive = Date.now();
          await this.handleIncomingMessage(config, message, text);
        }
      } catch (err: any) {
        if (signal.aborted) break;
        this.status.lastError = err?.message || String(err);
        await new Promise((r) => setTimeout(r, 3000));
      }
    }
  }

  /**
   * Handles Telegram Inline Queries (e.g. typing "@BotUsername o").
   * Displays a floating popup menu of matching workspace files directly above the keyboard.
   */
  private async handleInlineQuery(config: MessagingConfig, inlineQuery: any): Promise<void> {
    const queryId = inlineQuery.id;
    const senderId = String(inlineQuery.from?.id ?? "");
    const senderUsername = inlineQuery.from?.username ? String(inlineQuery.from.username).toLowerCase() : "";

    if (!isSenderAllowed(config.telegram.allowedUserId, senderId, senderUsername)) {
      return;
    }

    const queryText = (inlineQuery.query || "").trim().toLowerCase().replace(/^[@#]/, "");
    const rawTargetDir = config.telegram.targetFolder || process.cwd();
    const targetDir = normalizeFolderPath(rawTargetDir);

    try {
      const entries = await fs.readdir(targetDir, { withFileTypes: true }).catch(() => []);
      const validFiles = entries
        .filter((e) => !e.name.startsWith(".") && e.name !== "node_modules")
        .filter((e) => {
          if (!queryText) return true;
          return e.name.toLowerCase().includes(queryText);
        })
        .sort((a, b) => a.name.localeCompare(b.name));

      const results = validFiles.slice(0, 25).map((file, idx) => {
        const isDir = file.isDirectory();
        const ext = path.extname(file.name).toLowerCase();
        let icon = "📄";
        let typeDesc = "Dokumen Teks";
        if (isDir) { icon = "📁"; typeDesc = "Folder"; }
        else if (ext === ".xlsx" || ext === ".xls") { icon = "📊"; typeDesc = "Spreadsheet Excel"; }
        else if (ext === ".csv") { icon = "📊"; typeDesc = "File CSV"; }
        else if (ext === ".docx" || ext === ".doc") { icon = "📝"; typeDesc = "Dokumen Word"; }
        else if (ext === ".pdf") { icon = "📑"; typeDesc = "Dokumen PDF"; }

        return {
          type: "article",
          id: `file_${idx}_${file.name}`,
          title: `${icon} ${file.name}`,
          description: `${typeDesc} • Ketuk untuk pilih file ini`,
          input_message_content: {
            message_text: `@${file.name} `,
          },
        };
      });

      await fetch(`https://api.telegram.org/bot${config.telegram.botToken}/answerInlineQuery`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inline_query_id: queryId,
          results,
          cache_time: 1,
          is_personal: true,
        }),
      });
    } catch (err) {
      console.warn("[TelegramGateway] handleInlineQuery error:", err);
    }
  }

  private async handleIncomingMessage(
    config: MessagingConfig,
    message: any,
    text: string
  ): Promise<void> {
    const senderId = String(message.from?.id ?? "");
    const senderUsername = message.from?.username ? String(message.from.username).toLowerCase() : "";
    const senderName = message.from?.first_name || senderUsername || senderId;
    const chatId = message.chat.id;
    const botToken = config.telegram.botToken;

    // Strip leading @BotUsername if user sent text through inline query or switch_inline_query_current_chat
    const botUser = this.status.botUsername ? this.status.botUsername.toLowerCase() : "";
    let cleanText = text.trim();
    if (botUser && cleanText.toLowerCase().startsWith(`@${botUser}`)) {
      cleanText = cleanText.slice(botUser.length + 1).trim();
    }

    // 1. Whitelist Verification
    const isAllowed = isSenderAllowed(config.telegram.allowedUserId, senderId, senderUsername);
    if (!isAllowed) {
      const unauthorizedMsg =
        `⚠️ *Akses Ditolak / Unauthorized*\n\n` +
        `Telegram User ID Anda: \`${senderId}\`\n` +
        `Username: @${senderUsername || "tidak ada"}\n\n` +
        `Untuk mengizinkan akses kendali ke Arunaki di PC, tambahkan User ID Anda ke:\n` +
        `⚙️ *Arunaki Settings -> Messaging Apps* pada whitelist User ID.`;

      await this.sendTelegramMessage(botToken, chatId, unauthorizedMsg, message.message_id);
      return;
    }

    // 2. Command Handling
    if (cleanText === "/start" || cleanText === "/help") {
      const targetDir = config.telegram.targetFolder || "Default Project Workspace";
      const welcomeMsg =
        `👋 *Halo ${senderName}! Arunaki Gateway siap melayani.*\n\n` +
        `Kirimkan instruksi dokumen, catatan mentah, atau forward pesan WhatsApp ke bot ini. ` +
        `Arunaki di komputer Anda akan otomatis mengeksekusinya langsung di folder proyek aktif.\n\n` +
        `📁 *Target Folder:* \`${targetDir}\`\n\n` +
        `*Menu & Perintah Cepat:*\n` +
        `• Tekan tombol *[/ Menu]* di samping kolom chat untuk akses instan\n` +
        `• \`/files\` — Lihat daftar file & tombol interaktif di folder aktif PC\n` +
        `• \`/rekap\` — Panduan dan format rekap pesanan ke Excel\n` +
        `• \`/status\` — Cek status Arunaki dan folder kerja saat ini\n` +
        `• \`/new\` — Reset / mulai sesi percakapan baru\n` +
        `• \`/help\` — Panduan bantuan`;

      await this.sendTelegramMessage(botToken, chatId, welcomeMsg, message.message_id);
      return;
    }

    if (cleanText === "/new" || cleanText === "/reset") {
      this.chatSessionMap.delete(chatId);
      await this.sendTelegramMessage(
        botToken,
        chatId,
        `🔄 *Sesi baru dimulai.* Silakan kirim instruksi dokumen Anda selanjutnya.`,
        message.message_id
      );
      return;
    }

    if (cleanText === "/status") {
      const rawTargetDir = config.telegram.targetFolder || process.cwd();
      const targetDir = normalizeFolderPath(rawTargetDir);
      const statusMsg =
        `🟢 *Arunaki Gateway Status: Online*\n\n` +
        `💻 *Host:* PC Desktop Aktif\n` +
        `📁 *Target Folder:* \`${targetDir}\`\n` +
        `👤 *Pengguna Terotorisasi:* ${senderName} (\`${senderId}\`)\n` +
        `🤖 *Bot:* @${this.status.botUsername || "connected"}`;

      await this.sendTelegramMessage(botToken, chatId, statusMsg, message.message_id);
      return;
    }

    if (cleanText === "/files" || cleanText === "/file") {
      const rawTargetDir = config.telegram.targetFolder || process.cwd();
      const targetDir = normalizeFolderPath(rawTargetDir);
      try {
        const entries = await fs.readdir(targetDir, { withFileTypes: true }).catch(() => []);
        const validFiles = entries
          .filter((e) => !e.name.startsWith(".") && e.name !== "node_modules")
          .sort((a, b) => {
            if (a.isDirectory() && !b.isDirectory()) return -1;
            if (!a.isDirectory() && b.isDirectory()) return 1;
            return a.name.localeCompare(b.name);
          });

        if (validFiles.length === 0) {
          await this.sendTelegramMessage(
            botToken,
            chatId,
            `📁 *Folder kerja saat ini kosong:*\n\`${targetDir}\`\n\nBelum ada dokumen yang ditemukan.`,
            message.message_id
          );
          return;
        }

        const fileListLines = validFiles.map((file, idx) => {
          const isDir = file.isDirectory();
          const ext = path.extname(file.name).toLowerCase();
          let icon = "📄";
          if (isDir) icon = "📁";
          else if (ext === ".xlsx" || ext === ".xls" || ext === ".csv") icon = "📊";
          else if (ext === ".docx" || ext === ".doc") icon = "📝";
          else if (ext === ".pdf") icon = "📑";

          return `${idx + 1}. ${icon} \`@${file.name}\``;
        });

        const filesMsg =
          `📁 *Daftar File di Folder Aktif:*\n` +
          `\`${targetDir}\`\n\n` +
          `${fileListLines.join("\n")}\n\n` +
          `💡 *Cara Menggunakan:*\n` +
          `• *Klik tombol file di bawah* untuk langsung memasukkan nama file ke kolom chat.\n` +
          `• Atau ketik awalan huruf saja (contoh: \`@o rekap ke excel\` atau \`#1 cek total\`).\n` +
          `• Atau gunakan tombol *🔍 Cari File* untuk memunculkan popup melayang di atas keyboard.`;

        // Create interactive inline buttons
        const inlineKeyboard: any[][] = [
          [
            {
              text: "🔍 Cari File (Popup Melayang)",
              switch_inline_query_current_chat: "",
            },
          ],
        ];

        const row: any[] = [];
        for (const file of validFiles.slice(0, 6)) {
          const isDir = file.isDirectory();
          const ext = path.extname(file.name).toLowerCase();
          let icon = "📄";
          if (isDir) icon = "📁";
          else if (ext === ".xlsx" || ext === ".xls" || ext === ".csv") icon = "📊";
          else if (ext === ".docx" || ext === ".doc") icon = "📝";
          else if (ext === ".pdf") icon = "📑";

          row.push({
            text: `${icon} ${file.name}`,
            switch_inline_query_current_chat: `${file.name} `,
          });

          if (row.length === 2) {
            inlineKeyboard.push([...row]);
            row.length = 0;
          }
        }
        if (row.length > 0) {
          inlineKeyboard.push([...row]);
        }

        const replyMarkup = { inline_keyboard: inlineKeyboard };
        await this.sendTelegramMessage(botToken, chatId, filesMsg, message.message_id, replyMarkup);
        return;
      } catch (err: any) {
        await this.sendTelegramMessage(
          botToken,
          chatId,
          `❌ Gagal membaca isi folder:\n${err?.message || String(err)}`,
          message.message_id
        );
        return;
      }
    }

    if (cleanText === "/rekap") {
      const rekapMsg =
        `📊 *Fitur Rekap Otomatis Arunaki*\n\n` +
        `Untuk merekap data ke Excel, silakan kirim pesan dengan salah satu format berikut:\n\n` +
        `1. *Kirim / Paste Teks Mentah (Paling Cepat)*\n` +
        `   Copy-paste pesan WhatsApp atau catatan pesanan langsung ke chat ini. Arunaki akan otomatis membaca dan memperbarui file Excel Anda.\n\n` +
        `2. *Gunakan Mention File (@namafile / @huruf):*\n` +
        `   • \`@ORDER.txt tolong rekap pesanan baru ke excel\`\n` +
        `   • \`@o tolong rekap ke excel\` (cukup 1 huruf awalan!)\n` +
        `   • \`rekap data berikut ke @REKAP 9-2026.xlsx: [paste catatan]\`\n\n` +
        `3. *Ketik /files* untuk melihat daftar file dokumen dan tombol interaktif.`;

      await this.sendTelegramMessage(botToken, chatId, rekapMsg, message.message_id);
      return;
    }

    // Check if user sent ONLY a bare file mention without any instructions
    const rawTargetDir = config.telegram.targetFolder || process.cwd();
    const targetDir = normalizeFolderPath(rawTargetDir);
    try {
      const dirEntries = await fs.readdir(targetDir, { withFileTypes: true }).catch(() => []);
      const fileNames = dirEntries.map((e) => e.name);
      const bareFile = isBareFileMention(cleanText, fileNames);

      if (bareFile) {
        const guidanceMsg =
          `📄 *File Terdeteksi:* \`${bareFile}\`\n\n` +
          `Silakan sertakan kata-kata instruksi apa yang ingin Arunaki lakukan terhadap file ini agar AI paham fungsinya.\n\n` +
          `*Ketik pesan seperti ini:*\n` +
          `• \`@${bareFile} tolong rekap data pesanan ini ke excel\`\n` +
          `• \`@${bareFile} baca dan tampilkan ringkasan isinya\`\n` +
          `• \`@${bareFile} masukkan data pembeli berikut: [paste catatan]\``;

        await this.sendTelegramMessage(botToken, chatId, guidanceMsg, message.message_id);
        return;
      }
    } catch {}

    // 3. Document / Chat Instruction Execution
    await this.sendChatAction(botToken, chatId, "typing");

    // Continuous typing indicator interval while Arunaki processes
    const typingInterval = setInterval(() => {
      this.sendChatAction(botToken, chatId, "typing");
    }, 4000);

    // Send transient thinking status message (just like OpenClaw 2.0)
    let thinkingMsgId: number | undefined;
    const initialStatus = await this.sendTelegramMessage(
      botToken,
      chatId,
      "💭 *Thinking...*",
      message.message_id
    );
    if (initialStatus.ok && initialStatus.messageId) {
      thinkingMsgId = initialStatus.messageId;
    }

    try {
      const onProgress = async (statusText: string) => {
        if (thinkingMsgId) {
          await this.editTelegramMessage(botToken, chatId, thinkingMsgId, statusText);
        }
      };

      // Enrich prompt if files are mentioned with instructions
      const { enrichedPrompt } = await enrichPromptWithFileMentions(cleanText, targetDir);

      const reply = await this.executeArunakiPrompt(config, chatId, enrichedPrompt, senderName, onProgress, cleanText);
      clearInterval(typingInterval);

      // Clean up the transient thinking message so it disappears after finished
      if (thinkingMsgId) {
        await this.deleteTelegramMessage(botToken, chatId, thinkingMsgId).catch(() => {});
      }

      // Split and send chunks if response exceeds Telegram max message length
      const chunks = splitTelegramMessage(reply);
      for (let i = 0; i < chunks.length; i++) {
        await this.sendTelegramMessage(
          botToken,
          chatId,
          chunks[i],
          i === 0 ? message.message_id : undefined
        );
      }
    } catch (err: any) {
      clearInterval(typingInterval);
      if (thinkingMsgId) {
        await this.deleteTelegramMessage(botToken, chatId, thinkingMsgId).catch(() => {});
      }
      await this.sendTelegramMessage(
        botToken,
        chatId,
        `❌ *Gagal memproses permintaan:*\n${err?.message || String(err)}`,
        message.message_id
      );
    }
  }

  private async executeArunakiPrompt(
    config: MessagingConfig,
    chatId: number,
    promptText: string,
    senderName: string,
    onProgress?: (text: string) => Promise<void>,
    displayPrompt?: string
  ): Promise<string> {
    const serverUrl = this.getLocalServerUrl();
    const rawTargetDir = config.telegram.targetFolder || process.cwd();
    const targetDir = normalizeFolderPath(rawTargetDir);
    const authHeaders = ServerAuth.headers() || {};

    // 1. Session Discovery: Prefer active desktop workstation session for this folder
    let sessionID = this.activeFolderSessionMap.get(targetDir);

    if (!sessionID) {
      sessionID = this.chatSessionMap.get(chatId);
    }

    // Verify cached session is still active and valid in the engine
    if (sessionID) {
      try {
        const checkRes = await fetch(`${serverUrl}/api/session/${sessionID}?directory=${encodeURIComponent(targetDir)}`, {
          headers: { "x-arunaki-directory": targetDir, ...authHeaders },
        });
        if (!checkRes.ok) {
          sessionID = undefined;
          this.chatSessionMap.delete(chatId);
        }
      } catch {
        sessionID = undefined;
        this.chatSessionMap.delete(chatId);
      }
    }

    // If still no session, connect to the most recently active session of targetDir
    if (!sessionID) {
      try {
        const listRes = await fetch(`${serverUrl}/api/session?directory=${encodeURIComponent(targetDir)}&limit=1`, {
          headers: { "x-arunaki-directory": targetDir, ...authHeaders },
        });
        if (listRes.ok) {
          const listJson = await listRes.json();
          const sessions = listJson?.data || listJson;
          if (Array.isArray(sessions) && sessions.length > 0 && sessions[0]?.id) {
            sessionID = sessions[0].id;
            this.chatSessionMap.set(chatId, sessionID);
          }
        }
      } catch (err) {
        console.warn("[TelegramGateway] Could not check existing sessions:", err);
      }
    }

    // If still no session exists (brand new project folder), create a new one
    if (!sessionID) {
      const titlePrompt = displayPrompt || promptText;
      const snippet = titlePrompt.length > 30 ? titlePrompt.slice(0, 30) + "..." : titlePrompt;
      const createRes = await fetch(`${serverUrl}/api/session?directory=${encodeURIComponent(targetDir)}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-arunaki-directory": targetDir,
          ...authHeaders,
        },
        body: JSON.stringify({
          title: `Telegram (${senderName}): ${snippet}`,
          location: { directory: targetDir },
        }),
      });

      if (!createRes.ok) {
        const errText = await createRes.text().catch(() => "");
        throw new Error(`Failed to create Arunaki session: ${createRes.status} ${errText}`);
      }

      const sessionJson = await createRes.json();
      sessionID = sessionJson?.data?.id || sessionJson?.id;
      if (sessionID) {
        this.chatSessionMap.set(chatId, sessionID);
      } else {
        throw new Error("Invalid session response from Arunaki engine.");
      }
    }

    // 2. Send prompt to session (engine route is POST /api/session/:sessionID/prompt)
    const promptStartTime = Date.now();
    let promptRes = await fetch(
      `${serverUrl}/api/session/${sessionID}/prompt?directory=${encodeURIComponent(targetDir)}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-arunaki-directory": targetDir,
          ...authHeaders,
        },
        body: JSON.stringify({
          prompt: { text: promptText },
        }),
      }
    );

    // If session was invalid / 404, retry once with a brand new session
    if (promptRes.status === 404) {
      this.chatSessionMap.delete(chatId);
      this.activeFolderSessionMap.delete(targetDir);
      return this.executeArunakiPrompt(config, chatId, promptText, senderName, onProgress, displayPrompt);
    }

    if (!promptRes.ok) {
      const errBody = await promptRes.text().catch(() => "");
      throw new Error(`Session execution error: ${promptRes.status} ${errBody}`);
    }

    // 3. Poll for Assistant Reply
    // Arunaki executes document agent loops asynchronously. Wait up to 240 seconds for completion.
    let reply = "";
    const pollIntervalMs = 1200;
    let maxPollAttempts = 200; // ~240 seconds default
    let typingTick = 0;
    let hasSeenSessionActive = false;
    let idleTicks = 0;
    let lastProgressText = "";
    let lastProgressEditTime = 0;

    for (let attempt = 0; attempt < maxPollAttempts; attempt++) {
      await new Promise((r) => setTimeout(r, pollIntervalMs));
      typingTick++;
      if (typingTick % 2 === 0) {
        this.sendChatAction(config.telegram.botToken, chatId, "typing").catch(() => {});
      }

      try {
        // 1. Check if the engine session is actively executing in the agent loop
        let isSessionBusy = false;
        try {
          const activeRes = await fetch(`${serverUrl}/api/session/active`, {
            headers: authHeaders,
          });
          if (activeRes.ok) {
            const activeJson = await activeRes.json();
            const activeMap = activeJson?.data || activeJson || {};
            isSessionBusy = Boolean(activeMap[sessionID]);
            if (isSessionBusy) {
              hasSeenSessionActive = true;
              idleTicks = 0;
              // If still actively running tools as timeout nears, extend timeout dynamically up to 350 cycles
              if (attempt >= maxPollAttempts - 10 && maxPollAttempts < 350) {
                maxPollAttempts += 15;
              }
            } else {
              idleTicks++;
            }
          }
        } catch {}

        // 2. Fetch recent messages
        const msgsRes = await fetch(
          `${serverUrl}/api/session/${sessionID}/message?limit=10&directory=${encodeURIComponent(targetDir)}`,
          {
            headers: { "x-arunaki-directory": targetDir, ...authHeaders },
          }
        );
        if (!msgsRes.ok) continue;

        const msgsJson = await msgsRes.json();
        const msgs: any[] = msgsJson?.data || msgsJson;
        if (!Array.isArray(msgs) || msgs.length === 0) continue;

        // Stream live progress to transient Telegram message
        if (onProgress && msgs.length > 0) {
          const newest = msgs[0];
          let progressText = "";
          if (newest && (newest.role === "assistant" || newest.type === "assistant")) {
            const content = newest.content || newest.parts || [];
            if (Array.isArray(content)) {
              const toolPart = content.find((c: any) => c && (c.type === "tool" || c.name));
              const reasoningPart = content.find((c: any) => c && (c.type === "reasoning" || c.type === "thought"));

              if (toolPart) {
                const toolName = toolPart.name || toolPart.tool || "action";
                const path =
                  toolPart.state?.input?.path ||
                  toolPart.input?.path ||
                  toolPart.state?.input?.TargetFile ||
                  toolPart.state?.input?.file ||
                  "";
                const cleanFile = path ? String(path).replace(/\\/g, "/").split("/").pop() : "";
                progressText = cleanFile
                  ? `⚡ *Executing:* \`${toolName}\` on \`${cleanFile}\`...`
                  : `⚡ *Executing:* \`${toolName}\`...`;
              } else if (reasoningPart && typeof reasoningPart.text === "string" && reasoningPart.text.trim()) {
                const snippet = reasoningPart.text.trim().slice(0, 140).replace(/\n/g, " ");
                progressText = `💭 *Thinking...*\n\n_${snippet}..._`;
              }
            }
          }
          if (progressText && progressText !== lastProgressText && Date.now() - lastProgressEditTime > 2500) {
            lastProgressText = progressText;
            lastProgressEditTime = Date.now();
            onProgress(progressText).catch(() => {});
          }
        }

        // Find assistant messages created after our prompt
        const turnAssistantMsgs = msgs.filter((m) => {
          if (!m) return false;
          const role = m.role || m.type;
          if (role !== "assistant") return false;
          const timeCreated = Number(m.time?.created ?? m.time_created ?? m.time?.start ?? 0);
          return timeCreated >= promptStartTime - 3000;
        });

        // Extract assistant text
        const assistantTexts: string[] = [];
        for (const asstMsg of turnAssistantMsgs) {
          const t = extractAssistantReply(asstMsg);
          if (t && !assistantTexts.includes(t)) {
            assistantTexts.push(t);
          }
        }

        // If turnAssistantMsgs is empty due to clock skew, check newest message
        if (assistantTexts.length === 0 && msgs.length > 0) {
          const newest = msgs[0];
          if (newest && (newest.role === "assistant" || newest.type === "assistant")) {
            const t = extractAssistantReply(newest);
            if (t) assistantTexts.push(t);
          }
        }

        const combinedText = assistantTexts.join("\n\n").trim();
        const newest = msgs[0];
        const isStopFinished =
          newest &&
          (newest.role === "assistant" || newest.type === "assistant") &&
          newest.finish === "stop";

        // ONLY finalize when we actually have the LLM text answer AND execution has finished!
        if (combinedText.length > 0) {
          if (isStopFinished || (!isSessionBusy && idleTicks >= 3 && newest?.finish !== "tool-calls")) {
            reply = combinedText;
            break;
          }
        } else if (hasSeenSessionActive && !isSessionBusy && idleTicks >= 4 && attempt > 5) {
          // Session was active and finished, check one more time if text appeared
          if (combinedText.length > 0) {
            reply = combinedText;
            break;
          }
        }
      } catch (err) {
        console.warn("[TelegramGateway] Polling error:", err);
      }
    }

    // Auto-update generic session title to clean snippet if needed
    try {
      const snippet = promptText.length > 35 ? promptText.slice(0, 35) + "..." : promptText;
      fetch(`${serverUrl}/api/session/${sessionID}?directory=${encodeURIComponent(targetDir)}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-arunaki-directory": targetDir,
          ...authHeaders,
        },
        body: JSON.stringify({ title: `Telegram: ${snippet}` }),
      }).catch(() => {});
    } catch {}

    // Final safety check: if reply is still empty, inspect the newest messages from session
    if (!reply) {
      try {
        const lastCheckRes = await fetch(
          `${serverUrl}/api/session/${sessionID}/message?limit=5&directory=${encodeURIComponent(targetDir)}`,
          { headers: { "x-arunaki-directory": targetDir, ...authHeaders } }
        );
        if (lastCheckRes.ok) {
          const lastJson = await lastCheckRes.json();
          const lastMsgs: any[] = lastJson?.data || lastJson;
          for (const m of lastMsgs) {
            const role = m.role || m.type;
            if (role === "assistant") {
              const t = extractAssistantReply(m);
              if (t) {
                reply = t;
                break;
              }
            }
          }
        }
      } catch {}
    }

    if (!reply) {
      reply = "Permintaan telah selesai diproses oleh Arunaki.";
    }

    return reply;
  }
}

export const telegramService = TelegramService.getInstance();
