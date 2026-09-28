'use strict';

// cub publish [--dry-run] [--tag <tag>] [--access ...] [--bump ...]
// Flow: validate package.json -> optional bump -> npm pack file list ->
// dry-run prints size + future URL, real run does `npm publish` passthrough
// using existing ~/.npmrc auth, then prints tarball size + URL.

const fs = require('fs');
const path = require('path');
const { spawnSync, execSync } = require('child_process');

function parseArgs(argv) {
  const opts = { dryRun: false, tag: null, access: null, bump: null, extra: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') opts.dryRun = true;
    else if (a === '--help' || a === '-h') opts.help = true;
    else if (a === '--tag' && argv[i + 1]) opts.tag = argv[++i];
    else if (a.startsWith('--tag=')) opts.tag = a.slice(6);
    else if (a === '--access' && argv[i + 1]) opts.access = argv[++i];
    else if (a.startsWith('--access=')) opts.access = a.slice(9);
    else if (a === '--bump' && argv[i + 1]) opts.bump = argv[++i];
    else if (a.startsWith('--bump=')) opts.bump = a.slice(7);
    else opts.extra.push(a);
  }
  return opts;
}

function readPkg(cwd) {
  const p = path.join(cwd, 'package.json');
  if (!fs.existsSync(p)) throw new Error('no package.json in current directory (run `cub init` first)');
  const pkg = JSON.parse(fs.readFileSync(p, 'utf8'));
  if (!pkg.name) throw new Error('package.json missing "name"');
  if (!pkg.version) throw new Error('package.json missing "version"');
  return { file: p, pkg };
}

function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} kB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

function tarballUrl(pkg) {
  // Public registry URL shape for a published version.
  const name = pkg.name;
  const version = pkg.version;
  if (name.startsWith('@')) {
    const [scope, base] = name.split('/');
    return `https://registry.npmjs.org/${scope}/${base}/-/${base}-${version}.tgz`;
  }
  return `https://registry.npmjs.org/${encodeURIComponent(name)}/-/${path.basename(name)}-${version}.tgz`;
}

function run(cmd, args, opts = {}) {
  return spawnSync(cmd, args, { encoding: 'utf8', ...opts });
}

function checkFilesList(pkg, cwd) {
  // Surface the effective `files` list; npm pack --dry-run shows ground truth.
  if (Array.isArray(pkg.files) && pkg.files.length > 0) {
    console.log(`files: ${pkg.files.join(', ')}`);
  } else {
    console.log('files: (no "files" field — npm default include rules apply; check .npmignore)');
  }
  const r = run('npm', ['pack', '--dry-run'], { cwd });
  const out = (r.stdout || '') + (r.stderr || '');
  if (r.status !== 0) {
    console.log(out.trim());
    console.log('warn: `npm pack --dry-run` failed; continuing anyway.');
    return;
  }
  // Print the file listing portion (npm prints a table + tarball summary).
  const lines = out.trim().split('\n');
  console.log('--- npm pack --dry-run ---');
  // Keep it bounded so output stays readable.
  console.log(lines.slice(0, 60).join('\n'));
  if (lines.length > 60) console.log(`... (${lines.length - 60} more lines)`);
}

function measureTarball(cwd, pkg) {
  // Build a real tarball in a temp dir to report byte size without polluting cwd.
  const tmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'cub-pack-'));
  try {
    const r = run('npm', ['pack', '--pack-destination', tmp, '--silent'], { cwd });
    if (r.status !== 0) {
      console.log(((r.stdout || '') + (r.stderr || '')).trim());
      return null;
    }
    const files = fs.readdirSync(tmp).filter((f) => f.endsWith('.tgz'));
    if (files.length === 0) return null;
    const st = fs.statSync(path.join(tmp, files[0]));
    return { file: files[0], size: st.size };
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

async function runPublish(argv) {
  const opts = parseArgs(argv);
  if (opts.help) {
    console.log(`Usage: cub publish [--dry-run] [--tag <tag>] [--access <public|restricted>] [--bump <patch|minor|major|x.y.z>]

Uses ~/.npmrc auth via npm passthrough. Prints tarball size + registry URL.`);
    return;
  }

  const cwd = process.cwd();
  let { pkg } = readPkg(cwd);
  console.log(`publishing ${pkg.name}@${pkg.version}`);

  // Optional version bump before packing.
  if (opts.bump) {
    console.log(`bumping version: npm version ${opts.bump} --no-git-tag-version`);
    const r = run('npm', ['version', opts.bump, '--no-git-tag-version'], { cwd, stdio: 'inherit' });
    if (r.status !== 0) throw new Error(`npm version ${opts.bump} failed`);
    ({ pkg } = readPkg(cwd));
    console.log(`now at ${pkg.name}@${pkg.version}`);
  }

  checkFilesList(pkg, cwd);

  const measured = measureTarball(cwd, pkg);
  const url = tarballUrl(pkg);
  if (measured) console.log(`tarball: ${measured.file} (${formatBytes(measured.size)})`);
  console.log(`url: ${url}`);

  if (opts.dryRun) {
    console.log('dry-run: skipping `npm publish`. Re-run without --dry-run to publish.');
    return;
  }

  const args = ['publish', ...opts.extra];
  if (opts.tag) args.push('--tag', opts.tag);
  if (opts.access) args.push('--access', opts.access);
  console.log(`> npm ${args.join(' ')}  (auth from ~/.npmrc)`);
  const r = spawnSync('npm', args, { cwd, stdio: 'inherit' });
  if (r.status !== 0) throw new Error('npm publish failed');

  // Re-read (publish doesn't change version, but be safe) and report final URL.
  ({ pkg } = readPkg(cwd));
  console.log(`published ${pkg.name}@${pkg.version}`);
  console.log(`tarball url: ${tarballUrl(pkg)}`);
  if (measured) console.log(`tarball size: ${formatBytes(measured.size)}`);
}

module.exports = { runPublish };
