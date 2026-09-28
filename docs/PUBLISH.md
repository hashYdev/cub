# Publishing with Cub

Cub publishing is npm-compatible: same registry, same auth, same tarball format.
Anything published with `cub publish` installs fine with npm, Bun, or Cub.

## Auth

Cub reads auth from `~/.npmrc`, exactly like npm. Log in once:

```sh
cub login
# or: npm login
```

Verify:

```sh
cub whoami
```

For CI, set the token directly in `~/.npmrc`:

```
//registry.npmjs.org/:_authToken=${NPM_TOKEN}
```

and pass `--access public` for scoped packages on first publish.

## Versioning

Bump before publishing, or let `cub publish` do it:

```sh
cub publish --bump patch   # 1.2.3 -> 1.2.4
cub publish --bump minor   # 1.2.3 -> 1.3.0
cub publish --bump major   # 1.2.3 -> 2.0.0
cub publish --bump 1.2.3   # explicit version
```

Without `--bump`, the version in `package.json` is published as-is.

## Dry-run first

Always rehearse before the real publish — it packs the tarball, lists the files
that would go up, and runs prepublish checks without touching the registry:

```sh
cub publish --dry-run
```

Check the file list carefully: `files` in `package.json` controls inclusion;
a stray `.npmignore` can silently exclude (or include) more than you expect.

## Publish

```sh
cub publish                  # tag `latest`, public unscoped / per package.json
cub publish --tag next       # prerelease tag; users opt in with pkg@next
cub publish --access public  # required first time for scoped packages
cub publish --access restricted  # scoped, private
```

Tags: `--tag <tag>` sets the dist-tag (default `latest`).
`--dry-run` never contacts the registry's publish endpoint.

## Checklist

1. `cub publish --dry-run` — file list looks right.
2. Version bumped (or `--bump` passed).
3. `cub whoami` succeeds (auth works).
4. Publish; verify with `npm view <pkg> version` / `npm view <pkg> dist-tags`.
