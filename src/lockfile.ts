import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

export interface CubLockPackage {
  version: string;
  resolved: string;
  integrity: string;
  dev?: boolean;
}

export interface CubLockfile {
  name: string;
  version: string;
  lockfileVersion: 1;
  packages: Record<string, CubLockPackage>;
}

export interface PackageJson {
  name?: string;
  version?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
  bin?: string | Record<string, string>;
}

export async function readPackageJson(cwd: string): Promise<PackageJson> {
  const raw = await readFile(join(cwd, "package.json"), "utf8");
  return JSON.parse(raw) as PackageJson;
}

export async function writePackageJson(cwd: string, pkg: PackageJson): Promise<void> {
  await writeFile(join(cwd, "package.json"), JSON.stringify(pkg, null, 2) + "\n", "utf8");
}

/** Merge deps + optionalDeps (+ devDeps unless production). */
export function collectDeps(pkg: PackageJson, includeDev: boolean): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(pkg.optionalDependencies ?? {})) out[k] = v;
  for (const [k, v] of Object.entries(pkg.dependencies ?? {})) out[k] = v;
  if (includeDev) {
    for (const [k, v] of Object.entries(pkg.devDependencies ?? {})) {
      if (!(k in out)) out[k] = v;
    }
  }
  return out;
}

export async function readLockfile(cwd: string): Promise<CubLockfile | null> {
  try {
    const raw = await readFile(join(cwd, "cub-lock.json"), "utf8");
    return JSON.parse(raw) as CubLockfile;
  } catch {
    return null;
  }
}

export function buildLockfile(
  pkg: PackageJson,
  resolved: Array<{ name: string; version: string; tarball: string; integrity: string; dev?: boolean }>,
): CubLockfile {
  const packages: Record<string, CubLockPackage> = {};
  for (const r of resolved) {
    packages[`${r.name}@${r.version}`] = {
      version: r.version,
      resolved: r.tarball,
      integrity: r.integrity,
      ...(r.dev ? { dev: true } : {}),
    };
  }
  return {
    name: pkg.name ?? "",
    version: pkg.version ?? "0.0.0",
    lockfileVersion: 1,
    packages,
  };
}

export async function writeLockfile(cwd: string, lock: CubLockfile): Promise<void> {
  const sorted: Record<string, CubLockPackage> = {};
  for (const k of Object.keys(lock.packages).sort()) sorted[k] = lock.packages[k];
  await writeFile(
    join(cwd, "cub-lock.json"),
    JSON.stringify({ ...lock, packages: sorted }, null, 2) + "\n",
    "utf8",
  );
}
