import type { ProviderModelConfig } from "@earendil-works/pi-coding-agent";

// Source: https://developer.ecnu.edu.cn/vitepress/llm/model.html
// Costs are off-peak credits per 1M tokens; peak-hour rates are doubled.
export const models: ProviderModelConfig[] = [
  {
    id: "ecnu-max",
    name: "DeepSeek V4.1 Flash 1017",
    reasoning: true,
    thinkingLevelMap: {
      minimal: null,
      low: "low",
      medium: null,
      high: "high",
      xhigh: null,
      max: "max",
    },
    input: ["text", "image"],
    cost: { input: 300, output: 1200, cacheRead: 30, cacheWrite: 0 },
    contextWindow: 512 * 1024,
    maxTokens: 256 * 1024,
    compat: {
      supportsStore: false,
      supportsDeveloperRole: false,
      supportsReasoningEffort: true,
      thinkingFormat: "deepseek",
      maxTokensField: "max_tokens",
      supportsStrictMode: false,
      requiresReasoningContentOnAssistantMessages: true,
    },
  },
  {
    id: "ecnu-plus",
    name: "Qwen3.8 Flash Next",
    reasoning: true,
    thinkingLevelMap: {
      minimal: null,
      low: "low",
      medium: "medium",
      high: null,
      xhigh: "xhigh",
      max: null,
    },
    input: ["text", "image"],
    cost: { input: 100, output: 400, cacheRead: 10, cacheWrite: 0 },
    contextWindow: 256 * 1024,
    maxTokens: 128 * 1024,
    compat: {
      supportsStore: false,
      supportsDeveloperRole: false,
      supportsReasoningEffort: true,
      thinkingFormat: "deepseek",
      maxTokensField: "max_tokens",
      supportsStrictMode: false,
      requiresReasoningContentOnAssistantMessages: true,
    },
  },
  {
    type: "image",
    id: "ecnu-image",
    name: "Qwen Image 2.1",
    api: "ecnu-images",
    input: ["text", "image"],
    output: ["image"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  },
];
