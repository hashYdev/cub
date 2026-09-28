#!/bin/sh
# cub installer (POSIX sh)
# Installs the latest `cub` release from the npm registry, with a
# GitHub release-tarball fallback.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/hashYdev/cub/main/install.sh | sh
#   curl -fsSL https://raw.githubusercontent.com/hashYdev/cub/main/install.sh | sh -s -- --prefix "$HOME/.cub" --no-verify
#
# Options:
#   --prefix DIR   install root (default: $HOME/.cub, or /usr/local if writable+root)
#   --no-verify    skip `cub --version` check
#   -h, --help     show help

set -eu

PKG="${CUB_PKG:-cubpkg}"
# Package lives at https://www.npmjs.com/package/cubpkg (publisher: woahbutter).
# Override with CUB_PKG / CUB_REGISTRY for forks or custom registries.
REGISTRY="${CUB_REGISTRY:-https://registry.npmjs.org}"
# URL-encode the package name for metadata fetch (@scope%2fname).
case "$PKG" in
  @*/*)
    _scope="${PKG%%/*}"
    _base="${PKG#*/}"
    PKG_ENC="${_scope}%2f${_base}";;
  *) PKG_ENC="$PKG";;
esac
NPM_META="$REGISTRY/$PKG_ENC/latest"
# Fallback if the registry metadata fetch fails.
GH_FALLBACK_REPO="hashYdev/cub"

prefix=""
verify=1

usage() {
  echo "Usage: install.sh [--prefix DIR] [--no-verify] [-h|--help]"
}

for arg in "$@"; do
  case "$arg" in
    --prefix=*) prefix="${arg#--prefix=}";;
    --prefix) echo "--prefix needs --prefix=DIR" >&2; exit 1;;
    --no-verify) verify=0;;
    -h|--help) usage; exit 0;;
    *) echo "unknown option: $arg" >&2; usage >&2; exit 1;;
  esac
done

# --- OS / arch detection (informational; npm tarball is platform-independent) ---
os="$(uname -s 2>/dev/null || echo unknown)"
arch="$(uname -m 2>/dev/null || echo unknown)"

case "$os" in
  Linux) os="linux";;
  Darwin) os="darwin";;
  *) echo "warn: unsupported OS '$os' — continuing anyway" >&2; os="linux";;
esac

case "$arch" in
  x86_64|amd64) arch="x64";;
  aarch64|arm64) arch="arm64";;
  *) echo "warn: unsupported arch '$arch' — continuing anyway" >&2;;
esac

echo "cub installer: os=$os arch=$arch"

# --- prerequisites ---
need() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "error: missing required tool: $1" >&2
    exit 1
  fi
}
need curl
need tar
need mktemp

# --- install root ---
if [ -z "$prefix" ]; then
  if [ "$(id -u 2>/dev/null || echo 1000)" = "0" ] && [ -w /usr/local/bin 2>/dev/null ]; then
    prefix="/usr/local"
  else
    prefix="${HOME:-$HOME}/.cub"
  fi
fi
bindir="$prefix/bin"
mkdir -p "$bindir"

# --- resolve latest tarball URL from npm metadata ---
echo "resolving latest $PKG from $NPM_META ..."
meta="$(mktemp)"
trap 'rm -f "$meta"' EXIT INT TERM
if ! curl -fsSL "$NPM_META" -o "$meta"; then
  if [ -n "$GH_FALLBACK_REPO" ]; then
    echo "registry fetch failed, trying GitHub fallback $GH_FALLBACK_REPO" >&2
    tarball="https://github.com/$GH_FALLBACK_REPO/releases/latest/download/cub-$os-$arch.tar.gz"
    version="github-latest"
  else
    echo "error: could not fetch $NPM_META (curl failed)" >&2
    exit 1
  fi
else
  # Parse JSON without jq: grab "tarball" and "version" fields.
  tarball="$(grep -o '"tarball":"[^"]*"' "$meta" | head -n 1 | cut -d'"' -f4)"
  version="$(grep -o '"version":"[^"]*"' "$meta" | head -n 1 | cut -d'"' -f4)"
  if [ -z "$tarball" ]; then
    # Scoped-shape or pretty-printed JSON fallback.
    tarball="$(grep -o 'https\{0,1\}://[^ "]*\.tgz' "$meta" | head -n 1)"
  fi
  if [ -z "$tarball" ]; then
    echo "error: could not parse tarball URL from registry metadata" >&2
    exit 1
  fi
  if [ -z "$version" ]; then
    version="unknown"
  fi
fi

echo "latest: $version"
echo "tarball: $tarball"

# --- download + extract ---
tmpd="$(mktemp -d)"
trap 'rm -rf "$tmpd" "$meta"' EXIT INT TERM
pkgfile="$tmpd/cub.tgz"
curl -fsSL "$tarball" -o "$pkgfile"
tar -xzf "$pkgfile" -C "$tmpd"
# npm tarballs extract to ./package/...
srcdir="$tmpd/package"
if [ ! -d "$srcdir" ]; then
  # GitHub-style fallback tarballs may extract to ./cub-*/...
  srcdir="$(find "$tmpd" -maxdepth 2 -name cub -type f -printf '%h\n' 2>/dev/null | head -n 1)"
  if [ -z "$srcdir" ]; then
    echo "error: could not find cub payload in $tarball" >&2
    exit 1
  fi
fi

# Install: copy package tree next to bindir, link executable.
dest="$prefix/lib/cub"
mkdir -p "$dest"
# POSIX-safe copy (cp -a is non-standard; use tar pipe).
(cd "$srcdir" && tar -cf - .) | (cd "$dest" && tar -xf -)
if [ -f "$dest/bin/cub" ]; then
  chmod +x "$dest/bin/cub"
  ln -sf "$dest/bin/cub" "$bindir/cub"
elif [ -f "$dest/cub" ]; then
  chmod +x "$dest/cub"
  ln -sf "$dest/cub" "$bindir/cub"
else
  echo "error: no cub executable found in payload ($srcdir)" >&2
  ls -R "$srcdir" >&2
  exit 1
fi

echo "installed cub to $bindir/cub"

# --- PATH hint ---
case ":$PATH:" in
  *":$bindir:"*) ;;
  *)
    echo ""
    echo "Add cub to your PATH:"
    echo "  export PATH=\"$bindir:\$PATH\""
    ;;
esac

# --- verify ---
if [ "$verify" = "1" ]; then
  if [ -x "$bindir/cub" ]; then
    "$bindir/cub" --version
    echo "verify ok: cub --version succeeded"
  else
    echo "error: $bindir/cub not executable" >&2
    exit 1
  fi
fi

echo "done."
