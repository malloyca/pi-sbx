# pi-sbx fork — maintenance

Personal, Git-installed fork of [`ChristianMoesl/pi-sbx`](https://github.com/ChristianMoesl/pi-sbx).
The `upstream` remote is fetch-only (push-disabled). Do not push to upstream or
open pull requests for this personal fork.

## Upstream baseline

Synced through upstream `4ac520f` (v0.7.2 plus three commits). Use merges, not
rebases, to preserve the fork's published history and existing install tags.

## Intentional fork differences

- **Recursion guard:** `subagent` is blocked in child sessions, detected by
  `--no-session` or `--mode json` in argv. The extensible
  `CHILD_SESSION_BLOCKED_TOOLS` check runs before routing/host-mode early returns,
  so explicit host mode cannot bypass it. Top-level dispatch remains allowed.
- **Discovery compatibility:** accept both a top-level sandbox array and an
  object containing a `sandboxes` array. Retain the fork's handling of malformed
  entries (ignore them) and mixed workspace arrays (keep only strings). Workspace
  matching, read-only suffixes, running-first ordering, and upstream's WSL path
  translation apply to both formats. Stable **SBX >=0.48.0** is still required;
  accepting a legacy response shape does not imply support for older executables.
- **Git-only distribution:** `package.json` is private; `release` and
  `publish:npm` package scripts are not exposed. Every job in the retained
  upstream release/publication workflows is guarded to run only in
  `ChristianMoesl/pi-sbx`, never `malloyca/pi-sbx`. Ordinary validation CI remains
  enabled. Do not run the upstream release/publishing helpers in this fork.

Everything else follows upstream, including fail-closed sandbox readiness and
approval-gated host execution. Trusted extension tools still run on the host by
default; the recursion guard is the additional restriction.

## Version and tag convention

For new releases use `v<upstream-version>-malloy.<revision>`, for example
`v0.7.2-malloy.1`; keep `package.json`'s version identical without the leading `v`.
Increment the fork revision for additional fork releases on that upstream base;
reset it to 1 when adopting a new upstream release. Record any post-release
upstream baseline commit above as well.

This is valid semantic versioning, unlike a four-component `0.7.2.1` version.
The suffix technically denotes a prerelease and sorts below upstream's stable
version, which is fine because this fork is installed by its exact Git tag.
Do not use `+metadata` to distinguish releases: semver ignores it for precedence.
Historical tags (including `v0.4.5`) remain unchanged; never move published tags.

## Update recipe

1. Start with a clean `main` checkout and run `git fetch upstream`.
2. Inspect `git log --oneline main..upstream/main` and the runtime, policy,
   dependency, test, and CI changes before merging.
3. `git merge --no-commit --no-ff upstream/main`; resolve conflicts while retaining
   the intentional differences above. Check guards on **every** release job,
   including new jobs/workflows, before any push.
4. Update this baseline and, when preparing a release, `package.json` to the
   intended fork version. Keep `pnpm-lock.yaml`; do not generate an npm lockfile.
5. Use the pnpm version pinned in `package.json`:
   `pnpm install --frozen-lockfile && pnpm run check && pnpm pack --dry-run`.
6. Review `git diff upstream/main`, `git diff --check`, and all conflict
   resolutions, then commit the validated merge on `main`.
7. Only with explicit release/tag approval, create a new annotated install tag:
   `git tag -a v<fork-version> -m 'v<fork-version>'`.
8. Only with approval, push `main` and that exact new tag to `origin`. Never
   force-push history or tags. No npm staging or publication is involved.
9. Only with approval, install with
   `pi install git:github.com/malloyca/pi-sbx@v<fork-version>` and verify `pi list`.
   Restart Pi to replace the extension loaded in memory.
10. Smoke-test sandboxed tool routing and a top-level subagent dispatch: the
    child must route into the sandbox and its own `subagent` call must be blocked.
    Verify explicit host mode does not bypass that guard. Unit fixtures do not
    substitute for this live dispatch check.

## Local copies and sandbox mounts

| Copy | Path | Role |
|------|------|------|
| Working clone | `~/Development/pi-dev/pi-sbx` | Development only; not loaded by Pi at runtime. |
| Installed copy | `~/.pi/agent/git/github.com/malloyca/pi-sbx` | Pi's user-level install; update with `pi install`, never hand-edit. |

The development sandbox mounts `~/Development/pi-dev` read/write and these
host directories read-only:

- `~/.pi/agent/install` — managed Pi releases, docs, examples, and dependencies;
  mounting this stable parent avoids stale mounts after a managed Pi update.
- `~/.pi/agent/extensions` — personal extensions.
- `~/.pi/agent/git` — Git-installed packages.
- `~/.pi/agent/npm` — npm-installed packages.

Do not restore the obsolete Homebrew Pi mount or mount the entire Pi agent
configuration directory, credentials, or sessions.
