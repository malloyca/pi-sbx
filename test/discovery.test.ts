import assert from "node:assert/strict";
import test from "node:test";
import { parseMatchingSandboxes } from "../extensions/pi-sbx/discovery.ts";

const cwd = "/Users/example/work/repo/feature";

const formats = [
	{ name: "top-level array", wrap: (sandboxes: unknown[]) => sandboxes },
	{ name: "legacy object", wrap: (sandboxes: unknown[]) => ({ sandboxes }) },
];

for (const { name, wrap } of formats) {
	test(`${name}: discovers a sandbox by workspace, not name`, () => {
		const sandbox = { name: "example", id: "example-id", agent: "shell", status: "running", workspaces: [cwd] };
		assert.deepEqual(parseMatchingSandboxes(JSON.stringify(wrap([sandbox])), cwd), [sandbox]);
	});

	test(`${name}: accepts an empty sandbox list`, () => {
		assert.deepEqual(parseMatchingSandboxes(JSON.stringify(wrap([])), cwd), []);
	});

	test(`${name}: finds exact and read-only parent mounts and sorts running first, then alphabetically`, () => {
		const result = parseMatchingSandboxes(
			JSON.stringify(wrap([
				{ name: "stopped-z", status: "stopped", workspaces: [cwd] },
				{ name: "running-z", status: "running", workspaces: ["/Users/example/work/repo"] },
				{ name: "running-a", status: "running", workspaces: [`${cwd}:ro`] },
				{ name: "stopped-a", status: "stopped", workspaces: ["/Users/example/work/repo:ro"] },
				{ name: "other", status: "running", workspaces: ["/Users/example/work/another"] },
			])),
			cwd,
		);

		assert.deepEqual(result.map((sandbox) => sandbox.name), ["running-a", "running-z", "stopped-a", "stopped-z"]);
	});

	test(`${name}: excludes unrelated and sibling paths even when the sandbox name matches cwd`, () => {
		const result = parseMatchingSandboxes(
			JSON.stringify(wrap([
				{ name: cwd, workspaces: ["/Users/example/work/another"] },
				{ name: "wrong", workspaces: ["/Users/example/work/repo/feat"] },
			])),
			cwd,
		);

		assert.deepEqual(result, []);
	});

	test(`${name}: ignores malformed entries and workspaces and drops invalid optional fields`, () => {
		const result = parseMatchingSandboxes(
			JSON.stringify(wrap([
				null, false, 42, "sandbox", [], {},
				{ name: 42, workspaces: [cwd] },
				{ name: "missing-workspaces" },
				{ name: "invalid-workspaces", workspaces: cwd },
				{ name: "no-valid-workspaces", workspaces: [null, 42, {}] },
				{ name: "valid", id: 42, agent: false, status: {}, workspaces: [null, cwd, 42, `${cwd}:ro`] },
			])),
			cwd,
		);

		assert.deepEqual(result, [{
			name: "valid",
			id: undefined,
			agent: undefined,
			status: undefined,
			workspaces: [cwd, `${cwd}:ro`],
		}]);
	});
}

test("rejects invalid JSON with a parse error", () => {
	assert.throws(() => parseMatchingSandboxes("not json", cwd), /Could not parse sbx ls --json output: .+/);
});

for (const value of [null, true, false, 42, "sandboxes", {}, { sandboxes: null }, { sandboxes: {} }, { sandboxes: "invalid" }, { sandboxes: 42 }]) {
	test(`rejects unsupported response shape: ${JSON.stringify(value)}`, () => {
		assert.throws(
			() => parseMatchingSandboxes(JSON.stringify(value), cwd),
			/Could not parse sbx ls --json output: expected an array or an object containing a sandboxes array/,
		);
	});
}
