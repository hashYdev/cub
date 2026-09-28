# Install Cub — no accounts, no registry

> Use the `hashYdev/cub` URLs below. The old `bmaka6130-rgb/cub` links are
> dead (that account is restricted) and return 404.

## Option 1 — Bun from git (recommended)

```sh
bun add github:hashYdev/cub
```

Global:

```sh
bun install -g github:hashYdev/cub
```

## Option 2 — curl | sh

```sh
curl -fsSL https://raw.githubusercontent.com/hashYdev/cub/main/install.sh | sh
```

Installs `cub` to `~/.cub/bin` (or `/usr/local/bin` as root). Needs only
`curl`, `tar`, `mktemp` — no registry account, no releases.

## Option 3 — manual (git clone)

```sh
git clone https://github.com/hashYdev/cub.git
cd cub
bun install   # dev deps for building only
bun run build
export PATH="$PWD/bin:$PATH"
cub --version
```

## PATH setup

The `curl|sh` installer puts Cub in `~/.cub/bin`. Add it to your shell:

```sh
# ~/.bashrc / ~/.zshrc
export PATH="$HOME/.cub/bin:$PATH"
```

Verify:

```sh
cub --version
```

## Uninstall

```sh
# curl|sh or manual install
rm -rf ~/.cub

# bun global install (package is registered as cubpkg)
bun rm -g cubpkg
```

Remove the `PATH` line from your shell rc file if you added one.
The package cache lives at `~/.cub/cache` (override with `CUB_CACHE_DIR`);
deleting it only forces re-downloads, nothing else breaks.
