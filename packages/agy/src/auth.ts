import { createHash, randomBytes } from "node:crypto";
import { createServer } from "node:http";

import type { OAuthAuth, OAuthCredential, ProviderAuthInteraction } from "@earendil-works/pi-ai";

import { agyCredential, jsonRequest, onboard, PROJECT_HEADER } from "./ccpa.ts";

const CLIENT_ID = "1071006060591-tmhssin2h21lcre235vtolojh4g403ep.apps.googleusercontent.com";
const CLIENT_SECRET = "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";
const SCOPES = ["cloud-platform", "userinfo.email", "aicode"].map(
  (scope) => `https://www.googleapis.com/auth/${scope}`,
);

type Token = { access_token: string; refresh_token?: string; expires_in: number };

async function exchange(params: Record<string, string>, signal: AbortSignal): Promise<Token> {
  const token = await jsonRequest<Token>(
    "https://oauth2.googleapis.com/token",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        ...params,
      }).toString(),
    },
    signal,
  );
  if (
    typeof token.access_token !== "string" ||
    !token.access_token ||
    !Number.isFinite(token.expires_in) ||
    token.expires_in <= 0 ||
    (token.refresh_token !== undefined && typeof token.refresh_token !== "string")
  ) {
    throw new Error("Google returned an invalid OAuth token response.");
  }
  return token;
}

async function login(interaction: ProviderAuthInteraction): Promise<OAuthCredential> {
  const signal = AbortSignal.any([interaction.signal, AbortSignal.timeout(300_000)]);
  signal.throwIfAborted();
  const verifier = randomBytes(32).toString("base64url");
  const state = randomBytes(32).toString("base64url");
  const callback = Promise.withResolvers<string>();
  void callback.promise.catch(() => {});
  let claimed = false;
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    response.setHeader("Content-Type", "text/plain; charset=utf-8");
    response.setHeader("Cache-Control", "no-store");
    if (request.method !== "GET" || url.pathname !== "/") {
      response.writeHead(404).end("Not found");
    } else if (
      url.searchParams.getAll("state").length !== 1 ||
      url.searchParams.get("state") !== state
    ) {
      response.writeHead(400).end("Invalid OAuth state");
    } else if (claimed) {
      response.writeHead(409).end("Callback already received");
    } else if (url.searchParams.has("error")) {
      claimed = true;
      response.writeHead(400).end("Authorization failed. Return to Pi.");
      callback.reject(new Error(`Google authorization failed: ${url.searchParams.get("error")}`));
    } else if (url.searchParams.getAll("code").length !== 1 || !url.searchParams.get("code")) {
      response.writeHead(400).end("Missing authorization code");
    } else {
      claimed = true;
      response.end("Authorization received. Return to Pi to finish signing in.");
      callback.resolve(url.searchParams.get("code")!);
    }
  });
  const onAbort = () =>
    callback.reject(
      new Error(interaction.signal.aborted ? "Login cancelled" : "AGY login timed out."),
    );
  try {
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    server.on("error", (error) => callback.reject(error));
    signal.addEventListener("abort", onAbort, { once: true });
    signal.throwIfAborted();
    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("Could not start the OAuth callback listener.");
    const redirectUri = `http://127.0.0.1:${address.port}/`;
    const params = new URLSearchParams({
      client_id: CLIENT_ID,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: SCOPES.join(" "),
      access_type: "offline",
      prompt: "consent",
      state,
      code_challenge: createHash("sha256").update(verifier).digest("base64url"),
      code_challenge_method: "S256",
    });
    interaction.notify({
      type: "auth_url",
      url: `https://accounts.google.com/o/oauth2/v2/auth?${params}`,
      instructions: "Complete Google sign-in in the browser on this machine.",
    });
    const code = await callback.promise;
    const token = await exchange(
      {
        grant_type: "authorization_code",
        code,
        code_verifier: verifier,
        redirect_uri: redirectUri,
      },
      signal,
    );
    if (!token.refresh_token)
      throw new Error("Google returned no refresh token. Run /login agy again and grant consent.");
    interaction.notify({
      type: "progress",
      message: "Resolving AGY project and model endpoint...",
    });
    const backend = await onboard(token.access_token, signal);
    return {
      type: "oauth",
      access: token.access_token,
      refresh: token.refresh_token,
      expires: Date.now() + token.expires_in * 1000,
      ...backend,
    };
  } finally {
    signal.removeEventListener("abort", onAbort);
    server.close();
    server.closeAllConnections();
  }
}

export const oauth: OAuthAuth = {
  name: "Antigravity",
  isSubscription: true,
  login,
  async refresh(credential, signal) {
    agyCredential(credential);
    const token = await exchange(
      { grant_type: "refresh_token", refresh_token: credential.refresh },
      signal,
    );
    return {
      ...credential,
      access: token.access_token,
      refresh: token.refresh_token || credential.refresh,
      expires: Date.now() + token.expires_in * 1000,
    };
  },
  async toAuth(credential) {
    const { access, project, endpoint } = agyCredential(credential);
    return { apiKey: access, baseUrl: endpoint, headers: { [PROJECT_HEADER]: project } };
  },
};
