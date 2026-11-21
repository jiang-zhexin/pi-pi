import {
  clampThinkingLevel,
  lazyStream,
  type FetchFunction,
  type GoogleOptions,
  type Model,
  type ModelThinkingLevel,
  type ProviderStreams,
  type StreamOptions,
  type TranscriptContext,
} from "@earendil-works/pi-ai";
import { googleGenerativeAIApi } from "@earendil-works/pi-ai/compat";

import { endpointUrl, PROJECT_HEADER, USER_AGENT } from "./ccpa.ts";

function createSseUnwrapTransform(): TransformStream<string, string> {
  let lineBuffer = "";
  let data: string[] = [];

  const flushEvent = (controller: TransformStreamDefaultController<string>) => {
    if (!data.length) return;
    const text = data.join("\n");
    data = [];
    if (text === "[DONE]") return;
    const event = JSON.parse(text) as { response?: unknown };
    controller.enqueue(`data: ${JSON.stringify(event.response ?? event)}\n\n`);
  };

  const processLine = (line: string, controller: TransformStreamDefaultController<string>) => {
    const normalized = line.endsWith("\r") ? line.slice(0, -1) : line;
    if (!normalized) flushEvent(controller);
    else if (normalized.startsWith("data:")) data.push(normalized.slice(5).replace(/^ /, ""));
  };

  return new TransformStream<string, string>({
    transform(chunk, controller) {
      lineBuffer += chunk;
      const lines = lineBuffer.split("\n");
      lineBuffer = lines.pop() ?? "";
      for (const line of lines) processLine(line, controller);
    },
    flush(controller) {
      if (lineBuffer) processLine(lineBuffer, controller);
      flushEvent(controller);
    },
  });
}

async function parseRequestBody(
  input: Parameters<FetchFunction>[0],
  init?: RequestInit,
): Promise<unknown> {
  if (typeof init?.body === "string") return JSON.parse(init.body);
  if (init?.body != null) return new Response(init.body).json();
  if (input instanceof Request) return input.json();
  throw new Error("AGY request is missing a JSON body.");
}

function createAgyFetch(
  model: Model<string>,
  backendId: string,
  access: string,
  project: string,
  endpoint: string,
  options: StreamOptions,
): FetchFunction {
  const baseFetch = options.fetch ?? fetch;

  return async (input, init) => {
    const rawUrl =
      typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const url = new URL(rawUrl);
    const method = (
      init?.method ?? (input instanceof Request ? input.method : "GET")
    ).toUpperCase();
    if (method !== "POST" || !/^\/models\/([^/]+):streamGenerateContent$/.test(url.pathname)) {
      return new Response(null, { status: 404 });
    }

    const signals: AbortSignal[] = [AbortSignal.timeout(options.timeoutMs ?? 300_000)];
    if (init?.signal) signals.push(init.signal);
    if (options.signal && options.signal !== init?.signal) signals.push(options.signal);
    const signal = AbortSignal.any(signals);

    const body = await parseRequestBody(input, init);
    const upstream = await baseFetch(`${endpoint}/v1internal:streamGenerateContent?alt=sse`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${access}`,
        "Content-Type": "application/json",
        "User-Agent": USER_AGENT,
      },
      body: JSON.stringify({ project, model: backendId, request: body }),
      signal,
      redirect: "error",
    });

    await options
      .onResponse?.(
        { status: upstream.status, headers: Object.fromEntries(upstream.headers) },
        model,
      )
      ?.catch(async (error) => {
        await upstream.body?.cancel().catch(() => {});
        throw error;
      });

    if (!upstream.ok) return upstream;
    if (!upstream.body) throw new Error("AGY returned an empty response body.");

    const unwrapped = upstream.body
      .pipeThrough(new TextDecoderStream())
      .pipeThrough(createSseUnwrapTransform())
      .pipeThrough(new TextEncoderStream());

    return new Response(unwrapped, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: {
        "Content-Type": upstream.headers.get("content-type") ?? "text/event-stream",
      },
    });
  };
}

const google = googleGenerativeAIApi();

function readGoogleThinkingLevel({ thinking }: GoogleOptions): ModelThinkingLevel {
  if (!thinking?.enabled) return "off";
  return (thinking.level?.toLowerCase() as ModelThinkingLevel | undefined) ?? "medium";
}

function streamAgy(
  model: Model<string>,
  context: TranscriptContext,
  options: GoogleOptions,
  requestedLevel: ModelThinkingLevel,
) {
  return lazyStream(
    model,
    async () => {
      options.signal?.throwIfAborted();
      const headers = new Headers();
      for (const [name, value] of Object.entries({ ...model.headers, ...options.headers }))
        if (value !== null) headers.set(name, value);

      const project = headers.get(PROJECT_HEADER);
      if (!options.apiKey || !project) throw new Error("Run /login agy to authenticate.");

      const level = clampThinkingLevel(model, requestedLevel);
      const backendId = model.thinkingLevelMap?.[level];
      if (!backendId) {
        throw new Error(`AGY model "${model.id}" has no backend ID for thinking level "${level}".`);
      }

      const endpoint = endpointUrl(model.baseUrl);
      const agyFetch = createAgyFetch(model, backendId, options.apiKey, project, endpoint, options);
      const { fetch: _fetch, onResponse: _onResponse, ...innerOptions } = options;

      headers.delete(PROJECT_HEADER);
      headers.delete("authorization");
      headers.delete("x-goog-api-key");
      const cleanHeaders = Object.fromEntries(headers);

      const streamOptions: GoogleOptions = {
        ...innerOptions,
        maxTokens: innerOptions.maxTokens ?? model.maxTokens,
        // AGY selects thinking effort through the backend ID, not Gemini's thinking config.
        thinking: { enabled: true },
        apiKey: "agy",
        headers: cleanHeaders,
        fetch: agyFetch,
      };
      return google.stream(
        { ...model, baseUrl: endpoint, headers: cleanHeaders },
        context,
        streamOptions,
      );
    },
    undefined,
    options.signal,
  );
}

export const api: ProviderStreams = {
  stream(model, context, options = {}) {
    return streamAgy(model, context, options, readGoogleThinkingLevel(options));
  },
  streamSimple(model, context, options = {}) {
    const { reasoning = "off", ...googleOptions } = options;
    return streamAgy(model, context, googleOptions, reasoning);
  },
};
