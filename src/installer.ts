import { chmod, mkdir, readFile, rename, rm, symlink, readlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { downloadTarball, resolveSpec, type ResolvedPackage } from "./registry.js";
import { extractTgz } from "./extract.js";
import { getCacheDir, tarballCachePath } from "./cache.js";
import {
  buildLockfile,
  collectDeps,
  readLockfile,
  readPackageJson,
  writeLockfile,
  type CubLockfile,
} from "./lockfile.js";

export const CONCURRENCY = 20;

export interface InstallOptions {
  dev?: boolean;
  registry?: string;
  concurrency?: number;
  useLockfile?: boolean;
}

/** Bounded parallel map — keeps at most `limit` promises in flight. */
export async function pool<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = new Array(Math.min(Math.max(limit, 1), items.length)).fill(0).map(async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}

async function readCachedTarball(integrity: string): Promise<Buffer | null> {
  try {
    return await readFile(tarballCachePath(integrity));
  } catch {
    return null;
  }
}

async function writeCachedTarball(integrity: string, data: Buffer): Promise<void> {
  try {
    const p = tarballCachePath(integrity);
    await mkdir(dirname(p), { recursive: true });
    const tmp = `${p}.${process.pid}.${randomUUID().slice(0, 8)}.tmp`;
    const { writeFile } = await import("node:fs/promises");
    await writeFile(tmp, data);
    await rename(tmp, p).catch(async () => {
      // Another worker won the race; drop ours.
      await rm(tmp, { force: true });
    });
  } catch {
    // Cache is best-effort.
  }
}

export async function fetchTarballCached(pkg: ResolvedPackage): Promise<Buffer> {
  const hit = await readCachedTarball(pkg.integrity);
  if (hit) return hit;
  const data = await downloadTarball(pkg.tarball, pkg.integrity);
  await writeCachedTarball(pkg.integrity, data);
  return data;
}

function stageDirFor(cwd: string, name: string): { stage: string; final: string } {
  const final = join(cwd, "node_modules", ...name.split("/"));
  const stage = join(
    cwd,
    "node_modules",
    ".cub-stage",
    `${name.replace("/", "+")}.${process.pid}.${randomUUID().slice(0, 8)}`,
  );
  return { stage, final };
}

export async function installOne(
  cwd: string,
  pkg: ResolvedPackage,
  opts: InstallOptions = {},
): Promise<void> {
  const data = await fetchTarballCached(pkg);
  const { stage, final } = stageDirFor(cwd, pkg.name);
  await rm(stage, { recursive: true, force: true });
  await mkdir(stage, { recursive: true });
  await extractTgz(data, stage);
  await mkdir(dirname(final), { recursive: true });
  // Atomic publish: stage -> temp backup -> rename.
  const backup = `${final}.${randomUUID().slice(0, 8)}.old`;
  const hadExisting = existsSync(final);
  if (hadExisting) {
    await rename(final, backup);
  }
  try {
    await rename(stage, final);
  } catch (err) {
    if (hadExisting) await rename(backup, final).catch(() => {});
    throw err;
  }
  if (hadExisting) await rm(backup, { recursive: true, force: true });
  await linkPackageBin(cwd, pkg.name);
}

export async function linkPackageBin(cwd: string, name: string): Promise<void> {
  const pkgDir = join(cwd, "node_modules", ...name.split("/"));
  let manifest: { bin?: string | Record<string, string>; name?: string };
  try {
    manifest = JSON.parse(await readFile(join(pkgDir, "package.json"), "utf8"));
  } catch {
    return;
  }
  if (!manifest.bin) return;
  const bins: Record<string, string> =
    typeof manifest.bin === "string" ? { [manifest.name ?? name]: manifest.bin } : manifest.bin;
  const binDir = join(cwd, "node_modules", ".bin");
  await mkdir(binDir, { recursive: true });
  for (const [binName, rel] of Object.entries(bins)) {
    const target = join(pkgDir, rel);
    const link = join(binDir, binName);
    await rm(link, { force: true });
    // Relative symlink so node_modules stays relocatable.
    const { relative } = await import("node:path");
    await symlink(relative(binDir, target), link).catch(async () => {
      // Fallback: absolute symlink.
      await rm(link, { force: true });
      await symlink(target, link);
    });
    try {
      await chmod(target, 0o755);
    } catch {
      // non-fatal (e.g. windows)
    }
  }
}

export interface InstallResult {
  installed: ResolvedPackage[];
  lock: CubLockfile;
}

/**
 * Full install: resolve every dep (parallel, shared packument cache),
 * download tarballs in parallel (concurrency 20), cache, atomic extract,
 * link bins, write cub-lock.json.
 */
export async function installAll(cwd: string, opts: InstallOptions = {}): Promise<InstallResult> {
  const concurrency = opts.concurrency ?? CONCURRENCY;
  const pkg = await readPackageJson(cwd);
  const includeDev = opts.dev !== false && process.env.NODE_ENV !== "production";
  const deps = collectDeps(pkg, includeDev);
  const devDeps = new Set(Object.keys(pkg.devDependencies ?? {}));

  await mkdir(join(cwd, "node_modules"), { recursive: true });
  await mkdir(join(tmpdir(), "cub"), { recursive: true });
  await mkdir(getCacheDir(), { recursive: true });

  const entries = Object.entries(deps);
  // Phase 1: resolve versions (parallel; packument fetch shared via cache).
  const resolved: ResolvedPackage[] = await pool(entries, concurrency, async ([name, range]) => {
    const hit = await tryLockHit(cwd, name, range, opts);
    if (hit) return hit;
    return resolveSpec(name, range, opts.registry);
  });

  // Phase 2: download + extract + link (parallel, bounded).
  await pool(resolved, concurrency, async (r) => {
    await installOne(cwd, r, opts);
  });

  const lock = buildLockfile(
    pkg,
    resolved.map((r) => ({ ...r, dev: devDeps.has(r.name) })),
  );
  await writeLockfile(cwd, lock);
  return { installed: resolved, lock };
}

/** Reuse cub-lock.json entry when it still satisfies the requested range. */
async function tryLockHit(
  cwd: string,
  name: string,
  range: string,
  opts: InstallOptions,
): Promise<ResolvedPackage | null> {
  if (opts.useLockfile === false) return null;
  try {
    const lock = await readLockfile(cwd);
    if (!lock) return null;
    const { satisfies } = await import("./semver.js");
    for (const [key, entry] of Object.entries(lock.packages)) {
      if (key.startsWith(`${name}@`) && satisfies(entry.version, range)) {
        return { name, version: entry.version, tarball: entry.resolved, integrity: entry.integrity };
      }
    }
  } catch {
    // fall through to registry
  }
  return null;
}

/** `cub install pkg[@range]...` — resolve ad-hoc specs and install. */
export async function installSpecs(
  cwd: string,
  specs: string[],
  opts: InstallOptions = {},
): Promise<InstallResult> {
  const { parseSpecString } = await import("./semver.js");
  const concurrency = opts.concurrency ?? CONCURRENCY;
  await mkdir(join(cwd, "node_modules"), { recursive: true });
  const parsed = specs.map(parseSpecString);
  const resolved = await pool(parsed, concurrency, (s) => resolveSpec(s.name, s.range, opts.registry));
  await pool(resolved, concurrency, (r) => installOne(cwd, r, opts));
  const pkg = await readPackageJson(cwd).catch(() => ({ name: "", version: "0.0.0" }));
  const lock = buildLockfile(pkg, resolved);
  await writeLockfile(cwd, lock);
  return { installed: resolved, lock };
}

export { readlink };
