import { openAsBlob } from "node:fs";
import { basename, resolve } from "node:path";

import type {
  ExtensionAPI,
  ExtensionContext,
  ToolNamespace,
} from "@earendil-works/pi-coding-agent";
import type { Static } from "typebox";

import * as schema from "./schema.ts";

const unauthorized = new Error("Unauthorized. Run `/login deepseek` to authenticate.");

const deepseekNamespace: ToolNamespace = {
  name: "deepseek",
  description: "DeepSeek web search/fetch, document/image OCR, and speech-to-text ASR tools",
};

async function resolveDeepSeekRequest(ctx: ExtensionContext, path: string) {
  const authResult = await ctx.modelRegistry.getProviderAuth("deepseek");
  const apiKey = authResult?.auth.apiKey;
  if (apiKey === undefined) throw unauthorized;

  const baseUrl =
    authResult?.auth.baseUrl ??
    ctx.modelRegistry.getProvider("deepseek")?.baseUrl ??
    "https://api.deepseek.com";

  return {
    url: new URL(path, baseUrl),
    headers: {
      ...authResult?.auth.headers,
      Authorization: `Bearer ${apiKey}`,
    },
  };
}

export default function (pi: ExtensionAPI): void {
  pi.registerTool({
    name: "web-search",
    label: "DeepSeek Web Search",
    namespace: deepseekNamespace,
    description: "Search web pages for a query and return structured results.",
    promptSnippet: "Search the web for current information",
    parameters: schema.searchInput,
    outputSchema: schema.searchOutput,
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const { url, headers } = await resolveDeepSeekRequest(ctx, "/v1/tools/search");

      const response = await fetch(url, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
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

      const data = (await response.json()) as Static<typeof schema.searchOutput>;
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
    namespace: deepseekNamespace,
    description: "Fetch a single web page and return its content as Markdown.",
    promptSnippet: "Fetch a web page by URL and return its content as Markdown",
    parameters: schema.fetchInput,
    outputSchema: schema.fetchOutput,
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const { url, headers } = await resolveDeepSeekRequest(ctx, "/v1/tools/fetch");

      const response = await fetch(url, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
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

      const data = (await response.json()) as Static<typeof schema.fetchOutput>;
      return {
        content: [{ type: "text", text: `Title: ${data.title}\n\n${data.content}` }],
        structuredContent: data,
        details: {},
      };
    },
  });

  pi.registerTool({
    name: "ocr",
    label: "DeepSeek OCR",
    namespace: deepseekNamespace,
    description:
      "Recognize text in a PDF, Word (DOC, DOCX), PowerPoint (PPT, PPTX), or image (PNG, JPEG, WebP, GIF, BMP, TIFF) file page by page.",
    promptSnippet: "Extract text from PDF, Word, PowerPoint, or image files via OCR",
    promptGuidelines: [
      "Use ocr instead of read for .pdf, .doc, .docx, .ppt, and .pptx files, or when extracting dense text from document images.",
    ],
    parameters: schema.ocrInput,
    outputSchema: schema.ocrOutput,
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const { url, headers } = await resolveDeepSeekRequest(ctx, "/v1/tools/ocr");
      const filePath = resolve(ctx.cwd, params.path.replace(/^@/, ""));
      const blob = await openAsBlob(filePath);

      const formData = new FormData();
      formData.append("file", blob, basename(filePath));
      formData.append("purpose", params.purpose);

      const response = await fetch(url, {
        method: "POST",
        headers,
        body: formData,
        signal: signal ?? null,
      });

      if (!response.ok) {
        if (response.status === 401) throw unauthorized;

        const errorText = await response.text().catch(() => "");
        throw new Error(
          `DeepSeek OCR API error (status ${response.status}): ${errorText || response.statusText}`,
        );
      }

      const data = (await response.json()) as
        | Static<typeof schema.ocrOutput>
        | { error: { message?: string; code?: string } };

      if ("error" in data) {
        throw new Error(
          `DeepSeek OCR API error: ${data.error.message || data.error.code || "Recognition failed"}`,
        );
      }

      const formatted = data.pages
        .map((p) => `--- Page ${p.index + 1} ---\n${p.text}`)
        .join("\n\n");

      return {
        content: [{ type: "text", text: formatted || "No text recognized." }],
        structuredContent: data,
        details: {},
      };
    },
  });

  pi.registerTool({
    name: "asr",
    label: "DeepSeek ASR",
    exposure: "codemode",
    namespace: deepseekNamespace,
    description:
      "Transcribe speech from an audio file (16-bit PCM WAV or Ogg Opus, max 8 MiB, max 120 seconds) into text.",
    promptSnippet: "Transcribe speech from WAV or Ogg Opus audio files into text",
    promptGuidelines: ["Use asr to transcribe speech from .wav or .ogg/.opus audio files."],
    parameters: schema.asrInput,
    outputSchema: schema.asrOutput,
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const { url, headers } = await resolveDeepSeekRequest(ctx, "/v1/tools/asr");
      const filePath = resolve(ctx.cwd, params.path.replace(/^@/, ""));
      const blob = await openAsBlob(filePath);

      const formData = new FormData();
      formData.append("file", blob, basename(filePath));

      const response = await fetch(url, {
        method: "POST",
        headers,
        body: formData,
        signal: signal ?? null,
      });

      if (!response.ok) {
        if (response.status === 401) throw unauthorized;

        const errorText = await response.text().catch(() => "");
        throw new Error(
          `DeepSeek ASR API error (status ${response.status}): ${errorText || response.statusText}`,
        );
      }

      const data = (await response.json()) as Static<typeof schema.asrOutput>;
      return {
        content: [{ type: "text", text: data.text }],
        structuredContent: data,
        details: {},
      };
    },
  });
}
