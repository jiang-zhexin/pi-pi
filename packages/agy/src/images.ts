import {
  calculateCost,
  type AssistantImages,
  type ProviderImages,
  type Usage,
} from "@earendil-works/pi-ai";

import { endpointUrl, PROJECT_HEADER, USER_AGENT } from "./ccpa.ts";

type GeminiResponse = {
  responseId: string;
  candidates: {
    content: {
      parts: {
        thought: boolean;
        text: string;
        inlineData: { mimeType: string; data: string };
      }[];
    };
    finishReason: string;
    finishMessage: string;
  }[];
  promptFeedback: { blockReason: string; blockReasonMessage: string };
  usageMetadata: {
    promptTokenCount: number;
    candidatesTokenCount: number;
    cachedContentTokenCount: number;
    thoughtsTokenCount: number;
    totalTokenCount: number;
  };
};

export const imagesApi: ProviderImages = {
  async generateImages(model, context, options): Promise<AssistantImages> {
    const result: AssistantImages = {
      api: model.api,
      provider: model.provider,
      model: model.id,
      output: [],
      stopReason: "stop",
      timestamp: Date.now(),
    };
    const signal = options?.signal;

    try {
      signal?.throwIfAborted();
      const headers = new Headers();
      for (const [name, value] of Object.entries({ ...model.headers, ...options?.headers }))
        if (value !== null) headers.set(name, value);
      const project = headers.get(PROJECT_HEADER);
      if (!options?.apiKey || !project) throw new Error("Run /login agy to authenticate.");

      const payload = {
        contents: [
          {
            role: "user",
            parts: context.input.map((item) =>
              item.type === "text"
                ? { text: item.text }
                : { inlineData: { data: item.data, mimeType: item.mimeType } },
            ),
          },
        ],
        generationConfig: { responseModalities: ["TEXT", "IMAGE"] },
      };

      const httpResponse = await (options.fetch ?? fetch)(
        `${endpointUrl(model.baseUrl)}/v1internal:generateContent`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${options.apiKey}`,
            "Content-Type": "application/json",
            "User-Agent": USER_AGENT,
          },
          body: JSON.stringify({
            project,
            model: model.id,
            request: payload,
          }),
          redirect: "error",
          signal: signal ?? null,
        },
      );

      if (!httpResponse.ok) {
        const body = (await httpResponse.json().catch(() => undefined)) as
          | { error?: { message?: string } }
          | undefined;
        const message = body?.error?.message;
        throw new Error(
          `AGY image request failed (HTTP ${httpResponse.status})${message ? `: ${message}` : ""}`,
        );
      }

      const wrapped = (await httpResponse.json()) as GeminiResponse & { response?: GeminiResponse };
      const response = wrapped.response ?? wrapped;
      const candidate = response.candidates?.[0];
      for (const { thought, text, inlineData } of candidate?.content.parts ?? []) {
        if (thought) continue;
        if (text) result.output.push({ type: "text", text });
        if (inlineData) result.output.push({ type: "image", ...inlineData });
      }
      if (response.responseId) result.responseId = response.responseId;
      if (response.usageMetadata) {
        const raw = response.usageMetadata;
        const usage: Usage = {
          input: raw.promptTokenCount - raw.cachedContentTokenCount,
          output: raw.candidatesTokenCount + raw.thoughtsTokenCount,
          cacheRead: raw.cachedContentTokenCount,
          cacheWrite: 0,
          reasoning: raw.thoughtsTokenCount,
          totalTokens: raw.totalTokenCount,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
        };
        calculateCost(model, usage);
        result.usage = usage;
      }
      if (!result.output.some((block) => block.type === "image")) {
        const reason =
          response.promptFeedback?.blockReasonMessage ||
          response.promptFeedback?.blockReason ||
          candidate?.finishMessage ||
          (candidate?.finishReason === "STOP" ? undefined : candidate?.finishReason);
        throw new Error(`AGY returned no image${reason ? `: ${reason}` : "."}`);
      }
    } catch (error) {
      result.stopReason = signal?.aborted ? "aborted" : "error";
      result.errorMessage = error instanceof Error ? (error.stack ?? error.message) : String(error);
    }
    return result;
  },
};
