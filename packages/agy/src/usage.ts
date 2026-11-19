import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";

import { PROJECT_HEADER, rpc } from "./ccpa.ts";

type QuotaSummary = {
  groups: {
    displayName: string;
    buckets: {
      bucketId: string;
      displayName: string;
      window: string;
      remainingFraction: number;
      resetTime: string;
    }[];
  }[];
};

function resetLabel(resetTime: string | undefined, now: number): string {
  const minutes = Math.ceil((Date.parse(resetTime ?? "") - now) / 60_000);
  if (!Number.isFinite(minutes) || minutes <= 0) return "";
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const remaining = days
    ? `${days}d ${hours % 24}h`
    : hours
      ? `${hours}h ${minutes % 60}m`
      : `${minutes}m`;
  return ` · resets in ${remaining}`;
}

export async function usage(ctx: ExtensionCommandContext): Promise<void> {
  const output = (text: string) => {
    if (ctx.hasUI) ctx.ui.notify(text);
    else console.log(text);
  };

  const resolved = await ctx.modelRegistry.getProviderAuth("agy");
  const auth = resolved?.auth;
  const project = auth?.headers?.[PROJECT_HEADER];
  if (!auth?.apiKey || !auth.baseUrl || !project) {
    output("Run /login agy to authenticate.");
    return;
  }
  const summary = await rpc<QuotaSummary>(
    auth.apiKey,
    auth.baseUrl,
    "retrieveUserQuotaSummary",
    { project },
    ctx.signal ?? AbortSignal.timeout(30_000),
  );
  const now = Date.now();
  const groups = summary.groups.flatMap((group) => {
    const buckets = group.buckets.map((bucket) => {
      const fraction = bucket.remainingFraction;
      const left = `${String(Math.round(Math.max(0, Math.min(1, fraction)) * 100)).padStart(3)}% left`;
      const label = bucket.window || bucket.displayName || bucket.bucketId || "Quota";
      return `  ${label.padEnd(6)}  ${left}${resetLabel(bucket.resetTime, now)}`;
    });
    return buckets.length ? [[group.displayName || "AGY", ...buckets].join("\n")] : [];
  });
  output(groups.join("\n\n") || "No quota information available.");
}
