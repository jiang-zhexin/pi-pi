# pi-pi

A collection of minimalist extension packages for the [Pi](https://pi.dev) coding agent.

Each package in this monorepo is independently published under the `@zhexin/pi-*` scope, focused on doing one thing cleanly without unnecessary config files, UI clutter, or ceremony.

## Packages

| Package                                                        | Description                                                                     |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| [`@zhexin/pi-deepseek`](./packages/deepseek/README.md)         | Web search and web fetch tools powered by DeepSeek (`web-search`, `web-fetch`). |
| [`@zhexin/pi-ecnu`](./packages/ecnu/README.md)                 | ECNU Chat provider with chat and image models.                                  |
| [`@zhexin/pi-ollama-cloud`](./packages/ollama-cloud/README.md) | Ollama Cloud provider and web search/fetch tools (`web-search`, `web-fetch`).   |

## Development

This repository uses `nub` as its package manager and workspace runner, with packages organized under `packages/*`.

### Setup

```bash
nub install
```

### Scripts

```bash
nub run check   # Type-check all packages with tsc
nub run lint    # Lint with oxlint
nub run fmt     # Format with oxfmt
```

### Testing Locally with Pi

Load a local workspace package directly in Pi:

```bash
pi -e ./packages/deepseek
```

Or install it locally during development:

```bash
pi install ./packages/deepseek
```

## Adding a Package

Create a new directory under `packages/<name>` following the conventions in:

```text
packages/<name>/
├── LICENSE
├── README.md
├── index.ts
├── package.json
└── src/
    └── index.ts
```

Key `package.json` conventions for Pi packages in this repo:

- Include `"pi-package"` in `keywords` for Pi package gallery discovery.
- Declare extension entry points under `"pi": { "extensions": ["./index.ts"] }`.
- Put Pi host-provided dependencies (such as `@earendil-works/pi-coding-agent`, `@earendil-works/pi-ai`, `@earendil-works/pi-tui`, `@earendil-works/pi-agent-core`, `typebox`) in `peerDependencies` with `"*"` rather than `dependencies`.
- Set `repository.directory` to `packages/<name>`.

## License

MIT
