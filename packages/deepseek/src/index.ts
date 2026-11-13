import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { Static } from "typebox";

import { fetchInput, fetchOutput, searchInput, searchOutput } from "./schema.ts";

const unauthorized = new Error("Unauthorized. Run `/login deepseek` to authenticate.");

export default function (pi: ExtensionAPI): void {
  pi.registerTool({
    name: "web-search",
    label: "DeepSeek Web Search",
    description: "Search web pages for a query and return structured results.",
    parameters: searchInput,
    outputSchema: searchOutput,
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const apiKey = await ctx.modelRegistry.getApiKeyForProvider("deepseek");
      if (apiKey === undefined) throw unauthorized;

      const response = await fetch("https://api.deepseek.com/v1/tools/search", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(params),
        signal: signal ?? null,
      });

      if (!response.ok) {
        if (response.status === 401) throw unauthorized;

        const errorText = await response.text().catch(() => "");
        throw new Error(
          `DeepSeek Search API error (status ${response.status}): ${errorText || response.statusText}`,
        );
      }

      const data = (await response.json()) as Static<typeof searchOutput>;
      const formatted = data.results
        .map((r, i) =>
          [
            `${i + 1}. ${r.title}`,
            `   URL: ${r.url}`,
            ...(r.date ? [`   Date: ${r.date}`] : []),
            r.summary || r.snippet,
            ...(r.content ? [r.content] : []),
          ].join("\n"),
        )
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
    label: "DeepSeek Web Fetch",
    description: "Fetch a single web page and return its content as Markdown.",
    parameters: fetchInput,
    outputSchema: fetchOutput,
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const apiKey = await ctx.modelRegistry.getApiKeyForProvider("deepseek");
      if (apiKey === undefined) throw unauthorized;

      const response = await fetch("https://api.deepseek.com/v1/tools/fetch", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(params),
        signal: signal ?? null,
      });

      if (!response.ok) {
        if (response.status === 401) throw unauthorized;

        const errorText = await response.text().catch(() => "");
        throw new Error(
          `DeepSeek Fetch API error (status ${response.status}): ${errorText || response.statusText}`,
        );
      }

      const data = (await response.json()) as Static<typeof fetchOutput>;
      return {
        content: [{ type: "text", text: `Title: ${data.title}\n\n${data.content}` }],
        structuredContent: data,
        details: {},
      };
    },
  });
}
