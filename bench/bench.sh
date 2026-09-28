#!/usr/bin/env bash
# bench.sh — time `cub install` vs `bun install` on the fixture.
#
# Usage: ./bench.sh [--runs N]
#   Times installs and prints a results table. Never fakes numbers.
set -u

RUNS=1
for arg in "$@"; do
  case "$arg" in
    --runs=*) RUNS="${arg#--runs=}" ;;
    --runs) shift ;;
  esac
done
if [ "${1:-}" = "--runs" ]; then RUNS="${2:-1}"; fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FIXTURE="$SCRIPT_DIR/fixture"
CUB_BIN="$(cd "$SCRIPT_DIR/.." && pwd)/bin/cub"

have_cub_install=false
if [ -x "$CUB_BIN" ]; then
  TMPD="$(mktemp -d)"
  cp "$FIXTURE/package.json" "$TMPD/package.json"
  # A real installer must exit 0 AND actually lay down node_modules.
  if (cd "$TMPD" && node "$CUB_BIN" install >/dev/null 2>&1) && \
     [ -d "$TMPD/node_modules/ms" ] && [ -d "$TMPD/node_modules/debug" ]; then
    have_cub_install=true
  fi
  rm -rf "$TMPD"
fi

now_ns() { date +%s%N; }
elapsed_s() { awk "BEGIN {printf \"%.2f\", ($2 - $1) / 1000000000}"; }

run_bun_once() {
  local workdir="$1"
  rm -rf "$workdir/node_modules" "$workdir/bun.lockb" 2>/dev/null || true
  local t0 t1
  t0="$(now_ns)"
  (cd "$workdir" && bun install --silent >/dev/null 2>&1)
  local rc=$?
  t1="$(now_ns)"
  if [ $rc -ne 0 ]; then echo "FAIL"; return 1; fi
  elapsed_s "$t0" "$t1"
}

run_cub_once() {
  local workdir="$1"
  rm -rf "$workdir/node_modules" "$workdir/cub-lock.json" 2>/dev/null || true
  local t0 t1
  t0="$(now_ns)"
  (cd "$workdir" && CUB_CACHE_DIR="$workdir/.cub-cache" node "$CUB_BIN" install >/dev/null 2>&1)
  local rc=$?
  t1="$(now_ns)"
  if [ $rc -ne 0 ]; then echo "FAIL"; return 1; fi
  if [ ! -d "$workdir/node_modules/ms" ]; then echo "FAIL-NOINSTALL"; return 1; fi
  elapsed_s "$t0" "$t1"
}

echo "=== cub vs bun benchmark ==="
echo "fixture : $FIXTURE/package.json"
echo "runs    : $RUNS"
echo "date    : $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "node    : $(node --version 2>/dev/null || echo n/a)"
echo "bun     : $(bun --version 2>/dev/null || echo n/a)"
echo ""

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
cp "$FIXTURE/package.json" "$WORK/package.json"

bun_times=()
for ((i = 1; i <= RUNS; i++)); do
  t="$(run_bun_once "$WORK")" || { echo "bun install failed (run $i). Check network/registry."; exit 1; }
  bun_times+=("$t")
  echo "bun  run $i: ${t}s"
done

if [ "$have_cub_install" = true ]; then
  cub_times=()
  for ((i = 1; i <= RUNS; i++)); do
    t="$(run_cub_once "$WORK")" || { echo "cub install failed (run $i)."; exit 1; }
    cub_times+=("$t")
    echo "cub  run $i: ${t}s"
  done
else
  echo ""
  echo "cub install: NO WORKING INSTALLER (nothing installed) — TODO-measure."
fi

echo ""
echo "--- results ---"
printf "%-8s %10s\n" "tool" "seconds"
for t in "${bun_times[@]}"; do printf "%-8s %10s\n" "bun" "$t"; done
if [ "$have_cub_install" = true ]; then
  for t in "${cub_times[@]}"; do printf "%-8s %10s\n" "cub" "$t"; done
  bun_best="$(printf "%s\n" "${bun_times[@]}" | sort -n | head -1)"
  cub_best="$(printf "%s\n" "${cub_times[@]}" | sort -n | head -1)"
  speedup="$(awk "BEGIN {printf \"%.2f\", $bun_best / $cub_best}")"
  echo "best: bun ${bun_best}s vs cub ${cub_best}s → ${speedup}x"
else
  echo "cub: TODO-measure (installer not implemented yet)"
fi
