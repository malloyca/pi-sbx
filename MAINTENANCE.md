# pi-sbx fork — maintenance

Personal fork of [`ChristianMoesl/pi-sbx`](https://github.com/ChristianMoesl/pi-sbx).
Deliberately **not upstreamed** — a small, personal mod. The `upstream` remote is
fetch-only (push-disabled), for tracking upstream's development; we do not send
changes back.

## What we changed (and why)

One commit on top of the upstream base: the **recursion guard** — the
`subagent` tool is blocked in child sessions (detected by `--no-session` /
`--mode json` in the spawn argv), behind an extensible blocklist
(`CHILD_SESSION_BLOCKED_TOOLS`). Purpose: no agent can spawn agents — this
closes the recursion path and the prompt-injection path (untrusted text →
"dispatch a write-privileged agent with fabricated data"). Everything else is
upstream's, including the default-allow for extension tools (option B).

## Tag convention

Fork tags continue the upstream series: rebase onto upstream `vX.Y` →
tag `vX.Y.1`. **The tag is the install pin** (`pi install
git:github.com/malloyca/pi-sbx@<tag>`); the `package.json` version field is
kept in sync with it.

## Update recipe (run when upstream moves)

In this clone (host-side; `sbx`/pi do not need to be running):

1. `git fetch upstream`
2. `git log --oneline v<current>..upstream/main` — **empty ⇒ nothing to do.**
3. Read upstream's new commits first; then
   `git rebase upstream/main v<current>` (replays the guard commit — it's one
   commit, ~70 lines; a conflict means upstream restructured the router).
4. Bump `package.json` `"version"` to match the new tag.
5. `npm ci && npm test` — all tests, especially the 4 guard tests, must pass.
6. `git commit` any rebase fixes, then
   `git tag -f v<new-base>.1` (the tag moves to the tip — the force push in
   step 7 is intentional and confined to our own fork).
7. `git push origin main` and `git push --force origin v<new-base>.1`.
8. `pi install git:github.com/malloyca/pi-sbx@v<new-base>.1` && `pi list`
   — exactly one router, at the new tag.
9. **Smoke test (safety-critical):** one sandboxed subagent dispatch —
   child routes into the sandbox (`uname -s` → Linux), and the child's own
   `subagent` call is blocked with the guard's message.
10. A running pi session keeps the old router in memory until restart.

## The two local copies (do not confuse them)

| Copy | Path | Role |
|------|------|------|
| Working clone | `~/Development/pi-dev/pi-sbx` | dev tool: fetch/rebase/test/push. Nothing at runtime uses it. |
| Installed copy | `~/.pi/agent/git/github.com/malloyca/pi-sbx` | what pi actually loads — **user-level, every pi session on this machine**. Only `pi install …@<tag>` updates it. Never hand-edit. |
