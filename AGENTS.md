# Cub repo — agent notes

This repo IS the cub package manager. Source in `src/` (TypeScript, zero
runtime deps), entry point `bin/cub`, publish/init helpers in `lib/`.

## Build / test

```sh
npm run build   # tsc → dist/
bun test        # all unit tests must pass before push
sh -n install.sh
```

## Conventions

- No new runtime dependencies. Global `fetch` only; Node ≥ 18 APIs only.
- `bin/cub` handles `publish|init|login|whoami`; everything else delegates to `dist/cli.js` (built from `src/`). Keep both help texts in sync.
- Benchmarks: `bench/bench.sh --runs 1` (baseline is `bun install`). Never invent numbers — only report measured runs.
- Docs live next to code: `docs/INSTALL.md`, `docs/CLI.md`, `docs/PUBLISH.md`, plus root `README.md`. Update docs in the same commit as behavior changes.
- Install paths offered to users: `bun add github:hashYdev/cub`, curl installer, git clone. No registry publishing, no releases.
- Security: `src/audit.ts` queries OSV live. No vendored signatures, no hidden files — everything shipped is readable in this repo by design.
