import { Effect } from "effect"
import { effectCmd } from "../effect-cmd"
import { withNetworkOptions, resolveNetworkOptions } from "../network"
import { Flag } from "@arunaki/core/flag/flag"
import os from "node:os"
import path from "node:path"
import fs from "node:fs"

export const ServeCommand = effectCmd({
  command: "serve",
  builder: (yargs) => withNetworkOptions(yargs),
  describe: "starts a headless Arunaki server",
  // Server loads instances per-request via x-arunaki-directory header — no
  // need for an ambient project InstanceContext at startup.
  instance: false,
  handler: Effect.fn("Cli.serve")(function* (args) {
    const { Server } = yield* Effect.promise(() => import("../../server/server"))
    if (!Flag.Arunaki_SERVER_PASSWORD) {
      console.log("Warning: Arunaki_SERVER_PASSWORD is not set; server is unsecured.")
    }
    const opts = yield* resolveNetworkOptions(args)
    const server = yield* Effect.promise(() => Server.listen(opts))
    console.log(`Arunaki server listening on http://${server.hostname}:${server.port}`)

    try {
      const infoDir = path.join(os.homedir(), ".arunaki")
      fs.mkdirSync(infoDir, { recursive: true })
      fs.writeFileSync(
        path.join(infoDir, "engine-info.json"),
        JSON.stringify(
          {
            port: server.port,
            hostname: server.hostname,
            url: `http://${server.hostname}:${server.port}`,
            pid: process.pid,
          },
          null,
          2,
        ),
        "utf8",
      )
    } catch {}

    yield* Effect.never
  }),
})
