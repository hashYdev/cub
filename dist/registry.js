"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_REGISTRY = void 0;
exports.clearRegistryCache = clearRegistryCache;
exports.getPackument = getPackument;
exports.resolveSpec = resolveSpec;
exports.downloadTarball = downloadTarball;
exports.cacheDir = cacheDir;
const node_crypto_1 = require("node:crypto");
const promises_1 = require("node:fs/promises");
const node_path_1 = require("node:path");
const cache_js_1 = require("./cache.js");
const semver_js_1 = require("./semver.js");
exports.DEFAULT_REGISTRY = process.env.CUB_REGISTRY ?? "https://registry.npmjs.org";
// In-memory packument cache so repeated deps reuse one fetch per run.
const packumentCache = new Map();
function clearRegistryCache() {
    packumentCache.clear();
}
async function readCachedPackument(name, maxAgeMs) {
    try {
        const raw = await (0, promises_1.readFile)((0, cache_js_1.metadataCachePath)(name), "utf8");
        const doc = JSON.parse(raw);
        if (Date.now() - doc.time > maxAgeMs)
            return null;
        return doc.data;
    }
    catch {
        return null;
    }
}
async function writeCachedPackument(name, data) {
    try {
        const p = (0, cache_js_1.metadataCachePath)(name);
        await (0, promises_1.mkdir)((0, node_path_1.dirname)(p), { recursive: true });
        await (0, promises_1.writeFile)(p, JSON.stringify({ time: Date.now(), data }), "utf8");
    }
    catch {
        // Cache is best-effort.
    }
}
function getPackument(name, registry = exports.DEFAULT_REGISTRY) {
    const key = `${registry}\0${name}`;
    let pending = packumentCache.get(key);
    if (!pending) {
        pending = (async () => {
            const cached = await readCachedPackument(name, 5 * 60 * 1000);
            if (cached)
                return cached;
            const url = `${registry.replace(/\/$/, "")}/${name.replace("/", "%2f")}`;
            const res = await fetch(url, {
                headers: {
                    Accept: "application/vnd.npm.install-v1+json; q=1.0, application/json; q=0.9",
                    "User-Agent": "cub/0.1.0 (node)",
                },
            });
            if (!res.ok)
                throw new Error(`registry ${res.status} for ${name}`);
            const data = (await res.json());
            await writeCachedPackument(name, data);
            return data;
        })();
        // Don't poison the cache with rejections.
        pending.catch(() => packumentCache.delete(key));
        packumentCache.set(key, pending);
    }
    return pending;
}
async function resolveSpec(name, range, registry = exports.DEFAULT_REGISTRY) {
    const doc = await getPackument(name, registry);
    const r = (range ?? "").trim() || "*";
    let version = null;
    if (doc["dist-tags"] && doc["dist-tags"][r] && !r.match(/[~^<>=*| ]/)) {
        version = doc["dist-tags"][r];
    }
    else if (r === "*" || r === "latest") {
        version =
            (doc["dist-tags"]?.latest && doc.versions[doc["dist-tags"].latest]
                ? doc["dist-tags"].latest
                : null) ?? (0, semver_js_1.maxVersion)(Object.keys(doc.versions));
    }
    else {
        version = (0, semver_js_1.resolveVersion)(Object.keys(doc.versions), r);
    }
    if (!version || !doc.versions[version]) {
        throw new Error(`no version of ${name} satisfies ${range}`);
    }
    const dist = doc.versions[version].dist;
    let integrity = dist.integrity ?? "";
    if (!integrity && dist.shasum) {
        integrity = `sha1-${Buffer.from(dist.shasum, "hex").toString("base64")}`;
    }
    if (!integrity)
        throw new Error(`no integrity for ${name}@${version}`);
    return { name, version, tarball: dist.tarball, integrity };
}
/** Download a tarball; verify sha512/sha1 integrity when provided. */
async function downloadTarball(url, integrity) {
    const res = await fetch(url, { headers: { "User-Agent": "cub/0.1.0 (node)" } });
    if (!res.ok)
        throw new Error(`tarball ${res.status} for ${url}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (integrity) {
        const dash = integrity.indexOf("-");
        if (dash !== -1) {
            const algo = integrity.slice(0, dash);
            const expected = Buffer.from(integrity.slice(dash + 1).split(" ")[0], "base64");
            const actual = (0, node_crypto_1.createHash)(algo).update(buf).digest();
            if (!actual.equals(expected)) {
                throw new Error(`integrity mismatch for ${url}`);
            }
        }
    }
    return buf;
}
function cacheDir() {
    return (0, cache_js_1.getCacheDir)();
}
//# sourceMappingURL=registry.js.map