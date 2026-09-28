# Cub

Fast, Bun-compatible package installer. Zero runtime dependencies.

Cub reads your `package.json`, resolves the tree against the public package registry,
fetches tarballs in parallel, verifies integrity hashes, scans for known
vulnerabilities (`cub audit`), and links everything
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
bun add github:hashYdev/cub
cub install
```

Curl installer:

```sh
curl -fsSL https://raw.githubusercontent.com/hashYdev/cub/main/install.sh | sh
cub install
```

See [docs/INSTALL.md](docs/INSTALL.md) for Bun, curl, manual, and uninstall options.

## Usage

| Command              | What it does                                      |
| -------------------- | ------------------------------------------------- |
| `cub install`        | Install all deps from `package.json`              |
| `cub add <pkg...>`   | Add deps and record them in `package.json`        |
| `cub remove <pkg...>`| Remove deps and prune `node_modules`              |
| `cub run <script>`   | Run a `package.json` script                       |
| `cub audit`          | Scan locked deps for known vulnerabilities (OSV)  |
| `cub init [dir]`     | Scaffold a publishable package                    |
| `cub login`          | Authenticate against the package registry         |
| `cub publish`        | Pack and publish to the package registry          |

Full reference: [docs/CLI.md](docs/CLI.md). Publishing guide: [docs/PUBLISH.md](docs/PUBLISH.md).

## Benchmark

Fixture: `bench/fixture/package.json` (`ms@2.1.3`, `debug@4.3.4`, `chalk@5.3.0`).
Runner: `bench/bench.sh --runs 1`. Machine: node v22.22.1, bun 1.4.2, measured 2026-09-28.

| Tool | Cold install | Warm install |
| ---- | ------------ | ------------ |
| bun | 6.25s | ~0.2s |
| cub | 8.19s | 1.25s |

Bun leads on this tiny fixture — its global cache is extremely hot. Cub stays
competitive with zero runtime dependencies plus built-in `cub audit` scanning,
which bun doesn't do at install time.

Reproduce: `bash bench/bench.sh --runs 1`.

## Layout

```
bin/cub            CLI entry point
lib/               publish / init helpers
src/               installer core + audit scanner
install.sh         curl|sh installer (git source-tarball fallback, no releases)
bench/             benchmark script + fixture
docs/              INSTALL, CLI, PUBLISH guides
```
