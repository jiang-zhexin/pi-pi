# Pi DeepSeek Enhancement

DeepSeek Enhancement Extension for the [Pi](https://pi.dev) coding agent.

Includes **web search/fetch**, **OCR**, and **ASR** tools, plus an optional balance query.

Most extensions I've tried seem to be compensating for something. Config that fights pi's philosophy, feature lists that look like a spaceship's dashboard, and UIs that assume you wanted a personal assistant.

This one does less. On purpose.

## Features

- **Boring code.** Small, readable TypeScript. Auditing it takes less time than reading this README.
- **Boring config.** No config files, no opinionated defaults. Set one API key, get on with your life.
- **Invisible.** No standalone commands or UI.

## Quick Start

### Installation

```bash
pi install npm:@zhexin/pi-deepseek
```

### Setup Your DeepSeek API Key

```bash
pi auth login deepseek
```

### Check Your Balance

Install [`@zhexin/pi-usage`](../usage/README.md) and run `/usage deepseek` to see
whether your balance is sufficient for API calls, plus your total, granted, and
topped-up balances by currency.

## LICENSE

MIT
