import { randomBytes, timingSafeEqual } from "node:crypto";
import { once } from "node:events";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createInterface } from "node:readline";
import { Readable } from "node:stream";

import {
  clampThinkingLevel,
  lazyStream,
  type GoogleOptions,
  type Model,
  type ModelThinkingLevel,
  type ProviderStreams,
  type SimpleStreamOptions,
  type StreamOptions,
  type TranscriptContext,
} from "@earendil-works/pi-ai";
import { clampMaxTokensToContext } from "@earendil-works/pi-ai/api/simple-options";
import { googleGenerativeAIApi } from "@earendil-works/pi-ai/compat";

import { endpointUrl, PROJECT_HEADER, USER_AGENT } from "./ccpa.ts";

async function readBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 64 * 1024 * 1024) throw new Error("AGY request exceeds 64 MiB.");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function unwrap(
  upstream: Response,
  response: ServerResponse,
  signal: AbortSignal,
): Promise<void> {
  if (!upstream.body) throw new Error("AGY returned an empty response body.");
  const input = Readable.fromWeb(upstream.body).setEncoding("utf8");
  const lines = createInterface({ input, crlfDelay: Infinity });
  let data: string[] = [];
  const flush = async () => {
    if (!data.length) return;
    const text = data.join("\n");
    data = [];
    if (text === "[DONE]") return;
    const event = JSON.parse(text) as { response?: unknown };
    if (!response.write(`data: ${JSON.stringify(event.response ?? event)}\n\n`)) {
      await once(response, "drain", { signal });
    }
  };
  try {
    for await (const line of lines) {
      signal.throwIfAborted();
      if (!line) await flush();
      else if (line.startsWith("data:")) data.push(line.slice(5).replace(/^ /, ""));
    }
    await flush();
  } finally {
    lines.close();
    input.destroy();
  }
}

async function bridge(
  model: Model<string>,
  backendId: string,
  access: string,
  project: string,
  endpoint: string,
  options: StreamOptions,
) {
  const key = randomBytes(32).toString("base64url");
  const forward = async (request: IncomingMessage, response: ServerResponse) => {
    const supplied = request.headers["x-goog-api-key"];
    if (
      typeof supplied !== "string" ||
      Buffer.byteLength(supplied) !== Buffer.byteLength(key) ||
      !timingSafeEqual(Buffer.from(supplied), Buffer.from(key)) ||
      request.headers.origin
    ) {
      response.writeHead(401).end();
      return;
    }
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    const match = /^\/models\/([^/]+):streamGenerateContent$/.exec(url.pathname);
    if (request.method !== "POST" || !match?.[1]) {
      response.writeHead(404).end();
      return;
    }
    const disconnected = new AbortController();
    response.on("close", () => disconnected.abort());
    const signal = AbortSignal.any([
      disconnected.signal,
      AbortSignal.timeout(options.timeoutMs ?? 300_000),
      ...(options.signal ? [options.signal] : []),
    ]);
    const body = await readBody(request);
    const upstream = await (options.fetch ?? fetch)(
      `${endpoint}/v1internal:streamGenerateContent?alt=sse`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${access}`,
          "Content-Type": "application/json",
          "User-Agent": USER_AGENT,
        },
        body: JSON.stringify({ project, model: backendId, request: body }),
        signal,
        redirect: "error",
      },
    );
    try {
      await options.onResponse?.(
        { status: upstream.status, headers: Object.fromEntries(upstream.headers) },
        model,
      );
      response.writeHead(upstream.status, {
        "Content-Type":
          upstream.headers.get("content-type") ??
          (upstream.ok ? "text/event-stream" : "application/json"),
        ...(upstream.headers.has("retry-after")
          ? { "Retry-After": upstream.headers.get("retry-after")! }
          : {}),
      });
      if (upstream.ok) await unwrap(upstream, response, signal);
      else response.write(Buffer.from(await upstream.arrayBuffer()));
      response.end();
    } finally {
      if (upstream.body && !upstream.body.locked) await upstream.body.cancel().catch(() => {});
    }
  };
  const server = createServer((request, response) => {
    void forward(request, response).catch((error: unknown) => {
      if (response.destroyed) return;
      if (response.headersSent) response.destroy(error instanceof Error ? error : undefined);
      else
        response.writeHead(502, { "Content-Type": "application/json" }).end(
          JSON.stringify({
            error: {
              code: 502,
              message: error instanceof Error ? error.message : "AGY forwarding failed",
            },
          }),
        );
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  server.unref();
  const address = server.address();
  if (!address || typeof address === "string") {
    server.close();
    throw new Error("Could not start the AGY request adapter.");
  }
  return {
    key,
    baseUrl: `http://127.0.0.1:${address.port}`,
    close() {
      server.close();
      server.closeAllConnections();
    },
  };
}

const google = googleGenerativeAIApi();

function stream(
  method: "stream" | "streamSimple",
  model: Model<string>,
  context: TranscriptContext,
  options: SimpleStreamOptions & GoogleOptions = {},
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
      const requestedLevel =
        method === "streamSimple"
          ? (options.reasoning ?? "off")
          : options.thinking?.enabled
            ? ((options.thinking.level?.toLowerCase() as ModelThinkingLevel | undefined) ??
              "medium")
            : "off";
      const level = clampThinkingLevel(model, requestedLevel);
      const backendId = model.thinkingLevelMap?.[level];
      const adapter = await bridge(
        model,
        backendId ?? model.id,
        options.apiKey,
        project,
        endpointUrl(model.baseUrl),
        options,
      );
      const { fetch: _fetch, onResponse: _onResponse, ...innerOptions } = options;
      headers.delete(PROJECT_HEADER);
      headers.delete("authorization");
      headers.delete("x-goog-api-key");
      return (async function* () {
        try {
          // AGY selects thinking effort through the backend ID, not Gemini's thinking config.
          yield* google[backendId ? "stream" : method](
            { ...model, baseUrl: adapter.baseUrl, headers: Object.fromEntries(headers) },
            context,
            {
              ...innerOptions,
              maxTokens:
                method === "streamSimple"
                  ? clampMaxTokensToContext(
                      model,
                      context,
                      innerOptions.maxTokens ?? model.maxTokens,
                    )
                  : (innerOptions.maxTokens ?? model.maxTokens),
              ...(backendId ? { thinking: { enabled: true } } : {}),
              apiKey: adapter.key,
              headers: Object.fromEntries(headers),
            },
          );
        } finally {
          adapter.close();
        }
      })();
    },
    undefined,
    options.signal,
  );
}

export const api: ProviderStreams = {
  stream: (model, context, options) => stream("stream", model, context, options),
  streamSimple: (model, context, options) => stream("streamSimple", model, context, options),
};
