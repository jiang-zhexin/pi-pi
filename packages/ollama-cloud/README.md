# Pi Ollama Cloud

Yet Another Ollama Cloud Provider Extension for the [Pi](https://pi.dev) coding agent.

Registers the `ollama-cloud` provider, classifier (`clef:27b`), and **web search/fetch** tools (`web-search`, `web-fetch`).

## Features

- **Provider & Classifier.** Pre-configured Ollama Cloud chat models and `systemone` classifier support.
- **Web Tools.** Built-in `web-search` and `web-fetch` tools backed by Ollama Cloud APIs.
- **Boring config.** Set `OLLAMA_API_KEY` (or log in via `/login ollama-cloud`) and go.

## Quick Start

### Installation

```bash
pi install npm:@zhexin/pi-ollama-cloud
```

### Setup Your Ollama API Key

```bash
export OLLAMA_API_KEY="your-api-key"
```

## LICENSE

MIT
