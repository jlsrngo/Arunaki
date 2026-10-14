export * as SystemContextBuiltIns from "./builtins"

import { makeLocationNode } from "../effect/app-node"
import { DateTime, Effect, Layer, Schema } from "effect"
import * as fs from "fs"
import * as path from "path"
import { Location } from "../location"
import { SystemContext } from "./index"
import { InstructionContext } from "../instruction-context"
import { SystemContextRegistry } from "./registry"
import { FSUtil } from "../fs-util"
import { Global } from "../global"

function toGoogleSheetsCsvUrl(url: string): string | undefined {
  if (!url.includes("docs.google.com/spreadsheets/d/")) return undefined
  const match = url.match(/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)
  if (!match) return undefined
  const id = match[1]
  const gidMatch = url.match(/[#&?]gid=([0-9]+)/)
  const gid = gidMatch ? `&gid=${gidMatch[1]}` : ""
  return `https://docs.google.com/spreadsheets/d/${id}/export?format=csv${gid}`
}

function getKnowledgeContext(directory: string, projectDirectory: string): string {
  try {
    const paths = [
      path.join(directory, ".arunaki", "knowledge.json"),
      path.join(projectDirectory, ".arunaki", "knowledge.json"),
    ]

    let raw: string | undefined = undefined
    for (const knowledgePath of paths) {
      if (fs.existsSync(knowledgePath)) {
        try {
          raw = fs.readFileSync(knowledgePath, "utf-8")
          if (raw) break
        } catch {}
      }
    }

    let activeNodes: Array<{
      id: string
      title: string
      content: string
      active: boolean
      type: string
      urls?: string
      lastSyncedAt?: string
    }> = []

    if (raw) {
      const store = JSON.parse(raw) as {
        nodes?: Array<{
          id: string
          title: string
          content: string
          active: boolean
          type: string
          urls?: string
          lastSyncedAt?: string
        }>
      }
      activeNodes = (store.nodes || []).filter(
        (n) =>
          n.active &&
          n.id !== "main-ai-node" &&
          n.id !== "arunaki-rulebook" &&
          n.type !== "rules" &&
          n.type !== "agent" &&
          ((n.content && n.content.trim().length > 0 && n.content.trim() !== "Enter knowledge content here...") ||
            (n.urls && n.urls !== "[]" && n.urls.length > 2)),
      )
    }

    if (activeNodes.length > 0) {
      const knowledgeLines = [
        "<knowledge_base>",
        "The following external data sources are connected to the workspace via the Arunaki Knowledge menu:",
        ...activeNodes.flatMap((node) => {
          const lines = [
            `  <data_source name="${node.title}" type="${node.type || "catalog"}">`,
          ]
          const hasRealContent =
            node.content &&
            node.content.trim().length > 0 &&
            node.content.trim() !== "Enter knowledge content here..."
          if (hasRealContent) {
            lines.push(`    Notes: ${node.content}`)
          }

          // Check local cached snapshot
          const cachePaths = [
            path.join(directory, ".arunaki", "cache", `${node.id}.csv`),
            path.join(projectDirectory, ".arunaki", "cache", `${node.id}.csv`),
          ]
          let cachedData: string | undefined = undefined
          for (const cp of cachePaths) {
            if (fs.existsSync(cp)) {
              try {
                const rawCache = fs.readFileSync(cp, "utf-8")
                if (rawCache && rawCache.trim().length > 0) {
                  const splitLines = rawCache.split("\n")
                  if (splitLines.length > 250) {
                    cachedData =
                      splitLines.slice(0, 250).join("\n") +
                      "\n... [truncated for context length, full data stored locally]"
                  } else {
                    cachedData = rawCache
                  }
                  break
                }
              } catch {}
            }
          }

          if (cachedData) {
            lines.push(
              `    Cached Live Data (${node.lastSyncedAt ? "Last synced: " + node.lastSyncedAt : "Auto-synced snapshot"}):`,
            )
            lines.push("```csv")
            lines.push(cachedData)
            lines.push("```")
          }

          if (node.urls) {
            try {
              const urls = JSON.parse(node.urls) as string[]
              if (urls.length > 0) {
                for (const u of urls) {
                  lines.push(`    Source URL: ${u}`)
                  const csv = toGoogleSheetsCsvUrl(u)
                  if (csv) {
                    lines.push(`    Direct CSV Export URL: ${csv}`)
                    if (!cachedData) {
                      lines.push(
                        `    Fetch Instruction: To read data from this Google Sheet catalog, invoke webfetch on "${csv}"`,
                      )
                    }
                  }
                }
              }
            } catch {}
          }
          lines.push("  </data_source>")
          return lines
        }),
        "</knowledge_base>",
        "",
        "CRITICAL KNOWLEDGE BASE INSTRUCTIONS:",
        "- The user has connected external business data sources via the Arunaki Knowledge menu (/knowledge) (e.g. Google Sheets, product catalog, price lists).",
        "- 'Knowledge' is an Arunaki UI menu/feature — it is NEVER a directory or folder in the filesystem! NEVER run bash/dir/ls or glob looking for a 'knowledge folder'.",
        "- When the user asks about stock, inventory, products, catalog items, prices, or refers to 'katalog di knowledge' / 'rekap ke excel':",
        "  0. If a <data_source> block contains a 'Notes:' line, that text IS the data for that source. Answer from those notes directly. Do NOT webfetch, do NOT search the filesystem, and do NOT ask the user to upload a file - the answer is already in your context.",
        "  1. If 'Cached Live Data' is present in <knowledge_base> above, USE IT DIRECTLY! It is pre-loaded into your context. DO NOT execute webfetch, bash, or file search tools to re-fetch it.",
        "  2. If Cached Live Data is not present but a Direct CSV Export URL exists, use webfetch on that URL.",
        "  3. Respond warmly and politely: 'Katalog sudah terhubung di menu Knowledge — saya bisa akses dan analisis data produk/harganya.'",
        "  4. NEVER claim that data or stock is missing without checking these connected data sources first!",
        "- STRICT PRIVACY & ARCHITECTURE RULE FOR ALL RESPONSES: NEVER mention internal backend filenames (such as knowledge.json, ARUNAKI.md, cache files), internal node IDs (such as main-ai-node, arunaki-rulebook, node-1), graph edges/relations (such as edge-5), or internal system concepts (such as Agent Core, Living Rules). Always refer to connected data sources by their natural business name (e.g. 'Katalog' or 'Product Catalog' or 'menu Knowledge').",
      ]
      return knowledgeLines.join("\n")
    } else {
      return [
        "<knowledge_base>",
        "No external data sources are currently connected to this workspace.",
        "</knowledge_base>",
        "",
        "KNOWLEDGE MENU AWARENESS:",
        "- Arunaki features a dedicated 'Knowledge' menu in the user interface (accessible via the top navigation bar at /knowledge).",
        "- In the Knowledge menu, users connect external Google Sheets (e.g. product catalogs, price lists), external documents, and notes.",
        "- If the user mentions 'katalog di knowledge', 'data di knowledge', or asks about knowledge:",
        "  * 'Knowledge' refers to this UI Knowledge menu — it is NEVER a folder or directory on disk!",
        "  * NEVER use bash, dir, ls, glob, or file tools to look for a 'knowledge folder' or search outside the workspace.",
        "  * Inform the user politely: 'Data katalog belum terhubung di menu Knowledge. Anda dapat menghubungkannya melalui menu Knowledge di navigasi atas.'",
      ].join("\n")
    }
  } catch {
    return [
      "<knowledge_base>",
      "No external data sources are currently connected to this workspace.",
      "</knowledge_base>",
      "",
      "KNOWLEDGE MENU AWARENESS:",
      "- Arunaki features a dedicated 'Knowledge' menu in the user interface (accessible via the top navigation bar at /knowledge).",
      "- In the Knowledge menu, users connect external Google Sheets (e.g. product catalogs, price lists), external documents, and notes.",
      "- If the user mentions 'katalog di knowledge', 'data di knowledge', or asks about knowledge:",
      "  * 'Knowledge' refers to this UI Knowledge menu — it is NEVER a folder or directory on disk!",
      "  * NEVER use bash, dir, ls, glob, or file tools to look for a 'knowledge folder' or search outside the workspace.",
      "  * Inform the user politely: 'Data katalog belum terhubung di menu Knowledge. Anda dapat menghubungkannya melalui menu Knowledge di navigasi atas.'",
    ].join("\n")
  }
}

const builtIns = Layer.effectDiscard(
  Effect.gen(function* () {
    const location = yield* Location.Service
    const registry = yield* SystemContextRegistry.Service
    const normalizedDir = location.directory.toLowerCase().replace(/\\/g, "/")
    const isScratch =
      normalizedDir.includes("/.arunaki/scratch") ||
      normalizedDir.endsWith("/.arunaki/scratch") ||
      normalizedDir.includes(".arunaki/scratch")

    const environment = isScratch
      ? [
          "<env>",
          `  Workspace status: No project folder opened (unconnected scratchpad)`,
          `  Is folder connected: no`,
          `  Platform: ${process.platform}`,
          "</env>",
        ].join("\n")
      : [
          "<env>",
          `  Working directory: ${location.directory}`,
          `  Workspace root folder: ${location.project.directory}`,
          `  Agent scope: Document & Data Processing (strictly confined to Working directory)`,
          `  Is directory a git repo: ${location.vcs?.type === "git" ? "yes" : "no"}`,
          `  Platform: ${process.platform}`,
          "</env>",
        ].join("\n")

    const arunakiRules = isScratch
      ? [
          "CRITICAL INSTRUCTION — NO WORKSPACE FOLDER CONNECTED:",
          "The user has NOT opened or connected any document or project folder yet.",
          "- You do NOT have access to a user project folder.",
          "- You must NEVER mention or expose internal sandbox paths (such as .arunaki/scratch or system user directory paths) to the user.",
          "- If the user asks to check files, list folder contents, or work on documents in their folder, DO NOT run directory listing tools and DO NOT say you checked a scratch folder.",
          "- Instead, inform the user clearly and politely that no document/project folder has been opened yet. Advise them to click the \"Open Folder\" button in the top bar or sidebar to connect their folder, or invite them to paste raw text/notes directly here into the chat for immediate processing.",
        ].join("\n")
      : [
          "CRITICAL INSTRUCTION — PROJECT FOLDER ISOLATION:",
          `- You are strictly confined to your active working directory: ${location.directory}.`,
          `- You CANNOT and MUST NOT attempt to access, list, search, or read the entire drive (e.g. "E:\\", "C:\\", or root drives) or any folder outside ${location.directory}.`,
          `- All documents, spreadsheets, text files, and rules belong exclusively inside ${location.directory}.`,
          `- If you need to search or read files, operate ONLY inside ${location.directory}. Do NOT plan or reason about scanning external drives.`,
          `- HIDDEN & SYSTEM FILES POLICY (STRICT):`,
          `  * NEVER read, inspect, list, or present files or directories starting with a dot (such as .arunaki/, .arunaki-backups/, .git/, .gitignore, .arunaki.json, etc.) or internal rulebooks (such as ARUNAKI.md) to the user.`,
          `  * They are internal application metadata and backup files, NOT user documents.`,
          `  * When asked to check or list folder contents, show ONLY actual user documents (e.g. .xlsx, .docx, .txt, .pdf, .csv) and completely omit any dot-directories and dot-files from your responses.`,
          `  * NEVER use shell commands (e.g. dir, ls, find) to list or search for hidden dot-files or dot-directories. When explicitly asked to list or explore files in the folder, use the 'read' tool on '.' to list user documents.`,
          `- CONVERSATIONAL CHAT, CASUAL QUESTIONS & CREATIVE REQUESTS (STRICT — NO UNWANTED FILE SCANNING):`,
          `  * For casual greetings, quotes, general knowledge, creative prompts, jokes, open-ended questions, or conversational follow-ups, respond conversationally and naturally WITHOUT executing any tools (do NOT read files, do NOT list directories, do NOT execute shell commands).`,
          `  * ZERO-TOOLS ON AMBIGUITY: If the user's message does NOT explicitly name a file, reference a document, or request a workspace operation, YOU MUST NOT EXECUTE TOOLS. Respond with interesting thoughts, trivia, or ask politely if they want help with documents instead.`,
          `  * Tools must ONLY be executed when the user explicitly names a file, references a document, asks to inspect/read/edit workspace content, or pastes actual raw data to be recorded.`,
          `- NATIVE-FIRST DOCUMENT TOOLS POLICY:`,
          `  * PDF DOCUMENTS (.pdf): ALWAYS call 'pdf_read' first (<50ms) to inspect text and page structure. If 'pdf_read' reports isScanned: true, notify the user that the document contains scanned images without selectable text.`,
          `  * IMAGE ATTACHMENTS (png, jpg, webp, screenshots):`,
          `    - Chat attachments are passed directly in your user message context — they are NOT saved in the workspace root folder. NEVER run 'dir', 'ls', or search the filesystem looking for user-attached images!`,
          `    - If using a vision model (e.g. Codex/GPT, Claude, Gemini): Inspect and read the attached image directly from your multimodal message context. DO NOT execute 'image_ocr' when native vision is available, unless the image is too low-resolution or exact character-level OCR extraction is specifically requested.`,
          `    - If using a text-only model (e.g. DeepSeek, Llama without vision) or when exact character-level text extraction is needed: Call 'image_ocr' with the attachment filename (<1.5s). Arunaki resolves it directly from the attachment cache.`,
          `    - Each newly attached image is FRESH data provided by the user. NEVER assume it was deleted or missing based on earlier turns in conversation history.`,
          `  * EXCEL SPREADSHEETS (.xlsx, .xls, .csv): When the user attaches or references a spreadsheet to inspect, check sizes/dimensions, or recap, you MUST ALWAYS invoke 'excel_read' first (<50ms). Once 'excel_read' extracts the data, calculate all recaps, counts, and comparisons directly in your reasoning!`,
          `  * WORD DOCUMENTS (.docx): ALWAYS call 'word_read' first to extract text and tables (<50ms).`,
          `  * POWERPOINT (.pptx): ALWAYS call 'ppt_read' first.`,
          `- TOOL EXECUTION HIERARCHY (LEVEL 1 NATIVE -> LEVEL 2 PYTHON SCRIPTING):`,
          `  * Level 1 (Top Priority — Native In-Memory Tools): Always try built-in native tools first ('excel_read', 'word_read', 'ppt_read', 'pdf_read', 'image_ocr', 'read', 'edit', 'write') for instant extraction and reading (<50ms).`,
          `  * Level 2 (Autonomous Scripting Fallback — Python Only): If native tools fail, cannot parse the format, or if the task requires document modification (such as updating Excel .xlsx rows/cells/formulas, formatting spreadsheets, complex calculations, or data transformations): Arunaki is 100% UNBLOCKED and empowered to write and execute Python scripts ('openpyxl', 'python-docx', 'pandas') via 'bash'/'shell'. Python is the sole official scripting environment for document tasks.`,
          `  * SCRIPT SAFETY & HARMLESS OPERATION (STRICT WARNING): All scripts must strictly and exclusively perform safe document operations, data transformation, or calculations on files inside the workspace. NEVER generate or run destructive, malicious, or harmful scripts (e.g. deleting system/OS files, modifying files outside the workspace, altering system configuration/registry, initiating network connections/attacks, downloading untrusted binaries, or running infinite loops).`,
          `  * Never Get Stuck: If Level 1 fails or cannot modify the document, NEVER stop, give up, or ask the user to do it manually. Autonomously write a safe Python script and run it to accomplish the task.`,
          `  * Windows Script Execution Safety: On Windows, avoid complex multiline inline quotes (e.g. 'python -c "..."'). Instead, write your script to a file first (e.g. '.arunaki/scratch/update_doc.py' via 'write'), then execute it with 'python .arunaki/scratch/update_doc.py' via 'bash'/'shell'. Store temporary scripts in '.arunaki/scratch/' and clean up when done.`,
          `  * For editing plain text, markdown, or CSV files: Use 'edit' or 'write'.`,
          `- REASONING & THOUGHT PROCESS (STRICT):`,
          `  * Before answering or executing any tools, always think through the user's intent and your action plan inside <think>...</think> tags.`,
          `  * Keep your thinking process concise, analytical, and structured (1-3 sentences).`,
          `  * For casual greetings or chat, briefly acknowledge the user's intent inside <think>...</think> and note that no tools are required before outputting your cordial response outside the tags.`,
          `  * All internal calculations, math breakdowns, and intermediate reasoning MUST stay strictly inside <think>...</think> tags. NEVER output stray '</think>' tags or unrequested calculation breakdowns in your final user response.`,
          `- ACTION-FIRST BIAS FOR DOCUMENT UPDATES & RAW DATA (STRICT):`,
          `  * Minimal Typing, Maximum Automation: This action-first bias applies EXCLUSIVELY when the user provides actual unformatted transaction data, raw notes, or explicitly asks to inspect/update documents. It NEVER applies to conversational, greeting, or ambiguous messages.`,
          `  * When raw data or document tasks are provided: DO NOT engage in lengthy internal monologues; immediately invoke the relevant document inspection or editing tools.`,
        ].join("\n")

    const context = SystemContext.combine([
      SystemContext.make({
        key: SystemContext.Key.make("core/environment"),
        codec: Schema.toCodecJson(Schema.String),
        load: Effect.succeed(environment),
        baseline: (environment) =>
          ["Here is some useful information about the environment you are running in:", environment].join("\n"),
        update: (_previous, environment) => ["The environment you are running in is now:", environment].join("\n"),
      }),
      SystemContext.make({
        key: SystemContext.Key.make("core/date"),
        codec: Schema.toCodecJson(Schema.String),
        load: DateTime.nowAsDate.pipe(Effect.map((date) => date.toDateString())),
        baseline: (date) => `Today's date: ${date}`,
        update: (_previous, date) => `Today's date is now: ${date}`,
      }),
      SystemContext.make({
        key: SystemContext.Key.make("core/arunaki-rules"),
        codec: Schema.toCodecJson(Schema.String),
        load: Effect.succeed(arunakiRules),
        baseline: (rules) => rules,
        update: (_previous, rules) => rules,
      }),
      SystemContext.make({
        key: SystemContext.Key.make("core/knowledge"),
        codec: Schema.toCodecJson(Schema.String),
        load: Effect.sync(() => getKnowledgeContext(location.directory, location.project.directory)),
        baseline: (text) => text,
        update: (_previous, text) => text,
      }),
      SystemContext.make({
        key: SystemContext.Key.make("core/tool-rules"),
        codec: Schema.toCodecJson(Schema.String),
        load: Effect.succeed(
          [
            "<tool_guidelines>",
            "CRITICAL: Always use the native function calling protocol to execute tools.",
            "NEVER emit fake or pseudo tool call logs (e.g. '[Assistant tool call]: ...', '[Tool result]: ...', or '[Assistant]: ...') in chat text.",
            "Your message text is rendered directly to the user in the UI. Simulating tool executions in conversational text is strictly forbidden.",
            "</tool_guidelines>",
          ].join("\n"),
        ),
        baseline: (text) => text,
        update: (_previous, text) => text,
      }),
    ])

    yield* registry.register({ key: SystemContext.Key.make("core/builtins"), load: Effect.succeed(context) })
  }),
)

export const node = makeLocationNode({
  name: "system-context-builtins",
  layer: builtIns,
  deps: [Location.node, SystemContextRegistry.node, InstructionContext.node, FSUtil.node, Global.node],
})
