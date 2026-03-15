# payload-toolkit

A Turborepo monorepo for scaffolding Payload CMS projects with a composable block-based layout system.

## Packages

| Package | Description |
|---------|-------------|
| `apps/starter` | Full Payload CMS starter with block-based layouts, SEO, forms, and admin customizer |
| `packages/create-payload-starter` | CLI tool to scaffold new projects from the starter template |
| `packages/shared` | Shared utilities for database creation and environment setup |

## Quick Start

```bash
npx @jon8800/create-payload-starter
```

## Development

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm turbo build

# Typecheck
pnpm turbo typecheck
```

## Structure

```
payload-toolkit/
  apps/
    starter/          # Payload CMS starter app
  packages/
    create-payload-starter/  # CLI scaffolding tool
    shared/                  # Shared database/env utilities
```

## License

MIT
