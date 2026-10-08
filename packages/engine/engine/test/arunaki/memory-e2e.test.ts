import { afterEach, describe, expect } from "bun:test"
import { Effect, Layer, Stream } from "effect"
import * as fs from "fs/promises"
import path from "path"
import { LayerNode } from "@arunaki/core/effect/layer-node"
import { EventV2 } from "@arunaki/core/event"
import { BackgroundJob as CoreBackgroundJob } from "@arunaki/core/background-job"
import { LLMEvent } from "@arunaki/llm"
import { Memory, node as memoryNode } from "../../src/arunaki/memory"
import { Session } from "../../src/session/session"
import { LLM } from "../../src/session/llm"
import { Agent } from "../../src/agent/agent"
import { Provider } from "../../src/provider/provider"
import { testEffect } from "../lib/effect"
import { TestInstance } from "../fixture/fixture"

const SESSION = "sess-correction-test"

const mockLLM = Layer.mock(LLM.Service, {
  stream: () =>
    Stream.make(
      LLMEvent.textDelta({ id: "txt-0", text: "- Simpan nominal tanpa konversi mata uang." }),
    ),
})

const mockAgent = Layer.mock(Agent.Service, {
  get: () => Effect.succeed({ name: "general" } as any),
})

const mockProvider = Layer.mock(Provider.Service, {
  getModel: () => Effect.succeed({ providerID: "openrouter", modelID: "mock-1" } as any),
})

const mockEvents = Layer.mock(EventV2.Service, {
  project: () => Effect.void,
  listen: () => Effect.succeed(Effect.void),
  publish: ((_def: any, data: any) => Effect.succeed(data)) as any,
})

const mockBackground = Layer.mock(CoreBackgroundJob.Service, {
  start: () => Effect.succeed({} as any),
})

function userMsg(content: string): any {
  return {
    info: {
      id: "msg-1",
      role: "user",
      agent: "general",
      model: { providerID: "openrouter", modelID: "mock-1" },
    },
    parts: [{ id: "p1", type: "text", text: content }],
  }
}

const mockSession = Layer.mock(Session.Service, {
  messages: () =>
    Effect.succeed([
      userMsg("jangan ubah nominal ke rupiah, pertahankan mata uang aslinya"),
    ] as any),
  get: () => Effect.succeed({ agent: "general", model: { providerID: "openrouter", modelID: "mock-1" } } as any),
})

const memoryLayer = LayerNode.compile(memoryNode, [
  [LLM.node, mockLLM],
  [Agent.node, mockAgent],
  [Provider.node, mockProvider],
  [EventV2.node, mockEvents],
  [CoreBackgroundJob.node, mockBackground],
  [Session.node, mockSession],
])

const it = testEffect(memoryLayer)

describe("memory: learnCorrection (stubbed LLM)", () => {
  it.instance("rewrites ARUNAKI.md, appends jsonl, and dual-syncs knowledge", () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      const dir = test.directory
      const memory = yield* Memory.Service

      yield* memory.learnCorrection(SESSION)

      const read = (rel: string) => Effect.promise(() => fs.readFile(path.join(dir, rel), "utf8"))
      const aru = yield* read(path.join(".arunaki", "ARUNAKI.md"))
      expect(aru).toContain("## User Preferences & Learned Corrections")
      expect(aru).toContain("Simpan nominal tanpa konversi mata uang")

      const jsonl = yield* read(path.join(".arunaki", "user-corrections.jsonl"))
      expect(jsonl).toContain(SESSION)
      expect(jsonl).toContain("jangan ubah nominal")
    }))

  it.instance("ensureActive scans workspace files, creates ARUNAKI.md and initial backup snapshot", () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      const dir = test.directory
      const memory = yield* Memory.Service

      // Create dummy files
      yield* Effect.promise(() => fs.writeFile(path.join(dir, "REKAP.xlsx"), "excel-data"))
      yield* Effect.promise(() => fs.writeFile(path.join(dir, "CATATAN.txt"), "text-notes"))

      // Run ensureActive
      yield* memory.ensureActive()

      const read = (rel: string) => Effect.promise(() => fs.readFile(path.join(dir, rel), "utf8"))
      const aru = yield* read(path.join(".arunaki", "ARUNAKI.md"))
      expect(aru).toContain("# LOCAL WORKSPACE OPERATING RULES")
      expect(aru).toContain("REKAP.xlsx")
      expect(aru).toContain("CATATAN.txt")
      expect(aru).toContain("Tabular & Spreadsheet Files")
      expect(aru).toContain("Document Files")

      // Verify backup directory exists
      const backupEntries = yield* Effect.promise(() => fs.readdir(path.join(dir, ".arunaki-backups")))
      expect(backupEntries.length).toBeGreaterThan(0)
      expect(backupEntries[0]).toContain("initial-")
    }))
})
