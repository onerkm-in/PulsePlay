// enablers/desktop/tests/portDiscovery.test.mjs

import test from "node:test";
import assert from "node:assert/strict";
import net from "node:net";

import { findFreePort, findFreePorts } from "../runtime/portDiscovery.mjs";

test("findFreePort returns a usable 127.0.0.1 port", async () => {
    const port = await findFreePort();
    assert.ok(Number.isInteger(port) && port > 0 && port < 65536, `expected a TCP port, got ${port}`);

    // Confirm we can actually bind it (no other process snatched it
    // between probe + check on a single-user dev box).
    const srv = net.createServer();
    await new Promise((resolve, reject) => {
        srv.once("error", reject);
        srv.listen(port, "127.0.0.1", resolve);
    });
    await new Promise((r) => srv.close(r));
});

test("findFreePorts returns N distinct ports", async () => {
    const ports = await findFreePorts(3);
    assert.equal(ports.length, 3);
    const unique = new Set(ports);
    assert.equal(unique.size, 3, "all returned ports must be distinct");
    for (const p of ports) {
        assert.ok(Number.isInteger(p) && p > 0 && p < 65536, `bad port ${p}`);
    }
});

test("findFreePorts rejects count <= 0", async () => {
    await assert.rejects(() => findFreePorts(0), /positive integer/);
    await assert.rejects(() => findFreePorts(-1), /positive integer/);
    await assert.rejects(() => findFreePorts(1.5), /positive integer/);
});
