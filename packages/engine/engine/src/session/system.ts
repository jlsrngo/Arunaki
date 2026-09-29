import { LayerNode } from "@arunaki/core/effect/layer-node"
import { Context, Effect, Layer } from "effect"
import * as path from "node:path"
import * as fsSync from "node:fs"

import { InstanceState } from "@/effect/instance-state"

import PROMPT_DEFAULT from "./prompt/default.txt"
import PROMPT_KIMI from "./prompt/kimi.txt"
import PROMPT_META from "./prompt/meta.txt"
import type { Provider } from "@/provider/provider"
import type { Agent } from "@/agent/agent"
import { Permission } from "@/permission"
import { Skill } from "@/skill"
import { AbsolutePath } from "@arunaki/core/schema"
import { Location } from "@arunaki/core/location"
import { LocationServiceMap, locationServiceMapLayer } from "@arunaki/core/location-services"
import { Reference } from "@arunaki/core/reference"
import { MCP } from "@/mcp"
import { PermissionV1 } from "@arunaki/core/v1/permission"

const CANVAS_INSTRUCTION = `
# Canvas & Structured Documents
When the user asks you to organize, tidy up, format, summarize, reconcile, calculate, or produce structured data/recaps/order lists (e.g. "rapihkan", "rekap", "satukan", "gabungkan", "buat tabel", "buat di canvas", "make in canvas", or when presenting a clean structured data table/recap), you MUST wrap the resulting structured table or document inside [CANVAS]...[/CANVAS] tags!
You may still write a brief conversational summary or note outside the [CANVAS] tags in the chat, but the entire structured document/table must be inside [CANVAS]...[/CANVAS].
Arunaki's UI will automatically extract everything inside the [CANVAS]...[/CANVAS] block and display it in the user's Center Panel Canvas editor.

Example:
Here is the organized summary:

[CANVAS]
# Order Summary
| Item  | Size | Qty |
|-------|------|-----|
| Shirt | M    | 2   |
[/CANVAS]
`

function toGoogleSheetsCsvUrl(url: string): string | undefined {
  if (!url.includes("docs.google.com/spreadsheets/d/")) return undefined
  const match = url.match(/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)
  if (!match) return undefined
  const id = match[1]
  const gidMatch = url.match(/[#&?]gid=([0-9]+)/)
  const gid = gidMatch ? `&gid=${gidMatch[1]}` : ""
  return `https://docs.google.com/spreadsheets/d/${id}/export?format=csv${gid}`
}

export function provider(model: Provider.Model) {
  let prompt = PROMPT_DEFAULT
  if (model.api.id.includes("muse")) {
    const name = model.api.id.includes("muse-glimmer") ? "Muse Glimmer" : "Muse Spark"
    prompt = PROMPT_META.replaceAll("{{MODEL_NAME}}", name)
  } else if (
    model.api.id.toLowerCase().includes("kimi") ||
    ["kimi-for-coding", "moonshotai", "moonshotai-cn"].includes(model.providerID)
  ) {
    prompt = PROMPT_KIMI
  }
  return [prompt, CANVAS_INSTRUCTION]
}

export interface Interface {
  readonly environment: (model: Provider.Model) => Effect.Effect<string[]>
  readonly skills: (agent: Agent.Info) => Effect.Effect<string | undefined>
  readonly mcp: (agent: Agent.Info, permission?: PermissionV1.Ruleset) => Effect.Effect<string | undefined>
}

export class Service extends Context.Service<Service, Interface>()("@arunaki/SystemPrompt") {}

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const skill = yield* Skill.Service
    const mcp = yield* MCP.Service
    const locations = yield* LocationServiceMap.Service

    return Service.of({
      environment: Effect.fn("SystemPrompt.environment")(function* (model: Provider.Model) {
        const ctx = yield* InstanceState.context
        const references = yield* Effect.gen(function* () {
          return (yield* (yield* Reference.Service).list()).filter((reference) => reference.description !== undefined)
        }).pipe(Effect.provide(locations.get(Location.Ref.make({ directory: AbsolutePath.make(ctx.directory) }))))

        const normalizedDir = ctx.directory.toLowerCase().replace(/\\/g, "/")
        const isScratch =
          normalizedDir.includes("/.arunaki/scratch") ||
          normalizedDir.endsWith("/.arunaki/scratch") ||
          normalizedDir.includes(".arunaki/scratch")

        const envLines = isScratch
          ? [
              `You are powered by the model named ${model.api.id}. The exact model ID is ${model.providerID}/${model.api.id}`,
              `Here is some useful information about the environment you are running in:`,
              `<env>`,
              `  Workspace status: No project folder opened (unconnected scratchpad)`,
              `  Is folder connected: no`,
              `  Platform: ${process.platform}`,
              `  Today's date: ${new Date().toDateString()}`,
              `</env>`,
              ``,
              `CRITICAL INSTRUCTION — NO WORKSPACE FOLDER CONNECTED:`,
              `The user has NOT opened or connected any document or project folder yet.`,
              `- You do NOT have access to a user project folder.`,
              `- You must NEVER mention or expose internal sandbox paths (such as .arunaki/scratch or system user directory paths) to the user.`,
              `- If the user asks to check files, list folder contents, or work on documents in their folder, DO NOT run directory listing tools and DO NOT say you checked a scratch folder.`,
              `- Instead, inform the user clearly and politely that no document/project folder has been opened yet. Advise them to click the "Open Folder" button in the top bar or sidebar to connect their folder, or invite them to paste raw text/notes directly here into the chat for immediate processing.`,
            ]
          : [
              `You are powered by the model named ${model.api.id}. The exact model ID is ${model.providerID}/${model.api.id}`,
              `Here is some useful information about the environment you are running in:`,
              `<env>`,
              `  Working directory: ${ctx.directory}`,
              `  Workspace root folder: ${ctx.worktree}`,
              `  Agent scope: Document & Data Processing (strictly confined to Working directory)`,
              `  Platform: ${process.platform}`,
              `  Today's date: ${new Date().toDateString()}`,
              `</env>`,
              ``,
              `CRITICAL INSTRUCTION — PROJECT FOLDER ISOLATION:`,
              `- You are strictly confined to your active working directory: ${ctx.directory}.`,
              `- You CANNOT and MUST NOT attempt to access, list, search, or read the entire drive (e.g. "E:\\", "C:\\", or root drives) or any folder outside ${ctx.directory}.`,
              `- All documents, spreadsheets, text files, and rules belong exclusively inside ${ctx.directory}.`,
              `- If you need to search or read files, operate ONLY inside ${ctx.directory}. Do NOT plan or reason about scanning external drives.`,
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
              `  * IMAGE ATTACHMENTS (png, jpg, webp, screenshots): When the user attaches or pastes images, inspect them directly via multimodal vision in your message context. Do NOT expect image files on disk or run python OCR unless explicitly requested.`,
              `  * EXCEL SPREADSHEETS (.xlsx, .xls, .csv): When the user attaches or references a spreadsheet to inspect, check sizes/dimensions, or recap, you MUST ALWAYS invoke 'excel_read' first (<50ms). Once 'excel_read' extracts the data, calculate all recaps, counts, and comparisons directly in your reasoning!`,
              `  * WORD DOCUMENTS (.docx): ALWAYS call 'word_read' first to extract text and tables (<50ms).`,
              `  * POWERPOINT (.pptx): ALWAYS call 'ppt_read' first.`,
              `  * TEXT/CODE: ALWAYS use 'read'.`,
              `- RESILIENT PYTHON & SHELL POLICY:`,
              `  * Always prioritize native document tools first for instant in-memory extraction.`,
              `  * If and only if a native tool fails, errors, or cannot process a complex file, you are COMPLETELY FREE to write and execute Python scripts (e.g. openpyxl, python-docx, pptx, pandas) via shell ('bash') as a resilient fallback.`,
              `  * Do NOT default to Python on the first attempt—always try native tools first. When writing fallback scripts, store them in '.arunaki/scratch/' and clean up when done.`,
              `- REASONING & THOUGHT PROCESS (STRICT):`,
              `  * Before answering or executing any tools, always think through the user's intent and your action plan inside <think>...</think> tags.`,
              `  * Keep your thinking process concise, analytical, and structured (1-3 sentences).`,
              `  * For casual greetings or chat, briefly acknowledge the user's intent inside <think>...</think> and note that no tools are required before outputting your cordial response outside the tags.`,
              `  * All internal calculations, math breakdowns, and intermediate reasoning MUST stay strictly inside <think>...</think> tags. NEVER output stray '</think>' tags or unrequested calculation breakdowns in your final user response.`,
              `- ACTION-FIRST BIAS FOR DOCUMENT UPDATES & RAW DATA (STRICT):`,
              `  * Minimal Typing, Maximum Automation: This action-first bias applies EXCLUSIVELY when the user provides actual unformatted transaction data, raw notes, or explicitly asks to inspect/update documents. It NEVER applies to conversational, greeting, or ambiguous messages.`,
              `  * When raw data or document tasks are provided: DO NOT engage in lengthy internal monologues; immediately invoke the relevant document inspection or editing tools.`,
            ]

        // Inject active Knowledge nodes as context for the AI
        let knowledgeContext: string | undefined = undefined
        try {
          const paths = [
            path.join(ctx.directory, ".arunaki", "knowledge.json"),
            path.join(ctx.worktree, ".arunaki", "knowledge.json"),
          ]

          let raw: string | undefined = undefined
          for (const knowledgePath of paths) {
            if (fsSync.existsSync(knowledgePath)) {
              try {
                raw = fsSync.readFileSync(knowledgePath, "utf-8")
                if (raw) break
              } catch {}
            }
          }

          let activeNodes: Array<{ id: string; title: string; content: string; active: boolean; type: string; urls?: string; lastSyncedAt?: string }> = []
          if (raw) {
            const store = JSON.parse(raw) as { nodes?: Array<{ id: string; title: string; content: string; active: boolean; type: string; urls?: string; lastSyncedAt?: string }> }
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
                const hasRealContent = node.content && node.content.trim().length > 0 && node.content.trim() !== "Enter knowledge content here..."
                if (hasRealContent) {
                  lines.push(`    Notes: ${node.content}`)
                }

                // Check local cached snapshot
                const cachePaths = [
                  path.join(ctx.directory, ".arunaki", "cache", `${node.id}.csv`),
                  path.join(ctx.worktree, ".arunaki", "cache", `${node.id}.csv`),
                ]
                let cachedData: string | undefined = undefined
                for (const cp of cachePaths) {
                  if (fsSync.existsSync(cp)) {
                    try {
                      const rawCache = fsSync.readFileSync(cp, "utf-8")
                      if (rawCache && rawCache.trim().length > 0) {
                        const splitLines = rawCache.split("\n")
                        if (splitLines.length > 250) {
                          cachedData = splitLines.slice(0, 250).join("\n") + "\n... [truncated for context length, full data stored locally]"
                        } else {
                          cachedData = rawCache
                        }
                        break
                      }
                    } catch {}
                  }
                }

                if (cachedData) {
                  lines.push(`    Cached Live Data (${node.lastSyncedAt ? "Last synced: " + node.lastSyncedAt : "Auto-synced snapshot"}):`)
                  lines.push(`\`\`\`csv`)
                  lines.push(cachedData)
                  lines.push(`\`\`\``)
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
                            lines.push(`    Fetch Instruction: To read data from this Google Sheet catalog, invoke webfetch on "${csv}"`)
                          }
                        }
                      }
                    }
                  } catch {}
                }
                lines.push(`  </data_source>`)
                return lines
              }),
              "</knowledge_base>",
              "",
              "CRITICAL KNOWLEDGE BASE INSTRUCTIONS:",
              "- The user has connected external business data sources via the Arunaki Knowledge menu (/knowledge) (e.g. Google Sheets, product catalog, price lists).",
              "- 'Knowledge' is an Arunaki UI menu/feature — it is NEVER a directory or folder in the filesystem! NEVER run bash/dir/ls or glob looking for a 'knowledge folder'.",
              "- When the user asks about stock, inventory, products, catalog items, prices, or refers to 'katalog di knowledge' / 'rekap ke excel':",
              "  1. If 'Cached Live Data' is present in <knowledge_base> above, USE IT DIRECTLY! It is pre-loaded into your context. DO NOT execute webfetch, bash, or file search tools to re-fetch it.",
              "  2. If Cached Live Data is not present but a Direct CSV Export URL exists, use webfetch on that URL.",
              "  3. Respond warmly and politely: 'Katalog sudah terhubung di menu Knowledge — saya bisa akses dan analisis data produk/harganya.'",
              "  4. NEVER claim that data or stock is missing without checking these connected data sources first!",
              "- STRICT PRIVACY & ARCHITECTURE RULE FOR ALL RESPONSES: NEVER mention internal backend filenames (such as knowledge.json, ARUNAKI.md, cache files), internal node IDs (such as main-ai-node, arunaki-rulebook, node-1), graph edges/relations (such as edge-5), or internal system concepts (such as Agent Core, Living Rules). Always refer to connected data sources by their natural business name (e.g. 'Katalog' or 'Product Catalog' or 'menu Knowledge').",
            ]
            knowledgeContext = knowledgeLines.join("\n")
          } else {
            knowledgeContext = [
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
        } catch {}

        return [
          envLines.join("\n"),
          knowledgeContext,
          references.length === 0
            ? undefined
            : [
                "Project references provide additional directories that can be accessed when relevant.",
                "<available_references>",
                ...references
                  .toSorted((a, b) => a.name.localeCompare(b.name))
                  .flatMap((reference) => [
                    "  <reference>",
                    `    <name>${reference.name}</name>`,
                    `    <path>${reference.path}</path>`,
                    ...(reference.description === undefined
                      ? []
                      : [`    <description>${reference.description}</description>`]),
                    "  </reference>",
                  ]),
                "</available_references>",
              ].join("\n"),
          [
            "CRITICAL INSTRUCTION FOR DATA AND DOCUMENTS:",
            "If the user asks you to create, format, or organize data (like a table, report, list, plain text, or document), you MUST wrap the ENTIRE result inside a markdown code block (e.g. ```text ... ``` or ```markdown ... ```). Do NOT output raw markdown tables or text directly in the chat. Wrap it in a code block so it can be extracted to the Canvas.",
          ].join("\n"),
        ].filter((part): part is string => part !== undefined)
      }),

      skills: Effect.fn("SystemPrompt.skills")(function* (agent: Agent.Info) {
        if (Permission.disabled(["skill"], agent.permission).has("skill")) return

        const list = yield* skill.available(agent)

        return [
          "Skills provide specialized instructions and workflows for specific tasks.",
          "Use the skill tool to load a skill when a task matches its description.",
          // the agents seem to ingest the information about skills a bit better if we present a more verbose
          // version of them here and a less verbose version in tool description, rather than vice versa.
          Skill.fmt(list, { verbose: true }),
        ].join("\n")
      }),

      mcp: Effect.fn("SystemPrompt.mcp")(function* (agent: Agent.Info, permission?: PermissionV1.Ruleset) {
        const ruleset = Permission.merge(agent.permission, permission ?? [])
        const instructions = (yield* mcp.instructions()).filter(
          (item) => item.tools.length === 0 || Permission.disabled(item.tools, ruleset).size < item.tools.length,
        )
        if (instructions.length === 0) return

        return [
          "<mcp_instructions>",
          ...instructions.flatMap((item) => [
            `  <server name="${item.name}">`,
            ...item.instructions.split("\n").map((line) => `    ${line}`),
            "  </server>",
          ]),
          "</mcp_instructions>",
        ].join("\n")
      }),
    })
  }),
)

const locationServiceMapNode = LayerNode.make({
  service: LocationServiceMap.Service,
  layer: locationServiceMapLayer,
  deps: [],
})

export const node = LayerNode.make({
  service: Service,
  layer: layer,
  deps: [Skill.node, MCP.node, locationServiceMapNode],
})

export * as SystemPrompt from "./system"
