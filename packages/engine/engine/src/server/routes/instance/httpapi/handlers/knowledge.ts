import * as InstanceState from "@/effect/instance-state"
import { FSUtil } from "@arunaki/core/fs-util"
import { Effect, Layer, Option, Schema } from "effect"
import { HttpClient, HttpServerRequest } from "effect/unstable/http"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import * as path from "node:path"
import * as fsPromises from "node:fs/promises"
import { InstanceHttpApi } from "../api"
import { instanceContextLayer } from "../middleware/instance-context"
import { workspaceRoutingLayer } from "../middleware/workspace-routing"
import {
  CreateEdgeInput,
  CreateNodeInput,
  KnowledgeError,
  PositionInput,
  UpdateNodeInput,
} from "../groups/knowledge"

export function toGoogleSheetsCsvUrl(url: string): string | undefined {
  if (!url.includes("docs.google.com/spreadsheets/d/")) return undefined
  const match = url.match(/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)
  if (!match) return undefined
  const id = match[1]
  const gidMatch = url.match(/[#&?]gid=([0-9]+)/)
  const gid = gidMatch ? `&gid=${gidMatch[1]}` : ""
  return `https://docs.google.com/spreadsheets/d/${id}/export?format=csv${gid}`
}

interface NodeRecord {
  id: string
  title: string
  content: string
  type: string
  active: boolean
  positionX: number
  positionY: number
  nodeColor: string
  icon: string
  city: string
  urls: string
  createdAt: string
  lastSyncedAt?: string
  syncStatus?: string
}

interface EdgeRecord {
  id: string
  sourceId: string
  targetId: string
  label?: string
}

interface Store {
  nodes: NodeRecord[]
  edges: EdgeRecord[]
  nextId: number
}

function emptyStore(): Store {
  return {
    nodes: [
      {
        id: "main-ai-node",
        title: "Agent Core",
        content: "Central AI agent node",
        type: "agent",
        active: true,
        positionX: 300,
        positionY: 200,
        nodeColor: "#8B5CF6",
        icon: "sparkles",
        city: "",
        urls: "[]",
        createdAt: new Date(0).toISOString(),
      },
    ],
    edges: [],
    nextId: 2,
  }
}

function toNodeSchema(n: NodeRecord) {
  return {
    id: n.id,
    title: n.title,
    content: n.content,
    type: n.type,
    active: n.active,
    positionX: n.positionX,
    positionY: n.positionY,
    nodeColor: n.nodeColor,
    icon: n.icon,
    city: n.city,
    urls: n.urls,
    createdAt: n.createdAt,
    lastSyncedAt: n.lastSyncedAt,
    syncStatus: n.syncStatus,
  }
}

function parseStore(raw: string): Store {
  try {
    const parsed = JSON.parse(raw) as Partial<Store>
    const nodes = Array.isArray(parsed.nodes) ? (parsed.nodes as NodeRecord[]) : []
    const edges = Array.isArray(parsed.edges) ? (parsed.edges as EdgeRecord[]) : []
    if (!nodes.some((n) => n.id === "main-ai-node")) {
      const base = emptyStore()
      nodes.unshift(base.nodes[0]!)
    }
    return { nodes, edges, nextId: Math.max(typeof parsed.nextId === "number" ? parsed.nextId : 1, nodes.length + edges.length + 1) }
  } catch {
    return emptyStore()
  }
}

export const knowledgeHandlers = HttpApiBuilder.group(InstanceHttpApi, "knowledge", (handlers) =>
  Effect.gen(function* () {
    const fs = yield* FSUtil.Service

    const storePath = Effect.fnUntraced(function* () {
      const directory = (yield* InstanceState.context).directory
      return path.join(directory, ".arunaki", "knowledge.json")
    })

    const load = Effect.fn("Knowledge.load")(function* () {
      const file = yield* storePath()
      const raw = yield* fs.readFileStringSafe(file).pipe(Effect.orDie)
      return raw ? parseStore(raw) : emptyStore()
    })

    const save = Effect.fn("Knowledge.save")(function* (store: Store) {
      const file = yield* storePath()
      yield* fs.ensureDir(path.dirname(file)).pipe(Effect.orDie)
      yield* fs.writeJson(file, store, 0o600).pipe(Effect.orDie)
    })

    const requireNode = (store: Store, id: string): Effect.Effect<NodeRecord, KnowledgeError> =>
      store.nodes.find((n) => n.id === id)
        ? Effect.succeed(store.nodes.find((n) => n.id === id)!)
        : Effect.fail(new KnowledgeError({ message: "Node not found", status: 404 }))

    const listimpl = Effect.fn("Knowledge.list")(function* () {
      const store = yield* load()
      const visibleNodes = store.nodes.filter((n) => n.id !== "arunaki-rulebook" && n.type !== "rules")
      return { data: visibleNodes.map(toNodeSchema) }
    })

    const getImpl = Effect.fn("Knowledge.get")(function* (ctx: { params: { id: string } }) {
      const store = yield* load()
      const node = yield* requireNode(store, ctx.params.id)
      return { data: toNodeSchema(node) }
    })

    const createImpl = Effect.fn("Knowledge.create")(function* (ctx: { payload: typeof CreateNodeInput.Type }) {
      const store = yield* load()
      const id = `node-${store.nextId++}`
      store.nodes.push({
        id,
        title: ctx.payload.title,
        content: ctx.payload.content,
        type: ctx.payload.type,
        active: true,
        positionX: ctx.payload.positionX,
        positionY: ctx.payload.positionY,
        nodeColor: ctx.payload.nodeColor,
        icon: ctx.payload.icon,
        city: "",
        urls: "[]",
        createdAt: new Date().toISOString(),
      })
      yield* save(store)
      return { data: toNodeSchema(store.nodes[store.nodes.length - 1]!) }
    })

    const updateImpl = Effect.fn("Knowledge.update")(function* (ctx: {
      params: { id: string }
      payload: typeof UpdateNodeInput.Type
    }) {
      const store = yield* load()
      const node = yield* requireNode(store, ctx.params.id)
      node.title = ctx.payload.title

      let content = ctx.payload.content || ""
      const urls = ctx.payload.urls || []
      const isPlaceholder =
        content.trim() === "Enter knowledge content here..." ||
        content.includes("JavaScript tidak diaktifkan")

      if (isPlaceholder) {
        content = ""
      }

      node.content = content
      node.urls = JSON.stringify(urls)
      node.city = ctx.payload.city
      yield* save(store)
      return { data: toNodeSchema(node) }
    })

    const removeImpl = Effect.fn("Knowledge.remove")(function* (ctx: { params: { id: string } }) {
      const store = yield* load()
      yield* requireNode(store, ctx.params.id)
      store.nodes = store.nodes.filter((n) => n.id !== ctx.params.id)
      store.edges = store.edges.filter((e) => e.sourceId !== ctx.params.id && e.targetId !== ctx.params.id)
      yield* save(store)
      return { data: {} }
    })

    const positionImpl = Effect.fn("Knowledge.position")(function* (ctx: {
      params: { id: string }
      payload: typeof PositionInput.Type
    }) {
      const store = yield* load()
      const node = yield* requireNode(store, ctx.params.id)
      node.positionX = ctx.payload.positionX
      node.positionY = ctx.payload.positionY
      yield* save(store)
      return { data: toNodeSchema(node) }
    })

    const toggleImpl = Effect.fn("Knowledge.toggle")(function* (ctx: { params: { id: string } }) {
      const store = yield* load()
      const node = yield* requireNode(store, ctx.params.id)
      node.active = !node.active
      yield* save(store)
      return { data: toNodeSchema(node) }
    })

    const uploadImpl = Effect.fn("Knowledge.upload")(function* (ctx: {
      request: HttpServerRequest.HttpServerRequest
    }) {
      const parsed = yield* parseUpload(ctx.request)
      const store = yield* load()
      const id = `node-${store.nextId++}`
      store.nodes.push({
        id,
        title: titleFromFilename(parsed.filename),
        content: parsed.content,
        type: "document",
        active: true,
        positionX: parsed.positionX,
        positionY: parsed.positionY,
        nodeColor: "#F59E0B",
        icon: "file-text",
        city: "",
        urls: "[]",
        createdAt: new Date().toISOString(),
      })
      store.edges.push({ id: `edge-${store.nextId++}`, sourceId: id, targetId: "main-ai-node" })
      yield* save(store)
      return { data: toNodeSchema(store.nodes[store.nodes.length - 1]!) }
    })

    const listEdgesImpl = Effect.fn("Knowledge.listEdges")(function* () {
      const store = yield* load()
      const visibleNodeIds = new Set(
        store.nodes.filter((n) => n.id !== "arunaki-rulebook" && n.type !== "rules").map((n) => n.id),
      )
      return {
        data: store.edges
          .filter((e) => visibleNodeIds.has(e.sourceId) && visibleNodeIds.has(e.targetId))
          .map((e) => ({ ...e })),
      }
    })

    const createEdgeImpl = Effect.fn("Knowledge.createEdge")(function* (ctx: {
      payload: typeof CreateEdgeInput.Type
    }) {
      const store = yield* load()
      const id = `edge-${store.nextId++}`
      store.edges.push({
        id,
        sourceId: ctx.payload.sourceId,
        targetId: ctx.payload.targetId,
        label: ctx.payload.label,
      })
      yield* save(store)
      return { data: store.edges[store.edges.length - 1]! }
    })

    const removeEdgeImpl = Effect.fn("Knowledge.removeEdge")(function* (ctx: { params: { edgeId: string } }) {
      const store = yield* load()
      const edge = store.edges.find((e) => e.id === ctx.params.edgeId)
      if (!edge) return yield* Effect.fail(new KnowledgeError({ message: "Edge not found", status: 404 }))
      store.edges = store.edges.filter((e) => e.id !== ctx.params.edgeId)
      yield* save(store)
      return { data: {} }
    })

    const syncImpl = Effect.fn("Knowledge.sync")(function* () {
      const directory = (yield* InstanceState.context).directory
      const store = yield* load()
      const cacheDir = path.join(directory, ".arunaki", "cache")
      yield* Effect.promise(() => fsPromises.mkdir(cacheDir, { recursive: true })).pipe(Effect.orDie)

      let syncedCount = 0
      const errors: string[] = []

      for (const node of store.nodes) {
        if (!node.active) continue
        if (!node.urls || node.urls === "[]") continue

        let urls: string[] = []
        try {
          urls = JSON.parse(node.urls)
        } catch {
          continue
        }

        if (!Array.isArray(urls) || urls.length === 0) continue

        for (const rawUrl of urls) {
          const trimmed = typeof rawUrl === "string" ? rawUrl.trim() : ""
          if (!trimmed) continue

          const targetUrl = toGoogleSheetsCsvUrl(trimmed) || trimmed
          try {
            const controller = new AbortController()
            const timer = setTimeout(() => controller.abort(), 8000)
            const res = yield* Effect.promise(() =>
              fetch(targetUrl, {
                signal: controller.signal,
                headers: {
                  "User-Agent": "Arunaki-Desktop/1.0",
                  Accept: "text/csv, text/plain, */*",
                },
              }).catch(() => null),
            )
            clearTimeout(timer)

            if (res && res.ok) {
              const body = yield* Effect.promise(() => res.text().catch(() => ""))

              // Avoid saving Google accounts login page if sheet is private
              if (body && !body.includes("accounts.google.com/ServiceLogin")) {
                const cacheFile = path.join(cacheDir, `${node.id}.csv`)
                yield* Effect.promise(() => fsPromises.writeFile(cacheFile, body, "utf-8")).pipe(Effect.orDie)
                node.lastSyncedAt = new Date().toISOString()
                node.syncStatus = "success"
                syncedCount++
              } else {
                errors.push(`${node.title}: sheet is private or requires Google login`)
                node.syncStatus = "failed"
              }
            } else {
              errors.push(`${node.title}: HTTP status ${res ? res.status : "network error"}`)
              node.syncStatus = "failed"
            }
          } catch (e: any) {
            errors.push(`${node.title}: ${e.message || String(e)}`)
            node.syncStatus = "failed"
          }
        }
      }

      if (syncedCount > 0 || errors.length > 0) {
        yield* save(store)
      }

      return {
        data: {
          success: errors.length === 0 || syncedCount > 0,
          syncedCount,
          timestamp: new Date().toISOString(),
          errors,
        },
      }
    })

    return handlers
      .handle("list", listimpl)
      .handle("create", createImpl)
      .handle("get", getImpl)
      .handle("update", updateImpl)
      .handle("remove", removeImpl)
      .handle("position", positionImpl)
      .handle("toggle", toggleImpl)
      .handleRaw("upload", uploadImpl)
      .handle("listEdges", listEdgesImpl)
      .handle("createEdge", createEdgeImpl)
      .handle("removeEdge", removeEdgeImpl)
      .handle("sync", syncImpl)
  }),
).pipe(Layer.provide(instanceContextLayer), Layer.provide(workspaceRoutingLayer))

function titleFromFilename(filename: string): string {
  return path.basename(filename).replace(/\.[^.]+$/, "") || "Uploaded file"
}

function parseUpload(request: HttpServerRequest.HttpServerRequest): Effect.Effect<
  { filename: string; content: string; positionX: number; positionY: number },
  KnowledgeError
> {
  return Effect.gen(function* () {
    const text = yield* Effect.orDie(request.text)
    const contentType = request.headers["content-type"] || ""
    const boundaryMatch = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType)
    const boundary = boundaryMatch ? (boundaryMatch[1] || boundaryMatch[2] || "").trim() : ""
    if (!boundary) {
      return yield* Effect.fail(new KnowledgeError({ message: "Missing multipart boundary", status: 400 }))
    }
    const parts = text.split(`--${boundary}`)
    let filename = "upload.txt"
    let content = ""
    let positionX = 200
    let positionY = 200
    for (const part of parts) {
      const headerEnd = part.indexOf("\r\n\r\n")
      if (headerEnd === -1) continue
      const header = part.slice(0, headerEnd)
      const bodyPart = part.slice(headerEnd + 4)
      const nameMatch = /name="([^"]*)"/.exec(header)
      if (!nameMatch) continue
      const field = nameMatch[1]
      if (field === "file") {
        const fileMatch = /filename="([^"]*)"/.exec(header)
        if (fileMatch?.[1]) filename = fileMatch[1]
        content = bodyPart.replace(/\r?\n$/, "")
      } else if (field === "positionX") {
        positionX = Number(JSON.parse(bodyPart.trim() || "200")) || 200
      } else if (field === "positionY") {
        positionY = Number(JSON.parse(bodyPart.trim() || "200")) || 200
      }
    }
    if (!content) {
      return yield* Effect.fail(new KnowledgeError({ message: "No file content provided", status: 400 }))
    }
    return { filename, content, positionX, positionY }
  })
}
