"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCacheDir = getCacheDir;
exports.integrityToHex = integrityToHex;
exports.cacheKeyForIntegrity = cacheKeyForIntegrity;
exports.cacheKeyForBytes = cacheKeyForBytes;
exports.tarballCachePath = tarballCachePath;
exports.metadataCachePath = metadataCachePath;
const node_crypto_1 = require("node:crypto");
const node_os_1 = require("node:os");
const node_path_1 = require("node:path");
function getCacheDir() {
    const base = process.env.CUB_CACHE_DIR && process.env.CUB_CACHE_DIR.length > 0
        ? process.env.CUB_CACHE_DIR
        : (0, node_path_1.join)((0, node_os_1.homedir)(), ".cub", "cache");
    return base;
}
/** Decode an `sha512-<base64>` (or sha1/sha256) integrity string to hex. */
function integrityToHex(integrity) {
    const dash = integrity.indexOf("-");
    if (dash === -1)
        throw new Error(`invalid integrity string: ${integrity}`);
    const algo = integrity.slice(0, dash);
    if (!/^(sha1|sha256|sha384|sha512)$/.test(algo)) {
        throw new Error(`invalid integrity string: ${integrity}`);
    }
    const b64 = integrity.slice(dash + 1).split(" ")[0];
    if (!b64)
        throw new Error(`invalid integrity string: ${integrity}`);
    const hex = Buffer.from(b64, "base64").toString("hex");
    if (!hex)
        throw new Error(`invalid integrity string: ${integrity}`);
    return hex;
}
/**
 * Content-addressable cache key for a tarball.
 * `<algo>/<hex>` sharded layout; falls back to sha512 of bytes when
 * no integrity is known.
 */
function cacheKeyForIntegrity(integrity) {
    const dash = integrity.indexOf("-");
    const algo = dash === -1 ? "sha512" : integrity.slice(0, dash);
    const hex = integrityToHex(integrity);
    return `${algo}/${hex.slice(0, 2)}/${hex.slice(2)}`;
}
function cacheKeyForBytes(data) {
    const hex = (0, node_crypto_1.createHash)("sha512").update(data).digest("hex");
    return `sha512/${hex.slice(0, 2)}/${hex.slice(2)}`;
}
function tarballCachePath(integrity) {
    return (0, node_path_1.join)(getCacheDir(), "tarballs", cacheKeyForIntegrity(integrity));
}
function metadataCachePath(name) {
    const safe = name.replace("/", "%2f");
    return (0, node_path_1.join)(getCacheDir(), "metadata", `${safe}.json`);
}
//# sourceMappingURL=cache.js.map