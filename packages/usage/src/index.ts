import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

type UsageProvider = {
  id: string;
  label: string;
  authHint?: string;
};

export default function (pi: ExtensionAPI): void {
  function discover() {
    const providers = new Map<string, UsageProvider>();
    pi.events.emit("pi-usage:discover", {
      add: (provider: UsageProvider) => providers.set(provider.id, provider),
    });
    return providers;
  }

  pi.registerCommand("usage", {
    description: "Show usage or remaining quota for a provider",
    getArgumentCompletions(prefix) {
      const items = [...discover().values()]
        .filter(({ id }) => id.startsWith(prefix))
        .map(({ id, label }) => ({ value: id, label: id, description: label }));
      return items.length ? items : null;
    },
    async handler(args, ctx) {
      let provider = args.trim();

      const notify = (message: string, level: "info" | "warning" = "info") => {
        if (ctx.hasUI) ctx.ui.notify(message, level);
        else console.log(message);
      };

      const providers = discover();
      if (!provider) {
        const options = [...providers.keys()];
        if (!options.length) {
          notify("No usage adapters are loaded.", "warning");
          return;
        }
        if (!ctx.hasUI) {
          notify(`Usage: /usage <provider>\nDiscovered providers: ${options.join(", ")}`);
          return;
        }
        const selected = await ctx.ui.select("Select a provider", options);
        if (selected === undefined) return;
        provider = selected;
      }

      const adapter = providers.get(provider);
      if (!adapter) {
        notify(`No usage adapter is loaded for "${provider}".`, "warning");
        return;
      }
      if (!ctx.modelRegistry.getProviderAuthStatus(provider).configured) {
        notify(adapter.authHint ?? `Configure credentials for ${provider} first.`, "warning");
        return;
      }

      pi.events.emit("pi-usage:request", { provider, ctx });
    },
  });
}
