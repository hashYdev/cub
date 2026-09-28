import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { getCacheDir, metadataCachePath } from "./cache.js";
import { maxVersion, resolveVersion } from "./semver.js";

export const DEFAULT_REGISTRY =
  process.env.CUB_REGISTRY ?? "https://registry.npmjs.org";

export interface ResolvedPackage {
  name: string;
  version: string;
  tarball: string;
  integrity: string;
}

interface PackumentVersion {
  dist: { tarball: string; integrity?: string; shasum?: string };
}

interface Packument {
  "dist-tags": Record<string, string>;
  versions: Record<string, PackumentVersion>;
}

// In-memory packument cache so repeated deps reuse one fetch per run.
const packumentCache = new Map<string, Promise<Packument>>();

export function clearRegistryCache(): void {
  packumentCache.clear();
}

async function readCachedPackument(name: string, maxAgeMs: number): Promise<Packument | null> {
  try {
    const raw = await readFile(metadataCachePath(name), "utf8");
    const doc = JSON.parse(raw) as { time: number; data: Packument };
    if (Date.now() - doc.time > maxAgeMs) return null;
    return doc.data;
  } catch {
    return null;
  }
}

async function writeCachedPackument(name: string, data: Packument): Promise<void> {
  try {
    const p = metadataCachePath(name);
    await mkdir(dirname(p), { recursive: true });
    await writeFile(p, JSON.stringify({ time: Date.now(), data }), "utf8");
  } catch {
    // Cache is best-effort.
  }
}

export function getPackument(name: string, registry = DEFAULT_REGISTRY): Promise<Packument> {
  const key = `${registry}\0${name}`;
  let pending = packumentCache.get(key);
  if (!pending) {
    pending = (async () => {
      const cached = await readCachedPackument(name, 5 * 60 * 1000);
      if (cached) return cached;
      const url = `${registry.replace(/\/$/, "")}/${name.replace("/", "%2f")}`;
      const res = await fetch(url, {
        headers: {
          Accept: "application/vnd.npm.install-v1+json; q=1.0, application/json; q=0.9",
          "User-Agent": "cub/0.1.0 (node)",
        },
      });
      if (!res.ok) throw new Error(`registry ${res.status} for ${name}`);
      const data = (await res.json()) as Packument;
      await writeCachedPackument(name, data);
      return data;
    })();
    // Don't poison the cache with rejections.
    pending.catch(() => packumentCache.delete(key));
    packumentCache.set(key, pending);
  }
  return pending;
}

export async function resolveSpec(
  name: string,
  range: string,
  registry = DEFAULT_REGISTRY,
): Promise<ResolvedPackage> {
  const doc = await getPackument(name, registry);
  const r = (range ?? "").trim() || "*";
  let version: string | null = null;
  if (doc["dist-tags"] && doc["dist-tags"][r] && !r.match(/[~^<>=*| ]/)) {
    version = doc["dist-tags"][r];
  } else if (r === "*" || r === "latest") {
    version =
      (doc["dist-tags"]?.latest && doc.versions[doc["dist-tags"].latest]
        ? doc["dist-tags"].latest
        : null) ?? maxVersion(Object.keys(doc.versions));
  } else {
    version = resolveVersion(Object.keys(doc.versions), r);
  }
  if (!version || !doc.versions[version]) {
    throw new Error(`no version of ${name} satisfies ${range}`);
  }
  const dist = doc.versions[version].dist;
  let integrity = dist.integrity ?? "";
  if (!integrity && dist.shasum) {
    integrity = `sha1-${Buffer.from(dist.shasum, "hex").toString("base64")}`;
  }
  if (!integrity) throw new Error(`no integrity for ${name}@${version}`);
  return { name, version, tarball: dist.tarball, integrity };
}

/** Download a tarball; verify sha512/sha1 integrity when provided. */
export async function downloadTarball(url: string, integrity?: string): Promise<Buffer> {
  const res = await fetch(url, { headers: { "User-Agent": "cub/0.1.0 (node)" } });
  if (!res.ok) throw new Error(`tarball ${res.status} for ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (integrity) {
    const dash = integrity.indexOf("-");
    if (dash !== -1) {
      const algo = integrity.slice(0, dash);
      const expected = Buffer.from(integrity.slice(dash + 1).split(" ")[0], "base64");
      const actual = createHash(algo).update(buf).digest();
      if (!actual.equals(expected)) {
        throw new Error(`integrity mismatch for ${url}`);
      }
    }
  }
  return buf;
}

export function cacheDir(): string {
  return getCacheDir();
}
