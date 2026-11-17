import { createProvider } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";

import { api } from "./api.ts";
import { oauth } from "./auth.ts";
import { agyCredential, fetchModels } from "./ccpa.ts";
import { usage } from "./usage.ts";

const commands: Record<
  string,
  {
    description: string;
    handler: (args: string, ctx: ExtensionCommandContext) => Promise<void>;
  }
> = {
  usage: { description: "Show remaining quota", handler: usage },
};

export default function (pi: ExtensionAPI): void {
  pi.registerCommand("agy", {
    description: "Antigravity commands",
    getArgumentCompletions: (prefix) => {
      const items = Object.entries(commands)
        .filter(([name]) => name.startsWith(prefix))
        .map(([name, command]) => ({
          value: name,
          label: name,
          description: command.description,
        }));
      return items.length ? items : null;
    },
    handler: async (input, ctx) => {
      const [name = "", ...args] = input.trim().split(/\s+/);
      const command = Object.hasOwn(commands, name) ? commands[name] : undefined;
      if (command) {
        await command.handler(args.join(" "), ctx);
        return;
      }
      const help = Object.entries(commands)
        .map(([name, command]) => `/agy ${name} — ${command.description}`)
        .join("\n");
      if (ctx.hasUI) ctx.ui.notify(help, "info");
      else console.log(help);
    },
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
      async fetchModels({ credential, signal }) {
        if (credential?.type !== "oauth") throw new Error("Run /login agy to authenticate.");
        return fetchModels(agyCredential(credential), signal);
      },
      api,
    }),
  );
}
