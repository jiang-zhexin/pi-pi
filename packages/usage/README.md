# Pi Usage

A unified `/usage <provider>` command for the [Pi](https://pi.dev) coding agent.

```bash
pi install npm:@zhexin/pi-usage
```

## Adapter protocol

- Listen for `pi-usage:discover`. The payload is `{ add }`. Call
  `add({ id, label, authHint? })` synchronously, with `id` matching your Pi
  provider ID. The optional `authHint` tells users how to configure credentials.
- Listen for `pi-usage:request`. The payload is `{ provider, ctx }`, where
  `provider` is the selected ID and `ctx` is the `ExtensionCommandContext`.
  Ignore requests for other providers. Resolve credentials and display results
  or errors in the adapter; the command does not wait for the query.

Adapters do not need to depend on this package.

## License

MIT
