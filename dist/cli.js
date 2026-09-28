"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.main = main;
const node_child_process_1 = require("node:child_process");
const promises_1 = require("node:fs/promises");
const node_path_1 = require("node:path");
const installer_js_1 = require("./installer.js");
const lockfile_js_1 = require("./lockfile.js");
const semver_js_1 = require("./semver.js");
const registry_js_1 = require("./registry.js");
const HELP = `cub — fast npm-compatible installer

Usage:
  cub install [pkg[@range]...]   install deps (or given specs)
  cub add <pkg[@range]> [...]    add dep(s) to package.json + install
  cub remove <pkg> [...]         remove dep(s)
  cub run <script> [-- args]     run a package.json script

Options:
  --no-dev          skip devDependencies
  --registry <url>  custom registry
  -h, --help        this help
`;
function flag(args, ...names) {
    return args.some((a) => names.includes(a));
}
function optValue(args, ...names) {
    for (let i = 0; i < args.length; i++) {
        for (const n of names) {
            if (args[i] === n)
                return args[i + 1];
            if (args[i].startsWith(`${n}=`))
                return args[i].slice(n.length + 1);
        }
    }
    return undefined;
}
function positionals(args, cmd) {
    const out = [];
    let seenCmd = false;
    for (let i = 0; i < args.length; i++) {
        const a = args[i];
        if (!seenCmd && a === cmd) {
            seenCmd = true;
            continue;
        }
        if (!seenCmd)
            continue;
        if (a === "--") {
            out.push(...args.slice(i + 1));
            break;
        }
        if (a.startsWith("-")) {
            if (a === "--registry")
                i++; // consume value
            continue;
        }
        out.push(a);
    }
    return out;
}
async function main(argv, cwd = process.cwd()) {
    const [, , cmd, ...rest] = argv;
    const args = argv.slice(2);
    if (!cmd || flag(args, "-h", "--help") || cmd === "help") {
        process.stdout.write(HELP);
        return;
    }
    const registry = optValue(args, "--registry");
    const dev = !flag(args, "--no-dev");
    switch (cmd) {
        case "install":
        case "i": {
            const specs = positionals(args, cmd);
            if (specs.length > 0) {
                const { installed } = await (0, installer_js_1.installSpecs)(cwd, specs, { dev, registry });
                for (const p of installed)
                    process.stdout.write(`+ ${p.name}@${p.version}\n`);
            }
            else {
                const { installed } = await (0, installer_js_1.installAll)(cwd, { dev, registry });
                process.stdout.write(`installed ${installed.length} packages\n`);
            }
            return;
        }
        case "add": {
            const specs = positionals(args, cmd);
            if (spotsEmpty(specs))
                throw new Error("cub add requires at least one package");
            const pkg = await (0, lockfile_js_1.readPackageJson)(cwd);
            pkg.dependencies ??= {};
            const resolved = [];
            for (const spec of specs) {
                const { name, range } = (0, semver_js_1.parseSpecString)(spec);
                const r = await (0, registry_js_1.resolveSpec)(name, range === "*" ? "latest" : range, registry);
                // Pin exact version for reproducibility.
                pkg.dependencies[r.name] = `^${r.version}`;
                resolved.push(r);
            }
            await (0, lockfile_js_1.writePackageJson)(cwd, pkg);
            const { installSpecs: doSpecs } = await import("./installer.js");
            await doSpecs(cwd, resolved.map((r) => `${r.name}@${r.version}`), { dev, registry });
            // Rebuild full lock from updated package.json.
            await (0, installer_js_1.installAll)(cwd, { dev, registry });
            for (const r of resolved)
                process.stdout.write(`+ ${r.name}@${r.version}\n`);
            return;
        }
        case "remove":
        case "rm":
        case "uninstall": {
            const names = positionals(args, cmd);
            if (spotsEmpty(names))
                throw new Error(`cub ${cmd} requires at least one package`);
            const pkg = await (0, lockfile_js_1.readPackageJson)(cwd);
            for (const n of names) {
                delete pkg.dependencies?.[n];
                delete pkg.devDependencies?.[n];
                delete pkg.optionalDependencies?.[n];
                await (0, promises_1.rm)((0, node_path_1.join)(cwd, "node_modules", ...n.split("/")), {
                    recursive: true,
                    force: true,
                });
            }
            await (0, lockfile_js_1.writePackageJson)(cwd, pkg);
            // Refresh lockfile.
            const deps = (0, lockfile_js_1.collectDeps)(pkg, true);
            const lock = await (0, lockfile_js_1.readLockfile)(cwd);
            if (lock) {
                const kept = Object.entries(lock.packages).filter(([k]) => Object.keys(deps).some((d) => k.startsWith(`${d}@`)));
                await (0, lockfile_js_1.writeLockfile)(cwd, {
                    ...lock,
                    name: pkg.name ?? lock.name,
                    version: pkg.version ?? lock.version,
                    packages: Object.fromEntries(kept),
                });
            }
            else {
                await (0, lockfile_js_1.writeLockfile)(cwd, (0, lockfile_js_1.buildLockfile)(pkg, []));
            }
            for (const n of names)
                process.stdout.write(`- ${n}\n`);
            return;
        }
        case "run": {
            const names = positionals(args, cmd);
            const script = names[0];
            if (!script)
                throw new Error("cub run requires a script name");
            const pkg = await (0, lockfile_js_1.readPackageJson)(cwd);
            const command = pkg.scripts?.[script];
            if (!command)
                throw new Error(`missing script: ${script}`);
            const dashdash = argv.indexOf("--");
            const extra = dashdash === -1 ? [] : argv.slice(dashdash + 1);
            await runScript(command, extra, cwd);
            return;
        }
        default:
            throw new Error(`unknown command: ${cmd}\n${HELP}`);
    }
}
function spotsEmpty(arr) {
    return arr.length === 0;
}
function runScript(command, extra, cwd) {
    return new Promise((resolve, reject) => {
        const pathExt = (0, node_path_1.join)(cwd, "node_modules", ".bin");
        const child = (0, node_child_process_1.spawn)(command, extra, {
            cwd,
            shell: true,
            stdio: "inherit",
            env: { ...process.env, PATH: `${pathExt}:${process.env.PATH ?? ""}` },
        });
        child.on("close", (code) => {
            if (code === 0)
                resolve();
            else
                reject(new Error(`script exited with code ${code}`));
        });
        child.on("error", reject);
    });
}
//# sourceMappingURL=cli.js.map