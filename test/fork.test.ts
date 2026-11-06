import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const manifest = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const upstreamOnly = "if: github.repository == 'ChristianMoesl/pi-sbx'";

test("the Git-installed fork is private and exposes no automated release or publication command", () => {
	assert.equal(manifest.private, true);
	assert.equal(manifest.scripts.release, undefined);
	assert.equal(manifest.scripts["publish:npm"], undefined);
});

test("every staging and release workflow job is disabled in this fork", async () => {
	const workflow = await readFile(new URL("../.github/workflows/release.yml", import.meta.url), "utf8");
	const jobs = [...workflow.matchAll(/^  ([a-z][a-z0-9_-]*):\n(.*)/gm)]
		.filter(([, name]) => ["validate", "stage", "release"].includes(name));
	assert.deepEqual(jobs.map(([, name]) => name), ["validate", "stage", "release"]);
	for (const [, name, firstLine] of jobs) {
		assert.equal(firstLine.trim(), upstreamOnly, `${name} must never run in the fork`);
	}
	const jobSection = workflow.split("\njobs:\n")[1];
	assert.equal([...jobSection.matchAll(/^  [a-z][a-z0-9_-]*:\n/gm)].length, jobs.length, "new release jobs need an explicit fork-policy review");
});

test("scheduled and manual GitHub publication is disabled in this fork", async () => {
	const workflow = await readFile(new URL("../.github/workflows/publish-approved-releases.yml", import.meta.url), "utf8");
	assert.match(workflow, /if: github\.ref == 'refs\/heads\/main' && github\.repository == 'ChristianMoesl\/pi-sbx'/);
	const jobs = [...workflow.split("\njobs:\n")[1].matchAll(/^  ([a-z][a-z0-9_-]*):\n/gm)];
	assert.deepEqual(jobs.map(([, name]) => name), ["publish"], "new publication jobs need an explicit fork-policy review");
});

test("ordinary validation CI remains enabled for the fork", async () => {
	const workflow = await readFile(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");
	assert.doesNotMatch(workflow, /github\.repository/);
	assert.match(workflow, /pnpm run check/);
});
