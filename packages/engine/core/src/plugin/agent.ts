export * as AgentPlugin from "./agent"

import path from "path"
import { define } from "./internal"
import { Effect } from "effect"
import { AgentV2 } from "../agent"
import { Global } from "../global"
import { Location } from "../location"
import { PermissionV2 } from "../permission"

const TRUNCATION_GLOB = path.join(Global.Path.data, "tool-output", "*")
const BUILD_SYSTEM = `You are Arunaki, an autonomous Desktop Document Agent for office files (.xlsx, .docx, .pptx), data extraction, and calculations.

1. Identity & Persona:
   - Default Identity: You are Arunaki, a native Desktop Document & Data Agent. When asked who you are, what your name is, or who created/developed you, identify yourself as Arunaki.
   - Custom Persona & Name via Chat: If the user assigns you a custom name, nickname, or speaking style/persona (e.g. "your name is now X", "call me Y", "respond like a customer service agent"), adopt that requested name, role, and tone warmly and consistently.
   - Upstream Privacy: Never disclose or claim to be underlying foundation models or upstream providers (such as Agnes, Sapiens AI, DeepSeek, Qwen, Gemini, OpenAI, Claude, etc.).

2. Communication & Tone:
   - Natural, Warm & Helpful: Communicate like a capable, friendly desktop assistant. Always speak naturally in the primary language used by the user.
   - Action Confirmation: When creating, updating, or summarizing documents, provide a polite, natural confirmation explaining what was done, which file was affected, and highlighting key results or totals. Never give cold, robotic one-word answers like "Done" or "Yes" without context.
   - Clear Formatting: Use markdown (bullet points, bold text, clean tables) so results are scannable and pleasant to read. Avoid robotic disclaimers or repetitive boilerplate.

3. Tool Discipline:
   - Casual Chat (Zero Tools): Respond in conversational text for greetings or general questions (e.g. "hello", "who are you"). Never inspect files or invoke tools.
   - Document Tasks (Max Automation): Autonomously inspect files, compute data, and apply edits with minimal user typing.

4. Document Operations (Native First, Python Fallback):
   - Read: Always use native tools first ('excel_read', 'word_read', 'ppt_read', 'read') for instant extraction (<50ms).
   - Calculations: Compute sums, counts, and recaps directly in your reasoning tokens.
   - Edit: Use native editing tools ('excel_com', 'word_com', 'ppt_com', 'edit', 'write').
   - Python Fallback: If native tools fail or cannot parse a file, write and execute Python scripts via 'bash' (place in '.arunaki/scratch/' and delete when done).

5. Workspace Boundaries & Memory:
   - Confined to the active workspace folder. Never access files outside it.
   - Never leave temporary files in the workspace root.
   - Living Memory: When told to remember a rule or preference, record it in '.arunaki/ARUNAKI.md' using edit/write.`

const PROMPT_EXPLORE = `You are a document search specialist for workspace files (spreadsheets, documents, reports, data).

Guidelines:
- Finding files: Use 'glob' for filename patterns.
- Content search: Use 'grep' for text and regex search inside files.
- Reading: Use 'read' when the file path is known.
- Rules: Return absolute paths. Do not use emojis. Do not create files or run state-modifying commands.
- Report findings clearly and efficiently.`

const PROMPT_COMPACTION = `You are a conversation summarization agent. Output a structured summary so the document agent can continue seamlessly.

Rules:
- Follow the exact output format requested by the user prompt.
- Keep all sections, exact file paths, and identifiers. Prefer terse bullets.
- Do not continue the conversation or answer user questions.
- Respond in the same language as the conversation.`

const PROMPT_TITLE = `You generate a concise thread title (<50 characters, single line, no explanations).

Rules:
- Match the language of the user's message.
- Capture the main task, file, or topic. Do not include tool names or generic verbs like "Analyzing" or "Summarizing".
- For short casual messages (e.g. "hello", "hey"), output a brief intent title (e.g. "Greeting", "Quick chat").

Examples:
"recap employee attendance into excel" -> Employee attendance recap
"check product stock sizes in sales report" -> Stock size inspection
"summarize contract agreement draft" -> Contract agreement summary
"calculate monthly operational expenses" -> Monthly expenses calculation
"format quarterly financial spreadsheet" -> Financial spreadsheet formatting
"extract customer contact table from document" -> Customer table extraction
"review annual budget presentation" -> Budget presentation review
"what are the total sales this week" -> Weekly sales total`

const PROMPT_SUMMARY = `Summarize document actions and calculations performed in this session.

Rules:
- 2-3 sentences max in first person ("I updated...", "I calculated...").
- Describe results and changes, not internal processes or user questions.
- If the session ends with an unanswered question or pending request for the user, preserve it exactly.`

export const Plugin = define({
  id: "agent",
  effect: Effect.fn(function* (ctx) {
    const location = yield* Location.Service
    const worktree = location.directory
    const whitelistedDirs = [
      TRUNCATION_GLOB,
      path.join(Global.Path.tmp, "*"),
      path.join(Global.Path.tmp, "**"),
      path.join(Global.Path.home, ".arunaki", "*"),
      path.join(Global.Path.home, ".arunaki", "**"),
    ]
    const readonlyExternalDirectory: PermissionV2.Ruleset = [
      { action: "external_directory", resource: "*", effect: "deny" },
      ...whitelistedDirs.map(
        (resource): PermissionV2.Rule => ({ action: "external_directory", resource, effect: "allow" }),
      ),
    ]
    const defaults: PermissionV2.Ruleset = [
      { action: "*", resource: "*", effect: "allow" },
      ...readonlyExternalDirectory,
      { action: "doom_loop", resource: "*", effect: "deny" },
      { action: "question", resource: "*", effect: "deny" },
      { action: "plan_enter", resource: "*", effect: "deny" },
      { action: "plan_exit", resource: "*", effect: "deny" },
      { action: "read", resource: "*", effect: "allow" },
      { action: "read", resource: "*.env", effect: "deny" },
      { action: "read", resource: "*.env.*", effect: "deny" },
      { action: "read", resource: "*.env.example", effect: "allow" },
    ]

    yield* ctx.agent.transform((draft) => {
      draft.update(AgentV2.defaultID, (item) => {
        item.description = "The default agent. Executes tools based on configured permissions."
        item.system ??= BUILD_SYSTEM
        item.mode = "primary"
        item.permissions.push(
          ...PermissionV2.merge(defaults, [
            { action: "question", resource: "*", effect: "allow" },
            { action: "plan_enter", resource: "*", effect: "allow" },
          ]),
        )
      })

      draft.update(AgentV2.ID.make("plan"), (item) => {
        item.description = "Plan mode. Disallows all edit tools."
        item.mode = "primary"
        item.permissions.push(
          ...PermissionV2.merge(defaults, [
            { action: "question", resource: "*", effect: "allow" },
            { action: "plan_exit", resource: "*", effect: "allow" },
            { action: "external_directory", resource: path.join(Global.Path.data, "plans", "*"), effect: "allow" },
            { action: "edit", resource: "*", effect: "deny" },
            { action: "edit", resource: path.join(".Arunaki", "plans", "*.md"), effect: "allow" },
            {
              action: "edit",
              resource: path.relative(worktree, path.join(Global.Path.data, "plans", "*.md")),
              effect: "allow",
            },
          ]),
        )
      })

      draft.update(AgentV2.ID.make("general"), (item) => {
        item.description =
          "General-purpose agent for researching complex questions and executing multi-step tasks. Use this agent to execute multiple units of work in parallel."
        item.mode = "subagent"
        item.permissions.push(...PermissionV2.merge(defaults, [{ action: "todowrite", resource: "*", effect: "deny" }]))
      })

      draft.update(AgentV2.ID.make("explore"), (item) => {
        item.description =
          'Fast agent specialized for exploring workspace files. Use this when you need to quickly find documents by patterns (eg. "**/*.xlsx", "reports/*.docx"), search content for keywords (eg. "quarterly revenue"), or answer questions about files in the workspace. When calling this agent, specify the desired thoroughness level: "quick" for basic searches, "medium" for moderate exploration, or "very thorough" for comprehensive analysis across multiple locations.'
        item.system = PROMPT_EXPLORE
        item.mode = "subagent"
        item.permissions.push(
          ...PermissionV2.merge(
            defaults,
            [
              { action: "*", resource: "*", effect: "deny" },
              { action: "grep", resource: "*", effect: "allow" },
              { action: "glob", resource: "*", effect: "allow" },
              { action: "webfetch", resource: "*", effect: "allow" },
              { action: "websearch", resource: "*", effect: "allow" },
              { action: "read", resource: "*", effect: "allow" },
            ],
            readonlyExternalDirectory,
          ),
        )
      })

      draft.update(AgentV2.ID.make("compaction"), (item) => {
        item.mode = "primary"
        item.hidden = true
        item.system = PROMPT_COMPACTION
        item.permissions.push(...PermissionV2.merge(defaults, [{ action: "*", resource: "*", effect: "deny" }]))
      })

      draft.update(AgentV2.ID.make("title"), (item) => {
        item.mode = "primary"
        item.hidden = true
        item.system = PROMPT_TITLE
        item.permissions.push(...PermissionV2.merge(defaults, [{ action: "*", resource: "*", effect: "deny" }]))
      })

      draft.update(AgentV2.ID.make("summary"), (item) => {
        item.mode = "primary"
        item.hidden = true
        item.system = PROMPT_SUMMARY
        item.permissions.push(...PermissionV2.merge(defaults, [{ action: "*", resource: "*", effect: "deny" }]))
      })
    })
  }),
})
