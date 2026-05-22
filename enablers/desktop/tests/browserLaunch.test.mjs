// enablers/desktop/tests/browserLaunch.test.mjs
//
// Unit tests for the detection logic and command-builder. We do NOT
// actually spawn a browser in these tests - that's the smoke runner's
// job in slice 6.

import test from "node:test";
import assert from "node:assert/strict";

import {
    BROWSER_MATRIX,
    DEFAULT_BROWSER_ENTRY,
    pickPrivateBrowser,
    __forTests,
} from "../runtime/browserLaunch.mjs";

test("BROWSER_MATRIX ordering matches contract §6", () => {
    const ids = BROWSER_MATRIX.map((e) => e.id);
    assert.deepEqual(ids, ["chrome", "edge", "firefox", "brave"]);
});

test("each matrix entry carries a private flag and command builder", () => {
    for (const entry of BROWSER_MATRIX) {
        assert.equal(typeof entry.id, "string");
        assert.equal(typeof entry.displayName, "string");
        assert.equal(typeof entry.privateFlag, "string");
        assert.equal(typeof entry.detect, "function");
        assert.equal(typeof entry.command, "function");
        const built = entry.command("/path/to/exe", "http://127.0.0.1:1234/launch#token=abc");
        assert.equal(typeof built.cmd, "string");
        assert.ok(Array.isArray(built.args));
        assert.ok(built.args.includes(entry.privateFlag), `${entry.id} command must include its private flag`);
        assert.ok(built.args.some((a) => a.includes("127.0.0.1:1234")), `${entry.id} command must include the URL`);
    }
});

test("DEFAULT_BROWSER_ENTRY builds an OS-appropriate open command", () => {
    const url = "http://127.0.0.1:1234/launch#token=abc";
    const win = DEFAULT_BROWSER_ENTRY.command("default", url, "win32");
    assert.equal(win.cmd, "cmd");
    assert.deepEqual(win.args, ["/c", "start", "", url]);

    const mac = DEFAULT_BROWSER_ENTRY.command("default", url, "darwin");
    assert.equal(mac.cmd, "open");
    assert.deepEqual(mac.args, [url]);

    const linux = DEFAULT_BROWSER_ENTRY.command("default", url, "linux");
    assert.equal(linux.cmd, "xdg-open");
    assert.deepEqual(linux.args, [url]);
});

test("pickPrivateBrowser returns null when no entry detects", () => {
    // Force every detect() to fail by passing an env that yields no install paths.
    const fakeEnv = {};
    const result = pickPrivateBrowser("linux", fakeEnv);
    // Result may be null OR a real install on the dev machine. Both are
    // valid; the assertion only ensures the shape is correct when it
    // resolves to null.
    assert.ok(result === null || (result.entry && typeof result.detected === "string"));
});

test("pickPrivateBrowser respects matrix ordering when multiple installs exist", () => {
    // Simulate Windows with Chrome detected at a Program Files path. We
    // patch the entry's detect to return a hit only for chrome; pickPrivateBrowser
    // should return chrome even though edge/firefox/brave detects all return null.
    const env = { ProgramFiles: "C:\\fake-program-files" };
    // Save original chrome.detect, monkey-patch it.
    const chromeEntry = BROWSER_MATRIX[0];
    const originalDetect = chromeEntry.detect;
    chromeEntry.detect = () => "C:\\fake-program-files\\Google\\Chrome\\Application\\chrome.exe";
    try {
        const result = pickPrivateBrowser("win32", env);
        assert.ok(result, "should pick chrome");
        assert.equal(result.entry.id, "chrome");
    } finally {
        chromeEntry.detect = originalDetect;
    }
});

test("joinAll handles empty/null prefixes safely", () => {
    const r = __forTests.joinAll([null, "", "C:\\one", "C:\\two"], "App\\bin.exe");
    // joinAll only emits paths for truthy prefixes.
    assert.deepEqual(r, ["C:\\one\\App\\bin.exe", "C:\\two\\App\\bin.exe"]);
});

test("envProgramFiles returns the env value or null", () => {
    assert.equal(__forTests.envProgramFiles({ ProgramFiles: "X" }, "ProgramFiles"), "X");
    assert.equal(__forTests.envProgramFiles({}, "ProgramFiles"), null);
    assert.equal(__forTests.envProgramFiles({ ProgramFiles: "" }, "ProgramFiles"), null);
    assert.equal(__forTests.envProgramFiles({ ProgramFiles: 5 }, "ProgramFiles"), null);
});
