import { Effect } from "effect";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import { InstanceHttpApi } from "../api";
import { telegramService } from "@/messaging/telegram";
import type { MessagingConfig } from "@/messaging/telegram";

export const messagingHandlers = HttpApiBuilder.group(InstanceHttpApi, "messaging", (handlers) =>
  Effect.gen(function* () {
    const getConfig = Effect.fn("MessagingHttpApi.getConfig")(function* () {
      return yield* Effect.promise(() => telegramService.getConfig());
    });

    const updateConfig = Effect.fn("MessagingHttpApi.updateConfig")(function* (ctx: {
      payload: MessagingConfig;
    }) {
      return yield* Effect.promise(() => telegramService.saveConfig(ctx.payload));
    });

    const getStatus = Effect.fn("MessagingHttpApi.getStatus")(function* () {
      const s = telegramService.getStatus();
      return {
        telegram: {
          connected: s.telegram.connected,
          botUsername: s.telegram.botUsername ?? null,
          botFirstName: s.telegram.botFirstName ?? null,
          lastActive: s.telegram.lastActive ?? null,
          lastError: s.telegram.lastError ?? null,
        },
      };
    });

    const testConnection = Effect.fn("MessagingHttpApi.testConnection")(function* (ctx: {
      payload: { botToken: string };
    }) {
      return yield* Effect.promise(() => telegramService.testToken(ctx.payload.botToken));
    });

    const setActiveSession = Effect.fn("MessagingHttpApi.setActiveSession")(function* (ctx: {
      payload: { sessionID: string; directory: string };
    }) {
      telegramService.setActiveSession(ctx.payload.directory, ctx.payload.sessionID);
      return true;
    });

    return handlers
      .handle("getConfig", getConfig)
      .handle("updateConfig", updateConfig)
      .handle("getStatus", getStatus)
      .handle("testConnection", testConnection)
      .handle("setActiveSession", setActiveSession);
  })
);
