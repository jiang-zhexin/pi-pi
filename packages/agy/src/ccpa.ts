import { arch, platform } from "node:os";
import { setTimeout } from "node:timers/promises";

import type {
  Model,
  ModelThinkingLevel,
  OAuthCredential,
  ThinkingLevelMap,
} from "@earendil-works/pi-ai";

const PROD = "https://cloudcode-pa.googleapis.com";
const DAILY = "https://daily-cloudcode-pa.googleapis.com";
export const PROJECT_HEADER = "x-agy-project";
export const USER_AGENT = `antigravity/acp/1.5.0 (aidev_client; os_type=${platform() === "win32" ? "windows" : platform()}; arch=${arch() === "x64" ? "amd64" : arch()}; proxy_client=antigravity/sdk)`;

export type AgyCredential = OAuthCredential & { project: string; endpoint: string };

type LoadResult = {
  currentTier?: { id?: string };
  paidTier?: { usesGcpTos?: boolean };
  cloudaicompanionProject?: string;
  allowedTiers?: { id?: string }[];
  ineligibleTiers?: { reasonMessage?: string }[];
};

type Catalog = {
  models: Record<
    string,
    {
      displayName?: string;
      maxTokens: number;
      maxOutputTokens: number;
      recommended?: boolean;
    }
  >;
  agentModelSorts: {
    groups: {
      modelIds: string[];
    }[];
  }[];
};

export function endpointUrl(value: string): string {
  if (value !== PROD && value !== DAILY)
    throw new Error("Invalid AGY endpoint. Run /login agy again.");
  return value;
}

export function agyCredential(credential: OAuthCredential): AgyCredential {
  if (
    typeof credential.project !== "string" ||
    !credential.project ||
    typeof credential.endpoint !== "string"
  ) {
    throw new Error("AGY credentials are incomplete. Run /login agy again.");
  }
  endpointUrl(credential.endpoint);
  return credential as AgyCredential;
}

export async function jsonRequest<T>(
  url: string,
  init: RequestInit,
  signal: AbortSignal,
): Promise<T> {
  const response = await fetch(url, {
    ...init,
    redirect: "error",
    signal: AbortSignal.any([signal, AbortSignal.timeout(30_000)]),
  });
  const body = (await response.json().catch(() => undefined)) as
    | {
        error?: string | { message?: string };
        error_description?: string;
      }
    | undefined;
  if (!response.ok) {
    const message =
      body?.error_description ??
      (typeof body?.error === "string" ? body.error : body?.error?.message);
    throw new Error(`AGY request failed (HTTP ${response.status})${message ? `: ${message}` : ""}`);
  }
  if (!body || typeof body !== "object" || Array.isArray(body))
    throw new Error("AGY returned an invalid JSON response.");
  return body as T;
}

export function rpc<T>(
  access: string,
  endpoint: string,
  method: string,
  body: unknown,
  signal: AbortSignal,
): Promise<T> {
  return jsonRequest<T>(
    `${endpointUrl(endpoint)}/v1internal:${method}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${access}`,
        "Content-Type": "application/json",
        "User-Agent": USER_AGENT,
      },
      body: JSON.stringify(body),
    },
    signal,
  );
}

export async function onboard(
  access: string,
  signal: AbortSignal,
): Promise<{ project: string; endpoint: string }> {
  const load = (endpoint: string) =>
    rpc<LoadResult>(
      access,
      endpoint,
      "loadCodeAssist",
      { metadata: { ideType: "ANTIGRAVITY" } },
      signal,
    );
  let result = await load(PROD);
  const endpoint = result.paidTier?.usesGcpTos ? PROD : DAILY;
  if (!result.currentTier || !result.cloudaicompanionProject) {
    if (!result.allowedTiers?.some((tier) => tier.id === "free-tier")) {
      throw new Error(
        result.ineligibleTiers?.find((tier) => tier.reasonMessage)?.reasonMessage ??
          "This account is not eligible for AGY free-tier.",
      );
    }
    type Operation = { name?: string; done?: boolean; error?: { message?: string } };
    let operation = await rpc<Operation>(
      access,
      endpoint,
      "onboardUser",
      {
        tierId: "free-tier",
        metadata: { ideType: "ANTIGRAVITY" },
      },
      signal,
    );
    const operationName = operation.name;
    for (let attempt = 0; !operation.done; attempt++) {
      if (!operationName) throw new Error("AGY onboarding returned no operation name.");
      if (attempt === 30) throw new Error("AGY onboarding timed out.");
      await setTimeout(1000, undefined, { signal });
      operation = await jsonRequest<Operation>(
        `${endpoint}/v1internal/${operationName.split("/").map(encodeURIComponent).join("/")}`,
        {
          headers: { Authorization: `Bearer ${access}`, "User-Agent": USER_AGENT },
        },
        signal,
      );
    }
    if (operation.error) throw new Error(operation.error.message ?? "AGY onboarding failed.");
    result = await load(endpoint);
  }
  if (typeof result.cloudaicompanionProject !== "string" || !result.cloudaicompanionProject)
    throw new Error("AGY returned no managed project.");
  return { project: result.cloudaicompanionProject, endpoint };
}

export async function fetchModels(
  credential: AgyCredential,
  signal: AbortSignal,
): Promise<Model<"google-generative-ai">[]> {
  const catalog = await rpc<Catalog>(
    credential.access,
    credential.endpoint,
    "fetchAvailableModels",
    { project: credential.project },
    signal,
  );
  const ids = catalog.agentModelSorts.flatMap((sort) =>
    sort.groups.flatMap((group) => group.modelIds),
  );

  const variants = ids.map((id) => {
    const info = catalog.models[id]!;
    const match = /^(.*)-(off|minimal|low|medium|high|xhigh|max)$/.exec(id);
    const modelId = match?.[1] ?? id;
    const level = match?.[2] as ModelThinkingLevel | undefined;
    const name = info.displayName || modelId;
    return {
      id,
      modelId,
      level,
      name: level ? name.replace(new RegExp(`\\s*\\(${level}\\)\\s*$`, "i"), "") : name,
      contextWindow: info.maxTokens,
      maxOutputTokens: info.maxOutputTokens,
    };
  });
  const models = [...Map.groupBy(variants, ({ modelId }) => modelId)].map(
    ([id, variants]): Model<"google-generative-ai"> => {
      const levels = variants.flatMap(({ level, id }) => (level ? [[level, id]] : []));
      const thinkingLevelMap: ThinkingLevelMap = {
        off: null,
        minimal: null,
        low: null,
        medium: null,
        high: null,
        xhigh: null,
        max: null,
        ...Object.fromEntries(levels),
      };
      return {
        id,
        name: variants[0]!.name,
        provider: "agy",
        api: "google-generative-ai",
        baseUrl: credential.endpoint,
        reasoning: true,
        thinkingLevelMap,
        input: ["text", "image"],
        contextWindow: variants[0]!.contextWindow,
        maxTokens: variants[0]!.maxOutputTokens,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      };
    },
  );
  return models;
}
