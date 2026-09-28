"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.readlink = exports.CONCURRENCY = void 0;
exports.pool = pool;
exports.fetchTarballCached = fetchTarballCached;
exports.installOne = installOne;
exports.linkPackageBin = linkPackageBin;
exports.installAll = installAll;
exports.installSpecs = installSpecs;
const promises_1 = require("node:fs/promises");
Object.defineProperty(exports, "readlink", { enumerable: true, get: function () { return promises_1.readlink; } });
const node_fs_1 = require("node:fs");
const node_os_1 = require("node:os");
const node_path_1 = require("node:path");
const node_crypto_1 = require("node:crypto");
const registry_js_1 = require("./registry.js");
const extract_js_1 = require("./extract.js");
const cache_js_1 = require("./cache.js");
const lockfile_js_1 = require("./lockfile.js");
exports.CONCURRENCY = 20;
/** Bounded parallel map — keeps at most `limit` promises in flight. */
async function pool(items, limit, fn) {
    const out = new Array(items.length);
    let next = 0;
    const workers = new Array(Math.min(Math.max(limit, 1), items.length)).fill(0).map(async () => {
        while (true) {
            const i = next++;
            if (i >= items.length)
                return;
            out[i] = await fn(items[i], i);
        }
    });
    await Promise.all(workers);
    return out;
}
async function readCachedTarball(integrity) {
    try {
        return await (0, promises_1.readFile)((0, cache_js_1.tarballCachePath)(integrity));
    }
    catch {
        return null;
    }
}
async function writeCachedTarball(integrity, data) {
    try {
        const p = (0, cache_js_1.tarballCachePath)(integrity);
        await (0, promises_1.mkdir)((0, node_path_1.dirname)(p), { recursive: true });
        const tmp = `${p}.${process.pid}.${(0, node_crypto_1.randomUUID)().slice(0, 8)}.tmp`;
        const { writeFile } = await import("node:fs/promises");
        await writeFile(tmp, data);
        await (0, promises_1.rename)(tmp, p).catch(async () => {
            // Another worker won the race; drop ours.
            await (0, promises_1.rm)(tmp, { force: true });
        });
    }
    catch {
        // Cache is best-effort.
    }
}
async function fetchTarballCached(pkg) {
    const hit = await readCachedTarball(pkg.integrity);
    if (hit)
        return hit;
    const data = await (0, registry_js_1.downloadTarball)(pkg.tarball, pkg.integrity);
    await writeCachedTarball(pkg.integrity, data);
    return data;
}
function stageDirFor(cwd, name) {
    const final = (0, node_path_1.join)(cwd, "node_modules", ...name.split("/"));
    const stage = (0, node_path_1.join)(cwd, "node_modules", ".cub-stage", `${name.replace("/", "+")}.${process.pid}.${(0, node_crypto_1.randomUUID)().slice(0, 8)}`);
    return { stage, final };
}
async function installOne(cwd, pkg, opts = {}) {
    const data = await fetchTarballCached(pkg);
    const { stage, final } = stageDirFor(cwd, pkg.name);
    await (0, promises_1.rm)(stage, { recursive: true, force: true });
    await (0, promises_1.mkdir)(stage, { recursive: true });
    await (0, extract_js_1.extractTgz)(data, stage);
    await (0, promises_1.mkdir)((0, node_path_1.dirname)(final), { recursive: true });
    // Atomic publish: stage -> temp backup -> rename.
    const backup = `${final}.${(0, node_crypto_1.randomUUID)().slice(0, 8)}.old`;
    const hadExisting = (0, node_fs_1.existsSync)(final);
    if (hadExisting) {
        await (0, promises_1.rename)(final, backup);
    }
    try {
        await (0, promises_1.rename)(stage, final);
    }
    catch (err) {
        if (hadExisting)
            await (0, promises_1.rename)(backup, final).catch(() => { });
        throw err;
    }
    if (hadExisting)
        await (0, promises_1.rm)(backup, { recursive: true, force: true });
    await linkPackageBin(cwd, pkg.name);
}
async function linkPackageBin(cwd, name) {
    const pkgDir = (0, node_path_1.join)(cwd, "node_modules", ...name.split("/"));
    let manifest;
    try {
        manifest = JSON.parse(await (0, promises_1.readFile)((0, node_path_1.join)(pkgDir, "package.json"), "utf8"));
    }
    catch {
        return;
    }
    if (!manifest.bin)
        return;
    const bins = typeof manifest.bin === "string" ? { [manifest.name ?? name]: manifest.bin } : manifest.bin;
    const binDir = (0, node_path_1.join)(cwd, "node_modules", ".bin");
    await (0, promises_1.mkdir)(binDir, { recursive: true });
    for (const [binName, rel] of Object.entries(bins)) {
        const target = (0, node_path_1.join)(pkgDir, rel);
        const link = (0, node_path_1.join)(binDir, binName);
        await (0, promises_1.rm)(link, { force: true });
        // Relative symlink so node_modules stays relocatable.
        const { relative } = await import("node:path");
        await (0, promises_1.symlink)(relative(binDir, target), link).catch(async () => {
            // Fallback: absolute symlink.
            await (0, promises_1.rm)(link, { force: true });
            await (0, promises_1.symlink)(target, link);
        });
        try {
            await (0, promises_1.chmod)(target, 0o755);
        }
        catch {
            // non-fatal (e.g. windows)
        }
    }
}
/**
 * Full install: resolve every dep (parallel, shared packument cache),
 * download tarballs in parallel (concurrency 20), cache, atomic extract,
 * link bins, write cub-lock.json.
 */
async function installAll(cwd, opts = {}) {
    const concurrency = opts.concurrency ?? exports.CONCURRENCY;
    const pkg = await (0, lockfile_js_1.readPackageJson)(cwd);
    const includeDev = opts.dev !== false && process.env.NODE_ENV !== "production";
    const deps = (0, lockfile_js_1.collectDeps)(pkg, includeDev);
    const devDeps = new Set(Object.keys(pkg.devDependencies ?? {}));
    await (0, promises_1.mkdir)((0, node_path_1.join)(cwd, "node_modules"), { recursive: true });
    await (0, promises_1.mkdir)((0, node_path_1.join)((0, node_os_1.tmpdir)(), "cub"), { recursive: true });
    await (0, promises_1.mkdir)((0, cache_js_1.getCacheDir)(), { recursive: true });
    const entries = Object.entries(deps);
    // Phase 1: resolve versions (parallel; packument fetch shared via cache).
    const resolved = await pool(entries, concurrency, async ([name, range]) => {
        const hit = await tryLockHit(cwd, name, range, opts);
        if (hit)
            return hit;
        return (0, registry_js_1.resolveSpec)(name, range, opts.registry);
    });
    // Phase 2: download + extract + link (parallel, bounded).
    await pool(resolved, concurrency, async (r) => {
        await installOne(cwd, r, opts);
    });
    const lock = (0, lockfile_js_1.buildLockfile)(pkg, resolved.map((r) => ({ ...r, dev: devDeps.has(r.name) })));
    await (0, lockfile_js_1.writeLockfile)(cwd, lock);
    return { installed: resolved, lock };
}
/** Reuse cub-lock.json entry when it still satisfies the requested range. */
async function tryLockHit(cwd, name, range, opts) {
    if (opts.useLockfile === false)
        return null;
    try {
        const lock = await (0, lockfile_js_1.readLockfile)(cwd);
        if (!lock)
            return null;
        const { satisfies } = await import("./semver.js");
        for (const [key, entry] of Object.entries(lock.packages)) {
            if (key.startsWith(`${name}@`) && satisfies(entry.version, range)) {
                return { name, version: entry.version, tarball: entry.resolved, integrity: entry.integrity };
            }
        }
    }
    catch {
        // fall through to registry
    }
    return null;
}
/** `cub install pkg[@range]...` — resolve ad-hoc specs and install. */
async function installSpecs(cwd, specs, opts = {}) {
    const { parseSpecString } = await import("./semver.js");
    const concurrency = opts.concurrency ?? exports.CONCURRENCY;
    await (0, promises_1.mkdir)((0, node_path_1.join)(cwd, "node_modules"), { recursive: true });
    const parsed = specs.map(parseSpecString);
    const resolved = await pool(parsed, concurrency, (s) => (0, registry_js_1.resolveSpec)(s.name, s.range, opts.registry));
    await pool(resolved, concurrency, (r) => installOne(cwd, r, opts));
    const pkg = await (0, lockfile_js_1.readPackageJson)(cwd).catch(() => ({ name: "", version: "0.0.0" }));
    const lock = (0, lockfile_js_1.buildLockfile)(pkg, resolved);
    await (0, lockfile_js_1.writeLockfile)(cwd, lock);
    return { installed: resolved, lock };
}
//# sourceMappingURL=installer.js.map