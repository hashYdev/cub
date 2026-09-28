import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";

export function getCacheDir(): string {
  const base =
    process.env.CUB_CACHE_DIR && process.env.CUB_CACHE_DIR.length > 0
      ? process.env.CUB_CACHE_DIR
      : join(homedir(), ".cub", "cache");
  return base;
}

/** Decode an `sha512-<base64>` (or sha1/sha256) integrity string to hex. */
export function integrityToHex(integrity: string): string {
  const dash = integrity.indexOf("-");
  if (dash === -1) throw new Error(`invalid integrity string: ${integrity}`);
  const algo = integrity.slice(0, dash);
  if (!/^(sha1|sha256|sha384|sha512)$/.test(algo)) {
    throw new Error(`invalid integrity string: ${integrity}`);
  }
  const b64 = integrity.slice(dash + 1).split(" ")[0];
  if (!b64) throw new Error(`invalid integrity string: ${integrity}`);
  const hex = Buffer.from(b64, "base64").toString("hex");
  if (!hex) throw new Error(`invalid integrity string: ${integrity}`);
  return hex;
}

/**
 * Content-addressable cache key for a tarball.
 * `<algo>/<hex>` sharded layout; falls back to sha512 of bytes when
 * no integrity is known.
 */
export function cacheKeyForIntegrity(integrity: string): string {
  const dash = integrity.indexOf("-");
  const algo = dash === -1 ? "sha512" : integrity.slice(0, dash);
  const hex = integrityToHex(integrity);
  return `${algo}/${hex.slice(0, 2)}/${hex.slice(2)}`;
}

export function cacheKeyForBytes(data: Uint8Array): string {
  const hex = createHash("sha512").update(data).digest("hex");
  return `sha512/${hex.slice(0, 2)}/${hex.slice(2)}`;
}

export function tarballCachePath(integrity: string): string {
  return join(getCacheDir(), "tarballs", cacheKeyForIntegrity(integrity));
}

export function metadataCachePath(name: string): string {
  const safe = name.replace("/", "%2f");
  return join(getCacheDir(), "metadata", `${safe}.json`);
}
