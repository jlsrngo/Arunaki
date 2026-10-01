import { describe, expect, test } from "bun:test";
import path from "path";
import fs from "fs/promises";
import os from "os";
import {
  isSenderAllowed,
  splitTelegramMessage,
  telegramService,
  normalizeFolderPath,
  extractAssistantReply,
  TELEGRAM_BOT_COMMANDS,
  isBareFileMention,
  enrichPromptWithFileMentions,
} from "../../src/messaging/telegram";

describe("Telegram BYOB Gateway", () => {
  describe("isSenderAllowed (Whitelist Check)", () => {
    test("rejects when whitelist is empty or whitespace", () => {
      expect(isSenderAllowed("", "123456")).toBe(false);
      expect(isSenderAllowed("   ", "123456")).toBe(false);
      expect(isSenderAllowed("", "123456", "myuser")).toBe(false);
    });

    test("allows anyone when wildcard * is used", () => {
      expect(isSenderAllowed("*", "999999")).toBe(true);
      expect(isSenderAllowed("*", "123456", "random_user")).toBe(true);
    });

    test("matches numeric telegram user ID", () => {
      const whitelist = "123456789, 987654321";
      expect(isSenderAllowed(whitelist, "123456789")).toBe(true);
      expect(isSenderAllowed(whitelist, "987654321")).toBe(true);
      expect(isSenderAllowed(whitelist, "555555555")).toBe(false);
    });

    test("matches username with or without @ symbol (case-insensitive)", () => {
      const whitelist = "123456789, @juliosiringo, admin_user";
      expect(isSenderAllowed(whitelist, "000", "juliosiringo")).toBe(true);
      expect(isSenderAllowed(whitelist, "000", "@juliosiringo")).toBe(true);
      expect(isSenderAllowed(whitelist, "000", "JulioSiringo")).toBe(true);
      expect(isSenderAllowed(whitelist, "000", "Admin_User")).toBe(true);
      expect(isSenderAllowed(whitelist, "000", "hacker")).toBe(false);
    });
  });

  describe("splitTelegramMessage", () => {
    test("returns single element if message fits within limit", () => {
      const short = "Hello Arunaki! Rekap excel berhasil.";
      expect(splitTelegramMessage(short, 4000)).toEqual([short]);
    });

    test("splits message into chunks respecting double newlines", () => {
      const para1 = "Paragraph 1: " + "a".repeat(100);
      const para2 = "Paragraph 2: " + "b".repeat(100);
      const text = `${para1}\n\n${para2}`;

      const chunks = splitTelegramMessage(text, 150);
      expect(chunks.length).toBe(2);
      expect(chunks[0]).toBe(para1);
      expect(chunks[1]).toBe(para2);
    });

    test("handles empty string gracefully", () => {
      expect(splitTelegramMessage("", 4000)).toEqual([]);
    });
  });

  describe("TelegramService instance", () => {
    test("provides singleton instance with initial disconnected status", () => {
      const instance = telegramService;
      expect(instance).toBeDefined();

      const status = instance.getStatus();
      expect(status.telegram).toBeDefined();
      expect(status.telegram.connected).toBe(false);
    });

    test("returns default config when no config exists", async () => {
      const config = await telegramService.getConfig();
      expect(config.telegram).toBeDefined();
      expect(typeof config.telegram.enabled).toBe("boolean");
      expect(typeof config.telegram.botToken).toBe("string");
      expect(typeof config.telegram.allowedUserId).toBe("string");
    });
  });

  describe("normalizeFolderPath", () => {
    test("normalizes Windows backslashes and double backslashes", () => {
      expect(normalizeFolderPath("E:\\\\REKAPAN")).toBe("E:/REKAPAN");
      expect(normalizeFolderPath("E:\\REKAPAN\\")).toBe("E:/REKAPAN");
      expect(normalizeFolderPath("E:/REKAPAN//")).toBe("E:/REKAPAN");
      expect(normalizeFolderPath("")).toBe("");
    });
  });

  describe("extractAssistantReply", () => {
    test("extracts text from content array", () => {
      const msg = {
        content: [
          { type: "reasoning", text: "Thinking..." },
          { type: "text", text: "Halo! Ada yang bisa saya bantu?" },
        ],
      };
      expect(extractAssistantReply(msg)).toBe("Halo! Ada yang bisa saya bantu?");
    });

    test("extracts text from legacy parts array", () => {
      const msg = {
        parts: [
          { type: "text", text: "Rekap berhasil diselesaikan." },
        ],
      };
      expect(extractAssistantReply(msg)).toBe("Rekap berhasil diselesaikan.");
    });

    test("returns empty string if only tools were executed without text (to wait for final LLM synthesis)", () => {
      const msg = {
        content: [
          {
            type: "tool",
            name: "edit_file",
            state: { input: { path: "ORDER.txt" } },
          },
        ],
      };
      expect(extractAssistantReply(msg)).toBe("");
    });

    test("handles empty or malformed message safely", () => {
      expect(extractAssistantReply(null)).toBe("");
      expect(extractAssistantReply({})).toBe("");
    });
  });

  describe("TELEGRAM_BOT_COMMANDS", () => {
    test("contains essential workflow commands", () => {
      const cmdNames = TELEGRAM_BOT_COMMANDS.map((c) => c.command);
      expect(cmdNames).toContain("files");
      expect(cmdNames).toContain("rekap");
      expect(cmdNames).toContain("status");
      expect(cmdNames).toContain("new");
      expect(cmdNames).toContain("help");
    });
  });

  describe("isBareFileMention", () => {
    const files = ["ORDER.txt", "REKAP 9-2026.xlsx", "LAPORAN-HARIAN.txt"];

    test("detects bare @ORDER.txt without instructions", () => {
      expect(isBareFileMention("@ORDER.txt", files)).toBe("ORDER.txt");
      expect(isBareFileMention("@order.txt", files)).toBe("ORDER.txt");
    });

    test("detects bare quoted filename @'REKAP 9-2026.xlsx'", () => {
      expect(isBareFileMention('@"REKAP 9-2026.xlsx"', files)).toBe("REKAP 9-2026.xlsx");
    });

    test("detects plain filename without @ if sent alone", () => {
      expect(isBareFileMention("ORDER.txt", files)).toBe("ORDER.txt");
    });

    test("detects single-letter prefix @o when it uniquely matches ORDER.txt", () => {
      expect(isBareFileMention("@o", files)).toBe("ORDER.txt");
    });

    test("detects numeric shorthand #1 or @1", () => {
      expect(isBareFileMention("#1", files)).toBe("ORDER.txt");
      expect(isBareFileMention("@2", files)).toBe("REKAP 9-2026.xlsx");
    });

    test("returns null when accompanying instructions are present", () => {
      expect(isBareFileMention("@ORDER.txt tolong masukkan ke excel", files)).toBeNull();
      expect(isBareFileMention("rekap data ini ke @REKAP 9-2026.xlsx", files)).toBeNull();
      expect(isBareFileMention("@o tolong masukkan ke excel", files)).toBeNull();
    });

    test("returns null when no matching file in workspace", () => {
      expect(isBareFileMention("@UNKNOWN.txt", files)).toBeNull();
      expect(isBareFileMention("halo apa kabar", files)).toBeNull();
    });
  });

  describe("enrichPromptWithFileMentions", () => {
    test("enriches prompt with file context when file exists in directory", async () => {
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "arunaki-test-"));
      try {
        await fs.writeFile(path.join(tempDir, "ORDER.txt"), "Order ID: 123", "utf-8");
        await fs.writeFile(path.join(tempDir, "REKAP.xlsx"), "data", "utf-8");

        const prompt = "@ORDER.txt tolong masukkan data pembeli ini ke rekap excel";
        const result = await enrichPromptWithFileMentions(prompt, tempDir);

        expect(result.detectedFiles).toContain("ORDER.txt");
        expect(result.enrichedPrompt).toContain("[Dokumen Terlampir / Di-mention Pengguna]:");
        expect(result.enrichedPrompt).toContain("ORDER.txt");
        expect(result.enrichedPrompt).toContain("[Instruksi dan Peran Dokumen dari Pengguna]:");
        expect(result.enrichedPrompt).toContain("tolong masukkan data pembeli ini ke rekap excel");
      } finally {
        await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
      }
    });

    test("enriches prompt when user uses single-letter prefix @o or shorthand #1", async () => {
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "arunaki-test-"));
      try {
        await fs.writeFile(path.join(tempDir, "ORDER.txt"), "Order ID: 123", "utf-8");
        await fs.writeFile(path.join(tempDir, "REKAP.xlsx"), "data", "utf-8");

        // Test single letter prefix @o
        const promptPrefix = "@o tolong masukkan data ini ke excel";
        const resultPrefix = await enrichPromptWithFileMentions(promptPrefix, tempDir);
        expect(resultPrefix.detectedFiles).toContain("ORDER.txt");
        expect(resultPrefix.enrichedPrompt).toContain("ORDER.txt");

        // Test numeric shorthand #1
        const promptNumeric = "#1 rekap ke excel";
        const resultNumeric = await enrichPromptWithFileMentions(promptNumeric, tempDir);
        expect(resultNumeric.detectedFiles).toContain("ORDER.txt");
      } finally {
        await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
      }
    });

    test("leaves prompt intact if no matching files mentioned", async () => {
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "arunaki-test-"));
      try {
        const prompt = "halo arunaki apa kabar";
        const result = await enrichPromptWithFileMentions(prompt, tempDir);

        expect(result.detectedFiles).toEqual([]);
        expect(result.enrichedPrompt).toBe(prompt);
      } finally {
        await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
      }
    });

    test("provides deleteWebhook method that handles invalid or empty tokens gracefully", async () => {
      const resEmpty = await telegramService.deleteWebhook("");
      expect(resEmpty).toBe(false);

      const resWhitespace = await telegramService.deleteWebhook("   ");
      expect(resWhitespace).toBe(false);
    });
  });
});

