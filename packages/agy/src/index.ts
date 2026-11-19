import { createProvider } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";

import { api } from "./api.ts";
import { oauth } from "./auth.ts";
import { agyCredential, fetchModels } from "./ccpa.ts";
import { imagesApi } from "./images.ts";
import { usage } from "./usage.ts";

export default function (pi: ExtensionAPI): void {
  pi.events.on("pi-usage:discover", (data) => {
    const discovery = data as {
      add: (provider: { id: string; label: string; authHint: string }) => void;
    };
    if (typeof discovery?.add !== "function") return;
    discovery.add({
      id: "agy",
      label: "Antigravity",
      authHint: "Run /login agy to authenticate.",
    });
  });

  pi.events.on("pi-usage:request", async (data) => {
    const request = data as { provider: string; ctx: ExtensionCommandContext } | undefined;
    if (request?.provider !== "agy" || !request.ctx) return;
    const { ctx } = request;
    try {
      await usage(ctx);
    } catch (error) {
      const message = `Antigravity quota query failed: ${error instanceof Error ? error.message : String(error)}`;
      if (ctx.hasUI) ctx.ui.notify(message, "error");
      else console.error(message);
    }
  });

  pi.on("before_agent_start", async (event, ctx) => {
    if (ctx.model?.provider !== "agy") return;
    return {
      systemPrompt: event.systemPrompt
        .replace(
          "You are a coding assistant running inside pi, a coding agent harness. Help users inspect files, run commands, and modify code.",
          "You are a coding assistant.",
        )
        .replace(/<docs>[\s\S]*?<\/docs>/, ""),
    };
  });

  pi.registerProvider(
    createProvider({
      id: "agy",
      name: "Antigravity",
      auth: { oauth },
      models: [],
      images: { ["agy-images"]: imagesApi },
      async fetchModels({ credential, signal }) {
        if (credential?.type !== "oauth") throw new Error("Run /login agy to authenticate.");
        return fetchModels(agyCredential(credential), signal);
      },
      api,
    }),
  );
}
