# @<scope>/pi-snake

Snake extension package for [pi](https://github.com/badlogic/pi-mono).

## Install

```bash
pi install npm:@<scope>/pi-snake
```

Or project-local:

```bash
pi install -l npm:@<scope>/pi-snake
```

## Included resources

This package exposes extensions through the `pi` manifest in `package.json`:

```json
{
  "pi": {
    "extensions": ["./extensions"]
  }
}
```

Current extension entrypoint:

- `extensions/snake/index.ts`

## Development

```bash
npm install
npm run typecheck
```

## Release automation

This repo uses **Conventional Commits + commitlint + semantic-release**.

### Required secrets (GitHub Actions)

- `NPM_TOKEN`: npm automation token with publish access to the target scope/package.
- `GITHUB_TOKEN`: provided automatically by GitHub Actions.

### Trigger behavior

- `.github/workflows/commitlint.yml`
  - Runs on PRs and pushes (`main`, `develop`, `feature/**`).
  - Lints PR title and commit messages.
- `.github/workflows/release.yml`
  - Runs on pushes to `main` (and manual `workflow_dispatch`).
  - Executes typecheck, then `semantic-release`.
  - semantic-release will:
    - compute next version from commit history,
    - generate release notes,
    - update `CHANGELOG.md`,
    - publish to npm (`publishConfig.access=public`),
    - create GitHub release.

### Dry-run validation (before first live publish)

Run locally after setting `GITHUB_TOKEN` and `NPM_TOKEN`:

```bash
npm install
npm run typecheck
npx commitlint --from "$(git rev-list --max-parents=0 HEAD)" --to HEAD --verbose
npm run release:dry-run
```

Dry-run output checkpoints to verify:

1. **Next version computed**
   - Look for log line like: `The next release version is X.Y.Z`.
2. **Release notes generated**
   - Look for log line indicating notes generation from `@semantic-release/release-notes-generator`.
3. **Publish is skipped in dry-run**
   - Look for log lines indicating npm/GitHub publish steps are skipped due to `--dry-run`.

## Publish checklist

1. Replace `<scope>` in `package.json` and this README.
2. Ensure `NPM_TOKEN` is configured in repository secrets.
3. Merge Conventional-Commit PRs into `main`.
4. Let `release.yml` publish automatically.

## License

MIT
