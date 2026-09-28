import { spawn } from "node:child_process";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { installAll, installSpecs } from "./installer.js";
import {
  collectDeps,
  readLockfile,
  readPackageJson,
  writeLockfile,
  writePackageJson,
  buildLockfile,
} from "./lockfile.js";
import { parseSpecString } from "./semver.js";
import { resolveSpec } from "./registry.js";

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

function flag(args: string[], ...names: string[]): boolean {
  return args.some((a) => names.includes(a));
}

function optValue(args: string[], ...names: string[]): string | undefined {
  for (let i = 0; i < args.length; i++) {
    for (const n of names) {
      if (args[i] === n) return args[i + 1];
      if (args[i].startsWith(`${n}=`)) return args[i].slice(n.length + 1);
    }
  }
  return undefined;
}

function positionals(args: string[], cmd: string): string[] {
  const out: string[] = [];
  let seenCmd = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (!seenCmd && a === cmd) {
      seenCmd = true;
      continue;
    }
    if (!seenCmd) continue;
    if (a === "--") {
      out.push(...args.slice(i + 1));
      break;
    }
    if (a.startsWith("-")) {
      if (a === "--registry") i++; // consume value
      continue;
    }
    out.push(a);
  }
  return out;
}

export async function main(argv: string[], cwd = process.cwd()): Promise<void> {
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
        const { installed } = await installSpecs(cwd, specs, { dev, registry });
        for (const p of installed) process.stdout.write(`+ ${p.name}@${p.version}\n`);
      } else {
        const { installed } = await installAll(cwd, { dev, registry });
        process.stdout.write(`installed ${installed.length} packages\n`);
      }
      return;
    }
    case "add": {
      const specs = positionals(args, cmd);
      if (spotsEmpty(specs)) throw new Error("cub add requires at least one package");
      const pkg = await readPackageJson(cwd);
      pkg.dependencies ??= {};
      const resolved = [];
      for (const spec of specs) {
        const { name, range } = parseSpecString(spec);
        const r = await resolveSpec(name, range === "*" ? "latest" : range, registry);
        // Pin exact version for reproducibility.
        pkg.dependencies[r.name] = `^${r.version}`;
        resolved.push(r);
      }
      await writePackageJson(cwd, pkg);
      const { installSpecs: doSpecs } = await import("./installer.js");
      await doSpecs(cwd, resolved.map((r) => `${r.name}@${r.version}`), { dev, registry });
      // Rebuild full lock from updated package.json.
      await installAll(cwd, { dev, registry });
      for (const r of resolved) process.stdout.write(`+ ${r.name}@${r.version}\n`);
      return;
    }
    case "remove":
    case "rm":
    case "uninstall": {
      const names = positionals(args, cmd);
      if (spotsEmpty(names)) throw new Error(`cub ${cmd} requires at least one package`);
      const pkg = await readPackageJson(cwd);
      for (const n of names) {
        delete pkg.dependencies?.[n];
        delete pkg.devDependencies?.[n];
        delete pkg.optionalDependencies?.[n];
        await rm(join(cwd, "node_modules", ...n.split("/")), {
          recursive: true,
          force: true,
        });
      }
      await writePackageJson(cwd, pkg);
      // Refresh lockfile.
      const deps = collectDeps(pkg, true);
      const lock = await readLockfile(cwd);
      if (lock) {
        const kept = Object.entries(lock.packages).filter(([k]) =>
          Object.keys(deps).some((d) => k.startsWith(`${d}@`)),
        );
        await writeLockfile(cwd, {
          ...lock,
          name: pkg.name ?? lock.name,
          version: pkg.version ?? lock.version,
          packages: Object.fromEntries(kept),
        });
      } else {
        await writeLockfile(cwd, buildLockfile(pkg, []));
      }
      for (const n of names) process.stdout.write(`- ${n}\n`);
      return;
    }
    case "run": {
      const names = positionals(args, cmd);
      const script = names[0];
      if (!script) throw new Error("cub run requires a script name");
      const pkg = await readPackageJson(cwd);
      const command = pkg.scripts?.[script];
      if (!command) throw new Error(`missing script: ${script}`);
      const dashdash = argv.indexOf("--");
      const extra = dashdash === -1 ? [] : argv.slice(dashdash + 1);
      await runScript(command, extra, cwd);
      return;
    }
    default:
      throw new Error(`unknown command: ${cmd}\n${HELP}`);
  }
}

function spotsEmpty(arr: string[]): boolean {
  return arr.length === 0;
}

function runScript(command: string, extra: string[], cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const pathExt = join(cwd, "node_modules", ".bin");
    const child = spawn(command, extra, {
      cwd,
      shell: true,
      stdio: "inherit",
      env: { ...process.env, PATH: `${pathExt}:${process.env.PATH ?? ""}` },
    });
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`script exited with code ${code}`));
    });
    child.on("error", reject);
  });
}
