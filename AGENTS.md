# Repository Guidelines

## Git workflow

- Work directly on `main`; do not create feature branches or pull requests.
- This is the personal `malloyca/pi-sbx` fork, not the upstream repository.
- Read `MAINTENANCE.md` before syncing upstream. Merge rather than rebase so
  published history and install tags are preserved.
- Preserve the child-session recursion guard, dual-format discovery parser,
  stable SBX >=0.48.0 requirement, and fork release safeguards.
- Validate changes before committing them on `main`.

## Validation

- Use the pnpm version pinned in `package.json`.
- Run `pnpm install --frozen-lockfile`, `pnpm run check`, and
  `pnpm pack --dry-run`. Do not generate `package-lock.json`.
- Check the recursion-guard and fork-release-policy regressions explicitly.

## Fork releases

- This fork is installed by exact Git tag and is not published to npm.
- Use `v<upstream-version>-malloy.<revision>` with a matching package version.
- Never run retained upstream release or publishing helpers. Their workflows
  must remain guarded to run only in the upstream repository, not this fork.
- Tagging, pushing, publishing, and changing the installed extension each
  require explicit user approval. Never force-push or move published tags.
- No npm login, npm stage approval, or GitHub release automation is involved.
- Report local changes, commits, tags, pushes, and installation state accurately.
