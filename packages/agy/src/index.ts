import { createProvider } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { api } from "./api.ts";
import { oauth } from "./auth.ts";
import { agyCredential, fetchModels } from "./ccpa.ts";

export default function (pi: ExtensionAPI): void {
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
      async fetchModels({ credential, signal }) {
        if (credential?.type !== "oauth") throw new Error("Run /login agy to authenticate.");
        return fetchModels(agyCredential(credential), signal);
      },
      api,
    }),
  );
}
