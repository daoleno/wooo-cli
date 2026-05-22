# wooo

This repository is a Bun-managed monorepo for wooo.

## Apps

- `apps/cli` - the publishable `wooo-cli` package.
- `apps/docs` - the user-facing docs and landing page built with Fumadocs.

## Development

```bash
bun install
bun run dev:cli -- --help
bun run dev:docs
bun run build
bun run ci:check
```

The CLI package README lives at [apps/cli/README.md](./apps/cli/README.md).
