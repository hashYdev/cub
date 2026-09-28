"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.readPackageJson = readPackageJson;
exports.writePackageJson = writePackageJson;
exports.collectDeps = collectDeps;
exports.readLockfile = readLockfile;
exports.buildLockfile = buildLockfile;
exports.writeLockfile = writeLockfile;
const promises_1 = require("node:fs/promises");
const node_path_1 = require("node:path");
async function readPackageJson(cwd) {
    const raw = await (0, promises_1.readFile)((0, node_path_1.join)(cwd, "package.json"), "utf8");
    return JSON.parse(raw);
}
async function writePackageJson(cwd, pkg) {
    await (0, promises_1.writeFile)((0, node_path_1.join)(cwd, "package.json"), JSON.stringify(pkg, null, 2) + "\n", "utf8");
}
/** Merge deps + optionalDeps (+ devDeps unless production). */
function collectDeps(pkg, includeDev) {
    const out = {};
    for (const [k, v] of Object.entries(pkg.optionalDependencies ?? {}))
        out[k] = v;
    for (const [k, v] of Object.entries(pkg.dependencies ?? {}))
        out[k] = v;
    if (includeDev) {
        for (const [k, v] of Object.entries(pkg.devDependencies ?? {})) {
            if (!(k in out))
                out[k] = v;
        }
    }
    return out;
}
async function readLockfile(cwd) {
    try {
        const raw = await (0, promises_1.readFile)((0, node_path_1.join)(cwd, "cub-lock.json"), "utf8");
        return JSON.parse(raw);
    }
    catch {
        return null;
    }
}
function buildLockfile(pkg, resolved) {
    const packages = {};
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
async function writeLockfile(cwd, lock) {
    const sorted = {};
    for (const k of Object.keys(lock.packages).sort())
        sorted[k] = lock.packages[k];
    await (0, promises_1.writeFile)((0, node_path_1.join)(cwd, "cub-lock.json"), JSON.stringify({ ...lock, packages: sorted }, null, 2) + "\n", "utf8");
}
//# sourceMappingURL=lockfile.js.map