# Cub CLI reference

Global flags: `--help, -h` (help), `--version, -V` (version).

## cub install

Install all dependencies from `package.json` into `node_modules`.

```sh
cub install [pkg...]
```

- With no args: resolves and installs the full tree, then writes the lockfile.
- With args: installs the named specs too (e.g. `cub install lodash@^4`).
- Aliases: `cub i`, `cub add` (when adding — see below).

## cub add <pkg...>

Add packages and record them in `package.json`.

```sh
cub add react@^18 chalk@5
```

Writes to `dependencies` by default; `cub add -D <pkg>` records under
`devDependencies`.

## cub remove <pkg...>

```sh
cub remove chalk
```

Removes the packages from `package.json` and prunes them from `node_modules`.

## cub run <script> [-- args...]

Run a script from `package.json`'s `scripts` map with `node_modules/.bin` on `PATH`.

```sh
cub run build
cub run test -- --watch
```

## cub init [dir] [--yes]

Scaffold a publishable package: writes `package.json`, `README.md`, `.gitignore`,
and a license file.

```sh
cub init my-pkg --yes
```

Omit `--yes` for interactive prompts.

## cub audit

Scan every package pinned in `cub-lock.json` against the OSV vulnerability
database. Threat data is fetched live — nothing to update locally.

```sh
cub audit
```

Exit code is `1` when vulnerabilities are found, `0` when clean. CI-safe:
`cub install && cub audit`.

## cub login

Registry login; stores the token in `~/.npmrc`.

```sh
cub login
cub login --registry=https://registry.npmjs.org/
```

## cub publish

Pack and publish to the package registry. See [PUBLISH.md](PUBLISH.md).

```sh
cub publish --dry-run
cub publish --tag next --access public
cub publish --bump patch
```

## cub whoami

Print the authenticated registry username.

```sh
cub whoami
```
