import { describe, expect, test } from "bun:test"
import { Effect, Layer } from "effect"
import * as fs from "fs"
import * as path from "path"
import * as os from "os"
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

describe("Knowledge injection in SystemContextBuiltIns", () => {
  test("injects active knowledge node notes and rule 0 into baseline", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "arunaki-kt-"))
    const arunakiDir = path.join(tmpDir, ".arunaki")
    fs.mkdirSync(arunakiDir, { recursive: true })

    const knowledgeData = {
      nodes: [
        {
          id: "main-ai-node",
          title: "Agent Core",
          content: "internal",
          active: true,
          type: "agent",
          urls: "[]",
        },
        {
          id: "node-uji-1",
          title: "Katalog Uji Arunaki",
          content:
            "Data uji knowledge Arunaki. Kode rujukan: MERAH-8842. Produk: Kaos Polos Cotton, kategori Pakaian, harga beli 62000, harga jual 89000, stok 145. Responsible: Budi Santoso, ext 2231. Gudang: Jakarta.",
          active: true,
          type: "catalog",
          urls: "[]",
        },
      ],
      edges: [],
    }
    fs.writeFileSync(path.join(arunakiDir, "knowledge.json"), JSON.stringify(knowledgeData), "utf-8")

    const directory = AbsolutePath.make(FSUtil.resolve(tmpDir))
    const locationLayer = Layer.succeed(
      Location.Service,
      Location.Service.of(location({ directory }, { projectDirectory: directory })),
    )
    const builtInsNode = LayerNode.group([SystemContextBuiltIns.node, SystemContextRegistry.node])
    const layer = AppNodeBuilder.build(builtInsNode, [
      [Location.node, locationLayer],
      [Global.node, Global.layerWith({ config: path.join(tmpDir, "global") })],
    ])

    await Effect.runPromise(
      Effect.gen(function* () {
        const context = yield* SystemContextRegistry.Service
        const initialized = yield* SystemContext.initialize(yield* context.load())

        expect(initialized.baseline).toContain("<knowledge_base>")
        expect(initialized.baseline).toContain('<data_source name="Katalog Uji Arunaki" type="catalog">')
        expect(initialized.baseline).toContain("Notes: Data uji knowledge Arunaki. Kode rujukan: MERAH-8842")
        expect(initialized.baseline).toContain("harga jual 89000")
        expect(initialized.baseline).toContain("CRITICAL KNOWLEDGE BASE INSTRUCTIONS:")
        expect(initialized.baseline).toContain("0. If a <data_source> block contains a 'Notes:' line")
      }).pipe(Effect.provide(layer)),
    )

    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  test("injects cached CSV data when present", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "arunaki-kt-"))
    const arunakiDir = path.join(tmpDir, ".arunaki")
    const cacheDir = path.join(arunakiDir, "cache")
    fs.mkdirSync(cacheDir, { recursive: true })

    const knowledgeData = {
      nodes: [
        {
          id: "node-sheet-1",
          title: "Stok Gudang",
          content: "Katalog stok live",
          active: true,
          type: "catalog",
          urls: JSON.stringify(["https://docs.google.com/spreadsheets/d/abc12345/edit#gid=0"]),
          lastSyncedAt: "2026-10-13T10:00:00Z",
        },
      ],
      edges: [],
    }
    fs.writeFileSync(path.join(arunakiDir, "knowledge.json"), JSON.stringify(knowledgeData), "utf-8")
    fs.writeFileSync(path.join(cacheDir, "node-sheet-1.csv"), "SKU,Nama,Stok\nKPS-01,Kaos Hitam,50\n", "utf-8")

    const directory = AbsolutePath.make(FSUtil.resolve(tmpDir))
    const locationLayer = Layer.succeed(
      Location.Service,
      Location.Service.of(location({ directory }, { projectDirectory: directory })),
    )
    const builtInsNode = LayerNode.group([SystemContextBuiltIns.node, SystemContextRegistry.node])
    const layer = AppNodeBuilder.build(builtInsNode, [
      [Location.node, locationLayer],
      [Global.node, Global.layerWith({ config: path.join(tmpDir, "global") })],
    ])

    await Effect.runPromise(
      Effect.gen(function* () {
        const context = yield* SystemContextRegistry.Service
        const initialized = yield* SystemContext.initialize(yield* context.load())

        expect(initialized.baseline).toContain("Cached Live Data (Last synced: 2026-10-13T10:00:00Z):")
        expect(initialized.baseline).toContain("SKU,Nama,Stok")
        expect(initialized.baseline).toContain("Direct CSV Export URL: https://docs.google.com/spreadsheets/d/abc12345/export?format=csv&gid=0")
      }).pipe(Effect.provide(layer)),
    )

    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  test("injects knowledge menu awareness when no active data sources are connected", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "arunaki-kt-"))
    const directory = AbsolutePath.make(FSUtil.resolve(tmpDir))
    const locationLayer = Layer.succeed(
      Location.Service,
      Location.Service.of(location({ directory }, { projectDirectory: directory })),
    )
    const builtInsNode = LayerNode.group([SystemContextBuiltIns.node, SystemContextRegistry.node])
    const layer = AppNodeBuilder.build(builtInsNode, [
      [Location.node, locationLayer],
      [Global.node, Global.layerWith({ config: path.join(tmpDir, "global") })],
    ])

    await Effect.runPromise(
      Effect.gen(function* () {
        const context = yield* SystemContextRegistry.Service
        const initialized = yield* SystemContext.initialize(yield* context.load())

        expect(initialized.baseline).toContain("<knowledge_base>")
        expect(initialized.baseline).toContain("No external data sources are currently connected to this workspace.")
        expect(initialized.baseline).toContain("KNOWLEDGE MENU AWARENESS:")
        expect(initialized.baseline).toContain("Arunaki features a dedicated 'Knowledge' menu in the user interface (accessible via the top navigation bar at /knowledge).")
      }).pipe(Effect.provide(layer)),
    )

    fs.rmSync(tmpDir, { recursive: true, force: true })
  })
})
