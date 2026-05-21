// enablers/desktop/tests/watchdog.test.mjs

import test from "node:test";
import assert from "node:assert/strict";

import { createWatchdog } from "../runtime/watchdog.mjs";

function deferred() {
    let resolve;
    const promise = new Promise((r) => { resolve = r; });
    return { promise, resolve };
}

test("fires onTimeout after timeoutMs with no kick", async () => {
    const fired = deferred();
    const wd = createWatchdog({ timeoutMs: 50, onTimeout: () => fired.resolve("fired") });
    const result = await Promise.race([
        fired.promise,
        new Promise((r) => setTimeout(() => r("not-fired"), 200)),
    ]);
    wd.stop();
    assert.equal(result, "fired");
});

test("kick() resets the deadline so timeout never fires while alive", async () => {
    let fires = 0;
    const wd = createWatchdog({ timeoutMs: 60, onTimeout: () => { fires += 1; } });
    // Kick every 20ms for 200ms - we should never reach a 60ms window.
    const start = Date.now();
    while (Date.now() - start < 200) {
        wd.kick();
        await new Promise((r) => setTimeout(r, 20));
    }
    wd.stop();
    assert.equal(fires, 0);
});

test("stop() prevents firing even after deadline passes", async () => {
    let fires = 0;
    const wd = createWatchdog({ timeoutMs: 40, onTimeout: () => { fires += 1; } });
    wd.stop();
    await new Promise((r) => setTimeout(r, 120));
    assert.equal(fires, 0);
    assert.equal(wd.isStopped(), true);
});

test("kick() after stop is a no-op", async () => {
    let fires = 0;
    const wd = createWatchdog({ timeoutMs: 40, onTimeout: () => { fires += 1; } });
    wd.stop();
    wd.kick();
    await new Promise((r) => setTimeout(r, 80));
    assert.equal(fires, 0);
});

test("rejects missing onTimeout", () => {
    assert.throws(() => createWatchdog({}), /onTimeout function required/);
    assert.throws(() => createWatchdog({ onTimeout: 42 }), /onTimeout function required/);
});

test("lastKickAt reflects the most recent kick", async () => {
    const wd = createWatchdog({ timeoutMs: 1000, onTimeout: () => {} });
    const before = wd.lastKickAt();
    await new Promise((r) => setTimeout(r, 5));
    wd.kick();
    const after = wd.lastKickAt();
    wd.stop();
    assert.ok(after >= before);
});
