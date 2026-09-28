# Install Cub — no accounts, no registry

## Option 1 — Bun from git (recommended)

```sh
bun add github:hashYdev/cub
```

Global:

```sh
bun install -g github:hashYdev/cub
```

## Option 2 — npm from git

```sh
npm i -g github:hashYdev/cub
```

## Option 3 — curl | sh

```sh
curl -fsSL https://raw.githubusercontent.com/hashYdev/cub/main/install.sh | sh
```

Installs `cub` to `~/.cub/bin` (or `/usr/local/bin` as root).

## Option 4 — manual

1. Download the tarball for your platform from the releases page.
2. Unpack it and place the `cub` binary somewhere on your `PATH`, e.g. `~/.cub/bin` or `/usr/local/bin`.
3. `chmod +x cub`.

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

# npm global install
npm rm -g cubpkg

# bun global install
bun rm -g cubpkg
```

Remove the `PATH` line from your shell rc file if you added one.
The package cache lives at `~/.cub/cache` (override with `CUB_CACHE_DIR`);
deleting it only forces re-downloads, nothing else breaks.
