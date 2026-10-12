import { AgentV2 } from "@arunaki/core/agent"
import { AISDK } from "@arunaki/core/aisdk"
import { Catalog } from "@arunaki/core/catalog"
import { CommandV2 } from "@arunaki/core/command"
import { Credential } from "@arunaki/core/credential"
import { AppNodeBuilder } from "@arunaki/core/effect/app-node-builder"
import { LayerNodePlatform } from "@arunaki/core/effect/app-node-platform"
import { LayerNode } from "@arunaki/core/effect/layer-node"
import { EventV2 } from "@arunaki/core/event"
import { FileSystem } from "@arunaki/core/filesystem"
import { FSUtil } from "@arunaki/core/fs-util"
import { Global } from "@arunaki/core/global"
import { Integration } from "@arunaki/core/integration"
import { Location } from "@arunaki/core/location"
import { Npm } from "@arunaki/core/npm"
import { PluginV2 } from "@arunaki/core/plugin"
import { Reference } from "@arunaki/core/reference"
import { SkillV2 } from "@arunaki/core/skill"
import { Effect, Layer } from "effect"
import { tempLocationLayer } from "../fixture/location"

const npmLayer = Layer.succeed(
  Npm.Service,
  Npm.Service.of({
    add: () => Effect.succeed({ directory: "", entrypoint: undefined }),
    install: () => Effect.void,
    which: () => Effect.succeed(undefined),
  }),
)

export const PluginTestLayer = AppNodeBuilder.build(
  LayerNode.group([
    FileSystem.node,
    FSUtil.node,
    Location.node,
    Npm.node,
    Credential.node,
    EventV2.node,
    LayerNodePlatform.httpClient,
    PluginV2.node,
    AgentV2.node,
    AISDK.node,
    Catalog.node,
    CommandV2.node,
    Integration.node,
    Reference.node,
    SkillV2.node,
    // ConfigProviderPlugin reads the global config directory to tell an account-scoped provider
    // entry from a project's. In production the plugin host provides it (internal.ts); tests that
    // call a plugin's effect directly bypass that, so the layer has to carry it.
    Global.node,
  ]),
  [
    [Location.node, tempLocationLayer],
    [Npm.node, npmLayer],
  ],
)

