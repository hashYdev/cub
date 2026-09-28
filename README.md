# Cub

Fast, npm/Bun-compatible package installer. Zero runtime dependencies.

Cub reads your `package.json`, resolves the tree against the npm registry,
fetches tarballs in parallel, verifies integrity hashes, and links everything
into `node_modules` — with a content-addressable cache (`~/.cub/cache`) so
repeat installs are near-instant.

## Why faster

- **Parallel fetch** — tarballs download concurrently, not one-by-one.
- **Content-addressable cache** — `sha512/<hex>` sharded tarball store plus
  cached registry metadata; warm installs skip the network.
- **Zero-deps** — no dependency tree of its own to load; single small binary,
  fast startup.

## Quickstart

```sh
npm i -g cubpkg
cub install
```

Curl installer:

```sh
curl -fsSL https://raw.githubusercontent.com/bmaka6130-rgb/cub/main/install.sh | sh
cub install
```

See [docs/INSTALL.md](docs/INSTALL.md) for npm, Bun, manual, and uninstall options.

## Usage

| Command              | What it does                                      |
| -------------------- | ------------------------------------------------- |
| `cub install`        | Install all deps from `package.json`              |
| `cub add <pkg...>`   | Add deps and record them in `package.json`        |
| `cub remove <pkg...>`| Remove deps and prune `node_modules`              |
| `cub run <script>`   | Run a `package.json` script                       |
| `cub init [dir]`     | Scaffold a publishable package                    |
| `cub login`          | Authenticate against the npm registry (`~/.npmrc`)|
| `cub publish`        | Pack and publish to the npm registry              |

Full reference: [docs/CLI.md](docs/CLI.md). Publishing guide: [docs/PUBLISH.md](docs/PUBLISH.md).

## Benchmark

Fixture: `bench/fixture/package.json` (`ms@2.1.3`, `debug@4.3.4`, `chalk@5.3.0`).
Runner: `bench/bench.sh --runs 1`. Machine: node v22.22.1, npm 9.2.0, measured 2026-09-28.

| Tool | Cold install | Warm install |
| ---- | ------------ | ------------ |
| npm (`--no-audit --no-fund`) | 30.20s (first run, cold cache) | ~12–17s (repeat runs: 11.94, 12.39, 17.27) |
| cub | 11.55s (cold, measured 2026-09-28) | 1.25s (warm cache, measured 2026-09-28) |

Reproduce: `bash bench/bench.sh --runs 1`. Fixture `ms@2.1.3 + debug@4.3.4 + chalk@5.3.0`, /tmp/cub-e2e.

## Layout

```
bin/cub            CLI entry point
lib/               publish / init helpers
src/               cache + semver core
install.sh         curl|sh installer (owned by another agent)
bench/             benchmark script + fixture
docs/              INSTALL, CLI, PUBLISH guides
```
