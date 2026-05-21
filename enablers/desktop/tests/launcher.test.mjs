// enablers/desktop/tests/launcher.test.mjs

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { __forTests } from "../runtime/launcher.mjs";

test("resolvePaths uses source tree in dev mode", async () => {
    const paths = await __forTests.resolvePaths(
        { dev: true },
        { isPackaged: false, execPath: process.execPath, argv0: process.argv0 },
    );

    assert.equal(paths.isPackaged, false);
    assert.match(paths.proxyEntry, /proxy[\\/]server\.js$/);
    assert.match(paths.staticDir, /playground[\\/]dist$/);
    assert.match(paths.baseDir, /enablers[\\/]desktop$/);
});

test("resolvePaths uses sidecars beside packaged executable", async () => {
    const exePath = path.join("C:\\PulsePlayRecon", "PulsePlay.exe");
    const paths = await __forTests.resolvePaths(
        { dev: false },
        { isPackaged: true, execPath: exePath, argv0: exePath },
    );

    assert.equal(paths.isPackaged, true);
    assert.equal(paths.baseDir, path.dirname(exePath));
    assert.equal(paths.proxyEntry, path.join(path.dirname(exePath), "proxy", "server.js"));
    assert.equal(paths.staticDir, path.join(path.dirname(exePath), "playground", "dist"));
});

test("proxy child spawn plan uses multicall executable in packaged mode", () => {
    const proxyEntry = path.join("C:\\PulsePlayRecon", "proxy", "server.js");
    const plan = __forTests.buildProxyChildSpawnPlan(proxyEntry, true);

    assert.equal(plan.command, process.execPath);
    assert.deepEqual(plan.args, ["--desktop-proxy-child"]);
    assert.equal(plan.cwd, path.dirname(proxyEntry));
});

test("proxy child spawn plan uses wrapper script in source mode", () => {
    const proxyEntry = path.join("C:\\repo", "proxy", "server.js");
    const plan = __forTests.buildProxyChildSpawnPlan(proxyEntry, false);

    assert.equal(plan.command, process.execPath);
    assert.match(plan.args[0], /proxyEntry\.cjs$/);
    assert.equal(plan.cwd, path.dirname(proxyEntry));
});
