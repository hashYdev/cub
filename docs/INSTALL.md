# Install Cub

## Option 1 — npm (works today)

```sh
npm i -g cubpkg
```

## Option 2 — curl | sh (after first publish)

```sh
curl -fsSL https://raw.githubusercontent.com/bmaka6130-rgb/cub/main/install.sh | sh
```

This downloads the release tarball, verifies checksum,
and installs `cub` to `~/.cub/bin`. Local use now:

```sh
sh /root/cub/install.sh
```

## Option 3 — Bun

```sh
bun install -g cubpkg
```

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
