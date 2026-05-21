// enablers/desktop/tests/lockFile.test.mjs

import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";

import {
    isPidAlive,
    readLock,
    writeLock,
    releaseLock,
    inspectLock,
    writeLastError,
} from "../runtime/lockFile.mjs";

async function makeTempBase() {
    return fs.mkdtemp(path.join(os.tmpdir(), "pulseplay-dx1b-lock-"));
}
async function cleanup(dir) {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
}

test("isPidAlive returns true for our own pid, false for a wildly-bogus one", () => {
    assert.equal(isPidAlive(process.pid), true);
    // A pid above 2^22 is virtually guaranteed to not exist on any
    // mainstream OS in 2026; if a CI box ever assigns one we'll know.
    assert.equal(isPidAlive(9_999_999), false);
    assert.equal(isPidAlive(0), false);
    assert.equal(isPidAlive(-1), false);
    assert.equal(isPidAlive("not-a-number"), false);
});

test("write -> read -> inspect (live) -> release", async (t) => {
    const base = await makeTempBase();
    t.after(() => cleanup(base));

    assert.equal(await readLock(base), null);

    const lock = await writeLock(base, { pid: process.pid, appPort: 5173, proxyPort: 8787 });
    assert.equal(lock.pid, process.pid);
    assert.equal(lock.appPort, 5173);
    assert.equal(lock.proxyPort, 8787);
    assert.match(lock.startedAt, /^\d{4}-\d{2}-\d{2}T/);

    const round = await readLock(base);
    assert.deepEqual(round, lock);

    const inspected = await inspectLock(base);
    assert.equal(inspected.state, "live");
    assert.equal(inspected.lock.pid, process.pid);

    await releaseLock(base);
    assert.equal(await readLock(base), null);
    assert.equal((await inspectLock(base)).state, "absent");
});

test("inspectLock returns 'stale' when the recorded pid is dead", async (t) => {
    const base = await makeTempBase();
    t.after(() => cleanup(base));
    await writeLock(base, { pid: 9_999_999, appPort: 1234, proxyPort: 1235 });
    const inspected = await inspectLock(base);
    assert.equal(inspected.state, "stale");
});

test("writeLock validates payload", async (t) => {
    const base = await makeTempBase();
    t.after(() => cleanup(base));
    await assert.rejects(() => writeLock(base, {}), /pid required/);
    await assert.rejects(() => writeLock(base, { pid: 1 }), /appPort required/);
    await assert.rejects(() => writeLock(base, { pid: 1, appPort: 1 }), /proxyPort required/);
});

test("releaseLock is a no-op when absent", async (t) => {
    const base = await makeTempBase();
    t.after(() => cleanup(base));
    await assert.doesNotReject(() => releaseLock(base));
});

test("writeLastError persists a timestamped line", async (t) => {
    const base = await makeTempBase();
    t.after(() => cleanup(base));
    await writeLastError(base, "boom from test");
    const target = path.join(base, "PulsePlayData", "runtime", "last-error.txt");
    const body = await fs.readFile(target, { encoding: "utf8" });
    assert.match(body, /boom from test/);
    assert.match(body, /^\[\d{4}-\d{2}-\d{2}T.+\]/);
});
