export declare function getCacheDir(): string;
/** Decode an `sha512-<base64>` (or sha1/sha256) integrity string to hex. */
export declare function integrityToHex(integrity: string): string;
/**
 * Content-addressable cache key for a tarball.
 * `<algo>/<hex>` sharded layout; falls back to sha512 of bytes when
 * no integrity is known.
 */
export declare function cacheKeyForIntegrity(integrity: string): string;
export declare function cacheKeyForBytes(data: Uint8Array): string;
export declare function tarballCachePath(integrity: string): string;
export declare function metadataCachePath(name: string): string;
