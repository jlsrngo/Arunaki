import { describe, expect } from "bun:test"
import { Effect, Layer } from "effect"
import * as TestClock from "effect/testing/TestClock"
import { AppNodeBuilder } from "@arunaki/core/effect/app-node-builder"
import { LayerNode } from "@arunaki/core/effect/layer-node"
import { Location } from "@arunaki/core/location"
import { FSUtil } from "@arunaki/core/fs-util"
import { Global } from "@arunaki/core/global"
import { AbsolutePath } from "@arunaki/core/schema"
import { SystemContext } from "@arunaki/core/system-context"
import { SystemContextBuiltIns } from "@arunaki/core/system-context/builtins"
import { SystemContextRegistry } from "@arunaki/core/system-context/registry"
import { location } from "../fixture/location"
import { testEffect } from "../lib/effect"

const directory = AbsolutePath.make(FSUtil.resolve("/repo/packages/core"))
const projectDirectory = AbsolutePath.make(FSUtil.resolve("/repo"))
const instructionFile = FSUtil.resolve("/repo/AGENTS.md")
const timestamp = Date.parse("2026-06-03T12:00:00.000Z")
const localDate = (time: number) => new Date(time).toDateString()
const locationLayer = Layer.succeed(
  Location.Service,
  Location.Service.of(
    location(
      { directory },
      { projectDirectory, vcs: { type: "git", store: AbsolutePath.make(FSUtil.resolve("/repo/.git")) } },
    ),
  ),
)
const builtInsNode = LayerNode.group([SystemContextBuiltIns.node, SystemContextRegistry.node])
const it = testEffect(
  AppNodeBuilder.build(builtInsNode, [
    [Location.node, locationLayer],
    [Global.node, Global.layerWith({ config: "/global" })],
  ]),
)
const instructionFS = Layer.effect(
  FSUtil.Service,
  FSUtil.Service.pipe(
    Effect.map((fs) =>
      FSUtil.Service.of({
        ...fs,
        up: () => Effect.succeed([instructionFile]),
        readFileStringSafe: (path) => Effect.succeed(path === instructionFile ? "Be precise." : undefined),
      }),
    ),
  ),
).pipe(Layer.provide(LayerNode.compile(FSUtil.node)))
const itWithInstructions = testEffect(
  AppNodeBuilder.build(builtInsNode, [
    [Location.node, locationLayer],
    [FSUtil.node, instructionFS],
    [Global.node, Global.layerWith({ config: "/global" })],
  ]),
)

const expectedRules = (dir: string) =>
  [
    "CRITICAL INSTRUCTION — PROJECT FOLDER ISOLATION:",
    `- You are strictly confined to your active working directory: ${dir}.`,
    `- You CANNOT and MUST NOT attempt to access, list, search, or read the entire drive (e.g. "E:\\", "C:\\", or root drives) or any folder outside ${dir}.`,
    `- All documents, spreadsheets, text files, and rules belong exclusively inside ${dir}.`,
    `- If you need to search or read files, operate ONLY inside ${dir}. Do NOT plan or reason about scanning external drives.`,
    "- HIDDEN & SYSTEM FILES POLICY (STRICT):",
    "  * NEVER read, inspect, list, or present files or directories starting with a dot (such as .arunaki/, .arunaki-backups/, .git/, .gitignore, .arunaki.json, etc.) or internal rulebooks (such as ARUNAKI.md) to the user.",
    "  * They are internal application metadata and backup files, NOT user documents.",
    "  * When asked to check or list folder contents, show ONLY actual user documents (e.g. .xlsx, .docx, .txt, .pdf, .csv) and completely omit any dot-directories and dot-files from your responses.",
    "  * NEVER use shell commands (e.g. dir, ls, find) to list or search for hidden dot-files or dot-directories. When explicitly asked to list or explore files in the folder, use the 'read' tool on '.' to list user documents.",
    "- CONVERSATIONAL CHAT, CASUAL QUESTIONS & CREATIVE REQUESTS (STRICT — NO UNWANTED FILE SCANNING):",
    "  * For casual greetings, quotes, general knowledge, creative prompts, jokes, open-ended questions, or conversational follow-ups, respond conversationally and naturally WITHOUT executing any tools (do NOT read files, do NOT list directories, do NOT execute shell commands).",
    "  * ZERO-TOOLS ON AMBIGUITY: If the user's message does NOT explicitly name a file, reference a document, or request a workspace operation, YOU MUST NOT EXECUTE TOOLS. Respond with interesting thoughts, trivia, or ask politely if they want help with documents instead.",
    "  * Tools must ONLY be executed when the user explicitly names a file, references a document, asks to inspect/read/edit workspace content, or pastes actual raw data to be recorded.",
    "- NATIVE-FIRST DOCUMENT TOOLS POLICY:",
    "  * PDF DOCUMENTS (.pdf): ALWAYS call 'pdf_read' first (<50ms) to inspect text and page structure. If 'pdf_read' reports isScanned: true, notify the user that the document contains scanned images without selectable text.",
    "  * IMAGE ATTACHMENTS (png, jpg, webp, screenshots):",
    "    - Chat attachments are passed directly in your user message context — they are NOT saved in the workspace root folder. NEVER run 'dir', 'ls', or search the filesystem looking for user-attached images!",
    "    - If using a vision model (e.g. Codex/GPT, Claude, Gemini): Inspect and read the attached image directly from your multimodal message context. DO NOT execute 'image_ocr' when native vision is available, unless the image is too low-resolution or exact character-level OCR extraction is specifically requested.",
    "    - If using a text-only model (e.g. DeepSeek, Llama without vision) or when exact character-level text extraction is needed: Call 'image_ocr' with the attachment filename (<1.5s). Arunaki resolves it directly from the attachment cache.",
    "    - Each newly attached image is FRESH data provided by the user. NEVER assume it was deleted or missing based on earlier turns in conversation history.",
    "  * EXCEL SPREADSHEETS (.xlsx, .xls, .csv): When the user attaches or references a spreadsheet to inspect, check sizes/dimensions, or recap, you MUST ALWAYS invoke 'excel_read' first (<50ms). Once 'excel_read' extracts the data, calculate all recaps, counts, and comparisons directly in your reasoning!",
    "  * WORD DOCUMENTS (.docx): ALWAYS call 'word_read' first to extract text and tables (<50ms).",
    "  * POWERPOINT (.pptx): ALWAYS call 'ppt_read' first.",
    "- TOOL EXECUTION HIERARCHY (LEVEL 1 NATIVE -> LEVEL 2 PYTHON SCRIPTING):",
    "  * Level 1 (Top Priority — Native In-Memory Tools): Always try built-in native tools first ('excel_read', 'word_read', 'ppt_read', 'pdf_read', 'image_ocr', 'read', 'edit', 'write') for instant extraction and reading (<50ms).",
    "  * Level 2 (Autonomous Scripting Fallback — Python Only): If native tools fail, cannot parse the format, or if the task requires document modification (such as updating Excel .xlsx rows/cells/formulas, formatting spreadsheets, complex calculations, or data transformations): Arunaki is 100% UNBLOCKED and empowered to write and execute Python scripts ('openpyxl', 'python-docx', 'pandas') via 'bash'/'shell'. Python is the sole official scripting environment for document tasks.",
    "  * SCRIPT SAFETY & HARMLESS OPERATION (STRICT WARNING): All scripts must strictly and exclusively perform safe document operations, data transformation, or calculations on files inside the workspace. NEVER generate or run destructive, malicious, or harmful scripts (e.g. deleting system/OS files, modifying files outside the workspace, altering system configuration/registry, initiating network connections/attacks, downloading untrusted binaries, or running infinite loops).",
    "  * Never Get Stuck: If Level 1 fails or cannot modify the document, NEVER stop, give up, or ask the user to do it manually. Autonomously write a safe Python script and run it to accomplish the task.",
    "  * Windows Script Execution Safety: On Windows, avoid complex multiline inline quotes (e.g. 'python -c \"...\"'). Instead, write your script to a file first (e.g. '.arunaki/scratch/update_doc.py' via 'write'), then execute it with 'python .arunaki/scratch/update_doc.py' via 'bash'/'shell'. Store temporary scripts in '.arunaki/scratch/' and clean up when done.",
    "  * For editing plain text, markdown, or CSV files: Use 'edit' or 'write'.",
    "- REASONING & THOUGHT PROCESS (STRICT):",
    "  * Before answering or executing any tools, always think through the user's intent and your action plan inside <think>...</think> tags.",
    "  * Keep your thinking process concise, analytical, and structured (1-3 sentences).",
    "  * For casual greetings or chat, briefly acknowledge the user's intent inside <think>...</think> and note that no tools are required before outputting your cordial response outside the tags.",
    "  * All internal calculations, math breakdowns, and intermediate reasoning MUST stay strictly inside <think>...</think> tags. NEVER output stray '</think>' tags or unrequested calculation breakdowns in your final user response.",
    "- ACTION-FIRST BIAS FOR DOCUMENT UPDATES & RAW DATA (STRICT):",
    "  * Minimal Typing, Maximum Automation: This action-first bias applies EXCLUSIVELY when the user provides actual unformatted transaction data, raw notes, or explicitly asks to inspect/update documents. It NEVER applies to conversational, greeting, or ambiguous messages.",
    "  * When raw data or document tasks are provided: DO NOT engage in lengthy internal monologues; immediately invoke the relevant document inspection or editing tools.",
  ].join("\n")

const expectedKnowledge = [
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

const expectedTools = [
  "<tool_guidelines>",
  "CRITICAL: Always use the native function calling protocol to execute tools.",
  "NEVER emit fake or pseudo tool call logs (e.g. '[Assistant tool call]: ...', '[Tool result]: ...', or '[Assistant]: ...') in chat text.",
  "Your message text is rendered directly to the user in the UI. Simulating tool executions in conversational text is strictly forbidden.",
  "</tool_guidelines>",
].join("\n")

describe("SystemContextBuiltIns", () => {
  it.effect("loads location-scoped environment and host-local date context", () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(timestamp)
      const context = yield* SystemContextRegistry.Service
      const initialized = yield* SystemContext.initialize(yield* context.load())

      expect(initialized.baseline).toBe(
        [
          "Here is some useful information about the environment you are running in:",
          "<env>",
          `  Working directory: ${directory}`,
          `  Workspace root folder: ${projectDirectory}`,
          "  Agent scope: Document & Data Processing (strictly confined to Working directory)",
          "  Is directory a git repo: yes",
          `  Platform: ${process.platform}`,
          "</env>",
          "",
          `Today's date: ${localDate(timestamp)}`,
          "",
          expectedRules(directory),
          "",
          expectedKnowledge,
          "",
          expectedTools,
        ].join("\n"),
      )
    }),
  )

  it.effect("reconciles the date without repeating unchanged environment context", () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(timestamp)
      const context = yield* SystemContextRegistry.Service
      const initialized = yield* SystemContext.initialize(yield* context.load())

      yield* TestClock.setTime(timestamp + 24 * 60 * 60 * 1000)
      const refreshed = yield* SystemContext.reconcile(yield* context.load(), initialized.snapshot)

      expect(refreshed).toMatchObject({
        _tag: "Updated",
        text: `Today's date is now: ${localDate(timestamp + 24 * 60 * 60 * 1000)}`,
      })
    }),
  )

  it.effect("does not update again within the same local calendar day", () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(timestamp)
      const context = yield* SystemContextRegistry.Service
      const initialized = yield* SystemContext.initialize(yield* context.load())

      yield* TestClock.setTime(timestamp + 60 * 60 * 1000)
      expect(yield* SystemContext.reconcile(yield* context.load(), initialized.snapshot)).toEqual({ _tag: "Unchanged" })
    }),
  )

  itWithInstructions.effect("composes ambient instructions after built-in context", () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(timestamp)
      const context = yield* SystemContextRegistry.Service

      expect((yield* SystemContext.initialize(yield* context.load())).baseline).toBe(
        [
          "Here is some useful information about the environment you are running in:",
          "<env>",
          `  Working directory: ${directory}`,
          `  Workspace root folder: ${projectDirectory}`,
          "  Agent scope: Document & Data Processing (strictly confined to Working directory)",
          "  Is directory a git repo: yes",
          `  Platform: ${process.platform}`,
          "</env>",
          "",
          `Today's date: ${localDate(timestamp)}`,
          "",
          expectedRules(directory),
          "",
          expectedKnowledge,
          "",
          expectedTools,
          "",
          `Instructions from: ${instructionFile}\nBe precise.`,
        ].join("\n"),
      )
    }),
  )
})
