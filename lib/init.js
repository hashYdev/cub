'use strict';

// cub init [dir] [--yes] [--name <n>] [--version <v>]
// Scaffolds a publishable package: package.json + README stub + .npmignore.

const fs = require('fs');
const path = require('path');
const readline = require('readline');

function parseArgs(argv) {
  const opts = { dir: null, yes: false, name: null, version: null, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--yes' || a === '-y') opts.yes = true;
    else if (a === '--help' || a === '-h') opts.help = true;
    else if (a === '--name' && argv[i + 1]) opts.name = argv[++i];
    else if (a.startsWith('--name=')) opts.name = a.slice(7);
    else if (a === '--version' && argv[i + 1]) opts.version = argv[++i];
    else if (a.startsWith('--version=')) opts.version = a.slice(10);
    else if (!a.startsWith('-') && !opts.dir) opts.dir = a;
  }
  return opts;
}

function ask(q, def) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(`${q} (${def}): `, (ans) => {
      rl.close();
      resolve(ans.trim() || def);
    });
  });
}

function npmignoreStub() {
  return `node_modules
.DS_Store
*.log
coverage
*.tgz
.git
.vscode
`;
}

function readmeStub(name) {
  return `# ${name}

\`\`\`sh
npm i ${name}
\`\`\`

## Usage

\`\`\`js
const x = require('${name}');
\`\`\`

## License

MIT
`;
}

async function runInit(argv) {
  const opts = parseArgs(argv);
  if (opts.help) {
    console.log('Usage: cub init [dir] [--yes] [--name <n>] [--version <v>]');
    return;
  }
  const target = path.resolve(process.cwd(), opts.dir || '.');
  fs.mkdirSync(target, { recursive: true });

  let name = opts.name || path.basename(target) || 'my-package';
  let version = opts.version || '0.1.0';
  let description = '';
  let license = 'MIT';

  if (!opts.yes && process.stdin.isTTY) {
    name = await ask('package name', name);
    version = await ask('version', version);
    description = await ask('description', description);
    license = await ask('license', license);
  }

  const pkgPath = path.join(target, 'package.json');
  if (fs.existsSync(pkgPath) && !opts.yes) {
    throw new Error(`${pkgPath} already exists (use --yes to skip prompts, edit manually instead)`);
  }

  const pkg = {
    name,
    version,
    description,
    license,
    main: 'index.js',
    files: ['lib/', 'bin/', 'README.md'],
    scripts: { test: 'node --test' },
  };
  if (!fs.existsSync(pkgPath)) {
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
    console.log(`created ${pkgPath}`);
  } else {
    console.log(`exists ${pkgPath} (left untouched)`);
  }

  const readmePath = path.join(target, 'README.md');
  if (!fs.existsSync(readmePath)) {
    fs.writeFileSync(readmePath, readmeStub(name));
    console.log(`created ${readmePath}`);
  } else {
    console.log(`exists ${readmePath} (left untouched)`);
  }

  const ignorePath = path.join(target, '.npmignore');
  if (!fs.existsSync(ignorePath)) {
    fs.writeFileSync(ignorePath, npmignoreStub());
    console.log(`created ${ignorePath}`);
  } else {
    console.log(`exists ${ignorePath} (left untouched)`);
  }

  const indexPath = path.join(target, 'index.js');
  if (!fs.existsSync(indexPath)) {
    fs.writeFileSync(indexPath, `'use strict';\n\nmodule.exports = {};\n`);
    console.log(`created ${indexPath}`);
  }

  console.log(`\nPublishable scaffold ready in ${target}`);
  console.log('Next: cub publish --dry-run');
}

module.exports = { runInit };
