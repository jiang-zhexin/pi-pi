import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { Static } from "typebox";

import { classify } from "./classify.ts";
import { models } from "./model.ts";
import { fetchInput, fetchOutput, searchInput, searchOutput } from "./schema.ts";

const unauthorized = new Error("Unauthorized. Run `/login ollama-cloud` to authenticate.");

export default function (pi: ExtensionAPI): void {
  pi.registerProvider("ollama-cloud", {
    name: "Ollama Cloud",
    baseUrl: "https://ollama.com/v1",
    api: "openai-completions",
    apiKey: "$OLLAMA_API_KEY",
    models,
    classifiers: { "ollama-cloud": { classify } },
  });

  pi.registerTool({
    name: "web-search",
    label: "Ollama Cloud Web Search",
    description: "Performs a web search for a single query and returns relevant results.",
    parameters: searchInput,
    outputSchema: searchOutput,
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const ollamaApiKey = await ctx.modelRegistry.getApiKeyForProvider("ollama-cloud");
      if (ollamaApiKey === undefined) throw unauthorized;

      const response = await fetch("https://ollama.com/api/web_search", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${ollamaApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(params),
        signal: signal ?? null,
      });

      if (!response.ok) {
        if (response.status === 401) throw unauthorized;

        const errorText = await response.text().catch(() => "");
        throw new Error(
          `Ollama Cloud Search API error (status ${response.status}): ${errorText || response.statusText}`,
        );
      }

      const data = (await response.json()) as Static<typeof searchOutput>;

      const formatted = data.results
        .map((r, i) => `${i + 1}. ${r.title}\n   URL: ${r.url}\n   ${r.content}`)
        .join("\n\n");

      return {
        content: [{ type: "text", text: formatted || "No results found." }],
        structuredContent: data,
        details: {},
      };
    },
  });

  pi.registerTool({
    name: "web-fetch",
    label: "Ollama Cloud Web Fetch",
    description: "Fetches a single web page by URL and returns its content.",
    parameters: fetchInput,
    outputSchema: fetchOutput,
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const ollamaApiKey = await ctx.modelRegistry.getApiKeyForProvider("ollama-cloud");
      if (ollamaApiKey === undefined) throw unauthorized;

      const response = await fetch("https://ollama.com/api/web_fetch", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${ollamaApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(params),
        signal: signal ?? null,
      });

      if (!response.ok) {
        if (response.status === 401) throw unauthorized;

        const errorText = await response.text().catch(() => "");
        throw new Error(
          `Ollama Cloud Fetch API error (status ${response.status}): ${errorText || response.statusText}`,
        );
      }

      const data = (await response.json()) as Static<typeof fetchOutput>;

      const formatted = [
        `Title: ${data.title}`,
        "",
        "Content:",
        data.content,
        "",
        `Links found: ${data.links.length}`,
        ...data.links.slice(0, 10).map((l) => `  - ${l}`),
      ].join("\n");

      return {
        content: [{ type: "text", text: formatted }],
        structuredContent: data,
        details: {},
      };
    },
  });
}
