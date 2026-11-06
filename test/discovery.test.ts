import assert from "node:assert/strict";
import test from "node:test";
import { discoverSandboxes, parseMatchingSandboxes, validateSbxVersion } from "../extensions/pi-sbx/discovery.ts";

const cwd = "/Users/example/work/repo/feature";

const formats = [
	{ name: "top-level array", wrap: (sandboxes: unknown[]) => sandboxes },
	{ name: "legacy object", wrap: (sandboxes: unknown[]) => ({ sandboxes }) },
];

for (const { name, wrap } of formats) {
	test(`${name}: discovers a sandbox by workspace, not name`, () => {
		const sandbox = { name: "example", id: "example-id", agent: "shell", status: "running", workspaces: [cwd] };
		assert.deepEqual(parseMatchingSandboxes(JSON.stringify(wrap([sandbox])), cwd), [{ ...sandbox, mounts: [{ hostPath: cwd, sandboxPath: cwd }] }]);
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
			mounts: [{ hostPath: cwd, sandboxPath: cwd }, { hostPath: cwd, sandboxPath: cwd }],
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

test("does not interpret relative mounts or Windows paths as local POSIX paths", () => {
	const output = JSON.stringify([
		{ name: "relative", workspaces: ["."] },
		{ name: "windows", workspaces: ["C:\\work\\repo"] },
	]);
	assert.deepEqual(parseMatchingSandboxes(output, process.cwd()), []);
	assert.throws(() => parseMatchingSandboxes("null", cwd), /expected an array or an object containing a sandboxes array/);
});

test("accepts directories starting with two dots inside a workspace", () => {
	const result = parseMatchingSandboxes(
		JSON.stringify([{ name: "valid", workspaces: ["/work"] }]),
		"/work/..hidden",
	);
	assert.equal(result[0]?.name, "valid");
});

for (const { name, wrap } of formats) {
	test(`${name}: WSL discovery translates Windows workspaces using wslpath, including custom automount roots`, async () => {
		const unc = "\\\\wsl.localhost\\Ubuntu\\home\\user\\repo";
		const drive = "C:\\work\\shared docs";
		const other = "\\\\wsl.localhost\\OtherDistro\\home\\user\\repo";
		const calls: Array<[string, string[]]> = [];
		const exec: Parameters<typeof discoverSandboxes>[0] = async (command, args) => {
			calls.push([command, args]);
			if (args[0] === "version") return { code: 0, stderr: "", killed: false, stdout: '{"client":{"version":"v0.48.0"}}' };
			if (command === "/windows bin/sbx.exe") {
				assert.deepEqual(args, ["ls", "--json"]);
				return { code: 0, stderr: "", killed: false, stdout: JSON.stringify(wrap([
					{ name: "test", workspaces: [unc, `${drive}:ro`] },
					{ name: "duplicate", workspaces: [unc] },
					{ name: "other-distro", workspaces: [other] },
				])) };
			}
			assert.equal(command, "wslpath");
			assert.equal(args[0], "-u");
			const converted = args[1] === unc ? "/home/user/repo" : args[1] === drive ? "/custom/c/work/shared docs" : undefined;
			return { code: converted ? 0 : 1, stdout: converted ? `${converted}\r\n` : "", stderr: "", killed: false };
		};
		const result = await discoverSandboxes(exec, "/windows bin/sbx.exe", "/home/user/repo/subdir", true);
		assert.deepEqual(result.map((sandbox) => sandbox.name), ["duplicate", "test"]);
		assert.deepEqual(result.find((sandbox) => sandbox.name === "test")?.mounts, [
			{ hostPath: "/home/user/repo", sandboxPath: "/wsl.localhost/Ubuntu/home/user/repo" },
			{ hostPath: "/custom/c/work/shared docs", sandboxPath: "/c/work/shared docs" },
		]);
		assert.equal(calls.filter(([command]) => command === "wslpath").length, 3);
	});
}

test("POSIX discovery does not invoke wslpath", async () => {
	const exec: Parameters<typeof discoverSandboxes>[0] = async (command, args) => {
		if (args.includes("version")) return { code: 0, stderr: "", killed: false, stdout: '{"client":{"version":"v0.48.0"}}' };
		assert.ok(command === "sbx" || command === "env");
		return { code: 0, stderr: "", killed: false, stdout: JSON.stringify([{ name: "native", workspaces: [cwd] }]) };
	};
	assert.equal((await discoverSandboxes(exec, "sbx", cwd, false))[0]?.name, "native");
	assert.equal((await discoverSandboxes(exec, "sbx", cwd, true))[0]?.name, "native");
});

test("discovery reports CLI failures and timeouts rather than trying another installation", async () => {
	await assert.rejects(discoverSandboxes(async () => ({
		code: 1, killed: false, stdout: "", stderr: "daemon unavailable",
	}), "sbx.exe", cwd), /daemon unavailable/);
	await assert.rejects(discoverSandboxes(async () => ({
		code: 0, killed: true, stdout: "", stderr: "",
	}), "sbx.exe", cwd), /sbx\.exe version --json timed out/);
});

test("discovery forwards cancellation and does not accept results after cancellation", async () => {
	const controller = new AbortController();
	let calls = 0;
	await assert.rejects(discoverSandboxes(async (_command, _args, options) => {
		calls++;
		assert.equal(options?.signal, controller.signal);
		assert.ok(options!.timeout! > 0 && options!.timeout! <= 1_000);
		controller.abort();
		return { code: 0, killed: false, stderr: "", stdout: JSON.stringify([]) };
	}, "sbx", cwd, false, { signal: controller.signal, timeoutMs: 1_000 }), /aborted/);
	assert.equal(calls, 1);
});

test("already cancelled discovery never spawns a command", async () => {
	const controller = new AbortController();
	controller.abort();
	await assert.rejects(discoverSandboxes(async () => {
		assert.fail("must not execute after cancellation");
	}, "sbx", cwd, false, { signal: controller.signal }), /aborted/);
});

test("accepts stable SBX versions from 0.48.0 without an upper bound", () => {
	for (const version of ["v0.48.0", "0.48.9", "v0.49.0", "v0.50.0", "v1.0.0", "v2.0.0"]) {
		assert.doesNotThrow(() => validateSbxVersion(JSON.stringify({ client: { version } })));
	}
	for (const output of ["bad", "null", "{}", ...["v0.45.1", "v0.46.0", "v0.47.99", "v0.48.0-rc.3", "v1.0.-1", "v-1.50.0"].map(version => JSON.stringify({ client: { version } }))]) {
		assert.throws(() => validateSbxVersion(output), /SBX 0\.48\.0 or newer required/);
	}
});

test("unsupported versions fail before discovery or fallback", async () => {
	let calls = 0;
	await assert.rejects(discoverSandboxes(async () => {
		calls++;
		return { code: 0, stderr: "", killed: false, stdout: '{"client":{"version":"v0.47.9"}}' };
	}, "sbx", cwd, false), /SBX 0\.48\.0 or newer required/);
	assert.equal(calls, 1, "version failures must not proceed to discovery or another executable");
});

for (const { name, wrap } of formats) {
	test(`${name}: newer SBX versions reach discovery with either list format`, async () => {
		for (const version of ["v0.48.0", "v0.50.1", "v0.51.0", "v1.0.0"]) {
			const calls: string[][] = [];
			const exec: Parameters<typeof discoverSandboxes>[0] = async (_command, args) => {
				calls.push(args);
				return {
					code: 0, stderr: "", killed: false,
					stdout: args[0] === "version"
						? JSON.stringify({ client: { version } })
						: JSON.stringify(wrap([{ name: "native", workspaces: [cwd] }])),
				};
			};
			assert.equal((await discoverSandboxes(exec, "sbx", cwd, false))[0]?.name, "native");
			assert.deepEqual(calls, [["version", "--json"], ["ls", "--json"]]);
		}
	});
}
